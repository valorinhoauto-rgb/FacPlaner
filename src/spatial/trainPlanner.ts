/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackIndex, ResourceKind } from '../data/schema.ts';
import type { SolveResult } from '../engine/types.ts';

export type TrainRawInputEntry =
  | SolveResult['rawInputs'][number]
  | {
      itemId: string;
      kind: ResourceKind;
      totalRatePerSec?: number;
      actualPerSec?: number;
      theoreticalPerSec?: number;
      beltsRequired: number;
    };

function resolveInputRate(entry: TrainRawInputEntry): number {
  if ('actualPerSec' in entry && typeof entry.actualPerSec === 'number') {
    return entry.actualPerSec;
  }
  if ('totalRatePerSec' in entry && typeof entry.totalRatePerSec === 'number') {
    return entry.totalRatePerSec;
  }
  if ('theoreticalPerSec' in entry && typeof entry.theoreticalPerSec === 'number') {
    return entry.theoreticalPerSec;
  }
  return 0;
}

export interface TrainItemSlotAllocation {
  itemId: string;
  name: string;
  color: string;
  iconPath?: string;
  ratePerSec: number;
  stackSize: number;
  stacksPerSec: number;
  stacksPerMin: number;
  idealSlots: number;
  allocatedSlots: number;
  itemsPerTrain: number;
  autonomySec: number;
  sharePct: number;
}

export interface WagonItemSlice {
  itemId: string;
  name: string;
  color: string;
  iconPath?: string;
  slots: number;
  stackSize: number;
  itemsCount: number;
}

export interface TrainWagonPlan {
  wagonNumber: number;
  totalSlots: number;
  usedSlots: number;
  freeSlots: number;
  isMixed: boolean;
  slices: WagonItemSlice[];
}

export interface TrainFluidSummary {
  fluidId: string;
  name: string;
  color: string;
  iconPath?: string;
  ratePerSec: number;
  ratePerMin: number;
  wagonsNeededFor60s: number;
}

export interface TrainWagonPlanResult {
  wagonCount: number;
  slotsPerWagon: number;
  totalSlots: number;
  solidItemCount: number;
  requiresMixedWagons: boolean;
  insufficientSlots: boolean;
  limitingAutonomySec: number;
  trainsPerMin: number;
  trainsPerHour: number;
  itemAllocations: TrainItemSlotAllocation[];
  wagons: TrainWagonPlan[];
  fluids: TrainFluidSummary[];
}

