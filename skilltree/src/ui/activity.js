/*
 * activity.js — doing the work (§44).
 *
 * One focused screen per activity, with the navigation stripped back to a
 * single way out. Five shapes render here — lesson, quiz, numeric practice,
 * code challenge, checklist — and they share a submit path so the grading,
 * the XP, the level check and the toasts cannot differ between them.
 *
 * The screen never decides an outcome. It collects a submission and hands it
 * to `session.submit`, which grades, applies and returns what happened. That
 * separation is what §55 asks for and it is why a learner cannot award
 * themselves a pass by editing the page: the score comes back from the domain
 * layer, and the domain layer looks at the answers, not at the DOM.
 */

import { h, clear, num, announce } from '../core/dom.js';
import { icon } from './icons.js';
import { findActivity } from '../data/catalog.js';
import { statusOf, STATUS, requirementStatus } from '../domain/unlock.js';
import * as session from '../core/session.js';
import { go } from '../core/router.js';
import { announceEvents } from './toast.js';
import { show } from '../domain/verify.js';
import { labelForKind } from '../domain/xp.js';
import { coachFor } from '../ai/coach.js';



export function renderActivity(host, activityId) {
  const found = findActivity(activityId);
  if (!found) {
    clear(host);
    host.appendChild(h('div.empty',
      icon('alert', { size: 28 }),
      h('h3', 'Activity not found'),
      h('p', 'That link may be from a tree that no longer exists.'),
      h('button.btn', { onclick: () => go('tree') }, 'Back to the tree')));
    return;
  }

  const { activity, skill, index } = found;

  /*
   * A locked skill's activities are not runnable, and this is the check that
   * makes that true rather than merely apparent.
   *
   * The skill panel hides the buttons, so the only way here is a typed or
   * shared URL — but "the UI does not offer it" is not a rule, it is a habit.
   * Without this the screen renders, the learner answers everything, and the
   * domain layer rejects the attempt at the very end with no XP and a message
   * about repeats. Found by the smoke test walking straight to the URL.
   */
  const state = session.freshProfile();
  if (statusOf(index, skill.id, (id) => state.skills[id]) === STATUS.LOCKED) {
    const missing = requirementStatus(index, skill.id, (id) => state.skills[id]).filter((r) => !r.met);
    clear(host);
    host.appendChild(h('div.activity-shell',
      h('div.empty',
        icon('lock', { size: 28 }),
        h('h3', `${skill.name} is not open yet`),
        h('p', missing.length
          ? `Still needed: ${missing.map((r) => `${r.name} at level ${r.needLevel}`).join(', ')}.`
          : 'Its requirements have not been met.'),
        h('button.btn.primary', { onclick: () => go(`tree/${found.tree.id}?skill=${skill.id}`) },
          'See what it needs'))));
    return;
  }

  const startedAt = Date.now();

  const shell = h('div.activity-shell');

  /* ---- header: one way out, and where you are ---- */
  shell.appendChild(h('div.row.between', { style: { marginBottom: 'var(--s5)' } },
    h('button.btn.ghost.small', { onclick: () => go(`tree/${found.tree.id}?skill=${skill.id}`) },
      icon('back', { size: 15 }), skill.name),
    h('span.chip', labelForKind(activity.kind))));

  shell.appendChild(h('div', { style: { marginBottom: 'var(--s5)' } },
    h('h1', activity.title),
    activity.brief ? h('p', { style: { color: 'var(--bone-dim)', marginTop: 'var(--s2)' } }, activity.brief) : null));

  const bodyHost = h('div');
  shell.appendChild(bodyHost);

  clear(host);
  host.appendChild(shell);

  if (activity.questions && !Array.isArray(activity.questions[0]?.options)) renderNumeric(bodyHost, found, startedAt);
  else if (activity.questions) renderQuiz(bodyHost, found, startedAt);
  else if (activity.tests) renderCode(bodyHost, found, startedAt);
  else if (activity.checklist) renderChecklist(bodyHost, found, startedAt);
  else renderLesson(bodyHost, found, startedAt);
}

/* ------------------------------------------------------------------ *
 * Shared: submit and show the result
 * ------------------------------------------------------------------ */

