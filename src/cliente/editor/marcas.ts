import type { Equipo, Fragmento } from '../../nucleo/fragmentos';
import type { Nombres } from '../analisis/resumen';
import type { Cambio } from './correcciones';
import { ponerEquipo, type EstadoEditor } from './operaciones';

/**
 * Lo que se marca en el fragmento elegido: quien ataca y si va en «Mi
 * selección». Puras, como las correcciones: devuelven el cambio y el editor
 * lo aplica.
 *
 * El equipo es una correccion (queda manual y se apunta); la estrella no:
 * no dice nada del detector, solo que el entrenador quiere ese fragmento
 * para la charla. Al partir o recortar, los trozos se la quedan.
 */

export type AccionMarca = Equipo | 'estrella';

const numero = (e: EstadoEditor, id: string): number => e.fragmentos.findIndex((f) => f.id === id) + 1;

/** La estrella puesta o quitada; sin marcar no se guarda el campo. */
export function alternarEstrella(e: EstadoEditor, id: string): EstadoEditor | null {
  const i = e.fragmentos.findIndex((f) => f.id === id);
  if (i === -1) return null;
  const f = e.fragmentos[i];
  const { estrella: _, ...sin } = f;
  const nuevo: Fragmento = f.estrella ? sin : { ...f, estrella: true };
  return { ...e, fragmentos: [...e.fragmentos.slice(0, i), nuevo, ...e.fragmentos.slice(i + 1)] };
}

export const enSeleccion = <T extends { estrella?: boolean }>(lista: readonly T[]): T[] => lista.filter((f) => f.estrella === true);

export function marcar(accion: AccionMarca, e: EstadoEditor, seleccionado: string | null, nombres: Nombres): Cambio {
  const f = e.fragmentos.find((x) => x.id === seleccionado);
  if (!f) return { tipo: 'nada' };
  const n = numero(e, f.id);
  if (accion === 'estrella') {
    return {
      tipo: 'cambio',
      nuevo: alternarEstrella(e, f.id),
      hecho: () => (f.estrella ? `Fragmento ${n}: fuera de tu selección.` : `Fragmento ${n}: en tu selección.`),
      imposible: '',
      seleccionado: f.id,
    };
  }
  // Pulsar el equipo que ya tiene se lo quita.
  const equipo = f.equipo === accion ? null : accion;
  return {
    tipo: 'cambio',
    nuevo: ponerEquipo(e, f.id, equipo),
    hecho: () => (equipo ? `Fragmento ${n}: ataca ${nombres[equipo]}.` : `Fragmento ${n}: sin equipo.`),
    imposible: '',
    seleccionado: f.id,
  };
}
