// ════════════════════════════════════════════════════════════
//  ENVELOPE RUNNER
//
//  JavaScript-based breakpoint envelope playback engine.
//  Interpolates envelope values at ~30fps and outputs via
//  callback (which writes to scsynth control buses through
//  the existing modulation system).
//
//  Uses SuperCollider's curve interpolation formula:
//    linear (curve ~ 0): lerp(a, b, t)
//    curved: a + (b-a) * (1 - exp(t*curve)) / (1 - exp(curve))
// ════════════════════════════════════════════════════════════

/**
 * SuperCollider-style curve interpolation.
 * @param {number} t       - normalized position within segment (0–1)
 * @param {number} startVal - value at segment start
 * @param {number} endVal   - value at segment end
 * @param {number} curve    - 0=linear, >0=concave, <0=convex
 */
export function curveInterp(t, startVal, endVal, curve) {
  if (Math.abs(curve) < 0.001) {
    return startVal + (endVal - startVal) * t;
  }
  const denom = 1 - Math.exp(curve);
  const numer = 1 - Math.exp(t * curve);
  return startVal + (endVal - startVal) * (numer / denom);
}

/**
 * Interpolate a value from a breakpoint envelope at normalized time t (0–1).
 * @param {number} t - normalized time position
 * @param {Array<{time: number, value: number}>} breakpoints - sorted by time
 * @param {Array<number>} curves - one curve value per segment
 */
export function interpolateEnvelope(t, breakpoints, curves) {
  if (!breakpoints || breakpoints.length === 0) return 0;
  if (breakpoints.length === 1) return breakpoints[0].value;

  // Clamp t
  if (t <= breakpoints[0].time) return breakpoints[0].value;
  if (t >= breakpoints[breakpoints.length - 1].time) {
    return breakpoints[breakpoints.length - 1].value;
  }

  // Find active segment
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const bp0 = breakpoints[i];
    const bp1 = breakpoints[i + 1];

    if (t >= bp0.time && t <= bp1.time) {
      const segDur = bp1.time - bp0.time;
      if (segDur <= 0) return bp0.value;

      const segT = (t - bp0.time) / segDur;
      return curveInterp(segT, bp0.value, bp1.value, curves[i] || 0);
    }
  }

  return breakpoints[breakpoints.length - 1].value;
}

// ── Runner class ────────────────────────────────────────────

export class EnvelopeRunner {
  /**
   * @param {(nodeId: number, value: number) => void} onOutput
   */
  constructor(onOutput) {
    this._onOutput = onOutput;
    this._contexts = new Map(); // nodeId → ctx
  }

  /**
   * Trigger (start/restart) envelope playback for a node.
   */
  trigger(nodeId, breakpoints, curves, duration, loop = false) {
    this.stop(nodeId);

    if (!breakpoints || breakpoints.length < 2) return;

    const ctx = {
      breakpoints,
      curves,
      duration: Math.max(0.01, duration),
      loop,
      startTime: performance.now(),
      stopped: false,
      interval: null,
    };

    // Emit initial value
    this._onOutput(nodeId, breakpoints[0].value);

    ctx.interval = setInterval(() => {
      if (ctx.stopped) return;

      const elapsed = (performance.now() - ctx.startTime) / 1000;
      let normT = elapsed / ctx.duration;

      if (normT >= 1) {
        if (loop) {
          ctx.startTime = performance.now();
          normT = 0;
        } else {
          const finalVal = breakpoints[breakpoints.length - 1].value;
          this._onOutput(nodeId, finalVal);
          this.stop(nodeId);
          return;
        }
      }

      const value = interpolateEnvelope(normT, breakpoints, curves);
      this._onOutput(nodeId, value);
    }, 33); // ~30fps (matches ScriptRunner cadence)

    this._contexts.set(nodeId, ctx);
  }

  /**
   * Get current playback progress (called by BreakpointEditor for cursor).
   * @returns {{ position: number, value: number } | null}
   */
  getProgress(nodeId) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx || ctx.stopped) return null;

    const elapsed = (performance.now() - ctx.startTime) / 1000;
    let normT = elapsed / ctx.duration;

    if (ctx.loop) {
      normT = normT % 1;
    } else {
      normT = Math.min(1, normT);
    }

    const value = interpolateEnvelope(
      normT,
      ctx.breakpoints,
      ctx.curves
    );

    return { position: normT, value };
  }

  stop(nodeId) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;

    ctx.stopped = true;
    if (ctx.interval != null) clearInterval(ctx.interval);
    this._contexts.delete(nodeId);
  }

  isRunning(nodeId) {
    return this._contexts.has(nodeId);
  }

  stopAll() {
    for (const nodeId of [...this._contexts.keys()]) {
      this.stop(nodeId);
    }
  }
}
