/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction, PackIndex } from '../data/schema.ts';
import type { PlanConfig, SolveResult, SolvedStage } from '../engine/types.ts';
import type {
  GridEntity,
  LayoutSynthesisOptions,
  SpatialLayoutStats,
  StageZone,
  SynthesizedLayout,
} from './types.ts';

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
  const options: Required<LayoutSynthesisOptions> =
    typeof modeOrOptions === 'string'
      ? {
          compactionMode: modeOrOptions,
          includeBeacons: true,
          includePowerPoles: true,
          directInsertion: false,
        }
      : {
          compactionMode: modeOrOptions.compactionMode ?? 'compact',
          includeBeacons: modeOrOptions.includeBeacons ?? true,
          includePowerPoles: modeOrOptions.includePowerPoles ?? true,
          directInsertion: modeOrOptions.directInsertion ?? false,
        };

  const compactionMode = options.compactionMode;
  const grid = new OccupancyGrid();
  const zones: StageZone[] = [];

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
  const blockGapX = compactionMode === 'compact' ? 3 : 5;
  const layerGapY = compactionMode === 'compact' ? 4 : 6;

  const stageOutputAnchors = new Map<
    string,
    Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }>
  >();
  const stageInputAnchors = new Map<
    string,
    Array<{ x: number; y: number; itemId: string; kind: 'item' | 'fluid' }>
  >();

  let currentBaseY = 0;

  for (const layerIdx of sortedLayers) {
    const layerStages = layersMap.get(layerIdx)!;
    let currentX = 0;
    let maxLayerHeight = 0;

    const blockPlans = layerStages.map((stage) => {
      const machine = index.machinesById.get(stage.machineId)!;
      const count = stage.installedMachines;
      const directPair = directFeederForStage.get(stage.id);
      const feederMachine = directPair
        ? index.machinesById.get(directPair.feeder.machineId)
        : undefined;

      const hasFluid =
        stage.inputs.some((i) => i.kind === 'fluid') ||
        stage.outputs.some((o) => o.kind === 'fluid');
      const useTwinColumns =
        !directPair && count >= 6 && !hasFluid && machine.tileSize.width <= 3;
      const maxPerCol = compactionMode === 'compact' ? 10 : 8;
      const cols = useTwinColumns ? 2 : Math.min(3, Math.max(1, Math.ceil(count / maxPerCol)));
      const rows = Math.ceil(count / cols);

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
      const fluidW = fluidInputs.length > 0 || fluidOutputs.length > 0 ? 2 : 0;

      const feederUnitW =
        directPair && feederMachine
          ? feederMachine.tileSize.width + 1 + (feederTracks.length > 0 ? feederTracks.length + 2 : 0)
          : 0;

      const mW = machine.tileSize.width;
      const mH = machine.tileSize.height;
      const colGap = useTwinColumns ? 3 : 4 + feederUnitW;

      const blockW =
        beaconStripW +
        leftCorridorW +
        fluidW +
        feederUnitW +
        cols * mW +
        Math.max(0, cols - 1) * colGap +
        (useTwinColumns ? 0 : 3) +
        rightInputW;

      const rowStepY = Math.max(
        mH + (hasFluid ? 1 : 0),
        feederMachine ? feederMachine.tileSize.height : mH
      );
      const blockH = rows * rowStepY - (hasFluid ? 1 : 0);

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

    for (const bp of blockPlans) {
      maxLayerHeight = Math.max(maxLayerHeight, bp.blockH);
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

      const blockTopY = currentBaseY - bp.blockH;
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
      if (beaconDef && stage.beacon && stage.beacon.count > 0) {
        const bW = beaconDef.tileSize.width;
        const bH = beaconDef.tileSize.height;
        const maxBeaconRows = Math.max(1, Math.floor(bp.blockH / bH));
        const desiredBeaconSlots = Math.min(maxBeaconRows, Math.max(1, stage.beacon.count));
        for (let b = 0; b < desiredBeaconSlots; b++) {
          const bY = blockBottomY - (b + 1) * bH;
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

      // 1. Place Machines in compact columns (filling bottom-to-top, left-to-right)
      let placedMachines = 0;
      let placedFeeders = 0;

      for (let c = 0; c < cols; c++) {
        const mX = machinesStartX + c * (mW + bp.colGap);
        for (let r = 0; r < rows; r++) {
          if (placedMachines >= count) break;
          const mY = blockBottomY - (r + 1) * rowStepY + (rowStepY - mH);
          placedMachines++;

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

          // Optional Direct Insertion Feeder Machine paired on the left of this machine!
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

            // Direct 1-tile machine-to-machine inserter!
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

            // Input inserters for the feeder machine
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

          // 2. Place Input Inserters & Belts for this machine
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

            // Inline Medium Electric Pole every 2 rows in free tile at bottom of inserter gap
            if (options.includePowerPoles && r % 2 === 0 && mH >= 3) {
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
                // Feed secondary solid ingredient (e.g. iron-plate into electronic-circuit) from right side
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

            // Inline electric pole in free slot of inserter strip
            if (options.includePowerPoles && r % 2 === 0 && mH >= 3) {
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

            // Keep unused variable referenced cleanly
            void inputBeltBaseX;
          }
        }

        // Lay continuous vertical belts for this column
        if (useTwinColumns) {
          const isLeftCol = c === 0;
          const mX = machinesStartX + c * (mW + bp.colGap);
          const beltX = isLeftCol ? mX - 2 : mX + mW + 1;
          if (inputTracks[0]) {
            const t0 = inputTracks[0];
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                beltX,
                y,
                beltName,
                0,
                t0.partnerItemId
                  ? { left: t0.itemId, right: t0.partnerItemId }
                  : { left: t0.itemId, right: t0.itemId },
                stage.id
              );
            }
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
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                outerBeltX,
                y,
                beltName,
                0,
                t1.partnerItemId
                  ? { left: t1.itemId, right: t1.partnerItemId }
                  : { left: t1.itemId, right: t1.itemId },
                stage.id
              );
            }
            inAnchors.push({ x: outerBeltX, y: blockBottomY - 1, itemId: t1.itemId, kind: 'item' });
          }

          if (c === 0 && mainSolidOutput) {
            const centerBeltX = mX + mW + 1;
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                centerBeltX,
                y,
                beltName,
                0,
                { left: mainSolidOutput.itemId, right: mainSolidOutput.itemId },
                stage.id
              );
            }
            outAnchors.push({
              x: centerBeltX,
              y: blockTopY,
              itemId: mainSolidOutput.itemId,
              kind: 'item',
            });
          }
        } else {
          const mX = machinesStartX + c * (mW + bp.colGap);

          // Feeder vertical belt when direct insertion is active
          if (directPair && feederMachine && feederTracks[0]) {
            const ft0 = feederTracks[0];
            const fbX = mX - 1 - feederMachine.tileSize.width - 2;
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                fbX,
                y,
                beltName,
                0,
                { left: ft0.itemId, right: ft0.itemId },
                directPair.feeder.id
              );
            }
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
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                bX,
                y,
                beltName,
                0,
                t0.partnerItemId
                  ? { left: t0.itemId, right: t0.partnerItemId }
                  : { left: t0.itemId, right: t0.itemId },
                stage.id
              );
            }
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
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                bX,
                y,
                beltName,
                0,
                t1.partnerItemId
                  ? { left: t1.itemId, right: t1.partnerItemId }
                  : { left: t1.itemId, right: t1.itemId },
                stage.id
              );
            }
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
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                outX,
                y,
                beltName,
                0,
                { left: mainSolidOutput.itemId, right: mainSolidOutput.itemId },
                stage.id
              );
            }
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
            for (let y = blockTopY; y < blockBottomY; y++) {
              grid.placeOrMergeBelt(
                bX,
                y,
                beltName,
                0,
                t2.partnerItemId
                  ? { left: t2.itemId, right: t2.partnerItemId }
                  : { left: t2.itemId, right: t2.itemId },
                stage.id
              );
            }
            inAnchors.push({ x: bX, y: blockBottomY - 1, itemId: t2.itemId, kind: 'item' });
          }
        }
      }

      // 3. Place Fluid Pipe Manifolds if stage uses/produces fluids
      if (fluidInputs.length > 0 || fluidOutputs.length > 0) {
        const pipeX = machinesStartX - 1;
        const primaryFluid = fluidInputs[0]?.itemId ?? fluidOutputs[0]?.itemId;
        for (let y = blockTopY; y < blockBottomY; y++) {
          if (grid.canPlace(pipeX, y, 1, 1)) {
            grid.place({
              kind: 'pipe',
              name: 'pipe',
              tileX: pipeX,
              tileY: y,
              width: 1,
              height: 1,
              direction: 0,
              fluidId: primaryFluid,
              stageId: stage.id,
            });
          }
        }
        if (fluidInputs[0]) {
          inAnchors.push({
            x: pipeX,
            y: blockBottomY - 1,
            itemId: fluidInputs[0].itemId,
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
      if (useTwinColumns && inputTracks[0]) {
        const leftBeltX = machinesStartX - 2;
        const rightBeltX = machinesStartX + mW + bp.colGap + mW + 1;
        const splitY = blockBottomY + 1;
        const midX = Math.floor((leftBeltX + rightBeltX) / 2);
        if (grid.canPlace(midX, splitY, 2, 1)) {
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

      zones.push({
        stageId: stage.id,
        recipeId: stage.recipeId,
        label: directPair
          ? `${directPair.feeder.recipeName} → ${stage.recipeName}`
          : stage.recipeName,
        tileX: currentX,
        tileY: blockTopY,
        width: bp.blockW,
        height: bp.blockH,
        machineCount: count + (directPair ? directPair.feeder.installedMachines : 0),
      });

      stageOutputAnchors.set(stage.id, outAnchors);
      stageInputAnchors.set(stage.id, inAnchors);
      if (directPair) {
        stageInputAnchors.set(directPair.feeder.id, feederInAnchors);
      }
      currentX += bp.blockW + blockGapX;
    }

    currentBaseY -= maxLayerHeight + layerGapY;
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

  // Raw-input feeder stubs
  for (const edge of solveResult.edges) {
    if (!edge.sourceStageId.startsWith('RAW:') || edge.kind !== 'item') continue;
    const toAnchors = stageInputAnchors.get(edge.targetStageId) ?? [];
    const dst = toAnchors.find((a) => a.itemId === edge.itemId);
    if (!dst) continue;
    for (let dy = 1; dy <= 3; dy++) {
      grid.placeOrMergeBelt(dst.x, dst.y + dy, beltName, 0, {
        left: edge.itemId,
        right: edge.itemId,
      });
    }
  }

  // Final output belt stubs
  for (const edge of solveResult.edges) {
    if (!edge.targetStageId.startsWith('TARGET:') || edge.kind !== 'item') continue;
    const fromAnchors = stageOutputAnchors.get(edge.sourceStageId) ?? [];
    const src = fromAnchors.find((a) => a.itemId === edge.itemId);
    if (!src) continue;
    for (let dy = 1; dy <= 3; dy++) {
      grid.placeOrMergeBelt(src.x, src.y - dy, beltName, 0, {
        left: edge.itemId,
        right: edge.itemId,
      });
    }
  }

  return finalizeLayout(grid.entities, zones, compactionMode);
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

    if (e.kind === 'machine') machineCount++;
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
  compactionMode: 'compact' | 'standard'
): SynthesizedLayout {
  const { bounds, stats } = computeLayoutStats(entities);
  return {
    entities,
    zones,
    bounds,
    stats,
    compactionMode,
  };
}
