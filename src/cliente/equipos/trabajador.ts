import { BlobSource, Input, MP4, QTFF, UrlSource, VideoSampleSink } from 'mediabunny';
import { Tensor } from 'onnxruntime-web/jspi';
import { aTensorNchw } from '../../nucleo/deteccion/preproceso';
import { especDetector, leerSalidas, registrar, tamanoColor } from '../../nucleo/equipos/fotograma';
import { instantesEnTramos, type RegistroFotograma } from '../../nucleo/equipos/registro';
import { FPS_SIN_GPU, type PeticionEquipos, type RespuestaEquipos } from './protocolo';
import { aPlano, crearSesion } from './sesion';

/**
 * La busqueda de equipos, fuera del hilo principal: decodificar los
 * fragmentos y pasar el detector por miles de fotogramas son minutos de
 * calculo. Para pararla, la pagina termina el worker.
 *
 * Cada fotograma se mira dos veces: deformado a 384x384 para el detector y
 * reducido a 960 px de ancho para el color de las camisetas, que en 384 px
 * ya no se distingue bien. Lo que se hace con las dos imagenes esta en el
 * nucleo (nucleo/equipos/fotograma.ts), y el servidor hace lo mismo.
 */

interface AmbitoTrabajador {
  postMessage(mensaje: RespuestaEquipos): void;
  onmessage: ((evento: MessageEvent<PeticionEquipos>) => void) | null;
}

const ambito = self as unknown as AmbitoTrabajador;

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
    const espec = especDetector(lado, p.clases);
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
        const f = leerSalidas(sesion.outputNames.map((n) => aPlano(salida[n])), espec, ancho, alto, p.clases);

        const c = tamanoColor(ancho, alto);
        if (!ctxColor || ctxColor.canvas.width !== c.ancho || ctxColor.canvas.height !== c.alto) ctxColor = contexto(c.ancho, c.alto);
        m.draw(ctxColor, 0, 0, c.ancho, c.alto);
        registros.push(registrar(m.timestamp, f, ctxColor.getImageData(0, 0, c.ancho, c.alto), c.escala, ancho, alto));
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
