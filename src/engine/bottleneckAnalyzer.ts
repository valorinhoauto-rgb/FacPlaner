/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackIndex } from '../data/schema.ts';
import type { BottleneckAlert, FlowEdge, PlanConfig, SolvedStage } from './types.ts';

const EPS = 1e-4;

export function analyzeBottlenecks(
  index: PackIndex,
  config: PlanConfig,
  stages: SolvedStage[],
  edges: FlowEdge[],
  intermediates: Array<{
    itemId: string;
    producedPerSec: number;
    consumedPerSec: number;
    surplusPerSec: number;
    deficitPerSec: number;
  }>
): BottleneckAlert[] {
  const alerts: BottleneckAlert[] = [];
  const defaultBelt =
    index.beltsById.get(config.defaultBeltId ?? 'express-transport-belt') ??
    index.pack.belts[index.pack.belts.length - 1];
  const defaultInserter =
    index.insertersById.get(config.defaultInserterId ?? 'fast-inserter') ??
    index.pack.inserters[0];

  // 1. Module / recipe compatibility warnings
  for (const stage of stages) {
    for (const w of stage.effectiveStats.warnings) {
      alerts.push({
        id: `mod-${stage.id}-${alerts.length}`,
        severity: 'warning',
        code: 'INVALID_MODULE',
        stageId: stage.id,
        message: w,
        suggestion: `Adjust modules or machine tier on "${stage.recipeName}".`,
      });
    }

    // 2. Technology unlock check (if unlockedTechIds provided)
    if (config.unlockedTechIds) {
      const unlockedSet = new Set(config.unlockedTechIds);
      const recipe = index.recipesById.get(stage.recipeId);
      const unlockingTechs = index.techsUnlockingRecipe.get(stage.recipeId) ?? [];
      if (
        recipe &&
        !recipe.enabledByDefault &&
        unlockingTechs.length > 0 &&
        !unlockingTechs.some((t) => unlockedSet.has(t.id))
      ) {
        alerts.push({
          id: `tech-${stage.id}`,
          severity: 'warning',
          code: 'LOCKED_TECH',
          stageId: stage.id,
          message: `Recipe "${stage.recipeName}" requires research: ${unlockingTechs.map((t) => t.name).join(' or ')}.`,
          suggestion: `Unlock "${unlockingTechs[0].name}" or choose an alternative recipe.`,
        });
      }
    }

    // 3. Starvation check (stage running below its installed capacity due to missing inputs)
    if (stage.installedMachines > 0 && stage.utilization < 0.995) {
      const theoreticalNeeded = Math.ceil(stage.theoreticalMachines - 1e-9);
      if (stage.isFixedCount && stage.utilization < 0.995) {
        alerts.push({
          id: `starve-${stage.id}`,
          severity: 'error',
          code: 'STARVATION',
          stageId: stage.id,
          message: `"${stage.recipeName}" (${stage.installedMachines}x ${stage.machineName}) is starved at ${(stage.utilization * 100).toFixed(1)}% utilization due to insufficient upstream supply.`,
          suggestion: `Increase upstream machine counts or reduce "${stage.recipeName}" machines.`,
        });
      } else if (!stage.isFixedCount && theoreticalNeeded > stage.installedMachines) {
        alerts.push({
          id: `under-${stage.id}`,
          severity: 'error',
          code: 'STARVATION',
          stageId: stage.id,
          message: `"${stage.recipeName}" lacks capacity (${stage.installedMachines} installed vs ${stage.theoreticalMachines.toFixed(2)} needed).`,
          suggestion: `Add ${theoreticalNeeded - stage.installedMachines} more ${stage.machineName}(s).`,
        });
      }
    }

    // 4. Per-machine inserter throughput check
    if (defaultInserter) {
      for (const inp of stage.inputs) {
        if (inp.kind !== 'item') continue;
        const maxOneInserter = defaultInserter.baseBeltToMachinePerSec;
        if (inp.perMachinePerSec > maxOneInserter * 2) {
          const itemName = index.resourcesById.get(inp.itemId)?.name ?? inp.itemId;
          const neededPerSide = Math.ceil(inp.perMachinePerSec / maxOneInserter);
          alerts.push({
            id: `ins-${stage.id}-${inp.itemId}`,
            severity: 'info',
            code: 'INSERTER_LIMIT',
            stageId: stage.id,
            itemId: inp.itemId,
            message: `Each "${stage.machineName}" on "${stage.recipeName}" consumes ${inp.perMachinePerSec.toFixed(2)}/s of ${itemName}, exceeding 2x ${defaultInserter.name} (${(maxOneInserter * 2).toFixed(2)}/s).`,
            suggestion: `Use ${neededPerSide}x Fast/Bulk Inserters per machine or direct insertion.`,
          });
        }
      }
    }
  }

  // 5. Deficit & Excess Byproduct checks on intermediates
  for (const inter of intermediates) {
    const resName = index.resourcesById.get(inter.itemId)?.name ?? inter.itemId;
    if (inter.deficitPerSec > EPS) {
      alerts.push({
        id: `def-${inter.itemId}`,
        severity: 'error',
        code: 'STARVATION',
        itemId: inter.itemId,
        message: `Insufficient "${resName}": producing ${inter.producedPerSec.toFixed(2)}/s but downstream demands ${inter.consumedPerSec.toFixed(2)}/s (short by ${inter.deficitPerSec.toFixed(2)}/s).`,
        suggestion: `Increase machine count or upgrade modules/beacons on the stage producing "${resName}".`,
      });
    }
    if (inter.surplusPerSec > 0.05) {
      const isFluid = index.fluidsById.has(inter.itemId);
      alerts.push({
        id: `surplus-${inter.itemId}`,
        severity: isFluid ? 'warning' : 'info',
        code: 'EXCESS_BYPRODUCT',
        itemId: inter.itemId,
        message: `Excess "${resName}": +${inter.surplusPerSec.toFixed(2)}/s unconsumed${isFluid ? ' (can deadlock fluid lines in Factorio!)' : ''}.`,
        suggestion: isFluid
          ? `Add cracking, Solid Fuel conversion, or storage/consumers for "${resName}".`
          : `Buffer surplus or reduce over-provisioned machines producing "${resName}".`,
      });
    }
  }

  // 6. Belt saturation checks on connections
  if (defaultBelt) {
    for (const edge of edges) {
      if (edge.kind !== 'item') continue;
      if (edge.actualRatePerSec > defaultBelt.throughputPerSec + EPS) {
        const lanes = Math.ceil(edge.actualRatePerSec / defaultBelt.throughputPerSec);
        const itemName = index.resourcesById.get(edge.itemId)?.name ?? edge.itemId;
        alerts.push({
          id: `belt-${edge.id}`,
          severity: 'warning',
          code: 'BELT_SATURATION',
          itemId: edge.itemId,
          message: `Flow of ${itemName} (${edge.actualRatePerSec.toFixed(2)}/s) exceeds 1x ${defaultBelt.name} (${defaultBelt.throughputPerSec}/s).`,
          suggestion: `Split into ${lanes} parallel belts or upgrade belt tier.`,
        });
      }
    }
  }

  return alerts;
}
