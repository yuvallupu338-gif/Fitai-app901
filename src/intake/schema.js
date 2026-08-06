/*
 * schema.js — the intake questionnaire.
 *
 * Declares the questions, their validation, and the profile shape everything
 * downstream consumes. The wizard in src/ui/wizard.js renders whatever is
 * declared here; adding a question needs no UI change.
 */

import { withholdsPhotoScan } from '../engine/age.js';

import { emphasisFrom, confidenceHe } from '../vision/apply.js';
import { candidates } from '../data/exercises.index.js';

const TODAY = () => new Date();

function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function plusMonths(n) {
  const d = TODAY();
  d.setMonth(d.getMonth() + n);
  return iso(d);
}

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

export function defaults() {
  return {
    name: '',
    age: null,
    sex: 'male',
    heightCm: null,
    weightKg: null,

    experience: 'beginner',

    goal: 'fitness',
    sport: null,
    targetDate: plusMonths(6),
    targetWeightKg: null,

    daysPerWeek: 3,
    minutesPerSession: 60,
    trainingDays: [0, 2, 4],
    timeOfDay: 'evening',

    track: 'mixed',
    location: 'home_bodyweight',
    gymMachines: true,
    // Deliberately empty: normalizeProfile fills it from the location when it
    // is, which is what makes a programmatically-built or imported profile
    // correct. Seeding it here instead made every non-default location inherit
    // the default's kit — a full gym came out with nothing but a mat.
    equipment: [],

    injuries: [],
    surgeries: '',
    medical: '',
    avoid: [],

    currentActivity: '',
    benchmarks: {
      pushups: null, pullups: null, plankSec: null,
      squatKg: null, benchKg: null, deadliftKg: null,
    },
    sleepHours: 7,
    stress: 3,

    wantsNutrition: true,
    mealsPerDay: 4,
    whoCooks: 'family',
    diet: [],
    allergies: '',
    supplements: '',

    commitment: 3,
    photoNow: '',
    photoTarget: '',
    // The photo read, once it has run. Null means it never ran — which is a
    // perfectly good state: everything downstream treats it as "no opinion".
    visionRead: null,
    // Per-group volume multipliers derived from visionRead. Kept on the profile
    // rather than recomputed in the engine so that a profile is a complete
    // description of the program it produces.
    emphasis: null,

    withPartner: false,
    partnerMode: 'together',
    partnerName: '',
    partnerExperience: 'beginner',
    partnerInjuries: [],
  };
}

/* ------------------------------------------------------------------ *
 * Option tables
 * ------------------------------------------------------------------ */

/*
 * This app trains one way: bodyweight. So the kit a place gives you is the kit
 * that matters to bodyweight work — bars, rings, a box to elevate on — and the
 * loaded equipment that used to be seeded here (dumbbells, barbell, machines,
 * a cable stack) is gone, because nothing in the programme would ever reach
 * for it.
 */
const EQUIPMENT_BY_LOCATION = {
  full_gym: ['pullup_bar', 'dip_bars', 'rings', 'bands', 'bench', 'box', 'mat',
    'jump_rope', 'treadmill', 'bike', 'rower'],
  building_gym: ['pullup_bar', 'bench', 'mat', 'treadmill', 'bike'],
  home_weights: ['pullup_bar', 'bands', 'mat'],
  home_bodyweight: ['mat'],
};

const EQUIPMENT_OPTIONS = [
  { value: 'pullup_bar', label: 'מוט מתח' },
  { value: 'dip_bars', label: 'מקבילים' },
  { value: 'rings', label: 'טבעות' },
  { value: 'bands', label: 'גומיות' },
  { value: 'bench', label: 'ספסל' },
  { value: 'box', label: 'קופסה / מדרגה' },
  { value: 'trx', label: 'TRX' },
  { value: 'jump_rope', label: 'חבל קפיצה' },
  { value: 'mat', label: 'מזרן' },
  { value: 'treadmill', label: 'הליכון' },
  { value: 'bike', label: 'אופניים' },
  { value: 'rower', label: 'מכונת חתירה' },
];

const INJURY_OPTIONS = [
  { value: 'lower_back', label: 'גב תחתון' },
  { value: 'upper_back', label: 'גב עליון' },
  { value: 'neck', label: 'צוואר' },
  { value: 'shoulder', label: 'כתף' },
  { value: 'elbow', label: 'מרפק' },
  { value: 'wrist', label: 'שורש כף היד' },
  { value: 'hip', label: 'ירך / מפרק ירך' },
  { value: 'knee', label: 'ברך' },
  { value: 'ankle', label: 'קרסול' },
  { value: 'hernia', label: 'בקע' },
  { value: 'heart', label: 'לב / לחץ דם' },
  { value: 'asthma', label: 'אסתמה' },
  { value: 'pregnancy', label: 'הריון' },
];

const DIET_OPTIONS = [
  { value: 'vegetarian', label: 'צמחוני' },
  { value: 'vegan', label: 'טבעוני' },
  { value: 'kosher', label: 'כשר' },
  { value: 'halal', label: 'חלאל' },
  { value: 'gluten_free', label: 'ללא גלוטן' },
  { value: 'lactose_free', label: 'ללא לקטוז' },
];

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

