import type { Intervalo } from '../../nucleo/balonParado/tramos';
import { guardarFichero } from './guardar';
import { nombreClip, type DatosNombre } from './nombre';
import { recortarMp4, type OrigenVideo } from './recorte';

/**
 * Descargar un fragmento en MP4. Lo carga el editor con un import() al
 * pulsar: la parte de Mediabunny que escribe MP4 no hace falta antes.
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
