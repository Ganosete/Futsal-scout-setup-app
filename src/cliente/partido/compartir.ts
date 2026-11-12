import type { Enlace } from '../../comun/compartido';
import { api } from '../api/api';
import { crear, el } from '../dom';
import { detalleEnlace, urlEnlace } from './textos';

/**
 * «Compartir con los jugadores»: los enlaces del partido abierto, para
 * crearlos, copiarlos o quitarlos. Sale en cuanto el partido existe en el
 * servidor, aunque el video aun se este subiendo: los jugadores veran un
 * aviso hasta que acabe.
 */

export interface Compartir {
  abrir: (idPartido: string, titulo: string) => void;
  cerrar: () => void;
}

export function crearCompartir(): Compartir {
  const bloque = el<HTMLElement>('bloque-compartir');
  const lista = el<HTMLUListElement>('lista-enlaces');
  const caducidad = el<HTMLSelectElement>('caducidad-enlace');
  const botonCrear = el<HTMLButtonElement>('btn-crear-enlace');
  const estado = el<HTMLParagraphElement>('estado-compartir');
  let id: string | null = null;
  let titulo = '';
  let enlaces: Enlace[] = [];
  let turno = 0;

  const decir = (texto: string): void => {
    estado.textContent = texto;
  };

  function pintar(): void {
    const ahora = new Date();
    lista.replaceChildren(
      ...enlaces.map((e) => {
        const li = crear('li', 'enlace');
        li.dataset.token = e.token;
        const url = crear('input', 'enlace-url');
        url.type = 'text';
        url.readOnly = true;
        url.value = urlEnlace(location.origin, e.token);
        url.setAttribute('aria-label', 'Enlace para los jugadores');
        const acciones = crear('div', 'enlace-acciones');
        // El texto es corto; el nombre accesible dice de que es, porque el editor tiene otro «Quitar».
        for (const [accion, texto, nombre] of [
          ['copiar', 'Copiar', 'Copiar el enlace'],
          ...('share' in navigator ? [['enviar', 'Enviar…', 'Enviar el enlace']] : []),
          ['quitar', 'Quitar', 'Quitar el enlace'],
        ]) {
          const b = crear('button', 'boton-mini', texto);
          b.type = 'button';
          b.dataset.accion = accion;
          b.setAttribute('aria-label', nombre);
          acciones.append(b);
        }
        li.append(url, crear('p', 'enlace-detalle', detalleEnlace(e, ahora)), acciones);
        return li;
      }),
    );
  }

  async function cargar(): Promise<void> {
    const mio = ++turno;
    const partido = id;
    if (!partido) return;
    try {
      const nuevos = await api.listarEnlaces(partido);
      if (mio !== turno) return;
      enlaces = nuevos;
      pintar();
    } catch (e) {
      if (mio === turno) decir(`No se han podido cargar los enlaces: ${(e as Error).message}`);
    }
  }

  botonCrear.addEventListener('click', async () => {
    const partido = id;
    if (!partido) return;
    botonCrear.disabled = true;
    try {
      const nuevo = await api.crearEnlace(partido, caducidad.value === '' ? null : Number(caducidad.value));
      if (partido !== id) return;
      enlaces = [...enlaces, nuevo];
      pintar();
      decir('Enlace creado: cópialo y mándalo al grupo del equipo.');
    } catch (e) {
      decir(`No se ha podido crear el enlace: ${(e as Error).message}`);
    } finally {
      botonCrear.disabled = false;
    }
  });

  lista.addEventListener('click', async (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-accion]');
    const li = boton?.closest<HTMLLIElement>('li[data-token]');
    const e = enlaces.find((x) => x.token === li?.dataset.token);
    const partido = id;
    if (!boton || !li || !e || !partido) return;
    const url = urlEnlace(location.origin, e.token);
    if (boton.dataset.accion === 'copiar') {
      try {
        await navigator.clipboard.writeText(url);
        decir('Enlace copiado.');
      } catch {
        // Sin permiso para el portapapeles: se deja seleccionado para copiarlo a mano.
        li.querySelector<HTMLInputElement>('input')?.select();
        decir('Selecciona el enlace y cópialo.');
      }
    } else if (boton.dataset.accion === 'enviar') {
      await navigator.share({ title: titulo, url }).catch(() => undefined);
    } else if (confirm('¿Quitar este enlace? Quien lo tenga dejará de poder ver las jugadas.')) {
      try {
        await api.quitarEnlace(partido, e.token);
        enlaces = enlaces.filter((x) => x.token !== e.token);
        pintar();
        decir('Enlace quitado: ya no funciona.');
      } catch (err) {
        decir(`No se ha podido quitar: ${(err as Error).message}`);
      }
    }
  });

  return {
    abrir: (nuevoId, nuevoTitulo) => {
      if (nuevoId === id) return;
      id = nuevoId;
      titulo = nuevoTitulo;
      enlaces = [];
      pintar();
      decir('');
      bloque.hidden = false;
      void cargar();
    },
    cerrar: () => {
      turno++;
      id = null;
      enlaces = [];
      pintar();
      decir('');
      bloque.hidden = true;
    },
  };
}
