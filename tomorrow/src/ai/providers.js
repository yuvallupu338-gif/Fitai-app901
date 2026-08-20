/*
 * providers.js — the hosted models this app can be pointed at, and the exact
 * shape each vendor wants its request in.
 *
 * Nothing in this table is load-bearing. The forecast, the score, the two
 * curves, the optimiser and the chat's own answers are computed on the device
 * and stay correct with every endpoint below unreachable (Contracts §21.1).
 * What a model adds is phrasing, and the questions the local intent matcher
 * does not recognise. That is the whole of it.
 *
 * TWO REQUEST SHAPES, NOT FIVE.
 *
 * Anthropic takes the system prompt as a top-level field and streams typed
 * events; the rest speak the OpenAI chat-completions dialect, where the system
 * prompt is the first message and the stream is a run of
 * choices[0].delta.content fragments closed by a literal [DONE]. Each family is
 * written once and shared by every provider that speaks it. Copied per vendor
 * they drift within a month, and then a fix to the stream parser lands in three
 * of the five copies and the fourth truncates answers on a Tuesday.
 *
 * SUGGESTIONS ARE EXAMPLES, NEVER A WHITELIST.
 *
 * Vendors rename and retire model ids constantly, so §21.3 makes the id free
 * text: the registry offers ids that were right when it was written, and
 * whatever the user types is what gets sent. The thing that makes free text
 * usable rather than baffling is on the client's side — a rejected id comes
 * back as its own `bad_model` error naming the id, not as a generic failure
 * that could equally be an expired key.
 */

/* ------------------------------------------------------------------ *
 * Server-sent events, the parts of them these vendors actually use
 * ------------------------------------------------------------------ */

/*
 * Shared results. parseStream is called once per line of a stream — thousands
 * of times for a long answer — and the overwhelming majority of those lines are
 * blank separators, comment heartbeats and event names that carry no text.
 * Frozen because they are handed out repeatedly; the client only ever reads.
 */
const NONE = Object.freeze({ text: '', done: false });
const DONE = Object.freeze({ text: '', done: true });

/*
 * The payload of one SSE line, or null when the line carries nothing.
 *
 * `event:` lines are deliberately ignored. Anthropic sends both an event name
 * and a `type` field inside the JSON that follows, and reading the name would
 * mean holding state between two lines to remember which event the next `data:`
 * belongs to. The `type` inside the object says the same thing without that.
 *
 * Trimming the value is safe because everything after `data:` here is either
 * JSON or the [DONE] sentinel, never prose whose whitespace matters — and it is
 * what strips the CR of a CRLF stream before JSON.parse chokes on it.
 */
function sseData(line) {
  const s = String(line || '').trim();
  if (!s || s.charAt(0) === ':') return null;
  if (s.slice(0, 5) !== 'data:') return null;
  return s.slice(5).trim();
}

/** A vendor error object, or a bare string, reduced to one sentence. */
function messageOf(err) {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return '';
  return String(err.message || err.msg || err.code || '');
}

/*
 * Message content, which is a string in the common case and an array of typed
 * parts in the less common one. Some OpenAI-compatible vendors have started
 * answering with the array form, and joining it here is cheaper than every
 * caller learning both shapes.
 */
function partsToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const part of content) {
    if (typeof part === 'string') out += part;
    else if (part && typeof part.text === 'string') out += part.text;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Family one — OpenAI-compatible chat completions
 * ------------------------------------------------------------------ */

function bearerHeaders(key) {
  return { 'content-type': 'application/json', authorization: `Bearer ${key}` };
}

/*
 * The system prompt is the first message here, not a field.
 *
 * `stream` is set only when it is true, and temperature is not sent at all.
 * Both are omissions on purpose: this dialect is spoken by four different
 * companies and the reasoning models among them reject a temperature outright,
 * so a request rejected over a parameter nobody asked for would surface as a
 * mysterious 400 on the first message the user ever sends.
 */
function openaiBody(req) {
  const messages = req.system
    ? [{ role: 'system', content: req.system }].concat(req.messages)
    : req.messages.slice();
  const body = { model: req.model, messages, max_tokens: req.maxTokens };
  if (req.stream) body.stream = true;
  return body;
}

function openaiParseStream(line, state) {
  const raw = sseData(line);
  if (raw === null) return NONE;
  // The sentinel is not JSON, and parsing it first is what keeps it from being
  // reported as a malformed chunk at the end of every successful answer.
  if (raw === '[DONE]') return DONE;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    // The client hands over whole lines only, so this is a vendor emitting
    // something undocumented rather than a split chunk. Skipping one line is
    // better than failing an answer that is otherwise arriving fine.
    return NONE;
  }

  // An HTTP 200 can still turn into an error halfway through — a quota that
  // ran out mid-generation arrives as a data line, not as a status code.
  if (msg && msg.error) return { text: '', done: true, error: messageOf(msg.error) };

  const choice = ((msg && msg.choices) || [])[0] || {};
  const delta = choice.delta || {};
  if (state && typeof msg.model === 'string' && msg.model) state.model = msg.model;

  // Only `content` is the answer. Reasoning models put their scratch work in
  // reasoning_content, and streaming that into the chat bubble would show the
  // user a monologue the model never meant to say out loud.
  return { text: partsToText(delta.content), done: false };
}

function openaiParseWhole(data) {
  const choice = ((data && data.choices) || [])[0] || {};
  return partsToText((choice.message || {}).content);
}

/* ------------------------------------------------------------------ *
 * Family two — Anthropic messages
 * ------------------------------------------------------------------ */

function anthropicHeaders(key) {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    // Without this the API refuses any request whose Origin is a browser, and
    // this app is nothing but a browser.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/** system is a top-level field here — the one structural difference. */
function anthropicBody(req) {
  const body = {
    model: req.model,
    max_tokens: req.maxTokens,
    messages: req.messages.slice(),
  };
  if (req.system) body.system = req.system;
  if (req.stream) body.stream = true;
  return body;
}

function anthropicParseStream(line, state) {
  const raw = sseData(line);
  if (raw === null) return NONE;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    return NONE;
  }

  const type = msg && msg.type;

  if (type === 'content_block_delta') {
    const delta = msg.delta || {};
    // text_delta and nothing else. A thinking_delta carries the model's private
    // reasoning and a signature_delta carries a cryptographic blob; both would
    // otherwise stream straight into the chat as if they were the answer.
    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
      return { text: delta.text, done: false };
    }
    return NONE;
  }

  if (type === 'message_start' && state) {
    const echoed = (msg.message || {}).model;
    if (typeof echoed === 'string' && echoed) state.model = echoed;
    return NONE;
  }

  if (type === 'error') return { text: '', done: true, error: messageOf(msg.error) };
  if (type === 'message_stop') return DONE;
  return NONE;
}

