import { readFileSync } from 'node:fs';
import { BufferSource, Input, MP4 } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { recortarMp4 } from '../../src/cliente/descarga/recorte';

// El recorte solo copia paquetes, sin decodificar: corre igual en Node que en
// el navegador, asi que aqui se prueba de verdad con los videos de prueba.
const fixture = (nombre: string): Blob => new Blob([readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url))]);

async function leer(datos: ArrayBuffer): Promise<{ duracion: number; video: string | null; audio: string | null }> {
  const entrada = new Input({ source: new BufferSource(datos), formats: [MP4] });
  try {
    const video = await entrada.getPrimaryVideoTrack();
    const audio = await entrada.getPrimaryAudioTrack();
    return { duracion: await entrada.computeDuration(), video: (await video?.getCodec()) ?? null, audio: (await audio?.getCodec()) ?? null };
  } finally {
    entrada.dispose();
  }
}

/**
 * Nunca mas corto que lo pedido, y como mucho una decima mas largo: sin
 * recodificar, el final puede llevar uno o dos fotogramas de mas por los
 * fotogramas B (20-60 ms medidos con estos videos).
 */
function comoLoPedido(duracion: number, pedido: number): void {
  expect(duracion).toBeGreaterThanOrEqual(pedido - 0.005);
  expect(duracion).toBeLessThanOrEqual(pedido + 0.1);
}

describe('recortarMp4', () => {
  it('un tramo que no empieza en un fotograma clave dura lo pedido', async () => {
    // analisis.mp4 tiene un clave por segundo: 12,5 cae en medio. Sale 2,5 s justos.
    const clip = await leer(await recortarMp4(fixture('analisis.mp4'), 12.5, 15));
    comoLoPedido(clip.duracion, 2.5);
    expect(clip.video).toBe('avc');
    expect(clip.audio).toBe('aac');
  });

  it('un fragmento entero de la prueba de análisis: 30 s', async () => {
    comoLoPedido((await leer(await recortarMp4(fixture('analisis.mp4'), 30, 60))).duracion, 30);
  });

  it('también desde un vídeo que ya trae su propia lista de edición', async () => {
    // Sale 2,02 s: un fotograma B de más al final.
    comoLoPedido((await leer(await recortarMp4(fixture('recortado.mp4'), 10, 12))).duracion, 2);
  });

  it('avisa del progreso hasta el final', async () => {
    const avances: number[] = [];
    await recortarMp4(fixture('analisis.mp4'), 0, 5, (f) => avances.push(f));
    expect(avances.length).toBeGreaterThan(0);
    expect(avances.at(-1)).toBe(1);
  });
});
