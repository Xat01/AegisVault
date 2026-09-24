/**
 * Vault — the domain layer.
 *
 * Owns the vault lifecycle and the item index. Knows nothing about the DOM.
 * Everything it persists is either a ciphertext container or an encrypted index.
 *
 * State is intentionally simple: an in-memory array of item records, persisted by
 * re-encrypting the whole index. At personal-vault scale (hundreds of items) this
 * is far simpler than incremental index writes and impossible to get out of sync.
 */

import { createEmitter, scorePassphrase } from './events.js';
import { blobStore, metaStore, destroyDatabase, storageEstimate, requestPersistence } from './db.js';
import { createVaultMaterial, unlockVault, importRawKey, deriveRawKey } from './keystore.js';
import { packContainer, openContainer, verifyContainer, dissectContainer, ContainerFormatError } from './container.js';
import { KDF, AuthenticationError, encryptBytes, decryptBytes, randomBytes, sha256Hex, deriveBits, deriveKey } from './crypto.js';
import { MAX_FILE_BYTES, INDEX_ID, INDEX_VERSION } from './constants.js';

export const VaultStatus = Object.freeze({
  UNINITIALIZED: 'uninitialized',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
});

export class VaultError extends Error {
  constructor(message, code = 'VAULT_ERROR') {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

function makeId() {
  return [...randomBytes(8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createVault() {
  const emitter = createEmitter();

  let status = VaultStatus.UNINITIALIZED;
  let vaultKey = null;
  let rawVaultKey = null; // kept only while unlocked, so the key can be re-wrapped
  let passphraseRef = null; // held in memory only while unlocked, cleared on lock
  let record = null;
  let items = [];
  let indexNonce = null;
  let settings = defaultSettings();

  function defaultSettings() {
    return {
      theme: 'dark',
      confirmBeforeDelete: true,
      autoLockMinutes: 15,
      showByteInspector: true,
      reduceMotion: false,
    };
  }

  function emit(event, payload) {
    emitter.emit(event, payload);
    emitter.emit('change', { event, payload });
  }

  /** Inspect persisted state and report where the vault is. */
  async function initialize() {
    record = await metaStore.get();

    if (!record) {
      status = VaultStatus.UNINITIALIZED;
      emit('status', { status });
      return status;
    }

    settings = { ...defaultSettings(), ...(record.settings ?? {}) };
    status = VaultStatus.LOCKED;
    emit('status', { status });
    emit('settings', settings);
    return status;
  }

  async function createVault(passphrase) {
    const strength = scorePassphrase(passphrase);
    if (!strength.acceptable) {
      throw new VaultError('Choose a stronger passphrase before creating the vault.', 'WEAK_PASSPHRASE');
    }

    const material = await createVaultMaterial(passphrase);

    const nextRecord = {
      version: 1,
      createdAt: Date.now(),
      kdfSalt: material.kdfSalt,
      wrapSalt: material.wrapSalt,
      verifier: material.verifier,
      wrapNonce: material.wrapNonce,
      wrappedKey: material.wrappedKey,
      wrapTag: material.wrapTag,
      indexNonce: null,
      settings,
    };

    await metaStore.put(serializeRecord(nextRecord));

    record = nextRecord;
    vaultKey = material.vaultKey;
    rawVaultKey = material.rawVaultKey;
    passphraseRef = passphrase;
    items = [];
    status = VaultStatus.UNLOCKED;

    await persistIndex();
    await requestPersistence();

    emit('status', { status });
    return status;
  }

  async function unlock(passphrase) {
    if (!record) throw new VaultError('There is no vault to unlock.', 'NO_VAULT');

    const result = await unlockVault(deserializeRecord(record), passphrase);
    if (!result) return false;

    vaultKey = result.key;
    rawVaultKey = result.rawKey;
    passphraseRef = passphrase;

    await loadIndex();

    status = VaultStatus.UNLOCKED;
    emit('status', { status });
    return true;
  }

  function lock() {
    vaultKey = null;
    rawVaultKey = null;
    passphraseRef = null;
    items = [];
    indexNonce = null;
    status = VaultStatus.LOCKED;
    emit('status', { status });
  }

  /**
   * Decrypt the index blob.
   *
   * Layout is nonce (12) || ciphertext || tag (16), so the ciphertext is the
   * middle section — not everything up to the tag, which would swallow the nonce.
   */
  async function loadIndex() {
    const bytes = await blobStore.get(INDEX_ID);

    if (!bytes) {
      items = [];
      indexNonce = null;
      emit('items', items);
      return;
    }

    const nonce = bytes.slice(0, 12);
    const tag = bytes.slice(bytes.length - 16);
    const ciphertext = bytes.slice(12, bytes.length - 16);

    const plain = await decryptBytes(vaultKey, ciphertext, nonce, tag).catch(() => null);

    if (!plain) {
      // The blob exists but will not open under this key. Treating that as an
      // empty vault would silently look like data loss, so surface it.
      throw new VaultError(
        'The vault index could not be decrypted. It may have been written by a different passphrase or damaged.',
        'INDEX_UNREADABLE',
      );
    }

    try {
      const parsed = JSON.parse(new TextDecoder().decode(plain));
      items = Array.isArray(parsed.items) ? parsed.items : [];
      settings = { ...settings, ...(parsed.settings ?? {}) };
    } catch {
      throw new VaultError('The vault index could not be read and may be damaged.', 'INDEX_CORRUPT');
    }

    emit('items', items);
    emit('settings', settings);
  }

  async function persistIndex() {
    const payload = new TextEncoder().encode(
      JSON.stringify({ version: INDEX_VERSION, items, settings, updatedAt: Date.now() }),
    );

    const nonce = randomBytes(12);
    const { ciphertext, tag } = await encryptBytes(vaultKey, payload, nonce);

    const blob = new Uint8Array(nonce.length + ciphertext.length + tag.length);
    blob.set(nonce, 0);
    blob.set(ciphertext, nonce.length);
    blob.set(tag, nonce.length + ciphertext.length);

    await blobStore.put(INDEX_ID, blob);
    indexNonce = nonce;
  }

  function serializeRecord(next) {
    return {
      version: next.version,
      createdAt: next.createdAt,
      kdfSalt: next.kdfSalt,
      wrapSalt: next.wrapSalt,
      verifier: next.verifier,
      wrapNonce: next.wrapNonce,
      wrappedKey: next.wrappedKey,
      wrapTag: next.wrapTag,
      settings,
    };
  }

  function deserializeRecord(source) {
    return source;
  }

  /**
   * Encrypt and store a single file.
   *
   * Each file gets its own salt and nonce, so a container can be exported and
   * opened elsewhere without the vault index.
   */
  async function addFile(file, { tags = [], note = '', onStage = () => {} } = {}) {
    if (!vaultKey) throw new VaultError('Unlock the vault first.', 'LOCKED');

    if (file.size > MAX_FILE_BYTES) {
      throw new VaultError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. This build encrypts in memory, so files are capped at ${MAX_FILE_BYTES / 1024 / 1024}MB.`,
        'FILE_TOO_LARGE',
      );
    }

    onStage('reading', `Reading ${file.name}`);
    const plain = new Uint8Array(await file.arrayBuffer());

    onStage('hashing', `Fingerprinting ${file.name}`);
    const plainHash = await sha256Hex(plain);

    const duplicate = items.find((item) => item.plainHash === plainHash);
    if (duplicate && !duplicate.deleted) {
      throw new VaultError(`"${file.name}" matches "${duplicate.name}" — identical contents already stored.`, 'DUPLICATE');
    }

    onStage('deriving', `Deriving key for ${file.name}`);
    const packed = await packContainer(plain, passphraseRef);

    onStage('writing', `Writing ${file.name}`);
    const id = makeId();
    await blobStore.put(id, packed.bytes);

    const item = {
      id,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      plainHash,
      tags,
      note,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      container: {
        version: packed.header.version,
        salt: [...packed.header.salt],
        nonce: [...packed.header.nonce],
        tag: [...packed.header.tag],
        ciphertextLength: packed.ciphertextLength,
        totalLength: packed.totalLength,
      },
      verifiedAt: Date.now(),
      deleted: false,
    };

    items = [item, ...items];
    await persistIndex();
    emit('items', items);

    return item;
  }

  /** Decrypt an item back to plaintext bytes. */
  async function extractItem(id) {
    if (!vaultKey) throw new VaultError('Unlock the vault first.', 'LOCKED');

    const item = items.find((entry) => entry.id === id);
    if (!item) throw new VaultError('That item is no longer in the vault.', 'NOT_FOUND');

    const bytes = await blobStore.get(id);
    if (!bytes) throw new VaultError('The stored container is missing from local storage.', 'BLOB_MISSING');

    const { plain } = await openContainer(bytes, passphraseRef);
    return { item, plain };
  }

  /** Re-verify that a stored container still authenticates. */
  async function verifyItem(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new VaultError('That item is no longer in the vault.', 'NOT_FOUND');

    const bytes = await blobStore.get(id);
    if (!bytes) return { ok: false, error: 'Container missing from local storage.' };

    const result = await verifyContainer(bytes, passphraseRef);
    if (result.ok) {
      const plainHash = await sha256Hex(result.plain);
      const matches = plainHash === item.plainHash;

      items = items.map((entry) => (entry.id === id ? { ...entry, verifiedAt: Date.now() } : entry));
      await persistIndex();
      emit('items', items);

      return matches
        ? { ok: true, verifiedAt: Date.now() }
        : { ok: false, error: 'Container authenticates, but the fingerprint does not match the recorded one.' };
    }

    return { ok: false, error: result.error };
  }

  function dissect(id) {
    return blobStore.get(id).then((bytes) => {
      if (!bytes) throw new VaultError('Container missing from local storage.', 'BLOB_MISSING');
      return dissectContainer(bytes);
    });
  }

  async function updateItem(id, patch) {
    items = items.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: Date.now() } : entry));
    await persistIndex();
    emit('items', items);
  }

  /**
   * Remove an item. Password-gated by the caller.
   * The index is written before the blob is deleted, so a crash can never leave
   * an index entry pointing at a missing container.
   */
  async function deleteItem(id) {
    if (!vaultKey) throw new VaultError('Unlock the vault first.', 'LOCKED');

    const item = items.find((entry) => entry.id === id);
    if (!item) throw new VaultError('That item is no longer in the vault.', 'NOT_FOUND');

    items = items.filter((entry) => entry.id !== id);
    await persistIndex();
    emit('items', items);

    await blobStore.remove(id);
    return item;
  }

  /**
   * Re-wrap the vault key under a new passphrase.
   *
   * The data key itself is preserved, only its wrapping changes. That is the
   * whole point of wrapping: stored containers are never re-encrypted.
   */
  async function changePassphrase(currentPassphrase, nextPassphrase) {
    const strength = scorePassphrase(nextPassphrase);
    if (!strength.acceptable) {
      throw new VaultError('Choose a stronger passphrase.', 'WEAK_PASSPHRASE');
    }

    // Re-validating against the verifier also guards against a typo in the
    // current passphrase silently re-wrapping under the wrong key.
    const revalidated = await unlockVault(deserializeRecord(record), currentPassphrase);
    if (!revalidated) throw new VaultError('The current passphrase is incorrect.', 'BAD_PASSPHRASE');

    const kdfSalt = randomBytes(KDF.saltBytes);
    const wrapSalt = randomBytes(KDF.saltBytes);

    const verifier = await deriveBits(nextPassphrase, kdfSalt, { bits: 256 });
    const wrappingKey = await deriveKey(nextPassphrase, wrapSalt, { extractable: true });

    const wrapNonce = randomBytes(12);
    const { ciphertext, tag } = await encryptBytes(wrappingKey, rawVaultKey, wrapNonce);

    record = {
      ...record,
      kdfSalt,
      wrapSalt,
      verifier,
      wrapNonce,
      wrappedKey: ciphertext,
      wrapTag: tag,
    };

    await metaStore.put(serializeRecord(record));

    vaultKey = await importRawKey(rawVaultKey);
    passphraseRef = nextPassphrase;
    await persistIndex();

    return true;
  }

  async function updateSettings(patch) {
    settings = { ...settings, ...patch };
    if (record) {
      record = { ...record, settings };
      await metaStore.put(serializeRecord(record));
    }
    if (vaultKey) await persistIndex();
    emit('settings', settings);
    return settings;
  }

  /** Irreversibly wipe the vault and every stored container. */
  async function destroy() {
    await destroyDatabase();
    status = VaultStatus.UNINITIALIZED;
    vaultKey = null;
    passphraseRef = null;
    record = null;
    items = [];
    settings = defaultSettings();
    emit('status', { status });
    emit('items', items);
  }

  /** Encrypt plaintext under the vault key without adding it as a file item. */
  async function retainBlob(bytes) {
    const nonce = randomBytes(12);
    const { ciphertext, tag } = await encryptBytes(vaultKey, bytes, nonce);
    const blob = new Uint8Array(nonce.length + ciphertext.length + tag.length);
    blob.set(nonce, 0);
    blob.set(ciphertext, nonce.length);
    blob.set(tag, nonce.length + ciphertext.length);
    return blob;
  }

  async function readBlob(blob) {
    const nonce = blob.slice(0, 12);
    const tag = blob.slice(blob.length - 16);
    const ciphertext = blob.slice(12, blob.length - 16);
    return decryptBytes(vaultKey, ciphertext, nonce, tag);
  }

  return {
    on: emitter.on,
    initialize,
    createVault,
    unlock,
    lock,
    addFile,
    extractItem,
    verifyItem,
    dissect,
    updateItem,
    deleteItem,
    changePassphrase,
    updateSettings,
    destroy,
    retainBlob,
    readBlob,
    get storageEstimate() {
      return storageEstimate();
    },
    get status() {
      return status;
    },
    get items() {
      return items;
    },
    get settings() {
      return settings;
    },
    get isUnlocked() {
      return status === VaultStatus.UNLOCKED;
    },
  };
}

export { AuthenticationError, ContainerFormatError, scorePassphrase };
