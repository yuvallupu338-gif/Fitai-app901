/*
 * main.js — the page: text in, weights out, and a loop that trains without
 * freezing the tab.
 *
 * The one structural decision worth explaining is the training loop. Training
 * is a tight numeric loop over typed arrays and the browser has one thread for
 * that and for the interface, so a naive "run 5000 steps" locks the page for a
 * minute and shows nothing until it is over — which loses the only thing this
 * page is for, watching the loss fall. Instead each animation frame takes as
 * many steps as fit in a twelve millisecond budget and then gets out of the
 * way. The rest of the frame belongs to the interface, so the numbers move, the
 * curve grows, the sliders respond and the stop button works.
 *
 * A worker would free the whole frame, but it would also put the model behind a
 * message boundary — every stat, every sample and every export becomes a round
 * trip, and the page grows a protocol. What the budget loop costs instead is
 * throughput: the same model takes roughly a quarter more steps per second from
 * tools/lm-train.mjs, which has no frame to give back and is the right tool for
 * a long run anyway.
 */

import { buildCorpus } from './corpus.js';
import { buildVocab, encode, splitData, makeBatcher, fixedBatch, pickPad, positions } from './tokenizer.js';
import { createModel, createTrainer, generate, serialize, deserialize, paramCount } from './model.js';
import { makeRng } from './rng.js';
import { createChart } from './chart.js';

const $ = (id) => document.getElementById(id);

/* Steps per frame are bounded by time, not by count: a small model does
 * hundreds in the budget and a large one does two, and both keep the page
 * responsive. */
const FRAME_BUDGET_MS = 12;
const EVAL_EVERY = 200;      // steps between held-out measurements
const SAMPLE_EVERY = 600;    // steps between the automatic writing samples
const POINT_EVERY = 20;      // steps between points on the curve
const EVAL_WINDOWS = 512;    // held-out windows per measurement

const state = {
  text: '',
  chars: [], stoi: new Map(),
  train: null, val: null,
  model: null, trainer: null, fill: null,
  xs: null, ys: null, evalSet: null,
  history: { train: [], val: [] },
  baseline: null,
  ema: NaN,
  running: false,
  frame: 0, frameAt: 0,
  elapsed: 0,
  rate: { steps: 0, at: 0, value: 0 },
  lastSampleAt: -1,
};

const chart = createChart($('chart'));

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const say = (el, text, kind = '') => {
  const node = $(el);
  node.textContent = text;
  node.className = `msg ${kind}`.trim();
  node.hidden = !text;
};

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* The learning rate slider is logarithmic. Linear, the useful range — a
 * thousandth to a fifth — would spend nine tenths of its travel on values that
 * diverge, and the difference between 0.002 and 0.02, which is the difference
 * between learning and crawling, would be two pixels. */
const lrFromSlider = (v) => 0.001 * Math.pow(200, v / 100);

const settings = () => ({
  context: +$('ctx').value,
  embed: +$('emb').value,
  hidden: +$('hidden').value,
  batch: +$('batch').value,
  lr: lrFromSlider(+$('lr').value),
  seed: Math.abs(parseInt($('seed').value, 10) || 1) % 2147483647,
});

/* ------------------------------------------------------------------ *
 * The text
 * ------------------------------------------------------------------ */

function readText() {
  const text = $('corpus').value;
  const { context } = settings();
  state.text = text;

  const vocab = buildVocab(text);
  state.chars = vocab.chars;
  state.stoi = vocab.stoi;

  if (vocab.chars.length < 2) {
    state.train = state.val = null;
    $('text-stats').textContent = '—';
    say('text-msg', 'צריך טקסט אמיתי, לפחות שני תווים שונים.', 'bad');
    return false;
  }

  const data = encode(text, vocab.stoi);
  const { train, val } = splitData(data, { valFraction: 0.1, context });
  state.train = train;
  state.val = val;

  if (positions(train, context) <= 0) {
    $('text-stats').textContent = `${text.length} תווים`;
    say('text-msg', `הטקסט קצר מחלון ההקשר (${context} תווים). הוסף טקסט או הקטן את החלון.`, 'bad');
    return false;
  }

  $('text-stats').textContent =
    `${data.length.toLocaleString('he-IL')} תווים · ${vocab.chars.length} שונים`;
  const held = val.length
    ? `${val.length.toLocaleString('he-IL')} תווים בסוף הטקסט נשמרים לבדיקה — עליהם הוא לא מתאמן.`
    : 'הטקסט קצר מדי כדי לשמור חלק לבדיקה, אז הפסד הבדיקה יישאר ריק.';
  const skipped = data.length < [...text].length
    ? ` ${([...text].length - data.length).toLocaleString('he-IL')} תווים נדירים הושמטו.`
    : '';
  say('text-msg', held + skipped, '');
  return true;
}

