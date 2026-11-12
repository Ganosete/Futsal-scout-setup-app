// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), tests/balonParadoPorBalon.test.ts.
// Cambios: solo las rutas de los import.
import { describe, expect, it } from 'vitest';
import type { PuntoBalon } from '../../src/nucleo/tipos';
import { buscarReanudacion, salidasDelBalon } from '../../src/nucleo/balonParado/porBalon';

const PISTA = { largo: 40, ancho: 20 };

/**
 * Un tramo recto a 10 Hz, de t0 (incluido) a t1 (excluido), con la velocidad
 * que corresponde a recorrerlo: asi cada caso se lee como «de aqui a alli».
 */
function tramo(t0: number, t1: number, x0: number, y0: number, x1: number, y1: number): PuntoBalon[] {
  const n = Math.round((t1 - t0) * 10);
  const v = Math.hypot(x1 - x0, y1 - y0) / (t1 - t0);
  return Array.from({ length: n }, (_, i) => ({
    segundos: Math.round((t0 + i / 10) * 10) / 10,
    metros: { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n },
    velocidad: v,
    origen: 'medido' as const,
  }));
}

describe('salidasDelBalon', () => {
  it('sale por la banda, se pierde, se coloca en la linea y se saca: de la salida al saque', () => {
    const puntos = [
      ...tramo(0, 5, 20, 10, 20, 19),
      // A 4 m/s hacia fuera: 19 → 21 en medio segundo. Pasa de 20,3 en t = 5,4.
      ...tramo(5, 5.5, 20, 19, 20, 21),
      // No se ve hasta que lo colocan en la linea, quieto, dos segundos.
      ...tramo(12, 14.1, 25, 20, 25, 20),
      ...tramo(14.1, 15, 25, 20, 25, 12),
    ];
    const s = salidasDelBalon(puntos, PISTA);
    expect(s).toEqual([{ desde: 5.4, hasta: 14, reanudacionVista: true }]);
  });

  it('un gol (pasa la linea de meta entre los postes) y el saque desde el centro', () => {
    const puntos = [...tramo(0, 2, 10, 10, 0, 10), ...tramo(2, 2.3, 0, 10, -1.5, 10), ...tramo(30, 31, 20, 10, 20, 10), ...tramo(31, 32, 20, 10, 26, 10)];
    expect(salidasDelBalon(puntos, PISTA)).toEqual([{ desde: 2.1, hasta: 30.9, reanudacionVista: true }]);
  });

  it('un balon que aparece fuera sin venir de dentro (el de repuesto) no es una salida', () => {
    const puntos = [...tramo(0, 10, 10, 10, 30, 10), ...tramo(13, 14, -2, 5, -2, 5), ...tramo(14, 20, 30, 10, 10, 10)];
    expect(salidasDelBalon(puntos, PISTA)).toEqual([]);
  });

  it('pisar el balon dentro de la pista no es salir', () => {
    const puntos = [...tramo(0, 3, 10, 10, 20, 10), ...tramo(3, 5, 20, 10, 20, 10), ...tramo(5, 6, 20, 10, 30, 10)];
    expect(salidasDelBalon(puntos, PISTA)).toEqual([]);
  });

  it('dentro del margen de la calibracion (20,2 m) todavia no ha salido', () => {
    const puntos = [...tramo(0, 1, 20, 18, 20, 20.2), ...tramo(1, 3, 20, 20.2, 20, 12)];
    expect(salidasDelBalon(puntos, PISTA)).toEqual([]);
  });
});

describe('buscarReanudacion', () => {
  it('sin ver el saque, un segundo de balon rapido bien dentro ya es juego', () => {
    const puntos = [...tramo(0, 5, 40.5, 10, 40.5, 10).map((p) => ({ ...p, velocidad: 1.5 })), ...tramo(20, 22.1, 10, 4, 30, 16)];
    expect(buscarReanudacion(puntos, 0, PISTA)).toEqual({ t: 20, vista: false });
  });

  it('quieto solo 0,2 s no es un saque: es un control', () => {
    // Quieto 18,0-18,2, luego rapido hacia la banda contraria pero sin llegar a un segundo bien dentro.
    const puntos = [...tramo(18, 18.3, 20, 0.5, 20, 0.5), ...tramo(18.3, 18.8, 20, 0.5, 20, 6)];
    expect(buscarReanudacion(puntos, 0, PISTA)).toBeNull();
  });

  it('quieto fuera de la zona de saque (2 m fuera, en manos de alguien) no cuenta', () => {
    const puntos = [...tramo(5, 7, 20, 22, 20, 22), ...tramo(7, 7.5, 20, 22, 20, 18)];
    expect(buscarReanudacion(puntos, 0, PISTA)).toBeNull();
  });

  it('pasado el maximo de parada se abandona', () => {
    const puntos = [...tramo(200, 201, 20, 20, 20, 20), ...tramo(201, 202, 20, 20, 20, 10)];
    expect(buscarReanudacion(puntos, 0, PISTA)).toBeNull();
  });
});
