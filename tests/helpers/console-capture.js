// tests/helpers/console-capture.js
//
// Captura console.* events de la página y los expone para aserciones.
// Falla el test si aparece un error o warning no-whitelisted (§6 #15).

// Warnings esperados por la arquitectura del proyecto (§5 regla 1: Babel
// in-browser sin build step). Estos NO cuentan como fallo.
const KNOWN_WARNINGS = [
  /You are using the in-browser Babel transformer/i,
  /Download the React DevTools/i,
  /React DevTools/i,
  // 'A future version of React' warnings que aparecen en dev mode
  /future version of React/i,
];

// Errores NUNCA whitelistados por default — todos cuentan como fallo.
// Si descubrimos un error real que debe ser ignorado, lo añadimos aquí
// con comentario justificando.
const KNOWN_ERRORS = [];

function setupConsoleCapture(page, extra = {}) {
  const events = {
    errors: [],    // errors significativos (no whitelisted)
    warnings: [],  // warnings significativos (no whitelisted)
    all: [],       // todos los console events (para debugging)
    pageErrors: [],
  };
  const errAllow = [...KNOWN_ERRORS, ...(extra.allowErrors || [])];
  const warnAllow = [...KNOWN_WARNINGS, ...(extra.allowWarnings || [])];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    events.all.push({ type, text });
    if (type === 'error' && !errAllow.some((re) => re.test(text))) {
      events.errors.push(text);
    }
    if (type === 'warning' && !warnAllow.some((re) => re.test(text))) {
      events.warnings.push(text);
    }
  });
  page.on('pageerror', (err) => {
    events.pageErrors.push(`${err.name}: ${err.message}`);
  });

  return events;
}

// Aserción usable en tests: si hay errores/warnings, falla con un dump
// legible. Se llama explícitamente al final de cada test.
function assertCleanConsole(events, { allowWarnings = false } = {}) {
  const problems = [];
  if (events.errors.length > 0) {
    problems.push(`${events.errors.length} console.error:\n  · ` + events.errors.join('\n  · '));
  }
  if (events.pageErrors.length > 0) {
    problems.push(`${events.pageErrors.length} pageerror:\n  · ` + events.pageErrors.join('\n  · '));
  }
  if (!allowWarnings && events.warnings.length > 0) {
    problems.push(`${events.warnings.length} console.warning:\n  · ` + events.warnings.join('\n  · '));
  }
  if (problems.length > 0) {
    throw new Error('Console no limpia:\n' + problems.join('\n'));
  }
}

module.exports = { setupConsoleCapture, assertCleanConsole, KNOWN_WARNINGS, KNOWN_ERRORS };
