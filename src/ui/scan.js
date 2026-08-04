/*
 * scan.js — the photo-scan panel.
 *
 * Two jobs, and the order matters. First, tell the user exactly what is about
 * to happen before anything leaves the device: which two pictures, to which
 * company, under whose key. Second, run it and show what came back — including
 * when what came back is "I can't read these", which is a real answer and is
 * displayed as one rather than as an error.
 *
 * The panel never changes the program by itself. It writes the read onto the
 * profile; the caller decides when to rebuild.
 */

import { h, clear, announce, shrinkImage } from '../core/dom.js';
import { analyze, VisionError, scanEligibility } from '../vision/analyze.js';
import { hasKey, keyLooksValid, loadKey, choiceFor } from '../ai/client.js';
import { settingsRows } from './aisettings.js';
import {
  emphasisFrom, emphasisSummary, bandHe, confidenceHe, buildHe, trainingAgeHe,
  patternHe, timelineGap, goalConflict,
} from '../vision/apply.js';


/* ------------------------------------------------------------------ *
 * Result rendering
 * ------------------------------------------------------------------ */

function scoreDial(score, honestMonths) {
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const tone = score >= 8 ? 'good' : score >= 5 ? 'warn' : 'bad';
  return h(`div.dial.${tone}`,
    h('div.dialnum', String(score), h('span', '/10')),
    h('div.dialbar', { 'aria-hidden': 'true' },
      h('i', { style: { width: `${Math.round(pct * 100)}%` } })),
    // Without a referent, a red 3/10 beside your own photograph reads as a
    // score of you. It is a score of the goal against the date.
    h('div.diallabel', 'היעד מול התאריך'),
    Number.isFinite(honestMonths) && honestMonths !== null
      ? h('div.dialsub', `${honestMonths} חודשים`)
      : null,
  );
}

/** Paragraph text from the model, split on blank lines, never as innerHTML. */
function paras(str) {
  return String(str || '').split(/\n{2,}/).filter(Boolean).map((t) => h('p', t));
}

