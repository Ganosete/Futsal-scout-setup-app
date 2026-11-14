import { formatearDuracion } from '../../comun/formato';
import { reparto, TRAMO_RITMO_SEG, type ParteRitmo, type Reparto, type Ritmo, type TramoRitmo } from '../../comun/ritmo';
import type { Nombres } from '../analisis/resumen';
import { crear } from '../dom';

/**
 * El grafico de «Ritmo del partido», en SVG a pelo: una leyenda, los totales
 * con una barra fina por fila y, por cada parte, columnas apiladas de 5
 * minutos (cuanto se juega y de quien es el balon). Cada columna se puede
 * enfocar y dice sus cifras; las mismas estan en la tabla de debajo, asi que
 * nada depende del color ni del raton.
 *
 * Las medidas siguen la guia de graficos: columnas de 24 px como mucho, 2 px
 * de superficie entre tramos apilados, el extremo de arriba redondeado y la
 * rejilla en linea fina. Los colores salen de los tokens del tema.
 */

const SVG = 'http://www.w3.org/2000/svg';
const ALTO_TRAZADO = 120;
const EJE_X = 22;
const EJE_Y = 30;
const ARRIBA = 10;
const ANCHO_MAXIMO_COLUMNA = 24;
const HUECO = 2;
const RADIO = 4;
const PORCENTAJE = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const SERIES = ['local', 'visitante', 'sinEquipo'] as const;

type Serie = (typeof SERIES)[number];

function nodo<K extends keyof SVGElementTagNameMap>(etiqueta: K, atributos: Record<string, string | number>, clase?: string): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG, etiqueta);
  if (clase) n.setAttribute('class', clase);
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, String(v));
  return n;
}

const minuto = (s: number): string => `${Math.round(s / 60)}'`;
const nombreParte = (p: ParteRitmo): string => (p.numero === 1 ? '1.ª parte' : '2.ª parte');

/** Un rectangulo con las esquinas de arriba redondeadas: el extremo de la columna. */
function rectanguloRedondeado(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, alto, ancho / 2);
  return `M${x},${y + alto}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + ancho - r},${y}Q${x + ancho},${y} ${x + ancho},${y + r}L${x + ancho},${y + alto}Z`;
}

export class GraficoRitmo {
  private ultimo: { ritmo: Ritmo; nombres: Nombres } | null = null;

