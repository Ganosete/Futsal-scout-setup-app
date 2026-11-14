import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { EstadoTrabajo } from '../../src/comun/procesado';
import { leerProcesado } from '../../src/servidor/procesado/almacen';
import { cancelar, empezar, PLAZOS, vigilar, type Contenedor, type Memoria, type TrabajoEnMarcha } from '../../src/servidor/procesado/orquesta';
import { cliente } from './ayuda';

/**
 * Lo que hace el Durable Object con su contenedor, con un contenedor de
 * mentira y la memoria en un objeto. D1 es la de verdad: lo que se apunta
 * ahi es lo que ve la pagina.
 */

class ContenedorFalso implements Contenedor {
  disponible = true;
  enMarcha = false;
  arranques = 0;
  paradas = 0;
  /** Lo que contesta cada ruta; un Error es que no contesta. */
  respuestas = new Map<string, Response | Error>();
  peticiones: string[] = [];

  async arrancar(): Promise<void> {
    this.arranques++;
    this.enMarcha = true;
  }

  async pedir(ruta: string, init?: RequestInit): Promise<Response> {
    const clave = `${init?.method ?? 'GET'} ${ruta}`;
    this.peticiones.push(clave);
    const r = this.respuestas.get(clave);
    if (!r || r instanceof Error) throw r ?? new Error('sin respuesta');
    return r.clone();
  }

  async parar(): Promise<void> {
    this.paradas++;
    this.enMarcha = false;
  }

  contesta(ruta: string, cuerpo: unknown, estado = 200): void {
    this.respuestas.set(ruta, Response.json(cuerpo, { status: estado }));
  }

  trabajo(e: EstadoTrabajo): void {
    this.contesta('GET /trabajo', e);
  }
}

class MemoriaFalsa implements Memoria {
  t: TrabajoEnMarcha | null = null;
  alarma: number | null = null;
  async leer() {
    return this.t;
  }
  async guardar(t: TrabajoEnMarcha) {
    this.t = t;
  }
  async olvidar() {
    this.t = null;
    this.alarma = null;
  }
  async despertarEn(ms: number) {
    this.alarma = ms;
  }
}

const TAREAS = { analisis: true, ligero: true, equipos: true };

/** Un partido de verdad (la fila de procesados va atada a el) y el procesado ya empezado. */
async function empezado(t0 = Date.now()) {
  const c = cliente();
  const { partido } = await c.crear();
  const contenedor = new ContenedorFalso();
  const memoria = new MemoriaFalsa();
  expect(await empezar(contenedor, memoria, env.BD, { partido: partido.id, dueno: c.dueno, tareas: TAREAS }, t0)).toBe('empezado');
  const procesado = async () => leerProcesado(env.BD, partido.id);
  return { id: partido.id, contenedor, memoria, procesado, t0 };
}

/** Del arranque a trabajando: contesta /salud y acepta el trabajo. */
async function trabajando(t0 = Date.now()) {
  const e = await empezado(t0);
  e.contenedor.contesta('GET /salud', { estado: 'ok' });
  e.contenedor.contesta('POST /trabajo', { estado: 'trabajando' }, 202);
  await vigilar(e.contenedor, e.memoria, env.BD, t0 + 2_000);
  return e;
}

describe('empezar', () => {
  it('apunta el partido como esperando, arranca el contenedor y vuelve en 2 s', async () => {
    const { contenedor, memoria, procesado } = await empezado();
    expect(contenedor.arranques).toBe(1);
    expect(memoria.t).toMatchObject({ fase: 'arrancando', arranques: 1, tareas: TAREAS });
    expect(memoria.alarma).toBe(PLAZOS.sondeoArranque);
    expect(await procesado()).toMatchObject({ estado: 'esperando', analisis: 1, ligero: 1 });
  });

  it('dos veces seguidas no arranca dos contenedores; sin contenedores, no se puede', async () => {
    const e = await empezado();
    expect(await empezar(e.contenedor, e.memoria, env.BD, { partido: e.id, dueno: 'x@localhost', tareas: TAREAS }, Date.now())).toBe('ya-estaba');
    expect(e.contenedor.arranques).toBe(1);
    const sin = new ContenedorFalso();
    sin.disponible = false;
    expect(await empezar(sin, new MemoriaFalsa(), env.BD, { partido: e.id, dueno: 'x@localhost', tareas: TAREAS }, Date.now())).toBe('no-disponible');
  });
});

