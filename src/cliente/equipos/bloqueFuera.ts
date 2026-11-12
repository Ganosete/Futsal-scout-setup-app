import { balonesFuera } from '../../nucleo/balonParado/balonFuera';
import type { SalidaBalon } from '../../nucleo/balonParado/porBalon';
import type { RegistroFotograma } from '../../nucleo/equipos/registro';
import type { Calibracion } from '../../nucleo/pista/calibracion';
import { el } from '../dom';
import { loQueQuitaria, quitarBalonesFuera } from '../editor/balonFueraAuto';
import type { Editor } from '../editor/editor';

/**
 * «Balones fuera», dentro de «Quién ataca»: con la pista marcada y las
 * detecciones hechas, cuantas veces se ha visto salir el balon dentro de los
 * fragmentos y un boton para quitar esos ratos. Se vuelve a pintar con cada
 * cambio del editor: marcar la pista, deshacer o corregir cambian la cuenta.
 */

const SEGUNDOS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export class BloqueFuera {
  private readonly bloque = el<HTMLDivElement>('fuera-equipos');
  private readonly texto = el<HTMLParagraphElement>('texto-fuera');
  private readonly boton = el<HTMLButtonElement>('btn-quitar-fuera');
  private readonly video = el<HTMLVideoElement>('video-editor');
  private registros: readonly RegistroFotograma[] = [];
  /** Las salidas de la ultima pista y las ultimas detecciones: calcularlas cuesta poco, pero no en cada correccion. */
  private hechas: { pista: Calibracion; registros: readonly RegistroFotograma[]; salidas: SalidaBalon[] } | null = null;

  constructor(private readonly editor: Editor) {
    this.boton.addEventListener('click', () => {
      const salidas = this.salidas();
      if (!salidas) return;
      this.editor.cambiar(
        (e) => quitarBalonesFuera(e, salidas, () => crypto.randomUUID()),
        (nuevo) => `Balones fuera quitados: quedan ${nuevo.fragmentos.length} fragmentos.`,
        'Los balones fuera ya estaban quitados.',
      );
    });
    this.video.addEventListener('loadedmetadata', () => this.pintar());
  }

  /** Las detecciones del partido abierto, o ninguna. */
  usar(registros: readonly RegistroFotograma[]): void {
    this.registros = registros;
    this.hechas = null;
    this.pintar();
  }

  private salidas(): SalidaBalon[] | null {
    const pista = this.editor.estado?.pista ?? null;
    if (!pista || this.registros.length === 0 || !(this.video.videoWidth > 0)) return null;
    if (this.hechas?.pista !== pista || this.hechas.registros !== this.registros) {
      this.hechas = { pista, registros: this.registros, salidas: balonesFuera(this.registros, pista, this.video.videoWidth, this.video.videoHeight) };
    }
    return this.hechas.salidas;
  }

  pintar(): void {
    const e = this.editor.estado;
    const salidas = this.salidas();
    this.bloque.hidden = !e || !salidas;
    if (!e || !salidas) return;
    const q = loQueQuitaria(e, salidas);
    this.boton.hidden = q.veces === 0;
    if (salidas.length === 0) this.texto.textContent = 'Con la pista marcada no se ha visto salir el balón.';
    else if (q.veces === 0) this.texto.textContent = 'Los balones fuera que se han visto ya no están en los fragmentos.';
    else {
      const veces = q.veces === 1 ? 'una vez' : `${q.veces} veces`;
      this.texto.textContent = `Se ha visto salir el balón ${veces} dentro de los fragmentos: ${SEGUNDOS.format(q.segundos)} s de balón parado.`;
    }
  }
}
