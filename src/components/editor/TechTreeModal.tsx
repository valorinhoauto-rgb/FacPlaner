/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Check, FlaskConical, Search, Unlock, X } from 'lucide-react';
import type { PackIndex } from '../../data/schema.ts';
import type { PlanConfig } from '../../engine/types.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

interface TechTreeModalProps {
  index: PackIndex;
  config: PlanConfig;
  onUpdateConfig: (updater: (prev: PlanConfig) => PlanConfig) => void;
  onClose: () => void;
}

export const TechTreeModal: React.FC<TechTreeModalProps> = ({
  index,
  config,
  onUpdateConfig,
  onClose,
}) => {
  const [tab, setTab] = useState<'productivity' | 'unlocks'>('productivity');
  const [query, setQuery] = useState('');

  const prodTechs = useMemo(
    () => index.pack.technologies.filter((t) => Boolean(t.recipeProductivityBonus)),
    [index.pack.technologies]
  );

  const unlockTechs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.pack.technologies.filter(
      (t) =>
        t.unlockedRecipes.length > 0 &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.unlockedRecipes.some((r) => r.toLowerCase().includes(q)))
    );
  }, [index.pack.technologies, query]);

  const isTechFilterActive = Array.isArray(config.unlockedTechIds);
  const unlockedSet = useMemo(
    () =>
      new Set(
        config.unlockedTechIds ?? index.pack.technologies.map((t) => t.id)
      ),
    [config.unlockedTechIds, index.pack.technologies]
  );

  const toggleTech = (techId: string) => {
    onUpdateConfig((prev) => {
      const current = new Set(
        prev.unlockedTechIds ?? index.pack.technologies.map((t) => t.id)
      );
      if (current.has(techId)) {
        current.delete(techId);
      } else {
        current.add(techId);
      }
      return { ...prev, unlockedTechIds: Array.from(current) };
    });
  };

  const setTechProdLevel = (recipeIds: string[], bonusPerLevel: number, level: number) => {
    const clampedLevel = Math.max(0, Math.min(30, Math.floor(level)));
    onUpdateConfig((prev) => {
      const next = { ...(prev.researchProductivityBonuses ?? {}) };
      for (const rId of recipeIds) {
        if (clampedLevel === 0) {
          delete next[rId];
        } else {
          next[rId] = Number((clampedLevel * bonusPerLevel).toFixed(4));
        }
      }
      return { ...prev, researchProductivityBonuses: next };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#141920] border border-[#2C3748] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#252C37] shrink-0">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Árvore de Tecnologias & Pesquisas de Produtividade
              </h3>
              <p className="text-xs text-slate-400">
                Configure bônus infinitos do Factorio 2.0 (+10%/nível) e valide receitas desbloqueadas.
              </p>
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

        {/* Mode Tabs */}
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-[#11151B] border-b border-[#252C37] shrink-0">
          <div className="flex items-center gap-1 p-1 bg-[#0D1117] border border-[#252C37] rounded">
            <button
              type="button"
              onClick={() => setTab('productivity')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                tab === 'productivity'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Pesquisas de Produtividade ({prodTechs.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('unlocks')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                tab === 'unlocks'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Desbloqueios de Receitas ({unlockTechs.length})
            </button>
          </div>

          {tab === 'unlocks' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig((prev) => ({ ...prev, unlockedTechIds: undefined }))
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-200 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37]"
              >
                <Unlock className="w-3 h-3 text-emerald-400" />
                Desbloquear Tudo
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    unlockedTechIds: ['automation', 'logistics', 'steel-processing'],
                  }))
                }
                className="px-2.5 py-1 text-xs text-slate-300 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37]"
              >
                Modo Early-Game
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'productivity' && (
            <>
              {prodTechs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-[#0E1218] border border-[#222A36] rounded">
                  O pack atual ({index.pack.name}) não define pesquisas infinitas de produtividade por receita. Troque para Factorio 2.0 + Space Age ou importe um dump 2.0 para configurar níveis.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {prodTechs.map((tech) => {
                    const bonus = tech.recipeProductivityBonus!;
                    const primaryRecipeId = bonus.recipeIds[0];
                    const currentBonus =
                      config.researchProductivityBonuses?.[primaryRecipeId] ?? 0;
                    const level = Math.round(currentBonus / bonus.bonusPerLevel);
                    const recipe = index.recipesById.get(primaryRecipeId);
                    const mainRes = recipe
                      ? index.resourcesById.get(recipe.mainProductId)
                      : undefined;

                    return (
                      <div
                        key={tech.id}
                        className="flex items-center justify-between gap-4 p-3 bg-[#0E1218] border border-[#222A36] rounded-md"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ResourceIcon
                            resource={mainRes}
                            id={recipe?.mainProductId ?? tech.id}
                            size={28}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-100 truncate">
                              {tech.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate">
                              Receitas: {bonus.recipeIds.join(', ')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-mono tabular-nums text-emerald-400">
                            +{(currentBonus * 100).toFixed(0)}%
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">Nível</span>
                            <input
                              type="number"
                              min={0}
                              max={bonus.maxLevels ?? 30}
                              value={level}
                              onChange={(e) =>
                                setTechProdLevel(
                                  bonus.recipeIds,
                                  bonus.bonusPerLevel,
                                  Number(e.target.value) || 0
                                )
                              }
                              className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right bg-[#141920] border border-[#2D3848] rounded text-amber-400 font-semibold focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'unlocks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar tecnologia ou receita..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0D1117] border border-[#262F3D] rounded text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {isTechFilterActive
                    ? `${unlockedSet.size}/${index.pack.technologies.length} pesquisadas`
                    : 'Todas liberadas'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unlockTechs.map((tech) => {
                  const unlocked = unlockedSet.has(tech.id);
                  return (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => toggleTech(tech.id)}
                      className={`flex items-start justify-between gap-3 p-3 text-left rounded-md border transition-colors ${
                        unlocked
                          ? 'bg-[#111820] border-emerald-700/50 hover:border-emerald-500/70'
                          : 'bg-[#0D1117] border-[#222A36] opacity-75 hover:opacity-100'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {tech.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">
                          {tech.unlockedRecipes.join(', ')}
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                          unlocked
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-[#141920] border-[#2D3848] text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
