# El contenedor del procesado en el servidor (fase 6): Node con ffmpeg, el
# onnxruntime nativo y el programa de src/contenedor, que `npm run build` deja
# compilado en dist/contenedor/principal.mjs antes de que wrangler construya la imagen.
#
# La imagen de Node sale de mirror.gcr.io, la copia de Google de las oficiales
# de Docker Hub: Docker Hub limita las descargas sin cuenta y un build compartido
# llega pronto al limite. Va fijada por digest: una etiqueta se puede mover.
FROM mirror.gcr.io/library/node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# El detector de «Quién ataca» con onnxruntime nativo, de la misma version que el
# onnxruntime-web de la pagina (lo comprueba tests/contenedor/imagen.test.ts). Sin
# los binarios de CUDA, que sin tarjeta grafica no sirven y son 300 MB, ni los de
# otros sistemas: Cloudflare Containers es linux/amd64. Antes que el programa, para
# que esta capa no se rehaga cada vez que cambia.
RUN ONNXRUNTIME_NODE_INSTALL=skip npm install --no-save --no-package-lock --no-audit --no-fund onnxruntime-node@1.31.1 \
 && rm -rf node_modules/onnxruntime-node/bin/napi-v6/darwin node_modules/onnxruntime-node/bin/napi-v6/win32 \
      node_modules/onnxruntime-node/bin/napi-v6/linux/arm64 \
 && npm cache clean --force

COPY dist/contenedor/principal.mjs ./principal.mjs

# Sin root: el programa solo escribe en /tmp (la version ligera mientras se sube).
USER node
EXPOSE 8080
CMD ["node", "principal.mjs"]
