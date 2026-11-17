/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction } from '../data/schema.ts';
import type { GridEntity, LayoutPortMarker } from './types.ts';

export interface MachineProcessTrace {
  /** Entity numbers belonging to the selected machine's immediate process */
  entityNumbers: Set<number>;
  /** Keyed "tileX,tileY" of raw input / final output ports participating in this process */
  portKeys: Set<string>;
  /** Number of upstream connected machines/raw inputs and downstream consumers */
  upstreamCount: number;
  downstreamCount: number;
}

function dirDelta(dir: Direction | number): { dx: number; dy: number } {
  const d = ((Math.round(dir) % 16) + 16) % 16;
  if (d === 0) return { dx: 0, dy: -1 };
  if (d === 4) return { dx: 1, dy: 0 };
  if (d === 8) return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

function isLogisticsEntity(e: GridEntity): boolean {
  return (
    e.kind === 'transport-belt' ||
    e.kind === 'underground-belt' ||
    e.kind === 'splitter'
  );
}

function isPipeEntity(e: GridEntity): boolean {
  return e.kind === 'pipe' || e.kind === 'pipe-to-ground';
}

function entityCoversTile(e: GridEntity, x: number, y: number): boolean {
  return x >= e.tileX && x < e.tileX + e.width && y >= e.tileY && y < e.tileY + e.height;
}

function getInserterEndpoints(ins: GridEntity): {
  pickup: { x: number; y: number };
  drop: { x: number; y: number };
} {
  const reach = ins.inserterReach ?? (ins.name.includes('long') ? 2 : 1);
  const { dx, dy } = dirDelta(ins.direction);
  return {
    pickup: { x: ins.tileX - dx * reach, y: ins.tileY - dy * reach },
    drop: { x: ins.tileX + dx * reach, y: ins.tileY + dy * reach },
  };
}

/**
 * Traces only the physical entities that directly belong to `targetMachine`'s
 * process:
 *  - Its input & output inserters
 *  - Upstream belts / underground-belts / splitters / pipes back to the previous
 *    producing machine (included as endpoint) or raw ENTRA port + unloading inserter
 *  - Downstream belts / underground-belts / splitters / pipes forward to the next
 *    consuming machine (included as endpoint) or final SAI port
 */
export function traceMachineProcess(
  entities: GridEntity[],
  ports: LayoutPortMarker[],
  targetMachine: GridEntity
): MachineProcessTrace {
  const highlighted = new Set<number>([targetMachine.entityNumber]);
  const portKeys = new Set<string>();
  const upstreamMachineIds = new Set<number>();
  const downstreamMachineIds = new Set<number>();

  // Spatial occupancy tile lookup (handles multi-tile machines & 2x1 splitters)
  const tileMap = new Map<string, GridEntity>();
  for (const e of entities) {
    if (e.isGridFrame) continue;
    for (let dx = 0; dx < e.width; dx++) {
      for (let dy = 0; dy < e.height; dy++) {
        tileMap.set(`${e.tileX + dx},${e.tileY + dy}`, e);
      }
    }
  }

  const getEntityAt = (x: number, y: number): GridEntity | undefined =>
    tileMap.get(`${x},${y}`);

  // Pre-pair underground belts & pipe-to-ground segments bidirectionally
  const ugPairByEnt = new Map<number, GridEntity>();
  for (const e of entities) {
    if (e.kind !== 'underground-belt' || e.undergroundType !== 'input') continue;
    const { dx, dy } = dirDelta(e.direction);
    for (let k = 1; k <= 10; k++) {
      const candidate = getEntityAt(e.tileX + dx * k, e.tileY + dy * k);
      if (
        candidate &&
        candidate.kind === 'underground-belt' &&
        candidate.undergroundType === 'output' &&
        candidate.direction === e.direction
      ) {
        ugPairByEnt.set(e.entityNumber, candidate);
        ugPairByEnt.set(candidate.entityNumber, e);
        break;
      }
    }
  }

  const pipeUgNeighbors = new Map<number, GridEntity[]>();
  for (const e of entities) {
    if (e.kind !== 'pipe-to-ground') continue;
    const list: GridEntity[] = [];
    for (const d of [0, 4, 8, 12] as Direction[]) {
      const { dx, dy } = dirDelta(d);
      for (let k = 2; k <= 11; k++) {
        const candidate = getEntityAt(e.tileX + dx * k, e.tileY + dy * k);
        if (candidate && candidate.kind === 'pipe-to-ground') {
          list.push(candidate);
          break;
        }
      }
    }
    pipeUgNeighbors.set(e.entityNumber, list);
  }

  // Index inserters by endpoint tiles for O(1) lookup during BFS
  const insertersByDropTile = new Map<string, GridEntity[]>();
  const insertersByPickupTile = new Map<string, GridEntity[]>();
  const allInserters = entities.filter((e) => e.kind === 'inserter' && !e.isGridFrame);

  for (const ins of allInserters) {
    const { pickup, drop } = getInserterEndpoints(ins);
    const dk = `${drop.x},${drop.y}`;
    const dList = insertersByDropTile.get(dk) ?? [];
    dList.push(ins);
    insertersByDropTile.set(dk, dList);

    const pk = `${pickup.x},${pickup.y}`;
    const pList = insertersByPickupTile.get(pk) ?? [];
    pList.push(ins);
    insertersByPickupTile.set(pk, pList);
  }

  const inputPortSet = new Set(
    ports.filter((p) => p.directionType === 'input').map((p) => `${p.tileX},${p.tileY}`)
  );
  const outputPortSet = new Set(
    ports.filter((p) => p.directionType === 'output').map((p) => `${p.tileX},${p.tileY}`)
  );

  // Determine which logistics tiles are fed into by any cardinal belt/splitter neighbor
  const getFeedingLogisticsNeighbors = (ent: GridEntity): GridEntity[] => {
    const feeders: GridEntity[] = [];
    const seen = new Set<number>();

    // Examine all tiles immediately outside ent's footprint
    for (let dx = 0; dx < ent.width; dx++) {
      for (let dy = 0; dy < ent.height; dy++) {
        const cx = ent.tileX + dx;
        const cy = ent.tileY + dy;
        for (const d of [0, 4, 8, 12] as Direction[]) {
          const { dx: ox, dy: oy } = dirDelta(d);
          const nx = cx + ox;
          const ny = cy + oy;
          const nb = getEntityAt(nx, ny);
          if (!nb || nb.entityNumber === ent.entityNumber || seen.has(nb.entityNumber)) continue;
          if (!isLogisticsEntity(nb)) continue;

          // Underground input doesn't push onto surface tile ahead
          if (nb.kind === 'underground-belt' && nb.undergroundType === 'input') continue;

          // Check whether nb points INTO (cx, cy)
          const { dx: fx, dy: fy } = dirDelta(nb.direction);
          if (nb.kind === 'splitter') {
            let feeds = false;
            for (let sdx = 0; sdx < nb.width; sdx++) {
              for (let sdy = 0; sdy < nb.height; sdy++) {
                if (nb.tileX + sdx + fx === cx && nb.tileY + sdy + fy === cy) {
                  feeds = true;
                }
              }
            }
            if (feeds) {
              seen.add(nb.entityNumber);
              feeders.push(nb);
            }
          } else {
            if (nb.tileX + fx === cx && nb.tileY + fy === cy) {
              seen.add(nb.entityNumber);
              feeders.push(nb);
            }
          }
        }
      }
    }

    // Paired underground-belt input -> output link
    if (ent.kind === 'underground-belt' && ent.undergroundType === 'output') {
      const pairedIn = ugPairByEnt.get(ent.entityNumber);
      if (pairedIn && !seen.has(pairedIn.entityNumber)) {
        feeders.push(pairedIn);
      }
    }

    return feeders;
  };

  // Determine downstream logistics entities fed by `ent`
  const getReceivingLogisticsNeighbors = (ent: GridEntity): GridEntity[] => {
    const nexts: GridEntity[] = [];
    const seen = new Set<number>();

    if (ent.kind === 'underground-belt' && ent.undergroundType === 'input') {
      const pairedOut = ugPairByEnt.get(ent.entityNumber);
      if (pairedOut) {
        nexts.push(pairedOut);
      }
      return nexts;
    }

    const { dx: fx, dy: fy } = dirDelta(ent.direction);
    for (let dx = 0; dx < ent.width; dx++) {
      for (let dy = 0; dy < ent.height; dy++) {
        const nx = ent.tileX + dx + fx;
        const ny = ent.tileY + dy + fy;
        const nb = getEntityAt(nx, ny);
        if (!nb || nb.entityNumber === ent.entityNumber || seen.has(nb.entityNumber)) continue;
        if (!isLogisticsEntity(nb)) continue;
        // Don't flow backward into an underground output from its exit front unless going perpendicular/side
        seen.add(nb.entityNumber);
        nexts.push(nb);
      }
    }
    return nexts;
  };

  const traceUpstreamFromLogistics = (startEnt: GridEntity) => {
    const visited = new Set<number>();
    const queue: GridEntity[] = [startEnt];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur.entityNumber)) continue;
      visited.add(cur.entityNumber);
      highlighted.add(cur.entityNumber);

      for (let dx = 0; dx < cur.width; dx++) {
        for (let dy = 0; dy < cur.height; dy++) {
          const tx = cur.tileX + dx;
          const ty = cur.tileY + dy;
          const pk = `${tx},${ty}`;
          if (inputPortSet.has(pk)) {
            portKeys.add(pk);
          }

          // Check inserters dropping onto this logistics entity
          const dropIns = insertersByDropTile.get(pk) ?? [];
          for (const ins of dropIns) {
            const { pickup } = getInserterEndpoints(ins);
            const srcEnt = getEntityAt(pickup.x, pickup.y);
            if (srcEnt && srcEnt.kind === 'machine') {
              if (srcEnt.entityNumber !== targetMachine.entityNumber) {
                highlighted.add(ins.entityNumber);
                highlighted.add(srcEnt.entityNumber);
                upstreamMachineIds.add(srcEnt.entityNumber);
              }
            } else if (inputPortSet.has(pk) || !srcEnt || srcEnt.isGridFrame) {
              // Raw wagon unloading inserter or external chest inserter
              highlighted.add(ins.entityNumber);
            }
          }
        }
      }

      const feeders = getFeedingLogisticsNeighbors(cur);
      for (const f of feeders) {
        if (!visited.has(f.entityNumber)) {
          queue.push(f);
        }
      }
    }
  };

  const traceDownstreamFromLogistics = (startEnt: GridEntity) => {
    const visited = new Set<number>();
    const queue: GridEntity[] = [startEnt];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur.entityNumber)) continue;
      visited.add(cur.entityNumber);
      highlighted.add(cur.entityNumber);

      for (let dx = 0; dx < cur.width; dx++) {
        for (let dy = 0; dy < cur.height; dy++) {
          const tx = cur.tileX + dx;
          const ty = cur.tileY + dy;
          const pk = `${tx},${ty}`;
          if (outputPortSet.has(pk)) {
            portKeys.add(pk);
          }

          // Check inserters picking up from this logistics entity to feed downstream machines
          const pickIns = insertersByPickupTile.get(pk) ?? [];
          for (const ins of pickIns) {
            const { drop } = getInserterEndpoints(ins);
            const dstEnt = getEntityAt(drop.x, drop.y);
            if (
              dstEnt &&
              dstEnt.kind === 'machine' &&
              dstEnt.entityNumber !== targetMachine.entityNumber
            ) {
              highlighted.add(ins.entityNumber);
              highlighted.add(dstEnt.entityNumber);
              downstreamMachineIds.add(dstEnt.entityNumber);
            }
          }
        }
      }

      const nexts = getReceivingLogisticsNeighbors(cur);
      for (const n of nexts) {
        if (!visited.has(n.entityNumber)) {
          queue.push(n);
        }
      }
    }
  };

  // 1. Inspect all inserters directly feeding INTO or taking OUT OF `targetMachine`
  for (const ins of allInserters) {
    const { pickup, drop } = getInserterEndpoints(ins);
    const dropsIntoTarget = entityCoversTile(targetMachine, drop.x, drop.y);
    const picksFromTarget = entityCoversTile(targetMachine, pickup.x, pickup.y);

    if (dropsIntoTarget) {
      highlighted.add(ins.entityNumber);
      const srcEnt = getEntityAt(pickup.x, pickup.y);
      if (srcEnt) {
        if (srcEnt.kind === 'machine' && srcEnt.entityNumber !== targetMachine.entityNumber) {
          highlighted.add(srcEnt.entityNumber);
          upstreamMachineIds.add(srcEnt.entityNumber);
        } else if (isLogisticsEntity(srcEnt)) {
          traceUpstreamFromLogistics(srcEnt);
        }
      }
    }

    if (picksFromTarget) {
      highlighted.add(ins.entityNumber);
      const dstEnt = getEntityAt(drop.x, drop.y);
      if (dstEnt) {
        if (dstEnt.kind === 'machine' && dstEnt.entityNumber !== targetMachine.entityNumber) {
          highlighted.add(dstEnt.entityNumber);
          downstreamMachineIds.add(dstEnt.entityNumber);
        } else if (isLogisticsEntity(dstEnt)) {
          traceDownstreamFromLogistics(dstEnt);
        }
      }
    }
  }

  // 2. Also trace any adjacent Pipe / Pipe-to-Ground network touching `targetMachine`
  const pipeVisited = new Set<number>();
  const pipeQueue: GridEntity[] = [];
  for (let x = targetMachine.tileX - 1; x <= targetMachine.tileX + targetMachine.width; x++) {
    for (let y = targetMachine.tileY - 1; y <= targetMachine.tileY + targetMachine.height; y++) {
      if (entityCoversTile(targetMachine, x, y)) continue;
      // Only orthogonal edge neighbors of the machine box
      const onCorner =
        (x === targetMachine.tileX - 1 || x === targetMachine.tileX + targetMachine.width) &&
        (y === targetMachine.tileY - 1 || y === targetMachine.tileY + targetMachine.height);
      if (onCorner) continue;
      const nb = getEntityAt(x, y);
      if (nb && isPipeEntity(nb) && !pipeVisited.has(nb.entityNumber)) {
        pipeQueue.push(nb);
      }
    }
  }

  while (pipeQueue.length > 0) {
    const cur = pipeQueue.shift()!;
    if (pipeVisited.has(cur.entityNumber)) continue;
    pipeVisited.add(cur.entityNumber);
    highlighted.add(cur.entityNumber);

    const pk = `${cur.tileX},${cur.tileY}`;
    if (inputPortSet.has(pk) || outputPortSet.has(pk)) {
      portKeys.add(pk);
    }

    for (const d of [0, 4, 8, 12] as Direction[]) {
      const { dx, dy } = dirDelta(d);
      const nb = getEntityAt(cur.tileX + dx, cur.tileY + dy);
      if (!nb) continue;
      if (isPipeEntity(nb) && !pipeVisited.has(nb.entityNumber)) {
        pipeQueue.push(nb);
      } else if (
        nb.kind === 'machine' &&
        nb.entityNumber !== targetMachine.entityNumber &&
        nb.stageId !== targetMachine.stageId
      ) {
        highlighted.add(nb.entityNumber);
      }
    }

    if (cur.kind === 'pipe-to-ground') {
      const peers = pipeUgNeighbors.get(cur.entityNumber) ?? [];
      for (const peer of peers) {
        if (!pipeVisited.has(peer.entityNumber)) {
          pipeQueue.push(peer);
        }
      }
    }
  }

  return {
    entityNumbers: highlighted,
    portKeys,
    upstreamCount: upstreamMachineIds.size,
    downstreamCount: downstreamMachineIds.size,
  };
}
