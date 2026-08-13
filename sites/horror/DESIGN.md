# מרתף 9 — design brief

A live horror house: three rooms, actors inside them, 45–60 minutes, 18+.
The site sells one hour of being frightened on purpose.

This document is the design. It is written to be built from — where it names a
size, a colour token, a state or a behaviour, that is a decision, not a
suggestion. Where it does not, use judgement and match the register.

---

## 1. The idea the design is carrying

Not splatter. Not a Halloween party. The register is **a corridor with one
working bulb** — a building that is genuinely unpleasant to stand in, run by
people who are good at their jobs. That means:

- Almost no colour. Bone ink on near-black, and red used the way a set
  designer uses it: rarely, and never as decoration.
- **One light source.** Everything on the page is lit by the same warm bulb
  (`--bulb`) from above. Glows do not come from six directions.
- Slow motion. Things arrive the way something walks toward you.
- The words stay readable. Atmosphere is the vignette's job, not the
  paragraph's — every ink token in `tokens.css` carries its measured contrast
  in a comment, and none of them may be dimmed further.

The one thing the site must never look like: a Bootstrap page with a black
background.

---

## 2. Brand

| | |
|---|---|
| Name | **מרתף 9** |
| Line | «אתם נכנסים בשלושה. זה לא אומר שתצאו ככה.» |
| Address | רחוב הבשמים 9, אזור התעשייה, חולון |
| Phone | 03-9051190 (WhatsApp: 972390511 90 — build the link, see §6) |
| Hours | א׳–ה׳ 17:00–01:00 · ו׳ 10:00–15:00 · שבת מצאת השבת עד 02:00 |
| Age | 18+, or 16+ with a parent present |
| Safe word | **״מרתף״** — say it and the room stops. This is a real feature of the business and a real feature of the page (§5.3). |

**Voice.** Short sentences. Second person plural. Never jokes, never
exclamation marks, never the word "חוויה". The site is calm about what it does,
which is the frightening part. Warnings are stated plainly and completely —
being straight about the risks is both the ethical position and the one that
reads as professional.

---

## 3. Content architecture

Sections in order. Every section is `<section class="section">` with a
`.shell` inside unless noted.

### 3.1 Header
Sticky, `--header-h` tall, transparent over the hero and gaining a
`--surface`/blur background once scrolled past ~80px (a `.is-stuck` class from
JS). Brand mark at the inline-start, anchor nav (`החדרים · איך זה עובד ·
עדויות · שאלות · הזמנה`) in the middle, and a `הזמנת חדר` button at the
inline-end. Below `900px` the nav collapses into a drawer opened by a
hamburger — a real drawer with `aria-expanded`, focus trapped while open,
`Esc` to close, and the trigger refocused on close.

### 3.2 Hero — full viewport
The most important 800px on the site.

- Built in CSS: a **corridor in one-point perspective**. Two wall planes
  skewed toward a vanishing point, a floor plane, and a doorway at the end with
  light leaking around its edges. No images — gradients, transforms, and at
  most a few inline SVG shapes.
- A **bulb** hangs above the corridor: a small SVG lamp with a warm radial
  glow, swinging very slightly (8s, ±1.5deg, ease-in-out) and **flickering
  arrhythmically** — a real flicker is not a regular pulse, so the keyframes
  must be uneven (e.g. opacity steps at 0%, 41%, 42.5%, 43%, 61%, 62%, 100%).
- Grain (`--grain`) over the whole hero at ~.05 opacity, and a vignette that
  **breathes**: a 5.5s scale/opacity cycle, barely perceptible. If you can see
  it happening it is too strong.
- `h1` in `--display` at `--d1`, tracking `--d1-track`. Two lines:
  «מרתף 9» is the brand mark in the header, so the h1 is the line —
  «אתם נכנסים בשלושה.» / «זה לא אומר שתצאו ככה.» The second line in
  `--accent-lit`.
- Under it: the sub-line, then two CTAs — primary `בדקו זמינות` (scrolls to
  booking), ghost `מה מחכה בפנים` (scrolls to rooms).
- A row of three facts: `18+` · `45–60 דקות` · `3 חדרים`.
- Scroll cue at the bottom that fades out once the page moves.

