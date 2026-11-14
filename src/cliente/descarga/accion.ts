import { formatearTamano } from '../../comun/formato';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { Descarga } from './descargar';
import type { DatosNombre } from './nombre';
import type { OrigenVideo } from './recorte';

const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });

export type Descargador = (origen: OrigenVideo, f: Intervalo, numero: number, partido: DatosNombre) => Promise<void>;
export type DescargadorSeleccion = (origen: OrigenVideo, fragmentos: readonly Intervalo[], partido: DatosNombre) => Promise<void>;

export interface Descargas {
  /** El boton «Descargar MP4»: un fragmento. */
  fragmento: Descargador;
  /** «Descargar la selección»: los de la estrella, unidos en un MP4. */
  seleccion: DescargadorSeleccion;
}

/**
 * Las descargas de una pagina: una a la vez, con el progreso en el aviso que
 * se le pase. El codigo que escribe el MP4 llega con un import() al pulsar.
 */
export function crearDescargas(avisar: (mensaje: string) => void): Descargas {
  let ocupado = false;
  async function hacer(texto: string, trabajo: (alAvanzar: (fraccion: number) => void) => Promise<Descarga>): Promise<void> {
    if (ocupado) return avisar('Ya se está preparando una descarga: espera a que acabe.');
    ocupado = true;
    avisar(texto);
    let ultimo = -1;
    try {
      const r = await trabajo((fraccion) => {
        // De diez en diez: el aviso es aria-live y un lector de pantalla no tiene por que leer cien.
        const decimo = Math.floor(fraccion * 10);
        if (decimo === ultimo) return;
        ultimo = decimo;
        avisar(`${texto} ${PORCENTAJE.format(decimo / 10)}`);
      });
      avisar(`Descargado: ${r.nombre} (${formatearTamano(r.bytes)}).`);
    } catch (e) {
      avisar(`No se ha podido preparar el MP4: ${(e as Error).message}`);
    } finally {
      ocupado = false;
    }
  }
  return {
    fragmento: (origen, f, numero, partido) =>
      hacer(`Preparando el MP4 del fragmento ${numero}…`, async (alAvanzar) => (await import('./descargar')).descargarFragmento(origen, f, numero, partido, alAvanzar)),
    seleccion: (origen, fragmentos, partido) =>
      fragmentos.length === 0
        ? Promise.resolve(avisar('No hay nada en la selección: marca algún fragmento con la estrella.'))
        : hacer(`Preparando el vídeo de la selección (${fragmentos.length === 1 ? '1 jugada' : `${fragmentos.length} jugadas`})…`, async (alAvanzar) =>
            (await import('./descargar')).descargarSeleccion(origen, fragmentos, partido, alAvanzar),
          ),
  };
}
