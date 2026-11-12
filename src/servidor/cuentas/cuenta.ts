import { json } from '../respuestas';
import type { Contexto } from '../contexto';
import type { Parametros } from '../rutas';
import { darDeAlta } from './almacen';

/**
 * La cuenta de quien llama. Quien entra por Access o en localhost no ha
 * pasado por el alta con codigo: se le da aqui, la primera vez que la pide.
 */
export async function verCuenta(_peticion: Request, _p: Parametros, { env, dueno }: Contexto): Promise<Response> {
  const u = await darDeAlta(env.BD, dueno, new Date().toISOString());
  return json({ email: u.email, plan: u.plan, alta: u.creado });
}
