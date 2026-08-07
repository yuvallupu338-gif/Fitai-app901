/*
 * quickstart.js — "tell me in your own words", at the top of the questionnaire.
 *
 * The panel fills the form and then gets out of the way. It does not submit, it
 * does not skip a step, and it does not hide what it did: the fields it wrote
 * are named, the ones it could not are named too, and the user walks the same
 * nine steps afterwards with most of them already answered.
 *
 * That ordering is deliberate. A model that fills a form the user never sees is
 * a model whose mistakes ship. Every value here lands in a control the user is
 * about to scroll past anyway.
 */

import { h, clear, announce } from '../core/dom.js';
import { readIntake, AiError } from '../ai/intake.js';
import { choiceFor, hasKey, keyLooksValid, loadKey } from '../ai/client.js';
import { settingsRows } from './aisettings.js';

const FIELD_HE = {
  age: 'גיל', sex: 'מין', heightCm: 'גובה', weightKg: 'משקל',
  experience: 'ותק', goal: 'מטרה', sport: 'ענף', targetWeightKg: 'משקל יעד',
  daysPerWeek: 'אימונים בשבוע', minutesPerSession: 'דקות לאימון', timeOfDay: 'שעה',
  location: 'מקום', equipment: 'ציוד',
  injuries: 'מגבלות', avoid: 'לא לכלול', medical: 'מצב רפואי',
  sleepHours: 'שינה', stress: 'עומס', commitment: 'התמסרות',
  withPartner: 'אימון משותף', wantsNutrition: 'תזונה', mealsPerDay: 'ארוחות',
  diet: 'העדפות תזונה', allergies: 'אלרגיות',
};

const PLACEHOLDER = 'למשל: בן 34, 178 ומשקל 88. מתאמן בבית עם משקולות יד וגומיות, '
  + 'שלוש פעמים בשבוע בערב. הכתף השמאלית כואבת בכל מה שמעל הראש. '
  + 'רוצה להוריד בטן עד הקיץ, ישן בערך 6 שעות.';

/**
 * Mounts the panel into `host`.
 *
 * @param {HTMLElement} host
 * @param {Object} opts   { onFill(patch), onSkip() }
 */
