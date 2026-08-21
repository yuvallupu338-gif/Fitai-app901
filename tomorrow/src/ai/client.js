/*
 * client.js — the only module in TomorrowAI that opens a network connection.
 *
 * Everything else runs on the device, and that is not a limitation being worked
 * around: the score, the curves, the risks and the optimiser are already exact,
 * and sending them to a model would make them slower and less true. This file
 * exists for the other half of the chat — the phrasings the local matcher does
 * not recognise (Contracts §15, §21.1).
 *
 * Which is why every failure here is a soft one. `ask` never throws anything
 * except a ChatError, and every ChatError carries a Hebrew sentence the chat can
 * show while it answers from the local engine instead. The one thing the UI must
 * not do with that fallback is present it as the model's answer; §21.1 makes
 * that a rule and the error's `detail` gives it the words.
 *
 * THE STREAM BUFFER IS THE PART THAT BREAKS.
 *
 * A network chunk is not a line and it is not a character. One JSON event
 * routinely arrives split across two reads, and a Hebrew letter is two bytes
 * that split just as happily. So the decoder is kept in streaming mode across
 * reads and the tail of the buffer — everything after the last newline — is
 * carried into the next chunk instead of being parsed or dropped. Dropping it
 * costs a word here and a sentence there, which looks like the model trailing
 * off rather than like a bug in this loop.
 *
 * NO FAKE STREAMING.
 *
 * `streamed` in the result is the truth about what happened, not a preference.
 * A vendor that answers a stream request with one whole JSON document gets
 * reported as `streamed: false` and the UI shows the answer at once, because
 * §21.1 forbids animating text that already arrived complete.
 */

import { providerById, endpointFor } from './providers.js';
import { apiKey, get } from '../core/store.js';

/*
 * The hosts index.html's connect-src allows. This is a mirror, not the source
 * of truth — editing one without the other is the mistake this constant exists
 * to make visible, because a host missing from the CSP fails as a contentless
 * TypeError that looks exactly like being offline. Checking the list here turns
 * that into a sentence naming the file and the line to change.
 */
const CSP_HOSTS = [
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'openrouter.ai',
  'api.deepseek.com',
  'api.anthropic.com',
];

const CSP_FILE = 'tomorrow/index.html';

/* Short answers: this is a chat about one day, not an essay generator. */
const DEFAULT_MAX_TOKENS = 700;

/* ------------------------------------------------------------------ *
 * The error
 * ------------------------------------------------------------------ */

/**
 * Everything this module throws. `kind` is one of the eight §21.5 names and is
 * what code branches on; `detail` is a Hebrew sentence written to be shown to a
 * person as-is. `vendor` keeps the provider's own English message, which is
 * worth showing in the settings screen and worth keeping out of the chat.
 */
export class ChatError extends Error {
  constructor(kind, detail, info) {
    super(detail);
    this.name = 'ChatError';
    this.kind = kind;
    this.detail = detail;
    this.status = (info && info.status) || 0;
    this.vendor = (info && info.vendor) || '';
    /*
     * Text that had already streamed in when the failure hit. The chat needs it
     * to decide what to do with a half-painted bubble; what it must not do is
     * keep it on screen as though the model finished the thought.
     */
    this.partial = (info && info.partial) || '';
  }
}

/* ------------------------------------------------------------------ *
 * Hebrew for every way this can go wrong
 * ------------------------------------------------------------------ */

const HE = {
  noProvider: 'לא נבחר ספק מודל בהגדרות. עד שייבחר אחד, התשובות מגיעות מהמנוע המקומי.',
  noEndpoint: 'כתובת הבסיס של הספק המותאם חסרה. הזן כתובת https מלאה במסך ההגדרות.',
  noQuestion: 'לא נשלחה שאלה למודל.',
  noFetch: 'הדפדפן הזה לא תומך בבקשות רשת מודרניות, ולכן אי אפשר לפנות למודל מרוחק. '
    + 'המנוע המקומי ממשיך לעבוד כרגיל.',
  aborted: 'הבקשה בוטלה.',
};

function noKeyHe(provider) {
  return `אין מפתח API שמור עבור ${provider.label}. אפשר להזין אותו במסך ההגדרות — `
    + 'בינתיים המנוע המקומי עונה, והוא לא צריך מפתח.';
}

