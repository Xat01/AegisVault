/**
 * Vault screen — the main interface.
 *
 * Layout is a persistent rail plus a scrolling stage. All state is passed in
 * from `app.js`; this module renders and reports intent through callbacks.
 * It never talks to the vault layer directly.
 */

import { h, replace, $$ } from '../dom.js';
import { icons } from '../icons.js';
import { openModal, toast } from '../components.js';
import { formatBytes, extensionOf, baseNameOf, truncateHex, formatDate, relativeTime } from '../../core/format.js';
import { CODE_EXTENSIONS, ARCHIVE_EXTENSIONS, TEXT_EXTENSIONS } from '../../core/constants.js';

const VERIFY_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** Classify a file for the badge and colour treatment. */
export function classify(item) {
  const ext = extensionOf(item.name);
  const type = item.type || '';

  if (type.startsWith('image/')) return { kind: 'image', label: ext.toUpperCase().slice(0, 4) || 'IMG' };
  if (type.startsWith('video/')) return { kind: 'video', label: ext.toUpperCase().slice(0, 4) || 'VID' };
  if (type.startsWith('audio/')) return { kind: 'audio', label: ext.toUpperCase().slice(0, 4) || 'AUD' };
  if (type === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', label: 'PDF' };
  if (CODE_EXTENSIONS.has(ext)) return { kind: 'code', label: ext.toUpperCase().slice(0, 4) };
  if (ARCHIVE_EXTENSIONS.has(ext)) return { kind: 'archive', label: ext.toUpperCase().slice(0, 4) || 'ARC' };
  if (TEXT_EXTENSIONS.has(ext) || type.startsWith('text/')) return { kind: 'text', label: ext.toUpperCase().slice(0, 4) || 'TXT' };
  return { kind: 'other', label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE' };
}

function fileBadge(item) {
  const { kind, label } = classify(item);
  return h('div', { class: `file-badge k-${kind}` }, label);
}

/* ------------------------------------------------------------------ sidebar */

function buildRail({ state, actions }) {
  const items = state.items;

  const tagCounts = new Map();
  for (const item of items) {
    for (const tag of item.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const navItem = (id, icon, label, count) =>
    h(
      'button',
      {
        class: `rail-item${state.filter === id ? ' active' : ''}`,
        onclick: () => actions.setFilter(id),
      },
      h('span', { class: 'rail-icon', html: icon(15).outerHTML }),
      h('span', { class: 'grow' }, label),
      count !== undefined && count > 0 ? h('span', { class: 'rail-count' }, count) : null,
    );

  const recentCount = items.filter((item) => Date.now() - item.createdAt < 7 * 24 * 60 * 60 * 1000).length;

  const rail = h(
    'nav',
    { class: `rail${state.railOpen ? ' open' : ''}`, 'aria-label': 'Vault navigation' },

    h(
      'div',
      null,
      h('div', { class: 'rail-section-label' }, 'Library'),
      navItem('all', icons.folder, 'All items', items.length),
      navItem('recent', icons.clock, 'Recent', recentCount),
      navItem('verified', icons.fingerprint, 'Verified', items.filter((item) => item.verifiedAt).length),
    ),

    tagCounts.size
      ? h(
          'div',
          null,
          h('div', { class: 'rail-section-label' }, 'Tags'),
          [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tag, count]) =>
              h(
                'button',
                {
                  class: `rail-tag${state.filter === `tag:${tag}` ? ' active' : ''}`,
                  onclick: () => actions.setFilter(`tag:${tag}`),
                },
                h('span', { class: 'tag-dot' }),
                h('span', { class: 'grow' }, tag),
                h('span', { class: 'rail-count' }, count),
              ),
            ),
        )
      : null,

    h(
      'div',
      { class: 'rail-footer' },
      h(
        'div',
        { class: 'quota' },
        h(
          'div',
          { class: 'quota-head' },
          h('span', null, 'Local storage'),
          h('span', null, state.quota ? `${formatBytes(state.quota.usage)} / ${formatBytes(state.quota.quota)}` : '—'),
        ),
        h(
          'div',
          { class: 'quota-bar' },
          h('div', {
            class: `quota-fill${state.quota?.ratio > 0.9 ? ' danger' : state.quota?.ratio > 0.7 ? ' warn' : ''}`,
            style: { width: `${Math.min((state.quota?.ratio ?? 0) * 100, 100)}%` },
          }),
        ),
      ),
    ),
  );

  return rail;
}

/* ------------------------------------------------------------------- cards */

function buildCard(item, state, actions) {
  const selected = state.selection.has(item.id);
  const stale = !item.verifiedAt || Date.now() - item.verifiedAt > VERIFY_STALE_MS;

  return h(
    'article',
    {
      class: `card${selected ? ' selected' : ''}`,
      tabindex: '0',
      role: 'button',
      'aria-label': `${item.name}, ${formatBytes(item.size)}`,
      onclick: (event) => {
        if (event.metaKey || event.ctrlKey) actions.toggleSelect(item.id, true);
        else actions.openInspector(item.id);
      },
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          actions.openInspector(item.id);
        }
      },
    },

    h(
      'div',
      {
        class: 'card-check',
        title: 'Select',
        html: icons.check(11).outerHTML,
        onclick: (event) => {
          event.stopPropagation();
          actions.toggleSelect(item.id);
        },
      },
    ),

    h(
      'div',
      { class: 'card-top' },
      fileBadge(item),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'card-name' }, item.name),
        h('div', { class: 'card-facts mt-8' },
          h('span', null, formatBytes(item.size)),
          h('span', { class: 'sep' }, '·'),
          h('span', null, relativeTime(item.createdAt)),
        ),
      ),
    ),

    item.tags?.length ? h('div', { class: 'tag-row card-tags' }, item.tags.map((tag) => h('span', { class: 'tag' }, tag))) : null,

    h(
      'div',
      { class: 'card-foot' },
      h(
        'span',
        { class: `card-verified${stale ? ' stale' : ''}` },
        h('span', { html: (stale ? icons.clock : icons.check)(11).outerHTML }),
        stale ? 'Not verified recently' : `Verified ${relativeTime(item.verifiedAt)}`,
      ),
      h('span', { class: 'card-facts mono' }, truncateHex(new Uint8Array([...hexToBytes(item.plainHash.slice(0, 32))]), 4, 4)),
    ),
  );
}

