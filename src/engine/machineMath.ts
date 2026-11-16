/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MachineDef,
  PackIndex,
  RecipeDef,
  RecipeIngredient,
  RecipeResult,
  RulesVersion,
} from '../data/schema.ts';
import type { BeaconConfig, MachineEffectiveStats } from './types.ts';

/**
 * Computes effective crafting speed, productivity bonus, energy consumption,
 * and pollution for a given recipe + machine + modules + beacon setup.
 * Mirrors Factorio 1.1 and 2.0 exact rules (including 0.2x clamps, 300% prod cap,
 * and 2.0 sqrt(n) beacon diminishing returns).
 */
export function computeMachineEffectiveStats(
  index: PackIndex,
  recipe: RecipeDef,
  machine: MachineDef,
  moduleIds: string[],
  beacon?: BeaconConfig,
  researchProductivityBonus = 0,
  rulesVersion: RulesVersion = index.pack.rulesVersion
): MachineEffectiveStats {
  const warnings: string[] = [];

  let speedMod = 0;
  let prodMod = machine.baseProductivity + researchProductivityBonus;
  let consumptionMod = 0;
  let pollutionMod = 0;

  const machineAllowed = new Set(machine.allowedEffects);
  const recipeAllowed = recipe.allowedEffects ? new Set(recipe.allowedEffects) : null;

  const usableSlots = Math.min(moduleIds.length, machine.moduleSlots);
  if (moduleIds.length > machine.moduleSlots) {
    warnings.push(
      `Machine "${machine.name}" supports ${machine.moduleSlots} module slot(s), ignoring ${moduleIds.length - machine.moduleSlots} extra module(s).`
    );
  }

  for (let i = 0; i < usableSlots; i++) {
    const modId = moduleIds[i];
    const mod = index.modulesById.get(modId);
    if (!mod) {
      warnings.push(`Unknown module "${modId}".`);
      continue;
    }

    if (mod.category === 'productivity') {
      const allowedByRecipe =
        recipe.allowProductivity && (!recipeAllowed || recipeAllowed.has('productivity'));
      const allowedByMachine = machineAllowed.has('productivity');
      if (!allowedByRecipe || !allowedByMachine) {
        warnings.push(
          `Productivity module "${mod.name}" cannot be used with recipe "${recipe.name}" in "${machine.name}".`
        );
        continue;
      }
    }

    if (mod.category === 'speed' && !machineAllowed.has('speed')) {
      warnings.push(`Speed module "${mod.name}" is not allowed in "${machine.name}".`);
      continue;
    }

    speedMod += mod.effects.speed;
    prodMod += mod.effects.productivity;
    consumptionMod += mod.effects.consumption;
    pollutionMod += mod.effects.pollution;
  }

  let beaconPowerKw = 0;
  if (beacon && beacon.count > 0) {
    const beaconDef = index.beaconsById.get(beacon.beaconId);
    if (!beaconDef) {
      warnings.push(`Unknown beacon "${beacon.beaconId}".`);
    } else {
      const count = Math.max(0, beacon.count);
      const effectiveMode = rulesVersion === '2.0' ? beaconDef.profileMode : 'linear';
      const transmissionFactor =
        effectiveMode === 'sqrt'
          ? beaconDef.distributionEffectivity * Math.sqrt(count)
          : beaconDef.distributionEffectivity * count;

      const beaconSlots = Math.min(beacon.moduleIds.length, beaconDef.moduleSlots);
      for (let i = 0; i < beaconSlots; i++) {
        const mod = index.modulesById.get(beacon.moduleIds[i]);
        if (!mod) continue;
        if (mod.category === 'productivity') {
          warnings.push(`Beacons cannot transmit productivity modules ("${mod.name}").`);
          continue;
        }
        speedMod += mod.effects.speed * transmissionFactor;
        consumptionMod += mod.effects.consumption * transmissionFactor;
        pollutionMod += mod.effects.pollution * transmissionFactor;
      }
      // Amortized beacon power note: beacons can be shared across machines, tracked cleanly
      beaconPowerKw = 0;
    }
  }

  // Factorio clamps speed and consumption multipliers at minimum 0.2 (-80%)
  const speedMultiplier = Math.max(0.2, 1 + speedMod);
  const consumptionMultiplier = Math.max(0.2, 1 + consumptionMod);
  const pollutionMultiplier = Math.max(0.2, 1 + pollutionMod);

  // Factorio 2.0 caps total productivity bonus at maximumProductivity (default +300% = 3.0)
  const maxProd = recipe.maximumProductivity ?? 3.0;
  const productivityBonus = Math.max(0, Math.min(maxProd, prodMod));

  const craftingSpeed = machine.craftingSpeed * speedMultiplier;
  const cyclesPerSecPerMachine = craftingSpeed / recipe.energyRequired;

  const powerKwPerMachine =
    machine.energySourceType === 'electric'
      ? machine.energyUsageKw * consumptionMultiplier + machine.drainKw + beaconPowerKw
      : machine.energyUsageKw + beaconPowerKw;

  const pollutionPerMinPerMachine =
    machine.pollutionPerMin * consumptionMultiplier * pollutionMultiplier;

  return {
    craftingSpeed,
    speedMultiplier,
    productivityBonus,
    consumptionMultiplier,
    pollutionMultiplier,
    powerKwPerMachine,
    drainKwPerMachine: machine.drainKw,
    pollutionPerMinPerMachine,
    cyclesPerSecPerMachine,
    warnings,
  };
}

/**
 * Expected input amount per craft cycle.
 */
export function getIngredientPerCycle(ing: RecipeIngredient): number {
  return ing.amount;
}

/**
 * Expected output amount per craft cycle factoring probability, random range,
 * extra_count_fraction, and productivity catalyst exclusions.
 */
export function getResultPerCycle(res: RecipeResult, productivityBonus: number): number {
  const baseExpected =
    res.amountMin !== undefined && res.amountMax !== undefined
      ? (res.amountMin + res.amountMax) / 2
      : res.amount;

  const expectedBeforeProd =
    baseExpected * (res.probability ?? 1) + (res.extraCountFraction ?? 0);

  if (productivityBonus <= 0) {
    return expectedBeforeProd;
  }

  const catalyst = Math.min(expectedBeforeProd, res.ignoredByProductivity ?? 0);
  const prodEligible = Math.max(0, expectedBeforeProd - catalyst);
  return expectedBeforeProd + prodEligible * productivityBonus;
}
