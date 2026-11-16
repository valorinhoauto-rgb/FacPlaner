/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BeaconDef,
  BeltDef,
  ElectricPoleDef,
  FluidDef,
  GameDataPack,
  InserterDef,
  ItemDef,
  ItemGroupDef,
  ItemSubgroupDef,
  MachineDef,
  MachineEntityType,
  ModuleDef,
  ModuleEffectType,
  RecipeDef,
  RecipeIngredient,
  RecipeResult,
  RulesVersion,
  TechnologyDef,
  TileSize,
} from './schema.ts';

/**
 * Raw subset of Factorio's `factorio --dump-data-raw` output (`data-raw-dump.json`).
 * Supports Factorio 1.1, Factorio 2.0 / Space Age, Krastorio 2, and arbitrary modpacks.
 */
export interface FactorioDataRawDump {
  item?: Record<string, any>;
  ['item-with-entity-data']?: Record<string, any>;
  tool?: Record<string, any>;
  ['repair-tool']?: Record<string, any>;
  ammo?: Record<string, any>;
  capsule?: Record<string, any>;
  ['rail-planner']?: Record<string, any>;
  module?: Record<string, any>;
  fluid?: Record<string, any>;
  resource?: Record<string, any>;
  recipe?: Record<string, any>;
  ['assembling-machine']?: Record<string, any>;
  furnace?: Record<string, any>;
  ['rocket-silo']?: Record<string, any>;
  ['mining-drill']?: Record<string, any>;
  ['offshore-pump']?: Record<string, any>;
  ['transport-belt']?: Record<string, any>;
  ['underground-belt']?: Record<string, any>;
  splitter?: Record<string, any>;
  inserter?: Record<string, any>;
  beacon?: Record<string, any>;
  ['electric-pole']?: Record<string, any>;
  technology?: Record<string, any>;
  ['item-group']?: Record<string, any>;
  ['item-subgroup']?: Record<string, any>;
}

export interface DumpImportOptions {
  packId: string;
  packName: string;
  factorioVersion?: string;
  rulesVersion?: RulesVersion;
  mods?: Array<{ name: string; version: string }>;
}

function humanizeId(id: string): string {
  const cleaned = id.startsWith('kr-') ? id.slice(3) : id;
  return cleaned
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function extractName(proto: any, id: string): string {
  if (typeof proto?.localised_name === 'string' && proto.localised_name.trim().length > 0) {
    return proto.localised_name.trim();
  }
  return humanizeId(id);
}

function extractIconPath(proto: any): string | undefined {
  if (typeof proto?.icon === 'string' && proto.icon.trim().length > 0) {
    return proto.icon.trim();
  }
  if (Array.isArray(proto?.icons) && proto.icons.length > 0) {
    const first = proto.icons[0];
    if (typeof first?.icon === 'string' && first.icon.trim().length > 0) {
      return first.icon.trim();
    }
  }
  return undefined;
}

function parseEnergyToKw(energyStr: unknown, fallbackKw = 150): number {
  if (typeof energyStr === 'number') return energyStr;
  if (typeof energyStr !== 'string') return fallbackKw;
  const match = energyStr.trim().match(/^([\d.]+)\s*(W|kW|MW|GW)$/i);
  if (!match) return fallbackKw;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'w') return value / 1000;
  if (unit === 'kw') return value;
  if (unit === 'mw') return value * 1000;
  if (unit === 'gw') return value * 1_000_000;
  return fallbackKw;
}

function parseEnergyToMj(energyStr: unknown): number | undefined {
  if (typeof energyStr !== 'string') return undefined;
  const match = energyStr.trim().match(/^([\d.]+)\s*(J|kJ|MJ|GJ)$/i);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'j') return value / 1_000_000;
  if (unit === 'kj') return value / 1000;
  if (unit === 'mj') return value;
  if (unit === 'gj') return value * 1000;
  return undefined;
}

