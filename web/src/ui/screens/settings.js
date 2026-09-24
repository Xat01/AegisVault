/**
 * Settings screen.
 *
 * Beyond preferences, this contains two things that exist to be honest with the
 * user: a plain statement of what is and is not protected, and a derivation lab
 * that lets them measure the real cost of their own key derivation.
 */

import { h, replace } from '../dom.js';
import { icons } from '../icons.js';
import { openModal, toast } from '../components.js';
import { formatBytes, formatDate } from '../../core/format.js';
import { scorePassphrase } from '../../core/events.js';
import { KDF, CIPHER, deriveBits, randomBytes } from '../../core/crypto.js';

function settingCard(title, desc) {
  return h('div', { class: 'setting-card' },
    h('div', { class: 'setting-card-head' },
      h('div', { class: 'setting-card-title' }, title),
      desc ? h('div', { class: 'setting-card-desc' }, desc) : null,
    ),
  );
}

function settingRow(name, desc, control) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-info' },
      h('div', { class: 'setting-name' }, name),
      desc ? h('div', { class: 'setting-desc' }, desc) : null,
    ),
    control,
  );
}

function toggle(on, onChange, label) {
  const node = h('button', {
    class: `switch${on ? ' on' : ''}`,
    role: 'switch',
    'aria-checked': String(on),
    'aria-label': label,
    onclick: () => onChange(!on),
  });
  return node;
}

/** Measure PBKDF2 at several iteration counts so the delay is tangible. */
function derivationLab() {
  const output = h('div', { class: 'text-muted', style: { fontSize: '12px' } }, 'Not measured yet.');

  const run = h(
    'button',
    {
      class: 'btn btn-ghost btn-sm',
      onclick: async () => {
        replace(output, null, 'Measuring…');
        run.disabled = true;

        const rows = [];
        for (const iterations of [100_000, 300_000, KDF.iterations, 1_000_000]) {
          const salt = randomBytes(16);
          const started = performance.now();
          await deriveBits('aegis-measurement-passphrase', salt, { iterations, bits: 256 });
          const elapsed = performance.now() - started;
          rows.push({ iterations, elapsed });
        }

        replace(
          output,
          null,
          h('div', { class: 'kv', style: { marginTop: '10px' } },
            ...rows.map((row) =>
              h('div', { class: 'kv-row' },
                h('span', { class: 'kv-key' }, `${row.iterations.toLocaleString()} iterations`),
                h('span', { class: 'kv-val mono' },
                  `${row.elapsed.toFixed(0)} ms`,
                  row.iterations === KDF.iterations ? ' · this vault' : '',
                ),
              ),
            ),
          ),
          h('div', { class: 'setting-desc', style: { marginTop: '10px' } },
            'An offline attacker pays this same cost for every passphrase they try. ',
            'This is why passphrase length matters more than anything else — it multiplies their work, not yours.',
          ),
        );

        run.disabled = false;
      },
    },
    h('span', { html: icons.zap(14).outerHTML }),
    'Run measurement',
  );

  return h('div', null, run, output);
}

