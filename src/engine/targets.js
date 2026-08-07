/*
 * targets.js — the honesty engine.
 *
 * Takes the target weight and the target date and says plainly whether they
 * fit together. When they don't, it does not just refuse — it returns the
 * version of the goal that IS reachable, so the user always leaves with a
 * number they can work toward.
 *
 * Rates are deliberately conservative and stated per week as a fraction of
 * bodyweight, because a 60kg and a 110kg person cannot lose the same kilos.
 */

import { growthAllowanceKgPerWeek, isMinor } from './age.js';

const DAY = 86400000;

/* Ceilings, as a fraction of bodyweight per week. */
const LOSS_CEILING = 0.010;      // 1.0%/wk — the upper bound before muscle goes with it
const LOSS_COMFORTABLE = 0.006;  // 0.6%/wk — what most people sustain

const GAIN_CEILING = {
  beginner: 0.0045,
  returning: 0.0035,
  intermediate: 0.0022,
  advanced: 0.0012,
};
const GAIN_COMFORTABLE = {
  beginner: 0.0030,
  returning: 0.0025,
  intermediate: 0.0015,
  advanced: 0.0008,
};

/*
 * How much of the achievable rate a person actually realises, by how strictly
 * they follow the plan. This is the single biggest determinant of the timeline
 * and it is the one thing the user controls directly — so it belongs in the
 * arithmetic, not in a motivational sentence.
 */
const COMMITMENT_FACTOR = { 1: 0.35, 2: 0.55, 3: 0.75, 4: 0.9, 5: 1.0 };

export function commitmentFactor(profile) {
  const c = Math.round(Number(profile && profile.commitment));
  return COMMITMENT_FACTOR[c] || COMMITMENT_FACTOR[3];
}

const COMMITMENT_HE = {
  1: 'ברמת ההתמסרות שסימנת — אימון כשמתאים — הקצב הריאלי הוא כשליש מהמקסימום.',
  2: 'ברמת ההתמסרות שסימנת הקצב יהיה כחצי מהמקסימלי. זה עדיין קדימה, רק לאט יותר.',
  3: 'ברמת ההתמסרות שסימנת — רוב האימונים, אוכל סביר — תגיע לכשלושה רבעים מהקצב המקסימלי.',
  4: 'ברמת ההתמסרות שסימנת אתה קרוב מאוד לקצב המלא.',
  5: 'סימנת התמסרות מלאה, אז החישוב הוא לפי הקצב המקסימלי שהגוף מסוגל לו. זה גם אומר שאין הרבה מקום לשבועות חלשים.',
};

export function commitmentNote(profile) {
  const c = Math.round(Number(profile && profile.commitment)) || 3;
  return COMMITMENT_HE[c] || COMMITMENT_HE[3];
}

function weeksBetween(from, to) {
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  if (isNaN(a) || isNaN(b)) return 0;
  return (b - a) / (7 * DAY);
}

function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function round1(n) { return Math.round(n * 10) / 10; }

function kg(n) { return `${round1(n)} ק״ג`; }

/* ------------------------------------------------------------------ *
 * assessGoal
 * ------------------------------------------------------------------ */

