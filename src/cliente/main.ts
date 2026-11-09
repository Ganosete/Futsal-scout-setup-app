import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/video.css';
import './estilos/campos.css';
import './estilos/analisis.css';
import { iniciarPanelAnalisis } from './analisis/panelAnalisis';
import { el } from './dom';
import { iniciarFormulario } from './subida/formulario';

el('version').textContent = __VERSION__;
const analisis = iniciarPanelAnalisis();
iniciarFormulario({ alCambiarVideo: analisis.videoElegido });
