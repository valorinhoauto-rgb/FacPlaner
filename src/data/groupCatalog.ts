/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ItemGroupDef, ItemSubgroupDef, PackIndex, RecipeDef, ResourceDef } from './schema.ts';

export interface CatalogItem {
  id: string;
  name: string;
  resource: ResourceDef;
  primaryRecipe: RecipeDef;
  allRecipesCount: number;
  subgroupId: string;
  modOrigin: string;
  iconPath?: string;
}

export interface CatalogSubgroup {
  id: string;
  order: string;
  items: CatalogItem[];
}

export interface CatalogGroup {
  id: string;
  name: string;
  order: string;
  iconPath?: string;
  fallbackIconId?: string;
  subgroups: CatalogSubgroup[];
  totalItems: number;
}

const DEFAULT_GROUPS: ItemGroupDef[] = [
  {
    id: 'logistics',
    name: 'Logística',
    order: 'a',
    iconPath: '__base__/graphics/item-group/logistics.png',
    fallbackIconId: 'express-transport-belt',
  },
  {
    id: 'production',
    name: 'Produção',
    order: 'b',
    iconPath: '__base__/graphics/item-group/production.png',
    fallbackIconId: 'assembling-machine-2',
  },
  {
    id: 'intermediate-products',
    name: 'Produtos Intermediários',
    order: 'c',
    iconPath: '__base__/graphics/item-group/intermediate-products.png',
    fallbackIconId: 'electronic-circuit',
  },
  {
    id: 'space',
    name: 'Espaço & Planetas',
    order: 'd',
    iconPath: '__space-age__/graphics/item-group/space.png',
    fallbackIconId: 'foundry',
  },
  {
    id: 'combat',
    name: 'Combate',
    order: 'e',
    iconPath: '__base__/graphics/item-group/military.png',
    fallbackIconId: 'piercing-rounds-magazine',
  },
  {
    id: 'other',
    name: 'Outros / Mods',
    order: 'z',
    fallbackIconId: 'iron-gear-wheel',
  },
];

const DEFAULT_SUBGROUPS: ItemSubgroupDef[] = [
  // Logistics
  { id: 'storage', groupId: 'logistics', order: 'a' },
  { id: 'belt', groupId: 'logistics', order: 'b' },
  { id: 'inserter', groupId: 'logistics', order: 'c' },
  { id: 'energy-pipe-distribution', groupId: 'logistics', order: 'd' },
  { id: 'train-transport', groupId: 'logistics', order: 'e' },
  { id: 'transport', groupId: 'logistics', order: 'e2' },
  { id: 'logistic-network', groupId: 'logistics', order: 'f' },
  { id: 'circuit-network', groupId: 'logistics', order: 'g' },
  { id: 'terrain', groupId: 'logistics', order: 'h' },

  // Production
  { id: 'tool', groupId: 'production', order: 'a1' },
  { id: 'energy', groupId: 'production', order: 'a2' },
  { id: 'extraction-machine', groupId: 'production', order: 'b' },
  { id: 'smelting-machine', groupId: 'production', order: 'c' },
  { id: 'production-machine', groupId: 'production', order: 'd' },
  { id: 'module', groupId: 'production', order: 'e' },

  // Intermediate Products
  { id: 'raw-resource', groupId: 'intermediate-products', order: 'a' },
  { id: 'raw-material', groupId: 'intermediate-products', order: 'b' },
  { id: 'fluid-recipes', groupId: 'intermediate-products', order: 'c' },
  { id: 'fluid', groupId: 'intermediate-products', order: 'd' },
  { id: 'intermediate-product', groupId: 'intermediate-products', order: 'e' },
  { id: 'intermediate-recipe', groupId: 'intermediate-products', order: 'e2' },
  { id: 'uranium-processing', groupId: 'intermediate-products', order: 'f' },
  { id: 'science-pack', groupId: 'intermediate-products', order: 'g' },

  // Space Age / Planetary
  { id: 'space-related', groupId: 'space', order: 'a' },
  { id: 'vulcanus-processes', groupId: 'space', order: 'b' },
  { id: 'fulgora-processes', groupId: 'space', order: 'c' },
  { id: 'aquilo-processes', groupId: 'space', order: 'd' },
  { id: 'gleba-processes', groupId: 'space', order: 'e' },

  // Combat
  { id: 'gun', groupId: 'combat', order: 'a' },
  { id: 'ammo', groupId: 'combat', order: 'b' },
  { id: 'capsule', groupId: 'combat', order: 'c' },
  { id: 'armor', groupId: 'combat', order: 'd' },
  { id: 'equipment', groupId: 'combat', order: 'e' },
  { id: 'defensive-structure', groupId: 'combat', order: 'f' },
  { id: 'turret', groupId: 'combat', order: 'g' },
];

const GROUP_NAME_PT: Record<string, string> = {
  logistics: 'Logística',
  production: 'Produção',
  'intermediate-products': 'Produtos Intermediários',
  space: 'Espaço & Planetas',
  combat: 'Combate',
  military: 'Combate',
  effects: 'Módulos & Efeitos',
  fluids: 'Fluidos',
  other: 'Outros',
};

