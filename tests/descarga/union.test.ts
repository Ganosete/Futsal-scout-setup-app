import { readFileSync } from 'node:fs';
import { BufferSource, EncodedPacketSink, Input, MP4 } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { unirMp4 } from '../../src/cliente/descarga/union';

// Unir solo copia paquetes, sin decodificar: se prueba en Node con los videos
// de prueba, como el recorte. analisis.mp4 va a 25 fotogramas por segundo con
// un clave cada segundo justo (0, 1, 2...).
const fixture = (nombre: string): Blob => new Blob([readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url))]);

async function leer(datos: ArrayBuffer) {
  const entrada = new Input({ source: new BufferSource(datos), formats: [MP4] });
  try {
    const video = await entrada.getPrimaryVideoTrack();
    const audio = await entrada.getPrimaryAudioTrack();
    if (!video) throw new Error('sin video');
    // Los claves del resultado, en segundos: cada jugada empieza en uno.
    const claves: number[] = [];
    const sink = new EncodedPacketSink(video);
    for await (const p of sink.packets()) if (p.type === 'key') claves.push(Math.round(p.timestamp * 100) / 100);
    return { duracion: await entrada.computeDuration(), video: await video.getCodec(), audio: (await audio?.getCodec()) ?? null, rotacion: video.rotation, claves };
  } finally {
    entrada.dispose();
  }
}

/** Como en el recorte: nunca mas corto, y como mucho una decima mas por los fotogramas B. */
function dura(duracion: number, esperado: number): void {
  expect(duracion).toBeGreaterThanOrEqual(esperado - 0.005);
  expect(duracion).toBeLessThanOrEqual(esperado + 0.1);
}

describe('unirMp4', () => {
  it('dos jugadas, una detras de otra, cada una desde su fotograma clave', async () => {
    // [2,5; 5) empieza en el clave de 2 s: 3 s. [32,2; 36) en el de 32 s: 4 s. Juntas, 7 s.
    const r = await leer(await unirMp4(fixture('analisis.mp4'), [{ desde: 2.5, hasta: 5 }, { desde: 32.2, hasta: 36 }]));
    dura(r.duracion, 7);
    expect(r.video).toBe('avc');
    expect(r.audio).toBe('aac');
    // La segunda empieza justo donde acaba la primera, a los 3 s, y sigue un clave por segundo.
    expect(r.claves).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('se unen en el orden del partido aunque lleguen desordenadas', async () => {
    const r = await leer(await unirMp4(fixture('analisis.mp4'), [{ desde: 32, hasta: 34 }, { desde: 2, hasta: 3 }]));
    dura(r.duracion, 3);
  });

  it('un fragmento que empieza en un clave no lleva nada de mas al principio', async () => {
    dura((await leer(await unirMp4(fixture('analisis.mp4'), [{ desde: 30, hasta: 60 }]))).duracion, 30);
  });

  it('respeta la rotacion del video', async () => {
    // rotado.mp4 lleva 90 grados en ffmpeg, que en Mediabunny (sentido horario) son 270.
    expect((await leer(await unirMp4(fixture('rotado.mp4'), [{ desde: 0, hasta: 1 }]))).rotacion).toBe(270);
  });

  it('avisa del progreso tramo a tramo, hasta el final', async () => {
    const avances: number[] = [];
    await unirMp4(fixture('analisis.mp4'), [{ desde: 0, hasta: 1 }, { desde: 30, hasta: 31 }], (f) => avances.push(f));
    expect(avances).toEqual([0.5, 1]);
  });

  it('sin fragmentos no hay nada que unir', async () => {
    await expect(unirMp4(fixture('analisis.mp4'), [])).rejects.toThrow('No hay ningún fragmento que unir.');
  });
});
