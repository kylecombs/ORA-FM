import { useState, useRef, useCallback } from 'react';

export function useSamplePlayer({ engineRef, setNodes, setStatus }) {
  // Sample player state
  const [sampleData, setSampleData] = useState({}); // nodeId -> { audioData: Float32Array, name: string, duration: number, channels: number }
  const [samplePlayheads, setSamplePlayheads] = useState({}); // nodeId -> { trigTime, rate, startPos, endPos, loop, duration }
  const sampleFileInputRef = useRef(null);
  const sampleLoadTargetRef = useRef(null); // nodeId being loaded for

  // Handle file selection for sample loading
  const handleSampleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    const nodeId = sampleLoadTargetRef.current;
    if (!file || nodeId == null) return;
    e.target.value = ''; // reset input

    const engine = engineRef.current;
    if (!engine?.booted) return;

    try {
      console.log(`[SamplePlayer:FILE] Loading file "${file.name}" (${file.size} bytes, type=${file.type}) for nodeId=${nodeId}`);

      // Read file as ArrayBuffer for both decoding and sending to engine
      const arrayBuf = await file.arrayBuffer();
      console.log(`[SamplePlayer:FILE] ArrayBuffer read: ${arrayBuf.byteLength} bytes`);

      // Decode audio for waveform display
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      audioCtx.close();
      console.log(`[SamplePlayer:FILE] Decoded: ${decoded.numberOfChannels}ch, ${decoded.sampleRate}Hz, ${decoded.duration.toFixed(2)}s, ${decoded.length} frames`);

      // Mix down to mono for waveform display
      const ch0 = decoded.getChannelData(0);
      let mono;
      if (decoded.numberOfChannels >= 2) {
        const ch1 = decoded.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) {
          mono[i] = (ch0[i] + ch1[i]) * 0.5;
        }
      } else {
        mono = ch0;
      }

      // Load into engine buffer
      const data = new Uint8Array(arrayBuf);
      console.log(`[SamplePlayer:FILE] Sending ${data.length} bytes to engine.loadSampleBuffer(nodeId=${nodeId})`);
      const bufNum = engine.loadSampleBuffer(nodeId, data);
      console.log(`[SamplePlayer:FILE] Buffer allocated: bufNum=${bufNum}`);

      // Store waveform data
      setSampleData((prev) => ({
        ...prev,
        [nodeId]: {
          audioData: mono,
          name: file.name.replace(/\.[^.]+$/, ''),
          duration: decoded.duration,
          channels: decoded.numberOfChannels,
          bufNum,
        },
      }));

      // Update the synth's buf parameter if playing
      if (bufNum != null) {
        console.log(`[SamplePlayer:FILE] Setting buf param on synth: nodeId=${nodeId}, buf=${bufNum}`);
        console.log(`[SamplePlayer:FILE] Synth active for nodeId=${nodeId}?`, engine.isPlaying(nodeId));
        engine.setParam(nodeId, 'buf', bufNum);
      } else {
        console.warn(`[SamplePlayer:FILE] bufNum is null! Cannot set buf param`);
      }

      // Reset region to full sample
      setNodes((prev) => {
        const node = prev[nodeId];
        if (!node) return prev;
        return {
          ...prev,
          [nodeId]: {
            ...node,
            params: { ...node.params, start_pos: 0, end_pos: 1 },
            sampleName: file.name.replace(/\.[^.]+$/, ''),
          },
        };
      });
      console.log(`[SamplePlayer:FILE] ✅ File load complete for nodeId=${nodeId}`);
    } catch (err) {
      console.error('[SamplePlayer:FILE] Failed to load sample:', err);
      setStatus?.(`Error loading sample: ${err.message}`);
    }
  }, [engineRef, setNodes, setStatus]);

  // Load a built-in sample
  const handleLoadBuiltinSample = useCallback(async (nodeId, sampleName) => {
    const engine = engineRef.current;
    if (!engine?.booted) return;

    try {
      console.log(`[SamplePlayer:BUILTIN] Loading "${sampleName}" for nodeId=${nodeId}`);

      // Fetch and decode for waveform display
      const resp = await fetch(`/supersonic/samples/${sampleName}.flac`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuf = await resp.arrayBuffer();
      console.log(`[SamplePlayer:BUILTIN] Fetched "${sampleName}.flac": ${arrayBuf.byteLength} bytes`);

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      audioCtx.close();
      console.log(`[SamplePlayer:BUILTIN] Decoded: ${decoded.numberOfChannels}ch, ${decoded.sampleRate}Hz, ${decoded.duration.toFixed(2)}s, ${decoded.length} frames`);

      const ch0 = decoded.getChannelData(0);
      let mono;
      if (decoded.numberOfChannels >= 2) {
        const ch1 = decoded.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5;
      } else {
        mono = ch0;
      }

      // Load into engine
      const bufNum = await engine.loadBuiltinSample(nodeId, sampleName);
      console.log(`[SamplePlayer:BUILTIN] Buffer allocated: bufNum=${bufNum}`);

      setSampleData((prev) => ({
        ...prev,
        [nodeId]: {
          audioData: mono,
          name: sampleName,
          duration: decoded.duration,
          channels: decoded.numberOfChannels,
          bufNum,
        },
      }));

      if (bufNum != null) {
        console.log(`[SamplePlayer:BUILTIN] Setting buf param: nodeId=${nodeId}, buf=${bufNum}`);
        console.log(`[SamplePlayer:BUILTIN] Synth active for nodeId=${nodeId}?`, engine.isPlaying(nodeId));
        engine.setParam(nodeId, 'buf', bufNum);
      } else {
        console.warn(`[SamplePlayer:BUILTIN] bufNum is null! Cannot set buf param`);
      }

      setNodes((prev) => {
        const node = prev[nodeId];
        if (!node) return prev;
        return {
          ...prev,
          [nodeId]: {
            ...node,
            params: { ...node.params, start_pos: 0, end_pos: 1 },
            sampleName,
          },
        };
      });
      console.log(`[SamplePlayer:BUILTIN] ✅ Builtin sample load complete for nodeId=${nodeId}`);
    } catch (err) {
      console.error(`[SamplePlayer:BUILTIN] Failed to load "${sampleName}":`, err);
      setStatus?.(`Error loading sample: ${err.message}`);
    }
  }, [engineRef, setNodes, setStatus]);

  // Handle region change on waveform
  const handleSampleRegionChange = useCallback((nodeId, start, end) => {
    console.log(`[SamplePlayer:REGION] nodeId=${nodeId}, start=${start.toFixed(3)}, end=${end.toFixed(3)}`);
    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) return prev;
      return {
        ...prev,
        [nodeId]: {
          ...node,
          params: { ...node.params, start_pos: start, end_pos: end },
        },
      };
    });
    engineRef.current?.setParam(nodeId, 'start_pos', start);
    engineRef.current?.setParam(nodeId, 'end_pos', end);
  }, [engineRef, setNodes]);

  // Trigger sample playback
  const handleSampleTrigger = useCallback((nodeId) => {
    const engine = engineRef.current;
    if (!engine?.booted) {
      console.warn(`[SamplePlayer:TRIG] Engine not booted, ignoring trigger for nodeId=${nodeId}`);
      return;
    }
    const sd = sampleData[nodeId];
    console.log(`[SamplePlayer:TRIG] Triggering nodeId=${nodeId}, hasSampleData=${!!sd}, bufNum=${sd?.bufNum ?? 'NONE'}, isPlaying=${engine.isPlaying(nodeId)}`);
    engine.triggerSample(nodeId);

    // Track playhead animation
    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) return prev;
      const sd = sampleData[nodeId];
      const startPos = node.params.start_pos ?? 0;
      const endPos = node.params.end_pos ?? 1;
      const rate = node.params.rate ?? 1;
      const loop = node.params.loop ?? 1;
      const duration = sd?.duration ?? 1;

      setSamplePlayheads((ph) => ({
        ...ph,
        [nodeId]: {
          trigTime: performance.now(),
          rate,
          startPos,
          endPos,
          loop: loop > 0.5,
          duration,
        },
      }));
      return prev;
    });
  }, [engineRef, sampleData, setNodes]);

  // Toggle loop
  const handleSampleLoopToggle = useCallback((nodeId) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) return prev;
      const newLoop = (node.params.loop ?? 1) > 0.5 ? 0 : 1;
      engineRef.current?.setParam(nodeId, 'loop', newLoop);
      return {
        ...prev,
        [nodeId]: {
          ...node,
          params: { ...node.params, loop: newLoop },
        },
      };
    });
  }, [engineRef, setNodes]);

  // Clean up sample data when a node is removed
  const cleanupSamplePlayer = useCallback((nodeId) => {
    setSampleData((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    setSamplePlayheads((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    engineRef.current?.freeBuffer(nodeId);
  }, [engineRef]);

  return {
    sampleData,
    samplePlayheads,
    sampleFileInputRef,
    sampleLoadTargetRef,
    handleSampleFileSelect,
    handleLoadBuiltinSample,
    handleSampleRegionChange,
    handleSampleTrigger,
    handleSampleLoopToggle,
    cleanupSamplePlayer,
  };
}