export function renderRead(read, profile, opts) {
  const o = opts || {};
  const box = h('div.scanresult');

  if (!read.usable) {
    // A refusal for a minor or for sexual content is not a quality problem, and
    // saying "try other photos" is telling someone how to get around it.
    const safety = read.safetyRefusal === true;
    box.appendChild(h('div.warnbox' + (safety ? '.hot' : ''),
      h('h4', safety ? 'הסריקה נעצרה' : 'לא הצלחתי לקרוא את התמונות'),
      h('p', read.refusal || 'נסה תמונות אחרות.'),
      safety
        ? h('p', 'זו לא בעיה של איכות התמונה, ותמונה אחרת לא תשנה את זה.')
        : null,
      h('p', { style: { color: 'var(--dimmer)', fontSize: '12.5px' } },
        'התוכנית נבנית בלי הסריקה, מהמספרים ומהתשובות שנתת. היא עדיין תוכנית מלאה.'),
    ));
    return box;
  }

  const r = read.realism || {};
  const band = bandHe(r.band);

  box.appendChild(h('div.scanhead',
    scoreDial(r.score || 5, r.honestMonths),
    h('div.scanheadtext',
      h('div.eyebrow', `${band.label} · ${confidenceHe(read.confidence)}`),
      h('h3', 'מה שתי התמונות אומרות'),
      read.confidenceNote ? h('p.sub', read.confidenceNote) : null,
    ),
  ));

  /* Adjacent to the number it qualifies. Below the verdict, below the goal
     button and four screens down, it was a legal artefact rather than a
     disclaimer — the user who most needs it is the one least likely to scroll. */
  box.appendChild(h('p.disclaimer', { style: { marginTop: '0', marginBottom: '16px' } },
    'זו קריאה משתי תמונות, לא מדידה. תמונה לא מודדת אחוז שומן ולא מודדת בריאות, '
    + 'והיא משתנה לפי תאורה וזווית. הציון הוא על היעד מול התאריך — לא עליך.'));

  if (r.verdict) {
    box.appendChild(h(`div.verdict.${band.tone}`, paras(r.verdict)));
  }

  const gap = timelineGap(read, profile);
  if (gap) {
    box.appendChild(h(`div.callout.${gap.kind === 'fits' ? 'good' : 'warn'}`,
      h('h4', 'היעד מול התאריך'), h('p', gap.he)));
  }

  if (r.firstMilestone) {
    box.appendChild(h('div.callout',
      h('h4', 'מה תראה ראשון'), h('p', r.firstMilestone)));
  }

  const sp = read.startPoint;
  const tp = read.targetPhysique;
  if (sp || tp) {
    const grid = h('div.scangrid');
    if (sp) {
      grid.appendChild(h('div.scancard',
        h('div.eyebrow', 'נקודת ההתחלה'),
        h('div.scantags', h('span.fact', buildHe(sp.build)), h('span.fact', trainingAgeHe(sp.trainingAge))),
        sp.notes ? h('p', sp.notes) : null));
    }
    if (tp) {
      const tags = [];
      if (tp.standsOut && tp.standsOut.length) {
        for (const p of tp.standsOut) tags.push(h('span.fact', patternHe(p)));
      }
      grid.appendChild(h('div.scancard',
        h('div.eyebrow', 'הגוף שבתמונה השנייה'),
        tags.length ? h('div.scantags', tags) : null,
        tp.notes ? h('p', tp.notes) : null));
    }
    box.appendChild(grid);
  }

  const steer = read.steer;
  if (steer && (steer.note || (steer.emphasise || []).length)) {
    box.appendChild(h('div.scancard',
      h('div.eyebrow', 'איך זה מכוון את התוכנית'),
      (steer.emphasise || []).length
        ? h('div.scantags', steer.emphasise.map((p) => h('span.fact', patternHe(p))))
        : null,
      steer.note ? h('p', steer.note) : null,
      // What the engine actually did, read back off the multipliers rather than
      // off the model's sentence — the two can disagree, and this one is true.
      h('p', { style: { color: 'var(--dim)', fontSize: '12.5px' } },
        emphasisSummary(emphasisFrom(read))),
    ));
  }

  if ((read.posture || []).length) {
    box.appendChild(h('div.scancard',
      h('div.eyebrow', 'שווה לבדוק'),
      h('ul', read.posture.map((item) => h('li', item.observation))),
      h('p', { style: { color: 'var(--dimmer)', fontSize: '12.5px' } },
        'זו הערה מתמונה, לא אבחנה. אם משהו כואב — זה עניין לפיזיותרפיסט, לא לאפליקציה.'),
    ));
  }

  const conflict = goalConflict(read, profile);
  if (conflict && o.onGoalChange) {
    box.appendChild(h('div.callout.warn',
      h('h4', `הסריקה מצביעה על ${conflict.toHe}, ואתה בחרת ${conflict.fromHe}`),
      conflict.note ? h('p', conflict.note) : null,
      h('p', 'המטרה שלך לא משתנה מעצמה. אם זה נשמע נכון — החלף, ואם לא — התעלם, זו רק תמונה.'),
      h('div.toolbar',
        h('button.btn', {
          type: 'button',
          onclick: () => o.onGoalChange(conflict.to),
        }, `החלף ל${conflict.toHe}`)),
    ));
  }

  box.appendChild(h('p.disclaimer',
    'השתמש בזה ככיוון, לא כאבחנה. אם יש חשש בריאותי — זו שיחה עם רופא, לא עם אפליקציה.'));

  return box;
}

/* ------------------------------------------------------------------ *
 * The panel
 * ------------------------------------------------------------------ */

/**
 * Mounts the scan panel into `host`.
 *
 * @param {HTMLElement} host
 * @param {Object} profile        read for photos, written on success
 * @param {Object} [opts]
 *   onRead(read)        after a successful scan — the caller persists
 *   onGoalChange(goal)  when the user accepts a suggested goal change
 *   compact             hide the explainer, for the plan screen
 */
