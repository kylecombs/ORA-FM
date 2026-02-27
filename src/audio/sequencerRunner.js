// ════════════════════════════════════════════════════════════
//  SEQUENCER RUNNER
//
//  Buchla Music Easel-inspired 5-step voltage sequencer.
//  Advances through steps on rising-edge trigger input,
//  outputting the voltage value of the current step.
//
//  Features:
//    - 5 voltage steps (continuously adjustable)
//    - Configurable sequence length (3, 4, or 5 steps)
//    - Rising-edge trigger detection (0→1 transition)
//    - Current step tracking for visual feedback
//
//  The sequencer is clocked externally — typically by a
//  Pulser module, but any control source works (envelope,
//  script, bang, MIDI, etc.).
// ════════════════════════════════════════════════════════════

export class SequencerRunner {
  /**
   * @param {(nodeId: number, value: number) => void} onOutput
   */
  constructor(onOutput) {
    this._onOutput = onOutput;
    this._contexts = new Map(); // nodeId → ctx
  }

  /**
   * Start tracking a sequencer node.
   * @param {number} nodeId
   * @param {number[]} steps - array of 5 voltage values
   * @param {number} length - active step count (3, 4, or 5)
   */
  start(nodeId, steps, length) {
    this.stop(nodeId);

    const ctx = {
      steps: steps.slice(0, 5),
      length: Math.max(3, Math.min(5, length || 5)),
      currentStep: 0,
      prevTrigger: 0,
      stopped: false,
    };

    this._contexts.set(nodeId, ctx);

    // Emit initial step value
    this._onOutput(nodeId, ctx.steps[0]);
  }

  /**
   * Update step values without resetting position.
   */
  setSteps(nodeId, steps) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;
    ctx.steps = steps.slice(0, 5);
    // Re-emit current step value in case it changed
    this._onOutput(nodeId, ctx.steps[ctx.currentStep]);
  }

  /**
   * Update sequence length without resetting position.
   */
  setLength(nodeId, length) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;
    ctx.length = Math.max(3, Math.min(5, length || 5));
    // If current step is beyond new length, wrap
    if (ctx.currentStep >= ctx.length) {
      ctx.currentStep = 0;
      this._onOutput(nodeId, ctx.steps[0]);
    }
  }

  /**
   * Feed a trigger value to the sequencer. Advances on rising edge (0→1).
   * Call this whenever the connected trigger source value changes.
   * @param {number} nodeId
   * @param {number} trigValue - current trigger value (0 or 1)
   */
  updateTrigger(nodeId, trigValue) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx || ctx.stopped) return;

    const wasLow = ctx.prevTrigger < 0.5;
    const isHigh = trigValue >= 0.5;
    ctx.prevTrigger = trigValue;

    // Rising edge: advance to next step
    if (wasLow && isHigh) {
      ctx.currentStep = (ctx.currentStep + 1) % ctx.length;
      this._onOutput(nodeId, ctx.steps[ctx.currentStep]);
    }
  }

  /**
   * Reset the sequencer to step 0.
   */
  reset(nodeId) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;
    ctx.currentStep = 0;
    ctx.prevTrigger = 0;
    this._onOutput(nodeId, ctx.steps[0]);
  }

  /**
   * Get the current step index (for visual feedback).
   * @returns {number} 0-based step index, or -1 if not running
   */
  getCurrentStep(nodeId) {
    const ctx = this._contexts.get(nodeId);
    return ctx ? ctx.currentStep : -1;
  }

  /**
   * Stop tracking a sequencer node.
   */
  stop(nodeId) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;
    ctx.stopped = true;
    this._contexts.delete(nodeId);
  }

  /**
   * Check if a sequencer is currently running.
   */
  isRunning(nodeId) {
    return this._contexts.has(nodeId);
  }

  /**
   * Stop all running sequencers.
   */
  stopAll() {
    for (const nodeId of [...this._contexts.keys()]) {
      this.stop(nodeId);
    }
  }
}
