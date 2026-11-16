/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Cloud,
  CloudUpload,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  LogIn,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import factorioLogo from '../../assets/images/factorio_planner_logo_1794839939049.jpg';
import { packRegistry } from '../../data/packRegistry.ts';
import { solveProductionPlan } from '../../engine/solver.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import {
  createBlankProject,
  createProjectFromTemplate,
  formatRate,
  PROJECT_TEMPLATES,
  type FactoryProject,
} from '../../state/projectsStore.ts';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

interface DashboardViewProps {
  projects: FactoryProject[];
  cloudProjectIds?: Set<string>;
  userDisplayName?: string | null;
  isSignedIn?: boolean;
  isSyncing?: boolean;
  onSignIn?: () => void;
  onSaveProjectToCloud?: (project: FactoryProject) => void;
  onOpenProject: (projectId: string) => void;
  onCreateProject: (project: FactoryProject) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onImportProject: (project: FactoryProject) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  cloudProjectIds,
  userDisplayName,
  isSignedIn = false,
  isSyncing = false,
  onSignIn,
  onSaveProjectToCloud,
  onOpenProject,
  onCreateProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProject,
}) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.config.targets.some((tgt) => tgt.itemId.toLowerCase().includes(q))
    );
  }, [projects, search]);

  const handleCreateBlank = () => {
    const packId = packRegistry.listPacks()[0].id;
    onCreateProject(
      createBlankProject(packId, {
        name: t.projects.blankName,
        description: t.projects.blankDescription,
      })
    );
  };

  const handleExportJson = (project: FactoryProject) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FactoryProject;
      if (!parsed.config || !Array.isArray(parsed.config.targets)) {
        throw new Error(t.dashboard.invalidImportJson);
      }
      const imported: FactoryProject = {
        ...parsed,
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        updatedAt: new Date().toISOString(),
        createdAt: parsed.createdAt ?? new Date().toISOString(),
      };
      onImportProject(imported);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t.dashboard.importFailed);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-8 space-y-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-[#32363E] pb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-md border border-[#484C56] bg-[#141517] overflow-hidden shrink-0 shadow-md hidden sm:block">
            <img
              src={factorioLogo}
              alt="Logo Factorio Production Planner"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100 text-balance">
              {t.dashboard.title}
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              {t.dashboard.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-[#23252B] border border-[#383C45] rounded-md hover:bg-[#2B2E35] factorio-bevel transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            {t.dashboard.importProject}
          </button>
          <button
            type="button"
            onClick={handleCreateBlank}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-md hover:bg-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.dashboard.newPlan}
          </button>
        </div>
      </div>

      {importError && (
        <div className="px-4 py-3 text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded-md">
          {importError}
        </div>
      )}

      {/* Cloud Account Status Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-[#1B1D21] border border-[#32363E] rounded-md factorio-bevel text-xs">
        {isSignedIn ? (
          <>
            <div className="flex items-center gap-2.5 text-slate-300">
              <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {t.dashboard.cloudConnectedPrefix}{' '}
                <strong className="text-slate-100">
                  {userDisplayName || t.dashboard.engineerFallback}
                </strong>{' '}
                · {t.dashboard.cloudConnectedSuffix}
              </span>
            </div>
            <span className="font-mono text-[11px] text-emerald-400 shrink-0">
              {isSyncing ? t.dashboard.syncing : t.dashboard.cloudActive}
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 text-slate-400">
              <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t.dashboard.localModeBanner}</span>
            </div>
            {onSignIn && (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-[#25272D] border border-[#3A3E48] rounded hover:border-amber-500/70 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-400" />
                {t.dashboard.signInGoogle}
              </button>
            )}
          </>
        )}
      </div>

      {/* Saved Projects Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-200">
            {t.dashboard.myPlans} ({filteredProjects.length})
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.dashboard.searchPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#141920] border border-[#262F3D] rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="p-8 text-center bg-[#141920] border border-[#262F3D] rounded-md space-y-3">
            <p className="text-sm text-slate-300">{t.dashboard.noPlansTitle}</p>
            <p className="text-xs text-slate-500">{t.dashboard.noPlansDesc}</p>
            <button
              type="button"
              onClick={handleCreateBlank}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-md hover:bg-amber-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.dashboard.createFirstPlan}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => {
              const pack = packRegistry.getPack(project.config.packId);
              const index = packRegistry.getIndex(project.config.packId);
              const solved = solveProductionPlan(index, project.config);
              const primaryTarget = project.config.targets[0];
              const targetRes = primaryTarget ? index.resourcesById.get(primaryTarget.itemId) : undefined;
              const totalMachines = solved.machineTotals.reduce((a, m) => a + m.installedCount, 0);

              const inCloud = Boolean(cloudProjectIds?.has(project.id));

              return (
                <div
                  key={project.id}
                  className="flex flex-col justify-between p-4 bg-[#1B1D21] border border-[#32363E] rounded-md hover:border-[#494F5A] factorio-bevel transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {primaryTarget && (
                          <ResourceIcon resource={targetRes} id={primaryTarget.itemId} size={28} />
                        )}
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-100 truncate">
                            {project.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <span className="truncate">{pack.name}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums shrink-0">
                              {primaryTarget
                                ? formatRate(primaryTarget.ratePerSec, project.rateUnit)
                                : t.dashboard.noProduct}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        title={inCloud ? t.dashboard.savedCloud : t.dashboard.savedLocal}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0E1319] border border-[#252D3A] text-slate-400 shrink-0"
                      >
                        {inCloud ? t.dashboard.cloudLabel : t.dashboard.localLabel}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2">{project.description}</p>

                    <div className="flex items-center gap-3 pt-1 text-xs text-slate-400 font-mono tabular-nums">
                      <span>{totalMachines} {t.dashboard.machines}</span>
                      <span aria-hidden="true">·</span>
                      <span>{(solved.totalPowerKw / 1000).toFixed(2)} MW</span>
                      <span aria-hidden="true">·</span>
                      <span className={solved.alerts.some((a) => a.severity === 'error') ? 'text-red-400' : 'text-emerald-400'}>
                        {solved.alerts.length === 0
                          ? t.dashboard.balanced
                          : `${solved.alerts.length} ${t.dashboard.alertsCount}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-[#222A36]">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 transition-colors whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t.dashboard.openEditor}
                    </button>

                    <div className="flex items-center gap-1">
                      {isSignedIn && !inCloud && onSaveProjectToCloud && (
                        <button
                          type="button"
                          title={t.dashboard.uploadToCloud}
                          onClick={() => onSaveProjectToCloud(project)}
                          className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-[#1E2530] rounded transition-colors"
                        >
                          <CloudUpload className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        title={t.dashboard.duplicate}
                        onClick={() => onDuplicateProject(project.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-[#1E2530] rounded transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t.dashboard.exportJson}
                        onClick={() => handleExportJson(project)}
                        className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-[#1E2530] rounded transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t.dashboard.delete}
                        onClick={() => onDeleteProject(project.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#1E2530] rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Starter Factory Templates */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-200">
            {t.dashboard.starterTemplatesTitle}
          </h2>
          <p className="text-xs text-slate-400">
            {t.dashboard.starterTemplatesSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROJECT_TEMPLATES.map((tpl, idx) => {
            const index = packRegistry.getIndex(tpl.config.packId);
            const t0 = tpl.config.targets[0];
            const res = index.resourcesById.get(t0.itemId);
            const localized = t.dashboard.templates[idx];

            return (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  onCreateProject(
                    createProjectFromTemplate({
                      ...tpl,
                      name: localized?.name ?? tpl.name,
                      description: localized?.description ?? tpl.description,
                    })
                  )
                }
                className="text-left p-4 bg-[#12161C] border border-[#222A36] rounded-md hover:border-amber-500/60 hover:bg-[#171C24] transition-colors space-y-2"
              >
                <div className="flex items-center gap-2.5">
                  <ResourceIcon resource={res} id={t0.itemId} size={24} />
                  <span className="text-sm font-medium text-slate-100 truncate">
                    {localized?.name ?? tpl.name}
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">
                  {localized?.description ?? tpl.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
