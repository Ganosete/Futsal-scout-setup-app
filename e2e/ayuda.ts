import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';

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
