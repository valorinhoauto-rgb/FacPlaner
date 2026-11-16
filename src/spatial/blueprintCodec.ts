/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deflate, inflate } from 'pako';
import type { Direction, PackIndex } from '../data/schema.ts';
import type { GridEntity, GridEntityKind } from './types.ts';

export interface FactorioBlueprintEntity {
  entity_number: number;
  name: string;
  position: { x: number; y: number };
  direction?: number;
  recipe?: string;
  type?: 'input' | 'output';
  items?: Array<{
    id: { name: string } | string;
    items?: {
      in_inventory?: Array<{ inventory: number; stack: number }>;
    };
  }> | Record<string, number>;
}

export interface FactorioBlueprintData {
  blueprint: {
    item: 'blueprint';
    label?: string;
    description?: string;
    entities: FactorioBlueprintEntity[];
    version?: number;
  };
}

// Factorio 2.0.28 encoded version integer: (2 << 48) | (0 << 32) | (28 << 16)
const FACTORIO_2_0_VERSION = 2 * 2 ** 48 + 28 * 2 ** 16;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts our discrete GridEntity list into official Factorio Blueprint JSON.
 */
export function buildBlueprintJson(
  entities: GridEntity[],
  label: string,
  description?: string
): FactorioBlueprintData {
  const bpEntities: FactorioBlueprintEntity[] = entities.map((e, idx) => {
    const entity: FactorioBlueprintEntity = {
      entity_number: idx + 1,
      name: e.name,
      // Factorio blueprint positions are centered on the entity footprint
      position: {
        x: e.tileX + e.width / 2,
        y: e.tileY + e.height / 2,
      },
    };

    if (e.direction !== 0) {
      entity.direction = e.direction;
    }
    if (e.recipeId) {
      entity.recipe = e.recipeId;
    }
    if (e.kind === 'underground-belt' && e.undergroundType) {
      entity.type = e.undergroundType;
    }
    if (e.moduleIds && e.moduleIds.length > 0) {
      const grouped = new Map<string, number[]>();
      e.moduleIds.forEach((modId, slotIdx) => {
        const list = grouped.get(modId) ?? [];
        list.push(slotIdx);
        grouped.set(modId, list);
      });
      entity.items = Array.from(grouped.entries()).map(([modId, slots]) => ({
        id: { name: modId },
        items: {
          in_inventory: slots.map((stack) => ({
            inventory: e.kind === 'beacon' ? 1 : 4, // 4 = assembling_machine_modules, 1 = beacon_modules
            stack,
          })),
        },
      }));
    }

    return entity;
  });

  return {
    blueprint: {
      item: 'blueprint',
      label,
      description,
      entities: bpEntities,
      version: FACTORIO_2_0_VERSION,
    },
  };
}

/**
 * Encodes a blueprint JSON structure into a Factorio-compatible `0eN...` string
 * (version byte '0' + Base64(zlib deflate)).
 */
export function encodeBlueprintString(
  entities: GridEntity[],
  label: string,
  description?: string
): string {
  const payload = buildBlueprintJson(entities, label, description);
  const jsonText = JSON.stringify(payload);
  const compressed = deflate(new TextEncoder().encode(jsonText), { level: 9 });
  return '0' + uint8ToBase64(compressed);
}

/**
 * Decodes an official Factorio `0eN...` blueprint string back into JSON.
 */
export function decodeBlueprintString(blueprintString: string): FactorioBlueprintData {
  const trimmed = blueprintString.trim();
  if (!trimmed.startsWith('0')) {
    throw new Error('Prefixo de versão de blueprint inválido (esperado "0eN...").');
  }
  const compressed = base64ToUint8(trimmed.slice(1));
  const inflated = inflate(compressed);
  const jsonText =
    typeof inflated === 'string' ? inflated : new TextDecoder().decode(inflated);
  const parsed = JSON.parse(jsonText) as FactorioBlueprintData & {
    blueprint_book?: { blueprints?: Array<FactorioBlueprintData>; label?: string };
  };
  if (parsed.blueprint) return parsed;
  if (parsed.blueprint_book?.blueprints?.[0]?.blueprint) {
    return parsed.blueprint_book.blueprints[0];
  }
  throw new Error('A string decodificada não contém um objeto "blueprint" válido.');
}

function normalizeDirection(rawDir: number | undefined, isFactorio2: boolean): Direction {
  const d = rawDir ?? 0;
  if (!isFactorio2 && d <= 7) {
    // Factorio 1.1: 0=N, 2=E, 4=S, 6=W -> multiply by 2
    const mapped = (d * 2) % 16;
    if (mapped === 0 || mapped === 4 || mapped === 8 || mapped === 12) return mapped;
  }
  if (d === 0 || d === 4 || d === 8 || d === 12) return d;
  if (d === 2) return 4;
  if (d === 6) return 12;
  return 0;
}

