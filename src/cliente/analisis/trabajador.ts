import { BlobSource, Input, MP4, QTFF } from 'mediabunny';
import { analizarSenales } from '../../nucleo/analizar';
import { escucharAudio, medirImagen } from './lectura';
import type { PeticionAnalisis, RespuestaAnalisis } from './protocolo';

/**
 * El analisis, fuera del hilo principal: decodificar dos horas de audio y de
 * imagen son minutos de calculo que no pueden congelar la pagina. Para pararlo,
 * la pagina termina el worker; no hace falta nada mas.
 */

/** Lo que se usa del ambito del worker; asi no hace falta mezclar los tipos del DOM y de WebWorker. */
interface AmbitoTrabajador {
  postMessage(mensaje: RespuestaAnalisis): void;
  onmessage: ((evento: MessageEvent<PeticionAnalisis>) => void) | null;
}

const ambito = self as unknown as AmbitoTrabajador;

async function analizar(fichero: File, fps: number): Promise<void> {
  const inicio = performance.now();
  const entrada = new Input({ source: new BlobSource(fichero), formats: [MP4, QTFF] });
  try {
    const duracion = await entrada.computeDuration();
    let audio = 0;
    let imagen = 0;
    let enviado = -1;
    const avisar = (): void => {
      // Un mensaje por punto porcentual: cientos en todo el partido, no miles.
      const f = Math.floor(((audio + imagen) / 2) * 100) / 100;
      if (f === enviado) return;
      enviado = f;
      ambito.postMessage({ tipo: 'progreso', fraccion: f });
    };
    const avanceAudio = (f: number): void => {
      audio = Math.min(1, f);
      avisar();
    };
    const avanceImagen = (f: number): void => {
      imagen = Math.min(1, f);
      avisar();
    };
    // Audio e imagen a la vez: uno tira de la CPU y el otro del decodificador de video.
    const [escucha, actividad] = await Promise.all([
      escucharAudio(entrada, duracion, { alAvanzar: avanceAudio }),
      medirImagen(entrada, duracion, fps, { alAvanzar: avanceImagen }),
    ]);
    const senales = { duracion, pitidos: escucha.pitidos, actividad };
    const resultado = analizarSenales(senales, () => crypto.randomUUID());
    ambito.postMessage({
      tipo: 'hecho',
      senales,
      resultado,
      avisos: escucha.aviso ? [escucha.aviso] : [],
      segundosPared: (performance.now() - inicio) / 1000,
    });
  } finally {
    entrada.dispose();
  }
}

ambito.onmessage = (evento) => {
  const { fichero, fps } = evento.data;
  analizar(fichero, fps).catch((e: unknown) => {
    ambito.postMessage({ tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) });
  });
};
