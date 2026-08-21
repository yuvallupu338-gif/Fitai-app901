/*
 * migrate.js — what to do with whatever was on the device last time.
 *
 * Every path into the app goes through here: a document written by this build,
 * one written by a build from three months ago, one written by a build from
 * next month because the user has two browsers and only updated one, a value
 * some other script left under the key, and nothing at all. It returns a Root
 * for all of them and it never throws. A migration that can throw turns a
 * routine deploy into a white screen for the people who already had data,
 * which is precisely the group that has the most to lose.
 */

import { emptyRoot, normalizeRoot } from './schema.js';

/*
 * The version number lives in schema.js, inside emptyRoot, because that is
 * where the shape it describes lives and a bump is a change to that shape.
 * Reading it back off a fresh document keeps one definition of it: this file
 * cannot end up comparing stored data against a number schema.js has moved on
 * from.
 */
export const SCHEMA_VERSION = emptyRoot('').schemaVersion;

/*
 * A TomorrowAI document carries at least one of these. A value with none of
 * them is somebody else's — another app on the same origin, a file picked by
 * mistake in the import dialog, a leftover from an experiment — and merging it
 * would produce a plausible-looking half-document rather than an obvious
 * failure. FitAI's importJson learned that from `{"hello":"world"}` merging
 * cleanly and erasing a year of training.
 */
const MARKERS = ['schemaVersion', 'user', 'profile', 'items', 'days', 'records', 'learning'];

/*
 * The upgrade ladder. Each entry is keyed by the version it produces and takes
 * the document one step: `2: (doc) => ({ ...doc, schemaVersion: 2 })` and so
 * on. migrate() runs every step between the stored version and
 * SCHEMA_VERSION, so adding version 2 means bumping the number in
 * emptyRoot(), writing one function here, and changing nothing else in this
 * file.
 *
 * A step works on the raw document and does not have to be careful: whatever
 * it returns goes through normalizeRoot afterwards, which fills what the step
 * left out and drops what it got wrong. It should concentrate on the one thing
 * only it knows — where the old field was and what the new one means — and
 * leave the shape to the schema.
 */
const UPGRADES = {
  // 2: (doc) => { ... },
};

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeDocument(doc) {
  for (const marker of MARKERS) {
    if (Object.prototype.hasOwnProperty.call(doc, marker)) return true;
  }
  return false;
}

/*
 * `nowIso` is optional so that migrate(raw) — the call §4.3 specifies and the
 * one store.js makes — keeps working, and passing it makes the whole storage
 * layer deterministic for tools/tomorrow-validate.mjs. This clock read is the
 * only one in src/storage, and it is here rather than in schema.js because a
 * document being created right now has no other source for its own creation
 * time: there is nothing in the input to read it from.
 */
export function migrate(raw, nowIso) {
  const now = typeof nowIso === 'string' && nowIso ? nowIso : new Date().toISOString();
  try {
    let doc = raw;
    // The adapter parses JSON, but importJson and a hand-rolled restore both
    // arrive here with text.
    if (typeof doc === 'string') {
      try {
        doc = JSON.parse(doc);
      } catch (e) {
        return emptyRoot(now);
      }
    }
    if (!isObject(doc) || !looksLikeDocument(doc)) return emptyRoot(now);

    const stored = Number(doc.schemaVersion);
    // No version at all means a document written before versioning, which for
    // version 1 means one written by this build with the field lost. Treat it
    // as current and let normalizeRoot judge the contents.
    const version = Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : SCHEMA_VERSION;

    /*
     * From the future: a newer build wrote this and we have no idea what its
     * fields mean. Guessing would be worse than starting over, because a
     * half-understood document produces numbers that look real.
     *
     * Starting over here is not the same as deleting anything — the stored
     * text is untouched until store.js writes over it, so the browser that is
     * up to date still opens the same document intact.
     */
    if (version > SCHEMA_VERSION) return emptyRoot(now);

    let upgraded = doc;
    let at = version;
    while (at < SCHEMA_VERSION) {
      const step = UPGRADES[at + 1];
      // A gap in the ladder should be impossible, but salvaging what
      // normalizeRoot recognises beats discarding a real document over a
      // missing function.
      if (!step) break;
      upgraded = step(upgraded);
      at += 1;
    }

    return normalizeRoot(upgraded, now);
  } catch (e) {
    /*
     * Nothing above is meant to throw — normalizeRoot is total and the steps
     * are ours. This catches the case where that stops being true, because the
     * cost of being wrong is the app not opening at all, and a user with a
     * fresh document can at least use it while the bug gets fixed.
     */
    return emptyRoot(now);
  }
}
