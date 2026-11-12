import type { Cuenta } from '../../comun/cuenta';
import { plan } from '../../comun/planes';
import { el } from '../dom';

/** Quien ha entrado, en la cabecera: su email, su plan, «Mi cuenta» y «Salir». */

export interface Cabecera {
  pintar: (c: Cuenta) => void;
  /** Si «Mi cuenta» esta abierta: lo dice el boton a los lectores de pantalla. */
  marcarAbierta: (si: boolean) => void;
}

export function iniciarCabecera(o: { alPulsarCuenta: () => void; alSalir: () => void }): Cabecera {
  const zona = el<HTMLElement>('cuenta-cabecera');
  const email = el<HTMLElement>('email-cabecera');
  const nombrePlan = el<HTMLElement>('plan-cabecera');
  const botonCuenta = el<HTMLButtonElement>('btn-mi-cuenta');
  const botonSalir = el<HTMLButtonElement>('btn-salir');

  botonCuenta.addEventListener('click', o.alPulsarCuenta);
  botonSalir.addEventListener('click', () => {
    botonSalir.disabled = true;
    o.alSalir();
  });

  return {
    pintar: (c) => {
      zona.hidden = false;
      email.textContent = c.email;
      nombrePlan.textContent = plan(c.plan).nombre;
      botonSalir.hidden = !c.puedeSalir;
    },
    marcarAbierta: (si) => botonCuenta.setAttribute('aria-expanded', String(si)),
  };
}
