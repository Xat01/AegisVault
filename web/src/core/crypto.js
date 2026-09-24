/**
 * Cryptographic primitives.
 *
 * Everything here goes through WebCrypto. No primitive is implemented by hand.
 * The parameters are deliberately conservative and are exported so the UI can
 * tell the user exactly what is protecting their data.
 */

export const KDF = Object.freeze({
  name: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 600_000,
  saltBytes: 16,
  keyBytes: 32,
});

export const CIPHER = Object.freeze({
  name: 'AES-GCM',
  keyBits: 256,
  nonceBytes: 12,
  tagBits: 128,
});

/** Thrown when the platform cannot provide WebCrypto at all. */
export class CryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto is unavailable. Aegis Vault requires a secure context (https or localhost).');
    this.name = 'CryptoUnavailableError';
  }
}

/** Thrown when a container fails authentication — wrong key, or tampered bytes. */
export class AuthenticationError extends Error {
  constructor(message = 'Decryption failed authentication. The passphrase is wrong, or the data was modified.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export function assertCryptoAvailable() {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    throw new CryptoUnavailableError();
  }
}

/**
 * Cryptographically random bytes.
 *
 * `crypto.getRandomValues` throws above 65,536 bytes, so large requests are
 * filled in chunks. Callers should not need to know about that limit.
 */
export function randomBytes(length) {
  assertCryptoAvailable();

  const out = new Uint8Array(length);
  const MAX_CHUNK = 65_536;

  for (let offset = 0; offset < length; offset += MAX_CHUNK) {
    const chunk = out.subarray(offset, Math.min(offset + MAX_CHUNK, length));
    globalThis.crypto.getRandomValues(chunk);
  }

  return out;
}

/**
 * Derive an AES-GCM key from a passphrase and salt.
 *
 * `extractable` defaults to false so derived keys cannot be read back out of
 * memory through the WebCrypto API. Only the keystore wrapping path needs true.
 */
export async function deriveKey(passphrase, salt, { iterations = KDF.iterations, extractable = false } = {}) {
  assertCryptoAvailable();

  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    KDF.name,
    false,
    ['deriveKey', 'deriveBits'],
  );

  return globalThis.crypto.subtle.deriveKey(
    { name: KDF.name, salt, iterations, hash: KDF.hash },
    material,
    { name: CIPHER.name, length: CIPHER.keyBits },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/** Derive raw bits rather than a key — used for passphrase verification values. */
export async function deriveBits(passphrase, salt, { iterations = KDF.iterations, bits = 256 } = {}) {
  assertCryptoAvailable();

  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    KDF.name,
    false,
    ['deriveBits'],
  );

  const buffer = await globalThis.crypto.subtle.deriveBits(
    { name: KDF.name, salt, iterations, hash: KDF.hash },
    material,
    bits,
  );

  return new Uint8Array(buffer);
}

/** Encrypt bytes. Returns the ciphertext and the tag separately. */
export async function encryptBytes(key, bytes, nonce) {
  const result = await globalThis.crypto.subtle.encrypt(
    { name: CIPHER.name, iv: nonce, tagLength: CIPHER.tagBits },
    key,
    bytes,
  );

  const combined = new Uint8Array(result);
  const tagLength = CIPHER.tagBits / 8;

  return {
    ciphertext: combined.slice(0, combined.length - tagLength),
    tag: combined.slice(combined.length - tagLength),
  };
}

/** Decrypt bytes. Throws AuthenticationError when the tag does not verify. */
export async function decryptBytes(key, ciphertext, nonce, tag) {
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  try {
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: CIPHER.name, iv: nonce, tagLength: CIPHER.tagBits },
      key,
      combined,
    );
    return new Uint8Array(plain);
  } catch {
    throw new AuthenticationError();
  }
}

/** SHA-256 as lowercase hex. Used for integrity fingerprints and deduplication. */
export async function sha256Hex(bytes) {
  assertCryptoAvailable();
  // WebCrypto rejects typed-array views that do not cover their whole buffer,
  // so normalise to a plain ArrayBuffer before digesting.
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time-ish comparison for equal-length byte arrays. */
export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
