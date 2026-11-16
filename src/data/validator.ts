/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BeaconDef,
  BeltDef,
  FluidDef,
  GameDataPack,
  InserterDef,
  ItemDef,
  MachineDef,
  ModuleDef,
  PackIndex,
  RecipeDef,
  ResourceDef,
  TechnologyDef,
} from './schema.ts';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code:
    | 'DUPLICATE_ID'
    | 'MISSING_RESOURCE'
    | 'UNSUPPORTED_RECIPE_CATEGORY'
    | 'INVALID_CRAFTING_TIME'
    | 'INVALID_MACHINE_STATS'
    | 'MISSING_TECH_PREREQUISITE'
    | 'MISSING_UNLOCKED_RECIPE'
    | 'CIRCULAR_TECH_TREE'
    | 'INVALID_TILE_SIZE'
    | 'INVALID_BELT_SPEED';
  entityType: string;
  entityId: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    items: number;
    fluids: number;
    recipes: number;
    machines: number;
    belts: number;
    inserters: number;
    modules: number;
    beacons: number;
    technologies: number;
  };
}

export function validateGameDataPack(pack: GameDataPack): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const itemIds = new Set<string>();
  const fluidIds = new Set<string>();
  const recipeIds = new Set<string>();
  const machineCategories = new Set<string>();
  const techIds = new Set<string>();

  for (const item of pack.items) {
    if (itemIds.has(item.id)) {
      errors.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        entityType: 'item',
        entityId: item.id,
        message: `Duplicate item id "${item.id}".`,
      });
    }
    itemIds.add(item.id);
  }

  for (const fluid of pack.fluids) {
    if (fluidIds.has(fluid.id) || itemIds.has(fluid.id)) {
      errors.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        entityType: 'fluid',
        entityId: fluid.id,
        message: `Duplicate fluid/resource id "${fluid.id}".`,
      });
    }
    fluidIds.add(fluid.id);
  }

  for (const machine of pack.machines) {
    if (machine.craftingSpeed <= 0) {
      errors.push({
        severity: 'error',
        code: 'INVALID_MACHINE_STATS',
        entityType: 'machine',
        entityId: machine.id,
        message: `Machine "${machine.id}" must have craftingSpeed > 0.`,
      });
    }
    if (machine.tileSize.width <= 0 || machine.tileSize.height <= 0) {
      errors.push({
        severity: 'error',
        code: 'INVALID_TILE_SIZE',
        entityType: 'machine',
        entityId: machine.id,
        message: `Machine "${machine.id}" has invalid tileSize.`,
      });
    }
    for (const cat of machine.craftingCategories) {
      machineCategories.add(cat);
    }
  }

  for (const belt of pack.belts) {
    if (belt.throughputPerSec <= 0 || belt.speedTilesPerSec <= 0) {
      errors.push({
        severity: 'error',
        code: 'INVALID_BELT_SPEED',
        entityType: 'belt',
        entityId: belt.id,
        message: `Belt "${belt.id}" must have positive throughput and speed.`,
      });
    }
  }

  for (const recipe of pack.recipes) {
    if (recipeIds.has(recipe.id)) {
      errors.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        entityType: 'recipe',
        entityId: recipe.id,
        message: `Duplicate recipe id "${recipe.id}".`,
      });
    }
    recipeIds.add(recipe.id);

    if (recipe.energyRequired <= 0) {
      errors.push({
        severity: 'error',
        code: 'INVALID_CRAFTING_TIME',
        entityType: 'recipe',
        entityId: recipe.id,
        message: `Recipe "${recipe.id}" must have energyRequired > 0.`,
      });
    }

    if (!machineCategories.has(recipe.category)) {
      warnings.push({
        severity: 'warning',
        code: 'UNSUPPORTED_RECIPE_CATEGORY',
        entityType: 'recipe',
        entityId: recipe.id,
        message: `Recipe "${recipe.id}" category "${recipe.category}" has no registered machine.`,
      });
    }

    for (const ing of recipe.ingredients) {
      const exists = ing.type === 'fluid' ? fluidIds.has(ing.id) : itemIds.has(ing.id);
      if (!exists) {
        errors.push({
          severity: 'error',
          code: 'MISSING_RESOURCE',
          entityType: 'recipe',
          entityId: recipe.id,
          message: `Recipe "${recipe.id}" ingredient "${ing.id}" (${ing.type}) not found.`,
        });
      }
    }

    for (const res of recipe.results) {
      const exists = res.type === 'fluid' ? fluidIds.has(res.id) : itemIds.has(res.id);
      if (!exists) {
        errors.push({
          severity: 'error',
          code: 'MISSING_RESOURCE',
          entityType: 'recipe',
          entityId: recipe.id,
          message: `Recipe "${recipe.id}" result "${res.id}" (${res.type}) not found.`,
        });
      }
    }
  }

  for (const tech of pack.technologies) {
    techIds.add(tech.id);
  }

  for (const tech of pack.technologies) {
    for (const prereq of tech.prerequisites) {
      if (!techIds.has(prereq)) {
        errors.push({
          severity: 'error',
          code: 'MISSING_TECH_PREREQUISITE',
          entityType: 'technology',
          entityId: tech.id,
          message: `Technology "${tech.id}" prerequisite "${prereq}" not found.`,
        });
      }
    }
    for (const unlocked of tech.unlockedRecipes) {
      if (!recipeIds.has(unlocked)) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_UNLOCKED_RECIPE',
          entityType: 'technology',
          entityId: tech.id,
          message: `Technology "${tech.id}" unlocks recipe "${unlocked}" which is not in the pack.`,
        });
      }
    }
  }

  // Detect circular technology prerequisites via DFS
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const techMap = new Map(pack.technologies.map((t) => [t.id, t]));
  const hasCycle = (id: string): boolean => {
    const state = visitState.get(id);
    if (state === 'visiting') return true;
    if (state === 'visited') return false;
    visitState.set(id, 'visiting');
    const tech = techMap.get(id);
    if (tech) {
      for (const prereq of tech.prerequisites) {
        if (techMap.has(prereq) && hasCycle(prereq)) {
          return true;
        }
      }
    }
    visitState.set(id, 'visited');
    return false;
  };

  for (const tech of pack.technologies) {
    if (hasCycle(tech.id)) {
      errors.push({
        severity: 'error',
        code: 'CIRCULAR_TECH_TREE',
        entityType: 'technology',
        entityId: tech.id,
        message: `Circular prerequisite detected involving technology "${tech.id}".`,
      });
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      items: pack.items.length,
      fluids: pack.fluids.length,
      recipes: pack.recipes.length,
      machines: pack.machines.length,
      belts: pack.belts.length,
      inserters: pack.inserters.length,
      modules: pack.modules.length,
      beacons: pack.beacons.length,
      technologies: pack.technologies.length,
    },
  };
}

