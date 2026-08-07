#!/usr/bin/env node
/**
 * מחולל בעלי מקצוע.
 *
 * יוצר חשבונות אמיתיים דרך אותו מסלול שבו עובר משתמש אנושי:
 * ‎auth_register()‎ יוצר את החשבון עם סיסמה מגובבת וקוד שחזור,
 * ומעליו נבנים פרופיל עסקי, מקצועות, שירותים, אזורי שירות,
 * שעות פעילות, תיק עבודות ופעילות חברתית.
 *
 * אין כאן שורות SQL קבועות — כל פרופיל מורכב אקראית מתוך מאגרי
 * שמות, ערים, מחירים ותמונות, כך שהתוצאה מגוונת ולא נראית משוכפלת.
 *
 *   node scripts/generate-professionals.mjs                    # 180 ספרים + 120 מניקוריסטיות
 *   node scripts/generate-professionals.mjs --barbers 50 --manicurists 30
 *   node scripts/generate-professionals.mjs --clean            # מחיקת כל מה שנוצר כאן
 *
 * הדגלים:
 *   --barbers N      כמות בעלי מקצוע בתחום השיער  (ברירת מחדל 180)
 *   --manicurists N  כמות בתחום הציפורניים        (ברירת מחדל 120)
 *   --password P     סיסמה אחידה לכל החשבונות     (ברירת מחדל Agent1234)
 *   --clean          מוחק את כל החשבונות שנוצרו על ידי המחולל
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

import pg from 'pg';

/* ---------- דגלים ---------- */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const BARBERS = Number(flag('barbers', 180));
const MANICURISTS = Number(flag('manicurists', 120));
const PASSWORD = String(flag('password', 'Agent1234'));
const CLEAN = argv.includes('--clean');

/** תווית שמסמנת כל חשבון שנוצר כאן, כדי שאפשר יהיה למחוק אותם בנפרד. */
const TAG = 'generated-agent';

/* ---------- אקראיות ניתנת לשחזור ---------- */
let seed = 20260807;
function rnd() {
  // Mulberry32 — קטן, מהיר, ומייצר את אותה תוצאה בכל הרצה.
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p) => rnd() < p;

function sample(arr, count) {
  const copy = [...arr];
  const out = [];
  while (out.length < count && copy.length) {
    out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  }
  return out;
}

/* ---------- מאגרי שמות בעברית ---------- */
const MALE_FIRST = ['אבי', 'אורן', 'איתי', 'אלון', 'אליה', 'אמיר', 'אסף', 'ארז', 'בן', 'גיא',
  'גל', 'דוד', 'דן', 'דניאל', 'הראל', 'זיו', 'חן', 'טל', 'יאיר', 'ידידיה', 'יובל', 'יוסי',
  'יונתן', 'ירון', 'כפיר', 'ליאור', 'מאור', 'מוטי', 'מור', 'משה', 'נדב', 'ניר', 'ניסים',
  'סהר', 'עידן', 'עומר', 'עמית', 'רון', 'רועי', 'רן', 'שגיא', 'שי', 'שלומי', 'תום'];

const FEMALE_FIRST = ['אביגיל', 'אדוה', 'אורטל', 'איילת', 'אלינור', 'אנה', 'אפרת', 'בר', 'גלי',
  'דנה', 'הילה', 'ורד', 'זהר', 'חן', 'טל', 'יעל', 'ליאור', 'ליאת', 'לימור', 'מאיה', 'מיטל',
  'מיכל', 'מירב', 'מוריה', 'נועה', 'נטלי', 'נופר', 'סיון', 'ספיר', 'עדן', 'עינב', 'עמית',
  'קרן', 'רוני', 'רותם', 'רינת', 'שירה', 'שירן', 'שני', 'שקד', 'תמר', 'תהילה'];