export function renderQuickstart(host, opts) {
  const o = opts || {};
  /*
   * State lives in an object the CALLER owns, because filling the form redraws
   * the whole step — that is how the new answers reach the controls — and a
   * redraw builds this panel again from nothing. Held locally, the report of
   * what was just filled disappeared at the exact moment it became useful.
   */
  const st = o.state || {};
  if (st.open === undefined) st.open = false;
  if (st.draftText === undefined) st.draftText = '';
  let running = false;
  let controller = null;
  let error = st.error || null;
  let result = st.result || null;

  const box = h('div.quickstart');
  host.appendChild(box);

  function draw() {
    clear(box);

    if (!st.open) {
      box.appendChild(h('div.qsteaser',
        h('div.qstext',
          h('h4', 'לא בא לך למלא טופס?'),
          h('p', 'כתוב על עצמך פסקה אחת חופשית ואמלא את מה שאפשר. '
            + 'תעבור על הכול אחר כך בכל מקרה — זה רק חוסך הקלדה.')),
        h('button.btn', {
          type: 'button',
          onclick: () => { st.open = true; draw(); },
        }, h('span.ico', '✎'), 'כתוב במילים שלך'),
      ));
      return;
    }

    const { provider, model } = choiceFor('text');
    const keyed = hasKey(provider.id) && keyLooksValid(loadKey(provider.id));
    const draftText = st.draftText;

    const area = h('textarea', {
      rows: 5, placeholder: PLACEHOLDER,
      'aria-label': 'תיאור חופשי',
      text: draftText,
      oninput: (e) => {
        st.draftText = e.target.value;
        const btn = box.querySelector('.qsrun');
        if (btn) btn.disabled = running || !keyed || st.draftText.trim().length < 12;
      },
    });

    box.appendChild(h('div.qspanel',
      h('div.qshead',
        h('h4', 'ספר לי על עצמך'),
        h('button.fbtn', {
          type: 'button',
          onclick: () => { st.open = false; st.result = null; result = null; draw(); if (o.onSkip) o.onSkip(); },
        }, 'סגור'),
      ),
      h('p.help',
        'הטקסט הזה נשלח לספק שבחרת ולא לשום מקום אחר. '
        + 'הוא לא נשמר בשרת — אין כזה — והתוצאה נכנסת לשאלון שלמטה כדי שתעבור עליה.'),
      area,
    ));

    for (const row of settingsRows('text', { provider, model }, {
      modelLabel: 'מודל',
      onRedraw: draw,
      onKeyInput: () => {
        const btn = box.querySelector('.qsrun');
        const ok = hasKey(provider.id) && keyLooksValid(loadKey(provider.id));
        if (btn) btn.disabled = running || !ok || st.draftText.trim().length < 12;
      },
    })) box.appendChild(row);

    const bar = h('div.toolbar',
      h('button.btn.primary.qsrun', {
        type: 'button',
        disabled: running || !keyed || draftText.trim().length < 12,
        onclick: () => start(),
      }, h('span.ico', '✦'), running ? 'קורא…' : 'מלא לי את השאלון'),
    );
    if (running) {
      bar.appendChild(h('button.btn.ghost', {
        type: 'button', onclick: () => { if (controller) controller.abort(); },
      }, 'בטל'));
    }
    box.appendChild(bar);

    if (!keyed) box.appendChild(h('p.help', 'הזן מפתח API כדי להפעיל.'));

    if (running) {
      box.appendChild(h('div.scanbusy',
        h('span.spin', { 'aria-hidden': 'true' }),
        h('span', 'קורא את מה שכתבת.')));
    }

    if (error) {
      box.appendChild(h('div.warnbox',
        h('h4', 'לא הצלחתי לקרוא'),
        h('p', error.he || 'משהו השתבש. נסה שוב.'),
        error.detail ? h('p', {
          style: { color: 'var(--dimmer)', fontSize: '12px', fontFamily: 'var(--mono)' },
        }, error.detail) : null));
    }

    if (result && !running) {
      const filled = result.set.map((k) => FIELD_HE[k]).filter(Boolean);
      box.appendChild(h('div.callout.good',
        h('h4', 'מה מילאתי'),
        result.understood ? h('p', result.understood) : null,
        filled.length
          ? h('div.scantags', filled.map((f) => h('span.fact', f)))
          : h('p', 'לא הצלחתי לחלץ שדה אחד בוודאות. תמלא ידנית — זה בסדר.'),
        result.missing.length
          ? h('p', { style: { color: 'var(--dim)', fontSize: '13px' } },
            `לא אמרת, ולכן נשאר בברירת מחדל: ${result.missing.join(', ')}.`)
          : null,
        h('p', { style: { color: 'var(--dimmer)', fontSize: '12.5px' } },
          'הכול למטה ניתן לשינוי. עבור על השאלון — אני יכול לטעות, והמקום לתפוס את זה הוא עכשיו.'),
      ));
    }
  }

  async function start() {
    running = true;
    error = null;
    result = null;
    controller = new AbortController();
    draw();
    announce('קורא את התיאור');

    try {
      const read = await readIntake(st.draftText, { signal: controller.signal });
      running = false;
      controller = null;
      result = read;
      st.result = read;
      st.error = null;
      // onFill redraws the step so the new answers reach the controls; the
      // panel is rebuilt from `st`, so the report below survives that redraw.
      if (o.onFill) o.onFill(read.patch);
      else draw();
      announce(read.set.length ? `מולאו ${read.set.length} שדות` : 'לא מולא שדה');
    } catch (e) {
      running = false;
      controller = null;
      error = e instanceof AiError
        ? e
        : { he: 'משהו השתבש. נסה שוב.', detail: String((e && e.message) || e) };
      if (e && e.kind === 'aborted') error = null;
      st.error = error;
      draw();
      if (error) announce('הקריאה נכשלה');
    }
  }

  draw();
  return { redraw: draw };
}
