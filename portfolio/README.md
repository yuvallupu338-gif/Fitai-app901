# תיק עבודות — a portfolio, as one file

<div dir="rtl">

עונים על כמה שאלות לכל עבודה — מה זה היה, בשביל מי, מה היה צריך, מה עשיתם ומה
יצא — והאפליקציה כותבת מזה תיק עבודות ומייצאת אותו כקובץ HTML אחד: העיצוב
והתמונות בפנים, נפתח בלי אינטרנט, ואפשר לשלוח אותו במייל או להדפיס ל-PDF.
הכול נשאר במכשיר; שום דבר לא נשלח לשום מקום.

</div>

The thing most people are missing is not a website. It is a document: a client
asks "יש לך תיק עבודות?" and the honest answer is a folder of screenshots and a
memory of what each one was for. This app asks the questions that turn the
second half into text, and writes the two together into a file.

## Running it

Plain ES modules, no build step and no dependencies, same as everything else
here. It needs to be served over http (ES modules do not load from `file://`):

```bash
npx http-server -p 8080 .     # or: python3 -m http.server 8080
open http://localhost:8080/portfolio/
```

Or open the prebuilt single file, which works straight off the disk:

```bash
open dist/portfolio.html
```

## What it does

**Asks.** Fifteen questions per work, of which two are required — a name and a
kind. The rest are optional and the app says which ones it is missing rather
than refusing to write without them. The order is the order somebody would say
it out loud, not the order it is stored in.

**Writes.** Every work gets an opening paragraph the app composes: what kind of
thing it was, who it was for, when, what your part in it was, and whether you
were alone. "זו אפליקציה שבניתי ללקוח מספרת רון, בין מרץ למאי 2024. התפקיד שלי
בה היה עיצוב ופיתוח. עבדתי עליה בצוות." Four facts from four closed fields —
and nobody writes that paragraph about their own work, which is why portfolios
usually open with a title and then a wall of "אז ככה".

What you typed is not rewritten. It appears under the question it answers, in
your words. A paraphrase of a sentence the app cannot read is a guess about
somebody's job printed in a document they will send to an employer, and there is
no version of that worth the risk. `src/engine/write.js` holds the whole
division: derived sentences on one side, framing on the other, nothing in
between.

**Counts.** The paragraph at the top — how many works, which years they span,
what kinds, which tools recur — is arithmetic over the works themselves. It says
nothing about the person. A portfolio that told an employer its owner is
"creative and detail-oriented" on the evidence of six form fields would be lying
in the app's voice, and the app has no standing to do that.

**Exports.** One HTML file with the stylesheet and the photographs inside it,
plus a Markdown version for pasting into a CV or a LinkedIn "about", plus a JSON
backup that loads back in. The preview on screen is not a rendering of the
portfolio — it is the exported file, in a frame, byte for byte what the download
button writes.

## The file

It carries no script. Not a handler, not an inline `onclick`. The receiver's
browser has nothing to run, and the "blocked content" bar that makes a document
look broken never appears.

Every value that came from a person is escaped through one function. Links are
allowlisted to four schemes — `https`, `http`, `mailto`, `tel` — and images to
four base64 MIME types. `data:image/svg+xml` is deliberately not one of them: an
SVG is a document with script in it. The list is an allowlist rather than a
blocklist of the dangerous ones, because a blocklist that has heard of
`javascript:` has usually not heard of `data:text/html`.

It prints. A portfolio is asked for as a PDF at least as often as it is opened
in a browser, and Ctrl+P on this file is the whole PDF pipeline — which is why
the document is ink on white rather than the app's own dark chrome, why headings
are told not to end a page alone, and why link addresses are printed next to
their text on paper, where a link is only its text.

Its name is the one ASCII string in the app, and that is not an aesthetic
choice. A `download` attribute holding Hebrew is not merely displayed
differently on a machine whose locale is not UTF-8 — Chromium discards the whole
name and saves the file as `download`, with no extension, which is a portfolio
that does not open when double-clicked. So the download is
`portfolio-2026-08-12.html` (or `portfolio-Noa-Bar.html`, when the name is
already Latin) and the person's own name is where it belongs: the first line of
the document and the title in the browser tab.

## The Hebrew

Generated Hebrew gives itself away in four words, and all four are handled in
`src/data/schema.js`, next to the nouns they agree with.

**Gender.** "אתר" is masculine and "אפליקציה" is feminine, so it is "זה אתר" but
"זו אפליקציה", "התפקיד שלי בו" but "בה", "עבדתי עליו" but "עליה". Each of the
fifteen kinds carries its gender, its plural and the first-person verb that goes
with it — "אתר שבניתי", "טקסט שכתבתי", "אירוע שהפקתי".

**The speaker's gender is never asked**, because every generated sentence is
built in first-person past tense, which is the one Hebrew tense that does not
decline for it. "בניתי" is what a man and a woman both write.

