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

  test('V1 · fuente monoespaciada cargada (IBM Plex Mono o similar, no fallback)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    const body = page.locator('body');
    const fontFamily = await body.evaluate((el) => getComputedStyle(el).fontFamily);
    // Espera ver IBM Plex Mono, JetBrains Mono, Fira Code o Space Mono.
    // Per §5 regla 6 el theme dice "Space Mono" pero el código default es IBM Plex Mono.
    expect(fontFamily.toLowerCase()).toMatch(/(plex mono|jetbrains|fira code|space mono|ui-monospace)/);
    assertCleanConsole(consoleEvents);
  });

  test('V2 · paleta acento aplicada (algún elemento usa color del acento)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    // El color acento default es lime: #c8ff2e
    // Busca cualquier elemento con ese color (o sus variantes) en estilos computados.
    const hits = await page.evaluate(() => {
      const colors = ['#c8ff2e', '#ffb340', '#5fd0ff', '#ff5563', 'rgb(200, 255, 46)'];
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
    // El header tiene un texto "LIVE" en color de acento; verificar visible.
    await expect(page.getByText(/LIVE/, { exact: false }).first()).toBeVisible();
    assertCleanConsole(consoleEvents);
  });

  test('V5 · sidebar/tabs presentes según viewport', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    const vw = page.viewportSize().width;
    // El código en app.jsx hace: isMobile = window.innerWidth < 860.
    // Mobile: muestra TerminalMobileTabs. Desktop: muestra TerminalSidebar.
    const mobBtn = await page.locator('.term-mobtabs').count();
    const sideBtn = await page.locator('.term-sidebar').count();
    if (vw < 860) {
      expect(mobBtn, 'mobile debe mostrar TerminalMobileTabs').toBeGreaterThan(0);
    } else {
      expect(sideBtn, 'desktop debe mostrar TerminalSidebar').toBeGreaterThan(0);
    }
    assertCleanConsole(consoleEvents);
  });
});
