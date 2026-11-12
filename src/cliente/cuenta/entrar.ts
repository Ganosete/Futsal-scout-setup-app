import { leerCodigo, leerEmail, MINUTOS_CODIGO } from '../../comun/cuenta';
import { api } from '../api/api';
import { el } from '../dom';

/**
 * La pantalla de entrar: el email y luego el codigo que llega por correo. Al
 * abrir la pagina sin sesion es lo unico que se ve. Si la sesion se cierra a
 * mitad (se ha salido en otra pestana), sale encima de lo que haya abierto,
 * que no se pierde.
 */

export type MotivoEntrar = 'inicio' | 'perdida';

export interface Entrar {
  mostrar: (motivo: MotivoEntrar) => void;
  ocultar: () => void;
}

const INTRO: Readonly<Record<MotivoEntrar, string>> = {
  inicio: 'Te mandamos un código por email, sin contraseñas. Si es la primera vez, así te das de alta, con el plan gratuito.',
  perdida: 'Tu sesión se ha cerrado, quizá desde otra pestaña. Entra otra vez para seguir: lo que tienes abierto no se pierde.',
};

export function iniciarEntrar(o: { alEntrar: (motivo: MotivoEntrar) => void | Promise<void> }): Entrar {
  const bloque = el<HTMLElement>('bloque-entrar');
  const intro = el<HTMLParagraphElement>('intro-entrar');
  const formEmail = el<HTMLFormElement>('form-email');
  const campoEmail = el<HTMLInputElement>('campo-email');
  const formCodigo = el<HTMLFormElement>('form-codigo');
  const campoCodigo = el<HTMLInputElement>('campo-codigo');
  const textoCodigo = el<HTMLParagraphElement>('texto-codigo');
  const estado = el<HTMLParagraphElement>('estado-entrar');
  let motivo: MotivoEntrar = 'inicio';
  let email = '';
  let ocupado = false;

  function paso(cual: 'email' | 'codigo'): void {
    formEmail.hidden = cual !== 'email';
    formCodigo.hidden = cual !== 'codigo';
    (cual === 'email' ? campoEmail : campoCodigo).focus();
  }

  function fallo(campo: HTMLInputElement, mensaje: string): void {
    estado.textContent = mensaje;
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
  }

  /** Una peticion cada vez: dos clics seguidos no piden dos codigos. */
  async function enUnaVez(hacer: () => Promise<void>): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    try {
      await hacer();
    } catch (e) {
      estado.textContent = (e as Error).message;
    } finally {
      ocupado = false;
    }
  }

  const pedirCodigo = (para: string): Promise<void> =>
    enUnaVez(async () => {
      estado.textContent = 'Pidiendo el código…';
      const r = await api.pedirCodigo(para);
      email = para;
      textoCodigo.textContent = r.codigoLocal
        ? `Estás en local y no hay correo: tu código es ${r.codigoLocal}.`
        : `Te hemos mandado un código a ${para}. Vale ${MINUTOS_CODIGO} minutos; si no llega, mira en el correo no deseado.`;
      campoCodigo.value = '';
      campoCodigo.removeAttribute('aria-invalid');
      estado.textContent = '';
      paso('codigo');
    });

  formEmail.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const leido = leerEmail(campoEmail.value);
    if (!leido) fallo(campoEmail, 'Escribe un email válido.');
    else {
      campoEmail.removeAttribute('aria-invalid');
      void pedirCodigo(leido);
    }
  });

  formCodigo.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const codigo = leerCodigo(campoCodigo.value);
    if (!codigo) {
      fallo(campoCodigo, 'El código son 6 cifras.');
      return;
    }
    void enUnaVez(async () => {
      estado.textContent = 'Entrando…';
      await api.entrar(email, codigo);
      estado.textContent = '';
      await o.alEntrar(motivo);
    });
  });

  el<HTMLButtonElement>('btn-otro-codigo').addEventListener('click', () => void pedirCodigo(email));
  el<HTMLButtonElement>('btn-otro-email').addEventListener('click', () => {
    estado.textContent = '';
    paso('email');
  });

  return {
    mostrar: (m) => {
      motivo = m;
      intro.textContent = INTRO[m];
      bloque.hidden = false;
      paso('email');
      if (m === 'perdida') bloque.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    ocultar: () => {
      bloque.hidden = true;
    },
  };
}
