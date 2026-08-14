/*
 * coach.js — the skill coach, and what it does when there is no key.
 *
 * §84 is unambiguous: the app must not fall over without an AI key. The way
 * that is honoured here is that every AI feature has a deterministic
 * counterpart which is genuinely useful rather than a placeholder apologising
 * for itself. Without a key the coach still answers, from the skill's own
 * content — its lesson text, its prerequisites, its hint, what the learner has
 * already failed — and it says it is offline so nobody mistakes it for the
 * model.
 *
 * That is the honest version of a fallback. A greyed-out panel saying "AI
 * unavailable" would be the fake-UI outcome §71 rules out.
 */

import { call, hasAnyKey, AiError } from './provider.js';
import * as session from '../core/session.js';
import { findSkill } from '../data/catalog.js';
import { requirementStatus } from '../domain/unlock.js';

/*
 * What the coach is told about the learner (§12).
 *
 * Assembled from state rather than from the conversation, so the model knows
 * the level, the recent failures and the completed prerequisites without the
 * learner having to explain themselves. This is the whole difference between
 * a chatbot and a coach.
 */
function contextFor(skill) {
  const state = session.freshProfile();
  if (!state) return { summary: '', progress: null };

  const progress = state.skills[skill.id];
  const found = findSkill(skill.id);
  const lines = [];

  lines.push(`Skill: ${skill.name} (${skill.category || 'general'}, difficulty ${skill.difficulty || 1}/5).`);

  if (progress) {
    lines.push(`Learner is at level ${progress.level}/5 with a mastery score of ${Math.round(progress.masteryScore)}%.`);

    const recent = (progress.attempts || []).slice(-4);
    if (recent.length) {
      lines.push(`Recent attempts: ${recent.map((a) => `${a.kind} ${a.score ?? '—'}%${a.passed ? '' : ' (failed)'}`).join(', ')}.`);
    }

    /* A repeated failure on one activity is the single most useful thing the
     * coach can know — it is the difference between "here is the concept" and
     * "you have tried this four times, let us go back a step". */
    const failures = (progress.attempts || []).filter((a) => !a.passed);
    if (failures.length >= 2) {
      lines.push(`They have failed this material ${failures.length} times — be concrete and go back to fundamentals rather than restating the concept.`);
    }
  } else {
    lines.push('Learner has not started this skill yet.');
  }

  if (found) {
    const reqs = requirementStatus(found.index, skill.id, (id) => state.skills[id]);
    const weak = reqs.filter((r) => !r.met || r.haveLevel < r.needLevel + 1);
    if (weak.length) {
      lines.push(`Possibly shaky prerequisites: ${weak.map((r) => `${r.name} (level ${r.haveLevel})`).join(', ')}.`);
    }
  }

  if (state.goal?.text) lines.push(`Their stated goal: "${state.goal.text}".`);

  return { summary: lines.join('\n'), progress };
}

const SYSTEM = `You are a coach inside a skill-tree learning app.

Rules:
- Be brief. Three or four sentences unless asked for more.
- Never give the full answer to a challenge the learner is working on. Give the next step, or the idea they are missing.
- Use what you are told about their level and recent failures. If they have failed repeatedly, go back a step rather than repeating the explanation.
- Plain language. No preamble, no "great question", no bullet lists unless comparing things.
- If the learner asks something unrelated to learning this skill, answer briefly and steer back.`;

/**
 * Ask the coach a question about a skill.
 *
 * Always resolves — never throws — because a failed AI call must not break the
 * screen it was called from. A failure degrades to the offline coach with the
 * reason attached.
 */
export async function coachFor({ skill, activity, source, question, history = [], seenHint = false }) {
  if (!hasAnyKey()) {
    return { text: offlineAnswer({ skill, activity, question, source, seenHint }), offline: true };
  }

  const context = contextFor(skill);
  const parts = [context.summary];

  if (activity) {
    parts.push(`\nCurrent activity: "${activity.title}" (${activity.kind}).`);
    if (activity.brief) parts.push(`Task: ${activity.brief}`);
  }
  if (source && source.trim()) {
    parts.push(`\nTheir current code:\n${source.slice(0, 2000)}`);
  }
  if (history.length) {
    parts.push(`\nEarlier in this conversation:\n${history.slice(-6).map((m) => `${m.role}: ${m.text}`).join('\n')}`);
  }
  parts.push(`\nTheir question: ${question}`);

  try {
    const result = await call({ system: SYSTEM, prompt: parts.join('\n'), maxTokens: 700 });
    const text = (result.text || '').trim();
    if (!text) return { text: offlineAnswer({ skill, activity, question, source }), offline: true };
    return { text, offline: false };
  } catch (err) {
    return {
      text: offlineAnswer({ skill, activity, question, source }),
      offline: true,
      error: err instanceof AiError ? err.message : 'The coach is unavailable.',
    };
  }
}

