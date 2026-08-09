/*
 * menu.js — the front end: main menu, pause, settings, journal, credits, and
 * the card at the end of a run.
 *
 * The menu does not sit on a still image. It sits on the live renderer,
 * pointed at an empty platform with the tunnel mouth at one end, and every
 * thirty seconds or so a train goes through without stopping. It is the same
 * world, the same lights and the same sound; the player has been standing on
 * that platform since before they pressed anything.
 */

import { escapeHtml } from './hud.js';
import { DEFAULT_SETTINGS, QUALITY_PRESETS } from '../core/store.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { ENDINGS, ENDING_ORDER, TOTAL_ENDINGS } from '../game/endings.js';
import { CLUES, TOTAL_CLUES } from '../game/clues.js';

export class Menu {
  constructor(root, { settings, profile, events, sfx, callbacks }) {
    this.root = root;
    this.settings = settings;
    this.profile = profile;
    this.events = events;
    this.sfx = sfx;
    this.cb = callbacks;
    this.screen = null;
    this.runState = null;
    this._actions = {};

    this.root.addEventListener('mouseover', (e) => {
      if (e.target.closest('.btn')) this.sfx?.play('uiMove', { caption: false });
    });
    /* One delegated listener for the life of the menu. Screens swap the
       action table rather than adding their own handler, which is what stops
       a button on page four from also firing page one's callback. */
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const fn = this._actions[btn.dataset.act];
      if (!fn) return;
      this.sfx?.play(btn.dataset.act === 'back' ? 'uiBack' : 'uiSelect', { caption: false });
      fn();
    });
  }

  get isOpen() { return this.root.classList.contains('open'); }

  close() {
    this.root.classList.remove('open', 'pause');
    this.root.innerHTML = '';
    this.screen = null;
  }

  _open(kind) {
    this.root.classList.add('open');
    this.root.classList.toggle('pause', kind === 'pause');
    this.screen = kind;
  }

  /* ---- main menu -------------------------------------------------------- */

  showMain({ hasSave = false } = {}) {
    this._open('main');
    const endings = Object.keys(this.profile.endings || {}).length;
    const nightmare = this.profile.nightmareUnlocked;
    this.root.innerHTML = `
      <div class="menu-inner">
        <h1 class="title"><span class="the">The</span>Last Train</h1>
        <p class="tagline">00:47 · northbound · calling at all stations</p>
        <div class="buttons">
          <button class="btn" data-act="play">Play</button>
          <button class="btn" data-act="continue"${hasSave ? '' : ' disabled'}>Continue${hasSave ? '' : '<span class="hint">no journey in progress</span>'}</button>
          ${nightmare ? '<button class="btn" data-act="nightmare">Nightmare Mode<span class="hint">the line is not the same twice</span></button>' : ''}
          <button class="btn" data-act="journal">Journal</button>
          <button class="btn" data-act="settings">Settings</button>
          <button class="btn" data-act="credits">Credits</button>
          <button class="btn" data-act="quit">Quit</button>
        </div>
      </div>
      <div class="corner bl">Line 4 · last service</div>
      <div class="corner br">${endings} of ${TOTAL_ENDINGS} endings found</div>
    `;
    this._wire({
      play: () => this.cb.onPlay({ nightmare: false }),
      continue: () => this.cb.onContinue(),
      nightmare: () => this.cb.onPlay({ nightmare: true }),
      journal: () => this.showJournal('main'),
      settings: () => this.showSettings('main'),
      credits: () => this.showCredits('main'),
      quit: () => this.showQuit(),
    });
  }

  /* ---- pause ------------------------------------------------------------ */

  showPause(runState) {
    this.runState = runState;
    this._open('pause');
    this.root.innerHTML = `
      <div class="menu-inner">
        <h1 class="title" style="font-size:clamp(1.8rem,4vw,2.8rem)">Paused</h1>
        <p class="tagline">${escapeHtml(runState?.stationName || '')}</p>
        <div class="buttons">
          <button class="btn" data-act="resume">Resume</button>
          <button class="btn" data-act="journal">Journal</button>
          <button class="btn" data-act="settings">Settings</button>
          <button class="btn" data-act="menu">Leave the train<span class="hint">return to the main menu — the journey is saved at each station</span></button>
        </div>
      </div>
      <div class="corner bl">${escapeHtml(runState?.clues ?? 0)} of ${TOTAL_CLUES} found</div>
      <div class="corner br">${runState?.nightmare ? 'Nightmare' : ''}</div>
    `;
    this._wire({
      resume: () => this.cb.onResume(),
      journal: () => this.showJournal('pause'),
      settings: () => this.showSettings('pause'),
      menu: () => this.cb.onQuitToMenu(),
    });
  }

  /* ---- settings --------------------------------------------------------- */

  showSettings(from) {
    this._open(from === 'pause' ? 'pause' : 'main');
    const s = this.settings;
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
      <h2>Settings</h2>
      <div class="sub">everything is remembered on this device</div>
      <div class="settings-grid">
        ${group('Sound', [
          slider('volumeMaster', 'Master volume', 0, 1, 0.01, s.volumeMaster, pct),
          slider('volumeAmbient', 'The train', 0, 1, 0.01, s.volumeAmbient, pct),
          slider('volumeSfx', 'Effects', 0, 1, 0.01, s.volumeSfx, pct),
          slider('volumeVoice', 'Announcements', 0, 1, 0.01, s.volumeVoice, pct),
          select('speechVoice', 'Announcement voice', [
            ['synthetic', 'Public address'],
            ['system', 'System speech'],
          ], s.speechVoice, 'The public-address voice is the same on every machine. System speech uses your browser’s.'),
        ])}
        ${group('Looking around', [
          slider('sensitivity', 'Mouse sensitivity', 0.0004, 0.0060, 0.0001, s.sensitivity, (v) => (v * 1000).toFixed(1)),
          toggle('invertY', 'Invert vertical'),
          toggle('invertMouseX', 'Invert horizontal'),
          slider('fov', 'Field of view', 60, 100, 1, s.fov, (v) => `${Math.round(v)}°`),
          slider('headBob', 'Head movement', 0, 1.4, 0.05, s.headBob, pct,
            'How much the walk and the carriage move the camera. Lower it if it bothers you; nothing in the game depends on it.'),
        ])}
        ${group('Picture', [
          select('quality', 'Graphics preset', [
            ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'],
          ], s.quality),
          slider('brightness', 'Brightness', 0.6, 1.7, 0.02, s.brightness, pct,
            'Set this so you can just make out the far end of the carriage.'),
          toggle('reflections', 'Window reflections'),
          toggle('bloom', 'Light bloom'),
          slider('grain', 'Film grain', 0, 2, 0.05, s.grain, pct),
          slider('chromatic', 'Lens aberration', 0, 2, 0.05, s.chromatic, pct),
          slider('vignette', 'Vignette', 0, 1.4, 0.05, s.vignette, pct),
          slider('resolutionScale', 'Resolution scale', 0.5, 1.5, 0.05, s.resolutionScale, pct),
        ])}
        ${group('Reading', [
          toggle('subtitles', 'Subtitles'),
          toggle('soundCaptions', 'Caption sounds', 'Describes sounds you cannot see the cause of. It will tell you that there are footsteps in the next carriage. It will not tell you whose.'),
          slider('subtitleSize', 'Subtitle size', 0.8, 1.8, 0.05, s.subtitleSize, pct),
          toggle('crosshair', 'Crosshair'),
        ])}
      </div>
      <div class="buttons back">
        <button class="btn" data-act="defaults">Restore defaults</button>
        <button class="btn" data-act="back">Back</button>
      </div>
    `;
    this.root.appendChild(page);
    this._bindSettings(page);
    this._wire({
      back: () => (from === 'pause' ? this.showPause(this.runState) : this.showMain({ hasSave: this.cb.hasSave() })),
      defaults: () => {
        Object.assign(this.settings, DEFAULT_SETTINGS);
        this.cb.onSettingsChanged(this.settings);
        this.showSettings(from);
      },
    });
  }

  _bindSettings(page) {
    /* Checkboxes cannot carry their state in the markup the way ranges and
       selects can, so they are set from the settings object once the page is
       in the document. */
    for (const box of page.querySelectorAll('input[type="checkbox"][data-key]')) {
      box.checked = Boolean(this.settings[box.dataset.key]);
    }
    page.addEventListener('input', (e) => {
      const el = e.target;
      const key = el.dataset.key;
      if (!key) return;
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'range') value = parseFloat(el.value);
      else value = el.value;
      this.settings[key] = value;

      const out = el.closest('.setting')?.querySelector('.value');
      if (out && el.dataset.fmt) out.textContent = formatBy(el.dataset.fmt, value);

      if (key === 'quality') {
        const preset = QUALITY_PRESETS[value];
        if (preset) {
          Object.assign(this.settings, preset);
          this.cb.onSettingsChanged(this.settings);
          this.showSettings(this.screen === 'pause' ? 'pause' : 'main');
          return;
        }
      }
      this.cb.onSettingsChanged(this.settings);
    });
  }

  /* ---- journal ---------------------------------------------------------- */

  showJournal(from) {
    this._open(from === 'pause' ? 'pause' : 'main');
    const found = new Set(Object.keys(this.profile.codex || {}));
    const run = this.runState?.clueSet || new Set();
    for (const id of run) found.add(id);

    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
      <h2>Journal</h2>
      <div class="sub">what you have picked up, and where the line goes</div>

      <div class="stats">
        <div class="stat"><div class="k">Found</div><div class="v">${found.size} / ${TOTAL_CLUES}</div></div>
        <div class="stat"><div class="k">Endings</div><div class="v">${Object.keys(this.profile.endings || {}).length} / ${TOTAL_ENDINGS}</div></div>
        <div class="stat"><div class="k">Journeys</div><div class="v">${this.profile.runsCompleted || 0}</div></div>
      </div>

      <h3 style="font-family:var(--cond);letter-spacing:.28em;text-transform:uppercase;font-size:.74rem;color:var(--amber-dim);margin:2.6em 0 1em">Left on the train</h3>
      <div class="cards">
        ${CLUES.map((c) => {
          const has = found.has(c.id);
          return `<div class="card${has ? '' : ' locked'}">
            <div class="k">${escapeHtml(has ? c.kind : '—')}</div>
            <div class="t">${escapeHtml(has ? c.title : 'Not found')}</div>
            <div class="d">${escapeHtml(has ? firstLine(c) : 'Somewhere on the 00:47.')}</div>
          </div>`;
        }).join('')}
      </div>

      <h3 style="font-family:var(--cond);letter-spacing:.28em;text-transform:uppercase;font-size:.74rem;color:var(--amber-dim);margin:2.6em 0 1em">Where it ended</h3>
      <div class="cards">
        ${ENDING_ORDER.map((id) => {
          const e = ENDINGS[id];
          const seen = this.profile.endings?.[id];
          return `<div class="card${seen ? '' : ' locked'}">
            <div class="k">${seen ? `seen ${seen.count}×` : (e.secret ? 'secret' : 'unseen')}</div>
            <div class="t">${escapeHtml(seen ? e.title : '— — —')}</div>
            <div class="d">${escapeHtml(seen ? e.epilogue : 'There is a way to finish the night that you have not found.')}</div>
          </div>`;
        }).join('')}
      </div>

      <h3 style="font-family:var(--cond);letter-spacing:.28em;text-transform:uppercase;font-size:.74rem;color:var(--amber-dim);margin:2.6em 0 1em">Noticed</h3>
      <div class="cards">
        ${ACHIEVEMENTS.map((a) => {
          const has = Boolean(this.profile.achievements?.[a.id]);
          const hide = a.secret && !has;
          return `<div class="card${has ? '' : ' locked'}">
            <div class="k">${has ? 'done' : (a.secret ? 'secret' : '—')}</div>
            <div class="t">${escapeHtml(hide ? '— — —' : a.name)}</div>
            <div class="d">${escapeHtml(hide ? 'Not yet.' : a.desc)}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="buttons back"><button class="btn" data-act="back">Back</button></div>
    `;
    this.root.appendChild(page);
    this._wire({
      back: () => (from === 'pause' ? this.showPause(this.runState) : this.showMain({ hasSave: this.cb.hasSave() })),
    });
  }

  /* ---- credits ---------------------------------------------------------- */

  showCredits(from) {
    this._open(from === 'pause' ? 'pause' : 'main');
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
      <h2>Credits</h2>
      <div class="sub">everything you can see and hear was generated on this machine</div>
      <div class="credits">
        <p>THE LAST TRAIN is a first-person psychological horror game that runs entirely in a browser tab, with no engine, no libraries, no downloaded assets and no network of any kind.</p>

        <h3>Rendering</h3>
        <p>A hand-written WebGL 2 forward renderer. Planar reflections in the window glass, baked vertex occlusion instead of shadow maps, and a post chain of bloom, cold grade, aberration, grain and dither. Every surface — the moquette, the studded floor, the route map, the advertisements, the dot-matrix display, the enamel station signs — is drawn with the 2D canvas API at load, which is why the game can quietly rewrite one of them between two stations.</p>

        <h3>Sound</h3>
        <p>Synthesised with the Web Audio API. The rail joints are scheduled from the train’s speed, the carriage reverb is a generated impulse response, and the public-address voice is a formant synthesiser driven by the syllable count of the line it is reading, band-limited to something the size of a plastic speaker.</p>

        <h3>Design</h3>
        <p>Nothing in this game announces that it is frightening. Passengers do not move while you are looking at them; they move while you are not, and the game never tells you that it happened. If you were watching, you were watching. If you were not, nothing is going to fill you in.</p>

        <h3>With thanks</h3>
        <p>To everyone who has ever been the only person in a carriage at one in the morning and counted the stops.</p>

        <h3>Content</h3>
        <p>Sustained unease, darkness, isolation and implied death. No gore, no jump scares built on sudden loud noise, and no flashing beyond the fluorescent flicker described in the settings. Head movement, grain, aberration and vignette can all be turned down or off.</p>
      </div>
      <div class="buttons back"><button class="btn" data-act="back">Back</button></div>
    `;
    this.root.appendChild(page);
    this._wire({
      back: () => (from === 'pause' ? this.showPause(this.runState) : this.showMain({ hasSave: this.cb.hasSave() })),
    });
  }

  showQuit() {
    this._open('main');
    this.root.innerHTML = `
      <div class="menu-inner">
        <h1 class="title" style="font-size:clamp(1.5rem,3.4vw,2.4rem)">Out of service</h1>
        <p class="tagline">the 00:47 does not run tonight</p>
        <div class="buttons">
          <button class="btn" data-act="back">Back to the platform</button>
        </div>
      </div>
      <div class="corner bl">you may close this tab</div>
    `;
    this._wire({ back: () => this.showMain({ hasSave: this.cb.hasSave() }) });
    /* Only works for windows script opened, which is nearly none of them —
       hence the line above, which is the real answer. */
    try { window.close(); } catch { /* expected */ }
  }

  /* ---- ending ----------------------------------------------------------- */

  showEnding({ ending, state, nightmare }) {
    this._open('ending');
    const card = document.createElement('div');
    card.className = 'ending';
    const paras = ending.lines.map((line, i) =>
      `<p style="animation-delay:${(i * 1.5 + 0.6).toFixed(2)}s">${escapeHtml(line)}</p>`).join('');
    const total = Object.keys(this.profile.endings || {}).length;
    card.innerHTML = `
      <div class="kicker">${nightmare ? 'Nightmare · ' : ''}Ending ${total} of ${TOTAL_ENDINGS}</div>
      <h2>${escapeHtml(ending.title)}</h2>
      ${paras}
      <p class="epilogue" style="animation-delay:${(ending.lines.length * 1.5 + 1.2).toFixed(2)}s">${escapeHtml(ending.epilogue)}</p>
      <div class="stats">
        <div class="stat"><div class="k">Found tonight</div><div class="v">${state.clues.size} / ${TOTAL_CLUES}</div></div>
        <div class="stat"><div class="k">Stations</div><div class="v">${state.stationIndex + 1}</div></div>
        <div class="stat"><div class="k">He spoke</div><div class="v">${state.strangerTalks}×</div></div>
      </div>
      <div class="buttons after">
        <button class="btn" data-act="again">Ride again</button>
        <button class="btn" data-act="journal">Journal</button>
        <button class="btn" data-act="menu">Main menu</button>
      </div>
    `;
    this.root.appendChild(card);
    this._wire({
      again: () => this.cb.onPlay({ nightmare }),
      journal: () => this.showJournal('main'),
      menu: () => this.showMain({ hasSave: this.cb.hasSave() }),
    });
  }

  showFatal(message, detail) {
    this.root.classList.add('open');
    this.root.innerHTML = `
      <div class="fatal">
        <div>
          <h1>The 00:47 is cancelled</h1>
          <p>${escapeHtml(message)}</p>
          <p style="opacity:.55;font-size:.85rem">${escapeHtml(detail || '')}</p>
        </div>
      </div>
    `;
  }

  _wire(actions) {
    this._actions = actions;
  }
}

