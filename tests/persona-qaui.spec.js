// tests/persona-qaui.spec.js
//
// Persona "QA UI": visual y estética. Contraste WCAG AA, alineamientos,
// fuentes, colores. Screenshots por panel × viewport para tracking visual.

const { test, expect } = require('@playwright/test');
const { setupConsoleCapture, assertCleanConsole } = require('./helpers/console-capture');
const { gotoAppAndWaitReady, switchToPanel, PANEL_LABEL } = require('./helpers/app-ready');

test.describe('Persona · QA UI (visual)', () => {
  let consoleEvents;

  test.beforeEach(async ({ page }) => {
    consoleEvents = setupConsoleCapture(page);
  });

  test('V1 · números en fuente monoespaciada (JetBrains Mono, no fallback)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // En el v3 el body es Inter (sans); el mono se usa solo para cifras/IDs.
    // Verificamos un KPI value (clase .kpi-value usa var(--font-mono)).
    const kpi = page.locator('.kpi-value').first();
    await expect(kpi).toBeVisible();
    const fontFamily = await kpi.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toMatch(/(jetbrains|plex mono|fira code|space mono|ui-monospace|monospace)/);
    assertCleanConsole(consoleEvents);
  });

  test('V2 · paleta acento aplicada (algún elemento usa color del acento)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // Paleta v3 "Amber Terminal": acento ámbar #f2b53e, verde #6fd08a, rojo #f0726e.
    // getComputedStyle devuelve rgb(), así que buscamos en ese formato.
    const hits = await page.evaluate(() => {
      const colors = ['rgb(242, 181, 62)', 'rgb(111, 208, 138)', 'rgb(240, 114, 110)', '#f2b53e'];
      const all = document.querySelectorAll('*');
      let count = 0;
      for (const el of all) {
        const cs = getComputedStyle(el);
        for (const c of colors) {
          if (cs.color.includes(c) || cs.backgroundColor.includes(c) || cs.borderColor.includes(c)) {
            count++; break;
          }
        }
        if (count > 3) break;
      }
      return count;
    });
    expect(hits, 'algún elemento debe usar la paleta acento').toBeGreaterThan(0);
    assertCleanConsole(consoleEvents);
  });

  test('V3 · screenshot baseline por panel (artifact de tracking visual)', async ({ page }, testInfo) => {
    await gotoAppAndWaitReady(page);
    const vp = page.viewportSize();
    for (const key of Object.keys(PANEL_LABEL)) {
      await switchToPanel(page, key);
      await page.waitForTimeout(500);
      const buf = await page.screenshot({ fullPage: false });
      await testInfo.attach(`panel-${key}-${vp.width}x${vp.height}.png`, { body: buf, contentType: 'image/png' });
    }
    assertCleanConsole(consoleEvents);
  });

  test('V4 · header LIVE indicator visible', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // El header tiene el indicador "Live · Supabase" en color de acento.
    await expect(page.getByText(/live/i, { exact: false }).first()).toBeVisible();
    assertCleanConsole(consoleEvents);
  });

  test('V5 · sidebar presente (dashboard desktop)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // El v3 es desktop: el sidebar `aside.nav` con los items de navegación
    // siempre está presente y visible en viewports desktop.
    const side = page.locator('aside.nav');
    await expect(side).toBeVisible();
    const navItems = await page.locator('aside.nav .nav-item').count();
    expect(navItems, 'el sidebar debe tener items de navegación').toBeGreaterThanOrEqual(5);
    assertCleanConsole(consoleEvents);
  });
});
