import type { Partido } from '../../comun/partido';
import { api, ErrorApi } from '../api/api';
import { crear, el } from '../dom';
import { detallePartido, sePuedeAbrir, tituloPartido } from './textos';

/**
 * «Mis partidos»: los partidos subidos, para volver a abrirlos o borrarlos.
 * Sin partidos (o sin servidor, como al abrir la pagina sin Access) la
 * seccion no sale: lo primero es el formulario de «Nuevo partido».
 */

export interface OpcionesMisPartidos {
  abrir: (p: Partido) => void;
  alBorrar: (id: string) => void;
}

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

  async function recargar(): Promise<Partido[]> {
    const mio = ++turno;
    try {
      const nuevos = await api.listarPartidos();
      if (mio !== turno) return partidos;
      partidos = nuevos;
      estado.textContent = '';
    } catch (e) {
      if (mio !== turno) return partidos;
      // Sin Access configurado o sin conexion: no hay lista que ensenar, pero el formulario sigue sirviendo.
      if (e instanceof ErrorApi && (e.estado === 503 || e.estado === 401)) partidos = [];
      else estado.textContent = `No se ha podido cargar la lista: ${e instanceof Error ? e.message : ''}`;
    }
    pintar();
    if (estado.textContent) bloque.hidden = false;
    return partidos;
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
