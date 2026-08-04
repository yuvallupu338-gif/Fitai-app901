/*
 * client.js — the only module in this app that opens a network connection.
 *
 * Everything else runs on the device. This one calls the Anthropic Messages API
 * directly from the browser, which needs three things the server side would not:
 *
 *   1. the anthropic-dangerous-direct-browser-access header, without which the
 *      API refuses the request outright;
 *   2. the user's own key, held in localStorage under a key of its own so that
 *      exporting the profile never carries it along;
 *   3. an error path for every way a fetch from a browser can fail, because a
 *      thrown TypeError with no message is what CORS and an offline machine both
 *      look like from here, and "לא הצלחתי" helps nobody.
 *
 * The key belongs to the user and goes nowhere except api.anthropic.com.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const KEY_STORAGE = 'fitai.key.v1';
const MODEL_STORAGE = 'fitai.model.v1';

export const MODELS = [
  {
    value: 'claude-sonnet-5',
    label: 'מהיר',
    desc: 'קריאה טובה של שתי התמונות בכמה שניות. ברירת המחדל.',
  },
  {
    value: 'claude-opus-5',
    label: 'מעמיק',
    desc: 'איטי ויקר יותר, מדייק יותר כשהתמונה קשה או שהיעד גבולי.',
  },
];

const MODEL_VALUES = MODELS.map((m) => m.value);

/* ------------------------------------------------------------------ *
 * The key
 * ------------------------------------------------------------------ */

export function loadKey() {
  try {
    return window.localStorage.getItem(KEY_STORAGE) || '';
  } catch (e) {
    return '';
  }
}

export function saveKey(key) {
  const clean = String(key || '').trim();
  try {
    if (clean) window.localStorage.setItem(KEY_STORAGE, clean);
    else window.localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch (e) {
    return false;
  }
}

export function hasKey() {
  return !!loadKey();
}

/** A key is a long opaque string; catching the obvious paste error is worth it. */
export function keyLooksValid(key) {
  const k = String(key || '').trim();
  return k.length >= 20 && !/\s/.test(k);
}

export function loadModel() {
  try {
    const m = window.localStorage.getItem(MODEL_STORAGE);
    return MODEL_VALUES.indexOf(m) >= 0 ? m : MODEL_VALUES[0];
  } catch (e) {
    return MODEL_VALUES[0];
  }
}

export function saveModel(model) {
  try {
    if (MODEL_VALUES.indexOf(model) >= 0) window.localStorage.setItem(MODEL_STORAGE, model);
  } catch (e) { /* the default still works */ }
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * An error carrying a Hebrew sentence the UI can show as-is, plus a `kind` the
 * caller can branch on. Everything thrown from this module is one of these.
 */
export class VisionError extends Error {
  constructor(kind, he, detail) {
    super(he);
    this.kind = kind;
    this.he = he;
    this.detail = detail || null;
  }
}

const STATUS_HE = {
  400: 'הבקשה נדחתה. לרוב זה אומר שהתמונה גדולה או פגומה — נסה תמונה אחרת.',
  401: 'המפתח לא התקבל. בדוק שהעתקת אותו במלואו, ושהוא עדיין פעיל בחשבון שלך.',
  403: 'למפתח הזה אין הרשאה למודל שנבחר. נסה את המסלול המהיר, או בדוק את החשבון.',
  404: 'המודל שנבחר לא נמצא בחשבון שלך. נסה את המסלול השני.',
  413: 'התמונות כבדות מדי לשליחה. בחר תמונות קטנות יותר.',
  429: 'חרגת ממכסת הבקשות. חכה דקה ונסה שוב.',
  500: 'תקלה בצד של השרת. נסה שוב עוד רגע.',
  529: 'השרת עמוס כרגע. נסה שוב עוד דקה.',
};

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

/**
 * Sends one structured request and returns the tool input the model produced.
 *
 * @param {Object} req  { system, messages, tool, maxTokens, model, signal }
 * @returns {Promise<Object>} the validated-by-the-API tool input object
 */
export async function callTool(req) {
  const key = loadKey();
  if (!key) {
    throw new VisionError('no_key', 'אין מפתח API. הזן מפתח כדי להפעיל את הסריקה.');
  }

  const body = {
    model: req.model || loadModel(),
    max_tokens: req.maxTokens || 2000,
    system: req.system,
    messages: req.messages,
    tools: [req.tool],
    tool_choice: { type: 'tool', name: req.tool.name },
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        // Without this the API rejects any request whose Origin is a browser.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new VisionError('aborted', 'הסריקה בוטלה.');
    // A browser reports CORS failures, DNS failures and a dead connection with
    // the same contentless TypeError, so name all three.
    throw new VisionError('network',
      'לא הצלחתי להגיע לשרת. בדוק את החיבור לאינטרנט. '
      + 'אם פתחת את הקובץ ישירות מהדיסק, חלק מהדפדפנים חוסמים את הבקשה — נסה מדפדפן אחר או משרת מקומי.',
      String(e && e.message || e));
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = (err && err.error && err.error.message) || '';
    } catch (e) { /* a non-JSON error body is still an error */ }
    const he = STATUS_HE[res.status] || `השרת החזיר שגיאה ${res.status}.`;
    throw new VisionError(`http_${res.status}`, he, detail);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new VisionError('bad_json', 'התשובה מהשרת לא הייתה קריאה. נסה שוב.');
  }

  const block = (data.content || []).find((c) => c && c.type === 'tool_use' && c.name === req.tool.name);
  if (!block || !block.input || typeof block.input !== 'object') {
    // Refusals and max_tokens stops both land here, and they mean different things.
    const stop = data.stop_reason;
    if (stop === 'max_tokens') {
      throw new VisionError('truncated', 'התשובה נקטעה באמצע. נסה שוב.');
    }
    if (stop === 'refusal') {
      throw new VisionError('refused',
        'המודל סירב לנתח את התמונות האלה. בחר תמונות אחרות — צילום גוף רגיל, לבוש ספורט.');
    }
    throw new VisionError('no_tool', 'המודל לא החזיר תשובה בפורמט שביקשתי. נסה שוב.');
  }

  return block.input;
}

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Turns a stored data URL into the API's image block. Returns null for anything
 * that is not one, so a corrupted profile cannot put garbage on the wire.
 */
export function imageBlock(dataUrl) {
  const m = DATA_URL_RE.exec(String(dataUrl || ''));
  if (!m) return null;
  const type = m[1] === 'jpg' ? 'jpeg' : m[1];
  return {
    type: 'image',
    source: { type: 'base64', media_type: `image/${type}`, data: m[2] },
  };
}

/** Rough byte size of a base64 payload, for the "too big" check before sending. */
export function dataUrlBytes(dataUrl) {
  const m = DATA_URL_RE.exec(String(dataUrl || ''));
  return m ? Math.floor(m[2].length * 3 / 4) : 0;
}
