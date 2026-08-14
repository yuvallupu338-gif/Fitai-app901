/*
 * providers.js — the three vendors this app can talk to, and the shape each
 * one wants a structured request in.
 *
 * ONLY STRUCTURED OUTPUT. EVER.
 *
 * Nothing in LifeOS asks a model for prose. Every call declares a tool with a
 * JSON schema and forces a call to it, because the reply is going to be
 * validated against a Zod-shaped schema on the way back in and then have its
 * ids checked against the database. A model that answers in a paragraph is a
 * model whose answer has to be parsed, and a parser is a place where a
 * hallucinated task id gets in.
 *
 * The three vendors differ in more than a hostname:
 *
 *   Anthropic   system is a top-level field; a tool call comes back as a
 *               content block with an already-parsed object.
 *   OpenAI      system is the first message; the tool arguments come back as a
 *               JSON *string*, so a well-formed HTTP 200 can still carry
 *               unparseable content. This is the one place the happy path can
 *               throw, and openaiExtract is where it is caught.
 *   Gemini      system is `systemInstruction`, tools are
 *               `functionDeclarations`, forcing a call is `mode: ANY`, and the
 *               key travels as a query parameter rather than a header.
 *
 * BROWSER CALLABILITY IS A FACT ABOUT THE VENDOR, NOT A PREFERENCE.
 *
 * A static site calling an API directly is a cross-origin request the vendor
 * has to have decided to allow. Anthropic documents a header for exactly this;
 * Google allows it; OpenAI does not, and a browser will refuse the request
 * before it leaves the machine. `browserOk: false` is carried here so the
 * error path can say which of those happened, instead of showing "network
 * error" to somebody whose network is fine.
 */

/* ------------------------------------------------------------------ *
 * Anthropic
 * ------------------------------------------------------------------ */

function anthropicHeaders(key) {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    /* Without this the API refuses any request carrying a browser Origin. */
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function anthropicBody(req) {
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content: req.prompt }],
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
  return { ok: false, stop: data.stop_reason || 'no_tool_call' };
}

/* ------------------------------------------------------------------ *
 * OpenAI-compatible
 * ------------------------------------------------------------------ */

function bearerHeaders(key) {
  return { 'content-type': 'application/json', authorization: `Bearer ${key}` };
}

function openaiBody(req) {
  return {
    model: req.model,
    max_completion_tokens: req.maxTokens,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    tools: [{
      type: 'function',
      function: { name: req.tool.name, description: req.tool.description, parameters: req.tool.schema },
    }],
    tool_choice: { type: 'function', function: { name: req.tool.name } },
  };
}

function openaiExtract(data, toolName) {
  const msg = ((data.choices || [])[0] || {}).message || {};
  const call = (msg.tool_calls || []).find((c) => c && c.function && c.function.name === toolName);
  if (!call) return { ok: false, stop: ((data.choices || [])[0] || {}).finish_reason || 'no_tool_call' };
  try {
    /* A string, which is why this is the one extractor that can throw on a
     * successful response. */
    const input = JSON.parse(call.function.arguments);
    if (input && typeof input === 'object') return { ok: true, input };
  } catch (e) { /* falls through to the same "unusable reply" path */ }
  return { ok: false, stop: 'bad_arguments' };
}

/* ------------------------------------------------------------------ *
 * Google Gemini
 * ------------------------------------------------------------------ */

function geminiHeaders() {
  /* The key goes in the query string for this one; see `url` below. */
  return { 'content-type': 'application/json' };
}

function geminiBody(req) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    tools: [{
      functionDeclarations: [{
        name: req.tool.name,
        description: req.tool.description,
        parameters: req.tool.schema,
      }],
    }],
    toolConfig: {
      functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [req.tool.name] },
    },
    generationConfig: { maxOutputTokens: req.maxTokens },
  };
}

function geminiExtract(data, toolName) {
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const call = parts.find((p) => p && p.functionCall && p.functionCall.name === toolName);
  if (call && call.functionCall.args && typeof call.functionCall.args === 'object') {
    return { ok: true, input: call.functionCall.args };
  }
  return { ok: false, stop: ((data.candidates || [])[0] || {}).finishReason || 'no_tool_call' };
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    console: 'console.anthropic.com',
    keyHint: 'sk-ant-…',
    browserOk: true,
    url: () => 'https://api.anthropic.com/v1/messages',
    headers: anthropicHeaders,
    body: anthropicBody,
    extract: anthropicExtract,
    models: [
      { value: 'claude-sonnet-5', label: 'מהיר', note: 'ברירת המחדל. מספיק לכל מה שהאפליקציה מבקשת.' },
      { value: 'claude-opus-5', label: 'מעמיק', note: 'איטי ויקר יותר. שווה לפירוק מטרות מורכבות.' },
      { value: 'claude-haiku-4-5-20251001', label: 'זול', note: 'הכי מהיר וזול. טוב לסיווג ולניסוח קצר.' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    console: 'platform.openai.com',
    keyHint: 'sk-…',
    /* Not documented as callable from a browser: the request is refused by
     * CORS before it leaves the machine. Kept in the table because somebody
     * running this behind their own proxy has a working setup, and because the
     * error message can then say what actually happened. */
    browserOk: false,
    url: () => 'https://api.openai.com/v1/chat/completions',
    headers: bearerHeaders,
    body: openaiBody,
    extract: openaiExtract,
    models: [
      { value: 'gpt-4o', label: 'רגיל', note: '' },
      { value: 'gpt-4o-mini', label: 'זול', note: '' },
    ],
    allowCustomModel: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    console: 'aistudio.google.com',
    keyHint: 'AIza…',
    browserOk: true,
    url: (model, key) => 'https://generativelanguage.googleapis.com/v1beta/models/'
      + `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    headers: geminiHeaders,
    body: geminiBody,
    extract: geminiExtract,
    models: [
      { value: 'gemini-2.0-flash', label: 'מהיר', note: '' },
      { value: 'gemini-1.5-pro', label: 'מעמיק', note: '' },
    ],
    allowCustomModel: true,
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function providerById(id) {
  return BY_ID.get(id) || null;
}

export function defaultProvider() {
  return PROVIDERS[0];
}

export function modelsFor(providerId) {
  const provider = providerById(providerId);
  return provider ? provider.models : [];
}

/**
 * A key is a long opaque string. This catches the obvious paste accidents —
 * an empty field, a stray newline, half a key — and nothing else, because
 * whether a key is valid is a question only the vendor can answer.
 */
export function keyLooksValid(key) {
  const k = String(key || '').trim();
  return k.length >= 20 && !/\s/.test(k);
}
