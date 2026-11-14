import { describe, expect, it } from 'vitest';
import {
  aMuestras,
  argumentosEquipos,
  argumentosPasada,
  BYTES_FOTOGRAMA,
  leerSondeo,
  planEquipos,
  segundosDeProgreso,
  separarImagenes,
  Troceador,
  type PlanEquipos,
} from '../../src/contenedor/ffmpeg';

describe('leerSondeo', () => {
  it('la duracion del formato y la frecuencia del primer audio', () => {
    const s = leerSondeo({
      format: { duration: '60.000000' },
      streams: [
        { codec_type: 'video', duration: '59.96', width: 1920, height: 1080, sample_aspect_ratio: '1:1' },
        { codec_type: 'audio', sample_rate: '22050' },
      ],
    });
    expect(s).toEqual({ duracion: 60, imagen: { ancho: 1920, alto: 1080 }, audio: { frecuencia: 22050 } });
  });

  const VIDEO = { codec_type: 'video', width: 640, height: 360 };
  const imagen = (video: Record<string, unknown>) => leerSondeo({ format: { duration: '3' }, streams: [{ ...VIDEO, ...video }] }).imagen;

  it('sin audio, audio null; una caratula no cuenta como imagen', () => {
    expect(leerSondeo({ format: { duration: '3' }, streams: [VIDEO] })).toEqual({ duracion: 3, imagen: { ancho: 640, alto: 360 }, audio: null });
    expect(() => leerSondeo({ format: { duration: '3' }, streams: [{ ...VIDEO, disposition: { attached_pic: 1 } }] })).toThrow('El vídeo no tiene imagen.');
  });

  it('sin duracion no se puede medir el avance ni las senales; sin tamano, buscar quien ataca', () => {
    expect(() => leerSondeo({ format: {}, streams: [VIDEO] })).toThrow('No se sabe cuánto dura el vídeo.');
    expect(() => imagen({ width: undefined })).toThrow('No se sabe qué tamaño tiene la imagen del vídeo.');
  });

  it('con rotacion de un cuarto de vuelta se ve en vertical: la matriz de ffmpeg 5 o la etiqueta de antes', () => {
    expect(imagen({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: 90 }] })).toEqual({ ancho: 360, alto: 640 });
    expect(imagen({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] })).toEqual({ ancho: 360, alto: 640 });
    expect(imagen({ tags: { rotate: '270' } })).toEqual({ ancho: 360, alto: 640 });
    expect(imagen({ side_data_list: [{ rotation: 180 }] })).toEqual({ ancho: 640, alto: 360 });
  });

  it('con pixeles que no son cuadrados se agranda el lado que haga falta', () => {
    // PAL panoramico: 720 x 576 con pixeles de 16:11 se ve a 1047 x 576.
    expect(imagen({ width: 720, height: 576, sample_aspect_ratio: '16:11' })).toEqual({ ancho: 1047, alto: 576 });
    // 720 x 480 con pixeles de 8:9 (mas altos que anchos): 480 x 9 / 8 = 540.
    expect(imagen({ width: 720, height: 480, sample_aspect_ratio: '8:9' })).toEqual({ ancho: 720, alto: 540 });
    // 0:1 es que no se sabe: se toman cuadrados.
    expect(imagen({ sample_aspect_ratio: '0:1' })).toEqual({ ancho: 640, alto: 360 });
  });
});

describe('argumentosPasada', () => {
  it('el audio va al descriptor 3, la imagen al 4 y el progreso a la salida estandar', () => {
    const a = argumentosPasada('http://almacen.interno/video', { audio: true, ligero: null });
    expect(a.slice(a.indexOf('-progress'), a.indexOf('-progress') + 2)).toEqual(['-progress', 'pipe:1']);
    expect(a).toContain('pipe:3');
    expect(a).toContain('aresample=async=1:first_pts=0');
    expect(a).toContain('fps=5,scale=96:54:flags=bilinear,format=rgba');
    expect(a.at(-1)).toBe('pipe:4');
  });

  it('sin audio que escuchar no se pide; con version ligera, va al final con su destino', () => {
    const a = argumentosPasada('entrada.mp4', { audio: false, ligero: '/tmp/ligero.mp4' });
    expect(a).not.toContain('pipe:3');
    expect(a.slice(-2)).toEqual(['-y', '/tmp/ligero.mp4']);
    expect(a).toContain('+faststart');
    // El audio de la version ligera es opcional: un video sin sonido tambien la tiene.
    expect(a).toContain('0:a:0?');
  });

  it('un fotograma de 96 x 54 en RGBA son 20.736 bytes', () => {
    expect(BYTES_FOTOGRAMA).toBe(20_736);
  });
});

