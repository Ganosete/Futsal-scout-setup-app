import type { Page } from '@playwright/test';
import { esperarSubida, expect, subirYAnalizar, test } from './ayuda';

// «Mi cuenta»: lo que se usa y los planes. El pago es una maqueta: se
// confirma sin pedir nada y no se cobra.

const medida = (page: Page, nombre: string) => page.locator('#medidas-cuenta .medida').filter({ has: page.locator('.medida-nombre', { hasText: nombre }) });
const tarjeta = (page: Page, plan: string) => page.locator(`#planes .plan[data-plan="${plan}"]`);

/** La fecha de dentro de `dias`, como la escribe la pagina (en la zona horaria del navegador). */
const dentroDe = (page: Page, dias: number): Promise<string> =>
  page.evaluate(
    (d) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.now() + d * 24 * 3600 * 1000)),
    dias,
  );

/** Partidos creados por la API, sin subir video: cuentan para el plan igual. */
async function crearSinVideo(page: Page, cuantos: number): Promise<void> {
  for (let i = 0; i < cuantos; i++) {
    const huella = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const r = await page.request.post('/api/partidos', {
      data: { local: 'Atlético Benavente', visitante: 'Peñíscola', fecha: '2026-11-08', nombreFichero: 'otro.mp4', tamano: 1000, duracion: 600, huella },
    });
    expect(r.status()).toBe(201);
  }
}

test('lo que se usa y el cambio de plan, que es una maqueta y no pide datos de pago', async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  await expect(page.locator('#lista-partidos .partido-borrado')).toHaveText(`Se borra el ${await dentroDe(page, 30)}`);

  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await expect(page.locator('#bloque-cuenta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(medida(page, 'Partidos').locator('.medida-cifra')).toHaveText('1 de 3');
  await expect(medida(page, 'Almacenamiento').locator('.medida-cifra')).toContainText('de 10,0 GB');
  await expect(tarjeta(page, 'gratuito')).toHaveAttribute('aria-current', 'true');

  await tarjeta(page, 'scout').getByRole('button', { name: 'Pasar a Scout' }).click();
  const pago = page.locator('#pago-maqueta');
  await expect(pago).toBeVisible();
  await expect(pago.getByRole('heading', { name: 'Pasar a Scout' })).toBeFocused();
  await expect(pago).toContainText('Maqueta: no se cobra nada.');
  await expect(pago.locator('input, select, textarea')).toHaveCount(0);
  await expect(page.locator('#precio-pago')).toHaveText('9 € al mes');
  await expect(page.locator('#efecto-pago')).toHaveText(
    `Lo que ya tienes subido se guardará hasta el ${await dentroDe(page, 365)}, y cada partido nuevo, 1 año desde que lo subas.`,
  );

  await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
  await expect(page.locator('#estado-cuenta')).toHaveText('Ya tienes el plan Scout. Es una maqueta: no se ha cobrado nada.');
  await expect(pago).toBeHidden();
  await expect(page.locator('#plan-cabecera')).toHaveText('Scout');
  await expect(tarjeta(page, 'scout')).toHaveAttribute('aria-current', 'true');
  await expect(medida(page, 'Partidos').locator('.medida-cifra')).toHaveText('1 de 30');
  await expect(page.locator('#lista-partidos .partido-borrado')).toHaveText(`Se borra el ${await dentroDe(page, 365)}`);

  // Bajar avisa con la fecha en que se borrara lo que ya hay; «Cancelar» no cambia nada.
  await tarjeta(page, 'gratuito').getByRole('button', { name: 'Pasar a Gratuito' }).click();
  await expect(page.locator('#efecto-pago')).toHaveText(
    `El partido que ya tienes se borrará el ${await dentroDe(page, 30)}: bájate antes lo que quieras guardar. Cada partido nuevo se guardará 30 días desde que lo subas.`,
  );
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(pago).toBeHidden();
  await expect(tarjeta(page, 'gratuito').getByRole('button', { name: 'Pasar a Gratuito' })).toBeFocused();
  await expect(page.locator('#plan-cabecera')).toHaveText('Scout');

  await page.getByRole('button', { name: 'Cerrar «Mi cuenta»' }).click();
  await expect(page.locator('#bloque-cuenta')).toBeHidden();
});

test('con el plan lleno, la subida dice por qué y «Mi cuenta» lo enseña', async ({ page }) => {
  await page.goto('/');
  await crearSinVideo(page, 3);
  await page.reload();
  await expect(page.locator('#lista-partidos .partido')).toHaveCount(3);

  await subirYAnalizar(page, 'analisis.mp4');
  await expect(page.locator('#estado-subida-partido')).toHaveText(
    'No se ha podido subir el vídeo: Tu plan Gratuito llega a 3 partidos: borra alguno o cambia de plan.',
  );
  await expect(page.locator('#lista-partidos .partido')).toHaveCount(3);

  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  const partidos = medida(page, 'Partidos');
  await expect(partidos).toHaveAttribute('data-nivel', 'lleno');
  await expect(partidos.locator('.medida-cifra')).toHaveText('3 de 3 · Lleno');
  // Al Pro se puede pasar; al plan en el que ya esta no hay boton.
  await expect(tarjeta(page, 'gratuito').getByRole('button')).toHaveCount(0);
  await expect(tarjeta(page, 'pro').getByRole('button', { name: 'Pasar a Pro' })).toBeEnabled();
});

test('para bajar de plan lo guardado tiene que caber: el botón lo dice antes de pulsar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await tarjeta(page, 'pro').getByRole('button', { name: 'Pasar a Pro' }).click();
  await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
  await expect(page.locator('#plan-cabecera')).toHaveText('Pro');

  await crearSinVideo(page, 4);
  await page.reload();
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await expect(medida(page, 'Partidos').locator('.medida-cifra')).toHaveText('4 · sin límite');
  await expect(medida(page, 'Partidos').locator('.medida-barra')).toHaveCount(0);
  const bajar = tarjeta(page, 'gratuito').getByRole('button', { name: 'Pasar a Gratuito' });
  await expect(bajar).toBeDisabled();
  await expect(bajar).toHaveAccessibleDescription('Para pasar a Gratuito deja como mucho 3 partidos: ahora tienes 4.');
});
