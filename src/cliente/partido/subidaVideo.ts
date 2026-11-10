import { partesQueFaltan } from '../../comun/partesSubida';
import type { PartidoParaSubir } from '../../comun/partido';
import { api } from '../api/api';
import { enviarParte } from '../api/enviarParte';
import { subirPartes } from '../subida/subidor';
import type { Barra } from './barra';
import { textoSubida } from './textos';

/** La subida del video de un partido, con su barra y su texto, y el cierre en el servidor. */

export interface SubidaVideo {
  /** true si el video ha quedado entero en R2. */
  hecha: Promise<boolean>;
  /** Para la subida y lo dice (el boton «Parar»). */
  parar: () => void;
  /** Para la subida sin pintar nada mas: se ha abierto otro partido. */
  soltar: () => void;
}

const PARADA = 'Subida parada. Para seguir, elige el mismo vídeo y pulsa «Subir y analizar»: seguirá donde se quedó.';

export function subirVideo(p: PartidoParaSubir, fichero: File, ui: { barra: Barra; estado: HTMLElement }): SubidaVideo {
  const { partido } = p;
  if (partido.estado === 'subido') {
    ui.estado.textContent = 'Este vídeo ya estaba subido.';
    return { hecha: Promise.resolve(false), parar: () => undefined, soltar: () => undefined };
  }
  let suelta = false;
  const decir = (texto: string): void => {
    if (!suelta) ui.estado.textContent = texto;
  };
  const total = fichero.size;
  let ultimo = -1;
  const pintar = (bytes: number): void => {
    if (suelta) return;
    ui.barra.mostrar(bytes / total);
    // El texto es aria-live: una vez por punto porcentual, no a cada paquete.
    const punto = Math.floor((bytes / total) * 100);
    if (punto !== ultimo) decir(textoSubida(bytes, total));
    ultimo = punto;
  };
  pintar(partido.subido);

  const enCurso = subirPartes({
    fichero,
    tamanoParte: p.tamanoParte,
    pendientes: partesQueFaltan(p.partesSubidas, total, p.tamanoParte),
    yaSubidos: partido.subido,
    enviar: (n, trozo, alAvanzar, senal) => enviarParte(api.urlParte(partido.id, n), trozo, alAvanzar, senal),
    alAvanzar: pintar,
  });

  const hecha = (async (): Promise<boolean> => {
    try {
      if ((await enCurso.resultado) === 'parada') {
        decir(PARADA);
        return false;
      }
      decir('Terminando la subida…');
      await api.completar(partido.id);
      if (!suelta) ui.barra.mostrar(1);
      decir('Vídeo subido.');
      return true;
    } catch (e) {
      decir(`La subida se ha cortado: ${(e as Error).message} Elige el mismo vídeo y pulsa «Subir y analizar» para seguir donde se quedó.`);
      return false;
    }
  })();

  return {
    hecha,
    parar: () => enCurso.parar(),
    soltar: () => {
      suelta = true;
      enCurso.parar();
    },
  };
}
