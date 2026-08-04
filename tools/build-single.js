#!/usr/bin/env node
/*
 * build-single.js — bundles the whole app into one self-contained HTML file
 * at dist/fitai.html, so it can be opened straight off the disk (file://)
 * exactly like the original reference document.
 *
 * It is a deliberately small bundler that understands only the module syntax
 * this codebase actually uses. Anything else makes it stop loudly rather than
 * emit a broken file.
 *
 * Usage: node tools/build-single.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = process.argv[2] || 'src/app.js';

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

  // imports -> registry destructuring
  for (const d of mod.deps) {
    const target = key(resolve(dirname(mod.abs), d.spec));
    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${d.named.replace(/\s+/g, ' ').trim()} } = __m[${JSON.stringify(target)}];`;
    out = out.replace(d.raw, line);
  }

  const exported = new Set();

  // export const/let/function/class -> plain declaration, remembered
  out = out.replace(/^[ \t]*export\s+(const|let|var|function|class)\s+([\w$]+)/gm, (whole, kind, name) => {
    exported.add(name);
    return whole.replace(/export\s+/, '');
  });

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

const css = ['fonts', 'tokens', 'base', 'components']
  .map((n) => readFileSync(resolve(ROOT, `src/styles/${n}.css`), 'utf8'))
  .join('\n\n');

let html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
html = html
  .replace(/\n?[ \t]*<link rel="stylesheet"[^>]*>/g, '')
  .replace(/[ \t]*<script type="module"[^>]*><\/script>/, '')
  .replace('</head>', `<style>\n${css}\n</style>\n</head>`)
  .replace('</body>', `<script>\n${bundle}\n</script>\n</body>`);

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
writeFileSync(resolve(ROOT, 'dist/fitai.html'), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`dist/fitai.html — ${order.length} modules, ${kb} KB`);
