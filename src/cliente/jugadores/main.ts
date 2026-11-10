import '../estilos/tokens.css';
import '../estilos/base.css';
import '../estilos/video.css';
import '../estilos/campos.css';
import '../estilos/editor.css';
import '../estilos/jugadores.css';
import type { JugadaCompartida, PartidoCompartido } from '../../comun/compartido';
import { crearDescargador } from '../descarga/accion';
import { el } from '../dom';
import { Reproductor } from '../editor/reproductor';
import { tituloPartido } from '../partido/textos';
import { leerCompartido, urlVideoCompartido } from './api';
import { ListaJugadas } from './listaJugadas';
import { detalleCompartido, tokenDeLaDireccion } from './textos';

/**
 * La pagina de los jugadores (/v/<token>): las jugadas del partido, para verlas
 * una a una o seguidas y descargarlas. No hace falta cuenta: el enlace basta.
 */

const titulo = el<HTMLHeadingElement>('titulo-compartido');
const detalle = el<HTMLParagraphElement>('detalle-compartido');
const estado = el<HTMLParagraphElement>('estado-compartido');
const bloque = el<HTMLElement>('bloque-jugadas');
const aviso = el<HTMLParagraphElement>('estado-jugadas');
const reproductor = new Reproductor(el<HTMLVideoElement>('video-jugadores'));
const descargar = crearDescargador((m) => (aviso.textContent = m));

let partido: PartidoCompartido | null = null;
let seleccionada: string | null = null;
let origen: URL | null = null;

const lista = new ListaJugadas(el('lista-jugadas'), (id) => {
  seleccionada = id;
  ver();
});

const jugadas = (): readonly JugadaCompartida[] => partido?.jugadas ?? [];
const actual = (): JugadaCompartida | undefined => jugadas().find((j) => j.id === seleccionada);

function pintar(): void {
  if (!partido) return;
  lista.pintar(partido, seleccionada);
  if (seleccionada) lista.mostrar(seleccionada);
}

function ver(): void {
  const j = actual();
  if (!j) return;
  pintar();
  reproductor.verFragmento(j);
}

function mover(paso: -1 | 1): void {
  const todas = jugadas();
  const i = todas.findIndex((j) => j.id === seleccionada);
  const destino = todas[Math.min(todas.length - 1, Math.max(0, i + paso))];
  if (!destino) return;
  seleccionada = destino.id;
  ver();
}

el('barra-jugadores').addEventListener('click', (e) => {
  const accion = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-accion]')?.dataset.accion;
  if (accion === 'anterior') mover(-1);
  else if (accion === 'siguiente') mover(1);
  else if (accion === 'verFragmento') ver();
  else if (accion === 'verTodo') reproductor.verTodo(jugadas);
  else if (accion === 'descargar') {
    const j = actual();
    if (j && partido && origen) void descargar(origen, j, jugadas().indexOf(j) + 1, partido);
  }
});

// Viendo las jugadas seguidas, la lista va marcando la que suena.
reproductor.alCambiarTiempo((t) => {
  if (!reproductor.reproduciendo) return;
  const j = jugadas().find((x) => t >= x.desde && t < x.hasta);
  if (j && j.id !== seleccionada) {
    seleccionada = j.id;
    pintar();
  }
});

async function iniciar(): Promise<void> {
  const token = tokenDeLaDireccion(location.pathname);
  if (!token) {
    estado.textContent = 'Este enlace no está completo: cópialo otra vez del mensaje del entrenador.';
    return;
  }
  try {
    partido = await leerCompartido(token);
  } catch (e) {
    estado.textContent = (e as Error).message;
    return;
  }
  titulo.textContent = tituloPartido(partido);
  document.title = `${tituloPartido(partido)} · Futsal Scout`;
  detalle.textContent = detalleCompartido(partido);
  if (partido.jugadas.length === 0) {
    estado.textContent = 'El entrenador todavía no ha preparado las jugadas de este partido.';
    return;
  }
  estado.textContent = '';
  origen = urlVideoCompartido(token);
  seleccionada = partido.jugadas[0].id;
  reproductor.cargar(origen);
  bloque.hidden = false;
  pintar();
}

void iniciar();
