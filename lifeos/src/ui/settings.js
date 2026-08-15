/*
 * settings.js — every number the planner uses, in one place, editable.
 *
 * THE ORDER IS FROM "WHAT I CHANGE" TO "WHAT I CANNOT UNDO".
 *
 * Profile and appearance first because they are what somebody opens this
 * screen for; planning and the priority weights next, because they are the
 * settings that actually change what the app tells you to do; the assistant
 * after that; and the two irreversible things — importing over everything, and
 * deleting the account — at the bottom, behind a confirmation each.
 *
 * THERE IS NO SAVE BUTTON.
 *
 * Every control commits on change and says so. A settings screen with a save
 * button has two states — what is on screen and what is stored — and the gap
 * between them is where "I turned that off" and "no you did not" arguments
 * live. The cost is that a value refused by validation has to be visibly
 * refused, which is why the work-hours pair repaints with an error and reverts
 * rather than quietly keeping a number the planner will not use.
 *
 * A setting whose effect is invisible confirms in a toast; a setting you can
 * see happen — the theme, a switch — does not, because narrating something
 * somebody just watched is noise.
 */

import {
  h, replace, field, switchRow, chipGroup, confirmDestructive, ltr,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast, toastOk, toastError } from '../core/toast.js';
import { href } from '../core/router.js';
import { signOut, renameAccount } from '../core/session.js';
import {
  APP_TZ, formatTime, parseTimeInput, weekDays, dayName, today as todayIso,
} from '../core/time.js';
import * as db from '../core/db.js';
import { DEFAULT_WEIGHTS, PLANNING_STYLES } from '../domain/schema.js';
import {
  profile, updateProfile, preferences, updatePreferences, resetWeights,
} from '../services/core.js';
import * as account from '../services/account.js';
import { PROVIDERS, providerById, modelsFor, keyLooksValid } from '../ai/providers.js';
import {
  loadKey, saveKey, choice, setChoice, testConnection, AI_ERRORS,
} from '../ai/client.js';
import { openShortcuts } from './more.js';

const STYLE_LABEL = {
  structured: 'onboarding.styleStructured',
  flexible: 'onboarding.styleFlexible',
  balanced: 'onboarding.styleBalanced',
};

const THEME_OPTIONS = [
  { value: 'system', label: 'settings.themeSystem', icon: 'monitor' },
  { value: 'light', label: 'settings.themeLight', icon: 'sun' },
  { value: 'dark', label: 'settings.themeDark', icon: 'moon' },
];

const WEIGHT_FIELDS = [
  ['importance', 'settings.weightImportance'],
  ['urgency', 'settings.weightUrgency'],
  ['goalImpact', 'settings.weightGoalImpact'],
  ['deadlinePressure', 'settings.weightDeadline'],
  ['unlockPotential', 'settings.weightUnlock'],
];

/* Every failure shape client.js can return, as a sentence. The test button is
 * the one place a person is deliberately provoking an error, so "משהו השתבש"
 * would waste the only moment where a precise message is actually useful. */
const AI_ERROR_KEY = {
  [AI_ERRORS.NO_KEY]: 'ai.noKeyTitle',
  [AI_ERRORS.AUTH]: 'ai.errAuth',
  [AI_ERRORS.RATE]: 'ai.errRate',
  [AI_ERRORS.NETWORK]: 'ai.errNetwork',
  [AI_ERRORS.CORS]: 'ai.errCors',
  [AI_ERRORS.TIMEOUT]: 'ai.errTimeout',
  [AI_ERRORS.BAD_OUTPUT]: 'ai.errBadOutput',
  [AI_ERRORS.SERVER]: 'ai.errServer',
  [AI_ERRORS.UNKNOWN]: 'ai.errGeneric',
};

const CUSTOM_MODEL = '__custom__';

let rerender = () => {};

function saved() {
  toast(t('common.saved'), { tone: 'ok' });
}

function section(title, children) {
  return h('section.section',
    h('div.section-head', h('h2.section-title', title)),
    h('div.card.card-pad', children));
}

/* Read-only rather than a disabled control: there is one timezone and one
 * language in this build, and a greyed-out select implies a choice that merely
 * happens to be unavailable today. */
function readOnlyField(label, value, hint) {
  return h('div.field',
    h('div.field-label', label),
    h('p', value),
    hint ? h('p.field-hint', hint) : null);
}

