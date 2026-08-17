/**
 * Downloads everything the site serves from its own origin: the photographs and
 * the two Hebrew typefaces. Run it once after cloning, or again whenever a photo
 * in the list below is swapped out.
 *
 *   node tools/fetch-assets.mjs
 *
 * Nothing here runs in the browser. The site itself never talks to a third party,
 * which is why its Content-Security-Policy can name no host but 'self'.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG_DIR = join(ROOT, 'assets', 'img')
const FONT_DIR = join(ROOT, 'assets', 'fonts')

/* ---------------------------------------------------------------- photographs
 * Unsplash, whose licence covers commercial use without permission. Credit is
 * not required by the licence; assets/CREDITS.md carries it anyway.
 * `landscape` decides the crop ratio the CDN renders, so a portrait shot is not
 * squashed into a 16:9 box before it ever reaches the gallery. */
const PHOTOS = [
  { file: 'hero',          id: 'photo-1585747860715-2ba37e788b70', w: 2000, landscape: true,  alt: 'חלל המספרה — שלוש כורסאות ברבר עתיקות מול קיר לבנים ותאורה חמה' },
  { file: 'cut-fade',      id: 'photo-1599351431202-1e0f0137899a', w: 1100, landscape: false, alt: 'פייד גבוה עם קו תער חד לאורך הרקה' },
  { file: 'cut-crop',      id: 'photo-1622286342621-4bd786c2447c', w: 1400, landscape: true,  alt: 'קרופ מרקמי עם מעבר מדורג בצדדים' },
  { file: 'cut-pompadour', id: 'photo-1614252369475-531eba835eb1', w: 1100, landscape: false, alt: 'פומפדור מסורק לאחור עם צדדים קצרים' },
  { file: 'cut-classic',   id: 'photo-1493256338651-d82f7acb2b38', w: 1400, landscape: true,  alt: 'מכונת תספורת מסדרת את קו העורף בתספורת קלאסית' },
  { file: 'cut-shave',     id: 'photo-1596728325488-58c87691e9af', w: 1400, landscape: true,  alt: 'גילוח בתער ישר אחרי מגבת חמה' },
  { file: 'cut-beard',     id: 'photo-1503951914875-452162b0f3f1', w: 1400, landscape: true,  alt: 'עיצוב זקן במספריים' },
  { file: 'cut-curls',     id: 'photo-1567894340315-735d7c361db0', w: 1100, landscape: false, alt: 'תלתלים מעוצבים מעל פייד נקי' },
  { file: 'cut-kids',      id: 'photo-1622287162716-f311baa1a2b8', w: 1400, landscape: true,  alt: 'תספורת ילדים בכיסא הברבר' },
  { file: 'about',         id: 'photo-1517832606299-7ae9b720a186', w: 1100, landscape: false, alt: 'מספריים מסדרות זקן, צילום שחור־לבן' },
  { file: 'tools',         id: 'photo-1621605815971-fbc98d665033', w: 1400, landscape: true,  alt: 'מכונות תספורת, מספריים, מסרק ופומייד מסודרים על משטח אבן' },
]

/* --------------------------------------------------------------------- fonts
 * Both families are licensed under the SIL Open Font License 1.1, which permits
 * redistribution inside this repository. */
const FONTS = [
  { family: 'Heebo', spec: 'Heebo:wght@400;500;700' },
  { family: 'Frank Ruhl Libre', spec: 'Frank+Ruhl+Libre:wght@500;700;900' },
]
const WANTED_SUBSETS = new Set(['hebrew', 'latin', 'latin-ext'])
const WOFF2_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const force = process.argv.includes('--force')

async function get(url, headers = {}) {
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      lastErr = err
      if (attempt < 4) await new Promise((r) => setTimeout(r, 2 ** attempt * 500))
    }
  }
  throw new Error(`${url} — ${lastErr.message}`)
}

async function fetchPhotos() {
  await mkdir(IMG_DIR, { recursive: true })
  const rows = []
  for (const photo of PHOTOS) {
    const dest = join(IMG_DIR, `${photo.file}.jpg`)
    const ratio = photo.landscape ? 3 / 2 : 2 / 3
    const url =
      `https://images.unsplash.com/${photo.id}` +
      `?w=${photo.w}&h=${Math.round(photo.w / ratio)}&q=78&fm=jpg&fit=crop&crop=entropy`

    if (existsSync(dest) && !force) {
      console.log(`skip   ${photo.file}.jpg (exists)`)
    } else {
      const buf = Buffer.from(await (await get(url)).arrayBuffer())
      await writeFile(dest, buf)
      console.log(`saved  ${photo.file}.jpg  ${(buf.length / 1024).toFixed(0)} KB`)
    }
    rows.push(`| \`${photo.file}.jpg\` | [Unsplash](https://unsplash.com/photos/${photo.id.replace(/^photo-/, '')}) | Unsplash License |`)
  }
  return rows
}

