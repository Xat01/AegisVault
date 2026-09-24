/**
 * Finds the 404 on the live site by logging every failed request.
 */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH;
const SITE = process.env.SITE ?? 'https://xat01.github.io/AegisVault/';

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
});
const page = await context.newPage();

const failures = [];
page.on('response', (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) =>
  failures.push(`FAILED ${r.url()} — ${r.failure()?.errorText}`),
);

await page.goto(SITE, { waitUntil: 'load' });
await page.waitForTimeout(3000);

// Force a reload so the service worker also gets exercised.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);

console.log('--- requests with status >= 400 ---');
if (failures.length === 0) console.log('(none)');
for (const f of [...new Set(failures)]) console.log(f);

await browser.close();