describe('vigilar', () => {
  it('mientras arranca vuelve a mirar en 2 s; cuando contesta le pasa el trabajo y pregunta cada 15 s', async () => {
    const e = await empezado();
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 2_000);
    expect(e.memoria.alarma).toBe(PLAZOS.sondeoArranque);
    expect(e.memoria.t?.fase).toBe('arrancando');

    e.contenedor.contesta('GET /salud', { estado: 'ok' });
    e.contenedor.contesta('POST /trabajo', { estado: 'trabajando' }, 202);
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 4_000);
    expect(e.memoria.t?.fase).toBe('trabajando');
    expect(e.memoria.alarma).toBe(PLAZOS.sondeo);
    expect(await e.procesado()).toMatchObject({ estado: 'trabajando', fase: 'leyendo', avance: 0 });
  });

  it('apunta la fase y el avance de cada pregunta', async () => {
    const e = await trabajando();
    e.contenedor.trabajo({ estado: 'trabajando', fase: 'subiendo', avance: 0.5 });
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 20_000);
    expect(await e.procesado()).toMatchObject({ estado: 'trabajando', fase: 'subiendo', avance: 0.5 });
  });

  it('hecho: lo apunta con los avisos del analisis, para el contenedor y se olvida', async () => {
    const e = await trabajando();
    e.contenedor.trabajo({
      estado: 'hecho',
      resumen: { fragmentos: 2, edicionGuardada: true, ligeroBytes: 1000, fotogramas: 150, deteccionesGuardadas: true, avisos: ['El vídeo no tiene sonido: se ha buscado sin el silbato.'] },
    });
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 20_000);
    expect(await e.procesado()).toMatchObject({ estado: 'hecho', avance: 1, mensaje: 'El vídeo no tiene sonido: se ha buscado sin el silbato.' });
    expect(e.contenedor.paradas).toBe(1);
    expect(e.memoria.t).toBeNull();
    expect(e.memoria.alarma).toBeNull();
  });

  it('un fallo del trabajo se le cuenta al entrenador sin los detalles de ffmpeg', async () => {
    const e = await trabajando();
    e.contenedor.trabajo({ estado: 'fallo', mensaje: 'ffmpeg ha acabado con el código 1: moov atom not found' });
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 20_000);
    expect(await e.procesado()).toMatchObject({ estado: 'fallo', mensaje: 'No se ha podido procesar el vídeo en el servidor.' });
    expect(e.contenedor.enMarcha).toBe(false);
  });

  it('un contenedor que se para se arranca otra vez; si se para de nuevo, el partido queda en fallo', async () => {
    const e = await trabajando();
    e.contenedor.enMarcha = false;
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 20_000);
    expect(e.contenedor.arranques).toBe(2);
    expect(e.memoria.t).toMatchObject({ fase: 'arrancando', arranques: 2 });
    expect(await e.procesado()).toMatchObject({ estado: 'esperando' });

    e.contenedor.enMarcha = false;
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 40_000);
    expect(await e.procesado()).toMatchObject({ estado: 'fallo', mensaje: 'El servidor no ha podido acabar con este vídeo: vuelve a probar en un rato.' });
    expect(e.memoria.t).toBeNull();
  });

  it('cuatro preguntas sin respuesta (un minuto) es un contenedor caido; menos, no', async () => {
    const e = await trabajando();
    e.contenedor.respuestas.set('GET /trabajo', new Error('no contesta'));
    for (let i = 1; i < PLAZOS.sinRespuesta; i++) await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 15_000 * i);
    expect(e.contenedor.arranques).toBe(1);
    expect(e.memoria.t?.sinRespuesta).toBe(PLAZOS.sinRespuesta - 1);
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 60_000);
    expect(e.contenedor.arranques).toBe(2);
  });

  it('libre: se ha reiniciado y ha perdido el trabajo, asi que se arranca otra vez', async () => {
    const e = await trabajando();
    e.contenedor.trabajo({ estado: 'libre' });
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + 20_000);
    expect(e.contenedor.arranques).toBe(2);
  });

  it('si no arranca en tres minutos se reintenta, y pasadas seis horas se deja', async () => {
    const e = await empezado();
    await vigilar(e.contenedor, e.memoria, env.BD, e.t0 + PLAZOS.arranque + 1_000);
    expect(e.contenedor.arranques).toBe(2);

    const largo = await trabajando();
    largo.contenedor.trabajo({ estado: 'trabajando', fase: 'leyendo', avance: 0.1 });
    await vigilar(largo.contenedor, largo.memoria, env.BD, largo.t0 + PLAZOS.total + 1);
    expect(await largo.procesado()).toMatchObject({ estado: 'fallo', mensaje: 'El servidor ha tardado demasiado con este vídeo: vuelve a probar.' });
  });

  it('sin trabajo en marcha, la alarma no hace nada', async () => {
    const contenedor = new ContenedorFalso();
    await vigilar(contenedor, new MemoriaFalsa(), env.BD, Date.now());
    expect(contenedor.peticiones).toEqual([]);
  });
});

describe('cancelar', () => {
  it('para el contenedor y olvida el trabajo', async () => {
    const e = await trabajando();
    await cancelar(e.contenedor, e.memoria);
    expect(e.contenedor.enMarcha).toBe(false);
    expect(e.memoria.t).toBeNull();
  });
});
