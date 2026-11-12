import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { BufferSource, Input, MP4 } from 'mediabunny';
import { EQUIPOS, esperarGuardado, esperarSubida, expect, subirYAnalizar, test } from './ayuda';

// Subida a R2 y partidos en D1, con el Worker de verdad en workerd (vite preview)
// y los datos locales de las pruebas.

const TITULO = `${EQUIPOS.local} – ${EQUIPOS.visitante}`;

async function equipos(page: Page): Promise<string[]> {
  return page.locator('#lista-fragmentos .fragmento').evaluateAll((li) => li.map((x) => (x as HTMLElement).dataset.equipo ?? ''));
}

/** Sube el partido, pone «local» en el primer fragmento y espera a que este guardado. */
async function subirYCorregir(page: Page): Promise<void> {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  await page.locator('#lista-fragmentos .fragmento').first().getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await esperarGuardado(page);
}

test('sube el vídeo mientras busca las jugadas, y las guarda', async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  await expect(page.locator('#partido-abierto')).toContainText(TITULO);
  expect(new URL(page.url()).hash).toMatch(/^#partido=[\w-]+$/);
  const fila = page.locator('#lista-partidos .partido');
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(TITULO);
  await expect(fila).toContainText('2 jugadas');
  await expect(fila).toHaveAttribute('aria-current', 'true');
});

test('lo corregido sigue ahí al recargar, con el vídeo del servidor', async ({ page }) => {
  await subirYCorregir(page);
  await page.reload();
  await expect(page.locator('#resultado-analisis')).toBeVisible({ timeout: 20_000 });
  expect(await equipos(page)).toEqual(['local', '']);
  const video = page.locator('#video-editor');
  await expect(video).toHaveAttribute('src', /\/api\/partidos\/[\w-]+\/video$/);
  // El navegador lo lee por rangos del Worker: sabe lo que dura sin bajarlo entero.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeCloseTo(60, 0);
});

test('el mismo vídeo otra vez no se sube dos veces y abre lo que ya estaba corregido', async ({ page }) => {
  await subirYCorregir(page);
  await page.goto('/');
  await subirYAnalizar(page, 'analisis.mp4');
  await expect(page.locator('#estado-subida-partido')).toHaveText('Este vídeo ya estaba subido.');
  await expect(page.locator('#estado-analisis')).toHaveText('Estas son las jugadas que ya tenías guardadas.');
  expect(await equipos(page)).toEqual(['local', '']);
  await expect(page.locator('#lista-partidos .partido')).toHaveCount(1);
});

test('abrir desde «Mis partidos» y descargar un fragmento leyendo solo ese trozo del servidor', async ({ page }) => {
  await subirYCorregir(page);
  await page.goto('/');
  await page.getByRole('button', { name: `Abrir ${TITULO}` }).click();
  await expect(page.locator('#resultado-analisis')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#video-editor')).toHaveAttribute('src', /\/api\/partidos\/[\w-]+\/video$/);
  const llega = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar MP4' }).click();
  const descarga = await llega;
  expect(descarga.suggestedFilename()).toMatch(/^atletico-benavente-peniscola-\d{4}-\d{2}-\d{2}-jugada-01-0m00s\.mp4$/);
  const entrada = new Input({ source: new BufferSource(new Uint8Array(readFileSync(await descarga.path())).buffer), formats: [MP4] });
  const duracion = await entrada.computeDuration();
  entrada.dispose();
  // El primer fragmento va de 0 a 19,98 s; sin recodificar puede llevar un fotograma de más al final.
  expect(duracion).toBeGreaterThanOrEqual(19.97);
  expect(duracion).toBeLessThanOrEqual(20.1);
});

test('borrar un partido lo quita de la lista y cierra sus jugadas', async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: `Borrar ${TITULO}` }).click();
  await expect(page.locator('#bloque-mis-partidos')).toBeHidden();
  await expect(page.locator('#bloque-analisis')).toBeHidden();
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(page.locator('#bloque-mis-partidos')).toBeHidden();
});

test('con dos pestañas, la que se quedó atrás no pisa lo corregido en la otra', async ({ page, context }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await esperarGuardado(page);
  const otra = await context.newPage();
  await otra.goto(page.url());
  await expect(otra.locator('#resultado-analisis')).toBeVisible({ timeout: 20_000 });
  await otra.locator('#lista-fragmentos .fragmento').nth(1).getByRole('button', { name: `Ataca ${EQUIPOS.visitante}` }).click();
  await esperarGuardado(otra);
  await page.locator('#lista-fragmentos .fragmento').first().getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await expect(page.locator('#estado-guardado')).toContainText('han cambiado en otra pestaña', { timeout: 20_000 });
  await otra.reload();
  await expect(otra.locator('#resultado-analisis')).toBeVisible({ timeout: 20_000 });
  expect(await equipos(otra)).toEqual(['', 'visitante']);
});

test('sin servidor se buscan las jugadas igual, y se avisa de que no se guardan', async ({ page }) => {
  await page.route('**/api/partidos', (ruta) =>
    ruta.request().method() === 'POST'
      ? ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'El servidor no está disponible ahora mismo.' }) })
      : ruta.fallback(),
  );
  await subirYAnalizar(page, 'analisis.mp4');
  await expect(page.locator('#estado-subida-partido')).toHaveText(
    'No se ha podido subir el vídeo: El servidor no está disponible ahora mismo.',
  );
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(2);
  await expect(page.locator('#estado-guardado')).toHaveText('Estas jugadas no se guardan: el partido no está en el servidor.');
});
