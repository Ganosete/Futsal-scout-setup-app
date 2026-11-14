import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pasada, sondear } from '../../src/contenedor/pasada';
import { analizarSenales } from '../../src/nucleo/analizar';

// La pasada de verdad, con ffmpeg y los videos de prueba. Sin ffmpeg se salta
// en local; en la CI tiene que estar, y alli no se salta.
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const fixture = (nombre: string): string => new URL(`../fixtures/${nombre}`, import.meta.url).pathname;
const temporal = mkdtempSync(join(tmpdir(), 'futsal-pasada-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

function cerca(real: number, esperado: number, tolerancia: number): void {
  expect(Math.abs(real - esperado), `${real} debería estar a menos de ${tolerancia} de ${esperado}`).toBeLessThanOrEqual(tolerancia);
}

async function analizar(nombre: string) {
  const fuente = fixture(nombre);
  const r = await pasada(fuente, await sondear(fuente), { ligero: null });
  return { ...r, resultado: analizarSenales(r.senales, () => 'x') };
}

/** Lo que dice ffprobe de un fichero: los flujos y los instantes de sus fotogramas clave. */
function inspeccionar(fichero: string) {
  const json = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', fichero], { encoding: 'utf8' })) as {
    format: { duration: string; tags?: Record<string, string> };
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; side_data_list?: unknown[] }[];
  };
  const claves = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', fichero], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    // El primero puede llevar una columna vacia de mas (los datos laterales del fotograma).
    .map((linea) => Number(linea.split(',')[0]));
  const video = json.streams.find((s) => s.codec_type === 'video');
  return { duracion: Number(json.format.duration), video, audio: json.streams.find((s) => s.codec_type === 'audio'), claves, etiquetas: json.format.tags ?? {} };
}

/** Las cajas de primer nivel de un MP4, en orden. */
function cajas(fichero: string): string[] {
  const b = readFileSync(fichero);
  const tipos: string[] = [];
  for (let i = 0; i + 8 <= b.length; ) {
    const tamano = b.readUInt32BE(i);
    tipos.push(b.toString('latin1', i + 4, i + 8));
    if (tamano < 8) break;
    i += tamano;
  }
  return tipos;
}

describe.skipIf(!hayFfmpeg && !process.env.CI)('la pasada de ffmpeg', () => {
  it('analisis.mp4: el silbato de 20 a 20,5 s y la imagen quieta hasta 30 s dan [0, 20) y [30, 60), como en el navegador', async () => {
    const { senales, resultado, avisos } = await analizar('analisis.mp4');
    expect(senales.duracion).toBe(60);
    // 60 s a 5 fotogramas por segundo son 300 fotogramas, y 299 comparaciones entre seguidos.
    expect(senales.actividad).toHaveLength(299);
    expect(senales.pitidos).toHaveLength(1);
    // Medido: de 19,981 a 20,515 s; el detector va por ventanas de unas centesimas.
    cerca(senales.pitidos![0].desde, 20, 0.05);
    cerca(senales.pitidos![0].hasta, 20.5, 0.05);
    expect(resultado.fragmentos).toHaveLength(2);
    cerca(resultado.fragmentos[0].desde, 0, 0);
    cerca(resultado.fragmentos[0].hasta, 20, 0.05);
    // La imagen se mira cada 0,2 s: es lo que se puede equivocar el inicio.
    cerca(resultado.fragmentos[1].desde, 30, 0.2);
    cerca(resultado.fragmentos[1].hasta, 60, 0);
    expect(avisos).toEqual([]);
  });

  it('un recorte con lista de edicion: todo cae donde lo ensena el video, no 1,5 s mas tarde', async () => {
    // Recortado desde 5,5 s: el silbato pasa a 14,5 s y la calma acaba en 24,46 s.
    // Medido: silbato desde 14,501 s y el segundo fragmento desde 24,4 s.
    const { senales, resultado } = await analizar('recortado.mp4');
    cerca(senales.pitidos![0].desde, 14.5, 0.05);
    expect(resultado.fragmentos).toHaveLength(2);
    cerca(resultado.fragmentos[0].hasta, 14.5, 0.05);
    cerca(resultado.fragmentos[1].desde, 24.46, 0.2);
    cerca(resultado.fragmentos[1].hasta, 54.5, 0);
  });

  it('sin sonido: sin silbato y el mismo aviso que en el navegador', async () => {
    const { senales, avisos } = await analizar('sin_audio.mp4');
    expect(senales.pitidos).toBeNull();
    expect(avisos).toEqual(['El vídeo no tiene sonido: se ha buscado sin el silbato.']);
  });

  it('la version ligera: H.264 y AAC, la misma duracion, un clave cada 2 s, el indice al principio y sin agrandar', async () => {
    const destino = join(temporal, 'ligero.mp4');
    const fuente = fixture('analisis.mp4');
    const avances: number[] = [];
    await pasada(fuente, await sondear(fuente), { ligero: destino, alAvanzar: (f) => avances.push(f) });
    const v = inspeccionar(destino);
    expect(v.video).toMatchObject({ codec_name: 'h264', width: 192, height: 108 });
    expect(v.audio?.codec_name).toBe('aac');
    cerca(v.duracion, 60, 0.1);
    expect(v.claves.slice(0, 6)).toEqual([0, 2, 4, 6, 8, 10]);
    const orden = cajas(destino);
    expect(orden.indexOf('moov')).toBeLessThan(orden.indexOf('mdat'));
    // El avance llega hasta el final y nunca pasa de 1.
    expect(Math.max(...avances)).toBeGreaterThan(0.9);
    expect(Math.max(...avances)).toBeLessThanOrEqual(1);
  });

  it('un 1080p baja a 720p; un movil girado sale derecho y sin la rotacion en los metadatos', async () => {
    const grande = join(temporal, 'grande.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=25:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', grande]);
    const ligeroGrande = join(temporal, 'ligero-grande.mp4');
    await pasada(grande, await sondear(grande), { ligero: ligeroGrande });
    expect(inspeccionar(ligeroGrande).video).toMatchObject({ width: 1280, height: 720 });

    // rotado.mp4 es un 640 x 360 con 90 grados en los metadatos: se ve en vertical.
    const ligeroGirado = join(temporal, 'ligero-girado.mp4');
    await pasada(fixture('rotado.mp4'), await sondear(fixture('rotado.mp4')), { ligero: ligeroGirado });
    const girado = inspeccionar(ligeroGirado);
    expect(girado.video).toMatchObject({ width: 360, height: 640 });
    expect(girado.video?.side_data_list ?? []).toEqual([]);
  });

  it('un fichero que no es un video falla con lo que dice ffmpeg', async () => {
    await expect(sondear(fixture('detector_prueba.onnx'))).rejects.toThrow();
  });
});
