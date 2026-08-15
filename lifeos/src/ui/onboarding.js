/*
 * onboarding.js — seven screens, one question each.
 *
 * The questions are not a settings form split into pages. Each one buys
 * something the app cannot work without and cannot guess: which areas exist,
 * what the person is actually trying to get to, when they are free, and how
 * much of the day is real. Asked together on one page they get skimmed and
 * defaulted; asked alone they get answered.
 *
 * NOBODY LANDS ON AN EMPTY DASHBOARD.
 *
 * The last step is not a congratulation screen. It creates the areas, the goal,
 * the first project with its milestones and its first three tasks — so the
 * Today screen has something true to say the first time it opens (§92). The
 * plan comes from ai.generateGoalPlan, whose local templates answer when there
 * is no API key, so this works on the first run with nothing configured.
 *
 * The demo seed is imported inside its handler rather than at the top. It is a
 * module most people never touch, and onboarding must not fail to load because
 * of one that is missing or broken.
 */

import { h, replace, qs, field, chipGroup, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toastError } from '../core/toast.js';
import {
  today as todayIso, weekDays, dayName, formatTime, parseTimeInput, formatDuration,
} from '../core/time.js';
import { updateProfile, updatePreferences } from '../services/core.js';
import {
  areas as areasService, goals as goalsService,
  projects as projectsService, milestones as milestonesService,
} from '../services/structure.js';
import * as tasksService from '../services/tasks.js';
import * as ai from '../ai/provider.js';
import { currentUser } from '../core/session.js';
import { originNote } from './components.js';

const STEP_COUNT = 7;

const AREA_PRESETS = [
  'study', 'code', 'work', 'fitness', 'health', 'money',
  'family', 'friends', 'creative', 'personal', 'learning',
];

const STYLES = [
  { value: 'structured', label: 'onboarding.styleStructured', note: 'onboarding.styleStructuredNote' },
  { value: 'flexible', label: 'onboarding.styleFlexible', note: 'onboarding.styleFlexibleNote' },
  { value: 'balanced', label: 'onboarding.styleBalanced', note: 'onboarding.styleBalancedNote' },
];

const HELP_OPTIONS = [
  { value: 'organize', label: 'onboarding.helpOrganize' },
  { value: 'focus', label: 'onboarding.helpFocus' },
  { value: 'projects', label: 'onboarding.helpProjects' },
  { value: 'habits', label: 'onboarding.helpHabits' },
  { value: 'remember', label: 'onboarding.helpRemember' },
  { value: 'goals', label: 'onboarding.helpGoals' },
];

const CAPACITY_CHOICES = [60, 90, 120, 180, 240, 300];

/* The welcome and the summary are not questions, so they are not pips. Five
 * pips and "שלב 3 מתוך 5" have to be counting the same thing. */
const QUESTION_COUNT = STEP_COUNT - 2;

