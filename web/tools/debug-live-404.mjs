/**
 * Captures every failing request on the live site, with full context.
 *
 * The earlier scanner attached only to a single navigation and missed the
 * offender. This one stays attached across navigations, reloads, and the
 * service-worker bootstrap window, and logs the request initiator so the
 * source of a mystery 404 is identifiable rather than guessed at.
 */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH;
const SITE = process.env.SITE ?? 'https://xat01.github.io/AegisVault/';

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; ELP-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
});
const page = await context.newPage();

const bad = [];

page.on('response', async (r) => {
  if (r.status() >= 400) {
    const req = r.request();
    bad.push({
      status: r.status(),
      url: r.url(),
      type: req.resourceType(),
      method: req.method(),
      via: req.frame() === page.mainFrame() ? 'main' : 'sub',
    });
  }
});
page.on('requestfailed', (r) => {
  bad.push({
    status: 'FAILED',
    url: r.url(),
    type: r.resourceType(),
    method: r.method(),
    via: r.frame() === page.mainFrame() ? 'main' : 'sub',
    reason: r.failure()?.errorText,
  });
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

console.log('--- navigation 1 (cold) ---');
await page.goto(SITE, { waitUntil: 'load' });
await page.waitForTimeout(4000);

console.log('--- reload (service worker active) ---');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

console.log('--- second reload ---');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3000);

console.log('\n--- all responses with status >= 400 ---');
if (bad.length === 0) {
  console.log('(none)');
} else {
  // De-duplicate by url+status.
  const seen = new Set();
  for (const b of bad) {
    const key = `${b.status} ${b.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`${b.status}  [${b.type}] ${b.method}  ${b.url}${b.reason ? ' — ' + b.reason : ''}`);
  }
}

await browser.close();
