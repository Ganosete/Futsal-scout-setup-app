import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { interpretarRango } from '../../src/servidor/partidos/rango';

/**
 * Una pasarela de mentira para probar el contenedor sin Cloudflare: atiende lo
 * mismo que servidor/procesado/pasarela.ts (el video por rangos, las senales,
 * la edicion y la subida por partes) y apunta lo que le llega.
 */

export interface OpcionesPasarela {
  /** El partido ya tiene edicion: la del servidor no se guarda (412). */
  edicionYaExiste?: boolean;
  /** Las primeras N peticiones de señales fallan con un 503, como una pasarela que se reinicia. */
  fallosSenales?: number;
}

export interface Recibido {
  senales: unknown;
  edicion: unknown;
  partes: Map<number, Buffer>;
  completada: { numero: number; etag: string }[] | null;
  peticionesVideo: number;
}

export interface PasarelaFalsa {
  url: string;
  recibido: Recibido;
  /** Las partes de la version ligera, juntas en orden. */
  ligero: () => Buffer;
  cerrar: () => Promise<void>;
}

async function cuerpo(req: IncomingMessage): Promise<Buffer> {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  return Buffer.concat(trozos);
}

export async function crearPasarelaFalsa(video: string, o: OpcionesPasarela = {}): Promise<PasarelaFalsa> {
  const bytes = readFileSync(video);
  const recibido: Recibido = { senales: null, edicion: null, partes: new Map(), completada: null, peticionesVideo: 0 };
  let fallosSenales = o.fallosSenales ?? 0;

  const servidor = createServer((req, res) => {
    void (async () => {
      const ruta = `${req.method} ${new URL(req.url ?? '/', 'http://x').pathname}`;
      if (ruta === 'GET /video' || ruta === 'HEAD /video') {
        recibido.peticionesVideo++;
        const r = interpretarRango(req.headers.range ?? null, bytes.length);
        if (r.tipo === 'imposible') return res.writeHead(416, { 'content-range': `bytes */${bytes.length}` }).end();
        const [desde, hasta] = r.tipo === 'parte' ? [r.desde, r.hasta] : [0, bytes.length - 1];
        res.writeHead(r.tipo === 'parte' ? 206 : 200, {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'content-length': String(hasta - desde + 1),
          ...(r.tipo === 'parte' ? { 'content-range': `bytes ${desde}-${hasta}/${bytes.length}` } : {}),
        });
        return res.end(req.method === 'HEAD' ? undefined : bytes.subarray(desde, hasta + 1));
      }
      if (ruta === 'PUT /senales') {
        if (fallosSenales-- > 0) return res.writeHead(503).end();
        recibido.senales = JSON.parse(String(await cuerpo(req)));
        return res.writeHead(204).end();
      }
      if (ruta === 'PUT /edicion') {
        const edicion = JSON.parse(String(await cuerpo(req)));
        if (o.edicionYaExiste || req.headers['if-none-match'] !== '*') return res.writeHead(412).end();
        recibido.edicion = edicion;
        return res.writeHead(201).end();
      }
      if (ruta === 'POST /ligero') return res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ subida: 'subida-1' }));
      const parte = /^PUT \/ligero\/subida-1\/partes\/(\d+)$/.exec(ruta);
      if (parte) {
        const n = Number(parte[1]);
        recibido.partes.set(n, await cuerpo(req));
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ etag: `etag-${n}` }));
      }
      if (ruta === 'POST /ligero/subida-1/completar') {
        recibido.completada = (JSON.parse(String(await cuerpo(req))) as { partes: { numero: number; etag: string }[] }).partes;
        const tamano = [...recibido.partes.values()].reduce((s, b) => s + b.length, 0);
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ tamano }));
      }
      res.writeHead(404).end();
    })().catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    recibido,
    ligero: () => Buffer.concat([...recibido.partes.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b)),
    cerrar: () => new Promise<void>((listo) => servidor.close(() => listo())),
  };
}
