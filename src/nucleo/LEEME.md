# Núcleo de la detección

Aquí llega en la fase 1 la detección del balón parado: el silbato en el audio, el movimiento de
la imagen y la fusión de las dos señales en tramos de balón parado, de los que salen los
fragmentos de juego.

Es **TypeScript puro**: sin DOM y sin APIs del Worker. Tiene que poder correr en un worker del
navegador (el MVP analiza mientras se sube el vídeo) y en Node (fase 6, en Cloudflare
Containers), y probarse con Vitest sin navegador.

Sale de `src/balonParado/` de la rama `solo-eventos` de
[futsal-tracking](https://github.com/Ganosete/futsal-tracking). Cada fichero copiado dice en su
cabecera de dónde viene y qué se ha cambiado (ver `CLAUDE.md`).
