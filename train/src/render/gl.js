/*
 * gl.js — the thin layer over WebGL2 that the rest of the renderer speaks to.
 *
 * Deliberately small: programs with a cached uniform table, an interleaved
 * vertex format shared by every mesh in the game, textures from canvases, and
 * render targets. No material system, no scene graph — those live above this
 * file, because the only thing this one should know is how to talk to the GPU.
 */

/* One interleaved vertex layout for everything. Fixed attribute locations mean
   a program never has to be queried for them and every mesh binds the same
   way regardless of which shader draws it. */
export const ATTRIB = {
  position: 0,   // vec3
  normal: 1,     // vec3
  uv: 2,         // vec2
  color: 3,      // vec4 — rgb tint, a = baked ambient occlusion
};
export const VERTEX_FLOATS = 12;
export const VERTEX_BYTES = VERTEX_FLOATS * 4;

export function createGL(canvas) {
  const attrs = {
    alpha: false,
    antialias: false,           // the post chain resolves aliasing instead
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
  };
  const gl = canvas.getContext('webgl2', attrs);
  if (!gl) return null;

  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  gl.__aniso = aniso
    ? { ext: aniso, max: Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) }
    : null;

  return gl;
}

export class Program {
  constructor(gl, vsSource, fsSource, name = 'program') {
    this.gl = gl;
    this.name = name;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSource, `${name}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource, `${name}.frag`);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`[gl] link failed for ${name}: ${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = prog;

    this.uniforms = new Map();
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      /* Array uniforms report as "name[0]"; store both spellings so callers
         can ask for either. */
      const base = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(prog, info.name);
      this.uniforms.set(info.name, loc);
      if (base !== info.name) this.uniforms.set(base, loc);
    }
    /* Sampler name -> texture unit, assigned once and never reused for
       anything else. Handing out units per bind instead — which is the
       obvious way to write this — walks off the end of the unit range after a
       few dozen draw calls and every texture in the frame silently reads
       black. */
    this.units = new Map();
  }

  use() {
    this.gl.useProgram(this.program);
    return this;
  }

  loc(name) {
    return this.uniforms.has(name) ? this.uniforms.get(name) : null;
  }

  mat4(name, value) { const l = this.loc(name); if (l) this.gl.uniformMatrix4fv(l, false, value); return this; }
  mat3(name, value) { const l = this.loc(name); if (l) this.gl.uniformMatrix3fv(l, false, value); return this; }
  f(name, v) { const l = this.loc(name); if (l) this.gl.uniform1f(l, v); return this; }
  i(name, v) { const l = this.loc(name); if (l) this.gl.uniform1i(l, v); return this; }
  v2(name, x, y) { const l = this.loc(name); if (l) this.gl.uniform2f(l, x, y); return this; }
  v3(name, x, y, z) { const l = this.loc(name); if (l) this.gl.uniform3f(l, x, y, z); return this; }
  v4(name, x, y, z, w) { const l = this.loc(name); if (l) this.gl.uniform4f(l, x, y, z, w); return this; }
  fv(name, arr) { const l = this.loc(name); if (l) this.gl.uniform1fv(l, arr); return this; }
  v3v(name, arr) { const l = this.loc(name); if (l) this.gl.uniform3fv(l, arr); return this; }
  v4v(name, arr) { const l = this.loc(name); if (l) this.gl.uniform4fv(l, arr); return this; }

  tex(name, texture) {
    const l = this.loc(name);
    if (!l) return this;
    const gl = this.gl;
    let unit = this.units.get(name);
    if (unit === undefined) {
      unit = this.units.size;
      this.units.set(name, unit);
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(l, unit);
    return this;
  }

  dispose() { this.gl.deleteProgram(this.program); }
}

function compile(gl, type, source, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = source.split('\n').map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join('\n');
    gl.deleteShader(sh);
    throw new Error(`[gl] compile failed for ${label}: ${log}\n${numbered}`);
  }
  return sh;
}

/*
 * A Mesh owns one interleaved vertex buffer, one index buffer and a list of
 * draw groups. A group is a contiguous index range sharing a material, which
 * is how an entire carriage — floor, seats, panels, glass, twenty poster
 * quads — ends up as one VAO and a handful of draw calls.
 */
