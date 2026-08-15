/*
 * account.js — export, import, theme, and deleting everything.
 *
 * EXPORT IS THE PROMISE THAT MAKES LOCAL STORAGE ACCEPTABLE.
 *
 * This app keeps a person's goals, their plans and their notes in a browser
 * profile — a place that a cleared cache, a reinstalled operating system or a
 * new laptop will take away without asking. That is a defensible design only
 * if getting everything out is one click and produces a file that is
 * genuinely everything.
 *
 * So the JSON export is the raw account blob, not a curated summary, and the
 * import puts it back. What it deliberately does NOT carry is the API key,
 * which lives at device scope precisely so that a file somebody emails to
 * themselves cannot contain their billing credentials.
 */

import * as db from '../core/db.js';
import * as store from '../core/store.js';
import { snapshot, invalidate, profile, updateProfile } from './core.js';
import { currentUser, deleteCurrentAccount } from '../core/session.js';
import { emit, EV } from '../core/bus.js';
import { formatDate, today as todayIso } from '../core/time.js';

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

/**
 * Apply a theme choice to the document.
 *
 * 'system' removes the attribute entirely rather than stamping a resolved
 * value, so the page keeps following the OS when it changes at sunset. Writing
 * the resolved value would freeze it at whatever it was when the app loaded.
 */
export function applyTheme(theme) {
  const value = theme || 'system';
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
  store.writeDevice({ theme: value });
  emit(EV.THEME_CHANGED, value);
  return value;
}

/** The theme to use at boot: the account's choice, or the device's. */
export function currentTheme() {
  const device = store.readDevice();
  if (device.theme) return device.theme;
  try {
    return profile().preferredTheme || 'system';
  } catch (e) {
    /* Called before sign-in, where there is no profile to read. */
    return 'system';
  }
}

export function setTheme(theme) {
  applyTheme(theme);
  try { updateProfile({ preferredTheme: theme }); } catch (e) { /* not signed in yet */ }
  return theme;
}

export function resolvedTheme() {
  const choice = currentTheme();
  if (choice !== 'system') return choice;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

export function exportJson() {
  const user = currentUser();
  const payload = db.exportAll();
  return {
    filename: `lifeos-${todayIso()}.json`,
    mime: 'application/json',
    text: JSON.stringify(Object.assign({
      app: 'LifeOS',
      schemaVersion: payload.version,
      account: user ? { displayName: user.displayName, email: user.email } : null,
    }, payload), null, 2),
  };
}

/*
 * CSV is written by hand rather than through a helper, because the only
 * interesting part is the quoting and a helper would hide it. A task title in
 * Hebrew containing a comma — which is most of them, eventually — has to come
 * back as one field, and a title containing a quotation mark has to survive
 * the round trip. RFC 4180: wrap in quotes, double any internal quote.
 *
 * The BOM at the front is there for one reason: Excel on Windows opens a
 * UTF-8 CSV as Windows-1255 without it, and every Hebrew character becomes
 * mojibake. It is invisible everywhere else.
 */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(rows) {
  return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function exportCsv() {
  const snap = snapshot();

  const header = [
    'סוג', 'כותרת', 'סטטוס', 'תחום', 'מטרה', 'פרויקט',
    'תאריך יעד', 'מתוכנן ל', 'הערכה (דק׳)', 'בפועל (דק׳)', 'הושלם',
  ];

  const rows = [header];

  for (const t of snap.tasks) {
    rows.push([
      'משימה',
      t.title,
      t.status,
      t.areaId && snap.areasById.get(t.areaId) ? snap.areasById.get(t.areaId).title : '',
      t.goalId && snap.goalsById.get(t.goalId) ? snap.goalsById.get(t.goalId).title : '',
      t.projectId && snap.projectsById.get(t.projectId) ? snap.projectsById.get(t.projectId).title : '',
      t.dueDate || '',
      t.scheduledDate || '',
      t.estimatedMinutes || 0,
      t.actualMinutes || 0,
      t.completedAt ? formatDate(new Date(t.completedAt).toISOString().slice(0, 10), { numeric: true }) : '',
    ]);
  }

  for (const p of snap.projects) {
    rows.push([
      'פרויקט', p.title, p.status,
      p.areaId && snap.areasById.get(p.areaId) ? snap.areasById.get(p.areaId).title : '',
      p.goalId && snap.goalsById.get(p.goalId) ? snap.goalsById.get(p.goalId).title : '',
      '', p.dueDate || '', '', p.estimatedMinutes || 0, '',
      p.completedAt ? formatDate(new Date(p.completedAt).toISOString().slice(0, 10), { numeric: true }) : '',
    ]);
  }

  for (const g of snap.goals) {
    rows.push([
      'מטרה', g.title, g.status,
      g.areaId && snap.areasById.get(g.areaId) ? snap.areasById.get(g.areaId).title : '',
      '', '', g.targetDate || '', '', '', '',
      g.completedAt ? formatDate(new Date(g.completedAt).toISOString().slice(0, 10), { numeric: true }) : '',
    ]);
  }

  for (const s of snap.focusSessions) {
    if (!s.endedAt) continue;
    rows.push(['סשן מיקוד', s.title || '', s.outcome, '', '', '', '', s.date || '', s.plannedMinutes, s.actualMinutes, '']);
  }

  return {
    filename: `lifeos-${todayIso()}.csv`,
    mime: 'text/csv;charset=utf-8',
    text: csvRows(rows),
  };
}

/**
 * Hand a generated file to the person.
 *
 * A blob URL and a synthetic click, revoked on the next tick — the only way to
 * produce a file from a page with no server behind it. The revoke is deferred
 * rather than immediate because Safari reads the URL asynchronously and a
 * synchronous revoke cancels the download it just started.
 */
export function downloadFile(file) {
  const blob = new Blob([file.text], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

/**
 * Replace this account's data with the contents of an export.
 *
 * Every record is re-stamped with the current account's id by db.importAll —
 * an export from another profile on the same device carries that profile's
 * ids, and writing them unchanged would produce data that exists, occupies
 * quota, and is invisible to the person who imported it.
 */
export function importJson(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'parse' };
  }

  if (!payload || typeof payload !== 'object' || !payload.collections) {
    return { ok: false, code: 'shape' };
  }

  db.importAll(payload);
  invalidate();
  return { ok: true };
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsText(file);
  });
}

/* ------------------------------------------------------------------ *
 * Destruction
 * ------------------------------------------------------------------ */

export function deleteAccount() {
  deleteCurrentAccount();
  db.unload();
  invalidate();
  return true;
}

export function storageInfo() {
  return {
    bytes: store.approximateBytes(),
    label: store.formatBytes(store.approximateBytes()),
    persists: store.persists(),
  };
}
