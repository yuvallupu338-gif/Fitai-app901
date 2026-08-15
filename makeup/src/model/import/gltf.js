/*
 * gltf.js — glTF 2.0 and GLB, the parts of them that describe a head.
 *
 * Positions, normals, texture coordinates, indices, and the node transforms
 * that say where each piece sits. Not materials, not animation, not skins, not
 * cameras: this game lights the head itself and the head does not move.
 *
 * Three things about the format cause every bug in a reader like this one, so
 * they are handled explicitly rather than assumed away:
 *
 *   Node transforms. A downloaded head is very often a single mesh under three
 *   nested nodes, one of which is a 90-degree rotation because the artist
 *   worked Z-up. Ignoring the hierarchy gives a head lying on its side, and the
 *   landmark fit will dutifully stand it back up and be a few degrees out
 *   forever after.
 *
 *   Accessor strides. Attributes are frequently interleaved in one buffer, so
 *   the gap between two positions is not three floats. Reading them as if they
 *   were packed produces a mesh of confetti.
 *
 *   Draco. Sketchfab's own glTF export is usually Draco-compressed, and the
 *   compressed geometry lives in an extension whose absence makes the primitive
 *   look like it simply has no vertices. Decoding it needs a decompressor an
 *   order of magnitude larger than this whole game, so it is detected and
 *   named — an error that says "download the uncompressed one" is worth far
 *   more than an empty mesh.
 */

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};

const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/* ------------------------------------------------------------------ *
 * The container
 * ------------------------------------------------------------------ */

/*
 * GLB is a twelve-byte header and a chain of chunks: JSON first, then the
 * binary blob the accessors index into. A .gltf file is the same JSON on its
 * own, with the blob in a sibling file or inlined as a data: URI.
 */
export function parseGLB(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file (bad magic)');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`GLB version ${version} is not supported — only glTF 2.0`);

  const total = view.getUint32(8, true);
  let offset = 12, json = null, bin = null;
  while (offset + 8 <= Math.min(total, buffer.byteLength)) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
    } else if (type === 0x004e4942) {
      bin = buffer.slice(start, start + length);
    }
    /* Chunks are four-byte aligned; a file whose JSON length is not a multiple
     * of four has padding that is not part of the chunk. */
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function decodeDataURI(uri) {
  const comma = uri.indexOf(',');
  const meta = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  if (!/;base64$/.test(meta)) throw new Error('only base64 data: URIs are supported');
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return out.buffer;
}

/* ------------------------------------------------------------------ *
 * Accessors
 * ------------------------------------------------------------------ */

