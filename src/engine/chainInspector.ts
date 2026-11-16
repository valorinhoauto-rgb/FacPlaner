/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackIndex } from '../data/schema.ts';
import { pickRecipeForItem } from './graphBuilder.ts';
import type { PlanConfig, SolveResult } from './types.ts';

export interface ChainNode {
  key: string;
  itemId: string;
  name: string;
  kind: 'item' | 'fluid';
  depth: number;
  isTarget: boolean;
  isNaturalRaw: boolean;
  isExternalOverride: boolean;
  isPrimaryMaterial: boolean;
  recipeId?: string;
  recipeName?: string;
  installedMachines?: number;
  machineName?: string;
  ratePerSec?: number;
  beltsRequired?: number;
  repeatedRef?: boolean;
  hiddenSubstepsCount: number;
  children: ChainNode[];
}

const PRIMARY_MATERIAL_IDS = new Set([
  'iron-plate',
  'copper-plate',
  'steel-plate',
  'stone-brick',
  'plastic-bar',
  'sulfur',
  'sulfuric-acid',
  'petroleum-gas',
  'light-oil',
  'heavy-oil',
  'lubricant',
  'tungsten-plate',
  'holmium-plate',
  'kr-silicon',
  'kr-glass',
  'kr-rare-metals',
  'kr-imersium-plate',
]);

function countFullSubtreeSteps(
  index: PackIndex,
  itemId: string,
  config: PlanConfig,
  seen: Set<string>
): number {
  if (seen.has(itemId)) return 0;
  const res = index.resourcesById.get(itemId);
  if (!res) return 0;
  if (res.isRawResource) return 1;
  const recipe = pickRecipeForItem(index, itemId, config);
  if (!recipe) return 1;

  const nextSeen = new Set(seen);
  nextSeen.add(itemId);
  let total = 1;
  for (const ing of recipe.ingredients) {
    total += countFullSubtreeSteps(index, ing.id, config, nextSeen);
  }
  return total;
}

