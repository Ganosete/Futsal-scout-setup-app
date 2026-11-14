import { ritmoDelPartido } from '../../comun/ritmo';
import type { Nombres } from '../analisis/resumen';
import type { DatosNombre } from '../descarga/nombre';
import { el } from '../dom';
import type { EstadoEditor } from '../editor/operaciones';
import { GraficoRitmo } from './graficoRitmo';

/** «Ritmo del partido» en el editor: se vuelve a pintar con cada cambio de los fragmentos. */
export interface BloqueRitmo {
  pintar: (e: EstadoEditor, partido: DatosNombre) => void;
  cerrar: () => void;
}

/** En pantalla, un equipo sin nombre es «Local» o «Visitante», como en el editor. */
export const nombresEnPantalla = (p: DatosNombre): Nombres => ({ local: p.local.trim() || 'Local', visitante: p.visitante.trim() || 'Visitante' });

export function crearBloqueRitmo(): BloqueRitmo {
  const bloque = el<HTMLElement>('bloque-ritmo');
  const grafico = new GraficoRitmo(el('grafico-ritmo'));
  return {
    pintar: (e, partido) => {
      bloque.hidden = false;
      grafico.pintar(ritmoDelPartido(e.fragmentos, e.partes), nombresEnPantalla(partido));
    },
    cerrar: () => {
      bloque.hidden = true;
    },
  };
}