/**
 * A bounded number.
 *
 * Out-of-range input is clamped in the field as well as on the way to storage,
 * so the screen never shows a number the planner is not using — the failure
 * core.js warns about, where a settings screen appears to save and the engine
 * keeps the old value.
 */
function numberField(opts) {
  const input = h('input', {
    type: 'number',
    inputmode: 'numeric',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step || 1),
    value: String(opts.value),
    onchange: (e) => {
      const raw = Number(e.target.value);
      if (!Number.isFinite(raw)) {
        e.target.value = String(opts.value);
        toastError(t('errors.invalidNumber'));
        return;
      }
      const clamped = Math.min(opts.max, Math.max(opts.min, Math.round(raw)));
      e.target.value = String(clamped);
      opts.onCommit(clamped);
      saved();
    },
  });
  return field({ label: opts.label, hint: opts.hint, control: input });
}

/**
 * Two times that only commit while the pair still makes sense.
 *
 * The check lives here rather than in the schema because the schema validates
 * one field at a time: 22:00 and 08:00 are each a valid minute of the day, and
 * only together are they a working day that ends before it starts.
 */
function timeRangeFields(startKey, endKey, startLabel, endLabel) {
  const host = h('div');

  function paint(error) {
    const prefs = preferences();
    replace(host,
      h('div.field-row',
        field({
          label: startLabel,
          control: h('input', {
            type: 'time',
            value: formatTime(prefs[startKey]),
            onchange: (e) => commit(startKey, e.target.value),
          }),
        }),
        field({
          label: endLabel,
          control: h('input', {
            type: 'time',
            value: formatTime(prefs[endKey]),
            onchange: (e) => commit(endKey, e.target.value),
          }),
        })),
      error ? h('p.field-error', { role: 'alert' }, error) : null);
  }

  function commit(key, raw) {
    const minutes = parseTimeInput(raw);
    if (minutes === null) { paint(t('errors.invalidTime')); return; }

    const prefs = preferences();
    const patch = { [startKey]: prefs[startKey], [endKey]: prefs[endKey] };
    patch[key] = minutes;
    if (patch[endKey] <= patch[startKey]) { paint(t('errors.endBeforeStart')); return; }

    updatePreferences(patch);
    paint(null);
    saved();
  }

  paint(null);
  return host;
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

function nameField() {
  const host = h('div');

  function paint(error, draft) {
    replace(host, field({
      label: t('settings.displayName'),
      error,
      control: h('input', {
        type: 'text',
        maxlength: '60',
        value: draft === undefined ? (profile().displayName || '') : draft,
        onchange: (e) => {
          const value = e.target.value.trim();
          if (!value) { paint(t('errors.required'), e.target.value); return; }
          updateProfile({ displayName: value });
          /* The greeting reads the profile and the account switcher reads the
           * session record, so a name that moves in one place and not the
           * other is two names for the same person. */
          renameAccount(value);
          paint(null);
          saved();
        },
      }),
    }));
  }

  paint(null);
  return host;
}

function profileSection() {
  const week = weekDays(todayIso(), 0);
  const weekStart = h('select', {
    onchange: (e) => { updateProfile({ weekStartsOn: Number(e.target.value) }); saved(); },
  }, week.map((iso, index) => h('option', { value: String(index) }, dayName(iso))));
  weekStart.value = String(profile().weekStartsOn);

  return section(t('settings.profile'), [
    nameField(),
    readOnlyField(t('settings.timezone'), ltr(APP_TZ), t('settings.timezoneNote')),
    readOnlyField(t('settings.locale'), t('settings.localeValue')),
    field({ label: t('settings.weekStartsOn'), control: weekStart }),
  ]);
}

/* ------------------------------------------------------------------ *
 * Appearance
 * ------------------------------------------------------------------ */

function appearanceSection() {
  const current = account.currentTheme();
  return section(t('settings.appearance'), [
    h('div.field-label', t('settings.theme')),
    h('div.segmented', { role: 'group', 'aria-label': t('settings.theme') },
      THEME_OPTIONS.map((option) => h('button', {
        type: 'button',
        'aria-pressed': option.value === current ? 'true' : 'false',
        onclick: () => {
          account.setTheme(option.value);
          rerender();
        },
      }, icon(option.icon, { size: 14 }), t(option.label)))),
  ]);
}

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

function restDaysField() {
  const week = weekDays(todayIso(), 0);
  const group = h('div.row.wrap-flex', { role: 'group', 'aria-label': t('settings.restDays') });

  week.forEach((iso, index) => {
    const button = h('button.chip.chip-select', {
      type: 'button',
      'aria-pressed': (preferences().restDays || []).includes(index) ? 'true' : 'false',
      onclick: () => {
        const days = new Set(preferences().restDays || []);
        if (days.has(index)) days.delete(index); else days.add(index);
        updatePreferences({ restDays: Array.from(days).sort((a, b) => a - b) });
        button.setAttribute('aria-pressed', days.has(index) ? 'true' : 'false');
        saved();
      },
    }, dayName(iso));
    group.appendChild(button);
  });

  return h('div.field',
    h('div.field-label', t('settings.restDays')),
    group);
}

function styleField() {
  /* The note under the chips is the chosen style's own sentence, so it has to
   * follow the selection — a chip group that changes silently and leaves an
   * explanation of the previous choice underneath is worse than no note. */
  const note = h('p.field-hint', t(`${STYLE_LABEL[profile().planningStyle]}Note`));

  return h('div.field',
    h('div.field-label', t('settings.planningStyle')),
    chipGroup({
      label: t('settings.planningStyle'),
      value: profile().planningStyle,
      options: PLANNING_STYLES.map((style) => ({
        value: style,
        label: t(STYLE_LABEL[style]),
        note: t(`${STYLE_LABEL[style]}Note`),
      })),
      onChange: (value) => {
        updateProfile({ planningStyle: value });
        replace(note, t(`${STYLE_LABEL[value]}Note`));
        saved();
      },
    }),
    note);
}

function planningSection() {
  const prefs = preferences();

  return section(t('settings.planningTitle'), [
    styleField(),
    numberField({
      label: t('settings.dailyCapacity'),
      hint: t('settings.dailyCapacityHint'),
      value: prefs.dailyCapacityMinutes,
      min: 15,
      max: 960,
      step: 15,
      onCommit: (n) => updatePreferences({ dailyCapacityMinutes: n }),
    }),
    timeRangeFields('workStartMinutes', 'workEndMinutes', t('settings.workStart'), t('settings.workEnd')),
    h('div.field',
      h('div.field-label', t('settings.focusWindow')),
      timeRangeFields('focusWindowStart', 'focusWindowEnd', t('calendar.starts'), t('calendar.ends'))),
    numberField({
      label: t('settings.breakLength'),
      value: prefs.breakMinutes,
      min: 0,
      max: 60,
      step: 5,
      onCommit: (n) => updatePreferences({ breakMinutes: n }),
    }),
    numberField({
      label: t('settings.maxDeepWork'),
      value: prefs.maxDeepWorkMinutes,
      min: 30,
      max: 600,
      step: 15,
      onCommit: (n) => updatePreferences({ maxDeepWorkMinutes: n }),
    }),
    numberField({
      label: t('settings.bufferPct'),
      hint: t('settings.bufferHint'),
      value: prefs.bufferPct,
      min: 0,
      max: 50,
      step: 5,
      onCommit: (n) => updatePreferences({ bufferPct: n }),
    }),
    numberField({
      label: t('settings.minBlock'),
      hint: t('settings.minBlockHint'),
      value: prefs.minBlockMinutes,
      min: 5,
      max: 120,
      step: 5,
      onCommit: (n) => updatePreferences({ minBlockMinutes: n }),
    }),
    restDaysField(),
  ]);
}

/* ------------------------------------------------------------------ *
 * Priority weights
 * ------------------------------------------------------------------ */

/**
 * The five weights as whole percentages that add to exactly 100.
 *
 * priority.js divides the raw numbers by their sum, so what somebody is really
 * setting is five shares — and shares displayed as 33/33/33 that add to 99
 * read as a bug in the app rather than in the rounding. Largest remainder puts
 * the missing points back where the rounding took them from.
 *
 * All five at zero is not a preference, and the engine falls back to the
 * defaults there; the display follows it rather than showing five zeroes
 * nothing is using.
 */
function shares(weights) {
  const raw = WEIGHT_FIELDS.map(([key]) => Math.max(0, Number(weights[key]) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? raw : WEIGHT_FIELDS.map(([key]) => DEFAULT_WEIGHTS[key]);
  const total = base.reduce((a, b) => a + b, 0);

  const exact = base.map((value) => (value / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const entry of byRemainder) {
    if (left <= 0) break;
    out[entry.index] += 1;
    left -= 1;
  }
  return out;
}

function weightsSection() {
  const draft = Object.assign({}, preferences().weights);
  const percentLabels = new Map();
  const ranges = new Map();

  function paintShares() {
    const pct = shares(draft);
    WEIGHT_FIELDS.forEach(([key], index) => {
      replace(percentLabels.get(key), ltr(`${pct[index]}%`));
      /* The slider's own value is a raw weight; the share is what the screen
       * shows and what the ranking uses, so that is what gets announced. */
      ranges.get(key).setAttribute('aria-valuetext', `${pct[index]}%`);
    });
  }

  const sliders = WEIGHT_FIELDS.map(([key, labelKey]) => {
    const id = `weight-${key}`;
    const percent = h('span.tiny.quiet');
    percentLabels.set(key, percent);

    const range = h('input', {
      id,
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      value: String(Math.round((Number(draft[key]) || 0) * 100)),
      /* The range is the one control the stylesheet does not dress, and the
       * shared input rules would put a card border around the track. */
      style: {
        padding: '0', background: 'transparent', border: 'none', accentColor: 'var(--accent)',
      },
      /* Dragging repaints the percentages so the five numbers stay a coherent
       * split while the thumb moves; only letting go writes and confirms. */
      oninput: (e) => { draft[key] = Number(e.target.value) / 100; paintShares(); },
      onchange: () => {
        updatePreferences({ weights: draft });
        toast(t('settings.weightsSaved'), { tone: 'ok' });
      },
    });

    ranges.set(key, range);

    return h('div', { style: { marginBlockStart: 'var(--sp-3)' } },
      h('div.row-between',
        h('label.field-label', { for: id, style: { marginBlockEnd: '0' } }, t(labelKey)),
        percent),
      range);
  });

  paintShares();

  return section(t('settings.weights'), [
    h('p.tiny.quiet', t('settings.weightsHint')),
    sliders,
    h('div.row', { style: { marginBlockStart: 'var(--sp-4)' } },
      h('button.btn.btn-sm.btn-secondary', {
        type: 'button',
        onclick: () => {
          resetWeights();
          toast(t('settings.weightsSaved'), { tone: 'ok' });
          rerender();
        },
      }, t('settings.weightsReset'))),
  ]);
}

/* ------------------------------------------------------------------ *
 * Assistant
 * ------------------------------------------------------------------ */

function keyField(provider, state) {
  const host = h('div.field');

  function paint(error, draft) {
    const id = `ai-key-${provider.id}`;
    const input = h('input', {
      id,
      type: state.reveal ? 'text' : 'password',
      dir: 'ltr',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: provider.keyHint,
      value: draft === undefined ? (loadKey(provider.id) || '') : draft,
      onchange: (e) => commit(e.target.value),
    });

    const toggle = h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': state.reveal ? t('auth.passwordHide') : t('auth.passwordShow'),
      'aria-pressed': state.reveal ? 'true' : 'false',
      onclick: () => {
        state.reveal = !state.reveal;
        paint(error, input.value).focus();
      },
    }, icon(state.reveal ? 'eyeOff' : 'eye'));

    replace(host,
      h('label.field-label', { for: id }, t('ai.apiKey')),
      h('div.row', h('div.grow', input), toggle),
      error
        ? h('p.field-error', { role: 'alert' }, error)
        : h('p.field-hint', `${t('ai.apiKeyHint')} ${t('ai.keyFrom', { console: provider.console })}`));

    return input;
  }

  function commit(raw) {
    const value = String(raw || '').trim();
    if (!value) {
      saveKey(provider.id, '');
      paint(null, '');
      toast(t('ai.apiKeyRemoved'));
      return;
    }
    /* The typed text is kept on a rejection: the usual cause is a paste that
     * lost its tail, and reverting to the stored key would hide the evidence. */
    if (!keyLooksValid(value)) { paint(t('ai.apiKeyInvalid'), value); return; }
    saveKey(provider.id, value);
    paint(null, value);
    toastOk(t('ai.apiKeySaved'));
  }

  paint(null);
  return host;
}

function testButton(state) {
  const label = t('ai.testConnection');
  const button = h('button.btn.btn-secondary', {
    type: 'button',
    async onclick() {
      button.disabled = true;
      replace(button, icon('sparkle', { size: 16 }), t('ai.thinking'));
      let result;
      try {
        result = await testConnection(state.providerId, state.model);
      } catch (e) {
        result = { ok: false, error: AI_ERRORS.UNKNOWN };
      }
      button.disabled = false;
      replace(button, icon('zap', { size: 16 }), label);
      if (result.ok) { toastOk(t('ai.testOk')); return; }
      toastError(t('ai.testFail', { reason: t(AI_ERROR_KEY[result.error] || 'ai.errGeneric') }));
    },
  }, icon('zap', { size: 16 }), label);
  return button;
}

function providerSetup() {
  const host = h('div', { style: { marginBlockStart: 'var(--sp-5)' } });
  const current = choice();
  const state = { providerId: current.providerId, model: current.model, reveal: false };
  state.custom = !modelsFor(state.providerId).some((m) => m.value === state.model)
    && !!providerById(state.providerId).allowCustomModel;

  function paint() {
    const provider = providerById(state.providerId);
    const models = modelsFor(state.providerId);

    const providerSelect = h('select', {
      onchange: (e) => {
        state.providerId = e.target.value;
        /* A model id belongs to one vendor, so switching vendor cannot carry
         * the old one across — it would be sent to a host that has never
         * heard of it. */
        state.model = modelsFor(state.providerId)[0].value;
        state.custom = false;
        setChoice(state.providerId, state.model);
        paint();
        saved();
      },
    }, PROVIDERS.map((p) => h('option', { value: p.id }, p.label)));
    providerSelect.value = state.providerId;

    const known = models.some((m) => m.value === state.model);
    const typed = state.custom && provider.allowCustomModel;

    const modelSelect = h('select', {
      onchange: (e) => {
        if (e.target.value === CUSTOM_MODEL) { state.custom = true; paint(); return; }
        state.custom = false;
        state.model = e.target.value;
        setChoice(state.providerId, state.model);
        paint();
        saved();
      },
    },
    models.map((m) => h('option', { value: m.value, title: m.note || null }, `${m.label} · ${m.value}`)),
    /* A model id the table does not carry is still the one that will be sent,
     * so it appears as itself rather than letting the select fall back to
     * something the app is not going to use. */
    !known && !typed ? h('option', { value: state.model }, state.model) : null,
    provider.allowCustomModel ? h('option', { value: CUSTOM_MODEL }, t('common.other')) : null);
    modelSelect.value = typed ? CUSTOM_MODEL : state.model;

    const customField = typed
      ? field({
        label: t('ai.modelCustom'),
        control: h('input', {
          type: 'text',
          dir: 'ltr',
          placeholder: models[0].value,
          value: known ? '' : state.model,
          onchange: (e) => {
            const value = e.target.value.trim();
            if (!value) return;
            state.model = value;
            setChoice(state.providerId, value);
            saved();
          },
        }),
      })
      : null;

    replace(host,
      field({ label: t('ai.provider'), control: providerSelect }),
      field({ label: t('ai.model'), control: modelSelect }),
      customField,
      keyField(provider, state),
      /* Not a preference the app can honour: the browser refuses this vendor's
       * endpoint before the request leaves the machine, and somebody who has
       * put a key in deserves to know that now rather than at the first
       * failure. */
      provider.browserOk
        ? null
        : h('div.notice.notice-warn', { style: { marginBlockStart: 'var(--sp-3)' } },
          t('ai.browserWarn', { provider: provider.label })),
      h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
        testButton(state),
        h('a.btn.btn-ghost', { href: href('/memory') }, icon('memory', { size: 16 }), t('nav.memory')),
        h('button.btn.btn-ghost', {
          type: 'button',
          onclick: () => {
            db.removeWhere('aiInteractions', () => true);
            toast(t('settings.aiHistoryCleared'));
          },
        }, icon('trash', { size: 16 }), t('settings.aiClearHistory'))));
  }

  paint();
  return host;
}

function assistantSection() {
  const prefs = preferences();

  const toggle = (key) => (value) => { updatePreferences({ [key]: value }); };

  return section(t('settings.aiTitle'), [
    switchRow({
      label: t('settings.aiEnabled'),
      note: t('settings.aiEnabledNote'),
      checked: prefs.aiEnabled,
      onChange: toggle('aiEnabled'),
    }),
    switchRow({
      label: t('settings.memoryEnabled'),
      note: t('settings.memoryEnabledNote'),
      checked: prefs.memoryEnabled,
      onChange: toggle('memoryEnabled'),
    }),
    switchRow({
      label: t('settings.aiNotes'),
      note: t('settings.aiNotesNote'),
      checked: prefs.aiCanReadNotes,
      onChange: toggle('aiCanReadNotes'),
    }),
    switchRow({
      label: t('settings.aiCalendar'),
      checked: prefs.aiCanReadCalendar,
      onChange: toggle('aiCanReadCalendar'),
    }),
    switchRow({
      label: t('settings.aiActivity'),
      note: t('settings.aiActivityNote'),
      checked: prefs.aiLearnFromActivity,
      onChange: toggle('aiLearnFromActivity'),
    }),
    providerSetup(),
  ]);
}

/* ------------------------------------------------------------------ *
 * Privacy
 * ------------------------------------------------------------------ */

function privacySection() {
  return section(t('settings.privacy'), [
    h('p.muted', t('settings.privacyLead')),
    h('h4', { style: { marginBlockStart: 'var(--sp-4)' } }, t('settings.privacyWhatSent')),
    h('p.muted', { style: { marginBlockStart: '6px' } }, t('settings.privacyWhatSentNote')),
  ]);
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

async function runImport(file) {
  const yes = await confirmDestructive({
    title: t('settings.importJson'),
    note: t('settings.importReplace'),
    confirmLabel: t('common.import'),
  });
  if (!yes) return;

  let text;
  try {
    text = await account.readFile(file);
  } catch (e) {
    toastError(t('settings.importFailed'));
    return;
  }

  const result = account.importJson(text);
  if (!result.ok) { toastError(t('settings.importFailed')); return; }
  toast(t('settings.importDone'), { tone: 'ok' });
  rerender();
}

async function askDeleteAccount() {
  const yes = await confirmDestructive({
    title: t('settings.deleteAccountConfirm'),
    note: t('settings.deleteAccountNote'),
    confirmLabel: t('settings.deleteAccount'),
  });
  if (!yes) return;
  /* The app listens for the session change and swaps itself back to the
   * sign-in screen, so there is nowhere to navigate to from here. */
  account.deleteAccount();
}

function dataSection() {
  const picker = h('input.sr-only', {
    type: 'file',
    accept: '.json,application/json',
    onchange: (e) => {
      const file = e.target.files && e.target.files[0];
      /* Cleared so that picking the same file twice still fires a change. */
      e.target.value = '';
      if (file) runImport(file);
    },
  });

  const storage = account.storageInfo();

  return section(t('settings.dataTitle'), [
    h('div.row.wrap-flex',
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => {
          account.downloadFile(account.exportJson());
          toast(t('settings.exportDone'));
        },
      }, icon('download', { size: 16 }), t('settings.exportJson')),
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => {
          account.downloadFile(account.exportCsv());
          toast(t('settings.exportDone'));
        },
      }, icon('download', { size: 16 }), t('settings.exportCsv')),
      h('button.btn.btn-ghost', {
        type: 'button',
        onclick: () => picker.click(),
      }, icon('upload', { size: 16 }), t('settings.importJson')),
      picker),

    h('div.row-between', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('span.tiny.quiet', t('settings.storageUsed')),
      h('span.tiny.quiet', storage.label)),

    h('div', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-danger', {
        type: 'button',
        onclick: () => askDeleteAccount(),
      }, icon('trash', { size: 16 }), t('settings.deleteAccount')),
      h('p.field-hint', t('settings.deleteAccountNote'))),
  ]);
}

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

async function askSignOut() {
  const yes = await confirmDestructive({
    title: t('confirm.signOutTitle'),
    note: t('confirm.signOutNote'),
    confirmLabel: t('auth.signOut'),
  });
  if (!yes) return;
  signOut();
}

function aboutSection() {
  return section(t('settings.about'), [
    h('div.row-between',
      h('span', t('app.name')),
      h('span.tiny.quiet', `${t('settings.version')} `, ltr('1.0'))),
    h('p.tiny.quiet', { style: { marginBlockStart: '4px' } }, t('app.tagline')),

    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => openShortcuts(),
      }, icon('keyboard', { size: 16 }), t('settings.keyboardShortcuts')),
      h('button.btn.btn-ghost', {
        type: 'button',
        onclick: () => askSignOut(),
      }, icon('logout', { size: 16 }), t('auth.signOut'))),
  ]);
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderSettings(onRerender) {
  rerender = onRerender;

  /* No page header: the topbar already says הגדרות, and eight section titles
   * under a ninth repeated one is a screen that opens with its own name twice. */
  return h('div',
    profileSection(),
    appearanceSection(),
    planningSection(),
    weightsSection(),
    assistantSection(),
    privacySection(),
    dataSection(),
    aboutSection());
}
