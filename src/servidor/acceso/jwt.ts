/**
 * Verificacion de un JWT firmado con RS256, que es como firma Cloudflare
 * Access el que manda al Worker. Lo justo para eso, con WebCrypto: una
 * biblioteca de JWT traeria algoritmos que aqui sobran y que son justo donde
 * suelen estar los fallos (aceptar `none`, confundir HS256 con RS256).
 */

/** Una clave publica del JWKS de Access. */
export interface ClaveJwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

export interface CargaJwt {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  email?: unknown;
}

export interface Esperado {
  /** El emisor exacto: `https://<equipo>.cloudflareaccess.com`. */
  iss: string;
  /** La etiqueta AUD de la aplicacion de Access. */
  aud: string;
  /** Segundos desde 1970. */
  ahora: number;
}

export type Verificacion = { ok: true; carga: CargaJwt } | { ok: false; motivo: string; claveDesconocida?: boolean };

/** Holgura para relojes que no van exactamente a la par. */
const MARGEN_SEG = 60;

function desdeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4);
  const binario = atob(b64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

function leerJson(trozo: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(new TextDecoder().decode(desdeBase64Url(trozo)));
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function esNumero(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function incluyeAud(aud: unknown, esperada: string): boolean {
  return aud === esperada || (Array.isArray(aud) && aud.includes(esperada));
}

export async function verificarJwt(token: string, claves: readonly ClaveJwk[], esperado: Esperado): Promise<Verificacion> {
  const trozos = token.split('.');
  if (trozos.length !== 3) return { ok: false, motivo: 'no tiene tres partes' };
  const [cabecera64, carga64, firma64] = trozos;
  const cabecera = leerJson(cabecera64);
  if (!cabecera) return { ok: false, motivo: 'cabecera ilegible' };
  // El algoritmo lo fija el servidor, no el token: si no, un token podria pedir `none`.
  if (cabecera.alg !== 'RS256') return { ok: false, motivo: `algoritmo ${String(cabecera.alg)}` };
  const clave = claves.find((c) => c.kid === cabecera.kid && c.kty === 'RSA' && c.n && c.e);
  if (!clave) return { ok: false, motivo: 'clave desconocida', claveDesconocida: true };

  let firma: Uint8Array<ArrayBuffer>;
  try {
    firma = desdeBase64Url(firma64);
  } catch {
    return { ok: false, motivo: 'firma mal codificada' };
  }
  const publica = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: clave.n, e: clave.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const firmado = new TextEncoder().encode(`${cabecera64}.${carga64}`);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publica, firma, firmado))) return { ok: false, motivo: 'firma incorrecta' };

  const carga = leerJson(carga64);
  if (!carga) return { ok: false, motivo: 'carga ilegible' };
  if (carga.iss !== esperado.iss) return { ok: false, motivo: 'otro emisor' };
  if (!incluyeAud(carga.aud, esperado.aud)) return { ok: false, motivo: 'otra aplicacion' };
  if (!esNumero(carga.exp) || carga.exp + MARGEN_SEG < esperado.ahora) return { ok: false, motivo: 'caducado' };
  if (carga.nbf !== undefined && (!esNumero(carga.nbf) || carga.nbf - MARGEN_SEG > esperado.ahora)) {
    return { ok: false, motivo: 'todavia no vale' };
  }
  return { ok: true, carga };
}