export const STEPS = [
  {
    id: 'basics',
    title: 'קצת עליך',
    subtitle: 'ארבעה מספרים. הם קובעים כמעט הכול — מהעומס ההתחלתי ועד לקצב שאפשר לצפות לו.',
    fields: [
      { key: 'name', label: 'איך לקרוא לך?', type: 'text', required: false, placeholder: 'לא חובה' },
      {
        key: 'age', label: 'גיל', type: 'number', unit: 'שנים', min: 10, max: 90,
        validate: (v) => {
          if (v === null || v === '') return 'צריך גיל כדי לבנות תוכנית בטוחה';
          if (v < 10 || v > 90) return 'הזן גיל בין 10 ל־90';
          return null;
        },
      },
      {
        key: 'sex', label: 'מין', type: 'choice',
        help: 'משפיע על חישוב הקלוריות בלבד.',
        options: [
          { value: 'male', label: 'זכר' },
          { value: 'female', label: 'נקבה' },
          { value: 'other', label: 'מעדיף/ה לא לציין' },
        ],
      },
      {
        key: 'heightCm', label: 'גובה', type: 'number', unit: 'ס״מ', min: 120, max: 220,
        validate: (v) => {
          if (v === null || v === '') return 'צריך גובה';
          if (v > 0 && v < 3) return 'נראה שהזנת מטרים. הזן בסנטימטרים, למשל 175';
          if (v < 120 || v > 220) return 'הזן גובה בסנטימטרים, בין 120 ל־220';
          return null;
        },
      },
      {
        key: 'weightKg', label: 'משקל', type: 'number', unit: 'ק״ג', min: 25, max: 250, step: 0.5,
        validate: (v) => {
          if (v === null || v === '') return 'צריך משקל';
          if (v < 25 || v > 250) return 'הזן משקל בין 25 ל־250 ק״ג';
          return null;
        },
      },
    ],
  },

  {
    id: 'experience',
    title: 'כמה זמן אתה מתאמן',
    subtitle: 'זה קובע כמה נפח הגוף שלך יכול לעכל, ובאיזו רמת קושי מתחילים.',
    fields: [
      {
        key: 'experience', label: 'הוותק שלך', type: 'choice',
        options: [
          { value: 'beginner', label: 'מתחיל', desc: 'אף פעם לא התאמנתי ברצף, או פחות מ־3 חודשים' },
          { value: 'returning', label: 'חוזר אחרי הפסקה', desc: 'התאמנתי בעבר, חזרתי עכשיו' },
          { value: 'intermediate', label: 'שנה+ ברצף', desc: 'מתאמן באופן קבוע לפחות שנה' },
          { value: 'advanced', label: 'ותיק', desc: '3 שנים ומעלה, מכיר את המספרים שלי' },
        ],
      },
    ],
  },

  {
    id: 'goal',
    title: 'מה המטרה',
    subtitle: 'מטרה אחת. אפשר לשנות בהמשך — אבל תוכנית שמנסה להשיג הכול בבת אחת לא משיגה כלום.',
    fields: [
      {
        key: 'goal', label: 'המטרה העיקרית', type: 'choice',
        options: [
          { value: 'fatloss', label: 'ירידה בשומן', desc: 'לשמור על שריר, להוריד שומן' },
          { value: 'muscle', label: 'עלייה במסה', desc: 'לבנות שריר וגודל' },
          { value: 'strength', label: 'כוח', desc: 'להרים יותר, פחות דגש על גודל' },
          { value: 'fitness', label: 'כושר כללי', desc: 'להרגיש טוב, לתפקד טוב' },
          { value: 'sport', label: 'ספורט ספציפי', desc: 'אימון תומך לענף שאני עושה' },
        ],
      },
      {
        key: 'sport', label: 'איזה ענף?', type: 'text', placeholder: 'כדורסל, ריצה, טניס…',
        showIf: (p) => p.goal === 'sport',
        validate: (v, p) => (p.goal === 'sport' && !String(v || '').trim() ? 'כתוב את הענף כדי שאתאים את האימון' : null),
      },
      {
        key: 'targetDate', label: 'לאיזה תאריך אתה מכוון?',
        help: 'תאריך אמיתי — תחרות, חתונה, סוף הקיץ. אם אין, השאר את ברירת המחדל.',
        type: 'date',
        validate: (v) => {
          if (!v) return 'בחר תאריך יעד';
          const d = new Date(v);
          if (isNaN(d)) return 'תאריך לא תקין';
          const weeks = (d - TODAY()) / (7 * 86400000);
          if (weeks < 0) return 'התאריך כבר עבר. בחר תאריך עתידי';
          if (weeks < 3) return 'פחות מ־3 שבועות זה קצר מדי לתוכנית. בחר תאריך רחוק יותר';
          if (weeks > 260) return 'יותר מ־5 שנים קדימה. בחר יעד קרוב יותר';
          return null;
        },
      },
      {
        key: 'targetWeightKg', label: 'משקל יעד', type: 'number', unit: 'ק״ג', required: false,
        min: 25, max: 250, step: 0.5,
        help: 'לא חובה. אם תזין, אבדוק אם היעד ריאלי בזמן שנתת — ואם לא, אציע לך גרסה שכן.',
        validate: (v, p) => {
          if (v === null || v === '') return null;
          if (v < 25 || v > 250) return 'הזן משקל בין 25 ל־250 ק״ג';
          if (p.weightKg && Math.abs(v - p.weightKg) > 40) {
            return 'הפער מהמשקל הנוכחי גדול מ־40 ק״ג. ודא שלא התבלבלת';
          }
          return null;
        },
      },
    ],
  },

  {
    id: 'vision',
    title: 'לאן אתה מכוון',
    /*
     * Under 18 all three photo fields are hidden, so this used to head an
     * otherwise ordinary question with a paragraph describing a photo scan that
     * was nowhere on the page — and the age limit was only ever explained later,
     * on a tab of the finished plan. Describe what is actually on screen, and
     * say why the rest is missing at the moment it goes missing.
     */
    subtitle: (p) => (withholdsPhotoScan(p)
      ? 'סריקת התמונות פתוחה מגיל 18, אז השלב הזה מסתכם בשאלה אחת. '
        + 'התוכנית נבנית לך במלואה בלי הסריקה — היא לא מוסיפה תרגילים ולא משנה את המסלול, '
        + 'רק מזיזה את החלוקה בין קבוצות השריר.'
      : 'שתי תמונות. אחת שלך היום, אחת של הגוף שאתה מכוון אליו — '
        + 'ומודל ראייה קורא את שתיהן, נותן רמת היגיון ליעד שלך, ומכוון את התוכנית לפער ביניהן.'),
    fields: [
      {
        key: 'commitment', label: 'כמה אתה מוכן להתמסר לתהליך', type: 'scale', min: 1, max: 5,
        help: 'זה הדבר שקובע את לוח הזמנים יותר מכל דבר אחר. 5 = מקפיד על האימונים, על האוכל ועל השינה גם כשלא בא לי. '
          + '3 = עושה את רוב האימונים ואוכל בסדר רוב הזמן. תענה כנה — יעד שמבוסס על שקר לא יקרה.',
        options: [{ label: 'כשמתאים לי' }, { label: 'בלי פשרות' }],
      },
      {
        key: 'photoNow', label: 'תמונה שלך היום', type: 'photo', required: false,
        // The scan is 18+, and asking a fifteen-year-old to photograph
        // themselves in tight clothing for a feature they cannot use is the
        // question that should never have been on screen.
        showIf: (p) => !withholdsPhotoScan(p),
        help: 'עמידה זקופה, מול המצלמה, בגדים צמודים או בגד ים. '
          + 'זו גם נקודת ההתחלה שלך — בעוד שלושה חודשים היא ההוכחה הכי טובה שמשהו קרה.',
      },
      {
        key: 'photoTarget', label: 'תמונה של הגוף שאתה מכוון אליו', type: 'photo', required: false,
        showIf: (p) => !withholdsPhotoScan(p),
        help: 'בדרך כלל זה מישהו אחר, וזה בסדר גמור. הפער בין שתי התמונות הוא בדיוק מה שנמדד.',
      },
      {
        key: 'visionRead', label: 'סריקת התמונות', type: 'scan', required: false,
        showIf: (p) => !withholdsPhotoScan(p) && !!p.photoNow && !!p.photoTarget,
      },
    ],
  },

  {
    id: 'availability',
    title: 'כמה זמן באמת יש לך',
    subtitle: 'התשובה הכי חשובה בשאלון. תוכנית שלא עומדים בה שווה אפס.',
    fields: [
      {
        key: 'daysPerWeek', label: 'כמה אימונים בשבוע', type: 'scale', min: 2, max: 6,
        help: 'לא כמה בא לך — כמה תעמוד בהם גם בשבוע עמוס. עדיף 3 שמתקיימים מ־5 על הנייר.',
        options: [{ label: '2 בשבוע' }, { label: '6 בשבוע' }],
      },
      {
        key: 'minutesPerSession', label: 'כמה דקות לאימון', type: 'choice',
        options: [
          { value: 30, label: '30 דקות', desc: 'קצר וממוקד' },
          { value: 45, label: '45 דקות' },
          { value: 60, label: '60 דקות', desc: 'הנפוץ ביותר' },
          { value: 75, label: '75 דקות' },
          { value: 90, label: '90 דקות', desc: 'כולל חימום ומנוחות מלאות' },
        ],
      },
      {
        key: 'trainingDays', label: 'באילו ימים', type: 'days',
        help: 'סמן את הימים שבהם תתאמן. אם לא בטוח — סמן כמספר האימונים שבחרת, אפשר לשנות אחר כך.',
        validate: (v, p) => {
          const n = Array.isArray(v) ? v.length : 0;
          if (!n) return 'בחר לפחות יום אחד';
          if (n < p.daysPerWeek) return `בחרת ${n} ימים אבל ${p.daysPerWeek} אימונים. סמן עוד ${p.daysPerWeek - n}`;
          return null;
        },
      },
      {
        key: 'timeOfDay', label: 'באיזו שעה בדרך כלל', type: 'choice',
        help: 'קובע את תזמון הארוחות סביב האימון.',
        options: [
          { value: 'morning', label: 'בוקר' },
          { value: 'noon', label: 'צהריים' },
          { value: 'evening', label: 'ערב' },
        ],
      },
    ],
  },

  {
    id: 'equipment',
    title: 'איפה אתה מתאמן',
    subtitle: 'אימון במשקל גוף. מוט מתח פותח הרבה, אבל גם בלי שום דבר יש תוכנית מלאה.',
    fields: [
      {
        key: 'location', label: 'המקום', type: 'choice',
        // Choosing a location refills the equipment list, so the checklist is
        // edited from a real baseline instead of starting empty.
        onSet: (p, value) => { p.equipment = (EQUIPMENT_BY_LOCATION[value] || []).slice(); },
        options: [
          { value: 'full_gym', label: 'חדר כושר או פארק כושר', desc: 'מוט מתח, מקבילים, אולי טבעות' },
          { value: 'building_gym', label: 'חדר כושר בבניין', desc: 'מוט מתח, ספסל, אולי הליכון' },
          { value: 'home_weights', label: 'בית עם מוט מתח', desc: 'מוט על המשקוף, אולי גומיות' },
          { value: 'home_bodyweight', label: 'בית בלי כלום', desc: 'רצפה וקיר. זה מספיק' },
        ],
      },
      {
        key: 'equipment', label: 'מה יש לך בפועל', type: 'chips',
        // A full gym has everything; asking is noise. Every other location
        // genuinely varies, so the checklist earns its place there.
        showIf: (p) => p.location !== 'full_gym',
        help: 'סימנתי מה שבדרך כלל יש במקום שבחרת. הוסף או הורד לפי המציאות.',
        // Same reason the machines question is gated: a calisthenics answer has
        // already excluded the cable stack, so offering it as a tick box asks
        // the user to answer a question they just answered.
        options: (p) => (p.track === 'calisthenics'
          ? EQUIPMENT_OPTIONS.filter((o) => o.value !== 'machines' && o.value !== 'cable')
          : EQUIPMENT_OPTIONS),
      },
    ],
  },

  {
    id: 'limits',
    title: 'מגבלות',
    subtitle: 'זה החלק שהופך תוכנית גנרית לתוכנית שלך. כל מה שתסמן פשוט לא יופיע.',
    fields: [
      {
        key: 'injuries', label: 'פציעות או כאבים כרוניים', type: 'chips',
        help: 'סמן כל אזור שכואב, נפצע, או שאתה נזהר בו. תרגילים שמעמיסים עליו לא ייכנסו לתוכנית.',
        /*
         * Pregnancy is dropped for someone who answered male two steps earlier.
         * Every other chip here is an injury anyone can have; this one is the
         * single option the questionnaire already knows cannot apply, and
         * offering it reads as the form not having listened.
         *
         * Only an explicit 'male' hides it — an unanswered or self-described sex
         * keeps the chip, because the cost of hiding it from someone who needs
         * it is far higher than the cost of showing it to someone who does not.
         */
        options: (p) => (p && p.sex === 'male'
          ? INJURY_OPTIONS.filter((o) => o.value !== 'pregnancy')
          : INJURY_OPTIONS),
      },
      {
        key: 'surgeries', label: 'ניתוחים', type: 'textarea', required: false,
        placeholder: 'למשל: ניתוח מניסקוס בברך שמאל, לפני שנתיים',
      },
      {
        key: 'medical', label: 'מצב רפואי או תרופות', type: 'textarea', required: false,
        placeholder: 'לא חובה. נשמר במכשיר שלך בלבד ולא נשלח לשום מקום.',
      },
      {
        key: 'avoid', label: 'תרגילים שאתה לא מסוגל או לא מוכן לעשות', type: 'chips',
        required: false,
        help: 'סמן מה שלא ייכנס לתוכנית בשום מקרה.',
        // Only offer refusals that could actually happen. Asking a calisthenics
        // trainee whether they refuse deadlifts, or someone with a bare floor
        // whether they refuse the bench press, is asking about a movement their
        // earlier answers already ruled out — the same not-listening the
        // machines question used to do, one step later.
        //
        // Derived rather than hand-gated, so it stays honest as the exercise
        // library grows: a chip survives only if some exercise this user could
        // actually be prescribed matches it.
        options: (p) => AVOID_OPTIONS.filter((o) => avoidableFor(p, o.value)),
      },
    ],
  },

  {
    id: 'current',
    title: 'איפה אתה עומד היום',
    subtitle: 'מספרים אם יש. אם אין — דלג, נמדוד בשבוע הראשון.',
    fields: [
      {
        key: 'currentActivity', label: 'מה אתה עושה היום', type: 'textarea', required: false,
        placeholder: 'למשל: הולך חצי שעה ביום, משחק כדורגל פעם בשבוע',
      },
      { key: 'bm_pushups', label: 'שכיבות סמיכה ברצף', type: 'number', unit: 'חזרות', required: false, min: 0, max: 200 },
      { key: 'bm_pullups', label: 'מתח ברצף', type: 'number', unit: 'חזרות', required: false, min: 0, max: 100 },
      { key: 'bm_plankSec', label: 'פלאנק', type: 'number', unit: 'שניות', required: false, min: 0, max: 600 },
      { key: 'bm_squatKg', label: 'סקוואט מקסימלי', type: 'number', unit: 'ק״ג', required: false, min: 0, max: 400 },
      { key: 'bm_benchKg', label: 'לחיצת חזה מקסימלית', type: 'number', unit: 'ק״ג', required: false, min: 0, max: 400 },
      { key: 'bm_deadliftKg', label: 'דדליפט מקסימלי', type: 'number', unit: 'ק״ג', required: false, min: 0, max: 500 },
      {
        key: 'sleepHours', label: 'כמה שעות שינה בממוצע', type: 'number', unit: 'שעות',
        min: 4, max: 12, step: 0.5,
        help: 'שינה היא החלק החזק ביותר בתוכנית. פחות מ־7 שעות — אוריד את הנפח בהתאם.',
        validate: (v) => {
          if (v === null || v === '') return 'הזן ממוצע, גם אם הוא לא מחמיא';
          if (v < 4 || v > 12) return 'הזן בין 4 ל־12 שעות';
          return null;
        },
      },
      {
        key: 'stress', label: 'רמת עומס יומיומי', type: 'scale', min: 1, max: 5,
        help: 'עבודה, לימודים, ילדים — כל מה שמוריד התאוששות.',
        options: [{ label: 'רגוע' }, { label: 'שרוף' }],
      },
    ],
  },

  {
    id: 'partner',
    title: 'מתאמנים לבד או ביחד',
    subtitle: 'זה משנה את מבנה האימון לגמרי, לא רק את האווירה. אימון בזוג מאפשר סטים לסירוגין ושמירה הדדית.',
    fields: [
      {
        key: 'withPartner', label: 'יש מישהו שמתאמן איתך?', type: 'choice',
        options: [
          { value: false, label: 'מתאמן לבד' },
          { value: true, label: 'יש שותף לאימון' },
        ],
      },
      {
        key: 'partnerMode', label: 'איך זה עובד בפועל?', type: 'choice',
        showIf: (p) => p.withPartner,
        help: 'ביחד באותו זמן = סטים לסירוגין, אחד עובד והשני סופר ושומר. כל אחד לחוד = אותה תוכנית, זמנים שונים.',
        options: [
          {
            value: 'together', label: 'ביחד, באותו זמן',
            desc: 'עוברים את האימון כזוג — סט לסירוגין, שמירה הדדית, אותה תחנה',
          },
          {
            value: 'separate', label: 'כל אחד לחוד',
            desc: 'אותה תוכנית אבל לא באותו זמן — בלי שמירה ובלי תלות',
          },
        ],
      },
      {
        key: 'partnerName', label: 'איך קוראים לו?', type: 'text', required: false,
        showIf: (p) => p.withPartner, placeholder: 'לא חובה',
      },
      {
        key: 'partnerExperience', label: 'הוותק שלו', type: 'choice',
        showIf: (p) => p.withPartner && p.partnerMode === 'together',
        help: 'כשמתאמנים על אותה תחנה, רמת הקושי נקבעת לפי המתחיל מביניכם — ואז כל אחד מכוון את העומס לעצמו.',
        options: [
          { value: 'beginner', label: 'מתחיל' },
          { value: 'returning', label: 'חוזר אחרי הפסקה' },
          { value: 'intermediate', label: 'שנה+ ברצף' },
          { value: 'advanced', label: 'ותיק' },
        ],
      },
      {
        key: 'partnerInjuries', label: 'פציעות או מגבלות שלו', type: 'chips',
        showIf: (p) => p.withPartner && p.partnerMode === 'together',
        required: false,
        help: 'תרגיל שמעמיס על פציעה של אחד מכם לא ייכנס לאימון המשותף.',
        options: INJURY_OPTIONS,
      },
    ],
  },

  {
    id: 'nutrition',
    title: 'תזונה',
    subtitle: 'אופציונלי. אם תרצה, אבנה גם את הצד הזה — ארוחות, חלופות, ואיך לאכול בחוץ.',
    fields: [
      {
        key: 'wantsNutrition', label: 'לבנות גם תוכנית תזונה?', type: 'choice',
        options: [
          { value: true, label: 'כן', desc: 'ארוחות, חלופות, והנחיות לאכילה בחוץ' },
          { value: false, label: 'לא, רק אימונים' },
        ],
      },
      {
        key: 'mealsPerDay', label: 'כמה ארוחות ביום', type: 'scale', min: 3, max: 6,
        showIf: (p) => p.wantsNutrition,
        options: [{ label: '3' }, { label: '6' }],
      },
      {
        key: 'whoCooks', label: 'מי מבשל', type: 'choice',
        showIf: (p) => p.wantsNutrition,
        help: 'קובע כמה הארוחות יהיו מורכבות.',
        options: [
          { value: 'self', label: 'אני' },
          { value: 'family', label: 'במשפחה' },
          { value: 'partner', label: 'בן/בת הזוג' },
          { value: 'outside', label: 'קונה מוכן' },
        ],
      },
      {
        key: 'diet', label: 'העדפות והגבלות', type: 'chips',
        showIf: (p) => p.wantsNutrition,
        required: false,
        options: DIET_OPTIONS,
      },
      {
        key: 'allergies', label: 'אלרגיות', type: 'textarea', required: false,
        showIf: (p) => p.wantsNutrition,
        placeholder: 'למשל: בוטנים, אגוזי עץ',
      },
      {
        key: 'supplements', label: 'תוספים שאתה לוקח', type: 'textarea', required: false,
        showIf: (p) => p.wantsNutrition,
        placeholder: 'לא חובה',
      },
    ],
  },
];

