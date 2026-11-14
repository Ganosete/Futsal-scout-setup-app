// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/pitidos.ts.
// Cambios: ninguno.
import { Fft } from './fft';

/**
 * El silbato del arbitro en el audio del partido.
 *
 * Un silbato es un tono casi puro y sostenido entre 3 y 5 kHz. Se reconoce
 * por tres cosas a la vez: casi toda la energia esta en esa banda, dentro de
 * la banda hay un pico muy por encima del resto (un ruido de grada es plano)
 * y el pico no se mueve. El chirrido de una zapatilla es tonal pero dura unas
 * centesimas y se desliza de tono: lo tumban la duracion minima y el rango de
 * tono.
 *
 * La banda empezaba en 2 kHz. Medido en un partido real (Feme-Mataro, 78 min,
 * camara fija en la grada): los silbatos del arbitro caen entre 3,2 y 4,7 kHz,
 * y todo lo que salia entre 2,1 y 2,5 kHz eran gritos (armonicos de voces
 * agudas) o la bocina de la mesa. Por eso empieza en 3 kHz. El resto de
 * umbrales sigue saliendo de tonos sinteticos.
 */

export interface OpcionesPitidos {
  bandaHz: [number, number];
  /** Fraccion minima de la energia del fotograma que cae en la banda. */
  razonBandaMinima: number;
  /** Cuantas veces la potencia media de la banda tiene que superar el pico. */
  prominenciaMinima: number;
  /** Valor eficaz minimo de lo que hay en la banda (1 = fondo de escala). */
  nivelMinimo: number;
  /**
   * Cuanto puede variar el tono a lo largo de TODO el pitido, en Hz. Medido
   * de ventana a ventana no vale: un chirrido que sube 2 kHz en 0,3 s solo se
   * mueve 150 Hz por ventana.
   */
  rangoMaximoHz: number;
  duracionMinimaSeg: number;
  /** Dos pitidos mas juntos que esto son uno (el trino de un gol). */
  huecoMaximoSeg: number;
}

export const OPCIONES_PITIDOS: OpcionesPitidos = {
  bandaHz: [3000, 5000],
  razonBandaMinima: 0.25,
  prominenciaMinima: 15,
  nivelMinimo: 0.002,
  rangoMaximoHz: 400,
  duracionMinimaSeg: 0.15,
  huecoMaximoSeg: 0.3,
};

export interface Pitido {
  desde: number;
  hasta: number;
  frecuenciaHz: number;
  /** Fraccion media de la energia en la banda: 0..1. */
  fuerza: number;
}

/** Ventana de unos 46 ms: resuelve 20 Hz y aun sigue un pitido corto. */
export function tamVentana(frecuenciaMuestreo: number): number {
  return 2 ** Math.round(Math.log2(frecuenciaMuestreo * 0.046));
}

interface Racha {
  inicio: number;
  fin: number;
  sumaFrecuencia: number;
  sumaFuerza: number;
  ventanas: number;
  minFrecuencia: number;
  maxFrecuencia: number;
  fallos: number;
}

export class DetectorPitidos {
  readonly n: number;
  private readonly salto: number;
  private readonly fft: Fft;
  private readonly hann: Float64Array;
  private readonly sumaHann2: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly binDesde: number;
  private readonly binHasta: number;
  private readonly binMinimo: number;
  private pendiente = new Float32Array(0);
  /** Muestra del video en la que empieza `pendiente`. */
  private origen = 0;
  private racha: Racha | null = null;
  private readonly candidatos: Pitido[] = [];
  private readonly op: OpcionesPitidos;

