import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/video.css';
import './estilos/campos.css';
import './estilos/analisis.css';
import './estilos/editor.css';
import './estilos/partidos.css';
import './estilos/ritmo.css';
import { el } from './dom';
import { iniciarMisPartidos } from './partido/misPartidos';
import { iniciarPanelPartido } from './partido/panelPartido';
import { sePuedeAbrir } from './partido/textos';
import { iniciarFormulario, type Formulario } from './subida/formulario';

el('version').textContent = __VERSION__;

let formulario: Formulario | null = null;

const panel = iniciarPanelPartido({
  alCambiarPartidos: () => void misPartidos.recargar(),
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
  alBorrar: (id) => panel.cerrarSiEs(id),
});

formulario = iniciarFormulario({
  alEnviar: (video, datos) => void panel.subirYAnalizar(video, datos),
});

// Con un partido abierto, la direccion lo dice (#partido=...): recargar la pagina lo vuelve a abrir.
const enLaDireccion = /^#partido=([\w-]+)$/.exec(location.hash)?.[1];
void misPartidos.recargar().then((partidos) => {
  const p = partidos.find((x) => x.id === enLaDireccion);
  if (p && sePuedeAbrir(p)) void panel.abrir(p);
});

// Salir con una subida a medias o con cambios sin guardar: el navegador pregunta antes.
window.addEventListener('beforeunload', (e) => {
  if (panel.pendiente) e.preventDefault();
});
