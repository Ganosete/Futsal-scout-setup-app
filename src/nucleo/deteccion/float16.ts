// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/infer/float16.ts.
// Cambios: ninguno.

/**
 * Conversion de float32 a float16 (IEEE 754 binary16).
 *
 * Muchas exportaciones de RF-DETR vienen en float16 para ir mas rapido en GPU,
 * y entonces la entrada del modelo tambien lo es. Sin esto, pasarle un tensor
 * float32 falla con un error de tipos ilegible.
 *
 * El redondeo es al mas cercano: truncar mete un sesgo sistematico hacia cero
 * en los 150.000 valores de un fotograma.
 */
const vista = new DataView(new ArrayBuffer(4));

/** Un float32 (por sus bits) a los 16 bits de un float16. */
export function bitsAMedio(bits: number): number {
  const signo = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mantisa = bits & 0x7fffff;

  // Infinito y NaN se conservan; un NaN tiene que seguir siendo NaN.
  if (exp === 0xff) return signo | 0x7c00 | (mantisa !== 0 ? 0x200 : 0);

  const e = exp - 127 + 15;
  // Por encima del rango de float16: infinito con su signo.
  if (e >= 0x1f) return signo | 0x7c00;

  if (e <= 0) {
    // Subnormal, o tan pequeno que se va a cero.
    if (e < -10) return signo;
    const conImplicito = mantisa | 0x800000;
    const desplazamiento = 14 - e;
    let medio = conImplicito >>> desplazamiento;
    // Bit de redondeo: el que se acaba de perder.
    if ((conImplicito >>> (desplazamiento - 1)) & 1) medio += 1;
    return signo | medio;
  }

  let medio = (e << 10) | (mantisa >>> 13);
  // El acarreo del redondeo entra en el exponente, que es lo correcto.
  if (mantisa & 0x1000) medio += 1;
  return signo | medio;
}

export function aFloat16(origen: Float32Array): Uint16Array {
  const salida = new Uint16Array(origen.length);
  for (let i = 0; i < origen.length; i++) {
    vista.setFloat32(0, origen[i]);
    salida[i] = bitsAMedio(vista.getUint32(0));
  }
  return salida;
}

/**
 * Y de vuelta: los 16 bits de un float16 al numero que representan.
 *
 * Un modelo exportado en float16 no solo PIDE float16 en la entrada: tambien
 * DEVUELVE float16. onnxruntime entrega esas salidas como `Uint16Array` de
 * patrones de bits, y leerlas como si fueran decimales no da un resultado
 * aproximado, da basura: el logit -5 sale como 50432, la sigmoide de eso es 1
 * y todas las consultas del modelo pasan el umbral a la vez.
 */
export function deBitsMedio(bits: number): number {
  const signo = bits & 0x8000 ? -1 : 1;
  const exp = (bits >>> 10) & 0x1f;
  const mantisa = bits & 0x3ff;

  // Exponente 0: cero o subnormal. El 2^-24 es el escalon de los subnormales.
  if (exp === 0) return signo * mantisa * 2 ** -24;
  if (exp === 0x1f) return mantisa === 0 ? signo * Infinity : NaN;
  return signo * (1 + mantisa / 1024) * 2 ** (exp - 15);
}

export function deFloat16(origen: Uint16Array): Float32Array {
  const salida = new Float32Array(origen.length);
  for (let i = 0; i < origen.length; i++) salida[i] = deBitsMedio(origen[i]);
  return salida;
}
