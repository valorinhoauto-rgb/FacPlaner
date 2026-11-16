/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResourceKind } from '../data/schema.ts';

export type RateUnit = 'per_second' | 'per_minute' | 'per_hour';

export interface TargetSpec {
  itemId: string;
  /** Always normalized to units per second internally */
  ratePerSec: number;
}

export interface BeaconConfig {
  beaconId: string;
  count: number;
  moduleIds: string[];
}

export interface StageOverride {
  machineId?: string;
  moduleIds?: string[];
  beacon?: BeaconConfig;
  /** Manual fixed integer machine count (switches stage from auto-linked to fixed capacity) */
  fixedMachineCount?: number;
}

export interface PlanConfig {
  packId: string;
  targets: TargetSpec[];
  /** itemId -> preferred recipeId when multiple recipes produce the same item */
  preferredRecipes?: Record<string, string>;
  /** craftingCategory -> default machineId */
  defaultMachineByCategory?: Record<string, string>;
  /** Per-recipe (stage) overrides */
  stageOverrides?: Record<string, StageOverride>;
  /** Items treated as externally supplied (stop recursion, e.g., main bus iron-plate) */
  rawResourceOverrides?: string[];
  /** Default transport belt tier used for belt throughput calculation */
  defaultBeltId?: string;
  /** Default inserter used for inserter capacity checks */
  defaultInserterId?: string;
  /** Infinite research productivity bonuses per recipeId (e.g., 0.1 = +10%) */
  researchProductivityBonuses?: Record<string, number>;
  /** Optional list of unlocked technologies to flag unresearched recipes */
  unlockedTechIds?: string[];
}

export interface MachineEffectiveStats {
  craftingSpeed: number;
  speedMultiplier: number;
  productivityBonus: number;
  consumptionMultiplier: number;
  pollutionMultiplier: number;
  powerKwPerMachine: number;
  drainKwPerMachine: number;
  pollutionPerMinPerMachine: number;
  cyclesPerSecPerMachine: number;
  warnings: string[];
}

export interface StageFlowItem {
  itemId: string;
  kind: ResourceKind;
  perCycle: number;
  perMachinePerSec: number;
  theoreticalTotalPerSec: number;
  installedCapacityPerSec: number;
  actualTotalPerSec: number;
}

export interface SolvedStage {
  id: string;
  recipeId: string;
  recipeName: string;
  category: string;
  machineId: string;
  machineName: string;
  moduleIds: string[];
  beacon?: BeaconConfig;
  effectiveStats: MachineEffectiveStats;
  /** Exact fractional machines required to satisfy theoretical demand */
  theoreticalMachines: number;
  /** Real integer machines installed (ceil(theoretical) or fixedMachineCount) */
  installedMachines: number;
  isFixedCount: boolean;
  /** Ratio of actual throughput / installed machine max capacity (0..1) */
  utilization: number;
  inputs: StageFlowItem[];
  outputs: StageFlowItem[];
  beltsNeededPerInput: Record<string, number>;
  beltsNeededPerOutput: Record<string, number>;
  insertersPerMachineInput: Record<string, number>;
  insertersPerMachineOutput: Record<string, number>;
  powerKwTotal: number;
  pollutionPerMinTotal: number;
  solverMode: 'dag' | 'matrix';
  /** Topological order index from raw inputs (0) to final products */
  layerIndex: number;
}

export interface FlowEdge {
  id: string;
  sourceStageId: string;
  targetStageId: string;
  itemId: string;
  kind: ResourceKind;
  theoreticalRatePerSec: number;
  actualRatePerSec: number;
  beltsRequired: number;
  beltTierId: string;
  deficitPerSec: number;
  surplusPerSec: number;
}

export interface BottleneckAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code:
    | 'STARVATION'
    | 'EXCESS_BYPRODUCT'
    | 'BELT_SATURATION'
    | 'INSERTER_LIMIT'
    | 'INVALID_MODULE'
    | 'LOCKED_TECH';
  stageId?: string;
  itemId?: string;
  message: string;
  suggestion: string;
}

export interface SolveResult {
  packId: string;
  stages: SolvedStage[];
  edges: FlowEdge[];
  rawInputs: Array<{
    itemId: string;
    kind: ResourceKind;
    theoreticalPerSec: number;
    actualPerSec: number;
    beltsRequired: number;
  }>;
  intermediates: Array<{
    itemId: string;
    kind: ResourceKind;
    producedPerSec: number;
    consumedPerSec: number;
    surplusPerSec: number;
    deficitPerSec: number;
  }>;
  targetsSummary: Array<{
    itemId: string;
    requestedPerSec: number;
    theoreticalPerSec: number;
    actualPerSec: number;
    fulfillmentRatio: number;
  }>;
  machineTotals: Array<{
    machineId: string;
    machineName: string;
    theoreticalCount: number;
    installedCount: number;
  }>;
  totalPowerKw: number;
  totalPollutionPerMin: number;
  alerts: BottleneckAlert[];
  solverUsed: 'dag' | 'hybrid-matrix';
}
