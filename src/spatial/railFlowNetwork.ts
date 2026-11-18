/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction } from '../data/schema.ts';
import {
  evalRailPointAndNormal,
  getRailCurveSpec,
  isRailTrackEntityName,
  type Point2D,
  type RailCurveSpec,
} from './railGeometry.ts';
import type { GridEntity, TrainStationConfig } from './types.ts';

export interface RailFlowChain {
  id: number;
  points: Point2D[];
  cumLen: number[];
  totalLength: number;
  closed: boolean;
}

export interface RailFlowVertex {
  id: number;
  x: number;
  y: number;
  /** Connected chain entries touching this vertex */
  connections: Array<{ chainIndex: number; atEnd: 'start' | 'end'; outDir: Point2D }>;
}

export interface RailStopAnchor {
  entityNumber: number;
  tileX: number;
  tileY: number;
  direction: Direction;
  stopCenter: Point2D;
  railPoint: Point2D;
  chainIndex: number;
  arcS: number;
  /** +1 if train moves forward along increasing chain arcS, -1 if moving backward along chain arcS */
  forwardChainSign: 1 | -1;
  forward: Point2D;
}

export interface RailFlowNetwork {
  chains: RailFlowChain[];
  /** Inferred one-way traffic flow per chain (+1 along arcS, -1 opposite arcS, 0 unknown/bidirectional) */
  chainFlows: Array<-1 | 0 | 1>;
  vertices: RailFlowVertex[];
  /** Vertex ID at start/end of each chain (for crossing junctions smoothly) */
  chainEndpoints: Array<{ startVertexId: number; endVertexId: number }>;
}

export interface TrainCarPose {
  carIndex: number; // 0 = Locomotive, 1..N = Cargo Wagons
  centerX: number;
  centerY: number;
  angleRad: number;
  forwardX: number;
  forwardY: number;
  /** Unit normal facing toward the factory production area */
  factoryNormalX: number;
  factoryNormalY: number;
}

export interface RailSnapCandidate {
  tileX: number;
  tileY: number;
  direction: Direction;
  railPoint: Point2D;
  forward: Point2D;
  chainIndex: number;
  arcS: number;
  forwardChainSign: 1 | -1;
  distTiles: number;
}

interface ResolvedSeg {
  entity: GridEntity;
  cx: number;
  cy: number;
  spec: RailCurveSpec;
  p0: Point2D;
  p1: Point2D;
  t0: Point2D; // unit outward-or-forward tangent at p0 (pointing along p0 -> interior)
  t1: Point2D; // unit tangent at p1 (pointing along interior -> p1)
  isAnchor: boolean;
}

function normalizeVec(x: number, y: number): Point2D {
  const len = Math.hypot(x, y);
  return len > 1e-6 ? { x: x / len, y: y / len } : { x: 1, y: 0 };
}

function getSpecEndpointsAndTangents(
  cx: number,
  cy: number,
  spec: RailCurveSpec
): { p0: Point2D; p1: Point2D; t0: Point2D; t1: Point2D } {
  const e0 = evalRailPointAndNormal(spec, 0.001);
  const s0 = evalRailPointAndNormal(spec, 0);
  const e1 = evalRailPointAndNormal(spec, 0.999);
  const s1 = evalRailPointAndNormal(spec, 1);

  return {
    p0: { x: cx + s0.x, y: cy + s0.y },
    p1: { x: cx + s1.x, y: cy + s1.y },
    t0: normalizeVec(e0.x - s0.x, e0.y - s0.y),
    t1: normalizeVec(s1.x - e1.x, s1.y - e1.y),
  };
}

function getCandidateSpecsForEntity(ent: GridEntity): Array<{ dir: number; spec: RailCurveSpec }> {
  const rawDir = ent.rawDirection ?? ent.direction ?? 0;
  if (ent.name.includes('curved-rail-a')) {
    const dirs = [0, 2, 4, 6, 8, 10, 12, 14];
    return dirs.map((d) => ({ dir: d, spec: getRailCurveSpec(ent.name, d) }));
  }
  if (ent.name.includes('curved-rail-b')) {
    const dirs = [1, 3, 5, 7, 9, 11, 13, 15];
    return dirs.map((d) => ({ dir: d, spec: getRailCurveSpec(ent.name, d) }));
  }
  if (ent.name.includes('curved-rail')) {
    const dirs = [0, 2, 4, 6, 8, 10, 12, 14];
    return dirs.map((d) => ({ dir: d, spec: getRailCurveSpec(ent.name, d) }));
  }
  if (ent.name.includes('half-diagonal')) {
    const dirs = [1, 3, 5, 7];
    return dirs.map((d) => ({ dir: d, spec: getRailCurveSpec(ent.name, d) }));
  }
  return [{ dir: rawDir, spec: getRailCurveSpec(ent.name, rawDir) }];
}

function railFamilyKey(name: string): string {
  if (name.includes('curved-rail-a')) return 'ca';
  if (name.includes('curved-rail-b')) return 'cb';
  if (name.includes('curved-rail')) return 'c1';
  if (name.includes('half-diagonal')) return 'hd';
  if (name.includes('rail-ramp')) return 'ramp';
  return 'sr';
}

function normalizeRawDirForFamily(name: string, rawDir: number): number {
  const d = ((Math.round(rawDir) % 16) + 16) % 16;
  if (name.includes('curved-rail-a')) return d & ~1;
  if (name.includes('curved-rail-b')) return d % 2 === 1 ? d : (d + 1) % 16;
  if (name.includes('curved-rail')) return d & ~1;
  if (name.includes('half-diagonal')) return (d % 2 === 1 ? d : (d + 1) % 16) % 8;
  return d;
}

