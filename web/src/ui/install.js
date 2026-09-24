/**
 * Install experience.
 *
 * A PWA is only genuinely "installable" if the browser decides it is AND the
 * user can find the affordance. Chrome on Android hides the install UI in an
 * overflow menu, and iOS Safari has no automatic prompt at all — so the app has
 * to do the teaching itself. This module handles three cases:
 *
 *   - Chromium (Android/desktop): the browser fires `beforeinstallprompt`. We
 *     stash the event and show our own banner; tapping it calls `prompt()`.
 *   - iOS Safari: no event ever fires. We detect iOS and show the manual
 *     "Share → Add to Home Screen" instructions.
 *   - Already installed: detected via `display-mode: standalone` or the legacy
 *     iOS `navigator.standalone`, so the banner never nags an installed user.
 *
 * Nothing here touches vault data. It is pure presentation.
 */

import { h, $ } from './dom.js';

const DISMISS_KEY = 'aegis.install.dismissed';
const DISMISS_DAYS = 30;

let deferredPrompt = null;

/** True when the app is already running as an installed app, not a tab. */
export function isStandalone() {
  if (globalThis.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (globalThis.matchMedia?.('(display-mode: window-controls-overlay)').matches) return true;
  // iOS predates the display-mode media query for this purpose.
  if (navigator.standalone === true) return true;
  return false;
}

/** True when the browser supports a real programmatic install prompt. */
export function isInstallable() {
  return deferredPrompt != null;
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS 13+ masquerades as desktop Safari, so also check for touch.
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadDesktopMode;
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
  } catch {
    // Private mode: the banner will simply reappear next session.
  }
  hideBanner();
}

function hideBanner() {
  const host = $('#install-banner');
  if (!host) return;
  host.classList.remove('is-visible');
  host.hidden = true;
}

function showBanner(...children) {
  const host = $('#install-banner');
  if (!host) return;
  host.replaceChildren(...children);
  host.hidden = false;
  // Let the element be laid out before animating, so the transition runs.
  requestAnimationFrame(() => host.classList.add('is-visible'));
}

const closeButton = () =>
  h(
    'button',
    {
      class: 'install-close',
      type: 'button',
      'aria-label': 'Dismiss install prompt',
      onclick: dismiss,
    },
    '✕',
  );

/** The app-icon mark, reused so the banner reads as Aegis Vault. */
function mark() {
  const node = h('span', { class: 'install-mark', 'aria-hidden': 'true' });
  node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"/></svg>`;
  return node;
}

function showChromeBanner() {
  const install = h(
    'button',
    {
      class: 'install-action',
      type: 'button',
      onclick: async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'accepted') {
          hideBanner();
        } else {
          dismiss();
        }
      },
    },
    'Install',
  );

  showBanner(
    mark(),
    h(
      'div',
      { class: 'install-copy' },
      h('strong', {}, 'Install Aegis Vault'),
      h('span', {}, 'Add it to your home screen. Works fully offline.'),
    ),
    install,
    closeButton(),
  );
}

function showIOSBanner() {
  const share = h('span', { class: 'install-glyph', 'aria-hidden': 'true' });
  share.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5"/></svg>`;

  showBanner(
    mark(),
    h(
      'div',
      { class: 'install-copy' },
      h('strong', {}, 'Install on iPhone or iPad'),
      h(
        'span',
        {},
        'Tap ',
        share,
        ' Share, then choose “Add to Home Screen”.',
      ),
    ),
    closeButton(),
  );
}

/**
 * Registers the service worker and wires up the install affordances.
 * Safe to call on every boot; it degrades to a no-op where unsupported.
 */
export function initInstall() {
  // Already installed — never nag.
  if (isStandalone()) return;

  registerServiceWorker();

  globalThis.addEventListener('beforeinstallprompt', (event) => {
    // Chrome will show its own mini-infobar without this.
    event.preventDefault();
    deferredPrompt = event;
    if (!wasRecentlyDismissed()) showChromeBanner();
  });

  globalThis.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* ignore */
    }
  });

  // iOS never fires beforeinstallprompt, so offer the manual route once the
  // user has had a moment to look at the app.
  if (isIOS() && !wasRecentlyDismissed()) {
    setTimeout(() => {
      if (!isStandalone()) showIOSBanner();
    }, 2600);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Service workers require a secure context. On plain http:// (other than
  // localhost) registration throws, so guard rather than spam the console.
  if (!globalThis.isSecureContext) return;

  // app.js is loaded as a module, which is deferred — by the time this runs the
  // `load` event may already have fired, and addEventListener('load') would
  // then never fire at all. Register immediately instead of waiting.
  registerNow();
}

async function registerNow() {
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
    });

    // If a newer worker is waiting, let it take over on next navigation.
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage('SKIP_WAITING');
        }
      });
    });
  } catch (error) {
    // Registration failure must not break the app — it only costs offline
    // support and installability.
    console.warn('[aegis] service worker registration failed:', error);
  }
}
