/**
 * La cabecera Range de una peticion del video. Un <video> pide `bytes=N-` y
 * Mediabunny tambien; con eso y `bytes=a-b` y `bytes=-n` basta. Varios rangos
 * a la vez no los pide ningun reproductor: se rechazan (416) en vez de servir
 * el video entero, que son gigas.
 */

export type Rango = { tipo: 'todo' } | { tipo: 'parte'; desde: number; hasta: number } | { tipo: 'imposible' };

const IMPOSIBLE: Rango = { tipo: 'imposible' };

/** `hasta` es inclusivo, como en la cabecera Content-Range. */
export function interpretarRango(cabecera: string | null, tamano: number): Rango {
  if (cabecera === null) return { tipo: 'todo' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!m || (m[1] === '' && m[2] === '') || tamano === 0) return IMPOSIBLE;
  if (m[1] === '') {
    const ultimos = Number(m[2]);
    return ultimos === 0 ? IMPOSIBLE : { tipo: 'parte', desde: Math.max(0, tamano - ultimos), hasta: tamano - 1 };
  }
  const desde = Number(m[1]);
  const hasta = m[2] === '' ? tamano - 1 : Math.min(Number(m[2]), tamano - 1);
  return desde >= tamano || hasta < desde ? IMPOSIBLE : { tipo: 'parte', desde, hasta };
}