function resolveAllRailSegments(entities: GridEntity[]): ResolvedSeg[] {
  const trackEntities = entities.filter(
    (e) => isRailTrackEntityName(e.name) || e.name.includes('rail-ramp')
  );
  if (trackEntities.length === 0) return [];

  const resolved: ResolvedSeg[] = trackEntities.map((ent) => {
    const cx = ent.tileX + (ent.bpOffsetX ?? 0) + ent.width / 2;
    const cy = ent.tileY + (ent.bpOffsetY ?? 0) + ent.height / 2;
    const rawDir = ent.rawDirection ?? ent.direction ?? 0;
    const spec = getRailCurveSpec(ent.name, rawDir);
    const { p0, p1, t0, t1 } = getSpecEndpointsAndTangents(cx, cy, spec);
    const isAnchor =
      ent.name.includes('straight-rail') || ent.name.includes('rail-ramp');
    return { entity: ent, cx, cy, spec, p0, p1, t0, t1, isAnchor };
  });

  // Cell-family key so co-located curves with distinct blueprint directions
  // (e.g. Factorio 2.0 roundabout ring vs Y-branch switch at (±8,±12)/(±12,±8))
  // are assigned disjoint candidate dirs and never collapse onto one curve.
  const cellGroupKeys = resolved.map(
    (seg) => `${Math.round(seg.cx * 2)}:${Math.round(seg.cy * 2)}:${railFamilyKey(seg.entity.name)}`
  );

  // Initial un-mutated ports per segment so valid Factorio curves keep G1 matches
  // with adjacent curved neighbors even before curved neighbors lock.
  const initialPorts = resolved.map((seg) => ({
    p0: seg.p0,
    out0: { x: -seg.t0.x, y: -seg.t0.y },
    p1: seg.p1,
    out1: seg.t1,
  }));

  // Track which segments are locked as topology references
  const locked = new Set<number>();
  resolved.forEach((seg, idx) => {
    if (seg.isAnchor || getCandidateSpecsForEntity(seg.entity).length <= 1) {
      locked.add(idx);
    }
  });

  // Pass 0 Pre-Lock: lock any unlocked curve/half-diagonal whose un-mutated Factorio blueprint
  // orientation ALREADY achieves 2/2 crisp G1 continuity with distinct non-co-located neighbors
  // (or straight-rail anchors). Corrupted segments (e.g. 0/2 or 1/2 wrong orientation) stay unlocked
  // so the iterative solver auto-heals them while untouched valid junctions never deform.
  const hasCrispInitialMatch = (i: number, ep: Point2D, outTan: Point2D): boolean => {
    const myCellKey = cellGroupKeys[i];
    for (let j = 0; j < resolved.length; j++) {
      if (j === i || cellGroupKeys[j] === myCellKey) continue;
      if (Math.hypot(resolved[j].cx - resolved[i].cx, resolved[j].cy - resolved[i].cy) > 18) continue;
      const ip = initialPorts[j];
      for (const pair of [
        { p: ip.p0, t: ip.out0 },
        { p: ip.p1, t: ip.out1 },
      ]) {
        const d = Math.hypot(ep.x - pair.p.x, ep.y - pair.p.y);
        if (d > 0.14) continue;
        const opposeDot = -(outTan.x * pair.t.x + outTan.y * pair.t.y);
        if (opposeDot >= 0.988) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < resolved.length; i++) {
    if (locked.has(i)) continue;
    const ip = initialPorts[i];
    const m0 = hasCrispInitialMatch(i, ip.p0, ip.out0);
    const m1 = hasCrispInitialMatch(i, ip.p1, ip.out1);
    if (m0 && m1) {
      locked.add(i);
    } else if (m0 || m1) {
      // Lock valid boundary/switch curves that already match crisply on one side
      // unless an alternate direction achieves a strict 2/2 crisp match.
      const seg = resolved[i];
      const hasFullAlt = getCandidateSpecsForEntity(seg.entity).some((c) => {
        const g = getSpecEndpointsAndTangents(seg.cx, seg.cy, c.spec);
        return (
          hasCrispInitialMatch(i, g.p0, { x: -g.t0.x, y: -g.t0.y }) &&
          hasCrispInitialMatch(i, g.p1, g.t1)
        );
      });
      if (!hasFullAlt) {
        locked.add(i);
      }
    }
  }

  // Precompute all candidate ports per segment for weak tie-breaking
  const allCandPorts: Array<Array<{ ep: Point2D; outTan: Point2D }>> = resolved.map((seg) => {
    const cands = getCandidateSpecsForEntity(seg.entity);
    const ports: Array<{ ep: Point2D; outTan: Point2D }> = [];
    for (const c of cands) {
      const g = getSpecEndpointsAndTangents(seg.cx, seg.cy, c.spec);
      ports.push({ ep: g.p0, outTan: { x: -g.t0.x, y: -g.t0.y } });
      ports.push({ ep: g.p1, outTan: g.t1 });
    }
    return ports;
  });

  // Group ALL indices (including locked anchors) by (center, rail-family) so
  // getLockedConflictDirs always sees locked co-located curves in the same cell.
  const groupMap = new Map<string, number[]>();
  for (let i = 0; i < resolved.length; i++) {
    const key = cellGroupKeys[i];
    const list = groupMap.get(key) ?? [];
    list.push(i);
    groupMap.set(key, list);
  }
  const groups = Array.from(groupMap.values());

  // Iterative anchor-first relaxation (6 passes)
  for (let pass = 0; pass < 6; pass++) {
    const refPorts: Array<{ segIdx: number; p: Point2D; t: Point2D }> = [];
    resolved.forEach((seg, idx) => {
      if (locked.has(idx) || pass >= 3) {
        refPorts.push({ segIdx: idx, p: seg.p0, t: { x: -seg.t0.x, y: -seg.t0.y } });
        refPorts.push({ segIdx: idx, p: seg.p1, t: seg.t1 });
      }
    });

    const newlyLocked: number[] = [];

    const evalSegCandidates = (i: number) => {
      const seg = resolved[i];
      const rawDir = normalizeRawDirForFamily(
        seg.entity.name,
        seg.entity.rawDirection ?? seg.entity.direction ?? 0
      );
      const myCellKey = cellGroupKeys[i];
      const candidates = getCandidateSpecsForEntity(seg.entity);

      return candidates.map((cand) => {
        const geom = getSpecEndpointsAndTangents(seg.cx, seg.cy, cand.spec);
        const evalEndpoint = (
          ep: Point2D,
          tan: Point2D
        ): { score: number; lockedHit: boolean; strongHit: boolean; crispHit: boolean; weakHit: boolean } => {
          let bestLockedScore = 0;
          let lockedCrisp = false;
          for (const rp of refPorts) {
            if (rp.segIdx === i) continue;
            const d = Math.hypot(ep.x - rp.p.x, ep.y - rp.p.y);
            if (d > 0.32) continue;
            const opposeDot = -(tan.x * rp.t.x + tan.y * rp.t.y);
            if (opposeDot < 0.972) continue;
            if (d <= 0.14 && opposeDot >= 0.988) lockedCrisp = true;
            const s = (1 - d / 0.32) * 10 + opposeDot * 12 + (lockedCrisp ? 2.5 : 0);
            if (s > bestLockedScore) bestLockedScore = s;
          }
          if (bestLockedScore > 0) {
            return {
              score: bestLockedScore,
              lockedHit: true,
              strongHit: true,
              crispHit: lockedCrisp,
              weakHit: false,
            };
          }

          // Check un-mutated initial neighbor ports (for Factorio-valid curves before neighbor locks)
          let rawNeighborScore = 0;
          let neighborCrisp = false;
          for (let j = 0; j < resolved.length; j++) {
            if (j === i || locked.has(j) || cellGroupKeys[j] === myCellKey) continue;
            if (Math.hypot(resolved[j].cx - seg.cx, resolved[j].cy - seg.cy) > 18) continue;
            const ip = initialPorts[j];
            for (const pair of [
              { p: ip.p0, t: ip.out0 },
              { p: ip.p1, t: ip.out1 },
            ]) {
              const d = Math.hypot(ep.x - pair.p.x, ep.y - pair.p.y);
              if (d > 0.32) continue;
              const opposeDot = -(tan.x * pair.t.x + tan.y * pair.t.y);
              if (opposeDot < 0.972) continue;
              if (d <= 0.14 && opposeDot >= 0.988) neighborCrisp = true;
              const s = 6.0 + (1 - d / 0.32) * 2 + (neighborCrisp ? 1.5 : 0);
              if (s > rawNeighborScore) rawNeighborScore = s;
            }
          }
          if (rawNeighborScore > 0) {
            return {
              score: rawNeighborScore,
              lockedHit: false,
              strongHit: true,
              crispHit: neighborCrisp,
              weakHit: false,
            };
          }

          // Neighbor candidate ports (handles unlocked curved-rail neighbors whose rawDir wasn't exact)
          let weakScore = 0;
          for (let j = 0; j < resolved.length; j++) {
            if (j === i || locked.has(j) || cellGroupKeys[j] === myCellKey) continue;
            if (Math.hypot(resolved[j].cx - seg.cx, resolved[j].cy - seg.cy) > 18) continue;
            for (const np of allCandPorts[j]) {
              const d = Math.hypot(ep.x - np.ep.x, ep.y - np.ep.y);
              if (d > 0.32) continue;
              const opposeDot = -(tan.x * np.outTan.x + tan.y * np.outTan.y);
              if (opposeDot < 0.972) continue;
              const s = 4.5 + (1 - d / 0.32) * 1.5;
              if (s > weakScore) weakScore = s;
            }
          }
          return {
            score: weakScore,
            lockedHit: false,
            strongHit: false,
            crispHit: false,
            weakHit: weakScore > 0,
          };
        };

        const e0 = evalEndpoint(geom.p0, { x: -geom.t0.x, y: -geom.t0.y });
        const e1 = evalEndpoint(geom.p1, geom.t1);
        const lockedMatches = (e0.lockedHit ? 1 : 0) + (e1.lockedHit ? 1 : 0);
        const strongMatches = (e0.strongHit ? 1 : 0) + (e1.strongHit ? 1 : 0);
        const crispStrongMatches = (e0.crispHit ? 1 : 0) + (e1.crispHit ? 1 : 0);
        const weakMatches = (e0.weakHit ? 1 : 0) + (e1.weakHit ? 1 : 0);
        // Protect crisp 1/2 open boundary stubs from rotating while allowing 2/2 auto-heal
        // to overpower any broken 0/2 or 1/2 orientation cleanly.
        const sameDirBonus =
          cand.dir === rawDir
            ? crispStrongMatches >= 2
              ? 24.0
              : strongMatches >= 2
                ? 18.0
                : crispStrongMatches === 1
                  ? 10.0
                  : strongMatches === 1 && weakMatches >= 1
                    ? 5.0
                    : 0.5
            : 0;
        const total =
          e0.score +
          e1.score +
          lockedMatches * 14 +
          strongMatches * 8 +
          crispStrongMatches * 4 +
          weakMatches * 5 +
          sameDirBonus;

        return {
          cand,
          geom,
          lockedMatches,
          strongMatches,
          weakMatches,
          total,
          rawDir,
        };
      });
    };

    const getLockedConflictDirs = (memberIndices: number[], myRawDir: number): Set<number> => {
      const blockedDirs = new Set<number>();
      for (const li of memberIndices) {
        if (!locked.has(li)) continue;
        const lRaw = normalizeRawDirForFamily(
          resolved[li].entity.name,
          resolved[li].entity.rawDirection ?? resolved[li].entity.direction ?? 0
        );
        if (lRaw === myRawDir) continue;
        const lCands = getCandidateSpecsForEntity(resolved[li].entity);
        const lMatch = lCands.find((c) => {
          const g = getSpecEndpointsAndTangents(resolved[li].cx, resolved[li].cy, c.spec);
          return (
            Math.hypot(g.p0.x - resolved[li].p0.x, g.p0.y - resolved[li].p0.y) < 0.05 &&
            Math.hypot(g.p1.x - resolved[li].p1.x, g.p1.y - resolved[li].p1.y) < 0.05
          );
        });
        if (lMatch) blockedDirs.add(lMatch.dir);
      }
      return blockedDirs;
    };

    for (const memberIndices of groups) {
      const unlockedMembers = memberIndices.filter((idx) => !locked.has(idx));
      if (unlockedMembers.length === 0) continue;

      if (unlockedMembers.length === 1) {
        const i = unlockedMembers[0];
        const seg = resolved[i];
        const evals = evalSegCandidates(i);
        const blockedDirs = getLockedConflictDirs(memberIndices, evals[0]?.rawDir ?? 0);
        const allowed = evals.filter((ev) => !blockedDirs.has(ev.cand.dir));
        const pool = allowed.length > 0 ? allowed : evals;
        let best = pool[0];
        for (const ev of pool) {
          if (ev.total > best.total) best = ev;
        }
        if (best && (best.strongMatches >= 1 || best.weakMatches >= 2 || pass >= 4)) {
          seg.spec = best.cand.spec;
          seg.p0 = best.geom.p0;
          seg.p1 = best.geom.p1;
          seg.t0 = best.geom.t0;
          seg.t1 = best.geom.t1;
          if (
            best.lockedMatches >= 2 ||
            (best.cand.dir === best.rawDir && best.strongMatches >= 2) ||
            (best.strongMatches >= 2 && pass >= 2) ||
            pass >= 4
          ) {
            newlyLocked.push(i);
          }
        }
        continue;
      }

      // Multiple unlocked entities sharing the exact same (cx, cy, rail-family):
      // assign distinct cand.dirs whenever they started with distinct rawDirections.
      const evalsPerMember = unlockedMembers.map((idx) =>
        evalSegCandidates(idx).sort((a, b) => b.total - a.total)
      );
      const blockedDirsPerMember = evalsPerMember.map((evList) =>
        getLockedConflictDirs(memberIndices, evList[0]?.rawDir ?? 0)
      );
      const chosenIndices = new Array<number>(unlockedMembers.length).fill(0);
      let bestGroupScore = -Infinity;
      let bestAssignment: number[] | null = null;

      const searchGroup = (mIdx: number, accScore: number) => {
        if (mIdx === unlockedMembers.length) {
          if (accScore > bestGroupScore) {
            bestGroupScore = accScore;
            bestAssignment = [...chosenIndices];
          }
          return;
        }
        const candList = evalsPerMember[mIdx];
        const blockedDirs = blockedDirsPerMember[mIdx];
        const limit =
          unlockedMembers.length > 4
            ? Math.min(5, candList.length)
            : candList.length;
        for (let ci = 0; ci < limit; ci++) {
          const ev = candList[ci];
          let dirConflict = blockedDirs.has(ev.cand.dir);
          if (!dirConflict) {
            for (let prev = 0; prev < mIdx; prev++) {
              const prevEv = evalsPerMember[prev][chosenIndices[prev]];
              if (prevEv.rawDir !== ev.rawDir && prevEv.cand.dir === ev.cand.dir) {
                dirConflict = true;
                break;
              }
            }
          }
          if (dirConflict) continue;

          chosenIndices[mIdx] = ci;
          searchGroup(mIdx + 1, accScore + ev.total);
        }
      };

      searchGroup(0, 0);

      // Greedy disjoint fallback so overlapping rails never collapse onto duplicate directions
      if (!bestAssignment) {
        bestAssignment = new Array<number>(unlockedMembers.length).fill(0);
        const usedByRawDir = new Map<number, number>();
        for (let mIdx = 0; mIdx < unlockedMembers.length; mIdx++) {
          const candList = evalsPerMember[mIdx];
          const blocked = blockedDirsPerMember[mIdx];
          let pickedCi = 0;
          for (let ci = 0; ci < candList.length; ci++) {
            const ev = candList[ci];
            if (blocked.has(ev.cand.dir)) continue;
            const ownerRaw = usedByRawDir.get(ev.cand.dir);
            if (ownerRaw === undefined || ownerRaw === ev.rawDir) {
              pickedCi = ci;
              usedByRawDir.set(ev.cand.dir, ev.rawDir);
              break;
            }
          }
          bestAssignment[mIdx] = pickedCi;
        }
      }

      unlockedMembers.forEach((segIdx, mIdx) => {
        const best = evalsPerMember[mIdx][bestAssignment![mIdx]];
        if (!best) return;
        const seg = resolved[segIdx];
        if (best.strongMatches >= 1 || best.weakMatches >= 2 || pass >= 4) {
          seg.spec = best.cand.spec;
          seg.p0 = best.geom.p0;
          seg.p1 = best.geom.p1;
          seg.t0 = best.geom.t0;
          seg.t1 = best.geom.t1;
          if (
            best.lockedMatches >= 2 ||
            (best.cand.dir === best.rawDir && best.strongMatches >= 2) ||
            (best.strongMatches >= 2 && pass >= 2) ||
            pass >= 4
          ) {
            newlyLocked.push(segIdx);
          }
        }
      });
    }

    for (const idx of newlyLocked) locked.add(idx);
  }

  return resolved;
}

function sampleSegmentPoints(seg: ResolvedSeg): Point2D[] {
  if (seg.spec.kind === 'line') {
    return [
      { x: seg.cx + seg.spec.p0.x, y: seg.cy + seg.spec.p0.y },
      { x: seg.cx + seg.spec.p1.x, y: seg.cy + seg.spec.p1.y },
    ];
  }
  const pts: Point2D[] = [];
  const steps = 8;
  for (let s = 0; s <= steps; s++) {
    const pt = evalRailPointAndNormal(seg.spec, s / steps);
    pts.push({ x: seg.cx + pt.x, y: seg.cy + pt.y });
  }
  return pts;
}

/**
 * Builds a unified, topologically connected 2D railway flow graph from all rail
 * entities in the blueprint (flattening elevated rails & ramps onto one clean layer).
 */
export function buildRailFlowNetwork(entities: GridEntity[]): RailFlowNetwork {
  const segments = resolveAllRailSegments(entities);
  if (segments.length === 0) {
    return { chains: [], chainFlows: [], vertices: [], chainEndpoints: [] };
  }

  // 1. Cluster segment endpoints into welded graph vertices (weld radius 0.42 tiles < 2-tile parallel track spacing)
  const vertexSum: Array<{ x: number; y: number; count: number }> = [];
  const findOrCreateVertex = (p: Point2D, weldRadius = 0.42): number => {
    let bestId = -1;
    let bestDist = weldRadius;
    for (let i = 0; i < vertexSum.length; i++) {
      const vx = vertexSum[i].x / vertexSum[i].count;
      const vy = vertexSum[i].y / vertexSum[i].count;
      const d = Math.hypot(p.x - vx, p.y - vy);
      if (d <= bestDist) {
        bestDist = d;
        bestId = i;
      }
    }
    if (bestId !== -1) {
      vertexSum[bestId].x += p.x;
      vertexSum[bestId].y += p.y;
      vertexSum[bestId].count += 1;
      return bestId;
    }
    vertexSum.push({ x: p.x, y: p.y, count: 1 });
    return vertexSum.length - 1;
  };

  interface RawEdge {
    v0: number;
    v1: number;
    pts: Point2D[];
  }

  const edges: RawEdge[] = [];
  for (const seg of segments) {
    const pts = sampleSegmentPoints(seg);
    const v0 = findOrCreateVertex(pts[0]);
    const v1 = findOrCreateVertex(pts[pts.length - 1]);
    if (v0 !== v1) {
      edges.push({ v0, v1, pts });
    }
  }

  // Compute finalized vertex positions
  const vPos: Point2D[] = vertexSum.map((v) => ({
    x: v.x / v.count,
    y: v.y / v.count,
  }));

  // Snap edge endpoints strictly to welded vertex coordinates
  for (const edge of edges) {
    edge.pts[0] = { ...vPos[edge.v0] };
    edge.pts[edge.pts.length - 1] = { ...vPos[edge.v1] };
  }

  // Build adjacency list
  const adj = new Map<number, number[]>();
  const addAdj = (vId: number, edgeIdx: number) => {
    const list = adj.get(vId) ?? [];
    list.push(edgeIdx);
    adj.set(vId, list);
  };
  edges.forEach((e, idx) => {
    addAdj(e.v0, idx);
    addAdj(e.v1, idx);
  });

  // Deduplicate exact stacked duplicate blueprint ghosts while preserving distinct crossing/overlapping curves
  const seenEdgePair = new Set<string>();
  const activeEdges: RawEdge[] = [];
  for (const e of edges) {
    const a = Math.min(e.v0, e.v1);
    const b = Math.max(e.v0, e.v1);
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    const pStart = e.pts[0];
    const pNext = e.pts[Math.min(1, e.pts.length - 1)];
    const tanX = Math.round((pNext.x - pStart.x) * 8);
    const tanY = Math.round((pNext.y - pStart.y) * 8);
    const key = `${a}:${b}:${e.pts.length}:${Math.round(mid.x * 4)}:${Math.round(mid.y * 4)}:${tanX}:${tanY}`;
    if (!seenEdgePair.has(key)) {
      seenEdgePair.add(key);
      activeEdges.push(e);
    }
  }

  // Rebuild clean adjacency
  adj.clear();
  activeEdges.forEach((e, idx) => {
    addAdj(e.v0, idx);
    addAdj(e.v1, idx);
  });

  // 2. Trace maximal continuous flow chains through degree-2 vertices
  const visitedEdge = new Uint8Array(activeEdges.length);
  const chains: RailFlowChain[] = [];
  const chainEndpoints: Array<{ startVertexId: number; endVertexId: number }> = [];

  const getEdgeOther = (edgeIdx: number, vId: number) => {
    const e = activeEdges[edgeIdx];
    return e.v0 === vId ? e.v1 : e.v0;
  };

  const getEdgeOrientedPoints = (edgeIdx: number, fromV: number): Point2D[] => {
    const e = activeEdges[edgeIdx];
    return e.v0 === fromV ? e.pts : [...e.pts].reverse();
  };

  const traceFrom = (startV: number, firstEdgeIdx: number) => {
    const pts: Point2D[] = [];
    let curV = startV;
    let curEdge = firstEdgeIdx;

    while (true) {
      visitedEdge[curEdge] = 1;
      const segPts = getEdgeOrientedPoints(curEdge, curV);
      if (pts.length === 0) {
        pts.push(...segPts);
      } else {
        pts.push(...segPts.slice(1));
      }

      const nextV = getEdgeOther(curEdge, curV);
      if (nextV === startV) {
        // Closed loop
        const { cumLen, totalLength } = buildArcLengths(pts);
        const chainIdx = chains.length;
        chains.push({ id: chainIdx, points: pts, cumLen, totalLength, closed: true });
        chainEndpoints.push({ startVertexId: startV, endVertexId: nextV });
        return;
      }

      const nextList = (adj.get(nextV) ?? []).filter((idx) => !visitedEdge[idx]);
      const deg = (adj.get(nextV) ?? []).length;
      if (deg !== 2 || nextList.length === 0) {
        const { cumLen, totalLength } = buildArcLengths(pts);
        const chainIdx = chains.length;
        chains.push({ id: chainIdx, points: pts, cumLen, totalLength, closed: false });
        chainEndpoints.push({ startVertexId: startV, endVertexId: nextV });
        return;
      }

      curV = nextV;
      curEdge = nextList[0];
    }
  };

  // First pass: start chains at junctions/dead-ends (degree !== 2)
  for (const [vId, list] of adj.entries()) {
    if (list.length === 2) continue;
    for (const edgeIdx of list) {
      if (!visitedEdge[edgeIdx]) {
        traceFrom(vId, edgeIdx);
      }
    }
  }

  // Second pass: remaining unvisited edges belong to closed degree-2 loops (e.g. standalone roundabouts)
  for (let i = 0; i < activeEdges.length; i++) {
    if (!visitedEdge[i]) {
      traceFrom(activeEdges[i].v0, i);
    }
  }

  // 3. Build vertex connection table for traversing junctions seamlessly
  const vertices: RailFlowVertex[] = vPos.map((p, id) => ({
    id,
    x: p.x,
    y: p.y,
    connections: [],
  }));

  chains.forEach((chain, chainIndex) => {
    const ep = chainEndpoints[chainIndex];
    if (chain.points.length >= 2) {
      const sDir = normalizeVec(
        chain.points[1].x - chain.points[0].x,
        chain.points[1].y - chain.points[0].y
      );
      const n = chain.points.length;
      const eDir = normalizeVec(
        chain.points[n - 2].x - chain.points[n - 1].x,
        chain.points[n - 2].y - chain.points[n - 1].y
      );
      vertices[ep.startVertexId]?.connections.push({
        chainIndex,
        atEnd: 'start',
        outDir: sDir,
      });
      vertices[ep.endVertexId]?.connections.push({
        chainIndex,
        atEnd: 'end',
        outDir: eDir,
      });
    }
  });

  // 4. Infer one-way directional flow per chain from train-stops and rail signals (right-hand rule)
  const chainFlows = inferChainFlows(entities, chains, vertices, chainEndpoints);

  return { chains, chainFlows, vertices, chainEndpoints };
}

function inferChainFlows(
  entities: GridEntity[],
  chains: RailFlowChain[],
  vertices: RailFlowVertex[],
  chainEndpoints: Array<{ startVertexId: number; endVertexId: number }>
): Array<-1 | 0 | 1> {
  const posVotes = new Int32Array(chains.length);
  const negVotes = new Int32Array(chains.length);

  const voteFromEntity = (
    ent: GridEntity,
    isStop: boolean,
    weight: number,
    maxDist: number
  ) => {
    const ex = ent.tileX + (ent.bpOffsetX ?? 0) + ent.width / 2;
    const ey = ent.tileY + (ent.bpOffsetY ?? 0) + ent.height / 2;
    const rawDir = ent.rawDirection ?? ent.direction ?? 0;
    const rad = (rawDir / 16) * Math.PI * 2;
    const entFwd = { x: Math.sin(rad), y: -Math.cos(rad) };
    const rightOfEntFwd = { x: -entFwd.y, y: entFwd.x };

    let bestChain = -1;
    let bestScore = Infinity;
    let bestSign: 1 | -1 = 1;

    chains.forEach((chain, chainIndex) => {
      const pts = chain.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abLenSq = abx * abx + aby * aby;
        if (abLenSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, ((ex - a.x) * abx + (ey - a.y) * aby) / abLenSq));
        const qx = a.x + abx * t;
        const qy = a.y + aby * t;
        const dist = Math.hypot(ex - qx, ey - qy);
        if (dist > maxDist || dist < 0.25) continue;

        const r2e = normalizeVec(ex - qx, ey - qy);
        const tan = normalizeVec(abx, aby);
        // Signal/stop axis must match rail tangent axis (perpendicular to r2e)
        const tangentAlign = Math.abs(tan.x * entFwd.x + tan.y * entFwd.y);
        if (tangentAlign < 0.65) continue;

        // Factorio right-hand rule: signals & stops ALWAYS sit on the right side of travel direction
        const rightHandFwd = { x: r2e.y, y: -r2e.x };
        if (isStop) {
          const rightScore = r2e.x * rightOfEntFwd.x + r2e.y * rightOfEntFwd.y;
          if (rightScore < 0.35) continue;
        }

        const matchScore = dist - tangentAlign * 0.25;
        if (matchScore < bestScore) {
          bestScore = matchScore;
          bestChain = chainIndex;
          const dirDot = rightHandFwd.x * tan.x + rightHandFwd.y * tan.y;
          bestSign = dirDot >= 0 ? 1 : -1;
        }
      }
    });

    if (bestChain !== -1) {
      if (bestSign === 1) posVotes[bestChain] += weight;
      else negVotes[bestChain] += weight;
    }
  };

  for (const ent of entities) {
    if (ent.name.includes('train-stop')) {
      voteFromEntity(ent, true, 4, 2.6);
    } else if (ent.name.includes('rail-signal') || ent.name.includes('rail-chain-signal')) {
      voteFromEntity(ent, false, 2, 1.85);
    }
  }

  const flows: Array<-1 | 0 | 1> = chains.map((_, i) => {
    if (posVotes[i] > 0 && negVotes[i] > 0) return 0; // explicit two-way track
    if (posVotes[i] > 0) return 1;
    if (negVotes[i] > 0) return -1;
    return 0;
  });

  // Conflict-free propagation across smooth junctions (only propagates when all incoming signals agree)
  for (let pass = 0; pass < 8; pass++) {
    const propPos = new Int32Array(chains.length);
    const propNeg = new Int32Array(chains.length);

    for (let ci = 0; ci < chains.length; ci++) {
      const f = flows[ci];
      if (f === 0) continue;
      const chain = chains[ci];
      if (chain.points.length < 2) continue;

      const n = chain.points.length;
      const exitVId = f === 1 ? chainEndpoints[ci].endVertexId : chainEndpoints[ci].startVertexId;
      const exitDir =
        f === 1
          ? normalizeVec(chain.points[n - 1].x - chain.points[n - 2].x, chain.points[n - 1].y - chain.points[n - 2].y)
          : normalizeVec(chain.points[0].x - chain.points[1].x, chain.points[0].y - chain.points[1].y);

      const v = vertices[exitVId];
      if (v) {
        for (const conn of v.connections) {
          if (conn.chainIndex === ci) continue;
          const dot = conn.outDir.x * exitDir.x + conn.outDir.y * exitDir.y;
          if (dot > 0.65) {
            if (conn.atEnd === 'start') propPos[conn.chainIndex]++;
            else propNeg[conn.chainIndex]++;
          }
        }
      }

      const entryVId = f === 1 ? chainEndpoints[ci].startVertexId : chainEndpoints[ci].endVertexId;
      // Backward outward tangent at entry end (opposite to travel direction entering this chain)
      const backDir =
        f === 1
          ? normalizeVec(chain.points[0].x - chain.points[1].x, chain.points[0].y - chain.points[1].y)
          : normalizeVec(chain.points[n - 1].x - chain.points[n - 2].x, chain.points[n - 1].y - chain.points[n - 2].y);
      const bv = vertices[entryVId];
      if (bv) {
        for (const conn of bv.connections) {
          if (conn.chainIndex === ci) continue;
          const dot = conn.outDir.x * backDir.x + conn.outDir.y * backDir.y;
          if (dot > 0.65) {
            if (conn.atEnd === 'start') propNeg[conn.chainIndex]++;
            else propPos[conn.chainIndex]++;
          }
        }
      }
    }

    let changed = false;
    for (let ci = 0; ci < chains.length; ci++) {
      if (flows[ci] !== 0 || posVotes[ci] > 0 || negVotes[ci] > 0) continue;
      if (propPos[ci] > 0 && propNeg[ci] === 0) {
        flows[ci] = 1;
        changed = true;
      } else if (propNeg[ci] > 0 && propPos[ci] === 0) {
        flows[ci] = -1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return flows;
}

function buildArcLengths(points: Point2D[]): { cumLen: number[]; totalLength: number } {
  const cumLen = new Array<number>(points.length);
  cumLen[0] = 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumLen[i] = total;
  }
  return { cumLen, totalLength: total };
}

export function sampleChainAtArcLength(
  chain: RailFlowChain,
  sInput: number
): { x: number; y: number; tx: number; ty: number; nx: number; ny: number } {
  const pts = chain.points;
  if (pts.length === 0) return { x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: 1 };
  if (pts.length === 1 || chain.totalLength <= 1e-6) {
    return { x: pts[0].x, y: pts[0].y, tx: 1, ty: 0, nx: 0, ny: 1 };
  }

  let s = sInput;
  if (chain.closed) {
    s = ((s % chain.totalLength) + chain.totalLength) % chain.totalLength;
  } else {
    s = Math.max(0, Math.min(chain.totalLength, s));
  }

  // Binary search segment containing s
  let lo = 0;
  let hi = chain.cumLen.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chain.cumLen[mid] <= s) lo = mid;
    else hi = mid - 1;
  }

  const s0 = chain.cumLen[lo];
  const s1 = chain.cumLen[lo + 1];
  const segLen = Math.max(1e-6, s1 - s0);
  const alpha = (s - s0) / segLen;
  const p0 = pts[lo];
  const p1 = pts[lo + 1];
  const t = normalizeVec(p1.x - p0.x, p1.y - p0.y);

  return {
    x: p0.x + (p1.x - p0.x) * alpha,
    y: p0.y + (p1.y - p0.y) * alpha,
    tx: t.x,
    ty: t.y,
    nx: -t.y,
    ny: t.x,
  };
}