export function renderSettings(root, { state, actions, vault }) {
  const settings = vault.settings;
  const wrap = h('div', { class: 'stage grow' });

  const head = h('div', { class: 'stage-head' },
    h('div', null,
      h('h1', { class: 'stage-title' }, 'Settings'),
      h('div', { class: 'stage-meta' }, 'stored encrypted with your vault key'),
    ),
    h('div', { class: 'stage-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => actions.goVault() },
        h('span', { html: icons.arrowRight(14).outerHTML, style: { transform: 'rotate(180deg)', display: 'inline-flex' } }),
        'Back to vault',
      ),
    ),
  );

  const grid = h('div', { class: 'settings-grid' });

  /* ---- appearance ---- */

  const appearance = settingCard('Appearance', 'How the vault presents itself. These preferences are stored inside the encrypted index.');
  appearance.append(
    settingRow('Theme', 'Dark is the primary aesthetic. Light is available for bright rooms.',
      h('div', { class: 'segmented' },
        h('button', { class: settings.theme === 'dark' ? 'active' : '', onclick: () => actions.setTheme('dark') }, 'Dark'),
        h('button', { class: settings.theme === 'light' ? 'active' : '', onclick: () => actions.setTheme('light') }, 'Light'),
      ),
    ),
    settingRow('Reduce motion', 'Disables entrance animations and transitions across the interface.',
      toggle(settings.reduceMotion, (value) => actions.setSetting('reduceMotion', value), 'Reduce motion'),
    ),
    settingRow('Byte inspector', 'Show the colour-coded container header in the item inspector.',
      toggle(settings.showByteInspector, (value) => actions.setSetting('showByteInspector', value), 'Byte inspector'),
    ),
  );

  /* ---- behaviour ---- */

  const behaviour = settingCard('Behaviour', 'How the vault responds to your actions.');
  behaviour.append(
    settingRow('Confirm before deleting', 'Ask for confirmation before an item is removed from the vault.',
      toggle(settings.confirmBeforeDelete, (value) => actions.setSetting('confirmBeforeDelete', value), 'Confirm before deleting'),
    ),
    settingRow('Auto-lock', 'Lock the vault and clear the key from memory after a period of inactivity. Manual lock is always available.',
      h('select', {
        class: 'select',
        'aria-label': 'Auto-lock timeout',
        onchange: (event) => actions.setSetting('autoLockMinutes', Number(event.target.value)),
      },
        ...[0, 1, 5, 15, 30, 60].map((minutes) =>
          h('option', { value: String(minutes), selected: settings.autoLockMinutes === minutes },
            minutes === 0 ? 'Never' : `${minutes} minute${minutes === 1 ? '' : 's'}`,
          ),
        ),
      ),
    ),
  );

  /* ---- crypto ---- */

  const crypto = settingCard('Cryptography', 'The parameters protecting this vault. Salts and nonces are generated fresh for every file.');
  crypto.append(
    h('div', { class: 'kv' },
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Key derivation'), h('span', { class: 'kv-val mono' }, `${KDF.name}-${KDF.hash}`)),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Iterations'), h('span', { class: 'kv-val mono' }, KDF.iterations.toLocaleString())),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Cipher'), h('span', { class: 'kv-val mono' }, `${CIPHER.name}-${CIPHER.keyBits}`)),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Nonce'), h('span', { class: 'kv-val mono' }, `${CIPHER.nonceBytes} bytes, per file`)),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Tag'), h('span', { class: 'kv-val mono' }, `${CIPHER.tagBits} bits`)),
    ),
    h('div', { style: { padding: '16px 18px' } },
      h('div', { class: 'setting-name', style: { marginBottom: '4px' } }, 'Derivation lab'),
      h('div', { class: 'setting-desc', style: { marginBottom: '12px' } },
        'Measure how long key derivation actually takes on this device at different iteration counts.',
      ),
      derivationLab(),
    ),
    settingRow('Change master passphrase', 'Re-wraps the vault key. File containers keep their own salts, so nothing needs re-encrypting.',
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => actions.changePassphrase() },
        h('span', { html: icons.key(14).outerHTML }),
        'Change',
      ),
    ),
    settingRow('Lock now', 'Clear the derived key from memory. Your files stay on disk, sealed.',
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => actions.lock() },
        h('span', { html: icons.lock(14).outerHTML }),
        'Lock',
      ),
    ),
  );

  /* ---- privacy ---- */

  const privacy = settingCard('Privacy', 'What this application does and does not protect. Stated plainly rather than implied.');

  const protections = [
    ['Protected', 'File contents — sealed with AES-256-GCM under a key derived from your passphrase.', true],
    ['Protected', 'File names, tags and notes — the index itself is encrypted, not stored as a readable table.', true],
    ['Protected', 'Nothing is transmitted. This build makes no network requests of any kind.', true],
    ['Not protected', 'The number of files in the vault, and the approximate size of each one.', false],
    ['Not protected', 'When each item was added, from local storage metadata.', false],
    ['Not protected', 'A compromised device or browser. Malware can read memory while the vault is unlocked.', false],
  ];

  privacy.append(
    h('div', { style: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' } },
      ...protections.map(([kind, text, good]) =>
        h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '11px' } },
          h('span', {
            style: { color: good ? 'var(--accent)' : 'var(--warn)', flexShrink: '0', marginTop: '1px' },
            html: (good ? icons.check : icons.alert)(15).outerHTML,
          }),
          h('div', null,
            h('div', { class: 'setting-name', style: { color: good ? 'var(--accent)' : 'var(--warn)', fontSize: '11.5px', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' } }, kind),
            h('div', { class: 'setting-desc', style: { marginTop: '3px' } }, text),
          ),
        ),
      ),
    ),
  );

  /* ---- storage ---- */

  const storage = settingCard('Storage', 'Where your encrypted containers live on this device.');
  storage.append(
    h('div', { class: 'kv' },
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Items'), h('span', { class: 'kv-val mono' }, String(state.items.length))),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Encrypted bytes'), h('span', { class: 'kv-val mono' }, formatBytes(state.items.reduce((sum, item) => sum + item.container.totalLength, 0)))),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Originals'), h('span', { class: 'kv-val mono' }, formatBytes(state.items.reduce((sum, item) => sum + item.size, 0)))),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Browser quota'), h('span', { class: 'kv-val mono' }, state.quota ? `${formatBytes(state.quota.usage)} of ${formatBytes(state.quota.quota)}` : 'unavailable')),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Persistent'), h('span', { class: 'kv-val mono' }, state.persisted ? 'granted' : 'not granted')),
      h('div', { class: 'kv-row' }, h('span', { class: 'kv-key' }, 'Vault created'), h('span', { class: 'kv-val mono' }, formatDate(state.createdAt))),
    ),
  );

  /* ---- danger zone ---- */

  const danger = settingCard('Danger zone', null);
  danger.classList.add('danger-zone');
  danger.append(
    settingRow('Destroy this vault', 'Erase every encrypted container, the index, and the stored key material. This cannot be undone and there is no recovery path.',
      h('button', { class: 'btn btn-danger-ghost btn-sm', onclick: () => actions.destroyVault() },
        h('span', { html: icons.trash(14).outerHTML }),
        'Destroy vault',
      ),
    ),
  );

  grid.append(appearance, behaviour, crypto, privacy, storage, danger);

  wrap.append(head, h('div', { class: 'scroll-area' }, grid));
  root.append(wrap);
}