  constructor(
    private readonly fs: number,
    opciones: Partial<OpcionesPitidos> = {},
  ) {
    this.op = { ...OPCIONES_PITIDOS, ...opciones };
    if (fs / 2 <= this.op.bandaHz[1]) throw new Error(`Con ${fs} Hz de muestreo no se oye la banda del silbato.`);
    this.n = tamVentana(fs);
    this.salto = this.n / 2;
    this.fft = new Fft(this.n);
    this.hann = new Float64Array(this.n);
    let s = 0;
    for (let i = 0; i < this.n; i++) {
      this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.n - 1));
      s += this.hann[i] ** 2;
    }
    this.sumaHann2 = s;
    this.re = new Float64Array(this.n);
    this.im = new Float64Array(this.n);
    const hzPorBin = fs / this.n;
    this.binDesde = Math.ceil(this.op.bandaHz[0] / hzPorBin);
    this.binHasta = Math.floor(this.op.bandaHz[1] / hzPorBin);
    // Por debajo de 150 Hz solo hay zumbido y viento: no cuenta como energia de la escena.
    this.binMinimo = Math.ceil(150 / hzPorBin);
  }

  /** Muestras mono consecutivas, en trozos del tamano que sea. */
  alimentar(muestras: Float32Array): void {
    const junto = new Float32Array(this.pendiente.length + muestras.length);
    junto.set(this.pendiente);
    junto.set(muestras, this.pendiente.length);
    let i = 0;
    for (; i + this.n <= junto.length; i += this.salto) this.ventana(junto, i, this.origen + i);
    this.pendiente = junto.slice(i);
    this.origen += i;
  }

  terminar(): Pitido[] {
    this.cerrarRacha();
    const salida: Pitido[] = [];
    for (const p of this.candidatos) {
      const previo = salida[salida.length - 1];
      if (previo && p.desde - previo.hasta <= this.op.huecoMaximoSeg) {
        const dPrevio = previo.hasta - previo.desde;
        const d = p.hasta - p.desde;
        previo.frecuenciaHz = (previo.frecuenciaHz * dPrevio + p.frecuenciaHz * d) / (dPrevio + d);
        previo.fuerza = (previo.fuerza * dPrevio + p.fuerza * d) / (dPrevio + d);
        previo.hasta = p.hasta;
      } else {
        salida.push({ ...p });
      }
    }
    return salida;
  }

  private ventana(datos: Float32Array, desde: number, muestra: number): void {
    const { re, im, hann, n } = this;
    for (let i = 0; i < n; i++) {
      re[i] = datos[desde + i] * hann[i];
      im[i] = 0;
    }
    this.fft.transformar(re, im);

    let total = 0;
    let banda = 0;
    let pico = 0;
    let binPico = 0;
    for (let k = this.binMinimo; k < n / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      total += p;
      if (k >= this.binDesde && k <= this.binHasta) {
        banda += p;
        if (p > pico) {
          pico = p;
          binPico = k;
        }
      }
    }
    const binesBanda = this.binHasta - this.binDesde + 1;
    // Parseval con ventana: lo que hay en la media banda positiva, como valor eficaz.
    const nivel = Math.sqrt((2 * banda) / (n * this.sumaHann2));
    const razon = total > 0 ? banda / total : 0;
    const prominencia = banda > 0 ? pico / (banda / binesBanda) : 0;
    const frecuencia = (binPico * this.fs) / n;
    const centro = (muestra + n / 2) / this.fs;

    const esPitido = nivel >= this.op.nivelMinimo && razon >= this.op.razonBandaMinima && prominencia >= this.op.prominenciaMinima;
    const r = this.racha;
    const cabe = (x: Racha): boolean => Math.max(x.maxFrecuencia, frecuencia) - Math.min(x.minFrecuencia, frecuencia) <= this.op.rangoMaximoHz;
    if (esPitido && r && cabe(r)) {
      r.fin = centro;
      r.sumaFrecuencia += frecuencia;
      r.sumaFuerza += razon;
      r.ventanas++;
      r.minFrecuencia = Math.min(r.minFrecuencia, frecuencia);
      r.maxFrecuencia = Math.max(r.maxFrecuencia, frecuencia);
      r.fallos = 0;
      return;
    }
    // Una ventana mala dentro de un pitido (un golpe de balon encima) no lo corta.
    if (r && !esPitido && r.fallos < 1) {
      r.fallos++;
      return;
    }
    this.cerrarRacha();
    if (esPitido) {
      this.racha = { inicio: centro, fin: centro, sumaFrecuencia: frecuencia, sumaFuerza: razon, ventanas: 1, minFrecuencia: frecuencia, maxFrecuencia: frecuencia, fallos: 0 };
    }
  }

  private cerrarRacha(): void {
    const r = this.racha;
    this.racha = null;
    if (!r) return;
    // Cada ventana cubre medio salto a cada lado de su centro.
    const medio = this.salto / 2 / this.fs;
    const desde = r.inicio - medio;
    const hasta = r.fin + medio;
    if (hasta - desde < this.op.duracionMinimaSeg) return;
    this.candidatos.push({ desde, hasta, frecuenciaHz: r.sumaFrecuencia / r.ventanas, fuerza: r.sumaFuerza / r.ventanas });
  }
}

/** Todo de una vez, para las pruebas y para un audio ya decodificado entero. */
export function detectarPitidos(muestras: Float32Array, fs: number, opciones: Partial<OpcionesPitidos> = {}): Pitido[] {
  const d = new DetectorPitidos(fs, opciones);
  d.alimentar(muestras);
  return d.terminar();
}