function projectPointOntoNetwork(
  network: RailFlowNetwork,
  px: number,
  py: number
): { chainIndex: number; arcS: number; railPoint: Point2D; tangent: Point2D; dist: number } | null {
  let bestDist = Infinity;
  let best: {
    chainIndex: number;
    arcS: number;
    railPoint: Point2D;
    tangent: Point2D;
    dist: number;
  } | null = null;

  network.chains.forEach((chain, chainIndex) => {
    const pts = chain.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / abLenSq));
      const qx = a.x + abx * t;
      const qy = a.y + aby * t;
      const dist = Math.hypot(px - qx, py - qy);
      if (dist < bestDist) {
        bestDist = dist;
        const arcS = chain.cumLen[i] + Math.sqrt(abLenSq) * t;
        best = {
          chainIndex,
          arcS,
          railPoint: { x: qx, y: qy },
          tangent: normalizeVec(abx, aby),
          dist,
        };
      }
    }
  });

  return best;
}

function cardinalDirFromVec(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 4 : 12;
  }
  return dy >= 0 ? 8 : 0;
}

function vecFromCardinalDir(dir: Direction): Point2D {
  if (dir === 0) return { x: 0, y: -1 };
  if (dir === 4) return { x: 1, y: 0 };
  if (dir === 8) return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function projectStopOntoNetwork(
  network: RailFlowNetwork,
  stopCenter: Point2D,
  stopDir: Direction
): { chainIndex: number; arcS: number; railPoint: Point2D; tangent: Point2D; forwardChainSign: 1 | -1; dist: number } | null {
  const stopFwd = vecFromCardinalDir(stopDir);
  const rightOfStopFwd = { x: -stopFwd.y, y: stopFwd.x };
  let bestScore = Infinity;
  let best: {
    chainIndex: number;
    arcS: number;
    railPoint: Point2D;
    tangent: Point2D;
    forwardChainSign: 1 | -1;
    dist: number;
  } | null = null;

  network.chains.forEach((chain, chainIndex) => {
    const pts = chain.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((stopCenter.x - a.x) * abx + (stopCenter.y - a.y) * aby) / abLenSq));
      const qx = a.x + abx * t;
      const qy = a.y + aby * t;
      const dist = Math.hypot(stopCenter.x - qx, stopCenter.y - qy);
      if (dist > 4.2) continue;

      const tan = normalizeVec(abx, aby);
      const tangentAlign = Math.abs(tan.x * stopFwd.x + tan.y * stopFwd.y);
      if (tangentAlign < 0.7) continue;

      // Factorio right-hand rule: stop must sit to the RIGHT (+90 CW) of its travel direction!
      const r2s = normalizeVec(stopCenter.x - qx, stopCenter.y - qy);
      const isRightSide = r2s.x * rightOfStopFwd.x + r2s.y * rightOfStopFwd.y;
      const sidePenalty = isRightSide > 0.25 ? 0 : 10;

      // Respect chain flow direction if known
      const cf = network.chainFlows[chainIndex] ?? 0;
      const fwdSign: 1 | -1 = tan.x * stopFwd.x + tan.y * stopFwd.y >= 0 ? 1 : -1;
      const flowPenalty = cf !== 0 && cf !== fwdSign ? 6 : 0;

      const score = dist + sidePenalty + flowPenalty;
      if (score < bestScore) {
        bestScore = score;
        const arcS = chain.cumLen[i] + Math.sqrt(abLenSq) * t;
        best = {
          chainIndex,
          arcS,
          railPoint: { x: qx, y: qy },
          tangent: tan,
          forwardChainSign: fwdSign,
          dist,
        };
      }
    }
  });

  return best;
}

