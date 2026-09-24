/**
 * Application shell.
 *
 * Owns all state and all actions. Screens are pure renderers that receive state
 * and an actions object; nothing outside this file mutates state directly.
 */

import { h, replace, $ } from './ui/dom.js';
import { icons } from './ui/icons.js';
import { toast, openPalette, openModal, saveBlob } from './ui/components.js';
import { renderAuth } from './ui/screens/auth.js';
import { renderVault, renderTopbar, classify } from './ui/screens/vault.js';
import { openInspector, showRawDump, confirmDialog } from './ui/screens/inspector.js';
import { renderSettings } from './ui/screens/settings.js';
import { createVault, VaultStatus } from './core/vault.js';
import { formatBytes, sanitizeFilename, extensionOf } from './core/format.js';
import { scorePassphrase } from './core/events.js';
import { MAX_FILE_BYTES } from './core/constants.js';
import { metaStore, isPersisted } from './core/db.js';
import { unlockVault } from './core/keystore.js';
import { initInstall } from './ui/install.js';

const root = document.getElementById('app');
const vault = createVault();

const state = {
  view: 'vault', // 'vault' | 'settings'
  filter: 'all',
  typeFilter: 'all',
  sort: 'newest',
  layout: 'grid',
  query: '',
  selection: new Set(),
  items: [],
  quota: null,
  persisted: false,
  createdAt: null,
  theme: 'dark',
  loading: false,
  railOpen: false,
};

/* ------------------------------------------------------------------ helpers */

const TYPE_FILTERS = {
  image: (item) => (item.type || '').startsWith('image/'),
  video: (item) => (item.type || '').startsWith('video/'),
  audio: (item) => (item.type || '').startsWith('audio/'),
  pdf: (item) => item.type === 'application/pdf' || extensionOf(item.name) === 'pdf',
  code: (item) => classify(item).kind === 'code',
  archive: (item) => classify(item).kind === 'archive',
  text: (item) => classify(item).kind === 'text',
};

function getVisibleItems() {
  let list = [...state.items];

  if (state.filter === 'recent') {
    list = list.filter((item) => Date.now() - item.createdAt < 7 * 24 * 60 * 60 * 1000);
  } else if (state.filter === 'verified') {
    list = list.filter((item) => item.verifiedAt);
  } else if (state.filter.startsWith('tag:')) {
    const tag = state.filter.slice(4);
    list = list.filter((item) => (item.tags ?? []).includes(tag));
  }

  if (state.typeFilter !== 'all' && TYPE_FILTERS[state.typeFilter]) {
    list = list.filter(TYPE_FILTERS[state.typeFilter]);
  }

  if (state.query.trim()) {
    const needle = state.query.trim().toLowerCase();
    list = list.filter((item) =>
      item.name.toLowerCase().includes(needle) ||
      (item.note ?? '').toLowerCase().includes(needle) ||
      (item.tags ?? []).some((tag) => tag.toLowerCase().includes(needle)) ||
      item.plainHash.startsWith(needle),
    );
  }

  const sorters = {
    newest: (a, b) => b.createdAt - a.createdAt,
    name: (a, b) => a.name.localeCompare(b.name),
    size: (a, b) => b.size - a.size,
  };
  list.sort(sorters[state.sort]);

  return list;
}

function getViewTitle() {
  if (state.query.trim()) return `Search`;
  if (state.filter === 'all') return 'All items';
  if (state.filter === 'recent') return 'Added recently';
  if (state.filter === 'verified') return 'Verified items';
  if (state.filter.startsWith('tag:')) return `#${state.filter.slice(4)}`;
  return 'Items';
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.motion = vault.settings.reduceMotion ? 'reduced' : 'full';
  localStorage.setItem('aegis.theme', state.theme);
}

let refreshQuota = async () => {
  try {
    state.quota = await vault.storageEstimate;
  } catch {
    state.quota = null;
  }
};

/* ------------------------------------------------------------------- render */

