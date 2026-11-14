// onnxruntime-node no esta en package.json: pesa 300 MB y solo hace falta en la
// imagen del contenedor, que lo instala (contenedor/Dockerfile). Su API es la de
// onnxruntime-common de la misma version, que si esta (y la prueba de la imagen
// comprueba que coinciden).
declare module 'onnxruntime-node' {
  export * from 'onnxruntime-common';
}
