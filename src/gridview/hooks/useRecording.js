import { useState, useRef, useCallback, useEffect } from 'react';

export function useRecording({ engineRef, setStatus }) {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef(null);
  const recChunksRef = useRef([]);
  const recTimerRef = useRef(null);
  const recStreamDestRef = useRef(null);

  const handleToggleRecording = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (recording) {
      // ── Stop recording ──
      recorderRef.current?.stop();
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
      setRecording(false);
      setRecordingTime(0);
      return;
    }

    // ── Start recording ──
    const ctx = engine.getAudioContext();
    const outputNode = engine.getOutputNode();
    if (!ctx || !outputNode) {
      setStatus('Cannot record — audio engine not ready');
      return;
    }

    // Create (or reuse) a MediaStreamDestination
    if (!recStreamDestRef.current) {
      recStreamDestRef.current = ctx.createMediaStreamDestination();
      outputNode.connect(recStreamDestRef.current);
    }

    recChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(recStreamDestRef.current.stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recChunksRef.current, { type: mimeType });
      const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ora-recording-${ts}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Recording saved');
    };

    recorder.start(250);
    setRecording(true);
    setRecordingTime(0);
    setStatus('Recording…');

    // Elapsed-time timer (ticks every second)
    const t0 = Date.now();
    recTimerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
  }, [recording]);

  // Clean up recording on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      clearInterval(recTimerRef.current);
    };
  }, []);

  return { recording, recordingTime, handleToggleRecording };
}
