/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RulesVersion = '1.1' | '2.0';

export type ResourceKind = 'item' | 'fluid';

export type ModuleEffectType =
  | 'consumption'
  | 'speed'
  | 'productivity'
  | 'pollution'
  | 'quality';

export type MachineEntityType =
  | 'assembling-machine'
  | 'furnace'
  | 'rocket-silo'
  | 'mining-drill'
  | 'offshore-pump';

export type EnergySourceType = 'electric' | 'burner' | 'fluid' | 'void';

export type Direction = 0 | 4 | 8 | 12; // Factorio 2.0: 0=North, 4=East, 8=South, 12=West

export interface TileSize {
  width: number;
  height: number;
}

export interface FluidBoxPort {
  productionType: 'input' | 'output' | 'input-output';
  /** Offset relative to machine center in Factorio tiles */
  offset: { x: number; y: number };
  direction: Direction;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: 'item';
  category: string;
  subgroup: string;
  stackSize: number;
  isRawResource?: boolean;
  fuelValueMj?: number;
  color: string;
  iconKey?: string;
  iconPath?: string;
}

export interface FluidDef {
  id: string;
  name: string;
  kind: 'fluid';
  category: 'fluid';
  subgroup: string;
  defaultTemperature: number;
  maxTemperature: number;
  heatCapacityKj?: number;
  fuelValueMj?: number;
  isRawResource?: boolean;
  color: string;
  iconKey?: string;
  iconPath?: string;
}

export type ResourceDef = ItemDef | FluidDef;

export interface RecipeIngredient {
  id: string;
  type: ResourceKind;
  amount: number;
  temperature?: number;
}

export interface RecipeResult {
  id: string;
  type: ResourceKind;
  /** Fixed amount if exact; otherwise computed from min/max */
  amount: number;
  amountMin?: number;
  amountMax?: number;
  /** Probability in [0, 1], defaults to 1 */
  probability: number;
  /** Amount excluded from productivity bonus (e.g., Kovarex catalyst 40 U-235) */
  ignoredByProductivity?: number;
  /** Factorio 2.0 extra fractional output */
  extraCountFraction?: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  category: string;
  subgroup: string;
  /** Base crafting time in seconds (Factorio default is 0.5s if omitted) */
  energyRequired: number;
  ingredients: RecipeIngredient[];
  results: RecipeResult[];
  /** Main product ID for UI grouping and alternative recipe selection */
  mainProductId: string;
  allowProductivity: boolean;
  /** Maximum productivity bonus (e.g., 3.0 = +300% in Factorio 2.0) */
  maximumProductivity?: number;
  allowedEffects?: ModuleEffectType[];
  enabledByDefault: boolean;
  /** True for non-craftable extraction/virtual recipes if needed */
  isExtraction?: boolean;
  iconPath?: string;
}

export interface MachineDef {
  id: string;
  name: string;
  entityType: MachineEntityType;
  craftingCategories: string[];
  craftingSpeed: number;
  moduleSlots: number;
  allowedEffects: ModuleEffectType[];
  /** Intrinsic productivity bonus (e.g. 0.5 for Foundry / EM Plant in Space Age) */
  baseProductivity: number;
  energyUsageKw: number;
  drainKw: number;
  energySourceType: EnergySourceType;
  pollutionPerMin: number;
  /** Spatial footprint on Factorio 2D tile grid */
  tileSize: TileSize;
  /** Pipe connection ports for machines that handle fluids */
  fluidBoxes?: FluidBoxPort[];
  color: string;
  iconPath?: string;
}

export interface BeltDef {
  id: string;
  name: string;
  tier: number;
  /** Items per second across BOTH lanes (e.g., 15, 30, 45, 60) */
  throughputPerSec: number;
  /** Tiles per second speed */
  speedTilesPerSec: number;
  undergroundId?: string;
  maxUndergroundDistance?: number;
  splitterId?: string;
  color: string;
  iconPath?: string;
}

export interface InserterDef {
  id: string;
  name: string;
  tier: number;
  /** Approximate sustainable items/sec from belt to machine (base without capacity bonus) */
  baseBeltToMachinePerSec: number;
  /** Approximate sustainable items/sec with max capacity bonus */
  maxBeltToMachinePerSec: number;
  /** Reach in tiles (1 for standard/fast/bulk, 2 for long-handed) */
  reachTiles: 1 | 2;
  isLongHanded: boolean;
  hasFilter: boolean;
  color: string;
  iconPath?: string;
}

export interface ModuleDef {
  id: string;
  name: string;
  category: 'speed' | 'productivity' | 'efficiency' | 'quality';
  tier: number;
  effects: {
    speed: number;
    productivity: number;
    consumption: number;
    pollution: number;
    quality: number;
  };
  color: string;
  iconPath?: string;
}

export interface BeaconDef {
  id: string;
  name: string;
  moduleSlots: number;
  distributionEffectivity: number;
  /** 'linear' (Factorio 1.1) or 'sqrt' (Factorio 2.0 diminishing returns) */
  profileMode: 'linear' | 'sqrt';
  energyUsageKw: number;
  tileSize: TileSize;
  allowedEffects: ModuleEffectType[];
  iconPath?: string;
}

export interface ElectricPoleDef {
  id: string;
  name: string;
  tileSize: TileSize;
  supplyAreaDistance: number;
  maxWireDistance: number;
  iconPath?: string;
}

export interface TechnologyDef {
  id: string;
  name: string;
  prerequisites: string[];
  unlockedRecipes: string[];
  /** Optional infinite or tiered productivity bonus per level */
  recipeProductivityBonus?: {
    recipeIds: string[];
    bonusPerLevel: number;
    maxLevels?: number;
  };
  iconPath?: string;
}

export interface ItemGroupDef {
  id: string;
  name: string;
  order: string;
  iconPath?: string;
  fallbackIconId?: string;
}

export interface ItemSubgroupDef {
  id: string;
  groupId: string;
  order: string;
}

export interface GameDataPack {
  id: string;
  name: string;
  factorioVersion: string;
  rulesVersion: RulesVersion;
  mods: Array<{ name: string; version: string }>;
  items: ItemDef[];
  fluids: FluidDef[];
  recipes: RecipeDef[];
  machines: MachineDef[];
  belts: BeltDef[];
  inserters: InserterDef[];
  modules: ModuleDef[];
  beacons: BeaconDef[];
  electricPoles?: ElectricPoleDef[];
  technologies: TechnologyDef[];
  itemGroups?: ItemGroupDef[];
  itemSubgroups?: ItemSubgroupDef[];
}

export interface PackIndex {
  pack: GameDataPack;
  itemsById: Map<string, ItemDef>;
  fluidsById: Map<string, FluidDef>;
  resourcesById: Map<string, ResourceDef>;
  recipesById: Map<string, RecipeDef>;
  machinesById: Map<string, MachineDef>;
  beltsById: Map<string, BeltDef>;
  insertersById: Map<string, InserterDef>;
  modulesById: Map<string, ModuleDef>;
  beaconsById: Map<string, BeaconDef>;
  technologiesById: Map<string, TechnologyDef>;
  /** Relational indexes */
  recipesByProduct: Map<string, RecipeDef[]>;
  recipesByIngredient: Map<string, RecipeDef[]>;
  machinesByCategory: Map<string, MachineDef[]>;
  techsUnlockingRecipe: Map<string, TechnologyDef[]>;
}
