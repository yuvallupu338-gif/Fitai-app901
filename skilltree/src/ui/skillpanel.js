/*
 * skillpanel.js — everything about one skill (§8).
 *
 * Opens as a centred dialog on desktop and a bottom sheet on a phone; both
 * come from `sheet()` in core/dom.js, so there is one focus trap and one
 * escape handler rather than two implementations that drift.
 *
 * The requirements list is the part worth care. It is rendered from
 * `requirementStatus`, the same function the gate itself uses, so the panel
 * can never show five ticks beside a node the app is calling locked. Each
 * unmet line says what is needed *and* what the learner currently has, because
 * "JavaScript level 3" alone does not tell you whether you are one level away
 * or three.
 */

import { h, sheet, num } from '../core/dom.js';
import { icon } from './icons.js';
import { findSkill } from '../data/catalog.js';
import { requirementStatus, statusOf, STATUS } from '../domain/unlock.js';
import { skillProgress, skillLevelMeta, xpForSkillLevel } from '../domain/levels.js';
import { skillCapacity, labelForKind } from '../domain/xp.js';
import { nextActivityFor } from '../domain/missions.js';
import * as session from '../core/session.js';
import { go } from '../core/router.js';



const KIND_ICON = {
  learn: 'book', quiz: 'check', practice: 'refresh', challenge: 'bolt',
  project: 'seed', assessment: 'target', mastery: 'star',
};

