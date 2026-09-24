/**
 * Overlay primitives: toasts, modals, drawers, command palette.
 *
 * Each returns a handle with a `close()` method. All of them trap focus and
 * restore it on dismissal, and all of them render into a single portal root so
 * stacking order stays predictable.
 */

import { h, replace, trapFocus, captureFocus, downloadBlob } from './dom.js';
import { icons } from './icons.js';

let portalRoot = null;

function getPortal() {
  if (!portalRoot) {
    portalRoot = h('div', { id: 'portal' });
    document.body.appendChild(portalRoot);
  }
  return portalRoot;
}

/** Close the topmost overlay by removing its portal wrapper. */
function closeTopOverlay() {
  const layers = [...getPortal().children];
  layers[layers.length - 1]?.remove();
}

/* ------------------------------------------------------------------- toasts */

let toastHost = null;

function getToastHost() {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

const TOAST_ICON = { success: icons.check, error: icons.alert, info: icons.info };

export function toast(title, { text = '', kind = 'info', duration = 4200 } = {}) {
  const host = getToastHost();

  const node = h(
    'div',
    { class: `toast ${kind}` },
    h('span', { class: 'toast-icon', html: TOAST_ICON[kind](16).outerHTML }),
    h(
      'div',
      { class: 'toast-body' },
      h('div', { class: 'toast-title' }, title),
      text ? h('div', { class: 'toast-text' }, text) : null,
    ),
    h(
      'button',
      {
        class: 'toast-close',
        'aria-label': 'Dismiss',
        onclick: () => dismiss(),
        html: icons.x(13).outerHTML,
      },
    ),
  );

  let timer = null;

  function dismiss() {
    clearTimeout(timer);
    node.classList.add('leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }

  host.appendChild(node);

  // Errors stay until dismissed — the user may need to read them.
  if (kind !== 'error' && duration) timer = setTimeout(dismiss, duration);

  return { close: dismiss, node };
}

/* -------------------------------------------------------------------- modal */

/**
 * Open a modal dialog.
 *
 * `render(close)` returns the body content. `actions` is a list of button specs:
 * `{ label, kind, onClick, closeOnClick }`.
 */
export function openModal({ title, text, icon, iconKind = 'info', render, actions = [], dismissible = true }) {
  const releaseFocus = captureFocus();
  const scrim = h('div', { class: 'scrim' });

  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });

  if (icon) {
    modal.appendChild(h('div', { class: `modal-icon ${iconKind}`, html: icon(20).outerHTML }));
  }

  if (title) modal.appendChild(h('h2', { class: 'modal-title' }, title));
  if (text) modal.appendChild(h('p', { class: 'modal-text' }, text));

  let released = null;

  function close() {
    released?.();
    scrim.remove();
    modal.remove();
    releaseFocus();
  }

  if (render) {
    const body = h('div', { class: 'modal-body' });
    render(body, close);
    modal.appendChild(body);
  }

  if (actions.length) {
    const foot = h('div', { class: 'modal-actions' });
    for (const action of actions) {
      foot.appendChild(
        h(
          'button',
          {
            class: `btn ${action.kind ?? 'btn-ghost'}`,
            onclick: async () => {
              const result = await action.onClick?.();
              if (action.closeOnClick !== false && result !== false) close();
            },
          },
          action.label,
        ),
      );
    }
    modal.appendChild(foot);
  }

  const container = h('div', null, scrim, modal);
  getPortal().appendChild(container);

  released = trapFocus(modal);
  requestAnimationFrame(() => {
    modal.querySelector('input, textarea, button')?.focus();
  });

  if (dismissible) {
    scrim.addEventListener('click', close);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      close();
    }
  }
  modal.addEventListener('keydown', onKeydown);

  return { close, modal };
}

/* ------------------------------------------------------------------- drawer */

export function openDrawer(render) {
  const releaseFocus = captureFocus();
  const scrim = h('div', { class: 'scrim' });

  let released = null;

  function close() {
    released?.();
    scrim.remove();
    drawer.remove();
    releaseFocus();
  }

  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' });
  render(drawer, close);

  getPortal().appendChild(h('div', null, scrim, drawer));

  released = trapFocus(drawer);
  requestAnimationFrame(() => drawer.querySelector('button, input')?.focus());

  scrim.addEventListener('click', close);
  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });

  return { close, drawer };
}

/* ------------------------------------------------------------------ palette */

/**
 * Command palette. `groups` is `[{ label, items: [{ id, label, hint, icon, run }] }]`.
 * Typing filters across all groups using a subsequence match.
 */
export function openPalette({ groups, placeholder = 'Search or run a command…', onSelect }) {
  const releaseFocus = captureFocus();
  const scrim = h('div', { class: 'scrim' });

  const input = h('input', {
    class: 'palette-input',
    type: 'text',
    placeholder,
    'aria-label': placeholder,
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const list = h('div', { class: 'palette-list', role: 'listbox' });

  let flat = [];
  let activeIndex = 0;
  let released = null;

  function close() {
    released?.();
    scrim.remove();
    panel.remove();
    releaseFocus();
  }

  function subsequence(needle, haystack) {
    const target = needle.toLowerCase().replace(/\s+/g, '');
    const source = haystack.toLowerCase();
    let index = 0;
    for (const char of target) {
      index = source.indexOf(char, index);
      if (index === -1) return false;
      index += 1;
    }
    return true;
  }

  function renderList(query) {
    replace(list, null);
    flat = [];

    const trimmed = query.trim();

    const filtered = groups
      .map((group) => ({
        ...group,
        items: trimmed
          ? group.items.filter((item) => subsequence(trimmed, item.label) || subsequence(trimmed, item.hint ?? ''))
          : group.items,
      }))
      .filter((group) => group.items.length);

    if (!filtered.length) {
      list.appendChild(h('div', { class: 'palette-empty' }, `No results for "${query}"`));
      return;
    }

    for (const group of filtered) {
      list.appendChild(h('div', { class: 'palette-group' }, group.label));

      for (const item of group.items) {
        flat.push(item);
        const index = flat.length - 1;

        const row = h(
          'button',
          {
            class: 'palette-item',
            role: 'option',
            onclick: () => {
              close();
              item.run();
            },
          },
          item.icon ? h('span', { html: item.icon(15).outerHTML }) : null,
          h('span', { class: 'grow' }, item.label),
          item.hint ? h('span', { class: 'palette-hint' }, item.hint) : null,
        );

        row.dataset.index = String(index);
        list.appendChild(row);
      }
    }

    activeIndex = 0;
    highlight();
  }

  function highlight() {
    [...list.querySelectorAll('.palette-item')].forEach((node) => {
      const isActive = Number(node.dataset.index) === activeIndex;
      node.classList.toggle('active', isActive);
      if (isActive) node.scrollIntoView({ block: 'nearest' });
    });
  }

  input.addEventListener('input', () => renderList(input.value));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, flat.length - 1);
      highlight();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = flat[activeIndex];
      if (item) {
        close();
        item.run();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  const panel = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true' }, input, list);
  getPortal().appendChild(h('div', null, scrim, panel));

  scrim.addEventListener('click', close);

  renderList('');
  requestAnimationFrame(() => input.focus());

  return { close };
}

/* --------------------------------------------------------------- file saving */

export function saveBlob(bytes, filename, mime = 'application/octet-stream') {
  const blob = new Blob([bytes], { type: mime });
  downloadBlob(blob, filename);
}
