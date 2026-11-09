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

ls -l "$DESTINO"
