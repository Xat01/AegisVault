/**
 * Inspector drawer.
 *
 * This is the feature the product is built around: showing the user the actual
 * cryptographic material for their own file. Nothing here is decoration — every
 * value comes from reading the stored container back off disk.
 */

import { h, replace } from '../dom.js';
import { icons } from '../icons.js';
import { openDrawer, openModal, toast, saveBlob } from '../components.js';
import { formatBytes, toHex, formatDate, relativeTime, copyToClipboard, sanitizeFilename } from '../../core/format.js';
import { HEADER_LAYOUT } from '../../core/container.js';

function kvRow(key, value, { mono = true, copy = false, title } = {}) {
  const valueNode = h('span', { class: `kv-val${mono ? ' mono' : ''}`, title: title ?? undefined }, value);

  return h(
    'div',
    { class: 'kv-row' },
    h('span', { class: 'kv-key' }, key),
    copy
      ? h(
          'button',
          {
            class: 'kv-val mono',
            style: { background: 'none', cursor: 'pointer', textAlign: 'right' },
            title: 'Click to copy',
            onclick: async () => {
              const ok = await copyToClipboard(value);
              toast(ok ? 'Copied to clipboard' : 'Clipboard unavailable', {
                kind: ok ? 'success' : 'error',
                text: ok ? undefined : 'Select the value manually instead.',
                duration: 2200,
              });
            },
          },
          value,
        )
      : valueNode,
  );
}

/** Render the container header as a colour-coded hex dump, field by field. */
function headerHex(container) {
  const fields = [
    { class: 'h-magic', bytes: new Uint8Array([0x41, 0x45, 0x47, 0x53]), note: 'magic' },
    { class: 'h-version', bytes: new Uint8Array([container.version]), note: 'version' },
    { class: 'h-salt', bytes: container.salt, note: 'salt' },
    { class: 'h-nonce', bytes: container.nonce, note: 'nonce' },
    { class: 'h-tag', bytes: container.tag, note: 'tag' },
  ];

  const line = h('div', { class: 'hex-block' });
  const legend = h('div', { class: 'hex-legend' });

  let offset = 0;
  for (const field of fields) {
    const span = h('span', { class: field.class }, toHex(field.bytes), ' ');
    span.title = `offset ${offset} · ${field.note}`;
    line.appendChild(span);

    legend.appendChild(
      h(
        'span',
        { class: 'legend-item' },
        h('span', { class: `legend-swatch ${field.class}` }),
        `${field.note} · ${field.bytes.length}B`,
      ),
    );

    offset += field.bytes.length;
  }

  // A short preview of the ciphertext, deliberately truncated.
  line.appendChild(
    h('span', { class: 'h-body' }, `\n${toHex(container.ciphertext.slice(0, 24))} … (${container.ciphertext.length}B ciphertext)`),
  );

  return { line, legend };
}

function formatHexDump(bytes, bytesPerRow = 16) {
  const rows = [];
  for (let i = 0; i < Math.min(bytes.length, 512); i += bytesPerRow) {
    const chunk = bytes.slice(i, i + bytesPerRow);
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk]
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·'))
      .join('');
    rows.push(`${i.toString(16).padStart(6, '0')}  ${hex.padEnd(bytesPerRow * 3 - 1)}  ${ascii}`);
  }
  return rows.join('\n');
}

