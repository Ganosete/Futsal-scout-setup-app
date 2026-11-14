import { ErrorApi } from '../api/api';
import { sePuedeReintentar } from '../subida/subidor';

/**
 * Guarda las jugadas sin que el entrenador piense en ello: un poco despues de
 * cada cambio (si hace varios seguidos, una sola vez), de uno en uno y siempre
 * la ultima version. Un fallo de red se reintenta solo.
 *
 * Si el servidor dice que otra pestana ha guardado antes (412), deja de
 * guardar y lo dice: seguir pisaria lo corregido en la otra.
 */

export type EstadoGuardado =
  | { tipo: 'guardado' }
  | { tipo: 'pendiente' }
  | { tipo: 'guardando' }
  | { tipo: 'reintentando'; mensaje: string }
  | { tipo: 'parado'; mensaje: string };

export interface OpcionesGuardado<T> {
  /** Guarda sobre la version `etag` (null: aun no hay nada) y devuelve la nueva. */
  guardar: (datos: T, etag: string | null) => Promise<string>;
  etag: string | null;
  alCambiar: (e: EstadoGuardado) => void;
  /** Calma que se espera tras un cambio antes de guardar. */
  esperaMs?: number;
  reintentoMs?: number;
}

export class Guardado<T> {
  private etag: string | null;
  private ultimo: T | null = null;
  private sucio = false;
  private enMarcha: Promise<void> | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private parado = false;
  /** El ultimo intento fallo por la red y hay otro programado. */
  private reintentando = false;

  constructor(private readonly o: OpcionesGuardado<T>) {
    this.etag = o.etag;
  }

  /** Hay cambios que aun no estan en el servidor. */
  get pendiente(): boolean {
    return !this.parado && (this.sucio || this.enMarcha !== null);
  }

  cambiar(datos: T): void {
    if (this.parado) return;
    this.ultimo = datos;
    this.sucio = true;
    this.o.alCambiar({ tipo: 'pendiente' });
    this.programar(this.o.esperaMs ?? 1500);
  }

  /** Guarda ya lo que haya, sin esperar la calma. */
  async guardarYa(): Promise<void> {
    for (;;) {
      if (this.enMarcha) {
        await this.enMarcha;
        continue;
      }
      // Tras un fallo de red ya hay un reintento programado: no se insiste aqui.
      if (this.parado || !this.sucio || this.reintentando) return;
      this.quitarTemporizador();
      await this.vaciar();
    }
  }

  /** Deja de guardar (se cierra el partido). */
  parar(): void {
    this.parado = true;
    this.quitarTemporizador();
  }

  private programar(ms: number): void {
    this.quitarTemporizador();
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.vaciar();
    }, ms);
  }

  private quitarTemporizador(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }

  private vaciar(): Promise<void> {
    if (this.enMarcha || !this.sucio || this.parado || this.ultimo === null) return this.enMarcha ?? Promise.resolve();
    const datos = this.ultimo;
    this.sucio = false;
    this.reintentando = false;
    this.o.alCambiar({ tipo: 'guardando' });
    this.enMarcha = (async () => {
      try {
        this.etag = await this.o.guardar(datos, this.etag);
        if (this.parado) return;
        // Lo que cambio mientras se guardaba sale en el siguiente.
        if (this.sucio) this.programar(0);
        else this.o.alCambiar({ tipo: 'guardado' });
      } catch (e) {
        if (this.parado) return;
        if (sePuedeReintentar(e)) {
          this.sucio = true;
          this.reintentando = true;
          this.o.alCambiar({ tipo: 'reintentando', mensaje: (e as Error).message });
          this.programar(this.o.reintentoMs ?? 5000);
          return;
        }
        this.parado = true;
        const mensaje = e instanceof ErrorApi ? e.message : 'No se han podido guardar los cambios.';
        this.o.alCambiar({ tipo: 'parado', mensaje });
      } finally {
        this.enMarcha = null;
      }
    })();
    return this.enMarcha;
  }
}
