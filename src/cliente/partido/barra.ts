const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });

/** Una barra de progreso con su porcentaje al lado. */
export class Barra {
  constructor(
    private readonly fila: HTMLElement,
    private readonly barra: HTMLProgressElement,
    private readonly porcentaje: HTMLElement,
  ) {}

  mostrar(fraccion: number): void {
    const f = Math.max(0, Math.min(1, fraccion));
    this.fila.hidden = false;
    this.barra.value = f;
    // Hacia abajo: un 99,6 % no puede decir 100 % mientras falta algo.
    this.porcentaje.textContent = PORCENTAJE.format(Math.floor(f * 100) / 100);
  }

  ocultar(): void {
    this.fila.hidden = true;
  }
}
