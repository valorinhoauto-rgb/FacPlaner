/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction, PackIndex } from '../data/schema.ts';
import type { PlanConfig, SolveResult, SolvedStage } from '../engine/types.ts';
import type {
  GridEntity,
  GridFitReport,
  InputAlignmentSide,
  LayoutPortMarker,
  LayoutSynthesisOptions,
  SpatialLayoutStats,
  StageZone,
  SynthesizedLayout,
  TrainStationConfig,
} from './types.ts';
import {
  buildRailFlowNetwork,
  computeTrainCarPosesOnNetwork,
} from './railFlowNetwork.ts';
import { computeTrainWagonPlan } from './trainPlanner.ts';

const MAX_UNBOUNDED_MACHINES_PER_STAGE = 120;

class OccupancyGrid {
  private cells = new Map<string, GridEntity>();
  readonly entities: GridEntity[] = [];
  private nextEntityNumber = 1;

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  getAt(x: number, y: number): GridEntity | undefined {
    return this.cells.get(this.key(x, y));
  }

  canPlace(tileX: number, tileY: number, width: number, height: number): boolean {
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        if (this.cells.has(this.key(tileX + dx, tileY + dy))) {
          return false;
        }
      }
    }
    return true;
  }

  forceSeedFrame(frameEntities: GridEntity[]): GridEntity[] {
    const seeded: GridEntity[] = [];
    for (const raw of frameEntities) {
      const entity: GridEntity = {
        ...raw,
        isGridFrame: true,
        entityNumber: this.nextEntityNumber++,
      };
      this.entities.push(entity);
      seeded.push(entity);
      for (let dx = 0; dx < entity.width; dx++) {
        for (let dy = 0; dy < entity.height; dy++) {
          this.cells.set(this.key(entity.tileX + dx, entity.tileY + dy), entity);
        }
      }
    }
    return seeded;
  }

  place(entityInput: Omit<GridEntity, 'entityNumber'>): GridEntity | null {
    if (!this.canPlace(entityInput.tileX, entityInput.tileY, entityInput.width, entityInput.height)) {
      return null;
    }
    const entity: GridEntity = {
      ...entityInput,
      entityNumber: this.nextEntityNumber++,
    };
    this.entities.push(entity);
    for (let dx = 0; dx < entity.width; dx++) {
      for (let dy = 0; dy < entity.height; dy++) {
        this.cells.set(this.key(entity.tileX + dx, entity.tileY + dy), entity);
      }
    }
    return entity;
  }

  placeOrMergeBelt(
    tileX: number,
    tileY: number,
    name: string,
    direction: Direction,
    lanes?: { left?: string; right?: string },
    stageId?: string
  ): GridEntity | null {
    const existing = this.getAt(tileX, tileY);
    if (existing) {
      if (existing.kind === 'transport-belt' && existing.direction === direction) {
        if (lanes?.left && !existing.beltLanes?.left) {
          existing.beltLanes = { ...existing.beltLanes, left: lanes.left };
        }
        if (lanes?.right && !existing.beltLanes?.right) {
          existing.beltLanes = { ...existing.beltLanes, right: lanes.right };
        }
        return existing;
      }
      return null;
    }
    return this.place({
      kind: 'transport-belt',
      name,
      tileX,
      tileY,
      width: 1,
      height: 1,
      direction,
      beltLanes: lanes,
      stageId,
    });
  }

  remove(entity: GridEntity): void {
    if (entity.isGridFrame) return;
    const idx = this.entities.indexOf(entity);
    if (idx !== -1) this.entities.splice(idx, 1);
    for (let dx = 0; dx < entity.width; dx++) {
      for (let dy = 0; dy < entity.height; dy++) {
        if (this.cells.get(this.key(entity.tileX + dx, entity.tileY + dy)) === entity) {
          this.cells.delete(this.key(entity.tileX + dx, entity.tileY + dy));
        }
      }
    }
  }
}

interface InteriorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Analyzes ANY imported Factorio grid model (rail city block, elevated railway grid,
 * walled box, substation grid, roboport grid, asymmetric unloading station, etc.) and
 * locates the largest unobstructed central build rectangle using a center-biased
 * Maximum Empty Rectangle scan over hard structural barriers (rails, ramps, stops, walls).
 * Interior poles/roboports stay inside so production automatically routes around them.
 */
function detectGridInterior(
  grid: OccupancyGrid,
  frameEntities: GridEntity[]
): InteriorBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hardBarrierCount = 0;

  const isHardBarrier = (ent: GridEntity): boolean =>
    ent.name.includes('rail') ||
    ent.name.includes('wall') ||
    ent.name.includes('gate') ||
    ent.name.includes('train-stop') ||
    ent.name.includes('turret') ||
    ent.name.includes('cargo-landing-pad');

  for (const e of frameEntities) {
    minX = Math.min(minX, e.tileX);
    minY = Math.min(minY, e.tileY);
    maxX = Math.max(maxX, e.tileX + e.width);
    maxY = Math.max(maxY, e.tileY + e.height);
    if (isHardBarrier(e)) hardBarrierCount++;
  }

  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);

  // Open substation/roboport grid without rail/wall perimeter: use full frame minus 1-tile edge margin
  if (hardBarrierCount < 4 || totalW < 12 || totalH < 12) {
    return {
      minX: minX + 1,
      minY: minY + 1,
      maxX: Math.max(minX + 9, maxX - 1),
      maxY: Math.max(minY + 9, maxY - 1),
    };
  }

  // Downsample 2x only for colossal megabase frames (>400x400) so histogram scan stays <3ms
  const scale = totalW > 380 || totalH > 380 ? 2 : 1;
  const gw = Math.ceil(totalW / scale);
  const gh = Math.ceil(totalH / scale);
  const blocked = new Uint8Array(gw * gh);

  for (const e of frameEntities) {
    if (!isHardBarrier(e)) continue;
    const x0 = Math.max(0, Math.floor((e.tileX - minX) / scale));
    const x1 = Math.min(gw, Math.ceil((e.tileX + e.width - minX) / scale));
    const y0 = Math.max(0, Math.floor((e.tileY - minY) / scale));
    const y1 = Math.min(gh, Math.ceil((e.tileY + e.height - minY) / scale));
    for (let gy = y0; gy < y1; gy++) {
      const rowOffset = gy * gw;
      for (let gx = x0; gx < x1; gx++) {
        blocked[rowOffset + gx] = 1;
      }
    }
  }

  const heights = new Int32Array(gw);
  let bestScore = -1;
  let bestRect = { x1: 0, y1: 0, x2: gw, y2: gh };
  const halfW = gw / 2;
  const halfH = gh / 2;

  for (let y = 0; y < gh; y++) {
    const rowOffset = y * gw;
    for (let x = 0; x < gw; x++) {
      heights[x] = blocked[rowOffset + x] ? 0 : heights[x] + 1;
    }

    const stack: number[] = [];
    for (let x = 0; x <= gw; x++) {
      const h = x === gw ? 0 : heights[x];
      while (stack.length > 0 && heights[stack[stack.length - 1]] > h) {
        const topIdx = stack.pop()!;
        const rectH = heights[topIdx];
        const leftX = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
        const rectW = x - leftX;
        const worldW = rectW * scale;
        const worldH = rectH * scale;
        if (worldW < 8 || worldH < 8) continue;

        const rectY1 = y - rectH + 1;
        const cx = (leftX + x) / 2;
        const cy = (rectY1 + y + 1) / 2;
        const normDist = Math.hypot((cx - halfW) / gw, (cy - halfH) / gh);
        const aspect = Math.min(worldW, worldH) / Math.max(worldW, worldH);
        const centerWeight = Math.max(0.15, 1.4 - normDist * 1.6);
        const score = worldW * worldH * centerWeight * (0.7 + 0.3 * aspect);
        if (score > bestScore) {
          bestScore = score;
          bestRect = { x1: leftX, y1: rectY1, x2: x, y2: y + 1 };
        }
      }
      stack.push(x);
    }
  }

  let intMinX = minX + bestRect.x1 * scale;
  let intMaxX = Math.min(maxX, minX + bestRect.x2 * scale);
  let intMinY = minY + bestRect.y1 * scale;
  let intMaxY = Math.min(maxY, minY + bestRect.y2 * scale);

  // Leave a clean 1-tile safety clearance inside rail ties / walls when spacious
  if (intMaxX - intMinX >= 20) {
    intMinX += 1;
    intMaxX -= 1;
  }
  if (intMaxY - intMinY >= 20) {
    intMinY += 1;
    intMaxY -= 1;
  }

  // Fallback check if grid had unexpected sparse blockers
  void grid;
  return {
    minX: intMinX,
    minY: intMinY,
    maxX: Math.max(intMinX + 8, intMaxX),
    maxY: Math.max(intMinY + 8, intMaxY),
  };
}

/**
 * Lays a continuous vertical belt along x from yTop..yBottom-1.
 * When an imported grid obstacle (e.g. substation or roboport) blocks intermediate tiles,
 * automatically jumps across it using an underground-belt pair!
 */
function layAdaptiveVerticalBelt(
  grid: OccupancyGrid,
  x: number,
  yTop: number,
  yBottom: number,
  beltName: string,
  undergroundName: string,
  lanes: { left?: string; right?: string },
  stageId?: string
): void {
  let y = yBottom - 1;
  while (y >= yTop) {
    const existing = grid.getAt(x, y);
    if (!existing || (existing.kind === 'transport-belt' && existing.direction === 0)) {
      grid.placeOrMergeBelt(x, y, beltName, 0, lanes, stageId);
      y--;
      continue;
    }

    // Attempt to jump upward past obstacle (North direction = 0) up to 5 tiles
    let jumped = false;
    const entryY = y + 1;
    const entryEnt = grid.getAt(x, entryY);
    if (entryEnt && entryEnt.kind === 'transport-belt' && entryEnt.direction === 0 && !entryEnt.isGridFrame) {
      for (let jump = 2; jump <= 5; jump++) {
        const landY = entryY - jump;
        if (landY < yTop) break;
        if (!grid.getAt(x, landY)) {
          grid.remove(entryEnt);
          grid.place({
            kind: 'underground-belt',
            name: undergroundName,
            tileX: x,
            tileY: entryY,
            width: 1,
            height: 1,
            direction: 0,
            undergroundType: 'input',
            beltLanes: lanes,
            stageId,
          });
          grid.place({
            kind: 'underground-belt',
            name: undergroundName,
            tileX: x,
            tileY: landY,
            width: 1,
            height: 1,
            direction: 0,
            undergroundType: 'output',
            beltLanes: lanes,
            stageId,
          });
          y = landY - 1;
          jumped = true;
          break;
        }
      }
    }
    if (!jumped) {
      y--;
    }
  }
}

/**
 * Lays a vertical fluid manifold pipe along x from yTop..yBottom-1, jumping obstacles
 * with pipe-to-ground pairs whenever an imported grid frame pole/roboport is in the way.
 */
function layAdaptiveVerticalPipe(
  grid: OccupancyGrid,
  x: number,
  yTop: number,
  yBottom: number,
  fluidId: string | undefined,
  stageId?: string
): void {
  let y = yBottom - 1;
  while (y >= yTop) {
    if (grid.canPlace(x, y, 1, 1)) {
      grid.place({
        kind: 'pipe',
        name: 'pipe',
        tileX: x,
        tileY: y,
        width: 1,
        height: 1,
        direction: 0,
        fluidId,
        stageId,
      });
      y--;
      continue;
    }

    let jumped = false;
    const entryY = y + 1;
    const entryEnt = grid.getAt(x, entryY);
    if (entryEnt && entryEnt.kind === 'pipe' && !entryEnt.isGridFrame) {
      for (let jump = 2; jump <= 9; jump++) {
        const landY = entryY - jump;
        if (landY < yTop) break;
        if (grid.canPlace(x, landY, 1, 1)) {
          grid.remove(entryEnt);
          grid.place({
            kind: 'pipe-to-ground',
            name: 'pipe-to-ground',
            tileX: x,
            tileY: entryY,
            width: 1,
            height: 1,
            direction: 0,
            undergroundType: 'input',
            fluidId,
            stageId,
          });
          grid.place({
            kind: 'pipe-to-ground',
            name: 'pipe-to-ground',
            tileX: x,
            tileY: landY,
            width: 1,
            height: 1,
            direction: 0,
            undergroundType: 'output',
            fluidId,
            stageId,
          });
          y = landY - 1;
          jumped = true;
          break;
        }
      }
    }
    if (!jumped) {
      y--;
    }
  }
}

interface BeltTrack {
  itemId: string;
  laneMode: 'full' | 'left' | 'right';
  partnerItemId?: string;
}

interface StageAnchor {
  x: number;
  y: number;
  entryX?: number;
  entryY?: number;
  entryDir?: Direction;
  itemId: string;
  kind: 'item' | 'fluid';
}

/**
 * Packs solid ingredients onto belts. Uses dedicated belt tracks whenever all
 * ingredients fit without sharing so stage inputs never compete for a single entry tile,
 * and falls back to dual-lane sharing only when a recipe exceeds maxDedicatedTracks.
 */
function packSolidInputBelts(
  stage: SolvedStage,
  beltThroughput: number,
  excludeItemId?: string,
  maxDedicatedTracks = 3
): BeltTrack[] {
  const solidInputs = stage.inputs.filter((i) => i.kind === 'item' && i.itemId !== excludeItemId);
  if (solidInputs.length === 0) return [];

  if (solidInputs.length <= maxDedicatedTracks) {
    return solidInputs.map((item) => ({ itemId: item.itemId, laneMode: 'full' }));
  }

  const halfBelt = beltThroughput / 2;
  const tracks: BeltTrack[] = [];
  const halfCandidates = solidInputs.filter((i) => i.actualTotalPerSec <= halfBelt + 1e-6);
  const fullOnly = solidInputs.filter((i) => i.actualTotalPerSec > halfBelt + 1e-6);

  for (const item of fullOnly) {
    tracks.push({ itemId: item.itemId, laneMode: 'full' });
  }

  for (let i = 0; i < halfCandidates.length; i += 2) {
    const first = halfCandidates[i];
    const second = halfCandidates[i + 1];
    if (second && tracks.length + Math.ceil((halfCandidates.length - i) / 2) <= maxDedicatedTracks) {
      tracks.push({
        itemId: first.itemId,
        laneMode: 'left',
        partnerItemId: second.itemId,
      });
    } else if (second && solidInputs.length > maxDedicatedTracks) {
      tracks.push({
        itemId: first.itemId,
        laneMode: 'left',
        partnerItemId: second.itemId,
      });
    } else {
      tracks.push({ itemId: first.itemId, laneMode: 'full' });
    }
  }

  return tracks;
}

