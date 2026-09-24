/**
 * Crypto lifecycle test.
 *
 * Exercises the key material end to end in Node's WebCrypto (which implements
 * the same API the browser uses): create, wrap, unlock, wrong-passphrase
 * rejection, re-wrap, and container round-trip with tamper detection.
 *
 * Run with:  node tools/crypto-test.mjs
 */

import { webcrypto } from 'node:crypto';

globalThis.crypto ??= webcrypto;

const { createVaultMaterial, unlockVault } = await import('../src/core/keystore.js');
const { packContainer, openContainer, readHeader, dissectContainer } = await import('../src/core/container.js');
const { decryptBytes, encryptBytes, randomBytes, sha256Hex } = await import('../src/core/crypto.js');
const { deriveBits, deriveKey } = await import('../src/core/crypto.js');
const { KDF } = await import('../src/core/crypto.js');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log('  PASS  ' + label); }
  else { failed += 1; console.log('  FAIL  ' + label + (detail ? ' :: ' + detail : '')); }
}

const PASSPHRASE = 'correct-horse-battery-staple-42!';
const WRONG = 'wrong-passphrase-entirely-77!';

console.log('\nKey material lifecycle');

const material = await createVaultMaterial(PASSPHRASE);
check('Vault material created', Boolean(material.vaultKey));
check('Raw key is 32 bytes', material.rawVaultKey.length === 32, String(material.rawVaultKey.length));
check('KDF salt is 16 bytes', material.kdfSalt.length === 16);
check('Verifier is 32 bytes', material.verifier.length === 32);

// The record as it would be persisted.
const record = {
  kdfSalt: material.kdfSalt,
  wrapSalt: material.wrapSalt,
  verifier: material.verifier,
  wrapNonce: material.wrapNonce,
  wrappedKey: material.wrappedKey,
  wrapTag: material.wrapTag,
};

console.log('\nUnlock');

const good = await unlockVault(record, PASSPHRASE);
check('Correct passphrase unlocks', Boolean(good));
check('Unlocked raw key matches the original',
  Buffer.compare(Buffer.from(good.rawKey), Buffer.from(material.rawVaultKey)) === 0);

const bad = await unlockVault(record, WRONG);
check('Wrong passphrase returns null', bad === null);

console.log('\nKey equivalence (unlock produces a usable key)');

const payload = new TextEncoder().encode('attack at dawn — bring the good biscuits');
const nonce = randomBytes(12);
const sealed = await encryptBytes(material.vaultKey, payload, nonce);

const reopened = await decryptBytes(good.key, sealed.ciphertext, nonce, sealed.tag);
check('Data sealed with the created key opens with the unlocked key',
  new TextDecoder().decode(reopened) === 'attack at dawn — bring the good biscuits');

console.log('\nContainer round-trip');

const container = await packContainer(payload, PASSPHRASE);
check('Container has the expected header length', container.bytes.length - payload.length === 49,
  String(container.bytes.length - payload.length));

const header = readHeader(container.bytes);
check('Magic bytes are AEGS',
  header.salt.length === 16 && header.nonce.length === 12 && header.tag.length === 16);
check('Version byte is 1', header.version === 1);

const opened = await openContainer(container.bytes, PASSPHRASE);
check('Container decrypts with the right passphrase',
  new TextDecoder().decode(opened.plain) === 'attack at dawn — bring the good biscuits');

let authFailed = false;
try {
  await openContainer(container.bytes, WRONG);
} catch (error) {
  authFailed = error.name === 'AuthenticationError';
}
check('Container refuses the wrong passphrase with an AuthenticationError', authFailed);

console.log('\nTamper detection');

const tampered = new Uint8Array(container.bytes);
tampered[60] ^= 0x01; // flip one bit of ciphertext
let tamperCaught = false;
try {
  await openContainer(tampered, PASSPHRASE);
} catch (error) {
  tamperCaught = error.name === 'AuthenticationError';
}
check('A single flipped bit is detected', tamperCaught);

