# תיק עבודות — a portfolio, as one file

<div dir="rtl">

כותבים שורה לכל דבר שעשיתם — מה זה היה, בשביל מי, מתי ומה יצא — והאפליקציה
מפרקת את זה לעבודות, כותבת הסבר לכל אחת ומרכיבה קובץ HTML אחד: העיצוב והתמונות
בפנים, נפתח בלי אינטרנט, ואפשר לשלוח אותו במייל או להדפיס ל-PDF. אפשר גם למלא
הכול ידנית, ואפשר לתקן כל מה שיצא. הכול נשמר במכשיר; חוץ מהפסקה עצמה, אם בחרתם
שמודל שפה יקרא אותה, שום דבר לא נשלח לשום מקום.

</div>

The thing most people are missing is not a website. It is a document: a client
asks "יש לך תיק עבודות?" and the honest answer is a folder of screenshots and a
memory of what each one was for. This app takes the memory — typed as plainly as
it would be said out loud — and writes the two together into a file.

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

## The short way in

The first screen asks for three things nobody hesitates over — a name, a phone
number, an address if there is one — and then for one box of text: what you have
done, a line per thing. Press the button and the works are in the portfolio.

Two readers sit behind that button, and the screen says which one ran.

**With a key**, a language model reads the prose: it can tell that three
sentences are about the same website, and it fills the fields the person's own
sentences answer. The prompt's first instruction is not about the schema, it is
about not writing: copy their sentences, do not improve them, never invent a
number. A model asked to describe somebody's work will produce "הובלתי תהליך
עיצוב מקיף" about an evening on a friend's logo, and that sentence goes out with
their name on it.

**Without one** — which is most people — a list of rules does what rules can:
one line is one work, years and months come out by pattern, tools by a closed
list of names, and what a thing is and who it was for by the handful of Hebrew
words that say so. It does not guess, and it cannot tell that two sentences are
one work, so it says that on the screen and offers to split again after you have
pressed return between them.

Whichever ran, what comes back is a draft. Every field goes through the same
normalising a typed answer goes through, so a model that returns an invented
kind, a year in the fourth millennium or a `javascript:` link produces a legal
work with those parts dropped — never a document with them in it. The works are
listed by name on the screen when they land, what could not be filled is listed
too, and "בטל את ההוספה" removes exactly the works that were just added.

The one thing that leaves the device is the paragraph, to the vendor whose key
you entered. Not the name, not the phone, not the pictures, not the rest of the
portfolio — and the browser check asserts that against the actual request body.

## What it does

**Asks.** Fifteen questions per work, and exactly one of them has to be
answered: the name. The kind and the setting arrive with a default, the other
twelve are optional, and a work missing some of them is written anyway — the app
lists what it is missing by name rather than refusing. A name is the one that is
load-bearing, because it is the heading of that work's chapter, and a work
without one is the only thing that does not make it into the file at all.

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
    ai/read.js        the paragraph, read by a model, then normalised like a form
    ai/offline.js     the same job by rule, for the machines with no key
    export/           document model -> html | markdown | download
    ui/               quickstart, owner, works list, work editor, the file tab
    styles/           only what this app adds
```

It shares three things with FitAI and nothing else: the design system
(`src/styles/{fonts,tokens,base,components}.css`), six functions from
`src/core/dom.js` — `h`, `clear`, `qs`, `announce`, `modal`, `shrinkImage` —
and the model layer, which is `src/ai/client.js`, `src/ai/providers.js` and the
provider/model/key rows in `src/ui/aisettings.js`. No store, no engine, no data,
and no knowledge of FitAI's domain in either direction.

The model layer is shared for the same reason as the stylesheets and with the
same cost. It is a vendor table, an HTTP call and a key box — none of it is
about training plans — and the two apps genuinely want the same thing from it,
including the one key a person has already entered. What each app does NOT share
is the question: the prompt and the tool schema for reading a portfolio are in
`portfolio/src/ai/read.js`, and nothing about a work is known to FitAI.

The last two of those six are worth naming rather than filing under "element
helpers", because they are not small. `modal()` is a focus-trapped,
escape-closable overlay with its own tab cycling, and it is what stands between
a work and being deleted by a mis-tap. `shrinkImage()` is a decode, a canvas
resize and a re-encode, and it is the only reason a phone photograph fits in a
localStorage quota at all — the picture check in the browser test is, honestly,
a check on FitAI's code. A change to either lands in both apps, which is the
price of not having a second copy, and the browser test is where it would show.

The stylesheets are the repo's design language rather than one app's, and a
second copy of them would have drifted by the second change. The exported
document shares none of it and carries its own light, printable stylesheet,
because it is read on somebody else's screen and on paper.

## Testing it

```bash
node tools/portfolio-audit.mjs                          # grammar and containment
node tools/build-single.js portfolio/index.html dist/portfolio.html
node tools/portfolio-smoke.mjs --shots                  # the real app in Chromium
```

`portfolio-audit.mjs` is 479 assertions over the things a screenshot cannot see.
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

`portfolio-smoke.mjs` is 85 checks in Chromium. It fills the form, reloads to
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

The model path is exercised without a key and without a network: the request is
intercepted and answered with the shape a provider really returns, half of it
deliberately wrong. What that proves is the whole wiring — the body this app
builds, the tool call it pulls out, the normalising, the works landing in the
store — and it proves the sentence on the screen about what is sent, by reading
the request body and asserting the phone number is not in it.

Every assertion in both was watched fail before being trusted, and the counts
below are measured rather than estimated:

| mutation | what fails |
|---|---|
| `esc()` returns its argument unchanged | 65 assertions, and in the browser the preview's sandbox blocks the script the file would otherwise have run |
| one kind's gender flipped in `schema.js` | 7 — the four pronouns and the numerals that read the same field |
| `data:image/svg+xml` added to the image allowlist | 2 |
| `javascript:` added to the link allowlist | 7 |
| the Markdown link label left unescaped | 4 |
| anchors derived from the work's id again | 2 |
| the exporter allowed to read its own clock | 2 |
| the bidi strip removed from `cleanText` | 1 |
| the release call removed from the tab switch | the abandoned edit, in Chromium |
| the details screen stops reporting a failed save | the two save-failure checks, in Chromium |
| the model's work ids or images are trusted | 1 each |
| the offline reader splits on full stops | 2 |
| the word boundary comes off the Latin tool names | 1 — "JavaScript" also matches "Java" |

The first row is the one worth reading twice. Sixty-five is not a sign of a
thorough check; it is a sign that escaping is load-bearing in sixty-five places,
which is exactly why it is one function.

What none of them covers is whether the document is any good. A portfolio can
pass every check here and still be six works nobody would hire anybody for, or
an explanation that is grammatical and says nothing. Read the file before you
send it — the app can make sure it is a document, not that it is a case.

## Scope

It writes down what you tell it. It does not know your industry, cannot judge
whether a work belongs in the portfolio at all, and will not invent a
description of something you did not describe. Nothing here is sent anywhere,
which also means nothing checks the result but you.
