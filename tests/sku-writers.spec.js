// tests/sku-writers.spec.js
//
// Tarea C · §8.3 — Persistencia SKUs a Airtable.
// Smoke E2E directo contra los helpers AT_CLIENT.createSKU / updateSKU /
// removeSKU. No depende de la UI — verifica que el cliente persiste y
// rehidrata el cache local correctamente.
//
// Higiene Airtable (§7.4): todos los records llevan prefijo TEST- y
// se borran al final (incluso si las aserciones fallan).

const { test, expect } = require('@playwright/test');
const { gotoAppAndWaitReady } = require('./helpers/app-ready');
const { setupConsoleCapture, assertCleanConsole } = require('./helpers/console-capture');

const STAMP = Date.now().toString().slice(-8);
const TEST_PREFIX = `TEST-SKU-${STAMP}`;

test.describe('Tarea C · SKU writers (createSKU / updateSKU / removeSKU)', () => {
  test('CRUD ciclo completo · cache local sincronizado · sin errores consola', async ({ page }, testInfo) => {
    const consoleEvents = setupConsoleCapture(page);
    await gotoAppAndWaitReady(page);

    // ─── CREATE ───
    const skuId = `${TEST_PREFIX}-NEG`;
    const created = await page.evaluate(async (id) => {
      try {
        const res = await window.AT_CLIENT.createSKU({
          id,
          nm: 'Test SKU Playwright',
          mk: 'PLAYWRIGHT',
          modelo: 'CYC2',
          color: 'Negro',
          cat: 'Otro',
          pv: 999,
        });
        return { ok: true, res };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }, skuId);
    expect(created.ok, `createSKU falló: ${created.msg}`).toBe(true);
    expect(created.res._airtableId).toBeTruthy();
    expect(created.res.id).toBe(skuId);

    // Cache local: el SKU recién creado debe estar en window.__AIRTABLE_DATA__.skus
    const inCacheAfterCreate = await page.evaluate((id) =>
      (window.__AIRTABLE_DATA__?.skus || []).some((s) => s.id === id),
      skuId,
    );
    expect(inCacheAfterCreate).toBe(true);

    // ─── UPDATE ───
    const updated = await page.evaluate(async (airtableId) => {
      try {
        const res = await window.AT_CLIENT.updateSKU(airtableId, {
          nm: 'Test SKU Renamed',
          pv: 1500,
          cat: 'Mouse',
        });
        return { ok: true, res };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }, created.res._airtableId);
    expect(updated.ok, `updateSKU falló: ${updated.msg}`).toBe(true);
    expect(updated.res.nm).toBe('Test SKU Renamed');
    expect(Number(updated.res.pv)).toBe(1500);

    // Cache local: reflexión inmediata del cambio
    const cacheRow = await page.evaluate((airtableId) => {
      const row = (window.__AIRTABLE_DATA__?.skus || []).find((s) => s._airtableId === airtableId);
      return row ? { nm: row.nm, pv: row.pv, cat: row.cat } : null;
    }, created.res._airtableId);
    expect(cacheRow.nm).toBe('Test SKU Renamed');

    // ─── REMOVE ───
    const removed = await page.evaluate(async (airtableId) => {
      try {
        const res = await window.AT_CLIENT.removeSKU(airtableId);
        return { ok: true, res };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }, created.res._airtableId);
    expect(removed.ok, `removeSKU falló: ${removed.msg}`).toBe(true);
    expect(removed.res.deleted).toBe(true);

    // Cache local: el SKU desapareció
    const stillInCache = await page.evaluate((airtableId) =>
      (window.__AIRTABLE_DATA__?.skus || []).some((s) => s._airtableId === airtableId),
      created.res._airtableId,
    );
    expect(stillInCache).toBe(false);

    // ─── Aserción consola limpia (§6 #15) ───
    assertCleanConsole(consoleEvents);
  });

  test('createSKU rechaza categoría inválida (singleSelect strict)', async ({ page }) => {
    await gotoAppAndWaitReady(page);
    const res = await page.evaluate(async () => {
      try {
        await window.AT_CLIENT.createSKU({
          id: 'TEST-SKU-INVALID-CAT',
          nm: 'Should fail',
          mk: 'PW',
          cat: 'Mousepad', // no existe en Airtable singleSelect
        });
        return { threw: false };
      } catch (e) {
        return { threw: true, msg: e.message };
      }
    });
    expect(res.threw).toBe(true);
    expect(res.msg).toMatch(/categoría/i);
  });

  // Cleanup defensivo: si algún test anterior dejó un TEST-SKU- colgando
  // (por timeout, expect fail, etc.), borrarlo antes de salir.
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await gotoAppAndWaitReady(page);
      const orphans = await page.evaluate(async (prefix) => {
        const skus = window.__AIRTABLE_DATA__?.skus || [];
        const targets = skus.filter((s) => (s.id || '').startsWith(prefix));
        const results = [];
        for (const s of targets) {
          try {
            await window.AT_CLIENT.removeSKU(s._airtableId);
            results.push({ id: s.id, deleted: true });
          } catch (e) {
            results.push({ id: s.id, deleted: false, err: e.message });
          }
        }
        return results;
      }, TEST_PREFIX);
      if (orphans.length > 0) {
        console.log(`[cleanup] removed ${orphans.length} TEST-SKU records: ${JSON.stringify(orphans)}`);
      }
    } finally {
      await page.close();
    }
  });
});
