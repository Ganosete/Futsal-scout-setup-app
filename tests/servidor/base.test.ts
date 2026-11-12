import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('D1 y R2 locales', () => {
  it('las migraciones crean las tablas', async () => {
    const { results } = await env.BD.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('partidos', 'partes_subidas') ORDER BY name").all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(['partes_subidas', 'partidos']);
  });

  it('R2 exige partes de al menos 5 MiB, salvo la ultima', async () => {
    const subida = await env.VIDEOS.createMultipartUpload('prueba/minimo');
    const p1 = await subida.uploadPart(1, new Uint8Array(1024));
    const p2 = await subida.uploadPart(2, new Uint8Array(1024));
    await expect(subida.complete([p1, p2])).rejects.toThrow();
    await subida.abort();
  });
});
