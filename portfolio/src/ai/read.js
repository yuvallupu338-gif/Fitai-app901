/*
 * read.js — a paragraph in, a list of works out.
 *
 * Fifteen questions per work is the reason somebody opens this app, types one
 * work, and never comes back. Most people can describe three years of what they
 * did in five sentences — "עיצבתי אתר למספרה של רון ב-2024, בניתי לבד בפיגמה,
 * אחרי זה עשיתי אפליקציית מתכונים לעצמי" — and every clause in that is an
 * answer to a question further down the form.
 *
 * WHAT COMES BACK IS A DRAFT, NOT A PORTFOLIO.
 *
 * The model proposes works. Every field of every one of them is then put
 * through `normaliseWork` — the same function a typed answer goes through —
 * which clamps the lengths, drops any enum value that is not one of ours, keeps
 * only links whose scheme is allowed and refuses images outright. So the worst a
 * wrong or hostile answer can do is fill the form with a legal work that the
 * person can see and correct, which is the whole reason the works land in the
 * editor rather than in the file.
 *
 * It cannot write a field the form does not have, and it cannot put a value in
 * one the form would reject. `tools/portfolio-audit.mjs` drives this module with
 * hostile responses and asserts exactly that.
 *
 * The one instruction that matters more than the schema is at the top of the
 * prompt: copy the person's own sentences, do not improve them. A model asked
 * to describe somebody's work will write "הובלתי תהליך עיצוב מקיף" about an
 * evening's work on a friend's logo, and that sentence goes into a document
 * that gets sent to an employer with the person's name on it.
 */

import { KINDS, CONTEXTS, TEAMS, YEAR_MIN, YEAR_MAX, normaliseWork, cleanLine, cleanText } from '../data/schema.js';
import { callTool, AiError, choiceFor, saveChoice } from '../../../src/ai/client.js';
import { providerById } from '../../../src/ai/providers.js';

/*
 * This app's own job name, and its own default vendor.
 *
 * The job is not 'text' because the choice is stored per job: sharing the name
 * with FitAI would mean picking a model for a training questionnaire also
 * picked the model that reads somebody's portfolio, which are not the same
 * decision and do not even cost the same.
 *
 * The default is DeepSeek. This job is reading Hebrew prose and filling a form
 * from it — no images, no long context — which is the cheap end of what a text
 * model does, and DeepSeek is the cheap one on the table. It comes with a real
 * caveat that the screen states rather than hides: DeepSeek does not document
 * calls straight from a browser, so a browser may refuse the request before it
 * leaves the machine. There is no server here to proxy through. When that
 * happens the app says so and the other provider is one tap away.
 */
export const JOB = 'portfolio';
const DEFAULT_PROVIDER = 'deepseek';

/**
 * Seeds this app's provider choice the first time it is asked for, and returns
 * it. Without this, `choiceFor` falls back to the first provider in the table,
 * which is somebody else's default rather than this app's.
 */
export function readerChoice() {
  const stored = choiceFor(JOB);
  if (!hasStoredChoice() && providerById(DEFAULT_PROVIDER)) {
    const models = providerById(DEFAULT_PROVIDER).models;
    if (saveChoice(JOB, DEFAULT_PROVIDER, models[0] ? models[0].value : '')) return choiceFor(JOB);
  }
  return stored;
}

function hasStoredChoice() {
  try {
    return !!window.localStorage.getItem('fitai.ai.' + JOB);
  } catch (e) {
    /* No storage means no stored choice, and also means nothing to seed. */
    return false;
  }
}

const KIND_IDS = KINDS.map((k) => k.id);
const CONTEXT_IDS = CONTEXTS.map((c) => c.id);
const TEAM_IDS = TEAMS.map((t) => t.id);

export const SYSTEM = `You read what a person wrote about the work they have done, in Hebrew, and
split it into the separate works of a portfolio. The app is Hebrew and so is
their text.

THE RULE THAT MATTERS MOST: use their own words. For every field that is free
text — brief, did, result, learned — copy the sentences they wrote about that
work, trimmed to the field, in their words and their register. Do not improve
them, do not make them sound professional, do not add adjectives. If they wrote
"עשיתי לוגו לחבר", the brief is that they made a logo for a friend, not that
they "led a comprehensive branding process". A sentence you invented looks
exactly like a sentence they wrote, on a document they will send to an employer
with their name on it.

Fill ONLY what they actually said. Leaving a field out is always correct and
always safe: the app names the empty fields and asks for them later, with its
own defaults. Guessing is not safe, because a wrong answer looks identical to a
right one on the review screen and will be scrolled past.

Specifics that decide most cases:

  * One work per thing they made. Two sentences about the same website are one
    work; a website and a logo for the same client are two.
  * "title" is what they would call it in conversation — "אתר למספרה", not
    "פרויקט עיצוב ופיתוח אתר תדמית".
  * "kind" is what the thing IS. A website is site, a mobile or web app is app,
    a logo or a brand system is brand, a poster or a screen design is design,
    photographs are photo, a written piece is writing, code that is not an app
    is software, teaching is teaching. When nothing fits, use other.
  * "context" is who it was for: a paying client is client, a job is work,
    school or university is study, their own idea is personal, unpaid for an
    organisation is volunteer, made for the portfolio itself is spec.
  * Dates: fill fromYear/toYear only when a year is actually stated or plainly
    implied ("לפני שנתיים" is not a year you know). Months only when named. Set
    ongoing when they say it is still going.
  * "did" is a list of the things they actually did — one short line each, in
    their words. Not a summary, not a plan.
  * "tools" only for tools, software, languages or equipment they named.
  * "links" only for addresses they wrote themselves.
  * Never invent a number. A result of "הרבה יותר פניות" stays that; it does not
    become "עלייה של 40%".

Also fill "headline": one line describing the person, in their words, only if
they said what they do. And list in "missing" the things that would most improve
the portfolio and that they did not say — at most four, each two or three words,
in Hebrew ("שנים", "שמות לקוחות", "מה יצא מכל עבודה").`;