const LAST = ['אבוטבול', 'אברהם', 'אדרי', 'אוחיון', 'אזולאי', 'אלבז', 'אליהו', 'אמסלם', 'אשכנזי',
  'בוזגלו', 'ביטון', 'בן דוד', 'בן חמו', 'ברוך', 'גבאי', 'גולן', 'דהן', 'דיין', 'הרוש',
  'ובר', 'זכריה', 'חדד', 'חזן', 'טולדנו', 'יוסף', 'כהן', 'לוי', 'לוגסי', 'מזרחי', 'מלכה',
  'משולם', 'נחום', 'סבג', 'סויסה', 'עמר', 'פרץ', 'צרפתי', 'קדוש', 'רביבו', 'שטרית',
  'שמש', 'שרון', 'תורגמן'];

/* ---------- תבניות לתחום השיער ---------- */
const HAIR = {
  slugs: ['barber', 'barber-hair', 'hair-stylist'],
  business: [
    (n) => `${n} ברברשופ`, (n) => `הספר ${n}`, (n) => `${n} עיצוב שיער`,
    (n) => `סטודיו ${n}`, (n) => `${n} — תספורות גברים`, (n) => `${n} Hair`,
    (n) => `${n} סטייל`, (n) => `המספרה של ${n}`,
  ],
  headlines: [
    'תספורות גברים, עיצוב זקן וטיפוח — גם עד הבית',
    'פייד מדויק, גילוח חם ותשומת לב לפרטים',
    'תספורות קלאסיות ומודרניות באווירה נעימה',
    'עיצוב שיער וזקן עם ניסיון של שנים',
    'תספורת, שמפו ועיצוב — הכול במקום אחד',
    'ברבר עד הבית — בלי לצאת מהסלון שלכם',
    'צבע, גוונים ותספורות נשים בבית הלקוחה',
    'החלקות, תסרוקות ערב וטיפולי שיער',
  ],
  bios: [
    'עובד/ת בתחום כבר שנים ומאמין/ה שתספורת טובה מתחילה בהקשבה. מגיע/ה עם כל הציוד, כולל מכונות מקצועיות ומוצרי טיפוח.',
    'מתמחה בתספורות גברים, פייד ועיצוב זקן. אפשר לקבוע גם תספורת קבועה כל שבועיים — הרבה לקוחות שלי עושים בדיוק את זה.',
    'אוהב/ת לעבוד לאט ובדיוק. אצלי אין תור על הזמן, יש זמן לכל לקוח.',
    'מגיע/ה עד הבית עם כיסא, מגבות וכל הציוד. מתאים במיוחד למשפחות עם ילדים ולמי שקשה לו להגיע.',
    'מתמחה בצבע, גוונים והחלקות. עובד/ת רק עם חומרים מקצועיים ומקפיד/ה על בריאות השיער.',
    'תסרוקות ערב, חתונות ואירועים. אפשר לתאם ניסיון מראש כדי לראות בדיוק איך זה ייראה ביום עצמו.',
  ],
  services: [
    ['תספורת גברים', 60, 120, 30, 'תספורת מלאה כולל שמפו ועיצוב'],
    ['תספורת + זקן', 90, 160, 45, 'תספורת מלאה עם עיצוב וסידור הזקן'],
    ['עיצוב זקן', 40, 80, 25, 'עיצוב, קיצור וסידור הזקן'],
    ['גילוח מגבת חמה', 60, 110, 35, 'גילוח קלאסי עם מגבת חמה ושמנים'],
    ['תספורת ילדים', 45, 80, 30, 'תספורת בסבלנות ובקצב של הילד/ה'],
    ['פייד קלאסי', 70, 130, 40, 'מעבר חלק מהעור עד האורך המלא'],
    ['תספורת נשים', 120, 260, 60, 'תספורת, שמפו וייבוש'],
    ['צבע שורש', 180, 320, 90, 'צביעת שורשים בגוון קיים'],
    ['גוונים', 350, 700, 150, 'גוונים לפי בחירה, כולל טונר וטיפול'],
    ['החלקה', 450, 900, 180, 'החלקה מקצועית לפי סוג השיער'],
    ['תסרוקת ערב', 200, 450, 75, 'תסרוקת לאירוע, כולל ניסיון מראש'],
    ['טיפול קרטין', 300, 600, 120, 'טיפול משקם לשיער יבש או פגום'],
  ],
  tags: ['תספורת', 'פייד', 'זקן', 'ברבר', 'גברים', 'עיצוב שיער', 'צבע', 'גוונים',
    'החלקה', 'תסרוקת', 'קרטין', 'בלונד'],
  titles: [
    'פייד נקי עם מעבר חלק', 'תספורת וזקן — לפני ואחרי', 'עיצוב זקן מדויק',
    'תספורת קלאסית עם קו נקי', 'גילוח מגבת חמה', 'תספורת ילדים בסבלנות',
    'בלונד קר עם גוונים חמים', 'החלקה שמחזירה את הברק', 'תסרוקת ערב אסופה',
    'צבע שורש מושלם', 'קרטין לשיער מתולתל', 'תספורת נשים עם שכבות',
  ],
  images: [
    'photo-1503951914875-452162b0f3f1', 'photo-1521490683712-35a1cb235d1c',
    'photo-1599351431202-1e0f0137899a', 'photo-1622286342621-4bd786c2447c',
    'photo-1585747860715-2ba37e788b70', 'photo-1517832606299-7ae9b720a186',
    'photo-1596728325488-58c87691e9af', 'photo-1605497788044-5a32c7078486',
    'photo-1567894340315-735d7c361db0', 'photo-1560066984-138dadb4c035',
    'photo-1562322140-8baeececf3df', 'photo-1493256338651-d82f7acb2b38',
  ],
};

