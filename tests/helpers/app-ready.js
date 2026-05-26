// tests/helpers/app-ready.js
//
// Helpers para esperar a que la app esté lista. El sitio carga React + Babel
// + JSX in-browser y luego dispara loads de Airtable. "Listo" significa:
//   1. React montó el TerminalApp (el boot-skel desapareció)
//   2. El header con texto "JAMC.TECH" es visible
//   3. Al menos una tabla de Airtable terminó de cargar (window.__AIRTABLE_DATA__)

async function gotoAppAndWaitReady(page, path = '/') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // Esperar a que el boot skeleton se reemplace por el TerminalApp.
  // OJO: page.waitForFunction(pageFunction, arg, options) — el 2do arg
  // es `arg` no `options`. Para timeout custom hay que pasar arg=undefined
  // explícitamente. Hacer { timeout:N } como 2do arg lo trata como `arg`
  // serializable y silenciosamente usa el actionTimeout (12s) del config.
  await page.waitForFunction(
    () => !document.getElementById('boot-skel'),
    undefined,
    { timeout: 45000 }
  );
  // Espera a que aparezca el header con JAMC.TECH (waitFor recibe options
  // como primer arg, así que aquí sí funciona la forma corta).
  await page.getByText('JAMC.TECH', { exact: false }).first().waitFor({ timeout: 30000 });
  // Espera a que al menos las tablas críticas hayan cargado de Airtable.
  // 60s defensivo: netlify dev es single-threaded y 6+ calls a Airtable
  // por test load saturan el proxy local en tests seriales largos. Contra
  // CDN producción esto resuelve en <5s típicamente.
  await page.waitForFunction(
    () => {
      const d = window.__AIRTABLE_DATA__;
      return d && d.skus && d.cashflow && d.ventas;
    },
    undefined,
    { timeout: 60000 }
  );
}

// Lee el snapshot actual de Airtable desde window (útil para aserciones
// sobre cantidades de records sin depender de la UI).
async function airtableSnapshot(page) {
  return page.evaluate(() => {
    const d = window.__AIRTABLE_DATA__ || {};
    return {
      skus:       (d.skus || []).length,
      ventas:     (d.ventas || []).length,
      lotes:      (d.lotes || []).length,
      cashflow:   (d.cashflow || []).length,
      financiero: (d.financiero || []).length,
      resumen:    (d.resumen || []).length,
    };
  });
}

// Cambia al panel indicado (m=Mando, i=Inventario, n=Financiero, r=Radar, f=Ventas).
// El TerminalSidebar / TerminalMobileTabs renderea botones con los textos
// MANDO, INVENT, FINANC, RADAR, VENTAS.
const PANEL_LABEL = { m: 'MANDO', i: 'INVENT', n: 'FINANC', r: 'RADAR', f: 'VENTAS' };

async function switchToPanel(page, key) {
  const label = PANEL_LABEL[key];
  if (!label) throw new Error(`panel desconocido: ${key}`);
  await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
  // Esperar a que el contenido del panel renderice (heurística simple)
  await page.waitForTimeout(400);
}

module.exports = { gotoAppAndWaitReady, airtableSnapshot, switchToPanel, PANEL_LABEL };
