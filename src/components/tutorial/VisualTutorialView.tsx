/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  Copy,
  Download,
  FlaskConical,
  FolderOpen,
  Grid,
  Keyboard,
  Layers,
  Share2,
  Sliders,
  Upload,
} from 'lucide-react';

import { useI18n } from '../../i18n/I18nContext.tsx';
import type { Translations } from '../../i18n/translations.ts';

export type TutorialNavigateTarget =
  | { route: 'projects' }
  | { route: 'editor' }
  | { route: 'database'; tab: 'recipes' | 'machines' | 'items' | 'mods' | 'assets' };

interface VisualTutorialViewProps {
  onNavigate: (target: TutorialNavigateTarget) => void;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mods: Upload,
  assets: FolderOpen,
  targets: Boxes,
  inspector: Sliders,
  spatial: Grid,
  blueprint: Share2,
};

const STEP_TARGETS: Record<string, TutorialNavigateTarget> = {
  mods: { route: 'database', tab: 'mods' },
  assets: { route: 'database', tab: 'assets' },
  targets: { route: 'editor' },
  inspector: { route: 'editor' },
  spatial: { route: 'editor' },
  blueprint: { route: 'editor' },
};

const StepDiagram: React.FC<{
  stepId: string;
  diagrams: Translations['tutorial']['diagrams'];
}> = ({ stepId, diagrams }) => {
  if (stepId === 'mods') {
    const d = diagrams.mods;
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <defs>
          <pattern id="tutGrid1" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#151C26" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="640" height="190" fill="url(#tutGrid1)" />
        {/* Box 1: Factorio + Mods */}
        <rect x="24" y="42" width="150" height="106" rx="6" fill="#141A23" stroke="#3B485C" strokeWidth="1.5" />
        <text x="99" y="66" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="600">{d.box1Title}</text>
        <rect x="38" y="78" width="122" height="18" rx="3" fill="#1E293B" />
        <text x="99" y="90" textAnchor="middle" fill="#F59E0B" fontSize="10" fontFamily="JetBrains Mono">Space Age (DLC)</text>
        <rect x="38" y="101" width="122" height="18" rx="3" fill="#1E293B" />
        <text x="99" y="113" textAnchor="middle" fill="#A855F7" fontSize="10" fontFamily="JetBrains Mono">{d.k2Others}</text>
        <text x="99" y="135" textAnchor="middle" fill="#64748B" fontSize="9">{d.activeMods}</text>

        {/* Arrow 1 */}
        <path d="M 180 95 L 228 95" stroke="#F59E0B" strokeWidth="2" />
        <polygon points="228,90 238,95 228,100" fill="#F59E0B" />
        <text x="208" y="84" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">--dump</text>

        {/* Box 2: data-raw-dump.json */}
        <rect x="242" y="42" width="160" height="106" rx="6" fill="#141A23" stroke="#F59E0B" strokeOpacity="0.65" strokeWidth="1.5" />
        <text x="322" y="66" textAnchor="middle" fill="#FBBF24" fontSize="11" fontWeight="600">data-raw-dump.json</text>
        <text x="322" y="88" textAnchor="middle" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">recipe / item / fluid</text>
        <text x="322" y="106" textAnchor="middle" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">assembling-machine</text>
        <text x="322" y="124" textAnchor="middle" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">electric-pole / tech</text>
        <text x="322" y="140" textAnchor="middle" fill="#64748B" fontSize="9">{d.iconPathExtract}</text>

        {/* Arrow 2 */}
        <path d="M 408 95 L 456 95" stroke="#10B981" strokeWidth="2" />
        <polygon points="456,90 466,95 456,100" fill="#10B981" />
        <text x="436" y="84" textAnchor="middle" fill="#94A3B8" fontSize="9">Upload</text>

        {/* Box 3: Planner Registry */}
        <rect x="470" y="42" width="146" height="106" rx="6" fill="#111C1A" stroke="#10B981" strokeOpacity="0.7" strokeWidth="1.5" />
        <text x="543" y="66" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="600">{d.packInPlanner}</text>
        <text x="543" y="90" textAnchor="middle" fill="#E2E8F0" fontSize="10">{d.validatedRecipes}</text>
        <text x="543" y="108" textAnchor="middle" fill="#E2E8F0" fontSize="10">{d.beaconsMode}</text>
        <text x="543" y="126" textAnchor="middle" fill="#E2E8F0" fontSize="10">{d.readyInEditor}</text>
      </svg>
    );
  }

  if (stepId === 'assets') {
    const d = diagrams.assets;
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <rect width="640" height="190" fill="#0B0E14" />
        {/* Left: Procedural Mode */}
        <rect x="24" y="28" width="268" height="134" rx="6" fill="#141920" stroke="#2D3848" strokeWidth="1.5" />
        <text x="40" y="52" fill="#E2E8F0" fontSize="11" fontWeight="600">{d.proceduralTitle}</text>
        <text x="40" y="68" fill="#64748B" fontSize="10">{d.proceduralSub}</text>
        {/* Mock Foundry & EM Plant SVGs */}
        <rect x="42" y="86" width="54" height="54" rx="4" fill="#1C2430" stroke="#F97316" strokeWidth="1.5" />
        <circle cx="69" cy="113" r="14" fill="#F97316" fillOpacity="0.75" />
        <text x="69" y="152" textAnchor="middle" fill="#94A3B8" fontSize="9">Foundry</text>

        <rect x="112" y="86" width="54" height="54" rx="4" fill="#1C2430" stroke="#EC4899" strokeWidth="1.5" />
        <circle cx="131" cy="113" r="8" fill="none" stroke="#D97706" strokeWidth="2" />
        <circle cx="147" cy="113" r="8" fill="none" stroke="#D97706" strokeWidth="2" />
        <text x="139" y="152" textAnchor="middle" fill="#94A3B8" fontSize="9">EM Plant</text>

        <rect x="182" y="86" width="54" height="54" rx="4" fill="#1D1B2A" stroke="#A855F7" strokeWidth="1.5" />
        <circle cx="209" cy="113" r="12" fill="none" stroke="#64748B" strokeWidth="2" />
        <line x1="194" y1="113" x2="224" y2="113" stroke="#64748B" strokeWidth="2" />
        <text x="209" y="152" textAnchor="middle" fill="#94A3B8" fontSize="9">K2 Crusher</text>

        {/* Arrow */}
        <path d="M 300 95 L 336 95" stroke="#F59E0B" strokeWidth="2" />
        <polygon points="336,90 346,95 336,100" fill="#F59E0B" />

        {/* Right: Real PNG Asset Matching */}
        <rect x="352" y="28" width="264" height="134" rx="6" fill="#141920" stroke="#F59E0B" strokeOpacity="0.65" strokeWidth="1.5" />
        <text x="368" y="52" fill="#FBBF24" fontSize="11" fontWeight="600">{d.localPngTitle}</text>
        <text x="368" y="76" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">__base__/graphics/icons/...</text>
        <text x="368" y="96" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">__space-age__/graphics/icons/...</text>
        <text x="368" y="116" fill="#C084FC" fontSize="10" fontFamily="JetBrains Mono">__Krastorio2Assets__/icons/...</text>
        <rect x="368" y="128" width="230" height="22" rx="4" fill="#0F172A" stroke="#334155" />
        <text x="483" y="143" textAnchor="middle" fill="#34D399" fontSize="10">{d.autoMatchCanvas}</text>
      </svg>
    );
  }

  if (stepId === 'targets') {
    const d = diagrams.targets;
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <rect width="640" height="190" fill="#0B0E14" />
        {/* Mock Top Bar */}
        <rect x="20" y="24" width="600" height="50" rx="6" fill="#12161D" stroke="#28313E" strokeWidth="1.5" />
        <rect x="34" y="36" width="150" height="26" rx="4" fill="#181E27" stroke="#F59E0B" strokeOpacity="0.7" />
        <text x="109" y="53" textAnchor="middle" fill="#F8FAFC" fontSize="10">{d.finalProduct}</text>

        <rect x="194" y="36" width="110" height="26" rx="4" fill="#0C0F14" stroke="#28313E" />
        <text x="249" y="53" textAnchor="middle" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">60 /min</text>

        <rect x="314" y="36" width="135" height="26" rx="4" fill="#181E27" stroke="#28313E" />
        <text x="381" y="53" textAnchor="middle" fill="#38BDF8" fontSize="10">{d.beltTier}</text>

        <rect x="459" y="36" width="146" height="26" rx="4" fill="#181E27" stroke="#10B981" strokeOpacity="0.6" />
        <text x="532" y="53" textAnchor="middle" fill="#34D399" fontSize="10">{d.realVsTheo}</text>

        {/* Bottom Comparison */}
        <rect x="20" y="92" width="290" height="74" rx="6" fill="#141920" stroke="#262F3D" />
        <text x="36" y="114" fill="#F8FAFC" fontSize="11" fontWeight="600">{d.realTitle}</text>
        <text x="36" y="134" fill="#94A3B8" fontSize="10">{d.realLine1Before}<tspan fill="#FBBF24" fontWeight="700">{d.realLine1Highlight}</tspan></text>
        <text x="36" y="150" fill="#94A3B8" fontSize="10">{d.realLine2}</text>

        <rect x="330" y="92" width="290" height="74" rx="6" fill="#141920" stroke="#262F3D" />
        <text x="346" y="114" fill="#F8FAFC" fontSize="11" fontWeight="600">{d.theoTitle}</text>
        <text x="346" y="134" fill="#94A3B8" fontSize="10">{d.theoLine1Before}<tspan fill="#38BDF8" fontWeight="700">{d.theoLine1Highlight}</tspan></text>
        <text x="346" y="150" fill="#94A3B8" fontSize="10">{d.theoLine2}</text>
      </svg>
    );
  }

  if (stepId === 'inspector') {
    const d = diagrams.inspector;
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <rect width="640" height="190" fill="#0B0E14" />
        {/* Flow Node */}
        <rect x="26" y="40" width="190" height="110" rx="6" fill="#141920" stroke="#F59E0B" strokeWidth="1.5" />
        <text x="42" y="64" fill="#FBBF24" fontSize="11" fontWeight="600">{d.stageTitle}</text>
        <text x="42" y="84" fill="#CBD5E1" fontSize="10">{d.machineLine}</text>
        <text x="42" y="102" fill="#FB7185" fontSize="10">{d.modulesLine}</text>
        <text x="42" y="120" fill="#38BDF8" fontSize="10">{d.beaconsLine}</text>
        <text x="42" y="138" fill="#34D399" fontSize="10">{d.researchLine}</text>

        <path d="M 224 95 L 266 95" stroke="#F59E0B" strokeWidth="2" />
        <polygon points="266,90 276,95 266,100" fill="#F59E0B" />

        {/* Inspector Tabs Preview */}
        <rect x="282" y="28" width="332" height="134" rx="6" fill="#141920" stroke="#2D3848" strokeWidth="1.5" />
        <rect x="282" y="28" width="110" height="28" fill="#1A222D" />
        <text x="337" y="46" textAnchor="middle" fill="#FBBF24" fontSize="10" fontWeight="600">{d.tabStage}</text>
        <text x="447" y="46" textAnchor="middle" fill="#94A3B8" fontSize="10">{d.tabSummary}</text>
        <text x="557" y="46" textAnchor="middle" fill="#94A3B8" fontSize="10">{d.tabAlerts}</text>
        <line x1="282" y1="56" x2="614" y2="56" stroke="#252C37" />
        <text x="300" y="78" fill="#E2E8F0" fontSize="10">{d.bullet1}</text>
        <text x="300" y="98" fill="#E2E8F0" fontSize="10">{d.bullet2}</text>
        <text x="300" y="118" fill="#E2E8F0" fontSize="10">{d.bullet3}</text>
        <text x="300" y="138" fill="#FB7185" fontSize="10">{d.bullet4}</text>
      </svg>
    );
  }

  if (stepId === 'spatial') {
    const d = diagrams.spatial;
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0D1117] border border-[#242D3B] rounded-md">
        <defs>
          <pattern id="tutGrid5" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#18202C" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="640" height="190" fill="url(#tutGrid5)" />
        {/* Beacon */}
        <rect x="30" y="44" width="60" height="60" rx="3" fill="#192230" stroke="#38BDF8" strokeWidth="1.5" />
        <polygon points="60,56 76,74 60,92 44,74" fill="#38BDF8" fillOpacity="0.8" />
        <text x="60" y="120" textAnchor="middle" fill="#38BDF8" fontSize="9">{d.beaconLabel}</text>

        {/* Input Belt */}
        <rect x="112" y="24" width="22" height="132" fill="#1E242E" stroke="#FACC15" strokeWidth="1.5" />
        <circle cx="118" cy="48" r="3" fill="#60A5FA" />
        <circle cx="128" cy="64" r="3" fill="#FB923C" />
        <circle cx="118" cy="92" r="3" fill="#60A5FA" />
        <circle cx="128" cy="112" r="3" fill="#FB923C" />
        <text x="123" y="170" textAnchor="middle" fill="#FACC15" fontSize="9">{d.dualLane}</text>

        {/* Inserter + Pole */}
        <rect x="138" y="64" width="20" height="20" fill="#1E2530" stroke="#3B82F6" strokeWidth="1.5" />
        <line x1="142" y1="74" x2="156" y2="74" stroke="#3B82F6" strokeWidth="2.5" />
        <rect x="142" y="96" width="12" height="12" fill="#242F3E" stroke="#38BDF8" />

        {/* Feeder Machine (Direct Insertion) */}
        <rect x="164" y="44" width="66" height="66" rx="3" fill="#1C2430" stroke="#FB923C" strokeWidth="1.5" />
        <circle cx="197" cy="77" r="14" fill="#FB923C" fillOpacity="0.85" />
        <text x="197" y="126" textAnchor="middle" fill="#CBD5E1" fontSize="9">{d.feederMachine}</text>

        {/* Direct Inserter */}
        <rect x="234" y="67" width="20" height="20" fill="#1E2530" stroke="#10B981" strokeWidth="1.5" />
        <line x1="236" y1="77" x2="252" y2="77" stroke="#10B981" strokeWidth="2.5" />
        <text x="244" y="102" textAnchor="middle" fill="#34D399" fontSize="8">{d.directLabel}</text>

        {/* Consumer Machine */}
        <rect x="258" y="44" width="66" height="66" rx="3" fill="#1C2430" stroke="#F59E0B" strokeWidth="2" />
        <circle cx="291" cy="77" r="14" fill="#22C55E" fillOpacity="0.85" />
        <rect x="263" y="98" width="7" height="7" fill="#FB7185" />
        <rect x="272" y="98" width="7" height="7" fill="#FB7185" />
        <text x="291" y="126" textAnchor="middle" fill="#FBBF24" fontSize="9">{d.consumerMachine}</text>

        {/* Output Belt */}
        <rect x="348" y="24" width="22" height="132" fill="#1E242E" stroke="#38BDF8" strokeWidth="1.5" />
        <text x="359" y="170" textAnchor="middle" fill="#38BDF8" fontSize="9">{d.outputLabel}</text>

        {/* Shortcut Box */}
        <rect x="394" y="24" width="224" height="142" rx="6" fill="#141920" stroke="#2D3848" strokeWidth="1.5" />
        <text x="410" y="48" fill="#F8FAFC" fontSize="11" fontWeight="600">{d.controlsTitle}</text>
        <text x="410" y="72" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">R        <tspan fill="#CBD5E1" fontFamily="DM Sans">{d.rDesc}</tspan></text>
        <text x="410" y="92" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">Del      <tspan fill="#CBD5E1" fontFamily="DM Sans">{d.delDesc}</tspan></text>
        <text x="410" y="112" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">F        <tspan fill="#CBD5E1" fontFamily="DM Sans">{d.fDesc}</tspan></text>
        <text x="410" y="132" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">Scroll   <tspan fill="#CBD5E1" fontFamily="DM Sans">{d.scrollDesc}</tspan></text>
        <text x="410" y="152" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">Alt+Drag <tspan fill="#CBD5E1" fontFamily="DM Sans">{d.dragDesc}</tspan></text>
      </svg>
    );
  }

  const d = diagrams.blueprint;
  return (
    <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
      <rect width="640" height="190" fill="#0B0E14" />
      <rect x="26" y="42" width="166" height="106" rx="6" fill="#141920" stroke="#3B485C" strokeWidth="1.5" />
      <text x="109" y="68" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="600">{d.editableTitle}</text>
      <text x="109" y="90" textAnchor="middle" fill="#94A3B8" fontSize="10">{d.machinesRecipes}</text>
      <text x="109" y="108" textAnchor="middle" fill="#94A3B8" fontSize="10">{d.beltsInserters}</text>
      <text x="109" y="126" textAnchor="middle" fill="#94A3B8" fontSize="10">{d.beaconsModules}</text>

      <path d="M 198 80 L 244 80" stroke="#F59E0B" strokeWidth="2" />
      <polygon points="244,75 254,80 244,85" fill="#F59E0B" />
      <path d="M 254 112 L 208 112" stroke="#38BDF8" strokeWidth="2" />
      <polygon points="208,107 198,112 208,117" fill="#38BDF8" />

      <rect x="258" y="42" width="166" height="106" rx="6" fill="#141920" stroke="#F59E0B" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x="341" y="68" textAnchor="middle" fill="#FBBF24" fontSize="11" fontWeight="600">{d.officialString}</text>
      <rect x="274" y="80" width="134" height="24" rx="4" fill="#0C0F14" stroke="#252C37" />
      <text x="341" y="96" textAnchor="middle" fill="#E2E8F0" fontSize="9.5" fontFamily="JetBrains Mono">0eNqrVkrKKU0t...</text>
      <text x="341" y="122" textAnchor="middle" fill="#94A3B8" fontSize="9">zlib deflate + Base64</text>
      <text x="341" y="137" textAnchor="middle" fill="#34D399" fontSize="9">{d.compatible}</text>

      <path d="M 430 95 L 476 95" stroke="#10B981" strokeWidth="2" />
      <polygon points="476,90 486,95 476,100" fill="#10B981" />

      <rect x="490" y="42" width="124" height="106" rx="6" fill="#111C1A" stroke="#10B981" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x="552" y="72" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="600">{d.inGameTitle}</text>
      <text x="552" y="96" textAnchor="middle" fill="#E2E8F0" fontSize="10">{d.ctrlV}</text>
      <text x="552" y="114" textAnchor="middle" fill="#E2E8F0" fontSize="10">{d.orImportFrom}</text>
      <text x="552" y="130" textAnchor="middle" fill="#E2E8F0" fontSize="10">Factorio School</text>
    </svg>
  );
};

