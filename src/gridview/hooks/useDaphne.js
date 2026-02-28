import { useState, useRef, useEffect, useCallback } from 'react';

// ── System prompt with ORA context ──────────────────────
const SYSTEM_PROMPT = `You are an AI assistant embedded in ORA-FM, a browser-based ambient music application built with SuperSonic (SuperCollider's scsynth compiled to WASM). You help users understand synthesis concepts and build patches in the ORA grid view.

## ORA Grid System

The grid view is a modular synthesis environment. Users create nodes, connect them with cables, and route audio/modulation between them.

### Available Node Types

**Oscillators** (sound sources):
- sine_osc — modulatable sine wave (params: freq, amp, phase)
- saw_osc — modulatable sawtooth (params: freq, amp)
- pulse_osc — modulatable pulse wave (params: freq, amp, width)
- tri_osc — modulatable triangle (params: freq, amp)
- blip_osc — band-limited impulse (params: freq, amp, numharm)
- formant_osc — formant oscillator (params: fundfreq, formfreq, bwfreq, amp)

**Instruments** (envelope-shaped voices):
- sine — pure sine tone (params: note, amp, attack, sustain, release)
- bell — metallic bell (params: note, amp, attack, sustain, release, decay)
- blade — detuned saw pad (params: note, amp, attack, sustain, release)
- pluck — Karplus-Strong pluck (params: note, amp, attack, sustain, release)
- pad — dark ambience pad (params: note, amp, attack, sustain, release)
- hollow — hollow resonant texture (params: note, amp, attack, sustain, release)
- noise — brown 1/f² noise (params: amp, attack, sustain, release)

**Filters** (frequency shaping, category: fx):
- fx_lpf — low-pass (params: freq, in_amp)
- fx_hpf — high-pass (params: freq, in_amp)
- fx_bpf — band-pass (params: freq, rq, in_amp)
- fx_rlpf — resonant low-pass (params: freq, rq, in_amp)
- fx_moog — Moog ladder filter (params: freq, gain, in_amp)
- resonz — resonant bandpass (params: freq, bwr, in_amp)
- And normalized variants: fx_nlpf, fx_nhpf, fx_nbpf, fx_nrlpf, fx_nrhpf, fx_nrbpf, fx_moogff

**Effects** (time & space, category: fx):
- fx_reverb — reverb (params: room, damp, mix, in_amp)
- fx_echo — echo delay (params: delay, decay, mix, in_amp)
- fx_distortion — waveshaping (params: drive, mix, in_amp)
- fx_flanger — flanger (params: rate, depth, mix, feedback, in_amp)
- comb — comb filter (params: freq, decay, in_amp)

**Control** (modulation sources):
- constant — fixed value output (params: value)
- envelope — breakpoint envelope with trigger input (params: value, trig)
- bang — manual trigger button (params: value)
- midi_in — MIDI controller input (params: value)

**Utility**:
- multiply — signal multiplier (params: factor)
- print — value logger
- scope — oscilloscope display
- audioOut — master stereo output (required, one per patch)

**Scripting**:
- script — JavaScript code module for patterns & sequences

### Patch JSON Format

When asked to create a preset/patch, output valid JSON in this exact format:

\`\`\`json
{
  "name": "Patch Name",
  "version": 1,
  "createdAt": "<ISO 8601 timestamp>",
  "nextId": <next available node ID>,
  "connId": <next available connection ID>,
  "nodes": [
    {
      "id": <unique int>,
      "type": "<node type from list above>",
      "x": <canvas x position>,
      "y": <canvas y position>,
      "params": { "<param>": <value>, ... }
    }
  ],
  "connections": [
    {
      "id": <unique int>,
      "from": <source node id>,
      "fromPort": <source port index, usually 0>,
      "to": <target node id>,
      "toPort": <target port index for audio, or -1 for param modulation>,
      "toParam": "<param name if modulating a param>",
      "isAudioRate": <true if audio-rate modulation>
    }
  ]
}
\`\`\`

### Connection Rules
- Audio routing: fromPort 0 → toPort 0 (audio input)
- Parameter modulation: fromPort 0 → toPort -1, with toParam set to the parameter name
- Audio-rate modulation (oscillator→param): set isAudioRate: true
- Control-rate modulation (envelope/constant/script→param): omit isAudioRate or set false
- Every patch needs exactly one audioOut node
- Source nodes connect to fx nodes which connect to audioOut
- Place nodes with ~200px spacing for readability

### Script Module API
Scripts run in a sandbox. Available functions:
- out(value) — set output value
- pattern(values, durations) — cycling pattern
- tuplet(divisions, duration) — nested rhythmic subdivisions
- routine(function*() {...}) — generator-based sequencer
- lfo(rate, min, max) — sine LFO
- ramp(from, to, duration) — linear interpolation
- random(min, max), randomInt(min, max)
- Note constants: C4, Cs4, D4, etc.
- r (rest), _ (tie), w(weight, content) for tuplets

## Response Guidelines
- When asked about synthesis, explain clearly with ORA-specific examples
- When asked to create a patch, output the complete JSON inside a \`\`\`json code block
- Keep explanations concise but informative
- Reference specific node types and parameters from the schema above
- If creating a patch, lay out nodes left-to-right: sources → effects → audioOut`;

/**
 * Extract a valid ORA patch JSON object from a markdown response.
 * Looks for ```json code blocks containing nodes + connections.
 */
export function extractPatchJson(text) {
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.nodes && parsed.connections) {
        return parsed;
      }
    } catch {
      // Not valid JSON, try next block
    }
  }
  return null;
}

/**
 * useDaphne — manages AI chat state and Claude API communication.
 *
 * Returns state and handlers consumed by DaphnePanel (presentation)
 * and GridView (patch loading).
 */
export function useDaphne({ applyPatchData }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [daphneOpen, setDaphneOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (daphneOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [daphneOpen]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`API error ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const assistantText =
        data.content?.[0]?.text || data.content?.text || 'No response';

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantText },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const handleLoadPatch = useCallback(
    (msgContent) => {
      const patch = extractPatchJson(msgContent);
      if (patch && applyPatchData) {
        applyPatchData(patch);
      }
    },
    [applyPatchData]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    // Panel state
    daphneOpen,
    setDaphneOpen,
    // Chat state
    messages,
    input,
    setInput,
    loading,
    error,
    // Refs (passed to DaphnePanel)
    messagesEndRef,
    inputRef,
    // Handlers
    sendMessage,
    handleKeyDown,
    handleLoadPatch,
    clearChat,
  };
}
