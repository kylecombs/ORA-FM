import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GridEngine } from './audio/gridEngine';
import { ScriptRunner } from './audio/scriptRunner';
import { EnvelopeRunner } from './audio/envelopeRunner';
import { MidiListener, getInputDevices, onDeviceChange, initMidi } from './audio/midiListener';
import BreakpointEditor from './BreakpointEditor';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import './GridView.css';

// ── CodeMirror theme matching the app's dark palette ─────
const oraTheme = createTheme({
  theme: 'dark',
  settings: {
    background: '#0c0b0a',
    foreground: '#d4cfc8',
    caret: '#c8b060',
    selection: 'rgba(200, 176, 96, 0.15)',
    selectionMatch: 'rgba(200, 176, 96, 0.08)',
    lineHighlight: 'rgba(184, 154, 106, 0.04)',
    gutterBackground: '#0c0b0a',
    gutterForeground: '#3a3835',
    gutterBorder: '#252320',
  },
  styles: [
    { tag: t.comment,        color: '#4a4740' },
    { tag: t.lineComment,    color: '#4a4740' },
    { tag: t.blockComment,   color: '#4a4740' },
    { tag: t.keyword,        color: '#c8b060' },
    { tag: t.controlKeyword, color: '#c8b060' },
    { tag: t.operator,       color: '#7a7570' },
    { tag: t.number,         color: '#8ab0c8' },
    { tag: t.string,         color: '#7aab88' },
    { tag: t.variableName,   color: '#d4cfc8' },
    { tag: t.function(t.variableName), color: '#c08880' },
    { tag: t.definition(t.variableName), color: '#d4cfc8' },
    { tag: t.propertyName,   color: '#c08880' },
    { tag: t.bool,           color: '#8ab0c8' },
    { tag: t.null,           color: '#8ab0c8' },
    { tag: t.punctuation,    color: '#5a5550' },
    { tag: t.brace,          color: '#5a5550' },
    { tag: t.paren,          color: '#5a5550' },
  ],
});

// ── Frequency quantisation (12-TET, A4 = 440 Hz) ─────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function quantizeFreq(hz) {
  if (hz <= 0) return hz;
  const semitone = 12 * Math.log2(hz / 440);
  return 440 * Math.pow(2, Math.round(semitone) / 12);
}

function freqToNoteName(hz) {
  if (hz <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

// ── Node type definitions ─────────────────────────────────
const NODE_SCHEMA = {
  sine: {
    label: 'Sine',
    desc: 'pure tone',
    accent: '#b89a6a',
    synthDef: 'sonic-pi-beep',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,   step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.4 },
      attack:  { label: 'atk',  min: 0,  max: 5,    step: 0.1,  val: 0.1 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 10,   step: 0.1,  val: 1 },
    },
  },
  sine_osc: {
    label: 'Sine Osc',
    desc: 'modulatable sine',
    accent: '#b89a6a',
    synthDef: 'sine',
    inputs: [],
    outputs: ['out'],
    // Audio-rate modulation inputs (routed via audio buses)
    modInputs: ['freq', 'amp', 'phase'],
    params: {
      freq:  { label: 'freq',  min: 0.1, max: 20000, step: 0.1,  val: 440 },
      amp:   { label: 'amp',   min: 0,   max: 1,     step: 0.01, val: 0.5 },
      phase: { label: 'pha',   min: 0,   max: 6.283, step: 0.01, val: 0 },
    },
  },
  saw_osc: {
    label: 'Saw Osc',
    desc: 'modulatable saw',
    accent: '#b89a6a',
    synthDef: 'saw_osc',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp'],
    params: {
      freq: { label: 'freq', min: 0.1, max: 20000, step: 0.1,  val: 440 },
      amp:  { label: 'amp',  min: 0,   max: 1,     step: 0.01, val: 0.5 },
    },
  },
  pulse_osc: {
    label: 'Pulse Osc',
    desc: 'modulatable pulse',
    accent: '#b89a6a',
    synthDef: 'pulse_osc',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp', 'width'],
    params: {
      freq:  { label: 'freq',  min: 0.1, max: 20000, step: 0.1,  val: 440 },
      amp:   { label: 'amp',   min: 0,   max: 1,     step: 0.01, val: 0.5 },
      width: { label: 'width', min: 0,   max: 1,     step: 0.01, val: 0.5 },
    },
  },
  tri_osc: {
    label: 'Tri Osc',
    desc: 'modulatable triangle',
    accent: '#b89a6a',
    synthDef: 'tri_osc',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp'],
    params: {
      freq: { label: 'freq', min: 0.1, max: 20000, step: 0.1,  val: 440 },
      amp:  { label: 'amp',  min: 0,   max: 1,     step: 0.01, val: 0.5 },
    },
  },
  blip_osc: {
    label: 'Blip',
    desc: 'harmonic impulse',
    accent: '#b89a6a',
    synthDef: 'blip_osc',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp', 'numharm'],
    params: {
      freq:    { label: 'freq', min: 0.1, max: 20000, step: 0.1,  val: 440 },
      amp:     { label: 'amp',  min: 0,   max: 1,     step: 0.01, val: 0.5 },
      numharm: { label: 'harm', min: 1,   max: 200,   step: 1,    val: 20 },
    },
  },
  formant_osc: {
    label: 'Formant',
    desc: 'vocal formant',
    accent: '#8ab0c8',
    synthDef: 'formant_osc',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp', 'formfreq', 'bwfreq'],
    params: {
      freq:     { label: 'freq', min: 0.1, max: 20000, step: 0.1,  val: 440 },
      amp:      { label: 'amp',  min: 0,   max: 1,     step: 0.01, val: 0.5 },
      formfreq: { label: 'form', min: 0.1, max: 20000, step: 1,    val: 1760 },
      bwfreq:   { label: 'bw',   min: 0.1, max: 20000, step: 1,    val: 880 },
    },
  },
  dust_osc: {
    label: 'Dust',
    desc: 'random impulses',
    accent: '#c08880',
    synthDef: 'dust',
    inputs: [],
    outputs: ['out'],
    modInputs: ['density', 'amp'],
    params: {
      density: { label: 'dens', min: 0.1, max: 1000, step: 0.1, val: 1 },
      amp:     { label: 'amp',  min: 0,   max: 1,    step: 0.01, val: 0.5 },
    },
  },
  crackle_osc: {
    label: 'Crackle',
    desc: 'chaotic noise',
    accent: '#c08880',
    synthDef: 'crackle',
    inputs: [],
    outputs: ['out'],
    modInputs: ['chaos', 'amp'],
    params: {
      chaos: { label: 'chaos', min: 1, max: 2, step: 0.01, val: 1.5 },
      amp:   { label: 'amp',   min: 0, max: 1, step: 0.01, val: 0.5 },
    },
  },
  lfnoise0_osc: {
    label: 'LFNoise0',
    desc: 'stepped random',
    accent: '#7aab88',
    synthDef: 'lfnoise0',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp'],
    params: {
      freq: { label: 'rate', min: 0.01, max: 1000, step: 0.01, val: 4 },
      amp:  { label: 'amp',  min: 0,    max: 1,    step: 0.01, val: 0.5 },
    },
  },
  lfnoise1_osc: {
    label: 'LFNoise1',
    desc: 'linear random',
    accent: '#7aab88',
    synthDef: 'lfnoise1',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp'],
    params: {
      freq: { label: 'rate', min: 0.01, max: 1000, step: 0.01, val: 4 },
      amp:  { label: 'amp',  min: 0,    max: 1,    step: 0.01, val: 0.5 },
    },
  },
  lfnoise2_osc: {
    label: 'LFNoise2',
    desc: 'smooth random',
    accent: '#7aab88',
    synthDef: 'lfnoise2',
    inputs: [],
    outputs: ['out'],
    modInputs: ['freq', 'amp'],
    params: {
      freq: { label: 'rate', min: 0.01, max: 1000, step: 0.01, val: 4 },
      amp:  { label: 'amp',  min: 0,    max: 1,    step: 0.01, val: 0.5 },
    },
  },
  white_noise_osc: {
    label: 'White Noise',
    desc: 'white noise',
    accent: '#c08880',
    synthDef: 'white_noise',
    inputs: [],
    outputs: ['out'],
    modInputs: ['amp'],
    params: {
      amp: { label: 'amp', min: 0, max: 1, step: 0.01, val: 0.5 },
    },
  },
  pink_noise_osc: {
    label: 'Pink Noise',
    desc: 'pink 1/f',
    accent: '#c08880',
    synthDef: 'pink_noise',
    inputs: [],
    outputs: ['out'],
    modInputs: ['amp'],
    params: {
      amp: { label: 'amp', min: 0, max: 1, step: 0.01, val: 0.5 },
    },
  },
  saw: {
    label: 'Saw',
    desc: 'sawtooth',
    accent: '#b89a6a',
    synthDef: 'sonic-pi-saw',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,   step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.25 },
      attack:  { label: 'atk',  min: 0,  max: 5,    step: 0.1,  val: 0.1 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 10,   step: 0.1,  val: 1 },
      cutoff:  { label: 'cut',  min: 30, max: 130,  step: 1,    val: 80 },
    },
  },
  bell: {
    label: 'Bell',
    desc: 'pretty bell',
    accent: '#8ab0c8',
    synthDef: 'sonic-pi-pretty_bell',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,  step: 1,    val: 72 },
      amp:     { label: 'amp',  min: 0,  max: 1,   step: 0.01, val: 0.5 },
      attack:  { label: 'atk',  min: 0,  max: 2,   step: 0.01, val: 0.01 },
      sustain: { label: 'sus',  min: 0,  max: 9999,step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 10,  step: 0.1,  val: 2 },
    },
  },
  blade: {
    label: 'Blade',
    desc: 'vibrato synth',
    accent: '#8ab0c8',
    synthDef: 'sonic-pi-blade',
    inputs: [],
    outputs: ['out'],
    params: {
      note:           { label: 'note',  min: 24, max: 96,  step: 1,    val: 64 },
      amp:            { label: 'amp',   min: 0,  max: 1,   step: 0.01, val: 0.2 },
      attack:         { label: 'atk',   min: 0,  max: 5,   step: 0.1,  val: 1 },
      sustain:        { label: 'sus',   min: 0.1,max: 9999,step: 1,    val: 9999 },
      release:        { label: 'rel',   min: 0,  max: 10,  step: 0.1,  val: 2 },
      cutoff:         { label: 'cut',   min: 30, max: 130, step: 1,    val: 80 },
      vibrato_rate:   { label: 'vib',   min: 0,  max: 20,  step: 0.5,  val: 3 },
      vibrato_depth:  { label: 'depth', min: 0,  max: 1,   step: 0.01, val: 0.06 },
    },
  },
  pad: {
    label: 'Pad',
    desc: 'dark ambience',
    accent: '#7aab88',
    synthDef: 'sonic-pi-dark_ambience',
    inputs: [],
    outputs: ['out'],
    params: {
      note:        { label: 'note', min: 24, max: 96,   step: 1,    val: 57 },
      amp:         { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.3 },
      attack:      { label: 'atk',  min: 0,  max: 10,   step: 0.5,  val: 3 },
      sustain:     { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release:     { label: 'rel',  min: 0,  max: 20,   step: 0.5,  val: 5 },
      cutoff:      { label: 'cut',  min: 30, max: 130,  step: 1,    val: 72 },
      res:         { label: 'res',  min: 0,  max: 1,    step: 0.01, val: 0.05 },
      room:        { label: 'room', min: 0,  max: 1,    step: 0.01, val: 0.9 },
      reverb_damp: { label: 'damp', min: 0,  max: 1,    step: 0.01, val: 0.5 },
    },
  },
  hollow: {
    label: 'Hollow',
    desc: 'resonant texture',
    accent: '#7aab88',
    synthDef: 'sonic-pi-hollow',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,   step: 1,    val: 69 },
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.15 },
      attack:  { label: 'atk',  min: 0,  max: 10,   step: 0.5,  val: 2 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 20,   step: 0.5,  val: 5 },
      cutoff:  { label: 'cut',  min: 30, max: 130,  step: 1,    val: 80 },
      res:     { label: 'res',  min: 0,  max: 1,    step: 0.01, val: 0.1 },
    },
  },
  noise: {
    label: 'Noise',
    desc: 'brown 1/f²',
    accent: '#c08880',
    synthDef: 'sonic-pi-bnoise',
    inputs: [],
    outputs: ['out'],
    params: {
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.08 },
      attack:  { label: 'atk',  min: 0,  max: 5,    step: 0.5,  val: 1 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 20,   step: 0.5,  val: 5 },
      cutoff:  { label: 'cut',  min: 30, max: 130,  step: 1,    val: 95 },
      res:     { label: 'res',  min: 0,  max: 1,    step: 0.01, val: 0.05 },
    },
  },
  pluck: {
    label: 'Pluck',
    desc: 'string',
    accent: '#8ab0c8',
    synthDef: 'sonic-pi-pluck',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96, step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,  step: 0.01, val: 0.5 },
      sustain: { label: 'sus',  min: 0.1,max: 9999,step: 1,   val: 9999 },
      release: { label: 'rel',  min: 0,  max: 5,  step: 0.1,  val: 1 },
    },
  },
  // ── FX modules ─────────────────────────────────────────
  fx_reverb: {
    label: 'Reverb',
    desc: 'room reverb',
    accent: '#9b7abf',
    synthDef: 'sonic-pi-fx_reverb',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      mix:  { label: 'mix',  min: 0, max: 1, step: 0.01, val: 0.4 },
      room: { label: 'room', min: 0, max: 1, step: 0.01, val: 0.6 },
      damp: { label: 'damp', min: 0, max: 1, step: 0.01, val: 0.5 },
    },
  },
  fx_echo: {
    label: 'Echo',
    desc: 'delay + feedback',
    accent: '#9b7abf',
    synthDef: 'sonic-pi-fx_echo',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      mix:   { label: 'mix',   min: 0,    max: 1, step: 0.01, val: 1 },
      phase: { label: 'time',  min: 0.01, max: 2, step: 0.01, val: 0.25 },
      decay: { label: 'decay', min: 0,    max: 8, step: 0.1,  val: 2 },
    },
  },
  fx_lpf: {
    label: 'LPF',
    desc: 'low-pass filter',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_lpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1, val: 80 },
    },
  },
  fx_hpf: {
    label: 'HPF',
    desc: 'high-pass filter',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_hpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1, val: 30 },
    },
  },
  fx_bpf: {
    label: 'BPF',
    desc: 'band-pass filter',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_bpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      centre: { label: 'freq', min: 0, max: 130, step: 1, val: 60 },
      res:    { label: 'res',  min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_rlpf: {
    label: 'RLPF',
    desc: 'resonant low-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_rlpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1,    val: 80 },
      res:    { label: 'res', min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_rhpf: {
    label: 'RHPF',
    desc: 'resonant high-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_rhpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1,    val: 30 },
      res:    { label: 'res', min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_rbpf: {
    label: 'RBPF',
    desc: 'resonant band-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_rbpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      centre: { label: 'freq', min: 0, max: 130, step: 1,    val: 60 },
      res:    { label: 'res',  min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_nlpf: {
    label: 'NLPF',
    desc: 'normalized low-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_nlpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1, val: 80 },
    },
  },
  fx_nhpf: {
    label: 'NHPF',
    desc: 'normalized high-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_nhpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1, val: 30 },
    },
  },
  fx_nbpf: {
    label: 'NBPF',
    desc: 'normalized band-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_nbpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      centre: { label: 'freq', min: 0, max: 130, step: 1,    val: 60 },
      res:    { label: 'res',  min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_nrlpf: {
    label: 'NRLPF',
    desc: 'normalized resonant low-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_nrlpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1,    val: 80 },
      res:    { label: 'res', min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_nrhpf: {
    label: 'NRHPF',
    desc: 'normalized resonant high-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_nrhpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1,    val: 30 },
      res:    { label: 'res', min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_nrbpf: {
    label: 'NRBPF',
    desc: 'normalized resonant band-pass',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_nrbpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      centre: { label: 'freq', min: 0, max: 130, step: 1,    val: 60 },
      res:    { label: 'res',  min: 0, max: 1,   step: 0.01, val: 0.3 },
    },
  },
  fx_moog: {
    label: 'Moog',
    desc: 'moog ladder filter',
    accent: '#bf9b7a',
    synthDef: 'moog',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 20, max: 20000, step: 1,    val: 1000 },
      res:    { label: 'res', min: 0,  max: 4,     step: 0.01, val: 1 },
      mix:    { label: 'mix', min: 0,  max: 1,     step: 0.01, val: 1 },
    },
  },
  fx_moogff: {
    label: 'MoogFF',
    desc: 'moog ladder + gain',
    accent: '#bf9b7a',
    synthDef: 'moogff',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut',  min: 20, max: 20000, step: 1,    val: 1000 },
      res:    { label: 'res',  min: 0,  max: 4,     step: 0.01, val: 2 },
      gain:   { label: 'gain', min: 0,  max: 10,    step: 0.1,  val: 1 },
      mix:    { label: 'mix',  min: 0,  max: 1,     step: 0.01, val: 1 },
    },
  },
  fx_distortion: {
    label: 'Distort',
    desc: 'distortion',
    accent: '#bf7a7a',
    synthDef: 'sonic-pi-fx_distortion',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      distort: { label: 'dist', min: 0, max: 1,  step: 0.01, val: 0.5 },
      mix:     { label: 'mix',  min: 0, max: 1,  step: 0.01, val: 1 },
    },
  },
  fx_flanger: {
    label: 'Flanger',
    desc: 'flanger',
    accent: '#7abfbf',
    synthDef: 'sonic-pi-fx_flanger',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      phase:    { label: 'phase', min: 0,    max: 10, step: 0.1,  val: 4 },
      depth:    { label: 'depth', min: 0,    max: 5,  step: 0.1,  val: 5 },
      feedback: { label: 'fb',    min: 0,    max: 1,  step: 0.01, val: 0 },
      mix:      { label: 'mix',   min: 0,    max: 1,  step: 0.01, val: 1 },
    },
  },
  // ── Utility modules ─────────────────────────────────────
  multiply: {
    label: 'Multiply',
    desc: 'signal gain',
    accent: '#a0a0a0',
    synthDef: 'multiply',
    category: 'fx',  // Uses FX routing (in_bus → out_bus)
    inputs: ['in'],
    outputs: ['out'],
    params: {
      gain: { label: 'gain', min: 0, max: 5000, step: 1, val: 100 },
    },
  },
  print: {
    label: 'Print',
    desc: 'debug logger',
    accent: '#e07050',
    synthDef: 'print',
    category: 'fx',  // Uses FX routing (reads from in_bus)
    inputs: ['in'],
    outputs: [],
    params: {},
  },
  scope: {
    label: 'Scope',
    desc: 'oscilloscope',
    accent: '#6ab0b0',
    synthDef: 'ora_scope', // Buffer-based scope (BufWr+Phasor at audio rate)
    category: 'fx',        // Uses FX routing (reads from in_bus)
    width: 262,
    inputs: ['in'],
    outputs: [],            // Sink node (monitor only)
    params: {},
  },
  // ── Script modules ───────────────────────────────────────
  script: {
    label: 'Script',
    desc: 'code & patterns',
    accent: '#c8b060',
    synthDef: null,
    category: 'script',
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'val', min: 0, max: 127, step: 0.01, val: 0 },
    },
  },
  // ── Control modules ──────────────────────────────────────
  constant: {
    label: 'Constant',
    desc: 'fixed value',
    accent: '#d4a06a',
    synthDef: null,
    category: 'control',
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'val', min: 0, max: 127, step: 0.01, val: 60 },
    },
  },
  bang: {
    label: 'Bang',
    desc: 'trigger button',
    accent: '#e07050',
    synthDef: null,
    category: 'control',
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'val', min: 0, max: 1, step: 1, val: 0, hidden: true },
    },
  },
  midi_in: {
    label: 'MIDI In',
    desc: 'midi controller',
    accent: '#7a9fc8',
    synthDef: null,
    category: 'control',
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'val', min: 0, max: 127, step: 1, val: 0, hidden: true },
    },
  },
  envelope: {
    label: 'Envelope',
    desc: 'breakpoint editor',
    accent: '#c8b060',
    synthDef: null,
    category: 'control',
    width: 280,
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'out', min: 0, max: 1, step: 0.001, val: 0, hidden: true },
      trig:  { label: 'trig', min: 0, max: 1, step: 1, val: 0, hidden: true },
    },
  },
  audioOut: {
    label: 'Output',
    desc: 'audio destination',
    accent: '#7a7570',
    synthDef: null,
    inputs: ['L', 'R'],
    outputs: [],
    params: {},
  },
};

