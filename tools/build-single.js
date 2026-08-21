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

/**
 * A copy of a module with the contents of strings and comments blanked out, the
 * same length as the original so a match's index still points at the same
 * character.
 *
 * The corpora are ES modules whose whole content is a list of JSON strings —
 * half a megabyte of other people's code, quoted. Scanning that with a regular
 * expression for `import(` finds the dynamic imports inside the *training text*
 * and tries to bundle them, which is how a build first failed on a corpus slice
 * that happened to contain one. Static imports were never at risk only because
 * their pattern is anchored to the start of a line and every slice is one line.
 *
 * It does not understand regular expression literals, so a regex containing a
 * lone quote would desynchronise it. Nothing here has one, and the three builds
 * are checked after any change to this file.
 */
function maskStrings(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < n) {
        if (src[i] === '\\') { out[i] = ' '; if (i + 1 < n) out[i + 1] = ' '; i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        out[i] = ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let j = i; j < stop; j++) out[j] = ' ';
      i = stop;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Every `import('./x.js')` that is really code, with where it sits. */
function dynamicImports(src) {
  const masked = maskStrings(src);
  const re = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const found = [];
  let m;
  while ((m = re.exec(masked))) {
    /* The specifier itself was blanked by the mask, so read it back out of the
     * original at the same offsets. */
    const spec = src.slice(m.index, m.index + m[0].length).match(/['"]([^'"]+)['"]/)[1];
    found.push({ start: m.index, end: m.index + m[0].length, spec });
  }
  return found;
}

function collect(abs) {
  const k = key(abs);
  if (seen.has(k)) return;
  seen.set(k, null);

  const src = readFileSync(abs, 'utf8');
  reject(maskStrings(src), k);

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
    deps.push({ ns: m[2], named: m[3], spec, raw: m[0] });
  }

  for (const d of deps) collect(resolve(dirname(abs), d.spec));

  /* Dynamic imports are how LAKEN's page loads a corpus or a trained model only
   * when someone asks for one. Served, that is a second request; bundled, there
   * is nothing left to request — so the module is pulled in here and the call
   * becomes a lookup in transform(). */
  for (const dyn of dynamicImports(src)) {
    if (!dyn.spec.startsWith('.')) throw new Error(`${k}: bare dynamic import "${dyn.spec}" — not bundleable`);
    collect(resolve(dirname(abs), dyn.spec));
  }

  seen.set(k, { abs, src, deps });
  order.push(k);
}

