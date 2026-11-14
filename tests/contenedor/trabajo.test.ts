import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { leerEdicion } from '../../src/comun/edicion';
import type { EstadoTrabajo, TareasProcesado } from '../../src/comun/procesado';
import { Almacen } from '../../src/contenedor/almacen';
import { trabajar, type OpcionesTrabajo } from '../../src/contenedor/trabajo';
import { leerRegistros } from '../../src/nucleo/equipos/registro';
import { crearPasarelaFalsa, type PasarelaFalsa } from './pasarelaFalsa';

// El trabajo entero del contenedor contra una pasarela de mentira: lee el
// video por HTTP, como en Cloudflare, y deja lo que saca por la pasarela. El
// detector es el de juguete, con onnxruntime-web (el mismo API que el nativo).
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const fixture = (nombre: string): string => new URL(`../fixtures/${nombre}`, import.meta.url).pathname;
const carpeta = mkdtempSync(join(tmpdir(), 'futsal-trabajo-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

let pasarela: PasarelaFalsa | null = null;
afterEach(async () => {
  await pasarela?.cerrar();
  pasarela = null;
});

const TODO: TareasProcesado = { analisis: true, ligero: true, equipos: true };

function opciones(p: PasarelaFalsa, tareas: TareasProcesado, o: Partial<OpcionesTrabajo> = {}): OpcionesTrabajo {
  return { almacen: new Almacen(p.url), tareas, carpeta, tamanoParte: 1024 * 1024, motor: async () => ort, hilos: 1, informar: () => undefined, ...o };
}

/** Lo que vio el detector, tal como lo leera el navegador. */
const detecciones = (p: PasarelaFalsa) => leerRegistros(p.recibido.detecciones);

describe.skipIf(!hayFfmpeg && !process.env.CI)('el trabajo del contenedor', () => {
  it('lee el video por rangos y deja las senales, la edicion, la version ligera por partes y quien ataca', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'));
    const estados: EstadoTrabajo[] = [];
    // Partes de 16 KiB para que la version ligera de este video (unos 200 KB) vaya en varias.
    const resumen = await trabajar(opciones(pasarela, TODO, { tamanoParte: 16 * 1024, informar: (e) => estados.push(e) }));

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

    // Quien ataca, en los dos fragmentos que acaba de guardar: 60 + 90 instantes a 3 por segundo.
    expect(resumen).toMatchObject({ fotogramas: 150, deteccionesGuardadas: true });
    expect(detecciones(pasarela)).toHaveLength(150);
    expect(pasarela.recibido.peticionesModelo).toBe(1);

    // Las fases en orden: leer, guardar las jugadas, subir lo de los jugadores y buscar quien ataca.
    const fases = [...new Set(estados.map((e) => (e.estado === 'trabajando' ? e.fase : e.estado)))];
    expect(fases).toEqual(['leyendo', 'guardando', 'subiendo', 'detectando']);
    const avances = estados.flatMap((e) => (e.estado === 'trabajando' && e.fase === 'detectando' ? [e.avance] : []));
    expect(avances.at(-1)).toBe(1);
  });

  it('si el partido ya tiene edicion, no la pisa: lo del entrenador manda, tambien para buscar quien ataca', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { edicionYaExiste: true });
    const resumen = await trabajar(opciones(pasarela, { analisis: true, ligero: false, equipos: true }));
    expect(resumen).toMatchObject({ fragmentos: 2, edicionGuardada: false, ligeroBytes: null });
    expect(pasarela.recibido.edicion).toBeNull();
    expect(pasarela.recibido.partes.size).toBe(0);
    // Solo en el fragmento que ya tenia (de 5 a 10 s), no en los que ha encontrado el servidor.
    expect(detecciones(pasarela)?.map((r) => r.segundos)).toEqual([5, 5.333, 5.667, 6, 6.333, 6.667, 7, 7.333, 7.667, 8, 8.333, 8.667, 9, 9.333, 9.667]);
  });

  it('si ya se busco quien ataca (en el navegador), no se repite ni se baja el detector', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { deteccionesYaExisten: true });
    const resumen = await trabajar(opciones(pasarela, TODO));
    expect(resumen).toMatchObject({ fragmentos: 2, edicionGuardada: true, fotogramas: null, deteccionesGuardadas: false, avisos: [] });
    expect(pasarela.recibido.peticionesModelo).toBe(0);
  });

  it('solo quien ataca: no se lee el video entero, solo los fragmentos que ya hay', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { edicionYaExiste: true });
    const estados: EstadoTrabajo[] = [];
    const resumen = await trabajar(opciones(pasarela, { analisis: false, ligero: false, equipos: true }, { informar: (e) => estados.push(e) }));
    expect(resumen).toMatchObject({ fragmentos: null, ligeroBytes: null, fotogramas: 15, deteccionesGuardadas: true });
    expect(pasarela.recibido.senales).toBeNull();
    // Sin la pasada no hay avance de lectura: de sondear el video se pasa a buscar.
    expect(estados.filter((e) => e.estado === 'trabajando' && e.fase === 'leyendo').map((e) => e.estado === 'trabajando' && e.avance)).toEqual([0]);
  });

  it('si el detector no es el del manifiesto, lo demas vale igual: se avisa y se busca en el navegador', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { modeloCambiado: true });
    const consola = console.error;
    console.error = () => undefined;
    const resumen = await trabajar(opciones(pasarela, TODO));
    console.error = consola;
    expect(resumen).toMatchObject({ fragmentos: 2, edicionGuardada: true, fotogramas: null, deteccionesGuardadas: false });
    expect(resumen.avisos).toEqual(['No se ha podido buscar quién ataca en el servidor: búscalo desde el partido.']);
    expect(pasarela.recibido.detecciones).toBeNull();
  });

  it('solo la version ligera: ni senales ni edicion', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'));
    const resumen = await trabajar(opciones(pasarela, { analisis: false, ligero: true, equipos: false }));
    expect(resumen.fragmentos).toBeNull();
    expect(pasarela.recibido.senales).toBeNull();
    expect(resumen.ligeroBytes).toBeGreaterThan(0);
  });

  it('una pasarela que falla un momento (503) se reintenta', async () => {
    pasarela = await crearPasarelaFalsa(fixture('analisis.mp4'), { fallosSenales: 1 });
    await trabajar(opciones(pasarela, { analisis: true, ligero: false, equipos: false }));
    expect(pasarela.recibido.senales).toMatchObject({ duracion: 60 });
  });
});
