/*
 * quickstart.js — "תכתוב, ואני ארכיב" — the screen the app opens on.
 *
 * Fifteen questions per work is the honest way to build a portfolio and the
 * reason somebody fills in one work and never comes back. This screen asks for
 * three things nobody hesitates on — a name, a phone number, an address if
 * there is one — and then for one paragraph about what they have done, and
 * turns that into the works.
 *
 * It fills the form and then gets out of the way. It does not export, it does
 * not skip the editor, and it does not hide what it did: every work it made is
 * named on the screen, what it could not fill is named too, and undoing the
 * whole thing is one button for as long as the report is up. A model that fills
 * a document the person never opens is a model whose mistakes get emailed to an
 * employer.
 *
 * Two readers sit behind the one button. With a key, a language model reads the
 * prose. Without one — which is most people — a list of rules splits it by line
 * and pulls out years, tools and the handful of words that say what a thing is.
 * The screen says which of the two ran, because they are not equally good and
 * pretending otherwise is how somebody ends up trusting the wrong one.
 */

import { h, clear, announce } from '../../../src/core/dom.js';
import { choiceFor, hasKey } from '../../../src/ai/client.js';
import { settingsRows } from '../../../src/ui/aisettings.js';
import * as store from '../core/store.js';
import { readWorks, AiError } from '../ai/read.js';
import { readOffline } from '../ai/offline.js';
import { countPhrase } from '../engine/write.js';
import { field, textInput, textArea } from './fields.js';
import { paintSaveError } from './savewarn.js';

const SAVE_DELAY = 400;

const PLACEHOLDER = 'למשל:\n'
  + 'עיצבתי ובניתי אתר למספרה של רון ב-2024, לבד, בפיגמה ו-HTML. '
  + 'הם לא היו באינטרנט בכלל וחיפשו אותם לפי טלפון.\n'
  + 'אפליקציית מתכונים לעצמי, התחלתי ב-2023 ועדיין עובד עליה.\n'
  + 'מיתוג לכנס נגישות בעבודה, בין 2019 ל-2021, הובלתי צוות של שניים.';

