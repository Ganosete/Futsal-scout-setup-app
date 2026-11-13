import type { Partido } from '../../comun/partido';
import { api, ErrorApi } from '../api/api';
import { crear, el } from '../dom';
import { botonServidor, detallePartido, sePuedeAbrir, textoBorrado, textoServidor, tituloPartido, trabajaEnServidor } from './textos';

/**
 * «Mis partidos»: los partidos subidos, para volver a abrirlos o borrarlos.
 * Sin partidos (o sin servidor) la seccion no sale: lo primero es el
 * formulario de «Nuevo partido».
 */

export interface OpcionesMisPartidos {
  abrir: (p: Partido) => void;
  alBorrar: (id: string) => void;
  /** Si la cuenta puede pedir el procesado en el servidor (su plan, y la web lo tiene). */
  puedeServidor: () => boolean;
}

/** Mientras el servidor trabaja en algun partido, la lista se pide otra vez cada tanto. */
const REFRESCO_MS = 10_000;

export interface MisPartidos {
  recargar: () => Promise<Partido[]>;
  /** Marca el partido que se esta viendo. */
  marcarAbierto: (id: string | null) => void;
  /**
   * Mientras sube o se analiza un partido no se abre otro: abrirlo pararia
   * esa subida sin que nadie lo hubiera pedido.
   */
  bloquear: (ocupado: boolean) => void;
}

export function iniciarMisPartidos(o: OpcionesMisPartidos): MisPartidos {
  const bloque = el<HTMLElement>('bloque-mis-partidos');
  const lista = el<HTMLUListElement>('lista-partidos');
  const estado = el<HTMLParagraphElement>('estado-partidos');
  let partidos: Partido[] = [];
  let abierto: string | null = null;
  let ocupado = false;
  let turno = 0;

  function pintar(): void {
    bloque.hidden = partidos.length === 0;
    lista.replaceChildren(
      ...partidos.map((p) => {
        const li = crear('li', 'partido');
        li.dataset.id = p.id;
        if (p.id === abierto) li.setAttribute('aria-current', 'true');
        const datos = crear('div', 'partido-datos');
        datos.append(crear('p', 'partido-titulo', tituloPartido(p)), crear('p', 'partido-detalle', detallePartido(p)));
        const borrado = textoBorrado(p.seBorra);
        if (borrado) datos.append(crear('p', 'partido-borrado', borrado));
        const servidor = textoServidor(p.servidor);
        if (servidor) datos.append(crear('p', 'partido-servidor', servidor));
        const acciones = crear('div', 'partido-acciones');
        const nombre = tituloPartido(p);
        if (sePuedeAbrir(p)) {
          const abrir = crear('button', 'boton-mini', 'Abrir');
          abrir.type = 'button';
          abrir.dataset.accion = 'abrir';
          abrir.setAttribute('aria-label', `Abrir ${nombre}`);
          abrir.disabled = ocupado;
          if (ocupado) abrir.title = 'Espera a que acabe la subida en marcha, o párala, para abrir otro partido.';
          acciones.append(abrir);
        }
        const pedir = o.puedeServidor() ? botonServidor(p) : null;
        if (pedir) {
          const servidor = crear('button', 'boton-mini', pedir);
          servidor.type = 'button';
          servidor.dataset.accion = 'servidor';
          servidor.setAttribute('aria-label', `${pedir}: ${nombre}`);
          acciones.append(servidor);
        }
        const borrar = crear('button', 'boton-mini', 'Borrar');
        borrar.type = 'button';
        borrar.dataset.accion = 'borrar';
        borrar.setAttribute('aria-label', `Borrar ${nombre}`);
        acciones.append(borrar);
        li.append(datos, acciones);
        return li;
      }),
    );
  }

  let refresco: ReturnType<typeof setTimeout> | null = null;

  async function recargar(): Promise<Partido[]> {
    const mio = ++turno;
    if (refresco) clearTimeout(refresco);
    refresco = null;
    try {
      const nuevos = await api.listarPartidos();
      if (mio !== turno) return partidos;
      partidos = nuevos;
      estado.textContent = '';
    } catch (e) {
      if (mio !== turno) return partidos;
      // Sin sesion (sale la pantalla de entrar) no hay lista que ensenar.
      if (e instanceof ErrorApi && (e.estado === 503 || e.estado === 401)) partidos = [];
      else estado.textContent = `No se ha podido cargar la lista: ${e instanceof Error ? e.message : ''}`;
    }
    pintar();
    if (estado.textContent) bloque.hidden = false;
    if (partidos.some(trabajaEnServidor)) refresco = setTimeout(() => void recargar(), REFRESCO_MS);
    return partidos;
  }

  async function procesar(p: Partido): Promise<void> {
    try {
      await api.procesar(p.id);
    } catch (e) {
      estado.textContent = `No se ha podido pedir al servidor: ${e instanceof Error ? e.message : ''}`;
      return;
    }
    await recargar();
    estado.textContent = `${tituloPartido(p)}: pedido al servidor.`;
  }

  async function borrar(p: Partido): Promise<void> {
    if (!confirm(`¿Borrar ${tituloPartido(p)}? Se borran el vídeo subido y todas sus jugadas, y no se puede deshacer.`)) return;
    try {
      await api.borrar(p.id);
    } catch (e) {
      estado.textContent = `No se ha podido borrar: ${e instanceof Error ? e.message : ''}`;
      return;
    }
    o.alBorrar(p.id);
    await recargar();
    estado.textContent = `${tituloPartido(p)}: borrado.`;
  }

  lista.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-accion]');
    const p = partidos.find((x) => x.id === boton?.closest<HTMLElement>('.partido')?.dataset.id);
    if (!boton || !p) return;
    if (boton.dataset.accion === 'abrir') o.abrir(p);
    else if (boton.dataset.accion === 'servidor') void procesar(p);
    else void borrar(p);
  });

  return {
    recargar,
    marcarAbierto: (id) => {
      abierto = id;
      pintar();
    },
    bloquear: (si) => {
      ocupado = si;
      pintar();
    },
  };
}
