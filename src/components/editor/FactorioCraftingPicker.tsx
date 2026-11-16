/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, FolderOpen, Grid, List, Search, X } from 'lucide-react';
import { spritePackStore } from '../../assets/spritePackStore.ts';
import { buildCraftableGroupCatalog, type CatalogGroup, type CatalogItem } from '../../data/groupCatalog.ts';
import type { PackIndex } from '../../data/schema.ts';
import { useI18n } from '../../i18n/I18nContext.tsx';
import { ResourceIcon } from '../common/ResourceIcon.tsx';

interface FactorioCraftingPickerProps {
  index: PackIndex;
  selectedItemId?: string;
  title?: string;
  onSelect: (itemId: string) => void;
  onClose: () => void;
  onOpenAssetsImport?: () => void;
}

const MOD_DOT_COLOR: Record<string, string> = {
  'Space Age': '#F97316',
  'Krastorio 2': '#A855F7',
};

const GroupTabIcon: React.FC<{ group: CatalogGroup }> = ({ group }) => {
  const [, setTick] = useState(0);
  useEffect(() => spritePackStore.subscribe(() => setTick((t) => t + 1)), []);

  const firstItem = group.subgroups[0]?.items[0];
  const url = spritePackStore.resolveGroupUrl(
    group.id,
    group.iconPath,
    group.fallbackIconId ?? firstItem?.id,
    firstItem?.iconPath
  );

  if (url) {
    return (
      <img
        src={url}
        alt={group.name}
        className="w-8 h-8 object-contain select-none pointer-events-none"
      />
    );
  }

  if (firstItem) {
    return <ResourceIcon resource={firstItem.resource} id={firstItem.id} size={28} />;
  }

  return (
    <span className="text-[11px] font-mono font-bold text-[#f5ecd9]">
      {group.name.slice(0, 3).toUpperCase()}
    </span>
  );
};

