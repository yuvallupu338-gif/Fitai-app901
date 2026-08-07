/*
 * client.js — the only module in this app that opens a network connection.
 *
 * Everything else runs on the device. This one asks a model for a STRUCTURED
 * answer — never free prose — and hands back the object it produced. Which
 * vendor answers is a setting; the shape of the question and the shape of the
 * reply are not.
 *
 * Keys are stored per vendor, under their own storage keys, so exporting a
 * profile never carries one along and adding a second vendor never overwrites
 * the first one's key. Each key goes to exactly one host: the endpoint of the
 * provider it belongs to.
 *
 * Jobs, not models, are what the app asks for. 'vision' means the request
 * carries photographs and only a vision-capable provider can serve it; 'text'
 * means it does not. The distinction is enforced here rather than in the UI,
 * because a text-only model pointed at the photo scan does not degrade — it
 * fails, and it fails after the user has already uploaded their pictures.
 */

import { PROVIDERS, providerById, providersFor, modelsFor, defaultProviderFor } from './providers.js';

const KEY_PREFIX = 'fitai.key.';
const CHOICE_PREFIX = 'fitai.ai.';

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

export function loadKey(providerId) {
  try {
    return window.localStorage.getItem(KEY_PREFIX + providerId) || '';
  } catch (e) {
    return '';
  }
}

export function saveKey(providerId, key) {
  const clean = String(key || '').trim();
  try {
    if (clean) window.localStorage.setItem(KEY_PREFIX + providerId, clean);
    else window.localStorage.removeItem(KEY_PREFIX + providerId);
    return true;
  } catch (e) {
    return false;
  }
}

export function hasKey(providerId) {
  return !!loadKey(providerId);
}

/** A key is a long opaque string; catching the obvious paste error is worth it. */
export function keyLooksValid(key) {
  const k = String(key || '').trim();
  return k.length >= 20 && !/\s/.test(k);
}

/* ------------------------------------------------------------------ *
 * Which provider and model serve which job
 * ------------------------------------------------------------------ */

/**
 * Returns { provider, model } for a job, falling back to the first provider
 * that can actually do it. A stored choice that has become invalid — a text-only
 * provider saved against the vision job, a model removed from the table — is
 * discarded rather than trusted.
 */
export function choiceFor(job) {
  let stored = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(CHOICE_PREFIX + job) || 'null');
  } catch (e) { /* a corrupt choice is the same as no choice */ }

  const allowed = providersFor(job);
  let provider = stored && allowed.some((p) => p.id === stored.provider)
    ? providerById(stored.provider)
    : defaultProviderFor(job);
  if (!provider) provider = defaultProviderFor(job);

  const models = modelsFor(provider, job);
  const model = stored && models.some((m) => m.value === stored.model)
    ? stored.model
    : (models[0] && models[0].value) || '';

  return { provider, model };
}

