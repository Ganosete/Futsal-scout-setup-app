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
