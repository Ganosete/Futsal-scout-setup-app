# Convenciones del proyecto

Web de scout automático de fútbol sala: corta el partido en fragmentos de juego, se corrige a
mano y se comparte con los jugadores. El análisis corre en el navegador del entrenador; un Worker
de Cloudflare sirve la página y la API, con los vídeos en R2 y los datos en D1. La hoja de ruta
está en el README.

## Idioma

- **Se habla y se escribe en castellano**: conversación, README, comentarios, commits y textos
  de la interfaz.
- **El código va en castellano también**: módulos, funciones, variables y tipos
  (`leerMetadatos`, `validarFichero`, `duracionSeg`). Se quedan en inglés los términos que ya son
  el nombre de la cosa (`worker`, `fetch`, `moov`, `codec`, `fps`).
- **Sin tildes ni eñes dentro del código fuente** (identificadores y comentarios). Sí las llevan
  los textos que ve el usuario (aunque estén en un `.ts`), el README y esta guía.

## Estilo

- TypeScript estricto. Nada de `any`: si un tipo externo no ayuda, se escribe el mínimo que haga
  falta.
- Sin frameworks salvo que se justifique. La interfaz es DOM a pelo y el Worker usa su propio
  enrutador (`src/servidor/rutas.ts`).
- Comentarios solo para explicar **por qué**, nunca para repetir el código.
- Ficheros pequeños y con una sola responsabilidad: si uno pasa de ~300 líneas, son dos.
- Funciones puras siempre que se pueda: es lo que permite probar sin navegador.

## Arquitectura

- `src/cliente/` corre en el navegador; `src/servidor/` en el Worker (sin DOM; sus tipos los
  genera `wrangler types`); `src/comun/` son tipos y funciones puras que usan los dos.
- `src/nucleo/` será la detección: **TypeScript puro, sin DOM ni APIs del Worker**, porque tiene
  que correr en el navegador, en un worker del navegador y en Node (fase 6, en Containers).
- **Un fragmento es `[desde, hasta)` sobre el vídeo original.** No se recorta nada hasta que
  alguien descarga, y entonces sin recodificar.
- **Lo que decide el usuario manda sobre lo automático.** Un fragmento corregido a mano lleva
  `manual` y ningún análisis nuevo lo pisa.
- **Nunca se carga un partido entero en memoria.** Se lee por acceso aleatorio (local) o por
  rangos HTTP (R2).
- **Lo pesado va en un worker del navegador**; nada bloquea la interfaz.
- La API no se cachea (`no-store`) y sus errores no cuentan detalles internos.
- **Cada entrenador ve solo lo suyo:** toda consulta de un partido lleva el dueño en el `WHERE`
  (`servidor/partidos/almacen.ts`); el partido de otro es un 404, no un 403.
- **Las jugadas de un partido van en un JSON en R2, no en D1:** con muchas correcciones pueden
  pasar de los 2 MB por fila de D1. Cada guardado lleva `If-Match` con el ETag de R2, y un 412
  (otra pestaña guardó antes) para el guardado automático en vez de pisar lo de la otra.
- El formato de lo que se guarda y su validación están en `src/comun/`: el Worker lo comprueba al
  guardar y el navegador al abrir, con la misma función.
- **Todo lo de los jugadores va bajo `/v/`**: la página (`/v/<token>`, que es `jugadores.html`),
  su API (`/v/api/<token>`), los estáticos de las dos páginas (`/v/recursos/`) y el icono. Así en
  Access basta una regla *Bypass* para `/v/*`. Esas rutas solo leen y las abre el token; no
  devuelven nada del entrenador (`servidor/compartir/jugadores.ts`).
- Son dos páginas de Vite (`index.html` y `jugadores.html`). La de los jugadores no importa nada
  del editor salvo el reproductor y la descarga: pesa unos 9 KB comprimidos, estilos incluidos.

## Código copiado de futsal-tracking

Se copia, no se importa ni se toca aquel repositorio. Cada fichero copiado empieza con:

```ts
// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos), src/balonParado/pitidos.ts.
// Cambios: ninguno.
```

Si se cambia algo, la línea `Cambios:` dice qué y por qué. Sus pruebas se copian con él.

## Pruebas

- **Vitest**, en `tests/`, en Node: lógica pura, con casos concretos y valores calculados a mano,
  no comparando contra la propia implementación.
- Los vídeos de `tests/fixtures/` salen de `tools/crear_videos_prueba.sh`; no se editan a mano.
- **Pruebas del Worker**, en `tests/servidor/`, dentro de workerd con D1 y R2 locales
  (`@cloudflare/vitest-plugin`; el antiguo `vitest-pool-workers` está obsoleto). Llaman al Worker
  entero (`exports.default.fetch`) y tienen su propio tsconfig (`tsconfig.pruebas-servidor.json`).
- **Playwright**, en `e2e/`, contra `vite preview`: la compilación de producción con el Worker
  real en workerd, en escritorio y en un móvil emulado. Usa sus propios D1 y R2 locales
  (`.wrangler/e2e`), vacíos y migrados en cada arranque.
