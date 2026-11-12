import { formatearTamano } from '../../comun/formato';
import { repartirColores, SEPARACION_MINIMA, type Colores } from '../../nucleo/equipos/colores';
import { votosPorToques } from '../../nucleo/equipos/porToques';
import { votar, type Clasificador } from '../../nucleo/equipos/posesion';
import { leerRegistros, type RegistroFotograma } from '../../nucleo/equipos/registro';
import type { Fragmento } from '../../nucleo/fragmentos';
import { api } from '../api/api';
import type { DatosNombre } from '../descarga/nombre';
import { el } from '../dom';
import type { Editor } from '../editor/editor';
import { aplicarEquipos } from '../editor/equiposAuto';
import { Barra } from '../partido/barra';
import { BloqueFuera } from './bloqueFuera';
import { detectarEquipos, type DeteccionEnCurso } from './cliente';
import { obtenerModelo } from './modelo';

/**
 * «Quién ataca»: buscar con el detector quien tiene el balon en cada
 * fragmento, preguntar al entrenador que camiseta es la suya y poner los
 * equipos. Lo que vio el detector se guarda en el servidor: al abrir el
 * partido otro dia basta con contestar la pregunta, sin volver a buscar.
 */

export interface DatosEquipos {
  origen: File | URL;
  idPartido: string | null;
  nombres: DatosNombre;
}

export interface PanelEquipos {
  abrir: (d: DatosEquipos) => void;
  cerrar: () => void;
  /** Ha cambiado el estado del editor (la pista, los fragmentos): lo que dependa de el se vuelve a pintar. */
  actualizar: () => void;
}

export function resumenEquipos(fragmentos: readonly Fragmento[]): string {
  const sin = fragmentos.filter((f) => f.equipo === null).length;
  const con = fragmentos.length - sin;
  const dudosos = sin === 0 ? 'ninguno sin decidir' : sin === 1 ? '1 sin decidir: revísalo' : `${sin} sin decidir: revísalos`;
  return `Equipos puestos: ${con} ${con === 1 ? 'fragmento' : 'fragmentos'} con equipo y ${dudosos}.`;
}

