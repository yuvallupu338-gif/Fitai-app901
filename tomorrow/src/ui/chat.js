/*
 * chat.js — asking the app about your day.
 *
 * The banner at the top is not a disclaimer somebody made me add. There is no
 * model behind this screen, and the honest version of that fact is more useful
 * than hiding it: the answers come from the same forecast the other screens are
 * drawn from, which is why they quote exact times and exact scores and why they
 * are instant. An app that faked a typing indicator here would be trading the
 * one thing it has — the numbers being real — for the appearance of something
 * it does not have.
 *
 * If an adapter is ever registered, the engine reports mode 'remote' and this
 * screen stops claiming the answers are local. That check is deliberately read
 * at render time rather than baked in.
 */

import { h, qs } from '../core/dom.js';
import { get, pushChat } from '../core/store.js';
import { answer, SUGGESTIONS, mode, hasAdapter } from '../engine/chat.js';
import { card, icon, ICONS } from './parts.js';

export function render(root, ctx) {
  const history = get().chat;

  root.appendChild(h('header.home-head', null,
    h('div', null,
      h('h1', { text: 'לשאול את TomorrowAI' }),
      h('p.sub', { text: 'על מחר, על העומס, על מה כדאי לשנות.' }))));

  root.appendChild(h('div.card.flat.chat-note', null,
    icon(ICONS.spark, { class: 'chat-note-icon' }),
    h('p.card-note', {
      text: hasAdapter()
        ? 'התשובות מגיעות ממודל חיצוני שחובר לאפליקציה.'
        : 'התשובות נבנות כאן במכשיר, מהתחזית עצמה — אין מודל שפה מחובר, ושום דבר לא נשלח החוצה. לכן הן מדויקות במספרים ומוגבלות בניסוח.',
    })));

  const thread = h('div.chat-thread', { role: 'log', 'aria-live': 'polite', 'aria-label': 'שיחה' });
  root.appendChild(thread);

  for (const msg of history) thread.appendChild(bubble(msg.role, msg.text));
  if (!history.length) {
    thread.appendChild(bubble('ai', opener(ctx)));
  }

  const followups = h('div.chip-row.chat-suggest');
  root.appendChild(followups);
  fillSuggestions(followups, SUGGESTIONS.slice(0, 4), ask);

  const input = h('input.input', {
    type: 'text', 'data-t': 'chat-input', autocomplete: 'off',
    placeholder: 'מה תרצה לדעת על מחר?', 'aria-label': 'שאלה',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } },
  });

  root.appendChild(h('form.chat-bar', {
    onsubmit: (e) => { e.preventDefault(); send(); },
  }, input,
  h('button.btn.primary.icon', {
    type: 'submit', 'data-t': 'chat-send', 'aria-label': 'שליחה',
  }, icon('M4 12h14M13 6l6 6-6 6', { weight: '2' }))));

  function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    ask(text);
  }

  function ask(question) {
    thread.appendChild(bubble('user', question));
    pushChat('user', question);

    const reply = answer(question, {
      forecast: ctx.forecast,
      profile: ctx.profile,
      plan: ctx.plan,
      items: ctx.input.items,
      learning: ctx.root.learning,
      history: ctx.input.history,
      insights: ctx.forecast.insights,
      input: ctx.input,
      now: ctx.now,
    });

    thread.appendChild(bubble('ai', reply.text));
    pushChat('ai', reply.text);
    fillSuggestions(followups, reply.followups.length ? reply.followups : SUGGESTIONS.slice(0, 3), ask);
    thread.scrollTop = thread.scrollHeight;
    input.focus();
  }
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

function fillSuggestions(host, list, onPick) {
  host.textContent = '';
  for (const s of list) {
    host.appendChild(h('button.chip', {
      type: 'button', onclick: () => onPick(s),
    }, s));
  }
}
