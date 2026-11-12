import { formatearTamano } from './formato';

/**
 * Los planes y lo que deja cada uno. Lo comprueban el Worker (al crear un
 * partido, al cambiar de plan y al borrar lo que pasa de su retencion) y el
 * navegador (para ensenarlo). El pago es una maqueta: no se cobra nada.
 *
 * Las cifras son provisionales. Lo que cuesta de verdad es el almacenamiento
 * en R2 (0,015 $ por GB y mes): el plan gratuito, lleno, son 0,15 $ al mes.
 */

const GB = 1024 ** 3;

export type IdPlan = 'gratuito' | 'scout' | 'pro';

export interface Plan {
  id: IdPlan;
  nombre: string;
  /** Euros al mes. */
  precioMes: number;
  /** null: sin limite. */
  partidos: number | null;
  almacenamientoBytes: number;
  /** Dias que se guarda cada partido desde que se sube; null: sin limite. */
  retencionDias: number | null;
}

export const PLANES: readonly Plan[] = [
  { id: 'gratuito', nombre: 'Gratuito', precioMes: 0, partidos: 3, almacenamientoBytes: 10 * GB, retencionDias: 30 },
  { id: 'scout', nombre: 'Scout', precioMes: 9, partidos: 30, almacenamientoBytes: 150 * GB, retencionDias: 365 },
  { id: 'pro', nombre: 'Pro', precioMes: 19, partidos: null, almacenamientoBytes: 500 * GB, retencionDias: null },
];

export const esIdPlan = (x: unknown): x is IdPlan => PLANES.some((p) => p.id === x);

/** El plan de un id guardado; uno que no se conozca es el gratuito. */
export function plan(id: string | null | undefined): Plan {
  return PLANES.find((p) => p.id === id) ?? PLANES[0];
}

export interface Uso {
  partidos: number;
  bytes: number;
}

/** Por que no cabe un partido nuevo de `tamano` bytes; null si cabe. */
export function motivoParaNoSubir(p: Plan, uso: Uso, tamano: number): string | null {
  if (p.partidos !== null && uso.partidos + 1 > p.partidos) {
    return `Tu plan ${p.nombre} llega a ${p.partidos} partidos: borra alguno o cambia de plan.`;
  }
  if (uso.bytes + tamano > p.almacenamientoBytes) {
    return `Este vídeo (${formatearTamano(tamano)}) no cabe en tu plan ${p.nombre}: usas ${formatearTamano(uso.bytes)} de ${formatearTamano(p.almacenamientoBytes)}. Borra algún partido o cambia de plan.`;
  }
  return null;
}

/** Por que no se puede pasar a `destino` con lo que hay guardado; null si se puede. */
export function motivoParaNoCambiar(destino: Plan, uso: Uso): string | null {
  if (destino.partidos !== null && uso.partidos > destino.partidos) {
    return `Para pasar a ${destino.nombre} deja como mucho ${destino.partidos} partidos: ahora tienes ${uso.partidos}.`;
  }
  if (uso.bytes > destino.almacenamientoBytes) {
    return `Para pasar a ${destino.nombre} tienes que bajar de ${formatearTamano(destino.almacenamientoBytes)}: ahora usas ${formatearTamano(uso.bytes)}.`;
  }
  return null;
}

const DIA_MS = 24 * 3600 * 1000;

/**
 * Cuando se borra un partido; null si el plan no borra. Los dias cuentan desde
 * que se subio o desde el ultimo cambio de plan, lo que sea despues: quien baja
 * de plan tiene los dias del nuevo para bajarse lo que quiera guardar.
 */
export function fechaDeBorrado(creado: string, planDesde: string | null, p: Plan): string | null {
  if (p.retencionDias === null) return null;
  const desde = Math.max(Date.parse(creado), planDesde ? Date.parse(planDesde) : 0);
  return new Date(desde + p.retencionDias * DIA_MS).toISOString();
}

/**
 * Lo mismo visto desde `ahora`: lo que empezo a contar en este instante o
 * antes ya se ha pasado. Es la condicion con la que el Worker busca en D1.
 */
export function limiteDeRetencion(p: Plan, ahora: Date): string | null {
  return p.retencionDias === null ? null : new Date(ahora.getTime() - p.retencionDias * DIA_MS).toISOString();
}
