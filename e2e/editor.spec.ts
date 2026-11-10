import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { BufferSource, Input, MP4 } from 'mediabunny';
import { expect, subirYAnalizar, test } from './ayuda';

// analisis.mp4: silbato a los 20 s e imagen quieta hasta los 30 s. El análisis
// da dos fragmentos, [0, 19,98) y [30, 60), y con ellos se abre el editor.

interface Fila {
  desde: number;
  hasta: number;
  equipo: string;
}

async function filas(page: Page): Promise<Fila[]> {
  return page.locator('#lista-fragmentos .fragmento').evaluateAll((li) =>
    li.map((x) => {
      const d = (x as HTMLElement).dataset;
      return { desde: Number(d.desde), hasta: Number(d.hasta), equipo: d.equipo ?? '' };
    }),
  );
}

/** Lleva el vídeo a `t` y espera a que haya llegado. */
async function buscar(page: Page, t: number): Promise<void> {
  await page.locator('#video-editor').evaluate(async (v: HTMLVideoElement, segundos) => {
    await new Promise<void>((listo) => {
      v.addEventListener('seeked', () => listo(), { once: true });
      v.currentTime = segundos;
    });
  }, t);
}

/** Los atajos van al documento; con el foco en un botón, Intro y Espacio son del botón. */
async function pulsar(page: Page, tecla: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(tecla);
}

test.beforeEach(async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
});

