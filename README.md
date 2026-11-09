# Futsal Scout

Scout automático de fútbol sala para entrenadores y scouters. Subes el vídeo del partido y la
aplicación lo corta en jugadas: quita los ratos de balón parado (bandas, córners, faltas,
saques de portería, tiempos muertos, descanso), te deja corregir con un clic lo que falle y
compartir los clips con tus jugadores.

> **Nombre provisional.** El repositorio y la interfaz dicen «Futsal Scout» hasta que se decida
> la marca; cambiarlo es una línea en `index.html`.

## Estado

**Fase 1 (MVP) en curso.** Todo lo que hay funciona en el navegador, sin subir nada todavía:

1. **Nuevo partido:** eliges el vídeo y se comprueba al momento (duración, imagen, sonido,
   tamaño, y si hay algo que impida usarlo o que vaya a salir peor).
2. **Buscar las jugadas:** el navegador escucha el silbato y mide el movimiento de la imagen, y
   corta el partido en fragmentos de juego. Propone el descanso si lo encuentra.
3. **Revisar:** un editor con el vídeo, la línea de tiempo y la lista de fragmentos. Equipo con
   un clic, unir, partir, ajustar inicio y fin, quitar, marcar las partes, y deshacer, todo con
   atajos de teclado.

Falta la subida a R2 (las correcciones se pierden al recargar la página), la descarga en MP4 y
el enlace para los jugadores.

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
  ├─ lo sube a R2 por partes, reanudable                         (fase 1)
  ├─ a la vez lo analiza en un worker: silbato en el audio y
  │  movimiento de la imagen → tramos de balón parado            (fase 1)
  ├─ editor: corrige, une, parte y ajusta los fragmentos         (fase 1)
  └─ descarga en MP4 sin recodificar, leyendo de R2 solo el clip (fase 1)
Worker de Cloudflare: la página y la API      R2: vídeos (UE)   D1: datos
Jugadores: un enlace con los clips, sin cuenta                   (fase 1)
```

- **El análisis corre en el navegador** mientras se sube el vídeo, que ya está ahí: un Worker no
  puede decodificar vídeo, y así no cuesta servidor. Cuando haga falta analizar sin el navegador
  abierto (o importar desde Veo), irá a Cloudflare Containers con el mismo código (fase 6).
- **El corte es virtual.** Un fragmento es solo `[desde, hasta)` sobre el vídeo original: verlo es
  saltar a ese instante y corregirlo es cambiar dos números. Solo se genera un fichero cuando
  alguien descarga, y se hace sin recodificar: copiando los bytes de ese tramo y rehaciendo el
  índice. El clip empieza en el fotograma clave anterior, normalmente 1-2 s antes.
- La detección del balón parado parte de la de
  [futsal-tracking](https://github.com/Ganosete/futsal-tracking) (ver más abajo).

## Arrancar

Hace falta Node 22.

```bash
npm install
npm run dev        # http://localhost:5173, con el Worker en workerd
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo: la página y el Worker juntos. |
| `npm test` | Pruebas unitarias (Vitest, en Node). |
| `npm run test:e2e` | Pruebas de la página (Playwright) contra la compilación de producción. La primera vez: `npx playwright install chromium`. |
| `npm run typecheck` | Genera los tipos del Worker y comprueba los del cliente, el Worker y las pruebas. |
| `npm run build` | Comprueba tipos y compila en `dist/`. |
| `npm run preview` | Sirve `dist/` con el Worker en workerd, como en producción. |
| `npm run deploy` | Compila y publica con wrangler (hace falta `npx wrangler login`). |
| `npm run videos:prueba` | Regenera los vídeos de prueba de `tests/fixtures/` (hace falta ffmpeg). |

## Desplegar en Cloudflare

Un solo Worker sirve la página (estáticos) y la API. **`main` es producción.**

Con **Workers Builds**, conectado al repositorio, cada push se despliega solo:

1. En el panel de Cloudflare: *Workers & Pages* → *Create* → *Import a repository* y elige este
   repositorio.
2. Nombre del Worker: `futsal-scout` (tiene que coincidir con `name` en `wrangler.jsonc`).
3. *Build command*: `npm run build`. *Deploy command*: `npx wrangler deploy`. Directorio raíz: `/`.
4. Rama de producción: `main`. Activa los *builds* de las demás ramas: cada una publica una
   versión de vista previa con su propia URL, sin tocar producción.

No hace falta ninguna variable: la versión de Node sale de `.node-version`. `/api/salud` dice qué
commit está publicado.

**Antes de la fase 1** habrá que crear el bucket de vídeos (en la UE) y la base de datos, y
proteger la web con Cloudflare Access. Los comandos irán aquí cuando lleguen.

## Hoja de ruta

| Fase | Contenido | Puntos |
|---|---|---|
| **0. Base** ✅ | Repositorio, estructura, TypeScript, Vitest, Playwright, CI, despliegue y formulario de subida que valida el vídeo en el navegador | — |
| **1. MVP** | ✅ análisis en el navegador (silbato + movimiento + calmas largas) y límites de cada parte · ✅ editor: equipo con un clic, unir, partir, ajustar inicio y fin, quitar, deshacer · subida reanudable a R2 y partidos en D1, con Cloudflare Access (el análisis correrá mientras sube) · descarga en MP4 sin recodificar y enlace para jugadores · medida con 2-3 partidos reales | 1, 2, 4, 6 |
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
tramos y fusión de señales) y sus pruebas, y más adelante el detector y la clasificación por color
de camiseta. Cada fichero copiado lleva en la cabecera de dónde viene y qué se ha cambiado.

No se copian su lector de vídeo (lee el MP4 de principio a fin y no vale para partidos de varios
gigas con el índice al final), su exportación de vídeo (graba en tiempo real con `MediaRecorder`)
ni su seguimiento por jugador, sus métricas y su calibración por fotogramas clave, que son otro
producto.

## Estructura

```
src/cliente/     Navegador (DOM a pelo, sin framework):
  subida/          formulario, lectura de metadatos y validación
  analisis/        worker que lee audio e imagen, y la sección «Jugadas»
  editor/          editor de fragmentos: operaciones puras, historial, vídeo, línea y lista
src/servidor/    Worker: enrutador mínimo y API
src/comun/       Tipos y funciones puras que usan los dos lados
src/nucleo/      Detección del balón parado: TypeScript puro, sin DOM (parte copiada de futsal-tracking)
tests/           Pruebas unitarias (Vitest) y vídeos de prueba
e2e/             Pruebas de la página (Playwright)
tools/           Scripts que no forman parte de la aplicación
```

## Licencias de terceros

- [Mediabunny](https://github.com/Vanilagy/mediabunny) (lectura y recorte de vídeo): MPL-2.0. Se
  usa tal cual, sin modificar.
- El detector que llegará en la fase 2 (RF-DETR) es Apache 2.0.
