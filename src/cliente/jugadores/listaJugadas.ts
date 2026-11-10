import type { JugadaCompartida, PartidoCompartido } from '../../comun/compartido';
import { filasFragmentos } from '../analisis/resumen';
import { crear } from '../dom';
import { equipoDeJugada } from './textos';

/**
 * La lista de jugadas que ve un jugador: solo para elegir, sin corregir nada.
 * Cada fila es un boton, para que se pueda usar con el teclado y con un lector
 * de pantalla. Como en el editor, la fila lleva sus segundos y su equipo en
 * data-*, que es lo que leen las pruebas.
 */
export class ListaJugadas {
  constructor(
    private readonly lista: HTMLOListElement,
    alElegir: (id: string) => void,
  ) {
    lista.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-id]')?.dataset.id;
      if (id) alElegir(id);
    });
  }

  pintar(p: PartidoCompartido, seleccionada: string | null): void {
    const porId = new Map<string, JugadaCompartida>(p.jugadas.map((j) => [j.id, j]));
    this.lista.replaceChildren(
      ...filasFragmentos(p.jugadas).map((f) => {
        const li = crear('li', `fragmento jugada equipo-${f.equipo ?? 'ninguno'}${f.id === seleccionada ? ' seleccionado' : ''}`);
        li.dataset.id = f.id;
        li.dataset.desde = f.desdeSeg.toFixed(2);
        li.dataset.hasta = f.hastaSeg.toFixed(2);
        li.dataset.equipo = f.equipo ?? '';
        if (f.id === seleccionada) li.setAttribute('aria-current', 'true');
        const boton = crear('button', 'jugada-boton');
        boton.type = 'button';
        const equipo = equipoDeJugada(porId.get(f.id) ?? p.jugadas[0], p);
        boton.setAttribute('aria-label', `Jugada ${f.numero}, ${f.parte}, ${f.rango}${equipo ? `, ataca ${equipo}` : ''}`);
        boton.append(
          crear('span', 'fragmento-numero', String(f.numero)),
          crear('span', 'fragmento-parte', f.parte),
          crear('span', 'fragmento-rango', f.rango),
          crear('span', 'fragmento-duracion', f.duracion),
          crear('span', 'jugada-equipo', equipo),
        );
        li.append(boton);
        return li;
      }),
    );
  }

  /** Lleva la fila elegida a la vista sin mover la pagina mas de lo necesario. */
  mostrar(id: string): void {
    this.lista.querySelector(`li[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}
