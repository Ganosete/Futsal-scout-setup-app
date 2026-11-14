import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { BufferSource, Input, MP4 } from 'mediabunny';
import { abrirComoJugador, EQUIPOS, esperarGuardado, esperarSubida, expect, subirYAnalizar, test } from './ayuda';

// El enlace para los jugadores: lo crea el entrenador y lo abre un jugador en
// otro navegador, sin la sesion del entrenador.

async function subirYCrearEnlace(page: Page): Promise<string> {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  await expect(page.locator('#bloque-compartir')).toBeVisible();
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const url = page.locator('#lista-enlaces .enlace-url');
  await expect(url).toHaveCount(1);
  await expect(page.locator('#lista-enlaces .enlace-detalle')).toContainText('Caduca el');
  return url.inputValue();
}

const equiposDe = (p: Page): Promise<string[]> =>
  p.locator('#lista-jugadas .jugada').evaluateAll((li) => li.map((x) => (x as HTMLElement).dataset.equipo ?? ''));

test('el entrenador crea un enlace y un jugador, sin cuenta, ve y descarga las jugadas', async ({ page, browser }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  await page.locator('#lista-fragmentos .fragmento').first().getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await esperarGuardado(page);
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const url = await page.locator('#lista-enlaces .enlace-url').inputValue();
  expect(url).toMatch(/^http:\/\/localhost:\d+\/v\/[A-Za-z0-9_-]{22}$/);

  const { pagina, errores } = await abrirComoJugador(browser, url);
  await expect(pagina.locator('#bloque-jugadas')).toBeVisible({ timeout: 20_000 });
  await expect(pagina.getByRole('heading', { level: 1 })).toHaveText(`${EQUIPOS.local} – ${EQUIPOS.visitante}`);
  await expect(pagina.locator('#detalle-compartido')).toContainText('2 jugadas · 0:50 de juego');
  expect(await equiposDe(pagina)).toEqual(['local', '']);
  await expect(pagina.locator('#lista-jugadas .jugada').first()).toContainText(EQUIPOS.local);

  // Elegir la segunda la pone a sonar desde su inicio (30 s).
  await pagina.locator('#lista-jugadas .jugada').nth(1).click();
  await expect(pagina.locator('#lista-jugadas .jugada').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => pagina.locator('#video-jugadores').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(29.9);

  // La primera, en MP4, leyendo del servidor solo ese trozo.
  await pagina.getByRole('button', { name: 'Anterior' }).click();
  const llega = pagina.waitForEvent('download');
  await pagina.getByRole('button', { name: 'Descargar MP4' }).click();
  const descarga = await llega;
  expect(descarga.suggestedFilename()).toMatch(/^atletico-benavente-peniscola-\d{4}-\d{2}-\d{2}-jugada-01-0m00s\.mp4$/);
  const entrada = new Input({ source: new BufferSource(new Uint8Array(readFileSync(await descarga.path())).buffer), formats: [MP4] });
  const duracion = await entrada.computeDuration();
  entrada.dispose();
  expect(duracion).toBeGreaterThanOrEqual(19.97);
  expect(duracion).toBeLessThanOrEqual(20.1);
  expect(errores).toEqual([]);

  // El entrenador ve que se ha abierto.
  await page.reload();
  await expect(page.locator('#lista-enlaces .enlace-detalle')).toContainText('· 1 vista', { timeout: 20_000 });
});

test('lo que corrige el entrenador lo ve el jugador al volver a abrir el enlace', async ({ page, browser }) => {
  const url = await subirYCrearEnlace(page);
  const { pagina } = await abrirComoJugador(browser, url);
  await expect(pagina.locator('#bloque-jugadas')).toBeVisible({ timeout: 20_000 });
  expect(await equiposDe(pagina)).toEqual(['', '']);
  // Sin equipos puestos y con una sola parte, no hay nada que filtrar.
  await expect(pagina.locator('#filtros-jugadores .filtros-grupo')).toHaveCount(0);
  await page.locator('#lista-fragmentos .fragmento').nth(1).getByRole('button', { name: `Ataca ${EQUIPOS.visitante}` }).click();
  await esperarGuardado(page);
  await pagina.reload();
  await expect(pagina.locator('#bloque-jugadas')).toBeVisible({ timeout: 20_000 });
  expect(await equiposDe(pagina)).toEqual(['', 'visitante']);
  await expect(pagina.getByRole('group', { name: 'Ver por equipo' })).toBeVisible();
});

test('quitado el enlace, el jugador ya no entra', async ({ page, browser }) => {
  const url = await subirYCrearEnlace(page);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Quitar el enlace' }).click();
  await expect(page.locator('#lista-enlaces .enlace')).toHaveCount(0);
  await expect(page.locator('#estado-compartir')).toHaveText('Enlace quitado: ya no funciona.');
  const { pagina } = await abrirComoJugador(browser, url);
  await expect(pagina.locator('#estado-compartido')).toHaveText('Este enlace no existe: puede que el entrenador lo haya quitado.');
  await expect(pagina.locator('#bloque-jugadas')).toBeHidden();
});

test('un enlace incompleto lo dice sin preguntar al servidor', async ({ page }) => {
  await page.goto('/v/corto');
  await expect(page.locator('#estado-compartido')).toHaveText('Este enlace no está completo: cópialo otra vez del mensaje del entrenador.');
});
