/*
 * verify.js — grading that does not need a model.
 *
 * The brief's §80 is the constraint that shaped this file: progression must be
 * deterministic and must work with no AI key present. So every activity type
 * in the seeded trees has a real, mechanical grader:
 *
 *   quiz      — answers are known; scored exactly.
 *   code      — the submitted function is executed against test cases and the
 *               results compared. This actually runs the learner's code, which
 *               is why a JavaScript challenge here can be graded honestly.
 *   numeric   — mathematics answers compared with a tolerance, accepting the
 *               several forms a correct answer legitimately takes (0.5, 1/2).
 *   checklist — self-attested, and scored as such rather than pretending to be
 *               objective. Used where the skill is physical (calisthenics) or
 *               is a real-world project no sandbox can inspect.
 *
 * AI, when a key is present, adds qualitative feedback on top of these — it
 * does not replace them and cannot overrule a failing test.
 *
 * ---------------------------------------------------------------------------
 * On running submitted code: this evaluates strings the user typed, in their
 * own browser, against their own data. That is the feature — it is a code
 * exercise. It is not a sandbox boundary and is not treated as one: nothing
 * here is a trust boundary because there is no second party to protect. The
 * timeout below exists to catch the accidental infinite loop a learner writes
 * while working out a while condition, not to contain hostile code.
 */

/** Deep structural equality, with the numeric tolerance floats demand. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Math.abs(a - b) < 1e-9;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** Readable rendering of a value in a test-result row. */
export function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v); } catch { return String(v); }
}

/* ------------------------------------------------------------------ *
 * Quizzes
 * ------------------------------------------------------------------ */

/**
 * Grade a quiz. `answers` is an array of chosen option indexes, positionally
 * matched to questions; anything unanswered counts as wrong rather than being
 * skipped, because skipping would let a learner answer one question out of ten
 * and score 100%.
 */
export function gradeQuiz(activity, answers) {
  const questions = activity.questions || [];
  const results = questions.map((question, i) => {
    const chosen = answers[i];
    const correct = chosen === question.answer;
    return {
      index: i,
      prompt: question.prompt,
      chosen: chosen ?? null,
      correctIndex: question.answer,
      correct,
      explain: question.explain,
    };
  });

  const right = results.filter((r) => r.correct).length;
  const score = questions.length ? Math.round((right / questions.length) * 100) : 0;

  return {
    kind: 'quiz',
    score,
    /* 70% to pass. Two wrong out of three is a fail; one wrong out of four is
     * not, which matches how much a single slip should cost. */
    passed: score >= 70,
    right,
    total: questions.length,
    results,
  };
}

/* ------------------------------------------------------------------ *
 * Code
 * ------------------------------------------------------------------ */

/*
 * Runaway loops.
 *
 * The obvious guard — race the call against a timer — does not work, and it is
 * worth being explicit about why, because it looks like it should. JavaScript
 * is single-threaded: a synchronous `while (true) {}` never yields, so the
 * timer callback cannot run and the race never settles. The tab freezes and
 * the learner loses their work. A `for` loop with a mistyped condition is one
 * of the most common things a beginner writes, so this is a real path, not a
 * theoretical one.
 *
 * The fix is to make the loop itself yield a decision: before each iteration,
 * check the clock and throw if we are past the deadline. That means rewriting
 * loop conditions in the submitted source, which in turn means finding loop
 * keywords without being fooled by the ones inside strings and comments.
 * Hence the small scanner below rather than a regex.
 *
 * `for (const x of ...)` and `for (... in ...)` are left alone: they have no
 * condition slot to inject into, and an infinite one requires a hand-written
 * endless generator, which is not the accident this guards against.
 */
function injectLoopGuards(source) {
  const out = [];
  let i = 0;
  let injected = 0;

  const isIdentChar = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    /* Skip over anything whose contents must not be interpreted as code. */
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === c) { j += 1; break; }
        j += 1;
      }
      out.push(source.slice(i, j));
      i = j;
      continue;
    }

    /* A loop keyword, only when it stands alone as a token. */
    const before = i === 0 ? '' : source[i - 1];
    const isBoundary = !isIdentChar(before);
    const rest = source.slice(i);
    const match = isBoundary && /^(while|for)\s*\(/.exec(rest);

    if (match) {
      const keyword = match[1];
      const openIdx = i + match[0].length - 1;

      /* Find the matching close paren, again skipping strings. */
      let depth = 0;
      let j = openIdx;
      for (; j < source.length; j += 1) {
        const ch = source[j];
        if (ch === '"' || ch === "'" || ch === '`') {
          let k = j + 1;
          while (k < source.length) {
            if (source[k] === '\\') { k += 2; continue; }
            if (source[k] === ch) break;
            k += 1;
          }
          j = k;
          continue;
        }
        if (ch === '(') depth += 1;
        else if (ch === ')') { depth -= 1; if (depth === 0) break; }
      }
      if (j >= source.length) { out.push(rest); break; }

      const inner = source.slice(openIdx + 1, j);
      let rewritten = null;

      if (keyword === 'while') {
        rewritten = `(__tick(), ${inner.trim() || 'true'})`;
      } else {
        /* A classic for-loop has two top-level semicolons; for-of/for-in has
         * none, and is left untouched. */
        const parts = splitTopLevel(inner);
        if (parts.length === 3) {
          parts[1] = `(__tick(), ${parts[1].trim() || 'true'})`;
          rewritten = parts.join(';');
        }
      }

      if (rewritten !== null) {
        out.push(`${keyword} (${rewritten})`);
        injected += 1;
        i = j + 1;
        continue;
      }
    }

    out.push(c);
    i += 1;
  }

  return { source: out.join(''), injected };
}