export const VisualTutorialView: React.FC<VisualTutorialViewProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const steps = t.tutorial.steps;
  const step = steps[activeIdx] ?? steps[0];
  const StepIcon = STEP_ICONS[step.id] ?? Upload;
  const actionTarget = STEP_TARGETS[step.id] ?? ({ route: 'editor' } as TutorialNavigateTarget);

  const dumpCommands = [
    {
      os: t.tutorial.osWindows,
      cmd: '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio\\bin\\x64\\factorio.exe" --dump-data-raw',
      out: '%APPDATA%\\Factorio\\script-output\\data-raw-dump.json',
    },
    {
      os: t.tutorial.osLinux,
      cmd: '~/.local/share/Steam/steamapps/common/Factorio/bin/x64/factorio --dump-data-raw',
      out: '~/.factorio/script-output/data-raw-dump.json',
    },
    {
      os: t.tutorial.osMac,
      cmd: '"/Applications/factorio.app/Contents/MacOS/factorio" --dump-data-raw',
      out: '~/Library/Application Support/factorio/script-output/data-raw-dump.json',
    },
  ];

  const handleCopyCmd = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-[#252C37] pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
            <BookOpen className="w-4 h-4" />
            <span>{t.tutorial.badge}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {t.tutorial.title}
          </h1>
          <p className="text-sm text-slate-400 max-w-3xl">
            {t.tutorial.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate({ route: 'database', tab: 'mods' })}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-[#151A21] border border-[#28313E] rounded-md hover:bg-[#1C222B] whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            {t.tutorial.importModsBtn}
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ route: 'editor' })}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-md hover:bg-amber-400 whitespace-nowrap"
          >
            <Grid className="w-3.5 h-3.5" />
            {t.tutorial.goToEditorBtn}
          </button>
        </div>
      </div>

      {/* Main Split: Left Step Rail + Right Visual Guide Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Rail */}
        <div className="lg:col-span-4 space-y-2">
          {steps.map((s, idx) => {
            const Icon = STEP_ICONS[s.id] ?? Upload;
            const active = idx === activeIdx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`w-full flex items-start gap-3 p-3.5 text-left rounded-md border transition-colors ${
                  active
                    ? 'bg-[#171E28] border-amber-500/80 text-slate-100'
                    : 'bg-[#12161D] border-[#222A36] text-slate-300 hover:border-[#334155] hover:bg-[#151A22]'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded flex items-center justify-center shrink-0 text-xs font-mono font-bold ${
                    active
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#1B222C] text-slate-400 border border-[#2A3444]'
                  }`}
                >
                  {s.number}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span className="text-xs font-semibold truncate">{s.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{s.subtitle}</p>
                </div>
              </button>
            );
          })}

          {/* Quick Keybindings Summary */}
          <div className="p-4 bg-[#12161D] border border-[#222A36] rounded-md space-y-2.5 mt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Keyboard className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.tutorial.shortcutsTitle}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
              <div><strong className="text-amber-400">R</strong> · {t.tutorial.shortcutRotate}</div>
              <div><strong className="text-amber-400">F</strong> · {t.tutorial.shortcutFit}</div>
              <div><strong className="text-amber-400">Del</strong> · {t.tutorial.shortcutDelete}</div>
              <div><strong className="text-amber-400">Alt+Drag</strong> · {t.tutorial.shortcutPan}</div>
            </div>
          </div>
        </div>

        {/* Right Detailed Step Content */}
        <div className="lg:col-span-8 bg-[#141920] border border-[#262F3D] rounded-md p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-[#222A36] pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                <StepIcon className="w-4 h-4" />
                <span>{t.tutorial.stepPrefix} {step.number} {t.tutorial.stepOf}</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-100">{step.title}</h2>
              <p className="text-xs text-slate-400">{step.subtitle}</p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate(actionTarget)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 whitespace-nowrap shrink-0"
            >
              <span>{step.actionLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive SVG Diagram */}
          <StepDiagram stepId={step.id} diagrams={t.tutorial.diagrams} />

          <p className="text-sm text-slate-300 leading-relaxed">{step.summary}</p>

          {/* Numbered Breakdown */}
          <div className="grid grid-cols-1 gap-3">
            {step.bullets.map((b) => (
              <div
                key={b.title}
                className="p-3.5 bg-[#0E1218] border border-[#222A36] rounded-md space-y-1"
              >
                <div className="text-xs font-semibold text-slate-100">{b.title}</div>
                <p className="text-xs text-slate-400 leading-relaxed">{b.detail}</p>
              </div>
            ))}
          </div>

          {/* Extra Commands Panel on Step 01 (Mods Dump) */}
          {step.id === 'mods' && (
            <div className="space-y-2.5 pt-2">
              <div className="text-xs font-semibold text-slate-200">
                {t.tutorial.commandsHeading} <code className="font-mono text-amber-400">data-raw-dump.json</code>:
              </div>
              <div className="space-y-2">
                {dumpCommands.map((item) => (
                  <div
                    key={item.os}
                    className="p-3 bg-[#0B0E14] border border-[#222A36] rounded space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-300">{item.os}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCmd(item.cmd)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-amber-400 hover:text-amber-300 bg-[#151B24] border border-[#273142] rounded"
                      >
                        {copiedCmd === item.cmd ? (
                          <>
                            <Check className="w-3 h-3" />
                            {t.tutorial.commandCopied}
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            {t.tutorial.commandCopy}
                          </>
                        )}
                      </button>
                    </div>
                    <code className="block text-[11px] font-mono text-emerald-300 break-all">
                      {item.cmd}
                    </code>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {t.tutorial.commandOutputPrefix} {item.out}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extra Info on Step 02 (Assets Folders) */}
          {step.id === 'assets' && (
            <div className="p-3.5 bg-[#0B0E14] border border-[#222A36] rounded space-y-1.5 text-xs">
              <div className="font-semibold text-slate-200">{t.tutorial.assetsPathsTitle}</div>
              <div className="font-mono text-[11px] text-slate-400 space-y-1">
                <div>• {t.tutorial.assetsPathBase} <span className="text-sky-300">.../Steam/steamapps/common/Factorio/data</span></div>
                <div>• {t.tutorial.assetsPathK2} <span className="text-purple-300">%APPDATA%/Factorio/mods/Krastorio2Assets_*/</span></div>
              </div>
            </div>
          )}

          {/* Engineering Tip */}
          <div className="p-3.5 bg-[#111822] border border-amber-500/30 rounded-md text-xs text-slate-300 flex items-start gap-2.5">
            <FlaskConical className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">{t.tutorial.practicalTipLabel}</strong> {step.tip}
            </div>
          </div>

          {/* Step Footer Navigation */}
          <div className="flex items-center justify-between pt-3 border-t border-[#222A36]">
            <button
              type="button"
              disabled={activeIdx === 0}
              onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#1A2029] border border-[#28313E] rounded hover:bg-[#232B37] disabled:opacity-40"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t.tutorial.prevStep}
            </button>

            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400 tabular-nums">
              {activeIdx + 1} / {steps.length}
            </div>

            {activeIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveIdx((i) => Math.min(steps.length - 1, i + 1))}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400"
              >
                {t.tutorial.nextStep}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate({ route: 'editor' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded hover:bg-emerald-300"
              >
                <Layers className="w-3.5 h-3.5" />
                {t.tutorial.startPlanning}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Jump Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <button
          type="button"
          onClick={() => onNavigate({ route: 'database', tab: 'mods' })}
          className="text-left p-4 bg-[#12161D] border border-[#222A36] rounded-md hover:border-amber-500/60 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <Upload className="w-4 h-4 text-amber-400" />
            {t.tutorial.jumpModsTitle}
          </div>
          <p className="text-xs text-slate-400">
            {t.tutorial.jumpModsDesc}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ route: 'database', tab: 'assets' })}
          className="text-left p-4 bg-[#12161D] border border-[#222A36] rounded-md hover:border-amber-500/60 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <FolderOpen className="w-4 h-4 text-sky-400" />
            {t.tutorial.jumpAssetsTitle}
          </div>
          <p className="text-xs text-slate-400">
            {t.tutorial.jumpAssetsDesc}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ route: 'projects' })}
          className="text-left p-4 bg-[#12161D] border border-[#222A36] rounded-md hover:border-amber-500/60 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <Download className="w-4 h-4 text-emerald-400" />
            {t.tutorial.jumpModelsTitle}
          </div>
          <p className="text-xs text-slate-400">
            {t.tutorial.jumpModelsDesc}
          </p>
        </button>
      </div>
    </div>
  );
};
