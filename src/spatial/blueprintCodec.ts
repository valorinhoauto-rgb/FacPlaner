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
  use_filters?: boolean;
  filters?: Array<{ index: number; name: string }>;
  items?: Array<{
    id: { name: string } | string;
    items?: {
      in_inventory?: Array<{ inventory: number; stack: number }>;
    };
  }> | Record<string, number>;
  [key: string]: unknown;
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
  // Preserve original entity_number on imported grid frame entities so circuit/copper wires stay intact
  const usedNumbers = new Set<number>();
  const finalNumberByEntity = new Map<GridEntity, number>();
  const oldToNewFrameNumber = new Map<number, number>();
  let nextSeq = 1;

  for (const e of entities) {
    if (e.isGridFrame && e.preservedRawEntity) {
      let assigned = e.entityNumber;
      while (assigned < 1 || usedNumbers.has(assigned)) {
        assigned = nextSeq++;
      }
      usedNumbers.add(assigned);
      finalNumberByEntity.set(e, assigned);
      if (typeof e.preservedRawEntity.entity_number === 'number') {
        oldToNewFrameNumber.set(e.preservedRawEntity.entity_number, assigned);
      }
      if (assigned >= nextSeq) nextSeq = assigned + 1;
    }
  }

  for (const e of entities) {
    if (finalNumberByEntity.has(e)) continue;
    while (usedNumbers.has(nextSeq)) nextSeq++;
    usedNumbers.add(nextSeq);
    finalNumberByEntity.set(e, nextSeq);
    nextSeq++;
  }

  const remapWireList = (rawWires: unknown): unknown => {
    if (!Array.isArray(rawWires)) return rawWires;
    return rawWires.map((w) => {
      if (Array.isArray(w) && w.length >= 4 && typeof w[0] === 'number' && typeof w[2] === 'number') {
        return [
          oldToNewFrameNumber.get(w[0]) ?? w[0],
          w[1],
          oldToNewFrameNumber.get(w[2]) ?? w[2],
          w[3],
          ...w.slice(4),
        ];
      }
      return w;
    });
  };

  const remapConnections = (rawConn: unknown): unknown => {
    if (!rawConn || typeof rawConn !== 'object' || Array.isArray(rawConn)) return rawConn;
    const out: Record<string, unknown> = {};
    for (const [portKey, portVal] of Object.entries(rawConn as Record<string, unknown>)) {
      if (portVal && typeof portVal === 'object' && !Array.isArray(portVal)) {
        const portOut: Record<string, unknown> = {};
        for (const [colorKey, links] of Object.entries(portVal as Record<string, unknown>)) {
          if (Array.isArray(links)) {
            portOut[colorKey] = links.map((lnk) => {
              if (lnk && typeof lnk === 'object' && 'entity_id' in lnk) {
                const eid = Number((lnk as { entity_id: number }).entity_id);
                return {
                  ...(lnk as Record<string, unknown>),
                  entity_id: oldToNewFrameNumber.get(eid) ?? eid,
                };
              }
              return lnk;
            });
          } else {
            portOut[colorKey] = links;
          }
        }
        out[portKey] = portOut;
      } else {
        out[portKey] = portVal;
      }
    }
    return out;
  };

  const bpEntities: FactorioBlueprintEntity[] = entities.map((e) => {
    const entityNumber = finalNumberByEntity.get(e) ?? e.entityNumber;

    if (e.isGridFrame && e.preservedRawEntity) {
      const cloned = structuredClone(e.preservedRawEntity) as FactorioBlueprintEntity;
      cloned.entity_number = entityNumber;
      if (cloned.wires !== undefined) {
        cloned.wires = remapWireList(cloned.wires);
      }
      if (cloned.connections !== undefined) {
        cloned.connections = remapConnections(cloned.connections);
      }
      if (Array.isArray(cloned.neighbours)) {
        cloned.neighbours = cloned.neighbours.map((n) =>
          typeof n === 'number' ? oldToNewFrameNumber.get(n) ?? n : n
        );
      }
      return cloned;
    }

    const entity: FactorioBlueprintEntity = {
      entity_number: entityNumber,
      name: e.name,
      // Factorio blueprint positions are centered on the entity footprint (preserving sub-tile offsets)
      position: {
        x: e.tileX + (e.bpOffsetX ?? 0) + e.width / 2,
        y: e.tileY + (e.bpOffsetY ?? 0) + e.height / 2,
      },
    };

    const exportDir = e.rawDirection ?? e.direction;
    if (exportDir !== 0) {
      entity.direction = exportDir;
    }
    if (e.recipeId) {
      entity.recipe = e.recipeId;
    }
    if (e.kind === 'underground-belt' && e.undergroundType) {
      entity.type = e.undergroundType;
    }
    if (e.kind === 'inserter' && e.isFiltered && e.inserterItems && e.inserterItems.length > 0) {
      entity.use_filters = true;
      entity.filters = e.inserterItems.slice(0, 5).map((item, fIdx) => ({
        index: fIdx + 1,
        name: item,
      }));
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

function normalizeDirection(
  rawDir: number | undefined,
  isFactorio2: boolean
): { direction: Direction; rawDirection: number } {
  const d = rawDir ?? 0;
  let raw16: number;
  if (!isFactorio2 && d <= 7) {
    raw16 = ((d * 2) % 16 + 16) % 16;
  } else {
    raw16 = ((Math.round(d) % 16) + 16) % 16;
  }
  const cardinal = ((Math.round(raw16 / 4) * 4) % 16) as Direction;
  return { direction: cardinal, rawDirection: raw16 };
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

  // Power distribution (kept as electric-pole so power wires render cleanly)
  if (name.includes('substation') || name.includes('big-electric-pole')) {
    return { kind: 'electric-pole', width: 2, height: 2 };
  }
  if (name.includes('electric-pole')) {
    return { kind: 'electric-pole', width: 1, height: 1 };
  }

  // Structural / Rail / Logistics / Defense Grid Entities
  if (name.includes('rail-ramp')) {
    const horiz = direction === 4 || direction === 12;
    return { kind: 'grid-obstacle', width: horiz ? 16 : 4, height: horiz ? 4 : 16 };
  }
  if (name.includes('rail-support')) {
    return { kind: 'grid-obstacle', width: 3, height: 3 };
  }
  if (name.includes('curved-rail') || name.includes('elevated-curved-rail')) {
    return { kind: 'grid-obstacle', width: 4, height: 4 };
  }
  if (
    name.includes('straight-rail') ||
    name.includes('half-diagonal-rail') ||
    name.includes('elevated-straight-rail') ||
    name.includes('elevated-half-diagonal-rail')
  ) {
    return { kind: 'grid-obstacle', width: 2, height: 2 };
  }
  if (
    name.includes('rail-signal') ||
    name.includes('rail-chain-signal') ||
    name.includes('stone-wall') ||
    name === 'gate' ||
    name.includes('-gate') ||
    name.includes('small-lamp') ||
    name.includes('combinator') ||
    name.includes('chest')
  ) {
    return { kind: 'grid-obstacle', width: 1, height: 1 };
  }
  if (name.includes('roboport')) {
    return { kind: 'grid-obstacle', width: 4, height: 4 };
  }
  if (name.includes('cargo-landing-pad')) {
    return { kind: 'grid-obstacle', width: 8, height: 8 };
  }
  if (
    name.includes('radar') ||
    name.includes('storage-tank') ||
    name.includes('solar-panel') ||
    name.includes('artillery-turret')
  ) {
    return { kind: 'grid-obstacle', width: 3, height: 3 };
  }
  if (
    name.includes('train-stop') ||
    name.includes('accumulator') ||
    name.includes('turret')
  ) {
    return { kind: 'grid-obstacle', width: 2, height: 2 };
  }

  // Extraction & Production entities not directly in current pack index
  if (name.includes('big-mining-drill')) {
    return { kind: 'machine', width: 5, height: 5 };
  }
  if (name.includes('mining-drill') || name.includes('pumpjack')) {
    return { kind: 'machine', width: 3, height: 3 };
  }
  if (name.includes('offshore-pump')) {
    const horiz = direction === 4 || direction === 12;
    return { kind: 'machine', width: horiz ? 2 : 1, height: horiz ? 1 : 2 };
  }
  if (
    name.includes('assembling') ||
    name.includes('furnace') ||
    name.includes('refinery') ||
    name.includes('chemical-plant') ||
    name.includes('foundry') ||
    name.includes('electromagnetic-plant') ||
    name.includes('cryogenic-plant') ||
    name.includes('crusher') ||
    name.includes('filtration') ||
    name.includes('electrolysis') ||
    name.includes('condenser') ||
    name.includes('greenhouse') ||
    name.includes('bio-lab') ||
    name.includes('matter-plant') ||
    name.includes('matter-assembler') ||
    name.includes('quantum-computer') ||
    name.includes('research-server') ||
    name.includes('air-purifier') ||
    name.includes('kr-singularity-lab')
  ) {
    const is8x8 = name.includes('singularity-lab');
    const is7x7 =
      name.includes('greenhouse') ||
      name.includes('bio-lab') ||
      name.includes('matter-plant') ||
      name.includes('matter-assembler') ||
      name.includes('crusher') ||
      name.includes('filtration') ||
      name.includes('kr-advanced-assembling') ||
      name.includes('kr-advanced-chemical') ||
      name.includes('kr-advanced-furnace');
    const is6x6 = name.includes('quantum-computer');
    const is5x5 =
      name.includes('refinery') ||
      name.includes('foundry') ||
      name.includes('cryogenic') ||
      name.includes('electrolysis') ||
      name.includes('condenser');
    const is4x4 = name.includes('electromagnetic') || name.includes('air-purifier');
    const s = is8x8 ? 8 : is7x7 ? 7 : is6x6 ? 6 : is5x5 ? 5 : is4x4 ? 4 : 3;
    return { kind: 'machine', width: s, height: s };
  }
  return { kind: 'grid-obstacle', width: 1, height: 1 };
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
    const { direction: dir, rawDirection } = normalizeDirection(re.direction, isFactorio2);
    const { kind, width, height } = inferEntityKindAndSize(re.name, dir, index);
    const exactTileX = re.position.x - width / 2;
    const exactTileY = re.position.y - height / 2;
    const tileX = Math.round(exactTileX);
    const tileY = Math.round(exactTileY);
    const deltaX = exactTileX - tileX;
    const deltaY = exactTileY - tileY;

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

    const parsedFilters = Array.isArray(re.filters)
      ? re.filters.map((f) => f?.name).filter((f): f is string => Boolean(f))
      : [];
    const isFiltered = Boolean(re.use_filters || parsedFilters.length > 0);

    const preservedRawEntity = structuredClone(re) as Record<string, unknown>;
    if (re.direction !== undefined && !isFactorio2) {
      preservedRawEntity.direction = rawDirection;
    }

    return {
      entityNumber: re.entity_number ?? idx + 1,
      kind,
      name: re.name,
      tileX,
      tileY,
      bpOffsetX: Math.abs(deltaX) > 1e-4 ? Math.round(deltaX * 1000) / 1000 : undefined,
      bpOffsetY: Math.abs(deltaY) > 1e-4 ? Math.round(deltaY * 1000) / 1000 : undefined,
      width,
      height,
      direction: dir,
      rawDirection: rawDirection !== dir ? rawDirection : undefined,
      recipeId: re.recipe,
      moduleIds: moduleIds.length > 0 ? moduleIds : undefined,
      undergroundType: re.type,
      inserterReach: re.name.includes('long') ? 2 : kind === 'inserter' ? 1 : undefined,
      inserterItems: parsedFilters.length > 0 ? parsedFilters : undefined,
      isFiltered: isFiltered || undefined,
      accentColor,
      preservedRawEntity,
    };
  });

  // Shift so minX/minY sit neatly near origin
  if (converted.length > 0) {
    const minX = Math.min(...converted.map((e) => e.tileX));
    const maxY = Math.max(...converted.map((e) => e.tileY + e.height));
    for (const e of converted) {
      e.tileX -= minX;
      e.tileY -= maxY;
      if (e.preservedRawEntity) {
        const pos = e.preservedRawEntity.position as { x: number; y: number } | undefined;
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          e.preservedRawEntity.position = {
            x: pos.x - minX,
            y: pos.y - maxY,
          };
        }
      }
    }
  }

  return {
    label: bp.label ?? 'Blueprint Importada',
    description: bp.description,
    entities: converted,
  };
}