### 3.3 Warning strip
Immediately after the hero, full-bleed, `--surface` with a 1px `--accent-deep`
rule top and bottom. A single line of plain text: who should not enter —
הריון, מחלות לב, אפילפסיה, קלאוסטרופוביה חריפה, השפעת אלכוהול או סמים.
Stated once, calmly, in `--ink` not `--ink-dimmer`. **Do not animate this and
do not marquee it.** It is the one element on the page that is not theatre.

### 3.4 The rooms — three cards
The centre of the site.

| חדר | משך | משתתפים | פחד | שחקנים |
|---|---|---|---|---|
| **החדר של אנה** — פסיכולוגי, שקט, ואף אחד לא צועק. | 50 דק׳ | 2–4 | 3/5 | 1 |
| **הסניטריום** — האגף הסגור. הכי רועש, הכי צפוף, הכי מהיר. | 60 דק׳ | 4–8 | 5/5 | 3 |
| **קו 6** — תחנה שנסגרה ב-1974, והרכבת עדיין עוברת. | 45 דק׳ | 2–6 | 4/5 | 2 |

Each card:
- A generated **still** at the top — an abstract CSS/SVG composition suggesting
  the room (a doorway with a light leak; a barred window; a tunnel mouth with a
  single approaching light). Monochrome plus one red. Abstract and atmospheric,
  never illustrative, and it must not look like clip art.
- Title in `--display` at `--d3`, one line of copy, then a meta row
  (`.num` for every figure).
- A **fear meter**: five ticks, filled ones in `--accent`, empty in `--line`.
  Give it `role="img"` and an `aria-label` reading `רמת פחד 3 מתוך 5` — five
  divs with no label is a screen-reader dead end.
- Hover/focus: the card lifts 4px, the still brightens slightly, and a red rule
  sweeps the inline-start edge. `:focus-within` must do the same as `:hover` —
  the keyboard user gets the same page.
- A `פרטים` disclosure expands the plot, what is in the room, and what is not
  (no real darkness below X, no separation of the group, etc.). Real
  `<button aria-expanded>` + region, not a checkbox hack.

### 3.5 Intensity — the signature interaction
A four-step control that changes what the page *is*.

Levels: **1 צופה** · **2 משתתף** · **3 מטרה** · **4 ללא רחמים**, plus a
separate `מגע פיזי` toggle (כן/לא, default לא).

Choosing a level:
- swaps the description and the list of what happens at that level,
- updates a warning line (level 4 + touch on = the strongest wording),
- and sets `--dread` on `:root` from `0` to `1`, which the stylesheet uses to
  drive vignette strength, grain opacity and the red saturation **of the whole
  page**. This is the point: the control does not describe the intensity, the
  page gets darker.

Keyboard: it is a radio group. Arrow keys move between levels, the selection
follows focus, and the state is announced (`aria-checked`). The chosen level
carries into the booking form (§3.9).

### 3.6 How it works — four steps
`1 בוחרים חדר` → `2 בוחרים עוצמה` → `3 מגיעים 15 דקות לפני` → `4 יוצאים`.
Numbers in `--display` at a large size, ghosted at low opacity behind each
step's text. A hairline connects them on desktop; they stack on mobile.

### 3.7 עדויות — testimonials as evidence
Not review cards. **Transcripts**: `--mono`, a case number, a date, an initial
instead of a name, and the quote. Parts of each are **redacted** — a black bar
over a phrase — and the bar lifts on hover/focus to show the text under it. Do
not redact anything that carries meaning the visitor needs; it is a joke about
the register, not an obstacle. Three or four of them, plus one honest negative
one — a page with only raves is a page nobody believes.

Add a stat band above them: `61% יוצאים בזמן` · `3 שחקנים בפנים` · `1,400
קבוצות מאז 2019`.

### 3.8 שאלות נפוצות
Accordion, one open at a time is fine, `<button aria-expanded>` + region, and
the panel animates on `grid-template-rows: 0fr → 1fr` (height auto does not
transition). Cover: האם נוגעים בנו, האם אפשר לצאת באמצע, האם חשוך לגמרי, האם
מתאים לקלאוסטרופוביה, מה קורה אם אנחנו מפחדים מדי, גילאים, ביטולים, חניה.

### 3.9 הזמנה — booking
Fields: חדר (pre-filled if the visitor arrived from a card), תאריך, שעה
(a slot grid, not a `<time>` input — offer 17:00–00:00 in half hours),
מספר משתתפים, עוצמה (carried from §3.5), שם, טלפון, הערות.

