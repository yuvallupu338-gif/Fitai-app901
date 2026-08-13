# עו״ד רון לביא — design brief

A single-page landing page for a personal-injury practice: road accidents,
work accidents, medical negligence, National Insurance claims.

**This is a demo.** The firm, the lawyer, the numbers, the case results and the
testimonials are all invented. The page must say so, once, plainly, in the
footer — see §7. Do not present invented figures as real anywhere else.

This document is the design. Where it names a size, a token, a state or a
behaviour, that is a decision.

---

## 1. The idea the design is carrying

The other two sites in this folder sell an hour of feeling something. This one
is read by somebody who was in a car accident three weeks ago, is in pain, is
scared about money, and is deciding in roughly eleven seconds whether the
person behind this page is serious.

Nothing here gets to be atmospheric. The whole job is **legibility, calm and
proof**:

- **Light.** A dark landing page for a lawyer looks like a crypto fund. Warm
  ivory, not white — white with a black serif on it is a contract, and a
  contract is not a reassuring object.
- **Navy acts, gold decorates.** Every call to action is navy. Gold is trim —
  rules, the monogram, eyebrows, section ornaments — and never a button.
- **One idea per screen.** Generous whitespace. If a section is doing two
  things, it is two sections.
- **Motion is nearly absent.** One short fade per section on entry, nothing
  else. Every animation on this page costs trust.
- The phone number is reachable from any scroll position, on every device.
  That is the entire commercial purpose of the page.

---

## 2. Brand

| | |
|---|---|
| Name | **רון לביא, משרד עורכי דין** |
| Practice | נזקי גוף · תאונות דרכים · תאונות עבודה · רשלנות רפואית |
| Line | «נפגעתם. עכשיו צריך שמישהו יילחם על זה.» |
| Address | דרך מנחם בגין 132, תל אביב (קומה 14) |
| Phone | 03-6100420 · WhatsApp link, see §6 |
| Email | office@lavi-law.example |
| Hours | א׳–ה׳ 08:30–19:00 · ו׳ בתיאום |
| Monogram | The letters **ר״ל** set in the display serif inside a gold hairline frame — this is the logo. There are no photographs anywhere in this repo, so the "portrait" in §3.8 is a monogram plate, not a placeholder headshot. |

**Voice.** Plain, direct, no adjectives. Short sentences. It explains rather
than promises — «רוב התיקים נסגרים בפשרה תוך 8–18 חודשים» is worth more than
any superlative.

**Copy rules, and these are not stylistic:** Israeli bar advertising rules
forbid promising results, superlatives and comparisons to other lawyers. No
«הטוב ביותר», no «מובטח», no «100% הצלחה», no naming or ranking competitors.
Say what the office does, how the process works, and what it costs. It reads
better anyway.

---

## 3. Content architecture

### 3.1 Header
Sticky from the start (not transparent — this page has nothing to hide behind),
`--header-h`, `--surface` with a hairline and a soft shadow once scrolled.
Monogram + name at the inline-start, anchor nav (`תחומי עיסוק · התהליך ·
תוצאות · שאלות`), and at the inline-end a navy `שיחת ייעוץ` button next to a
plain `03-6100420` `tel:` link. Below 900px the nav collapses to a drawer
(`aria-expanded`, focus trap, `Esc`, refocus) and the phone stays visible.

### 3.2 Hero — two columns
Split: content at the inline-start, the lead form card at the inline-end. On
mobile the **form comes second** (content first — someone who lands here needs
one sentence of reassurance before a form).

Content side:
- eyebrow `נזקי גוף · תאונות דרכים · תאונות עבודה`
- `h1` at `--d1`: «נפגעתם. עכשיו צריך שמישהו יילחם על זה.»
- a two-sentence sub: free initial assessment, no fee unless the case is won
  (**שכר טרחה מותנה** — say it in those words, it is the single most
  reassuring fact on the page),
- three trust markers with gold hairline rules between them:
  `18 שנות ניסיון` · `900+ תיקים` · `ללא תשלום מראש`,
- CTAs: navy `שיחת ייעוץ ללא עלות` (scrolls to the form / on mobile dials) and
  a ghost `03-6100420` `tel:` link.

Form card (`--surface`, `--shadow-lift`, sitting slightly over the section
boundary): headline «בדיקת זכאות — ללא עלות», fields שם, טלפון, סוג המקרה
(select), מתי קרה (select: החודש / עד שנה / 1–3 שנים / מעל 3 שנים), and a
submit. Under it, a `.dimmer` micro-line: «הפרטים נשמרים במכשיר שלכם בלבד ואינם
נשלחים לשום שרת» — which in this build is literally true, and saying so is
better than the usual fake privacy line.

