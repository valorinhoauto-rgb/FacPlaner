/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { importFactorioDump, type FactorioDataRawDump } from '../dumpImporter.ts';
import { buildCraftableGroupCatalog } from '../groupCatalog.ts';
import { VANILLA_2_0_PACK } from '../packs/vanilla-2.0.ts';
import { DEFAULT_PACK_ID, packRegistry } from '../packRegistry.ts';
import { buildPackIndex, validateGameDataPack } from '../validator.ts';

describe('Fase 2 — Factorio Game Database & Validation', () => {
  it('validates the built-in Vanilla 2.0 pack with zero errors and zero warnings', () => {
    const result = validateGameDataPack(VANILLA_2_0_PACK);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.stats.items).toBeGreaterThan(50);
    expect(result.stats.fluids).toBe(8);
    expect(result.stats.recipes).toBeGreaterThan(45);
    expect(result.stats.machines).toBeGreaterThanOrEqual(10);
  });

  it('builds complete relational PackIndex lookups (alternative recipes, machines, tech)', () => {
    const index = packRegistry.getIndex(DEFAULT_PACK_ID);

    // Alternative recipes for Solid Fuel (light oil, petroleum gas, heavy oil)
    const solidFuelRecipes = index.recipesByProduct.get('solid-fuel') ?? [];
    expect(solidFuelRecipes.map((r) => r.id).sort()).toEqual([
      'solid-fuel-from-heavy-oil',
      'solid-fuel-from-light-oil',
      'solid-fuel-from-petroleum-gas',
    ]);

    // Multiple recipes producing petroleum-gas (basic, advanced, coal liquefaction, light oil cracking)
    const petroRecipes = index.recipesByProduct.get('petroleum-gas') ?? [];
    expect(petroRecipes.length).toBe(4);

    // Compatible machines for crafting-with-fluid sorted by craftingSpeed
    const fluidCrafters = index.machinesByCategory.get('crafting-with-fluid') ?? [];
    expect(fluidCrafters.map((m) => m.id)).toEqual([
      'assembling-machine-2',
      'assembling-machine-3',
    ]);

    // Technology unlock lookup
    const techsForProcessingUnit = index.techsUnlockingRecipe.get('processing-unit') ?? [];
    expect(techsForProcessingUnit.map((t) => t.id)).toContain('processing-unit');
  });

  it('matches official Factorio 2.0 prototype numbers accurately', () => {
    const index = packRegistry.getIndex(DEFAULT_PACK_ID);

    const greenCircuit = index.recipesById.get('electronic-circuit')!;
    expect(greenCircuit.energyRequired).toBe(0.5);
    expect(greenCircuit.ingredients).toEqual([
      { id: 'iron-plate', type: 'item', amount: 1 },
      { id: 'copper-cable', type: 'item', amount: 3 },
    ]);

    const sulfuricAcid = index.recipesById.get('sulfuric-acid')!;
    expect(sulfuricAcid.ingredients).toEqual([
      { id: 'sulfur', type: 'item', amount: 5 },
      { id: 'iron-plate', type: 'item', amount: 1 },
      { id: 'water', type: 'fluid', amount: 100 },
    ]);
    expect(sulfuricAcid.results[0].amount).toBe(50);

    const advOil = index.recipesById.get('advanced-oil-processing')!;
    expect(advOil.results.map((r) => [r.id, r.amount])).toEqual([
      ['heavy-oil', 25],
      ['light-oil', 45],
      ['petroleum-gas', 55],
    ]);

    const lds = index.recipesById.get('low-density-structure')!;
    expect(lds.energyRequired).toBe(15.0);

    const rocketFuel = index.recipesById.get('rocket-fuel')!;
    expect(rocketFuel.energyRequired).toBe(15.0);

    const furnace = index.machinesById.get('electric-furnace')!;
    expect(furnace.craftingSpeed).toBe(2.0);
    expect(furnace.moduleSlots).toBe(2);
    expect(furnace.tileSize).toEqual({ width: 3, height: 3 });

    const expressBelt = index.beltsById.get('express-transport-belt')!;
    expect(expressBelt.throughputPerSec).toBe(45);
  });

  it('imports official Factorio 2.0 / modded data-raw-dump.json accurately', () => {
    const mockModDump: FactorioDataRawDump = {
      resource: {
        'kr-rare-metals': { type: 'resource', name: 'kr-rare-metals' },
      },
      item: {
        'kr-rare-metals': { type: 'item', subgroup: 'raw-resource', stack_size: 50 },
        'kr-enriched-iron': { type: 'item', subgroup: 'raw-material', stack_size: 100 },
        'kr-electronic-component': { type: 'item', subgroup: 'intermediate-product', stack_size: 200 },
      },
      fluid: {
        'kr-hydrogen-chloride': {
          type: 'fluid',
          default_temperature: 25,
          max_temperature: 100,
        },
      },
      recipe: {
        'kr-enriched-iron': {
          type: 'recipe',
          category: 'chemistry',
          energy_required: 3,
          ingredients: [
            { type: 'item', name: 'kr-rare-metals', amount: 9 },
            { type: 'fluid', name: 'kr-hydrogen-chloride', amount: 3 },
          ],
          results: [{ type: 'item', name: 'kr-enriched-iron', amount: 6 }],
          allow_productivity: true,
        },
        'kr-electronic-component': {
          type: 'recipe',
          // Omit energy_required to verify Factorio's 0.5s default
          ingredients: [{ type: 'item', name: 'kr-enriched-iron', amount: 2 }],
          results: [{ type: 'item', name: 'kr-electronic-component', amount: 1 }],
        },
      },
      'assembling-machine': {
        'kr-advanced-assembling-machine': {
          type: 'assembling-machine',
          crafting_categories: ['crafting', 'chemistry'],
          crafting_speed: 5,
          module_slots: 4,
          energy_usage: '1.2MW',
          collision_box: [[-2.2, -2.2], [2.2, 2.2]],
          effect_receiver: { base_effect: { productivity: 0.25 } },
        },
      },
      'transport-belt': {
        'kr-superior-transport-belt': {
          type: 'transport-belt',
          speed: 0.1875, // 90 items/s
        },
      },
      inserter: {
        'kr-superior-inserter': {
          type: 'inserter',
          rotation_speed: 0.04,
          pickup_position: [0, -1],
        },
      },
      module: {
        'speed-module-mk4': {
          type: 'module',
          category: 'speed',
          tier: 4,
          effect: { speed: 0.8, consumption: 0.9 },
        },
      },
      beacon: {
        'kr-singularity-beacon': {
          type: 'beacon',
          module_slots: 2,
          distribution_effectivity: 1.5,
          energy_usage: '800kW',
          collision_box: [[-1.7, -1.7], [1.7, 1.7]],
        },
      },
      technology: {
        'kr-advanced-tech': {
          type: 'technology',
          prerequisites: [],
          effects: [{ type: 'unlock-recipe', recipe: 'kr-electronic-component' }],
        },
      },
    };

    const pack = importFactorioDump(mockModDump, {
      packId: 'krastorio-sample',
      packName: 'Krastorio Sample',
      rulesVersion: '2.0',
      mods: [{ name: 'Krastorio2', version: '2.0.0' }],
    });

    const validation = validateGameDataPack(pack);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const index = buildPackIndex(pack);
    expect(index.recipesById.get('kr-electronic-component')?.energyRequired).toBe(0.5);

    const advMachine = index.machinesById.get('kr-advanced-assembling-machine')!;
    expect(advMachine.tileSize).toEqual({ width: 5, height: 5 });
    expect(advMachine.energyUsageKw).toBe(1200);
    expect(advMachine.baseProductivity).toBe(0.25);

    const superiorBelt = index.beltsById.get('kr-superior-transport-belt')!;
    expect(superiorBelt.throughputPerSec).toBe(90);
  });

  it('catches referential integrity errors and circular technology dependencies', () => {
    const brokenPack = structuredClone(VANILLA_2_0_PACK);
    brokenPack.recipes.push({
      id: 'broken-recipe',
      name: 'Broken',
      category: 'crafting',
      subgroup: 'intermediate-product',
      energyRequired: 1,
      ingredients: [{ id: 'non-existent-item', type: 'item', amount: 1 }],
      results: [{ id: 'iron-plate', type: 'item', amount: 1, probability: 1 }],
      mainProductId: 'iron-plate',
      allowProductivity: false,
      enabledByDefault: true,
    });
    brokenPack.technologies[0].prerequisites = ['logistics'];
    brokenPack.technologies[1].prerequisites = ['automation'];

    const result = validateGameDataPack(brokenPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_RESOURCE')).toBe(true);
    expect(result.errors.some((e) => e.code === 'CIRCULAR_TECH_TREE')).toBe(true);
  });

  it('Fase 5 — validates built-in Space Age (DLC) and Space Age + Krastorio 2 packs cleanly', () => {
    const saIndex = packRegistry.getIndex('factorio-space-age-2.0');
    const saValidation = validateGameDataPack(saIndex.pack);
    expect(saValidation.errors).toEqual([]);
    expect(saValidation.valid).toBe(true);
    expect(saIndex.machinesById.get('foundry')?.baseProductivity).toBe(0.5);
    expect(saIndex.machinesById.get('electromagnetic-plant')?.moduleSlots).toBe(5);
    expect(saIndex.beltsById.get('turbo-transport-belt')?.throughputPerSec).toBe(60);

    const k2Index = packRegistry.getIndex('factorio-space-age-krastorio2');
    const k2Validation = validateGameDataPack(k2Index.pack);
    expect(k2Validation.errors).toEqual([]);
    expect(k2Validation.valid).toBe(true);
    expect(k2Index.machinesById.get('kr-crusher')?.tileSize).toEqual({ width: 7, height: 7 });
    expect(k2Index.beltsById.get('kr-superior-transport-belt')?.throughputPerSec).toBe(90);
    expect(k2Index.beaconsById.get('kr-singularity-beacon')?.distributionEffectivity).toBe(1.5);
  });

  it('Fase 5 — extracts iconPath, electric poles, localised_name arrays, and recipe productivity tech from Factorio 2.0 dumps', () => {
    const dump20 = {
      item: {
        'parameter-0': { type: 'item', parameter: true, stack_size: 1 },
        'holmium-plate': {
          type: 'item',
          localised_name: ['item-name.holmium-plate'],
          icon: '__space-age__/graphics/icons/holmium-plate.png',
          stack_size: 100,
        },
        'supercapacitor': {
          type: 'item',
          icons: [{ icon: '__space-age__/graphics/icons/supercapacitor.png' }],
          stack_size: 100,
        },
      },
      recipe: {
        'supercapacitor': {
          type: 'recipe',
          category: 'electromagnetics',
          energy_required: 10,
          ingredients: [{ type: 'item', name: 'holmium-plate', amount: 2 }],
          results: [{ type: 'item', name: 'supercapacitor', amount: 1 }],
          allow_productivity: true,
        },
      },
      'assembling-machine': {
        'electromagnetic-plant': {
          type: 'assembling-machine',
          crafting_categories: ['electromagnetics'],
          crafting_speed: 2,
          module_slots: 5,
          energy_usage: '2MW',
          emissions_per_minute: { pollution: 4 },
          collision_box: [[-1.7, -1.7], [1.7, 1.7]],
          effect_receiver: { base_effect: { productivity: 0.5 } },
          icon: '__space-age__/graphics/icons/electromagnetic-plant.png',
        },
      },
      'electric-pole': {
        'substation': {
          type: 'electric-pole',
          maximum_wire_distance: 18,
          supply_area_distance: 9,
          collision_box: [[-0.7, -0.7], [0.7, 0.7]],
          icon: '__base__/graphics/icons/substation.png',
        },
      },
      technology: {
        'steel-plate-productivity': {
          type: 'technology',
          prerequisites: [],
          effects: [{ type: 'change-recipe-productivity', recipe: 'supercapacitor', change: 0.1 }],
        },
      },
    } as unknown as FactorioDataRawDump;

    const pack = importFactorioDump(dump20, {
      packId: 'sa-dump-test',
      packName: 'SA Dump Test',
      rulesVersion: '2.0',
    });

    // parameter-0 should be excluded
    expect(pack.items.some((i) => i.id === 'parameter-0')).toBe(false);
    // localised_name array should cleanly humanize ID instead of crashing or stringifying
    const holmium = pack.items.find((i) => i.id === 'holmium-plate')!;
    expect(holmium.name).toBe('Holmium Plate');
    expect(holmium.iconPath).toBe('__space-age__/graphics/icons/holmium-plate.png');

    // Electric pole & Space Age mod auto-detection
    expect(pack.electricPoles?.find((p) => p.id === 'substation')?.tileSize).toEqual({
      width: 2,
      height: 2,
    });
    expect(pack.mods.some((m) => m.name === 'space-age')).toBe(true);

    // Recipe productivity infinite bonus parsed
    const prodTech = pack.technologies.find((t) => t.id === 'steel-plate-productivity')!;
    expect(prodTech.recipeProductivityBonus).toEqual({
      recipeIds: ['supercapacitor'],
      bonusPerLevel: 0.1,
      maxLevels: undefined,
    });
  });

  it('organizes Vanilla, Space Age, Krastorio 2, and custom item-group dumps into Factorio crafting tabs', () => {
    // 1. Space Age + Krastorio 2 places modded items in their respective canonical groups
    const k2Index = packRegistry.getIndex('factorio-space-age-krastorio2');
    const k2Catalog = buildCraftableGroupCatalog(k2Index);

    const logistics = k2Catalog.find((g) => g.id === 'logistics')!;
    const production = k2Catalog.find((g) => g.id === 'production')!;
    const intermediates = k2Catalog.find((g) => g.id === 'intermediate-products')!;
    const space = k2Catalog.find((g) => g.id === 'space')!;

    expect(logistics.subgroups.find((s) => s.id === 'belt')?.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['transport-belt', 'express-transport-belt', 'turbo-transport-belt', 'kr-superior-transport-belt'])
    );
    expect(production.subgroups.find((s) => s.id === 'production-machine')?.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['assembling-machine-3', 'foundry', 'electromagnetic-plant'])
    );
    expect(intermediates.subgroups.find((s) => s.id === 'science-pack')?.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['automation-science-pack', 'metallurgic-science-pack', 'kr-singularity-tech-card'])
    );
    expect(space.subgroups.find((s) => s.id === 'fulgora-processes')?.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['holmium-plate', 'superconductor', 'supercapacitor'])
    );

    // 2. Custom dump with explicit item-group and item-subgroup
    const customDump: FactorioDataRawDump = {
      'item-group': {
        'kr-smelting': {
          type: 'item-group',
          order: 'c-2',
          icon: '__Krastorio2Assets__/icons/item-groups/smelting.png',
        },
      },
      'item-subgroup': {
        'kr-enriched-plates': {
          type: 'item-subgroup',
          group: 'kr-smelting',
          order: 'a',
        },
      },
      item: {
        'kr-enriched-plate': {
          type: 'item',
          subgroup: 'kr-enriched-plates',
          stack_size: 100,
          icon: '__Krastorio2Assets__/icons/items/enriched-iron.png',
        },
      },
      recipe: {
        'kr-enriched-plate': {
          type: 'recipe',
          // subgroup omitted intentionally -> inherits from main product item
          ingredients: [],
          results: [{ type: 'item', name: 'kr-enriched-plate', amount: 1 }],
        },
      },
    };

    const customPack = importFactorioDump(customDump, {
      packId: 'custom-groups-test',
      packName: 'Custom Groups Test',
    });
    expect(customPack.itemGroups?.some((g) => g.id === 'kr-smelting')).toBe(true);
    expect(customPack.itemSubgroups?.some((s) => s.id === 'kr-enriched-plates')).toBe(true);

    const customCatalog = buildCraftableGroupCatalog(buildPackIndex(customPack));
    const krGroup = customCatalog.find((g) => g.id === 'kr-smelting')!;
    expect(krGroup).toBeDefined();
    expect(krGroup.subgroups[0].items[0].id).toBe('kr-enriched-plate');
    expect(krGroup.subgroups[0].items[0].modOrigin).toBe('Krastorio 2');
  });
});
