/*
 * ui.js — the DOM half of the game.
 *
 * Text, menus and meters are HTML because HTML is very good at them and a
 * hand-rolled canvas UI would be worse in every way that matters here: it
 * would not reflow, would not scale on a phone, would not respect the reader's
 * text size, and would not lay out right-to-left. The canvas underneath never
 * knows this exists.
 *
 * The clock is the exception to every rule about restraint in a horror HUD. It
 * is large, it is always on, and under a minute it turns red — because the
 * whole game is an argument with a five-minute deadline and hiding the
 * deadline would not make it tenser, only vaguer.
 */

import { NIGHTS, TOTAL_NIGHTS } from '../game/nights.js';
import { COLLECTIBLES } from '../game/story.js';
import { PLAN } from '../world/layout.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor() {
    this.screens = {
      loading: $('#screen-loading'),
      menu: $('#screen-menu'),
      nights: $('#screen-nights'),
      archive: $('#screen-archive'),
      settings: $('#screen-settings'),
      pause: $('#screen-pause'),
      night: $('#screen-night'),
      read: $('#screen-read'),
    };
    this.hud = $('#hud');
    this.fadeEl = $('#fade');
    this.flashEl = $('#flash');
    this.logEl = $('#hud-log');
    this.promptEl = $('#hud-prompt');
    this.subtitleEl = $('#subtitle');
    this.toastEl = $('#toast');
    this.mapEl = $('#map');
    this.mapCanvas = $('#map-canvas');
    this.current = 'menu';
    this.buildNightGrid();
    this.buildCredits();
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    this.hud.hidden = name !== null;
    this.current = name;
    $('#view').classList.toggle('playing', name === null);
    const touch = $('#touch');
    if (touch) touch.hidden = !(name === null && document.body.classList.contains('touch'));
    if (name !== null) {
      const rotate = $('#rotate');
      if (rotate) rotate.hidden = true;
      this.setMap(false);
    }
  }

  /* ---------------------------------------------------------------- *
   * Menus
   * ---------------------------------------------------------------- */

  buildNightGrid() {
    const grid = $('#night-grid');
    grid.textContent = '';
    this.nightCards = [];
    for (const n of NIGHTS) {
      const card = document.createElement('button');
      card.className = 'night-card';
      card.dataset.n = n.n;
      card.innerHTML = `
        <span class="n">${n.n}</span>
        <span class="name">${escapeHtml(n.title)}</span>
        <span class="note">${escapeHtml(n.note)}</span>
        <span class="best" data-best></span>`;
      card.addEventListener('click', () => this.onPickNight && this.onPickNight(n.n));
      grid.appendChild(card);
      this.nightCards.push({ el: card, night: n });
    }
  }

  markProgress(state) {
    for (const { el, night } of this.nightCards) {
      const done = state.cleared.includes(night.n);
      const reachable = night.n <= state.night;
      el.classList.toggle('done', done);
      el.classList.toggle('now', !done && night.n === state.night);
      el.classList.toggle('locked', !reachable);
      el.disabled = !reachable;
      el.querySelector('[data-best]').textContent = done ? 'הדגל הגיע הביתה' : '';
    }
    $('#nights-foot').innerHTML =
      `${state.cleared.length} דגלים מתוך ${TOTAL_NIGHTS}. `
      + `הלילות נפתחים לפי הסדר — לילה שנכשל מתחיל מחדש, לא הריצה. `
      + `<span class="seedline">מספר השכונה: <b>${state.seed}</b></span>`;
    this.buildArchive(state);
  }

  buildArchive(state) {
    const list = $('#archive-list');
    list.textContent = '';
    for (const c of COLLECTIBLES) {
      const found = state.found.includes(c.id);
      const card = document.createElement('button');
      card.className = 'arch-item' + (found ? '' : ' empty');
      card.type = 'button';
      card.innerHTML = found
        ? `<span class="t">${escapeHtml(c.title)}</span>`
          + `<span class="m">${kindName(c.kind)}</span>`
        : `<span class="t">— לא נמצא —</span>`
          + `<span class="m">${kindName(c.kind)}</span>`;
      if (found) card.addEventListener('click', () => this.read(c));
      list.appendChild(card);
    }
    $('#archive-foot').textContent =
      `${state.found.length} מתוך ${COLLECTIBLES.length}. הם מפוזרים בבתים, `
      + 'ורובם בבתים שנעולים ברוב הלילות.';
  }

  buildCredits() {
    $('#menu-credits').innerHTML =
      'נבנה מאפס: WebGL2, טקסטורות פרוצדורליות, סאונד מסונתז וללא קבצי מדיה. '
      + 'הכל רץ בדפדפן, בלי ספריות ובלי שרת.';
  }

  read(item) {
    $('#read-title').textContent = item.title;
    $('#read-body').textContent = item.text;
    $('#read-foot').textContent = kindName(item.kind);
    this.show('read');
  }

  /* ---------------------------------------------------------------- *
   * Loading
   * ---------------------------------------------------------------- */

  setLoading(pct, note, label) {
    if (label) $('#load-title').textContent = label;
    if (note) $('#load-note').textContent = note;
    $('#load-bar i').style.width = `${Math.round(pct * 100)}%`;
  }

  /* ---------------------------------------------------------------- *
   * HUD
   * ---------------------------------------------------------------- */

  setClock(text, progress, timeLeft, phase) {
    const el = $('#clock');
    el.textContent = text;
    const bar = $('#whistle-bar i');
    bar.style.width = `${Math.round((1 - progress) * 100)}%`;
    const urgent = timeLeft <= 60 && phase !== 'grace';
    $('#hud-clock').classList.toggle('urgent', urgent);
    $('#hud-clock').classList.toggle('grace', phase === 'grace');
  }

  setNight(n, flags) {
    $('#hud-night').textContent = `לילה ${n} מתוך ${TOTAL_NIGHTS} · ${flags} דגלים`;
  }

  /* The suspicion ring. Hidden entirely at zero: a meter that is always on
   * screen becomes furniture, and this one has to mean something the moment it
   * appears. */
  setSuspicion(v) {
    const el = $('#susp');
    el.hidden = v < 0.02;
    el.style.setProperty('--v', v.toFixed(3));
    el.classList.toggle('high', v > 0.6);
  }

  setItems(flags, torchOn, found, carrying) {
    const f = $('#it-flags');
    f.textContent = `🚩 ${flags}/${TOTAL_NIGHTS}`;
    f.classList.toggle('has', !!carrying);
    const t = $('#it-torch');
    t.textContent = torchOn ? '🔦 דולק' : '🔦 כבוי';
    t.classList.toggle('on', !!torchOn);
    $('#it-found').textContent = `📓 ${found}/${COLLECTIBLES.length}`;
  }

  setBreath(v) {
    $('#m-breath i').style.width = `${Math.round(v * 100)}%`;
    /* Amber under a quarter, which is also where the gasping starts — the
     * meter and the noise you are making have to agree. */
    $('#m-breath').classList.toggle('low', v < 0.25);
  }

  setHide(fraction) {
    const el = $('#hud-hide');
    el.hidden = fraction === null;
    if (fraction === null) return;
    el.querySelector('i').style.width = `${Math.round(fraction * 100)}%`;
    el.classList.toggle('low', fraction < 0.3);
  }

  setGuide(angle, dist, label, carrying) {
    const el = $('#guide');
    if (angle === null) { el.hidden = true; return; }
    el.hidden = false;
    $('#guide-arrow').style.transform = `rotate(${angle}rad)`;
    $('#guide-dist').textContent = `${Math.round(dist)}m`;
    $('#guide-label').textContent = label;
    el.classList.toggle('close', dist < 10);
    /* Faint at range. A bright permanent marker turns the neighbourhood into a
     * corridor with an arrow in it, which is not what anyone came for. */
    el.classList.toggle('faint', dist > 55);
    el.classList.toggle('carry', !!carrying);
  }

  prompt(text) {
    if (!text) { this.promptEl.hidden = true; return; }
    this.promptEl.innerHTML = text;
    this.promptEl.hidden = false;
  }

  subtitle(text, ms = 4200) {
    if (!text) { this.subtitleEl.hidden = true; return; }
    this.subtitleEl.textContent = text;
    this.subtitleEl.hidden = false;
    clearTimeout(this._subT);
    this._subT = setTimeout(() => { this.subtitleEl.hidden = true; }, ms);
  }

  log(text, hot) {
    const div = document.createElement('div');
    if (hot) div.className = 'hot';
    div.textContent = text;
    this.logEl.appendChild(div);
    setTimeout(() => div.remove(), 4600);
    while (this.logEl.children.length > 4) this.logEl.firstChild.remove();
  }

  toast(text, ms = 3400, hot) {
    this.toastEl.innerHTML = text;
    this.toastEl.classList.toggle('hot', !!hot);
    this.toastEl.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.toastEl.hidden = true; }, ms);
  }

  stats(text) { $('#hud-stats').textContent = text; }

  /* Returns a promise that resolves when the fade has finished, so a night
   * change happens behind a black screen rather than in front of one. */
  fade(on) {
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, on ? 520 : 60));
  }

  /* The scream, as one short shake of the whole interface. The stylesheet
   * turns it off under prefers-reduced-motion, which is why it is a class
   * rather than an inline animation. */
  shake() {
    const ui = document.querySelector('#ui');
    ui.classList.remove('shake');
    /* Reading offsetWidth is what restarts a CSS animation that is already on
     * the element; without it a second scream inside half a second does
     * nothing at all. */
    void ui.offsetWidth;
    ui.classList.add('shake');
    clearTimeout(this._shakeT);
    this._shakeT = setTimeout(() => ui.classList.remove('shake'), 500);
  }

  flash(kind, ms = 90) {
    this.flashEl.className = kind || '';
    if (!kind) return;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { this.flashEl.className = ''; }, ms);
  }

  /* ---------------------------------------------------------------- *
   * Night end
   * ---------------------------------------------------------------- */

  nightOver({ eyebrow, title, note, again = true }) {
    $('#night-eyebrow').textContent = eyebrow;
    $('#night-title').textContent = title;
    $('#night-note').innerHTML = note;
    $('#btn-again').hidden = !again;
    this.show('night');
  }

  setPauseWhere(text) { $('#pause-where').textContent = text; }

  /* ---------------------------------------------------------------- *
   * The map
   *
   * Drawn from the same layout the world is built from, so it cannot lie about
   * the street. It deliberately does not show her: a map with a moving dot on
   * it is a stealth game about a map, and this one is about listening.
   * ---------------------------------------------------------------- */

  setMap(on) {
    this.mapEl.hidden = !on;
    this.mapOn = on;
  }

  drawMap(layout, player, known) {
    if (!this.mapOn) return;
    const c = this.mapCanvas;
    const ctx = c.getContext('2d');
    const b = layout.bounds;
    const pad = 14;
    const sx = (c.width - pad * 2) / (b.x1 - b.x0);
    const sz = (c.height - pad * 2) / (b.z1 - b.z0);
    const X = (x) => pad + (x - b.x0) * sx;
    const Z = (z) => pad + (z - b.z0) * sz;

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0a0f16';
    ctx.fillRect(0, 0, c.width, c.height);

    /* Roads first, as fat strokes. */
    ctx.strokeStyle = '#1c2733';
    ctx.lineWidth = PLAN.roadHalf * 2 * sx;
    ctx.beginPath();
    ctx.moveTo(X(PLAN.pineX[0]), Z(0));
    ctx.lineTo(X(PLAN.pineX[1]), Z(0));
    ctx.moveTo(X(0), Z(PLAN.elmZ[0]));
    ctx.lineTo(X(0), Z(PLAN.elmZ[1]));
    ctx.stroke();

    /* The park and the green. */
    ctx.fillStyle = '#12220f';
    for (const g of [PLAN.park, PLAN.green]) {
      ctx.fillRect(X(g.x0), Z(g.z0), (g.x1 - g.x0) * sx, (g.z1 - g.z0) * sz);
    }

    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const h of layout.houses) {
      ctx.fillStyle = h.home ? '#2b3a2a' : h.abandoned ? '#1a1416' : '#232c36';
      ctx.fillRect(X(h.x - h.w / 2), Z(h.z0), h.w * sx, h.d * sz);
      ctx.strokeStyle = h.home ? '#8ec07c' : '#37424f';
      ctx.lineWidth = h.home ? 2 : 1;
      ctx.strokeRect(X(h.x - h.w / 2), Z(h.z0), h.w * sx, h.d * sz);
      ctx.fillStyle = '#7d8894';
      ctx.fillText(String(h.number), X(h.x), Z((h.z0 + h.z1) / 2) + 4);
    }

    /* The flag, once the player has a reason to know where it is. */
    if (known && known.x !== undefined) {
      ctx.fillStyle = '#c0261f';
      ctx.beginPath();
      ctx.arc(X(known.x), Z(known.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }

    /* You, as a triangle pointing where you are looking. */
    const px = X(player.pos.x), pz = Z(player.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#e8a33c';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    $('#map-legend').innerHTML =
      '<b>M</b> סגירה · הבית שלך מסומן בירוק · הדגל באדום, אם אתה יודע איפה הוא';
  }
}

function kindName(kind) {
  return kind === 'journal' ? 'יומן' : kind === 'tape' ? 'קלטת' : 'תצלום';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
