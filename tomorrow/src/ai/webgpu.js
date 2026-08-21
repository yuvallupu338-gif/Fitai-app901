/*
 * webgpu.js — whether this device can run a model at all, and what to say if not.
 *
 * Its own file, and pure enough to test, because it is the branch almost
 * everybody meets first. "Unsupported" is not an answer anybody can act on:
 * a browser with no WebGPU, a browser with WebGPU that will not open an adapter,
 * and an adapter too small for the model are three different problems with three
 * different fixes, and the difference is the whole value of this function.
 *
 * This is also the one part of the local-model feature that was verified in the
 * environment it was written in, precisely because that environment has no
 * WebGPU — navigator.gpu is undefined there, with and without the usual flags.
 * The negative path is tested; the positive one is a promise the library makes.
 */

/*
 * The smallest model in the menu needs a bit under a gigabyte. Below roughly
 * that there is no point starting a download that ends in a crashed tab.
 */
const MIN_USABLE_MB = 900;

/**
 * `{ ok, reason, detail, limits }`.
 *
 * `reason` is a token to branch on; `detail` is the Hebrew sentence to show.
 * `limits` carries what the adapter reported, so the settings screen can say
 * how much room there actually is rather than guessing.
 *
 * `nav` is injectable so this can be tested against a browser that does not
 * exist — which is the only way the interesting cases get covered at all.
 */
export async function detectWebGpu(nav) {
  const gpu = nav !== undefined ? nav : (typeof navigator !== 'undefined' ? navigator : null);

  if (!gpu) {
    return {
      ok: false,
      reason: 'no_browser',
      detail: 'אין כאן דפדפן, אז אין GPU להריץ עליו.',
      limits: null,
    };
  }

  if (!gpu.gpu) {
    return {
      ok: false,
      reason: 'no_webgpu',
      /*
       * Names the browsers rather than saying "unsupported browser", because
       * the honest answer to "why not" is that this is new and not everywhere
       * yet — and on an iPhone the answer is "not on this device", which is
       * worth saying before somebody spends ten minutes looking for a setting.
       */
      detail: 'הדפדפן הזה לא תומך ב-WebGPU, וזה מה שמריץ מודל מקומי. כרום או אדג׳ מעודכנים במחשב הם הכי בטוחים; באייפון זה עדיין לא זמין.',
      limits: null,
    };
  }

  let adapter = null;
  try {
    adapter = await gpu.gpu.requestAdapter();
  } catch (e) {
    return {
      ok: false,
      reason: 'adapter_failed',
      detail: `הדפדפן תומך ב-WebGPU אבל לא הצליח לפתוח את הכרטיס הגרפי: ${String(e && e.message || e).slice(0, 120)}`,
      limits: null,
    };
  }

  if (!adapter) {
    return {
      ok: false,
      reason: 'no_adapter',
      detail: 'יש תמיכה ב-WebGPU אבל שום כרטיס גרפי לא נענה. לפעמים זה נפתר בהפעלה מחדש של הדפדפן, ולפעמים זה כרטיס שהדפדפן חוסם.',
      limits: null,
    };
  }

  const limits = adapter.limits || {};
  const bufferMb = limits.maxBufferSize ? Math.floor(limits.maxBufferSize / (1024 * 1024)) : null;
  const storageMb = limits.maxStorageBufferBindingSize
    ? Math.floor(limits.maxStorageBufferBindingSize / (1024 * 1024))
    : null;

  const info = { vendor: '', architecture: '' };
  if (adapter.info) {
    info.vendor = adapter.info.vendor || '';
    info.architecture = adapter.info.architecture || '';
  }

  /*
   * maxBufferSize is not the amount of memory available, and must not be
   * reported as though it were — it is the largest single allocation. It is
   * still the number that most often decides whether a model loads, so a value
   * below what the smallest model needs is worth warning about while stopping
   * short of refusing: the library packs weights across several buffers and may
   * well manage where this heuristic says it will not.
   */
  if (bufferMb !== null && bufferMb < MIN_USABLE_MB) {
    /*
     * Refused, not warned.
     *
     * This used to return ok:true with "you can try, but probably only the
     * smallest will load", which is an invitation dressed as a caution. What
     * happens when it does not load is not a message — the graphics driver
     * resets, and on Windows the desktop goes with it. "Probably will not work"
     * is not a risk to hand to somebody whose machine is what gets spent.
     *
     * maxBufferSize is the largest single allocation rather than the total
     * memory, and WebGPU exposes no way to ask for the total, so this is a
     * proxy and an imperfect one. It is the only number available, and erring
     * toward refusal is the right direction to be imperfect in.
     */
    return {
      ok: false,
      reason: 'tight_memory',
      detail: `הכרטיס הגרפי מדווח על הקצאה מרבית של כ-${bufferMb} מגה, פחות ממה שהמודל הקטן ביותר צריך. הרצה בכל זאת עלולה להקפיא את הדפדפן או את המסך, אז אני לא מציע את זה כאן.`,
      limits: { bufferMb, storageMb, info },
    };
  }

  return {
    ok: true,
    reason: 'ready',
    detail: bufferMb
      ? `הדפדפן מוכן להריץ מודל מקומי (הקצאה מרבית כ-${bufferMb} מגה).`
      : 'הדפדפן מוכן להריץ מודל מקומי.',
    limits: { bufferMb, storageMb, info },
  };
}
