import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { compactarSenales, edicionDeAnalisis } from '../comun/guardadoAnalisis';
import type { EstadoTrabajo, ResumenTrabajo, TareasProcesado } from '../comun/procesado';
import { analizarSenales } from '../nucleo/analizar';
import type { Almacen } from './almacen';
import { pasada, sondear } from './pasada';

/**
 * Un trabajo del contenedor: leer el video una vez y dejar lo que se pida.
 * Las senales y la edicion se guardan en cuanto acaba la lectura, antes de
 * subir la version ligera: el entrenador puede empezar a corregir mientras
 * sube lo de los jugadores.
 */

export interface OpcionesTrabajo {
  almacen: Almacen;
  tareas: TareasProcesado;
  /** Donde dejar la version ligera mientras se sube. */
  carpeta: string;
  tamanoParte: number;
  informar: (e: EstadoTrabajo) => void;
}

export async function trabajar(o: OpcionesTrabajo): Promise<ResumenTrabajo> {
  const { almacen, tareas, informar } = o;
  informar({ estado: 'trabajando', fase: 'leyendo', avance: 0 });
  const sondeo = await sondear(almacen.urlVideo);
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
    if (ligero) await rm(ligero, { force: true });
  }
}