export class Mesh {
  constructor(gl, vertices, indices, groups) {
    this.gl = gl;
    this.groups = groups;
    this.indexCount = indices.length;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const stride = VERTEX_BYTES;
    gl.enableVertexAttribArray(ATTRIB.position);
    gl.vertexAttribPointer(ATTRIB.position, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ATTRIB.normal);
    gl.vertexAttribPointer(ATTRIB.normal, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(ATTRIB.uv);
    gl.vertexAttribPointer(ATTRIB.uv, 2, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(ATTRIB.color);
    gl.vertexAttribPointer(ATTRIB.color, 4, gl.FLOAT, false, stride, 32);

    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    this.indexType = indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  bind() { this.gl.bindVertexArray(this.vao); }

  drawGroup(group) {
    const bytes = this.indexType === this.gl.UNSIGNED_SHORT ? 2 : 4;
    this.gl.drawElements(this.gl.TRIANGLES, group.count, this.indexType, group.start * bytes);
  }

  dispose() {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteBuffer(this.ibo);
  }
}

export function createTexture(gl, source, opts = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY !== false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const wrap = opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

  if (opts.nearest) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  } else {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (gl.__aniso) {
      gl.texParameterf(gl.TEXTURE_2D, gl.__aniso.ext.TEXTURE_MAX_ANISOTROPY_EXT, gl.__aniso.max);
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  tex.__canvas = source instanceof HTMLCanvasElement ? source : null;
  tex.__mipped = !opts.nearest;
  return tex;
}

/* Re-uploads a canvas whose pixels changed — the station display and the route
   map are redrawn in place rather than rebuilt as new GL objects. */
export function updateTexture(gl, tex, source) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (tex.__mipped) gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createSolidTexture(gl, r, g, b, a = 255) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([r, g, b, a]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/*
 * A render target, optionally multisampled.
 *
 * With `samples > 0` the scene is drawn into multisampled renderbuffers and
 * blitted down into the texture before anything reads it. The alternative —
 * asking for `antialias: true` on the canvas — does nothing at all here,
 * because the scene never touches the default framebuffer; it goes through a
 * post chain. Without this every edge in the game is a hard staircase, and a
 * carriage is mostly edges: poles, window frames, handrails, door jambs.
 */
export class RenderTarget {
  constructor(gl, width, height, { depth = false, filter = 'linear', samples = 0 } = {}) {
    this.gl = gl;
    this.width = Math.max(1, width | 0);
    this.height = Math.max(1, height | 0);
    this.hasDepth = depth;
    this.filterMode = filter;
    this.samples = Math.max(0, samples | 0);
    this.fbo = gl.createFramebuffer();
    this.texture = gl.createTexture();
    this.depthBuffer = depth ? gl.createRenderbuffer() : null;
    this.msFbo = null;
    this.msColor = null;
    this._allocate();
  }

  _allocate() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = this.filterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    const wantMs = this.samples > 0;
    if (wantMs) {
      if (!this.msFbo) this.msFbo = gl.createFramebuffer();
      if (!this.msColor) this.msColor = gl.createRenderbuffer();
      const max = gl.getParameter(gl.MAX_SAMPLES) || 0;
      const n = Math.min(this.samples, max);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, n, gl.RGBA8, this.width, this.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msColor);
      if (this.depthBuffer) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, n, gl.DEPTH_COMPONENT24, this.width, this.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);
      }
      /* A driver that will not give us this configuration gets to say so once,
         and we fall back to drawing straight into the texture. */
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(this.msFbo);
        gl.deleteRenderbuffer(this.msColor);
        this.msFbo = null;
        this.msColor = null;
        this.samples = 0;
      }
    } else if (this.msFbo) {
      gl.deleteFramebuffer(this.msFbo);
      gl.deleteRenderbuffer(this.msColor);
      this.msFbo = null;
      this.msColor = null;
    }

    if (this.depthBuffer && !this.msFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  setSamples(samples) {
    const n = Math.max(0, samples | 0);
    if (n === this.samples) return;
    this.samples = n;
    this._allocate();
  }

  resize(width, height) {
    width = Math.max(1, width | 0);
    height = Math.max(1, height | 0);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this._allocate();
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo || this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  /* Collapses the samples into `texture`. Must run before anything samples it. */
  resolve() {
    if (!this.msFbo) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.texture);
    if (this.depthBuffer) gl.deleteRenderbuffer(this.depthBuffer);
    if (this.msFbo) gl.deleteFramebuffer(this.msFbo);
    if (this.msColor) gl.deleteRenderbuffer(this.msColor);
  }
}

/* A single triangle covering the screen. Cheaper than two and, unlike a quad,
   has no diagonal seam where derivatives go strange. */
export class ScreenQuad {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.buffer = buf;
  }

  draw() {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose() {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buffer);
  }
}