/**
 * Finds all fixed `train-stop` entities in the blueprint and anchors each one to
 * the exact rail track on its left-hand side + Factorio travel direction.
 */
export function detectTrainStopsOnNetwork(
  entities: GridEntity[],
  network: RailFlowNetwork
): RailStopAnchor[] {
  const stops = entities.filter((e) => e.name.includes('train-stop'));
  const anchors: RailStopAnchor[] = [];

  for (const stop of stops) {
    const sx = stop.tileX + (stop.bpOffsetX ?? 0) + stop.width / 2;
    const sy = stop.tileY + (stop.bpOffsetY ?? 0) + stop.height / 2;
    const stopProj = projectStopOntoNetwork(network, { x: sx, y: sy }, stop.direction);

    if (stopProj) {
      const forward = {
        x: stopProj.tangent.x * stopProj.forwardChainSign,
        y: stopProj.tangent.y * stopProj.forwardChainSign,
      };
      anchors.push({
        entityNumber: stop.entityNumber,
        tileX: stop.tileX,
        tileY: stop.tileY,
        direction: stop.direction,
        stopCenter: { x: sx, y: sy },
        railPoint: stopProj.railPoint,
        chainIndex: stopProj.chainIndex,
        arcS: stopProj.arcS,
        forwardChainSign: stopProj.forwardChainSign,
        forward,
      });
    } else {
      const fwd = vecFromCardinalDir(stop.direction);
      anchors.push({
        entityNumber: stop.entityNumber,
        tileX: stop.tileX,
        tileY: stop.tileY,
        direction: stop.direction,
        stopCenter: { x: sx, y: sy },
        railPoint: { x: sx - fwd.y * 2, y: sy + fwd.x * 2 },
        chainIndex: -1,
        arcS: 0,
        forwardChainSign: 1,
        forward: fwd,
      });
    }
  }

  return anchors;
}

