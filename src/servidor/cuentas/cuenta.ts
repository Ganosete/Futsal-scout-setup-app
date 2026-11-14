import type { Cuenta } from '../../comun/cuenta';
import { esIdPlan, motivoParaNoCambiar, plan } from '../../comun/planes';
import { esLocal } from '../acceso/identidad';
import { procesadoEncendido } from '../procesado/lanzar';
import type { Contexto } from '../contexto';
import { leerJson } from '../cuerpo';
import { usoDe } from '../partidos/almacen';
import { FalloApi, json } from '../respuestas';
import type { Parametros } from '../rutas';
import { cambiarPlan, darDeAlta } from './almacen';

/**
 * La cuenta de quien llama y su cambio de plan. Quien entra por Access o en
 * localhost no ha pasado por el alta con codigo: se le da aqui, la primera vez.
 * El pago es una maqueta: cambiar de plan no cobra nada.
 */

async function cuentaDe(peticion: Request, { env, dueno, sesion }: Contexto, ahora: Date): Promise<Cuenta> {
  const [u, uso] = await Promise.all([darDeAlta(env.BD, dueno, ahora.toISOString()), usoDe(env.BD, dueno)]);
  // En localhost, salir apaga la identidad de pruebas (entrar.ts): tambien se puede.
  const suPlan = plan(u.plan);
  return {
    email: u.email,
    plan: suPlan.id,
    alta: u.creado,
    planDesde: u.plan_desde,
    uso,
    puedeSalir: sesion || esLocal(peticion),
    servidor: suPlan.servidor && procesadoEncendido(env),
  };
}

export async function verCuenta(peticion: Request, _p: Parametros, ctx: Contexto): Promise<Response> {
  return json(await cuentaDe(peticion, ctx, new Date()));
}

export async function cambiarDePlan(peticion: Request, _p: Parametros, ctx: Contexto): Promise<Response> {
  const { env, dueno } = ctx;
  const cuerpo = await leerJson(peticion, 1024);
  const id = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { plan?: unknown }).plan : undefined;
  if (!esIdPlan(id)) throw new FalloApi(400, 'Ese plan no existe.');
  const ahora = new Date();
  const antes = await cuentaDe(peticion, ctx, ahora);
  // El mismo plan otra vez no vuelve a contar los dias desde hoy.
  if (antes.plan === id) return json(antes);
  // Bajar de plan no borra nada para hacer sitio: eso lo decide el entrenador.
  const motivo = motivoParaNoCambiar(plan(id), antes.uso);
  if (motivo) throw new FalloApi(409, motivo);
  await cambiarPlan(env.BD, dueno, id, ahora.toISOString());
  return json({ ...antes, plan: id, planDesde: ahora.toISOString(), servidor: plan(id).servidor && procesadoEncendido(env) } satisfies Cuenta);
}
