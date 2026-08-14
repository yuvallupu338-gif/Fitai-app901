/*
 * dashboard.js — the home screen (§6), and the intelligence behind it (§67).
 *
 * The brief's requirement here is that the dashboard is not the same every
 * day, and that is the whole design. What leads the screen is chosen from
 * state:
 *
 *   nothing started      → what this app is, and one place to begin
 *   away for a week+     → welcome back, and the skill that slipped furthest
 *   mid-skill            → continue, with the specific next activity named
 *   nothing in flight    → the strongest recommendation, with its reason
 *
 * That means one component decides the lead and the rest of the page is
 * supporting detail — rather than eight equal cards where the learner has to
 * work out what to do. A dashboard that never changes is a dashboard people
 * stop reading.
 */

import { h, clear, num, ago } from '../core/dom.js';
import { icon } from './icons.js';
import * as session from '../core/session.js';
import { go } from '../core/router.js';
import { openSkill } from './skillpanel.js';
import { persists } from '../core/store.js';

export function renderDashboard(host) {
  const overview = session.overview();
  if (!overview) return;

  const { profile } = overview;
  const focus = session.currentFocus(3);
  const recs = session.recommendations(3);
  const { missions, completed } = session.missions();
  const reviews = session.reviews();

  const page = h('div.wrap.stack.loose');

  /* ---- greeting ---- */
  page.appendChild(h('div.page-head',
    h('div',
      h('h1', `${greeting()}${profile.name ? `, ${profile.name}` : ''}`),
      h('p', subtitle(overview, focus, missions, completed))),
    h('div.row', { style: { gap: 'var(--s5)' } },
      h('div.stat',
        h('span.k', 'Level'),
        h('span.v', String(overview.level))),
      overview.streak.current > 0
        ? h('div.stat',
          h('span.k', 'Streak'),
          h('span.v', String(overview.streak.current), h('small', ` day${overview.streak.current === 1 ? '' : 's'}`)))
        : null)));

  /* Storage failure has to be said before someone invests an hour. */
  if (!persists()) {
    page.appendChild(h('div.notice.warn',
      icon('alert', { size: 16 }),
      h('span', 'This browser is not saving data — private mode or a full quota. Your progress will be lost when you close the tab.')));
  }

  /* ---- global XP bar ---- */
  page.appendChild(h('div.card',
    h('div.row.between', { style: { marginBottom: 'var(--s2)' } },
      h('span.card-title', `Level ${overview.level}`),
      h('span.card-note.num', `${num(overview.intoLevel)} / ${num(overview.levelSpan)} XP`)),
    h('div.bar.tall', h('i', { style: { width: `${Math.round(overview.fraction * 100)}%` } })),
    h('div.card-note', { style: { marginTop: 'var(--s2)' } },
      `${num(overview.toNextLevel)} XP to level ${overview.level + 1}`)));

  /* ---- the lead ---- */
  page.appendChild(leadCard(overview, focus, recs, reviews));

  /* ---- missions ---- */
  if (missions.length) {
    const doneSet = new Set(completed);
    page.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', 'Today'),
        h('span.card-note', `${doneSet.size} of ${missions.length} done`)),
      h('div.list', ...missions.map((m) => h('button.list-item', {
        onclick: () => (m.activityId ? go(`activity/${m.activityId}`) : openSkill(m.skillId, { onChange: () => renderDashboard(host) })),
      },
      h('span.dot', { class: doneSet.has(m.id) ? 'on' : '' }),
      h('div.grow',
        h('div.title', {
          style: doneSet.has(m.id)
            ? { textDecoration: 'line-through', color: 'var(--bone-dimmer)' }
            : {},
        }, m.title),
        h('div.sub', m.detail)),
      doneSet.has(m.id) ? h('span.chip.on', 'Done') : h('span.chip', `+${m.xp} XP`))))));
  }

  /* ---- current focus ---- */
  if (focus.length) {
    page.appendChild(h('div.card',
      h('div.card-head', h('span.card-title', 'In progress')),
      h('div.list', ...focus.map((f) => {
        const pct = Math.round((f.masteryScore || 0));
        return h('button.list-item', {
          onclick: () => openSkill(f.skillId, { onChange: () => renderDashboard(host) }),
        },
        h('div.grow',
          h('div.title', f.skill.name),
          /* "set at setup" for a skill whose only attempts came from the
           * onboarding seed — it has standing, but nobody practised it. */
          h('div.sub', `${f.tree.name} · ${f.neverPractised ? 'set at setup' : `last practised ${ago(f.lastPracticedAt)}`}`)),
        h('div', { style: { width: '84px' } },
          h('div.bar', h('i', { style: { width: `${pct}%` } }))),
        h('span.lvl', `Lv.${f.level}`));
      }))));
  }

  /* ---- the goal, if one is set ---- */
  if (profile.plan?.goalText) {
    /* One programme, shared with the plan, tree and profile screens — see
     * session.programme. Four screens computing it independently is how two of
     * them ended up reporting different progress toward the same goal. */
    const programme = session.programme();

    if (programme) {
      const pct = programme.totalSteps
        ? Math.round((programme.doneSteps / programme.totalSteps) * 100) : 0;
      page.appendChild(h('button.card', {
        style: { width: '100%', textAlign: 'left', cursor: 'pointer' },
        onclick: () => go('plan'),
      },
      h('div.card-head',
        h('span.card-title', 'Goal'),
        h('span.card-note.num', `${programme.doneSteps} / ${programme.totalSteps} skills`)),
      h('div', { style: { fontSize: '15px', fontWeight: '560', marginBottom: 'var(--s2)' } },
        profile.plan.goalText),
      h('div.bar.tall', h('i', { style: { width: `${pct}%` } })),
      h('div.card-note', { style: { marginTop: 'var(--s2)' } },
        `${num(programme.remainingHours)} hours left at ${programme.perWeek} h/week`)));
    }
  }

  /* ---- two columns: recommendation + review ---- */
  const columns = h('div.grid.cols-2');

  if (recs.length) {
    columns.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', 'Suggested next'),
        h('span.card-note', 'Based on your goal and progress')),
      h('div.list', ...recs.map((rec) => h('button.list-item', {
        onclick: () => openSkill(rec.skillId, { onChange: () => renderDashboard(host) }),
      },
      h('div.grow',
        h('div.title', rec.skill.name),
        /* The reasons come from the scoring function itself, so what the
         * learner is told cannot drift from why it was chosen. */
        h('div.sub', rec.reasons.join(' · ') || rec.tree?.name || '')),
      icon('chevron', { size: 15 }))))));
  }

  if (reviews.length) {
    columns.appendChild(h('div.card',
      h('div.card-head',
        h('span.card-title', 'Worth reviewing'),
        h('span.card-note', 'Confidence has slipped')),
      h('div.list', ...reviews.slice(0, 4).map((r) => h('button.list-item', {
        onclick: () => openSkill(r.skillId, { onChange: () => renderDashboard(host) }),
      },
      h('div.grow',
        h('div.title', r.skill.name),
        h('div.sub', r.neverPractised ? 'Set at setup, not yet practised' : `Last practised ${ago(r.lastPracticedAt)}`)),
      h('span.chip.warn', `${r.confidence}%`))))));
  }

  if (columns.children.length) page.appendChild(columns);

  clear(host);
  host.appendChild(page);
}

