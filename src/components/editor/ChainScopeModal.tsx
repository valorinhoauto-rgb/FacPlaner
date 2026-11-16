/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ArrowRightFromLine, Check, Layers, TrainFront, X } from 'lucide-react';
import type { PackIndex } from '../../data/schema.ts';
import {
  buildTargetChainTree,
  computeChainPresetOverrides,
  type ChainNode,
} from '../../engine/chainInspector.ts';
import type { PlanConfig, RateUnit, SolveResult } from '../../engine/types.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import type { InputAlignmentSide } from '../../spatial/types.ts';
import { formatRate } from '../../state/projectsStore.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

interface ChainScopeModalProps {
  index: PackIndex;
  config: PlanConfig;
  solveResult: SolveResult;
  rateUnit: RateUnit;
  inputSide: InputAlignmentSide;
  onUpdateConfig: (updater: (prev: PlanConfig) => PlanConfig) => void;
  onChangeInputSide: (side: InputAlignmentSide) => void;
  onClose: () => void;
}

export const ChainScopeModal: React.FC<ChainScopeModalProps> = ({
  index,
  config,
  solveResult,
  rateUnit,
  inputSide,
  onUpdateConfig,
  onChangeInputSide,
  onClose,
}) => {
  const { t } = useI18n();

  const chainRoots = useMemo(
    () => buildTargetChainTree(index, config, solveResult),
    [index, config, solveResult]
  );

  const totalMachines = useMemo(
    () => solveResult.stages.reduce((acc, s) => acc + s.installedMachines, 0),
    [solveResult.stages]
  );

  const activeOverrides = useMemo(
    () => new Set(config.rawResourceOverrides ?? []),
    [config.rawResourceOverrides]
  );

  const noSmeltingSet = useMemo(
    () => new Set(computeChainPresetOverrides(index, config, 'no-smelting')),
    [index, config]
  );
  const directOnlySet = useMemo(
    () => new Set(computeChainPresetOverrides(index, config, 'direct-ingredients')),
    [index, config]
  );

  const setsEqual = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && Array.from(a).every((x) => b.has(x));

  const isPresetFull = activeOverrides.size === 0;
  const isPresetNoSmelting = noSmeltingSet.size > 0 && setsEqual(activeOverrides, noSmeltingSet);
  const isPresetDirect = directOnlySet.size > 0 && setsEqual(activeOverrides, directOnlySet);

  const applyPreset = (preset: 'full' | 'no-smelting' | 'direct-ingredients') => {
    const nextOverrides = computeChainPresetOverrides(index, config, preset);
    onUpdateConfig((prev) => ({
      ...prev,
      rawResourceOverrides: nextOverrides,
    }));
  };

  const toggleItemExternal = (itemId: string) => {
    onUpdateConfig((prev) => {
      const cur = new Set(prev.rawResourceOverrides ?? []);
      if (cur.has(itemId)) {
        cur.delete(itemId);
      } else {
        cur.add(itemId);
      }
      return {
        ...prev,
        rawResourceOverrides: Array.from(cur),
      };
    });
  };

  const renderNode = (node: ChainNode): React.ReactNode => {
    const res = index.resourcesById.get(node.itemId);
    const canToggle = !node.isTarget && !node.isNaturalRaw;

    const cardStyle = node.isTarget
      ? 'bg-amber-500/12 border-amber-500/50 text-slate-100'
      : node.isNaturalRaw
        ? 'bg-[#12161E] border-[#232B38] text-slate-300'
        : node.isExternalOverride
          ? 'bg-cyan-950/30 border-cyan-500/50 hover:border-cyan-400 text-slate-100 cursor-pointer'
          : 'bg-[#1A2029] border-[#2C3544] hover:border-amber-500/60 text-slate-100 cursor-pointer';

    return (
      <div key={node.key} className="space-y-1.5">
        <div
          role={canToggle ? 'button' : undefined}
          tabIndex={canToggle ? 0 : undefined}
          title={
            canToggle
              ? node.isExternalOverride
                ? t.chain.clickToToggleCraft
                : t.chain.clickToToggleExternal
              : undefined
          }
          onClick={() => {
            if (canToggle) toggleItemExternal(node.itemId);
          }}
          onKeyDown={(e) => {
            if (canToggle && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggleItemExternal(node.itemId);
            }
          }}
          className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded border transition-colors ${cardStyle}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ResourceIcon resource={res} id={node.itemId} size={22} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-100 truncate">
                  {node.name}
                </span>
                {node.isPrimaryMaterial && !node.isTarget && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#252D3A] text-slate-300 border border-[#343E4F]">
                    {t.chain.badgePrimary}
                  </span>
                )}
                {node.repeatedRef && (
                  <span className="text-[10px] text-slate-500 italic">
                    ({t.chain.repeatedRef})
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
                {node.ratePerSec !== undefined && node.ratePerSec > 0 && (
                  <span>{formatRate(node.ratePerSec, rateUnit)}</span>
                )}
                {node.kind === 'item' &&
                  node.beltsRequired !== undefined &&
                  node.beltsRequired > 0 && (
                    <span className="text-slate-500">
                      {node.beltsRequired.toFixed(2)} {t.canvas.beltsShort}
                    </span>
                  )}
                {!node.isExternalOverride &&
                  !node.isNaturalRaw &&
                  node.installedMachines !== undefined && (
                    <span className="text-amber-300/90">
                      {node.installedMachines}× {node.machineName}
                    </span>
                  )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {node.isTarget ? (
              <span className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {t.chain.badgeTarget}
              </span>
            ) : node.isNaturalRaw ? (
              <span className="px-2 py-1 text-[11px] font-medium rounded bg-[#1B222D] text-emerald-300 border border-emerald-500/30">
                {t.chain.badgeNaturalRaw}
              </span>
            ) : node.isExternalOverride ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/50">
                <TrainFront className="w-3.5 h-3.5 text-cyan-300" />
                {t.chain.badgeExternal}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                <Check className="w-3.5 h-3.5" />
                {t.chain.badgeCrafted}
              </span>
            )}
          </div>
        </div>

        {node.isExternalOverride && node.hiddenSubstepsCount > 0 && (
          <div className="ml-6 pl-3 border-l border-dashed border-cyan-500/40 text-[11px] text-cyan-300/80 py-0.5">
            {t.chain.collapsedSubsteps(node.hiddenSubstepsCount)}
          </div>
        )}

        {node.children.length > 0 && (
          <div className="ml-5 pl-3.5 border-l border-[#2D3646] space-y-1.5">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#141920] border border-[#2E3848] rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#252C37] bg-[#181D25]">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-100">
                {t.chain.title}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{t.chain.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#232A36]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets Bar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-[#10141A] border-b border-[#222936]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
            {t.chain.presetsLabel}
          </span>
          <button
            type="button"
            onClick={() => applyPreset('full')}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
              isPresetFull
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-[#19202A] border-[#2A3444] text-slate-300 hover:text-white'
            }`}
          >
            {t.chain.presetFull}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('no-smelting')}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
              isPresetNoSmelting
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                : 'bg-[#19202A] border-[#2A3444] text-slate-300 hover:text-white'
            }`}
          >
            {t.chain.presetNoSmelting}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('direct-ingredients')}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
              isPresetDirect
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                : 'bg-[#19202A] border-[#2A3444] text-slate-300 hover:text-white'
            }`}
          >
            {t.chain.presetDirectOnly}
          </button>
        </div>

        {/* Interactive Chain Tree */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {chainRoots.map((root) => renderNode(root))}
        </div>

        {/* Resulting External Inputs + Same-Side Train Alignment Footer */}
        <div className="px-5 py-3.5 bg-[#11151C] border-t border-[#252C37] space-y-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-cyan-300">
                {t.chain.summaryExternalTitle}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {t.chain.summaryStats(
                  solveResult.stages.length,
                  totalMachines,
                  solveResult.rawInputs.length
                )}
              </span>
            </div>

            {solveResult.rawInputs.length === 0 ? (
              <div className="text-xs text-slate-500">{t.chain.summaryNoExternal}</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {solveResult.rawInputs.map((raw) => {
                  const res = index.resourcesById.get(raw.itemId);
                  return (
                    <div
                      key={raw.itemId}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#18202C] border border-cyan-500/35 text-[11px]"
                    >
                      <ResourceIcon resource={res} id={raw.itemId} size={16} />
                      <span className="text-slate-200 font-medium">
                        {res?.name ?? raw.itemId}
                      </span>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {formatRate(raw.actualPerSec, rateUnit)}
                      </span>
                      {raw.kind === 'item' && (
                        <span className="font-mono tabular-nums text-slate-400">
                          ({raw.beltsRequired.toFixed(1)} {t.canvas.beltsShort})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() =>
                onChangeInputSide(inputSide === 'distributed' ? 'south' : 'distributed')
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                inputSide !== 'distributed'
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-[#19202A] border-[#2C3646] text-slate-300 hover:border-cyan-500/50 hover:text-white'
              }`}
            >
              <ArrowRightFromLine className="w-3.5 h-3.5 text-cyan-400" />
              {inputSide !== 'distributed'
                ? t.chain.alignSameSideActive
                : t.chain.alignSameSideCta}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
            >
              {t.chain.confirmButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
