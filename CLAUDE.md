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
- `src/nucleo/` es la detección: **TypeScript puro, sin DOM ni APIs del Worker**, porque tiene
  que correr en el navegador, en un worker del navegador y en Node (fase 6, en Containers).
- `src/contenedor/` es el programa del contenedor (fase 6): Node con ffmpeg, sin DOM ni APIs del
  Worker (`tsconfig.contenedor.json`). Usa el mismo núcleo y lo mismo de `src/comun/` que el
  navegador: solo cambia quién decodifica.
- **Un fragmento es `[desde, hasta)` sobre el vídeo original.** No se recorta nada hasta que
  alguien descarga, y entonces sin recodificar.
- **Lo que decide el usuario manda sobre lo automático.** Un fragmento corregido a mano lleva
  `manual` y ningún análisis nuevo lo pisa. La edición del servidor solo se guarda si el partido
  aún no tiene (`If-None-Match: *`).
- **Nunca se carga un partido entero en memoria.** Se lee por acceso aleatorio (local) o por
  rangos HTTP (R2).
- **Lo pesado va en un worker del navegador**; nada bloquea la interfaz.
- La API no se cachea (`no-store`) y sus errores no cuentan detalles internos.
- **Cada entrenador ve solo lo suyo:** toda consulta de un partido lleva el dueño en el `WHERE`
  (`servidor/partidos/almacen.ts`); el partido de otro es un 404, no un 403.
- **Quién llama, por orden** (`servidor/api.ts`): su sesión (cookie `futsal-scout-sesion`, de
  entrar con el email), la identidad de localhost, el JWT de Access y, si no, 401 «Entra con tu
  email para seguir.». La API nunca queda abierta.
- **Los planes están en `comun/planes.ts`** y los comprueban el Worker (al crear un partido, al
  cambiar de plan y en la limpieza) y la página (para enseñarlos), con las mismas funciones.
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
  del editor salvo el reproductor, la descarga y el gráfico del ritmo: pesa unos 13 KB
  comprimidos, estilos incluidos (sin el HTML).

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
  localhost): así van en paralelo sin ver los partidos de las demás. Con el valor `sin-sesion`
  se hace como si no hubiera nadie, que es lo que ve quien llega sin cuenta.
- **El plan gratuito deja 3 partidos por dueño:** una prueba que cree más tiene que cambiarle
  antes el plan.
- **Con un `vite preview` ya en marcha en el 4173, `npm run test:e2e` lo reutiliza**
  (`reuseExistingServer` fuera de CI) y prueba esa compilación con la base de datos de
  desarrollo: antes de las pruebas, hay que pararlo.
- **Las pruebas del contenedor** (`tests/contenedor/`) usan ffmpeg de verdad y los vídeos de
  prueba, contra una pasarela de mentira (`pasarelaFalsa.ts`). Sin ffmpeg se saltan en local; en la
  CI no. `programa.test.ts` solo corre con `CONTENEDOR_PROGRAMA` (el fichero compilado) o
  `CONTENEDOR_IMAGEN` (la imagen de Docker): el job `contenedor` de la CI construye la imagen y le
  pasa esa prueba.
- **Nada de ajustar umbrales hasta que una prueba pase.** Si la medida real no llega, el que está
  mal es el umbral: se apunta el número medido y qué significa.

## Ramas y despliegue

- **`main` es producción**: Workers Builds la publica sola. No se hace push a `main` sin
  preguntar. Se trabaja en ramas; cada una tiene su versión de vista previa.
- Commits pequeños, en castellano, que expliquen el porqué.
- Antes de cada push: `npm run typecheck`, `npm test` y `npm run test:e2e`.
- **La fase 6 va en su rama (`claude/fase-6-servidor`)**: con el contenedor en `wrangler.jsonc`, el
  despliegue pide el plan de pago de Workers, y en el gratuito falla.

## Cosas que conviene no olvidar

- **npm 10 falla al añadir Vitest 4** (`Cannot read properties of null (reading 'edgesOut')`):
  para añadir o actualizar dependencias, `npx npm@11 install ...`. Instalar desde el lockfile
  (`npm install`, `npm ci`) funciona con npm 10.
- **`run_worker_first: ["/api/*"]` en `wrangler.jsonc` es imprescindible.** Sin eso, la regla de
  SPA devuelve `index.html` también para la API.
- **La CSP de `public/_headers` es estricta**: nada de scripts ni estilos en línea, y cualquier
  origen externo se añade a propósito.
- Mediabunny se carga con un `import()` al elegir el vídeo o al descargar: la página del
  entrenador pesa unos 41 KB comprimidos sin el HTML (editor, «Quién ataca», la pista, el ritmo y
  la cuenta incluidos) y Mediabunny, unos 107 KB, llega después.
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
  `ACCESS_AUD`, Access no cuenta y solo se entra con el email.