/**
 * Generates a realistic 48×48 Factorio Rail City Block blueprint string (`0eN...`)
 * with outer straight-rail perimeter, stone-wall corners, corner substations, and a central roboport.
 */
export function createSampleRailCityBlockString(): string {
  const entities: GridEntity[] = [];
  let num = 1;
  const size = 48;

  // Top & bottom straight-rail corridors (2×2 segments)
  for (let x = 2; x <= size - 4; x += 2) {
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'straight-rail',
      tileX: x,
      tileY: -size,
      width: 2,
      height: 2,
      direction: 4,
    });
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'straight-rail',
      tileX: x,
      tileY: -2,
      width: 2,
      height: 2,
      direction: 4,
    });
  }

  // Left & right straight-rail corridors (2×2 segments)
  for (let y = -size + 2; y <= -4; y += 2) {
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'straight-rail',
      tileX: 0,
      tileY: y,
      width: 2,
      height: 2,
      direction: 0,
    });
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'straight-rail',
      tileX: size - 2,
      tileY: y,
      width: 2,
      height: 2,
      direction: 0,
    });
  }

  // Corner rail signals + walls
  const signalSpots = [
    { x: 2, y: -size + 2 },
    { x: size - 3, y: -size + 2 },
    { x: 2, y: -3 },
    { x: size - 3, y: -3 },
  ];
  for (const s of signalSpots) {
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'rail-signal',
      tileX: s.x,
      tileY: s.y,
      width: 1,
      height: 1,
      direction: 0,
    });
  }

  // Interior corner substations (2×2)
  const subSpots = [
    { x: 4, y: -size + 4 },
    { x: size - 6, y: -size + 4 },
    { x: 4, y: -6 },
    { x: size - 6, y: -6 },
  ];
  for (const s of subSpots) {
    entities.push({
      entityNumber: num++,
      kind: 'electric-pole',
      name: 'substation',
      tileX: s.x,
      tileY: s.y,
      width: 2,
      height: 2,
      direction: 0,
    });
  }

  // Central Roboport (4×4) right in the middle of the block
  entities.push({
    entityNumber: num++,
    kind: 'grid-obstacle',
    name: 'roboport',
    tileX: Math.floor(size / 2) - 2,
    tileY: -Math.floor(size / 2) - 2,
    width: 4,
    height: 4,
    direction: 0,
  });

  return encodeBlueprintString(
    entities,
    'City Block 48×48 (Trilhos + Roboport)',
    'Exemplo de grid ferroviária 48×48 para testar adaptação automática de produção.'
  );
}