export function computeTrainWagonPlan(
  rawInputs: TrainRawInputEntry[],
  index: PackIndex,
  options: {
    wagonCount: number;
    slotsPerWagon?: number;
    stackSizeOverrides?: Record<string, number>;
  }
): TrainWagonPlanResult {
  const wagonCount = Math.max(1, Math.min(32, Math.floor(options.wagonCount || 1)));
  const slotsPerWagon = Math.max(1, Math.min(200, Math.floor(options.slotsPerWagon || 40)));
  const totalSlots = wagonCount * slotsPerWagon;

  const solidInputs = rawInputs
    .map((r) => ({ ...r, resolvedRate: resolveInputRate(r) }))
    .filter((r) => r.kind === 'item' && r.resolvedRate > 1e-6);
  const fluidInputs = rawInputs
    .map((r) => ({ ...r, resolvedRate: resolveInputRate(r) }))
    .filter((r) => r.kind === 'fluid' && r.resolvedRate > 1e-6);

  const fluidCapacityPerWagon = index.pack.rulesVersion === '2.0' ? 50000 : 25000;
  const fluids: TrainFluidSummary[] = fluidInputs.map((f) => {
    const res = index.resourcesById.get(f.itemId);
    const ratePerMin = f.resolvedRate * 60;
    return {
      fluidId: f.itemId,
      name: res?.name ?? f.itemId,
      color: res?.color ?? '#38BDF8',
      iconPath: res?.iconPath,
      ratePerSec: f.resolvedRate,
      ratePerMin,
      wagonsNeededFor60s: Math.ceil(ratePerMin / fluidCapacityPerWagon),
    };
  });

  if (solidInputs.length === 0) {
    const emptyWagons: TrainWagonPlan[] = Array.from({ length: wagonCount }, (_, i) => ({
      wagonNumber: i + 1,
      totalSlots,
      usedSlots: 0,
      freeSlots: slotsPerWagon,
      isMixed: false,
      slices: [],
    }));
    return {
      wagonCount,
      slotsPerWagon,
      totalSlots,
      solidItemCount: 0,
      requiresMixedWagons: false,
      insufficientSlots: false,
      limitingAutonomySec: 0,
      trainsPerMin: 0,
      trainsPerHour: 0,
      itemAllocations: [],
      wagons: emptyWagons,
      fluids,
    };
  }

  const enriched = solidInputs.map((r) => {
    const itemDef = index.itemsById.get(r.itemId);
    const overrideStack = options.stackSizeOverrides?.[r.itemId];
    const stackSize = Math.max(1, Math.floor(overrideStack ?? itemDef?.stackSize ?? 100));
    const stacksPerSec = r.resolvedRate / stackSize;
    return {
      itemId: r.itemId,
      name: itemDef?.name ?? r.itemId,
      color: itemDef?.color ?? '#F59E0B',
      iconPath: itemDef?.iconPath,
      ratePerSec: r.resolvedRate,
      stackSize,
      stacksPerSec,
      stacksPerMin: stacksPerSec * 60,
    };
  });

  const totalStacksPerSec = enriched.reduce((sum, x) => sum + x.stacksPerSec, 0);
  const insufficientSlots = enriched.length > totalSlots;

  // Largest-remainder (Hamilton) allocation weighted by stacks/sec
  const ideal = enriched.map((e) => ({
    ...e,
    exact: totalStacksPerSec > 0 ? (e.stacksPerSec / totalStacksPerSec) * totalSlots : totalSlots / enriched.length,
  }));

  const slotsArr = ideal.map((x) => {
    if (insufficientSlots) {
      return Math.floor(x.exact);
    }
    return Math.max(1, Math.floor(x.exact));
  });

  let allocatedSum = slotsArr.reduce((a, b) => a + b, 0);

  // If guaranteeing >=1 slot per item exceeded totalSlots (only if > totalSlots, guarded above), trim largest
  while (allocatedSum > totalSlots) {
    let maxIdx = 0;
    for (let i = 1; i < slotsArr.length; i++) {
      if (slotsArr[i] > slotsArr[maxIdx]) maxIdx = i;
    }
    if (slotsArr[maxIdx] <= 0) break;
    slotsArr[maxIdx]--;
    allocatedSum--;
  }

  // Distribute remaining slots by fractional remainder or bottleneck ratio (maximizes limiting autonomy!)
  while (allocatedSum < totalSlots) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < ideal.length; i++) {
      // Prioritize item whose current autonomy is smallest so all items balance cleanly
      const currentAutonomy =
        ideal[i].stacksPerSec > 0 ? slotsArr[i] / ideal[i].stacksPerSec : Infinity;
      const score = -currentAutonomy + (ideal[i].exact - slotsArr[i]) * 0.01;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    slotsArr[bestIdx]++;
    allocatedSum++;
  }

  const itemAllocations: TrainItemSlotAllocation[] = ideal
    .map((item, idx) => {
      const allocatedSlots = slotsArr[idx];
      const itemsPerTrain = allocatedSlots * item.stackSize;
      const autonomySec = item.ratePerSec > 0 ? itemsPerTrain / item.ratePerSec : Infinity;
      return {
        itemId: item.itemId,
        name: item.name,
        color: item.color,
        iconPath: item.iconPath,
        ratePerSec: item.ratePerSec,
        stackSize: item.stackSize,
        stacksPerSec: item.stacksPerSec,
        stacksPerMin: item.stacksPerMin,
        idealSlots: item.exact,
        allocatedSlots,
        itemsPerTrain,
        autonomySec,
        sharePct: totalSlots > 0 ? (allocatedSlots / totalSlots) * 100 : 0,
      };
    })
    .sort((a, b) => b.allocatedSlots - a.allocatedSlots);

  // Pack items sequentially into cargo wagons (largest allocations first so dedicated wagons stay pure)
  const wagons: TrainWagonPlan[] = Array.from({ length: wagonCount }, (_, i) => ({
    wagonNumber: i + 1,
    totalSlots: slotsPerWagon,
    usedSlots: 0,
    freeSlots: slotsPerWagon,
    isMixed: false,
    slices: [],
  }));

  let wIdx = 0;
  for (const alloc of itemAllocations) {
    let remaining = alloc.allocatedSlots;
    while (remaining > 0 && wIdx < wagons.length) {
      const wagon = wagons[wIdx];
      if (wagon.freeSlots <= 0) {
        wIdx++;
        continue;
      }
      const take = Math.min(remaining, wagon.freeSlots);
      wagon.slices.push({
        itemId: alloc.itemId,
        name: alloc.name,
        color: alloc.color,
        iconPath: alloc.iconPath,
        slots: take,
        stackSize: alloc.stackSize,
        itemsCount: take * alloc.stackSize,
      });
      wagon.usedSlots += take;
      wagon.freeSlots -= take;
      remaining -= take;
      if (wagon.freeSlots === 0) {
        wIdx++;
      }
    }
  }

  for (const w of wagons) {
    w.isMixed = w.slices.length > 1;
  }

  const positiveAutonomies = itemAllocations
    .filter((a) => Number.isFinite(a.autonomySec))
    .map((a) => a.autonomySec);
  const limitingAutonomySec = positiveAutonomies.length > 0 ? Math.min(...positiveAutonomies) : 0;
  const trainsPerMin = limitingAutonomySec > 0 ? 60 / limitingAutonomySec : 0;
  const trainsPerHour = limitingAutonomySec > 0 ? 3600 / limitingAutonomySec : 0;
  const requiresMixedWagons =
    itemAllocations.length > wagonCount || wagons.some((w) => w.isMixed);

  return {
    wagonCount,
    slotsPerWagon,
    totalSlots,
    solidItemCount: itemAllocations.length,
    requiresMixedWagons,
    insufficientSlots,
    limitingAutonomySec,
    trainsPerMin,
    trainsPerHour,
    itemAllocations,
    wagons,
    fluids,
  };
}