export function buildPackIndex(pack: GameDataPack): PackIndex {
  const itemsById = new Map<string, ItemDef>();
  const fluidsById = new Map<string, FluidDef>();
  const resourcesById = new Map<string, ResourceDef>();
  const recipesById = new Map<string, RecipeDef>();
  const machinesById = new Map<string, MachineDef>();
  const beltsById = new Map<string, BeltDef>();
  const insertersById = new Map<string, InserterDef>();
  const modulesById = new Map<string, ModuleDef>();
  const beaconsById = new Map<string, BeaconDef>();
  const technologiesById = new Map<string, TechnologyDef>();

  const recipesByProduct = new Map<string, RecipeDef[]>();
  const recipesByIngredient = new Map<string, RecipeDef[]>();
  const machinesByCategory = new Map<string, MachineDef[]>();
  const techsUnlockingRecipe = new Map<string, TechnologyDef[]>();

  for (const item of pack.items) {
    itemsById.set(item.id, item);
    resourcesById.set(item.id, item);
  }
  for (const fluid of pack.fluids) {
    fluidsById.set(fluid.id, fluid);
    resourcesById.set(fluid.id, fluid);
  }
  for (const recipe of pack.recipes) {
    recipesById.set(recipe.id, recipe);
    for (const res of recipe.results) {
      const list = recipesByProduct.get(res.id) ?? [];
      list.push(recipe);
      recipesByProduct.set(res.id, list);
    }
    for (const ing of recipe.ingredients) {
      const list = recipesByIngredient.get(ing.id) ?? [];
      list.push(recipe);
      recipesByIngredient.set(ing.id, list);
    }
  }
  for (const machine of pack.machines) {
    machinesById.set(machine.id, machine);
    for (const cat of machine.craftingCategories) {
      const list = machinesByCategory.get(cat) ?? [];
      list.push(machine);
      machinesByCategory.set(cat, list);
    }
  }
  // Sort machines per category by craftingSpeed ascending for predictable defaults
  for (const [cat, list] of machinesByCategory.entries()) {
    list.sort((a, b) => a.craftingSpeed - b.craftingSpeed);
    machinesByCategory.set(cat, list);
  }

  for (const belt of pack.belts) beltsById.set(belt.id, belt);
  for (const inserter of pack.inserters) insertersById.set(inserter.id, inserter);
  for (const mod of pack.modules) modulesById.set(mod.id, mod);
  for (const beacon of pack.beacons) beaconsById.set(beacon.id, beacon);
  for (const tech of pack.technologies) {
    technologiesById.set(tech.id, tech);
    for (const recipeId of tech.unlockedRecipes) {
      const list = techsUnlockingRecipe.get(recipeId) ?? [];
      list.push(tech);
      techsUnlockingRecipe.set(recipeId, list);
    }
  }

  return {
    pack,
    itemsById,
    fluidsById,
    resourcesById,
    recipesById,
    machinesById,
    beltsById,
    insertersById,
    modulesById,
    beaconsById,
    technologiesById,
    recipesByProduct,
    recipesByIngredient,
    machinesByCategory,
    techsUnlockingRecipe,
  };
}
