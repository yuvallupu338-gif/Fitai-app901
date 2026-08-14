/*
 * xp.js — XP awards and the event ledger behind them.
 *
 * The brief is explicit (§37): never store just a running total. Every award
 * is an event with a reason, a skill, a timestamp and an idempotency key, and
 * the totals are folded from that list. It costs a little memory and buys the
 * entire analytics screen, the weekly charts, the streak, and — the reason it
 * actually matters — the ability to say "this attempt was already paid for"
 * when the same submission arrives twice.
 *
 * Pure module: it takes a ledger and returns a new ledger. Persistence is the
 * store's problem, the clock is the caller's.
 */

/* Base award per activity kind, straight from the brief. */
export const XP_AWARDS = {
  learn: 10,
  quiz: 15,
  practice: 15,
  challenge: 25,
  assessment: 50,
  project: 100,
  mastery: 200,
};

export function baseXpFor(kind) {
  return XP_AWARDS[kind] ?? 10;
}

/*
 * The one vocabulary for activity kinds.
 *
 * This label map existed verbatim in three UI modules and, worse, one of those
 * copies feeds the *stored* XP ledger reason — so a drift between them would
 * be baked permanently into saved data. `missions.js` additionally kept its own
 * transcription of the XP table above, which meant a rebalance needed four
 * edits and missing one made a mission chip promise XP the engine would not pay.
 */
export const KIND_LABEL = {
  learn: 'Lesson',
  quiz: 'Quiz',
  practice: 'Practice',
  challenge: 'Challenge',
  project: 'Project',
  assessment: 'Assessment',
  mastery: 'Mastery challenge',
};

export function labelForKind(kind) {
  return KIND_LABEL[kind] || 'Activity';
}

/**
 * How much XP a skill can yield from one clean pass of everything in it.
 *
 * This is the number every skill-level threshold is expressed against, and
 * getting it wrong breaks the whole ladder. The first version of this file
 * used absolute thresholds — 300 XP for level 3, 900 for level 5 — which
 * looked reasonable until you counted what a skill actually offers: a skill
 * with a lesson and a quiz yields 25 XP on a full pass, so level 3 was
 * unreachable, so nothing downstream of it ever unlocked. The tests caught it;
 * the app looked fine.
 *
 * Expressing thresholds as a fraction of this makes the ladder self-scaling: a
 * four-activity skill and a two-activity skill both take a full pass to
 * complete, and neither can be finished without doing the work in it.
 *
 * Includes the difficulty multiplier because awards do, so the two cannot
 * drift apart.
 */
export function skillCapacity(activities, difficulty = 1) {
  const total = (activities || []).reduce((sum, a) => sum + baseXpFor(a.kind), 0);
  return Math.round(total * difficultyMultiplier(difficulty));
}

/*
 * Repeat-attempt decay (§45).
 *
 * Retrying has to stay free — a learner who failed twice and wants a third go
 * is doing exactly the right thing, and taxing that would be perverse. What
 * cannot happen is XP farming: replaying a cleared quiz for +15 forever.
 *
 * So the decay is on *successful* awards for the same activity: full value the
 * first time you pass, half the second, then a token amount that keeps the
 * ledger honest without being worth grinding. Failed attempts pay nothing and
 * do not advance the counter.
 */
export function repeatMultiplier(previousPasses) {
  const n = Math.max(0, Number(previousPasses) || 0);
  if (n === 0) return 1;
  if (n === 1) return 0.5;
  return 0.1;
}

/*
 * The most a single activity may ever contribute to its skill.
 *
 * Decay alone was not enough, and the review proved it: the 0.1 tail never
 * reaches zero and `computeAward` floors every payout at 1, so replaying one
 * quiz 47 times accumulated more XP than the whole skill is worth and produced
 * "Mastered — you have proven it under pressure" with the assessment never
 * opened. That is precisely the fake progress this app exists to refuse.
 *
 * A hard ceiling per activity restores the invariant that level thresholds
 * were built on. Capacity is the sum of every activity's base value, so if no
 * activity can pay more than 1.6× its own base, reaching capacity — level 5 —
 * requires actually doing most of the skill. One activity, replayed forever,
 * asymptotically reaches 1.6× its base and stops.
 *
 * 1.6 rather than 1.0 so that a genuine retake after a poor first pass still
 * improves your standing: full value, then half, then nothing.
 */
