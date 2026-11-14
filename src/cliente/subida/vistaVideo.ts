import { crear } from '../dom';
import type { FilaDato } from './resumenVideo';
import type { Problema } from './validacion';

/** Pinta los datos del video en un <dl>. */
export function pintarDatos(lista: HTMLDListElement, filas: readonly FilaDato[]): void {
  lista.replaceChildren(
    ...filas.map((f) => {
      const grupo = crear('div', 'dato');
      grupo.append(crear('dt', '', f.termino), crear('dd', '', f.valor));
      return grupo;
    }),
  );
}

/**
 * Pinta los problemas, con la palabra «Error» o «Aviso» delante: el color
 * solo no basta para quien no distingue el rojo del ambar.
 */
export function pintarProblemas(lista: HTMLUListElement, problemas: readonly Problema[]): void {
  lista.replaceChildren(
    ...problemas.map((p) => {
      const li = crear('li', `problema problema-${p.gravedad}`);
      li.dataset.codigo = p.codigo;
      li.append(crear('strong', 'problema-nivel', p.gravedad === 'error' ? 'Error' : 'Aviso'), crear('span', '', p.mensaje));
      return li;
    }),
  );
  lista.hidden = problemas.length === 0;
}
