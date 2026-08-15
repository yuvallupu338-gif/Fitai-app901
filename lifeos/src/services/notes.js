/*
 * notes.js — notes, and the search that runs across everything.
 *
 * NOTES ARE DELIBERATELY SMALL.
 *
 * §54 says it outright: do not try to be Notion. No blocks, no nesting, no
 * backlinks, no rich text. A title, a body, a type, and links to the things it
 * is about. The reason is not effort — it is that a knowledge base inside a
 * planner becomes the place work goes to be organised instead of done, and the
 * app already has a structure for work.
 *
 * What notes do get is the link, because a meeting summary that is not
 * attached to the project it was about is a file nobody opens again.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { NoteSchema } from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';

export function all() {
  return db.list('notes').sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
}

export function byId(id) { return db.get('notes', id); }

export function forProject(projectId) { return db.list('notes', (n) => n.projectId === projectId); }
export function forGoal(goalId) { return db.list('notes', (n) => n.goalId === goalId); }
export function forTask(taskId) { return db.list('notes', (n) => n.taskId === taskId); }

export function create(input) {
  const parsed = NoteSchema.parse(input, '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
  if (!parsed.value.title && !parsed.value.body) return { ok: false, code: 'empty' };

  /* A note with a body and no title gets one from its first line, so the list
   * is readable without forcing a title field nobody wants to fill in. */
  if (!parsed.value.title) {
    parsed.value.title = parsed.value.body.split('\n')[0].slice(0, 60).trim();
  }

  const note = db.batch(() => {
    const created = db.insert('notes', parsed.value);
    db.logEvent('NOTE_CREATED', { noteId: created.id, title: created.title });
    return created;
  });
  return { ok: true, note };
}

export function update(id, patch) {
  const existing = db.get('notes', id);
  if (!existing) return { ok: false, code: 'notFound' };
  const parsed = NoteSchema.parse(Object.assign({}, existing, patch), '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
  if (!parsed.value.title && parsed.value.body) {
    parsed.value.title = parsed.value.body.split('\n')[0].slice(0, 60).trim();
  }
  return { ok: true, note: db.update('notes', id, parsed.value) };
}

export function remove(id) { return db.remove('notes', id); }

/* ------------------------------------------------------------------ *
 * Global search
 * ------------------------------------------------------------------ */

/**
 * Search every kind of record at once.
 *
 * Substring rather than fuzzy. Hebrew has no case to fold and a great deal of
 * prefix morphology, so a person searching "אתר" wants "לאתר" and "האתר" —
 * which plain substring matching gives for free, and which most fuzzy
 * implementations get wrong by scoring transpositions that Hebrew does not
 * produce.
 *
 * Results are typed, so the command palette can group them.
 */
export function search(query, opts) {
  const o = opts || {};
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 1) return [];

  const snap = snapshot();
  const results = [];
  const limit = o.limit || 40;

  function match(text) {
    return text && String(text).toLowerCase().includes(q);
  }

  /* Ordered by how likely each kind is to be what somebody is looking for when
   * they type into a search box. Tasks first: there are more of them, they
   * change most often, and they are what people search for. */
  for (const t of snap.tasks) {
    if (t.status === 'cancelled') continue;
    if (match(t.title) || match(t.description)) {
      results.push({
        kind: 'task', id: t.id, title: t.title, record: t,
        subtitle: t.projectId && snap.projectsById.get(t.projectId)
          ? snap.projectsById.get(t.projectId).title : null,
        done: t.status === 'done',
      });
    }
  }

  for (const p of snap.projects) {
    if (match(p.title) || match(p.description)) {
      results.push({
        kind: 'project', id: p.id, title: p.title, record: p,
        subtitle: p.goalId && snap.goalsById.get(p.goalId) ? snap.goalsById.get(p.goalId).title : null,
      });
    }
  }

  for (const g of snap.goals) {
    if (match(g.title) || match(g.description) || match(g.successDefinition) || match(g.motivation)) {
      results.push({ kind: 'goal', id: g.id, title: g.title, record: g });
    }
  }

  for (const n of snap.notes) {
    if (match(n.title) || match(n.body)) {
      results.push({ kind: 'note', id: n.id, title: n.title || n.body.slice(0, 40), record: n });
    }
  }

  for (const hb of snap.habits) {
    if (match(hb.title)) results.push({ kind: 'habit', id: hb.id, title: hb.title, record: hb });
  }

  for (const a of snap.areas) {
    if (match(a.title)) results.push({ kind: 'area', id: a.id, title: a.title, record: a });
  }

  for (const e of snap.events) {
    if (match(e.title)) {
      results.push({ kind: 'event', id: e.id, title: e.title, record: e, subtitle: e.date });
    }
  }

  for (const r of snap.routines) {
    if (match(r.title)) results.push({ kind: 'routine', id: r.id, title: r.title, record: r });
  }

  /* A title match beats a body match, and an exact prefix beats both. */
  results.sort((a, b) => {
    const aStarts = String(a.title).toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = String(b.title).toLowerCase().startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    const aDone = a.done ? 1 : 0;
    const bDone = b.done ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return String(a.title).length - String(b.title).length;
  });

  return results.slice(0, limit);
}

/** Group search results by kind, for the palette. */
export function grouped(query, opts) {
  const groups = new Map();
  for (const r of search(query, opts)) {
    if (!groups.has(r.kind)) groups.set(r.kind, []);
    groups.get(r.kind).push(r);
  }
  return groups;
}