export function saveChoice(job, providerId, model) {
  const allowed = providersFor(job);
  if (!allowed.some((p) => p.id === providerId)) return false;
  const provider = providerById(providerId);
  if (!modelsFor(provider, job).some((m) => m.value === model)) return false;
  try {
    window.localStorage.setItem(CHOICE_PREFIX + job, JSON.stringify({ provider: providerId, model }));
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * An error carrying a Hebrew sentence the UI can show as-is, plus a `kind` the
 * caller can branch on. Everything thrown from this module is one of these.
 */
export class AiError extends Error {
  constructor(kind, he, detail) {
    super(he);
    this.kind = kind;
    this.he = he;
    this.detail = detail || null;
  }
}

const STATUS_HE = {
  400: 'הבקשה נדחתה. לרוב זה אומר שהתמונה גדולה או פגומה, או שהמודל לא תומך במה שנשלח.',
  401: 'המפתח לא התקבל. בדוק שהעתקת אותו במלואו, ושהוא עדיין פעיל בחשבון שלך.',
  402: 'אין יתרה בחשבון של הספק. טען אותו ונסה שוב.',
  403: 'למפתח הזה אין הרשאה למודל שנבחר.',
  404: 'המודל שנבחר לא נמצא בחשבון שלך. נסה מודל אחר.',
  413: 'הבקשה כבדה מדי לשליחה. בחר תמונות קטנות יותר.',
  422: 'הספק דחה את מבנה הבקשה. נסה מודל אחר.',
  429: 'חרגת ממכסת הבקשות. חכה דקה ונסה שוב.',
  500: 'תקלה בצד של השרת. נסה שוב עוד רגע.',
  503: 'השירות לא זמין כרגע. נסה שוב עוד דקה.',
  529: 'השרת עמוס כרגע. נסה שוב עוד דקה.',
};

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

/**
 * Sends one structured request and returns the tool input the model produced.
 *
 * @param {Object} req  { job, system, messages, tool: {name, description, schema},
 *                        maxTokens, provider, model, signal }
 * @returns {Promise<Object>} the tool input object, unvalidated by this app
 */
export async function callTool(req) {
  const job = req.job || 'text';
  const chosen = choiceFor(job);
  const provider = req.provider ? providerById(req.provider) : chosen.provider;
  const model = req.model || chosen.model;

  if (!provider) {
    throw new AiError('no_provider', 'אין ספק מודל שמתאים למשימה הזאת.');
  }
  if (job === 'vision' && !provider.vision) {
    // Reachable only from a bug or a hand-edited setting; the UI never offers
    // a text-only provider for this job.
    throw new AiError('no_vision',
      `${provider.label} הוא מודל טקסט בלבד ולא מקבל תמונות. בחר ספק עם ראייה.`);
  }

  const key = loadKey(provider.id);
  if (!key) {
    throw new AiError('no_key', `אין מפתח API ל־${provider.label}. הזן מפתח כדי להפעיל.`);
  }

  let res;
  try {
    res = await fetch(provider.endpoint, {
      method: 'POST',
      headers: provider.headers(key),
      body: JSON.stringify(provider.body({
        model,
        maxTokens: req.maxTokens || 2000,
        system: req.system,
        messages: req.messages,
        tool: req.tool,
      })),
      signal: req.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AiError('aborted', 'הפעולה בוטלה.');
    // A browser reports CORS refusals, DNS failures and a dead connection with
    // the same contentless TypeError, so name all three — and name the one that
    // is specific to this provider.
    throw new AiError('network',
      'לא הצלחתי להגיע לשרת. בדוק את החיבור לאינטרנט. '
      + (provider.browserOk
        ? 'אם פתחת את הקובץ ישירות מהדיסק, חלק מהדפדפנים חוסמים את הבקשה — נסה מדפדפן אחר או משרת מקומי.'
        : `${provider.label} לא מצהיר על תמיכה בקריאה ישירה מדפדפן, ולכן ייתכן שהדפדפן חסם את הבקשה `
          + 'לפני שיצאה. במקרה כזה צריך שרת ביניים, וזה לא משהו שהאפליקציה הזאת מריצה.'),
      String((e && e.message) || e));
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = (err && ((err.error && err.error.message) || err.message)) || '';
    } catch (e) { /* a non-JSON error body is still an error */ }
    throw new AiError(`http_${res.status}`, STATUS_HE[res.status] || `השרת החזיר שגיאה ${res.status}.`, detail);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new AiError('bad_json', 'התשובה מהשרת לא הייתה קריאה. נסה שוב.');
  }

  const got = provider.extract(data, req.tool.name);
  if (!got.ok) {
    if (got.stop === 'max_tokens' || got.stop === 'length') {
      throw new AiError('truncated', 'התשובה נקטעה באמצע. נסה שוב.');
    }
    if (got.stop === 'refusal') {
      throw new AiError('refused',
        'המודל סירב לענות על הבקשה הזאת. נסה קלט אחר.');
    }
    if (got.stop === 'bad_arguments') {
      throw new AiError('bad_tool', 'המודל החזיר תשובה פגומה. נסה שוב.');
    }
    throw new AiError('no_tool', 'המודל לא החזיר תשובה בפורמט שביקשתי. נסה שוב, או מודל אחר.');
  }
  return got.input;
}

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Turns a stored data URL into the image block the given provider wants.
 * Returns null for anything that is not one, so a corrupted profile cannot put
 * garbage on the wire, and null for a provider with no image format at all.
 */
export function imageBlock(dataUrl, provider) {
  const m = DATA_URL_RE.exec(String(dataUrl || ''));
  if (!m || !provider || !provider.image) return null;
  const type = m[1] === 'jpg' ? 'jpeg' : m[1];
  return provider.image(`image/${type}`, m[2]);
}

/** Rough byte size of a base64 payload, for the "too big" check before sending. */
export function dataUrlBytes(dataUrl) {
  const m = DATA_URL_RE.exec(String(dataUrl || ''));
  return m ? Math.floor((m[2].length * 3) / 4) : 0;
}

export { PROVIDERS, providerById, providersFor, modelsFor };
