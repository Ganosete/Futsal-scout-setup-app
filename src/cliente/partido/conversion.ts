import type { Edicion } from '../../comun/edicion';
import type { Intervalo } from '../../nucleo/balonParado/tramos';
import type { EstadoEditor } from '../editor/operaciones';

/** Del editor a lo que se guarda en el servidor, y al reves. Lo del analisis esta en comun/guardadoAnalisis.ts. */

export function edicionDeEstado(e: EstadoEditor, tramos: readonly Intervalo[]): Edicion {
  return { version: 1, duracion: e.duracion, partes: e.partes, fragmentos: e.fragmentos, correcciones: e.correcciones, tramos, pista: e.pista };
}

export function estadoDeEdicion(e: Edicion): EstadoEditor {
  return { duracion: e.duracion, partes: e.partes, fragmentos: e.fragmentos, correcciones: e.correcciones, pista: e.pista };
}
