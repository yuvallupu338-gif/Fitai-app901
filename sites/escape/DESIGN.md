# אניגמה — design brief

Four escape rooms. Sixty minutes, two to six players, one door.

This document is the design. Where it names a size, a token, a state or a
behaviour, that is a decision. Where it does not, use judgement and match the
register.

---

## 1. The idea the design is carrying

An escape room is **not** a haunted house, and the fastest way to make this
site bad is to borrow the horror site's clothes. Nobody here is frightened.
What is being sold is *being clever with your friends for an hour*.

So the page is **dark but warm** — a study at night. Lamp light, brass
fittings, and paper. Paper is the motif: a real escape room hands you
documents, and the light parchment surfaces on this dark page are those
documents. Reach for `--paper` whenever the content is something the room
would physically give you — a clue, the rules, the booking summary.

Two rules that keep it coherent:

- **Green means solved.** `--solved` is the colour a lock turns when it opens.
  It is never used decoratively, or it stops meaning that.
- **Brass is a material, not a fill.** Anything brass gets `--lip` along its
  top edge and a gradient, so it reads as turned metal catching lamp light
  rather than a yellow rectangle.

---

## 2. Brand

| | |
|---|---|
| Name | **אניגמה** — חדרי בריחה |
| Line | «שישים דקות. דלת אחת. אתם.» |
| Address | רחוב לילינבלום 24, תל אביב |
| Phone | 03-7284460 (WhatsApp link — see §6) |
| Hours | א׳–ה׳ 10:00–23:00 · ו׳ 09:00–15:00 · שבת 19:00–00:00 |
| Since | 2017 — **9 שנים** (this number is load-bearing, see §3.5) |

**Voice.** Warm, dry, confident. It may be funny; it may never be zany. It
respects the visitor's intelligence, because the visitor is here to prove
theirs.

---

## 3. Content architecture

### 3.1 Header
Sticky, `--header-h`, transparent over the hero, gaining a `--surface`
background + blur + hairline after ~80px (`.is-stuck` from JS). Brand mark,
anchor nav (`החדרים · החידה · איך זה עובד · ביקורות · הזמנה`), and a brass
`הזמינו חדר` button. Below 900px: a drawer with `aria-expanded`, focus trapped
while open, `Esc` closes, trigger refocused after.

### 3.2 Hero
- `h1` at `--d1` in Frank Ruhl Libre: «שישים דקות. דלת אחת. אתם.»
- Sub-line, then the **live clock** (§5.2), then two CTAs: brass primary
  `בחרו חדר`, ghost `נסו את החידה` (jumps to §3.5).
- A fact row: `4 חדרים` · `2–6 שחקנים` · `47% יוצאים בזמן`.
- Background: a warm lamp glow from above (`--accent` at very low alpha), a
  dark vignette at the edges, and a faint engraved-grid texture built from two
  repeating-linear-gradients — a drafting table, not a neon grid.

### 3.3 החדרים — four cards
The core of the site. Grid, `--min: 300px`.

| חדר | משך | שחקנים | קושי | יוצאים בזמן |
|---|---|---|---|---|
| **בית המרקחת של ד״ר וייס** — 1926, מרשם אחד לא נרשם ביומן. | 50 דק׳ | 2–4 | 2/5 | 63% |
| **המגדלור** — שומר המגדלור לא ענה בקשר כבר אחד עשר ימים. | 60 דק׳ | 2–5 | 3/5 | 47% |
| **כספת 12** — יש לכם שעה עד שהמשמרת מתחלפת. | 60 דק׳ | 4–6 | 4/5 | 31% |
| **תחנת קפלר** — התחנה במסלול דועך. מערכת אחת עוד עובדת. | 70 דק׳ | 2–6 | 5/5 | 19% |

Each card carries:
- a generated **still** — abstract CSS/SVG suggesting the room (a lighthouse
  beam sweeping the dark, a vault door's radial bolts, a porthole onto a
  planet, apothecary shelving). Ink + brass, no clip art;
- title (`--d3`), one line of plot, a meta row with `.num` figures;
- a **difficulty meter** of five padlock glyphs, filled in brass —
  `role="img"` with `aria-label="דרגת קושי 4 מתוך 5"`;
- a **success ring**: a `conic-gradient` donut showing the escape rate with the
  number in the middle, `--solved` above 50% and `--accent` below;
- a `הצצה לתסריט` disclosure (`<button aria-expanded>` + region) with three or
  four more lines and what the room does *not* contain (no darkness, no
  crawling, no separation — the questions people actually ask);
- a `הזמינו` button that scrolls to booking **with the room pre-selected**.

Hover *and* `:focus-within`: 3px lift, the brass rule brightens, the still's
beam/light element animates once.

### 3.4 למי זה מתאים
Four short cards: `גיבוש צוותים`, `ימי הולדת`, `דייט`, `משפחות עם ילדים 10+`.
One line each, a small line-art icon in brass. Do not oversell; this section is
scanned, not read.

### 3.5 החידה — the signature interaction
**A four-dial brass combination lock, drawn in CSS, whose code is hidden in
this page.** Solve it and get 10% off.

- Four dials, each 0–9. Each is a real control: click/tap the up and down
  arrows, drag vertically, **or** focus it and use ↑/↓ (and Home/End). The
  digits scroll with the mechanical easing (`--ease-mech`). Every dial needs
  an accessible name (`ספרה ראשונה`) and `aria-valuenow`/`role="spinbutton"`.
- Beside the lock, four clues on **parchment cards**:
  1. «כמה חדרים יש לנו?» → 4
  2. «מספר השחקנים המינימלי בבית המרקחת של ד״ר וייס» → 2
  3. «משך תחנת קפלר בדקות, חלקי עשר» → 7
  4. «כמה שנים אנחנו פותחים דלתות» → 9
  The answers are all stated elsewhere on the page. That is the point — the
  puzzle makes someone read the site.