export function renderQuickstart(root, opts) {
  const o = opts || {};
  const view = h('section');
  root.appendChild(view);

  const draft = Object.assign({}, store.get().owner);
  let timer = null;
  let text = '';
  let running = false;
  let controller = null;
  let error = null;
  let report = null;

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    store.setOwner(draft);
    paintSaveError(errorBox, store.saveError());
  }

  function touch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  }

  const errorBox = h('div');
  const resultBox = h('div');
  const busyBox = h('div');

  /* ---- the three details, which are the ones people know by heart ---- */

  const details = h('div.formcard', [
    field('איך קוראים לך', textInput(draft.name, (v) => { draft.name = v; touch(); }, {
      maxlength: '80', placeholder: 'שם מלא',
    }), 'זה מה שיופיע בראש הקובץ.'),
    field('טלפון', textInput(draft.phone, (v) => { draft.phone = v; touch(); }, {
      maxlength: '40', dir: 'ltr', placeholder: '050-0000000',
    }), null),
    field('אתר או פרופיל, אם יש', textInput(draft.site, (v) => { draft.site = v; touch(); }, {
      maxlength: '300', dir: 'ltr', placeholder: 'linkedin.com/in/…',
    }), 'לא חובה. אפשר גם לינקדאין, בהאנס או גיטהאב.'),
  ]);

  /* ---- the paragraph ---- */

  const box = textArea('', (v) => { text = v; }, {
    rows: 9,
    maxlength: '6000',
    placeholder: PLACEHOLDER,
  });

  const writing = h('div.formcard', [
    field('מה עשית?', box,
      'שורה לכל עבודה. מה זה היה, בשביל מי, מתי, ומה יצא מזה — במילים שלך.'),
  ]);

  /* ---- the model, which is optional and says so ---- */

  const settings = h('details.aibox', [
    h('summary', 'מודל שפה (לא חובה)'),
    h('div.aiinner'),
  ]);

  function paintSettings() {
    const inner = settings.querySelector('.aiinner');
    clear(inner);
    const choice = choiceFor('text');
    inner.appendChild(h('p.help',
      'בלי מודל אני מחלקת את הטקסט לפי שורות ומוציאה ממנו שנים, כלים וסוג עבודה — '
      + 'בלי לנחש מה לא כתוב. עם מודל, הוא קורא את הפסקה ומפרק אותה לבד, וגם מבין '
      + 'שלושה משפטים שמדברים על אותה עבודה.'));
    inner.appendChild(h('p.help.warnline',
      'מה שנשלח: רק הפסקה שכתבת, לספק שבחרת. השם, הטלפון, התמונות ושאר התיק לא נשלחים לשום מקום.'));
    for (const row of settingsRows('text', choice, { onRedraw: paintSettings, onKeyInput: paintSettings })) {
      inner.appendChild(row);
    }
  }

  /* ---- the run ---- */

  async function run(useModel) {
    if (running) return;
    error = null;
    report = null;
    running = true;
    controller = useModel ? new AbortController() : null;
    paintBusy();
    flush();

    try {
      const reading = useModel
        ? await readWorks(text, { signal: controller.signal })
        : readOffline(text);
      apply(reading, useModel);
    } catch (e) {
      error = e instanceof AiError ? e : new AiError('unknown', 'משהו נשבר בקריאה. נסו שוב.', String(e));
      console.error(e);
    } finally {
      running = false;
      controller = null;
      paintBusy();
      paintResult();
    }
  }

  /*
   * The works land in the store, and the report holds their ids — which is what
   * makes "בטל" a real undo rather than a promise. The person is one button
   * from having their portfolio back exactly as it was.
   */
  function apply(reading, byModel) {
    const added = [];
    for (const w of reading.works) added.push(store.addWork(w).id);
    if (reading.headline && !draft.headline) {
      draft.headline = reading.headline;
      flush();
    }
    report = {
      byModel,
      added,
      titles: reading.works.map((w) => w.title),
      dropped: reading.dropped,
      missing: reading.missing,
      oneBlock: !!reading.oneBlock,
    };
    paintSaveError(errorBox, store.saveError());
    announce(added.length
      ? countPhrase(added.length, 'עבודה', 'עבודות', 'f') + ' נוספו'
      : 'לא נמצאו עבודות בטקסט');
  }

  function undo() {
    if (!report) return;
    for (const id of report.added) store.removeWork(id);
    announce('ההוספה בוטלה');
    report = null;
    paintResult();
  }

  function paintBusy() {
    clear(busyBox);
    if (!running) return;
    busyBox.appendChild(h('div.callout', [
      h('p', 'קוראת את מה שכתבת…'),
      controller
        ? h('button.btn.ghost', { onclick: () => controller.abort() }, 'ביטול')
        : null,
    ]));
  }

  function paintResult() {
    clear(resultBox);

    if (error) {
      resultBox.appendChild(h('div.warnbox.hot', [
        h('b', error.he || 'משהו נשבר.'),
        error.detail ? h('p.help', String(error.detail).slice(0, 300)) : null,
      ]));
      /* The offline path is right there and needs nothing, so it is offered at
       * the moment the model failed rather than left to be discovered. */
      resultBox.appendChild(h('div.toolbar', [
        h('button.btn', { onclick: () => run(false) }, 'תחלקי בלי מודל'),
      ]));
      return;
    }

    if (!report) return;

    if (!report.added.length) {
      resultBox.appendChild(h('div.warnbox', 'לא מצאתי בטקסט עבודה עם שם. כתבו שורה לכל עבודה, '
        + 'ותתחילו בשם של הדבר עצמו — "אתר למספרה", "אפליקציית מתכונים".'));
      return;
    }

    const lines = [
      h('p.eyebrow', report.byModel ? 'המודל קרא' : 'חילקתי לפי הכללים, בלי מודל'),
      h('h3', report.titles.length === 1
        ? 'עבודה אחת נכנסה לתיק'
        : countPhrase(report.titles.length, 'עבודה', 'עבודות', 'f') + ' נכנסו לתיק'),
      h('ol.readlist', report.titles.map((t) => h('li', t))),
    ];
    if (report.oneBlock) {
      lines.push(h('p.help', 'הכול היה שורה אחת, אז זו עבודה אחת. '
        + 'אם היו כאן כמה — לחצו Enter ביניהן ותנו לי לחלק שוב.'));
    }
    if (report.dropped) {
      /* "1 שורות" is the shape of a number printed by a program. The numeral
       * and the verb both decline, so both are written out. */
      lines.push(h('p.help', report.dropped === 1
        ? 'שורה אחת לא נכנסה, כי לא היה בה שם לעבודה.'
        : countPhrase(report.dropped, 'שורה', 'שורות', 'f') + ' לא נכנסו, כי לא היה בהן שם לעבודה.'));
    }
    if (report.missing.length) {
      lines.push(h('p.lead', 'מה שלא מילאתי: ' + report.missing.join(', ') + '. '
        + 'זה נכנס בעריכה, וההסבר ייכתב גם בלי זה.'));
    }
    lines.push(h('div.toolbar', [
      h('button.btn.primary', { onclick: () => o.onDone && o.onDone() }, 'לעבודות — לעבור עליהן ←'),
      h('button.btn.ghost', { onclick: undo }, 'בטל את ההוספה'),
    ]));
    resultBox.appendChild(h('div.callout.good', lines));
  }

  /* ---- layout ---- */

  view.appendChild(h('div.formcard.leadcard', [
    h('p.eyebrow', 'הדרך הקצרה'),
    h('h3', 'תכתבו בשורות, ואני ארכיב'),
    h('p.help', 'שלוש שאלות ופסקה אחת. אחר כך אפשר לעבור על מה שיצא, לתקן, להוסיף תמונות — '
      + 'או פשוט להוריד את הקובץ.'),
  ]));
  view.appendChild(errorBox);
  view.appendChild(details);
  view.appendChild(writing);
  view.appendChild(settings);
  paintSettings();

  view.appendChild(h('div.toolbar', [
    h('button.btn.primary.lg', {
      onclick: () => run(hasKey(choiceFor('text').provider ? choiceFor('text').provider.id : '')),
    }, 'תרכיב לי את התיק'),
    h('button.btn.ghost', { onclick: () => run(false) }, 'בלי מודל'),
    h('button.btn.ghost', { onclick: () => o.onDone && o.onDone() }, 'אמלא ידנית'),
  ]));
  view.appendChild(busyBox);
  view.appendChild(resultBox);

  const onHide = () => flush();
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);

  return {
    redraw: paintResult,
    flush,
    release: () => {
      if (controller) controller.abort();
      flush();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    },
  };
}
