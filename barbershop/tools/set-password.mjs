/**
 * Changes the admin password.
 *
 *   node tools/set-password.mjs
 *
 * Prompts without echoing, derives a fresh salt and PBKDF2 digest, and rewrites
 * the three constants at the top of src/js/auth.js. The password itself is never
 * printed, never written to a file, and never stored in your shell history —
 * which is exactly why it is prompted for rather than passed as an argument.
 */

import { randomBytes, pbkdf2Sync } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const AUTH_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js', 'auth.js')
const ITERATIONS = 310000

/** Reads a line from the terminal with echo switched off. */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const onData = (char) => {
      // Redraw the prompt without the typed characters after every keystroke.
      if (![`\n`, `\r`, ``].includes(String(char))) {
        process.stdout.clearLine(0)
        process.stdout.cursorTo(0)
        process.stdout.write(question)
      }
    }
    process.stdin.on('data', onData)
    rl.question(question, (answer) => {
      process.stdin.off('data', onData)
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const password = await prompt('סיסמת המנהל החדשה: ')
if (password.length < 8) {
  console.error('\nהסיסמה קצרה מדי — לפחות 8 תווים.')
  process.exit(1)
}
const again = await prompt('שוב, לאימות: ')
if (password !== again) {
  console.error('\nהסיסמאות לא זהות. לא שיניתי כלום.')
  process.exit(1)
}

const salt = randomBytes(16)
const hash = pbkdf2Sync(password.normalize('NFKC'), salt, ITERATIONS, 32, 'sha256')

const source = await readFile(AUTH_FILE, 'utf8')
const updated = source
  .replace(/const SALT_HEX = '[0-9a-f]*'/, `const SALT_HEX = '${salt.toString('hex')}'`)
  .replace(/const HASH_HEX = '[0-9a-f]*'/, `const HASH_HEX = '${hash.toString('hex')}'`)
  .replace(/const ITERATIONS = \d+/, `const ITERATIONS = ${ITERATIONS}`)

if (updated === source) {
  console.error('\nלא מצאתי את הקבועים ב-src/js/auth.js. לא שיניתי כלום.')
  process.exit(1)
}

await writeFile(AUTH_FILE, updated)
console.log('\nהסיסמה עודכנה ב-src/js/auth.js. צריך לעשות commit ו-push כדי שזה יעלה לאתר.')
