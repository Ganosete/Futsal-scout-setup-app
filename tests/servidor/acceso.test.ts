import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

// Fuera de localhost y sin Access configurado (en las pruebas, ACCESS_EQUIPO esta vacio).
const pedir = (camino: string): Promise<Response> => exports.default.fetch(new Request(`https://scout.club.es${camino}`));

describe('fuera de localhost, sin Access configurado', () => {
  it('las rutas de partidos no estan disponibles (503): nada queda abierto', async () => {
    const r = await pedir('/api/partidos');
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'Falta configurar Cloudflare Access: la API no está disponible todavía.' });
  });

  it('/api/salud sigue respondiendo: dice que version hay publicada', async () => {
    const r = await pedir('/api/salud');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ estado: 'ok', version: 'pruebas' });
  });

  it('una ruta que no existe sigue siendo 404, sin preguntar quien llama', async () => {
    expect((await pedir('/api/nada')).status).toBe(404);
  });
});
