// tests/lote-writers.spec.js
//
// Tarea A · §8.1 — Entradas/Lotes edit+delete vía AT_CLIENT y UI.
// Cubre:
//   1. updateLoteHeader / removeLote / removeEntrada / updateEntrada
//   2. Cache local sincronizado tras cada operación
//   3. UI: el tab "HISTÓRICO LOTES" aparece en panel Inventario y lista lotes

const { test, expect } = require('@playwright/test');
const { gotoAppAndWaitReady } = require('./helpers/app-ready');
const { setupConsoleCapture, assertCleanConsole } = require('./helpers/console-capture');

const STAMP = Date.now().toString().slice(-8);
const TEST_LOTE_ID = `TEST-LOTE-${STAMP}`;

// helper: localiza el primer SKU real para asociar con el lote test
async function pickAnySKU(page) {
  return page.evaluate(() => {
    const s = (window.__AIRTABLE_DATA__?.skus || []).find((x) => x._airtableId);
    if (!s) throw new Error('no hay SKUs en cache para asociar al lote test');
    return { id: s.id, airtableId: s._airtableId, nm: s.nm };
  });
}

test.describe('Tarea A · Lotes writers (createLote / updateLoteHeader / removeLote)', () => {
  test('CRUD lote multi-SKU · cache sincronizado · consola limpia', async ({ page }) => {
    const consoleEvents = setupConsoleCapture(page);
    await gotoAppAndWaitReady(page);

    const sku = await pickAnySKU(page);

    // ─── CREATE lote multi-line (2 SKUs same record · usa el mismo SKU 2 veces
    //     para no depender de un 2do SKU específico) ───
    const created = await page.evaluate(async ({ loteId, skuId }) => {
      try {
        const res = await window.AT_CLIENT.createLote({
          loteId,
          fecha: '2026-05-25',
          status: 'En Camino',
          lineas: [
            { skuId, qty: 5, costoUd: 100 },
            { skuId, qty: 3, costoUd: 110 },
          ],
          envio:   50,
          courier: 80,
          otros:   20,
          nota: '[PLAYWRIGHT-TARA-A] lote test',
        });
        return { ok: true, res };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }, { loteId: TEST_LOTE_ID, skuId: sku.id });
    expect(created.ok, `createLote falló: ${created.msg}`).toBe(true);
    expect(created.res.loteId).toBe(TEST_LOTE_ID);
    expect(created.res.airtableIds).toHaveLength(2);

    // Cache local: el lote y sus 2 líneas
    const cacheAfterCreate = await page.evaluate((loteId) => {
      const lotes = window.__AIRTABLE_DATA__?.lotes || [];
      const l = lotes.find((x) => x.id === loteId);
      return l ? { id: l.id, status: l.status, skus: l.skus.length } : null;
    }, TEST_LOTE_ID);
    expect(cacheAfterCreate).toEqual({ id: TEST_LOTE_ID, status: 'En Camino', skus: 2 });

    // ─── UPDATE header (status + notas + envio) propaga a TODAS las líneas ───
    const updated = await page.evaluate(async (loteId) => {
      try {
        const res = await window.AT_CLIENT.updateLoteHeader(loteId, {
          status: 'Recibido',
          envio: 150,
          notas: '[PLAYWRIGHT-TARA-A] lote test · actualizado',
        });
        return { ok: true, res };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }, TEST_LOTE_ID);
    expect(updated.ok, `updateLoteHeader falló: ${updated.msg}`).toBe(true);
    expect(updated.res.updatedCount).toBe(2);

    const cacheAfterUpdate = await page.evaluate((loteId) => {
      const l = (window.__AIRTABLE_DATA__?.lotes || []).find((x) => x.id === loteId);
      return l ? { status: l.status, envio: l.envio, pendiente: l.pendiente } : null;
    }, TEST_LOTE_ID);
    expect(cacheAfterUpdate.status).toBe('Recibido');
    expect(cacheAfterUpdate.envio).toBe(150);
    // envio>0 → ya no debe estar en pendiente
    expect(cacheAfterUpdate.pendiente).not.toContain('envio');

    // ─── REMOVE lote completo ───
    const removed = await page.evaluate(async (loteId) => {
      try {
        const res = await window.AT_CLIENT.removeLote(loteId);
        return { ok: true, res };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }, TEST_LOTE_ID);
    expect(removed.ok, `removeLote falló: ${removed.msg}`).toBe(true);
    expect(removed.res.deletedCount).toBe(2);

    const stillInCache = await page.evaluate((loteId) =>
      (window.__AIRTABLE_DATA__?.lotes || []).some((l) => l.id === loteId),
      TEST_LOTE_ID,
    );
    expect(stillInCache).toBe(false);

    assertCleanConsole(consoleEvents);
  });

  test('UI · tab Lotes visible en panel Inventario y lista lotes (v3)', async ({ page }) => {
    await gotoAppAndWaitReady(page);

    // Cambia al panel Inventario (sidebar v3 = items .nav-item)
    await page.locator('aside.nav .nav-item', { hasText: 'Inventario' }).first().click();
    // Click en el tab "Lotes" del strip de tabs del v3
    const tabBtn = page.locator('.tabs .tab', { hasText: /^Lotes/ }).first();
    await expect(tabBtn).toBeVisible({ timeout: 15000 });
    await tabBtn.click();
    // La tabla lista lotes con código L-YYYYMMDD-N
    await expect(page.getByText(/L-2026\d{4}-\d+/).first()).toBeVisible({ timeout: 10000 });
    // El buscador del tab existe
    await expect(page.getByPlaceholder(/buscar/i).first()).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await gotoAppAndWaitReady(page);
      // Defensive cleanup: cualquier TEST-LOTE-* huérfano
      const orphans = await page.evaluate(async () => {
        const lotes = window.__AIRTABLE_DATA__?.lotes || [];
        const targets = lotes.filter((l) => (l.id || '').startsWith('TEST-LOTE-'));
        const results = [];
        for (const l of targets) {
          try {
            await window.AT_CLIENT.removeLote(l.id);
            results.push({ id: l.id, deleted: true });
          } catch (e) {
            results.push({ id: l.id, deleted: false, err: e.message });
          }
        }
        return results;
      });
      if (orphans.length > 0) {
        console.log(`[cleanup] removed ${orphans.length} TEST-LOTE records: ${JSON.stringify(orphans)}`);
      }
    } finally {
      await page.close();
    }
  });
});
