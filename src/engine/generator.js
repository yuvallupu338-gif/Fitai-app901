/*
 * generator.js — intake answers in, training plan out.
 *
 * The shape of the week comes from volume.js: how many sets each muscle group
 * gets, which sessions exist, and how much fits in one session. This file turns
 * that into actual exercises:
 *
 *   1. lay out slots — every slot is one job (a movement pattern) on one day,
 *      and the number of slots a group gets is derived from its weekly sets so
 *      no exercise ends up with one set or nine;
 *   2. fill each slot with 2–4 interchangeable variants sorted easy → hard, so
 *      the swap button always offers a real alternative for the same job;
 *   3. prescribe sets, reps, rest and (rarely) tempo from the goal and the role
 *      the slot plays in the session.
 *
 * Selection ALWAYS goes through candidates()/candidatesOrFallback() from the
 * registry — equipment, injuries, refusals and the level cap are its business,
 * not ours. Nothing here uses Math.random(); variety comes from hashProfile().
 */

import {
  MIN_AGE, MAX_AGE,
  easesImpact, needsStandingOption, needsLongerWarmup, warmsFast, stretchHoldSeconds,
} from './age.js';
import { asks } from '../data/demands.js';

import {
  candidates, candidatesOrFallback, conflictsInjury, hashProfile, rotate,
} from '../data/exercises.index.js';
import { weeklyVolume, splitFor, sessionBudget } from './volume.js';

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

/*
 * Movement pattern -> the volume group it spends sets from.
 *
 * Exported because the photo scan needs the same answer when it turns an
 * emphasis into per-group multipliers, and it used to keep its own copy. The
 * copies drifted: plyo was charged to legs here and to conditioning there, so
 * asking for more jumping bought a longer cardio block; mobility was charged to
 * core here and to nothing there, so asking for it did nothing at all. Neither
 * failed loudly — the sets simply went somewhere the user had not asked for.
 * This is the table that decides where sets really come from, so it is the one
 * that gets shared.
 */
export const PATTERN_GROUP = {
  horizontal_push: 'push', vertical_push: 'push',
  horizontal_pull: 'pull', vertical_pull: 'pull',
  squat: 'legs', hinge: 'legs', lunge: 'legs', plyo: 'legs',
  core_flexion: 'core', core_antiextension: 'core', core_rotation: 'core', carry: 'core',
  arms_biceps: 'arms', arms_triceps: 'arms',
  shoulders_lateral: 'shoulders', shoulders_rear: 'shoulders',
  calf: 'calves', conditioning: 'conditioning', mobility: 'core',
};

/** Fallback pattern when a group earns sets but the split never asked for it. */
const GROUP_PATTERN = {
  push: 'horizontal_push', pull: 'horizontal_pull', legs: 'squat',
  core: 'core_antiextension', arms: 'arms_biceps', shoulders: 'shoulders_lateral',
  calves: 'calf', conditioning: 'conditioning',
};

/** Who gets slots first when the session runs out of room. */
const GROUP_PRIORITY = {
  strength: ['legs', 'push', 'pull', 'core', 'arms', 'shoulders', 'calves', 'conditioning'],
  muscle: ['push', 'pull', 'legs', 'arms', 'shoulders', 'core', 'calves', 'conditioning'],
  fatloss: ['legs', 'push', 'pull', 'conditioning', 'core', 'arms', 'shoulders', 'calves'],
  fitness: ['legs', 'push', 'pull', 'core', 'conditioning', 'shoulders', 'arms', 'calves'],
  sport: ['legs', 'pull', 'push', 'conditioning', 'core', 'shoulders', 'arms', 'calves'],
};

/** Sets one exercise carries, by goal. Strength stacks sets, fat loss spreads them. */
const SETS_PER_SLOT = { strength: 4.0, muscle: 3.4, fatloss: 3.0, fitness: 3.0, sport: 3.2 };

const COMPOUND_PATTERNS = ['horizontal_push', 'vertical_push', 'horizontal_pull',
  'vertical_pull', 'squat', 'hinge', 'lunge'];

/*
 * When a pattern has nothing left to offer — a bad shoulder wipes out every
 * overhead press, say — the slot moves to a neighbouring pattern in the SAME
 * volume group. More horizontal pressing beats a lonely, painful overhead press.
 */
const SIBLING_PATTERN = {
  vertical_push: ['horizontal_push'], horizontal_push: ['vertical_push'],
  vertical_pull: ['horizontal_pull'], horizontal_pull: ['vertical_pull'],
  squat: ['lunge', 'hinge'], hinge: ['squat', 'lunge'], lunge: ['squat', 'hinge'],
  plyo: ['squat', 'lunge'],
  core_flexion: ['core_antiextension', 'core_rotation'],
  core_antiextension: ['core_flexion', 'core_rotation'],
  core_rotation: ['core_antiextension', 'core_flexion'],
  carry: ['core_antiextension', 'core_rotation'],
  arms_biceps: ['arms_triceps'], arms_triceps: ['arms_biceps'],
  shoulders_lateral: ['shoulders_rear'], shoulders_rear: ['shoulders_lateral'],
  calf: [], conditioning: [], mobility: [],
};

/** Equipment that adds external resistance, and equipment that only holds you. */
const LOADING_EQUIP = ['dumbbells', 'barbell', 'kettlebell', 'machines', 'cable'];
const APPARATUS_EQUIP = ['pullup_bar', 'dip_bars', 'rings', 'trx', 'bench', 'box',
  'jump_rope', 'treadmill', 'bike', 'rower', 'sled'];

/** Warm-up drills are picked in this order, so the session opens general and ends specific. */
const WARMUP_PATTERN_ORDER = ['squat', 'hinge', 'lunge', 'plyo', 'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull', 'core_antiextension', 'core_flexion', 'core_rotation',
  'shoulders_lateral', 'shoulders_rear', 'calf', 'carry', 'arms_biceps', 'arms_triceps', 'conditioning'];

/** [reps, restSeconds] by goal and role. Reps are for unit:'reps' work. */
const SCHEME = {
  strength: {
    skill: ['3–5', 150], main: ['3–6', 150], secondary: ['5–8', 120],
    accessory: ['8–12', 75], core: ['8–12', 60], finisher: ['10–15', 60],
  },
  muscle: {
    skill: ['4–6', 150], main: ['6–10', 105], secondary: ['8–12', 90],
    accessory: ['10–15', 70], core: ['10–15', 50], finisher: ['12–15', 50],
  },
  fatloss: {
    skill: ['6–8', 90], main: ['10–15', 60], secondary: ['12–15', 50],
    accessory: ['12–15', 45], core: ['12–20', 40], finisher: ['15–20', 40],
  },
  fitness: {
    skill: ['6–8', 90], main: ['8–12', 75], secondary: ['10–15', 60],
    accessory: ['10–15', 55], core: ['10–15', 45], finisher: ['12–20', 45],
  },
  sport: {
    skill: ['3–5', 120], main: ['4–6', 150], secondary: ['6–10', 105],
    accessory: ['10–12', 60], core: ['10–15', 45], finisher: ['12–15', 45],
  },
};

const REST_HE = {
  150: '2–3 דק׳', 120: '2 דק׳', 105: '90–120 שנ׳', 90: '90 שנ׳', 75: '60–90 שנ׳',
  70: '60–90 שנ׳', 60: '60 שנ׳', 55: '45–60 שנ׳', 50: '45–60 שנ׳', 45: '45 שנ׳',
  40: '30–45 שנ׳', 30: '30 שנ׳', 20: '20 שנ׳',
};

/* Tempo earns its place only where the slow half IS the exercise. */
const TEMPO_BY_ID = {
  nordic_curl: '4–1–1', nordic_negative: '5–0–1', nordic_lean: '4–0–1',
  band_assisted_nordic: '4–0–1', towel_hamstring_curl: '4–1–1',
  negative_pullup: '5–0–0', tempo_squat: '3–1–1',
};

const MUSCLE_HE = {
  chest: 'חזה', back: 'גב', lats: 'רחבים', traps: 'טרפז', shoulders: 'כתפיים',
  rear_delts: 'כתף אחורית', biceps: 'יד קדמית', triceps: 'יד אחורית',
  forearms: 'אמות', core: 'ליבה', obliques: 'אלכסונים', lower_back: 'גב תחתון',
  glutes: 'ישבן', quads: 'ארבע ראשי', hamstrings: 'ירך אחורית', calves: 'שוקיים',
  hip_flexors: 'כופפי ירך', adductors: 'מקרבים', full_body: 'כל הגוף',
};

const INJURY_HE = {
  lower_back: 'הגב התחתון', upper_back: 'הגב העליון', neck: 'הצוואר',
  shoulder: 'הכתף', elbow: 'המרפק', wrist: 'שורש כף היד', hip: 'הירך',
  knee: 'הברך', ankle: 'הקרסול', hernia: 'הבקע', pregnancy: 'ההיריון',
  heart: 'הלב', asthma: 'הנשימה',
};

/* ------------------------------------------------------------------ *
 * Notes — why this exercise, or the one cue that matters most here.
 * ------------------------------------------------------------------ */

