# Futsal Scout

Scout automático de fútbol sala para entrenadores y scouters. Subes el vídeo del partido y la
aplicación lo corta en jugadas: quita los ratos de balón parado (bandas, córners, faltas,
saques de portería, tiempos muertos, descanso), te deja corregir con un clic lo que falle y
compartir los clips con tus jugadores.

> **Nombre provisional.** El repositorio y la interfaz dicen «Futsal Scout» hasta que se decida
> la marca; cambiarlo es una línea en `index.html`.

## Estado

**Fases 1, 2, 4 y 5 hechas, y de la 3 todo menos el detector afinado**, que necesita datos y una
GPU. Falta medirlo todo con partidos reales. Lo que hay:

1. **Nuevo partido:** eliges el vídeo y se comprueba al momento (duración, imagen, sonido,
   tamaño, y si hay algo que impida usarlo o que vaya a salir peor).
2. **Subir y analizar:** el vídeo se sube por partes mientras el navegador escucha el silbato y
   mide el movimiento de la imagen para cortar el partido en fragmentos de juego. Propone el
   descanso si lo encuentra. Si la subida se corta, al elegir el mismo vídeo sigue donde se quedó.
3. **Revisar:** un editor con el vídeo, la línea de tiempo y la lista de fragmentos. Equipo con
   un clic, unir, partir, ajustar inicio y fin, quitar, marcar las partes, y deshacer, todo con
   atajos de teclado. Cada cambio se guarda solo.
4. **Quién ataca:** con un botón, el navegador busca en cada fragmento qué jugador tiene el
   balón, agrupa las camisetas en dos colores y pregunta cuál lleva el local. Con la respuesta
   pone el equipo de cada fragmento y, si quieres, lo parte donde cambia la posesión. Lo que
   hayas puesto a mano no se toca, y lo que pone se deshace como cualquier corrección. Lo que ve
   el detector se guarda: al abrir el partido otro día basta con contestar la pregunta.
5. **La pista, con la cámara fija:** se marcan sus cuatro esquinas sobre el vídeo. Con ella,
   «Quién ataca» ve cuándo sale el balón y quita de los fragmentos el rato que va de la salida al
   saque (bandas y córners, que el silbato no ve), y la posesión se mide por toques en vez de
   por cercanía.
6. **Ver solo un equipo o una parte**, en el editor y en la página de los jugadores, también al
   verlo todo seguido.
7. **Mi selección:** una estrella en los fragmentos que quieres para la charla (desde la fila o
   con la S), un filtro para ver solo esos y «Descargar la selección»: un MP4 con todos, uno
   detrás de otro, sin recodificar. Los jugadores ven la selección y también la pueden bajar.
8. **Ritmo del partido:** cuánto se juega y quién tiene el balón, por tramos de 5 minutos de
   vídeo dentro de cada parte, con el reparto de cada parte y del partido. Cambia con cada
   corrección, y lo ven también los jugadores.
9. **Mis partidos:** lo subido, para volver a abrirlo (el vídeo se ve desde el servidor) o
   borrarlo.
10. **Descargar en MP4** cualquier fragmento, sin recodificar y con un nombre que dice partido,
   fecha, jugada y minuto.
11. **Compartir con los jugadores:** un enlace (7 días, 30 días o sin caducidad) con el que ven y
   descargan las jugadas desde el móvil, sin cuenta. El entrenador ve cuántas veces se ha abierto
   y lo quita cuando quiere; lo que corrija después, los jugadores lo ven al volver a abrirlo.
12. **Entrar con el email:** llega un código y con él se entra, sin contraseñas; la primera vez es
   el alta. En la cabecera, el plan, «Mi cuenta» y «Salir».
13. **Planes:** Gratuito, Scout y Pro, cada uno con sus partidos, su almacenamiento y los días que
   se guarda cada partido. «Mi cuenta» enseña lo que usas y deja cambiar de plan, y «Mis partidos»
   dice cuándo se borra cada uno. **El pago es una maqueta:** no pide datos y no cobra nada.