describe('segundosDeProgreso', () => {
  it('lee out_time_us y no hace caso de lo demas', () => {
    expect(segundosDeProgreso('out_time_us=12345678')).toBe(12.345678);
    expect(segundosDeProgreso('out_time_us=N/A')).toBeNull();
    expect(segundosDeProgreso('progress=continue')).toBeNull();
  });
});

describe('Troceador', () => {
  it('junta registros partidos entre trozos y guarda el resto', () => {
    const t = new Troceador(4);
    const registros = [...t.meter(new Uint8Array([1, 2, 3])), ...t.meter(new Uint8Array([4, 5, 6, 7, 8, 9]))];
    expect(registros.map((r) => [...r])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect([...t.resto()]).toEqual([9]);
  });

  it('cada registro es una copia: el siguiente no lo pisa', () => {
    const t = new Troceador(2);
    const [a, b] = [...t.meter(new Uint8Array([1, 2, 3, 4]))];
    expect([...a]).toEqual([1, 2]);
    expect([...b]).toEqual([3, 4]);
  });
});

describe('aMuestras', () => {
  it('de PCM f32 little-endian a muestras; lo que no llega a una muestra se descarta', () => {
    const bytes = new Uint8Array(new Float32Array([0.5, -1]).buffer);
    const conSobra = new Uint8Array([...bytes, 0, 0]);
    expect([...aMuestras(conSobra)]).toEqual([0.5, -1]);
  });
});

describe('los fotogramas para buscar quien ataca', () => {
  it('la imagen del color arriba y el cuadrado del detector debajo, con el ancho del mayor', () => {
    // 1920 x 1080: el color a 960 x 540, el detector de 384 x 384 y 960 de ancho: 960 x 924 x 4 bytes.
    expect(planEquipos({ ancho: 1920, alto: 1080 }, 384)).toEqual({ color: { ancho: 960, alto: 540, escala: 0.5 }, lado: 384, ancho: 960, bytes: 3_548_160 });
    // Un video de 192 x 108 no se agranda: el ancho lo pone el detector, 384 x (108 + 384) x 4.
    expect(planEquipos({ ancho: 192, alto: 108 }, 384)).toMatchObject({ color: { ancho: 192, alto: 108, escala: 1 }, ancho: 384, bytes: 755_712 });
  });

  it('se salta al inicio del fragmento y se leen los fotogramas que tocan, por la salida estandar', () => {
    const a = argumentosEquipos('http://almacen.interno/video', 30, 90, planEquipos({ ancho: 1920, alto: 1080 }, 384));
    // -ss delante de -i: se salta en la entrada, sin decodificar lo de antes del fotograma clave.
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'));
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2)).toEqual(['-ss', '30.000']);
    expect(a.slice(a.indexOf('-frames:v'), a.indexOf('-frames:v') + 2)).toEqual(['-frames:v', '90']);
    const grafo = a[a.indexOf('-filter_complex') + 1];
    expect(grafo).toBe(
      '[0:v]fps=3:start_time=0:round=up,split=2[a][b];' +
        '[a]scale=960:540:flags=bilinear,format=rgba,pad=960:540[c];' +
        '[b]scale=384:384:flags=bilinear,format=rgba,pad=960:384[m];' +
        '[c][m]vstack=inputs=2[v]',
    );
    expect(a.slice(-3)).toEqual(['-f', 'rawvideo', 'pipe:1']);
  });

  it('separa las dos imagenes de una apilada, sin lo que se relleno', () => {
    // Color de 3 x 2 y detector de 2 x 2, en 3 de ancho: cada pixel lleva su numero en sus cuatro bytes.
    const plan: PlanEquipos = { color: { ancho: 3, alto: 2, escala: 1 }, lado: 2, ancho: 3, bytes: 48 };
    const apilada = Uint8Array.from({ length: 48 }, (_, i) => Math.floor(i / 4));
    const { color, detector } = separarImagenes(apilada, plan);
    const pixeles = (b: ArrayLike<number>) => Array.from({ length: b.length / 4 }, (_, i) => b[i * 4]);
    expect([color.width, color.height]).toEqual([3, 2]);
    expect(pixeles(color.data)).toEqual([0, 1, 2, 3, 4, 5]);
    // Las filas del detector son los pixeles 6-7 y 9-10: el 8 y el 11 son relleno.
    expect(pixeles(detector)).toEqual([6, 7, 9, 10]);
  });
});
