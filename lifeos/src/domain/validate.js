/*
 * validate.js — a small schema validator.
 *
 * The specification asks for Zod. Zod is a dependency, this repository has
 * none by construction, and what the app actually needs from it is about
 * ninety lines: describe a shape, coerce and clamp what comes in, and report
 * which field failed and why. So: the same combinator API, in the file.
 *
 * There are two callers and they want different things from a failure, which
 * is why every schema has both `parse` and `coerce`:
 *
 *   parse   — a form submission. A bad field is an error the person can fix,
 *             so it comes back as {ok:false, errors:[{path, code}]} and the
 *             field turns red.
 *
 *   coerce  — a model's tool call, or a record read back from storage after a
 *             version change. There is no person to correct it and refusing
 *             the whole object would throw away the nine fields that were
 *             fine, so bad fields fall back to their defaults and the object
 *             survives. This is what stops one malformed field in an AI
 *             response from discarding an otherwise usable plan.
 *
 * Every message is a code, not a sentence. Sentences live in the Hebrew
 * catalogue where the audit can see them.
 */

export const CODES = {
  REQUIRED: 'required',
  TYPE: 'type',
  MIN: 'min',
  MAX: 'max',
  ENUM: 'enum',
  PATTERN: 'pattern',
  INT: 'int',
  DATE: 'date',
  TIME: 'time',
};

function fail(path, code, extra) {
  return Object.assign({ path, code }, extra || {});
}

function makeSchema(spec) {
  return {
    ...spec,
    /** Strict: returns {ok, value, errors}. */
    parse(value, path) {
      return spec.run(value, path || '', false);
    },
    /** Lenient: always returns a value, substituting defaults for bad input. */
    coerce(value) {
      const result = spec.run(value, '', true);
      return result.value;
    },
    optional(fallback) {
      return makeSchema({
        kind: spec.kind,
        default: fallback,
        run(value, path, lenient) {
          if (value === undefined || value === null || value === '') {
            return { ok: true, value: fallback === undefined ? null : fallback, errors: [] };
          }
          return spec.run(value, path, lenient);
        },
      });
    },
  };
}

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

export function str(opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'string',
    run(value, path, lenient) {
      if (value === undefined || value === null) {
        if (o.default !== undefined) return { ok: true, value: o.default, errors: [] };
        return lenient
          ? { ok: true, value: '', errors: [] }
          : { ok: false, value: '', errors: [fail(path, CODES.REQUIRED)] };
      }
      let s = String(value);
      if (o.trim !== false) s = s.trim();
      if (o.max && s.length > o.max) {
        if (lenient) s = s.slice(0, o.max);
        else return { ok: false, value: s, errors: [fail(path, CODES.MAX, { max: o.max })] };
      }
      if (o.min && s.length < o.min) {
        return lenient
          ? { ok: true, value: o.default === undefined ? s : o.default, errors: [] }
          : { ok: false, value: s, errors: [fail(path, CODES.MIN, { min: o.min })] };
      }
      if (o.pattern && s && !o.pattern.test(s)) {
        return lenient
          ? { ok: true, value: o.default === undefined ? '' : o.default, errors: [] }
          : { ok: false, value: s, errors: [fail(path, CODES.PATTERN)] };
      }
      return { ok: true, value: s, errors: [] };
    },
  });
}

export function num(opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'number',
    run(value, path, lenient) {
      const fallback = o.default === undefined ? (o.min === undefined ? 0 : o.min) : o.default;
      if (value === undefined || value === null || value === '') {
        return o.default !== undefined || lenient
          ? { ok: true, value: fallback, errors: [] }
          : { ok: false, value: fallback, errors: [fail(path, CODES.REQUIRED)] };
      }
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(n)) {
        return lenient
          ? { ok: true, value: fallback, errors: [] }
          : { ok: false, value: fallback, errors: [fail(path, CODES.TYPE)] };
      }
      let out = o.int ? Math.round(n) : n;
      if (o.min !== undefined && out < o.min) {
        if (lenient) out = o.min;
        else return { ok: false, value: out, errors: [fail(path, CODES.MIN, { min: o.min })] };
      }
      if (o.max !== undefined && out > o.max) {
        if (lenient) out = o.max;
        else return { ok: false, value: out, errors: [fail(path, CODES.MAX, { max: o.max })] };
      }
      return { ok: true, value: out, errors: [] };
    },
  });
}

export function bool(opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'boolean',
    run(value) {
      if (value === undefined || value === null) return { ok: true, value: !!o.default, errors: [] };
      return { ok: true, value: value === true || value === 'true' || value === 1, errors: [] };
    },
  });
}

