import type { Calibracion } from '../../nucleo/pista/calibracion';
import { validarMedidas } from '../../nucleo/pista/medidas';
import type { MedidasPista, Vec2 } from '../../nucleo/tipos';
import { el } from '../dom';
import type { Editor } from '../editor/editor';
import { calibracionDeClics, conPista, girada, rectContenido } from './calibrar';

/**
 * «La pista»: sus cuatro esquinas marcadas sobre el video del editor, solo
 * para la camara fija. Lo marcado va al estado del editor, asi que se guarda
 * y se deshace como lo demas. Se pinta encima del video mientras se marca y
 * mientras el bloque esta abierto, para ver si sigue encajando.
 */

export interface PanelPista {
  /** Lo que haya en el estado del editor: al abrir y en cada cambio. */
  pintar: (pista: Calibracion | null) => void;
  cerrar: () => void;
}

const SVG = 'http://www.w3.org/2000/svg';
const METROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function nodo<K extends keyof SVGElementTagNameMap>(etiqueta: K, clase: string, atributos: Record<string, string | number>): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG, etiqueta);
  n.setAttribute('class', clase);
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, String(v));
  return n;
}

export function crearPanelPista(editor: Editor): PanelPista {
  const bloque = el<HTMLDetailsElement>('pista-equipos');
  const resumen = el<HTMLSpanElement>('resumen-pista');
  const marco = el<HTMLDivElement>('marco-video-editor');
  const video = el<HTMLVideoElement>('video-editor');
  const botonMarcar = el<HTMLButtonElement>('btn-marcar-pista');
  const botonGirar = el<HTMLButtonElement>('btn-girar-pista');
  const botonQuitar = el<HTMLButtonElement>('btn-quitar-pista');
  const largo = el<HTMLInputElement>('largo-pista');
  const ancho = el<HTMLInputElement>('ancho-pista');
  const estado = el<HTMLParagraphElement>('estado-pista');
  const capa = document.createElementNS(SVG, 'svg');
  capa.setAttribute('class', 'capa-pista');
  capa.setAttribute('aria-hidden', 'true');
  marco.append(capa);

  let pista: Calibracion | null = null;
  let marcando = false;
  let clics: Vec2[] = [];

  const decir = (texto: string): void => {
    estado.textContent = texto;
  };
  const medidas = (): MedidasPista => ({ largo: Number(largo.value), ancho: Number(ancho.value) });

  /** La capa justo encima del fotograma (sin las bandas), con la pista y los clics. */
  function dibujar(): void {
    const visible = marcando || (bloque.open && pista !== null);
    const r = rectContenido(video.clientWidth, video.clientHeight, video.videoWidth, video.videoHeight);
    capa.classList.toggle('visible', visible && r !== null);
    capa.classList.toggle('marcando', marcando);
    if (!visible || !r) return;
    capa.style.left = `${video.offsetLeft + r.x}px`;
    capa.style.top = `${video.offsetTop + r.y}px`;
    capa.style.width = `${r.ancho}px`;
    capa.style.height = `${r.alto}px`;
    capa.setAttribute('viewBox', `0 0 ${r.ancho} ${r.alto}`);
    const px = (p: Vec2): [number, number] => [p.x * r.ancho, p.y * r.alto];
    const hijos: SVGElement[] = [];
    if (pista && !marcando) {
      hijos.push(nodo('polygon', 'pista-contorno', { points: pista.esquinas.map((p) => px(p).join(',')).join(' ') }));
      // La banda que va a lo largo, mas gruesa: si sale en una linea de fondo, hay que girar.
      const [a, b] = [px(pista.esquinas[0]), px(pista.esquinas[1])];
      hijos.push(nodo('line', 'pista-banda', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
    }
    for (const p of clics) {
      const [x, y] = px(p);
      hijos.push(nodo('circle', 'pista-clic', { cx: x, cy: y, r: 6 }));
    }
    capa.replaceChildren(...hijos);
  }

  function pintarControles(): void {
    botonMarcar.textContent = marcando ? 'Cancelar' : pista ? 'Marcar otra vez' : 'Marcar las esquinas';
    botonGirar.hidden = !pista || marcando;
    botonQuitar.hidden = !pista || marcando;
    resumen.textContent = pista ? `· marcada, ${METROS.format(pista.medidas.largo)} × ${METROS.format(pista.medidas.ancho)} m` : '';
  }

  function dejarDeMarcar(): void {
    marcando = false;
    clics = [];
    pintarControles();
    dibujar();
  }

  function terminar(): void {
    const r = calibracionDeClics(clics, video.videoWidth, video.videoHeight, medidas());
    if (!r.ok) {
      clics = [];
      dibujar();
      return decir(`${r.motivo} Vuelve a marcar las cuatro esquinas.`);
    }
    dejarDeMarcar();
    editor.cambiar(
      (e) => conPista(e, r.pista),
      () => 'Pista marcada.',
      'La pista ya estaba marcada así.',
    );
    decir('Pista marcada: la línea gruesa tiene que ir por una banda. Si va por una línea de fondo, pulsa «Girar».');
  }

  capa.addEventListener('pointerdown', (ev) => {
    if (!marcando) return;
    ev.preventDefault();
    const r = capa.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const limitar = (v: number): number => Math.min(1, Math.max(0, v));
    clics.push({ x: limitar((ev.clientX - r.left) / r.width), y: limitar((ev.clientY - r.top) / r.height) });
    dibujar();
    if (clics.length === 4) terminar();
    else decir(`Esquina ${clics.length} de 4.`);
  });

  botonMarcar.addEventListener('click', () => {
    if (marcando) {
      dejarDeMarcar();
      return decir('');
    }
    if (!(video.videoWidth > 0)) return decir('Espera a que cargue el vídeo.');
    const aviso = validarMedidas(medidas()).find((a) => a.nivel === 'error');
    if (aviso) return decir(aviso.texto);
    marcando = true;
    clics = [];
    pintarControles();
    dibujar();
    marco.scrollIntoView({ block: 'nearest' });
    decir('Haz clic en las cuatro esquinas de la pista sobre el vídeo, en cualquier orden. Esc cancela.');
  });

  botonGirar.addEventListener('click', () => {
    const p = pista;
    if (p) editor.cambiar((e) => conPista(e, girada(p)), () => 'Pista girada un cuarto de vuelta.', '');
  });

  botonQuitar.addEventListener('click', () => {
    editor.cambiar((e) => conPista(e, null), () => 'Pista quitada.', '');
    decir('');
  });

  const alCambiarMedidas = (): void => {
    const m = medidas();
    const avisos = validarMedidas(m);
    const error = avisos.find((a) => a.nivel === 'error');
    if (error) return decir(error.texto);
    const p = pista;
    if (p) editor.cambiar((e) => conPista(e, { ...p, medidas: m }), () => `Pista de ${METROS.format(m.largo)} × ${METROS.format(m.ancho)} m.`, '');
    decir(avisos.map((a) => a.texto).join(' '));
  };
  largo.addEventListener('change', alCambiarMedidas);
  ancho.addEventListener('change', alCambiarMedidas);

  document.addEventListener('keydown', (ev) => {
    if (marcando && ev.key === 'Escape') {
      dejarDeMarcar();
      decir('');
    }
  });
  bloque.addEventListener('toggle', dibujar);
  video.addEventListener('loadedmetadata', dibujar);
  new ResizeObserver(dibujar).observe(video);

  return {
    pintar: (p) => {
      pista = p;
      if (p) {
        largo.value = String(p.medidas.largo);
        ancho.value = String(p.medidas.ancho);
      }
      pintarControles();
      dibujar();
    },
    cerrar: () => {
      pista = null;
      bloque.open = false;
      dejarDeMarcar();
      decir('');
    },
  };
}
