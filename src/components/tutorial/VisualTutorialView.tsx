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

export type TutorialNavigateTarget =
  | { route: 'projects' }
  | { route: 'editor' }
  | { route: 'database'; tab: 'recipes' | 'machines' | 'items' | 'mods' | 'assets' };

interface VisualTutorialViewProps {
  onNavigate: (target: TutorialNavigateTarget) => void;
}

interface TutorialStep {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  summary: string;
  icon: React.ComponentType<{ className?: string }>;
  actionLabel: string;
  actionTarget: TutorialNavigateTarget;
  bullets: Array<{ title: string; detail: string }>;
  tip: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 'mods',
    number: '01',
    title: 'Configurar & Importar Mods',
    subtitle: 'Vanilla 2.0, Space Age (DLC), Krastorio 2 ou qualquer modpack via data-raw-dump.json',
    summary:
      'O planejador já traz os pacotes Factorio 2.0 Vanilla, Factorio 2.0 + Space Age (DLC) e Space Age + Krastorio 2 prontos para uso. Para jogar com outros mods (Pyanodons, Bob’s, Angel’s, Space Exploration ou versões atualizadas), extraia o JSON oficial direto do executável do jogo.',
    icon: Upload,
    actionLabel: 'Abrir Importador de Mods (JSON)',
    actionTarget: { route: 'database', tab: 'mods' },
    bullets: [
      {
        title: '1. Ative os mods no Factorio e feche o jogo',
        detail:
          'Todos os mods habilitados na sua lista local (incluindo DLC Space Age e Krastorio 2) serão incluídos automaticamente no dump.',
      },
      {
        title: '2. Execute o comando --dump-data-raw no terminal',
        detail:
          'O Factorio gera em poucos segundos um arquivo completo com receitas, máquinas, velocidades, slots de módulos, postes elétricos, pesquisas infinitas e caminhos de ícones.',
      },
      {
        title: '3. Envie o arquivo data-raw-dump.json na aba Importar Mods',
        detail:
          'Escolha a regra de beacons (2.0 √n ou 1.1 linear) e carregue o JSON. O modpack passa a aparecer imediatamente no seletor do Editor.',
      },
    ],
    tip: 'Se você usar Space Age + Krastorio 2 sem alterações extras, já pode selecionar o pack "Space Age + Krastorio 2" direto no Editor sem precisar gerar dump.',
  },
  {
    id: 'assets',
    number: '02',
    title: 'Carregar Assets Visuais (.png)',
    subtitle: 'Ícones originais do Factorio/Space Age/Krastorio 2 ou modo vetorial pronto de fábrica',
    summary:
      'Por padrão, o sistema renderiza ícones vetoriais procedurais e silhuetas animadas de alta fidelidade (Foundry, Electromagnetic Plant, Crusher, etc.). Se quiser visualizar os sprites .png originais da sua instalação local do Factorio e dos seus mods, carregue a pasta de gráficos diretamente no navegador (100% local, sem upload externo).',
    icon: FolderOpen,
    actionLabel: 'Abrir Aba Assets do Jogo (PNG)',
    actionTarget: { route: 'database', tab: 'assets' },
    bullets: [
      {
        title: '1. Localize a pasta data ou mods no seu computador',
        detail:
          'Aponte para Factorio/data (contém base e space-age) ou para a pasta descompactada de Krastorio2Assets.',
      },
      {
        title: '2. Clique em "Selecionar Pasta de Assets"',
        detail:
          'O indexador mapeia automaticamente prefixos __base__/..., __space-age__/... e __Krastorio2Assets__/..., além de casar nomes de arquivos pelo ID do protótipo.',
      },
      {
        title: '3. Menu de Abas igual ao Factorio & Planta 2D',
        detail:
          'Após importar os PNGs, o seletor de produto do Editor ganha automaticamente o menu em abas e ícones igual ao do jogo original (com mods nos respectivos grupos), além dos emblemas e itens nas esteiras da Planta 2D.',
      },
    ],
    tip: 'Caso o mod Krastorio2Assets esteja compactado em .zip dentro da pasta mods/, extraia o conteúdo dele antes de selecionar a pasta.',
  },
  {
    id: 'targets',
    number: '03',
    title: 'Metas de Produção & Fábrica Real vs Teórico',
    subtitle: 'Seleção do produto final, múltiplas saídas simultâneas e dimensionamento por esteira',
    summary:
      'No Editor, defina qual pacote de dados está usando, pesquise qualquer item ou fluido fabricável, informe a taxa desejada (/s, /min ou /h) e escolha o nível da esteira principal. Adicione múltiplas metas na mesma fábrica (ex: Ciência Vermelha + Ciência Verde) para compartilhar recursos brutos.',
    icon: Boxes,
    actionLabel: 'Ir para o Editor de Produção',
    actionTarget: { route: 'editor' },
    bullets: [
      {
        title: 'Pack & Produto Final',
        detail:
          'Use o seletor de pack na barra superior e o buscador de itens para definir o produto principal ou clique em "+ Adicionar meta" para co-planejar várias ciências.',
      },
      {
        title: 'Fábrica Real vs Modo Teórico',
        detail:
          'Fábrica Real arredonda máquinas para inteiros reais (ex: 7 máquinas) e propaga a utilização efetiva. Modo Teórico mostra o cálculo fracionário exato (estilo Helmod).',
      },
      {
        title: 'Esteira Padrão (15/s até 90/s)',
        detail:
          'Define a capacidade usada para dividir pistas duplas automaticamente e detectar gargalos de saturação de esteira.',
      },
    ],
    tip: 'Na página Projetos você também encontra 6 modelos industriais prontos (Circuitos Verdes 15/s, Refinaria + Blue Chips, Space Age EM Science, K2 Singularity Tech Card e Kovarex).',
  },
  {
    id: 'inspector',
    number: '04',
    title: 'Inspetor de Etapas, Módulos, Beacons & Tecnologias',
    subtitle: 'Ajuste fino por etapa, receitas alternativas, Main Bus e bônus de pesquisa infinita',
    summary:
      'Clique em qualquer bloco na Planta 2D ou nó no Fluxograma para inspecionar a etapa no painel lateral direito. Você controla a máquina usada, módulos, beacons √n, travamento manual de quantidade (para simular gargalos) e níveis de pesquisa infinita.',
    icon: Sliders,
    actionLabel: 'Testar no Editor & Inspetor',
    actionTarget: { route: 'editor' },
    bullets: [
      {
        title: 'Receitas Alternativas & Máquinas',
        detail:
          'Troque entre Fundição clássica e Casting (Foundry), Cracking de Petróleo ou Enriched Ores (Krastorio 2), e selecione máquinas compatíveis.',
      },
      {
        title: 'Módulos & Beacons (2.0 √n)',
        detail:
          'Adicione módulos de Produtividade, Velocidade ou Eficiência nos slots da máquina e configure a quantidade de Beacons (Standard ou K2 Singularity Beacon).',
      },
      {
        title: 'Tecnologias & Main Bus',
        detail:
          'No botão "Tecnologias" ajuste os níveis infinitos de produtividade (+10%/nível) e valide desbloqueios. Use "Entrada Bruta (Main Bus)" para assumir placas/circuitos já prontos.',
      },
    ],
    tip: 'Se você travar uma etapa com menos máquinas que o necessário, o motor calcula a fome (Starvation) em cascata e destaca os alertas na aba Gargalos.',
  },
  {
    id: 'spatial',
    number: '05',
    title: 'Planta 2D Interativa, Inserção Direta & Fluxograma',
    subtitle: 'Sintetizador automático em grade de tiles com esteiras, insertores, tubos, beacons e postes',
    summary:
      'Diferente de calculadoras puras, o planejador desenha fisicamente a linha de montagem na grade 2D do Factorio: máquinas dimensionadas (3×3, 4×4, 5×5, 7×7), pistas compartilhadas esquerda/direita, travessias subterrâneas, divisores, insertores curtos/longos, tubos de fluido, beacons e postes com fiação elétrica.',
    icon: Grid,
    actionLabel: 'Abrir Planta 2D no Editor',
    actionTarget: { route: 'editor' },
    bullets: [
      {
        title: 'Alternadores de Otimização Espacial',
        detail:
          'Ative/desative Beacons, Postes, Inserção Direta (acopla máquinas 1:1/1:N sem esteira intermediária) e Compacto vs Padrão direto na barra do Canvas.',
      },
      {
        title: 'Edição Manual na Grade (Estilo FBE)',
        detail:
          'Selecione ferramentas para adicionar esteiras, subterrâneas, divisores, insertores, tubos, beacons ou postes; arraste entidades existentes ou apague peças.',
      },
      {
        title: 'Visão Dividida (Planta 2D + Fluxograma)',
        detail:
          'Alterne entre Planta 2D, Fluxograma ou Dividido para acompanhar os fluxos de massa (itens/s e fração de esteira) lado a lado com o layout físico.',
      },
    ],
    tip: 'Atalhos no Canvas: R rotaciona a peça selecionada (ou preview), Delete/Backspace remove, Scroll aplica zoom no cursor, Alt+Arrastar move o mapa e F ajusta tudo na tela.',
  },
  {
    id: 'blueprint',
    number: '06',
    title: 'Exportar & Importar Blueprint Strings (0eN...)',
    subtitle: 'Integração direta com o Factorio 1.1 / 2.0 e Factorio School via Ctrl+V',
    summary:
      'Quando o layout estiver pronto (seja gerado automaticamente ou editado manualmente por você), exporte a string oficial comprimida em zlib/base64 (0eN...) e cole dentro do Factorio. Você também pode importar qualquer blueprint externa para visualizar e ajustar na grade.',
    icon: Share2,
    actionLabel: 'Ir para o Editor (Exportar / Importar 0eN)',
    actionTarget: { route: 'editor' },
    bullets: [
      {
        title: 'Exportar Blueprint (0eN)',
        detail:
          'Gera o payload JSON oficial do Factorio 2.0 preservando coordenadas de centro de entidade, direções (0/4/8/12), receitas e módulos nos inventários da máquina/beacon.',
      },
      {
        title: 'Colar direto no jogo',
        detail:
          'Clique em "Copiar String", abra o Factorio, pressione Ctrl+V (ou clique no ícone Importar String na barra de atalhos) e posicione a planta fantasma.',
      },
      {
        title: 'Importar (0eN) de volta para a grade',
        detail:
          'Cole strings do Factorio 1.1, 2.0, Space Age ou Factorio School (incluindo Blueprint Books). O decodificador normaliza direções e centraliza a planta no Canvas.',
      },
    ],
    tip: 'No modal de exportação você pode alternar para "JSON Decodificado" caso queira auditar exatamente cada entidade, posição e módulo antes de colar no jogo.',
  },
];

