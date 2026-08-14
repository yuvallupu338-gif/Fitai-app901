/*
 * schema.js — a small runtime validator.
 *
 * The brief asks for Zod (§56). Zod is an npm package and this repo ships no
 * dependencies, so this is the subset that job actually needs: shapes, types,
 * bounds, enums, arrays, and a `parse` that either returns clean data or an
 * error naming the exact path that failed.
 *
 * Why it exists at all is the important part. A model asked for JSON returns
 * JSON *usually*. It also returns prose around the JSON, a trailing comma, a
 * prerequisite pointing at a skill it never defined, a difficulty of 11, or a
 * cycle. Feeding any of that straight into the graph engine produces a corrupt
 * tree or an exception three screens later, where the cause is invisible. So
 * every model response is parsed here first and rejected loudly at the edge.
 *
 * Validators are plain functions: (value, path) => { ok, value, error }.
 */

const ok = (value) => ({ ok: true, value });
const bad = (path, message) => ({ ok: false, error: `${path || 'value'}: ${message}` });

export const s = {
  string({ min = 0, max = Infinity, trim = true } = {}) {
    return (v, path) => {
      if (typeof v !== 'string') return bad(path, `expected a string, got ${typeof v}`);
      const out = trim ? v.trim() : v;
      if (out.length < min) return bad(path, `must be at least ${min} characters`);
      if (out.length > max) return bad(path, `must be at most ${max} characters`);
      return ok(out);
    };
  },

  number({ min = -Infinity, max = Infinity, integer = false } = {}) {
    return (v, path) => {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return bad(path, 'expected a number');
      if (integer && !Number.isInteger(n)) return bad(path, 'expected a whole number');
      if (n < min) return bad(path, `must be at least ${min}`);
      if (n > max) return bad(path, `must be at most ${max}`);
      return ok(n);
    };
  },

  enum_(values) {
    return (v, path) => (values.includes(v) ? ok(v) : bad(path, `must be one of: ${values.join(', ')}`));
  },

  array(item, { min = 0, max = Infinity } = {}) {
    return (v, path) => {
      if (!Array.isArray(v)) return bad(path, 'expected an array');
      if (v.length < min) return bad(path, `needs at least ${min} items`);
      if (v.length > max) return bad(path, `must have at most ${max} items`);
      const out = [];
      for (let i = 0; i < v.length; i += 1) {
        const result = item(v[i], `${path}[${i}]`);
        if (!result.ok) return result;
        out.push(result.value);
      }
      return ok(out);
    };
  },

  object(shape, { strict = false } = {}) {
    return (v, path) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(path, 'expected an object');
      const out = {};
      for (const [key, validator] of Object.entries(shape)) {
        const result = validator(v[key], path ? `${path}.${key}` : key);
        if (!result.ok) return result;
        if (result.value !== undefined) out[key] = result.value;
      }
      /* Unknown keys are dropped rather than rejected by default: a model
       * adding a helpful extra field should not fail a whole tree. */
      if (strict) {
        const extra = Object.keys(v).filter((k) => !(k in shape));
        if (extra.length) return bad(path, `unexpected keys: ${extra.join(', ')}`);
      }
      return ok(out);
    };
  },

  optional(validator, fallback = undefined) {
    return (v, path) => (v === undefined || v === null ? ok(fallback) : validator(v, path));
  },
};

export function parse(validator, value) {
  return validator(value, '');
}

/*
 * Pull JSON out of a model response.
 *
 * Models wrap JSON in prose and in ``` fences even when told not to, and a
 * response that is 98% correct should not be thrown away over a code fence.
 * This tries progressively less trusting strategies before giving up — but it
 * never *repairs* the JSON, because a silently patched-up object is worse than
 * a clean rejection.
 */
export function extractJson(text) {
  if (typeof text !== 'string') return { ok: false, error: 'no text in response' };

  const attempts = [];
  attempts.push(text.trim());

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) attempts.push(fenced[1].trim());

  /* First balanced brace-or-bracket span, for the case where the model wrote
   * a sentence before the object. */
  const start = text.search(/[{[]/);
  if (start !== -1) {
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    for (let i = start; i < text.length; i += 1) {
      if (text[i] === open) depth += 1;
      else if (text[i] === close) {
        depth -= 1;
        if (depth === 0) { attempts.push(text.slice(start, i + 1)); break; }
      }
    }
  }

  for (const candidate of attempts) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      /* try the next strategy */
    }
  }
  return { ok: false, error: 'response was not valid JSON' };
}

