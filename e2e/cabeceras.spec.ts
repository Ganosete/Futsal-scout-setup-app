import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test('la página sale con la CSP y el resto de cabeceras de seguridad', async ({ request }) => {
  const r = await request.get('/');
  const cabeceras = r.headers();
  expect(cabeceras['content-security-policy']).toContain("default-src 'self'");
  expect(cabeceras['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(cabeceras['x-content-type-options']).toBe('nosniff');
  expect(cabeceras['referrer-policy']).toBe('no-referrer');
  expect(cabeceras['x-robots-tag']).toBe('noindex');
});

test('con la CSP puesta, leer un vídeo no provoca ningún error en la consola', async ({ page }) => {
  const errores: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto('/');
  await page.setInputFiles('#entrada-video', fileURLToPath(new URL('../tests/fixtures/partido_corto.mp4', import.meta.url)));
  await expect(page.locator('#datos-video')).toContainText('H.264');
  expect(errores).toEqual([]);
});
