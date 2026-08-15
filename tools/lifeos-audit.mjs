#!/usr/bin/env node
/*
 * lifeos-audit.mjs — the checks a Hebrew RTL app cannot pass by looking right
 * on the developer's machine.
 *
 * §181 asks for a full Hebrew audit and §182 for the absence of unintended
 * English. Both are the kind of requirement that gets signed off by scrolling
 * through a few screens and missing the validation message that only appears
 * when a date is malformed. So they are mechanical here:
 *
 *   1. every t() key resolves          — a missing key renders as "tasks.foo"
 *   2. no Latin user-facing strings    — the §182 check
 *   3. no physical CSS directions      — margin-left in an RTL app is a bug
 *      that renders correctly for whoever wrote it
 *   4. no AM/PM, no MM/DD              — §101 and §100
 *   5. no unused catalogue keys        — dead strings drift out of date
 *
 * Usage: node tools/lifeos-audit.mjs [--verbose]
 * Exit code 1 on any failure, so it can gate a build.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'lifeos');
const VERBOSE = process.argv.includes('--verbose');

const problems = [];
const notes = [];

function fail(file, line, message, snippet) {
  problems.push({ file: relative(ROOT, file), line, message, snippet });
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(resolve(APP, 'src'), []);
const jsFiles = allFiles.filter((f) => f.endsWith('.js'));
const cssFiles = allFiles.filter((f) => f.endsWith('.css'));

/* ------------------------------------------------------------------ *
 * 1. Every t() key resolves
 * ------------------------------------------------------------------ */

const { HE } = await import(resolve(APP, 'src/locales/he.js'));

