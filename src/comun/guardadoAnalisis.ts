import type { ResultadoAnalisis, SenalesAnalisis } from '../nucleo/analizar';
import type { Edicion } from './edicion';

/**
 * De lo que sale del analisis a lo que se guarda: la primera edicion y las
 * senales. Lo usan el navegador, cuando analiza mientras sube, y el
 * contenedor, cuando analiza en el servidor: los dos tienen que guardar lo
 * mismo.
 */

export function edicionDeAnalisis(r: ResultadoAnalisis, duracion: number): Edicion {
  return {
    version: 1,
    duracion,
    partes: r.partes,
    fragmentos: r.fragmentos,
    correcciones: [],
    // Del balon parado solo hace falta donde esta: con eso se calculan los fragmentos al alargar una parte.
    tramos: r.tramos.map(({ desde, hasta }) => ({ desde, hasta })),
    pista: null,
  };
}

const redondear = (x: number, decimales: number): number => Math.round(x * 10 ** decimales) / 10 ** decimales;

/**
 * Las senales con la precision que sirve y no mas: la actividad son 36.000
 * muestras en dos horas, y con todos sus decimales el JSON pasa de 1,5 MB.
 * Los umbrales comparan contra la mediana; cuatro cifras significativas
 * sobran para volver a calcular.
 */
export function compactarSenales(s: SenalesAnalisis): SenalesAnalisis {
  return {
    duracion: s.duracion,
    pitidos: s.pitidos?.map((p) => ({ desde: redondear(p.desde, 3), hasta: redondear(p.hasta, 3), frecuenciaHz: Math.round(p.frecuenciaHz), fuerza: redondear(p.fuerza, 3) })) ?? null,
    actividad: s.actividad.map((m) => ({ segundos: redondear(m.segundos, 3), valor: Number(m.valor.toPrecision(4)) })),
  };
}
