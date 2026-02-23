// ════════════════════════════════════════════════════════════
//  BREAKPOINT EDITOR
//
//  Canvas-based envelope editor with draggable breakpoints
//  and adjustable curve handles. Renders inline inside a
//  grid module node.
//
//  Interactions:
//    Click empty space   → add breakpoint
//    Drag breakpoint     → move in time/value
//    Double-click bp     → remove (except first/last)
//    Drag curve line     → adjust curvature between points
// ════════════════════════════════════════════════════════════

import { useRef, useCallback, useEffect, useState } from 'react';
import { curveInterp } from './audio/envelopeRunner';

// Canvas padding (logical px)
const PAD = { top: 6, right: 6, bottom: 6, left: 6 };
const BP_RADIUS = 5;
const CURVE_STEPS = 48;

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function BreakpointEditor({
  breakpoints,
  curves,
  onChange,
  accentColor = '#c8b060',
  getPlaybackProgress,  // () => { position, value } | null
  nodeId,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const animRef = useRef(null);
  const dprRef = useRef(1);

  // ── Coordinate transforms ──────────────────────────────

  const getLogicalSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { w: 1, h: 1 };
    const dpr = dprRef.current;
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  }, []);

  const toPixel = useCallback((time, value) => {
    const { w, h } = getLogicalSize();
    const drawW = w - PAD.left - PAD.right;
    const drawH = h - PAD.top - PAD.bottom;
    return {
      x: PAD.left + time * drawW,
      y: PAD.top + (1 - value) * drawH,
    };
  }, [getLogicalSize]);

  const fromPixel = useCallback((px, py) => {
    const { w, h } = getLogicalSize();
    const drawW = w - PAD.left - PAD.right;
    const drawH = h - PAD.top - PAD.bottom;
    return {
      time: Math.max(0, Math.min(1, (px - PAD.left) / drawW)),
      value: Math.max(0, Math.min(1, 1 - (py - PAD.top) / drawH)),
    };
  }, [getLogicalSize]);

  // ── Canvas drawing ─────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = dprRef.current;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const drawW = w - PAD.left - PAD.right;
    const drawH = h - PAD.top - PAD.bottom;

    // Background grid
    ctx.strokeStyle = 'rgba(122, 117, 112, 0.12)';
    ctx.lineWidth = 0.5;
    for (let v = 0; v <= 1; v += 0.25) {
      const y = PAD.top + (1 - v) * drawH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + drawW, y);
      ctx.stroke();
    }
    for (let t = 0; t <= 1; t += 0.25) {
      const x = PAD.left + t * drawW;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + drawH);
      ctx.stroke();
    }

    // Draw filled area under curve
    if (breakpoints.length >= 2) {
      ctx.beginPath();
      const first = toPixel(breakpoints[0].time, breakpoints[0].value);
      ctx.moveTo(first.x, PAD.top + drawH); // bottom-left of first point
      ctx.lineTo(first.x, first.y);

      for (let i = 0; i < breakpoints.length - 1; i++) {
        const bp0 = breakpoints[i];
        const bp1 = breakpoints[i + 1];
        const curve = curves[i] || 0;

        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const segTime = bp0.time + (bp1.time - bp0.time) * t;
          const segVal = curveInterp(t, bp0.value, bp1.value, curve);
          const p = toPixel(segTime, segVal);
          ctx.lineTo(p.x, p.y);
        }
      }

      const last = toPixel(
        breakpoints[breakpoints.length - 1].time,
        breakpoints[breakpoints.length - 1].value
      );
      ctx.lineTo(last.x, PAD.top + drawH); // bottom-right of last point
      ctx.closePath();

      ctx.fillStyle = hexToRgba(accentColor, 0.08);
      ctx.fill();
    }

    // Draw curve stroke
    if (breakpoints.length >= 2) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < breakpoints.length - 1; i++) {
        const bp0 = breakpoints[i];
        const bp1 = breakpoints[i + 1];
        const curve = curves[i] || 0;

        for (let s = 0; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const segTime = bp0.time + (bp1.time - bp0.time) * t;
          const segVal = curveInterp(t, bp0.value, bp1.value, curve);
          const p = toPixel(segTime, segVal);

          if (i === 0 && s === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      ctx.stroke();
    }

    // Playback cursor
    const progress = getPlaybackProgress?.(nodeId);
    if (progress) {
      const cursorX = PAD.left + progress.position * drawW;

      // Vertical cursor line
      ctx.strokeStyle = 'rgba(122, 171, 136, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cursorX, PAD.top);
      ctx.lineTo(cursorX, PAD.top + drawH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current value dot
      const dotY = PAD.top + (1 - progress.value) * drawH;
      ctx.fillStyle = '#7aab88';
      ctx.beginPath();
      ctx.arc(cursorX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Breakpoint dots
    for (let i = 0; i < breakpoints.length; i++) {
      const bp = breakpoints[i];
      const p = toPixel(bp.time, bp.value);

      // Outer ring
      ctx.fillStyle = 'rgba(12, 11, 10, 0.85)';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BP_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dot
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Curve indicators (small marks at segment midpoints showing curvature)
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const c = curves[i] || 0;
      if (Math.abs(c) < 0.1) continue;

      const bp0 = breakpoints[i];
      const bp1 = breakpoints[i + 1];
      const midTime = (bp0.time + bp1.time) / 2;
      const midVal = curveInterp(0.5, bp0.value, bp1.value, c);
      const p = toPixel(midTime, midVal);

      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.3;
      ctx.font = '8px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c > 0 ? '+' : '-', p.x, p.y - 6);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [breakpoints, curves, accentColor, toPixel, getPlaybackProgress, nodeId, getLogicalSize]);

  // ── Resize observer ────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const rect = wrap.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw]);

  // ── Animation loop (runs during playback) ──────────────

  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      const progress = getPlaybackProgress?.(nodeId);
      draw();
      if (progress) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
      }
    };

    // Check if we should start animating
    const progress = getPlaybackProgress?.(nodeId);
    if (progress) {
      tick();
    } else {
      draw();
    }

    return () => {
      running = false;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [draw, getPlaybackProgress, nodeId]);

  // ── Mouse helpers ──────────────────────────────────────

  const getCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const findBreakpointAt = useCallback((px, py) => {
    for (let i = 0; i < breakpoints.length; i++) {
      const p = toPixel(breakpoints[i].time, breakpoints[i].value);
      const dx = px - p.x;
      const dy = py - p.y;
      if (Math.sqrt(dx * dx + dy * dy) <= BP_RADIUS + 4) {
        return i;
      }
    }
    return -1;
  }, [breakpoints, toPixel]);

  const findCurveSegmentAt = useCallback((px, py) => {
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const bp0 = breakpoints[i];
      const bp1 = breakpoints[i + 1];
      const p0 = toPixel(bp0.time, bp0.value);
      const p1 = toPixel(bp1.time, bp1.value);

      const segWidth = p1.x - p0.x;
      if (segWidth <= 0) continue;

      const t = (px - p0.x) / segWidth;
      if (t < 0.05 || t > 0.95) continue;

      const curveVal = curveInterp(t, bp0.value, bp1.value, curves[i] || 0);
      const curveP = toPixel(bp0.time + (bp1.time - bp0.time) * t, curveVal);
      if (Math.abs(py - curveP.y) <= 10) return i;
    }
    return -1;
  }, [breakpoints, curves, toPixel]);

  // ── Mouse event handlers ───────────────────────────────

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getCanvasCoords(e);

    // Check breakpoints first
    const bpIdx = findBreakpointAt(x, y);
    if (bpIdx >= 0) {
      // Double-click to remove (except first/last)
      if (e.detail >= 2 && bpIdx > 0 && bpIdx < breakpoints.length - 1) {
        const newBps = [...breakpoints];
        const newCurves = [...curves];
        newBps.splice(bpIdx, 1);
        // Merge the two adjacent curves by keeping the earlier one
        newCurves.splice(Math.min(bpIdx, newCurves.length - 1), 1);
        onChange(newBps, newCurves);
        return;
      }
      setDragging({ type: 'point', index: bpIdx });
      return;
    }

    // Check curve segments
    const segIdx = findCurveSegmentAt(x, y);
    if (segIdx >= 0) {
      setDragging({
        type: 'curve',
        index: segIdx,
        startY: y,
        startCurve: curves[segIdx] || 0,
      });
      return;
    }

    // Click empty space → add breakpoint
    const { time, value } = fromPixel(x, y);
    let insertIdx = breakpoints.length;
    for (let i = 0; i < breakpoints.length; i++) {
      if (time < breakpoints[i].time) {
        insertIdx = i;
        break;
      }
    }

    const newBps = [...breakpoints];
    newBps.splice(insertIdx, 0, { time, value });

    const newCurves = [...curves];
    // Insert a linear segment curve at the split point
    const curveInsertIdx = Math.max(0, insertIdx - 1);
    newCurves.splice(curveInsertIdx, 0, 0);
    onChange(newBps, newCurves);
  }, [breakpoints, curves, onChange, getCanvasCoords, findBreakpointAt, findCurveSegmentAt, fromPixel]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();

    const { x, y } = getCanvasCoords(e);

    if (dragging.type === 'point') {
      const { time, value } = fromPixel(x, y);
      const newBps = [...breakpoints];
      const idx = dragging.index;

      if (idx === 0) {
        // First point: lock time to 0
        newBps[idx] = { time: 0, value };
      } else if (idx === breakpoints.length - 1) {
        // Last point: lock time to 1
        newBps[idx] = { time: 1, value };
      } else {
        // Interior point: constrain between neighbors
        const minT = breakpoints[idx - 1].time + 0.005;
        const maxT = breakpoints[idx + 1].time - 0.005;
        newBps[idx] = {
          time: Math.max(minT, Math.min(maxT, time)),
          value,
        };
      }
      onChange(newBps, curves);
    } else if (dragging.type === 'curve') {
      // Vertical drag adjusts curvature
      const dy = dragging.startY - y;
      const newCurve = Math.max(-8, Math.min(8, dragging.startCurve + dy * 0.06));
      const newCurves = [...curves];
      newCurves[dragging.index] = Math.round(newCurve * 10) / 10;
      onChange(breakpoints, newCurves);
    }
  }, [dragging, breakpoints, curves, onChange, getCanvasCoords, fromPixel]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Global mouseup/mousemove for drag that leaves the canvas
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => handleMouseMove(e);
    const onUp = () => setDragging(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, handleMouseMove]);

  return (
    <div
      ref={wrapRef}
      className="bp-editor-wrap"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <canvas
        ref={canvasRef}
        className="bp-editor-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}
