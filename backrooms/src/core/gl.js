/*
 * gl.js — the thin layer between this game and WebGL2.
 *
 * Not a framework. It compiles programs, introspects their uniforms once so
 * call sites can say `p.u.uTime` instead of caching locations by hand, and
 * builds the three kinds of object the renderer needs: array textures, render
 * targets, and vertex arrays.
 *
 * WebGL2 is required and not polyfilled. Every device that can run this at a
 * playable frame rate has had it for years, and the WebGL1 path would cost the
 * texture arrays, the instancing and the float render targets that the whole
 * look depends on.
 */

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,          /* we resolve our own AA in the post chain */
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    /* No `desynchronized`. It shaves a frame of latency on desktop and has a
     * history of producing a blank canvas on mobile Safari, which is not a
     * trade worth making for a game meant to be played on a phone. */
  });
  if (!gl) return null;

  /* Float render targets carry the bloom. Without them we fall back to 8-bit
   * and lose the blown-out fluorescent highlight, which is most of the look —
   * so the renderer asks, and adapts if the answer is no. */
  const caps = {
    colorFloat: !!gl.getExtension('EXT_color_buffer_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    maxAniso: 1,
    maxTexSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
  };
  if (caps.aniso) {
    caps.maxAniso = gl.getParameter(caps.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  }
  return { gl, caps };
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '';
    /* Number the source so the driver's "ERROR: 0:214" is findable. */
    const numbered = src.split('\n')
      .map((l, i) => String(i + 1).padStart(4, ' ') + ' | ' + l).join('\n');
    gl.deleteShader(sh);
    throw new Error(`shader compile failed (${label}):\n${log}\n${numbered}`);
  }
  return sh;
}

export function createProgram(gl, vsSrc, fsSrc, label = 'program') {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + '.vert');
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + '.frag');
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`program link failed (${label}): ${log}`);
  }

  const u = Object.create(null);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    /* Arrays come back as "uLights[0]"; store under the bare name too so a
     * call site can pass the whole array in one uniform4fv. */
    const bare = info.name.replace(/\[0\]$/, '');
    u[bare] = gl.getUniformLocation(prog, info.name);
  }

  const a = Object.create(null);
  const an = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < an; i++) {
    const info = gl.getActiveAttrib(prog, i);
    if (!info) continue;
    a[info.name] = gl.getAttribLocation(prog, info.name);
  }

  return { prog, u, a, use: () => gl.useProgram(prog) };
}

/* ------------------------------------------------------------------ *
 * Textures
 * ------------------------------------------------------------------ */

/*
 * A 2D array texture holding every material of the current level, one per
 * layer. This is the reason the whole world draws in a handful of calls: the
 * material index rides along in the vertex data, so floor, wallpaper, ceiling
 * tile and light panel all come out of one buffer with one bind.
 */
export function createArrayTexture(gl, caps, width, height, layers, pixelsPerLayer, opts = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const levels = opts.mips === false ? 1 : Math.floor(Math.log2(Math.max(width, height))) + 1;
  const internal = opts.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8;
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, width, height, layers);
  for (let i = 0; i < layers; i++) {
    const px = pixelsPerLayer[i];
    if (!px) continue;
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, width, height, 1,
      gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  if (levels > 1) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER,
    levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  if (caps.aniso) {
    gl.texParameterf(gl.TEXTURE_2D_ARRAY, caps.aniso.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8, caps.maxAniso));
  }
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return tex;
}

export function createTexture2D(gl, width, height, pixels, opts = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, opts.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
    width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels || null);
  const filter = opts.nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/* ------------------------------------------------------------------ *
 * Render targets
 * ------------------------------------------------------------------ */

export function createTarget(gl, caps, width, height, opts = {}) {
  const float = opts.float !== false && caps.colorFloat;
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

  const color = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8,
    width, height, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);

  let depth = null;
  if (opts.depth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('framebuffer incomplete: 0x' + status.toString(16));
  }
  return { fb, color, depth, width, height, float };
}

export function destroyTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.color);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/*
 * One oversized triangle instead of a quad for full-screen passes: no diagonal
 * seam, one fewer vertex, and the fragment shader gets its UV from gl_VertexID
 * so there is no vertex buffer to bind at all.
 */
export function createFullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindVertexArray(null);
  return vao;
}

/* Vertex layout is described once, here, and shared by the mesher and the
 * renderer so the two cannot drift apart. Sizes are in floats. */
export const VERTEX_LAYOUT = [
  { name: 'aPos',  size: 3 },
  { name: 'aNrm',  size: 3 },
  { name: 'aUV',   size: 2 },
  { name: 'aTan',  size: 4 },   /* xyz tangent, w = bitangent sign */
  { name: 'aAO',   size: 1 },
  { name: 'aMat',  size: 1 },
];
export const VERTEX_FLOATS = VERTEX_LAYOUT.reduce((n, f) => n + f.size, 0);

export function createMeshVAO(gl, prog, vertices, indices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const stride = VERTEX_FLOATS * 4;
  let offset = 0;
  for (const f of VERTEX_LAYOUT) {
    const loc = prog.a[f.name];
    if (loc !== undefined && loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, f.size, gl.FLOAT, false, stride, offset);
    }
    offset += f.size * 4;
  }

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, vbo, ibo, count: indices.length };
}

export function destroyMesh(gl, m) {
  if (!m) return;
  gl.deleteVertexArray(m.vao);
  gl.deleteBuffer(m.vbo);
  gl.deleteBuffer(m.ibo);
}
