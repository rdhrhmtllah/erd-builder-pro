import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const BASE = process.env.BASE || 'http://127.0.0.1:5176';
const UID = process.env.UID || '11111111-2222-3333-4444-555555555555';

console.log(`Starting Multi-User Realtime Collaboration E2E Test on ${BASE}/view/diagram/${UID}...`);

const { execSync } = await import("node:child_process");
execSync(`docker exec erd-builder-pro-db psql -U erd_builder -d erd_builder_pro -c "UPDATE diagrams SET share_role='edit' WHERE uid='${UID}';"`);

const browser = await chromium.launch({ headless: true });

async function createGuestSession(name) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleLogs = [];
  page.on('console', m => consoleLogs.push(`[${name}] ${m.type()}: ${m.text().slice(0, 150)}`));
  page.on('pageerror', e => console.error(`[${name} ERROR]`, e.message));

  await page.goto(`${BASE}/view/diagram/${UID}`, { waitUntil: 'domcontentloaded' });
  
  // Wait for either the guest name dialog or the canvas
  await page.waitForTimeout(3000);

  // If guest dialog appears, fill in name and join
  const joinInput = page.locator('input[placeholder*="name" i], input[type="text"]').first();
  if (await joinInput.isVisible().catch(() => false)) {
    await joinInput.fill(name);
    const joinBtn = page.locator('button:has-text("Join"), button:has-text("Continue")').first();
    if (await joinBtn.isVisible().catch(() => false)) {
      await joinBtn.click();
    }
  }

  // Wait for canvas to load
  await page.waitForTimeout(4000);
  return { ctx, page, consoleLogs };
}

const matrix = [];

