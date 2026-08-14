/*
 * graph.js — the skill tree as an actual graph, not a nested list.
 *
 * This is the module the brief's §2 is about. A skill can have several
 * prerequisites at several different levels ("React needs JS≥3, HTML≥3,
 * CSS≥2"), which is a DAG, not a tree — so nothing here assumes a single
 * parent, and the layout has to cope with a node whose parents sit in three
 * different columns.
 *
 * Responsibilities:
 *   - index a tree for O(1) lookup
 *   - detect cycles, because a hand-authored or AI-generated tree can contain
 *     one and a cycle turns unlock evaluation into an infinite loop
 *   - assign depth (longest path from a root, so a node always renders to the
 *     right of every one of its prerequisites)
 *   - lay out nodes into stable positions
 *
 * Pure module: takes tree data, returns derived data. No storage, no DOM.
 */

/**
 * Build the lookup structures every other module wants. Called once per tree
 * and cached by the catalog — indexing on each render was measurable at 300
 * nodes.
 */
export function indexTree(tree) {
  const byId = new Map();
  const dependents = new Map();

  for (const skill of tree.skills) {
    if (byId.has(skill.id)) throw new Error(`duplicate skill id: ${skill.id}`);
    byId.set(skill.id, skill);
    if (!dependents.has(skill.id)) dependents.set(skill.id, []);
  }

  /* Reverse edges: "what does finishing this open up?" — needed for the
   * Unlocks list in the detail panel, and for highlighting downstream nodes. */
  for (const skill of tree.skills) {
    for (const req of skill.requires || []) {
      if (!byId.has(req.skillId)) {
        throw new Error(`${tree.id}: skill "${skill.id}" requires unknown skill "${req.skillId}"`);
      }
      if (!dependents.has(req.skillId)) dependents.set(req.skillId, []);
      dependents.get(req.skillId).push(skill.id);
    }
  }

  /*
   * Reject a cycle here, not at render time.
   *
   * The catalogue's comment promised registration caught cycles; it did not —
   * only duplicate ids and dangling prerequisites were checked, and a cyclic
   * tree registered cleanly and then blew up somewhere else entirely. Two of
   * the three graph walks in the app are recursive and died with a stack
   * overflow rather than a message naming the tree.
   */
  const cycle = findCycle(tree);
  if (cycle) throw new Error(`${tree.id}: circular dependency: ${cycle.join(' -> ')}`);

  return { tree, byId, dependents };
}

/**
 * Find a cycle, if there is one, and return the path so the error can name it.
 *
 * Iterative rather than recursive: an AI-generated tree is untrusted input
 * (§56) and a 500-deep chain must produce a validation error, not a blown
 * stack.
 */