async function finish(found, submission, startedAt, host, opts = {}) {
  const outcome = await session.submit(found.activity.id, {
    ...submission,
    durationMs: Date.now() - startedAt,
  });

  /* A code challenge is run repeatedly. Without this, every run appends
   * another result panel and the screen becomes a column of stale verdicts —
   * with the newest at the bottom, below the fold. */
  for (const stale of host.querySelectorAll('[data-result]')) stale.remove();

  if (!outcome.ok) {
    host.appendChild(h('div.notice.fail', { 'data-result': '' },
      icon('alert', { size: 16 }), h('span', 'Something went wrong saving that attempt.')));
    return null;
  }

  /* The domain layer refused the attempt. Say why, rather than falling through
   * to the result panel and reporting a score for something that was never
   * recorded. */
  const rejected = outcome.events.find((e) => e.type === 'rejected');
  if (rejected) {
    host.appendChild(h('div.notice.fail', { 'data-result': '' },
      icon('alert', { size: 16 }),
      h('span', rejected.reason === 'locked'
        ? `${found.skill.name} is not open yet, so this attempt was not recorded.`
        : 'That attempt could not be recorded.')));
    return null;
  }

  announceEvents(outcome.events, outcome.badges, {
    nameOf: (id) => found.index.byId.get(id)?.name || 'Skill',
  });

  renderResult(host, found, outcome, opts);
  return outcome;
}

/*
 * The result panel.
 *
 * States what happened, why, and what to do next — in that order. A failed
 * attempt gets the same visual weight as a passed one rather than being
 * styled as an error, because retrying is the expected path through this app
 * and making failure feel like a malfunction discourages exactly the behaviour
 * the whole design depends on.
 */
function renderResult(host, found, outcome, opts = {}) {
  const { result } = outcome;
  const { activity, skill } = found;

  const panel = h('div.card.feature', { style: { marginTop: 'var(--s5)' }, tabindex: '-1', 'data-result': '' });

  panel.appendChild(h('div.row.between', { style: { marginBottom: 'var(--s3)' } },
    h('h2', result.passed ? passHeadline(activity.kind) : 'Not yet'),
    /* A lesson has no score. Showing "100%" for reading something was a
     * fabricated grade, and the panel should not print one. */
    Number.isFinite(result.score)
      ? h('span.stat', { style: { textAlign: 'right' } },
        h('span.k', 'Score'),
        h('span.v', `${result.score}`, h('small', '%')))
      : null));

  const xpEvent = outcome.events.find((e) => e.type === 'xp');
  if (xpEvent) {
    panel.appendChild(h('div.row', { style: { gap: 'var(--s2)', marginBottom: 'var(--s3)' } },
      h('span.chip.on', `+${xpEvent.amount} XP`),
      ...outcome.events.filter((e) => e.type === 'skill_level')
        .map((e) => h('span.chip.on', `${skill.name} level ${e.to}`)),
      ...outcome.events.filter((e) => e.type === 'unlocked')
        .map((e) => h('span.chip.on', `${e.name} unlocked`))));
  } else if (result.passed) {
    /* Honest about the repeat-decay rule rather than silently paying nothing
     * and letting the learner wonder whether it saved. */
    panel.appendChild(h('div.card-note', { style: { marginBottom: 'var(--s3)' } },
      'Already passed — repeats earn little further XP, but your mastery score still updates.'));
  }

  if (result.selfReported) {
    panel.appendChild(h('div.notice', icon('info', { size: 16 }),
      h('span', 'Self-reported. The app records what you tell it — it cannot check your form.')));
  }

  /* Per-question and per-test detail. This is the actual teaching moment, so
   * it is always shown, on a pass as well as a fail. */
  if (result.kind === 'quiz' || result.kind === 'numeric') {
    panel.appendChild(h('div.stack', { style: { marginTop: 'var(--s4)' } },
      ...result.results.map((r, i) => h('div',
        h('div', { style: { fontSize: '13.5px', fontWeight: '560', marginBottom: '4px' } },
          h('span', { style: { color: r.correct ? 'var(--accent-ink)' : 'var(--fail)', marginRight: '6px' } },
            r.correct ? '✓' : '✗'),
          `${i + 1}. ${r.prompt}`),
        !r.correct
          ? h('div.card-note', result.kind === 'numeric'
            ? `You said ${r.given || '—'}. The answer is ${r.expected}.`
            : `The answer was: ${activity.questions[r.index].options[r.correctIndex]}`)
          : null,
        r.explain ? h('div.explain', r.explain) : null))));
  }

  if (result.kind === 'code') {
    if (result.error) {
      panel.appendChild(h('div.notice.fail', icon('alert', { size: 16 }), h('span', result.error)));
    }
    panel.appendChild(h('div.stack.tight', { style: { marginTop: 'var(--s4)' } },
      ...result.results.map((r) => h('div', { class: `testrow ${r.passed ? 'pass' : 'fail'}` },
        h('span.mark', r.passed ? '✓' : '✗'),
        h('div.detail',
          h('div', r.label),
          !r.passed && !r.skipped
            ? h('div', { style: { marginTop: '2px' } },
              r.error ? `threw: ${r.error}` : `expected ${show(r.expected)}, got ${show(r.actual)}`)
            : null,
          r.skipped ? h('div', { style: { marginTop: '2px' } }, r.error) : null)))));
  }

  /* ---- what next ---- */
  const next = session.nextActivity(skill.id);
  const actions = h('div.row.wrap', { style: { marginTop: 'var(--s5)', gap: 'var(--s2)' } });

  if (!result.passed) {
    actions.appendChild(h('button.btn.primary', { onclick: () => opts.onRetry && opts.onRetry() }, 'Try again'));
  }
  if (next && next.id !== activity.id) {
    actions.appendChild(h('button.btn', { class: result.passed ? 'primary' : '', onclick: () => go(`activity/${next.id}`) },
      `Next — ${next.title}`));
  }
  actions.appendChild(h('button.btn', { onclick: () => go(`tree/${found.tree.id}?skill=${skill.id}`) }, 'Back to the tree'));
  panel.appendChild(actions);

  host.appendChild(panel);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  panel.focus();
}