function renderHeader(drawer, item, close, vault, actions) {
  replace(drawer, null);

  const head = h(
    'div',
    { class: 'drawer-head' },
    h('div', { class: 'file-badge k-' + (item.type?.split('/')[0] ?? 'other'), style: { width: '44px', height: '44px' } },
      (item.name.split('.').pop() ?? '').toUpperCase().slice(0, 4) || 'FILE'),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'detail-name' }, item.name),
      h('div', { class: 'detail-sub' }, `${formatBytes(item.size)} · stored ${relativeTime(item.createdAt)}`),
    ),
    h('button', { class: 'btn btn-icon btn-quiet', 'aria-label': 'Close', html: icons.x(16).outerHTML, onclick: () => close() }),
  );

  const body = h('div', { class: 'drawer-body' });
  const foot = h('div', { class: 'drawer-foot' });

  /* ---- crypto material ---- */

  const headerSection = h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-title' },
      h('span', null, 'Container header'),
      h('span', { class: 'text-muted' }, `${HEADER_LAYOUT.header.length} bytes · AEGS v${item.container.version}`),
    ),
  );

  if (vault.settings.showByteInspector) {
    const { line, legend } = headerHex({
      version: item.container.version,
      salt: new Uint8Array(item.container.salt),
      nonce: new Uint8Array(item.container.nonce),
      tag: new Uint8Array(item.container.tag),
      ciphertext: new Uint8Array(item.container.ciphertextLength),
    });
    headerSection.append(line, legend);
  }

  const facts = h(
    'div',
    { class: 'kv mt-16' },
    kvRow('Original size', formatBytes(item.size)),
    kvRow('Ciphertext size', formatBytes(item.container.ciphertextLength)),
    kvRow('Container overhead', `+${item.container.totalLength - item.size} bytes`),
    kvRow('Plaintext SHA-256', `${item.plainHash.slice(0, 32)}…`, { copy: true, title: item.plainHash }),
  );
  headerSection.appendChild(facts);

  /* ---- key material ---- */

  const keySection = h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-title' }, h('span', null, 'Per-file key material')),
    h(
      'div',
      { class: 'kv' },
      kvRow('Salt', toHex(new Uint8Array(item.container.salt)), { copy: true }),
      kvRow('Nonce', toHex(new Uint8Array(item.container.nonce)), { copy: true }),
      kvRow('Auth tag', toHex(new Uint8Array(item.container.tag)), { copy: true }),
    ),
  );

  /* ---- metadata ---- */

  const metaSection = h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-title' }, h('span', null, 'Details')),
    h(
      'div',
      { class: 'kv' },
      kvRow('Type', item.type, { mono: true }),
      kvRow('Added', formatDate(item.createdAt), { mono: false }),
      kvRow('Last verified', item.verifiedAt ? formatDate(item.verifiedAt) : 'never', { mono: false }),
      kvRow('Integrity', item.verifiedAt ? 'authenticated by GCM' : 'not yet verified', { mono: false }),
    ),
  );

  if (item.tags?.length) {
    metaSection.appendChild(
      h('div', { class: 'tag-row mt-8' }, item.tags.map((tag) => h('span', { class: 'tag' }, tag))),
    );
  }

  body.append(headerSection, keySection, metaSection);

  /* ---- actions ---- */

  const extractBtn = h(
    'button',
    {
      class: 'btn btn-primary grow',
      onclick: async () => {
        replace(extractBtn, null);
        extractBtn.append(h('span', { class: 'spinner' }), 'Decrypting…');
        extractBtn.disabled = true;
        try {
          const { item: fresh, plain } = await vault.extractItem(item.id);
          saveBlob(plain, sanitizeFilename(fresh.name, 'decrypted'), fresh.type);
          toast('File decrypted', { kind: 'success', text: `${fresh.name} was written to your downloads.` });
        } catch (error) {
          toast('Decryption failed', { kind: 'error', text: error.message });
        } finally {
          replace(extractBtn, null);
          extractBtn.append(h('span', { html: icons.download(15).outerHTML }), 'Extract');
          extractBtn.disabled = false;
        }
      },
    },
    h('span', { html: icons.download(15).outerHTML }),
    'Extract',
  );

  const verifyBtn = h(
    'button',
    {
      class: 'btn btn-ghost',
      title: 'Re-open the container and confirm the authentication tag still verifies',
      onclick: async () => {
        replace(verifyBtn, null);
        verifyBtn.append(h('span', { class: 'spinner' }), 'Verifying…');
        verifyBtn.disabled = true;
        try {
          const result = await vault.verifyItem(item.id);
          if (result.ok) {
            toast('Integrity verified', { kind: 'success', text: 'The container authenticates and the fingerprint matches.' });
            actions.refresh();
            renderHeader(drawer, { ...item, verifiedAt: Date.now() }, close, vault, actions);
          } else {
            toast('Integrity check failed', { kind: 'error', text: result.error });
          }
        } catch (error) {
          toast('Verification error', { kind: 'error', text: error.message });
        } finally {
          verifyBtn.disabled = false;
        }
      },
    },
    h('span', { html: icons.fingerprint(15).outerHTML }),
    'Verify',
  );

  const renameBtn = h(
    'button',
    { class: 'btn btn-icon btn-ghost', 'aria-label': 'Rename', title: 'Rename', html: icons.file(15).outerHTML,
      onclick: () => actions.renameItem(item) },
  );

  const deleteBtn = h(
    'button',
    { class: 'btn btn-icon btn-danger-ghost', 'aria-label': 'Delete', title: 'Delete', html: icons.trash(15).outerHTML,
      onclick: () => actions.deleteItems([item.id]) },
  );

  foot.append(extractBtn, verifyBtn, renameBtn, deleteBtn);
  drawer.append(head, body, foot);
}

export function openInspector(item, vault, actions) {
  openDrawer((drawer, close) => {
    renderHeader(drawer, item, close, vault, actions);
  });
}

/** A raw byte dump in a modal, for people who really want to look. */
export function showRawDump(item, vault) {
  openModal({
    title: 'Ciphertext preview',
    text: `The first ${Math.min(item.container.ciphertextLength, 512)} bytes of the encrypted payload, with the ASCII interpretation beside it.`,
    icon: icons.database,
    iconKind: 'info',
    dismissible: true,
    render: async (body) => {
      body.appendChild(h('div', { class: 'hex-block', style: { maxHeight: '320px', overflowY: 'auto' } }, 'Reading container…'));
      try {
        const container = await vault.dissect(item.id);
        replace(body, null,
          h('div', { class: 'hex-block', style: { maxHeight: '320px', overflowY: 'auto' } },
            formatHexDump(container.ciphertext)),
        );
      } catch (error) {
        replace(body, null, h('div', { class: 'banner danger' }, error.message));
      }
    },
    actions: [{ label: 'Close', kind: 'btn-ghost' }],
  });
}

/** Small confirm used for destructive actions that are not vault-wide. */
export function confirmDialog({ title, text, confirmLabel, kind = 'btn-danger', onConfirm }) {
  openModal({
    title,
    text,
    icon: kind.includes('danger') ? icons.alert : icons.info,
    iconKind: kind.includes('danger') ? 'danger' : 'info',
    dismissible: true,
    actions: [
      { label: 'Cancel', kind: 'btn-ghost' },
      { label: confirmLabel, kind, onClick: onConfirm },
    ],
  });
}
