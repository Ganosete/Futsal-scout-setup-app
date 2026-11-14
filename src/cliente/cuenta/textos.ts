import type { Cuenta } from '../../comun/cuenta';
import { formatearTamano } from '../../comun/formato';
import { fechaDeBorrado, plan, type Plan, type Uso } from '../../comun/planes';

/** Los textos de «Mi cuenta» y de los planes. Puros: se prueban sin navegador. */

const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const ENTERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const GB = 1024 ** 3;

const formatoDia = (zona?: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zona });

export function precio(p: Plan): string {
  return p.precioMes === 0 ? 'Gratis' : `${EUROS.format(p.precioMes)} al mes`;
}

export function textoRetencion(dias: number): string {
  if (dias % 365 !== 0) return `${dias} días`;
  const anos = dias / 365;
  return anos === 1 ? '1 año' : `${anos} años`;
}

/** Lo que deja cada plan, un limite por linea. Los planes van en gigas enteros. */
export function lineasPlan(p: Plan): string[] {
  return [
    p.partidos === null ? 'Partidos sin límite' : `Hasta ${p.partidos} partidos`,
    `${ENTERO.format(p.almacenamientoBytes / GB)} GB de vídeo`,
    p.retencionDias === null ? 'No se borra ningún partido' : `Cada partido se guarda ${textoRetencion(p.retencionDias)}`,
  ];
}

export type Nivel = 'normal' | 'aviso' | 'lleno';

/** Una fila de los medidores de uso. */
export interface Medida {
  nombre: string;
  cifra: string;
  /** De 0 a 1; null si el plan no tiene limite y no hay barra que llenar. */
  fraccion: number | null;
  nivel: Nivel;
}

/** Casi lleno desde el 80 %: avisa antes de que una subida no quepa. */
export function nivelDe(fraccion: number): Nivel {
  return fraccion >= 1 ? 'lleno' : fraccion >= 0.8 ? 'aviso' : 'normal';
}

export const TEXTO_NIVEL: Readonly<Record<Nivel, string>> = { normal: '', aviso: 'Casi lleno', lleno: 'Lleno' };

export function medidasDeUso(uso: Uso, p: Plan): Medida[] {
  const partidos: Medida =
    p.partidos === null
      ? { nombre: 'Partidos', cifra: `${uso.partidos} · sin límite`, fraccion: null, nivel: 'normal' }
      : { nombre: 'Partidos', cifra: `${uso.partidos} de ${p.partidos}`, fraccion: Math.min(1, uso.partidos / p.partidos), nivel: nivelDe(uso.partidos / p.partidos) };
  const ocupado = uso.bytes / p.almacenamientoBytes;
  return [
    partidos,
    {
      nombre: 'Almacenamiento',
      cifra: `${formatearTamano(uso.bytes)} de ${formatearTamano(p.almacenamientoBytes)}`,
      fraccion: Math.min(1, ocupado),
      nivel: nivelDe(ocupado),
    },
  ];
}

/** «Plan Gratuito desde el 12 de noviembre de 2026». */
export function resumenPlan(c: Cuenta, zona?: string): string {
  return `Plan ${plan(c.plan).nombre} desde el ${formatoDia(zona).format(new Date(c.planDesde))}`;
}

/**
 * Lo que pasa con lo ya subido si se cambia hoy a `destino`: sus dias vuelven a
 * contar desde el cambio (comun/planes.ts). Al bajar se dice con la fecha,
 * para que nadie pierda un partido sin saberlo.
 */
export function efectoDelCambio(actual: Plan, destino: Plan, uso: Uso, ahora: Date, zona?: string): string {
  if (destino.retencionDias === null) return `Con el plan ${destino.nombre} no se borra ningún partido.`;
  const nuevos = `${textoRetencion(destino.retencionDias)} desde que lo subas`;
  if (uso.partidos === 0) return `Cada partido se guardará ${nuevos}.`;
  const fecha = formatoDia(zona).format(new Date(fechaDeBorrado(ahora.toISOString(), ahora.toISOString(), destino) ?? ahora));
  const baja = actual.retencionDias === null || destino.retencionDias < actual.retencionDias;
  if (!baja) return `Lo que ya tienes subido se guardará hasta el ${fecha}, y cada partido nuevo, ${nuevos}.`;
  const cuales = uso.partidos === 1 ? 'El partido que ya tienes se borrará' : `Los ${uso.partidos} partidos que ya tienes se borrarán`;
  return `${cuales} el ${fecha}: bájate antes lo que quieras guardar. Cada partido nuevo se guardará ${nuevos}.`;
}

export function textoCambiado(p: Plan): string {
  return `Ya tienes el plan ${p.nombre}. Es una maqueta: no se ha cobrado nada.`;
}
