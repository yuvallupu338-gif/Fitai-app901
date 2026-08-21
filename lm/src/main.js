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
import { CORPORA, corpusById } from './corpora/index.js';
import { MODEL as TRAINED } from './models/manifest.js';
import { buildCodec, encode, splitData, makeBatcher, fixedBatch, pickPad, positions } from './tokenizer.js';
import { createModel, createTrainer, generate, serialize, deserialize, paramCount } from './model.js';
import { makeRng } from './rng.js';
import { createChart } from './chart.js';
import { reply as talkReply } from './talk.js';
import { loadImage, imageToCharacters, drawing, vector, safeSvg, svgDataUri } from './picture.js';

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
  /* The encoded stream, cached against the text it came from. Counting the
   * characters of a megabyte corpus and encoding it is a tenth of a second, and
   * nudging the hidden-layer slider changes neither — so without this, every
   * slider release on a large corpus spends it again to reach the same array. */
  data: null,
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
  /* The last picture turned into characters, kept so the two buttons under it
   * have something to act on after the file input has been forgotten. */
  tokens: 'char',
  codec: null,
  scanned: '',
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

/* The pending rebuild armed by typing, and the way to call it off. Declared up
 * here because half the file cancels it and the handler that arms it is the
 * last thing in the file. */
let textTimer = 0;
const cancelRebuild = () => { clearTimeout(textTimer); textTimer = 0; };

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
  tokens: $('tokens').value,
  context: +$('ctx').value,
  embed: +$('emb').value,
  hidden: +$('hidden').value,
  batch: +$('batch').value,
  lr: lrFromSlider(+$('lr').value),
  seed: Math.abs(parseInt($('seed').value, 10) || 1) % 2147483647,
});

/* ------------------------------------------------------------------ *
 * Where the text comes from
 *
 * Four ready-made corpora and whatever you paste. Three of the four are the
 * work of a hundred writing agents and live in modules that are imported only
 * when chosen — half a megabyte should not be on the critical path of a page
 * that might never be asked for it.
 * ------------------------------------------------------------------ */

function fillPicker() {
  const pick = $('corpus-pick');
  for (const c of CORPORA) {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.label;
    pick.appendChild(option);
  }
}

/** Mark the text as the user's own without reloading anything. */
function markCustom() {
  if ($('corpus-pick').value === 'custom') return;
  $('corpus-pick').value = 'custom';
  describeCorpus('custom');
}

function describeCorpus(id) {
  const c = corpusById(id);
  $('corpus-note').textContent = c.note;
  $('corpus-hint').textContent = c.hint;
}

