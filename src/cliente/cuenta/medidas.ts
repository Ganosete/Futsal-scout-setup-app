import type { Plan, Uso } from '../../comun/planes';
import { crear } from '../dom';
import { medidasDeUso, TEXTO_NIVEL, type Medida } from './textos';

/**
 * Los medidores de uso, como lista (skill de dataviz): nombre, barra fina y
 * cifra en cada fila, con las barras alineadas. El relleno lleva lo lleno que
 * esta (acento, aviso, error) y la pista es un tono del mismo color; el
 * estado lo dicen tambien un icono y una palabra, nunca el color solo. La
 * barra es para la vista: lo que lee un lector de pantalla es la cifra.
 */

const SVG = 'http://www.w3.org/2000/svg';

/** Un triangulo con exclamacion, del color del relleno. */
function icono(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'medida-icono');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M8 1.8 15 14.2H1Z', 'M8 6.2v3.6M8 11.6v.4']) {
    const trazo = document.createElementNS(SVG, 'path');
    trazo.setAttribute('d', d);
    svg.append(trazo);
  }
  return svg;
}

function fila(m: Medida): HTMLDivElement {
  const div = crear('div', 'medida');
  div.dataset.nivel = m.nivel;
  const cifra = crear('span', 'medida-cifra', m.cifra);
  if (m.nivel !== 'normal') {
    const nivel = crear('span', 'medida-nivel');
    nivel.append(icono(), ` ${TEXTO_NIVEL[m.nivel]}`);
    cifra.append(' · ', nivel);
  }
  div.append(crear('span', 'medida-nombre', m.nombre), cifra);
  if (m.fraccion !== null) {
    const barra = crear('span', 'medida-barra');
    barra.setAttribute('aria-hidden', 'true');
    const relleno = crear('span', 'medida-relleno');
    relleno.style.width = `${100 * m.fraccion}%`;
    barra.append(relleno);
    div.append(barra);
  }
  return div;
}

export function pintarMedidas(donde: HTMLElement, uso: Uso, p: Plan): void {
  donde.replaceChildren(...medidasDeUso(uso, p).map(fila));
}
