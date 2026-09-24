/**
 * Generates the PWA icon set as real PNG files.
 *
 * Android's install prompt and the home-screen launcher both want raster icons;
 * several Android launchers ignore SVG entirely, so shipping only an SVG icon
 * means the app can install but looks broken on the home screen. This renders
 * the same shield mark the in-app UI uses, at each required size, by loading an
 * SVG in Chrome and screenshotting it with a transparent background.
 *
 * Two variants are produced:
 *   - "any"      : rounded-square badge, used as-is by launchers
 *   - "maskable" : art inset to ~62% so Android's circular/squircle crop
 *                  never clips the shield
 *
 * Run with:  node tools/make-icons.mjs
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH;
const OUT = join(process.cwd(), 'icons');

const BG = '#0a0b10';
const ACCENT = '#4ff0d0';

// The shield glyph itself, in a 24x24 coordinate space.
const SHIELD_PATH = 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z';

function svg({ size, maskable }) {
  // Maskable art must survive a circular crop, so it sits inside the
  // "safe zone" — roughly the middle 80% of the canvas, and we stay well
  // inside that at 62%.
  const logoScale = maskable ? 0.62 : 0.78;
  const logoSize = 24 * 1; // glyph is authored in a 24 box
  const glyphPx = size * logoScale;
  const scale = glyphPx / logoSize;
  const offset = (size - glyphPx) / 2;
  const radius = maskable ? 0 : size * 0.22;
  const strokeWidth = maskable ? 1.9 : 1.7;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="${SHIELD_PATH}" fill="none" stroke="${ACCENT}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>`;
}

const TARGETS = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon-32.png', size: 32, maskable: false },
];

async function main() {
  if (!CHROME) {
    throw new Error('CHROME_PATH is not set. Point it at a Chrome/Chromium binary.');
  }
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  for (const target of TARGETS) {
    const markup = svg(target);
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;background:transparent;}
        svg{display:block;}
      </style></head><body>${markup}</body></html>`,
      { waitUntil: 'load' },
    );

    const element = await page.$('svg');
    const buffer = await element.screenshot({ omitBackground: true });
    const path = join(OUT, target.name);
    writeFileSync(path, buffer);
    console.log(`wrote ${target.name} (${target.size}x${target.size}, ${buffer.length} bytes)`);
  }

  await browser.close();
  console.log(`\nIcons written to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
