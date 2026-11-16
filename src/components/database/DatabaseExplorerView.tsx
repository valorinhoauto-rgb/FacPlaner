/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FolderOpen, Image as ImageIcon, Search, Trash2, Upload } from 'lucide-react';
import { spritePackStore } from '../../assets/spritePackStore.ts';
import type { FactorioDataRawDump } from '../../data/dumpImporter.ts';
import { packRegistry } from '../../data/packRegistry.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

type DatabaseTab = 'recipes' | 'machines' | 'items' | 'mods' | 'assets';

interface DatabaseExplorerViewProps {
  initialTab?: DatabaseTab;
  onTabChange?: (tab: DatabaseTab) => void;
  onPackImported: (packId: string) => void;
}

export const DatabaseExplorerView: React.FC<DatabaseExplorerViewProps> = ({
  initialTab,
  onTabChange,
  onPackImported,
}) => {
  const { t } = useI18n();
  const [selectedPackId, setSelectedPackId] = useState(packRegistry.listPacks()[0].id);
  const [internalTab, setInternalTab] = useState<DatabaseTab>(initialTab ?? 'recipes');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (initialTab) {
      setInternalTab(initialTab);
    }
  }, [initialTab]);

  const tab = initialTab ?? internalTab;
  const selectTab = (next: DatabaseTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  const [modName, setModName] = useState('Space Age + Krastorio 2 (Custom)');
  const [rulesVersion, setRulesVersion] = useState<'2.0' | '1.1'>('2.0');
  const [importStatus, setImportStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spriteFolderRef = useRef<HTMLInputElement>(null);
  const spriteFilesRef = useRef<HTMLInputElement>(null);

  const [spriteStats, setSpriteStats] = useState(() => spritePackStore.getStats());

  useEffect(() => {
    return spritePackStore.subscribe(() => {
      setSpriteStats(spritePackStore.getStats());
    });
  }, []);

  const packs = packRegistry.listPacks();
  const index = packRegistry.getIndex(selectedPackId);
  const pack = index.pack;

  const q = search.trim().toLowerCase();

  const filteredRecipes = useMemo(
    () =>
      pack.recipes.filter(
        (r) => !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
      ),
    [pack.recipes, q]
  );

  const filteredMachines = useMemo(
    () =>
      pack.machines.filter(
        (m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      ),
    [pack.machines, q]
  );

  const filteredItems = useMemo(
    () =>
      [...pack.items, ...pack.fluids].filter(
        (i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
      ),
    [pack.items, pack.fluids, q]
  );

  const handleUploadDump = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    try {
      const text = await file.text();
      const rawDump = JSON.parse(text) as FactorioDataRawDump;
      const newId = `mod_${Date.now()}`;
      const { pack: importedPack, validation } = packRegistry.registerFromFactorioDump(rawDump, {
        packId: newId,
        packName: modName.trim() || file.name,
        rulesVersion,
      });
      setSelectedPackId(importedPack.id);
      setImportStatus({
        ok: validation.valid,
        message: t.database.importSuccessSummary({
          name: importedPack.name,
          items: validation.stats.items,
          fluids: validation.stats.fluids,
          recipes: validation.stats.recipes,
          machines: validation.stats.machines,
          errors: validation.errors.length,
          warnings: validation.warnings.length,
        }),
      });
      onPackImported(importedPack.id);
    } catch (err) {
      setImportStatus({
        ok: false,
        message: err instanceof Error ? err.message : t.database.dumpErrorFallback,
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleUploadSprites = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await spritePackStore.loadFromFileList(files);
    e.target.value = '';
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-[#252C37] pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">
            {t.database.title}
          </h1>
          <p className="text-sm text-slate-400">
            {t.database.subtitleBefore} <code className="font-mono text-amber-400">data-raw-dump.json</code> {t.database.subtitleMid} <code className="font-mono text-slate-300">.png</code> {t.database.subtitleAfter}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedPackId}
            onChange={(e) => setSelectedPackId(e.target.value)}
            className="px-3 py-2 text-xs bg-[#141920] border border-[#28313E] rounded-md text-slate-100"
          >
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rulesVersion})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#141920] border border-[#252C37] rounded-md w-fit overflow-x-auto">
          {[
            { id: 'recipes', label: `${t.database.tabRecipes} (${pack.recipes.length})` },
            { id: 'machines', label: `${t.database.tabMachines} (${pack.machines.length})` },
            { id: 'items', label: `${t.database.tabItems} (${pack.items.length + pack.fluids.length})` },
            { id: 'mods', label: t.database.tabMods },
            {
              id: 'assets',
              label:
                spriteStats.totalFiles > 0
                  ? `${t.database.assetsLoadedTabPrefix} (${spriteStats.totalFiles})`
                  : t.database.tabAssets,
            },
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => selectTab(tabItem.id as DatabaseTab)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                tab === tabItem.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        {tab !== 'mods' && tab !== 'assets' && (
          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.database.filterPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#141920] border border-[#262F3D] rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        )}
      </div>

      {tab === 'recipes' && (
        <div className="overflow-x-auto bg-[#141920] border border-[#252C37] rounded-md">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-[#252C37] bg-[#11151B]">
                <th className="text-left px-4 py-2.5 font-medium">{t.database.colRecipe}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t.database.colCategory}</th>
                <th className="text-right px-4 py-2.5 font-medium">{t.database.colTime}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t.database.colIngredients}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t.database.colProducts}</th>
                <th className="text-center px-4 py-2.5 font-medium">{t.database.colProductivity}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2530]">
              {filteredRecipes.slice(0, 250).map((r) => {
                const mainRes = index.resourcesById.get(r.mainProductId);
                return (
                  <tr key={r.id} className="hover:bg-[#19202A]">
                    <td className="px-4 py-2.5 font-medium text-slate-100">
                      <div className="flex items-center gap-2.5">
                        <ResourceIcon
                          resource={mainRes}
                          iconPath={r.iconPath}
                          id={r.mainProductId}
                          size={20}
                        />
                        <span>{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono">{r.category}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                      {r.energyRequired}s
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 font-mono">
                      {r.ingredients.map((i) => `${i.amount}× ${i.id}`).join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-emerald-300 font-mono">
                      {r.results.map((res) => `${res.amount}× ${res.id}`).join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-300">
                      {r.allowProductivity ? t.database.yes : t.database.no}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'machines' && (
        <div className="overflow-x-auto bg-[#141920] border border-[#252C37] rounded-md">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-[#252C37] bg-[#11151B]">
                <th className="text-left px-4 py-2.5 font-medium">{t.database.colMachine}</th>
                <th className="text-right px-4 py-2.5 font-medium">{t.database.colSpeed}</th>
                <th className="text-right px-4 py-2.5 font-medium">{t.database.colBaseProd}</th>
                <th className="text-right px-4 py-2.5 font-medium">{t.database.colSlots}</th>
                <th className="text-right px-4 py-2.5 font-medium">{t.database.colSize}</th>
                <th className="text-right px-4 py-2.5 font-medium">{t.database.colPower}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t.database.colSupportedCategories}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2530]">
              {filteredMachines.map((m) => (
                <tr key={m.id} className="hover:bg-[#19202A]">
                  <td className="px-4 py-2.5 font-medium text-slate-100">
                    <div className="flex items-center gap-2.5">
                      <ResourceIcon
                        resource={index.resourcesById.get(m.id)}
                        iconPath={m.iconPath}
                        id={m.id}
                        size={22}
                      />
                      <span>{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                    {m.craftingSpeed}×
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">
                    {m.baseProductivity > 0 ? `+${(m.baseProductivity * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-200">
                    {m.moduleSlots}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-200">
                    {m.tileSize.width}×{m.tileSize.height}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300">
                    {m.energyUsageKw} kW
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 font-mono">
                    {m.craftingCategories.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'items' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredItems.slice(0, 300).map((res) => (
            <div
              key={res.id}
              className="flex items-center gap-3 p-3 bg-[#141920] border border-[#252C37] rounded-md"
            >
              <ResourceIcon resource={res} id={res.id} size={28} />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-100 truncate">{res.name}</div>
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {res.kind} · {res.id}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'mods' && (
        <div className="max-w-2xl p-6 bg-[#141920] border border-[#262F3D] rounded-md space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100">
              {t.database.modsTitlePrefix} <code className="font-mono text-amber-400">data-raw-dump.json</code>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.database.modsDescBefore} <code className="px-1.5 py-0.5 bg-[#0C0F14] rounded font-mono text-slate-200">factorio --dump-data-raw</code> {t.database.modsDescMid1} <code className="font-mono">script-output/data-raw-dump.json</code>{t.database.modsDescMid2}<code className="font-mono">__mod__/...</code>{t.database.modsDescAfter}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-slate-300">{t.database.modpackNameLabel}</label>
              <input
                type="text"
                value={modName}
                onChange={(e) => setModName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#0C0F14] border border-[#28313E] rounded text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-slate-300">{t.database.gameRulesLabel}</label>
              <select
                value={rulesVersion}
                onChange={(e) => setRulesVersion(e.target.value as '2.0' | '1.1')}
                className="w-full px-3 py-1.5 text-xs bg-[#0C0F14] border border-[#28313E] rounded text-slate-100"
              >
                <option value="2.0">{t.database.rules20}</option>
                <option value="1.1">{t.database.rules11}</option>
              </select>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleUploadDump}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400"
          >
            <Upload className="w-4 h-4" />
            {t.database.selectDumpButton}
          </button>

          {importStatus && (
            <div
              className={`flex items-start gap-2 p-3 rounded border text-xs ${
                importStatus.ok
                  ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                  : 'bg-red-950/30 border-red-800/60 text-red-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{importStatus.message}</span>
            </div>
          )}
        </div>
      )}

      {tab === 'assets' && (
        <div className="max-w-3xl p-6 bg-[#141920] border border-[#262F3D] rounded-md space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100">
              {t.database.assetsTitle}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.database.assetsDescBefore} <code className="px-1.5 py-0.5 bg-[#0C0F14] rounded font-mono text-slate-200">Factorio/data</code> {t.database.assetsDescMid1} <code className="font-mono text-amber-400">Krastorio2Assets</code> {t.database.assetsDescMid2} <code className="font-mono">__base__</code>, <code className="font-mono">__space-age__</code>, <code className="font-mono">__Krastorio2Assets__</code> {t.database.assetsDescAfter}
            </p>
          </div>

          <input
            ref={spriteFolderRef}
            type="file"
            // @ts-expect-error webkitdirectory is supported in Chromium/Firefox/Edge for folder asset import
            webkitdirectory=""
            multiple
            accept="image/png,image/webp"
            onChange={handleUploadSprites}
            className="hidden"
          />
          <input
            ref={spriteFilesRef}
            type="file"
            multiple
            accept="image/png,image/webp"
            onChange={handleUploadSprites}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => spriteFolderRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400"
            >
              <FolderOpen className="w-4 h-4" />
              {t.database.selectAssetsFolder}
            </button>
            <button
              type="button"
              onClick={() => spriteFilesRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-[#1B222C] border border-[#2D3848] rounded hover:bg-[#232C39]"
            >
              <ImageIcon className="w-4 h-4" />
              {t.database.selectPngFiles}
            </button>
            {spriteStats.totalFiles > 0 && (
              <button
                type="button"
                onClick={() => spritePackStore.clear()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-red-300 bg-red-950/30 border border-red-800/50 rounded hover:bg-red-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t.database.clearAssets}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#0E1218] border border-[#222A36] rounded text-xs">
            <div>
              <div className="text-[11px] text-slate-400">{t.database.filesLoaded}</div>
              <div className="text-base font-bold text-amber-400 font-mono tabular-nums">
                {spriteStats.totalFiles}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.database.spritesIndexed}</div>
              <div className="text-base font-bold text-slate-100 font-mono tabular-nums">
                {spriteStats.matchedByName}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.database.packsDetected}</div>
              <div className="text-xs font-medium text-emerald-400 mt-1">
                {spriteStats.detectedPacks.length > 0
                  ? spriteStats.detectedPacks.join(', ')
                  : t.database.proceduralModeActive}
              </div>
            </div>
          </div>

          {/* Live Preview of Iconic Assets across Vanilla, Space Age & Krastorio 2 */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              {t.database.previewTitle} ({pack.name})
            </div>
            <div className="flex flex-wrap gap-2">
              {pack.machines.slice(0, 14).map((m) => (
                <div
                  key={m.id}
                  title={m.name}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-[#0E1218] border border-[#222A36] rounded text-xs text-slate-300"
                >
                  <ResourceIcon iconPath={m.iconPath} id={m.id} size={22} />
                  <span className="truncate max-w-[140px]">{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
