import { execFile, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { FPS_ANALISIS, IMAGEN_ANALISIS, type SenalesAnalisis } from '../nucleo/analizar';
import { actividad, type MuestraActividad } from '../nucleo/balonParado/movimiento';
import { DetectorPitidos, type Pitido } from '../nucleo/balonParado/pitidos';
import { aGris, type PlanoGris } from '../nucleo/gris';
import { aMuestras, argumentosPasada, BYTES_FOTOGRAMA, leerSondeo, segundosDeProgreso, Troceador, type Sondeo } from './ffmpeg';

/**
 * El analisis en el servidor: lo mismo que hace el navegador mientras sube
 * (cliente/analisis/lectura.ts), pero decodificando con ffmpeg en vez de con
 * WebCodecs. Lo que se calcula con lo leido es el mismo nucleo, y los avisos
 * dicen lo mismo.
 */

const ejecutar = promisify(execFile);

export async function sondear(fuente: string): Promise<Sondeo> {
  const { stdout } = await ejecutar('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', fuente], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return leerSondeo(JSON.parse(stdout));
}

export interface OpcionesPasada {
  /** Donde dejar la version ligera; null si no hace falta. */
  ligero: string | null;
  alAvanzar?: (fraccion: number) => void;
  senal?: AbortSignal;
}

export interface ResultadoPasada {
  senales: SenalesAnalisis;
  avisos: string[];
}

/** Un detector, o por que no se puede escuchar: los mismos avisos que en el navegador. */
function prepararEscucha(s: Sondeo): { detector: DetectorPitidos | null; aviso: string | null } {
  if (!s.audio) return { detector: null, aviso: 'El vídeo no tiene sonido: se ha buscado sin el silbato.' };
  try {
    return { detector: new DetectorPitidos(s.audio.frecuencia), aviso: null };
  } catch {
    return { detector: null, aviso: `El sonido tiene una calidad demasiado baja (${s.audio.frecuencia} Hz) para oír el silbato.` };
  }
}

async function escuchar(flujo: Readable, detector: DetectorPitidos): Promise<Pitido[]> {
  // Bloques de 8192 muestras: el detector va por ventanas y no le importa como lleguen.
  const troceador = new Troceador(4 * 8192);
  for await (const trozo of flujo) for (const bloque of troceador.meter(trozo as Buffer)) detector.alimentar(aMuestras(bloque));
  detector.alimentar(aMuestras(troceador.resto()));
  return detector.terminar();
}

async function medir(flujo: Readable): Promise<MuestraActividad[]> {
  const { ancho, alto } = IMAGEN_ANALISIS;
  const troceador = new Troceador(BYTES_FOTOGRAMA);
  const serie: MuestraActividad[] = [];
  let previo: PlanoGris | null = null;
  let n = 0;
  for await (const trozo of flujo) {
    for (const fotograma of troceador.meter(trozo as Buffer)) {
      const plano = aGris({ width: ancho, height: alto, data: new Uint8ClampedArray(fotograma.buffer) });
      // El filtro fps de ffmpeg deja los fotogramas a intervalos exactos desde el 0.
      if (previo) serie.push({ segundos: n / FPS_ANALISIS, valor: actividad(previo, plano) });
      previo = plano;
      n++;
    }
  }
  return serie;
}

/** Las ultimas lineas de lo que ffmpeg cuenta por la salida de errores, para el registro. */
function cola(texto: string): string {
  return texto.trim().split('\n').slice(-5).join(' | ');
}

export async function pasada(fuente: string, sondeo: Sondeo, o: OpcionesPasada): Promise<ResultadoPasada> {
  const { detector, aviso } = prepararEscucha(sondeo);
  const proceso = spawn('ffmpeg', argumentosPasada(fuente, { audio: detector !== null, ligero: o.ligero }), {
    stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  const parar = (): void => {
    proceso.kill('SIGKILL');
  };
  o.senal?.addEventListener('abort', parar, { once: true });

  let errores = '';
  proceso.stderr?.on('data', (d: Buffer) => {
    errores = (errores + d.toString()).slice(-4096);
  });
  let pendiente = '';
  proceso.stdout?.on('data', (d: Buffer) => {
    const lineas = (pendiente + d.toString()).split('\n');
    pendiente = lineas.pop() ?? '';
    for (const l of lineas) {
      const t = segundosDeProgreso(l);
      if (t !== null) o.alAvanzar?.(Math.min(1, t / sondeo.duracion));
    }
  });
  const fin = new Promise<number | null>((listo, fallo) => {
    proceso.once('error', fallo);
    proceso.once('close', (codigo) => listo(codigo));
  });

  try {
    const [pitidos, serie, codigo] = await Promise.all([
      detector ? escuchar(proceso.stdio[3] as Readable, detector) : Promise.resolve(null),
      medir(proceso.stdio[4] as Readable),
      fin,
    ]);
    if (o.senal?.aborted) throw new Error('Parado.');
    if (codigo !== 0) throw new Error(`ffmpeg ha acabado con el código ${codigo}: ${cola(errores)}`);
    return { senales: { duracion: sondeo.duracion, pitidos, actividad: serie }, avisos: aviso ? [aviso] : [] };
  } finally {
    o.senal?.removeEventListener('abort', parar);
  }
}