/** Rewrites Google's stylesheet to point at the copies we just saved. */
async function fetchFonts() {
  await mkdir(FONT_DIR, { recursive: true })
  const blocks = []

  for (const { family, spec } of FONTS) {
    const css = await (
      await get(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`, {
        'User-Agent': WOFF2_UA,
      })
    ).text()

    // Google emits `/* subset */ @font-face {...}` pairs; the comment is the
    // only place the subset name appears, so split on it rather than parse CSS.
    const chunks = css.split(/\/\*\s*([a-z-]+)\s*\*\//i).slice(1)
    for (let i = 0; i < chunks.length; i += 2) {
      const subset = chunks[i]
      const face = chunks[i + 1]
      if (!WANTED_SUBSETS.has(subset) || !face?.includes('@font-face')) continue

      const weight = face.match(/font-weight:\s*(\d+)/)?.[1] ?? '400'
      const src = face.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1]
      if (!src) continue

      const slug = family.toLowerCase().replace(/\s+/g, '-')
      const name = `${slug}-${weight}-${subset}.woff2`
      const dest = join(FONT_DIR, name)
      if (existsSync(dest) && !force) {
        console.log(`skip   ${name} (exists)`)
      } else {
        const buf = Buffer.from(await (await get(src)).arrayBuffer())
        await writeFile(dest, buf)
        console.log(`saved  ${name}  ${(buf.length / 1024).toFixed(0)} KB`)
      }

      blocks.push(
        face
          .replace(/url\(https:\/\/[^)]+\.woff2\)/, `url(./${name})`)
          .replace(/@font-face\s*{/, `/* ${subset} */\n@font-face {`)
          .trim(),
      )
    }
  }

  await writeFile(
    join(FONT_DIR, 'fonts.css'),
    '/* Generated by tools/fetch-assets.mjs — do not edit by hand.\n' +
      '   Heebo and Frank Ruhl Libre, SIL Open Font License 1.1. */\n\n' +
      blocks.join('\n\n') +
      '\n',
  )
  console.log(`wrote  fonts.css  (${blocks.length} faces)`)
}

async function writeCredits(rows) {
  const body = [
    '# קרדיטים ורישיונות',
    '',
    '## תצלומים',
    '',
    'כל התצלומים הם צילומי סטוק להמחשה בלבד, ברישיון Unsplash — שימוש מסחרי מותר',
    'ללא בקשת רשות וללא חובת ייחוס. הקרדיט כאן ניתן מרצון.',
    '',
    '**התצלומים אינם מתעדים את המספרה או את הצוות שלה.** אין להציג אף אדם',
    'שמופיע בהם כאילו הוא בעל העסק או עובד בו.',
    '',
    '| קובץ | מקור | רישיון |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '## גופנים',
    '',
    '| משפחה | מקור | רישיון |',
    '| --- | --- | --- |',
    '| Heebo | [Google Fonts](https://fonts.google.com/specimen/Heebo) | SIL Open Font License 1.1 |',
    '| Frank Ruhl Libre | [Google Fonts](https://fonts.google.com/specimen/Frank+Ruhl+Libre) | SIL Open Font License 1.1 |',
    '',
  ].join('\n')
  await writeFile(join(ROOT, 'assets', 'CREDITS.md'), body)
  console.log('wrote  assets/CREDITS.md')
}

/** The alt text lives beside each photo here, so the gallery can stay in sync. */
async function writeAltManifest() {
  const manifest = Object.fromEntries(PHOTOS.map((p) => [p.file, p.alt]))
  const dest = join(ROOT, 'src', 'js', 'photo-alt.js')
  const existing = existsSync(dest) ? await readFile(dest, 'utf8') : ''
  const next =
    '// Generated by tools/fetch-assets.mjs — do not edit by hand.\n' +
    `export const PHOTO_ALT = ${JSON.stringify(manifest, null, 2)}\n`
  if (existing !== next) {
    await writeFile(dest, next)
    console.log('wrote  src/js/photo-alt.js')
  }
}

const rows = await fetchPhotos()
await fetchFonts()
await writeCredits(rows)
await writeAltManifest()
console.log('\nDone.')
