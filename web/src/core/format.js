/** Small formatting helpers shared across screens. */

export function formatBytes(bytes, precision = 1) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : precision)} ${units[exponent]}`;
}

/** Hex dump with a grouping interval, for the inspector. */
export function toHex(bytes, group = 1, separator = ' ') {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 1) {
    parts.push(bytes[i].toString(16).padStart(2, '0'));
  }
  if (group <= 1) return parts.join(separator);
  return parts.reduce((acc, part, index) => {
    if (index > 0 && index % group === 0) acc.push(separator);
    acc.push(part);
    return acc;
  }, []).join('');
}

export function truncateHex(bytes, head = 12, tail = 8) {
  const full = toHex(bytes);
  if (bytes.length <= head + tail) return full;
  return `${toHex(bytes.slice(0, head))} … ${toHex(bytes.slice(-tail))}`;
}

export function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return `Today, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function extensionOf(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function baseNameOf(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}

/** Strip characters that make a filename hostile on common filesystems. */
export function sanitizeFilename(name, fallback = 'untitled') {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  return cleaned.length ? cleaned.slice(0, 180) : fallback;
}

export async function copyToClipboard(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sandboxed or insecure contexts have no async clipboard. Fall back to selection.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