export function assessGoal(profile) {
  const p = profile || {};
  const now = new Date();
  const weeksRaw = weeksBetween(now, p.targetDate);
  const weeks = Math.max(1, Math.round(weeksRaw));
  const start = Number(p.weightKg) || 0;
  const target = p.targetWeightKg === null || p.targetWeightKg === undefined || p.targetWeightKg === ''
    ? null : Number(p.targetWeightKg);

  const base = {
    weeks,
    kgDelta: 0,
    ratePerWeekKg: 0,
    realistic: true,
    verdict: '',
    suggestedTargetKg: null,
    suggestedDate: null,
    milestones: [],
  };

  /* ---- no target weight: judge the timeline against the goal ---- */
  if (target === null || !start) {
    base.verdict = qualitativeVerdict(p, weeks);
    base.milestones = qualitativeMilestones(p, weeks, now);
    return base;
  }

  const delta = target - start;
  base.kgDelta = delta;
  base.ratePerWeekKg = delta / weeks;

  if (Math.abs(delta) < 0.5) {
    base.verdict = `אתה כבר בטווח של היעד. ${weeks} השבועות הקרובים הם על הרכב הגוף ועל המספרים באימון — לא על המאזניים.`;
    base.milestones = monthlyMilestones(now, weeks, start, start, p);
    return base;
  }

  const losing = delta < 0;
  const perWeekFrac = Math.abs(delta) / weeks / start;

  const factor = commitmentFactor(p);
  let ceiling = (losing ? LOSS_CEILING : (GAIN_CEILING[p.experience] || GAIN_CEILING.beginner)) * factor;
  let comfy = (losing ? LOSS_COMFORTABLE : (GAIN_COMFORTABLE[p.experience] || GAIN_COMFORTABLE.beginner)) * factor;

  /*
   * The ceilings above are adult, training-driven muscle gain. A body that is
   * still growing adds mass without being asked, so for a trainee in that window
   * the growth is added on top before the target is judged.
   *
   * Without this a thirteen-year-old at 48kg aiming for 60 in a year came out
   * "unrealistic" and was told the extra would be fat — while that trajectory is
   * close to ordinary development. Only applies to gaining: growth is not a
   * licence to lose weight faster, and under-18 fat loss is refused above
   * regardless.
   */
  const growthKgPerWeek = losing ? 0 : growthAllowanceKgPerWeek(p);
  const growthFrac = start > 0 ? growthKgPerWeek / start : 0;
  if (growthFrac > 0) {
    ceiling += growthFrac;
    comfy += growthFrac;
  }

  /*
   * Asked, not computed. `Number(p.age) < 18` was the test here, and
   * Number(null) is 0 — so a profile with no age at all read as a
   * twelve-years-under-eighteen and had its fat-loss goal refused on the
   * grounds that the body is still growing.
   *
   * age.js settles what a missing age means and settles it the other way: the
   * questionnaire requires an age, so a blank one means an imported or
   * hand-edited profile, and applying child rules to an adult who never
   * answered is its own kind of wrong. This file had quietly disagreed.
   */
  const minor = isMinor(p);

  /* ---- under-18 fat loss gets steered, not encouraged ---- */
  if (minor && losing) {
    base.realistic = false;
    base.suggestedTargetKg = round1(start);
    base.suggestedDate = p.targetDate;
    base.verdict = 'בגיל הזה הגוף עוד גדל, וגירעון קלורי מכוון פוגע בגדילה ובאנרגיה. '
      + 'המסלול הנכון הוא לשמור על המשקל ולתת לגובה ולשריר לעשות את העבודה — ההרכב משתנה גם בלי שהמספר יורד. '
      + 'אם יש חשש רפואי לגבי המשקל, זו שיחה עם רופא, לא עם אפליקציה.';
    base.milestones = monthlyMilestones(now, weeks, start, start, p);
    return base;
  }

  /* ---- within a comfortable rate ---- */
  if (perWeekFrac <= comfy) {
    base.realistic = true;
    base.verdict = `${Math.abs(round1(delta))} ק״ג ב־${weeks} שבועות זה ${kg(Math.abs(base.ratePerWeekKg))} בשבוע — קצב שאפשר להחזיק בלי לשבור את האימונים או את השינה. `
      + (losing
        ? 'שמור על החלבון גבוה ועל הסטים הכבדים, וזה יהיה שומן ולא שריר.'
        : 'עודף קטן וקבוע. אם המשקל לא זז שבועיים ברצף, תוסיף ארוחה — לא אימון.');
    base.milestones = monthlyMilestones(now, weeks, start, target, p);
    return base;
  }

  /* ---- above comfortable but under the ceiling ---- */
  if (perWeekFrac <= ceiling) {
    base.realistic = true;
    base.verdict = `${Math.abs(round1(delta))} ק״ג ב־${weeks} שבועות זה ${kg(Math.abs(base.ratePerWeekKg))} בשבוע — אפשרי, אבל זה הקצה העליון. `
      + (losing
        ? 'ברמה הזאת הרעב אמיתי והביצועים באימון יירדו קצת. אם אתה מתחיל לפספס אימונים, האט — עדיף להגיע שבועיים אחרי היעד מאשר לא להגיע.'
        : 'ברמה הזאת חלק מהעלייה יהיה שומן. זה בסדר, אבל אל תתפתה להאיץ עוד.');
    base.suggestedTargetKg = round1(start + Math.sign(delta) * comfy * start * weeks);
    base.milestones = monthlyMilestones(now, weeks, start, target, p);
    return base;
  }

  /* ---- beyond the ceiling: give them the version that works ---- */
  const reachable = round1(start + Math.sign(delta) * comfy * start * weeks);
  const weeksNeeded = Math.ceil(Math.abs(delta) / (comfy * start));
  const farOff = weeksNeeded > 156; // beyond ~3 years, a date is theatre

  base.realistic = false;
  base.suggestedTargetKg = reachable;
  base.suggestedDate = farOff ? null : iso(new Date(now.getTime() + weeksNeeded * 7 * DAY));
  base.verdict = `${Math.abs(round1(delta))} ק״ג ב־${weeks} שבועות דורש ${kg(Math.abs(base.ratePerWeekKg))} בשבוע. `
    + (losing
      ? 'מעל הקצב הזה מה שיורד הוא בעיקר שריר ומים, והמשקל חוזר. '
      : (growthFrac > 0
        ? 'זה מעל מה שגדילה טבעית ואימון מוסיפים יחד בגיל הזה — מעל הקצב הזה התוספת היא שומן. '
        : 'הגוף לא בונה שריר מהר יותר מזה — מעל הקצב הזה התוספת היא שומן. '))
    + (farOff
      ? `${kg(Math.abs(delta))} בקצב שהגוף שלך באמת מסוגל לו זה עניין של ${Math.round(weeksNeeded / 52)} שנים, לא של חודשים. `
        + `בזמן שנתת היעד הוא ${kg(reachable)} — וזה יעד טוב. `
      : `בזמן שנתת אפשר להגיע ל־${kg(reachable)}, או להגיע ל־${kg(target)} עד ${formatHe(base.suggestedDate)}. `)
    + 'שתי האפשרויות טובות. זו שלא תעבוד היא לנסות את שתיהן יחד. '
    + commitmentNote(p);
  base.milestones = monthlyMilestones(now, weeks, start, reachable, p);
  return base;
}

