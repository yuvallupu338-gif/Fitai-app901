/*
 * router.js — which engine answers.
 *
 * Two engines, and the order between them is the whole design. The local rule
 * engine goes first on everything it recognises, and a model only sees what it
 * did not.
 *
 * That order is not a fallback arrangement, it is the better one. Asked how
 * tomorrow looks, the rule engine reads the score off the forecast that is on
 * screen; a language model given the same forecast would paraphrase it, more
 * slowly, and occasionally with a digit changed. Asked to find an hour for a
 * project, the rule engine runs the scheduler and returns a slot that satisfies
 * every constraint in Contracts §7; a model would suggest a time. For anything
 * the app actually knows, a model is a worse answer wearing better clothes.
 *
 * What a model is genuinely better at is everything else: the question phrased
 * sideways, the follow-up that assumes the previous answer, the request for
 * advice the rule engine has no rule for. So it gets those, and nothing else —
 * which also happens to make it cheap, because most questions never reach it.
 *
 * The route taken is reported, always, and the chat shows it. A person who
 * cannot tell which engine answered cannot calibrate how much to trust the
 * answer, and this app's whole argument is that its numbers are worth trusting.
 */

import { answer as localAnswer } from '../engine/chat.js';
import { isConfigured, ask as remoteAsk, ChatError } from './client.js';
import { systemPrompt, contextBlock } from './context.js';

/*
 * How many turns of history a model is given.
 *
 * Enough that "and what about Thursday?" resolves, small enough that a long
 * evening of chat does not quietly become an expensive request. Counted in
 * turns rather than tokens because it is the unit the failure is measured in:
 * one turn too few and a follow-up loses its subject.
 */
const HISTORY_TURNS = 6;

/**
 * Where a question should go, without sending it anywhere.
 *
 * Separated from asking so the chat can decide what to show *before* it starts —
 * a streaming bubble for a model, an immediate answer for the local engine — and
 * so this decision is testable without a network.
 */
export function route(question, ctx, options) {
  const o = options || {};
  const local = localAnswer(question, ctx);

  if (local.kind !== 'unknown') {
    return { engine: 'local', local, reason: `the local engine recognised this as "${local.kind}"` };
  }
  if (!o.remoteAvailable) {
    return { engine: 'local', local, reason: 'no model is connected, so the local engine answers anyway' };
  }
  return { engine: 'remote', local, reason: 'the local engine did not recognise the question' };
}

/**
 * Whether a model could be reached at all right now.
 *
 * The local model counts as available only once it is actually loaded. A
 * question is not the moment to start a gigabyte download — the settings screen
 * is, deliberately and with the user watching — so an unloaded local model is
 * treated as absent and the rule engine answers.
 */
export function remoteAvailable(settings, key, localState) {
  if (localState && localState.enabled && localState.loaded) return 'local-model';
  if (isConfigured(settings, key)) return 'hosted';
  return '';
}

/**
 * Answer one question, from whichever engine should answer it.
 *
 * `deps.localModelAsk` is injected rather than imported so this module stays
 * loadable — and testable — without the six-megabyte model library coming with
 * it. The chat passes it in only when a local model is resident.
 *
 * Returns `{ text, engine, model, streamed, note }`. `note` is non-empty when
 * something went wrong and the answer came from somewhere other than where it
 * was headed; the chat shows it verbatim, because "the model failed and this is
 * the local answer instead" is information the reader needs and not an apology
 * to be smoothed away.
 */
export async function respond(question, ctx, opts) {
  const o = opts || {};
  const decision = route(question, ctx, { remoteAvailable: !!o.remoteKind });

  if (decision.engine === 'local') {
    return {
      text: decision.local.text,
      followups: decision.local.followups || [],
      engine: 'local',
      model: '',
      streamed: false,
      note: '',
    };
  }

  const messages = buildMessages(question, ctx, o.history);
  const system = systemPrompt(ctx) + '\n\n' + contextBlock(ctx, o.share || 'summary');

  try {
    if (o.remoteKind === 'local-model') {
      if (typeof o.localModelAsk !== 'function') throw new Error('no local model driver was supplied');
      const out = await o.localModelAsk(
        { messages: [{ role: 'system', content: system }].concat(messages), maxTokens: 512 },
        o.onDelta, o.signal);
      return {
        text: out.text, followups: [], engine: 'local-model',
        model: out.model, streamed: !!out.streamed, note: '',
      };
    }

    const out = await remoteAsk({ system, messages, signal: o.signal }, o.onDelta);
    return {
      text: out.text, followups: [], engine: 'hosted',
      model: out.model, streamed: !!out.streamed, note: '',
    };
  } catch (e) {
    /*
     * A cancelled answer is not a failure and must not be dressed as one. The
     * user pressed stop; saying "the model failed, here is a local answer"
     * would be answering a question they withdrew.
     */
    if (e && (e.kind === 'aborted' || e.name === 'AbortError')) {
      return { text: '', followups: [], engine: 'aborted', model: '', streamed: false, note: '' };
    }

    /*
     * Everything else falls back to the rule engine, which for an unrecognised
     * question means its "I did not understand, here is what I can answer"
     * reply. That is a poor answer, and it is still better than an error with
     * nothing behind it — and the note says exactly what happened, so nobody
     * mistakes the local reply for the model's.
     */
    const detail = (e instanceof ChatError || (e && e.detail)) ? e.detail : String((e && e.message) || e);
    return {
      text: decision.local.text,
      followups: decision.local.followups || [],
      engine: 'local',
      model: '',
      streamed: false,
      note: `המודל לא ענה — ${detail} התשובה למטה היא של המנוע המקומי.`,
    };
  }
}

/*
 * The turns a model is given, oldest first.
 *
 * The stored history uses the role 'ai' (§4.1), which no vendor has heard of;
 * client.js repairs that, but only if the roles arrive in a shape it can read,
 * so the mapping happens here where the store's vocabulary is still in scope.
 */
function buildMessages(question, ctx, history) {
  const turns = Array.isArray(history) ? history.slice(-HISTORY_TURNS * 2) : [];
  const messages = turns
    .filter((t) => t && typeof t.text === 'string' && t.text.trim())
    .map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }));
  messages.push({ role: 'user', content: question });
  return messages;
}
