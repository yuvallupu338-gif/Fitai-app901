/*
 * events.js — the one-way channel between the simulation and everything that
 * merely watches it: HUD, subtitles, achievements, audio cues.
 *
 * The director never reaches into the HUD and the HUD never reaches into the
 * director. This is what lets an anomaly fire a `whisper` and have the
 * subtitle, the pan position and the "heard something" achievement all happen
 * without the anomaly knowing any of them exist.
 */

export class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    let list = this.handlers.get(type);
    if (!list) { list = new Set(); this.handlers.set(type, list); }
    list.add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => { off(); fn(payload); });
    return off;
  }

  off(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const list = this.handlers.get(type);
    if (list) {
      /* Copied because a handler is allowed to unsubscribe itself. */
      for (const fn of Array.from(list)) {
        try { fn(payload); } catch (err) { console.error(`[events] ${type}`, err); }
      }
    }
    const any = this.handlers.get('*');
    if (any) for (const fn of Array.from(any)) {
      try { fn(type, payload); } catch (err) { console.error('[events] *', err); }
    }
  }

  clear() { this.handlers.clear(); }
}

export const bus = new Emitter();
