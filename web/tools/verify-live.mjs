/**
 * Verifies the *deployed* site, not localhost.
 *
 * The Pages CDN differs from a local server in ways that matter for a PWA:
 * content types, caching, CORS on the manifest, and whether the service worker
 * is allowed to claim scope from the /<repo>/ subpath. This checks the real
 * thing.
 *
 * Run with:  node tools/verify-live.mjs
 */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH;
const SITE = process.env.SITE ?? 'https://xat01.github.io/AegisVault/';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; ELP-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

console.log(`\nTarget: ${SITE}\n`);

// ------------------------------------------------------------------- manifest

console.log('Manifest');
const man = await page.goto(new URL('manifest.webmanifest', SITE).href, {
  waitUntil: 'domcontentloaded',
});
check('manifest served', man?.ok() ?? false, `status ${man?.status()}`);
const manType = man?.headers()['content-type'] ?? '';
check('manifest content-type is JSON', /json/.test(manType), manType);
const manifest = await man.json();
check('manifest has name', Boolean(manifest.name));
check('manifest display is standalone', manifest.display === 'standalone');
const has512 = manifest.icons.some((i) => i.sizes === '512x512');
const maskable = manifest.icons.some((i) => String(i.purpose).includes('maskable'));
check('manifest has a 512 icon', has512);
check('manifest has a maskable icon', maskable);

// Every icon must resolve over the real CDN.
const badIcons = [];
for (const icon of manifest.icons) {
  const url = new URL(icon.src, SITE).href;
  const res = await page.request.get(url).catch(() => null);
  if (!res?.ok()) badIcons.push(`${icon.src} -> ${res?.status()}`);
}
check('all icons resolve on the CDN', badIcons.length === 0, badIcons.join(', '));

// -------------------------------------------------------------- boot the app

console.log('\nApp boot');
const resp = await page.goto(SITE, { waitUntil: 'load' });
check('site loads', resp?.ok() ?? false, `status ${resp?.status()}`);
check('served over HTTPS', page.url().startsWith('https://'), page.url());

const secure = await page.evaluate(() => window.isSecureContext);
check('secure context (WebCrypto available)', secure);

await page.waitForTimeout(2500);
const booted = await page.evaluate(() => ({
  title: document.title,
  text: (document.body.textContent ?? '').trim().length,
  hasPasswordField: Boolean(document.querySelector('input[type=password]')),
}));
check('app renders a real screen', booted.text > 100, `text length ${booted.text}`);
check('passphrase field present', booted.hasPasswordField);
check('title is Aegis', /aegis/i.test(booted.title), booted.title);

// ------------------------------------------------------------ service worker

console.log('\nService worker (live)');
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return { supported: true, registered: false };
  const worker = reg.active;
  if (worker && worker.state !== 'activated') {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 5000);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }
  return {
    supported: true,
    registered: true,
    scope: reg.scope,
    state: worker?.state ?? null,
  };
});
check('service worker supported', sw.supported);
check('service worker registered on the CDN', sw.registered);
check('service worker activated', sw.state === 'activated', String(sw.state));
check('scope is under the repo subpath', String(sw.scope ?? '').includes('/AegisVault/'), String(sw.scope));

const cacheCount = await page.evaluate(async () => {
  const names = await caches.keys();
  let n = 0;
  for (const name of names) {
    const c = await caches.open(name);
    n += (await c.keys()).length;
  }
  return n;
});
check('shell precached from the CDN', cacheCount >= 15, `${cacheCount} entries`);

// --------------------------------------------------------- offline round trip

console.log('\nOffline round trip (live)');
await context.setOffline(true);
const offline = await page.reload({ waitUntil: 'load' }).catch(() => null);
check('reloads with the network cut', offline != null);
await page.waitForTimeout(1200);
const offlineText = await page.evaluate(() => (document.body.textContent ?? '').trim().length);
check('app still renders offline', offlineText > 100, `text length ${offlineText}`);
await context.setOffline(false);

// ---------------------------------------------------------------- install meta

console.log('\nInstall metadata');
const meta = await page.evaluate(() => ({
  manifest: Boolean(document.querySelector('link[rel=manifest]')),
  appleIcon: Boolean(document.querySelector('link[rel="apple-touch-icon"]')),
  theme: Boolean(document.querySelector('meta[name="theme-color"]')),
  capable: Boolean(document.querySelector('meta[name="apple-mobile-web-app-capable"]')),
  banner: Boolean(document.getElementById('install-banner')),
}));
check('manifest linked', meta.manifest);
check('apple-touch-icon linked', meta.appleIcon);
check('theme-color present', meta.theme);
check('apple-mobile-web-app-capable present', meta.capable);
check('install banner host present', meta.banner);

console.log('\nRuntime health');
const realErrors = errors.filter((e) => !/favicon/i.test(e));
check('no uncaught errors', realErrors.length === 0, realErrors.join(' | '));

await browser.close();

console.log('\n' + '='.repeat(56));
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(56));
process.exit(failed === 0 ? 0 : 1);
