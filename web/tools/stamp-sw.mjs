/**
 * Stamps the service worker with a unique build id.
 *
 * A service worker's cache name must change whenever a precached asset changes.
 * If it does not, an already-installed client keeps serving the previous shell
 * indefinitely — which is not theoretical: during development a stale
 * `aegis-shell-v1` masked a real 404 for several deploy cycles, and it only
 * surfaced once the cache key was forced to change.
 *
 * Depending on a human to remember to bump a string guarantees this rots, so CI
 * rewrites the placeholder on every deploy instead.
 *
 * Run with:  node tools/stamp-sw.mjs [stamp]
 * Default stamp is the current UTC timestamp.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLACEHOLDER = '__BUILD_STAMP__';
const SW = join(process.cwd(), 'sw.js');

const stamp = (process.argv[2] ?? new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)).trim();

if (!/^[A-Za-z0-9_-]+$/.test(stamp)) {
  console.error(`Refusing to use unsafe stamp: ${stamp}`);
  process.exit(1);
}

const source = readFileSync(SW, 'utf8');

if (!source.includes(PLACEHOLDER)) {
  // Already stamped by a previous run — replace whatever value is there.
  const stamped = source.replace(
    /const BUILD_STAMP = '[^']*';/,
    `const BUILD_STAMP = '${stamp}';`,
  );
  if (stamped === source) {
    console.error('Could not find BUILD_STAMP to update.');
    process.exit(1);
  }
  writeFileSync(SW, stamped);
  console.log(`Re-stamped service worker: ${stamp}`);
  process.exit(0);
}

writeFileSync(SW, source.replaceAll(PLACEHOLDER, stamp));
console.log(`Stamped service worker: ${stamp}`);
