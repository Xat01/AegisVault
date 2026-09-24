/**
 * Loads the live site in a completely fresh context (no inherited cache or
 * service worker) and reports any error or 4xx/5xx response.
 *
 * This distinguishes "the deployed site has a problem" from "this browser
 * profile is holding a stale service-worker cache from an earlier deploy",
 * which are very different things and need different fixes.
 */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH;
const SITE = process.env.SITE ?? 'https://xat01.github.io/AegisVault/';

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push('console: ' + m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url());
});
page.on('requestfailed', (r) => {
  problems.push('FAILED ' + r.url() + ' - ' + (r.failure()?.errorText ?? ''));
});
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

await page.goto(SITE, { waitUntil: 'load' });
await page.waitForTimeout(5000);

const info = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const names = await caches.keys();
  return { registrations: regs.length, caches: names, controlled: Boolean(navigator.serviceWorker.controller) };
});

console.log('fresh-context result');
console.log('  problems:', problems.length === 0 ? '(none)' : '');
for (const p of problems) console.log('    ' + p);
console.log('  sw registrations:', info.registrations);
console.log('  caches:', info.caches.join(', ') || '(none)');
console.log('  controlled on first load:', info.controlled);

await browser.close();