function qualitativeVerdict(p, weeks) {
  const goal = p.goal;
  if (goal === 'strength') {
    return `${weeks} שבועות זה חלון טוב לכוח. מתחיל רואה עלייה משמעותית במספרים תוך 8–12 שבועות; ותיק מודד את זה בקילוגרמים בודדים, וזה עדיין הישג.`;
  }
  if (goal === 'muscle') {
    return `${weeks} שבועות. שריר נבנה לאט — מה שתראה קודם זה עלייה במספרים ובנפח באימון, והמראה מגיע אחרי. אל תשפוט לפי המראה בחודש הראשון.`;
  }
  if (goal === 'fatloss') {
    return `${weeks} שבועות בלי משקל יעד מוגדר. זה בסדר גמור — מדוד לפי היקף מותניים, לפי איך שהבגדים יושבים, ולפי המספרים באימון. המאזניים משקרים יומיומית.`;
  }
  if (goal === 'sport') {
    return `${weeks} שבועות של אימון תומך. המדד הוא לא המאזניים אלא מה שקורה במגרש — נפיצות, סיבולת, ופחות פציעות.`;
  }
  return `${weeks} שבועות. בלי יעד משקל, המדדים הם המספרים באימון, איך אתה מרגיש בבוקר, וכמה אימונים באמת סימנת בסוף כל שבוע.`;
}

function qualitativeMilestones(p, weeks, now) {
  const out = [];
  const months = Math.max(1, Math.min(6, Math.floor(weeks / 4.34)));
  const LABELS = [
    'טכניקה נקייה בכל התרגילים',
    'המספרים באימון מתחילים לזוז',
    'העלייה בעומס הופכת לשגרה',
    'הפרש ניכר מול נקודת ההתחלה',
    'שלב האיכות — פחות תרגילים, יותר עומס',
    'שיא התוכנית',
  ];
  for (let i = 1; i <= months; i++) {
    const d = new Date(now.getTime() + i * 4.34 * 7 * DAY);
    out.push({ date: iso(d), label: LABELS[i - 1] || 'המשך התקדמות', weightKg: null });
  }
  return out;
}

function monthlyMilestones(now, weeks, start, target, profile) {
  const out = [];
  const months = Math.max(1, Math.min(12, Math.floor(weeks / 4.34)));
  const total = target - start;
  for (let i = 1; i <= months; i++) {
    const d = new Date(now.getTime() + i * 4.34 * 7 * DAY);
    const frac = (i * 4.34) / weeks;
    out.push({
      date: iso(d),
      label: monthLabel(i, months, profile),
      weightKg: round1(start + total * Math.min(1, frac)),
    });
  }
  return out;
}

function monthLabel(i, months, profile) {
  if (i === months) return 'היעד';
  if (i === 1) return profile.experience === 'beginner' ? 'הרגל ראשון · טכניקה' : 'חזרה לשגרה';
  if (i === 2) return 'המספרים מתחילים לזוז';
  if (i === Math.ceil(months / 2)) return 'אמצע הדרך — נקודת בדיקה';
  return 'המשך צבירה';
}

function formatHe(d) {
  const parts = String(d || '').split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '—';
}

/* ------------------------------------------------------------------ *
 * facts — the header chip row
 * ------------------------------------------------------------------ */

export function facts(profile) {
  const p = profile || {};
  const out = [
    { label: 'משקל היום', value: `${round1(p.weightKg)} ק״ג` },
  ];
  if (p.targetWeightKg) out.push({ label: 'יעד', value: `${round1(p.targetWeightKg)} ק״ג` });
  out.push(
    { label: 'גובה', value: `${p.heightCm} ס״מ` },
    { label: 'שינה', value: `${p.sleepHours} שעות` },
    { label: 'אימון', value: `${p.minutesPerSession} דק׳` },
  );

  const weeks = Math.max(1, Math.round(weeksBetween(new Date(), p.targetDate)));
  out.push({ label: 'לאורך', value: `${weeks} שבועות` });
  out.push({ label: 'התמסרות', value: `${p.commitment || 3}/5` });
  return out;
}

export { weeksBetween };