function parseTileSize(collisionBox: unknown, fallback: TileSize = { width: 3, height: 3 }): TileSize {
  if (!Array.isArray(collisionBox) || collisionBox.length !== 2) return fallback;
  const [minPt, maxPt] = collisionBox;
  if (!Array.isArray(minPt) || !Array.isArray(maxPt)) return fallback;
  const width = Math.max(1, Math.ceil(Number(maxPt[0]) - Number(minPt[0])));
  const height = Math.max(1, Math.ceil(Number(maxPt[1]) - Number(minPt[1])));
  return { width, height };
}

function normalizeIngredient(raw: any): RecipeIngredient | null {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length >= 2) {
    return {
      id: String(raw[0]),
      type: 'item',
      amount: Number(raw[1]),
    };
  }
  if (typeof raw === 'object' && raw.name) {
    return {
      id: String(raw.name),
      type: raw.type === 'fluid' ? 'fluid' : 'item',
      amount: Number(raw.amount ?? 1),
      temperature: typeof raw.temperature === 'number' ? raw.temperature : undefined,
    };
  }
  return null;
}

function normalizeResult(raw: any): RecipeResult | null {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length >= 2) {
    return {
      id: String(raw[0]),
      type: 'item',
      amount: Number(raw[1]),
      probability: 1,
    };
  }
  if (typeof raw === 'object' && raw.name) {
    const amountMin = typeof raw.amount_min === 'number' ? raw.amount_min : undefined;
    const amountMax = typeof raw.amount_max === 'number' ? raw.amount_max : undefined;
    const baseAmount =
      typeof raw.amount === 'number'
        ? raw.amount
        : amountMin !== undefined && amountMax !== undefined
          ? (amountMin + amountMax) / 2
          : 1;

    return {
      id: String(raw.name),
      type: raw.type === 'fluid' ? 'fluid' : 'item',
      amount: baseAmount,
      amountMin,
      amountMax,
      probability: typeof raw.probability === 'number' ? raw.probability : 1,
      ignoredByProductivity:
        typeof raw.ignored_by_productivity === 'number'
          ? raw.ignored_by_productivity
          : typeof raw.catalyst_amount === 'number'
            ? raw.catalyst_amount
            : undefined,
      extraCountFraction:
        typeof raw.extra_count_fraction === 'number' ? raw.extra_count_fraction : undefined,
    };
  }
  return null;
}

function colorFromSubgroup(subgroup: string, id = ''): string {
  if (id.includes('imersite') || id.includes('imersium')) return '#A855F7';
  if (id.includes('holmium')) return '#EC4899';
  if (id.includes('tungsten')) return '#64748B';
  if (id.includes('rare-metal')) return '#06B6D4';
  if (id.includes('enriched')) return '#38BDF8';
  if (id.includes('chlorine')) return '#84CC16';
  const palette: Record<string, string> = {
    'raw-resource': '#94A3B8',
    'raw-material': '#CBD5E1',
    'intermediate-product': '#34D399',
    'science-pack': '#A78BFA',
    'fluid-recipes': '#22D3EE',
    fluid: '#06B6D4',
    belt: '#FBBF24',
    inserter: '#F59E0B',
    'production-machine': '#60A5FA',
    module: '#F472B6',
  };
  return palette[subgroup] ?? '#9CA3AF';
}

function parsePollution(emissions: unknown): number {
  if (typeof emissions === 'number') return Math.max(0, emissions);
  if (emissions && typeof emissions === 'object') {
    const obj = emissions as Record<string, unknown>;
    if (typeof obj.pollution === 'number') return Math.max(0, obj.pollution);
  }
  return 2;
}

/**
 * Converts a Factorio `data-raw-dump.json` object into a validated `GameDataPack`.
 */
