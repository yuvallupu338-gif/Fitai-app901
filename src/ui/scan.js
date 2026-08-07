/*
 * scan.js — the photo-scan panel.
 *
 * Two jobs, and the order matters. First, tell the user exactly what is about
 * to happen before anything leaves the device: which two pictures, to which
 * company, under whose key — and the list of fields in that notice is the list
 * profileBrief actually sends, checked against it rather than remembered.
 * Second, run it and show what came back — including when what came back is
 * "I can't read these", which is a real answer and is displayed as one rather
 * than as an error.
 *
 * Refusals are not one thing. A blurry photograph and a photograph of a child
 * both come back as usable=false, and the only honest advice for the first
 * ("try other photos") is, for the second, instructions for getting past a
 * safety refusal by re-rolling a non-deterministic call. So the panel branches
 * on refusalKind: quality problems keep the retry affordance, and the two
 * safety kinds take the photographs away and switch the button off.
 *
 * The panel never changes the program by itself. It writes the read onto the
 * profile; the caller decides when to rebuild.
 */

import { h, clear, announce, shrinkImage } from '../core/dom.js';
import { analyze, VisionError, scanEligibility } from '../vision/analyze.js';
import { hasKey, keyLooksValid, loadKey, choiceFor } from '../ai/client.js';
import { hidesBodyReading } from '../engine/age.js';
import { settingsRows } from './aisettings.js';
import {
  emphasisFrom, emphasisSummary, bandHe, confidenceHe, buildHe, trainingAgeHe,
  patternHe, timelineGap, goalConflict, growthNote,
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

/* What the app says happened, in its own words, next to the model's sentence.
   The model's Hebrew is one line and is written for the person in front of it;
   this is the part that has to name the mechanism, because the panel is about
   to take the photos away and switch the button off. */
const STOP_HE = {
  minor: 'המודל קרא את אחת התמונות כתמונה של מי שאינו בן 18. הסריקה הזאת שולחת צילום גוף '
    + 'לספק חיצוני, ועל תמונה של קטין היא לא רצה.',
  sexual: 'המודל קרא את אחת התמונות כתמונה בעלת אופי מיני. הסריקה קוראת גוף בעמידה בבגדי '
    + 'אימון, ולא את זה.',
};

/**
 * Which refusals stop the feature rather than ask for better photos. Returns
 * the kind, or null when retrying is the honest advice.
 *
 * Two signals, because src/vision is landing refusalKind while this panel is
 * being written and the wrong direction to fail is open: a refusal that arrives
 * without the field must not fall through to "try other photos", which is how
 * you tell someone to keep pressing until a non-deterministic call lets them
 * past. So the older boolean still counts, and an unrecognised kind on an
 * unusable read counts as unreadable — that one IS a quality problem by default.
 */
function refusalStop(read) {
  if (!read || read.usable === true) return null;
  if (read.refusalKind === 'minor' || read.refusalKind === 'sexual') return read.refusalKind;
  if (read.refusalKind === 'unreadable' || read.refusalKind === 'not_a_body') return null;
  return read.safetyRefusal === true ? 'safety' : null;
}

export function renderRead(read, profile, opts) {
  const o = opts || {};
  const box = h('div.scanresult');

  if (!read.usable) {
    // A refusal for a minor or for sexual content is not a quality problem, and
    // saying "try other photos" is telling someone how to get around it.
    const stop = refusalStop(read);
    // Read off the profile rather than assumed: a stop reached through a read
    // restored from storage has not cleared anything, and a panel that says it
    // removed two photographs still visible above it has told its second lie of
    // the screen.
    const cleared = !!profile && !profile.photoNow && !profile.photoTarget;
    box.appendChild(h('div.warnbox' + (stop ? '.hot' : ''),
      h('h4', stop ? 'הסריקה נעצרה' : 'לא הצלחתי לקרוא את התמונות'),
      h('p', read.refusal || 'נסה תמונות אחרות.'),
      STOP_HE[stop] ? h('p', STOP_HE[stop]) : null,
      stop
        ? h('p', (cleared ? 'הסרתי את שתי התמונות והכפתור כבוי. ' : 'הכפתור כבוי. ')
          + 'זו לא בעיה של איכות התמונה, ותמונה אחרת של אותו אדם לא תשנה את זה.')
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

  /* Adjacent to the number it qualifies, and it carries the medical half too.
     That half used to sit at the very bottom, eighty-eight pixels BELOW the
     button that changes the user's goal — which makes it a legal artefact and
     not a disclaimer, because the person who most needs it is the one least
     likely to still be scrolling after they have decided. The posture card in
     this file is the pattern: the caveat lives inside the thing it qualifies. */
  box.appendChild(h('p.disclaimer', { style: { marginTop: '0', marginBottom: '16px' } },
    'זו קריאה משתי תמונות, לא מדידה. תמונה לא מודדת אחוז שומן ולא מודדת בריאות, '
    + 'והיא משתנה לפי תאורה וזווית. הציון הוא על היעד מול התאריך — לא עליך. '
    + 'השתמש בזה ככיוון, לא כאבחנה — אם יש חשש בריאותי, זו שיחה עם רופא ולא עם אפליקציה.'));

  if (r.verdict) {
    box.appendChild(h(`div.verdict.${band.tone}`, paras(r.verdict)));
  }

  /*
   * Sits directly under the verdict, because it changes how that paragraph
   * should be read. The verdict is phrased in months of training; for someone
   * still finishing growing, part of the distance is not training at all, and
   * that cuts both ways — nearer than the work alone implies, and not the
   * programme's achievement.
   */
  const growth = growthNote(profile);
  if (growth) {
    box.appendChild(h('div.growthnote', h('span.gicon', '↗'), h('p', growth.he)));
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

  /*
   * Under 18 the body reading steers the plan and is never displayed.
   *
   * Everything below this line describes the trainee's own body — how lean it
   * is, what mass it carries, what stands out, what the posture is doing. It is
   * written to aim the programme, and it aims the programme just as well unread.
   * What stays on screen is the realism verdict, which is a judgement about a
   * goal and a date rather than about them.
   *
   * The read is untouched: emphasisFrom still consumes all of it, so the week a
   * fourteen-year-old gets is identical to the one they would have got if this
   * were printed. The only difference is that nobody hands a child a paragraph
   * analysing their torso.
   */
  const hideBody = hidesBodyReading(profile);
  if (hideBody) {
    box.appendChild(h('div.scancard',
      h('div.eyebrow', 'מה נעשה עם הקריאה'),
      h('p', 'הקריאה של התמונות שימשה לכוון את חלוקת הנפח בתוכנית שלך, והיא לא מוצגת כאן. '
        + 'מה שכן מוצג הוא עד כמה היעד שבחרת מסתדר עם התאריך שנתת — וזה השיפוט על המטרה, לא עליך.'),
      h('p', { style: { color: 'var(--dimmer)', fontSize: '12.5px' } },
        emphasisSummary(emphasisFrom(read), profile))));
  }

  const sp = hideBody ? null : read.startPoint;
  const tp = hideBody ? null : read.targetPhysique;
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

  const steer = hideBody ? null : read.steer;
  if (steer && (steer.note || (steer.emphasise || []).length)) {
    box.appendChild(h('div.scancard',
      h('div.eyebrow', 'איך זה מכוון את התוכנית'),
      (steer.emphasise || []).length
        ? h('div.scantags', steer.emphasise.map((p) => h('span.fact', patternHe(p))))
        : null,
      steer.note ? h('p', steer.note) : null,
      // What the engine actually did, rather than what the model's sentence
      // says it did — the two can disagree. Passing the profile is what makes
      // the difference between the two: with it, emphasisSummary costs this
      // user's week twice and names the groups whose whole sets really moved;
      // without it, it can only report what the read ASKED for, because a
      // request is all that is knowable without a week to measure against.
      h('p', { style: { color: 'var(--dim)', fontSize: '12.5px' } },
        emphasisSummary(emphasisFrom(read), profile)),
    ));
  }

  if (!hideBody && (read.posture || []).length) {
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
      /* The half of the disclaimer that bears on THIS decision, repeated where
         the decision is made. This button is the one place in the panel where a
         judgement about two photographs is a single tap from rewriting the
         plan, and a caveat four screens up is a caveat that was not read. */
      h('p', { style: { color: 'var(--dimmer)', fontSize: '12.5px' } },
        'לפני שאתה מחליף: זו קריאה משתי תמונות, לא מדידה — לא של הגוף ולא של הבריאות.'),
      h('div.toolbar',
        h('button.btn', {
          type: 'button',
          onclick: () => o.onGoalChange(conflict.to),
        }, `החלף ל${conflict.toHe}`)),
    ));
  }

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
 *   stopped             a safety refusal from earlier in this session
 *   compact             hide the explainer, for the plan screen
 */
export function renderScan(host, profile, opts) {
  const o = opts || {};
  let running = false;
  let controller = null;
  let error = null;
  /* The safety refusal lives here rather than on the profile because clearing
     the photos is half of what the stop DOES, and normalizeProfile drops any
     read whose photos are gone — so the profile is structurally incapable of
     carrying it. A caller that tears the panel down and rebuilds it hands the
     refusal back through opts.stopped; otherwise the button would come back
     live, which is the whole defect.

     A safety refusal read back off the profile counts too. That state can only
     have been written by a build that stored one without clearing the photos,
     and the photos are what make it dangerous: a live button beside them is the
     retry loop, whoever left it there. */
  let stopped = o.stopped || (refusalStop(profile.visionRead) ? profile.visionRead : null);

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
    /* One rule in one place, because it is read twice: once when the button is
       built and again on every keystroke in the key field. The two drifting
       apart is how a stopped scan gets a live button back. */
    const buttonOff = () => running || !!stopped || !ready || !keyLooksValid(loadKey(provider.id));

    /* A stopped scan says so first and drops the explainer. Left in its usual
       place — under the button, under a paragraph describing a scan that is not
       going to run — the explanation reads as a footnote to a live control. */
    if (stopped) body.appendChild(renderRead(stopped, profile, {}));
    else if (!o.compact) {
      /* The first two bullets are the complete field list profileBrief actually
         builds, in its order, which is what lets the third say "that is all".
         The injuries line is not a disclosure of extra generosity: INJURY_OPTIONS
         carries הריון, לב / לחץ דם and אסתמה, so a bullet promising that "your
         medical condition" stays on the device was telling a pregnant user
         something untrue about her own data. The medical FREE TEXT and the
         allergies genuinely never leave — those are the ones to name. */
      body.appendChild(h('div.scanintro',
        h('h4', 'מה קורה כשאתה לוחץ'),
        h('ul',
          h('li', `שתי התמונות נשלחות ל־${provider.label}, ואיתן המספרים והתשובות שנתת: `
            + 'גיל, מין, גובה, משקל ומשקל יעד, ותק, המטרה (וענף הספורט אם ציינת), '
            + 'כמה זמן נשאר עד תאריך היעד, ימי האימון ואורך האימון, המקום והציוד, המסלול, '
            + 'שעות השינה, העומס היומיומי ורמת ההתמסרות.'),
          h('li', 'נשלחות גם המגבלות הפיזיות שסימנת — כולל לב, אסתמה או הריון אם סימנת אותן — '
            + 'כי המלצה שלא יודעת עליהן מסוכנת יותר מהמלצה שיודעת.'),
          h('li', 'זה הכל. לא נשלחים: השם שלך, הטקסט החופשי על מצב רפואי, תרופות וניתוחים, '
            + 'האלרגיות והעדפות התזונה. המפתח לא נשמר אצל אף אחד חוץ ממך.'),
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
        if (btn) btn.disabled = buttonOff();
      },
    })) body.appendChild(row);

    const run = h('button.btn.primary.scanrun', {
      type: 'button',
      disabled: buttonOff(),
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

    if (stopped) {
      // Not "you need two photos" — after a stop that is an instruction to
      // upload two more and press again, which is the thing being prevented.
      body.appendChild(h('p.help', 'הכפתור כבוי בגלל מה שכתוב למעלה.'));
    } else if (!ready) {
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
    if (read && !running && !stopped) {
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
      const stop = refusalStop(read);
      profile.visionRead = read;
      profile.emphasis = emphasisFrom(read);
      if (stop) {
        /* The pictures go with the refusal. Leaving them loaded next to a live
           button is an invitation to press again until a differently-rolled
           call lets them through, and one of these two kinds is a child. The
           read goes too: it describes photographs that are no longer here, and
           normalizeProfile would drop it on the next save regardless. */
        stopped = read;
        profile.photoNow = '';
        profile.photoTarget = '';
        profile.visionRead = null;
        profile.emphasis = emphasisFrom(null);
      }
      running = false;
      controller = null;
      draw();
      announce(stop ? 'הסריקה נעצרה' : read.usable ? 'הסריקה הסתיימה' : 'התמונות לא ניתנות לקריאה');
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
  /* Held at this level because every redraw here builds a NEW panel, and a
     stop that only lived inside the panel would be thrown away by the very
     redraw that shows the cleared photo slots. */
  let stopped = null;

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
      stopped,
      onRead: (read) => {
        if (refusalStop(read)) stopped = read;
        dirty = true;
        commit();
        draw();
      },
      onGoalChange: (goal) => { working.goal = goal; dirty = true; commit(); draw(); },
    });

    /* After a stop there is no scan to fold in, so the same callout has to say
       something else. Offering "rebuild WITH the scan" under a refusal is the
       panel contradicting itself on the same screen. */
    if (dirty && o.onRebuild) {
      wrap.appendChild(h('div.callout.warn',
        h('h4', stopped ? 'התוכנית שמוצגת עדיין לא מעודכנת' : 'התוכנית שמוצגת עדיין לא כוללת את זה'),
        h('p', stopped
          ? 'הסריקה לא רצה, והתוכנית שמוצגת עדיין נשענת על מה שהיה כאן קודם. '
            + 'בנייה מחדש תבנה אותה מהתשובות בשאלון בלבד. הסימונים, הרישומים והמשקלים שרשמת נשמרים.'
          : 'הסריקה משנה את חלוקת הנפח, וזה נכנס לתוקף רק כשהתוכנית נבנית מחדש. '
            + 'הסימונים, הרישומים והמשקלים שרשמת נשמרים.'),
        h('div.toolbar',
          h('button.btn.primary', {
            type: 'button',
            onclick: () => { dirty = false; o.onRebuild(working); },
          }, h('span.ico', '✦'), stopped ? 'בנה מחדש בלי הסריקה' : 'בנה מחדש עם הסריקה')),
      ));
    }
  }

  draw();
}
