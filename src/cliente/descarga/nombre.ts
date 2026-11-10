/**
 * El nombre del fichero que se descarga: que se entienda en la carpeta de
 * descargas o en un chat del equipo sin abrirlo, y que no rompa en ningun
 * sistema (sin tildes, espacios ni barras).
 */

export interface DatosNombre {
  local: string;
  visitante: string;
  /** AAAA-MM-DD, o vacia. */
  fecha: string;
}

/** «Atlético Benavente FS» -> «atletico-benavente-fs». */
export function aSlug(texto: string, largoMaximo = 40): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, largoMaximo)
    .replace(/-+$/g, '');
}

/** 750 -> «12m30s»; 3725 -> «1h02m05s». */
export function instanteEnNombre(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}h${dos(m)}m${dos(s)}s` : `${m}m${dos(s)}s`;
}

/** «castillo-de-requena-fs-feme-castellon-2026-11-08-jugada-03-12m30s.mp4» */
export function nombreClip(d: DatosNombre, numero: number, desde: number): string {
  const equipos = [aSlug(d.local), aSlug(d.visitante)].filter((x) => x.length > 0).join('-') || 'partido';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? `-${d.fecha}` : '';
  return `${equipos}${fecha}-jugada-${String(numero).padStart(2, '0')}-${instanteEnNombre(desde)}.mp4`;
}