export function renderScan(host, profile, opts) {
  const o = opts || {};
  let running = false;
  let controller = null;
  let error = null;

  const body = h('div');
  host.appendChild(body);

  function draw() {
    clear(body);

    /* Refused before the photos are chosen, not after they are uploaded. The
       age is already in the profile; asking someone to photograph themselves
       and only then declining is the worst possible order. */
    const eligible = scanEligibility(profile);
    if (!eligible.ok) {
      body.appendChild(h('div.warnbox',
        h('h4', 'הסריקה לא זמינה'),
        h('p', eligible.he),
      ));
      return;
    }

    const ready = !!profile.photoNow && !!profile.photoTarget;
    const { provider, model } = choiceFor('vision');
    const keyed = hasKey(provider.id);

    if (!o.compact) {
      body.appendChild(h('div.scanintro',
        h('h4', 'מה קורה כשאתה לוחץ'),
        h('ul',
          h('li', `שתי התמונות נשלחות ל־${provider.label}, יחד עם הגיל, הגובה, המשקל, הוותק, המטרה והתאריך שנתת.`),
          h('li', 'נשלחות גם המגבלות הפיזיות שסימנת — כולל לב, אסתמה או הריון אם סימנת אותן — '
            + 'כי המלצה שלא יודעת עליהן מסוכנת יותר מהמלצה שיודעת.'),
          h('li', 'לא נשלחים: השם שלך, הטקסט החופשי על מצב רפואי ותרופות, והאלרגיות. '
            + 'המפתח לא נשמר אצל אף אחד חוץ ממך.'),
          h('li', 'הציון הוא שיפוט של היעד מול התאריך משתי תמונות. הוא לא מדידה של הגוף ולא של הבריאות.'),
          h('li', 'התשובה חוזרת אליך בלבד ונשמרת במכשיר. שום שרת של האפליקציה הזאת לא רואה אותה — אין כזה.'),
          h('li', 'אפשר לדלג. בלי סריקה התוכנית נבנית מהתשובות בשאלון, כמו תמיד.'),
        )));
    }

    for (const row of settingsRows('vision', { provider, model }, {
      modelLabel: 'עומק הקריאה',
      onRedraw: draw,
      onKeyInput: () => {
        // Redrawing on every keystroke would steal focus from the field, so only
        // the button's enabled state is refreshed while typing.
        const btn = body.querySelector('.scanrun');
        if (btn) btn.disabled = running || !ready || !keyLooksValid(loadKey(provider.id));
      },
    })) body.appendChild(row);

    const run = h('button.btn.primary.scanrun', {
      type: 'button',
      disabled: running || !ready || !keyLooksValid(loadKey(provider.id)),
      onclick: () => start(),
    }, h('span.ico', '◉'), running ? 'סורק…' : 'סרוק את שתי התמונות');

    const bar = h('div.toolbar', run);
    if (running) {
      bar.appendChild(h('button.btn.ghost', {
        type: 'button',
        onclick: () => { if (controller) controller.abort(); },
      }, 'בטל'));
    }
    body.appendChild(bar);

    if (!ready) {
      body.appendChild(h('p.help', 'צריך את שתי התמונות — אחת שלך היום, אחת של היעד.'));
    } else if (!keyed) {
      body.appendChild(h('p.help', 'הזן מפתח API כדי להפעיל את הסריקה.'));
    }

    if (running) {
      body.appendChild(h('div.scanbusy',
        h('span.spin', { 'aria-hidden': 'true' }),
        h('span', 'קורא את התמונות מול המספרים שנתת. זה לוקח כמה שניות.')));
    }

    if (error) {
      body.appendChild(h('div.warnbox',
        h('h4', 'הסריקה נכשלה'),
        h('p', error.he || 'משהו השתבש. נסה שוב.'),
        error.detail ? h('p', { style: { color: 'var(--dimmer)', fontSize: '12px', fontFamily: 'var(--mono)' } },
          error.detail) : null));
    }

    const read = profile.visionRead;
    if (read && !running) {
      body.appendChild(renderRead(read, profile, {
        onGoalChange: o.onGoalChange,
      }));
    }
  }

  async function start() {
    running = true;
    error = null;
    controller = new AbortController();
    draw();
    announce('הסריקה רצה');

    try {
      const read = await analyze(profile, { signal: controller.signal });
      profile.visionRead = read;
      profile.emphasis = emphasisFrom(read);
      running = false;
      controller = null;
      draw();
      announce(read.usable ? 'הסריקה הסתיימה' : 'התמונות לא ניתנות לקריאה');
      if (o.onRead) o.onRead(read);
    } catch (e) {
      running = false;
      controller = null;
      error = e instanceof VisionError
        ? e
        : { he: 'משהו השתבש בסריקה. נסה שוב.', detail: String(e && e.message || e) };
      // A cancelled scan is a thing the user did, not a failure to report back.
      if (e && e.kind === 'aborted') error = null;
      draw();
      if (error) announce('הסריקה נכשלה');
    }
  }

  draw();
  return { redraw: draw };
}

