import type { Intervalo } from '../balonParado/tramos';
import type { Caja } from '../deteccion/caja';

/**
 * Lo que se guarda de cada fotograma mirado para saber quien tiene el balon:
 * donde esta el balon y los jugadores mas cerca de el, con el color de su
 * camiseta. Con esto se reparten los equipos y se calcula la posesion sin
 * volver a pasar el detector.
 */

export interface PersonaCerca {
  /** En pixeles del fotograma original. */
  caja: Caja;
  /** Histograma de la camiseta (descriptorCamiseta), o null si no se pudo medir. */
  descriptor: number[] | null;
}

export interface RegistroFotograma {
  segundos: number;
  balon: Caja | null;
  /** De mas a menos cerca del balon (o del centro, si no se ve el balon). */
  personas: PersonaCerca[];
}

/** Los instantes que se miran: dentro de cada fragmento, `fps` por segundo, empezando en su inicio. */
export function instantesEnTramos(tramos: readonly Intervalo[], fps: number): number[] {
  if (!(fps > 0)) return [];
  const salida: number[] = [];
  for (const t of [...tramos].sort((a, b) => a.desde - b.desde)) {
    for (let i = 0; ; i++) {
      const s = t.desde + i / fps;
      if (s >= t.hasta) break;
      salida.push(Math.round(s * 1000) / 1000);
    }
  }
  return salida;
}

/** Los pies: el centro del borde de abajo de la caja. */
export function pies(c: Caja): { x: number; y: number } {
  return { x: c.x + c.w / 2, y: c.y + c.h };
}

export function centro(c: Caja): { x: number; y: number } {
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}

/**
 * Distancia de los pies de un jugador a un punto, medida en alturas de ese
 * jugador. Asi no hace falta calibrar la pista: uno lejos de la camara es mas
 * pequeno y su metro tambien.
 */
export function distanciaEnAlturas(persona: Caja, punto: { x: number; y: number }): number {
  const p = pies(persona);
  return Math.hypot(p.x - punto.x, p.y - punto.y) / Math.max(1, persona.h);
}

/** Los `maximo` jugadores mas cerca de un punto, del mas cercano al mas lejano. */
export function masCerca(personas: readonly Caja[], punto: { x: number; y: number }, maximo: number): Caja[] {
  return [...personas].sort((a, b) => distanciaEnAlturas(a, punto) - distanciaEnAlturas(b, punto)).slice(0, maximo);
}

const esNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function leerCaja(x: unknown): Caja | null {
  if (typeof x !== 'object' || x === null) return null;
  const c = x as Record<string, unknown>;
  return esNumero(c.x) && esNumero(c.y) && esNumero(c.w) && esNumero(c.h) ? { x: c.x, y: c.y, w: c.w, h: c.h } : null;
}

/** Las detecciones guardadas, comprobadas: lo que no tenga la forma esperada se descarta entero. */
export function leerRegistros(x: unknown): RegistroFotograma[] | null {
  if (typeof x !== 'object' || x === null) return null;
  const d = x as { version?: unknown; registros?: unknown };
  if (d.version !== 1 || !Array.isArray(d.registros)) return null;
  const salida: RegistroFotograma[] = [];
  for (const r of d.registros as unknown[]) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    if (!esNumero(o.segundos) || !Array.isArray(o.personas)) return null;
    const balon = o.balon === null ? null : leerCaja(o.balon);
    if (o.balon !== null && !balon) return null;
    const personas: PersonaCerca[] = [];
    for (const p of o.personas as unknown[]) {
      const q = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
      const caja = leerCaja(q.caja);
      const descriptor = q.descriptor === null ? null : Array.isArray(q.descriptor) && q.descriptor.every(esNumero) ? (q.descriptor as number[]) : undefined;
      if (!caja || descriptor === undefined) return null;
      personas.push({ caja, descriptor });
    }
    salida.push({ segundos: o.segundos, balon, personas });
  }
  return salida;
}