/**
 * Snaps a cursor position strictly onto the nearest valid rail track in the flow
 * network (respecting signal flow direction when known) so newly placed `train-stop`s
 * are always locked onto the rails on the valid right-hand side.
 */
export function snapStationToRail(
  network: RailFlowNetwork,
  cursorX: number,
  cursorY: number,
  maxDistTiles = 10
): RailSnapCandidate | null {
  const proj = projectPointOntoNetwork(network, cursorX, cursorY);
  if (!proj || proj.dist > maxDistTiles) return null;

  const knownFlow = network.chainFlows[proj.chainIndex] ?? 0;
  const isHoriz = Math.abs(proj.tangent.x) >= Math.abs(proj.tangent.y);
  const rx = proj.railPoint.x;
  const ry = proj.railPoint.y;

  if (isHoriz) {
    let placeNorth: boolean;
    if (knownFlow !== 0) {
      // Travel vector along flow: (+1 or -1) * tangent.x
      const eastbound = knownFlow * proj.tangent.x >= 0;
      // Right-hand side of Eastbound (+X) is South (+Y); right-hand side of Westbound (-X) is North (-Y)
      placeNorth = !eastbound;
    } else {
      placeNorth = cursorY <= ry;
    }
    const tileX = Math.round(cursorX - 1);
    const tileY = Math.round(ry + (placeNorth ? -3 : 1));
    const forwardChainSign: 1 | -1 =
      (placeNorth ? -1 : 1) * proj.tangent.x >= 0 ? 1 : -1;
    return {
      tileX,
      tileY,
      direction: placeNorth ? 12 : 4,
      railPoint: { x: tileX + 1, y: ry },
      forward: { x: placeNorth ? -1 : 1, y: 0 },
      chainIndex: proj.chainIndex,
      arcS: proj.arcS,
      forwardChainSign,
      distTiles: proj.dist,
    };
  }

  let placeWest: boolean;
  if (knownFlow !== 0) {
    const southbound = knownFlow * proj.tangent.y >= 0;
    // Right-hand side of Southbound (+Y) is West (-X); right-hand side of Northbound (-Y) is East (+X)
    placeWest = southbound;
  } else {
    placeWest = cursorX <= rx;
  }
  const tileX = Math.round(rx + (placeWest ? -3 : 1));
  const tileY = Math.round(cursorY - 1);
  const forwardChainSign: 1 | -1 =
    (placeWest ? 1 : -1) * proj.tangent.y >= 0 ? 1 : -1;
  return {
    tileX,
    tileY,
    direction: placeWest ? 8 : 0,
    railPoint: { x: rx, y: tileY + 1 },
    forward: { x: 0, y: placeWest ? 1 : -1 },
    chainIndex: proj.chainIndex,
    arcS: proj.arcS,
    forwardChainSign,
    distTiles: proj.dist,
  };
}