/**
 * Generates a physical 2D Factorio tile layout (machines, dual-lane belts,
 * splitters, underground belts, inserters 1-tile & 2-tile long-handed, pipes,
 * beacons, electric poles, and optional direct machine-to-machine insertion)
 * ordered bottom-to-top from raw inputs to final product, optimizing footprint.
 */
export function synthesizeFactoryLayout(
  index: PackIndex,
  solveResult: SolveResult,
  config: PlanConfig,
  modeOrOptions: 'compact' | 'standard' | LayoutSynthesisOptions = 'compact'
): SynthesizedLayout {
  const options: Required<Omit<LayoutSynthesisOptions, 'gridFrame' | 'trainStation'>> & {
    gridFrame?: GridEntity[];
    trainStation?: TrainStationConfig;
  } =
    typeof modeOrOptions === 'string'
      ? {
          compactionMode: modeOrOptions,
          includeBeacons: true,
          includePowerPoles: true,
          directInsertion: false,
          inputSide: 'distributed',
          productionOffsetX: 0,
          productionOffsetY: 0,
          gridFrame: undefined,
          trainStation: undefined,
        }
      : {
          compactionMode: modeOrOptions.compactionMode ?? 'compact',
          includeBeacons: modeOrOptions.includeBeacons ?? true,
          includePowerPoles: modeOrOptions.includePowerPoles ?? true,
          directInsertion: modeOrOptions.directInsertion ?? false,
          inputSide: modeOrOptions.inputSide ?? 'distributed',
          productionOffsetX: Math.round(modeOrOptions.productionOffsetX ?? 0),
          productionOffsetY: Math.round(modeOrOptions.productionOffsetY ?? 0),
          gridFrame: modeOrOptions.gridFrame,
          trainStation: modeOrOptions.trainStation,
        };

  const compactionMode = options.compactionMode;
  const inputSide: InputAlignmentSide = options.inputSide;
  const grid = new OccupancyGrid();
  const zones: StageZone[] = [];
  const ports: LayoutPortMarker[] = [];

  const hasGridFrame = Boolean(options.gridFrame && options.gridFrame.length > 0);
  const seededFrame = hasGridFrame ? grid.forceSeedFrame(options.gridFrame!) : [];
  const interiorBounds: InteriorBounds | null = hasGridFrame
    ? detectGridInterior(grid, seededFrame)
    : null;

  let totalRequestedMachines = 0;
  let totalPlacedMachines = 0;

  const beltDef =
    index.beltsById.get(config.defaultBeltId ?? 'express-transport-belt') ??
    index.pack.belts[index.pack.belts.length - 1];
  const beltName = beltDef?.id ?? 'express-transport-belt';
  const undergroundName = beltDef?.undergroundId ?? 'underground-belt';
  const splitterName = beltDef?.splitterId ?? 'splitter';
  const beltThroughput = beltDef?.throughputPerSec ?? 45;
  const beltMaxJump =
    beltName.includes('turbo')
      ? 11
      : beltName.includes('express') || beltName.includes('superior')
        ? 9
        : beltName.includes('fast')
          ? 7
          : 5;

  const fastInserter =
    index.insertersById.get(config.defaultInserterId ?? 'fast-inserter') ??
    index.pack.inserters[0];
  const inserterName = fastInserter?.id ?? 'fast-inserter';
  const longInserterName = 'long-handed-inserter';
  const poleName = index.pack.electricPoles?.[0]?.id ?? 'medium-electric-pole';

  // Detect eligible direct-insertion pairs (upstream stage exclusively feeds 1 downstream stage)
  const directFeederForStage = new Map<string, { feeder: SolvedStage; itemId: string }>();
  const absorbedFeederIds = new Set<string>();

  if (options.directInsertion) {
    const outgoingEdges = new Map<string, typeof solveResult.edges>();
    for (const edge of solveResult.edges) {
      if (edge.sourceStageId.startsWith('RAW:')) continue;
      const list = outgoingEdges.get(edge.sourceStageId) ?? [];
      list.push(edge);
      outgoingEdges.set(edge.sourceStageId, list);
    }

    for (const stage of solveResult.stages) {
      if (stage.installedMachines <= 0) continue;
      const outs = outgoingEdges.get(stage.id) ?? [];
      if (outs.length !== 1) continue;
      const onlyEdge = outs[0];
      if (onlyEdge.kind !== 'item' || onlyEdge.targetStageId.startsWith('TARGET:')) continue;
      const consumer = solveResult.stages.find((s) => s.id === onlyEdge.targetStageId);
      if (!consumer || directFeederForStage.has(consumer.id)) continue;

      const uMachine = index.machinesById.get(stage.machineId);
      const dMachine = index.machinesById.get(consumer.machineId);
      if (!uMachine || !dMachine) continue;

      const uHasFluid =
        stage.inputs.some((i) => i.kind === 'fluid') ||
        stage.outputs.some((o) => o.kind === 'fluid');
      const dHasFluid =
        consumer.inputs.some((i) => i.kind === 'fluid') ||
        consumer.outputs.some((o) => o.kind === 'fluid');

      if (
        !uHasFluid &&
        !dHasFluid &&
        uMachine.tileSize.width <= 3 &&
        dMachine.tileSize.width <= 3 &&
        stage.installedMachines <= consumer.installedMachines
      ) {
        directFeederForStage.set(consumer.id, { feeder: stage, itemId: onlyEdge.itemId });
        absorbedFeederIds.add(stage.id);
      }
    }
  }

  // Group non-absorbed stages by topological layer
  const layersMap = new Map<number, SolvedStage[]>();
  for (const stage of solveResult.stages) {
    if (stage.installedMachines <= 0 || absorbedFeederIds.has(stage.id)) continue;
    const list = layersMap.get(stage.layerIndex) ?? [];
    list.push(stage);
    layersMap.set(stage.layerIndex, list);
  }

  const sortedLayers = Array.from(layersMap.keys()).sort((a, b) => a - b);
  const blockGapX =
    inputSide !== 'distributed'
      ? compactionMode === 'compact'
        ? 5
        : 7
      : compactionMode === 'compact'
        ? 4
        : 6;
  const layerGapY =
    inputSide !== 'distributed'
      ? compactionMode === 'compact'
        ? 7
        : 9
      : compactionMode === 'compact'
        ? 5
        : 7;

  const stageOutputAnchors = new Map<string, StageAnchor[]>();
  const stageInputAnchors = new Map<string, StageAnchor[]>();

  // Safe interior synthesis window when adapting inside an imported Base Grid Frame
  const safeMinX = interiorBounds ? interiorBounds.minX + (inputSide === 'west' ? 5 : 1) : 0;
  const safeMaxX = interiorBounds ? interiorBounds.maxX - 1 : Infinity;
  const safeMinY = interiorBounds ? interiorBounds.minY + 3 : -Infinity;
  const safeMaxY = interiorBounds ? interiorBounds.maxY - (inputSide === 'south' ? 5 : 3) : 0;
  const availInteriorW = interiorBounds ? Math.max(8, safeMaxX - safeMinX) : Infinity;
  const availInteriorH = interiorBounds ? Math.max(8, safeMaxY - safeMinY) : Infinity;

  const buildBlockPlan = (stage: SolvedStage) => {
    const machine = index.machinesById.get(stage.machineId)!;
    const requestedStageCount = stage.installedMachines;
    totalRequestedMachines += requestedStageCount;
    const count = interiorBounds
      ? requestedStageCount
      : Math.min(requestedStageCount, MAX_UNBOUNDED_MACHINES_PER_STAGE);

    const directPair = directFeederForStage.get(stage.id);
    const feederMachine = directPair
      ? index.machinesById.get(directPair.feeder.machineId)
      : undefined;

    const hasFluid =
      stage.inputs.some((i) => i.kind === 'fluid') ||
      stage.outputs.some((o) => o.kind === 'fluid');

    const solidInputCount = stage.inputs.filter(
      (i) => i.kind === 'item' && i.itemId !== directPair?.itemId
    ).length;

    const mW = machine.tileSize.width;
    const mH = machine.tileSize.height;
    const rowStepY = Math.max(
      mH + (hasFluid ? 1 : 0),
      feederMachine ? feederMachine.tileSize.height : mH
    );

    const maxPerColUnbounded = compactionMode === 'compact' ? 10 : 8;
    const maxRowsByGridHeight = interiorBounds
      ? Math.max(1, Math.floor(availInteriorH / rowStepY))
      : maxPerColUnbounded;

    // Reserve twin columns only when solid inputs <= 2 (so 3-input recipes keep 3 clean separate tracks)
    const useTwinColumns =
      !directPair &&
      count >= 6 &&
      !hasFluid &&
      solidInputCount <= 2 &&
      machine.tileSize.width <= 3 &&
      (!interiorBounds || Math.ceil(count / 2) <= maxRowsByGridHeight);

    const inputTracks = packSolidInputBelts(
      stage,
      beltThroughput,
      directPair?.itemId,
      useTwinColumns ? 2 : 3
    );
    const feederTracks = directPair
      ? packSolidInputBelts(directPair.feeder, beltThroughput, undefined, 2)
      : [];
    const fluidInputs = stage.inputs.filter((i) => i.kind === 'fluid');
    const fluidOutputs = stage.outputs.filter((o) => o.kind === 'fluid');

    const hasBeacons = options.includeBeacons && (stage.beacon?.count ?? 0) > 0;
    const beaconDef = hasBeacons
      ? index.beaconsById.get(stage.beacon!.beaconId) ?? index.pack.beacons[0]
      : undefined;
    const beaconStripW = beaconDef ? beaconDef.tileSize.width + 1 : 0;

    const leftTracks = Math.min(2, inputTracks.length);
    const rightInputTracks = inputTracks.length > 2 ? 1 : 0;
    const leftCorridorW = leftTracks > 0 ? leftTracks + 2 : 0;
    const rightInputW = rightInputTracks > 0 ? rightInputTracks + 2 : 0;
    const fluidW =
      fluidInputs.length > 1
        ? fluidInputs.length + 1
        : fluidInputs.length > 0 || fluidOutputs.length > 0
          ? 2
          : 0;

    const feederUnitW =
      directPair && feederMachine
        ? feederMachine.tileSize.width + 1 + (feederTracks.length > 0 ? feederTracks.length + 2 : 0)
        : 0;

    let cols = useTwinColumns
      ? 2
      : interiorBounds
        ? Math.max(1, Math.ceil(count / Math.min(maxPerColUnbounded, maxRowsByGridHeight)))
        : Math.min(4, Math.max(1, Math.ceil(count / maxPerColUnbounded)));

    const colGap = useTwinColumns ? 3 : (inputTracks.length > 2 ? 6 : 4) + feederUnitW;
    const fixedW =
      beaconStripW +
      leftCorridorW +
      fluidW +
      feederUnitW +
      (useTwinColumns ? 0 : 3) +
      rightInputW;

    // Clamp column count so block width fits inside the imported grid interior width!
    if (interiorBounds && !useTwinColumns && cols > 1) {
      const maxColsFittingW = Math.max(
        1,
        Math.floor((availInteriorW - fixedW + colGap) / (mW + colGap))
      );
      cols = Math.min(cols, maxColsFittingW);
    }

    const rows = interiorBounds
      ? Math.min(maxRowsByGridHeight, Math.ceil(count / cols))
      : Math.ceil(count / cols);

    const blockW = fixedW + cols * mW + Math.max(0, cols - 1) * colGap;
    const blockH = Math.max(mH, rows * rowStepY - (hasFluid ? 1 : 0));

    return {
      stage,
      machine,
      count,
      directPair,
      feederMachine,
      feederTracks,
      feederUnitW,
      useTwinColumns,
      cols,
      rows,
      rowStepY,
      inputTracks,
      fluidInputs,
      fluidOutputs,
      beaconStripW,
      beaconDef,
      leftCorridorW,
      fluidW,
      colGap,
      blockW,
      blockH,
    };
  };

  type BlockPlan = ReturnType<typeof buildBlockPlan>;
  const shelves: Array<{ items: BlockPlan[]; totalW: number; maxH: number }> = [];

  for (const layerIdx of sortedLayers) {
    const layerPlans = layersMap.get(layerIdx)!.map(buildBlockPlan);
    let currentShelf: { items: BlockPlan[]; totalW: number; maxH: number } = {
      items: [],
      totalW: 0,
      maxH: 0,
    };

    for (const bp of layerPlans) {
      const nextW =
        currentShelf.items.length > 0
          ? currentShelf.totalW + blockGapX + bp.blockW
          : bp.blockW;
      if (interiorBounds && currentShelf.items.length > 0 && nextW > availInteriorW) {
        shelves.push(currentShelf);
        currentShelf = { items: [bp], totalW: bp.blockW, maxH: bp.blockH };
      } else {
        currentShelf.items.push(bp);
        currentShelf.totalW = nextW;
        currentShelf.maxH = Math.max(currentShelf.maxH, bp.blockH);
      }
    }
    if (currentShelf.items.length > 0) {
      shelves.push(currentShelf);
    }
  }

  const totalFactoryH =
    shelves.reduce((sum, s) => sum + s.maxH, 0) +
    Math.max(0, shelves.length - 1) * layerGapY;
  const maxShelfW = shelves.reduce((m, s) => Math.max(m, s.totalW), 0);

  let currentBaseY: number;
  if (interiorBounds) {
    const interiorCenterY = Math.round((safeMinY + safeMaxY) / 2);
    const idealBaseY = Math.round(interiorCenterY + totalFactoryH / 2);
    const minValidBaseY = safeMinY + Math.min(availInteriorH, totalFactoryH);
    const clampedBaseY = Math.max(minValidBaseY, Math.min(safeMaxY, idealBaseY));
    currentBaseY = Math.max(
      minValidBaseY,
      Math.min(safeMaxY, clampedBaseY + options.productionOffsetY)
    );
  } else {
    currentBaseY = options.productionOffsetY;
  }

  for (const shelf of shelves) {
    let currentX: number;
    if (interiorBounds) {
      const interiorCenterX = Math.round((safeMinX + safeMaxX) / 2);
      const idealStartX = Math.round(interiorCenterX - shelf.totalW / 2);
      const maxValidStartX = Math.max(safeMinX, safeMaxX - Math.min(availInteriorW, shelf.totalW));
      const clampedStartX = Math.max(safeMinX, Math.min(maxValidStartX, idealStartX));
      currentX = Math.max(
        safeMinX,
        Math.min(maxValidStartX, clampedStartX + options.productionOffsetX)
      );
    } else {
      currentX = Math.round((maxShelfW - shelf.totalW) / 2) + options.productionOffsetX;
    }

    for (const bp of shelf.items) {
      const {
        stage,
        machine,
        count,
        directPair,
        feederMachine,
        feederTracks,
        useTwinColumns,
        cols,
        rows,
        rowStepY,
        inputTracks,
        fluidInputs,
        fluidOutputs,
        beaconStripW,
        beaconDef,
      } = bp;
      const mW = machine.tileSize.width;
      const mH = machine.tileSize.height;

      const effectiveRows = interiorBounds
        ? Math.min(rows, Math.max(0, Math.floor((currentBaseY - safeMinY + (rowStepY - mH)) / rowStepY)))
        : rows;
      const effectiveBlockH =
        effectiveRows > 0
          ? effectiveRows * rowStepY - (bp.fluidInputs.length > 0 || bp.fluidOutputs.length > 0 ? 1 : 0)
          : bp.blockH;

      const blockTopY = currentBaseY - effectiveBlockH;
      const blockBottomY = currentBaseY;
      const machinesStartX = currentX + beaconStripW + bp.leftCorridorW + bp.fluidW + bp.feederUnitW;

      // Align input tracks with their upstream producer X coordinates to prevent
      // cross-over tangles (e.g. Pipe on left + Iron Gear Wheel on right entering Engine Unit)
      if (!directPair && !useTwinColumns && (inputTracks.length === 2 || inputTracks.length === 3)) {
        const blockCenterX = machinesStartX + Math.floor(mW / 2);
        const sourceXFor = (itemId: string): number => {
          const edge = solveResult.edges.find(
            (e) => e.targetStageId === stage.id && e.itemId === itemId && e.kind === 'item'
          );
          if (edge && !edge.sourceStageId.startsWith('RAW:') && !absorbedFeederIds.has(edge.sourceStageId)) {
            const anchors = stageOutputAnchors.get(edge.sourceStageId);
            const match = anchors?.find((a) => a.itemId === itemId && a.kind === 'item');
            if (match) return match.x;
          }
          return blockCenterX;
        };
        const sortedBySrcX = [...inputTracks].sort(
          (a, b) => sourceXFor(a.itemId) - sourceXFor(b.itemId)
        );
        if (inputTracks.length === 2) {
          // track[1] is outer-left (mX-3), track[0] is inner-left (mX-2)
          inputTracks[1] = sortedBySrcX[0];
          inputTracks[0] = sortedBySrcX[1];
        } else if (inputTracks.length === 3) {
          // track[1] is outer-left (mX-3), track[0] is inner-left (mX-2), track[2] is right (mX+mW+2)
          inputTracks[1] = sortedBySrcX[0];
          inputTracks[0] = sortedBySrcX[1];
          inputTracks[2] = sortedBySrcX[2];
        }
      }

      const outAnchors: StageAnchor[] = [];
      const inAnchors: StageAnchor[] = [];
      const feederInAnchors: StageAnchor[] = [];
      const colTrackXs = new Map<number, number[]>();
      const colOutXs: number[] = [];

      const mainSolidOutput = stage.outputs.find((o) => o.kind === 'item');
      const machineColor = index.resourcesById.get(
        mainSolidOutput?.itemId ?? stage.outputs[0]?.itemId ?? ''
      )?.color;

      // 0. Place flanking Beacon Strip when beacons are configured for this stage
      if (beaconDef && stage.beacon && stage.beacon.count > 0 && effectiveRows > 0) {
        const bW = beaconDef.tileSize.width;
        const bH = beaconDef.tileSize.height;
        const maxBeaconRows = Math.max(1, Math.floor(effectiveBlockH / bH));
        const desiredBeaconSlots = Math.min(maxBeaconRows, Math.max(1, stage.beacon.count));
        for (let b = 0; b < desiredBeaconSlots; b++) {
          const bY = blockBottomY - (b + 1) * bH;
          if (!interiorBounds || (bY >= safeMinY && currentX + bW <= safeMaxX)) {
            grid.place({
              kind: 'beacon',
              name: beaconDef.id,
              tileX: currentX,
              tileY: bY,
              width: bW,
              height: bH,
              direction: 0,
              stageId: stage.id,
              moduleIds: stage.beacon.moduleIds,
            });
          }
        }
      }

      // 1. Place Machines in compact columns (stepping smoothly around interior grid obstacles)
      let placedMachines = 0;
      let placedFeeders = 0;

      for (let c = 0; c < cols; c++) {
        const mX = machinesStartX + c * (mW + bp.colGap);
        if (interiorBounds && mX + mW + 1 > safeMaxX) break;

        let colCursorY = blockBottomY - mH;
        const colMinY = interiorBounds ? Math.max(blockTopY, safeMinY) : blockTopY;
        let placedInCol = 0;

        while (placedMachines < count && placedInCol < effectiveRows && colCursorY >= colMinY) {
          const feederXNeeded = directPair && feederMachine ? mX - 1 - feederMachine.tileSize.width : mX;
          const mainOk =
            (!interiorBounds || (feederXNeeded >= safeMinX && mX + mW <= safeMaxX)) &&
            grid.canPlace(mX, colCursorY, mW, mH);
          const feederOk =
            !directPair ||
            !feederMachine ||
            placedFeeders >= directPair.feeder.installedMachines ||
            grid.canPlace(feederXNeeded, colCursorY, feederMachine.tileSize.width, feederMachine.tileSize.height);

          if (!mainOk || !feederOk) {
            // Slide 1 tile up past interior obstacle (roboport / substation)
            colCursorY -= 1;
            continue;
          }

          const mY = colCursorY;
          placedMachines++;
          placedInCol++;
          totalPlacedMachines++;

          grid.place({
            kind: 'machine',
            name: machine.id,
            tileX: mX,
            tileY: mY,
            width: mW,
            height: mH,
            direction: 0,
            recipeId: stage.recipeId,
            stageId: stage.id,
            moduleIds: stage.moduleIds,
            accentColor: machineColor,
          });

          const midY = mY + Math.floor(mH / 2);

          // Optional Direct Insertion Feeder Machine paired on the left of this machine
          if (directPair && feederMachine && placedFeeders < directPair.feeder.installedMachines) {
            placedFeeders++;
            const fW = feederMachine.tileSize.width;
            const fH = feederMachine.tileSize.height;
            const fX = mX - 1 - fW;
            const fY = mY;

            grid.place({
              kind: 'machine',
              name: feederMachine.id,
              tileX: fX,
              tileY: fY,
              width: fW,
              height: fH,
              direction: 0,
              recipeId: directPair.feeder.recipeId,
              stageId: directPair.feeder.id,
              moduleIds: directPair.feeder.moduleIds,
              accentColor: index.resourcesById.get(directPair.itemId)?.color,
            });

            grid.place({
              kind: 'inserter',
              name: inserterName,
              tileX: mX - 1,
              tileY: midY,
              width: 1,
              height: 1,
              direction: 4,
              inserterReach: 1,
              inserterItems: [directPair.itemId],
              stageId: stage.id,
            });

            if (feederTracks[0]) {
              grid.place({
                kind: 'inserter',
                name: inserterName,
                tileX: fX - 1,
                tileY: fY + Math.floor(fH / 2),
                width: 1,
                height: 1,
                direction: 4,
                inserterReach: 1,
                inserterItems: [feederTracks[0].itemId],
                stageId: directPair.feeder.id,
              });
            }
          }

          // 2. Place Input Inserters & Outer Belts for this machine
          if (useTwinColumns) {
            const isLeftCol = c === 0;
            const beltEdgeX = isLeftCol ? mX - 2 : mX + mW + 1;
            const insX = isLeftCol ? mX - 1 : mX + mW;
            const insDir: Direction = isLeftCol ? 4 : 12;

            if (inputTracks[0]) {
              const t0 = inputTracks[0];
              grid.place({
                kind: 'inserter',
                name: inserterName,
                tileX: insX,
                tileY: midY,
                width: 1,
                height: 1,
                direction: insDir,
                inserterReach: 1,
                inserterItems: t0.partnerItemId ? [t0.itemId, t0.partnerItemId] : [t0.itemId],
                stageId: stage.id,
              });
            }

            if (inputTracks[1]) {
              const outerBeltX = isLeftCol ? beltEdgeX - 1 : beltEdgeX + 1;
              const longInsX = isLeftCol ? mX - 1 : mX + mW;
              grid.place({
                kind: 'inserter',
                name: longInserterName,
                tileX: longInsX,
                tileY: Math.max(mY, midY - 1),
                width: 1,
                height: 1,
                direction: insDir,
                inserterReach: 2,
                inserterItems: [inputTracks[1].itemId],
                stageId: stage.id,
              });
              for (let y = mY; y < mY + rowStepY; y++) {
                grid.placeOrMergeBelt(
                  outerBeltX,
                  y,
                  beltName,
                  0,
                  inputTracks[1].partnerItemId
                    ? { left: inputTracks[1].itemId, right: inputTracks[1].partnerItemId }
                    : { left: inputTracks[1].itemId, right: inputTracks[1].itemId },
                  stage.id
                );
              }
            }

            if (mainSolidOutput) {
              const outInsX = isLeftCol ? mX + mW : mX - 1;
              const outInsDir: Direction = isLeftCol ? 4 : 12;
              grid.place({
                kind: 'inserter',
                name: inserterName,
                tileX: outInsX,
                tileY: midY,
                width: 1,
                height: 1,
                direction: outInsDir,
                inserterReach: 1,
                inserterItems: [mainSolidOutput.itemId],
                stageId: stage.id,
              });
            }

            if (options.includePowerPoles && placedInCol % 2 === 1 && mH >= 3) {
              const poleY = mY + mH - 1;
              if (grid.canPlace(insX, poleY, 1, 1)) {
                grid.place({
                  kind: 'electric-pole',
                  name: poleName,
                  tileX: insX,
                  tileY: poleY,
                  width: 1,
                  height: 1,
                  direction: 0,
                  stageId: stage.id,
                });
              }
            }
          } else {
            const leftGapX = directPair && feederMachine ? mX - 1 - feederMachine.tileSize.width - 1 : mX - 1;
            const inputBeltBaseX = directPair && feederMachine ? mX + mW + 2 : mX - 2;

            if (inputTracks[0]) {
              if (directPair) {
                grid.place({
                  kind: 'inserter',
                  name: longInserterName,
                  tileX: mX + mW,
                  tileY: Math.max(mY, midY - 1),
                  width: 1,
                  height: 1,
                  direction: 12,
                  inserterReach: 2,
                  inserterItems: inputTracks[0].partnerItemId
                    ? [inputTracks[0].itemId, inputTracks[0].partnerItemId]
                    : [inputTracks[0].itemId],
                  stageId: stage.id,
                });
              } else {
                grid.place({
                  kind: 'inserter',
                  name: inserterName,
                  tileX: mX - 1,
                  tileY: midY,
                  width: 1,
                  height: 1,
                  direction: 4,
                  inserterReach: 1,
                  inserterItems: inputTracks[0].partnerItemId
                    ? [inputTracks[0].itemId, inputTracks[0].partnerItemId]
                    : [inputTracks[0].itemId],
                  stageId: stage.id,
                });
              }
            }
            if (inputTracks[1] && !directPair) {
              grid.place({
                kind: 'inserter',
                name: longInserterName,
                tileX: mX - 1,
                tileY: Math.max(mY, midY - 1),
                width: 1,
                height: 1,
                direction: 4,
                inserterReach: 2,
                inserterItems: [inputTracks[1].itemId],
                stageId: stage.id,
              });
            }
            if (inputTracks[2] && !directPair) {
              grid.place({
                kind: 'inserter',
                name: longInserterName,
                tileX: mX + mW,
                tileY: Math.max(mY, midY - 1),
                width: 1,
                height: 1,
                direction: 12,
                inserterReach: 2,
                inserterItems: [inputTracks[2].itemId],
                stageId: stage.id,
              });
            }

            if (mainSolidOutput) {
              grid.place({
                kind: 'inserter',
                name: inserterName,
                tileX: mX + mW,
                tileY: midY,
                width: 1,
                height: 1,
                direction: 4,
                inserterReach: 1,
                inserterItems: [mainSolidOutput.itemId],
                stageId: stage.id,
              });
            }

            if (options.includePowerPoles && placedInCol % 2 === 1 && mH >= 3) {
              const poleX = directPair ? mX + mW : mX - 1;
              const poleY = mY + mH - 1;
              if (grid.canPlace(poleX, poleY, 1, 1)) {
                grid.place({
                  kind: 'electric-pole',
                  name: poleName,
                  tileX: poleX,
                  tileY: poleY,
                  width: 1,
                  height: 1,
                  direction: 0,
                  stageId: stage.id,
                });
              } else if (grid.canPlace(leftGapX, poleY, 1, 1)) {
                grid.place({
                  kind: 'electric-pole',
                  name: poleName,
                  tileX: leftGapX,
                  tileY: poleY,
                  width: 1,
                  height: 1,
                  direction: 0,
                  stageId: stage.id,
                });
              }
            }

            void inputBeltBaseX;
          }

          colCursorY -= rowStepY;
        }

        if (placedInCol === 0) continue;

        // Lay continuous vertical belts for this column (adapting around grid obstacles via undergrounds!)
        const recordTrackCol = (tIdx: number, bx: number) => {
          const arr = colTrackXs.get(tIdx) ?? [];
          arr.push(bx);
          colTrackXs.set(tIdx, arr);
        };

        if (useTwinColumns) {
          const isLeftCol = c === 0;
          const beltX = isLeftCol ? mX - 2 : mX + mW + 1;
          if (inputTracks[0]) {
            const t0 = inputTracks[0];
            layAdaptiveVerticalBelt(
              grid,
              beltX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              t0.partnerItemId
                ? { left: t0.itemId, right: t0.partnerItemId }
                : { left: t0.itemId, right: t0.itemId },
              stage.id
            );
            recordTrackCol(0, beltX);
          }
          if (inputTracks[1]) {
            const outerBeltX = isLeftCol ? beltX - 1 : beltX + 1;
            const t1 = inputTracks[1];
            layAdaptiveVerticalBelt(
              grid,
              outerBeltX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              t1.partnerItemId
                ? { left: t1.itemId, right: t1.partnerItemId }
                : { left: t1.itemId, right: t1.itemId },
              stage.id
            );
            recordTrackCol(1, outerBeltX);
          }

          if (c === 0 && mainSolidOutput) {
            const centerBeltX = mX + mW + 1;
            layAdaptiveVerticalBelt(
              grid,
              centerBeltX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              { left: mainSolidOutput.itemId, right: mainSolidOutput.itemId },
              stage.id
            );
            outAnchors.push({
              x: centerBeltX,
              y: blockTopY,
              itemId: mainSolidOutput.itemId,
              kind: 'item',
            });
          }
        } else {
          if (directPair && feederMachine && feederTracks[0] && c === 0) {
            const ft0 = feederTracks[0];
            const fbX = mX - 1 - feederMachine.tileSize.width - 2;
            layAdaptiveVerticalBelt(
              grid,
              fbX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              { left: ft0.itemId, right: ft0.itemId },
              directPair.feeder.id
            );
            feederInAnchors.push({
              x: fbX,
              y: blockBottomY - 1,
              itemId: ft0.itemId,
              kind: 'item',
            });
          }

          if (inputTracks[0]) {
            const t0 = inputTracks[0];
            const bX = directPair ? mX + mW + 2 : mX - 2;
            layAdaptiveVerticalBelt(
              grid,
              bX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              t0.partnerItemId
                ? { left: t0.itemId, right: t0.partnerItemId }
                : { left: t0.itemId, right: t0.itemId },
              stage.id
            );
            recordTrackCol(0, bX);
          }
          if (inputTracks[1] && !directPair) {
            const t1 = inputTracks[1];
            const bX = mX - 3;
            layAdaptiveVerticalBelt(
              grid,
              bX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              t1.partnerItemId
                ? { left: t1.itemId, right: t1.partnerItemId }
                : { left: t1.itemId, right: t1.itemId },
              stage.id
            );
            recordTrackCol(1, bX);
          }
          if (mainSolidOutput) {
            const outX = mX + mW + 1;
            layAdaptiveVerticalBelt(
              grid,
              outX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              { left: mainSolidOutput.itemId, right: mainSolidOutput.itemId },
              stage.id
            );
            colOutXs.push(outX);
          }
          if (inputTracks[2] && !directPair) {
            const t2 = inputTracks[2];
            const bX = mX + mW + 2;
            layAdaptiveVerticalBelt(
              grid,
              bX,
              blockTopY,
              blockBottomY,
              beltName,
              undergroundName,
              t2.partnerItemId
                ? { left: t2.itemId, right: t2.partnerItemId }
                : { left: t2.itemId, right: t2.itemId },
              stage.id
            );
            recordTrackCol(2, bX);
          }
        }
      }

      // Unify multi-column solid inputs (both twin-column and multi-column) into 1 clean stage anchor per track
      const wireTrackUnifiedAnchor = (tIdx: number, track: BeltTrack, colXs: number[]) => {
        if (colXs.length === 0) return;
        const primaryX = colXs[0];
        let entryYBase = blockBottomY - 1;

        if (colXs.length > 1) {
          // Wire column 0..N together via a bottom distribution manifold + splitter
          const splitY = blockBottomY + 1 + tIdx * 3;
          const busY = blockBottomY + tIdx * 3;
          const midX = Math.floor((colXs[0] + colXs[colXs.length - 1]) / 2);
          const lanes = track.partnerItemId
            ? { left: track.itemId, right: track.partnerItemId }
            : { left: track.itemId, right: track.itemId };
          const maxBusY = interiorBounds ? interiorBounds.maxY - 2 : Infinity;

          if (splitY <= maxBusY && grid.canPlace(midX, splitY, 2, 1)) {
            grid.place({
              kind: 'splitter',
              name: splitterName,
              tileX: midX,
              tileY: splitY,
              width: 2,
              height: 1,
              direction: 0,
              stageId: stage.id,
            });

            // Connect left arm from midX -> colXs[0] and right arm from midX+1 -> colXs[last]
            const connectArm = (startX: number, targetX: number) => {
              const step = targetX >= startX ? 1 : -1;
              const dir: Direction = step > 0 ? 4 : 12;
              for (let x = startX; step > 0 ? x <= targetX : x >= targetX; x += step) {
                if (x === targetX) {
                  for (let y = busY; y >= blockBottomY; y--) {
                    grid.placeOrMergeBelt(x, y, beltName, 0, lanes, stage.id);
                  }
                } else {
                  const ex = grid.getAt(x, busY);
                  if (!ex) {
                    grid.placeOrMergeBelt(x, busY, beltName, dir, lanes, stage.id);
                  } else if (!ex.isGridFrame) {
                    // Jump cleanly underground across intermediate column belts
                    const prev = grid.getAt(x - step, busY);
                    if (prev && prev.kind === 'transport-belt' && prev.direction === dir) {
                      grid.remove(prev);
                      grid.place({
                        kind: 'underground-belt',
                        name: undergroundName,
                        tileX: x - step,
                        tileY: busY,
                        width: 1,
                        height: 1,
                        direction: dir,
                        undergroundType: 'input',
                        beltLanes: lanes,
                        stageId: stage.id,
                      });
                    }
                    let landX = x + step;
                    while (grid.getAt(landX, busY) && Math.abs(landX - (x - step)) < beltMaxJump) {
                      landX += step;
                    }
                    if (!grid.getAt(landX, busY)) {
                      grid.place({
                        kind: 'underground-belt',
                        name: undergroundName,
                        tileX: landX,
                        tileY: busY,
                        width: 1,
                        height: 1,
                        direction: dir,
                        undergroundType: 'output',
                        beltLanes: lanes,
                        stageId: stage.id,
                      });
                      x = landX;
                    }
                  }
                }
              }
            };

            connectArm(midX, colXs[0]);
            connectArm(midX + 1, colXs[colXs.length - 1]);

            inAnchors.push({
              x: midX,
              y: splitY,
              entryX: midX,
              entryY: splitY + 1,
              entryDir: 0,
              itemId: track.itemId,
              kind: 'item',
            });
            return;
          }
        }

        // Single column (or cramped fallback): clean vertical entry (with distinct side-load for partner item if present)
        if (track.partnerItemId) {
          const mergeY = blockBottomY;
          const lanes = { left: track.itemId, right: track.partnerItemId };
          if (!interiorBounds || mergeY + 1 < interiorBounds.maxY) {
            grid.placeOrMergeBelt(primaryX, mergeY, beltName, 0, lanes, stage.id);
            entryYBase = mergeY;
            if (grid.canPlace(primaryX + 1, mergeY, 1, 1)) {
              grid.place({
                kind: 'transport-belt',
                name: beltName,
                tileX: primaryX + 1,
                tileY: mergeY,
                width: 1,
                height: 1,
                direction: 12,
                beltLanes: { left: track.partnerItemId, right: track.partnerItemId },
                stageId: stage.id,
              });
              inAnchors.push({
                x: primaryX + 1,
                y: mergeY,
                entryX: primaryX + 1,
                entryY: mergeY + 1,
                entryDir: 0,
                itemId: track.partnerItemId,
                kind: 'item',
              });
            } else {
              inAnchors.push({
                x: primaryX,
                y: entryYBase,
                itemId: track.partnerItemId,
                kind: 'item',
              });
            }
          }
        }

        inAnchors.push({
          x: primaryX,
          y: entryYBase,
          itemId: track.itemId,
          kind: 'item',
        });
      };

      inputTracks.forEach((track, tIdx) => {
        wireTrackUnifiedAnchor(tIdx, track, colTrackXs.get(tIdx) ?? []);
      });

      // Unify multi-column solid outputs into 1 stage output anchor when !useTwinColumns && cols > 1
      if (!useTwinColumns && mainSolidOutput && colOutXs.length > 0) {
        if (colOutXs.length > 1) {
          const topBusY = blockTopY - 1;
          const targetX = colOutXs[0];
          const lanes = { left: mainSolidOutput.itemId, right: mainSolidOutput.itemId };
          if (!interiorBounds || topBusY >= interiorBounds.minY) {
            grid.placeOrMergeBelt(targetX, topBusY, beltName, 0, lanes, stage.id);
            for (let ci = 1; ci < colOutXs.length; ci++) {
              for (let x = colOutXs[ci]; x > targetX; x--) {
                if (x === colOutXs[ci] && !grid.getAt(x, topBusY)) {
                  grid.placeOrMergeBelt(x, topBusY, beltName, 12, lanes, stage.id);
                } else if (!grid.getAt(x, topBusY)) {
                  grid.placeOrMergeBelt(x, topBusY, beltName, 12, lanes, stage.id);
                }
              }
            }
            outAnchors.push({
              x: targetX,
              y: topBusY,
              itemId: mainSolidOutput.itemId,
              kind: 'item',
            });
          } else {
            outAnchors.push({
              x: targetX,
              y: blockTopY,
              itemId: mainSolidOutput.itemId,
              kind: 'item',
            });
          }
        } else {
          outAnchors.push({
            x: colOutXs[0],
            y: blockTopY,
            itemId: mainSolidOutput.itemId,
            kind: 'item',
          });
        }
      }

      // 3. Place Fluid Pipe Manifolds if stage uses/produces fluids
      if ((fluidInputs.length > 0 || fluidOutputs.length > 0) && placedMachines > 0) {
        const pipeX = machinesStartX - 1;
        const primaryFluid = fluidInputs[0]?.itemId ?? fluidOutputs[0]?.itemId;
        layAdaptiveVerticalPipe(grid, pipeX, blockTopY, blockBottomY, primaryFluid, stage.id);

        if (fluidInputs[0]) {
          inAnchors.push({
            x: pipeX,
            y: blockBottomY - 1,
            itemId: fluidInputs[0].itemId,
            kind: 'fluid',
          });
        }
        for (let fi = 1; fi < fluidInputs.length; fi++) {
          const extraPipeX = pipeX - fi;
          if (grid.canPlace(extraPipeX, blockBottomY - 1, 1, 1)) {
            grid.place({
              kind: 'pipe',
              name: 'pipe',
              tileX: extraPipeX,
              tileY: blockBottomY - 1,
              width: 1,
              height: 1,
              direction: 0,
              fluidId: fluidInputs[fi].itemId,
              stageId: stage.id,
            });
          }
          inAnchors.push({
            x: extraPipeX,
            y: blockBottomY - 1,
            itemId: fluidInputs[fi].itemId,
            kind: 'fluid',
          });
        }
        if (fluidOutputs[0]) {
          outAnchors.push({
            x: pipeX,
            y: blockTopY,
            itemId: fluidOutputs[0].itemId,
            kind: 'fluid',
          });
        }
      }

      // Single unified splitters handled inside wireTrackUnifiedAnchor above

      if (placedMachines > 0) {
        zones.push({
          stageId: stage.id,
          recipeId: stage.recipeId,
          label: directPair
            ? `${directPair.feeder.recipeName} → ${stage.recipeName}`
            : stage.recipeName,
          tileX: currentX,
          tileY: blockTopY,
          width: bp.blockW,
          height: effectiveBlockH,
          machineCount: placedMachines + placedFeeders,
        });
      }

      stageOutputAnchors.set(stage.id, outAnchors);
      stageInputAnchors.set(stage.id, inAnchors);
      if (directPair) {
        stageInputAnchors.set(directPair.feeder.id, feederInAnchors);
      }

      currentX += bp.blockW + blockGapX;
    }

    currentBaseY -= shelf.maxH + layerGapY;
  }

  // Helper helpers for stage anchor entry/exit tiles
  const getAnchorEntry = (anchor: StageAnchor): { x: number; y: number; dir: Direction } => ({
    x: anchor.entryX ?? anchor.x,
    y: anchor.entryY ?? anchor.y + 1,
    dir: anchor.entryDir ?? 0,
  });

  const getAnchorExit = (anchor: StageAnchor): { x: number; y: number; dir: Direction } => ({
    x: anchor.entryX ?? anchor.x,
    y: anchor.entryY ?? anchor.y - 1,
    dir: anchor.entryDir ?? 0,
  });

  // Pre-reserve all un-routed stage input & output aprons so earlier A* paths
  // jump cleanly underneath them instead of blocking downstream stage entries.
  const reservedAprons = new Set<string>();
  for (const list of stageInputAnchors.values()) {
    for (const a of list) {
      const e = getAnchorEntry(a);
      reservedAprons.add(`${e.x},${e.y}`);
    }
  }
  for (const list of stageOutputAnchors.values()) {
    for (const a of list) {
      const ex = getAnchorExit(a);
      reservedAprons.add(`${ex.x},${ex.y}`);
    }
  }

  // Track placed belt/pipe trunk tiles per item/origin for clean splitter branching
  const rawTrunksByItem = new Map<string, Array<{ x: number; y: number }>>();
  const recordRawTrunk = (kind: 'item' | 'fluid', itemId: string, pts: Array<{ x: number; y: number }>) => {
    const k = `${kind}:${itemId}`;
    const list = rawTrunksByItem.get(k) ?? [];
    list.push(...pts);
    rawTrunksByItem.set(k, list);
  };

  // 4. Route Inter-Stage Belts & Pipes using unified A* + real 2×1 splitter branching
  const prodOnlyInter = grid.entities.filter((e) => !e.isGridFrame);
  const interPreBounds = computeLayoutStats(
    prodOnlyInter.length > 0 ? prodOnlyInter : grid.entities
  ).bounds;
  const interBounds = interiorBounds
    ? {
        minX: interiorBounds.minX,
        maxX: interiorBounds.maxX - 1,
        minY: interiorBounds.minY,
        maxY: interiorBounds.maxY - 1,
      }
    : {
        minX: interPreBounds.minX - 14,
        maxX: interPreBounds.maxX + 14,
        minY: interPreBounds.minY - 12,
        maxY: interPreBounds.maxY + 12,
      };

  interface InterConsumerGroup {
    sourceStageId: string;
    itemId: string;
    kind: 'item' | 'fluid';
    srcAnchor: StageAnchor;
    targets: Array<{ dstAnchor: StageAnchor }>;
  }
  const interGroups = new Map<string, InterConsumerGroup>();
  for (const edge of solveResult.edges) {
    if (edge.sourceStageId.startsWith('RAW:') || edge.targetStageId.startsWith('TARGET:')) continue;
    if (absorbedFeederIds.has(edge.sourceStageId)) continue;
    const fromAnchors = stageOutputAnchors.get(edge.sourceStageId) ?? [];
    const toAnchors = stageInputAnchors.get(edge.targetStageId) ?? [];
    const src = fromAnchors.find((a) => a.itemId === edge.itemId && a.kind === edge.kind);
    const dst = toAnchors.find((a) => a.itemId === edge.itemId && a.kind === edge.kind);
    if (!src || !dst) continue;

    const gKey = `${edge.sourceStageId}:${edge.kind}:${edge.itemId}`;
    const existing = interGroups.get(gKey);
    if (existing) {
      if (
        !existing.targets.some(
          (t) => t.dstAnchor.x === dst.x && t.dstAnchor.y === dst.y && t.dstAnchor.entryX === dst.entryX
        )
      ) {
        existing.targets.push({ dstAnchor: dst });
      }
    } else {
      interGroups.set(gKey, {
        sourceStageId: edge.sourceStageId,
        itemId: edge.itemId,
        kind: edge.kind,
        srcAnchor: src,
        targets: [{ dstAnchor: dst }],
      });
    }
  }

  const sortedInterGroups = Array.from(interGroups.values()).sort((a, b) => {
    const da = Math.min(...a.targets.map((t) => Math.abs(t.dstAnchor.x - a.srcAnchor.x) + Math.abs(t.dstAnchor.y - a.srcAnchor.y)));
    const db = Math.min(...b.targets.map((t) => Math.abs(t.dstAnchor.x - b.srcAnchor.x) + Math.abs(t.dstAnchor.y - b.srcAnchor.y)));
    return da - db;
  });

  sortedInterGroups.forEach((group, gIdx) => {
    const srcExit = getAnchorExit(group.srcAnchor);
    reservedAprons.delete(`${srcExit.x},${srcExit.y}`);

    const sortedTargets = [...group.targets].sort((a, b) => {
      const da = Math.abs(a.dstAnchor.x - srcExit.x) + Math.abs(a.dstAnchor.y - srcExit.y);
      const db = Math.abs(b.dstAnchor.x - srcExit.x) + Math.abs(b.dstAnchor.y - srcExit.y);
      return da - db;
    });

    const trunkTiles: Array<{ x: number; y: number }> = [
      { x: group.srcAnchor.x, y: group.srcAnchor.y },
    ];
    const reqSpec = { itemId: group.itemId, kind: group.kind };

    sortedTargets.forEach((target, tIdx) => {
      const dstGoal = getAnchorEntry(target.dstAnchor);
      reservedAprons.delete(`${dstGoal.x},${dstGoal.y}`);
      const preferY = Math.round((srcExit.y + dstGoal.y) / 2) + ((gIdx % 3) - 1);

      let ok = false;
      if (tIdx === 0) {
        ok = routeExternalFeederPath(
          grid,
          srcExit,
          dstGoal,
          reqSpec,
          beltName,
          undergroundName,
          interBounds,
          beltMaxJump,
          {
            reservedAprons,
            preferY,
            maxExpansions: 60000,
            onStamp: (pts) => trunkTiles.push(...pts),
          }
        );
        if (!ok && !interiorBounds) {
          const wideBounds = {
            minX: interBounds.minX - 10,
            maxX: interBounds.maxX + 10,
            minY: interBounds.minY - 8,
            maxY: interBounds.maxY + 8,
          };
          ok = routeExternalFeederPath(
            grid,
            srcExit,
            dstGoal,
            reqSpec,
            beltName,
            undergroundName,
            wideBounds,
            beltMaxJump,
            {
              reservedAprons,
              preferY,
              maxExpansions: 80000,
              onStamp: (pts) => trunkTiles.push(...pts),
            }
          );
        }
      } else {
        ok = branchFromTrunkAndRoute(
          grid,
          trunkTiles,
          dstGoal,
          reqSpec,
          beltName,
          undergroundName,
          splitterName,
          interBounds,
          beltMaxJump,
          {
            reservedAprons,
            preferY,
            onStamp: (pts) => trunkTiles.push(...pts),
          }
        );
        if (!ok && !interiorBounds) {
          const wideBounds = {
            minX: interBounds.minX - 10,
            maxX: interBounds.maxX + 10,
            minY: interBounds.minY - 8,
            maxY: interBounds.maxY + 8,
          };
          ok = branchFromTrunkAndRoute(
            grid,
            trunkTiles,
            dstGoal,
            reqSpec,
            beltName,
            undergroundName,
            splitterName,
            wideBounds,
            beltMaxJump,
            {
              reservedAprons,
              preferY,
              onStamp: (pts) => trunkTiles.push(...pts),
            }
          );
        }
      }

      if (!ok) {
        placeFeederTile(grid, dstGoal.x, dstGoal.y, reqSpec, beltName, dstGoal.dir);
      }
    });
  });

  // 5. Raw / External Input Feeders + Port Markers (Distributed OR Consolidated Train/Bus)
  interface RawConsumerEntry {
    anchor: StageAnchor;
    ratePerSec: number;
    beltsRequired: number;
  }
  interface GroupedRawPortRequest {
    key: string;
    itemId: string;
    partnerItemId?: string;
    kind: 'item' | 'fluid';
    ratePerSec: number;
    beltsRequired: number;
    anchor: StageAnchor;
    consumers: RawConsumerEntry[];
  }

  const consolidateByItem = Boolean(options.trainStation || inputSide !== 'distributed');
  let rawRequests: GroupedRawPortRequest[] = [];

  if (consolidateByItem) {
    // Consolidate consumers by (kind, itemId) so each raw material uses ceil(totalBelts)
    // ports instead of duplicating overlapping wagon/bus ports per stage.
    const rawByItem = new Map<
      string,
      {
        itemId: string;
        kind: 'item' | 'fluid';
        totalRatePerSec: number;
        totalBelts: number;
        consumers: RawConsumerEntry[];
      }
    >();

    for (const edge of solveResult.edges) {
      if (!edge.sourceStageId.startsWith('RAW:')) continue;
      const toAnchors = stageInputAnchors.get(edge.targetStageId) ?? [];
      const dst = toAnchors.find((a) => a.itemId === edge.itemId && a.kind === edge.kind);
      if (!dst) continue;

      const iKey = `${edge.kind}:${edge.itemId}`;
      const existing = rawByItem.get(iKey);
      const consumer: RawConsumerEntry = {
        anchor: dst,
        ratePerSec: edge.actualRatePerSec,
        beltsRequired: edge.beltsRequired,
      };
      if (existing) {
        existing.totalRatePerSec += edge.actualRatePerSec;
        existing.totalBelts += edge.beltsRequired;
        const dup = existing.consumers.find(
          (c) => c.anchor.x === dst.x && c.anchor.y === dst.y && c.anchor.entryX === dst.entryX
        );
        if (dup) {
          dup.ratePerSec += edge.actualRatePerSec;
          dup.beltsRequired += edge.beltsRequired;
        } else {
          existing.consumers.push(consumer);
        }
      } else {
        rawByItem.set(iKey, {
          itemId: edge.itemId,
          kind: edge.kind,
          totalRatePerSec: edge.actualRatePerSec,
          totalBelts: edge.beltsRequired,
          consumers: [consumer],
        });
      }
    }

    for (const [iKey, itemGroup] of rawByItem.entries()) {
      const sortedConsumers = [...itemGroup.consumers].sort(
        (a, b) => b.anchor.y - a.anchor.y || a.anchor.x - b.anchor.x
      );
      const numPorts =
        itemGroup.kind === 'item'
          ? Math.max(1, Math.min(sortedConsumers.length, Math.ceil(itemGroup.totalBelts - 1e-6)))
          : 1;

      const buckets: RawConsumerEntry[][] = Array.from({ length: numPorts }, () => []);
      sortedConsumers.forEach((c, idx) => {
        buckets[idx % numPorts].push(c);
      });

      buckets.forEach((bucket, bIdx) => {
        if (bucket.length === 0) return;
        const rateSum = bucket.reduce((s, c) => s + c.ratePerSec, 0);
        const beltSum = bucket.reduce((s, c) => s + c.beltsRequired, 0);
        rawRequests.push({
          key: numPorts === 1 ? iKey : `${iKey}#${bIdx}`,
          itemId: itemGroup.itemId,
          kind: itemGroup.kind,
          ratePerSec: rateSum,
          beltsRequired: beltSum,
          anchor: bucket[0].anchor,
          consumers: bucket,
        });
      });
    }
  } else {
    const rawRequestByAnchor = new Map<string, GroupedRawPortRequest>();
    for (const edge of solveResult.edges) {
      if (!edge.sourceStageId.startsWith('RAW:')) continue;
      const toAnchors = stageInputAnchors.get(edge.targetStageId) ?? [];
      const dst = toAnchors.find((a) => a.itemId === edge.itemId && a.kind === edge.kind);
      if (!dst) continue;

      const e = getAnchorEntry(dst);
      const anchorKey = `${dst.kind}:${e.x},${e.y}`;
      const existing = rawRequestByAnchor.get(anchorKey);
      if (existing) {
        if (existing.itemId !== edge.itemId && !existing.partnerItemId) {
          existing.partnerItemId = edge.itemId;
        }
        existing.ratePerSec += edge.actualRatePerSec;
        existing.beltsRequired += edge.beltsRequired;
      } else {
        rawRequestByAnchor.set(anchorKey, {
          key: anchorKey,
          itemId: edge.itemId,
          kind: edge.kind,
          ratePerSec: edge.actualRatePerSec,
          beltsRequired: edge.beltsRequired,
          anchor: dst,
          consumers: [{ anchor: dst, ratePerSec: edge.actualRatePerSec, beltsRequired: edge.beltsRequired }],
        });
      }
    }
    rawRequests = Array.from(rawRequestByAnchor.values());
  }

  rawRequests.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'item' ? -1 : 1;
    if (a.itemId !== b.itemId) return a.itemId.localeCompare(b.itemId);
    return a.anchor.x - b.anchor.x || a.anchor.y - b.anchor.y;
  });

  if (options.trainStation && rawRequests.length > 0) {
    const station = options.trainStation;
    let railNet = buildRailFlowNetwork(grid.entities);

    // If no rail network exists in this layout yet, place a clean straight siding rail + locked train-stop
    if (railNet.chains.length === 0) {
      const horiz = station.direction === 4 || station.direction === 12;
      const stepX = station.direction === 4 ? -1 : station.direction === 12 ? 1 : 0;
      const stepY = station.direction === 0 ? 1 : station.direction === 8 ? -1 : 0;
      const stopRailOffsetX = station.direction === 0 ? -2 : station.direction === 8 ? 2 : 0;
      const stopRailOffsetY = station.direction === 4 ? -2 : station.direction === 12 ? 2 : 0;
      const totalTrackTiles = (1 + Math.max(1, station.wagonCount)) * 7 + 4;

      grid.place({
        kind: 'grid-obstacle',
        name: 'train-stop',
        tileX: station.tileX,
        tileY: station.tileY,
        width: 2,
        height: 2,
        direction: station.direction,
        isGridFrame: true,
      });

      for (let d = -2; d <= totalTrackTiles; d += 2) {
        const rx = station.tileX + stopRailOffsetX + stepX * d;
        const ry = station.tileY + stopRailOffsetY + stepY * d;
        grid.place({
          kind: 'grid-obstacle',
          name: 'straight-rail',
          tileX: rx,
          tileY: ry,
          width: 2,
          height: 2,
          direction: horiz ? 4 : 0,
          isGridFrame: true,
        });
      }
      railNet = buildRailFlowNetwork(grid.entities);
    }

    const prodEntities = grid.entities.filter((e) => !e.isGridFrame);
    const preBounds = computeLayoutStats(
      prodEntities.length > 0 ? prodEntities : grid.entities
    ).bounds;
    const factoryCenter = interiorBounds
      ? {
          x: (interiorBounds.minX + interiorBounds.maxX) / 2,
          y: (interiorBounds.minY + interiorBounds.maxY) / 2,
        }
      : {
          x: (preBounds.minX + preBounds.maxX) / 2,
          y: (preBounds.minY + preBounds.maxY) / 2,
        };

    const trainPlan = computeTrainWagonPlan(solveResult.rawInputs, index, {
      wagonCount: station.wagonCount,
      slotsPerWagon: station.slotsPerWagon ?? 40,
      stackSizeOverrides: station.stackSizeOverrides,
    });
    const carPoses = computeTrainCarPosesOnNetwork(railNet, station, factoryCenter);
    const wagonPoses = carPoses.slice(1); // cargo wagons 1..N

    // Count how many belt requests map to each wagon so we spread unloading ports cleanly along the 6-tile wagon length
    const wagonReqCounts = new Map<number, number>();
    const pickWagonForRequest = (req: GroupedRawPortRequest): number => {
      if (wagonPoses.length === 0) return 0;
      if (req.kind === 'item') {
        const matchingIndices: number[] = [];
        trainPlan.wagons.forEach((w, idx) => {
          if (idx < wagonPoses.length && w.slices.some((s) => s.itemId === req.itemId)) {
            matchingIndices.push(idx);
          }
        });
        if (matchingIndices.length > 0) {
          let bestIdx = matchingIndices[0];
          let bestLoad = wagonReqCounts.get(bestIdx) ?? 0;
          for (const wi of matchingIndices) {
            const load = wagonReqCounts.get(wi) ?? 0;
            if (load < bestLoad) {
              bestLoad = load;
              bestIdx = wi;
            }
          }
          return bestIdx;
        }
      }
      let bestIdx = req.kind === 'fluid' ? wagonPoses.length - 1 : 0;
      let bestLoad = wagonReqCounts.get(bestIdx) ?? 0;
      for (let wi = 0; wi < wagonPoses.length; wi++) {
        const load = wagonReqCounts.get(wi) ?? 0;
        if (load < bestLoad) {
          bestLoad = load;
          bestIdx = wi;
        }
      }
      return bestIdx;
    };

    const assignedSlots = rawRequests.map((req) => {
      const wIdx = pickWagonForRequest(req);
      const slotInWagon = wagonReqCounts.get(wIdx) ?? 0;
      wagonReqCounts.set(wIdx, slotInWagon + 1);
      return { req, wIdx, slotInWagon };
    });

    interface WagonUnloadPlacement {
      req: GroupedRawPortRequest;
      headX: number;
      headY: number;
      insX: number;
      insY: number;
      outDir: Direction;
      portSide: 'south' | 'west' | 'north' | 'east';
    }

    const unloadPlacements: WagonUnloadPlacement[] = [];

    for (const { req, wIdx, slotInWagon } of assignedSlots) {
      const pose = wagonPoses[wIdx] ?? carPoses[0];
      const totalOnWagon = Math.max(1, wagonReqCounts.get(wIdx) ?? 1);
      const longOffset =
        totalOnWagon === 1
          ? 0
          : -2 + (4 * slotInWagon) / Math.max(1, totalOnWagon - 1);

      const outDir: Direction =
        Math.abs(pose.factoryNormalX) >= Math.abs(pose.factoryNormalY)
          ? pose.factoryNormalX >= 0
            ? 4
            : 12
          : pose.factoryNormalY >= 0
            ? 8
            : 0;
      const { dx, dy } = dirDelta(outDir);
      const portSide: 'south' | 'west' | 'north' | 'east' =
        outDir === 0
          ? 'south'
          : outDir === 4
            ? 'west'
            : outDir === 8
              ? 'north'
              : 'east';

      let headX = Math.round(pose.centerX + pose.forwardX * longOffset + dx * 2.5 - 0.5);
      let headY = Math.round(pose.centerY + pose.forwardY * longOffset + dy * 2.5 - 0.5);
      let foundHead = false;

      const isReserved = (x: number, y: number) =>
        unloadPlacements.some(
          (u) => (u.headX === x && u.headY === y) || (u.insX === x && u.insY === y)
        ) || reservedAprons.has(`${x},${y}`);

      for (let dist = 2.5; dist <= 8.5 && !foundHead; dist += 1) {
        for (const shift of [0, 1, -1, 2, -2]) {
          const tx = Math.round(
            pose.centerX + pose.forwardX * (longOffset + shift) + dx * dist - 0.5
          );
          const ty = Math.round(
            pose.centerY + pose.forwardY * (longOffset + shift) + dy * dist - 0.5
          );
          const ix = tx - dx;
          const iy = ty - dy;
          const inserterOk =
            req.kind !== 'item' || (grid.canPlace(ix, iy, 1, 1) && !isReserved(ix, iy));
          if (!grid.getAt(tx, ty) && !isReserved(tx, ty) && inserterOk) {
            headX = tx;
            headY = ty;
            foundHead = true;
            break;
          }
        }
      }

      if (!foundHead) {
        for (let dist = 2.5; dist <= 8.5 && !foundHead; dist += 1) {
          for (const shift of [0, 1, -1, 2, -2]) {
            const tx = Math.round(
              pose.centerX + pose.forwardX * (longOffset + shift) + dx * dist - 0.5
            );
            const ty = Math.round(
              pose.centerY + pose.forwardY * (longOffset + shift) + dy * dist - 0.5
            );
            if (!grid.getAt(tx, ty) && !isReserved(tx, ty)) {
              headX = tx;
              headY = ty;
              foundHead = true;
              break;
            }
          }
        }
      }

      const insX = headX - dx;
      const insY = headY - dy;

      if (req.kind === 'item' && grid.canPlace(insX, insY, 1, 1)) {
        grid.place({
          kind: 'inserter',
          name: inserterName,
          tileX: insX,
          tileY: insY,
          width: 1,
          height: 1,
          direction: outDir,
          inserterReach: 1,
          inserterItems: req.partnerItemId
            ? [req.itemId, req.partnerItemId]
            : [req.itemId],
        });
      }

      unloadPlacements.push({ req, headX, headY, insX, insY, outDir, portSide });
    }

    // Reserve ALL unloading heads in a Set (instead of pre-placing on grid) so
    // earlier belts never trample other heads while each head can still jump
    // underground immediately at tile 0 if adjacent space is crowded!
    const allHeadKeys = new Set<string>(unloadPlacements.map((u) => `${u.headX},${u.headY}`));

    let rMinX = interiorBounds ? interiorBounds.minX : preBounds.minX - 16;
    let rMaxX = interiorBounds ? interiorBounds.maxX - 1 : preBounds.maxX + 16;
    let rMinY = interiorBounds ? interiorBounds.minY : preBounds.minY - 14;
    let rMaxY = interiorBounds ? interiorBounds.maxY - 1 : preBounds.maxY + 14;
    for (const u of unloadPlacements) {
      rMinX = Math.min(rMinX, u.headX - 12);
      rMaxX = Math.max(rMaxX, u.headX + 12);
      rMinY = Math.min(rMinY, u.headY - 12);
      rMaxY = Math.max(rMaxY, u.headY + 12);
    }
    const trainRoutingBounds = { minX: rMinX, maxX: rMaxX, minY: rMinY, maxY: rMaxY };

    // Sort placements so consumers closest to their wagon unload head route first cleanly
    const sortedPlacements = [...unloadPlacements].sort((a, b) => {
      const ca = getAnchorEntry(a.req.consumers[0].anchor);
      const cb = getAnchorEntry(b.req.consumers[0].anchor);
      return (
        Math.abs(ca.x - a.headX) +
        Math.abs(ca.y - a.headY) -
        (Math.abs(cb.x - b.headX) + Math.abs(cb.y - b.headY))
      );
    });

    for (const u of sortedPlacements) {
      const headKey = `${u.headX},${u.headY}`;
      const blockedOthers = new Set<string>(allHeadKeys);
      blockedOthers.delete(headKey);

      const orderedConsumers = [...u.req.consumers].sort((a, b) => {
        const ea = getAnchorEntry(a.anchor);
        const eb = getAnchorEntry(b.anchor);
        return (
          Math.abs(ea.x - u.headX) +
          Math.abs(ea.y - u.headY) -
          (Math.abs(eb.x - u.headX) + Math.abs(eb.y - u.headY))
        );
      });

      const primaryGoal = getAnchorEntry(orderedConsumers[0].anchor);
      reservedAprons.delete(`${primaryGoal.x},${primaryGoal.y}`);

      const routed = routeExternalFeederPath(
        grid,
        { x: u.headX, y: u.headY, dir: u.outDir },
        primaryGoal,
        u.req,
        beltName,
        undergroundName,
        trainRoutingBounds,
        beltMaxJump,
        {
          reservedAprons,
          blockedCells: blockedOthers,
          maxExpansions: 60000,
          onStamp: (pts) => recordRawTrunk(u.req.kind, u.req.itemId, pts),
        }
      );

      if (!routed) {
        // Retry once with expanded corridor bounds around factory perimeter + higher search budget
        const wideTrainBounds = {
          minX: trainRoutingBounds.minX - 8,
          maxX: trainRoutingBounds.maxX + 8,
          minY: trainRoutingBounds.minY - 8,
          maxY: trainRoutingBounds.maxY + 8,
        };
        const retried = routeExternalFeederPath(
          grid,
          { x: u.headX, y: u.headY, dir: u.outDir },
          primaryGoal,
          u.req,
          beltName,
          undergroundName,
          wideTrainBounds,
          beltMaxJump,
          {
            reservedAprons,
            blockedCells: blockedOthers,
            maxExpansions: 100000,
            onStamp: (pts) => recordRawTrunk(u.req.kind, u.req.itemId, pts),
          }
        );
        if (!retried) {
          placeFeederTile(grid, u.headX, u.headY, u.req, beltName, u.outDir);
        }
      }

      // Branch via 2×1 splitter (or pipe tap) to every additional consumer using this item
      const trunkList = rawTrunksByItem.get(`${u.req.kind}:${u.req.itemId}`) ?? [];
      for (let ci = 1; ci < orderedConsumers.length; ci++) {
        const subGoal = getAnchorEntry(orderedConsumers[ci].anchor);
        reservedAprons.delete(`${subGoal.x},${subGoal.y}`);
        branchFromTrunkAndRoute(
          grid,
          trunkList,
          subGoal,
          u.req,
          beltName,
          undergroundName,
          splitterName,
          trainRoutingBounds,
          beltMaxJump,
          {
            reservedAprons,
            blockedCells: blockedOthers,
            onStamp: (pts) => recordRawTrunk(u.req.kind, u.req.itemId, pts),
          }
        );
      }

      ports.push({
        id: `IN:${u.req.key}`,
        directionType: 'input',
        itemId: u.req.itemId,
        partnerItemId: u.req.partnerItemId,
        kind: u.req.kind,
        tileX: u.headX,
        tileY: u.headY,
        ratePerSec: u.req.ratePerSec,
        beltsRequired: u.req.beltsRequired,
        side: u.portSide,
      });
    }
  } else if (inputSide === 'distributed') {
    for (const req of rawRequests) {
      const entry = getAnchorEntry(req.anchor);
      const baseAnchorX = entry.x;
      const baseAnchorY = entry.y - 1;
      const stubLen = interiorBounds ? 2 : 3;
      let actualTipY = baseAnchorY;
      for (let dy = 1; dy <= stubLen; dy++) {
        const py = baseAnchorY + dy;
        if (interiorBounds && py >= interiorBounds.maxY) break;
        if (req.kind === 'item') {
          if (grid.placeOrMergeBelt(baseAnchorX, py, beltName, 0, {
            left: req.itemId,
            right: req.partnerItemId ?? req.itemId,
          })) {
            actualTipY = py;
          }
        } else if (grid.canPlace(baseAnchorX, py, 1, 1)) {
          grid.place({
            kind: 'pipe',
            name: 'pipe',
            tileX: baseAnchorX,
            tileY: py,
            width: 1,
            height: 1,
            direction: 0,
            fluidId: req.itemId,
          });
          actualTipY = py;
        }
      }
      ports.push({
        id: `IN:${req.key}`,
        directionType: 'input',
        itemId: req.itemId,
        partnerItemId: req.partnerItemId,
        kind: req.kind,
        tileX: baseAnchorX,
        tileY: actualTipY,
        ratePerSec: req.ratePerSec,
        beltsRequired: req.beltsRequired,
        side: 'south',
      });
    }
  } else if (rawRequests.length > 0) {
    const prodEntities = grid.entities.filter((e) => !e.isGridFrame);
    const preBounds = computeLayoutStats(prodEntities.length > 0 ? prodEntities : grid.entities).bounds;
    const routingBounds = interiorBounds
      ? {
          minX: interiorBounds.minX,
          maxX: interiorBounds.maxX - 1,
          minY: interiorBounds.minY,
          maxY: interiorBounds.maxY - 1,
        }
      : {
          minX: preBounds.minX - 14,
          maxX: preBounds.maxX + 14,
          minY: preBounds.minY - 12,
          maxY: preBounds.maxY + 12,
        };

    if (inputSide === 'south') {
      const entryY = interiorBounds
        ? Math.min(interiorBounds.maxY - 3, preBounds.maxY + 4)
        : preBounds.maxY + 5;
      const centerX = interiorBounds
        ? Math.round((interiorBounds.minX + interiorBounds.maxX) / 2)
        : Math.round((preBounds.minX + preBounds.maxX) / 2);
      const totalSpan = Math.max(0, (rawRequests.length - 1) * 2);
      const startSlotX = interiorBounds
        ? Math.max(interiorBounds.minX + 1, centerX - Math.floor(totalSpan / 2))
        : centerX - Math.floor(totalSpan / 2);
      const southRoutingBounds = {
        ...routingBounds,
        maxY: entryY - 1,
      };

      const slots = rawRequests.map((req, idx) => {
        const slotX = interiorBounds
          ? Math.min(interiorBounds.maxX - 2, startSlotX + idx * 2)
          : startSlotX + idx * 2;
        for (let dy = 2; dy >= 0; dy--) {
          if (!interiorBounds || entryY + dy < interiorBounds.maxY) {
            placeFeederTile(grid, slotX, entryY + dy, req, beltName, 0);
          }
        }
        return { req, slotX };
      });

      const allSlotHeads = new Set<string>(slots.map((s) => `${s.slotX},${entryY - 1}`));

      slots.forEach(({ req, slotX }) => {
        const blockedOthers = new Set<string>(allSlotHeads);
        blockedOthers.delete(`${slotX},${entryY - 1}`);

        const orderedConsumers = [...req.consumers].sort((a, b) => {
          const ea = getAnchorEntry(a.anchor);
          const eb = getAnchorEntry(b.anchor);
          return Math.abs(ea.x - slotX) + Math.abs(ea.y - entryY) - (Math.abs(eb.x - slotX) + Math.abs(eb.y - entryY));
        });

        const primaryGoal = getAnchorEntry(orderedConsumers[0].anchor);
        reservedAprons.delete(`${primaryGoal.x},${primaryGoal.y}`);

        const routed = routeExternalFeederPath(
          grid,
          { x: slotX, y: entryY - 1, dir: 0 },
          primaryGoal,
          req,
          beltName,
          undergroundName,
          southRoutingBounds,
          beltMaxJump,
          {
            reservedAprons,
            blockedCells: blockedOthers,
            maxExpansions: 60000,
            onStamp: (pts) => recordRawTrunk(req.kind, req.itemId, pts),
          }
        );

        if (!routed) {
          placeFeederTile(grid, primaryGoal.x, primaryGoal.y, req, beltName, 0);
        }

        const trunkList = rawTrunksByItem.get(`${req.kind}:${req.itemId}`) ?? [];
        for (let ci = 1; ci < orderedConsumers.length; ci++) {
          const subGoal = getAnchorEntry(orderedConsumers[ci].anchor);
          reservedAprons.delete(`${subGoal.x},${subGoal.y}`);
          branchFromTrunkAndRoute(
            grid,
            trunkList,
            subGoal,
            req,
            beltName,
            undergroundName,
            splitterName,
            southRoutingBounds,
            beltMaxJump,
            {
              reservedAprons,
              blockedCells: blockedOthers,
              onStamp: (pts) => recordRawTrunk(req.kind, req.itemId, pts),
            }
          );
        }

        ports.push({
          id: `IN:${req.key}`,
          directionType: 'input',
          itemId: req.itemId,
          partnerItemId: req.partnerItemId,
          kind: req.kind,
          tileX: slotX,
          tileY: interiorBounds ? Math.min(interiorBounds.maxY - 1, entryY + 2) : entryY + 2,
          ratePerSec: req.ratePerSec,
          beltsRequired: req.beltsRequired,
          side: 'south',
        });
      });
    } else {
      const entryX = interiorBounds
        ? Math.max(interiorBounds.minX + 2, preBounds.minX - 5)
        : preBounds.minX - 5;
      const centerY = Math.round((preBounds.minY + preBounds.maxY) / 2);
      const totalSpan = Math.max(0, (rawRequests.length - 1) * 2);
      const startSlotY = interiorBounds
        ? Math.max(interiorBounds.minY + 1, centerY - Math.floor(totalSpan / 2))
        : centerY - Math.floor(totalSpan / 2);
      const westRoutingBounds = {
        ...routingBounds,
        minX: entryX + 1,
      };

      const slots = rawRequests.map((req, idx) => {
        const slotY = interiorBounds
          ? Math.min(interiorBounds.maxY - 2, startSlotY + idx * 2)
          : startSlotY + idx * 2;
        for (let dx = 2; dx >= 0; dx--) {
          if (!interiorBounds || entryX - dx >= interiorBounds.minX) {
            placeFeederTile(grid, entryX - dx, slotY, req, beltName, 4);
          }
        }
        return { req, slotY };
      });

      const allSlotHeads = new Set<string>(slots.map((s) => `${entryX + 1},${s.slotY}`));

      slots.forEach(({ req, slotY }) => {
        const blockedOthers = new Set<string>(allSlotHeads);
        blockedOthers.delete(`${entryX + 1},${slotY}`);

        const orderedConsumers = [...req.consumers].sort((a, b) => {
          const ea = getAnchorEntry(a.anchor);
          const eb = getAnchorEntry(b.anchor);
          return Math.abs(ea.x - entryX) + Math.abs(ea.y - slotY) - (Math.abs(eb.x - entryX) + Math.abs(eb.y - slotY));
        });

        const primaryGoal = getAnchorEntry(orderedConsumers[0].anchor);
        reservedAprons.delete(`${primaryGoal.x},${primaryGoal.y}`);

        const routed = routeExternalFeederPath(
          grid,
          { x: entryX + 1, y: slotY, dir: 4 },
          primaryGoal,
          req,
          beltName,
          undergroundName,
          westRoutingBounds,
          beltMaxJump,
          {
            reservedAprons,
            blockedCells: blockedOthers,
            maxExpansions: 60000,
            onStamp: (pts) => recordRawTrunk(req.kind, req.itemId, pts),
          }
        );

        if (!routed) {
          placeFeederTile(grid, primaryGoal.x, primaryGoal.y, req, beltName, 0);
        }

        const trunkList = rawTrunksByItem.get(`${req.kind}:${req.itemId}`) ?? [];
        for (let ci = 1; ci < orderedConsumers.length; ci++) {
          const subGoal = getAnchorEntry(orderedConsumers[ci].anchor);
          reservedAprons.delete(`${subGoal.x},${subGoal.y}`);
          branchFromTrunkAndRoute(
            grid,
            trunkList,
            subGoal,
            req,
            beltName,
            undergroundName,
            splitterName,
            westRoutingBounds,
            beltMaxJump,
            {
              reservedAprons,
              blockedCells: blockedOthers,
              onStamp: (pts) => recordRawTrunk(req.kind, req.itemId, pts),
            }
          );
        }

        ports.push({
          id: `IN:${req.key}`,
          directionType: 'input',
          itemId: req.itemId,
          partnerItemId: req.partnerItemId,
          kind: req.kind,
          tileX: interiorBounds ? Math.max(interiorBounds.minX, entryX - 2) : entryX - 2,
          tileY: slotY,
          ratePerSec: req.ratePerSec,
          beltsRequired: req.beltsRequired,
          side: 'west',
        });
      });
    }
  }

  // 6. Final Output Belt/Pipe Stubs + Output Port Markers
  const emittedOutputPorts = new Set<string>();
  const currentPreOutBounds = computeLayoutStats(
    grid.entities.filter((e) => !e.isGridFrame)
  ).bounds;
  for (const edge of solveResult.edges) {
    if (!edge.targetStageId.startsWith('TARGET:')) continue;
    const fromAnchors = stageOutputAnchors.get(edge.sourceStageId) ?? [];
    const src = fromAnchors.find((a) => a.itemId === edge.itemId && a.kind === edge.kind);
    if (!src) continue;
    const outKey = `${edge.kind}:${src.x},${src.y}:${edge.itemId}`;
    if (emittedOutputPorts.has(outKey)) continue;
    emittedOutputPorts.add(outKey);

    let tipY = interiorBounds ? Math.max(interiorBounds.minY, src.y - 2) : src.y - 3;
    if (inputSide !== 'distributed') {
      const alignedExitY = interiorBounds
        ? Math.max(interiorBounds.minY, currentPreOutBounds.minY - 3)
        : currentPreOutBounds.minY - 3;
      if (alignedExitY < tipY) {
        let canReachStraight = true;
        for (let y = src.y - 1; y >= alignedExitY; y--) {
          if (!grid.canPlace(src.x, y, 1, 1)) {
            canReachStraight = false;
            break;
          }
        }
        if (canReachStraight) {
          tipY = alignedExitY;
        }
      }
    }

    let placedTipY = src.y;
    for (let y = src.y - 1; y >= tipY; y--) {
      if (interiorBounds && y < interiorBounds.minY) break;
      if (edge.kind === 'item') {
        if (grid.placeOrMergeBelt(src.x, y, beltName, 0, {
          left: edge.itemId,
          right: edge.itemId,
        })) {
          placedTipY = y;
        }
      } else if (grid.canPlace(src.x, y, 1, 1)) {
        grid.place({
          kind: 'pipe',
          name: 'pipe',
          tileX: src.x,
          tileY: y,
          width: 1,
          height: 1,
          direction: 0,
          fluidId: edge.itemId,
        });
        placedTipY = y;
      }
    }

    ports.push({
      id: `OUT:${outKey}`,
      directionType: 'output',
      itemId: edge.itemId,
      kind: edge.kind,
      tileX: src.x,
      tileY: placedTipY,
      ratePerSec: edge.actualRatePerSec,
      beltsRequired: edge.beltsRequired,
      side: 'north',
    });
  }

  let gridFitReport: GridFitReport | undefined;
  if (interiorBounds) {
    const interiorWidth = Math.max(1, interiorBounds.maxX - interiorBounds.minX);
    const interiorHeight = Math.max(1, interiorBounds.maxY - interiorBounds.minY);
    const interiorArea = interiorWidth * interiorHeight;
    let usedInside = 0;
    for (const e of grid.entities) {
      if (e.isGridFrame) continue;
      if (
        e.tileX >= interiorBounds.minX &&
        e.tileX + e.width <= interiorBounds.maxX &&
        e.tileY >= interiorBounds.minY &&
        e.tileY + e.height <= interiorBounds.maxY
      ) {
        usedInside += e.width * e.height;
      }
    }
    const overflowMachines = Math.max(0, totalRequestedMachines - totalPlacedMachines);
    gridFitReport = {
      hasGridFrame: true,
      interiorBounds,
      interiorWidth,
      interiorHeight,
      frameEntityCount: seededFrame.length,
      requestedMachines: totalRequestedMachines,
      placedMachines: totalPlacedMachines,
      overflowMachines,
      fitsInsideFrame: overflowMachines === 0,
      interiorUtilizationPct: interiorArea > 0 ? Math.min(100, (usedInside / interiorArea) * 100) : 0,
    };
  }

  return finalizeLayout(grid.entities, zones, ports, compactionMode, gridFitReport);
}