export function importFactorioDump(
  rawDump: FactorioDataRawDump,
  options: DumpImportOptions
): GameDataPack {
  const rulesVersion: RulesVersion = options.rulesVersion ?? '2.0';
  const detectedMods = new Set<string>(['base']);
  const trackIconMod = (iconPath?: string) => {
    if (!iconPath) return;
    const m = iconPath.match(/^__([^_][^/]*)__\//);
    if (m) detectedMods.add(m[1]);
  };

  // Collect all raw mined/pumped resource names from rawDump.resource
  const rawResourceNames = new Set<string>(Object.keys(rawDump.resource ?? {}));
  for (const proto of Object.values(rawDump.resource ?? {})) {
    if (!proto?.minable) continue;
    if (typeof proto.minable.result === 'string') {
      rawResourceNames.add(proto.minable.result);
    }
    if (Array.isArray(proto.minable.results)) {
      for (const r of proto.minable.results) {
        if (r?.name) rawResourceNames.add(String(r.name));
        else if (Array.isArray(r) && r[0]) rawResourceNames.add(String(r[0]));
      }
    }
  }

  const items: ItemDef[] = [];
  const seenItemIds = new Set<string>();

  const itemBuckets = [
    rawDump.item,
    rawDump['item-with-entity-data'],
    rawDump.tool,
    rawDump['repair-tool'],
    rawDump.ammo,
    rawDump.capsule,
    rawDump['rail-planner'],
    rawDump.module,
  ];

  for (const bucket of itemBuckets) {
    if (!bucket) continue;
    for (const [id, proto] of Object.entries(bucket)) {
      if (!proto || seenItemIds.has(id)) continue;
      if (proto.parameter === true || id === 'item-unknown' || id === 'parameter-0') continue;
      seenItemIds.add(id);
      const subgroup = String(proto.subgroup ?? 'intermediate-product');
      const iconPath = extractIconPath(proto);
      trackIconMod(iconPath);
      items.push({
        id,
        name: extractName(proto, id),
        kind: 'item',
        category: String(proto.type ?? 'item'),
        subgroup,
        stackSize: Math.max(1, Number(proto.stack_size ?? 50)),
        isRawResource: rawResourceNames.has(id) || subgroup === 'raw-resource',
        fuelValueMj: parseEnergyToMj(proto.fuel_value),
        color: colorFromSubgroup(subgroup, id),
        iconPath,
      });
    }
  }

  const fluids: FluidDef[] = [];
  const seenFluidIds = new Set<string>();
  const rawFluidDefaults = new Set([
    'water',
    'crude-oil',
    'lava',
    'ammoniacal-solution',
    'fluorine',
    'lithium-brine',
    'kr-mineral-water',
    ...rawResourceNames,
  ]);
  for (const [id, proto] of Object.entries(rawDump.fluid ?? {})) {
    if (!proto || seenFluidIds.has(id)) continue;
    if (proto.parameter === true || id === 'fluid-unknown') continue;
    seenFluidIds.add(id);
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);
    const baseColor = proto.base_color;
    const fluidColor =
      baseColor && typeof baseColor.r === 'number'
        ? `rgb(${Math.round((baseColor.r <= 1 ? baseColor.r * 255 : baseColor.r))}, ${Math.round((baseColor.g <= 1 ? baseColor.g * 255 : baseColor.g))}, ${Math.round((baseColor.b <= 1 ? baseColor.b * 255 : baseColor.b))})`
        : colorFromSubgroup('fluid', id);

    fluids.push({
      id,
      name: extractName(proto, id),
      kind: 'fluid',
      category: 'fluid',
      subgroup: String(proto.subgroup ?? 'fluid'),
      defaultTemperature: Number(proto.default_temperature ?? 15),
      maxTemperature: Number(proto.max_temperature ?? 100),
      fuelValueMj: parseEnergyToMj(proto.fuel_value),
      isRawResource: rawFluidDefaults.has(id),
      color: fluidColor,
      iconPath,
    });
  }

  const recipes: RecipeDef[] = [];
  for (const [id, proto] of Object.entries(rawDump.recipe ?? {})) {
    if (!proto || proto.parameter === true) continue;
    const source = proto.normal && typeof proto.normal === 'object' ? proto.normal : proto;

    const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
      .map(normalizeIngredient)
      .filter((x: RecipeIngredient | null): x is RecipeIngredient => x !== null);

    let results: RecipeResult[] = [];
    if (Array.isArray(source.results)) {
      results = source.results
        .map(normalizeResult)
        .filter((x: RecipeResult | null): x is RecipeResult => x !== null);
    } else if (source.result) {
      results = [
        {
          id: String(source.result),
          type: 'item',
          amount: Number(source.result_count ?? 1),
          probability: 1,
        },
      ];
    }

    if (results.length === 0) continue;

    // Ensure every ingredient/result resource exists so validator stays clean on partial dumps
    for (const ing of ingredients) {
      if (ing.type === 'fluid' && !seenFluidIds.has(ing.id)) {
        seenFluidIds.add(ing.id);
        fluids.push({
          id: ing.id,
          name: humanizeId(ing.id),
          kind: 'fluid',
          category: 'fluid',
          subgroup: 'fluid',
          defaultTemperature: 15,
          maxTemperature: 100,
          isRawResource: true,
          color: '#06B6D4',
        });
      } else if (ing.type === 'item' && !seenItemIds.has(ing.id)) {
        seenItemIds.add(ing.id);
        items.push({
          id: ing.id,
          name: humanizeId(ing.id),
          kind: 'item',
          category: 'item',
          subgroup: 'raw-resource',
          stackSize: 50,
          isRawResource: true,
          color: '#94A3B8',
        });
      }
    }

    for (const res of results) {
      if (res.type === 'fluid' && !seenFluidIds.has(res.id)) {
        seenFluidIds.add(res.id);
        fluids.push({
          id: res.id,
          name: humanizeId(res.id),
          kind: 'fluid',
          category: 'fluid',
          subgroup: 'fluid',
          defaultTemperature: 15,
          maxTemperature: 100,
          color: '#06B6D4',
        });
      } else if (res.type === 'item' && !seenItemIds.has(res.id)) {
        seenItemIds.add(res.id);
        items.push({
          id: res.id,
          name: humanizeId(res.id),
          kind: 'item',
          category: 'item',
          subgroup: 'intermediate-product',
          stackSize: 50,
          color: '#34D399',
        });
      }
    }

    const mainProductId = String(source.main_product ?? proto.main_product ?? results[0].id);
    const mainProductRes =
      items.find((it) => it.id === mainProductId) ?? fluids.find((fl) => fl.id === mainProductId);
    const subgroup = String(proto.subgroup ?? mainProductRes?.subgroup ?? 'intermediate-product');
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);

    recipes.push({
      id,
      name: extractName(proto, id),
      category: String(proto.category ?? 'crafting'),
      subgroup,
      energyRequired: Math.max(0.01, Number(source.energy_required ?? 0.5)),
      ingredients,
      results,
      mainProductId,
      allowProductivity: Boolean(proto.allow_productivity ?? false),
      maximumProductivity:
        typeof proto.maximum_productivity === 'number' ? proto.maximum_productivity : 3.0,
      allowedEffects: Array.isArray(proto.allowed_effects)
        ? (proto.allowed_effects as ModuleEffectType[])
        : undefined,
      enabledByDefault: source.enabled !== false,
      iconPath,
    });
  }

  const machines: MachineDef[] = [];
  const machineBuckets: Array<[MachineEntityType, Record<string, any> | undefined]> = [
    ['assembling-machine', rawDump['assembling-machine']],
    ['furnace', rawDump.furnace],
    ['rocket-silo', rawDump['rocket-silo']],
  ];

  for (const [entityType, bucket] of machineBuckets) {
    if (!bucket) continue;
    for (const [id, proto] of Object.entries(bucket)) {
      if (!proto) continue;
      const craftingSpeed = Math.max(0.05, Number(proto.crafting_speed ?? 1));
      const moduleSlots = Number(proto.module_slots ?? proto.module_specification?.module_slots ?? 0);
      const baseProd = Number(proto.effect_receiver?.base_effect?.productivity ?? 0);
      const allowedEffects: ModuleEffectType[] = Array.isArray(proto.allowed_effects)
        ? proto.allowed_effects
        : ['consumption', 'speed', 'productivity', 'pollution', 'quality'];

      const energyType =
        proto.energy_source?.type === 'burner'
          ? 'burner'
          : proto.energy_source?.type === 'fluid'
            ? 'fluid'
            : proto.energy_source?.type === 'void'
              ? 'void'
              : 'electric';

      const iconPath = extractIconPath(proto);
      trackIconMod(iconPath);

      machines.push({
        id,
        name: extractName(proto, id),
        entityType,
        craftingCategories: Array.isArray(proto.crafting_categories)
          ? proto.crafting_categories.map(String)
          : ['crafting'],
        craftingSpeed,
        moduleSlots,
        allowedEffects,
        baseProductivity: baseProd,
        energyUsageKw: parseEnergyToKw(proto.energy_usage, 150),
        drainKw: parseEnergyToKw(proto.energy_source?.drain, 5),
        energySourceType: energyType,
        pollutionPerMin: parsePollution(proto.energy_source?.emissions_per_minute),
        tileSize: parseTileSize(proto.collision_box, { width: 3, height: 3 }),
        color: colorFromSubgroup('production-machine', id),
        iconPath,
      });
    }
  }

  const undergroundIds = new Set(Object.keys(rawDump['underground-belt'] ?? {}));
  const splitterIds = new Set(Object.keys(rawDump.splitter ?? {}));

  const belts: BeltDef[] = [];
  let beltTier = 1;
  for (const [id, proto] of Object.entries(rawDump['transport-belt'] ?? {})) {
    if (!proto) continue;
    const rawSpeed = Number(proto.speed ?? 0.03125);
    const speedTilesPerSec = rawSpeed * 60;
    const throughputPerSec = rawSpeed * 480;
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);

    const inferredUnderground =
      typeof proto.related_underground_belt === 'string'
        ? proto.related_underground_belt
        : id.replace('transport-belt', 'underground-belt');
    const inferredSplitter = id.replace('transport-belt', 'splitter');

    belts.push({
      id,
      name: extractName(proto, id),
      tier: beltTier++,
      throughputPerSec,
      speedTilesPerSec,
      undergroundId: undergroundIds.has(inferredUnderground) ? inferredUnderground : undefined,
      splitterId: splitterIds.has(inferredSplitter) ? inferredSplitter : undefined,
      color: id.includes('turbo')
        ? '#84CC16'
        : id.includes('superior')
          ? '#A855F7'
          : id.includes('express')
            ? '#38BDF8'
            : id.includes('fast')
              ? '#EF4444'
              : '#FACC15',
      iconPath,
    });
  }
  belts.sort((a, b) => a.throughputPerSec - b.throughputPerSec);
  belts.forEach((b, idx) => {
    b.tier = idx + 1;
  });

  const inserters: InserterDef[] = [];
  let insTier = 1;
  for (const [id, proto] of Object.entries(rawDump.inserter ?? {})) {
    if (!proto) continue;
    const pickup = Array.isArray(proto.pickup_position) ? Math.abs(Number(proto.pickup_position[1])) : 1;
    const isLongHanded = pickup > 1.5;
    const rotSpeed = Number(proto.rotation_speed ?? 0.014);
    const approxPerSec = Number(Math.max(0.5, rotSpeed * 60).toFixed(2));
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);
    inserters.push({
      id,
      name: extractName(proto, id),
      tier: insTier++,
      baseBeltToMachinePerSec: approxPerSec,
      maxBeltToMachinePerSec: approxPerSec * 3,
      reachTiles: isLongHanded ? 2 : 1,
      isLongHanded,
      hasFilter: rulesVersion === '2.0' || Boolean(proto.filter_count),
      color: '#F59E0B',
      iconPath,
    });
  }

  const modules: ModuleDef[] = [];
  for (const [id, proto] of Object.entries(rawDump.module ?? {})) {
    if (!proto) continue;
    const eff = proto.effect ?? {};
    const category = String(proto.category ?? 'speed') as ModuleDef['category'];
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);
    modules.push({
      id,
      name: extractName(proto, id),
      category,
      tier: Number(proto.tier ?? 1),
      effects: {
        speed: Number(eff.speed ?? 0),
        productivity: Number(eff.productivity ?? 0),
        consumption: Number(eff.consumption ?? 0),
        pollution: Number(eff.pollution ?? 0),
        quality: Number(eff.quality ?? 0),
      },
      color: colorFromSubgroup('module'),
      iconPath,
    });
  }

  const beacons: BeaconDef[] = [];
  for (const [id, proto] of Object.entries(rawDump.beacon ?? {})) {
    if (!proto) continue;
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);
    beacons.push({
      id,
      name: extractName(proto, id),
      moduleSlots: Number(proto.module_slots ?? 2),
      distributionEffectivity: Number(
        proto.distribution_effectivity ?? (rulesVersion === '2.0' ? 1.5 : 0.5)
      ),
      profileMode: rulesVersion === '2.0' ? 'sqrt' : 'linear',
      energyUsageKw: parseEnergyToKw(proto.energy_usage, 480),
      tileSize: parseTileSize(proto.collision_box, { width: 3, height: 3 }),
      allowedEffects: Array.isArray(proto.allowed_effects)
        ? proto.allowed_effects
        : ['consumption', 'speed', 'pollution', 'quality'],
      iconPath,
    });
  }

  const electricPoles: ElectricPoleDef[] = [];
  for (const [id, proto] of Object.entries(rawDump['electric-pole'] ?? {})) {
    if (!proto) continue;
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);
    electricPoles.push({
      id,
      name: extractName(proto, id),
      tileSize: parseTileSize(proto.collision_box, { width: 1, height: 1 }),
      supplyAreaDistance: Number(proto.supply_area_distance ?? 3.5),
      maxWireDistance: Number(proto.maximum_wire_distance ?? 9),
      iconPath,
    });
  }

  const technologies: TechnologyDef[] = [];
  const techEntries = Object.entries(rawDump.technology ?? {});
  const validTechIds = new Set(techEntries.map(([id]) => id));
  for (const [id, proto] of techEntries) {
    if (!proto) continue;
    const effects = Array.isArray(proto.effects) ? proto.effects : [];
    const unlockedRecipes = effects
      .filter((e: any) => e?.type === 'unlock-recipe' && e?.recipe)
      .map((e: any) => String(e.recipe));

    const prodEffects = effects.filter(
      (e: any) => e?.type === 'change-recipe-productivity' && e?.recipe && typeof e?.change === 'number'
    );
    const recipeProductivityBonus =
      prodEffects.length > 0
        ? {
            recipeIds: prodEffects.map((e: any) => String(e.recipe)),
            bonusPerLevel: Number(prodEffects[0].change ?? 0.1),
            maxLevels: typeof proto.max_level === 'number' ? proto.max_level : undefined,
          }
        : undefined;

    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);

    technologies.push({
      id,
      name: extractName(proto, id),
      prerequisites: Array.isArray(proto.prerequisites)
        ? proto.prerequisites.map(String).filter((p: string) => validTechIds.has(p))
        : [],
      unlockedRecipes,
      recipeProductivityBonus,
      iconPath,
    });
  }

  const itemGroups: ItemGroupDef[] = [];
  for (const [id, proto] of Object.entries(rawDump['item-group'] ?? {})) {
    if (!proto) continue;
    const iconPath = extractIconPath(proto);
    trackIconMod(iconPath);
    itemGroups.push({
      id,
      name: extractName(proto, id),
      order: String(proto.order ?? id),
      iconPath,
    });
  }
  itemGroups.sort((a, b) => a.order.localeCompare(b.order));

  const itemSubgroups: ItemSubgroupDef[] = [];
  for (const [id, proto] of Object.entries(rawDump['item-subgroup'] ?? {})) {
    if (!proto) continue;
    itemSubgroups.push({
      id,
      groupId: String(proto.group ?? 'other'),
      order: String(proto.order ?? id),
    });
  }
  itemSubgroups.sort((a, b) => a.order.localeCompare(b.order));

  const mods =
    options.mods ??
    Array.from(detectedMods).map((name) => ({
      name,
      version: options.factorioVersion ?? '2.0.28',
    }));

  return {
    id: options.packId,
    name: options.packName,
    factorioVersion: options.factorioVersion ?? '2.0.28',
    rulesVersion,
    mods,
    items,
    fluids,
    recipes,
    machines,
    belts,
    inserters,
    modules,
    beacons,
    electricPoles: electricPoles.length > 0 ? electricPoles : undefined,
    technologies,
    itemGroups: itemGroups.length > 0 ? itemGroups : undefined,
    itemSubgroups: itemSubgroups.length > 0 ? itemSubgroups : undefined,
  };
}
