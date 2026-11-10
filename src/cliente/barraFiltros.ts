import { SIN_FILTRO, type Filtro, type FiltroEquipo } from '../comun/filtros';
import type { Nombres } from './analisis/resumen';
import { crear } from './dom';

/**
 * Los botones para ver solo un equipo o una parte. Los usan el editor y la
 * pagina de los jugadores; cada uno decide que hace con el filtro.
 */

export interface OpcionesBarraFiltros {
  alCambiar: (f: Filtro) => void;
  /** «Sin equipo» le sirve al entrenador para revisar; a un jugador, no. */
  conSinEquipo: boolean;
}

export class BarraFiltros {
  private actual: Filtro = SIN_FILTRO;
  private readonly cuenta: HTMLParagraphElement;
  private readonly grupos: HTMLDivElement;

  constructor(
    contenedor: HTMLElement,
    private readonly o: OpcionesBarraFiltros,
  ) {
    this.grupos = crear('div', 'filtros-grupos');
    this.cuenta = crear('p', 'filtros-cuenta');
    this.cuenta.setAttribute('aria-live', 'polite');
    contenedor.replaceChildren(this.grupos, this.cuenta);
    this.grupos.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filtro]');
      if (!b) return;
      const v = b.dataset.valor ?? '';
      this.actual =
        b.dataset.filtro === 'equipo' ? { ...this.actual, equipo: v as FiltroEquipo } : { ...this.actual, parte: v === '1' ? 1 : v === '2' ? 2 : 'todas' };
      this.marcar();
      this.o.alCambiar(this.actual);
    });
  }

  get filtro(): Filtro {
    return this.actual;
  }

  /**
   * Los botones, con los nombres de los equipos. Sin segunda parte no hay
   * filtro de partes, y sin equipos puestos (en la pagina de los jugadores),
   * tampoco de equipos.
   */
  pintar(nombres: Nombres, conPartes: boolean, conEquipos = true): void {
    const grupo = (etiqueta: string, filtro: 'equipo' | 'parte', opciones: [string, string][]): HTMLDivElement => {
      const g = crear('div', 'filtros-grupo');
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', etiqueta);
      for (const [valor, texto] of opciones) {
        const b = crear('button', 'boton-mini', texto);
        b.type = 'button';
        b.dataset.filtro = filtro;
        b.dataset.valor = valor;
        g.append(b);
      }
      return g;
    };
    const equipos: [string, string][] = [
      ['todos', 'Todos'],
      ['local', nombres.local],
      ['visitante', nombres.visitante],
      ...(this.o.conSinEquipo ? ([['ninguno', 'Sin equipo']] as [string, string][]) : []),
    ];
    this.grupos.replaceChildren(
      ...(conEquipos ? [grupo('Ver por equipo', 'equipo', equipos)] : []),
      ...(conPartes
        ? [
            grupo('Ver por parte', 'parte', [
              ['todas', 'Las dos partes'],
              ['1', '1.ª parte'],
              ['2', '2.ª parte'],
            ]),
          ]
        : []),
    );
    if (!conPartes && this.actual.parte !== 'todas') this.actual = { ...this.actual, parte: 'todas' };
    if (!conEquipos && this.actual.equipo !== 'todos') this.actual = { ...this.actual, equipo: 'todos' };
    this.marcar();
  }

  /** Cuantos se ven, cuando hay filtro. */
  contar(visibles: number, total: number): void {
    this.cuenta.textContent = visibles === total ? '' : `Se ven ${visibles} de ${total}.`;
  }

  reiniciar(): void {
    this.actual = SIN_FILTRO;
    this.marcar();
  }

  private marcar(): void {
    for (const b of this.grupos.querySelectorAll<HTMLButtonElement>('button[data-filtro]')) {
      const actual = b.dataset.filtro === 'equipo' ? this.actual.equipo : String(this.actual.parte);
      b.setAttribute('aria-pressed', String(b.dataset.valor === actual));
    }
  }
}
