/**
 * Deshacer y rehacer sobre estados inmutables: cada cambio guarda el estado
 * anterior entero. Con unos cientos de fragmentos por partido son pocos KB
 * por paso, y asi no hay que escribir la inversa de cada operacion.
 */
export class Historial<T> {
  private readonly atras: T[] = [];
  private adelante: T[] = [];

  constructor(
    private actual: T,
    private readonly maximo = 200,
  ) {}

  get estado(): T {
    return this.actual;
  }

  get puedeDeshacer(): boolean {
    return this.atras.length > 0;
  }

  get puedeRehacer(): boolean {
    return this.adelante.length > 0;
  }

  hacer(nuevo: T): void {
    this.atras.push(this.actual);
    if (this.atras.length > this.maximo) this.atras.shift();
    this.actual = nuevo;
    this.adelante = [];
  }

  deshacer(): boolean {
    const previo = this.atras.pop();
    if (previo === undefined) return false;
    this.adelante.push(this.actual);
    this.actual = previo;
    return true;
  }

  rehacer(): boolean {
    const siguiente = this.adelante.pop();
    if (siguiente === undefined) return false;
    this.atras.push(this.actual);
    this.actual = siguiente;
    return true;
  }
}