function placeFeederTile(
  grid: OccupancyGrid,
  x: number,
  y: number,
  req: { itemId: string; partnerItemId?: string; kind: 'item' | 'fluid' },
  beltName: string,
  direction: Direction
): void {
  if (req.kind === 'item') {
    grid.placeOrMergeBelt(x, y, beltName, direction, {
      left: req.itemId,
      right: req.partnerItemId ?? req.itemId,
    });
  } else if (grid.canPlace(x, y, 1, 1)) {
    grid.place({
      kind: 'pipe',
      name: 'pipe',
      tileX: x,
      tileY: y,
      width: 1,
      height: 1,
      direction,
      fluidId: req.itemId,
    });
  }
}

interface PathStep {
  x: number;
  y: number;
  dir: Direction;
  type: 'normal' | 'underground';
  jumpLen?: number;
}

function dirDelta(dir: Direction): { dx: number; dy: number } {
  if (dir === 0) return { dx: 0, dy: -1 };
  if (dir === 4) return { dx: 1, dy: 0 };
  if (dir === 8) return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

function routeExternalFeederPath(
  grid: OccupancyGrid,
  start: { x: number; y: number; dir: Direction },
  goal: { x: number; y: number; dir: Direction },
  req: { itemId: string; partnerItemId?: string; kind: 'item' | 'fluid' },
  beltName: string,
  undergroundName: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  beltJumpOverride?: number,
  options?: {
    reservedAprons?: Set<string>;
    blockedCells?: Set<string>;
    preferY?: number;
    maxExpansions?: number;
    onStamp?: (pts: Array<{ x: number; y: number }>) => void;
  }
): boolean {
  const reservedAprons = options?.reservedAprons;
  const blockedCells = options?.blockedCells;
  const preferY = options?.preferY;
  const maxExpansions = options?.maxExpansions ?? 45000;

  const isEndpointTile = (x: number, y: number) =>
    (x === start.x && y === start.y) || (x === goal.x && y === goal.y);

  const canOccupyNormal = (x: number, y: number, dir: Direction): boolean => {
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return false;
    const k = `${x},${y}`;
    if (blockedCells?.has(k)) return false;
    if (reservedAprons?.has(k) && !isEndpointTile(x, y)) return false;
    const ex = grid.getAt(x, y);
    if (!ex) return true;
    if (req.kind === 'item') {
      return (
        ex.kind === 'transport-belt' &&
        ex.direction === dir &&
        (ex.beltLanes?.left === req.itemId || ex.beltLanes?.right === req.itemId)
      );
    }
    return ex.kind === 'pipe' && ex.fluidId === req.itemId;
  };

  if (!canOccupyNormal(start.x, start.y, start.dir) || !canOccupyNormal(goal.x, goal.y, goal.dir)) {
    return false;
  }

  interface AStarNode {
    x: number;
    y: number;
    dir: Direction;
    g: number;
    f: number;
    parentIdx: number;
    stepType: 'normal' | 'underground';
    jumpLen?: number;
  }

  const nodes: AStarNode[] = [
    {
      x: start.x,
      y: start.y,
      dir: start.dir,
      g: 0,
      f: Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y),
      parentIdx: -1,
      stepType: 'normal',
    },
  ];
  const openHeap: number[] = [0];
  const bestCost = new Map<string, number>();
  bestCost.set(`${start.x},${start.y},${start.dir},0`, 0);

  const pushHeap = (idx: number) => {
    openHeap.push(idx);
    let i = openHeap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (nodes[openHeap[p]].f <= nodes[openHeap[i]].f) break;
      const tmp = openHeap[p];
      openHeap[p] = openHeap[i];
      openHeap[i] = tmp;
      i = p;
    }
  };

  const popHeap = (): number => {
    const top = openHeap[0];
    const last = openHeap.pop()!;
    if (openHeap.length > 0) {
      openHeap[0] = last;
      let i = 0;
      const n = openHeap.length;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < n && nodes[openHeap[l]].f < nodes[openHeap[smallest]].f) smallest = l;
        if (r < n && nodes[openHeap[r]].f < nodes[openHeap[smallest]].f) smallest = r;
        if (smallest === i) break;
        const tmp = openHeap[i];
        openHeap[i] = openHeap[smallest];
        openHeap[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  };

  const allDirs: Direction[] = [0, 4, 8, 12];
  const maxJump = req.kind === 'fluid' ? 9 : beltJumpOverride ?? 5;
  let goalIdx = -1;
  let expansions = 0;

  while (openHeap.length > 0 && expansions < maxExpansions) {
    const curIdx = popHeap();
    const cur = nodes[curIdx];
    expansions++;

    if (cur.x === goal.x && cur.y === goal.y && (cur.stepType === 'normal' || cur.dir === goal.dir)) {
      goalIdx = curIdx;
      break;
    }

    const curStateKey = `${cur.x},${cur.y},${cur.dir},${cur.stepType === 'underground' ? 1 : 0}`;
    if (cur.g > (bestCost.get(curStateKey) ?? Infinity) + 1e-6) continue;

    // 1. Normal 1-tile steps (an underground exit hood must eject straight ahead along cur.dir)
    for (const ndir of allDirs) {
      if (cur.stepType === 'underground' && ndir !== cur.dir) continue;
      if (ndir === ((cur.dir + 8) % 16)) continue;
      const { dx, dy } = dirDelta(ndir);
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!canOccupyNormal(nx, ny, ndir)) continue;

      let selfOverlap = false;
      for (let p = cur.parentIdx, depth = 0; p !== -1 && depth < 6; p = nodes[p].parentIdx, depth++) {
        if (nodes[p].x === nx && nodes[p].y === ny) {
          selfOverlap = true;
          break;
        }
      }
      if (selfOverlap) continue;

      const turnPenalty = ndir === cur.dir ? 0 : 0.6;
      const laneHintBias =
        preferY !== undefined && ndir % 8 === 4 && ny === preferY ? -0.15 : 0;
      const ng = cur.g + Math.max(0.25, 1 + turnPenalty + laneHintBias);
      const nKey = `${nx},${ny},${ndir},0`;
      if (ng < (bestCost.get(nKey) ?? Infinity)) {
        bestCost.set(nKey, ng);
        const h = Math.abs(goal.x - nx) + Math.abs(goal.y - ny);
        const nIdx = nodes.length;
        nodes.push({
          x: nx,
          y: ny,
          dir: ndir,
          g: ng,
          f: ng + h,
          parentIdx: curIdx,
          stepType: 'normal',
        });
        pushHeap(nIdx);
      }
    }

    // 2. Underground belt / pipe-to-ground jumps across belts, aprons, machines, rails, or poles
    const curEnt = grid.getAt(cur.x, cur.y);
    const canStartUndergroundHere =
      cur.stepType === 'normal' &&
      (!curEnt || (cur.x === start.x && cur.y === start.y && !curEnt.isGridFrame));
    if (canStartUndergroundHere) {
      for (const ndir of allDirs) {
        if (ndir === ((cur.dir + 8) % 16)) continue;
        const { dx, dy } = dirDelta(ndir);
        const adjX = cur.x + dx;
        const adjY = cur.y + dy;
        const adjKey = `${adjX},${adjY}`;
        const adjEnt = grid.getAt(adjX, adjY);
        const adjBlocked =
          Boolean(adjEnt) ||
          Boolean(blockedCells?.has(adjKey)) ||
          (Boolean(reservedAprons?.has(adjKey)) && !(adjX === goal.x && adjY === goal.y));
        if (!adjBlocked) continue;
        if (adjEnt && (adjEnt.kind === 'underground-belt' || adjEnt.kind === 'pipe-to-ground') && (adjEnt.direction % 8) === (ndir % 8)) {
          continue;
        }

        for (let k = 2; k <= maxJump; k++) {
          const lx = cur.x + k * dx;
          const ly = cur.y + k * dy;
          if (lx < bounds.minX || lx > bounds.maxX || ly < bounds.minY || ly > bounds.maxY) break;

          let axisConflict = false;
          for (let s = 1; s < k; s++) {
            const mid = grid.getAt(cur.x + s * dx, cur.y + s * dy);
            if (
              mid &&
              (mid.kind === 'underground-belt' || mid.kind === 'pipe-to-ground') &&
              (mid.direction % 8) === (ndir % 8)
            ) {
              axisConflict = true;
              break;
            }
          }
          if (axisConflict) break;

          const lKey = `${lx},${ly}`;
          const canLand =
            !grid.getAt(lx, ly) &&
            !blockedCells?.has(lKey) &&
            (!reservedAprons?.has(lKey) || (lx === goal.x && ly === goal.y));

          if (canLand) {
            const turnCost = ndir === cur.dir ? 0 : cur.x === start.x && cur.y === start.y ? 0.6 : 4.0;
            const ng = cur.g + 4.5 + k * 1.2 + turnCost;
            const nKey = `${lx},${ly},${ndir},1`;
            if (ng < (bestCost.get(nKey) ?? Infinity)) {
              bestCost.set(nKey, ng);
              const h = Math.abs(goal.x - lx) + Math.abs(goal.y - ly);
              const nIdx = nodes.length;
              nodes.push({
                x: lx,
                y: ly,
                dir: ndir,
                g: ng,
                f: ng + h,
                parentIdx: curIdx,
                stepType: 'underground',
                jumpLen: k,
              });
              pushHeap(nIdx);
            }
          }
        }
      }
    }
  }

  if (goalIdx === -1) return false;

  const path: PathStep[] = [];
  let cursor = goalIdx;
  while (cursor !== -1) {
    const n = nodes[cursor];
    path.push({
      x: n.x,
      y: n.y,
      dir: n.dir,
      type: n.stepType,
      jumpLen: n.jumpLen,
    });
    cursor = n.parentIdx;
  }
  path.reverse();

  const lanes =
    req.kind === 'item'
      ? { left: req.itemId, right: req.partnerItemId ?? req.itemId }
      : undefined;
  const stampedSurfacePts: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const next = path[i + 1];
    const travelDir = next ? next.dir : goal.dir;

    if (next && next.type === 'underground' && next.jumpLen) {
      const existingStart = grid.getAt(step.x, step.y);
      if (existingStart && !existingStart.isGridFrame) {
        grid.remove(existingStart);
      }
      if (req.kind === 'item') {
        grid.place({
          kind: 'underground-belt',
          name: undergroundName,
          tileX: step.x,
          tileY: step.y,
          width: 1,
          height: 1,
          direction: next.dir,
          undergroundType: 'input',
          beltLanes: lanes,
        });
        grid.place({
          kind: 'underground-belt',
          name: undergroundName,
          tileX: next.x,
          tileY: next.y,
          width: 1,
          height: 1,
          direction: next.dir,
          undergroundType: 'output',
          beltLanes: lanes,
        });
      } else {
        grid.place({
          kind: 'pipe-to-ground',
          name: 'pipe-to-ground',
          tileX: step.x,
          tileY: step.y,
          width: 1,
          height: 1,
          direction: next.dir,
          undergroundType: 'input',
          fluidId: req.itemId,
        });
        grid.place({
          kind: 'pipe-to-ground',
          name: 'pipe-to-ground',
          tileX: next.x,
          tileY: next.y,
          width: 1,
          height: 1,
          direction: next.dir,
          undergroundType: 'output',
          fluidId: req.itemId,
        });
      }
      i++;
    } else {
      placeFeederTile(grid, step.x, step.y, req, beltName, travelDir);
      stampedSurfacePts.push({ x: step.x, y: step.y });
    }
  }

  options?.onStamp?.(stampedSurfacePts);
  return true;
}

