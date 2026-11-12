import { FalloApi } from './respuestas';

/**
 * El cuerpo de una peticion como texto, sin pasar de `limite` bytes. Se lee a
 * trozos y se corta en cuanto sobra: `request.text()` lo meteria entero en
 * memoria, y un Worker tiene 128 MB para todo.
 */
export async function leerTexto(peticion: Request, limite: number): Promise<string> {
  const demasiado = new FalloApi(413, 'Los datos que se mandan son demasiado grandes.');
  if (Number(peticion.headers.get('content-length') ?? 0) > limite) throw demasiado;
  if (!peticion.body) return '';
  const lector = peticion.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await lector.cancel();
      throw demasiado;
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    todo.set(t, i);
    i += t.byteLength;
  }
  return new TextDecoder().decode(todo);
}

export async function leerJson(peticion: Request, limite: number): Promise<unknown> {
  const texto = await leerTexto(peticion, limite);
  try {
    return JSON.parse(texto);
  } catch {
    throw new FalloApi(400, 'Los datos que se mandan no son JSON.');
  }
}
