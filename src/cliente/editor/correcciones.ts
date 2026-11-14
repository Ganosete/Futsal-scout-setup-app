import { formatearDuracion } from '../../comun/formato';
import { fragmentoEn, moverFin, moverInicio, partir, quitar, unirConSiguiente, type EstadoEditor } from './operaciones';

/**
 * Las correcciones de la barra (unir, partir, ajustar inicio y fin, quitar),
 * con lo que se le dice al entrenador en cada caso. Puras: devuelven el
 * cambio y el editor lo aplica.
 */

export type AccionCorreccion = 'unir' | 'partir' | 'inicioAqui' | 'finAqui' | 'quitar';

export type Cambio =
  | { tipo: 'nada' }
  | { tipo: 'aviso'; mensaje: string }
  | {
      tipo: 'cambio';
      /** null si no se puede (y entonces se dice `imposible`). */
      nuevo: EstadoEditor | null;
      hecho: (e: EstadoEditor) => string;
      imposible: string;
      /** El fragmento que queda elegido. */
      seleccionado: string;
    };

const numero = (e: EstadoEditor, id: string): number => e.fragmentos.findIndex((f) => f.id === id) + 1;

export function corregir(accion: AccionCorreccion, e: EstadoEditor, seleccionado: string | null, t: number, nuevoId: () => string): Cambio {
  const f = e.fragmentos.find((x) => x.id === seleccionado);
  if (accion === 'partir') {
    // Se parte el fragmento donde esta el video, aunque el elegido sea otro.
    const objetivo = fragmentoEn(e, t) ?? f;
    if (!objetivo) return { tipo: 'aviso', mensaje: 'Lleva el vídeo dentro del fragmento que quieres partir.' };
    const n = numero(e, objetivo.id);
    return {
      tipo: 'cambio',
      nuevo: partir(e, objetivo.id, t, nuevoId),
      hecho: () => `Fragmento ${n} partido en ${formatearDuracion(t)}.`,
      imposible: 'Para partir, el vídeo tiene que estar dentro del fragmento y a más de medio segundo de sus bordes.',
      seleccionado: objetivo.id,
    };
  }
  if (!f) return { tipo: 'nada' };
  const n = numero(e, f.id);
  const bordes = (nuevo: EstadoEditor): string => {
    const g = nuevo.fragmentos.find((x) => x.id === f.id);
    return g ? `${formatearDuracion(g.desde)} – ${formatearDuracion(g.hasta)}` : '';
  };
  const base = { tipo: 'cambio' as const, seleccionado: f.id };
  if (accion === 'unir') {
    return { ...base, nuevo: unirConSiguiente(e, f.id), hecho: () => `Fragmentos ${n} y ${n + 1} unidos.`, imposible: 'No hay un fragmento siguiente en la misma parte con el que unirlo.' };
  }
  if (accion === 'inicioAqui') {
    return { ...base, nuevo: moverInicio(e, f.id, t), hecho: (nuevo) => `Fragmento ${n}: ${bordes(nuevo)}.`, imposible: 'El inicio ya está ahí, o pisaría al fragmento anterior.' };
  }
  if (accion === 'finAqui') {
    return { ...base, nuevo: moverFin(e, f.id, t), hecho: (nuevo) => `Fragmento ${n}: ${bordes(nuevo)}.`, imposible: 'El final ya está ahí, o pisaría al fragmento siguiente.' };
  }
  return { ...base, nuevo: quitar(e, f.id), hecho: () => `Fragmento ${n} quitado.`, imposible: '' };
}
