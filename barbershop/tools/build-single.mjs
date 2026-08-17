/**
 * Folds the whole app into one HTML file that can be opened straight off the
 * disk — no server, no folder of assets, nothing to upload. On a phone that is
 * the difference between "a website someone has to host" and "a file you can
 * send in WhatsApp and keep".
 *
 *   node tools/build-single.mjs            -> dist/ron-malka-barbershop.html
 *   node tools/build-single.mjs out.html
 *
 * The served app is two pages; the file is one document with two halves and a
 * `#admin` hash between them. Rather than keep a third copy of the markup in
 * sync, this reads index.html and admin.html and composes them, so those two
 * files stay the only source of truth.
 *
 * Deliberately small: it understands exactly the module syntax these files use
 * and stops loudly on anything else, rather than quietly emitting a broken page.
 * The approach — and the CSP-by-hash trick at the end — follow the bundler at
 * ../../tools/build-single.js that the other apps in this repository use.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, relative, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] || 'dist/ron-malka-barbershop.html'
const ENTRY = 'src/js/main-single.js'

const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')
const bytes = (p) => readFileSync(resolve(ROOT, p))
const rel = (abs) => relative(ROOT, abs).split('\\').join('/')

/* ============================================================ module bundling */

const seen = new Map()
const order = []

function collect(abs) {
  const key = rel(abs)
  if (seen.has(key)) return
  seen.set(key, null)

  const src = readFileSync(abs, 'utf8')
  refuse(src, key)

  const deps = []
  /* `[\s\S]*?` inside the braces so a named import may wrap over several lines,
   * which is how anything importing more than three symbols is written here.
   * The `m` flag still anchors the statement to its own lines. */
  const importRe =
    /^[ \t]*import\s+(?:([\w$]+)|\*\s+as\s+([\w$]+)|\{([\s\S]*?)\})\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm
  let m
  while ((m = importRe.exec(src))) {
    if (!m[4].startsWith('.')) throw new Error(`${key}: bare import "${m[4]}" — not bundleable`)
    deps.push({ ns: m[2], named: m[3], spec: m[4], raw: m[0] })
  }

  for (const d of deps) collect(resolve(dirname(abs), d.spec))

  seen.set(key, { abs, src, deps })
  order.push(key)
}

function refuse(src, key) {
  if (/\bexport\s+default\b/.test(src)) throw new Error(`${key}: export default is not supported`)
  if (/\bexport\s+\*/.test(src)) throw new Error(`${key}: export * is not supported`)
  if (/\bimport\s*\(/.test(src)) throw new Error(`${key}: dynamic import() is not supported`)
  if (/\bimport\.meta\b/.test(src)) throw new Error(`${key}: import.meta is not supported`)
}

function transform(key, mod) {
  let out = mod.src

  for (const d of mod.deps) {
    const target = rel(resolve(dirname(mod.abs), d.spec))
    const line = d.ns
      ? `const ${d.ns} = __m[${JSON.stringify(target)}];`
      : `const { ${d.named.replace(/\s+/g, ' ').trim()} } = __m[${JSON.stringify(target)}];`
    out = out.replace(d.raw, line)
  }

  const exported = new Set()

  out = out.replace(
    /^[ \t]*export\s+(?:async\s+)?(const|let|var|function|class)\s*\*?\s*([\w$]+)/gm,
    (whole, _kind, name) => {
      exported.add(name)
      return whole.replace(/export\s+/, '')
    },
  )

  out = out.replace(/^[ \t]*export\s*\{([^}]*)\};?[ \t]*$/gm, (_whole, body) => {
    for (const piece of body.split(',')) {
      const t = piece.trim()
      if (!t) continue
      const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t)
      exported.add(as ? `${as[2]}:${as[1]}` : t)
    }
    return ''
  })

  if (/^[ \t]*export\b/m.test(out)) {
    throw new Error(`${key}: leftover export statement the bundler did not understand`)
  }

  const assigns = Array.from(exported)
    .map((e) => {
      const [name, local] = e.includes(':') ? e.split(':') : [e, e]
      return `    ${JSON.stringify(name)}: ${local},`
    })
    .join('\n')

  return `__m[${JSON.stringify(key)}] = (function () {\n${out}\n  return {\n${assigns}\n  };\n})();`
}

/* ================================================================== assets */

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' }

let inlinedBytes = 0

function dataUri(path) {
  const abs = resolve(ROOT, path)
  if (!existsSync(abs)) throw new Error(`asset referenced but missing: ${path} — run tools/fetch-assets.mjs`)
  const type = MIME[extname(abs).toLowerCase()]
  if (!type) throw new Error(`no MIME type known for ${path}`)
  const buf = bytes(path)
  inlinedBytes += buf.length
  return `data:${type};base64,${buf.toString('base64')}`
}

/* ============================================================ compose the page */

const siteHtml = read('index.html')
const adminHtml = read('admin.html')

/** The admin document's body, minus the parts the combined page supplies itself. */
function adminBody() {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(adminHtml)
  if (!body) throw new Error('admin.html: could not find <body>')
  return body[1]
    .replace(/[ \t]*<script type="module"[^>]*><\/script>\s*/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, '')
    .trim()
}

