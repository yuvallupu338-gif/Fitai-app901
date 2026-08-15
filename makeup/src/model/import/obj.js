/*
 * obj.js — Wavefront OBJ, the parts of it that describe a head.
 *
 * Positions, normals, texture coordinates and faces. No materials, no groups,
 * no curves, no free-form surfaces. A head arrives as one surface and the game
 * has its own idea of what its material is; everything else in the format is
 * for a modelling package to worry about.
 *
 * The one non-obvious thing OBJ does is index its three attribute arrays
 * *separately* — a face corner is v/vt/vn, and the same position appears in
 * dozens of corners with different normals. GPUs cannot do that: one index
 * addresses one vertex. So corners are de-duplicated into real vertices here,
 * which is also the step that decides how many vertices a mesh has, and why an
 * OBJ with per-face normals comes out three times larger than the file suggests.
 */

/*
 * Faces may be n-gons and may index backwards from the end. Both appear in
 * files exported by real tools and both are silent corruption if ignored: a
 * negative index read as positive lands on a vertex near the start of the mesh
 * and stretches a triangle across the whole head.
 */
function resolve(index, count) {
  const n = parseInt(index, 10);
  if (!Number.isFinite(n) || n === 0) return -1;
  return n > 0 ? n - 1 : count + n;
}

export function parseOBJ(text) {
  const vs = [], vts = [], vns = [];
  const pos = [], nrm = [], uv = [], idx = [];
  const seen = new Map();
  let hadNormals = false, hadUVs = false, ngons = 0;

  const corner = (token) => {
    let vi = seen.get(token);
    if (vi !== undefined) return vi;
    const parts = token.split('/');
    const pi = resolve(parts[0], vs.length / 3);
    const ti = parts[1] ? resolve(parts[1], vts.length / 2) : -1;
    const ni = parts[2] ? resolve(parts[2], vns.length / 3) : -1;
    if (pi < 0 || pi * 3 + 2 >= vs.length) throw new Error(`OBJ: face refers to vertex ${parts[0]}, which does not exist`);
    pos.push(vs[pi * 3], vs[pi * 3 + 1], vs[pi * 3 + 2]);
    if (ni >= 0 && ni * 3 + 2 < vns.length) {
      nrm.push(vns[ni * 3], vns[ni * 3 + 1], vns[ni * 3 + 2]);
      hadNormals = true;
    } else nrm.push(0, 0, 0);
    if (ti >= 0 && ti * 2 + 1 < vts.length) {
      uv.push(vts[ti * 2], vts[ti * 2 + 1]);
      hadUVs = true;
    } else uv.push(0, 0);
    vi = pos.length / 3 - 1;
    seen.set(token, vi);
    return vi;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const kind = line.slice(0, sp);
    const rest = line.slice(sp + 1).trim();

    if (kind === 'v') {
      const n = rest.split(/\s+/);
      vs.push(+n[0], +n[1], +n[2]);
    } else if (kind === 'vn') {
      const n = rest.split(/\s+/);
      vns.push(+n[0], +n[1], +n[2]);
    } else if (kind === 'vt') {
      const n = rest.split(/\s+/);
      /* OBJ's v runs up; everything here runs down, the same way an image does. */
      vts.push(+n[0], 1 - (+n[1] || 0));
    } else if (kind === 'f') {
      const tokens = rest.split(/\s+/).filter(Boolean);
      if (tokens.length < 3) continue;
      if (tokens.length > 3) ngons++;
      /* Fan triangulation. Correct for the convex quads and pentagons a
       * subdivision cage is made of, which is all a head ever is. */
      const first = corner(tokens[0]);
      let prev = corner(tokens[1]);
      for (let i = 2; i < tokens.length; i++) {
        const cur = corner(tokens[i]);
        idx.push(first, prev, cur);
        prev = cur;
      }
    }
  }

  if (!pos.length) throw new Error('OBJ: no geometry in the file');

  return {
    positions: new Float32Array(pos),
    normals: hadNormals ? new Float32Array(nrm) : null,
    uvs: hadUVs ? new Float32Array(uv) : null,
    indices: new Uint32Array(idx),
    stats: { vertices: pos.length / 3, triangles: idx.length / 3, ngons },
  };
}

/*
 * The other direction, which exists for the tests rather than for the game: the
 * only way to know the importer is right is to feed it a mesh whose face-space
 * coordinates are already known, and the only mesh like that is the one the
 * game generates. So the audit writes the procedural head out through here,
 * reads it back through the parser above, and checks that the unwrap recovers
 * the (s, t) it started from.
 */
export function writeOBJ(positions, indices) {
  const out = [`# ${positions.length / 3} vertices, ${indices.length / 3} triangles`];
  for (let i = 0; i < positions.length; i += 3) {
    out.push(`v ${positions[i].toFixed(6)} ${positions[i + 1].toFixed(6)} ${positions[i + 2].toFixed(6)}`);
  }
  for (let i = 0; i < indices.length; i += 3) {
    out.push(`f ${indices[i] + 1} ${indices[i + 1] + 1} ${indices[i + 2] + 1}`);
  }
  return out.join('\n') + '\n';
}
