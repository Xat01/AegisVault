/**
 * Auth screen — vault creation and unlock.
 *
 * Two modes share one panel. Creation mode walks through a passphrase with live
 * strength feedback; unlock mode verifies against the stored verifier and
 * reports a precise failure rather than a generic one.
 */

import { h, replace } from '../dom.js';
import { icons } from '../icons.js';
import { toast } from '../components.js';
import { scorePassphrase } from '../../core/events.js';
import { KDF, CIPHER } from '../../core/crypto.js';

const CHECK_LABELS = {
  length: '12+ characters',
  long: '20+ characters',
  mixedCase: 'Upper and lower case',
  digits: 'Contains a digit',
  symbols: 'Contains a symbol',
  noRepeat: 'No repeated runs',
  noCommon: 'Not a common pattern',
  noSequence: 'No keyboard runs',
};

function specRow(label, value) {
  return h(
    'div',
    { class: 'spec-row' },
    h('span', { class: 'spec-label' }, label),
    h('span', { class: 'spec-value' }, value),
  );
}

function strengthMeter(getPassphrase) {
  const bars = [1, 2, 3, 4].map(() => h('div', { class: 'strength-bar' }));
  const label = h('span', { class: 'strength-label lv-0' }, 'Empty');
  const entropy = h('span', { class: 'strength-entropy' }, '0 bits');

  const checks = Object.entries(CHECK_LABELS).map(([key, text]) => {
    const dot = h('span', { class: 'check-dot' });
    const row = h('div', { class: 'check' }, dot, text);
    return { key, row };
  });

  const node = h(
    'div',
    { class: 'strength' },
    h('div', { class: 'strength-bars' }, bars),
    h('div', { class: 'strength-head' }, label, entropy),
    h('div', { class: 'check-grid' }, checks.map((entry) => entry.row)),
  );

  function update() {
    const result = scorePassphrase(getPassphrase());

    bars.forEach((bar, index) => {
      bar.className = 'strength-bar';
      if (index < result.level) bar.classList.add(`on-${result.level}`);
    });

    label.className = `strength-label lv-${result.level}`;
    label.textContent = result.label;
    entropy.textContent = `${result.entropy} bits`;

    const ordered = ['length', 'mixedCase', 'digits', 'symbols', 'noRepeat', 'noCommon'];
    for (const entry of checks) {
      entry.row.classList.toggle('met', Boolean(result.checks[entry.key]));
      if (!ordered.includes(entry.key)) entry.row.classList.add('hidden');
    }

    return result;
  }

  return { node, update };
}

function passphraseField({ id, label, hint, placeholder, autofocus = false }) {
  const input = h('input', {
    class: 'input mono has-suffix',
    type: 'password',
    id,
    placeholder,
    autocomplete: 'new-password',
    spellcheck: 'false',
    autocapitalize: 'off',
  });

  const toggle = h('button', {
    class: 'input-affix',
    type: 'button',
    'aria-label': 'Show passphrase',
    html: icons.eye(15).outerHTML,
  });

  let visible = false;
  toggle.addEventListener('click', () => {
    visible = !visible;
    input.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-label', visible ? 'Hide passphrase' : 'Show passphrase');
    replace(toggle, null).appendChild(visible ? icons.eyeOff(15) : icons.eye(15));
    input.focus();
  });

  const error = h('div', { class: 'field-error hidden' });

  const node = h(
    'div',
    { class: 'field' },
    h(
      'label',
      { class: 'field-label', for: id },
      label,
      hint ? h('span', { class: 'field-hint' }, hint) : null,
    ),
    h('div', { class: 'input-wrap' }, input, toggle),
    error,
  );

  if (autofocus) setTimeout(() => input.focus(), 60);

  return {
    node,
    input,
    setError(message) {
      if (message) {
        input.classList.add('input-error');
        error.className = 'field-error';
        replace(error, null, icons.alert(13), message);
      } else {
        input.classList.remove('input-error');
        error.className = 'field-error hidden';
        replace(error, null);
      }
    },
    get value() {
      return input.value;
    },
    focus: () => input.focus(),
  };
}

export function renderAuth(root, { vault, onUnlocked }) {
  const isCreating = vault.status !== 'locked';
  const container = h('div', { class: 'auth' });

  const pitch = h(
    'div',
    { class: 'auth-pitch' },
    h(
      'div',
      { class: 'brand' },
      h('div', { class: 'brand-mark', html: icons.shield(20).outerHTML }),
      h(
        'div',
        { class: 'brand-text' },
        h('span', { class: 'brand-name' }, 'Aegis Vault'),
        h('span', { class: 'brand-sub' }, 'local-first encrypted storage'),
      ),
    ),
    h(
      'h1',
      { class: 'auth-title' },
      isCreating ? 'A vault that shows ' : 'Welcome ',
      h('em', null, isCreating ? 'its work.' : 'back.'),
    ),
    h(
      'p',
      { class: 'auth-lede' },
      isCreating
        ? 'Every file is sealed with its own key material. You can inspect the salt, the nonce and the authentication tag of any item — because a vault you cannot verify is just a promise.'
        : 'Your files are sealed on this device. Enter your passphrase to derive the key that opens them.',
    ),
    h(
      'div',
      { class: 'spec-list' },
      specRow('Key derivation', `${KDF.name} · ${KDF.hash}`),
      specRow('Iterations', KDF.iterations.toLocaleString()),
      specRow('Cipher', `${CIPHER.name}-${CIPHER.keyBits}`),
      specRow('Network access', 'none'),
      specRow('Storage', 'this browser only'),
    ),
  );

  const panel = h('div', { class: 'auth-panel' });
  const inner = h('div', { class: 'auth-inner' }, pitch, panel);
  container.append(h('div', { class: 'auth-grid' }), inner);
  root.append(container);

  if (isCreating) {
    renderCreate(panel, vault, onUnlocked);
  } else {
    renderUnlock(panel, vault, onUnlocked);
  }

  return () => {};
}

