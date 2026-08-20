/*
 * events.js — the one channel from the simulation to whatever is drawing it.
 *
 * The simulation never touches the DOM and never knows which front-end is
 * attached. It appends plain objects to a queue; the view drains the queue
 * each frame (or each turn, in text mode) and decides what to do with them.
 * That is the whole reason the same core can run under an SVG floor plan, a
 * Hebrew command prompt, and a headless test that draws nothing at all.
 *
 * An event is `{ kind, ...payload }`. `kind` matches a key in strings.js EVENTS.
 */

export function emit(state, kind, payload) {
  const ev = payload ? Object.assign({ kind }, payload) : { kind };
  ev.at = state.clock;
  state.events.push(ev);
  return ev;
}

/* Take everything queued and leave the queue empty. Callers must not hold on
 * to the array — it is theirs now, and the next emit starts a fresh one. */
export function drain(state) {
  const out = state.events;
  state.events = [];
  return out;
}

/* A tiny emitter for the view layer's own use — screen changes, audio cues.
 * The simulation does not use this; it has the queue above. */
export function makeBus() {
  const map = new Map();
  return {
    on(kind, fn) {
      if (!map.has(kind)) map.set(kind, new Set());
      map.get(kind).add(fn);
      return () => map.get(kind).delete(fn);
    },
    fire(kind, payload) {
      const set = map.get(kind);
      if (!set) return;
      for (const fn of set) fn(payload);
    },
  };
}