function noModelHe(provider) {
  return `לא הוזן מזהה מודל עבור ${provider.label}. העתק את המזהה המדויק מהקונסולה של הספק.`;
}

function badUrlHe(url) {
  return `הכתובת "${url}" אינה כתובת תקינה. הזן כתובת https מלאה במסך ההגדרות.`;
}

function cspHe(url, host, reason) {
  if (reason === 'protocol') {
    return `הדפדפן יחסום את ${url}: ההגדרה connect-src בקובץ ${CSP_FILE} מתירה רק כתובות https.`;
  }
  return `הדפדפן חוסם בקשות אל ${host}. רשימת השרתים המותרים היא connect-src שבקובץ `
    + `${CSP_FILE}, וכתובת שלא מופיעה שם לא יוצאת מהדפדפן כלל. אפשר להוסיף שם את `
    + `${host}, או לבחור ספק מהרשימה.`;
}

function unauthorizedHe(provider, status) {
  if (status === 402) {
    return `${provider.label} דחה את הבקשה מסיבת חיוב — לרוב זו יתרה שנגמרה. `
      + 'בדוק את החשבון אצל הספק ונסה שוב.';
  }
  return `המפתח נדחה על ידי ${provider.label}. בדוק שהעתקת אותו במלואו, שהוא עדיין פעיל, `
    + 'ושהחשבון מורשה למודל שנבחר.';
}

function rateLimitedHe(provider) {
  return `חרגת ממכסת הבקשות של ${provider.label}. חכה דקה ונסה שוב; `
    + 'בינתיים המנוע המקומי ממשיך לענות.';
}

function badModelHe(provider, model) {
  return `${provider.label} לא מכיר את המודל "${model}". העתק את המזהה המדויק מהקונסולה `
    + 'של הספק — ספקים משנים ומוציאים משימוש מזהי מודלים כל הזמן.';
}

function serverHe(provider, status) {
  return status
    ? `${provider.label} החזיר שגיאה ${status}. זו תקלה בצד שלהם — נסה שוב עוד רגע.`
    : `${provider.label} הפסיק את התשובה באמצע. נסה שוב עוד רגע.`;
}

function unreadableHe(provider) {
  return `התשובה מ-${provider.label} לא הייתה קריאה. נסה שוב.`;
}

function emptyHe(provider) {
  return `${provider.label} החזיר תשובה ריקה. נסה שוב, או מודל אחר.`;
}

function networkHe(host) {
  return `לא הצלחתי להגיע ל-${host}. בדוק את החיבור לאינטרנט ונסה שוב.`;
}

/* ------------------------------------------------------------------ *
 * Reading the settings and the key
 * ------------------------------------------------------------------ */

function currentSettings() {
  try {
    return get().settings.ai || {};
  } catch (e) {
    // Storage that refuses to be read is not a reason to take the chat down;
    // an empty settings object simply reads as "not configured".
    return {};
  }
}

/*
 * The key is never passed around in the Root document and never exported with a
 * backup (§21.2), so it is read from its own storage key at the moment of the
 * call. An explicit '' from the caller means "no key", not "go and look".
 */
function keyOf(explicit) {
  if (explicit === undefined || explicit === null) {
    try {
      return apiKey();
    } catch (e) {
      return '';
    }
  }
  return String(explicit).trim();
}

/* ------------------------------------------------------------------ *
 * The request
 * ------------------------------------------------------------------ */

/**
 * Whether a remote call is possible at all: switched on, a known provider, a
 * model id, a reachable endpoint and a key. The chat calls this before routing
 * a question, and answers locally when it is false — which is the normal state
 * of this app, not an error.
 */
export function isConfigured(settings, key) {
  const s = settings || currentSettings();
  if (!s.enabled) return false;
  const provider = providerById(s.providerId);
  if (!provider) return false;
  if (!String(s.model || '').trim()) return false;
  if (!endpointFor(s)) return false;
  return !!keyOf(key);
}

/**
 * Chat turns, in the shape both families accept.
 *
 * Three repairs, each for a real 400. The stored history uses the role 'ai'
 * (§3), which neither vendor has ever heard of. Anthropic rejects a
 * conversation that opens with an assistant turn, and rejects two turns of the
 * same role in a row — which is exactly what happens after a failed remote call
 * leaves a local answer in the history. Merging those is cheaper than losing the
 * user's next question to a validation error.
 */
