import { ErrorApi, SIN_CONEXION, mensajeDeCuerpo } from './peticion';

/**
 * Manda una parte del video con XMLHttpRequest y no con fetch: fetch no
 * cuenta lo que lleva enviado, y con partes de 50 MiB la barra se quedaria
 * quieta un minuto entero en una conexion normal.
 */
export function enviarParte(url: string, trozo: Blob, alAvanzar: (bytes: number) => void, senal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (senal.aborted) return rechazar(new DOMException('Subida parada', 'AbortError'));
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => alAvanzar(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver();
      rechazar(new ErrorApi(xhr.status, mensajeDeCuerpo(xhr.responseText, xhr.status)));
    };
    xhr.onerror = () => rechazar(new ErrorApi(0, SIN_CONEXION));
    xhr.onabort = () => rechazar(new DOMException('Subida parada', 'AbortError'));
    senal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(trozo);
  });
}
