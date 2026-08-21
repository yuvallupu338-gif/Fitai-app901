#!/usr/bin/env node
/*
 * build-single.js — bundles a whole app into one self-contained HTML file, so
 * it can be opened straight off the disk (file://) exactly like the original
 * reference document. On a phone that is the difference between "a website you
 * need a server for" and "a file you can keep".
 *
 * It is a deliberately small bundler that understands only the module syntax
 * these apps actually use. Anything else makes it stop loudly rather than emit
 * a broken file.
 *
 * The entry point and the stylesheets are read out of the HTML itself rather
 * than hard-coded, so it can build either app in this repo:
 *
 *   node tools/build-single.js                                  -> dist/fitai.html
 *   node tools/build-single.js backrooms/index.html dist/backrooms.html
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Things worth saying at the end of a build that are not failures. */
const notes = [];

/*
 * Dynamic imports that are followed and inlined rather than refused.
 *
 * The refusal is right in general: this bundler flattens a static graph and
 * cannot resolve a specifier decided at runtime, so an unhandled one becomes a
 * blank screen. But a dynamic import whose specifier is a plain relative string
 * is perfectly resolvable — it is dynamic to defer a download in the served app,
 * not because the target is unknown.
 *
 * That is what src/ai/local.js does with the model library: six and a half
 * megabytes that most sessions never touch, so the served app fetches it only
 * when somebody switches the local model on. The single file has no such
 * option — there is no vendor directory beside a file on somebody's desktop —
 * so here it is inlined and the import() call is rewritten to hand back the
 * module that is already in the registry.
 *
 * The cost is the whole point and is worth stating: it takes the download from
 * under a megabyte to about seven, for everybody, including people who never
 * open the model settings. It buys the thing that was asked for — one file that
 * runs a model with no repository to clone.
 */
const INLINE_DYNAMIC = [/\/vendor\/web-llm\.js$/];

/* Positional args, with the FitAI build as the default so the existing
 * invocation keeps working untouched. */
const HTML_IN = process.argv[2] && !process.argv[2].endsWith('.js')
  ? process.argv[2] : 'index.html';
const HTML_OUT = process.argv[3]
  || (HTML_IN === 'index.html' ? 'dist/fitai.html' : 'dist/bundle.html');
const HTML_DIR = dirname(resolve(ROOT, HTML_IN));

const htmlSrc = readFileSync(resolve(ROOT, HTML_IN), 'utf8');

/* Entry module and stylesheets, taken from the page that actually loads them —
 * a hard-coded list silently goes stale the moment a stylesheet is added. */
const entryMatch = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(htmlSrc);
if (!entryMatch) throw new Error(`${HTML_IN}: no <script type="module" src="…"> to use as an entry`);
const ENTRY = relative(ROOT, resolve(HTML_DIR, entryMatch[1]));

