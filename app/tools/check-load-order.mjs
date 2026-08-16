#!/usr/bin/env node
/*
 * check-load-order.mjs — the one hazard splitting this app introduced.
 *
 * In the single file, every function declaration in all 4,500 lines was
 * hoisted before the first statement ran, so load-time code could call
 * anything. Once the same text is 49 separate classic scripts, hoisting stops
 * at the file boundary: code that runs while a file loads can only call what
 * an earlier file already declared.
 *
 * This walks the files in the order index.html lists them, works out what each
 * one runs at load time (top-level statements, IIFEs, and the callbacks of
 * array methods — but not setTimeout/addEventListener bodies, which run later),
 * and reports any name it reaches for that no earlier file has declared.
 *
 * Usage: node app/tools/check-load-order.mjs [app/index.html]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '/opt/node22/lib/node_modules/eslint/node_modules/acorn/dist/acorn.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(process.argv[2] || resolve(HERE, '../index.html'));
const ROOT = dirname(INDEX);

const order = [...readFileSync(INDEX, 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!order.length) throw new Error(`no <script src> tags in ${INDEX}`);

/* Bodies passed to these never run while the file is loading. */
const DEFERRED = new Set([
  'setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback',
  'addEventListener', 'then', 'catch', 'finally', 'observe', 'onload', 'queueMicrotask',
]);

const GLOBALS = new Set([
  'undefined', 'NaN', 'Infinity', 'globalThis', 'window', 'document', 'navigator', 'location',
  'localStorage', 'sessionStorage', 'console', 'Math', 'JSON', 'Date', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'RegExp', 'Error', 'TypeError', 'RangeError', 'Promise', 'Map', 'Set',
  'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Symbol', 'Intl', 'parseInt', 'parseFloat', 'isNaN',
  'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'setTimeout',
  'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'requestIdleCallback',
  'fetch', 'Blob', 'File', 'FileReader', 'URL', 'Image', 'Notification', 'MutationObserver',
  'IntersectionObserver', 'indexedDB', 'IDBKeyRange', 'CustomEvent', 'Event', 'NodeFilter',
  'performance', 'crypto', 'atob', 'btoa', 'structuredClone', 'BigInt', 'Function', 'arguments',
  'caches', 'screen', 'history', 'matchMedia', 'ServiceWorker', 'AbortController', 'TextEncoder',
  'TextDecoder', 'Uint8Array', 'ArrayBuffer', 'DataView', 'Element', 'HTMLElement', 'Node',
]);

/* --- a small walker over every acorn node ------------------------------- */
function walk(node, visit, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, visit, node));
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

/* --- what a file declares at the top level ------------------------------ */
function declaredAtTopLevel(ast) {
  const names = new Set();
  for (const stmt of ast.body) collectDecl(stmt, names, true);
  return names;
}
function collectDecl(node, into, topOnly) {
  if (!node) return;
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
    if (node.id) into.add(node.id.name);
    return;
  }
  if (node.type === 'VariableDeclaration') {
    node.declarations.forEach(d => patternNames(d.id, into));
    return;
  }
  // `var` inside a top-level block/if/try is still a global
  if (!topOnly) return;
  if (node.type === 'BlockStatement' || node.type === 'Program') node.body.forEach(s => collectDecl(s, into, true));
  else if (node.type === 'IfStatement') { collectDecl(node.consequent, into, true); collectDecl(node.alternate, into, true); }
  else if (node.type === 'TryStatement') { collectDecl(node.block, into, true); if (node.handler) collectDecl(node.handler.body, into, true); collectDecl(node.finalizer, into, true); }
  else if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') { collectDecl(node.init, into, true); collectDecl(node.left, into, true); collectDecl(node.body, into, true); }
  else if (node.type === 'WhileStatement' || node.type === 'DoWhileStatement' || node.type === 'LabeledStatement') collectDecl(node.body, into, true);
}
function patternNames(pat, into) {
  if (!pat) return;
  if (pat.type === 'Identifier') into.add(pat.name);
  else if (pat.type === 'ObjectPattern') pat.properties.forEach(p => patternNames(p.value || p.argument, into));
  else if (pat.type === 'ArrayPattern') pat.elements.forEach(e => patternNames(e, into));
  else if (pat.type === 'AssignmentPattern') patternNames(pat.left, into);
  else if (pat.type === 'RestElement') patternNames(pat.argument, into);
}

