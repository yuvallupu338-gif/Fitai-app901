# מודל שפה מטומטם

<div dir="rtl">

רשת נוירונים קטנה שמנחשת את התו הבא, ומתאמנת בדפדפן על טקסט שאתה נותן לה. בלי
שרת, בלי מפתח API, בלי קרדיטים ובלי אינטרנט אחרי שהדף נטען — הכל רץ על המעבד
שלך. ברירת המחדל מתאמנת בערך מאה צעדים בשנייה, ותוך פחות מדקה כבר רואים אותה
עוברת מרעש אקראי לשורות שנראות כמו יומן אימונים.

שלושה מהטקסטים שהיא מתאמנת עליהם נכתבו במיוחד בשבילה על ידי מאה סוכנים שרצו
במקביל: 75 כתבו קוד, 25 כתבו שאלות ותשובות בעברית. אפשר גם לטעון מודל שכבר
אומן על הכל, בלחיצה אחת, ולראות מיד מה יוצא.

</div>

Open `lm/index.html` over http (ES modules do not load from `file://`):

```bash
npx http-server -p 8080 .      # or: python3 -m http.server 8080
open http://localhost:8080/lm/
```

Paste text, press **התחל אימון**, and watch the loss curve. `Space` starts and
stops it when the focus is not in a text box.

## What it actually is

A character-level neural language model, the 2003 shape: an embedding table, one
hidden layer, a softmax. In full:

```
last C characters  →  embedding table E     [V × D]
                   →  concatenate            [C·D]
                   →  hidden layer, tanh     [C·D × H] + bias
                   →  scores for every char  [H × V] + bias
                   →  softmax                probability of each next character
```

Training is cross-entropy against the character that actually came next, and
Adam over the gradients from a hand-written backward pass. At the defaults
(context 8, embedding 24, hidden 128, vocabulary 44) that is 31,436 weights. A
small language model today has a billion of them — thirty thousand times more.

The loss on screen is in nats per character: the model's own surprise at what
came next. `ln(V)` — 3.78 for the built-in text — is what a model that has
learned nothing scores, and it is the dashed line on the chart. Eight hundred
steps — about ten seconds — take it to 0.45 on text it has never seen.

What it cannot do is the more interesting half. It has no memory beyond its
context window, so with the default 8 it cannot keep a thought across two Hebrew
words. It has no notion of a word, a sentence or a fact — only which characters
follow which. It will spell perfectly and mean nothing, which is a good way to
see what the models that do mean something had to add.

## The knobs

| control | what it changes |
| --- | --- |
| **חלון הקשר** | characters of history. Longer sees more and costs linearly more per step. |
| **גודל ייצוג לאות** | numbers per character. This is where "ק and ר behave alike" gets stored. |
| **נוירונים בשכבה** | width of the hidden layer — how many patterns fit at once. |
| **גודל אצווה** | windows per step. Bigger is a steadier step and a slower one. |
| **קצב למידה** | how far each step moves. Live: lower it when the curve flattens. |
| **זרע אקראיות** | same seed, same settings, same run — exactly. |
| **טמפרטורה** | flattens or sharpens the distribution when writing. |
| **סינון מועמדים** | top-k: how many candidates survive at each character. |

Changing the model's shape rebuilds it from scratch; the learning rate,
temperature and top-k apply immediately.

## From the command line

The browser is where you watch it; the terminal is where you leave it running.
Same modules, several times faster with no frame budget to respect, and it can
be pointed at a file too big to paste:

```bash
node tools/lm-train.mjs                                     # the built-in corpus
node tools/lm-train.mjs --corpus code --steps 20000         # what the 75 code writers made
node tools/lm-train.mjs --in book.txt --out lm/book.json --steps 20000
node tools/lm-train.mjs --in book.txt --ctx 12 --hidden 256 --lr 0.01
```

`--corpus` takes `log`, `code`, `general` or `both`, and reads them through the
same registry the page's picker uses — so a loss measured here and a loss
measured there are measured on the same characters in the same order.

It prints the loss, the held-out loss and a writing sample as it goes, and
writes a model file. Load it with **טען מודל מקובץ** on the page and keep
training there, or just make it write.

## The model file

One JSON object: `format`, the vocabulary, the three shape numbers, and the five
weight tensors, rounded to six significant digits. At the defaults it is about
0.29 MB. Nothing is stored in the browser by itself — no localStorage, no cache,
nothing behind your back. Close the tab without saving and the training is gone.

That is deliberate. This page shares an origin with the FitAI apps, whose half
of that shared storage jar holds vendor API keys, and a toy that writes
megabytes of weights into the same quota would be a good way to break the app
next door.

One trained model ships with the page, in `lm/src/models/`, as a module rather
than as a `.json` file for the same reason the corpora are modules: the page
cannot fetch anything under `connect-src 'none'`, but it can import. Pressing
**טען מודל מאומן** imports it — and nothing before that, since it is about a
megabyte and most visitors would rather train their own. `tools/lm-train.mjs`
writes that module, and a small manifest beside it, whenever `--out` ends in
`.js`; the manifest is what the button reads to say how long the model trained
and how much it weighs, without loading it to find out.

## Checks

```bash
node tools/lm-check.mjs                                   # the arithmetic
node tools/lm-corpus.mjs --verify --audit                 # the corpora
NODE_PATH=/opt/node22/lib/node_modules node tools/lm-smoke.mjs   # the page
```

`lm-check.mjs` nudges individual weights by hand and compares the slope it
measures against the gradient `backward()` computed — every tensor, including a
batch built so the same character appears twice in one window, which is the case
that separates an accumulating embedding gradient from one that overwrites. A
wrong gradient still trains, just worse, so nothing else here would catch it. It
also asserts the model can memorise `abc` repeated, that a run is reproducible
from its seed, that a saved model writes the same text after loading, that top-k
sampling really stays inside the top k, and that a model file with a lie in it —
a length that does not match its shape, a weight that is a string, a hidden size
of a billion — is refused rather than allocated.

`lm-corpus.mjs --verify` loads the built corpora, checks them against their own
manifest, and asserts the Hebrew half still holds its question-and-answer shape.
`--audit` splits the code half back into the snippets it was assembled from and
hands each one to a real parser — `node --check` for JavaScript, `py_compile`
for Python, `bash -n` for shell, `JSON.parse` for JSON — because "the agents
were told to write valid code" is not evidence that they did.

`lm-smoke.mjs` drives the real page: that the loss on screen falls below random
guessing, that a click lands while training is running, that saving produces a
file the page can load back and resume training from at the loss it left off,
that choosing a corpus imports it and that nothing imports it before then, that
the loss curve survives the window being resized, and that the whole thing
raises no CSP violation. The page's policy is checked alongside its neighbours
by `tools/csp-check.mjs`.

## Layout

```
lm/
  index.html
  src/
    main.js       the page: wiring, the frame-budget training loop, files
    model.js      forward, backward, Adam, sampling, the file format
    tokenizer.js  the character vocabulary, batching, the held-out split
    corpus.js     the built-in text, generated on the spot
    chart.js      the loss curve
    rng.js        a seeded generator, so a run can be repeated
    corpora/      what the hundred agents wrote: index.js, code.js,
                  general.js, manifest.js — the last three generated
    models/       one trained model as a module, and its manifest — generated
    styles/lm.css
```