const NOTE_BY_ID = {
  /* horizontal push */
  wall_pushup: 'נקודת הפתיחה של השכיבות. ברגע ש־15 חזרות נקיות זה קל — יורדים לשולחן או לספסל.',
  incline_pushup: 'אותה תנועה כמו שכיבת סמיכה, בזווית שמורידה חלק מהמשקל. ככל שהמשטח נמוך יותר, קשה יותר.',
  knee_pushup: 'הגשר בין שכיבה בזווית לשכיבה מלאה. הגוף קו ישר מהברכיים לכתפיים, בלי ישבן באוויר.',
  pushup: 'הדחיפה האופקית של היום. מרפקים בערך 45 מעלות מהגוף, לא מפורקים לצדדים.',
  decline_pushup: 'רגליים מוגבהות מעבירות עוד משקל לידיים ומדגישות את החלק העליון של החזה.',
  diamond_pushup: 'ידיים צמודות מעבירות את רוב העבודה ליד האחורית. אם המרפק מתלונן — חזור לשכיבה רגילה.',
  archer_pushup: 'צעד לקראת שכיבה על יד אחת: יד אחת עובדת, השנייה רק מייצבת.',
  db_floor_press: 'הרצפה עוצרת את המרפק לפני הטווח המלא — הלחיצה הכי ידידותית לכתף.',
  db_bench_press: 'משקולות נפרדות נותנות טווח גדול יותר מהמוט ומאלצות כל צד לעבוד לבד.',
  incline_db_press: 'זווית של 30 מעלות מעבירה את הדגש לחלק העליון של החזה.',
  bench_press: 'התרגיל הכבד של היום. שכמות אסופות ונעולות בספסל, המוט נוגע בחזה ולא קופץ ממנו.',
  machine_chest_press: 'מסלול קבוע — כל הריכוז הולך לדחיפה עצמה ולא לייצוב.',
  band_chest_press: 'ההתנגדות עולה ככל שהיד מתיישרת, בדיוק במקום שבו החזה חזק.',
  db_fly: 'בידוד לחזה בטווח פתוח. מרפק כפוף קלות וקבוע — זו לא לחיצה.',
  cable_chest_fly: 'הכבל שומר מתח על החזה לכל אורך הטווח, גם למעלה.',
  bar_dip: 'דחיפה כבדה מאוד ליחידת זמן. נטייה קלה קדימה מעבירה עומס לחזה, זקוף — ליד האחורית.',
  ring_dip: 'הטבעות זזות, אז כל סט הוא גם עבודת ייצוב. רק אחרי שמקבילים יציבים קלים.',
  pseudo_planche_pushup: 'הישענות קדימה הופכת שכיבה רגילה לתרגיל כתפיים־חזה קשה בהרבה.',
  scap_pushup: 'תנועה קטנה של השכמות בלבד — מכינה את חגורת הכתפיים לדחיפות.',

  /* vertical push */
  wall_slide: 'מלמדת את השכמה לזוז נכון מתחת ליד המורמת. חימום, לא תרגיל כוח.',
  band_overhead_press: 'לחיצה מעל הראש בעומס שאפשר לכוון בדיוק לפי היום.',
  kneeling_pike_pushup: 'שכיבת סמיכה בזווית שמכוונת את העומס לכתפיים במקום לחזה.',
  incline_pike_pushup: 'ככל שהידיים גבוהות יותר, קל יותר. מוריד את הגובה בהדרגה.',
  pike_pushup: 'לחיצת כתפיים במשקל גוף. ישבן גבוה, ראש יורד קדימה בין הידיים — ככל שהירכיים גבוהות יותר, כך העומס עובר לכתף.',
  elevated_pike_pushup: 'רגליים על תיבה — כמעט כל משקל הגוף עובר לכתפיים.',
  db_shoulder_press: 'לחיצה מעל הראש. צלעות סגורות, בלי לקשת את הגב התחתון כדי לסיים חזרה.',
  seated_db_shoulder_press: 'הישיבה מוציאה את הגב התחתון מהמשוואה ומשאירה את העבודה בכתף.',
  machine_shoulder_press: 'מסלול מונחה — נוח כשהכתף רגישה לייצוב חופשי.',
  overhead_press: 'הלחיצה הכבדה של היום. ישבן וליבה נעולים, המוט עובר קרוב לפנים.',
  push_press: 'דחיפה קלה מהרגליים מאפשרת עומס גבוה יותר ממה שהכתף לבדה מרימה.',
  landmine_press: 'זווית ביניים בין לחיצת חזה ללחיצת כתפיים — נוחה לכתפיים שלא אוהבות מעל הראש.',
  wall_handstand: 'עמידת ידיים לקיר בונה את הכוח האיזומטרי לפני שמתחילים ללחוץ.',
  handstand_pushup: 'לחיצת הכתפיים הקשה ביותר במשקל גוף. עולים אליה רק אחרי עמידה יציבה.',

  /* horizontal pull */
  prone_ytw_raise: 'מפעיל את השרירים הקטנים שמחזיקים את השכמה — מגן על הכתף בכל השאר.',
  superman_row: 'חתירה בשכיבה על הבטן, בלי ציוד בכלל. הכיווץ בסוף הוא כל התרגיל.',
  towel_row_iso: 'מושכים במגבת נגד יד שנייה. ההתנגדות מגיעה מהיד השנייה, אז אתה קובע אותה בעצמך לאורך כל הסט.',
  doorframe_towel_row: 'חתירה ביתית: משקל הגוף נגד משקוף. ככל שהרגליים קדימה יותר, קשה יותר.',
  table_row: 'חתירה מתחת לשולחן יציב. ככל שהרגליים ישרות יותר, גדל החלק ממשקל הגוף שאתה מושך.',
  incline_aussie_row: 'מוט גבוה, גוף אלכסוני — הגרסה הקלה של החתירה ההפוכה.',
  aussie_row: 'משיכה אופקית של משקל הגוף. שכמות נסגרות ראשונות, המרפקים אחריהן.',
  feet_elevated_aussie_row: 'רגליים מוגבהות מקרבות את החתירה למשקל גוף מלא.',
  band_seated_row: 'משיכה אופקית עם גומייה. עצור רגע כשהמרפקים מאחורי הגוף.',
  band_bent_over_row: 'חתירה בכפיפה עם גומייה. ההתנגדות גדלה ככל שמתקרבים לסוף המשיכה, בדיוק במקום החזק.',
  trx_row: 'הזווית שלך קובעת את העומס: רגליים קדימה — קשה, אחורה — קל.',
  db_row: 'חתירה חד־צדדית. הגב נשאר מקביל לרצפה, המשקולת נוסעת לכיוון הירך.',
  db_chest_supported_row: 'החזה נשען, אז הגב התחתון לא משתתף — כל הסט הולך לגב העליון.',
  db_bent_row: 'חתירה כבדה בכפיפה. גב ישר לחלוטין; ברגע שהוא מתעגל הסט נגמר.',
  bent_row: 'החתירה הכבדה של היום. הגב מייצב, הרגליים תומכות, המרפקים מושכים.',
  cable_row: 'מתח קבוע לאורך כל הטווח, ובלי עומס על הגב התחתון.',
  cable_single_arm_row: 'צד אחד בכל פעם — מגלה איזה צד עושה פחות עבודה.',
  machine_row: 'חתירה במסלול קבוע — מצוינת ללמוד להרגיש את הגב במקום את הידיים.',
  ring_row: 'הטבעות מסתובבות ומאפשרות למרפק ולכתף למצוא זווית נוחה.',
  archer_row: 'עומס מוטה לצד אחד — הצעד לפני חתירה על יד אחת.',

  /* vertical pull */
  prone_lat_pull_slide: 'מלמד את הרחבים למשוך את המרפק למטה — הבסיס לכל משיכה אנכית.',
  towel_pulldown_iso: 'מתיחת מגבת בכוח מפעילה את הרחבים גם בלי שום ציוד.',
  band_lat_pulldown: 'מורידים את המרפקים לצלעות. הגומייה מושכת חזק יותר ככל שהיא נמתחת, אז הסוף הוא החלק הקשה.',
  band_straight_arm_pulldown: 'ידיים ישרות — בידוד נקי לרחבים בלי שהידיים יגנבו את התרגיל.',
  dead_hang: 'תלייה פסיבית בונה אחיזה וכתף בריאה. מודדים שניות, לא חזרות.',
  scap_pull: 'רק השכמות זזות — הצעד הראשון של כל מתח, וגם התיקון לכתף שלא מתייצבת.',
  lat_pulldown: 'משיכה אנכית בעומס מדויק. חזה למעלה, המוט לחלק העליון של החזה.',
  assisted_pullup_machine: 'המכונה מורידה חלק ממשקל הגוף — הדרך הישירה ביותר להגיע למתח.',
  jumping_pullup: 'קפיצה למעלה, ירידה איטית ומבוקרת — כך בונים מתח ראשון.',
  negative_pullup: 'רק החלק היורד. חמש שניות למטה בשליטה מלאה, זה כל התרגיל.',
  band_assisted_pullup: 'הגומייה עוזרת בדיוק בנקודה הקשה למטה. ככל שהיא דקה יותר, קשה יותר.',
  pullup: 'המשיכה הכבדה של היום. חזה לכיוון המוט, בלי לנדנד את הגוף.',
  chinup: 'אחיזה תחתונה מכניסה את היד הקדמית לעבודה — בדרך כלל חזקה יותר מהמתח הרגיל.',
  neutral_grip_pullup: 'כפות ידיים פונות זו לזו — האחיזה הכי נוחה לכתף ולמרפק.',
  wide_pullup: 'אחיזה רחבה מדגישה את רוחב הגב, במחיר טווח קצר יותר.',
  ring_pullup: 'הטבעות מאפשרות לפרק הכתף לסובב תוך כדי — פחות שחיקה לאורך זמן.',
  weighted_pullup: 'משקל חיצוני על מתח נקי. מוסיפים 2.5 ק״ג בכל פעם, לא יותר.',
  muscle_up: 'מתח נפיץ ומעבר מעל המוט. תרגיל מיומנות — עובדים אותו טרי בתחילת האימון.',
  straight_arm_pulldown: 'בידוד לרחבים בלי מעורבות של היד הקדמית.',
  db_lat_pullover: 'פותח את בית החזה ומותח את הרחבים בטווח שהמשיכות לא מגיעות אליו.',

  /* squat */
  sit_to_stand: 'קימה מכיסא בשליטה. זה הסקוואט הראשון, והמדד התפקודי החשוב ביותר.',
  box_squat_high: 'התיבה קובעת עומק קבוע ומלמדת לשבת אחורה בלי לאבד את הגב.',
  bodyweight_squat: 'סקוואט משקל גוף. ברכיים בכיוון האצבעות, עקבים נשארים על הרצפה.',
  tempo_squat: 'שלוש שניות למטה. ההאטה מאריכה את הזמן תחת מתח — זה מה שהופך סקוואט קל לתובעני.',
  wall_sit: 'איזומטרי לארבע ראשי — עומס גדול על השריר בלי שום עומס על המפרק.',
  goblet_squat: 'המשקולת מלפנים מאזנת אותך ומחזיקה את החזה למעלה מעצמה.',
  kb_goblet_squat: 'הקטלבל צמוד לחזה — הסקוואט הכי קל ללמוד נכון מהפעם הראשונה.',
  leg_press: 'עומס גבוה לרגליים בלי לטעון את הגב. אל תוריד לעומק שמרים את האגן מהמשענת.',
  leg_extension: 'בידוד לארבע ראשי. שימושי בעיקר כתוספת אחרי התרגילים הגדולים.',
  single_leg_box_squat: 'רגל אחת, תיבה מאחור לביטחון — בונה כוח ואיזון יחד.',
  back_squat: 'הסקוואט הכבד של היום. נשימה פנימה, ליבה נעולה, יורדים עד שהירך מקבילה.',
  front_squat: 'המוט מלפנים מכריח גב זקוף — פחות משקל, יותר ארבע ראשי.',
  bb_box_squat: 'התיבה מקבעת עומק ומורידה את העומס על הגב התחתון.',
  assisted_pistol_squat: 'הרצועות נותנות בדיוק את העזרה שצריך כדי לרדת נקי על רגל אחת.',
  pistol_squat: 'סקוואט על רגל אחת — כוח, ניידות ואיזון באותו תרגיל.',
  supported_squat: 'אחיזה ברצועות מורידה חלק מהמשקל ומאפשרת לרדת עמוק בבטחה.',

  /* hinge */
  hip_hinge_drill: 'לומדים לשלוח את האגן אחורה בלי לכופף את הגב. כל הדדליפטים מתחילים כאן.',
  glute_bridge: 'מפעיל את הישבן בלי לטעון את הגב — הכי מתאים כשהגב התחתון רגיש.',
  single_leg_glute_bridge: 'רגל אחת מכפילה את העומס על הישבן בלי שום ציוד.',
  bw_hip_thrust: 'הישבן עובד בטווח העליון, בדיוק במקום שבו הוא הכי חזק.',
  band_pull_through: 'הגומייה מושכת אחורה ומלמדת את דפוס ציר הירכיים בעומס קל.',
  band_leg_curl: 'כיפוף ברך נגד גומייה — עבודה ישירה לירך האחורית ללא מכונה.',
  kb_deadlift: 'הקטלבל בין הרגליים — הדרך הבטוחה ביותר להתחיל להרים מהרצפה.',
  db_rdl: 'רומנית: ירידה עד שמרגישים מתיחה בירך האחורית, לא עד הרצפה.',
  rdl: 'הרומנית היא תרגיל הירך האחורית המרכזי. המוט מחליק לאורך הרגליים, גב ניטרלי.',
  deadlift: 'ההרמה הכבדה של היום. נועלים את הגב לפני שהמוט זז, ודוחפים את הרצפה.',
  good_morning: 'עומס ישיר על ציר הירכיים והגב התחתון. משקל קטן, טווח מבוקר.',
  hip_thrust: 'העומס הישיר הגבוה ביותר על הישבן. סנטר לחזה, צלעות סגורות למעלה.',
  db_hip_thrust: 'דחיפת אגן עם משקולת — כל העבודה בישבן, אפס עומס על הברך.',
  leg_curl: 'בידוד לירך האחורית. מאזן את כל הסקוואטים והלחיצות.',
  back_extension: 'מחזק את שרשרת הגב האחורית בטווח קטן ומבוקר.',
  single_leg_rdl: 'רומנית על רגל אחת — ירך אחורית, ישבן ואיזון בבת אחת.',
  db_single_leg_rdl: 'משקולת ביד הנגדית לרגל העומדת. איטי, בלי לסובב את האגן.',
  nordic_lean: 'הטיה מהברכיים עם ירידה איטית. עבודה אקסצנטרית שמגינה על הירך האחורית.',
  band_assisted_nordic: 'הגומייה נותנת בדיוק מספיק עזרה כדי לשלוט בירידה עד הסוף.',
  nordic_negative: 'רק הירידה, איטית ככל האפשר. אחד התרגילים הכי מוכחים נגד קרעים בירך האחורית.',
  nordic_curl: 'התרגיל האקסצנטרי החזק ביותר לירך האחורית. שולטים בכל הדרך למטה.',
  towel_hamstring_curl: 'החלקה על מגבת — כיפוף ברך בהתנגדות בלי שום ציוד.',
  kb_swing: 'נפיצות מציר הירכיים. הידיים רק מחזיקות, הישבן עושה את העבודה.',
  cable_pull_through: 'מתח קבוע על הישבן לאורך כל התנועה, ובלי עומס על עמוד השדרה.',

  /* lunge */
  supported_split_squat: 'אחיזה קלה ביד מוציאה את האיזון מהמשוואה ומשאירה את העבודה ברגל.',
  low_step_up: 'עלייה על מדרגה נמוכה. תרגיל חד־צדדי בטוח שמתקדם פשוט על ידי הגבהה.',
  split_squat: 'עמידת פיצול במקום — כל רגל עובדת לבד בלי לאבד יציבות.',
  reverse_lunge: 'צעד אחורה במקום קדימה — הרבה יותר עדין לברך.',
  forward_lunge: 'הצעד קדימה דורש בלימה. איטי בירידה, דוחף מהעקב בחזרה.',
  step_up: 'עלייה מלאה על תיבה. הרגל למעלה עושה הכול, הרגל למטה לא עוזרת.',
  walking_lunge: 'לאנג׳ בתנועה — כוח, איזון וסיבולת רגליים באותו סט.',
  db_split_squat: 'משקולות בידיים מוסיפות עומס לפיצול בלי לשנות את הטכניקה.',
  db_reverse_lunge: 'צעד אחורה עם משקולות — העמסה בטוחה על רגל אחת.',
  db_step_up: 'עלייה על תיבה עם משקל. גובה התיבה קובע כמה קשה זה יהיה.',
  bulgarian_split_squat: 'רגל אחורית על ספסל. אחד התרגילים הקשים והיעילים לרגליים.',
  db_walking_lunge: 'הליכת לאנג׳ם עם משקולות — סיום רגליים שמעלה דופק.',

  /* calf */
  calf_raise: 'שוקיים בטווח מלא: עלייה עד קצה האצבעות, ירידה עד המתיחה.',
  single_leg_calf_raise: 'רגל אחת מכפילה את העומס — מספיק כדי לבנות שוק בלי משקל.',
  db_calf_raise: 'משקולת ביד מוסיפה עומס. עצירה של שנייה למעלה בכל חזרה.',
  seated_calf_raise: 'ישיבה מדגישה את הסולאוס, השריר העמוק של השוק.',
  bb_calf_raise: 'העומס הגבוה ביותר לשוקיים. טווח מלא, בלי לקפוץ.',
  tibialis_raise: 'החלק הקדמי של השוק — מונע שין ספלינטס ומשפר יציבות קרסול.',
  deficit_calf_raise: 'ירידה מתחת לגובה המדרגה מוסיפה את המתיחה שהשוק צריך.',

  /* core */
  standing_knee_to_elbow: 'כיפוף גו בעמידה — ליבה בלי לרדת לרצפה ובלי לחץ על הצוואר.',
  bird_dog: 'יד ורגל נגדיות. הליבה עובדת כדי שהאגן לא יזוז בכלל.',
  dead_bug: 'הגב התחתון צמוד לרצפה לאורך כל התנועה. ברגע שהוא מתרומם — עצור.',
  knee_plank: 'פלאנק על הברכיים. עדיף שלושים שניות נקיות מדקה עם ישבן באוויר.',
  high_plank: 'פלאנק על ידיים ישרות. ישבן בקו אחד עם הכתפיים, בלי שקיעה.',
  forearm_plank: 'התרגיל שמלמד את הליבה להתנגד לקשת בגב. סופרים שניות בקו ישר בלבד.',
  tuck_hollow_hold: 'הגרסה הקצרה של הסירה — הגב התחתון נשאר צמוד לרצפה.',
  hollow_hold: 'הבסיס של כל עבודת הליבה בהתעמלות. גב תחתון מודבק לרצפה.',
  hollow_rock: 'נדנוד בגוף נעול. אם הגב מתקשת — חוזרים להחזקה סטטית.',
  crunch: 'כיפוף גו קצר. הידיים לא מושכות את הראש, הצוואר נשאר רגוע.',
  reverse_crunch: 'האגן מתגלגל למעלה. גרסה עדינה יותר לגב מאשר הרמת רגליים ישרות.',
  lying_knee_raise: 'ברכיים כפופות מקצרות את המנוף ומורידות עומס מהגב התחתון.',
  lying_leg_raise: 'רגליים ישרות. אם הגב מתרומם מהרצפה — כופף ברכיים.',
  situp: 'כפיפת בטן מלאה. עולים בגלגול, לא בתנופה.',
  v_up: 'ידיים ורגליים נפגשות — כיפוף מהיר שדורש ליבה חזקה כבר.',
  hanging_knee_raise: 'מהתלייה: ברכיים לחזה בלי נדנוד. גם האחיזה מרוויחה.',
  hanging_leg_raise: 'רגליים ישרות מהתלייה — עבודת ליבה קשה בטווח מלא.',
  toes_to_bar: 'מהתלייה עד המוט. שולטים בדרך למטה, לא נופלים.',
  tuck_l_sit: 'החזקה בתמיכה עם ברכיים מקופלות — הצעד הראשון ל־L-sit.',
  l_sit: 'רגליים ישרות בזווית ישרה. ליבה, כתפיים וכופפי ירך יחד.',
  side_plank_knees: 'פלאנק צד על הברך — עבודה על האלכסונים בלי עומס על הכתף.',
  side_plank: 'אלכסונים בתפקידם האמיתי: למנוע מהאגן ליפול.',
  side_plank_reach: 'השחלת היד מוסיפה סיבוב מבוקר לפלאנק הצד.',
  russian_twist: 'סיבוב גו בישיבה. איטי ומבוקר — מהירות כאן לא תורמת כלום.',
  pallof_press: 'הגומייה מנסה לסובב אותך ואתה מסרב. זו כל העבודה.',
  band_woodchop: 'סיבוב באלכסון נגד התנגדות — הליבה מעבירה כוח בין פלג גוף עליון לתחתון.',
  cable_woodchop: 'העברת כוח באלכסון, בדיוק כמו בזריקה או בחבטה.',
  cable_crunch: 'כיפוף גו בעומס. הירכיים לא זזות, רק עמוד השדרה מתקצר.',
  trx_fallout: 'הידיים נשלחות קדימה והליבה מונעת קשת בגב. קשה יותר משזה נראה.',
  barbell_rollout: 'אחד התרגילים הקשים לליבה. הגב לא זז מילימטר.',
  front_lever_tuck: 'מיומנות: הגוף נשאר אופקי מתחת למוט. עובדים אותה טרי.',

  /* carry */
  backpack_carry: 'תיק על הגב והליכה. ליבה, אחיזה ויציבה — הכי פשוט שיש.',
  farmer_carry: 'משקל בכל יד והליכה זקופה. אחיזה, טרפז וליבה בבת אחת.',
  suitcase_carry: 'משקל ביד אחת — הליבה עובדת קשה כדי לא לתת לגוף להיטות.',
  suitcase_hold: 'עמידה עם משקל ביד אחת. פשוט לא לתת לגוף לנטות הצידה.',
  front_rack_carry: 'המשקל מלפנים מכריח גב זקוף לכל אורך ההליכה.',

  /* arms */
  backpack_curl: 'כפיפת מרפקים עם תיק — עומס אמיתי ליד הקדמית בלי ציוד.',
  band_biceps_curl: 'הגומייה מתקשה בדיוק בסוף הטווח, שם היד הקדמית הכי חזקה.',
  biceps_curl: 'מרפקים צמודים לגוף. הכתף לא משתתפת, רק המרפק מתכופף.',
  hammer_curl: 'אחיזת פטיש עובדת גם על הברכיורדיאליס — עובי לזרוע.',
  concentration_curl: 'מרפק נשען על הירך — אין דרך לרמות עם הכתף.',
  incline_db_curl: 'הישענות אחורה מותחת את היד הקדמית ומגדילה את הטווח.',
  bb_curl: 'עומס גבוה ליד הקדמית. הגוף לא מתנדנד, הידיים עושות את העבודה.',
  ez_curl: 'המוט המפותל מוריד עומס משורש כף היד ומהמרפק.',
  cable_curl: 'מתח קבוע לאורך כל הטווח, גם בנקודה התחתונה.',
  doorframe_biceps_curl: 'משיכה נגד משקוף — התנגדות איזומטרית ליד הקדמית ללא ציוד.',
  wall_triceps_extension: 'יישור מרפק נגד הקיר — נקודת פתיחה ליד אחורית.',
  floor_triceps_dip: 'טבילה מהרצפה. מרפקים אחורה, לא לצדדים.',
  bench_dip: 'טבילת ספסל. אל תרד מתחת לזווית שבה הכתף מתחילה להתגלגל קדימה.',
  close_grip_pushup: 'שכיבת סמיכה באחיזה צרה — יד אחורית וחזה פנימי.',
  sphinx_pushup: 'יישור מרפקים מהאמות. בידוד יד אחורית במשקל גוף.',
  band_triceps_pushdown: 'מרפקים צמודים, רק האמה זזה.',
  triceps_pushdown: 'התרגיל הבטוח והיעיל ביותר ליד אחורית. מרפק נעול במקום.',
  db_kickback: 'יישור מלא אחורה עם עצירה — כיווץ מקסימלי ליד האחורית.',
  db_overhead_triceps_ext: 'מעל הראש מותח את הראש הארוך של היד האחורית.',
  db_skullcrusher: 'מרפקים מצביעים למעלה וקבועים; רק האמה נעה.',
  close_grip_bench: 'לחיצה באחיזה צרה — הדרך להעמיס כבד על היד האחורית.',
  triceps_dip_bars: 'מקבילים בגוף זקוף מעבירים את מרבית העומס ליד האחורית.',

  /* shoulders */
  arm_circles: 'סיבובי כתף לחימום — מעלים טמפרטורה במפרק לפני עומס.',
  wall_angel: 'מלמד את השכמות לזוז נכון ומתקן כתפיים מכונסות.',
  bw_lateral_raise: 'הרמת ידיים לצדדים בהתנגדות עצמית — עובד גם בלי משקולות.',
  band_lateral_raise: 'הגומייה מוסיפה התנגדות בדיוק בסוף הטווח.',
  db_lateral_raise: 'הרמה לצדדים בונה את רוחב הכתף. משקל קטן, טווח נקי, בלי תנופה.',
  cable_lateral_raise: 'מתח קבוע על הכתף האמצעית לכל אורך התנועה.',
  db_scaption_raise: 'הרמה בזווית 30 מעלות קדימה — הזווית הידידותית ביותר למפרק.',
  db_front_raise: 'הרמה קדימה לכתף הקדמית. משלים את הלחיצות.',
  bb_upright_row: 'משיכה אנכית לכתף ולטרפז. עצור בגובה החזה, לא מעבר.',
  lateral_raise_hold: 'החזקה סטטית בזווית 90 מעלות — שורף בלי שום ציוד.',
  prone_w_raise: 'מפעיל את הכתף האחורית ואת מייצבי השכמה בשכיבה על הבטן.',
  prone_t_raise: 'ידיים לצדדים בשכיבה — עבודה ישירה לכתף האחורית.',
  prone_y_raise: 'זווית Y מכוונת לטרפז התחתון, השריר ששומר על השכמה במקום.',
  band_pull_apart: 'פתיחת גומייה מול החזה — התרופה לכתפיים מכונסות מישיבה מול מחשב.',
  db_reverse_fly: 'פתיחה לצדדים בכפיפה. מאזן את כל הדחיפות של השבוע.',
  chest_supported_db_reverse_fly: 'החזה נשען, אז אין דרך לרמות עם הגב.',
  cable_face_pull: 'משיכה לגובה הפנים עם סיבוב חיצוני — הבריא ביותר לכתף לאורך זמן.',
  machine_reverse_fly: 'בידוד לכתף האחורית במסלול מונחה.',
  bb_rear_delt_row: 'חתירה למרפקים פתוחים — מכוונת לכתף האחורית ולא לרחבים.',

  /* conditioning + plyo */
  march_in_place: 'צעידה במקום כדי להעלות דופק וטמפרטורה לפני האימון.',
  jog: 'ריצה קלה. אמור להיות אפשרי לדבר תוך כדי — אחרת זה מהר מדי.',
  jumping_jack: 'קפיצות פישוק. פשוט, מעלה דופק, ומחמם את כל הגוף.',
  high_knees: 'ברכיים גבוהות בקצב — דופק גבוה בלי מרחק.',
  mountain_climber: 'ברכיים לחזה בקצב, ישבן לא עולה. גם דופק וגם ליבה.',
  burpee: 'התרגיל שמעלה דופק הכי מהר. איכות לפני מהירות.',
  jump_rope: 'חבל קפיצה — קפיצות קטנות מהקרסול, לא מהברך.',
  bike_intervals: 'אינטרוולים על אופניים: כל העומס הקרדיווסקולרי, אפס זעזוע למפרקים.',
  rower_intervals: 'חתירה מפעילה גם רגליים וגם גב. הדחיפה מגיעה מהרגליים.',
  treadmill_intervals: 'אינטרוולים בהליכון — פשוט לשלוט בקצב ובזמן.',
  shuttle_run: 'ריצות קצרות עם שינוי כיוון — האטה והאצה, כמו במשחק.',
  pogo_hop: 'קפיצות קטנות ונוקשות מהקרסול — מכינות את הגיד לעבודה נפיצה.',
  vertical_jump: 'קפיצה מקסימלית. נוחתים רך, ומנוחה מלאה בין חזרות.',
  low_box_jump: 'קפיצה לתיבה נמוכה. הנחיתה רכה — היא החלק החשוב.',
  jump_squat: 'סקוואט נפיץ. איכות הקפיצה חשובה מהכמות.',
  skater_hop: 'קפיצות מהצד לצד — עובד על יציבות רוחבית של הברך והירך.',
  box_jump: 'קפיצה לתיבה. עולים בקפיצה, יורדים בצעד.',
  split_jump: 'החלפת רגליים באוויר — נפיצות חד־צדדית.',
  broad_jump: 'קפיצה למרחק. כוח אופקי, בדיוק כמו בהאצה.',
};

