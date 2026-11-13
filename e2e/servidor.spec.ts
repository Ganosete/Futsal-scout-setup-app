import type { Page } from '@playwright/test';
import type { Partido } from '../src/comun/partido';
import type { Procesado } from '../src/comun/procesado';
import { empezar, esperarSubida, expect, test } from './ayuda';

// El procesado en el servidor (fase 6) desde la pagina. En local no hay
// contenedores: el Durable Object contesta que no esta disponible, y lo que
// haria un contenedor trabajando se simula respondiendo a la API desde aqui.

async function aScout(page: Page): Promise<void> {
  await page.goto('/');
  expect((await page.request.put('/api/cuenta/plan', { data: { plan: 'scout' } })).status()).toBe(200);
  await page.reload();
}

function partido(id: string, servidor: Procesado | null, editado: string | null = null): Partido {
  return {
    id,
    local: 'Atlético Benavente',
    visitante: 'Peñíscola',
    fecha: '2026-11-08',
    nombreFichero: 'partido.mp4',
    tamano: 4_000_000_000,
    duracion: 6000,
    estado: 'subido',
    subido: 4_000_000_000,
    editado,
    fragmentos: editado ? 30 : null,
    creado: '2026-11-12T10:00:00.000Z',
    seBorra: null,
    servidor,
  };
}

const AHORA = '2026-11-13T10:00:00.000Z';

test('la casilla del servidor sale con un plan que lo incluye, y no con el gratuito', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#form-subida')).toBeVisible();
  await expect(page.locator('#casilla-servidor')).toBeHidden();
  await aScout(page);
  await expect(page.locator('#casilla-servidor')).toBeVisible();
  await expect(page.getByLabel('Que busque las jugadas el servidor: puedes cerrar la página en cuanto acabe de subir')).not.toBeChecked();
});

test('subir con la casilla no busca las jugadas en el navegador: avisa de que lo hará el servidor', async ({ page }) => {
  await aScout(page);
  await page.getByLabel(/Que busque las jugadas el servidor/).check();
  await empezar(page, 'analisis.mp4');
  await expect(page.locator('#estado-analisis')).toHaveText(
    'Las jugadas las buscará el servidor en cuanto acabe de subir: cuando diga «Vídeo subido.» puedes cerrar la página. Las verás en «Mis partidos».',
  );
  await esperarSubida(page);
  await expect(page.locator('#resultado-analisis')).toBeHidden();

  // En local no hay contenedor: el partido queda sin procesar, con el boton para pedirlo, que contesta que no se puede.
  const fila = page.locator('#lista-partidos .partido').first();
  await fila.getByRole('button', { name: /^Procesar en el servidor/ }).click();
  await expect(page.locator('#estado-partidos')).toHaveText('No se ha podido pedir al servidor: El procesado en el servidor no está disponible ahora mismo.');
});

test('la lista cuenta en qué va el servidor, se refresca sola mientras trabaja y deja reintentar lo que falló', async ({ page }) => {
  await aScout(page);
  const trabajando = partido('p-trabajando', { estado: 'trabajando', fase: 'subiendo', avance: 0.6, mensaje: null, ligero: false, actualizado: AHORA });
  const fallo = partido('p-fallo', { estado: 'fallo', fase: null, avance: 0, mensaje: 'No se ha podido procesar el vídeo en el servidor.', ligero: false, actualizado: AHORA });
  let peticiones = 0;
  let reintentado = false;
  await page.route('**/api/partidos', async (ruta) => {
    if (ruta.request().method() !== 'GET') return ruta.fallback();
    peticiones++;
    const esperando = { ...fallo, servidor: { ...fallo.servidor!, estado: 'esperando' as const, mensaje: null } };
    await ruta.fulfill({ json: { partidos: [trabajando, reintentado ? esperando : fallo] } });
  });
  await page.route('**/api/partidos/p-fallo/procesar', async (ruta) => {
    reintentado = true;
    await ruta.fulfill({ status: 202, json: { servidor: null } });
  });
  await page.reload();

  const filas = page.locator('#lista-partidos .partido');
  await expect(filas.nth(0).locator('.partido-servidor')).toHaveText('En el servidor: preparando el vídeo para los jugadores (60 %).');
  await expect(filas.nth(1).locator('.partido-servidor')).toHaveText('No se ha podido procesar el vídeo en el servidor.');
  // Sin jugadas todavia no se puede abrir; mientras trabaja no se ofrece pedirlo otra vez.
  await expect(filas.nth(0).getByRole('button', { name: /^Abrir/ })).toHaveCount(0);
  await expect(filas.nth(0).getByRole('button', { name: /en el servidor/ })).toHaveCount(0);

  await filas.nth(1).getByRole('button', { name: /^Reintentar en el servidor/ }).click();
  await expect(filas.nth(1).locator('.partido-servidor')).toHaveText('En el servidor: esperando turno.');
  await expect(page.locator('#estado-partidos')).toHaveText('Atlético Benavente – Peñíscola: pedido al servidor.');

  // Con algo en marcha, la lista se pide otra vez sola (cada 10 s).
  const antes = peticiones;
  await expect.poll(() => peticiones, { timeout: 15_000 }).toBeGreaterThan(antes);
});
