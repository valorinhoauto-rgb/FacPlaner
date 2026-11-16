/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { importFactorioDump, type DumpImportOptions, type FactorioDataRawDump } from './dumpImporter.ts';
import { SPACE_AGE_2_0_PACK } from './packs/space-age-2.0.ts';
import { SPACE_AGE_KRASTORIO2_PACK } from './packs/space-age-krastorio2.ts';
import { VANILLA_2_0_PACK } from './packs/vanilla-2.0.ts';
import type { GameDataPack, PackIndex } from './schema.ts';
import { buildPackIndex, validateGameDataPack, type ValidationResult } from './validator.ts';

class PackRegistry {
  private packs = new Map<string, GameDataPack>();
  private indexes = new Map<string, PackIndex>();

  constructor() {
    this.registerPack(VANILLA_2_0_PACK);
    this.registerPack(SPACE_AGE_2_0_PACK);
    this.registerPack(SPACE_AGE_KRASTORIO2_PACK);
  }

  registerPack(pack: GameDataPack): ValidationResult {
    const validation = validateGameDataPack(pack);
    if (!validation.valid) {
      throw new Error(
        `Invalid GameDataPack "${pack.id}": ${validation.errors.map((e) => e.message).join('; ')}`
      );
    }
    this.packs.set(pack.id, pack);
    this.indexes.set(pack.id, buildPackIndex(pack));
    return validation;
  }

  registerFromFactorioDump(
    rawDump: FactorioDataRawDump,
    options: DumpImportOptions
  ): { pack: GameDataPack; index: PackIndex; validation: ValidationResult } {
    const pack = importFactorioDump(rawDump, options);
    const validation = validateGameDataPack(pack);
    this.packs.set(pack.id, pack);
    const index = buildPackIndex(pack);
    this.indexes.set(pack.id, index);
    return { pack, index, validation };
  }

  getPack(packId: string): GameDataPack {
    const pack = this.packs.get(packId);
    if (!pack) {
      throw new Error(`GameDataPack "${packId}" is not registered.`);
    }
    return pack;
  }

  getIndex(packId: string): PackIndex {
    const index = this.indexes.get(packId);
    if (!index) {
      throw new Error(`PackIndex "${packId}" is not registered.`);
    }
    return index;
  }

  listPacks(): GameDataPack[] {
    return Array.from(this.packs.values());
  }
}

export const packRegistry = new PackRegistry();
export const DEFAULT_PACK_ID = VANILLA_2_0_PACK.id;
