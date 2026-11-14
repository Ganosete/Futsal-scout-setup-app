import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/video.css';
import './estilos/campos.css';
import './estilos/analisis.css';
import './estilos/editor.css';
import './estilos/partidos.css';
import './estilos/ritmo.css';
import './estilos/cuenta.css';
import type { Cuenta } from '../comun/cuenta';
import { alPerderLaSesion, api, ErrorApi } from './api/api';
import { iniciarCabecera } from './cuenta/cabecera';
import { iniciarEntrar } from './cuenta/entrar';
import { iniciarMiCuenta } from './cuenta/miCuenta';
import { el } from './dom';
import { iniciarMisPartidos } from './partido/misPartidos';
import { iniciarPanelPartido } from './partido/panelPartido';
import { sePuedeAbrir } from './partido/textos';
import { iniciarFormulario, type Formulario } from './subida/formulario';

el('version').textContent = __VERSION__;

let formulario: Formulario | null = null;
let quien: string | null = null;
let conServidor = false;

/**
 * El estado de la sesion va en <body data-sesion>: «no» deja ver solo la
 * pantalla de entrar (cuenta.css); «sin-servidor», la pagina sin cuenta, que
 * sirve igual para buscar las jugadas aunque no se guarden.
 */
function conCuenta(c: Cuenta): void {
  document.body.dataset.sesion = 'si';
  quien = c.email;
  // Con el procesado en el servidor, se puede subir y cerrar la pagina (fase 6).
  conServidor = c.servidor;
  el('casilla-servidor').hidden = !c.servidor;
  cabecera.pintar(c);
  miCuenta.pintar(c);
}

/** Subir o borrar un partido cambia lo que se usa. */
function recargar(): void {
  void misPartidos.recargar();
  if (quien) void api.verCuenta().then(conCuenta, () => undefined);
}

const cabecera = iniciarCabecera({
  alPulsarCuenta: () => miCuenta.alternar(),
  alSalir: () => void api.salir().finally(() => location.reload()),
});

const miCuenta = iniciarMiCuenta({
  alCambiar: (c) => {
    conCuenta(c);
    void misPartidos.recargar();
  },
  alAlternar: (abierta) => cabecera.marcarAbierta(abierta),
});

const entrar = iniciarEntrar({
  alEntrar: async (motivo) => {
    if (motivo === 'inicio') {
      location.reload();
      return;
    }
    // Si ha entrado otra persona, lo abierto no es suyo: se empieza de cero.
    const c = await api.verCuenta();
    if (c.email !== quien) location.reload();
    else {
      entrar.ocultar();
      conCuenta(c);
      void misPartidos.recargar();
    }
  },
});

alPerderLaSesion(() => {
  if (document.body.dataset.sesion !== 'si') return;
  document.body.dataset.sesion = 'perdida';
  entrar.mostrar('perdida');
});

const panel = iniciarPanelPartido({
  alCambiarPartidos: recargar,
  alCambiarOcupado: (si) => {
    formulario?.bloquear(si);
    misPartidos.bloquear(si);
  },
  alAbrir: (id) => misPartidos.marcarAbierto(id),
});

const misPartidos = iniciarMisPartidos({
  abrir: (p) => {
    void panel.abrir(p);
    el('bloque-analisis').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  puedeServidor: () => conServidor,
  alBorrar: (id) => {
    panel.cerrarSiEs(id);
    if (quien) void api.verCuenta().then(conCuenta, () => undefined);
  },
});

formulario = iniciarFormulario({
  alEnviar: (video, datos) => void panel.subirYAnalizar(video, datos, conServidor && el<HTMLInputElement>('analizar-en-servidor').checked),
});

async function arrancar(): Promise<void> {
  try {
    conCuenta(await api.verCuenta());
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) {
      document.body.dataset.sesion = 'no';
      entrar.mostrar('inicio');
      return;
    }
    document.body.dataset.sesion = 'sin-servidor';
  }
  // Con un partido abierto, la direccion lo dice (#partido=...): recargar la pagina lo vuelve a abrir.
  const enLaDireccion = /^#partido=([\w-]+)$/.exec(location.hash)?.[1];
  const partidos = await misPartidos.recargar();
  const p = partidos.find((x) => x.id === enLaDireccion);
  if (p && sePuedeAbrir(p)) void panel.abrir(p);
}

void arrancar();

// Salir con una subida a medias o con cambios sin guardar: el navegador pregunta antes.
window.addEventListener('beforeunload', (e) => {
  if (panel.pendiente) e.preventDefault();
});
