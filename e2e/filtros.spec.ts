import type { Page } from '@playwright/test';
import { abrirComoJugador, buscar, EQUIPOS, esperarGuardado, esperarSubida, expect, filas, subirYAnalizar, test } from './ayuda';

// Ver solo un equipo o una parte, en el editor y en la pagina de los jugadores.
// analisis.mp4 da dos fragmentos, [0, 19,98) y [30, 60), todo en una parte.

const filtro = (page: Page, contenedor: string, nombre: string) => page.locator(contenedor).getByRole('button', { name: nombre, exact: true });
const cuenta = (page: Page, contenedor: string) => page.locator(`${contenedor} .filtros-cuenta`);

/** Marca la 2.ª parte a los 40 s: quedan [0, 19,98) y [30, 40) en la 1.ª y [40, 60) en la 2.ª. */
async function segundaParteA40(page: Page): Promise<void> {
  await buscar(page, 40);
  await page.getByRole('button', { name: 'La 2.ª parte empieza aquí' }).click();
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(3);
}

test('por equipo: la lista, la cuenta y «ver todo seguido» solo con los que se ven', async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  // Con una sola parte no hay filtro de partes.
  await expect(page.getByRole('group', { name: 'Ver por parte' })).toHaveCount(0);
  await page.locator('#lista-fragmentos .fragmento').first().getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();

  await filtro(page, '#filtros-editor', EQUIPOS.visitante).click();
  expect(await filas(page)).toEqual([]);
  await expect(cuenta(page, '#filtros-editor')).toHaveText('Se ven 0 de 2.');

  // El elegido (el 1.º) queda fuera: se pasa al que se ve, que conserva su número.
  await filtro(page, '#filtros-editor', 'Sin equipo').click();
  await expect(filtro(page, '#filtros-editor', 'Sin equipo')).toHaveAttribute('aria-pressed', 'true');
  expect((await filas(page)).map((f) => [f.desde, f.hasta])).toEqual([[30, 60]]);
  const fila = page.locator('#lista-fragmentos .fragmento');
  await expect(fila).toHaveAttribute('aria-current', 'true');
  await expect(fila.locator('.fragmento-numero')).toHaveText('2');
  await expect(cuenta(page, '#filtros-editor')).toHaveText('Se ven 1 de 2.');
  // En la línea de tiempo sigue todo el partido, con lo que no se ve apagado.
  await expect(page.locator('#linea-analisis .linea-tramo')).toHaveCount(2);
  await expect(page.locator('#linea-analisis .linea-tramo.fuera-filtro')).toHaveCount(1);
  await expect(page.locator('#linea-analisis .linea-tramo').first()).toHaveClass(/fuera-filtro/);

  // Desde el principio, «ver todo seguido» salta el fragmento del local: sin filtro tardaría 30 s en llegar.
  await buscar(page, 0);
  await page.getByRole('button', { name: 'Ver todo seguido' }).click();
  await expect.poll(() => page.locator('#video-editor').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 5_000 }).toBeGreaterThan(29.9);
  await page.locator('#video-editor').evaluate((v: HTMLVideoElement) => v.pause());

  await filtro(page, '#filtros-editor', 'Todos').click();
  expect(await filas(page)).toHaveLength(2);
  await expect(cuenta(page, '#filtros-editor')).toBeHidden();
  await expect(page.locator('#linea-analisis .linea-tramo.fuera-filtro')).toHaveCount(0);
});

test('por parte, también junto con el equipo; «ver todo seguido» se para al acabar la parte', async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await segundaParteA40(page);

  await filtro(page, '#filtros-editor', '2.ª parte').click();
  expect((await filas(page)).map((f) => [f.desde, f.hasta])).toEqual([[40, 60]]);
  await expect(page.locator('#lista-fragmentos .fragmento-numero')).toHaveText('3');
  await expect(cuenta(page, '#filtros-editor')).toHaveText('Se ven 1 de 3.');

  await filtro(page, '#filtros-editor', '1.ª parte').click();
  expect((await filas(page)).map((f) => [f.desde, f.hasta])).toEqual([
    [0, 19.98],
    [30, 40],
  ]);

  // Sin filtro, de [30, 40) se seguiría en [40, 60); con la 1.ª parte, se para.
  await buscar(page, 39);
  await page.getByRole('button', { name: 'Ver todo seguido' }).click();
  const v = page.locator('#video-editor');
  await expect.poll(() => v.evaluate((x: HTMLVideoElement) => x.paused), { timeout: 15_000 }).toBe(true);
  const t = await v.evaluate((x: HTMLVideoElement) => x.currentTime);
  expect(t).toBeGreaterThan(39.9);
  expect(t).toBeLessThan(40.6);

  // Equipo y parte a la vez.
  await page.locator('#lista-fragmentos .fragmento').first().getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await filtro(page, '#filtros-editor', EQUIPOS.local).click();
  expect((await filas(page)).map((f) => f.desde)).toEqual([0]);
  await filtro(page, '#filtros-editor', '2.ª parte').click();
  expect(await filas(page)).toEqual([]);
  await expect(cuenta(page, '#filtros-editor')).toHaveText('Se ven 0 de 3.');
});

test('el jugador filtra por equipo y por parte, y descarga con el número de la lista entera', async ({ page, browser }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await segundaParteA40(page);
  const fragmentos = page.locator('#lista-fragmentos .fragmento');
  await fragmentos.nth(0).getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await fragmentos.nth(2).getByRole('button', { name: `Ataca ${EQUIPOS.visitante}` }).click();
  await esperarGuardado(page);
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const url = await page.locator('#lista-enlaces .enlace-url').inputValue();

  const { pagina, errores } = await abrirComoJugador(browser, url);
  await expect(pagina.locator('#bloque-jugadas')).toBeVisible({ timeout: 20_000 });
  // A un jugador no le sirve «Sin equipo».
  await expect(filtro(pagina, '#filtros-jugadores', 'Sin equipo')).toHaveCount(0);

  await filtro(pagina, '#filtros-jugadores', EQUIPOS.visitante).click();
  const jugadas = pagina.locator('#lista-jugadas .jugada');
  await expect(jugadas).toHaveCount(1);
  await expect(jugadas).toHaveAttribute('data-equipo', 'visitante');
  await expect(jugadas.locator('.fragmento-numero')).toHaveText('3');
  await expect(cuenta(pagina, '#filtros-jugadores')).toHaveText('Se ven 1 de 3.');

  const llega = pagina.waitForEvent('download');
  await pagina.getByRole('button', { name: 'Descargar MP4' }).click();
  expect((await llega).suggestedFilename()).toMatch(/-jugada-03-0m40s\.mp4$/);

  await filtro(pagina, '#filtros-jugadores', 'Todos').click();
  await filtro(pagina, '#filtros-jugadores', '1.ª parte').click();
  await expect(jugadas).toHaveCount(2);
  await expect(cuenta(pagina, '#filtros-jugadores')).toHaveText('Se ven 2 de 3.');
  expect(errores).toEqual([]);
});