export function renderOnboarding(onDone) {
  const done = onDone || (() => {});

  const state = {
    step: 0,
    /* Chosen areas in the order they were picked, as {key, title}. They become
     * records only at the end, so somebody who goes back and unpicks one has
     * not left an orphan behind. */
    chosen: [],
    customs: [],
    goal: { title: '', areaIndex: 0, targetDate: '' },
    planningStyle: 'balanced',
    workStart: 8 * 60,
    workEnd: 22 * 60,
    capacity: 180,
    /* Friday and Saturday, because that is the weekend here. A default that
     * matches where somebody lives is a question they do not have to answer. */
    restDays: new Set([5, 6]),
    help: new Set(),
    building: false,
    created: null,
  };

  const host = h('div.centered');
  const box = h('div.centered-wide');
  host.appendChild(box);

  const pips = h('div.steps', { 'aria-hidden': 'true' },
    Array.from({ length: QUESTION_COUNT }, () => h('div.step-pip')));

  /* One error node, moved from step to step. Updating it in place is what lets
   * a validation message appear without rebuilding the answers underneath it. */
  const errorHost = h('div');

  function setError(message) {
    replace(errorHost, message
      ? h('p.field-error', { role: 'alert', style: { marginBlockStart: 'var(--sp-4)' } }, message)
      : null);
    if (message) announce(message, true);
  }

  function question(title, lead) {
    return h('div', { style: { marginBlockEnd: 'var(--sp-5)' } },
      h('h2', { style: { fontSize: 'var(--t-lg)' } }, title),
      lead ? h('p.quiet', { style: { marginBlockStart: '6px' } }, lead) : null);
  }

  /* ------------------------------------------------------------------ *
   * The steps
   * ------------------------------------------------------------------ */

  function stepWelcome() {
    const demoButton = h('button.btn.btn-ghost.btn-sm', {
      type: 'button',
      async onclick() {
        demoButton.disabled = true;
        try {
          const { seedDemo } = await import('../services/demo.js');
          const user = currentUser();
          /* The seed picks a display name of its own unless handed one, and
           * renaming somebody who signed up two minutes ago is not a demo. */
          seedDemo({ displayName: user ? user.displayName : undefined });
        } catch (e) {
          demoButton.disabled = false;
          toastError(t('errors.generic'));
          return;
        }
        done();
      },
    }, icon('layers', { size: 15 }), t('onboarding.demoLoad'));

    return h('div',
      h('h1', t('onboarding.welcomeTitle')),
      h('p.quiet', { style: { marginBlockStart: '10px', fontSize: 'var(--t-md)' } },
        t('onboarding.welcomeLead')),
      h('p.tiny.quiet', { style: { marginBlockStart: '10px' } }, t('onboarding.welcomeTime')),

      h('div', { style: { marginBlockStart: 'var(--sp-6)' } },
        h('button.btn.btn-primary.btn-lg', {
          type: 'button',
          onclick: () => goTo(1),
        }, t('onboarding.welcomeStart'), icon('forward', { size: 16 }))),

      h('div', { style: { marginBlockStart: 'var(--sp-6)' } },
        demoButton,
        h('p.tiny.quiet', { style: { marginBlockStart: '6px' } }, t('onboarding.demoNote'))));
  }

  function stepAreas() {
    const group = h('div.row.wrap-flex', {
      role: 'group',
      'aria-label': t('onboarding.areasTitle'),
    });

    /* Toggled in place rather than repainted: a repaint would move focus back
     * to the first chip after every pick, which makes choosing four areas with
     * a keyboard impossible. */
    function chip(key, title) {
      const button = h('button.chip.chip-select', {
        type: 'button',
        'aria-pressed': state.chosen.some((c) => c.key === key) ? 'true' : 'false',
        onclick: () => {
          const at = state.chosen.findIndex((c) => c.key === key);
          if (at >= 0) state.chosen.splice(at, 1);
          else state.chosen.push({ key, title });
          button.setAttribute('aria-pressed', at >= 0 ? 'false' : 'true');
          if (state.chosen.length) setError(null);
        },
      }, title);
      return button;
    }

    for (const key of AREA_PRESETS) group.appendChild(chip(key, t(`areas.presets.${key}`)));
    for (const custom of state.customs) group.appendChild(chip(custom.key, custom.title));

    const input = h('input.grow', {
      type: 'text',
      maxlength: '40',
      placeholder: t('onboarding.areasCustomPlaceholder'),
      'aria-label': t('onboarding.areasCustom'),
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        addCustom();
      },
    });

    function addCustom() {
      const title = input.value.trim();
      if (!title) return;
      const key = `custom:${title}`;
      if (!state.customs.some((c) => c.key === key)) {
        state.customs.push({ key, title });
        state.chosen.push({ key, title });
        group.appendChild(chip(key, title));
      }
      input.value = '';
      input.focus();
      setError(null);
    }

    return h('div',
      question(t('onboarding.areasTitle'), t('onboarding.areasLead')),
      group,
      h('div.field', { style: { marginBlockStart: 'var(--sp-5)' } },
        h('div.field-label', t('onboarding.areasCustom')),
        h('div.row',
          input,
          h('button.btn.btn-secondary.shrink0', { type: 'button', onclick: addCustom },
            icon('plus', { size: 15 }), t('common.add')))),
      errorHost);
  }

  function stepGoal() {
    if (state.goal.areaIndex >= state.chosen.length) state.goal.areaIndex = 0;

    const title = h('input', {
      type: 'text',
      value: state.goal.title,
      maxlength: '140',
      placeholder: t('onboarding.goalPlaceholder'),
      'aria-label': t('onboarding.goalTitle'),
      oninput: (e) => {
        state.goal.title = e.target.value;
        if (state.goal.title.trim()) setError(null);
      },
    });

    return h('div',
      question(t('onboarding.goalTitle'), t('onboarding.goalLead')),
      h('div.field', title),

      h('div.field',
        h('div.field-label', t('onboarding.goalArea')),
        chipGroup({
          label: t('onboarding.goalArea'),
          value: state.goal.areaIndex,
          options: state.chosen.map((area, i) => ({ value: i, label: area.title })),
          onChange: (value) => { state.goal.areaIndex = Number(value); },
        })),

      field({
        label: t('onboarding.goalWhen'),
        optional: true,
        control: h('input', {
          type: 'date',
          value: state.goal.targetDate,
          min: todayIso(),
          onchange: (e) => { state.goal.targetDate = e.target.value; },
        }),
      }),

      errorHost);
  }

  function stepStyle() {
    const marks = [];

    /* Selection is written onto the three cards rather than repainted, for the
     * same reason as the chips: the answer should not move under the cursor. */
    function select(value) {
      state.planningStyle = value;
      cards.forEach((card, i) => {
        const on = STYLES[i].value === value;
        card.setAttribute('aria-checked', on ? 'true' : 'false');
        replace(marks[i], on ? icon('check', { weight: 2.5 }) : null);
      });
    }

    const cards = STYLES.map((style) => {
      const chosen = state.planningStyle === style.value;
      const mark = h('span.shrink0', { style: { color: 'var(--accent)' } },
        chosen ? icon('check', { weight: 2.5 }) : null);
      marks.push(mark);

      return h('button.card.card-pad.card-click', {
        type: 'button',
        role: 'radio',
        'aria-checked': chosen ? 'true' : 'false',
        style: { width: '100%' },
        onclick: () => select(style.value),
      },
      h('div.row-between',
        h('div.grow',
          h('h4', t(style.label)),
          h('p.tiny.quiet', { style: { marginBlockStart: '4px' } }, t(style.note))),
        mark));
    });

    return h('div',
      question(t('onboarding.styleTitle')),
      h('div.stack', { role: 'radiogroup', 'aria-label': t('onboarding.styleTitle') }, cards));
  }

  function stepAvailability() {
    const rest = h('div.row.wrap-flex', {
      role: 'group',
      'aria-label': t('onboarding.availabilityRestDays'),
    },
    weekDays(todayIso(), 0).map((iso, index) => {
      const button = h('button.chip.chip-select', {
        type: 'button',
        'aria-pressed': state.restDays.has(index) ? 'true' : 'false',
        onclick: () => {
          if (state.restDays.has(index)) state.restDays.delete(index);
          else state.restDays.add(index);
          button.setAttribute('aria-pressed', state.restDays.has(index) ? 'true' : 'false');
        },
      }, dayName(iso));
      return button;
    }));

    function timeField(labelKey, key) {
      return field({
        label: t(labelKey),
        control: h('input', {
          type: 'time',
          value: formatTime(state[key]),
          onchange: (e) => {
            const minutes = parseTimeInput(e.target.value);
            if (minutes === null) return;
            state[key] = minutes;
            if (state.workEnd > state.workStart) setError(null);
          },
        }),
      });
    }

    return h('div',
      question(t('onboarding.availabilityTitle'), t('onboarding.availabilityLead')),
      h('div.field-row',
        timeField('onboarding.availabilityFrom', 'workStart'),
        timeField('onboarding.availabilityUntil', 'workEnd')),

      h('div.field',
        h('div.field-label', t('onboarding.availabilityCapacity')),
        chipGroup({
          label: t('onboarding.availabilityCapacity'),
          value: state.capacity,
          options: CAPACITY_CHOICES.map((minutes) => ({
            value: minutes,
            label: formatDuration(minutes),
          })),
          onChange: (value) => { state.capacity = Number(value); },
        }),
        h('p.field-hint', t('settings.dailyCapacityHint'))),

      h('div.field',
        h('div.field-label', t('onboarding.availabilityRestDays')),
        rest),

      errorHost);
  }

  function stepHelp() {
    const group = h('div.row.wrap-flex', {
      role: 'group',
      'aria-label': t('onboarding.helpTitle'),
    },
    HELP_OPTIONS.map((option) => {
      const button = h('button.chip.chip-select', {
        type: 'button',
        'aria-pressed': state.help.has(option.value) ? 'true' : 'false',
        onclick: () => {
          if (state.help.has(option.value)) state.help.delete(option.value);
          else state.help.add(option.value);
          button.setAttribute('aria-pressed', state.help.has(option.value) ? 'true' : 'false');
        },
      }, t(option.label));
      return button;
    }));

    return h('div', question(t('onboarding.helpTitle'), t('onboarding.helpLead')), group);
  }

  function stepDone() {
    if (state.building || !state.created) {
      return h('div',
        question(t('onboarding.buildingTitle'), t('onboarding.buildingLead')),
        h('div.stack-tight', Array.from({ length: 3 }, () => h('div.skeleton.sk-line'))));
    }

    const { goal, project, tasks, milestoneCount, origin } = state.created;

    function line(label, value, note) {
      return h('div.trow',
        h('div.grow',
          h('div.eyebrow', label),
          h('div.trow-title', { style: { marginBlockStart: '4px' } }, value),
          note ? h('div.tiny.quiet', { style: { marginBlockStart: '3px' } }, note) : null));
    }

    const projectNote = [
      milestoneCount ? plural('count.milestones', milestoneCount) : null,
      tasks.length ? plural('count.tasks', tasks.length) : null,
    ].filter(Boolean).join(' · ');

    return h('div',
      question(t('onboarding.doneTitle'), t('onboarding.doneLead')),
      h('div.card.card-flat', { style: { overflow: 'hidden' } },
        line(t('onboarding.doneGoal'), goal.title),
        project ? line(t('onboarding.doneProject'), project.title, projectNote) : null,
        tasks.length ? line(t('onboarding.doneTask'), tasks[0].title) : null),
      project ? originNote(origin) : null,
      h('div', { style: { marginBlockStart: 'var(--sp-6)' } },
        h('button.btn.btn-primary.btn-lg', {
          type: 'button',
          onclick: () => done(),
        }, t('onboarding.doneGo'), icon('forward', { size: 16 }))));
  }

  const STEPS = [stepWelcome, stepAreas, stepGoal, stepStyle, stepAvailability, stepHelp, stepDone];

  /* ------------------------------------------------------------------ *
   * Moving between them
   * ------------------------------------------------------------------ */

  function validate() {
    switch (state.step) {
      case 1: return state.chosen.length ? null : t('onboarding.areasErr');
      case 2: return state.goal.title.trim() ? null : t('onboarding.goalErr');
      case 4: return state.workEnd > state.workStart ? null : t('onboarding.availabilityErr');
      default: return null;
    }
  }

  function goTo(next) {
    if (next > state.step) {
      const problem = validate();
      if (problem) { setError(problem); return; }
    }
    setError(null);
    state.step = next;
    if (next !== STEP_COUNT - 1) { paintStep(); return; }

    build().catch(() => {
      /* Whatever was written before the failure stays written; going back to
       * the last question is the only thing left that helps. */
      state.building = false;
      state.step = STEP_COUNT - 2;
      paintStep();
      toastError(t('errors.generic'));
    });
  }

  /* ------------------------------------------------------------------ *
   * Creating everything
   * ------------------------------------------------------------------ */

  async function build() {
    state.building = true;
    state.created = null;
    paintStep();

    const areaIds = state.chosen.map((area) => {
      const result = areasService.create({ title: area.title });
      return result.ok ? result.area.id : null;
    });
    const areaId = areaIds[state.goal.areaIndex] || null;

    const goalResult = goalsService.create({
      title: state.goal.title.trim(),
      areaId,
      targetDate: state.goal.targetDate || null,
      progressSource: 'milestones',
    });

    if (!goalResult.ok) {
      state.building = false;
      state.step = 2;
      paintStep();
      setError(t('onboarding.goalErr'));
      return;
    }
    const goal = goalResult.goal;

    let plan = null;
    try {
      plan = await ai.generateGoalPlan(goal);
    } catch (e) {
      plan = null;
    }

    const proposed = plan && plan.projects ? plan.projects[0] : null;
    const origin = plan ? plan.origin : 'rules';
    const actor = origin === 'model' ? 'AI' : 'USER';

    let project = null;
    let milestoneCount = 0;
    const tasks = [];

    if (proposed) {
      const projectResult = projectsService.create({
        title: proposed.title,
        goalId: goal.id,
        areaId,
        dueDate: proposed.dueDate || goal.targetDate || null,
        _actor: actor,
      });

      if (projectResult.ok) {
        project = projectResult.project;

        for (const milestone of proposed.milestones || []) {
          const result = milestonesService.create({
            projectId: project.id,
            title: milestone.title,
            targetDate: milestone.targetDate || null,
          });
          if (result.ok) milestoneCount += 1;
        }

        /* Three, not eight. The first screen has to be readable, and the rest
         * of the proposal is still one button away on the project. */
        for (const task of (proposed.tasks || []).slice(0, 3)) {
          const result = tasksService.create({
            title: task.title,
            projectId: project.id,
            goalId: goal.id,
            areaId,
            status: 'ready',
            estimatedMinutes: task.estimatedMinutes || 30,
            energyLevel: task.energyLevel || 'normal',
            _actor: actor,
          });
          if (result.ok) tasks.push(result.task);
        }
      }
    }

    updatePreferences({
      workStartMinutes: state.workStart,
      workEndMinutes: state.workEnd,
      dailyCapacityMinutes: state.capacity,
      restDays: Array.from(state.restDays).sort((a, b) => a - b),
    });
    updateProfile({
      planningStyle: state.planningStyle,
      helpWith: Array.from(state.help),
      onboardedAt: Date.now(),
    });

    state.created = { goal, project, tasks, milestoneCount, origin };
    state.building = false;
    paintStep();
    announce(t('onboarding.doneTitle'));
  }

  /* ------------------------------------------------------------------ *
   * Painting
   * ------------------------------------------------------------------ */

  function footer() {
    /* The welcome step has its own button and the last one hands over to the
     * app; neither wants a back/next pair underneath. */
    if (state.step === 0 || state.step === STEP_COUNT - 1) return null;

    return h('div.row-between', { style: { marginBlockStart: 'var(--sp-6)' } },
      h('button.btn.btn-ghost', {
        type: 'button',
        onclick: () => goTo(state.step - 1),
      }, icon('back', { size: 16 }), t('common.back')),
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => goTo(state.step + 1),
      },
      state.step === STEP_COUNT - 2 ? t('common.finish') : t('common.next'),
      icon('forward', { size: 16 })));
  }

  function paintStep() {
    const asking = state.step > 0 && state.step < STEP_COUNT - 1;

    Array.from(pips.children).forEach((pip, i) => {
      pip.classList.toggle('step-pip-on', i <= state.step - 1);
    });

    const body = h('div.card.card-pad-lg', STEPS[state.step]());

    replace(box,
      asking ? pips : null,
      asking
        ? h('p.tiny.quiet', { style: { marginBlockEnd: 'var(--sp-3)' } },
          t('onboarding.step', { n: state.step, total: QUESTION_COUNT }))
        : null,
      body,
      footer());

    /* Focus follows the question. Without it, pressing "הבא" leaves focus in
     * the footer and the step that just appeared is read to nobody. */
    const first = qs('input,textarea,select,button', body);
    if (first) first.focus();
  }

  paintStep();
  return host;
}
