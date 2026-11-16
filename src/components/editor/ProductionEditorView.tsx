/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Columns, Cpu, FlaskConical, GitBranch, Grid, Layers, Plus, Trash2 } from 'lucide-react';
import factorioLogo from '../../assets/images/factorio_planner_logo_1794839939049.jpg';
import { packRegistry } from '../../data/packRegistry.ts';
import { solveProductionPlan } from '../../engine/solver.ts';
import type { PlanConfig, RateUnit } from '../../engine/types.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import { synthesizeFactoryLayout } from '../../spatial/layoutSynthesizer.ts';
import type { GridEntity, InputAlignmentSide } from '../../spatial/types.ts';
import {
  RATE_UNIT_MULTIPLIER,
  type FactoryProject,
} from '../../state/projectsStore.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';
import { FlowGraphView } from '../graph/FlowGraphView.tsx';
import { StageInspectorPanel } from '../inspector/StageInspectorPanel.tsx';
import { BlueprintGridCanvas } from '../spatial/BlueprintGridCanvas.tsx';
import { ChainScopeModal } from './ChainScopeModal.tsx';
import { FactorioCraftingPicker } from './FactorioCraftingPicker.tsx';
import { TechTreeModal } from './TechTreeModal.tsx';

type EditorViewMode = 'spatial' | 'flow' | 'split';

interface ProductionEditorViewProps {
  project: FactoryProject;
  onUpdateProject: (updater: (prev: FactoryProject) => FactoryProject) => void;
  onOpenAssetsImport?: () => void;
}