const tamperedHeader = new Uint8Array(container.bytes);
tamperedHeader[25] ^= 0x01; // flip one bit of the nonce
let nonceCaught = false;
try {
  await openContainer(tamperedHeader, PASSPHRASE);
} catch (error) {
  nonceCaught = error.name === 'AuthenticationError';
}
check('A modified nonce is detected', nonceCaught);

console.log('\nNonce uniqueness');

const nonces = new Set();
for (let i = 0; i < 50; i += 1) {
  const packed = await packContainer(payload, PASSPHRASE);
  nonces.add(Buffer.from(packed.header.nonce).toString('hex'));
}
check('50 containers produce 50 distinct nonces', nonces.size === 50, String(nonces.size));

const salts = new Set();
for (let i = 0; i < 20; i += 1) {
  const packed = await packContainer(payload, PASSPHRASE);
  salts.add(Buffer.from(packed.header.salt).toString('hex'));
}
check('20 containers produce 20 distinct salts', salts.size === 20, String(salts.size));

console.log('\nRe-wrap under a new passphrase');

const NEXT = 'a-completely-different-passphrase-2026!';
const nextSalt = randomBytes(16);
const nextWrapSalt = randomBytes(16);
const nextVerifier = await deriveBits(NEXT, nextSalt, { bits: 256 });
const nextWrapping = await deriveKey(NEXT, nextWrapSalt, { extractable: true });
const nextNonce = randomBytes(12);
const rewrapped = await encryptBytes(nextWrapping, good.rawKey, nextNonce);

const nextRecord = {
  kdfSalt: nextSalt,
  wrapSalt: nextWrapSalt,
  verifier: nextVerifier,
  wrapNonce: nextNonce,
  wrappedKey: rewrapped.ciphertext,
  wrapTag: rewrapped.tag,
};

const afterRewrap = await unlockVault(nextRecord, NEXT);
check('New passphrase unlocks the re-wrapped vault', Boolean(afterRewrap));
check('Re-wrapping preserved the data key',
  Buffer.compare(Buffer.from(afterRewrap.rawKey), Buffer.from(good.rawKey)) === 0);

const oldOnNew = await unlockVault(nextRecord, PASSPHRASE);
check('Old passphrase no longer works after re-wrapping', oldOnNew === null);

// The critical property: an existing container still opens, because the data
// key never changed — only the wrapping around it did.
const stillOpens = await openContainer(container.bytes, PASSPHRASE);
check('Pre-existing containers still open with their own passphrase after a re-wrap',
  new TextDecoder().decode(stillOpens.plain) === 'attack at dawn — bring the good biscuits');

console.log('\nZero-byte and large payloads');

const empty = await packContainer(new Uint8Array(0), PASSPHRASE);
check('Empty payload produces a valid container', empty.bytes.length === 49, String(empty.bytes.length));
const emptyOut = await openContainer(empty.bytes, PASSPHRASE);
check('Empty payload round-trips', emptyOut.plain.length === 0);

const largePayload = randomBytes(1024 * 1024);
const large = await packContainer(largePayload, PASSPHRASE);
const largeOut = await openContainer(large.bytes, PASSPHRASE);
check('1 MB payload round-trips byte-for-byte',
  Buffer.compare(Buffer.from(largeOut.plain), Buffer.from(largePayload)) === 0);

console.log('\nFingerprints');

const hashA = await sha256Hex(payload);
const hashB = await sha256Hex(payload);
check('Fingerprints are deterministic', hashA === hashB);
check('Fingerprint is 64 hex characters', hashA.length === 64);
const hashC = await sha256Hex(new Uint8Array([...payload, 1]));
check('Different content yields a different fingerprint', hashA !== hashC);

console.log('\nBinary safety');

const allBytes = new Uint8Array(256).map((_, i) => i);
const binPacked = await packContainer(allBytes, PASSPHRASE);
const binOut = await openContainer(binPacked.bytes, PASSPHRASE);
check('All 256 byte values survive encryption',
  Buffer.compare(Buffer.from(binOut.plain), Buffer.from(allBytes)) === 0);

console.log('\n' + '='.repeat(56));
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(56) + '\n');

process.exit(failed ? 1 : 0);
