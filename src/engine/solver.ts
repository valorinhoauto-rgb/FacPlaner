/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackIndex } from '../data/schema.ts';
import { analyzeBottlenecks } from './bottleneckAnalyzer.ts';
import { buildDependencyGraph, pickMachineForRecipe } from './graphBuilder.ts';
import {
  computeMachineEffectiveStats,
  getIngredientPerCycle,
  getResultPerCycle,
} from './machineMath.ts';
import { solveLinearBalance } from './solvers/linearSolver.ts';
import type {
  FlowEdge,
  MachineEffectiveStats,
  PlanConfig,
  SolveResult,
  SolvedStage,
  StageFlowItem,
} from './types.ts';

const EPS = 1e-9;

interface StageBlueprint {
  recipeId: string;
  machineId: string;
  moduleIds: string[];
  stats: MachineEffectiveStats;
  perCycleIn: Map<string, number>;
  perCycleOut: Map<string, number>;
}

/**
 * Main calculation engine entrypoint.
 * Solves recursive DAGs and cyclic/multi-product blocks (via Two-Phase Simplex LP),
 * then performs a real-capacity forward pass for integer/fixed machine counts.
 */
export function solveProductionPlan(index: PackIndex, config: PlanConfig): SolveResult {
  const defaultBelt =
    index.beltsById.get(config.defaultBeltId ?? 'transport-belt') ??
    index.pack.belts[0];
  const defaultInserter =
    index.insertersById.get(config.defaultInserterId ?? 'fast-inserter') ??
    index.pack.inserters[0];

  const graph = buildDependencyGraph(index, config);

  if (graph.recipes.size === 0 || config.targets.length === 0) {
    return {
      packId: index.pack.id,
      stages: [],
      edges: [],
      rawInputs: [],
      intermediates: [],
      targetsSummary: config.targets.map((t) => ({
        itemId: t.itemId,
        requestedPerSec: t.ratePerSec,
        theoreticalPerSec: 0,
        actualPerSec: 0,
        fulfillmentRatio: 0,
      })),
      machineTotals: [],
      totalPowerKw: 0,
      totalPollutionPerMin: 0,
      alerts: [],
      solverUsed: 'dag',
    };
  }

  // Order recipes from upstream (raw) to downstream (targets) via Tarjan SCCs
  const orderedRecipeIds = graph.sccs.flat();
  const blueprints = new Map<string, StageBlueprint>();

  for (const recipeId of orderedRecipeIds) {
    const recipe = graph.recipes.get(recipeId)!;
    const machine = pickMachineForRecipe(index, recipe, config);
    const override = config.stageOverrides?.[recipeId];
    const moduleIds = override?.moduleIds ?? [];
    const researchProd = config.researchProductivityBonuses?.[recipeId] ?? 0;

    const stats = computeMachineEffectiveStats(
      index,
      recipe,
      machine,
      moduleIds,
      override?.beacon,
      researchProd
    );

    const perCycleIn = new Map<string, number>();
    for (const ing of recipe.ingredients) {
      perCycleIn.set(ing.id, (perCycleIn.get(ing.id) ?? 0) + getIngredientPerCycle(ing));
    }
    const perCycleOut = new Map<string, number>();
    for (const res of recipe.results) {
      perCycleOut.set(
        res.id,
        (perCycleOut.get(res.id) ?? 0) + getResultPerCycle(res, stats.productivityBonus)
      );
    }

    blueprints.set(recipeId, {
      recipeId,
      machineId: machine.id,
      moduleIds,
      stats,
      perCycleIn,
      perCycleOut,
    });
  }

  // --- PASS 1: THEORETICAL SOLVE (cycles/s for each recipe) ---
  const theoreticalCyclesPerSec = new Map<string, number>();
  const targetMap = new Map<string, number>();
  for (const t of config.targets) {
    targetMap.set(t.itemId, (targetMap.get(t.itemId) ?? 0) + t.ratePerSec);
  }

  if (!graph.requiresMatrixSolver) {
    // Fast exact top-down DAG propagation (downstream -> upstream)
    const itemDemand = new Map<string, number>(targetMap);
    for (let i = orderedRecipeIds.length - 1; i >= 0; i--) {
      const recipeId = orderedRecipeIds[i];
      const bp = blueprints.get(recipeId)!;
      const recipe = graph.recipes.get(recipeId)!;
      const outRes = recipe.results[0];
      const netPerCycle = (bp.perCycleOut.get(outRes.id) ?? 0) - (bp.perCycleIn.get(outRes.id) ?? 0);
      const demanded = itemDemand.get(outRes.id) ?? 0;
      const cyclesPerSec = netPerCycle > EPS && demanded > EPS ? demanded / netPerCycle : 0;
      theoreticalCyclesPerSec.set(recipeId, cyclesPerSec);

      for (const [ingId, perCycleAmt] of bp.perCycleIn.entries()) {
        if (ingId === outRes.id) continue;
        itemDemand.set(ingId, (itemDemand.get(ingId) ?? 0) + cyclesPerSec * perCycleAmt);
      }
    }
  } else {
    // Hybrid Matrix / Two-Phase Simplex LP Solver for co-products and cycles
    const nonRawItemsSet = new Set<string>();
    for (const recipeId of orderedRecipeIds) {
      const bp = blueprints.get(recipeId)!;
      for (const id of bp.perCycleOut.keys()) {
        if (!graph.rawItems.has(id)) nonRawItemsSet.add(id);
      }
      for (const id of bp.perCycleIn.keys()) {
        if (!graph.rawItems.has(id)) nonRawItemsSet.add(id);
      }
    }
    const nonRawItems = Array.from(nonRawItemsSet);
    const numVars = orderedRecipeIds.length;
    const matrix: number[][] = nonRawItems.map((itemId) =>
      orderedRecipeIds.map((recipeId) => {
        const bp = blueprints.get(recipeId)!;
        return (bp.perCycleOut.get(itemId) ?? 0) - (bp.perCycleIn.get(itemId) ?? 0);
      })
    );
    const demands = nonRawItems.map((itemId) => targetMap.get(itemId) ?? 0);

    // Slight cost preference against cracking/coal-liquefaction unless needed to balance
    const varCosts = orderedRecipeIds.map((recipeId) => {
      if (recipeId.includes('cracking')) return 2.0;
      if (recipeId === 'coal-liquefaction') return 5.0;
      return 1.0;
    });
    const surplusPenalties = nonRawItems.map(() => 1000.0);

    const lpSol = solveLinearBalance({
      numVars,
      matrix,
      demands,
      varCosts,
      surplusPenalties,
    });

    orderedRecipeIds.forEach((recipeId, idx) => {
      theoreticalCyclesPerSec.set(recipeId, lpSol.feasible ? lpSol.vars[idx] : 0);
    });
  }

  // --- PASS 2: INSTALLED MACHINES & REAL FORWARD FLOW PROPAGATION ---
  const installedMachinesMap = new Map<string, number>();
  const isFixedMap = new Map<string, boolean>();
  for (const recipeId of orderedRecipeIds) {
    const bp = blueprints.get(recipeId)!;
    const thCycles = theoreticalCyclesPerSec.get(recipeId) ?? 0;
    const thMachines =
      bp.stats.cyclesPerSecPerMachine > EPS ? thCycles / bp.stats.cyclesPerSecPerMachine : 0;
    const fixed = config.stageOverrides?.[recipeId]?.fixedMachineCount;
    if (typeof fixed === 'number' && fixed >= 0) {
      installedMachinesMap.set(recipeId, fixed);
      isFixedMap.set(recipeId, true);
    } else {
      installedMachinesMap.set(recipeId, thMachines > EPS ? Math.ceil(thMachines - 1e-9) : 0);
      isFixedMap.set(recipeId, false);
    }
  }

  // Theoretical total demand per item (used to apportion shared supply proportionally)
  const theoreticalTotalConsumption = new Map<string, number>();
  for (const recipeId of orderedRecipeIds) {
    const bp = blueprints.get(recipeId)!;
    const thCycles = theoreticalCyclesPerSec.get(recipeId) ?? 0;
    for (const [ingId, perCycleAmt] of bp.perCycleIn.entries()) {
      const netIn = Math.max(0, perCycleAmt - (bp.perCycleOut.get(ingId) ?? 0));
      theoreticalTotalConsumption.set(
        ingId,
        (theoreticalTotalConsumption.get(ingId) ?? 0) + thCycles * netIn
      );
    }
  }

  // Compute installed max cycles/s for each recipe and check upstream starvation
  const actualCyclesPerSec = new Map<string, number>();
  const installedMaxCyclesPerSec = new Map<string, number>();

  for (const recipeId of orderedRecipeIds) {
    const bp = blueprints.get(recipeId)!;
    const maxCycles = installedMachinesMap.get(recipeId)! * bp.stats.cyclesPerSecPerMachine;
    installedMaxCyclesPerSec.set(recipeId, maxCycles);
    // Start assuming each recipe runs up to its theoretical need (or installed cap if fixed)
    const thCycles = theoreticalCyclesPerSec.get(recipeId) ?? 0;
    actualCyclesPerSec.set(
      recipeId,
      isFixedMap.get(recipeId) ? maxCycles : Math.min(maxCycles, thCycles)
    );
  }

  // Iterative forward propagation until convergence (handles both DAGs and fixed-count bottlenecks)
  for (let pass = 0; pass < orderedRecipeIds.length + 2; pass++) {
    let changed = false;

    // Tally available production of every non-raw item from current actualCycles
    const availableProd = new Map<string, number>();
    for (const recipeId of orderedRecipeIds) {
      const bp = blueprints.get(recipeId)!;
      const cyc = actualCyclesPerSec.get(recipeId) ?? 0;
      for (const [outId, perCycleAmt] of bp.perCycleOut.entries()) {
        const netOut = Math.max(0, perCycleAmt - (bp.perCycleIn.get(outId) ?? 0));
        availableProd.set(outId, (availableProd.get(outId) ?? 0) + cyc * netOut);
      }
    }

    // Desired consumption by each recipe at its target/installed pace
    const desiredCons = new Map<string, number>();
    for (const recipeId of orderedRecipeIds) {
      const bp = blueprints.get(recipeId)!;
      const desiredCyc = isFixedMap.get(recipeId)
        ? installedMaxCyclesPerSec.get(recipeId)!
        : Math.min(
            installedMaxCyclesPerSec.get(recipeId)!,
            theoreticalCyclesPerSec.get(recipeId) ?? 0
          );
      for (const [ingId, perCycleAmt] of bp.perCycleIn.entries()) {
        const netIn = Math.max(0, perCycleAmt - (bp.perCycleOut.get(ingId) ?? 0));
        desiredCons.set(ingId, (desiredCons.get(ingId) ?? 0) + desiredCyc * netIn);
      }
    }

    // Clamp each recipe by available upstream non-raw supplies
    for (const recipeId of orderedRecipeIds) {
      const bp = blueprints.get(recipeId)!;
      const desiredCyc = isFixedMap.get(recipeId)
        ? installedMaxCyclesPerSec.get(recipeId)!
        : Math.min(
            installedMaxCyclesPerSec.get(recipeId)!,
            theoreticalCyclesPerSec.get(recipeId) ?? 0
          );
      let limitRatio = 1.0;

      for (const [ingId, perCycleAmt] of bp.perCycleIn.entries()) {
        if (graph.rawItems.has(ingId)) continue;
        const netIn = Math.max(0, perCycleAmt - (bp.perCycleOut.get(ingId) ?? 0));
        if (netIn <= EPS) continue; // Self-sustaining catalyst (e.g. Kovarex U-235)

        const totalWant = desiredCons.get(ingId) ?? 0;
        const totalHave = availableProd.get(ingId) ?? 0;
        if (totalWant > totalHave + EPS && totalWant > EPS) {
          limitRatio = Math.min(limitRatio, totalHave / totalWant);
        }
      }

      const nextCyc = desiredCyc * limitRatio;
      if (Math.abs(nextCyc - (actualCyclesPerSec.get(recipeId) ?? 0)) > 1e-7) {
        actualCyclesPerSec.set(recipeId, nextCyc);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // --- PASS 3: ASSEMBLE STAGES, EDGES, SUMMARIES & BOTTLENECKS ---
  const stages: SolvedStage[] = [];
  const stageById = new Map<string, SolvedStage>();

  // Assign topological layerIndex from raw (0) to target
  const layerByRecipe = new Map<string, number>();
  for (const scc of graph.sccs) {
    let layer = 0;
    for (const recipeId of scc) {
      const recipe = graph.recipes.get(recipeId)!;
      for (const ing of recipe.ingredients) {
        if (graph.rawItems.has(ing.id)) continue;
        for (const [otherId, otherLayer] of layerByRecipe.entries()) {
          if (scc.includes(otherId)) continue;
          const otherRecipe = graph.recipes.get(otherId)!;
          if (otherRecipe.results.some((r) => r.id === ing.id)) {
            layer = Math.max(layer, otherLayer + 1);
          }
        }
      }
    }
    for (const recipeId of scc) {
      layerByRecipe.set(recipeId, layer);
    }
  }

  for (const recipeId of orderedRecipeIds) {
    const recipe = graph.recipes.get(recipeId)!;
    const bp = blueprints.get(recipeId)!;
    const machine = index.machinesById.get(bp.machineId)!;
    const override = config.stageOverrides?.[recipeId];

    const thCycles = theoreticalCyclesPerSec.get(recipeId) ?? 0;
    const thMachines =
      bp.stats.cyclesPerSecPerMachine > EPS ? thCycles / bp.stats.cyclesPerSecPerMachine : 0;
    const installedMachines = installedMachinesMap.get(recipeId)!;
    const installedMaxCyc = installedMaxCyclesPerSec.get(recipeId)!;
    const actCyc = actualCyclesPerSec.get(recipeId) ?? 0;

    const utilization = installedMaxCyc > EPS ? Math.min(1, actCyc / installedMaxCyc) : 0;

    const inputs: StageFlowItem[] = [];
    const beltsNeededPerInput: Record<string, number> = {};
    const insertersPerMachineInput: Record<string, number> = {};

    for (const [itemId, perCycle] of bp.perCycleIn.entries()) {
      const resDef = index.resourcesById.get(itemId)!;
      const perMachinePerSec = perCycle * bp.stats.cyclesPerSecPerMachine;
      const theoreticalTotalPerSec = perCycle * thCycles;
      const installedCapacityPerSec = perCycle * installedMaxCyc;
      const actualTotalPerSec = perCycle * actCyc;

      inputs.push({
        itemId,
        kind: resDef.kind,
        perCycle,
        perMachinePerSec,
        theoreticalTotalPerSec,
        installedCapacityPerSec,
        actualTotalPerSec,
      });

      if (resDef.kind === 'item' && defaultBelt) {
        beltsNeededPerInput[itemId] = actualTotalPerSec / defaultBelt.throughputPerSec;
      }
      if (resDef.kind === 'item' && defaultInserter) {
        insertersPerMachineInput[itemId] = Math.max(
          1,
          Math.ceil(perMachinePerSec / defaultInserter.baseBeltToMachinePerSec)
        );
      }
    }

    const outputs: StageFlowItem[] = [];
    const beltsNeededPerOutput: Record<string, number> = {};
    const insertersPerMachineOutput: Record<string, number> = {};

    for (const [itemId, perCycle] of bp.perCycleOut.entries()) {
      const resDef = index.resourcesById.get(itemId)!;
      const perMachinePerSec = perCycle * bp.stats.cyclesPerSecPerMachine;
      const theoreticalTotalPerSec = perCycle * thCycles;
      const installedCapacityPerSec = perCycle * installedMaxCyc;
      const actualTotalPerSec = perCycle * actCyc;

      outputs.push({
        itemId,
        kind: resDef.kind,
        perCycle,
        perMachinePerSec,
        theoreticalTotalPerSec,
        installedCapacityPerSec,
        actualTotalPerSec,
      });

      if (resDef.kind === 'item' && defaultBelt) {
        beltsNeededPerOutput[itemId] = actualTotalPerSec / defaultBelt.throughputPerSec;
      }
      if (resDef.kind === 'item' && defaultInserter) {
        insertersPerMachineOutput[itemId] = Math.max(
          1,
          Math.ceil(perMachinePerSec / defaultInserter.baseBeltToMachinePerSec)
        );
      }
    }

    const powerKwTotal =
      installedMachines > 0
        ? bp.stats.powerKwPerMachine * installedMachines * utilization +
          bp.stats.drainKwPerMachine * installedMachines * (1 - utilization)
        : 0;
    const pollutionPerMinTotal =
      bp.stats.pollutionPerMinPerMachine * installedMachines * utilization;

    const stage: SolvedStage = {
      id: recipeId,
      recipeId,
      recipeName: recipe.name,
      category: recipe.category,
      machineId: machine.id,
      machineName: machine.name,
      moduleIds: bp.moduleIds,
      beacon: override?.beacon,
      effectiveStats: bp.stats,
      theoreticalMachines: thMachines,
      installedMachines,
      isFixedCount: isFixedMap.get(recipeId) ?? false,
      utilization,
      inputs,
      outputs,
      beltsNeededPerInput,
      beltsNeededPerOutput,
      insertersPerMachineInput,
      insertersPerMachineOutput,
      powerKwTotal,
      pollutionPerMinTotal,
      solverMode: graph.requiresMatrixSolver ? 'matrix' : 'dag',
      layerIndex: layerByRecipe.get(recipeId) ?? 0,
    };

    stages.push(stage);
    stageById.set(stage.id, stage);
  }

  // Build FlowEdges + Intermediate / Raw / Target summaries
  const edges: FlowEdge[] = [];
  const rawSummary = new Map<string, { theoretical: number; actual: number }>();
  const producedByItem = new Map<string, number>();
  const consumedByItem = new Map<string, number>();

  for (const stage of stages) {
    for (const out of stage.outputs) {
      const netOut = Math.max(
        0,
        out.actualTotalPerSec -
          (stage.inputs.find((i) => i.itemId === out.itemId)?.actualTotalPerSec ?? 0)
      );
      producedByItem.set(out.itemId, (producedByItem.get(out.itemId) ?? 0) + netOut);
    }
    for (const inp of stage.inputs) {
      const netIn = Math.max(
        0,
        inp.actualTotalPerSec -
          (stage.outputs.find((o) => o.itemId === inp.itemId)?.actualTotalPerSec ?? 0)
      );
      if (graph.rawItems.has(inp.itemId)) {
        const cur = rawSummary.get(inp.itemId) ?? { theoretical: 0, actual: 0 };
        const netThIn = Math.max(
          0,
          inp.theoreticalTotalPerSec -
            (stage.outputs.find((o) => o.itemId === inp.itemId)?.theoreticalTotalPerSec ?? 0)
        );
        cur.theoretical += netThIn;
        cur.actual += netIn;
        rawSummary.set(inp.itemId, cur);

        edges.push({
          id: `RAW:${inp.itemId}->${stage.id}`,
          sourceStageId: `RAW:${inp.itemId}`,
          targetStageId: stage.id,
          itemId: inp.itemId,
          kind: inp.kind,
          theoreticalRatePerSec: netThIn,
          actualRatePerSec: netIn,
          beltsRequired: defaultBelt ? netIn / defaultBelt.throughputPerSec : 0,
          beltTierId: defaultBelt?.id ?? 'transport-belt',
          deficitPerSec: 0,
          surplusPerSec: 0,
        });
      } else {
        consumedByItem.set(inp.itemId, (consumedByItem.get(inp.itemId) ?? 0) + netIn);
      }
    }
  }

  // Connect producer stages -> consumer stages for non-raw items
  for (const consStage of stages) {
    for (const inp of consStage.inputs) {
      if (graph.rawItems.has(inp.itemId)) continue;
      const netIn = Math.max(
        0,
        inp.actualTotalPerSec -
          (consStage.outputs.find((o) => o.itemId === inp.itemId)?.actualTotalPerSec ?? 0)
      );
      const netThIn = Math.max(
        0,
        inp.theoreticalTotalPerSec -
          (consStage.outputs.find((o) => o.itemId === inp.itemId)?.theoreticalTotalPerSec ?? 0)
      );
      if (netIn <= EPS && netThIn <= EPS) continue;

      const producers = stages.filter((s) =>
        s.outputs.some((o) => o.itemId === inp.itemId && o.actualTotalPerSec > EPS)
      );
      const totalProduced = producers.reduce(
        (acc, p) => acc + (p.outputs.find((o) => o.itemId === inp.itemId)?.actualTotalPerSec ?? 0),
        0
      );

      for (const prodStage of producers) {
        const prodAmt =
          prodStage.outputs.find((o) => o.itemId === inp.itemId)?.actualTotalPerSec ?? 0;
        const share = totalProduced > EPS ? prodAmt / totalProduced : 1 / producers.length;
        const flowActual = netIn * share;
        const flowTheo = netThIn * share;

        edges.push({
          id: `${prodStage.id}->${consStage.id}:${inp.itemId}`,
          sourceStageId: prodStage.id,
          targetStageId: consStage.id,
          itemId: inp.itemId,
          kind: inp.kind,
          theoreticalRatePerSec: flowTheo,
          actualRatePerSec: flowActual,
          beltsRequired: defaultBelt ? flowActual / defaultBelt.throughputPerSec : 0,
          beltTierId: defaultBelt?.id ?? 'transport-belt',
          deficitPerSec: Math.max(0, flowTheo - flowActual),
          surplusPerSec: 0,
        });
      }
    }
  }

  // Connect final stages -> TARGET nodes
  const targetsSummary = config.targets.map((target) => {
    const produced = producedByItem.get(target.itemId) ?? 0;
    const consumedInternally = consumedByItem.get(target.itemId) ?? 0;
    const netAvailableForTarget = Math.max(0, produced - consumedInternally);
    const producers = stages.filter((s) =>
      s.outputs.some((o) => o.itemId === target.itemId)
    );

    for (const prodStage of producers) {
      edges.push({
        id: `${prodStage.id}->TARGET:${target.itemId}`,
        sourceStageId: prodStage.id,
        targetStageId: `TARGET:${target.itemId}`,
        itemId: target.itemId,
        kind: index.resourcesById.get(target.itemId)?.kind ?? 'item',
        theoreticalRatePerSec: target.ratePerSec,
        actualRatePerSec: netAvailableForTarget,
        beltsRequired: defaultBelt ? netAvailableForTarget / defaultBelt.throughputPerSec : 0,
        beltTierId: defaultBelt?.id ?? 'transport-belt',
        deficitPerSec: Math.max(0, target.ratePerSec - netAvailableForTarget),
        surplusPerSec: Math.max(0, netAvailableForTarget - target.ratePerSec),
      });
    }

    return {
      itemId: target.itemId,
      requestedPerSec: target.ratePerSec,
      theoreticalPerSec: target.ratePerSec,
      actualPerSec: netAvailableForTarget,
      fulfillmentRatio:
        target.ratePerSec > EPS ? Math.min(1, netAvailableForTarget / target.ratePerSec) : 1,
    };
  });

  // Intermediate balance (excluding raw and final target demand)
  const intermediateIds = new Set<string>([
    ...producedByItem.keys(),
    ...consumedByItem.keys(),
  ]);
  const intermediates = Array.from(intermediateIds)
    .filter((id) => !graph.rawItems.has(id))
    .map((itemId) => {
      const produced = producedByItem.get(itemId) ?? 0;
      const internalConsumed = consumedByItem.get(itemId) ?? 0;
      const targetReq = targetMap.get(itemId) ?? 0;
      const totalNeeded = internalConsumed + targetReq;
      // Compare against installed machine capacity demand too when fixed
      const resDef = index.resourcesById.get(itemId)!;
      return {
        itemId,
        kind: resDef.kind,
        producedPerSec: produced,
        consumedPerSec: totalNeeded,
        surplusPerSec: Math.max(0, produced - totalNeeded),
        deficitPerSec: Math.max(0, totalNeeded - produced),
      };
    });

  // Machine Totals consolidated
  const machineAgg = new Map<
    string,
    { machineId: string; machineName: string; theoreticalCount: number; installedCount: number }
  >();
  for (const s of stages) {
    const cur = machineAgg.get(s.machineId) ?? {
      machineId: s.machineId,
      machineName: s.machineName,
      theoreticalCount: 0,
      installedCount: 0,
    };
    cur.theoreticalCount += s.theoreticalMachines;
    cur.installedCount += s.installedMachines;
    machineAgg.set(s.machineId, cur);
  }

  const rawInputs = Array.from(rawSummary.entries()).map(([itemId, vals]) => ({
    itemId,
    kind: index.resourcesById.get(itemId)!.kind,
    theoreticalPerSec: vals.theoretical,
    actualPerSec: vals.actual,
    beltsRequired: defaultBelt ? vals.actual / defaultBelt.throughputPerSec : 0,
  }));

  const alerts = analyzeBottlenecks(index, config, stages, edges, intermediates);

  return {
    packId: index.pack.id,
    stages,
    edges,
    rawInputs,
    intermediates,
    targetsSummary,
    machineTotals: Array.from(machineAgg.values()),
    totalPowerKw: stages.reduce((acc, s) => acc + s.powerKwTotal, 0),
    totalPollutionPerMin: stages.reduce((acc, s) => acc + s.pollutionPerMinTotal, 0),
    alerts,
    solverUsed: graph.requiresMatrixSolver ? 'hybrid-matrix' : 'dag',
  };
}
