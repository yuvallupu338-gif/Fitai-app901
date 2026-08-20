/*
 * local.js — a language model running on this device, with no key and no quota.
 *
 * The trade it makes is the one the user asked for: markedly less capable than a
 * hosted frontier model, and answerable to nobody. Once the weights are on the
 * machine there is no account, no credit balance, no rate limit and no network —
 * the browser does the arithmetic.
 *
 * What it costs is real and is stated wherever the user can see it rather than
 * buried here: about a gigabyte downloaded once, a GPU the browser will talk to,
 * and a first answer that takes a while to start. None of that is hidden behind
 * a spinner that implies otherwise.
 *
 * WHAT IS AND IS NOT VERIFIED
 *
 * The environment this was written in has no WebGPU at all — navigator.gpu is
 * undefined, with and without the usual flags — so the code below has never
 * produced a token. The unsupported path *is* tested, because that is the
 * environment's actual state, and it is the path most users will hit first: a
 * browser without WebGPU must say exactly what is missing rather than fail as a
 * mystery. The generating path needs one run on a real machine before anybody
 * should trust it. That is written here rather than discovered later.
 */

import { detectWebGpu } from './webgpu.js';

/*
 * Loaded on demand, never at import time.
 *
 * The library is six and a half megabytes. A static import would put it in
 * every page load for everybody, including the majority who never switch this
 * on, and would pull it into the single-file build — which exists to be a
 * portable offline copy and would become a 13MB download that still cannot run
 * the model, because the weights are not in it either.
 */
let libPromise = null;

function library() {
  if (!libPromise) {
    libPromise = import('../../vendor/web-llm.js').catch((cause) => {
      libPromise = null;
      throw new LocalModelError('missing_library',
        'ספריית המודל המקומי לא נטענה. בגרסת הקובץ הבודד היא לא נארזת — צריך את האפליקציה המלאה.',
        cause);
    });
  }
  return libPromise;
}

export class LocalModelError extends Error {
  constructor(kind, detail, cause) {
    super(detail);
    this.name = 'LocalModelError';
    this.kind = kind;
    this.detail = detail;
    this.cause = cause || null;
  }
}

/*
 * The models offered, smallest first.
 *
 * Qwen, because that is what was asked for. This library version carries Qwen2
 * and Qwen2.5 and no Qwen3 — a newer hosted Qwen is a different path and the
 * settings screen says so rather than letting somebody believe the name in the
 * menu is the model they were promised.
 *
 * The sizes are the library's own vram_required_MB. They are the number that
 * decides whether a machine can run this at all, so they are shown in the menu
 * rather than left for somebody to discover when the tab crashes.
 */
export const LOCAL_MODELS = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 0.5B',
    vramMb: 945,
    note: 'הקטן והמהיר. רץ כמעט על הכול, ומדי פעם עונה לא לעניין.',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B',
    vramMb: 1630,
    note: 'האיזון הסביר. דורש כרטיס גרפי עם כ-2 ג׳יגה פנויים.',
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 3B',
    vramMb: 2504,
    note: 'הטוב מבין השלושה, ואיטי יותר להוריד ולהתחיל.',
  },
];

export function modelById(id) {
  return LOCAL_MODELS.find((m) => m.id === id) || null;
}

export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[1].id;

/* ------------------------------------------------------------------ *
 * Can this browser do it at all
 * ------------------------------------------------------------------ */

/**
 * What this device can and cannot do, in enough detail to say something useful.
 *
 * Returns `{ ok, reason, detail }`. `reason` is a token the UI can branch on;
 * `detail` is the Hebrew sentence it shows. The point of separating them is that
 * "your browser has no WebGPU" and "your browser has WebGPU but no adapter would
 * start" have completely different fixes, and collapsing them into "unsupported"
 * sends people to the wrong one.
 */
export async function capability() {
  return detectWebGpu();
}

/* ------------------------------------------------------------------ *
 * The engine
 * ------------------------------------------------------------------ */

let engine = null;
let loadedModel = '';
let loading = null;

/**
 * Load a model, reporting progress.
 *
 * `onProgress({ text, progress })` is called with the library's own report. The
 * numbers are real — bytes actually fetched and shaders actually compiled — and
 * the UI must not embellish them, because the honest version of this wait is
 * long enough that a fake one would be noticed.
 *
 * Concurrent callers share one load. Two screens asking at once must not start
 * two downloads of the same gigabyte.
 */
