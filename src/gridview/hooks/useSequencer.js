import { useRef, useEffect } from 'react';
import { SequencerRunner } from '../../audio/sequencerRunner';

/**
 * Hook managing SequencerRunner lifecycle.
 *
 * Auto-starts sequencers, propagates trigger values from
 * connected sources (e.g. Pulser), and updates step values
 * and visual indicators when params change.
 */
export function useSequencer({
  nodes,
  connections,
  setNodes,
  runningSequencers,
  setRunningSequencers,
}) {
  const sequencerRunnerRef = useRef(null);

  // Initialize runner once
  useEffect(() => {
    sequencerRunnerRef.current = new SequencerRunner((nodeId, value) => {
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
      sequencerRunnerRef.current?.stopAll();
    };
  }, []);

  // Auto-start sequencers, propagate triggers, update step display
  useEffect(() => {
    const sequencer = sequencerRunnerRef.current;
    if (!sequencer) return;

    const sequencerNodeIds = new Set();
    for (const [id, node] of Object.entries(nodes)) {
      if (node.type !== 'sequencer') continue;
      const nodeId = Number(id);
      sequencerNodeIds.add(nodeId);

      const steps = [
        node.params.step1 ?? 60,
        node.params.step2 ?? 64,
        node.params.step3 ?? 67,
        node.params.step4 ?? 72,
        node.params.step5 ?? 60,
      ];
      const length = node.params.length ?? 5;

      if (!sequencer.isRunning(nodeId)) {
        sequencer.start(nodeId, steps, length);
        setRunningSequencers((prev) => new Set(prev).add(nodeId));
      } else {
        sequencer.setSteps(nodeId, steps);
        sequencer.setLength(nodeId, length);
      }

      // Propagate trigger from connected source
      const trigConn = connections.find(
        (c) => c.toNodeId === nodeId && c.toParam === 'trig'
      );
      if (trigConn) {
        const sourceNode = nodes[trigConn.fromNodeId];
        if (sourceNode) {
          const trigValue = sourceNode.params?.value ?? 0;
          sequencer.updateTrigger(nodeId, trigValue);
        }
      }

      // Update visual step indicator
      const currentStep = sequencer.getCurrentStep(nodeId);
      if (node.seqCurrentStep !== currentStep) {
        setNodes((prev) => {
          const n = prev[nodeId];
          if (!n || n.seqCurrentStep === currentStep) return prev;
          return { ...prev, [nodeId]: { ...n, seqCurrentStep: currentStep } };
        });
      }
    }

    // Stop sequencers for deleted nodes
    for (const nodeId of sequencer._contexts?.keys() || []) {
      if (!sequencerNodeIds.has(nodeId)) {
        sequencer.stop(nodeId);
      }
    }
  }, [nodes, connections]);

  return { sequencerRunnerRef };
}
