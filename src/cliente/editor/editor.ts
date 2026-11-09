import { formatearDuracion } from '../../comun/formato';
import type { ResultadoAnalisis } from '../../nucleo/analizar';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { Equipo } from '../../nucleo/fragmentos';
import { textoEquipos, textoPartes, textoResumen, type Nombres } from '../analisis/resumen';
import { el } from '../dom';
import { accionDeTecla, esAccion, teclaAjena, type Accion } from './atajos';
import { Historial } from './historial';
import { aplicarPartes, moverBordeParte, type Borde } from './limitesPartes';
import { LineaTiempo } from './lineaTiempo';
import { ListaFragmentos } from './listaFragmentos';
import { fragmentoEn, moverFin, moverInicio, partir, ponerEquipo, quitar, unirConSiguiente, type EstadoEditor } from './operaciones';
import { PanelPartes } from './panelPartes';
import { Reproductor } from './reproductor';

/**
 * El editor de fragmentos: el video, la linea de tiempo, la lista y la barra
 * de acciones, con sus atajos. Guarda el estado en un historial para deshacer.
 *
 * Por ahora trabaja sobre el fichero local y en memoria; con la subida (1a)
 * el video vendra de R2 y las correcciones se guardaran en D1.
 */

export interface DatosEditor {
  fichero: File;
  resultado: ResultadoAnalisis;
  duracion: number;
}

export interface Editor {
  abrir: (d: DatosEditor) => void;
  cerrar: () => void;
  readonly estado: EstadoEditor | null;
}

type AccionEditor = Accion | 'verTodo';

const SALTO_SEG = 2;
const SALTO_FINO_SEG = 0.2;