There is no backend. On submit, validate, then build a **WhatsApp link**
(`https://wa.me/9723905119 0?text=…`, URL-encoded) containing a readable Hebrew
summary of the booking, and show a confirmation panel with the summary and the
link as the primary button. Keep a `mailto:` as the secondary path. Validation
is inline, on blur and on submit, with `aria-invalid` and the message in the
field's `.err` — never an `alert()`.

### 3.10 Footer
Address, hours, phone, the accessibility line (`הנגשה: החדרים אינם נגישים
לכיסא גלגלים — דברו איתנו לפני ההזמנה ונמצא פתרון`), the 18+ line, and a
`תקנון` link that opens nothing (`href="#"` is acceptable here; it is a demo).

---

## 4. Type

| Role | Face | Size | Notes |
|---|---|---|---|
| h1 | Karantina | `--d1` | tracking `--d1-track`, line-height .88 |
| h2 | Karantina | `--d2` | line-height .95 |
| h3 / card titles | Karantina | `--d3` | |
| Body | Rubik | 16px / 1.65 | never below 14.5px |
| Meta, numbers, transcripts | IBM Plex Mono | 11–13px | letter-spacing .04–.16em |

Karantina is drawn tall, narrow and light — it needs to run large before it has
any weight, and it must never be used below ~20px, where it stops being
legible in Hebrew. Everything under that size is Rubik or Plex Mono.

---

## 5. Motion

1. **Reveal on scroll** — `.reveal` from the kit, via one `IntersectionObserver`
   in JS adding `.is-in`, staggered with `--delay` in a section. One observer
   for the page, `unobserve` after firing.
2. **The bulb** — swing + arrhythmic flicker, as in §3.2.
3. **Lights on (the safe word).** Bottom-inline-start of the viewport, a small
   fixed button: `החזיקו כדי להדליק את האור`. **Hold it for 2.5 seconds** — a
   ring fills as you hold — and `document.documentElement` gets
   `data-lights="on"`. `tokens.css` already carries the entire lit palette;
   the site fades (600ms) to bleached work-light, the corridor is revealed as
   plywood, gaffer tape and paint, and a short panel appears explaining that
   this is what the room actually is and that the safe word does exactly this
   in real life. It reverts after 12 seconds, or immediately via `כבו את האור`.
   Both mouse (`pointerdown`/`pointerup`) and keyboard (`Space`/`Enter` held)
   must work, and the hold must cancel cleanly if the pointer leaves.
4. `prefers-reduced-motion` — the kit already neutralises transitions. On top
   of that, **JS must check the media query** and skip the flicker, the swing
   and the breathing vignette entirely. A flicker is a real problem for people
   with photosensitivity; this is not a nice-to-have.

---

## 6. Rules for the build

- **Files.** `index.html`, `styles/site.css`, `src/main.js` (split into modules
  under `src/` if it helps — ES modules, relative paths). Do not touch
  `styles/tokens.css`, `styles/fonts.css` or `../shared/kit.css`; if you need a
  token that does not exist, add it in `site.css` under a clearly commented
  block at the top.
- Load order in `<head>`: `styles/fonts.css`, `styles/tokens.css`,
  `../shared/kit.css`, `styles/site.css`.
- `<html lang="he" dir="rtl">`. All copy Hebrew. `theme-color` `#08070A`.
  A real `<title>` and `<meta name="description">`, plus Open Graph tags.
- **No dependencies, no build step, no network at runtime, no media files.**
  Everything is CSS, inline SVG, or generated. Same rule the rest of this repo
  lives by.
- **Logical properties only** — `inline-start`, `margin-block`, `padding-inline`.
  A hard-coded `left` is a bug in an RTL page.
- Semantic HTML, exactly one `h1`, landmarks (`header`/`main`/`footer`/`nav`),
  every control keyboard-reachable with a visible focus ring, every icon-only
  button with an `aria-label`.
- Works at 360px with no horizontal scroll, and up to 1600px without the
  layout falling apart.
- No console errors or warnings.
- Comment the *why*, not the *what*, in the voice the rest of the repo uses.
- Verify before declaring done:
  `NODE_PATH=/opt/node22/lib/node_modules node tools/sites-smoke.mjs horror`