function lookup(key) {
  let node = HE;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function flatten(node, prefix, out) {
  for (const key of Object.keys(node)) {
    const value = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.add(path);
    else if (Array.isArray(value)) out.add(path);
    else if (value && typeof value === 'object') {
      /* A plural entry is three forms under one key, and the key is what
       * plural() is called with. */
      if ('one' in value || 'many' in value) out.add(path);
      else flatten(value, path, out);
    }
  }
  return out;
}

const catalogueKeys = flatten(HE, '', new Set());
const usedKeys = new Set();

/* Keys built at runtime from an enum — `t('tasks.status.' + status)`. These
 * cannot be matched literally, so the prefix is expanded against the
 * catalogue and every child counted as used. */
const DYNAMIC_PREFIXES = [
  'tasks.status', 'tasks.statusShort', 'tasks.energyLevel', 'tasks.energyNote',
  'tasks.scale', 'goals.types', 'goals.typeNotes', 'goals.status',
  'goals.progressSources', 'projects.status', 'projects.healthReasons',
  'calendar.blockKinds', 'calendar.blockKindNotes', 'habits.frequencies',
  'notes.types', 'focus.kinds', 'memory.types', 'memory.sources',
  'activity.events', 'areas.presets', 'count', 'time.dayNames',
  'time.dayNamesShort', 'time.monthNames', 'time.monthNamesPlain',
  'errors', 'confirm', 'shortcuts', 'palette',
];

/* Comment lines are skipped everywhere below. A key in a JSDoc example is
 * documentation, not a lookup, and flagging it trains people to ignore the
 * tool — which is the only way an audit like this actually fails. */
function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

for (const file of jsFiles) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    if (isComment(line)) return;
    /* t('a.b') and plural('a.b', n) */
    const calls = line.matchAll(/\b(?:t|plural)\(\s*'([\w.]+)'/g);
    for (const match of calls) {
      const key = match[1];
      usedKeys.add(key);
      const value = lookup(key);
      if (value === undefined) {
        fail(file, i + 1, `i18n key does not exist: ${key}`, line.trim().slice(0, 110));
      }
    }

    /* A template-literal key is a dynamic lookup; record the prefix so the
     * unused-key pass does not flag its siblings. */
    const dynamic = line.matchAll(/\b(?:t|plural)\(\s*`([\w.]+)\$\{/g);
    for (const match of dynamic) usedKeys.add(`${match[1].replace(/\.$/, '')}.*`);
  });
}

for (const prefix of DYNAMIC_PREFIXES) {
  for (const key of catalogueKeys) {
    if (key === prefix || key.startsWith(`${prefix}.`)) usedKeys.add(key);
  }
}
for (const used of Array.from(usedKeys)) {
  if (!used.endsWith('.*')) continue;
  const prefix = used.slice(0, -2);
  for (const key of catalogueKeys) {
    if (key.startsWith(`${prefix}.`)) usedKeys.add(key);
  }
}

/* ------------------------------------------------------------------ *
 * 2. No Latin user-facing strings
 * ------------------------------------------------------------------ */

/*
 * A string literal reaches a person only if it is rendered. Rather than trying
 * to trace that, the rule is inverted: flag any Latin-script literal that is
 * NOT one of the many things Latin legitimately appears in — a CSS value, an
 * attribute name, an import path, a key, an enum member, a class name.
 *
 * Deliberately conservative. A false positive costs a glance; a false negative
 * is a "Submit" button in a Hebrew form.
 */
const ALLOWED_LATIN = [
  /^[\w-]+$/,                         // identifiers, class names, enum values
  /^[\d.\s%+#(),/*-]+$/,               // numeric CSS values
  /^(?:https?:)?\/\//,                // urls
  /^[.#][\w-]/,                       // selectors
  /^[\w-]+(?:\.[\w-]+)+$/,            // dotted keys, file names
  /var\(--/,                          // any css value referencing a token
  /^[\d.]+(?:px|rem|em|%|svh|vh|vw)\s/, // css shorthand: "1px solid …"
  /^(?:solid|dashed|dotted|none|auto|hidden|scroll|grid|flex|block|inline)\b/,
  /^\d+px$|^\d+%$|^\d+svh$/,
  /^[A-Za-z-]+\/[A-Za-z0-9.+-]+$/,    // mime types
  /^(?:LifeOS|JSON|CSV|API|AI|PBKDF2|UTC|RTL|LTR|ID|URL)$/,
];

const LATIN_WORD = /[A-Za-z]{2,}/;

function looksLikeUserText(value) {
  if (!LATIN_WORD.test(value)) return false;
  for (const pattern of ALLOWED_LATIN) if (pattern.test(value.trim())) return false;
  /* Contains Hebrew as well — a mixed string is fine (a name, a model id). */
  if (/[֐-׿]/.test(value)) return false;
  /* Two or more Latin words with a space reads as a sentence. */
  return /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(value) || /^[A-Z][a-z]{3,}$/.test(value.trim());
}

/*
 * Files whose Latin strings are correct by construction, and why each one is
 * exempt. Kept as an explicit list rather than a pattern so that adding a file
 * to it is a decision somebody makes on purpose.
 */
const NOT_USER_FACING = [
  'locales/he.js',      // the catalogue itself, checked separately and harder
  'ai/providers.js',    // vendor names, hostnames, model identifiers
  'ai/client.js',       // the connection-test prompt is sent to a model
  'core/icons.js',      // SVG path data
];

for (const file of jsFiles) {
  if (NOT_USER_FACING.some((suffix) => file.endsWith(suffix))) continue;

  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let inBlockComment = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith('/*')) { if (!trimmed.includes('*/')) inBlockComment = true; return; }
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
    /* A developer log is not an interface. */
    if (/\bconsole\.\w+\(/.test(trimmed)) return;

    const strings = line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g);
    for (const match of strings) {
      const value = match[1] !== undefined ? match[1] : match[2];
      if (!value || value.length < 4) continue;
      if (looksLikeUserText(value)) {
        fail(file, i + 1, `possible English user string: "${value.slice(0, 60)}"`, trimmed.slice(0, 110));
      }
    }
  });
}

/* Any Latin sentence in the catalogue itself is definitely a bug. */
(function auditCatalogue(node, prefix) {
  for (const key of Object.keys(node)) {
    const value = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(value) && !/[֐-׿]/.test(value)) {
        fail(resolve(APP, 'src/locales/he.js'), 0, `English string in the catalogue at ${path}`, value.slice(0, 70));
      }
    } else if (Array.isArray(value)) {
      value.forEach((v) => {
        if (typeof v === 'string' && /[A-Za-z]{3,}/.test(v) && !/[֐-׿]/.test(v)) {
          fail(resolve(APP, 'src/locales/he.js'), 0, `English in the catalogue array at ${path}`, v);
        }
      });
    } else if (value && typeof value === 'object') auditCatalogue(value, path);
  }
})(HE, '');

/* ------------------------------------------------------------------ *
 * 3. No physical CSS directions
 * ------------------------------------------------------------------ */

const PHYSICAL = [
  { re: /(?:^|[^-\w])margin-(left|right)\s*:/, name: 'margin-left/right', fix: 'margin-inline-start/end' },
  { re: /(?:^|[^-\w])padding-(left|right)\s*:/, name: 'padding-left/right', fix: 'padding-inline-start/end' },
  { re: /(?:^|[^-\w])border-(left|right)(?:-\w+)?\s*:/, name: 'border-left/right', fix: 'border-inline-start/end' },
  { re: /(?:^|[^-\w])(?:^|\s)(left|right)\s*:\s*(?!auto)/, name: 'left/right', fix: 'inset-inline-start/end' },
  { re: /text-align\s*:\s*(left|right)\b/, name: 'text-align: left/right', fix: 'text-align: start/end' },
  { re: /float\s*:\s*(left|right)\b/, name: 'float: left/right', fix: 'the inline axis' },
];

for (const file of cssFiles) {
  if (file.endsWith('fonts.css')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  let inComment = false;
  lines.forEach((line, i) => {
    if (inComment) { if (line.includes('*/')) inComment = false; return; }
    if (line.trim().startsWith('/*')) { if (!line.includes('*/')) inComment = true; return; }
    for (const rule of PHYSICAL) {
      if (rule.re.test(line)) {
        fail(file, i + 1, `physical direction ${rule.name} — use ${rule.fix}`, line.trim().slice(0, 100));
      }
    }
  });
}

/* The same, in inline style objects in JS. */
const JS_PHYSICAL = /\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|textAlign\s*:\s*'(?:left|right)')\b/;
for (const file of jsFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;
    const match = JS_PHYSICAL.exec(line);
    if (match) {
      fail(file, i + 1, `physical direction ${match[1]} in an inline style — use the logical property`, line.trim().slice(0, 100));
    }
  });
}

/* ------------------------------------------------------------------ *
 * 4. No AM/PM, no American dates
 * ------------------------------------------------------------------ */

for (const file of jsFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    if (/\b(?:AM|PM)\b/.test(line) && !/AM\/PM/.test(line)) {
      fail(file, i + 1, 'AM/PM — this app is 24-hour', trimmed.slice(0, 100));
    }
    if (/hour12\s*:\s*true/.test(line)) {
      fail(file, i + 1, 'hour12: true — this app is 24-hour', trimmed.slice(0, 100));
    }
    if (/toLocaleDateString\(\s*(?:'en|"en)/.test(line)) {
      fail(file, i + 1, 'an en-US date format', trimmed.slice(0, 100));
    }
  });
}

/* ------------------------------------------------------------------ *
 * 5. Structural checks
 * ------------------------------------------------------------------ */

/*
 * Every relative import resolves to a file that exists.
 *
 * A browser reports a missing module as a console error at the moment the
 * route is visited, which for a lazily-loaded screen means the failure is
 * discovered by whoever clicks it. This is the same information, at build time.
 */
for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  const specs = src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g);
  for (const match of specs) {
    const target = resolve(dirname(file), match[1]);
    try {
      statSync(target);
    } catch (e) {
      const line = src.slice(0, match.index).split('\n').length;
      fail(file, line, `import does not resolve: ${match[1]}`);
    }
  }
}

const indexHtml = readFileSync(resolve(APP, 'index.html'), 'utf8');
if (!/<html[^>]*\blang="he"/.test(indexHtml)) fail(resolve(APP, 'index.html'), 0, 'the document is not lang="he"');
if (!/<html[^>]*\bdir="rtl"/.test(indexHtml)) fail(resolve(APP, 'index.html'), 0, 'the document is not dir="rtl"');

/* Unused catalogue entries. A note rather than a failure: a string can be
 * legitimately staged ahead of the screen that uses it. */
const unused = Array.from(catalogueKeys).filter((k) => !usedKeys.has(k)).sort();
if (unused.length) notes.push(`${unused.length} catalogue keys are not referenced anywhere`);

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log(`LifeOS audit — ${jsFiles.length} modules, ${cssFiles.length} stylesheets, ${catalogueKeys.size} strings\n`);

if (problems.length) {
  const byFile = new Map();
  for (const p of problems) {
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push(p);
  }
  for (const [file, list] of byFile) {
    console.log(`  ${file}`);
    for (const p of list) {
      console.log(`    ${p.line ? `${p.line}: ` : ''}${p.message}`);
      if (VERBOSE && p.snippet) console.log(`        ${p.snippet}`);
    }
    console.log('');
  }
}

for (const note of notes) console.log(`  note: ${note}`);
if (VERBOSE && unused.length) {
  console.log(`\n  unreferenced keys:\n${unused.map((k) => `    ${k}`).join('\n')}`);
}

console.log(problems.length
  ? `\n${problems.length} problem${problems.length === 1 ? '' : 's'}.`
  : '\nClean: every key resolves, no English in the interface, no physical directions, 24-hour throughout.');

process.exit(problems.length ? 1 : 0);