async function pickCorpus(id) {
  const c = corpusById(id);
  if (!c.load) { describeCorpus(id); return; }

  cancelRebuild();
  stop();
  const pick = $('corpus-pick');
  pick.disabled = true;
  $('corpus-note').textContent = 'טוען…';
  /* One frame before the import, so the "loading" state actually paints:
   * parsing a large module and re-encoding the text both block. */
  await new Promise((r) => requestAnimationFrame(r));

  try {
    const text = await c.load();
    $('corpus').value = text;
    $('text-note').textContent = `${c.label} · ${c.note}`;
    describeCorpus(id);
    buildModel();
  } catch (err) {
    say('text-msg', `הטקסט לא נטען: ${err.message}`, 'bad');
    describeCorpus(id);
  } finally {
    pick.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 * The text
 * ------------------------------------------------------------------ */

function readText() {
  const text = $('corpus').value;
  const { context } = settings();

  const tokens = settings().tokens;
  if (text !== state.text || tokens !== state.tokens || !state.data) {
    state.text = text;
    state.tokens = tokens;
    /* Building a word vocabulary counts every word in the corpus, which on a
     * megabyte is a good deal more work than counting characters — hence the
     * cache, and hence rebuilding it when the kind changes and not only when
     * the text does. */
    const codec = buildCodec(text, { tokens, maxWords: 1500 });
    state.codec = codec;
    state.chars = codec.chars;
    state.stoi = codec.stoi;
    state.data = codec.chars.length >= 2 ? codec.encode(text) : null;
  }

  if (state.chars.length < 2 || !state.data) {
    state.train = state.val = null;
    $('text-stats').textContent = '—';
    say('text-msg', 'צריך טקסט אמיתי, לפחות שני תווים שונים.', 'bad');
    return false;
  }

  const data = state.data;
  const { train, val } = splitData(data, { valFraction: 0.1, context });
  state.train = train;
  state.val = val;

  if (positions(train, context) <= 0) {
    $('text-stats').textContent = `${text.length} תווים`;
    say('text-msg', `הטקסט קצר מחלון ההקשר (${context} תווים). הוסף טקסט או הקטן את החלון.`, 'bad');
    return false;
  }

  $('text-stats').textContent = state.tokens === 'word'
    ? `${data.length.toLocaleString('he-IL')} טוקנים · ${state.chars.length} שונים · ${state.codec.charactersPerToken.toFixed(2)} תווים לטוקן`
    : `${data.length.toLocaleString('he-IL')} תווים · ${state.chars.length} שונים`;
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
  state.xs = null;
  state.ys = null;
  fitBatch(cfg.batch);
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

/**
 * Batch buffers large enough for the next step, sized from the live model.
 *
 * Two ways this used to go wrong, both of which ended with every weight NaN and
 * a training run gone:
 *
 * The slider fires `input` on every pixel of a drag and `change` only when it
 * is released, and the training loop reads the batch size fresh each frame. So
 * for the whole of a drag the loop was asking for more windows than the arrays
 * held. Reading past an Int32Array gives `undefined`, which indexes the
 * embedding table at NaN.
 *
 * And the old code sized the arrays with the *slider's* context, which is
 * capped at 24 — while a model loaded from a file may have been trained with
 * up to 64. Its own context is the only one that describes the windows being
 * built, which is why this reads state.model and not the interface.
 */
function fitBatch(count) {
  const context = state.model ? state.model.context : settings().context;
  if (!state.xs || state.xs.length < count * context) state.xs = new Int32Array(count * context);
  if (!state.ys || state.ys.length < count) state.ys = new Int32Array(count);
}

function refresh() {
  const cfg = settings();
  /* A model loaded from a file can have a window the slider cannot represent —
   * it caps at 24, the format allows 64 — and in that case the number under the
   * slider is not the model's. Say which one is being shown. */
  const liveContext = state.model ? state.model.context : cfg.context;
  $('ctx-val').textContent = liveContext === cfg.context ? cfg.context : `${liveContext} · במודל שנטען`;
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
  $('chat-send').disabled = !ready;
  $('draw-art').disabled = !ready;
  $('draw-svg').disabled = !ready;
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
  /* Once per frame, before anything is read: the batch slider may have moved
   * since the last one, and it moves during a drag without ever telling the
   * page it has finished. */
  fitBatch(cfg.batch);
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
  /* A rebuild armed by the keystroke before this click would stop the run half
   * a second after it started. */
  cancelRebuild();
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
 * Talking to it
 * ------------------------------------------------------------------ */

function bubble(kind, text, note) {
  const el = document.createElement('div');
  el.className = `bubble ${kind}`;
  el.textContent = text;
  if (note) {
    const small = document.createElement('span');
    small.className = 'cut';
    small.textContent = note;
    el.appendChild(small);
  }
  $('chat-log').appendChild(el);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  return el;
}

function send() {
  const input = $('chat-text');
  const message = input.value.trim();
  if (!message || !state.model) return;

  bubble('mine', message);
  input.value = '';

  const { text, reason } = talkReply(state.model, message, {
    temperature: +$('temp').value / 100,
    topK: +$('topk').value,
  });

  if (!text) {
    /* An empty answer is a real answer from a model this size, and pretending
     * otherwise — a spinner, a retry, a canned line — would be the one place on
     * this page that lied about what it is. */
    bubble('theirs empty', 'לא יצא לו כלום הפעם.');
    return;
  }
  bubble('theirs', text, reason === 'length' ? 'נקטע באורך המקסימלי' : null);
}

/* ------------------------------------------------------------------ *
 * Pictures
 * ------------------------------------------------------------------ */

function drawCharacters() {
  if (!state.model) return;
  $('draw-svg-frame').hidden = true;
  const art = drawing(state.model, $('draw-name').value || 'חתול', {
    generate,
    temperature: +$('temp').value / 100,
    topK: +$('topk').value || 10,
  });
  $('draw-out').textContent = art || '(שורה ריקה)';
  say('picture-msg', art ? '' : 'הוא לא צייר כלום. אולי הטקסט שהוא אומן עליו לא כולל ציורים.', art ? '' : 'bad');
}

function drawVector() {
  if (!state.model) return;
  const raw = vector(state.model, $('draw-name').value || 'חתול', {
    generate,
    temperature: +$('temp').value / 100,
    topK: +$('topk').value || 8,
  });
  $('draw-out').textContent = raw;

  const svg = safeSvg(raw);
  const frame = $('draw-svg-frame');
  if (!svg) {
    frame.hidden = true;
    say('picture-msg', 'מה שיצא הוא לא SVG שאפשר לצייר — זה מה שקורה כשמודל בגודל הזה מנסה לכתוב תגיות. הטקסט הגולמי למעלה.', 'bad');
    return;
  }
  /* Drawn through an <img>, which is where a browser renders SVG and refuses to
   * run anything inside it. */
  $('draw-svg-out').src = svgDataUri(svg);
  frame.hidden = false;
  say('picture-msg', 'זה מה שהוא כתב, כמו שהדפדפן מצייר אותו.', 'good');
}

/**
 * Ask the model to name the picture that was scanned.
 *
 * Twenty of the writing agents taught exactly this shape — a `תמונה:` line, the
 * drawing, then `זה:` and what it is — so naming a picture is a completion like
 * everything else here. It is the weakest thing on the page by a distance: the
 * model sees twelve characters, which is half a line of the drawing, so what it
 * is really doing is recognising a texture rather than a shape. When it is
 * right, it is right for a reason; it is just not often right.
 */
function namePicture() {
  if (!state.model || !state.scanned) return;
  /* Only the first few rows: more than that and the heading is so far away it
   * cannot matter, and the model has learned the format on small drawings. */
  const rows = state.scanned.split('\n').filter((l) => l.trim()).slice(0, 5);
  const prompt = `\nתמונה:\n${rows.join('\n')}\nזה:`;
  const raw = generate(state.model, {
    prompt,
    length: 40,
    temperature: Math.min(0.7, +$('temp').value / 100),
    topK: +$('topk').value || 8,
    stop: ['\n'],
  });
  const guess = raw.split('\n')[0].trim();
  say('scan-answer', guess ? `הוא חושב שזה: ${guess}` : 'הוא לא אמר כלום.', guess ? 'good' : 'bad');
}

async function scanPicture(file) {
  try {
    const image = await loadImage(file);
    const { text, width, height } = imageToCharacters(image, { width: 56 });
    state.scanned = text;
    $('scan-out').textContent = text;
    $('scan-prompt').disabled = false;
    $('scan-train').disabled = false;
    $('scan-name').disabled = !state.model;
    say('scan-answer', '', '');
    say('picture-msg', `${file.name}: ${image.naturalWidth}×${image.naturalHeight} נקודות הפכו ל־${width}×${height} תווים. החשבון רץ כאן, המודל לא היה מעורב.`, 'good');
  } catch (err) {
    say('picture-msg', `התמונה לא נקראה: ${err.message}`, 'bad');
  }
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
  a.download = `laken-${steps}-steps.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoked on the next frame rather than immediately: the click starts the
   * download asynchronously, and pulling the URL out from under it in the same
   * tick loses the file in some browsers. */
  requestAnimationFrame(() => URL.revokeObjectURL(url));
  say('file-msg', `נשמר: ${(JSON.stringify(file).length / 1048576).toFixed(2)} MB, ${steps.toLocaleString('he-IL')} צעדים.`, 'good');
}

/** Describe the model that ships with the page, without loading it. */
function describeTrained() {
  const mb = (TRAINED.bytes / 1048576).toFixed(1);
  $('trained-note').textContent =
    `${TRAINED.steps.toLocaleString('he-IL')} צעדים על ${TRAINED.source} · הפסד ${TRAINED.heldOutLoss} · ${mb} מגה להוריד.`;
}

async function loadTrained() {
  const button = $('load-trained');
  button.disabled = true;
  say('file-msg', 'טוען את המודל המאומן…', '');
  await new Promise((r) => requestAnimationFrame(r));
  try {
    const json = (await import('./models/laken.js')).default;
    adopt(deserialize(json), `המודל המאומן: ${TRAINED.steps.toLocaleString('he-IL')} צעדים`);
  } catch (err) {
    say('file-msg', `המודל המאומן לא נטען: ${err.message}`, 'bad');
  } finally {
    button.disabled = false;
  }
}

async function importModel(file) {
  stop();
  try {
    const json = JSON.parse(await file.text());
    adopt(deserialize(json), `נטען מקובץ: ${file.name}`);
  } catch (err) {
    say('file-msg', `הקובץ לא נטען: ${err.message}`, 'bad');
  }
}

/**
 * Take a deserialised model as the live one.
 *
 * The file brings its own vocabulary, and the text in the box was tokenised
 * against a different one. Everything downstream of the token ids has to be
 * rebuilt against the model's vocabulary, or the first training step would be
 * teaching it that ז means ד.
 */
function adopt({ model, meta }, label) {
  cancelRebuild();
  stop();
  state.model = model;
  state.chars = model.chars;
  state.stoi = model.stoi;
  /* The cached stream was encoded against the vocabulary this page built from
   * the text. The model brought its own, and the two disagree about which
   * number means which letter, so the cache has to go. */
  state.data = null;

  $('ctx').value = model.context;
  $('emb').value = model.embed;
  $('hidden').value = model.hidden;
  $('tokens').value = model.wordy ? 'word' : 'char';
  state.tokens = model.wordy ? 'word' : 'char';
  const cfg = settings();
  /* With the model's own tokenizer, not the page's: a word model handed a
   * stream of character ids would be training on a text written in an alphabet
   * it does not use. */
  const data = encode(state.text, model.stoi, { words: model.wordy });
  const { train, val } = splitData(data, { valFraction: 0.1, context: model.context });
  state.train = train;
  state.val = val;

  const covered = [...state.text].length ? data.length / [...state.text].length : 1;
  state.trainer = createTrainer(model, { batch: cfg.batch, lr: cfg.lr });
  state.fill = positions(train, model.context) > 0
    ? makeBatcher(train, { context: model.context, rng: makeRng(cfg.seed + 1) })
    : null;
  state.xs = null;
  state.ys = null;
  fitBatch(cfg.batch);
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
  say('file-msg', `נטען מודל: ${model.chars.length} תווים, חלון ${model.context}, ${trained}. ${label}.${warn}`,
    warn ? 'bad' : 'good');

  if (!state.fill) say('train-msg', 'הטקסט שבתיבה קצר מחלון ההקשר של המודל שנטען, אז אפשר רק לכתוב איתו.', '');
  refresh();
  stats();
  chart.draw({ train: [], val: [], baseline: state.baseline });
  writeSample({ auto: true });
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/**
 * Typing rebuilds the model, half a second after the last keystroke — but only
 * if the text is actually different now.
 *
 * Both halves of that sentence were missing, and each cost real runs. Without
 * the comparison, an edit that changes nothing — type a character, delete it —
 * threw away a run of hundreds of steps, because buildModel() begins by
 * stopping and re-initialising unconditionally. And without anything cancelling
 * the timer, a rebuild armed by a keystroke went off half a second later
 * regardless of what had happened in between: pressing start cancelled its own
 * run, and loading a model replaced it with a random one while the message on
 * screen still said which model had been loaded.
 *
 * So the timer is cancelled by every path that takes over the model, and what
 * it eventually runs asks first whether there is anything to do.
 */
$('corpus').addEventListener('input', () => {
  markCustom();
  clearTimeout(textTimer);
  textTimer = setTimeout(() => {
    if ($('corpus').value !== state.text) buildModel();
  }, 500);
});

$('corpus-pick').addEventListener('change', (e) => pickCorpus(e.target.value));

$('file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  cancelRebuild();
  const text = await file.text();
  $('corpus').value = text;
  markCustom();
  $('text-note').textContent = `נטען: ${file.name} · ${text.length.toLocaleString('he-IL')} תווים`;
  buildModel();
});

/* Structural sliders rebuild the model, so they act on release rather than on
 * every pixel of a drag; the readout next to them follows the thumb. */
for (const id of ['ctx', 'emb', 'hidden']) {
  $(id).addEventListener('input', refresh);
  $(id).addEventListener('change', () => buildModel());
}

/* Changing what a token is changes the vocabulary, the stream and the model —
 * everything except the text itself. */
$('tokens').addEventListener('change', () => { state.data = null; buildModel(); });
$('seed').addEventListener('change', () => buildModel());

/* On `input`, not `change`: a drag is a long series of the first and a single
 * one of the second, and the training loop does not wait for the release. */
$('batch').addEventListener('input', () => {
  refresh();
  fitBatch(settings().batch);
});

for (const id of ['lr', 'temp', 'topk', 'len']) $(id).addEventListener('input', refresh);

$('train').addEventListener('click', () => (state.running ? stop() : start()));
$('reset').addEventListener('click', () => buildModel());
$('write').addEventListener('click', () => writeSample({ auto: false }));
$('export').addEventListener('click', exportModel);
$('load-trained').addEventListener('click', loadTrained);

$('chat-send').addEventListener('click', send);
$('chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

$('draw-art').addEventListener('click', drawCharacters);
$('draw-svg').addEventListener('click', drawVector);
$('draw-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') drawCharacters(); });

$('scan').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) scanPicture(file);
});

$('scan-name').addEventListener('click', namePicture);

$('scan-prompt').addEventListener('click', () => {
  if (!state.scanned) return;
  $('prompt').value = state.scanned.split('\n').slice(0, 2).join('\n');
  writeSample({ auto: false });
});

/* Adding a picture to the training text is the one place where the two
 * directions meet: scan a few, train on them, and it starts drawing things that
 * look like what you fed it. */
$('scan-train').addEventListener('click', () => {
  if (!state.scanned) return;
  const name = ($('draw-name').value || 'תמונה').trim();
  $('corpus').value = `${$('corpus').value.replace(/\s+$/, '')}\n\n[${name}]\n${state.scanned}\n`;
  markCustom();
  cancelRebuild();
  buildModel();
  say('picture-msg', 'התמונה נוספה לטקסט האימון והמודל נבנה מחדש. עכשיו צריך לאמן.', 'good');
});
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

fillPicker();
describeTrained();
$('corpus-pick').value = 'log';
describeCorpus('log');
$('corpus').value = buildCorpus();
buildModel();
stats();
