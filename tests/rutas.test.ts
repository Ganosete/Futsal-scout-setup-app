import { describe, expect, it, vi } from 'vitest';
import { crearEnrutador, type Parametros } from '../src/servidor/rutas';
import { json } from '../src/servidor/respuestas';
import { salud } from '../src/servidor/salud';

const BASE = 'https://futsal-scout.test';

function peticion(metodo: string, camino: string): Request {
  return new Request(`${BASE}${camino}`, { method: metodo });
}

describe('crearEnrutador', () => {
  const vistos: Parametros[] = [];
  const enrutar = crearEnrutador([
    { metodo: 'GET', patron: '/api/salud', manejar: salud },
    {
      metodo: 'GET',
      patron: '/api/partidos/:id',
      manejar: (_p, parametros) => {
        vistos.push(parametros);
        return json({ id: parametros.id });
      },
    },
    { metodo: 'DELETE', patron: '/api/partidos/:id', manejar: () => new Response(null, { status: 204 }) },
    {
      metodo: 'POST',
      patron: '/api/roto',
      manejar: () => {
        throw new Error('detalle interno que no debe salir');
      },
    },
  ]);

  it('/api/salud responde ok, con la version y sin cache', async () => {
    const r = await enrutar(peticion('GET', '/api/salud'));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ estado: 'ok', version: 'pruebas' });
  });

  it('la barra final no cuenta', async () => {
    expect((await enrutar(peticion('GET', '/api/salud/'))).status).toBe(200);
  });

  it('los parametros salen decodificados', async () => {
    const r = await enrutar(peticion('GET', '/api/partidos/final%20de%20copa'));
    expect(await r.json()).toEqual({ id: 'final de copa' });
    expect(vistos.at(-1)).toEqual({ id: 'final de copa' });
  });

  it('un HEAD usa el GET y no lleva cuerpo', async () => {
    const r = await enrutar(peticion('HEAD', '/api/salud'));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('');
  });

  it('metodo equivocado: 405 con los permitidos', async () => {
    const r = await enrutar(peticion('POST', '/api/partidos/7'));
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('DELETE, GET, HEAD');
  });

  it('ruta que no existe: 404 en JSON', async () => {
    const r = await enrutar(peticion('GET', '/api/nada'));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'No existe esta ruta de la API.' });
  });

  it('un parametro mal codificado es un 400, no un 500', async () => {
    const r = await enrutar(peticion('GET', '/api/partidos/%E0%A4%A'));
    expect(r.status).toBe(400);
  });

  it('un fallo dentro del manejador da 500 sin contar el detalle', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await enrutar(peticion('POST', '/api/roto'));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('detalle interno');
    expect(consola).toHaveBeenCalledOnce();
    consola.mockRestore();
  });
});