export async function load(modelId, onProgress) {
  const id = modelId || DEFAULT_LOCAL_MODEL;

  if (engine && loadedModel === id) return engine;
  if (loading) return loading;

  const can = await capability();
  if (!can.ok) throw new LocalModelError(can.reason, can.detail);

  loading = (async () => {
    const webllm = await library();
    try {
      /*
       * The worker is created here rather than inside the library so that
       * `worker-src 'self'` is enough — see vendor/web-llm-worker.js. The URL is
       * resolved against this module so it keeps working from a subpath, which
       * is how GitHub Pages serves this repository.
       */
      const worker = new Worker(new URL('../../vendor/web-llm-worker.js', import.meta.url), { type: 'module' });

      const next = await webllm.CreateWebWorkerMLCEngine(worker, id, {
        initProgressCallback: (report) => {
          if (typeof onProgress === 'function') {
            onProgress({ text: report.text || '', progress: report.progress || 0 });
          }
        },
      });

      if (engine && engine.unload) {
        // Swapping models frees the old one's memory. Without this a person
        // trying the 3B after the 0.5B holds both on the GPU at once.
        try { await engine.unload(); } catch (e) { /* the new one still works */ }
      }

      engine = next;
      loadedModel = id;
      return engine;
    } catch (cause) {
      throw translate(cause);
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/**
 * Ask it something, streaming the answer.
 *
 * `messages` is the OpenAI-shaped array the rest of the app already builds, so
 * the same context builder feeds this and the hosted providers and there is one
 * prompt to keep correct rather than two.
 */
export async function ask(req, onDelta, signal) {
  const active = await load(req.model, req.onProgress);

  let text = '';
  try {
    const stream = await active.chat.completions.create({
      messages: req.messages,
      temperature: typeof req.temperature === 'number' ? req.temperature : 0.6,
      max_tokens: req.maxTokens || 512,
      stream: true,
    });

    for await (const chunk of stream) {
      if (signal && signal.aborted) {
        // Interrupt rather than just stopping the loop: the worker keeps
        // generating otherwise, and the next question queues behind a reply
        // nobody is waiting for any more.
        if (active.interruptGenerate) await active.interruptGenerate();
        throw new LocalModelError('aborted', 'הפסקתי.');
      }
      const delta = ((chunk.choices || [])[0] || {}).delta || {};
      if (delta.content) {
        text += delta.content;
        if (typeof onDelta === 'function') onDelta(delta.content);
      }
    }
  } catch (cause) {
    if (cause instanceof LocalModelError) throw cause;
    throw translate(cause);
  }

  return { text: text.trim(), model: loadedModel, streamed: true, local: true };
}

/** Free the GPU memory. The model reloads on the next question. */
export async function unload() {
  if (!engine) return;
  try { if (engine.unload) await engine.unload(); } catch (e) { /* nothing to do */ }
  engine = null;
  loadedModel = '';
}

/** Which model is resident right now, or '' when none is. */
export function currentModel() {
  return loadedModel;
}

export function isLoaded() {
  return engine !== null;
}

/*
 * Turn whatever the library threw into something a person can act on.
 *
 * The failures here are not the failures of an HTTP API, and mapping them onto
 * "something went wrong" wastes the one piece of information the user needs:
 * out of memory means pick a smaller model, a failed fetch means the download
 * was interrupted and retrying is reasonable, and a CSP refusal means the page
 * is configured wrong and no amount of retrying will help.
 */
function translate(cause) {
  const message = String((cause && cause.message) || cause || '');

  if (/out of memory|OOM|allocation|exceeds the limit/i.test(message)) {
    return new LocalModelError('out_of_memory',
      'לכרטיס הגרפי נגמר הזיכרון. שווה לבחור מודל קטן יותר מהרשימה.', cause);
  }
  if (/Content Security Policy|Refused to connect|Refused to create a worker/i.test(message)) {
    return new LocalModelError('blocked_by_csp',
      'מדיניות האבטחה של הדף חסמה את ההורדה. צריך להוסיף את המארח ל-connect-src ב-tomorrow/index.html.', cause);
  }
  if (/Failed to fetch|NetworkError|network|ERR_/i.test(message)) {
    return new LocalModelError('network',
      'ההורדה של המודל נקטעה. זה קובץ גדול — חיבור יציב ולנסות שוב.', cause);
  }
  if (/404|not found/i.test(message)) {
    return new LocalModelError('missing_model',
      'הקבצים של המודל הזה לא נמצאו. ייתכן שגרסת הספרייה ב-vendor/ וגרסת המודל לא תואמות.', cause);
  }
  if (/WebGPU|adapter|device/i.test(message)) {
    return new LocalModelError('no_webgpu',
      'הדפדפן לא הצליח לפתוח את הכרטיס הגרפי. בכרום או אדג׳ מעודכן זה בדרך כלל עובד.', cause);
  }
  return new LocalModelError('failed',
    `המודל המקומי נכשל: ${message.slice(0, 160)}`, cause);
}
