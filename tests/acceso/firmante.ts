import type { ClaveJwk } from '../../src/servidor/acceso/jwt';

/**
 * Un par de claves RSA de verdad para firmar tokens como lo hace Access. Se
 * generan en cada prueba: no hay claves privadas guardadas en el repositorio.
 */
export interface Firmante {
  clave: ClaveJwk;
  firmar: (carga: Record<string, unknown>, cabecera?: Record<string, unknown>) => Promise<string>;
}

const base64Url = (datos: Uint8Array | string): string => Buffer.from(datos).toString('base64url');

export async function crearFirmante(kid: string): Promise<Firmante> {
  const par = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publica = await crypto.subtle.exportKey('jwk', par.publicKey);
  return {
    clave: { kid, kty: 'RSA', n: publica.n, e: publica.e },
    firmar: async (carga, cabecera = {}) => {
      const sinFirmar = `${base64Url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT', ...cabecera }))}.${base64Url(JSON.stringify(carga))}`;
      const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(sinFirmar));
      return `${sinFirmar}.${base64Url(new Uint8Array(firma))}`;
    },
  };
}
