import { filtrar, pasaFiltro } from '../../comun/filtros';
import { formatearDuracion } from '../../comun/formato';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { Equipo, Fragmento } from '../../nucleo/fragmentos';
import { textoEquipos, textoPartes, textoResumen, type Nombres } from '../analisis/resumen';
import { BarraFiltros } from '../barraFiltros';
import { crearDescargador } from '../descarga/accion';
import type { DatosNombre } from '../descarga/nombre';
import { el } from '../dom';
import { accionDeTecla, esAccion, teclaAjena, type Accion } from './atajos';
import { Historial } from './historial';
import { aplicarPartes, moverBordeParte, type Borde } from './limitesPartes';
import { LineaTiempo } from './lineaTiempo';
import { ListaFragmentos } from './listaFragmentos';
import { corregir } from './correcciones';
import { fragmentoEn, ponerEquipo, type EstadoEditor } from './operaciones';
import { PanelPartes } from './panelPartes';
import { Reproductor } from './reproductor';

/**
 * El editor de fragmentos: el video, la linea de tiempo, la lista y la barra
 * de acciones, con sus atajos. Guarda el estado en un historial para deshacer
 * y avisa de cada cambio (tambien al deshacer) para que se guarde fuera.
 *
 * El video es el fichero local si esta (recien elegido: va mas fluido) o el
 * del servidor, que se pide por rangos.
 */

export interface DatosEditor {
  origen: File | URL;
  inicial: EstadoEditor;
  /** El balon parado del analisis: hace falta para calcular fragmentos al alargar una parte. */
  tramos: readonly Intervalo[];
  /** Los equipos y la fecha: nombran los botones y los ficheros que se descargan. */
  partido: DatosNombre;
  alCambiar?: (e: EstadoEditor) => void;
}

export interface Editor {
  abrir: (d: DatosEditor) => void;
  cerrar: () => void;
  readonly estado: EstadoEditor | null;
  /**
   * Un cambio que viene de fuera (los equipos del detector): entra en el
   * historial como cualquier correccion, se deshace igual y se guarda igual.
   */
  cambiar: (transformar: (e: EstadoEditor) => EstadoEditor | null, hecho: (e: EstadoEditor) => string, imposible: string) => void;
}

type AccionEditor = Accion | 'verTodo';

const SALTO_SEG = 2;
const SALTO_FINO_SEG = 0.2;

export function crearEditor(): Editor {
  let partido: DatosNombre = { local: '', visitante: '', fecha: '' };
  // En pantalla, un equipo sin nombre es «Local» o «Visitante»; en el nombre del fichero, nada.
  const nombres = (): Nombres => ({ local: partido.local.trim() || 'Local', visitante: partido.visitante.trim() || 'Visitante' });
  const contenedor = el<HTMLDivElement>('resultado-analisis');
  const resumen = el<HTMLParagraphElement>('resumen-analisis');
  const equipos = el<HTMLParagraphElement>('equipos-analisis');
  const partes = el<HTMLParagraphElement>('partes-analisis');
  const estadoTexto = el<HTMLParagraphElement>('estado-editor');
  const barra = el<HTMLDivElement>('barra-editor');
  const reproductor = new Reproductor(el<HTMLVideoElement>('video-editor'));

  let historial: Historial<EstadoEditor> | null = null;
  let seleccionado: string | null = null;
  let tramos: readonly Intervalo[] = [];
  /** De donde se recortan las descargas: el fichero local o el video en R2. */
  let origen: File | URL | null = null;
  let alCambiar: (e: EstadoEditor) => void = () => undefined;

  const actual = (): EstadoEditor | null => historial?.estado ?? null;
  const numero = (e: EstadoEditor, id: string): number => e.fragmentos.findIndex((f) => f.id === id) + 1;
  const avisar = (mensaje: string): void => {
    estadoTexto.textContent = mensaje;
  };
  const descargar = crearDescargador(avisar);

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
  const filtros = new BarraFiltros(el('filtros-editor'), {
    conSinEquipo: true,
    alCambiar: () => {
      // Si el elegido queda fuera del filtro, se pasa al primero que se ve.
      const e = actual();
      if (e && !visibles(e).some((f) => f.id === seleccionado)) seleccionado = visibles(e)[0]?.id ?? seleccionado;
      pintar();
    },
  });
  /** Cuantas partes habia la ultima vez que se pintaron los filtros: sin segunda parte no hay filtro de partes. */
  let partesPintadas = 0;
  const visibles = (e: EstadoEditor) => filtrar(e.fragmentos, filtros.filtro);

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
    const visible = (f: Fragmento): boolean => pasaFiltro(f, filtros.filtro);
    linea.pintar(e, seleccionado, visible);
    linea.moverCabezal(reproductor.tiempo);
    if (e.partes.length !== partesPintadas) {
      partesPintadas = e.partes.length;
      filtros.pintar(nombres(), e.partes.length > 1);
    }
    filtros.contar(visibles(e).length, e.fragmentos.length);
    lista.pintar(e.fragmentos, seleccionado, visible);
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
    alCambiar(nuevo);
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
      case 'descargar':
        return f && origen ? void descargar(origen, f, numero(e, f.id), partido) : undefined;
      case 'verTodo':
        return reproductor.verTodo(() => {
          const ahora = actual();
          return ahora ? visibles(ahora) : [];
        });
      case 'anterior':
      case 'siguiente': {
        const lista = visibles(e);
        const i = lista.findIndex((x) => x.id === seleccionado);
        const destino = lista[accion === 'anterior' ? Math.max(0, i - 1) : Math.min(lista.length - 1, i + 1)];
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
        if (hecho) alCambiar(historial.estado);
        return avisar(hecho ? (accion === 'deshacer' ? 'Deshecho.' : 'Rehecho.') : 'No hay nada que ' + accion + '.');
      }
      default: {
        const c = corregir(accion, e, seleccionado, t, () => crypto.randomUUID());
        if (c.tipo === 'aviso') return avisar(c.mensaje);
        if (c.tipo === 'nada') return;
        seleccionado = c.seleccionado;
        return aplicar(c.nuevo, c.hecho, c.imposible);
      }
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
    if (f && f.id !== seleccionado && pasaFiltro(f, filtros.filtro)) {
      seleccionado = f.id;
      pintar();
      lista.mostrar(f.id);
    }
  });

  return {
    abrir: (d) => {
      historial = new Historial<EstadoEditor>(d.inicial);
      tramos = d.tramos;
      origen = d.origen;
      partido = d.partido;
      alCambiar = d.alCambiar ?? (() => undefined);
      seleccionado = d.inicial.fragmentos[0]?.id ?? null;
      filtros.reiniciar();
      partesPintadas = 0;
      reproductor.cargar(d.origen);
      contenedor.hidden = false;
      avisar('');
      pintar();
    },
    cerrar: () => {
      historial = null;
      seleccionado = null;
      origen = null;
      alCambiar = () => undefined;
      reproductor.soltar();
      contenedor.hidden = true;
    },
    get estado() {
      return actual();
    },
    cambiar: (transformar, hecho, imposible) => {
      const e = actual();
      if (e) aplicar(transformar(e), hecho, imposible);
    },
  };
}