export function detectModOrigin(id: string, iconPath?: string): string {
  if (iconPath) {
    const match = iconPath.match(/^__([^_][^/]*)__\//);
    if (match) {
      const rawMod = match[1];
      if (rawMod === 'base') return 'Base';
      if (rawMod === 'space-age') return 'Space Age';
      if (rawMod.toLowerCase().includes('krastorio2')) return 'Krastorio 2';
      return rawMod;
    }
  }
  if (id.startsWith('kr-')) return 'Krastorio 2';
  return 'Base';
}

function inferGroupIdFromSubgroup(subgroupId: string): string {
  const s = subgroupId.toLowerCase();
  if (s.includes('belt') || s.includes('inserter') || s.includes('pipe') || s.includes('logistic') || s.includes('train') || s.includes('rail')) {
    return 'logistics';
  }
  if (s.includes('machine') || s.includes('smelting') || s.includes('furnace') || s.includes('module') || s.includes('energy') || s.includes('beacon')) {
    return 'production';
  }
  if (s.includes('space') || s.includes('vulcanus') || s.includes('fulgora') || s.includes('aquilo') || s.includes('gleba') || s.includes('planet')) {
    return 'space';
  }
  if (s.includes('ammo') || s.includes('gun') || s.includes('combat') || s.includes('military') || s.includes('turret') || s.includes('defensive') || s.includes('capsule')) {
    return 'combat';
  }
  if (s.includes('raw') || s.includes('intermediate') || s.includes('science') || s.includes('fluid') || s.includes('uranium') || s.includes('circuit')) {
    return 'intermediate-products';
  }
  return 'other';
}

/**
 * Organizes all craftable items/fluids in a PackIndex into Factorio's native
 * ItemGroup tabs and ItemSubgroup horizontal rows.
 * Supports built-in packs (Vanilla 2.0, Space Age, Krastorio 2) AND arbitrary
 * imported `data-raw-dump.json` modpacks with custom `item-group`/`item-subgroup`.
 */
export function buildCraftableGroupCatalog(index: PackIndex): CatalogGroup[] {
  const groupDefs = new Map<string, ItemGroupDef>();
  for (const g of DEFAULT_GROUPS) {
    groupDefs.set(g.id, { ...g });
  }
  for (const g of index.pack.itemGroups ?? []) {
    const existing = groupDefs.get(g.id);
    groupDefs.set(g.id, {
      id: g.id,
      name: GROUP_NAME_PT[g.id] ?? (existing?.name ?? g.name),
      order: g.order || existing?.order || 'm',
      iconPath: g.iconPath ?? existing?.iconPath,
      fallbackIconId: existing?.fallbackIconId,
    });
  }

  const subgroupDefs = new Map<string, ItemSubgroupDef>();
  for (const sg of DEFAULT_SUBGROUPS) {
    subgroupDefs.set(sg.id, { ...sg });
  }
  for (const sg of index.pack.itemSubgroups ?? []) {
    subgroupDefs.set(sg.id, { ...sg });
  }

  // Group items while preserving Factorio pack insertion order within each subgroup
  const orderedResources: ResourceDef[] = [
    ...index.pack.items,
    ...index.pack.fluids,
  ];
  const seen = new Set<string>();
  const bucketsByGroup = new Map<string, Map<string, CatalogItem[]>>();

  for (const res of orderedResources) {
    if (seen.has(res.id)) continue;
    const recipes = index.recipesByProduct.get(res.id) ?? [];
    if (recipes.length === 0) continue;
    seen.add(res.id);

    const primaryRecipe = recipes[0];
    // For fluids tagged with generic 'fluid', prefer recipe subgroup (e.g. fluid-recipes / fulgora-processes)
    const subgroupId =
      res.kind === 'fluid' && res.subgroup === 'fluid' && primaryRecipe.subgroup
        ? primaryRecipe.subgroup
        : res.subgroup || primaryRecipe.subgroup || 'intermediate-product';

    let sgDef = subgroupDefs.get(subgroupId);
    if (!sgDef) {
      sgDef = {
        id: subgroupId,
        groupId: inferGroupIdFromSubgroup(subgroupId),
        order: `z-${subgroupId}`,
      };
      subgroupDefs.set(subgroupId, sgDef);
    }

    const groupId = groupDefs.has(sgDef.groupId) ? sgDef.groupId : 'other';
    const iconPath = res.iconPath ?? primaryRecipe.iconPath;

    let sgMap = bucketsByGroup.get(groupId);
    if (!sgMap) {
      sgMap = new Map();
      bucketsByGroup.set(groupId, sgMap);
    }
    let list = sgMap.get(subgroupId);
    if (!list) {
      list = [];
      sgMap.set(subgroupId, list);
    }
    list.push({
      id: res.id,
      name: res.name,
      resource: res,
      primaryRecipe,
      allRecipesCount: recipes.length,
      subgroupId,
      modOrigin: detectModOrigin(res.id, iconPath),
      iconPath,
    });
  }

  const groups: CatalogGroup[] = [];
  for (const [groupId, sgMap] of bucketsByGroup.entries()) {
    const def = groupDefs.get(groupId) ?? {
      id: groupId,
      name: GROUP_NAME_PT[groupId] ?? groupId,
      order: 'z',
    };

    const subgroups: CatalogSubgroup[] = [];
    let totalItems = 0;
    for (const [sgId, items] of sgMap.entries()) {
      if (items.length === 0) continue;
      totalItems += items.length;
      const sgDef = subgroupDefs.get(sgId);
      subgroups.push({
        id: sgId,
        order: sgDef?.order ?? sgId,
        items,
      });
    }
    subgroups.sort((a, b) => a.order.localeCompare(b.order));

    if (totalItems > 0) {
      const firstItem = subgroups[0]?.items[0];
      groups.push({
        id: def.id,
        name: def.name,
        order: def.order,
        iconPath: def.iconPath,
        fallbackIconId: def.fallbackIconId ?? firstItem?.id,
        subgroups,
        totalItems,
      });
    }
  }

  groups.sort((a, b) => a.order.localeCompare(b.order));
  return groups;
}
