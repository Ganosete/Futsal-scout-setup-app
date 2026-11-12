import { fileURLToPath } from 'node:url';
import { test as base, expect, type Browser, type Page } from '@playwright/test';

/**
 * Lo comun de las pruebas de la pagina. Cada prueba entra con su propio
 * dueno (la cookie de pruebas, que solo cuenta en localhost): asi sus
 * partidos no se mezclan con los de las demas, que van en paralelo.
 */
export const test = base.extend({
  context: async ({ context, baseURL }, usar) => {
    const nombre = `e2e-${crypto.randomUUID().slice(0, 13)}`;
    await context.addCookies([{ name: 'futsal-scout-local', value: nombre, url: baseURL ?? 'http://localhost' }]);
    await usar(context);
  },
});

export { expect };

export const fixture = (nombre: string): string => fileURLToPath(new URL(`../tests/fixtures/${nombre}`, import.meta.url));

export const EQUIPOS = { local: 'Atlético Benavente', visitante: 'Peñíscola' };

/** Elige el video, rellena los equipos y pulsa «Subir y analizar», sin esperar a nada. */
export async function empezar(page: Page, video: string, equipos = EQUIPOS): Promise<void> {
  if (!page.url().startsWith('http')) await page.goto('/');
  await page.setInputFiles('#entrada-video', fixture(video));
  await page.getByLabel('Equipo local').fill(equipos.local);
  await page.getByLabel('Equipo visitante').fill(equipos.visitante);
  await page.getByRole('button', { name: 'Subir y analizar' }).click();
}

/** Lo mismo, y espera a que el editor salga con las jugadas. */
export async function subirYAnalizar(page: Page, video: string, equipos = EQUIPOS): Promise<void> {
  await empezar(page, video, equipos);
  await expect(page.locator('#resultado-analisis')).toBeVisible({ timeout: 60_000 });
}

/** Espera a que lo corregido este en el servidor. */
export async function esperarGuardado(page: Page): Promise<void> {
  await expect(page.locator('#estado-guardado')).toHaveText('Cambios guardados.', { timeout: 20_000 });
}

/** Espera a que el video este entero en el servidor: hasta entonces, recargar la pagina pregunta. */
export async function esperarSubida(page: Page): Promise<void> {
  await expect(page.locator('#estado-subida-partido')).toHaveText(/Vídeo subido\.|Este vídeo ya estaba subido\./, { timeout: 30_000 });
}

export interface Fila {
  desde: number;
  hasta: number;
  equipo: string;
}

/** Las filas que se ven en la lista del editor, con sus segundos y su equipo. */
export async function filas(page: Page): Promise<Fila[]> {
  return page.locator('#lista-fragmentos .fragmento').evaluateAll((li) =>
    li.map((x) => {
      const d = (x as HTMLElement).dataset;
      return { desde: Number(d.desde), hasta: Number(d.hasta), equipo: d.equipo ?? '' };
    }),
  );
}

/** Lleva el vídeo del editor a `t` y espera a que haya llegado. */
export async function buscar(page: Page, t: number): Promise<void> {
  await page.locator('#video-editor').evaluate(async (v: HTMLVideoElement, segundos) => {
    await new Promise<void>((listo) => {
      v.addEventListener('seeked', () => listo(), { once: true });
      v.currentTime = segundos;
    });
  }, t);
}

/** Un jugador: un navegador nuevo, sin la cookie del entrenador. */
export async function abrirComoJugador(browser: Browser, url: string): Promise<{ pagina: Page; errores: string[] }> {
  const contexto = await browser.newContext({ locale: 'es-ES' });
  const pagina = await contexto.newPage();
  const errores: string[] = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  pagina.on('pageerror', (e) => errores.push(e.message));
  await pagina.goto(url);
  return { pagina, errores };
}

export interface PuntoImagen {
  x: number;
  y: number;
}

/** Abre «La pista» si hace falta y pulsa las cuatro esquinas, normalizadas sobre el fotograma. */
export async function marcarPista(page: Page, clics: PuntoImagen[]): Promise<void> {
  if (!(await page.locator('#pista-equipos').evaluate((d: HTMLDetailsElement) => d.open))) {
    await page.getByText('La pista, si la cámara no se mueve').click();
  }
  await page.getByRole('button', { name: /^Marcar (las esquinas|otra vez)$/ }).click();
  const capa = page.locator('.capa-pista');
  await expect(capa).toBeVisible();
  const caja = await capa.boundingBox();
  if (!caja) throw new Error('La capa de la pista no se ve');
  for (const p of clics) await capa.click({ position: { x: p.x * caja.width, y: p.y * caja.height } });
}
