# Futsal Scout

Scout automático de fútbol sala para entrenadores y scouters. Subes el vídeo del partido y la
aplicación lo corta en jugadas: quita los ratos de balón parado (bandas, córners, faltas,
saques de portería, tiempos muertos, descanso), te deja corregir con un clic lo que falle y
compartir los clips con tus jugadores.

> **Nombre provisional.** El repositorio y la interfaz dicen «Futsal Scout» hasta que se decida
> la marca; cambiarlo es una línea en `index.html`.

## Estado

**Fase 1 (MVP) en curso.** Lo que hay:

1. **Nuevo partido:** eliges el vídeo y se comprueba al momento (duración, imagen, sonido,
   tamaño, y si hay algo que impida usarlo o que vaya a salir peor).
2. **Subir y analizar:** el vídeo se sube por partes mientras el navegador escucha el silbato y
   mide el movimiento de la imagen para cortar el partido en fragmentos de juego. Propone el
   descanso si lo encuentra. Si la subida se corta, al elegir el mismo vídeo sigue donde se quedó.
3. **Revisar:** un editor con el vídeo, la línea de tiempo y la lista de fragmentos. Equipo con
   un clic, unir, partir, ajustar inicio y fin, quitar, marcar las partes, y deshacer, todo con
   atajos de teclado. Cada cambio se guarda solo.
4. **Mis partidos:** lo subido, para volver a abrirlo (el vídeo se ve desde el servidor) o
   borrarlo.
5. **Descargar en MP4** cualquier fragmento, sin recodificar y con un nombre que dice partido,
   fecha, jugada y minuto.

Falta el enlace para los jugadores y medir el detector con partidos reales.

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
  └─ descarga en MP4 sin recodificar, leyendo de R2 solo el clip
Worker de Cloudflare: la página y la API   R2 (UE): vídeos y jugadas   D1: partidos
Jugadores: un enlace con los clips, sin cuenta                    (pendiente)
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
- **Dónde va cada cosa.** D1 lleva la lista de partidos y lo que hace falta para reanudar una
  subida. En R2 van el vídeo, las jugadas de cada partido (partes, fragmentos y cada corrección,
  en un JSON) y las señales del análisis. Las jugadas no van en D1 porque con muchas correcciones
  pueden pasar de los 2 MB que admite una fila; las señales, en bruto, sirven para recalcular los
  fragmentos con otros umbrales sin volver a leer el vídeo.
- **Quién entra.** La web va detrás de Cloudflare Access (código por email) y el Worker verifica
  el JWT que manda Access en cada petición. Cada entrenador ve solo sus partidos. Con dos
  pestañas abiertas, la que se ha quedado atrás no puede pisar lo corregido en la otra.