/**
 * Walks backward along the connected RailFlowNetwork starting at `(chainIndex, arcS)`
 * in the direction `stepSign` (`-forwardChainSign`) to locate the locomotive and
 * every cargo wagon cleanly on the rails, even across switches and curves.
 */
function walkNetworkDistance(
  network: RailFlowNetwork,
  startChainIndex: number,
  startArcS: number,
  forwardChainSign: 1 | -1,
  backwardDist: number
): { x: number; y: number; forwardX: number; forwardY: number } {
  let chainIdx = startChainIndex;
  let curSign: 1 | -1 = forwardChainSign === 1 ? -1 : 1; // direction we walk backward from loco
  let curS = startArcS;
  let rem = backwardDist;
  let hops = 0;

  while (rem > 1e-4 && hops < 24) {
    hops++;
    const chain = network.chains[chainIdx];
    if (!chain || chain.totalLength < 1e-4) break;

    if (chain.closed) {
      curS = curS + curSign * rem;
      rem = 0;
      break;
    }

    if (curSign === 1) {
      const avail = chain.totalLength - curS;
      if (rem <= avail + 1e-4) {
        curS += rem;
        rem = 0;
        break;
      }
      rem -= avail;
      const ep = network.chainEndpoints[chainIdx];
      const v = network.vertices[ep.endVertexId];
      const sample = sampleChainAtArcLength(chain, chain.totalLength);
      const walkDir = { x: sample.tx, y: sample.ty };
      const nextConn = pickBestContinuingBranch(network, v, chainIdx, walkDir);
      if (!nextConn) {
        // Track ends in the blueprint before full train length: extrapolate backward along track tangent instead of stacking cars
        return {
          x: sample.x + walkDir.x * rem,
          y: sample.y + walkDir.y * rem,
          forwardX: -walkDir.x,
          forwardY: -walkDir.y,
        };
      }
      chainIdx = nextConn.chainIndex;
      curSign = nextConn.atEnd === 'start' ? 1 : -1;
      curS = nextConn.atEnd === 'start' ? 0 : network.chains[chainIdx].totalLength;
    } else {
      const avail = curS;
      if (rem <= avail + 1e-4) {
        curS -= rem;
        rem = 0;
        break;
      }
      rem -= avail;
      const ep = network.chainEndpoints[chainIdx];
      const v = network.vertices[ep.startVertexId];
      const sample = sampleChainAtArcLength(chain, 0);
      const walkDir = { x: -sample.tx, y: -sample.ty };
      const nextConn = pickBestContinuingBranch(network, v, chainIdx, walkDir);
      if (!nextConn) {
        return {
          x: sample.x + walkDir.x * rem,
          y: sample.y + walkDir.y * rem,
          forwardX: -walkDir.x,
          forwardY: -walkDir.y,
        };
      }
      chainIdx = nextConn.chainIndex;
      curSign = nextConn.atEnd === 'start' ? 1 : -1;
      curS = nextConn.atEnd === 'start' ? 0 : network.chains[chainIdx].totalLength;
    }
  }

  const finalChain = network.chains[chainIdx];
  const sample = sampleChainAtArcLength(finalChain, curS);
  // Forward train direction is opposite to backward walk direction (-curSign * tangent)
  const fwdSign = -curSign;
  return {
    x: sample.x,
    y: sample.y,
    forwardX: sample.tx * fwdSign,
    forwardY: sample.ty * fwdSign,
  };
}

