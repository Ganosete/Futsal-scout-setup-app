// Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), src/store/huella.ts.
// Cambios: sin huellaBuffer, que alli identifica modelos y aqui no hace falta;
// el comentario de cabecera cuenta para que se usa aqui, y los comentarios van
// sin enes, como en el resto de este repositorio.

/**
 * Huella SHA-256 de un fichero, para identificarlo de verdad: el mismo video
 * elegido otra vez da la misma huella, y con ella el servidor reanuda su
 * subida en vez de empezar otra.
 *
 * Solo se leen los primeros y los ultimos megas, no el fichero entero: un
 * partido son gigas y hashearlos costaria varios segundos cada vez. Con las dos
 * puntas mas el tamano, dos ficheros distintos no coinciden salvo que alguien
 * lo busque a proposito.
 */

/** Cuanto se lee de cada punta. */
const TROZO = 2 * 1024 * 1024;

function aHex(datos: ArrayBuffer): string {
  return [...new Uint8Array(datos)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Devuelve los 16 primeros caracteres del SHA-256, que son 64 bits: de sobra
 * para distinguir los ficheros de una persona.
 */
export async function huellaFichero(f: File | Blob, trozo = TROZO): Promise<string> {
  const partes: BlobPart[] = [];
  if (f.size <= trozo * 2) {
    partes.push(await f.arrayBuffer());
  } else {
    partes.push(await f.slice(0, trozo).arrayBuffer());
    partes.push(await f.slice(f.size - trozo).arrayBuffer());
  }
  // El tamano entra en el hash: si no, un fichero y su prefijo darian lo mismo.
  partes.push(new TextEncoder().encode(`|${f.size}`));
  const datos = await new Blob(partes).arrayBuffer();
  return aHex(await crypto.subtle.digest('SHA-256', datos)).slice(0, 16);
}
