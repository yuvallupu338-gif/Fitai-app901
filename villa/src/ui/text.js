/*
 * text.js — the game as a Hebrew prompt.
 *
 * Not a second game. It drives the same simulation as the floor plan, through
 * the same action objects, and differs in exactly one way: it charges an
 * action's time cost up front and then applies it, where the map screen holds
 * the player still for the duration and applies at the end. Everything else —
 * the balance, the wear, the neighbour, every loss condition — is shared code.
 *
 * The parsing problem here is Hebrew, and specifically that Hebrew glues its
 * prepositions and its definite article onto the front of the noun. A player
 * who types `לך לסלון` and a player who types `לך אל הסלון` mean the same
 * room, and neither of them typed the room's name — which is `הסלון`. So every
 * word is stripped of a leading ל/ב/מ/ה/ו/כ/ש before it is compared, on both
 * sides, and matching is on the stripped forms.
 */

import { h, clear, clock } from './dom.js';
import { PARSER, UI, inRoom } from '../data/strings.js';
import { ROOMS, ROOM_BY_ID } from '../data/rooms.js';
import { GAME_CONFIG } from '../data/config.js';
import { openingState, barricadeState } from '../sim/opening.js';
import { PHASE } from '../sim/state.js';

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/* Hebrew has no case, but it does have גרשיים, maqaf and a stack of one-letter
 * prefixes. Strip all of it before comparing anything. */
const PREFIX = /^[לבמהוכש]/;

