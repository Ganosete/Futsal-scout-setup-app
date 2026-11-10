import { formatearTamano } from '../../comun/formato';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { DatosNombre } from './nombre';
import type { OrigenVideo } from './recorte';

const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });

export type Descargador = (origen: OrigenVideo, f: Intervalo, numero: number, partido: DatosNombre) => Promise<void>;

/** El boton «Descargar MP4»: una descarga a la vez, con el progreso en el aviso que se le pase. */
export function crearDescargador(avisar: (mensaje: string) => void): Descargador {
  let ocupado = false;
  return async (origen, f, numero, partido) => {
    if (ocupado) return avisar('Ya se está preparando una descarga: espera a que acabe.');
    ocupado = true;
    const texto = `Preparando el MP4 del fragmento ${numero}…`;
    avisar(texto);
    let ultimo = -1;
    try {
      const { descargarFragmento } = await import('./descargar');
      const r = await descargarFragmento(origen, f, numero, partido, (fraccion) => {
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
  };
}
