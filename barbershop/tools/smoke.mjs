/**
 * Checks the things that are easy to break and impossible to notice.
 *
 *   node tools/smoke.mjs
 *
 * Exits non-zero on a failure. The one that matters most is the last: the admin
 * password must never appear anywhere in the repository. Pass it on stdin, or
 * set RMB_PASSWORD, and the check verifies both that the string is absent from
 * every file and that the stored digest actually matches it.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pbkdf2Sync } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.git', 'shots'])
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.txt', ''])

let failures = 0
let warnings = 0

const pass = (msg) => console.log(`  ok    ${msg}`)
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`)
  failures++
}
const warn = (msg) => {
  console.warn(`  warn  ${msg}`)
  warnings++
}

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

const files = await walk(ROOT)
const rel = (p) => relative(ROOT, p)
const textFiles = files.filter((f) => TEXT_EXT.has(extname(f)))
const sources = await Promise.all(textFiles.map(async (f) => [rel(f), await readFile(f, 'utf8')]))
const byName = new Map(sources)

/* ------------------------------------------------- 1. every asset resolves */

console.log('\nreferences')
{
  const pages = ['index.html', 'admin.html']
  const refs = new Set()

  for (const page of pages) {
    const html = byName.get(page)
    if (!html) {
      fail(`${page} is missing`)
      continue
    }
    for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      // Only local paths are checkable — skip data:, https:, tel: and friends.
      if (!/^[a-z][a-z0-9+.-]*:/i.test(m[1])) refs.add(m[1])
    }
  }
  // Module imports, which the HTML never names.
  for (const [name, body] of sources) {
    if (!name.startsWith('src/js/')) continue
    for (const m of body.matchAll(/from '(\.[^']+)'/g)) {
      refs.add(join('src/js', m[1]).replaceAll('\\', '/'))
    }
  }
  // Fonts, which fonts.css names relative to itself.
  const fontCss = byName.get('assets/fonts/fonts.css') ?? ''
  for (const m of fontCss.matchAll(/url\(\.\/([^)]+)\)/g)) refs.add(`assets/fonts/${m[1]}`)

  let missing = 0
  for (const ref of refs) {
    if (!existsSync(join(ROOT, ref))) {
      fail(`referenced but not on disk: ${ref}`)
      missing++
    }
  }
  if (!missing) pass(`${refs.size} referenced files all exist`)
}

/* ------------------------------------------ 2. every photo is actually used */

console.log('\nphotos')
{
  const onDisk = files.filter((f) => rel(f).startsWith('assets/img/')).map((f) => rel(f))
  const allText = sources.map(([, body]) => body).join('\n')
  const unused = onDisk.filter((p) => !allText.includes(p.split('/').pop().replace('.jpg', '')))
  if (unused.length) warn(`downloaded but never shown: ${unused.join(', ')}`)
  else pass(`${onDisk.length} photographs, all referenced`)

  for (const p of onDisk) {
    const { size } = await stat(join(ROOT, p))
    if (size > 700 * 1024) warn(`${p} is ${(size / 1024).toFixed(0)} KB — consider a smaller width`)
  }
}

/* ------------------------------------------------------ 3. the CSP is there */

console.log('\ncontent-security-policy')
for (const page of ['index.html', 'admin.html']) {
  const html = byName.get(page) ?? ''
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]
  if (!csp) {
    fail(`${page} has no CSP`)
    continue
  }
  if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) {
    fail(`${page} CSP allows unsafe-inline or unsafe-eval`)
  } else if (!csp.includes("default-src 'none'")) {
    fail(`${page} CSP does not default to 'none'`)
  } else {
    pass(`${page} — strict CSP, no unsafe directives`)
  }

  if (/<script(?![^>]*\bsrc=)/.test(html)) fail(`${page} contains an inline <script>, which the CSP blocks`)
  if (/\sstyle="/.test(html)) fail(`${page} contains an inline style attribute, which the CSP blocks`)
}

/* ------------------------------------------------- 3b. the single-file build */