Background: ivory with a very soft gold radial at the top, and a **hairline
grid or a subtle engraved rule pattern** at low alpha behind the content
column. Nothing that competes with the text.

### 3.3 Trust bar
A thin band under the hero: `חבר לשכת עורכי הדין מ-2008` · `ייצוג בבתי משפט
השלום והמחוזי` · `ליווי מול חברות הביטוח והמל״ל` · `פגישות גם בבית הלקוח`.
Small caps-ish mono-ish treatment in `--ink-dimmer`, gold hairline separators.
No logos — inventing certification badges would be dishonest.

### 3.4 תחומי עיסוק — six cards
`תאונות דרכים` · `תאונות עבודה` · `רשלנות רפואית` · `נכות מביטוח לאומי` ·
`תביעות ביטוח` · `נזקי גוף כלליים`. Each: a gold **line-art SVG icon** (drawn
inline, 1.5px stroke, no fills — a car, a hard hat, a stethoscope, a form, an
umbrella, a scale), a title in the serif, two lines of copy, and a
`מה זה כולל ←` disclosure that expands three bullet points.

### 3.5 האם מגיע לכם פיצוי? — the signature interaction
A four-question checker, one question at a time, with a progress rail.

1. מה קרה? (תאונת דרכים / תאונת עבודה / רשלנות רפואית / אחר)
2. מתי? (החודש / עד שנה / 1–3 שנים / מעל 3 שנים / מעל 7 שנים)
3. האם נגרם נזק גופני שטופל רפואית? (כן / לא / עדיין בטיפול)
4. האם האירוע דווח? (משטרה / מעסיק / קופת חולים / לא דווח)

The result is **qualitative and never a number**. Three outcomes:
- «סביר שיש כאן עילה» — with the two or three next steps;
- «צריך לבדוק לעומק» — with what would decide it;
- «ייתכן שחלה התיישנות» — with the plain-language rule
  (7 שנים בנזיקין, ומקטינים לקטינים מגיל 18) and the advice to call anyway,
  because there are exceptions and only a lawyer can rule it out.

**Design constraints that are ethical, not aesthetic:**
- Never output a shekel figure. A landing page that estimates someone's
  compensation from four clicks is lying to them.
- Every result ends with the same disclaimer, visible and not in fine print:
  «הכלי נותן כיוון כללי בלבד. הוא אינו ייעוץ משפטי ואינו מחליף בדיקה פרטנית
  של המקרה.»
- The result CTA is `נדבר על זה` → the form. Not «התחילו תביעה».

Mechanics: `role="group"` per question, radio semantics, arrow keys move,
`Enter`/click advances, a `חזרה` button, the step announced in a
`role="status"` region, and the whole thing keyboard-completable. Answers
carry into the contact form's `סוג המקרה` field.

### 3.6 התהליך — five steps
`פגישה ללא עלות` → `איסוף מסמכים ותיק רפואי` → `חוות דעת מומחה` →
`מו״מ מול חברת הביטוח` → `פשרה או תביעה`. A vertical timeline on mobile,
horizontal on desktop, gold hairline connector, numbers in the serif. One line
of copy each, plus a realistic time estimate per step (`2–4 שבועות` etc.) in
`.num` — the estimates are what make this section useful instead of filler.

### 3.7 תוצאות נבחרות
Four anonymised results: `רוכב אופנוע, 34` / `תאונת דרכים` / `נכות 21%` /
`₪780,000` / `14 חודשים`. Amount in the serif at `--d3`, in `--gold-ink`.

Two things this section must carry, at the section level and not per card:
a `נתוני הדגמה` label, and the line «כל תיק נבחן לגופו. תוצאה בתיק אחד אינה
מעידה על תוצאה בתיק אחר.»

### 3.8 אודות
Two columns: the **monogram plate** (a large ר״ל in a gold hairline frame on
`--surface-2`, with a subtle engraved texture) and the bio — three short
paragraphs, then a credentials list with gold check glyphs: השכלה, חברות
בלשכה, תחומי התמחות, שפות (עברית, אנגלית, רוסית).

### 3.9 עדויות — on navy
A `.on-navy` band (the token scope is already written — put the class on the
section and the components invert themselves). Three testimonials: quote,
name + initial, case type, year. Set the quote in the serif at `--d3`; a large
gold quotation mark drawn in SVG behind each card at low alpha.

