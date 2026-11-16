/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MachineDef, PackIndex, RecipeDef } from '../data/schema.ts';
import type { PlanConfig } from './types.ts';

export interface DependencyGraph {
  /** Active recipe nodes selected for this production plan */
  recipes: Map<string, RecipeDef>;
  /** Item IDs treated as raw/external inputs */
  rawItems: Set<string>;
  /** Recipes grouped in topological order from raw -> final (Tarjan SCC condensation) */
  sccs: string[][];
  /** True if any SCC has >1 recipe, self-loop, or any recipe has >1 output */
  requiresMatrixSolver: boolean;
}

const DEFAULT_CANONICAL_RECIPES: Record<string, string> = {
  'iron-plate': 'iron-plate',
  'copper-plate': 'copper-plate',
  'steel-plate': 'steel-plate',
  'iron-gear-wheel': 'iron-gear-wheel',
  'copper-cable': 'copper-cable',
  'low-density-structure': 'low-density-structure',
  'petroleum-gas': 'advanced-oil-processing',
  'light-oil': 'advanced-oil-processing',
  'heavy-oil': 'advanced-oil-processing',
  'solid-fuel': 'solid-fuel-from-light-oil',
  'uranium-235': 'kovarex-enrichment-process',
  'uranium-238': 'uranium-processing',
  'molten-iron': 'molten-iron',
  'molten-copper': 'molten-copper',
  'kr-oxygen': 'kr-oxygen',
  'kr-nitrogen': 'kr-nitrogen',
  'kr-hydrogen': 'kr-hydrogen-from-atmosphere',
};

export function pickRecipeForItem(
  index: PackIndex,
  itemId: string,
  config: PlanConfig
): RecipeDef | null {
  const preferredId = config.preferredRecipes?.[itemId];
  if (preferredId) {
    const preferred = index.recipesById.get(preferredId);
    if (preferred && preferred.results.some((r) => r.id === itemId)) {
      return preferred;
    }
  }

  const candidates = index.recipesByProduct.get(itemId) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const canonicalId = DEFAULT_CANONICAL_RECIPES[itemId];
  if (canonicalId) {
    const canonical = candidates.find((c) => c.id === canonicalId);
    if (canonical) return canonical;
  }

  // Prefer recipes where mainProductId matches itemId and without coal liquefaction loop
  const direct = candidates.find(
    (c) => c.mainProductId === itemId && c.id !== 'coal-liquefaction'
  );
  return direct ?? candidates[0];
}

export function pickMachineForRecipe(
  index: PackIndex,
  recipe: RecipeDef,
  config: PlanConfig
): MachineDef {
  const overrideMachineId = config.stageOverrides?.[recipe.id]?.machineId;
  if (overrideMachineId) {
    const m = index.machinesById.get(overrideMachineId);
    if (m && m.craftingCategories.includes(recipe.category)) {
      return m;
    }
  }

  const defaultCatMachineId = config.defaultMachineByCategory?.[recipe.category];
  if (defaultCatMachineId) {
    const m = index.machinesById.get(defaultCatMachineId);
    if (m && m.craftingCategories.includes(recipe.category)) {
      return m;
    }
  }

  const compatible = index.machinesByCategory.get(recipe.category) ?? [];
  if (compatible.length === 0) {
    throw new Error(`No machine supports recipe category "${recipe.category}" for "${recipe.id}".`);
  }

  // Reasonable industrial defaults: Electric Furnace for smelting, Assembling Machine 2 for crafting
  if (recipe.category === 'smelting') {
    const electric = compatible.find((m) => m.id === 'electric-furnace');
    if (electric) return electric;
  }
  const tier2 = compatible.find((m) => m.id === 'assembling-machine-2');
  if (tier2) return tier2;

  return compatible[0];
}

/**
 * Recursively expands all recipe dependencies from targets back to raw resources
 * (or user rawResourceOverrides), then computes Strongly Connected Components (Tarjan)
 * ordered from raw inputs -> final products.
 */