function reject(src, k) {
  if (/\bexport\s+\*/.test(src)) throw new Error(`${k}: export * is not supported`);
  if (/\bimport\.meta\b/.test(src)) throw new Error(`${k}: import.meta is not supported`);
  /* A dynamic import built from a variable cannot be resolved at build time,
   * and silently leaving it in would produce a file that looks fine until the
   * button that needs it is pressed. */
  if (/\bimport\s*\(\s*[^'"\s)]/.test(src)) throw new Error(`${k}: computed dynamic import — not bundleable`);
}

function transform(k, mod) {
  let out = mod.src;

  // imports -> registry destructuring
  for (const d of mod.deps) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    /* `import { MODEL as TRAINED }` becomes `const { MODEL: TRAINED }`.
     * Destructuring renames with a colon; leaving the `as` in place emitted a
     * syntax error into the middle of a two megabyte file, which is a bad place
     * to go looking for one. */
    const named = (d.named || '')
      .replace(/\s+/g, ' ')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t);
        return as ? `${as[1]}: ${as[2]}` : t;
      })
      .join(', ');
    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${named} } = __m[${JSON.stringify(target)}];`;
    out = out.replace(d.raw, line);
  }

  /* import('./x.js') -> the module object, already in the registry. Awaiting a
   * resolved promise keeps every call site unchanged, including the ones that
   * hand it to Promise.all. */
  for (const dyn of dynamicImports(out).reverse()) {
    const target = key(resolve(dirname(mod.abs), dyn.spec));
    if (!seen.has(target)) throw new Error(`${k}: dynamic import "${dyn.spec}" was never collected`);
    out = out.slice(0, dyn.start)
      + `Promise.resolve(__m[${JSON.stringify(target)}])`
      + out.slice(dyn.end);
  }

  const exported = new Set();

  /* export default <expression>; — what the generated corpus and model modules
   * use, since each is one enormous value and nothing else. */
  out = out.replace(/^[ \t]*export\s+default\s+/m, () => {
    exported.add('default:__default');
    return 'const __default = ';
  });

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
/**
 * Make a sequence inert that the HTML parser would otherwise act on.
 *
 * A string inside this bundle can contain the text `</script>` — the corpora
 * are half a megabyte of other people's code, and one slice of HTML has exactly
 * that. The parser does not know it is looking at a JavaScript string: it ends
 * the script element there, and everything after it becomes a second inline
 * script, which the policy hash does not cover and which begins in the middle
 * of an expression. That is how the first single-file build of LAKEN produced a
 * 2.8 MB file that did nothing at all.
 *
 * `<\/script>` is the same string to JavaScript and no longer a closing tag to
 * the parser. `<!--` is the same hazard through a different tokenizer state.
 */
const inert = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const styleBody = `\n${css}\n`;
const scriptBody = `\n${inert(bundle)}\n`;

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
function singleFileCsp(policy) {
  return policy
    .split(';')
    .map((d) => {
      const t = d.trim();
      if (t.startsWith('script-src')) return ` script-src ${sha(scriptBody)}`;
      if (t.startsWith('style-src')) return ` style-src ${sha(styleBody)}`;
      return d;
    })
    .join(';');
}

let html = htmlSrc;
html = html
  .replace(/\n?[ \t]*<link rel="stylesheet"[^>]*>/g, '')
  .replace(/[ \t]*<script type="module"[^>]*><\/script>/, '')
  .replace(
    /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/,
    (_, a, policy, c) => a + singleFileCsp(policy) + c
  )
  /* Function replacers, not strings. In a replacement string `$&` inserts the
   * match and `$'` inserts everything after it — and the bundle being inserted
   * here is half a megabyte of shell, Perl-ish regex and template literals,
   * which contains both. As a string this quietly spliced parts of the document
   * into the middle of the script; as a function the text goes in exactly as
   * it is. */
  .replace('</head>', () => `<style>${styleBody}</style>\n</head>`)
  .replace('</body>', () => `<script>${scriptBody}</script>\n</body>`);

if (!/Content-Security-Policy/.test(html)) {
  throw new Error(`${HTML_IN}: no CSP meta tag — the single-file build must not ship without one`);
}

/* What the browser will run has to be exactly what was hashed, so read it back
 * out of the finished file the way the parser will: from the opening tag to the
 * first closing tag, and compare.
 *
 * Counting tags does not work here. The corpora are half a megabyte of other
 * people's code and contain `<script`, `</style>` and `<!--` as ordinary text
 * inside JavaScript strings; inside a script element all of that is script-data
 * and inert, and a check that counted it would refuse a file that is perfectly
 * well-formed. What is not inert is an unescaped `</script`, which ends the
 * element early — and this comparison is exactly the test for that, because
 * everything after the break would be missing from what it reads back. */
const between = (open, close) => {
  const a = html.indexOf(open);
  if (a < 0) return null;
  const b = html.indexOf(close, a + open.length);
  return b < 0 ? null : html.slice(a + open.length, b);
};

if (between('<style>', '</style>') !== styleBody) {
  throw new Error(`${HTML_OUT}: the style element the parser will read is not the one that was hashed`);
}
if (between('<script>', '</script>') !== scriptBody) {
  throw new Error(`${HTML_OUT}: the script element the parser will read is not the one that was hashed — something in the bundle closed the tag early`);
}

mkdirSync(dirname(resolve(ROOT, HTML_OUT)), { recursive: true });
writeFileSync(resolve(ROOT, HTML_OUT), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`${HTML_OUT} — ${order.length} modules, ${kb} KB`);
