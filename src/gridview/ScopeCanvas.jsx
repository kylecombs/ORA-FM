import { useRef, useEffect } from 'react';
import { SCOPE_W, SCOPE_H, SCOPE_DISPLAY_SAMPLES } from './constants';

// ── Shared fullscreen-quad vertex shader ──
const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ── Graticule + background fragment shader ──
const GRAT_FRAG = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_mode;
uniform vec3 u_accent;
uniform float u_hasSignal;
uniform sampler2D u_waveform;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  bool classic = u_mode > 0.5;
  vec3 bg = classic ? vec3(0.031, 0.031, 0.039) : vec3(0.067, 0.063, 0.063);
  float grat = 0.0;
  vec3 gc = vec3(0.478, 0.459, 0.439);
  if (classic) {
    for (float i = 1.0; i < 5.0; i += 1.0) {
      float d = abs(v_uv.y - i / 5.0) * u_resolution.y;
      grat = max(grat, smoothstep(0.7, 0.0, d) * 0.08);
    }
    for (float i = 1.0; i < 8.0; i += 1.0) {
      float d = abs(v_uv.x - i / 8.0) * u_resolution.x;
      grat = max(grat, smoothstep(0.7, 0.0, d) * 0.08);
    }
  }
  float cd = abs(v_uv.y - 0.5) * u_resolution.y;
  grat = max(grat, smoothstep(0.7, 0.0, cd) * (classic ? 0.18 : 0.12));
  if (!classic) {
    float q1 = abs(v_uv.y - 0.25) * u_resolution.y;
    float q3 = abs(v_uv.y - 0.75) * u_resolution.y;
    grat = max(grat, smoothstep(0.7, 0.0, q1) * 0.05);
    grat = max(grat, smoothstep(0.7, 0.0, q3) * 0.05);
  }
  vec3 color = bg + gc * grat;
  if (!classic && u_hasSignal > 0.5) {
    float s = texture(u_waveform, vec2(v_uv.x, 0.5)).r;
    if (v_uv.y < s) color += u_accent * 0.06;
  }
  fragColor = vec4(color, 1.0);
}`;

// ── Woscope-style line vertex shader ──
// Expands 4 colocated vertices per sample into a quad around each
// line segment. Works in pixel space for correct aspect ratio.
const LINE_VERT = `#version 300 es
precision highp float;
uniform float uSize;
uniform vec2 uResolution;
in vec2 aStart;
in vec2 aEnd;
in float aIdx;
out vec4 vLine;
void main() {
  vec2 sPx = (aStart * 0.5 + 0.5) * uResolution;
  vec2 ePx = (aEnd * 0.5 + 0.5) * uResolution;
  float idx = mod(aIdx, 4.0);
  vec2 current;
  float tang;
  if (idx >= 2.0) { current = ePx; tang = 1.0; }
  else { current = sPx; tang = -1.0; }
  float side = (mod(idx, 2.0) - 0.5) * 2.0;
  vec2 dir = ePx - sPx;
  float len = length(dir);
  vLine = vec4(tang, side, len, 0.0);
  if (len > 0.001) dir /= len;
  else dir = vec2(1.0, 0.0);
  vec2 norm = vec2(-dir.y, dir.x);
  vec2 posPx = current + (tang * dir + norm * side) * uSize;
  gl_Position = vec4(posPx / uResolution * 2.0 - 1.0, 0.0, 1.0);
}`;

// ── Woscope-style line fragment shader ──
// Analytical Gaussian beam intensity via error function (erf).
// Physically models a CRT electron beam's intensity profile.
const LINE_FRAG = `#version 300 es
precision highp float;
#define SQRT2 1.4142135623730951
uniform float uSize;
uniform float uIntensity;
uniform vec3 uColor;
in vec4 vLine;
out vec4 fragColor;
float erf(float x) {
  float s = sign(x), a = abs(x);
  x = 1.0 + (0.278393 + (0.230389 + (0.000972 + 0.078108 * a) * a) * a) * a;
  x *= x;
  return s - s / (x * x);
}
void main() {
  float len = vLine.z;
  vec2 xy = vec2((len * 0.5 + uSize) * vLine.x + len * 0.5, uSize * vLine.y);
  float sigma = uSize / 4.0;
  float alpha;
  if (len < 0.001) {
    alpha = exp(-dot(xy, xy) / (2.0 * sigma * sigma)) * 0.5;
  } else {
    alpha = erf((len - xy.x) / SQRT2 / sigma) + erf(xy.x / SQRT2 / sigma);
    // sqrt normalization instead of linear (/ len * uSize) to reduce
    // velocity-based dimming — keeps fast-moving zero-crossing regions
    // visible at high frequencies while still dimming proportionally.
    alpha *= exp(-xy.y * xy.y / (2.0 * sigma * sigma)) * 0.5 * sqrt(uSize / max(len, uSize));
  }
  alpha *= uIntensity;
  fragColor = vec4(uColor * alpha, alpha);
}`;

// ── WebGL helpers ──────────────────────────────────────────────
function scopeCompileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[Scope] shader error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function scopeCreateProgram(gl, vSrc, fSrc) {
  const vs = scopeCompileShader(gl, gl.VERTEX_SHADER, vSrc);
  const fs = scopeCompileShader(gl, gl.FRAGMENT_SHADER, fSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[Scope] program error:', gl.getProgramInfoLog(p));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

export default function ScopeCanvas({ buffersRef, nodeId, bufferSize, accentColor }) {
  const canvasRef = useRef(null);
  const textCanvasRef = useRef(null);
  const animRef = useRef(null);
  const glStateRef = useRef(null);
  const normBuf = useRef(new Float32Array(SCOPE_DISPLAY_SAMPLES));

  const h = SCOPE_H;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) {
      console.warn('[Scope] WebGL2 not available');
      return;
    }

    gl.getExtension('OES_texture_float_linear');

    // ── Compile shader programs ──
    const gratProg = scopeCreateProgram(gl, QUAD_VERT, GRAT_FRAG);
    const lineProg = scopeCreateProgram(gl, LINE_VERT, LINE_FRAG);
    if (!gratProg || !lineProg) return;

    // ── Uniform locations ──
    const gratU = {
      resolution: gl.getUniformLocation(gratProg, 'u_resolution'),
      mode:       gl.getUniformLocation(gratProg, 'u_mode'),
      accent:     gl.getUniformLocation(gratProg, 'u_accent'),
      hasSignal:  gl.getUniformLocation(gratProg, 'u_hasSignal'),
      waveform:   gl.getUniformLocation(gratProg, 'u_waveform'),
    };
    const lineU = {
      size:       gl.getUniformLocation(lineProg, 'uSize'),
      resolution: gl.getUniformLocation(lineProg, 'uResolution'),
      intensity:  gl.getUniformLocation(lineProg, 'uIntensity'),
      color:      gl.getUniformLocation(lineProg, 'uColor'),
    };
    // ── Shared fullscreen quad VBO ──
    const quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    // Graticule VAO
    const gratVao = gl.createVertexArray();
    gl.bindVertexArray(gratVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    const gratPosLoc = gl.getAttribLocation(gratProg, 'a_pos');
    gl.enableVertexAttribArray(gratPosLoc);
    gl.vertexAttribPointer(gratPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ── Line segment geometry buffers ──
    const maxSegments = SCOPE_DISPLAY_SAMPLES - 1;
    const maxVerts = maxSegments * 4;

    // Scratch buffer: 4 copies of (x,y) per sample, updated each frame
    const scratchBuf = new Float32Array(SCOPE_DISPLAY_SAMPLES * 8);
    const lineVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, scratchBuf.byteLength, gl.DYNAMIC_DRAW);

    // Static vertex index attribute: [0, 1, 2, 3, 4, 5, ...]
    const idxData = new Float32Array(maxVerts);
    for (let i = 0; i < maxVerts; i++) idxData[i] = i;
    const idxVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idxVbo);
    gl.bufferData(gl.ARRAY_BUFFER, idxData, gl.STATIC_DRAW);

    // Static element index buffer (2 triangles per segment quad)
    const ebo = gl.createBuffer();
    const indices = new Uint16Array(maxSegments * 6);
    for (let i = 0; i < maxSegments; i++) {
      const b = i * 4, o = i * 6;
      indices[o] = b; indices[o+1] = b+1; indices[o+2] = b+2;
      indices[o+3] = b+2; indices[o+4] = b+1; indices[o+5] = b+3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Line VAO — woscope stride trick: aStart/aEnd read from same VBO
    // at 1-sample offset. Each sample is stored 4× as (x,y) pairs.
    // Stride = 8 bytes (one vec2). aEnd offset = 32 bytes (4 vec2 = next sample).
    const lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    const aStartLoc = gl.getAttribLocation(lineProg, 'aStart');
    const aEndLoc   = gl.getAttribLocation(lineProg, 'aEnd');
    const aIdxLoc   = gl.getAttribLocation(lineProg, 'aIdx');
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
    gl.enableVertexAttribArray(aStartLoc);
    gl.vertexAttribPointer(aStartLoc, 2, gl.FLOAT, false, 8, 0);
    gl.enableVertexAttribArray(aEndLoc);
    gl.vertexAttribPointer(aEndLoc, 2, gl.FLOAT, false, 8, 32);
    gl.bindBuffer(gl.ARRAY_BUFFER, idxVbo);
    gl.enableVertexAttribArray(aIdxLoc);
    gl.vertexAttribPointer(aIdxLoc, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bindVertexArray(null);

    // ── Waveform texture (for modern fill-under-curve) ──
    const waveTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, SCOPE_DISPLAY_SAMPLES, 1, 0,
                  gl.RED, gl.FLOAT, new Float32Array(SCOPE_DISPLAY_SAMPLES));

    // Accent color (0–1 float)
    const ar = parseInt(accentColor.slice(1, 3), 16) / 255;
    const ag = parseInt(accentColor.slice(3, 5), 16) / 255;
    const ab = parseInt(accentColor.slice(5, 7), 16) / 255;

    const state = { smoothYMin: null, smoothYMax: null, lastTrigIdx: -1 };
    glStateRef.current = state;

    const tctx = textCanvasRef.current?.getContext('2d');

    // ── Helpers ──
    // Find rising zero-crossing with sub-sample interpolation and
    // hysteresis: prefer a crossing within ±10 samples of the previous
    // trigger to prevent the display from jumping between distant
    // crossings (which causes "double tracing" in CRT persistence).
    const findTrigger = (buf, prevTrigIdx) => {
      const end = buf.length - SCOPE_DISPLAY_SAMPLES;
      // Hysteresis: search near previous trigger first
      if (prevTrigIdx >= 0 && prevTrigIdx < end) {
        const lo = Math.max(0, prevTrigIdx - 10);
        const hi = Math.min(end - 1, prevTrigIdx + 10);
        for (let i = lo; i < hi; i++) {
          if (buf[i] <= 0 && buf[i + 1] > 0) {
            const frac = -buf[i] / (buf[i + 1] - buf[i]);
            return { index: i, frac };
          }
        }
      }
      // Fall back to first crossing
      for (let i = 0; i < end - 1; i++) {
        if (buf[i] <= 0 && buf[i + 1] > 0) {
          const frac = -buf[i] / (buf[i + 1] - buf[i]);
          return { index: i, frac };
        }
      }
      return { index: 0, frac: 0 };
    };

    const computeYBounds = (buf, start, count) => {
      let min = Infinity, max = -Infinity;
      for (let i = start; i < start + count; i++) {
        const v = buf[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max - min < 0.001) { min -= 0.5; max += 0.5; }
      const pad = (max - min) * 0.15 || 0.1;
      return { yMin: min - pad, yMax: max + pad };
    };

    // ── Draw loop ──
    const draw = () => {
      const ch = SCOPE_H;

      if (canvas.height !== ch) canvas.height = ch;
      const tc = textCanvasRef.current;
      if (tc && tc.height !== ch) tc.height = ch;

      const buf = buffersRef.current.get(nodeId);
      const hasSignal = buf && buf.length >= SCOPE_DISPLAY_SAMPLES;

      let yMin = 0, yMax = 1;
      let numSegments = 0;

      // Reset state when signal is lost so reconnection starts fresh
      if (!hasSignal && state.smoothYMin !== null) {
        state.smoothYMin = null;
        state.smoothYMax = null;
        state.lastTrigIdx = -1;
      }

      if (hasSignal) {
        const trig = findTrigger(buf, state.lastTrigIdx);
        const trigIdx = trig.index;
        state.lastTrigIdx = trigIdx;
        const trigFrac = trig.frac;
        const displayLen = Math.min(SCOPE_DISPLAY_SAMPLES, buf.length - trigIdx);
        const bounds = computeYBounds(buf, trigIdx, displayLen);

        // Smooth Y-axis bounds (EMA α=0.18)
        if (state.smoothYMin === null) {
          state.smoothYMin = bounds.yMin;
          state.smoothYMax = bounds.yMax;
        } else {
          state.smoothYMin += (bounds.yMin - state.smoothYMin) * 0.18;
          state.smoothYMax += (bounds.yMax - state.smoothYMax) * 0.18;
        }
        yMin = state.smoothYMin;
        yMax = state.smoothYMax;
        const range = yMax - yMin;

        const norm = normBuf.current;
        for (let i = 0; i < displayLen; i++) {
          norm[i] = Math.max(0, Math.min(1, (buf[trigIdx + i] - yMin) / range));
        }

        // Build line geometry: 4 copies of (x,y) per sample in clip space
        numSegments = displayLen - 1;
        const dx = 2.0 / (displayLen - 1);
        const xOff = -trigFrac * dx; // sub-sample trigger alignment
        for (let i = 0; i < displayLen; i++) {
          const x = i * dx - 1.0 + xOff;
          const y = norm[i] * 2.0 - 1.0;
          const b = i * 8;
          scratchBuf[b] = x; scratchBuf[b+1] = y;
          scratchBuf[b+2] = x; scratchBuf[b+3] = y;
          scratchBuf[b+4] = x; scratchBuf[b+5] = y;
          scratchBuf[b+6] = x; scratchBuf[b+7] = y;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratchBuf.subarray(0, displayLen * 8));
      }

      // ── Render: CRT mode with multi-pass glow ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, SCOPE_W, SCOPE_H);
      gl.disable(gl.BLEND);

      // Graticule + background
      gl.useProgram(gratProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, waveTex);
      gl.uniform1i(gratU.waveform, 0);
      gl.uniform2f(gratU.resolution, SCOPE_W, SCOPE_H);
      gl.uniform1f(gratU.mode, 1.0);
      gl.uniform3f(gratU.accent, ar, ag, ab);
      gl.uniform1f(gratU.hasSignal, 0.0);
      gl.bindVertexArray(gratVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Waveform lines with multi-pass glow (core + mid + outer)
      if (hasSignal && numSegments > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(lineProg);
        gl.uniform2f(lineU.resolution, SCOPE_W, SCOPE_H);
        gl.uniform3f(lineU.color, ar, ag, ab);
        gl.bindVertexArray(lineVao);

        gl.uniform1f(lineU.size, 2.5);
        gl.uniform1f(lineU.intensity, 1.4);
        gl.drawElements(gl.TRIANGLES, numSegments * 6, gl.UNSIGNED_SHORT, 0);

        gl.uniform1f(lineU.size, 6.0);
        gl.uniform1f(lineU.intensity, 0.45);
        gl.drawElements(gl.TRIANGLES, numSegments * 6, gl.UNSIGNED_SHORT, 0);

        gl.uniform1f(lineU.size, 12.0);
        gl.uniform1f(lineU.intensity, 0.18);
        gl.drawElements(gl.TRIANGLES, numSegments * 6, gl.UNSIGNED_SHORT, 0);

        gl.disable(gl.BLEND);
      }

      // ── Text overlay ──
      if (tctx) {
        tctx.clearRect(0, 0, SCOPE_W, SCOPE_H);

        if (hasSignal) {
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const a = Math.abs(buf[i]);
            if (a > peak) peak = a;
          }

          tctx.fillStyle = 'rgba(212, 207, 200, 0.45)';
          tctx.font = '10px "DM Mono", monospace';
          tctx.textAlign = 'right';
          tctx.fillText(peak.toFixed(3), SCOPE_W - 5, 13);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      gl.deleteProgram(gratProg);
      gl.deleteProgram(lineProg);
      gl.deleteTexture(waveTex);
      gl.deleteBuffer(quadVbo);
      gl.deleteBuffer(lineVbo);
      gl.deleteBuffer(idxVbo);
      gl.deleteBuffer(ebo);
      gl.deleteVertexArray(gratVao);
      gl.deleteVertexArray(lineVao);
      glStateRef.current = null;
    };
  }, [buffersRef, nodeId, bufferSize, accentColor]);

  return (
    <div className="scope-body scope-classic">
      <canvas
        ref={canvasRef}
        className="scope-canvas"
        width={SCOPE_W}
        height={h}
      />
      <canvas
        ref={textCanvasRef}
        width={SCOPE_W}
        height={h}
        style={{
          position: 'absolute', top: 0, left: 0,
          display: 'block', width: '100%',
          height: `${h}px`, pointerEvents: 'none',
        }}
      />
    </div>
  );
}
