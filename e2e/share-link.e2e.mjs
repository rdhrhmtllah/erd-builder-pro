// Share-link smoke test in a fresh (incognito) browser context per case.
// Usage: BASE=https://host PUBLIC_ERD=<uid> PUBLIC_DRAWING=<uid> PRIVATE_ERD=<uid> \
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node e2e/share-link.e2e.mjs
// ponytail: plain node + playwright-core, no test runner; move to @playwright/test when E2E grows.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const { BASE, PUBLIC_ERD, PUBLIC_DRAWING, PRIVATE_ERD } = process.env;
assert(BASE && PUBLIC_ERD && PRIVATE_ERD, 'set BASE, PUBLIC_ERD, PRIVATE_ERD');

const browser = await chromium.launch();
async function visit(path, { reload = false } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let fetches = 0;
  page.on('request', r => { if (/\/api\/\w+\/public\//.test(r.url())) fetches++; });
  await page.goto(BASE + path);
  // If guest join dialog appears on public view, click Skip or Join
  const joinBtn = page.locator("button:has-text('Skip'), button:has-text('Join')").first();
  if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await joinBtn.click();
  }
  if (reload) { await page.waitForTimeout(4000); await page.reload(); }
  await page.waitForTimeout(12000); // past the old 3-5 s loop period
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await ctx.close();
  return { body, fetches };
}
const cases = [
  ['public ERD renders without login', `/view/diagram/${PUBLIC_ERD}`, {}, r => !/Loading shared|\b404\b/.test(r.body) && /Jump to Table/.test(r.body)],
  ['public ERD survives refresh', `/view/diagram/${PUBLIC_ERD}`, { reload: true }, r => /Jump to Table/.test(r.body)],
  ['legacy /share/erd deep link', `/share/erd/${PUBLIC_ERD}`, {}, r => /Jump to Table/.test(r.body)],
  ['private ERD is refused, not looped', `/view/diagram/${PRIVATE_ERD}`, {}, r => /private/i.test(r.body)],
  ['unknown uid is a stable not-found', `/view/diagram/00000000-0000-0000-0000-000000000000`, {}, r => /not found/i.test(r.body) && !/Loading shared/.test(r.body)],
];
if (PUBLIC_DRAWING) cases.splice(2, 0, ['public drawing renders', `/view/drawing/${PUBLIC_DRAWING}`, {}, r => !/Loading shared|\b404\b|not found/i.test(r.body)]);

let failed = 0;
for (const [name, path, opts, ok] of cases) {
  const r = await visit(path, opts);
  // StrictMode double-invokes effects in dev; a loop is dozens of fetches.
  const pass = ok(r) && r.fetches <= (opts.reload ? 4 : 2) * 2;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} (public fetches=${r.fetches}) ${pass ? '' : r.body.slice(0, 160)}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
