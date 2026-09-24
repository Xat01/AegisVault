/** Minimal synchronous event bus. Keeps the domain layer free of DOM knowledge. */

export function createEmitter() {
  const listeners = new Map();

  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    },

    emit(event, payload) {
      listeners.get(event)?.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Listener for "${event}" threw:`, error);
        }
      });
    },
  };
}

/** Estimate passphrase strength and explain the reasoning rather than just scoring. */
const COMMON_PATTERNS = [
  /^password/i, /^1234/, /^qwerty/i, /^letmein/i, /^admin/i, /^welcome/i,
  /^iloveyou/i, /^monkey/i, /^dragon/i, /^abc123/i, /^football/i,
];

export function scorePassphrase(passphrase) {
  const checks = {
    length: passphrase.length >= 12,
    long: passphrase.length >= 20,
    mixedCase: /[a-z]/.test(passphrase) && /[A-Z]/.test(passphrase),
    digits: /\d/.test(passphrase),
    symbols: /[^A-Za-z0-9]/.test(passphrase),
    noRepeat: !/(.)\1{2,}/.test(passphrase),
    noCommon: !COMMON_PATTERNS.some((pattern) => pattern.test(passphrase)),
    noSequence: !/(?:abc|bcd|cde|123|234|345|456|567|678|789|890|qwe|wer|ert)/i.test(passphrase),
  };

  // Rough entropy floor: charset size to the power of length.
  let charset = 0;
  if (/[a-z]/.test(passphrase)) charset += 26;
  if (/[A-Z]/.test(passphrase)) charset += 26;
  if (/\d/.test(passphrase)) charset += 10;
  if (/[^A-Za-z0-9]/.test(passphrase)) charset += 33;
  const entropy = passphrase.length && charset ? passphrase.length * Math.log2(charset) : 0;

  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;

  let level = 0;
  if (passphrase.length === 0) level = 0;
  else if (entropy < 40 || !checks.noCommon) level = 1;
  else if (entropy < 60) level = 2;
  else if (entropy < 85) level = 3;
  else level = 4;

  const labels = ['Empty', 'Weak', 'Fair', 'Strong', 'Excellent'];

  return {
    level,
    label: labels[level],
    entropy: Math.round(entropy),
    checks,
    passed,
    total,
    /** A passphrase is acceptable to proceed with at level 2 or above. */
    acceptable: level >= 2,
  };
}
