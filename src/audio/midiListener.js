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
// ════════════════════════════════════════════════════════════

let _midiAccess = null;
let _midiAccessPromise = null;
const _listeners = new Set();
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
  if (!data || data.length < 2) return;

  const status = data[0];
  const channel = (status & 0x0F) + 1; // MIDI channels are 1-based in UI
  const msgType = status & 0xF0;
  const inputId = event.target?.id;

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
