import { el } from '../dom';
import { hoyLocal, validarDatosPartido, type Campo, type DatosPartido, type ProblemaCampo } from '../../comun/datosPartido';
import type { LecturaVideo } from './metadatos';
import { filasDatos } from './resumenVideo';
import { hayErrores, ordenar, problemaDeLectura, validarFichero, validarMetadatos, type Problema } from './validacion';
import { pintarDatos, pintarProblemas } from './vistaVideo';

/**
 * El formulario de «Nuevo partido»: elegir el video, comprobarlo en el
 * navegador, rellenar los datos del partido y «Subir y analizar».
 *
 * `data-listo` en el formulario dice si, con lo que hay, ya se puede subir;
 * asi lo comprueba la prueba de Playwright sin depender de los textos.
 */

type EstadoVideo =
  | { tipo: 'ninguno' }
  | { tipo: 'leyendo'; fichero: File }
  | { tipo: 'comprobado'; fichero: File; problemas: Problema[]; duracion: number | null };

export interface VideoValido {
  fichero: File;
  duracion: number;
}

const CAMPOS: readonly Campo[] = ['local', 'visitante', 'fecha'];

function textoEstado(video: EstadoVideo, videoValido: boolean, listo: boolean, ocupado: boolean): string {
  if (video.tipo === 'ninguno') return 'Elige el vídeo del partido.';
  if (video.tipo === 'leyendo') return 'Leyendo el vídeo…';
  if (!videoValido) return 'Este vídeo no se puede usar: mira lo marcado como error.';
  if (!listo) return 'El vídeo vale. Falta completar los datos del partido.';
  if (ocupado) return 'Hay un partido subiéndose: espera a que acabe, o páralo, antes de empezar otro.';
  return 'Todo listo: pulsa «Subir y analizar».';
}

export interface OpcionesFormulario {
  /** «Subir y analizar» con un video que vale y los datos completos (sin espacios de sobra). */
  alEnviar?: (video: VideoValido, datos: DatosPartido) => void;
}

export interface Formulario {
  /** Mientras sube otro partido, no se puede empezar uno nuevo. */
  bloquear: (ocupado: boolean) => void;
}