/*
 * The lead card. Exactly one of these, chosen by state — see the header note.
 */
function leadCard(overview, focus, recs, reviews) {
  const { profile } = overview;

  /* Nothing started: explain the product in one line and give one door in.
   * §43 — a new learner must understand this inside a minute. */
  if (!focus.length && !Object.keys(profile.skills).length) {
    const first = recs[0];
    return h('div.card.feature',
      h('div.eyebrow', 'Start here'),
      h('h2', 'Pick something and prove you can do it.'),
      h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
        'Skills unlock when you meet their requirements — not when you say you are done. Every node has a quiz, a challenge or a standard behind it.'),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        first
          ? h('button.btn.primary.big', { onclick: () => openSkill(first.skillId) }, `Start ${first.skill.name}`)
          : null,
        h('button.btn.big', { onclick: () => go('tree') }, 'Open the tree')));
  }

  /* Away a while: lead with what slipped, not with a generic welcome. */
  const lastActive = Math.max(0, ...Object.values(profile.skills).map((s) => s.lastPracticedAt || 0));
  const daysAway = lastActive ? (Date.now() - lastActive) / 86400000 : 0;

  if (daysAway >= 7 && reviews.length) {
    const top = reviews[0];
    return h('div.card.feature',
      h('div.eyebrow', 'Welcome back'),
      h('h2', `It has been ${Math.round(daysAway)} days.`),
      h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
        `You have not lost ${top.skill.name} — mastery does not decay. But confidence is at ${top.confidence}%, so a short review is the fastest way back in.`),
      h('button.btn.primary.big', {
        onclick: () => {
          const next = session.nextActivity(top.skillId);
          if (next) go(`activity/${next.id}`);
          else openSkill(top.skillId);
        },
      }, `Review ${top.skill.name}`));
  }

  /* Mid-skill: continue, naming the specific activity rather than the skill. */
  if (focus.length) {
    const current = focus[0];
    const next = session.nextActivity(current.skillId);
    return h('div.card.feature',
      h('div.eyebrow', 'Continue'),
      h('h2', current.skill.name),
      h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
        next ? next.title : 'You have worked through everything here.'),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        next
          ? h('button.btn.primary.big', { onclick: () => go(`activity/${next.id}`) }, 'Continue')
          : h('button.btn.primary.big', { onclick: () => go('tree') }, 'See what it unlocked'),
        h('button.btn.big', { onclick: () => openSkill(current.skillId) }, 'Details')));
  }

  /* Everything in flight is finished: the strongest recommendation. */
  const rec = recs[0];
  if (rec) {
    return h('div.card.feature',
      h('div.eyebrow', 'Recommended'),
      h('h2', rec.skill.name),
      h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
        rec.reasons.join(' · ') || rec.skill.description),
      h('button.btn.primary.big', { onclick: () => openSkill(rec.skillId) }, 'Open'));
  }

  return h('div.card.feature',
    h('h2', 'Nothing queued.'),
    h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 var(--s4)' } },
      'Explore the trees and pick something that looks worth knowing.'),
    h('button.btn.primary.big', { onclick: () => go('explore') }, 'Explore'));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/*
 * A different subtitle for a different day — short, factual, and never the
 * same sentence twice in a row if the state has changed. Generic encouragement
 * ("Keep up the great work!") is exactly the filler §75 rules out.
 */
function subtitle(overview, focus, missions, completed) {
  const left = missions.length - completed.length;
  if (left > 0) return `${left} thing${left === 1 ? '' : 's'} left today.`;
  if (missions.length && left === 0) return 'Today is done. Anything further is a bonus.';
  if (overview.skillsMastered > 0) return `${overview.skillsMastered} skill${overview.skillsMastered === 1 ? '' : 's'} mastered, ${overview.skillsStarted} in progress.`;
  if (focus.length) return `${focus.length} skill${focus.length === 1 ? '' : 's'} in progress.`;
  return 'Nothing in flight.';
}
