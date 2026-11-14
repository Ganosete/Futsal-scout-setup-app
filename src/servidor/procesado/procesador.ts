import { DurableObject } from 'cloudflare:workers';
import type { TareasProcesado } from '../../comun/procesado';
import { cancelar, empezar, vigilar, type Contenedor, type Memoria, type ResultadoEmpezar, type TrabajoEnMarcha } from './orquesta';

/**
 * Un Durable Object por partido, con su contenedor (wrangler.jsonc). Es solo
 * el enchufe entre el runtime y orquesta.ts, que es donde se decide todo.
 *
 * El contenedor arranca sin internet: lo unico que alcanza es
 * http://almacen.interno, que se intercepta y atiende la pasarela de este
 * partido (pasarela.ts) con R2 y D1. No ve ningun otro partido ni ninguna
 * clave.
 */

const PUERTO = 8080;
const CLAVE = 'trabajo';

export class Procesador extends DurableObject<Env> {
  private contenedor(): Contenedor {
    const { ctx } = this;
    const c = ctx.container;
    return {
      disponible: c !== undefined,
      get enMarcha() {
        return c?.running ?? false;
      },
      arrancar: async (partido, dueno) => {
        if (!c) throw new Error('Este Worker no tiene contenedores');
        if (c.running) return;
        // Las intercepciones duran lo que dura el contenedor: se ponen en cada arranque.
        await c.interceptOutboundHttp('almacen.interno', ctx.exports.PasarelaProcesado({ props: { partido, dueno } }));
        c.start({ enableInternet: false });
        // Si nadie le pregunta en diez minutos, se para solo (y se deja de pagar).
        await c.setInactivityTimeout(10 * 60_000);
      },
      pedir: (ruta, init) => {
        if (!c) throw new Error('Este Worker no tiene contenedores');
        return c.getTcpPort(PUERTO).fetch(`http://contenedor${ruta}`, init);
      },
      parar: async () => {
        if (c?.running) await c.destroy();
      },
    };
  }

  private memoria(): Memoria {
    const { storage } = this.ctx;
    return {
      leer: async () => (await storage.get<TrabajoEnMarcha>(CLAVE)) ?? null,
      guardar: (t) => storage.put(CLAVE, t),
      olvidar: async () => {
        await storage.delete(CLAVE);
        await storage.deleteAlarm();
      },
      despertarEn: (ms) => storage.setAlarm(Date.now() + ms),
    };
  }

  empezar(p: { partido: string; dueno: string; tareas: TareasProcesado }): Promise<ResultadoEmpezar> {
    return empezar(this.contenedor(), this.memoria(), this.env.BD, p, Date.now());
  }

  cancelar(): Promise<void> {
    return cancelar(this.contenedor(), this.memoria());
  }

  async alarm(): Promise<void> {
    await vigilar(this.contenedor(), this.memoria(), this.env.BD, Date.now());
  }
}
