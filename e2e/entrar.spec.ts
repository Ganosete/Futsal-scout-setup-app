import type { BrowserContext, Page } from '@playwright/test';
import { esperarSubida, expect, subirYAnalizar, test } from './ayuda';

// Entrar con el email. En localhost no hay correo: el codigo sale en la propia
// pagina. Con la cookie de pruebas a `sin-sesion` se ve lo que ve quien llega
// sin cuenta.

async function sinSesion(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  await context.addCookies([{ name: 'futsal-scout-local', value: 'sin-sesion', url: baseURL ?? 'http://localhost' }]);
}

const emailNuevo = () => `e2e-${crypto.randomUUID().slice(0, 8)}@club.es`;

/** Pide el codigo y lo devuelve, leido de la pagina. */
async function pedirCodigo(page: Page, email: string): Promise<string> {
  await page.getByLabel('Tu email').fill(email);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  const texto = page.locator('#texto-codigo');
  await expect(texto).toContainText('Estás en local y no hay correo: tu código es');
  const codigo = /(\d{6})/.exec((await texto.textContent()) ?? '')?.[1];
  if (!codigo) throw new Error('sin código');
  return codigo;
}

test('sin sesión solo se ve la pantalla de entrar; con el código se entra, y «Salir» vuelve a ella', async ({ page, context, baseURL }) => {
  await sinSesion(context, baseURL);
  await page.goto('/');
  await expect(page.locator('#bloque-entrar')).toBeVisible();
  await expect(page.locator('#form-subida')).toBeHidden();
  await expect(page.locator('#cuenta-cabecera')).toBeHidden();
  await expect(page.locator('#intro-entrar')).toContainText('Si es la primera vez, así te das de alta');

  await page.getByLabel('Tu email').fill('no-es-un-email');
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(page.locator('#estado-entrar')).toHaveText('Escribe un email válido.');

  const email = emailNuevo();
  const codigo = await pedirCodigo(page, email);
  await expect(page.getByLabel('Código')).toBeFocused();
  await page.getByLabel('Código').fill(codigo === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#estado-entrar')).toHaveText('Ese código no es: revísalo.');

  await page.getByLabel('Código').fill(codigo);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#form-subida')).toBeVisible();
  await expect(page.locator('#bloque-entrar')).toBeHidden();
  await expect(page.locator('#email-cabecera')).toHaveText(email);
  await expect(page.locator('#plan-cabecera')).toHaveText('Gratuito');

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#bloque-entrar')).toBeVisible();
  await expect(page.locator('#form-subida')).toBeHidden();
});

test('«Usar otro email» vuelve al primer paso', async ({ page, context, baseURL }) => {
  await sinSesion(context, baseURL);
  await page.goto('/');
  await pedirCodigo(page, emailNuevo());
  await page.getByRole('button', { name: 'Usar otro email' }).click();
  await expect(page.getByLabel('Tu email')).toBeFocused();
  await expect(page.locator('#form-codigo')).toBeHidden();
});

test('si la sesión se cierra en otra pestaña, entrar sale encima y lo abierto no se pierde', async ({ page, context, baseURL }) => {
  await sinSesion(context, baseURL);
  await page.goto('/');
  const email = emailNuevo();
  await page.getByLabel('Código').fill(await pedirCodigo(page, email));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#form-subida')).toBeVisible();

  const otra = await context.newPage();
  await otra.goto('/');
  await otra.getByRole('button', { name: 'Salir' }).click();
  await expect(otra.locator('#bloque-entrar')).toBeVisible();

  // En la primera, la subida se encuentra sin sesion: sale entrar, y las jugadas se buscan igual.
  await subirYAnalizar(page, 'analisis.mp4');
  await expect(page.locator('#bloque-entrar')).toBeVisible();
  await expect(page.locator('#intro-entrar')).toContainText('Tu sesión se ha cerrado');
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(2);

  await page.getByLabel('Código').fill(await pedirCodigo(page, email));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#bloque-entrar')).toBeHidden();
  await expect(page.locator('#lista-fragmentos .fragmento')).toHaveCount(2);
  await expect(page.locator('#email-cabecera')).toHaveText(email);

  // Y lo que se sube a partir de ahi ya va a su cuenta.
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
});
