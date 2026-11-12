// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/fft.ts.
// Cambios: ninguno.
/**
 * FFT radix-2 iterativa, en el sitio. Es lo unico que hace falta para buscar
 * el silbato y no compensa una dependencia: son cuarenta lineas y se prueban
 * con valores hechos a mano.
 */
export class Fft {
  readonly n: number;
  private readonly coseno: Float64Array;
  private readonly seno: Float64Array;
  private readonly inverso: Uint32Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`La FFT necesita una potencia de 2 (${n}).`);
    this.n = n;
    this.coseno = new Float64Array(n / 2);
    this.seno = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      this.coseno[k] = Math.cos((-2 * Math.PI * k) / n);
      this.seno[k] = Math.sin((-2 * Math.PI * k) / n);
    }
    const bits = Math.log2(n);
    this.inverso = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.inverso[i] = r;
    }
  }

  /** Transforma `re` e `im` en el sitio. */
  transformar(re: Float64Array, im: Float64Array): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.inverso[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let tam = 2; tam <= n; tam *= 2) {
      const mitad = tam / 2;
      const paso = n / tam;
      for (let inicio = 0; inicio < n; inicio += tam) {
        for (let k = 0; k < mitad; k++) {
          const c = this.coseno[k * paso];
          const s = this.seno[k * paso];
          const a = inicio + k;
          const b = a + mitad;
          const tr = re[b] * c - im[b] * s;
          const ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}