- Wrong combination: nothing happens until all four dials have moved at least
  once, then a `בדקו שוב` hint appears; after two wrong full attempts, offer a
  `רמז` button that highlights §3.3. Never scold.
- **Correct (4-2-7-9):** the bolt slides, the shackle pops open with a short
  spring, the whole panel washes `--solved`, and a coupon appears:
  code **`ENIGMA10`**, «10% הנחה על ההזמנה הבאה». The coupon field in the
  booking form fills itself, and the state persists in `localStorage`
  (key `enigma.solved`) so a reload does not take the prize back. A solved
  lock stays solved on return visits, with a `פתרתם את זה` state.
- Announce the win in a `role="status"` region — the animation is invisible to
  a screen reader otherwise.

### 3.6 Stat band
`4 חדרים` · `9 שנים` · `11,300 קבוצות` · `41% שיעור יציאה ממוצע`. Numbers in
`--display`, count up once on entry (skip the count under reduced motion —
just show the final number).

### 3.7 איך זה עובד
Four steps: `בוחרים חדר` → `מזמינים אונליין` → `מגיעים 10 דקות לפני` →
`שישים דקות`. Numerals ghosted large behind each step, hairline connector on
desktop, stacked on mobile.

### 3.8 ביקורות
Three or four, on **parchment**, set like a signed note: the quote in the body
face, then a name, the room they played, and whether they got out — «יצאו
ב-54:12» or «לא יצאו». Include at least one that did not get out and loved it;
it is more persuasive than another five stars. A small brass "stamp" mark in
the corner of each card, drawn in SVG.

### 3.9 הזמנה
Fields: חדר (pre-fillable from a card), תאריך, שעה (a **slot grid** of buttons
— 10:00–22:00 every 90 minutes — not a native time input; the selected slot is
a pressed brass state with `aria-pressed`), מספר שחקנים (2–6 stepper),
קוד קופון (auto-filled by §3.5), שם, טלפון, הערות.

No backend. On submit: validate inline (`aria-invalid`, message in `.err`,
never `alert()`), then render a **parchment booking summary** — this is the
document the room hands you — and a WhatsApp link
(`https://wa.me/972372844 60?text=…`, URL-encoded, readable Hebrew summary) as
the primary action, `mailto:` secondary.

### 3.10 שאלות + footer
Accordion FAQ (same mechanics as everywhere: `<button aria-expanded>` +
region, `grid-template-rows: 0fr → 1fr`): האם צריך ידע מוקדם, מה אם לא נצליח,
האם אפשר להצטרף לקבוצה, גילאים, ביטולים, חניה, האם מפחיד (**no**, and say so
plainly — it is the single most common question and the answer sells the
room). Footer: address, hours, phone, accessibility line, and a link to the
horror site next door as `גם אנחנו: מרתף 9` (`../horror/`).

---

## 4. Type

| Role | Face | Notes |
|---|---|---|
| h1 | Frank Ruhl Libre 900 | `--d1`, line-height 1.05 |
| h2 | Frank Ruhl Libre 700 | `--d2` |
| h3 | Frank Ruhl Libre 700 | `--d3` |
| Body | Assistant 400/600 | 16px / 1.65 |
| Clock, dials, codes, meta | IBM Plex Mono | tabular numerals, always |

Hebrew serifs get muddy when they are small and tight. Frank Ruhl never goes
below 19px here, and never gets negative tracking.

---

## 5. Motion

1. **Reveal on scroll** — kit `.reveal`, one `IntersectionObserver`, staggered
   via `--delay`, `unobserve` after firing.
2. **The clock.** A large `MM:SS` in Plex Mono in the hero, counting down from
   `60:00` in real time from page load, with the caption «השעון שרץ בכל חדר.
   זה בדיוק מה שאתם רואים בפנים.» Under `10:00` it turns `--danger` and the
   colon starts blinking at 1Hz. At `00:00` it stops on «נגמר הזמן» with a
   `התחילו מחדש` button. Use a timestamp diff, not `setInterval` accumulation
   — an interval drifts, and a clock that is wrong is worse than no clock.
   Pause it when the tab is hidden (`visibilitychange`).
3. **The lock** — dial rotation, bolt slide, shackle pop, as in §3.5.
4. Brass buttons: `--lip` + gradient, 1px lift on hover, press down 1px.
5. `prefers-reduced-motion`: the kit kills transitions; JS must additionally
   skip the count-up, the beam sweep and the colon blink. The clock still
   counts (it is information, not decoration).

---

## 6. Rules for the build

- **Files.** `index.html`, `styles/site.css`, `src/main.js` (split into ES
  modules under `src/` as needed, relative paths). Do not edit
  `styles/tokens.css`, `styles/fonts.css` or `../shared/kit.css`; missing
  tokens go in a clearly commented block at the top of `site.css`.
- Head order: `styles/fonts.css`, `styles/tokens.css`, `../shared/kit.css`,
  `styles/site.css`.
- `<html lang="he" dir="rtl">`, all copy Hebrew, `theme-color` `#091419`,
  real `<title>`, `<meta name="description">`, Open Graph tags.
- **No dependencies, no build step, no network at runtime, no media files.**
- **Logical properties only.** A hard-coded `left` is a bug in an RTL page.
- Semantic HTML, one `h1`, landmarks, keyboard reachable everything, visible
  focus, `aria-label` on every icon-only control.
- 360px with no horizontal scroll; holds together to 1600px.
- No console errors or warnings.
- Comment the *why*, in the repo's voice.
- Verify before declaring done:
  `NODE_PATH=/opt/node22/lib/node_modules node tools/sites-smoke.mjs escape`
