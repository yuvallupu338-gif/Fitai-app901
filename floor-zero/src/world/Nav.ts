export interface NavNode {
  id: string;
  x: number;
  z: number;
  links: string[];
  /** Optional room tag, used by the director to pick "somewhere the player likes". */
  room?: string;
}

export interface NavPoint {
  x: number;
  z: number;
}

/**
 * A small hand-authored waypoint graph per level. The mimic uses it whenever it
 * stops replaying and starts making its own decisions.
 */
export class NavGraph {
  private nodes = new Map<string, NavNode>();

  constructor(nodes: NavNode[] = []) {
    for (const node of nodes) this.add(node);
  }

  add(node: NavNode): void {
    this.nodes.set(node.id, node);
  }

  /** Link two nodes both ways. */
  link(a: string, b: string): void {
    const nodeA = this.nodes.get(a);
    const nodeB = this.nodes.get(b);
    if (!nodeA || !nodeB) return;
    if (!nodeA.links.includes(b)) nodeA.links.push(b);
    if (!nodeB.links.includes(a)) nodeB.links.push(a);
  }

  get(id: string): NavNode | undefined {
    return this.nodes.get(id);
  }

  get all(): NavNode[] {
    return Array.from(this.nodes.values());
  }

  get size(): number {
    return this.nodes.size;
  }

  nearest(x: number, z: number, room?: string): NavNode | null {
    let best: NavNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.nodes.values()) {
      if (room && node.room !== room) continue;
      const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    return best;
  }

  inRoom(room: string): NavNode[] {
    return this.all.filter((node) => node.room === room);
  }

  /** Dijkstra over the waypoint graph. Returns node ids, start included. */
  path(fromId: string, toId: string): NavNode[] {
    if (fromId === toId) {
      const single = this.nodes.get(fromId);
      return single ? [single] : [];
    }
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const visited = new Set<string>();
    distances.set(fromId, 0);

    while (true) {
      let currentId: string | null = null;
      let currentDistance = Infinity;
      for (const [id, distance] of distances) {
        if (visited.has(id)) continue;
        if (distance < currentDistance) {
          currentDistance = distance;
          currentId = id;
        }
      }
      if (!currentId) break;
      if (currentId === toId) break;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) continue;
      for (const neighbourId of node.links) {
        const neighbour = this.nodes.get(neighbourId);
        if (!neighbour || visited.has(neighbourId)) continue;
        const step = Math.hypot(neighbour.x - node.x, neighbour.z - node.z);
        const candidate = currentDistance + step;
        if (candidate < (distances.get(neighbourId) ?? Infinity)) {
          distances.set(neighbourId, candidate);
          previous.set(neighbourId, currentId);
        }
      }
    }

    if (!distances.has(toId)) return [];
    const result: NavNode[] = [];
    let cursor: string | undefined = toId;
    while (cursor) {
      const node = this.nodes.get(cursor);
      if (node) result.unshift(node);
      cursor = previous.get(cursor);
      if (cursor === fromId) {
        const start = this.nodes.get(fromId);
        if (start) result.unshift(start);
        break;
      }
    }
    return result;
  }

  /** Convenience: path between arbitrary world points. */
  route(ax: number, az: number, bx: number, bz: number): NavPoint[] {
    const from = this.nearest(ax, az);
    const to = this.nearest(bx, bz);
    if (!from || !to) return [{ x: bx, z: bz }];
    const nodes = this.path(from.id, to.id);
    const points: NavPoint[] = nodes.map((node) => ({ x: node.x, z: node.z }));
    points.push({ x: bx, z: bz });
    return points;
  }
}