export const ProductionEditorView: React.FC<ProductionEditorViewProps> = ({
  project,
  onUpdateProject,
  onOpenAssetsImport,
}) => {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<EditorViewMode>('spatial');
  const [theoreticalMode, setTheoreticalMode] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<null | 'primary' | 'add'>(null);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [chainModalOpen, setChainModalOpen] = useState(false);
  const [dismissedEmptyId, setDismissedEmptyId] = useState<string | null>(null);

  const availablePacks = packRegistry.listPacks();
  const packId = availablePacks.some((p) => p.id === project.config.packId)
    ? project.config.packId
    : availablePacks[0].id;

  const index = useMemo(() => packRegistry.getIndex(packId), [packId]);

  const solveResult = useMemo(
    () => solveProductionPlan(index, { ...project.config, packId }),
    [index, project.config, packId]
  );

  const autoLayout = useMemo(
    () =>
      synthesizeFactoryLayout(
        index,
        solveResult,
        { ...project.config, packId },
        {
          compactionMode: project.compactionMode,
          ...project.layoutOptions,
          gridFrame: project.gridFrame,
        }
      ),
    [
      index,
      solveResult,
      project.config,
      packId,
      project.compactionMode,
      project.layoutOptions,
      project.gridFrame,
    ]
  );

  const activeEntities = project.customEntities ?? autoLayout.entities;

  const updateConfig = (updater: (prev: PlanConfig) => PlanConfig) => {
    onUpdateProject((prev) => ({
      ...prev,
      config: updater(prev.config),
      customEntities: undefined, // re-synthesize layout when math config changes
      updatedAt: new Date().toISOString(),
    }));
  };

  const primaryTarget = project.config.targets[0];
  const primaryRes = primaryTarget ? index.resourcesById.get(primaryTarget.itemId) : undefined;
  const displayUnitMult = RATE_UNIT_MULTIPLIER[project.rateUnit];
  const activeBelt =
    index.beltsById.get(project.config.defaultBeltId ?? 'express-transport-belt') ??
    index.pack.belts[index.pack.belts.length - 1];
  const beltSpeedPerSec = activeBelt?.throughputPerSec ?? 45;

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">
      {/* Editor Configuration Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#1B1D21] border-b border-[#32363E]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Project Name */}
          <input
            type="text"
            value={project.name}
            onChange={(e) =>
              onUpdateProject((prev) => ({
                ...prev,
                name: e.target.value,
                updatedAt: new Date().toISOString(),
              }))
            }
            className="w-52 px-2.5 py-1.5 text-xs font-semibold bg-[#121316] border border-[#343841] rounded text-slate-100 focus:outline-none focus:border-amber-500"
          />

          {/* Primary Target Picker */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setPickerMode((m) => (m === 'primary' ? null : 'primary'))}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap factorio-bevel transition-colors ${
                primaryTarget
                  ? 'bg-[#25272D] border border-[#3A3E48] hover:border-amber-500/70 text-slate-100'
                  : 'bg-amber-500/15 border border-amber-500/65 hover:bg-amber-500/25 text-amber-300'
              }`}
            >
              {primaryTarget ? (
                <ResourceIcon resource={primaryRes} id={primaryTarget.itemId} size={18} />
              ) : (
                <Plus className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{primaryRes?.name ?? primaryTarget?.itemId ?? t.editor.chooseProductButton}</span>
            </button>

            {pickerMode === 'primary' && (
              <div className="absolute left-0 top-full mt-1.5 z-40">
                <FactorioCraftingPicker
                  index={index}
                  selectedItemId={primaryTarget?.itemId}
                  title={t.editor.pickerPrimaryTitle}
                  onOpenAssetsImport={() => {
                    setPickerMode(null);
                    onOpenAssetsImport?.();
                  }}
                  onClose={() => setPickerMode(null)}
                  onSelect={(itemId) => {
                    updateConfig((prev) => ({
                      ...prev,
                      targets: [
                        {
                          itemId,
                          ratePerSec: prev.targets[0]?.ratePerSec ?? 1,
                        },
                        ...prev.targets.slice(1),
                      ],
                    }));
                    setSelectedStageId(null);
                    setPickerMode(null);
                    setChainModalOpen(true);
                  }}
                />
              </div>
            )}
          </div>

          {/* Target Rate, Unit & Large-Scale Belt / Fluid Presets */}
          {primaryTarget && (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center">
                <input
                  type="number"
                  min={0.01}
                  step={project.rateUnit === 'per_second' ? 0.5 : 5}
                  value={Number((primaryTarget.ratePerSec * displayUnitMult).toFixed(3))}
                  onChange={(e) => {
                    const val = Math.max(0.001, Number(e.target.value) || 0.001);
                    updateConfig((prev) => ({
                      ...prev,
                      targets: [
                        { ...prev.targets[0], ratePerSec: val / displayUnitMult },
                        ...prev.targets.slice(1),
                      ],
                    }));
                  }}
                  className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums text-right bg-[#0C0F14] border border-[#262F3D] rounded-l text-amber-400 font-semibold focus:outline-none focus:border-amber-500"
                />
                <select
                  value={project.rateUnit}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      rateUnit: e.target.value as RateUnit,
                    }))
                  }
                  className="px-2 py-1.5 text-xs bg-[#181E27] border border-l-0 border-[#262F3D] rounded-r text-slate-200 focus:outline-none"
                >
                  <option value="per_second">{t.editor.unitPerSecond}</option>
                  <option value="per_minute">{t.editor.unitPerMinute}</option>
                  <option value="per_hour">{t.editor.unitPerHour}</option>
                </select>
              </div>

              {primaryRes?.kind === 'fluid' ? (
                <div
                  className="flex items-center p-0.5 bg-[#121316] border border-[#2A3240] rounded"
                  title={t.editor.fluidScalePresetsTooltip}
                >
                  {[
                    { label: '1k/m', perMin: 1000 },
                    { label: '6k/m', perMin: 6000 },
                    { label: '15k/m', perMin: 15000 },
                    { label: '30k/m', perMin: 30000 },
                    { label: '60k/m', perMin: 60000 },
                  ].map((p) => {
                    const targetSec = p.perMin / 60;
                    const active = Math.abs(primaryTarget.ratePerSec - targetSec) < 0.1;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() =>
                          updateConfig((prev) => ({
                            ...prev,
                            targets: [
                              { ...prev.targets[0], ratePerSec: targetSec },
                              ...prev.targets.slice(1),
                            ],
                          }))
                        }
                        className={`px-1.5 py-1 text-[10px] font-mono tabular-nums rounded transition-colors ${
                          active
                            ? 'bg-cyan-500/25 text-cyan-300 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="flex items-center p-0.5 bg-[#121316] border border-[#2A3240] rounded"
                  title={t.editor.beltScalePresetsTooltip}
                >
                  {[1, 2, 4, 8, 16].map((mult) => {
                    const targetSec = mult * beltSpeedPerSec;
                    const active = Math.abs(primaryTarget.ratePerSec - targetSec) < 0.05;
                    return (
                      <button
                        key={mult}
                        type="button"
                        title={`${mult}× ${activeBelt?.name ?? ''} = ${targetSec}/s`}
                        onClick={() =>
                          updateConfig((prev) => ({
                            ...prev,
                            targets: [
                              { ...prev.targets[0], ratePerSec: targetSec },
                              ...prev.targets.slice(1),
                            ],
                          }))
                        }
                        className={`px-1.5 py-1 text-[10px] font-mono tabular-nums rounded transition-colors ${
                          active
                            ? 'bg-amber-500/25 text-amber-300 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mult}×
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Belt Tier */}
          <select
            value={project.config.defaultBeltId ?? 'express-transport-belt'}
            onChange={(e) =>
              updateConfig((prev) => ({ ...prev, defaultBeltId: e.target.value }))
            }
            className="px-2.5 py-1.5 text-xs bg-[#181E27] border border-[#262F3D] rounded text-slate-200 focus:outline-none"
          >
            {index.pack.belts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.throughputPerSec}{t.editor.unitShortSecond})
              </option>
            ))}
          </select>

          {/* Pack Selector (supports Vanilla, Space Age, Krastorio 2 & imported mods) */}
          {availablePacks.length > 1 && (
            <select
              value={packId}
              onChange={(e) => {
                const nextPackId = e.target.value;
                const nextIndex = packRegistry.getIndex(nextPackId);
                updateConfig((prev) => {
                  const validTargets = prev.targets.filter((t) =>
                    (nextIndex.recipesByProduct.get(t.itemId)?.length ?? 0) > 0
                  );
                  const beltValid = prev.defaultBeltId && nextIndex.beltsById.has(prev.defaultBeltId);
                  const insValid =
                    prev.defaultInserterId && nextIndex.insertersById.has(prev.defaultInserterId);
                  return {
                    ...prev,
                    packId: nextPackId,
                    targets: validTargets,
                    defaultBeltId: beltValid
                      ? prev.defaultBeltId
                      : nextIndex.pack.belts[nextIndex.pack.belts.length - 1]?.id,
                    defaultInserterId: insValid
                      ? prev.defaultInserterId
                      : nextIndex.pack.inserters[0]?.id,
                  };
                });
                setSelectedStageId(null);
              }}
              className="px-2.5 py-1.5 text-xs bg-[#181E27] border border-[#262F3D] rounded text-slate-200 max-w-[230px]"
            >
              {availablePacks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Tech Tree & Research Productivity Modal Trigger */}
          <button
            type="button"
            onClick={() => setTechModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#181E27] border border-[#28313E] rounded text-slate-200 hover:border-amber-500/70 hover:text-white whitespace-nowrap shrink-0"
          >
            <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.editor.technologies}</span>
            {Object.keys(project.config.researchProductivityBonuses ?? {}).length > 0 && (
              <span className="font-mono tabular-nums text-emerald-400">
                +{Object.keys(project.config.researchProductivityBonuses ?? {}).length}
              </span>
            )}
          </button>

          {/* Dependency Chain & External Resources Configurator */}
          {project.config.targets.length > 0 && (
            <button
              type="button"
              onClick={() => setChainModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 transition-colors ${
                (project.config.rawResourceOverrides?.length ?? 0) > 0
                  ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-200 hover:border-cyan-400'
                  : 'bg-[#181E27] border-[#28313E] text-slate-200 hover:border-amber-500/70 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.editor.chainButton}</span>
              {(project.config.rawResourceOverrides?.length ?? 0) > 0 && (
                <span className="font-mono tabular-nums text-cyan-300">
                  ({project.config.rawResourceOverrides!.length})
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right Controls: Theoretical vs Real + Dual View Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center p-0.5 bg-[#121316] border border-[#32363E] rounded">
            <button
              type="button"
              onClick={() => setTheoreticalMode(false)}
              className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                !theoreticalMode
                  ? 'bg-[#262930] text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.editor.realFactory}
            </button>
            <button
              type="button"
              onClick={() => setTheoreticalMode(true)}
              className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                theoreticalMode
                  ? 'bg-[#262930] text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.editor.theoretical}
            </button>
          </div>

          <div className="flex items-center p-0.5 bg-[#121316] border border-[#32363E] rounded">
            <button
              type="button"
              onClick={() => setViewMode('spatial')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                viewMode === 'spatial'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              {t.editor.spatialView}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flow')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                viewMode === 'flow'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              {t.editor.flowView}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                viewMode === 'split'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              {t.editor.splitView}
            </button>
          </div>
        </div>
      </div>

      {/* Secondary Multi-Target Bar (compact) */}
      {project.config.targets.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-[#10141A] border-b border-[#1E2530] text-[11px] text-slate-400 overflow-x-auto">
          <span className="inline-flex items-center gap-1 text-slate-300 shrink-0">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            {t.editor.activeTargets}
          </span>
          {project.config.targets.map((tgt, idx) => {
            const res = index.resourcesById.get(tgt.itemId);
            return (
              <div key={`${tgt.itemId}-${idx}`} className="inline-flex items-center gap-1.5 shrink-0">
                <span className="text-slate-200">{res?.name ?? tgt.itemId}</span>
                <span className="font-mono tabular-nums text-amber-400">
                  {(tgt.ratePerSec * displayUnitMult).toFixed(1)}
                  {project.rateUnit === 'per_second'
                    ? t.editor.unitShortSecond
                    : project.rateUnit === 'per_minute'
                      ? t.editor.unitShortMinute
                      : t.editor.unitShortHour}
                </span>
                {project.config.targets.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig((prev) => ({
                        ...prev,
                        targets: prev.targets.filter((_, i) => i !== idx),
                      }))
                    }
                    className="text-slate-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                {idx < project.config.targets.length - 1 && <span aria-hidden="true">·</span>}
              </div>
            );
          })}
          <div className="relative shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setPickerMode((m) => (m === 'add' ? null : 'add'))}
              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              {t.editor.addTarget}
            </button>

            {pickerMode === 'add' && (
              <div className="fixed left-4 top-28 z-40">
                <FactorioCraftingPicker
                  index={index}
                  title={t.editor.pickerSecondaryTitle}
                  onOpenAssetsImport={() => {
                    setPickerMode(null);
                    onOpenAssetsImport?.();
                  }}
                  onClose={() => setPickerMode(null)}
                  onSelect={(itemId) => {
                    updateConfig((prev) => ({
                      ...prev,
                      targets: [...prev.targets, { itemId, ratePerSec: 1 }],
                    }));
                    setPickerMode(null);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workspace Body: Canvas + Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex overflow-hidden relative">
          {project.config.targets.length === 0 &&
            activeEntities.length === 0 &&
            pickerMode === null &&
            dismissedEmptyId !== project.id && (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-none">
                <div className="pointer-events-auto max-w-md w-full bg-[#1B1D21]/95 border border-[#383C45] rounded-md p-6 shadow-2xl factorio-bevel space-y-4 text-center">
                  <div className="w-14 h-14 mx-auto rounded-md border border-[#484C56] bg-[#141517] overflow-hidden shadow-lg">
                    <img
                      src={factorioLogo}
                      alt="Factorio Production Planner"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="font-display text-lg font-bold text-slate-100">
                      {t.editor.emptyTitle}
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {t.editor.emptyDescription}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setPickerMode('primary')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t.editor.emptyChooseButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedEmptyId(project.id)}
                      className="px-3 py-2 text-xs font-medium text-slate-300 bg-[#25272D] border border-[#3A3E48] rounded hover:text-white factorio-bevel transition-colors"
                    >
                      {t.editor.emptyDrawManualButton}
                    </button>
                  </div>
                </div>
              </div>
            )}

          {(viewMode === 'spatial' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-[#252C37]' : 'w-full'} h-full`}>
              <BlueprintGridCanvas
                index={index}
                layout={autoLayout}
                entities={activeEntities}
                projectName={project.name}
                defaultBeltId={project.config.defaultBeltId ?? 'express-transport-belt'}
                compactionMode={project.compactionMode}
                layoutOptions={project.layoutOptions}
                hasGridFrame={Boolean(project.gridFrame && project.gridFrame.length > 0)}
                rawInputs={solveResult.rawInputs}
                trainStation={project.trainStation}
                selectedStageId={selectedStageId}
                onSelectStage={setSelectedStageId}
                onChangeEntities={(next: GridEntity[]) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    customEntities: next,
                    updatedAt: new Date().toISOString(),
                  }))
                }
                onImportGridFrame={(frameEntities: GridEntity[]) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    gridFrame: frameEntities.map((fe) => ({ ...fe, isGridFrame: true })),
                    layoutOptions: {
                      ...prev.layoutOptions,
                      productionOffsetX: 0,
                      productionOffsetY: 0,
                    },
                    customEntities: undefined,
                    updatedAt: new Date().toISOString(),
                  }))
                }
                onClearGridFrame={() =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    gridFrame: undefined,
                    layoutOptions: {
                      ...prev.layoutOptions,
                      productionOffsetX: 0,
                      productionOffsetY: 0,
                    },
                    customEntities: undefined,
                    updatedAt: new Date().toISOString(),
                  }))
                }
                onResetAutoLayout={() =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    customEntities: undefined,
                  }))
                }
                onToggleCompaction={(mode) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    compactionMode: mode,
                    customEntities: undefined,
                  }))
                }
                onChangeLayoutOptions={(patch) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    layoutOptions: {
                      ...prev.layoutOptions,
                      ...patch,
                    },
                    customEntities: undefined,
                    updatedAt: new Date().toISOString(),
                  }))
                }
                onChangeTrainStation={(nextStation) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    trainStation: nextStation,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </div>
          )}

          {(viewMode === 'flow' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full`}>
              <FlowGraphView
                index={index}
                solveResult={solveResult}
                rateUnit={project.rateUnit}
                theoreticalMode={theoreticalMode}
                selectedStageId={selectedStageId}
                onSelectStage={setSelectedStageId}
              />
            </div>
          )}
        </div>

        <StageInspectorPanel
          index={index}
          config={project.config}
          solveResult={solveResult}
          rateUnit={project.rateUnit}
          theoreticalMode={theoreticalMode}
          selectedStageId={selectedStageId}
          onSelectStage={setSelectedStageId}
          onUpdateConfig={updateConfig}
        />
      </div>

      {techModalOpen && (
        <TechTreeModal
          index={index}
          config={project.config}
          onUpdateConfig={updateConfig}
          onClose={() => setTechModalOpen(false)}
        />
      )}

      {chainModalOpen && project.config.targets.length > 0 && (
        <ChainScopeModal
          index={index}
          config={{ ...project.config, packId }}
          solveResult={solveResult}
          rateUnit={project.rateUnit}
          inputSide={project.layoutOptions?.inputSide ?? 'distributed'}
          onUpdateConfig={updateConfig}
          onChangeInputSide={(side: InputAlignmentSide) =>
            onUpdateProject((prev) => ({
              ...prev,
              layoutOptions: {
                ...prev.layoutOptions,
                inputSide: side,
              },
              customEntities: undefined,
              updatedAt: new Date().toISOString(),
            }))
          }
          onClose={() => setChainModalOpen(false)}
        />
      )}
    </div>
  );
};