/** Fallbacks per pattern and role — still concrete about the job of the slot. */
const PATTERN_NOTE = {
  horizontal_push: {
    main: 'הדחיפה האופקית של היום — כאן החזה מקבל את הסטים הטריים.',
    secondary: 'זווית שנייה לחזה, אחרי שהתרגיל הראשי כבר עשה את העבודה הכבדה.',
    accessory: 'השלמה לחזה בטווח נוח, בלי להוסיף עומס על הכתף.',
  },
  vertical_push: {
    main: 'הדחיפה מעל הראש — כתפיים חזקות ושכמות שיודעות לייצב.',
    secondary: 'עוד עבודה מעל הראש בעומס קל יותר, לשמור על טווח בריא בכתף.',
    accessory: 'עבודת כתפיים משלימה בסוף האימון.',
  },
  horizontal_pull: {
    main: 'המשיכה האופקית מאזנת את כל הדחיפות ובונה עובי לגב.',
    secondary: 'משיכה שנייה בזווית אחרת — הגב גדול, הוא צריך יותר מכיוון אחד.',
    accessory: 'משיכה קלה לסגירת האימון ולשמירה על יציבה.',
  },
  vertical_pull: {
    main: 'המשיכה האנכית בונה את רוחב הגב — התרגיל הכי חשוב ביום הזה.',
    secondary: 'זווית משיכה נוספת מלמעלה, בעומס שמאפשר טכניקה נקייה.',
    accessory: 'עבודת רחבים משלימה אחרי המשיכות הכבדות.',
  },
  squat: {
    main: 'כפיפת הברכיים של היום — התרגיל שנותן את רוב הגירוי לרגליים.',
    secondary: 'עוד עבודה על ארבע ראשי אחרי התרגיל הכבד.',
    accessory: 'השלמה לארבע ראשי בעומס מבוקר.',
  },
  hinge: {
    main: 'ציר הירכיים: ירך אחורית, ישבן וגב תחתון — הצד האחורי של הגוף.',
    secondary: 'עוד עבודה על השרשרת האחורית, בטווח קצר ובטוח יותר.',
    accessory: 'בידוד לירך האחורית שמאזן את עבודת הארבע ראשי.',
  },
  lunge: {
    main: 'עבודה חד־צדדית — מגלה ומתקנת פערים בין הרגליים.',
    secondary: 'רגל אחת בכל פעם: איזון ויציבות ברך, לא רק כוח.',
    accessory: 'עבודה חד־צדדית קלה לסגירת הרגליים.',
  },
  core_flexion: { core: 'כיפוף גו מבוקר — הליבה מקצרת ומאריכה תחת שליטה.' },
  core_antiextension: { core: 'הליבה מתנגדת לקשת בגב. זה התפקיד האמיתי שלה בכל הרמה.' },
  core_rotation: { core: 'אלכסונים: מתנגדים לסיבוב במקום לרדוף אחריו.' },
  carry: { core: 'הליכה עם משקל — ליבה, אחיזה ויציבה, הכי קרוב לחיים האמיתיים.' },
  calf: { accessory: 'שוקיים עובדים בטווח מלא ומגיבים לתדירות יותר מאשר לעומס.' },
  arms_biceps: { accessory: 'עבודה ישירה ליד הקדמית, אחרי שהמשיכות כבר עשו את שלהן.' },
  arms_triceps: { accessory: 'יד אחורית ישירה — היא שני שליש מהיקף הזרוע.' },
  shoulders_lateral: { accessory: 'הכתף האמצעית לא מקבלת מספיק מהלחיצות. כאן היא מקבלת.' },
  shoulders_rear: { accessory: 'כתף אחורית ושכמות — מה ששומר על הכתף בריאה לאורך שנים.' },
  conditioning: { finisher: 'בלוק אירובי קצר בסוף — דופק גבוה בלי לפגוע בהתאוששות.' },
  plyo: { skill: 'עבודה נפיצה בתחילת האימון, כשמערכת העצבים טרייה. איכות לפני כמות.' },
  mobility: { core: 'ניידות — משפרת את הטווח שאתה יכול להתאמן בו.' },
};

