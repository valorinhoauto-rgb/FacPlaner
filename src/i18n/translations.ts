/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppLanguage = 'pt-BR' | 'en';

export interface TutorialStepTranslation {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  summary: string;
  actionLabel: string;
  bullets: Array<{ title: string; detail: string }>;
  tip: string;
}

export interface Translations {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    projects: string;
    editor: string;
    database: string;
    tutorial: string;
    signIn: string;
    signOut: string;
    account: string;
    newPlan: string;
    closeNotice: string;
  };
  errors: {
    unauthorizedDomain: string;
    signInFailed: string;
    cloudPermissionDenied: string;
    cloudSyncFailed: string;
    cloudProfileFailed: string;
    cloudSaveFailed: string;
    cloudDeleteFailed: string;
  };
  projects: {
    blankName: string;
    blankDescription: string;
    copySuffix: string;
    unnamed: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    importProject: string;
    newPlan: string;
    invalidImportJson: string;
    importFailed: string;
    cloudConnectedPrefix: string;
    engineerFallback: string;
    cloudConnectedSuffix: string;
    syncing: string;
    cloudActive: string;
    localModeBanner: string;
    signInGoogle: string;
    myPlans: string;
    searchPlaceholder: string;
    noPlansTitle: string;
    noPlansDesc: string;
    createFirstPlan: string;
    noProduct: string;
    savedCloud: string;
    savedLocal: string;
    cloudLabel: string;
    localLabel: string;
    machines: string;
    balanced: string;
    alertsCount: string;
    openEditor: string;
    uploadToCloud: string;
    duplicate: string;
    exportJson: string;
    delete: string;
    starterTemplatesTitle: string;
    starterTemplatesSubtitle: string;
    templates: Array<{ name: string; description: string }>;
  };
  editor: {
    chooseProductButton: string;
    pickerPrimaryTitle: string;
    pickerSecondaryTitle: string;
    unitPerSecond: string;
    unitPerMinute: string;
    unitPerHour: string;
    unitShortSecond: string;
    unitShortMinute: string;
    unitShortHour: string;
    realFactory: string;
    theoretical: string;
    spatialView: string;
    flowView: string;
    splitView: string;
    technologies: string;
    chainButton: string;
    activeTargets: string;
    addTarget: string;
    emptyTitle: string;
    emptyDescription: string;
    emptyChooseButton: string;
    emptyDrawManualButton: string;
    beltScalePresetsTooltip: string;
    fluidScalePresetsTooltip: string;
  };
  chain: {
    title: string;
    subtitle: string;
    presetsLabel: string;
    presetFull: string;
    presetNoSmelting: string;
    presetDirectOnly: string;
    badgeTarget: string;
    badgeCrafted: string;
    badgeExternal: string;
    badgeNaturalRaw: string;
    badgePrimary: string;
    repeatedRef: string;
    collapsedSubsteps: (count: number) => string;
    clickToToggleExternal: string;
    clickToToggleCraft: string;
    summaryExternalTitle: string;
    summaryNoExternal: string;
    summaryStats: (stages: number, machines: number, externalCount: number) => string;
    alignSameSideCta: string;
    alignSameSideActive: string;
    confirmButton: string;
  };
  picker: {
    defaultTitle: string;
    tabsButton: string;
    tabsTooltip: string;
    listTooltip: string;
    closeAria: string;
    clearSearchAria: string;
    searchListPlaceholder: string;
    searchGridPlaceholder: string;
    noItemFound: string;
    noCraftableFound: string;
    assetsHintBefore: string;
    assetsHintAfter: string;
    assetsButton: string;
    itemsCount: string;
    extractionZeroInputs: string;
    recipesCount: string;
    hoverTip: string;
    filterAll: string;
    filterBasics: string;
    filterFluids: string;
    filterIntermediates: string;
    groups: Record<string, string>;
  };
  techModal: {
    title: string;
    subtitle: string;
    productivityTab: string;
    unlocksTab: string;
    unlockAll: string;
    earlyGameMode: string;
    noProdTechsBefore: string;
    noProdTechsAfter: string;
    recipesLabel: string;
    levelLabel: string;
    searchPlaceholder: string;
    researchedCount: string;
    allUnlocked: string;
  };
  flowGraph: {
    usedPct: string;
    modules: string;
    beacons: string;
    rawResource: string;
    finalTarget: string;
    beltsShort: string;
    autoArrange: string;
    clearFocus: string;
  };
  inspector: {
    tabStage: string;
    tabSummary: string;
    tabAlerts: string;
    emptyStagePrompt: string;
    inspectingStage: string;
    machines: string;
    utilization: string;
    power: string;
    alternativeRecipe: string;
    availableCount: string;
    productionMachine: string;
    speedShort: string;
    slotsShort: string;
    machineCount: string;
    lockedAt: string;
    autoCount: string;
    backToAutoTooltip: string;
    lockButton: string;
    modulesLabel: string;
    slotsWord: string;
    emptySlot: string;
    beaconsPerMachine: string;
    effShort: string;
    perBeaconSuffix: string;
    markRawButtonPrefix: string;
    markRawButtonSuffix: string;
    stageIoTitle: string;
    colItem: string;
    colPerMachine: string;
    colTotal: string;
    colBelts: string;
    pipeLabel: string;
    estimatedPower: string;
    activeSolver: string;
    solverHybrid: string;
    solverDag: string;
    rawResourcesRequired: string;
    restoreOres: string;
    colResource: string;
    colRate: string;
    machineListTitle: string;
    colEquipment: string;
    colTheoretical: string;
    colInstall: string;
    intermediatesTitle: string;
    colProduction: string;
    colBalance: string;
    exactBalance: string;
    criticalWord: string;
    warningsWord: string;
    balancedTitle: string;
    balancedDesc: string;
    focusStage: string;
    suggestionPrefix: string;
  };
  canvas: {
    tools: {
      select: string;
      pan: string;
      belt: string;
      underground: string;
      splitter: string;
      inserter: string;
      longInserter: string;
      pipe: string;
      beacon: string;
      pole: string;
      erase: string;
    };
    directions: {
      0: string;
      4: string;
      8: string;
      12: string;
    };
    rotateTooltip: string;
    beacons: string;
    poles: string;
    directInsertion: string;
    directInsertionTooltip: string;
    sameSideInputs: string;
    sameSideTooltip: string;
    inputSideSouth: string;
    inputSideWest: string;
    portIn: string;
    portOut: string;
    beltsShort: string;
    pipeShort: string;
    spaceCompact: string;
    spaceStandard: string;
    autoLayout: string;
    importBp: string;
    exportBp: string;
    removeEntity: string;
    recipeLabel: string;
    lanesLabel: string;
    movesLabel: string;
    reachUnit: string;
    pauseAnim: string;
    playAnim: string;
    zoomOut: string;
    fitToScreen: string;
    zoomIn: string;
    boundsLabel: string;
    tilesUnit: string;
    occupancyLabel: string;
    machinesLabel: string;
    beltsLabel: string;
    undergroundsLabel: string;
    splittersLabel: string;
    insertersLabel: string;
    pipesLabel: string;
    beaconsLabel: string;
    polesLabel: string;
    exportModalTitle: string;
    exportModalSubtitle: string;
    stringTab: string;
    decodedJsonTab: string;
    copied: string;
    copyString: string;
    generatedBy: string;
    importModalTitle: string;
    importModalSubtitle: string;
    emptyBlueprintError: string;
    invalidBlueprintError: string;
    cancel: string;
    decodeAndLoad: string;
    gridFrameBadge: string;
    gridFrameFits: string;
    gridFramePartial: string;
    clearGridFrame: string;
    importModeGridFrame: string;
    importModeGridFrameDesc: string;
    importModeReplace: string;
    importModeReplaceDesc: string;
    sampleRailGridBtn: string;
    sampleSubstationGridBtn: string;
  };
  database: {
    title: string;
    subtitleBefore: string;
    subtitleMid: string;
    subtitleAfter: string;
    tabRecipes: string;
    tabMachines: string;
    tabItems: string;
    tabMods: string;
    tabAssets: string;
    assetsLoadedTabPrefix: string;
    filterPlaceholder: string;
    colRecipe: string;
    colCategory: string;
    colTime: string;
    colIngredients: string;
    colProducts: string;
    colProductivity: string;
    yes: string;
    no: string;
    colMachine: string;
    colSpeed: string;
    colBaseProd: string;
    colSlots: string;
    colSize: string;
    colPower: string;
    colSupportedCategories: string;
    modsTitlePrefix: string;
    modsDescBefore: string;
    modsDescMid1: string;
    modsDescMid2: string;
    modsDescAfter: string;
    modpackNameLabel: string;
    gameRulesLabel: string;
    rules20: string;
    rules11: string;
    selectDumpButton: string;
    importSuccessSummary: (stats: {
      name: string;
      items: number;
      fluids: number;
      recipes: number;
      machines: number;
      errors: number;
      warnings: number;
    }) => string;
    dumpErrorFallback: string;
    assetsTitle: string;
    assetsDescBefore: string;
    assetsDescMid1: string;
    assetsDescMid2: string;
    assetsDescAfter: string;
    selectAssetsFolder: string;
    selectPngFiles: string;
    clearAssets: string;
    filesLoaded: string;
    spritesIndexed: string;
    packsDetected: string;
    proceduralModeActive: string;
    previewTitle: string;
  };
  tutorial: {
    badge: string;
    title: string;
    subtitle: string;
    importModsBtn: string;
    goToEditorBtn: string;
    shortcutsTitle: string;
    shortcutRotate: string;
    shortcutFit: string;
    shortcutDelete: string;
    shortcutPan: string;
    stepPrefix: string;
    stepOf: string;
    commandsHeading: string;
    commandCopy: string;
    commandCopied: string;
    commandOutputPrefix: string;
    osWindows: string;
    osLinux: string;
    osMac: string;
    assetsPathsTitle: string;
    assetsPathBase: string;
    assetsPathK2: string;
    practicalTipLabel: string;
    prevStep: string;
    nextStep: string;
    startPlanning: string;
    jumpModsTitle: string;
    jumpModsDesc: string;
    jumpAssetsTitle: string;
    jumpAssetsDesc: string;
    jumpModelsTitle: string;
    jumpModelsDesc: string;
    steps: TutorialStepTranslation[];
    diagrams: {
      mods: {
        box1Title: string;
        k2Others: string;
        activeMods: string;
        iconPathExtract: string;
        packInPlanner: string;
        validatedRecipes: string;
        beaconsMode: string;
        readyInEditor: string;
      };
      assets: {
        proceduralTitle: string;
        proceduralSub: string;
        localPngTitle: string;
        autoMatchCanvas: string;
      };
      targets: {
        finalProduct: string;
        beltTier: string;
        realVsTheo: string;
        realTitle: string;
        realLine1Before: string;
        realLine1Highlight: string;
        realLine2: string;
        theoTitle: string;
        theoLine1Before: string;
        theoLine1Highlight: string;
        theoLine2: string;
      };
      inspector: {
        stageTitle: string;
        machineLine: string;
        modulesLine: string;
        beaconsLine: string;
        researchLine: string;
        tabStage: string;
        tabSummary: string;
        tabAlerts: string;
        bullet1: string;
        bullet2: string;
        bullet3: string;
        bullet4: string;
      };
      spatial: {
        beaconLabel: string;
        dualLane: string;
        feederMachine: string;
        directLabel: string;
        consumerMachine: string;
        outputLabel: string;
        controlsTitle: string;
        rDesc: string;
        delDesc: string;
        fDesc: string;
        scrollDesc: string;
        dragDesc: string;
      };
      blueprint: {
        editableTitle: string;
        machinesRecipes: string;
        beltsInserters: string;
        beaconsModules: string;
        officialString: string;
        compatible: string;
        inGameTitle: string;
        ctrlV: string;
        orImportFrom: string;
      };
    };
  };
}

