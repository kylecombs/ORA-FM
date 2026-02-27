import { useRef, useEffect } from 'react';
import { PulserRunner } from '../../audio/pulserRunner';

/**
 * Hook managing PulserRunner lifecycle.
 *
 * Auto-starts pulsers when they have output connections,
 * updates rate when params change, and stops them when
 * disconnected or deleted.
 */
export function usePulser({
  nodes,
  connections,
  setNodes,
  runningPulsers,
  setRunningPulsers,
}) {
  const pulserRunnerRef = useRef(null);

  // Initialize runner once
  useEffect(() => {
    pulserRunnerRef.current = new PulserRunner((nodeId, value) => {
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

    return () => {
      pulserRunnerRef.current?.stopAll();
    };
  }, []);

  // Auto-start/stop pulsers based on connections
  useEffect(() => {
    const pulser = pulserRunnerRef.current;
    if (!pulser) return;

    const pulserNodeIds = new Set();
    for (const [id, node] of Object.entries(nodes)) {
      if (node.type !== 'pulser') continue;
      const nodeId = Number(id);
      pulserNodeIds.add(nodeId);

      // Check if pulser has any output connections
      const hasOutput = connections.some((c) => c.fromNodeId === nodeId);

      if (hasOutput) {
        if (!pulser.isRunning(nodeId)) {
          pulser.start(nodeId, node.params.rate || 2);
          setRunningPulsers((prev) => new Set(prev).add(nodeId));
        } else {
          pulser.setRate(nodeId, node.params.rate || 2);
        }
      } else if (pulser.isRunning(nodeId)) {
        pulser.stop(nodeId);
        setRunningPulsers((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    }

    // Stop pulsers for deleted nodes
    for (const nodeId of pulser._contexts?.keys() || []) {
      if (!pulserNodeIds.has(nodeId)) {
        pulser.stop(nodeId);
      }
    }
  }, [nodes, connections]);

  return { pulserRunnerRef };
}
