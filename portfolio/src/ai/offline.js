/*
 * offline.js — the same job without a model, and without pretending otherwise.
 *
 * Most people who open this app do not have an API key and are not going to get
 * one to write a portfolio. This is what they get instead: a list of rules,
 * applied to what they typed. It reads years, months, known tools, and the
 * handful of Hebrew words that say what a thing is and who it was for, and it
 * puts each line into a work with the text they wrote kept whole.
 *
 * It is worth being exact about the difference, because the app says so on the
 * screen. A model reads prose and can tell that three sentences are about one
 * website; this cannot, and does not guess. Its rule is stated rather than
 * inferred: ONE LINE IS ONE WORK. A single unbroken paragraph therefore comes
 * back as a single work — which is a true answer, and the screen asks the
 * person to press return between their works if they want them split.
 *
 * Everything it does not know it leaves empty, where the app will list it by
 * name. Nothing here writes a sentence the person did not type: the only
 * generated text in the whole path is the title, which is the opening clause of
 * their own line.
 */

import { MONTHS, normaliseWork, cleanLine, cleanText } from '../data/schema.js';

/*
 * What a thing is, by the word people use for it.
 *
 * Order matters: the first match wins, so the specific ones come before the
 * general. "אתר תדמית" is a site before it is anything else, and "עיצבתי אתר"
 * is a site rather than a design job — what the thing IS beats what was done
 * to it, which is the same rule the prompt gives the model.
 */
const KIND_WORDS = [
  ['site', ['אתר', 'אתרים', 'דף נחיתה', 'לנדינג']],
  ['app', ['אפליקציה', 'אפליקציית', 'אפליקציות', 'אפליקציה סלולרית']],
  ['brand', ['מיתוג', 'לוגו', 'שפה חזותית', 'ברendינג']],
  ['illustration', ['איור', 'איורים', 'אייר', 'ציירתי']],
  ['photo', ['צילום', 'צילומים', 'צילמתי', 'סשן']],
  ['video', ['סרטון', 'וידאו', 'קליפ', 'עריכת וידאו']],
  ['audio', ['פודקאסט', 'סאונד', 'מוזיקה', 'הלחנתי', 'הקלטתי']],
  ['writing', ['מאמר', 'טקסט', 'כתבתי', 'קופי', 'תוכן', 'ספר']],
  ['research', ['מחקר', 'סקר', 'עבודה סמינריונית', 'תזה']],
  ['product', ['מוצר', 'פיתחתי מוצר', 'אב טיפוס', 'פרוטוטייפ']],
  ['event', ['אירוע', 'כנס', 'הפקה', 'פסטיבל', 'תערוכה']],
  ['teaching', ['סדנה', 'הדרכה', 'קורס', 'לימדתי', 'העברתי']],
  ['software', ['קוד', 'תוכנה', 'סקריפט', 'מערכת', 'שרת', 'API']],
  ['design', ['עיצוב', 'עיצבתי', 'פוסטר', 'כרזה', 'ממשק']],
];

/* Who it was for. The word that gives it away is usually a preposition. */
const CONTEXT_WORDS = [
  ['client', ['ללקוח', 'ללקוחה', 'לקוח', 'עבור', 'בתשלום', 'פרילנס']],
  ['work', ['בעבודה', 'במשרד', 'בחברה', 'בסטארטאפ', 'במקום העבודה', 'כשכיר']],
  ['study', ['בלימודים', 'באוניברסיטה', 'במכללה', 'בקורס', 'בבית הספר', 'סמינריון']],
  ['volunteer', ['התנדבות', 'בהתנדבות', 'עמותה', 'התנדבתי']],
  ['personal', ['לעצמי', 'פרויקט אישי', 'בשביל עצמי', 'לכיף', 'לבד בבית']],
  ['spec', ['לתיק', 'תרגיל', 'לתרגול']],
];

const TEAM_WORDS = [
  ['lead', ['הובלתי', 'ניהלתי צוות', 'בראש צוות', 'ניהלתי את הצוות']],
  ['team', ['בצוות', 'עם צוות', 'עם עוד', 'ביחד עם', 'עם שותף', 'עם שותפה']],
  ['alone', ['לבד', 'לבדי', 'בעצמי', 'הכול לבד']],
];

/*
 * Tools are matched as whole words against a list rather than guessed.
 *
 * A tool is the one field where a wrong value is embarrassing in a specific
 * way — claiming software you have never opened, to somebody who is hiring for
 * it. So the list is closed, both spellings of the ones people write in Hebrew
 * are in it, and anything not on it is left for the person to type.
 */