function pickBestContinuingBranch(
  network: RailFlowNetwork,
  vertex: RailFlowVertex | undefined,
  fromChainIndex: number,
  walkDir: Point2D
): { chainIndex: number; atEnd: 'start' | 'end'; outDir: Point2D } | null {
  if (!vertex) return null;
  let bestScore = 0.25; // require gentle continuation, avoid sharp U-turn
  let best: { chainIndex: number; atEnd: 'start' | 'end'; outDir: Point2D } | null = null;
  for (const conn of vertex.connections) {
    if (conn.chainIndex === fromChainIndex) continue;
    const dot = conn.outDir.x * walkDir.x + conn.outDir.y * walkDir.y;
    if (dot <= 0.25) continue;

    // Prefer tracks whose traffic flow leads INTO this station (i.e. chainFlow opposite to backward walk)
    const cf = network.chainFlows[conn.chainIndex] ?? 0;
    const expectedWalkSign: 1 | -1 = conn.atEnd === 'start' ? 1 : -1;
    const flowBonus = cf === 0 ? 0 : cf === -expectedWalkSign ? 0.5 : -0.6;
    const score = dot + flowBonus;
    if (score > bestScore) {
      bestScore = score;
      best = conn;
    }
  }
  return best;
}

/**
 * Computes world-space poses for Locomotive (index 0) and Cargo Wagons (1..wagonCount)
 * aligned so the Locomotive front bumper matches the front edge of the `train-stop`
 * (`stopCenter + forward * 1.0`), with cargo wagons trailing behind every 7 tiles.
 */