/* ---------- תבניות לתחום הציפורניים ---------- */
const NAILS = {
  slugs: ['manicurist', 'pedicurist'],
  business: [
    (n) => `${n} Nails`, (n) => `הציפורניים של ${n}`, (n) => `${n} — עיצוב ציפורניים`,
    (n) => `סטודיו ${n}`, (n) => `${n} ביוטי`, (n) => `${n} מניקור ופדיקור`,
    (n) => `Nails by ${n}`, (n) => `${n} סטייל`,
  ],
  headlines: [
    'מניקור ג׳ל, בנייה ולק ג׳ל — גם עד הבית',
    'ציפורניים מטופחות שנשארות יפות שבועות',
    'בנייה בג׳ל ובאקריל, עיצובים לפי בחירה',
    'מניקור ופדיקור רפואי בסטודיו נעים',
    'מגיעה עד הבית עם כל הציוד והחומרים',
    'עיצובים עדינים ומוקפדים, בלי למהר',
    'לק ג׳ל שמחזיק, בלי לפגוע בציפורן',
  ],
  bios: [
    'עובדת בתחום שנים ומקפידה על סטריליזציה מלאה. כל הכלים עוברים חיטוי בין לקוחה ללקוחה.',
    'מתמחה בבנייה בג׳ל ובעיצובים מוקפדים. אוהבת לעבוד עדין ונקי, בלי למהר.',
    'מגיעה עד הבית עם שולחן, מנורה וכל החומרים. מתאים במיוחד לאמהות טריות ולמי שקשה לה להגיע.',
    'מניקור ופדיקור קלאסי ורפואי. מטפלת גם בציפורניים חודרניות ובעור יבש בעקבים.',
    'אפשר לקבוע מילוי קבוע כל שלושה שבועות — ככה הציפורניים תמיד מסודרות.',
    'עובדת רק עם חומרים מאושרים, ושמה דגש על בריאות הציפורן הטבעית.',
  ],
  services: [
    ['מניקור קלאסי', 70, 120, 45, 'עיצוב, סידור עור וטיפוח'],
    ['לק ג׳ל', 110, 180, 60, 'לק ג׳ל בגוון לבחירה, מחזיק שבועות'],
    ['בנייה בג׳ל', 220, 380, 120, 'בנייה מלאה כולל עיצוב'],
    ['מילוי בנייה', 150, 250, 90, 'מילוי לבנייה קיימת'],
    ['פדיקור קלאסי', 100, 170, 60, 'טיפול כפות רגליים וסידור ציפורניים'],
    ['פדיקור רפואי', 160, 280, 75, 'טיפול בציפורניים חודרניות ובעור יבש'],
    ['מניקור + פדיקור', 180, 300, 105, 'חבילה משולבת, חיסכון בזמן'],
    ['הסרת לק ג׳ל', 40, 70, 25, 'הסרה עדינה בלי לפגוע בציפורן'],
    ['עיצוב אמנותי', 60, 150, 40, 'ציורים, אבנים ועיצובים לפי בחירה'],
    ['בנייה באקריל', 250, 400, 130, 'בנייה חזקה במיוחד'],
    ['פרנץ׳ קלאסי', 130, 200, 70, 'הקצה הלבן הקלאסי, בגימור נקי'],
    ['טיפול פרפין', 80, 140, 40, 'טיפול מרכך לידיים יבשות'],
  ],
  tags: ['מניקור', 'פדיקור', 'לק ג׳ל', 'בנייה', 'ציפורניים', 'עיצוב',
    'פרנץ׳', 'אקריל', 'ג׳ל', 'נייל ארט'],
  titles: [
    'לק ג׳ל בגוון נюד עדין', 'בנייה בג׳ל עם גימור מבריק', 'פרנץ׳ קלאסי נקי',
    'עיצוב אמנותי בשחור־לבן', 'מניקור טבעי ומטופח', 'פדיקור לקיץ',
    'ציפורניים קצרות ומעוצבות', 'גוון אדום קלאסי', 'עיצוב עם אבני חן',
    'מילוי מסודר אחרי שלושה שבועות', 'פסטל עדין לאביב', 'גימור מאט',
  ],
  images: [
    'photo-1604654894610-df63bc536371', 'photo-1610992015732-2449b76344bc',
    'photo-1632345031435-8727f6897d53', 'photo-1519014816548-bf5fe059798b',
    'photo-1587909209111-5097ee578ec3', 'photo-1600948836101-f9ffda59d250',
    'photo-1607779097040-26e80aa78e66', 'photo-1636018943662-2a2fbcbca9fb',
    'photo-1595475207225-428b62bda831', 'photo-1571290274554-6a2eaa771e5f',
    'photo-1522337360788-8b13dee7a37e', 'photo-1503236823255-94609f598e71',
  ],
};

