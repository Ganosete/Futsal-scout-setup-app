import { rangoParte } from '../../comun/partesSubida';
import { ErrorApi } from '../api/api';

/**
 * Sube las partes que faltan de un video, varias a la vez. Una parte que
 * falla por la red o por el servidor se reintenta con esperas cada vez mas
 * largas (1, 2, 4, 8 y 16 s): en una subida de media hora, un corte de wifi
 * de unos segundos no puede tirarla entera. Lo que no se arregla repitiendo
 * (una parte rechazada, un partido que ya no existe) para toda la subida.
 *
 * Parar no pierde nada: lo subido queda en R2, y elegir otra vez el mismo
 * video sigue desde ahi.
 */

export type Enviar = (numero: number, trozo: Blob, alAvanzar: (bytes: number) => void, senal: AbortSignal) => Promise<void>;

export interface OpcionesSubida {
  fichero: Blob;
  tamanoParte: number;
  /** Las partes que faltan, en el orden en que se mandan. */
  pendientes: readonly number[];
  /** Bytes que ya estaban en R2 antes de empezar. */
  yaSubidos: number;
  enviar: Enviar;
  /** Bytes en R2 o de camino, contando los que ya estaban. */
  alAvanzar?: (bytes: number) => void;
  concurrencia?: number;
  reintentos?: number;
  esperar?: (ms: number, senal: AbortSignal) => Promise<void>;
}

export interface SubidaEnCurso {
  /** 'hecha' con todas las partes en R2; 'parada' si se ha llamado a parar(). Falla si una parte no se puede subir. */
  resultado: Promise<'hecha' | 'parada'>;
  parar: () => void;
}

/** Tres a la vez llenan una conexion normal sin que una parte lenta frene a las demas. */
const CONCURRENCIA = 3;
const REINTENTOS = 5;

/** Un corte de red (0), un tiempo de espera (408), demasiadas peticiones (429) o un fallo del servidor (5xx). */
export function sePuedeReintentar(e: unknown): boolean {
  if (!(e instanceof ErrorApi)) return false;
  return e.estado === 0 || e.estado === 408 || e.estado === 429 || e.estado >= 500;
}

function esperarMs(ms: number, senal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(resolver, ms);
    senal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        rechazar(new DOMException('Subida parada', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function subirPartes(o: OpcionesSubida): SubidaEnCurso {
  const control = new AbortController();
  const esperar = o.esperar ?? esperarMs;
  const reintentos = o.reintentos ?? REINTENTOS;
  const cola = [...o.pendientes];
  /** Lo que lleva enviado cada parte que esta de camino. */
  const deCamino = new Map<number, number>();
  let terminados = o.yaSubidos;
  let parada = false;

  const avisar = (): void => {
    let total = terminados;
    for (const b of deCamino.values()) total += b;
    o.alAvanzar?.(total);
  };

  async function subirUna(numero: number): Promise<void> {
    const { desde, hasta } = rangoParte(numero, o.fichero.size, o.tamanoParte);
    const trozo = o.fichero.slice(desde, hasta);
    for (let intento = 0; ; intento++) {
      deCamino.set(numero, 0);
      try {
        const alAvanzar = (b: number): void => {
          deCamino.set(numero, Math.min(b, hasta - desde));
          avisar();
        };
        await o.enviar(numero, trozo, alAvanzar, control.signal);
        deCamino.delete(numero);
        terminados += hasta - desde;
        avisar();
        return;
      } catch (e) {
        // Lo enviado de un intento fallido no cuenta: la parte se manda entera otra vez.
        deCamino.delete(numero);
        avisar();
        if (control.signal.aborted || !sePuedeReintentar(e) || intento >= reintentos) throw e;
        await esperar(1000 * 2 ** intento, control.signal);
      }
    }
  }

  async function trabajar(): Promise<void> {
    for (let n = cola.shift(); n !== undefined && !control.signal.aborted; n = cola.shift()) await subirUna(n);
  }

  const resultado = (async (): Promise<'hecha' | 'parada'> => {
    try {
      await Promise.all(Array.from({ length: Math.min(o.concurrencia ?? CONCURRENCIA, cola.length) }, trabajar));
    } catch (e) {
      if (parada) return 'parada';
      // Una parte que no se puede subir para tambien a las que van de camino.
      control.abort();
      throw e;
    }
    return parada ? 'parada' : 'hecha';
  })();

  return {
    resultado,
    parar: () => {
      parada = true;
      control.abort();
    },
  };
}