function hexToBytes(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

/* -------------------------------------------------------------------- empty */

function buildEmpty(state, actions) {
  if (state.query) {
    return h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-art', html: icons.search(30).outerHTML }),
      h('h3', { class: 'empty-title' }, 'No matches'),
      h('p', { class: 'empty-text' }, `Nothing in this vault matches "${state.query}". Search covers names, tags and notes.`),
      h('button', { class: 'btn btn-ghost', onclick: () => actions.setQuery('') }, 'Clear search'),
    );
  }

  if (state.filter !== 'all') {
    return h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-art', html: icons.folder(30).outerHTML }),
      h('h3', { class: 'empty-title' }, 'Nothing in this view'),
      h('p', { class: 'empty-text' }, 'This filter has no items yet. Try another view or add a file.'),
      h('button', { class: 'btn btn-ghost', onclick: () => actions.setFilter('all') }, 'Back to all items'),
    );
  }

  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-art', html: icons.shield(30).outerHTML }),
    h('h3', { class: 'empty-title' }, 'Your vault is empty'),
    h(
      'p',
      { class: 'empty-text' },
      'Drop files anywhere on this screen, or use the button above. Each file gets its own salt and nonce, and the key is derived on this device.',
    ),
    h(
      'div',
      { class: 'dropzone', style: { maxWidth: '420px', width: '100%', marginTop: '8px' } },
      'Drop files here · or press ',
      h('span', { class: 'kbd' }, 'A'),
    ),
  );
}

/* ------------------------------------------------------------------- stage */

