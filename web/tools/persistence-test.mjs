/**
 * Persistence across a real browser restart.
 *
 * Uses a persistent user-data directory, because Playwright's incognito-style
 * contexts deliberately isolate storage — which would make this test prove
 * nothing about real-world persistence. A persistent profile is what actually
 * mirrors "the user closed their browser and came back".
 *
 * Run with:  node tools/persistence-test.mjs
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_PATH;
const BASE = 'http://localhost:4321/index.html';
const OUT = join(process.cwd(), 'tools', 'out', 'persistence');
const PASSPHRASE = 'correct-horse-battery-staple-42!';

let passed = 0;
let failed = 0;
let browser = null;

function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.log('  FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const fixture = join(OUT, 'survives-restart.txt');
const content = 'This must still be here after the browser fully restarts.\n'.repeat(20);
writeFileSync(fixture, content);

// A real on-disk profile directory, so storage survives a full browser close.
const profileDir = join(tmpdir(), 'aegis-persist-profile-' + Date.now());

async function launch() {
  return chromium.launchPersistentContext(profileDir, {
    executablePath: CHROME,
    viewport: { width: 1280, height: 860 },
    acceptDownloads: true,
  });
}

console.log('\nSession one: create a vault and store a file');

{
  const context = await launch();
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('   [pageerror] ' + error.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('#create-passphrase').fill(PASSPHRASE);
  await page.locator('#create-confirm').fill(PASSPHRASE);
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('.shell', { timeout: 60000 });

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.stage-actions .btn-primary').click();
  await (await chooser).setFiles([fixture]);
  await page.waitForSelector('.card', { timeout: 60000 });
  await sleep(900);

  check('File stored in the first session', (await page.locator('.card').count()) === 1);
  check('Name is correct', (await page.textContent('.card-name')) === 'survives-restart.txt');

  // Closing the entire context is the real-world "user shut the browser".
  await context.close();
}

console.log('\nBrowser fully closed. Reopening with the same profile.');

{
  const context = await launch();
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('   [pageerror] ' + error.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth', { timeout: 20000 });

  check('Vault is detected as existing after a restart',
    (await page.textContent('.panel-eyebrow')) === 'Locked',
    await page.textContent('.panel-eyebrow'));

  await page.locator('#unlock-passphrase').fill(PASSPHRASE);
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('.shell', { timeout: 90000 });
  await sleep(1200);

  const cards = await page.locator('.card').count();
  check('Item survived a full browser restart', cards === 1, `${cards} cards`);

  if (cards) {
    await page.locator('.card').first().click();
    await page.waitForSelector('.drawer', { timeout: 10000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('.drawer-foot .btn-primary').click(),
    ]);

    const outPath = join(OUT, 'restored.txt');
    await download.saveAs(outPath);
    await sleep(600);

    const restored = readFileSync(outPath, 'utf8');
    check('Decrypted content is byte-identical after the restart', restored === content,
      `${restored.length} vs ${content.length} chars`);
  }

  await page.screenshot({ path: join(OUT, 'after-restart.png'), fullPage: true });
  await context.close();
}

console.log('\nThird launch: the vault still refuses a wrong passphrase');

{
  const context = await launch();
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth', { timeout: 20000 });
  await page.locator('#unlock-passphrase').fill('not-the-right-one-at-all-88!');
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('#unlock-passphrase.input-error', { timeout: 60000 });
  check('Wrong passphrase rejected after a restart', true);
  await context.close();
}

rmSync(profileDir, { recursive: true, force: true });

console.log('\n' + '='.repeat(56));
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(56) + '\n');

process.exit(failed ? 1 : 0);