export function buildTargetChainTree(
  index: PackIndex,
  config: PlanConfig,
  solveResult: SolveResult
): ChainNode[] {
  const targetIds = new Set(config.targets.map((t) => t.itemId));
  const rawOverrides = new Set(config.rawResourceOverrides ?? []);
  const seenExpandedElsewhere = new Set<string>();

  // Map solved stage metrics by produced itemId
  const stageByItem = new Map<
    string,
    {
      installedMachines: number;
      machineName: string;
      ratePerSec: number;
      beltsRequired: number;
    }
  >();
  for (const st of solveResult.stages) {
    for (const out of st.outputs) {
      if (out.actualTotalPerSec > 0 || !stageByItem.has(out.itemId)) {
        stageByItem.set(out.itemId, {
          installedMachines: st.installedMachines,
          machineName: st.machineName,
          ratePerSec: out.actualTotalPerSec,
          beltsRequired: st.beltsNeededPerOutput[out.itemId] ?? 0,
        });
      }
    }
  }

  const rawByItem = new Map<string, { ratePerSec: number; beltsRequired: number }>();
  for (const raw of solveResult.rawInputs) {
    rawByItem.set(raw.itemId, {
      ratePerSec: raw.actualPerSec,
      beltsRequired: raw.beltsRequired,
    });
  }

  const buildNode = (
    itemId: string,
    depth: number,
    pathKey: string,
    ancestors: Set<string>
  ): ChainNode | null => {
    const res = index.resourcesById.get(itemId);
    if (!res) return null;

    const isTarget = targetIds.has(itemId);
    const recipe = !res.isRawResource ? pickRecipeForItem(index, itemId, config) : null;
    const isNaturalRaw = res.isRawResource || !recipe;
    const isExternalOverride = !isNaturalRaw && !isTarget && rawOverrides.has(itemId);
    const isPrimaryMaterial =
      !isNaturalRaw &&
      (PRIMARY_MATERIAL_IDS.has(itemId) ||
        recipe?.category === 'smelting' ||
        recipe?.category === 'metallurgy');

    const solvedStage = stageByItem.get(itemId);
    const solvedRaw = rawByItem.get(itemId);

    const ratePerSec = isNaturalRaw || isExternalOverride
      ? solvedRaw?.ratePerSec
      : solvedStage?.ratePerSec;
    const beltsRequired = isNaturalRaw || isExternalOverride
      ? solvedRaw?.beltsRequired
      : solvedStage?.beltsRequired;

    const alreadyExpanded = seenExpandedElsewhere.has(itemId);
    const inCycle = ancestors.has(itemId);

    let children: ChainNode[] = [];
    let hiddenSubstepsCount = 0;

    if (!isNaturalRaw && recipe) {
      if (isExternalOverride) {
        hiddenSubstepsCount = Math.max(
          0,
          countFullSubtreeSteps(index, itemId, config, new Set(ancestors)) - 1
        );
      } else if (!alreadyExpanded && !inCycle) {
        seenExpandedElsewhere.add(itemId);
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(itemId);
        for (const ing of recipe.ingredients) {
          const child = buildNode(
            ing.id,
            depth + 1,
            `${pathKey}>${ing.id}`,
            nextAncestors
          );
          if (child) children.push(child);
        }
      }
    }

    return {
      key: pathKey,
      itemId,
      name: res.name,
      kind: res.kind,
      depth,
      isTarget,
      isNaturalRaw,
      isExternalOverride,
      isPrimaryMaterial,
      recipeId: recipe?.id,
      recipeName: recipe?.name,
      installedMachines: !isExternalOverride ? solvedStage?.installedMachines : undefined,
      machineName: !isExternalOverride ? solvedStage?.machineName : undefined,
      ratePerSec,
      beltsRequired,
      repeatedRef: !isNaturalRaw && !isExternalOverride && (alreadyExpanded || inCycle),
      hiddenSubstepsCount,
      children,
    };
  };

  const roots: ChainNode[] = [];
  for (let i = 0; i < config.targets.length; i++) {
    const tgt = config.targets[i];
    const node = buildNode(tgt.itemId, 0, `root-${i}-${tgt.itemId}`, new Set());
    if (node) roots.push(node);
  }
  return roots;
}

/**
 * Computes rawResourceOverrides for common Train Grid / Bus presets
 * using the full un-pruned dependency chain of the current targets.
 */
export function computeChainPresetOverrides(
  index: PackIndex,
  config: PlanConfig,
  preset: 'full' | 'no-smelting' | 'direct-ingredients'
): string[] {
  if (preset === 'full' || config.targets.length === 0) {
    return [];
  }

  const targetIds = new Set(config.targets.map((t) => t.itemId));
  const overrides = new Set<string>();

  if (preset === 'direct-ingredients') {
    for (const t of config.targets) {
      const recipe = pickRecipeForItem(index, t.itemId, config);
      if (!recipe) continue;
      for (const ing of recipe.ingredients) {
        const res = index.resourcesById.get(ing.id);
        if (res && !res.isRawResource && !targetIds.has(ing.id)) {
          overrides.add(ing.id);
        }
      }
    }
    return Array.from(overrides);
  }

  // 'no-smelting': walk full chain and mark smelting / metallurgy / primary plates & base chemicals as external
  const visited = new Set<string>();
  const walk = (itemId: string) => {
    if (visited.has(itemId)) return;
    visited.add(itemId);

    const res = index.resourcesById.get(itemId);
    if (!res || res.isRawResource) return;

    const recipe = pickRecipeForItem(index, itemId, config);
    if (!recipe) return;

    const isPrimary =
      PRIMARY_MATERIAL_IDS.has(itemId) ||
      recipe.category === 'smelting' ||
      recipe.category === 'metallurgy';

    if (isPrimary && !targetIds.has(itemId)) {
      overrides.add(itemId);
      return; // stop expanding upstream of primary smelted materials
    }

    for (const ing of recipe.ingredients) {
      walk(ing.id);
    }
  };

  for (const t of config.targets) {
    walk(t.itemId);
  }

  return Array.from(overrides);
}
