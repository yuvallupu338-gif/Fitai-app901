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

function collect(abs) {
  const k = key(abs);
  if (seen.has(k)) return;
  seen.set(k, null);

  const src = readFileSync(abs, 'utf8');
  reject(src, k);

  const deps = [];
  const dynamic = [];
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

  /*
   * Dynamic imports, which LifeOS uses to keep the calendar and the analytics
   * out of the first paint of its Today screen. In the bundle there is nothing
   * to defer — every module is already in the file — so these become a lookup
   * wrapped in a resolved promise, and the awaiting code is unchanged.
   *
   * They are collected as dependencies so the modules are actually included;
   * they are NOT rewritten as destructuring, because the call site consumes a
   * namespace object.
   */
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicRe.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) throw new Error(`${k}: bare dynamic import "${spec}" — not bundleable`);
    dynamic.push({ spec, raw: m[0] });
  }

  for (const d of deps) collect(resolve(dirname(abs), d.spec));
  for (const d of dynamic) collect(resolve(dirname(abs), d.spec));

  seen.set(k, { abs, src, deps, dynamic });
  order.push(k);
}

function reject(src, k) {
  if (/\bexport\s+default\b/.test(src)) throw new Error(`${k}: export default is not supported`);
  if (/\bexport\s+\*/.test(src)) throw new Error(`${k}: export * is not supported`);
  if (/\bimport\.meta\b/.test(src)) throw new Error(`${k}: import.meta is not supported`);
  /* A dynamic import built from a variable cannot be resolved at build time,
   * and silently emitting it would produce a file that throws on a route
   * change rather than at build. */
  if (/\bimport\s*\(\s*[^'")]/.test(src)) {
    throw new Error(`${k}: dynamic import() with a computed specifier is not bundleable`);
  }
}

function transform(k, mod) {
  let out = mod.src;

  // imports -> registry destructuring
  for (const d of mod.deps) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    /*
     * `import { a as b }` is an import alias; `const { a: b }` is the
     * destructuring that means the same thing. Emitting the import spelling
     * verbatim produces `const { a as b } = …`, which is a syntax error — and
     * one that surfaces only when the bundled file is opened, as "Unexpected
     * identifier 'as'" with no file or line.
     */
    const names = (d.named || '')
      .replace(/\s+/g, ' ')
      .split(',')
      .map((piece) => piece.trim())
      .filter(Boolean)
      .map((piece) => {
        const alias = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(piece);
        return alias ? `${alias[1]}: ${alias[2]}` : piece;
      })
      .join(', ');

    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${names} } = __m[${JSON.stringify(target)}];`;
    /* split/join rather than replace, for the same reason as the HTML inserts
     * below: a replacement string would interpret any $ pattern in it. */
    out = out.split(d.raw).join(line);
  }

  /* Dynamic imports become a resolved promise over the registry entry, so the
   * `await import(...)` at the call site keeps working verbatim. */
  for (const d of mod.dynamic || []) {
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

  /* An export STATEMENT, not merely a line beginning with the word. The
   * plainer `/^[ \t]*export\b/` also matched an object property named
   * `export:` — which LifeOS's string catalogue has, because ייצוא is a thing
   * the interface says — and refused to build a file that was perfectly
   * valid. */
  if (/^[ \t]*export[ \t]+(?:default|const|let|var|function|class|async)\b|^[ \t]*export[ \t]*[{*]/m.test(out)) {
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
 * The inserts use replacer FUNCTIONS, not replacement strings, and that is
 * load-bearing rather than stylistic.
 *
 * In a replacement string, `$&`, `` $` ``, `$'` and `$1` are substitution
 * patterns. Source code contains those sequences by accident: router.js has
 * the template literal `` `^${source}$` ``, whose `$` sits immediately before
 * a backtick and therefore reads as `` $` `` — "insert everything before the
 * match". Building LifeOS spliced the entire document head back into the
 * middle of the bundle, producing a file with a stray </script> in it that
 * died with "Unexpected end of input" and no indication of why.
 *
 * A function replacer has no such patterns. FitAI and backrooms were only ever
 * safe by luck.
 */
let html = htmlSrc;
html = html
  .replace(/\n?[ \t]*<link rel="stylesheet"[^>]*>/g, '')
  .replace(/[ \t]*<script type="module"[^>]*><\/script>/, '')
  .replace('</head>', () => `<style>\n${css}\n</style>\n</head>`)
  .replace('</body>', () => `<script>\n${bundle}\n</script>\n</body>`);

mkdirSync(dirname(resolve(ROOT, HTML_OUT)), { recursive: true });
writeFileSync(resolve(ROOT, HTML_OUT), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`${HTML_OUT} — ${order.length} modules, ${kb} KB`);