export function crearEditor(nombres: () => Nombres): Editor {
  const contenedor = el<HTMLDivElement>('resultado-analisis');
  const resumen = el<HTMLParagraphElement>('resumen-analisis');
  const equipos = el<HTMLParagraphElement>('equipos-analisis');
  const partes = el<HTMLParagraphElement>('partes-analisis');
  const estadoTexto = el<HTMLParagraphElement>('estado-editor');
  const barra = el<HTMLDivElement>('barra-editor');
  const reproductor = new Reproductor(el<HTMLVideoElement>('video-editor'));

  let historial: Historial<EstadoEditor> | null = null;
  let seleccionado: string | null = null;
  /** El balon parado del analisis: hace falta para calcular fragmentos al alargar una parte. */
  let tramos: readonly Intervalo[] = [];

  const actual = (): EstadoEditor | null => historial?.estado ?? null;
  const numero = (e: EstadoEditor, id: string): number => e.fragmentos.findIndex((f) => f.id === id) + 1;
  const avisar = (mensaje: string): void => {
    estadoTexto.textContent = mensaje;
  };

  const linea = new LineaTiempo(el('linea-analisis'), (t) => {
    const e = actual();
    if (!e) return;
    seleccionado = fragmentoEn(e, t)?.id ?? seleccionado;
    reproductor.buscar(t);
    pintar();
  });
  const lista = new ListaFragmentos(el('lista-fragmentos'), {
    alElegir: (id) => elegir(id),
    alEquipo: (id, equipo) => {
      seleccionado = id;
      alternarEquipo(equipo);
    },
    nombres,
  });
  const panelPartes = new PanelPartes(el('partes-editor'), (numero, borde) => moverParte(numero, borde));

  function moverParte(numero: 1 | 2, borde: Borde): void {
    const e = actual();
    if (!e) return;
    const nuevas = moverBordeParte(e.partes, e.duracion, numero, borde, reproductor.tiempo);
    const nombre = numero === 1 ? '1.ª parte' : '2.ª parte';
    aplicar(
      nuevas && aplicarPartes(e, nuevas, tramos, () => crypto.randomUUID()),
      (nuevo) => {
        const p = nuevo.partes.find((x) => x.numero === numero);
        return p ? `${nombre}: ${formatearDuracion(p.desde)} – ${formatearDuracion(p.hasta)}.` : '';
      },
      `La ${nombre} ya ${borde === 'desde' ? 'empieza' : 'acaba'} ahí, o se cruzaría con la otra parte.`,
    );
  }

  function pintar(): void {
    const e = actual();
    if (!e) return;
    if (!e.fragmentos.some((f) => f.id === seleccionado)) seleccionado = e.fragmentos[0]?.id ?? null;
    resumen.textContent = textoResumen(e.fragmentos, e.duracion);
    equipos.textContent = textoEquipos(e.fragmentos, nombres());
    partes.textContent = textoPartes(e.partes);
    panelPartes.pintar(e.partes);
    linea.pintar(e, seleccionado);
    linea.moverCabezal(reproductor.tiempo);
    lista.pintar(e.fragmentos, seleccionado);
    const equipo = e.fragmentos.find((f) => f.id === seleccionado)?.equipo ?? null;
    for (const b of barra.querySelectorAll<HTMLButtonElement>('button[data-accion]')) {
      const a = b.dataset.accion;
      if (a === 'local' || a === 'visitante') b.setAttribute('aria-pressed', String(equipo === a));
      if (a === 'deshacer') b.disabled = !historial?.puedeDeshacer;
      if (a === 'rehacer') b.disabled = !historial?.puedeRehacer;
    }
  }

  /** Guarda el cambio (si lo hay) y dice que ha pasado, o por que no se ha podido. */
  function aplicar(nuevo: EstadoEditor | null, hecho: (e: EstadoEditor) => string, imposible: string): void {
    if (!historial) return;
    if (!nuevo) return avisar(imposible);
    historial.hacer(nuevo);
    pintar();
    avisar(hecho(nuevo));
  }

  function elegir(id: string): void {
    const f = actual()?.fragmentos.find((x) => x.id === id);
    if (!f) return;
    seleccionado = id;
    reproductor.buscar(f.desde);
    pintar();
    lista.mostrar(id);
  }

  function alternarEquipo(equipo: Equipo): void {
    const e = actual();
    const f = e?.fragmentos.find((x) => x.id === seleccionado);
    if (!e || !f) return;
    const nuevo = f.equipo === equipo ? null : equipo;
    const n = numero(e, f.id);
    aplicar(ponerEquipo(e, f.id, nuevo), () => (nuevo ? `Fragmento ${n}: ataca ${nombres()[nuevo]}.` : `Fragmento ${n}: sin equipo.`), '');
  }

  function corregir(accion: 'unir' | 'partir' | 'inicioAqui' | 'finAqui' | 'quitar', e: EstadoEditor, t: number): void {
    const f = e.fragmentos.find((x) => x.id === seleccionado);
    if (accion === 'partir') {
      const objetivo = fragmentoEn(e, t) ?? f;
      if (!objetivo) return avisar('Lleva el vídeo dentro del fragmento que quieres partir.');
      seleccionado = objetivo.id;
      const n = numero(e, objetivo.id);
      return aplicar(
        partir(e, objetivo.id, t, () => crypto.randomUUID()),
        () => `Fragmento ${n} partido en ${formatearDuracion(t)}.`,
        'Para partir, el vídeo tiene que estar dentro del fragmento y a más de medio segundo de sus bordes.',
      );
    }
    if (!f) return;
    const n = numero(e, f.id);
    const bordes = (nuevo: EstadoEditor): string => {
      const g = nuevo.fragmentos.find((x) => x.id === f.id);
      return g ? `${formatearDuracion(g.desde)} – ${formatearDuracion(g.hasta)}` : '';
    };
    if (accion === 'unir') {
      aplicar(unirConSiguiente(e, f.id), () => `Fragmentos ${n} y ${n + 1} unidos.`, 'No hay un fragmento siguiente en la misma parte con el que unirlo.');
    } else if (accion === 'inicioAqui') {
      aplicar(moverInicio(e, f.id, t), (nuevo) => `Fragmento ${n}: ${bordes(nuevo)}.`, 'El inicio ya está ahí, o pisaría al fragmento anterior.');
    } else if (accion === 'finAqui') {
      aplicar(moverFin(e, f.id, t), (nuevo) => `Fragmento ${n}: ${bordes(nuevo)}.`, 'El final ya está ahí, o pisaría al fragmento siguiente.');
    } else {
      aplicar(quitar(e, f.id), () => `Fragmento ${n} quitado.`, '');
    }
  }

  function ejecutar(accion: AccionEditor): void {
    const e = actual();
    if (!e || !historial) return;
    const t = reproductor.tiempo;
    const f = e.fragmentos.find((x) => x.id === seleccionado);
    switch (accion) {
      case 'reproducir':
        return reproductor.alternar();
      case 'verFragmento':
        return f ? reproductor.verFragmento(f) : undefined;
      case 'verTodo':
        return reproductor.verTodo(() => actual()?.fragmentos ?? []);
      case 'anterior':
      case 'siguiente': {
        const i = e.fragmentos.findIndex((x) => x.id === seleccionado);
        const destino = e.fragmentos[accion === 'anterior' ? Math.max(0, i - 1) : Math.min(e.fragmentos.length - 1, i + 1)];
        return destino ? elegir(destino.id) : undefined;
      }
      case 'atras':
      case 'adelante':
      case 'atrasFino':
      case 'adelanteFino': {
        const paso = accion.endsWith('Fino') ? SALTO_FINO_SEG : SALTO_SEG;
        return reproductor.buscar(t + (accion.startsWith('atras') ? -paso : paso));
      }
      case 'local':
      case 'visitante':
        return alternarEquipo(accion);
      case 'deshacer':
      case 'rehacer': {
        const hecho = accion === 'deshacer' ? historial.deshacer() : historial.rehacer();
        pintar();
        return avisar(hecho ? (accion === 'deshacer' ? 'Deshecho.' : 'Rehecho.') : 'No hay nada que ' + accion + '.');
      }
      default:
        return corregir(accion, e, t);
    }
  }

  barra.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-accion]')?.dataset.accion;
    if (a === 'verTodo' || esAccion(a)) ejecutar(a);
  });

  document.addEventListener('keydown', (ev) => {
    if (!historial || contenedor.hidden || teclaAjena(ev.target, ev.key)) return;
    const accion = accionDeTecla(ev);
    if (!accion) return;
    ev.preventDefault();
    ejecutar(accion);
  });

  // Viendo los fragmentos, la seleccion sigue al video.
  reproductor.alCambiarTiempo((t) => {
    linea.moverCabezal(t);
    const e = actual();
    if (!e || !reproductor.reproduciendo) return;
    const f = fragmentoEn(e, t);
    if (f && f.id !== seleccionado) {
      seleccionado = f.id;
      pintar();
      lista.mostrar(f.id);
    }
  });

  return {
    abrir: (d) => {
      historial = new Historial<EstadoEditor>({ duracion: d.duracion, partes: d.resultado.partes, fragmentos: d.resultado.fragmentos, correcciones: [] });
      tramos = d.resultado.tramos;
      seleccionado = d.resultado.fragmentos[0]?.id ?? null;
      reproductor.cargar(d.fichero);
      contenedor.hidden = false;
      avisar('');
      pintar();
    },
    cerrar: () => {
      historial = null;
      seleccionado = null;
      reproductor.soltar();
      contenedor.hidden = true;
    },
    get estado() {
      return actual();
    },
  };
}