- **Cada prueba entra con su propio dueño** (la cookie `futsal-scout-local`, que solo cuenta en
  localhost): así van en paralelo sin ver los partidos de las demás.
- **Nada de ajustar umbrales hasta que una prueba pase.** Si la medida real no llega, el que está
  mal es el umbral: se apunta el número medido y qué significa.

## Ramas y despliegue

- **`main` es producción**: Workers Builds la publica sola. No se hace push a `main` sin
  preguntar. Se trabaja en ramas; cada una tiene su versión de vista previa.
- Commits pequeños, en castellano, que expliquen el porqué.
- Antes de cada push: `npm run typecheck`, `npm test` y `npm run test:e2e`.

## Cosas que conviene no olvidar

- **npm 10 falla al añadir Vitest 4** (`Cannot read properties of null (reading 'edgesOut')`):
  para añadir o actualizar dependencias, `npx npm@11 install ...`. Instalar desde el lockfile
  (`npm install`, `npm ci`) funciona con npm 10.
- **`run_worker_first: ["/api/*"]` en `wrangler.jsonc` es imprescindible.** Sin eso, la regla de
  SPA devuelve `index.html` también para la API.
- **La CSP de `public/_headers` es estricta**: nada de scripts ni estilos en línea, y cualquier
  origen externo se añade a propósito.
- Mediabunny se carga con un `import()` al elegir el vídeo o al descargar: la página inicial
  pesa unos 11 KB comprimidos (editor incluido) y Mediabunny, unos 80 KB, llega después.
- Los source maps del cliente no se publican; los del Worker se suben a Cloudflare.
- Mediabunny da la rotación en sentido horario; ffmpeg la guarda en antihorario (`rotado.mp4`:
  90 en ffmpeg, 270 en Mediabunny).
- Miniflare avisa al arrancar de que no puede descargar `Request.cf` si no hay internet; es
  inofensivo.
- **Las operaciones del editor son puras y devuelven un estado nuevo** (`editor/operaciones.ts`):
  así deshacer es guardar el estado anterior entero. Todo lo que tocan queda `manual` y se apunta
  en `correcciones`.
- **Cambiar las partes no recalcula todo** (`editor/limitesPartes.ts`): se recortan los
  fragmentos que hay y solo se calcula lo que antes quedaba fuera. Recalcular resucitaría lo que
  el entrenador ya había quitado.
- **Un fragmento de menos de 3 s se une al vecino, no se tira** (`nucleo/fragmentos.ts`): puede
  ser una falta que acaba en gol.
- **El recorte a MP4 empieza exacto y puede acabar uno o dos fotogramas tarde**
  (`descarga/recorte.ts`): se copia desde el fotograma clave anterior con una lista de edición
  que lo esconde, y al final hay que copiar el fotograma B del que depende el último. Como no
  decodifica, se prueba en Node con los vídeos de verdad.
- WebCodecs solo existe en un contexto seguro: `localhost` vale, `about:blank` no.
- **`ctx.access` no llega a un Worker con estáticos** (el router de los estáticos no lo pasa): por
  eso el JWT de Access se verifica a mano (`servidor/acceso/`). Sin `ACCESS_EQUIPO` y
  `ACCESS_AUD`, la API responde 503 fuera de localhost; nunca queda abierta.
- **R2 exige partes iguales salvo la última**, de al menos 5 MiB, y tira las subidas a medias a
  los 7 días (por eso una de más de 6 días se empieza de nuevo). Miniflare lo comprueba igual.
- En Miniflare, el cuerpo de un objeto de R2 llega sin tamaño conocido: el vídeo pone
  `Content-Length` a mano, o la respuesta iría troceada.
- `wrangler types --strict-vars=false`: sin eso, una var vacía de `wrangler.jsonc` tiene el tipo
  literal `""`.
- Un cambio en el esquema de D1 es una migración nueva en `migrations/`; las aplicadas no se
  tocan. En local, `npm run bd:local`; en producción la aplica el comando de despliegue.
- **Con una subida a medias o cambios sin guardar, la página pide confirmación al salir.** En
  Playwright eso cuelga un `reload()`: antes hay que esperar a «Vídeo subido.» y a «Cambios
  guardados.» (`esperarSubida`, `esperarGuardado`).
- `Intl.NumberFormat` separa el número del `%` con un espacio duro (U+00A0).
- `run_worker_first` lleva patrones negativos (`!/v/recursos/*`, `!/v/favicon.svg`): lo demás de
  `/v/` pasa por el Worker. `env.ASSETS.fetch()` desde el Worker aplica `_headers`, así que
  `/v/<token>` sale con la misma CSP.
- Dos botones con el mismo texto (el «Quitar» del fragmento y el del enlace) necesitan nombres
  accesibles distintos (`aria-label`): un lector de pantalla, y Playwright, no los distinguen.
- En Playwright, un clic por coordenadas (`page.mouse`) en algo que queda por debajo del borde
  de la ventana cae fuera: usa `locator.click({ position })`, que desplaza antes.