/*
 * The offline coach.
 *
 * Rule-based, and built from material the app already has. It reads the
 * question for intent, then answers from the skill's own lesson text, hint,
 * prerequisites or activity list. It is not pretending to be a model — the UI
 * labels it — but it answers the four questions learners actually ask.
 */
/*
 * `seenHint` says the learner has already been shown `activity.hint` — they
 * pressed Hint before asking. Returning it again produced the same paragraph
 * twice, stacked, which reads as the coach having nothing to say. It moves on
 * to the next-best answer instead.
 */
function offlineAnswer({ skill, activity, question, source, seenHint = false }) {
  const q = String(question || '').toLowerCase();
  const state = session.freshProfile();
  const progress = state?.skills?.[skill.id];

  /* "give me an easier one" / "I'm stuck" */
  if (/stuck|hint|nudge|easier|help|hard/.test(q)) {
    if (activity?.hint && !seenHint) return activity.hint;

    if (source && !source.trim()) {
      return `Start by writing the function signature and returning something — anything. Getting a failing test to fail *differently* tells you more than staring at a blank editor.`;
    }

    const found = findSkill(skill.id);
    if (found) {
      const weak = requirementStatus(found.index, skill.id, (id) => state?.skills?.[id])
        .filter((r) => !r.met);
      if (weak.length) {
        return `Before pushing further here, ${weak[0].name} is only at level ${weak[0].haveLevel} and this skill assumes level ${weak[0].needLevel}. Going back to it is usually faster than grinding this.`;
      }
    }

    const lesson = (skill.activities || []).find((a) => a.kind === 'learn');
    if (lesson) return `Re-read "${lesson.title}" on this skill — the idea you need is in there. ${lesson.body?.[1] || ''}`.trim();
    return 'Break the problem into the smallest piece you can test, get that right, then add the next piece.';
  }

  /* "why do I need this" */
  if (/why|point|useful|bother|matter/.test(q)) {
    return skill.why || skill.description || `${skill.name} is a prerequisite for the skills that follow it in this tree.`;
  }

  /* "what next" */
  if (/next|what should|after this|now what/.test(q)) {
    const next = session.nextActivity(skill.id);
    if (next) return `Next in ${skill.name}: "${next.title}". After that, the tree opens up from here.`;
    return `You have worked through ${skill.name}. Open the tree and see what it unlocked.`;
  }

  /* "test me" */
  if (/test me|quiz me|check me|examine/.test(q)) {
    const quiz = (skill.activities || []).find((a) => a.kind === 'quiz' || a.kind === 'assessment');
    if (quiz) return `Try "${quiz.title}" — it is the graded check for this skill.`;
    return 'There is no graded check on this skill yet. The challenge is the honest test.';
  }

  /* "how am I doing" */
  if (/how am i|my progress|doing/.test(q)) {
    if (!progress) return `You have not started ${skill.name} yet.`;
    return `Level ${progress.level} of 5, mastery ${Math.round(progress.masteryScore)}%, confidence ${progress.confidence}%. ${
      progress.confidence < 70 ? 'A short review would bring the confidence back up.' : 'That is in good shape.'}`;
  }

  /* Anything else: the skill's own explanation, which is real content rather
   * than an apology. */
  const lesson = (skill.activities || []).find((a) => a.kind === 'learn');
  if (lesson?.body?.length) {
    return `${lesson.body[0]}\n\nThat is the short version — the full lesson is "${lesson.title}" on this skill.`;
  }
  return skill.description || `No offline notes for ${skill.name}. Add an API key in Settings for a coach that can answer freely.`;
}

/**
 * A qualitative second opinion on a graded submission (§10).
 *
 * Explicitly cannot change the score — the tests already decided that, and a
 * model overruling a failing test would make the whole grading system
 * meaningless. This adds the part tests cannot judge: whether the code is
 * clear, whether the edge cases were considered, what to do differently.
 */
export async function reviewSubmission({ skill, activity, source, result }) {
  if (!hasAnyKey() || !source) return null;

  const summary = (result.results || [])
    .map((r) => `${r.passed ? 'PASS' : 'FAIL'} ${r.label}${r.error ? ` (${r.error})` : ''}`)
    .join('\n');

  const prompt = `Skill: ${skill.name}. Task: ${activity.brief}

Their submission:
${source.slice(0, 2000)}

Automated test results (already final — do not dispute or re-score):
${summary}

Comment on correctness of approach, readability, and edge cases they did or did not handle. Two or three sentences. If it passed cleanly, say what you would change to make it better, or say it is good as it stands — do not invent problems.`;

  try {
    const res = await call({ system: SYSTEM, prompt, maxTokens: 500 });
    return (res.text || '').trim() || null;
  } catch {
    return null;
  }
}
