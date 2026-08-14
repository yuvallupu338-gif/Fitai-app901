/*
 * icons.js — the icon set, drawn as paths rather than pulled from a package.
 *
 * 24×24 grid, 1.75 stroke, round caps and joins — the Lucide geometry, which
 * is what the interface was designed against. They are inline SVG because a
 * sprite sheet or an icon font is a second network request for something that
 * compresses to nothing, and because `currentColor` lets a nav item's hover
 * state carry the icon with it for free.
 *
 * DIRECTIONAL ICONS ARE A HAZARD IN RTL.
 *
 * A chevron that means "forward" must point right in an LTR document and left
 * in an RTL one; a chevron that means "east" must point right in both. Those
 * are different icons that happen to be the same drawing, so they have
 * different names here: `next`/`prev` flip with the writing direction,
 * `chevronRight`/`chevronLeft` never do. Anything that reads as an arrow of
 * progress — back, next, forward, return — belongs to the first group. Icons
 * that are not directional at all (a clock, a check) are left alone, because
 * mirroring them is the other classic RTL bug.
 */

const NS = 'http://www.w3.org/2000/svg';

/* Each entry is the inner markup of a 24×24 stroke icon. */
const PATHS = {
  /* navigation */
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  goal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  project: '<path d="M4 20h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.5l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2z"/>',
  habit: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  routine: '<path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/>',
  focus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  progress: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 15l3.5-4 3 2.5L18 8"/>',
  review: '<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="m9 15 2 2 4-4"/>',
  area: '<path d="M2 12h20"/><circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  someday: '<path d="M12 3a6 6 0 0 0-6 6c0 2 1 3 1.5 4.5.3.9.5 1.8.5 2.5h8c0-.7.2-1.6.5-2.5C17 12 18 11 18 9a6 6 0 0 0-6-6z"/><path d="M9.5 20h5M10 22h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  memory: '<path d="M12 5a3 3 0 1 0-5.997.125"/><path d="M12 5a3 3 0 1 1 5.997.125"/><path d="M6.003 5.125A3 3 0 0 0 4.5 10.5a3 3 0 0 0 .5 5.5 3 3 0 0 0 3 3 3 3 0 0 0 4 1 3 3 0 0 0 4-1 3 3 0 0 0 3-3 3 3 0 0 0 .5-5.5 3 3 0 0 0-1.503-5.375"/><path d="M12 5v14"/>',
  assistant: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15.5l.7 1.9 1.8.6-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.6z"/>',

  /* actions */
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  play: '<path d="M6 4.5v15l13-7.5z"/>',
  pause: '<path d="M9 4v16M15 4v16"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6"/>',
  split: '<path d="M3 6h5l4 6 4-6h5"/><path d="M3 18h5l4-6"/><path d="m18 3 3 3-3 3M18 15l3 3-3 3"/>',

  /* status and meaning */
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-9-2 2-3 3-3 5 0-2-1.5-3-3-4-1 3-4 5-4 8a7 7 0 0 0 7 7z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a15.6 15.6 0 0 1-3.1 3.9M6.6 6.8A15.9 15.9 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.1-.9"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  blocked: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  flag: '<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  scale: '<path d="M12 3v18M7 21h10"/><path d="m5 7 3 6H2zM19 7l3 6h-6z"/><path d="M5 7h14"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',

  /* chevrons that mean east/west and never flip */
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  chevronUp: '<path d="m19 15-7-7-7 7"/>',
  arrowRight: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  arrowLeft: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
};

/* Icons whose meaning is "forward"/"back" along the reading direction. These
 * are the ones that must mirror; everything else must not. */
const DIRECTIONAL = {
  next: 'chevronLeft',      // forward in RTL points left
  prev: 'chevronRight',
  forward: 'arrowLeft',
  back: 'arrowRight',
};

const LTR_DIRECTIONAL = {
  next: 'chevronRight',
  prev: 'chevronLeft',
  forward: 'arrowRight',
  back: 'arrowLeft',
};

function isRtl() {
  return typeof document === 'undefined'
    || (document.documentElement.getAttribute('dir') || 'rtl') === 'rtl';
}

/**
 * icon('calendar') → <svg>
 *
 * Decorative by default (aria-hidden) because the icon almost always sits next
 * to its own label. Pass a `label` only when the icon IS the button.
 */
export function icon(name, opts) {
  const o = opts || {};
  let key = name;
  if (Object.prototype.hasOwnProperty.call(DIRECTIONAL, name)) {
    key = (isRtl() ? DIRECTIONAL : LTR_DIRECTIONAL)[name];
  }
  const body = PATHS[key];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', o.weight || '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (o.size) { svg.setAttribute('width', o.size); svg.setAttribute('height', o.size); }
  if (o.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', o.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  /* The path data is a constant in this file — never user input — so building
   * it as markup is safe here and nowhere else. */
  svg.innerHTML = body || PATHS.info;
  if (o.fill) svg.setAttribute('fill', 'currentColor');
  return svg;
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(PATHS, name)
    || Object.prototype.hasOwnProperty.call(DIRECTIONAL, name);
}

export function iconNames() {
  return Object.keys(PATHS).concat(Object.keys(DIRECTIONAL));
}
