#!/usr/bin/env node
/*
 * mario-build.mjs — bundles the game into one HTML file at dist/mario.html.
 *
 * The game is plain ES modules, which means it needs a web server: a browser
 * refuses to load `import` over file://. That is fine for GitHub Pages and
 * useless for "send me the game". This flattens the module graph into a single
 * <script> and inlines it into the page, so the result is one file that runs by
 * double-clicking it, offline, with no server and no dependencies.
 *
 * It is the same deliberately small bundler as tools/build-single.js, aimed at
 * a different entry point: it understands only the module syntax this codebase
 * actually uses, and stops loudly on anything else rather than emitting a file
 * that is broken in a way nobody would notice until it was opened.
 *
 * Usage: node tools/mario-build.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'mario/src/main.js';
const PAGE = 'mario/index.html';
const OUT = 'dist/mario.html';

const seen = new Map();
const order = [];

const key = (abs) => relative(ROOT, abs).split('\\').join('/');

function collect(abs) {
  const k = key(abs);
  if (seen.has(k)) return;
  seen.set(k, null);

  const src = readFileSync(abs, 'utf8');
  reject(src, k);

  const deps = [];
  const importRe = /^[ \t]*import\s+(?:([\w$]+)|\*\s+as\s+([\w$]+)|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm;
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

  for (const d of mod.deps) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${d.named.replace(/\s+/g, ' ').trim()} } = __m[${JSON.stringify(target)}];`;
    out = out.replace(d.raw, line);
  }

  const exported = new Set();
  out = out.replace(
    /^[ \t]*export\s+(?:async\s+)?(const|let|var|function|class)\s*\*?\s*([\w$]+)/gm,
    (whole, kind, name) => {
      exported.add(name);
      return whole.replace(/export\s+/, '');
    },
  );
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

let html = readFileSync(resolve(ROOT, PAGE), 'utf8');
if (!/<script type="module"[^>]*><\/script>/.test(html)) {
  throw new Error(`${PAGE}: no module script tag to replace`);
}
html = html.replace(
  /[ \t]*<script type="module"[^>]*><\/script>/,
  `<script>\n${bundle}\n</script>`,
);

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
writeFileSync(resolve(ROOT, OUT), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`${OUT} — ${order.length} modules, ${kb} KB`);
