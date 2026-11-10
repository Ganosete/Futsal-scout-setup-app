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
- **Playwright**, en `e2e/`, contra `vite preview`: la compilación de producción con el Worker
  real en workerd, en escritorio y en un móvil emulado.
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
- En Playwright, un clic por coordenadas (`page.mouse`) en algo que queda por debajo del borde
  de la ventana cae fuera: usa `locator.click({ position })`, que desplaza antes.
