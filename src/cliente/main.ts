import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/video.css';
import './estilos/campos.css';
import { el } from './dom';
import { iniciarFormulario } from './subida/formulario';

el('version').textContent = __VERSION__;
iniciarFormulario();
