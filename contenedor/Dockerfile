# El contenedor del procesado en el servidor (fase 6): Node con ffmpeg y el
# programa de src/contenedor, que `npm run build` deja compilado en
# dist/contenedor/principal.mjs antes de que wrangler construya la imagen.
#
# La imagen de Node sale de mirror.gcr.io, la copia de Google de las oficiales
# de Docker Hub: Docker Hub limita las descargas sin cuenta y un build compartido
# llega pronto al limite. Va fijada por digest: una etiqueta se puede mover.
FROM mirror.gcr.io/library/node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY dist/contenedor/principal.mjs ./principal.mjs

# Sin root: el programa solo escribe en /tmp (la version ligera mientras se sube).
USER node
EXPOSE 8080
CMD ["node", "principal.mjs"]