export const TOOL = {
  name: 'fill_portfolio',
  description: 'Split what the person wrote into the works of their portfolio, in their own words.',
  schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'One line about the person, in their words. Omit if unsaid.' },
      works: {
        type: 'array',
        description: 'One entry per thing they made. Omit the whole field if they described nothing.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'What they would call it in conversation.' },
            kind: { type: 'string', enum: KIND_IDS },
            role: { type: 'string', description: 'Their part in it, in their words.' },
            context: { type: 'string', enum: CONTEXT_IDS },
            clientName: { type: 'string', description: 'Only if they named the client, employer or school.' },
            fromYear: { type: 'integer' },
            fromMonth: { type: 'integer', description: '1-12, only if a month was named.' },
            toYear: { type: 'integer' },
            toMonth: { type: 'integer' },
            ongoing: { type: 'boolean' },
            team: { type: 'string', enum: TEAM_IDS },
            brief: { type: 'string', description: 'What was needed, in their words.' },
            did: { type: 'array', items: { type: 'string' }, description: 'What they did, one short line each.' },
            tools: { type: 'array', items: { type: 'string' } },
            result: { type: 'string', description: 'What came of it, in their words. Never a number they did not say.' },
            learned: { type: 'string' },
            links: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, url: { type: 'string' } },
                required: ['url'],
              },
            },
          },
          required: ['title'],
        },
      },
      missing: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to four things they did not say that the portfolio would be better for.',
      },
    },
    required: ['works'],
  },
};

/*
 * Everything above is a suggestion until it has been through here.
 *
 * `normaliseWork` does the heavy work — it is the same function the form uses —
 * so this only has to get the shape right and refuse the two things the model
 * has no business sending at all: an id, which would let a response overwrite a
 * work already in the portfolio, and images, which are not something a text
 * model can have.
 */
export function normaliseReading(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(r.works) ? r.works.slice(0, MAX_WORKS) : [];
  const works = [];
  let dropped = 0;

  for (const item of list) {
    const w = item && typeof item === 'object' ? item : {};
    const title = cleanLine(w.title, 120);
    /* A work with no name has no heading, and the document drops it later
     * anyway. Counted rather than silently skipped, so the screen can say. */
    if (!title) { dropped += 1; continue; }
    works.push(normaliseWork({
      id: '',
      title,
      kind: pick(w.kind, KIND_IDS, 'other'),
      role: cleanLine(w.role, 120),
      context: pick(w.context, CONTEXT_IDS, 'personal'),
      clientName: cleanLine(w.clientName, 120),
      period: {
        fromYear: year(w.fromYear),
        fromMonth: month(w.fromMonth),
        toYear: year(w.toYear),
        toMonth: month(w.toMonth),
        ongoing: w.ongoing === true,
      },
      team: pick(w.team, TEAM_IDS, ''),
      brief: cleanText(w.brief, 1200),
      did: lines(w.did),
      tools: Array.isArray(w.tools) ? w.tools : [],
      result: cleanText(w.result, 800),
      learned: cleanText(w.learned, 600),
      links: Array.isArray(w.links) ? w.links.slice(0, 6) : [],
      images: [],
    }, works.length));
  }

  return {
    works,
    dropped,
    headline: cleanLine(r.headline, 120),
    missing: Array.isArray(r.missing)
      ? r.missing.map((m) => cleanLine(m, 40)).filter(Boolean).slice(0, 4)
      : [],
  };
}

const MAX_WORKS = 20;
const MAX_INPUT = 6000;

function pick(value, allowed, fallback) {
  const v = cleanLine(value, 40);
  return allowed.indexOf(v) >= 0 ? v : fallback;
}

function year(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

function month(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/* "did" may come back as a list or as one string; both become lines. */
function lines(value) {
  const list = Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split('\n');
  return list.map((l) => cleanLine(l, 200)).filter(Boolean).slice(0, 12).join('\n');
}

/**
 * Reads the paragraph and returns { works, headline, missing, dropped }.
 *
 * @param {string} description  the person's own words
 * @param {Object} [opts]       { signal }
 */
export async function readWorks(description, opts) {
  const o = opts || {};
  const body = cleanText(description, MAX_INPUT);
  if (body.length < 15) {
    throw new AiError('too_short',
      'כתבו קצת יותר — מה עשיתם, בשביל מי, ומתי. משפט או שניים לכל עבודה מספיקים.');
  }

  const chosen = readerChoice();
  const input = await callTool({
    job: JOB,
    provider: chosen.provider ? chosen.provider.id : undefined,
    model: chosen.model,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: 'זה מה שהמשתמש כתב על העבודות שלו:\n\n' + body + '\n\n'
        + 'פרק את זה לעבודות נפרדות, במילים שלו. מה שהוא לא אמר — אל תמלא.',
    }],
    tool: TOOL,
    maxTokens: 4000,
    signal: o.signal,
  });

  return normaliseReading(input);
}

export { AiError };
