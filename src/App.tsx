/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { DatabaseExplorerView } from './components/database/DatabaseExplorerView.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { ProductionEditorView } from './components/editor/ProductionEditorView.tsx';
import {
  VisualTutorialView,
  type TutorialNavigateTarget,
} from './components/tutorial/VisualTutorialView.tsx';
import { DEFAULT_PACK_ID } from './data/packRegistry.ts';
import {
  createProjectFromTemplate,
  loadSavedProjects,
  PROJECT_TEMPLATES,
  saveProjects,
  type FactoryProject,
} from './state/projectsStore.ts';

type ActiveRoute = 'projects' | 'editor' | 'database' | 'tutorial';
type DatabaseTab = 'recipes' | 'machines' | 'items' | 'mods' | 'assets';

export default function App() {
  const [projects, setProjects] = useState<FactoryProject[]>(() => loadSavedProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.id ?? '');
  const [route, setRoute] = useState<ActiveRoute>('editor');
  const [databaseTab, setDatabaseTab] = useState<DatabaseTab>('recipes');

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  const handleCreateProject = (project: FactoryProject) => {
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setRoute('editor');
  };

  const handleDuplicateProject = (projectId: string) => {
    const source = projects.find((p) => p.id === projectId);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: FactoryProject = {
      ...structuredClone(source),
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${source.name} (Cópia)`,
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [copy, ...prev]);
    setActiveProjectId(copy.id);
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== projectId);
      if (remaining.length === 0) {
        const fallback = createProjectFromTemplate(PROJECT_TEMPLATES[0]);
        setActiveProjectId(fallback.id);
        return [fallback];
      }
      if (activeProjectId === projectId) {
        setActiveProjectId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleUpdateActiveProject = (
    updater: (prev: FactoryProject) => FactoryProject
  ) => {
    if (!activeProject) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProject.id ? updater(p) : p))
    );
  };

  const handleQuickNew = () => {
    const created = createProjectFromTemplate({
      name: 'Novo Planejamento',
      description: 'Linha de produção customizada.',
      rateUnit: 'per_minute',
      compactionMode: 'compact',
      config: {
        packId: DEFAULT_PACK_ID,
        targets: [{ itemId: 'electronic-circuit', ratePerSec: 1 }],
        defaultBeltId: 'fast-transport-belt',
        defaultInserterId: 'fast-inserter',
      },
    });
    handleCreateProject(created);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0F14] text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="h-[57px] flex items-center justify-between gap-8 px-6 bg-[#11151C] border-b border-[#252C37] shrink-0">
        <a
          href="#projects"
          onClick={(e) => {
            e.preventDefault();
            setRoute('projects');
          }}
          className="font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          Factorio Production Planner
        </a>

        <nav className="flex items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setRoute('projects')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              route === 'projects'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Projetos
          </button>
          <button
            type="button"
            onClick={() => setRoute('editor')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              route === 'editor'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setRoute('database')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              route === 'database'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Banco de Dados
          </button>
          <button
            type="button"
            onClick={() => setRoute('tutorial')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              route === 'tutorial'
                ? 'text-amber-400 underline underline-offset-8 decoration-2'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Tutorial
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleQuickNew}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Novo Plano
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {route === 'projects' && (
          <DashboardView
            projects={projects}
            onOpenProject={(id) => {
              setActiveProjectId(id);
              setRoute('editor');
            }}
            onCreateProject={handleCreateProject}
            onDuplicateProject={handleDuplicateProject}
            onDeleteProject={handleDeleteProject}
            onImportProject={handleCreateProject}
          />
        )}

        {route === 'editor' && activeProject && (
          <ProductionEditorView
            project={activeProject}
            onUpdateProject={handleUpdateActiveProject}
            onOpenAssetsImport={() => {
              setDatabaseTab('assets');
              setRoute('database');
            }}
          />
        )}

        {route === 'database' && (
          <DatabaseExplorerView
            initialTab={databaseTab}
            onTabChange={setDatabaseTab}
            onPackImported={(packId) => {
              if (activeProject) {
                handleUpdateActiveProject((prev) => ({
                  ...prev,
                  config: { ...prev.config, packId },
                }));
              }
            }}
          />
        )}

        {route === 'tutorial' && (
          <VisualTutorialView
            onNavigate={(target: TutorialNavigateTarget) => {
              if (target.route === 'database') {
                setDatabaseTab(target.tab);
                setRoute('database');
              } else {
                setRoute(target.route);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