export function computeTrainCarPosesOnNetwork(
  network: RailFlowNetwork,
  station: TrainStationConfig,
  factoryCenter: Point2D
): TrainCarPose[] {
  const stopCenter = { x: station.tileX + 1, y: station.tileY + 1 };
  const stopProj =
    network.chains.length > 0
      ? projectStopOntoNetwork(network, stopCenter, station.direction)
      : null;
  const fallbackProj =
    !stopProj && network.chains.length > 0
      ? projectPointOntoNetwork(network, stopCenter.x, stopCenter.y)
      : null;

  let anchorChainIdx = -1;
  let anchorArcS = 0;
  let forwardChainSign: 1 | -1 = 1;
  let fallbackRailCenter = { x: stopCenter.x, y: stopCenter.y };
  const fallbackFwd = vecFromCardinalDir(station.direction);

  if (stopProj) {
    anchorChainIdx = stopProj.chainIndex;
    anchorArcS = stopProj.arcS;
    forwardChainSign = stopProj.forwardChainSign;
    fallbackRailCenter = stopProj.railPoint;
  } else if (fallbackProj && fallbackProj.dist <= 4.2) {
    anchorChainIdx = fallbackProj.chainIndex;
    anchorArcS = fallbackProj.arcS;
    const railToStop = normalizeVec(stopCenter.x - fallbackProj.railPoint.x, stopCenter.y - fallbackProj.railPoint.y);
    const rightHandForward = { x: railToStop.y, y: -railToStop.x };
    const dot = rightHandForward.x * fallbackProj.tangent.x + rightHandForward.y * fallbackProj.tangent.y;
    forwardChainSign = dot >= 0 ? 1 : -1;
    fallbackRailCenter = fallbackProj.railPoint;
  } else {
    // Fallback rail center offset 2 tiles to the left of stop's forward vector
    fallbackRailCenter = {
      x: stopCenter.x + fallbackFwd.y * 2,
      y: stopCenter.y - fallbackFwd.x * 2,
    };
  }

  const totalCars = 1 + Math.max(1, station.wagonCount);
  const poses: TrainCarPose[] = [];

  for (let carIdx = 0; carIdx < totalCars; carIdx++) {
    // Factorio alignment: train-stop front edge = stopCenter + 1.0*fwd.
    // Locomotive is 6 tiles long -> center sits 2.0 tiles behind stopCenter (front bumper at +1.0 = flush with stop front).
    // Each subsequent wagon follows every 7.0 tiles behind (6-tile body + 1-tile coupler).
    const distBack = 2.0 + carIdx * 7.0;
    let cx: number;
    let cy: number;
    let fx: number;
    let fy: number;

    if (anchorChainIdx !== -1) {
      const res = walkNetworkDistance(network, anchorChainIdx, anchorArcS, forwardChainSign, distBack);
      cx = res.x;
      cy = res.y;
      fx = res.forwardX;
      fy = res.forwardY;
    } else {
      cx = fallbackRailCenter.x - fallbackFwd.x * distBack;
      cy = fallbackRailCenter.y - fallbackFwd.y * distBack;
      fx = fallbackFwd.x;
      fy = fallbackFwd.y;
    }

    // Two unit normals perpendicular to track tangent
    const n1x = -fy;
    const n1y = fx;
    const toFactoryX = factoryCenter.x - cx;
    const toFactoryY = factoryCenter.y - cy;
    const dot = n1x * toFactoryX + n1y * toFactoryY;
    const sideSign = dot >= 0 ? 1 : -1;

    poses.push({
      carIndex: carIdx,
      centerX: cx,
      centerY: cy,
      angleRad: Math.atan2(fy, fx),
      forwardX: fx,
      forwardY: fy,
      factoryNormalX: n1x * sideSign,
      factoryNormalY: n1y * sideSign,
    });
  }

  return poses;
}