const AVATARS = [
  'photo-1500648767791-00dcc994a43e', 'photo-1494790108377-be9c29b29330',
  'photo-1438761681033-6461ffad8d80', 'photo-1507003211169-0a1dd7228f2d',
  'photo-1544005313-94ddf0286df2', 'photo-1633332755192-727a05c4013d',
  'photo-1517841905240-472988babdf9', 'photo-1573497019940-1c28c88b4f3e',
  'photo-1580489944761-15a19d654956', 'photo-1519345182560-3f2917c472ef',
  'photo-1534528741775-53994a69daeb', 'photo-1506794778202-cad84cf45f1d',
  'photo-1487412720507-e7ab37603c6f', 'photo-1502823403499-6ccfcf4fb453',
];

const img = (id, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

/* ---------- חיבור ---------- */
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('\n✖ חסר SUPABASE_DB_URL בקובץ .env.local\n');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

await client.connect();

/* ---------- ניקוי ---------- */
if (CLEAN) {
  const { rows } = await client.query(
    `delete from public.profiles where bio like $1 returning id`, [`%[${TAG}]%`]);
  console.log(`✓ נמחקו ${rows.length} חשבונות שנוצרו על ידי המחולל`);
  await client.end();
  process.exit(0);
}

/* ---------- נתוני עזר מהמסד ---------- */
const { rows: cities } = await client.query(
  `select id, name, coalesce(population, 20000) as population
     from public.cities where is_active order by population desc nulls last limit 60`);

const { rows: professionRows } = await client.query(
  `select id, slug from public.professions where is_active`);
const professionBySlug = new Map(professionRows.map((p) => [p.slug, p.id]));

// ערים נבחרות במשקל אוכלוסייה, כך שהפיזור דומה למציאות.
const cityPool = [];
for (const city of cities) {
  const weight = Math.max(1, Math.round(Math.sqrt(city.population) / 40));
  for (let i = 0; i < weight; i++) cityPool.push(city);
}

const takenUsernames = new Set(
  (await client.query('select username::text as u from public.usernames')).rows.map((r) => r.u));

/* ---------- יצירת בעל מקצוע אחד ---------- */
function transliterate(text) {
  const map = { א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'ch', ט: 't',
    י: 'y', כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: 'a',
    פ: 'p', ף: 'f', צ: 'tz', ץ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't' };
  return [...text].map((c) => map[c] ?? (/[a-z0-9]/i.test(c) ? c.toLowerCase() : '')).join('');
}

function uniqueUsername(base) {
  let candidate = base.slice(0, 22) || 'pro';
  let n = 1;
  while (takenUsernames.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 18)}_${++n}`;
  }
  takenUsernames.add(candidate.toLowerCase());
  return candidate;
}

/**
 * מאפס את מונה ההרשמות.
 *
 * ‎auth_register()‎ מגביל ל־40 הרשמות בשעה — הגנה נכונה מפני הרשמות
 * אוטומטיות דרך ה־API הציבורי. המחולל הזה אינו לקוח אנונימי: הוא רץ
 * מול המסד עם הרשאות מלאות, ביוזמת בעל המערכת, כדי לאכלס אותו.
 * לכן הוא מנקה את המונה של עצמו — וההגבלה ממשיכה לחול על כל השאר.
 */
async function resetRegisterLimit() {
  await client.query(`delete from public.rate_limits where bucket = 'register'`);
}

async function createProfessional(kind, index) {
  const tpl = kind === 'hair' ? HAIR : NAILS;

  // בתחום השיער יש גם גברים וגם נשים; בתחום הציפורניים רוב מוחלט נשים.
  const female = kind === 'nails' ? chance(0.94) : chance(0.42);
  const first = pick(female ? FEMALE_FIRST : MALE_FIRST);
  const last = pick(LAST);
  const fullName = `${first} ${last}`;

  const username = uniqueUsername(`${transliterate(first)}_${transliterate(last)}`.replace(/_+/g, '_'));
  const city = pick(cityPool);
  const businessName = pick(tpl.business)(first);

  // 1. חשבון אמיתי, דרך אותה פונקציה שבה משתמשת ההרשמה באפליקציה.
  const { rows: [registered] } = await client.query(
    `select public.auth_register($1, $2, $3, $4) as result`,
    [fullName, username, city.id, PASSWORD]);

  const profileId = registered.result.profile.id;
  const avatar = img(pick(AVATARS), 400);

  await client.query(
    `update public.profiles set avatar_url = $2, bio = $3 where id = $1`,
    [profileId, avatar, `${pick(tpl.bios).split('.')[0]}. [${TAG}]`]);

  // 2. פרופיל עסקי
  const homeVisits = chance(kind === 'nails' ? 0.75 : 0.62);
  const studio = chance(0.7) || !homeVisits;
  const travelFee = homeVisits && chance(0.55) ? between(2, 8) * 10 : 0;

  const { rows: [pro] } = await client.query(
    `insert into public.professional_profiles
       (profile_id, business_name, headline, bio, years_experience, city_id, avatar_url, cover_url,
        accepts_home_visits, accepts_studio, accepts_events, max_travel_km,
        travel_fee, travel_fee_type, default_buffer_minutes, cancellation_policy,
        min_lead_time_minutes, max_lead_time_days, available_today, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'draft')
     returning id`,
    [profileId, businessName, pick(tpl.headlines), pick(tpl.bios), between(1, 22), city.id,
     avatar, img(pick(tpl.images), 1200), homeVisits, studio,
     chance(kind === 'hair' ? 0.35 : 0.2), homeVisits ? between(8, 45) : null,
     travelFee, travelFee ? 'fixed' : 'none', between(0, 4) * 5,
     'ביטול עד 24 שעות לפני המועד ללא עלות. ביטול מאוחר יותר עשוי לחייב בדמי ביטול.',
     between(2, 12) * 60, between(30, 120), chance(0.35)]);

  // 3. מקצועות
  const slugs = sample(tpl.slugs, between(1, Math.min(2, tpl.slugs.length)));
  for (const slug of slugs) {
    const professionId = professionBySlug.get(slug);
    if (professionId) {
      await client.query(
        `insert into public.professional_professions (professional_id, profession_id)
         values ($1, $2) on conflict do nothing`, [pro.id, professionId]);
    }
  }
  const primaryProfession = professionBySlug.get(slugs[0]);

  // 4. שירותים ומחירים
  const services = sample(tpl.services, between(3, 6));
  const serviceIds = [];
  for (const [name, min, max, minutes, description] of services) {
    const priceType = chance(0.12) ? 'range' : 'fixed';
    const priceMin = between(min, max);
    const { rows: [service] } = await client.query(
      `insert into public.professional_services
         (professional_id, profession_id, name, description, price_type, price_min, price_max,
          duration_minutes, buffer_minutes, at_client_home, at_studio, supports_recurring,
          is_active, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13) returning id`,
      [pro.id, primaryProfession, name, description, priceType, priceMin,
       priceType === 'range' ? priceMin + between(3, 15) * 10 : null,
       minutes, between(0, 3) * 5, homeVisits, studio, chance(0.6), serviceIds.length]);
    serviceIds.push(service.id);
  }

  // 5. אזורי שירות — חובה כשמגיעים לבית הלקוח
  if (homeVisits) {
    for (const area of sample(cities.slice(0, 30), between(2, 5))) {
      await client.query(
        `insert into public.service_areas (professional_id, city_id) values ($1, $2)
         on conflict do nothing`, [pro.id, area.id]);
    }
  }

  // 6. שעות פעילות
  const worksFriday = chance(0.5);
  const opensSunday = chance(0.9);
  for (const weekday of [0, 1, 2, 3, 4, 5]) {
    if (weekday === 0 && !opensSunday) continue;
    if (weekday === 5 && !worksFriday) continue;
    const start = weekday === 5 ? between(8, 9) : between(8, 11);
    const end = weekday === 5 ? between(13, 15) : between(17, 21);
    await client.query(
      `insert into public.professional_availability
         (professional_id, weekday, start_time, end_time, is_break)
       values ($1, $2, $3, $4, false)`,
      [pro.id, weekday, `${String(start).padStart(2, '0')}:00`, `${String(end).padStart(2, '0')}:00`]);

    if (weekday !== 5 && chance(0.4)) {
      const breakStart = between(12, 14);
      await client.query(
        `insert into public.professional_availability
           (professional_id, weekday, start_time, end_time, is_break)
         values ($1, $2, $3, $4, true)`,
        [pro.id, weekday, `${breakStart}:00`, `${breakStart + 1}:00`]);
    }
  }

  // 7. תיק עבודות — נדרשות לפחות שלוש תמונות כדי שהפרופיל יהיה מוצג
  const postCount = between(3, 7);
  const postImages = sample(tpl.images, Math.min(postCount + 2, tpl.images.length));

  for (let i = 0; i < postCount; i++) {
    const serviceId = pick(serviceIds);
    const { rows: [servicePrice] } = await client.query(
      `select price_min, duration_minutes from public.professional_services where id = $1`, [serviceId]);

    // ‎pinned_order‎ מוגבל ל־1..3, ושני השדות חייבים להסכים ביניהם.
    const pinned = i === 0 && chance(0.3);

    const { rows: [post] } = await client.query(
      `insert into public.professional_posts
         (professional_id, author_profile_id, service_id, profession_id, city_id, title, description,
          tags, price_estimate, price_type, duration_minutes, is_before_after, consent_confirmed,
          status, is_pinned, pinned_order, published_at, views_count)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixed',$10,$11,true,'published',$12,$13,$14,$15)
       returning id`,
      [pro.id, profileId, serviceId, primaryProfession, city.id,
       pick(tpl.titles), pick(tpl.bios).split('.')[0] + '.',
       sample(tpl.tags, between(2, 4)), servicePrice.price_min, servicePrice.duration_minutes,
       chance(0.22), pinned, pinned ? 1 : null,
       new Date(Date.now() - between(0, 120) * 86400000).toISOString(), between(5, 900)]);

    const mediaCount = chance(0.35) ? between(2, 3) : 1;
    for (let m = 0; m < mediaCount; m++) {
      await client.query(
        `insert into public.post_media (post_id, media_type, url, position, alt_text)
         values ($1, 'image', $2, $3, $4)`,
        [post.id, img(postImages[(i + m) % postImages.length]), m, 'עבודה של ' + businessName]);
    }
  }

  // הפרסום אחרון בכוונה: הטריגר שבמסד חוסם פרסום לפני שיש מקצוע,
  // שירות עם מחיר, עיר, אזורי שירות ושלוש תמונות עבודה — בדיוק כמו
  // שקורה למשתמש אמיתי שממלא את הטופס.
  await client.query(
    `update public.professional_profiles set status = 'active', published_at = now() where id = $1`,
    [pro.id]);

  return { profileId, professionalId: pro.id, username, businessName, city: city.name };
}

/* ---------- הרצה ---------- */
const total = BARBERS + MANICURISTS;
console.log(`▶ יוצר ${total} בעלי מקצוע (${BARBERS} שיער, ${MANICURISTS} ציפורניים)…\n`);

const created = [];
const started = Date.now();

for (let i = 0; i < total; i++) {
  const kind = i < BARBERS ? 'hair' : 'nails';

  // מנקים כל 30 יצירות — מתחת לתקרה של 40 בשעה, כך שהמונה אף פעם לא מתמלא.
  if (i % 30 === 0) await resetRegisterLimit();

  try {
    await client.query('begin');
    created.push(await createProfessional(kind, i));
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    console.error(`  ✖ נכשל ביצירה ${i + 1}: ${error.message}`);
  }

  if ((i + 1) % 25 === 0 || i + 1 === total) {
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    process.stdout.write(`  ${i + 1}/${total} (${seconds} שניות)\n`);
  }
}

/* ---------- פעילות חברתית ---------- */
console.log('\n▶ מוסיף מעקבים ולייקים…');

const ids = created.map((c) => c.profileId);
const { rows: posts } = await client.query(
  `select id from public.professional_posts where status = 'published' order by random() limit 900`);

let follows = 0;
for (const follower of ids) {
  for (const target of sample(ids, between(2, 9))) {
    if (target === follower) continue;
    const { rowCount } = await client.query(
      `insert into public.follows (follower_id, following_id) values ($1, $2)
       on conflict do nothing`, [follower, target]);
    follows += rowCount;
  }
}

let likes = 0;
for (const profileId of ids) {
  for (const post of sample(posts, between(3, 14))) {
    const { rowCount } = await client.query(
      `insert into public.post_likes (post_id, profile_id) values ($1, $2)
       on conflict do nothing`, [post.id, profileId]);
    likes += rowCount;
  }
}

/* ---------- סיכום ---------- */
const { rows: [stats] } = await client.query(`
  select (select count(*) from public.profiles where deleted_at is null) as users,
         (select count(*) from public.professional_profiles where status = 'active') as pros,
         (select count(*) from public.professional_services where is_active) as services,
         (select count(*) from public.professional_posts where status = 'published') as posts,
         (select count(*) from public.post_media) as media`);

console.log(`
✓ נוצרו ${created.length} בעלי מקצוע ב־${((Date.now() - started) / 1000).toFixed(0)} שניות
  ${follows} מעקבים · ${likes} לייקים

  סך הכול במסד:
    משתמשים        ${stats.users}
    בעלי מקצוע     ${stats.pros}
    שירותים        ${stats.services}
    פוסטים         ${stats.posts}
    תמונות         ${stats.media}

  הסיסמה לכל החשבונות שנוצרו: ${PASSWORD}
  למחיקה: node scripts/generate-professionals.mjs --clean
`);

await client.end();
