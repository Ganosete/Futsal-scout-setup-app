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

// El editor nombra a los equipos como se hayan escrito en el formulario.
const campoLocal = el<HTMLInputElement>('campo-local');
const campoVisitante = el<HTMLInputElement>('campo-visitante');
const nombres = (): { local: string; visitante: string } => ({
  local: campoLocal.value.trim() || 'Local',
  visitante: campoVisitante.value.trim() || 'Visitante',
});

const analisis = iniciarPanelAnalisis(nombres);
iniciarFormulario({ alCambiarVideo: analisis.videoElegido });
