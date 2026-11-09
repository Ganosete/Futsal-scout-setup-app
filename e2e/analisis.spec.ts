import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const fixture = (nombre: string): string => fileURLToPath(new URL(`../tests/fixtures/${nombre}`, import.meta.url));

/** Elige el video, lanza el analisis y devuelve los fragmentos [desde, hasta] en segundos. */
async function analizar(page: Page, nombre: string): Promise<[number, number][]> {
  await page.goto('/');
  await page.setInputFiles('#entrada-video', fixture(nombre));
  await page.getByRole('button', { name: 'Buscar las jugadas' }).click();
  await expect(page.locator('#resultado-analisis')).toBeVisible({ timeout: 60_000 });
  return page
    .locator('#lista-fragmentos .fragmento')
    .evaluateAll((filas) => filas.map((f) => [Number((f as HTMLElement).dataset.desde), Number((f as HTMLElement).dataset.hasta)]));
}

function cerca(real: number, esperado: number, tolerancia = 0.5): void {
  expect(Math.abs(real - esperado), `${real} debería estar a menos de ${tolerancia} s de ${esperado}`).toBeLessThanOrEqual(tolerancia);
}

test('silbato a los 20 s e imagen quieta hasta los 30 s: dos fragmentos', async ({ page }) => {
  const f = await analizar(page, 'analisis.mp4');
  expect(f).toHaveLength(2);
  cerca(f[0][0], 0);
  cerca(f[0][1], 20);
  cerca(f[1][0], 30);
  cerca(f[1][1], 60);
  await expect(page.locator('#resumen-analisis')).toContainText('2 fragmentos de juego');
  await expect(page.locator('#estado-analisis')).toContainText('Hecho en');
});

test('un recorte con lista de edición: el silbato cae donde lo enseña el vídeo', async ({ page }) => {
  // Recortado desde 5,5 s: el silbato pasa de 20 s a 14,5 s y la calma acaba en 24,5 s.
  // Si se ignorase la lista de edición, todo caería 1,5 s más tarde.
  const f = await analizar(page, 'recortado.mp4');
  expect(f).toHaveLength(2);
  cerca(f[0][1], 14.5);
  cerca(f[1][0], 24.5);
  cerca(f[1][1], 54.5);
});

test('sin sonido avisa de que se ha buscado sin el silbato', async ({ page }) => {
  await analizar(page, 'sin_audio.mp4');
  await expect(page.locator('#estado-analisis')).toContainText('se ha buscado sin el silbato');
});

test('se puede parar y volver a empezar', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#entrada-video', fixture('analisis.mp4'));
  await page.getByRole('button', { name: 'Buscar las jugadas' }).click();
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(page.locator('#estado-analisis')).toHaveText('Análisis parado.');
  await expect(page.getByRole('button', { name: 'Buscar las jugadas' })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar las jugadas' }).click();
  await expect(page.locator('#resultado-analisis')).toBeVisible({ timeout: 60_000 });
});

test('la sección de jugadas no sale con un vídeo que no se puede usar', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#entrada-video', fixture('prores.mov'));
  await expect(page.locator('.problema-error')).toHaveCount(1);
  await expect(page.locator('#bloque-analisis')).toBeHidden();
});
