#!/usr/bin/env node
/* recolor.mjs — retint the colours the screens spell out by hand.
 *
 * Kept as the record of the design pass: this is the whole list of literals
 * that were not already drawing through var(--…), and what each became. It has
 * already been run; re-running it is a no-op.
 *
 * Almost everything already draws through var(--…), so re-pointing the tokens
 * re-dressed the app on its own. What is left is the handful of literals: the
 * share card painted on a canvas, the vector coach, the clipboard, and a few
 * inline borders. This maps the old teal/tan/sage palette onto the bundle's
 * lime and its three stated alternates.
 */
import { readFileSync, writeFileSync, globSync } from 'node:fs';

const MAP = [
  // teal + emerald -> the lime accent
  [/rgba\(45,\s?212,\s?191,/g, 'rgba(217,255,61,'],
  [/rgba\(52,\s?211,\s?153,/g, 'rgba(217,255,61,'],
  [/#2dd4bf/gi, '#D9FF3D'],
  [/#5fe3d1/gi, '#D9FF3D'],
  [/#14b8a6/gi, '#D9FF3D'],
  [/#34d399/gi, '#C4F03A'],
  [/#22b3a1/gi, '#B4D62E'],
  [/#0d6e63/gi, '#8FA827'],
  [/#06231e/gi, '#0B0C0E'],          // ink on the accent

  // sage green -> the accent again; the app has one "good" colour now
  [/rgba\(124,\s?199,\s?156,/g, 'rgba(217,255,61,'],

  // tan + orange -> the bundle's orange alternate, kept for caution only
  [/rgba\(226,\s?189,\s?135,/g, 'rgba(255,107,61,'],
  [/rgba\(202,\s?160,\s?106,/g, 'rgba(255,107,61,'],
  [/#e2bd87/gi, '#FF9166'],
  [/#caa06a/gi, '#FF6B3D'],
  [/#b8884e/gi, '#E0521F'],

  // dusty red -> the pink alternate
  [/rgba\(217,\s?138,\s?138,/g, 'rgba(255,77,141,'],
  [/#e6a3a3/gi, '#FF8FB6'],
  [/#e08a8a/gi, '#FF8FB6'],

  // the coach: he wears the accent, she wears the cyan alternate
  [/#b06cf2/gi, '#4DE1FF'],
  [/#9850e0/gi, '#2BB8D6'],

  // ground and ink
  [/#0a0b0d/gi, '#0B0C0E'],
  [/#111317/gi, '#111214'],
  [/#0b0b0e/gi, '#0B0C0E'],
  [/#f3f5f7/gi, '#F4F5F6'],
  [/#aab1bd/gi, 'rgba(244,245,246,.62)'],
  [/#9aa2ae/gi, 'rgba(244,245,246,.55)'],
  [/#99a0ab/gi, 'rgba(244,245,246,.55)'],
  [/#7a828e/gi, 'rgba(244,245,246,.5)'],

  // the four meal-slot washes behind a dish photo: neutral tints of --card now
  [/linear-gradient\(135deg,#3a3122,#1c1813\)/g, 'linear-gradient(135deg,#1F2218,#131519)'],
  [/linear-gradient\(135deg,#3a2727,#1d1414\)/g, 'linear-gradient(135deg,#221A18,#131519)'],
  [/linear-gradient\(135deg,#223040,#141b24\)/g, 'linear-gradient(135deg,#181F27,#131519)'],
  [/linear-gradient\(135deg,#22372c,#15211a\)/g, 'linear-gradient(135deg,#1B2420,#131519)'],
];

const files = globSync('app/src/**/*.js', { cwd: process.argv[2] || '.' })
  .map(f => (process.argv[2] || '.') + '/' + f);

let touched = 0, hits = 0;
for (const f of files) {
  const before = readFileSync(f, 'utf8');
  let after = before;
  for (const [rx, to] of MAP) {
    after = after.replace(rx, () => { hits++; return to; });
  }
  if (after !== before) { writeFileSync(f, after); touched++; }
}
console.log(`✓ ${hits} literals retinted across ${touched} files`);