/** Split a for-header on its top-level semicolons only. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    if (c === ';' && depth === 0) { parts.push(current); current = ''; continue; }
    current += c;
  }
  parts.push(current);
  return parts;
}

/*
 * Test cases come in two shapes:
 *
 *   { args: [...], expected }  — call the entry function with these arguments
 *   { call: 'js…',  expected }  — a snippet whose returned value is compared,
 *                                 for anything that needs several calls or has
 *                                 to check that the input was not mutated
 *
 * The second form is what lets a challenge assert immutability, which is
 * exactly the property a naive solution gets wrong.
 */
function buildRunner(source, entry, test, timeoutMs) {
  const guarded = injectLoopGuards(source);
  const preamble = `const __deadline = Date.now() + ${Number(timeoutMs) || 2000};\n`
    + 'function __tick() { if (Date.now() > __deadline) throw new Error('
    + `'timed out after ${Number(timeoutMs) || 2000}ms — check your loop condition'); }\n`;

  const body = test.call
    ? `${preamble}${guarded.source}\nreturn (async () => { ${test.call} })();`
    : `${preamble}${guarded.source}\nreturn (async () => ${entry}(...__args))();`;
  /* eslint-disable-next-line no-new-func */
  return new Function('__args', body);
}

/*
 * Test fixtures must be copied before every run, and this is not a nicety.
 *
 * The arguments live in the tree data, which is a module-level constant shared
 * by every attempt in the session. Several of these challenges deliberately
 * hand the learner an array and check they did not modify it — so the wrong
 * answer is *specifically* one that mutates the fixture. Without a copy, one
 * mutating submission permanently rewrites the expected inputs, and every
 * later attempt at that challenge is graded against corrupted data. The
 * failure is invisible, sticky until reload, and looks like the grader is
 * broken. Found by running a mutating solution and a correct one in sequence:
 * the correct one failed.
 */
function freshCopy(value) {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    /* structuredClone rejects functions; no fixture here contains one, but a
     * user-authored tree could, and a lost clone beats a thrown grader. */
    return JSON.parse(JSON.stringify(value));
  }
}

/** One test case. Never throws — a thrown error is a failed test, reported. */
async function runCase(source, entry, test, timeoutMs) {
  const args = freshCopy(test.args || []);
  const expected = freshCopy(test.expected);
  try {
    const fn = buildRunner(source, entry, test, timeoutMs);
    /* The guard handles synchronous loops; the race additionally catches an
     * await that never settles, which the guard cannot see. */
    const value = await Promise.race([
      Promise.resolve(fn(args)),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs + 250);
      }),
    ]);
    return {
      passed: deepEqual(value, expected),
      expected,
      actual: value,
      label: labelFor(entry, test),
      error: null,
    };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    return {
      passed: false,
      expected,
      actual: null,
      label: labelFor(entry, test),
      error: message,
      timedOut: /timed out/.test(message),
    };
  }
}

function labelFor(entry, test) {
  return test.call ? test.call : `${entry}(${(test.args || []).map(show).join(', ')})`;
}

/**
 * Run a code submission against its tests.
 *
 * Every case runs even after one fails: "3 of 6 passing, here are the three"
 * is a debugging aid, whereas stopping at the first failure just says no.
 */