// ── Module categories for the instrument panel ───────────
const MODULE_CATEGORIES = [
  {
    id: 'oscillators',
    label: 'Oscillators',
    desc: 'basic waveforms',
    types: ['sine', 'sine_osc', 'saw'],
  },
  {
    id: 'instruments',
    label: 'Instruments',
    desc: 'melodic voices',
    types: ['bell', 'blade', 'pluck'],
  },
  {
    id: 'textures',
    label: 'Textures',
    desc: 'pads & noise',
    types: ['pad', 'hollow', 'noise'],
  },
  {
    id: 'filters',
    label: 'Filters',
    desc: 'frequency shaping',
    types: ['fx_lpf', 'fx_hpf', 'fx_bpf', 'fx_rlpf', 'fx_rhpf', 'fx_rbpf', 'fx_moog', 'fx_moogff', 'fx_nlpf', 'fx_nhpf', 'fx_nbpf', 'fx_nrlpf', 'fx_nrhpf', 'fx_nrbpf'],
  },
  {
    id: 'fx',
    label: 'Effects',
    desc: 'time & space',
    types: ['fx_reverb', 'fx_echo', 'fx_distortion', 'fx_flanger'],
  },
  {
    id: 'utility',
    label: 'Utility',
    desc: 'signal tools',
    types: ['multiply', 'print', 'scope'],
  },
  {
    id: 'scripting',
    label: 'Scripting',
    desc: 'code & patterns',
    types: ['script'],
  },
  {
    id: 'control',
    label: 'Control',
    desc: 'modulation sources',
    types: ['constant', 'envelope', 'bang', 'midi_in'],
  },
];

// ── Layout constants ──────────────────────────────────────
const NODE_W = 186;
const HEADER_H = 32;
const PORT_SECTION_Y = HEADER_H + 2;
const PORT_SPACING = 22;

function getNodeWidth(node) {
  if (node.type === 'bang') return (node.bangSize || 60) + 16;
  if (node.scriptWidth != null) return node.scriptWidth;
  return NODE_SCHEMA[node.type]?.width || NODE_W;
}

// Script modules can dynamically set their number of outputs via setOutputs(n).
// This helper returns the effective outputs array for rendering and port positioning.
function getNodeOutputs(node) {
  const schema = NODE_SCHEMA[node.type];
  if (!schema) return [];
  if (schema.category === 'script' && node.numOutputs > 1) {
    return Array.from({ length: node.numOutputs }, (_, i) => `out ${i}`);
  }
  return schema.outputs;
}

function getPortPos(node, portType, portIndex) {
  if (node.type === 'bang') {
    const size = node.bangSize || 60;
    const centerY = node.y + HEADER_H + 4 + size / 2;
    if (portType === 'output') {
      return { x: node.x + size + 16, y: centerY };
    }
    return { x: node.x, y: centerY };
  }
  const y = node.y + PORT_SECTION_Y + 11 + portIndex * PORT_SPACING;
  if (portType === 'output') {
    return { x: node.x + getNodeWidth(node), y };
  }
  return { x: node.x, y };
}

// ── Parameter modulation port positions ──────────────────
// Params render after the header: 33px header + 6px padding + 18px per row
const PARAM_START_Y = HEADER_H + 1 + 6; // header + border + top padding
const PARAM_ROW_H = 18;

function getParamPortPos(node, schema, paramKey) {
  // Envelope trigger port: vertically centered on the canvas area
  if (node.type === 'envelope' && paramKey === 'trig') {
    return { x: node.x, y: node.y + HEADER_H + 60 };
  }
  const paramKeys = Object.keys(schema.params);
  const idx = paramKeys.indexOf(paramKey);
  if (idx === -1) return { x: node.x, y: node.y };
  return {
    x: node.x,
    y: node.y + PARAM_START_Y + idx * PARAM_ROW_H + PARAM_ROW_H / 2,
  };
}

// ── Default scaling factors for audio-rate modulation depth ──
// When a source oscillator modulates a target parameter, its output amplitude
// (capped at 1.0 by the amp slider) is far too small for audible modulation.
// These factors scale the modulator's amp so that the default slider value
// (0.5) produces meaningful modulation depth for each parameter type.
const MOD_DEPTH_SCALES = {
  freq:     400,    // amp 0.5 → ±200 Hz frequency deviation (audible FM)
  amp:      1,      // amp 0.5 → ±0.5 amplitude modulation (full-depth AM)
  phase:    6.283,  // amp 0.5 → ±π radians phase modulation (full PM)
  width:    1,      // amp 0.5 → ±0.5 pulse width modulation (full PWM)
  numharm:  40,     // amp 0.5 → ±20 harmonics variation (timbral FM)
  formfreq: 400,    // amp 0.5 → ±200 Hz formant deviation
  bwfreq:   400,    // amp 0.5 → ±200 Hz bandwidth deviation
  density:  20,     // amp 0.5 → ±10 impulses/sec density variation
  chaos:    0.5,    // amp 0.5 → ±0.25 chaos param deviation (range 1–2)
};

// ── Compute which nodes are "live" (reachable from AudioOut) ──
function computeLiveNodes(nodes, connections) {
  const outNode = Object.values(nodes).find((n) => n.type === 'audioOut');
  if (!outNode) return new Set();

  const live = new Set();
  const queue = [outNode.id];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (live.has(cur)) continue;
    live.add(cur);
    // Find all nodes whose output connects to this node's audio input
    // (skip modulation connections — they don't carry audio)
    connections
      .filter((c) => c.toNodeId === cur && !c.toParam)
      .forEach((c) => queue.push(c.fromNodeId));
  }

  live.delete(outNode.id); // AudioOut itself doesn't play audio
  return live;
}

// ── Cable SVG path (cubic Bézier) ─────────────────────────
function cablePath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// ── Pan value for AudioOut port ───────────────────────────
function panForPort(portIndex) {
  // 0 = L → pan -0.8,  1 = R → pan 0.8
  return portIndex === 0 ? -0.8 : 0.8;
}

// ── Oscilloscope canvas component ──────────────────────────
// Two modes:
//   'classic' — CRT phosphor-glow with persistence trail, graticule, additive blending
//   'modern'  — Clean utility trace matching the app's dark aesthetic
//
// Data: receives full 1024-sample buffer snapshots from scsynth via /b_getn.
// Uses rising zero-crossing trigger for a stable, non-scrolling display.
const SCOPE_W = 260;
const SCOPE_H = 140;
const SCOPE_H_MODERN = 100;
const SCOPE_DISPLAY_SAMPLES = 512; // samples to display (half the buffer)

