import type { IdPlan, Uso } from './planes';

/**
 * Lo que se dicen el navegador y el Worker sobre las cuentas: el formato del
 * email y del codigo de entrada, que los dos comprueban igual, y la cuenta.
 */

export const LARGO_CODIGO = 6;

/** Lo que responde GET /api/cuenta, y PUT /api/cuenta/plan despues del cambio. */
export interface Cuenta {
  email: string;
  plan: IdPlan;
  alta: string;
  /** Desde cuando tiene este plan: de ahi cuentan tambien los dias de lo ya subido. */
  planDesde: string;
  uso: Uso;
}

/** Basta con que parezca un email: la prueba de verdad es que el codigo llegue. */
export function leerEmail(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const email = x.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function leerCodigo(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const codigo = x.replace(/\s+/g, '');
  return new RegExp(`^\\d{${LARGO_CODIGO}}$`).test(codigo) ? codigo : null;
}