function readAccessor(json, buffers, index) {
  const acc = json.accessors[index];
  if (!acc) throw new Error(`glTF: accessor ${index} does not exist`);
  const comp = COMPONENT[acc.componentType];
  if (!comp) throw new Error(`glTF: component type ${acc.componentType} is not supported`);
  const per = COUNT[acc.type];
  if (!per) throw new Error(`glTF: accessor type ${acc.type} is not supported`);

  const out = new Float32Array(acc.count * per);
  if (acc.bufferView === undefined) return out;   /* legal, and means all zeroes */

  const view = json.bufferViews[acc.bufferView];
  const buffer = buffers[view.buffer];
  if (!buffer) throw new Error(`glTF: buffer ${view.buffer} was not supplied`);
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  /* byteStride is the gap between *elements*, not between components, and is
   * absent when the data is tightly packed. */
  const stride = view.byteStride || comp.size * per;

  const dv = new DataView(buffer);
  const readers = {
    5120: (o) => Math.max(dv.getInt8(o) / 127, -1),
    5121: (o) => dv.getUint8(o) / 255,
    5122: (o) => Math.max(dv.getInt16(o, true) / 32767, -1),
    5123: (o) => dv.getUint16(o, true) / 65535,
    5125: (o) => dv.getUint32(o, true),
    5126: (o) => dv.getFloat32(o, true),
  };
  /* Only the normalised integer formats are scaled; an index buffer or a
   * position stored as shorts is a plain number. */
  const raw = {
    5120: (o) => dv.getInt8(o),
    5121: (o) => dv.getUint8(o),
    5122: (o) => dv.getInt16(o, true),
    5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true),
    5126: (o) => dv.getFloat32(o, true),
  };
  const read = acc.normalized ? readers[acc.componentType] : raw[acc.componentType];

  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < per; c++) {
      out[i * per + c] = read(base + i * stride + c * comp.size);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

/*
 * Every triangle in the file, in one buffer, with the node hierarchy applied.
 *
 * A head is often several primitives — a body, a head, eyeballs, hair, each
 * with its own material — and they are merged rather than kept apart, because
 * face space does not care which material a vertex came from and the unwrap
 * needs the whole surface to project. Anything that turns out to be behind the
 * face lands on the back of the texture, where nothing paints it.
 *
 * `buffers` maps a buffer index to an ArrayBuffer, for a .gltf whose data sits
 * in a sibling .bin. GLB and data: URIs need nothing.
 */
export function parseGLTF(json, bin = null, extra = {}) {
  if (!json || json.asset === undefined) throw new Error('not a glTF document');
  const required = json.extensionsRequired || [];
  const draco = required.find((e) => e.includes('draco'));
  if (draco) {
    throw new Error(
      'this file is Draco-compressed (' + draco + '), which needs a decompressor '
      + 'larger than the whole game. Download the uncompressed glTF, or the OBJ, '
      + 'and import that instead.');
  }
  const unsupported = required.filter((e) => !e.startsWith('KHR_materials'));
  if (unsupported.length) {
    throw new Error(`this file requires glTF extensions that are not supported: ${unsupported.join(', ')}`);
  }

  const buffers = (json.buffers || []).map((b, i) => {
    if (extra[i]) return extra[i];
    if (b.uri && b.uri.startsWith('data:')) return decodeDataURI(b.uri);
    if (!b.uri) return bin;
    throw new Error(`glTF: buffer ${i} lives in "${b.uri}", which was not supplied — `
      + 'use the .glb, or pass the .bin alongside it');
  });

  const pos = [], nrm = [], uv = [], idx = [];
  let hadNormals = false, hadUVs = false, primitives = 0, skipped = 0;

  const emit = (prim, m) => {
    if (prim.mode !== undefined && prim.mode !== 4) { skipped++; return; }
    if (prim.extensions && prim.extensions.KHR_draco_mesh_compression) {
      throw new Error('this file has Draco-compressed geometry — download the uncompressed glTF or the OBJ');
    }
    const attrs = prim.attributes || {};
    if (attrs.POSITION === undefined) { skipped++; return; }
    const p = readAccessor(json, buffers, attrs.POSITION);
    const n = attrs.NORMAL !== undefined ? readAccessor(json, buffers, attrs.NORMAL) : null;
    const t = attrs.TEXCOORD_0 !== undefined ? readAccessor(json, buffers, attrs.TEXCOORD_0) : null;
    const base = pos.length / 3;

    /* Normals are rotated by the node's upper 3x3. Not the inverse transpose:
     * these are read for information only — the unwrap recomputes every normal
     * from the triangles it ends up with — and a non-uniform scale in a
     * downloaded head is rare enough not to be worth the extra matrix. */
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      pos.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]);
      if (n) {
        const nx = n[i], ny = n[i + 1], nz = n[i + 2];
        nrm.push(
          m[0] * nx + m[4] * ny + m[8] * nz,
          m[1] * nx + m[5] * ny + m[9] * nz,
          m[2] * nx + m[6] * ny + m[10] * nz);
        hadNormals = true;
      } else nrm.push(0, 0, 0);
    }
    if (t) { for (let i = 0; i < t.length; i++) uv.push(t[i]); hadUVs = true; }
    else { for (let i = 0; i < p.length / 3; i++) uv.push(0, 0); }

    if (prim.indices !== undefined) {
      const ind = readAccessor(json, buffers, prim.indices);
      for (let i = 0; i < ind.length; i++) idx.push(base + ind[i]);
    } else {
      for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
    }
    primitives++;
  };

  const walk = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    if (!node) return;
    const m = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) emit(prim, m);
    }
    for (const child of node.children || []) walk(child, m);
  };

  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const scene = json.scenes && json.scenes[json.scene === undefined ? 0 : json.scene];
  if (scene && scene.nodes) for (const n of scene.nodes) walk(n, identity);
  else if (json.nodes) json.nodes.forEach((_, i) => walk(i, identity));
  else if (json.meshes) for (const mesh of json.meshes) for (const prim of mesh.primitives) emit(prim, identity);

  if (!pos.length) {
    throw new Error(skipped
      ? 'nothing in this file is a triangle mesh with positions'
      : 'no geometry in this file');
  }

  return {
    positions: new Float32Array(pos),
    normals: hadNormals ? new Float32Array(nrm) : null,
    uvs: hadUVs ? new Float32Array(uv) : null,
    indices: new Uint32Array(idx),
    stats: { vertices: pos.length / 3, triangles: idx.length / 3, primitives, skipped },
  };
}

/* Either format, from bytes. `.glb` is a container around the same JSON, so
 * there is one entry point and the caller does not have to look at the
 * extension it was handed. */
export function parseMesh(bytes, extra = {}) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer;
  if (buffer.byteLength >= 4 && new DataView(buffer).getUint32(0, true) === 0x46546c67) {
    const { json, bin } = parseGLB(buffer);
    return parseGLTF(json, bin, extra);
  }
  const text = new TextDecoder().decode(new Uint8Array(buffer));
  return parseGLTF(JSON.parse(text), null, extra);
}
