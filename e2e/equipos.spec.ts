import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { EQUIPOS, esperarGuardado, esperarSubida, expect, fixture, subirYAnalizar, test } from './ayuda';

// «Quién ataca» con el detector de juguete (tools/crear_modelo_prueba.py): la
// misma firma que RF-DETR Nano, y siempre dos jugadores con el balon a los pies
// del de la izquierda. El de verdad (108 MB) no se baja en las pruebas: se
// sustituyen el manifiesto y el fichero.
const MODELO = readFileSync(fixture('detector_prueba.onnx'));

async function conDetectorDePrueba(page: Page): Promise<void> {
  await page.route('**/api/modelos/detector', (r) =>
    r.fulfill({
      json: { url: '/api/modelos/prueba/1/detector_prueba.onnx', tamano: MODELO.length, sha256: createHash('sha256').update(MODELO).digest('hex'), entrada: 384 },
    }),
  );
  await page.route('**/api/modelos/prueba/1/detector_prueba.onnx', (r) => r.fulfill({ body: MODELO, contentType: 'application/octet-stream' }));
}

const equipos = (page: Page): Promise<string[]> =>
  page.locator('#lista-fragmentos .fragmento').evaluateAll((li) => li.map((x) => (x as HTMLElement).dataset.equipo ?? ''));

test('buscar quién ataca y decir qué camiseta es la del local pone los equipos', async ({ page }) => {
  await conDetectorDePrueba(page);
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  await page.getByRole('button', { name: 'Buscar quién ataca' }).click();
  await expect(page.locator('#pregunta-equipos')).toHaveText(`¿Qué camiseta lleva ${EQUIPOS.local}?`, { timeout: 60_000 });
  await expect(page.locator('#estado-equipos')).toContainText('Búsqueda hecha');

  // El balon siempre esta con el mismo jugador: un color se lleva todos los fragmentos.
  await page.locator('.boton-color').first().click();
  const primero = await equipos(page);
  expect(primero).toHaveLength(2);
  expect(new Set(primero).size).toBe(1);
  expect(['local', 'visitante']).toContain(primero[0]);
  await expect(page.locator('#estado-equipos')).toHaveText('Equipos puestos: 2 fragmentos con equipo y ninguno sin decidir.');

  // Con la otra camiseta, al reves.
  await page.locator('.boton-color').nth(1).click();
  const segundo = await equipos(page);
  expect(segundo).toEqual(primero.map((e) => (e === 'local' ? 'visitante' : 'local')));

  // Se guarda y se deshace como cualquier correccion.
  await esperarGuardado(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  expect(await equipos(page)).toEqual(primero);
});

test('lo puesto a mano no lo toca el detector, y al volver otro día basta con contestar', async ({ page }) => {
  await conDetectorDePrueba(page);
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  // El segundo fragmento lo pone el entrenador.
  await page.locator('#lista-fragmentos .fragmento').nth(1).getByRole('button', { name: `Ataca ${EQUIPOS.visitante}` }).click();
  await esperarGuardado(page);
  await page.getByRole('button', { name: 'Buscar quién ataca' }).click();
  await expect(page.locator('.boton-color').first()).toBeVisible({ timeout: 60_000 });
  await page.locator('.boton-color').first().click();
  await page.locator('.boton-color').nth(1).click();
  expect((await equipos(page))[1]).toBe('visitante');
  await esperarGuardado(page);

  // Otro dia: las detecciones estan en el servidor y solo falta la pregunta.
  await page.reload();
  await expect(page.locator('#pregunta-equipos')).toHaveText(`¿Qué camiseta lleva ${EQUIPOS.local}?`, { timeout: 20_000 });
  await expect(page.locator('#estado-equipos')).toHaveText('Ya se buscó quién ataca en este partido: contesta la pregunta para poner los equipos.');
});
