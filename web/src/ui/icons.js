/** Inline SVG icon set. Stroke-based, 1.6 weight, currentColor. */

import { svg } from './dom.js';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.6',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
};

function icon(...children) {
  return (size = 16) => svg('svg', { ...base, width: size, height: size }, ...children);
}

export const icons = {
  shield: icon(svg('path', { d: 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z' })),
  lock: icon(
    svg('rect', { x: '4.5', y: '10.5', width: '15', height: '10', rx: '2' }),
    svg('path', { d: 'M8 10.5V7.5a4 4 0 0 1 8 0v3' }),
  ),
  unlock: icon(
    svg('rect', { x: '4.5', y: '10.5', width: '15', height: '10', rx: '2' }),
    svg('path', { d: 'M8 10.5V7.5a4 4 0 0 1 7.5-1.9' }),
  ),
  plus: icon(svg('path', { d: 'M12 5v14M5 12h14' })),
  search: icon(svg('circle', { cx: '11', cy: '11', r: '6.5' }), svg('path', { d: 'M16 16l4.5 4.5' })),
  trash: icon(
    svg('path', { d: 'M4 7h16M9.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7' }),
    svg('path', { d: 'M6.5 7l1 12a2 2 0 0 0 2 1.9h5a2 2 0 0 0 2-1.9l1-12' }),
  ),
  download: icon(svg('path', { d: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14' })),
  eye: icon(
    svg('path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }),
    svg('circle', { cx: '12', cy: '12', r: '2.8' }),
  ),
  eyeOff: icon(
    svg('path', { d: 'M10 5.8A8.9 8.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.6' }),
    svg('path', { d: 'M6.3 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.75' }),
    svg('path', { d: 'M3.5 3.5l17 17' }),
  ),
  check: icon(svg('path', { d: 'M4.5 12.5l5 5L20 7' })),
  x: icon(svg('path', { d: 'M6 6l12 12M18 6L6 18' })),
  chevronDown: icon(svg('path', { d: 'M6 9l6 6 6-6' })),
  chevronRight: icon(svg('path', { d: 'M9 6l6 6-6 6' })),
  settings: icon(
    svg('circle', { cx: '12', cy: '12', r: '3' }),
    svg('path', {
      d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    }),
  ),
  grid: icon(
    svg('rect', { x: '4', y: '4', width: '7', height: '7', rx: '1.5' }),
    svg('rect', { x: '13', y: '4', width: '7', height: '7', rx: '1.5' }),
    svg('rect', { x: '4', y: '13', width: '7', height: '7', rx: '1.5' }),
    svg('rect', { x: '13', y: '13', width: '7', height: '7', rx: '1.5' }),
  ),
  list: icon(svg('path', { d: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' })),
  file: icon(
    svg('path', { d: 'M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5L13.5 3z' }),
    svg('path', { d: 'M13.5 3v5.5H19' }),
  ),
  folder: icon(svg('path', { d: 'M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l2 2.5h7.8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' })),
  clock: icon(svg('circle', { cx: '12', cy: '12', r: '8' }), svg('path', { d: 'M12 7.5V12l3 2' })),
  alert: icon(
    svg('path', { d: 'M10.3 4.3L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z' }),
    svg('path', { d: 'M12 9.5v4M12 17h.01' }),
  ),
  info: icon(svg('circle', { cx: '12', cy: '12', r: '8.5' }), svg('path', { d: 'M12 11v5M12 8h.01' })),
  copy: icon(
    svg('rect', { x: '9', y: '9', width: '11', height: '11', rx: '2' }),
    svg('path', { d: 'M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3' }),
  ),
  fingerprint: icon(
    svg('path', { d: 'M12 4.5c-2.5 0-4.7 1.2-6 3' }),
    svg('path', { d: 'M4 12.5a8 8 0 0 1 1.5-4.5' }),
    svg('path', { d: 'M8 20a11 11 0 0 0 1.4-5.4c0-1.5 1.2-2.6 2.6-2.6s2.6 1.1 2.6 2.6A15 15 0 0 1 13.6 21' }),
    svg('path', { d: 'M19 9.2A7.8 7.8 0 0 1 20 13c0 2-.3 3.9-1 5.5' }),
  ),
  key: icon(
    svg('circle', { cx: '8', cy: '14', r: '3.5' }),
    svg('path', { d: 'M10.8 11.5L19 3.5M16 4.5l2.5 2.5M14 6.5L16.5 9' }),
  ),
  database: icon(
    svg('ellipse', { cx: '12', cy: '6', rx: '7.5', ry: '3' }),
    svg('path', { d: 'M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6' }),
    svg('path', { d: 'M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3' }),
  ),
  zap: icon(svg('path', { d: 'M13 3L5 13.5h5.5L11 21l8-10.5h-5.5L13 3z' })),
  refresh: icon(
    svg('path', { d: 'M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5' }),
    svg('path', { d: 'M4 4v4.5h4.5' }),
    svg('path', { d: 'M4 12.5A8 8 0 0 0 17.7 17.7L20 15.5' }),
    svg('path', { d: 'M20 20v-4.5h-4.5' }),
  ),
  menu: icon(svg('path', { d: 'M4 7h16M4 12h16M4 17h16' })),
  sun: icon(
    svg('circle', { cx: '12', cy: '12', r: '4' }),
    svg('path', { d: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4' }),
  ),
  moon: icon(svg('path', { d: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z' })),
  upload: icon(svg('path', { d: 'M12 16V5m0 0L8 9m4-4l4 4M5 19h14' })),
  hash: icon(svg('path', { d: 'M5 9h14M5 15h14M9.5 4l-2 16M16.5 4l-2 16' })),
  tag: icon(
    svg('path', { d: 'M3.5 11.5V5a1.5 1.5 0 0 1 1.5-1.5h6.5L20 12l-8.5 8.5z' }),
    svg('circle', { cx: '8', cy: '8', r: '1.3' }),
  ),
  shieldOff: icon(
    svg('path', { d: 'M12 3l7 3v6c0 1-.2 2-.5 2.9M9 20.2c-2.8-1.5-4.6-4.3-4.6-8.2V6' }),
    svg('path', { d: 'M3.5 3.5l17 17' }),
  ),
  command: icon(svg('path', { d: 'M9 3a3 3 0 1 1-3 3h12a3 3 0 1 1-3-3v12a3 3 0 1 1 3-3H6a3 3 0 1 1 3 3z' })),
  archive: icon(
    svg('rect', { x: '3.5', y: '4', width: '17', height: '4.5', rx: '1.5' }),
    svg('path', { d: 'M5.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5' }),
    svg('path', { d: 'M10 12.5h4' }),
  ),
  bell: icon(svg('path', { d: 'M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5z' }), svg('path', { d: 'M13.7 20a2 2 0 0 1-3.4 0' })),
  arrowRight: icon(svg('path', { d: 'M5 12h14m0 0l-5-5m5 5l-5 5' })),
};
