/*
 * chat.js — asking the app about your day.
 *
 * Two engines answer here and the badge at the top always says which one just
 * did. That is not a disclaimer somebody made me add; it is the only way a
 * reader can calibrate what they are looking at. An answer from the rule engine
 * quotes the exact score off the forecast beside it and arrives instantly. An
 * answer from a model is better phrased and is a model's answer, with whatever
 * that implies. Collapsing the two into one anonymous voice would trade the one
 * thing this app has — its numbers being real — for the appearance of being
 * cleverer than it is.
 *
 * Which engine gets a question is decided in ai/router.js, and the short version
 * is that the rule engine answers everything the app actually knows. See the
 * comment there; it is a product decision, not a fallback arrangement.
 *
 * Nothing here fakes anything. When a model streams, the text appears as it
 * comes off the socket. When it does not, there is a plain waiting state rather
 * than an animation implying tokens are arriving. When a call fails, the reply
 * says so and is labelled as the local engine's.
 */

import { h } from '../core/dom.js';
import { get, pushChat, apiKey } from '../core/store.js';
import { answer, SUGGESTIONS } from '../engine/chat.js';
import { respond, remoteAvailable } from '../ai/router.js';
import { providerById } from '../ai/providers.js';
import { modelById, currentModel, isLoaded } from '../ai/localmodels.js';
import { ask as askLocalModel } from '../ai/local.js';
import { card, icon, ICONS } from './parts.js';
import { openAiSettings } from './aisettings.js';

export function render(root, ctx) {
  const history = get().chat;
  const settings = (get().settings && get().settings.ai) || {};

  /*
   * Which engine is live, decided once per render. The local model counts only
   * when it is actually resident — a question is not the moment to start a
   * gigabyte download, so an unloaded one is treated as absent and the rule
   * engine answers everything.
   */
  const kind = remoteAvailable(settings, apiKey(), {
    enabled: settings.providerId === 'local' && settings.enabled,
    loaded: isLoaded(),
  });

  root.appendChild(h('header.home-head', null,
    h('div', null,
      h('h1', { text: 'לשאול את TomorrowAI' }),
      h('p.sub', { text: 'על מחר, על העומס, על מה כדאי לשנות.' }))));

  root.appendChild(modeBanner(ctx, kind, settings));

  const thread = h('div.chat-thread', { role: 'log', 'aria-live': 'polite', 'aria-label': 'שיחה' });
  root.appendChild(thread);

  for (const msg of history) thread.appendChild(bubble(msg.role, msg.text));
  if (!history.length) thread.appendChild(bubble('ai', opener(ctx)));

  const followups = h('div.chip-row.chat-suggest');
  root.appendChild(followups);
  fillSuggestions(SUGGESTIONS.slice(0, 4));

  const input = h('input.input', {
    type: 'text', 'data-t': 'chat-input', autocomplete: 'off',
    placeholder: 'מה תרצה לדעת על מחר?', 'aria-label': 'שאלה',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } },
  });

  const sendBtn = h('button.btn.primary.icon', {
    type: 'submit', 'data-t': 'chat-send', 'aria-label': 'שליחה',
    /*
     * The arrow is flipped because an inline SVG is not mirrored by dir="rtl" —
     * only text is. Drawn as-is it points right, which in Hebrew is the
     * direction you came from, so the send button read as a back button.
     */
  }, icon('M4 12h14M13 6l6 6-6 6', { weight: '2', class: 'flip' }));

  const stopBtn = h('button.btn.icon.chat-stop', {
    type: 'button', 'data-t': 'chat-stop', 'aria-label': 'להפסיק', hidden: true,
    onclick: () => { if (inflight) inflight.abort(); },
  }, icon('M7 7h10v10H7z', { weight: '2' }));

  root.appendChild(h('form.chat-bar', {
    onsubmit: (e) => { e.preventDefault(); send(); },
  }, input, stopBtn, sendBtn));

  let inflight = null;

  function send() {
    const text = input.value.trim();
    if (!text || inflight) return;
    input.value = '';
    ask(text);
  }

  function contextFor() {
    return {
      forecast: ctx.forecast,
      profile: ctx.profile,
      plan: ctx.plan,
      items: ctx.input.items,
      learning: ctx.root.learning,
      history: ctx.input.history,
      insights: ctx.forecast.insights,
      input: ctx.input,
      now: ctx.now,
    };
  }

  async function ask(question) {
    if (inflight) return;

    thread.appendChild(bubble('user', question));
    pushChat('user', question);
    thread.scrollTop = thread.scrollHeight;

    /*
     * The local engine answers synchronously, so the common case never shows a
     * waiting state at all — putting one up for four milliseconds would be
     * inventing latency to look busy.
     */
    if (!kind) {
      const reply = answer(question, contextFor());
      finish(reply.text, reply.followups, '');
      return;
    }

    const controller = new AbortController();
    inflight = controller;
    stopBtn.hidden = false;
    sendBtn.disabled = true;
    input.disabled = true;

    const pending = bubble('ai', '');
    const body = pending.querySelector('p');
    pending.classList.add('is-streaming');
    thread.appendChild(pending);

    /*
     * A waiting note, replaced by the first token. It says which model is being
     * waited on rather than "thinking", because on a local model the honest
     * answer to "why is this slow" is the name of the thing doing the work.
     */
    const waiting = h('span.chat-waiting', { text: waitingText(kind, settings) });
    body.appendChild(waiting);

    let streamed = false;
    try {
      const out = await respond(question, contextFor(), {
        remoteKind: kind,
        history,
        share: settings.share || 'summary',
        signal: controller.signal,
        localModelAsk: kind === 'local-model' ? localAsk : null,
        onDelta: (piece) => {
          if (!streamed) { waiting.remove(); streamed = true; }
          body.textContent += piece;
          thread.scrollTop = thread.scrollHeight;
        },
      });

      pending.remove();

      if (out.engine === 'aborted') {
        // Nothing was withdrawn from the user; they withdrew the question.
        if (body.textContent.trim()) finish(body.textContent.trim(), [], 'הפסקתי באמצע.');
        else clearBusy();
        return;
      }

      finish(out.text, out.followups, out.note);
    } catch (e) {
      pending.remove();
      const reply = answer(question, contextFor());
      finish(reply.text, reply.followups,
        `משהו נכשל בדרך למודל: ${String((e && e.message) || e).slice(0, 120)} התשובה למטה היא של המנוע המקומי.`);
    }
  }

  function clearBusy() {
    inflight = null;
    stopBtn.hidden = true;
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }

  /* `next` rather than `followups`: the outer name is the element these go
   * into, and shadowing it here made the helper below read as a bug. */
  function finish(text, next, note) {
    if (note) thread.appendChild(h('p.chat-note-line', { 'data-t': 'chat-note', text: note }));
    if (text) {
      thread.appendChild(bubble('ai', text));
      pushChat('ai', text);
    }
    fillSuggestions(next && next.length ? next : SUGGESTIONS.slice(0, 3));
    thread.scrollTop = thread.scrollHeight;
    clearBusy();
  }

  function fillSuggestions(list) {
    followups.textContent = '';
    for (const sug of list) {
      followups.appendChild(h('button.chip', { type: 'button', onclick: () => ask(sug) }, sug));
    }
  }

  /*
   * A plain import. local.js is small — the six-and-a-half megabyte library it
   * drives sits behind an import() inside it, so the served app fetches that
   * only when somebody switches a model on, and the single-file build inlines
   * it so a downloaded copy can run one with nothing else beside it.
   */
  function localAsk(req, onDelta, signal) {
    return askLocalModel(Object.assign({ model: currentModel() }, req), onDelta, signal);
  }
}

