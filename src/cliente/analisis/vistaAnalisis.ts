import type { ResultadoAnalisis } from '../../nucleo/analizar';
import { crear } from '../dom';
import { filasFragmentos, segmentosLinea, textoPartes, textoResumen } from './resumen';

export interface ElementosResultado {
  contenedor: HTMLElement;
  resumen: HTMLElement;
  partes: HTMLElement;
  linea: HTMLElement;
  lista: HTMLOListElement;
}

/**
 * Pinta el resultado: resumen, descanso, linea de tiempo y la lista de
 * fragmentos. Cada fila lleva sus segundos en data-desde y data-hasta, que es
 * lo que leen las pruebas y lo que usara el editor de la fase 1c.
 */
export function pintarResultado(e: ElementosResultado, r: ResultadoAnalisis, duracion: number): void {
  e.resumen.textContent = textoResumen(r, duracion);
  e.partes.textContent = textoPartes(r);

  e.linea.replaceChildren(
    ...segmentosLinea(r, duracion).map((s) => {
      const tramo = crear('span', `linea-tramo linea-parte-${s.parte}`);
      // Posicion por CSSOM, no con un atributo style: la CSP no deja estilos en linea.
      tramo.style.left = `${s.izquierda}%`;
      tramo.style.width = `${s.ancho}%`;
      return tramo;
    }),
  );

  e.lista.replaceChildren(
    ...filasFragmentos(r).map((f) => {
      const li = crear('li', 'fragmento');
      li.dataset.desde = f.desdeSeg.toFixed(2);
      li.dataset.hasta = f.hastaSeg.toFixed(2);
      li.append(
        crear('span', 'fragmento-numero', String(f.numero)),
        crear('span', 'fragmento-parte', f.parte),
        crear('span', 'fragmento-rango', f.rango),
        crear('span', 'fragmento-duracion', f.duracion),
      );
      return li;
    }),
  );
  e.contenedor.hidden = false;
}
