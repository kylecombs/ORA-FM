// ════════════════════════════════════════════════════════════
//  MIDI LISTENER
//
//  Wraps the Web MIDI API for use by MIDI input modules.
//  Each listener instance monitors a specific device, channel,
//  and message type (CC or Note), emitting values via callback.
//
//  Modes:
//    'cc'   — Outputs CC value (0–127) for a specific controller number
//    'note' — Outputs note-on velocity (0 = note-off) for any key,
//             plus the note number on a separate callback
//
//  Also provides MidiClockIn / MidiClockOut for MIDI clock sync.
//    MIDI clock: 24 ppqn (pulses per quarter note)
//    System Realtime: 0xF8 = tick, 0xFA = start, 0xFB = continue, 0xFC = stop
// ════════════════════════════════════════════════════════════

let _midiAccess = null;
let _midiAccessPromise = null;
const _listeners = new Set();
const _clockListeners = new Set();
const _deviceChangeCallbacks = new Set();

// Request MIDI access once, shared across all listeners
async function ensureMidiAccess() {
  if (_midiAccess) return _midiAccess;
  if (_midiAccessPromise) return _midiAccessPromise;

  if (!navigator.requestMIDIAccess) {
    throw new Error('Web MIDI API not supported in this browser');
  }

  _midiAccessPromise = navigator.requestMIDIAccess({ sysex: false })
    .then((access) => {
      _midiAccess = access;
      _midiAccessPromise = null;

      // Listen for device connect/disconnect
      access.onstatechange = () => {
        for (const cb of _deviceChangeCallbacks) {
          try { cb(getInputDevices()); } catch { /* ignore */ }
        }
      };

      return access;
    });

  return _midiAccessPromise;
}

// Get list of available MIDI input devices
export function getInputDevices() {
  if (!_midiAccess) return [];
  const devices = [];
  for (const input of _midiAccess.inputs.values()) {
    devices.push({
      id: input.id,
      name: input.name || `MIDI Input ${input.id}`,
      manufacturer: input.manufacturer || '',
    });
  }
  return devices;
}

// Subscribe to device list changes (connect/disconnect)
export function onDeviceChange(callback) {
  _deviceChangeCallbacks.add(callback);
  return () => _deviceChangeCallbacks.delete(callback);
}

// Parse a raw MIDI message and route to active listeners
function handleMidiMessage(event) {
  const data = event.data;
  if (!data || data.length < 1) return;

  const status = data[0];
  const inputId = event.target?.id;

  // ── System Realtime messages (single byte, no channel) ──
  if (status >= 0xF8) {
    for (const cl of _clockListeners) {
      if (cl.deviceId && cl.deviceId !== inputId) continue;
      if (status === 0xF8) cl._onTick();
      else if (status === 0xFA) cl._onStart();
      else if (status === 0xFB) cl._onContinue();
      else if (status === 0xFC) cl._onStop();
    }
    return;
  }

  if (data.length < 2) return;

  const channel = (status & 0x0F) + 1; // MIDI channels are 1-based in UI
  const msgType = status & 0xF0;

  for (const listener of _listeners) {
    // Filter by device (if set)
    if (listener.deviceId && listener.deviceId !== inputId) continue;
    // Filter by channel (0 = omni / all channels)
    if (listener.channel !== 0 && listener.channel !== channel) continue;

    if (listener.mode === 'cc' && msgType === 0xB0) {
      // Control Change: data[1] = CC number, data[2] = value
      const ccNum = data[1];
      const ccVal = data[2];
      if (listener.ccNumber === ccNum) {
        listener.onValue(ccVal);
      }
    } else if (listener.mode === 'note') {
      if (msgType === 0x90) {
        // Note On: data[1] = note, data[2] = velocity
        const note = data[1];
        const velocity = data[2];
        if (velocity > 0) {
          listener.onNote(note, velocity);
        } else {
          // Velocity 0 = note off
          listener.onNote(note, 0);
        }
      } else if (msgType === 0x80) {
        // Note Off: data[1] = note, data[2] = release velocity
        const note = data[1];
        listener.onNote(note, 0);
      }
    }
  }
}

// Bind message handlers to all MIDI inputs
function bindInputs() {
  if (!_midiAccess) return;
  for (const input of _midiAccess.inputs.values()) {
    input.onmidimessage = handleMidiMessage;
  }
}

export class MidiListener {
  constructor({ mode = 'cc', channel = 0, ccNumber = 1, deviceId = null, onValue, onNote }) {
    this.mode = mode;
    this.channel = channel;       // 0 = omni, 1-16 = specific channel
    this.ccNumber = ccNumber;     // 0-127, only used in CC mode
    this.deviceId = deviceId;     // null = any device
    this.onValue = onValue || (() => {});
    this.onNote = onNote || (() => {});
    this._active = false;
  }

  async start() {
    if (this._active) return;
    await ensureMidiAccess();
    _listeners.add(this);
    bindInputs();
    this._active = true;
  }

  stop() {
    _listeners.delete(this);
    this._active = false;
  }

  // Update configuration without stop/start
  setMode(mode) { this.mode = mode; }
  setChannel(channel) { this.channel = channel; }
  setCcNumber(ccNumber) { this.ccNumber = ccNumber; }
  setDeviceId(deviceId) { this.deviceId = deviceId; }

  get isActive() { return this._active; }
}

