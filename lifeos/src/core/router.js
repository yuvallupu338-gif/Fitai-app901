/*
 * router.js — hash routing.
 *
 * The hash rather than the History API because this ships as a static site on
 * a project subpath and, in the single-file build, off a disk. pushState needs
 * a server that rewrites unknown paths to index.html; there is no server. The
 * hash always works, including from file://.
 *
 * Routes are '/tasks' or '/projects/:id'. Query is not used for navigation —
 * a screen's filter state lives in the screen, because a reload landing on the
 * same filter is not worth a URL that has to be parsed in two places.
 */

import { emit, EV } from './bus.js';

const routes = [];
let notFound = null;
let current = null;
let started = false;

/** define('/projects/:id', render) */
export function define(pattern, handler) {
  const names = [];
  const source = pattern
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:(\w+)/g, (whole, name) => { names.push(name); return '/([^/]+)'; });
  routes.push({ pattern, regex: new RegExp(`^${source}$`), names, handler });
}

export function defineNotFound(handler) {
  notFound = handler;
}

function parseHash() {
  const raw = (typeof window !== 'undefined' ? window.location.hash : '') || '';
  const path = raw.replace(/^#/, '');
  if (!path || path === '/') return '/today';
  return path.startsWith('/') ? path : `/${path}`;
}

function match(path) {
  for (const route of routes) {
    const m = route.regex.exec(path);
    if (!m) continue;
    const params = {};
    route.names.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
    return { route, params };
  }
  return null;
}

function resolve() {
  const path = parseHash();
  const found = match(path);
  current = { path, params: found ? found.params : {}, pattern: found ? found.route.pattern : null };
  emit(EV.ROUTE_CHANGED, current);
  if (found) found.route.handler(current.params, current);
  else if (notFound) notFound(current);
}

export function start() {
  if (started) return;
  started = true;
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function stop() {
  if (!started) return;
  started = false;
  window.removeEventListener('hashchange', resolve);
}

/** Navigate. Setting the same hash does not fire hashchange, so re-resolve. */
export function go(path) {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (parseHash() === target) { resolve(); return; }
  window.location.hash = `#${target}`;
}

/** Navigate without adding a history entry — used when a screen redirects. */
export function replace(path) {
  const target = path.startsWith('/') ? path : `/${path}`;
  const url = `${window.location.pathname}${window.location.search}#${target}`;
  window.history.replaceState(null, '', url);
  resolve();
}

export function currentRoute() {
  return current || { path: parseHash(), params: {}, pattern: null };
}

/** An href for a link. Anchors get real hrefs so middle-click and copy work. */
export function href(path) {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function isActive(prefix) {
  const path = currentRoute().path;
  return path === prefix || path.startsWith(`${prefix}/`);
}