export async function gradeCode(activity, source, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const tests = activity.tests || [];

  if (!source || !source.trim()) {
    return { kind: 'code', score: 0, passed: false, results: [], error: 'Nothing submitted.' };
  }

  /* A syntax error should be reported once, plainly, rather than repeated
   * identically for every one of six test cases. */
  try {
    buildRunner(source, activity.entry, tests[0] || { args: [] }, timeoutMs);
  } catch (err) {
    return {
      kind: 'code',
      score: 0,
      passed: false,
      results: [],
      error: `Syntax error: ${err.message}`,
    };
  }

  const results = [];
  for (const test of tests) {
    /* Sequential: these are sub-millisecond, and running them in order keeps
     * the reported failures in the order the learner reads them. */
    const result = await runCase(source, activity.entry, test, timeoutMs);
    results.push(result);

    /* One runaway loop means the rest will run away too. Reporting the
     * remainder as untested costs one timeout instead of six, which is the
     * difference between a two-second answer and a twelve-second freeze. */
    if (result.timedOut) {
      for (const skipped of tests.slice(results.length)) {
        results.push({
          passed: false,
          expected: skipped.expected,
          actual: null,
          label: labelFor(activity.entry, skipped),
          error: 'Not run — an earlier test timed out.',
          skipped: true,
        });
      }
      break;
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const score = tests.length ? Math.round((passedCount / tests.length) * 100) : 0;

  return {
    kind: 'code',
    score,
    /* Code either works or it does not. A partial credit pass would let
     * someone move on with a function that fails a third of its cases. */
    passed: passedCount === tests.length && tests.length > 0,
    results,
    right: passedCount,
    total: tests.length,
    error: null,
  };
}

/* ------------------------------------------------------------------ *
 * Numeric / expression answers
 * ------------------------------------------------------------------ */

/*
 * Accept the forms a correct mathematical answer actually arrives in.
 *
 * A learner answering "one half" may type 0.5, .5, 1/2, or 50% depending on
 * the question, and marking two of those wrong teaches them about the input
 * box rather than about mathematics. Parsing covers plain decimals, fractions,
 * simple constants and a leading minus.
 */
export function parseNumeric(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;

  s = s.replace(/^\+/, '');
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  s = s.replace(/pi|π/g, String(Math.PI));
  s = s.replace(/^√(\d+(?:\.\d+)?)$/, (_, n) => String(Math.sqrt(Number(n))));
  s = s.replace(/^sqrt\((\d+(?:\.\d+)?)\)$/, (_, n) => String(Math.sqrt(Number(n))));

  let value = null;
  const fraction = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    value = Number(fraction[1]) / denominator;
  } else if (/^\d+(?:\.\d+)?%$/.test(s)) {
    value = Number(s.slice(0, -1)) / 100;
  } else if (/^\.?\d+(?:\.\d+)?$/.test(s) || /^\d*\.\d+$/.test(s)) {
    value = Number(s);
  } else if (/^-?\d+(?:\.\d+)?e-?\d+$/.test(s)) {
    value = Number(s);
  }

  if (value === null || !Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Grade a set of numeric questions. Each carries its own tolerance, because
 * "2/3 to two decimal places" and "exactly 12" want different strictness.
 */
export function gradeNumeric(activity, answers) {
  const questions = activity.questions || [];
  const results = questions.map((question, i) => {
    const raw = answers[i];
    const value = parseNumeric(raw);
    const tolerance = question.tolerance ?? 1e-6;
    const correct = value !== null && Math.abs(value - question.answer) <= tolerance;
    return {
      index: i,
      prompt: question.prompt,
      given: raw ?? '',
      parsed: value,
      expected: question.answer,
      correct,
      explain: question.explain,
    };
  });

  const right = results.filter((r) => r.correct).length;
  const score = questions.length ? Math.round((right / questions.length) * 100) : 0;
  return { kind: 'numeric', score, passed: score >= 70, right, total: questions.length, results };
}

/* ------------------------------------------------------------------ *
 * Checklists
 * ------------------------------------------------------------------ */

/**
 * Self-attested completion, for skills no sandbox can observe: a physical
 * movement, or a project that lives in someone else's repository.
 *
 * This is honest about what it is. The brief is clear (§40) that a physical
 * test is not a substitute for real instruction, and pretending a tick box
 * measures a muscle-up would be the fake progress §75 rules out. So the score
 * is the proportion honestly ticked, every item has to be ticked to pass, and
 * the UI labels the result as self-reported rather than verified — which also
 * feeds `verification: 'self'` for the model in §79.
 */
export function gradeChecklist(activity, checked) {
  const items = activity.checklist || [];
  const results = items.map((item, i) => ({ index: i, item, checked: !!checked[i] }));
  const done = results.filter((r) => r.checked).length;
  const score = items.length ? Math.round((done / items.length) * 100) : 0;
  return {
    kind: 'checklist',
    score,
    passed: done === items.length && items.length > 0,
    right: done,
    total: items.length,
    results,
    selfReported: true,
  };
}

/**
 * The one entry point the activity screen calls. Dispatches on the activity's
 * own shape rather than on its `kind`, so a challenge with test cases and a
 * challenge with a checklist both work without the caller caring.
 */
export async function grade(activity, submission, opts = {}) {
  if (activity.questions && activity.questions[0] && Number.isFinite(activity.questions[0].answer)
      && !Array.isArray(activity.questions[0].options)) {
    return gradeNumeric(activity, submission.answers || []);
  }
  if (activity.questions) return gradeQuiz(activity, submission.answers || []);
  if (activity.tests) return gradeCode(activity, submission.source || '', opts);
  if (activity.checklist) return gradeChecklist(activity, submission.checked || []);

  /* A `learn` activity has nothing to grade — reading it is the completion.
   * It still returns a score so the caller has one shape to handle. */
  return { kind: 'read', score: 100, passed: true, results: [] };
}
