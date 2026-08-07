/*
 * providers.js — the model vendors this app can talk to, and the shape each one
 * wants its request in.
 *
 * Two vendors so far, and they differ in more than a hostname: Anthropic takes
 * the system prompt as a top-level field and returns a tool call as a content
 * block with a parsed object; the OpenAI-compatible ones take system as the
 * first message and return the tool arguments as a JSON *string* that has to be
 * parsed and can therefore be malformed. Both shapes live here so the rest of
 * the app can ask for "a structured answer" without knowing which.
 *
 * VISION IS A CAPABILITY, NOT A PREFERENCE.
 *
 * The photo scan reads two photographs. A text-only model cannot do it — not
 * slowly, not badly, not at all — so `vision: false` providers are excluded
 * from that job by the code rather than by a warning someone can click past.
 * They are perfectly good at the text jobs, and get those instead.
 */

/* ------------------------------------------------------------------ *
 * Request builders
 * ------------------------------------------------------------------ */

function anthropicHeaders(key) {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    // Without this the API rejects any request whose Origin is a browser.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function anthropicBody(req) {
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
    tools: [{
      name: req.tool.name,
      description: req.tool.description,
      input_schema: req.tool.schema,
    }],
    tool_choice: { type: 'tool', name: req.tool.name },
  };
}

function anthropicExtract(data, toolName) {
  const block = (data.content || []).find((c) => c && c.type === 'tool_use' && c.name === toolName);
  if (block && block.input && typeof block.input === 'object') return { ok: true, input: block.input };
  return { ok: false, stop: data.stop_reason };
}

function bearerHeaders(key) {
  return { 'content-type': 'application/json', authorization: `Bearer ${key}` };
}

function openaiBody(req) {
  // system is a message here, not a field.
  const messages = req.system
    ? [{ role: 'system', content: req.system }].concat(req.messages)
    : req.messages.slice();
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    messages,
    tools: [{
      type: 'function',
      function: {
        name: req.tool.name,
        description: req.tool.description,
        parameters: req.tool.schema,
      },
    }],
    tool_choice: { type: 'function', function: { name: req.tool.name } },
  };
}

function openaiExtract(data, toolName) {
  const msg = ((data.choices || [])[0] || {}).message || {};
  const call = (msg.tool_calls || []).find((c) => c && c.function && c.function.name === toolName);
  if (!call) return { ok: false, stop: ((data.choices || [])[0] || {}).finish_reason };
  try {
    // The arguments arrive as a STRING, so this is the one place a well-formed
    // HTTP 200 can still carry unparseable content.
    const input = JSON.parse(call.function.arguments);
    if (input && typeof input === 'object') return { ok: true, input };
  } catch (e) { /* fall through to the same "no usable tool call" path */ }
  return { ok: false, stop: 'bad_arguments' };
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    consoleHost: 'console.anthropic.com',
    keyHint: 'sk-ant-…',
    vision: true,
    // Anthropic documents and supports calls straight from a browser.
    browserOk: true,
    headers: anthropicHeaders,
    body: anthropicBody,
    extract: anthropicExtract,
    image: (mediaType, data) => ({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    }),
    models: [
      {
        value: 'claude-sonnet-5', label: 'מהיר', vision: true,
        desc: 'קריאה טובה של שתי התמונות בכמה שניות. ברירת המחדל.',
      },
      {
        value: 'claude-opus-5', label: 'מעמיק', vision: true,
        desc: 'איטי ויקר יותר, מדייק יותר כשהתמונה קשה או שהיעד גבולי.',
      },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    consoleHost: 'platform.deepseek.com',
    keyHint: 'sk-…',
    // Text only. Both hosted models take text in and text out; there is no
    // image content type to send them, so the scan never offers this provider.
    vision: false,
    // Not documented as browser-callable. The request may be refused by the
    // browser before it leaves the machine, and the error path says so.
    browserOk: false,
    headers: bearerHeaders,
    body: openaiBody,
    extract: openaiExtract,
    image: null,
    models: [
      {
        value: 'deepseek-v4-flash', label: 'מהיר', vision: false,
        desc: 'זול ומהיר. מתאים לניסוח ולהבנת טקסט חופשי.',
      },
      {
        value: 'deepseek-v4-pro', label: 'מעמיק', vision: false,
        desc: 'איטי ויקר יותר, מדייק יותר בטקסט מורכב.',
      },
    ],
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function providerById(id) {
  return BY_ID.get(id) || null;
}

/** Providers able to do a given job. `vision` jobs exclude the text-only ones. */
export function providersFor(job) {
  return job === 'vision' ? PROVIDERS.filter((p) => p.vision) : PROVIDERS.slice();
}

/** The models of one provider that can do the job. */
export function modelsFor(provider, job) {
  if (!provider) return [];
  return job === 'vision' ? provider.models.filter((m) => m.vision) : provider.models.slice();
}

export function defaultProviderFor(job) {
  const list = providersFor(job);
  return list.length ? list[0] : null;
}
