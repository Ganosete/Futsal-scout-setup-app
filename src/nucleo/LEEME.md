# Núcleo de la detección

La detección del balón parado y los fragmentos de juego que salen de ella:

| Fichero | Qué hace | De dónde viene |
|---|---|---|
| `balonParado/pitidos.ts`, `fft.ts` | El silbato en el audio | futsal-tracking |
| `balonParado/movimiento.ts` | La actividad de la imagen y la reanudación tras un pitido | futsal-tracking |
| `balonParado/tramos.ts`, `fusion.ts`, `porBalon.ts` | Juntar señales y tramos | futsal-tracking |
| `balonParado/calmaLarga.ts` | Balón parado sin silbato (descanso, tiempo muerto) | nuevo |
| `partes.ts` | El descanso propuesto | nuevo |
| `fragmentos.ts` | Lo jugable de cada parte | nuevo |
| `analizar.ts` | De las señales al resultado | nuevo |

Es **TypeScript puro**: sin DOM y sin APIs del Worker (`tsconfig.nucleo.json` lo comprueba).
Corre en un worker del navegador y tiene que poder correr en Node (fase 6, en Cloudflare
Containers), y se prueba con Vitest sin navegador.

Lo copiado sale de `src/balonParado/` de la rama `solo-eventos` de
[futsal-tracking](https://github.com/Ganosete/futsal-tracking), commit `dfe28e3`. Cada fichero
copiado dice en su cabecera de dónde viene y qué se ha cambiado (ver `CLAUDE.md`).
