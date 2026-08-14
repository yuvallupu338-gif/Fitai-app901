/*
 * deps.js — the dependency graph between tasks.
 *
 *     עיצוב  →  פיתוח  →  בדיקות  →  השקה
 *
 * Three questions are asked of this graph constantly, and each one is asked in
 * a hot loop, so the graph is built once per render pass and handed around:
 *
 *   1. Is this task blocked?  — decides whether it can be offered as work,
 *      whether its checkbox is tickable, and how it is drawn.
 *   2. What is it waiting for? — the interface must say "חסום בגלל: X", never
 *      just "חסום". A blocker you cannot name is a dead end.
 *   3. What does finishing it release? — this is the whole reason the priority
 *      engine ranks a boring task above an urgent one sometimes, and the
 *      sentence the recommendation screen leads with.
 *
 * A DEPENDENCY IS ONLY BLOCKING WHILE THE OTHER TASK IS OPEN.
 *
 * Cancelled counts as settled, not as blocking. A task waiting on something
 * that was abandoned is waiting forever, and the person who cancelled it has
 * already made the decision that it does not need doing.
 */

const SETTLED = new Set(['done', 'cancelled']);

/**
 * Build the two adjacency maps.
 * `dependsOn`  : taskId → ids it waits for
 * `dependents` : taskId → ids waiting for it
 *
 * Edges pointing at tasks that no longer exist are dropped here rather than
 * checked at every use — a deleted task should not keep anything blocked.
 */
export function buildGraph(tasks, dependencies) {
  const byId = new Map();
  for (const t of tasks) byId.set(t.id, t);

  const dependsOn = new Map();
  const dependents = new Map();
  for (const t of tasks) {
    dependsOn.set(t.id, []);
    dependents.set(t.id, []);
  }

  for (const dep of dependencies || []) {
    if (!byId.has(dep.taskId) || !byId.has(dep.dependsOnId)) continue;
    if (dep.taskId === dep.dependsOnId) continue;
    dependsOn.get(dep.taskId).push(dep.dependsOnId);
    dependents.get(dep.dependsOnId).push(dep.taskId);
  }

  return { byId, dependsOn, dependents };
}

/** The open tasks this one is waiting for. Empty means nothing is in the way. */
export function blockers(graph, taskId) {
  return (graph.dependsOn.get(taskId) || [])
    .map((id) => graph.byId.get(id))
    .filter((t) => t && !SETTLED.has(t.status));
}

export function isBlocked(graph, taskId) {
  return blockers(graph, taskId).length > 0;
}

/** Tasks waiting on this one, whether or not they are otherwise ready. */
export function dependents(graph, taskId) {
  return (graph.dependents.get(taskId) || [])
    .map((id) => graph.byId.get(id))
    .filter((t) => t && !SETTLED.has(t.status));
}

/**
 * What finishing this task actually releases.
 *
 * `immediate` — tasks that become workable the moment this one is done,
 *               because this was their last open blocker. This is the number
 *               worth putting in a sentence.
 * `downstream` — everything transitively behind it. Bigger, softer, and worth
 *               less per unit, because releasing something three steps away
 *               does not let anyone start today.
 */
export function unlockInfo(graph, taskId) {
  const direct = dependents(graph, taskId);
  const immediate = direct.filter((t) => {
    const others = blockers(graph, t.id).filter((b) => b.id !== taskId);
    return others.length === 0;
  });

  const seen = new Set([taskId]);
  const queue = direct.map((t) => t.id);
  let downstream = 0;
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    downstream += 1;
    for (const next of graph.dependents.get(id) || []) {
      const t = graph.byId.get(next);
      if (t && !SETTLED.has(t.status) && !seen.has(next)) queue.push(next);
    }
  }

  return { immediate, immediateCount: immediate.length, downstream };
}

/**
 * Would adding taskId → dependsOnId close a loop?
 *
 * A cycle is not a hypothetical. "Design waits for testing" is a plausible
 * thing to click when the list is long, and a graph with a cycle makes every
 * task in it permanently blocked with no way to tell why from the interface.
 * Rejected at the point of creation, with a sentence that explains it.
 */
export function wouldCreateCycle(graph, taskId, dependsOnId) {
  if (taskId === dependsOnId) return true;
  /* Walk up from the proposed blocker: if this task is already somewhere in
   * its ancestry, the new edge closes the loop. */
  const seen = new Set();
  const queue = [dependsOnId];
  while (queue.length) {
    const id = queue.shift();
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of graph.dependsOn.get(id) || []) queue.push(next);
  }
  return false;
}

/**
 * Dependency order, blockers first. Cycles cannot occur through the app's own
 * API, but imported data has no such guarantee, so anything left over when the
 * queue empties is appended rather than dropped.
 */
export function topologicalOrder(graph, taskIds) {
  const ids = taskIds || Array.from(graph.byId.keys());
  const inSet = new Set(ids);
  const remaining = new Map();
  for (const id of ids) {
    remaining.set(id, (graph.dependsOn.get(id) || []).filter((d) => {
      const t = graph.byId.get(d);
      return inSet.has(d) && t && !SETTLED.has(t.status);
    }).length);
  }

  const ready = ids.filter((id) => remaining.get(id) === 0);
  const out = [];
  while (ready.length) {
    const id = ready.shift();
    out.push(id);
    for (const dep of graph.dependents.get(id) || []) {
      if (!remaining.has(dep)) continue;
      const left = remaining.get(dep) - 1;
      remaining.set(dep, left);
      if (left === 0) ready.push(dep);
    }
  }

  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * The status a task should be showing, given the graph.
 *
 * Stored status and dependency state can disagree — a task marked 'ready' whose
 * blocker was reopened is now blocked, and nothing wrote to the task itself.
 * Rather than fanning out writes on every change, the derived status is
 * computed at read time and that is what the interface uses.
 */
export function effectiveStatus(graph, task) {
  if (SETTLED.has(task.status)) return task.status;
  if (isBlocked(graph, task.id)) return 'blocked';
  if (task.status === 'blocked') return task.scheduledDate ? 'planned' : 'ready';
  return task.status;
}

export function isActionable(graph, task) {
  const status = effectiveStatus(graph, task);
  return status !== 'done' && status !== 'cancelled' && status !== 'blocked'
    && status !== 'waiting' && !task.someday;
}