function normalize(word) {
  const w = word.replace(/["'׳״־-]/g, '').trim();
  return w.replace(PREFIX, '');
}

function tokens(text) {
  return text.replace(/["'׳״]/g, ' ').split(/\s+/).filter(Boolean);
}

/*
 * Scores a phrase against a name. Full match beats prefix match beats
 * "every word of the phrase appears somewhere in the name", which is what
 * makes `חלון סלון` find `חלון הצד בסלון` without a dictionary.
 */
function score(phrase, name) {
  const p = tokens(phrase).map(normalize).filter(Boolean);
  const n = tokens(name).map(normalize).filter(Boolean);
  if (p.length === 0) return 0;
  const joinedP = p.join(' ');
  const joinedN = n.join(' ');
  if (joinedP === joinedN) return 100;
  if (joinedN.startsWith(joinedP)) return 80;
  if (joinedN.indexOf(joinedP) !== -1) return 70;
  let hits = 0;
  for (const word of p) {
    if (n.some((x) => x === word || x.startsWith(word) || word.startsWith(x))) hits++;
  }
  return hits === p.length ? 40 + hits : hits * 8;
}

function bestMatch(phrase, list, nameOf) {
  let best = null;
  let bestScore = 30;               // below this it is a guess, not a match
  for (const item of list) {
    const sc = score(phrase, nameOf(item));
    if (sc > bestScore) { bestScore = sc; best = item; }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Verbs
 * ------------------------------------------------------------------ */

/*
 * Each verb lists every form a player might plausibly type, including the
 * imperative, the infinitive and the bare noun. `needsTarget` decides whether
 * the rest of the line is looked up as an opening.
 */
const VERBS = [
  { type: 'move', words: ['לך', 'זוז', 'עבור', 'ללכת', 'תלך', 'היכנס', 'כנס'], target: 'room' },
  { type: 'look', words: ['בדוק', 'הסתכל', 'תבדוק', 'בחן', 'ראה'], target: 'any' },
  { type: 'search', words: ['חפש', 'תחפש', 'חיפוש', 'סרוק'] },
  { type: 'drawer', words: ['מגירה', 'שידה'] },
  { type: 'tape', words: ['חסום', 'תחסום', 'סקוץ', 'סקוטש', 'הדבק', 'טייפ', 'סגור'], target: 'opening' },
  { type: 'plank', words: ['קרש', 'קרשים', 'תקרש', 'מסמר', 'פטיש', 'הצמד'], target: 'opening' },
  { type: 'repair', words: ['תקן', 'תתקן', 'דחוף', 'חזק'], target: 'opening' },
  { type: 'shoot', words: ['ירה', 'תירה', 'ירי', 'רובה'], target: 'opening' },
  { type: 'call', words: ['התקשר', 'תתקשר', 'טלפן', 'טלפון', 'שכן'] },
  { type: 'gather', words: ['קח', 'אסוף', 'תיקח', 'ציוד'] },
  { type: 'wait', words: ['המתן', 'חכה', 'תחכה', 'המתנה'] },
  { type: 'ready', words: ['התחל', 'לילה', 'מוכן', 'סיים'] },
  /* Reports. Free, and deliberately so — looking at what you already know
     should never cost a night any seconds. */
  { type: 'report_kit', words: ['ציוד', 'תיק', 'מלאי'], report: true },
  { type: 'report_openings', words: ['פתחים', 'מצב'], report: true },
  { type: 'report_time', words: ['זמן', 'שעה'], report: true },
  { type: 'help', words: ['עזרה', 'פקודות', '?'], report: true },
];

/* `ציוד` is both "take supplies" and "show me the pack", and `פתח` is both a
 * verb and a noun. Two-word forms are checked first so the specific reading
 * wins over the general one. */
const PHRASES = [
  { match: ['פתח', 'מגירה'], action: { type: 'drawer' } },
  { match: ['בדוק', 'ציוד'], action: { type: 'report_kit' } },
  { match: ['בדוק', 'פתחים'], action: { type: 'report_openings' } },
  { match: ['בדוק', 'זמן'], action: { type: 'report_time' } },
  { match: ['קח', 'ציוד'], action: { type: 'gather' } },
  { match: ['התחל', 'לילה'], action: { type: 'ready' } },
];

/*
 * Turns a line into an action, or into a complaint. Returns
 * `{ action }` or `{ error }`; never throws, because everything it is given
 * was typed by a person at two in the morning.
 */
export function parse(line, state) {
  const raw = tokens(line);
  if (raw.length === 0) return { error: PARSER.unknown };
  const words = raw.map(normalize);

  for (const p of PHRASES) {
    if (words.length >= p.match.length
      && p.match.every((m, i) => words[i] === normalize(m))) {
      return { action: p.action };
    }
  }

  let verb = null;
  let rest = '';
  for (let take = Math.min(2, raw.length); take >= 1 && !verb; take--) {
    const head = words.slice(0, take).join(' ');
    verb = VERBS.find((v) => v.words.some((w) => normalize(w) === head)) || null;
    if (verb) rest = raw.slice(take).join(' ');
  }
  if (!verb) return { error: PARSER.unknown };

  if (verb.report) return { action: { type: verb.type } };

  if (verb.target === 'room') {
    if (!rest) return { error: PARSER.unknownTarget('חדר כזה') };
    const room = bestMatch(rest, ROOMS, (r) => r.name);
    if (!room) return { error: PARSER.unknownTarget(rest) };
    return { action: { type: 'move', room: room.id } };
  }

  if (verb.target === 'opening' || verb.target === 'any') {
    const known = state.openings.filter((o) => o.present && o.revealed);
    if (!rest) {
      /* No target named. Shooting picks what the game would pick; looking
         describes the room; anything else has to be told what to work on. */
      if (verb.type === 'shoot') return { action: { type: 'shoot' } };
      if (verb.type === 'look') return { action: { type: 'report_openings' } };
      return { error: PARSER.unknownTarget('פתח כזה') };
    }
    if (verb.type === 'shoot' && /נכנס|פולש|זה|יצור/.test(rest)) {
      return { action: { type: 'shoot', id: 'intruder' } };
    }
    if (verb.type === 'look') {
      const room = bestMatch(rest, ROOMS, (r) => r.name);
      const op = bestMatch(rest, known, (o) => o.name);
      if (op) return { action: { type: 'look', id: op.id } };
      if (room) return { action: { type: 'look_room', room: room.id } };
      return { error: PARSER.unknownTarget(rest) };
    }
    const op = bestMatch(rest, known, (o) => o.name);
    if (!op) {
      /* Named something that is in the room but has not been found yet? Say
         so, rather than pretending it does not exist — the player can hear it. */
      const hiddenHere = state.openings.some(
        (o) => o.present && !o.revealed && o.room === state.player.room,
      );
      return { error: hiddenHere ? PARSER.notRevealed : PARSER.unknownTarget(rest) };
    }
    return { action: { type: verb.type, id: op.id } };
  }

  return { action: { type: verb.type } };
}

/* ------------------------------------------------------------------ *
 * The status block
 * ------------------------------------------------------------------ */

/* Printed before every prompt, because a text game that makes you ask what is
 * happening is a text game people stop playing. */
export function statusLines(state) {
  const room = ROOM_BY_ID[state.player.room];
  const known = state.openings.filter((o) => o.present && o.revealed);
  const here = known.filter((o) => o.room === room.id);
  const inv = state.inv;
  const lines = [];

  lines.push(state.phase === PHASE.DAY
    ? `— הכנות ליום ${state.night} · ${UI.prepLeft} ${clock(state.phaseLength - state.clock)} —`
    : `— ${UI.night} ${state.night}/${GAME_CONFIG.NIGHTS_TOTAL} · ${UI.untilDawn} ${clock(state.phaseLength - state.clock)} · ${UI.danger} ${Math.round(state.danger)} —`);

  lines.push(`אתה ${inRoom(room.name)}. ${room.desc}`);

  lines.push(`ציוד: ${inv.ammo} כדורים · ${inv.tape} סקוץ׳ · ${inv.planks} קרשים · ${inv.nails} מסמרים`
    + `${inv.hammer ? ' · פטיש' : ''}`);
  lines.push(`שכן: ${state.neighbor.callsLeft} קריאות · מספר ${state.numberFound ? 'ידוע' : 'לא ידוע'}`
    + (state.neighbor.status === 'here' ? ` · כאן עוד ${clock(state.neighbor.timer)}` : '')
    + (state.neighbor.status === 'coming' ? ' · בדרך' : ''));

  if (here.length) {
    lines.push('בחדר הזה:');
    for (const o of here) lines.push(`  · ${o.name} — ${openingState(o).name}, ${barricadeState(o)}`);
  } else {
    lines.push('אין כאן פתחים שאתה יודע עליהם.');
  }

  const elsewhere = known.filter((o) => o.room !== room.id
    && (o.breached || o.integrity >= GAME_CONFIG.CRITICAL_AT));
  for (const o of elsewhere) {
    lines.push(`  ! ${o.name} ${inRoom(ROOM_BY_ID[o.room].name)} — ${openingState(o).name}`);
  }

  const intruders = state.intruders.filter((i) => i.delay <= 0);
  for (const i of intruders) {
    lines.push(i.room === room.id ? '  !! משהו כאן, בחדר איתך.'
      : `  ! משהו נע ${inRoom(ROOM_BY_ID[i.room].name)}.`);
  }

  const exits = room.links.map((id) => ROOM_BY_ID[id].name).join(', ');
  lines.push(`יציאות: ${exits}`);
  return lines;
}

export function openingReport(state) {
  const known = state.openings.filter((o) => o.present && o.revealed);
  if (!known.length) return ['אתה לא יודע על אף פתח.'];
  return known
    .slice()
    .sort((a, b) => b.integrity - a.integrity)
    .map((o) => `${o.name} (${ROOM_BY_ID[o.room].name}) — ${openingState(o).name}, ${barricadeState(o)}`);
}

/* ------------------------------------------------------------------ *
 * The panel
 * ------------------------------------------------------------------ */

export function createConsole(onSubmit) {
  const log = h('div.tlog', { role: 'log', 'aria-live': 'polite' });
  const input = h('input.tinput', {
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'מה אתה עושה?',
    'aria-label': 'פקודה',
  });
  const form = h('form.tform', {
    onsubmit: (e) => {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      if (v.trim()) onSubmit(v);
    },
  }, h('span.tprompt', { text: PARSER.prompt }), input,
     h('button.tsend', { type: 'submit' }, 'שלח'));

  const root = h('div.console', log, form);
  return { root, log, input, form };
}

export function print(con, lines, cls) {
  const block = h(`div.tblock${cls ? '.' + cls : ''}`);
  for (const line of [].concat(lines)) {
    block.appendChild(h('div.tline', { text: line }));
  }
  con.log.appendChild(block);
  /* Keep the transcript from growing without limit over a forty-minute run. */
  while (con.log.childNodes.length > 90) con.log.removeChild(con.log.firstChild);
  con.log.scrollTop = con.log.scrollHeight;
}

export function clearConsole(con) {
  clear(con.log);
}
