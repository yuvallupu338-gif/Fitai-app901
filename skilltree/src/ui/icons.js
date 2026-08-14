/*
 * icons.js — the icon set, drawn inline.
 *
 * Lucide's geometry (24×24 grid, 2px round stroke, currentColor) without the
 * dependency, because this repo ships no npm packages and an icon font or a
 * sprite sheet would be a network request per app. Every glyph here is one the
 * interface actually uses; there is no unused set.
 */

import { svg } from '../core/dom.js';

const PATHS = {
  /* navigation */
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5'],
  tree: ['M12 3v6', 'M12 15v6', 'M5 12h14', 'M5 12v3', 'M19 12v3', 'M12 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M6.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M17.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  learn: ['M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z', 'M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z'],
  compass: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm15 9-2 5-4 1 2-5Z'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  award: ['M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'm8.5 13-1.5 8L12 18l5 3-1.5-8'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 21a7 7 0 0 1 14 0'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z'],

  /* state */
  lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z'],
  check: ['m4.5 12.5 5 5 10-11'],
  star: ['m12 3 2.6 5.6 6.4.8-4.7 4.3 1.2 6.3-5.5-3.1L6.5 20l1.2-6.3L3 9.4l6.4-.8Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  play: ['m7 4 12 8-12 8Z'],
  flame: ['M12 22c3.9 0 7-3 7-6.8 0-3.9-3-5.7-4-8.2-.6 1.6-1.6 2.6-3 3.5C10 8 9 5.6 9.6 2 6.6 4 5 7.6 5 11.2 5 15 8.1 22 12 22Z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'],
  bolt: ['m13 2-9 12h7l-1 8 9-12h-7Z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3.5 2'],
  refresh: ['M20 11a8 8 0 0 0-14.3-4.5', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.3 4.5', 'M20 20v-4h-4'],

  /* actions */
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  back: ['M19 12H5', 'm11 18-6-6 6-6'],
  chevron: ['m9 6 6 6-6 6'],
  zoomIn: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3', 'M8 11h6'],
  fit: ['M4 9V5a1 1 0 0 1 1-1h4', 'M15 4h4a1 1 0 0 1 1 1v4', 'M20 15v4a1 1 0 0 1-1 1h-4', 'M9 20H5a1 1 0 0 1-1-1v-4'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'],
  sparkle: ['m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  send: ['m22 2-7 20-4-9-9-4Z'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  sigma: ['M18 4H6l6 8-6 8h12'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  trend: ['m22 7-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  seed: ['M12 21v-8', 'M12 13c0-4 3-7 8-7 0 5-4 7-8 7Z', 'M12 13c0-3-2-5-6-5 0 4 3 5 6 5Z'],
};

/**
 * icon('check', { size: 18 })
 * Uses currentColor so a glyph always matches the text it sits beside; no
 * icon here ever carries its own colour.
 */
export function icon(name, opts = {}) {
  const paths = PATHS[name] || PATHS.info;
  const size = opts.size || 20;
  return svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': opts.weight || 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: opts.class || '',
    /* Decorative by default: the label beside an icon is what assistive tech
     * should read, and announcing both is noise. Pass a label where the icon
     * is the only content. */
    'aria-hidden': opts.label ? null : 'true',
    role: opts.label ? 'img' : null,
    'aria-label': opts.label || null,
  }, ...paths.map((d) => svg('path', { d })));
}

/** The wordmark: a small three-node branch. Drawn, not an image file. */
export function brandMark(size = 26) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', 'aria-hidden': 'true', class: 'nav-mark' },
    svg('path', { d: 'M12 20v-6M12 14 6 9M12 14l6-5', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', opacity: '.5' }),
    svg('circle', { cx: 12, cy: 21, r: 2, fill: 'currentColor', opacity: '.5' }),
    svg('circle', { cx: 6, cy: 7.5, r: 2.6, fill: 'var(--lime)' }),
    svg('circle', { cx: 18, cy: 7.5, r: 2.2, fill: 'currentColor', opacity: '.35' }));
}
