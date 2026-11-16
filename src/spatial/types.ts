/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction } from '../data/schema.ts';

export type GridEntityKind =
  | 'machine'
  | 'transport-belt'
  | 'underground-belt'
  | 'splitter'
  | 'inserter'
  | 'pipe'
  | 'pipe-to-ground'
  | 'beacon'
  | 'electric-pole'
  | 'grid-obstacle';

export interface GridEntity {
  entityNumber: number;
  kind: GridEntityKind;
  /** Factorio prototype ID (e.g. 'assembling-machine-2', 'express-transport-belt', 'fast-inserter') */
  name: string;
  /** Top-left tile coordinate on the discrete integer grid */
  tileX: number;
  tileY: number;
  /** Footprint in tiles */
  width: number;
  height: number;
  /** Factorio 2.0 orientation: 0=North, 4=East, 8=South, 12=West */
  direction: Direction;
  /** Recipe assigned to machine */
  recipeId?: string;
  /** Linked calculation stage ID */
  stageId?: string;
  /** Modules installed in machine or beacon */
  moduleIds?: string[];
  /** Item IDs carried on belt left/right lanes for visual rendering */
  beltLanes?: { left?: string; right?: string };
  /** Underground belt IO mode */
  undergroundType?: 'input' | 'output';
  /** Fluid ID carried by pipe */
  fluidId?: string;
  /** Inserter reach in tiles (1 or 2) */
  inserterReach?: 1 | 2;
  /** Item IDs transferred by inserter */
  inserterItems?: string[];
  /** Optional custom color override */
  accentColor?: string;
  /** Marks entities that belong to an imported Base Grid Frame (locked structural obstacles/rails/poles) */
  isGridFrame?: boolean;
}

export interface StageZone {
  stageId: string;
  recipeId: string;
  label: string;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  machineCount: number;
}

export interface SpatialLayoutStats {
  widthTiles: number;
  heightTiles: number;
  totalAreaTiles: number;
  machineCount: number;
  beltCount: number;
  undergroundCount: number;
  splitterCount: number;
  inserterCount: number;
  pipeCount: number;
  beaconCount: number;
  poleCount: number;
  spaceUtilizationPct: number;
}

export type InputAlignmentSide = 'distributed' | 'south' | 'west';

export interface LayoutPortMarker {
  id: string;
  directionType: 'input' | 'output';
  itemId: string;
  partnerItemId?: string;
  kind: 'item' | 'fluid';
  tileX: number;
  tileY: number;
  ratePerSec: number;
  beltsRequired: number;
  side: 'south' | 'west' | 'north' | 'east';
}

export interface GridFitReport {
  hasGridFrame: boolean;
  interiorBounds: { minX: number; minY: number; maxX: number; maxY: number };
  interiorWidth: number;
  interiorHeight: number;
  frameEntityCount: number;
  requestedMachines: number;
  placedMachines: number;
  overflowMachines: number;
  fitsInsideFrame: boolean;
  interiorUtilizationPct: number;
}

export interface LayoutSynthesisOptions {
  compactionMode?: 'compact' | 'standard';
  includeBeacons?: boolean;
  includePowerPoles?: boolean;
  directInsertion?: boolean;
  inputSide?: InputAlignmentSide;
  /** Optional external grid blueprint entities (rails, roboports, substations, walls, etc.) to fit production inside */
  gridFrame?: GridEntity[];
}

export interface SynthesizedLayout {
  entities: GridEntity[];
  zones: StageZone[];
  ports: LayoutPortMarker[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  stats: SpatialLayoutStats;
  compactionMode: 'compact' | 'standard';
  gridFitReport?: GridFitReport;
}
