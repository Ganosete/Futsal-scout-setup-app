/**
 * La pagina de los jugadores (/v/<token>): la misma para todos los enlaces,
 * porque el token lo lee la propia pagina de la direccion. Se sirve
 * jugadores.html de los estaticos.
 */
export async function paginaJugadores(peticion: Request, env: Env): Promise<Response> {
  if (peticion.method !== 'GET' && peticion.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const r = await env.ASSETS.fetch(new Request(new URL('/jugadores', peticion.url), { method: peticion.method }));
  const cabeceras = new Headers(r.headers);
  // El token va en la direccion: que no salga hacia otras webs, que no se guarde por el camino y que no se indexe.
  cabeceras.set('referrer-policy', 'no-referrer');
  cabeceras.set('cache-control', 'no-store');
  cabeceras.set('x-robots-tag', 'noindex');
  return new Response(r.body, { status: r.status, headers: cabeceras });
}
