/*
 * aisettings.js — the provider, key and model rows, shared by every screen that
 * calls a model.
 *
 * There are two such screens now and they need the same three controls with
 * different answers, because the jobs have different requirements: the photo
 * scan needs a provider that can see, and the intake reader does not. Passing
 * the job through means the vision-only filter is applied once, here, instead
 * of being remembered separately at each call site.
 */

import { h } from '../core/dom.js';
import {
  loadKey, saveKey, keyLooksValid, saveChoice, providersFor, modelsFor, providerById,
} from '../ai/client.js';

/**
 * The key field for one provider. Typing does NOT redraw — that would steal
 * focus mid-word — so `onChange` is expected to refresh only what depends on
 * whether a key is present.
 */
export function keyRow(provider, onChange) {
  const input = h('input', {
    type: 'password', value: loadKey(provider.id), placeholder: provider.keyHint,
    autocomplete: 'off', spellcheck: 'false', dir: 'ltr',
    'aria-label': `מפתח API של ${provider.label}`,
    oninput: (e) => { saveKey(provider.id, e.target.value); onChange(); },
  });

  const reveal = h('button.fbtn', {
    type: 'button', 'aria-pressed': 'false',
    title: 'הצג או הסתר את המפתח',
    onclick: (e) => {
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      e.currentTarget.setAttribute('aria-pressed', shown ? 'false' : 'true');
      e.currentTarget.textContent = shown ? 'הצג' : 'הסתר';
    },
  }, 'הצג');

  return h('div.field',
    h('label', `מפתח API · ${provider.label}`),
    h('div.keyrow', input, reveal),
    h('p.help',
      `מפתח משלך מ־${provider.consoleHost}. נשמר במכשיר שלך בלבד, לא נכלל בייצוא הנתונים, `
      + `ונשלח רק לכתובת אחת — ${hostOf(provider.endpoint)}. `
      + 'לכל ספק מפתח נפרד, והוספת אחד לא דורסת את השני.'),
  );
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (e) {
    return url;
  }
}

/**
 * The provider picker. Hidden when the job has only one candidate — a choice of
 * one is not a choice. For a vision job the text-only providers are absent
 * rather than disabled: they cannot do the work at all, so offering them with a
 * warning would just be a slower way to reach the same error.
 */
export function providerRow(job, current, onPick) {
  const options = providersFor(job);
  if (options.length < 2) return null;
  return h('div.field',
    h('label', 'ספק'),
    h('div.opts.two', options.map((pv) => h('button.opt' + (pv.id === current.id ? '.on' : ''), {
      type: 'button', 'aria-pressed': pv.id === current.id ? 'true' : 'false',
      onclick: () => onPick(pv.id),
    },
    h('span.tick', pv.id === current.id ? '✓' : ''),
    h('span.otext',
      h('span.otitle', pv.label),
      h('span.odesc', pv.vision ? 'טקסט ותמונות' : 'טקסט בלבד')))),
    ),
  );
}

export function modelRow(job, provider, current, label, onPick) {
  const models = modelsFor(provider, job);
  return h('div.field',
    h('label', label || 'מודל'),
    h('div.opts.two', models.map((m) => h('button.opt' + (m.value === current ? '.on' : ''), {
      type: 'button', 'aria-pressed': m.value === current ? 'true' : 'false',
      onclick: () => onPick(m.value),
    },
    h('span.tick', m.value === current ? '✓' : ''),
    h('span.otext', h('span.otitle', m.label), h('span.odesc', m.desc))))),
  );
}

/**
 * All three rows for a job, wired to persist and redraw. Returns an array so
 * the caller can place them among its own fields.
 */
export function settingsRows(job, choice, opts) {
  const o = opts || {};
  const rows = [];
  const pRow = providerRow(job, choice.provider, (id) => {
    const first = modelsFor(providerById(id), job)[0];
    saveChoice(job, id, first ? first.value : '');
    if (o.onRedraw) o.onRedraw();
  });
  if (pRow) rows.push(pRow);
  rows.push(keyRow(choice.provider, o.onKeyInput || (() => {})));
  rows.push(modelRow(job, choice.provider, choice.model, o.modelLabel, (value) => {
    saveChoice(job, choice.provider.id, value);
    if (o.onRedraw) o.onRedraw();
  }));
  return rows;
}

export { keyLooksValid, loadKey };