export function oneOf(values, opts) {
  const o = opts || {};
  const allowed = new Set(values);
  return makeSchema({
    kind: 'enum',
    values,
    run(value, path, lenient) {
      const fallback = o.default === undefined ? values[0] : o.default;
      if (allowed.has(value)) return { ok: true, value, errors: [] };

      /*
       * An ABSENT field with a declared default is not an error — that is what
       * a default is for. Only a field that is present and wrong is.
       *
       * This distinction was missing, and the consequence was not subtle: a
       * form that did not explicitly set energyLevel and recurrence could not
       * create a task at all, because strict parse rejected both. Every enum
       * in the schema carries a default, so every create() went through this
       * path.
       */
      const absent = value === undefined || value === null || value === '';
      if (absent && o.default !== undefined) return { ok: true, value: fallback, errors: [] };

      return lenient
        ? { ok: true, value: fallback, errors: [] }
        : { ok: false, value: fallback, errors: [fail(path, CODES.ENUM, { allowed: values })] };
    },
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'isoDate',
    run(value, path, lenient) {
      if (value === undefined || value === null || value === '') {
        return o.required && !lenient
          ? { ok: false, value: null, errors: [fail(path, CODES.REQUIRED)] }
          : { ok: true, value: null, errors: [] };
      }
      const s = String(value).slice(0, 10);
      if (!ISO_DATE.test(s)) {
        return lenient
          ? { ok: true, value: null, errors: [] }
          : { ok: false, value: null, errors: [fail(path, CODES.DATE)] };
      }
      /* Rejects 2026-02-31, which the pattern happily accepts. */
      const [y, m, d] = s.split('-').map(Number);
      const probe = new Date(Date.UTC(y, m - 1, d));
      const real = probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
      if (!real) {
        return lenient
          ? { ok: true, value: null, errors: [] }
          : { ok: false, value: null, errors: [fail(path, CODES.DATE)] };
      }
      return { ok: true, value: s, errors: [] };
    },
  });
}

/** Minutes after midnight. 0–1440, where 1440 is midnight at the far end. */
export function minuteOfDay(opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'minuteOfDay',
    run(value, path, lenient) {
      if (value === undefined || value === null || value === '') {
        return o.required && !lenient
          ? { ok: false, value: null, errors: [fail(path, CODES.REQUIRED)] }
          : { ok: true, value: o.default === undefined ? null : o.default, errors: [] };
      }
      let n = value;
      if (typeof value === 'string' && value.includes(':')) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
        if (!m) {
          return lenient
            ? { ok: true, value: o.default === undefined ? null : o.default, errors: [] }
            : { ok: false, value: null, errors: [fail(path, CODES.TIME)] };
        }
        n = Number(m[1]) * 60 + Number(m[2]);
      }
      n = Math.round(Number(n));
      if (!Number.isFinite(n) || n < 0 || n > 1440) {
        return lenient
          ? { ok: true, value: o.default === undefined ? null : o.default, errors: [] }
          : { ok: false, value: null, errors: [fail(path, CODES.TIME)] };
      }
      return { ok: true, value: n, errors: [] };
    },
  });
}

export function id(opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'id',
    run(value, path, lenient) {
      if (value === undefined || value === null || value === '') {
        return o.required && !lenient
          ? { ok: false, value: null, errors: [fail(path, CODES.REQUIRED)] }
          : { ok: true, value: null, errors: [] };
      }
      const s = String(value);
      /* Ids are generated by db.newId and never contain anything exotic. A
       * value that does not look like one is far more likely to be a model
       * inventing an id than a real record, so it is dropped here before the
       * reference guard even has to look at it. */
      if (!/^[\w-]{1,64}$/.test(s)) {
        return lenient
          ? { ok: true, value: null, errors: [] }
          : { ok: false, value: null, errors: [fail(path, CODES.PATTERN)] };
      }
      return { ok: true, value: s, errors: [] };
    },
  });
}

export function arrayOf(inner, opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'array',
    run(value, path, lenient) {
      if (value === undefined || value === null) return { ok: true, value: [], errors: [] };
      if (!Array.isArray(value)) {
        return lenient
          ? { ok: true, value: [], errors: [] }
          : { ok: false, value: [], errors: [fail(path, CODES.TYPE)] };
      }
      const out = [];
      const errors = [];
      const capped = o.max ? value.slice(0, o.max) : value;
      capped.forEach((item, i) => {
        const r = inner.parse(item, `${path}[${i}]`);
        if (r.ok) out.push(r.value);
        else if (lenient) { /* drop the bad element, keep the list */ }
        else errors.push(...r.errors);
      });
      if (!lenient && o.min && out.length < o.min) errors.push(fail(path, CODES.MIN, { min: o.min }));
      return { ok: errors.length === 0, value: out, errors };
    },
  });
}

export function object(shape, opts) {
  const o = opts || {};
  return makeSchema({
    kind: 'object',
    shape,
    run(value, path, lenient) {
      const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      if (!lenient && (!value || typeof value !== 'object' || Array.isArray(value))) {
        return { ok: false, value: {}, errors: [fail(path, CODES.TYPE)] };
      }
      const out = {};
      const errors = [];
      for (const key of Object.keys(shape)) {
        const child = `${path ? `${path}.` : ''}${key}`;
        const r = shape[key].parse(src[key], child);
        out[key] = r.value;
        if (!r.ok && !lenient) errors.push(...r.errors);
      }
      /* Unknown keys are dropped, not carried through. A model that invents a
       * field must not have it written to storage where a later read might
       * treat it as real. */
      if (o.passthrough) {
        for (const key of Object.keys(src)) if (!(key in shape)) out[key] = src[key];
      }
      return { ok: errors.length === 0, value: out, errors };
    },
  });
}

/** First error per field, keyed by path — the shape a form wants. */
export function errorMap(errors) {
  const map = {};
  for (const e of errors || []) if (!(e.path in map)) map[e.path] = e;
  return map;
}
