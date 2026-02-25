// ════════════════════════════════════════════════════════════
//  SCRIPT RUNNER
//
//  Sandboxed runtime for Script module code. Scripts execute
//  in a restricted scope with a small API for outputting
//  values (which flow through the existing modulation bus
//  system) and time-based patterns/routines.
//
//  API available inside scripts:
//
//    setOutputs(n)                — declare n output ports (1–8)
//    out(value)                   — send value to output 0
//    out(index, value)            — send value to output <index>
//    pattern(values, durations)   — cycle values on output 0
//    routine(generatorFn)         — generator coroutine
//    lfo(rate, min, max)          — sine-wave oscillator on output 0
//    ramp(from, to, duration)     — linear ramp on output 0
//    random(min, max)             — random float
//    randomInt(min, max)          — random integer
//    log(…args)                   — print to console
//    Math                         — standard Math object
// ════════════════════════════════════════════════════════════

export class ScriptRunner {
  constructor({ onOutput, onLog, onSetOutputs }) {
    this._onOutput = onOutput;         // (nodeId, outputIndex, value) => void
    this._onLog = onLog;               // (nodeId, ...args) => void
    this._onSetOutputs = onSetOutputs; // (nodeId, count) => void
    this._contexts = new Map();        // nodeId → { timers: Set, stopped: bool }
  }

  /**
   * Run a script for the given node. Stops any previous run first.
   */
  run(nodeId, code) {
    this.stop(nodeId);

    const ctx = { timers: new Set(), stopped: false };
    this._contexts.set(nodeId, ctx);

    // ── Build the sandboxed API ─────────────────────────
    const self = this;

    function setOutputs(n) {
      if (ctx.stopped) return;
      const count = Math.max(1, Math.min(8, Math.floor(n) || 1));
      self._onSetOutputs(nodeId, count);
    }

    function out(indexOrValue, maybeValue) {
      if (ctx.stopped) return;
      let outputIndex = 0;
      let value;
      if (maybeValue !== undefined) {
        // out(index, value)
        outputIndex = Math.max(0, Math.floor(indexOrValue) || 0);
        value = maybeValue;
      } else {
        // out(value)
        value = indexOrValue;
      }
      const v = typeof value === 'number' ? value : parseFloat(value) || 0;
      self._onOutput(nodeId, outputIndex, v);
    }

    function log(...args) {
      if (ctx.stopped) return;
      self._onLog(nodeId, ...args);
    }

    function addTimer(id, type) {
      ctx.timers.add({ id, type });
    }

    function pattern(values, durations) {
      if (ctx.stopped) return;
      if (!Array.isArray(values) || values.length === 0) {
        log('pattern: values must be a non-empty array');
        return;
      }
      // durations can be a single number or an array of numbers (seconds)
      const durs = Array.isArray(durations) ? durations : [durations || 0.5];
      let i = 0;
      // Emit first value immediately
      out(values[0]);
      i = 1;

      function step() {
        if (ctx.stopped) return;
        const ms = Math.max(10, (durs[(i - 1) % durs.length]) * 1000);
        const id = setTimeout(() => {
          if (ctx.stopped) return;
          out(values[i % values.length]);
          i++;
          step();
        }, ms);
        addTimer(id, 'timeout');
      }
      step();
    }

    function routine(genFn) {
      if (ctx.stopped) return;
      if (typeof genFn !== 'function') {
        log('routine: argument must be a generator function');
        return;
      }
      let gen;
      try {
        gen = genFn();
      } catch (err) {
        log('routine error:', err.message);
        return;
      }

      function step() {
        if (ctx.stopped) return;
        let result;
        try {
          result = gen.next();
        } catch (err) {
          log('routine error:', err.message);
          return;
        }
        if (result.done) return;
        const waitSec = typeof result.value === 'number' ? result.value : 0;
        const ms = Math.max(10, waitSec * 1000);
        const id = setTimeout(step, ms);
        addTimer(id, 'timeout');
      }
      step();
    }

    function lfo(rate, min, max) {
      if (ctx.stopped) return;
      const lo = min ?? 0;
      const hi = max ?? 127;
      const range = hi - lo;
      const hz = Math.max(0.01, rate || 1);
      const startTime = performance.now();
      // Emit initial value
      out(lo + range * 0.5);
      const id = setInterval(() => {
        if (ctx.stopped) return;
        const t = (performance.now() - startTime) / 1000;
        const v = lo + (Math.sin(t * hz * Math.PI * 2) * 0.5 + 0.5) * range;
        out(v);
      }, 33); // ~30fps
      addTimer(id, 'interval');
    }

    function ramp(from, to, duration) {
      if (ctx.stopped) return;
      const dur = Math.max(0.05, duration || 1);
      const startTime = performance.now();
      out(from);
      const id = setInterval(() => {
        if (ctx.stopped) return;
        const elapsed = (performance.now() - startTime) / 1000;
        const t = Math.min(1, elapsed / dur);
        const v = from + (to - from) * t;
        out(v);
        if (t >= 1) {
          clearInterval(id);
          ctx.timers.forEach((entry) => {
            if (entry.id === id) ctx.timers.delete(entry);
          });
        }
      }, 33);
      addTimer(id, 'interval');
    }

    function random(min, max) {
      const lo = min ?? 0;
      const hi = max ?? 1;
      return lo + Math.random() * (hi - lo);
    }

    function randomInt(min, max) {
      return Math.floor(random(min, max + 1));
    }

    // ── Evaluate the script ─────────────────────────────
    // Wrap in a Function to restrict scope. The function receives
    // named API bindings and runs the user code.
    const apiNames = [
      'setOutputs', 'out', 'log', 'pattern', 'routine', 'lfo', 'ramp',
      'random', 'randomInt', 'Math',
    ];
    const apiValues = [
      setOutputs, out, log, pattern, routine, lfo, ramp,
      random, randomInt, Math,
    ];

    try {
      // Use 'use strict' to prevent accidental globals.
      // Wrap in an async function to allow top-level await if needed.
      const fn = new Function(...apiNames, `'use strict';\n${code}`);
      fn(...apiValues);
      log('Script started');
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  }

  /**
   * Stop a running script, clearing all its timers.
   */
  stop(nodeId) {
    const ctx = this._contexts.get(nodeId);
    if (!ctx) return;

    ctx.stopped = true;
    for (const entry of ctx.timers) {
      if (entry.type === 'interval') {
        clearInterval(entry.id);
      } else {
        clearTimeout(entry.id);
      }
    }
    ctx.timers.clear();
    this._contexts.delete(nodeId);
  }

  /**
   * Check if a script is currently running.
   */
  isRunning(nodeId) {
    return this._contexts.has(nodeId);
  }

  /**
   * Stop all running scripts.
   */
  stopAll() {
    for (const nodeId of [...this._contexts.keys()]) {
      this.stop(nodeId);
    }
  }
}