function render() {
  replace(root, null);

  if (vault.status === VaultStatus.UNINITIALIZED || vault.status === VaultStatus.LOCKED) {
    renderAuth(root, { vault, onUnlocked: () => render() });
    return;
  }

  const shell = h('div', { class: 'shell' }, renderTopbar({ state, actions }));

  // The vault screen returns the full split layout; settings returns a stage
  // that owns its own scrolling, so it is wrapped directly.
  shell.appendChild(
    state.view === 'settings'
      ? renderSettingsScreen()
      : renderVault(null, { state, actions, vault }),
  );

  root.appendChild(shell);
}

function renderSettingsScreen() {
  const stage = h('div', { class: 'body-split' });
  stage.appendChild(h('div', { class: 'grow' }));
  renderSettings(stage, { state, actions, vault });
  return stage;
}

function refresh() {
  const scrollTop = $('.scroll-area')?.scrollTop ?? 0;
  render();
  const area = $('.scroll-area');
  if (area) area.scrollTop = scrollTop;
}

/* ------------------------------------------------------------------ actions */

/** Shared guard for actions that need the vault key. */
function requireUnlocked() {
  if (!vault.isUnlocked) {
    toast('Vault is locked', { kind: 'error', text: 'Unlock before performing that action.' });
    return false;
  }
  return true;
}