function inferEntityKindAndSize(
  name: string,
  direction: Direction,
  index: PackIndex
): { kind: GridEntityKind; width: number; height: number } {
  const machine = index.machinesById.get(name);
  if (machine) {
    return { kind: 'machine', width: machine.tileSize.width, height: machine.tileSize.height };
  }
  const beacon = index.beaconsById.get(name);
  if (beacon || name.includes('beacon')) {
    return {
      kind: 'beacon',
      width: beacon?.tileSize.width ?? 3,
      height: beacon?.tileSize.height ?? 3,
    };
  }
  if (name.includes('underground-belt')) {
    return { kind: 'underground-belt', width: 1, height: 1 };
  }
  if (name.includes('splitter')) {
    const horiz = direction === 0 || direction === 8;
    return { kind: 'splitter', width: horiz ? 2 : 1, height: horiz ? 1 : 2 };
  }
  if (name.includes('transport-belt')) {
    return { kind: 'transport-belt', width: 1, height: 1 };
  }
  if (name.includes('inserter')) {
    return { kind: 'inserter', width: 1, height: 1 };
  }
  if (name.includes('pipe-to-ground')) {
    return { kind: 'pipe-to-ground', width: 1, height: 1 };
  }
  if (name === 'pipe' || name.includes('-pipe')) {
    return { kind: 'pipe', width: 1, height: 1 };
  }
  if (name.includes('substation')) {
    return { kind: 'electric-pole', width: 2, height: 2 };
  }
  if (name.includes('electric-pole')) {
    return { kind: 'electric-pole', width: 1, height: 1 };
  }
  if (name.includes('assembling') || name.includes('furnace') || name.includes('refinery') || name.includes('chemical-plant') || name.includes('foundry') || name.includes('electromagnetic-plant') || name.includes('cryogenic-plant') || name.includes('crusher') || name.includes('filtration') || name.includes('electrolysis') || name.includes('condenser')) {
    const is5x5 = name.includes('refinery') || name.includes('foundry') || name.includes('cryogenic');
    const is4x4 = name.includes('electromagnetic');
    const s = is5x5 ? 5 : is4x4 ? 4 : 3;
    return { kind: 'machine', width: s, height: s };
  }
  return { kind: 'machine', width: 1, height: 1 };
}

/**
 * Parses an imported Factorio `0eN...` blueprint string directly into editable `GridEntity[]`
 * normalized around origin (0, 0).
 */
export function parseBlueprintToEntities(
  blueprintString: string,
  index: PackIndex
): { label: string; description?: string; entities: GridEntity[] } {
  const data = decodeBlueprintString(blueprintString);
  const bp = data.blueprint;
  const rawEntities = Array.isArray(bp.entities) ? bp.entities : [];
  // Factorio 2.0 version integer >= 2 << 48 (~562949953421312)
  const isFactorio2 = (bp.version ?? FACTORIO_2_0_VERSION) >= 2 * 2 ** 48;

  const converted: GridEntity[] = rawEntities.map((re, idx) => {
    const dir = normalizeDirection(re.direction, isFactorio2);
    const { kind, width, height } = inferEntityKindAndSize(re.name, dir, index);
    const tileX = Math.round(re.position.x - width / 2);
    const tileY = Math.round(re.position.y - height / 2);

    const moduleIds: string[] = [];
    if (Array.isArray(re.items)) {
      for (const itemSpec of re.items) {
        const modName = typeof itemSpec.id === 'string' ? itemSpec.id : itemSpec.id?.name;
        const count = itemSpec.items?.in_inventory?.length ?? 1;
        if (modName) {
          for (let c = 0; c < count; c++) moduleIds.push(modName);
        }
      }
    } else if (re.items && typeof re.items === 'object') {
      for (const [modName, count] of Object.entries(re.items)) {
        for (let c = 0; c < Number(count); c++) moduleIds.push(modName);
      }
    }

    const recipe = re.recipe ? index.recipesById.get(re.recipe) : undefined;
    const accentColor = recipe
      ? index.resourcesById.get(recipe.mainProductId)?.color
      : undefined;

    return {
      entityNumber: re.entity_number ?? idx + 1,
      kind,
      name: re.name,
      tileX,
      tileY,
      width,
      height,
      direction: dir,
      recipeId: re.recipe,
      moduleIds: moduleIds.length > 0 ? moduleIds : undefined,
      undergroundType: re.type,
      inserterReach: re.name.includes('long') ? 2 : kind === 'inserter' ? 1 : undefined,
      accentColor,
    };
  });

  // Shift so minX/minY sit neatly near origin
  if (converted.length > 0) {
    const minX = Math.min(...converted.map((e) => e.tileX));
    const maxY = Math.max(...converted.map((e) => e.tileY + e.height));
    for (const e of converted) {
      e.tileX -= minX;
      e.tileY -= maxY;
    }
  }

  return {
    label: bp.label ?? 'Blueprint Importada',
    description: bp.description,
    entities: converted,
  };
}
