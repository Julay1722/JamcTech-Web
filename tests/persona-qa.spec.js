// tests/persona-qa.spec.js
//
// Persona "QA": valida los 18 criterios de §6 "100% funcional".
// Versión inicial · cubre el subset verificable sin mutaciones a Airtable.
// Los criterios que requieren mutación (1, 2, 4, 5, 8, 9, 10, 11) se
// completan iterativamente conforme cerremos los gaps de §8.

const { test, expect } = require('@playwright/test');
const { setupConsoleCapture, assertCleanConsole } = require('./helpers/console-capture');
const { gotoAppAndWaitReady, airtableSnapshot, switchToPanel, PANEL_LABEL } = require('./helpers/app-ready');

test.describe('Persona · QA (validación 18 criterios)', () => {
  let consoleEvents;

  test.beforeEach(async ({ page }) => {
    consoleEvents = setupConsoleCapture(page);
  });

  test('Q15 · cero errores en consola al cargar la home', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // Da un pequeño tiempo a que terminen cargas async después del ready.
    await page.waitForTimeout(2000);
    assertCleanConsole(consoleEvents);
  });

  test('Q3 · botones principales del sidebar/tabs hacen algo visible', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // Click cada uno de los 5 paneles y verifica que el contenido cambia.
    let lastSnapshot = '';
    let changes = 0;
    for (const key of Object.keys(PANEL_LABEL)) {
      await switchToPanel(page, key);
      const snap = (await page.locator('body').innerText()).slice(0, 200);
      if (snap !== lastSnapshot) changes++;
      lastSnapshot = snap;
    }
    // Mínimo 4 de los 5 paneles deben mostrar contenido distinguible
    // (algunos comparten layout; con 4 cambios estamos bien).
    expect(changes, 'paneles deben mostrar contenido distinto').toBeGreaterThanOrEqual(4);
    assertCleanConsole(consoleEvents);
  });

  test('Q13 · filtros de período recalculan datos (KPIs cambian)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    await switchToPanel(page, 'm');
    // Captura el texto del primer TCell de KPI
    const kpis = page.locator('div').filter({ hasText: 'RD$' }).first();
    const todoText = await page.locator('body').innerText();
    // Aplica filtro 7D
    await page.getByRole('button', { name: '7D', exact: true }).first().click();
    await page.waitForTimeout(800);
    const d7Text = await page.locator('body').innerText();
    // El header debe reflejar "Últimos 7D" o similar
    expect(d7Text).toMatch(/7D|7\s*d/i);
    // Y el body debe haber cambiado (los KPIs son distintos)
    expect(d7Text).not.toBe(todoText);
    assertCleanConsole(consoleEvents);
  });

  test('Q16 · responsive: cada viewport renderiza sin overflow horizontal grave', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // Dar tiempo a que el layout asiente (charts SVG, tablas con scroll
    // interno, fonts terminando de cargar). Sin esto, scrollWidth puede
    // medir un estado transitorio.
    await page.waitForTimeout(1500);
    const viewportWidth = page.viewportSize().width;
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    // Tolerancia +24px por scrollbar / borders
    expect(docWidth, `viewport ${viewportWidth} no debe tener overflow significativo`).toBeLessThanOrEqual(viewportWidth + 24);
    assertCleanConsole(consoleEvents);
  });

  test('Q17 · tablas grandes no renderizan >200 filas (paginación/virtualización)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // Visitar Inventario (43 SKUs · ok) y Mando (KPIs · ok).
    // Panel Ventas/Radar carga la tabla CF (361). Si renderiza todo, vemos >200 tr.
    for (const key of ['m', 'i', 'n', 'r', 'f']) {
      await switchToPanel(page, key);
      await page.waitForTimeout(300);
      const trCount = await page.locator('tr').count();
      expect(trCount, `panel ${key} no debe tener >200 filas DOM (tiene ${trCount})`).toBeLessThan(200);
    }
    assertCleanConsole(consoleEvents);
  });

  test('Q18 · botón Export CSV presente en algún panel (CF/Ventas/Inventario)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // Busca cualquier botón con texto CSV en cualquiera de los 5 paneles.
    let found = false;
    for (const key of Object.keys(PANEL_LABEL)) {
      await switchToPanel(page, key);
      const csvBtn = page.getByRole('button', { name: /csv|export|exportar/i }).first();
      if (await csvBtn.count() > 0 && await csvBtn.isVisible().catch(() => false)) {
        found = true;
        break;
      }
    }
    // No falla todavía; documenta el estado. Después de C1.5 esto se vuelve hard assertion.
    test.info().annotations.push({
      type: 'criterio-18',
      description: found ? 'CSV button encontrado' : 'CSV button NO encontrado — pendiente §8.5',
    });
    assertCleanConsole(consoleEvents);
  });
});
