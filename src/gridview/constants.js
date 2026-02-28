import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';

// ── CodeMirror theme matching the app's dark palette ─────
export const oraTheme = createTheme({
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

// ── Layout constants ──────────────────────────────────────
export const NODE_W = 186;
export const HEADER_H = 32;
export const PORT_SECTION_Y = HEADER_H + 2;
export const PORT_SPACING = 22;
export const PARAM_START_Y = HEADER_H + 1 + 6; // header + border + top padding
export const PARAM_ROW_H = 18;

// ── Scope display constants ──────────────────────────────
export const SCOPE_W = 260;
export const SCOPE_H = 140;
export const SCOPE_DISPLAY_SAMPLES = 512;
export const SCOPE_BUFFER_SIZE = 1024;

// ── Default scaling factors for audio-rate modulation depth ──
export const MOD_DEPTH_SCALES = {
  freq:     400,    // amp 0.5 → ±200 Hz frequency deviation (audible FM)
  amp:      1,      // amp 0.5 → ±0.5 amplitude modulation (full-depth AM)
  phase:    6.283,  // amp 0.5 → ±π radians phase modulation (full PM)
  width:    1,      // amp 0.5 → ±0.5 pulse width modulation (full PWM)
  numharm:  40,     // amp 0.5 → ±20 harmonics variation (timbral FM)
  formfreq: 400,    // amp 0.5 → ±200 Hz formant deviation
  bwfreq:   400,    // amp 0.5 → ±200 Hz bandwidth deviation
  density:  20,     // amp 0.5 → ±10 impulses/sec density variation
  chaos:    0.5,    // amp 0.5 → ±0.25 chaos param deviation (range 1–2)
  timbre:   1,      // amp 0.5 → ±0.5 waveshape morph (full range)
  level:    1,      // amp 0.5 → ±0.5 gate level modulation (full range)
  gate:     1,      // amp 0.5 → ±0.5 gate CV modulation (full range)
};