/* ------------------------------------------------------------------ *
 * The model
 * ------------------------------------------------------------------ */

function buildModel({ keepText = true } = {}) {
  stop();
  if (keepText && !readText()) { state.model = null; refresh(); return; }
  if (!state.train) { state.model = null; refresh(); return; }

  const cfg = settings();
  try {
    state.model = createModel({
      chars: state.chars,
      context: cfg.context,
      embed: cfg.embed,
      hidden: cfg.hidden,
      seed: cfg.seed,
      padToken: pickPad(state.chars),
    });
  } catch (err) {
    state.model = null;
    say('train-msg', `לא הצלחתי לבנות מודל כזה: ${err.message}`, 'bad');
    refresh();
    return;
  }

  state.trainer = createTrainer(state.model, { batch: cfg.batch, lr: cfg.lr });
  state.fill = makeBatcher(state.train, { context: cfg.context, rng: makeRng(cfg.seed + 1) });
  state.xs = new Int32Array(cfg.batch * cfg.context);
  state.ys = new Int32Array(cfg.batch);
  state.evalSet = state.val && state.val.length
    ? fixedBatch(state.val, { context: cfg.context, count: EVAL_WINDOWS, seedRng: makeRng(cfg.seed + 2) })
    : { xs: new Int32Array(0), ys: new Int32Array(0), count: 0 };

  state.history = { train: [], val: [] };
  state.baseline = Math.log(state.chars.length);
  state.ema = NaN;
  state.elapsed = 0;
  state.lastSampleAt = -1;

  say('train-msg', '', '');
  refresh();
  stats();
  chart.draw({ train: [], val: [], baseline: state.baseline });
  writeSample({ auto: true });
}

function refresh() {
  const cfg = settings();
  $('ctx-val').textContent = cfg.context;
  $('emb-val').textContent = cfg.embed;
  $('hidden-val').textContent = cfg.hidden;
  $('batch-val').textContent = cfg.batch;
  $('lr-val').textContent = cfg.lr.toFixed(cfg.lr < 0.01 ? 4 : 3);
  $('temp-val').textContent = (+$('temp').value / 100).toFixed(2);
  $('topk-val').textContent = +$('topk').value === 0 ? 'בלי' : $('topk').value;
  $('len-val').textContent = $('len').value;

  const count = state.chars.length > 1
    ? paramCount({ vocabSize: state.chars.length, ...cfg })
    : 0;
  $('params').textContent = count ? `${count.toLocaleString('he-IL')} משקלים` : '—';

  const ready = !!state.model;
  /* An imported model whose context window is longer than the text in the box
   * has nothing to train on, but it can still write. */
  $('train').disabled = !ready || !state.fill;
  $('write').disabled = !ready;
  $('export').disabled = !ready;
  $('train').textContent = state.running ? 'עצור' : (state.trainer && state.trainer.steps ? 'המשך אימון' : 'התחל אימון');
}

function stats() {
  const t = state.trainer;
  $('s-steps').textContent = t ? t.steps.toLocaleString('he-IL') : '0';
  $('s-train').textContent = Number.isFinite(state.ema) ? state.ema.toFixed(3) : '—';
  const lastVal = state.history.val.length ? state.history.val[state.history.val.length - 1].y : NaN;
  $('s-val').textContent = Number.isFinite(lastVal) ? lastVal.toFixed(3) : '—';
  $('s-rate').textContent = state.rate.value ? Math.round(state.rate.value).toLocaleString('he-IL') : '—';
  $('s-norm').textContent = t && t.steps ? t.lastNorm.toFixed(2) : '—';
  $('s-time').textContent = clock(state.elapsed);
}

/* ------------------------------------------------------------------ *
 * Training
 * ------------------------------------------------------------------ */