export function activityXpCap(kind, difficulty = 1) {
  return Math.round(baseXpFor(kind) * difficultyMultiplier(difficulty) * 1.6);
}

/*
 * Score shapes the award too, otherwise a 55% pass and a 100% pass are worth
 * the same and the incentive to actually understand the material disappears.
 * Floor at 0.5 so a marginal pass still feels like it counted.
 */
export function scoreMultiplier(score) {
  if (score === null || score === undefined) return 1;
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  return 0.5 + (s / 100) * 0.5;
}

/*
 * Difficulty bonus. A challenge on a difficulty-5 skill is worth more than the
 * same nominal challenge on a difficulty-1 one; without this, the cheapest
 * tree in the app is always the optimal one to grind.
 */
export function difficultyMultiplier(difficulty) {
  const d = Math.max(1, Math.min(5, Number(difficulty) || 1));
  return 1 + (d - 1) * 0.15;
}

/**
 * The single place an XP number is decided. Every caller goes through here so
 * the rules cannot drift between the quiz screen and the assessment screen.
 */
export function computeAward({
  kind, score = null, previousPasses = 0, difficulty = 1, passed = true, alreadyEarned = 0,
}) {
  if (!passed) return 0;

  const raw = baseXpFor(kind)
    * repeatMultiplier(previousPasses)
    * scoreMultiplier(score)
    * difficultyMultiplier(difficulty);

  /* Never pay past this activity's lifetime ceiling — see activityXpCap. */
  const headroom = activityXpCap(kind, difficulty) - Math.max(0, alreadyEarned);
  if (headroom <= 0) return 0;

  return Math.max(0, Math.min(Math.round(headroom), Math.max(1, Math.round(raw))));
}

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

/**
 * Append an XP event, refusing duplicates.
 *
 * `key` is the idempotency token — for an activity attempt it is
 * `attempt:<attemptId>`, which means a double-submitted form, a retried
 * network call or a double-tapped button all collapse into one award. The
 * brief lists "XP duplicate event" and "assessment submitted twice" as edge
 * cases (§60); this is where both are actually handled, rather than by hoping
 * the UI disables the button.
 *
 * Returns the same array reference when nothing was added, so callers can cheaply
 * detect a no-op.
 */
export function appendXpEvent(events, event) {
  const list = Array.isArray(events) ? events : [];
  if (!event || !Number.isFinite(event.amount) || event.amount === 0) return list;
  if (event.key && list.some((e) => e.key === event.key)) return list;
  return list.concat([{
    id: event.id || `xp_${list.length + 1}_${event.at}`,
    key: event.key || null,
    amount: Math.round(event.amount),
    reason: event.reason || 'Activity',
    skillId: event.skillId || null,
    treeId: event.treeId || null,
    kind: event.kind || null,
    at: event.at,
  }]);
}

export function totalXp(events) {
  return (events || []).reduce((sum, e) => sum + (e.amount || 0), 0);
}

export function xpForSkill(events, skillId) {
  return (events || []).reduce((sum, e) => (e.skillId === skillId ? sum + (e.amount || 0) : sum), 0);
}

/*
 * Fold the ledger into a per-skill total in one pass. Called on every render of
 * the tree, where doing it with a filter per node turned an O(n) job into
 * O(nodes × events).
 */
export function xpBySkill(events) {
  const out = new Map();
  for (const e of events || []) {
    if (!e.skillId) continue;
    out.set(e.skillId, (out.get(e.skillId) || 0) + (e.amount || 0));
  }
  return out;
}

export function xpSince(events, sinceMs) {
  return (events || []).reduce((sum, e) => (e.at >= sinceMs ? sum + (e.amount || 0) : sum), 0);
}

/**
 * XP per day over a window, oldest first, with empty days present as zeroes.
 * The chart needs the gaps — a line that skips inactive days lies about
 * consistency, which is the one thing that chart exists to show.
 */
export function xpByDay(events, days = 30, now = Date.now()) {
  const DAY = 86400000;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const firstDay = start.getTime() - (days - 1) * DAY;

  const buckets = new Array(days).fill(0);
  for (const e of events || []) {
    if (e.at < firstDay) continue;
    const idx = Math.floor((e.at - firstDay) / DAY);
    if (idx >= 0 && idx < days) buckets[idx] += e.amount || 0;
  }
  return buckets.map((xp, i) => ({ at: firstDay + i * DAY, xp }));
}
