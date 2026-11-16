/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import type { PackIndex } from '../../data/schema.ts';
import type { PlanConfig, RateUnit, SolveResult, StageOverride } from '../../engine/types.ts';
import { formatRate } from '../../state/projectsStore.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

interface StageInspectorPanelProps {
  index: PackIndex;
  config: PlanConfig;
  solveResult: SolveResult;
  rateUnit: RateUnit;
  theoreticalMode: boolean;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
  onUpdateConfig: (updater: (prev: PlanConfig) => PlanConfig) => void;
}

export const StageInspectorPanel: React.FC<StageInspectorPanelProps> = ({
  index,
  config,
  solveResult,
  rateUnit,
  theoreticalMode,
  selectedStageId,
  onSelectStage,
  onUpdateConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'stage' | 'summary' | 'alerts'>('stage');

  const selectedStage = useMemo(
    () => solveResult.stages.find((s) => s.id === selectedStageId) ?? solveResult.stages[0] ?? null,
    [solveResult.stages, selectedStageId]
  );

  const selectedRecipe = selectedStage ? index.recipesById.get(selectedStage.recipeId) : undefined;
  const selectedMachine = selectedStage ? index.machinesById.get(selectedStage.machineId) : undefined;

  const alternativeRecipes = useMemo(() => {
    if (!selectedRecipe) return [];
    return index.recipesByProduct.get(selectedRecipe.mainProductId) ?? [];
  }, [index.recipesByProduct, selectedRecipe]);

  const compatibleMachines = useMemo(() => {
    if (!selectedRecipe) return [];
    return index.machinesByCategory.get(selectedRecipe.category) ?? [];
  }, [index.machinesByCategory, selectedRecipe]);

  const updateStageOverride = (recipeId: string, patch: Partial<StageOverride>) => {
    onUpdateConfig((prev) => ({
      ...prev,
      stageOverrides: {
        ...prev.stageOverrides,
        [recipeId]: {
          ...prev.stageOverrides?.[recipeId],
          ...patch,
        },
      },
    }));
  };

  const errorCount = solveResult.alerts.filter((a) => a.severity === 'error').length;
  const warnCount = solveResult.alerts.filter((a) => a.severity === 'warning').length;

  return (
    <aside className="w-full lg:w-[370px] shrink-0 flex flex-col bg-[#141920] border-l border-[#252C37] h-full overflow-hidden">
      {/* Tab Selector */}
      <div className="grid grid-cols-3 border-b border-[#252C37] bg-[#11151B]">
        <button
          type="button"
          onClick={() => setActiveTab('stage')}
          className={`py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'stage'
              ? 'border-amber-500 text-amber-400 bg-[#141920]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Etapa
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'summary'
              ? 'border-amber-500 text-amber-400 bg-[#141920]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Consolidado
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'alerts'
              ? 'border-amber-500 text-amber-400 bg-[#141920]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Gargalos ({solveResult.alerts.length})
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'stage' && (
          <>
            {!selectedStage || !selectedRecipe || !selectedMachine ? (
              <div className="text-xs text-slate-400 py-8 text-center">
                Selecione uma etapa no grafo ou na planta 2D para configurar máquinas, receitas alternativas e módulos.
              </div>
            ) : (
              <>
                {/* Stage Switcher */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-400">
                    Etapa em Inspeção
                  </label>
                  <select
                    value={selectedStage.id}
                    onChange={(e) => onSelectStage(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-[#0D1117] border border-[#28313E] rounded text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {solveResult.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.recipeName} ({s.installedMachines}x {s.machineName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Key Numbers */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-[#0E1218] border border-[#222A36] rounded-md text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Máquinas</div>
                    <div className="text-sm font-bold text-amber-400 font-mono tabular-nums">
                      {theoreticalMode
                        ? selectedStage.theoreticalMachines.toFixed(2)
                        : `${selectedStage.installedMachines}x`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Utilização</div>
                    <div className="text-sm font-semibold text-slate-100 font-mono tabular-nums">
                      {(selectedStage.utilization * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Energia</div>
                    <div className="text-sm font-semibold text-slate-100 font-mono tabular-nums">
                      {selectedStage.powerKwTotal >= 1000
                        ? `${(selectedStage.powerKwTotal / 1000).toFixed(2)} MW`
                        : `${selectedStage.powerKwTotal.toFixed(0)} kW`}
                    </div>
                  </div>
                </div>

                {/* Alternative Recipe Selector */}
                {alternativeRecipes.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-400">
                      Receita Alternativa ({alternativeRecipes.length} disponíveis)
                    </label>
                    <select
                      value={selectedRecipe.id}
                      onChange={(e) => {
                        const nextRecipeId = e.target.value;
                        onUpdateConfig((prev) => ({
                          ...prev,
                          preferredRecipes: {
                            ...prev.preferredRecipes,
                            [selectedRecipe.mainProductId]: nextRecipeId,
                          },
                        }));
                        onSelectStage(nextRecipeId);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#0D1117] border border-[#28313E] rounded text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {alternativeRecipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.energyRequired}s)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Machine Selection & Manual Count Lock */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-400">
                      Máquina de Produção
                    </label>
                    <div className="flex items-center gap-2">
                      <ResourceIcon
                        resource={index.resourcesById.get(selectedMachine.id)}
                        iconPath={selectedMachine.iconPath}
                        id={selectedMachine.id}
                        size={26}
                      />
                      <select
                        value={selectedMachine.id}
                        onChange={(e) =>
                          updateStageOverride(selectedStage.recipeId, {
                            machineId: e.target.value,
                          })
                        }
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-[#0D1117] border border-[#28313E] rounded text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        {compatibleMachines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} (vel. {m.craftingSpeed}x · {m.moduleSlots} slots)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2.5 bg-[#0E1218] border border-[#222A36] rounded-md">
                    <div className="text-xs">
                      <div className="font-medium text-slate-200">Quantidade de Máquinas</div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {selectedStage.isFixedCount
                          ? `Travado em ${selectedStage.installedMachines}`
                          : `Auto (${selectedStage.theoreticalMachines.toFixed(2)} teor.)`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedStage.isFixedCount ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={selectedStage.installedMachines}
                            onChange={(e) =>
                              updateStageOverride(selectedStage.recipeId, {
                                fixedMachineCount: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              })
                            }
                            className="w-16 px-2 py-1 text-xs font-mono text-right bg-[#141920] border border-[#2D3848] rounded text-slate-100"
                          />
                          <button
                            type="button"
                            title="Voltar para automático"
                            onClick={() =>
                              updateStageOverride(selectedStage.recipeId, {
                                fixedMachineCount: undefined,
                              })
                            }
                            className="p-1.5 text-amber-400 hover:bg-[#1E2530] rounded"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            updateStageOverride(selectedStage.recipeId, {
                              fixedMachineCount: selectedStage.installedMachines,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-200 bg-[#1B222C] border border-[#2D3848] rounded hover:bg-[#232C39]"
                        >
                          <Lock className="w-3 h-3" />
                          Travar
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modules Editor */}
                {selectedMachine.moduleSlots > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">
                        Módulos ({selectedStage.moduleIds.length}/{selectedMachine.moduleSlots} slots)
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        Vel. {(selectedStage.effectiveStats.speedMultiplier * 100).toFixed(0)}% · Prod. +{(selectedStage.effectiveStats.productivityBonus * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {Array.from({ length: selectedMachine.moduleSlots }).map((_, slotIdx) => {
                        const modId = selectedStage.moduleIds[slotIdx] ?? '';
                        return (
                          <div key={slotIdx} className="flex items-center gap-1.5">
                            <select
                              value={modId}
                              onChange={(e) => {
                                const nextMods = [...selectedStage.moduleIds];
                                while (nextMods.length < selectedMachine.moduleSlots) nextMods.push('');
                                nextMods[slotIdx] = e.target.value;
                                updateStageOverride(selectedStage.recipeId, {
                                  moduleIds: nextMods.filter(Boolean),
                                });
                              }}
                              className="flex-1 px-2 py-1 text-xs bg-[#0D1117] border border-[#28313E] rounded text-slate-200"
                            >
                              <option value="">Slot {slotIdx + 1} vazio</option>
                              {index.pack.modules.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                            {modId && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextMods = selectedStage.moduleIds.filter((_, i) => i !== slotIdx);
                                  updateStageOverride(selectedStage.recipeId, { moduleIds: nextMods });
                                }}
                                className="p-1 text-slate-400 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Beacon Config (Factorio 2.0 sqrt) */}
                <div className="space-y-2 p-2.5 bg-[#0E1218] border border-[#222A36] rounded-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-300">
                      Beacons por Máquina ({index.pack.rulesVersion === '2.0' ? '2.0 √n' : '1.1'})
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={16}
                      value={selectedStage.beacon?.count ?? 0}
                      onChange={(e) => {
                        const cnt = Math.max(0, Math.min(16, Math.floor(Number(e.target.value) || 0)));
                        const defaultBeaconId =
                          selectedStage.beacon?.beaconId ?? index.pack.beacons[0]?.id ?? 'beacon';
                        updateStageOverride(selectedStage.recipeId, {
                          beacon: {
                            beaconId: defaultBeaconId,
                            count: cnt,
                            moduleIds:
                              selectedStage.beacon?.moduleIds ?? ['speed-module-3', 'speed-module-3'],
                          },
                        });
                      }}
                      className="w-16 px-2 py-1 text-xs font-mono text-right bg-[#141920] border border-[#2D3848] rounded text-slate-100"
                    />
                  </div>
                  {(selectedStage.beacon?.count ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      {index.pack.beacons.length > 1 && (
                        <select
                          value={selectedStage.beacon?.beaconId ?? index.pack.beacons[0]?.id ?? 'beacon'}
                          onChange={(e) =>
                            updateStageOverride(selectedStage.recipeId, {
                              beacon: {
                                beaconId: e.target.value,
                                count: selectedStage.beacon?.count ?? 1,
                                moduleIds:
                                  selectedStage.beacon?.moduleIds ?? ['speed-module-3', 'speed-module-3'],
                              },
                            })
                          }
                          className="w-full px-2 py-1 text-xs bg-[#141920] border border-[#28313E] rounded text-slate-200"
                        >
                          {index.pack.beacons.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} (eff. {(b.distributionEffectivity * 100).toFixed(0)}%)
                            </option>
                          ))}
                        </select>
                      )}
                      <select
                        value={selectedStage.beacon?.moduleIds[0] ?? 'speed-module-3'}
                        onChange={(e) =>
                          updateStageOverride(selectedStage.recipeId, {
                            beacon: {
                              beaconId: selectedStage.beacon?.beaconId ?? index.pack.beacons[0]?.id ?? 'beacon',
                              count: selectedStage.beacon?.count ?? 1,
                              moduleIds: [e.target.value, e.target.value],
                            },
                          })
                        }
                        className="w-full px-2 py-1 text-xs bg-[#141920] border border-[#28313E] rounded text-slate-200"
                      >
                        {index.pack.modules
                          .filter((m) => m.category !== 'productivity')
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              2× {m.name} por Beacon
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Main Bus / Raw Input Override */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const mainProd = selectedRecipe.mainProductId;
                      onUpdateConfig((prev) => {
                        const existing = new Set(prev.rawResourceOverrides ?? []);
                        existing.add(mainProd);
                        return { ...prev, rawResourceOverrides: Array.from(existing) };
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#1A2029] border border-[#28313E] rounded hover:text-white hover:border-slate-500 transition-colors"
                  >
                    Marcar "{index.resourcesById.get(selectedRecipe.mainProductId)?.name}" como Entrada Bruta (Main Bus)
                  </button>
                </div>

                {/* Inputs & Outputs Breakdown Table */}
                <div className="space-y-2 pt-2 border-t border-[#222A36]">
                  <h4 className="text-xs font-semibold text-slate-200">
                    Entradas e Saídas da Etapa
                  </h4>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="text-slate-400 border-b border-[#222A36]">
                        <th className="text-left py-1 font-medium">Item</th>
                        <th className="text-right py-1 font-medium">Por Máq.</th>
                        <th className="text-right py-1 font-medium">Total</th>
                        <th className="text-right py-1 font-medium">Esteiras</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono tabular-nums">
                      {selectedStage.inputs.map((inp) => {
                        const res = index.resourcesById.get(inp.itemId);
                        const totalRate = theoreticalMode
                          ? inp.theoreticalTotalPerSec
                          : inp.actualTotalPerSec;
                        const belts = selectedStage.beltsNeededPerInput[inp.itemId];
                        return (
                          <tr key={`in-${inp.itemId}`} className="border-b border-[#1D2430]">
                            <td className="py-1.5 pr-2 font-sans text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <ResourceIcon resource={res} id={inp.itemId} size={16} />
                                <span className="truncate max-w-[115px]">In · {res?.name ?? inp.itemId}</span>
                              </div>
                            </td>
                            <td className="text-right text-slate-400">
                              {formatRate(inp.perMachinePerSec, rateUnit)}
                            </td>
                            <td className="text-right text-slate-200">
                              {formatRate(totalRate, rateUnit)}
                            </td>
                            <td className="text-right text-slate-400">
                              {inp.kind === 'fluid' ? 'Tubo' : `${(belts ?? 0).toFixed(2)}`}
                            </td>
                          </tr>
                        );
                      })}
                      {selectedStage.outputs.map((out) => {
                        const res = index.resourcesById.get(out.itemId);
                        const totalRate = theoreticalMode
                          ? out.theoreticalTotalPerSec
                          : out.actualTotalPerSec;
                        const belts = selectedStage.beltsNeededPerOutput[out.itemId];
                        return (
                          <tr key={`out-${out.itemId}`} className="border-b border-[#1D2430] bg-emerald-950/15">
                            <td className="py-1.5 pr-2 font-sans text-emerald-300">
                              <div className="flex items-center gap-1.5">
                                <ResourceIcon resource={res} id={out.itemId} size={16} />
                                <span className="truncate max-w-[115px]">Out · {res?.name ?? out.itemId}</span>
                              </div>
                            </td>
                            <td className="text-right text-emerald-300/80">
                              {formatRate(out.perMachinePerSec, rateUnit)}
                            </td>
                            <td className="text-right text-emerald-300 font-semibold">
                              {formatRate(totalRate, rateUnit)}
                            </td>
                            <td className="text-right text-emerald-300/80">
                              {out.kind === 'fluid' ? 'Tubo' : `${(belts ?? 0).toFixed(2)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'summary' && (
          <div className="space-y-5">
            {/* Global Energy & Solver Mode */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-[#0E1218] border border-[#222A36] rounded-md text-xs">
              <div>
                <div className="text-[11px] text-slate-400">Energia Estimada</div>
                <div className="text-base font-bold text-amber-400 font-mono tabular-nums">
                  {(solveResult.totalPowerKw / 1000).toFixed(2)} MW
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Motor Ativo</div>
                <div className="text-sm font-semibold text-slate-100">
                  {solveResult.solverUsed === 'hybrid-matrix' ? 'Simplex LP + DAG' : 'DAG Direto'}
                </div>
              </div>
            </div>

            {/* Raw Resources */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-200">
                  Recursos Brutos Necessários
                </h4>
                {(config.rawResourceOverrides?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig((prev) => ({ ...prev, rawResourceOverrides: [] }))
                    }
                    className="text-[11px] text-amber-400 hover:underline"
                  >
                    Restaurar minérios
                  </button>
                )}
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-[#222A36]">
                    <th className="text-left py-1 font-medium">Recurso</th>
                    <th className="text-right py-1 font-medium">Taxa</th>
                    <th className="text-right py-1 font-medium">Esteiras</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {solveResult.rawInputs.map((r) => {
                    const res = index.resourcesById.get(r.itemId);
                    const rate = theoreticalMode ? r.theoreticalPerSec : r.actualPerSec;
                    return (
                      <tr key={r.itemId} className="border-b border-[#1D2430]">
                        <td className="py-1.5 font-sans text-slate-200">
                          <div className="flex items-center gap-2">
                            <ResourceIcon resource={res} id={r.itemId} size={18} />
                            <span>{res?.name ?? r.itemId}</span>
                          </div>
                        </td>
                        <td className="text-right text-slate-100">{formatRate(rate, rateUnit)}</td>
                        <td className="text-right text-slate-400">
                          {r.kind === 'fluid' ? 'Tubo' : r.beltsRequired.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Consolidated Machines */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-200">Lista de Máquinas</h4>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-[#222A36]">
                    <th className="text-left py-1 font-medium">Equipamento</th>
                    <th className="text-right py-1 font-medium">Teórico</th>
                    <th className="text-right py-1 font-medium">Instalar</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {solveResult.machineTotals.map((m) => (
                    <tr key={m.machineId} className="border-b border-[#1D2430]">
                      <td className="py-1.5 font-sans text-slate-200">{m.machineName}</td>
                      <td className="text-right text-slate-400">{m.theoreticalCount.toFixed(2)}</td>
                      <td className="text-right text-amber-400 font-semibold">{m.installedCount}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Intermediates */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-200">
                Produtos Intermediários & Excedentes
              </h4>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-[#222A36]">
                    <th className="text-left py-1 font-medium">Item</th>
                    <th className="text-right py-1 font-medium">Produção</th>
                    <th className="text-right py-1 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {solveResult.intermediates.map((inter) => {
                    const res = index.resourcesById.get(inter.itemId);
                    return (
                      <tr key={inter.itemId} className="border-b border-[#1D2430]">
                        <td className="py-1.5 font-sans text-slate-300 truncate max-w-[140px]">
                          {res?.name ?? inter.itemId}
                        </td>
                        <td className="text-right text-slate-200">
                          {formatRate(inter.producedPerSec, rateUnit)}
                        </td>
                        <td
                          className={`text-right ${
                            inter.deficitPerSec > 1e-4
                              ? 'text-red-400'
                              : inter.surplusPerSec > 0.05
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                          }`}
                        >
                          {inter.deficitPerSec > 1e-4
                            ? `-${formatRate(inter.deficitPerSec, rateUnit)}`
                            : inter.surplusPerSec > 0.05
                              ? `+${formatRate(inter.surplusPerSec, rateUnit)}`
                              : 'Exato'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>{errorCount} críticos</span>
              <span aria-hidden="true">·</span>
              <span>{warnCount} avisos</span>
            </div>

            {solveResult.alerts.length === 0 ? (
              <div className="p-6 text-center bg-[#0E1218] border border-[#222A36] rounded-md space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <div className="text-xs font-medium text-slate-200">
                  Linha de Produção Balanceada
                </div>
                <p className="text-[11px] text-slate-400">
                  Nenhum gargalo de máquinas, falta de ingredientes ou saturação de esteira detectado.
                </p>
              </div>
            ) : (
              solveResult.alerts.map((alert) => {
                const isErr = alert.severity === 'error';
                const isWarn = alert.severity === 'warning';
                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-md border space-y-1.5 text-xs ${
                      isErr
                        ? 'bg-red-950/25 border-red-800/60'
                        : isWarn
                          ? 'bg-amber-950/20 border-amber-800/50'
                          : 'bg-[#0E1218] border-[#242D3B]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        {isErr || isWarn ? (
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isErr ? 'text-red-400' : 'text-amber-400'
                            }`}
                          />
                        ) : (
                          <Info className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                        )}
                        <span className={isErr ? 'text-red-300' : isWarn ? 'text-amber-300' : 'text-sky-300'}>
                          {alert.code}
                        </span>
                      </div>
                      {alert.stageId && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectStage(alert.stageId!);
                            setActiveTab('stage');
                          }}
                          className="text-[11px] text-amber-400 hover:underline shrink-0"
                        >
                          Focar etapa
                        </button>
                      )}
                    </div>
                    <p className="text-slate-200 leading-relaxed">{alert.message}</p>
                    <p className="text-[11px] text-slate-400">
                      Sugestão: {alert.suggestion}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
