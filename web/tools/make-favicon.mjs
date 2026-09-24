/**
 * Generates favicon.ico.
 *
 * Browsers request /favicon.ico from the origin root automatically, with no
 * link tag involved, so a missing file produces a 404 on every single page load
 * that no amount of `<link rel="icon">` markup can prevent. GitHub Pages serves
 * the repo under a subpath, so the request goes to the origin root and always
 * misses.
 *
 * This writes a real multi-resolution .ico (16/32/48/64) rather than renaming a
 * PNG, because the ICO container format is what browsers actually look for and
 * a mislabelled file renders inconsistently across them.
 *
 * Run with:  node tools/make-favicon.mjs
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH;
const OUT = join(process.cwd(), 'icons');

const BG = '#0a0b10';
const ACCENT = '#4ff0d0';
const SHIELD = 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z';

// 48 is the sweet spot for bookmark bars; 64 for high-DPI tab strips.
const SIZES = [16, 32, 48, 64];

function svgMarkup(size) {
  // At 16px the shield outline is ~1px thick and turns to mush, so scale the
  // art up slightly and thicken the stroke as the canvas shrinks.
  const scale = size <= 16 ? 0.88 : 0.8;
  const stroke = size <= 16 ? 2.4 : 1.9;
  const glyph = size * scale;
  const s = glyph / 24;
  const off = (size - glyph) / 2;
  const radius = size <= 16 ? 3 : size * 0.2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${off} ${off}) scale(${s})">
    <path d="${SHIELD}" fill="none" stroke="${ACCENT}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>`;
}

/**
 * Packs PNG buffers into a single .ico.
 *
 * The ICO format is a small header, then one 16-byte directory entry per image,
 * then the image payloads back to back. PNG payloads are legal and widely
 * supported (Vista+), and browsers pick the best size for the context.
 */
function packIco(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;
  const entries = [];

  for (const { size, data } of images) {
    const entry = Buffer.alloc(ENTRY);
    // 256 is encoded as 0 in this field.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  if (!CHROME) throw new Error('CHROME_PATH is not set.');
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();

  const images = [];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;background:transparent}
        svg{display:block}
      </style></head><body>${svgMarkup(size)}</body></html>`,
      { waitUntil: 'load' },
    );
    const el = await page.$('svg');
    const data = await el.screenshot({ omitBackground: true });
    images.push({ size, data });
    console.log(`  rendered ${size}x${size} (${data.length} bytes)`);
  }

  await browser.close();

  const ico = packIco(images);
  writeFileSync(join(OUT, 'favicon.ico'), ico);
  console.log(`\nwrote icons/favicon.ico — ${images.length} sizes, ${ico.length} bytes`);

  // Also a root-level copy. GitHub Pages serves the project at /<repo>/, and
  // browsers probe the *origin* root for /favicon.ico, which this repo cannot
  // own — so the link tag in index.html is what actually prevents the 404.
  // We still write it so a future custom domain or a root deploy just works.
  writeFileSync(join(process.cwd(), 'favicon.ico'), ico);
  console.log('wrote favicon.ico (root copy)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
