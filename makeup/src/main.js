/*
 * main.js — boot, the loop, and the state machine.
 *
 * The states are: title, day briefing, working on a customer, the till, the
 * result, the end of the day. Everything that is slow — building a head,
 * generating a skin texture — happens on the transition into `work`, behind the
 * loading panel, so that nothing between the first stroke and the last one ever
 * allocates a mesh.
 *
 * `window.bella` at the bottom is the seam the smoke test drives the game
 * through. It is deliberately small and deliberately real: it calls the same
 * functions the buttons do.
 */

import { Renderer } from './render/renderer.js';
import { buildMasks } from './model/face.js';
import { buildShop, buildTray, SHOP } from './model/props.js';
import { PaintLayer } from './game/paint.js';
import { Input } from './game/input.js';
import { Audio } from './game/audio.js';
import { Shift } from './game/shift.js';
import {
  buildCustomerAssets, applyArrival, reactionTo, fillZone,
} from './game/customer.js';
import { scoreCustomer, scoreMarking, till } from './game/scoring.js';
import { UI } from './ui/ui.js';
import {
  loadSave, saveGame, clearSave, loadSettings, saveSettings, guessQuality,
} from './ui/store.js';
import { makeRng } from './core/rng.js';
import { clamp, damp } from './core/math.js';
import { zoneOf, productShade } from './data/products.js';
import { LINES, say } from './data/people.js';

const canvas = document.getElementById('view');

const state = {
  phase: 'boot',
  smile: 0,
  concern: 0,
  eyesClosed: 0,
  headYaw: 0,
  headPitch: 0,
  gaze: [0, SHOP.customerHeadY, 1.6],
  exposure: 1.05,
  dim: 1,
  timeLeft: 0,
  reacted: new Set(),
  strokeSpeed: 0,
};

let renderer, paint, input, ui, audio, shift, masks;
let settings = loadSettings(guessQuality());
let customer = null;
let assets = null;
let lastResult = null;
let lastMarking = null;
let lastTill = null;
let selected = null;

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot() {
  ui = new UI(handlers);
  audio = new Audio();

  renderer = new Renderer(canvas);
  renderer.quality = { scale: settings.scale, texture: settings.texture, bloom: settings.bloom };

  if (!renderer.init()) {
    ui.fatal('הדפדפן הזה לא תומך ב-WebGL2, ובלעדיו אין מה להראות. נסו דפדפן עדכני.');
    return;
  }

  /* Masks are customer-independent — the whole point of the fixed face layout —
   * so they are built once for the session. */
  masks = buildMasks(512);
  paint = new PaintLayer(renderer.gl, renderer.caps, settings.paint, masks);
  paint.assist = settings.assist;

  renderer.setShop(buildShop(makeRng('bella-shop')));
  resize();
  window.addEventListener('resize', resize);

  input = new Input(canvas, renderer, {
    paintStart: onPaintStart,
    paintMove: onPaintMove,
    paintEnd: onPaintEnd,
    orbit: onOrbit,
    zoom: onZoom,
  });

  ui.bindSettings(settings, onSetting);
  ui.setContinue(!!loadSave());
  ui.show('title');
  state.phase = 'title';

  requestAnimationFrame(frame);
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}

/* ------------------------------------------------------------------ *
 * The loop
 * ------------------------------------------------------------------ */

let lastTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 0.016);
  lastTime = now;

  /* Expressions fall back to neutral on their own. A smile that stayed until
   * the next event would make every customer look pleased with a face they are
   * not pleased with. */
  state.smile = damp(state.smile, 0, 1.1, dt);
  state.concern = damp(state.concern, 0, 1.1, dt);

  if (state.phase === 'work') {
    state.timeLeft -= dt;
    ui.setTimer(state.timeLeft / customer.patience);
    if (state.timeLeft <= 0) outOfTime();
    else if (state.timeLeft < customer.patience * 0.22 && !state.nagged) {
      state.nagged = true;
      const rng = makeRng(customer.seed + 77);
      ui.setSpeech(say(rng.pick(LINES.impatient), customer.gender));
      audio.speak('neutral', customer.gender);
    }
    /* Eyes shut for anything that goes near them. This is not decoration: with
     * the lids down the eyeshadow area is actually facing the player, which is
     * the only way a lid is paintable at all. */
    const zone = selected ? zoneOf(selected.product) : null;
    state.eyesClosed = damp(state.eyesClosed,
      zone === 'lid' || zone === 'lash' ? 1 : 0, 5, dt);
    paint.flush(!input.painting);
  }

  if (renderer.customer) renderer.render(state, dt);
  else renderer.render(state, dt);
}

/* ------------------------------------------------------------------ *
 * Painting
 * ------------------------------------------------------------------ */

function onPaintStart(hit) {
  if (state.phase !== 'work' || !selected) return;
  audio.start();
  audio.resume();
  paint.splat(hit.s, hit.t, selected, 0.6);
  state.gaze = hit.world;
}

function onPaintMove(hit, from, speed) {
  if (state.phase !== 'work' || !selected || !from) return;
  /* Slower is heavier. The curve is deliberately steep at the bottom so that
   * resting the brush in one place builds up quickly — which is how someone
   * discovers they can blend by moving. */
  const pressure = clamp(1.15 - speed * 0.55, 0.25, 1.15);
  paint.stroke(from.s, from.t, hit.s, hit.t, selected, pressure);
  state.gaze = hit.world;
  audio.brush(clamp(speed * 0.5, 0.05, 1), selected.product.finish === 'gloss' ? 0.15 : 0.6);
  updateProgress();
}

function onPaintEnd() {
  audio.brushOff();
  if (state.phase !== 'work') return;
  paint.flush(true);
  updateProgress();
  reactIfNew();
  updateTill();
}

function onOrbit(dx, dy) {
  const cam = renderer.camera;
  cam.yaw = clamp(cam.yaw - dx * 0.005, -0.9, 0.9);
  cam.pitch = clamp(cam.pitch + dy * 0.004, -0.5, 0.6);
}

function onZoom(d) {
  const cam = renderer.camera;
  cam.dist = clamp(cam.dist * (1 + d), 0.16, 1.6);
}

/*
 * She reacts the first time a product has really gone on — not on the first
 * texel, which would fire on a slip, and not at the end, which would be too
 * late to be a hint.
 */
function reactIfNew() {
  const rng = makeRng(customer.seed + paint.strokeCount * 31);
  for (const e of paint.ledger.values()) {
    if (e.amount < 4 || state.reacted.has(e.key)) continue;
    state.reacted.add(e.key);
    const r = reactionTo(customer, e.item, rng);
    if (r.expr.smile) state.smile = r.expr.smile;
    if (r.expr.concern) state.concern = r.expr.concern;
    if (r.line) {
      ui.setSpeech(r.line);
      audio.speak(r.affinity > 0.4 ? 'love' : 'hate', customer.gender);
    }
  }
}

function updateProgress() {
  const stats = paint.stats();
  const applied = paint.applied();
  ui.updateWants(stats, applied);
  const zone = selected ? zoneOf(selected.product) : null;
  if (zone && stats[zone]) {
    ui.setCoverage(`כיסוי ${Math.round(stats[zone].coverage * 100)}%`);
  } else ui.setCoverage('');

  /*
   * Mascara is the one product whose result is geometry rather than colour on
   * the skin, so the lashes read what landed on the lash line and thicken and
   * darken to match. Without this the player buys a mascara, applies it, and
   * nothing on the customer changes — which is the whole reason it is in the
   * catalogue.
   */
  const c = renderer.customer;
  if (c && stats.lash) {
    c.lashOpacity = clamp(0.55 + stats.lash.coverage * 0.42, 0, 0.97);
    if (stats.lash.rgb) c.lashRgb = stats.lash.rgb;
  }
}

