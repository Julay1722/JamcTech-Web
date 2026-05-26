// tests/persona-tester.spec.js
//
// Persona "Tester" (destructivo): intenta romper la app con doble-clicks,
// recargas mid-fetch, datos inválidos, red lenta/caída, switch rápido de
// paneles. Foco en robustez, no en cobertura funcional.

const { test, expect } = require('@playwright/test');
const { setupConsoleCapture, assertCleanConsole } = require('./helpers/console-capture');
const { gotoAppAndWaitReady, switchToPanel, PANEL_LABEL } = require('./helpers/app-ready');

test.describe('Persona · Tester (destructivo)', () => {
  let consoleEvents;

  test.beforeEach(async ({ page }) => {
    consoleEvents = setupConsoleCapture(page);
  });

  test('T1 · doble-click rápido en navegación no rompe el render', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    const labels = Object.values(PANEL_LABEL);
    for (const lbl of labels) {
      const btn = page.getByRole('button', { name: new RegExp(lbl, 'i') }).first();
      await btn.dblclick({ delay: 30 });
    }
    // Después del bombardeo, la app debe seguir mostrando algo coherente.
    await expect(page.getByText('JAMC.TECH', { exact: false }).first()).toBeVisible();
    assertCleanConsole(consoleEvents);
  });

  test('T2 · cambio rápido entre paneles mid-render', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    const labels = Object.values(PANEL_LABEL);
    // Sin esperas entre clicks — debe absorber sin errores
    for (let i = 0; i < 8; i++) {
      const lbl = labels[i % labels.length];
      const btn = page.getByRole('button', { name: new RegExp(lbl, 'i') }).first();
      await btn.click({ noWaitAfter: true });
    }
    await page.waitForTimeout(800);
    await expect(page.getByText('JAMC.TECH', { exact: false }).first()).toBeVisible();
    assertCleanConsole(consoleEvents);
  });

  test('T3 · recarga mid-fetch no rompe estado siguiente', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // No esperamos a que cargue completamente — recargamos a mitad
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Ahora sí, esperamos ready
    await gotoAppAndWaitReady(page);
    await expect(page.getByText('JAMC.TECH', { exact: false }).first()).toBeVisible();
    // Consola: NO usamos assertCleanConsole strict porque la recarga cancela
    // requests in-flight → 'Failed to fetch' es ESPERADO del browser, no del sitio.
    // El criterio real es que la app se recupera y el header sigue visible (arriba).
    // Si quedan errores no relacionados a Failed to fetch, sí fallamos.
    const unexpected = consoleEvents.errors.filter(
      (e) => !/Failed to fetch|NetworkError|fetch failed|conexión vía proxy/i.test(e)
    );
    if (unexpected.length > 0) {
      throw new Error('Errores no relacionados a la recarga: ' + unexpected.join(' · '));
    }
  });

  test('T4 · red caída en endpoints del proxy: la app no crashea (degrada elegante)', async ({ page }) => {
    // Aborta TODAS las llamadas al proxy ANTES de cargar.
    await page.route('**/.netlify/functions/airtable**', (route) => route.abort('failed'));
    // Carga la página. NO usamos gotoAppAndWaitReady porque ese helper espera
    // que window.__AIRTABLE_DATA__ tenga datos — con red caída no se logra.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('boot-skel'), { timeout: 30000 });
    // El header sigue visible (datos seed de data.js como fallback)
    await expect(page.getByText('JAMC.TECH', { exact: false }).first()).toBeVisible();
    // Console-error PERMITIDO en este test (se espera que falle el load).
    // No llamamos assertCleanConsole — degradación elegante es el objetivo.
  });

  test('T5 · filtro rango con fechas inversas (hasta < desde) no rompe', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    await switchToPanel(page, 'm');
    // El TFilterBar tiene dos inputs date. Los seteamos en orden inverso.
    const dateInputs = page.locator('input[type="date"]');
    if (await dateInputs.count() >= 2) {
      await dateInputs.nth(0).fill('2026-05-20');
      await dateInputs.nth(1).fill('2026-01-01');
      await page.waitForTimeout(500);
      // La app debe seguir respondiendo (aunque el dataset filtrado sea vacío).
      await expect(page.getByText('JAMC.TECH', { exact: false }).first()).toBeVisible();
    }
    assertCleanConsole(consoleEvents);
  });
});