function passHeadline(kind) {
  /* Short and varied (§76). "You have successfully completed the learning
   * activity" is what this is deliberately not. */
  return {
    quiz: 'Quiz passed.',
    practice: 'All correct.',
    challenge: 'Challenge complete.',
    project: 'Project logged.',
    assessment: 'Assessment passed.',
    mastery: 'Mastery proven.',
    learn: 'Done.',
  }[kind] || 'Complete.';
}

/* ------------------------------------------------------------------ *
 * Lesson
 * ------------------------------------------------------------------ */

function renderLesson(host, found, startedAt) {
  const { activity } = found;
  const body = h('div');

  body.appendChild(h('div.card',
    h('div.prose', ...(activity.body || []).map((p) => h('p', p)))));

  const actions = h('div', { style: { marginTop: 'var(--s5)' } },
    h('button.btn.primary.big', {
      onclick: async () => {
        actions.remove();
        await finish(found, {}, startedAt, body);
      },
    }, 'Mark as read'));

  body.appendChild(actions);
  host.appendChild(body);
}

/* ------------------------------------------------------------------ *
 * Quiz
 * ------------------------------------------------------------------ */

function renderQuiz(host, found, startedAt) {
  const { activity } = found;
  const questions = activity.questions;
  const answers = new Array(questions.length).fill(undefined);

  const body = h('div');
  const progressBar = h('div.bar', h('i', { style: { width: '0%' } }));
  const count = h('span.count.num', `0 / ${questions.length}`);

  body.appendChild(h('div.activity-bar', progressBar, count));

  const submitBtn = h('button.btn.primary.big', { disabled: true }, 'Submit answers');

  questions.forEach((question, qi) => {
    const card = h('div.card', { style: { marginBottom: 'var(--s4)' } },
      h('div.qprompt', `${qi + 1}. ${question.prompt}`));

    const options = h('div.stack.tight');
    question.options.forEach((text, oi) => {
      const btn = h('button.pick', {
        type: 'button',
        'aria-pressed': 'false',
        onclick: () => {
          answers[qi] = oi;
          for (const other of options.children) other.setAttribute('aria-pressed', 'false');
          btn.setAttribute('aria-pressed', 'true');

          const answered = answers.filter((a) => a !== undefined).length;
          count.textContent = `${answered} / ${questions.length}`;
          progressBar.firstChild.style.width = `${(answered / questions.length) * 100}%`;
          submitBtn.disabled = answered < questions.length;
        },
      },
      h('span.pick-mark'),
      h('span.pick-body', text));
      options.appendChild(btn);
    });

    card.appendChild(options);
    body.appendChild(card);
  });

  const actions = h('div.row', { style: { gap: 'var(--s2)' } }, submitBtn);
  submitBtn.addEventListener('click', async () => {
    actions.remove();
    /* Lock the options so the graded state on screen matches what was
     * submitted — an editable quiz beside its own result is confusing. */
    for (const btn of body.querySelectorAll('.pick')) btn.disabled = true;
    markQuiz(body, questions, answers);
    await finish(found, { answers }, startedAt, body, {
      onRetry: () => renderActivity(host.closest('.main') || host.parentElement, activity.id),
    });
  });

  body.appendChild(actions);
  host.appendChild(body);
}

