import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { leerEdicion } from '../../src/comun/edicion';
import type { EstadoTrabajo } from '../../src/comun/procesado';
import { crearPasarelaFalsa } from './pasarelaFalsa';

// El programa del contenedor ya compilado, hablando por HTTP como con su
// Durable Object. Solo corre si se le dice que: con CONTENEDOR_PROGRAMA (el
// fichero de `npm run contenedor:compilar`) o con CONTENEDOR_IMAGEN (la imagen
// de contenedor/Dockerfile, que es lo que prueba la CI).
const programa = process.env.CONTENEDOR_PROGRAMA;
const imagen = process.env.CONTENEDOR_IMAGEN;
const fixture = (nombre: string): string => new URL(`../fixtures/${nombre}`, import.meta.url).pathname;
const carpeta = mkdtempSync(join(tmpdir(), 'futsal-programa-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

async function puertoLibre(): Promise<number> {
  const s = createServer();
  await new Promise<void>((listo) => s.listen(0, '127.0.0.1', listo));
  const puerto = (s.address() as { port: number }).port;
  await new Promise<void>((listo) => s.close(() => listo()));
  return puerto;
}

async function esperar<T>(que: () => Promise<T | null>, plazoMs: number): Promise<T> {
  const fin = Date.now() + plazoMs;
  for (;;) {
    const r = await que().catch(() => null);
    if (r !== null) return r;
    if (Date.now() > fin) throw new Error('Se ha acabado el plazo');
    await new Promise((listo) => setTimeout(listo, 250));
  }
}

describe.skipIf(!programa && !imagen)('el programa del contenedor', () => {
  it('arranca, acepta un trabajo, lo hace y lo cuenta', async () => {
    const pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'));
    const puerto = await puertoLibre();
    const entorno = { ALMACEN: pasarela.url, PUERTO: String(puerto), TAMANO_PARTE: String(16 * 1024) };
    const proceso: ChildProcess = imagen
      ? spawn('docker', ['run', '--rm', '--network', 'host', ...Object.entries(entorno).flatMap(([k, v]) => ['-e', `${k}=${v}`]), imagen], { stdio: 'inherit' })
      : spawn('node', [programa!], { env: { ...process.env, ...entorno }, stdio: 'inherit' });
    const base = `http://127.0.0.1:${puerto}`;
    try {
      await esperar(async () => ((await fetch(`${base}/salud`)).ok ? true : null), 60_000);
      expect(await (await fetch(`${base}/trabajo`)).json()).toEqual({ estado: 'libre' });

      const r = await fetch(`${base}/trabajo`, { method: 'POST', body: JSON.stringify({ tareas: { analisis: true, ligero: true } }) });
      expect(r.status).toBe(202);
      // Mientras trabaja no acepta otro.
      expect((await fetch(`${base}/trabajo`, { method: 'POST', body: JSON.stringify({ tareas: { analisis: true, ligero: false } }) })).status).toBe(409);

      const final = await esperar(async () => {
        const e = (await (await fetch(`${base}/trabajo`)).json()) as EstadoTrabajo;
        return e.estado === 'hecho' || e.estado === 'fallo' ? e : null;
      }, 120_000);
      expect(final).toMatchObject({ estado: 'hecho', resumen: { fragmentos: 2, edicionGuardada: true } });
      expect(leerEdicion(pasarela.recibido.edicion)?.fragmentos).toHaveLength(2);

      const fichero = join(carpeta, 'ligero.mp4');
      writeFileSync(fichero, pasarela.ligero());
      const flujos = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', fichero], { encoding: 'utf8' });
      expect(flujos.trim().split('\n')).toEqual(['h264', 'aac']);
    } finally {
      proceso.kill('SIGTERM');
      await pasarela.cerrar();
    }
  }, 180_000);

  it('una peticion sin tareas es un 400', async () => {
    const puerto = await puertoLibre();
    const proceso = imagen
      ? spawn('docker', ['run', '--rm', '--network', 'host', '-e', `PUERTO=${puerto}`, imagen], { stdio: 'inherit' })
      : spawn('node', [programa!], { env: { ...process.env, PUERTO: String(puerto) }, stdio: 'inherit' });
    try {
      const base = `http://127.0.0.1:${puerto}`;
      await esperar(async () => ((await fetch(`${base}/salud`)).ok ? true : null), 60_000);
      expect((await fetch(`${base}/trabajo`, { method: 'POST', body: '{}' })).status).toBe(400);
      expect((await fetch(`${base}/otra`)).status).toBe(404);
    } finally {
      proceso.kill('SIGTERM');
    }
  }, 120_000);
});
