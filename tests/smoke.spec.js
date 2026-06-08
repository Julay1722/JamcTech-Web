// ════════════════════════════════════════════════════════════════
// Smoke test — JAMC's Tech v3 (Vite + React).
// Login real (Supabase Auth) + cada página renderiza + KPI clave (stock sin
// LEGACY-SALE) + un round-trip de writer (crear/verificar/borrar) contra la DB.
// Requiere TEST_USER_EMAIL / TEST_USER_PASSWORD en .env (gitignored).
// ════════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL;
const PW = process.env.TEST_USER_PASSWORD;

async function login(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.SB && window.SB.auth, null, { timeout: 20000 });
  const hasSession = await page.evaluate(async () => !!(await window.SB.auth.getSession()).data.session);
  if (!hasSession) {
    const err = await page.evaluate(async ([e, p]) => {
      const { error } = await window.SB.auth.signInWithPassword({ email: e, password: p });
      return error ? error.message : null;
    }, [EMAIL, PW]);
    if (err) throw new Error('Login de test falló: ' + err);
  }
  await page.waitForSelector('.nav-item', { timeout: 20000 });
  // Esperar a que termine la carga de datos (desaparece el "Cargando datos…").
  await page.waitForFunction(() => !/Cargando datos/.test(document.body.innerText), null, { timeout: 20000 });
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PW, 'Faltan TEST_USER_EMAIL / TEST_USER_PASSWORD en .env');
  await login(page);
});

const PAGES = [
  { label: 'Resumen', h1: 'Resumen' },
  { label: 'Alertas', h1: 'Alertas' },
  { label: 'Ventas', h1: 'Ventas' },
  { label: 'Inventario', h1: 'Inventario' },
  { label: 'Finanzas', h1: 'Finanzas' },
  { label: 'Libro', h1: 'Libro contable' },
];

for (const p of PAGES) {
  test(`página "${p.label}" renderiza sin error`, async ({ page }) => {
    await page.locator('.nav-item', { hasText: p.label }).click();
    await expect(page.locator('h1')).toHaveText(p.h1);
    // No debe haber estado de error global.
    await expect(page.locator('text=Error cargando')).toHaveCount(0);
  });
}

test('Resumen: KPIs presentes y stock excluye LEGACY-SALE (KPI-1)', async ({ page }) => {
  await page.locator('.nav-item', { hasText: 'Resumen' }).click();
  await expect(page.locator('.kpi-value').first()).toContainText('RD$'); // capital líquido
  const stockTxt = await page.locator('.kpi', { hasText: 'Stock total' }).locator('.kpi-value').innerText();
  const stock = Number(stockTxt.replace(/\D/g, ''));
  // Con el bug, el stock contaba LEGACY-SALE (~18). Arreglado debe ser >> 50.
  expect(stock).toBeGreaterThan(50);
});

test('writer round-trip: crear → verificar en DB → borrar un movimiento', async ({ page }) => {
  const NOTE = 'PW-SMOKE-' + Date.now();
  // Crear vía el writer real (mismo path que los forms).
  const id = await page.evaluate(async (note) => {
    const w = await import('/src/lib/db/writers.js');
    const m = await w.createMovimiento({ fecha: '2026-06-08', tipo: 'AJUSTE', cuentaId: 1, monto: 3.21, side: 'salida', notas: note });
    return m.id;
  }, NOTE);
  expect(id).toBeTruthy();

  // Verificar la fila en Supabase.
  const row = await page.evaluate(async (mid) => {
    const { data } = await window.SB.from('movimientos').select('salida, naturaleza, notas').eq('id', mid).single();
    return data;
  }, id);
  expect(row.notas).toBe(NOTE);
  expect(Number(row.salida)).toBe(3.21);
  expect(row.naturaleza).toBe('CASHFLOW');

  // Limpiar.
  await page.evaluate(async (mid) => {
    const w = await import('/src/lib/db/writers.js');
    await w.removeMovimiento(mid);
  }, id);
  const gone = await page.evaluate(async (mid) => {
    const { data } = await window.SB.from('movimientos').select('id').eq('id', mid);
    return (data || []).length;
  }, id);
  expect(gone).toBe(0);
});
