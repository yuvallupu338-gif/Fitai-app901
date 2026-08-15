/*
 * gl.js — the thin layer between this game and WebGL2.
 *
 * Not a framework. It compiles programs and introspects their uniforms once so
 * call sites can write `p.u.uTime` instead of caching locations by hand, and it
 * builds the three kinds of object the renderer needs: textures, render
 * targets and vertex arrays.
 *
 * WebGL2 is required and not polyfilled. The face paint layer is a texture the
 * game rewrites while you brush, and the whole look depends on half-float
 * render targets for the highlighter's bloom; the WebGL1 path would cost both.
 */

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,          /* AA is resolved in the post chain */
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const caps = {
    colorFloat: !!gl.getExtension('EXT_color_buffer_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    maxAniso: 1,
    maxTexSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
  if (caps.aniso) caps.maxAniso = gl.getParameter(caps.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
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
    /* Arrays come back as "uLights[0]"; store the bare name too so a call site
     * can upload the whole array in one uniform4fv. */
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
  }

  const a = Object.create(null);
  const an = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < an; i++) {
    const info = gl.getActiveAttrib(prog, i);
    if (info) a[info.name] = gl.getAttribLocation(prog, info.name);
  }

  return { prog, u, a, use: () => gl.useProgram(prog) };
}

/* ------------------------------------------------------------------ *
 * Textures
 * ------------------------------------------------------------------ */

export function createTexture2D(gl, caps, width, height, pixels, opts = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const internal = opts.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8;
  const mips = opts.mips !== false;
  const levels = mips ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, internal, width, height);
  if (pixels) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height,
      gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  }
  const min = opts.nearest ? gl.NEAREST : (mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.nearest ? gl.NEAREST : gl.LINEAR);
  const wrap = opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (caps && caps.aniso && mips) {
    gl.texParameterf(gl.TEXTURE_2D, caps.aniso.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8, caps.maxAniso));
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, width, height, mips };
}

/*
 * Push a rectangle of a CPU-side RGBA buffer into a texture.
 *
 * Brush strokes touch a few thousand texels out of a quarter of a million, and
 * re-uploading the whole face for each of them is the difference between a
 * brush that follows the pointer and one that lags behind it. UNPACK_ROW_LENGTH
 * is what makes the sub-rectangle addressable without copying it out first.
 */
export function updateTextureRect(gl, t, buf, x, y, w, h, fullWidth) {
  if (w <= 0 || h <= 0) return;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, fullWidth);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/* Mip regeneration is deferred to stroke end by the caller: doing it per splat
 * costs more than the upload it follows. */
export function regenMips(gl, t) {
  if (!t.mips) return;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
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

/* One oversized triangle for full-screen passes: no diagonal seam, and the
 * fragment shader derives its UV from gl_VertexID so there is no buffer to
 * bind at all. */
export function createFullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindVertexArray(null);
  return vao;
}

/*
 * The vertex layout is described once, here, and shared by the mesh builder
 * and the renderer so the two cannot drift apart. Sizes are in floats.
 *
 * There is no tangent. Surface detail — skin pores, the grain in the counter
 * marble, the brushed metal on the till — is bumped from a height channel
 * using screen-space derivatives, which needs no per-vertex frame and works
 * identically on the head, whose UVs are a sphere unwrap, and on the props,
 * whose UVs are per-face.
 */
export const VERTEX_LAYOUT = [
  { name: 'aPos', size: 3 },
  { name: 'aNrm', size: 3 },
  { name: 'aUV',  size: 2 },
  { name: 'aAO',  size: 1 },
];
export const VERTEX_FLOATS = VERTEX_LAYOUT.reduce((n, f) => n + f.size, 0);

/*
 * The expression morph targets, in their own buffer. Only the head has one; a
 * mesh without it leaves these attributes at the generic default of zero and
 * the vertex shader adds nothing, so one shader still draws everything.
 */
export const MORPH_LAYOUT = [
  { name: 'aM1Pos', size: 3 },
  { name: 'aM1Nrm', size: 3 },
  { name: 'aM2Pos', size: 3 },
  { name: 'aM2Nrm', size: 3 },
];
export const MORPH_FLOATS = MORPH_LAYOUT.reduce((n, f) => n + f.size, 0);

export function createMeshVAO(gl, prog, vertices, indices, morph) {
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

  let mbo = null;
  if (morph) {
    mbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mbo);
    gl.bufferData(gl.ARRAY_BUFFER, morph, gl.STATIC_DRAW);
    const mstride = MORPH_FLOATS * 4;
    let moff = 0;
    for (const f of MORPH_LAYOUT) {
      const loc = prog.a[f.name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, f.size, gl.FLOAT, false, mstride, moff);
      }
      moff += f.size * 4;
    }
  }

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, vbo, ibo, mbo, count: indices.length };
}

export function destroyMesh(gl, m) {
  if (!m) return;
  gl.deleteVertexArray(m.vao);
  gl.deleteBuffer(m.vbo);
  gl.deleteBuffer(m.ibo);
  if (m.mbo) gl.deleteBuffer(m.mbo);
}
