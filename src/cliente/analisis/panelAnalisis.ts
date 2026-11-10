import type { DatosNombre } from '../descarga/nombre';
import { el } from '../dom';
import { crearEditor, type Editor } from '../editor/editor';
import { analizarVideo, type AnalisisEnCurso } from './cliente';

/**
 * La seccion «Jugadas»: buscar el balon parado en el video elegido, con su
 * progreso y la posibilidad de parar, y abrir el editor con los fragmentos
 * que salen.
 *
 * Por ahora se lanza a mano y sobre el fichero local; cuando llegue la subida
 * (1a) correra a la vez que ella.
 */

export interface PanelAnalisis {
  /** El formulario avisa de cada video valido que se elige, o de que ya no hay ninguno. */
  videoElegido: (fichero: File | null) => void;
  readonly editor: Editor;
}

const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const SEGUNDOS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function iniciarPanelAnalisis(partido: () => DatosNombre): PanelAnalisis {
  const bloque = el<HTMLElement>('bloque-analisis');
  const botonAnalizar = el<HTMLButtonElement>('btn-analizar');
  const botonParar = el<HTMLButtonElement>('btn-parar-analisis');
  const progreso = el<HTMLDivElement>('progreso-analisis');
  const barra = el<HTMLProgressElement>('barra-analisis');
  const porcentaje = el<HTMLSpanElement>('porcentaje-analisis');
  const estado = el<HTMLParagraphElement>('estado-analisis');
  const editor = crearEditor(partido);

  let fichero: File | null = null;
  let enCurso: AnalisisEnCurso | null = null;

  function enMarcha(si: boolean): void {
    botonAnalizar.hidden = si;
    botonParar.hidden = !si;
    progreso.hidden = !si;
  }

  function avance(f: number): void {
    barra.value = f;
    porcentaje.textContent = PORCENTAJE.format(f);
  }

  function parar(): void {
    enCurso?.parar();
    enCurso = null;
    enMarcha(false);
  }

  async function analizar(): Promise<void> {
    if (!fichero || enCurso) return;
    const video = fichero;
    editor.cerrar();
    avance(0);
    enMarcha(true);
    estado.textContent = 'Buscando el balón parado…';
    const actual = analizarVideo(video, avance);
    enCurso = actual;
    try {
      const hecho = await actual.resultado;
      if (enCurso !== actual) return;
      if (!hecho) {
        estado.textContent = 'Análisis parado.';
        return;
      }
      editor.abrir({ fichero: video, resultado: hecho.resultado, duracion: hecho.senales.duracion });
      const avisos = hecho.avisos.length > 0 ? ` ${hecho.avisos.join(' ')}` : '';
      estado.textContent = `Hecho en ${SEGUNDOS.format(hecho.segundosPared)} s.${avisos}`;
    } catch (e) {
      if (enCurso === actual) estado.textContent = `No se ha podido analizar el vídeo: ${(e as Error).message}`;
    } finally {
      if (enCurso === actual) {
        enCurso = null;
        enMarcha(false);
      }
    }
  }

  botonAnalizar.addEventListener('click', () => void analizar());
  botonParar.addEventListener('click', () => {
    parar();
    estado.textContent = 'Análisis parado.';
  });

  return {
    videoElegido: (f) => {
      parar();
      editor.cerrar();
      fichero = f;
      bloque.hidden = !f;
      estado.textContent = '';
    },
    editor,
  };
}
