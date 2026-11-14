import type { EstadoTrabajo, TareasProcesado } from '../../comun/procesado';
import { apuntarProcesado, empezarProcesado, type CambioProcesado } from './almacen';

/**
 * Lo que hace el Durable Object con su contenedor, sin el Durable Object: asi
 * se prueba con un contenedor de mentira. Arranca el contenedor, le pasa el
 * trabajo cuando contesta y luego le pregunta cada poco en que va (con una
 * alarma), lo apunta en D1 y lo para al acabar. Un contenedor que se cae se
 * vuelve a arrancar una vez; la segunda, el partido se queda en fallo y el
 * entrenador puede reintentarlo.
 */

/** El contenedor del Durable Object, con lo justo. */
export interface Contenedor {
  /** False si este Worker no tiene contenedores (en local, sin Docker). */
  readonly disponible: boolean;
  readonly enMarcha: boolean;
  /** Prepara la pasarela de ese partido y lo arranca, sin esperar a que conteste. */
  arrancar(partido: string, dueno: string): Promise<void>;
  /** Una peticion al programa del contenedor (src/contenedor/principal.ts). */
  pedir(ruta: string, init?: RequestInit): Promise<Response>;
  parar(): Promise<void>;
}

/** Lo que el Durable Object recuerda del trabajo en marcha, y su alarma. */
export interface Memoria {
  leer(): Promise<TrabajoEnMarcha | null>;
  guardar(t: TrabajoEnMarcha): Promise<void>;
  olvidar(): Promise<void>;
  despertarEn(ms: number): Promise<void>;
}

export interface TrabajoEnMarcha {
  partido: string;
  dueno: string;
  tareas: TareasProcesado;
  fase: 'arrancando' | 'trabajando';
  /** Milisegundos desde 1970. */
  empezado: number;
  arrancado: number;
  arranques: number;
  /** Preguntas seguidas sin respuesta del contenedor. */
  sinRespuesta: number;
}

export const PLAZOS = {
  /** Mientras arranca se pregunta a menudo: tarda segundos. */
  sondeoArranque: 2_000,
  /** Luego, cada 15 s: tambien es lo que lo mantiene despierto. */
  sondeo: 15_000,
  arranque: 3 * 60_000,
  /** Un 4K de dos horas tarda unos 40 minutos, y quien ataca otra media hora; seis horas es que algo va mal. */
  total: 6 * 3600_000,
  /** Un minuto sin contestar (4 preguntas) es un contenedor caido. */
  sinRespuesta: 4,
  arranques: 2,
} as const;

export type ResultadoEmpezar = 'empezado' | 'ya-estaba' | 'no-disponible';

const iso = (ms: number): string => new Date(ms).toISOString();

export async function empezar(
  c: Contenedor,
  m: Memoria,
  bd: D1Database,
  p: { partido: string; dueno: string; tareas: TareasProcesado },
  ahora: number,
): Promise<ResultadoEmpezar> {
  if (!c.disponible) return 'no-disponible';
  if (await m.leer()) return 'ya-estaba';
  await empezarProcesado(bd, p.partido, p.tareas, iso(ahora));
  await c.arrancar(p.partido, p.dueno);
  await m.guardar({ ...p, fase: 'arrancando', empezado: ahora, arrancado: ahora, arranques: 1, sinRespuesta: 0 });
  await m.despertarEn(PLAZOS.sondeoArranque);
  return 'empezado';
}

async function apuntar(bd: D1Database, t: TrabajoEnMarcha, cambio: CambioProcesado, ahora: number): Promise<void> {
  await apuntarProcesado(bd, t.partido, cambio, iso(ahora));
}

async function fallar(c: Contenedor, m: Memoria, bd: D1Database, t: TrabajoEnMarcha, mensaje: string, ahora: number): Promise<void> {
  await apuntar(bd, t, { estado: 'fallo', fase: null, avance: 0, mensaje }, ahora);
  await c.parar();
  await m.olvidar();
}