/*
 * The terms are matched as substrings against the exercise names, so they have
 * to be the words the library actually uses. Two of these were simply wrong and
 * had never matched anything: the library says ברפי, not בורפי, and
 * עמידת ידיים, not הנדסטנד. Ticking either chip removed nothing at all, which
 * is the worst way for a refusal to fail — the user is asked, answers, and is
 * then prescribed the exact movement they refused.
 */
const AVOID_OPTIONS = [
  { value: 'ריצה', label: 'ריצה' },
  { value: 'קפיצ', label: 'קפיצות' },
  { value: 'סקוואט', label: 'סקוואט' },
  { value: 'דדליפט', label: 'דדליפט' },
  { value: 'מתח|pull-up|pullup', label: 'מתח' },
  { value: 'מקביל|דיפס|dip', label: 'מקבילים / דיפס' },
  { value: 'לחיצת חזה', label: 'לחיצת חזה' },
  { value: 'עמידת ידיים|handstand', label: 'עמידת ידיים' },
  { value: 'ברפי|burpee', label: 'ברפי' },
];

/** The Hebrew label for a stored avoid value, for the review screen. */
function avoidLabel(value) {
  const hit = AVOID_OPTIONS.find((o) => o.value === value);
  return hit ? hit.label : value;
}

/**
 * Could this user ever be prescribed something the term matches?
 *
 * Queried with the avoid list emptied, or a chip would vanish the moment it was
 * ticked — the registry filters avoided movements out of the very pool being
 * asked about. Equipment, track and injuries still apply, which is the point.
 */
