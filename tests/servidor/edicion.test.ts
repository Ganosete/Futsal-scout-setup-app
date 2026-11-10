import { describe, expect, it } from 'vitest';
import type { Edicion } from '../../src/comun/edicion';
import type { Partido } from '../../src/comun/partido';
import { cliente } from './ayuda';

const EDICION: Edicion = {
  version: 1,
  duracion: 60,
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  fragmentos: [
    { id: 'a', desde: 0, hasta: 19.98, parte: 1, equipo: null, manual: false },
    { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: 'local', manual: true },
  ],
  correcciones: [],
  tramos: [{ desde: 19.98, hasta: 30 }],
};

async function partido() {
  const c = cliente();
  const p = await c.crear();
  const url = `/api/partidos/${p.partido.id}/edicion`;
  const guardar = (e: Edicion, cabeceras: Record<string, string>) => c.llamar('PUT', url, { cuerpo: JSON.stringify(e), cabeceras });
  return { c, id: p.partido.id, url, guardar };
}

describe('las jugadas de un partido', () => {
  it('sin analizar todavia: 404', async () => {
    const { c, url } = await partido();
    expect((await c.llamar('GET', url)).status).toBe(404);
  });

  it('la primera vez se guarda con If-None-Match: *, y se lee igual, con su ETag', async () => {
    const { c, url, guardar, id } = await partido();
    const r = await guardar(EDICION, { 'if-none-match': '*' });
    expect(r.status).toBe(200);
    const etag = r.headers.get('etag');
    expect(etag).toMatch(/^".+"$/);
    const leida = await c.llamar('GET', url);
    expect(leida.headers.get('etag')).toBe(etag);
    expect(await leida.json()).toEqual(EDICION);
    // La lista cuenta los fragmentos y cuando se guardo.
    const p = await (await c.llamar('GET', `/api/partidos/${id}`)).json<Partido>();
    expect(p.fragmentos).toBe(2);
    expect(p.editado).not.toBeNull();
  });

  it('sin decir sobre que version se guarda: 428', async () => {
    const { guardar } = await partido();
    expect((await guardar(EDICION, {})).status).toBe(428);
  });

  it('dos pestanas: la que guarda sobre una version vieja recibe 412 y no pisa nada', async () => {
    const { c, url, guardar } = await partido();
    const primera = (await guardar(EDICION, { 'if-none-match': '*' })).headers.get('etag') ?? '';
    // Otra pestana tambien cree que es la primera vez.
    expect((await guardar(EDICION, { 'if-none-match': '*' })).status).toBe(412);
    const conEquipo = { ...EDICION, fragmentos: [{ ...EDICION.fragmentos[0], equipo: 'visitante' as const, manual: true }, EDICION.fragmentos[1]] };
    const segunda = await guardar(conEquipo, { 'if-match': primera });
    expect(segunda.status).toBe(200);
    // La pestana vieja guarda sobre la primera version.
    const vieja = await guardar(EDICION, { 'if-match': primera });
    expect(vieja.status).toBe(412);
    expect(await vieja.json()).toEqual({ error: 'Las jugadas de este partido han cambiado en otra pestaña: recarga la página para verlas.' });
    expect(await (await c.llamar('GET', url)).json()).toEqual(conEquipo);
    // Con la version buena, si.
    expect((await guardar(EDICION, { 'if-match': segunda.headers.get('etag') ?? '' })).status).toBe(200);
  });

  it('unas jugadas que no valen no se guardan (400)', async () => {
    const { guardar } = await partido();
    const r = await guardar({ ...EDICION, fragmentos: [{ ...EDICION.fragmentos[0], hasta: -1 }] }, { 'if-none-match': '*' });
    expect(r.status).toBe(400);
  });

  it('las senales se guardan tal cual; lo que no lo parece, no', async () => {
    const { c, id } = await partido();
    const senales = { duracion: 60, pitidos: [{ desde: 20, hasta: 20.5, frecuenciaHz: 4000, fuerza: 0.6 }], actividad: [{ segundos: 0, valor: 0.1 }] };
    expect((await c.llamar('PUT', `/api/partidos/${id}/senales`, { cuerpo: JSON.stringify(senales) })).status).toBe(204);
    expect((await c.llamar('PUT', `/api/partidos/${id}/senales`, { cuerpo: '{"duracion":"mucha"}' })).status).toBe(400);
    expect((await c.llamar('PUT', `/api/partidos/${id}/senales`, { cuerpo: 'no es json' })).status).toBe(400);
  });
});
