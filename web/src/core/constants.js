/** Shared constants. Kept in one place so the UI and domain layer never disagree. */

/**
 * WebCrypto operates on whole buffers in memory. Above this size the browser tab
 * becomes unstable, so the limit is enforced rather than silently failing.
 */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

export const INDEX_ID = '__index__';

export const INDEX_VERSION = 1;

export const ACCEPTED_EXTENSIONS = null; // any file type is accepted

export const FILE_KIND_LABELS = Object.freeze({
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  pdf: 'Document',
  text: 'Text',
  archive: 'Archive',
  code: 'Code',
  other: 'File',
});

export const CODE_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'cpp', 'h', 'hpp', 'c',
  'cs', 'java', 'go', 'rs', 'rb', 'php', 'sh', 'sql', 'yml', 'yaml', 'toml', 'xml',
]);

export const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'aegis']);

export const TEXT_EXTENSIONS = new Set(['txt', 'md', 'log', 'csv', 'tsv', 'rtf']);
