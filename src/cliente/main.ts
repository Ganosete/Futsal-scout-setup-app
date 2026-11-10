import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/video.css';
import './estilos/campos.css';
import './estilos/analisis.css';
import './estilos/editor.css';
import { iniciarPanelAnalisis } from './analisis/panelAnalisis';
import { el } from './dom';
import { iniciarFormulario } from './subida/formulario';

el('version').textContent = __VERSION__;

// El editor nombra a los equipos y a los ficheros que descarga con los datos del formulario.
const campoLocal = el<HTMLInputElement>('campo-local');
const campoVisitante = el<HTMLInputElement>('campo-visitante');
const campoFecha = el<HTMLInputElement>('campo-fecha');
const partido = (): { local: string; visitante: string; fecha: string } => ({
  local: campoLocal.value,
  visitante: campoVisitante.value,
  fecha: campoFecha.value,
});

const analisis = iniciarPanelAnalisis(partido);
iniciarFormulario({ alCambiarVideo: analisis.videoElegido });
