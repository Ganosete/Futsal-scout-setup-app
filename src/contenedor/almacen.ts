import { open } from 'node:fs/promises';

/**
 * Lo que el contenedor le pide al Worker: el video de un partido y donde
 * dejar lo que saca. En Cloudflare, `http://almacen.interno` no existe en
 * internet: el Durable Object intercepta las peticiones del contenedor y las
 * atiende una pasarela del Worker (servidor/procesado/pasarela.ts), con R2 y
 * D1 a mano y solo para ese partido. El contenedor arranca sin internet y sin
 * ninguna clave.
 */

export interface PiezaSubida {
  numero: number;
  etag: string;
}

/** Errores de red y respuestas 5xx se reintentan: una pasarela que se reinicia no es un fallo del partido. */
async function pedir(url: string, init: RequestInit, intentos = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status < 500 || i === intentos) return r;
    } catch (e) {
      if (i === intentos) throw e;
    }
    await new Promise((listo) => setTimeout(listo, 500 * 2 ** i));
  }
}

async function esperarExito(r: Response, que: string): Promise<Response> {
  if (!r.ok) throw new Error(`${que}: la pasarela ha respondido ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return r;
}

export class Almacen {
  constructor(readonly base: string) {}

  /** ffmpeg lo lee por rangos: un MP4 con el indice al final se puede saltar sin bajarlo entero. */
  get urlVideo(): string {
    return `${this.base}/video`;
  }

  async guardarSenales(senales: unknown): Promise<void> {
    await esperarExito(await pedir(`${this.base}/senales`, { method: 'PUT', body: JSON.stringify(senales) }), 'Guardar las señales');
  }

  /**
   * La edicion solo se guarda si el partido aun no tiene: si el navegador ya
   * analizo, o el entrenador ya corrigio, eso manda (412). Devuelve si la ha
   * guardado.
   */
  async guardarEdicionSiNoHay(edicion: unknown): Promise<boolean> {
    const r = await pedir(`${this.base}/edicion`, { method: 'PUT', body: JSON.stringify(edicion), headers: { 'if-none-match': '*' } });
    if (r.status === 412) return false;
    await esperarExito(r, 'Guardar la edición');
    return true;
  }

  /**
   * Sube la version ligera por partes de `tamanoParte` bytes (R2 las pide
   * iguales salvo la ultima). Cada parte va en su peticion y se lee del disco
   * cuando toca: un partido ligero son uno o dos gigas.
   */
  async subirLigero(fichero: string, tamano: number, tamanoParte: number, alAvanzar?: (fraccion: number) => void): Promise<number> {
    const creada = await esperarExito(await pedir(`${this.base}/ligero`, { method: 'POST' }), 'Empezar la subida');
    const { subida } = (await creada.json()) as { subida: string };
    const piezas: PiezaSubida[] = [];
    const descriptor = await open(fichero, 'r');
    try {
      for (let numero = 1, desde = 0; desde < tamano; numero++, desde += tamanoParte) {
        const largo = Math.min(tamanoParte, tamano - desde);
        const bytes = Buffer.alloc(largo);
        await descriptor.read(bytes, 0, largo, desde);
        const r = await esperarExito(
          await pedir(`${this.base}/ligero/${encodeURIComponent(subida)}/partes/${numero}`, { method: 'PUT', body: bytes }),
          `Subir la parte ${numero}`,
        );
        piezas.push({ numero, etag: ((await r.json()) as { etag: string }).etag });
        alAvanzar?.((desde + largo) / tamano);
      }
    } finally {
      await descriptor.close();
    }
    const r = await esperarExito(
      await pedir(`${this.base}/ligero/${encodeURIComponent(subida)}/completar`, { method: 'POST', body: JSON.stringify({ partes: piezas }) }),
      'Cerrar la subida',
    );
    return ((await r.json()) as { tamano: number }).tamano;
  }
}
