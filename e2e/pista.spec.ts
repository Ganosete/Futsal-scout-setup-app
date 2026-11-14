import type { Page } from '@playwright/test';
import { esperarGuardado, esperarSubida, expect, marcarPista, subirYAnalizar, test, type PuntoImagen } from './ayuda';

// La pista marcada con cuatro clics sobre el video del editor: se ordenan
// solas, se guardan con la edicion y se deshacen como lo demas.

/** Las esquinas de una pista vista de lado, en el orden en que se pulsan (cualquiera vale). */
const CLICS: PuntoImagen[] = [
  { x: 0.25, y: 0.3 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
  { x: 0.75, y: 0.3 },
];

async function edicionGuardada(page: Page): Promise<{ pista: { esquinas: PuntoImagen[]; medidas: { largo: number; ancho: number } } | null }> {
  const id = new URL(page.url()).hash.replace('#partido=', '');
  return page.evaluate(async (partido) => (await fetch(`/api/partidos/${partido}/edicion`)).json(), id);
}

test.beforeEach(async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
});

test('cuatro clics en cualquier orden marcan la pista, que se guarda y sigue al volver', async ({ page }) => {
  await marcarPista(page, CLICS);
  await expect(page.locator('#estado-editor')).toHaveText('Pista marcada.');
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 40 × 20 m');
  await expect(page.locator('.capa-pista .pista-contorno')).toHaveCount(1);

  await esperarGuardado(page);
  const { pista } = await edicionGuardada(page);
  // Ordenadas: la banda cercana (abajo) de izquierda a derecha, y luego la de enfrente de derecha a izquierda.
  const esperadas = [CLICS[2], CLICS[1], CLICS[3], CLICS[0]];
  expect(pista?.medidas).toEqual({ largo: 40, ancho: 20 });
  pista?.esquinas.forEach((p, i) => {
    expect(p.x).toBeCloseTo(esperadas[i].x, 2);
    expect(p.y).toBeCloseTo(esperadas[i].y, 2);
  });

  await page.reload();
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 40 × 20 m', { timeout: 20_000 });
});

test('las medidas se cambian y la pista se quita o se deshace', async ({ page }) => {
  await marcarPista(page, CLICS);
  await page.locator('#largo-pista').fill('38');
  await page.locator('#largo-pista').press('Tab');
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 38 × 20 m');
  await expect(page.locator('#estado-editor')).toHaveText('Pista de 38 × 20 m.');

  // Ctrl+Z deshace las medidas, y otra vez la pista entera.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 40 × 20 m');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#resumen-pista')).toHaveText('');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 40 × 20 m');

  await page.getByRole('button', { name: 'Quitar la pista marcada' }).click();
  await expect(page.locator('#resumen-pista')).toHaveText('');
  await esperarGuardado(page);
  expect((await edicionGuardada(page)).pista).toBeNull();
});

test('un área mal marcada lo dice y deja marcar otra vez', async ({ page }) => {
  // La cuarta esquina cae dentro del triangulo de las otras tres.
  await marcarPista(page, [CLICS[0], CLICS[2], CLICS[3], { x: 0.35, y: 0.45 }]);
  await expect(page.locator('#estado-pista')).toContainText('no es convexa');
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  const capa = page.locator('.capa-pista');
  const caja = await capa.boundingBox();
  if (!caja) throw new Error('La capa de la pista no se ve');
  for (const p of CLICS) await capa.click({ position: { x: p.x * caja.width, y: p.y * caja.height } });
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 40 × 20 m');
});
