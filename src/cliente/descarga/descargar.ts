import type { Intervalo } from '../../nucleo/balonParado/tramos';
import { guardarFichero } from './guardar';
import { nombreClip, nombreSeleccion, type DatosNombre } from './nombre';
import { recortarMp4, type OrigenVideo } from './recorte';
import { unirMp4 } from './union';

/**
 * Descargar un fragmento, o la seleccion entera, en MP4. Lo carga la pagina
 * con un import() al pulsar: la parte de Mediabunny que escribe MP4 no hace
 * falta antes.
 */

export interface Descarga {
  nombre: string;
  bytes: number;
}

export async function descargarFragmento(
  origen: OrigenVideo,
  f: Intervalo,
  numero: number,
  partido: DatosNombre,
  alAvanzar: (fraccion: number) => void,
): Promise<Descarga> {
  const datos = await recortarMp4(origen, f.desde, f.hasta, alAvanzar);
  const nombre = nombreClip(partido, numero, f.desde);
  guardarFichero(datos, nombre);
  return { nombre, bytes: datos.byteLength };
}

export async function descargarSeleccion(
  origen: OrigenVideo,
  fragmentos: readonly Intervalo[],
  partido: DatosNombre,
  alAvanzar: (fraccion: number) => void,
): Promise<Descarga> {
  const datos = await unirMp4(origen, fragmentos, alAvanzar);
  const nombre = nombreSeleccion(partido);
  guardarFichero(datos, nombre);
  return { nombre, bytes: datos.byteLength };
}
