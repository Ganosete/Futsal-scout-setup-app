import type { Caja } from '../deteccion/caja';
import { ESPEC_RFDETR, separar, type Fotograma, type NombresDetector } from '../deteccion/detector';
import { afinar, decodificarRfdetr, type EspecDetector, type TensorPlano } from '../deteccion/postproceso';
import { calcularTransformacion } from '../deteccion/redimension';
import type { ImagenRgba } from '../gris';
import { colorSuelo, descriptorCamiseta } from './color';
import { centro, masCerca, type RegistroFotograma } from './registro';

/**
 * Lo que se hace con cada fotograma mirado para saber quien ataca, de lo que
 * devuelve el detector al registro que se guarda. Lo comparten el navegador
 * (cliente/equipos/trabajador.ts) y el servidor (contenedor/equipos.ts): asi
 * guardan lo mismo, y el reparto de equipos no sabe de donde viene.
 */

/** Tres por segundo bastan para seguir el balon en una jugada. */
export const FPS_EQUIPOS = 3;

/** Las camisetas se miran en esta anchura como mucho: en los 384 px del detector ya no se distinguen bien. */
export const ANCHO_COLOR = 960;

/** Los mas cercanos al balon deciden la posesion; con seis sobra para repartir los equipos. */
export const PERSONAS_POR_FOTOGRAMA = 6;

/** Las clases del detector (las de comun/modelos.ts): el nombre de cada indice y cuales son persona y balon. */
export interface ClasesVistas extends NombresDetector {
  nombres: readonly string[];
}

export function especDetector(lado: number, clases: ClasesVistas): EspecDetector {
  return { ...ESPEC_RFDETR, tamEntrada: lado, clases: [...clases.nombres], clasesPermitidas: [clases.persona, clases.balon] };
}

export interface TamanoColor {
  ancho: number;
  alto: number;
  /** De pixeles del fotograma a pixeles de esta imagen. */
  escala: number;
}

/** La imagen para el color: el fotograma reducido a ANCHO_COLOR si es mas ancho; uno menor no se agranda. */
export function tamanoColor(ancho: number, alto: number): TamanoColor {
  const escala = Math.min(1, ANCHO_COLOR / ancho);
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala), escala };
}

/** Las salidas del detector, lleguen en el orden que lleguen, a personas y balon en pixeles del fotograma. */
export function leerSalidas(salidas: readonly TensorPlano[], espec: EspecDetector, ancho: number, alto: number, nombres: NombresDetector): Fotograma {
  const cajas = salidas.find((t) => t.dims[2] === 4);
  const logits = salidas.find((t) => t.dims[2] !== 4);
  if (!cajas || !logits) throw new Error('El detector no devuelve lo que se esperaba.');
  // El fotograma entra deformado al cuadrado (como RF-DETR se entreno), no encajado con bandas.
  const t = calcularTransformacion(ancho, alto, espec.tamEntrada, 'stretch');
  return separar(afinar(decodificarRfdetr(cajas, logits, espec, t, ancho, alto), espec), nombres);
}

const redondear = (x: number, decimales: number): number => Math.round(x * 10 ** decimales) / 10 ** decimales;
const cajaCompacta = (c: Caja): Caja => ({ x: redondear(c.x, 1), y: redondear(c.y, 1), w: redondear(c.w, 1), h: redondear(c.h, 1) });

/**
 * El registro de un fotograma: el balon y los mas cercanos a el (al centro, si
 * no se ve), con la camiseta medida en la imagen del color. Las cajas van en
 * pixeles del fotograma y redondeadas: dos horas de partido caben en unos MB.
 */
export function registrar(segundos: number, f: Fotograma, color: ImagenRgba, escala: number, ancho: number, alto: number): RegistroFotograma {
  const aEscala = (c: Caja): Caja => ({ x: c.x * escala, y: c.y * escala, w: c.w * escala, h: c.h * escala });
  const suelo = colorSuelo(color, f.personas.map(aEscala));
  const referencia = f.balon ? centro(f.balon) : { x: ancho / 2, y: alto / 2 };
  return {
    segundos: redondear(segundos, 3),
    balon: f.balon && cajaCompacta(f.balon),
    personas: masCerca(f.personas, referencia, PERSONAS_POR_FOTOGRAMA).map((c) => {
      const d = descriptorCamiseta(color, aEscala(c), suelo);
      return { caja: cajaCompacta(c), descriptor: d ? Array.from(d, (v) => redondear(v, 4)) : null };
    }),
  };
}