export function findCycle(tree) {
  const byId = new Map(tree.skills.map((s) => [s.id, s]));
  const state = new Map(); /* unvisited | visiting | done */
  const parent = new Map();

  for (const root of tree.skills) {
    if (state.get(root.id) === 'done') continue;

    const stack = [{ id: root.id, i: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const skill = byId.get(frame.id);
      const reqs = (skill && skill.requires) || [];

      if (frame.i === 0) {
        if (state.get(frame.id) === 'done') { stack.pop(); continue; }
        state.set(frame.id, 'visiting');
      }

      if (frame.i >= reqs.length) {
        state.set(frame.id, 'done');
        stack.pop();
        continue;
      }

      const nextId = reqs[frame.i].skillId;
      frame.i += 1;
      if (!byId.has(nextId)) continue;

      if (state.get(nextId) === 'visiting') {
        /* Walk the parent chain back to close the loop for the message. */
        const path = [nextId];
        let cur = frame.id;
        while (cur && cur !== nextId && path.length < tree.skills.length + 1) {
          path.push(cur);
          cur = parent.get(cur);
        }
        path.push(nextId);
        return path.reverse();
      }
      if (state.get(nextId) !== 'done') {
        parent.set(nextId, frame.id);
        stack.push({ id: nextId, i: 0 });
      }
    }
  }
  return null;
}

/**
 * Depth = longest path from any root. Longest rather than shortest, because
 * with the shortest path a node can land in the same column as one of its own
 * prerequisites and the edge draws backwards.
 *
 * Returns a Map of skillId -> depth. Throws on a cycle rather than looping.
 */
export function computeDepths(index) {
  const { tree, byId } = index;
  const cycle = findCycle(tree);
  if (cycle) throw new Error(`${tree.id}: circular dependency: ${cycle.join(' -> ')}`);

  const depth = new Map();

  const resolve = (startId) => {
    /* Explicit stack, post-order: push a node, push its unresolved parents,
     * and only compute a depth once every parent already has one. */
    const stack = [startId];
    while (stack.length) {
      const id = stack[stack.length - 1];
      if (depth.has(id)) { stack.pop(); continue; }

      const reqs = (byId.get(id).requires || []).filter((r) => byId.has(r.skillId));
      const pending = reqs.filter((r) => !depth.has(r.skillId));
      if (pending.length) {
        for (const r of pending) stack.push(r.skillId);
        continue;
      }
      depth.set(id, reqs.length ? Math.max(...reqs.map((r) => depth.get(r.skillId) + 1)) : 0);
      stack.pop();
    }
  };

  for (const skill of tree.skills) resolve(skill.id);
  return depth;
}

/**
 * Position every node.
 *
 * Layered left-to-right by depth, then ordered within a layer to sit near the
 * average position of its prerequisites — a one-pass barycentre. It is not an
 * optimal crossing-minimiser and does not try to be; it is deterministic,
 * runs in milliseconds on hundreds of nodes, and produces a readable tree
 * whose branches stay visually grouped, which is the actual requirement.
 *
 * Nodes carrying explicit `x`/`y` (a hand-placed or user-edited tree) keep
 * them — authored positions always win over computed ones.
 */
export function layoutTree(index, opts = {}) {
  const colGap = opts.colGap ?? 240;
  const rowGap = opts.rowGap ?? 132;

  const { tree, byId } = index;
  const depth = computeDepths(index);

  const layers = new Map();
  for (const skill of tree.skills) {
    const d = depth.get(skill.id);
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(skill.id);
  }

  const order = new Map();
  const sortedDepths = [...layers.keys()].sort((a, b) => a - b);

  for (const d of sortedDepths) {
    const ids = layers.get(d);
    if (d === 0) {
      /* Roots keep author order — it is the only signal available and authors
       * tend to list them in a sensible reading order. */
      ids.forEach((id, i) => order.set(id, i));
      continue;
    }
    const scored = ids.map((id, i) => {
      const reqs = (byId.get(id).requires || []).filter((r) => order.has(r.skillId));
      const bary = reqs.length
        ? reqs.reduce((s, r) => s + order.get(r.skillId), 0) / reqs.length
        : i;
      return { id, bary, i };
    });
    scored.sort((a, b) => (a.bary - b.bary) || (a.i - b.i));
    scored.forEach((s, i) => order.set(s.id, i));
    layers.set(d, scored.map((s) => s.id));
  }

  /* Centre each column vertically against the tallest one, so the tree reads
   * as a shape rather than as everything jammed against the top edge. */
  const tallest = Math.max(...sortedDepths.map((d) => layers.get(d).length));

  const nodes = [];
  for (const d of sortedDepths) {
    const ids = layers.get(d);
    const offset = ((tallest - ids.length) * rowGap) / 2;
    ids.forEach((id, i) => {
      const skill = byId.get(id);
      nodes.push({
        id,
        skill,
        depth: d,
        x: Number.isFinite(skill.x) ? skill.x : d * colGap,
        y: Number.isFinite(skill.y) ? skill.y : offset + i * rowGap,
      });
    });
  }

  const edges = [];
  for (const skill of tree.skills) {
    for (const req of skill.requires || []) {
      if (byId.has(req.skillId)) edges.push({ from: req.skillId, to: skill.id, minLevel: req.minLevel });
    }
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    nodes,
    edges,
    depth,
    bounds: {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    },
  };
}

/**
 * Everything upstream of a skill — the full prerequisite closure, not just the
 * direct parents. Used to highlight the path that leads to a node, and by the
 * goal-path builder.
 */
export function ancestorsOf(index, skillId) {
  const seen = new Set();
  const stack = [skillId];
  while (stack.length) {
    const id = stack.pop();
    for (const req of (index.byId.get(id)?.requires) || []) {
      if (seen.has(req.skillId)) continue;
      seen.add(req.skillId);
      stack.push(req.skillId);
    }
  }
  return seen;
}

/** Everything downstream — what this skill eventually opens up. */
export function descendantsOf(index, skillId) {
  const seen = new Set();
  const stack = [skillId];
  while (stack.length) {
    const id = stack.pop();
    for (const next of index.dependents.get(id) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/**
 * An ordered study path to a target skill: every prerequisite, sorted so
 * nothing appears before something it depends on. This is the Goal Path of
 * §15 — the personal route through the tree, as opposed to the tree itself.
 */
export function pathTo(index, targetId) {
  const needed = ancestorsOf(index, targetId);
  needed.add(targetId);
  const depth = computeDepths(index);
  return [...needed].sort((a, b) => (depth.get(a) - depth.get(b)) || a.localeCompare(b));
}
