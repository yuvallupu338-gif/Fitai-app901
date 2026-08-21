/*
 * localmodels.js — which on-device models exist, and which one is resident.
 *
 * Data and a single flag, split out of local.js so that everything except the
 * machinery can be imported normally.
 *
 * The split is not tidiness. local.js needs `import.meta.url` to find its worker
 * and `import()` to fetch the model library, and neither survives being
 * flattened into the single-file build — an inline script has no module record,
 * so `import.meta` there is a syntax error rather than a missing value. That
 * build genuinely cannot run a local model anyway: the library is not in it and
 * the weights are a gigabyte on somebody's disk. So local.js stays out of the
 * bundle entirely, reached only through import(), and the parts that are just
 * facts about models live here where any screen can name them.
 */

/*
 * Qwen, because that is what was asked for, smallest first.
 *
 * This library version carries Qwen2 and Qwen2.5 and no Qwen3, so the newer
 * hosted Qwen is a different path and the settings screen says so rather than
 * letting the name in the menu imply otherwise.
 *
 * The sizes are the library's own vram_required_MB. They decide whether a
 * machine can run this at all, so they are in the menu rather than left to be
 * discovered when the tab dies.
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

/*
 * The smallest one, deliberately.
 *
 * This defaulted to the 1.5B until somebody's machine locked up loading it. The
 * failure mode of getting this wrong is not a poor answer, it is a graphics
 * driver reset — which on Windows takes the desktop with it — so the default has
 * to be the one most likely to survive, and moving up is a choice somebody makes
 * after the small one worked.
 */
export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[0].id;

export function modelById(id) {
  return LOCAL_MODELS.find((m) => m.id === id) || null;
}

/*
 * Which model is resident, as a fact the whole app can read without pulling in
 * the driver. The driver is the only writer; everybody else asks.
 *
 * A module-level variable rather than something in the store, because it
 * describes this browser tab's GPU at this moment. Persisting it would mean a
 * reload claiming a model is loaded when the GPU is empty.
 */
const state = { loaded: '' };

export function currentModel() {
  return state.loaded;
}

export function isLoaded() {
  return state.loaded !== '';
}

/** Called by local.js only. */
export function setLoadedModel(id) {
  state.loaded = id || '';
}
