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
//    tuplet(divisions, duration)  — nested tuplet pattern (loops)
//    w(weight, content)           — weighted subdivision for tuplet()
//    random(min, max)             — random float
//    randomInt(min, max)          — random integer
//    log(…args)                   — print to console
//    note('C#3')                  — parse note name → MIDI number
//    C4, Cs4, Db4, …              — bare MIDI note constants (C0–G9)
//    r                            — rest (skip a subdivision)
//    _                            — tie (extend previous note)
//    Math                         — standard Math object
// ════════════════════════════════════════════════════════════

// Sentinel symbols for rest and tie — exposed as bare identifiers r and _
const REST = Symbol('rest');
const TIE  = Symbol('tie');

// ── MIDI note name constants ─────────────────────────────
// Generated once at module load. Provides bare identifiers like C4 (60),
// Cs4 (61), Db4 (61), etc. Injected into user code as const declarations.
// Convention: C4 = 60 (middle C), so MIDI = (octave + 1) * 12 + semitone.
const _SHARP_NAMES = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
const _FLAT_NAMES  = [null,'Db',null,'Eb',null,null,'Gb',null,'Ab',null,'Bb',null];
const _NOTE_CONSTS = (() => {
  const parts = [];
  for (let oct = 0; oct <= 9; oct++) {
    for (let semi = 0; semi < 12; semi++) {
      const midi = (oct + 1) * 12 + semi;
      if (midi > 127) break;
      parts.push(`${_SHARP_NAMES[semi]}${oct}=${midi}`);
      if (_FLAT_NAMES[semi]) parts.push(`${_FLAT_NAMES[semi]}${oct}=${midi}`);
    }
  }
  return 'const ' + parts.join(',') + ';';
})();

// Lookup table for note() function — maps semitone name → offset
const _SEMI_MAP = {
  'C':0,'B#':0,'Cs':1,'C#':1,'Db':1,
  'D':2,'Ds':3,'D#':3,'Eb':3,
  'E':4,'Fb':4,'Es':5,'E#':5,'F':5,
  'Fs':6,'F#':6,'Gb':6,
  'G':7,'Gs':8,'G#':8,'Ab':8,
  'A':9,'As':10,'A#':10,'Bb':10,
  'B':11,'Cb':11,
};

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

    // note('C#3') → 49  — parse a string note name to MIDI number
    function note(name) {
      if (typeof name === 'number') return name;
      const str = String(name).trim();
      const m = str.match(/^([A-Ga-g][#sb]?)(-?\d+)$/);
      if (!m) { log('note: invalid name "' + str + '"'); return 0; }
      let notePart = m[1].charAt(0).toUpperCase() + m[1].slice(1);
      const oct = parseInt(m[2], 10);
      const semi = _SEMI_MAP[notePart];
      if (semi === undefined) { log('note: unknown note "' + notePart + '"'); return 0; }
      const midi = (oct + 1) * 12 + semi;
      return Math.max(0, Math.min(127, midi));
    }

    // ── Nested tuplet helpers ───────────────────────────
    // w(weight, content) — tag a subdivision with a relative weight
    function w(weight, content) {
      return { _tw: Math.max(0.001, +weight || 1), _tc: content };
    }

    // Internal: recursively flatten a nested tuplet tree into timed events
    function _flattenTuplet(divisions, offset, size, events) {
      // Calculate total weight of all subdivisions
      let totalWeight = 0;
      for (let j = 0; j < divisions.length; j++) {
        const el = divisions[j];
        if (el && typeof el === 'object' && !Array.isArray(el) && el._tw !== undefined) {
          totalWeight += el._tw;
        } else {
          totalWeight += 1;
        }
      }

      let runningOffset = offset;
      for (let j = 0; j < divisions.length; j++) {
        let el = divisions[j];
        let weight = 1;

        // Unwrap weighted element
        if (el && typeof el === 'object' && !Array.isArray(el) && el._tw !== undefined) {
          weight = el._tw;
          el = el._tc;
        }

        const elSize = (weight / totalWeight) * size;

        if (Array.isArray(el)) {
          // Nested tuplet — recurse
          _flattenTuplet(el, runningOffset, elSize, events);
        } else if (el === null || el === undefined || el === REST || el === '_' || el === TIE) {
          // Rest (r/null) or tie (_/'_') — no event emitted
        } else if (typeof el === 'number') {
          events.push({ time: runningOffset, value: el });
        }

        runningOffset += elSize;
      }
    }

    function tuplet(divisions, duration) {
      if (ctx.stopped) return;
      if (!Array.isArray(divisions) || divisions.length === 0) {
        log('tuplet: divisions must be a non-empty array');
        return;
      }
      const dur = Math.max(0.01, duration || 1);

      // Flatten the nested structure into timed events (normalized 0–1)
      const events = [];
      _flattenTuplet(divisions, 0, 1, events);
      events.sort((a, b) => a.time - b.time);

      if (events.length === 0) {
        log('tuplet: no events generated (all rests?)');
        return;
      }

      // Pre-compute inter-event delays (including wrap-around for looping)
      const delays = [];
      for (let j = 0; j < events.length; j++) {
        const next = (j + 1) % events.length;
        let dt;
        if (next === 0) {
          // Wrap: time from last event to end of cycle + time from start to first event
          dt = (1 - events[j].time) + events[0].time;
        } else {
          dt = events[next].time - events[j].time;
        }
        delays.push(Math.max(0.01, dt * dur)); // seconds, min 10ms
      }

      // Emit first event immediately
      let i = 0;
      out(events[0].value);

      function step() {
        if (ctx.stopped) return;
        const ms = delays[i] * 1000;
        const id = setTimeout(() => {
          if (ctx.stopped) return;
          i = (i + 1) % events.length;
          out(events[i].value);
          step();
        }, ms);
        addTimer(id, 'timeout');
      }
      step();
    }

    // ── Evaluate the script ─────────────────────────────
    // Wrap in a Function to restrict scope. The function receives
    // named API bindings and runs the user code.
    const apiNames = [
      'setOutputs', 'out', 'log', 'pattern', 'routine', 'lfo', 'ramp',
      'random', 'randomInt', 'tuplet', 'w', 'r', '_', 'Math', 'note',
    ];
    const apiValues = [
      setOutputs, out, log, pattern, routine, lfo, ramp,
      random, randomInt, tuplet, w, REST, TIE, Math, note,
    ];

    try {
      // Use 'use strict' to prevent accidental globals.
      // Wrap in an async function to allow top-level await if needed.
      const fn = new Function(...apiNames, `'use strict';\n${_NOTE_CONSTS}\n${code}`);
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