const DUMP_COMMANDS = [
  {
    os: 'Windows (Steam / Padrão)',
    cmd: '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio\\bin\\x64\\factorio.exe" --dump-data-raw',
    out: '%APPDATA%\\Factorio\\script-output\\data-raw-dump.json',
  },
  {
    os: 'Linux (Steam / Standalone)',
    cmd: '~/.local/share/Steam/steamapps/common/Factorio/bin/x64/factorio --dump-data-raw',
    out: '~/.factorio/script-output/data-raw-dump.json',
  },
  {
    os: 'macOS',
    cmd: '"/Applications/factorio.app/Contents/MacOS/factorio" --dump-data-raw',
    out: '~/Library/Application Support/factorio/script-output/data-raw-dump.json',
  },
];

const StepDiagram: React.FC<{ stepId: string }> = ({ stepId }) => {
  if (stepId === 'mods') {
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
        <text x="99" y="66" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="600">Factorio + Mods</text>
        <rect x="38" y="78" width="122" height="18" rx="3" fill="#1E293B" />
        <text x="99" y="90" textAnchor="middle" fill="#F59E0B" fontSize="10" fontFamily="JetBrains Mono">Space Age (DLC)</text>
        <rect x="38" y="101" width="122" height="18" rx="3" fill="#1E293B" />
        <text x="99" y="113" textAnchor="middle" fill="#A855F7" fontSize="10" fontFamily="JetBrains Mono">Krastorio 2 / Outros</text>
        <text x="99" y="135" textAnchor="middle" fill="#64748B" fontSize="9">Mods ativos no jogo</text>

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
        <text x="322" y="140" textAnchor="middle" fill="#64748B" fontSize="9">Extração automática de iconPath</text>

        {/* Arrow 2 */}
        <path d="M 408 95 L 456 95" stroke="#10B981" strokeWidth="2" />
        <polygon points="456,90 466,95 456,100" fill="#10B981" />
        <text x="436" y="84" textAnchor="middle" fill="#94A3B8" fontSize="9">Upload</text>

        {/* Box 3: Planner Registry */}
        <rect x="470" y="42" width="146" height="106" rx="6" fill="#111C1A" stroke="#10B981" strokeOpacity="0.7" strokeWidth="1.5" />
        <text x="543" y="66" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="600">Pack no Planejador</text>
        <text x="543" y="90" textAnchor="middle" fill="#E2E8F0" fontSize="10">Receitas validadas</text>
        <text x="543" y="108" textAnchor="middle" fill="#E2E8F0" fontSize="10">Beacons 2.0 √n ou 1.1</text>
        <text x="543" y="126" textAnchor="middle" fill="#E2E8F0" fontSize="10">Pronto no Editor</text>
      </svg>
    );
  }

  if (stepId === 'assets') {
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <rect width="640" height="190" fill="#0B0E14" />
        {/* Left: Procedural Mode */}
        <rect x="24" y="28" width="268" height="134" rx="6" fill="#141920" stroke="#2D3848" strokeWidth="1.5" />
        <text x="40" y="52" fill="#E2E8F0" fontSize="11" fontWeight="600">Modo Vetorial Procedural (Padrão)</text>
        <text x="40" y="68" fill="#64748B" fontSize="10">Funciona imediatamente sem arquivos locais</text>
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
        <text x="368" y="52" fill="#FBBF24" fontSize="11" fontWeight="600">Pasta Local de PNGs (Opcional)</text>
        <text x="368" y="76" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">__base__/graphics/icons/...</text>
        <text x="368" y="96" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono">__space-age__/graphics/icons/...</text>
        <text x="368" y="116" fill="#C084FC" fontSize="10" fontFamily="JetBrains Mono">__Krastorio2Assets__/icons/...</text>
        <rect x="368" y="128" width="230" height="22" rx="4" fill="#0F172A" stroke="#334155" />
        <text x="483" y="143" textAnchor="middle" fill="#34D399" fontSize="10">Casamento automático no Canvas & Listas</text>
      </svg>
    );
  }

  if (stepId === 'targets') {
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <rect width="640" height="190" fill="#0B0E14" />
        {/* Mock Top Bar */}
        <rect x="20" y="24" width="600" height="50" rx="6" fill="#12161D" stroke="#28313E" strokeWidth="1.5" />
        <rect x="34" y="36" width="150" height="26" rx="4" fill="#181E27" stroke="#F59E0B" strokeOpacity="0.7" />
        <text x="109" y="53" textAnchor="middle" fill="#F8FAFC" fontSize="10">1. Produto Final</text>

        <rect x="194" y="36" width="110" height="26" rx="4" fill="#0C0F14" stroke="#28313E" />
        <text x="249" y="53" textAnchor="middle" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">60 /min</text>

        <rect x="314" y="36" width="135" height="26" rx="4" fill="#181E27" stroke="#28313E" />
        <text x="381" y="53" textAnchor="middle" fill="#38BDF8" fontSize="10">2. Esteira (15-90/s)</text>

        <rect x="459" y="36" width="146" height="26" rx="4" fill="#181E27" stroke="#10B981" strokeOpacity="0.6" />
        <text x="532" y="53" textAnchor="middle" fill="#34D399" fontSize="10">3. Fábrica Real / Teórico</text>

        {/* Bottom Comparison */}
        <rect x="20" y="92" width="290" height="74" rx="6" fill="#141920" stroke="#262F3D" />
        <text x="36" y="114" fill="#F8FAFC" fontSize="11" fontWeight="600">Fábrica Real (Instalação Física)</text>
        <text x="36" y="134" fill="#94A3B8" fontSize="10">6.67 máquinas → instala <tspan fill="#FBBF24" fontWeight="700">7x máquinas</tspan></text>
        <text x="36" y="150" fill="#94A3B8" fontSize="10">Calcula sobra e saturação real das esteiras</text>

        <rect x="330" y="92" width="290" height="74" rx="6" fill="#141920" stroke="#262F3D" />
        <text x="346" y="114" fill="#F8FAFC" fontSize="11" fontWeight="600">Modo Teórico (Estilo Helmod)</text>
        <text x="346" y="134" fill="#94A3B8" fontSize="10">Exibe taxas exatas: <tspan fill="#38BDF8" fontWeight="700">6.67 máquinas</tspan></text>
        <text x="346" y="150" fill="#94A3B8" fontSize="10">Ideal para dimensionar razões matemáticas puras</text>
      </svg>
    );
  }

  if (stepId === 'inspector') {
    return (
      <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
        <rect width="640" height="190" fill="#0B0E14" />
        {/* Flow Node */}
        <rect x="26" y="40" width="190" height="110" rx="6" fill="#141920" stroke="#F59E0B" strokeWidth="1.5" />
        <text x="42" y="64" fill="#FBBF24" fontSize="11" fontWeight="600">Etapa: Processing Unit</text>
        <text x="42" y="84" fill="#CBD5E1" fontSize="10">Máquina: EM Plant (+50% prod)</text>
        <text x="42" y="102" fill="#FB7185" fontSize="10">Módulos: 5× Produtividade 3</text>
        <text x="42" y="120" fill="#38BDF8" fontSize="10">Beacons: 2× (Fator √n = 1.41)</text>
        <text x="42" y="138" fill="#34D399" fontSize="10">Pesquisa Infinita: Nível 3 (+30%)</text>

        <path d="M 224 95 L 266 95" stroke="#F59E0B" strokeWidth="2" />
        <polygon points="266,90 276,95 266,100" fill="#F59E0B" />

        {/* Inspector Tabs Preview */}
        <rect x="282" y="28" width="332" height="134" rx="6" fill="#141920" stroke="#2D3848" strokeWidth="1.5" />
        <rect x="282" y="28" width="110" height="28" fill="#1A222D" />
        <text x="337" y="46" textAnchor="middle" fill="#FBBF24" fontSize="10" fontWeight="600">Etapa</text>
        <text x="447" y="46" textAnchor="middle" fill="#94A3B8" fontSize="10">Consolidado</text>
        <text x="557" y="46" textAnchor="middle" fill="#94A3B8" fontSize="10">Gargalos</text>
        <line x1="282" y1="56" x2="614" y2="56" stroke="#252C37" />
        <text x="300" y="78" fill="#E2E8F0" fontSize="10">• Troca receitas alternativas e travas de máquina</text>
        <text x="300" y="98" fill="#E2E8F0" fontSize="10">• Marca qualquer item como Entrada Bruta (Main Bus)</text>
        <text x="300" y="118" fill="#E2E8F0" fontSize="10">• Tabela exata: In/Out por máquina, Total e Esteiras</text>
        <text x="300" y="138" fill="#FB7185" fontSize="10">• Alertas automáticos de Starvation e Saturação</text>
      </svg>
    );
  }

  if (stepId === 'spatial') {
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
        <text x="60" y="120" textAnchor="middle" fill="#38BDF8" fontSize="9">Beacon 3×3</text>

        {/* Input Belt */}
        <rect x="112" y="24" width="22" height="132" fill="#1E242E" stroke="#FACC15" strokeWidth="1.5" />
        <circle cx="118" cy="48" r="3" fill="#60A5FA" />
        <circle cx="128" cy="64" r="3" fill="#FB923C" />
        <circle cx="118" cy="92" r="3" fill="#60A5FA" />
        <circle cx="128" cy="112" r="3" fill="#FB923C" />
        <text x="123" y="170" textAnchor="middle" fill="#FACC15" fontSize="9">Pista Dupla</text>

        {/* Inserter + Pole */}
        <rect x="138" y="64" width="20" height="20" fill="#1E2530" stroke="#3B82F6" strokeWidth="1.5" />
        <line x1="142" y1="74" x2="156" y2="74" stroke="#3B82F6" strokeWidth="2.5" />
        <rect x="142" y="96" width="12" height="12" fill="#242F3E" stroke="#38BDF8" />

        {/* Feeder Machine (Direct Insertion) */}
        <rect x="164" y="44" width="66" height="66" rx="3" fill="#1C2430" stroke="#FB923C" strokeWidth="1.5" />
        <circle cx="197" cy="77" r="14" fill="#FB923C" fillOpacity="0.85" />
        <text x="197" y="126" textAnchor="middle" fill="#CBD5E1" fontSize="9">Máq. Alimentadora</text>

        {/* Direct Inserter */}
        <rect x="234" y="67" width="20" height="20" fill="#1E2530" stroke="#10B981" strokeWidth="1.5" />
        <line x1="236" y1="77" x2="252" y2="77" stroke="#10B981" strokeWidth="2.5" />
        <text x="244" y="102" textAnchor="middle" fill="#34D399" fontSize="8">Direto</text>

        {/* Consumer Machine */}
        <rect x="258" y="44" width="66" height="66" rx="3" fill="#1C2430" stroke="#F59E0B" strokeWidth="2" />
        <circle cx="291" cy="77" r="14" fill="#22C55E" fillOpacity="0.85" />
        <rect x="263" y="98" width="7" height="7" fill="#FB7185" />
        <rect x="272" y="98" width="7" height="7" fill="#FB7185" />
        <text x="291" y="126" textAnchor="middle" fill="#FBBF24" fontSize="9">Consumidora</text>

        {/* Output Belt */}
        <rect x="348" y="24" width="22" height="132" fill="#1E242E" stroke="#38BDF8" strokeWidth="1.5" />
        <text x="359" y="170" textAnchor="middle" fill="#38BDF8" fontSize="9">Saída</text>

        {/* Shortcut Box */}
        <rect x="394" y="24" width="224" height="142" rx="6" fill="#141920" stroke="#2D3848" strokeWidth="1.5" />
        <text x="410" y="48" fill="#F8FAFC" fontSize="11" fontWeight="600">Controles Rápidos da Grade</text>
        <text x="410" y="72" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">R        <tspan fill="#CBD5E1" fontFamily="DM Sans">Rotacionar entidade/preview</tspan></text>
        <text x="410" y="92" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">Del      <tspan fill="#CBD5E1" fontFamily="DM Sans">Apagar peça selecionada</tspan></text>
        <text x="410" y="112" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">F        <tspan fill="#CBD5E1" fontFamily="DM Sans">Ajustar fábrica na tela</tspan></text>
        <text x="410" y="132" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">Scroll   <tspan fill="#CBD5E1" fontFamily="DM Sans">Zoom focado no ponteiro</tspan></text>
        <text x="410" y="152" fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">Alt+Drag <tspan fill="#CBD5E1" fontFamily="DM Sans">Mover mapa livremente</tspan></text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 640 190" className="w-full h-auto bg-[#0B0E14] border border-[#242D3B] rounded-md">
      <rect width="640" height="190" fill="#0B0E14" />
      <rect x="26" y="42" width="166" height="106" rx="6" fill="#141920" stroke="#3B485C" strokeWidth="1.5" />
      <text x="109" y="68" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="600">Planta 2D Editável</text>
      <text x="109" y="90" textAnchor="middle" fill="#94A3B8" fontSize="10">Máquinas + Receitas</text>
      <text x="109" y="108" textAnchor="middle" fill="#94A3B8" fontSize="10">Esteiras + Insertores</text>
      <text x="109" y="126" textAnchor="middle" fill="#94A3B8" fontSize="10">Beacons + Módulos</text>

      <path d="M 198 80 L 244 80" stroke="#F59E0B" strokeWidth="2" />
      <polygon points="244,75 254,80 244,85" fill="#F59E0B" />
      <path d="M 254 112 L 208 112" stroke="#38BDF8" strokeWidth="2" />
      <polygon points="208,107 198,112 208,117" fill="#38BDF8" />

      <rect x="258" y="42" width="166" height="106" rx="6" fill="#141920" stroke="#F59E0B" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x="341" y="68" textAnchor="middle" fill="#FBBF24" fontSize="11" fontWeight="600">String 0eN... Oficial</text>
      <rect x="274" y="80" width="134" height="24" rx="4" fill="#0C0F14" stroke="#252C37" />
      <text x="341" y="96" textAnchor="middle" fill="#E2E8F0" fontSize="9.5" fontFamily="JetBrains Mono">0eNqrVkrKKU0t...</text>
      <text x="341" y="122" textAnchor="middle" fill="#94A3B8" fontSize="9">zlib deflate + Base64</text>
      <text x="341" y="137" textAnchor="middle" fill="#34D399" fontSize="9">Factorio 1.1 &amp; 2.0 compatível</text>

      <path d="M 430 95 L 476 95" stroke="#10B981" strokeWidth="2" />
      <polygon points="476,90 486,95 476,100" fill="#10B981" />

      <rect x="490" y="42" width="124" height="106" rx="6" fill="#111C1A" stroke="#10B981" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x="552" y="72" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="600">Dentro do Jogo</text>
      <text x="552" y="96" textAnchor="middle" fill="#E2E8F0" fontSize="10">Ctrl+V para colar</text>
      <text x="552" y="114" textAnchor="middle" fill="#E2E8F0" fontSize="10">ou importar do</text>
      <text x="552" y="130" textAnchor="middle" fill="#E2E8F0" fontSize="10">Factorio School</text>
    </svg>
  );
};

