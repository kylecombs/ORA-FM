import { useState, useRef, useCallback } from 'react';

export function useNodeDrag({ canvasRef, setNodes, setSelectedNodeId, connecting, setMousePos }) {
  const [dragId, setDragId] = useState(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const didDragRef = useRef(false);

  const startDrag = useCallback((e, nodeId) => {
    if (e.target.closest('.node-port') || e.target.closest('button') || e.target.closest('input') || e.target.closest('.script-code-preview') || e.target.closest('.bp-editor-wrap') || e.target.closest('.bang-circle') || e.target.closest('.bang-resize-handle') || e.target.closest('.script-resize-handle')) return;
    didDragRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
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

  return { dragId, startDrag, onCanvasMouseMove, onCanvasMouseUp };
}