/*
 * The badge, and the way into the settings.
 *
 * It names the model rather than saying "connected", because "which model" is
 * the question somebody actually has when an answer surprises them.
 */
function modeBanner(ctx, kind, settings) {
  let text;
  if (kind === 'local-model') {
    const m = modelById(currentModel());
    text = `${m ? m.label : currentModel()} רץ על המכשיר הזה. שאלות שהאפליקציה יודעת לענות עליהן נענות מיד מהתחזית; השאר הולך למודל.`;
  } else if (kind === 'hosted') {
    const p = providerById(settings.providerId);
    text = `${settings.model} דרך ${p ? p.label : settings.providerId}. שאלות על הציון, העומס והזמנים נענות מקומית מהתחזית; שאלות פתוחות נשלחות למודל.`;
  } else {
    text = 'התשובות נבנות כאן במכשיר, מהתחזית עצמה — אין מודל מחובר, ושום דבר לא נשלח החוצה. לכן הן מדויקות במספרים ומוגבלות בניסוח.';
  }

  return h('div.card.flat.chat-note', { 'data-t': 'chat-mode' },
    icon(ICONS.spark, { class: 'chat-note-icon' }),
    h('p.card-note', { text }),
    h('button.btn.quiet.chat-mode-edit', {
      type: 'button', onclick: () => openAiSettings(ctx),
    }, kind ? 'שינוי' : 'לחבר מודל'));
}

function waitingText(kind, settings) {
  if (kind === 'local-model') {
    const m = modelById(currentModel());
    return `${m ? m.label : 'המודל המקומי'} חושב…`;
  }
  return `${settings.model || 'המודל'} חושב…`;
}

function opener(ctx) {
  const f = ctx.forecast;
  return `מחר עומד על ${f.score} מתוך 100. אפשר לשאול אותי למה, מה כדאי לשנות, או מתי לעשות את הדבר הקשה ביותר.`;
}

function bubble(role, text) {
  return h('div', {
    class: `chat-msg ${role === 'user' ? 'from-user' : 'from-ai'}`,
    'data-t': 'chat-message',
  }, h('p', { text }));
}