### 3.10 שאלות נפוצות
Accordion (`<button aria-expanded>` + region, `grid-template-rows: 0fr → 1fr`):
כמה זה עולה ומה זה שכר טרחה מותנה, כמה זמן לוקח תיק, האם צריך להגיע למשרד,
מה עושים אם חברת הביטוח כבר הציעה סכום, האם שווה לתבוע על פגיעה קלה, מה זה
ועדה רפואית, התיישנות. Answer them properly — three or four sentences each.
This section is where trust is actually won, and it is usually the section
that gets one-line answers.

### 3.11 Closing CTA + contact
A `.on-navy` band: headline, one line, the phone as a big `tel:` link, the
WhatsApp button, and beside it a contact block — address, floor, hours,
parking note, accessibility note (`המשרד נגיש לכיסא גלגלים`), and a **drawn
map plate**: a stylised SVG of a few streets and a marker in gold. No external
map, no iframe, no network.

### 3.12 Mobile call bar
Fixed to the bottom of the viewport under 760px, above the fold of everything:
two halves, `התקשרו` (`tel:`) and `וואטסאפ`. Appears after the hero scrolls
out. Add bottom padding to `body` so it never covers the footer, and respect
`env(safe-area-inset-bottom)`.

### 3.13 Footer
Nav repeat, the bar-membership line, credits, and **the demo disclaimer**
(§7), plus «אין באמור באתר זה משום ייעוץ משפטי».

---

## 4. Type

| Role | Face | Notes |
|---|---|---|
| h1 | Noto Serif Hebrew 700 | `--d1`, line-height 1.15 |
| h2 | Noto Serif Hebrew 700 | `--d2` |
| h3, amounts, quotes | Noto Serif Hebrew 600 | `--d3` |
| Body, UI, forms | Heebo 400/500/700 | 16.5px / 1.7 — this page is read, not scanned |
| Numbers | Heebo, `.num` | tabular, LTR-isolated |

Body copy runs slightly larger here than on the other two sites. The audience
skews older and is often reading in pain on a phone.

---

## 5. Motion

One pattern only: `.reveal` on section entry, 500ms, 18px, staggered by
`--delay` within a section. Plus:
- the header shadow appearing on scroll,
- the checker's step transitions (a 200ms cross-fade, no sliding carousels),
- accordion panels.

Nothing loops, nothing floats, nothing parallaxes. Under
`prefers-reduced-motion` the kit neutralises all of it and the page still
works completely.

---

## 6. Rules for the build

- **Files.** `index.html`, `styles/site.css`, `src/main.js` (ES modules under
  `src/` if it helps, relative paths). Do not edit `styles/tokens.css`,
  `styles/fonts.css` or `../shared/kit.css`; missing tokens go in a clearly
  commented block at the top of `site.css`.
- Head order: `styles/fonts.css`, `styles/tokens.css`, `../shared/kit.css`,
  `styles/site.css`.
- `<html lang="he" dir="rtl">`, all copy Hebrew, `theme-color` `#14202F`,
  real `<title>`, `<meta name="description">`, Open Graph tags. Add
  `LegalService` JSON-LD — it is a landing page, structured data is part of
  the job — with the demo data.
- **No dependencies, no build step, no network at runtime, no media files.**
- Both forms are frontend-only: validate inline (`aria-invalid`, `.err`,
  never `alert()`), then build a WhatsApp link
  (`https://wa.me/972361004 20?text=…`, URL-encoded Hebrew summary) as the
  primary confirmation action with `mailto:` as secondary. Do not fake a
  server round-trip, and do not claim the details were sent anywhere.
- **Logical properties only.** A hard-coded `left` is a bug in an RTL page.
- Semantic HTML, one `h1`, landmarks, keyboard reachable everything, visible
  focus, `aria-label` on every icon-only control. This page in particular will
  be read by people using zoom and screen readers; it holds to AA.
- 360px with no horizontal scroll; holds to 1600px.
- No console errors or warnings.
- Verify before declaring done:
  `NODE_PATH=/opt/node22/lib/node_modules node tools/sites-smoke.mjs lawyer`

---

## 7. The disclaimer (verbatim, in the footer)

> אתר הדגמה. המשרד, שם עורך הדין, הנתונים, התוצאות והעדויות בדף זה הם בדיוניים
> ונועדו להדגמת עיצוב בלבד. אין באמור ייעוץ משפטי.