const WARMUP_NOTE = {
  march_in_place: 'מעלה דופק וטמפרטורה — שריר חם מגיב טוב יותר לעומס.',
  jog: 'שתי דקות קלות כדי להעלות דופק לפני העבודה.',
  jumping_jack: 'מחמם את כל הגוף תוך פחות מדקה.',
  jump_rope: 'מעלה דופק ומעיר את הקרסוליים.',
  ankle_rocks: 'קרסול נוקשה מרים את העקב בסקוואט. זה הפתרון.',
  deep_squat_hold: 'ישיבה עמוקה פותחת ירך וקרסול לפני עבודת רגליים.',
  hip_circles: 'מזיז את מפרק הירך בכל הכיוונים לפני שמעמיסים עליו.',
  leg_swings_front: 'נדנוד רגל פותח את הירך בטווח שהסקוואט ידרוש.',
  leg_swings_side: 'מכין את המקרבים לפני עמידה רחבה.',
  hip_switch_90_90: 'סיבוב פנימי וחיצוני של הירך — בדיוק מה שהלאנג׳ צריך.',
  worlds_greatest_stretch: 'פותח ירך, גב עליון וקרסול בתנועה אחת.',
  toy_soldier: 'מותח ירך אחורית בתנועה, לא בהחזקה.',
  hip_hinge_drill: 'חוזרים על דפוס ציר הירכיים לפני שמוסיפים משקל.',
  glute_bridge_activation: 'מעיר את הישבן כדי שהוא יעבוד לפני הגב התחתון.',
  cat_cow: 'מזיז את עמוד השדרה חוליה חוליה לפני עומס.',
  scap_pushup: 'מכין את השכמות לדחיפות.',
  shoulder_circles: 'סיבובי כתף מלאים לפני עבודה מעל הראש.',
  arm_circles: 'מעלה טמפרטורה במפרק הכתף.',
  wrist_prep: 'שורש כף היד נושא משקל בשכיבות — מכינים אותו קודם.',
  band_dislocates: 'פותח את חגורת הכתפיים לטווח מלא מעל הראש.',
  wall_slide: 'מלמד את השכמה לזוז נכון מתחת ליד המורמת.',
  band_pull_apart: 'מפעיל את הכתף האחורית לפני משיכות.',
  prone_ytw_raise: 'מעיר את מייצבי השכמה — הם שומרים על הכתף בכל שאר האימון.',
  wall_angel: 'פותח גב עליון וכתפיים אחרי יום של ישיבה.',
  thoracic_rotation: 'סיבוב גב עליון — משחרר את מה שנתקע מישיבה.',
  scap_pull: 'תלייה ומשיכת שכמות — הצעד הראשון של כל מתח.',
  band_scap_pulldown: 'מפעיל רחבים לפני המשיכות.',
  prone_lat_pull_slide: 'מעיר את הרחבים לפני שמושכים בעומס.',
  childs_pose_reach: 'מותח רחבים וגב עליון.',
  passive_bar_hang: 'תלייה פותחת את הכתף ואת האחיזה.',
  dead_bug: 'מפעיל ליבה בלי לקשת את הגב.',
  bird_dog: 'מייצב אגן וגב לפני שמעמיסים עליהם.',
  torso_twist_standing: 'מחמם את האלכסונים לפני עבודת סיבוב.',
  tibialis_raise: 'מעיר את החלק הקדמי של השוק לפני ריצה או קפיצות.',
  quadruped_scap_pushup: 'שליטה בשכמה על ארבע — בסיס לכל דחיפה.',
  hip_flexor_stretch_kneeling: 'פותח את קדמת הירך אחרי ישיבה ארוכה.',
  pogo_hop: 'מכין את הגיד והקרסול לעבודה נפיצה.',
};

