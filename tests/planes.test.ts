import { describe, expect, it } from 'vitest';
import { esIdPlan, fechaDeBorrado, limiteDeRetencion, motivoParaNoCambiar, motivoParaNoSubir, plan } from '../src/comun/planes';

const GB = 1024 ** 3;

describe('los planes', () => {
  it('un plan que no se conoce es el gratuito', () => {
    expect(plan('scout').nombre).toBe('Scout');
    expect(plan('platino').id).toBe('gratuito');
    expect(plan(null).id).toBe('gratuito');
    expect(esIdPlan('pro')).toBe(true);
    expect(esIdPlan('platino')).toBe(false);
  });
});

describe('motivoParaNoSubir', () => {
  it('el gratuito deja 3 partidos: el cuarto no', () => {
    expect(motivoParaNoSubir(plan('gratuito'), { partidos: 2, bytes: 0 }, GB)).toBeNull();
    expect(motivoParaNoSubir(plan('gratuito'), { partidos: 3, bytes: 0 }, GB)).toBe('Tu plan Gratuito llega a 3 partidos: borra alguno o cambia de plan.');
  });

  it('ni un video que haga pasar de los 10 GB', () => {
    // Con 8 GB usados, uno de 3 GB pasaria a 11.
    expect(motivoParaNoSubir(plan('gratuito'), { partidos: 1, bytes: 8 * GB }, 3 * GB)).toBe(
      'Este vídeo (3,0 GB) no cabe en tu plan Gratuito: usas 8,0 GB de 10,0 GB. Borra algún partido o cambia de plan.',
    );
    expect(motivoParaNoSubir(plan('gratuito'), { partidos: 1, bytes: 8 * GB }, 2 * GB)).toBeNull();
  });

  it('el Pro no tiene limite de partidos, solo de almacenamiento', () => {
    expect(motivoParaNoSubir(plan('pro'), { partidos: 1000, bytes: 0 }, GB)).toBeNull();
  });
});

describe('motivoParaNoCambiar', () => {
  it('para bajar de plan, lo guardado tiene que caber en el nuevo', () => {
    expect(motivoParaNoCambiar(plan('gratuito'), { partidos: 5, bytes: GB })).toBe('Para pasar a Gratuito deja como mucho 3 partidos: ahora tienes 5.');
    expect(motivoParaNoCambiar(plan('gratuito'), { partidos: 2, bytes: 12 * GB })).toBe('Para pasar a Gratuito tienes que bajar de 10,0 GB: ahora usas 12,0 GB.');
    expect(motivoParaNoCambiar(plan('gratuito'), { partidos: 3, bytes: 10 * GB })).toBeNull();
    expect(motivoParaNoCambiar(plan('scout'), { partidos: 3, bytes: 10 * GB })).toBeNull();
  });
});

describe('fechaDeBorrado', () => {
  it('el gratuito guarda 30 dias, el Scout un año y el Pro no borra', () => {
    expect(fechaDeBorrado('2026-11-01T10:00:00.000Z', null, plan('gratuito'))).toBe('2026-12-01T10:00:00.000Z');
    expect(fechaDeBorrado('2026-11-01T10:00:00.000Z', null, plan('scout'))).toBe('2027-11-01T10:00:00.000Z');
    expect(fechaDeBorrado('2026-11-01T10:00:00.000Z', null, plan('pro'))).toBeNull();
  });

  it('al cambiar de plan los dias vuelven a contar desde el cambio', () => {
    // Subido el 1 de marzo con el Scout; el 20 de noviembre pasa al gratuito: 30 dias desde ese dia.
    expect(fechaDeBorrado('2026-03-01T10:00:00.000Z', '2026-11-20T08:00:00.000Z', plan('gratuito'))).toBe('2026-12-20T08:00:00.000Z');
    // Un partido subido despues del cambio cuenta desde su subida.
    expect(fechaDeBorrado('2026-11-25T10:00:00.000Z', '2026-11-20T08:00:00.000Z', plan('gratuito'))).toBe('2026-12-25T10:00:00.000Z');
  });
});

describe('limiteDeRetencion', () => {
  it('es la misma cuenta al reves: lo que empezo a contar hasta ese instante ya toca borrarlo', () => {
    const ahora = new Date('2026-12-01T10:00:00.000Z');
    expect(limiteDeRetencion(plan('gratuito'), ahora)).toBe('2026-11-01T10:00:00.000Z');
    expect(fechaDeBorrado('2026-11-01T10:00:00.000Z', null, plan('gratuito'))).toBe(ahora.toISOString());
    expect(limiteDeRetencion(plan('scout'), ahora)).toBe('2025-12-01T10:00:00.000Z');
    expect(limiteDeRetencion(plan('pro'), ahora)).toBeNull();
  });
});
