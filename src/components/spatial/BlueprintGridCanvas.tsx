/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Crosshair,
  Download,
  Eraser,
  Hand,
  Maximize,
  MousePointer2,
  Move,
  RefreshCw,
  RotateCw,
  Share2,
  TrainFront,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { spritePackStore } from '../../assets/spritePackStore.ts';
import { wikiEntitySprites } from '../../assets/wikiEntitySprites.ts';
import type { Direction, PackIndex } from '../../data/schema.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import type {
  GridEntity,
  GridEntityKind,
  LayoutSynthesisOptions,
  SynthesizedLayout,
  TrainStationConfig,
} from '../../spatial/types.ts';
import {
  buildBlueprintJson,
  createSampleRailCityBlockString,
  createSampleSubstationGridString,
  encodeBlueprintString,
  parseBlueprintToEntities,
} from '../../spatial/blueprintCodec.ts';
import { computeLayoutStats } from '../../spatial/layoutSynthesizer.ts';
import {
  buildRailFlowNetwork,
  computeTrainCarPosesOnNetwork,
  detectTrainStopsOnNetwork,
  sampleChainAtArcLength,
  snapStationToRail,
  type RailFlowNetwork,
} from '../../spatial/railFlowNetwork.ts';
import { isRailTrackEntityName } from '../../spatial/railGeometry.ts';
import { traceMachineProcess } from '../../spatial/processTracer.ts';
import { computeTrainWagonPlan, type TrainRawInputEntry } from '../../spatial/trainPlanner.ts';
import {
  buildEntitySpatialLookup,
  classifyInserterRole,
  drawBeaconVectorSprite,
  drawChamferedWikiSprite,
  drawElectricPoleVectorSprite,
  drawGroundObstacleVectorSprite,
  drawInserterSprite,
  drawMachineVectorSprite,
  drawPipeSprite,
  drawRailSignalVectorSprite,
  drawSplitterSprite,
  drawTrainStopVectorSprite,
  drawTransportBeltSprite,
  getPipeNeighborMask,
} from './entitySprites.ts';
import { TrainPlannerModal } from './TrainPlannerModal.tsx';

type EditorTool =
  | 'select'
  | 'pan'
  | 'move-production'
  | 'place-train-station'
  | 'place-belt'
  | 'place-underground'
  | 'place-splitter'
  | 'place-inserter'
  | 'place-long-inserter'
  | 'place-pipe'
  | 'place-beacon'
  | 'place-pole'
  | 'erase';

interface BlueprintGridCanvasProps {
  index: PackIndex;
  layout: SynthesizedLayout;
  entities: GridEntity[];
  projectName: string;
  defaultBeltId: string;
  compactionMode: 'compact' | 'standard';
  layoutOptions?: LayoutSynthesisOptions;
  hasGridFrame?: boolean;
  rawInputs?: TrainRawInputEntry[];
  trainStation?: TrainStationConfig;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
  onChangeEntities: (next: GridEntity[]) => void;
  onImportGridFrame?: (frameEntities: GridEntity[]) => void;
  onAddTrainStopToFrame?: (stopEntity: GridEntity, stationConfig: TrainStationConfig) => void;
  onClearGridFrame?: () => void;
  onResetAutoLayout: () => void;
  onToggleCompaction: (mode: 'compact' | 'standard') => void;
  onChangeLayoutOptions?: (patch: Partial<LayoutSynthesisOptions>) => void;
  onChangeTrainStation?: (next: TrainStationConfig | undefined) => void;
}

function rotateDir(dir: Direction): Direction {
  return (((dir + 4) % 16) as Direction);
}

function getBeltColor(name: string): string {
  if (name.includes('superior')) return '#A855F7';
  if (name.includes('turbo')) return '#84CC16';
  if (name.includes('express')) return '#38BDF8';
  if (name.includes('fast')) return '#EF4444';
  return '#FACC15';
}

function getInserterColor(name: string): string {
  if (name.includes('superior')) return '#A855F7';
  if (name.includes('stack')) return '#F8FAFC';
  if (name.includes('bulk')) return '#22C55E';
  if (name.includes('fast')) return '#3B82F6';
  if (name.includes('long')) return '#EF4444';
  return '#EAB308';
}

/**
 * Renders the auto-interpreted, topologically welded RailFlowNetwork as smooth,
 * unbroken ballast beds, perpendicular sleepers, twin mitered steel rails, and
 * crisp static yellow directional flow chevrons (zero chopped sprite gaps).
 */
function drawInterpretedRailFlowNetwork(
  ctx: CanvasRenderingContext2D,
  network: RailFlowNetwork,
  pan: { x: number; y: number },
  zoom: number,
  startTileX: number,
  endTileX: number,
  startTileY: number,
  endTileY: number
) {
  if (network.chains.length === 0) return;

  const visibleChains = network.chains.filter((chain) => {
    if (chain.points.length < 2) return false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of chain.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return !(
      maxX < startTileX - 2 ||
      minX > endTileX + 2 ||
      maxY < startTileY - 2 ||
      minY > endTileY + 2
    );
  });

  if (visibleChains.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Pass A: Continuous flat ballast track bed across all chains
  ctx.strokeStyle = '#181C24';
  ctx.lineWidth = Math.max(3, zoom * 1.46);
  for (const chain of visibleChains) {
    const pts = chain.points;
    ctx.beginPath();
    ctx.moveTo(pan.x + pts[0].x * zoom, pan.y + pts[0].y * zoom);
    const limit = chain.closed ? pts.length - 1 : pts.length;
    for (let i = 1; i < limit; i++) {
      ctx.lineTo(pan.x + pts[i].x * zoom, pan.y + pts[i].y * zoom);
    }
    if (chain.closed) ctx.closePath();
    ctx.stroke();
  }

  // Pass B: Wooden sleepers at uniform arc-length intervals perpendicular to tangent
  if (zoom >= 3.0) {
    const tieHalf = zoom * 0.62;
    ctx.strokeStyle = '#574232';
    ctx.lineWidth = Math.max(1.1, zoom * 0.15);
    ctx.lineCap = 'butt';
    for (const chain of visibleChains) {
      const count = Math.max(1, Math.round(chain.totalLength));
      const stepLen = chain.totalLength / count;
      for (let i = 0; i < count; i++) {
        const pt = sampleChainAtArcLength(chain, (i + 0.5) * stepLen);
        if (
          pt.x < startTileX - 1 ||
          pt.x > endTileX + 1 ||
          pt.y < startTileY - 1 ||
          pt.y > endTileY + 1
        ) {
          continue;
        }
        const px = pan.x + pt.x * zoom;
        const py = pan.y + pt.y * zoom;
        ctx.beginPath();
        ctx.moveTo(px + pt.nx * tieHalf, py + pt.ny * tieHalf);
        ctx.lineTo(px - pt.nx * tieHalf, py - pt.ny * tieHalf);
        ctx.stroke();
      }
    }
  }

  // Pass C: Continuous twin parallel steel rails using averaged interior vertex normals
  const normalize2 = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy);
    return len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  };

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = Math.max(1, zoom * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const railGaugeHalf = 0.42;

  for (const chain of visibleChains) {
    const rawPts = chain.points;
    const pts =
      chain.closed && rawPts.length >= 3 ? rawPts.slice(0, rawPts.length - 1) : rawPts;
    const n = pts.length;
    if (n < 2) continue;

    const offsets = new Array<{ x: number; y: number }>(n);
    for (let i = 0; i < n; i++) {
      const prev = i > 0 ? pts[i - 1] : chain.closed ? pts[n - 1] : null;
      const next = i < n - 1 ? pts[i + 1] : chain.closed ? pts[0] : null;

      if (prev && next) {
        const tPrev = normalize2(pts[i].x - prev.x, pts[i].y - prev.y);
        const tNext = normalize2(next.x - pts[i].x, next.y - pts[i].y);
        const nPrev = { x: -tPrev.y, y: tPrev.x };
        const nNext = { x: -tNext.y, y: tNext.x };
        const sumX = nPrev.x + nNext.x;
        const sumY = nPrev.y + nNext.y;
        const sumLen = Math.hypot(sumX, sumY);
        if (sumLen > 1e-4) {
          const avgNx = sumX / sumLen;
          const avgNy = sumY / sumLen;
          const cosHalf = Math.max(0.65, avgNx * nPrev.x + avgNy * nPrev.y);
          const scale = railGaugeHalf / cosHalf;
          offsets[i] = { x: avgNx * scale, y: avgNy * scale };
        } else {
          offsets[i] = { x: nPrev.x * railGaugeHalf, y: nPrev.y * railGaugeHalf };
        }
      } else if (next) {
        const t = normalize2(next.x - pts[i].x, next.y - pts[i].y);
        offsets[i] = { x: -t.y * railGaugeHalf, y: t.x * railGaugeHalf };
      } else if (prev) {
        const t = normalize2(pts[i].x - prev.x, pts[i].y - prev.y);
        offsets[i] = { x: -t.y * railGaugeHalf, y: t.x * railGaugeHalf };
      } else {
        offsets[i] = { x: 0, y: 0 };
      }
    }

    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const rx = pan.x + (pts[i].x + offsets[i].x * side) * zoom;
        const ry = pan.y + (pts[i].y + offsets[i].y * side) * zoom;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      if (chain.closed) ctx.closePath();
      ctx.stroke();
    }
  }

  // Pass D: Static yellow directional flow chevrons from inferred signals & stops
  const pitch = zoom < 6 ? 12 : zoom < 14 ? 8 : 6;
  const arrowSz = Math.max(4.5, Math.min(11, zoom * 0.4));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const chain of visibleChains) {
    const flow = network.chainFlows[chain.id] ?? 0;
    if (flow === 0 || chain.totalLength < 1.2) continue;

    const arrowCount = Math.max(1, Math.floor(chain.totalLength / pitch));
    const step = chain.totalLength / arrowCount;

    for (let k = 0; k < arrowCount; k++) {
      const pt = sampleChainAtArcLength(chain, (k + 0.5) * step);
      if (
        pt.x < startTileX - 1 ||
        pt.x > endTileX + 1 ||
        pt.y < startTileY - 1 ||
        pt.y > endTileY + 1
      ) {
        continue;
      }

      const angle = Math.atan2(pt.ty * flow, pt.tx * flow);
      const px = pan.x + pt.x * zoom;
      const py = pan.y + pt.y * zoom;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);

      ctx.strokeStyle = 'rgba(11, 14, 20, 0.92)';
      ctx.lineWidth = Math.max(3, arrowSz * 0.42);
      ctx.beginPath();
      ctx.moveTo(-arrowSz * 0.45, -arrowSz * 0.48);
      ctx.lineTo(arrowSz * 0.45, 0);
      ctx.lineTo(-arrowSz * 0.45, arrowSz * 0.48);
      ctx.stroke();

      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = Math.max(1.7, arrowSz * 0.24);
      ctx.beginPath();
      ctx.moveTo(-arrowSz * 0.45, -arrowSz * 0.48);
      ctx.lineTo(arrowSz * 0.45, 0);
      ctx.lineTo(-arrowSz * 0.45, arrowSz * 0.48);
      ctx.stroke();

      ctx.restore();
    }
  }

  ctx.restore();
}