/** Warm-up drills that serve each pattern, best first. */
const WARMUP_FOR = {
  squat: ['ankle_rocks', 'deep_squat_hold', 'hip_circles', 'leg_swings_side'],
  lunge: ['leg_swings_front', 'hip_switch_90_90', 'worlds_greatest_stretch', 'hip_circles'],
  hinge: ['hip_hinge_drill', 'glute_bridge_activation', 'toy_soldier', 'cat_cow'],
  plyo: ['pogo_hop', 'ankle_rocks', 'leg_swings_front'],
  calf: ['ankle_rocks', 'tibialis_raise'],
  horizontal_push: ['scap_pushup', 'shoulder_circles', 'wrist_prep', 'band_dislocates'],
  vertical_push: ['wall_slide', 'shoulder_circles', 'band_dislocates', 'wrist_prep'],
  horizontal_pull: ['prone_ytw_raise', 'band_pull_apart', 'thoracic_rotation', 'wall_angel'],
  vertical_pull: ['scap_pull', 'band_scap_pulldown', 'prone_lat_pull_slide', 'passive_bar_hang'],
  shoulders_lateral: ['arm_circles', 'band_dislocates'],
  shoulders_rear: ['wall_angel', 'band_pull_apart'],
  arms_biceps: ['wrist_prep'], arms_triceps: ['wrist_prep'],
  core_flexion: ['dead_bug', 'cat_cow'],
  core_antiextension: ['dead_bug', 'bird_dog'],
  core_rotation: ['torso_twist_standing', 'thoracic_rotation'],
  carry: ['wrist_prep', 'quadruped_scap_pushup'],
  conditioning: ['march_in_place'],
};

/*
 * The pulse raiser, gentlest last.
 *
 * It used to run the other way, and march_in_place carries no
 * contraindications — so it was always available, always chosen, and every
 * trainee from 12 to 90 opened with marching on the spot. That is not caution,
 * it is a warm-up that does not warm anybody up: a fifteen-year-old about to
 * train needs their heart rate somewhere, and marching does not take it there.
 *
 * Ordered hardest first now, and easesImpact removes the top of the list for
 * whoever should not be landing, so the same walk down the list produces a real
 * pulse raiser for a trainee who can jump and marching for one who should not.
 */
const WARMUP_LEAD = ['jumping_jack', 'jog', 'high_knees', 'march_in_place'];
/*
 * Ordered by preference, and long enough that filtering can bite.
 *
 * The first three are the ones worth doing and they are also the three that a
 * knee, hip or shoulder rules out — a deep squat is full knee flexion, kneeling
 * puts bodyweight on the front of the knee, and child's pose is both deep knee
 * flexion and end-range shoulder overhead. Until those carried
 * contraindications the filter had nothing to remove and every trainee got the
 * identical four lines; now that they do, the list needs somewhere to fall back
 * to or a guarded knee ends the session with one stretch and a breath.
 */
const COOLDOWN_IDS = [
  'childs_pose_reach', 'hip_flexor_stretch_kneeling', 'deep_squat_hold',
  'cat_cow', 'hip_switch_90_90', 'thoracic_rotation', 'glute_bridge_activation',
  'torso_twist_standing', 'shoulder_circles',
];

/*
 * Standing drills to fall back on when a warm-up came out entirely floor-based.
 * Ordered so the first one moves something general — hips and shoulders — rather
 * than adding a third variation on whatever the day already trains.
 */
const STANDING_FALLBACK = [
  'hip_circles', 'shoulder_circles', 'torso_twist_standing', 'ankle_rocks',
  'arm_circles', 'march_in_place', 'sit_to_stand',
];

