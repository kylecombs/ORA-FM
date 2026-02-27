// ════════════════════════════════════════════════════════════
//  PULSER RUNNER
//
//  Buchla Music Easel-inspired clock/trigger generator.
//  Outputs periodic 0→1 pulses at a configurable rate.
//  The pulse output drives sequencers, envelope triggers,
//  and any other parameter via the control bus system.
//
//  Modes:
//    'free'     — continuous periodic pulsing (default)
//    'one-shot' — single pulse per trigger, then stops
//
//  Output: alternating 0/1 values at the specified rate (Hz).
//  A pulse consists of a 1 value followed by a 0 value,
//  each lasting half the period.
// ════════════════════════════════════════════════════════════

export class PulserRunner {
  /**
   * @param {(nodeId: number, value: number) => void} onOutput
   */
  constructor(onOutput) {
    this._onOutput = onOutput;
    this._contexts = new Map(); // nodeId → ctx
  }

  /**
   * Start the pulser for a given node.
   * @param {number} nodeId
   * @param {number} rate - pulses per second (Hz)
   */
  start(nodeId, rate) {
    this.stop(nodeId);

    const hz = Math.max(0.01, rate || 1);
    const halfPeriodMs = Math.max(10, 500 / hz);

    const ctx = {
      rate: hz,
      phase: 0,       // 0 or 1
      interval: null,
      stopped: false,
    };

    // Emit initial low value
    this._onOutput(nodeId, 0);

    ctx.interval = setInterval(() => {
      if (ctx.stopped) return;
      ctx.phase = 1 - ctx.phase;
      this._onOutput(nodeId, ctx.phase);
    }, halfPeriodMs);

    this._contexts.set(nodeId, ctx);
  }

  /**
   * Update the pulse rate without restarting phase.
   */
  setRate(nodeId, rate) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;

    const hz = Math.max(0.01, rate || 1);
    if (Math.abs(ctx.rate - hz) < 0.001) return; // no change

    // Restart with new rate (preserves running state)
    this.start(nodeId, hz);
  }

  /**
   * Stop the pulser for a given node.
   */
  stop(nodeId) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;

    ctx.stopped = true;
    if (ctx.interval != null) clearInterval(ctx.interval);
    this._contexts.delete(nodeId);
  }

  /**
   * Check if a pulser is currently running.
   */
  isRunning(nodeId) {
    return this._contexts.has(nodeId);
  }

  /**
   * Get the current phase (0 or 1) for visual feedback.
   */
  getPhase(nodeId) {
    const ctx = this._contexts.get(nodeId);
    return ctx ? ctx.phase : 0;
  }

  /**
   * Stop all running pulsers.
   */
  stopAll() {
    for (const nodeId of [...this._contexts.keys()]) {
      this.stop(nodeId);
    }
  }
}