test('se abre con el vídeo, la línea y los fragmentos, y el primero elegido', async ({ page }) => {
  await expect(page.locator('#video-editor')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#linea-analisis .linea-tramo')).toHaveCount(2);
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(2);
  await expect(page.locator('#lista-fragmentos .fragmento').first()).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#equipos-analisis')).toHaveText('Atlético Benavente: 0 · Peñíscola: 0 · Sin asignar: 2');
});

test('el equipo, con un clic en la fila o con L y V', async ({ page }) => {
  await page.locator('#lista-fragmentos .fragmento').first().getByRole('button', { name: 'Ataca Atlético Benavente' }).click();
  await pulsar(page, 'ArrowDown');
  await pulsar(page, 'v');
  expect((await filas(page)).map((f) => f.equipo)).toEqual(['local', 'visitante']);
  await expect(page.locator('#equipos-analisis')).toHaveText('Atlético Benavente: 1 · Peñíscola: 1 · Sin asignar: 0');
  // Pulsar otra vez el mismo equipo lo quita.
  await pulsar(page, 'v');
  expect((await filas(page))[1].equipo).toBe('');
});

test('partir, unir, deshacer y rehacer', async ({ page }) => {
  await pulsar(page, 'ArrowDown');
  await buscar(page, 45);
  await pulsar(page, 'p');
  expect((await filas(page)).map((f) => [f.desde, f.hasta])).toEqual([
    [0, 19.98],
    [30, 45],
    [45, 60],
  ]);
  await page.locator('#lista-fragmentos .fragmento').nth(1).click();
  await pulsar(page, 'u');
  expect(await filas(page)).toHaveLength(2);
  await pulsar(page, 'Control+z');
  expect(await filas(page)).toHaveLength(3);
  await pulsar(page, 'Control+Shift+z');
  expect((await filas(page)).map((f) => [f.desde, f.hasta])[1]).toEqual([30, 60]);
});

test('ajustar el inicio y el final donde está el vídeo, y quitar', async ({ page }) => {
  await buscar(page, 2);
  await pulsar(page, 'i');
  await buscar(page, 18);
  await pulsar(page, 'f');
  expect((await filas(page))[0]).toMatchObject({ desde: 2, hasta: 18 });
  await expect(page.locator('#estado-editor')).toHaveText('Fragmento 1: 0:02 – 0:18.');
  await pulsar(page, 'Delete');
  expect(await filas(page)).toHaveLength(1);
  await expect(page.locator('#resumen-analisis')).toContainText('1 fragmento de juego');
});

test('ver un fragmento se para en su final', async ({ page }) => {
  await buscar(page, 17);
  await pulsar(page, 'i');
  await pulsar(page, 'Enter');
  const v = page.locator('#video-editor');
  await expect.poll(() => v.evaluate((x: HTMLVideoElement) => x.paused), { timeout: 15_000 }).toBe(true);
  const t = await v.evaluate((x: HTMLVideoElement) => x.currentTime);
  expect(t).toBeGreaterThan(19.5);
  expect(t).toBeLessThan(20.5);
});

test('ver todo seguido se salta el balón parado', async ({ page }) => {
  await buscar(page, 19);
  await page.getByRole('button', { name: 'Ver todo seguido' }).click();
  const v = page.locator('#video-editor');
  // De 19 s a 19,98 s sigue el primer fragmento; luego salta de golpe a 30 s.
  await expect.poll(() => v.evaluate((x: HTMLVideoElement) => x.currentTime), { timeout: 15_000 }).toBeGreaterThan(30);
  await expect(page.locator('#lista-fragmentos .fragmento').nth(1)).toHaveAttribute('aria-current', 'true');
});

test('descargar un fragmento en MP4: se llama como el partido y dura lo que el fragmento', async ({ page }) => {
  const llega = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar MP4' }).click();
  const descarga = await llega;
  expect(descarga.suggestedFilename()).toMatch(/^atletico-benavente-peniscola-\d{4}-\d{2}-\d{2}-jugada-01-0m00s\.mp4$/);
  // El MP4 descargado se lee aquí, en Node, con el mismo Mediabunny.
  const entrada = new Input({ source: new BufferSource(new Uint8Array(readFileSync(await descarga.path())).buffer), formats: [MP4] });
  const duracion = await entrada.computeDuration();
  entrada.dispose();
  // El primer fragmento va de 0 a 19,98 s; sin recodificar puede llevar un fotograma de más al final.
  expect(duracion).toBeGreaterThanOrEqual(19.97);
  expect(duracion).toBeLessThanOrEqual(20.1);
  await expect(page.locator('#estado-editor')).toContainText('Descargado: atletico-benavente-peniscola-');
});

test('marcar el descanso y el inicio del partido', async ({ page }) => {
  // No se encontró descanso: todo es una parte. La 2.ª empieza a los 40 s...
  await buscar(page, 40);
  await page.getByRole('button', { name: 'La 2.ª parte empieza aquí' }).click();
  expect((await filas(page)).map((f) => [f.desde, f.hasta])).toEqual([
    [0, 19.98],
    [30, 40],
    [40, 60],
  ]);
  await expect(page.locator('#lista-fragmentos .fragmento').nth(2)).toContainText('2.ª parte');
  // ...y la 1.ª acaba a los 35 s: lo de 35 a 40 es el descanso.
  await buscar(page, 35);
  await page.getByRole('button', { name: 'La 1.ª parte acaba aquí' }).click();
  expect((await filas(page)).map((f) => [f.desde, f.hasta])).toEqual([
    [0, 19.98],
    [30, 35],
    [40, 60],
  ]);
  await expect(page.locator('#partes-analisis')).toHaveText('Descanso: de 0:35 a 0:40.');
  // El partido empieza a los 5 s: lo de antes es calentamiento.
  await buscar(page, 5);
  await page.getByRole('button', { name: 'La 1.ª parte empieza aquí' }).click();
  expect((await filas(page))[0]).toMatchObject({ desde: 5, hasta: 19.98 });
  await expect(page.locator('#rango-parte-1')).toHaveText('0:05 – 0:35');
});

test('un clic en la línea lleva el vídeo ahí y elige el fragmento', async ({ page }) => {
  const linea = page.locator('#linea-analisis');
  // click() con posición lleva antes la línea a la vista; queda por debajo del vídeo.
  await linea.scrollIntoViewIfNeeded();
  const caja = await linea.boundingBox();
  if (!caja) throw new Error('La línea de tiempo no se ve');
  // El 75 % del ancho son 45 s de 60: dentro del segundo fragmento.
  await linea.click({ position: { x: caja.width * 0.75, y: caja.height / 2 } });
  await expect(page.locator('#lista-fragmentos .fragmento').nth(1)).toHaveAttribute('aria-current', 'true');
  const t = await page.locator('#video-editor').evaluate((x: HTMLVideoElement) => x.currentTime);
  expect(Math.abs(t - 45)).toBeLessThan(1);
});
