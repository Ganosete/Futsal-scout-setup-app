import type { Page } from '@playwright/test';
import { abrirComoJugador, esperarGuardado, esperarSubida, expect, subirYAnalizar, test } from './ayuda';

// «Mi selección»: estrellas en los fragmentos para la charla. analisis.mp4 da
// dos fragmentos, [0, 19,98) y [30, 60).

const conEstrella = (page: Page): Promise<boolean[]> =>
  page.locator('#lista-fragmentos .fragmento').evaluateAll((li) => li.map((x) => (x as HTMLElement).dataset.estrella !== undefined));

/** Los atajos van al documento; con el foco en un botón, Intro y Espacio son del botón. */
async function pulsar(page: Page, tecla: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(tecla);
}

test.beforeEach(async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
});

test('la estrella se pone desde la fila o con S, filtra la lista y se deshace', async ({ page }) => {
  // Sin estrellas no hay filtro de la seleccion.
  await expect(page.getByRole('button', { name: 'Ver solo mi selección' })).toHaveCount(0);

  await page.locator('#lista-fragmentos .fragmento').nth(1).getByRole('button', { name: 'En mi selección' }).click();
  expect(await conEstrella(page)).toEqual([false, true]);
  await expect(page.locator('#estado-editor')).toHaveText('Fragmento 2: en tu selección.');
  // La barra dice lo del fragmento elegido, que ahora es el segundo.
  await expect(page.locator('#barra-editor').getByRole('button', { name: 'En mi selección' })).toHaveAttribute('aria-pressed', 'true');

  await pulsar(page, 'ArrowUp');
  await pulsar(page, 's');
  expect(await conEstrella(page)).toEqual([true, true]);
  await pulsar(page, 's');
  expect(await conEstrella(page)).toEqual([false, true]);
  await expect(page.locator('#estado-editor')).toHaveText('Fragmento 1: fuera de tu selección.');

  await page.getByRole('button', { name: 'Ver solo mi selección' }).click();
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(1);
  await expect(page.locator('#filtros-editor .filtros-cuenta')).toHaveText('Se ven 1 de 2.');

  // Deshacer quita la ultima estrella que queda: sin seleccion, el filtro se va y se ven todos.
  await pulsar(page, 'Control+z');
  await pulsar(page, 'Control+z');
  await pulsar(page, 'Control+z');
  expect(await conEstrella(page)).toEqual([false, false]);
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ver solo mi selección' })).toHaveCount(0);
});

test('la selección se guarda y los jugadores la ven y la filtran', async ({ page, browser }) => {
  await page.locator('#lista-fragmentos .fragmento').nth(1).getByRole('button', { name: 'En mi selección' }).click();
  await esperarGuardado(page);
  await page.reload();
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(2, { timeout: 20_000 });
  expect(await conEstrella(page)).toEqual([false, true]);

  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const url = await page.locator('#lista-enlaces .enlace-url').inputValue();
  const { pagina, errores } = await abrirComoJugador(browser, url);
  await expect(pagina.locator('#bloque-jugadas')).toBeVisible({ timeout: 20_000 });
  const jugadas = pagina.locator('#lista-jugadas .jugada');
  await expect(jugadas.nth(1).locator('.jugada-estrella')).toHaveText('★');
  await expect(jugadas.nth(1).getByRole('button')).toHaveAccessibleName(/en la selección del entrenador$/);
  await pagina.getByRole('button', { name: 'Ver solo la selección del entrenador' }).click();
  await expect(jugadas).toHaveCount(1);
  await expect(jugadas.locator('.fragmento-numero')).toHaveText('2');
  expect(errores).toEqual([]);
});
