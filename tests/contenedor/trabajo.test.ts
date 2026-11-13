import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { leerEdicion } from '../../src/comun/edicion';
import type { EstadoTrabajo } from '../../src/comun/procesado';
import { Almacen } from '../../src/contenedor/almacen';
import { trabajar } from '../../src/contenedor/trabajo';
import { crearPasarelaFalsa, type PasarelaFalsa } from './pasarelaFalsa';

// El trabajo entero del contenedor contra una pasarela de mentira: lee el
// video por HTTP, como en Cloudflare, y deja lo que saca por la pasarela.
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const fixture = (nombre: string): string => new URL(`../fixtures/${nombre}`, import.meta.url).pathname;
const carpeta = mkdtempSync(join(tmpdir(), 'futsal-trabajo-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

let pasarela: PasarelaFalsa | null = null;
afterEach(async () => {
  await pasarela?.cerrar();
  pasarela = null;
});

describe.skipIf(!hayFfmpeg && !process.env.CI)('el trabajo del contenedor', () => {
  it('lee el video por rangos y deja las senales, la edicion y la version ligera por partes', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'));
    const estados: EstadoTrabajo[] = [];
    // Partes de 16 KiB para que la version ligera de este video (unos 200 KB) vaya en varias.
    const resumen = await trabajar({
      almacen: new Almacen(pasarela.url),
      tareas: { analisis: true, ligero: true },
      carpeta,
      tamanoParte: 16 * 1024,
      informar: (e) => estados.push(e),
    });

    expect(resumen).toMatchObject({ fragmentos: 2, edicionGuardada: true, avisos: [] });
    const edicion = leerEdicion(pasarela.recibido.edicion);
    expect(edicion?.fragmentos.map((f) => [Math.round(f.desde), Math.round(f.hasta)])).toEqual([
      [0, 20],
      [30, 60],
    ]);
    expect(edicion?.correcciones).toEqual([]);
    expect(pasarela.recibido.senales).toMatchObject({ duracion: 60 });

    const ligero = pasarela.ligero();
    expect(resumen.ligeroBytes).toBe(ligero.length);
    expect(pasarela.recibido.partes.size).toBeGreaterThan(1);
    expect(pasarela.recibido.completada?.map((p) => p.numero)).toEqual([...pasarela.recibido.partes.keys()].sort((a, b) => a - b));
    const fichero = join(carpeta, 'recibido.mp4');
    writeFileSync(fichero, ligero);
    const duracion = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichero], { encoding: 'utf8' }));
    expect(Math.abs(duracion - 60)).toBeLessThanOrEqual(0.1);

    // Las fases en orden: leer, guardar las jugadas y subir lo de los jugadores.
    const fases = [...new Set(estados.map((e) => (e.estado === 'trabajando' ? e.fase : e.estado)))];
    expect(fases).toEqual(['leyendo', 'guardando', 'subiendo']);
  });

  it('si el partido ya tiene edicion, no la pisa: lo del entrenador manda', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { edicionYaExiste: true });
    const resumen = await trabajar({ almacen: new Almacen(pasarela.url), tareas: { analisis: true, ligero: false }, carpeta, tamanoParte: 1024 * 1024, informar: () => undefined });
    expect(resumen).toMatchObject({ fragmentos: 2, edicionGuardada: false, ligeroBytes: null });
    expect(pasarela.recibido.edicion).toBeNull();
    expect(pasarela.recibido.partes.size).toBe(0);
  });

  it('solo la version ligera: ni senales ni edicion', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'));
    const resumen = await trabajar({ almacen: new Almacen(pasarela.url), tareas: { analisis: false, ligero: true }, carpeta, tamanoParte: 1024 * 1024, informar: () => undefined });
    expect(resumen.fragmentos).toBeNull();
    expect(pasarela.recibido.senales).toBeNull();
    expect(resumen.ligeroBytes).toBeGreaterThan(0);
  });

  it('una pasarela que falla un momento (503) se reintenta', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { fallosSenales: 1 });
    await trabajar({ almacen: new Almacen(pasarela.url), tareas: { analisis: true, ligero: false }, carpeta, tamanoParte: 1024 * 1024, informar: () => undefined });
    expect(pasarela.recibido.senales).toMatchObject({ duracion: 60 });
  });
});