function renderCreate(panel, vault, onUnlocked) {
  const passField = passphraseField({
    id: 'create-passphrase',
    label: 'Master passphrase',
    hint: 'never leaves this device',
    placeholder: 'Something long and unusual',
    autofocus: true,
  });

  const confirmField = passphraseField({
    id: 'create-confirm',
    label: 'Confirm passphrase',
    placeholder: 'Type it again',
  });

  const meter = strengthMeter(() => passField.value);

  const submit = h(
    'button',
    { class: 'btn btn-primary btn-block mt-16', type: 'submit' },
    'Create vault',
  );

  passField.input.addEventListener('input', () => {
    const result = meter.update();
    passField.setError(null);
    confirmField.setError(null);
    submit.disabled = !result.acceptable || !confirmField.value;
  });

  confirmField.input.addEventListener('input', () => {
    confirmField.setError(null);
    submit.disabled = !meter.update().acceptable || !confirmField.value;
  });

  confirmField.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') form.requestSubmit();
  });

  submit.disabled = true;

  const form = h(
    'form',
    {
      onsubmit: async (event) => {
        event.preventDefault();

        const passphrase = passField.value;
        const result = scorePassphrase(passphrase);

        if (!result.acceptable) {
          passField.setError('This passphrase is too weak. Aim for a passphrase, not a password.');
          passField.focus();
          return;
        }
        if (passphrase !== confirmField.value) {
          confirmField.setError('The two passphrases do not match.');
          confirmField.focus();
          return;
        }

        replace(submit, null);
        submit.append(h('span', { class: 'spinner' }), `Deriving key · ${KDF.iterations.toLocaleString()} rounds`);
        submit.disabled = true;
        passField.input.disabled = true;
        confirmField.input.disabled = true;

        try {
          await vault.createVault(passphrase);
          toast('Vault created', { kind: 'success', text: 'The key is derived and stored wrapped on this device.' });
          onUnlocked();
        } catch (error) {
          toast('Could not create the vault', { kind: 'error', text: error.message });
          replace(submit, null);
          submit.append('Create vault');
          submit.disabled = false;
          passField.input.disabled = false;
          confirmField.input.disabled = false;
        }
      },
    },
    h('div', { class: 'panel-eyebrow' }, 'New vault'),
    h('h2', { class: 'panel-title' }, 'Choose your passphrase'),
    h(
      'p',
      { class: 'panel-desc' },
      'This passphrase is the only thing that can open your vault. It is never stored, never transmitted, and cannot be recovered. Forget it and the files are gone.',
    ),
    h(
      'div',
      { class: 'banner warn' },
      h('span', { html: icons.alert(15).outerHTML }),
      h(
        'span',
        null,
        h('strong', null, 'There is no reset.'),
        ' Not by email, not by support, not by us. Write it down somewhere physical.',
      ),
    ),
    passField.node,
    meter.node,
    h('div', { class: 'mt-16' }),
    confirmField.node,
    submit,
  );

  panel.appendChild(form);
}

function renderUnlock(panel, vault, onUnlocked) {
  const passField = passphraseField({
    id: 'unlock-passphrase',
    label: 'Master passphrase',
    placeholder: 'Enter your passphrase',
    autofocus: true,
  });

  const submit = h('button', { class: 'btn btn-primary btn-block mt-16', type: 'submit' }, 'Unlock vault');
  submit.disabled = true;

  passField.input.addEventListener('input', () => {
    passField.setError(null);
    submit.disabled = !passField.value;
  });

  let attempts = 0;

  const form = h(
    'form',
    {
      onsubmit: async (event) => {
        event.preventDefault();

        replace(submit, null);
        submit.append(h('span', { class: 'spinner' }), `Deriving key · ${KDF.iterations.toLocaleString()} rounds`);
        submit.disabled = true;
        passField.input.disabled = true;

        try {
          const ok = await vault.unlock(passField.value);

          if (!ok) {
            attempts += 1;
            passField.setError(
              attempts >= 3
                ? `Incorrect passphrase (${attempts} attempts). Each attempt re-derives the key, which is slow by design.`
                : 'That passphrase does not match the verifier stored with this vault.',
            );
            passField.focus();
            passField.input.select?.();
            return;
          }

          onUnlocked();
        } catch (error) {
          passField.setError(error.message);
        } finally {
          replace(submit, null);
          submit.append('Unlock vault');
          submit.disabled = false;
          passField.input.disabled = false;
        }
      },
    },
    h('div', { class: 'panel-eyebrow' }, 'Locked'),
    h('h2', { class: 'panel-title' }, 'Unlock your vault'),
    h(
      'p',
      { class: 'panel-desc' },
      `Your key is re-derived from the passphrase on every unlock, using ${KDF.iterations.toLocaleString()} rounds. The delay is the protection.`,
    ),
    passField.node,
    submit,
    h(
      'div',
      { class: 'field-hint mt-16', style: { textAlign: 'center' } },
      `${vault.items.length} item${vault.items.length === 1 ? '' : 's'} in this vault`,
    ),
  );

  panel.appendChild(form);
}