export function openSkill(skillId, opts = {}) {
  const found = findIn(skillId);
  if (!found) return null;

  const { skill, index } = found;
  const state = session.freshProfile();
  const progressOf = (id) => state.skills[id];

  const status = statusOf(index, skillId, progressOf);
  const progress = state.skills[skillId];
  const reqs = requirementStatus(index, skillId, progressOf);
  const unlocks = (index.dependents.get(skillId) || []).map((id) => index.byId.get(id)).filter(Boolean);

  const capacity = progress?.capacity || skillCapacity(skill.activities, skill.difficulty || 1);
  const prog = skillProgress({
    xp: progress?.xp || 0,
    masteryScore: progress?.masteryScore || 0,
    capacity,
    started: !!progress?.startedAt,
  });

  const body = h('div.stack.loose');

  /* ---- heading ---- */
  body.appendChild(h('div',
    h('div.row', { style: { gap: 'var(--s2)', marginBottom: 'var(--s2)' } },
      h('span.chip', skill.category || found.tree.name),
      h('span.chip', `Difficulty ${skill.difficulty || 1}`),
      status === STATUS.MASTERED ? h('span.chip.on', 'Mastered') : null),
    h('h2', skill.name),
    h('p', { style: { color: 'var(--bone-dim)', margin: 'var(--s2) 0 0', fontSize: '14px' } }, skill.description)));

  /* Why it matters — the question that decides whether someone finishes a
   * branch, so it gets real estate rather than a tooltip. */
  if (skill.why) {
    body.appendChild(h('div.notice',
      icon('info', { size: 16 }),
      h('span', skill.why)));
  }

  /* ---- progress, only once there is some ---- */
  if (progress) {
    const meta = skillLevelMeta(prog.level);
    body.appendChild(h('div.stack.tight',
      h('div.row.between',
        h('div.stat',
          h('span.k', 'Level'),
          h('span.v', `${prog.level}`, h('small', ' / 5'))),
        h('div.stat', { style: { textAlign: 'right' } },
          h('span.k', 'Mastery'),
          h('span.v', `${Math.round(progress.masteryScore)}`, h('small', '%')))),
      h('div', { style: { fontSize: '13px', color: 'var(--bone-dim)' } }, meta.blurb),

      h('div.bar.tall', { style: { marginTop: 'var(--s2)' } },
        h('i', { style: { width: `${Math.round(prog.fraction * 100)}%` } })),

      prog.atCap
        ? h('div.card-note', 'Nothing further to earn here.')
        : h('div.row.between', { style: { fontSize: '12px', color: 'var(--bone-dimmer)' } },
          h('span.num', `${num(progress.xp)} / ${num(xpForSkillLevel(prog.nextLevel, capacity))} XP`),
          /* Naming the binding constraint is the point of splitting the two
           * ladders — "you need a better assessment score" is actionable in a
           * way that a single blended percentage never is. */
          h('span', prog.blockedBy === 'mastery'
            ? `Needs ${prog.masteryCeiling}% mastery for level ${prog.nextLevel}`
            : `Level ${prog.nextLevel} at ${num(xpForSkillLevel(prog.nextLevel, capacity))} XP`)),

      progress.confidence > 0 && progress.confidence < 70
        ? h('div.notice.warn', icon('clock', { size: 16 }),
          h('span', `Confidence has slipped to ${progress.confidence}%. You learned this — a short review would bring it back.`))
        : null));
  }

  /* ---- requirements ---- */
  if (reqs.length) {
    body.appendChild(h('div',
      h('div.card-title', { style: { marginBottom: 'var(--s2)' } },
        status === STATUS.LOCKED ? 'Requirements to unlock' : 'Requirements'),
      /*
       * Every requirement is a link to the skill it names.
       *
       * On a locked skill this list was inert text while the "Unlocks:" chips
       * below it — pointing at skills locked even deeper — were working
       * buttons. The one move the learner needs ("take me to Pricing, the
       * thing standing in my way") was the only one not offered.
       */
      h('div.list', ...reqs.map((r) => h('button.list-item', {
        onclick: () => { close(); openSkill(r.skillId, opts); },
        'aria-label': r.met
          ? `${r.name}, met at level ${r.haveLevel}. Open it.`
          : `${r.name}, needs level ${r.needLevel}, you are at ${r.haveLevel}. Open it.`,
      },
      h('span', {
        style: { color: r.met ? 'var(--accent-ink)' : 'var(--bone-dimmer)', display: 'flex' },
        'aria-hidden': 'true',
      }, icon(r.met ? 'check' : 'lock', { size: 16 })),
      h('div.grow',
        h('div.title', r.name),
        h('div.sub', r.met
          ? `Level ${r.haveLevel} — met`
          : `Needs level ${r.needLevel}, you are at ${r.haveLevel}`)),
      /* Text, not just a colour — the same rule the accessibility lesson
       * in the web tree teaches. */
      h('span.chip', { class: r.met ? 'on' : '' }, r.met ? 'Met' : 'Not yet'),
      icon('chevron', { size: 15 }))))));
  }

  /* ---- activities ---- */
  const activities = skill.activities || [];
  const passed = new Set((progress?.attempts || []).filter((a) => a.passed).map((a) => a.activityId));
  const attempted = new Set((progress?.attempts || []).map((a) => a.activityId));
  const locked = status === STATUS.LOCKED;

  if (activities.length) {
    body.appendChild(h('div',
      h('div.card-title', { style: { marginBottom: 'var(--s2)' } }, 'Activities'),
      h('div.list', ...activities.map((activity) => {
        const done = passed.has(activity.id);
        const tried = attempted.has(activity.id) && !done;
        const row = h('button.list-item', {
          type: 'button',
          disabled: locked,
          onclick: () => { close(); go(`activity/${activity.id}`); },
        },
        h('span', { style: { color: done ? 'var(--accent-ink)' : 'var(--bone-dimmer)', display: 'flex' }, 'aria-hidden': 'true' },
          icon(done ? 'check' : KIND_ICON[activity.kind] || 'play', { size: 16 })),
        h('div.grow',
          h('div.title', activity.title),
          h('div.sub', labelForKind(activity.kind))),
        done ? h('span.chip.on', 'Passed')
          : tried ? h('span.chip.warn', 'Retry')
            : null);
        return row;
      }))));
  }

  /* ---- unlocks ---- */
  if (unlocks.length) {
    body.appendChild(h('div',
      h('div.card-title', { style: { marginBottom: 'var(--s2)' } }, 'Unlocks'),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } },
        ...unlocks.map((u) => h('button.chip', {
          type: 'button',
          onclick: () => { close(); openSkill(u.id, opts); },
        }, u.name)))));
  }

  /* ---- estimate ---- */
  if (skill.estimatedHours) {
    body.appendChild(h('div.row.between', { style: { fontSize: '13px', color: 'var(--bone-dimmer)' } },
      h('span.row', { style: { gap: '6px' } }, icon('clock', { size: 15 }), 'Estimated time'),
      h('span.num', `${skill.estimatedHours[0]}–${skill.estimatedHours[1]} hours`)));
  }

  /* ---- primary action ---- */
  const next = nextActivityFor(skill, progress);
  const action = h('div', { style: { position: 'sticky', bottom: '0', paddingTop: 'var(--s3)' } },
    locked
      ? h('button.btn.big.wide', { disabled: true }, 'Locked')
      : h('button.btn.primary.big.wide', {
        'data-autofocus': '',
        onclick: () => {
          if (!progress) session.begin(skillId);
          close();
          if (next) go(`activity/${next.id}`);
          else if (opts.onChange) opts.onChange();
        },
      }, next
        ? (progress ? `Continue — ${next.title}` : `Start — ${next.title}`)
        : 'Start'));

  body.appendChild(action);

  const handle = sheet(body, {
    label: skill.name,
    onClose: () => { if (opts.onChange) opts.onChange(); },
  });
  const close = handle.close;
  return handle;
}

/*
 * Resolved through the catalog rather than a captured tree, so a skill in a
 * runtime-registered tree — AI-generated or user-made — opens exactly like a
 * seeded one.
 */
function findIn(skillId) {
  return findSkill(skillId);
}
