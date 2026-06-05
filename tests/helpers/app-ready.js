// tests/helpers/app-ready.js
//
// Helpers para esperar a que la app esté lista. El sitio carga React + Babel
// + JSX in-browser y luego dispara loads de Airtable. "Listo" significa:
//   1. React montó el TerminalApp (el boot-skel desapareció)
//   2. El header con texto "JAMC.TECH" es visible
//   3. Al menos una tabla de Airtable terminó de cargar (window.__AIRTABLE_DATA__)

// Inicia sesión con el usuario de test (Supabase Auth) antes de cargar datos.
// Credenciales desde env (NUNCA hardcodeadas): TEST_USER_EMAIL / TEST_USER_PASSWORD.
// El dashboard ahora gatea los loaders detrás del login, así que sin esto los
// tests se quedan en la pantalla de acceso y __AIRTABLE_DATA__ nunca carga.
async function ensureLogin(page) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Faltan credenciales de test. Crea un usuario en Supabase Auth solo para tests ' +
      'y define TEST_USER_EMAIL y TEST_USER_PASSWORD (en .env, que está gitignored). ' +
      'Ver tests/README-AUTH.md.'
    );
  }
  // Espera a que el cliente Supabase + AT_CLIENT estén listos.
  await page.waitForFunction(
    () => window.AT_CLIENT && typeof window.AT_CLIENT.signIn === 'function',
    undefined,
    { timeout: 20000 }
  );
  // ¿Ya hay sesión? (puede persistir en localStorage del contexto)
  const hasSession = await page.evaluate(async () => {
    const { data } = await window.AT_CLIENT.getSession();
    return !!(data && data.session);
  });
  if (!hasSession) {
    const errMsg = await page.evaluate(async ([e, p]) => {
      const { error } = await window.AT_CLIENT.signIn(e, p);
      return error ? error.message : null;
    }, [email, password]);
    if (errMsg) throw new Error('Login de test falló: ' + errMsg);
  }
}

async function gotoAppAndWaitReady(page, path = '/') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // Login (gate de auth) — sin esto los loaders no corren.
  await ensureLogin(page);
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

// Cambia al panel indicado. El dashboard v3 (index.html) renderea el sidebar
// con items `.nav-item` (divs clicables) cuyos labels son Resumen, Alertas,
// Ventas, Inventario, Finanzas. Las keys históricas m/i/n/r/f se mapean:
//   m=Resumen · i=Inventario · n=Finanzas · r=Alertas · f=Ventas
const PANEL_LABEL = { m: 'Resumen', i: 'Inventario', n: 'Finanzas', r: 'Alertas', f: 'Ventas' };

async function switchToPanel(page, key) {
  const label = PANEL_LABEL[key];
  if (!label) throw new Error(`panel desconocido: ${key}`);
  // Scope al sidebar para no chocar con el mismo texto en el contenido.
  await page.locator('aside.nav .nav-item', { hasText: label }).first().click();
  // Esperar a que el contenido del panel renderice (heurística simple)
  await page.waitForTimeout(400);
}

module.exports = { gotoAppAndWaitReady, ensureLogin, airtableSnapshot, switchToPanel, PANEL_LABEL };
