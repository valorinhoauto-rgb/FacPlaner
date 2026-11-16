/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type FieldValue,
} from 'firebase/firestore';
import { packRegistry } from '../data/packRegistry.ts';
import type { PlanConfig, RateUnit, StageOverride } from '../engine/types.ts';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import { encodeBlueprintString, parseBlueprintToEntities } from '../spatial/blueprintCodec.ts';
import type { FactoryProject } from '../state/projectsStore.ts';

const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function normalizeSchematicId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  if (cleaned.length > 0 && VALID_ID_RE.test(cleaned)) return cleaned;
  return `proj_${Date.now()}`;
}

function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return obj;
}

function sanitizeDisplayName(user: User): string {
  const raw = (user.displayName || user.email?.split('@')[0] || 'Engenheiro').trim();
  return raw.slice(0, 100) || 'Engenheiro';
}

/**
 * Ensures the minimal UserProfile document exists at /users/{uid}.
 * Stores only uid, displayName, and server timestamps (no email/PII).
 */
export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayName = sanitizeDisplayName(user);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.displayName !== displayName) {
      await updateDoc(ref, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

interface CompactSchematicPayload {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  packId: string;
  rateUnit: RateUnit;
  compactionMode: 'compact' | 'standard';
  targets: Array<{ itemId: string; ratePerSec: number }>;
  defaultBeltId?: string;
  defaultInserterId?: string;
  rawResourceOverrides?: string[];
  preferredRecipes?: Record<string, string>;
  stageOverrides?: Record<string, StageOverride>;
  researchProductivityBonuses?: Record<string, number>;
  layoutOptions?: {
    includeBeacons?: boolean;
    includePowerPoles?: boolean;
    directInsertion?: boolean;
  };
  blueprintString?: string;
}

/**
 * Converts a full FactoryProject into a compact, lightweight Firestore schematic payload:
 * - Only essential production targets, overrides, and layout flags (~0.5–1.5 KB).
 * - Manually edited 2D grids are compressed to a Factorio 0eN... blueprint string instead
 *   of storing hundreds of raw GridEntity objects.
 */
export function buildCompactSchematicPayload(
  project: FactoryProject,
  ownerId: string
): CompactSchematicPayload {
  const id = normalizeSchematicId(project.id);
  const name = (project.name || 'Esquemática sem nome').trim().slice(0, 120) || 'Esquemática';
  const description = (project.description || '').trim().slice(0, 300);
  const rawPackId = (project.config.packId || 'factorio-vanilla-2.0').replace(/[^a-zA-Z0-9_.-]/g, '-');
  const packId = rawPackId.slice(0, 80) || 'factorio-vanilla-2.0';

  const targets = (project.config.targets || [])
    .filter((t) => typeof t.itemId === 'string' && t.itemId.trim().length > 0 && t.ratePerSec > 0)
    .slice(0, 12)
    .map((t) => ({
      itemId: t.itemId.slice(0, 80),
      ratePerSec: Number(t.ratePerSec),
    }));

  if (targets.length === 0) {
    targets.push({ itemId: 'electronic-circuit', ratePerSec: 1 });
  }

  const payload: CompactSchematicPayload = {
    id,
    ownerId,
    name,
    description,
    packId,
    rateUnit: project.rateUnit || 'per_minute',
    compactionMode: project.compactionMode || 'compact',
    targets,
  };

  if (project.config.defaultBeltId) {
    payload.defaultBeltId = project.config.defaultBeltId.slice(0, 80);
  }
  if (project.config.defaultInserterId) {
    payload.defaultInserterId = project.config.defaultInserterId.slice(0, 80);
  }
  if (project.config.rawResourceOverrides && project.config.rawResourceOverrides.length > 0) {
    payload.rawResourceOverrides = project.config.rawResourceOverrides
      .slice(0, 40)
      .map((x: string) => x.slice(0, 80));
  }
  if (project.config.preferredRecipes && Object.keys(project.config.preferredRecipes).length > 0) {
    const entries = Object.entries(project.config.preferredRecipes).slice(0, 80);
    payload.preferredRecipes = Object.fromEntries(entries);
  }
  if (project.config.stageOverrides && Object.keys(project.config.stageOverrides).length > 0) {
    const entries = Object.entries(project.config.stageOverrides).slice(0, 80);
    payload.stageOverrides = stripUndefined(Object.fromEntries(entries));
  }
  if (
    project.config.researchProductivityBonuses &&
    Object.keys(project.config.researchProductivityBonuses).length > 0
  ) {
    const entries = Object.entries(project.config.researchProductivityBonuses).slice(0, 40);
    payload.researchProductivityBonuses = Object.fromEntries(entries);
  }
  if (project.layoutOptions) {
    const cleanOpts = stripUndefined(project.layoutOptions);
    if (Object.keys(cleanOpts).length > 0) {
      payload.layoutOptions = cleanOpts;
    }
  }
  if (project.customEntities && project.customEntities.length > 0) {
    const encoded = encodeBlueprintString(project.customEntities, name, description);
    if (encoded.length <= 32000) {
      payload.blueprintString = encoded;
    }
  }

  return payload;
}

function toIsoString(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (typeof ts === 'string' && ts.length > 0) return ts;
  return new Date().toISOString();
}

export function hydrateFactoryProject(raw: Record<string, unknown>): FactoryProject {
  const id = String(raw.id ?? `proj_${Date.now()}`);
  const packId = String(raw.packId ?? 'factorio-vanilla-2.0');
  const config: PlanConfig = {
    packId,
    targets: Array.isArray(raw.targets)
      ? raw.targets.map((t: any) => ({
          itemId: String(t.itemId),
          ratePerSec: Number(t.ratePerSec ?? 1),
        }))
      : [{ itemId: 'electronic-circuit', ratePerSec: 1 }],
    defaultBeltId: typeof raw.defaultBeltId === 'string' ? raw.defaultBeltId : undefined,
    defaultInserterId:
      typeof raw.defaultInserterId === 'string' ? raw.defaultInserterId : undefined,
    rawResourceOverrides: Array.isArray(raw.rawResourceOverrides)
      ? raw.rawResourceOverrides.map(String)
      : undefined,
    preferredRecipes:
      raw.preferredRecipes && typeof raw.preferredRecipes === 'object'
        ? (raw.preferredRecipes as Record<string, string>)
        : undefined,
    stageOverrides:
      raw.stageOverrides && typeof raw.stageOverrides === 'object'
        ? (raw.stageOverrides as Record<string, StageOverride>)
        : undefined,
    researchProductivityBonuses:
      raw.researchProductivityBonuses && typeof raw.researchProductivityBonuses === 'object'
        ? (raw.researchProductivityBonuses as Record<string, number>)
        : undefined,
  };

  let customEntities: FactoryProject['customEntities'];
  if (typeof raw.blueprintString === 'string' && raw.blueprintString.startsWith('0')) {
    try {
      const packs = packRegistry.listPacks();
      const targetPackId = packs.some((p) => p.id === packId) ? packId : packs[0].id;
      const idx = packRegistry.getIndex(targetPackId);
      const parsed = parseBlueprintToEntities(raw.blueprintString, idx);
      if (parsed.entities.length > 0) {
        customEntities = parsed.entities;
      }
    } catch {
      // Fallback gracefully to auto-synthesized layout
    }
  }

  return {
    id,
    name: String(raw.name ?? 'Esquemática'),
    description: String(raw.description ?? ''),
    config,
    rateUnit: (raw.rateUnit as RateUnit) ?? 'per_minute',
    compactionMode: (raw.compactionMode as 'compact' | 'standard') ?? 'compact',
    layoutOptions:
      raw.layoutOptions && typeof raw.layoutOptions === 'object'
        ? (raw.layoutOptions as FactoryProject['layoutOptions'])
        : undefined,
    customEntities,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

export async function saveSchematicToCloud(
  userId: string,
  project: FactoryProject
): Promise<void> {
  const payload = buildCompactSchematicPayload(project, userId);
  const path = `users/${userId}/schematics/${payload.id}`;
  const ref = doc(db, 'users', userId, 'schematics', payload.id);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const updatePayload: Record<string, unknown | FieldValue> = {
        name: payload.name,
        description: payload.description,
        packId: payload.packId,
        rateUnit: payload.rateUnit,
        compactionMode: payload.compactionMode,
        targets: payload.targets,
        defaultBeltId: payload.defaultBeltId ?? deleteField(),
        defaultInserterId: payload.defaultInserterId ?? deleteField(),
        rawResourceOverrides: payload.rawResourceOverrides ?? deleteField(),
        preferredRecipes: payload.preferredRecipes ?? deleteField(),
        stageOverrides: payload.stageOverrides ?? deleteField(),
        researchProductivityBonuses: payload.researchProductivityBonuses ?? deleteField(),
        layoutOptions: payload.layoutOptions ?? deleteField(),
        blueprintString: payload.blueprintString ?? deleteField(),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(ref, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSchematicFromCloud(
  userId: string,
  schematicId: string
): Promise<void> {
  const cleanId = normalizeSchematicId(schematicId);
  const path = `users/${userId}/schematics/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'schematics', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserSchematics(
  userId: string,
  onData: (projects: FactoryProject[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${userId}/schematics`;
  const q = query(
    collection(db, 'users', userId, 'schematics'),
    where('ownerId', '==', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        hydrateFactoryProject(d.data() as Record<string, unknown>)
      );
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped as Error);
      }
    }
  );
}
