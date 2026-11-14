import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { leerEdicion } from '../comun/edicion';
import { compactarSenales, edicionDeAnalisis } from '../comun/guardadoAnalisis';
import type { EstadoTrabajo, ResumenTrabajo, TareasProcesado } from '../comun/procesado';
import { analizarSenales } from '../nucleo/analizar';
import type { Almacen } from './almacen';
import { buscarEquipos } from './equipos';
import type { Sondeo } from './ffmpeg';
import { cargarDetector, type MotorOnnx } from './onnx';
import { pasada, sondear } from './pasada';

/**
 * Un trabajo del contenedor: leer el video una vez y dejar lo que se pida.
 * Las senales y la edicion se guardan en cuanto acaba la lectura, antes de
 * subir la version ligera: el entrenador puede empezar a corregir mientras
 * sube lo de los jugadores. Quien ataca va al final: son los minutos mas
 * largos, y para entonces lo demas ya esta guardado.
 */

export interface OpcionesTrabajo {
  almacen: Almacen;
  tareas: TareasProcesado;
  /** Donde dejar la version ligera mientras se sube. */
  carpeta: string;
  tamanoParte: number;
  /** onnxruntime, que solo se carga si hay que buscar quien ataca: el nativo en la imagen, el de WASM en las pruebas. */
  motor: () => Promise<MotorOnnx>;
  /** Los hilos del detector: los vCPU del contenedor. */
  hilos: number;
  informar: (e: EstadoTrabajo) => void;
}

interface ResultadoEquipos {
  fotogramas: number | null;
  guardadas: boolean;
  aviso: string | null;
}

/**
 * Quien ataca, en los fragmentos que tenga el partido: los del servidor o,
 * si ya tenia jugadas, esas, con lo que haya corregido el entrenador. Si ya
 * se busco (en el navegador, o en otro trabajo) no se repite.
 */
async function quienAtaca(o: OpcionesTrabajo, sondeo: Sondeo): Promise<ResultadoEquipos> {
  const { almacen, informar } = o;
  informar({ estado: 'trabajando', fase: 'detectando', avance: 0 });
  if (await almacen.hayDetecciones()) return { fotogramas: null, guardadas: false, aviso: null };
  const tramos = leerEdicion(await almacen.leerEdicion())?.fragmentos ?? [];
  if (tramos.length === 0) return { fotogramas: null, guardadas: false, aviso: 'No hay jugadas en las que buscar quién ataca.' };
  const { manifiesto, bytes } = await almacen.bajarModelo();
  const detector = await cargarDetector(await o.motor(), new Uint8Array(bytes), manifiesto.entrada, o.hilos);
  try {
    const registros = await buscarEquipos({
      fuente: almacen.urlVideo,
      sondeo,
      tramos,
      detector,
      entrada: manifiesto.entrada,
      clases: manifiesto.clases,
      alAvanzar: (avance) => informar({ estado: 'trabajando', fase: 'detectando', avance }),
    });
    const guardadas = await almacen.guardarDeteccionesSiNoHay({ version: 1, registros });
    return { fotogramas: registros.length, guardadas, aviso: null };
  } finally {
    await detector.cerrar();
  }
}

type ResultadoPasada = Pick<ResumenTrabajo, 'fragmentos' | 'edicionGuardada' | 'ligeroBytes' | 'avisos'>;

/** La pasada por el video entero, con lo que se guarda de ella: las jugadas y la version ligera. */
async function leerYGuardar(o: OpcionesTrabajo, sondeo: Sondeo): Promise<ResultadoPasada> {
  const { almacen, tareas, informar } = o;
  const ligero = tareas.ligero ? join(o.carpeta, `ligero-${randomUUID()}.mp4`) : null;
  try {
    const { senales, avisos } = await pasada(almacen.urlVideo, sondeo, {
      ligero,
      alAvanzar: (avance) => informar({ estado: 'trabajando', fase: 'leyendo', avance }),
    });

    let fragmentos: number | null = null;
    let edicionGuardada = false;
    if (tareas.analisis) {
      informar({ estado: 'trabajando', fase: 'guardando', avance: 0 });
      const resultado = analizarSenales(senales, randomUUID);
      fragmentos = resultado.fragmentos.length;
      await almacen.guardarSenales(compactarSenales(senales));
      edicionGuardada = await almacen.guardarEdicionSiNoHay(edicionDeAnalisis(resultado, senales.duracion));
    }

    let ligeroBytes: number | null = null;
    if (ligero) {
      informar({ estado: 'trabajando', fase: 'subiendo', avance: 0 });
      const { size } = await stat(ligero);
      ligeroBytes = await almacen.subirLigero(ligero, size, o.tamanoParte, (avance) => informar({ estado: 'trabajando', fase: 'subiendo', avance }));
    }
    return { fragmentos, edicionGuardada, ligeroBytes, avisos };
  } finally {
    // Antes de la parte larga: la version ligera ya esta en R2 y el disco se libera.
    if (ligero) await rm(ligero, { force: true });
  }
}

export async function trabajar(o: OpcionesTrabajo): Promise<ResumenTrabajo> {
  const { almacen, tareas, informar } = o;
  informar({ estado: 'trabajando', fase: 'leyendo', avance: 0 });
  const sondeo = await sondear(almacen.urlVideo);
  // Si solo se pide quien ataca, no se lee el video entero: solo los fragmentos.
  const leido: ResultadoPasada =
    tareas.analisis || tareas.ligero ? await leerYGuardar(o, sondeo) : { fragmentos: null, edicionGuardada: false, ligeroBytes: null, avisos: [] };

  let equipos: ResultadoEquipos = { fotogramas: null, guardadas: false, aviso: null };
  if (tareas.equipos) {
    // Lo de antes ya esta guardado y vale: si esto falla, se cuenta y el entrenador lo busca en el navegador.
    equipos = await quienAtaca(o, sondeo).catch((e: unknown) => {
      console.error('Quién ataca ha fallado:', e);
      return { fotogramas: null, guardadas: false, aviso: 'No se ha podido buscar quién ataca en el servidor: búscalo desde el partido.' };
    });
  }
  return {
    ...leido,
    fotogramas: equipos.fotogramas,
    deteccionesGuardadas: equipos.guardadas,
    avisos: equipos.aviso ? [...leido.avisos, equipos.aviso] : leido.avisos,
  };
}
