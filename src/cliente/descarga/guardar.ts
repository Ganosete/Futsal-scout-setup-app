/** Entrega al navegador un fichero hecho en memoria, como si viniera de un enlace de descarga. */
export function guardarFichero(datos: ArrayBuffer, nombre: string, tipo = 'video/mp4'): void {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.hidden = true;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Se libera mas tarde: algunos navegadores aun leen la URL despues del clic.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
