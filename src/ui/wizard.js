/*
 * wizard.js — the intake flow. Renders whatever src/intake/schema.js declares,
 * one step at a time, and hands a finished profile back to the app.
 */

import { h, clear, announce } from '../core/dom.js';
import { STEPS, defaults, validateStep, normalizeProfile, summarize } from '../intake/schema.js';
import * as store from '../core/store.js';

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const REVIEW_STEP = STEPS.length;

export function renderWizard(root, onDone) {
  const st = store.get();
  let profile = st.profile ? Object.assign(defaults(), st.profile) : defaults();
  let step = Math.min(st.step || 0, REVIEW_STEP);
  let errors = {};

  function persist() {
    store.set({ profile, step, stage: 'intake' });
  }

  function go(next) {
    step = Math.max(0, Math.min(REVIEW_STEP, next));
    errors = {};
    persist();
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onNext() {
    if (step === REVIEW_STEP) {
      onDone(normalizeProfile(profile));
      return;
    }
    const res = validateStep(step, profile);
    if (!res.ok) {
      errors = res.errors || {};
      draw();
      const first = root.querySelector('.field.bad');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      announce('יש שדה שדורש תיקון');
      return;
    }
    // Skipping an optional step whose gate is off should not strand the user.
    let next = step + 1;
    while (next < REVIEW_STEP && !stepVisible(STEPS[next], profile)) next++;
    go(next);
  }

  function onBack() {
    let prev = step - 1;
    while (prev > 0 && !stepVisible(STEPS[prev], profile)) prev--;
    go(prev);
  }

  function setValue(key, value) {
    profile[key] = value;
    delete errors[key];
    persist();
  }

  function draw() {
    clear(root);
    root.appendChild(h('div.wizard',
      progressBar(step),
      step === REVIEW_STEP ? reviewStep(profile) : stepView(STEPS[step], step),
      nav(),
    ));
  }

  function nav() {
    const last = step === REVIEW_STEP;
    return h('div.wiznav',
      step > 0 ? h('button.btn.ghost', { type: 'button', onclick: onBack },
        h('span.ico', '→'), 'חזרה') : null,
      h('div.spacer'),
      h('button.btn.primary.lg', { type: 'button', onclick: onNext },
        last ? 'בנה לי את התוכנית' : 'המשך',
        h('span.ico', last ? '✦' : '←')),
    );
  }

  function stepView(stepDef, idx) {
    const visible = stepDef.fields.filter((f) => !f.showIf || f.showIf(profile));
    return h('section',
      h('div.stepmeta', `שלב ${idx + 1} מתוך ${REVIEW_STEP + 1}`),
      h('h2', stepDef.title),
      stepDef.subtitle ? h('p.sub', { style: { marginBottom: '26px' } }, stepDef.subtitle) : h('div', { style: { height: '20px' } }),
      visible.map((f) => field(f)),
    );
  }

  function field(f) {
    const bad = !!errors[f.key];
    const wrap = h('div.field' + (bad ? '.bad' : ''));
    wrap.appendChild(h('div.flabel', f.label, f.required === false ? h('span', { style: { color: 'var(--dimmer)', fontWeight: '400', fontSize: '13px' } }, ' · לא חובה') : null));
    if (f.help) wrap.appendChild(h('p.help', f.help));
    wrap.appendChild(control(f));
    if (bad) wrap.appendChild(h('span.err', errors[f.key]));
    return wrap;
  }

  function control(f) {
    const val = profile[f.key];
    switch (f.type) {
      case 'number':
        return h('div.with-unit',
          h('input', {
            type: 'number', value: val === null || val === undefined ? '' : val,
            min: f.min, max: f.max, step: f.step || 1, inputmode: 'decimal',
            placeholder: f.placeholder || '',
            oninput: (e) => setValue(f.key, e.target.value === '' ? null : Number(e.target.value)),
          }),
          f.unit ? h('span.unit', f.unit) : null,
        );

      case 'text':
        return h('input', {
          type: 'text', value: val || '', placeholder: f.placeholder || '',
          oninput: (e) => setValue(f.key, e.target.value),
        });

      case 'textarea':
        return h('textarea', {
          placeholder: f.placeholder || '', text: val || '',
          oninput: (e) => setValue(f.key, e.target.value),
        });

      case 'date':
        return h('input', {
          type: 'date', value: val || '',
          min: f.min, max: f.max,
          oninput: (e) => setValue(f.key, e.target.value),
        });

      case 'choice':
        return h('div.opts' + (f.options.length > 4 ? '.two' : ''),
          f.options.map((o) => optionBtn(o, val === o.value, () => {
            setValue(f.key, o.value);
            draw();
          })),
        );

      case 'multi': {
        const arr = Array.isArray(val) ? val : [];
        return h('div.opts' + (f.options.length > 4 ? '.two' : ''),
          f.options.map((o) => optionBtn(o, arr.includes(o.value), () => {
            const next = arr.includes(o.value) ? arr.filter((v) => v !== o.value) : arr.concat(o.value);
            setValue(f.key, applyExclusive(f, next, o.value));
            draw();
          })),
        );
      }

      case 'chips': {
        const arr = Array.isArray(val) ? val : [];
        return h('div.chipset',
          f.options.map((o) => h('button.btn' + (arr.includes(o.value) ? '.on' : ''), {
            type: 'button',
            onclick: () => {
              const next = arr.includes(o.value) ? arr.filter((v) => v !== o.value) : arr.concat(o.value);
              setValue(f.key, applyExclusive(f, next, o.value));
              draw();
            },
          }, o.label)),
        );
      }

      case 'days': {
        const arr = Array.isArray(val) ? val : [];
        return h('div',
          h('div.days', DAY_LETTERS.map((letter, i) => h('button.daybtn' + (arr.includes(i) ? '.on' : ''), {
            type: 'button', 'aria-pressed': arr.includes(i) ? 'true' : 'false',
            'aria-label': DAY_NAMES[i],
            onclick: () => {
              const next = arr.includes(i) ? arr.filter((v) => v !== i) : arr.concat(i).sort((a, b) => a - b);
              setValue(f.key, next);
              draw();
            },
          }, letter))),
          h('div.scale-ends', h('span', `נבחרו ${arr.length}`), h('span', `יעד: ${profile.daysPerWeek || '—'}`)),
        );
      }

      case 'scale': {
        const min = f.min || 1;
        const max = f.max || 5;
        const btns = [];
        for (let i = min; i <= max; i++) {
          btns.push(h('button' + (val === i ? '.on' : ''), {
            type: 'button', 'aria-pressed': val === i ? 'true' : 'false',
            onclick: () => { setValue(f.key, i); draw(); },
          }, String(i)));
        }
        return h('div',
          h('div.scale', btns),
          f.options && f.options.length >= 2
            ? h('div.scale-ends', h('span', f.options[0].label), h('span', f.options[f.options.length - 1].label))
            : null,
        );
      }

      case 'toggle':
        return h('div.opts.two',
          [{ value: true, label: 'כן' }, { value: false, label: 'לא' }].map((o) => optionBtn(
            { value: o.value, label: o.label },
            val === o.value,
            () => { setValue(f.key, o.value); draw(); },
          )),
        );

      default:
        return h('input', {
          type: 'text', value: val || '',
          oninput: (e) => setValue(f.key, e.target.value),
        });
    }
  }

  function reviewStep() {
    const rows = summarize(profile) || [];
    return h('section',
      h('div.stepmeta', 'סיכום'),
      h('h2', 'זה מה שהבנתי'),
      h('p.sub', { style: { marginBottom: '22px' } },
        'עבור על התשובות. אפשר לחזור אחורה ולשנות כל דבר — התוכנית תיבנה מחדש בהתאם.'),
      h('div.review', rows.map((r) => h('div.row', h('span', r.label), h('span', r.value)))),
      h('div.warnbox', { style: { marginTop: '22px' } },
        h('h4', 'לפני שמתחילים'),
        h('ul',
          h('li', 'התוכנית היא נקודת פתיחה מבוססת עקרונות אימון, לא ייעוץ רפואי.'),
          h('li', 'כאב חד במפרק — עוצרים. יום מנוחה עכשיו חוסך חודשיים אחר כך.'),
          profile.age < 18
            ? h('li', h('b', 'מתחת לגיל 18: '), 'ההורים יודעים, ורופא נתן אישור. זה סטנדרט, לא סימן שמשהו לא בסדר.')
            : h('li', 'אם יש מצב רפואי או ניתוח בשנה האחרונה — כדאי לאשר עם רופא.'),
        ),
      ),
    );
  }

  draw();
}

function applyExclusive(f, next, justPicked) {
  // A "none of these" style option clears everything else, and picking anything
  // else clears it. Schema marks it with option.exclusive.
  const ex = (f.options || []).filter((o) => o.exclusive).map((o) => o.value);
  if (!ex.length) return next;
  if (ex.includes(justPicked)) return next.includes(justPicked) ? [justPicked] : [];
  return next.filter((v) => !ex.includes(v));
}

function optionBtn(o, on, onclick) {
  return h('button.opt' + (on ? '.on' : ''), {
    type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick,
  },
  h('span.tick', on ? '✓' : ''),
  h('span.otext',
    h('span.otitle', o.label),
    o.desc ? h('span.odesc', o.desc) : null,
  ));
}

function progressBar(step) {
  const bar = h('div.progress', { 'aria-hidden': 'true' });
  for (let i = 0; i <= REVIEW_STEP; i++) {
    bar.appendChild(h('i' + (i < step ? '.done' : i === step ? '.now' : '')));
  }
  return bar;
}

function stepVisible(stepDef, profile) {
  if (!stepDef) return false;
  const fields = stepDef.fields.filter((f) => !f.showIf || f.showIf(profile));
  return fields.length > 0;
}

export { DAY_LETTERS, DAY_NAMES };
