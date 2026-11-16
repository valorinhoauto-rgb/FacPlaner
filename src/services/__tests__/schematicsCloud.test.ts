/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { packRegistry } from '../../data/packRegistry.ts';
import { solveProductionPlan } from '../../engine/solver.ts';
import { synthesizeFactoryLayout } from '../../spatial/layoutSynthesizer.ts';
import {
  createBlankProject,
  createProjectFromTemplate,
  PROJECT_TEMPLATES,
} from '../../state/projectsStore.ts';
import {
  buildCompactSchematicPayload,
  hydrateFactoryProject,
  normalizeSchematicId,
} from '../schematicsCloud.ts';

describe('Cloud Schematics Compact Serialization', () => {
  it('starts blank schematics with zero targets and roundtrips cleanly', () => {
    const blank = createBlankProject();
    expect(blank.config.targets).toEqual([]);

    const payload = buildCompactSchematicPayload(blank, 'user_123');
    expect(payload.targets).toEqual([]);

    const restored = hydrateFactoryProject({
      ...payload,
      createdAt: blank.createdAt,
      updatedAt: blank.updatedAt,
    });
    expect(restored.config.targets).toEqual([]);
    expect(restored.name).toBe(blank.name);
  });

  it('stores only minimal configuration when no manual 2D edits exist', () => {
    const project = createProjectFromTemplate(PROJECT_TEMPLATES[0]);
    const payload = buildCompactSchematicPayload(project, 'user_123');

    expect(payload.ownerId).toBe('user_123');
    expect(payload.targets).toEqual([{ itemId: 'electronic-circuit', ratePerSec: 15 }]);
    expect(payload.blueprintString).toBeUndefined();
    expect(JSON.stringify(payload).length).toBeLessThan(600);

    const restored = hydrateFactoryProject({
      ...payload,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    expect(restored.name).toBe(project.name);
    expect(restored.config.targets).toEqual(project.config.targets);
    expect(restored.customEntities).toBeUndefined();
  });

  it('compresses manual 2D customEntities into a Factorio 0eN blueprintString and hydrates them back', () => {
    const base = createProjectFromTemplate(PROJECT_TEMPLATES[0]);
    const index = packRegistry.getIndex(base.config.packId);
    const solved = solveProductionPlan(index, base.config);
    const layout = synthesizeFactoryLayout(index, solved, base.config);
    base.customEntities = layout.entities;

    const payload = buildCompactSchematicPayload(base, 'user_123');
    expect(payload.blueprintString).toBeDefined();
    expect(payload.blueprintString!.startsWith('0')).toBe(true);
    // Compressed string must be dramatically smaller than raw GridEntity[] JSON
    expect(payload.blueprintString!.length).toBeLessThan(JSON.stringify(layout.entities).length / 4);

    const restored = hydrateFactoryProject({
      ...payload,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    });
    expect(restored.customEntities?.length).toBe(layout.entities.length);
  });

  it('normalizes invalid characters from schematic IDs cleanly', () => {
    expect(normalizeSchematicId('proj 123/abc!@#')).toBe('proj_123_abc___');
  });

  it('compresses imported gridFrame into gridFrameString and preserves layoutOptions.inputSide', async () => {
    const { createSampleSubstationGridString, parseBlueprintToEntities } = await import(
      '../../spatial/blueprintCodec.ts'
    );
    const project = createProjectFromTemplate(PROJECT_TEMPLATES[0]);
    const index = packRegistry.getIndex(project.config.packId);
    const parsedFrame = parseBlueprintToEntities(createSampleSubstationGridString(), index);

    project.gridFrame = parsedFrame.entities.map((e) => ({ ...e, isGridFrame: true }));
    project.layoutOptions = { inputSide: 'west', includePowerPoles: true };

    const payload = buildCompactSchematicPayload(project, 'user_123');
    expect(payload.gridFrameString).toBeDefined();
    expect(payload.gridFrameString!.startsWith('0eN')).toBe(true);
    expect(payload.layoutOptions?.inputSide).toBe('west');

    const restored = hydrateFactoryProject({
      ...payload,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    expect(restored.layoutOptions?.inputSide).toBe('west');
    expect(restored.gridFrame?.length).toBe(parsedFrame.entities.length);
    expect(restored.gridFrame?.every((e) => e.isGridFrame === true)).toBe(true);
  });
});
