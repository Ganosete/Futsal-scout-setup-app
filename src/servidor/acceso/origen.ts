/**
 * Freno a las peticiones que otra web lanza en nombre de quien tiene la sesion
 * abierta (CSRF). Un navegador manda `Origin` en todo lo que no es GET: si
 * viene de otra web, no se atiende. Sin `Origin` no es un navegador (curl, un
 * script con un token de servicio), y a esos no los mueve otra pagina.
 */
export function origenPermitido(peticion: Request): boolean {
  if (peticion.method === 'GET' || peticion.method === 'HEAD') return true;
  const origen = peticion.headers.get('origin');
  return origen === null || origen === new URL(peticion.url).origin;
}
