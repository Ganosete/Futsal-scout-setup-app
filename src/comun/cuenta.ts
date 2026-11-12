/**
 * Lo que se dicen el navegador y el Worker sobre las cuentas: el formato del
 * email y del codigo de entrada, que los dos comprueban igual.
 */

export const LARGO_CODIGO = 6;

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