const CSS_FILES = [...htmlSrc.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((m) => resolve(HTML_DIR, m[1]));

const seen = new Map();
const order = [];

function key(abs) {
  return relative(ROOT, abs).split('\\').join('/');
}

const stack = [];

function collect(abs) {
  const k = key(abs);
  /*
   * null marks "being collected". Meeting one again is an import cycle, and a
   * cycle is the one thing this bundler cannot flatten: it emits each module as
   * an IIFE that destructures its dependencies out of the registry, so whichever
   * half of the cycle is written first reads an entry that does not exist yet
   * and the whole bundle dies on load.
   *
   * Real ES modules survive cycles through hoisting and live bindings, which is
   * why one can sit in a served app for months looking perfectly healthy. This
   * build is where it surfaces, so it is where it has to be reported — by name,
   * with the loop spelled out, rather than as a blank page and a stack trace
   * pointing at line 8922 of a generated file.
   */
  if (seen.has(k)) {
    if (seen.get(k) !== null) return;      // already collected, nothing to do
    const loop = stack.slice(stack.indexOf(k)).concat(k).join(' -> ');
    throw new Error(`import cycle: ${loop}`);
  }
  seen.set(k, null);
  stack.push(k);

  const src = readFileSync(abs, 'utf8');
  reject(src, k);

  const deps = [];
  /* `[\s\S]*?` inside the braces so a named import may wrap over several
   * lines, which is how anything importing more than three symbols is
   * actually written. The `m` flag still anchors the statement to its own
   * lines, so this cannot swallow unrelated code. */
  const importRe = /^[ \t]*import\s+(?:([\w$]+)|\*\s+as\s+([\w$]+)|\{([\s\S]*?)\})\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm;
  let m;
  while ((m = importRe.exec(src))) {
    const spec = m[4];
    if (!spec.startsWith('.')) throw new Error(`${k}: bare import "${spec}" — not bundleable`);
    // m[1] is a default import. export default is rejected below, so one here
    // is a mistake — and left unchecked it emitted `const { undefined } = …`.
    if (m[1]) throw new Error(`${k}: default import of "${spec}" — this repo uses named exports only`);
    deps.push({ ns: m[2], named: m[3], spec, raw: m[0] });
  }

  /*
   * Dynamic imports of a known file are dependencies like any other; they are
   * collected here so the module is in the registry before anybody awaits it.
   */
  const lazy = [];
  for (const m of withoutComments(src).matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (INLINE_DYNAMIC.some((re) => re.test(m[1]))) lazy.push({ spec: m[1], raw: m[0] });
  }

  for (const d of deps.concat(lazy)) collect(resolve(dirname(abs), d.spec));

  stack.pop();
  seen.set(k, { abs, src, deps, lazy });
  order.push(k);
}

/*
 * Strip comments and string bodies before pattern-matching source.
 *
 * Every check below asks "does this file do X", and prose explaining why a file
 * does *not* do X contains the same words. chat.js was refused for a dynamic
 * import that existed only in a comment describing where the real one lives.
 */
/*
 * Comments out, strings intact.
 *
 * code() below also blanks string literals, which is right for asking "does this
 * file call X" and exactly wrong for asking "what does it import" — the
 * specifier IS a string literal, so the pattern matched import('') every time
 * and the model library silently never got bundled.
 */
function withoutComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function reject(raw, k) {
  const src = code(raw);
  if (/\bexport\s+default\b/.test(src)) throw new Error(`${k}: export default is not supported`);
  if (/\bexport\s+\*/.test(src)) throw new Error(`${k}: export * is not supported`);
  /*
   * A dynamic import is allowed through rather than bundled.
   *
   * It used to be refused outright, and for every module here that was right:
   * this bundler flattens a static graph and cannot resolve a specifier decided
   * at runtime. But src/ai/local.js loads a six-and-a-half megabyte model
   * library on demand, and inlining that would triple the single file for a
   * feature the single file cannot run anyway — the model weights are another
   * gigabyte and are not in it either.
   *
   * So the call is left as it stands. In the bundle it resolves against a
   * vendor/ directory that is not there, the import rejects, and local.js
   * catches it and reports that the local model needs the full app. That is the
   * correct behaviour, and it is only correct because the module was written to
   * expect it — which is why this is a warning rather than silent permission.
   */
  for (const m of withoutComments(raw).matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!INLINE_DYNAMIC.some((re) => re.test(m[1]))) {
      throw new Error(`${k}: dynamic import of "${m[1]}" is not supported`);
    }
  }
  if (/\bimport\s*\((?!\s*['"])/.test(src)) {
    throw new Error(`${k}: dynamic import with a computed specifier is not supported`);
  }
  if (/\bimport\.meta\b/.test(src)) throw new Error(`${k}: import.meta is not supported`);
}

/*
 * `import { a as b }` is not `const { a as b }`.
 *
 * Destructuring renames with a colon; `as` is import syntax and nothing else.
 * Emitting it verbatim produces a file that parses right up to the first
 * aliased import and then dies with "Unexpected identifier 'as'" — and because
 * the bundle is one inline script, that one token takes the whole app down with
 * a blank page. Every app in this repo before TomorrowAI imported each symbol
 * under its own name, so this sat here working perfectly for two builds.
 */
function destructure(named) {
  return named
    .replace(/\s+/g, ' ')
    .split(',')
    .map((piece) => {
      const t = piece.trim();
      if (!t) return null;
      const alias = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t);
      return alias ? `${alias[1]}: ${alias[2]}` : t;
    })
    .filter(Boolean)
    .join(', ');
}

function transform(k, mod) {
  let out = mod.src;

  // imports -> registry destructuring
  for (const d of mod.deps) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${destructure(d.named)} } = __m[${JSON.stringify(target)}];`;
    out = out.replace(d.raw, line);
  }

  /*
   * import('./x.js') becomes a resolved promise over the registry entry. It
   * stays a promise so every await, .then and .catch around it still behaves —
   * rewriting it to a bare object would break the caller's error handling on
   * the one path that has any.
   */
  for (const d of mod.lazy || []) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    out = out.split(d.raw).join(`Promise.resolve(__m[${JSON.stringify(target)}])`);
  }

  const exported = new Set();

  // export [async] const/let/function/class -> plain declaration, remembered.
  // `async` matters: the vision client is the one module here that awaits a
  // network call, and without it the bundler silently left the keyword behind
  // and then failed on its own leftover-export check.
  out = out.replace(
    /^[ \t]*export\s+(?:async\s+)?(const|let|var|function|class)\s*\*?\s*([\w$]+)/gm,
    (whole, kind, name) => {
      exported.add(name);
      return whole.replace(/export\s+/, '');
    },
  );

  // export { a, b as c }
  out = out.replace(/^[ \t]*export\s*\{([^}]*)\};?[ \t]*$/gm, (whole, body) => {
    for (const piece of body.split(',')) {
      const t = piece.trim();
      if (!t) continue;
      const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t);
      exported.add(as ? `${as[2]}:${as[1]}` : t);
    }
    return '';
  });

  if (/^[ \t]*export\b/m.test(out)) {
    throw new Error(`${k}: leftover export statement the bundler did not understand`);
  }

  const assigns = Array.from(exported).map((e) => {
    const [name, local] = e.includes(':') ? e.split(':') : [e, e];
    return `    ${JSON.stringify(name)}: ${local},`;
  }).join('\n');

  return `__m[${JSON.stringify(k)}] = (function () {\n${out}\n  return {\n${assigns}\n  };\n})();`;
}

collect(resolve(ROOT, ENTRY));

const bundle = [
  '(function () {',
  '"use strict";',
  'const __m = {};',
  ...order.map((k) => transform(k, seen.get(k))),
  '})();',
].join('\n\n');

const css = CSS_FILES.map((f) => readFileSync(f, 'utf8')).join('\n\n');

/* The same source the entry point and stylesheets were discovered in — reading
 * index.html again here is how the first version of this emitted FitAI's shell
 * wrapped around the Backrooms bundle. */
/*
 * Line endings normalised before anything is hashed or written.
 *
 * The HTML parser converts CRLF and lone CR to LF while tokenising, so the text
 * a <script> element ends up holding is not the bytes that were on disk. Hash
 * the bytes and the browser computes a different digest from the normalised
 * text, refuses to run the script, and reports a CSP violation that looks like
 * the bundler emitted the wrong hash.
 *
 * It surfaced when the model library was vendored in: 210 carriage returns
 * inside six and a half megabytes, and the whole single-file build was a blank
 * page. Everything written here is authored with LF, so this had never mattered
 * before and would have been invisible until the next file arrived with
 * Windows line endings in it.
 */
const lf = (s) => s.replace(/\r\n?/g, '\n');

const styleBody = lf(`\n${css}\n`);
const scriptBody = lf(`\n${bundle}\n`);

/* The page carries a Content-Security-Policy that says script-src 'self' and
 * style-src 'self' — correct for the served app, and fatal here, because this
 * build turns both into inline blocks. They cannot be 'self' and they must not
 * be 'unsafe-inline' (that would hand the single file the very hole the served
 * app was hardened against), so they are named by hash: exactly these two
 * blocks run, and nothing else — not an injected handler, not another script.
 *
 * 'self' is also meaningless once the file is opened from file://, which is the
 * whole point of this build, and every asset is already a data: URI. */
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
/*
 * Swap 'self' for the hash and leave every other token alone.
 *
 * This used to rewrite the whole directive, which quietly dropped anything else
 * in it. The local model needs 'wasm-unsafe-eval' to compile the runtime that
 * executes the weights, and losing it meant the single file could load the
 * library and then refuse to run it — with a CSP error naming a directive
 * nobody wrote.
 */
function singleFileCsp(policy) {
  return policy
    .split(';')
    .map((d) => {
      const t = d.trim();
      if (t.startsWith('script-src')) return ` ${swapSelf(t, sha(scriptBody))}`;
      if (t.startsWith('style-src')) return ` ${swapSelf(t, sha(styleBody))}`;
      return d;
    })
    .join(';');
}

function swapSelf(directive, hash) {
  const parts = directive.split(/\s+/).filter(Boolean);
  const kept = parts.slice(1).filter((p) => p !== "'self'");
  return [parts[0], hash].concat(kept).join(' ');
}

let html = htmlSrc;
html = html
  .replace(/\n?[ \t]*<link rel="stylesheet"[^>]*>/g, '')
  .replace(/[ \t]*<script type="module"[^>]*><\/script>/, '')
  .replace(
    /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/,
    (_, a, policy, c) => a + singleFileCsp(policy) + c
  )
  /*
   * Replacer functions, not replacement strings.
   *
   * String.replace gives $&, $`, $' and $1 special meaning INSIDE the
   * replacement, so any of those sequences in the bundle would be rewritten on
   * the way in — and the script that landed in the file would no longer match
   * the hash computed from it a few lines above. The vendored model library
   * contains `require$$3`, where $$ is itself the escape for a literal $, so
   * this was not hypothetical: the page loaded and refused to execute its own
   * script, reporting a CSP hash mismatch that looked like a bundler bug
   * anywhere but here.
   */
  .replace('</head>', () => `<style>${styleBody}</style>\n</head>`)
  .replace('</body>', () => `<script>${scriptBody}</script>\n</body>`);

if (!/Content-Security-Policy/.test(html)) {
  throw new Error(`${HTML_IN}: no CSP meta tag — the single-file build must not ship without one`);
}

mkdirSync(dirname(resolve(ROOT, HTML_OUT)), { recursive: true });
writeFileSync(resolve(ROOT, HTML_OUT), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`${HTML_OUT} — ${order.length} modules, ${kb} KB`);
for (const n of notes) console.log(`  note  ${n}`);
