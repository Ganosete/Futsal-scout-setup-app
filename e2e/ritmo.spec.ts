import { abrirComoJugador, buscar, EQUIPOS, esperarGuardado, esperarSubida, expect, subirYAnalizar, test } from './ayuda';

// «Ritmo del partido». analisis.mp4 dura 60 s y da dos fragmentos: [0, 19,98)
// y [30, 60). Con el primero del local y el segundo del visitante, el local
// tiene 19,98 s de 49,98: un 40 %, y el visitante un 60 %. Intl separa el
// numero del % con un espacio duro (U+00A0).

const totales = (page: import('@playwright/test').Page) => page.locator('#grafico-ritmo .ritmo-total');

test('el ritmo sale con el editor y cambia con cada corrección; cada tramo dice sus cifras', async ({ page }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await expect(page.locator('#bloque-ritmo')).toBeVisible();
  await expect(totales(page).first()).toContainText('Sin equipos puestos · 0:50 sin equipo');

  const filas = page.locator('#lista-fragmentos .fragmento');
  await filas.nth(0).getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await filas.nth(1).getByRole('button', { name: `Ataca ${EQUIPOS.visitante}` }).click();
  await expect(totales(page).first()).toHaveAttribute('aria-label', `Partido: ${EQUIPOS.local} 40\u00a0%, ${EQUIPOS.visitante} 60\u00a0%`);
  await expect(totales(page).first().locator('.ritmo-total-cifras')).toHaveText('40 % – 60 %');

  // Una parte de 60 s es un solo tramo; con el foco del teclado dice lo mismo que con el raton.
  const zona = page.locator('#grafico-ritmo .ritmo-zona');
  await expect(zona).toHaveCount(1);
  await expect(zona).toHaveAttribute('aria-label', `De 0' a 1' de la 1.ª parte: ${EQUIPOS.local} 0:20, ${EQUIPOS.visitante} 0:30`);
  await zona.focus();
  await expect(page.locator('#grafico-ritmo .ritmo-aviso')).toBeVisible();
  await expect(page.locator('#grafico-ritmo .ritmo-aviso')).toContainText(`0:30 ${EQUIPOS.visitante}`);

  // La tabla tiene las mismas cifras sin depender del color ni del raton.
  await page.getByText('Ver los datos').click();
  await expect(page.locator('#grafico-ritmo .ritmo-tabla tbody tr').first()).toHaveText(/1\.ª parte, 0'–1'\s*0:20\s*0:30\s*0:00/);

  // Con dos partes, una fila de totales para cada una.
  await buscar(page, 40);
  await page.getByRole('button', { name: 'La 2.ª parte empieza aquí' }).click();
  await expect(totales(page)).toHaveCount(3);
  await expect(totales(page).nth(2)).toHaveAttribute('aria-label', `2.ª parte: ${EQUIPOS.local} 0\u00a0%, ${EQUIPOS.visitante} 100\u00a0%`);
});

test('los jugadores ven el mismo ritmo', async ({ page, browser }) => {
  await subirYAnalizar(page, 'analisis.mp4');
  await esperarSubida(page);
  const filas = page.locator('#lista-fragmentos .fragmento');
  await filas.nth(0).getByRole('button', { name: `Ataca ${EQUIPOS.local}` }).click();
  await filas.nth(1).getByRole('button', { name: `Ataca ${EQUIPOS.visitante}` }).click();
  await esperarGuardado(page);
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const { pagina, errores } = await abrirComoJugador(browser, await page.locator('#lista-enlaces .enlace-url').inputValue());
  await expect(pagina.locator('#bloque-ritmo')).toBeVisible({ timeout: 20_000 });
  await expect(pagina.locator('#grafico-ritmo .ritmo-total').first().locator('.ritmo-total-cifras')).toHaveText('40 % – 60 %');
  expect(errores).toEqual([]);
});