export const TRANSLATIONS: Record<AppLanguage, Translations> = {
  'pt-BR': {
    meta: {
      title: 'Factorio Production Planner',
      description:
        'Planejador visual de fábricas de Factorio com motor de cálculo recursivo/matricial, síntese de linha de montagem em grade 2D (esteiras, insertores e máquinas) e suporte a mods.',
    },
    nav: {
      projects: 'Projetos',
      editor: 'Editor',
      database: 'Banco de Dados',
      tutorial: 'Tutorial',
      signIn: 'Entrar',
      signOut: 'Sair da conta',
      account: 'Conta',
      newPlan: 'Novo Plano',
      closeNotice: 'Fechar aviso',
    },
    errors: {
      unauthorizedDomain:
        'Domínio não autorizado no Firebase Auth. No Firebase Console → Authentication → Settings → Authorized domains, adicione este domínio (ex.: seu site Netlify).',
      signInFailed: 'Falha ao entrar com Google.',
      cloudPermissionDenied:
        'Permissão insuficiente ao acessar sua conta na nuvem. Tente sair e entrar novamente ou verificar seu login Google.',
      cloudSyncFailed: 'Erro ao sincronizar esquemáticas',
      cloudProfileFailed: 'Falha ao inicializar perfil na nuvem',
      cloudSaveFailed: 'Falha ao salvar esquemática na nuvem',
      cloudDeleteFailed: 'Falha ao excluir esquemática da nuvem',
    },
    projects: {
      blankName: 'Nova Esquemática',
      blankDescription:
        'Escolha o item desejado no Editor para começar a montar a linha de produção.',
      copySuffix: ' (Cópia)',
      unnamed: 'Esquemática sem nome',
    },
    dashboard: {
      title: 'Projetos de Fábrica',
      subtitle:
        'Crie, simule e sintetize linhas de montagem completas com balanço matemático, esteiras, insertores e exportação para Blueprint do Factorio.',
      importProject: 'Importar Projeto',
      newPlan: 'Novo Planejamento',
      invalidImportJson: 'Arquivo JSON não contém configuração válida de planejamento.',
      importFailed: 'Falha ao importar JSON.',
      cloudConnectedPrefix: 'Conta conectada:',
      engineerFallback: 'Engenheiro',
      cloudConnectedSuffix:
        'Esquemáticas salvas de forma enxuta (apenas metas, ajustes e blueprint comprimida).',
      syncing: 'Sincronizando...',
      cloudActive: 'Nuvem ativa',
      localModeBanner:
        'Modo local: suas alterações ficam no navegador. Entre com Google para salvar e acessar suas esquemáticas em qualquer lugar.',
      signInGoogle: 'Entrar com Google',
      myPlans: 'Meus Planejamentos',
      searchPlaceholder: 'Filtrar por nome ou item...',
      noPlansTitle: 'Nenhum planejamento encontrado.',
      noPlansDesc: 'Crie um novo plano do zero ou escolha um dos modelos prontos abaixo.',
      createFirstPlan: 'Criar Primeiro Plano',
      noProduct: 'Sem produto',
      savedCloud: 'Salvo na nuvem',
      savedLocal: 'Salvo localmente',
      cloudLabel: 'Nuvem',
      localLabel: 'Local',
      machines: 'máquinas',
      balanced: 'Balanceado',
      alertsCount: 'alertas',
      openEditor: 'Abrir Editor',
      uploadToCloud: 'Enviar para a nuvem',
      duplicate: 'Duplicar',
      exportJson: 'Exportar JSON',
      delete: 'Excluir',
      starterTemplatesTitle: 'Modelos Industriais Prontos',
      starterTemplatesSubtitle:
        'Inicie rapidamente com cadeias clássicas do Factorio 2.0 já configuradas.',
      templates: [
        {
          name: 'Electronic Circuits · 15/s (1 Esteira)',
          description:
            'Razão clássica 3:2 com fornalhas elétricas, cabos de cobre e 1 esteira amarela cheia.',
        },
        {
          name: 'Automation + Logistic Science · 60/min',
          description: 'Linha inicial combinando Ciência Vermelha e Ciência Verde em 1 pacote/s.',
        },
        {
          name: 'Processing Units + Refinaria · 30/min',
          description:
            'Cadeia completa com Refinamento Avançado de Petróleo, Cracking e Ácido Sulfúrico.',
        },
        {
          name: 'Space Age · Electromagnetic Science (60/min)',
          description:
            'Planta Eletromagnética de Fulgora com +50% produtividade base, Supercapacitores e Esteiras Turbo.',
        },
        {
          name: 'Space Age + Krastorio 2 · Singularity Tech Card (60/min)',
          description:
            'Cadeia integrada de K2 + Space Age com Crusher, Quartzo, Silício, AI Core, Imersite e Ácido Nítrico.',
        },
        {
          name: 'Kovarex Enrichment Loop · 6/min',
          description: 'Ciclo de catalisador U-235 com Centrífugas e módulos de Produtividade 3.',
        },
        {
          name: 'Iron Plate · 4 Esteiras Azuis (180/s)',
          description:
            'Fundição em larga escala com Fornalhas Elétricas alimentadas por 4 esteiras completas de minério.',
        },
        {
          name: 'Plástico em Larga Escala · 4 Esteiras (180/s)',
          description:
            'Complexo químico com Refinamento Avançado, Cracking Pesado/Leve, Água e Carvão balanceados.',
        },
        {
          name: 'Low Density Structure · 2 Esteiras (90/s)',
          description:
            'Produção massiva de Estruturas de Baixa Densidade balanceando Plástico, Cobre e Aço desde os minérios.',
        },
        {
          name: 'Gás de Petróleo & Urânio · Larga Escala',
          description:
            'Extração balanceada de Gás de Petróleo (15.000/min) e Minério de Urânio (45/s) com Ácido Sulfúrico.',
        },
      ],
    },
    editor: {
      chooseProductButton: 'Escolher o que produzir',
      pickerPrimaryTitle: 'O que produzir (Produto Principal)',
      pickerSecondaryTitle: 'Adicionar Meta Secundária',
      unitPerSecond: '/segundo',
      unitPerMinute: '/minuto',
      unitPerHour: '/hora',
      unitShortSecond: '/s',
      unitShortMinute: '/m',
      unitShortHour: '/h',
      realFactory: 'Fábrica Real',
      theoretical: 'Teórico',
      spatialView: 'Planta 2D',
      flowView: 'Fluxograma',
      splitView: 'Dividido',
      technologies: 'Tecnologias',
      chainButton: 'Cadeia & Entradas',
      activeTargets: 'Metas ativas:',
      addTarget: 'Adicionar meta',
      emptyTitle: 'Esquemática zerada',
      emptyDescription:
        'Escolha o item ou fluido que você deseja produzir para gerar automaticamente a cadeia de máquinas, esteiras e insertores — ou desenhe direto na grade.',
      emptyChooseButton: 'Escolher Produto para Montar',
      emptyDrawManualButton: 'Desenhar manualmente',
      beltScalePresetsTooltip: 'Multiplicador de esteiras cheias (larga escala)',
      fluidScalePresetsTooltip: 'Vazão rápida em larga escala (/min)',
    },
    chain: {
      title: 'Escopo da Cadeia & Recursos Primários',
      subtitle:
        'Clique em qualquer item da cadeia para escolher se será fabricado dentro desta Blueprint ou se virá de fora (por trem / Main Bus).',
      presetsLabel: 'Perfis rápidos:',
      presetFull: 'Cadeia Completa (Desde Minérios)',
      presetNoSmelting: 'Sem Fundição (Trazer Placas & Químicos)',
      presetDirectOnly: 'Só Montagem Final (Trazer Ingredientes)',
      badgeTarget: 'Meta Final',
      badgeCrafted: 'Fabricar na BP',
      badgeExternal: 'Trazer de Fora (Trem)',
      badgeNaturalRaw: 'Recurso Bruto',
      badgePrimary: 'Primário',
      repeatedRef: 'já listado acima',
      collapsedSubsteps: (count) => `${count} sub-etapa(s) anterior(es) omitida(s)`,
      clickToToggleExternal: 'Clique para trazer de fora (não fabricar na BP)',
      clickToToggleCraft: 'Clique para incluir a fabricação na BP',
      summaryExternalTitle: 'Entradas que virão de fora na Blueprint:',
      summaryNoExternal: 'Nenhum recurso selecionado.',
      summaryStats: (stages, machines, externalCount) =>
        `${stages} etapas ativas · ${machines} máquinas · ${externalCount} entradas externas`,
      alignSameSideCta: 'Alinhar todas as entradas no mesmo lado (Trem)',
      alignSameSideActive: 'Entradas alinhadas no mesmo lado',
      confirmButton: 'Aplicar na Blueprint',
    },
    picker: {
      defaultTitle: 'Selecionar Produto',
      tabsButton: 'Abas',
      tabsTooltip: 'Voltar ao menu em abas estilo Factorio',
      listTooltip: 'Alternar para lista compacta',
      closeAria: 'Fechar',
      clearSearchAria: 'Limpar busca',
      searchListPlaceholder: 'Buscar item ou fluido fabricável...',
      searchGridPlaceholder: 'Pesquisar...',
      noItemFound: 'Nenhum item encontrado para',
      noCraftableFound: 'Nenhum item fabricável encontrado para',
      assetsHintBefore: 'Importe os sprites',
      assetsHintAfter: 'para liberar o menu em abas igual ao do jogo.',
      assetsButton: 'Assets',
      itemsCount: 'itens',
      extractionZeroInputs: 'Extração / Atmosférico (0 entradas)',
      recipesCount: 'receitas',
      hoverTip: 'Passe o mouse sobre um ícone para ver receita e origem.',
      filterAll: 'Todos',
      filterBasics: 'Minérios & Básicos',
      filterFluids: 'Gases & Fluidos',
      filterIntermediates: 'Intermediários',
      groups: {
        logistics: 'Logística',
        production: 'Produção',
        'intermediate-products': 'Produtos Intermediários',
        space: 'Espaço & Planetas',
        combat: 'Combate',
        military: 'Combate',
        effects: 'Módulos & Efeitos',
        fluids: 'Fluidos',
        other: 'Outros / Mods',
      },
    },
    techModal: {
      title: 'Árvore de Tecnologias & Pesquisas de Produtividade',
      subtitle:
        'Configure bônus infinitos do Factorio 2.0 (+10%/nível) e valide receitas desbloqueadas.',
      productivityTab: 'Pesquisas de Produtividade',
      unlocksTab: 'Desbloqueios de Receitas',
      unlockAll: 'Desbloquear Tudo',
      earlyGameMode: 'Modo Early-Game',
      noProdTechsBefore: 'O pack atual (',
      noProdTechsAfter:
        ') não define pesquisas infinitas de produtividade por receita. Troque para Factorio 2.0 + Space Age ou importe um dump 2.0 para configurar níveis.',
      recipesLabel: 'Receitas:',
      levelLabel: 'Nível',
      searchPlaceholder: 'Buscar tecnologia ou receita...',
      researchedCount: 'pesquisadas',
      allUnlocked: 'Todas liberadas',
    },
    flowGraph: {
      usedPct: '% uso',
      modules: 'módulos',
      beacons: 'beacons',
      rawResource: 'Recurso Bruto',
      finalTarget: 'Meta Final',
      beltsShort: 'est.',
      autoArrange: 'Auto-organizar (ELK)',
      clearFocus: 'Limpar Foco',
    },
    inspector: {
      tabStage: 'Etapa',
      tabSummary: 'Consolidado',
      tabAlerts: 'Gargalos',
      emptyStagePrompt:
        'Selecione uma etapa no grafo ou na planta 2D para configurar máquinas, receitas alternativas e módulos.',
      inspectingStage: 'Etapa em Inspeção',
      machines: 'Máquinas',
      utilization: 'Utilização',
      power: 'Energia',
      alternativeRecipe: 'Receita Alternativa',
      availableCount: 'disponíveis',
      productionMachine: 'Máquina de Produção',
      speedShort: 'vel.',
      slotsShort: 'slots',
      machineCount: 'Quantidade de Máquinas',
      lockedAt: 'Travado em',
      autoCount: 'Auto',
      backToAutoTooltip: 'Voltar para automático',
      lockButton: 'Travar',
      modulesLabel: 'Módulos',
      slotsWord: 'slots',
      emptySlot: 'Slot vazio',
      beaconsPerMachine: 'Beacons por Máquina',
      effShort: 'ef.',
      perBeaconSuffix: 'por Beacon',
      markRawButtonPrefix: 'Marcar "',
      markRawButtonSuffix: '" como Entrada Bruta (Main Bus)',
      stageIoTitle: 'Entradas e Saídas da Etapa',
      colItem: 'Item',
      colPerMachine: 'Por Máq.',
      colTotal: 'Total',
      colBelts: 'Esteiras',
      pipeLabel: 'Tubo',
      estimatedPower: 'Energia Estimada',
      activeSolver: 'Motor Ativo',
      solverHybrid: 'Simplex LP + DAG',
      solverDag: 'DAG Direto',
      rawResourcesRequired: 'Recursos Brutos Necessários',
      restoreOres: 'Restaurar minérios',
      colResource: 'Recurso',
      colRate: 'Taxa',
      machineListTitle: 'Lista de Máquinas',
      colEquipment: 'Equipamento',
      colTheoretical: 'Teórico',
      colInstall: 'Instalar',
      intermediatesTitle: 'Produtos Intermediários & Excedentes',
      colProduction: 'Produção',
      colBalance: 'Saldo',
      exactBalance: 'Exato',
      criticalWord: 'críticos',
      warningsWord: 'avisos',
      balancedTitle: 'Linha de Produção Balanceada',
      balancedDesc:
        'Nenhum gargalo de máquinas, falta de ingredientes ou saturação de esteira detectado.',
      focusStage: 'Focar etapa',
      suggestionPrefix: 'Sugestão:',
    },
    canvas: {
      tools: {
        select: 'Selecionar',
        pan: 'Mover Mapa',
        belt: 'Esteira',
        underground: 'Subterrânea',
        splitter: 'Divisor',
        inserter: 'Insertor',
        longInserter: 'Insertor Longo',
        pipe: 'Tubo',
        beacon: 'Beacon',
        pole: 'Poste',
        erase: 'Apagar',
      },
      directions: {
        0: 'Norte',
        4: 'Leste',
        8: 'Sul',
        12: 'Oeste',
      },
      rotateTooltip: 'Rotacionar (R)',
      beacons: 'Beacons',
      poles: 'Postes',
      directInsertion: 'Inserção Direta',
      directInsertionTooltip:
        'Acopla máquinas que alimentam apenas 1 etapa (ex: Cabo de Cobre -> Circuito Verde) sem esteira intermediária',
      sameSideInputs: 'Entradas Mesmo Lado',
      sameSideTooltip:
        'Adapta a blueprint para trazer todas as entradas externas pelo mesmo lado (ideal para grids com estação de trem)',
      inputSideSouth: 'Sul ↓',
      inputSideWest: 'Oeste ←',
      portIn: 'ENTRA',
      portOut: 'SAI',
      beltsShort: 'est.',
      pipeShort: 'Tubo',
      spaceCompact: 'Espaço: Compacto',
      spaceStandard: 'Espaço: Padrão',
      autoLayout: 'Auto-Layout',
      importBp: 'Importar (0eN)',
      exportBp: 'Exportar Blueprint (0eN)',
      removeEntity: 'Remover',
      recipeLabel: 'Receita:',
      lanesLabel: 'Faixas:',
      movesLabel: 'Move:',
      reachUnit: 'alcance',
      pauseAnim: 'Pausar animação',
      playAnim: 'Animar fluxo',
      zoomOut: 'Diminuir zoom',
      fitToScreen: 'Ajustar à tela (F)',
      zoomIn: 'Aumentar zoom',
      boundsLabel: 'Dimensão:',
      tilesUnit: 'tiles',
      occupancyLabel: 'Ocupação:',
      machinesLabel: 'Máquinas:',
      beltsLabel: 'Esteiras:',
      undergroundsLabel: 'Subterrâneas:',
      splittersLabel: 'Divisores:',
      insertersLabel: 'Insertores:',
      pipesLabel: 'Tubos:',
      beaconsLabel: 'Beacons:',
      polesLabel: 'Postes:',
      exportModalTitle: 'Exportar Blueprint String (Factorio 2.0)',
      exportModalSubtitle:
        'Cole esta string diretamente no jogo em Importar String (Ctrl+V).',
      stringTab: 'String (0eN...)',
      decodedJsonTab: 'JSON Decodificado',
      copied: 'Copiado',
      copyString: 'Copiar String',
      generatedBy: 'Gerado pelo Factorio Production Planner',
      importModalTitle: 'Importar Blueprint String (0eN...) para a Planta 2D',
      importModalSubtitle:
        'Cole qualquer string do Factorio 1.1, 2.0, Space Age ou Factorio School para visualizar e editar na grade.',
      emptyBlueprintError: 'A blueprint decodificada não possui entidades.',
      invalidBlueprintError: 'String 0eN... inválida.',
      cancel: 'Cancelar',
      decodeAndLoad: 'Decodificar e Carregar na Grade',
      gridFrameBadge: 'Grid Base',
      gridFrameFits: 'Cabe 100%',
      gridFramePartial: 'Parcial',
      clearGridFrame: 'Limpar Grid',
      importModeGridFrame: 'Usar como Grid Base (Adaptar Produção Dentro)',
      importModeGridFrameDesc:
        'Mantém trilhos, paredes, roboports e subestações da sua blueprint e encaixa automaticamente a fábrica no espaço interno.',
      importModeReplace: 'Substituir Planta (Modo Livre)',
      importModeReplaceDesc:
        'Carrega as entidades diretamente na grade 2D para inspeção e edição manual sem sintetizador.',
      sampleRailGridBtn: 'Exemplo: City Block 48×48 (Trilhos + Roboport)',
      sampleSubstationGridBtn: 'Exemplo: Grid Subestações 36×36',
    },
    database: {
      title: 'Banco de Dados, Mods & Assets do Factorio',
      subtitleBefore: 'Explore Vanilla, Space Age e Krastorio 2, importe qualquer',
      subtitleMid: 'ou carregue os ícones',
      subtitleAfter: 'locais do jogo.',
      tabRecipes: 'Receitas',
      tabMachines: 'Máquinas',
      tabItems: 'Itens & Fluidos',
      tabMods: 'Importar Mods (JSON)',
      tabAssets: 'Assets do Jogo (PNG)',
      assetsLoadedTabPrefix: 'Assets PNG',
      filterPlaceholder: 'Filtrar por nome ou ID...',
      colRecipe: 'Receita',
      colCategory: 'Categoria',
      colTime: 'Tempo',
      colIngredients: 'Ingredientes',
      colProducts: 'Produtos',
      colProductivity: 'Produtividade',
      yes: 'Sim',
      no: 'Não',
      colMachine: 'Máquina',
      colSpeed: 'Velocidade',
      colBaseProd: 'Prod. Base',
      colSlots: 'Slots',
      colSize: 'Tamanho',
      colPower: 'Energia',
      colSupportedCategories: 'Categorias Suportadas',
      modsTitlePrefix: 'Importar Mods via',
      modsDescBefore: 'Execute',
      modsDescMid1:
        'com seus mods ativos (Space Age, Krastorio 2, Pyanodons, Bob\'s, etc.) e envie o arquivo gerado em',
      modsDescMid2: '. Todas as receitas, máquinas customizadas, caminhos de ícones (',
      modsDescAfter:
        '), postes elétricos e pesquisas infinitas serão importados automaticamente.',
      modpackNameLabel: 'Nome do Modpack',
      gameRulesLabel: 'Regras do Jogo',
      rules20: 'Factorio 2.0 / Space Age (Beacons √n)',
      rules11: 'Factorio 1.1 (Beacons lineares)',
      selectDumpButton: 'Selecionar data-raw-dump.json',
      importSuccessSummary: ({ name, items, fluids, recipes, machines, errors, warnings }) =>
        `Importado "${name}": ${items} itens, ${fluids} fluidos, ${recipes} receitas, ${machines} máquinas (${errors} erros, ${warnings} avisos).`,
      dumpErrorFallback: 'Erro ao processar data-raw-dump.json.',
      assetsTitle: 'Carregar Assets & Sprites Originais do Factorio (.png)',
      assetsDescBefore:
        'O aplicativo já renderiza sprites procedurais em alta fidelidade para Vanilla, Space Age e Krastorio 2. Se desejar usar as texturas oficiais da sua instalação local do jogo, selecione a pasta',
      assetsDescMid1: 'ou a pasta extraída de',
      assetsDescMid2: '— os ícones serão casados automaticamente por caminho',
      assetsDescAfter: 'tanto nas tabelas quanto na Planta 2D!',
      selectAssetsFolder: 'Selecionar Pasta de Assets (data / mods)',
      selectPngFiles: 'Selecionar Arquivos PNG Individuais',
      clearAssets: 'Limpar Assets',
      filesLoaded: 'Arquivos Carregados',
      spritesIndexed: 'Sprites Indexados por ID',
      packsDetected: 'Packs Detectados',
      proceduralModeActive: 'Modo Vetorial Procedural Ativo',
      previewTitle: 'Pré-visualização de Ícones Ativos',
    },
    tutorial: {
      badge: 'GUIA VISUAL INTERATIVO · DO SETUP DE MODS ATÉ A BLUEPRINT NO JOGO',
      title: 'Como usar o Factorio Production Planner',
      subtitle:
        'Siga os 6 passos ilustrados abaixo para importar seus mods e sprites do Factorio, calcular a cadeia produtiva, ajustar a Planta 2D e levar a blueprint pronta para dentro do jogo.',
      importModsBtn: 'Importar Mods',
      goToEditorBtn: 'Ir para o Editor',
      shortcutsTitle: 'Atalhos do Editor 2D',
      shortcutRotate: 'Rotacionar',
      shortcutFit: 'Ajustar zoom',
      shortcutDelete: 'Apagar peça',
      shortcutPan: 'Pan',
      stepPrefix: 'PASSO',
      stepOf: 'DE 06',
      commandsHeading: 'Comandos prontos para extrair o',
      commandCopy: 'Copiar comando',
      commandCopied: 'Copiado',
      commandOutputPrefix: 'Saída:',
      osWindows: 'Windows (Steam / Padrão)',
      osLinux: 'Linux (Steam / Standalone)',
      osMac: 'macOS',
      assetsPathsTitle: 'Caminhos padrão das texturas no computador:',
      assetsPathBase: 'Base & Space Age:',
      assetsPathK2: 'Krastorio 2 Assets:',
      practicalTipLabel: 'Dica prática:',
      prevStep: 'Passo Anterior',
      nextStep: 'Próximo Passo',
      startPlanning: 'Começar a Planejar',
      jumpModsTitle: 'Importar data-raw-dump.json',
      jumpModsDesc: 'Carregue modpacks customizados direto da sua instalação do Factorio.',
      jumpAssetsTitle: 'Carregar Sprites PNG do Jogo',
      jumpAssetsDesc: 'Substitua os ícones vetoriais pelas texturas originais da pasta data/.',
      jumpModelsTitle: 'Explorar Modelos Space Age & K2',
      jumpModelsDesc: 'Abra projetos pré-configurados de Circuitos, Fulgora EM e Singularity Cards.',
      steps: [
        {
          id: 'mods',
          number: '01',
          title: 'Configurar & Importar Mods',
          subtitle:
            'Vanilla 2.0, Space Age (DLC), Krastorio 2 ou qualquer modpack via data-raw-dump.json',
          summary:
            'O planejador já traz os pacotes Factorio 2.0 Vanilla, Factorio 2.0 + Space Age (DLC) e Space Age + Krastorio 2 prontos para uso. Para jogar com outros mods (Pyanodons, Bob’s, Angel’s, Space Exploration ou versões atualizadas), extraia o JSON oficial direto do executável do jogo.',
          actionLabel: 'Abrir Importador de Mods (JSON)',
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
          subtitle:
            'Ícones originais do Factorio/Space Age/Krastorio 2 ou modo vetorial pronto de fábrica',
          summary:
            'Por padrão, o sistema renderiza ícones vetoriais procedurais e silhuetas animadas de alta fidelidade (Foundry, Electromagnetic Plant, Crusher, etc.). Se quiser visualizar os sprites .png originais da sua instalação local do Factorio e dos seus mods, carregue a pasta de gráficos diretamente no navegador (100% local, sem upload externo).',
          actionLabel: 'Abrir Aba Assets do Jogo (PNG)',
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
          subtitle:
            'Seleção do produto final, múltiplas saídas simultâneas e dimensionamento por esteira',
          summary:
            'No Editor, defina qual pacote de dados está usando, pesquise qualquer item ou fluido fabricável, informe a taxa desejada (/s, /min ou /h) e escolha o nível da esteira principal. Adicione múltiplas metas na mesma fábrica (ex: Ciência Vermelha + Ciência Verde) para compartilhar recursos brutos.',
          actionLabel: 'Ir para o Editor de Produção',
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
          subtitle:
            'Ajuste fino por etapa, receitas alternativas, Main Bus e bônus de pesquisa infinita',
          summary:
            'Clique em qualquer bloco na Planta 2D ou nó no Fluxograma para inspecionar a etapa no painel lateral direito. Você controla a máquina usada, módulos, beacons √n, travamento manual de quantidade (para simular gargalos) e níveis de pesquisa infinita.',
          actionLabel: 'Testar no Editor & Inspetor',
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
          subtitle:
            'Sintetizador automático em grade de tiles com esteiras, insertores, tubos, beacons e postes',
          summary:
            'Diferente de calculadoras puras, o planejador desenha fisicamente a linha de montagem na grade 2D do Factorio: máquinas dimensionadas (3×3, 4×4, 5×5, 7×7), pistas compartilhadas esquerda/direita, travessias subterrâneas, divisores, insertores curtos/longos, tubos de fluido, beacons e postes com fiação elétrica.',
          actionLabel: 'Abrir Planta 2D no Editor',
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
          actionLabel: 'Ir para o Editor (Exportar / Importar 0eN)',
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
      ],
      diagrams: {
        mods: {
          box1Title: 'Factorio + Mods',
          k2Others: 'Krastorio 2 / Outros',
          activeMods: 'Mods ativos no jogo',
          iconPathExtract: 'Extração automática de iconPath',
          packInPlanner: 'Pack no Planejador',
          validatedRecipes: 'Receitas validadas',
          beaconsMode: 'Beacons 2.0 √n ou 1.1',
          readyInEditor: 'Pronto no Editor',
        },
        assets: {
          proceduralTitle: 'Modo Vetorial Procedural (Padrão)',
          proceduralSub: 'Funciona imediatamente sem arquivos locais',
          localPngTitle: 'Pasta Local de PNGs (Opcional)',
          autoMatchCanvas: 'Casamento automático no Canvas & Listas',
        },
        targets: {
          finalProduct: '1. Produto Final',
          beltTier: '2. Esteira (15-90/s)',
          realVsTheo: '3. Fábrica Real / Teórico',
          realTitle: 'Fábrica Real (Instalação Física)',
          realLine1Before: '6.67 máquinas → instala ',
          realLine1Highlight: '7x máquinas',
          realLine2: 'Calcula sobra e saturação real das esteiras',
          theoTitle: 'Modo Teórico (Estilo Helmod)',
          theoLine1Before: 'Exibe taxas exatas: ',
          theoLine1Highlight: '6.67 máquinas',
          theoLine2: 'Ideal para dimensionar razões matemáticas puras',
        },
        inspector: {
          stageTitle: 'Etapa: Processing Unit',
          machineLine: 'Máquina: EM Plant (+50% prod)',
          modulesLine: 'Módulos: 5× Produtividade 3',
          beaconsLine: 'Beacons: 2× (Fator √n = 1.41)',
          researchLine: 'Pesquisa Infinita: Nível 3 (+30%)',
          tabStage: 'Etapa',
          tabSummary: 'Consolidado',
          tabAlerts: 'Gargalos',
          bullet1: '• Troca receitas alternativas e travas de máquina',
          bullet2: '• Marca qualquer item como Entrada Bruta (Main Bus)',
          bullet3: '• Tabela exata: In/Out por máquina, Total e Esteiras',
          bullet4: '• Alertas automáticos de Starvation e Saturação',
        },
        spatial: {
          beaconLabel: 'Beacon 3×3',
          dualLane: 'Pista Dupla',
          feederMachine: 'Máq. Alimentadora',
          directLabel: 'Direto',
          consumerMachine: 'Consumidora',
          outputLabel: 'Saída',
          controlsTitle: 'Controles Rápidos da Grade',
          rDesc: 'Rotacionar entidade/preview',
          delDesc: 'Apagar peça selecionada',
          fDesc: 'Ajustar fábrica na tela',
          scrollDesc: 'Zoom focado no ponteiro',
          dragDesc: 'Mover mapa livremente',
        },
        blueprint: {
          editableTitle: 'Planta 2D Editável',
          machinesRecipes: 'Máquinas + Receitas',
          beltsInserters: 'Esteiras + Insertores',
          beaconsModules: 'Beacons + Módulos',
          officialString: 'String 0eN... Oficial',
          compatible: 'Factorio 1.1 & 2.0 compatível',
          inGameTitle: 'Dentro do Jogo',
          ctrlV: 'Ctrl+V para colar',
          orImportFrom: 'ou importar do',
        },
      },
    },
  },
  en: {
    meta: {
      title: 'Factorio Production Planner',
      description:
        'Visual Factorio factory planner with recursive/matrix solver, 2D tile-grid assembly layout synthesizer (belts, inserters, machines), and full mod support.',
    },
    nav: {
      projects: 'Projects',
      editor: 'Editor',
      database: 'Database',
      tutorial: 'Tutorial',
      signIn: 'Sign in',
      signOut: 'Sign out',
      account: 'Account',
      newPlan: 'New Plan',
      closeNotice: 'Dismiss notice',
    },
    errors: {
      unauthorizedDomain:
        'Unauthorized domain in Firebase Auth. Go to Firebase Console → Authentication → Settings → Authorized domains and add this domain.',
      signInFailed: 'Failed to sign in with Google.',
      cloudPermissionDenied:
        'Insufficient permissions to access your cloud account. Try signing out and back in or verifying your Google account.',
      cloudSyncFailed: 'Failed to sync schematics',
      cloudProfileFailed: 'Failed to initialize cloud profile',
      cloudSaveFailed: 'Failed to save schematic to cloud',
      cloudDeleteFailed: 'Failed to delete schematic from cloud',
    },
    projects: {
      blankName: 'New Schematic',
      blankDescription:
        'Choose your desired item in the Editor to start building your production line.',
      copySuffix: ' (Copy)',
      unnamed: 'Untitled Schematic',
    },
    dashboard: {
      title: 'Factory Projects',
      subtitle:
        'Create, simulate, and synthesize complete assembly lines with exact math balancing, belts, inserters, and Factorio Blueprint export.',
      importProject: 'Import Project',
      newPlan: 'New Plan',
      invalidImportJson: 'JSON file does not contain a valid planner configuration.',
      importFailed: 'Failed to import JSON.',
      cloudConnectedPrefix: 'Signed in as:',
      engineerFallback: 'Engineer',
      cloudConnectedSuffix:
        'Schematics are stored cleanly (targets, overrides, and compressed blueprint only).',
      syncing: 'Syncing...',
      cloudActive: 'Cloud active',
      localModeBanner:
        'Local mode: changes are stored in your browser. Sign in with Google to sync and access your schematics anywhere.',
      signInGoogle: 'Sign in with Google',
      myPlans: 'My Plans',
      searchPlaceholder: 'Filter by name or item...',
      noPlansTitle: 'No factory plans found.',
      noPlansDesc: 'Create a blank plan from scratch or pick one of the starter templates below.',
      createFirstPlan: 'Create First Plan',
      noProduct: 'No product',
      savedCloud: 'Saved in cloud',
      savedLocal: 'Saved locally',
      cloudLabel: 'Cloud',
      localLabel: 'Local',
      machines: 'machines',
      balanced: 'Balanced',
      alertsCount: 'alerts',
      openEditor: 'Open Editor',
      uploadToCloud: 'Upload to cloud',
      duplicate: 'Duplicate',
      exportJson: 'Export JSON',
      delete: 'Delete',
      starterTemplatesTitle: 'Starter Factory Templates',
      starterTemplatesSubtitle:
        'Jump straight in with classic pre-configured Factorio 2.0 production chains.',
      templates: [
        {
          name: 'Electronic Circuits · 15/s (1 Belt)',
          description:
            'Classic 3:2 ratio with electric furnaces, copper cables, and 1 full yellow belt.',
        },
        {
          name: 'Automation + Logistic Science · 60/min',
          description: 'Starter line combining Red and Green Science at 1 pack/s.',
        },
        {
          name: 'Processing Units + Refinery · 30/min',
          description:
            'Complete chain with Advanced Oil Processing, Cracking, and Sulfuric Acid.',
        },
        {
          name: 'Space Age · Electromagnetic Science (60/min)',
          description:
            'Fulgora Electromagnetic Plant with +50% base productivity, Supercapacitors, and Turbo Belts.',
        },
        {
          name: 'Space Age + Krastorio 2 · Singularity Tech Card (60/min)',
          description:
            'Integrated K2 + Space Age chain with Crusher, Quartz, Silicon, AI Core, Imersite, and Nitric Acid.',
        },
        {
          name: 'Kovarex Enrichment Loop · 6/min',
          description: 'U-235 catalyst cycle with Centrifuges and Productivity Module 3s.',
        },
        {
          name: 'Iron Plate · 4 Blue Belts (180/s)',
          description:
            'Large-scale smelting array with Electric Furnaces balanced across 4 full ore belts.',
        },
        {
          name: 'Large-Scale Plastic · 4 Belts (180/s)',
          description:
            'Chemical complex balancing Advanced Oil Processing, Heavy/Light Cracking, Water, and Coal.',
        },
        {
          name: 'Low Density Structure · 2 Belts (90/s)',
          description:
            'Massive LDS manufacturing balancing Plastic, Copper, and Steel directly from raw ores.',
        },
        {
          name: 'Petroleum Gas & Uranium · Large-Scale',
          description:
            'Balanced extraction for Petroleum Gas (15,000/min) and Uranium Ore (45/s) with Sulfuric Acid.',
        },
      ],
    },
    editor: {
      chooseProductButton: 'Choose what to craft',
      pickerPrimaryTitle: 'What to produce (Primary Target)',
      pickerSecondaryTitle: 'Add Secondary Target',
      unitPerSecond: '/second',
      unitPerMinute: '/minute',
      unitPerHour: '/hour',
      unitShortSecond: '/s',
      unitShortMinute: '/m',
      unitShortHour: '/h',
      realFactory: 'Real Factory',
      theoretical: 'Theoretical',
      spatialView: '2D Layout',
      flowView: 'Flow Graph',
      splitView: 'Split View',
      technologies: 'Technologies',
      chainButton: 'Chain & Inputs',
      activeTargets: 'Active targets:',
      addTarget: 'Add target',
      emptyTitle: 'Empty Schematic',
      emptyDescription:
        'Pick the item or fluid you want to manufacture to automatically synthesize machines, belts, and inserters — or draw directly on the grid.',
      emptyChooseButton: 'Choose Product to Build',
      emptyDrawManualButton: 'Draw manually',
      beltScalePresetsTooltip: 'Full belt multiplier (large-scale production)',
      fluidScalePresetsTooltip: 'Quick large-scale fluid flow rate (/min)',
    },
    chain: {
      title: 'Production Chain & Primary Resources',
      subtitle:
        'Click any item in the dependency chain to decide whether it is crafted inside this blueprint or brought in from outside (Train / Main Bus).',
      presetsLabel: 'Quick presets:',
      presetFull: 'Full Chain (From Raw Ores)',
      presetNoSmelting: 'No Smelting (Bring Plates & Chemicals)',
      presetDirectOnly: 'Final Assembly Only (Train Inputs)',
      badgeTarget: 'Final Target',
      badgeCrafted: 'Craft in BP',
      badgeExternal: 'External Input (Train)',
      badgeNaturalRaw: 'Raw Ore / Fluid',
      badgePrimary: 'Primary',
      repeatedRef: 'shown above',
      collapsedSubsteps: (count) => `${count} upstream step(s) omitted`,
      clickToToggleExternal: 'Click to supply from outside (exclude from BP)',
      clickToToggleCraft: 'Click to include crafting inside BP',
      summaryExternalTitle: 'External inputs entering this blueprint:',
      summaryNoExternal: 'No external resources selected.',
      summaryStats: (stages, machines, externalCount) =>
        `${stages} active stages · ${machines} machines · ${externalCount} external inputs`,
      alignSameSideCta: 'Align all inputs to same side (Train Grid)',
      alignSameSideActive: 'All inputs aligned to same side',
      confirmButton: 'Apply to Blueprint',
    },
    picker: {
      defaultTitle: 'Select Product',
      tabsButton: 'Tabs',
      tabsTooltip: 'Switch back to Factorio-style tabbed crafting menu',
      listTooltip: 'Switch to compact searchable list',
      closeAria: 'Close',
      clearSearchAria: 'Clear search',
      searchListPlaceholder: 'Search craftable item or fluid...',
      searchGridPlaceholder: 'Search...',
      noItemFound: 'No item found for',
      noCraftableFound: 'No craftable item found for',
      assetsHintBefore: 'Import game',
      assetsHintAfter: 'sprites to unlock the native tabbed crafting menu.',
      assetsButton: 'Assets',
      itemsCount: 'items',
      extractionZeroInputs: 'Extraction / Atmospheric (0 inputs)',
      recipesCount: 'recipes',
      hoverTip: 'Hover over an icon to inspect recipe and mod origin.',
      filterAll: 'All',
      filterBasics: 'Ores & Basics',
      filterFluids: 'Gases & Fluids',
      filterIntermediates: 'Intermediates',
      groups: {
        logistics: 'Logistics',
        production: 'Production',
        'intermediate-products': 'Intermediate Products',
        space: 'Space & Planets',
        combat: 'Combat',
        military: 'Combat',
        effects: 'Modules & Effects',
        fluids: 'Fluids',
        other: 'Other / Mods',
      },
    },
    techModal: {
      title: 'Tech Tree & Productivity Research',
      subtitle:
        'Configure infinite Factorio 2.0 research bonuses (+10%/level) and validate unlocked recipes.',
      productivityTab: 'Productivity Research',
      unlocksTab: 'Recipe Unlocks',
      unlockAll: 'Unlock All',
      earlyGameMode: 'Early-Game Mode',
      noProdTechsBefore: 'The active pack (',
      noProdTechsAfter:
        ') does not define infinite per-recipe productivity technologies. Switch to Factorio 2.0 + Space Age or import a 2.0 dump to configure levels.',
      recipesLabel: 'Recipes:',
      levelLabel: 'Level',
      searchPlaceholder: 'Search technology or recipe...',
      researchedCount: 'researched',
      allUnlocked: 'All unlocked',
    },
    flowGraph: {
      usedPct: '% used',
      modules: 'modules',
      beacons: 'beacons',
      rawResource: 'Raw Resource',
      finalTarget: 'Final Target',
      beltsShort: 'belts',
      autoArrange: 'Auto-arrange (ELK)',
      clearFocus: 'Clear Focus',
    },
    inspector: {
      tabStage: 'Stage',
      tabSummary: 'Summary',
      tabAlerts: 'Bottlenecks',
      emptyStagePrompt:
        'Select a stage in the flow graph or 2D layout to configure machines, alternative recipes, and modules.',
      inspectingStage: 'Inspecting Stage',
      machines: 'Machines',
      utilization: 'Utilization',
      power: 'Power',
      alternativeRecipe: 'Alternative Recipe',
      availableCount: 'available',
      productionMachine: 'Production Machine',
      speedShort: 'spd',
      slotsShort: 'slots',
      machineCount: 'Machine Count',
      lockedAt: 'Locked at',
      autoCount: 'Auto',
      backToAutoTooltip: 'Reset to automatic',
      lockButton: 'Lock',
      modulesLabel: 'Modules',
      slotsWord: 'slots',
      emptySlot: 'Empty slot',
      beaconsPerMachine: 'Beacons per Machine',
      effShort: 'eff.',
      perBeaconSuffix: 'per Beacon',
      markRawButtonPrefix: 'Mark "',
      markRawButtonSuffix: '" as Raw Input (Main Bus)',
      stageIoTitle: 'Stage Inputs & Outputs',
      colItem: 'Item',
      colPerMachine: 'Per Mach.',
      colTotal: 'Total',
      colBelts: 'Belts',
      pipeLabel: 'Pipe',
      estimatedPower: 'Estimated Power',
      activeSolver: 'Active Solver',
      solverHybrid: 'Simplex LP + DAG',
      solverDag: 'Direct DAG',
      rawResourcesRequired: 'Raw Resources Required',
      restoreOres: 'Restore raw ores',
      colResource: 'Resource',
      colRate: 'Rate',
      machineListTitle: 'Machine List',
      colEquipment: 'Equipment',
      colTheoretical: 'Theoretical',
      colInstall: 'Install',
      intermediatesTitle: 'Intermediates & Surplus',
      colProduction: 'Production',
      colBalance: 'Balance',
      exactBalance: 'Exact',
      criticalWord: 'critical',
      warningsWord: 'warnings',
      balancedTitle: 'Production Line Balanced',
      balancedDesc:
        'No machine bottlenecks, ingredient shortages, or belt saturation detected.',
      focusStage: 'Focus stage',
      suggestionPrefix: 'Suggestion:',
    },
    canvas: {
      tools: {
        select: 'Select',
        pan: 'Pan Map',
        belt: 'Belt',
        underground: 'Underground',
        splitter: 'Splitter',
        inserter: 'Inserter',
        longInserter: 'Long Inserter',
        pipe: 'Pipe',
        beacon: 'Beacon',
        pole: 'Pole',
        erase: 'Erase',
      },
      directions: {
        0: 'North',
        4: 'East',
        8: 'South',
        12: 'West',
      },
      rotateTooltip: 'Rotate (R)',
      beacons: 'Beacons',
      poles: 'Poles',
      directInsertion: 'Direct Insertion',
      directInsertionTooltip:
        'Couples machines feeding a single downstream stage (e.g. Copper Cable -> Green Circuit) without an intermediate belt',
      sameSideInputs: 'Same-Side Inputs',
      sameSideTooltip:
        'Adapts the blueprint so all external inputs enter from the same edge (ideal for rail city-block grids)',
      inputSideSouth: 'South ↓',
      inputSideWest: 'West ←',
      portIn: 'IN',
      portOut: 'OUT',
      beltsShort: 'belts',
      pipeShort: 'Pipe',
      spaceCompact: 'Space: Compact',
      spaceStandard: 'Space: Standard',
      autoLayout: 'Auto-Layout',
      importBp: 'Import (0eN)',
      exportBp: 'Export Blueprint (0eN)',
      removeEntity: 'Remove',
      recipeLabel: 'Recipe:',
      lanesLabel: 'Lanes:',
      movesLabel: 'Moves:',
      reachUnit: 'reach',
      pauseAnim: 'Pause animation',
      playAnim: 'Animate flow',
      zoomOut: 'Zoom out',
      fitToScreen: 'Fit to screen (F)',
      zoomIn: 'Zoom in',
      boundsLabel: 'Bounds:',
      tilesUnit: 'tiles',
      occupancyLabel: 'Occupancy:',
      machinesLabel: 'Machines:',
      beltsLabel: 'Belts:',
      undergroundsLabel: 'Underground:',
      splittersLabel: 'Splitters:',
      insertersLabel: 'Inserters:',
      pipesLabel: 'Pipes:',
      beaconsLabel: 'Beacons:',
      polesLabel: 'Poles:',
      exportModalTitle: 'Export Blueprint String (Factorio 2.0)',
      exportModalSubtitle: 'Paste this string directly in-game via Import String (Ctrl+V).',
      stringTab: 'String (0eN...)',
      decodedJsonTab: 'Decoded JSON',
      copied: 'Copied',
      copyString: 'Copy String',
      generatedBy: 'Generated by Factorio Production Planner',
      importModalTitle: 'Import Blueprint String (0eN...) into 2D Layout',
      importModalSubtitle:
        'Paste any blueprint string from Factorio 1.1, 2.0, Space Age, or Factorio School to view and edit on the grid.',
      emptyBlueprintError: 'Decoded blueprint contains no entities.',
      invalidBlueprintError: 'Invalid 0eN... blueprint string.',
      cancel: 'Cancel',
      decodeAndLoad: 'Decode and Load onto Grid',
      gridFrameBadge: 'Grid Frame',
      gridFrameFits: '100% Fits',
      gridFramePartial: 'Partial',
      clearGridFrame: 'Clear Grid',
      importModeGridFrame: 'Use as Grid Frame (Adapt Production Inside)',
      importModeGridFrameDesc:
        'Preserves rails, walls, roboports, and substations from your blueprint and automatically fits the factory inside.',
      importModeReplace: 'Replace Layout (Free Mode)',
      importModeReplaceDesc:
        'Loads blueprint entities directly onto the 2D canvas for manual inspection and editing.',
      sampleRailGridBtn: 'Sample: 48×48 Rail City Block',
      sampleSubstationGridBtn: 'Sample: 36×36 Substation Grid',
    },
    database: {
      title: 'Factorio Database, Mods & Assets',
      subtitleBefore: 'Browse Vanilla, Space Age, and Krastorio 2, import any',
      subtitleMid: 'or load your local game',
      subtitleAfter: 'icons.',
      tabRecipes: 'Recipes',
      tabMachines: 'Machines',
      tabItems: 'Items & Fluids',
      tabMods: 'Import Mods (JSON)',
      tabAssets: 'Game Assets (PNG)',
      assetsLoadedTabPrefix: 'PNG Assets',
      filterPlaceholder: 'Filter by name or ID...',
      colRecipe: 'Recipe',
      colCategory: 'Category',
      colTime: 'Time',
      colIngredients: 'Ingredients',
      colProducts: 'Products',
      colProductivity: 'Productivity',
      yes: 'Yes',
      no: 'No',
      colMachine: 'Machine',
      colSpeed: 'Speed',
      colBaseProd: 'Base Prod.',
      colSlots: 'Slots',
      colSize: 'Size',
      colPower: 'Power',
      colSupportedCategories: 'Supported Categories',
      modsTitlePrefix: 'Import Mods via',
      modsDescBefore: 'Run',
      modsDescMid1:
        'with your active mods enabled (Space Age, Krastorio 2, Pyanodons, Bob\'s, etc.) and upload the generated',
      modsDescMid2: 'file. All recipes, custom machines, icon paths (',
      modsDescAfter:
        '), electric poles, and infinite productivity techs are imported automatically.',
      modpackNameLabel: 'Modpack Name',
      gameRulesLabel: 'Game Rules',
      rules20: 'Factorio 2.0 / Space Age (Beacons √n)',
      rules11: 'Factorio 1.1 (Linear Beacons)',
      selectDumpButton: 'Select data-raw-dump.json',
      importSuccessSummary: ({ name, items, fluids, recipes, machines, errors, warnings }) =>
        `Imported "${name}": ${items} items, ${fluids} fluids, ${recipes} recipes, ${machines} machines (${errors} errors, ${warnings} warnings).`,
      dumpErrorFallback: 'Failed to process data-raw-dump.json.',
      assetsTitle: 'Load Original Factorio Assets & Sprites (.png)',
      assetsDescBefore:
        'The planner renders high-fidelity procedural sprites for Vanilla, Space Age, and Krastorio 2 by default. To display the official textures from your local installation, select your',
      assetsDescMid1: 'folder or extracted',
      assetsDescMid2: 'folder — icons are matched automatically via',
      assetsDescAfter: 'paths in both tables and the 2D Layout!',
      selectAssetsFolder: 'Select Assets Folder (data / mods)',
      selectPngFiles: 'Select Individual PNG Files',
      clearAssets: 'Clear Assets',
      filesLoaded: 'Files Loaded',
      spritesIndexed: 'Sprites Indexed by ID',
      packsDetected: 'Detected Packs',
      proceduralModeActive: 'Procedural Vector Mode Active',
      previewTitle: 'Active Icon Preview',
    },
    tutorial: {
      badge: 'INTERACTIVE VISUAL GUIDE · FROM MOD SETUP TO IN-GAME BLUEPRINT',
      title: 'How to use Factorio Production Planner',
      subtitle:
        'Follow the 6 illustrated steps below to import your Factorio mods and sprites, balance the production chain, customize the 2D layout, and paste the finished blueprint in-game.',
      importModsBtn: 'Import Mods',
      goToEditorBtn: 'Open Editor',
      shortcutsTitle: '2D Editor Shortcuts',
      shortcutRotate: 'Rotate',
      shortcutFit: 'Fit zoom',
      shortcutDelete: 'Delete piece',
      shortcutPan: 'Pan',
      stepPrefix: 'STEP',
      stepOf: 'OF 06',
      commandsHeading: 'Ready-to-run commands to export',
      commandCopy: 'Copy command',
      commandCopied: 'Copied',
      commandOutputPrefix: 'Output:',
      osWindows: 'Windows (Steam / Default)',
      osLinux: 'Linux (Steam / Standalone)',
      osMac: 'macOS',
      assetsPathsTitle: 'Default texture folder paths on your computer:',
      assetsPathBase: 'Base & Space Age:',
      assetsPathK2: 'Krastorio 2 Assets:',
      practicalTipLabel: 'Pro tip:',
      prevStep: 'Previous Step',
      nextStep: 'Next Step',
      startPlanning: 'Start Planning',
      jumpModsTitle: 'Import data-raw-dump.json',
      jumpModsDesc: 'Load custom modpacks straight from your local Factorio install.',
      jumpAssetsTitle: 'Load Game PNG Sprites',
      jumpAssetsDesc: 'Replace procedural icons with official textures from your data/ folder.',
      jumpModelsTitle: 'Explore Space Age & K2 Templates',
      jumpModelsDesc: 'Open pre-configured Circuits, Fulgora EM, and Singularity Card plans.',
      steps: [
        {
          id: 'mods',
          number: '01',
          title: 'Configure & Import Mods',
          subtitle:
            'Vanilla 2.0, Space Age (DLC), Krastorio 2, or any modpack via data-raw-dump.json',
          summary:
            'The planner ships with Factorio 2.0 Vanilla, Factorio 2.0 + Space Age (DLC), and Space Age + Krastorio 2 built in. To plan with other mods (Pyanodons, Bob’s, Angel’s, Space Exploration, or newer mod updates), export the official JSON straight from the game executable.',
          actionLabel: 'Open Mod Importer (JSON)',
          bullets: [
            {
              title: '1. Enable your mods in Factorio and close the game',
              detail:
                'Every mod active in your local mod list (including Space Age DLC and Krastorio 2) is automatically included in the dump.',
            },
            {
              title: '2. Run --dump-data-raw in your terminal',
              detail:
                'Within seconds Factorio outputs a complete JSON with recipes, machines, crafting speeds, module slots, electric poles, infinite research, and icon paths.',
            },
            {
              title: '3. Upload data-raw-dump.json in the Import Mods tab',
              detail:
                'Choose beacon rules (2.0 √n or 1.1 linear) and load the JSON. Your modpack appears immediately in the Editor pack selector.',
            },
          ],
          tip: 'If you play Space Age + Krastorio 2 without extra mods, you can select the built-in "Space Age + Krastorio 2" pack directly in the Editor without generating a dump.',
        },
        {
          id: 'assets',
          number: '02',
          title: 'Load Visual Assets (.png)',
          subtitle:
            'Official Factorio/Space Age/Krastorio 2 icons or built-in procedural vector graphics',
          summary:
            'By default, the app draws crisp procedural vector icons and animated machine silhouettes (Foundry, Electromagnetic Plant, Crusher, etc.). To see the original .png sprites from your local Factorio and mod folders, load them directly in your browser (100% local, zero external uploads).',
          actionLabel: 'Open Game Assets Tab (PNG)',
          bullets: [
            {
              title: '1. Locate your Factorio data or mods folder',
              detail:
                'Point to Factorio/data (contains base and space-age) or an unzipped Krastorio2Assets folder.',
            },
            {
              title: '2. Click "Select Assets Folder"',
              detail:
                'The indexer automatically maps __base__/..., __space-age__/..., and __Krastorio2Assets__/... prefixes, plus fallback matching by prototype ID.',
            },
            {
              title: '3. Native Factorio Tabbed Menu & 2D Layout',
              detail:
                'Once PNGs are loaded, the Editor product picker upgrades into Factorio’s classic tabbed crafting grid (including mod items inside their groups) alongside belt items and machine badges in 2D.',
            },
          ],
          tip: 'If Krastorio2Assets is still zipped inside your mods/ folder, extract it first before selecting the folder.',
        },
        {
          id: 'targets',
          number: '03',
          title: 'Production Targets & Real vs Theoretical Mode',
          subtitle:
            'Target selection, multi-product co-planning, and belt capacity sizing',
          summary:
            'In the Editor, choose your active data pack, search any craftable item or fluid, enter your desired throughput (/s, /min, or /h), and pick your main belt tier. Add multiple targets to the same factory (e.g., Red + Green Science) to share raw inputs.',
          actionLabel: 'Go to Production Editor',
          bullets: [
            {
              title: 'Pack & Primary Product',
              detail:
                'Use the pack selector and item picker in the top bar to set your main output, or click "+ Add target" to co-plan multiple sciences.',
            },
            {
              title: 'Real Factory vs Theoretical Mode',
              detail:
                'Real Factory rounds machine counts up to physical integers (e.g., 7 machines) and propagates actual utilization. Theoretical shows exact fractional math (Helmod style).',
            },
            {
              title: 'Default Belt Tier (15/s up to 90/s)',
              detail:
                'Controls dual-lane splitting thresholds and automatic belt saturation bottleneck warnings.',
            },
          ],
          tip: 'In the Projects tab you can also open 6 pre-built starter templates (Green Circuits 15/s, Refinery + Blue Chips, Space Age EM Science, K2 Singularity Tech Card, and Kovarex).',
        },
        {
          id: 'inspector',
          number: '04',
          title: 'Stage Inspector, Modules, Beacons & Technologies',
          subtitle:
            'Fine-tune each stage, alternative recipes, Main Bus inputs, and infinite research',
          summary:
            'Click any machine block in the 2D Layout or node in the Flow Graph to inspect it on the right panel. Control machine tiers, modules, √n beacons, manual machine count locks (to simulate starvation), and infinite productivity research levels.',
          actionLabel: 'Try in Editor & Inspector',
          bullets: [
            {
              title: 'Alternative Recipes & Machines',
              detail:
                'Switch between classic smelting and Foundry casting, Oil Cracking, or Krastorio 2 Enriched Ores, and pick compatible machines.',
            },
            {
              title: 'Modules & Beacons (2.0 √n)',
              detail:
                'Insert Productivity, Speed, or Efficiency modules into machine slots and configure Beacon counts (Standard or K2 Singularity Beacon).',
            },
            {
              title: 'Technologies & Main Bus',
              detail:
                'Click "Technologies" to set infinite productivity bonuses (+10%/level) and validate recipe unlocks. Use "Mark as Raw Input (Main Bus)" to treat plates/circuits as bus inputs.',
            },
          ],
          tip: 'If you lock a stage below its required machine count, the solver propagates downstream starvation and surfaces alerts in the Bottlenecks tab.',
        },
        {
          id: 'spatial',
          number: '05',
          title: 'Interactive 2D Layout, Direct Insertion & Flow Graph',
          subtitle:
            'Automatic tile-grid synthesizer with belts, inserters, pipes, beacons, and power poles',
          summary:
            'Unlike pure ratio calculators, the planner draws the physical assembly line on a Factorio tile grid: accurately sized machines (3×3, 4×4, 5×5, 7×7), split left/right belt lanes, underground crossings, splitters, short/long inserters, fluid pipes, beacons, and wired power poles.',
          actionLabel: 'Open 2D Layout in Editor',
          bullets: [
            {
              title: 'Spatial Optimization Toggles',
              detail:
                'Toggle Beacons, Power Poles, Direct Insertion (couples 1:1/1:N machines without an intermediate belt), and Compact vs Standard spacing directly from the canvas bar.',
            },
            {
              title: 'Manual Grid Editing (FBE Style)',
              detail:
                'Use placement tools to add belts, undergrounds, splitters, inserters, pipes, beacons, or poles; drag existing entities or erase pieces.',
            },
            {
              title: 'Split View (2D Layout + Flow Graph)',
              detail:
                'Switch between 2D Layout, Flow Graph, or Split View to inspect material throughput (items/s and belt fractions) alongside the physical grid.',
            },
          ],
          tip: 'Canvas shortcuts: R rotates selected/preview entity, Delete/Backspace removes, Scroll zooms at cursor, Alt+Drag pans the map, and F fits the factory to screen.',
        },
        {
          id: 'blueprint',
          number: '06',
          title: 'Export & Import Blueprint Strings (0eN...)',
          subtitle: 'Direct compatibility with Factorio 1.1 / 2.0 and Factorio School via Ctrl+V',
          summary:
            'Once your layout is ready (auto-synthesized or manually edited), export the official zlib/base64 compressed string (0eN...) and paste it straight into Factorio. You can also import external blueprints to inspect and edit on the grid.',
          actionLabel: 'Go to Editor (Export / Import 0eN)',
          bullets: [
            {
              title: 'Export Blueprint (0eN)',
              detail:
                'Builds the official Factorio 2.0 JSON payload preserving entity center coordinates, orientations (0/4/8/12), recipes, and machine/beacon module inventories.',
            },
            {
              title: 'Paste directly in-game',
              detail:
                'Click "Copy String", switch to Factorio, press Ctrl+V (or click Import String on the hotbar), and stamp down the blueprint ghost.',
            },
            {
              title: 'Import (0eN) back onto the grid',
              detail:
                'Paste strings from Factorio 1.1, 2.0, Space Age, or Factorio School (including Blueprint Books). The decoder normalizes orientations and centers the layout.',
            },
          ],
          tip: 'Inside the export modal, switch to "Decoded JSON" anytime to inspect exact entity coordinates, recipes, and module counts before pasting in-game.',
        },
      ],
      diagrams: {
        mods: {
          box1Title: 'Factorio + Mods',
          k2Others: 'Krastorio 2 / Others',
          activeMods: 'Enabled mods in-game',
          iconPathExtract: 'Automatic iconPath extraction',
          packInPlanner: 'Pack in Planner',
          validatedRecipes: 'Validated recipes',
          beaconsMode: '2.0 √n or 1.1 Beacons',
          readyInEditor: 'Ready in Editor',
        },
        assets: {
          proceduralTitle: 'Procedural Vector Mode (Default)',
          proceduralSub: 'Works instantly with zero local files',
          localPngTitle: 'Local PNG Folder (Optional)',
          autoMatchCanvas: 'Auto-matched in Canvas & Lists',
        },
        targets: {
          finalProduct: '1. Final Product',
          beltTier: '2. Belt Tier (15-90/s)',
          realVsTheo: '3. Real / Theoretical',
          realTitle: 'Real Factory (Physical Build)',
          realLine1Before: '6.67 machines → builds ',
          realLine1Highlight: '7x machines',
          realLine2: 'Computes surplus and real belt saturation',
          theoTitle: 'Theoretical Mode (Helmod Style)',
          theoLine1Before: 'Displays exact ratios: ',
          theoLine1Highlight: '6.67 machines',
          theoLine2: 'Ideal for checking pure mathematical ratios',
        },
        inspector: {
          stageTitle: 'Stage: Processing Unit',
          machineLine: 'Machine: EM Plant (+50% prod)',
          modulesLine: 'Modules: 5× Productivity 3',
          beaconsLine: 'Beacons: 2× (√n factor = 1.41)',
          researchLine: 'Infinite Research: Level 3 (+30%)',
          tabStage: 'Stage',
          tabSummary: 'Summary',
          tabAlerts: 'Alerts',
          bullet1: '• Swap alt recipes and lock machine counts',
          bullet2: '• Mark any item as Raw Input (Main Bus)',
          bullet3: '• Exact breakdown: Per-machine, Total & Belts',
          bullet4: '• Automatic Starvation & Belt Saturation alerts',
        },
        spatial: {
          beaconLabel: 'Beacon 3×3',
          dualLane: 'Dual Lane',
          feederMachine: 'Feeder Mach.',
          directLabel: 'Direct',
          consumerMachine: 'Consumer',
          outputLabel: 'Output',
          controlsTitle: 'Quick Grid Controls',
          rDesc: 'Rotate entity / preview',
          delDesc: 'Delete selected entity',
          fDesc: 'Fit factory to screen',
          scrollDesc: 'Zoom focused at cursor',
          dragDesc: 'Pan map freely',
        },
        blueprint: {
          editableTitle: 'Editable 2D Layout',
          machinesRecipes: 'Machines + Recipes',
          beltsInserters: 'Belts + Inserters',
          beaconsModules: 'Beacons + Modules',
          officialString: 'Official 0eN... String',
          compatible: 'Factorio 1.1 & 2.0 compatible',
          inGameTitle: 'In Factorio',
          ctrlV: 'Ctrl+V to paste',
          orImportFrom: 'or import from',
        },
      },
    },
  },
};