- **Entrar con el email** (`servidor/cuentas/`): en D1 solo van los hashes del código y de la
  sesión. En localhost el código va siempre en la respuesta (`codigoLocal`), haya o no binding de
  correo, y «Salir» pone también `futsal-scout-local=sin-sesion` (si no, se volvería a entrar
  sola). Fuera de localhost, sin `EMAIL` (binding `send_email`) y `CORREO_REMITENTE`, pedir un
  código es un 503. Email Sending pide el plan de pago de Workers y un dominio con el DNS en
  Cloudflare dado de alta en Email Service.
- **Quien entra por Access no ve «Salir»** (`puedeSalir` en `GET /api/cuenta`): salir de ahí es
  cosa de Access.
- **Un 401 a mitad** (`api/peticion.ts`, `alPerderLaSesion`) saca la pantalla de entrar encima de
  lo abierto, sin recargar. Al arrancar sin sesión, `body[data-sesion="no"]` deja ver solo esa
  pantalla (`estilos/cuenta.css`), pase lo que pase con el `hidden` de las demás secciones.
- **Lo que está a medio subir cuenta entero en el plan:** ya tiene su sitio. Reanudar una subida
  no vuelve a pasar por los límites.
- **Los días de cada partido cuentan desde `max(creado, plan_desde)`** (`comun/planes.ts`): quien
  baja de plan tiene los días del nuevo para bajarse lo suyo. Bajar de plan no borra nada para
  hacer sitio: si lo guardado no cabe, es un 409.
- **La limpieza (`servidor/limpieza.ts`) corre cada hora y borra de 10 partidos en 10:** cada uno
  son tres llamadas a R2 y D1, y el plan gratuito de Workers da 50 subpeticiones por invocación.
  Sus pruebas no adelantan el reloj, que la base de datos es la misma para todas: envejecen a mano
  los partidos de cada prueba.
- **Tras `vite build`, un `vite preview` que ya estaba en marcha sigue con la lista de estáticos
  vieja**: lo nuevo le llega como `index.html`. Hay que reiniciarlo.
- **El contenedor solo alcanza `http://almacen.interno`** (arranca con `enableInternet: false`): el
  Durable Object lo intercepta y lo atiende `procesado/pasarela.ts`, con el partido y su dueño en
  `props`. Para el vídeo, las señales y la edición usa los manejadores de la API del entrenador. El
  contenedor no ve otro partido ni ninguna clave.
- **Una sola pasada de ffmpeg** (`contenedor/ffmpeg.ts`): el audio en PCM por el descriptor 3, la
  imagen de 96 × 54 en RGBA por el 4 y la versión ligera a disco. `aresample=async=1:first_pts=0`
  pone la primera muestra en el 0 y rellena los huecos; ffmpeg aplica la lista de edición. El
  tamaño de la imagen y los fotogramas por segundo salen del núcleo (`IMAGEN_ANALISIS`,
  `FPS_ANALISIS`): si cambian en un lado y no en el otro, la mediana de los umbrales cambia.
- **Medido con los vídeos de prueba en el servidor:** `analisis.mp4` da [0, 19,981) y [30, 60);
  `recortado.mp4`, el silbato en 14,501 s y el segundo fragmento desde 24,4 s (la imagen se mira
  cada 0,2 s). Lo mismo que el navegador.
- **Toda la decisión del Durable Object está en `procesado/orquesta.ts`**, que se prueba con un
  contenedor de mentira. `procesador.ts` es solo el enchufe con `ctx.container` y no se puede
  probar sin Containers de verdad: que siga siendo fino.
- **En local y en las pruebas no hay contenedores** (`dev.enable_containers: false`, que se
  conserva en la salida de `vite build`, así que `vite preview` tampoco construye la imagen). El
  Durable Object de verdad contesta `no-disponible` y la API, 503. Las pruebas de la API inyectan
  un `Lanzador`, como el cartero del correo.
- **Una petición creada dentro del Worker no lleva `Content-Length`**, aunque su cuerpo tenga
  tamaño conocido: las pruebas que llaman a `atenderPasarela` sin pasar por `fetch` lo ponen a mano,
  como lo manda el contenedor por HTTP.
- **La imagen del contenedor sale de `mirror.gcr.io`, fijada por digest**: Docker Hub limita las
  descargas sin cuenta. Desde este entorno no se llega a `deb.debian.org`, así que la imagen solo
  se construye y se prueba en la CI.
- **`npm run build` compila también el programa del contenedor** (`dist/contenedor/principal.mjs`):
  el Dockerfile lo copia de ahí, así que sin compilarlo antes no se construye la imagen.
- **Los jugadores ven la versión ligera si la hay** (`procesados.ligero_tamano`); el entrenador,
  siempre el original. Lo que se bajan los jugadores sale de la ligera.