function normalizeMessages(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw) continue;
    const role = raw.role === 'user' ? 'user' : 'assistant';
    const content = typeof raw.content === 'string' ? raw.content : String(raw.text || '');
    const text = content.trim();
    if (!text) continue;
    if (!out.length && role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${text}`;
    else out.push({ role, content: text });
  }
  return out;
}

/** The URL's host, plus whether the browser will let us talk to it. */
function reachable(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { ok: false, host: '', reason: 'url' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, host: parsed.host, reason: 'protocol' };
  if (CSP_HOSTS.indexOf(parsed.host) < 0) return { ok: false, host: parsed.host, reason: 'host' };
  return { ok: true, host: parsed.host, reason: '' };
}

/*
 * Everything that can be decided before the network is touched. Each failure
 * here is one the user can fix in the settings screen, and each names the field.
 */
function prepare(options) {
  const settings = options.settings || currentSettings();
  const provider = providerById(settings.providerId);
  if (!provider) throw new ChatError('bad_model', HE.noProvider);

  const model = String(options.model || settings.model || '').trim();
  if (!model) throw new ChatError('bad_model', noModelHe(provider));

  const key = keyOf(options.key);
  if (!key) throw new ChatError('no_key', noKeyHe(provider));

  const endpoint = endpointFor(settings);
  if (!endpoint) throw new ChatError('network', HE.noEndpoint);

  const reach = reachable(endpoint);
  if (!reach.ok) {
    if (reach.reason === 'url') throw new ChatError('network', badUrlHe(endpoint));
    throw new ChatError('blocked_by_csp', cspHe(endpoint, reach.host, reach.reason));
  }

  const messages = normalizeMessages(options.messages);
  if (!messages.length) throw new ChatError('server', HE.noQuestion);

  const maxTokens = Number(options.maxTokens) > 0
    ? Math.floor(Number(options.maxTokens))
    : DEFAULT_MAX_TOKENS;

  return {
    provider,
    endpoint,
    host: reach.host,
    key,
    model,
    system: String(options.system || ''),
    messages,
    maxTokens,
    signal: options.signal || null,
  };
}

/* ------------------------------------------------------------------ *
 * Failure classification
 * ------------------------------------------------------------------ */

/*
 * Vendors do not agree on status codes for a wrong model id — DashScope answers
 * 400 with "Model not exist", Anthropic answers 404 — so the message is read as
 * well as the code. Getting this wrong is not cosmetic: a wrong model id and an
 * expired key produce the same shrug otherwise, and §21.5 requires the user to
 * be able to tell which of the two they are looking at.
 */
const MODEL_RE = /model|模型|deployment|endpoints? (?:found|available)/i;
const RATE_RE = /rate.?limit|quota|throttl|too many requests/i;

/*
 * `status` is 200 for a failure that arrived inside a stream, which is a case
 * worth reading the message for rather than dismissing as a server fault:
 * routing gateways accept the request, start the response and only then report
 * that the model id goes nowhere. Under a free-text model id that is the most
 * likely thing to be wrong, and sending the user back to check a typo is
 * cheaper than sending them to wait out an outage that is not happening.
 *
 * Above 500 the message is ignored on purpose. An overloaded vendor often says
 * the model is unavailable, and reading that as a bad id would tell the user to
 * fix a setting that is already correct.
 */
function kindForStatus(status, vendor) {
  if (status === 401 || status === 403 || status === 402) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  if (RATE_RE.test(vendor)) return 'rate_limited';
  if (status === 404) return 'bad_model';
  if (MODEL_RE.test(vendor)) return 'bad_model';
  return 'server';
}

function detailFor(kind, ctx) {
  if (kind === 'unauthorized') return unauthorizedHe(ctx.provider, ctx.status);
  if (kind === 'rate_limited') return rateLimitedHe(ctx.provider);
  if (kind === 'bad_model') return badModelHe(ctx.provider, ctx.model);
  return serverHe(ctx.provider, ctx.status);
}

/** The vendor's own explanation, from a body that may or may not be JSON. */
function vendorMessage(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const data = JSON.parse(s);
    const err = (data && data.error) || data;
    const msg = err && (err.message || err.msg);
    if (typeof msg === 'string' && msg) return msg;
  } catch (e) {
    // An error body that is not JSON — an HTML gateway page, usually — is still
    // the only thing the vendor said, so it is kept, clipped.
  }
  return s.slice(0, 300);
}

async function fromResponse(res, ctx) {
  let raw = '';
  try {
    raw = await res.text();
  } catch (e) {
    // A body that cannot be read does not change what the status code means.
  }
  const vendor = vendorMessage(raw);
  const status = res.status;
  const kind = kindForStatus(status, vendor);
  const detail = detailFor(kind, { provider: ctx.provider, model: ctx.model, status });
  return new ChatError(kind, detail, { status, vendor });
}

/*
 * A rejected fetch. In a browser a CSP refusal, a CORS refusal, a dead network
 * and a bad DNS name all reject with the same contentless TypeError — there is
 * deliberately no detail, so that a page cannot probe hosts it is not allowed to
 * reach. Since the CSP list is known here, the one case that can be told apart
 * is told apart, and the rest are honestly reported as "could not reach".
 */
function fromThrown(e, ctx) {
  if (e instanceof ChatError) return e;
  const aborted = (e && e.name === 'AbortError') || (ctx.signal && ctx.signal.aborted);
  if (aborted) return new ChatError('aborted', HE.aborted);

  const reach = reachable(ctx.endpoint);
  if (!reach.ok) {
    return new ChatError('blocked_by_csp', cspHe(ctx.endpoint, reach.host, reach.reason));
  }
  return new ChatError('network', networkHe(ctx.host), { vendor: String((e && e.message) || e) });
}

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

/*
 * A caller's onDelta is a render function, and a render function can throw. If
 * it does, the answer still has to finish arriving: `text` below is what the
 * chat ends up storing, so an exception in one repaint must not cost the rest of
 * the reply.
 */
function emit(onDelta, chunk) {
  if (typeof onDelta !== 'function') return;
  try {
    onDelta(chunk);
  } catch (e) {
    console.error(e);
  }
}

async function readStream(res, ready, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const state = { model: '' };

  let buffer = '';
  let text = '';
  let failure = null;
  let finished = false;

  const handle = (line) => {
    const out = ready.provider.parseStream(line, state);
    if (!out) return;
    if (out.error) {
      failure = String(out.error);
      finished = true;
      return;
    }
    if (out.text) {
      text += out.text;
      emit(onDelta, out.text);
    }
    if (out.done) finished = true;
  };

  try {
    while (!finished) {
      const chunk = await reader.read();
      if (chunk.done) {
        /*
         * End of stream. The decoder is flushed in case the last read ended
         * mid-character, and whatever is left in the buffer is a final line that
         * simply never got its newline — every vendor here sends one sooner or
         * later, and the last event of a short answer is exactly where it goes
         * missing.
         */
        buffer += decoder.decode();
        if (buffer.trim()) handle(buffer);
        buffer = '';
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });

      /*
       * Only complete lines are parsed. The remainder stays in the buffer for
       * the next read: a JSON event split across two chunks is the normal case,
       * not the edge case, and parsing half of one throws away the half of the
       * sentence it carried.
       */
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim()) handle(line);
        if (finished) break;
        nl = buffer.indexOf('\n');
      }
    }
  } catch (e) {
    throw fromThrown(e, ready);
  } finally {
    /*
     * Releasing the reader matters when we stopped early — on [DONE], on an
     * error event, on abort. An abandoned reader holds the connection open, and
     * a few of those are enough to stall the next request.
     */
    try {
      const cancelled = reader.cancel();
      if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(() => {});
    } catch (e) {
      // Cancelling an already-closed reader is not a failure worth reporting.
    }
  }

  if (failure !== null) {
    const kind = kindForStatus(200, failure);
    throw new ChatError(kind, detailFor(kind, {
      provider: ready.provider,
      model: ready.model,
      status: 0,
    }), { vendor: failure, partial: text });
  }

  return { text: text.trim(), model: state.model || ready.model, streamed: true };
}

function echoedModel(data, fallback) {
  const echoed = data && data.model;
  return typeof echoed === 'string' && echoed ? echoed : fallback;
}

async function send(ready, onDelta, allowEmpty) {
  if (typeof fetch !== 'function') throw new ChatError('network', HE.noFetch);
  if (ready.signal && ready.signal.aborted) throw new ChatError('aborted', HE.aborted);

  const wantsStream = typeof onDelta === 'function' && ready.provider.streams !== false;
  const payload = ready.provider.body({
    model: ready.model,
    system: ready.system,
    messages: ready.messages,
    maxTokens: ready.maxTokens,
    stream: wantsStream,
  });

  let res;
  try {
    res = await fetch(ready.endpoint, {
      method: 'POST',
      headers: ready.provider.headers(ready.key),
      body: JSON.stringify(payload),
      signal: ready.signal || undefined,
    });
  } catch (e) {
    throw fromThrown(e, ready);
  }

  if (!res.ok) throw await fromResponse(res, ready);

  /*
   * Asking for a stream is not the same as getting one. A gateway may answer
   * with a single JSON document, and treating that as SSE finds no `data:` lines
   * and reports an empty answer for a reply that arrived intact. The content
   * type decides; a vendor that sends none is taken at its word.
   */
  const type = String((res.headers && res.headers.get('content-type')) || '').toLowerCase();
  const isSse = type.indexOf('text/event-stream') >= 0 || (wantsStream && !type);
  const canRead = res.body && typeof res.body.getReader === 'function';

  let result;
  if (wantsStream && isSse && canRead) {
    result = await readStream(res, ready, onDelta);
  } else {
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new ChatError('server', unreadableHe(ready.provider));
    }
    const text = String(ready.provider.parseWhole(data) || '').trim();
    result = { text, model: echoedModel(data, ready.model), streamed: false };
  }

  /*
   * An empty reply is a failure, not an answer. Returning '' would put a blank
   * bubble on screen over the label of a model that said nothing, when the local
   * engine had a real answer ready the whole time.
   */
  if (!result.text && !allowEmpty) throw new ChatError('server', emptyHe(ready.provider));
  return result;
}

/**
 * Ask the configured model one question.
 *
 * @param {Object} req  { settings, system, messages, model, maxTokens, key, signal }
 *   `settings` defaults to the stored `settings.ai` and `key` to the stored API
 *   key, so the chat can call this with nothing but the turns.
 * @param {Function} [onDelta]  called with each text fragment as it arrives.
 *   Passing it is what asks for a stream; the result says whether one happened.
 * @returns {Promise<{text: String, model: String, streamed: Boolean}>}
 * @throws {ChatError} always a ChatError, never anything else
 */
export async function ask(req, onDelta) {
  const ready = prepare(req || {});
  return send(ready, onDelta, false);
}

/**
 * The smallest real request the vendor will accept — one word, one token back —
 * so the settings screen can prove the key, the host and the model id together
 * before the user asks anything that matters.
 *
 * It reports what actually came back, including the model id the vendor echoed,
 * which is how a silently redirected alias shows up as itself.
 */
export async function testConnection(settings, key) {
  const s = settings || currentSettings();
  const asked = String(s.model || '').trim();
  let ready;
  try {
    ready = prepare({
      settings: s,
      key,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 1,
    });
  } catch (e) {
    return { ok: false, kind: e.kind || 'server', detail: e.detail || String(e.message || e) };
  }

  try {
    /*
     * No onDelta, so this never asks for a stream, and `allowEmpty` because a
     * one-token budget legitimately comes back with nothing in it. A 200 with an
     * empty body still proves everything this is testing.
     */
    const out = await send(ready, null, true);
    const echoed = out.model || asked;
    const detail = echoed && echoed !== asked
      ? `החיבור עובד. ${ready.provider.label} ענה עם המודל ${echoed} (ביקשת ${asked}).`
      : `החיבור עובד. ${ready.provider.label} קיבל את המפתח וענה עם המודל ${echoed}.`;
    return { ok: true, kind: 'ok', detail };
  } catch (e) {
    if (e instanceof ChatError) {
      const vendor = e.vendor ? ` (${e.vendor})` : '';
      return { ok: false, kind: e.kind, detail: `${e.detail}${vendor}` };
    }
    return { ok: false, kind: 'server', detail: serverHe(ready.provider, 0) };
  }
}
