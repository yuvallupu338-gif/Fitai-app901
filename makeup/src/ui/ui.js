/*
 * ui.js — the DOM half of the game.
 *
 * It owns every panel, knows nothing about WebGL, and talks to the game through
 * a handlers object. The split is worth keeping strict: the tray, the request
 * card and the till are all list rendering, and the moment they start reaching
 * into the paint layer they stop being replaceable.
 *
 * The one piece of real design in here is the request card. It is on screen for
 * the entire customer and it updates live — each line of the request lights up
 * as what is on the face starts to match it. A checklist that only reveals its
 * answers at the end is a memory test; one that responds while you work is a
 * tutorial that never has to say anything.
 */

import {
  CATEGORIES, FINISH_HE, FAMILY_HE, byCategory, itemName,
} from '../data/products.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const SCREENS = ['title', 'help', 'settings', 'day', 'register', 'result', 'endday'];

export class UI {
  constructor(handlers) {
    this.on = handlers;
    this.selected = null;         /* { product, shade } */
    this.category = 'foundation';
    this.hints = true;
    this._toastTimer = 0;
    this._speechTimer = 0;
    this._bind();
  }

  /* ---------------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------------- */

  _bind() {
    $('btn-new').onclick = () => this.on.newShift();
    $('btn-continue').onclick = () => this.on.continueShift();
    $('btn-help').onclick = () => this.show('help');
    $('btn-settings').onclick = () => this.show('settings');
    for (const b of document.querySelectorAll('.close-help')) b.onclick = () => this.show('title');
    for (const b of document.querySelectorAll('.close-settings')) b.onclick = () => this.on.closeSettings();
    $('btn-open').onclick = () => this.on.openShop();
    $('btn-done').onclick = () => this.on.finishCustomer();
    $('btn-charge').onclick = () => this.on.charge();
    $('btn-next').onclick = () => this.on.nextCustomer();
    $('btn-nextday').onclick = () => this.on.nextDay();
    $('btn-endday-menu').onclick = () => this.on.toMenu();
    $('btn-reset').onclick = () => this.on.reset();
    $('btn-wipe').onclick = () => this.on.pickWipe();
    $('req-collapse').onclick = () => {
      const r = $('request');
      r.classList.toggle('collapsed');
      $('req-collapse').textContent = r.classList.contains('collapsed') ? '›' : '‹';
    };
    for (const b of document.querySelectorAll('.tool[data-view]')) {
      b.onclick = () => {
        for (const o of document.querySelectorAll('.tool[data-view]')) o.classList.remove('on');
        b.classList.add('on');
        this.on.setView(b.dataset.view);
      };
    }
  }

  bindSettings(settings, onChange) {
    const wire = (id, key, read, write) => {
      const node = $(id);
      write(node, settings[key]);
      node.oninput = () => {
        settings[key] = read(node);
        if (id === 'set-hints') this.hints = settings.hints;
        onChange(key, settings[key]);
      };
    };
    wire('set-scale', 'scale', (n) => +n.value, (n, v) => {
      n.value = v; $('out-scale').textContent = Math.round(v * 100) + '%';
    });
    $('set-scale').addEventListener('input', () => {
      $('out-scale').textContent = Math.round($('set-scale').value * 100) + '%';
    });
    wire('set-paint', 'paint', (n) => +n.value, (n, v) => { n.value = String(v); });
    wire('set-assist', 'assist', (n) => +n.value, (n, v) => {
      n.value = v; $('out-assist').textContent = Math.round(v * 100) + '%';
    });
    $('set-assist').addEventListener('input', () => {
      $('out-assist').textContent = Math.round($('set-assist').value * 100) + '%';
    });
    wire('set-bloom', 'bloom', (n) => n.checked, (n, v) => { n.checked = !!v; });
    wire('set-sound', 'sound', (n) => n.checked, (n, v) => { n.checked = !!v; });
    wire('set-hints', 'hints', (n) => n.checked, (n, v) => { n.checked = !!v; });
    this.hints = settings.hints;
  }

  /* ---------------------------------------------------------------- *
   * Screens
   * ---------------------------------------------------------------- */

  show(name) {
    for (const s of SCREENS) {
      const node = $('screen-' + s);
      if (node) node.hidden = s !== name;
    }
    $('hud').hidden = name !== null;
    this.current = name;
  }

  hud() { this.show(null); }

