import type { Equipo, Fragmento } from '../../nucleo/fragmentos';
import { filasFragmentos, type Nombres } from '../analisis/resumen';
import { crear } from '../dom';

/**
 * La lista de fragmentos, con el equipo a un clic en cada fila. Un solo
 * oyente para toda la lista (delegacion): las filas se repintan con cada
 * correccion y asi no hay que volver a engancharlas.
 *
 * Cada fila lleva su id, sus segundos y su equipo en data-*: lo leen las
 * pruebas y no depende de los textos.
 */

export interface OpcionesLista {
  alElegir: (id: string) => void;
  /** Se pulsa el equipo de una fila: el editor decide si lo pone o lo quita. */
  alEquipo: (id: string, equipo: Equipo) => void;
  nombres: () => Nombres;
}

export class ListaFragmentos {
  constructor(
    private readonly lista: HTMLOListElement,
    private readonly op: OpcionesLista,
  ) {
    lista.addEventListener('click', (e) => {
      const objetivo = e.target as HTMLElement;
      const fila = objetivo.closest<HTMLLIElement>('li[data-id]');
      if (!fila?.dataset.id) return;
      const equipo = objetivo.closest<HTMLButtonElement>('button[data-equipo]')?.dataset.equipo;
      if (equipo === 'local' || equipo === 'visitante') op.alEquipo(fila.dataset.id, equipo);
      else op.alElegir(fila.dataset.id);
    });
  }

  pintar(fragmentos: readonly Fragmento[], seleccionado: string | null): void {
    const nombres = this.op.nombres();
    this.lista.replaceChildren(
      ...filasFragmentos(fragmentos).map((f) => {
        const li = crear('li', `fragmento equipo-${f.equipo ?? 'ninguno'}${f.id === seleccionado ? ' seleccionado' : ''}`);
        li.dataset.id = f.id;
        li.dataset.desde = f.desdeSeg.toFixed(2);
        li.dataset.hasta = f.hastaSeg.toFixed(2);
        li.dataset.equipo = f.equipo ?? '';
        if (f.id === seleccionado) li.setAttribute('aria-current', 'true');
        li.append(
          crear('span', 'fragmento-numero', String(f.numero)),
          crear('span', 'fragmento-parte', f.parte),
          crear('span', 'fragmento-rango', f.rango),
          crear('span', 'fragmento-duracion', f.duracion),
          this.botonEquipo('local', 'L', nombres.local, f.equipo),
          this.botonEquipo('visitante', 'V', nombres.visitante, f.equipo),
        );
        return li;
      }),
    );
  }

  /** Lleva la fila elegida a la vista sin mover la pagina mas de lo necesario. */
  mostrar(id: string): void {
    this.lista.querySelector(`li[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  private botonEquipo(equipo: Equipo, letra: string, nombre: string, actual: Equipo | null): HTMLButtonElement {
    const b = crear('button', `chip-equipo chip-${equipo}`, letra);
    b.type = 'button';
    b.dataset.equipo = equipo;
    b.setAttribute('aria-pressed', String(actual === equipo));
    b.setAttribute('aria-label', `Ataca ${nombre}`);
    b.title = `Ataca ${nombre}`;
    return b;
  }
}
