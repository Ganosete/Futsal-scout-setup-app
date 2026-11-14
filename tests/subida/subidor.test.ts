import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../../src/cliente/api/api';
import { sePuedeReintentar, subirPartes, type Enviar } from '../../src/cliente/subida/subidor';

/** 250 bytes en partes de 100: la 1 y la 2 de 100 y la 3 de 50. */
const FICHERO = new Blob([new Uint8Array(250).map((_, i) => i)]);
const BASE = { fichero: FICHERO, tamanoParte: 100, yaSubidos: 0, esperar: async () => undefined };

/** Un envio que se resuelve a mano, para ver que pasa mientras hay partes de camino. */
function enviosAMano() {
  const pendientes = new Map<number, { resolver: () => void; rechazar: (e: unknown) => void; senal: AbortSignal; alAvanzar: (b: number) => void }>();
  const recibidos: { numero: number; bytes: number[] }[] = [];
  const enviar: Enviar = async (numero, trozo, alAvanzar, senal) => {
    recibidos.push({ numero, bytes: [...new Uint8Array(await trozo.arrayBuffer())] });
    return new Promise<void>((resolver, rechazar) => {
      pendientes.set(numero, { resolver, rechazar, senal, alAvanzar });
      senal.addEventListener('abort', () => rechazar(new DOMException('parada', 'AbortError')));
    });
  };
  return { enviar, pendientes, recibidos };
}

const esperarTurno = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('subirPartes', () => {
  it('manda cada parte con sus bytes: 100, 100 y la ultima de 50', async () => {
    const recibidos: [number, number, number][] = [];
    const enviar: Enviar = async (numero, trozo) => {
      const b = new Uint8Array(await trozo.arrayBuffer());
      recibidos.push([numero, b.length, b[0]]);
    };
    expect(await subirPartes({ ...BASE, pendientes: [1, 2, 3], enviar }).resultado).toBe('hecha');
    expect(recibidos.sort((a, b) => a[0] - b[0])).toEqual([
      [1, 100, 0],
      [2, 100, 100],
      [3, 50, 200],
    ]);
  });

  it('nunca mas de tres a la vez, y en el orden pedido', async () => {
    const { enviar, pendientes } = enviosAMano();
    const subida = subirPartes({ ...BASE, fichero: new Blob([new Uint8Array(500)]), pendientes: [5, 1, 2, 3, 4], enviar });
    await esperarTurno();
    expect([...pendientes.keys()]).toEqual([5, 1, 2]);
    pendientes.get(1)?.resolver();
    await esperarTurno();
    expect([...pendientes.keys()]).toEqual([5, 1, 2, 3]);
    for (const n of [5, 2, 3]) pendientes.get(n)?.resolver();
    await esperarTurno();
    pendientes.get(4)?.resolver();
    expect(await subida.resultado).toBe('hecha');
  });

  it('el avance cuenta lo que ya estaba, lo terminado y lo que va de camino', async () => {
    const avances: number[] = [];
    const { enviar, pendientes } = enviosAMano();
    const subida = subirPartes({ ...BASE, yaSubidos: 100, pendientes: [2, 3], enviar, alAvanzar: (b) => avances.push(b) });
    await esperarTurno();
    pendientes.get(2)?.alAvanzar(40);
    pendientes.get(3)?.alAvanzar(10);
    expect(avances.at(-1)).toBe(150);
    pendientes.get(2)?.resolver();
    await esperarTurno();
    expect(avances.at(-1)).toBe(210);
    pendientes.get(3)?.resolver();
    await subida.resultado;
    expect(avances.at(-1)).toBe(250);
  });

  it('un corte de red se reintenta esperando 1 s y luego 2 s, y lo enviado del intento fallido no cuenta', async () => {
    const esperas: number[] = [];
    const avances: number[] = [];
    let intentos = 0;
    const enviar: Enviar = async (_n, _t, alAvanzar) => {
      alAvanzar(60);
      if (++intentos < 3) throw new ErrorApi(0, 'sin red');
    };
    const subida = subirPartes({ ...BASE, pendientes: [1], enviar, esperar: async (ms) => void esperas.push(ms), alAvanzar: (b) => avances.push(b) });
    expect(await subida.resultado).toBe('hecha');
    expect(esperas).toEqual([1000, 2000]);
    expect(avances).toEqual([60, 0, 60, 0, 60, 100]);
  });

  it('lo que no se arregla repitiendo (409) para toda la subida, tambien lo que iba de camino', async () => {
    const { enviar, pendientes } = enviosAMano();
    const subida = subirPartes({ ...BASE, pendientes: [1, 2, 3], enviar });
    await esperarTurno();
    pendientes.get(2)?.rechazar(new ErrorApi(409, 'Este vídeo ya está subido.'));
    await expect(subida.resultado).rejects.toThrow('Este vídeo ya está subido.');
    expect(pendientes.get(1)?.senal.aborted).toBe(true);
  });

  it('despues de cinco reintentos, se rinde', async () => {
    let intentos = 0;
    const enviar: Enviar = async () => {
      intentos++;
      throw new ErrorApi(503, 'ocupado');
    };
    await expect(subirPartes({ ...BASE, pendientes: [1], enviar }).resultado).rejects.toThrow('ocupado');
    expect(intentos).toBe(6);
  });

  it('parar corta lo que va de camino y no es un error', async () => {
    const { enviar, pendientes } = enviosAMano();
    const subida = subirPartes({ ...BASE, pendientes: [1, 2, 3], enviar });
    await esperarTurno();
    subida.parar();
    expect(await subida.resultado).toBe('parada');
    expect(pendientes.get(3)?.senal.aborted).toBe(true);
  });

  it('sin nada que subir, hecha al momento', async () => {
    expect(await subirPartes({ ...BASE, pendientes: [], enviar: async () => undefined }).resultado).toBe('hecha');
  });
});

describe('sePuedeReintentar', () => {
  it('la red, los tiempos de espera y el servidor si; lo demas, no', () => {
    expect([0, 408, 429, 500, 503].map((e) => sePuedeReintentar(new ErrorApi(e, '')))).toEqual([true, true, true, true, true]);
    expect([400, 401, 404, 409, 412].map((e) => sePuedeReintentar(new ErrorApi(e, '')))).toEqual([false, false, false, false, false]);
    expect(sePuedeReintentar(new Error('otra cosa'))).toBe(false);
  });
});
