import { FalloApi } from './respuestas';
import { leerPartido, type FilaPartido } from './partidos/almacen';

/** Lo que recibe cada ruta privada: los bindings y quien llama, ya identificado. */
export interface Contexto {
  env: Env;
  dueno: string;
  /** Si ha entrado con su email (sesion propia), y no por Access o en localhost. */
  sesion: boolean;
}

/** El partido de quien llama, o 404: el de otro no existe. */
export async function partidoDe(ctx: Contexto, id: string): Promise<FilaPartido> {
  const fila = await leerPartido(ctx.env.BD, ctx.dueno, id);
  if (!fila) throw new FalloApi(404, 'No existe este partido.');
  return fila;
}
