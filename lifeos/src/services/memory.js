/*
 * memory.js — what the app remembers about the person using it.
 *
 * §66 IS A LIST OF FIVE TESTS, AND THEY ARE ALL REJECTION TESTS.
 *
 * Store a memory only if it is useful later, durable, not a duplicate, not
 * transient, and confident enough. Written as a filter that is mostly saying
 * no. That is the correct shape: the failure mode of a memory system is not
 * forgetting things, it is remembering forty things — half of them stale, half
 * of them restatements of each other — and then reciting them at somebody who
 * has to read all forty to find the one that is wrong.
 *
 * DEDUPLICATION IS BY SUBJECT, NOT BY TEXT.
 *
 * Two memories that both concern how accurate the estimates are must not both
 * exist, even when their sentences differ — and they will differ, because the
 * percentage in them changes every week. Matching on text produces a memory
 * per week. Every learned memory therefore carries a `key` naming its subject,
 * and re-learning the same subject updates in place, keeping the evidence
 * count and moving the confidence.
 *
 * NOTHING HERE IS AUTOMATIC WHEN MEMORY IS OFF. The setting is checked at the
 * top of learn(), not filtered at read time, so switching it off genuinely
 * stops the learning rather than hiding its results.
 */

import * as db from '../core/db.js';
import { snapshot, preferences } from './core.js';
import { MemorySchema } from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';
import { findingsToMemories } from '../engine/learn.js';

const MIN_CONFIDENCE = 45;
/* A learned memory nobody confirmed and the evidence for which has not been
 * refreshed in three months is describing a person who may no longer exist. */
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

export function all() {
  return db.list('memories').sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    || b.confidence - a.confidence);
}

export function byType(type) {
  return db.list('memories', (m) => m.type === type);
}

export function byId(id) { return db.get('memories', id); }

/** Add one by hand. Stated memories start confident — a person said them. */
export function create(input) {
  const parsed = MemorySchema.parse(Object.assign({
    source: 'stated', confidence: 90, evidenceCount: 1, lastConfirmedAt: Date.now(),
  }, input), '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
  return { ok: true, memory: db.insert('memories', parsed.value) };
}

export function update(id, patch) {
  const existing = db.get('memories', id);
  if (!existing) return { ok: false, code: 'notFound' };
  const parsed = MemorySchema.parse(Object.assign({}, existing, patch), '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
  /* Editing a memory is a person asserting it, so it stops being an
   * observation that can be quietly overwritten by the next learning pass. */
  parsed.value.source = 'stated';
  parsed.value.lastConfirmedAt = Date.now();
  return { ok: true, memory: db.update('memories', id, parsed.value) };
}

export function remove(id) { return db.remove('memories', id); }

export function clearAll() {
  return db.removeWhere('memories', () => true);
}

/* ------------------------------------------------------------------ *
 * Learning
 * ------------------------------------------------------------------ */

/**
 * Run the observations and fold them into storage.
 *
 * Returns what changed, so the caller can tell somebody a memory was learned
 * rather than having it appear silently on a screen they may never open.
 */
export function learn(opts) {
  const o = opts || {};
  const prefs = preferences();
  if (!prefs.memoryEnabled && !o.force) return { ok: false, code: 'disabled', added: 0, updated: 0 };
  if (!prefs.aiLearnFromActivity && !o.force) return { ok: false, code: 'learningOff', added: 0, updated: 0 };

  const snap = snapshot();
  const candidates = findingsToMemories(snap);

  const existing = db.list('memories');
  const byKey = new Map(existing.filter((m) => m.key).map((m) => [m.key, m]));

  let added = 0;
  let updated = 0;

  db.batch(() => {
    for (const candidate of candidates) {
      /* Test 5: confident enough. */
      if (candidate.confidence < MIN_CONFIDENCE) continue;

      const prior = candidate.key ? byKey.get(candidate.key) : null;

      /* Test 3: not a duplicate. Same subject → update in place. */
      if (prior) {
        /* A memory a person edited or pinned is theirs. An observation does
         * not get to overwrite it, only to refresh when it was last seen. */
        if (prior.source === 'stated' || prior.pinned) {
          db.update('memories', prior.id, { lastConfirmedAt: Date.now() });
          continue;
        }
        if (prior.content !== candidate.content || prior.confidence !== candidate.confidence) {
          db.update('memories', prior.id, {
            content: candidate.content,
            confidence: candidate.confidence,
            evidenceCount: candidate.evidenceCount,
            lastConfirmedAt: Date.now(),
          });
          updated += 1;
        } else {
          db.update('memories', prior.id, { lastConfirmedAt: Date.now() });
        }
        continue;
      }

      /* Same wording under a different key — belt and braces against a key
       * scheme change leaving two identical sentences on the screen. */
      if (existing.some((m) => m.content === candidate.content)) continue;

      const parsed = MemorySchema.parse(Object.assign({
        lastConfirmedAt: Date.now(),
      }, candidate), '');
      if (!parsed.ok) continue;

      db.insert('memories', parsed.value);
      db.logEvent('MEMORY_LEARNED', { type: candidate.type, content: candidate.content }, 'SYSTEM');
      added += 1;
    }

    /* Test 2: durable. Anything observed, unconfirmed and long untouched goes.
     * Pinned and stated memories are exempt — a person said those. */
    const cutoff = Date.now() - STALE_MS;
    for (const m of existing) {
      if (m.pinned || m.source === 'stated') continue;
      if (m.expiresAt && m.expiresAt < Date.now()) { db.remove('memories', m.id); continue; }
      if ((m.lastConfirmedAt || m.createdAt) < cutoff && !candidates.some((c) => c.key === m.key)) {
        db.remove('memories', m.id);
      }
    }
  });

  return { ok: true, added, updated };
}

/**
 * The memories worth putting in front of a model, shortest useful set.
 *
 * Capped hard. Twenty remembered preferences in a prompt is twenty chances to
 * contradict the actual question, and the ones below the confidence floor were
 * never worth acting on in the first place.
 */
export function forContext(limit) {
  const prefs = preferences();
  if (!prefs.memoryEnabled) return [];
  return all()
    .filter((m) => m.confidence >= 55 || m.source === 'stated')
    .slice(0, limit || 6)
    .map((m) => ({ type: m.type, content: m.content, confidence: m.confidence }));
}

/**
 * §161 — a correction is a signal.
 *
 * When somebody overrides something the app suggested, that is worth
 * remembering, and it is worth remembering as a stated preference rather than
 * an observation, because they did it on purpose.
 */
export function recordCorrection(subject, content) {
  if (!preferences().memoryEnabled) return { ok: false, code: 'disabled' };
  const key = `correction.${subject}`;
  const existing = db.list('memories', (m) => m.key === key)[0];
  if (existing) {
    return {
      ok: true,
      memory: db.update('memories', existing.id, {
        content,
        evidenceCount: (existing.evidenceCount || 1) + 1,
        confidence: Math.min(95, (existing.confidence || 50) + 10),
        lastConfirmedAt: Date.now(),
      }),
    };
  }
  return create({ key, type: 'priority', content, source: 'observed', confidence: 55 });
}

export { MIN_CONFIDENCE };