  loading(on, title) {
    $('loading').hidden = !on;
    if (title) $('load-title').textContent = title;
  }

  toast(text, ms = 2200) {
    const node = $('toast');
    node.textContent = text;
    node.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { node.hidden = true; }, ms);
  }

  fatal(message) {
    const node = $('fatal');
    node.hidden = false;
    node.innerHTML = '';
    node.append(el('div', null, message));
  }

  setContinue(available) { $('btn-continue').hidden = !available; }

  /* ---------------------------------------------------------------- *
   * HUD
   * ---------------------------------------------------------------- */

  setHud({ day, index, total, money, reputation }) {
    $('hud-day').textContent = `יום ${day}`;
    $('hud-queue').textContent = `לקוחה ${Math.min(index + 1, total)}/${total}`;
    $('hud-money').textContent = `₪${money}`;
    $('hud-rep').textContent = stars(Math.round(reputation));
  }

  /*
   * Fill the request card. Every want becomes a line the player can tick off by
   * looking at it, and the avoid list is spelled out rather than hidden — a
   * customer who tells you what she does not want is a fair customer, and one
   * who does not is a guessing game.
   */
  setCustomer(c) {
    $('req-name').textContent = c.name + (c.returning ? ' · חוזרת' : '');
    $('req-sub').textContent = `${c.persona.he} · ${c.tone.he}`;
    $('req-look').textContent = c.look.he;
    $('req-brief').textContent = c.look.brief;
    $('req-arrival').textContent = c.arrivalNote || '';
    $('req-arrival').hidden = !c.arrivalNote;

    const list = $('req-list');
    list.innerHTML = '';
    this.wantNodes = [];
    for (const want of c.look.wants) {
      const li = el('li');
      li.append(el('span', 'dot'));
      const b = el('b', null, CATEGORIES[want.cat].he);
      li.append(b);
      const bits = [];
      if (want.finish) bits.push([].concat(want.finish).map((f) => FINISH_HE[f]).join('/'));
      if (want.family) bits.push([].concat(want.family).map((f) => FAMILY_HE[f] || f).join('/'));
      if (bits.length) li.append(el('span', 'why', bits.join(' · ')));
      list.append(li);
      this.wantNodes.push({ want, li });
    }

    const avoid = $('req-avoid');
    avoid.innerHTML = '';
    if (c.look.avoid.length) {
      avoid.append(el('b', null, 'לא רוצה: '));
      avoid.append(document.createTextNode(
        c.look.avoid.map((a) => `${CATEGORIES[a.cat].he}${a.finish ? ' ' + FINISH_HE[a.finish] : ''}`).join(' · ')));
    }

    this.buildTray(c);
    this.setSpeech(c.greeting, 4200);
  }

  /* Live progress. Green when the zone is covered with the right kind of
   * product, amber when something of that category is on but not enough. */
  updateWants(stats, applied) {
    if (!this.wantNodes) return;
    for (const { want, li } of this.wantNodes) {
      li.classList.remove('done', 'part');
      if (!this.hints) continue;
      const zone = CATEGORIES[want.cat].zone;
      const used = applied.find((e) => e.item.product.cat === want.cat);
      if (!used) continue;
      const coverage = zone && stats[zone] ? stats[zone].coverage : 0;
      li.classList.add(coverage >= want.coverage * 0.8 ? 'done' : 'part');
    }
  }

  setTimer(fraction) {
    const bar = $('req-timer');
    bar.querySelector('i').style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    bar.classList.toggle('low', fraction < 0.25);
  }

  setSpeech(text, ms = 3600) {
    const node = $('speech');
    if (!text) { node.hidden = true; return; }
    node.querySelector('span').textContent = text;
    node.hidden = false;
    /* Restart the entrance animation: without this a second line inside the
     * bubble's lifetime appears with no movement and is easy to miss. */
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
    clearTimeout(this._speechTimer);
    this._speechTimer = setTimeout(() => { node.hidden = true; }, ms);
  }

  /* ---------------------------------------------------------------- *
   * Tray
   * ---------------------------------------------------------------- */

  buildTray(c) {
    const cats = $('tray-cats');
    cats.innerHTML = '';
    const wanted = new Set(c ? c.look.wants.map((w) => w.cat) : []);
    const order = Object.keys(CATEGORIES)
      .filter((k) => byCategory(k).length)
      .sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order);

    for (const key of order) {
      const b = el('button', 'cat', CATEGORIES[key].he);
      b.dataset.cat = key;
      if (wanted.has(key) && this.hints) b.classList.add('want');
      b.onclick = () => this.selectCategory(key);
      cats.append(b);
    }
    this.selectCategory(wanted.has('foundation') ? 'foundation' : order[1] || order[0]);
  }

  selectCategory(key) {
    this.category = key;
    for (const b of document.querySelectorAll('#tray-cats button')) {
      b.classList.toggle('on', b.dataset.cat === key);
    }
    const list = $('tray-products');
    list.innerHTML = '';
    const items = byCategory(key);
    for (const p of items) {
      const b = el('button', 'prod');
      b.append(el('span', 'nm', p.he));
      b.append(el('span', 'fin', FINISH_HE[p.finish] || ''));
      b.append(el('span', 'price', p.price ? `₪${p.price}` : 'חינם'));
      b.dataset.id = p.id;
      b.onclick = () => this.selectProduct(p);
      list.append(b);
    }
    if (items.length) this.selectProduct(items[0]);
    else { $('tray-shades').innerHTML = ''; }
  }

  selectProduct(p) {
    for (const b of document.querySelectorAll('#tray-products .prod')) {
      b.classList.toggle('on', b.dataset.id === p.id);
    }
    const strip = $('tray-shades');
    strip.innerHTML = '';
    strip.classList.toggle('labelled', p.shades.length > 1);
    for (const s of p.shades) {
      const b = el('button', 'sw');
      b.style.background = s.hex;
      b.dataset.shade = s.id;
      b.title = s.he;
      b.append(el('span', 'lbl', s.he));
      b.onclick = () => this.selectShade(p, s);
      strip.append(b);
    }
    this.selectShade(p, p.shades[0]);
  }

  selectShade(p, s) {
    for (const b of document.querySelectorAll('#tray-shades .sw')) {
      b.classList.toggle('on', b.dataset.shade === s.id);
    }
    this.selected = { product: p, shade: s };
    $('tray-name').textContent = itemName(this.selected);
    $('tray-blurb').textContent = p.blurb || '';
    this.on.selectItem(this.selected);
  }

  /* Jump the tray straight to the remover, which is the one product a player
   * reaches for in a hurry. */
  pickWipe() {
    this.selectCategory('tool');
  }

  setCoverage(text) { $('tray-cov').textContent = text || ''; }

  /*
   * Whose work the face is, when it is not the game's own.
   *
   * On screen rather than in a credits list, because the licences these models
   * come under require the attribution to travel with the thing, and a credit
   * nobody sees is not one.
   */
  setCredit(text) {
    const el = $('credit');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  /* ---------------------------------------------------------------- *
   * Register
   * ---------------------------------------------------------------- */

  /*
   * The till. Left is what she is buying; right is the card the player fills in
   * about her. Both are on screen together on purpose — the receipt is the list
   * of everything that went on her face, which is exactly the list the player
   * needs in order to answer the question next to it.
   */
  showRegister(c, till, applied) {
    $('rc-customer').textContent = `${c.name} · ${c.look.he}`;
    const lines = $('rc-lines');
    lines.innerHTML = '';
    for (const l of till.lines) {
      const li = el('li');
      li.append(el('span', null, l.name));
      li.append(el('b', null, `₪${l.price}`));
      lines.append(li);
    }
    if (!till.lines.length) {
      lines.append(el('li', null, 'לא נעשה שימוש במוצרים'));
    }
    $('rc-products').textContent = `₪${till.products}`;
    $('rc-service').textContent = `₪${till.service}`;
    $('rc-total').textContent = `₪${till.total}`;

    this.markItem = null;
    this.markFinish = null;

    const itemBox = $('mark-items');
    itemBox.innerHTML = '';
    const options = applied.slice(0, 8);
    for (const e of options) {
      const b = el('button');
      const dab = el('span', 'dab');
      dab.style.background = e.item.shade.hex;
      b.append(dab, el('span', null, e.name));
      b.onclick = () => {
        this.markItem = e.key;
        for (const o of itemBox.children) o.classList.remove('on');
        b.classList.add('on');
        this.on.mark();
      };
      itemBox.append(b);
    }
    const none = el('button', null, 'שום דבר במיוחד');
    none.onclick = () => {
      this.markItem = null;
      for (const o of itemBox.children) o.classList.remove('on');
      none.classList.add('on');
      this.on.mark();
    };
    itemBox.append(none);

    const finBox = $('mark-finish');
    finBox.innerHTML = '';
    const finishes = [...new Set(options.map((e) => e.item.product.finish))];
    if (!finishes.length) finishes.push('matte', 'satin');
    for (const f of finishes) {
      const b = el('button', null, FINISH_HE[f] || f);
      b.onclick = () => {
        this.markFinish = f;
        for (const o of finBox.children) o.classList.remove('on');
        b.classList.add('on');
        this.on.mark();
      };
      finBox.append(b);
    }
    this.show('register');
  }

  /* ---------------------------------------------------------------- *
   * Result
   * ---------------------------------------------------------------- */

  showResult(c, result, marking, till, quote) {
    $('res-title').textContent = `${c.name} · ${c.look.he}`;
    $('res-stars').innerHTML = '';
    for (let i = 0; i < 5; i++) {
      $('res-stars').append(el('span', i < result.stars ? '' : 'off', '★'));
    }
    $('res-score').textContent = result.score;
    $('res-quote').textContent = quote;

    const list = $('res-parts');
    list.innerHTML = '';
    for (const part of result.parts) {
      const li = el('li');
      const bar = el('div', 'bar' + (part.score >= 0.75 ? '' : part.score >= 0.4 ? ' mid' : ' bad'));
      const fill = el('i');
      fill.style.width = `${Math.round(part.score * 100)}%`;
      bar.append(fill);
      li.append(bar, el('b', null, part.label), el('span', 'note', part.note));
      list.append(li);
    }

    const extra = $('res-extra');
    extra.innerHTML = '';
    if (result.shade) {
      extra.append(el('div', result.shade.score > 0.7 ? 'ok' : 'warn',
        `גוון הבסיס: ${result.shade.note} (ΔE ${result.shade.deltaE.toFixed(1)})`));
    }
    for (const v of result.violations) {
      extra.append(el('div', 'warn', `ביקשה בלי ${v.label} — «${v.why}»`));
    }
    if (result.mess.penalty > 0.2) {
      extra.append(el('div', 'warn',
        `${Math.round(result.mess.ratio * 100)}% מהמוצר נחת מחוץ לאזור שלו`));
    }

    $('res-products').textContent = `₪${till.products}`;
    $('res-service').textContent = `₪${till.service}`;
    $('res-tip').textContent = `₪${till.tip}`;
    $('res-take').textContent = `₪${till.take}`;

    const mark = $('res-mark');
    mark.innerHTML = '';
    if (marking) {
      mark.append(el('div', marking.itemRight ? 'hit' : 'miss',
        marking.itemRight
          ? `סימנת נכון: ${marking.truth.itemName}`
          : marking.truth.itemName
            ? `הכי אהבה: ${marking.truth.itemName}`
            : 'שום דבר לא ממש דיבר אליה'));
      if (marking.truth.finishHe) {
        mark.append(el('div', marking.finishRight ? 'hit' : 'miss',
          marking.finishRight
            ? `וגם את הסוג: ${marking.truth.finishHe}`
            : `הסוג שהיא מעדיפה: ${marking.truth.finishHe}`));
      }
    }
    this.show('result');
  }

  showEndDay(summary, money) {
    $('end-title').textContent = `יום ${summary.day} נסגר`;
    const tally = $('end-tally');
    tally.innerHTML = '';
    const rows = [
      ['לקוחות', summary.customers],
      ['הכנסה היום', `₪${summary.take}`],
      ['יעד', `₪${summary.target}`],
      ['ממוצע כוכבים', summary.stars.toFixed(1)],
      ['בקופה', `₪${money}`],
    ];
    for (const [k, v] of rows) {
      const li = el('li');
      li.append(el('span', null, k), el('b', null, String(v)));
      tally.append(li);
    }
    $('end-note').textContent = summary.hitTarget
      ? 'עמדת ביעד. מחר יהיה עמוס יותר.'
      : 'לא הגעת ליעד היום. זה קורה — מחר יש עוד לקוחות.';
    this.show('endday');
  }

  setDay(day, target, customers) {
    $('day-title').textContent = `יום ${day}`;
    $('day-note').textContent = `${customers} לקוחות בתור · יעד ₪${target}`;
    this.show('day');
  }
}

function stars(n) {
  const k = Math.max(0, Math.min(5, n));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}
