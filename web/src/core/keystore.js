/**
 * Keystore — how the vault key survives a page reload.
 *
 * The derived vault key is never stored in the clear. It is wrapped with a
 * second, independent derivation of the same passphrase against a different
 * salt, and only the wrapped form is persisted. Unlocking unwraps it.
 *
 * The verifier is a separate PBKDF2 output over a fixed constant. It lets us
 * reject a wrong passphrase with a precise message instead of deriving a bad
 * key and failing deep inside decryption.
 */

import { KDF, CIPHER, deriveKey, deriveBits, randomBytes, encryptBytes, decryptBytes, bytesEqual } from './crypto.js';

const CIPHER_NAME = CIPHER.name;
const VERIFIER_CONSTANT = new TextEncoder().encode('aegis-vault/verifier/v1');
const CHECK_BYTES = new TextEncoder().encode('aegis-vault/check/v1');

/** Build the full set of material a new vault needs. */
export async function createVaultMaterial(passphrase) {
  const kdfSalt = randomBytes(KDF.saltBytes);
  const wrapSalt = randomBytes(KDF.saltBytes);

  const verifier = await deriveBits(passphrase, kdfSalt, { bits: 256 });

  // The vault key is generated directly rather than derived, so it can be
  // wrapped and re-wrapped under a new passphrase without the files ever
  // needing to be re-encrypted. It must be extractable to be exported once
  // for wrapping; the working copy handed to the app is not extractable.
  const rawVaultKey = randomBytes(KDF.keyBytes);
  const vaultKey = await importRawKey(rawVaultKey);
  const wrappingKey = await deriveKey(passphrase, wrapSalt, { extractable: true });

  const wrapNonce = randomBytes(12);
  const { ciphertext, tag } = await encryptBytes(wrappingKey, rawVaultKey, wrapNonce);

  return {
    kdfSalt,
    wrapSalt,
    verifier,
    wrapNonce,
    wrappedKey: ciphertext,
    wrapTag: tag,
    vaultKey,
    /** Retained so the key can be re-wrapped under a new passphrase later. */
    rawVaultKey,
  };
}

/** Import raw bytes as a non-extractable AES-GCM key. */
export async function importRawKey(rawBytes) {
  return globalThis.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: CIPHER_NAME, length: KDF.keyBytes * 8 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Check a passphrase against the stored verifier.
 *
 * Returns null when the passphrase is wrong. Returns the working key plus the
 * raw key bytes when it is right — the raw bytes are needed only if the user
 * later changes their passphrase.
 */
export async function unlockVault(record, passphrase) {
  const kdfSalt = new Uint8Array(record.kdfSalt);
  const verifier = await deriveBits(passphrase, kdfSalt, { bits: 256 });

  if (!bytesEqual(verifier, new Uint8Array(record.verifier))) {
    return null;
  }

  const wrappingKey = await deriveKey(passphrase, new Uint8Array(record.wrapSalt), { extractable: true });

  const rawVaultKey = await decryptBytes(
    wrappingKey,
    new Uint8Array(record.wrappedKey),
    new Uint8Array(record.wrapNonce),
    new Uint8Array(record.wrapTag),
  );

  return { key: await importRawKey(rawVaultKey), rawKey: rawVaultKey };
}

/** Derive the raw key bytes from a passphrase, for re-encrypting the index. */
export async function deriveRawKey(passphrase, salt) {
  const key = await deriveKey(passphrase, salt, { extractable: true });
  const raw = await globalThis.crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export { VERIFIER_CONSTANT, CHECK_BYTES };
