import type { Equipo } from '../nucleo/fragmentos';
import type { Parte } from '../nucleo/partes';

/**
 * Los enlaces para los jugadores y lo que ven con ellos: solo lo necesario
 * para ver las jugadas. Ni el email del entrenador, ni el nombre del fichero,
 * ni sus correcciones salen por aqui.
 */

export interface Enlace {
  token: string;
  creado: string;
  /** null: no caduca. */
  caduca: string | null;
  vistas: number;
}

export interface JugadaCompartida {
  id: string;
  desde: number;
  hasta: number;
  parte: 1 | 2;
  equipo: Equipo | null;
  /** En la selección del entrenador. */
  estrella?: boolean;
}

export interface PartidoCompartido {
  local: string;
  visitante: string;
  fecha: string;
  duracion: number;
  partes: readonly Parte[];
  jugadas: readonly JugadaCompartida[];
}

/** Lo que puede durar un enlace, en dias; null es para siempre. */
export const CADUCIDADES = [7, 30, null] as const;
export type Caducidad = (typeof CADUCIDADES)[number];

const DIA_MS = 24 * 3600 * 1000;

/** 16 bytes en base64url: 22 caracteres. */
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function esToken(x: string): boolean {
  return TOKEN.test(x);
}

export function leerCaducidad(x: unknown): Caducidad | undefined {
  return CADUCIDADES.find((c) => c === x);
}

export function fechaDeCaducidad(creado: Date, dias: Caducidad): string | null {
  return dias === null ? null : new Date(creado.getTime() + dias * DIA_MS).toISOString();
}

export function haCaducado(e: { caduca: string | null }, ahora: Date): boolean {
  return e.caduca !== null && Date.parse(e.caduca) <= ahora.getTime();
}