function ScopeCanvas({ buffersRef, nodeId, bufferSize, accentColor, mode }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const trailRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const isClassic = mode === 'classic';
  const h = isClassic ? SCOPE_H : SCOPE_H_MODERN;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Off-screen canvas for classic persistence trail
    const trail = document.createElement('canvas');
    trail.width = SCOPE_W;
    trail.height = SCOPE_H;
    const tctx = trail.getContext('2d');
    tctx.fillStyle = '#08080a';
    tctx.fillRect(0, 0, SCOPE_W, SCOPE_H);
    trailRef.current = trail;

    // Parse accent hex → rgba helper
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    const accentRgba = (a) => `rgba(${r},${g},${b},${a})`;

    // Find a rising zero-crossing in the buffer for stable triggering.
    // Searches the first half so we always have SCOPE_DISPLAY_SAMPLES after trigger.
    const findTrigger = (buf) => {
      const searchEnd = buf.length - SCOPE_DISPLAY_SAMPLES;
      for (let i = 0; i < searchEnd - 1; i++) {
        if (buf[i] <= 0 && buf[i + 1] > 0) return i;
      }
      return 0; // fallback: no zero-crossing found
    };

    // Compute auto-scaled Y bounds from a contiguous slice
    const computeYBounds = (buf, start, count) => {
      let min = Infinity, max = -Infinity;
      for (let i = start; i < start + count; i++) {
        const v = buf[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max - min < 0.001) { min -= 0.5; max += 0.5; }
      const pad = (max - min) * 0.12 || 0.1;
      return { yMin: min - pad, yMax: max + pad };
    };

    // Build vertex path from contiguous slice
    const buildPath = (buf, start, count, w, h, yMin, yScale) => {
      const pts = [];
      for (let i = 0; i < count; i++) {
        const v = buf[start + i];
        pts.push({ x: (i / (count - 1)) * w, y: h - (v - yMin) * yScale });
      }
      return pts;
    };

    // Stroke a path onto a context
    const strokePath = (c, pts) => {
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) c.moveTo(pts[i].x, pts[i].y);
        else c.lineTo(pts[i].x, pts[i].y);
      }
      c.stroke();
    };

    // ── Classic mode draw (phosphor CRT) ──
    const drawClassic = () => {
      const w = SCOPE_W;
      const ch = SCOPE_H;
      const buf = buffersRef.current.get(nodeId);

      // Phosphor persistence: fade previous frame
      tctx.globalCompositeOperation = 'source-over';
      tctx.fillStyle = 'rgba(8, 8, 10, 0.12)';
      tctx.fillRect(0, 0, w, ch);

      if (buf && buf.length >= SCOPE_DISPLAY_SAMPLES) {
        const trigIdx = findTrigger(buf);
        const displayLen = Math.min(SCOPE_DISPLAY_SAMPLES, buf.length - trigIdx);
        const { yMin, yMax } = computeYBounds(buf, trigIdx, displayLen);
        const yScale = ch / (yMax - yMin);
        const pts = buildPath(buf, trigIdx, displayLen, w, ch, yMin, yScale);

        tctx.globalCompositeOperation = 'lighter';
        tctx.lineJoin = 'round';
        tctx.lineCap = 'round';

        // Glow layer (wide, soft)
        tctx.strokeStyle = accentRgba(0.15);
        tctx.lineWidth = 6;
        strokePath(tctx, pts);

        // Mid glow
        tctx.strokeStyle = accentRgba(0.3);
        tctx.lineWidth = 3;
        strokePath(tctx, pts);

        // Core trace (bright, thin)
        tctx.strokeStyle = accentRgba(0.9);
        tctx.lineWidth = 1.5;
        strokePath(tctx, pts);

        tctx.globalCompositeOperation = 'source-over';
      }

      // Compose final frame
      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, w, ch);

      // Graticule
      ctx.strokeStyle = 'rgba(122, 117, 112, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = Math.round(ch * (i / 5)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const x = Math.round(w * (i / 8)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(122, 117, 112, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(ch / 2) + 0.5);
      ctx.lineTo(w, Math.round(ch / 2) + 0.5);
      ctx.stroke();

      // Persistence trail
      ctx.drawImage(trail, 0, 0);

      // Value readout (peak amplitude)
      if (buf && buf.length > 0) {
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const abs = Math.abs(buf[i]);
          if (abs > peak) peak = abs;
        }
        ctx.fillStyle = 'rgba(212, 207, 200, 0.45)';
        ctx.font = '10px "DM Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(peak.toFixed(3), w - 5, 13);
      }
    };

    // ── Modern mode draw (clean utility) ──
    const drawModern = () => {
      const w = SCOPE_W;
      const mh = SCOPE_H_MODERN;
      const buf = buffersRef.current.get(nodeId);

      ctx.fillStyle = '#111010';
      ctx.fillRect(0, 0, w, mh);

      // Subtle center line
      ctx.strokeStyle = 'rgba(122, 117, 112, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(mh / 2) + 0.5);
      ctx.lineTo(w, Math.round(mh / 2) + 0.5);
      ctx.stroke();

      // Quarter lines
      ctx.strokeStyle = 'rgba(122, 117, 112, 0.05)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(mh / 4) + 0.5);
      ctx.lineTo(w, Math.round(mh / 4) + 0.5);
      ctx.moveTo(0, Math.round(mh * 3 / 4) + 0.5);
      ctx.lineTo(w, Math.round(mh * 3 / 4) + 0.5);
      ctx.stroke();

      if (!buf || buf.length < SCOPE_DISPLAY_SAMPLES) {
        // "No signal" text
        ctx.fillStyle = 'rgba(122, 117, 112, 0.25)';
        ctx.font = '9px "DM Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('no signal', w / 2, mh / 2 + 3);
        return;
      }

      const trigIdx = findTrigger(buf);
      const displayLen = Math.min(SCOPE_DISPLAY_SAMPLES, buf.length - trigIdx);
      const { yMin, yMax } = computeYBounds(buf, trigIdx, displayLen);
      const yScale = mh / (yMax - yMin);
      const pts = buildPath(buf, trigIdx, displayLen, w, mh, yMin, yScale);

      // Filled area under curve (subtle)
      ctx.fillStyle = accentRgba(0.06);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, mh);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, mh);
      ctx.closePath();
      ctx.fill();

      // Main trace
      ctx.strokeStyle = accentRgba(0.7);
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      strokePath(ctx, pts);

      // Value readout (peak amplitude)
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const abs = Math.abs(buf[i]);
        if (abs > peak) peak = abs;
      }
      ctx.fillStyle = 'rgba(212, 207, 200, 0.4)';
      ctx.font = '9px "DM Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(peak.toFixed(3), w - 4, 10);

      // Min/max range
      ctx.fillStyle = 'rgba(122, 117, 112, 0.3)';
      ctx.textAlign = 'left';
      ctx.fillText(yMin.toFixed(1), 4, mh - 4);
      ctx.fillText(yMax.toFixed(1), 4, 10);
    };

    const draw = () => {
      if (modeRef.current === 'classic') drawClassic();
      else drawModern();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [buffersRef, nodeId, bufferSize, accentColor]);

  return (
    <div className={`scope-body ${isClassic ? 'scope-classic' : 'scope-modern'}`}>
      <canvas
        ref={canvasRef}
        className="scope-canvas"
        width={SCOPE_W}
        height={h}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function GridView() {
  const engineRef = useRef(null);
  const canvasRef = useRef(null);
  const nextId = useRef(1);
  const connId = useRef(1);

  const [nodes, setNodes] = useState({});
  const [connections, setConnections] = useState([]);
  const [status, setStatus] = useState('Boot the engine to begin');
  const [booted, setBooted] = useState(false);
  const [booting, setBooting] = useState(false);

  // Drag state
  const [dragId, setDragId] = useState(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Connection state
  const [connecting, setConnecting] = useState(null); // { fromNodeId, fromPortIndex }
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Module details panel state
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const didDragRef = useRef(false);

  // Script runtime state
  const scriptRunnerRef = useRef(null);
  const [runningScripts, setRunningScripts] = useState(new Set());
  const [scriptLogs, setScriptLogs] = useState({}); // nodeId → string[]

  // Envelope runtime state
  const envelopeRunnerRef = useRef(null);
  const [runningEnvelopes, setRunningEnvelopes] = useState(new Set());

  // Instrument panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});

  // Print console state
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [printLogs, setPrintLogs] = useState([]); // { nodeId, prefix, color, value, time }[]
  const nodesRef = useRef(nodes); // Ref to access current nodes in callbacks
  nodesRef.current = nodes;
  const printConsoleRef = useRef(null);
  const fileInputRef = useRef(null);

  // MIDI state
  const midiListenersRef = useRef(new Map()); // nodeId → MidiListener
  const [midiDevices, setMidiDevices] = useState([]); // available MIDI input devices
  const [midiActivity, setMidiActivity] = useState({}); // nodeId → last activity timestamp

  // Scope (oscilloscope) state — ring buffer per scope node
    // Scope (oscilloscope) state — full waveform snapshot per scope node
  const scopeBuffersRef = useRef(new Map()); // nodeId → Float32Array (latest buffer snapshot)
  const SCOPE_BUFFER_SIZE = 1024; // matches GridEngine.SCOPE_BUF_FRAMES

  // Auto-scroll print console when new logs arrive
  useEffect(() => {
    if (printConsoleRef.current && consoleOpen) {
      printConsoleRef.current.scrollTop = printConsoleRef.current.scrollHeight;
    }
  }, [printLogs, consoleOpen]);

  // ── Engine setup ──────────────────────────────────────
  useEffect(() => {
    engineRef.current = new GridEngine();
    engineRef.current.onStatus = (msg) => setStatus(msg);

    // Handle print module messages
    engineRef.current.onPrint = (nodeId, value) => {
      const node = nodesRef.current[nodeId];
      if (!node || node.type !== 'print') return;

      const prefix = node.printPrefix ?? 'print';
      const color = node.printColor || '#e07050';

      setPrintLogs((prev) => {
        const entry = {
          id: Date.now() + Math.random(),
          nodeId,
          prefix,
          color,
          value: typeof value === 'number' ? value.toFixed(4) : String(value),
          time: new Date().toLocaleTimeString(),
        };
        // Keep last 200 entries
        return [...prev, entry].slice(-200);
      });
    };

    // Handle scope module waveform snapshots (full buffer from /b_getn)
    engineRef.current.onScope = (nodeId, samples) => {
      scopeBuffersRef.current.set(nodeId, samples);
    };

    scriptRunnerRef.current = new ScriptRunner({
      onOutput: (nodeId, outputIndex, value) => {
        setNodes((prev) => {
          const node = prev[nodeId];
          if (!node) return prev;
          const paramKey = `out_${outputIndex}`;
          return {
            ...prev,
            [nodeId]: {
              ...node,
              params: {
                ...node.params,
                [paramKey]: value,
                // Keep 'value' in sync with output 0 for backward compat
                ...(outputIndex === 0 ? { value } : {}),
              },
            },
          };
        });
      },
      onLog: (nodeId, ...args) => {
        const line = args.map((a) =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ');
        setScriptLogs((prev) => {
          const existing = prev[nodeId] || [];
          // Keep last 100 lines
          const next = [...existing, line].slice(-100);
          return { ...prev, [nodeId]: next };
        });
      },
      onSetOutputs: (nodeId, count) => {
        setNodes((prev) => {
          const node = prev[nodeId];
          if (!node) return prev;
          return {
            ...prev,
            [nodeId]: { ...node, numOutputs: count },
          };
        });
        // Remove connections from ports that no longer exist
        setConnections((prev) =>
          prev.filter((c) => !(c.fromNodeId === nodeId && c.fromPortIndex >= count))
        );
      },
    });

    envelopeRunnerRef.current = new EnvelopeRunner((nodeId, value) => {
      setNodes((prev) => {
        const node = prev[nodeId];
        if (!node) return prev;
        return {
          ...prev,
          [nodeId]: {
            ...node,
            params: { ...node.params, value },
          },
        };
      });
    });

    // Initialize MIDI access
    initMidi().then((ok) => {
      if (ok) setMidiDevices(getInputDevices());
    });
    const unsubDevices = onDeviceChange((devices) => setMidiDevices(devices));

    return () => {
      engineRef.current?.stopAll();
      scriptRunnerRef.current?.stopAll();
      envelopeRunnerRef.current?.stopAll();
      // Stop all MIDI listeners
      for (const listener of midiListenersRef.current.values()) {
        listener.stop();
      }
      midiListenersRef.current.clear();
      unsubDevices();
    };
  }, []);

  // ── MIDI listener lifecycle ──────────────────────────────
  // Create/update/destroy MidiListeners as midi_in nodes change
  useEffect(() => {
    const listeners = midiListenersRef.current;
    const midiNodeIds = new Set();

    for (const [id, node] of Object.entries(nodes)) {
      if (node.type !== 'midi_in') continue;
      const nodeId = Number(id);
      midiNodeIds.add(nodeId);

      let listener = listeners.get(nodeId);
      if (!listener) {
        // Create new listener for this node
        listener = new MidiListener({
          mode: node.midiMode || 'cc',
          channel: node.midiChannel ?? 0,
          ccNumber: node.midiCcNumber ?? 1,
          deviceId: node.midiDeviceId || null,
          onValue: (value) => {
            setNodes((prev) => {
              const n = prev[nodeId];
              if (!n) return prev;
              return {
                ...prev,
                [nodeId]: { ...n, params: { ...n.params, value } },
              };
            });
            setMidiActivity((prev) => ({ ...prev, [nodeId]: Date.now() }));
          },
          onNote: (note, velocity) => {
            setNodes((prev) => {
              const n = prev[nodeId];
              if (!n) return prev;
              return {
                ...prev,
                [nodeId]: {
                  ...n,
                  params: { ...n.params, value: note },
                  midiLastNote: note,
                  midiGate: velocity > 0 ? 1 : 0,
                },
              };
            });
            setMidiActivity((prev) => ({ ...prev, [nodeId]: Date.now() }));
          },
        });
        listeners.set(nodeId, listener);
        listener.start();
      } else {
        // Update existing listener config
        listener.setMode(node.midiMode || 'cc');
        listener.setChannel(node.midiChannel ?? 0);
        listener.setCcNumber(node.midiCcNumber ?? 1);
        listener.setDeviceId(node.midiDeviceId || null);
      }
    }

    // Remove listeners for deleted nodes
    for (const [nodeId, listener] of listeners) {
      if (!midiNodeIds.has(nodeId)) {
        listener.stop();
        listeners.delete(nodeId);
      }
    }
  }, [nodes]);

  // ── Sync audio with live node set & bus routing ──────
  const prevRoutingRef = useRef({}); // nodeId → { inBus, outBus }
  const prevModRef = useRef({});     // `${nodeId}:${param}` → { busIndex, isAudioRate }
  const modAmpScaleRef = useRef({}); // nodeId → scale factor (for handleParamChange)

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.booted) return;

    const live = computeLiveNodes(nodes, connections);
    const outNode = Object.values(nodes).find((n) => n.type === 'audioOut');
    if (!outNode) return;

    // ── 0. Identify audio-rate modulators ──
    // Nodes that provide audio-rate modulation should be "live" even if
    // not directly connected to AudioOut. We need them to play.
    const audioRateModConns = connections.filter((c) => c.isAudioRate && c.toParam);
    const modulatorIds = new Set(audioRateModConns.map((c) => c.fromNodeId));

    // Add modulators to live set if their carriers are live.
    // Iterate to handle chains (A modulates B modulates C, where C is live).
    let changed = true;
    while (changed) {
      changed = false;
      for (const conn of audioRateModConns) {
        if (live.has(conn.toNodeId) && !live.has(conn.fromNodeId)) {
          live.add(conn.fromNodeId);
          changed = true;
        }
      }
    }

    // ── 0b. Identify sink nodes (print/scope modules) and their input chains ──
    // Sink modules can monitor ANY signal, not just live ones.
    // Trace backwards from each sink module to find all nodes in its input chain
    // and add them to the live set so they play.
    const sinkModules = Object.entries(nodes).filter(([, n]) => n.type === 'print' || n.type === 'scope');
    for (const [printId, ] of sinkModules) {
      const printNodeId = parseInt(printId);

      // Check if this print module has any input connections
      const hasInput = connections.some(
        (c) => c.toNodeId === printNodeId && !c.toParam
      );
      if (!hasInput) continue; // Skip print modules with no input

      // Trace back through all input connections to find the full chain
      const toVisit = [printNodeId];
      const visited = new Set();

      while (toVisit.length > 0) {
        const currentId = toVisit.pop();
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        // Add this node to live (so it plays)
        live.add(currentId);

        // Find all nodes that feed into this one (regular connections, not param mods)
        const inputConns = connections.filter(
          (c) => c.toNodeId === currentId && !c.toParam
        );
        for (const conn of inputConns) {
          if (!visited.has(conn.fromNodeId)) {
            toVisit.push(conn.fromNodeId);
          }
        }
      }
    }

    // ── 1. Assign audio buses to each connection ──
    // Connections to AudioOut use bus 0 (hardware out).
    // All other connections get a private bus (16+).
    // Skip control-rate modulation connections (toParam && !isAudioRate).
    // Audio-rate modulation connections DO get audio buses.
    const connBus = {};
    let nextBus = 16;
    for (const conn of connections) {
      // Skip control-rate modulation (handled separately)
      if (conn.toParam && !conn.isAudioRate) continue;

      const fromLive = live.has(conn.fromNodeId);
      const toLive = live.has(conn.toNodeId) || conn.toNodeId === outNode.id;
      if (!fromLive || !toLive) continue;

      if (conn.toNodeId === outNode.id && !conn.toParam) {
        connBus[conn.id] = 0;
      } else {
        connBus[conn.id] = nextBus;
        nextBus += 2; // stereo pair (though modulation only uses mono)
      }
    }

    // ── 2. Compute per-node routing ──
    const nodeRouting = {}; // nodeId → { outBus, inBus, isFx, isModulator, modOutBuses }
    for (const id of live) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      const isFx = schema.category === 'fx';
      const isModulator = modulatorIds.has(id);

      // Outgoing audio connection from this node's output (to AudioOut or FX)
      // Prioritize connection to AudioOut (bus 0) over connections to other nodes
      const outConnToAudioOut = connections.find(
        (c) => c.fromNodeId === id && !c.toParam && c.toNodeId === outNode.id
      );
      const outConnToLive = connections.find(
        (c) => c.fromNodeId === id && !c.toParam && live.has(c.toNodeId)
      );
      const outConn = outConnToAudioOut || outConnToLive;
      const outBus = outConn ? (connBus[outConn.id] ?? 0) : 0;

      // Audio-rate modulation output buses (when this node modulates others)
      const modOutBuses = [];
      for (const conn of audioRateModConns) {
        if (conn.fromNodeId === id && connBus[conn.id] != null) {
          modOutBuses.push({ connId: conn.id, bus: connBus[conn.id], toNodeId: conn.toNodeId, toParam: conn.toParam });
        }
      }

      // Incoming audio connection to this node's input (only for FX)
      let inBus;
      if (isFx) {
        const inConn = connections.find(
          (c) => c.toNodeId === id && !c.toParam && live.has(c.fromNodeId)
        );
        inBus = inConn ? (connBus[inConn.id] ?? 0) : 0;
      }

      // Compute effective output bus (accounts for modulation routing)
      // If this node is a modulator, it outputs to the mod bus, not the regular bus
      let effectiveOutBus = outBus;
      if (isModulator && modOutBuses.length > 0) {
        effectiveOutBus = modOutBuses[0].bus;
      }

      nodeRouting[id] = { outBus, effectiveOutBus, inBus, isFx, isModulator, modOutBuses };
    }

    // ── 2b. Fix sink nodes (print/scope modules) to read from source's effective out bus ──
    // Sink nodes have no outputs, so they should tap into the source's output bus
    // rather than expecting a dedicated connection bus.
    for (const id of live) {
      const node = nodes[id];
      if (node.type === 'print' || node.type === 'scope') {
        const inConn = connections.find(
          (c) => c.toNodeId === id && !c.toParam && live.has(c.fromNodeId)
        );
        if (inConn && nodeRouting[inConn.fromNodeId]) {
          // Read from the same bus the source actually writes to
          const srcBus = nodeRouting[inConn.fromNodeId].effectiveOutBus;
          const oldBus = nodeRouting[id].inBus;
          nodeRouting[id].inBus = srcBus;
          if (oldBus !== srcBus) {
            console.log(`[BUS] ${node.type}(${id}) inBus: ${oldBus} → ${srcBus} (from source ${inConn.fromNodeId})`);
          }
        }
      }
    }

    // ── 3. Compute pan for source nodes ──
    // Trace each source's chain to AudioOut to find which port it reaches.
    // Modulators that don't go to AudioOut get pan=0 (centered, though inaudible).
    for (const id of live) {
      const routing = nodeRouting[id];
      if (routing.isFx) continue;

      let current = id;
      let audioOutPort = null;
      const visited = new Set();
      while (current != null && !visited.has(current)) {
        visited.add(current);
        const conn = connections.find(
          (c) => c.fromNodeId === current && !c.toParam && (live.has(c.toNodeId) || c.toNodeId === outNode.id)
        );
        if (!conn) break;
        if (conn.toNodeId === outNode.id) {
          audioOutPort = conn.toPortIndex;
          break;
        }
        current = conn.toNodeId;
      }

      if (audioOutPort === 0) routing.pan = -0.8;
      else if (audioOutPort === 1) routing.pan = 0.8;
      else routing.pan = 0;

      // Modulators use hard-left pan so the full signal goes to the left audio
      // bus channel, which is what /n_mapa mod inputs read. This eliminates
      // the ~30% amplitude loss from equal-power Pan2 at center.
      if (routing.isModulator) routing.pan = -1;
    }

    // ── 4. Build topological play order (sources first, then FX in chain order) ──
    // For audio-rate modulation (FM/AM), modulators must execute before carriers.
    // Since engine.play() uses addToHead, we need to play carriers first, then modulators
    // so that modulators end up at the head and execute first.
    const sourceCarriers = [];
    const sourceModulators = [];
    const fxSet = new Set();
    for (const id of live) {
      if (nodeRouting[id].isFx) {
        fxSet.add(id);
      } else if (nodeRouting[id].isModulator) {
        sourceModulators.push(id);
      } else {
        sourceCarriers.push(id);
      }
    }
    // Play carriers first (they end up toward tail), then modulators (they end up at head)
    const sources = [...sourceCarriers, ...sourceModulators];

    // Topological sort of FX: repeatedly pick FX whose upstream is already placed
    const fxOrder = [];
    const remaining = new Set(fxSet);
    const placed = new Set(sources);
    placed.add(outNode.id);
    let safety = remaining.size + 1;
    while (remaining.size > 0 && safety-- > 0) {
      for (const id of remaining) {
        const inConn = connections.find((c) => c.toNodeId === id && !c.toParam);
        if (!inConn || placed.has(inConn.fromNodeId)) {
          fxOrder.push(id);
          remaining.delete(id);
          placed.add(id);
        }
      }
    }

    // ── 4b. Pre-compute control-rate modulated params ──
    // We must NOT send /n_set for params mapped to a control bus via /n_map,
    // because /n_set breaks the bus mapping, causing a momentary value
    // discontinuity (audible as a click/pop).
    const controlMappedParams = new Set();
    for (const conn of connections) {
      if (!conn.toParam || conn.isAudioRate) continue;
      const sourceNode = nodes[conn.fromNodeId];
      const sourceSchema = NODE_SCHEMA[sourceNode?.type];
      if (sourceSchema?.category === 'control' || sourceSchema?.category === 'script') {
        controlMappedParams.add(`${conn.toNodeId}:${conn.toParam}`);
      }
    }

    // ── 5. Stop nodes that should not be playing ──
    for (const id of Object.keys(nodes)) {
      const nid = parseInt(id);
      if (!live.has(nid) && engine.isPlaying(nid)) {
        // Clean up print/scope module polling
        if (nodes[id].type === 'print') {
          engine.stopPrintModule(nid);
        }
        if (nodes[id].type === 'scope') {
          engine.stopScope(nid);
        }
        engine.stop(nid);
      }
    }

    // ── 6. Stop FX whose routing changed (need restart for correct ordering) ──
    const prevRouting = prevRoutingRef.current;
    for (const id of fxOrder) {
      if (engine.isPlaying(id)) {
        const prev = prevRouting[id];
        const cur = nodeRouting[id];
        if (!prev || prev.inBus !== cur.inBus || prev.outBus !== cur.outBus) {
  engine.stop(id);
        }
      }
    }

    // ── 7. Play / update source nodes ──
    for (const id of sources) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      const routing = nodeRouting[id];
      const pan = routing.pan ?? 0;

      // For modulators, scale amp so the modulation signal is large enough to
      // produce audible effects.  Without this, amp ∈ [0,1] gives at most
      // ±1 Hz frequency deviation — completely imperceptible.
      let ampToSend = node.params.amp;
      if (routing.isModulator && routing.modOutBuses.length > 0) {
        const targetParam = routing.modOutBuses[0].toParam;
        const scale = MOD_DEPTH_SCALES[targetParam] ?? 1;
        ampToSend = (node.params.amp ?? 0.5) * scale;
        modAmpScaleRef.current[id] = scale;
      } else {
        delete modAmpScaleRef.current[id];
      }

      if (!engine.isPlaying(id)) {
        const playParams = { ...node.params, pan, out_bus: routing.effectiveOutBus };
        if (routing.isModulator) playParams.amp = ampToSend;
        if (node.quantize && playParams.freq != null) {
          playParams.freq = quantizeFreq(playParams.freq);
        }
        engine.play(id, schema.synthDef, playParams);
      } else {
        engine.setParam(id, 'pan', pan);
        engine.setParam(id, 'out_bus', routing.effectiveOutBus);
        // Only send /n_set for amp if it's NOT control-bus-mapped.
        // Sending /n_set on a mapped param breaks the /n_map binding,
        // causing a momentary value jump (audible click).
        // When the mod cable is disconnected, the unmap section (step 10)
        // restores the base value.
        if (!controlMappedParams.has(`${id}:amp`)) {
          engine.setParam(id, 'amp', ampToSend);
        }
      }
    }

    // ── 8. Play / update FX nodes (in chain order) ──
    for (const id of fxOrder) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      const routing = nodeRouting[id];

      if (!engine.isPlaying(id)) {
        // Special handling for print modules - allocate control bus
        if (node.type === 'print') {
          const printBus = engine.startPrintModule(id);
          engine.playFx(id, schema.synthDef, {
            in_bus: routing.inBus,
            out_c_bus: printBus,
          });
        } else if (node.type === 'scope') {
          const scopeBuf = engine.startScope(id);
          engine.playFx(id, schema.synthDef, {
            in_bus: routing.inBus,
            bufnum: scopeBuf,
          });
        } else {
          engine.playFx(id, schema.synthDef, {
            ...node.params,
            in_bus: routing.inBus,
            out_bus: routing.effectiveOutBus,  // Use effectiveOutBus for modulators
          });
        }
      } else {
        // Update FX params and routing (skip control-bus-mapped params)
        for (const [k, v] of Object.entries(node.params)) {
          if (!controlMappedParams.has(`${id}:${k}`)) {
            engine.setParam(id, k, v);
          }
        }
        // Also update routing params dynamically (in_bus and out_bus can be changed via /n_set)
        if (routing.inBus != null) {
          engine.setParam(id, 'in_bus', routing.inBus);
        }
        if (routing.effectiveOutBus != null) {
          engine.setParam(id, 'out_bus', routing.effectiveOutBus);  // Use effectiveOutBus for modulators
        }
      }
    }

    // ── 9. Reorder FX in scsynth node tree ──
    if (fxOrder.length > 1) {
      engine.reorderFx(fxOrder);
    }

    // ── 10. Apply modulation ──
    // Control-rate modulation: control modules write to control buses, targets read via /n_map
    // Audio-rate modulation: audio modules write to audio buses, targets read via /n_mapa
    const prevMod = prevModRef.current;
    const currentMod = {};

    for (const conn of connections) {
      if (!conn.toParam) continue;
      const sourceNode = nodes[conn.fromNodeId];
      const targetNode = nodes[conn.toNodeId];
      if (!sourceNode || !targetNode) continue;

      const sourceSchema = NODE_SCHEMA[sourceNode.type];
      const modKey = `${conn.toNodeId}:${conn.toParam}`;

      if (conn.isAudioRate) {
        // ── Audio-rate modulation ──
        // The source's audio output goes to an audio bus, and the target's
        // {param}_mod input reads from that bus via /n_mapa.
        const audioBus = connBus[conn.id];
        if (audioBus == null) continue;

        // The actual param name for audio-rate mod is {param}_mod
        const modParam = `${conn.toParam}_mod`;

        // Map the target synth's mod param to read from the audio bus
        if (engine.isPlaying(conn.toNodeId)) {
          engine.mapParamToAudioBus(conn.toNodeId, modParam, audioBus);
        }

        currentMod[modKey] = { busIndex: audioBus, isAudioRate: true, modParam };
      } else {
        // ── Control-rate modulation ──
        // Only control/script modules can do control-rate modulation
        if (sourceSchema?.category !== 'control' && sourceSchema?.category !== 'script') continue;

        // Script modules with multiple outputs store per-port values as out_0, out_1, …
        const value = sourceSchema?.category === 'script'
          ? (sourceNode.params[`out_${conn.fromPortIndex}`] ?? sourceNode.params.value ?? 0)
          : (sourceNode.params.value ?? 0);

        // Allocate a control bus (stable — same key returns same bus)
        const busIndex = engine.allocControlBus(modKey);

        // Write the current value to the control bus.
        // When an envelope (or constant) drives a modulator's amp, scale
        // the bus value by the mod-depth factor so the modulation signal is
        // large enough for audible FM/AM/PM.  Without this, the envelope's
        // 0-1 range produces at most ±1 Hz frequency deviation.
        let busValue = value;
        if (conn.toParam === 'amp' && modAmpScaleRef.current[conn.toNodeId]) {
          busValue = value * modAmpScaleRef.current[conn.toNodeId];
        }
        engine.setControlBus(busIndex, busValue);

        // Map the target synth's param to read from this bus
        if (engine.isPlaying(conn.toNodeId)) {
          engine.mapParam(conn.toNodeId, conn.toParam, busIndex);
        }

        currentMod[modKey] = { busIndex, isAudioRate: false };
      }
    }

    // Unmap params that are no longer modulated
    for (const [modKey, info] of Object.entries(prevMod)) {
      if (!(modKey in currentMod)) {
        const sepIdx = modKey.indexOf(':');
        const nodeId = parseInt(modKey.slice(0, sepIdx));
        const param = modKey.slice(sepIdx + 1);
        const targetNode = nodes[nodeId];
        let baseValue = targetNode?.params[param] ?? 0;

        // When unmapping a modulator's amp, restore the scaled value so the
        // modulation depth stays correct after the envelope is disconnected.
        if (param === 'amp' && modAmpScaleRef.current[nodeId]) {
          baseValue *= modAmpScaleRef.current[nodeId];
        }

        if (info.isAudioRate) {
          // Unmap audio-rate modulation
          engine.unmapParamFromAudioBus(nodeId, info.modParam, 0);
        } else {
          // Unmap control-rate modulation
          engine.unmapParam(nodeId, param, baseValue);
          engine.freeControlBus(modKey);
        }
      }
    }

    prevModRef.current = currentMod;

    // Save routing state for next sync
    prevRoutingRef.current = nodeRouting;
  }, [nodes, connections]);

  // ── Boot engine ───────────────────────────────────────
  const handleBoot = useCallback(async () => {
    setBooting(true);
    try {
      await engineRef.current.boot();
      setBooted(true);

      // Create default AudioOut node
      const outId = nextId.current++;
      setNodes({
        [outId]: {
          id: outId,
          type: 'audioOut',
          x: 520,
          y: 180,
          params: {},
        },
      });
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setBooting(false);
  }, []);

  // ── Add node ──────────────────────────────────────────
  const addNode = useCallback((type) => {
    const id = nextId.current++;
    const schema = NODE_SCHEMA[type];
    const params = {};
    for (const [k, def] of Object.entries(schema.params)) {
      params[k] = def.val;
    }
    const node = {
      id,
      type,
      x: 0,
      y: 0,
      params,
    };
    if (schema.category === 'script') {
      node.code = '// setOutputs(n)          — declare n output ports\n// out(value)             — send to output 0\n// out(index, value)      — send to output <index>\n';
      node.numOutputs = 1;
    }
    if (type === 'envelope') {
      node.breakpoints = [
        { time: 0, value: 0 },
        { time: 0.15, value: 1 },
        { time: 0.4, value: 0.6 },
        { time: 1, value: 0 },
      ];
      node.curves = [0, 0, -2];
      node.duration = 2;
      node.loop = false;
    }
    if (type === 'bang') {
      node.bangSize = 60;
    }
    if (type === 'midi_in') {
      node.midiMode = 'cc';       // 'cc' or 'note'
      node.midiChannel = 0;       // 0 = omni, 1-16 = specific
      node.midiCcNumber = 1;      // CC number (0-127)
      node.midiDeviceId = null;   // null = any device
      node.midiLastNote = null;   // last received note number
      node.midiGate = 0;          // note on/off state
    }
    if (type === 'print') {
      node.printPrefix = 'print';
      node.printColor = '#e07050';
    }
    if (type === 'scope') {
      node.scopeMode = 'modern'; // 'modern' (clean utility) or 'classic' (phosphor CRT)
    }
    setNodes((prev) => {
      const count = Object.keys(prev).length;
      const col = Math.max(0, count - 1) % 3;
      const row = Math.floor(Math.max(0, count - 1) / 3);
      node.x = 40 + col * 210;
      node.y = 40 + row * 220;
      return { ...prev, [id]: node };
    });
  }, []);

  // ── Remove node ───────────────────────────────────────
  const removeNode = useCallback(
    (id) => {
      engineRef.current?.stop(id);
      engineRef.current?.stopScope(id);
      scriptRunnerRef.current?.stop(id);
      envelopeRunnerRef.current?.stop(id);
      scopeBuffersRef.current.delete(id);
      scopeWriteIdxRef.current.delete(id);
      // Stop MIDI listener if this was a midi_in node
      const midiListener = midiListenersRef.current.get(id);
      if (midiListener) {
        midiListener.stop();
        midiListenersRef.current.delete(id);
      }
      setRunningScripts((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRunningEnvelopes((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConnections((prev) =>
        prev.filter((c) => c.fromNodeId !== id && c.toNodeId !== id)
      );
      setSelectedNodeId((prev) => (prev === id ? null : prev));
    },
    []
  );

  // ── Param change ──────────────────────────────────────
  const handleParamChange = useCallback((nodeId, param, value) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      // Quantize freq to nearest note when the flag is on
      const sent = (param === 'freq' && node?.quantize) ? quantizeFreq(value) : value;
      // For modulators, scale amp so the synth receives the modulation-depth
      // value rather than the raw slider value (which is too small for audible
      // FM/AM/PM).  The routing sync sets modAmpScaleRef for active modulators.
      const actualSent = (param === 'amp' && modAmpScaleRef.current[nodeId])
        ? sent * modAmpScaleRef.current[nodeId]
        : sent;
      engineRef.current?.setParam(nodeId, param, actualSent);
      return {
        ...prev,
        [nodeId]: {
          ...node,
          params: { ...node.params, [param]: value },
        },
      };
    });
  }, []);

  // ── Script code change ──────────────────────────────────
  const handleCodeChange = useCallback((nodeId, code) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], code },
    }));
  }, []);

  // ── Script run/stop ───────────────────────────────────
  const handleRunScript = useCallback((nodeId, code) => {
    const runner = scriptRunnerRef.current;
    if (!runner) return;
    // Clear previous logs for this node
    setScriptLogs((prev) => ({ ...prev, [nodeId]: [] }));
    runner.run(nodeId, code);
    setRunningScripts((prev) => new Set(prev).add(nodeId));
  }, []);

  const handleStopScript = useCallback((nodeId) => {
    const runner = scriptRunnerRef.current;
    if (!runner) return;
    runner.stop(nodeId);
    setRunningScripts((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  // ── Quantize toggle ──────────────────────────────────
  const handleQuantizeToggle = useCallback((nodeId, enabled) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      const updated = { ...node, quantize: enabled };
      // Re-send freq immediately with (or without) quantisation
      if (node.params.freq != null) {
        const sent = enabled ? quantizeFreq(node.params.freq) : node.params.freq;
        engineRef.current?.setParam(nodeId, 'freq', sent);
      }
      return { ...prev, [nodeId]: updated };
    });
  }, []);

  // ── Print module handlers ─────────────────────────────
  const handlePrintPrefix = useCallback((nodeId, prefix) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], printPrefix: prefix },
    }));
  }, []);

  const handlePrintColor = useCallback((nodeId, color) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], printColor: color },
    }));
  }, []);

  const clearPrintLogs = useCallback(() => {
    setPrintLogs([]);
  }, []);

  // ── Scope mode toggle ─────────────────────────────────
  const handleScopeModeToggle = useCallback((nodeId) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) return prev;
      const next = node.scopeMode === 'classic' ? 'modern' : 'classic';
      return { ...prev, [nodeId]: { ...node, scopeMode: next } };
    });
  }, []);

  // ── Envelope handlers ──────────────────────────────────
  const handleBreakpointsChange = useCallback((nodeId, breakpoints, curves) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], breakpoints, curves },
    }));
  }, []);

  const handleEnvelopeDuration = useCallback((nodeId, duration) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], duration },
    }));
  }, []);

  const handleEnvelopeLoop = useCallback((nodeId, loop) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], loop },
    }));
  }, []);

  const handleEnvelopeTrigger = useCallback((nodeId) => {
    const runner = envelopeRunnerRef.current;
    if (!runner) return;

    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) return prev;
      runner.trigger(
        nodeId,
        node.breakpoints,
        node.curves,
        node.duration,
        node.loop
      );
      return prev;
    });
    setRunningEnvelopes((prev) => new Set(prev).add(nodeId));

    // Poll for completion to clear the running state
    const checkDone = setInterval(() => {
      if (!envelopeRunnerRef.current?.isRunning(nodeId)) {
        clearInterval(checkDone);
        setRunningEnvelopes((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    }, 100);
  }, []);

  const handleEnvelopeStop = useCallback((nodeId) => {
    envelopeRunnerRef.current?.stop(nodeId);
    setRunningEnvelopes((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const getEnvelopeProgress = useCallback((nodeId) => {
    return envelopeRunnerRef.current?.getProgress(nodeId) || null;
  }, []);

  // ── Bang handler ─────────────────────────────────────────
  const bangTimeouts = useRef({}); // nodeId → timeout handle
  const handleBang = useCallback((nodeId) => {
    // Clear any pending reset so rapid clicks retrigger cleanly
    if (bangTimeouts.current[nodeId]) {
      clearTimeout(bangTimeouts.current[nodeId]);
      // Reset to 0 first so the rising-edge detector sees a fresh edge
      setNodes((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], params: { ...prev[nodeId].params, value: 0 } },
      }));
    }
    // Pulse value to 1
    // Use a microtask so the 0→1 transition happens in a separate render
    // when retriggering (ensures the rising-edge detector sees it)
    Promise.resolve().then(() => {
      setNodes((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], params: { ...prev[nodeId].params, value: 1 } },
      }));
      // Reset back to 0 after a short delay
      bangTimeouts.current[nodeId] = setTimeout(() => {
        setNodes((prev) => ({
          ...prev,
          [nodeId]: { ...prev[nodeId], params: { ...prev[nodeId].params, value: 0 } },
        }));
        delete bangTimeouts.current[nodeId];
      }, 80);
    });
  }, []);

  // ── Bang resize (drag from edge) ───────────────────────
  const bangResizing = useRef(null); // { nodeId, startY, startSize }
  const handleBangResizeStart = useCallback((e, nodeId, currentSize) => {
    e.stopPropagation();
    e.preventDefault();
    bangResizing.current = {
      nodeId,
      startY: e.clientY,
      startSize: currentSize,
    };

    const onMove = (me) => {
      const info = bangResizing.current;
      if (!info) return;
      const delta = me.clientY - info.startY;
      const newSize = Math.max(36, Math.min(200, info.startSize + delta));
      setNodes((prev) => ({
        ...prev,
        [info.nodeId]: { ...prev[info.nodeId], bangSize: newSize },
      }));
    };
    const onUp = () => {
      bangResizing.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Script module resize (drag from corner) ─────────────
  const scriptResizing = useRef(null); // { nodeId, startX, startWidth }
  const handleScriptResizeStart = useCallback((e, nodeId, currentWidth) => {
    e.stopPropagation();
    e.preventDefault();
    scriptResizing.current = {
      nodeId,
      startX: e.clientX,
      startWidth: currentWidth,
    };

    const onMove = (me) => {
      const info = scriptResizing.current;
      if (!info) return;
      const delta = me.clientX - info.startX;
      const newWidth = Math.max(140, Math.min(400, info.startWidth + delta));
      setNodes((prev) => ({
        ...prev,
        [info.nodeId]: { ...prev[info.nodeId], scriptWidth: newWidth },
      }));
    };
    const onUp = () => {
      scriptResizing.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Save patch to JSON file ─────────────────────────────
  const handleSavePatch = useCallback(() => {
    const patch = {
      name: 'Untitled Patch',
      version: 1,
      createdAt: new Date().toISOString(),
      nextId: nextId.current,
      connId: connId.current,
      nodes: Object.values(nodes).map((node) => {
        const entry = {
          id: node.id,
          type: node.type,
          x: Math.round(node.x),
          y: Math.round(node.y),
          params: { ...node.params },
        };
        if (node.code != null) entry.code = node.code;
        if (node.numOutputs != null && node.numOutputs > 1) entry.numOutputs = node.numOutputs;
        if (node.scriptWidth != null) entry.scriptWidth = node.scriptWidth;
        if (node.quantize) entry.quantize = true;
        if (node.breakpoints) entry.breakpoints = node.breakpoints;
        if (node.curves) entry.curves = node.curves;
        if (node.duration != null) entry.duration = node.duration;
        if (node.loop) entry.loop = true;
        if (node.printPrefix != null) entry.printPrefix = node.printPrefix;
        if (node.printColor != null) entry.printColor = node.printColor;
        if (node.bangSize != null) entry.bangSize = node.bangSize;
        if (node.scopeMode != null) entry.scopeMode = node.scopeMode;
        if (node.midiMode != null) entry.midiMode = node.midiMode;
        if (node.midiChannel != null) entry.midiChannel = node.midiChannel;
        if (node.midiCcNumber != null) entry.midiCcNumber = node.midiCcNumber;
        if (node.midiDeviceId != null) entry.midiDeviceId = node.midiDeviceId;
        return entry;
      }),
      connections: connections.map((c) => {
        const entry = {
          id: c.id,
          from: c.fromNodeId,
          fromPort: c.fromPortIndex,
          to: c.toNodeId,
          toPort: c.toPortIndex,
        };
        if (c.toParam) entry.toParam = c.toParam;
        if (c.isAudioRate) entry.isAudioRate = true;
        return entry;
      }),
    };

    const json = JSON.stringify(patch, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patch.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Patch saved');
  }, [nodes, connections]);

  // ── Load patch from JSON file ───────────────────────────
  const handleLoadPatch = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const patch = JSON.parse(ev.target.result);

        // Validate basic structure
        if (!patch.nodes || !patch.connections) {
          setStatus('Error: Invalid patch file — missing nodes or connections');
          return;
        }

        // Stop all running audio, scripts, envelopes
        const engine = engineRef.current;
        if (engine) {
          for (const id of Object.keys(nodes)) {
            engine.stop(Number(id));
          }
        }
        scriptRunnerRef.current?.stopAll?.();
        envelopeRunnerRef.current?.stopAll?.();
        // Stop all MIDI listeners
        for (const listener of midiListenersRef.current.values()) {
          listener.stop();
        }
        midiListenersRef.current.clear();
        setRunningScripts(new Set());
        setRunningEnvelopes(new Set());
        setPrintLogs([]);
        setSelectedNodeId(null);
        setMidiActivity({});
        scopeBuffersRef.current.clear();

        // Restore nodes
        const restoredNodes = {};
        for (const n of patch.nodes) {
          if (!NODE_SCHEMA[n.type]) {
            setStatus(`Warning: Unknown node type "${n.type}" — skipped`);
            continue;
          }
          restoredNodes[n.id] = {
            id: n.id,
            type: n.type,
            x: n.x ?? 0,
            y: n.y ?? 0,
            params: { ...n.params },
          };
          if (n.code != null) restoredNodes[n.id].code = n.code;
          if (n.numOutputs != null) restoredNodes[n.id].numOutputs = n.numOutputs;
          if (n.scriptWidth != null) restoredNodes[n.id].scriptWidth = n.scriptWidth;
          if (n.quantize) restoredNodes[n.id].quantize = true;
          if (n.breakpoints) restoredNodes[n.id].breakpoints = n.breakpoints;
          if (n.curves) restoredNodes[n.id].curves = n.curves;
          if (n.duration != null) restoredNodes[n.id].duration = n.duration;
          if (n.loop) restoredNodes[n.id].loop = true;
          if (n.printPrefix != null) restoredNodes[n.id].printPrefix = n.printPrefix;
          if (n.printColor != null) restoredNodes[n.id].printColor = n.printColor;
          if (n.bangSize != null) restoredNodes[n.id].bangSize = n.bangSize;
          if (n.scopeMode != null) restoredNodes[n.id].scopeMode = n.scopeMode;
          if (n.midiMode != null) restoredNodes[n.id].midiMode = n.midiMode;
          if (n.midiChannel != null) restoredNodes[n.id].midiChannel = n.midiChannel;
          if (n.midiCcNumber != null) restoredNodes[n.id].midiCcNumber = n.midiCcNumber;
          if (n.midiDeviceId != null) restoredNodes[n.id].midiDeviceId = n.midiDeviceId;
        }

        // Restore connections
        const restoredConns = patch.connections.map((c) => ({
          id: c.id,
          fromNodeId: c.from,
          fromPortIndex: c.fromPort,
          toNodeId: c.to,
          toPortIndex: c.toPort,
          toParam: c.toParam || null,
          isAudioRate: c.isAudioRate || false,
        }));

        // Restore ID counters
        if (patch.nextId) nextId.current = patch.nextId;
        if (patch.connId) connId.current = patch.connId;

        setNodes(restoredNodes);
        setConnections(restoredConns);
        setStatus(`Loaded: ${patch.name || 'patch'}`);
      } catch (err) {
        setStatus(`Error loading patch: ${err.message}`);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be loaded again
    e.target.value = '';
  }, [nodes]);

  // ── External trigger detection (rising-edge on modulated trig param) ──
  const prevTrigVals = useRef({}); // nodeId → previous trigger source value

  useEffect(() => {
    const prev = prevTrigVals.current;

    for (const conn of connections) {
      if (conn.toParam !== 'trig') continue;

      const targetNode = nodes[conn.toNodeId];
      if (!targetNode || targetNode.type !== 'envelope') continue;

      const sourceNode = nodes[conn.fromNodeId];
      if (!sourceNode) continue;

      const srcSchema = NODE_SCHEMA[sourceNode.type];
      if (srcSchema?.category !== 'control' && srcSchema?.category !== 'script') continue;

      // Script modules store per-port values as out_N
      const value = srcSchema?.category === 'script'
        ? (sourceNode.params[`out_${conn.fromPortIndex}`] ?? sourceNode.params.value ?? 0)
        : (sourceNode.params.value ?? 0);
      const prevValue = prev[conn.toNodeId] ?? 0;

      // Rising edge: crossed above 0.5
      if (value >= 0.5 && prevValue < 0.5) {
        const runner = envelopeRunnerRef.current;
        if (runner) {
          const envId = conn.toNodeId;
          runner.trigger(
            envId,
            targetNode.breakpoints,
            targetNode.curves,
            targetNode.duration,
            targetNode.loop
          );
          setRunningEnvelopes((s) => new Set(s).add(envId));

          // Poll for completion to clear running state
          const check = setInterval(() => {
            if (!envelopeRunnerRef.current?.isRunning(envId)) {
              clearInterval(check);
              setRunningEnvelopes((s) => {
                const next = new Set(s);
                next.delete(envId);
                return next;
              });
            }
          }, 100);
        }
      }

      prev[conn.toNodeId] = value;
    }
  }, [nodes, connections]);

  // ── Param port click (modulation connect/disconnect) ──
  const handleParamPortClick = useCallback(
    (e, nodeId, paramKey) => {
      e.stopPropagation();

      if (connecting) {
        // Completing a modulation connection
        if (connecting.fromNodeId === nodeId) {
          setConnecting(null);
          return;
        }

        // Determine if this is an audio-rate modulation connection
        // Audio-rate: source has audio outputs (not control/script) AND target has modInputs
        const sourceNode = nodes[connecting.fromNodeId];
        const targetNode = nodes[nodeId];
        const sourceSchema = NODE_SCHEMA[sourceNode?.type];
        const targetSchema = NODE_SCHEMA[targetNode?.type];
        const sourceIsAudio = sourceSchema?.outputs?.length > 0 &&
                              sourceSchema?.category !== 'control' &&
                              sourceSchema?.category !== 'script';
        const targetHasModInput = targetSchema?.modInputs?.includes(paramKey);
        const isAudioRate = sourceIsAudio && targetHasModInput;

        // Remove any existing modulation to this param, then add new one
        setConnections((prev) => {
          const filtered = prev.filter(
            (c) => !(c.toNodeId === nodeId && c.toParam === paramKey)
          );
          return [
            ...filtered,
            {
              id: connId.current++,
              fromNodeId: connecting.fromNodeId,
              fromPortIndex: connecting.fromPortIndex,
              toNodeId: nodeId,
              toParam: paramKey,
              toPortIndex: -1,
              isAudioRate,
            },
          ];
        });
        setConnecting(null);
      } else {
        // Clicking a modulated param port disconnects it
        setConnections((prev) =>
          prev.filter(
            (c) => !(c.toNodeId === nodeId && c.toParam === paramKey)
          )
        );
      }
    },
    [connecting, nodes]
  );

  // ── Node dragging ─────────────────────────────────────
  const startDrag = useCallback((e, nodeId) => {
    if (e.target.closest('.node-port') || e.target.closest('button') || e.target.closest('input') || e.target.closest('.script-code-preview') || e.target.closest('.bp-editor-wrap') || e.target.closest('.bang-circle') || e.target.closest('.bang-resize-handle') || e.target.closest('.script-resize-handle')) return;
    didDragRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const node = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!node) return;
    const nodeRect = node.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - nodeRect.left + (nodeRect.left - rect.left) - (parseFloat(node.style.left) || 0) + (parseFloat(node.style.left) || 0),
      y: e.clientY - nodeRect.top + (nodeRect.top - rect.top) - (parseFloat(node.style.top) || 0) + (parseFloat(node.style.top) || 0),
    };
    // Simpler: offset = mouse position in canvas - node position
    const canvasX = e.clientX - rect.left + canvas.scrollLeft;
    const canvasY = e.clientY - rect.top + canvas.scrollTop;
    setNodes((prev) => {
      const n = prev[nodeId];
      dragOffset.current = { x: canvasX - n.x, y: canvasY - n.y };
      return prev;
    });
    setDragId(nodeId);
  }, []);

  const onCanvasMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left + canvas.scrollLeft;
      const cy = e.clientY - rect.top + canvas.scrollTop;

      if (dragId != null) {
        didDragRef.current = true;
        const x = Math.max(0, cx - dragOffset.current.x);
        const y = Math.max(0, cy - dragOffset.current.y);
        setNodes((prev) => ({
          ...prev,
          [dragId]: { ...prev[dragId], x, y },
        }));
      }

      if (connecting) {
        setMousePos({ x: cx, y: cy });
      }
    },
    [dragId, connecting]
  );

  const onCanvasMouseUp = useCallback(() => {
    if (dragId != null) {
      if (!didDragRef.current) {
        // Click without drag — select the node
        setSelectedNodeId(dragId);
      }
      setDragId(null);
    }
  }, [dragId]);

  // ── Port click (connect/disconnect) ───────────────────
  const handlePortClick = useCallback(
    (e, nodeId, portType, portIndex) => {
      e.stopPropagation();

      if (connecting) {
        // Completing a connection
        if (portType === 'input') {
          // Validate: no duplicate, no self-connect
          const from = connecting;
          if (from.fromNodeId === nodeId) {
            setConnecting(null);
            return;
          }
          const exists = connections.some(
            (c) =>
              c.fromNodeId === from.fromNodeId &&
              c.fromPortIndex === from.fromPortIndex &&
              c.toNodeId === nodeId &&
              c.toPortIndex === portIndex
          );
          if (!exists) {
            // Remove any existing connection to this input port
            setConnections((prev) => {
              const filtered = prev.filter(
                (c) => !(c.toNodeId === nodeId && c.toPortIndex === portIndex)
              );
              return [
                ...filtered,
                {
                  id: connId.current++,
                  fromNodeId: from.fromNodeId,
                  fromPortIndex: from.fromPortIndex,
                  toNodeId: nodeId,
                  toPortIndex: portIndex,
                },
              ];
            });
          }
        }
        setConnecting(null);
      } else {
        // Starting a connection
        if (portType === 'output') {
          setConnecting({ fromNodeId: nodeId, fromPortIndex: portIndex });
          // Set initial mouse position to port position
          const node = nodes[nodeId];
          if (node) {
            const pos = getPortPos(node, 'output', portIndex);
            setMousePos(pos);
          }
        } else if (portType === 'input') {
          // Clicking an input removes its connection
          setConnections((prev) =>
            prev.filter(
              (c) => !(c.toNodeId === nodeId && c.toPortIndex === portIndex)
            )
          );
        }
      }
    },
    [connecting, connections, nodes]
  );

  // Cancel connection on canvas click
  const handleCanvasClick = useCallback(
    (e) => {
      if (connecting && e.target === canvasRef.current) {
        setConnecting(null);
      }
    },
    [connecting]
  );

  // ── Panel helpers ────────────────────────────────────
  const toggleSection = useCallback((sectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const filteredCategories = useMemo(() => {
    const q = panelSearch.toLowerCase().trim();
    if (!q) return MODULE_CATEGORIES;
    return MODULE_CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.types.filter((type) => {
        const schema = NODE_SCHEMA[type];
        return (
          schema.label.toLowerCase().includes(q) ||
          schema.desc.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
        );
      }),
    })).filter((cat) => cat.types.length > 0);
  }, [panelSearch]);

  const handlePanelAdd = useCallback(
    (type) => {
      addNode(type);
    },
    [addNode]
  );

  // ── Render helpers ────────────────────────────────────
  const renderCables = () => {
    const paths = [];

    // Existing connections (audio + modulation)
    for (const conn of connections) {
      const fromNode = nodes[conn.fromNodeId];
      const toNode = nodes[conn.toNodeId];
      if (!fromNode || !toNode) continue;

      const from = getPortPos(fromNode, 'output', conn.fromPortIndex);
      const toSchema = NODE_SCHEMA[toNode.type];

      // Modulation cables target a param port; audio cables target an input port
      const to = conn.toParam
        ? getParamPortPos(toNode, toSchema, conn.toParam)
        : getPortPos(toNode, 'input', conn.toPortIndex);

      const accent = NODE_SCHEMA[fromNode.type]?.accent || '#7a7570';
      const isMod = !!conn.toParam;
      const isAudioRateMod = conn.isAudioRate && isMod;

      // Cable styling:
      // - Audio cables: thick, solid, 0.7 opacity
      // - Audio-rate modulation: medium, solid, 0.65 opacity (audio signal for FM/AM)
      // - Control-rate modulation: thin, dashed, 0.6 opacity
      paths.push(
        <path
          key={conn.id}
          d={cablePath(from.x, from.y, to.x, to.y)}
          stroke={accent}
          strokeWidth={isAudioRateMod ? 2 : isMod ? 1.5 : 2.5}
          fill="none"
          opacity={isAudioRateMod ? 0.65 : isMod ? 0.6 : 0.7}
          strokeDasharray={isMod && !isAudioRateMod ? '4 3' : undefined}
          className={`sense-cable${isAudioRateMod ? ' audio-rate-mod' : ''}`}
        />
      );
    }

    // Preview cable while connecting
    if (connecting) {
      const fromNode = nodes[connecting.fromNodeId];
      if (fromNode) {
        const from = getPortPos(fromNode, 'output', connecting.fromPortIndex);
        const accent = NODE_SCHEMA[fromNode.type]?.accent || '#7a7570';
        paths.push(
          <path
            key="preview"
            d={cablePath(from.x, from.y, mousePos.x, mousePos.y)}
            stroke={accent}
            strokeWidth={2}
            fill="none"
            opacity={0.4}
            strokeDasharray="6 4"
          />
        );
      }
    }

    return paths;
  };

  const renderNode = (node) => {
    const schema = NODE_SCHEMA[node.type];
    if (!schema) return null;

    const live = computeLiveNodes(nodes, connections);
    const isLive = live.has(node.id);
    const isAudioOut = node.type === 'audioOut';
    const isFx = schema.category === 'fx';
    const isControl = schema.category === 'control';
    const isScript = schema.category === 'script';
    const isEnvelope = node.type === 'envelope';
    const isBang = node.type === 'bang';
    const isMidiIn = node.type === 'midi_in';
    const nodeWidth = getNodeWidth(node);

    // Check if this module has any modulation output connections
    // (control/script for control-rate, or any audio source for audio-rate)
    const hasModOutput = connections.some(
      (c) => c.fromNodeId === node.id && c.toParam
    );

    // Build set of modulated params on this node
    // Includes both control-rate (from control/script) and audio-rate (isAudioRate) connections
    const modulatedParams = {};
    const audioRateModulatedParams = new Set();
    for (const conn of connections) {
      if (conn.toNodeId !== node.id || !conn.toParam) continue;
      const src = nodes[conn.fromNodeId];
      const srcSchema = NODE_SCHEMA[src?.type];
      const srcCat = srcSchema?.category;

      if (conn.isAudioRate) {
        // Audio-rate modulation (e.g., FM from another oscillator)
        modulatedParams[conn.toParam] = 'audio';
        audioRateModulatedParams.add(conn.toParam);
      } else if (src && (srcCat === 'control' || srcCat === 'script')) {
        // Control-rate modulation — script modules store per-port values as out_N
        const srcValue = srcCat === 'script'
          ? (src.params[`out_${conn.fromPortIndex}`] ?? src.params.value ?? 0)
          : (src.params.value ?? 0);
        modulatedParams[conn.toParam] = srcValue;
      }
    }

    return (
      <div
        key={node.id}
        data-node-id={node.id}
        className={`sense-node${isLive ? ' live' : ''}${isAudioOut ? ' audio-out' : ''}${isFx ? ' fx' : ''}${isControl && !isEnvelope && !isBang && !isMidiIn ? ' control' : ''}${isScript ? ' script' : ''}${isEnvelope ? ' envelope' : ''}${isBang ? ' bang' : ''}${isMidiIn ? ' midi-in' : ''}${node.type === 'scope' ? ` scope scope-${node.scopeMode || 'modern'}` : ''}${hasModOutput ? ' live' : ''}${selectedNodeId === node.id ? ' selected' : ''}${runningScripts.has(node.id) || runningEnvelopes.has(node.id) ? ' running' : ''}${isMidiIn && midiListenersRef.current.has(node.id) ? ' listening' : ''}`}
        style={{
          left: node.x,
          top: node.y,
          width: isBang ? (node.bangSize || 60) + 16 : nodeWidth,
          '--accent': schema.accent,
        }}
        onMouseDown={(e) => startDrag(e, node.id)}
      >
        {/* Audio input ports */}
        {schema.inputs.map((name, i) => (
          <div
            key={`in-${i}`}
            className={`node-port input${connecting ? ' connectable' : ''}`}
            style={{ top: PORT_SECTION_Y + 11 + i * PORT_SPACING - 6 }}
            onClick={(e) => handlePortClick(e, node.id, 'input', i)}
            title={name}
          >
            <span className="port-label port-label-in">{name}</span>
          </div>
        ))}

        {/* Output ports */}
        {getNodeOutputs(node).map((name, i) => (
          <div
            key={`out-${i}`}
            className="node-port output"
            style={{ top: isBang
              ? HEADER_H + 4 + (node.bangSize || 60) / 2 - 4
              : PORT_SECTION_Y + 11 + i * PORT_SPACING - 6 }}
            onClick={(e) => handlePortClick(e, node.id, 'output', i)}
            title={name}
          >
            <span className="port-label port-label-out">{name}</span>
          </div>
        ))}

        {/* Envelope trigger input port (always visible on left edge, centered on canvas) */}
        {isEnvelope && (
          <div
            className={`node-port mod-input trig-port${connecting ? ' connectable' : ''}${'trig' in modulatedParams ? ' modulated' : ''}`}
            style={{ top: HEADER_H + 60 - 4 }}
            onClick={(e) => handleParamPortClick(e, node.id, 'trig')}
            title="trigger input"
          >
            <span className="port-label port-label-in">trig</span>
          </div>
        )}

        {/* Parameter modulation input ports (left edge, aligned with each param row) */}
        {!isControl && !isScript && !isAudioOut && Object.keys(schema.params).map((key, i) => {
          const isModulated = key in modulatedParams;
          const isAudioRateMod = audioRateModulatedParams.has(key);
          const showPort = connecting || isModulated;
          if (!showPort) return null;

          return (
            <div
              key={`mod-${key}`}
              className={`node-port mod-input${connecting ? ' connectable' : ''}${isModulated ? ' modulated' : ''}${isAudioRateMod ? ' audio-rate' : ''}`}
              style={{ top: PARAM_START_Y + i * PARAM_ROW_H + PARAM_ROW_H / 2 - 4 }}
              onClick={(e) => handleParamPortClick(e, node.id, key)}
              title={isAudioRateMod ? `audio mod: ${schema.params[key].label}` : `mod: ${schema.params[key].label}`}
            />
          );
        })}

        {/* Header */}
        <div className="node-header">
          <span className="node-type-label">{schema.label}</span>
          <span className="node-desc">{schema.desc}</span>
          {!isAudioOut && (
            <button
              className="node-remove"
              onClick={() => removeNode(node.id)}
              title="Remove"
            >
              &times;
            </button>
          )}
        </div>

        {/* Bang button */}
        {isBang && (() => {
          const size = node.bangSize || 60;
          const fired = (node.params.value ?? 0) >= 0.5;
          return (
            <div className="bang-body" style={{ padding: '4px 0' }}>
              <div
                className={`bang-circle${fired ? ' fired' : ''}`}
                style={{ width: size, height: size }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleBang(node.id);
                }}
              />
              <div
                className="bang-resize-handle"
                onMouseDown={(e) => handleBangResizeStart(e, node.id, size)}
                title="Drag to resize"
              />
            </div>
          );
        })()}

        {/* Envelope editor */}
        {isEnvelope && (
          <div className="envelope-body">
            <BreakpointEditor
              breakpoints={node.breakpoints || []}
              curves={node.curves || []}
              onChange={(bps, crvs) => handleBreakpointsChange(node.id, bps, crvs)}
              accentColor={schema.accent}
              getPlaybackProgress={getEnvelopeProgress}
              nodeId={node.id}
            />
            <div className="envelope-controls">
              {runningEnvelopes.has(node.id) ? (
                <button
                  className="env-btn env-btn-stop"
                  onClick={() => handleEnvelopeStop(node.id)}
                >
                  Stop
                </button>
              ) : (
                <button
                  className="env-btn env-btn-trig"
                  onClick={() => handleEnvelopeTrigger(node.id)}
                >
                  Trig
                </button>
              )}
              <label className="env-dur">
                <span className="env-dur-label">dur</span>
                <input
                  type="number"
                  min="0.1"
                  max="60"
                  step="0.1"
                  value={node.duration ?? 2}
                  onChange={(e) =>
                    handleEnvelopeDuration(node.id, parseFloat(e.target.value) || 2)
                  }
                />
                <span className="env-dur-unit">s</span>
              </label>
              <label className="env-loop">
                <input
                  type="checkbox"
                  checked={node.loop || false}
                  onChange={(e) => handleEnvelopeLoop(node.id, e.target.checked)}
                />
                <span className="env-loop-label">loop</span>
              </label>
              <span className="env-out-val">
                {(node.params.value ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Scope (oscilloscope) display */}
        {node.type === 'scope' && (
          <>
            <ScopeCanvas
              buffersRef={scopeBuffersRef}
              nodeId={node.id}
              bufferSize={SCOPE_BUFFER_SIZE}
              accentColor={schema.accent}
              mode={node.scopeMode || 'modern'}
            />
            <div className="scope-controls">
              <button
                className="scope-mode-btn"
                onClick={(e) => { e.stopPropagation(); handleScopeModeToggle(node.id); }}
                title={`Switch to ${(node.scopeMode || 'modern') === 'classic' ? 'modern' : 'classic'} mode`}
              >
                {(node.scopeMode || 'modern') === 'classic' ? 'CRT' : 'clean'}
              </button>
            </div>
          </>
        )}

        {/* MIDI input display */}
        {isMidiIn && (
          <div
            className="midi-in-body"
            onClick={() => setSelectedNodeId(node.id)}
            title="Click to configure MIDI input"
          >
            <div className="midi-in-mode-badge">
              {node.midiMode === 'note' ? 'NOTE' : `CC ${node.midiCcNumber}`}
            </div>
            <div className="midi-in-value">
              {(node.params.value ?? 0).toFixed(0)}
            </div>
            <div className="midi-in-channel">
              {node.midiChannel === 0 ? 'omni' : `ch ${node.midiChannel}`}
            </div>
            {(Date.now() - (midiActivity[node.id] || 0)) < 300 && (
              <div className="midi-in-activity" />
            )}
          </div>
        )}

        {/* Parameters (skip hidden params, skip for envelope) */}
        {!isEnvelope && !isBang && Object.keys(schema.params).length > 0 && (
          <div className="node-params">
            {Object.entries(schema.params).map(([key, def]) => {
              if (def.hidden) return null;
              const isModulated = key in modulatedParams;
              const isAudioRateMod = audioRateModulatedParams.has(key);
              // For audio-rate mod, show base value; for control-rate mod, show modulated value
              const displayVal = isAudioRateMod
                ? (node.params[key] ?? def.val)
                : isModulated
                  ? modulatedParams[key]
                  : (node.params[key] ?? def.val);
              // Audio-rate modulated params still use the base value for the slider
              const sliderVal = isAudioRateMod
                ? (node.params[key] ?? def.val)
                : isModulated
                  ? modulatedParams[key]
                  : (node.params[key] ?? def.val);

              return (
                <div className={`node-param${isModulated ? ' modulated' : ''}${isAudioRateMod ? ' audio-rate-mod' : ''}`} key={key}>
                  <span className="param-label">{def.label}</span>
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={sliderVal}
                    disabled={isModulated && !isAudioRateMod}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleParamChange(node.id, key, v);
                    }}
                  />
                  <span className="param-val">
                    {isAudioRateMod
                      ? (key === 'freq' ? 'FM' : key === 'amp' ? 'AM' : 'PM')
                      : key === 'freq' && node.quantize
                        ? freqToNoteName(displayVal)
                        : displayVal >= 100
                          ? Math.round(displayVal)
                          : displayVal.toFixed(
                              def.step < 0.1 ? 2 : def.step < 1 ? 1 : 0
                            )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Script code preview */}
        {isScript && (
          <div
            className="script-code-preview"
            onClick={() => setSelectedNodeId(node.id)}
            title="Click to edit script"
          >
            <code>{(node.code || '').split('\n').slice(0, 3).join('\n') || 'Click to edit…'}</code>
          </div>
        )}

        {/* Script resize handle */}
        {isScript && (
          <div
            className="script-resize-handle"
            onMouseDown={(e) => handleScriptResizeStart(e, node.id, getNodeWidth(node))}
            title="Drag to resize"
          />
        )}

        {/* Live indicator */}
        {(isLive || hasModOutput || runningScripts.has(node.id) || runningEnvelopes.has(node.id)) && <div className="node-live-dot" />}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────
  return (
    <>
      <main className="sense-main">
        {/* Header */}
        <div className="sense-header">
          <h1>Grid View</h1>
          <p>synths &amp; effects · modular signal routing</p>
        </div>

        {/* Toolbar */}
        <div className="sense-toolbar">
          <button
            className={`toolbar-btn boot${booted ? ' booted' : ''}`}
            onClick={handleBoot}
            disabled={booting || booted}
          >
            {booting ? 'Booting…' : booted ? 'Engine Ready' : 'Boot Engine'}
          </button>

          <div className="toolbar-divider" />

          <button
            className={`toolbar-btn panel-toggle${panelOpen ? ' active' : ''}`}
            onClick={() => setPanelOpen((p) => !p)}
            disabled={!booted}
          >
            {panelOpen ? '— Hide Modules' : '+ Add Module'}
          </button>

          <button
            className={`toolbar-btn console-toggle${consoleOpen ? ' active' : ''}`}
            onClick={() => setConsoleOpen((p) => !p)}
            disabled={!booted}
          >
            {consoleOpen ? '— Hide Console' : '> Console'}
          </button>

          <div className="toolbar-divider" />

          <button
            className="toolbar-btn save-btn"
            onClick={handleSavePatch}
            disabled={!booted}
            title="Save patch to JSON file"
          >
            Save
          </button>

          <button
            className="toolbar-btn load-btn"
            onClick={handleLoadPatch}
            disabled={!booted}
            title="Load patch from JSON file"
          >
            Load
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* Canvas */}
        <div
          className={`sense-canvas${connecting ? ' connecting' : ''}`}
          ref={canvasRef}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onClick={handleCanvasClick}
        >
          <svg className="sense-cables" width="2000" height="2000">
            {renderCables()}
          </svg>
          {Object.values(nodes).map((node) => renderNode(node))}

          {Object.keys(nodes).length === 0 && (
            <div className="canvas-empty">
              Boot the engine to begin
            </div>
          )}
          {booted && Object.keys(nodes).length === 1 && (
            <div className="canvas-hint">
              Click "+ Add Module" to open the module panel, then drag cables between ports
            </div>
          )}
        </div>

        {/* Instrument Panel */}
        <div className={`instrument-panel${panelOpen ? ' open' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">Modules</span>
            <button
              className="panel-close"
              onClick={() => setPanelOpen(false)}
            >
              &times;
            </button>
          </div>

          <div className="panel-search">
            <input
              type="text"
              placeholder="Search modules…"
              value={panelSearch}
              onChange={(e) => setPanelSearch(e.target.value)}
              className="panel-search-input"
            />
            {panelSearch && (
              <button
                className="panel-search-clear"
                onClick={() => setPanelSearch('')}
              >
                &times;
              </button>
            )}
          </div>

          <div className="panel-sections">
            {filteredCategories.map((cat) => (
              <div key={cat.id} className="panel-section">
                <button
                  className={`panel-section-header${collapsedSections[cat.id] ? ' collapsed' : ''}`}
                  onClick={() => toggleSection(cat.id)}
                >
                  <span className="section-chevron">
                    {collapsedSections[cat.id] ? '›' : '‹'}
                  </span>
                  <span className="section-label">{cat.label}</span>
                  <span className="section-desc">{cat.desc}</span>
                  <span className="section-count">{cat.types.length}</span>
                </button>

                {!collapsedSections[cat.id] && (
                  <div className="panel-section-items">
                    {cat.types.map((type) => {
                      const schema = NODE_SCHEMA[type];
                      return (
                        <button
                          key={type}
                          className="panel-module-item"
                          style={{ '--item-accent': schema.accent }}
                          onClick={() => handlePanelAdd(type)}
                        >
                          <span
                            className="module-item-dot"
                          />
                          <span className="module-item-info">
                            <span className="module-item-label">{schema.label}</span>
                            <span className="module-item-desc">{schema.desc}</span>
                          </span>
                          <span className="module-item-add">+</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <div className="panel-empty">No modules match "{panelSearch}"</div>
            )}
          </div>
        </div>

        {/* Module Details Panel */}
        {(() => {
          const selNode = selectedNodeId != null ? nodes[selectedNodeId] : null;
          const selSchema = selNode ? NODE_SCHEMA[selNode.type] : null;
          const isOpen = selNode != null;

          return (
            <div className={`module-details-panel${isOpen ? ' open' : ''}`}>
              {selNode && selSchema && (
                <>
                  <div className="details-header">
                    <div className="details-title-row">
                      <span
                        className="details-accent-dot"
                        style={{ background: selSchema.accent }}
                      />
                      <span className="details-title">{selSchema.label}</span>
                      <span className="details-desc">{selSchema.desc}</span>
                    </div>
                    <button
                      className="details-close"
                      onClick={() => setSelectedNodeId(null)}
                    >
                      &times;
                    </button>
                  </div>

                  {selNode.type === 'envelope' ? (
                    <div className="details-body">
                      <div className="details-placeholder">
                        Edit the envelope directly on the canvas.
                        <br /><br />
                        Click to add breakpoints, drag to move them.
                        Double-click a point to remove it.
                        Drag a curve segment up/down to adjust curvature.
                      </div>
                    </div>
                  ) : selSchema.category === 'script' ? (
                    <div className="details-body">
                      <div className="script-editor-section">
                        <div className="script-editor-header">
                          <span className="script-editor-label">Code</span>
                          <span className="script-editor-hint">
                            Write routines &amp; patterns
                          </span>
                        </div>
                        <div className="script-editor-wrap">
                          <CodeMirror
                            value={selNode.code || ''}
                            onChange={(val) => handleCodeChange(selNode.id, val)}
                            theme={oraTheme}
                            extensions={[javascript()]}
                            basicSetup={{
                              lineNumbers: true,
                              highlightActiveLineGutter: true,
                              highlightActiveLine: true,
                              foldGutter: false,
                              dropCursor: true,
                              allowMultipleSelections: false,
                              bracketMatching: true,
                              closeBrackets: true,
                              autocompletion: true,
                              indentOnInput: true,
                              tabSize: 2,
                            }}
                            className="script-editor-cm"
                            placeholder="// setOutputs(n) — declare n output ports&#10;// out(value) or out(index, value)"
                          />
                        </div>
                      </div>

                      {/* Run / Stop controls */}
                      <div className="script-controls">
                        {runningScripts.has(selNode.id) ? (
                          <button
                            className="script-btn script-btn-stop"
                            onClick={() => handleStopScript(selNode.id)}
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            className="script-btn script-btn-run"
                            onClick={() =>
                              handleRunScript(selNode.id, selNode.code || '')
                            }
                          >
                            Run
                          </button>
                        )}
                        <div className="script-output-live">
                          {(selNode.numOutputs ?? 1) > 1 ? (
                            Array.from({ length: selNode.numOutputs }, (_, i) => (
                              <div key={i} className="script-output-live-row">
                                <span className="script-output-live-label">out {i}</span>
                                <span className={`script-output-live-val${runningScripts.has(selNode.id) ? ' active' : ''}`}>
                                  {(selNode.params[`out_${i}`] ?? 0).toFixed(2)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <>
                              <span className="script-output-live-label">out</span>
                              <span className={`script-output-live-val${runningScripts.has(selNode.id) ? ' active' : ''}`}>
                                {(selNode.params.out_0 ?? selNode.params.value ?? 0).toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Console log */}
                      <div className="script-console">
                        <div className="script-console-header">
                          <span className="script-console-label">Console</span>
                          <button
                            className="script-console-clear"
                            onClick={() =>
                              setScriptLogs((prev) => ({
                                ...prev,
                                [selNode.id]: [],
                              }))
                            }
                          >
                            clear
                          </button>
                        </div>
                        <div className="script-console-output">
                          {(scriptLogs[selNode.id] || []).map((line, i) => (
                            <div key={i} className="script-console-line">
                              {line}
                            </div>
                          ))}
                          {(scriptLogs[selNode.id] || []).length === 0 && (
                            <div className="script-console-empty">
                              output will appear here
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : selNode.type === 'sine_osc' ? (
                    <div className="details-body">
                      <div className="sine-osc-options">
                        <label className="sine-osc-quantize">
                          <input
                            type="checkbox"
                            checked={selNode.quantize || false}
                            onChange={(e) =>
                              handleQuantizeToggle(selNode.id, e.target.checked)
                            }
                          />
                          <span className="sine-osc-quantize-label">
                            Quantize frequency to nearest note
                          </span>
                        </label>
                        {selNode.quantize && (
                          <div className="sine-osc-quantize-info">
                            {freqToNoteName(selNode.params.freq ?? 440)}
                            {' · '}
                            {quantizeFreq(selNode.params.freq ?? 440).toFixed(2)} Hz
                          </div>
                        )}
                      </div>
                    </div>
                  ) : selNode.type === 'print' ? (
                    <div className="details-body">
                      <div className="print-options">
                        <div className="print-option">
                          <label className="print-label">Prefix</label>
                          <input
                            type="text"
                            className="print-prefix-input"
                            value={selNode.printPrefix ?? 'print'}
                            onChange={(e) =>
                              handlePrintPrefix(selNode.id, e.target.value)
                            }
                            placeholder="prefix"
                          />
                        </div>
                        <div className="print-option">
                          <label className="print-label">Color</label>
                          <input
                            type="color"
                            className="print-color-input"
                            value={selNode.printColor || '#e07050'}
                            onChange={(e) =>
                              handlePrintColor(selNode.id, e.target.value)
                            }
                          />
                          <span
                            className="print-color-preview"
                            style={{ color: selNode.printColor || '#e07050' }}
                          >
                            {selNode.printPrefix ?? 'print'}
                          </span>
                        </div>
                        <div className="print-hint">
                          Connect a signal to this module's input to log its values to the console.
                        </div>
                      </div>
                    </div>
                  ) : selNode.type === 'scope' ? (
                    <div className="details-body">
                      <div className="scope-details-options">
                        <div className="scope-mode-option">
                          <span className="scope-mode-label">Display mode</span>
                          <div className="scope-mode-toggle-group">
                            <button
                              className={`scope-mode-choice${(selNode.scopeMode || 'modern') === 'classic' ? ' active' : ''}`}
                              onClick={() => setNodes((prev) => ({
                                ...prev,
                                [selNode.id]: { ...prev[selNode.id], scopeMode: 'classic' },
                              }))}
                            >
                              Classic
                            </button>
                            <button
                              className={`scope-mode-choice${(selNode.scopeMode || 'modern') === 'modern' ? ' active' : ''}`}
                              onClick={() => setNodes((prev) => ({
                                ...prev,
                                [selNode.id]: { ...prev[selNode.id], scopeMode: 'modern' },
                              }))}
                            >
                              Modern
                            </button>
                          </div>
                        </div>
                        <div className="scope-mode-desc">
                          {(selNode.scopeMode || 'modern') === 'classic'
                            ? 'CRT phosphor glow with persistence trail and graticule grid.'
                            : 'Clean utility trace with filled area, matching the app aesthetic.'}
                        </div>
                        <div className="print-hint">
                          Connect a signal source to visualize the waveform.
                          Displays values at ~30 Hz — ideal for envelopes, LFOs, and amplitude changes.
                        </div>
                      </div>
                    </div>
                  ) : selNode.type === 'midi_in' ? (
                    <div className="details-body">
                      <div className="midi-details">
                        {/* Mode selector: CC or Note */}
                        <div className="midi-option">
                          <span className="midi-label">Mode</span>
                          <div className="midi-mode-toggle-group">
                            <button
                              className={`midi-mode-choice${(selNode.midiMode || 'cc') === 'cc' ? ' active' : ''}`}
                              onClick={() => setNodes((prev) => ({
                                ...prev,
                                [selNode.id]: { ...prev[selNode.id], midiMode: 'cc' },
                              }))}
                            >
                              CC
                            </button>
                            <button
                              className={`midi-mode-choice${(selNode.midiMode || 'cc') === 'note' ? ' active' : ''}`}
                              onClick={() => setNodes((prev) => ({
                                ...prev,
                                [selNode.id]: { ...prev[selNode.id], midiMode: 'note' },
                              }))}
                            >
                              Note
                            </button>
                          </div>
                        </div>

                        {/* CC Number (only in CC mode) */}
                        {(selNode.midiMode || 'cc') === 'cc' && (
                          <div className="midi-option">
                            <span className="midi-label">CC #</span>
                            <input
                              type="number"
                              className="midi-cc-input"
                              min={0}
                              max={127}
                              value={selNode.midiCcNumber ?? 1}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(127, parseInt(e.target.value) || 0));
                                setNodes((prev) => ({
                                  ...prev,
                                  [selNode.id]: { ...prev[selNode.id], midiCcNumber: v },
                                }));
                              }}
                            />
                          </div>
                        )}

                        {/* Channel selector */}
                        <div className="midi-option">
                          <span className="midi-label">Channel</span>
                          <select
                            className="midi-channel-select"
                            value={selNode.midiChannel ?? 0}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setNodes((prev) => ({
                                ...prev,
                                [selNode.id]: { ...prev[selNode.id], midiChannel: v },
                              }));
                            }}
                          >
                            <option value={0}>Omni (all)</option>
                            {Array.from({ length: 16 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                Channel {i + 1}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Device selector */}
                        <div className="midi-option">
                          <span className="midi-label">Device</span>
                          <select
                            className="midi-device-select"
                            value={selNode.midiDeviceId || ''}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              setNodes((prev) => ({
                                ...prev,
                                [selNode.id]: { ...prev[selNode.id], midiDeviceId: v },
                              }));
                            }}
                          >
                            <option value="">Any device</option>
                            {midiDevices.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Current value display */}
                        <div className="midi-value-display">
                          <span className="midi-value-label">Output</span>
                          <span className="midi-value-num">
                            {(selNode.params.value ?? 0).toFixed(0)}
                          </span>
                          {selNode.midiMode === 'note' && selNode.midiLastNote != null && (
                            <span className="midi-note-info">
                              {NOTE_NAMES[((selNode.midiLastNote % 12) + 12) % 12]}
                              {Math.floor(selNode.midiLastNote / 12) - 1}
                              {selNode.midiGate ? ' ON' : ' OFF'}
                            </span>
                          )}
                        </div>

                        <div className="midi-hint">
                          {(selNode.midiMode || 'cc') === 'cc'
                            ? `Outputs CC ${selNode.midiCcNumber ?? 1} values (0\u2013127). Connect the output to modulate any parameter.`
                            : 'Outputs the MIDI note number (0\u2013127) on note-on events. Connect the output to control pitch or other parameters.'}
                        </div>

                        {midiDevices.length === 0 && (
                          <div className="midi-no-devices">
                            No MIDI devices detected. Connect a MIDI controller and refresh.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="details-body">
                      <div className="details-placeholder">
                        Select a Script module to edit code,
                        or use the node controls directly on the canvas.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Print Console Panel */}
        <div className={`print-console-panel${consoleOpen ? ' open' : ''}`}>
          <div className="print-console-header">
            <span className="print-console-title">Console</span>
            <div className="print-console-actions">
              <button
                className="print-console-clear"
                onClick={clearPrintLogs}
              >
                clear
              </button>
              <button
                className="print-console-close"
                onClick={() => setConsoleOpen(false)}
              >
                &times;
              </button>
            </div>
          </div>
          <div className="print-console-output" ref={printConsoleRef}>
            {printLogs.map((entry) => (
              <div key={entry.id} className="print-console-line">
                <span className="print-console-time">{entry.time}</span>
                <span
                  className="print-console-prefix"
                  style={{ color: entry.color }}
                >
                  [{entry.prefix}]
                </span>
                <span className="print-console-value">{entry.value}</span>
              </div>
            ))}
            {printLogs.length === 0 && (
              <div className="print-console-empty">
                Add a Print module and connect a signal to see values here
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="sense-status">
          <div className={`status-indicator${booted ? ' on' : ''}`} />
          <span>{status}</span>
        </div>

        {/* Footer */}
        <div className="sense-footer">
          <a href="/">← Ambient</a>
          {' · '}
          <a href="/test">Test Lab</a>
          {' · '}
          Grid View — modular signal routing
        </div>
      </main>
    </>
  );
}
