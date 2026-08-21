/*
 * aisettings.js — connecting a model, and being straight about what it costs.
 *
 * Three choices live here and each has a real price the user is entitled to know
 * before paying it, so each is stated on the screen rather than in a tooltip or
 * a document nobody opens.
 *
 * A hosted model costs money per question and sends the day to a company. The
 * privacy control shows the actual text that would leave the device — generated,
 * not described — because somebody deciding whether to send their calendar to a
 * vendor should be able to read the thing rather than trust a summary of it.
 *
 * A local model costs about a gigabyte of download and a GPU, and is markedly
 * less capable. It is free forever after that, which is the whole point.
 *
 * The key is stored in this browser in plain text on an origin shared with the
 * other apps in this repository. That sentence is on the screen. It is not
 * softened, because the alternative to saying it is somebody assuming otherwise.
 */

import { h, sheet, announce } from '../core/dom.js';
import { get, apiKey, setApiKey, update } from '../core/store.js';
import { PROVIDERS, providerById } from '../ai/providers.js';
import { testConnection } from '../ai/client.js';
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL, modelById, currentModel, isLoaded } from '../ai/localmodels.js';
import { capability, load, unload, deleteWeights } from '../ai/local.js';
import { contextBlock } from '../ai/context.js';
import { icon, ICONS } from './parts.js';