**Las cifras de los planes son provisionales** (`src/comun/planes.ts`, un cambio de una línea):

| Plan | Precio | Partidos | Almacenamiento | Cada partido se guarda |
|---|---|---|---|---|
| Gratuito | 0 € | 3 | 10 GB | 30 días |
| Scout | 9 € al mes | 30 | 150 GB | 1 año |
| Pro | 19 € al mes | sin límite | 500 GB | sin límite |

Lo que cuesta de verdad es el almacenamiento en R2, a unos 0,015 $ por GB y mes: un plan gratuito
lleno son 0,15 $ al mes.

**Lo que tarda «Quién ataca».** La primera vez descarga el detector (108 MB) y lo guarda en el
navegador. Con tarjeta gráfica (WebGPU) mira 3 fotogramas por segundo de juego. Sin ella mira uno
cada 2 s y aun así va despacio: en las pruebas, cada fotograma tardó 1,5 s, así que un partido con
45 min de juego son unos 35 min. Con WebGPU aún no está medido.

## Qué hará

1. Subir el vídeo de un partido (MP4 o MOV de 1-2 h).
2. Detectar cuándo el balón está en juego y cuándo parado, y cortar el partido en fragmentos de juego.
3. Asignar cada fragmento al equipo que tiene el balón (ataque local o visitante).
4. Corregir con un clic el equipo de un fragmento, unir o partir fragmentos y ajustar el inicio y el final.
5. Separar los clips por equipo y por partes (1.ª y 2.ª parte).
6. Ver los clips en la web, descargarlos en MP4 y compartirlos con los jugadores con un enlace.
7. «Mi selección»: marcar clips con una estrella y sacar un vídeo solo con esos para la charla.
8. «Ritmo del partido»: gráfico de quién tiene el balón a lo largo del partido, en total y por partes.
9. Importar el partido pegando un enlace de Veo (solo después de revisar sus condiciones de uso).
10. Altas con email y planes (gratuito, Scout y Pro), con el pago al principio como maqueta.

## Cómo funciona

```
Navegador del entrenador
  ├─ elige el MP4 → metadatos al instante (Mediabunny, sin subir nada)
  ├─ lo sube a R2 en partes de 50 MiB, tres a la vez, reanudable
  ├─ a la vez lo analiza en un worker: silbato en el audio y
  │  movimiento de la imagen → tramos de balón parado
  ├─ editor: corrige, une, parte y ajusta; cada cambio se guarda solo
  ├─ «Quién ataca»: el detector (RF-DETR Nano) en otro worker, con WebGPU si
  │  hay → quién tiene el balón → color de su camiseta → equipo de cada fragmento
  │  (con la pista marcada: el balón en metros → balones fuera y toques)
  └─ descarga en MP4 sin recodificar, leyendo de R2 solo el clip
Worker de Cloudflare: la página, la API y la limpieza de cada hora
R2 (UE): vídeos y jugadas   D1: partidos, enlaces y cuentas
Jugadores: /v/<token> → las jugadas, para verlas y descargarlas, sin cuenta
```

- **El análisis corre en el navegador** mientras se sube el vídeo, que ya está ahí: un Worker no
  puede decodificar vídeo, y así no cuesta servidor. Cuando haga falta analizar sin el navegador
  abierto (o importar desde Veo), irá a Cloudflare Containers con el mismo código (fase 6).
- **El corte es virtual.** Un fragmento es solo `[desde, hasta)` sobre el vídeo original: verlo es
  saltar a ese instante y corregirlo es cambiar dos números. Solo se genera un fichero cuando
  alguien descarga, y se hace sin recodificar: copiando los bytes de ese tramo y rehaciendo el
  índice. El clip empieza justo donde empieza el fragmento: se copia desde el fotograma clave
  anterior y una lista de edición le dice al reproductor que se salte ese trozo. Al final puede
  llevar uno o dos fotogramas de más.