const actions = {
  getVisibleItems,
  getViewTitle,

  setFilter(filter) {
    state.filter = filter;
    state.railOpen = false;
    refresh();
  },

  setTypeFilter(value) {
    state.typeFilter = value;
    refresh();
  },

  setSort(sort) {
    state.sort = sort;
    refresh();
  },

  setLayout(layout) {
    state.layout = layout;
    localStorage.setItem('aegis.layout', layout);
    refresh();
  },

  setQuery(query) {
    state.query = query;
    const search = document.getElementById('vault-search');
    if (search && search.value !== query) search.value = query;
    refresh();
  },

  toggleRail() {
    state.railOpen = !state.railOpen;
    refresh();
  },

  toggleSelect(id, exclusive = false) {
    if (exclusive) state.selection.clear();
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
    refresh();
  },

  goVault() {
    state.view = 'vault';
    refresh();
  },

  goSettings() {
    state.view = 'settings';
    refresh();
  },

  refresh,

  openInspector(id) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    openInspector(item, vault, actions);
  },

  /** Raw ciphertext preview, exposed from the inspector. */
  showRawDump(id) {
    const item = state.items.find((entry) => entry.id === id);
    if (item) showRawDump(item, vault);
  },

  /** Open the file picker and route the chosen files into the ingest pipeline. */
  addFiles() {
    if (!requireUnlocked()) return;

    const picker = h('input', {
      type: 'file',
      multiple: true,
      style: { display: 'none' },
    });
    picker.addEventListener('change', () => {
      const files = [...picker.files];
      picker.remove();
      if (files.length) actions.ingestFiles(files);
    });
    document.body.appendChild(picker);
    picker.click();
  },

  /**
   * Encrypt a batch of files, one at a time, with live progress.
   * Files that fail are reported individually and never partially added.
   */
  async ingestFiles(files) {
    if (!requireUnlocked()) return;

    const oversized = files.filter((file) => file.size > MAX_FILE_BYTES);
    const acceptable = files.filter((file) => file.size <= MAX_FILE_BYTES);

    if (oversized.length) {
      toast(
        `${oversized.length} file${oversized.length === 1 ? '' : 's'} skipped`,
        {
          kind: 'error',
          text: `${oversized.map((file) => file.name).join(', ')} — over the ${formatBytes(MAX_FILE_BYTES)} in-memory limit.`,
          duration: 7000,
        },
      );
    }

    if (!acceptable.length) return;

    const progress = showProgress(`Encrypting ${acceptable.length} file${acceptable.length === 1 ? '' : 's'}`);
    let succeeded = 0;
    const failures = [];

    for (let index = 0; index < acceptable.length; index += 1) {
      const file = acceptable[index];
      progress.setCount(index, acceptable.length);
      progress.setStage(`Preparing ${file.name}`);

      try {
        await vault.addFile(file, { onStage: (_stage, message) => progress.setStage(`${message}`) });
        succeeded += 1;
      } catch (error) {
        failures.push({ name: file.name, message: error.message });
      }
    }

    progress.setCount(acceptable.length, acceptable.length);
    progress.done();
    refreshQuota();

    if (succeeded) {
      toast(`${succeeded} file${succeeded === 1 ? '' : 's'} encrypted`, {
        kind: 'success',
        text: 'Each container carries its own salt and nonce.',
      });
    }
    for (const failure of failures) {
      toast(`Could not add ${failure.name}`, { kind: 'error', text: failure.message, duration: 8000 });
    }

    refresh();
  },

  async deleteItems(ids, { skipConfirm = false } = {}) {
    if (!requireUnlocked()) return;

    const items = ids.map((id) => state.items.find((entry) => entry.id === id)).filter(Boolean);
    if (!items.length) return;

    const label = items.length === 1 ? `"${items[0].name}"` : `${items.length} items`;

    const perform = async () => {
      const needsPassphrase = vault.settings.confirmBeforeDelete;
      const passphrase = needsPassphrase ? await promptPassphrase() : null;
      if (needsPassphrase && passphrase === null) return;

      // Deleting is destructive, so re-verify the passphrase when confirmation is on.
      if (passphrase) {
        const record = await metaStore.get();
        const verified = await unlockVault(record, passphrase);
        if (!verified) {
          toast('Incorrect passphrase', { kind: 'error', text: 'Nothing was deleted.' });
          return;
        }
      }

      let removed = 0;
      for (const item of items) {
        try {
          await vault.deleteItem(item.id);
          state.selection.delete(item.id);
          removed += 1;
        } catch (error) {
          toast(`Could not delete ${item.name}`, { kind: 'error', text: error.message });
        }
      }

      if (removed) toast(`${removed} item${removed === 1 ? '' : 's'} deleted`, { kind: 'info', text: 'Containers were removed from local storage.' });
      refreshQuota();
      refresh();
    };

    if (!skipConfirm) {
      confirmDialog({
        title: `Delete ${label}?`,
        text: 'The encrypted container is removed from this device. This cannot be undone — there is no trash and no recovery.',
        confirmLabel: 'Delete',
        kind: 'btn-danger',
        onConfirm: perform,
      });
    } else {
      await perform();
    }
  },

  deleteSelected() {
    actions.deleteItems([...state.selection]);
  },

  async renameItem(item) {
    openModal({
      title: 'Rename item',
      text: 'Only the display name changes. The encrypted container and its key material are untouched.',
      icon: icons.file,
      render: (body) => {
        const input = h('input', {
          class: 'input',
          value: item.name,
          'aria-label': 'New name',
          onkeydown: (event) => {
            if (event.key === 'Enter') body.closest('.modal').querySelector('.modal-actions .btn-danger, .modal-actions .btn-primary')?.click();
          },
        });
        setTimeout(() => { input.focus(); input.select(); }, 60);
        body.appendChild(input);
      },
      actions: [
        { label: 'Cancel', kind: 'btn-ghost' },
        {
          label: 'Rename',
          kind: 'btn-primary',
          onClick: async () => {
            const input = document.querySelector('.modal .input');
            const next = sanitizeFilename(input.value.trim(), item.name);
            if (!next || next === item.name) return false;
            await vault.updateItem(item.id, { name: next });
            toast('Renamed', { kind: 'success', text: `${item.name} → ${next}` });
            refresh();
          },
        },
      ],
    });
  },

  async changePassphrase() {
    openModal({
      title: 'Change master passphrase',
      text: 'The vault key is re-wrapped under the new passphrase. Because each file container carries its own salt, your stored files are not re-encrypted.',
      icon: icons.key,
      render: (body) => {
        const current = h('input', { class: 'input mono', type: 'password', placeholder: 'Current passphrase', 'aria-label': 'Current passphrase' });
        const next = h('input', { class: 'input mono', type: 'password', placeholder: 'New passphrase', 'aria-label': 'New passphrase' });
        const meter = h('div', { class: 'field-hint' }, 'Aim for 20 characters or more.');

        next.addEventListener('input', () => {
          const result = scorePassphrase(next.value);
          meter.textContent = `${result.label} · ~${result.entropy} bits of entropy`;
          meter.className = `field-hint${result.acceptable ? '' : ' text-warn'}`;
        });

        body.append(
          h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Current passphrase'), current),
          h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'New passphrase'), next, meter),
        );
        setTimeout(() => current.focus(), 60);
      },
      actions: [
        { label: 'Cancel', kind: 'btn-ghost' },
        {
          label: 'Change passphrase',
          kind: 'btn-primary',
          onClick: async () => {
            const inputs = [...document.querySelectorAll('.modal .input')];
            const [current, next] = inputs.map((input) => input.value);
            try {
              await vault.changePassphrase(current, next);
              toast('Passphrase changed', { kind: 'success', text: 'The vault key has been re-wrapped.' });
            } catch (error) {
              toast('Could not change passphrase', { kind: 'error', text: error.message });
              return false;
            }
          },
        },
      ],
    });
  },

  async destroyVault() {
    openModal({
      title: 'Destroy this vault?',
      text: 'Every encrypted container, the index, and the stored key material will be erased from this device. There is no recovery path, and no backup exists anywhere.',
      icon: icons.alert,
      iconKind: 'danger',
      dismissible: true,
      render: (body, close) => {
        const input = h('input', { class: 'input mono', placeholder: 'Type DESTROY to confirm', 'aria-label': 'Confirmation phrase' });
        const button = h('button', { class: 'btn btn-danger', disabled: true }, 'Destroy vault');
        input.addEventListener('input', () => { button.disabled = input.value !== 'DESTROY'; });
        button.addEventListener('click', async () => {
          button.disabled = true;
          replace(button, null, h('span', { class: 'spinner' }), 'Erasing…');
          await vault.destroy();
          close();
          toast('Vault destroyed', { kind: 'info', text: 'All local data has been erased.' });
          state.items = [];
          state.selection.clear();
          state.view = 'vault';
          render();
        });
        body.append(
          input,
          h('div', { class: 'modal-actions mt-16' },
            h('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Cancel'),
            button,
          ),
        );
      },
    });
  },

  setTheme(theme) {
    state.theme = theme;
    applyTheme();
    vault.updateSettings({ theme });
    refresh();
  },

  toggleTheme() {
    actions.setTheme(state.theme === 'dark' ? 'light' : 'dark');
  },

  setSetting(key, value) {
    vault.updateSettings({ [key]: value });
    if (key === 'reduceMotion') document.documentElement.dataset.motion = value ? 'reduced' : 'full';
    refresh();
  },

  lock() {
    vault.lock();
    render();
  },

  openPalette() {
    const itemCommands = state.items.slice(0, 12).map((item) => ({
      id: `item:${item.id}`,
      label: item.name,
      hint: formatBytes(item.size),
      icon: icons.file,
      run: () => actions.openInspector(item.id),
    }));

    openPalette({
      placeholder: 'Search items or run a command…',
      groups: [
        {
          label: 'Actions',
          items: [
            { id: 'add', label: 'Add files to vault', hint: 'A', icon: icons.plus, run: () => actions.addFiles() },
            { id: 'settings', label: 'Open settings', hint: '⌘,', icon: icons.settings, run: () => actions.goSettings() },
            { id: 'theme', label: 'Toggle light / dark theme', icon: state.theme === 'dark' ? icons.sun : icons.moon, run: () => actions.toggleTheme() },
            { id: 'lock', label: 'Lock vault now', hint: '⌘L', icon: icons.lock, run: () => actions.lock() },
            { id: 'verifyAll', label: 'Verify every item', icon: icons.fingerprint, run: () => actions.verifyAll() },
          ],
        },
        ...(itemCommands.length ? [{ label: 'Items', items: itemCommands }] : []),
      ],
    });
  },

  async verifyAll() {
    if (!requireUnlocked()) return;
    const targets = state.items;
    if (!targets.length) {
      toast('Nothing to verify', { kind: 'info', text: 'The vault is empty.' });
      return;
    }

    const progress = showProgress(`Verifying ${targets.length} item${targets.length === 1 ? '' : 's'}`);
    let ok = 0;
    const bad = [];

    for (let index = 0; index < targets.length; index += 1) {
      const item = targets[index];
      progress.setCount(index, targets.length);
      progress.setStage(`Authenticating ${item.name}`);
      const result = await vault.verifyItem(item.id);
      if (result.ok) ok += 1;
      else bad.push({ name: item.name, error: result.error });
    }

    progress.setCount(targets.length, targets.length);
    progress.done();

    if (bad.length) {
      toast(`${ok} verified, ${bad.length} failed`, {
        kind: 'error',
        text: bad.map((entry) => `${entry.name}: ${entry.error}`).join(' · '),
        duration: 9000,
      });
    } else {
      toast('All items verified', { kind: 'success', text: `${ok} container${ok === 1 ? '' : 's'} authenticate against their tags.` });
    }

    refresh();
  },
};