async function reintentarOFallar(c: Contenedor, m: Memoria, bd: D1Database, t: TrabajoEnMarcha, motivo: string, ahora: number): Promise<void> {
  console.warn(`Procesado de ${t.partido}: ${motivo}`);
  if (t.arranques >= PLAZOS.arranques) return fallar(c, m, bd, t, 'El servidor no ha podido acabar con este vídeo: vuelve a probar en un rato.', ahora);
  await c.parar();
  await c.arrancar(t.partido, t.dueno);
  await m.guardar({ ...t, fase: 'arrancando', arrancado: ahora, arranques: t.arranques + 1, sinRespuesta: 0 });
  await apuntar(bd, t, { estado: 'esperando', fase: null, avance: 0, mensaje: null }, ahora);
  await m.despertarEn(PLAZOS.sondeoArranque);
}

async function arrancando(c: Contenedor, m: Memoria, bd: D1Database, t: TrabajoEnMarcha, ahora: number): Promise<void> {
  const listo = await c.pedir('/salud').then(
    (r) => r.ok,
    () => false,
  );
  if (!listo) {
    if (ahora - t.arrancado > PLAZOS.arranque) return reintentarOFallar(c, m, bd, t, 'no ha arrancado a tiempo', ahora);
    return m.despertarEn(PLAZOS.sondeoArranque);
  }
  const r = await c.pedir('/trabajo', { method: 'POST', body: JSON.stringify({ tareas: t.tareas }) });
  // 409: ya estaba trabajando (la alarma anterior lo pidio y se perdio la respuesta).
  if (r.status !== 202 && r.status !== 409) return reintentarOFallar(c, m, bd, t, `no ha aceptado el trabajo (${r.status})`, ahora);
  await m.guardar({ ...t, fase: 'trabajando', sinRespuesta: 0 });
  await apuntar(bd, t, { estado: 'trabajando', fase: 'leyendo', avance: 0, mensaje: null }, ahora);
  await m.despertarEn(PLAZOS.sondeo);
}

async function trabajando(c: Contenedor, m: Memoria, bd: D1Database, t: TrabajoEnMarcha, ahora: number): Promise<void> {
  let e: EstadoTrabajo;
  try {
    const r = await c.pedir('/trabajo');
    if (!r.ok) throw new Error(String(r.status));
    e = await r.json();
  } catch {
    if (t.sinRespuesta + 1 >= PLAZOS.sinRespuesta) return reintentarOFallar(c, m, bd, t, 'no contesta', ahora);
    await m.guardar({ ...t, sinRespuesta: t.sinRespuesta + 1 });
    return m.despertarEn(PLAZOS.sondeo);
  }
  switch (e.estado) {
    case 'trabajando':
      await apuntar(bd, t, { estado: 'trabajando', fase: e.fase, avance: e.avance, mensaje: null }, ahora);
      await m.guardar({ ...t, sinRespuesta: 0 });
      return m.despertarEn(PLAZOS.sondeo);
    case 'hecho':
      // Los avisos del analisis (un video sin sonido) se le cuentan al entrenador como en el navegador.
      await apuntar(bd, t, { estado: 'hecho', fase: null, avance: 1, mensaje: e.resumen.avisos.join(' ') || null }, ahora);
      await c.parar();
      return m.olvidar();
    case 'fallo':
      console.error(`Procesado de ${t.partido}: ${e.mensaje}`);
      return fallar(c, m, bd, t, 'No se ha podido procesar el vídeo en el servidor.', ahora);
    case 'libre':
      // Contesta, pero sin trabajo: el contenedor se ha reiniciado y lo ha perdido.
      return reintentarOFallar(c, m, bd, t, 'ha perdido el trabajo', ahora);
  }
}

/** La alarma: mira en que va el trabajo y vuelve a programarse mientras dure. */
export async function vigilar(c: Contenedor, m: Memoria, bd: D1Database, ahora: number): Promise<void> {
  const t = await m.leer();
  if (!t) return;
  if (ahora - t.empezado > PLAZOS.total) return fallar(c, m, bd, t, 'El servidor ha tardado demasiado con este vídeo: vuelve a probar.', ahora);
  if (!c.enMarcha) return reintentarOFallar(c, m, bd, t, 'se ha parado', ahora);
  return t.fase === 'arrancando' ? arrancando(c, m, bd, t, ahora) : trabajando(c, m, bd, t, ahora);
}

/** Al borrar el partido: se para lo que haya. Su fila de D1 se va con el partido. */
export async function cancelar(c: Contenedor, m: Memoria): Promise<void> {
  await c.parar();
  await m.olvidar();
}
