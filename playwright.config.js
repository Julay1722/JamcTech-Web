// ════════════════════════════════════════════════════════════════
// playwright.config.js — JAMC's Tech v3 (Vite + React) · ESM
// Corre solo el smoke test nuevo (tests/smoke.spec.js). Los specs viejos
// (persona-*, *-writers) eran del monolito (window.AT_CLIENT) y no aplican.
// Credenciales del usuario de test desde .env (gitignored): TEST_USER_*.
// ════════════════════════════════════════════════════════════════
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const PORT = 1722;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/smoke.spec.js',
  timeout: 40000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
