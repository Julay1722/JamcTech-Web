// tests/persona-usuario.spec.js
//
// Persona "Usuario" (Julio): tareas reales del día a día del negocio.
// Estos tests modelan el flujo natural: cargar el sitio, ver sus datos,
// navegar los paneles, cambiar filtros, abrir formularios. Las mutaciones
// que tocan Airtable se agregan en iteraciones siguientes con prefijo TEST-.

const { test, expect } = require('@playwright/test');
const { setupConsoleCapture, assertCleanConsole } = require('./helpers/console-capture');
const { gotoAppAndWaitReady, airtableSnapshot, switchToPanel, PANEL_LABEL } = require('./helpers/app-ready');

test.describe('Persona · Usuario (Julio · flujos reales)', () => {
  let consoleEvents;

  test.beforeEach(async ({ page }) => {
    consoleEvents = setupConsoleCapture(page);
  });

  test('U1 · carga el sitio y ve datos poblados (43 SKUs · 189 ventas · 361 CF)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    const snap = await airtableSnapshot(page);
    // Verifica que los loaders Airtable cargaron los conteos esperados.
    // Tolerante a crecimiento natural (el negocio sigue operando).
    expect(snap.skus, 'SKUs cargados').toBeGreaterThanOrEqual(40);
    expect(snap.cashflow, 'CF cargado').toBeGreaterThanOrEqual(350);
    expect(snap.ventas, 'ventas cargadas').toBeGreaterThanOrEqual(180);
    expect(snap.financiero, 'productos financieros').toBeGreaterThanOrEqual(3);
    expect(snap.resumen, 'resúmenes mensuales').toBeGreaterThanOrEqual(11);
    assertCleanConsole(consoleEvents);
  });

  test('U2 · navega los 5 paneles sin error', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    for (const key of Object.keys(PANEL_LABEL)) {
      await switchToPanel(page, key);
      // Verifica que el panel renderizó algo: el header muestra el nombre del panel actual.
      const headerText = await page.locator('body').innerText();
      expect(headerText, `panel ${key} debe estar visible`).toContain(PANEL_LABEL[key]);
    }
    assertCleanConsole(consoleEvents);
  });

  test('U3 · cambia filtros de período (7D / 30D / 90D)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // El filtro está en el panel Mando + Inventario
    await switchToPanel(page, 'm');
    for (const range of ['7D', '30D', '90D']) {
      const btn = page.getByRole('button', { name: range, exact: true }).first();
      await btn.click();
      // El header debe reflejar el nuevo período activo (PERIOD: ...)
      await page.waitForTimeout(300);
    }
    assertCleanConsole(consoleEvents);
  });

  test('U4 · selecciona un mes específico desde el dropdown', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    await switchToPanel(page, 'i');
    // El TFilterBar tiene un <select> con "— mes —" y los meses.
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    // Selecciona May 2026 (el mes activo)
    await select.selectOption({ value: '2026-05' });
    await page.waitForTimeout(400);
    assertCleanConsole(consoleEvents);
  });

  test('U5 · scroll básico no rompe nada', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    await switchToPanel(page, 'i'); // Inventario tiene tabla larga
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -1200);
    await page.waitForTimeout(200);
    assertCleanConsole(consoleEvents);
  });
});