function anthropicParseWhole(data) {
  const blocks = (data && data.content) || [];
  let out = '';
  for (const block of blocks) {
    if (block && block.type === 'text' && typeof block.text === 'string') out += block.text;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export const PROVIDERS = [
  {
    id: 'qwen',
    /*
     * Alibaba serves DashScope from two separate installations, and an account
     * works on exactly one of them: keys created outside mainland China belong
     * to the international host, keys created inside it to dashscope.aliyuncs.com.
     * There is no way to tell which from the key, and picking one quietly would
     * hand half of all Qwen users a rejected key with no hint that the host is
     * the problem. So the label says which one this is, the hint says what to do
     * when it is the other, and `altBaseUrl` lets the settings screen offer the
     * mainland host as one click through the custom provider. Both hosts are
     * already named in index.html's connect-src, so neither is blocked.
     */
    label: 'Qwen · DashScope (בינלאומי)',
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    altBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsHost: 'bailian.console.alibabacloud.com',
    keyHint: 'sk-…',
    hint: 'המפתחות של DashScope שייכים לאזור שבו נפתח החשבון. זו הכתובת הבינלאומית; '
      + 'אם החשבון נפתח בסין, בחר "כתובת מותאמת" והזן '
      + 'https://dashscope.aliyuncs.com/compatible-mode/v1 — שתי הכתובות כבר מותרות באפליקציה.',
    streams: true,
    suggestions: ['qwen3.7-plus', 'qwen-plus', 'qwen-max', 'qwen-turbo'],
    headers: bearerHeaders,
    body: openaiBody,
    parseStream: openaiParseStream,
    parseWhole: openaiParseWhole,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    docsHost: 'openrouter.ai',
    keyHint: 'sk-or-v1-…',
    /*
     * Here because it serves Qwen's models too, under `qwen/…` ids, and one
     * account reaches them without opening an Alibaba Cloud account at all —
     * which is the difference between the user trying this feature tonight and
     * abandoning it at a billing form.
     *
     * OpenRouter's optional HTTP-Referer and X-Title ranking headers are not
     * sent. Any header beyond the plain ones turns the call into a CORS
     * preflight, and a preflight the vendor declines to allow fails as a
     * contentless TypeError — the same shape a CSP refusal has. Attribution is
     * not worth an error the user cannot act on.
     */
    hint: 'דרך נוחה להגיע למודלים של Qwen בלי חשבון של Alibaba. המזהים כאן בנויים '
      + 'בצורת ספק/מודל.',
    streams: true,
    suggestions: ['qwen/qwen3.7-plus', 'qwen/qwen-plus', 'deepseek/deepseek-chat'],
    headers: bearerHeaders,
    body: openaiBody,
    parseStream: openaiParseStream,
    parseWhole: openaiParseWhole,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    docsHost: 'platform.deepseek.com',
    keyHint: 'sk-…',
    hint: 'זול ומהיר לניסוח בעברית. שים לב שהכתובת כאן היא ללא /v1.',
    streams: true,
    suggestions: ['deepseek-chat', 'deepseek-reasoner'],
    headers: bearerHeaders,
    body: openaiBody,
    parseStream: openaiParseStream,
    parseWhole: openaiParseWhole,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    docsHost: 'console.anthropic.com',
    keyHint: 'sk-ant-…',
    hint: 'מבנה הבקשה שונה משאר הספקים, אבל זה מטופל כאן ולא דורש כלום מהמשתמש.',
    streams: true,
    // Only the two ids this repository already ships against, in src/ai/providers.js.
    // Guessing a third from memory is how a settings screen ends up suggesting a
    // model that never existed.
    suggestions: ['claude-sonnet-5', 'claude-opus-5'],
    headers: anthropicHeaders,
    body: anthropicBody,
    parseStream: anthropicParseStream,
    parseWhole: anthropicParseWhole,
  },
  {
    id: 'custom',
    label: 'כתובת מותאמת',
    endpoint: '',
    needsBaseUrl: true,
    docsHost: '',
    keyHint: 'לרוב sk-…',
    /*
     * Anything that speaks the OpenAI dialect — a self-hosted gateway, the
     * mainland DashScope host, a vendor added after this was written. The catch
     * is §21.7: connect-src names a fixed set of hosts, so a base URL anywhere
     * else is refused by the browser before the request leaves. The client
     * checks that list itself and says exactly which line to edit rather than
     * letting it fail as a mystery.
     */
    hint: 'כתובת בסיס תואמת OpenAI, כולל /v1 ובלי /chat/completions. הדפדפן חוסם כל '
      + 'שרת שלא מופיע ב-connect-src שבקובץ tomorrow/index.html.',
    streams: true,
    suggestions: [],
    headers: bearerHeaders,
    body: openaiBody,
    parseStream: openaiParseStream,
    parseWhole: openaiParseWhole,
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function providerById(id) {
  return BY_ID.get(String(id || '')) || null;
}

/**
 * The URL to POST to for a given `settings.ai`, or '' when it cannot be worked
 * out — an unknown provider id, or the custom provider with nothing typed yet.
 *
 * The custom path appends `/chat/completions` unless the user already did, and
 * never invents a version segment: every OpenAI-compatible gateway documents
 * its base URL including /v1, so guessing one would only turn a URL the user
 * pasted correctly into a 404 they cannot explain.
 */
export function endpointFor(settings) {
  const s = settings || {};
  const provider = providerById(s.providerId);
  if (!provider) return '';
  if (!provider.needsBaseUrl) return provider.endpoint;

  const base = String(s.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}
