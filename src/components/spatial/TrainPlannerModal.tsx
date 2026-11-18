/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Droplets,
  RotateCw,
  TrainFront,
  Trash2,
  X,
} from 'lucide-react';
import type { Direction, PackIndex } from '../../data/schema.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import type { RailStopAnchor } from '../../spatial/railFlowNetwork.ts';
import { computeTrainWagonPlan, type TrainRawInputEntry } from '../../spatial/trainPlanner.ts';
import type { GridBounds, TrainStationConfig } from '../../spatial/types.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

interface TrainPlannerModalProps {
  index: PackIndex;
  rawInputs: TrainRawInputEntry[];
  trainStation?: TrainStationConfig;
  gridBounds: GridBounds;
  railStops?: RailStopAnchor[];
  hasRailNetwork?: boolean;
  onChangeTrainStation: (next: TrainStationConfig | undefined) => void;
  onPickOnCanvas: () => void;
  onClose: () => void;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  if (mins < 60) return `${mins}m ${remSec.toString().padStart(2, '0')}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export const TrainPlannerModal: React.FC<TrainPlannerModalProps> = ({
  index,
  rawInputs,
  trainStation,
  gridBounds,
  railStops = [],
  hasRailNetwork = false,
  onChangeTrainStation,
  onPickOnCanvas,
  onClose,
}) => {
  const { t } = useI18n();

  const firstStop = railStops[0];
  const effectiveStation: TrainStationConfig = trainStation ?? {
    tileX: firstStop ? firstStop.tileX : Math.round((gridBounds.minX + gridBounds.maxX) / 2),
    tileY: firstStop ? firstStop.tileY : gridBounds.maxY + 3,
    direction: firstStop ? firstStop.direction : 4, // Facing East by default
    wagonCount: 2,
    slotsPerWagon: 40,
    stackSizeOverrides: {},
    lockedStopEntityNumber: firstStop?.entityNumber,
  };

  const plan = useMemo(
    () =>
      computeTrainWagonPlan(rawInputs, index, {
        wagonCount: effectiveStation.wagonCount,
        slotsPerWagon: effectiveStation.slotsPerWagon ?? 40,
        stackSizeOverrides: effectiveStation.stackSizeOverrides,
      }),
    [
      rawInputs,
      index,
      effectiveStation.wagonCount,
      effectiveStation.slotsPerWagon,
      effectiveStation.stackSizeOverrides,
    ]
  );

  const updateStation = (patch: Partial<TrainStationConfig>) => {
    onChangeTrainStation({
      ...effectiveStation,
      ...patch,
    });
  };

  const snapToBorder = (edge: 'south' | 'west' | 'north' | 'east') => {
    const cx = Math.round((gridBounds.minX + gridBounds.maxX) / 2);
    const cy = Math.round((gridBounds.minY + gridBounds.maxY) / 2);
    let tileX = cx;
    let tileY = cy;
    let direction: Direction = 4;

    if (edge === 'south') {
      tileX = cx;
      tileY = gridBounds.maxY + 3;
      direction = 4; // West -> East horizontal train along South border
    } else if (edge === 'north') {
      tileX = cx;
      tileY = gridBounds.minY - 5;
      direction = 4;
    } else if (edge === 'west') {
      tileX = gridBounds.minX - 5;
      tileY = cy;
      direction = 0; // South -> North vertical train along West border
    } else {
      tileX = gridBounds.maxX + 3;
      tileY = cy;
      direction = 0;
    }

    updateStation({ tileX, tileY, direction });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#16181D] border border-[#32363E] rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1B1D22] border-b border-[#32363E] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <TrainFront className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                {t.canvas.trainModal.title}
              </h3>
              <p className="text-xs text-slate-400">{t.canvas.trainModal.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Top Config Bar: Wagons, Slots/Wagon, Station Placement */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3.5 bg-[#111318] border border-[#2A2E37] rounded-md">
            {/* Wagon Count */}
            <div className="lg:col-span-4 space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t.canvas.trainModal.wagonsCount}
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 4, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateStation({ wagonCount: n })}
                    className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded border transition-colors ${
                      effectiveStation.wagonCount === n
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-[#1D2028] text-slate-300 border-[#32363E] hover:border-amber-500/60'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={effectiveStation.wagonCount}
                  onChange={(e) =>
                    updateStation({
                      wagonCount: Math.max(1, Math.min(32, Math.floor(Number(e.target.value) || 1))),
                    })
                  }
                  className="w-16 px-2 py-1.5 text-xs font-mono text-right bg-[#0D0F13] border border-[#32363E] rounded text-amber-400 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Slots per Wagon */}
            <div className="lg:col-span-2 space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t.canvas.trainModal.slotsPerWagon}
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={effectiveStation.slotsPerWagon ?? 40}
                onChange={(e) =>
                  updateStation({
                    slotsPerWagon: Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 40))),
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono text-right bg-[#0D0F13] border border-[#32363E] rounded text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Station Entrance Placement on Grid */}
            <div className="lg:col-span-6 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t.canvas.trainModal.stationPosLabel}{' '}
                  <span className="font-mono text-cyan-300 normal-case">
                    {trainStation
                      ? `(${trainStation.tileX}, ${trainStation.tileY}) · ${t.canvas.directions[trainStation.direction]}`
                      : t.canvas.trainModal.notPlaced}
                  </span>
                </span>
                {trainStation && (
                  <button
                    type="button"
                    onClick={() => onChangeTrainStation(undefined)}
                    className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t.canvas.trainModal.removeStation}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!trainStation) {
                      onChangeTrainStation(effectiveStation);
                    }
                    onPickOnCanvas();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-cyan-500/20 border border-cyan-500/60 text-cyan-200 rounded hover:bg-cyan-500/30"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  {hasRailNetwork && railStops.length === 0
                    ? t.canvas.trainModal.addStopOnRail
                    : t.canvas.trainModal.placeOnCanvas}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateStation({
                      lockedStopEntityNumber: undefined,
                      direction: (((effectiveStation.direction + 4) % 16) as Direction),
                    })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs bg-[#1D2028] border border-[#32363E] text-slate-200 rounded hover:border-amber-500/60"
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  {t.canvas.trainModal.rotateStation}
                </button>
                <button
                  type="button"
                  onClick={() => snapToBorder('south')}
                  className="px-2 py-1.5 text-[11px] bg-[#1D2028] border border-[#32363E] text-slate-300 rounded hover:text-white"
                >
                  {t.canvas.trainModal.snapSouth}
                </button>
                <button
                  type="button"
                  onClick={() => snapToBorder('west')}
                  className="px-2 py-1.5 text-[11px] bg-[#1D2028] border border-[#32363E] text-slate-300 rounded hover:text-white"
                >
                  {t.canvas.trainModal.snapWest}
                </button>
                <button
                  type="button"
                  onClick={() => snapToBorder('north')}
                  className="px-2 py-1.5 text-[11px] bg-[#1D2028] border border-[#32363E] text-slate-300 rounded hover:text-white"
                >
                  {t.canvas.trainModal.snapNorth}
                </button>
                <button
                  type="button"
                  onClick={() => snapToBorder('east')}
                  className="px-2 py-1.5 text-[11px] bg-[#1D2028] border border-[#32363E] text-slate-300 rounded hover:text-white"
                >
                  {t.canvas.trainModal.snapEast}
                </button>
              </div>
              {railStops.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {railStops.map((stop, idx) => {
                    const isActive =
                      trainStation &&
                      (trainStation.lockedStopEntityNumber === stop.entityNumber ||
                        (trainStation.tileX === stop.tileX &&
                          trainStation.tileY === stop.tileY));
                    return (
                      <button
                        key={stop.entityNumber}
                        type="button"
                        onClick={() =>
                          updateStation({
                            tileX: stop.tileX,
                            tileY: stop.tileY,
                            direction: stop.direction,
                            lockedStopEntityNumber: stop.entityNumber,
                          })
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded border transition-colors ${
                          isActive
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-semibold'
                            : 'bg-[#1D2028] border-[#32363E] text-slate-300 hover:border-cyan-500/60 hover:text-white'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                        <span>
                          #{idx + 1} ({stop.tileX}, {stop.tileY}) ·{' '}
                          {t.canvas.directions[stop.direction]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-slate-400">
                {railStops.length > 0 || hasRailNetwork
                  ? t.canvas.trainModal.railLockedHint
                  : t.canvas.trainModal.noRailsDetected}
              </p>
            </div>
          </div>

          {plan.solidItemCount === 0 && plan.fluids.length === 0 ? (
            <div className="p-6 text-center bg-[#111318] border border-[#2A2E37] rounded-md text-xs text-slate-400">
              {t.canvas.trainModal.emptyRawInputs}
            </div>
          ) : (
            <>
              {/* KPI Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[#111318] border border-[#2A2E37] rounded-md">
                  <div className="text-[11px] text-slate-400">{t.canvas.trainModal.totalSlots}</div>
                  <div className="text-lg font-mono font-bold text-slate-100 mt-0.5">
                    {plan.totalSlots}
                    <span className="text-xs font-normal text-slate-400 ml-1.5">
                      ({plan.wagonCount}×{plan.slotsPerWagon})
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-[#111318] border border-[#2A2E37] rounded-md">
                  <div className="text-[11px] text-slate-400">
                    {t.canvas.trainModal.autonomyPerTrain}
                  </div>
                  <div className="text-lg font-mono font-bold text-cyan-300 mt-0.5">
                    {formatDuration(plan.limitingAutonomySec)}
                  </div>
                </div>
                <div className="p-3 bg-[#111318] border border-[#2A2E37] rounded-md">
                  <div className="text-[11px] text-slate-400">
                    {t.canvas.trainModal.trainsPerMin}
                  </div>
                  <div className="text-lg font-mono font-bold text-amber-400 mt-0.5">
                    {plan.trainsPerMin > 0 ? plan.trainsPerMin.toFixed(2) : '—'}
                  </div>
                </div>
                <div className="p-3 bg-[#111318] border border-[#2A2E37] rounded-md">
                  <div className="text-[11px] text-slate-400">
                    {t.canvas.trainModal.wagonModeLabel}
                  </div>
                  <div className="mt-1">
                    {plan.requiresMixedWagons ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {t.canvas.trainModal.mixedBadge}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.canvas.trainModal.dedicatedBadge}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mixed vs Dedicated Status Banner */}
              {plan.solidItemCount > 0 && (
                <div
                  className={`p-3 rounded-md border flex items-start gap-2.5 text-xs ${
                    plan.requiresMixedWagons
                      ? 'bg-amber-950/25 border-amber-500/45 text-amber-200'
                      : 'bg-emerald-950/25 border-emerald-500/45 text-emerald-200'
                  }`}
                >
                  {plan.requiresMixedWagons ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {plan.requiresMixedWagons
                        ? t.canvas.trainModal.mixedAlertTitle
                        : t.canvas.trainModal.dedicatedOkTitle}
                    </div>
                    <div className="text-[11px] opacity-85 mt-0.5">
                      {plan.requiresMixedWagons
                        ? t.canvas.trainModal.mixedAlertDesc
                        : t.canvas.trainModal.dedicatedOkDesc}
                    </div>
                  </div>
                </div>
              )}

              {/* Per-Item Stack Size & Slot Allocation Table */}
              {plan.itemAllocations.length > 0 && (
                <div className="border border-[#2A2E37] rounded-md overflow-hidden bg-[#111318]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#1B1D24] text-[11px] uppercase text-slate-400 border-b border-[#2A2E37]">
                      <tr>
                        <th className="px-3 py-2.5">{t.canvas.trainModal.colItem}</th>
                        <th className="px-3 py-2.5 text-right">{t.canvas.trainModal.colRate}</th>
                        <th className="px-3 py-2.5 text-right">{t.canvas.trainModal.colStackSize}</th>
                        <th className="px-3 py-2.5 text-right">{t.canvas.trainModal.colSlots}</th>
                        <th className="px-3 py-2.5 text-right">{t.canvas.trainModal.colItemsTrain}</th>
                        <th className="px-3 py-2.5 text-right">{t.canvas.trainModal.colAutonomy}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222630]">
                      {plan.itemAllocations.map((item) => {
                        const res = index.resourcesById.get(item.itemId);
                        return (
                          <tr key={item.itemId} className="hover:bg-[#191C23]">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: item.color }}
                                />
                                <ResourceIcon resource={res} id={item.itemId} size={18} />
                                <span className="font-medium text-slate-100">{item.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">
                              {item.ratePerSec.toFixed(1)}/s
                              <span className="text-slate-500 ml-1">
                                ({(item.ratePerSec * 60).toFixed(0)}/m)
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min={1}
                                max={10000}
                                value={item.stackSize}
                                onChange={(e) => {
                                  const nextStack = Math.max(
                                    1,
                                    Math.floor(Number(e.target.value) || 1)
                                  );
                                  updateStation({
                                    stackSizeOverrides: {
                                      ...(effectiveStation.stackSizeOverrides ?? {}),
                                      [item.itemId]: nextStack,
                                    },
                                  });
                                }}
                                className="w-20 px-2 py-1 text-xs font-mono text-right bg-[#0B0D11] border border-[#32363E] rounded text-amber-300 focus:outline-none focus:border-amber-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-cyan-300">
                              {item.allocatedSlots}
                              <span className="text-[10px] font-normal text-slate-500 ml-1">
                                ({item.sharePct.toFixed(0)}%)
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                              {item.itemsPerTrain.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-300">
                              {formatDuration(item.autonomySec)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Visual Wagon Inventory Slot Map */}
              {plan.wagons.length > 0 && plan.solidItemCount > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    {t.canvas.trainModal.wagonsBreakdownTitle}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {plan.wagons.map((wagon) => {
                      // Expand slices into individual visual slots (cap rendering nicely at <= 120 slots)
                      const slotCells: Array<{ color: string; name: string }> = [];
                      for (const sl of wagon.slices) {
                        for (let i = 0; i < sl.slots; i++) {
                          slotCells.push({ color: sl.color, name: sl.name });
                        }
                      }
                      while (slotCells.length < wagon.totalSlots) {
                        slotCells.push({ color: '#1B1F27', name: t.canvas.trainModal.freeSlots });
                      }

                      return (
                        <div
                          key={wagon.wagonNumber}
                          className="p-3 bg-[#111318] border border-[#2A2E37] rounded-md space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-100">
                                {t.canvas.trainModal.wagonPrefix} #{wagon.wagonNumber}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                                  wagon.isMixed
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                    : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                }`}
                              >
                                {wagon.isMixed
                                  ? t.canvas.trainModal.mixedBadge
                                  : t.canvas.trainModal.dedicatedBadge}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">
                              {wagon.usedSlots}/{wagon.totalSlots} {t.canvas.trainModal.slotsUnit}
                            </span>
                          </div>

                          {/* Factorio 10-column Inventory Slot Grid */}
                          <div className="grid grid-cols-10 gap-1 p-1.5 bg-[#0A0C10] border border-[#232730] rounded">
                            {slotCells.slice(0, 120).map((cell, idx) => (
                              <div
                                key={idx}
                                title={`${cell.name} (#${idx + 1})`}
                                className="h-3 rounded-[2px] border border-black/40"
                                style={{ backgroundColor: cell.color }}
                              />
                            ))}
                          </div>

                          {/* Slice Pills */}
                          <div className="space-y-1">
                            {wagon.slices.map((sl) => {
                              const res = index.resourcesById.get(sl.itemId);
                              return (
                                <div
                                  key={sl.itemId}
                                  className="flex items-center justify-between text-[11px] text-slate-300"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-2.5 h-2.5 rounded-sm"
                                      style={{ backgroundColor: sl.color }}
                                    />
                                    <ResourceIcon resource={res} id={sl.itemId} size={14} />
                                    <span>{sl.name}</span>
                                  </div>
                                  <span className="font-mono text-slate-200">
                                    <strong>{sl.slots}</strong> {t.canvas.trainModal.slotsUnit} ·{' '}
                                    {sl.itemsCount.toLocaleString()} {t.canvas.trainModal.itemsUnit}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fluid Wagons Section */}
              {plan.fluids.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5" />
                    {t.canvas.trainModal.fluidsTitle}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {plan.fluids.map((fl) => {
                      const res = index.resourcesById.get(fl.fluidId);
                      return (
                        <div
                          key={fl.fluidId}
                          className="flex items-center justify-between p-2.5 bg-[#111318] border border-cyan-900/40 rounded text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <ResourceIcon resource={res} id={fl.fluidId} size={18} />
                            <span className="font-medium text-slate-100">{fl.name}</span>
                          </div>
                          <div className="text-right font-mono">
                            <div className="text-cyan-300">{fl.ratePerMin.toFixed(0)}/m</div>
                            <div className="text-[10px] text-slate-400">
                              ~{fl.wagonsNeededFor60s} {t.canvas.trainModal.fluidWagonsHint}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-[#1B1D22] border-t border-[#32363E] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400"
          >
            {t.canvas.trainModal.close}
          </button>
        </div>
      </div>
    </div>
  );
};
