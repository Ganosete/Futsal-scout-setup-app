import { describe, expect, it } from 'vitest';
import { leerJson, leerTexto } from '../src/servidor/cuerpo';
import { FalloApi } from '../src/servidor/respuestas';

const peticion = (cuerpo: BodyInit, cabeceras: Record<string, string> = {}): Request =>
  new Request('https://scout.club.es/api', { method: 'PUT', body: cuerpo, headers: cabeceras, duplex: 'half' } as RequestInit);

/** Un cuerpo en trozos, sin Content-Length: el limite se tiene que vigilar leyendo. */
function aTrozos(...trozos: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const t of trozos) c.enqueue(new TextEncoder().encode(t));
      c.close();
    },
  });
}

async function estadoDe(p: Promise<unknown>): Promise<number | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof FalloApi ? e.estado : -1;
  }
}

describe('leerTexto', () => {
  it('lee el cuerpo entero, con tildes', async () => {
    expect(await leerTexto(peticion('Peñíscola'), 100)).toBe('Peñíscola');
  });

  it('un Content-Length de mas se rechaza sin leer nada (413)', async () => {
    expect(await estadoDe(leerTexto(peticion('x', { 'content-length': '101' }), 100))).toBe(413);
  });

  it('sin Content-Length, se corta en cuanto pasa del limite', async () => {
    expect(await leerTexto(peticion(aTrozos('12345', '67890')), 10)).toBe('1234567890');
    expect(await estadoDe(leerTexto(peticion(aTrozos('12345', '67890', '1')), 10))).toBe(413);
  });
});

describe('leerJson', () => {
  it('JSON valido, o 400', async () => {
    expect(await leerJson(peticion('{"a":1}'), 100)).toEqual({ a: 1 });
    expect(await estadoDe(leerJson(peticion('{a:1}'), 100))).toBe(400);
  });
});
