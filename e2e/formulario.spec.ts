import type { Page } from '@playwright/test';
import { expect, fixture, test } from './ayuda';

async function elegirVideo(page: Page, nombre: string): Promise<void> {
  await page.setInputFiles('#entrada-video', fixture(nombre));
}

const datos = (page: Page) => page.locator('#datos-video');
const estado = (page: Page) => page.locator('#estado-subida');
const formulario = (page: Page) => page.locator('#form-subida');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('la página carga con el formulario vacío y la versión publicada', async ({ page }) => {
  await expect(page).toHaveTitle('Futsal Scout');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nuevo partido');
  await expect(page.getByRole('button', { name: 'Subir y analizar' })).toBeDisabled();
  await expect(estado(page)).toHaveText('Elige el vídeo del partido.');
  await expect(page.locator('#version')).not.toHaveText('—');
});

test('un vídeo normal enseña sus datos y, con los equipos, queda listo', async ({ page }) => {
  await elegirVideo(page, 'partido_corto.mp4');
  await expect(datos(page)).toContainText('0:03');
  await expect(datos(page)).toContainText('640×360 · 25 fps · H.264');
  await expect(datos(page)).toContainText('AAC · 48 kHz · mono');
  await expect(page.locator('.problema')).toHaveCount(1);
  await expect(page.locator('.problema[data-codigo="corto"]')).toContainText('Aviso');
  await expect(estado(page)).toHaveText('El vídeo vale. Falta completar los datos del partido.');

  await page.getByLabel('Equipo local').fill('Castillo de Requena FS');
  await page.getByLabel('Equipo visitante').fill('Feme Castellón');
  await expect(formulario(page)).toHaveAttribute('data-listo', 'si');
  await expect(estado(page)).toHaveText('Todo listo: pulsa «Subir y analizar».');
  await expect(page.getByRole('button', { name: 'Subir y analizar' })).toBeEnabled();
});

test('con el moov al final se lee lo mismo', async ({ page }) => {
  await elegirVideo(page, 'moov_al_final.mp4');
  await expect(datos(page)).toContainText('640×360 · 25 fps · H.264');
});

test('ProRes es un error y no deja seguir', async ({ page }) => {
  await elegirVideo(page, 'prores.mov');
  await expect(page.locator('.problema-error[data-codigo="codec"]')).toContainText('ProRes');
  await expect(formulario(page)).toHaveAttribute('data-listo', 'no');
  await expect(estado(page)).toHaveText('Este vídeo no se puede usar: mira lo marcado como error.');
});

test('un fichero que no es un vídeo se rechaza sin intentar leerlo', async ({ page }) => {
  await page.setInputFiles('#entrada-video', {
    name: 'convocatoria.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 lista de convocados'),
  });
  await expect(page.locator('.problema-error[data-codigo="formato"]')).toHaveText(/Solo se admiten vídeos MP4 o MOV/);
  await expect(datos(page)).toBeEmpty();
});

test('cambiar de vídeo sustituye los problemas del anterior', async ({ page }) => {
  await elegirVideo(page, 'prores.mov');
  await expect(page.locator('.problema-error')).toHaveCount(1);
  await elegirVideo(page, 'partido_corto.mp4');
  await expect(page.locator('.problema-error')).toHaveCount(0);
  await expect(page.locator('#nombre-video')).toHaveText('partido_corto.mp4');
});

test('local y visitante no pueden ser el mismo equipo', async ({ page }) => {
  await page.getByLabel('Equipo local').fill('Atlético Benavente');
  await page.getByLabel('Equipo visitante').fill('atletico benavente');
  await page.getByLabel('Equipo visitante').blur();
  await expect(page.locator('#mensaje-visitante')).toHaveText('Local y visitante no pueden ser el mismo equipo.');
  await expect(page.getByLabel('Equipo visitante')).toHaveAttribute('aria-invalid', 'true');
});

test('la API responde en /api/salud', async ({ request }) => {
  const r = await request.get('/api/salud');
  expect(r.ok()).toBe(true);
  expect(await r.json()).toMatchObject({ estado: 'ok' });
});