export const FactorioCraftingPicker: React.FC<FactorioCraftingPickerProps> = ({
  index,
  selectedItemId,
  title,
  onSelect,
  onClose,
  onOpenAssetsImport,
}) => {
  const { t } = useI18n();
  const resolvedTitle = title ?? t.picker.defaultTitle;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [spriteCount, setSpriteCount] = useState(() => spritePackStore.getStats().totalFiles);
  useEffect(() => {
    return spritePackStore.subscribe(() => {
      setSpriteCount(spritePackStore.getStats().totalFiles);
    });
  }, []);

  const hasVisualAssets = spriteCount > 0;
  const [preferListMode, setPreferListMode] = useState(false);
  const useFactorioMenu = hasVisualAssets && !preferListMode;

  const [query, setQuery] = useState('');
  const catalog = useMemo(
    () => buildCraftableGroupCatalog(index, t.picker.groups),
    [index, t.picker.groups]
  );

  const flatItems = useMemo(() => {
    const all: CatalogItem[] = [];
    for (const g of catalog) {
      for (const sg of g.subgroups) {
        for (const item of sg.items) {
          all.push(item);
        }
      }
    }
    return all;
  }, [catalog]);

  // Determine initial active group containing selectedItemId (or first non-empty group)
  const defaultGroupId = useMemo(() => {
    if (selectedItemId) {
      for (const g of catalog) {
        for (const sg of g.subgroups) {
          if (sg.items.some((it) => it.id === selectedItemId)) return g.id;
        }
      }
    }
    return catalog[0]?.id ?? 'intermediate-products';
  }, [catalog, selectedItemId]);

  const [activeGroupId, setActiveGroupId] = useState<string>(defaultGroupId);
  const [hoveredItem, setHoveredItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    if (!catalog.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(catalog[0]?.id ?? 'intermediate-products');
    }
  }, [catalog, activeGroupId]);

  // Close on click outside or Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [onClose]);

  const normalizedQuery = query.trim().toLowerCase();

  // Filter catalog groups & subgroups for live search alongside tabs
  const filteredCatalog = useMemo(() => {
    if (!normalizedQuery) return catalog;
    return catalog.map((g) => {
      const subgroups = g.subgroups
        .map((sg) => ({
          ...sg,
          items: sg.items.filter(
            (it) =>
              it.name.toLowerCase().includes(normalizedQuery) ||
              it.id.toLowerCase().includes(normalizedQuery) ||
              it.modOrigin.toLowerCase().includes(normalizedQuery)
          ),
        }))
        .filter((sg) => sg.items.length > 0);
      const totalItems = subgroups.reduce((sum, sg) => sum + sg.items.length, 0);
      return { ...g, subgroups, totalItems };
    });
  }, [catalog, normalizedQuery]);

  // Auto-switch tab when searching if current tab has 0 matches
  useEffect(() => {
    if (!normalizedQuery) return;
    const current = filteredCatalog.find((g) => g.id === activeGroupId);
    if (!current || current.totalItems === 0) {
      const firstMatch = filteredCatalog.find((g) => g.totalItems > 0);
      if (firstMatch) setActiveGroupId(firstMatch.id);
    }
  }, [normalizedQuery, filteredCatalog, activeGroupId]);

  const activeGroup =
    filteredCatalog.find((g) => g.id === activeGroupId) ??
    filteredCatalog.find((g) => g.totalItems > 0) ??
    filteredCatalog[0];

  const flatFiltered = useMemo(() => {
    if (!normalizedQuery) {
      return [...flatItems].sort((a, b) => a.name.localeCompare(b.name));
    }
    return flatItems
      .filter(
        (it) =>
          it.name.toLowerCase().includes(normalizedQuery) ||
          it.id.toLowerCase().includes(normalizedQuery) ||
          it.modOrigin.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [flatItems, normalizedQuery]);

  const detailItem =
    hoveredItem ??
    flatItems.find((it) => it.id === selectedItemId) ??
    activeGroup?.subgroups[0]?.items[0] ??
    null;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const firstMatch = useFactorioMenu
        ? activeGroup?.subgroups[0]?.items[0] ?? flatFiltered[0]
        : flatFiltered[0];
      if (firstMatch) {
        onSelect(firstMatch.id);
      }
    }
  };

  // Compact Searchable List (shown before visual PNG assets are imported, or if toggled)
  if (!useFactorioMenu) {
    return (
      <div
        ref={containerRef}
        className="w-80 sm:w-96 bg-[#141920] border border-[#2D3848] rounded-md shadow-2xl overflow-hidden"
      >
        <div className="px-3 py-2 bg-[#11151C] border-b border-[#242C3A] flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">{resolvedTitle}</span>
          <div className="flex items-center gap-1.5">
            {hasVisualAssets && (
              <button
                type="button"
                onClick={() => setPreferListMode(false)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/25"
                title={t.picker.tabsTooltip}
              >
                <Grid className="w-3 h-3" />
                {t.picker.tabsButton}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-0.5 text-slate-400 hover:text-slate-200"
              aria-label={t.picker.closeAria}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-2 border-b border-[#242C3A] relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t.picker.searchListPlaceholder}
            className="w-full pl-7 pr-2 py-1 text-xs bg-[#0C0F14] border border-[#252C37] rounded text-slate-100 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-[#1D2430]">
          {flatFiltered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-[#1D2430] ${
                item.id === selectedItemId ? 'bg-[#1D2430] text-amber-300' : 'text-slate-200'
              }`}
            >
              <ResourceIcon resource={item.resource} id={item.id} size={20} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {item.id} · {item.modOrigin}
                </div>
              </div>
            </button>
          ))}
          {flatFiltered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              {t.picker.noItemFound} &ldquo;{query}&rdquo;.
            </div>
          )}
        </div>

        {!hasVisualAssets && (
          <div className="px-3 py-2 bg-[#0E1218] border-t border-[#222A36] flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="leading-snug">
              {t.picker.assetsHintBefore} <strong className="text-slate-200">.png</strong> {t.picker.assetsHintAfter}
            </span>
            {onOpenAssetsImport && (
              <button
                type="button"
                onClick={onOpenAssetsImport}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[#18202B] border border-[#2C3748] rounded text-amber-400 hover:border-amber-500/70 shrink-0"
              >
                <FolderOpen className="w-3 h-3" />
                {t.picker.assetsButton}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Factorio Native Tabbed Inventory / Crafting Menu (Unlocked after importing PNG visual assets)
  return (
    <div
      ref={containerRef}
      className="w-[460px] sm:w-[540px] max-w-[94vw] bg-[#2b2d30] border-2 border-[#141517] shadow-[0_20px_50px_rgba(0,0,0,0.75)] rounded-[3px] overflow-hidden select-none"
    >
      {/* Classic Factorio Header Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#232528] border-b border-[#161719]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold tracking-tight text-[#ffe6c0] truncate">
            {resolvedTitle}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Integrated Live Search */}
          <div className="relative">
            <Search className="w-3 h-3 text-[#9ca3af] absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t.picker.searchGridPlaceholder}
              className="w-36 sm:w-44 pl-6 pr-6 py-1 text-xs bg-[#18191b] border border-[#101113] rounded-[2px] text-[#f5ecd9] placeholder:text-[#7c818a] focus:outline-none focus:border-[#d9821f]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#8d929a] hover:text-[#ffe6c0]"
                aria-label={t.picker.clearSearchAria}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPreferListMode(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[#3a3d42] hover:bg-[#494c53] text-[#e5dfd3] border border-[#1a1c1e] rounded-[2px]"
            title={t.picker.listTooltip}
          >
            <List className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 bg-[#3a3d42] hover:bg-[#52565e] text-[#d4d4d8] border border-[#1a1c1e] rounded-[2px]"
            aria-label={t.picker.closeAria}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Factorio Group Tabs Row */}
      <div className="px-2.5 pt-2.5 pb-1.5 bg-[#2b2d30]">
        <div className="flex flex-wrap gap-1">
          {filteredCatalog.map((group) => {
            const isActive = activeGroup?.id === group.id;
            const hasMatches = group.totalItems > 0;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroupId(group.id)}
                title={`${group.name} (${group.totalItems})`}
                className={`relative flex items-center justify-center w-[56px] h-[48px] rounded-[2px] transition-colors ${
                  isActive
                    ? 'bg-[#c87a1f] border-t-2 border-l-2 border-b-2 border-r-2 border-t-[#eea84c] border-l-[#eea84c] border-b-[#6f3e07] border-r-[#6f3e07]'
                    : 'bg-[#4d5056] hover:bg-[#5b5f66] border-t-2 border-l-2 border-b-2 border-r-2 border-t-[#696d75] border-l-[#696d75] border-b-[#2c2e32] border-r-[#2c2e32]'
                } ${!hasMatches ? 'opacity-35' : ''}`}
              >
                <GroupTabIcon group={group} />
                {normalizedQuery && hasMatches && (
                  <span className="absolute bottom-0.5 right-1 text-[10px] font-mono font-bold text-[#ffe6c0] drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]">
                    {group.totalItems}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {activeGroup && (
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#cbbba0] px-0.5">
            <span className="font-medium">{activeGroup.name}</span>
            <span className="font-mono text-[#9ca3af] tabular-nums">
              {activeGroup.totalItems} {t.picker.itemsCount}
            </span>
          </div>
        )}
      </div>

      {/* Sunken Subgroup Slot Grid */}
      <div className="mx-2.5 mb-2 p-2 bg-[#1c1d20] border border-[#121315] rounded-[2px] max-h-[320px] overflow-y-auto space-y-1.5">
        {activeGroup && activeGroup.subgroups.length > 0 ? (
          activeGroup.subgroups.map((sg) => (
            <div key={sg.id} className="flex flex-wrap gap-[3px]">
              {sg.items.map((item) => {
                const isSelected = item.id === selectedItemId;
                const url = spritePackStore.resolveUrl(item.id, item.iconPath);
                const modColor = MOD_DOT_COLOR[item.modOrigin] ?? (item.modOrigin !== 'Base' ? '#38BDF8' : null);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    onMouseEnter={() => setHoveredItem(item)}
                    onFocus={() => setHoveredItem(item)}
                    title={`${item.name} (${item.modOrigin})`}
                    className={`relative w-[38px] h-[38px] flex items-center justify-center rounded-[2px] transition-colors ${
                      isSelected
                        ? 'bg-[#b36c19] border-t border-l border-b border-r border-t-[#f2b35e] border-l-[#f2b35e] border-b-[#5b3305] border-r-[#5b3305]'
                        : 'bg-[#46494f] hover:bg-[#5c6068] border-t border-l border-b border-r border-t-[#5f636b] border-l-[#5f636b] border-b-[#27292d] border-r-[#27292d]'
                    }`}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={item.name}
                        className="w-[30px] h-[30px] object-contain pointer-events-none"
                      />
                    ) : (
                      <ResourceIcon resource={item.resource} id={item.id} size={28} />
                    )}

                    {modColor && (
                      <span
                        className="absolute top-[2px] right-[2px] w-[5px] h-[5px]"
                        style={{ backgroundColor: modColor }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-xs text-[#9ca3af]">
            {t.picker.noCraftableFound} &ldquo;{query}&rdquo;.
          </div>
        )}
      </div>

      {/* Classic Factorio Bottom Tooltip / Recipe Strip */}
      <div className="px-3 py-2 bg-[#222428] border-t border-[#161719] min-h-[60px] flex items-center justify-between gap-3">
        {detailItem ? (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <ResourceIcon
                resource={detailItem.resource}
                iconPath={detailItem.iconPath}
                id={detailItem.id}
                size={30}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#ffe6c0] truncate">
                    {detailItem.name}
                  </span>
                  <span className="text-[10px] font-mono text-[#9ca3af] shrink-0">
                    [{detailItem.modOrigin}]
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#b8bcc4] mt-0.5">
                  <span className="inline-flex items-center gap-1 font-mono text-[#eab308]">
                    <Clock className="w-3 h-3" />
                    {detailItem.primaryRecipe.energyRequired}s
                  </span>
                  <span className="text-[#6b7280]">|</span>
                  {detailItem.primaryRecipe.ingredients.length === 0 ? (
                    <span className="text-[#34d399]">{t.picker.extractionZeroInputs}</span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {detailItem.primaryRecipe.ingredients.slice(0, 4).map((ing) => {
                        const ingRes = index.resourcesById.get(ing.id);
                        return (
                          <span key={ing.id} className="inline-flex items-center gap-1">
                            <ResourceIcon resource={ingRes} id={ing.id} size={14} />
                            <span className="font-mono text-[10px] text-[#e5e7eb]">
                              {ing.amount}×
                            </span>
                          </span>
                        );
                      })}
                      {detailItem.primaryRecipe.ingredients.length > 4 && (
                        <span className="text-[10px] text-[#9ca3af]">
                          +{detailItem.primaryRecipe.ingredients.length - 4}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {detailItem.allRecipesCount > 1 && (
              <span className="text-[10px] font-mono text-[#93c5fd] shrink-0">
                {detailItem.allRecipesCount} {t.picker.recipesCount}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-[#9ca3af]">{t.picker.hoverTip}</span>
        )}
      </div>
    </div>
  );
};
