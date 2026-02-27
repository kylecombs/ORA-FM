import { useRef, useEffect } from 'react';
import { NODE_SCHEMA } from '../nodeSchema';
import { MOD_DEPTH_SCALES } from '../constants';
import { computeLiveNodes, quantizeFreq } from '../utils';

export function useAudioRouting({ nodes, connections, engineRef, scopeBuffersRef }) {
  const prevRoutingRef = useRef({}); // nodeId → { inBus, outBus }
  const prevModRef = useRef({});     // `${nodeId}:${param}` → { busIndex, isAudioRate }
  const modAmpScaleRef = useRef({}); // nodeId → scale factor (for handleParamChange)

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.booted) return;

    const live = computeLiveNodes(nodes, connections);
    const outNode = Object.values(nodes).find((n) => n.type === 'audioOut');
    if (!outNode) return;

    // ── 0. Identify audio-rate modulators ──
    const audioRateModConns = connections.filter((c) => c.isAudioRate && c.toParam);
    const modulatorIds = new Set(audioRateModConns.map((c) => c.fromNodeId));

    // Add modulators to live set if their carriers are live.
    let changed = true;
    while (changed) {
      changed = false;
      for (const conn of audioRateModConns) {
        if (live.has(conn.toNodeId) && !live.has(conn.fromNodeId)) {
          live.add(conn.fromNodeId);
          changed = true;
        }
      }
    }

    // ── 0b. Identify sink nodes (print/scope modules) and their input chains ──
    const sinkModules = Object.entries(nodes).filter(([, n]) => n.type === 'print' || n.type === 'scope');
    for (const [printId, ] of sinkModules) {
      const printNodeId = parseInt(printId);

      const hasInput = connections.some(
        (c) => c.toNodeId === printNodeId && !c.toParam
      );
      if (!hasInput) continue;

      const toVisit = [printNodeId];
      const visited = new Set();

      while (toVisit.length > 0) {
        const currentId = toVisit.pop();
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        live.add(currentId);

        const inputConns = connections.filter(
          (c) => c.toNodeId === currentId && !c.toParam
        );
        for (const conn of inputConns) {
          if (!visited.has(conn.fromNodeId)) {
            toVisit.push(conn.fromNodeId);
          }
        }
      }
    }

    // ── 1. Assign audio buses to each connection ──
    const connBus = {};
    let nextBus = 16;
    for (const conn of connections) {
      if (conn.toParam && !conn.isAudioRate) continue;

      const fromLive = live.has(conn.fromNodeId);
      const toLive = live.has(conn.toNodeId) || conn.toNodeId === outNode.id;
      if (!fromLive || !toLive) continue;

      if (conn.toNodeId === outNode.id && !conn.toParam) {
        connBus[conn.id] = 0;
      } else {
        connBus[conn.id] = nextBus;
        nextBus += 2;
      }
    }

    // ── 2. Compute per-node routing ──
    const nodeRouting = {};
    for (const id of live) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      const isFx = schema.category === 'fx';
      const isModulator = modulatorIds.has(id);

      const outConnToAudioOut = connections.find(
        (c) => c.fromNodeId === id && !c.toParam && c.toNodeId === outNode.id
      );
      const outConnToLive = connections.find(
        (c) => c.fromNodeId === id && !c.toParam && live.has(c.toNodeId)
      );
      const outConn = outConnToAudioOut || outConnToLive;
      const outBus = outConn ? (connBus[outConn.id] ?? 0) : 0;

      const modOutBuses = [];
      for (const conn of audioRateModConns) {
        if (conn.fromNodeId === id && connBus[conn.id] != null) {
          modOutBuses.push({ connId: conn.id, bus: connBus[conn.id], toNodeId: conn.toNodeId, toParam: conn.toParam });
        }
      }

      let inBus;
      if (isFx) {
        const inConn = connections.find(
          (c) => c.toNodeId === id && !c.toParam && live.has(c.fromNodeId)
        );
        inBus = inConn ? (connBus[inConn.id] ?? 0) : 0;
      }

      let effectiveOutBus = outBus;
      if (isModulator && modOutBuses.length > 0) {
        effectiveOutBus = modOutBuses[0].bus;
      }

      nodeRouting[id] = { outBus, effectiveOutBus, inBus, isFx, isModulator, modOutBuses };
    }

    // ── 2b. Fix sink nodes to read from source's effective out bus ──
    for (const id of live) {
      const node = nodes[id];
      if (node.type === 'print' || node.type === 'scope') {
        const inConn = connections.find(
          (c) => c.toNodeId === id && !c.toParam && live.has(c.fromNodeId)
        );
        if (inConn && nodeRouting[inConn.fromNodeId]) {
          const srcBus = nodeRouting[inConn.fromNodeId].effectiveOutBus;
          const oldBus = nodeRouting[id].inBus;
          nodeRouting[id].inBus = srcBus;
          if (oldBus !== srcBus) {
            console.log(`[BUS] ${node.type}(${id}) inBus: ${oldBus} → ${srcBus} (from source ${inConn.fromNodeId})`);
          }
        }
      }
    }

    // ── 3. Compute pan for source nodes ──
    for (const id of live) {
      const routing = nodeRouting[id];
      if (routing.isFx) continue;

      let current = id;
      let audioOutPort = null;
      const visited = new Set();
      while (current != null && !visited.has(current)) {
        visited.add(current);
        const conn = connections.find(
          (c) => c.fromNodeId === current && !c.toParam && (live.has(c.toNodeId) || c.toNodeId === outNode.id)
        );
        if (!conn) break;
        if (conn.toNodeId === outNode.id) {
          audioOutPort = conn.toPortIndex;
          break;
        }
        current = conn.toNodeId;
      }

      if (audioOutPort === 0) routing.pan = -0.8;
      else if (audioOutPort === 1) routing.pan = 0.8;
      else routing.pan = 0;

      if (routing.isModulator) routing.pan = -1;
    }

    // ── 4. Build topological play order ──
    const sourceCarriers = [];
    const sourceModulators = [];
    const fxSet = new Set();
    for (const id of live) {
      if (nodeRouting[id].isFx) {
        fxSet.add(id);
      } else if (nodeRouting[id].isModulator) {
        sourceModulators.push(id);
      } else {
        sourceCarriers.push(id);
      }
    }
    const sources = [...sourceCarriers, ...sourceModulators];

    const fxOrder = [];
    const remaining = new Set(fxSet);
    const placed = new Set(sources);
    placed.add(outNode.id);
    let safety = remaining.size + 1;
    while (remaining.size > 0 && safety-- > 0) {
      for (const id of remaining) {
        const inConn = connections.find((c) => c.toNodeId === id && !c.toParam);
        if (!inConn || placed.has(inConn.fromNodeId)) {
          fxOrder.push(id);
          remaining.delete(id);
          placed.add(id);
        }
      }
    }

    // ── 4b. Pre-compute control-rate modulated params ──
    const controlMappedParams = new Set();
    for (const conn of connections) {
      if (!conn.toParam || conn.isAudioRate) continue;
      const sourceNode = nodes[conn.fromNodeId];
      const sourceSchema = NODE_SCHEMA[sourceNode?.type];
      if (sourceSchema?.category === 'control' || sourceSchema?.category === 'script') {
        controlMappedParams.add(`${conn.toNodeId}:${conn.toParam}`);
      }
    }

    // ── 5. Stop nodes that should not be playing ──
    for (const id of Object.keys(nodes)) {
      const nid = parseInt(id);
      if (!live.has(nid) && engine.isPlaying(nid)) {
        if (nodes[id].type === 'print') {
          engine.stopPrintModule(nid);
        }
        if (nodes[id].type === 'scope') {
          engine.stopScope(nid);
          scopeBuffersRef.current.delete(nid);
        }
        engine.stop(nid);
      }
    }

    // ── 6. Stop FX whose routing changed ──
    const prevRouting = prevRoutingRef.current;
    for (const id of fxOrder) {
      if (engine.isPlaying(id)) {
        const prev = prevRouting[id];
        const cur = nodeRouting[id];
        if (!prev || prev.inBus !== cur.inBus || prev.outBus !== cur.outBus) {
          if (nodes[id]?.type === 'scope') {
            scopeBuffersRef.current.delete(id);
          }
          engine.stop(id);
        }
      }
    }

    // ── 7. Play / update source nodes ──
    for (const id of sources) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      const routing = nodeRouting[id];
      const pan = routing.pan ?? 0;

      let ampToSend = node.params.amp;
      if (routing.isModulator && routing.modOutBuses.length > 0) {
        const targetParam = routing.modOutBuses[0].toParam;
        const scale = MOD_DEPTH_SCALES[targetParam] ?? 1;
        ampToSend = (node.params.amp ?? 0.5) * scale;
        modAmpScaleRef.current[id] = scale;
      } else {
        delete modAmpScaleRef.current[id];
      }

      if (!engine.isPlaying(id)) {
        const playParams = { ...node.params, pan, out_bus: routing.effectiveOutBus };
        if (routing.isModulator) playParams.amp = ampToSend;
        if (node.quantize && playParams.freq != null) {
          playParams.freq = quantizeFreq(playParams.freq);
        }
        engine.play(id, schema.synthDef, playParams);
      } else {
        engine.setParam(id, 'pan', pan);
        engine.setParam(id, 'out_bus', routing.effectiveOutBus);
        if (!controlMappedParams.has(`${id}:amp`)) {
          engine.setParam(id, 'amp', ampToSend);
        }
      }
    }

    // ── 8. Play / update FX nodes (in chain order) ──
    for (const id of fxOrder) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      const routing = nodeRouting[id];

      if (!engine.isPlaying(id)) {
        if (node.type === 'print') {
          const printBus = engine.startPrintModule(id);
          engine.playFx(id, schema.synthDef, {
            in_bus: routing.inBus,
            out_c_bus: printBus,
          });
        } else if (node.type === 'scope') {
          const scopeBuf = engine.startScope(id);
          engine.playFx(id, schema.synthDef, {
            in_bus: routing.inBus,
            bufnum: scopeBuf,
          });
        } else {
          engine.playFx(id, schema.synthDef, {
            ...node.params,
            in_bus: routing.inBus,
            out_bus: routing.effectiveOutBus,
          });
        }
      } else {
        for (const [k, v] of Object.entries(node.params)) {
          if (!controlMappedParams.has(`${id}:${k}`)) {
            engine.setParam(id, k, v);
          }
        }
        if (routing.inBus != null) {
          engine.setParam(id, 'in_bus', routing.inBus);
        }
        if (routing.effectiveOutBus != null) {
          engine.setParam(id, 'out_bus', routing.effectiveOutBus);
        }
      }
    }

    // ── 9. Reorder FX in scsynth node tree ──
    if (fxOrder.length > 1) {
      engine.reorderFx(fxOrder);
    }

    // ── 10. Apply modulation ──
    const prevMod = prevModRef.current;
    const currentMod = {};

    for (const conn of connections) {
      if (!conn.toParam) continue;
      const sourceNode = nodes[conn.fromNodeId];
      const targetNode = nodes[conn.toNodeId];
      if (!sourceNode || !targetNode) continue;

      const sourceSchema = NODE_SCHEMA[sourceNode.type];
      const modKey = `${conn.toNodeId}:${conn.toParam}`;

      if (conn.isAudioRate) {
        const audioBus = connBus[conn.id];
        if (audioBus == null) continue;

        const modParam = `${conn.toParam}_mod`;

        if (engine.isPlaying(conn.toNodeId)) {
          engine.mapParamToAudioBus(conn.toNodeId, modParam, audioBus);
        }

        currentMod[modKey] = { busIndex: audioBus, isAudioRate: true, modParam };
      } else {
        if (sourceSchema?.category !== 'control' && sourceSchema?.category !== 'script') continue;

        const value = sourceSchema?.category === 'script'
          ? (sourceNode.params[`out_${conn.fromPortIndex}`] ?? sourceNode.params.value ?? 0)
          : (sourceNode.params.value ?? 0);

        const busIndex = engine.allocControlBus(modKey);

        let busValue = value;
        if (conn.toParam === 'amp' && modAmpScaleRef.current[conn.toNodeId]) {
          busValue = value * modAmpScaleRef.current[conn.toNodeId];
        }
        engine.setControlBus(busIndex, busValue);

        if (engine.isPlaying(conn.toNodeId)) {
          engine.mapParam(conn.toNodeId, conn.toParam, busIndex);
        }

        currentMod[modKey] = { busIndex, isAudioRate: false };
      }
    }

    // Unmap params that are no longer modulated
    for (const [modKey, info] of Object.entries(prevMod)) {
      if (!(modKey in currentMod)) {
        const sepIdx = modKey.indexOf(':');
        const nodeId = parseInt(modKey.slice(0, sepIdx));
        const param = modKey.slice(sepIdx + 1);
        const targetNode = nodes[nodeId];
        let baseValue = targetNode?.params[param] ?? 0;

        if (param === 'amp' && modAmpScaleRef.current[nodeId]) {
          baseValue *= modAmpScaleRef.current[nodeId];
        }

        if (info.isAudioRate) {
          engine.unmapParamFromAudioBus(nodeId, info.modParam, 0);
        } else {
          engine.unmapParam(nodeId, param, baseValue);
          engine.freeControlBus(modKey);
        }
      }
    }

    prevModRef.current = currentMod;

    // Save routing state for next sync
    prevRoutingRef.current = nodeRouting;
  }, [nodes, connections]);

  return { modAmpScaleRef };
}
