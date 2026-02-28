import { useRef, useEffect, useCallback, useState } from 'react';
import './WaveformDisplay.css';

// ── Waveform display with region selection ──────────────
// Renders the PCM waveform of a loaded sample and allows
// the user to select a playback region by dragging handles.
//
// Props:
//   audioData      Float32Array of mono-mixed PCM samples (or null)
//   startPos       0-1 normalised region start
//   endPos         0-1 normalised region end
//   onRegionChange (start, end) => void
//   accentColor    CSS hex color
//   width          canvas width in px
//   height         canvas height in px
//   playheadState  { trigTime, rate, startPos, endPos, loop, duration } or null
//   sampleName     display name for the sample

const HANDLE_W = 6;

export default function WaveformDisplay({
  audioData,
  startPos = 0,
  endPos = 1,
  onRegionChange,
  accentColor = '#c89a60',
  width = 258,
  height = 80,
  playheadState = null,
  sampleName = null,
}) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const animRef = useRef(null);
  const playheadRef = useRef(playheadState);
  const dragging = useRef(null); // 'start' | 'end' | 'region' | null
  const dragStart = useRef({ x: 0, startVal: 0, endVal: 0 });

  // Keep ref in sync with prop (ref is read by the RAF loop without re-renders)
  playheadRef.current = playheadState;

  // Parse accent color for rgba
  const r = parseInt(accentColor.slice(1, 3), 16);
  const g = parseInt(accentColor.slice(3, 5), 16);
  const b = parseInt(accentColor.slice(5, 7), 16);
  const rgba = (a) => `rgba(${r},${g},${b},${a})`;

  // ── Draw the static waveform + region (no playhead) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = width;
    const h = height;

    // Background
    ctx.fillStyle = '#0e0d0c';
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(122, 117, 112, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h / 2) + 0.5);
    ctx.lineTo(w, Math.round(h / 2) + 0.5);
    ctx.stroke();

    if (!audioData || audioData.length === 0) {
      // Empty state
      ctx.fillStyle = 'rgba(122, 117, 112, 0.3)';
      ctx.font = '9px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('load a sample', w / 2, h / 2 + 3);
      return;
    }

    const len = audioData.length;
    const mid = h / 2;

    // Draw unselected region (dimmed waveform)
    ctx.fillStyle = 'rgba(122, 117, 112, 0.15)';
    const samplesPerPx = len / w;
    for (let px = 0; px < w; px++) {
      const i0 = Math.floor(px * samplesPerPx);
      const i1 = Math.floor((px + 1) * samplesPerPx);
      let min = 0, max = 0;
      for (let i = i0; i < i1 && i < len; i++) {
        const v = audioData[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yTop = mid - max * mid;
      const yBot = mid - min * mid;
      ctx.fillRect(px, yTop, 1, Math.max(1, yBot - yTop));
    }

    // Draw selected region (bright waveform)
    const selStart = Math.floor(startPos * w);
    const selEnd = Math.floor(endPos * w);

    // Region background
    ctx.fillStyle = rgba(0.06);
    ctx.fillRect(selStart, 0, selEnd - selStart, h);

    // Bright waveform in region
    ctx.fillStyle = rgba(0.7);
    for (let px = selStart; px < selEnd; px++) {
      const i0 = Math.floor(px * samplesPerPx);
      const i1 = Math.floor((px + 1) * samplesPerPx);
      let min = 0, max = 0;
      for (let i = i0; i < i1 && i < len; i++) {
        const v = audioData[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yTop = mid - max * mid;
      const yBot = mid - min * mid;
      ctx.fillRect(px, yTop, 1, Math.max(1, yBot - yTop));
    }

    // Region boundary lines
    ctx.strokeStyle = rgba(0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(selStart + 0.5, 0);
    ctx.lineTo(selStart + 0.5, h);
    ctx.moveTo(selEnd - 0.5, 0);
    ctx.lineTo(selEnd - 0.5, h);
    ctx.stroke();

    // Handle tabs at top
    ctx.fillStyle = rgba(0.9);
    // Start handle
    ctx.fillRect(selStart, 0, HANDLE_W, 10);
    // End handle
    ctx.fillRect(selEnd - HANDLE_W, 0, HANDLE_W, 10);

    // Sample name label
    if (sampleName) {
      ctx.fillStyle = 'rgba(212, 207, 200, 0.4)';
      ctx.font = '8px "DM Mono", monospace';
      ctx.textAlign = 'left';
      const displayName = sampleName.length > 30
        ? sampleName.slice(0, 27) + '...'
        : sampleName;
      ctx.fillText(displayName, 4, h - 4);
    }
  }, [audioData, startPos, endPos, accentColor, width, height, sampleName]);

  // ── Playhead animation loop (decoupled from React renders) ──
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    const w = width;
    const h = height;

    const drawPlayhead = () => {
      ctx.clearRect(0, 0, w, h);

      const ph = playheadRef.current;
      if (ph) {
        const elapsed = (performance.now() - ph.trigTime) / 1000;
        const regionDur = (ph.endPos - ph.startPos) * ph.duration / Math.abs(ph.rate || 1);

        let pos = null;
        if (regionDur > 0) {
          if (ph.loop) {
            const progress = (elapsed % regionDur) / regionDur;
            pos = ph.startPos + progress * (ph.endPos - ph.startPos);
          } else if (elapsed < regionDur) {
            const progress = elapsed / regionDur;
            pos = ph.startPos + progress * (ph.endPos - ph.startPos);
          }
        }

        if (pos != null && pos >= 0 && pos <= 1) {
          const px = Math.round(pos * w);
          ctx.strokeStyle = 'rgba(212, 207, 200, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 0.5, 0);
          ctx.lineTo(px + 0.5, h);
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(drawPlayhead);
    };

    animRef.current = requestAnimationFrame(drawPlayhead);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [width, height]);

  // ── Mouse interaction for region selection ──
  const getCanvasX = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(width, e.clientX - rect.left));
  }, [width]);

  const handleMouseDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const x = getCanvasX(e);
    const pos = x / width;
    const startPx = startPos * width;
    const endPx = endPos * width;

    // Check if near start handle
    if (Math.abs(x - startPx) < HANDLE_W + 4) {
      dragging.current = 'start';
      dragStart.current = { x, startVal: startPos, endVal: endPos };
    }
    // Check if near end handle
    else if (Math.abs(x - endPx) < HANDLE_W + 4) {
      dragging.current = 'end';
      dragStart.current = { x, startVal: startPos, endVal: endPos };
    }
    // Inside region — drag the whole region
    else if (pos > startPos && pos < endPos) {
      dragging.current = 'region';
      dragStart.current = { x, startVal: startPos, endVal: endPos };
    }
    // Outside region — set new region start/end to click point
    else {
      dragging.current = pos < startPos ? 'start' : 'end';
      const newStart = dragging.current === 'start' ? pos : startPos;
      const newEnd = dragging.current === 'end' ? pos : endPos;
      onRegionChange?.(
        Math.max(0, Math.min(newStart, newEnd - 0.01)),
        Math.min(1, Math.max(newEnd, newStart + 0.01))
      );
      dragStart.current = { x, startVal: newStart, endVal: newEnd };
    }

    const onMove = (me) => {
      const cx = getCanvasX(me);
      const dx = (cx - dragStart.current.x) / width;

      if (dragging.current === 'start') {
        const ns = Math.max(0, Math.min(dragStart.current.startVal + dx, endPos - 0.01));
        onRegionChange?.(ns, endPos);
      } else if (dragging.current === 'end') {
        const ne = Math.min(1, Math.max(dragStart.current.endVal + dx, startPos + 0.01));
        onRegionChange?.(startPos, ne);
      } else if (dragging.current === 'region') {
        const regionLen = dragStart.current.endVal - dragStart.current.startVal;
        let ns = dragStart.current.startVal + dx;
        if (ns < 0) ns = 0;
        if (ns + regionLen > 1) ns = 1 - regionLen;
        onRegionChange?.(ns, ns + regionLen);
      }
    };

    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [startPos, endPos, width, onRegionChange, getCanvasX]);

  // ── Cursor style based on hover position ──
  const [cursor, setCursor] = useState('default');
  const handleMouseMove = useCallback((e) => {
    if (dragging.current) return;
    const x = getCanvasX(e);
    const startPx = startPos * width;
    const endPx = endPos * width;
    const pos = x / width;

    if (Math.abs(x - startPx) < HANDLE_W + 4 || Math.abs(x - endPx) < HANDLE_W + 4) {
      setCursor('ew-resize');
    } else if (pos > startPos && pos < endPos) {
      setCursor('grab');
    } else {
      setCursor('crosshair');
    }
  }, [startPos, endPos, width, getCanvasX]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        className="sampler-waveform-canvas"
        width={width}
        height={height}
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      />
      <canvas
        ref={overlayRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
