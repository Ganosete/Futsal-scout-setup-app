import { exports } from 'cloudflare:workers';
import type { NuevoPartido, PartidoParaSubir } from '../../src/comun/partido';

/**
 * Llamadas a la API a traves del propio Worker (indice.ts), como desde el
 * navegador en localhost: cada prueba tiene su propio dueno con la cookie de
 * pruebas, asi que no se pisan.
 */

export interface OpcionesLlamada {
  cuerpo?: BodyInit | null;
  cabeceras?: Record<string, string>;
}

export interface Cliente {
  dueno: string;
  llamar: (metodo: string, camino: string, opciones?: OpcionesLlamada) => Promise<Response>;
  crear: (datos?: Partial<NuevoPartido>) => Promise<PartidoParaSubir>;
}

export const MIB = 1024 * 1024;

export function huellaAlAzar(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function nuevoPartido(datos: Partial<NuevoPartido> = {}): NuevoPartido {
  return {
    local: 'Castillo de Requena FS',
    visitante: 'Feme Castellón',
    fecha: '2026-11-08',
    nombreFichero: 'partido.mp4',
    tamano: 5 * MIB + 1000,
    duracion: 6000,
    huella: huellaAlAzar(),
    ...datos,
  };
}

/** Bytes que se reconocen: el byte i vale i % 251. */
export function bytes(desde: number, hasta: number): Uint8Array {
  const b = new Uint8Array(hasta - desde);
  for (let i = 0; i < b.length; i++) b[i] = (desde + i) % 251;
  return b;
}

export function cliente(nombre = `prueba-${huellaAlAzar()}`): Cliente {
  const llamar = (metodo: string, camino: string, opciones: OpcionesLlamada = {}): Promise<Response> =>
    exports.default.fetch(
      new Request(`http://localhost${camino}`, {
        method: metodo,
        body: opciones.cuerpo ?? null,
        headers: { cookie: `futsal-scout-local=${nombre}`, ...opciones.cabeceras },
      }),
    );
  return {
    dueno: `${nombre}@localhost`,
    llamar,
    crear: async (datos = {}) => {
      const r = await llamar('POST', '/api/partidos', { cuerpo: JSON.stringify(nuevoPartido(datos)) });
      if (r.status !== 201 && r.status !== 200) throw new Error(`crear: ${r.status} ${await r.text()}`);
      return r.json();
    },
  };
}

/** Sube todas las partes de un partido creado y lo completa. */
export async function subirEntero(c: Cliente, p: PartidoParaSubir): Promise<void> {
  const { tamano, id } = p.partido;
  for (let n = 1, desde = 0; desde < tamano; n++, desde += p.tamanoParte) {
    const r = await c.llamar('PUT', `/api/partidos/${id}/partes/${n}`, { cuerpo: bytes(desde, Math.min(tamano, desde + p.tamanoParte)) });
    if (r.status !== 200) throw new Error(`parte ${n}: ${r.status} ${await r.text()}`);
  }
  const r = await c.llamar('POST', `/api/partidos/${id}/completar`);
  if (r.status !== 200) throw new Error(`completar: ${r.status} ${await r.text()}`);
}