export function iniciarFormulario(opciones: OpcionesFormulario = {}): Formulario {
  const formulario = el<HTMLFormElement>('form-subida');
  const bloqueVideo = el<HTMLFieldSetElement>('bloque-video');
  const entrada = el<HTMLInputElement>('entrada-video');
  const zona = el<HTMLDivElement>('zona-video');
  const ficha = el<HTMLDivElement>('ficha-video');
  const nombre = el<HTMLParagraphElement>('nombre-video');
  const datos = el<HTMLDListElement>('datos-video');
  const problemas = el<HTMLUListElement>('problemas-video');
  const estado = el<HTMLParagraphElement>('estado-subida');
  const boton = el<HTMLButtonElement>('btn-subir');
  const campos: Record<Campo, HTMLInputElement> = {
    local: el('campo-local'),
    visitante: el('campo-visitante'),
    fecha: el('campo-fecha'),
  };

  let video: EstadoVideo = { tipo: 'ninguno' };
  let ocupado = false;
  /** Cada eleccion tiene su turno: si se cambia de fichero a media lectura, la lectura vieja no pinta. */
  let turno = 0;
  /** Los mensajes de un campo solo salen cuando ya se ha pasado por el: no se rine antes de escribir. */
  const tocados = new Set<Campo>();

  campos.fecha.value = hoyLocal();

  function pintarCampos(lista: readonly ProblemaCampo[]): void {
    for (const c of CAMPOS) {
      const p = tocados.has(c) ? lista.find((x) => x.campo === c) : undefined;
      const mensaje = el<HTMLParagraphElement>(`mensaje-${c}`);
      mensaje.textContent = p?.mensaje ?? '';
      mensaje.hidden = !p;
      mensaje.className = `mensaje-campo mensaje-${p?.gravedad ?? 'error'}`;
      campos[c].setAttribute('aria-invalid', String(p?.gravedad === 'error'));
    }
  }

  const datosPartido = (): DatosPartido => ({ local: campos.local.value.trim(), visitante: campos.visitante.value.trim(), fecha: campos.fecha.value });

  /** El video y los datos si ya se puede subir; si no, null. */
  function pintar(): VideoValido | null {
    const deLosDatos = validarDatosPartido(datosPartido(), hoyLocal());
    pintarCampos(deLosDatos);
    const videoValido = video.tipo === 'comprobado' && !hayErrores(video.problemas) && video.duracion !== null;
    const listo = videoValido && !deLosDatos.some((p) => p.gravedad === 'error');
    formulario.dataset.listo = listo ? 'si' : 'no';
    boton.disabled = !listo || ocupado;
    estado.textContent = textoEstado(video, videoValido, listo, ocupado);
    return listo && video.tipo === 'comprobado' && video.duracion !== null ? { fichero: video.fichero, duracion: video.duracion } : null;
  }

  async function elegir(fichero: File): Promise<void> {
    const mio = ++turno;
    zona.hidden = true;
    ficha.hidden = false;
    nombre.textContent = fichero.name;
    datos.replaceChildren();

    const previos = validarFichero({ nombre: fichero.name, tipo: fichero.type, tamano: fichero.size });
    if (hayErrores(previos)) {
      video = { tipo: 'comprobado', fichero, problemas: ordenar(previos), duracion: null };
      pintarProblemas(problemas, video.problemas);
      pintar();
      return;
    }

    video = { tipo: 'leyendo', fichero };
    pintarProblemas(problemas, []);
    pintar();
    // Mediabunny son unos 45 KB comprimidos: se cargan al elegir el video, no
    // al abrir la pagina, que asi sale al instante.
    let lectura: LecturaVideo;
    try {
      const { leerMetadatos } = await import('./metadatos');
      lectura = await leerMetadatos(fichero);
    } catch {
      lectura = { tipo: 'ilegible', motivo: 'No se ha podido cargar el lector de vídeo. Comprueba la conexión y recarga la página.' };
    }
    if (mio !== turno) return;

    if (lectura.tipo === 'leido') pintarDatos(datos, filasDatos(lectura.metadatos, fichero.size));
    const encontrados = lectura.tipo === 'leido' ? validarMetadatos(lectura.metadatos) : [problemaDeLectura(lectura.motivo)];
    const duracion = lectura.tipo === 'leido' ? lectura.metadatos.duracionSeg : null;
    video = { tipo: 'comprobado', fichero, problemas: ordenar([...previos, ...encontrados]), duracion };
    pintarProblemas(problemas, video.problemas);
    pintar();
  }

  entrada.addEventListener('change', () => {
    const fichero = entrada.files?.[0];
    // Se vacia para que volver a elegir el mismo fichero tambien avise.
    entrada.value = '';
    if (fichero) void elegir(fichero);
  });
  el<HTMLButtonElement>('btn-cambiar-video').addEventListener('click', () => entrada.click());

  bloqueVideo.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    bloqueVideo.classList.add('arrastrando');
  });
  bloqueVideo.addEventListener('dragleave', (e) => {
    if (!bloqueVideo.contains(e.relatedTarget as Node | null)) bloqueVideo.classList.remove('arrastrando');
  });
  bloqueVideo.addEventListener('drop', (e) => {
    e.preventDefault();
    bloqueVideo.classList.remove('arrastrando');
    const fichero = e.dataTransfer?.files[0];
    if (fichero) void elegir(fichero);
  });
  // Soltar el video fuera de la zona no debe abrirlo en la pestana y tirar el formulario.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  for (const c of CAMPOS) {
    campos[c].addEventListener('input', pintar);
    campos[c].addEventListener('change', pintar);
    campos[c].addEventListener('blur', () => {
      tocados.add(c);
      pintar();
    });
  }

  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    for (const c of CAMPOS) tocados.add(c);
    const listo = pintar();
    if (listo && !ocupado) opciones.alEnviar?.(listo, datosPartido());
  });

  pintar();
  return {
    bloquear: (si) => {
      ocupado = si;
      pintar();
    },
  };
}