function branchFromTrunkAndRoute(
  grid: OccupancyGrid,
  trunkTiles: Array<{ x: number; y: number }>,
  goal: { x: number; y: number; dir: Direction },
  req: { itemId: string; partnerItemId?: string; kind: 'item' | 'fluid' },
  beltName: string,
  undergroundName: string,
  splitterName: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  beltMaxJump: number,
  options?: {
    reservedAprons?: Set<string>;
    blockedCells?: Set<string>;
    preferY?: number;
    onStamp?: (pts: Array<{ x: number; y: number }>) => void;
  }
): boolean {
  const reservedAprons = options?.reservedAprons;
  const blockedCells = options?.blockedCells;

  if (req.kind === 'fluid') {
    const seen = new Set<string>();
    const pipeCandidates: Array<{ nx: number; ny: number; dist: number }> = [];
    for (const pt of trunkTiles) {
      const k = `${pt.x},${pt.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const ent = grid.getAt(pt.x, pt.y);
      if (!ent || ent.kind !== 'pipe' || ent.isGridFrame) continue;
      for (const nd of [0, 4, 8, 12] as Direction[]) {
        const { dx, dy } = dirDelta(nd);
        const nx = pt.x + dx;
        const ny = pt.y + dy;
        const nk = `${nx},${ny}`;
        if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
        if (grid.getAt(nx, ny) || blockedCells?.has(nk) || (reservedAprons?.has(nk) && (nx !== goal.x || ny !== goal.y))) {
          continue;
        }
        pipeCandidates.push({ nx, ny, dist: Math.abs(nx - goal.x) + Math.abs(ny - goal.y) });
      }
    }
    pipeCandidates.sort((a, b) => a.dist - b.dist);
    for (const cand of pipeCandidates.slice(0, 12)) {
      if (
        routeExternalFeederPath(
          grid,
          { x: cand.nx, y: cand.ny, dir: goal.dir },
          goal,
          req,
          beltName,
          undergroundName,
          bounds,
          beltMaxJump,
          { ...options, maxExpansions: 60000 }
        )
      ) {
        return true;
      }
    }
    return false;
  }

  // Solid belt: insert a real 2×1 splitter along an inline trunk belt segment
  interface SplitterCand {
    beltEnt: GridEntity;
    nX: number;
    nY: number;
    startX: number;
    startY: number;
    dir: Direction;
    dist: number;
  }
  const cands: SplitterCand[] = [];
  const seenTile = new Set<string>();

  for (const pt of trunkTiles) {
    const tKey = `${pt.x},${pt.y}`;
    if (seenTile.has(tKey)) continue;
    seenTile.add(tKey);

    const ent = grid.getAt(pt.x, pt.y);
    if (!ent || ent.kind !== 'transport-belt' || ent.isGridFrame) continue;
    const d = ent.direction;
    const { dx: fx, dy: fy } = dirDelta(d);

    const prev = grid.getAt(pt.x - fx, pt.y - fy);
    const hasInlinePrev =
      Boolean(prev) &&
      (prev!.kind === 'transport-belt' ||
        prev!.kind === 'underground-belt' ||
        prev!.kind === 'splitter' ||
        prev!.kind === 'inserter') &&
      prev!.direction === d;
    if (!hasInlinePrev) continue;

    const perps: Array<[number, number]> =
      d === 0 || d === 8
        ? [
            [1, 0],
            [-1, 0],
          ]
        : [
            [0, 1],
            [0, -1],
          ];

    for (const [px, py] of perps) {
      const nX = pt.x + px;
      const nY = pt.y + py;
      const nKey = `${nX},${nY}`;
      if (nX < bounds.minX || nX > bounds.maxX || nY < bounds.minY || nY > bounds.maxY) continue;
      if (grid.getAt(nX, nY) || blockedCells?.has(nKey) || reservedAprons?.has(nKey)) continue;

      const behindN = grid.getAt(nX - fx, nY - fy);
      if (
        behindN &&
        (behindN.kind === 'transport-belt' ||
          behindN.kind === 'underground-belt' ||
          behindN.kind === 'splitter') &&
        behindN.direction === d
      ) {
        continue;
      }

      const startX = nX + fx;
      const startY = nY + fy;
      const sKey = `${startX},${startY}`;
      if (startX < bounds.minX || startX > bounds.maxX || startY < bounds.minY || startY > bounds.maxY) continue;
      if (
        grid.getAt(startX, startY) ||
        blockedCells?.has(sKey) ||
        (reservedAprons?.has(sKey) && (startX !== goal.x || startY !== goal.y))
      ) {
        continue;
      }

      cands.push({
        beltEnt: ent,
        nX,
        nY,
        startX,
        startY,
        dir: d,
        dist: Math.abs(startX - goal.x) + Math.abs(startY - goal.y),
      });
    }
  }

  cands.sort((a, b) => a.dist - b.dist);

  for (const cand of cands.slice(0, 14)) {
    const blockedForRun = new Set<string>(blockedCells ?? []);
    blockedForRun.add(`${cand.beltEnt.tileX},${cand.beltEnt.tileY}`);
    blockedForRun.add(`${cand.nX},${cand.nY}`);

    const ok = routeExternalFeederPath(
      grid,
      { x: cand.startX, y: cand.startY, dir: cand.dir },
      goal,
      req,
      beltName,
      undergroundName,
      bounds,
      beltMaxJump,
      {
        reservedAprons,
        blockedCells: blockedForRun,
        preferY: options?.preferY,
        maxExpansions: 60000,
        onStamp: options?.onStamp,
      }
    );

    if (ok) {
      const lanes = cand.beltEnt.beltLanes ?? { left: req.itemId, right: req.itemId };
      const sx = Math.min(cand.beltEnt.tileX, cand.nX);
      const sy = Math.min(cand.beltEnt.tileY, cand.nY);
      const horiz = cand.dir === 0 || cand.dir === 8;
      grid.remove(cand.beltEnt);
      grid.place({
        kind: 'splitter',
        name: splitterName,
        tileX: sx,
        tileY: sy,
        width: horiz ? 2 : 1,
        height: horiz ? 1 : 2,
        direction: cand.dir,
        beltLanes: lanes,
      });
      return true;
    }
  }

  // Fallback: direct takeoff from any adjacent free tile next to an existing trunk belt
  const seenAdj = new Set<string>();
  const adjCands: Array<{ x: number; y: number; dir: Direction; dist: number }> = [];
  for (const pt of trunkTiles) {
    const ent = grid.getAt(pt.x, pt.y);
    if (!ent || ent.kind !== 'transport-belt' || ent.isGridFrame) continue;
    for (const nd of [0, 4, 8, 12] as Direction[]) {
      const { dx, dy } = dirDelta(nd);
      const ax = pt.x + dx;
      const ay = pt.y + dy;
      const ak = `${ax},${ay}`;
      if (seenAdj.has(ak)) continue;
      seenAdj.add(ak);
      if (ax < bounds.minX || ax > bounds.maxX || ay < bounds.minY || ay > bounds.maxY) continue;
      if (grid.getAt(ax, ay) || blockedCells?.has(ak) || (reservedAprons?.has(ak) && (ax !== goal.x || ay !== goal.y))) {
        continue;
      }
      adjCands.push({ x: ax, y: ay, dir: nd, dist: Math.abs(ax - goal.x) + Math.abs(ay - goal.y) });
    }
  }
  adjCands.sort((a, b) => a.dist - b.dist);
  for (const ac of adjCands.slice(0, 8)) {
    if (
      routeExternalFeederPath(
        grid,
        { x: ac.x, y: ac.y, dir: ac.dir },
        goal,
        req,
        beltName,
        undergroundName,
        bounds,
        beltMaxJump,
        { ...options, maxExpansions: 60000 }
      )
    ) {
      return true;
    }
  }

  return false;
}

export function computeLayoutStats(
  entities: GridEntity[]
): { bounds: SynthesizedLayout['bounds']; stats: SpatialLayoutStats } {
  if (entities.length === 0) {
    return {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      stats: {
        widthTiles: 0,
        heightTiles: 0,
        totalAreaTiles: 0,
        machineCount: 0,
        beltCount: 0,
        undergroundCount: 0,
        splitterCount: 0,
        inserterCount: 0,
        pipeCount: 0,
        beaconCount: 0,
        poleCount: 0,
        spaceUtilizationPct: 0,
      },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let machineCount = 0;
  let beltCount = 0;
  let undergroundCount = 0;
  let splitterCount = 0;
  let inserterCount = 0;
  let pipeCount = 0;
  let beaconCount = 0;
  let poleCount = 0;
  let occupiedTiles = 0;

  for (const e of entities) {
    minX = Math.min(minX, e.tileX);
    minY = Math.min(minY, e.tileY);
    maxX = Math.max(maxX, e.tileX + e.width);
    maxY = Math.max(maxY, e.tileY + e.height);
    occupiedTiles += e.width * e.height;

    if (e.kind === 'machine' && !e.isGridFrame) machineCount++;
    else if (e.kind === 'transport-belt') beltCount++;
    else if (e.kind === 'underground-belt') undergroundCount++;
    else if (e.kind === 'splitter') splitterCount++;
    else if (e.kind === 'inserter') inserterCount++;
    else if (e.kind === 'pipe' || e.kind === 'pipe-to-ground') pipeCount++;
    else if (e.kind === 'beacon') beaconCount++;
    else if (e.kind === 'electric-pole') poleCount++;
  }

  const widthTiles = maxX - minX;
  const heightTiles = maxY - minY;
  const totalAreaTiles = widthTiles * heightTiles;
  const spaceUtilizationPct =
    totalAreaTiles > 0 ? Math.min(100, (occupiedTiles / totalAreaTiles) * 100) : 0;

  return {
    bounds: { minX, minY, maxX, maxY },
    stats: {
      widthTiles,
      heightTiles,
      totalAreaTiles,
      machineCount,
      beltCount,
      undergroundCount,
      splitterCount,
      inserterCount,
      pipeCount,
      beaconCount,
      poleCount,
      spaceUtilizationPct,
    },
  };
}

function finalizeLayout(
  entities: GridEntity[],
  zones: StageZone[],
  ports: LayoutPortMarker[],
  compactionMode: 'compact' | 'standard',
  gridFitReport?: GridFitReport
): SynthesizedLayout {
  const { bounds, stats } = computeLayoutStats(entities);
  return {
    entities,
    zones,
    ports,
    bounds,
    stats,
    compactionMode,
    gridFitReport,
  };
}
