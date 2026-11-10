import { BlobSource, Input, MP4, QTFF, UrlSource, VideoSampleSink } from 'mediabunny';
import { Tensor } from 'onnxruntime-web/jspi';
import type { Caja } from '../../nucleo/deteccion/caja';
import { ESPEC_RFDETR, separar } from '../../nucleo/deteccion/detector';
import { afinar, decodificarRfdetr } from '../../nucleo/deteccion/postproceso';
import { aTensorNchw } from '../../nucleo/deteccion/preproceso';
import { calcularTransformacion } from '../../nucleo/deteccion/redimension';
import { colorSuelo, descriptorCamiseta } from '../../nucleo/equipos/color';
import { centro, instantesEnTramos, masCerca, type RegistroFotograma } from '../../nucleo/equipos/registro';
import { FPS_SIN_GPU, type PeticionEquipos, type RespuestaEquipos } from './protocolo';
import { aPlano, crearSesion } from './sesion';

/**
 * La busqueda de equipos, fuera del hilo principal: decodificar los
 * fragmentos y pasar el detector por miles de fotogramas son minutos de
 * calculo. Para pararla, la pagina termina el worker.
 *
 * Cada fotograma se mira dos veces: deformado a 384x384 para el detector y
 * reducido a 960 px de ancho para el color de las camisetas, que en 384 px
 * ya no se distingue bien.
 */

interface AmbitoTrabajador {
  postMessage(mensaje: RespuestaEquipos): void;
  onmessage: ((evento: MessageEvent<PeticionEquipos>) => void) | null;
}

const ambito = self as unknown as AmbitoTrabajador;

const ANCHO_COLOR = 960;
/** Los mas cercanos al balon deciden la posesion; con seis sobra para repartir los equipos. */
const PERSONAS_POR_FOTOGRAMA = 6;

const redondear = (x: number, decimales: number): number => Math.round(x * 10 ** decimales) / 10 ** decimales;
const cajaCompacta = (c: Caja): Caja => ({ x: redondear(c.x, 1), y: redondear(c.y, 1), w: redondear(c.w, 1), h: redondear(c.h, 1) });

function contexto(ancho: number, alto: number): OffscreenCanvasRenderingContext2D {
  const ctx = new OffscreenCanvas(ancho, alto).getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se ha podido preparar el lienzo del detector.');
  return ctx;
}

async function detectar(p: PeticionEquipos): Promise<void> {
  const inicio = performance.now();
  const { sesion, backend } = await crearSesion(p.modelo);
  const fps = backend === 'webgpu' ? p.fps : Math.min(p.fps, FPS_SIN_GPU);
  const instantes = instantesEnTramos(p.tramos, fps);
  ambito.postMessage({ tipo: 'preparado', backend, fps, fotogramas: instantes.length });

  const entrada = new Input({ source: typeof p.video === 'string' ? new UrlSource(p.video) : new BlobSource(p.video), formats: [MP4, QTFF] });
  try {
    const pista = await entrada.getPrimaryVideoTrack();
    if (!pista) throw new Error('El vídeo no tiene imagen.');
    if (!(await pista.canDecode())) throw new Error('Este navegador no sabe leer la imagen de este vídeo. Prueba con Chrome o Edge.');
    const lado = p.entrada;
    const espec = { ...ESPEC_RFDETR, tamEntrada: lado };
    const ctxModelo = contexto(lado, lado);
    let ctxColor: OffscreenCanvasRenderingContext2D | null = null;
    const registros: RegistroFotograma[] = [];
    let hechos = 0;

    for await (const m of new VideoSampleSink(pista).samplesAtTimestamps(instantes)) {
      hechos++;
      if (!m) continue;
      try {
        const ancho = m.displayWidth;
        const alto = m.displayHeight;
        m.draw(ctxModelo, 0, 0, lado, lado);
        const tensor = new Tensor('float32', aTensorNchw(ctxModelo.getImageData(0, 0, lado, lado).data, lado, 'imagenet'), [1, 3, lado, lado]);
        const salida = await sesion.run({ [sesion.inputNames[0]]: tensor });
        const tensores = sesion.outputNames.map((n) => salida[n]);
        const cajas = tensores.find((t) => t.dims[2] === 4);
        const logits = tensores.find((t) => t.dims[2] !== 4);
        if (!cajas || !logits) throw new Error('El detector no devuelve lo que se esperaba.');
        const t = calcularTransformacion(ancho, alto, lado, 'stretch');
        const f = separar(afinar(decodificarRfdetr(aPlano(cajas), aPlano(logits), espec, t, ancho, alto), espec));

        const escala = Math.min(1, ANCHO_COLOR / ancho);
        const ac = Math.round(ancho * escala);
        const al = Math.round(alto * escala);
        if (!ctxColor || ctxColor.canvas.width !== ac || ctxColor.canvas.height !== al) ctxColor = contexto(ac, al);
        m.draw(ctxColor, 0, 0, ac, al);
        const img = ctxColor.getImageData(0, 0, ac, al);
        const aEscala = (c: Caja): Caja => ({ x: c.x * escala, y: c.y * escala, w: c.w * escala, h: c.h * escala });
        const suelo = colorSuelo(img, f.personas.map(aEscala));
        const referencia = f.balon ? centro(f.balon) : { x: ancho / 2, y: alto / 2 };
        registros.push({
          segundos: redondear(m.timestamp, 3),
          balon: f.balon && cajaCompacta(f.balon),
          personas: masCerca(f.personas, referencia, PERSONAS_POR_FOTOGRAMA).map((c) => {
            const d = descriptorCamiseta(img, aEscala(c), suelo);
            return { caja: cajaCompacta(c), descriptor: d ? Array.from(d, (v) => redondear(v, 4)) : null };
          }),
        });
      } finally {
        m.close();
      }
      if (hechos % 5 === 0 || hechos === instantes.length) ambito.postMessage({ tipo: 'progreso', hechos, total: instantes.length });
    }
    ambito.postMessage({ tipo: 'hecho', registros, backend, segundosPared: (performance.now() - inicio) / 1000 });
  } finally {
    entrada.dispose();
    await sesion.release();
  }
}

ambito.onmessage = (evento) => {
  if (evento.data.tipo !== 'detectar') return;
  detectar(evento.data).catch((e: unknown) => {
    ambito.postMessage({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'La búsqueda de equipos se ha parado por un error inesperado.' });
  });
};
