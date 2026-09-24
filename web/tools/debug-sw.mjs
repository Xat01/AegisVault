/**
 * Diagnostic: why is the service worker not finishing registration?
 * Prints console output, page errors, and the registration state.
 */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH;
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:4400';

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; ELP-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
});
const page = await context.newPage();

page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) =>
  console.log('[requestfailed]', r.url(), r.failure()?.errorText),
);

// Watch the worker itself.
context.on('serviceworker', (worker) => console.log('[serviceworker]', worker.url()));

console.log('--- navigating ---');
await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(1500);

console.log('--- registration state ---');
const state = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return {
    secure: window.isSecureContext,
    supported: 'serviceWorker' in navigator,
    controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    registrations: regs.map((r) => ({
      scope: r.scope,
      installing: r.installing?.state ?? null,
      waiting: r.waiting?.state ?? null,
      active: r.active?.state ?? null,
    })),
  };
});
console.log(JSON.stringify(state, null, 2));

console.log('--- waiting for ready (8s cap) ---');
const ready = await page.evaluate(
  () =>
    Promise.race([
      navigator.serviceWorker.ready.then((r) => ({
        ok: true,
        active: r.active?.state ?? null,
        scope: r.scope,
      })),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 8000)),
    ]),
);
console.log(JSON.stringify(ready, null, 2));

console.log('--- caches ---');
const cachesInfo = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const name of names) {
    const cache = await caches.open(name);
    out[name] = (await cache.keys()).map((r) => r.url);
  }
  return out;
});
console.log(JSON.stringify(cachesInfo, null, 2));

await browser.close();