export const BlueprintGridCanvas: React.FC<BlueprintGridCanvasProps> = ({
  index,
  layout,
  entities,
  projectName,
  defaultBeltId,
  compactionMode,
  layoutOptions,
  hasGridFrame,
  rawInputs = [],
  trainStation,
  selectedStageId,
  onSelectStage,
  onChangeEntities,
  onImportGridFrame,
  onAddTrainStopToFrame,
  onClearGridFrame,
  onResetAutoLayout,
  onToggleCompaction,
  onChangeLayoutOptions,
  onChangeTrainStation,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [tool, setTool] = useState<EditorTool>('select');
  const [placeDirection, setPlaceDirection] = useState<Direction>(0);
  const [selectedEntityNum, setSelectedEntityNum] = useState<number | null>(null);
  const [isolateMachineProcess, setIsolateMachineProcess] = useState(true);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [spriteTick, setSpriteTick] = useState(0);
  const [containerSizeTick, setContainerSizeTick] = useState(0);
  const [moveProdPreviewDelta, setMoveProdPreviewDelta] = useState<{ dx: number; dy: number } | null>(
    null
  );

  const [zoom, setZoom] = useState(26); // pixels per Factorio tile
  const [pan, setPan] = useState({ x: 300, y: 400 });

  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const [copiedBp, setCopiedBp] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'grid-frame' | 'replace'>('grid-frame');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [trainModalOpen, setTrainModalOpen] = useState(false);

  useEffect(() => {
    const unsubLocal = spritePackStore.subscribe(() => setSpriteTick((t) => t + 1));
    const unsubWiki = wikiEntitySprites.subscribe(() => setSpriteTick((t) => t + 1));
    const el = containerRef.current;
    const ro =
      el && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => setContainerSizeTick((v) => v + 1))
        : null;
    if (ro && el) ro.observe(el);
    return () => {
      unsubLocal();
      unsubWiki();
      ro?.disconnect();
    };
  }, []);

  const dragStateRef = useRef<{
    mode: 'none' | 'pan' | 'move-entity' | 'move-production';
    startScreenX: number;
    startScreenY: number;
    startPanX: number;
    startPanY: number;
    entityNum?: number;
    origTileX?: number;
    origTileY?: number;
  }>({ mode: 'none', startScreenX: 0, startScreenY: 0, startPanX: 0, startPanY: 0 });

  const liveStats = useMemo(() => computeLayoutStats(entities), [entities]);

  const railFlowNetwork = useMemo(() => buildRailFlowNetwork(entities), [entities]);
  const railStops = useMemo(
    () => detectTrainStopsOnNetwork(entities, railFlowNetwork),
    [entities, railFlowNetwork]
  );
  const entitySpatialLookup = useMemo(() => buildEntitySpatialLookup(entities), [entities]);

  const factoryCenter = useMemo(() => {
    if (layout.gridFitReport?.hasGridFrame) {
      const ib = layout.gridFitReport.interiorBounds;
      return { x: (ib.minX + ib.maxX) / 2, y: (ib.minY + ib.maxY) / 2 };
    }
    const b = liveStats.bounds;
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }, [layout.gridFitReport, liveStats.bounds]);

  const trainPlan = useMemo(() => {
    if (!trainStation) return null;
    return computeTrainWagonPlan(rawInputs, index, {
      wagonCount: trainStation.wagonCount,
      slotsPerWagon: trainStation.slotsPerWagon ?? 40,
      stackSizeOverrides: trainStation.stackSizeOverrides,
    });
  }, [rawInputs, index, trainStation]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.entityNumber === selectedEntityNum) ?? null,
    [entities, selectedEntityNum]
  );

  const machineProcessTrace = useMemo(() => {
    if (!isolateMachineProcess || !selectedEntity || selectedEntity.kind !== 'machine') {
      return null;
    }
    return traceMachineProcess(entities, layout.ports ?? [], selectedEntity);
  }, [isolateMachineProcess, selectedEntity, entities, layout.ports]);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || entities.length === 0) return;
    const rect = el.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = liveStats.bounds;
    const w = Math.max(4, maxX - minX + 6);
    const h = Math.max(4, maxY - minY + 6);
    const nextZoom = Math.max(1.2, Math.min(48, Math.min(rect.width / w, rect.height / h)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - centerX * nextZoom,
      y: rect.height / 2 - centerY * nextZoom,
    });
  }, [entities.length, liveStats.bounds]);

  // Fit on initial layout change (wait only when layout itself changes meaningfully)
  useEffect(() => {
    fitToView();
  }, [layout]);

  const nudgeProduction = useCallback(
    (dx: number, dy: number) => {
      if (!onChangeLayoutOptions) return;
      onChangeLayoutOptions({
        productionOffsetX: (layoutOptions?.productionOffsetX ?? 0) + dx,
        productionOffsetY: (layoutOptions?.productionOffsetY ?? 0) + dy,
      });
    },
    [onChangeLayoutOptions, layoutOptions?.productionOffsetX, layoutOptions?.productionOffsetY]
  );

  const centerProduction = useCallback(() => {
    if (onChangeLayoutOptions) {
      onChangeLayoutOptions({
        productionOffsetX: 0,
        productionOffsetY: 0,
      });
    } else {
      onResetAutoLayout();
    }
  }, [onChangeLayoutOptions, onResetAutoLayout]);

  const screenToExactTile = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const findEntityAtTile = useCallback(
    (tx: number, ty: number) => {
      return entities.find((e) => {
        const ex = e.tileX + (e.bpOffsetX ?? 0);
        const ey = e.tileY + (e.bpOffsetY ?? 0);
        return tx >= ex && tx < ex + e.width && ty >= ey && ty < ey + e.height;
      });
    },
    [entities]
  );

  const canPlaceAt = useCallback(
    (tileX: number, tileY: number, width: number, height: number, ignoreEntityNum?: number) => {
      return !entities.some((e) => {
        if (e.entityNumber === ignoreEntityNum) return false;
        return !(
          tileX + width <= e.tileX ||
          tileX >= e.tileX + e.width ||
          tileY + height <= e.tileY ||
          tileY >= e.tileY + e.height
        );
      });
    },
    [entities]
  );

  const handleRotateSelectedOrPreview = useCallback(() => {
    if (selectedEntity) {
      const next = entities.map((e) =>
        e.entityNumber === selectedEntity.entityNumber
          ? { ...e, direction: rotateDir(e.direction) }
          : e
      );
      onChangeEntities(next);
    } else {
      setPlaceDirection((d) => rotateDir(d));
    }
  }, [selectedEntity, entities, onChangeEntities]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedEntity || selectedEntity.isGridFrame) return;
    onChangeEntities(entities.filter((e) => e.entityNumber !== selectedEntity.entityNumber));
    setSelectedEntityNum(null);
  }, [selectedEntity, entities, onChangeEntities]);

  // Keyboard shortcuts (R = Rotate, Del/Backspace = Delete, F = Fit)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRotateSelectedOrPreview();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key === 'f' || e.key === 'F') {
        fitToView();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRotateSelectedOrPreview, handleDeleteSelected, fitToView]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const exactTile = screenToExactTile(e.clientX, e.clientY);
    const tile = { x: Math.floor(exactTile.x), y: Math.floor(exactTile.y) };

    if (e.button === 1 || e.altKey || tool === 'pan') {
      dragStateRef.current = {
        mode: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      return;
    }

    if (tool === 'move-production') {
      dragStateRef.current = {
        mode: 'move-production',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      setMoveProdPreviewDelta({ dx: 0, dy: 0 });
      return;
    }

    if (tool === 'place-train-station' && onChangeTrainStation) {
      if (railStops.length > 0) {
        const clickedStop = railStops.find(
          (s) => Math.hypot(exactTile.x - s.stopCenter.x, exactTile.y - s.stopCenter.y) <= 3.5
        );
        if (clickedStop) {
          onChangeTrainStation({
            tileX: clickedStop.tileX,
            tileY: clickedStop.tileY,
            direction: clickedStop.direction,
            wagonCount: trainStation?.wagonCount ?? 2,
            slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
            stackSizeOverrides: trainStation?.stackSizeOverrides ?? {},
            lockedStopEntityNumber: clickedStop.entityNumber,
          });
          setTool('select');
          return;
        }
      }

      if (railFlowNetwork.chains.length > 0) {
        // Snap if cursor is close to an imported rail; otherwise place a free custom stop anywhere inside the grid
        const snap = snapStationToRail(railFlowNetwork, exactTile.x, exactTile.y, 4);
        if (snap) {
          const nextConfig: TrainStationConfig = {
            tileX: snap.tileX,
            tileY: snap.tileY,
            direction: snap.direction,
            wagonCount: trainStation?.wagonCount ?? 2,
            slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
            stackSizeOverrides: trainStation?.stackSizeOverrides ?? {},
          };
          const stopEntity: GridEntity = {
            entityNumber: entities.reduce((m, x) => Math.max(m, x.entityNumber), 0) + 1,
            kind: 'grid-obstacle',
            name: 'train-stop',
            tileX: snap.tileX,
            tileY: snap.tileY,
            width: 2,
            height: 2,
            direction: snap.direction,
            isGridFrame: true,
          };
          if (onAddTrainStopToFrame) {
            onAddTrainStopToFrame(stopEntity, nextConfig);
          } else {
            onChangeEntities([...entities, stopEntity]);
            onChangeTrainStation({
              ...nextConfig,
              lockedStopEntityNumber: stopEntity.entityNumber,
            });
          }
          setTool('select');
          return;
        }
      }

      // Free placement anywhere on the grid (synthesizer will build a siding + stop there)
      onChangeTrainStation({
        tileX: tile.x,
        tileY: tile.y,
        direction: placeDirection,
        wagonCount: trainStation?.wagonCount ?? 2,
        slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
        stackSizeOverrides: trainStation?.stackSizeOverrides ?? {},
      });
      setTool('select');
      return;
    }

    if (tool === 'erase') {
      const hit = findEntityAtTile(exactTile.x, exactTile.y);
      if (hit && !hit.isGridFrame) {
        onChangeEntities(entities.filter((x) => x.entityNumber !== hit.entityNumber));
        if (selectedEntityNum === hit.entityNumber) setSelectedEntityNum(null);
      }
      return;
    }

    if (tool.startsWith('place-')) {
      const beltDef = index.beltsById.get(defaultBeltId) ?? index.pack.belts[0];
      let kind: GridEntityKind = 'transport-belt';
      let name = beltDef?.id ?? 'transport-belt';
      let width = 1;
      let height = 1;

      if (tool === 'place-underground') {
        kind = 'underground-belt';
        name = beltDef?.undergroundId ?? 'underground-belt';
      } else if (tool === 'place-splitter') {
        kind = 'splitter';
        name = beltDef?.splitterId ?? 'splitter';
        width = placeDirection === 0 || placeDirection === 8 ? 2 : 1;
        height = placeDirection === 0 || placeDirection === 8 ? 1 : 2;
      } else if (tool === 'place-inserter') {
        kind = 'inserter';
        name = 'fast-inserter';
      } else if (tool === 'place-long-inserter') {
        kind = 'inserter';
        name = 'long-handed-inserter';
      } else if (tool === 'place-pipe') {
        kind = 'pipe';
        name = 'pipe';
      } else if (tool === 'place-beacon') {
        const beaconDef = index.pack.beacons[0];
        kind = 'beacon';
        name = beaconDef?.id ?? 'beacon';
        width = beaconDef?.tileSize.width ?? 3;
        height = beaconDef?.tileSize.height ?? 3;
      } else if (tool === 'place-pole') {
        const poleDef = index.pack.electricPoles?.[0];
        kind = 'electric-pole';
        name = poleDef?.id ?? 'medium-electric-pole';
        width = poleDef?.tileSize.width ?? 1;
        height = poleDef?.tileSize.height ?? 1;
      }

      if (canPlaceAt(tile.x, tile.y, width, height)) {
        const nextNum = entities.reduce((m, x) => Math.max(m, x.entityNumber), 0) + 1;
        const created: GridEntity = {
          entityNumber: nextNum,
          kind,
          name,
          tileX: tile.x,
          tileY: tile.y,
          width,
          height,
          direction: placeDirection,
          inserterReach: tool === 'place-long-inserter' ? 2 : tool === 'place-inserter' ? 1 : undefined,
          undergroundType: kind === 'underground-belt' ? 'input' : undefined,
          moduleIds: kind === 'beacon' ? ['speed-module-3', 'speed-module-3'] : undefined,
        };
        onChangeEntities([...entities, created]);
        setSelectedEntityNum(nextNum);
      }
      return;
    }

    // Select or start moving entity (Base Grid Frame entities stay locked in place)
    const hit = findEntityAtTile(exactTile.x, exactTile.y);
    if (hit) {
      setSelectedEntityNum(hit.entityNumber);
      if (hit.stageId) onSelectStage(hit.stageId);
      if (!hit.isGridFrame) {
        dragStateRef.current = {
          mode: 'move-entity',
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          entityNum: hit.entityNumber,
          origTileX: hit.tileX,
          origTileY: hit.tileY,
        };
      } else {
        dragStateRef.current = {
          mode: 'pan',
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
      }
    } else {
      setSelectedEntityNum(null);
      dragStateRef.current = {
        mode: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const exact = screenToExactTile(e.clientX, e.clientY);
    const tile = { x: Math.floor(exact.x), y: Math.floor(exact.y) };
    setHoverTile(tile);

    const ds = dragStateRef.current;
    if (ds.mode === 'pan') {
      setPan({
        x: ds.startPanX + (e.clientX - ds.startScreenX),
        y: ds.startPanY + (e.clientY - ds.startScreenY),
      });
    } else if (ds.mode === 'move-production') {
      const dx = Math.round((e.clientX - ds.startScreenX) / zoom);
      const dy = Math.round((e.clientY - ds.startScreenY) / zoom);
      setMoveProdPreviewDelta({ dx, dy });
    } else if (ds.mode === 'move-entity' && ds.entityNum !== undefined) {
      const dxTiles = Math.round((e.clientX - ds.startScreenX) / zoom);
      const dyTiles = Math.round((e.clientY - ds.startScreenY) / zoom);
      const targetX = (ds.origTileX ?? 0) + dxTiles;
      const targetY = (ds.origTileY ?? 0) + dyTiles;
      const ent = entities.find((x) => x.entityNumber === ds.entityNum);
      if (ent && (ent.tileX !== targetX || ent.tileY !== targetY)) {
        if (canPlaceAt(targetX, targetY, ent.width, ent.height, ent.entityNumber)) {
          onChangeEntities(
            entities.map((x) =>
              x.entityNumber === ent.entityNumber
                ? { ...x, tileX: targetX, tileY: targetY }
                : x
            )
          );
        }
      }
    }
  };

  const handleMouseUp = () => {
    if (dragStateRef.current.mode === 'move-production' && moveProdPreviewDelta) {
      if (moveProdPreviewDelta.dx !== 0 || moveProdPreviewDelta.dy !== 0) {
        nudgeProduction(moveProdPreviewDelta.dx, moveProdPreviewDelta.dy);
      }
      setMoveProdPreviewDelta(null);
    }
    dragStateRef.current.mode = 'none';
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.max(1.2, Math.min(64, zoom * factor));
    const scaleRatio = nextZoom / zoom;

    setPan({
      x: mx - (mx - pan.x) * scaleRatio,
      y: my - (my - pan.y) * scaleRatio,
    });
    setZoom(nextZoom);
  };

  // --- Static On-Demand Canvas 2D Renderer (Zero Idle CPU) ---
  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const targetW = Math.floor(rect.width * dpr);
      const targetH = Math.floor(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;

      // Background
      ctx.fillStyle = '#121316';
      ctx.fillRect(0, 0, width, height);

      const tSec = 0;

      // Visible tile range (viewport culling!)
      const startTileX = Math.floor(-pan.x / zoom) - 2;
      const endTileX = Math.ceil((width - pan.x) / zoom) + 2;
      const startTileY = Math.floor(-pan.y / zoom) - 2;
      const endTileY = Math.ceil((height - pan.y) / zoom) + 2;

      // Draw subtle tile grid (or 32-tile chunk grid when zoomed out)
      if (zoom >= 10) {
        ctx.lineWidth = 1;
        for (let tx = startTileX; tx <= endTileX; tx++) {
          const sx = Math.floor(pan.x + tx * zoom) + 0.5;
          ctx.strokeStyle = tx % 32 === 0 ? '#2E3440' : tx % 5 === 0 ? '#23262C' : '#181A1F';
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height);
          ctx.stroke();
        }
        for (let ty = startTileY; ty <= endTileY; ty++) {
          const sy = Math.floor(pan.y + ty * zoom) + 0.5;
          ctx.strokeStyle = ty % 32 === 0 ? '#2E3440' : ty % 5 === 0 ? '#23262C' : '#181A1F';
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(width, sy);
          ctx.stroke();
        }
      } else if (zoom >= 1.5) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1E222A';
        const firstChunkX = Math.floor(startTileX / 32) * 32;
        for (let tx = firstChunkX; tx <= endTileX; tx += 32) {
          const sx = Math.floor(pan.x + tx * zoom) + 0.5;
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height);
          ctx.stroke();
        }
        const firstChunkY = Math.floor(startTileY / 32) * 32;
        for (let ty = firstChunkY; ty <= endTileY; ty += 32) {
          const sy = Math.floor(pan.y + ty * zoom) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(width, sy);
          ctx.stroke();
        }
      }

      // Draw Imported Base Grid Interior Boundary when active
      if (layout.gridFitReport?.hasGridFrame) {
        const ib = layout.gridFitReport.interiorBounds;
        const ix = pan.x + ib.minX * zoom;
        const iy = pan.y + ib.minY * zoom;
        const iw = (ib.maxX - ib.minX) * zoom;
        const ih = (ib.maxY - ib.minY) * zoom;
        ctx.save();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.025)';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.strokeStyle = layout.gridFitReport.fitsInsideFrame
          ? 'rgba(34, 211, 238, 0.48)'
          : 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(ix, iy, iw, ih);
        ctx.restore();
      }

      // Draw Stage Zones
      for (const zone of layout.zones) {
        const zx = pan.x + zone.tileX * zoom;
        const zy = pan.y + zone.tileY * zoom;
        const zw = zone.width * zoom;
        const zh = zone.height * zoom;
        const isStageFocused = selectedStageId === zone.stageId;
        const isZoneInTrace =
          !machineProcessTrace ||
          entities.some(
            (e) =>
              e.kind === 'machine' &&
              e.stageId === zone.stageId &&
              machineProcessTrace.entityNumbers.has(e.entityNumber)
          );

        ctx.save();
        ctx.globalAlpha = isZoneInTrace ? 1 : 0.18;
        ctx.strokeStyle = isStageFocused ? 'rgba(245, 158, 11, 0.7)' : 'rgba(71, 85, 105, 0.35)';
        ctx.lineWidth = isStageFocused ? 1.5 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(zx - 4, zy - 4, zw + 8, zh + 8);

        if (zoom >= 11) {
          ctx.fillStyle = isStageFocused ? '#FBBF24' : '#94A3B8';
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(`${zone.label} (${zone.machineCount}x)`, zx, zy - 8);
        }
        ctx.restore();
      }

      // Collect viewport-culled entities into layered render buckets
      interface DrawItem {
        ent: GridEntity;
        x: number;
        y: number;
        w: number;
        h: number;
        cx: number;
        cy: number;
      }

      const groundObstacles: DrawItem[] = [];
      const productionItems: DrawItem[] = [];
      const signalAndStopItems: DrawItem[] = [];
      let selectedDrawItem: DrawItem | null = null;

      for (const ent of entities) {
        const previewShiftX =
          moveProdPreviewDelta && !ent.isGridFrame ? moveProdPreviewDelta.dx : 0;
        const previewShiftY =
          moveProdPreviewDelta && !ent.isGridFrame ? moveProdPreviewDelta.dy : 0;
        const drawTileX = ent.tileX + (ent.bpOffsetX ?? 0) + previewShiftX;
        const drawTileY = ent.tileY + (ent.bpOffsetY ?? 0) + previewShiftY;

        if (
          drawTileX + ent.width + 2 < startTileX ||
          drawTileX - 2 > endTileX ||
          drawTileY + ent.height + 2 < startTileY ||
          drawTileY - 2 > endTileY
        ) {
          continue;
        }

        const x = pan.x + drawTileX * zoom;
        const y = pan.y + drawTileY * zoom;
        const w = ent.width * zoom;
        const h = ent.height * zoom;
        const item: DrawItem = { ent, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };

        if (selectedEntityNum === ent.entityNumber) {
          selectedDrawItem = item;
        }

        if (ent.kind === 'grid-obstacle') {
          if (ent.name.includes('rail-signal') || ent.name.includes('train-stop')) {
            signalAndStopItems.push(item);
          } else if (isRailTrackEntityName(ent.name) || ent.name.includes('rail-ramp')) {
            // Rendered continuously in Pass 3 from interpreted RailFlowNetwork
          } else {
            groundObstacles.push(item);
          }
        } else {
          productionItems.push(item);
        }
      }

      // Pass 1: Non-rail Ground Obstacles (Walls, Roboports, Solar, Chests, Rail Supports)
      ctx.save();
      if (machineProcessTrace) ctx.globalAlpha = 0.25;
      for (const { ent, x, y, w, h } of groundObstacles) {
        const obsImg = spritePackStore.resolveImage(ent.name);
        const wikiObsImg = !obsImg ? wikiEntitySprites.resolveImage(ent.name) : undefined;
        if (obsImg) {
          ctx.drawImage(obsImg, x + 1, y + 1, w - 2, h - 2);
        } else if (wikiObsImg) {
          const borderCol = ent.accentColor
            ? ent.accentColor
            : ent.name.includes('roboport')
              ? '#F59E0B'
              : ent.name.includes('chest')
                ? '#94A3B8'
                : '#475569';
          drawChamferedWikiSprite(ctx, wikiObsImg, x, y, w, h, zoom, borderCol, 1.2, 0.09);
        } else {
          drawGroundObstacleVectorSprite(ctx, ent, x, y, w, h, zoom, tSec, false);
        }
        if (ent.chestFilterItem && zoom >= 10) {
          const dotCol = index.resourcesById.get(ent.chestFilterItem)?.color ?? ent.accentColor ?? '#38BDF8';
          ctx.fillStyle = dotCol;
          ctx.beginPath();
          ctx.arc(x + w * 0.78, y + h * 0.24, Math.max(2.2, zoom * 0.14), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0B0E14';
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
      ctx.restore();

      // Pass 2: Production Entities (Belts, Pipes, Inserters, Beacons, Poles, Machines)
      for (const { ent, x, y, w, h } of productionItems) {
        const isSelected = selectedEntityNum === ent.entityNumber;
        const isStageSelected = selectedStageId && ent.stageId === selectedStageId;
        const itemAlpha = machineProcessTrace
          ? machineProcessTrace.entityNumbers.has(ent.entityNumber)
            ? 1
            : 0.13
          : 1;
        ctx.save();
        ctx.globalAlpha = itemAlpha;

        if (ent.kind === 'transport-belt' || ent.kind === 'underground-belt') {
          const beltColor = getBeltColor(ent.name);
          const wikiBeltImg = wikiEntitySprites.resolveImage(ent.name);
          drawTransportBeltSprite(
            ctx,
            ent,
            x,
            y,
            w,
            h,
            zoom,
            tSec,
            beltColor,
            (itemId) => {
              const res = index.resourcesById.get(itemId);
              return {
                color: res?.color ?? '#E2E8F0',
                img: zoom >= 14 ? spritePackStore.resolveImage(itemId, res?.iconPath) : undefined,
              };
            },
            wikiBeltImg
          );
        } else if (ent.kind === 'splitter') {
          const beltColor = getBeltColor(ent.name);
          const wikiSplitterImg = wikiEntitySprites.resolveImage(ent.name);
          drawSplitterSprite(ctx, ent, x, y, w, h, zoom, tSec, beltColor, wikiSplitterImg);
        } else if (ent.kind === 'pipe' || ent.kind === 'pipe-to-ground') {
          const fluidColor = ent.fluidId
            ? index.resourcesById.get(ent.fluidId)?.color ?? '#06B6D4'
            : '#06B6D4';
          const mask = getPipeNeighborMask(ent, entitySpatialLookup);
          drawPipeSprite(ctx, ent, x, y, w, h, zoom, fluidColor, mask);
        } else if (ent.kind === 'inserter') {
          const insColor = getInserterColor(ent.name);
          const role = classifyInserterRole(ent, entitySpatialLookup);
          const handItemId = ent.inserterItems?.[0];
          const handItemColor = handItemId
            ? index.resourcesById.get(handItemId)?.color
            : undefined;
          drawInserterSprite(
            ctx,
            ent,
            x,
            y,
            w,
            h,
            zoom,
            tSec,
            false,
            role,
            insColor,
            handItemColor
          );
        } else if (ent.kind === 'beacon') {
          const isSingularity = ent.name.includes('singularity');
          const beaconDef = index.beaconsById.get(ent.name);
          const beaconImg = spritePackStore.resolveImage(ent.name, beaconDef?.iconPath);
          const wikiBeaconImg = !beaconImg ? wikiEntitySprites.resolveImage(ent.name) : undefined;

          if (
            isSelected ||
            (hoverTile &&
              hoverTile.x >= ent.tileX &&
              hoverTile.x < ent.tileX + ent.width &&
              hoverTile.y >= ent.tileY &&
              hoverTile.y < ent.tileY + ent.height)
          ) {
            const rad = (isSingularity ? 2 : 3) * zoom;
            ctx.save();
            ctx.fillStyle = isSingularity ? 'rgba(168, 85, 247, 0.08)' : 'rgba(56, 189, 248, 0.08)';
            ctx.strokeStyle = isSingularity ? 'rgba(168, 85, 247, 0.45)' : 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.fillRect(x - rad, y - rad, w + rad * 2, h + rad * 2);
            ctx.strokeRect(x - rad, y - rad, w + rad * 2, h + rad * 2);
            ctx.restore();
          }

          if (beaconImg) {
            ctx.fillStyle = '#192230';
            ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
            ctx.strokeStyle = isStageSelected ? '#F59E0B' : isSingularity ? '#A855F7' : '#38BDF8';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
            ctx.drawImage(beaconImg, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
          } else if (wikiBeaconImg) {
            const strokeCol = isStageSelected ? '#F59E0B' : isSingularity ? '#A855F7' : '#38BDF8';
            drawChamferedWikiSprite(ctx, wikiBeaconImg, x, y, w, h, zoom, strokeCol, 1.5, 0.09);
          } else {
            drawBeaconVectorSprite(ctx, ent, x, y, w, h, zoom, tSec, false, Boolean(isStageSelected));
          }

          if (ent.moduleIds && ent.moduleIds.length > 0 && zoom >= 12) {
            ent.moduleIds.slice(0, 4).forEach((mId, idx) => {
              const modColor = mId.includes('speed')
                ? '#38BDF8'
                : mId.includes('efficiency')
                  ? '#4ADE80'
                  : '#FB7185';
              const s = Math.max(3, zoom * 0.2);
              ctx.fillStyle = modColor;
              ctx.fillRect(x + 5 + idx * (s + 2), y + h - s - 5, s, s);
            });
          }
        } else if (ent.kind === 'electric-pole') {
          const poleDef = index.pack.electricPoles?.find((p) => p.id === ent.name);
          const poleImg = spritePackStore.resolveImage(ent.name, poleDef?.iconPath);
          const wikiPoleImg = !poleImg ? wikiEntitySprites.resolveImage(ent.name) : undefined;
          if (
            isSelected ||
            (hoverTile &&
              hoverTile.x >= ent.tileX &&
              hoverTile.x < ent.tileX + ent.width &&
              hoverTile.y >= ent.tileY &&
              hoverTile.y < ent.tileY + ent.height)
          ) {
            const areaRad = (poleDef?.supplyAreaDistance ?? 3.5) * zoom;
            ctx.save();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
            ctx.lineWidth = 1;
            ctx.fillRect(x + w / 2 - areaRad, y + h / 2 - areaRad, areaRad * 2, areaRad * 2);
            ctx.strokeRect(x + w / 2 - areaRad, y + h / 2 - areaRad, areaRad * 2, areaRad * 2);
            ctx.restore();
          }

          if (poleImg) {
            ctx.drawImage(poleImg, x + 1, y + 1, w - 2, h - 2);
          } else if (wikiPoleImg) {
            drawChamferedWikiSprite(
              ctx,
              wikiPoleImg,
              x,
              y,
              w,
              h,
              zoom,
              ent.width >= 2 ? '#38BDF8' : undefined,
              1.1,
              0.09
            );
          } else {
            drawElectricPoleVectorSprite(ctx, ent, x, y, w, h, zoom);
          }
        } else if (ent.kind === 'machine') {
          const accent = ent.accentColor ?? '#60A5FA';
          const machineDef = index.machinesById.get(ent.name);
          const machineImg = spritePackStore.resolveImage(ent.name, machineDef?.iconPath);
          const wikiMachineImg = !machineImg ? wikiEntitySprites.resolveImage(ent.name) : undefined;

          if (machineImg) {
            ctx.fillStyle = ent.name.startsWith('kr-') ? '#1D1B2A' : '#1C2430';
            ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
            ctx.strokeStyle = isStageSelected
              ? '#F59E0B'
              : ent.name.startsWith('kr-')
                ? '#6D28D9'
                : '#3B485C';
            ctx.lineWidth = isStageSelected ? 2 : 1.5;
            ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
            ctx.drawImage(machineImg, x + 4, y + 4, w - 8, h - 8);
          } else if (wikiMachineImg) {
            const strokeCol = isStageSelected
              ? '#F59E0B'
              : ent.name.startsWith('kr-')
                ? '#8B5CF6'
                : accent;
            drawChamferedWikiSprite(
              ctx,
              wikiMachineImg,
              x,
              y,
              w,
              h,
              zoom,
              strokeCol,
              isStageSelected ? 2.2 : 1.4,
              0.09
            );
          } else {
            drawMachineVectorSprite(
              ctx,
              ent,
              x,
              y,
              w,
              h,
              zoom,
              tSec,
              false,
              accent,
              Boolean(isStageSelected)
            );
          }

          const recipe = ent.recipeId ? index.recipesById.get(ent.recipeId) : undefined;
          const recipeRes = recipe ? index.resourcesById.get(recipe.mainProductId) : undefined;
          const recipeImg =
            ent.recipeId && zoom >= 12
              ? spritePackStore.resolveImage(
                  recipe?.mainProductId ?? ent.recipeId,
                  recipe?.iconPath ?? recipeRes?.iconPath
                )
              : undefined;

          if (recipeImg) {
            const badgeSize = Math.max(10, Math.min(w, h) * 0.42);
            ctx.fillStyle = 'rgba(13, 17, 23, 0.78)';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, badgeSize * 0.62, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(
              recipeImg,
              x + w / 2 - badgeSize / 2,
              y + h / 2 - badgeSize / 2,
              badgeSize,
              badgeSize
            );
          } else if (zoom >= 15 && ent.recipeId) {
            const label = ent.recipeId.replace(/^kr-/, '').slice(0, 5).toUpperCase();
            const pillR = Math.max(8, Math.min(w, h) * 0.22);
            ctx.fillStyle = 'rgba(11, 14, 20, 0.85)';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, pillR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = '#F8FAFC';
            ctx.font = `700 ${Math.max(7, Math.floor(zoom * 0.21))}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }

          if (ent.moduleIds && ent.moduleIds.length > 0 && zoom >= 12) {
            ent.moduleIds.slice(0, 5).forEach((mId, idx) => {
              const modColor = mId.includes('productivity')
                ? '#FB7185'
                : mId.includes('speed')
                  ? '#38BDF8'
                  : '#4ADE80';
              const s = Math.max(3, zoom * 0.2);
              ctx.fillStyle = modColor;
              ctx.fillRect(x + 5 + idx * (s + 2), y + h - s - 5, s, s);
            });
          }
        }
        ctx.restore();
      }

      // Draw Copper Power Wire Connections between adjacent Electric Poles
      const poles = entities.filter((e) => e.kind === 'electric-pole');
      if (poles.length > 1 && zoom >= 9) {
        ctx.save();
        if (machineProcessTrace) ctx.globalAlpha = 0.14;
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.42)';
        ctx.lineWidth = Math.max(1, zoom * 0.045);
        for (let i = 0; i < poles.length; i++) {
          const p1 = poles[i];
          const x1 = pan.x + (p1.tileX + (p1.bpOffsetX ?? 0) + p1.width / 2) * zoom;
          const y1 = pan.y + (p1.tileY + (p1.bpOffsetY ?? 0) + p1.height / 2) * zoom;
          for (let j = i + 1; j < poles.length; j++) {
            const p2 = poles[j];
            const distTiles = Math.hypot(p1.tileX - p2.tileX, p1.tileY - p2.tileY);
            if (distTiles <= 10.5) {
              const x2 = pan.x + (p2.tileX + (p2.bpOffsetX ?? 0) + p2.width / 2) * zoom;
              const y2 = pan.y + (p2.tileY + (p2.bpOffsetY ?? 0) + p2.height / 2) * zoom;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + zoom * 0.35, x2, y2);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // Pass 3: Continuous Welded Rail Network & Interpreted Directional Flow Chevrons
      ctx.save();
      if (machineProcessTrace) ctx.globalAlpha = 0.25;
      drawInterpretedRailFlowNetwork(
        ctx,
        railFlowNetwork,
        pan,
        zoom,
        startTileX,
        endTileX,
        startTileY,
        endTileY
      );

      // Pass 4: Rail Signals, Chain Signals & Fixed Train Stops on top of the rail flow
      for (const { ent, x, y, w, h, cx, cy } of signalAndStopItems) {
        if (ent.name.includes('rail-signal')) {
          drawRailSignalVectorSprite(ctx, ent, cx, cy, w, h, zoom);
        } else {
          const isActiveStop =
            trainStation &&
            (trainStation.lockedStopEntityNumber === ent.entityNumber ||
              (trainStation.tileX === ent.tileX && trainStation.tileY === ent.tileY));
          const isSelectingStop = tool === 'place-train-station' && railStops.length > 0;
          const wikiStopImg = wikiEntitySprites.resolveImage('train-stop');
          if (wikiStopImg) {
            const stopStroke = isActiveStop ? '#F59E0B' : isSelectingStop ? '#22D3EE' : '#EF4444';
            drawChamferedWikiSprite(
              ctx,
              wikiStopImg,
              x,
              y,
              w,
              h,
              zoom,
              stopStroke,
              isActiveStop ? 2.2 : 1.4,
              0.09
            );
            if (isActiveStop || isSelectingStop) {
              ctx.save();
              ctx.strokeStyle = isActiveStop ? 'rgba(245, 158, 11, 0.75)' : 'rgba(34, 211, 238, 0.8)';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 3]);
              ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
              ctx.restore();
            }
          } else {
            drawTrainStopVectorSprite(
              ctx,
              ent,
              x,
              y,
              w,
              h,
              zoom,
              cx,
              cy,
              Boolean(isActiveStop),
              isSelectingStop
            );
          }
        }
      }
      ctx.restore();

      if (selectedDrawItem) {
        const { x, y, w, h } = selectedDrawItem;
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      }

      // Draw Configured Train Entrance Station & Cargo Wagons Locked Along RailFlowNetwork
      const drawTrainAssembly = (
        stationConfig: TrainStationConfig,
        isGhost: boolean
      ) => {
        const carPoses = computeTrainCarPosesOnNetwork(
          railFlowNetwork,
          stationConfig,
          factoryCenter
        );
        if (carPoses.length === 0) return;

        ctx.save();
        if (isGhost) ctx.globalAlpha = 0.68;

        const carLen = 6.0 * zoom;
        const carWidth = 1.92 * zoom;

        // Draw each car along the exact rail flow tangent (Locomotive = 0, Cargo Wagons = 1..N)
        for (let ci = 0; ci < carPoses.length; ci++) {
          const pose = carPoses[ci];
          const px = pan.x + pose.centerX * zoom;
          const py = pan.y + pose.centerY * zoom;

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(pose.angleRad);

          if (ci === 0) {
            // Locomotive (Cab facing +X; front bumper at +carLen/2 flush with train-stop front)
            const halfL = carLen / 2;
            const halfW = carWidth / 2;
            const taper = Math.min(halfL * 0.16, zoom * 0.42);

            // Front headlight beam cone
            ctx.fillStyle = 'rgba(253, 224, 71, 0.16)';
            ctx.beginPath();
            ctx.moveTo(halfL, -halfW * 0.4);
            ctx.lineTo(halfL + zoom * 2.2, -halfW * 1.1);
            ctx.lineTo(halfL + zoom * 2.2, halfW * 1.1);
            ctx.lineTo(halfL, halfW * 0.4);
            ctx.closePath();
            ctx.fill();

            // Tapered nose chassis
            ctx.fillStyle = '#991B1B';
            ctx.beginPath();
            ctx.moveTo(-halfL, -halfW);
            ctx.lineTo(halfL - taper, -halfW);
            ctx.lineTo(halfL, -halfW * 0.68);
            ctx.lineTo(halfL, halfW * 0.68);
            ctx.lineTo(halfL - taper, halfW);
            ctx.lineTo(-halfL, halfW);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#F87171';
            ctx.lineWidth = Math.max(1.5, zoom * 0.09);
            ctx.stroke();

            // Cab windshield near nose + engine radiator roof behind
            ctx.fillStyle = '#BAE6FD';
            ctx.fillRect(halfL - taper * 1.55, -halfW * 0.66, Math.max(2, zoom * 0.42), carWidth * 0.66);
            ctx.fillStyle = '#450A0A';
            ctx.fillRect(-halfL * 0.82, -halfW * 0.54, carLen * 0.48, carWidth * 0.54);

            // Crisp front alignment bumper flush with train-stop front
            ctx.fillStyle = '#FACC15';
            ctx.fillRect(halfL - Math.max(2, zoom * 0.14), -halfW * 0.72, Math.max(2, zoom * 0.14), carWidth * 0.72);
          } else {
            // Cargo Wagon trailing behind locomotive with coupler + optimized slot slices
            const wi = ci - 1;
            const wPlan = trainPlan?.wagons[wi];

            // Coupler bar linking wagon forward toward preceding car
            ctx.fillStyle = '#94A3B8';
            ctx.fillRect(carLen / 2, -Math.max(1.5, zoom * 0.12), zoom * 1.0, Math.max(3, zoom * 0.24));

            ctx.fillStyle = '#1E242E';
            ctx.fillRect(-carLen / 2, -carWidth / 2, carLen, carWidth);

            if (wPlan && wPlan.slices.length > 0 && wPlan.totalSlots > 0) {
              let offsetRatio = 0;
              for (const sl of wPlan.slices) {
                const frac = sl.slots / wPlan.totalSlots;
                ctx.fillStyle = sl.color;
                ctx.fillRect(
                  -carLen / 2 + 2 + offsetRatio * (carLen - 4),
                  -carWidth / 2 + 3,
                  Math.max(2, frac * (carLen - 4)),
                  carWidth - 6
                );
                offsetRatio += frac;
              }
            }

            ctx.strokeStyle = wPlan?.isMixed ? '#F59E0B' : '#22D3EE';
            ctx.lineWidth = Math.max(1.4, zoom * 0.08);
            ctx.strokeRect(-carLen / 2, -carWidth / 2, carLen, carWidth);

            if (zoom >= 6) {
              ctx.save();
              if (Math.cos(pose.angleRad) < 0) {
                ctx.rotate(Math.PI);
              }
              ctx.fillStyle = '#0B0D12';
              ctx.font = `700 ${Math.max(8, Math.min(13, zoom * 0.44))}px "JetBrains Mono", monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`#${wi + 1}`, 0, 0);
              ctx.restore();
            }
          }

          ctx.restore();
        }

        // Station Banner above locomotive
        if (!isGhost && carPoses[0]) {
          const locoPose = carPoses[0];
          const lx = pan.x + locoPose.centerX * zoom;
          const ly = pan.y + locoPose.centerY * zoom;
          const badgeText = trainPlan
            ? `🚂 ${stationConfig.wagonCount}× ${t.canvas.trainModal.wagonPrefix} · ${
                trainPlan.requiresMixedWagons
                  ? t.canvas.trainModal.mixedBadge
                  : t.canvas.trainModal.dedicatedBadge
              }`
            : `🚂 ${stationConfig.wagonCount}×`;
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          const tw = ctx.measureText(badgeText).width + 14;
          const bx = lx - tw / 2;
          const by = ly - zoom * 2.2 - 18;
          ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
          ctx.fillRect(bx, by, tw, 20);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(bx, by, tw, 20);
          ctx.fillStyle = '#FDE68A';
          ctx.fillText(badgeText, bx + 7, by + 13.5);
        }

        ctx.restore();
      };

      if (trainStation) {
        ctx.save();
        if (machineProcessTrace) ctx.globalAlpha = 0.28;
        drawTrainAssembly(trainStation, false);
        ctx.restore();
      }

      // Draw External Input & Final Output Port Indicators (Train / Main Bus entry markers)
      const activePorts = (layout.ports ?? []).filter((port) =>
        entities.some((e) => e.tileX === port.tileX && e.tileY === port.tileY)
      );

      if (activePorts.length > 0) {
        const southInputs = activePorts
          .filter((p) => p.directionType === 'input' && p.side === 'south')
          .sort((a, b) => a.tileX - b.tileX);
        const northInputs = activePorts
          .filter((p) => p.directionType === 'input' && p.side === 'north')
          .sort((a, b) => a.tileX - b.tileX);
        const westInputs = activePorts
          .filter((p) => p.directionType === 'input' && p.side === 'west')
          .sort((a, b) => a.tileY - b.tileY);
        const eastInputs = activePorts
          .filter((p) => p.directionType === 'input' && p.side === 'east')
          .sort((a, b) => a.tileY - b.tileY);
        const northOutputs = activePorts
          .filter((p) => p.directionType === 'output')
          .sort((a, b) => a.tileX - b.tileX);

        const drawPort = (
          port: (typeof activePorts)[number],
          staggerRow: number
        ) => {
          const isInput = port.directionType === 'input';
          const color = isInput ? '#22D3EE' : '#F59E0B';
          const bgFill = isInput ? 'rgba(8, 30, 42, 0.94)' : 'rgba(34, 24, 10, 0.94)';
          const cx = pan.x + (port.tileX + 0.5) * zoom;
          const cy = pan.y + (port.tileY + 0.5) * zoom;

          const pulse = 0;

          // 1. Highlight frame on the entry/exit tile itself
          const isPortInTrace =
            !machineProcessTrace ||
            machineProcessTrace.portKeys.has(`${port.tileX},${port.tileY}`);
          ctx.save();
          if (!isPortInTrace) ctx.globalAlpha = 0.13;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1.5, zoom * 0.08);
          ctx.strokeRect(
            pan.x + port.tileX * zoom + 1,
            pan.y + port.tileY * zoom + 1,
            zoom - 2,
            zoom - 2
          );

          // 2. Directional arrow pointing INTO (input) or OUT OF (output) the belt/pipe
          ctx.fillStyle = color;
          ctx.beginPath();
          const aSz = Math.max(5, zoom * 0.34);
          if (port.side === 'south') {
            const tipY = pan.y + (port.tileY + 1) * zoom + 3 + pulse;
            ctx.moveTo(cx, tipY);
            ctx.lineTo(cx - aSz * 0.65, tipY + aSz * 0.9);
            ctx.lineTo(cx + aSz * 0.65, tipY + aSz * 0.9);
          } else if (port.side === 'west') {
            const tipX = pan.x + port.tileX * zoom - 3 + pulse;
            ctx.moveTo(tipX, cy);
            ctx.lineTo(tipX - aSz * 0.9, cy - aSz * 0.65);
            ctx.lineTo(tipX - aSz * 0.9, cy + aSz * 0.65);
          } else if (port.side === 'east') {
            const tipX = pan.x + (port.tileX + 1) * zoom + 3 - pulse;
            ctx.moveTo(tipX, cy);
            ctx.lineTo(tipX + aSz * 0.9, cy - aSz * 0.65);
            ctx.lineTo(tipX + aSz * 0.9, cy + aSz * 0.65);
          } else if (isInput && port.side === 'north') {
            const tipY = pan.y + port.tileY * zoom - 3 + pulse;
            // Point DOWN into the top edge of the belt
            ctx.moveTo(cx, tipY);
            ctx.lineTo(cx - aSz * 0.65, tipY - aSz * 0.9);
            ctx.lineTo(cx + aSz * 0.65, tipY - aSz * 0.9);
          } else {
            const tipY = pan.y + port.tileY * zoom - 12 - pulse;
            // Point UP out of the north exit belt
            ctx.moveTo(cx, tipY);
            ctx.lineTo(cx - aSz * 0.65, tipY + aSz * 0.9);
            ctx.lineTo(cx + aSz * 0.65, tipY + aSz * 0.9);
          }
          ctx.closePath();
          ctx.fill();

          // 3. Callout Badge with Item Icon + Name + Rate/Belts
          const res1 = index.resourcesById.get(port.itemId);
          const res2 = port.partnerItemId
            ? index.resourcesById.get(port.partnerItemId)
            : undefined;
          const img1 = spritePackStore.resolveImage(port.itemId, res1?.iconPath);
          const img2 = port.partnerItemId
            ? spritePackStore.resolveImage(port.partnerItemId, res2?.iconPath)
            : undefined;

          if (zoom < 9) {
            const southMult = trainStation && isInput ? 3.2 : 1.15;
            const dotY =
              port.side === 'south'
                ? cy + zoom * southMult
                : port.side === 'west' || port.side === 'east'
                  ? cy
                  : cy - zoom * 1.15;
            const dotX =
              port.side === 'west'
                ? cx - zoom * 1.15
                : port.side === 'east'
                  ? cx + zoom * 1.15
                  : cx;
            ctx.fillStyle = res1?.color ?? color;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
          }

          const shortName1 = (res1?.name ?? port.itemId).replace(/^K2\s+/i, '');
          const shortName2 = res2 ? res2.name.replace(/^K2\s+/i, '') : undefined;
          const title = shortName2 ? `${shortName1} + ${shortName2}` : shortName1;
          const metric =
            port.kind === 'fluid'
              ? `${t.canvas.pipeShort} · ${(port.ratePerSec * 60).toFixed(0)}/m`
              : `${Math.max(0.1, port.beltsRequired).toFixed(1)} ${t.canvas.beltsShort}`;
          const tag = isInput ? t.canvas.portIn : t.canvas.portOut;
          const fullText = `${tag} · ${title} (${metric})`;

          ctx.font = '600 10.5px "Plus Jakarta Sans", sans-serif';
          const textW = ctx.measureText(fullText).width;
          const iconSpace = res2 ? 32 : 18;
          const boxW = textW + iconSpace + 14;
          const boxH = 20;

          let bx = cx - boxW / 2;
          let by = cy;
          if (port.side === 'south') {
            const trainClearance = trainStation && isInput ? Math.max(zoom * 2.8, 38) : 0;
            by = pan.y + (port.tileY + 1) * zoom + 16 + trainClearance + staggerRow * 24;
            ctx.strokeStyle = isInput ? 'rgba(34, 211, 238, 0.5)' : 'rgba(245, 158, 11, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(cx, pan.y + (port.tileY + 1) * zoom + 8);
            ctx.lineTo(cx, by);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (port.side === 'west') {
            bx = pan.x + port.tileX * zoom - 16 - boxW - staggerRow * 14;
            by = cy - boxH / 2;
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(pan.x + port.tileX * zoom - 10, cy);
            ctx.lineTo(bx + boxW, cy);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (port.side === 'east') {
            bx = pan.x + (port.tileX + 1) * zoom + 16 + staggerRow * 14;
            by = cy - boxH / 2;
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(pan.x + (port.tileX + 1) * zoom + 10, cy);
            ctx.lineTo(bx, cy);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            by = pan.y + port.tileY * zoom - 16 - boxH - staggerRow * 24;
            ctx.strokeStyle = isInput ? 'rgba(34, 211, 238, 0.5)' : 'rgba(245, 158, 11, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(cx, pan.y + port.tileY * zoom - 10);
            ctx.lineTo(cx, by + boxH);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          ctx.fillStyle = bgFill;
          ctx.fillRect(bx, by, boxW, boxH);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(bx, by, boxW, boxH);

          // Icons inside badge
          const drawBadgeIcon = (
            img: HTMLImageElement | undefined,
            fallbackColor: string,
            ix: number,
            iy: number
          ) => {
            if (img) {
              ctx.drawImage(img, ix, iy, 13, 13);
            } else {
              ctx.fillStyle = fallbackColor;
              ctx.beginPath();
              ctx.arc(ix + 6.5, iy + 6.5, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          };

          drawBadgeIcon(img1, res1?.color ?? color, bx + 5, by + 3.5);
          if (res2) {
            drawBadgeIcon(img2, res2.color, bx + 20, by + 3.5);
          }

          ctx.fillStyle = isInput ? '#CFFAFE' : '#FEF3C7';
          ctx.textBaseline = 'middle';
          ctx.fillText(fullText, bx + 6 + iconSpace, by + boxH / 2 + 0.5);
          ctx.textBaseline = 'alphabetic';
          ctx.restore();
        };

        southInputs.forEach((p, idx) => drawPort(p, idx % 3));
        northInputs.forEach((p, idx) => drawPort(p, idx % 3));
        westInputs.forEach((p, idx) => drawPort(p, idx % 2));
        eastInputs.forEach((p, idx) => drawPort(p, idx % 2));
        northOutputs.forEach((p, idx) => drawPort(p, idx % 2));
      }

      // Hover Tile Ghost / Placement Preview
      if (hoverTile) {
        const hx = pan.x + hoverTile.x * zoom;
        const hy = pan.y + hoverTile.y * zoom;
        if (tool === 'place-train-station') {
          const hoveredStop =
            railStops.length > 0
              ? railStops.find(
                  (s) =>
                    Math.hypot(hoverTile.x + 0.5 - s.stopCenter.x, hoverTile.y + 0.5 - s.stopCenter.y) <=
                    3.5
                )
              : undefined;
          const nearbySnap =
            !hoveredStop && railFlowNetwork.chains.length > 0
              ? snapStationToRail(railFlowNetwork, hoverTile.x + 0.5, hoverTile.y + 0.5, 4)
              : null;

          if (hoveredStop) {
            drawTrainAssembly(
              {
                tileX: hoveredStop.tileX,
                tileY: hoveredStop.tileY,
                direction: hoveredStop.direction,
                wagonCount: trainStation?.wagonCount ?? 2,
                slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
                stackSizeOverrides: trainStation?.stackSizeOverrides,
              },
              true
            );
          } else if (nearbySnap) {
            ctx.save();
            ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
            ctx.strokeStyle = '#22D3EE';
            ctx.lineWidth = 2;
            ctx.fillRect(
              pan.x + nearbySnap.tileX * zoom,
              pan.y + nearbySnap.tileY * zoom,
              2 * zoom,
              2 * zoom
            );
            ctx.strokeRect(
              pan.x + nearbySnap.tileX * zoom,
              pan.y + nearbySnap.tileY * zoom,
              2 * zoom,
              2 * zoom
            );
            ctx.restore();
            drawTrainAssembly(
              {
                tileX: nearbySnap.tileX,
                tileY: nearbySnap.tileY,
                direction: nearbySnap.direction,
                wagonCount: trainStation?.wagonCount ?? 2,
                slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
                stackSizeOverrides: trainStation?.stackSizeOverrides,
              },
              true
            );
          } else {
            ctx.save();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 1.8;
            ctx.fillRect(hx, hy, 2 * zoom, 2 * zoom);
            ctx.strokeRect(hx, hy, 2 * zoom, 2 * zoom);
            ctx.restore();
            drawTrainAssembly(
              {
                tileX: hoverTile.x,
                tileY: hoverTile.y,
                direction: placeDirection,
                wagonCount: trainStation?.wagonCount ?? 2,
                slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
                stackSizeOverrides: trainStation?.stackSizeOverrides,
              },
              true
            );
          }
        } else if (tool.startsWith('place-')) {
          const isSplitter = tool === 'place-splitter';
          const isBeacon = tool === 'place-beacon';
          const gw = isBeacon
            ? index.pack.beacons[0]?.tileSize.width ?? 3
            : isSplitter && (placeDirection === 0 || placeDirection === 8)
              ? 2
              : 1;
          const gh = isBeacon
            ? index.pack.beacons[0]?.tileSize.height ?? 3
            : isSplitter && (placeDirection === 4 || placeDirection === 12)
              ? 2
              : 1;
          const valid = canPlaceAt(hoverTile.x, hoverTile.y, gw, gh);
          ctx.fillStyle = valid ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.3)';
          ctx.strokeStyle = valid ? '#10B981' : '#EF4444';
          ctx.lineWidth = 1.5;
          ctx.fillRect(hx, hy, gw * zoom, gh * zoom);
          ctx.strokeRect(hx, hy, gw * zoom, gh * zoom);
        } else {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(hx, hy, zoom, zoom);
        }
      }

      ctx.restore();
    };

    renderFrame();
  }, [
    canPlaceAt,
    containerSizeTick,
    entities,
    factoryCenter,
    hoverTile,
    machineProcessTrace,
    index.beaconsById,
    index.machinesById,
    index.pack.beacons,
    index.pack.electricPoles,
    index.recipesById,
    index.resourcesById,
    layout.gridFitReport,
    layout.ports,
    layout.zones,
    moveProdPreviewDelta,
    pan,
    placeDirection,
    railFlowNetwork,
    railStops,
    selectedEntityNum,
    selectedStageId,
    spriteTick,
    t.canvas.beltsShort,
    t.canvas.pipeShort,
    t.canvas.portIn,
    t.canvas.portOut,
    t.canvas.trainModal.dedicatedBadge,
    t.canvas.trainModal.mixedBadge,
    t.canvas.trainModal.wagonPrefix,
    tool,
    trainPlan,
    trainStation,
    zoom,
  ]);

  const blueprintString = useMemo(() => {
    if (!blueprintModalOpen) return '';
    return encodeBlueprintString(
      entities,
      projectName,
      t.canvas.generatedBy
    );
  }, [blueprintModalOpen, entities, projectName, t.canvas.generatedBy]);

  const blueprintJson = useMemo(() => {
    if (!blueprintModalOpen || !showRawJson) return '';
    return JSON.stringify(buildBlueprintJson(entities, projectName), null, 2);
  }, [blueprintModalOpen, showRawJson, entities, projectName]);

  const handleCopyBlueprint = async () => {
    try {
      await navigator.clipboard.writeText(blueprintString);
      setCopiedBp(true);
      setTimeout(() => setCopiedBp(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleImportBlueprint = () => {
    setImportError(null);
    try {
      const parsed = parseBlueprintToEntities(importText, index);
      if (parsed.entities.length === 0) {
        setImportError(t.canvas.emptyBlueprintError);
        return;
      }

      if (importMode === 'grid-frame' && onImportGridFrame) {
        onImportGridFrame(parsed.entities);
      } else {
        onChangeEntities(parsed.entities);
      }

      setImportModalOpen(false);
      setImportText('');
      setSelectedEntityNum(null);

      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const { bounds } = computeLayoutStats(parsed.entities);
        const w = Math.max(4, bounds.maxX - bounds.minX + 6);
        const h = Math.max(4, bounds.maxY - bounds.minY + 6);
        const nextZoom = Math.max(1.2, Math.min(48, Math.min(rect.width / w, rect.height / h)));
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        setZoom(nextZoom);
        setPan({
          x: rect.width / 2 - centerX * nextZoom,
          y: rect.height / 2 - centerY * nextZoom,
        });
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t.canvas.invalidBlueprintError);
    }
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-[#121316]">
      {/* Top FBE-style Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#181A1E] border-b border-[#32363E]">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'select', label: t.canvas.tools.select, icon: MousePointer2 },
            { id: 'pan', label: t.canvas.tools.pan, icon: Hand },
            ...(onChangeLayoutOptions
              ? [{ id: 'move-production', label: t.canvas.tools.moveProduction, icon: Move }]
              : []),
            ...(onChangeTrainStation
              ? [{ id: 'place-train-station', label: t.canvas.tools.trainEntrance, icon: TrainFront }]
              : []),
            { id: 'place-belt', label: t.canvas.tools.belt },
            { id: 'place-underground', label: t.canvas.tools.underground },
            { id: 'place-splitter', label: t.canvas.tools.splitter },
            { id: 'place-inserter', label: t.canvas.tools.inserter },
            { id: 'place-long-inserter', label: t.canvas.tools.longInserter },
            { id: 'place-pipe', label: t.canvas.tools.pipe },
            { id: 'place-beacon', label: t.canvas.tools.beacon },
            { id: 'place-pole', label: t.canvas.tools.pole },
            { id: 'erase', label: t.canvas.tools.erase, icon: Eraser },
          ].map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id as EditorTool)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]'
                    : 'bg-[#23252B] text-slate-300 hover:bg-[#2C2F36] hover:text-white border border-[#32363E]'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleRotateSelectedOrPreview}
            title={t.canvas.rotateTooltip}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37] whitespace-nowrap"
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            {t.canvas.directions[selectedEntity ? selectedEntity.direction : placeDirection]}
          </button>

          {onChangeLayoutOptions && (
            <>
              <button
                type="button"
                onClick={() =>
                  onChangeLayoutOptions({
                    layoutRotation: ((((layoutOptions?.layoutRotation ?? 0) + 4) % 16) as Direction),
                  })
                }
                title={t.canvas.rotateFactoryTooltip}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border whitespace-nowrap ${
                  (layoutOptions?.layoutRotation ?? 0) !== 0
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                    : 'bg-[#1A2029] border-[#28313E] text-slate-200 hover:bg-[#232B37]'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                {t.canvas.rotateFactoryBtn} {((layoutOptions?.layoutRotation ?? 0) / 4) * 90}°
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLayoutOptions({
                    includeBeacons: !(layoutOptions?.includeBeacons ?? true),
                  })
                }
                className={`px-2 py-1.5 text-xs font-medium rounded border whitespace-nowrap ${
                  (layoutOptions?.includeBeacons ?? true)
                    ? 'bg-[#1E293B] border-sky-500/60 text-sky-300'
                    : 'bg-[#1A2029] border-[#28313E] text-slate-400'
                }`}
              >
                {t.canvas.beacons}
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLayoutOptions({
                    includePowerPoles: !(layoutOptions?.includePowerPoles ?? true),
                  })
                }
                className={`px-2 py-1.5 text-xs font-medium rounded border whitespace-nowrap ${
                  (layoutOptions?.includePowerPoles ?? true)
                    ? 'bg-[#1E293B] border-sky-500/60 text-sky-300'
                    : 'bg-[#1A2029] border-[#28313E] text-slate-400'
                }`}
              >
                {t.canvas.poles}
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLayoutOptions({
                    directInsertion: !(layoutOptions?.directInsertion ?? false),
                  })
                }
                title={t.canvas.directInsertionTooltip}
                className={`px-2 py-1.5 text-xs font-medium rounded border whitespace-nowrap ${
                  layoutOptions?.directInsertion
                    ? 'bg-[#1E293B] border-emerald-500/60 text-emerald-300'
                    : 'bg-[#1A2029] border-[#28313E] text-slate-400'
                }`}
              >
                {t.canvas.directInsertion}
              </button>

              <div className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() =>
                    onChangeLayoutOptions({
                      inputSide:
                        (layoutOptions?.inputSide ?? 'distributed') === 'distributed'
                          ? 'south'
                          : 'distributed',
                    })
                  }
                  title={t.canvas.sameSideTooltip}
                  className={`px-2.5 py-1.5 text-xs font-medium border whitespace-nowrap transition-colors ${
                    (layoutOptions?.inputSide ?? 'distributed') !== 'distributed'
                      ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-200 rounded-l'
                      : 'bg-[#1A2029] border-[#28313E] text-slate-300 hover:border-cyan-500/50 hover:text-white rounded'
                  }`}
                >
                  {t.canvas.sameSideInputs}
                </button>
                {(layoutOptions?.inputSide ?? 'distributed') !== 'distributed' && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeLayoutOptions({
                        inputSide: layoutOptions?.inputSide === 'south' ? 'west' : 'south',
                      })
                    }
                    title={t.canvas.sameSideTooltip}
                    className="px-2 py-1.5 text-xs font-mono font-semibold bg-[#132936] border border-l-0 border-cyan-500/60 text-cyan-300 hover:text-white rounded-r whitespace-nowrap"
                  >
                    {layoutOptions?.inputSide === 'west'
                      ? t.canvas.inputSideWest
                      : t.canvas.inputSideSouth}
                  </button>
                )}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => onToggleCompaction(compactionMode === 'compact' ? 'standard' : 'compact')}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37] whitespace-nowrap"
          >
            {compactionMode === 'compact' ? t.canvas.spaceCompact : t.canvas.spaceStandard}
          </button>

          <button
            type="button"
            onClick={onResetAutoLayout}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37] whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t.canvas.autoLayout}
          </button>

          {hasGridFrame && layout.gridFitReport && (
            <div className="inline-flex items-center">
              <span
                className={`px-2 py-1.5 text-xs font-mono rounded-l border whitespace-nowrap ${
                  layout.gridFitReport.fitsInsideFrame
                    ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                    : 'bg-amber-950/50 border-amber-500/60 text-amber-300'
                }`}
              >
                {t.canvas.gridFrameBadge} {layout.gridFitReport.interiorWidth}×{layout.gridFitReport.interiorHeight} ·{' '}
                {layout.gridFitReport.fitsInsideFrame
                  ? t.canvas.gridFrameFits
                  : `${t.canvas.gridFramePartial} ${layout.gridFitReport.placedMachines}/${layout.gridFitReport.requestedMachines}`}
              </span>
              {onClearGridFrame && (
                <button
                  type="button"
                  onClick={onClearGridFrame}
                  className="px-2 py-1.5 text-xs font-medium text-red-300 bg-[#1A2029] border border-l-0 border-[#28313E] rounded-r hover:bg-red-950/40 whitespace-nowrap"
                >
                  × {t.canvas.clearGridFrame}
                </button>
              )}
            </div>
          )}

          {onChangeTrainStation && (
            <button
              type="button"
              onClick={() => setTrainModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border whitespace-nowrap transition-colors ${
                trainStation
                  ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-[#1A2029] border-[#28313E] text-slate-200 hover:border-amber-500/60 hover:text-white'
              }`}
            >
              <TrainFront className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.canvas.trainPlannerBtn}</span>
              {trainPlan && (
                <span className="font-mono text-[11px] text-cyan-300">
                  ({trainPlan.wagonCount}v)
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setImportMode(onImportGridFrame ? 'grid-frame' : 'replace');
              setImportModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37] whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            {t.canvas.importBp}
          </button>

          <button
            type="button"
            onClick={() => setBlueprintModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5" />
            {t.canvas.exportBp}
          </button>
        </div>
      </div>

      {/* Main 2D Canvas Viewport */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            setHoverTile(null);
          }}
          onWheel={handleWheel}
          className={`w-full h-full block ${
            tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
          }`}
        />

        {/* Selected Entity Quick Floating Info */}
        {selectedEntity && (
          <div className="absolute top-3 left-3 p-3 bg-[#141920]/95 border border-[#2A3444] rounded-md text-xs space-y-1.5 max-w-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold text-slate-100">{selectedEntity.name}</span>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="text-red-400 hover:text-red-300 text-[11px]"
              >
                {t.canvas.removeEntity}
              </button>
            </div>
            <div className="text-slate-400 font-mono tabular-nums">
              Pos ({selectedEntity.tileX}, {selectedEntity.tileY}) · {selectedEntity.width}×{selectedEntity.height} · {t.canvas.directions[selectedEntity.direction]}
            </div>
            {selectedEntity.recipeId && (
              <div className="text-amber-400">{t.canvas.recipeLabel} {selectedEntity.recipeId}</div>
            )}
            {selectedEntity.kind === 'machine' && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsolateMachineProcess((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                    isolateMachineProcess
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : 'bg-[#1D222B] border-[#32363E] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  {isolateMachineProcess
                    ? t.canvas.processIsolated
                    : t.canvas.showFullFactory}
                </button>
                {machineProcessTrace && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {machineProcessTrace.upstreamCount}→ · →{machineProcessTrace.downstreamCount}
                  </span>
                )}
              </div>
            )}
            {selectedEntity.beltLanes && (
              <div className="text-slate-300">
                {t.canvas.lanesLabel} {selectedEntity.beltLanes.left ?? '—'} | {selectedEntity.beltLanes.right ?? '—'}
              </div>
            )}
            {selectedEntity.inserterItems && (
              <div className="text-slate-300">
                {t.canvas.movesLabel} {selectedEntity.inserterItems.join(', ')} ({t.canvas.reachUnit} {selectedEntity.inserterReach ?? 1}t)
              </div>
            )}
            {selectedEntity.name.includes('train-stop') && onChangeTrainStation && (
              <div className="pt-1">
                {trainStation &&
                (trainStation.lockedStopEntityNumber === selectedEntity.entityNumber ||
                  (trainStation.tileX === selectedEntity.tileX &&
                    trainStation.tileY === selectedEntity.tileY)) ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-amber-500/20 border border-amber-500/60 text-amber-300 rounded">
                    <TrainFront className="w-3 h-3" />
                    {t.canvas.trainModal.activeStopBadge}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const matched = railStops.find(
                        (s) =>
                          s.entityNumber === selectedEntity.entityNumber ||
                          (s.tileX === selectedEntity.tileX && s.tileY === selectedEntity.tileY)
                      );
                      onChangeTrainStation({
                        tileX: selectedEntity.tileX,
                        tileY: selectedEntity.tileY,
                        direction: matched?.direction ?? selectedEntity.direction,
                        wagonCount: trainStation?.wagonCount ?? 2,
                        slotsPerWagon: trainStation?.slotsPerWagon ?? 40,
                        stackSizeOverrides: trainStation?.stackSizeOverrides ?? {},
                        lockedStopEntityNumber: selectedEntity.entityNumber,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-cyan-950/60 border border-cyan-500/60 text-cyan-200 rounded hover:bg-cyan-900/60"
                  >
                    <TrainFront className="w-3 h-3 text-amber-400" />
                    {t.canvas.tools.trainEntrance}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Floating Move Production Nudge & Center HUD */}
        {(tool === 'move-production' ||
          (layoutOptions?.productionOffsetX ?? 0) !== 0 ||
          (layoutOptions?.productionOffsetY ?? 0) !== 0) &&
          onChangeLayoutOptions && (
            <div className="absolute top-3 right-3 flex flex-col gap-2 p-2.5 bg-[#141920]/95 border border-amber-500/45 rounded-md shadow-xl text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5" />
                  {t.canvas.tools.moveProduction}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  ({layoutOptions?.productionOffsetX ?? 0}, {layoutOptions?.productionOffsetY ?? 0})
                </span>
              </div>
              <div className="text-[11px] text-slate-400 max-w-[210px] leading-snug">
                {t.canvas.moveProductionHint}
              </div>
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => nudgeProduction(e.shiftKey ? -5 : -1, 0)}
                    className="p-1.5 bg-[#1D222B] border border-[#32363E] rounded text-slate-200 hover:border-amber-500/70"
                    title="← 1 tile (Shift: 5)"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => nudgeProduction(0, e.shiftKey ? -5 : -1)}
                    className="p-1.5 bg-[#1D222B] border border-[#32363E] rounded text-slate-200 hover:border-amber-500/70"
                    title="↑ 1 tile (Shift: 5)"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => nudgeProduction(0, e.shiftKey ? 5 : 1)}
                    className="p-1.5 bg-[#1D222B] border border-[#32363E] rounded text-slate-200 hover:border-amber-500/70"
                    title="↓ 1 tile (Shift: 5)"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => nudgeProduction(e.shiftKey ? 5 : 1, 0)}
                    className="p-1.5 bg-[#1D222B] border border-[#32363E] rounded text-slate-200 hover:border-amber-500/70"
                    title="→ 1 tile (Shift: 5)"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={centerProduction}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-cyan-500/20 border border-cyan-500/50 text-cyan-200 rounded hover:bg-cyan-500/30"
                >
                  <Crosshair className="w-3 h-3" />
                  {t.canvas.centerProduction}
                </button>
              </div>
            </div>
          )}

        {/* Zoom Controls (Static Mode) */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 p-1 bg-[#141920] border border-[#262F3D] rounded-md">
          <button
            type="button"
            title={t.canvas.zoomOut}
            onClick={() => setZoom((z) => Math.max(1.2, z * 0.85))}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-[#1E2530] rounded"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t.canvas.fitToScreen}
            onClick={fitToView}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-[#1E2530] rounded"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t.canvas.zoomIn}
            onClick={() => setZoom((z) => Math.min(64, z * 1.15))}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-[#1E2530] rounded"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Spatial Metrics Footer Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2 bg-[#141920] border-t border-[#252C37] text-xs text-slate-400 font-mono tabular-nums">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {t.canvas.boundsLabel} <strong className="text-slate-100">{liveStats.stats.widthTiles}×{liveStats.stats.heightTiles}</strong> {t.canvas.tilesUnit} ({liveStats.stats.totalAreaTiles} m²)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.canvas.occupancyLabel} <strong className="text-emerald-400">{liveStats.stats.spaceUtilizationPct.toFixed(1)}%</strong>
          </span>
          {hoverTile && (
            <>
              <span aria-hidden="true">·</span>
              <span>Tile ({hoverTile.x}, {hoverTile.y})</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>{t.canvas.machinesLabel} <strong className="text-slate-200">{liveStats.stats.machineCount}</strong></span>
          <span>{t.canvas.beltsLabel} <strong className="text-slate-200">{liveStats.stats.beltCount}</strong></span>
          <span>{t.canvas.undergroundsLabel} <strong className="text-slate-200">{liveStats.stats.undergroundCount}</strong></span>
          <span>{t.canvas.splittersLabel} <strong className="text-slate-200">{liveStats.stats.splitterCount}</strong></span>
          <span>{t.canvas.insertersLabel} <strong className="text-slate-200">{liveStats.stats.inserterCount}</strong></span>
          <span>{t.canvas.pipesLabel} <strong className="text-slate-200">{liveStats.stats.pipeCount}</strong></span>
          <span>{t.canvas.beaconsLabel} <strong className="text-slate-200">{liveStats.stats.beaconCount}</strong></span>
          <span>{t.canvas.polesLabel} <strong className="text-slate-200">{liveStats.stats.poleCount}</strong></span>
        </div>
      </div>

      {/* Blueprint Export Modal */}
      {blueprintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl bg-[#141920] border border-[#2C3748] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#252C37]">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {t.canvas.exportModalTitle}
                </h3>
                <p className="text-xs text-slate-400">
                  {t.canvas.exportModalSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBlueprintModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#0D1117] rounded border border-[#252C37]">
                  <button
                    type="button"
                    onClick={() => setShowRawJson(false)}
                    className={`px-3 py-1 text-xs rounded ${
                      !showRawJson ? 'bg-[#1D2532] text-white font-medium' : 'text-slate-400'
                    }`}
                  >
                    {t.canvas.stringTab}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRawJson(true)}
                    className={`px-3 py-1 text-xs rounded ${
                      showRawJson ? 'bg-[#1D2532] text-white font-medium' : 'text-slate-400'
                    }`}
                  >
                    {t.canvas.decodedJsonTab}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyBlueprint}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400"
                >
                  {copiedBp ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedBp ? t.canvas.copied : t.canvas.copyString}
                </button>
              </div>

              <textarea
                readOnly
                value={showRawJson ? blueprintJson : blueprintString}
                rows={10}
                className="w-full p-3 bg-[#0C0F14] border border-[#252C37] rounded text-xs font-mono text-slate-300 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Blueprint Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl bg-[#141920] border border-[#2C3748] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#252C37]">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {t.canvas.importModalTitle}
                </h3>
                <p className="text-xs text-slate-400">
                  {t.canvas.importModalSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {onImportGridFrame && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setImportMode('grid-frame')}
                    className={`text-left p-3 rounded border transition-colors ${
                      importMode === 'grid-frame'
                        ? 'bg-cyan-950/35 border-cyan-500/70 text-cyan-100'
                        : 'bg-[#0C0F14] border-[#252C37] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-xs font-semibold">{t.canvas.importModeGridFrame}</div>
                    <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                      {t.canvas.importModeGridFrameDesc}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`text-left p-3 rounded border transition-colors ${
                      importMode === 'replace'
                        ? 'bg-amber-500/15 border-amber-500/70 text-amber-100'
                        : 'bg-[#0C0F14] border-[#252C37] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-xs font-semibold">{t.canvas.importModeReplace}</div>
                    <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                      {t.canvas.importModeReplaceDesc}
                    </div>
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportError(null);
                    setImportMode('grid-frame');
                    setImportText(createSampleRailCityBlockString());
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-cyan-200 bg-[#11202B] border border-cyan-500/40 rounded hover:border-cyan-400"
                >
                  {t.canvas.sampleRailGridBtn}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportError(null);
                    setImportMode('grid-frame');
                    setImportText(createSampleSubstationGridString());
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-cyan-200 bg-[#11202B] border border-cyan-500/40 rounded hover:border-cyan-400"
                >
                  {t.canvas.sampleSubstationGridBtn}
                </button>
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={7}
                placeholder="0eNqrVkrKKU0tKMrMK1ayqlbK..."
                className="w-full p-3 bg-[#0C0F14] border border-[#252C37] rounded text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
              />

              {importError && (
                <div className="p-2.5 rounded border border-red-800/60 bg-red-950/30 text-xs text-red-300">
                  {importError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-300 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37]"
                >
                  {t.canvas.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleImportBlueprint}
                  disabled={!importText.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 disabled:opacity-50"
                >
                  {t.canvas.decodeAndLoad}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Train Entrance & Wagon Slot Calculator Modal */}
      {trainModalOpen && onChangeTrainStation && (
        <TrainPlannerModal
          index={index}
          rawInputs={rawInputs}
          trainStation={trainStation}
          gridBounds={liveStats.bounds}
          railStops={railStops}
          hasRailNetwork={railFlowNetwork.chains.length > 0}
          onChangeTrainStation={onChangeTrainStation}
          onPickOnCanvas={() => setTool('place-train-station')}
          onClose={() => setTrainModalOpen(false)}
        />
      )}

    </div>
  );
};