**Numerals decline too**, and one is a special case: "עבודה אחת" puts the
numeral after the noun, "שתי עבודות" before it, and past ten they are digits.

**Prefixes attach**, except when they cannot: "במרץ" and "ופיתוח" are one word,
"ב-2024" and "ו-CSS" take a maqaf. The rule is about the first character of the
next word, not the language of the sentence.

**Bidi overrides are stripped** on the way in. U+202A–U+202E and U+2066–U+2069
are invisible, survive a copy-paste out of a PDF or a chat, and reorder every
line after them in a document that is already right-to-left. LRM and RLM are
left alone — those are the marks a person uses on purpose.

## Storage

One `localStorage` key, `portfolio.v1`, on the device. No account, no sync, no
server, and nothing leaves the machine unless a download button is pressed —
which is what makes it reasonable to write down what you did at a job you have
not left yet, with the client's name in it.

The cost is two failure modes, both reported rather than thrown. Storage can be
refused outright (private browsing, `file://`, a locked-down browser), which the
app warns about before the first question rather than after the sixth work. And
it can fill up: localStorage holds a few megabytes and a phone photograph is
several, so pictures are resized to 1400px and capped at six per work, and a
quota error says which of the two problems it is — "remove a photograph" is
useless advice when the real problem is that storage is off.

## Layout

```
portfolio/
  index.html
  src/
    app.js            boot and the three tabs
    core/store.js     the portfolio on the device, and the backup
    data/schema.js    what a work is, and the grammar attached to it
    engine/write.js   the explanation, and the paragraph counted off the works
    export/           document model -> html | markdown | download
    ui/               owner, works list, work editor, the file tab
    styles/           only what this app adds
```

It shares the repo's design system — `src/styles/{fonts,tokens,base,components}.css`
and `h()` from `src/core/dom.js` — and nothing else. No store, no engine, no
data, and no knowledge of FitAI whatsoever in either direction. Those four
stylesheets are the repo's design language rather than one app's, and a second
copy of them would have drifted by the second change; the exported document
shares none of it and carries its own light, printable stylesheet, because it is
read on somebody else's screen and on paper.

## Testing it

```bash
node tools/portfolio-audit.mjs                          # grammar and containment
node tools/build-single.js portfolio/index.html dist/portfolio.html
node tools/portfolio-smoke.mjs --shots                  # the real app in Chromium
```

`portfolio-audit.mjs` is 329 assertions over the things a screenshot cannot see.
The first is grammar: "זה אפליקציה שבניתי" looks exactly as correct as "זו
אפליקציה שבניתי" to anything that is not reading it, so the cases are named in
the check — one line per kind, with the demonstrative and both pronouns written
out. They are written out rather than read from `schema.js`, because a check that
asks the same table its subject asks can only ever confirm the two agree.

The second is containment. Every free-text field, every link and every image URL
is fed the things that break documents — a closing script tag, an event handler,
a `javascript:` URL, an SVG data URL, a bidi override — and the output is checked
for what survived. The assertion that generalises is a tag count, not a word:
an answer containing the word `onerror` is escaped into an alt attribute and is
still, correctly, that word. The question was never whether those characters
appear, it is whether the text minted an element.

It also covers the two failures that are not about text at all: a device with no
room left says "remove a photograph" and a browser with storage switched off says
something else, and in both cases the answer that was being typed survives the
failed save — the work in the form at that moment is worth more than the
invariant.

`portfolio-smoke.mjs` is 49 checks in Chromium. It fills the form, reloads to
prove any of it was stored, adds and reorders and deletes a work, puts a real
PNG through the picture path — a File, a canvas, a resize and a re-encode, none
of which exist in Node — then downloads the file, closes the server, and opens
the download over `file://`. There it asserts against a real DOM that the
document has no script elements, that nothing in it opened a dialog, that the
`<script>` tag typed into the title came out as text, that the photograph is
embedded rather than linked, and that the page asks the network for nothing. Last
it opens `dist/portfolio.html` the same way, where the app itself has no server
and usually no storage, and checks that it boots and says so.

It also checks the abandoned edit: type, switch tabs before the save lands, and
the words are still there. That check is the reason screens are released rather
than painted over.

Every assertion in both was watched fail before being trusted. Bypassing `esc()`
puts a script tag in the file and fails four checks; flipping one gender in
`schema.js` fails four more; allowing SVG images, allowing `javascript:` links,
removing the bidi strip, and letting the exporter read its own clock each fail
the check written for them; and removing the release call at the tab switch
loses the abandoned edit.

What none of them covers is whether the document is any good. A portfolio can
pass every check here and still be six works nobody would hire anybody for, or
an explanation that is grammatical and says nothing. Read the file before you
send it — the app can make sure it is a document, not that it is a case.

## Scope

It writes down what you tell it. It does not know your industry, cannot judge
whether a work belongs in the portfolio at all, and will not invent a
description of something you did not describe. Nothing here is sent anywhere,
which also means nothing checks the result but you.
