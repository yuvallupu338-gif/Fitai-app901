/*
 * bus.js — a fifteen-line event emitter.
 *
 * The UI needs to know when data changed without every screen holding a
 * reference to every other. Services publish; screens subscribe and re-render
 * their own subtree. That is the entire state management story in this app,
 * and for an app that renders from a single in-memory blob it is enough.
 */

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const set = listeners.get(event);
  if (set) set.delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) {
    /* Copied before iterating: a handler that unsubscribes itself — which the
     * screens do on teardown — would otherwise mutate the set mid-loop. */
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (e) {
        /* One broken subscriber must not stop the others from hearing about a
         * completed task. */
        if (typeof console !== 'undefined') console.error('bus handler failed', event, e);
      }
    }
  }
  const all = listeners.get('*');
  if (all) for (const fn of Array.from(all)) { try { fn(event, payload); } catch (e) { /* as above */ } }
}

export function clearAll() {
  listeners.clear();
}

/* The events this app publishes. Listed so a typo is a lookup failure in one
 * place rather than a subscription that silently never fires. */
export const EV = {
  DATA_CHANGED: 'data:changed',
  SESSION_CHANGED: 'session:changed',
  ROUTE_CHANGED: 'route:changed',
  THEME_CHANGED: 'theme:changed',
  FOCUS_TICK: 'focus:tick',
  FOCUS_ENDED: 'focus:ended',
  STORAGE_FAILED: 'storage:failed',
};