try {
  // 1. Launch Guest Alice
  console.log('-> Launching Client 1 (Alice)...');
  const alice = await createGuestSession('Alice');
  
  // Check that canvas loaded without 404 loop
  const aliceText = await alice.page.locator('body').innerText();
  const aliceNoLoop = !/Loading shared|\b404\b/i.test(aliceText) && /Jump to Table/i.test(aliceText);
  matrix.push({ name: '1. Alice loads canvas (No 404/Loading loop)', pass: aliceNoLoop });

  // Check no sidebar banner
  const hasBanner = /Deploy your App in 15 Seconds|SumoPod/i.test(aliceText);
  matrix.push({ name: '2. Sidebar banner hidden (No regression)', pass: !hasBanner });

  // 2. Launch Guest Bob
  console.log('-> Launching Client 2 (Bob)...');
  const bob = await createGuestSession('Bob');
  const bobText = await bob.page.locator('body').innerText();
  const bobLoaded = /Jump to Table/i.test(bobText);
  matrix.push({ name: '3. Bob loads canvas concurrently', pass: bobLoaded });

  // 3. Move cursor in Alice to test realtime presence
  console.log('-> Testing live cursor presence...');
  await alice.page.mouse.move(350, 250);
  await alice.page.mouse.move(400, 300);
  await bob.page.waitForTimeout(2000);

  // Check if Bob sees Alice's cursor or badge
  const bobContent = await bob.page.content();
  const seesAlice = /Alice/i.test(bobContent);
  matrix.push({ name: '4. Live cursor/peer badge visible to other guest', pass: seesAlice });

  // 4. Test Realtime Content Edit & Sync
  console.log('-> Testing Realtime Content Edit from Alice...');
  // log

  // Trigger savePublic API directly from Alice's session context to simulate node addition
  const saveRes = await alice.page.evaluate(async (uid) => {
    const res = await fetch(`/api/diagrams/public/${uid}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-collab-client-id': 'alice-client' },
      body: JSON.stringify({
        editorName: 'Alice',
        entities: [
          { id: 'ent-users', name: 'users', x: 100, y: 100, columns: [] },
          { id: 'ent-posts', name: 'posts', x: 400, y: 100, columns: [] },
          { id: 'ent-orders', name: 'orders_collab', x: 750, y: 200, columns: [{ id: 'c-ord-1', name: 'id', type: 'uuid', is_pk: true }] }
        ],
        relationships: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      })
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  }, UID);

  console.log('Alice saveRes:', JSON.stringify(saveRes));
  matrix.push({ name: '5. Alice saves shared diagram via public API', pass: Boolean(saveRes.ok && saveRes.data?.version > 0) });

  // Wait for websocket broadcast to reach Bob without reloading Bob's page!
  console.log('-> Waiting for Bob to receive live sync without reloading...');
  await bob.page.waitForTimeout(4000);

  const bobUpdatedContent = await bob.page.content();
  const bobSeesNewTable = /orders_collab/i.test(bobUpdatedContent);
  matrix.push({ name: '6. Bob sees Alice edit in real-time (No reload)', pass: bobSeesNewTable });

  // 5. Test Bob edits and Alice receives
  console.log('-> Testing Bob edits and Alice receives...');
  const bobSaveRes = await bob.page.evaluate(async (uid) => {
    const res = await fetch(`/api/diagrams/public/${uid}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-collab-client-id': 'bob-client' },
      body: JSON.stringify({
        editorName: 'Bob',
        entities: [
          { id: 'ent-users', name: 'users', x: 100, y: 100, columns: [] },
          { id: 'ent-posts', name: 'posts', x: 400, y: 100, columns: [] },
          { id: 'ent-orders', name: 'orders_collab', x: 750, y: 200, columns: [] },
          { id: 'ent-invoices', name: 'invoices_collab', x: 950, y: 300, columns: [] }
        ],
        relationships: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      })
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  }, UID);

  matrix.push({ name: '7. Bob saves shared diagram successfully', pass: bobSaveRes.ok });

  await alice.page.waitForTimeout(4000);
  const aliceUpdatedContent = await alice.page.content();
  const aliceSeesInvoices = /invoices_collab/i.test(aliceUpdatedContent);
  matrix.push({ name: '8. Alice sees Bob edit in real-time without lost updates', pass: aliceSeesInvoices });

  // 6. Test persistence across full page reload
  console.log('-> Testing deep link persistence across reload...');
  await bob.page.reload({ waitUntil: 'domcontentloaded' });
  await bob.page.waitForTimeout(5000);
  const bobReloadedContent = await bob.page.content();
  const persistOk = /orders_collab/i.test(bobReloadedContent) && /invoices_collab/i.test(bobReloadedContent);
  matrix.push({ name: '9. Persistence in DB verified after page reload', pass: persistOk });

  // 7. Test Revoke Permission to View-Only
  console.log('-> Testing permission downgrade to View-Only...');
  // Simulate owner downgrading to view-only via API
  const downgradeRes = await fetch(`http://127.0.0.1:3105/api/diagrams/public/${UID}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entities: [], relationships: [] })
  });
  // Since we directly updated DB in earlier step, let us set share_role to 'view'
  const { execSync } = await import('node:child_process');
  execSync(`docker exec erd-builder-pro-db psql -U erd_builder -d erd_builder_pro -c "UPDATE diagrams SET share_role='view' WHERE uid='${UID}';"`);

  const rejectedSave = await bob.page.evaluate(async (uid) => {
    const res = await fetch(`/api/diagrams/public/${uid}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities: [], relationships: [] })
    });
    return { status: res.status };
  }, UID);

  matrix.push({ name: '10. Server-side authorization blocks edits when view-only (403)', pass: rejectedSave.status === 403 });

  await alice.ctx.close();
  await bob.ctx.close();
} catch (err) {
  console.error('E2E FAILURE EXCEPTION:', err);
  matrix.push({ name: 'Test execution exception free', pass: false, error: err.message });
} finally {
  await browser.close();
}

console.log('\n========================================');
console.log('REALTIME COLLABORATION E2E TEST RESULTS');
console.log('========================================');
let allPassed = true;
for (const m of matrix) {
  console.log(`[${m.pass ? 'PASS' : 'FAIL'}] ${m.name}`);
  if (!m.pass) allPassed = false;
}
console.log('========================================\n');
process.exit(allPassed ? 0 : 1);
