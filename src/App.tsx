/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { onAuthStateChanged, type User } from 'firebase/auth';
import { Cloud, LogIn, LogOut, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import factorioLogo from './assets/images/factorio_planner_logo_1794839939049.jpg';
import { DatabaseExplorerView } from './components/database/DatabaseExplorerView.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { ProductionEditorView } from './components/editor/ProductionEditorView.tsx';
import {
  VisualTutorialView,
  type TutorialNavigateTarget,
} from './components/tutorial/VisualTutorialView.tsx';
import { auth, signInWithGoogle, signOutUser } from './firebase.ts';
import { useI18n } from './i18n/I18nContext.tsx';
import {
  deleteSchematicFromCloud,
  ensureUserProfile,
  saveSchematicToCloud,
  subscribeUserSchematics,
} from './services/schematicsCloud.ts';
import {
  createBlankProject,
  loadSavedProjects,
  saveProjects,
  type FactoryProject,
} from './state/projectsStore.ts';

type ActiveRoute = 'projects' | 'editor' | 'database' | 'tutorial';
type DatabaseTab = 'recipes' | 'machines' | 'items' | 'mods' | 'assets';

export default function App() {
  const { lang, setLang, t } = useI18n();
  const [projects, setProjects] = useState<FactoryProject[]>(() => loadSavedProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.id ?? '');
  const [route, setRoute] = useState<ActiveRoute>('editor');
  const [databaseTab, setDatabaseTab] = useState<DatabaseTab>('recipes');

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudProjectIds, setCloudProjectIds] = useState<Set<string>>(() => new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const pendingSaveProjectsRef = useRef<Set<string>>(new Set());
  const ensuredProfileUidRef = useRef<string | null>(null);
  const errorsRef = useRef(t.errors);
  errorsRef.current = t.errors;

  const formatCloudError = (err: unknown, fallback: string): string => {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
      if (parsed?.error?.includes('Missing or insufficient permissions')) {
        return errorsRef.current.cloudPermissionDenied;
      }
      if (parsed?.error) return `${fallback}: ${parsed.error}`;
    } catch {
      // plain string error
    }
    return raw || fallback;
  };

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    let unsubscribeSchematics: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubscribeSchematics) {
        unsubscribeSchematics();
        unsubscribeSchematics = undefined;
      }

      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        ensuredProfileUidRef.current = null;
        setCloudProjectIds(new Set());
        return;
      }

      try {
        setIsSyncing(true);
        await ensureUserProfile(nextUser);
        ensuredProfileUidRef.current = nextUser.uid;
        unsubscribeSchematics = subscribeUserSchematics(
          nextUser.uid,
          (cloudProjects) => {
            const nextCloudIds = new Set(cloudProjects.map((p) => p.id));
            setCloudProjectIds(nextCloudIds);
            setIsSyncing(false);

            if (cloudProjects.length > 0) {
              setProjects((prevLocal) => {
                // Keep any brand-new unsaved local item still waiting to flush
                const pendingLocals = prevLocal.filter(
                  (p) => !nextCloudIds.has(p.id) && pendingSaveProjectsRef.current.has(p.id)
                );
                const merged = [...pendingLocals, ...cloudProjects];
                setActiveProjectId((curr) =>
                  merged.some((p) => p.id === curr) ? curr : merged[0]?.id ?? ''
                );
                return merged;
              });
            }
          },
          (err) => {
            setIsSyncing(false);
            setAuthNotice(formatCloudError(err, errorsRef.current.cloudSyncFailed));
          }
        );
      } catch (err) {
        setIsSyncing(false);
        setAuthNotice(formatCloudError(err, errorsRef.current.cloudProfileFailed));
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSchematics) unsubscribeSchematics();
      for (const timer of saveTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  const persistToCloudNow = async (project: FactoryProject, targetUser: User | null = user) => {
    if (!targetUser) return;
    pendingSaveProjectsRef.current.add(project.id);
    setIsSyncing(true);
    setAuthNotice(null);
    try {
      if (ensuredProfileUidRef.current !== targetUser.uid) {
        await ensureUserProfile(targetUser);
        ensuredProfileUidRef.current = targetUser.uid;
      }
      await saveSchematicToCloud(targetUser.uid, project);
      setCloudProjectIds((prev) => new Set(prev).add(project.id));
    } catch (err) {
      setAuthNotice(formatCloudError(err, t.errors.cloudSaveFailed));
    } finally {
      pendingSaveProjectsRef.current.delete(project.id);
      setIsSyncing(false);
    }
  };

  const scheduleCloudSave = (project: FactoryProject) => {
    if (!user) return;
    pendingSaveProjectsRef.current.add(project.id);
    const existingTimer = saveTimersRef.current.get(project.id);
    if (existingTimer) window.clearTimeout(existingTimer);

    const timer = window.setTimeout(() => {
      saveTimersRef.current.delete(project.id);
      void persistToCloudNow(project, user);
    }, 850);
    saveTimersRef.current.set(project.id, timer);
  };

  const handleSignIn = async () => {
    setAuthNotice(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user') return;
      if (code === 'auth/unauthorized-domain') {
        setAuthNotice(t.errors.unauthorizedDomain);
        return;
      }
      setAuthNotice(err instanceof Error ? err.message : t.errors.signInFailed);
    }
  };

  const handleSignOut = async () => {
    setAuthNotice(null);
    for (const timer of saveTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    saveTimersRef.current.clear();
    await signOutUser();
  };

  const handleCreateProject = (project: FactoryProject) => {
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setRoute('editor');
    if (user) {
      void persistToCloudNow(project, user);
    }
  };

  const handleDuplicateProject = (projectId: string) => {
    const source = projects.find((p) => p.id === projectId);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: FactoryProject = {
      ...structuredClone(source),
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${source.name}${t.projects.copySuffix}`,
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [copy, ...prev]);
    setActiveProjectId(copy.id);
    if (user) {
      void persistToCloudNow(copy, user);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    const existingTimer = saveTimersRef.current.get(projectId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      saveTimersRef.current.delete(projectId);
    }

    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== projectId);
      if (remaining.length === 0) {
        const fallback = createBlankProject(undefined, {
          name: t.projects.blankName,
          description: t.projects.blankDescription,
        });
        setActiveProjectId(fallback.id);
        return [fallback];
      }
      if (activeProjectId === projectId) {
        setActiveProjectId(remaining[0].id);
      }
      return remaining;
    });

    if (user && cloudProjectIds.has(projectId)) {
      setIsSyncing(true);
      void deleteSchematicFromCloud(user.uid, projectId)
        .catch((err) => {
          setAuthNotice(formatCloudError(err, t.errors.cloudDeleteFailed));
        })
        .finally(() => setIsSyncing(false));
    }
  };

  const handleUpdateActiveProject = (
    updater: (prev: FactoryProject) => FactoryProject
  ) => {
    if (!activeProject) return;
    const updated = updater(activeProject);
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProject.id ? updated : p))
    );
    if (user) {
      scheduleCloudSave(updated);
    }
  };

  const handleQuickNew = () => {
    handleCreateProject(
      createBlankProject(undefined, {
        name: t.projects.blankName,
        description: t.projects.blankDescription,
      })
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#141517] text-slate-100">
      {/* 3-Zone Factorio Top Bar Contract */}
      <header className="h-[58px] flex items-center justify-between gap-8 px-6 bg-[#1B1C20] border-b border-[#33363E] factorio-bevel shrink-0">
        <a
          href="#projects"
          onClick={(e) => {
            e.preventDefault();
            setRoute('projects');
          }}
          className="inline-flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 hover:text-amber-300 transition-colors"
        >
          <span className="w-8 h-8 rounded-[4px] border border-[#484C56] bg-[#141517] overflow-hidden shrink-0 flex items-center justify-center">
            <img
              src={factorioLogo}
              alt="Logo Factorio Production Planner"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </span>
          <span>Factorio Production Planner</span>
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
            {t.nav.projects}
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
            {t.nav.editor}
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
            {t.nav.database}
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
            {t.nav.tutorial}
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div
            role="group"
            aria-label="Language selector"
            className="flex items-center p-0.5 bg-[#121316] border border-[#32363E] rounded shrink-0"
          >
            <button
              type="button"
              onClick={() => setLang('pt-BR')}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap ${
                lang === 'pt-BR'
                  ? 'bg-[#282B33] text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              PT-BR
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap ${
                lang === 'en'
                  ? 'bg-[#282B33] text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              EN
            </button>
          </div>

          {authReady && (
            user ? (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Cloud
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSyncing ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                />
                <span className="max-w-[130px] truncate font-medium text-slate-200">
                  {user.displayName || user.email?.split('@')[0] || t.nav.account}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title={t.nav.signOut}
                  className="p-1 text-slate-400 hover:text-slate-100 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#24262C] border border-[#393D47] rounded hover:border-amber-500/70 factorio-bevel transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-400" />
                {t.nav.signIn}
              </button>
            )
          )}

          <button
            type="button"
            onClick={handleQuickNew}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-colors whitespace-nowrap shrink-0"
          >
            {t.nav.newPlan}
          </button>
        </div>
      </header>

      {authNotice && (
        <div className="px-6 py-2 bg-red-950/50 border-b border-red-800/60 text-xs text-red-200 flex items-center justify-between gap-4">
          <span>{authNotice}</span>
          <button
            type="button"
            onClick={() => setAuthNotice(null)}
            className="text-red-300 hover:text-white shrink-0"
            aria-label={t.nav.closeNotice}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {route === 'projects' && (
          <DashboardView
            projects={projects}
            cloudProjectIds={cloudProjectIds}
            userDisplayName={user?.displayName || user?.email?.split('@')[0]}
            isSignedIn={Boolean(user)}
            isSyncing={isSyncing}
            onSignIn={handleSignIn}
            onSaveProjectToCloud={(proj) => {
              void persistToCloudNow(proj, user);
            }}
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
