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
} from './types.ts';

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
 * Analyzes ANY imported Factorio grid model (rail city block, walled box,
 * substation grid, roboport grid, asymmetric unloading station, etc.) and
 * automatically extracts the buildable interior rectangle while isolating
 * interior poles/roboports to be routed around.
 */
function detectGridInterior(
  grid: OccupancyGrid,
  frameEntities: GridEntity[]
): InteriorBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const e of frameEntities) {
    minX = Math.min(minX, e.tileX);
    minY = Math.min(minY, e.tileY);
    maxX = Math.max(maxX, e.tileX + e.width);
    maxY = Math.max(maxY, e.tileY + e.height);
  }

  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);

  // If user imported a tiny or open substation-only grid without dense walls, keep full bounds minus 1 tile if needed
  const isBorderBandBlocked = (
    fixedCoord: number,
    isHorizontalRow: boolean,
    from: number,
    to: number
  ): boolean => {
    const span = Math.max(1, to - from);
    let blocked = 0;
    let railOrWallHits = 0;
    for (let v = from; v < to; v++) {
      const ent = isHorizontalRow ? grid.getAt(v, fixedCoord) : grid.getAt(fixedCoord, v);
      if (ent) {
        blocked++;
        if (
          ent.name.includes('rail') ||
          ent.name.includes('wall') ||
          ent.name.includes('gate') ||
          ent.name.includes('train-stop') ||
          ent.name.includes('turret')
        ) {
          railOrWallHits++;
        }
      }
    }
    // Trim edge row/column when border-structure density >= 22% or generic obstacle density >= 45%
    return railOrWallHits / span >= 0.22 || blocked / span >= 0.45;
  };

  let intMinX = minX;
  let intMaxX = maxX;
  let intMinY = minY;
  let intMaxY = maxY;

  const maxTrimX = Math.floor(totalW * 0.35);
  const maxTrimY = Math.floor(totalH * 0.35);

  while (intMinX - minX < maxTrimX && intMaxX - intMinX > 12 && isBorderBandBlocked(intMinX, false, intMinY, intMaxY)) {
    intMinX++;
  }
  while (maxX - intMaxX < maxTrimX && intMaxX - intMinX > 12 && isBorderBandBlocked(intMaxX - 1, false, intMinY, intMaxY)) {
    intMaxX--;
  }
  while (intMinY - minY < maxTrimY && intMaxY - intMinY > 12 && isBorderBandBlocked(intMinY, true, intMinX, intMaxX)) {
    intMinY++;
  }
  while (maxY - intMaxY < maxTrimY && intMaxY - intMinY > 12 && isBorderBandBlocked(intMaxY - 1, true, intMinX, intMaxX)) {
    intMaxY--;
  }

  // Check if any side still has an asymmetric inner station/loader band (>= 30% occupied within 4 tiles)
  const trimAsymmetricSide = () => {
    const rowOccupiedRatio = (y: number) => {
      let occ = 0;
      const w = Math.max(1, intMaxX - intMinX);
      for (let x = intMinX; x < intMaxX; x++) {
        if (grid.getAt(x, y)) occ++;
      }
      return occ / w;
    };
    const colOccupiedRatio = (x: number) => {
      let occ = 0;
      const h = Math.max(1, intMaxY - intMinY);
      for (let y = intMinY; y < intMaxY; y++) {
        if (grid.getAt(x, y)) occ++;
      }
      return occ / h;
    };

    while (intMaxY - intMinY > 14 && rowOccupiedRatio(intMinY) >= 0.35) intMinY++;
    while (intMaxY - intMinY > 14 && rowOccupiedRatio(intMaxY - 1) >= 0.35) intMaxY--;
    while (intMaxX - intMinX > 14 && colOccupiedRatio(intMinX) >= 0.35) intMinX++;
    while (intMaxX - intMinX > 14 && colOccupiedRatio(intMaxX - 1) >= 0.35) intMaxX--;
  };
  trimAsymmetricSide();

  // Leave a tiny 1-tile safety clearance if a wall/rail sits immediately outside trimmed edge
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

/**
 * Packs solid ingredients onto belts using Factorio lane-sharing when two
 * ingredients each fit within half a belt (throughput / 2).
 */
