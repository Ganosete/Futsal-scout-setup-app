import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../../src/cliente/api/api';
import { Guardado, type EstadoGuardado } from '../../src/cliente/editor/guardado';

interface Llamada {
  datos: string;
  etag: string | null;
  resolver: (etag: string) => void;
  rechazar: (e: unknown) => void;
}

function preparar(etag: string | null = null) {
  const llamadas: Llamada[] = [];
  const estados: EstadoGuardado['tipo'][] = [];
  const g = new Guardado<string>({
    etag,
    esperaMs: 1000,
    reintentoMs: 5000,
    alCambiar: (e) => estados.push(e.tipo),
    guardar: (datos, etagActual) => new Promise((resolver, rechazar) => llamadas.push({ datos, etag: etagActual, resolver, rechazar })),
  });
  return { g, llamadas, estados };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Guardado', () => {
  it('varios cambios seguidos se guardan una sola vez, el ultimo, tras un segundo de calma', async () => {
    const { g, llamadas } = preparar();
    g.cambiar('a');
    await vi.advanceTimersByTimeAsync(500);
    g.cambiar('b');
    await vi.advanceTimersByTimeAsync(999);
    expect(llamadas).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(llamadas.map((l) => l.datos)).toEqual(['b']);
  });

  it('cada guardado va sobre la version que devolvio el anterior', async () => {
    const { g, llamadas, estados } = preparar(null);
    g.cambiar('a');
    await vi.advanceTimersByTimeAsync(1000);
    llamadas[0].resolver('"v1"');
    await vi.advanceTimersByTimeAsync(0);
    g.cambiar('b');
    await vi.advanceTimersByTimeAsync(1000);
    expect(llamadas.map((l) => l.etag)).toEqual([null, '"v1"']);
    llamadas[1].resolver('"v2"');
    await vi.advanceTimersByTimeAsync(0);
    expect(estados).toEqual(['pendiente', 'guardando', 'guardado', 'pendiente', 'guardando', 'guardado']);
    expect(g.pendiente).toBe(false);
  });

  it('de uno en uno: lo que cambia mientras se guarda sale justo despues', async () => {
    const { g, llamadas } = preparar('"v0"');
    g.cambiar('a');
    await vi.advanceTimersByTimeAsync(1000);
    g.cambiar('b');
    g.cambiar('c');
    await vi.advanceTimersByTimeAsync(1000);
    expect(llamadas).toHaveLength(1);
    expect(g.pendiente).toBe(true);
    llamadas[0].resolver('"v1"');
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas.map((l) => [l.datos, l.etag])).toEqual([
      ['a', '"v0"'],
      ['c', '"v1"'],
    ]);
  });

  it('un corte de red se reintenta solo a los 5 s', async () => {
    const { g, llamadas, estados } = preparar('"v0"');
    g.cambiar('a');
    await vi.advanceTimersByTimeAsync(1000);
    llamadas[0].rechazar(new ErrorApi(0, 'sin red'));
    await vi.advanceTimersByTimeAsync(4999);
    expect(llamadas).toHaveLength(1);
    expect(estados.at(-1)).toBe('reintentando');
    await vi.advanceTimersByTimeAsync(1);
    expect(llamadas.map((l) => [l.datos, l.etag])).toEqual([
      ['a', '"v0"'],
      ['a', '"v0"'],
    ]);
  });

  it('si otra pestana guardo antes (412), deja de guardar: seguir pisaria lo suyo', async () => {
    const { g, llamadas, estados } = preparar('"v0"');
    g.cambiar('a');
    await vi.advanceTimersByTimeAsync(1000);
    llamadas[0].rechazar(new ErrorApi(412, 'Las jugadas han cambiado en otra pestaña.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(estados.at(-1)).toBe('parado');
    g.cambiar('b');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(llamadas).toHaveLength(1);
    expect(g.pendiente).toBe(false);
  });

  it('guardarYa no espera la calma y vacia tambien lo que cambio mientras', async () => {
    const { g, llamadas } = preparar('"v0"');
    g.cambiar('a');
    const hecho = g.guardarYa();
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas.map((l) => l.datos)).toEqual(['a']);
    g.cambiar('b');
    llamadas[0].resolver('"v1"');
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas.map((l) => l.datos)).toEqual(['a', 'b']);
    llamadas[1].resolver('"v2"');
    await hecho;
    expect(g.pendiente).toBe(false);
  });

  it('parado, no guarda nada mas', async () => {
    const { g, llamadas } = preparar();
    g.cambiar('a');
    g.parar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(llamadas).toHaveLength(0);
  });
});