  constructor(private readonly contenedor: HTMLElement) {
    let pendiente = false;
    new ResizeObserver(() => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        if (this.ultimo) this.pintar(this.ultimo.ritmo, this.ultimo.nombres);
      });
    }).observe(contenedor);
  }

  private etiqueta(serie: Serie, nombres: Nombres): string {
    return serie === 'sinEquipo' ? 'Sin equipo' : nombres[serie];
  }

  /** «Atlético Benavente 1:32, Peñíscola 0:58, sin equipo 0:20» */
  private cifras(r: Reparto, nombres: Nombres): string {
    return SERIES.filter((s) => s !== 'sinEquipo' || r.sinEquipo > 0)
      .map((s) => `${s === 'sinEquipo' ? 'sin equipo' : nombres[s]} ${formatearDuracion(r[s])}`)
      .join(', ');
  }

  pintar(ritmo: Ritmo, nombres: Nombres): void {
    this.ultimo = { ritmo, nombres };
    const leyenda = crear('div', 'ritmo-leyenda');
    for (const s of SERIES) {
      const item = crear('span', 'ritmo-clave');
      item.append(crear('span', `ritmo-muestra serie-${s}`), document.createTextNode(this.etiqueta(s, nombres)));
      leyenda.append(item);
    }
    this.contenedor.replaceChildren(
      leyenda,
      this.totales(ritmo, nombres),
      ...ritmo.partes.map((p) => this.parte(p, nombres)),
      this.tabla(ritmo, nombres),
    );
  }

  private totales(ritmo: Ritmo, nombres: Nombres): HTMLUListElement {
    const lista = crear('ul', 'ritmo-totales');
    const filas: [string, Reparto][] = [['Partido', ritmo.total], ...ritmo.partes.map((p): [string, Reparto] => [nombreParte(p), p.total])];
    for (const [nombre, r] of filas) {
      const li = crear('li', 'ritmo-total');
      const barra = crear('span', 'ritmo-barra');
      barra.setAttribute('aria-hidden', 'true');
      for (const s of SERIES) {
        if (r[s] <= 0) continue;
        const trozo = crear('span', `serie-${s}`);
        trozo.style.flexGrow = String(r[s]);
        barra.append(trozo);
      }
      const p = reparto(r);
      const sin = r.sinEquipo > 0 ? ` · ${formatearDuracion(r.sinEquipo)} sin equipo` : '';
      const texto = p ? `${PORCENTAJE.format(p.local)} – ${PORCENTAJE.format(p.visitante)}${sin}` : `Sin equipos puestos${sin}`;
      li.setAttribute('aria-label', p ? `${nombre}: ${nombres.local} ${PORCENTAJE.format(p.local)}, ${nombres.visitante} ${PORCENTAJE.format(p.visitante)}${sin}` : `${nombre}: ${texto}`);
      li.append(crear('span', 'ritmo-total-nombre', nombre), barra, crear('span', 'ritmo-total-cifras', texto));
      lista.append(li);
    }
    return lista;
  }

  private parte(p: ParteRitmo, nombres: Nombres): HTMLElement {
    const figura = crear('figure', 'ritmo-parte');
    const lienzo = crear('div', 'ritmo-lienzo');
    const aviso = crear('div', 'ritmo-aviso');
    aviso.hidden = true;
    figura.append(crear('figcaption', 'ritmo-titulo', nombreParte(p)), lienzo);
    const ancho = Math.max(240, this.contenedor.clientWidth);
    const alto = ARRIBA + ALTO_TRAZADO + EJE_X;
    const svg = nodo('svg', { viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto, role: 'group' }, 'ritmo-svg');
    svg.setAttribute('aria-label', `${nombreParte(p)}: juego por tramos de 5 minutos de vídeo`);
    const y = (segundos: number): number => ARRIBA + ALTO_TRAZADO * (1 - segundos / TRAMO_RITMO_SEG);
    // La rejilla, un minuto por linea; el numero de arriba lleva la unidad.
    for (let m = 0; m <= TRAMO_RITMO_SEG / 60; m++) {
      const yy = Math.round(y(m * 60)) + 0.5;
      svg.append(nodo('line', { x1: EJE_Y, x2: ancho, y1: yy, y2: yy }, m === 0 ? 'ritmo-base' : 'ritmo-rejilla'));
      const t = nodo('text', { x: EJE_Y - 6, y: yy + 4, 'text-anchor': 'end' }, 'ritmo-eje');
      t.textContent = m === TRAMO_RITMO_SEG / 60 ? `${m} min` : String(m);
      svg.append(t);
    }
    const banda = (ancho - EJE_Y) / Math.max(1, p.tramos.length);
    const anchoColumna = Math.min(ANCHO_MAXIMO_COLUMNA, banda * 0.6);
    const saltoEtiquetas = banda < 30 ? 2 : 1;
    p.tramos.forEach((t, i) => {
      const x = EJE_Y + banda * i + (banda - anchoColumna) / 2;
      const columna = nodo('g', {}, 'ritmo-columna');
      // De abajo arriba: local, visitante y sin equipo, con 2 px de superficie entre ellos.
      let base = y(0);
      const presentes = SERIES.filter((s) => t[s] > 0);
      presentes.forEach((s, k) => {
        const altoTramo = (ALTO_TRAZADO * t[s]) / TRAMO_RITMO_SEG - (k > 0 ? HUECO : 0);
        if (altoTramo <= 0) return;
        const arriba = base - (k > 0 ? HUECO : 0) - altoTramo;
        const d = k === presentes.length - 1 ? rectanguloRedondeado(x, arriba, anchoColumna, altoTramo) : `M${x},${arriba}h${anchoColumna}v${altoTramo}h${-anchoColumna}Z`;
        columna.append(nodo('path', { d }, `serie-${s}`));
        base = arriba;
      });
      if (i % saltoEtiquetas === 0) {
        const etiqueta = nodo('text', { x: x + anchoColumna / 2, y: ARRIBA + ALTO_TRAZADO + 16, 'text-anchor': 'middle' }, 'ritmo-eje');
        etiqueta.textContent = minuto(t.desde - p.desde);
        svg.append(etiqueta);
      }
      // El sitio para el raton y el teclado es toda la banda, no solo lo pintado.
      const zona = nodo('rect', { x: EJE_Y + banda * i, y: ARRIBA, width: banda, height: ALTO_TRAZADO, tabindex: 0 }, 'ritmo-zona');
      const descripcion = `De ${minuto(t.desde - p.desde)} a ${minuto(t.hasta - p.desde)} de la ${nombreParte(p)}: ${this.cifras(t, nombres)}`;
      zona.setAttribute('aria-label', descripcion);
      const ensenar = (): void => this.ensenar(aviso, lienzo, svg, columna, t, p, nombres, x, anchoColumna);
      const esconder = (): void => {
        aviso.hidden = true;
        svg.classList.remove('con-foco');
        columna.classList.remove('activa');
      };
      zona.addEventListener('pointerenter', ensenar);
      zona.addEventListener('focus', ensenar);
      zona.addEventListener('pointerleave', esconder);
      zona.addEventListener('blur', esconder);
      svg.append(columna, zona);
    });
    lienzo.append(svg, aviso);
    return figura;
  }

  private ensenar(
    aviso: HTMLDivElement,
    lienzo: HTMLElement,
    svg: SVGSVGElement,
    columna: SVGGElement,
    t: TramoRitmo,
    p: ParteRitmo,
    nombres: Nombres,
    x: number,
    anchoColumna: number,
  ): void {
    svg.classList.add('con-foco');
    for (const c of svg.querySelectorAll('.ritmo-columna.activa')) c.classList.remove('activa');
    columna.classList.add('activa');
    const titulo = crear('p', 'ritmo-aviso-titulo', `De ${minuto(t.desde - p.desde)} a ${minuto(t.hasta - p.desde)}`);
    const filas = SERIES.map((s) => {
      const fila = crear('p', 'ritmo-aviso-fila');
      fila.append(crear('span', `ritmo-linea serie-${s}`), crear('strong', '', formatearDuracion(t[s])), document.createTextNode(` ${this.etiqueta(s, nombres)}`));
      return fila;
    });
    aviso.replaceChildren(titulo, ...filas);
    aviso.hidden = false;
    // Al lado de la columna, para no taparla: a la derecha si cabe, si no a la izquierda.
    const ancho = aviso.offsetWidth;
    const derecha = x + anchoColumna + 8;
    aviso.style.left = `${Math.max(0, derecha + ancho <= lienzo.clientWidth ? derecha : x - 8 - ancho)}px`;
  }

  private tabla(ritmo: Ritmo, nombres: Nombres): HTMLDetailsElement {
    const detalles = crear('details', 'ritmo-tabla');
    detalles.append(crear('summary', '', 'Ver los datos'));
    const tabla = crear('table');
    const cabecera = crear('tr');
    for (const texto of ['Tramo', nombres.local, nombres.visitante, 'Sin equipo']) cabecera.append(crear('th', '', texto));
    tabla.append(crear('thead'));
    tabla.tHead?.append(cabecera);
    const cuerpo = crear('tbody');
    const fila = (nombre: string, r: Reparto, clase = ''): void => {
      const tr = crear('tr', clase);
      tr.append(crear('th', '', nombre), ...SERIES.map((s) => crear('td', '', formatearDuracion(r[s]))));
      cuerpo.append(tr);
    };
    for (const p of ritmo.partes) {
      for (const t of p.tramos) fila(`${nombreParte(p)}, ${minuto(t.desde - p.desde)}–${minuto(t.hasta - p.desde)}`, t);
      fila(`Total de la ${nombreParte(p)}`, p.total, 'ritmo-fila-total');
    }
    fila('Total del partido', ritmo.total, 'ritmo-fila-total');
    tabla.append(cuerpo);
    detalles.append(tabla);
    return detalles;
  }
}
