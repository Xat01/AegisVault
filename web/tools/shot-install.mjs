/**
 * Renders the install banner so it can be eyeballed without waiting for a real
 * beforeinstallprompt event (which browsers only fire on genuine installability,
 * never in a scripted screenshot run).
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH;
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:4400';
const OUT = join(process.cwd(), 'tools', 'out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });

async function shoot(name, viewport, variant) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  await page.evaluate((v) => {
    const host = document.getElementById('install-banner');
    const icon = (d) =>
      `<span class="${v === 'ios' ? 'install-glyph' : 'install-mark'}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg></span>`;
    const shield = 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z';
    const share = 'M12 16V4M8 8l4-4 4 4M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5';

    host.hidden = false;
    host.innerHTML =
      icon(shield) +
      '<div class="install-copy"><strong>' +
      (v === 'ios' ? 'Install on iPhone or iPad' : 'Install Aegis Vault') +
      '</strong><span>' +
      (v === 'ios'
        ? 'Tap ' + icon(share) + ' Share, then choose &ldquo;Add to Home Screen&rdquo;.'
        : 'Add it to your home screen. Works fully offline.') +
      '</span></div>' +
      (v === 'ios' ? '' : '<button class="install-action" type="button">Install</button>') +
      '<button class="install-close" type="button">\u2715</button>';

    // Force the visible state without relying on requestAnimationFrame timing.
    host.classList.add('is-visible');
  }, variant);

  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, name) });
  console.log('wrote', name);
  await context.close();
}

await shoot('install-android.png', { width: 412, height: 915 }, 'chrome');
await shoot('install-ios.png', { width: 390, height: 844 }, 'ios');

// Light theme too.
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'light';
  const host = document.getElementById('install-banner');
  host.hidden = false;
  host.innerHTML =
    '<span class="install-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"/></svg></span>' +
    '<div class="install-copy"><strong>Install Aegis Vault</strong><span>Add it to your home screen. Works fully offline.</span></div>' +
    '<button class="install-action" type="button">Install</button>' +
    '<button class="install-close" type="button">\u2715</button>';
  host.classList.add('is-visible');
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'install-light.png') });
console.log('wrote install-light.png');
await context.close();

await browser.close();
