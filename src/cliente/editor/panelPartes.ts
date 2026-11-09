import { formatearDuracion } from '../../comun/formato';
import type { Parte } from '../../nucleo/partes';
import { el } from '../dom';
import type { Borde } from './limitesPartes';

/**
 * Las dos partes del partido con sus botones «Empieza aquí» y «Acaba aquí»:
 * el borde va a donde este el video. Sin 2.ª parte (no se encontro el
 * descanso), «Empieza aquí» la crea.
 */
export class PanelPartes {
  private readonly rangos = [el<HTMLSpanElement>('rango-parte-1'), el<HTMLSpanElement>('rango-parte-2')];
  private readonly finSegunda: HTMLButtonElement;

  constructor(contenedor: HTMLElement, alMover: (numero: 1 | 2, borde: Borde) => void) {
    const fin = contenedor.querySelector<HTMLButtonElement>('button[data-parte="2"][data-borde="hasta"]');
    if (!fin) throw new Error('Falta el botón del final de la 2.ª parte en index.html');
    this.finSegunda = fin;
    contenedor.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-parte][data-borde]');
      const numero = b?.dataset.parte === '2' ? 2 : 1;
      const borde = b?.dataset.borde;
      if (b && (borde === 'desde' || borde === 'hasta')) alMover(numero, borde);
    });
  }

  pintar(partes: readonly Parte[]): void {
    for (const n of [1, 2] as const) {
      const p = partes.find((x) => x.numero === n);
      this.rangos[n - 1].textContent = p
        ? `${formatearDuracion(p.desde)} – ${formatearDuracion(p.hasta)}`
        : 'sin marcar: lleva el vídeo a donde empieza y pulsa «Empieza aquí»';
    }
    this.finSegunda.disabled = !partes.some((p) => p.numero === 2);
  }
}
