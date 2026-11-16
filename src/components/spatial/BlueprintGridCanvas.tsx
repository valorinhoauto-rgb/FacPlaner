/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eraser,
  Hand,
  Maximize,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { spritePackStore } from '../../assets/spritePackStore.ts';
import type { Direction, PackIndex } from '../../data/schema.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import type {
  GridEntity,
  GridEntityKind,
  LayoutSynthesisOptions,
  SynthesizedLayout,
} from '../../spatial/types.ts';
import {
  buildBlueprintJson,
  encodeBlueprintString,
  parseBlueprintToEntities,
} from '../../spatial/blueprintCodec.ts';
import { computeLayoutStats } from '../../spatial/layoutSynthesizer.ts';

type EditorTool =
  | 'select'
  | 'pan'
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
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
  onChangeEntities: (next: GridEntity[]) => void;
  onResetAutoLayout: () => void;
  onToggleCompaction: (mode: 'compact' | 'standard') => void;
  onChangeLayoutOptions?: (patch: Partial<LayoutSynthesisOptions>) => void;
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

export const BlueprintGridCanvas: React.FC<BlueprintGridCanvasProps> = ({
  index,
  layout,
  entities,
  projectName,
  defaultBeltId,
  compactionMode,
  layoutOptions,
  selectedStageId,
  onSelectStage,
  onChangeEntities,
  onResetAutoLayout,
  onToggleCompaction,
  onChangeLayoutOptions,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [tool, setTool] = useState<EditorTool>('select');
  const [placeDirection, setPlaceDirection] = useState<Direction>(0);
  const [selectedEntityNum, setSelectedEntityNum] = useState<number | null>(null);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [animateFlow, setAnimateFlow] = useState(true);
  const [spriteTick, setSpriteTick] = useState(0);

  const [zoom, setZoom] = useState(26); // pixels per Factorio tile
  const [pan, setPan] = useState({ x: 300, y: 400 });

  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const [copiedBp, setCopiedBp] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    return spritePackStore.subscribe(() => setSpriteTick((t) => t + 1));
  }, []);

  const dragStateRef = useRef<{
    mode: 'none' | 'pan' | 'move-entity';
    startScreenX: number;
    startScreenY: number;
    startPanX: number;
    startPanY: number;
    entityNum?: number;
    origTileX?: number;
    origTileY?: number;
  }>({ mode: 'none', startScreenX: 0, startScreenY: 0, startPanX: 0, startPanY: 0 });

  const liveStats = useMemo(() => computeLayoutStats(entities), [entities]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.entityNumber === selectedEntityNum) ?? null,
    [entities, selectedEntityNum]
  );

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || entities.length === 0) return;
    const rect = el.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = liveStats.bounds;
    const w = Math.max(4, maxX - minX + 4);
    const h = Math.max(4, maxY - minY + 4);
    const nextZoom = Math.max(8, Math.min(48, Math.min(rect.width / w, rect.height / h)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - centerX * nextZoom,
      y: rect.height / 2 - centerY * nextZoom,
    });
  }, [entities.length, liveStats.bounds]);

  // Fit on initial layout change
  useEffect(() => {
    fitToView();
  }, [layout]);

  const screenToTile = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: Math.floor((sx - pan.x) / zoom),
        y: Math.floor((sy - pan.y) / zoom),
      };
    },
    [pan, zoom]
  );

  const findEntityAtTile = useCallback(
    (tx: number, ty: number) => {
      return entities.find(
        (e) => tx >= e.tileX && tx < e.tileX + e.width && ty >= e.tileY && ty < e.tileY + e.height
      );
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
    if (!selectedEntity) return;
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
    const tile = screenToTile(e.clientX, e.clientY);

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

    if (tool === 'erase') {
      const hit = findEntityAtTile(tile.x, tile.y);
      if (hit) {
        onChangeEntities(entities.filter((x) => x.entityNumber !== hit.entityNumber));
        if (selectedEntityNum === hit.entityNumber) setSelectedEntityNum(null);
      }
      return;
    }

    if (tool.startsWith('place-')) {
      const beltDef = index.beltsById.get(defaultBeltId) ?? index.pack.belts[0];
      let kind: GridEntityKind = 'transport-belt';
      let name = beltDef?.id ?? 'express-transport-belt';
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

    // Select or start moving entity
    const hit = findEntityAtTile(tile.x, tile.y);
    if (hit) {
      setSelectedEntityNum(hit.entityNumber);
      if (hit.stageId) onSelectStage(hit.stageId);
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
    const tile = screenToTile(e.clientX, e.clientY);
    setHoverTile(tile);

    const ds = dragStateRef.current;
    if (ds.mode === 'pan') {
      setPan({
        x: ds.startPanX + (e.clientX - ds.startScreenX),
        y: ds.startPanY + (e.clientY - ds.startScreenY),
      });
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
    const nextZoom = Math.max(7, Math.min(64, zoom * factor));
    const scaleRatio = nextZoom / zoom;

    setPan({
      x: mx - (mx - pan.x) * scaleRatio,
      y: my - (my - pan.y) * scaleRatio,
    });
    setZoom(nextZoom);
  };

  // --- 60 FPS Canvas 2D Renderer ---
  useEffect(() => {
    let rafId = 0;

    const renderFrame = (timeMs: number) => {
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

      const tSec = animateFlow ? timeMs / 1000 : 0;

      // Visible tile range (viewport culling!)
      const startTileX = Math.floor(-pan.x / zoom) - 2;
      const endTileX = Math.ceil((width - pan.x) / zoom) + 2;
      const startTileY = Math.floor(-pan.y / zoom) - 2;
      const endTileY = Math.ceil((height - pan.y) / zoom) + 2;

      // Draw subtle tile grid
      if (zoom >= 10) {
        ctx.lineWidth = 1;
        for (let tx = startTileX; tx <= endTileX; tx++) {
          const sx = Math.floor(pan.x + tx * zoom) + 0.5;
          ctx.strokeStyle = tx % 5 === 0 ? '#23262C' : '#181A1F';
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height);
          ctx.stroke();
        }
        for (let ty = startTileY; ty <= endTileY; ty++) {
          const sy = Math.floor(pan.y + ty * zoom) + 0.5;
          ctx.strokeStyle = ty % 5 === 0 ? '#23262C' : '#181A1F';
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(width, sy);
          ctx.stroke();
        }
      }

      // Draw Stage Zones
      for (const zone of layout.zones) {
        const zx = pan.x + zone.tileX * zoom;
        const zy = pan.y + zone.tileY * zoom;
        const zw = zone.width * zoom;
        const zh = zone.height * zoom;
        const isStageFocused = selectedStageId === zone.stageId;

        ctx.save();
        ctx.strokeStyle = isStageFocused ? 'rgba(245, 158, 11, 0.7)' : 'rgba(71, 85, 105, 0.35)';
        ctx.lineWidth = isStageFocused ? 1.5 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(zx - 4, zy - 4, zw + 8, zh + 8);
        ctx.restore();

        if (zoom >= 11) {
          ctx.fillStyle = isStageFocused ? '#FBBF24' : '#94A3B8';
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(`${zone.label} (${zone.machineCount}x)`, zx, zy - 8);
        }
      }

      // Draw Entities with Viewport Culling
      for (const ent of entities) {
        if (
          ent.tileX + ent.width < startTileX ||
          ent.tileX > endTileX ||
          ent.tileY + ent.height < startTileY ||
          ent.tileY > endTileY
        ) {
          continue;
        }

        const x = pan.x + ent.tileX * zoom;
        const y = pan.y + ent.tileY * zoom;
        const w = ent.width * zoom;
        const h = ent.height * zoom;
        const isSelected = selectedEntityNum === ent.entityNumber;
        const isStageSelected = selectedStageId && ent.stageId === selectedStageId;

        if (ent.kind === 'transport-belt' || ent.kind === 'underground-belt') {
          const beltColor = getBeltColor(ent.name);
          ctx.fillStyle = '#1E242E';
          ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
          ctx.strokeStyle = beltColor;
          ctx.lineWidth = Math.max(1, zoom * 0.08);
          ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

          // Directional chevron
          const cx = x + w / 2;
          const cy = y + h / 2;
          const angle = (ent.direction / 16) * Math.PI * 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);

          // Moving chevron phase
          const phase = ((tSec * 2) % 1) * (zoom * 0.32) - zoom * 0.16;
          ctx.strokeStyle = beltColor;
          ctx.lineWidth = Math.max(1.2, zoom * 0.08);
          ctx.beginPath();
          ctx.moveTo(-zoom * 0.22, zoom * 0.14 + phase);
          ctx.lineTo(0, -zoom * 0.12 + phase);
          ctx.lineTo(zoom * 0.22, zoom * 0.14 + phase);
          ctx.stroke();

          // Two-lane items traveling on belt!
          if (ent.beltLanes && zoom >= 12) {
            const drawLaneItem = (itemId: string | undefined, laneOffsetX: number) => {
              if (!itemId) return;
              const res = index.resourcesById.get(itemId);
              const resColor = res?.color ?? '#E2E8F0';
              const itemSize = Math.max(4, zoom * 0.28);
              const shift = ((tSec * 1.6) % 1) * zoom - zoom * 0.5;
              const itemImg = zoom >= 14 ? spritePackStore.resolveImage(itemId, res?.iconPath) : undefined;
              if (itemImg) {
                ctx.drawImage(
                  itemImg,
                  laneOffsetX - itemSize / 2,
                  -shift - itemSize / 2,
                  itemSize,
                  itemSize
                );
              } else {
                ctx.fillStyle = resColor;
                ctx.fillRect(
                  laneOffsetX - itemSize * 0.4,
                  -shift - itemSize * 0.4,
                  itemSize * 0.8,
                  itemSize * 0.8
                );
              }
            };
            drawLaneItem(ent.beltLanes.left, -zoom * 0.22);
            drawLaneItem(ent.beltLanes.right, zoom * 0.22);
          }

          if (ent.kind === 'underground-belt') {
            ctx.fillStyle = '#0B0E14';
            ctx.fillRect(-zoom * 0.34, -zoom * 0.34, zoom * 0.68, zoom * 0.32);
            ctx.strokeStyle = beltColor;
            ctx.strokeRect(-zoom * 0.34, -zoom * 0.34, zoom * 0.68, zoom * 0.32);
          }

          ctx.restore();
        } else if (ent.kind === 'splitter') {
          const beltColor = getBeltColor(ent.name);
          ctx.fillStyle = '#252E3C';
          ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
          ctx.strokeStyle = beltColor;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
          ctx.fillStyle = beltColor;
          ctx.fillRect(x + w * 0.15, y + h * 0.42, w * 0.7, Math.max(2, h * 0.16));
        } else if (ent.kind === 'pipe' || ent.kind === 'pipe-to-ground') {
          const fluidColor = ent.fluidId
            ? index.resourcesById.get(ent.fluidId)?.color ?? '#06B6D4'
            : '#06B6D4';
          ctx.fillStyle = '#1D2733';
          ctx.fillRect(x + zoom * 0.2, y + 1, w - zoom * 0.4, h - 2);
          ctx.fillStyle = fluidColor;
          ctx.fillRect(x + zoom * 0.35, y + zoom * 0.2, w - zoom * 0.7, h - zoom * 0.4);
          ctx.strokeStyle = '#64748B';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + zoom * 0.2, y + 1, w - zoom * 0.4, h - 2);
        } else if (ent.kind === 'inserter') {
          const insColor = getInserterColor(ent.name);
          const cx = x + w / 2;
          const cy = y + h / 2;
          const angle = (ent.direction / 16) * Math.PI * 2;
          const swing = animateFlow ? Math.sin(tSec * 4 + ent.entityNumber) * 0.35 : 0;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle + swing);
          // Pedestal
          ctx.fillStyle = '#1E2530';
          ctx.fillRect(-zoom * 0.24, -zoom * 0.24, zoom * 0.48, zoom * 0.48);
          ctx.strokeStyle = insColor;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(-zoom * 0.24, -zoom * 0.24, zoom * 0.48, zoom * 0.48);
          // Arm pointing toward drop direction (North in local rotated coords)
          const reachLen = ent.inserterReach === 2 ? zoom * 0.78 : zoom * 0.55;
          ctx.strokeStyle = insColor;
          ctx.lineWidth = Math.max(1.8, zoom * 0.14);
          ctx.beginPath();
          ctx.moveTo(0, zoom * 0.25);
          ctx.lineTo(0, -reachLen);
          ctx.stroke();
          // Gripper head
          ctx.fillStyle = '#F8FAFC';
          ctx.beginPath();
          ctx.arc(0, -reachLen, Math.max(2, zoom * 0.1), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (ent.kind === 'beacon') {
          const isSingularity = ent.name.includes('singularity');
          const bAccent = isSingularity ? '#A855F7' : '#38BDF8';
          const beaconDef = index.beaconsById.get(ent.name);
          const beaconImg = spritePackStore.resolveImage(ent.name, beaconDef?.iconPath);

          // Supply radius aura when selected or hovered
          if (isSelected || (hoverTile && hoverTile.x >= ent.tileX && hoverTile.x < ent.tileX + ent.width && hoverTile.y >= ent.tileY && hoverTile.y < ent.tileY + ent.height)) {
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

          ctx.fillStyle = '#192230';
          ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
          ctx.strokeStyle = isStageSelected ? '#F59E0B' : bAccent;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

          if (beaconImg) {
            ctx.drawImage(beaconImg, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
          } else {
            // Transmitter diamond + pulsing pulse ring
            const pulse = animateFlow ? 0.55 + Math.sin(tSec * 3.5 + ent.entityNumber) * 0.25 : 0.7;
            ctx.strokeStyle = bAccent;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, w * 0.34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.fillStyle = bAccent;
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y + h * 0.24);
            ctx.lineTo(x + w * 0.76, y + h / 2);
            ctx.lineTo(x + w / 2, y + h * 0.76);
            ctx.lineTo(x + w * 0.24, y + h / 2);
            ctx.closePath();
            ctx.fill();
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
          if (isSelected || (hoverTile && hoverTile.x >= ent.tileX && hoverTile.x < ent.tileX + ent.width && hoverTile.y >= ent.tileY && hoverTile.y < ent.tileY + ent.height)) {
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
          } else {
            ctx.fillStyle = '#242F3E';
            ctx.fillRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5);
            ctx.strokeStyle = '#94A3B8';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5);
            // Cross arms + copper insulator dot
            ctx.beginPath();
            ctx.moveTo(x + w * 0.15, y + h * 0.5);
            ctx.lineTo(x + w * 0.85, y + h * 0.5);
            ctx.stroke();
            ctx.fillStyle = '#38BDF8';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.max(2, w * 0.16), 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (ent.kind === 'machine') {
          const accent = ent.accentColor ?? '#60A5FA';
          const machineDef = index.machinesById.get(ent.name);
          const machineImg = spritePackStore.resolveImage(ent.name, machineDef?.iconPath);

          // Outer machine chassis
          ctx.fillStyle = ent.name.startsWith('kr-') ? '#1D1B2A' : '#1C2430';
          ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
          ctx.strokeStyle = isStageSelected
            ? '#F59E0B'
            : ent.name.startsWith('kr-')
              ? '#6D28D9'
              : '#3B485C';
          ctx.lineWidth = isStageSelected ? 2 : 1.5;
          ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

          if (machineImg) {
            ctx.drawImage(machineImg, x + 4, y + 4, w - 8, h - 8);
          } else {
            // Procedural Factorio machine silhouette
            ctx.fillStyle = '#12171F';
            ctx.fillRect(x + w * 0.14, y + h * 0.14, w * 0.72, h * 0.72);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.1;
            ctx.strokeRect(x + w * 0.14, y + h * 0.14, w * 0.72, h * 0.72);

            const cx = x + w / 2;
            const cy = y + h / 2;

            if (ent.name.includes('foundry') || ent.name.includes('furnace')) {
              // Glowing molten crucible / heating hearth
              const glow = animateFlow ? 0.65 + Math.sin(tSec * 3 + ent.entityNumber) * 0.2 : 0.75;
              ctx.fillStyle = `rgba(249, 115, 22, ${glow})`;
              ctx.beginPath();
              ctx.arc(cx, cy, Math.min(w, h) * 0.24, 0, Math.PI * 2);
              ctx.fill();
            } else if (ent.name.includes('electromagnetic')) {
              // Dual copper coils + magenta arc
              ctx.strokeStyle = '#D97706';
              ctx.lineWidth = Math.max(1.5, zoom * 0.09);
              ctx.beginPath();
              ctx.arc(cx - w * 0.16, cy, Math.min(w, h) * 0.14, 0, Math.PI * 2);
              ctx.arc(cx + w * 0.16, cy, Math.min(w, h) * 0.14, 0, Math.PI * 2);
              ctx.stroke();
              ctx.strokeStyle = '#F472B6';
              ctx.beginPath();
              ctx.moveTo(cx - w * 0.16, cy);
              ctx.lineTo(cx, cy + (animateFlow ? Math.sin(tSec * 12) * h * 0.08 : 0));
              ctx.lineTo(cx + w * 0.16, cy);
              ctx.stroke();
            } else if (ent.name.includes('cryogenic')) {
              // Frosted cyan cooling chambers
              ctx.fillStyle = 'rgba(34, 211, 238, 0.35)';
              ctx.fillRect(x + w * 0.2, y + h * 0.22, w * 0.25, h * 0.56);
              ctx.fillRect(x + w * 0.55, y + h * 0.22, w * 0.25, h * 0.56);
            } else if (ent.name.includes('refinery') || ent.name.includes('chemical') || ent.name.includes('filtration') || ent.name.includes('electrolysis') || ent.name.includes('condenser')) {
              // Distillation tanks / vats
              ctx.strokeStyle = '#38BDF8';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.arc(cx - w * 0.14, cy - h * 0.1, Math.min(w, h) * 0.12, 0, Math.PI * 2);
              ctx.arc(cx + w * 0.14, cy + h * 0.1, Math.min(w, h) * 0.12, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              // Rotating mechanical gear wheel for assembling machines & crushers
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(animateFlow ? tSec * 1.4 + ent.entityNumber * 0.4 : 0);
              ctx.strokeStyle = '#64748B';
              ctx.lineWidth = Math.max(1.5, zoom * 0.08);
              const rGear = Math.min(w, h) * 0.24;
              ctx.beginPath();
              ctx.arc(0, 0, rGear, 0, Math.PI * 2);
              ctx.moveTo(-rGear * 1.25, 0);
              ctx.lineTo(rGear * 1.25, 0);
              ctx.moveTo(0, -rGear * 1.25);
              ctx.lineTo(0, rGear * 1.25);
              ctx.stroke();
              ctx.restore();
            }
          }

          // Factorio Alt-Mode Recipe Badge in center
          const recipe = ent.recipeId ? index.recipesById.get(ent.recipeId) : undefined;
          const recipeRes = recipe ? index.resourcesById.get(recipe.mainProductId) : undefined;
          const recipeImg =
            ent.recipeId && zoom >= 12
              ? spritePackStore.resolveImage(recipe?.mainProductId ?? ent.recipeId, recipe?.iconPath ?? recipeRes?.iconPath)
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
          } else {
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.max(3, Math.min(w, h) * 0.16), 0, Math.PI * 2);
            ctx.fill();

            if (zoom >= 16 && ent.recipeId) {
              const label = ent.recipeId.replace(/^kr-/, '').slice(0, 5).toUpperCase();
              ctx.fillStyle = '#0B0E14';
              ctx.font = `700 ${Math.max(7, Math.floor(zoom * 0.23))}px "JetBrains Mono", monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
              ctx.textAlign = 'start';
              ctx.textBaseline = 'alphabetic';
            }
          }

          // Module slots indicator in bottom-left (Factorio Alt-Mode)
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

        if (isSelected) {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
        }
      }

      // Draw Copper Power Wire Connections between adjacent Electric Poles
      const poles = entities.filter((e) => e.kind === 'electric-pole');
      if (poles.length > 1 && zoom >= 9) {
        ctx.save();
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.42)';
        ctx.lineWidth = Math.max(1, zoom * 0.045);
        for (let i = 0; i < poles.length; i++) {
          const p1 = poles[i];
          const x1 = pan.x + (p1.tileX + p1.width / 2) * zoom;
          const y1 = pan.y + (p1.tileY + p1.height / 2) * zoom;
          for (let j = i + 1; j < poles.length; j++) {
            const p2 = poles[j];
            const distTiles = Math.hypot(p1.tileX - p2.tileX, p1.tileY - p2.tileY);
            if (distTiles <= 10.5) {
              const x2 = pan.x + (p2.tileX + p2.width / 2) * zoom;
              const y2 = pan.y + (p2.tileY + p2.height / 2) * zoom;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + zoom * 0.35, x2, y2);
              ctx.stroke();
            }
          }
        }
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
        const westInputs = activePorts
          .filter((p) => p.directionType === 'input' && p.side === 'west')
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

          const pulse = animateFlow ? Math.sin(tSec * 4) * Math.min(3, zoom * 0.1) : 0;

          // 1. Highlight frame on the entry/exit tile itself
          ctx.save();
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
            // Point UP into the bottom edge of the belt
            ctx.moveTo(cx, tipY);
            ctx.lineTo(cx - aSz * 0.65, tipY + aSz * 0.9);
            ctx.lineTo(cx + aSz * 0.65, tipY + aSz * 0.9);
          } else if (port.side === 'west') {
            const tipX = pan.x + port.tileX * zoom - 3 + pulse;
            // Point RIGHT into the west edge of the belt
            ctx.moveTo(tipX, cy);
            ctx.lineTo(tipX - aSz * 0.9, cy - aSz * 0.65);
            ctx.lineTo(tipX - aSz * 0.9, cy + aSz * 0.65);
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
            // Compact dot when heavily zoomed out
            const dotY =
              port.side === 'south'
                ? cy + zoom * 1.15
                : port.side === 'west'
                  ? cy
                  : cy - zoom * 1.15;
            const dotX = port.side === 'west' ? cx - zoom * 1.15 : cx;
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
            by = pan.y + (port.tileY + 1) * zoom + 16 + staggerRow * 24;
            // Dashed leader line down to staggered badge
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
          } else {
            by = pan.y + port.tileY * zoom - 16 - boxH - staggerRow * 24;
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
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
        westInputs.forEach((p, idx) => drawPort(p, idx % 2));
        northOutputs.forEach((p, idx) => drawPort(p, idx % 2));
      }

      // Hover Tile Ghost / Placement Preview
      if (hoverTile) {
        const hx = pan.x + hoverTile.x * zoom;
        const hy = pan.y + hoverTile.y * zoom;
        if (tool.startsWith('place-')) {
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

      if (animateFlow) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    animateFlow,
    canPlaceAt,
    entities,
    hoverTile,
    index.beaconsById,
    index.machinesById,
    index.pack.beacons,
    index.pack.electricPoles,
    index.recipesById,
    index.resourcesById,
    layout.ports,
    layout.zones,
    pan,
    placeDirection,
    selectedEntityNum,
    selectedStageId,
    spriteTick,
    t.canvas.beltsShort,
    t.canvas.pipeShort,
    t.canvas.portIn,
    t.canvas.portOut,
    tool,
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
      onChangeEntities(parsed.entities);
      setImportModalOpen(false);
      setImportText('');
      setSelectedEntityNum(null);

      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const { bounds } = computeLayoutStats(parsed.entities);
        const w = Math.max(4, bounds.maxX - bounds.minX + 4);
        const h = Math.max(4, bounds.maxY - bounds.minY + 4);
        const nextZoom = Math.max(8, Math.min(48, Math.min(rect.width / w, rect.height / h)));
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

          <button
            type="button"
            onClick={() => {
              setImportError(null);
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
          </div>
        )}

        {/* Zoom & Animation Controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 p-1 bg-[#141920] border border-[#262F3D] rounded-md">
          <button
            type="button"
            title={animateFlow ? t.canvas.pauseAnim : t.canvas.playAnim}
            onClick={() => setAnimateFlow((v) => !v)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-[#1E2530] rounded"
          >
            {animateFlow ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            title={t.canvas.zoomOut}
            onClick={() => setZoom((z) => Math.max(7, z * 0.85))}
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
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
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
    </div>
  );
};