export function buildDependencyGraph(
  index: PackIndex,
  config: PlanConfig
): DependencyGraph {
  const rawOverrides = new Set(config.rawResourceOverrides ?? []);
  const recipes = new Map<string, RecipeDef>();
  const rawItems = new Set<string>();
  const visitedItems = new Set<string>();

  const targetIds = new Set(config.targets.filter((t) => t.ratePerSec > 0).map((t) => t.itemId));
  const expandItem = (itemId: string) => {
    if (visitedItems.has(itemId)) return;
    visitedItems.add(itemId);

    const resource = index.resourcesById.get(itemId);
    if (!resource) return;

    if (resource.isRawResource || (rawOverrides.has(itemId) && !targetIds.has(itemId))) {
      rawItems.add(itemId);
      return;
    }

    const recipe = pickRecipeForItem(index, itemId, config);
    if (!recipe) {
      rawItems.add(itemId);
      return;
    }

    expandRecipe(recipe);
  };

  const expandRecipe = (recipe: RecipeDef) => {
    if (recipes.has(recipe.id)) return;
    recipes.set(recipe.id, recipe);

    for (const ing of recipe.ingredients) {
      expandItem(ing.id);
    }

    // If this recipe produces oil byproducts that can be cracked to satisfy other needs
    // inside the same plan, ensure cracking recipes are available for LP balancing
    if (recipe.id === 'advanced-oil-processing' || recipe.id === 'coal-liquefaction') {
      const heavyCrack = index.recipesById.get('heavy-oil-cracking');
      const lightCrack = index.recipesById.get('light-oil-cracking');
      if (heavyCrack && !recipes.has(heavyCrack.id)) expandRecipe(heavyCrack);
      if (lightCrack && !recipes.has(lightCrack.id)) expandRecipe(lightCrack);
    }
    // If Kovarex is selected, include uranium-processing as raw U-238 source when needed
    if (recipe.id === 'kovarex-enrichment-process') {
      const uProc = index.recipesById.get('uranium-processing');
      if (uProc && !recipes.has(uProc.id)) expandRecipe(uProc);
    }
  };

  for (const target of config.targets) {
    if (target.ratePerSec > 0) {
      expandItem(target.itemId);
    }
  }

  // Build directed recipe-to-recipe graph: edge (A -> B) means recipe A produces an item consumed by recipe B
  const adj = new Map<string, Set<string>>();
  for (const id of recipes.keys()) {
    adj.set(id, new Set());
  }

  for (const prodRecipe of recipes.values()) {
    for (const res of prodRecipe.results) {
      if (rawItems.has(res.id)) continue;
      for (const consRecipe of recipes.values()) {
        if (consRecipe.ingredients.some((ing) => ing.id === res.id)) {
          adj.get(prodRecipe.id)!.add(consRecipe.id);
        }
      }
    }
  }

  // Tarjan's SCC algorithm: outputs SCCs in reverse topological order (sinks first),
  // so reversing gives upstream (raw) -> downstream (final target) order.
  let clock = 0;
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const rawSccs: string[][] = [];

  const strongConnect = (v: string) => {
    disc.set(v, clock);
    low.set(v, clock);
    clock++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!disc.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, disc.get(w)!));
      }
    }

    if (low.get(v) === disc.get(v)) {
      const scc: string[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      rawSccs.push(scc);
    }
  };

  for (const id of recipes.keys()) {
    if (!disc.has(id)) strongConnect(id);
  }

  const sccs = rawSccs.reverse();

  let requiresMatrixSolver = false;
  for (const scc of sccs) {
    if (scc.length > 1) {
      requiresMatrixSolver = true;
      break;
    }
    const r = recipes.get(scc[0])!;
    if (r.results.length > 1 || adj.get(r.id)?.has(r.id)) {
      requiresMatrixSolver = true;
      break;
    }
  }

  // Also check if two different selected recipes produce the same item
  const producersPerItem = new Map<string, number>();
  for (const r of recipes.values()) {
    for (const res of r.results) {
      producersPerItem.set(res.id, (producersPerItem.get(res.id) ?? 0) + 1);
    }
  }
  for (const count of producersPerItem.values()) {
    if (count > 1) {
      requiresMatrixSolver = true;
      break;
    }
  }

  return {
    recipes,
    rawItems,
    sccs,
    requiresMatrixSolver,
  };
}