- **Los medidores de «Mi cuenta» siguen la skill de dataviz** (`cliente/cuenta/medidas.ts`): lista
  con las barras alineadas (subgrid) y la pista del mismo color que el relleno. El naranja del
  acento y el ámbar de «Casi lleno» no se distinguen con daltonismo (lo dice el validador): el
  estado va siempre con icono y palabra.
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
- **onnxruntime-web va con `onnxruntime-web/jspi`** (`cliente/equipos/sesion.ts`): su `.wasm`, con
  WebGPU, mide 17,9 MB y cabe como estático de Cloudflare (máximo 25 MiB por fichero); el de
  `/webgpu` no cabe. Compilar WebAssembly pide `'wasm-unsafe-eval'` en la CSP, y nada más. Sin
  aislamiento entre orígenes no hay `SharedArrayBuffer`: un hilo.
- **El detector no va en el repositorio ni en las pruebas.** El Worker lo trae de Hugging Face
  (`/api/modelos/...`, comprueba el tamaño) y el navegador comprueba el SHA-256 y lo guarda en
  Cache Storage. Si cambia el fichero, sube `version` en `comun/modelos.ts`: va en la ruta y
  renueva la caché. Las pruebas usan uno de juguete con la misma firma
  (`tests/fixtures/detector_prueba.onnx`, de `tools/crear_modelo_prueba.py`); en Playwright se
  sirve con `page.route` sobre `/api/modelos/detector`.
- El Chromium de Playwright no tiene WebGPU: las pruebas recorren el camino de WASM.
- **Sin detecciones guardadas, `GET .../detecciones` responde 204, no 404**: un 404 esperado sale
  como error en la consola del navegador.
- **Lo que pone «Quién ataca» entra por `editor.cambiar`**: va al historial (se deshace con
  Ctrl+Z) y se guarda como cualquier cambio, pero no toca lo `manual` ni se apunta en
  `correcciones`, que son las decisiones del entrenador y la verdad con la que se mide el
  detector.
- **Medida sin tocar umbrales:** quitar el color del suelo se come parte de una camiseta verde
  lima sobre césped (3 imágenes de fútbol: 44 muestras de la blanca y 15 de la verde). Se mira
  otra vez con partidos de sala antes de cambiar nada en `nucleo/equipos/color.ts`.
- **Filtrar no cambia los fragmentos** (`comun/filtros.ts`): solo cuáles se enseñan y cuáles se
  recorren. Cada fila lleva su número de la lista entera, que es el de las descargas.
- **La pista marcada va normalizada a [0,1] sobre el fotograma que enseña el `<video>`**
  (`nucleo/pista/calibracion.ts`): es el mismo espacio que el de las detecciones guardadas (el
  `displayWidth` × `displayHeight` de Mediabunny), así que se pasa a píxeles con `videoWidth` y
  `videoHeight`. Va en el estado del editor (se guarda y se deshace), pero no es una corrección.
- **A 3 fotogramas por segundo no vale tal cual todo lo de futsal-tracking, que mira a 20.** Para
  los toques (`nucleo/equipos/porToques.ts`) la trayectoria va sin suavizar ni interpolar, y la
  ventana de la velocidad abarca un fotograma a cada lado: el retraso del Kalman al arrancar un
  pase parecía un toque del rival junto al que pasaba. El balón fuera sí usa la trayectoria normal.
- **Un saque tiene que verse** (`nucleo/balonParado/porBalon.ts`): el balón quieto en la línea que
  arranca a más de 3 m/s. Si no se ve, la salida no se quita. Las detecciones que se inventen en
  las pruebas tienen que respetarlo.
- **Un tsconfig con `extends` hereda el `exclude` del padre**: si tiene su propio `include`, necesita
  `"exclude": []`. Sin eso, `tsconfig.pruebas-servidor.json` no miraba ni un fichero de
  `tests/servidor`.
- **Las clases del detector van en el manifiesto** (`comun/modelos.ts`): pasar al detector afinado
  es cambiar `DETECTOR` (fichero, tamaño, SHA-256, versión, entrada y clases), no el código.
- **La estrella de «Mi selección» no es una corrección** (`editor/marcas.ts`): no deja el fragmento
  `manual` ni se apunta. Sin marcar no se guarda el campo, así que las ediciones de antes valen.
- **El vídeo de la selección empieza cada jugada en su fotograma clave** (`descarga/union.ts`): la
  lista de edición que esconde lo de antes solo vale al principio del fichero. Se prueba en Node
  con los vídeos de verdad y en Chromium que el resultado se carga y se puede saltar por él.
- **Los gráficos siguen la skill de dataviz** (`cliente/ritmo/`): leyenda, marcas finas, 2 px de
  superficie entre tramos, foco de teclado y tabla. Los colores de los equipos están validados
  con su script en claro y en oscuro; si se cambian esos tokens, hay que volver a pasarlo.
