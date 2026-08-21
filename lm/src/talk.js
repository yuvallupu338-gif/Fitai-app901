/*
 * talk.js — turning a next-character predictor into something you can send a
 * message to.
 *
 * There is no chat model here and no instruction tuning; there is a model that
 * has read three quarters of a million characters, a quarter of which are
 * Hebrew exchanges written in one fixed shape:
 *
 *   ש: how much water should I drink
 *   ת: about two litres, more if you trained today
 *
 * So a conversation is a completion. Write the user's line in the shape the
 * corpus uses, write the two characters that begin an answer, and let the model
 * carry on — it has seen that shape thousands of times and will keep to it.
 * Stop where it starts asking itself the next question.
 *
 * What this cannot do is remember. The model sees twelve characters, so the
 * turn before last is not merely forgotten, it was never visible: by the time
 * it is answering, the beginning of your own sentence is already out of sight.
 * The transcript on screen is for you, not for it, and the page says so rather
 * than letting the layout imply otherwise.
 */

import { generate } from './model.js';

export const ASK = 'ש: ';
export const ANSWER = 'ת: ';

/* Where an answer ends: the next question, a blank line, or a line that starts
 * another kind of block. All three appear in the corpus as the thing that
 * follows an answer, so all three are places the model genuinely tries to go. */
const STOPS = [`\n${ASK.trim()}`, '\n\n', '\n['];

/**
 * One reply to one message.
 *
 * Returns the text, and why it stopped — a reply that ran out of room is a
 * different thing from one the model chose to end, and the interface shows the
 * difference rather than hiding it behind an ellipsis.
 */
export function reply(model, message, { temperature = 0.9, topK = 12, maxChars = 240, rng } = {}) {
  const question = String(message || '').replace(/\s+/g, ' ').trim();
  if (!question) return { text: '', reason: 'empty' };

  /* The leading newline matters: every answer in the corpus follows one, and
   * without it the model is completing the middle of a line instead of the
   * start of one. */
  const prompt = `\n${ASK}${question}\n${ANSWER}`;
  const raw = generate(model, {
    prompt,
    length: maxChars,
    temperature,
    topK,
    rng,
    stop: STOPS,
  });

  let text = raw;
  let reason = 'length';
  for (const marker of STOPS) {
    const at = text.indexOf(marker);
    if (at >= 0) { text = text.slice(0, at); reason = 'turn'; }
  }

  text = text.replace(/\s+$/, '');
  if (!text.trim()) return { text: '', reason: 'nothing' };
  return { text, reason };
}

/** What the model would say to an empty room — used to open the conversation. */
export function greeting(model, opts = {}) {
  return reply(model, 'שלום', opts);
}
