import type { Fragmento } from '../../nucleo/fragmentos';
import { segmentosFuera, segmentosLinea } from '../analisis/resumen';
import { crear } from '../dom';
import type { EstadoEditor } from './operaciones';

/**
 * La linea de tiempo del partido entero: los fragmentos del color del equipo
 * que ataca, sombreado lo que no es partido (calentamiento, descanso) y el
 * cabezal donde esta el video. Un clic lleva el video a ese instante. Lo que
 * esconde el filtro se sigue viendo, apagado: la linea es el partido entero.
 *
 * Las posiciones se ponen por CSSOM (style.left), no con atributos style: la
 * CSP no deja estilos en linea en el HTML.
 */
export class LineaTiempo {
  private readonly capa = crear('div', 'linea-capa');
  private readonly cabezal = crear('span', 'linea-cabezal');
  private duracion = 0;

  constructor(contenedor: HTMLElement, alPulsar: (t: number) => void) {
    contenedor.replaceChildren(this.capa, this.cabezal);
    contenedor.addEventListener('pointerdown', (e) => {
      const r = contenedor.getBoundingClientRect();
      if (r.width <= 0 || this.duracion <= 0) return;
      const fraccion = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      alPulsar(fraccion * this.duracion);
    });
  }

  pintar(e: EstadoEditor, seleccionado: string | null, visible: (f: Fragmento) => boolean = () => true): void {
    this.duracion = e.duracion;
    const fuera = new Set(e.fragmentos.filter((f) => !visible(f)).map((f) => f.id));
    const posicionar = (el: HTMLElement, izquierda: number, ancho: number): HTMLElement => {
      el.style.left = `${izquierda}%`;
      el.style.width = `${ancho}%`;
      return el;
    };
    this.capa.replaceChildren(
      ...segmentosFuera(e.partes, e.duracion).map((s) => posicionar(crear('span', 'linea-fuera'), s.izquierda, s.ancho)),
      ...segmentosLinea(e.fragmentos, e.duracion).map((s) => {
        const clase = `linea-tramo equipo-${s.equipo ?? 'ninguno'}${s.id === seleccionado ? ' seleccionado' : ''}${fuera.has(s.id) ? ' fuera-filtro' : ''}`;
        const tramo = posicionar(crear('span', clase), s.izquierda, s.ancho);
        tramo.dataset.id = s.id;
        return tramo;
      }),
    );
  }

  moverCabezal(t: number): void {
    if (this.duracion > 0) this.cabezal.style.left = `${(100 * Math.min(t, this.duracion)) / this.duracion}%`;
  }
}