/* ----------------------------------------------------------------- progress */

function showProgress(title) {
  const fill = h('div', { class: 'op-fill', style: { width: '0%' } });
  const count = h('span', { class: 'op-count' }, '0 / 0');
  const stage = h('div', { class: 'op-stage' }, 'Starting…');

  const node = h('div', { class: 'op-progress' },
    h('div', { class: 'op-head' },
      h('span', { class: 'spinner' }),
      h('span', { class: 'op-title' }, title),
      count,
    ),
    h('div', { class: 'op-bar' }, fill),
    stage,
  );

  document.body.appendChild(node);

  return {
    setCount(done, total) {
      count.textContent = `${done} / ${total}`;
      fill.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    },
    setStage(text) {
      stage.textContent = text;
    },
    done() {
      fill.style.width = '100%';
      setTimeout(() => node.remove(), 320);
    },
  };
}

function promptPassphrase() {
  return new Promise((resolve) => {
    let value = null;

    openModal({
      title: 'Confirm with your passphrase',
      text: 'Removing an item destroys its container irreversibly. Re-enter your passphrase to continue.',
      icon: icons.key,
      render: (body) => {
        const input = h('input', {
          class: 'input mono',
          type: 'password',
          placeholder: 'Master passphrase',
          'aria-label': 'Master passphrase',
        });
        input.addEventListener('input', () => { value = input.value; });
        setTimeout(() => input.focus(), 60);
        body.appendChild(input);
      },
      actions: [
        { label: 'Cancel', kind: 'btn-ghost', onClick: () => { resolve(null); return false; } },
        { label: 'Confirm', kind: 'btn-danger', onClick: () => { resolve(value ?? ''); } },
      ],
    });
  });
}