/* ---- small builders ---------------------------------------------------- */

const pct = (v) => `${Math.round(v * 100)}%`;

function formatBy(kind, v) {
  if (kind === 'pct') return pct(v);
  if (kind === 'deg') return `${Math.round(v)}°`;
  if (kind === 'sens') return (v * 1000).toFixed(1);
  return String(v);
}

function group(title, rows) {
  return `<div class="settings-group"><h3>${escapeHtml(title)}</h3>${rows.join('')}</div>`;
}

function slider(key, label, min, max, step, value, fmt, desc) {
  const kind = fmt === pct ? 'pct' : (label.includes('view') ? 'deg' : (key === 'sensitivity' ? 'sens' : 'raw'));
  return `<div class="setting">
    <label for="set-${key}">${escapeHtml(label)}</label>
    <div class="control">
      <input id="set-${key}" type="range" data-key="${key}" data-fmt="${kind}"
             min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="value">${formatBy(kind, value)}</span>
    </div>
    ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
  </div>`;
}

function toggle(key, label, desc) {
  return `<div class="setting">
    <label for="set-${key}">${escapeHtml(label)}</label>
    <div class="control">
      <input id="set-${key}" class="toggle" type="checkbox" data-key="${key}" data-bind="checked">
    </div>
    ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
  </div>`;
}

function select(key, label, options, value, desc) {
  return `<div class="setting">
    <label for="set-${key}">${escapeHtml(label)}</label>
    <div class="control">
      <select id="set-${key}" data-key="${key}">
        ${options.map(([v, t]) => `<option value="${escapeHtml(v)}"${v === value ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>
    ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
  </div>`;
}

function firstLine(clue) {
  const line = clue.lines.find((l) => l.class !== 'note');
  return line ? line.text : '';
}
