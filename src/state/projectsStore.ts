/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_PACK_ID } from '../data/packRegistry.ts';
import type { PlanConfig, RateUnit } from '../engine/types.ts';
import type { GridEntity } from '../spatial/types.ts';

export interface FactoryProject {
  id: string;
  name: string;
  description: string;
  config: PlanConfig;
  rateUnit: RateUnit;
  compactionMode: 'compact' | 'standard';
  layoutOptions?: {
    includeBeacons?: boolean;
    includePowerPoles?: boolean;
    directInsertion?: boolean;
  };
  /** Optional user-edited spatial layout entities (overrides auto-layout until reset) */
  customEntities?: GridEntity[];
  createdAt: string;
  updatedAt: string;
}

export const RATE_UNIT_MULTIPLIER: Record<RateUnit, number> = {
  per_second: 1,
  per_minute: 60,
  per_hour: 3600,
};

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  per_second: '/s',
  per_minute: '/min',
  per_hour: '/h',
};

export function formatRate(perSec: number, unit: RateUnit): string {
  const val = perSec * RATE_UNIT_MULTIPLIER[unit];
  if (Math.abs(val) < 1e-4) return `0${RATE_UNIT_LABEL[unit]}`;
  if (val >= 100) return `${val.toFixed(1)}${RATE_UNIT_LABEL[unit]}`;
  if (val >= 10) return `${val.toFixed(2)}${RATE_UNIT_LABEL[unit]}`;
  return `${val.toFixed(2)}${RATE_UNIT_LABEL[unit]}`;
}

export const PROJECT_TEMPLATES: Array<Omit<FactoryProject, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'Electronic Circuits · 15/s (1 Esteira)',
    description: 'Razão clássica 3:2 com fornalhas elétricas, cabos de cobre e 1 esteira amarela cheia.',
    rateUnit: 'per_second',
    compactionMode: 'compact',
    config: {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'electronic-circuit', ratePerSec: 15 }],
      defaultBeltId: 'transport-belt',
      defaultInserterId: 'fast-inserter',
    },
  },
  {
    name: 'Automation + Logistic Science · 60/min',
    description: 'Linha inicial combinando Ciência Vermelha e Ciência Verde em 1 pacote/s.',
    rateUnit: 'per_minute',
    compactionMode: 'compact',
    config: {
      packId: DEFAULT_PACK_ID,
      targets: [
        { itemId: 'automation-science-pack', ratePerSec: 1 },
        { itemId: 'logistic-science-pack', ratePerSec: 1 },
      ],
      defaultBeltId: 'transport-belt',
      defaultInserterId: 'inserter',
    },
  },
  {
    name: 'Processing Units + Refinaria · 30/min',
    description: 'Cadeia completa com Refinamento Avançado de Petróleo, Cracking e Ácido Sulfúrico.',
    rateUnit: 'per_minute',
    compactionMode: 'compact',
    config: {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'processing-unit', ratePerSec: 0.5 }],
      defaultBeltId: 'express-transport-belt',
      defaultInserterId: 'fast-inserter',
      stageOverrides: {
        'processing-unit': {
          machineId: 'assembling-machine-3',
          moduleIds: [
            'productivity-module-2',
            'productivity-module-2',
            'productivity-module-2',
            'productivity-module-2',
          ],
        },
      },
    },
  },
  {
    name: 'Space Age · Electromagnetic Science (60/min)',
    description: 'Planta Eletromagnética de Fulgora com +50% produtividade base, Supercapacitores e Esteiras Turbo.',
    rateUnit: 'per_minute',
    compactionMode: 'compact',
    config: {
      packId: 'factorio-space-age-2.0',
      targets: [{ itemId: 'electromagnetic-science-pack', ratePerSec: 1 }],
      defaultBeltId: 'turbo-transport-belt',
      defaultInserterId: 'stack-inserter',
      stageOverrides: {
        'electromagnetic-science-pack': {
          machineId: 'electromagnetic-plant',
          moduleIds: ['productivity-module-3', 'productivity-module-3', 'productivity-module-3', 'productivity-module-3', 'productivity-module-3'],
          beacon: {
            beaconId: 'beacon',
            count: 2,
            moduleIds: ['speed-module-3', 'speed-module-3'],
          },
        },
      },
    },
  },
  {
    name: 'Space Age + Krastorio 2 · Singularity Tech Card (60/min)',
    description: 'Cadeia integrada de K2 + Space Age com Crusher, Quartzo, Silício, AI Core, Imersite e Ácido Nítrico.',
    rateUnit: 'per_minute',
    compactionMode: 'compact',
    config: {
      packId: 'factorio-space-age-krastorio2',
      targets: [{ itemId: 'kr-singularity-tech-card', ratePerSec: 1 }],
      defaultBeltId: 'kr-superior-transport-belt',
      defaultInserterId: 'kr-superior-inserter',
      stageOverrides: {
        'kr-singularity-tech-card': {
          machineId: 'kr-advanced-assembling-machine',
          moduleIds: ['productivity-module-3', 'productivity-module-3'],
        },
      },
    },
  },
  {
    name: 'Kovarex Enrichment Loop · 6/min',
    description: 'Ciclo de catalisador U-235 com Centrífugas e módulos de Produtividade 3.',
    rateUnit: 'per_minute',
    compactionMode: 'compact',
    config: {
      packId: DEFAULT_PACK_ID,
      targets: [{ itemId: 'uranium-235', ratePerSec: 0.1 }],
      defaultBeltId: 'fast-transport-belt',
      defaultInserterId: 'fast-inserter',
      stageOverrides: {
        'kovarex-enrichment-process': {
          moduleIds: ['productivity-module-3', 'productivity-module-3'],
        },
      },
    },
  },
];

const STORAGE_KEY = 'factorio_planner_projects_v1';

export function createBlankProject(
  packId: string = DEFAULT_PACK_ID,
  labels?: { name?: string; description?: string }
): FactoryProject {
  const now = new Date().toISOString();
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: labels?.name ?? 'Nova Esquemática',
    description:
      labels?.description ??
      'Escolha o item desejado no Editor para começar a montar a linha de produção.',
    rateUnit: 'per_minute',
    compactionMode: 'compact',
    config: {
      packId,
      targets: [],
      defaultBeltId: 'fast-transport-belt',
      defaultInserterId: 'fast-inserter',
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createProjectFromTemplate(
  tpl: Omit<FactoryProject, 'id' | 'createdAt' | 'updatedAt'>
): FactoryProject {
  const now = new Date().toISOString();
  return {
    ...structuredClone(tpl),
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadSavedProjects(): FactoryProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = [createBlankProject()];
      saveProjects(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as FactoryProject[];
    }
  } catch {
    // ignore storage errors
  }
  return [createBlankProject()];
}

export function saveProjects(projects: FactoryProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore storage quota errors
  }
}
