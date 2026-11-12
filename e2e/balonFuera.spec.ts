import type { Page } from '@playwright/test';
import { esperarGuardado, esperarSubida, expect, filas, subirYAnalizar, test } from './ayuda';

// El balon fuera con la pista marcada. Las detecciones se sirven hechas a mano
// (el detector de juguete siempre ve lo mismo): el balon va hacia una banda
// dentro del segundo fragmento, [30, 60), sale, se coloca quieto en la linea y
// se saca.
//
// analisis.mp4 mide 192 x 108. Con las esquinas al 10 % y al 90 % la pista se
// ve desde arriba: el metro (x, y) cae en el pixel (19,2 + 3,84 x, 97,2 - 4,32 y).
const caja = (x: number, y: number) => ({ x: 19.2 + 3.84 * x - 1, y: 97.2 - 4.32 * y - 1, w: 2, h: 2 });

function tramo(t0: number, t1: number, a: [number, number], b: [number, number]) {
  const n = Math.round((t1 - t0) * 3);
  return Array.from({ length: n }, (_, i) => ({
    segundos: Math.round((t0 + i / 3) * 1000) / 1000,
    balon: caja(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n),
    personas: [],
  }));
}

const REGISTROS = [
  ...tramo(30, 40, [20, 10], [20, 18]),
  // Fuera a 4 m/s: pasa la linea de banda a los 40,5 s. Hasta los 44 s no se ve.
  ...tramo(40, 41, [20, 18], [20, 22]),
  // Quieto en la linea y sacado a los 46 s, a 8 m/s (un saque tiene que pasar de 3 m/s), y se sigue jugando.
  ...tramo(44, 46, [25, 20], [25, 20]),
  ...tramo(46, 47, [25, 20], [25, 12]),
  ...tramo(47, 52, [25, 12], [10, 8]),
];

const ESQUINAS = [
  { x: 0.1, y: 0.9 },
  { x: 0.9, y: 0.9 },
  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.1 },
];

async function marcarPista(page: Page): Promise<void> {
  await page.getByText('La pista, si la cámara no se mueve').click();
  await page.getByRole('button', { name: 'Marcar las esquinas' }).click();
  const capa = page.locator('.capa-pista');
  const c = await capa.boundingBox();
  if (!c) throw new Error('La capa de la pista no se ve');
  for (const p of ESQUINAS) await capa.click({ position: { x: p.x * c.width, y: p.y * c.height } });
  await expect(page.locator('#resumen-pista')).toHaveText('· marcada, 40 × 20 m');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/partidos/*/detecciones', (r) =>
    r.request().method() === 'GET' ? r.fulfill({ json: { version: 1, registros: REGISTROS } }) : r.continue(),
  );
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
});

test('sin la pista marcada no se buscan balones fuera', async ({ page }) => {
  await expect(page.locator('#estado-equipos')).toContainText('No se han visto bastantes jugadores');
  await expect(page.locator('#fuera-equipos')).toBeHidden();
});

test('con la pista marcada, se ve la salida y se quita de la salida al saque', async ({ page }) => {
  await marcarPista(page);
  await expect(page.locator('#texto-fuera')).toHaveText(/^Se ha visto salir el balón una vez dentro de los fragmentos: \d s de balón parado\.$/);
  await page.getByRole('button', { name: 'Quitar los balones fuera' }).click();

  const f = await filas(page);
  expect(f).toHaveLength(3);
  // A 3 fotogramas por segundo: la salida se ve en el primero pasado el margen de 0,3 m
  // (40,575 s, asi que el de 40,667) y el saque, con no mas de un fotograma de error.
  expect(f[1].desde).toBe(30);
  expect(f[1].hasta).toBeGreaterThanOrEqual(40.5);
  expect(f[1].hasta).toBeLessThanOrEqual(40.9);
  expect(f[2].desde).toBeGreaterThanOrEqual(46 - 1 / 3);
  expect(f[2].desde).toBeLessThanOrEqual(46 + 1 / 3);
  expect(f[2].hasta).toBe(60);
  await expect(page.locator('#texto-fuera')).toHaveText('Los balones fuera que se han visto ya no están en los fragmentos.');
  await expect(page.getByRole('button', { name: 'Quitar los balones fuera' })).toBeHidden();

  // Se deshace como lo demas, y la cuenta vuelve.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  expect(await filas(page)).toHaveLength(2);
  await expect(page.getByRole('button', { name: 'Quitar los balones fuera' })).toBeVisible();
});