- **La selección también es virtual.** Una estrella es un campo más del fragmento. El vídeo de
  la selección se hace al descargarlo, en el navegador de quien lo pide: se copian los paquetes
  de cada jugada, una detrás de otra. Sin recodificar, cada jugada empieza en su fotograma
  clave, hasta un GOP antes de lo marcado (en vídeos de cámara o de móvil, uno o dos segundos):
  la lista de edición que lo esconde en un recorte suelto solo vale al principio del fichero.
- **Dónde va cada cosa.** D1 lleva la lista de partidos y lo que hace falta para reanudar una
  subida. En R2 van el vídeo, las jugadas de cada partido (partes, fragmentos y cada corrección,
  en un JSON) y las señales del análisis. Las jugadas no van en D1 porque con muchas correcciones
  pueden pasar de los 2 MB que admite una fila; las señales, en bruto, sirven para recalcular los
  fragmentos con otros umbrales sin volver a leer el vídeo.
- **Quién entra.** Cada entrenador entra con su email: pide un código, le llega por correo
  (Cloudflare Email Service) y con él abre una sesión de 30 días, en una cookie que JavaScript no
  puede leer. No hay contraseñas, y en D1 solo se guardan los hashes de los códigos y de las
  sesiones. Un código vale 10 minutos y 5 intentos, y se puede pedir uno por minuto. Si la web va
  detrás de Cloudflare Access, también vale el email de Access: el Worker verifica el JWT que
  manda en cada petición. Cada entrenador ve solo sus partidos. Con dos pestañas abiertas, la que
  se ha quedado atrás no puede pisar lo corregido en la otra.
- **Los planes** los comprueba el Worker con las mismas funciones que usa la página para
  enseñarlos (`src/comun/planes.ts`). Un partido que no cabe no se crea (402, con el motivo);
  para bajar de plan, lo guardado tiene que caber en el nuevo, y no se borra nada para hacer
  sitio. Los días de cada partido cuentan desde que se subió o desde el último cambio de plan, lo
  que sea después: quien baja de plan tiene los días del nuevo para bajarse lo que quiera
  guardar. Cada hora, un cron borra lo que se ha pasado (el vídeo, las jugadas y los enlaces) y
  las sesiones caducadas, de 10 partidos en 10 para no pasar del tope de subpeticiones del plan
  gratuito de Workers.
- **Los jugadores** no tienen cuenta: el enlace lleva un token de 128 bits al azar, que no se
  puede adivinar, y es lo único que abre la página. Todo lo suyo va bajo `/v/` (la página, su API
  y los estáticos), que es lo único que queda fuera de Access. Ven el partido y las jugadas, y
  nada más: ni el email del entrenador, ni el fichero, ni las correcciones.
- **Quién ataca.** De los jugadores que ve el detector, el que tiene los pies más cerca del balón
  (medido en alturas de jugador, sin calibrar la pista) es el que lo lleva, y el color de su
  camiseta vota por su equipo. Los colores se agrupan solos en dos; el entrenador solo dice cuál
  es el del local. Nunca se mira en qué mitad está el balón: en sala, con presión alta y salidas
  de balón, eso no dice quién ataca. Un fragmento lleva equipo si al menos el 65 % de sus votos
  (y dos como mínimo) coinciden; si no, se queda sin equipo para que lo revises. Si dentro de un
  fragmento la posesión cambia y dura al menos 3 s, se puede partir ahí.
- **Con la pista marcada** (solo vale con la cámara fija), el balón y los jugadores pasan a metros.
  Sale el balón cuando pasa la línea más de 0,3 m viniendo de dentro, y el saque es el balón
  quieto en la línea que arranca a más de 3 m/s. Si el saque no se ve, esa salida no se quita:
  mejor dejar balón parado dentro que cortar juego. Los toques son que el balón cambie de
  dirección o de velocidad junto a un jugador; cada instante vota por el equipo del último que lo
  tocó en ese fragmento, así que un pase que roza a un rival no le da el balón.
