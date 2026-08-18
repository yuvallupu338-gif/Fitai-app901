#!/usr/bin/env node
/**
 * Bundles the whole game into one self-contained HTML file that runs straight
 * off the disk (file://) with no server. Every asset in this game is generated
 * at runtime, so once the script and the stylesheet are inlined there is
 * nothing left to fetch.
 *
 *   node tools/build-single.mjs [outfile]
 *
 * Defaults to ../dist/floor-zero.html, matching the other single-file builds
 * kept at the repository root.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const outFile = path.resolve(root, process.argv[2] ?? '../dist/floor-zero.html');
const stage = path.join(root, 'dist-single');

rmSync(stage, { recursive: true, force: true });

console.log('building…');
execFileSync('npx', ['vite', 'build', '--outDir', 'dist-single', '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FZ_SINGLE: '1' },
});

let html = readFileSync(path.join(stage, 'index.html'), 'utf8');

/** Escaping the closing tag keeps an inlined bundle from ending its own script. */
const escapeForScript = (source) => source.replace(/<\/script/gi, '<\\/script');

const scripts = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g)];
if (scripts.length !== 1) {
  throw new Error(`expected exactly one module script in the build, found ${scripts.length}`);
}
const [scriptTag, scriptSrc] = scripts[0];
const code = readFileSync(path.join(stage, scriptSrc.replace(/^\.?\//, '')), 'utf8');
// A replacer *function* is required: the bundle contains `$` sequences that
// String.replace would otherwise treat as substitution patterns.
html = html.replace(scriptTag, () => `<script type="module">\n${escapeForScript(code)}\n</script>`);

for (const [linkTag, href] of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)) {
  const css = readFileSync(path.join(stage, href.replace(/^\.?\//, '')), 'utf8');
  html = html.replace(linkTag, () => `<style>\n${css}\n</style>`);
}

if (/(src|href)="\.?\/?assets\//.test(html)) {
  throw new Error('the page still references external assets after inlining');
}

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
rmSync(stage, { recursive: true, force: true });

const bytes = statSync(outFile).size;
console.log(`wrote ${path.relative(process.cwd(), outFile)} — ${(bytes / 1024 / 1024).toFixed(2)} MB`);

// Nothing should be left behind in the staging directory.
if (readdirSync(root).includes('dist-single')) {
  throw new Error('staging directory was not cleaned up');
}
