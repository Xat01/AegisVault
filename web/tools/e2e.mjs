/**
 * End-to-end verification.
 *
 * Drives the real app in a real browser through the full journey, including the
 * failure paths that matter: wrong passphrase, duplicate detection, integrity
 * verification, and lock/unlock persistence across a reload.
 *
 * Run with:  node tools/e2e.mjs
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH;
const BASE = process.env.BASE_URL ?? 'http://localhost:4321/index.html';
const OUT = join(process.cwd(), 'tools', 'out');
const DOWNLOADS = join(OUT, 'downloads');

const PASSPHRASE = 'correct-horse-battery-staple-42!';
const WRONG = 'definitely-not-the-passphrase-99!';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${label}${detail ? ' :: ' + detail : ''}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(DOWNLOADS, { recursive: true });

  // Fixtures: a text file, a binary file, and a zero-byte file.
  const fixtureDir = join(OUT, 'fixtures');
  mkdirSync(fixtureDir, { recursive: true });

  const secretText = 'The quick brown fox jumps over the lazy dog. '.repeat(40);
  const textPath = join(fixtureDir, 'mission-notes.txt');
  writeFileSync(textPath, secretText);

  const binaryBytes = Buffer.alloc(4096);
  for (let i = 0; i < binaryBytes.length; i += 1) binaryBytes[i] = (i * 37) % 256;
  const binPath = join(fixtureDir, 'payload.bin');
  writeFileSync(binPath, binaryBytes);

  const emptyPath = join(fixtureDir, 'empty.txt');
  writeFileSync(emptyPath, '');

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });

  try {
    /* ---------------------------------------------------------------- boot */

    section('Boot');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth', { timeout: 15000 });
    check('Auth screen renders', await page.isVisible('.auth'));
    check('Brand present', (await page.textContent('.brand-name')) === 'Aegis Vault');

    const cryptoSpecs = await page.$$eval('.spec-value', (nodes) => nodes.map((n) => n.textContent));
    check('Uses PBKDF2-SHA256', cryptoSpecs.some((s) => s.includes('PBKDF2')), cryptoSpecs.join(' | '));
    check('Uses AES-256', cryptoSpecs.some((s) => s.includes('AES-GCM-256')), cryptoSpecs.join(' | '));
    check('Declares no network access', cryptoSpecs.some((s) => s === 'none'));

    await page.screenshot({ path: join(OUT, '01-landing.png'), fullPage: true });

    /* --------------------------------------------------- passphrase scoring */

    section('Passphrase strength feedback');
    const passInput = page.locator('#create-passphrase');

    await passInput.fill('abc');
    await sleep(120);
    const weakLabel = await page.textContent('.strength-label');
    check('Short passphrase scores low', ['Empty', 'Weak', 'Fair'].includes(weakLabel), `got "${weakLabel}"`);
    check('Create button disabled while weak', await page.locator('button[type=submit]').isDisabled());
    await page.screenshot({ path: join(OUT, '02-weak-passphrase.png'), fullPage: true });

    await passInput.fill('correct-horse-battery-staple-42!');
    await sleep(120);
    const strongLabel = await page.textContent('.strength-label');
    check('Long passphrase scores high', ['Strong', 'Excellent'].includes(strongLabel), `got "${strongLabel}"`);
    const metChecks = await page.locator('.check.met').count();
    check('Checklist reflects criteria', metChecks >= 4, `${metChecks} met`);

    /* ------------------------------------------------------------- creation */

    section('Vault creation');
    await page.locator('#create-confirm').fill('mismatched-passphrase-11!');
    await page.locator('button[type=submit]').click();
    await sleep(300);
    const confirmError = await page.locator('#create-confirm').evaluate((el) => el.classList.contains('input-error'));
    check('Mismatch is rejected', confirmError);

    await page.locator('#create-confirm').fill(PASSPHRASE);
    await page.locator('button[type=submit]').click();
    await page.waitForSelector('.shell', { timeout: 60000 });
    check('Vault created and shell opens', await page.isVisible('.shell'));
    check('Empty state shown', (await page.textContent('.empty-title')) === 'Your vault is empty');
    await page.screenshot({ path: join(OUT, '03-empty-vault.png'), fullPage: true });

    /* ---------------------------------------------------------------- adding */

    section('Encryption pipeline');
    // The picker is created on demand, so drive it the way a user would.
    const picker = page.waitForEvent('filechooser', { timeout: 15000 });
    await page.locator('.stage-actions .btn-primary').click();
    const chooser = await picker;
    await chooser.setFiles([textPath, binPath, emptyPath]);
    await page.waitForSelector('.card', { timeout: 90000 });
    await sleep(1500);

    const cardCount = await page.locator('.card').count();
    check('All three files stored, including zero-byte', cardCount === 3, `${cardCount} cards`);

    const cardNames = await page.$$eval('.card-name', (nodes) => nodes.map((n) => n.textContent));
    check('Original names preserved', cardNames.includes('mission-notes.txt') && cardNames.includes('payload.bin'), cardNames.join(', '));

    const verifiedLabels = await page.$$eval('.card-verified', (nodes) => nodes.map((n) => n.textContent.trim()));
    check('Items show a verification state', verifiedLabels.length === 3);
    await page.screenshot({ path: join(OUT, '04-vault-with-items.png'), fullPage: true });

    /* ------------------------------------------------------------ index size */

    section('Storage layout');
    const stored = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('aegis-vault');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const keys = await new Promise((resolve) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').getAllKeys();
        req.onsuccess = () => resolve(req.result);
      });
      const sizes = {};
      for (const key of keys) {
        const value = await new Promise((resolve) => {
          const tx = db.transaction('blobs', 'readonly');
          const req = tx.objectStore('blobs').get(key);
          req.onsuccess = () => resolve(req.result);
        });
        sizes[key] = value.byteLength;
      }
      return { keys: keys.map(String), sizes };
    });

    check('Index blob is stored encrypted', stored.keys.includes('__index__'), stored.keys.join(', '));
    check('One container per file plus the index', stored.keys.length === 4, `${stored.keys.length} blobs`);

    // Containers must carry the 49-byte header.
    const containerIds = stored.keys.filter((key) => key !== '__index__');
    // Every container must be exactly 49 bytes larger than its plaintext.
    const headerSizes = containerIds.map((id) => stored.sizes[id]);
    const originalSizes = [textPath, binPath, emptyPath].map((path) => readFileSync(path).length).sort((a, b) => a - b);
    const sortedContainers = [...headerSizes].sort((a, b) => a - b);
    check('Containers include exactly 49 bytes of header overhead',
      sortedContainers.every((size, index) => size === originalSizes[index] + 49),
      `plain ${originalSizes.join(',')} -> container ${sortedContainers.join(',')}`);

    /* -------------------------------------------------- no plaintext leaking */

    section('Confidentiality at rest');
    const plaintextLeak = await page.evaluate(async (needle) => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('aegis-vault');
        request.onsuccess = () => resolve(request.result);
      });
      const keys = await new Promise((resolve) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').getAllKeys();
        req.onsuccess = () => resolve(req.result);
      });
      const encoder = new TextEncoder();
      const target = encoder.encode(needle);
      let hits = 0;

      for (const key of keys) {
        const value = new Uint8Array(await new Promise((resolve) => {
          const tx = db.transaction('blobs', 'readonly');
          const req = tx.objectStore('blobs').get(key);
          req.onsuccess = () => resolve(req.result);
        }));
        for (let i = 0; i <= value.length - target.length; i += 1) {
          let match = true;
          for (let j = 0; j < target.length; j += 1) {
            if (value[i + j] !== target[j]) { match = false; break; }
          }
          if (match) hits += 1;
        }
      }
      return hits;
    }, 'quick brown fox');

    check('Plaintext content is not present in storage', plaintextLeak === 0, `${plaintextLeak} occurrences found`);

    const nameLeak = await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('aegis-vault');
        request.onsuccess = () => resolve(request.result);
      });
      const keys = await new Promise((resolve) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').getAllKeys();
        req.onsuccess = () => resolve(req.result);
      });
      const decoder = new TextDecoder();
      let found = 0;
      for (const key of keys) {
        const value = new Uint8Array(await new Promise((resolve) => {
          const tx = db.transaction('blobs', 'readonly');
          const req = tx.objectStore('blobs').get(key);
          req.onsuccess = () => resolve(req.result);
        }));
        if (decoder.decode(value).includes('mission-notes')) found += 1;
      }
      return found;
    });

    check('File names are not readable at rest', nameLeak === 0, `${nameLeak} occurrences`);

    /* ------------------------------------------------------------- inspector */

    section('Inspector — cryptographic transparency');
    await page.locator('.card', { hasText: 'mission-notes.txt' }).first().click();
    await page.waitForSelector('.drawer', { timeout: 10000 });
    await sleep(400);

    const drawerText = await page.textContent('.drawer');
    check('Inspector opens', await page.isVisible('.drawer'));
    check('Magic bytes shown', drawerText.includes('41 45 47 53'));
    check('Salt section present', drawerText.includes('Salt'));
    check('Nonce section present', drawerText.includes('Nonce'));
    check('Auth tag present', drawerText.includes('Auth tag'));
    check('SHA-256 fingerprint shown', drawerText.includes('SHA-256'));
    check('Explains GCM authentication', drawerText.includes('authenticated by GCM'));

    const legendCount = await page.locator('.legend-item').count();
    check('Hex legend annotates each field', legendCount === 5, `${legendCount} legend entries`);

    const hexChars = await page.$eval('.hex-block', (el) => el.textContent.trim().length);
    check('Hex dump is populated', hexChars > 60, `${hexChars} chars`);

    await page.screenshot({ path: join(OUT, '05-inspector.png'), fullPage: true });

    /* ------------------------------------------------------------- extraction */

    section('Decryption round-trip');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('.drawer-foot .btn-primary').click(),
    ]);

    const extractedPath = join(DOWNLOADS, 'mission-notes.txt');
    await download.saveAs(extractedPath);
    await sleep(500);

    const extracted = readFileSync(extractedPath, 'utf8');
    check('Decrypted bytes match the original exactly', extracted === secretText,
      `expected ${secretText.length} chars, got ${extracted.length}`);

    /* ------------------------------------------------------------- integrity */

    section('Integrity verification');
    await page.locator('.drawer-foot .btn-ghost').first().click();
    await page.waitForSelector('.toast', { timeout: 30000 });
    await sleep(600);
    const verifyToasts = await page.$$eval('.toast', (nodes) => nodes.map((n) => n.textContent));
    check('Verify reports success',
      verifyToasts.some((text) => text.includes('Integrity verified')),
      verifyToasts.join(' | ').slice(0, 160));

    // Close the drawer via its own control, which is what a user would do.
    await page.locator('.drawer-head button').click();
    await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 });
    check('Drawer closes from its close control', (await page.locator('.drawer').count()) === 0);
    await sleep(300);

    /* ------------------------------------------------------------ duplicate */

    section('Duplicate detection');
    // The inspector drawer must be fully closed before the toolbar is clickable.
    await page.locator('.drawer').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await sleep(400);
    const dupPicker = page.waitForEvent('filechooser', { timeout: 20000 });
    await page.locator('.stage-actions .btn-primary').click();
    (await dupPicker).setFiles([textPath]);
    await page.waitForSelector('.toast.error', { timeout: 40000 });
    await sleep(400);
    const dupToast = await page.textContent('.toast.error');
    check('Identical contents are rejected', dupToast.toLowerCase().includes('identical'), dupToast.slice(0, 140));

    const afterDup = await page.locator('.card').count();
    check('Duplicate did not create a new item', afterDup === 3, `${afterDup} cards`);

    /* ----------------------------------------------------------- lock/reload */

    section('Lock and unlock persistence');
    await page.click('.topbar-actions .btn-ghost');
    await page.waitForSelector('.auth', { timeout: 10000 });
    check('Lock returns to the auth screen', await page.isVisible('.auth'));
    check('Unlock mode is used, not create', (await page.textContent('.panel-eyebrow')) === 'Locked');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.auth', { timeout: 15000 });
    check('Vault stays locked across a reload', (await page.textContent('.panel-eyebrow')) === 'Locked');
    await page.screenshot({ path: join(OUT, '06-locked.png'), fullPage: true });

    /* ------------------------------------------------------- wrong password */

    section('Wrong passphrase handling');
    await page.locator('#unlock-passphrase').fill(WRONG);
    await page.locator('button[type=submit]').click();
    await page.waitForSelector('#unlock-passphrase.input-error', { timeout: 60000 });
    const wrongMsg = await page.textContent('.field-error');
    check('Wrong passphrase is rejected with a message', wrongMsg.length > 10, wrongMsg);
    check('Still on the auth screen', await page.isVisible('.auth'));

    /* --------------------------------------------------------- right password */

    section('Unlock with the correct passphrase');
    await page.locator('#unlock-passphrase').fill(PASSPHRASE);
    await page.locator('button[type=submit]').click();
    await page.waitForSelector('.shell', { timeout: 90000 });
    await sleep(1200);

    const restoredCards = await page.locator('.card').count();
    check('All items survive a lock/unlock cycle', restoredCards === 3, `${restoredCards} cards`);

    const restoredNames = await page.$$eval('.card-name', (nodes) => nodes.map((n) => n.textContent));
    check('Names decrypt correctly after reload',
      restoredNames.includes('mission-notes.txt') && restoredNames.includes('payload.bin'),
      restoredNames.join(', '));

    /* -------------------------------------------------------- binary fidelity */

    section('Binary file fidelity');
    await page.locator('.card', { hasText: 'payload.bin' }).first().click();
    await page.waitForSelector('.drawer', { timeout: 10000 });
    const [binDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('.drawer-foot .btn-primary').click(),
    ]);
    const binOut = join(DOWNLOADS, 'payload.bin');
    await binDownload.saveAs(binOut);
    await sleep(500);

    const roundTripped = readFileSync(binOut);
    check('Binary bytes are bit-identical', Buffer.compare(roundTripped, binaryBytes) === 0,
      `${roundTripped.length} vs ${binaryBytes.length} bytes`);

    await page.locator('.drawer-head button').click();
    await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 }).catch(() => {});
    await sleep(400);

    /* ------------------------------------------------------------- searching */

    section('Search and filtering');
    const search = page.locator('#vault-search');
    await search.fill('payload');
    await sleep(500);
    check('Search narrows the results', (await page.locator('.card').count()) === 1, `${await page.locator('.card').count()} cards`);

    await search.fill('zzz-nothing-matches');
    await sleep(500);
    check('No-match state is shown', (await page.textContent('.empty-title')) === 'No matches');

    await search.fill('');
    await sleep(500);
    check('Clearing search restores all items', (await page.locator('.card').count()) === 3);

    /* ------------------------------------------------------------- palette */

    section('Command palette');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.palette', { timeout: 10000 });
    check('Palette opens', await page.isVisible('.palette'));
    await page.locator('.palette-input').fill('settings');
    await sleep(300);
    const paletteItems = await page.$$eval('.palette-item', (nodes) => nodes.map((n) => n.textContent));
    check('Palette filters commands', paletteItems.some((item) => item.toLowerCase().includes('settings')), paletteItems.join(' | '));
    await page.screenshot({ path: join(OUT, '07-palette.png'), fullPage: true });
    await page.locator('.palette-item').first().click();
    await page.waitForSelector('.settings-grid', { timeout: 10000 });
    check('Palette navigates to settings', await page.isVisible('.settings-grid'));

    /* ------------------------------------------------------------ settings */

    section('Settings and derivation lab');
    const settingsText = await page.textContent('.settings-grid');
    check('Crypto parameters are disclosed',
      settingsText.includes('PBKDF2') && settingsText.includes('SHA-256') && settingsText.includes('600,000'),
      settingsText.slice(0, 160));
    check('Limitations are stated plainly', settingsText.includes('Not protected'));
    check('Danger zone present', settingsText.includes('Destroy this vault'));

    await page.locator('button', { hasText: 'Run measurement' }).click();
    await page.waitForSelector('.kv-row:has-text("600,000 iterations")', { timeout: 120000 });
    const labText = await page.textContent('.settings-grid');
    check('Derivation lab reports real timings', /ms/.test(labText), 'no timing found');
    await page.screenshot({ path: join(OUT, '08-settings.png'), fullPage: true });

    /* ------------------------------------------------------------- responsive */

    section('Responsive layout');
    for (const [name, width, height] of [['mobile', 390, 844], ['tablet', 820, 1100], ['desktop', 1440, 900]]) {
      await page.setViewportSize({ width, height });
      await sleep(500);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('.auth', { timeout: 15000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(`No horizontal overflow at ${name} (${width}px)`, !overflow);
      await page.screenshot({ path: join(OUT, `09-${name}.png`), fullPage: false });
    }

    /* ---------------------------------------------------------------- light */

    section('Light theme');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth', { timeout: 15000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await sleep(400);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('Light theme applies a light background', bg !== 'rgb(10, 11, 16)', bg);
    await page.screenshot({ path: join(OUT, '10-light.png'), fullPage: true });

    /* ------------------------------------------------------------ console */

    section('Runtime health');
    const realErrors = errors.filter((line) => !line.includes('Password forms should have'));
    check('No uncaught errors during the entire run', realErrors.length === 0, realErrors.slice(0, 3).join(' || '));
  } catch (error) {
    failed += 1;
    failures.push('Unexpected exception: ' + error.message);
    console.log('\nEXCEPTION: ' + error.message);
    await page.screenshot({ path: join(OUT, 'error-state.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(56)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach((line) => console.log('   - ' + line));
  }
  console.log(`${'='.repeat(56)}\n`);
  console.log(`Screenshots: ${OUT}`);

  process.exit(failed ? 1 : 0);
}

main();