- **El detector** lo trae el Worker de Hugging Face, así que la página no habla con nadie más
  (la CSP solo deja conectar con el propio origen). El navegador comprueba su tamaño y su SHA-256
  y lo guarda en su caché.
- La detección del balón parado y la de los equipos parten de las de
  [futsal-tracking](https://github.com/Ganosete/futsal-tracking) (ver más abajo).

## Arrancar

Hace falta Node 22.

```bash
npm install
npm run bd:local   # crea las tablas en la base de datos local (.wrangler/state)
npm run dev        # http://localhost:5173, con el Worker en workerd
```

En local no hace falta entrar: eres «entrenador@localhost», y D1 y R2 son locales. Para ver la
pantalla de entrar, pulsa «Salir»: como en local no hay correo, el código sale en la propia
página.
«Quién ataca» necesita internet la primera vez, para traer el detector de Hugging Face. Las
pruebas no lo usan: llevan uno de juguete con la misma entrada y las mismas salidas
(`tests/fixtures/detector_prueba.onnx`, de `tools/crear_modelo_prueba.py`), que siempre ve dos
jugadores y el balón a los pies de uno.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo: la página y el Worker juntos. |
| `npm test` | Pruebas unitarias (Vitest): la lógica en Node y la API dentro de workerd, con D1 y R2 locales. |
| `npm run test:e2e` | Pruebas de la página (Playwright) contra la compilación de producción. La primera vez: `npx playwright install chromium`. |
| `npm run typecheck` | Genera los tipos del Worker y comprueba los del cliente, el Worker y las pruebas. |
| `npm run build` | Comprueba tipos y compila en `dist/`. |
| `npm run preview` | Sirve `dist/` con el Worker en workerd, como en producción. |
| `npm run bd:local` | Aplica las migraciones de `migrations/` a la base de datos local. |
| `npm run bd:remota` | Las aplica a la de producción. |
| `npm run deploy` | Compila, migra la base de datos y publica con wrangler (hace falta `npx wrangler login`). |
| `npm run videos:prueba` | Regenera los vídeos de prueba de `tests/fixtures/` (hace falta ffmpeg). |

## Desplegar en Cloudflare

Un solo Worker sirve la página (estáticos) y la API. **`main` es producción.**

**1. R2.** Actívalo en el panel (*R2 Object Storage*) y crea el bucket en la jurisdicción de la
UE (son vídeos de jugadores, a menudo menores). Sin el bucket, el despliegue falla.

```bash
npx wrangler r2 bucket create futsal-scout-videos --jurisdiction eu
```

**2. D1.** La base de datos `futsal-scout` ya existe y su id está en `wrangler.jsonc`. Sus tablas
las crea `npm run bd:remota`, que va en el comando de despliegue.

**3. Workers Builds**, conectado al repositorio, despliega cada push:

1. En el panel de Cloudflare: *Workers & Pages* → *Create* → *Import a repository* y elige este
   repositorio.
2. Nombre del Worker: `futsal-scout` (tiene que coincidir con `name` en `wrangler.jsonc`).
3. *Build command*: `npm run build`. *Deploy command*: `npm run bd:remota && npx wrangler deploy`.
   Directorio raíz: `/`.
4. Rama de producción: `main`. Activa los *builds* de las demás ramas: cada una publica una
   versión de vista previa con su propia URL. Las vistas previas usan **la misma D1 y el mismo
   R2 que producción**: su comando de despliegue no debe migrar nada.

No hace falta ninguna variable de compilación: la versión de Node sale de `.node-version`.
`/api/salud` dice qué commit está publicado.

El cron de la limpieza (`triggers` en `wrangler.jsonc`) lo da de alta el propio `wrangler deploy`.

**4. Altas por email (Cloudflare Email Service).** Hasta tenerlo, fuera de localhost nadie puede
pedir un código: la página enseña la pantalla de entrar y dice que las altas aún no están activas.
Para mandar códigos a cualquier dirección hace falta:

1. El **plan de pago de Workers**: Email Sending está en beta pública y, en el gratuito, solo manda
   a las direcciones verificadas de la cuenta.
2. Un **dominio con el DNS en Cloudflare**. En *Compute* → *Email Service* → *Email Sending* →
   *Onboard Domain*, elígelo: Cloudflare añade los registros SPF, DKIM y DMARC.
3. En `wrangler.jsonc`, el binding y el remitente, que tiene que ser de ese dominio:

   ```jsonc
   "send_email": [{ "name": "EMAIL" }],
   "vars": { "CORREO_REMITENTE": "entrar@tu-dominio.es", ... }
   ```

4. Haz push.

**5. Cloudflare Access (opcional)**, para dejar entrar sin Email Service o para cerrar la web a
unos pocos emails. Quien entra por Access no ve «Salir»: salir es cosa de Access.

1. *Workers & Pages* → `futsal-scout` → *Settings* → *Domains & Routes*: en `workers.dev` y en
   *Preview URLs*, *Enable Cloudflare Access*. En *Manage Cloudflare Access*, deja solo los
   emails que pueden entrar.
2. Copia en `vars` de `wrangler.jsonc` el dominio del equipo (`ACCESS_EQUIPO`:
   `<equipo>.cloudflareaccess.com`) y la etiqueta AUD de cada aplicación (`ACCESS_AUD`, separadas
   por comas: `workers.dev` y las vistas previas son aplicaciones distintas). Está en *Zero Trust*
   → *Access controls* → *Applications* → *Edit* → *Additional settings* → *Application Audience
   (AUD) Tag*. No son secretos.
3. Deja fuera de Access lo de los jugadores, que entran sin cuenta: *Zero Trust* → *Access
   controls* → *Applications* → *Create new application* → *Self-hosted*; como destino,
   `futsal-scout.<subdominio>.workers.dev` con la ruta `v/*`, y una política *Bypass* para
   *Everyone*. Una aplicación con ruta manda sobre la de todo el Worker.
4. Haz push.

**Límites del plan gratuito de Workers:** cuerpos de hasta 100 MB (las partes de la subida son de
50 MiB), 100.000 peticiones al día (un partido de 4 GB son unas 80) y 10 ms de CPU por petición,
que no alcanzan para guardar las jugadas de un partido muy corregido; el plan de pago los quita.

## Hoja de ruta

| Fase | Contenido | Puntos |
|---|---|---|
| **0. Base** ✅ | Repositorio, estructura, TypeScript, Vitest, Playwright, CI, despliegue y formulario de subida que valida el vídeo en el navegador | — |
| **1. MVP** | ✅ análisis en el navegador (silbato + movimiento + calmas largas) y límites de cada parte · ✅ editor: equipo con un clic, unir, partir, ajustar inicio y fin, quitar, deshacer · ✅ descarga en MP4 sin recodificar · ✅ subida reanudable a R2 mientras se analiza, partidos en D1, Cloudflare Access, «Mis partidos» y guardado automático · ✅ enlace para jugadores · medida con 2-3 partidos reales | 1, 2, 4, 6 |
| **2. Equipos y partes** | ✅ detector en el navegador · ✅ colores de cada equipo (se agrupan solos; el entrenador dice cuál es el local) · ✅ posesión por fragmento, sin usar la mitad del campo · ✅ partir por posesión · ✅ filtros por equipo y parte · medida con partidos reales | 3, 5 |
| **3. Mejor detección** | ✅ balón fuera con la cámara fija y la pista marcada · ✅ posesión por toques · detector afinado para el balón de sala: los scripts y la app listos, faltan datos y una GPU · medida con partidos reales | 2, 3 |
| **4. Selección y ritmo** ✅ | Estrellas y filtro de «Mi selección» · vídeo de la selección, unido sin recodificar en el navegador · gráfico del ritmo del partido, también para los jugadores | 7, 8 |
| **5. Usuarios y planes** ✅ | Entrar con el email (código, sin contraseñas) · planes Gratuito, Scout y Pro con límites de partidos, almacenamiento y días · «Mi cuenta» con lo que se usa · cambio de plan con el pago en maqueta · limpieza de cada hora | 10 |
| **6. Procesado en servidor** | Cloudflare Containers: análisis sin el navegador abierto, versión ligera a 720p para los jugadores | — |
| **7. Importar desde Veo** | Solo tras revisar sus condiciones de uso | 9 |

**Lo que se espera de la detección, sin adornar:** las faltas, los goles, los tiempos muertos y el
descanso llevan silbato o una calma larga y se cortarán bien. Muchas bandas y córners se sacan sin
silbato: esos fragmentos saldrán con unos segundos de balón parado dentro y se parten con una
tecla. Cada corrección se guarda para medir el detector con partidos reales y ajustar sus umbrales.

**Y de «Quién ataca»:** no había vídeos de sala a mano, así que se probó con 3 imágenes de fútbol
de un conjunto público (`martinjolif/football-player-detection`). El detector vio 60 de las 66
personas anotadas y el balón en 1 de las 3 imágenes: el balón es lo que más falla, y sin balón no
hay voto. Las camisetas se agruparon bien (blanca y verde lima, con los colores muy separados),
pero el reparto salió desigual, 44 muestras de la blanca y 15 de la verde lima, porque quitar el
color del suelo también se come parte de una camiseta verde sobre el césped. En sala el balón
sale más grande y el suelo rara vez es del color de una camiseta, pero hasta medirlo con partidos
de verdad no hay cifra.

**Y de lo que necesita la pista marcada:** el balón fuera y los toques se han probado con
trayectorias hechas a mano, a los mismos 3 fotogramas por segundo de la detección. La salida se ve
en el primer fotograma pasado el margen y el saque con un fotograma de error como mucho. Con
partidos de verdad dependerá de que el detector vea el balón cerca de las líneas y en los saques,
que es justo lo que peor hace. A 3 fotogramas los toques de primeras se escapan; los controles y
los golpeos con el balón parado se ven bien.

## Detector afinado para el balón de sala

El de serie es el de COCO, que ve bien a los jugadores y mal el balón de sala: pequeño, rápido y
movido. Afinarlo es lo que más mejoraría «Quién ataca», el balón fuera y los toques. Los scripts
están en `tools/`, copiados de futsal-tracking, pero hacen falta dos cosas que aquí no hay:

- **Unas 2.000 imágenes anotadas** de partidos de sala parecidos a los tuyos (cámara alta, pista
  entera), con cajas de jugador y de balón. Con menos de 500 sale peor que el de COCO. En Hugging
  Face no hay ningún conjunto de sala que sirva; en Roboflow Universe sí hay alguno, pero cada uno
  tiene su licencia y no todas dejan usarlo así.
- **Una GPU** (Colab vale) para entrenar unas horas.

Con eso:

```bash
python tools/preparar_dataset_futsal.py --entrada datasets/a datasets/b --salida datasets/futsal
python tools/afinar_rfdetr_futsal.py --dataset datasets/futsal --epocas 30
```

El ONNX que sale se sube a Hugging Face y se cambia `DETECTOR` en `src/comun/modelos.ts`: origen,
tamaño, SHA-256, versión, entrada y clases (`fondo`, `jugador` y `balon`). La app no necesita más
cambios. Antes de dejarlo, se mide contra el de COCO con partidos de verdad.

## Relación con futsal-tracking

[futsal-tracking](https://github.com/Ganosete/futsal-tracking) analiza partidos en el navegador
(seguimiento, calibración, eventos). De ahí se **copian**, sin tocar aquel repositorio, los
módulos de balón parado de su rama `solo-eventos` (`src/balonParado/`: silbato, movimiento,
tramos, fusión de señales y balón fuera), y de su `main` la huella de un fichero
(`src/store/huella.ts`), el detector (preproceso, posproceso de RF-DETR y sesión de onnxruntime,
de `src/infer/`), el descriptor de color de camiseta con su k-medias (`src/team/`), la homografía
y las cuatro esquinas de la pista (`src/calib/`, `src/court/`), el Kalman del balón y su
trayectoria (`src/ball/`), los toques (`src/events/posesion.ts`) y los scripts para afinar el
detector (`tools/`), con sus pruebas. Cada fichero copiado lleva en la cabecera de dónde viene y
qué se ha cambiado. Se sigue copiando, sin paquete compartido: esas partes apenas cambian, y un
paquete obligaría a tocar futsal-tracking y a dar credenciales de GitHub al build de Cloudflare.

No se copian su clasificador de equipos, que vota por cada pista del seguimiento (aquí se vota
por fragmento, sin seguir a nadie), su lector de vídeo (lee el MP4 de principio a fin y no vale
para partidos de varios gigas con el índice al final), su exportación de vídeo (graba en tiempo
real con `MediaRecorder`) ni su seguimiento por jugador, sus métricas y su calibración por
fotogramas clave, que son otro producto.

## Estructura

```
src/cliente/     Navegador (DOM a pelo, sin framework):
  subida/          formulario, metadatos, validación, huella y subidor por partes
  analisis/        worker que lee audio e imagen
  partido/         «Subir y analizar», «Mis partidos», la sección «Jugadas» y «Compartir»
  cuenta/          la pantalla de entrar, la cabecera y «Mi cuenta» (medidores y planes)
  equipos/         «Quién ataca»: descarga del detector, worker que detecta, la pregunta del color
                   y los balones fuera
  pista/           marcar las cuatro esquinas de la pista sobre el vídeo
  ritmo/           el gráfico del ritmo del partido (SVG), en el editor y en la de los jugadores
  jugadores/       la página de los jugadores (jugadores.html, en /v/<token>)
  editor/          editor de fragmentos: operaciones puras, historial, guardado, vídeo, línea y lista
  descarga/        recorte a MP4 y unión de la selección, sin recodificar, y nombre del fichero
  api/             llamadas a la API
src/servidor/    Worker: enrutador mínimo y API
  acceso/          quién llama (la identidad de localhost y el JWT de Access) y de qué web viene
  cuentas/         entrar con el email: códigos, sesiones, el correo y la cuenta con su plan
  partidos/        partidos en D1, subida multiparte a R2, vídeo por rangos y jugadas
  compartir/       enlaces de los jugadores y lo que ven con ellos
  limpieza.ts      el cron de cada hora: sesiones caducadas y partidos que pasan su plan
src/comun/       Tipos y funciones puras que usan los dos lados (formatos, validación, filtros,
                 ritmo del partido, planes y cuenta)
src/nucleo/      Detección, en TypeScript puro y sin DOM (parte copiada de futsal-tracking):
  balonParado/     silbato, movimiento, tramos de balón parado y balón fuera
  deteccion/       preproceso y posproceso de RF-DETR
  equipos/         color de camiseta, los dos grupos, la posesión y los toques
  pista/           homografía, las cuatro esquinas y las medidas de la pista
  balon/           el balón en metros: Kalman y trayectoria
migrations/      Esquema de D1
tests/           Pruebas unitarias (Vitest, en Node), del Worker (tests/servidor, en workerd) y vídeos
e2e/             Pruebas de la página (Playwright)
tools/           Scripts que no forman parte de la aplicación: vídeos y detector de prueba, y
                 preparar y afinar el detector
```

## Licencias de terceros

- [Mediabunny](https://github.com/Vanilagy/mediabunny) (lectura y recorte de vídeo): MPL-2.0. Se
  usa tal cual, sin modificar.
- [onnxruntime-web](https://github.com/microsoft/onnxruntime) (ejecuta el detector en el
  navegador): MIT.
- El detector, RF-DETR Nano: pesos de Roboflow con licencia Apache 2.0, convertidos a ONNX por
  PierreMarieCurie (MIT). No va en el repositorio: el Worker lo trae de Hugging Face.
