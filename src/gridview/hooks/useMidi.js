import { useEffect } from 'react';
import { MidiListener } from '../../audio/midiListener';

export function useMidi({ nodes, setNodes, setMidiActivity, midiListenersRef }) {
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
}
