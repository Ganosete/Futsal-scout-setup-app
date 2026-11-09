import type { Intervalo } from '../../nucleo/balonParado/tramos';
import { haTerminado, saltoTodoSeguido } from './reproduccion';

/**
 * El <video> del editor: ver un fragmento (y pararse al final) o todos
 * seguidos (saltandose el balon parado). Reproduce el fichero original, sin
 * recortar nada: un fragmento es solo [desde, hasta).
 *
 * Se vigila fotograma a fotograma con requestVideoFrameCallback donde exista;
 * `timeupdate` solo avisa unas cuatro veces por segundo y el final de un
 * fragmento se pasaria de largo.
 */

type Modo = { tipo: 'libre' } | { tipo: 'fragmento'; tramo: Intervalo } | { tipo: 'todo'; fragmentos: () => readonly Intervalo[] };

export class Reproductor {
  private url: string | null = null;
  private modo: Modo = { tipo: 'libre' };
  private readonly oyentes: ((t: number) => void)[] = [];

  constructor(private readonly video: HTMLVideoElement) {
    const vigilar = (): void => this.vigilar();
    if (typeof video.requestVideoFrameCallback === 'function') {
      const cadaFotograma = (): void => {
        vigilar();
        video.requestVideoFrameCallback(cadaFotograma);
      };
      video.requestVideoFrameCallback(cadaFotograma);
    }
    video.addEventListener('timeupdate', vigilar);
    video.addEventListener('seeked', vigilar);
  }

  cargar(fichero: File): void {
    this.soltar();
    this.url = URL.createObjectURL(fichero);
    this.video.src = this.url;
  }

  /** Deja de reproducir y libera el fichero. */
  soltar(): void {
    this.video.pause();
    this.modo = { tipo: 'libre' };
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.video.removeAttribute('src');
    this.video.load();
  }

  get tiempo(): number {
    return this.video.currentTime;
  }

  get reproduciendo(): boolean {
    return !this.video.paused;
  }

  alCambiarTiempo(f: (t: number) => void): void {
    this.oyentes.push(f);
  }

  buscar(t: number): void {
    this.modo = { tipo: 'libre' };
    const fin = Number.isFinite(this.video.duration) ? this.video.duration : t;
    this.video.currentTime = Math.min(Math.max(0, t), fin);
  }

  alternar(): void {
    if (this.video.paused) this.reproducir();
    else this.video.pause();
  }

  verFragmento(tramo: Intervalo): void {
    this.modo = { tipo: 'fragmento', tramo };
    this.video.currentTime = tramo.desde;
    this.reproducir();
  }

  verTodo(fragmentos: () => readonly Intervalo[]): void {
    this.modo = { tipo: 'todo', fragmentos };
    const salto = saltoTodoSeguido(fragmentos(), this.video.currentTime);
    // Pasado el ultimo fragmento, se empieza otra vez por el primero.
    if (salto === Number.POSITIVE_INFINITY) this.video.currentTime = fragmentos()[0]?.desde ?? 0;
    else if (salto !== null) this.video.currentTime = salto;
    this.reproducir();
  }

  private reproducir(): void {
    // play() se rechaza si el navegador no deja reproducir aun; el usuario vuelve a pulsar.
    this.video.play().catch(() => undefined);
  }

  private vigilar(): void {
    const t = this.video.currentTime;
    for (const f of this.oyentes) f(t);
    if (this.video.paused) return;
    if (this.modo.tipo === 'fragmento' && haTerminado(this.modo.tramo, t)) {
      this.video.pause();
      this.modo = { tipo: 'libre' };
    } else if (this.modo.tipo === 'todo') {
      const salto = saltoTodoSeguido(this.modo.fragmentos(), t);
      if (salto === Number.POSITIVE_INFINITY) {
        this.video.pause();
        this.modo = { tipo: 'libre' };
      } else if (salto !== null) {
        this.video.currentTime = salto;
      }
    }
  }
}
