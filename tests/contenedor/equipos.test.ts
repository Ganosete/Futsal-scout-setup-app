import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLASES_COCO } from '../../src/comun/modelos';
import { buscarEquipos } from '../../src/contenedor/equipos';
import { cargarDetector, type Detector } from '../../src/contenedor/onnx';
import { sondear } from '../../src/contenedor/pasada';
import type { RegistroFotograma } from '../../src/nucleo/equipos/registro';

// «Quién ataca» en el contenedor, con ffmpeg de verdad y el detector de
// juguete (tools/crear_modelo_prueba.py) sobre onnxruntime-web, que tiene el
// mismo API que el nativo de la imagen. El de juguete ve siempre lo mismo, en
// proporciones del fotograma: dos jugadores (x de 0,25 a 0,35 y de 0,65 a
// 0,75; y de 0,30 a 0,70) y el balon a los pies del de la izquierda.
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const fixture = (nombre: string): string => new URL(`../fixtures/${nombre}`, import.meta.url).pathname;
const temporal = mkdtempSync(join(tmpdir(), 'futsal-equipos-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

let detector: Detector;
beforeAll(async () => {
  detector = await cargarDetector(ort, new Uint8Array(readFileSync(fixture('detector_prueba.onnx'))), 384, 1);
});
afterAll(() => detector?.cerrar());

async function buscar(fuente: string, tramos: { desde: number; hasta: number }[]): Promise<{ registros: RegistroFotograma[]; avances: number[] }> {
  const avances: number[] = [];
  const registros = await buscarEquipos({ fuente, sondeo: await sondear(fuente), tramos, detector, entrada: 384, clases: CLASES_COCO, alAvanzar: (a) => avances.push(a) });
  return { registros, avances };
}

describe.skipIf(!hayFfmpeg && !process.env.CI)('quien ataca en el contenedor', () => {
  it('mira solo los fragmentos, a 3 por segundo, y guarda las cajas en pixeles del fotograma', async () => {
    const { registros, avances } = await buscar(fixture('analisis.mp4'), [
      { desde: 30, hasta: 60 },
      { desde: 0, hasta: 19.981 },
    ]);
    // [0, 19,981) son 60 instantes y [30, 60), 90: en orden, aunque se pidan desordenados.
    expect(registros).toHaveLength(150);
    expect(registros.slice(0, 3).map((r) => r.segundos)).toEqual([0, 0.333, 0.667]);
    expect(registros.slice(59, 61).map((r) => r.segundos)).toEqual([19.667, 30]);
    expect(registros.at(-1)?.segundos).toBe(59.667);
    expect(avances.at(-1)).toBe(1);

    // En 192 x 108: el balon de 0,29 a 0,31 de ancho y de 0,675 a 0,705 de alto.
    expect(registros[0].balon).toEqual({ x: 55.7, y: 72.9, w: 3.8, h: 3.2 });
    // El de la izquierda, con el balon a los pies, va primero.
    expect(registros[0].personas.map((p) => p.caja)).toEqual([
      { x: 48, y: 32.4, w: 19.2, h: 43.2 },
      { x: 124.8, y: 32.4, w: 19.2, h: 43.2 },
    ]);
  }, 60_000);

  it('el color de cada camiseta sale de la imagen grande: roja la de la izquierda y azul la de la derecha', async () => {
    // Suelo verde y, donde el de juguete ve a cada jugador, una camiseta: la banda que se mide va
    // de 0,27 a 0,33 del ancho (172,8 a 211,2 px) y de 0,36 a 0,50 del alto (129,6 a 180 px).
    const video = join(temporal, 'camisetas.mp4');
    const cajas = ['drawbox=x=160:y=120:w=64:h=70:color=0xDC3C14:t=fill', 'drawbox=x=416:y=120:w=64:h=70:color=0x143CDC:t=fill'];
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x288C28:s=640x360:r=25:d=2', '-vf', cajas.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    const { registros } = await buscar(video, [{ desde: 0, hasta: 1 }]);
    expect(registros).toHaveLength(3);
    // Rojo anaranjado (12 grados): cubo de tono 0. Azul (228 grados): cubo 7, de 210 a 240.
    const cubos = registros[0].personas.map((p) => p.descriptor?.indexOf(Math.max(...(p.descriptor ?? []))));
    expect(cubos).toEqual([0, 7]);
    for (const p of registros[0].personas) expect(Math.max(...(p.descriptor ?? []))).toBeGreaterThan(0.9);
  }, 60_000);

  it('con rotacion, las cajas van en el fotograma tal como se ve (360 x 640)', async () => {
    const { registros } = await buscar(fixture('rotado.mp4'), [{ desde: 0, hasta: 3 }]);
    expect(registros).toHaveLength(9);
    expect(registros[0].balon).toEqual({ x: 104.4, y: 432, w: 7.2, h: 19.2 });
  }, 60_000);

  it('un fragmento que pasa del final da los fotogramas que haya, sin fallar', async () => {
    // partido_corto.mp4 dura 3 s: de [2, 10) solo hay [2, 3).
    const { registros, avances } = await buscar(fixture('partido_corto.mp4'), [{ desde: 2, hasta: 10 }]);
    expect(registros.map((r) => r.segundos)).toEqual([2, 2.333, 2.667]);
    expect(avances.at(-1)).toBe(3 / 24);
  }, 60_000);

  it('si ffmpeg no puede leer el video, falla contando por que', async () => {
    const sondeo = await sondear(fixture('partido_corto.mp4'));
    await expect(
      buscarEquipos({ fuente: join(temporal, 'no-existe.mp4'), sondeo, tramos: [{ desde: 0, hasta: 1 }], detector, entrada: 384, clases: CLASES_COCO }),
    // El codigo cambia con la version de ffmpeg (1 en la 5 de Debian, 254 en la 6): lo que importa es el motivo.
    ).rejects.toThrow(/ffmpeg ha acabado con el código \d+: .*no-existe\.mp4/);
  });
});