function avoidableFor(profile, term) {
  const probe = Object.assign({}, profile, { avoid: [] });
  // Split on "|" exactly as isAvoided does. Testing the whole value as one
  // string matched nothing and silently hid every multi-term chip.
  const needles = String(term).toLowerCase().split('|').map((t) => t.trim()).filter(Boolean);
  let pool;
  try {
    pool = candidates(probe, { ignoreTrack: false });
  } catch (e) {
    return true;   // never hide an option because a lookup failed
  }
  return pool.some((e) => {
    const hay = `${e.name} ${e.nameEn}`.toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export function validateStep(stepIndex, profile) {
  const step = STEPS[stepIndex];
  const errors = {};
  if (!step) return { ok: true, errors };

  for (const f of step.fields) {
    if (f.showIf && !f.showIf(profile)) continue;
    const value = readField(profile, f.key);

    if (f.validate) {
      const msg = f.validate(value, profile);
      if (msg) { errors[f.key] = msg; continue; }
    }

    if (f.required === false) continue;
    if (f.type === 'chips' || f.type === 'multi' || f.type === 'textarea' || f.type === 'text') continue;
    if (value === null || value === undefined || value === '') {
      errors[f.key] = 'שדה חובה';
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function readField(profile, key) {
  if (key.startsWith('bm_')) return profile.benchmarks ? profile.benchmarks[key.slice(3)] : null;
  return profile[key];
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

function clamp(v, lo, hi, fallback) {
  // null/''/undefined must fall back, not coerce to 0 and clamp up to `lo` —
  // that silently turned an unanswered height into 120cm.
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Coerces types, clamps ranges, folds the flat bm_* wizard fields back into
 * benchmarks, and derives the equipment list from the chosen location.
 * Idempotent: normalizeProfile(normalizeProfile(p)) deep-equals normalizeProfile(p).
 */
export function normalizeProfile(input) {
  const d = defaults();
  const p = Object.assign({}, d, input || {});

  p.name = String(p.name || '').trim();
  p.age = clamp(p.age, 10, 90, 30);
  p.sex = ['male', 'female', 'other'].includes(p.sex) ? p.sex : 'male';
  p.heightCm = clamp(p.heightCm, 120, 220, 175);
  p.weightKg = clamp(p.weightKg, 25, 250, 70);

  p.experience = ['beginner', 'returning', 'intermediate', 'advanced'].includes(p.experience)
    ? p.experience : 'beginner';

  p.goal = ['fatloss', 'muscle', 'strength', 'fitness', 'sport'].includes(p.goal) ? p.goal : 'fitness';
  p.sport = p.goal === 'sport' ? String(p.sport || '').trim() || null : null;
  p.targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(p.targetDate)) ? p.targetDate : plusMonths(6);
  p.targetWeightKg = p.targetWeightKg === null || p.targetWeightKg === '' || !isFinite(Number(p.targetWeightKg))
    ? null : clamp(p.targetWeightKg, 25, 250, null);

  p.daysPerWeek = clamp(Math.round(p.daysPerWeek), 2, 6, 3);
  p.minutesPerSession = clamp(Math.round(p.minutesPerSession), 20, 120, 60);
  p.timeOfDay = ['morning', 'noon', 'evening'].includes(p.timeOfDay) ? p.timeOfDay : 'evening';

  // Training days: unique, in range, exactly daysPerWeek of them.
  let days = Array.isArray(p.trainingDays)
    ? Array.from(new Set(p.trainingDays.map(Number).filter((n) => n >= 0 && n <= 6))).sort((a, b) => a - b)
    : [];
  if (days.length > p.daysPerWeek) days = spreadPick(days, p.daysPerWeek);
  if (days.length < p.daysPerWeek) days = fillDays(days, p.daysPerWeek);
  p.trainingDays = days;

  p.location = ['full_gym', 'building_gym', 'home_weights', 'home_bodyweight'].includes(p.location)
    ? p.location : 'home_bodyweight';
  /*
   * There is one track. The questionnaire no longer asks, imported profiles
   * from an older build are coerced rather than honoured, and every downstream
   * filter still reads p.track — so this single line is what makes the whole
   * app calisthenics, instead of a rule repeated in each consumer.
   */
  p.track = 'calisthenics';
  // Training on a bare floor IS calisthenics — the question was never asked.
  p.gymMachines = p.gymMachines !== false;

  const known = new Set(EQUIPMENT_OPTIONS.map((o) => o.value));
  const chosen = Array.isArray(p.equipment) ? p.equipment.filter((q) => known.has(q)) : [];
  const base = EQUIPMENT_BY_LOCATION[p.location] || [];
  // The user's explicit picks are additive to the location defaults, never
  // subtractive — otherwise re-normalising a profile would keep shrinking it.
  const merged = new Set(chosen.length ? chosen : base);
  if (!chosen.length && (p.location === 'full_gym' || p.location === 'building_gym') && !p.gymMachines) {
    merged.delete('machines');
    merged.delete('cable');
  }
  p.equipment = Array.from(merged).sort();

  const injuries = new Set(INJURY_OPTIONS.map((o) => o.value));
  p.injuries = Array.isArray(p.injuries) ? Array.from(new Set(p.injuries.filter((i) => injuries.has(i)))).sort() : [];
  p.surgeries = String(p.surgeries || '').trim();
  p.medical = String(p.medical || '').trim();
  p.avoid = Array.isArray(p.avoid)
    ? Array.from(new Set(p.avoid.map((s) => String(s).trim()).filter(Boolean)))
    : String(p.avoid || '').split(',').map((s) => s.trim()).filter(Boolean);

  p.currentActivity = String(p.currentActivity || '').trim();

  const bm = Object.assign({}, d.benchmarks, p.benchmarks || {});
  for (const k of Object.keys(d.benchmarks)) {
    // Fold flat wizard keys (bm_pushups) into the nested shape.
    if (p[`bm_${k}`] !== undefined && p[`bm_${k}`] !== null && p[`bm_${k}`] !== '') bm[k] = Number(p[`bm_${k}`]);
    delete p[`bm_${k}`];
    const v = bm[k];
    bm[k] = v === null || v === '' || !isFinite(Number(v)) ? null : Math.max(0, Number(v));
  }
  p.benchmarks = bm;

  p.sleepHours = clamp(p.sleepHours, 4, 12, 7);
  p.stress = clamp(Math.round(p.stress), 1, 5, 3);

  p.commitment = clamp(Math.round(p.commitment), 1, 5, 3);
  // Photos are data URLs held on the device. Anything else is dropped.
  for (const k of ['photoNow', 'photoTarget']) {
    p[k] = typeof p[k] === 'string' && p[k].startsWith('data:image/') ? p[k] : '';
  }

  // A read without the photos it was taken from is a claim about pictures that
  // are no longer here. Drop it rather than keep steering the plan with it.
  if (!p.photoNow || !p.photoTarget) p.visionRead = null;
  if (p.visionRead && typeof p.visionRead !== 'object') p.visionRead = null;
  // emphasisFrom is total: any read, including a corrupt one, yields a complete
  // and clamped multiplier set, and no read at all yields a neutral one. So this
  // is safe to run unconditionally, and normalising twice gives the same answer.
  p.emphasis = emphasisFrom(p.visionRead);

  p.withPartner = p.withPartner === true;
  p.partnerMode = p.withPartner && p.partnerMode === 'separate' ? 'separate' : 'together';
  p.partnerName = String(p.partnerName || '').trim();
  p.partnerExperience = ['beginner', 'returning', 'intermediate', 'advanced'].includes(p.partnerExperience)
    ? p.partnerExperience : 'beginner';
  p.partnerInjuries = p.withPartner && Array.isArray(p.partnerInjuries)
    ? Array.from(new Set(p.partnerInjuries.filter((i) => injuries.has(i)))).sort() : [];
  if (!p.withPartner) { p.partnerName = ''; p.partnerInjuries = []; }

  p.wantsNutrition = p.wantsNutrition !== false;
  p.mealsPerDay = clamp(Math.round(p.mealsPerDay), 3, 6, 4);
  p.whoCooks = ['self', 'family', 'partner', 'outside'].includes(p.whoCooks) ? p.whoCooks : 'family';
  const diets = new Set(DIET_OPTIONS.map((o) => o.value));
  p.diet = Array.isArray(p.diet) ? Array.from(new Set(p.diet.filter((x) => diets.has(x)))).sort() : [];
  p.allergies = String(p.allergies || '').trim();
  p.supplements = String(p.supplements || '').trim();

  return p;
}

/** Pick n items spread evenly across the list, keeping the first. */
function spreadPick(list, n) {
  if (n >= list.length) return list;
  const out = [];
  const stride = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * stride)]);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** Top up to n days, preferring the spacing patterns people actually use. */
function fillDays(days, n) {
  const PREFERRED = {
    2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
  };
  const out = new Set(days);
  for (const d of PREFERRED[n] || []) {
    if (out.size >= n) break;
    out.add(d);
  }
  for (let d = 0; d < 7 && out.size < n; d++) out.add(d);
  return Array.from(out).sort((a, b) => a - b).slice(0, n);
}

/* ------------------------------------------------------------------ *
 * Review screen
 * ------------------------------------------------------------------ */

const GOAL_HE = {
  fatloss: 'ירידה בשומן', muscle: 'עלייה במסה', strength: 'כוח',
  fitness: 'כושר כללי', sport: 'ספורט ספציפי',
};
const EXP_HE = {
  beginner: 'מתחיל', returning: 'חוזר אחרי הפסקה',
  intermediate: 'שנה+ ברצף', advanced: 'ותיק',
};
const LOC_HE = {
  full_gym: 'חדר כושר מלא', building_gym: 'חדר כושר בבניין',
  home_weights: 'בית עם משקולות', home_bodyweight: 'בית בלי ציוד',
};
const TIME_HE = { morning: 'בוקר', noon: 'צהריים', evening: 'ערב' };
const TRACK_HE = { calisthenics: 'קליסטניקס', weights: 'מכונות ומשקולות', mixed: 'משולב' };
const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function summarize(profile) {
  const p = profile;
  const eqLabels = (p.equipment || [])
    .map((q) => (EQUIPMENT_OPTIONS.find((o) => o.value === q) || {}).label)
    .filter(Boolean);
  const injLabels = (p.injuries || [])
    .map((i) => (INJURY_OPTIONS.find((o) => o.value === i) || {}).label)
    .filter(Boolean);
  const dietLabels = (p.diet || [])
    .map((x) => (DIET_OPTIONS.find((o) => o.value === x) || {}).label)
    .filter(Boolean);

  const rows = [
    { label: 'גיל, גובה, משקל', value: `${p.age} · ${p.heightCm} ס״מ · ${p.weightKg} ק״ג` },
    { label: 'ותק', value: EXP_HE[p.experience] },
    { label: 'מטרה', value: p.goal === 'sport' && p.sport ? `${GOAL_HE.sport} — ${p.sport}` : GOAL_HE[p.goal] },
    { label: 'תאריך יעד', value: formatHeDate(p.targetDate) },
  ];
  if (p.targetWeightKg) rows.push({ label: 'משקל יעד', value: `${p.targetWeightKg} ק״ג` });
  rows.push(
    { label: 'תדירות', value: `${p.daysPerWeek} אימונים · ${p.minutesPerSession} דק׳ · ${TIME_HE[p.timeOfDay]}` },
    { label: 'ימים', value: (p.trainingDays || []).map((d) => DAY_HE[d]).join(', ') || '—' },
    { label: 'מקום', value: LOC_HE[p.location] },
    { label: 'מסלול', value: TRACK_HE[p.track] || TRACK_HE.mixed },
    { label: 'ציוד', value: eqLabels.length ? eqLabels.join(', ') : 'משקל גוף בלבד' },
    { label: 'מגבלות', value: injLabels.length ? injLabels.join(', ') : 'אין' },
  );
  if ((p.avoid || []).length) rows.push({ label: 'לא לכלול', value: p.avoid.map(avoidLabel).join(', ') });
  rows.push({ label: 'שינה ועומס', value: `${p.sleepHours} שעות · עומס ${p.stress}/5` });

  const bm = p.benchmarks || {};
  const bmParts = [];
  if (bm.pushups) bmParts.push(`${bm.pushups} שכיבות`);
  if (bm.pullups) bmParts.push(`${bm.pullups} מתח`);
  if (bm.squatKg) bmParts.push(`סקוואט ${bm.squatKg} ק״ג`);
  if (bm.benchKg) bmParts.push(`חזה ${bm.benchKg} ק״ג`);
  if (bm.deadliftKg) bmParts.push(`דדליפט ${bm.deadliftKg} ק״ג`);
  if (bmParts.length) rows.push({ label: 'מספרים היום', value: bmParts.join(' · ') });

  const COMMIT_HE = ['', 'כשמתאים לי', 'כשאני זוכר', 'רוב הזמן', 'מקפיד', 'בלי פשרות'];
  rows.push({ label: 'רמת התמסרות', value: `${p.commitment}/5 · ${COMMIT_HE[p.commitment] || ''}` });
  if (p.photoNow || p.photoTarget) {
    rows.push({
      label: 'תמונות',
      value: [p.photoNow ? 'היום' : null, p.photoTarget ? 'יעד' : null].filter(Boolean).join(' + '),
    });
  }
  if (p.visionRead) {
    rows.push({
      label: 'סריקת תמונות',
      value: p.visionRead.usable && p.visionRead.realism
        ? `רמת היגיון ${p.visionRead.realism.score}/10 · ${confidenceHe(p.visionRead.confidence)}`
        : 'לא ניתן לקריאה',
    });
  }
  rows.push({
    label: 'אימון משותף',
    value: p.withPartner
      ? (p.partnerMode === 'together'
        ? `ביחד${p.partnerName ? ` עם ${p.partnerName}` : ''} · סטים לסירוגין`
        : `אותה תוכנית${p.partnerName ? `, ${p.partnerName}` : ''} · כל אחד לחוד`)
      : 'לבד',
  });
  rows.push({
    label: 'תזונה',
    value: p.wantsNutrition
      ? `${p.mealsPerDay} ארוחות${dietLabels.length ? ` · ${dietLabels.join(', ')}` : ''}`
      : 'לא נדרשת',
  });

  return rows;
}

function formatHeDate(d) {
  const parts = String(d || '').split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '—';
}

export { EQUIPMENT_OPTIONS, INJURY_OPTIONS, DIET_OPTIONS, EQUIPMENT_BY_LOCATION, AVOID_OPTIONS };
