#!/usr/bin/env bash
# Genera los videos de prueba de tests/fixtures/ con ffmpeg.
#
# Se versionan los ficheros generados (son pequenos) para que las pruebas no
# dependan de tener ffmpeg instalado; este script solo hace falta para
# regenerarlos. Cada uno cubre un caso que la validacion tiene que distinguir.
#
# Uso: npm run videos:prueba
set -euo pipefail

DESTINO="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures"
mkdir -p "$DESTINO"

# Sin metadatos ni cadenas de version: asi regenerarlos con el mismo ffmpeg
# da los mismos bytes y el diff de git no se llena de ruido.
COMUN=(-hide_banner -loglevel error -y)
SALIDA=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact)

# Imagen en movimiento a 25 fps, como la de una camara.
imagen() { echo "testsrc2=size=$1:rate=25:duration=$2"; }

# Silencio con un pitido de 4 kHz entre 1,0 y 1,5 s: el silbato que la fase 1
# tendra que encontrar.
SILBATO="aevalsrc=0.5*sin(2*PI*4000*t)*between(t\,1\,1.5):s=48000:d=3"

H264=(-c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -g 25)
AAC=(-c:a aac -b:a 64k)

# 1. El caso normal: H.264 + AAC, con el indice (moov) al principio.
ffmpeg "${COMUN[@]}" -f lavfi -i "$(imagen 640x360 3)" -f lavfi -i "$SILBATO" \
  "${H264[@]}" "${AAC[@]}" -shortest -movflags +faststart "${SALIDA[@]}" "$DESTINO/partido_corto.mp4"

# 2. Igual, pero con el moov al final, como sale de una camara o de un movil.
ffmpeg "${COMUN[@]}" -f lavfi -i "$(imagen 640x360 3)" -f lavfi -i "$SILBATO" \
  "${H264[@]}" "${AAC[@]}" -shortest "${SALIDA[@]}" "$DESTINO/moov_al_final.mp4"

# 3. Sin pista de audio: no se podra buscar el silbato.
ffmpeg "${COMUN[@]}" -f lavfi -i "$(imagen 640x360 3)" \
  "${H264[@]}" -an -movflags +faststart "${SALIDA[@]}" "$DESTINO/sin_audio.mp4"

# 4. HEVC, que algunos navegadores de los jugadores no reproducen.
ffmpeg "${COMUN[@]}" -f lavfi -i "$(imagen 640x360 3)" -f lavfi -i "$SILBATO" \
  -c:v libx265 -preset ultrafast -crf 34 -pix_fmt yuv420p -tag:v hvc1 -x265-params log-level=error \
  "${AAC[@]}" -shortest -movflags +faststart "${SALIDA[@]}" "$DESTINO/hevc.mp4"

# 5. Grabado en vertical.
ffmpeg "${COMUN[@]}" -f lavfi -i "$(imagen 360x640 3)" -f lavfi -i "$SILBATO" \
  "${H264[@]}" "${AAC[@]}" -shortest -movflags +faststart "${SALIDA[@]}" "$DESTINO/vertical.mp4"

# 5b. Vertical como lo graba un movil: la imagen va en horizontal y una
# rotacion de 90 grados en los metadatos dice como ensenarla.
ffmpeg "${COMUN[@]}" -display_rotation 90 -i "$DESTINO/partido_corto.mp4" \
  -c copy -movflags +faststart "${SALIDA[@]}" "$DESTINO/rotado.mp4"

# 6. ProRes en MOV: un codec que no se admite (hay que exportarlo a H.264).
ffmpeg "${COMUN[@]}" -f lavfi -i "$(imagen 320x180 1)" \
  -c:v prores_ks -profile:v 0 -an "${SALIDA[@]}" "$DESTINO/prores.mov"

# 7. Un minuto para el analisis: juego hasta 20 s, silbato de 20,0 a 20,5 s, la
# imagen quieta hasta 30 s (balon parado) y juego otra vez hasta el final. Lo
# esperado: un tramo parado de 20 a 30 s y dos fragmentos, [0, 20) y [30, 60).
# testsrc en vez de testsrc2: tambien se mueve y pesa la cuarta parte.
# Sin cortes de escena forzados: la imagen quieta no debe meter fotogramas clave.
IMAGEN_ANALISIS="testsrc=size=192x108:rate=25:duration=60"
SILBATO_ANALISIS="aevalsrc=0.5*sin(2*PI*4000*t)*between(t\,20\,20.5):s=48000:d=60"
# Audio a 22 kHz: el silbato (4 kHz) se sigue oyendo entero.
AAC_ANALISIS=(-c:a aac -b:a 24k -ar 22050)
# freezeframes congela con un fotograma de su segunda entrada: aqui, el mismo video.
QUIETA=(-filter_complex "[0:v]split[a][b];[a][b]freezeframes=first=500:last=749:replace=499[v]" -map "[v]" -map 1:a)
ffmpeg "${COMUN[@]}" -f lavfi -i "$IMAGEN_ANALISIS" -f lavfi -i "$SILBATO_ANALISIS" "${QUIETA[@]}" \
  -c:v libx264 -preset veryfast -crf 42 -pix_fmt yuv420p -g 25 -sc_threshold 0 "${AAC_ANALISIS[@]}" \
  -shortest -movflags +faststart "${SALIDA[@]}" "$DESTINO/analisis.mp4"

# 8. El mismo minuto recortado desde 5,5 s sin recodificar, con fotogramas clave
# cada 4 s: el corte empieza en el clave de 4 s y una lista de edicion manda
# saltarse 1,5 s. Es el caso que en futsal-tracking desfasaba lo decodificado
# respecto a lo reproducido. En el tiempo del <video>, el silbato cae en 14,5 s.
TEMPORAL="$(mktemp -d)"
ffmpeg "${COMUN[@]}" -f lavfi -i "$IMAGEN_ANALISIS" -f lavfi -i "$SILBATO_ANALISIS" "${QUIETA[@]}" \
  -c:v libx264 -preset veryfast -crf 42 -pix_fmt yuv420p -g 100 -keyint_min 100 -sc_threshold 0 "${AAC_ANALISIS[@]}" \
  -shortest "${SALIDA[@]}" "$TEMPORAL/gop4.mp4"
ffmpeg "${COMUN[@]}" -ss 5.5 -i "$TEMPORAL/gop4.mp4" -c copy -movflags +faststart "${SALIDA[@]}" "$DESTINO/recortado.mp4"
rm -rf "$TEMPORAL"

ls -l "$DESTINO"