/* ------------------------------------------------------------------ *
 * The skill tree schema
 * ------------------------------------------------------------------ */

/*
 * Ids are constrained rather than accepted as free text. They end up in URLs,
 * in dataset attributes and as Map keys, and a model given free rein produces
 * ids with spaces, slashes and emoji.
 */
const idField = (v, path) => {
  const r = s.string({ min: 1, max: 60 })(v, path);
  if (!r.ok) return r;
  const slug = r.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!slug) return bad(path, 'id has no usable characters');
  return ok(slug);
};

export const REQUIREMENT = s.object({
  skillId: idField,
  minLevel: s.optional(s.number({ min: 1, max: 5, integer: true }), 1),
});

export const SKILL = s.object({
  id: idField,
  name: s.string({ min: 1, max: 80 }),
  description: s.optional(s.string({ max: 400 }), ''),
  why: s.optional(s.string({ max: 400 }), ''),
  category: s.optional(s.string({ max: 60 }), 'General'),
  difficulty: s.optional(s.number({ min: 1, max: 5, integer: true }), 2),
  estimatedHours: s.optional(s.array(s.number({ min: 0, max: 500 }), { min: 2, max: 2 }), [2, 4]),
  requires: s.optional(s.array(REQUIREMENT, { max: 6 }), []),
});

export const GENERATED_TREE = s.object({
  name: s.string({ min: 1, max: 80 }),
  tagline: s.optional(s.string({ max: 160 }), ''),
  category: s.optional(s.string({ max: 60 }), 'Custom'),
  /* Bounded on both sides. Under five skills is not a tree; over sixty is a
   * model rambling, and it will not lay out usefully. */
  skills: s.array(SKILL, { min: 5, max: 60 }),
});

/**
 * Validate a generated tree structurally *and* graph-wise.
 *
 * Structure is not enough: a tree can satisfy every field rule and still be
 * unusable because a prerequisite names a skill that does not exist, or two
 * skills share an id, or the requirements form a cycle. Those three are the
 * failures a model actually produces, and all three are caught here rather
 * than by an exception in the layout engine.
 *
 * Dangling prerequisites are dropped with a warning rather than failing the
 * whole tree — losing one edge from a 30-skill tree is a far better outcome
 * than discarding the lot, and the warning surfaces in the review step.
 */
export function validateTree(raw, treeId) {
  const parsed = parse(GENERATED_TREE, raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const tree = parsed.value;
  const warnings = [];

  const seen = new Set();
  const skills = [];
  for (const skill of tree.skills) {
    if (seen.has(skill.id)) { warnings.push(`Dropped a duplicate skill id: ${skill.id}`); continue; }
    seen.add(skill.id);
    skills.push(skill);
  }

  for (const skill of skills) {
    const kept = [];
    for (const req of skill.requires) {
      if (req.skillId === skill.id) { warnings.push(`${skill.name} required itself; removed.`); continue; }
      if (!seen.has(req.skillId)) { warnings.push(`${skill.name} required an undefined skill "${req.skillId}"; removed.`); continue; }
      kept.push(req);
    }
    skill.requires = kept;
  }

  /* Cycle breaking. Rather than rejecting, walk the graph and drop the single
   * edge that closes each loop — the rest of the tree is usually sound, and a
   * learner who asked for a tree wants a tree, not an error. */
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const state = new Map();

  const walk = (id, stack) => {
    if (state.get(id) === 'done') return;
    state.set(id, 'open');
    const skill = byId.get(id);
    const kept = [];
    for (const req of skill.requires) {
      if (state.get(req.skillId) === 'open') {
        warnings.push(`Removed a circular requirement: ${skill.name} → ${byId.get(req.skillId).name}`);
        continue;
      }
      kept.push(req);
      walk(req.skillId, stack.concat([id]));
    }
    skill.requires = kept;
    state.set(id, 'done');
  };
  for (const skill of skills) walk(skill.id, []);

  if (!skills.some((sk) => !sk.requires.length)) {
    return { ok: false, error: 'every skill depends on another — the tree has no starting point' };
  }

  return {
    ok: true,
    warnings,
    tree: {
      id: treeId,
      name: tree.name,
      tagline: tree.tagline,
      category: tree.category,
      generated: true,
      skills: skills.map((sk) => ({ ...sk, activities: [] })),
    },
  };
}