function updateTill() {
  const lines = paint.applied()
    .filter((e) => e.item.product.price > 0)
    .map((e) => ({ name: e.name, price: e.item.product.price }));
  renderer.setTillScreen(lines, lines.reduce((n, l) => n + l.price, 0));
}

/* ------------------------------------------------------------------ *
 * Flow
 * ------------------------------------------------------------------ */

function startShift(save) {
  shift = new Shift(save || {});
  state.phase = 'day';
  ui.setDay(shift.day, shift.target, shift.customersToday);
}

function openShop() {
  nextCustomer();
}

async function nextCustomer() {
  if (shift.done) {
    const summary = shift.endDay();
    saveGame(shift.toSave());
    ui.showEndDay(summary, shift.money);
    state.phase = 'endday';
    return;
  }

  state.phase = 'loading';
  ui.loading(true, 'הלקוחה הבאה מתיישבת…');
  ui.hud();
  /* Yield twice so the loading panel is actually on screen before the head is
   * built — one frame is not enough, the layout has not been flushed yet. */
  await nextFrame();
  await nextFrame();

  customer = shift.next();
  assets = buildCustomerAssets(customer, { skinSize: settings.face || 1024 });

  paint.clear();
  paint.assist = settings.assist;
  applyArrival(paint, customer);

  const c = renderer.setCustomer({
    ...assets,
    paintTex: paint.colourTex,
    fxTex: paint.fxTex,
  });
  c.head = assets.head;
  c.lidL = assets.lidL;
  c.lidR = assets.lidR;

  state.reacted = new Set();
  state.timeLeft = customer.patience;
  state.nagged = false;
  state.smile = 0;
  state.concern = 0;
  state.gaze = [0, SHOP.customerHeadY + 0.05, 1.4];

  ui.setCustomer(customer);
  ui.setHud({
    day: shift.day, index: shift.index, total: shift.customersToday,
    money: shift.money, reputation: shift.reputation,
  });
  setView('face');
  updateProgress();
  updateTill();

  ui.loading(false);
  ui.hud();
  state.phase = 'work';
  audio.start();
  audio.chime();
  saveGame(shift.toSave());
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function outOfTime() {
  state.timeLeft = 0;
  customer.ranOut = true;
  ui.toast('נגמר לה הזמן — היא הולכת לקופה כמו שהיא');
  finishCustomer();
}

function finishCustomer() {
  if (state.phase !== 'work') return;
  audio.brushOff();
  paint.flush(true);
  lastResult = scoreCustomer(customer, paint);
  if (customer.ranOut) lastResult.score = Math.max(0, lastResult.score - 12);
  lastTill = till(customer, lastResult, null);
  renderer.setTillScreen(lastTill.lines, lastTill.total);
  ui.showRegister(customer, lastTill, lastResult.applied);
  state.phase = 'register';
  audio.scan();
}

function charge() {
  lastMarking = scoreMarking(customer, paint, ui.markItem, ui.markFinish);
  lastTill = till(customer, lastResult, lastMarking);
  const record = shift.complete(lastResult, lastMarking, lastTill);
  saveGame(shift.toSave());
  audio.cash();

  const rng = makeRng(customer.seed + 313);
  const pool = lastResult.stars >= 4 ? LINES.happyEnd
    : lastResult.stars >= 2 ? LINES.okEnd : LINES.badEnd;
  let quote = say(rng.pick(pool), customer.gender);
  if (lastMarking.itemRight) {
    quote += ' ' + say(rng.pick(LINES.markRight), customer.gender);
  } else if (ui.markItem) {
    quote += ' ' + say(rng.pick(LINES.markWrong), customer.gender);
  }

  ui.showResult(customer, lastResult, lastMarking, lastTill, quote);
  state.phase = 'result';
  void record;
}

function setView(name) {
  const cam = renderer.camera;
  const scale = SHOP.headScale;
  const f = assets && assets.focus ? assets.focus : null;
  const to = (p, dist) => {
    cam.target[0] = p[0] * scale;
    cam.target[1] = SHOP.customerHeadY + p[1] * scale;
    cam.target[2] = SHOP.customerZ + p[2] * scale;
    cam.dist = dist;
  };
  if (!f) { cam.dist = 0.7; return; }
  if (name === 'eyes') to(f.eyes, 0.26);
  else if (name === 'lips') to(f.lips, 0.24);
  else to(f.face, 0.62);
  cam.yaw = 0;
  cam.pitch = name === 'eyes' ? 0.05 : 0.0;
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

const handlers = {
  newShift() {
    audio.start();
    clearSave();
    startShift(null);
  },
  continueShift() {
    audio.start();
    startShift(loadSave());
  },
  openShop,
  finishCustomer,
  charge,
  nextCustomer() { nextCustomer(); },
  nextDay() {
    state.phase = 'day';
    ui.setDay(shift.day, shift.target, shift.customersToday);
  },
  toMenu() {
    renderer.releaseCustomer();
    ui.setContinue(!!loadSave());
    ui.show('title');
    state.phase = 'title';
  },
  reset() {
    clearSave();
    ui.setContinue(false);
    ui.toast('ההתקדמות נמחקה');
  },
  closeSettings() {
    ui.show(state.phase === 'work' ? null : 'title');
    if (state.phase === 'work') ui.hud();
  },
  selectItem(item) {
    selected = item;
    audio.start();
    audio.select();
    updateProgress();
    renderer.setTray(buildTray(trayContents()));
  },
  pickWipe() { ui.pickWipe(); },
  setView,
  mark() { audio.pick(); },
};

/* The products standing on the counter are the ones that have actually been
 * used, plus whatever is selected — a tray that held the whole shop would hide
 * the customer behind forty bottles. */
function trayContents() {
  const out = [];
  const seen = new Set();
  for (const e of paint.applied()) {
    if (seen.has(e.item.product.id)) continue;
    seen.add(e.item.product.id);
    out.push({ ...e.item.product, trayTint: hexTint(e.item.shade.hex) });
  }
  if (selected && !seen.has(selected.product.id)) {
    out.push({ ...selected.product, trayTint: hexTint(selected.shade.hex) });
  }
  return out.slice(0, 8);
}

function hexTint(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function onSetting(key, value) {
  saveSettings(settings);
  if (key === 'scale') { renderer.quality.scale = value; renderer.width = 0; resize(); }
  if (key === 'bloom') renderer.quality.bloom = value;
  if (key === 'sound') audio.setEnabled(value);
  if (key === 'assist') paint.assist = value;
  if (key === 'paint') ui.toast('דיוק שכבת הצבע ישתנה בלקוחה הבאה');
}

/* ------------------------------------------------------------------ *
 * The seam the tests drive
 * ------------------------------------------------------------------ */

window.bella = {
  get state() { return state.phase; },
  get renderer() { return renderer; },
  get paint() { return paint; },
  get customer() { return customer; },
  get shift() { return shift; },
  get selected() { return selected; },
  get settings() { return settings; },
  ui: () => ui,
  startShift: (save) => startShift(save),
  openShop,
  finishCustomer,
  charge,
  nextCustomer,
  setView,
  select(productId, shadeId) {
    const item = productShade(productId, shadeId);
    handlers.selectItem(item);
    return item;
  },
  /*
   * Paint a zone the way a player would, for tests and for anyone who wants to
   * see the shading without owning a mouse. It goes through the same builder
   * the arrival makeup uses, in passes, because one thin coat is not what a
   * request for 80% coverage means.
   */
  autoApply(productId, shadeId, coverage = 0.8) {
    const item = productShade(productId, shadeId);
    fillZone(paint, item, coverage, makeRng(`${productId}-${shadeId}`));
    paint.flush(true);
    updateProgress();
    reactIfNew();
    return paint.stats();
  },
  mark(itemKey, finish) { ui.markItem = itemKey; ui.markFinish = finish; },
  stats: () => paint.stats(),
};

boot();
