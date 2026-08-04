/*
 * guide.js — the "why this plan looks like this" view: weekly volume, the
 * progression model, the phase map and the real targets. Same sections the
 * reference document carried, generated from the profile instead of hardcoded.
 */

import { h } from '../core/dom.js';
import { buildPhases, progressionModel, projectTargets } from '../engine/progression.js';
import { assessGoal } from '../engine/targets.js';
import * as store from '../core/store.js';

const GROUP_HE = {
  push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', core: 'ליבה',
  arms: 'ידיים', shoulders: 'כתפיים', calves: 'שוקיים', conditioning: 'אירובי',
};

export function renderGuide(root, program, profile) {
  const view = h('section');

  /* ---- goal reality check ---- */
  const goal = safe(() => assessGoal(profile), null);
  if (goal) {
    view.appendChild(h('h3', 'היעד שלך'));
    view.appendChild(h('div.warnbox' + (goal.realistic ? '' : '.hot'), { style: { marginTop: '10px' } },
      h('h4', goal.realistic ? 'היעד ריאלי' : 'היעד שאפתני מדי לזמן הזה'),
      h('p', { style: { color: 'var(--dim)', fontSize: '13.5px' } }, goal.verdict),
      h('div.facts', { style: { marginTop: '12px' } },
        h('span.fact', 'שבועות ', h('b', String(goal.weeks))),
        Number.isFinite(goal.kgDelta) && goal.kgDelta !== 0
          ? h('span.fact', 'שינוי ', h('b', `${goal.kgDelta > 0 ? '+' : ''}${round1(goal.kgDelta)} ק״ג`)) : null,
        Number.isFinite(goal.ratePerWeekKg) && goal.ratePerWeekKg !== 0
          ? h('span.fact', 'קצב ', h('b', `${round2(goal.ratePerWeekKg)} ק״ג/שבוע`)) : null,
        goal.suggestedTargetKg ? h('span.fact', 'ריאלי יותר ', h('b', `${round1(goal.suggestedTargetKg)} ק״ג`)) : null,
      ),
    ));

    if (goal.milestones && goal.milestones.length) {
      view.appendChild(h('div.table-scroll', { style: { marginTop: '14px' } }, h('table',
        h('thead', h('tr', h('th', 'תאריך'), h('th', 'אבן דרך'), h('th', 'משקל'))),
        h('tbody', goal.milestones.map((m) => h('tr',
          h('td', { class: 'n' }, formatDate(m.date)),
          h('td', { style: { fontWeight: '400', color: 'var(--dim)' } }, m.label),
          h('td', { class: 'n' }, m.weightKg ? `${round1(m.weightKg)} ק״ג` : '—')))))));
    }
  }

  /* ---- weekly volume ---- */
  if (program.volume) {
    view.appendChild(h('div.rule'));
    view.appendChild(h('h3', 'נפח שבועי'));
    view.appendChild(h('p.lead', program.volume.note
      || 'הטווח שנותן את מרבית התועלת הוא 10–20 סטים אפקטיביים לקבוצת שריר בשבוע. מעבר לזה התועלת שטוחה וההתאוששות נפגעת.'));

    const rows = Object.keys(GROUP_HE)
      .filter((k) => typeof program.volume[k] === 'number' && program.volume[k] > 0)
      .map((k) => h('tr',
        h('td', GROUP_HE[k]),
        h('td', { class: 'n' }, String(program.volume[k])),
        h('td', { style: { color: 'var(--dim)' } }, sourcesFor(program, k))));

    view.appendChild(h('div.table-scroll', h('table',
      h('thead', h('tr', h('th', 'קבוצה'), h('th', 'סטים בשבוע'), h('th', 'מאיפה'))),
      h('tbody', rows))));

    const total = program.volume.total
      || program.days.reduce((n, d) => n + d.slots.length, 0);
    view.appendChild(h('p.lead', { style: { marginTop: '12px' } },
      `סה״כ ${total} סטים בשבוע על פני ${program.days.length} אימונים. אימון נכנס ב־${program.meta.minutesPerSession} דקות כולל חימום. אם אתה מסיים הרבה מעבר לזה, הבעיה היא בזמני המנוחה — לא בכמות הסטים.`));
  }

  /* ---- progression ---- */
  const model = safe(() => progressionModel(profile), null);
  if (model) {
    view.appendChild(h('div.rule'));
    view.appendChild(h('h3', 'איך מתקדמים'));
    view.appendChild(h('p.lead', model.rule));
    if (model.chain && model.chain.length) {
      const chain = h('div.chain');
      model.chain.forEach((c, i) => {
        if (i) chain.appendChild(h('s', '←'));
        chain.appendChild(h('i', c));
      });
      view.appendChild(chain);
    }
    if (model.cards && model.cards.length) {
      view.appendChild(h('div.cards', { style: { marginTop: '10px' } },
        model.cards.map((c) => h('div.card',
          c.k ? h('span.k', c.k) : null, h('h4', c.title), h('p', c.body)))));
    }
  }

  /* ---- phases ---- */
  const phases = safe(() => buildPhases(profile), []);
  if (phases && phases.length) {
    const week = store.currentWeek();
    view.appendChild(h('div.rule'));
    view.appendChild(h('h3', 'מפת התוכנית'));
    view.appendChild(h('div', phases.map((ph) => {
      const now = week >= ph.weeks[0] && week <= ph.weeks[1];
      return h('div.phase' + (now ? '.now' : ''),
        h('span.w', `שבוע ${ph.weeks[0]}–${ph.weeks[1]}`),
        h('span.t', h('b', ph.title), h('span', ph.desc)));
    })));
  }

  /* ---- targets ---- */
  const targets = safe(() => projectTargets(profile), []);
  if (targets && targets.length) {
    view.appendChild(h('div.rule'));
    view.appendChild(h('h3', 'היעדים האמיתיים'));
    view.appendChild(h('p.lead', 'לא המספר על המאזניים. אלה המספרים שמעידים שההתקדמות אמיתית.'));
    view.appendChild(h('div.table-scroll', h('table',
      h('thead', h('tr', h('th', 'תרגיל'), h('th', 'היום'), h('th', 'ביעד'))),
      h('tbody', targets.map((t) => h('tr',
        h('td', t.label),
        h('td', { class: 'n' }, String(t.today)),
        h('td', { class: 'n' }, String(t.target))))))));
  }

  root.appendChild(view);
  return { redraw: () => {} };
}

function sourcesFor(program, group) {
  const names = new Set();
  for (const day of program.days) {
    for (const slot of day.slots) {
      const v = slot.variants[0];
      if (!v) continue;
      if (groupOf(v) === group) names.add(v.name.split(' ').slice(0, 2).join(' '));
    }
  }
  return Array.from(names).slice(0, 4).join(', ') || '—';
}

function groupOf(v) {
  const m = v.muscles || [];
  if (m.some((x) => ['chest', 'triceps', 'shoulders'].includes(x))) return 'push';
  if (m.some((x) => ['lats', 'back', 'biceps', 'traps', 'rear_delts'].includes(x))) return 'pull';
  if (m.some((x) => ['quads', 'hamstrings', 'glutes', 'adductors'].includes(x))) return 'legs';
  if (m.includes('calves')) return 'calves';
  if (m.some((x) => ['core', 'obliques'].includes(x))) return 'core';
  return 'conditioning';
}

function safe(fn, fallback) {
  try { return fn(); } catch (e) { console.error(e); return fallback; }
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

function formatDate(d) {
  if (!d) return '—';
  const parts = String(d).split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : d;
}
