/*
 * ui.js — the DOM half of the game.
 *
 * Text, menus and meters are HTML because HTML is very good at them and a
 * hand-rolled canvas UI would be worse in every way that matters: it would not
 * reflow, would not scale on a phone, would not be selectable, and would not
 * read correctly right-to-left. The canvas underneath never knows this exists.
 */

import { LEVELS, CLASSES } from '../data/levels.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor() {
    this.screens = {
      loading: $('#screen-loading'),
      menu: $('#screen-menu'),
      levels: $('#screen-levels'),
      settings: $('#screen-settings'),
      pause: $('#screen-pause'),
      dead: $('#screen-dead'),
    };
    this.hud = $('#hud');
    this.fadeEl = $('#fade');
    this.logEl = $('#hud-log');
    this.promptEl = $('#hud-prompt');
    this.toastEl = $('#toast');
    this.current = 'menu';
    this.buildLevelGrid();
    this.buildCredits();
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    this.hud.hidden = name !== null;
    this.current = name;
    document.querySelector('#view').classList.toggle('playing', name === null);
    /* The on-screen controls exist only while playing, and only on a device
     * that has no keyboard to press instead. */
    const touch = document.querySelector('#touch');
    if (touch) touch.hidden = !(name === null && document.body.classList.contains('touch'));
    if (name !== null) {
      const rotate = document.querySelector('#rotate');
      if (rotate) rotate.hidden = true;
    }
  }

  /* ---------------------------------------------------------------- *
   * Level select
   * ---------------------------------------------------------------- */

  buildLevelGrid() {
    const grid = $('#level-grid');
    grid.textContent = '';
    this.cards = [];
    for (const lv of LEVELS) {
      const cls = CLASSES[lv.cls] || CLASSES[1];
      const card = document.createElement('button');
      card.className = 'level-card' + (lv.canon ? ' canon' : '');
      card.style.setProperty('--cls', cls.color);
      card.dataset.id = lv.id;
      card.innerHTML = `
        <span class="num">Level ${lv.id}<span class="seen" data-seen></span></span>
        <span class="en">${escapeHtml(lv.name)}</span>
        <span class="he">${escapeHtml(lv.nameHe)}</span>
        <span class="cls">${cls.he}</span>`;
      card.title = lv.note;
      card.addEventListener('click', () => this.onPick && this.onPick(lv.id));
      grid.appendChild(card);
      this.cards.push({ el: card, level: lv });
    }

    const search = $('#level-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const { el, level } of this.cards) {
        const hit = !q
          || String(level.id) === q
          || level.name.toLowerCase().includes(q)
          || level.nameHe.includes(q)
          || level.note.includes(q);
        el.style.display = hit ? '' : 'none';
      }
    });
  }

  markVisited(visited, deepest) {
    for (const { el, level } of this.cards) {
      el.querySelector('[data-seen]').textContent = visited.includes(level.id) ? '✓' : '';
    }
    const canon = LEVELS.filter((l) => l.canon).length;
    $('#levels-foot').innerHTML =
      `נראו ${visited.length} מתוך ${LEVELS.length} רמות · העמוק ביותר: Level ${deepest}. `
      + `הרמות המסומנות ב־★ (${canon}) בנויות לפי התיעוד המוכר של הקהילה; `
      + `כל השאר נכתבו במיוחד לגרסה הזו, באותה שפה.`;
  }

  buildCredits() {
    $('#menu-credits').innerHTML =
      'נבנה מאפס: WebGL2, טקסטורות פרוצדורליות, עולם שנוצר תוך כדי הליכה ואודיו מסונתז. '
      + 'ללא ספריות, ללא קבצי מדיה, הכל רץ בדפדפן.';
  }

  /* ---------------------------------------------------------------- *
   * Loading
   * ---------------------------------------------------------------- */

  setLoading(pct, note, label) {
    if (label) $('#load-level').textContent = label;
    if (note) $('#load-note').textContent = note;
    $('#load-bar i').style.width = `${Math.round(pct * 100)}%`;
  }

  /* ---------------------------------------------------------------- *
   * HUD
   * ---------------------------------------------------------------- */

  setLevelCard(level) {
    const cls = CLASSES[level.cls] || CLASSES[1];
    $('#hud-num').textContent = `LEVEL ${level.id}`;
    $('#hud-name').textContent = level.name;
    const el = $('#hud-class');
    el.textContent = `${level.nameHe} · ${cls.he}`;
    el.style.color = cls.color;
  }

  updateHUD(player, stats) {
    $('#m-sanity i').style.width = `${player.sanity * 100}%`;
    $('#m-stamina i').style.width = `${player.stamina * 100}%`;
    $('#m-health i').style.width = `${player.health * 100}%`;
    $('#it-almond').textContent = `🥛 ${player.almond}`;
    $('#it-batt').textContent = `🔦 ${Math.round(player.battery * 100)}%`;
    $('#it-note').textContent = `📄 ${player.notes}`;
    if (stats) $('#hud-stats').textContent = stats;
  }

  prompt(text) {
    if (!text) { this.promptEl.hidden = true; return; }
    this.promptEl.innerHTML = text;
    this.promptEl.hidden = false;
  }

  log(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.logEl.appendChild(div);
    setTimeout(() => div.remove(), 4600);
    while (this.logEl.children.length > 4) this.logEl.firstChild.remove();
  }

  toast(text, ms = 3200) {
    this.toastEl.innerHTML = text;
    this.toastEl.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.toastEl.hidden = true; }, ms);
  }

  /* Returns a promise that resolves when the fade has finished, so a level
   * swap can happen behind a black screen rather than in front of one. */
  fade(on) {
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, on ? 520 : 60));
  }

  died(level, reason) {
    $('#dead-title').textContent = reason || 'לא יצאת';
    $('#dead-note').textContent =
      `Level ${level.id} — ${level.name}. ${level.nameHe}.`;
    this.show('dead');
  }

  setPauseWhere(level) {
    $('#pause-where').textContent = `LEVEL ${level.id} · ${level.name}`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