const TOOLS = [
  ['Figma', ['figma', 'פיגמה']],
  ['Photoshop', ['photoshop', 'פוטושופ', 'פוטושופ']],
  ['Illustrator', ['illustrator', 'אילוסטרייטור']],
  ['InDesign', ['indesign', 'אינדיזיין']],
  ['After Effects', ['after effects', 'אפטר']],
  ['Premiere', ['premiere', 'פרימייר']],
  ['Lightroom', ['lightroom', 'לייטרום']],
  ['Procreate', ['procreate', 'פרוקריאט']],
  ['Sketch', ['sketch']],
  ['Canva', ['canva', 'קנבה']],
  ['Blender', ['blender', 'בלנדר']],
  ['Unity', ['unity', 'יוניטי']],
  ['WordPress', ['wordpress', 'וורדפרס', 'וורדפרס']],
  ['Wix', ['wix', 'ויקס']],
  ['Webflow', ['webflow']],
  ['Shopify', ['shopify']],
  ['HTML', ['html']],
  ['CSS', ['css']],
  ['JavaScript', ['javascript', "js", 'ג׳אווהסקריפט']],
  ['TypeScript', ['typescript']],
  ['React', ['react', 'ריאקט']],
  ['Vue', ['vue']],
  ['Node', ['node.js', 'node']],
  ['Python', ['python', 'פייתון']],
  ['SQL', ['sql']],
  ['PHP', ['php']],
  ['Java', ['java']],
  ['Swift', ['swift']],
  ['Kotlin', ['kotlin']],
  ['Excel', ['excel', 'אקסל']],
  ['AutoCAD', ['autocad', 'אוטוקאד']],
  ['SolidWorks', ['solidworks', 'סולידוורקס']],
];

const ONGOING_WORDS = ['עדיין', 'ממשיך', 'ממשיכה', 'עד היום', 'בתהליך', 'עובד על זה', 'עובדת על זה'];

const MAX_WORKS = 20;

/**
 * Splits the text into works and fills what the rules can see.
 *
 * Returns the same shape as the model reader, so the screen showing the result
 * does not need to know which of the two produced it.
 */
export function readOffline(description) {
  const body = cleanText(description, 6000);
  const chunks = splitWorks(body);
  const works = [];
  let dropped = 0;

  for (const chunk of chunks.slice(0, MAX_WORKS)) {
    const title = titleOf(chunk);
    if (!title) { dropped += 1; continue; }
    const low = chunk.toLowerCase();
    works.push(normaliseWork({
      id: '',
      title,
      kind: firstWord(chunk, KIND_WORDS) || 'other',
      context: firstWord(chunk, CONTEXT_WORDS) || '',
      team: firstWord(chunk, TEAM_WORDS) || '',
      period: periodOf(chunk),
      brief: chunk,
      tools: toolsIn(low),
    }, works.length));
  }

  return {
    works,
    dropped,
    headline: '',
    /* Named rather than counted, because these are the fields the rules here
     * cannot fill at all — not the ones this particular text happened to miss. */
    missing: works.length ? ['התפקיד שלך', 'מה יצא מכל עבודה'] : [],
    /* True whenever the split had nothing to go on, which is what the screen
     * turns into "press return between the works and I will split them". */
    oneBlock: chunks.length === 1 && body.indexOf('\n') < 0,
  };
}

/*
 * One line is one work.
 *
 * Blank lines are honoured first, because somebody who separated their works
 * with an empty line has already told us where the boundaries are. Otherwise
 * every non-empty line is a work. Sentences are deliberately NOT split on: "יש
 * לי מספרה. עשיתי לה אתר." is one work in two sentences, and there is no rule
 * here that can tell that apart from two works in two sentences.
 */
function splitWorks(body) {
  const byBlank = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return body.split('\n').map((s) => s.trim()).filter(Boolean);
}

/*
 * The title is the opening clause of the person's own line.
 *
 * Cut at the first comma, full stop or dash, because that is where a Hebrew
 * sentence usually stops naming the thing and starts describing it. A bullet
 * marker or a number they typed is removed first — it is punctuation, not part
 * of the name.
 */
function titleOf(chunk) {
  const first = cleanLine(chunk, 400).replace(/^[-*•·]\s*/, '').replace(/^\d+[.)]\s*/, '');
  const cut = first.split(/[,.;:—–]|\s-\s/)[0].trim();
  const title = cut || first;
  return cleanLine(title.length > 60 ? title.slice(0, 57).trim() + '…' : title, 120);
}

function firstWord(chunk, table) {
  for (const [id, words] of table) {
    for (const w of words) {
      if (chunk.indexOf(w) >= 0) return id;
    }
  }
  return '';
}

function toolsIn(low) {
  const found = [];
  for (const [label, spellings] of TOOLS) {
    for (const s of spellings) {
      /* Latin names are matched on a word boundary so "js" does not fire inside
       * "just" and "java" does not fire inside "javascript" — which it would,
       * and did, before the boundary was there. */
      const hit = /^[a-z]/.test(s)
        ? new RegExp('(^|[^a-z])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(low)
        : low.indexOf(s) >= 0;
      if (hit) { found.push(label); break; }
    }
  }
  return found;
}

/*
 * Years, and months only when a month is named beside them.
 *
 * Two years in a line are a range; one is a start with no end, which is exactly
 * what the person told us. A year in the future is somebody's typo and is left
 * for `normaliseWork` to drop.
 */
function periodOf(chunk) {
  const years = (chunk.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  const months = MONTHS.map((m, i) => ({ m, i: i + 1 })).filter((x) => chunk.indexOf(x.m) >= 0);
  const ongoing = ONGOING_WORDS.some((w) => chunk.indexOf(w) >= 0);
  return {
    fromYear: years.length ? years[0] : null,
    fromMonth: months.length ? months[0].i : null,
    toYear: years.length > 1 ? years[1] : null,
    toMonth: months.length > 1 ? months[1].i : null,
    ongoing,
  };
}
