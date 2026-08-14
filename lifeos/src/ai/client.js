/*
 * client.js — the only module in LifeOS that opens a network connection.
 *
 * Everything else runs on the device. This asks a model for a structured
 * answer, validates the shape, and hands back an object — or an error code
 * that maps to a Hebrew sentence a person can act on.
 *
 * ERRORS ARE CLASSIFIED, NOT FORWARDED.
 *
 * "משהו השתבש" tells nobody anything. A rejected key needs a link to the
 * settings screen; a rate limit needs "try again in a moment"; a CORS refusal
 * needs an explanation that the vendor, not the network, said no. Those are
 * four different sentences and they come from four different failure shapes,
 * so classify() sorts them here rather than leaving every call site to guess
 * from an exception message.
 *
 * KEYS ARE PER VENDOR AND OUTSIDE THE ACCOUNT.
 *
 * Stored one key per provider under its own device-scoped storage key, so
 * exporting an account never carries one along, adding a second vendor never
 * overwrites the first, and each key is sent to exactly one host — the
 * endpoint of the provider it belongs to.
 */

import * as store from '../core/store.js';
import { PROVIDERS, providerById, defaultProvider, keyLooksValid } from './providers.js';

const CHOICE_KEY = 'lifeos.v1.ai.choice';
const TIMEOUT_MS = 45000;

export const AI_ERRORS = {
  NO_KEY: 'noKey',
  AUTH: 'auth',
  RATE: 'rate',
  NETWORK: 'network',
  CORS: 'cors',
  TIMEOUT: 'timeout',
  BAD_OUTPUT: 'badOutput',
  SERVER: 'server',
  UNKNOWN: 'unknown',
};

/* ------------------------------------------------------------------ *
 * Keys and choice
 * ------------------------------------------------------------------ */

export function loadKey(providerId) {
  return store.readProviderKey(providerId);
}

export function saveKey(providerId, key) {
  return store.writeProviderKey(providerId, key);
}

export function hasKey(providerId) {
  return !!loadKey(providerId);
}

export function anyKey() {
  return PROVIDERS.some((p) => hasKey(p.id));
}

/** Which provider and model to use. Falls back to the first one with a key. */
export function choice() {
  let stored = null;
  try {
    stored = JSON.parse(store.readProviderKey('__choice__') || 'null');
  } catch (e) { stored = null; }

  if (!stored) {
    try {
      const raw = window.localStorage.getItem(CHOICE_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch (e) { stored = null; }
  }

  const provider = (stored && providerById(stored.providerId))
    || PROVIDERS.find((p) => hasKey(p.id))
    || defaultProvider();

  const model = (stored && stored.model && stored.providerId === provider.id)
    ? stored.model
    : provider.models[0].value;

  return { providerId: provider.id, provider, model };
}

export function setChoice(providerId, model) {
  const provider = providerById(providerId) || defaultProvider();
  const value = { providerId: provider.id, model: model || provider.models[0].value };
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(value));
  } catch (e) { /* storage refused; the choice lasts the session */ }
  return value;
}

/** Is the assistant actually usable right now? */
export function available() {
  const c = choice();
  return hasKey(c.providerId);
}

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

function classify(status, body) {
  if (status === 401 || status === 403) return AI_ERRORS.AUTH;
  if (status === 429) return AI_ERRORS.RATE;
  if (status >= 500) return AI_ERRORS.SERVER;
  if (status === 400 && /api[_ ]?key|credential/i.test(String(body || ''))) return AI_ERRORS.AUTH;
  return AI_ERRORS.UNKNOWN;
}

/**
 * Ask a model for one structured object.
 *
 * `tool` is {name, description, schema} where schema is JSON Schema. The
 * returned object has been through nothing but the vendor's own extraction —
 * validation against the app's schema, and the id checks, happen in
 * provider.js, because they need the database and this file must not.
 */
export async function callStructured(request) {
  const c = request.choice || choice();
  const provider = c.provider || providerById(c.providerId);
  const key = loadKey(c.providerId);

  if (!key) return { ok: false, error: AI_ERRORS.NO_KEY };
  if (!keyLooksValid(key)) return { ok: false, error: AI_ERRORS.AUTH };

  const model = request.model || c.model;
  const payload = {
    model,
    maxTokens: request.maxTokens || 2000,
    system: request.system,
    prompt: request.prompt,
    tool: request.tool,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs || TIMEOUT_MS);
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(provider.url(model, key), {
      method: 'POST',
      headers: provider.headers(key),
      body: JSON.stringify(provider.body(payload)),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') return { ok: false, error: AI_ERRORS.TIMEOUT };
    /* A browser refusing a cross-origin request and a genuinely offline
     * machine both surface as a TypeError with no status. The provider table
     * knows which vendors permit browser calls, so this is decidable. */
    return { ok: false, error: provider.browserOk ? AI_ERRORS.NETWORK : AI_ERRORS.CORS };
  }
  clearTimeout(timer);

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch (e) { body = ''; }
    return { ok: false, error: classify(response.status, body), status: response.status };
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    return { ok: false, error: AI_ERRORS.BAD_OUTPUT };
  }

  const extracted = provider.extract(data, request.tool.name);
  if (!extracted.ok) {
    return { ok: false, error: AI_ERRORS.BAD_OUTPUT, stop: extracted.stop };
  }

  return {
    ok: true,
    value: extracted.input,
    provider: c.providerId,
    model,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * A minimal round trip, for the "test connection" button.
 * Deliberately tiny: it is checking credentials, not capability.
 */
export async function testConnection(providerId, model) {
  const provider = providerById(providerId);
  if (!provider) return { ok: false, error: AI_ERRORS.UNKNOWN };
  return callStructured({
    choice: { providerId, provider, model: model || provider.models[0].value },
    model: model || provider.models[0].value,
    maxTokens: 100,
    system: 'You reply only by calling the provided tool.',
    prompt: 'Call the tool with ok set to true.',
    tool: {
      name: 'confirm',
      description: 'Confirm the connection works.',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
      },
    },
    timeoutMs: 20000,
  });
}
