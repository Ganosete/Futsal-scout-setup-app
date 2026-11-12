import { leerEdicion, type Edicion } from '../../comun/edicion';
import type { DatosPartido } from '../../comun/datosPartido';
import type { Partido, PartidoParaSubir } from '../../comun/partido';
import { analizarVideo, type AnalisisEnCurso } from '../analisis/cliente';
import { api } from '../api/api';
import type { DatosNombre } from '../descarga/nombre';
import { el } from '../dom';
import { crearEditor } from '../editor/editor';
import { crearPanelEquipos } from '../equipos/panelEquipos';
import { Guardado, type EstadoGuardado } from '../editor/guardado';
import { crearPanelPista } from '../pista/panelPista';
import { huellaFichero } from '../subida/huella';
import { Barra } from './barra';
import { crearCompartir } from './compartir';
import { compactarSenales, edicionDeAnalisis, edicionDeEstado, estadoDeEdicion } from './conversion';
import { subirVideo, type SubidaVideo } from './subidaVideo';
import { fechaPartido, tituloPartido } from './textos';

/**
 * La seccion «Jugadas» de un partido: la subida y el analisis a la vez, y el
 * editor con lo que sale, que se guarda solo en el servidor.
 *
 * Un partido se abre recien elegido el video (se reproduce el fichero local)
 * o desde «Mis partidos» (se reproduce el de R2). Cada apertura tiene su
 * turno: lo que llegue tarde de una anterior no pinta.
 */

export interface VideoElegido {
  fichero: File;
  duracion: number;
}

export interface PanelPartido {
  subirYAnalizar: (video: VideoElegido, datos: DatosPartido) => Promise<void>;
  abrir: (p: Partido) => Promise<void>;
  /** Si el partido abierto es ese, se cierra (se ha borrado). */
  cerrarSiEs: (id: string) => void;
  /** Hay una subida o un analisis en marcha. */
  readonly ocupado: boolean;
  /** Hay algo que se perderia al salir de la pagina. */
  readonly pendiente: boolean;
}

export interface OpcionesPanel {
  /** Ha cambiado algo de la lista de «Mis partidos». */
  alCambiarPartidos: () => void;
  alCambiarOcupado: (ocupado: boolean) => void;
  /** El partido que se esta viendo, o null. */
  alAbrir: (id: string | null) => void;
}

const SEGUNDOS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function textoGuardado(e: EstadoGuardado): string {
  if (e.tipo === 'guardado') return 'Cambios guardados.';
  if (e.tipo === 'reintentando') return `No se han podido guardar los cambios (${e.mensaje}): se vuelve a intentar en unos segundos.`;
  if (e.tipo === 'parado') return `Los cambios ya no se guardan: ${e.mensaje}`;
  return 'Guardando…';
}

