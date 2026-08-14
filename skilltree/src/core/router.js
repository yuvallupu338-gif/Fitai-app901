/*
 * router.js — hash routing.
 *
 * Hash rather than the History API, deliberately: this app is served from a
 * GitHub Pages subpath and also runs from a single file on disk, and in both
 * cases a pushState deep link 404s or fails outright. The hash always works,
 * including from file://, which is the trade the routing lesson in the web
 * tree describes from the other side.
 *
 * Routes are '#/tree/web' style. Params come back as an array of segments,
 * which is enough for a five-screen app and avoids a pattern matcher nobody
 * needs.
 */

const routes = new Map();
let fallback = null;
let current = null;
const afterNavigate = new Set();

export function route(name, handler) {
  routes.set(name, handler);
}

export function notFound(handler) {
  fallback = handler;
}

export function onNavigate(fn) {
  afterNavigate.add(fn);
  return () => afterNavigate.delete(fn);
}

export function parse(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { name: segments[0] || 'dashboard', params: segments.slice(1), query };
}

export function go(path, opts = {}) {
  const target = path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
  if (window.location.hash === target) {
    /* Same route — re-render rather than doing nothing, so "go home" from the
     * home screen still refreshes stale data. */
    resolve();
    return;
  }
  if (opts.replace) window.location.replace(target);
  else window.location.hash = target;
}

export function currentRoute() {
  return current;
}

export function resolve() {
  const parsed = parse();
  current = parsed;
  const handler = routes.get(parsed.name) || fallback;
  if (handler) handler(parsed);
  for (const fn of afterNavigate) {
    try { fn(parsed); } catch (err) { console.error('navigate listener failed', err); }
  }
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