const DEFAULT_DAYS = {
  2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function numOr(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clampInt(v, lo, hi, d) {
  return Math.max(lo, Math.min(hi, Math.round(numOr(v, d))));
}

function goalOf(profile) {
  return SCHEME[profile.goal] ? profile.goal : 'fitness';
}

function experienceOf(profile) {
  const e = profile.experience;
  return (e === 'beginner' || e === 'returning' || e === 'intermediate' || e === 'advanced')
    ? e : 'beginner';
}

/** Stable per-slot seed. Same profile + same salt -> same number, always. */
function seedOf(hash, salt) {
  let x = hash >>> 0;
  for (let i = 0; i < salt.length; i++) {
    x ^= salt.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return (x ^ (x >>> 13)) >>> 0;
}

/** n integers in [2,5] summing to total, biggest first (the main lift). */
function distributeSets(total, n) {
  const out = new Array(n).fill(2);
  let left = Math.max(0, Math.round(total) - 2 * n);
  let i = 0;
  let guard = 0;
  while (left > 0 && guard < 200) {
    if (out[i] < 5) { out[i] += 1; left -= 1; }
    i = (i + 1) % n;
    guard += 1;
    if (out.every((v) => v >= 5)) break;
  }
  return out;
}

function restText(sec) {
  return REST_HE[sec] || (sec >= 120 ? `${Math.round(sec / 60)} דק׳` : `${sec} שנ׳`);
}

/** Shift a 'a–b' rep range by delta, never below 3. */
function shiftReps(range, delta) {
  const m = String(range).split('–');
  if (m.length !== 2) return range;
  const lo = Math.max(3, parseInt(m[0], 10) + delta);
  const hi = Math.max(lo + 2, parseInt(m[1], 10) + delta);
  return `${lo}–${hi}`;
}

function todayIso(d) {
  const t = d || new Date();
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${t.getFullYear()}-${mm}-${dd}`;
}

function weeksUntil(targetDate, from) {
  const t = Date.parse(`${targetDate}T00:00:00`);
  if (!Number.isFinite(t)) return 12;
  const diff = (t - from.getTime()) / (7 * 24 * 3600 * 1000);
  return clampInt(Math.ceil(diff), 4, 24, 12);
}

/* ------------------------------------------------------------------ *
 * 1. Slot layout
 * ------------------------------------------------------------------ */

function layout(profile, vol, budget, split) {
  const goal = goalOf(profile);
  const perSlot = SETS_PER_SLOT[goal];
  const days = split.days.map((d) => ({ def: d, picks: [] }));

  const patternsOfGroup = (d, group) => d.def.patterns.filter((pat) => PATTERN_GROUP[pat] === group);

  /*
   * Every pattern the app knows for a group, not just the ones this day's split
   * happened to name. A split lists one pull pattern for a given day, so when
   * the pull group earned two slots there the second one had nowhere to go and
   * took the same pattern again — and a pull day could ship a pull-up, a
   * wide-grip pull-up and a chin-up as three separate exercises. Widening to
   * the group's siblings turns that into a vertical pull AND a horizontal pull,
   * which is what the second slot was for. Still inside the group, so a pull
   * slot can never become a squat.
   */
  const groupVocabulary = {};
  for (const pat of Object.keys(PATTERN_GROUP)) {
    const g = PATTERN_GROUP[pat];
    (groupVocabulary[g] = groupVocabulary[g] || []).push(pat);
  }
  const priority = GROUP_PRIORITY[goal] || GROUP_PRIORITY.fitness;

  for (const group of priority) {
    const target = numOr(vol[group], 0);
    if (target < 2) continue;

    let eligible = days.filter((d) => patternsOfGroup(d, group).length > 0);
    let fallbackPattern = null;
    if (!eligible.length) {
      // The split never asked for this group but the week paid for it — put it
      // on the emptiest day rather than silently losing the sets.
      eligible = days.slice().sort((a, b) => a.picks.length - b.picks.length).slice(0, 1);
      fallbackPattern = GROUP_PATTERN[group];
    }

    const mostSlots = Math.max(1, Math.floor(target / 2));   // >= 2 sets each
    const leastSlots = Math.max(1, Math.ceil(target / 5));   // <= 5 sets each
    let want = clampInt(target / perSlot, leastSlots, mostSlots, 1);
    // A group the split trains on several days should show up on all of them.
    want = Math.max(want, Math.min(eligible.length, mostSlots));
    want = Math.min(want, 8);

    for (let k = 0; k < want; k++) {
      const open = eligible.filter((d) => d.picks.length < budget.maxSlots);
      if (!open.length) break;
      open.sort((a, b) => {
        const ga = a.picks.filter((s) => s.group === group).length;
        const gb = b.picks.filter((s) => s.group === group).length;
        if (ga !== gb) return ga - gb;
        if (a.picks.length !== b.picks.length) return a.picks.length - b.picks.length;
        const ea = a.def.emphasis.indexOf(group) < 0 ? 9 : a.def.emphasis.indexOf(group);
        const eb = b.def.emphasis.indexOf(group) < 0 ? 9 : b.def.emphasis.indexOf(group);
        if (ea !== eb) return ea - eb;
        return days.indexOf(a) - days.indexOf(b);
      });
      const d = open[0];
      const pats = fallbackPattern ? [fallbackPattern] : patternsOfGroup(d, group);
      const taken = d.picks.filter((s) => s.group === group).length;

      // Exhaust the day's own patterns first, then the group's other patterns
      // that this day has not used, and only then repeat. Repeating is still
      // the last resort rather than an error: two sets of pull-ups beats a
      // pull day with one exercise on it.
      let pattern = pats[taken % pats.length];
      if (taken >= pats.length && !fallbackPattern) {
        const unused = (groupVocabulary[group] || [])
          .filter((pat) => !d.picks.some((s) => s.pattern === pat));
        if (unused.length) pattern = unused[0];
      }

      // A widened pattern is not in the day's list, so indexOf gives -1 and it
      // would sort ahead of the warm-up. Sit it next to the sibling it joins.
      let order = d.def.patterns.indexOf(pattern);
      if (order < 0) {
        const sibling = pats.length ? d.def.patterns.indexOf(pats[0]) : -1;
        order = sibling >= 0 ? sibling + 0.5 : 98;
      }

      d.picks.push({
        group,
        pattern,
        occurrence: d.picks.filter((s) => s.pattern === pattern).length,
        order: fallbackPattern ? 99 : order,
        seq: taken,
      });
    }
  }

  // Training order inside the session: the split's pattern order, and repeats of
  // one pattern stay next to each other.
  for (const d of days) {
    d.picks.sort((a, b) => a.order - b.order || a.occurrence - b.occurrence);
  }

  // A session with one or two exercises is not a session. When the week's
  // volume is small — short slots on a busy schedule — spread the same sets
  // over more movements instead of piling them onto two. distributeSets below
  // then thins the sets automatically, so total weekly volume is unchanged.
  const slotFloor = Math.min(4, budget.maxSlots);
  for (const d of days) {
    if (d.picks.length >= slotFloor) continue;
    let pats = d.def.patterns.filter((pat) => numOr(vol[PATTERN_GROUP[pat]], 0) >= 2);
    if (!pats.length) pats = d.def.patterns.slice();
    let guard = 0;
    while (d.picks.length < slotFloor && d.picks.length < budget.maxSlots && pats.length && guard++ < 12) {
      const unused = pats.filter((pat) => !d.picks.some((s) => s.pattern === pat));
      const pattern = unused.length ? unused[0] : pats[d.picks.length % pats.length];
      d.picks.push({
        group: PATTERN_GROUP[pattern] || 'core',
        pattern,
        occurrence: d.picks.filter((s) => s.pattern === pattern).length,
        order: d.def.patterns.indexOf(pattern),
        seq: d.picks.length,
      });
    }
    d.picks.sort((a, b) => a.order - b.order || a.occurrence - b.occurrence);
  }

  // Sets per slot: the group's weekly total, spread over the slots it earned,
  // first occurrences (the heavy ones) getting the bigger share.
  const byGroup = new Map();
  for (const d of days) {
    for (const s of d.picks) {
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group).push({ day: d, slot: s });
    }
  }
  for (const [group, entries] of byGroup) {
    entries.sort((a, b) => a.slot.occurrence - b.slot.occurrence
      || days.indexOf(a.day) - days.indexOf(b.day));
    const sets = distributeSets(numOr(vol[group], entries.length * 3), entries.length);
    entries.forEach((e, i) => { e.slot.sets = sets[i]; });
  }

  return days;
}

/* ------------------------------------------------------------------ *
 * 2. Filling a slot
 * ------------------------------------------------------------------ */

function roleFor(pattern, compoundIndex) {
  if (pattern === 'conditioning') return 'finisher';
  if (pattern === 'plyo') return 'skill';
  if (PATTERN_GROUP[pattern] === 'core') return 'core';
  if (COMPOUND_PATTERNS.indexOf(pattern) < 0) return 'accessory';
  return compoundIndex < 2 ? 'main' : 'secondary';
}

function desiredLevel(profile, role) {
  const base = { beginner: 1.7, returning: 2.4, intermediate: 3.2, advanced: 4.2 }[experienceOf(profile)];
  const byRole = { skill: 0.5, main: 0.3, secondary: 0, accessory: -0.3, core: 0, finisher: -0.3 }[role] || 0;
  const age = clampInt(profile.age, MIN_AGE, MAX_AGE, 30);
  const injuries = (profile.injuries || []).length;
  let out = base + byRole;
  if (age >= 60) out -= 0.7;
  else if (age >= 50) out -= 0.4;
  if (age < 15) out -= 0.4;
  if (injuries >= 3) out -= 0.7;
  else if (injuries >= 1) out -= 0.3;
  return Math.max(1, out);
}

function isIsolation(ex) {
  return (ex.tags || []).indexOf('isolation') >= 0;
}

/** Same job = same pattern, same primary muscle, and same kind of work. */
function sameJob(a, b) {
  if (isIsolation(a) !== isIsolation(b)) return false;
  const pa = a.muscles.primary || [];
  const pb = b.muscles.primary || [];
  return pa.some((m) => pb.indexOf(m) >= 0);
}


/* When a pattern's pool is exhausted because everything in it is already a
   primary in this session, borrow from the nearest related pattern rather than
   dropping the slot. A second pressing movement beats an empty gap. */
const SIBLING_PATTERNS = {
  horizontal_push: ['vertical_push', 'arms_triceps'],
  vertical_push: ['horizontal_push', 'shoulders_lateral', 'arms_triceps'],
  horizontal_pull: ['vertical_pull', 'shoulders_rear', 'arms_biceps'],
  vertical_pull: ['horizontal_pull', 'arms_biceps'],
  squat: ['lunge', 'hinge'],
  hinge: ['squat', 'lunge'],
  lunge: ['squat', 'hinge'],
  calf: ['plyo', 'lunge'],
  plyo: ['conditioning', 'squat'],
  arms_biceps: ['horizontal_pull', 'vertical_pull'],
  arms_triceps: ['horizontal_push', 'vertical_push'],
  shoulders_lateral: ['vertical_push', 'shoulders_rear'],
  shoulders_rear: ['horizontal_pull', 'shoulders_lateral'],
  core_flexion: ['core_antiextension', 'core_rotation'],
  core_antiextension: ['core_flexion', 'core_rotation'],
  core_rotation: ['core_antiextension', 'core_flexion'],
  carry: ['core_antiextension', 'conditioning'],
  conditioning: ['plyo', 'carry'],
  mobility: ['core_antiextension'],
};

const isWarmup = (e) => (e.tags || []).indexOf('warmup') >= 0;

/*
 * A working slot is not a warm-up slot, and a main lift is not an isolation.
 *
 * Both used to be soft penalties on the anchor score, which meant both were
 * routinely overruled: every warm-up drill is level 1, so it sorted to the front
 * of the level-ordered family and got prescribed as a working set with sets,
 * reps and rest beside real exercises. And nothing at all stopped a cable fly
 * being chosen as the opening lift of a strength day, at 3-6 reps and three
 * minutes rest — a near-maximal load at end-range abduction, the most injurious
 * thing this generator could print.
 *
 * They are hard filters now. Each relaxes only if it would otherwise leave the
 * pattern with nothing, because an empty slot is worse than an imperfect one —
 * and the caller re-roles the slot when the compound filter has to give way, so
 * an isolation never inherits a main lift's rep range.
 */
function restrictPool(pool, role) {
  const working = pool.filter((e) => !isWarmup(e));
  // No working movement covers this pattern for this user — a bar-less home
  // trainee has almost no vertical pull. Taking the drill beats an empty slot,
  // but it must be labelled: the user should not read a lat-pull slide as their
  // pulling work without being told that is what happened.
  const onlyWarmups = !working.length;
  let out = working.length ? working : pool;
  if (role === 'main' || role === 'secondary') {
    const compound = out.filter((e) => !isIsolation(e));
    if (compound.length) return { pool: compound, demoted: false, onlyWarmups };
    // Nothing compound covers this pattern for this user. Take the isolation,
    // but tell the caller so the prescription is written for what it is.
    return { pool: out, demoted: true, onlyWarmups };
  }
  return { pool: out, demoted: false, onlyWarmups };
}

function poolFor(profile, pattern, primaryInDay, role) {
  const tried = [pattern].concat(SIBLING_PATTERNS[pattern] || []);
  for (const pat of tried) {
    const res = candidatesOrFallback(profile, { pattern: pat });
    const pool = res.list.filter((e) => !primaryInDay.has(e.id));
    if (!pool.length) continue;
    const restricted = restrictPool(pool, role);
    if (restricted.pool.length) {
      return { pool: restricted.pool, risky: res.risky, demoted: restricted.demoted, thin: restricted.onlyWarmups };
    }
  }
  return { pool: [], risky: false, demoted: false, thin: false };
}

function pickFamily(profile, slot, ctx) {
  // Anything already shown as a slot's primary in this session is excluded
  // outright — two cards with the same exercise is the most visible defect the
  // generator can produce. Exercises merely offered as a swap alternative
  // elsewhere are only penalised below, so the pool does not starve.
  const res = poolFor(profile, slot.pattern, ctx.primaryInDay, slot.role);
  const pool = res.pool;
  if (!pool.length) return { family: [], risky: false, demoted: false, thin: false };

  if (res.risky) {
    // Nothing clean exists for this pattern: take the gentlest options only.
    const gentle = pool.slice().sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
    return { family: gentle.slice(0, Math.min(3, gentle.length)), risky: true, demoted: res.demoted, thin: res.thin };
  }

  const want = desiredLevel(profile, slot.role);
  const seed = seedOf(ctx.hash, `${ctx.dayId}:${slot.pattern}:${slot.occurrence}`);
  const spun = rotate(pool, seed);

  let anchor = spun[0];
  let best = Infinity;
  for (const e of spun) {
    const score = Math.abs(e.level - want) * 2
      + (ctx.usedInDay.has(e.id) ? 3.0 : 0)
      + (ctx.usedInProgram.has(e.id) ? 1.6 : 0)
      + (isWarmup(e) && slot.role !== 'core' ? 1.2 : 0);
    if (score < best) { best = score; anchor = e; }
  }

  let family = pool.filter((e) => sameJob(e, anchor));
  if (family.length < 2) family = pool.slice();
  family.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));

  const size = Math.min(family.length, family.length >= 4 && slot.role === 'main' ? 4 : 3);
  const at = Math.max(0, family.findIndex((e) => e.id === anchor.id));
  const start = Math.max(0, Math.min(at - 1, family.length - size));
  const window = family.slice(start, start + size);

  /*
   * THE ANCHOR LEADS.
   *
   * The window is chosen to bracket the anchor, and it was then handed over
   * still sorted easy-to-hard — so generateProgram's family[0], the card the
   * user actually reads, and the default swap index all took the EASIEST
   * movement in the window instead of the one that was selected. Measured over
   * 84,096 slots, the prescribed exercise was harder than the anchor exactly
   * zero times; an advanced lifter with a full gym was handed goblet squats and
   * an assisted pull-up machine as his heavy work. Every input to desiredLevel —
   * experience, age, injury, role — was computed and then discarded.
   *
   * Putting the anchor first fixes it at the source: family[0] is now what the
   * engine chose, and the alternates read as easier and harder versions of the
   * plan rather than as the plan itself.
   */
  const ordered = [anchor].concat(window.filter((e) => e.id !== anchor.id));
  return { family: ordered, risky: false, demoted: res.demoted, thin: res.thin };
}

/* ------------------------------------------------------------------ *
 * 3. Prescription
 * ------------------------------------------------------------------ */

function holdSeconds(ex, role, goal) {
  if (ex.pattern === 'conditioning') return goal === 'fatloss' ? '40 שנ׳' : '30–45 שנ׳';
  if (ex.id === 'wall_sit') return '30–60 שנ׳';
  if (ex.id === 'dead_hang' || ex.id === 'passive_bar_hang') return '20–40 שנ׳';
  if (role === 'core' || PATTERN_GROUP[ex.pattern] === 'core') {
    return ex.level >= 3 ? '20–30 שנ׳' : '30–45 שנ׳';
  }
  return '30 שנ׳';
}

function distanceText(ex) {
  if (ex.pattern === 'plyo') return '4–6 קפיצות';
  if (ex.pattern === 'conditioning') return '20 מ׳ הלוך־חזור';
  return '20–30 מ׳';
}

function tempoFor(profile, ex, role) {
  if (TEMPO_BY_ID[ex.id]) return TEMPO_BY_ID[ex.id];
  // Calisthenics with no way to add weight: slowing the lowering IS the load.
  const owned = profile.equipment || [];
  const loadable = ['dumbbells', 'barbell', 'kettlebell', 'machines', 'cable'];
  const canLoad = loadable.some((q) => owned.indexOf(q) >= 0);
  const goal = goalOf(profile);
  if (!canLoad && role === 'main' && ex.unit === 'reps' && ex.level <= 3
    && (goal === 'muscle' || goal === 'strength')) return '3–1–1';
  return null;
}

function prescribe(profile, ex, slot) {
  const goal = goalOf(profile);
  const table = SCHEME[goal][slot.role] || SCHEME[goal].main;
  let reps = table[0];
  let restSec = table[1];
  let workSec = 40;

  if (ex.pattern === 'plyo') {
    reps = goal === 'fatloss' ? '8–10' : '3–5';
    restSec = goal === 'fatloss' ? 60 : 90;
    workSec = 20;
  } else if (ex.unit === 'time') {
    reps = holdSeconds(ex, slot.role, goal);
    workSec = parseInt(reps, 10) || 30;
    if (ex.pattern === 'conditioning') restSec = goal === 'fatloss' ? 20 : 30;
    else restSec = Math.min(restSec, 60);
  } else if (ex.unit === 'distance') {
    reps = distanceText(ex);
    workSec = 30;
    restSec = Math.min(restSec, 60);
  } else {
    if (ex.level >= 4) reps = shiftReps(reps, -2);
    else if (ex.level <= 1 && goal !== 'strength') reps = shiftReps(reps, 3);
    workSec = 40;
  }

  if (ex.unilateral) reps = `${reps} לכל צד`;

  return {
    reps,
    rest: restText(restSec),
    tempo: tempoFor(profile, ex, slot.role),
    restSec,
    workSec,
  };
}

/* ------------------------------------------------------------------ *
 * 4. The Hebrew line under the exercise
 * ------------------------------------------------------------------ */

function baseNote(profile, ex, slot) {
  if (NOTE_BY_ID[ex.id]) return NOTE_BY_ID[ex.id];
  const byPattern = PATTERN_NOTE[ex.pattern];
  if (byPattern) {
    const hit = byPattern[slot.role] || byPattern.main || byPattern.core
      || byPattern.accessory || byPattern.finisher || byPattern.skill;
    if (hit) return hit;
  }
  const muscle = MUSCLE_HE[(ex.muscles.primary || [])[0]] || 'הקבוצה הזאת';
  return `עבודה ישירה על ${muscle} — משלימה את מה שהתרגילים הגדולים לא סגרו.`;
}

function noteFor(profile, ex, slot, risky) {
  if (slot.thin) {
    return `⚠︎ עם הציוד שיש לך זה הכי קרוב לתנועה הזאת שאפשר — זה תרגיל הכנה, לא עבודה כבדה. `
      + 'מוט מתח או גומייה יפתחו כאן משהו אמיתי.';
  }
  const injuries = profile.injuries || [];
  const hits = (ex.contraindications || []).filter((c) => injuries.indexOf(c) >= 0);
  if (hits.length || (risky && conflictsInjury(profile, ex))) {
    const list = hits.length ? hits : (ex.contraindications || []).filter((c) => injuries.indexOf(c) >= 0);
    const he = (list[0] && INJURY_HE[list[0]]) || 'המגבלה שדיווחת עליה';
    return `⚠︎ אין חלופה נקייה לדפוס הזה עם הציוד שלך, אז זו הגרסה הקלה ביותר: עומס מינימלי, טווח בלי כאב, ועוצרים ברגע ש${he} מגיב.`;
  }

  let note = baseNote(profile, ex, slot);
  const age = clampInt(profile.age, MIN_AGE, MAX_AGE, 30);
  if (slot.role === 'main' && age < 16 && ex.level >= 3) {
    note = `${note} בגיל הזה טכניקה קודמת למשקל.`;
  } else if (ex.unilateral && slot.role !== 'core' && note.indexOf('לכל צד') < 0) {
    note = `${note} מתחילים בצד החלש וקובעים לפיו את החזרות.`;
  }
  return note;
}

/* ------------------------------------------------------------------ *
 * 5. Warm-up and cool-down
 * ------------------------------------------------------------------ */

function drillPrescription(ex) {
  if (ex.unit === 'time') return ex.unilateral ? '30 שנ׳ לכל צד' : '30–40 שנ׳';
  if (ex.unilateral) return '8 לכל צד';
  return ex.pattern === 'conditioning' ? '60–90 שנ׳' : '10 חזרות';
}

/*
 * How many drills the warm-up is worth to this trainee.
 *
 * The budget alone gave everybody the same answer, because it is derived from
 * session length and session length is what age already shortened — so an
 * 80-year-old got a shorter warm-up out of a shorter session, which is exactly
 * backwards. Warming up is the part of the session that gets *more* important
 * as recovery slows, and less important the younger the body is.
 */
function warmupDrillCount(profile, budget) {
  const base = clampInt(budget.warmupMin / 1.6, 4, 7, 5);
  if (warmsFast(profile)) return Math.max(3, base - 1);
  if (needsLongerWarmup(profile)) return Math.min(8, base + 2);
  return base;
}

function buildWarmup(profile, budget, split) {
  const allowed = new Map(candidates(profile, { tag: 'warmup' }).map((e) => [e.id, e]));

  /*
   * Age filters the vocabulary before anything is chosen from it, rather than
   * after — a drill removed at the end leaves a gap, a drill removed here means
   * the next one down the list takes its place.
   *
   * Impact and unsupported single-leg balance go at the same line because they
   * are the same demand: landing from a jumping jack and standing on one leg for
   * a straight-leg kick both ask a body to catch itself. The leg swings survive
   * this — their own cues put a hand on the wall, which is exactly what makes
   * them a different drill from the ones removed here.
   */
  if (easesImpact(profile)) {
    for (const id of Array.from(allowed.keys())) {
      if (asks(id, 'impact', 'balance')) allowed.delete(id);
    }
  }

  /*
   * A hang is full bodyweight through two hands. For a trainee who is not
   * already training it is close to the hardest thing they can do, and a warm-up
   * drill that is the hardest thing in the session is not a warm-up. Held to
   * beginners and returners on purpose: somebody at 68 who does pull-ups keeps
   * their scap pulls, because for them the premise is simply false.
   */
  const exp = experienceOf(profile);
  if (needsStandingOption(profile) && (exp === 'beginner' || exp === 'returning')) {
    for (const id of Array.from(allowed.keys())) if (asks(id, 'hang')) allowed.delete(id);
  }

  const items = [];
  const used = new Set();

  const push = (id) => {
    if (used.has(id)) return false;
    const ex = allowed.get(id);
    if (!ex) return false;
    used.add(id);
    items.push({
      id: ex.id,
      name: ex.name,
      prescription: drillPrescription(ex),
      note: WARMUP_NOTE[ex.id] || (ex.cues && ex.cues[0]) || '',
    });
    return true;
  };

  for (const id of WARMUP_LEAD) if (push(id)) break;

  // Patterns the week actually trains, most frequent first.
  const freq = new Map();
  for (const d of split.days) {
    for (const pat of d.patterns) freq.set(pat, (freq.get(pat) || 0) + 1);
  }
  const ordered = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map((e) => e[0]);

  const target = warmupDrillCount(profile, budget);
  for (let round = 0; round < 4 && items.length < target; round++) {
    for (const pat of ordered) {
      if (items.length >= target) break;
      const list = WARMUP_FOR[pat] || [];
      if (list[round]) push(list[round]);
    }
  }
  // Last resort: any mobility drill the profile can do.
  if (items.length < 3) {
    for (const ex of candidates(profile, { pattern: 'mobility' })) {
      if (items.length >= 4) break;
      push(ex.id);
    }
  }

  /*
   * At least one drill that is not done on the floor.
   *
   * Every drill here can be worth doing and the warm-up still be unusable: the
   * pattern lists lead with floor work for the pulling and core patterns, so a
   * trainee whose week is built on those could be handed five drills that all
   * begin with getting down. This adds a standing one rather than removing the
   * floor ones — the floor drills are the good ones, they just cannot be the
   * whole warm-up for somebody who finds the floor hard.
   */
  if (needsStandingOption(profile) && !items.some((it) => !asks(it.id, 'floor', 'deep_knee'))) {
    for (const id of STANDING_FALLBACK) if (push(id)) break;
  }
  return items;
}

function buildCooldown(profile) {
  const allowed = new Map(candidates(profile, { tag: 'warmup' }).map((e) => [e.id, e]));
  const hold = stretchHoldSeconds(profile);

  /*
   * The preference list opens with three floor stretches — child's pose, a
   * kneeling hip flexor, a deep squat — so the default cool-down asks somebody
   * to get down and up three times at the end of a session, when they are most
   * tired. Above the line, the standing and seated entries move to the front:
   * the same list, read in a different order, which keeps every stretch
   * available instead of shortening the session's ending to a breath.
   */
  const order = needsStandingOption(profile)
    ? COOLDOWN_IDS.slice().sort((a, b) => Number(asks(a, 'floor', 'deep_knee')) - Number(asks(b, 'floor', 'deep_knee')))
    : COOLDOWN_IDS;

  const out = [];
  for (const id of order) {
    if (out.length >= 3) break;
    const ex = allowed.get(id);
    if (!ex) continue;
    out.push({
      id: ex.id,
      name: ex.name,
      prescription: ex.unit === 'time'
        ? (ex.unilateral ? `${Math.round(hold * 0.75)} שנ׳ לכל צד` : `${hold} שנ׳`)
        : '8 חזרות איטיות',
      note: WARMUP_NOTE[ex.id] || (ex.cues && ex.cues[0]) || '',
    });
  }
  out.push({
    id: 'seated_breathing',
    name: 'נשימה עמוקה בישיבה',
    prescription: '2 דק׳',
    note: 'מוריד דופק ומסמן לגוף שהאימון נגמר. שם מתחילה ההתאוששות.',
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 6. Program-level notes
 * ------------------------------------------------------------------ */

function buildNotes(profile, ctx) {
  const out = [];
  const age = clampInt(profile.age, MIN_AGE, MAX_AGE, 30);
  const sleep = numOr(profile.sleepHours, 7.5);
  const stress = clampInt(profile.stress, 1, 5, 3);
  const injuries = profile.injuries || [];

  out.push('הסטים שרשומים הם סטים עובדים. סטי חימום על התרגיל הראשון לא נספרים בהם.');

  if (ctx.cautioned) {
    out.push('ליד תרגילים שמסומנים ב־⚠︎ לא הייתה חלופה נקייה לדפוס הזה. עבוד קל, בטווח ללא כאב, ואם כואב — דלג עליו לגמרי.');
  } else if (injuries.length) {
    out.push('כל תרגיל בתוכנית נבחר כך שלא יטען ישירות את המגבלות שדיווחת עליהן. כאב חד באימון הוא תמיד סיבה לעצור, לא להמשיך.');
  }
  if (age < 16) {
    out.push('מתחת לגיל 16 הדגש הוא על טכניקה, טווח מלא ומשקל גוף — לא על עומס. שווה שמאמן יראה את התנועות פעם אחת, ושרופא ידע שאתה מתאמן.');
  }
  if (age >= 55) {
    out.push('בגיל הזה החימום הוא לא המלצה. שתי דקות נוספות בהתחלה שוות יותר מכל סט נוסף בסוף.');
  }
  if (sleep < 7) {
    out.push(`${Math.round(sleep)} שעות שינה מגבילות את ההתקדמות יותר מכל משתנה אחר בתוכנית. חצי שעה נוספת שווה יותר מתוספת אימון.`);
  }
  if (stress >= 4) {
    out.push('בשבוע לחוץ במיוחד — הורד סט מכל תרגיל במקום לוותר על האימון. אימון קצר עדיף על ויתור.');
  }
  if (ctx.goal === 'fatloss') {
    out.push('הגירעון הקלורי מוריד את המשקל, האימון שומר על השריר בזמן שזה קורה. אל תנסה לפצות על אוכל בעוד אירובי.');
  }
  if (ctx.daysPerWeek <= 2) {
    out.push('שני אימונים בשבוע זה מינימום עובד. הליכה של 20–30 דק׳ בימי המנוחה משנה את התוצאה יותר מכל תרגיל שנוסיף.');
  }
  if (ctx.bodyweightOnly) {
    out.push('כשמשקל הגוף נהיה קל — עבור לחלופה הקשה יותר בכפתור ⇄, ולא לעוד 30 חזרות מאותו תרגיל.');
  }
  if (ctx.shortfall >= 12) {
    /*
     * These notes are program-level but they render inside whichever day is
     * open, so this one used to print the week's AVERAGE duration under a day
     * whose own header said something else — "planned to fit in about 65
     * minutes" beneath a heading reading 80. Quoting the real spread instead
     * means the sentence is true whichever day the reader is looking at, and it
     * matches the number already on screen above it.
     */
    const span = ctx.shortestDay === ctx.longestDay
      ? `${ctx.longestDay} דק׳`
      : `${ctx.shortestDay}–${ctx.longestDay} דק׳`;
    out.push(`האימונים מתוכננים להיכנס ב־${span} ולא ב־${ctx.minutesPerSession}. `
      + 'את ההפרש כדאי להוציא על סטי חימום בתרגיל הראשון ועל מנוחות מלאות — לא על עוד סטים.');
  }
  out.push('כפתור ⇄ מחליף תרגיל לחלופה שעושה את אותה עבודה. אם תרגיל לא מרגיש נכון — החלף אותו, אל תדחוף דרכו.');
  return out;
}

/* ------------------------------------------------------------------ *
 * 7. generateProgram
 * ------------------------------------------------------------------ */

/**
 * Turns a profile into a full Program. Pure and deterministic: same profile in,
 * byte-identical program out (apart from meta.generatedAt, which is today).
 */

/* ------------------------------------------------------------------ *
 * Partner training
 *
 * Training together at the same time is a structural change, not a label.
 * Both people share a station, so an exercise has to be safe for both and
 * pitched at whoever is less experienced — each then loads it for themselves.
 * ------------------------------------------------------------------ */

const EXPERIENCE_RANK = { beginner: 0, returning: 1, intermediate: 2, advanced: 3 };

function trainsTogether(p) {
  return p.withPartner === true && p.partnerMode === 'together';
}

/** Selection profile for a shared session: both injury lists, the lower ceiling. */
function partnerAdjusted(p) {
  if (!trainsTogether(p)) return p;
  const injuries = Array.from(new Set([].concat(p.injuries || [], p.partnerInjuries || []))).sort();
  const mine = EXPERIENCE_RANK[p.experience] === undefined ? 0 : EXPERIENCE_RANK[p.experience];
  const theirs = EXPERIENCE_RANK[p.partnerExperience] === undefined ? 0 : EXPERIENCE_RANK[p.partnerExperience];
  const lower = mine <= theirs ? p.experience : p.partnerExperience;
  return Object.assign({}, p, { injuries, experience: lower });
}

/* Movements where a second pair of hands genuinely changes what is possible —
   either the exercise is unsafe alone under load, or it simply cannot be done
   without a partner (someone has to hold the ankles for a nordic curl). */
function spotRole(ex) {
  const id = ex.id || '';
  if (/nordic|glute_ham|partner/.test(id)) return 'hold';
  if (/negative|assisted|eccentric/.test(id)) return 'assist';
  const eq = ex.equipment || [];
  const heavy = eq.indexOf('barbell') >= 0 || eq.indexOf('dumbbells') >= 0;
  if (!heavy) return null;
  if (ex.pattern === 'horizontal_push' && eq.indexOf('bench') >= 0) return 'spot';
  if (ex.pattern === 'squat' && eq.indexOf('barbell') >= 0) return 'spot';
  if (ex.pattern === 'vertical_push' && eq.indexOf('barbell') >= 0) return 'spot';
  return null;
}

/* Alternating sets only work when one partner's working time covers a useful
   share of the other's rest. Past roughly two minutes of prescribed rest it
   does not, and pretending otherwise would quietly cut their recovery. */
function alternatingFits(restSec, role) {
  if (role === 'finisher') return false;
  return restSec > 0 && restSec <= 120;
}

function partnerNote(ex, restSec, role, name) {
  const who = name ? name : 'השותף';
  const spot = spotRole(ex);
  if (spot === 'hold') return `${who} מחזיק את הקרסוליים — בלי זה אי אפשר לבצע את התרגיל.`;
  if (spot === 'assist') return `${who} נותן עזרה מינימלית רק כשהחזרה נתקעת.`;
  if (spot === 'spot') return `${who} שומר. יד מתחת למוט, בלי לגעת כל עוד החזרה נקייה.`;
  if (alternatingFits(restSec, role)) return `סט לסירוגין — אחד עובד, השני סופר. המנוחה שלך היא הסט שלו.`;
  return `מנוחה מלאה לשניכם. אל תקצרו אותה רק כי מישהו מחכה.`;
}

export function generateProgram(profile) {
  const input = profile || {};
  // Everything downstream selects and prescribes against the shared-session
  // profile, so a joint plan is automatically safe for both people.
  const p = partnerAdjusted(input);
  const goal = goalOf(p);
  const hash = hashProfile(p);
  const vol = weeklyVolume(p);
  const budget = sessionBudget(p);
  const split = splitFor(p);
  const daysPerWeek = split.days.length;
  const minutesPerSession = clampInt(p.minutesPerSession, 20, 120, 60);

  const laid = layout(p, vol, budget, split);
  const usedInProgram = new Set();
  let cautioned = false;
  let totalDuration = 0;

  const days = laid.map((entry, dayNo) => {
    const def = entry.def;
    const usedInDay = new Set();
    const primaryInDay = new Set();
    const slots = [];
    let compoundIndex = 0;
    let minutes = budget.warmupMin;

    for (const raw of entry.picks) {
      const slot = {
        pattern: raw.pattern,
        occurrence: raw.occurrence,
        sets: clampInt(raw.sets, 1, 6, 3),
        role: roleFor(raw.pattern, compoundIndex),
      };
      if (COMPOUND_PATTERNS.indexOf(raw.pattern) >= 0) compoundIndex += 1;

      const picked = pickFamily(p, slot, {
        hash, usedInDay, primaryInDay, usedInProgram, dayId: def.id,
      });
      if (!picked.family.length) continue;
      // Only an isolation was available for a compound slot. It gets accessory
      // reps and rest rather than a main lift's, because the rep range is the
      // dangerous half of the mistake.
      if (picked.demoted) slot.role = 'accessory';
      if (picked.thin) slot.thin = true;

      const variants = picked.family.map((ex) => {
        const rx = prescribe(p, ex, slot);
        const note = noteFor(p, ex, slot, picked.risky);
        if (note.charAt(0) === '⚠') cautioned = true;
        return {
          exId: ex.id,
          name: ex.name,
          nameEn: ex.nameEn,
          sets: slot.sets,
          reps: rx.reps,
          rest: rx.rest,
          tempo: rx.tempo,
          level: ex.level,
          unit: ex.unit,
          unilateral: !!ex.unilateral,
          note,
          anim: ex.anim,
          muscles: (ex.muscles.primary || []).slice(),
        };
      });

      primaryInDay.add(picked.family[0].id);
      for (const ex of picked.family) { usedInDay.add(ex.id); usedInProgram.add(ex.id); }

      const lead = prescribe(p, picked.family[0], slot);
      minutes += (slot.sets * (lead.workSec + lead.restSec)) / 60;

      const slotEntry = { key: `s${slots.length + 1}`, role: slot.role, variants };
      if (trainsTogether(input)) {
        const head = picked.family[0];
        slotEntry.partner = {
          alternating: alternatingFits(lead.restSec, slot.role),
          spot: spotRole(head),
          note: partnerNote(head, lead.restSec, slot.role, input.partnerName),
        };
      }
      slots.push(slotEntry);
    }

    // A session is never allowed to come out empty.
    if (!slots.length) {
      const rescue = candidatesOrFallback(p, { pattern: 'core_antiextension' });
      if (rescue.list.length) {
        const ex = rescue.list[0];
        const slot = { pattern: ex.pattern, occurrence: 0, sets: 3, role: 'core' };
        const rx = prescribe(p, ex, slot);
        slots.push({
          key: 's1',
          role: 'core',
          variants: [{
            exId: ex.id,
            name: ex.name,
            nameEn: ex.nameEn,
            sets: 3,
            reps: rx.reps,
            rest: rx.rest,
            tempo: rx.tempo,
            level: ex.level,
            unit: ex.unit,
            unilateral: !!ex.unilateral,
            note: noteFor(p, ex, slot, rescue.risky),
            anim: ex.anim,
            muscles: (ex.muscles.primary || []).slice(),
          }],
        });
        minutes += 3 * 1.5;
      }
    }

    const hasFinisher = slots.some((s) => s.role === 'finisher');
    if (!hasFinisher) minutes += Math.min(4, budget.finisherMin);
    const durationMin = clampInt(Math.round(minutes / 5) * 5, 15, minutesPerSession, 45);
    totalDuration += durationMin;

    return {
      id: def.id,
      dayIndex: trainingDayIndex(p, daysPerWeek, dayNo),
      title: def.title,
      focus: def.focus,
      durationMin,
      slots,
    };
  });

  const typicalDuration = Math.round(totalDuration / Math.max(1, days.length));
  const bodyweightOnly = !['dumbbells', 'barbell', 'kettlebell', 'machines', 'cable']
    .some((q) => (p.equipment || []).indexOf(q) >= 0);

  return {
    meta: {
      partner: input.withPartner ? {
        mode: input.partnerMode,
        name: input.partnerName || '',
        together: trainsTogether(input),
        note: trainsTogether(input)
          ? 'אתם עוברים את האימון כזוג — סט לסירוגין על אותה תחנה, ושמירה הדדית בתרגילים הכבדים. '
            + 'רמת הקושי נקבעה לפי המתחיל מביניכם, והעומס עצמו הוא עניין אישי: אותו תרגיל, לא אותו משקל.'
          : 'אותה תוכנית, אבל כל אחד בזמן שלו. אין תרגילים שדורשים שמירה או עזרה של שותף.',
      } : null,
      splitName: split.name,
      rationale: split.rationale,
      daysPerWeek,
      minutesPerSession,
      weeksTotal: weeksUntil(p.targetDate, new Date()),
      generatedAt: todayIso(),
    },
    volume: vol,
    warmup: buildWarmup(p, budget, split),
    cooldown: buildCooldown(p),
    days,
    notes: buildNotes(p, {
      goal,
      daysPerWeek,
      minutesPerSession,
      typicalDuration,
      shortestDay: days.reduce((n, d) => Math.min(n, d.durationMin), Infinity),
      longestDay: days.reduce((n, d) => Math.max(n, d.durationMin), 0),
      // Judged on the SHORTEST day, because that is the one that surprises
      // someone who set aside a fixed slot: a week of 85/55/70/40 against a
      // 90-minute ask needs saying, and averaging it away (or judging it on the
      // 85) hides exactly the day they would notice.
      shortfall: minutesPerSession - days.reduce((n, d) => Math.min(n, d.durationMin), Infinity),
      bodyweightOnly,
      cautioned,
    }),
  };
}

function trainingDayIndex(profile, daysPerWeek, dayNo) {
  const raw = Array.isArray(profile.trainingDays) ? profile.trainingDays : [];
  const clean = [];
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 6 && clean.indexOf(n) < 0) clean.push(n);
  }
  clean.sort((a, b) => a - b);
  const list = clean.length === daysPerWeek ? clean : (DEFAULT_DAYS[daysPerWeek] || DEFAULT_DAYS[3]);
  return list[dayNo % list.length];
}
