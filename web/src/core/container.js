/**
 * The AEGS container format.
 *
 * A single encrypted file is self-describing. It carries its own salt and nonce,
 * so a container can be decrypted without any access to the vault index.
 * That is what makes an exported .aegis file portable.
 *
 *   offset  size  field
 *   ------  ----  -----
 *   0       4     magic       "AEGS"
 *   4       1     version     1
 *   5       16    salt        PBKDF2 salt for this file's key
 *   21      12    nonce       AES-GCM IV, unique per file
 *   33      16    tag         GCM authentication tag
 *   49      ..    ciphertext
 */

import { CIPHER, KDF, encryptBytes, decryptBytes, deriveKey, randomBytes } from './crypto.js';

export const MAGIC = new Uint8Array([0x41, 0x45, 0x47, 0x53]); // "AEGS"
export const VERSION = 1;

export const HEADER_LAYOUT = Object.freeze({
  magic: { offset: 0, length: 4 },
  version: { offset: 4, length: 1 },
  salt: { offset: 5, length: 16 },
  nonce: { offset: 21, length: 12 },
  tag: { offset: 33, length: 16 },
  header: { offset: 0, length: 49 },
});

export class ContainerFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContainerFormatError';
  }
}

function matchesMagic(bytes) {
  if (bytes.length < MAGIC.length) return false;
  return MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * Encrypt a plaintext payload into a self-contained AEGS container.
 *
 * Returns the assembled bytes plus the header material, because the inspector
 * screen displays the salt and nonce and it would be wasteful to re-parse them.
 */
export async function packContainer(plainBytes, passphrase) {
  const salt = randomBytes(KDF.saltBytes);
  const nonce = randomBytes(CIPHER.nonceBytes);

  const key = await deriveKey(passphrase, salt);
  const { ciphertext, tag } = await encryptBytes(key, plainBytes, nonce);

  const out = new Uint8Array(HEADER_LAYOUT.header.length + ciphertext.length);

  out.set(MAGIC, HEADER_LAYOUT.magic.offset);
  out[HEADER_LAYOUT.version.offset] = VERSION;
  out.set(salt, HEADER_LAYOUT.salt.offset);
  out.set(nonce, HEADER_LAYOUT.nonce.offset);
  out.set(tag, HEADER_LAYOUT.tag.offset);
  out.set(ciphertext, HEADER_LAYOUT.header.length);

  return {
    bytes: out,
    header: { salt, nonce, tag, version: VERSION },
    ciphertextLength: ciphertext.length,
    totalLength: out.length,
  };
}

/** Read the header without decrypting. Used to show basic facts before unlocking. */
export function readHeader(bytes) {
  if (bytes.length < HEADER_LAYOUT.header.length) {
    throw new ContainerFormatError('File is too small to be an Aegis container.');
  }
  if (!matchesMagic(bytes)) {
    throw new ContainerFormatError('Not an Aegis container — magic bytes do not match.');
  }

  const version = bytes[HEADER_LAYOUT.version.offset];
  if (version !== VERSION) {
    throw new ContainerFormatError(`Unsupported container version ${version}. This build understands version ${VERSION}.`);
  }

  return {
    version,
    salt: bytes.slice(HEADER_LAYOUT.salt.offset, HEADER_LAYOUT.salt.offset + HEADER_LAYOUT.salt.length),
    nonce: bytes.slice(HEADER_LAYOUT.nonce.offset, HEADER_LAYOUT.nonce.offset + HEADER_LAYOUT.nonce.length),
    tag: bytes.slice(HEADER_LAYOUT.tag.offset, HEADER_LAYOUT.tag.offset + HEADER_LAYOUT.tag.length),
    ciphertextLength: bytes.length - HEADER_LAYOUT.header.length,
  };
}

/**
 * Open a container. Throws AuthenticationError from the cipher layer when the
 * passphrase is wrong or the bytes were altered.
 */
export async function openContainer(bytes, passphrase) {
  const header = readHeader(bytes);
  const key = await deriveKey(passphrase, header.salt);
  const ciphertext = bytes.slice(HEADER_LAYOUT.header.length);

  const plain = await decryptBytes(key, ciphertext, header.nonce, header.tag);

  return { plain, header };
}

/**
 * Verify a container still authenticates.
 *
 * Returns the decrypted payload so the caller can also re-check the plaintext
 * fingerprint. This is a real re-verification, not a checksum stored beside the
 * data where an attacker could recompute it.
 */
export async function verifyContainer(bytes, passphrase) {
  try {
    const { plain, header } = await openContainer(bytes, passphrase);
    return { ok: true, plain, plainLength: plain.length, header };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/** Split an existing container back into its parts. Used by the inspector. */
export function dissectContainer(bytes) {
  const header = readHeader(bytes);
  return {
    ...header,
    ciphertext: bytes.slice(HEADER_LAYOUT.header.length),
    totalLength: bytes.length,
  };
}