console.log('\nsingle-file build')
{
  const built = sources.filter(([name]) => name.startsWith('dist/') && name.endsWith('.html'))
  if (!built.length) {
    warn('no bundle in dist/ — run: node tools/build-single.mjs')
  }
  for (const [name, html] of built) {
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ''

    // The bundle inlines its script and style, so 'self' would block both. The
    // only acceptable substitute is a hash — never 'unsafe-inline'.
    if (csp.includes("'unsafe-inline'")) fail(`${name} CSP allows unsafe-inline`)
    else if (!/script-src 'sha256-/.test(csp) || !/style-src 'sha256-/.test(csp)) {
      fail(`${name} does not pin its inline script and style by hash`)
    } else pass(`${name} — inline script and style pinned by sha256`)

    if (/(?:href|src)="(?!data:|#|https:|tel:|mailto:)[^"]+"/.test(html)) {
      fail(`${name} still points at a file outside itself — it would break off a server`)
    } else pass(`${name} — self-contained, no reference leaves the document`)
  }
}

/* --------------------------------------------- 4. no innerHTML on user data */

console.log('\ninjection surface')
{
  const offenders = sources.filter(
    ([name, body]) => name.startsWith('src/js/') && /\.(innerHTML|outerHTML)\s*=/.test(body),
  )
  if (offenders.length) fail(`assigns innerHTML: ${offenders.map(([n]) => n).join(', ')}`)
  else pass('no innerHTML or outerHTML assignment anywhere in src/js')

  const evals = sources.filter(([name, body]) => name.startsWith('src/js/') && /\beval\(|new Function\(/.test(body))
  if (evals.length) fail(`uses eval: ${evals.map(([n]) => n).join(', ')}`)
  else pass('no eval and no Function constructor')
}

/* ------------------------------------------------- 5. the placeholder phone */

console.log('\nconfiguration')
{
  const config = byName.get('src/js/config.js') ?? ''
  if (config.includes("phoneE164: '972500000000'")) {
    warn("BUSINESS.phoneE164 is still the placeholder — the WhatsApp button will not reach anyone. Edit src/js/config.js.")
  } else {
    pass('BUSINESS.phoneE164 has been set to a real number')
  }
}

/* ------------------------------------------------------ 6. the password rule */

console.log('\nadmin password')
{
  const auth = byName.get('src/js/auth.js') ?? ''
  const salt = auth.match(/const SALT_HEX = '([0-9a-f]+)'/)?.[1]
  const hash = auth.match(/const HASH_HEX = '([0-9a-f]+)'/)?.[1]
  const iterations = Number(auth.match(/const ITERATIONS = (\d+)/)?.[1])

  if (!salt || !hash || !iterations) {
    fail('src/js/auth.js does not carry a salt, a hash and an iteration count')
  } else if (salt.length !== 32 || hash.length !== 64) {
    fail('the salt should be 16 bytes and the digest 32')
  } else if (iterations < 100000) {
    fail(`only ${iterations} PBKDF2 iterations — too few to slow an offline guess`)
  } else {
    pass(`PBKDF2-SHA256, ${iterations.toLocaleString('en-US')} iterations, 16-byte salt`)
  }

  const secret = process.env.RMB_PASSWORD ?? (await readStdin())
  if (!secret) {
    warn('no password given, so the leak check was skipped — run: RMB_PASSWORD=… node tools/smoke.mjs')
  } else {
    const leaked = sources.filter(([, body]) => body.includes(secret)).map(([name]) => name)
    if (leaked.length) fail(`THE PASSWORD APPEARS IN: ${leaked.join(', ')}`)
    else pass('the password does not appear in any file in the repository')

    const derived = pbkdf2Sync(secret.normalize('NFKC'), Buffer.from(salt, 'hex'), iterations, 32, 'sha256')
    if (derived.toString('hex') === hash) pass('the stored digest matches that password')
    else fail('the stored digest does NOT match that password — the lock screen will reject it')
  }
}

/** Reads a piped password, if one was piped. Never prompts. */
async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').trim()
}

/* -------------------------------------------------------------------- done */

console.log(
  `\n${failures ? '✗' : '✓'} ${failures} failure${failures === 1 ? '' : 's'}, ` +
    `${warnings} warning${warnings === 1 ? '' : 's'}\n`,
)
process.exit(failures ? 1 : 0)
