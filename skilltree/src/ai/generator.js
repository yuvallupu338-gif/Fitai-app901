/*
 * generator.js — "I want to learn game development" → a tree (§13).
 *
 * The pipeline is: ask the model for structured JSON, validate it against the
 * schema, repair what is safely repairable, reject what is not, and only then
 * register it. Nothing a model returns reaches the graph engine unchecked.
 *
 * The retry deserves a note. A model that returns something unparseable
 * usually returns something parseable on a second attempt with the failure
 * quoted back to it — that is a far better user experience than an error
 * message telling a learner to try different words. But it retries twice and
 * stops, because a third attempt is almost always the same failure again and
 * the learner is now waiting thirty seconds for a refusal.
 */

import { call, hasAnyKey, AiError } from './provider.js';
import { validateTree, extractJson } from './schema.js';
import { registerTree } from '../data/catalog.js';

const SYSTEM = `You design skill trees for a learning app. You return structured data only.

A good tree:
- starts with 1-3 skills that have no prerequisites at all
- moves from fundamentals to advanced in a sensible order
- branches where a field genuinely branches, rather than being one long chain
- uses several prerequisites where a skill really needs several
- ends in one or two capstone skills that require the branches
- names skills as things a person learns, not as chapter titles

Every prerequisite must reference the id of another skill in the same tree.
Never create a circular dependency. Difficulty runs 1 (beginner) to 5 (expert)
and should rise with depth. estimatedHours is a [low, high] pair of realistic
hours for a motivated beginner.`;

const TOOL = {
  name: 'emit_skill_tree',
  description: 'Return the generated skill tree.',
  schema: {
    type: 'object',
    required: ['name', 'skills'],
    properties: {
      name: { type: 'string', description: 'Short name for the tree' },
      tagline: { type: 'string', description: 'One line describing what it covers' },
      category: { type: 'string' },
      skills: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string', description: 'lower_snake_case, unique in this tree' },
            name: { type: 'string' },
            description: { type: 'string' },
            why: { type: 'string', description: 'Why this skill is worth learning' },
            category: { type: 'string', description: 'Branch this skill belongs to' },
            difficulty: { type: 'integer', minimum: 1, maximum: 5 },
            estimatedHours: { type: 'array', items: { type: 'number' } },
            requires: {
              type: 'array',
              items: {
                type: 'object',
                required: ['skillId'],
                properties: {
                  skillId: { type: 'string' },
                  minLevel: { type: 'integer', minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Generate a tree from a plain-language goal.
 *
 * Resolves to `{ ok, tree, warnings }` or `{ ok: false, error }`. Never throws:
 * this is called straight from a button, and an unhandled rejection there
 * leaves a spinner running forever.
 */
export async function generateTree(goalText, opts = {}) {
  if (!hasAnyKey()) {
    return {
      ok: false,
      error: 'Generating a tree needs an AI key. Add one in Settings — everything else in the app works without it.',
      kind: 'no_key',
    };
  }

  const size = opts.size || 18;
  const prompt = `Someone wants to learn: "${goalText}"

Design a skill tree of about ${size} skills covering it from complete beginner to competent.
Make the dependencies reflect what genuinely has to come first.`;

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryNote = lastError
        ? `\n\nYour previous answer was rejected: ${lastError}. Fix exactly that and return the whole tree again.`
        : '';

      const result = await call({
        system: SYSTEM,
        prompt: prompt + retryNote,
        tool: TOOL,
        maxTokens: 8000,
        signal: opts.signal,
      });

      /* Structured output is the normal path; the text branch covers a
       * provider that ignored the tool and answered in prose anyway. */
      let raw = result.structured;
      if (!raw && result.text) {
        const extracted = extractJson(result.text);
        if (!extracted.ok) { lastError = extracted.error; continue; }
        raw = extracted.value;
      }
      if (!raw) { lastError = 'empty response'; continue; }

      const treeId = opts.treeId || `gen_${Date.now().toString(36)}`;
      const validated = validateTree(raw, treeId);
      if (!validated.ok) { lastError = validated.error; continue; }

      return { ok: true, tree: validated.tree, warnings: validated.warnings };
    } catch (err) {
      if (err instanceof AiError && err.kind === 'aborted') return { ok: false, error: 'Cancelled.', kind: 'aborted' };
      return {
        ok: false,
        error: err instanceof AiError ? err.message : 'Could not generate a tree.',
        kind: err instanceof AiError ? err.kind : 'unknown',
      };
    }
  }

  return {
    ok: false,
    error: `The model returned something unusable twice (${lastError}). Try describing the goal differently.`,
    kind: 'invalid',
  };
}

/**
 * Commit a generated tree so it behaves exactly like a seeded one.
 *
 * Registration re-indexes, which is the final structural check: anything that
 * slipped past validation throws here, before the tree is ever rendered.
 */
export function acceptTree(tree) {
  try {
    registerTree(tree);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/*
 * Activities for a generated tree.
 *
 * A generated tree arrives with none, and rather than shipping empty skills
 * this builds a lesson and a quiz stub locally so the tree is immediately
 * usable. They are honest about being generated placeholders — the alternative
 * is a tree of skills you cannot do anything with, which looks finished and is
 * not.
 */
export function scaffoldActivities(skill) {
  return [
    {
      id: `${skill.id}.learn`,
      kind: 'learn',
      title: `About ${skill.name}`,
      body: [
        skill.description || `${skill.name} is part of this tree.`,
        skill.why || 'Work through this in your own materials, then mark it read to record the time.',
        'This tree was generated, so it has no written lesson. Use it as a map: the structure and the order are the useful part, and you can attach your own study to each node.',
      ].filter(Boolean),
    },
    {
      id: `${skill.id}.self`,
      kind: 'challenge',
      title: `${skill.name} — self check`,
      brief: `Record honestly what you can do with ${skill.name}.`,
      checklist: [
        `I can explain what ${skill.name} is to someone else`,
        'I have used it in something real, not just read about it',
        'I could do it again tomorrow without looking it up',
      ],
    },
  ];
}