export function renderVault(root, { state, actions, vault }) {
  const visible = actions.getVisibleItems();

  const head = h(
    'div',
    { class: 'stage-head' },
    h(
      'div',
      null,
      h('h1', { class: 'stage-title' }, actions.getViewTitle()),
      h(
        'div',
        { class: 'stage-meta' },
        `${visible.length} of ${state.items.length} item${state.items.length === 1 ? '' : 's'}`,
        state.selection.size ? ` · ${state.selection.size} selected` : '',
        ` · ${formatBytes(visible.reduce((sum, item) => sum + item.size, 0))}`,
      ),
    ),
    h(
      'div',
      { class: 'stage-actions' },
      state.selection.size
        ? h(
            'button',
            { class: 'btn btn-danger-ghost btn-sm', onclick: () => actions.deleteSelected() },
            h('span', { html: icons.trash(14).outerHTML }),
            `Delete ${state.selection.size}`,
          )
        : null,
      h(
        'button',
        { class: 'btn btn-primary', onclick: () => actions.addFiles() },
        h('span', { html: icons.plus(15).outerHTML }),
        'Add files',
      ),
    ),
  );

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Sort order' },
      ...[['newest', 'Newest'], ['name', 'Name'], ['size', 'Size']].map(([value, label]) =>
        h(
          'button',
          {
            class: state.sort === value ? 'active' : '',
            onclick: () => actions.setSort(value),
          },
          label,
        ),
      ),
    ),
    h(
      'select',
      {
        class: 'select',
        'aria-label': 'Filter by file type',
        onchange: (event) => actions.setTypeFilter(event.target.value),
      },
      h('option', { value: 'all', selected: state.typeFilter === 'all' }, 'All types'),
      ...['image', 'pdf', 'video', 'audio', 'code', 'archive', 'text']
        .map((kind) => h('option', { value: kind, selected: state.typeFilter === kind }, kind[0].toUpperCase() + kind.slice(1))),
    ),
    h('span', { class: 'grow' }),
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Layout' },
      h('button', {
        class: state.layout === 'grid' ? 'active' : '',
        'aria-label': 'Grid layout',
        html: icons.grid(14).outerHTML,
        onclick: () => actions.setLayout('grid'),
      }),
      h('button', {
        class: state.layout === 'list' ? 'active' : '',
        'aria-label': 'List layout',
        html: icons.list(14).outerHTML,
        onclick: () => actions.setLayout('list'),
      }),
    ),
  );

  const grid = h('div', { class: `grid${state.layout === 'list' ? ' list-view' : ''}` });

  if (visible.length) {
    visible.forEach((item, index) => {
      const card = buildCard(item, state, actions);
      card.style.animationDelay = `${Math.min(index * 18, 220)}ms`;
      grid.appendChild(card);
    });
  }

  const scroll = h('div', { class: 'scroll-area' });

  if (state.loading) {
    const skeleton = h('div', { class: 'grid' });
    for (let i = 0; i < 6; i += 1) {
      skeleton.appendChild(
        h(
          'article',
          { class: 'card' },
          h('div', { class: 'card-top' }, h('div', { class: 'file-badge' }), h('div', { class: 'grow' },
            h('div', { style: { height: '13px', width: '68%', background: 'var(--bg-overlay)', borderRadius: '4px' } }),
            h('div', { style: { height: '10px', width: '42%', background: 'var(--bg-overlay)', borderRadius: '4px', marginTop: '9px' } }),
          )),
          h('div', { style: { height: '10px', width: '52%', background: 'var(--bg-overlay)', borderRadius: '4px' } }),
        ),
      );
    }
    scroll.appendChild(skeleton);
  } else if (visible.length) {
    scroll.appendChild(grid);
  } else {
    scroll.appendChild(buildEmpty(state, actions));
  }

  const stage = h('main', { class: 'stage' }, head, toolbar, scroll);

  // Drag and drop across the whole stage.
  let dragDepth = 0;
  stage.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    if (event.dataTransfer?.types?.includes('Files')) stage.classList.add('dragover');
  });
  stage.addEventListener('dragover', (event) => event.preventDefault());
  stage.addEventListener('dragleave', () => {
    dragDepth -= 1;
    if (dragDepth <= 0) {
      dragDepth = 0;
      stage.classList.remove('dragover');
    }
  });
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    stage.classList.remove('dragover');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) actions.ingestFiles(files);
  });

  return h('div', { class: 'body-split' }, buildRail({ state, actions }), stage);
}

/** The top bar, rendered separately so it can hold the search field without re-rendering. */
export function renderTopbar({ state, actions }) {
  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search names, tags, notes…',
    'aria-label': 'Search vault',
    value: state.query,
    id: 'vault-search',
  });

  search.addEventListener('input', (event) => actions.setQuery(event.target.value));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      search.value = '';
      actions.setQuery('');
      search.blur();
    }
  });

  return h(
    'header',
    { class: 'topbar' },
    h(
      'button',
      {
        class: 'btn btn-icon btn-quiet rail-toggle',
        style: { display: 'none' },
        'aria-label': 'Toggle navigation',
        html: icons.menu(17).outerHTML,
        onclick: () => actions.toggleRail(),
      },
    ),
    h(
      'div',
      { class: 'topbar-brand' },
      h('div', { class: 'topbar-mark', html: icons.shield(15).outerHTML }),
      h('span', { class: 'topbar-name' }, 'Aegis Vault'),
    ),
    h(
      'div',
      { class: 'search-box' },
      h('span', { class: 'search-icon', html: icons.search(15).outerHTML }),
      search,
      h('span', { class: 'search-kbd' }, '/'),
    ),
    h(
      'div',
      { class: 'topbar-actions' },
      h(
        'span',
        { class: 'lock-state' },
        h('span', { class: 'lock-dot' }),
        'unlocked',
      ),
      h('button', {
        class: 'btn btn-icon btn-quiet',
        'aria-label': 'Command palette',
        title: 'Command palette (Ctrl+K)',
        html: icons.command(16).outerHTML,
        onclick: () => actions.openPalette(),
      }),
      h('button', {
        class: 'btn btn-icon btn-quiet',
        'aria-label': 'Toggle theme',
        title: 'Toggle theme',
        html: (state.theme === 'dark' ? icons.sun : icons.moon)(16).outerHTML,
        onclick: () => actions.toggleTheme(),
      }),
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', onclick: () => actions.lock() },
        h('span', { html: icons.lock(14).outerHTML }),
        'Lock',
      ),
    ),
  );
}

export { formatDate, truncateHex, formatBytes };
