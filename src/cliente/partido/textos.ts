import { haCaducado, type Enlace } from '../../comun/compartido';
import { formatearDuracion, formatearTamano } from '../../comun/formato';
import type { Partido } from '../../comun/partido';
import type { Procesado } from '../../comun/procesado';
import type { EstadoGuardado } from '../editor/guardado';

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

const ENTERO_PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });

/** Si el servidor esta con el (esperando o trabajando): mientras, la lista se refresca sola. */
export function trabajaEnServidor(p: Pick<Partido, 'servidor'>): boolean {
  return p.servidor?.estado === 'esperando' || p.servidor?.estado === 'trabajando';
}

/** En que va en el servidor, para la fila de «Mis partidos»; null si no hay nada que contar. */
export function textoServidor(s: Procesado | null): string | null {
  if (!s) return null;
  const pct = ENTERO_PORCENTAJE.format(s.avance);
  if (s.estado === 'esperando') return 'En el servidor: esperando turno.';
  if (s.estado === 'trabajando') {
    if (s.fase === 'guardando') return 'En el servidor: guardando las jugadas.';
    if (s.fase === 'subiendo') return `En el servidor: preparando el vídeo para los jugadores (${pct}).`;
    if (s.fase === 'detectando') return `En el servidor: buscando quién ataca (${pct}).`;
    return `En el servidor: buscando las jugadas (${pct}).`;
  }
  if (s.estado === 'fallo') return s.mensaje ?? 'El servidor no ha podido procesarlo.';
  if (s.mensaje) return `Procesado en el servidor. ${s.mensaje}`;
  return s.ligero ? 'Los jugadores ven la versión ligera (720p).' : null;
}

/** El boton para pedirlo al servidor: si nunca se ha procesado alli, o si fallo. Null si no toca. */
export function botonServidor(p: Pick<Partido, 'estado' | 'servidor'>): string | null {
  if (p.estado !== 'subido') return null;
  if (p.servidor === null) return 'Procesar en el servidor';
  return p.servidor.estado === 'fallo' ? 'Reintentar en el servidor' : null;
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

/** Lo que se dice bajo el editor mientras se guardan los cambios. */
export function textoGuardado(e: EstadoGuardado): string {
  if (e.tipo === 'guardado') return 'Cambios guardados.';
  if (e.tipo === 'reintentando') return `No se han podido guardar los cambios (${e.mensaje}): se vuelve a intentar en unos segundos.`;
  if (e.tipo === 'parado') return `Los cambios ya no se guardan: ${e.mensaje}`;
  return 'Guardando…';
}