function trainFrame(now) {
  if (!state.running) return;
  const t = state.trainer;
  const cfg = settings();
  const budgetEnd = performance.now() + FRAME_BUDGET_MS;
  let done = 0;

  while (performance.now() < budgetEnd) {
    state.fill(state.xs, state.ys, cfg.batch);
    const loss = t.step(state.xs, state.ys, cfg.batch, cfg.lr);
    done++;

    if (!Number.isFinite(loss)) {
      stop();
      say('train-msg', 'ההפסד הפך ל־NaN — קצב הלמידה גבוה מדי. הורד אותו ולחץ "אתחל מודל".', 'bad');
      return;
    }

    /* An exponential average, because a single batch of 64 windows is noisy
     * enough that the raw number jumps a tenth between steps and reads as if
     * nothing is happening. */
    state.ema = Number.isFinite(state.ema) ? state.ema * 0.98 + loss * 0.02 : loss;

    if (t.steps % POINT_EVERY === 0) state.history.train.push({ x: t.steps, y: state.ema });
    if (t.steps % EVAL_EVERY === 0 && state.evalSet.count) {
      const held = t.evaluate(state.evalSet.xs, state.evalSet.ys, state.evalSet.count);
      state.history.val.push({ x: t.steps, y: held });
      break;   // an evaluation is itself most of a frame's budget
    }
  }

  state.elapsed += now - (state.frameAt || now);
  state.frameAt = now;

  state.rate.steps += done;
  if (now - state.rate.at > 500) {
    state.rate.value = (state.rate.steps * 1000) / (now - state.rate.at);
    state.rate.steps = 0;
    state.rate.at = now;
  }

  if (t.steps - state.lastSampleAt >= SAMPLE_EVERY) {
    state.lastSampleAt = t.steps;
    writeSample({ auto: true });
  }

  stats();
  chart.draw({ train: state.history.train, val: state.history.val, baseline: state.baseline });
  state.frame = requestAnimationFrame(trainFrame);
}

function start() {
  if (!state.model || !state.fill || state.running) return;
  state.running = true;
  state.frameAt = 0;
  state.rate = { steps: 0, at: performance.now(), value: state.rate.value };
  say('train-msg', '', '');
  refresh();
  state.frame = requestAnimationFrame(trainFrame);
}

function stop() {
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = 0;
  state.running = false;
  refresh();
}

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

function writeSample({ auto = false } = {}) {
  if (!state.model) return;
  const steps = state.trainer ? state.trainer.steps : 0;
  const text = generate(state.model, {
    prompt: $('prompt').value,
    length: +$('len').value,
    temperature: +$('temp').value / 100,
    topK: +$('topk').value,
  });
  const out = $('out');
  out.textContent = text;
  out.classList.toggle('idle', steps === 0);
  $('out-label').textContent = steps === 0
    ? 'עוד לא התאמן — זה מה שרעש נראה כמו:'
    : `אחרי ${steps.toLocaleString('he-IL')} צעדים${auto ? '' : ' · לבקשתך'}:`;
}

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

function exportModel() {
  if (!state.model) return;
  const steps = state.trainer.steps;
  const held = state.history.val.length ? state.history.val[state.history.val.length - 1].y : null;
  const file = serialize(state.model, {
    source: 'lm/index.html',
    characters: state.text.length,
    steps,
    heldOutLoss: held === null ? null : +held.toFixed(4),
    trainedAt: new Date().toISOString(),
  });
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dumb-lm-${steps}-steps.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoked on the next frame rather than immediately: the click starts the
   * download asynchronously, and pulling the URL out from under it in the same
   * tick loses the file in some browsers. */
  requestAnimationFrame(() => URL.revokeObjectURL(url));
  say('file-msg', `נשמר: ${(JSON.stringify(file).length / 1048576).toFixed(2)} MB, ${steps.toLocaleString('he-IL')} צעדים.`, 'good');
}