export function iniciarPanelPartido(o: OpcionesPanel): PanelPartido {
  const bloque = el<HTMLElement>('bloque-analisis');
  const titulo = el<HTMLParagraphElement>('partido-abierto');
  const barraSubida = new Barra(el('progreso-subida'), el('barra-subida'), el('porcentaje-subida'));
  const barraAnalisis = new Barra(el('progreso-analisis'), el('barra-analisis'), el('porcentaje-analisis'));
  const botonParar = el<HTMLButtonElement>('btn-parar');
  const estadoSubida = el<HTMLParagraphElement>('estado-subida-partido');
  const estadoAnalisis = el<HTMLParagraphElement>('estado-analisis');
  const estadoGuardado = el<HTMLParagraphElement>('estado-guardado');
  const editor = crearEditor();
  const compartir = crearCompartir();
  const equipos = crearPanelEquipos(editor);
  const pista = crearPanelPista(editor);

  let turno = 0;
  let abierto: string | null = null;
  let subida: SubidaVideo | null = null;
  let analisis: AnalisisEnCurso | null = null;
  let guardado: Guardado<Edicion> | null = null;
  /** Lo que queda por guardar del partido anterior: se espera antes de abrir otro. */
  let vaciando: Promise<void> = Promise.resolve();

  const ocupado = (): boolean => subida !== null || analisis !== null;
  const avisarOcupado = (): void => {
    botonParar.hidden = !ocupado();
    o.alCambiarOcupado(ocupado());
  };

  function soltarGuardado(): void {
    const g = guardado;
    guardado = null;
    if (g) vaciando = g.guardarYa().finally(() => g.parar());
  }

  function marcar(id: string | null, nombre = ''): void {
    abierto = id;
    if (id) history.replaceState(null, '', `#partido=${id}`);
    else if (location.hash) history.replaceState(null, '', location.pathname);
    if (id) compartir.abrir(id, nombre);
    else compartir.cerrar();
    o.alAbrir(id);
  }

  function cerrar(): void {
    turno++;
    marcar(null);
    subida?.soltar();
    analisis?.parar();
    subida = null;
    analisis = null;
    soltarGuardado();
    editor.cerrar();
    equipos.cerrar();
    pista.cerrar();
    barraSubida.ocultar();
    barraAnalisis.ocultar();
    for (const p of [estadoSubida, estadoAnalisis, estadoGuardado]) p.textContent = '';
    avisarOcupado();
  }

  function empezar(datos: DatosNombre): number {
    cerrar();
    bloque.hidden = false;
    titulo.textContent = `${tituloPartido(datos)} · ${fechaPartido(datos.fecha)}`;
    return turno;
  }

  /** El editor con unas jugadas; si hay partido en el servidor, cada cambio se guarda. */
  function abrirEditor(origen: File | URL, edicion: Edicion, nombre: DatosNombre, id: string | null, etag: string | null): Guardado<Edicion> | null {
    soltarGuardado();
    const g = id
      ? new Guardado<Edicion>({ etag, guardar: (e, v) => api.guardarEdicion(id, e, v), alCambiar: (e) => (estadoGuardado.textContent = textoGuardado(e)) })
      : null;
    guardado = g;
    estadoGuardado.textContent = g ? '' : 'Estas jugadas no se guardan: el partido no está en el servidor.';
    editor.abrir({
      origen,
      inicial: estadoDeEdicion(edicion),
      tramos: edicion.tramos,
      partido: nombre,
      alCambiar: (e) => {
        g?.cambiar(edicionDeEstado(e, edicion.tramos));
        pista.pintar(e.pista);
        equipos.actualizar();
      },
    });
    equipos.abrir({ origen, idPartido: id, nombres: nombre });
    pista.pintar(edicion.pista);
    return g;
  }

  /** Las jugadas que ya se guardaron, o null si no hay. */
  async function guardadas(id: string): Promise<{ edicion: Edicion; etag: string } | null> {
    const leida = await api.leerEdicion(id);
    if (!leida) return null;
    const edicion = leerEdicion(leida.datos);
    if (!edicion) throw new Error('Las jugadas guardadas no se pueden leer.');
    return { edicion, etag: leida.etag };
  }

  async function buscarJugadas(video: VideoElegido, datos: DatosNombre, p: PartidoParaSubir | null, mio: number): Promise<void> {
    // Al reanudar, si ya se buscaron, se abren las guardadas: lo corregido no se pierde.
    if (p?.partido.editado) {
      estadoAnalisis.textContent = 'Abriendo las jugadas guardadas…';
      try {
        const g = await guardadas(p.partido.id);
        if (mio !== turno) return;
        if (g) {
          abrirEditor(video.fichero, g.edicion, datos, p.partido.id, g.etag);
          estadoAnalisis.textContent = 'Estas son las jugadas que ya tenías guardadas.';
          return;
        }
      } catch (e) {
        if (mio === turno) estadoAnalisis.textContent = `No se han podido abrir las jugadas guardadas: ${(e as Error).message}`;
        return;
      }
    }
    barraAnalisis.mostrar(0);
    estadoAnalisis.textContent = 'Buscando las jugadas…';
    const actual = analizarVideo(video.fichero, (f) => barraAnalisis.mostrar(f));
    analisis = actual;
    avisarOcupado();
    try {
      const hecho = await actual.resultado;
      if (mio !== turno) return;
      if (!hecho) {
        estadoAnalisis.textContent = 'Análisis parado.';
        return;
      }
      const edicion = edicionDeAnalisis(hecho.resultado, hecho.senales.duracion);
      const g = abrirEditor(video.fichero, edicion, datos, p?.partido.id ?? null, null);
      // Lo que propone el analisis se guarda ya, sin esperar a la primera correccion.
      if (g) {
        g.cambiar(edicion);
        void g.guardarYa().then(() => o.alCambiarPartidos());
      }
      if (p) void api.guardarSenales(p.partido.id, compactarSenales(hecho.senales)).catch((e: unknown) => console.warn('No se han guardado las señales', e));
      const avisos = hecho.avisos.length > 0 ? ` ${hecho.avisos.join(' ')}` : '';
      estadoAnalisis.textContent = `Hecho en ${SEGUNDOS.format(hecho.segundosPared)} s.${avisos}`;
    } catch (e) {
      if (mio === turno) estadoAnalisis.textContent = `No se ha podido analizar el vídeo: ${(e as Error).message}`;
    } finally {
      if (analisis === actual) {
        analisis = null;
        barraAnalisis.ocultar();
        avisarOcupado();
      }
    }
  }

  async function subirYAnalizar(video: VideoElegido, datos: DatosPartido): Promise<void> {
    const mio = empezar(datos);
    await vaciando;
    if (mio !== turno) return;
    estadoSubida.textContent = 'Preparando la subida…';
    let p: PartidoParaSubir | null = null;
    try {
      const huella = await huellaFichero(video.fichero);
      p = await api.crearPartido({
        ...datos,
        nombreFichero: video.fichero.name,
        tamano: video.fichero.size,
        duracion: video.duracion,
        huella,
      });
    } catch (e) {
      if (mio !== turno) return;
      // Sin servidor se puede seguir: las jugadas se buscan igual, aunque no se guarden.
      estadoSubida.textContent = `No se ha podido subir el vídeo: ${(e as Error).message}`;
    }
    if (mio !== turno) return;
    let finSubida: Promise<void> = Promise.resolve();
    if (p) {
      marcar(p.partido.id, tituloPartido(datos));
      o.alCambiarPartidos();
      const subiendo = subirVideo(p, video.fichero, { barra: barraSubida, estado: estadoSubida });
      subida = subiendo;
      avisarOcupado();
      finSubida = subiendo.hecha.then((cambio) => {
        if (subida === subiendo) {
          subida = null;
          avisarOcupado();
        }
        if (cambio) o.alCambiarPartidos();
      });
    }
    await Promise.all([finSubida, buscarJugadas(video, datos, p, mio)]);
  }

  async function abrir(p: Partido): Promise<void> {
    const mio = empezar(p);
    await vaciando;
    if (mio !== turno) return;
    marcar(p.id, tituloPartido(p));
    estadoAnalisis.textContent = 'Abriendo el partido…';
    try {
      const g = await guardadas(p.id);
      if (mio !== turno) return;
      if (!g) {
        estadoAnalisis.textContent = 'Este partido aún no tiene jugadas: elige el mismo vídeo en «Nuevo partido» y pulsa «Subir y analizar».';
        return;
      }
      abrirEditor(api.urlVideo(p.id), g.edicion, p, p.id, g.etag);
      estadoAnalisis.textContent = '';
    } catch (e) {
      if (mio === turno) estadoAnalisis.textContent = `No se ha podido abrir el partido: ${(e as Error).message}`;
    }
  }

  botonParar.addEventListener('click', () => {
    subida?.parar();
    analisis?.parar();
  });

  return {
    subirYAnalizar,
    abrir,
    cerrarSiEs: (id) => {
      if (abierto !== id) return;
      cerrar();
      bloque.hidden = true;
    },
    get ocupado() {
      return ocupado();
    },
    get pendiente() {
      return subida !== null || (guardado?.pendiente ?? false);
    },
  };
}
