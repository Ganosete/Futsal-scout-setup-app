import { describe, expect, it } from 'vitest';
import { detalleCompartido, equipoDeJugada, tokenDeLaDireccion } from '../src/cliente/jugadores/textos';
import type { PartidoCompartido } from '../src/comun/compartido';

const P: PartidoCompartido = {
  local: 'Atlético Benavente',
  visitante: 'Peñíscola',
  fecha: '2026-11-08',
  duracion: 60,
  partes: [{ numero: 1, desde: 0, hasta: 60 }],
  jugadas: [
    { id: 'a', desde: 0, hasta: 19.98, parte: 1, equipo: 'local' },
    { id: 'b', desde: 30, hasta: 60, parte: 1, equipo: null },
  ],
};

describe('pagina de los jugadores', () => {
  it('el token sale de /v/<token>, con o sin barra final, y solo si esta bien formado', () => {
    expect(tokenDeLaDireccion('/v/AbCdEfGhIjKlMnOpQrSt-_')).toBe('AbCdEfGhIjKlMnOpQrSt-_');
    expect(tokenDeLaDireccion('/v/AbCdEfGhIjKlMnOpQrSt-_/')).toBe('AbCdEfGhIjKlMnOpQrSt-_');
    expect(tokenDeLaDireccion('/v/corto')).toBeNull();
    expect(tokenDeLaDireccion('/v/')).toBeNull();
    expect(tokenDeLaDireccion('/v/AbCdEfGhIjKlMnOpQrSt-_/otra')).toBeNull();
  });

  it('el detalle: fecha, cuantas jugadas y cuanto juego suman (19,98 + 30 s)', () => {
    expect(detalleCompartido(P)).toBe('8 de noviembre de 2026 · 2 jugadas · 0:50 de juego');
    expect(detalleCompartido({ ...P, jugadas: [P.jugadas[1]] })).toBe('8 de noviembre de 2026 · 1 jugada · 0:30 de juego');
  });

  it('quien ataca, con el nombre del equipo, o nada', () => {
    expect(equipoDeJugada(P.jugadas[0], P)).toBe('Atlético Benavente');
    expect(equipoDeJugada({ ...P.jugadas[0], equipo: 'visitante' }, P)).toBe('Peñíscola');
    expect(equipoDeJugada(P.jugadas[1], P)).toBe('');
  });
});
