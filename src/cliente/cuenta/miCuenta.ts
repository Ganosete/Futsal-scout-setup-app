import type { Cuenta } from '../../comun/cuenta';
import { motivoParaNoCambiar, plan, PLANES, type IdPlan } from '../../comun/planes';
import { api } from '../api/api';
import { crear, el } from '../dom';
import { pintarMedidas } from './medidas';
import { efectoDelCambio, lineasPlan, precio, resumenPlan, textoCambiado } from './textos';

/**
 * «Mi cuenta»: lo que se usa, los planes y el cambio de plan. El pago es una
 * maqueta: se confirma sin pedir ningun dato y no se cobra nada. Lo que no
 * cabe en un plan se dice antes de pulsar, con la misma regla que aplica el
 * servidor (comun/planes.ts).
 */

export interface MiCuenta {
  pintar: (c: Cuenta) => void;
  alternar: () => void;
}

export function iniciarMiCuenta(o: { alCambiar: (c: Cuenta) => void; alAlternar: (abierta: boolean) => void }): MiCuenta {
  const bloque = el<HTMLElement>('bloque-cuenta');
  const titulo = el<HTMLElement>('titulo-cuenta');
  const resumen = el<HTMLParagraphElement>('resumen-cuenta');
  const medidas = el<HTMLElement>('medidas-cuenta');
  const lista = el<HTMLUListElement>('planes');
  const pago = el<HTMLElement>('pago-maqueta');
  const tituloPago = el<HTMLElement>('titulo-pago');
  const estado = el<HTMLParagraphElement>('estado-cuenta');
  const confirmar = el<HTMLButtonElement>('btn-confirmar-plan');
  let cuenta: Cuenta | null = null;
  let elegido: IdPlan | null = null;

  function tarjeta(c: Cuenta, id: IdPlan): HTMLLIElement {
    const p = plan(id);
    const li = crear('li', 'plan');
    li.dataset.plan = id;
    const cabeza = crear('div', 'plan-cabeza');
    cabeza.append(crear('h4', 'plan-nombre', p.nombre));
    if (id === c.plan) {
      li.setAttribute('aria-current', 'true');
      cabeza.append(crear('span', 'plan-actual', 'Tu plan'));
    }
    const lineas = crear('ul', 'plan-lineas');
    lineas.append(...lineasPlan(p).map((t) => crear('li', undefined, t)));
    li.append(cabeza, crear('p', 'plan-precio', precio(p)), lineas);
    if (id !== c.plan) {
      const boton = crear('button', 'boton boton-secundario', `Pasar a ${p.nombre}`);
      boton.type = 'button';
      boton.dataset.plan = id;
      const motivo = motivoParaNoCambiar(p, c.uso);
      if (motivo) {
        boton.disabled = true;
        const nota = crear('p', 'nota plan-motivo', motivo);
        nota.id = `motivo-plan-${id}`;
        boton.setAttribute('aria-describedby', nota.id);
        li.append(boton, nota);
      } else li.append(boton);
    }
    return li;
  }

  function pintar(c: Cuenta): void {
    cuenta = c;
    resumen.textContent = `${c.email} · ${resumenPlan(c)}`;
    pintarMedidas(medidas, c.uso, plan(c.plan));
    lista.replaceChildren(...PLANES.map((p) => tarjeta(c, p.id)));
    if (elegido === c.plan) cerrarPago();
  }

  function abrirPago(id: IdPlan): void {
    if (!cuenta) return;
    elegido = id;
    const destino = plan(id);
    tituloPago.textContent = `Pasar a ${destino.nombre}`;
    el('precio-pago').textContent = precio(destino);
    el('efecto-pago').textContent = efectoDelCambio(plan(cuenta.plan), destino, cuenta.uso, new Date());
    estado.textContent = '';
    pago.hidden = false;
    tituloPago.focus();
  }

  function cerrarPago(): void {
    elegido = null;
    pago.hidden = true;
  }

  lista.addEventListener('click', (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-plan]')?.dataset.plan;
    if (id) abrirPago(id as IdPlan);
  });

  el<HTMLButtonElement>('btn-cancelar-plan').addEventListener('click', () => {
    const id = elegido;
    cerrarPago();
    lista.querySelector<HTMLButtonElement>(`button[data-plan="${id}"]`)?.focus();
  });

  confirmar.addEventListener('click', async () => {
    if (!elegido) return;
    confirmar.disabled = true;
    try {
      const nueva = await api.cambiarPlan(elegido);
      cerrarPago();
      pintar(nueva);
      estado.textContent = textoCambiado(plan(nueva.plan));
      o.alCambiar(nueva);
    } catch (e) {
      estado.textContent = `No se ha cambiado el plan: ${(e as Error).message}`;
    } finally {
      confirmar.disabled = false;
    }
  });

  function alternar(): void {
    bloque.hidden = !bloque.hidden;
    if (bloque.hidden) cerrarPago();
    else {
      bloque.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titulo.focus();
    }
    o.alAlternar(!bloque.hidden);
  }

  el<HTMLButtonElement>('btn-cerrar-cuenta').addEventListener('click', alternar);

  return { pintar, alternar };
}