/* ------------------------------------------------------------------ *
 * The tab
 * ------------------------------------------------------------------ */

const PHOTO_SLOTS = [
  { key: 'photoNow', label: 'אתה היום', hint: 'עמידה זקופה, מול המצלמה' },
  { key: 'photoTarget', label: 'לאן אתה מכוון', hint: 'בדרך כלל מישהו אחר' },
];

function photoPicker(profile, slot, onSet) {
  const box = h('figure');
  const input = h('input', {
    type: 'file', accept: 'image/*', style: { display: 'none' },
    'aria-label': slot.label,
    onchange: (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      shrinkImage(file, 768, 0.82)
        .then((dataUrl) => onSet(slot.key, dataUrl))
        .catch(() => announce('לא הצלחתי לקרוא את התמונה'));
    },
  });

  const current = profile[slot.key];
  box.appendChild(current
    ? h('img', { src: current, alt: slot.label })
    : h('div.photodrop', { onclick: () => input.click() }, h('span', 'בחר תמונה')));
  box.appendChild(input);
  box.appendChild(h('figcaption', slot.label));
  box.appendChild(h('div.toolbar', { style: { marginTop: '6px', justifyContent: 'center' } },
    h('button.fbtn', { type: 'button', onclick: () => input.click() },
      current ? 'החלף' : 'בחר'),
    current ? h('button.fbtn.reset', { type: 'button', onclick: () => onSet(slot.key, '') }, 'הסר') : null,
  ));
  return box;
}

/**
 * The plan-screen version: pick or replace the photos, run the scan, and rebuild
 * the program from the result. Separate from the intake panel because here the
 * program already exists, so a new read has to offer to regenerate it — an
 * emphasis that never reaches a program is just a paragraph.
 *
 * @param {HTMLElement} host
 * @param {Object} profile
 * @param {Object} opts   { onProfileChange(profile), onRebuild(profile) }
 */
export function renderScanTab(host, profile, opts) {
  const o = opts || {};
  const working = profile;
  let dirty = false;

  const wrap = h('div');
  host.appendChild(wrap);

  function commit() {
    if (o.onProfileChange) o.onProfileChange(working);
  }

  function setPhoto(key, dataUrl) {
    // A new photo invalidates the read taken from the old one.
    working[key] = dataUrl;
    working.visionRead = null;
    working.emphasis = emphasisFrom(null);
    dirty = true;
    commit();
    draw();
  }

  function draw() {
    clear(wrap);

    wrap.appendChild(h('section',
      h('div.eyebrow', 'סריקת תמונות'),
      h('h2', 'שתי תמונות, קריאה אחת'),
      h('p.sub',
        'מודל ראייה קורא את התמונה שלך היום מול הגוף שאתה מכוון אליו, נותן ליעד רמת היגיון, '
        + 'ומזיז את חלוקת הנפח בתוכנית לפער שביניהן. אפשר להחליף תמונה ולסרוק שוב בכל שלב.'),
    ));

    wrap.appendChild(h('div.visionpair',
      photoPicker(working, PHOTO_SLOTS[0], setPhoto),
      h('div.arrow', { 'aria-hidden': 'true' }, '←'),
      photoPicker(working, PHOTO_SLOTS[1], setPhoto),
    ));

    const panel = h('div');
    wrap.appendChild(panel);
    renderScan(panel, working, {
      onRead: () => { dirty = true; commit(); draw(); },
      onGoalChange: (goal) => { working.goal = goal; dirty = true; commit(); draw(); },
    });

    if (dirty && o.onRebuild) {
      wrap.appendChild(h('div.callout.warn',
        h('h4', 'התוכנית שמוצגת עדיין לא כוללת את זה'),
        h('p', 'הסריקה משנה את חלוקת הנפח, וזה נכנס לתוקף רק כשהתוכנית נבנית מחדש. '
          + 'הסימונים, הרישומים והמשקלים שרשמת נשמרים.'),
        h('div.toolbar',
          h('button.btn.primary', {
            type: 'button',
            onclick: () => { dirty = false; o.onRebuild(working); },
          }, h('span.ico', '✦'), 'בנה מחדש עם הסריקה')),
      ));
    }
  }

  draw();
}
