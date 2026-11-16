/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { LayoutGrid, Maximize2 } from 'lucide-react';
import type { PackIndex } from '../../data/schema.ts';
import type { RateUnit, SolveResult, SolvedStage } from '../../engine/types.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import { formatRate } from '../../state/projectsStore.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

const elk = new ELK();

interface StageNodeData extends Record<string, unknown> {
  stage: SolvedStage;
  index: PackIndex;
  rateUnit: RateUnit;
  theoreticalMode: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  hasAlert: boolean;
}

interface TerminalNodeData extends Record<string, unknown> {
  kind: 'raw' | 'target';
  itemId: string;
  ratePerSec: number;
  index: PackIndex;
  rateUnit: RateUnit;
  isDimmed: boolean;
}

interface MaterialEdgeData extends Record<string, unknown> {
  itemId: string;
  itemName: string;
  kind: 'item' | 'fluid';
  ratePerSec: number;
  beltsRequired: number;
  deficitPerSec: number;
  color: string;
  rateUnit: RateUnit;
  isDimmed: boolean;
}

const StageNode: React.FC<NodeProps<Node<StageNodeData>>> = ({ data }) => {
  const { t } = useI18n();
  const { stage, index, rateUnit, theoreticalMode, isSelected, isDimmed, hasAlert } = data;
  const countDisplay = theoreticalMode
    ? stage.theoreticalMachines.toFixed(2)
    : `${stage.installedMachines}`;

  const mainOut = stage.outputs[0];
  const outRes = mainOut ? index.resourcesById.get(mainOut.itemId) : undefined;
  const utilPct = Math.round(stage.utilization * 100);

  return (
    <div
      className={`w-[264px] rounded-md bg-[#141920] border transition-opacity ${
        isSelected
          ? 'border-amber-500 ring-1 ring-amber-500/40'
          : hasAlert
            ? 'border-red-500/70'
            : 'border-[#2A3444]'
      } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-slate-400 !border-[#0C0F14]" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-amber-400 !border-[#0C0F14]" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#222B38] bg-[#181E27] rounded-t-md">
        <div className="flex items-center gap-2 min-w-0">
          {mainOut && <ResourceIcon resource={outRes} id={mainOut.itemId} size={22} />}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">{stage.recipeName}</div>
            <div className="text-[11px] text-slate-400 truncate">{stage.machineName}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-amber-400 font-mono tabular-nums">
            {countDisplay}x
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums">
            {utilPct}{t.flowGraph.usedPct}
          </div>
        </div>
      </div>

      {/* Inputs & Outputs */}
      <div className="px-3 py-2 space-y-2 text-[11px]">
        <div className="space-y-1">
          {stage.inputs.map((inp) => {
            const res = index.resourcesById.get(inp.itemId);
            const rate = theoreticalMode ? inp.theoreticalTotalPerSec : inp.actualTotalPerSec;
            return (
              <div key={inp.itemId} className="flex items-center justify-between gap-2 text-slate-300">
                <span className="truncate text-slate-400">
                  In · {res?.name ?? inp.itemId}
                </span>
                <span className="font-mono tabular-nums shrink-0 text-slate-200">
                  {formatRate(rate, rateUnit)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="border-t border-[#222B38] pt-1.5 space-y-1">
          {stage.outputs.map((out) => {
            const res = index.resourcesById.get(out.itemId);
            const rate = theoreticalMode ? out.theoreticalTotalPerSec : out.actualTotalPerSec;
            return (
              <div key={out.itemId} className="flex items-center justify-between gap-2">
                <span className="truncate text-emerald-300/90 font-medium">
                  Out · {res?.name ?? out.itemId}
                </span>
                <span className="font-mono tabular-nums shrink-0 text-emerald-300 font-medium">
                  {formatRate(rate, rateUnit)}
                </span>
              </div>
            );
          })}
        </div>

        {(stage.moduleIds.length > 0 || (stage.beacon && stage.beacon.count > 0)) && (
          <div className="border-t border-[#222B38] pt-1 text-[10px] text-slate-400 truncate">
            {stage.moduleIds.length > 0 && `${stage.moduleIds.length} ${t.flowGraph.modules}`}
            {stage.moduleIds.length > 0 && stage.beacon && stage.beacon.count > 0 && ' · '}
            {stage.beacon && stage.beacon.count > 0 && `${stage.beacon.count} ${t.flowGraph.beacons}`}
          </div>
        )}
      </div>
    </div>
  );
};

const TerminalNode: React.FC<NodeProps<Node<TerminalNodeData>>> = ({ data }) => {
  const { t } = useI18n();
  const { kind, itemId, ratePerSec, index, rateUnit, isDimmed } = data;
  const res = index.resourcesById.get(itemId);
  const isRaw = kind === 'raw';

  return (
    <div
      className={`w-[190px] px-3 py-2.5 rounded-md border transition-opacity ${
        isRaw
          ? 'bg-[#12171E] border-[#2A3444]'
          : 'bg-[#181D16] border-emerald-600/60'
      } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
    >
      {isRaw ? (
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-sky-400 !border-[#0C0F14]" />
      ) : (
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-emerald-400 !border-[#0C0F14]" />
      )}

      <div className="flex items-center gap-2.5">
        <ResourceIcon resource={res} id={itemId} size={24} />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            {isRaw ? t.flowGraph.rawResource : t.flowGraph.finalTarget}
          </div>
          <div className="text-xs font-semibold text-slate-100 truncate">
            {res?.name ?? itemId}
          </div>
          <div className="text-xs font-mono tabular-nums text-amber-400">
            {formatRate(ratePerSec, rateUnit)}
          </div>
        </div>
      </div>
    </div>
  );
};

const MaterialFlowEdge: React.FC<EdgeProps<Edge<MaterialEdgeData>>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const { t } = useI18n();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  if (!data) {
    return <BaseEdge id={id} path={edgePath} />;
  }

  const isFluid = data.kind === 'fluid';
  const hasDeficit = data.deficitPerSec > 1e-4;
  const strokeColor = hasDeficit ? '#EF4444' : isFluid ? '#06B6D4' : data.color || '#94A3B8';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: isFluid ? 2.5 : 2,
          strokeDasharray: hasDeficit || isFluid ? '5 4' : undefined,
          opacity: data.isDimmed ? 0.15 : 0.85,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          className={`nodrag nopan pointer-events-none absolute px-1.5 py-0.5 rounded bg-[#0D1014]/95 border border-[#262F3D] text-[10px] font-mono tabular-nums whitespace-nowrap ${
            data.isDimmed ? 'opacity-20' : 'opacity-100'
          }`}
        >
          <span className="text-slate-200">{data.itemName}</span>{' '}
          <span style={{ color: strokeColor }}>{formatRate(data.ratePerSec, data.rateUnit)}</span>
          {!isFluid && data.beltsRequired > 0 && (
            <span className="text-slate-400"> · {data.beltsRequired.toFixed(2)} {t.flowGraph.beltsShort}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const nodeTypes = {
  stageNode: StageNode,
  terminalNode: TerminalNode,
};

const edgeTypes = {
  materialEdge: MaterialFlowEdge,
};

interface FlowGraphViewProps {
  index: PackIndex;
  solveResult: SolveResult;
  rateUnit: RateUnit;
  theoreticalMode: boolean;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
}

export const FlowGraphView: React.FC<FlowGraphViewProps> = ({
  index,
  solveResult,
  rateUnit,
  theoreticalMode,
  selectedStageId,
  onSelectStage,
}) => {
  const { t } = useI18n();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutCounter, setLayoutCounter] = useState(0);

  // Highlight connected upstream & downstream nodes when a stage is selected
  const highlightedIds = useMemo(() => {
    if (!selectedStageId) return null;
    const set = new Set<string>([selectedStageId]);

    // BFS upstream & downstream
    const queue = [selectedStageId];
    const visitedUp = new Set<string>([selectedStageId]);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const e of solveResult.edges) {
        if (e.targetStageId === curr && !visitedUp.has(e.sourceStageId)) {
          visitedUp.add(e.sourceStageId);
          set.add(e.sourceStageId);
          queue.push(e.sourceStageId);
        }
      }
    }

    const qDown = [selectedStageId];
    const visitedDown = new Set<string>([selectedStageId]);
    while (qDown.length > 0) {
      const curr = qDown.shift()!;
      for (const e of solveResult.edges) {
        if (e.sourceStageId === curr && !visitedDown.has(e.targetStageId)) {
          visitedDown.add(e.targetStageId);
          set.add(e.targetStageId);
          qDown.push(e.targetStageId);
        }
      }
    }

    return set;
  }, [selectedStageId, solveResult.edges]);

  const runElkLayout = useCallback(async () => {
    const rawNodes: Node[] = [];
    const rawEdges: Edge[] = [];

    for (const raw of solveResult.rawInputs) {
      const nodeId = `RAW:${raw.itemId}`;
      rawNodes.push({
        id: nodeId,
        type: 'terminalNode',
        position: { x: 0, y: 0 },
        data: {
          kind: 'raw',
          itemId: raw.itemId,
          ratePerSec: theoreticalMode ? raw.theoreticalPerSec : raw.actualPerSec,
          index,
          rateUnit,
          isDimmed: highlightedIds ? !highlightedIds.has(nodeId) : false,
        } satisfies TerminalNodeData,
      });
    }

    for (const stage of solveResult.stages) {
      const hasAlert = solveResult.alerts.some((a) => a.stageId === stage.id);
      rawNodes.push({
        id: stage.id,
        type: 'stageNode',
        position: { x: 0, y: 0 },
        data: {
          stage,
          index,
          rateUnit,
          theoreticalMode,
          isSelected: selectedStageId === stage.id,
          isDimmed: highlightedIds ? !highlightedIds.has(stage.id) : false,
          hasAlert,
        } satisfies StageNodeData,
      });
    }

    for (const target of solveResult.targetsSummary) {
      const nodeId = `TARGET:${target.itemId}`;
      rawNodes.push({
        id: nodeId,
        type: 'terminalNode',
        position: { x: 0, y: 0 },
        data: {
          kind: 'target',
          itemId: target.itemId,
          ratePerSec: theoreticalMode ? target.theoreticalPerSec : target.actualPerSec,
          index,
          rateUnit,
          isDimmed: highlightedIds ? !highlightedIds.has(nodeId) : false,
        } satisfies TerminalNodeData,
      });
    }

    for (const fe of solveResult.edges) {
      const res = index.resourcesById.get(fe.itemId);
      const isDimmed = highlightedIds
        ? !(highlightedIds.has(fe.sourceStageId) && highlightedIds.has(fe.targetStageId))
        : false;
      rawEdges.push({
        id: fe.id,
        source: fe.sourceStageId,
        target: fe.targetStageId,
        type: 'materialEdge',
        data: {
          itemId: fe.itemId,
          itemName: res?.name ?? fe.itemId,
          kind: fe.kind,
          ratePerSec: theoreticalMode ? fe.theoreticalRatePerSec : fe.actualRatePerSec,
          beltsRequired: fe.beltsRequired,
          deficitPerSec: fe.deficitPerSec,
          color: res?.color ?? '#94A3B8',
          rateUnit,
          isDimmed,
        } satisfies MaterialEdgeData,
      });
    }

    if (rawNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '48',
        'elk.layered.spacing.nodeNodeBetweenLayers': '110',
        'elk.edgeRouting': 'ORTHOGONAL',
      },
      children: rawNodes.map((n) => ({
        id: n.id,
        width: n.type === 'stageNode' ? 270 : 196,
        height: n.type === 'stageNode' ? 145 : 74,
      })),
      edges: rawEdges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };

    try {
      const layouted = await elk.layout(elkGraph);
      const posMap = new Map<string, { x: number; y: number }>();
      for (const child of layouted.children ?? []) {
        posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
      }
      setNodes(
        rawNodes.map((n) => ({
          ...n,
          position: posMap.get(n.id) ?? n.position,
        }))
      );
      setEdges(rawEdges);
    } catch {
      // Fallback grid positions
      setNodes(
        rawNodes.map((n, i) => ({
          ...n,
          position: { x: (i % 4) * 320, y: Math.floor(i / 4) * 180 },
        }))
      );
      setEdges(rawEdges);
    }
  }, [solveResult, index, rateUnit, theoreticalMode, selectedStageId, highlightedIds, setNodes, setEdges]);

  useEffect(() => {
    void runElkLayout();
  }, [runElkLayout, layoutCounter]);

  return (
    <div className="relative w-full h-full bg-[#0C0F14]">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLayoutCounter((c) => c + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#141920] border border-[#262F3D] rounded hover:bg-[#1C222C] transition-colors whitespace-nowrap"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
          {t.flowGraph.autoArrange}
        </button>
        {selectedStageId && (
          <button
            type="button"
            onClick={() => onSelectStage(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#141920] border border-[#262F3D] rounded hover:text-white transition-colors whitespace-nowrap"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            {t.flowGraph.clearFocus}
          </button>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          if (node.type === 'stageNode') {
            onSelectStage(node.id === selectedStageId ? null : node.id);
          }
        }}
        onPaneClick={() => onSelectStage(null)}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#242C3A" />
        <Controls />
        <MiniMap
          nodeColor={(n) => (n.type === 'terminalNode' ? '#10B981' : '#F59E0B')}
          maskColor="rgba(12, 15, 20, 0.75)"
        />
      </ReactFlow>
    </div>
  );
};