/* ---------------------------------------------------------------- keyboard */

const KEY_BINDINGS = {
  '/': () => {
    document.getElementById('vault-search')?.focus();
  },
  a: () => actions.addFiles(),
  g: () => actions.goVault(),
  ',': () => actions.goSettings(),
  '?': () => showShortcuts(),
  Escape: () => {
    if (state.selection.size) {
      state.selection.clear();
      refresh();
    }
  },
};

function bindKeyboard() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;

    // Palette works everywhere.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      actions.openPalette();
      return;
    }

    // Command shortcuts.
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        actions.lock();
      } else if (event.key === ',' && vault.isUnlocked) {
        event.preventDefault();
        actions.goSettings();
      }
      return;
    }

    if (typing) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (state.selection.size) {
        event.preventDefault();
        actions.deleteSelected();
      }
      return;
    }

    const handler = KEY_BINDINGS[event.key];
    if (handler && vault.isUnlocked) {
      event.preventDefault();
      handler();
    }
  });
}

function showShortcuts() {
  const rows = [
    ['Ctrl / ⌘ + K', 'Command palette'],
    ['/', 'Focus search'],
    ['A', 'Add files'],
    ['G', 'Go to vault'],
    ['Ctrl / ⌘ + ,', 'Settings'],
    ['Ctrl / ⌘ + L', 'Lock vault'],
    ['Esc', 'Close overlay, or clear selection'],
    ['Delete', 'Delete selected items'],
    ['Enter', 'Open focused item in inspector'],
  ];

  openModal({
    title: 'Keyboard shortcuts',
    icon: icons.command,
    iconKind: 'info',
    render: (body) => {
      body.appendChild(
        h('div', { class: 'shortcut-grid' },
          ...rows.map(([keys, label]) =>
            h('div', { class: 'shortcut-row' },
              h('span', null, label),
              h('span', { class: 'row', style: { gap: '4px' } },
                ...keys.split(' + ').map((key) => h('span', { class: 'kbd' }, key)),
              ),
            ),
          ),
        ),
      );
    },
    actions: [{ label: 'Close', kind: 'btn-ghost' }],
  });
}

