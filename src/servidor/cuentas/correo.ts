/**
 * El correo con el codigo de entrada, por Cloudflare Email Service: el binding
 * `send_email` llamado EMAIL y un remitente de un dominio dado de alta en el
 * servicio (CORREO_REMITENTE). Mandar a cualquier direccion pide el plan de
 * pago de Workers, asi que el binding no va en wrangler.jsonc hasta que se
 * configure: se lee como opcional.
 */

export interface MensajeCorreo {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface EnvioCorreo {
  send(m: MensajeCorreo): Promise<unknown>;
}

interface ConfigCorreo {
  EMAIL?: EnvioCorreo;
  CORREO_REMITENTE?: string;
}

export type Cartero = (env: Env, mensaje: Omit<MensajeCorreo, 'from'>) => Promise<void>;

export function hayCorreo(env: Env): boolean {
  const c = env as Env & ConfigCorreo;
  return Boolean(c.EMAIL && c.CORREO_REMITENTE);
}

export const carteroCloudflare: Cartero = async (env, mensaje) => {
  const c = env as Env & ConfigCorreo;
  if (!c.EMAIL || !c.CORREO_REMITENTE) throw new Error('Email Service no está configurado');
  await c.EMAIL.send({ from: c.CORREO_REMITENTE, ...mensaje });
};

export function mensajeCodigo(para: string, codigo: string, minutos: number): Omit<MensajeCorreo, 'from'> {
  const texto = `Tu código para entrar en Futsal Scout es ${codigo}.\n\nCaduca en ${minutos} minutos. Si no lo has pedido tú, no hagas nada: sin el código nadie puede entrar.`;
  return {
    to: para,
    subject: `${codigo} es tu código para entrar en Futsal Scout`,
    text: texto,
    html: `<p>Tu código para entrar en Futsal Scout es:</p><p><strong>${codigo}</strong></p><p>Caduca en ${minutos} minutos. Si no lo has pedido tú, no hagas nada: sin el código nadie puede entrar.</p>`,
  };
}
