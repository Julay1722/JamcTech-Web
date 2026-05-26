// ════════════════════════════════════════════════════════════════
// playwright.config.js — JAMC's Tech testing harness
//
// Per PROMPT_RECONSTRUCCION.md §7.3:
//   - 2 browsers (Chromium puro + Chromium-as-Brave con flags)
//   - 4 viewports (375 mobile · 768 tablet · 1280 desktop · 1920 wide)
//   - baseURL: producción Netlify
//   - trace on-first-retry, screenshot only-on-failure
//   - console events capturados en un fixture por test
// ════════════════════════════════════════════════════════════════

const { defineConfig, devices } = require('@playwright/test');

const VIEWPORTS = [
  { tag: '375',  width: 375,  height: 720  }, // móvil
  { tag: '768',  width: 768,  height: 1024 }, // tablet
  { tag: '1280', width: 1280, height: 800  }, // desktop estándar
  { tag: '1920', width: 1920, height: 1080 }, // wide
];

// Flags que aproximan el perfil de Brave (Chromium fork con shields). En CI
// puro no podemos correr Brave nativo, pero estos flags replican lo más
// relevante: deshabilitar features de background y default apps.
const BRAVE_LIKE_FLAGS = [
  '--disable-features=Translate',
  '--disable-default-apps',
  '--disable-background-networking',
];

const BROWSERS = [
  { tag: 'chromium', launchOptions: {} },
  { tag: 'brave',    launchOptions: { args: BRAVE_LIKE_FLAGS } },
];

const projects = [];
for (const b of BROWSERS) {
  for (const v of VIEWPORTS) {
    projects.push({
      name: `${b.tag}-${v.tag}`,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: v.width, height: v.height },
        launchOptions: b.launchOptions,
      },
    });
  }
}

// Contra producción Netlify (CDN, no contention) podemos paralelizar agresivo.
// Contra netlify dev local (single-threaded), N workers saturan el server y
// generan flakiness por contention — mejor 1 worker secuencial.
const RUNS_LOCAL = !process.env.JAMC_BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: !RUNS_LOCAL,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: RUNS_LOCAL ? 1 : (process.env.CI ? 2 : undefined),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    // Default: localhost (netlify dev), para iteración rápida sin gastar
    // build credits. Para correr contra producción: JAMC_BASE_URL=https://jamcs-tech.netlify.app npx playwright test.
    baseURL: process.env.JAMC_BASE_URL || 'http://localhost:8888',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 12000,
    navigationTimeout: 45000,
    ignoreHTTPSErrors: false,
  },
  expect: {
    timeout: 8000,
  },
  projects,
  outputDir: 'test-results/artifacts',
});
