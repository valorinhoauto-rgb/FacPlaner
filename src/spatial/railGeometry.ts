/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point2D {
  x: number;
  y: number;
}

export type RailCurveSpec =
  | {
      kind: 'line';
      p0: Point2D;
      p1: Point2D;
      tieCount: number;
    }
  | {
      kind: 'quad';
      p0: Point2D;
      p1: Point2D;
      p2: Point2D;
      tieCount: number;
    };

/**
 * Returns local track centerline geometry in tile units relative to the
 * rail entity's exact blueprint center `(0, 0)` for Factorio 2.0 16-way rails.
 */
export function getRailCurveSpec(name: string, rawDir: number): RailCurveSpec {
  const d = ((Math.round(rawDir) % 16) + 16) % 16;

  if (name.includes('rail-ramp')) {
    const horiz = d === 4 || d === 12;
    return horiz
      ? { kind: 'line', p0: { x: -8, y: 0 }, p1: { x: 8, y: 0 }, tieCount: 16 }
      : { kind: 'line', p0: { x: 0, y: -8 }, p1: { x: 0, y: 8 }, tieCount: 16 };
  }

  if (name.includes('curved-rail-a')) {
    const evenDir = d & ~1;
    switch (evenDir) {
      case 0:
        return { kind: 'quad', p0: { x: 0, y: 2 }, p1: { x: 0, y: -1 }, p2: { x: -1, y: -3 }, tieCount: 5 };
      case 2:
        return { kind: 'quad', p0: { x: 0, y: -2 }, p1: { x: 0, y: 1 }, p2: { x: -1, y: 3 }, tieCount: 5 };
      case 4:
        return { kind: 'quad', p0: { x: -2, y: 0 }, p1: { x: 1, y: 0 }, p2: { x: 3, y: -1 }, tieCount: 5 };
      case 6:
        return { kind: 'quad', p0: { x: 2, y: 0 }, p1: { x: -1, y: 0 }, p2: { x: -3, y: -1 }, tieCount: 5 };
      case 8:
        return { kind: 'quad', p0: { x: 0, y: -2 }, p1: { x: 0, y: 1 }, p2: { x: 1, y: 3 }, tieCount: 5 };
      case 10:
        return { kind: 'quad', p0: { x: 0, y: 2 }, p1: { x: 0, y: -1 }, p2: { x: 1, y: -3 }, tieCount: 5 };
      case 12:
        return { kind: 'quad', p0: { x: 2, y: 0 }, p1: { x: -1, y: 0 }, p2: { x: -3, y: 1 }, tieCount: 5 };
      case 14:
      default:
        return { kind: 'quad', p0: { x: -2, y: 0 }, p1: { x: 1, y: 0 }, p2: { x: 3, y: 1 }, tieCount: 5 };
    }
  }

  if (name.includes('curved-rail-b')) {
    const oddDir = d % 2 === 1 ? d : (d + 1) % 16;
    switch (oddDir) {
      case 1:
        return { kind: 'quad', p0: { x: 2, y: -2 }, p1: { x: 0, y: 0 }, p2: { x: -1, y: 2 }, tieCount: 4 };
      case 3:
        return { kind: 'quad', p0: { x: 2, y: -1 }, p1: { x: 0, y: 0 }, p2: { x: -2, y: 2 }, tieCount: 4 };
      case 5:
        return { kind: 'quad', p0: { x: 2, y: 2 }, p1: { x: 0, y: 0 }, p2: { x: -2, y: -1 }, tieCount: 4 };
      case 7:
        return { kind: 'quad', p0: { x: 1, y: 2 }, p1: { x: 0, y: 0 }, p2: { x: -2, y: -2 }, tieCount: 4 };
      case 9:
        return { kind: 'quad', p0: { x: -2, y: 2 }, p1: { x: 0, y: 0 }, p2: { x: 1, y: -2 }, tieCount: 4 };
      case 11:
        return { kind: 'quad', p0: { x: -2, y: 1 }, p1: { x: 0, y: 0 }, p2: { x: 2, y: -2 }, tieCount: 4 };
      case 13:
        return { kind: 'quad', p0: { x: -2, y: -2 }, p1: { x: 0, y: 0 }, p2: { x: 2, y: 1 }, tieCount: 4 };
      case 15:
      default:
        return { kind: 'quad', p0: { x: -1, y: -2 }, p1: { x: 0, y: 0 }, p2: { x: 2, y: 2 }, tieCount: 4 };
    }
  }

  if (name.includes('curved-rail')) {
    const evenDir = d & ~1;
    switch (evenDir) {
      case 0: // S (+Y) -> NW (-X, -Y)
        return { kind: 'quad', p0: { x: 2, y: 3 }, p1: { x: 2, y: -1 }, p2: { x: -1, y: -4 }, tieCount: 7 };
      case 2: // S (+Y) -> NE (+X, -Y)
        return { kind: 'quad', p0: { x: -2, y: 3 }, p1: { x: -2, y: -1 }, p2: { x: 1, y: -4 }, tieCount: 7 };
      case 4: // W (-X) -> NE (+X, -Y)
        return { kind: 'quad', p0: { x: -3, y: 2 }, p1: { x: 1, y: 2 }, p2: { x: 4, y: -1 }, tieCount: 7 };
      case 6: // W (-X) -> SE (+X, +Y)
        return { kind: 'quad', p0: { x: -3, y: -2 }, p1: { x: 1, y: -2 }, p2: { x: 4, y: 1 }, tieCount: 7 };
      case 8: // N (-Y) -> SE (+X, +Y)
        return { kind: 'quad', p0: { x: -2, y: -3 }, p1: { x: -2, y: 1 }, p2: { x: 1, y: 4 }, tieCount: 7 };
      case 10: // N (-Y) -> SW (-X, +Y)
        return { kind: 'quad', p0: { x: 2, y: -3 }, p1: { x: 2, y: 1 }, p2: { x: -1, y: 4 }, tieCount: 7 };
      case 12: // E (+X) -> SW (-X, +Y)
        return { kind: 'quad', p0: { x: 3, y: -2 }, p1: { x: -1, y: -2 }, p2: { x: -4, y: 1 }, tieCount: 7 };
      case 14: // E (+X) -> NW (-X, -Y)
      default:
        return { kind: 'quad', p0: { x: 3, y: 2 }, p1: { x: -1, y: 2 }, p2: { x: -4, y: -1 }, tieCount: 7 };
    }
  }

  if (name.includes('half-diagonal')) {
    const axis = (d % 2 === 1 ? d : (d + 1) % 16) % 8;
    switch (axis) {
      case 1:
        return { kind: 'line', p0: { x: -1, y: 2 }, p1: { x: 1, y: -2 }, tieCount: 5 };
      case 3:
        return { kind: 'line', p0: { x: -2, y: 1 }, p1: { x: 2, y: -1 }, tieCount: 5 };
      case 5:
        return { kind: 'line', p0: { x: -2, y: -1 }, p1: { x: 2, y: 1 }, tieCount: 5 };
      case 7:
      default:
        return { kind: 'line', p0: { x: -1, y: -2 }, p1: { x: 1, y: 2 }, tieCount: 5 };
    }
  }

  // straight-rail / elevated-straight-rail (2x2)
  // Factorio's diagonal direction points toward the empty interior normal,
  // OPPOSITE the occupied corner of the 2x2 tile:
  //   NE dir (2 / 1.1=1):  occupies SW corner -> (0,1) to (-1,0) ("\" slope)
  //   SE dir (6 / 1.1=3):  occupies NW corner -> (-1,0) to (0,-1) ("/" slope)
  //   SW dir (10 / 1.1=5): occupies NE corner -> (0,-1) to (1,0) ("\" slope)
  //   NW dir (14 / 1.1=7): occupies SE corner -> (1,0) to (0,1) ("/" slope)
  const dir16 = (d & ~1) % 16;
  switch (dir16) {
    case 0:
    case 8:
      return { kind: 'line', p0: { x: 0, y: -1 }, p1: { x: 0, y: 1 }, tieCount: 3 };
    case 4:
    case 12:
      return { kind: 'line', p0: { x: -1, y: 0 }, p1: { x: 1, y: 0 }, tieCount: 3 };
    case 2: // NE (1.1 dir 1): SW corner (0,1) -> (-1,0) ("\" slope)
      return { kind: 'line', p0: { x: 0, y: 1 }, p1: { x: -1, y: 0 }, tieCount: 2 };
    case 6: // SE (1.1 dir 3): NW corner (-1,0) -> (0,-1) ("/" slope)
      return { kind: 'line', p0: { x: -1, y: 0 }, p1: { x: 0, y: -1 }, tieCount: 2 };
    case 10: // SW (1.1 dir 5): NE corner (0,-1) -> (1,0) ("\" slope)
      return { kind: 'line', p0: { x: 0, y: -1 }, p1: { x: 1, y: 0 }, tieCount: 2 };
    case 14: // NW (1.1 dir 7): SE corner (1,0) -> (0,1) ("/" slope)
    default:
      return { kind: 'line', p0: { x: 1, y: 0 }, p1: { x: 0, y: 1 }, tieCount: 2 };
  }
}

export function evalRailPointAndNormal(
  spec: RailCurveSpec,
  t: number
): { x: number; y: number; nx: number; ny: number } {
  if (spec.kind === 'line') {
    const dx = spec.p1.x - spec.p0.x;
    const dy = spec.p1.y - spec.p0.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: spec.p0.x + dx * t,
      y: spec.p0.y + dy * t,
      nx: -dy / len,
      ny: dx / len,
    };
  }
  const mt = 1 - t;
  const x = mt * mt * spec.p0.x + 2 * mt * t * spec.p1.x + t * t * spec.p2.x;
  const y = mt * mt * spec.p0.y + 2 * mt * t * spec.p1.y + t * t * spec.p2.y;
  const dx = 2 * mt * (spec.p1.x - spec.p0.x) + 2 * t * (spec.p2.x - spec.p1.x);
  const dy = 2 * mt * (spec.p1.y - spec.p0.y) + 2 * t * (spec.p2.y - spec.p1.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, nx: -dy / len, ny: dx / len };
}

export function isRailTrackEntityName(name: string): boolean {
  return (
    name.includes('straight-rail') ||
    name.includes('half-diagonal-rail') ||
    name.includes('curved-rail')
  );
}