export function crearPanelEquipos(editor: Editor): PanelEquipos {
  const bloque = el<HTMLElement>('bloque-equipos');
  const botonBuscar = el<HTMLButtonElement>('btn-buscar-equipos');
  const botonParar = el<HTMLButtonElement>('btn-parar-equipos');
  const barra = new Barra(el('progreso-equipos'), el('barra-equipos'), el('porcentaje-equipos'));
  const estado = el<HTMLParagraphElement>('estado-equipos');
  const colores = el<HTMLDivElement>('colores-equipos');
  const pregunta = el<HTMLParagraphElement>('pregunta-equipos');
  const partir = el<HTMLInputElement>('partir-posesion');
  const botonesColor = [...colores.querySelectorAll<HTMLButtonElement>('.boton-color')];
  const fuera = new BloqueFuera(editor);
  const video = el<HTMLVideoElement>('video-editor');

  let datos: DatosEquipos | null = null;
  let registros: RegistroFotograma[] = [];
  let reparto: Colores | null = null;
  let enCurso: DeteccionEnCurso | null = null;
  let descarga: AbortController | null = null;
  let turno = 0;

  const decir = (texto: string): void => {
    estado.textContent = texto;
  };

  function enMarcha(si: boolean): void {
    botonBuscar.hidden = si;
    botonParar.hidden = !si;
    if (!si) barra.ocultar();
  }

  /** Con las detecciones, los dos colores y la pregunta. */
  function preparar(nuevos: RegistroFotograma[], local: string): void {
    registros = nuevos;
    // El balon fuera no depende de los colores: sale aunque los equipos no se distingan.
    fuera.usar(nuevos);
    reparto = repartirColores(registros);
    colores.hidden = true;
    if (!reparto) return decir('No se han visto bastantes jugadores cerca del balón para distinguir los equipos.');
    if (reparto.separacion < SEPARACION_MINIMA) return decir('Las camisetas de los dos equipos se parecen demasiado para distinguirlas: pon los equipos a mano.');
    pregunta.textContent = `¿Qué camiseta lleva ${local}?`;
    reparto.grupos.forEach((g, i) => {
      const b = botonesColor[i];
      b.setAttribute('aria-pressed', 'false');
      b.querySelector<HTMLElement>('.muestra-color')?.style.setProperty('--color', g.muestra);
      const nombre = b.querySelector<HTMLElement>('.nombre-color');
      if (nombre) nombre.textContent = `Camiseta ${g.nombre}`;
    });
    colores.hidden = false;
  }

  async function buscar(): Promise<void> {
    const d = datos;
    const fragmentos = editor.estado?.fragmentos ?? [];
    if (!d || fragmentos.length === 0) return;
    const mio = ++turno;
    enMarcha(true);
    colores.hidden = true;
    decir('Preparando el detector…');
    descarga = new AbortController();
    try {
      const modelo = await obtenerModelo((a) => {
        barra.mostrar(a.bytes / a.total);
        decir(`Descargando el detector (solo la primera vez): ${formatearTamano(a.bytes)} de ${formatearTamano(a.total)}.`);
      }, descarga.signal);
      if (mio !== turno) return;
      barra.mostrar(0);
      let comienzo = 0;
      let como = '';
      const actual = detectarEquipos(d.origen, modelo.bytes, modelo.manifiesto, fragmentos, {
        alPreparar: (p) => {
          comienzo = performance.now();
          como =
            p.backend === 'webgpu'
              ? `Buscando con la tarjeta gráfica: ${p.fotogramas} fotogramas.`
              : `Sin tarjeta gráfica disponible: se mira un fotograma cada ${Math.round(1 / p.fps)} s (${p.fotogramas} en total) y va despacio.`;
          decir(como);
        },
        alAvanzar: (hechos, total) => {
          barra.mostrar(total > 0 ? hechos / total : 1);
          const quedan = hechos > 0 ? ((performance.now() - comienzo) / hechos) * (total - hechos) : 0;
          decir(quedan > 60_000 ? `${como} Quedan unos ${Math.round(quedan / 60_000)} min.` : como);
        },
      });
      enCurso = actual;
      const hecho = await actual.resultado;
      if (mio !== turno) return;
      if (!hecho) return decir('Búsqueda parada.');
      if (d.idPartido) {
        void api.guardarDetecciones(d.idPartido, { version: 1, registros: hecho.registros }).catch((e: unknown) => console.warn('No se han guardado las detecciones', e));
      }
      preparar(hecho.registros, d.nombres.local.trim() || 'el local');
      if (reparto && !colores.hidden) decir(`Búsqueda hecha en ${Math.round(hecho.segundosPared)} s.`);
    } catch (e) {
      if (mio === turno) decir(`No se ha podido buscar quién ataca: ${(e as Error).message}`);
    } finally {
      if (mio === turno) {
        enCurso = null;
        descarga = null;
        enMarcha(false);
      }
    }
  }

  function elegir(grupo: 0 | 1): void {
    if (!reparto) return;
    const c: Clasificador = {
      centroides: [reparto.grupos[0].centroide, reparto.grupos[1].centroide],
      equipos: grupo === 0 ? ['local', 'visitante'] : ['visitante', 'local'],
    };
    // Con la pista marcada (camara fija) se vota por toques; sin ella, por cercania.
    const e = editor.estado;
    const pista = e?.pista ?? null;
    const porToques = pista !== null && video.videoWidth > 0;
    const votos = porToques && e ? votosPorToques(registros, e.fragmentos, pista, video.videoWidth, video.videoHeight, c) : votar(registros, c);
    botonesColor.forEach((b, i) => b.setAttribute('aria-pressed', String(i === grupo)));
    editor.cambiar(
      (actual) => aplicarEquipos(actual, votos, partir.checked, () => crypto.randomUUID()),
      (nuevo) => resumenEquipos(nuevo.fragmentos),
      'Los equipos ya estaban así.',
    );
    const resumen = resumenEquipos(editor.estado?.fragmentos ?? []);
    decir(porToques ? `${resumen} Con la pista marcada, la posesión se mide por toques.` : resumen);
  }

  botonBuscar.addEventListener('click', () => void buscar());
  botonParar.addEventListener('click', () => {
    turno++;
    descarga?.abort();
    enCurso?.parar();
    enCurso = null;
    enMarcha(false);
    decir('Búsqueda parada.');
  });
  botonesColor.forEach((b, i) => b.addEventListener('click', () => elegir(i === 0 ? 0 : 1)));

  function cerrar(): void {
    turno++;
    descarga?.abort();
    enCurso?.parar();
    enCurso = null;
    datos = null;
    registros = [];
    reparto = null;
    fuera.usar([]);
    enMarcha(false);
    colores.hidden = true;
    decir('');
    bloque.hidden = true;
  }

  return {
    abrir: (d) => {
      cerrar();
      datos = d;
      bloque.hidden = false;
      const mio = turno;
      // Si ya se busco otro dia, basta con contestar la pregunta.
      if (d.idPartido) {
        void api
          .leerDetecciones(d.idPartido)
          .then((guardadas) => {
            const r = leerRegistros(guardadas);
            if (mio !== turno || !r) return;
            preparar(r, d.nombres.local.trim() || 'el local');
            if (!colores.hidden) decir('Ya se buscó quién ataca en este partido: contesta la pregunta para poner los equipos.');
          })
          .catch(() => undefined);
      }
    },
    cerrar,
    actualizar: () => fuera.pintar(),
  };
}
