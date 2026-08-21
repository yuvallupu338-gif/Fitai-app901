#!/usr/bin/env node
/*
 * secret-scan.mjs — refuses to let an API key into this repository.
 *
 * Run with: node tools/secret-scan.mjs
 * Exits non-zero if anything that looks like a credential is committed.
 *
 * This repository is public and GitHub Pages serves it, so a key committed here
 * is a key published twice over: readable in the source by anyone, and shipped
 * to every visitor's browser. Removing it later does not help — it stays in the
 * git history, and the only real remedy is revoking it at the vendor.
 *
 * Both apps here talk to model vendors and both take a key from the user. The
 * keys belong in the user's own localStorage, typed into the settings screen on
 * their own machine, and nowhere else. This is the check that keeps a
 * well-meant "just paste it in for now" from becoming permanent.
 */

import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Vendor key shapes. Each is anchored on a prefix the vendor actually issues,
 * which is what keeps this from firing on every long string in a bundle.
 *
 * The generic assignment rule at the end is the one that catches a key from a
 * vendor nobody thought of, at the cost of needing the variable to be named
 * something honest — which, in practice, it always is.
 */
const PATTERNS = [
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, 'Anthropic API key'],
  [/\bsk-or-v1-[A-Za-z0-9]{32,}/g, 'OpenRouter API key'],
  [/\bsk-proj-[A-Za-z0-9_-]{20,}/g, 'OpenAI project key'],
  [/\bsk-[A-Za-z0-9]{32,}/g, 'API key with an sk- prefix (DeepSeek, DashScope, OpenAI)'],
  [/\bLTAI[A-Za-z0-9]{12,}/g, 'Alibaba Cloud access key id'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS access key id'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/g, 'GitHub token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, 'Google API key'],
  [
    /(?:api[_-]?key|apikey|secret|token|password|authorization)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/gi,
    'a long literal assigned to something named like a credential',
  ],
];

/*
 * Places a match is expected and means nothing.
 *
 * The embedded font faces are hundreds of kilobytes of base64 and the
 * single-file builds inline them, so a generic high-entropy rule would drown in
 * them. The patterns above are anchored tightly enough not to need this, but
 * the exclusion is cheap insurance against a future looser rule.
 *
 * This file itself contains every pattern it looks for, by definition.
 */
const SKIP = [
  /(^|\/)src\/styles\/fonts\.css$/,
  /(^|\/)tools\/secret-scan\.mjs$/,
];

/*
 * A placeholder is a promise about a shape, not a credential.
 *
 * Matched anywhere in the string rather than only at the front, because the
 * fixtures that trip this are named honestly in the middle:
 * 'sk-ant-smoke-test-key-not-real-0000000000' is the browser test's, and a
 * scanner that flags it is a scanner somebody turns off within a week.
 */
const PLACEHOLDER = /x{4,}|\.{3}|…|not-?real|fake|dummy|sample|example|placeholder|redacted|smoke|test|your[_-]?key|abc123|0{6,}|1234567/i;

function tracked() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

const findings = [];
let scanned = 0;
let skipped = 0;

for (const rel of tracked()) {
  if (SKIP.some((re) => re.test(rel))) { skipped += 1; continue; }
  const abs = resolve(ROOT, rel);
  let stat;
  try { stat = statSync(abs); } catch (e) { continue; }
  if (!stat.isFile()) continue;
  // Binary-ish extensions carry no readable credential and cost time.
  if (['.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.ico'].includes(extname(rel))) continue;

  let src;
  try { src = readFileSync(abs, 'utf8'); } catch (e) { continue; }
  scanned += 1;

  for (const [re, label] of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const hit = m[0];
      if (PLACEHOLDER.test(hit.replace(/^.*['"]/, ''))) continue;
      if (PLACEHOLDER.test(hit)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      // Never print the whole thing — a scanner that leaks the secret into a
      // build log has moved the problem rather than found it.
      const masked = `${hit.slice(0, 8)}…${hit.slice(-4)}`;
      findings.push(`${rel}:${line} — ${label} (${masked})`);
    }
  }
}

console.log(`scanned ${scanned} tracked files, skipped ${skipped}`);

if (findings.length) {
  console.log(`\n${findings.length} possible credential(s) committed:\n`);
  for (const f of findings) console.log(`  ✗ ${f}`);
  console.log(`
This repository is public and GitHub Pages serves it, so anything here is
readable by anyone and shipped to every visitor. Removing the line is not
enough — it stays in the git history. Revoke the key at the vendor, then take
it out of the code: both apps read their key from the user's own localStorage,
typed into their own settings screen.
`);
  process.exit(1);
}

console.log('\nNo credentials committed.\n');
