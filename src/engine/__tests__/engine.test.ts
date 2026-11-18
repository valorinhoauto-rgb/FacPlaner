/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_PACK_ID, packRegistry } from '../../data/packRegistry.ts';
import { solveProductionPlan } from '../solver.ts';

describe('Fase 3 — Factorio Production Calculation Engine', () => {
  const index = packRegistry.getIndex(DEFAULT_PACK_ID);

  it('calculates exact classic 3:2 Electronic Circuit chain (15/s = 1 Yellow Belt)', () => {
    const result = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'electronic-circuit', ratePerSec: 15 }],
      defaultBeltId: 'transport-belt',
    });

    expect(result.solverUsed).toBe('dag');

    const circuitStage = result.stages.find((s) => s.recipeId === 'electronic-circuit')!;
    const cableStage = result.stages.find((s) => s.recipeId === 'copper-cable')!;
    const ironStage = result.stages.find((s) => s.recipeId === 'iron-plate')!;
    const copperStage = result.stages.find((s) => s.recipeId === 'copper-plate')!;

    // 15/s * 0.5s / 0.75 = 10 AM2s; 45 cables/s * 0.5s / 2 / 0.75 = 15 AM2s
    expect(circuitStage.theoreticalMachines).toBeCloseTo(10, 6);
    expect(circuitStage.installedMachines).toBe(10);
    expect(cableStage.theoreticalMachines).toBeCloseTo(15, 6);
    expect(cableStage.installedMachines).toBe(15);

    // 15 iron/s * 3.2s / 2 = 24 Electric Furnaces; 22.5 copper/s * 3.2s / 2 = 36 Electric Furnaces
    expect(ironStage.theoreticalMachines).toBeCloseTo(24, 6);
    expect(copperStage.theoreticalMachines).toBeCloseTo(36, 6);

    const rawIron = result.rawInputs.find((r) => r.itemId === 'iron-ore')!;
    const rawCopper = result.rawInputs.find((r) => r.itemId === 'copper-ore')!;
    expect(rawIron.theoreticalPerSec).toBeCloseTo(15, 6);
    expect(rawCopper.theoreticalPerSec).toBeCloseTo(22.5, 6);

    // Copper cable edge is 45/s > 15/s Yellow Belt -> triggers BELT_SATURATION alert
    expect(result.alerts.some((a) => a.code === 'BELT_SATURATION')).toBe(true);
  });

  it('balances Advanced Oil Processing + Cracking cleanly via Matrix LP solver for Processing Units', () => {
    const result = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'processing-unit', ratePerSec: 1 }],
      defaultBeltId: 'express-transport-belt',
    });

    expect(result.solverUsed).toBe('hybrid-matrix');

    const target = result.targetsSummary[0];
    expect(target.actualPerSec).toBeCloseTo(1, 5);
    expect(target.fulfillmentRatio).toBeCloseTo(1, 5);

    // 1 Processing Unit/s needs 47.5 petroleum gas/s -> 47.5 / 97.5 = 0.487179... cycles/s of Adv Oil
    const rawCrude = result.rawInputs.find((r) => r.itemId === 'crude-oil')!;
    expect(rawCrude.theoreticalPerSec).toBeCloseTo((47.5 / 97.5) * 100, 3);

    // Heavy oil and light oil are fully cracked with zero leftover surplus
    const heavyInter = result.intermediates.find((i) => i.itemId === 'heavy-oil')!;
    const lightInter = result.intermediates.find((i) => i.itemId === 'light-oil')!;
    expect(heavyInter.surplusPerSec).toBeCloseTo(0, 4);
    expect(lightInter.surplusPerSec).toBeCloseTo(0, 4);
  });

  it('handles Kovarex Enrichment catalyst loop and productivity exclusion accurately', () => {
    const result = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'uranium-235', ratePerSec: 0.1 }],
      stageOverrides: {
        'kovarex-enrichment-process': {
          moduleIds: ['productivity-module-3', 'productivity-module-3'], // +20% prod, -30% speed
        },
      },
    });

    const kovarex = result.stages.find((s) => s.recipeId === 'kovarex-enrichment-process')!;
    expect(kovarex.effectiveStats.productivityBonus).toBeCloseTo(0.2, 6);
    expect(kovarex.effectiveStats.speedMultiplier).toBeCloseTo(0.7, 6);

    // Net U-235 per cycle: 41 + 1*0.2 - 40 = 1.2 U-235/cycle (NOT 41*1.2!)
    const u235Out = kovarex.outputs.find((o) => o.itemId === 'uranium-235')!;
    expect(u235Out.perCycle).toBeCloseTo(41.2, 6);

    // Coupled balance:
    // uranium-processing gives 0.993 U-238 + 0.007 U-235 per cycle.
    // To supply 3 net U-238 per Kovarex cycle, u = (3 / 0.993) * k, contributing 0.021/0.993 U-235.
    // Total U-235 per Kovarex cycle = 1.2 + 0.021 / 0.993 = 1.221148036...
    const effectiveU235PerKovarexCycle = 1.2 + (3 * 0.007) / 0.993;
    expect(kovarex.theoreticalMachines).toBeCloseTo(
      0.1 / ((effectiveU235PerKovarexCycle * 0.7) / 60),
      6
    );
    expect(result.targetsSummary[0].actualPerSec).toBeCloseTo(0.1, 6);
  });

  it('applies Factorio 2.0 sqrt(n) beacon scaling and rejects invalid productivity modules', () => {
    const result = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'transport-belt', ratePerSec: 15 }],
      stageOverrides: {
        'transport-belt': {
          machineId: 'assembling-machine-3',
          // Prod modules are NOT allowed on transport-belt!
          moduleIds: ['productivity-module-3', 'speed-module-3'],
          beacon: {
            beaconId: 'beacon',
            count: 4,
            moduleIds: ['speed-module-3', 'speed-module-3'],
          },
        },
      },
    });

    const beltStage = result.stages.find((s) => s.recipeId === 'transport-belt')!;
    // Machine valid speed module: +0.5
    // 4 Beacons (2.0): 1.5 * sqrt(4) = 3.0 * (0.5 + 0.5) = +3.0
    // Total speed multiplier = 1 + 0.5 + 3.0 = 4.5
    expect(beltStage.effectiveStats.speedMultiplier).toBeCloseTo(4.5, 6);
    expect(beltStage.effectiveStats.productivityBonus).toBe(0);
    expect(result.alerts.some((a) => a.code === 'INVALID_MODULE')).toBe(true);
  });

  it('propagates starvation bottlenecks when a stage has fixed insufficient machines', () => {
    const result = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'electronic-circuit', ratePerSec: 15 }],
      rawResourceOverrides: ['iron-plate', 'copper-plate'],
      stageOverrides: {
        'copper-cable': {
          fixedMachineCount: 10, // Needs 15 for 15/s circuits -> 2/3 capacity
        },
      },
    });

    // Main bus override means iron-plate and copper-plate should be raw inputs (no furnaces)
    expect(result.stages.some((s) => s.recipeId === 'iron-plate')).toBe(false);
    expect(result.rawInputs.map((r) => r.itemId).sort()).toEqual(['copper-plate', 'iron-plate']);

    const circuitStage = result.stages.find((s) => s.recipeId === 'electronic-circuit')!;
    // 10 cable machines produce 30 cables/s -> feeds 10 green circuits/s across 10 circuit machines (66.7% util)
    expect(circuitStage.utilization).toBeCloseTo(2 / 3, 4);
    expect(result.targetsSummary[0].actualPerSec).toBeCloseTo(10, 4);
    expect(result.alerts.some((a) => a.code === 'STARVATION')).toBe(true);
  });

  it('respects alternative recipe choices (e.g. Solid Fuel from Petroleum Gas vs Light Oil)', () => {
    const fromLight = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'solid-fuel', ratePerSec: 5 }],
      preferredRecipes: { 'solid-fuel': 'solid-fuel-from-light-oil' },
    });
    const fromPetro = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'solid-fuel', ratePerSec: 5 }],
      preferredRecipes: {
        'solid-fuel': 'solid-fuel-from-petroleum-gas',
        'petroleum-gas': 'basic-oil-processing',
      },
    });

    expect(fromLight.stages.some((s) => s.recipeId === 'solid-fuel-from-light-oil')).toBe(true);
    expect(fromPetro.stages.some((s) => s.recipeId === 'solid-fuel-from-petroleum-gas')).toBe(true);
    expect(fromPetro.stages.some((s) => s.recipeId === 'basic-oil-processing')).toBe(true);
  });

  it('Fase 5 — calculates Space Age EM Plant (+50% base prod + beacons) and infinite research productivity', () => {
    const saIndex = packRegistry.getIndex('factorio-space-age-2.0');
    const result = solveProductionPlan(saIndex, {
      packId: 'factorio-space-age-2.0',
      targets: [{ itemId: 'electromagnetic-science-pack', ratePerSec: 1 }],
      defaultBeltId: 'turbo-transport-belt',
      researchProductivityBonuses: {
        'processing-unit': 0.3, // Level 3 infinite research (+30%)
      },
      stageOverrides: {
        'electromagnetic-science-pack': {
          machineId: 'electromagnetic-plant',
          moduleIds: [
            'productivity-module-3',
            'productivity-module-3',
            'productivity-module-3',
            'productivity-module-3',
            'productivity-module-3',
          ], // +50% modules + 50% EM base = +100% productivity!
        },
      },
    });

    const emStage = result.stages.find((s) => s.recipeId === 'electromagnetic-science-pack')!;
    expect(emStage.effectiveStats.productivityBonus).toBeCloseTo(1.0, 6);
    expect(result.targetsSummary[0].actualPerSec).toBeCloseTo(1, 5);
    // Supercapacitor demand should be halved (0.5/s instead of 1/s) due to 2.0x output multiplier
    const supCapStage = result.stages.find((s) => s.recipeId === 'supercapacitor')!;
    expect(supCapStage.outputs[0].theoreticalTotalPerSec).toBeCloseTo(0.5, 5);
  });

  it('Fase 5 — solves Space Age + Krastorio 2 Singularity Tech Card with zero-ingredient Atmospheric Condenser', () => {
    const k2Index = packRegistry.getIndex('factorio-space-age-krastorio2');
    const result = solveProductionPlan(k2Index, {
      packId: 'factorio-space-age-krastorio2',
      targets: [{ itemId: 'kr-singularity-tech-card', ratePerSec: 1 }],
      defaultBeltId: 'kr-superior-transport-belt',
      defaultInserterId: 'kr-superior-inserter',
    });

    expect(result.targetsSummary[0].actualPerSec).toBeCloseTo(1, 4);
    expect(result.stages.some((s) => s.recipeId === 'kr-ai-core')).toBe(true);
    expect(result.stages.some((s) => s.recipeId === 'kr-nitric-acid')).toBe(true);
    // Atmospheric condenser recipes (0 ingredients) must resolve cleanly
    expect(result.stages.some((s) => s.recipeId === 'kr-oxygen')).toBe(true);
    expect(result.stages.some((s) => s.recipeId === 'kr-nitrogen')).toBe(true);
    expect(result.rawInputs.some((r) => r.itemId === 'kr-imersite')).toBe(true);
    expect(result.rawInputs.some((r) => r.itemId === 'kr-rare-metal-ore')).toBe(true);
  });

  it('solves Krastorio 2 Spaced Out Military Tech Card using K2 overrides (Coke, Biomass, Silicon, Glass, Blank Card)', () => {
    const k2Index = packRegistry.getIndex('factorio-space-age-krastorio2');
    const result = solveProductionPlan(k2Index, {
      packId: 'factorio-space-age-krastorio2',
      targets: [{ itemId: 'military-science-pack', ratePerSec: 1 }],
      defaultBeltId: 'express-transport-belt',
    });

    expect(result.targetsSummary[0].actualPerSec).toBeCloseTo(1, 4);
    expect(result.stages.some((s) => s.recipeId === 'kr-electronic-components')).toBe(true);
    expect(result.stages.some((s) => s.recipeId === 'kr-blank-tech-card')).toBe(true);
    expect(result.stages.some((s) => s.recipeId === 'kr-biters-research-data')).toBe(true);
    expect(result.stages.some((s) => s.recipeId === 'kr-coke')).toBe(true);
    expect(result.stages.some((s) => s.recipeId === 'steel-plate')).toBe(true);
    // Must NOT pull in Vanilla Military Science ingredients (grenade / stone-wall / piercing rounds)
    expect(result.stages.some((s) => s.recipeId === 'grenade')).toBe(false);
    expect(result.stages.some((s) => s.recipeId === 'stone-wall')).toBe(false);
    expect(result.rawInputs.some((r) => r.itemId === 'kr-biomass')).toBe(true);
    expect(result.rawInputs.some((r) => r.itemId === 'coal')).toBe(true);
  });

  it('builds interactive dependency chains and collapses upstream steps when primary resources are set external', async () => {
    const { buildTargetChainTree, computeChainPresetOverrides } = await import(
      '../chainInspector.ts'
    );

    const baseConfig = {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'electronic-circuit', ratePerSec: 15 }],
      defaultBeltId: 'express-transport-belt',
    };

    const noSmelting = computeChainPresetOverrides(index, baseConfig, 'no-smelting');
    expect(noSmelting).toContain('iron-plate');
    expect(noSmelting).toContain('copper-plate');

    const prunedConfig = { ...baseConfig, rawResourceOverrides: noSmelting };
    const solved = solveProductionPlan(index, prunedConfig);
    const tree = buildTargetChainTree(index, prunedConfig, solved);

    expect(tree.length).toBe(1);
    const root = tree[0];
    expect(root.itemId).toBe('electronic-circuit');
    const ironNode = root.children.find((c) => c.itemId === 'iron-plate')!;
    expect(ironNode.isExternalOverride).toBe(true);
    expect(ironNode.children.length).toBe(0);
    expect(ironNode.hiddenSubstepsCount).toBeGreaterThanOrEqual(1);
  });

  it('solves large-scale ore mining (4x belts iron ore), uranium mining (sulfuric acid), and bulk plastic/LDS', () => {
    // 1. 4x Express Belts (180/s) Iron Ore extraction
    const orePlan = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'iron-ore', ratePerSec: 180 }],
      defaultBeltId: 'express-transport-belt',
    });
    const oreStage = orePlan.stages.find((s) => s.recipeId === 'mining-iron-ore')!;
    expect(oreStage).toBeDefined();
    expect(oreStage.machineId).toBe('electric-mining-drill');
    // 1 drill = 0.5 ore/s -> 180/s needs 360 electric mining drills
    expect(oreStage.installedMachines).toBe(360);
    expect(orePlan.targetsSummary[0].actualPerSec).toBeCloseTo(180, 4);

    // 2. Uranium ore extraction balances upstream sulfuric-acid chain!
    const uraniumPlan = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'uranium-ore', ratePerSec: 20 }],
      defaultBeltId: 'express-transport-belt',
    });
    expect(uraniumPlan.stages.some((s) => s.recipeId === 'mining-uranium-ore')).toBe(true);
    expect(uraniumPlan.stages.some((s) => s.recipeId === 'sulfuric-acid')).toBe(true);
    expect(uraniumPlan.rawInputs.some((r) => r.itemId === 'iron-ore')).toBe(true);
    expect(uraniumPlan.rawInputs.some((r) => r.itemId === 'water')).toBe(true);

    // 3. Large-scale Plastic Bar (180/s) + LDS (90/s)
    const ldsPlan = solveProductionPlan(index, {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'low-density-structure', ratePerSec: 90 }],
      defaultBeltId: 'express-transport-belt',
    });
    expect(ldsPlan.targetsSummary[0].actualPerSec).toBeCloseTo(90, 2);
    expect(ldsPlan.stages.some((s) => s.recipeId === 'plastic-bar')).toBe(true);
    expect(ldsPlan.stages.some((s) => s.recipeId === 'steel-plate')).toBe(true);
  });
});