/*
 * Mark the graded options.
 *
 * Border colour alone was the only signal, and the chosen option kept its
 * accent-filled dot — so a wrong answer showed an accent dot inside a red
 * border, and under protanopia the correct row and the wrong row were
 * indistinguishable. Each marked row now carries a word.
 */
function markQuiz(body, questions, answers) {
  const cards = [...body.querySelectorAll('.card')];
  questions.forEach((question, qi) => {
    const picks = [...cards[qi].querySelectorAll('.pick')];
    picks.forEach((pick, oi) => {
      const chosen = answers[qi] === oi;
      if (oi === question.answer) {
        pick.classList.add('right');
        pick.appendChild(h('span.pick-verdict', chosen ? 'Correct' : 'Answer'));
      } else if (chosen) {
        pick.classList.add('wrong');
        pick.appendChild(h('span.pick-verdict', 'Your answer'));
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * Numeric practice
 * ------------------------------------------------------------------ */

function renderNumeric(host, found, startedAt) {
  const { activity } = found;
  const questions = activity.questions;
  const answers = new Array(questions.length).fill('');

  const body = h('div');
  const submitBtn = h('button.btn.primary.big', { disabled: true }, 'Check answers');

  const refresh = () => {
    const answered = answers.filter((a) => String(a).trim()).length;
    submitBtn.disabled = answered < questions.length;
  };

  questions.forEach((question, qi) => {
    const input = h('input.input', {
      type: 'text',
      /* Not `decimal`: on iOS that keypad has no minus key at all, which made
       * every negative-answer question unanswerable on an iPhone. */
      inputmode: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': question.prompt,
      placeholder: 'Your answer',
      style: { maxWidth: '220px', fontFamily: 'var(--mono)' },
      oninput: (e) => { answers[qi] = e.target.value; refresh(); },
    });

    body.appendChild(h('div.card', { style: { marginBottom: 'var(--s3)' } },
      h('div.qprompt', { style: { fontSize: '15px' } }, `${qi + 1}. ${question.prompt}`),
      input));
  });

  /* Said once, at the point of entry, because a learner who types 1/2 and is
   * marked wrong will not try it again. */
  body.appendChild(h('div.card-note', { style: { marginBottom: 'var(--s4)' } },
    'Decimals, fractions and percentages all work — 0.5, 1/2 and 50% are all accepted.'));

  const actions = h('div', submitBtn);
  submitBtn.addEventListener('click', async () => {
    actions.remove();
    for (const input of body.querySelectorAll('.input')) input.disabled = true;
    await finish(found, { answers }, startedAt, body, {
      onRetry: () => renderActivity(host.closest('.main') || host.parentElement, activity.id),
    });
  });

  body.appendChild(actions);
  host.appendChild(body);
}

/* ------------------------------------------------------------------ *
 * Code challenge
 * ------------------------------------------------------------------ */

function renderCode(host, found, startedAt) {
  const { activity, skill } = found;
  const body = h('div');

  const editor = h('textarea.textarea', {
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    'aria-label': 'Your solution',
    style: { minHeight: '220px' },
  });
  editor.value = activity.starter || '';

  body.appendChild(h('div.card', h('div.stack.tight',
    h('label', { style: { fontSize: '12.5px', color: 'var(--bone-dim)' } }, 'Your solution'),
    editor)));

  const hintBox = h('div');
  const runBtn = h('button.btn.primary.big', 'Run tests');

  const actions = h('div.row.wrap', { style: { marginTop: 'var(--s4)', gap: 'var(--s2)' } },
    runBtn,
    activity.hint
      ? h('button.btn', {
        onclick: (e) => {
          e.target.remove();
          hintBox.appendChild(h('div.notice', icon('info', { size: 16 }), h('span', activity.hint)));
        },
      }, 'Hint')
      : null,
    h('button.btn.ghost', { onclick: () => askCoach(found, editor.value, hintBox) },
      icon('sparkle', { size: 15 }), 'Ask the coach'));

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    announce('Running tests');

    const outcome = await finish(found, { source: editor.value }, startedAt, body, {
      onRetry: () => renderActivity(host.closest('.main') || host.parentElement, activity.id),
    });

    /* On a failure the editor stays live and the button comes back — the whole
     * loop is edit, run, edit, and forcing a page reload between attempts
     * would make it hostile. */
    if (outcome && !outcome.result.passed) {
      runBtn.disabled = false;
      runBtn.textContent = 'Run again';
    } else {
      runBtn.remove();
      editor.readOnly = true;
    }
  });

  body.appendChild(actions);
  body.appendChild(hintBox);
  host.appendChild(body);
}

async function askCoach(found, source, host) {
  const box = h('div.card.quiet', { style: { marginTop: 'var(--s3)' } },
    h('div.row', { style: { gap: 'var(--s2)', color: 'var(--bone-dim)', fontSize: '13px' } },
      icon('sparkle', { size: 15 }), 'Thinking…'));
  host.appendChild(box);

  const reply = await coachFor({
    skill: found.skill,
    activity: found.activity,
    source,
    question: 'I am stuck on this challenge. Give me a nudge, not the answer.',
  });

  clear(box);
  box.appendChild(h('div.row', { style: { gap: 'var(--s2)', alignItems: 'flex-start' } },
    h('span', { style: { color: 'var(--accent-ink)', display: 'flex', marginTop: '2px' } }, icon('sparkle', { size: 15 })),
    h('div', { style: { fontSize: '13.5px', lineHeight: '1.6', color: 'var(--bone-dim)' } }, reply.text)));

  if (reply.offline) {
    box.appendChild(h('div.card-note', { style: { marginTop: 'var(--s2)' } },
      'Offline hint. Add an API key in Settings for a coach that reads your code.'));
  }
}

/* ------------------------------------------------------------------ *
 * Checklist
 * ------------------------------------------------------------------ */

function renderChecklist(host, found, startedAt) {
  const { activity } = found;
  const items = activity.checklist;
  const checked = new Array(items.length).fill(false);

  const body = h('div');
  const submitBtn = h('button.btn.primary.big', { disabled: true }, 'Record this');

  const list = h('div.stack.tight');
  items.forEach((item, i) => {
    const btn = h('button.pick.box', {
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        checked[i] = !checked[i];
        btn.setAttribute('aria-pressed', String(checked[i]));
        /* Every item must be ticked. A partial pass on a physical standard
         * would mean recording a skill as demonstrated when it was not. */
        submitBtn.disabled = !checked.every(Boolean);
      },
    },
    h('span.pick-mark', '✓'),
    h('span.pick-body', item));
    list.appendChild(btn);
  });

  body.appendChild(h('div.card', list));

  body.appendChild(h('div.notice', { style: { marginTop: 'var(--s4)' } },
    icon('info', { size: 16 }),
    h('span', 'You are recording your own assessment. Only tick what is true today — the value of this is that it stays honest.')));

  const actions = h('div', { style: { marginTop: 'var(--s4)' } }, submitBtn);
  submitBtn.addEventListener('click', async () => {
    actions.remove();
    for (const btn of list.querySelectorAll('.pick')) btn.disabled = true;
    await finish(found, { checked }, startedAt, body, {
      onRetry: () => renderActivity(host.closest('.main') || host.parentElement, activity.id),
    });
  });

  body.appendChild(actions);
  host.appendChild(body);
}