export const VisualTutorialView: React.FC<VisualTutorialViewProps> = ({ onNavigate }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const step = STEPS[activeIdx];
  const StepIcon = step.icon;

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
            <span>GUIA VISUAL INTERATIVO · DO SETUP DE MODS ATÉ A BLUEPRINT NO JOGO</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Como usar o Factorio Production Planner
          </h1>
          <p className="text-sm text-slate-400 max-w-3xl">
            Siga os 6 passos ilustrados abaixo para importar seus mods e sprites do Factorio, calcular a cadeia produtiva, ajustar a Planta 2D e levar a blueprint pronta para dentro do jogo.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate({ route: 'database', tab: 'mods' })}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-[#151A21] border border-[#28313E] rounded-md hover:bg-[#1C222B] whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            Importar Mods
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ route: 'editor' })}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-md hover:bg-amber-400 whitespace-nowrap"
          >
            <Grid className="w-3.5 h-3.5" />
            Ir para o Editor
          </button>
        </div>
      </div>

      {/* Main Split: Left Step Rail + Right Visual Guide Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Rail */}
        <div className="lg:col-span-4 space-y-2">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
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
              <span>Atalhos do Editor 2D</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
              <div><strong className="text-amber-400">R</strong> · Rotacionar</div>
              <div><strong className="text-amber-400">F</strong> · Ajustar zoom</div>
              <div><strong className="text-amber-400">Del</strong> · Apagar peça</div>
              <div><strong className="text-amber-400">Alt+Drag</strong> · Pan</div>
            </div>
          </div>
        </div>

        {/* Right Detailed Step Content */}
        <div className="lg:col-span-8 bg-[#141920] border border-[#262F3D] rounded-md p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-[#222A36] pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                <StepIcon className="w-4 h-4" />
                <span>PASSO {step.number} DE 06</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-100">{step.title}</h2>
              <p className="text-xs text-slate-400">{step.subtitle}</p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate(step.actionTarget)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400 whitespace-nowrap shrink-0"
            >
              <span>{step.actionLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive SVG Diagram */}
          <StepDiagram stepId={step.id} />

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
                Comandos prontos para extrair o <code className="font-mono text-amber-400">data-raw-dump.json</code>:
              </div>
              <div className="space-y-2">
                {DUMP_COMMANDS.map((item) => (
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
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copiar comando
                          </>
                        )}
                      </button>
                    </div>
                    <code className="block text-[11px] font-mono text-emerald-300 break-all">
                      {item.cmd}
                    </code>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Saída: {item.out}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extra Info on Step 02 (Assets Folders) */}
          {step.id === 'assets' && (
            <div className="p-3.5 bg-[#0B0E14] border border-[#222A36] rounded space-y-1.5 text-xs">
              <div className="font-semibold text-slate-200">Caminhos padrão das texturas no computador:</div>
              <div className="font-mono text-[11px] text-slate-400 space-y-1">
                <div>• Base &amp; Space Age: <span className="text-sky-300">.../Steam/steamapps/common/Factorio/data</span></div>
                <div>• Krastorio 2 Assets: <span className="text-purple-300">%APPDATA%/Factorio/mods/Krastorio2Assets_*/</span> (extraído do .zip)</div>
              </div>
            </div>
          )}

          {/* Engineering Tip */}
          <div className="p-3.5 bg-[#111822] border border-amber-500/30 rounded-md text-xs text-slate-300 flex items-start gap-2.5">
            <FlaskConical className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Dica prática:</strong> {step.tip}
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
              Passo Anterior
            </button>

            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400 tabular-nums">
              {activeIdx + 1} / {STEPS.length}
            </div>

            {activeIdx < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveIdx((i) => Math.min(STEPS.length - 1, i + 1))}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded hover:bg-amber-400"
              >
                Próximo Passo
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate({ route: 'editor' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded hover:bg-emerald-300"
              >
                <Layers className="w-3.5 h-3.5" />
                Começar a Planejar
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
            Importar data-raw-dump.json
          </div>
          <p className="text-xs text-slate-400">
            Carregue modpacks customizados direto da sua instalação do Factorio.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ route: 'database', tab: 'assets' })}
          className="text-left p-4 bg-[#12161D] border border-[#222A36] rounded-md hover:border-amber-500/60 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <FolderOpen className="w-4 h-4 text-sky-400" />
            Carregar Sprites PNG do Jogo
          </div>
          <p className="text-xs text-slate-400">
            Substitua os ícones vetoriais pelas texturas originais da pasta data/.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ route: 'projects' })}
          className="text-left p-4 bg-[#12161D] border border-[#222A36] rounded-md hover:border-amber-500/60 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <Download className="w-4 h-4 text-emerald-400" />
            Explorar Modelos Space Age &amp; K2
          </div>
          <p className="text-xs text-slate-400">
            Abra projetos pré-configurados de Circuitos, Fulgora EM e Singularity Cards.
          </p>
        </button>
      </div>
    </div>
  );
};
