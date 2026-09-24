/**
 * DOM helpers.
 *
 * A tiny element factory instead of a templating layer. Everything the UI needs
 * is either `h('div', {...}, children)` or an SVG icon from `icons.js`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 * Keys beginning with `on` bind events; `class`/`style`/`dataset` are handled
 * specially; everything else becomes an attribute or a direct property.
 */
export function h(tag, props = null, ...children) {
  const element = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'class') element.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(element.style, value);
      else if (key === 'dataset') Object.assign(element.dataset, value);
      else if (key === 'html') element.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in element && key !== 'list' && typeof value !== 'object') {
        element[key] = value;
      } else {
        element.setAttribute(key, value === true ? '' : value);
      }
    }
  }

  appendChildren(element, children);
  return element;
}

/** Namespaced element factory for inline SVG. */
export function svg(tag, props = null, ...children) {
  const element = document.createElementNS(SVG_NS, tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        element.setAttribute(key, value);
      }
    }
  }

  appendChildren(element, children, true);
  return element;
}

function appendChildren(element, children, namespace = false) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (child instanceof Node) element.appendChild(child);
    else element.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
  return element;
}

export function replace(element, ...children) {
  clear(element);
  appendChildren(element, children);
  return element;
}

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/**
 * Trap Tab focus inside a container. Returns a release function.
 * Used by modals and the command palette so focus cannot escape behind an overlay.
 */
export function trapFocus(container) {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function onKeydown(event) {
    if (event.key !== 'Tab') return;

    const focusable = $$(selector, container).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}

/** Remember where focus was so it can be restored when an overlay closes. */
export function captureFocus() {
  const previous = document.activeElement;
  return () => {
    if (previous && typeof previous.focus === 'function' && previous.isConnected) previous.focus();
  };
}

export function debounce(fn, wait = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Trigger a browser download for a Blob without leaking an object URL. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = h('a', { href: url, download: filename });
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
