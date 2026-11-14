import { LARGO_CODIGO } from '../../comun/cuenta';

/** Los secretos de las cuentas: codigos de entrada, tokens de sesion y sus hash. */

export async function sha256Hex(texto: string): Promise<string> {
  const suma = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(suma)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Seis cifras al azar, sin sesgo: se descartan los valores por encima del ultimo millon entero. */
export function nuevoCodigo(): string {
  const tope = 10 ** LARGO_CODIGO;
  const limite = Math.floor(2 ** 32 / tope) * tope;
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    if (n < limite) return String(n % tope).padStart(LARGO_CODIGO, '0');
  }
}

/** 256 bits en base64url: la llave de una sesion. */
export function nuevoTokenSesion(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** El codigo va atado a su email: el mismo codigo no vale para otra cuenta. */
export const hashCodigo = (email: string, codigo: string): Promise<string> => sha256Hex(`${email}:${codigo}`);