/* --------------------------------------------------------------- auto-lock */

let autoLockTimer = null;
let lastActivity = Date.now();

function touch() {
  lastActivity = Date.now();
}

function startAutoLock() {
  for (const event of ['pointerdown', 'keydown', 'wheel', 'visibilitychange']) {
    document.addEventListener(event, touch, { passive: true });
  }

  setInterval(() => {
    const minutes = vault.settings.autoLockMinutes;
    if (!vault.isUnlocked || !minutes) return;
    if (Date.now() - lastActivity > minutes * 60_000) {
      vault.lock();
      toast('Vault locked', { kind: 'info', text: `Locked automatically after ${minutes} minutes of inactivity.` });
      render();
    }
  }, 15_000);
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  // Detect a non-secure context up front rather than failing at first encrypt.
  if (!globalThis.crypto?.subtle) {
    replace(root, null,
      h('div', { class: 'boot-screen' },
        h('div', { class: 'empty-art', html: icons.shieldOff(30).outerHTML }),
        h('h3', { class: 'empty-title' }, 'Secure context required'),
        h('p', { class: 'empty-text' },
          'Aegis Vault needs the Web Crypto API, which browsers only expose over HTTPS or on localhost. Open this page from a local server or a secure origin.',
        ),
      ),
    );
    return;
  }

  state.theme = localStorage.getItem('aegis.theme') ?? 'dark';
  state.layout = localStorage.getItem('aegis.layout') ?? 'grid';
  applyTheme();

  await vault.initialize();

  state.items = vault.items;
  state.theme = vault.settings.theme ?? state.theme;
  if (vault.settings.reduceMotion) document.documentElement.dataset.motion = 'reduced';
  applyTheme();

  vault.on('items', (items) => {
    state.items = items;
  });

  vault.on('status', () => {
    state.items = vault.items;
  });

  vault.on('settings', (settings) => {
    state.theme = settings.theme ?? state.theme;
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
    applyTheme();
  });

  if (vault.isUnlocked) {
    await refreshQuota();
    try {
      
      const record = await metaStore.get();
      state.createdAt = record?.createdAt ?? null;
      
      state.persisted = await isPersisted();
    } catch { /* storage introspection is best-effort */ }
  }

  bindKeyboard();
  startAutoLock();

  // Service worker + install affordances. Independent of vault state.
  initInstall();

  // Re-render once the vault reports its real status.
  render();

  // Keep quota fresh after operations.
  setInterval(() => {
    if (vault.isUnlocked) refreshQuota().then(() => {
      const area = document.querySelector('.quota-head span:last-child');
      if (area && state.quota) {
        area.textContent = `${formatBytes(state.quota.usage)} / ${formatBytes(state.quota.quota)}`;
      }
      const fill = document.querySelector('.quota-fill');
      if (fill && state.quota) fill.style.width = `${Math.min(state.quota.ratio * 100, 100)}%`;
    });
  }, 20_000);
}

/* Expose a couple of internals for the settings screen's action wiring. */
window.__aegis = { state, actions, vault };

export { state, actions };

/* ------------------------------------------------------------------ run */

boot().catch((error) => {
  console.error(error);
  replace(root, null,
    h('div', { class: 'boot-screen' },
      h('div', { class: 'empty-art', html: icons.alert(30).outerHTML }),
      h('h3', { class: 'empty-title' }, 'Something went wrong during startup'),
      h('p', { class: 'empty-text' }, error.message),
    ),
  );
});
