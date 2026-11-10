import { el } from '../dom';
import { hoyLocal, validarDatosPartido, type Campo, type ProblemaCampo } from '../../comun/datosPartido';
import type { LecturaVideo } from './metadatos';
import { filasDatos } from './resumenVideo';
import { hayErrores, ordenar, problemaDeLectura, validarFichero, validarMetadatos, type Problema } from './validacion';
import { pintarDatos, pintarProblemas } from './vistaVideo';

/**
 * El formulario de «Nuevo partido»: elegir el video, comprobarlo en el
 * navegador y rellenar los datos del partido.
 *
 * En esta entrega no se sube nada: el boton sigue desactivado hasta que
 * llegue la subida (fase 1). `data-listo` en el formulario dice si, con lo que
 * hay, ya se podria subir; asi lo comprueba la prueba de Playwright sin
 * depender de los textos.
 */

type EstadoVideo =
  | { tipo: 'ninguno' }
  | { tipo: 'leyendo'; fichero: File }
  | { tipo: 'comprobado'; fichero: File; problemas: Problema[] };

const CAMPOS: readonly Campo[] = ['local', 'visitante', 'fecha'];

function textoEstado(video: EstadoVideo, videoValido: boolean, listo: boolean): string {
  if (video.tipo === 'ninguno') return 'Elige el vídeo del partido.';
  if (video.tipo === 'leyendo') return 'Leyendo el vídeo…';
  if (!videoValido) return 'Este vídeo no se puede usar: mira lo marcado como error.';
  if (!listo) return 'El vídeo vale. Falta completar los datos del partido.';
  return 'Todo listo. En cuanto llegue la subida, este botón la empezará.';
}

export interface OpcionesFormulario {
  /** Cada video que se puede usar, o null en cuanto se elige otro (o uno que no vale). */
  alCambiarVideo?: (fichero: File | null) => void;
}

export function iniciarFormulario(opciones: OpcionesFormulario = {}): void {
  const formulario = el<HTMLFormElement>('form-subida');
  const bloqueVideo = el<HTMLFieldSetElement>('bloque-video');
  const entrada = el<HTMLInputElement>('entrada-video');
  const zona = el<HTMLDivElement>('zona-video');
  const ficha = el<HTMLDivElement>('ficha-video');
  const nombre = el<HTMLParagraphElement>('nombre-video');
  const datos = el<HTMLDListElement>('datos-video');
  const problemas = el<HTMLUListElement>('problemas-video');
  const estado = el<HTMLParagraphElement>('estado-subida');
  const campos: Record<Campo, HTMLInputElement> = {
    local: el('campo-local'),
    visitante: el('campo-visitante'),
    fecha: el('campo-fecha'),
  };

  let video: EstadoVideo = { tipo: 'ninguno' };
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

  function pintar(): void {
    const deLosDatos = validarDatosPartido(
      { local: campos.local.value, visitante: campos.visitante.value, fecha: campos.fecha.value },
      hoyLocal(),
    );
    pintarCampos(deLosDatos);
    const videoValido = video.tipo === 'comprobado' && !hayErrores(video.problemas);
    const listo = videoValido && !deLosDatos.some((p) => p.gravedad === 'error');
    formulario.dataset.listo = listo ? 'si' : 'no';
    estado.textContent = textoEstado(video, videoValido, listo);
  }

  async function elegir(fichero: File): Promise<void> {
    const mio = ++turno;
    opciones.alCambiarVideo?.(null);
    zona.hidden = true;
    ficha.hidden = false;
    nombre.textContent = fichero.name;
    datos.replaceChildren();

    const previos = validarFichero({ nombre: fichero.name, tipo: fichero.type, tamano: fichero.size });
    if (hayErrores(previos)) {
      video = { tipo: 'comprobado', fichero, problemas: ordenar(previos) };
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
    video = { tipo: 'comprobado', fichero, problemas: ordenar([...previos, ...encontrados]) };
    pintarProblemas(problemas, video.problemas);
    pintar();
    if (!hayErrores(video.problemas)) opciones.alCambiarVideo?.(fichero);
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
    pintar();
  });

  pintar();
}
