/**
 * Confirms the self-hosted fonts actually load and paint.
 * A 200 on the .woff2 is not proof — the CSS has to resolve the URL and the
 * browser has to accept the font, or the app silently falls back to system-ui.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH;
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:4400';
const OUT = join(process.cwd(), 'tools', 'out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const page = await context.newPage();

const fontRequests = [];
page.on('response', (r) => {
  if (/\.woff2?(\?|$)/.test(r.url())) fontRequests.push(`${r.status()} ${r.url()}`);
});

const external = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.origin !== new URL(ORIGIN).origin) external.push(r.url());
});

await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
// Give webfont loading a moment.
await page.waitForTimeout(2500);

console.log('--- font requests ---');
for (const f of fontRequests) console.log(f);

console.log('\n--- external (non-origin) requests ---');
console.log(external.length === 0 ? '(none)' : external.join('\n'));

const info = await page.evaluate(async () => {
  await document.fonts.ready;
  const loaded = [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
  const heading = document.querySelector('h1, .auth-title, .hero-title');
  const body = document.body;
  return {
    loaded,
    headingFont: heading ? getComputedStyle(heading).fontFamily : null,
    bodyFont: getComputedStyle(body).fontFamily,
    interAvailable: document.fonts.check('400 16px Inter'),
    monoAvailable: document.fonts.check('400 16px "JetBrains Mono"'),
  };
});

console.log('\n--- font-face status ---');
console.log(info.loaded.join('\n') || '(none registered)');
console.log('\nbody font-family:', info.bodyFont);
console.log('heading font-family:', info.headingFont);
console.log('Inter available:', info.interAvailable);
console.log('JetBrains Mono available:', info.monoAvailable);

await page.screenshot({ path: join(OUT, 'fonts-selfhosted.png') });
console.log('\nwrote fonts-selfhosted.png');

await browser.close();

const ok = info.interAvailable && info.monoAvailable && external.length === 0;
console.log(ok ? '\nOK: fonts self-hosted and loading, zero external requests' : '\nPROBLEM');
process.exit(ok ? 0 : 1);