export function openAiSettings(ctx) {
  const body = h('div.stack', { 'data-t': 'ai-settings' });
  const close = sheet(body, { title: 'מודל שפה' });
  paint();
  return close;

  function settings() {
    return Object.assign({ enabled: false, providerId: '', model: '', baseUrl: '', share: 'summary' },
      (get().settings && get().settings.ai) || {});
  }

  function save(patch) {
    update((root) => {
      root.settings.ai = Object.assign({}, root.settings.ai, patch);
    });
    paint();
  }

  function paint() {
    const s = settings();
    body.textContent = '';

    body.appendChild(h('p.card-note', {
      text: 'האפליקציה עובדת במלואה בלי זה. הציון, עקומות האנרגיה והריכוז, הסיכונים וההמלצות מחושבים כאן במכשיר בכל מקרה — מודל מוסיף ניסוח ותשובות לשאלות פתוחות, ולא יותר.',
    }));

    body.appendChild(choice(s));
    if (s.enabled && s.providerId === 'local') body.appendChild(localSection(s));
    else if (s.enabled && s.providerId) body.appendChild(hostedSection(s));
  }

  /* ---------------------------------------------------------------- *
   * Which engine
   * ---------------------------------------------------------------- */

  function choice(s) {
    const options = [
      { id: '', label: 'מקומי בלבד', note: 'מנוע החוקים עונה על הכול. מיידי, בחינם, בלי רשת.' },
      { id: 'local', label: 'מודל על המכשיר', note: 'Qwen2.5 שרץ בדפדפן. בלי מפתח ובלי מכסה, אחרי הורדה של כג׳יגה.' },
      { id: 'hosted', label: 'מודל מתארח', note: 'החכם ביותר. דורש מפתח API, ועולה כסף לפי שימוש.' },
    ];
    const current = !s.enabled ? '' : (s.providerId === 'local' ? 'local' : 'hosted');

    return h('div.field', { 'data-t': 'ai-enable' },
      h('span.label', { text: 'מי עונה' }),
      h('div.list', null, options.map((o) => h('button.list-row.pick', {
        type: 'button',
        'aria-pressed': current === o.id ? 'true' : 'false',
        onclick: () => {
          if (o.id === '') save({ enabled: false });
          else if (o.id === 'local') {
            save({ enabled: true, providerId: 'local', model: s.model && currentModel() ? s.model : DEFAULT_LOCAL_MODEL });
          } else {
            const first = PROVIDERS[0];
            save({
              enabled: true,
              providerId: s.providerId && s.providerId !== 'local' ? s.providerId : first.id,
              model: s.providerId && s.providerId !== 'local' ? s.model : (first.suggestions[0] || ''),
            });
          }
        },
      },
      h('div.list-body', null,
        h('span.list-title', { text: o.label }),
        h('span.list-meta', { text: o.note }))))));
  }

  /* ---------------------------------------------------------------- *
   * On the device
   * ---------------------------------------------------------------- */

  function localSection(s) {
    const wrap = h('div.stack');

    wrap.appendChild(h('p.card-note', {
      text: 'המודל רץ בכרטיס הגרפי שלך. אחרי ההורדה הראשונה אין מפתח, אין מכסה, אין עלות ואין רשת — וזה מודל קטן, אז הוא פחות חכם מכל מודל מתארח.',
    }));

    /*
     * The capability report is fetched and shown before anything can be
     * downloaded. Finding out a device cannot run this after a gigabyte is the
     * failure worth spending a round trip to avoid.
     */
    const status = h('p.card-note', { text: 'בודק את הדפדפן…' });
    wrap.appendChild(status);

    const models = h('div.stack.tight');
    const progress = h('p.card-note', { hidden: true });
    const action = h('div.row.wrap');
    wrap.appendChild(models);
    wrap.appendChild(progress);
    wrap.appendChild(action);

    capability().then((can) => {
      status.textContent = can.detail;
      status.className = can.ok ? 'card-note' : 'card-note warn';
      if (!can.ok) {
        /*
         * A device that cannot run it is told what to do instead, not left with
         * a dead screen and a switch it already flipped.
         */
        action.appendChild(h('p.card-note', {
          text: 'אפשר להישאר על המנוע המקומי, שעובד בכל דפדפן, או לחבר מודל מתארח.',
        }));
        return;
      }
      fillModels();
    });

    function fillModels() {
      models.textContent = '';
      models.appendChild(h('span.label', { text: 'איזה מודל' }));
      const rows = h('div.list');
      models.appendChild(rows);
      for (const m of LOCAL_MODELS) {
        const resident = currentModel() === m.id;
        rows.appendChild(h('button.list-row.pick', {
          type: 'button', 'data-t': 'ai-model',
          'aria-pressed': s.model === m.id ? 'true' : 'false',
          onclick: () => save({ model: m.id }),
        },
        h('div.list-body', null,
          h('span.list-title', { text: `${m.label}${resident ? ' · טעון' : ''}` }),
          h('span.list-meta', { text: `${m.note} כ-${(m.vramMb / 1024).toFixed(1)} ג׳יגה בכרטיס.` }))));
      }

      action.textContent = '';

      /*
       * The warning is in front of the button, not behind it.
       *
       * This is the only control in the app that can take a machine down. It
       * loads a model onto the graphics card, and a card without room for it
       * does not report an error — the driver resets, and on Windows that takes
       * the desktop with it. Somebody who has just had that happen deserved to
       * have been told first, in the same breath as the button.
       */
      const chosen = modelById(s.model) || modelById(DEFAULT_LOCAL_MODEL);
      action.appendChild(h('p.card-note.warn', {
        text: `לפני שמתחילים: זה מוריד כ-${(chosen.vramMb / 1024).toFixed(1)} ג׳יגה וטוען אותם לכרטיס הגרפי. אם אין מספיק מקום בכרטיס, הדפדפן עלול להיתקע ובמקרים מסוימים המסך נתקע לרגע או שהמחשב מאט מאוד. אם זה קורה — לסגור את הלשונית, וכאן יש כפתור למחוק את מה שירד.`,
      }));

      action.appendChild(h('button.btn.primary', {
        type: 'button', 'data-t': 'ai-test',
        onclick: () => download(s.model || DEFAULT_LOCAL_MODEL),
      }, icon(ICONS.spark), isLoaded() ? 'לטעון מחדש' : 'הבנתי — להוריד ולהפעיל'));

      if (isLoaded()) {
        action.appendChild(h('button.btn.quiet', {
          type: 'button',
          onclick: async () => { await unload(); paint(); },
        }, 'לפנות מהזיכרון'));
      }

      action.appendChild(h('button.btn.quiet.danger', {
        type: 'button', 'data-t': 'ai-delete',
        onclick: async () => {
          progress.hidden = false;
          progress.className = 'card-note';
          progress.textContent = 'מוחק…';
          try {
            await deleteWeights(s.model || DEFAULT_LOCAL_MODEL);
            progress.textContent = 'הקבצים נמחקו מהמכשיר.';
          } catch (e) {
            progress.className = 'card-note warn';
            progress.textContent = e && e.detail ? e.detail : String((e && e.message) || e);
          }
          paint();
        },
      }, 'למחוק את הקבצים שירדו'));
    }

    async function download(id) {
      progress.hidden = false;
      progress.textContent = 'מתחיל…';
      try {
        await load(id, (report) => {
          /*
           * The library's own numbers, unembellished. This wait is minutes long
           * on a first run and a made-up progress bar would be noticed.
           */
          const pct = Math.round((report.progress || 0) * 100);
          progress.textContent = report.text ? `${report.text} (${pct}%)` : `${pct}%`;
        });
        progress.textContent = 'המודל טעון ומוכן.';
        announce('המודל המקומי מוכן');
        paint();
      } catch (e) {
        progress.className = 'card-note warn';
        progress.textContent = e && e.detail ? e.detail : String((e && e.message) || e);
      }
    }

    return wrap;
  }

  /* ---------------------------------------------------------------- *
   * Hosted
   * ---------------------------------------------------------------- */

  function hostedSection(s) {
    const wrap = h('div.stack');
    const provider = providerById(s.providerId) || PROVIDERS[0];

    wrap.appendChild(h('div.field', { 'data-t': 'ai-provider' },
      h('span.label', { text: 'ספק' }),
      h('div.chip-row', null, PROVIDERS.map((p) => h('button.chip', {
        type: 'button',
        class: p.id === s.providerId ? 'chip is-on' : 'chip',
        'aria-pressed': p.id === s.providerId ? 'true' : 'false',
        onclick: () => save({ providerId: p.id, model: p.suggestions[0] || '' }),
      }, p.label)))));

    /*
     * Free text, not a menu. Vendors rename and retire model ids constantly, so
     * a fixed list is wrong within weeks and wrong in a way nobody can work
     * around. The chips fill the field; whatever is in the field is what gets
     * sent.
     */
    const modelInput = h('input.input', {
      type: 'text', 'data-t': 'ai-model', value: s.model || '',
      placeholder: provider.suggestions[0] || 'מזהה המודל',
      autocomplete: 'off', spellcheck: 'false', dir: 'ltr',
      onchange: (e) => save({ model: e.target.value.trim() }),
    });

    wrap.appendChild(h('label.field', null,
      h('span.label', { text: 'מזהה המודל' }),
      modelInput,
      provider.suggestions.length
        ? h('div.chip-row', null, provider.suggestions.map((sug) => h('button.chip', {
          type: 'button',
          onclick: () => { modelInput.value = sug; save({ model: sug }); },
        }, sug)))
        : null,
      h('span.field-hint', {
        text: 'שדה חופשי בכוונה — ספקים משנים מזהי מודלים כל הזמן. אם המזהה שגוי, בדיקת החיבור תגיד בדיוק את זה.',
      })));

    if (provider.id === 'custom') {
      wrap.appendChild(h('label.field', null,
        h('span.label', { text: 'כתובת בסיס' }),
        h('input.input', {
          type: 'url', value: s.baseUrl || '', dir: 'ltr', placeholder: 'https://…/v1/chat/completions',
          onchange: (e) => save({ baseUrl: e.target.value.trim() }),
        }),
        h('span.field-hint.warn', {
          text: 'מארח שלא מופיע ב-connect-src של הדף ייחסם על ידי הדפדפן. השורה לשינוי היא ה-Content-Security-Policy בקובץ tomorrow/index.html.',
        })));
    }

    wrap.appendChild(keyField(provider));
    wrap.appendChild(testRow(s));
    wrap.appendChild(shareField(s));
    return wrap;
  }

  function keyField(provider) {
    const input = h('input.input', {
      type: 'password', 'data-t': 'ai-key', value: apiKey(), dir: 'ltr',
      placeholder: provider.keyHint || 'המפתח שלך', autocomplete: 'off', spellcheck: 'false',
      onchange: (e) => { setApiKey(e.target.value); },
    });

    return h('div.field', null,
      h('span.label', { text: 'מפתח API' }),
      h('div.row', null, input,
        h('button.btn.quiet', {
          type: 'button', 'aria-label': 'להציג את המפתח',
          onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; },
        }, 'הצג')),
      /*
       * Said plainly, and not softened. The alternative to this sentence is
       * somebody assuming the key is protected by something.
       */
      h('span.field-hint.warn', {
        text: 'המפתח נשמר בדפדפן הזה כטקסט גלוי, על אותו origin כמו שאר האפליקציות במאגר — כל דבר שיכול להריץ סקריפט כאן יכול לקרוא אותו. הוא לא נכנס לקובץ הגיבוי, ולעולם לא נשלח לשום מקום חוץ מהספק שבחרת.',
      }));
  }

  function testRow(s) {
    const result = h('p.card-note', { 'data-t': 'ai-test-result', hidden: true });
    const button = h('button.btn', {
      type: 'button', 'data-t': 'ai-test',
      onclick: async () => {
        button.disabled = true;
        result.hidden = false;
        result.className = 'card-note';
        result.textContent = 'בודק…';
        const out = await testConnection(s, apiKey());
        result.className = out.ok ? 'card-note good' : 'card-note warn';
        result.textContent = out.detail;
        button.disabled = false;
      },
    }, icon(ICONS.spark), 'בדיקת חיבור');

    return h('div.stack.tight', null, button, result);
  }

  /* ---------------------------------------------------------------- *
   * What leaves the device
   * ---------------------------------------------------------------- */

  function shareField(s) {
    const preview = h('pre.code-preview', { 'data-t': 'ai-preview', hidden: true, dir: 'rtl' });

    const options = [
      { id: 'summary', label: 'צורת היום בלבד', note: 'ציון, אנרגיה, ריכוז, סיכונים וזמנים — בלי שמות של פריטים.' },
      { id: 'full', label: 'כולל הלוח', note: 'גם מה כתוב בכל פריט. תשובות טובות יותר, יותר מידע שיוצא.' },
    ];

    const buttons = h('div.list', null, options.map((o) => h('button.list-row.pick', {
      type: 'button', 'data-t': 'ai-share',
      'aria-pressed': (s.share || 'summary') === o.id ? 'true' : 'false',
      onclick: () => save({ share: o.id }),
    },
    h('div.list-body', null,
      h('span.list-title', { text: o.label }),
      h('span.list-meta', { text: o.note })))));

    return h('div.field', null,
      h('span.label', { text: 'מה נשלח למודל' }),
      buttons,
      h('button.btn.quiet', {
        type: 'button',
        onclick: () => {
          if (!preview.hidden) { preview.hidden = true; return; }
          /*
           * The real text, generated by the same function that builds the
           * request — not a description of it. Somebody deciding whether to send
           * their calendar to a company should be able to read the thing.
           */
          preview.textContent = contextBlock({
            forecast: ctx.forecast, profile: ctx.profile, plan: ctx.plan,
            items: ctx.input.items, learning: ctx.root.learning,
            insights: ctx.forecast.insights, now: ctx.now, input: ctx.input,
          }, s.share || 'summary');
          preview.hidden = false;
        },
      }, 'להראות בדיוק מה נשלח'),
      preview);
  }
}
