#!/usr/bin/env node
/**
 * Minimal static file server.
 *
 * Two reasons this exists rather than just opening index.html:
 *
 *   1. Web Crypto is only exposed on secure origins, and browsers treat
 *      http://localhost as secure — so file:// will not work at all.
 *   2. Service workers (and therefore installability + offline mode) require a
 *      real HTTP origin. Serving over file:// silently disables both.
 *
 * No dependencies.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT ?? 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Files that must always be revalidated: the service worker and the manifest.
// If either is stale, an install can serve a broken cache forever.
const NO_CACHE = new Set(['/sw.js', '/manifest.webmanifest']);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Block traversal outside the project root.
    const target = resolve(join(ROOT, normalize(pathname)));
    if (!target.startsWith(ROOT)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(target).catch(() => null);
    const filePath = info?.isDirectory() ? join(target, 'index.html') : target;

    const body = await readFile(filePath).catch(() => null);
    if (!body) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`Not found: ${pathname}`);
      return;
    }

    response.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': NO_CACHE.has(pathname) ? 'no-cache, must-revalidate' : 'no-cache',
      // A strict CSP: no inline scripts, no external origins at all. Fonts are
      // self-hosted, so this is genuinely airtight rather than aspirational.
      'content-security-policy': [
        "default-src 'self'",
        "script-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'geolocation=(), camera=(), microphone=()',
      // Service worker scope needs this in some browsers when served from a
      // subpath; harmless at the root.
      'service-worker-allowed': '/',
    }).end(body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(`Server error: ${error.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Aegis Vault running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
