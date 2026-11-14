import { haCaducado, type Enlace } from '../../comun/compartido';
import { formatearDuracion, formatearTamano } from '../../comun/formato';
import type { Partido } from '../../comun/partido';

/** Los textos de «Mis partidos» y de la subida. Puros: se prueban sin navegador. */

const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function tituloPartido(p: { local: string; visitante: string }): string {
  return `${p.local.trim() || 'Local'} – ${p.visitante.trim() || 'Visitante'}`;
}

/** «8 de noviembre de 2026». La fecha es del partido, no un instante: se lee en UTC para que no cambie de dia. */
export function fechaPartido(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return m ? FECHA.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))) : fecha;
}

export function textoSubida(bytes: number, total: number): string {
  return `Subiendo el vídeo: ${formatearTamano(bytes)} de ${formatearTamano(total)}. Puedes revisar las jugadas mientras tanto.`;
}

/** Solo se abre lo que tiene video entero y jugadas. */
export function sePuedeAbrir(p: Partido): boolean {
  return p.estado === 'subido' && p.editado !== null;
}

export function detallePartido(p: Partido): string {
  if (p.estado === 'subiendo') {
    const hecho = PORCENTAJE.format(p.tamano > 0 ? Math.min(1, p.subido / p.tamano) : 0);
    return `Subida a medias (${hecho}): elige el mismo vídeo en «Nuevo partido» para seguir donde se quedó.`;
  }
  const jugadas = p.fragmentos === null ? 'sin jugadas todavía' : p.fragmentos === 1 ? '1 jugada' : `${p.fragmentos} jugadas`;
  return `${fechaPartido(p.fecha)} · ${formatearDuracion(p.duracion)} · ${jugadas}`;
}

/** Lo que borra la retencion del plan (comun/planes.ts); null si no se borra. */
export function textoBorrado(seBorra: string | null, zonaHoraria?: string): string | null {
  if (seBorra === null) return null;
  const dia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zonaHoraria });
  return `Se borra el ${dia.format(new Date(seBorra))}`;
}

/** La direccion que se manda a los jugadores. */
export function urlEnlace(origen: string, token: string): string {
  return `${origen}/v/${token}`;
}

/** «Caduca el 10 de diciembre de 2026 · 3 vistas». La zona horaria se puede fijar para probarlo. */
export function detalleEnlace(e: Enlace, ahora: Date, zonaHoraria?: string): string {
  const vistas = e.vistas === 1 ? '1 vista' : `${e.vistas} vistas`;
  if (e.caduca === null) return `No caduca · ${vistas}`;
  if (haCaducado(e, ahora)) return `Ha caducado: ya no funciona · ${vistas}`;
  const dia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zonaHoraria });
  return `Caduca el ${dia.format(new Date(e.caduca))} · ${vistas}`;
}
