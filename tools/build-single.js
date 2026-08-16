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

function collect(abs) {
  const k = key(abs);
  if (seen.has(k)) return;
  seen.set(k, null);

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
    deps.push({ ns: m[2], named: m[3], spec, raw: m[0] });
  }

  for (const d of deps) collect(resolve(dirname(abs), d.spec));

  seen.set(k, { abs, src, deps });
  order.push(k);
}

function reject(src, k) {
  if (/\bexport\s+default\b/.test(src)) throw new Error(`${k}: export default is not supported`);
  if (/\bexport\s+\*/.test(src)) throw new Error(`${k}: export * is not supported`);
  if (/\bimport\s*\(/.test(src)) throw new Error(`${k}: dynamic import() is not supported`);
  if (/\bimport\.meta\b/.test(src)) throw new Error(`${k}: import.meta is not supported`);
}

function transform(k, mod) {
  let out = mod.src;

  // imports -> registry destructuring
  for (const d of mod.deps) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${d.named.replace(/\s+/g, ' ').trim()} } = __m[${JSON.stringify(target)}];`;
    out = out.replace(d.raw, line);
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
const styleBody = `\n${css}\n`;
const scriptBody = `\n${bundle}\n`;

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
  .replace('</head>', `<style>${styleBody}</style>\n</head>`)
  .replace('</body>', `<script>${scriptBody}</script>\n</body>`);

if (!/Content-Security-Policy/.test(html)) {
  throw new Error(`${HTML_IN}: no CSP meta tag — the single-file build must not ship without one`);
}

mkdirSync(dirname(resolve(ROOT, HTML_OUT)), { recursive: true });
writeFileSync(resolve(ROOT, HTML_OUT), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`${HTML_OUT} — ${order.length} modules, ${kb} KB`);
