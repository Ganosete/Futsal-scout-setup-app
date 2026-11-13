import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { esTareas, type EstadoTrabajo } from '../comun/procesado';
import { Almacen } from './almacen';
import { trabajar } from './trabajo';

/**
 * El programa del contenedor: un servidor HTTP que solo habla con su Durable
 * Object (servidor/procesado/procesador.ts). Un trabajo cada vez: cada
 * partido tiene su propio contenedor. El Durable Object pregunta por el
 * estado cada poco, y eso tambien lo mantiene despierto.
 */

const PUERTO = Number(process.env.PUERTO ?? 8080);
const almacen = new Almacen(process.env.ALMACEN ?? 'http://almacen.interno');
const carpeta = process.env.CARPETA ?? tmpdir();
/** 50 MiB, como la subida del navegador: R2 pide al menos 5 MiB por parte, salvo la ultima. */
const TAMANO_PARTE = Number(process.env.TAMANO_PARTE ?? 50 * 1024 * 1024);

let estado: EstadoTrabajo = { estado: 'libre' };
let ultimoRegistro = '';

function informar(e: EstadoTrabajo): void {
  estado = e;
  // Al registro, una linea por fase y por cada 10 %: lo justo para seguirlo en el panel.
  const linea = e.estado === 'trabajando' ? `${e.fase} ${Math.floor(e.avance * 10) * 10} %` : e.estado;
  if (linea !== ultimoRegistro) console.log(linea);
  ultimoRegistro = linea;
}

function responder(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  res.writeHead(codigo, { 'content-type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  let texto = '';
  for await (const trozo of req) {
    texto += String(trozo);
    if (texto.length > 4096) throw new Error('Cuerpo demasiado grande');
  }
  return JSON.parse(texto || 'null');
}

async function empezar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (estado.estado === 'trabajando') return responder(res, 409, estado);
  const cuerpo = (await leerCuerpo(req)) as { tareas?: unknown } | null;
  if (!esTareas(cuerpo?.tareas)) return responder(res, 400, { error: 'Faltan las tareas.' });
  const tareas = cuerpo.tareas;
  informar({ estado: 'trabajando', fase: 'leyendo', avance: 0 });
  trabajar({ almacen, tareas, carpeta, tamanoParte: TAMANO_PARTE, informar })
    .then((resumen) => informar({ estado: 'hecho', resumen }))
    .catch((e: unknown) => {
      console.error('El trabajo ha fallado:', e);
      informar({ estado: 'fallo', mensaje: e instanceof Error ? e.message : String(e) });
    });
  responder(res, 202, estado);
}

const servidor = createServer((req, res) => {
  const ruta = `${req.method} ${req.url}`;
  if (ruta === 'GET /salud') return responder(res, 200, { estado: 'ok' });
  if (ruta === 'GET /trabajo') return responder(res, 200, estado);
  if (ruta === 'POST /trabajo') {
    empezar(req, res).catch(() => responder(res, 400, { error: 'Petición no válida.' }));
    return;
  }
  responder(res, 404, { error: 'No existe.' });
});

servidor.listen(PUERTO, () => console.log(`Escuchando en el puerto ${PUERTO}`));