/* --- what a file reaches for while it loads ------------------------------ */
function loadTimeRefs(ast) {
  const refs = new Map();   // name -> first line seen
  const bound = new Set();  // every name bound anywhere inside what we walk

  const note = (n, line) => { if (!refs.has(n)) refs.set(n, line); };

  function scan(node) {
    walk(node, (n, parent) => {
      // a function that will not run now: note its name, skip its body
      if (n.type === 'FunctionDeclaration') { if (n.id) bound.add(n.id.name); return false; }
      if ((n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression')) {
        n.params.forEach(p => patternNames(p, bound));
        if (n.id) bound.add(n.id.name);
        if (!runsNow(n, parent)) return false;
        return true;
      }
      if (n.type === 'VariableDeclaration') n.declarations.forEach(d => patternNames(d.id, bound));
      if (n.type === 'CatchClause' && n.param) patternNames(n.param, bound);
      if (n.type === 'ClassDeclaration' && n.id) bound.add(n.id.name);

      if (n.type === 'MemberExpression' && !n.computed) { walk(n.object, () => true) , scan2(n.object); return false; }
      if (n.type === 'Property' && !n.computed && n.key === n.value) { /* shorthand */ }
      if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && n.key !== n.value) { scan2(n.value); return false; }
      if (n.type === 'LabeledStatement') { scan2(n.body); return false; }
      if (n.type === 'Identifier' && parent && parent.type !== 'MemberExpression') note(n.name, n.loc && n.loc.start.line);
      if (n.type === 'Identifier' && parent && parent.type === 'MemberExpression' && parent.object === n) note(n.name, n.loc && n.loc.start.line);
      return true;
    });
  }
  const scan2 = scan;

  /* An anonymous function runs during load when it is invoked straight away
   * (an IIFE) or handed to something that calls it straight away — forEach,
   * map, filter and friends — but not when it is handed to a timer or an
   * event target. */
  function runsNow(fn, parent) {
    if (!parent) return false;
    if (parent.type === 'CallExpression' && parent.callee === fn) return true;      // (function(){})()
    if (parent.type === 'CallExpression' && parent.arguments.includes(fn)) {
      const callee = parent.callee;
      const name = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name
        : callee.type === 'Identifier' ? callee.name : '';
      return !DEFERRED.has(name);
    }
    return false;
  }

  ast.body.forEach(stmt => { if (stmt.type !== 'FunctionDeclaration') scan(stmt); });
  return { refs, bound };
}

/* --- run ----------------------------------------------------------------- */
const declaredBy = new Map();   // name -> first file that declares it
const problems = [];

for (const rel of order) {
  const file = resolve(ROOT, rel);
  const src = readFileSync(file, 'utf8');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });

  const { refs, bound } = loadTimeRefs(ast);
  const here = declaredAtTopLevel(ast);

  for (const [name, line] of refs) {
    if (GLOBALS.has(name) || bound.has(name) || here.has(name) || declaredBy.has(name)) continue;
    problems.push({ rel, line, name });
  }
  for (const n of here) if (!declaredBy.has(n)) declaredBy.set(n, rel);
}

if (!problems.length) {
  console.log(`✓ ${order.length} files: nothing runs at load time that a later file declares`);
  process.exit(0);
}

/* Only the ones a later file does define are real ordering faults; the rest are
 * names nothing declares at all, which is worth printing separately. */
const ordering = problems.filter(p => declaredBy.has(p.name));
const unknown = problems.filter(p => !declaredBy.has(p.name));

if (ordering.length) {
  console.log(`✗ ${ordering.length} load-time forward reference(s):`);
  for (const p of ordering) console.log(`   ${p.rel}:${p.line} uses ${p.name}, declared later in ${declaredBy.get(p.name)}`);
}
if (unknown.length) {
  console.log(`\n· ${unknown.length} name(s) nothing in the bundle declares (browser globals or genuinely missing):`);
  for (const p of unknown) console.log(`   ${p.rel}:${p.line} ${p.name}`);
}
process.exit(ordering.length ? 1 : 0);
