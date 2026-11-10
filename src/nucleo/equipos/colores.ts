import { distanciaDescriptores, OPCIONES_DESCRIPTOR } from './color';
import { kmeans } from './kmeans';
import type { RegistroFotograma } from './registro';

/**
 * Los dos colores de camiseta del partido. Se agrupan las camisetas de los
 * jugadores cerca del balon en dos grupos (k-medias) y el entrenador dice con
 * un clic cual es el suyo: clasificar contra dos colores que confirma una
 * persona falla mucho menos que adivinar a ciegas que grupo es cada equipo.
 */

export interface Grupo {
  centroide: Float32Array;
  muestras: number;
  /** «roja», «blanca», «azul oscuro»... para preguntar al entrenador. */
  nombre: string;
  /** Color CSS de muestra. */
  muestra: string;
}

export interface Colores {
  grupos: [Grupo, Grupo];
  /** Distancia entre los dos centroides: si es pequena, no se distinguen. */
  separacion: number;
}

/** Por debajo de esto los dos grupos son el mismo color mal partido. */
export const SEPARACION_MINIMA = 0.25;
/** Con menos camisetas medidas no hay con que repartir. */
export const MUESTRAS_MINIMAS = 10;

const NOMBRES_TONO = ['roja', 'naranja', 'amarilla', 'verde lima', 'verde', 'verde agua', 'turquesa', 'azul celeste', 'azul', 'morada', 'rosa', 'roja'];

/** El nombre y el color de muestra del cubo que mas pesa del descriptor. */
export function nombrarColor(d: Float32Array | readonly number[]): { nombre: string; muestra: string } {
  const cubos = OPCIONES_DESCRIPTOR.cubosTono;
  let mayor = 0;
  for (let i = 1; i < d.length; i++) if (d[i] > d[mayor]) mayor = i;
  if (mayor === cubos) return { nombre: 'negra', muestra: '#1d1d1d' };
  if (mayor === cubos + 1) return { nombre: 'gris', muestra: '#8a8a8a' };
  if (mayor === cubos + 2) return { nombre: 'blanca', muestra: '#f2f2f2' };
  const tono = (mayor + 0.5) * (360 / cubos);
  return { nombre: NOMBRES_TONO[mayor] ?? 'de color', muestra: `hsl(${Math.round(tono)} 70% 45%)` };
}

export function repartirColores(registros: readonly RegistroFotograma[]): Colores | null {
  const muestras: Float32Array[] = [];
  for (const r of registros) {
    for (const p of r.personas) if (p.descriptor) muestras.push(Float32Array.from(p.descriptor));
  }
  if (muestras.length < MUESTRAS_MINIMAS) return null;
  const k = kmeans(muestras, { k: 2 });
  if (!k) return null;
  const grupo = (i: number): Grupo => ({
    centroide: k.centroides[i],
    muestras: k.grupos.filter((g) => g === i).length,
    ...nombrarColor(k.centroides[i]),
  });
  return { grupos: [grupo(0), grupo(1)], separacion: distanciaDescriptores(k.centroides[0], k.centroides[1]) };
}
