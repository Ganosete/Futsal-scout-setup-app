import { describe, expect, it } from 'vitest';
import { bytesSubidos, numeroPartes, partesQueFaltan, rangoParte } from '../src/comun/partesSubida';

const MIB = 1024 * 1024;

describe('partes de la subida', () => {
  it('un video de 120 MiB en partes de 50 MiB son tres: 50, 50 y 20', () => {
    expect(numeroPartes(120 * MIB, 50 * MIB)).toBe(3);
    expect(rangoParte(1, 120 * MIB, 50 * MIB)).toEqual({ desde: 0, hasta: 50 * MIB });
    expect(rangoParte(3, 120 * MIB, 50 * MIB)).toEqual({ desde: 100 * MIB, hasta: 120 * MIB });
  });

  it('justo 100 MiB son dos partes enteras, no tres', () => {
    expect(numeroPartes(100 * MIB, 50 * MIB)).toBe(2);
    expect(rangoParte(2, 100 * MIB, 50 * MIB)).toEqual({ desde: 50 * MIB, hasta: 100 * MIB });
  });

  it('un video mas pequeno que una parte va en una sola', () => {
    expect(numeroPartes(300_000, 50 * MIB)).toBe(1);
    expect(rangoParte(1, 300_000, 50 * MIB)).toEqual({ desde: 0, hasta: 300_000 });
  });

  it('lo subido suma lo que mide cada parte, la ultima con su tamano real', () => {
    expect(bytesSubidos([1, 3], 120 * MIB, 50 * MIB)).toBe(70 * MIB);
    expect(bytesSubidos([], 120 * MIB, 50 * MIB)).toBe(0);
  });

  it('las que faltan, en orden', () => {
    expect(partesQueFaltan([2], 120 * MIB, 50 * MIB)).toEqual([1, 3]);
    expect(partesQueFaltan([3, 1, 2], 120 * MIB, 50 * MIB)).toEqual([]);
  });
});