/**
 * Generates a compact 36×36 Factorio Substation + Wall grid blueprint string (`0eN...`).
 */
export function createSampleSubstationGridString(): string {
  const entities: GridEntity[] = [];
  let num = 1;
  const size = 36;

  // Perimeter stone-wall border
  for (let x = 0; x < size; x++) {
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'stone-wall',
      tileX: x,
      tileY: -size,
      width: 1,
      height: 1,
      direction: 0,
    });
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'stone-wall',
      tileX: x,
      tileY: -1,
      width: 1,
      height: 1,
      direction: 0,
    });
  }
  for (let y = -size + 1; y < -1; y++) {
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'stone-wall',
      tileX: 0,
      tileY: y,
      width: 1,
      height: 1,
      direction: 0,
    });
    entities.push({
      entityNumber: num++,
      kind: 'grid-obstacle',
      name: 'stone-wall',
      tileX: size - 1,
      tileY: y,
      width: 1,
      height: 1,
      direction: 0,
    });
  }

  // 2×2 substations spaced every 16 tiles inside
  for (const sx of [3, 18, 31]) {
    for (const sy of [-size + 3, -19, -5]) {
      entities.push({
        entityNumber: num++,
        kind: 'electric-pole',
        name: 'substation',
        tileX: sx,
        tileY: sy,
        width: 2,
        height: 2,
        direction: 0,
      });
    }
  }

  return encodeBlueprintString(
    entities,
    'Grid de Subestações 36×36',
    'Grid compacta murada com subestações distribuídas para blocos modulares.'
  );
}