function packSolidInputBelts(
  stage: SolvedStage,
  beltThroughput: number,
  excludeItemId?: string
): BeltTrack[] {
  const solidInputs = stage.inputs.filter((i) => i.kind === 'item' && i.itemId !== excludeItemId);
  if (solidInputs.length === 0) return [];

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
    if (second) {
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
  const options: Required<Omit<LayoutSynthesisOptions, 'gridFrame'>> & {
    gridFrame?: GridEntity[];
  } =
    typeof modeOrOptions === 'string'
      ? {
          compactionMode: modeOrOptions,
          includeBeacons: true,
          includePowerPoles: true,
          directInsertion: false,
          inputSide: 'distributed',
          gridFrame: undefined,
        }
      : {
          compactionMode: modeOrOptions.compactionMode ?? 'compact',
          includeBeacons: modeOrOptions.includeBeacons ?? true,
          includePowerPoles: modeOrOptions.includePowerPoles ?? true,
          directInsertion: modeOrOptions.directInsertion ?? false,
          inputSide: modeOrOptions.inputSide ?? 'distributed',
          gridFrame: modeOrOptions.gridFrame,
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
        ? 4
        : 6
      : compactionMode === 'compact'
        ? 3
        : 5;
  const layerGapY =
    inputSide !== 'distributed'
      ? compactionMode === 'compact'
        ? 6
        : 8
      : compactionMode === 'compact'
        ? 4
        : 6;

  const stageOutputAnchors = new Map<
    string,
    Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }>
  >();
  const stageInputAnchors = new Map<
    string,
    Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }>
  >();

  // Safe interior synthesis window when adapting inside an imported Base Grid Frame
  const safeMinX = interiorBounds ? interiorBounds.minX + (inputSide === 'west' ? 5 : 1) : 0;
  const safeMaxX = interiorBounds ? interiorBounds.maxX - 1 : Infinity;
  const safeMinY = interiorBounds ? interiorBounds.minY + 3 : -Infinity;
  const safeMaxY = interiorBounds ? interiorBounds.maxY - (inputSide === 'south' ? 5 : 3) : 0;
  const availInteriorW = interiorBounds ? Math.max(8, safeMaxX - safeMinX) : Infinity;
  const availInteriorH = interiorBounds ? Math.max(8, safeMaxY - safeMinY) : Infinity;

  let currentBaseY = interiorBounds ? safeMaxY : 0;
  let shelfX = interiorBounds ? safeMinX : 0;
  let maxShelfHeight = 0;

  for (const layerIdx of sortedLayers) {
    const layerStages = layersMap.get(layerIdx)!;
    let currentX = interiorBounds ? shelfX : 0;
    let maxLayerHeight = 0;

    const blockPlans = layerStages.map((stage) => {
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

      const inputTracks = packSolidInputBelts(stage, beltThroughput, directPair?.itemId);
      const feederTracks = directPair
        ? packSolidInputBelts(directPair.feeder, beltThroughput)
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

      const mW = machine.tileSize.width;
      const mH = machine.tileSize.height;
      const rowStepY = Math.max(
        mH + (hasFluid ? 1 : 0),
        feederMachine ? feederMachine.tileSize.height : mH
      );

      // Fold column height automatically when constrained inside an imported grid height!
      const maxPerColUnbounded = compactionMode === 'compact' ? 10 : 8;
      const maxRowsByGridHeight = interiorBounds
        ? Math.max(1, Math.floor(availInteriorH / rowStepY))
        : maxPerColUnbounded;

      const useTwinColumns =
        !directPair &&
        count >= 6 &&
        !hasFluid &&
        machine.tileSize.width <= 3 &&
        (!interiorBounds || Math.ceil(count / 2) <= maxRowsByGridHeight);

      let cols = useTwinColumns
        ? 2
        : interiorBounds
          ? Math.max(1, Math.ceil(count / Math.min(maxPerColUnbounded, maxRowsByGridHeight)))
          : Math.min(4, Math.max(1, Math.ceil(count / maxPerColUnbounded)));

      const colGap = useTwinColumns ? 3 : 4 + feederUnitW;
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

      const blockW =
        fixedW + cols * mW + Math.max(0, cols - 1) * colGap;

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
    });

    if (!interiorBounds) {
      for (const bp of blockPlans) {
        maxLayerHeight = Math.max(maxLayerHeight, bp.blockH);
      }
    }

    for (const bp of blockPlans) {
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

      // In Grid Frame mode: wrap to a new shelf upward if this stage block overflows interior X bounds
      if (interiorBounds && currentX > safeMinX && currentX + bp.blockW > safeMaxX) {
        currentX = safeMinX;
        currentBaseY -= maxShelfHeight + layerGapY;
        maxShelfHeight = 0;
      }

      // Check vertical headroom inside Grid Frame; skip block gracefully if no vertical space left
      const effectiveRows = interiorBounds
        ? Math.min(rows, Math.max(0, Math.floor((currentBaseY - safeMinY + (rowStepY - mH)) / rowStepY)))
        : rows;
      const effectiveBlockH =
        effectiveRows > 0 ? effectiveRows * rowStepY - (bp.fluidInputs.length > 0 || bp.fluidOutputs.length > 0 ? 1 : 0) : bp.blockH;

      const blockTopY = currentBaseY - effectiveBlockH;
      const blockBottomY = currentBaseY;
      const machinesStartX = currentX + beaconStripW + bp.leftCorridorW + bp.fluidW + bp.feederUnitW;

      const outAnchors: Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }> = [];
      const inAnchors: Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }> = [];
      const feederInAnchors: Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }> = [];

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
            inAnchors.push({ x: beltX, y: blockBottomY - 1, itemId: t0.itemId, kind: 'item' });
            if (t0.partnerItemId) {
              inAnchors.push({
                x: beltX,
                y: blockBottomY - 1,
                itemId: t0.partnerItemId,
                kind: 'item',
              });
            }
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
            inAnchors.push({ x: outerBeltX, y: blockBottomY - 1, itemId: t1.itemId, kind: 'item' });
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
          if (directPair && feederMachine && feederTracks[0]) {
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
            inAnchors.push({ x: bX, y: blockBottomY - 1, itemId: t0.itemId, kind: 'item' });
            if (t0.partnerItemId) {
              inAnchors.push({
                x: bX,
                y: blockBottomY - 1,
                itemId: t0.partnerItemId,
                kind: 'item',
              });
            }
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
            inAnchors.push({ x: bX, y: blockBottomY - 1, itemId: t1.itemId, kind: 'item' });
            if (t1.partnerItemId) {
              inAnchors.push({
                x: bX,
                y: blockBottomY - 1,
                itemId: t1.partnerItemId,
                kind: 'item',
              });
            }
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
            outAnchors.push({
              x: outX,
              y: blockTopY,
              itemId: mainSolidOutput.itemId,
              kind: 'item',
            });
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
            inAnchors.push({ x: bX, y: blockBottomY - 1, itemId: t2.itemId, kind: 'item' });
          }
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

      // Splitter at bottom of twin columns
      if (useTwinColumns && inputTracks[0] && placedMachines > 0) {
        const leftBeltX = machinesStartX - 2;
        const rightBeltX = machinesStartX + mW + bp.colGap + mW + 1;
        const splitY = blockBottomY + 1;
        const midX = Math.floor((leftBeltX + rightBeltX) / 2);
        if ((!interiorBounds || splitY < safeMaxY + 2) && grid.canPlace(midX, splitY, 2, 1)) {
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
        }
      }

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

      if (interiorBounds) {
        maxShelfHeight = Math.max(maxShelfHeight, effectiveBlockH);
        shelfX = currentX + bp.blockW + blockGapX;
      }
      currentX += bp.blockW + blockGapX;
    }

    if (interiorBounds) {
      // Next topological layer continues onto next shelf with neat spacing if needed
      currentBaseY -= maxShelfHeight + layerGapY;
      shelfX = safeMinX;
      maxShelfHeight = 0;
    } else {
      currentBaseY -= maxLayerHeight + layerGapY;
    }
  }

  // 4. Route Inter-Stage Belts & Underground Crossings between connected stages
  for (const edge of solveResult.edges) {
    if (edge.kind !== 'item') continue;
    if (absorbedFeederIds.has(edge.sourceStageId)) continue; // handled via direct insertion!
    const fromAnchors = stageOutputAnchors.get(edge.sourceStageId) ?? [];
    const toAnchors = stageInputAnchors.get(edge.targetStageId) ?? [];
    const src = fromAnchors.find((a) => a.itemId === edge.itemId);
    const dst = toAnchors.find((a) => a.itemId === edge.itemId);
    if (!src || !dst) continue;

    const busY = Math.round((src.y + dst.y) / 2);
    const stepY1 = src.y >= busY ? -1 : 1;

    for (let y = src.y + stepY1; stepY1 < 0 ? y >= busY : y <= busY; y += stepY1) {
      routeBeltStep(grid, src.x, y, beltName, undergroundName, stepY1 < 0 ? 0 : 8, edge.itemId);
    }

    const stepX = dst.x >= src.x ? 1 : -1;
    const dirX: Direction = stepX > 0 ? 4 : 12;
    for (let x = src.x; stepX > 0 ? x <= dst.x : x >= dst.x; x += stepX) {
      routeBeltStep(grid, x, busY, beltName, undergroundName, dirX, edge.itemId);
    }

    const stepY2 = dst.y <= busY ? -1 : 1;
    for (let y = busY + stepY2; stepY2 < 0 ? y >= dst.y : y <= dst.y; y += stepY2) {
      routeBeltStep(grid, dst.x, y, beltName, undergroundName, stepY2 < 0 ? 0 : 8, edge.itemId);
    }
  }

  // 5. Raw / External Input Feeders + Port Markers (Distributed OR Same-Side Train Grid)
  interface GroupedRawPortRequest {
    key: string;
    itemId: string;
    partnerItemId?: string;
    kind: 'item' | 'fluid';
    ratePerSec: number;
    beltsRequired: number;
    anchor: { x: number; y: number; itemId: string; kind: 'item' | 'fluid' };
  }

  const rawRequestByAnchor = new Map<string, GroupedRawPortRequest>();
  for (const edge of solveResult.edges) {
    if (!edge.sourceStageId.startsWith('RAW:')) continue;
    const toAnchors = stageInputAnchors.get(edge.targetStageId) ?? [];
    const dst = toAnchors.find((a) => a.itemId === edge.itemId && a.kind === edge.kind);
    if (!dst) continue;

    const anchorKey = `${dst.kind}:${dst.x},${dst.y}`;
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
      });
    }
  }

  const rawRequests = Array.from(rawRequestByAnchor.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'item' ? -1 : 1;
    if (a.itemId !== b.itemId) return a.itemId.localeCompare(b.itemId);
    return a.anchor.x - b.anchor.x || a.anchor.y - b.anchor.y;
  });

  if (inputSide === 'distributed') {
    for (const req of rawRequests) {
      const { anchor } = req;
      const stubLen = interiorBounds ? 2 : 3;
      let actualTipY = anchor.y;
      for (let dy = 1; dy <= stubLen; dy++) {
        const py = anchor.y + dy;
        if (interiorBounds && py >= interiorBounds.maxY) break;
        if (req.kind === 'item') {
          if (grid.placeOrMergeBelt(anchor.x, py, beltName, 0, {
            left: req.itemId,
            right: req.partnerItemId ?? req.itemId,
          })) {
            actualTipY = py;
          }
        } else if (grid.canPlace(anchor.x, py, 1, 1)) {
          grid.place({
            kind: 'pipe',
            name: 'pipe',
            tileX: anchor.x,
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
        tileX: anchor.x,
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

      slots.forEach(({ req, slotX }) => {
        const targetEntry = findBestFeederTarget(grid, req.anchor);
        const routed = routeExternalFeederPath(
          grid,
          { x: slotX, y: entryY - 1, dir: 0 },
          targetEntry,
          req,
          beltName,
          undergroundName,
          southRoutingBounds
        );

        if (!routed) {
          for (let dy = 1; dy <= 2; dy++) {
            if (!interiorBounds || req.anchor.y + dy < interiorBounds.maxY) {
              placeFeederTile(grid, req.anchor.x, req.anchor.y + dy, req, beltName, 0);
            }
          }
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
        ? interiorBounds.minX + 2
        : preBounds.minX - 5;
      const centerY = interiorBounds
        ? Math.round((interiorBounds.minY + interiorBounds.maxY) / 2)
        : Math.round((preBounds.minY + preBounds.maxY) / 2);
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

      slots.forEach(({ req, slotY }) => {
        const targetEntry = findBestFeederTarget(grid, req.anchor);
        const routed = routeExternalFeederPath(
          grid,
          { x: entryX + 1, y: slotY, dir: 4 },
          targetEntry,
          req,
          beltName,
          undergroundName,
          westRoutingBounds
        );

        if (!routed) {
          for (let dy = 1; dy <= 2; dy++) {
            if (!interiorBounds || req.anchor.y + dy < interiorBounds.maxY) {
              placeFeederTile(grid, req.anchor.x, req.anchor.y + dy, req, beltName, 0);
            }
          }
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
        ? interiorBounds.minY
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

function findBestFeederTarget(
  grid: OccupancyGrid,
  anchor: { x: number; y: number; itemId: string; kind: 'item' | 'fluid' }
): { x: number; y: number; dir: Direction } {
  const below = grid.getAt(anchor.x, anchor.y + 1);
  if (!below) {
    return { x: anchor.x, y: anchor.y + 1, dir: 0 };
  }
  for (let dy = 1; dy <= 3; dy++) {
    if (!grid.getAt(anchor.x, anchor.y + dy)) {
      return { x: anchor.x, y: anchor.y + dy, dir: 0 };
    }
  }
  return { x: anchor.x, y: anchor.y + 1, dir: 0 };
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
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): boolean {
  const canOccupyNormal = (x: number, y: number, dir: Direction): boolean => {
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return false;
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
  bestCost.set(`${start.x},${start.y},${start.dir}`, 0);

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
  const maxJump = req.kind === 'fluid' ? 8 : 5;
  let goalIdx = -1;
  let expansions = 0;

  while (openHeap.length > 0 && expansions < 8000) {
    const curIdx = popHeap();
    const cur = nodes[curIdx];
    expansions++;

    if (cur.x === goal.x && cur.y === goal.y && (cur.stepType === 'normal' || cur.dir === goal.dir)) {
      goalIdx = curIdx;
      break;
    }

    const curStateKey = `${cur.x},${cur.y},${cur.dir}`;
    if (cur.g > (bestCost.get(curStateKey) ?? Infinity) + 1e-6) continue;

    // 1. Normal 1-tile steps
    for (const ndir of allDirs) {
      const { dx, dy } = dirDelta(ndir);
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!canOccupyNormal(nx, ny, ndir)) continue;
      const turnPenalty = ndir === cur.dir ? 0 : 0.6;
      const ng = cur.g + 1 + turnPenalty;
      const nKey = `${nx},${ny},${ndir}`;
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

    // 2. Underground belt / pipe-to-ground jumps across perpendicular belts/obstacles
    if (curIdx !== 0 && !grid.getAt(cur.x, cur.y)) {
      for (const ndir of allDirs) {
        const { dx, dy } = dirDelta(ndir);
        const adjX = cur.x + dx;
        const adjY = cur.y + dy;
        const adjEnt = grid.getAt(adjX, adjY);
        if (!adjEnt) continue; // only jump when there's an obstacle ahead
        if (adjEnt.kind === 'underground-belt' && (adjEnt.direction % 8) === (ndir % 8)) continue;

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

          if (!grid.getAt(lx, ly)) {
            const ng = cur.g + 5 + k * 1.4 + (ndir === cur.dir ? 0 : 0.6);
            const nKey = `${lx},${ly},${ndir}`;
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
            break; // shortest valid underground exit in this direction
          }
        }
      }
    }
  }

  if (goalIdx === -1) return false;

  // Reconstruct and stamp entities cleanly onto grid
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

  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const next = path[i + 1];
    const travelDir = next ? next.dir : goal.dir;

    if (next && next.type === 'underground' && next.jumpLen) {
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
      i++; // landing tile was placed as output
    } else {
      placeFeederTile(grid, step.x, step.y, req, beltName, travelDir);
    }
  }

  return true;
}

function routeBeltStep(
  grid: OccupancyGrid,
  x: number,
  y: number,
  beltName: string,
  undergroundName: string,
  direction: Direction,
  itemId: string
): void {
  const existing = grid.getAt(x, y);
  if (!existing) {
    grid.place({
      kind: 'transport-belt',
      name: beltName,
      tileX: x,
      tileY: y,
      width: 1,
      height: 1,
      direction,
      beltLanes: { left: itemId, right: itemId },
    });
    return;
  }

  if (existing.kind === 'transport-belt' && existing.direction !== direction) {
    const dx = direction === 4 ? 1 : direction === 12 ? -1 : 0;
    const dy = direction === 8 ? 1 : direction === 0 ? -1 : 0;
    const prev = grid.getAt(x - dx, y - dy);
    if (prev && prev.kind === 'transport-belt' && prev.direction === direction) {
      grid.remove(prev);
      grid.place({
        kind: 'underground-belt',
        name: undergroundName,
        tileX: x - dx,
        tileY: y - dy,
        width: 1,
        height: 1,
        direction,
        undergroundType: 'input',
        beltLanes: { left: itemId, right: itemId },
      });
    }
    if (grid.canPlace(x + dx, y + dy, 1, 1)) {
      grid.place({
        kind: 'underground-belt',
        name: undergroundName,
        tileX: x + dx,
        tileY: y + dy,
        width: 1,
        height: 1,
        direction,
        undergroundType: 'output',
        beltLanes: { left: itemId, right: itemId },
      });
    }
  }
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