/* The photographs the gallery asks for by name at runtime cannot be rewritten in
 * the markup, so they travel as a map that src/js/assets.js consults. */
const PHOTO_NAMES = [
  ...new Set(
    [...read('src/js/gallery.js').matchAll(/photo:\s*'([\w-]+)'/g)].map((m) => m[1]),
  ),
]
if (!PHOTO_NAMES.length) throw new Error('src/js/gallery.js: found no photographs to inline')

collect(resolve(ROOT, ENTRY))

const assetsKey = 'src/js/assets.js'
if (!seen.has(assetsKey)) throw new Error(`${assetsKey} is not in the module graph — nothing would inline`)
seen.get(assetsKey).src = seen.get(assetsKey).src.replace(
  'export const INLINE_PHOTOS = {}',
  'export const INLINE_PHOTOS = ' +
    JSON.stringify(Object.fromEntries(PHOTO_NAMES.map((n) => [n, dataUri(`assets/img/${n}.jpg`)]))),
)

const bundle = [
  '(function () {',
  '"use strict";',
  'const __m = {};',
  ...order.map((k) => transform(k, seen.get(k))),
  '})();',
].join('\n\n')

/* --- stylesheets, with every font file folded into the @font-face rules --- */

const cssFiles = [...siteHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1])
if (!cssFiles.includes('src/styles/admin.css')) cssFiles.push('src/styles/admin.css')

const css = cssFiles
  .map((f) => {
    const dir = dirname(f)
    return read(f).replace(/url\(\.\/([^)]+)\)/g, (_, name) => `url(${dataUri(`${dir}/${name}`)})`)
  })
  .join('\n\n')

/* --- the shell --- */

let html = siteHtml
  // The preload is pointless once the bytes are in the document.
  .replace(/\n?[ \t]*<link rel="preload"[^>]*>/g, '')
  .replace(/\n?[ \t]*<link rel="stylesheet"[^>]*>/g, '')
  .replace(/[ \t]*<script type="module"[^>]*><\/script>/, '')

// Compose before rewriting, so the diary's own links are rewritten too — the
// lock screen's "חזרה לאתר" is inside this block, and a build that rewrote only
// the shop's markup left it pointing at a file that is no longer there.
html = html.replace('</body>', `<div id="adminRoot" hidden>\n${adminBody()}\n</div>\n\n</body>`)

html = html
  // Photographs named directly in the markup.
  .replace(/src="(assets\/img\/[\w-]+\.jpg)"/g, (_, p) => `src="${dataUri(p)}"`)
  // There are no other pages to link to any more, only a hash.
  .replace(/href="admin\.html"/g, 'href="#admin"')
  .replace(/href="index\.html"/g, 'href="#top"')

if (/(?:href|src)="(?!data:|#|https:|tel:|mailto:)[^"]+"/.test(html)) {
  const stray = /(?:href|src)="(?!data:|#|https:|tel:|mailto:)([^"]+)"/.exec(html)[1]
  throw new Error(`"${stray}" survived the rewrite — it would be a dead reference in the single file`)
}

/* --- CSP ---------------------------------------------------------------
 * The served pages say script-src 'self' and style-src 'self', which is right
 * for them and fatal here: this build turns both into inline blocks. They
 * cannot be 'self', and they must not be 'unsafe-inline' — that would hand the
 * single file the exact hole the served app was hardened against. So they are
 * named by hash: these two blocks run, and nothing else. img-src and font-src
 * gain data:, because that is now where every photograph and typeface lives. */

const styleBody = `\n${css}\n`
const scriptBody = `\n${bundle}\n`
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`

function singleFileCsp(policy) {
  return policy
    .split(';')
    .map((directive) => {
      const t = directive.trim()
      if (t.startsWith('script-src')) return ` script-src ${sha(scriptBody)}`
      if (t.startsWith('style-src')) return ` style-src ${sha(styleBody)}`
      if (t.startsWith('font-src')) return ` font-src data:`
      if (t.startsWith('img-src')) return ` img-src data:`
      return directive
    })
    .join(';')
}

if (!/Content-Security-Policy/.test(html)) {
  throw new Error('index.html has no CSP meta tag — the single-file build must not ship without one')
}

html = html
  .replace(
    /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/,
    (_, a, policy, c) => a + singleFileCsp(policy) + c,
  )
  .replace('</head>', `<style>${styleBody}</style>\n</head>`)
  .replace('</body>', `<script>${scriptBody}</script>\n</body>`)

/* ==================================================================== emit */

mkdirSync(dirname(resolve(ROOT, OUT)), { recursive: true })
writeFileSync(resolve(ROOT, OUT), html)

const total = Buffer.byteLength(html)
console.log(
  `${OUT}\n` +
    `  ${order.length} modules, ${PHOTO_NAMES.length + 2} photographs, ` +
    `${(inlinedBytes / 1024 / 1024).toFixed(2)} MB of assets inlined\n` +
    `  ${(total / 1024 / 1024).toFixed(2)} MB total — open ${basename(OUT)} in a browser, no server needed`,
)