// Initialize MIDI access eagerly (non-blocking)
export async function initMidi() {
  try {
    await ensureMidiAccess();
    bindInputs();
    return true;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════
//  MIDI OUTPUT DEVICES
// ════════════════════════════════════════════════════════════
export function getOutputDevices() {
  if (!_midiAccess) return [];
  const devices = [];
  for (const output of _midiAccess.outputs.values()) {
    devices.push({
      id: output.id,
      name: output.name || `MIDI Output ${output.id}`,
      manufacturer: output.manufacturer || '',
    });
  }
  return devices;
}

// ════════════════════════════════════════════════════════════
//  MIDI CLOCK IN
//
//  Listens for MIDI clock messages (24 ppqn) from an external
//  device and derives BPM. Fires onTick every clock pulse and
//  onBeat every quarter note (every 24 ticks).
// ════════════════════════════════════════════════════════════
const MIDI_CLOCK_PPQN = 24;

export class MidiClockIn {
  constructor({ deviceId = null, onTick, onBeat, onBpmChange, onTransport } = {}) {
    this.deviceId = deviceId;
    this.onTick = onTick || (() => {});
    this.onBeat = onBeat || (() => {});
    this.onBpmChange = onBpmChange || (() => {});
    this.onTransport = onTransport || (() => {}); // 'start' | 'continue' | 'stop'
    this._active = false;
    this._tickCount = 0;
    this._lastTickTime = 0;
    this._bpm = 0;
    // Rolling average over last 24 ticks (1 beat) for stable BPM
    this._tickIntervals = [];
  }

  _onTick() {
    const now = performance.now();
    if (this._lastTickTime > 0) {
      const interval = now - this._lastTickTime;
      this._tickIntervals.push(interval);
      // Keep last 24 intervals (one beat's worth)
      if (this._tickIntervals.length > MIDI_CLOCK_PPQN) {
        this._tickIntervals.shift();
      }
      // Derive BPM from average tick interval
      if (this._tickIntervals.length >= 6) {
        const avg = this._tickIntervals.reduce((a, b) => a + b, 0) / this._tickIntervals.length;
        const newBpm = Math.round(60000 / (avg * MIDI_CLOCK_PPQN));
        if (newBpm !== this._bpm && newBpm > 0 && newBpm < 999) {
          this._bpm = newBpm;
          this.onBpmChange(newBpm);
        }
      }
    }
    this._lastTickTime = now;
    this._tickCount++;
    this.onTick(this._tickCount);

    // Fire beat callback every quarter note
    if (this._tickCount % MIDI_CLOCK_PPQN === 0) {
      this.onBeat(this._tickCount / MIDI_CLOCK_PPQN);
    }
  }

  _onStart() {
    this._tickCount = 0;
    this._tickIntervals = [];
    this._lastTickTime = 0;
    this.onTransport('start');
  }

  _onContinue() {
    this.onTransport('continue');
  }

  _onStop() {
    this.onTransport('stop');
  }

  async start() {
    if (this._active) return;
    await ensureMidiAccess();
    _clockListeners.add(this);
    bindInputs();
    this._active = true;
  }

  stop() {
    _clockListeners.delete(this);
    this._active = false;
    this._tickCount = 0;
    this._tickIntervals = [];
    this._lastTickTime = 0;
    this._bpm = 0;
  }

  setDeviceId(deviceId) { this.deviceId = deviceId; }
  get isActive() { return this._active; }
  get bpm() { return this._bpm; }
}

// ════════════════════════════════════════════════════════════
//  MIDI CLOCK OUT
//
//  Sends MIDI clock messages (24 ppqn) to an output device
//  at a given BPM. Also sends Start/Stop transport messages.
// ════════════════════════════════════════════════════════════
export class MidiClockOut {
  constructor({ deviceId = null, bpm = 120 } = {}) {
    this.deviceId = deviceId;
    this._bpm = bpm;
    this._running = false;
    this._timerId = null;
    this._output = null;
    this._tickCount = 0;
    this.onTick = null;  // optional callback for UI beat flash
    this.onBeat = null;
  }

  async start() {
    if (this._running) return;
    await ensureMidiAccess();
    this._resolveOutput();
    if (!this._output) return;

    this._running = true;
    this._tickCount = 0;
    // Send MIDI Start
    this._output.send([0xFA]);
    this._startTimer();
  }

  stop() {
    this._running = false;
    if (this._timerId != null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    // Send MIDI Stop
    if (this._output) {
      try { this._output.send([0xFC]); } catch { /* ignore */ }
    }
    this._tickCount = 0;
  }

  setBpm(bpm) {
    this._bpm = bpm;
    if (this._running) {
      // Restart timer at new rate
      if (this._timerId != null) clearInterval(this._timerId);
      this._startTimer();
    }
  }

  setDeviceId(deviceId) {
    this.deviceId = deviceId;
    this._resolveOutput();
  }

  _resolveOutput() {
    if (!_midiAccess) { this._output = null; return; }
    if (!this.deviceId) {
      // Use first available output
      const first = _midiAccess.outputs.values().next().value;
      this._output = first || null;
    } else {
      this._output = _midiAccess.outputs.get(this.deviceId) || null;
    }
  }

  _startTimer() {
    // Interval between clock ticks: (60000 / bpm) / 24 ms
    const intervalMs = 60000 / (this._bpm * MIDI_CLOCK_PPQN);
    this._timerId = setInterval(() => {
      if (!this._running || !this._output) return;
      this._output.send([0xF8]);
      this._tickCount++;
      this.onTick?.(this._tickCount);
      if (this._tickCount % MIDI_CLOCK_PPQN === 0) {
        this.onBeat?.(this._tickCount / MIDI_CLOCK_PPQN);
      }
    }, intervalMs);
  }

  get isRunning() { return this._running; }
  get bpm() { return this._bpm; }
}
