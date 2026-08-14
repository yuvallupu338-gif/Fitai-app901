/*
 * provider.js — the AIProvider interface (§85) and the vendors behind it.
 *
 * Three vendors, one shape. They differ in more than a hostname: Anthropic
 * takes the system prompt as a top-level field and returns a tool call as a
 * content block with an already-parsed object; the OpenAI-compatible ones take
 * system as the first message and return tool arguments as a JSON *string*
 * that can be malformed; Gemini uses a different envelope again. All of that
 * lives here so the rest of the app can ask for "a structured answer" without
 * knowing which vendor is answering.
 *
 * Keys are stored in localStorage on the learner's own device and sent
 * directly from their browser to the vendor. That is the only option without
 * a server, and it is stated plainly in the UI and the README rather than
 * being glossed over — a key in localStorage is readable by any script on the
 * page, which is a real trade-off the person typing it should get to make.
 */

export const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-5',
    keyHint: 'sk-ant-…',
    endpoint: 'https://api.anthropic.com/v1/messages',

    headers: (key) => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      /* Without this the API rejects any request whose Origin is a browser. */
      'anthropic-dangerous-direct-browser-access': 'true',
    }),

    body: (req) => ({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      ...(req.tool ? {
        tools: [{ name: req.tool.name, description: req.tool.description, input_schema: req.tool.schema }],
        tool_choice: { type: 'tool', name: req.tool.name },
      } : {}),
    }),

    read: (data, req) => {
      if (req.tool) {
        const block = (data.content || []).find((c) => c.type === 'tool_use');
        if (!block) throw new Error('no structured answer in response');
        return { structured: block.input };
      }
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      return { text };
    },
  },

  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4.1',
    keyHint: 'sk-…',
    endpoint: 'https://api.openai.com/v1/chat/completions',

    headers: (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` }),

    body: (req) => ({
      model: req.model,
      max_completion_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
      ...(req.tool ? {
        tools: [{ type: 'function', function: { name: req.tool.name, description: req.tool.description, parameters: req.tool.schema } }],
        tool_choice: { type: 'function', function: { name: req.tool.name } },
      } : {}),
    }),

    read: (data, req) => {
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error('empty response');
      if (req.tool) {
        const call = message.tool_calls?.[0];
        if (!call) throw new Error('no structured answer in response');
        /* Arguments arrive as a string here, and it can be malformed — the
         * one real difference from Anthropic's already-parsed object. */
        try {
          return { structured: JSON.parse(call.function.arguments) };
        } catch {
          throw new Error('structured answer was not valid JSON');
        }
      }
      return { text: message.content || '' };
    },
  },

  {
    id: 'gemini',
    name: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    keyHint: 'AIza…',
    endpoint: null, /* per-model path; built in url() below */

    url: (req, key) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(key)}`,
    headers: () => ({ 'content-type': 'application/json' }),

    body: (req) => ({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { maxOutputTokens: req.maxTokens },
      ...(req.tool ? {
        tools: [{ functionDeclarations: [{ name: req.tool.name, description: req.tool.description, parameters: req.tool.schema }] }],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [req.tool.name] } },
      } : {}),
    }),

    read: (data, req) => {
      const parts = data.candidates?.[0]?.content?.parts || [];
      if (req.tool) {
        const call = parts.find((p) => p.functionCall);
        if (!call) throw new Error('no structured answer in response');
        return { structured: call.functionCall.args };
      }
      return { text: parts.map((p) => p.text || '').join('\n') };
    },
  },
];

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

/* ------------------------------------------------------------------ *
 * Keys and selection
 * ------------------------------------------------------------------ */

const KEY_PREFIX = 'skilltree.ai.key.';
const CHOICE_KEY = 'skilltree.ai.choice';

export function saveKey(providerId, key) {
  try {
    if (key) window.localStorage.setItem(KEY_PREFIX + providerId, key);
    else window.localStorage.removeItem(KEY_PREFIX + providerId);
    return true;
  } catch {
    return false;
  }
}

export function loadKey(providerId) {
  try {
    return window.localStorage.getItem(KEY_PREFIX + providerId) || '';
  } catch {
    return '';
  }
}

export function hasAnyKey() {
  return PROVIDERS.some((p) => loadKey(p.id));
}

/**
 * Rough shape check before a request is sent. Catches the pasted-the-wrong-
 * thing case with a useful message instead of a 401 from the vendor.
 */
export function keyLooksValid(providerId, key) {
  if (!key || key.length < 20) return false;
  if (providerId === 'anthropic') return key.startsWith('sk-ant-');
  if (providerId === 'openai') return key.startsWith('sk-');
  if (providerId === 'gemini') return key.startsWith('AIza');
  return true;
}

export function saveChoice(providerId, model) {
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify({ providerId, model }));
  } catch { /* choice is a convenience; losing it is not an error */ }
}

export function loadChoice() {
  try {
    const raw = window.localStorage.getItem(CHOICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.providerId && loadKey(parsed.providerId)) return parsed;
    }
  } catch { /* fall through to the first keyed provider */ }

  const provider = PROVIDERS.find((p) => loadKey(p.id));
  return provider ? { providerId: provider.id, model: provider.defaultModel } : null;
}

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

export class AiError extends Error {
  constructor(message, kind = 'unknown') {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

/**
 * One request. Returns `{ text }` or `{ structured }` depending on whether a
 * tool was supplied.
 *
 * Errors are translated into something a person can act on. "401" is not a
 * message; "that key was rejected" is.
 */
export async function call(req) {
  const choice = req.choice || loadChoice();
  if (!choice) throw new AiError('No AI provider configured.', 'no_key');

  const provider = providerById(choice.providerId);
  if (!provider) throw new AiError('That AI provider is not available.', 'no_provider');

  const key = loadKey(provider.id);
  if (!key) throw new AiError(`No API key saved for ${provider.name}.`, 'no_key');

  const full = {
    model: choice.model || provider.defaultModel,
    maxTokens: req.maxTokens || 2048,
    system: req.system || '',
    prompt: req.prompt || '',
    tool: req.tool || null,
  };

  const url = provider.url ? provider.url(full, key) : provider.endpoint;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: provider.headers(key),
      body: JSON.stringify(provider.body(full)),
      signal: req.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new AiError('Cancelled.', 'aborted');
    /* A CORS rejection and a dead network are indistinguishable from here —
     * fetch reports both as a TypeError with no detail. */
    throw new AiError('Could not reach the provider. Check your connection.', 'network');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AiError(`${provider.name} rejected that API key.`, 'auth');
    }
    if (response.status === 429) {
      throw new AiError('Rate limited. Wait a moment and try again.', 'rate_limit');
    }
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || '';
    } catch { /* body was not JSON; the status is all we have */ }
    throw new AiError(detail || `${provider.name} returned ${response.status}.`, 'http');
  }

  const data = await response.json();
  try {
    return provider.read(data, full);
  } catch (err) {
    throw new AiError(err.message || 'Could not read the response.', 'shape');
  }
}