- La detección del balón parado parte de la de
  [futsal-tracking](https://github.com/Ganosete/futsal-tracking) (ver más abajo).

## Arrancar

Hace falta Node 22.

```bash
npm install
npm run bd:local   # crea las tablas en la base de datos local (.wrangler/state)
npm run dev        # http://localhost:5173, con el Worker en workerd
```

En local no hay Cloudflare Access: entras como «entrenador@localhost», y D1 y R2 son locales.

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

**4. Cloudflare Access**, después del primer despliegue. Hasta entonces la API responde 503 fuera
de localhost: la página busca las jugadas, pero no sube ni guarda nada.

1. *Workers & Pages* → `futsal-scout` → *Settings* → *Domains & Routes*: en `workers.dev` y en
   *Preview URLs*, *Enable Cloudflare Access*. En *Manage Cloudflare Access*, deja solo los
   emails que pueden entrar.
2. Copia en `vars` de `wrangler.jsonc` el dominio del equipo (`ACCESS_EQUIPO`:
   `<equipo>.cloudflareaccess.com`) y la etiqueta AUD de cada aplicación (`ACCESS_AUD`, separadas
   por comas: `workers.dev` y las vistas previas son aplicaciones distintas). Está en *Zero Trust*
   → *Access controls* → *Applications* → *Edit* → *Additional settings* → *Application Audience
   (AUD) Tag*. No son secretos.
3. Haz push.

**Límites del plan gratuito de Workers:** cuerpos de hasta 100 MB (las partes de la subida son de
50 MiB), 100.000 peticiones al día (un partido de 4 GB son unas 80) y 10 ms de CPU por petición,
que no alcanzan para guardar las jugadas de un partido muy corregido; el plan de pago los quita.

## Hoja de ruta

| Fase | Contenido | Puntos |
|---|---|---|
| **0. Base** ✅ | Repositorio, estructura, TypeScript, Vitest, Playwright, CI, despliegue y formulario de subida que valida el vídeo en el navegador | — |
| **1. MVP** | ✅ análisis en el navegador (silbato + movimiento + calmas largas) y límites de cada parte · ✅ editor: equipo con un clic, unir, partir, ajustar inicio y fin, quitar, deshacer · ✅ descarga en MP4 sin recodificar · ✅ subida reanudable a R2 mientras se analiza, partidos en D1, Cloudflare Access, «Mis partidos» y guardado automático · enlace para jugadores · medida con 2-3 partidos reales | 1, 2, 4, 6 |
| **2. Equipos y partes** | Colores de cada equipo, detector en el navegador, posesión por fragmento (sin usar la mitad del campo), partir por posesión, filtros por equipo y parte | 3, 5 |
| **3. Mejor detección** | Balón fuera con cámara fija calibrada, posesión por contacto, detector afinado para el balón de sala | 2, 3 |
| **4. Selección y ritmo** | Estrellas y vídeo de la selección (unido sin recodificar), gráfico del ritmo del partido | 7, 8 |
| **5. Usuarios y planes** | Altas por email, planes gratuito, Scout y Pro con límites, pago en maqueta | 10 |
| **6. Procesado en servidor** | Cloudflare Containers: análisis sin el navegador abierto, versión ligera a 720p para los jugadores | — |
| **7. Importar desde Veo** | Solo tras revisar sus condiciones de uso | 9 |

**Lo que se espera de la detección, sin adornar:** las faltas, los goles, los tiempos muertos y el
descanso llevan silbato o una calma larga y se cortarán bien. Muchas bandas y córners se sacan sin
silbato: esos fragmentos saldrán con unos segundos de balón parado dentro y se parten con una
tecla. Cada corrección se guarda para medir el detector con partidos reales y ajustar sus umbrales.

## Relación con futsal-tracking

[futsal-tracking](https://github.com/Ganosete/futsal-tracking) analiza partidos en el navegador
(seguimiento, calibración, eventos). De ahí se **copian**, sin tocar aquel repositorio, los
módulos de balón parado de su rama `solo-eventos` (`src/balonParado/`: silbato, movimiento,
tramos y fusión de señales) y la huella de un fichero de su `main` (`src/store/huella.ts`), con sus
pruebas, y más adelante el detector y la clasificación por color de camiseta. Cada fichero copiado lleva en la cabecera de dónde viene y qué se ha cambiado.

No se copian su lector de vídeo (lee el MP4 de principio a fin y no vale para partidos de varios
gigas con el índice al final), su exportación de vídeo (graba en tiempo real con `MediaRecorder`)
ni su seguimiento por jugador, sus métricas y su calibración por fotogramas clave, que son otro
producto.

## Estructura

```
src/cliente/     Navegador (DOM a pelo, sin framework):
  subida/          formulario, metadatos, validación, huella y subidor por partes
  analisis/        worker que lee audio e imagen
  partido/         «Subir y analizar», «Mis partidos» y la sección «Jugadas»
  editor/          editor de fragmentos: operaciones puras, historial, guardado, vídeo, línea y lista
  descarga/        recorte a MP4 sin recodificar y nombre del fichero
  api/             llamadas a la API
src/servidor/    Worker: enrutador mínimo y API
  acceso/          quién llama (JWT de Cloudflare Access) y de qué web viene
  partidos/        partidos en D1, subida multiparte a R2, vídeo por rangos y jugadas
src/comun/       Tipos y funciones puras que usan los dos lados
src/nucleo/      Detección del balón parado: TypeScript puro, sin DOM (parte copiada de futsal-tracking)
migrations/      Esquema de D1
tests/           Pruebas unitarias (Vitest, en Node), del Worker (tests/servidor, en workerd) y vídeos
e2e/             Pruebas de la página (Playwright)
tools/           Scripts que no forman parte de la aplicación
```

## Licencias de terceros

- [Mediabunny](https://github.com/Vanilagy/mediabunny) (lectura y recorte de vídeo): MPL-2.0. Se
  usa tal cual, sin modificar.
- El detector que llegará en la fase 2 (RF-DETR) es Apache 2.0.
