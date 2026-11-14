import { spawn } from 'node:child_process';
import type { ClasesDetector } from '../comun/modelos';
import type { Intervalo } from '../nucleo/balonParado/tramos';
import { aTensorNchw } from '../nucleo/deteccion/preproceso';
import { especDetector, FPS_EQUIPOS, leerSalidas, registrar } from '../nucleo/equipos/fotograma';
import { instantesEnTramos, type RegistroFotograma } from '../nucleo/equipos/registro';
import { argumentosEquipos, planEquipos, separarImagenes, Troceador, ultimasLineas, type PlanEquipos, type Sondeo } from './ffmpeg';
import type { Detector } from './onnx';

/**
 * «Quién ataca» en el servidor: lo que hace el navegador
 * (cliente/equipos/trabajador.ts), con ffmpeg para leer los fotogramas y
 * onnxruntime nativo para el detector. Cada fragmento se lee aparte, saltando
 * a su inicio: lo de balon parado no se decodifica. Mientras el detector mira
 * un fotograma, ffmpeg ya prepara los siguientes; si va por delante, la
 * tuberia llena lo para.
 */

export interface OpcionesEquipos {
  /** El video: la direccion de la pasarela o un fichero. */
  fuente: string;
  sondeo: Sondeo;
  /** Los fragmentos de juego: solo ahi se mira. */
  tramos: readonly Intervalo[];
  detector: Detector;
  /** Lado de la entrada del detector y sus clases, del manifiesto del modelo. */
  entrada: number;
  clases: ClasesDetector;
  alAvanzar?: (fraccion: number) => void;
}

async function* leerFotogramas(fuente: string, desde: number, fotogramas: number, plan: PlanEquipos): AsyncGenerator<Uint8Array> {
  const proceso = spawn('ffmpeg', argumentosEquipos(fuente, desde, fotogramas, plan), { stdio: ['ignore', 'pipe', 'pipe'] });
  let errores = '';
  proceso.stderr.on('data', (d: Buffer) => {
    errores = (errores + d.toString()).slice(-4096);
  });
  const fin = new Promise<number | null>((listo, fallo) => {
    proceso.once('error', fallo);
    proceso.once('close', (codigo) => listo(codigo));
  });
  // Si se deja a medias (falla el detector), ffmpeg se para abajo y como acabe ya da igual.
  fin.catch(() => undefined);
  let acabado = false;
  try {
    const troceador = new Troceador(plan.bytes);
    for await (const trozo of proceso.stdout) yield* troceador.meter(trozo as Buffer);
    const codigo = await fin;
    acabado = true;
    if (codigo !== 0) throw new Error(`ffmpeg ha acabado con el código ${codigo}: ${ultimasLineas(errores)}`);
  } finally {
    if (!acabado) proceso.kill('SIGKILL');
  }
}

/** Los registros de los fragmentos, en el mismo formato que los del navegador (detecciones.json). */
export async function buscarEquipos(o: OpcionesEquipos): Promise<RegistroFotograma[]> {
  const { ancho, alto } = o.sondeo.imagen;
  const plan = planEquipos(o.sondeo.imagen, o.entrada);
  const espec = especDetector(o.entrada, o.clases);
  const tramos = [...o.tramos].sort((a, b) => a.desde - b.desde).map((t) => ({ desde: t.desde, instantes: instantesEnTramos([t], FPS_EQUIPOS) }));
  const total = tramos.reduce((s, t) => s + t.instantes.length, 0);
  const registros: RegistroFotograma[] = [];
  let mirados = 0;
  for (const t of tramos) {
    if (t.instantes.length === 0) continue;
    let k = 0;
    for await (const apilada of leerFotogramas(o.fuente, t.desde, t.instantes.length, plan)) {
      const { color, detector } = separarImagenes(apilada, plan);
      const salidas = await o.detector.inferir(aTensorNchw(detector, plan.lado, 'imagenet'));
      // El instante pedido, no el del fotograma: el que se ve en ese momento empezo como mucho un fotograma antes.
      registros.push(registrar(t.instantes[k], leerSalidas(salidas, espec, ancho, alto, o.clases), color, plan.color.escala, ancho, alto));
      k++;
      o.alAvanzar?.((mirados + k) / total);
    }
    // Si el video acaba antes que el fragmento salen menos, y lo que falta tambien cuenta como mirado.
    mirados += t.instantes.length;
  }
  return registros;
}
