import { describe, expect, it } from 'vitest';
import { accionDeTecla, type Tecla } from '../../src/cliente/editor/atajos';
import { Historial } from '../../src/cliente/editor/historial';
import { haTerminado, saltoTodoSeguido } from '../../src/cliente/editor/reproduccion';

describe('Historial', () => {
  it('deshace y rehace en orden', () => {
    const h = new Historial('a');
    h.hacer('b');
    h.hacer('c');
    expect(h.deshacer()).toBe(true);
    expect(h.estado).toBe('b');
    expect(h.rehacer()).toBe(true);
    expect(h.estado).toBe('c');
  });

  it('un cambio nuevo tira lo que se podía rehacer', () => {
    const h = new Historial('a');
    h.hacer('b');
    h.deshacer();
    h.hacer('x');
    expect(h.puedeRehacer).toBe(false);
    expect(h.rehacer()).toBe(false);
    expect(h.estado).toBe('x');
  });

  it('guarda como mucho `maximo` pasos atrás', () => {
    const h = new Historial(0, 2);
    h.hacer(1);
    h.hacer(2);
    h.hacer(3);
    expect(h.deshacer()).toBe(true);
    expect(h.deshacer()).toBe(true);
    expect(h.deshacer()).toBe(false);
    expect(h.estado).toBe(1);
  });
});

describe('saltoTodoSeguido', () => {
  const f = [
    { desde: 10, hasta: 20 },
    { desde: 30, hasta: 40 },
  ];

  it('antes del primero, salta a su inicio', () => {
    expect(saltoTodoSeguido(f, 0)).toBe(10);
  });

  it('dentro de un fragmento, sigue', () => {
    expect(saltoTodoSeguido(f, 15)).toBeNull();
  });

  it('en balón parado, o en los últimos 50 ms, salta al siguiente', () => {
    expect(saltoTodoSeguido(f, 25)).toBe(30);
    expect(saltoTodoSeguido(f, 19.96)).toBe(30);
  });

  it('pasado el último, se para', () => {
    expect(saltoTodoSeguido(f, 39.96)).toBe(Number.POSITIVE_INFINITY);
    expect(saltoTodoSeguido(f, 50)).toBe(Number.POSITIVE_INFINITY);
  });

  it('haTerminado, con la misma holgura', () => {
    expect(haTerminado({ desde: 10, hasta: 20 }, 19.9)).toBe(false);
    expect(haTerminado({ desde: 10, hasta: 20 }, 19.95)).toBe(true);
  });
});

describe('accionDeTecla', () => {
  const tecla = (key: string, mods: Partial<Tecla> = {}): Tecla => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it('las iniciales, en mayúscula o minúscula', () => {
    expect(accionDeTecla(tecla('l'))).toBe('local');
    expect(accionDeTecla(tecla('V', { shiftKey: true }))).toBe('visitante');
    expect(accionDeTecla(tecla('u'))).toBe('unir');
    expect(accionDeTecla(tecla('p'))).toBe('partir');
    expect(accionDeTecla(tecla('i'))).toBe('inicioAqui');
    expect(accionDeTecla(tecla('f'))).toBe('finAqui');
    expect(accionDeTecla(tecla('d'))).toBe('descargar');
    expect(accionDeTecla(tecla('s'))).toBe('estrella');
  });

  it('flechas: con Mayúsculas, el salto fino', () => {
    expect(accionDeTecla(tecla('ArrowLeft'))).toBe('atras');
    expect(accionDeTecla(tecla('ArrowRight', { shiftKey: true }))).toBe('adelanteFino');
    expect(accionDeTecla(tecla('ArrowDown'))).toBe('siguiente');
  });

  it('deshacer y rehacer, con Ctrl o con Cmd', () => {
    expect(accionDeTecla(tecla('z', { ctrlKey: true }))).toBe('deshacer');
    expect(accionDeTecla(tecla('z', { metaKey: true, shiftKey: true }))).toBe('rehacer');
    expect(accionDeTecla(tecla('y', { ctrlKey: true }))).toBe('rehacer');
  });

  it('los atajos del navegador no se tocan', () => {
    expect(accionDeTecla(tecla('l', { ctrlKey: true }))).toBeNull();
    expect(accionDeTecla(tecla('f', { altKey: true }))).toBeNull();
    expect(accionDeTecla(tecla('q'))).toBeNull();
  });
});
