/**
 * Las cuentas del muestreo, sacadas de la lectura para probarlas sin navegador.
 */

/** Los instantes en que se mira la imagen: de `inicio` a `fin` (sin incluirlo), a `fps` por segundo. */
export function* instantesDeMuestreo(inicio: number, fin: number, fps: number): Generator<number> {
  if (!(fps > 0)) return;
  for (let i = 0; ; i++) {
    const t = inicio + i / fps;
    if (t >= fin) return;
    yield t;
  }
}

/** Huecos de menos de esto son el redondeo de los instantes, no un hueco. */
const TOLERANCIA_HUECO_SEG = 0.01;
/** Se rellena a trozos de un segundo para no reservar de golpe un hueco enorme. */
const TROZO_SEG = 1;

/**
 * El silencio que hay que meter al detector para cubrir el hueco entre donde
 * acabo el audio anterior (`esperado`) y donde empieza el siguiente trozo
 * (`llega`). Si no hay hueco (o se solapan), nada.
 */
export function* silencioParaHueco(esperado: number, llega: number, frecuencia: number): Generator<Float32Array> {
  let faltan = Math.round((llega - esperado) * frecuencia);
  if (llega - esperado <= TOLERANCIA_HUECO_SEG || faltan <= 0) return;
  const trozo = Math.round(TROZO_SEG * frecuencia);
  while (faltan > 0) {
    const n = Math.min(trozo, faltan);
    yield new Float32Array(n);
    faltan -= n;
  }
}
