// Sondeo ad-hoc para identificar overflow horizontal en viewport mobile.
// Navega por los 5 paneles, espera asentamiento, y reporta culprits por panel.
const { chromium } = require('@playwright/test');

const PANELS = [
  { key: 'm', label: 'MANDO' },
  { key: 'i', label: 'INVENT' },
  { key: 'n', label: 'FINANC' },
  { key: 'r', label: 'RADAR' },
  { key: 'f', label: 'VENTAS' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 720 } });
  const page = await ctx.newPage();
  await page.goto('https://jamcs-tech.netlify.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('boot-skel'), { timeout: 30000 });
  await page.waitForFunction(
    () => window.__AIRTABLE_DATA__ && window.__AIRTABLE_DATA__.skus && window.__AIRTABLE_DATA__.cashflow,
    { timeout: 30000 }
  );

  for (const p of PANELS) {
    try {
      const btn = page.getByRole('button', { name: new RegExp(p.label, 'i') }).first();
      await btn.click();
    } catch (e) { /* tab not visible */ }
    await page.waitForTimeout(2000);
    const wide = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const items = [];
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > docW + 10) {
          items.push({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 50),
            w: Math.round(r.width),
            right: Math.round(r.right),
            text: (el.innerText || '').slice(0, 50).replace(/\s+/g, ' '),
          });
        }
      });
      return { docW, scrollW: document.documentElement.scrollWidth, items: items.slice(0, 8) };
    });
    console.log(`--- ${p.label} (${p.key}) · docW=${wide.docW} scrollW=${wide.scrollW} ---`);
    for (const it of wide.items) {
      console.log(`  ${it.tag}.${it.cls} w=${it.w} right=${it.right}  "${it.text}"`);
    }
  }
  await browser.close();
})();
