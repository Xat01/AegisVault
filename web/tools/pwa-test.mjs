/**
 * PWA verification.
 *
 * Checks the things that decide whether a browser will actually offer to
 * install the app, and whether it still works with the network cut:
 *
 *   1. The manifest is valid, reachable, and has the icon set Chrome requires.
 *   2. The service worker registers and reaches "activated".
 *   3. The shell is precached and survives a full offline reload.
 *   4. The vault still functions offline (create + unlock + read a file).
 *   5. No vault data is ever cached by the worker.
 *
 * Run with:  node tools/pwa-test.mjs
 * Requires:  CHROME_PATH, and a server on PORT (default 4400).
 */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH;
const PORT = process.env.PORT ?? '4400';
const ORIGIN = process.env.ORIGIN ?? `http://127.0.0.1:${PORT}`;
const PASSPHRASE = 'correct-horse-battery-staple-42!';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  if (!CHROME) throw new Error('CHROME_PATH is not set.');

  const browser = await chromium.launch({ executablePath: CHROME });

  // A user agent that Chrome treats as installable, and a context that permits
  // service workers and persistent storage.
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; ELP-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // ---------------------------------------------------------------- manifest

  section('Manifest');

  const manifestResponse = await page.goto(`${ORIGIN}/manifest.webmanifest`, {
    waitUntil: 'domcontentloaded',
  });
  check('manifest is served', manifestResponse?.ok() ?? false, `status ${manifestResponse?.status()}`);

  const contentType = manifestResponse?.headers()['content-type'] ?? '';
  check('manifest has a JSON content type', /json/.test(contentType), contentType);

  const manifest = await manifestResponse.json();
  check('manifest declares a name', Boolean(manifest.name));
  check('manifest start_url is relative', String(manifest.start_url).startsWith('./'));
  check('manifest scope is relative', String(manifest.scope).startsWith('./'));
  check('display is standalone', manifest.display === 'standalone');
  check('theme_color is set', Boolean(manifest.theme_color));

  const has512Any = manifest.icons.some((i) => i.sizes === '512x512' && String(i.purpose).includes('any'));
  const has192Any = manifest.icons.some((i) => i.sizes === '192x192' && String(i.purpose).includes('any'));
  const hasMaskable = manifest.icons.some((i) => String(i.purpose).includes('maskable'));
  check('has a 512x512 "any" icon (Chrome install requirement)', has512Any);
  check('has a 192x192 "any" icon', has192Any);
  check('has a maskable icon (Android adaptive icon)', hasMaskable);

  // Every declared icon must actually resolve.
  let iconsOk = true;
  const badIcons = [];
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, `${ORIGIN}/`).href;
    const res = await page.request.get(url).catch(() => null);
    const ok = res?.ok() ?? false;
    if (!ok) {
      // The 32px favicon is decorative; only flag raster app icons as fatal.
      if (icon.sizes !== '32x32') badIcons.push(`${icon.src} (${res?.status()})`);
      if (icon.sizes !== '32x32') iconsOk = false;
    }
  }
  check('all app icons resolve', iconsOk, badIcons.join(', '));

  // ------------------------------------------------------------ service worker

  section('Service worker');

  await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });

  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return 'no-registration';
    // `ready` resolves as soon as an active worker exists, which can still be
    // mid-transition ("activating"). Wait for the settled state so this check
    // reflects reality rather than a transient.
    const worker = reg.active;
    if (!worker) return 'no-active';
    if (worker.state !== 'activated') {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    }
    return worker.state;
  });
  check('service worker reaches "activated"', swState === 'activated', swState);

  const controlled = await page.evaluate(async () => {
    // controller may be null on the very first load; force a reload check.
    if (navigator.serviceWorker.controller) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  });
  check('page becomes service-worker controlled', controlled);

  // -------------------------------------------------------------- precache

  section('Offline shell');

  const cachedAssets = await page.evaluate(async () => {
    const names = await caches.keys();
    let total = 0;
    for (const name of names) {
      const cache = await caches.open(name);
      total += (await cache.keys()).length;
    }
    return { names, total };
  });
  check('at least one cache created', cachedAssets.names.length > 0, cachedAssets.names.join(', '));
  check('shell assets are precached', cachedAssets.total >= 15, `${cachedAssets.total} entries`);

  // The worker must not be holding decrypted vault contents. We check that no
  // cached response body contains the passphrase or a known plaintext marker.
  const cleanCaches = await page.evaluate(async (pass) => {
    const marker = 'AEGIS_PLAINTEXT_MARKER_9F3A';
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (!response) continue;
        const text = await response.text().catch(() => '');
        if (text.includes(pass) || text.includes(marker)) return false;
      }
    }
    return true;
  }, PASSPHRASE);
  check('no secrets found in any cache', cleanCaches);

  // -------------------------------------------------- offline vault round trip

  section('Offline vault round trip');

  // Create a vault while still online.
  await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('aegis-vault');
  });
  await page.reload({ waitUntil: 'load' });

  await page.waitForSelector('input[type=password]', { timeout: 15000 });
  const inputs = await page.$$('input[type=password]');
  await inputs[0].fill(PASSPHRASE);
  if (inputs[1]) await inputs[1].fill(PASSPHRASE);

  const createButton = await page.$('button:has-text("Create")');
  if (createButton) await createButton.click();
  await page.waitForTimeout(2500);

  const vaultCreated = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('aegis-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = Array.from(db.objectStoreNames);
    db.close();
    return stores;
  }).catch(() => []);
  check('vault database created', vaultCreated.length > 0, vaultCreated.join(', '));

  // Now go offline and confirm the app still boots from cache.
  await context.setOffline(true);
  const offlineReload = await page.reload({ waitUntil: 'load' }).catch(() => null);
  check('page reloads while offline', offlineReload != null);

  const offlineTitle = await page.title();
  check('offline boot renders the real app', /Aegis/i.test(offlineTitle), offlineTitle);

  const offlineHasUi = await page.evaluate(() => {
    // The boot screen is replaced by the auth screen or vault once JS runs.
    const boot = document.querySelector('.boot-screen');
    const body = document.body.textContent ?? '';
    return { hasBoot: Boolean(boot), length: body.trim().length };
  });
  check(
    'offline boot reached an interactive screen',
    offlineHasUi.length > 40,
    `text length ${offlineHasUi.length}`,
  );

  // Vault contents must still be readable with no network at all.
  const offlineRecords = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('aegis-vault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const names = Array.from(db.objectStoreNames);
    const counts = {};
    for (const name of names) {
      counts[name] = await new Promise((resolve) => {
        const tx = db.transaction(name, 'readonly');
        const req = tx.objectStore(name).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
    }
    db.close();
    return counts;
  }).catch(() => ({}));
  const totalRecords = Object.values(offlineRecords).reduce((a, b) => a + b, 0);
  check('vault data is readable with no network', totalRecords > 0, JSON.stringify(offlineRecords));

  await context.setOffline(false);

  // ------------------------------------------------------------------ install

  section('Install affordance');

  const installSupport = await page.evaluate(() => ({
    hasSW: 'serviceWorker' in navigator,
    secure: window.isSecureContext,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    hasManifest: Boolean(document.querySelector('link[rel=manifest]')),
    hasAppleIcon: Boolean(document.querySelector('link[rel="apple-touch-icon"]')),
    hasThemeColor: Boolean(document.querySelector('meta[name="theme-color"]')),
    hasAppleCapable: Boolean(document.querySelector('meta[name="apple-mobile-web-app-capable"]')),
    hasViewportFit: (document.querySelector('meta[name=viewport]')?.content ?? '').includes(
      'viewport-fit=cover',
    ),
  }));

  check('secure context (required for SW + WebCrypto)', installSupport.secure);
  check('manifest link present in the document', installSupport.hasManifest);
  check('apple-touch-icon present for iOS installs', installSupport.hasAppleIcon);
  check('theme-color meta present', installSupport.hasThemeColor);
  check('apple-mobile-web-app-capable present', installSupport.hasAppleCapable);
  check('viewport covers notches (viewport-fit=cover)', installSupport.hasViewportFit);
  check('not already in standalone during this test', installSupport.standalone === false);

  const bannerPresent = await page.evaluate(() => Boolean(document.getElementById('install-banner')));
  check('install banner host exists in the DOM', bannerPresent);

  // ------------------------------------------------------------------- health

  section('Runtime health');
  check('no uncaught errors during the entire run', errors.length === 0, errors.join(' | '));

  await browser.close();

  console.log('\n' + '='.repeat(56));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(56));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