async function importModel(file) {
  stop();
  try {
    const json = JSON.parse(await file.text());
    const { model, meta } = deserialize(json);
    state.model = model;
    state.chars = model.chars;
    state.stoi = model.stoi;

    /* The file brings its own vocabulary, and the text in the box was tokenised
     * against a different one. Everything downstream of the token ids has to be
     * rebuilt against the model's vocabulary, or the first training step would
     * be teaching it that ז means ד. */
    $('ctx').value = model.context;
    $('emb').value = model.embed;
    $('hidden').value = model.hidden;
    const cfg = settings();
    const data = encode(state.text, model.stoi);
    const { train, val } = splitData(data, { valFraction: 0.1, context: model.context });
    state.train = train;
    state.val = val;

    const covered = [...state.text].length ? data.length / [...state.text].length : 1;
    state.trainer = createTrainer(model, { batch: cfg.batch, lr: cfg.lr });
    state.fill = positions(train, model.context) > 0
      ? makeBatcher(train, { context: model.context, rng: makeRng(cfg.seed + 1) })
      : null;
    state.xs = new Int32Array(cfg.batch * model.context);
    state.ys = new Int32Array(cfg.batch);
    state.evalSet = val.length
      ? fixedBatch(val, { context: model.context, count: EVAL_WINDOWS, seedRng: makeRng(cfg.seed + 2) })
      : { xs: new Int32Array(0), ys: new Int32Array(0), count: 0 };
    state.history = { train: [], val: [] };
    state.baseline = Math.log(model.chars.length);
    state.ema = NaN;
    state.elapsed = 0;
    state.lastSampleAt = -1;

    const trained = meta.steps ? `${Number(meta.steps).toLocaleString('he-IL')} צעדים` : 'מקור לא ידוע';
    const warn = covered < 0.5
      ? ' רוב התווים בטקסט שבתיבה לא קיימים באוצר המילים של המודל הזה, אז אימון נוסף עליו יילמד עיוות.'
      : '';
    say('file-msg', `נטען מודל: ${model.chars.length} תווים, חלון ${model.context}, ${trained}.${warn}`,
      warn ? 'bad' : 'good');

    if (!state.fill) say('train-msg', 'הטקסט שבתיבה קצר מחלון ההקשר של המודל שנטען, אז אפשר רק לכתוב איתו.', '');
    refresh();
    stats();
    chart.draw({ train: [], val: [], baseline: state.baseline });
    writeSample({ auto: true });
  } catch (err) {
    say('file-msg', `הקובץ לא נטען: ${err.message}`, 'bad');
  }
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

let textTimer = 0;
$('corpus').addEventListener('input', () => {
  clearTimeout(textTimer);
  textTimer = setTimeout(() => buildModel(), 500);
});

$('file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  $('corpus').value = text;
  $('text-note').textContent = `נטען: ${file.name}`;
  buildModel();
});

$('default-text').addEventListener('click', () => {
  $('corpus').value = buildCorpus();
  $('text-note').textContent = 'ברירת המחדל: יומן אימונים שנוצר כאן במקום, כדי שיהיה במה להתחיל.';
  buildModel();
});

/* Structural sliders rebuild the model, so they act on release rather than on
 * every pixel of a drag; the readout next to them follows the thumb. */
for (const id of ['ctx', 'emb', 'hidden']) {
  $(id).addEventListener('input', refresh);
  $(id).addEventListener('change', () => buildModel());
}
$('seed').addEventListener('change', () => buildModel());

$('batch').addEventListener('input', refresh);
$('batch').addEventListener('change', () => {
  const cfg = settings();
  state.xs = new Int32Array(cfg.batch * cfg.context);
  state.ys = new Int32Array(cfg.batch);
});

for (const id of ['lr', 'temp', 'topk', 'len']) $(id).addEventListener('input', refresh);

$('train').addEventListener('click', () => (state.running ? stop() : start()));
$('reset').addEventListener('click', () => buildModel());
$('write').addEventListener('click', () => writeSample({ auto: false }));
$('export').addEventListener('click', exportModel);
$('import').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importModel(file);
});

document.addEventListener('keydown', (e) => {
  /* Space is the play/pause of this page, except where the browser already has
   * a meaning for it: typing, and pressing whichever control has the focus. */
  const taken = e.target instanceof HTMLInputElement
    || e.target instanceof HTMLTextAreaElement
    || e.target instanceof HTMLButtonElement;
  if (e.code === 'Space' && !taken && state.model) {
    e.preventDefault();
    state.running ? stop() : start();
  }
});

$('corpus').value = buildCorpus();
buildModel();
stats();
