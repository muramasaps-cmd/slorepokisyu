import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreProfile, MonthlyStat, DailyRecord, RankingWeights, MachineRankingWeights } from './data/types';
import { Header, ProfitModelType, UnitMode } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { StorageToast } from './components/StorageToast';
import { PurposeMenu } from './components/PurposeMenu';

const ProfitChart = React.lazy(() =>
  import('./components/ProfitChart').then((m) => ({ default: m.ProfitChart }))
);
const HighPayoutAnalysis = React.lazy(() =>
  import('./components/HighPayoutAnalysis').then((m) => ({ default: m.HighPayoutAnalysis }))
);
const ConditionAnalysis = React.lazy(() =>
  import('./components/ConditionAnalysis').then((m) => ({ default: m.ConditionAnalysis }))
);
const MonthlyTable = React.lazy(() =>
  import('./components/MonthlyTable').then((m) => ({ default: m.MonthlyTable }))
);
const DailyModal = React.lazy(() =>
  import('./components/DailyModal').then((m) => ({ default: m.DailyModal }))
);
const ConfirmModal = React.lazy(() =>
  import('./components/ConfirmModal').then((m) => ({ default: m.ConfirmModal }))
);
const ModelMultiSelectModal = React.lazy(() =>
  import('./components/ModelMultiSelectModal').then((m) => ({ default: m.ModelMultiSelectModal }))
);
const StoreManagerModal = React.lazy(() =>
  import('./components/StoreManagerModal').then((m) => ({ default: m.StoreManagerModal }))
);
const TargetTab = React.lazy(() =>
  import('./components/TargetTab').then((m) => ({ default: m.TargetTab }))
);
const AccuracyValidation = React.lazy(() =>
  import('./components/AccuracyValidation').then((m) => ({ default: m.AccuracyValidation }))
);
const StoreComparison = React.lazy(() =>
  import('./components/StoreComparison').then((m) => ({ default: m.StoreComparison }))
);
const ModelDeepAnalysis = React.lazy(() =>
  import('./components/ModelDeepAnalysis').then((m) => ({ default: m.ModelDeepAnalysis }))
);
const HeatmapAnalysis = React.lazy(() =>
  import('./components/HeatmapAnalysis').then((m) => ({ default: m.HeatmapAnalysis }))
);
import { processStoreData, aggregateStoreModels } from './utils/dataEngine';
import { ConditionDimension } from './utils/conditionAnalysis';
import { parseSlorepoHtml, parseRatesFromExchangeRate } from './utils/htmlParser';
import { parseSpecialDayRulesFromText } from './utils/specialDayRules';
import { parseStoresFromBackupJson, mergeImportedStores } from './utils/storeBackup';
import {
  ModelPresetMode,
  filterDailyRecordsByModels,
  isSmartSlot,
  isAType,
  isJuggler,
} from './utils/modelFilterUtils';
import {
  getSavedStores,
  getActiveStoreId,
  setActiveStoreId,
  upsertStore,
  upsertStores,
  deleteStore,
  resetAllStores,
  areStoresSame,
  saveStoresToStorage,
  mergeDailyRecords,
  loadStoresFromStorageAsync,
} from './utils/storeStorage';
import {
  parseMultipleSlorepoHtml,
  parseMultipleSlorepoHtmlAsync,
  readFilesAsText,
} from './utils/multiHtmlParser';
import { generateUnitLevelCsvTemplate } from './utils/csvParser';
import {
  SlidersHorizontal,
  RotateCcw,
  Layers,
  HelpCircle,
  Building2,
  Plus,
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Check,
  Loader2,
  Cpu,
  Zap,
  Target,
  BarChart3,
  Calendar,
  ShieldCheck,
  Calculator,
  ChevronDown,
  ChevronUp,
  Flame,
} from 'lucide-react';

export type ActiveTab = 'overview' | 'target' | 'analysis' | 'compare' | 'validation';
export type AnalysisSubTab = 'models' | 'conditions' | 'high_payout';
export type TargetScope = 'store' | 'all';

export interface ParsedHashResult {
  tab: ActiveTab;
  scope: TargetScope;
  date?: string;
  viewMode?: 'chart' | 'table';
  subTab?: AnalysisSubTab;
  section?: string;
}

export function parseHash(hashStr: string): ParsedHashResult {
  const raw = hashStr.replace(/^#/, '');
  if (!raw) return { tab: 'overview', scope: 'store' };

  const [pathPart, queryPart] = raw.split('?');
  const params = new URLSearchParams(queryPart || (pathPart.includes('&') ? pathPart : ''));
  const section = params.get('section') || undefined;

  // Legacy #forecast -> #target (scope: store)
  if (pathPart === 'forecast') {
    const date = params.get('date') || params.get('targetDate') || undefined;
    return { tab: 'target', scope: 'store', date, section };
  }

  // Legacy #cross -> #target (scope: all)
  if (pathPart === 'cross') {
    const date = params.get('crossDate') || params.get('date') || params.get('targetDate') || undefined;
    return { tab: 'target', scope: 'all', date, section };
  }

  // Unified #target
  if (pathPart === 'target') {
    const scopeParam = params.get('scope');
    const scope: TargetScope = scopeParam === 'all' ? 'all' : 'store';
    const date = params.get('date') || params.get('targetDate') || params.get('crossDate') || undefined;
    return { tab: 'target', scope, date, section };
  }

  // Legacy #models -> analysis (sub: models)
  if (pathPart === 'models' || pathPart === 'model') {
    return { tab: 'analysis', subTab: 'models', scope: 'store', section };
  }

  // Legacy #trends -> analysis (sub: conditions)
  if (pathPart === 'trends' || pathPart === 'conditions' || pathPart === 'condition') {
    return { tab: 'analysis', subTab: 'conditions', scope: 'store', section };
  }

  // Legacy #high_payout / #highPayout -> analysis (sub: high_payout)
  if (pathPart === 'high_payout' || pathPart === 'highPayout' || pathPart === 'payout') {
    return { tab: 'analysis', subTab: 'high_payout', scope: 'store', section };
  }

  // Unified #analysis & slash-paths (#analysis/conditions, #analysis/models, #analysis/high_payout)
  if (pathPart.startsWith('analysis')) {
    const parts = pathPart.split('/');
    const subRoute = parts[1];
    let subTab: AnalysisSubTab = 'models';
    const subParam = subRoute || params.get('sub');
    if (subParam === 'conditions' || subParam === 'trends' || subParam === 'condition') {
      subTab = 'conditions';
    } else if (subParam === 'high_payout' || subParam === 'highPayout' || subParam === 'payout') {
      subTab = 'high_payout';
    }
    return { tab: 'analysis', subTab, scope: 'store', section };
  }

  // Legacy #tables -> overview (with table view mode)
  if (pathPart === 'tables') {
    return { tab: 'overview', scope: 'store', viewMode: 'table', section };
  }

  // Verification tab (validation)
  if (pathPart === 'validation') {
    return { tab: 'validation', scope: 'store', section };
  }

  // Store comparison tab (compare)
  if (pathPart === 'compare') {
    return { tab: 'compare', scope: 'store', section };
  }

  if (pathPart === 'overview') {
    return { tab: 'overview', scope: 'store', section };
  }

  return { tab: 'overview', scope: 'store', section };
}

export default function App() {
  const [stores, setStores] = useState<StoreProfile[]>(() => getSavedStores());
  const [activeStoreIdState, setActiveStoreIdState] = useState<string>(() => getActiveStoreId());
  const [isStoreModalOpen, setIsStoreModalOpen] = useState<boolean>(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);

  // Guarantee that stores are always strictly deduplicated without duplicates appearing
  const uniqueStores = useMemo(() => {
    if (stores.length <= 1) return stores;
    const deduped: StoreProfile[] = [];
    for (const s of stores) {
      const existingIdx = deduped.findIndex(
        (d) => d.id === s.id || areStoresSame(d.name, s.name)
      );
      if (existingIdx === -1) {
        deduped.push(s);
      } else {
        const existing = deduped[existingIdx];
        const mergedDaily = mergeDailyRecords(existing.dailyRecords || [], s.dailyRecords || []);
        deduped[existingIdx] = {
          ...existing,
          dailyRecords: mergedDaily,
          totalMachinesApprox: Math.max(existing.totalMachinesApprox || 0, s.totalMachinesApprox || 0),
          islandConfig: existing.islandConfig || s.islandConfig,
          islandDefinitions: existing.islandDefinitions || s.islandDefinitions,
          modelAliasDictionary: existing.modelAliasDictionary || s.modelAliasDictionary,
          categoryRates: existing.categoryRates || s.categoryRates,
          includeReusedMachinesInStats: existing.includeReusedMachinesInStats ?? s.includeReusedMachinesInStats,
          customRankingWeights: existing.customRankingWeights || s.customRankingWeights,
          customMachineRankingWeights: existing.customMachineRankingWeights || s.customMachineRankingWeights,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return deduped;
  }, [stores]);

  // Synchronize state and persistent storage if any duplicate stores were detected
  useEffect(() => {
    if (uniqueStores.length !== stores.length) {
      setStores(uniqueStores);
      saveStoresToStorage(uniqueStores);
      if (!uniqueStores.some((s) => s.id === activeStoreIdState)) {
        const newActive = uniqueStores.length > 0 ? uniqueStores[0].id : '';
        setActiveStoreIdState(newActive);
        setActiveStoreId(newActive);
      }
    }
  }, [uniqueStores, stores.length, activeStoreIdState]);

  // Active store object
  const currentStore = useMemo(() => {
    if (uniqueStores.length === 0) return null;
    const found = uniqueStores.find((s) => s.id === activeStoreIdState);
    return found || uniqueStores[0];
  }, [uniqueStores, activeStoreIdState]);

  const [perspective, setPerspective] = useState<'hall' | 'player'>('hall');
  const [unit, setUnit] = useState<UnitMode>('yen');
  const [profitModel, setProfitModel] = useState<ProfitModelType>('gCount');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonthModal, setSelectedMonthModal] = useState<string | null>(null);

  const initialHashInfo = parseHash(typeof window !== 'undefined' ? window.location.hash : '');
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialHashInfo.tab);
  const [targetScope, setTargetScope] = useState<TargetScope>(initialHashInfo.scope);
  const [targetDate, setTargetDate] = useState<string>(initialHashInfo.date || '');
  const [overviewViewMode, setOverviewViewMode] = useState<'chart' | 'table'>(
    initialHashInfo.viewMode || 'chart'
  );
  const [analysisSubTab, setAnalysisSubTab] = useState<AnalysisSubTab>(
    initialHashInfo.subTab || 'models'
  );
  const [activeSection, setActiveSection] = useState<string | undefined>(
    initialHashInfo.section
  );
  const [storeModalTab, setStoreModalTab] = useState<'import' | 'list' | 'backup'>('list');

  const handleOpenStoreManager = (tab: 'import' | 'list' | 'backup' = 'list') => {
    setStoreModalTab(tab);
    setIsStoreModalOpen(true);
  };

  const handleOpenModelSpecs = () => {
    setActiveTab('analysis');
    setAnalysisSubTab('models');
    window.location.hash = '#analysis/models';
    setTimeout(() => {
      const details = document.getElementById('setting-specs-section') as HTMLDetailsElement | null;
      if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  };

  const handleNavigatePurpose = (
    tab: ActiveTab,
    options?: {
      subTab?: AnalysisSubTab;
      scope?: TargetScope;
      section?: string;
    }
  ) => {
    setActiveTab(tab);
    if (options?.subTab) {
      setAnalysisSubTab(options.subTab);
    }
    if (options?.scope) {
      setTargetScope(options.scope);
    }
    setActiveSection(options?.section);

    if (tab === 'overview') {
      window.location.hash = '#overview';
    } else if (tab === 'analysis') {
      const sub = options?.subTab || analysisSubTab || 'models';
      window.location.hash = `#analysis/${sub}`;
    } else if (tab === 'compare') {
      window.location.hash = '#compare';
    } else if (tab === 'validation') {
      if (options?.section) {
        const sec = options.section.includes('model')
          ? 'models'
          : options.section.includes('machine')
          ? 'machines'
          : options.section;
        window.location.hash = `#validation?section=${sec}`;
      } else {
        window.location.hash = '#validation';
      }
    } else if (tab === 'target') {
      const effScope = options?.scope || targetScope || 'store';
      const params = new URLSearchParams();
      params.set('scope', effScope);
      if (targetDate) {
        params.set('date', targetDate);
      }
      if (options?.section) {
        const sec = options.section.includes('calendar')
          ? 'calendar'
          : options.section.includes('store')
          ? 'stores'
          : options.section.includes('model')
          ? 'models'
          : options.section.includes('machine')
          ? 'machines'
          : options.section;
        params.set('section', sec);
      }
      window.location.hash = `#target?${params.toString()}`;
    }

    if (options?.section) {
      setTimeout(() => {
        const targetId =
          options.section === 'calendar'
            ? 'target-calendar-scan'
            : options.section === 'stores'
            ? 'target-store-ranking'
            : options.section === 'models'
            ? 'target-model-ranking'
            : options.section === 'machines'
            ? 'target-machine-ranking'
            : options.section;
        const el = document.getElementById(targetId || '');
        if (el) {
          if (el.tagName.toLowerCase() === 'details') {
            (el as HTMLDetailsElement).open = true;
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  };

  // Synchronize activeTab, targetScope, targetDate, and analysisSubTab with URL hash (also migrates legacy URLs)
  useEffect(() => {
    const currentHash = window.location.hash;
    if (activeTab === 'target') {
      const params = new URLSearchParams();
      params.set('scope', targetScope);
      if (targetDate) {
        params.set('date', targetDate);
      }
      if (activeSection) {
        params.set('section', activeSection);
      }
      const newHash = `#target?${params.toString()}`;
      if (currentHash !== newHash && !currentHash.startsWith('#target')) {
        window.location.hash = newHash;
      }
    } else if (activeTab === 'analysis') {
      const validHashes = [
        `#analysis/${analysisSubTab}`,
        `#analysis?sub=${analysisSubTab}`,
      ];
      if (!validHashes.includes(currentHash)) {
        window.location.hash = `#analysis/${analysisSubTab}`;
      }
    } else {
      const currentTab = currentHash.replace('#', '').split('?')[0].split('&')[0];
      if (currentTab !== activeTab) {
        window.location.hash = `#${activeTab}`;
      }
    }
  }, [activeTab, targetScope, targetDate, analysisSubTab, activeSection]);

  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseHash(window.location.hash);
      setActiveTab(parsed.tab);
      if (parsed.viewMode) {
        setOverviewViewMode(parsed.viewMode);
      }
      if (parsed.subTab) {
        setAnalysisSubTab(parsed.subTab);
      }
      if (parsed.tab === 'target') {
        setTargetScope(parsed.scope);
        if (parsed.date) {
          setTargetDate(parsed.date);
        }
      }
      setActiveSection(parsed.section);
      if (parsed.section) {
        setTimeout(() => {
          const targetId =
            parsed.section === 'calendar'
              ? 'target-calendar-scan'
              : parsed.section === 'stores'
              ? 'target-store-ranking'
              : parsed.section === 'models'
              ? 'target-model-ranking'
              : parsed.section === 'machines'
              ? 'target-machine-ranking'
              : parsed.section;
          const el = document.getElementById(targetId || '');
          if (el) {
            if (el.tagName.toLowerCase() === 'details') {
              (el as HTMLDetailsElement).open = true;
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Custom rate and model parameters (initialized from active store's header exchange rate)
  const [rateLend, setRateLend] = useState<number>(() => {
    const parsed = parseRatesFromExchangeRate(currentStore?.exchangeRate || '');
    return parsed.rateLend || currentStore?.rateLend || 46;
  });
  const [rateExchange, setRateExchange] = useState<number>(() => {
    const parsed = parseRatesFromExchangeRate(currentStore?.exchangeRate || '');
    return parsed.rateExchange || currentStore?.rateExchange || 52;
  });
  const [cashRatio, setCashRatio] = useState<number>(currentStore?.cashRatio || 35);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Global Machine Filter States
  const [modelPreset, setModelPreset] = useState<ModelPresetMode>('all');
  const [selectedModelNames, setSelectedModelNames] = useState<string[]>([]);
  const [isMultiSelectModalOpen, setIsMultiSelectModalOpen] = useState<boolean>(false);

  // Condition Analysis Dimension State
  const [conditionDimension, setConditionDimension] = useState<ConditionDimension>('dow');
  const handleNavigateToConditions = (dim: ConditionDimension = 'dow') => {
    setConditionDimension(dim);
    setActiveTab('analysis');
    setAnalysisSubTab('conditions');
  };

  const latestDataDate = useMemo(() => {
    if (!currentStore?.dailyRecords || currentStore.dailyRecords.length === 0) return '';
    let maxDate = '';
    for (const r of currentStore.dailyRecords) {
      if (r.date > maxDate) maxDate = r.date;
    }
    return maxDate;
  }, [currentStore?.dailyRecords]);

  // Drag-and-drop state on empty screen
  const [emptyScreenDragging, setEmptyScreenDragging] = useState<boolean>(false);
  const [emptyIsLoading, setEmptyIsLoading] = useState<boolean>(false);
  const [emptyStatusText, setEmptyStatusText] = useState<string>('');
  const [emptyProgressPercent, setEmptyProgressPercent] = useState<number>(0);
  const [emptyInputMode, setEmptyInputMode] = useState<'file' | 'paste'>('file');
  const [emptyPastedHtml, setEmptyPastedHtml] = useState<string>('');
  const [emptyError, setEmptyError] = useState<string>('');
  const emptyFileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate from IndexedDB on startup (handles large 100+ file datasets)
  useEffect(() => {
    loadStoresFromStorageAsync().then((loaded) => {
      if (loaded && loaded.length > 0) {
        setStores((prev) => {
          if (prev.length === 0) return loaded;
          return prev;
        });
      }
    });
  }, []);

  // Automatically sync lend and exchange coin rates to match header exchange rate whenever active store changes
  useEffect(() => {
    if (currentStore) {
      const { rateLend: parsedLend, rateExchange: parsedExch } = parseRatesFromExchangeRate(
        currentStore.exchangeRate || ''
      );
      setRateLend(parsedLend || currentStore.rateLend || 46);
      setRateExchange(parsedExch || currentStore.rateExchange || 52);
      setCashRatio(currentStore.cashRatio || 35);
      setSelectedYear('all');
      // Reset machine filters when switching stores
      setModelPreset('all');
      setSelectedModelNames([]);
    }
  }, [currentStore?.id, currentStore?.exchangeRate]);

  // All models in current store across raw daily records (or all stores when comparing/cross targeting)
  const allAvailableModels = useMemo(() => {
    if (activeTab === 'compare' || (activeTab === 'target' && targetScope === 'all')) {
      const allDaily = uniqueStores.flatMap((s) => s.dailyRecords || []);
      return aggregateStoreModels(allDaily, rateLend, rateExchange);
    }
    if (!currentStore || !currentStore.dailyRecords) return [];
    return aggregateStoreModels(currentStore.dailyRecords, rateLend, rateExchange);
  }, [activeTab, targetScope, uniqueStores, currentStore?.dailyRecords, rateLend, rateExchange]);

  const allAvailableModelNames = useMemo(
    () => allAvailableModels.map((m) => m.modelName),
    [allAvailableModels]
  );

  const modelPresetCounts = useMemo(() => {
    const smartSlots = allAvailableModelNames.filter(isSmartSlot);
    const aTypes = allAvailableModelNames.filter(isAType);
    const jugglers = allAvailableModelNames.filter(isJuggler);
    return {
      all: allAvailableModelNames.length,
      smart_slot: smartSlots.length,
      a_type: aTypes.length,
      juggler: jugglers.length,
    };
  }, [allAvailableModelNames]);

  // Filter raw daily records by the selected machine criteria
  // If filtered, all machine metrics (diff coins, machine counts, games, win rates)
  // are calculated purely from the filtered machines!
  const rawRecordsFilteredByModel = useMemo(() => {
    if (!currentStore || !currentStore.dailyRecords) return [];
    if (modelPreset === 'all' && selectedModelNames.length === 0) {
      return currentStore.dailyRecords;
    }
    return filterDailyRecordsByModels(currentStore.dailyRecords, modelPreset, selectedModelNames);
  }, [currentStore?.dailyRecords, modelPreset, selectedModelNames]);

  // Recalculate daily records and monthly stats with both Model A and Model B via dataEngine
  const processedData = useMemo(() => {
    if (!currentStore) {
      return { dailyRecords: [], monthlyStats: [] };
    }
    return processStoreData(rawRecordsFilteredByModel, rateLend, rateExchange, cashRatio, currentStore.specialDayRules);
  }, [rawRecordsFilteredByModel, currentStore?.specialDayRules, rateLend, rateExchange, cashRatio]);

  const handleSelectModelPreset = (preset: ModelPresetMode) => {
    setModelPreset(preset);
    if (preset === 'all') {
      setSelectedModelNames([]);
    } else if (preset === 'smart_slot') {
      setSelectedModelNames(allAvailableModelNames.filter(isSmartSlot));
    } else if (preset === 'a_type') {
      setSelectedModelNames(allAvailableModelNames.filter(isAType));
    } else if (preset === 'juggler') {
      setSelectedModelNames(allAvailableModelNames.filter(isJuggler));
    }
  };

  const handleToggleModelInSelection = (name: string) => {
    if (modelPreset === 'all' && selectedModelNames.length === 0) {
      setSelectedModelNames([name]);
      setModelPreset('custom');
      return;
    }

    if (selectedModelNames.includes(name)) {
      const next = selectedModelNames.filter((n) => n !== name);
      setSelectedModelNames(next);
      if (next.length === 0) {
        setModelPreset('all');
      } else {
        setModelPreset('custom');
      }
    } else {
      const next = [...selectedModelNames, name];
      setSelectedModelNames(next);
      if (next.length === allAvailableModelNames.length) {
        setModelPreset('all');
        setSelectedModelNames([]);
      } else {
        setModelPreset('custom');
      }
    }
  };

  const activeFilterLabel = useMemo(() => {
    if (modelPreset === 'all' && selectedModelNames.length === 0) return '全機種';
    if (modelPreset === 'smart_slot') return 'スマスロ';
    if (modelPreset === 'a_type') return 'Aタイプ';
    if (modelPreset === 'juggler') return 'ジャグラーシリーズ';
    if (selectedModelNames.length === 1) return selectedModelNames[0];
    return `選択 ${selectedModelNames.length}機種`;
  }, [modelPreset, selectedModelNames]);

  const isModelFilterActive = Boolean(
    modelPreset !== 'all' || selectedModelNames.length > 0
  );

  // Filter all unique stores and their daily records by the selected model criteria
  // When a model filter is active in the header, each store's daily records, machine counts,
  // and machine data are filtered exclusively to the selected model(s)
  const filteredStoresByModel: StoreProfile[] = useMemo(() => {
    if (!isModelFilterActive) {
      return uniqueStores;
    }
    return uniqueStores.map((store) => {
      const filteredDaily = filterDailyRecordsByModels(
        store.dailyRecords || [],
        modelPreset,
        selectedModelNames
      );

      // Compute average machines per operating day for the filtered model subset
      const avgFilteredMachines = filteredDaily.length > 0
        ? Math.round(
            filteredDaily.reduce((sum, d) => sum + (d.totalMachines || 0), 0) / filteredDaily.length
          )
        : 0;

      return {
        ...store,
        totalMachinesApprox: avgFilteredMachines > 0 ? avgFilteredMachines : store.totalMachinesApprox,
        dailyRecords: filteredDaily,
      };
    });
  }, [uniqueStores, isModelFilterActive, modelPreset, selectedModelNames]);

  // Available years from active store's data
  const years = useMemo(() => {
    const set = new Set<string>();
    processedData.monthlyStats.forEach((m) => set.add(String(m.year)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [processedData.monthlyStats]);

  // Filter by selected year
  const filteredMonthlyStats = useMemo(() => {
    if (selectedYear === 'all') return processedData.monthlyStats;
    return processedData.monthlyStats.filter((m) => String(m.year) === selectedYear);
  }, [processedData.monthlyStats, selectedYear]);

  const filteredDailyRecords = useMemo(() => {
    if (selectedYear === 'all') return processedData.dailyRecords;
    return processedData.dailyRecords.filter((d) => String(d.year) === selectedYear);
  }, [processedData.dailyRecords, selectedYear]);

  // Totals for comparison banner
  const totalDiffProfit = useMemo(() => {
    return filteredMonthlyStats.reduce(
      (acc, m) => acc + (perspective === 'hall' ? m.hallYenProfit : m.playerYenProfit),
      0
    );
  }, [filteredMonthlyStats, perspective]);

  const totalGModelProfit = useMemo(() => {
    return filteredMonthlyStats.reduce(
      (acc, m) => acc + (perspective === 'hall' ? m.gModelHallProfit : m.gModelPlayerProfit),
      0
    );
  }, [filteredMonthlyStats, perspective]);

  const totalRevenue = useMemo(() => {
    return filteredMonthlyStats.reduce((acc, m) => acc + m.estimatedRevenue, 0);
  }, [filteredMonthlyStats]);

  const avgPayoutRate = useMemo(() => {
    const totIn = filteredMonthlyStats.reduce((acc, m) => acc + m.totalInCoins, 0);
    const totOut = filteredMonthlyStats.reduce((acc, m) => acc + m.totalOutCoins, 0);
    return totIn > 0 ? (totOut / totIn) * 100 : 100;
  }, [filteredMonthlyStats]);

  // Store management actions
  const handleSelectStore = (id: string) => {
    const targetStore = stores.find((s) => s.id === id);
    if (targetStore) {
      const { rateLend: parsedLend, rateExchange: parsedExch } = parseRatesFromExchangeRate(
        targetStore.exchangeRate || ''
      );
      setRateLend(parsedLend || targetStore.rateLend || 46);
      setRateExchange(parsedExch || targetStore.rateExchange || 52);
      setCashRatio(targetStore.cashRatio || 35);
      setSelectedYear('all');
    }
    setActiveStoreIdState(id);
    setActiveStoreId(id);
  };

  const handleSaveStores = (newStoresList: StoreProfile[], preferActiveId?: string) => {
    if (newStoresList.length === 0) return;
    const normalizedStores: StoreProfile[] = newStoresList.map((store) => {
      const { rateLend: parsedLend, rateExchange: parsedExch } = parseRatesFromExchangeRate(
        store.exchangeRate || ''
      );
      return {
        ...store,
        rateLend: parsedLend || store.rateLend || 46,
        rateExchange: parsedExch || store.rateExchange || 52,
      };
    });
    const updated = upsertStores(normalizedStores);
    setStores(updated);
    const targetId = preferActiveId || normalizedStores[0].id;
    setActiveStoreIdState(targetId);
    setActiveStoreId(targetId);
    const targetStore = normalizedStores.find((s) => s.id === targetId) || normalizedStores[0];
    setRateLend(targetStore.rateLend);
    setRateExchange(targetStore.rateExchange);
    setCashRatio(targetStore.cashRatio || 35);
    setSelectedYear('all');
  };

  const handleSaveStore = (newStore: StoreProfile) => {
    handleSaveStores([newStore], newStore.id);
  };

  const handleUpdateStore = (updatedStore: StoreProfile) => {
    const updatedList = upsertStore(updatedStore);
    setStores(updatedList);
    if (updatedStore.id === activeStoreIdState) {
      if (updatedStore.rateLend) setRateLend(updatedStore.rateLend);
      if (updatedStore.rateExchange) setRateExchange(updatedStore.rateExchange);
    }
  };

  const handleDeleteStore = (id: string) => {
    const { stores: remaining, newActiveId } = deleteStore(id);
    setStores(remaining);
    setActiveStoreIdState(newActiveId);
  };

  const handleChangeOldEventDays = (newRuleText: string, newIslandConfig?: string) => {
    if (!currentStore) return;
    const newRules = parseSpecialDayRulesFromText(newRuleText);
    const updatedStore: StoreProfile = {
      ...currentStore,
      oldEventDays: newRuleText,
      specialDayRules: newRules,
      islandConfig: newIslandConfig !== undefined ? newIslandConfig : currentStore.islandConfig,
    };
    const updatedList = upsertStore(updatedStore);
    setStores(updatedList);
  };

  const handleSaveStoreWeights = (weights: RankingWeights | undefined) => {
    if (!currentStore) return;
    const updatedStore: StoreProfile = {
      ...currentStore,
      customRankingWeights: weights,
      updatedAt: new Date().toISOString(),
    };
    const updatedList = upsertStore(updatedStore);
    setStores(updatedList);
  };

  const handleSaveStoreMachineWeights = (weights: MachineRankingWeights | undefined) => {
    if (!currentStore) return;
    const updatedStore: StoreProfile = {
      ...currentStore,
      customMachineRankingWeights: weights,
      updatedAt: new Date().toISOString(),
    };
    const updatedList = upsertStore(updatedStore);
    setStores(updatedList);
  };

  // 「初期状態にリセットで全店舗削除」
  const handleResetAllStores = () => {
    const reset = resetAllStores();
    setStores(reset);
    setActiveStoreIdState('');
    setIsStoreModalOpen(false);
    setSelectedMonthModal(null);
    setShowSettings(false);
  };

  // Quick process multiple HTML files directly on empty screen
  const handleDirectMultipleHtmlImport = async (files: FileList | File[]) => {
    setEmptyError('');
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.json')) {
      setEmptyIsLoading(true);
      setEmptyStatusText('JSONバックアップを解析中...');
      try {
        const text = await fileList[0].text();
        const res = parseStoresFromBackupJson(text);
        if (!res.success || res.importedStores.length === 0) {
          setEmptyError(res.error || 'JSONファイルの解析に失敗しました。');
          return;
        }
        const merged = mergeImportedStores(stores, res.importedStores);
        handleSaveStores(merged, res.importedStores[0]?.id);
      } catch (err: any) {
        setEmptyError(`JSON読み込みエラー: ${err?.message || err}`);
      } finally {
        setEmptyIsLoading(false);
      }
      return;
    }

    setEmptyIsLoading(true);
    setEmptyStatusText(`ファイルを読み込み中... (0/${files.length}件)`);
    setEmptyProgressPercent(5);

    try {
      const readResults = await readFilesAsText(files, (done, total) => {
        setEmptyStatusText(`ファイルを読込中... (${done}/${total}件)`);
        setEmptyProgressPercent(Math.round((done / total) * 45));
      });

      if (readResults.length === 0) {
        setEmptyError('選択されたファイルからテキストを読み込めませんでした。');
        setEmptyIsLoading(false);
        setEmptyStatusText('');
        return;
      }

      setEmptyStatusText(`出玉データを解析・統合中... (0/${readResults.length}件)`);
      setEmptyProgressPercent(50);

      const res = await parseMultipleSlorepoHtmlAsync(readResults, stores, (done, total) => {
        setEmptyStatusText(`出玉データを解析・統合中... (${done}/${total}件)`);
        setEmptyProgressPercent(50 + Math.round((done / total) * 48));
      });

      if (!res.success || res.stores.length === 0) {
        const errs = res.errors.slice(0, 5).map((e) => `${e.fileName}: ${e.error}`).join(' / ');
        setEmptyError(errs || '有効なスロレポHTMLが見つかりませんでした。');
        setEmptyIsLoading(false);
        setEmptyStatusText('');
        return;
      }

      const storeProfiles = res.stores.map((g) => g.store);
      handleSaveStores(storeProfiles, storeProfiles[0].id);
    } catch (err: any) {
      setEmptyError(`ファイル処理エラー: ${err?.message || err}`);
    } finally {
      setEmptyIsLoading(false);
      setEmptyStatusText('');
      setEmptyProgressPercent(100);
    }
  };

  // Quick process HTML text directly on empty screen (paste or sample button)
  const handleDirectHtmlImport = (html: string) => {
    setEmptyError('');
    if (!html.trim()) {
      setEmptyError('HTMLデータが空です。');
      return;
    }
    const res = parseMultipleSlorepoHtml([{ name: 'direct.html', content: html }], stores);
    if (!res.success || res.stores.length === 0) {
      setEmptyError(res.errors.map((e) => e.error).join(' ') || '解析に失敗しました。');
      return;
    }
    const storeProfiles = res.stores.map((g) => g.store);
    handleSaveStores(storeProfiles, storeProfiles[0].id);
  };

  // Empty state view when no stores exist
  if (!currentStore || uniqueStores.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col antialiased">
        {/* Simple Header */}
        <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-6 h-6 text-amber-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                出玉・利益推移分析システム（アナスロ／スロレポ対応）
              </h1>
            </div>
            <span className="text-xs text-slate-400">
              HTMLファイル取込による店舗登録
            </span>
          </div>
        </header>

        {/* Main Empty State Content */}
        <main className="max-w-3xl w-full mx-auto px-4 py-12 flex-1 flex flex-col items-center justify-center space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-300 shadow-xs">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              出玉データ（CSV / HTML）を取り込んで即座に分析
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
              みんレポ台番CSV（店舗名,日付,機種,台番,差枚,G数,出率,参照URL）やアナスロ・スロレポの店舗HTMLを取り込むと、各台の台番・差枚・G数・出率および機種別・末尾別データが自動解析されます。
            </p>
          </div>

          {/* Quick Actions Card */}
          <div className="w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setEmptyInputMode('file')}
                  className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                    emptyInputMode === 'file'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  CSV / HTMLファイルを選択
                </button>
                <button
                  type="button"
                  onClick={() => setEmptyInputMode('paste')}
                  className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                    emptyInputMode === 'paste'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  テキスト / CSV直接貼り付け
                </button>
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            {emptyInputMode === 'file' && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setEmptyScreenDragging(true);
                }}
                onDragLeave={() => setEmptyScreenDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setEmptyScreenDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleDirectMultipleHtmlImport(e.dataTransfer.files);
                  }
                }}
                onClick={() => !emptyIsLoading && emptyFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  emptyScreenDragging
                    ? 'border-amber-500 bg-amber-50/50 scale-[0.99]'
                    : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-amber-400'
                } ${emptyIsLoading ? 'opacity-70 cursor-wait' : ''}`}
              >
                <input
                  type="file"
                  ref={emptyFileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleDirectMultipleHtmlImport(e.target.files);
                    }
                  }}
                  multiple
                  accept=".csv,.tsv,.txt,.html,.htm,.json,text/csv,text/html,text/plain,application/json"
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-2xs">
                  {emptyIsLoading ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : (
                    <UploadCloud className="w-7 h-7" />
                  )}
                </div>
                <div>
                  {emptyIsLoading ? (
                    <div className="space-y-2 max-w-md mx-auto">
                      <p className="text-sm font-bold text-amber-700 animate-pulse">
                        {emptyStatusText || 'ファイルを解析中... しばらくお待ちください'}
                      </p>
                      <div className="w-64 mx-auto bg-amber-100 rounded-full h-2 overflow-hidden border border-amber-200">
                        <div
                          className="bg-amber-600 h-full transition-all duration-200 rounded-full"
                          style={{ width: `${emptyProgressPercent}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        大量のファイル（100件以上）もブラウザ内で安全に順次解析・統合しています
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-slate-800">
                        ここにみんレポ台番CSV・スロレポHTML・JSONバックアップファイルをドラッグ＆ドロップ（複数一括対応）
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        またはクリックしてファイルを選択（ShiftやCtrlキーで複数選択可能・JSON復元にも対応）
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Paste Mode */}
            {emptyInputMode === 'paste' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    CSVデータまたはHTMLソースを貼り付け:
                  </span>
                  <button
                    type="button"
                    onClick={() => setEmptyPastedHtml(generateUnitLevelCsvTemplate())}
                    className="text-xs text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                  >
                    サンプルCSV（蒲田7の2日分）を入力
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={emptyPastedHtml}
                  onChange={(e) => setEmptyPastedHtml(e.target.value)}
                  placeholder={'店舗名,日付,機種,台番,差枚,G数,出率,参照URL\nマルハンメガシティ2000蒲田7,2026-10-04,スロット ソードアート・オンラインⅡ,3069,"-7,400","7,405",66.7%,https://min-repo.com/3389710/?kishu=all&sort=num\n\nまたはHTMLソース（<!DOCTYPE html>... <table>...）'}
                  className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleDirectHtmlImport(emptyPastedHtml)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  貼り付けたデータを解析して店舗登録
                </button>
              </div>
            )}

            {emptyError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{emptyError}</span>
              </div>
            )}

            {/* Data storage notice */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs bg-slate-50/80 -mx-6 -mb-6 p-4 rounded-b-2xl">
              <div className="text-slate-500 space-y-0.5">
                <span className="font-bold text-slate-700 block">
                  取り込んだCSV・HTMLファイルのデータのみを完全に使用
                </span>
                <span className="text-[11px] text-slate-500 block">
                  ※サンプルデータ等は一切含まず、取り込まれたデータのみを保持します。リセット実行時はすべてのデータが安全に全削除されます。
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Dashboard view when a store is active
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col antialiased">
      {/* Header */}
      <Header
        storeInfo={{
          name: currentStore.name,
          address: currentStore.address,
          oldEventDays: currentStore.oldEventDays,
          exchangeRate: currentStore.exchangeRate,
          dataRange: currentStore.dataRange,
          rateLend: rateLend,
          rateExchange: rateExchange,
          totalMachinesApprox: currentStore.totalMachinesApprox,
          specialDayRules: currentStore.specialDayRules,
          islandConfig: currentStore.islandConfig,
        }}
        perspective={perspective}
        setPerspective={setPerspective}
        unit={unit}
        setUnit={setUnit}
        profitModel={profitModel}
        setProfitModel={setProfitModel}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        years={years}
        totalDays={filteredDailyRecords.length}
        totalMonths={filteredMonthlyStats.length}
        onOpenStoreManager={() => handleOpenStoreManager('list')}
        onChangeOldEventDays={handleChangeOldEventDays}
        targetDate={targetDate}
        setTargetDate={setTargetDate}
        latestDataDate={latestDataDate}
      />

      {/* Purpose-driven Navigation & Breadcrumb (目的別メニュー・プルダウン) */}
      <div className="bg-white border-b border-slate-200/90 shadow-2xs sticky top-[57px] z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
          <PurposeMenu
            activeTab={activeTab}
            analysisSubTab={analysisSubTab}
            targetScope={targetScope}
            activeSection={activeSection}
            onNavigate={handleNavigatePurpose}
            onOpenStoreManager={handleOpenStoreManager}
            onOpenModelSpecs={handleOpenModelSpecs}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 space-y-3.5 flex-1">
        {/* Top Controls Bar: Compact Unified Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/90 shadow-2xs">
          {/* Left: Store Selector + Machine Filter Presets */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Store Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg shrink-0">
              <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">店舗:</span>
              <select
                value={activeStoreIdState}
                onChange={(e) => handleSelectStore(e.target.value)}
                className="text-xs font-bold text-slate-900 bg-transparent focus:outline-hidden cursor-pointer"
              >
                {uniqueStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.totalMachinesApprox}台)
                  </option>
                ))}
              </select>
            </div>

            {/* 機種絞り込み Segmented Control */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-0.5 rounded-lg shrink-0 flex-wrap">
              <div className="flex items-center gap-1 px-1.5 text-xs text-slate-600 font-bold whitespace-nowrap">
                <Cpu className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>機種:</span>
              </div>

              {/* 全機種 */}
              <button
                type="button"
                onClick={() => handleSelectModelPreset('all')}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  modelPreset === 'all' && selectedModelNames.length === 0
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
                title="全機種で集計"
              >
                全機種 ({modelPresetCounts.all})
              </button>

              {/* スマスロ */}
              <button
                type="button"
                onClick={() => handleSelectModelPreset('smart_slot')}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  modelPreset === 'smart_slot'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200'
                }`}
                title="スマスロのみで集計"
              >
                <Zap className="w-3 h-3 text-purple-400 shrink-0" />
                スマスロ ({modelPresetCounts.smart_slot})
              </button>

              {/* Aタイプ */}
              <button
                type="button"
                onClick={() => handleSelectModelPreset('a_type')}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  modelPreset === 'a_type'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                }`}
                title="Aタイプのみで集計"
              >
                <Target className="w-3 h-3 text-emerald-400 shrink-0" />
                Aタイプ ({modelPresetCounts.a_type})
              </button>

              {/* ジャグラー */}
              <button
                type="button"
                onClick={() => handleSelectModelPreset('juggler')}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  modelPreset === 'juggler'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200'
                }`}
                title="ジャグラーシリーズのみで集計"
              >
                <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                ジャグラー ({modelPresetCounts.juggler})
              </button>

              {/* 個別機種選択ボタン */}
              <button
                type="button"
                onClick={() => setIsMultiSelectModalOpen(true)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  modelPreset === 'custom' || selectedModelNames.length > 0
                    ? 'bg-amber-400 text-slate-950 font-black ring-1 ring-amber-500'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
                title="機種を個別に指定して絞り込み"
              >
                <SlidersHorizontal className="w-3 h-3 text-slate-600 shrink-0" />
                <span>選択...</span>
                {modelPreset === 'custom' && selectedModelNames.length > 0 && (
                  <span className="bg-slate-950 text-amber-300 px-1 py-0.2 rounded-full text-[10px] font-black">
                    {selectedModelNames.length}
                  </span>
                )}
              </button>

              {/* Compact Inline Active Filter Dismiss Badge (Replaces giant full-screen banner) */}
              {(modelPreset !== 'all' || selectedModelNames.length > 0) && (
                <button
                  type="button"
                  onClick={() => handleSelectModelPreset('all')}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 hover:bg-rose-100 text-amber-900 hover:text-rose-700 border border-amber-300 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ml-1"
                  title="絞り込みを解除して全機種に戻す"
                >
                  <span>「{activeFilterLabel}」適用中</span>
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Period Dropdown & Rate Settings Button */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Period selector dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="all">全期間 ({filteredMonthlyStats.length}ヶ月/{filteredDailyRecords.length}日)</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}年分データ</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                showSettings || rateLend !== currentStore.rateLend || rateExchange !== currentStore.rateExchange
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                換金率 ({rateLend}枚貸/{rateExchange}枚交換)
              </span>
            </button>
          </div>
        </div>

        {/* Optional Rate Settings Drawer */}
        {showSettings && (
          <div className="bg-white p-4 rounded-xl border border-amber-300 shadow-sm animate-in fade-in duration-150 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                  換金率およびG数モデルパラメーター設定 ({currentStore.name})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  貸出・交換レートや現金投資比率を変更すると、全日・全月分の粗利および推計売上がリアルタイムで再計算されます
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <label className="text-slate-600 font-medium">貸出枚数/千円:</label>
                  <select
                    value={rateLend}
                    onChange={(e) => setRateLend(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                  >
                    <option value={46}>46枚貸 (21.74円/枚)</option>
                    <option value={47}>47枚貸 (21.28円/枚)</option>
                    <option value={48}>48枚貸 (20.83円/枚)</option>
                    <option value={50}>50枚貸 (20.00円/枚)</option>
                    {![46, 47, 48, 50].includes(rateLend) && (
                      <option value={rateLend}>{rateLend}枚貸 ({(1000 / rateLend).toFixed(2)}円/枚)</option>
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <label className="text-slate-600 font-medium">交換枚数/千円:</label>
                  <select
                    value={rateExchange}
                    onChange={(e) => setRateExchange(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
                  >
                    <option value={50}>50枚等価 (20.00円/枚)</option>
                    <option value={51.5}>51.5枚 (19.42円/枚)</option>
                    <option value={52}>52枚交換 (19.23円/枚)</option>
                    <option value={53}>53枚交換 (18.87円/枚)</option>
                    <option value={55}>55枚交換 (18.18円/枚)</option>
                    <option value={56}>56枚交換 (17.86円/枚)</option>
                    <option value={60}>60枚交換 (16.67円/枚)</option>
                    {![50, 51.5, 52, 53, 55, 56, 60].includes(rateExchange) && (
                      <option value={rateExchange}>{rateExchange}枚交換 ({(1000 / rateExchange).toFixed(2)}円/枚)</option>
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <label className="text-slate-600 font-medium whitespace-nowrap">現金投資比率:</label>
                  <input
                    type="range"
                    min="20"
                    max="50"
                    step="1"
                    value={cashRatio}
                    onChange={(e) => setCashRatio(Number(e.target.value))}
                    className="w-24 accent-amber-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <span className="font-black text-amber-600 w-8">{cashRatio}%</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const { rateLend: parsedLend, rateExchange: parsedExch } = parseRatesFromExchangeRate(
                      currentStore.exchangeRate || ''
                    );
                    setRateLend(parsedLend || currentStore.rateLend || 46);
                    setRateExchange(parsedExch || currentStore.rateExchange || 52);
                    setCashRatio(currentStore.cashRatio || 35);
                  }}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded bg-slate-100 cursor-pointer"
                  title="ヘッダの換金率（店舗デフォルト）に戻す"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dynamic Store Calculation Display */}
            {(() => {
              const lendUnit = rateLend > 0 ? 1000 / rateLend : 0;
              const exchUnit = rateExchange > 0 ? 1000 / rateExchange : 0;
              const gap = lendUnit - exchUnit;
              return (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <Calculator className="w-4 h-4 text-amber-600" />
                      <span>{currentStore.name} 換金ギャップ利益の動的算出構造</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      「<strong>{rateLend}枚貸 ({lendUnit.toFixed(2)}円/枚) ／ {rateExchange}枚交換 ({exchUnit.toFixed(2)}円/枚) ＝ 1枚あたり {gap >= 0 ? '+' : ''}{gap.toFixed(2)}円の換金ギャップ粗利</strong>」
                      {gap === 0 ? '（等価交換）' : ''}。
                      稼働ゲーム数・現金投資比率（{cashRatio}%）と掛け合わせ、客勝ち還元日でも発生するホール粗利を正確に可視化しています。
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-500 block">1枚あたりギャップ</span>
                    <span className="text-base font-black text-amber-700">
                      {gap >= 0 ? `+${gap.toFixed(2)}` : gap.toFixed(2)}円/枚
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}



        {/* Tab Contents with React.Suspense for Code-Split Lazy Loaded Modules */}
        <React.Suspense
          fallback={
            <div className="p-16 flex flex-col items-center justify-center min-h-[360px] text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-xs font-semibold text-slate-500">モジュールを読み込み中...</p>
            </div>
          }
        >
        {/* TAB 1: 概要 (KPI、月別推移[グラフ/表]、総合ヒートマップ) */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* KPI Cards: Full Width 4-Card Responsive Grid */}
            <div className="w-full">
              <KpiCards
                monthlyStats={filteredMonthlyStats}
                perspective={perspective}
                unit={unit}
                profitModel={profitModel}
              />
            </div>

            {/* 月別推移（グラフ／表 切替） */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-amber-500" />
                    <span>月別推移</span>
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    ({filteredMonthlyStats.length}ヶ月分)
                  </span>
                </div>

                {/* グラフ／表 切替ボタン */}
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200/80 text-xs shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOverviewViewMode('chart')}
                    className={`px-3 py-1 font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      overviewViewMode === 'chart'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>グラフ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewViewMode('table')}
                    className={`px-3 py-1 font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      overviewViewMode === 'table'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>表</span>
                  </button>
                </div>
              </div>

              {overviewViewMode === 'chart' ? (
                <div className="w-full">
                  <ProfitChart
                    monthlyStats={filteredMonthlyStats}
                    perspective={perspective}
                    unit={unit}
                    profitModel={profitModel}
                    selectedYear={selectedYear}
                    onResetYearFilter={() => setSelectedYear('all')}
                    onSelectMonth={(ym) => setSelectedMonthModal(ym)}
                  />
                </div>
              ) : (
                <div className="w-full">
                  <MonthlyTable
                    monthlyStats={filteredMonthlyStats}
                    dailyRecords={filteredDailyRecords}
                    perspective={perspective}
                    unit={unit}
                    profitModel={profitModel}
                    specialDayRules={currentStore.specialDayRules}
                    oldEventDays={currentStore.oldEventDays}
                    onSelectMonth={(ym) => setSelectedMonthModal(ym)}
                  />
                </div>
              )}
            </div>

            {/* Footnote / Explanation */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 text-xs text-slate-500 space-y-1">
              <div className="font-bold text-slate-700 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                G数(IN枚数)連動 利益算出方式について
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-1 text-[11px]">
                <li>
                  <strong>G数(IN枚数)連動モデル:</strong> IN枚数（平均G数 × 3枚 × 台数）から現金投資売上を推計し、貸出・交換レートによる換金ギャップ（{rateLend}枚貸 / {rateExchange}枚交換＝1枚あたり約{((1000/rateLend) - (1000/rateExchange)).toFixed(2)}円の手数料）を算入した実務粗利です。
                </li>
                <li>
                  <strong>店舗特日ルール ({currentStore.name}):</strong> {currentStore.oldEventDays || '未設定'}
                </li>
              </ul>
            </div>

            {/* 総合出玉・粗利ヒートマップ（折りたたみ: 既定は閉じる） */}
            <details className="group bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
              <summary className="px-4 sm:px-5 py-3.5 bg-slate-50 hover:bg-slate-100/80 cursor-pointer list-none flex items-center justify-between gap-2 transition-colors select-none">
                <div className="flex items-center gap-2">
                  <ChevronDown className="w-4 h-4 text-slate-500 transition-transform duration-200 group-open:rotate-180 shrink-0" />
                  <Flame className="w-4 h-4 text-rose-500 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-900">
                    総合出玉・粗利ヒートマップ分析
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  カレンダー・台番号・末尾別色彩マッピング（クリックで展開）
                </span>
              </summary>
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/20">
                <HeatmapAnalysis
                  dailyRecords={filteredDailyRecords}
                  perspective={perspective}
                  unit={unit}
                  profitModel={profitModel}
                  specialDayRules={currentStore.specialDayRules}
                  oldEventDays={currentStore.oldEventDays}
                  onSelectMonth={(ym) => setSelectedMonthModal(ym)}
                />
              </div>
            </details>
          </div>
        )}

        {/* TAB 2: 狙い (来店日・機種・台番 狙い予測: この店／全店) */}
        {activeTab === 'target' && (
          <TargetTab
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
            scope={targetScope}
            onScopeChange={setTargetScope}
            currentStore={currentStore}
            stores={uniqueStores}
            latestDataDate={latestDataDate}
            perspective={perspective}
            unit={unit}
            rateLend={rateLend}
            rateExchange={rateExchange}
            filteredStoresByModel={filteredStoresByModel}
            activeFilterLabel={activeFilterLabel}
            isModelFilterActive={isModelFilterActive}
            onSelectStore={(id) => handleSelectStore(id)}
            onNavigateToValidation={() => handleNavigatePurpose('validation')}
            onOpenStoreManager={() => handleOpenStoreManager('list')}
            targetSection={activeSection}
          />
        )}

        {/* TAB 3: 分析 (サブタブ: 機種／条件別／高出率台) */}
        {activeTab === 'analysis' && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-150">
            {/* Subtabs Switcher for 分析 */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shadow-2xs self-start text-xs sm:text-sm">
              {[
                { id: 'models' as const, label: '機種', icon: Cpu, desc: '機種別深掘り・台番号末尾詳細分析' },
                { id: 'conditions' as const, label: '条件別', icon: Calendar, desc: '曜日・祝日・のつく日・ゾロ目・特日・通常日' },
                { id: 'high_payout' as const, label: '高出率台', icon: Flame, desc: '出率が高い台の特徴・投入傾向分析' },
              ].map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive = analysisSubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleNavigatePurpose('analysis', { subTab: sub.id })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                      isSubActive
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    title={sub.desc}
                  >
                    <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-amber-500' : 'text-slate-400'}`} />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Subtab 1: 機種 */}
            {analysisSubTab === 'models' && (
              <ModelDeepAnalysis
                dailyRecords={filteredDailyRecords}
                perspective={perspective}
                unit={unit}
                rateLend={currentStore.rateLend}
                rateExchange={currentStore.rateExchange}
                specialDayRules={currentStore?.specialDayRules}
                globalModelPreset={modelPreset}
                globalSelectedModelNames={selectedModelNames}
                activeFilterLabel={activeFilterLabel}
                onSelectPreset={handleSelectModelPreset}
                onOpenModelModal={() => setIsMultiSelectModalOpen(true)}
                onToggleModel={handleToggleModelInSelection}
                onNavigateToConditions={handleNavigateToConditions}
              />
            )}

            {/* Subtab 2: 条件別 */}
            {analysisSubTab === 'conditions' && (
              <ConditionAnalysis
                dailyRecords={filteredDailyRecords}
                perspective={perspective}
                unit={unit}
                setUnit={setUnit}
                oldEventDays={currentStore.oldEventDays}
                specialDayRules={currentStore.specialDayRules}
                onSelectDate={(ym) => setSelectedMonthModal(ym)}
                dimension={conditionDimension}
                onDimensionChange={setConditionDimension}
              />
            )}

            {/* Subtab 3: 高出率台 */}
            {analysisSubTab === 'high_payout' && (
              <HighPayoutAnalysis
                dailyRecords={filteredDailyRecords}
                perspective={perspective}
                unit={unit}
                rateLend={rateLend}
                rateExchange={rateExchange}
                oldEventDays={currentStore.oldEventDays}
                specialDayRules={currentStore.specialDayRules}
                onNavigateToConditions={handleNavigateToConditions}
              />
            )}
          </div>
        )}

        {/* TAB 4: 店舗比較 (複数ホールの横断比較) */}
        {activeTab === 'compare' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <StoreComparison
              stores={filteredStoresByModel}
              activeFilterLabel={activeFilterLabel}
              isModelFilterActive={isModelFilterActive}
              onSelectStore={(id) => handleSelectStore(id)}
            />
          </div>
        )}

        {/* TAB 5: 検証 (バックテストと自動調整) */}
        {activeTab === 'validation' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <AccuracyValidation
              dailyRecords={currentStore.dailyRecords || []}
              specialDayRules={currentStore.specialDayRules}
              oldEventDays={currentStore.oldEventDays}
              storeName={currentStore.name}
              currentWeights={currentStore.customRankingWeights}
              onSaveStoreWeights={handleSaveStoreWeights}
              currentMachineWeights={currentStore.customMachineRankingWeights}
              onSaveStoreMachineWeights={handleSaveStoreMachineWeights}
            />
          </div>
        )}


        </React.Suspense>
      </main>

      {/* Daily Records Modal */}
      {selectedMonthModal && (
        <React.Suspense fallback={null}>
          <DailyModal
            yearMonth={selectedMonthModal}
            monthlyStats={processedData.monthlyStats}
            dailyRecords={processedData.dailyRecords}
            perspective={perspective}
            unit={unit}
            profitModel={profitModel}
            onClose={() => setSelectedMonthModal(null)}
          />
        </React.Suspense>
      )}

      {/* Store Manager & Data Import Modal */}
      {isStoreModalOpen && (
        <React.Suspense fallback={null}>
          <StoreManagerModal
            isOpen={isStoreModalOpen}
            onClose={() => setIsStoreModalOpen(false)}
            stores={stores}
            activeStoreId={activeStoreIdState}
            onSelectStore={handleSelectStore}
            onSaveStore={handleSaveStore}
            onSaveStores={handleSaveStores}
            onUpdateStore={handleUpdateStore}
            onDeleteStore={handleDeleteStore}
            onResetAllStores={handleResetAllStores}
            initialTab={storeModalTab}
          />
        </React.Suspense>
      )}

      {/* Confirm Reset All Stores Modal */}
      {isResetConfirmOpen && (
        <React.Suspense fallback={null}>
          <ConfirmModal
            isOpen={isResetConfirmOpen}
            title="すべての店舗データを初期化・削除しますか？"
            message="登録されているすべての店舗データ（全営業日・集計データ）を完全に削除し、初期状態（店舗登録・インポート画面）に戻します。この操作は取り消せません。"
            confirmText="全データを削除してリセット"
            cancelText="キャンセル"
            isDestructive={true}
            onConfirm={() => {
              handleResetAllStores();
              setIsResetConfirmOpen(false);
            }}
            onCancel={() => setIsResetConfirmOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Model Multi-Select Modal */}
      {isMultiSelectModalOpen && (
        <React.Suspense fallback={null}>
          <ModelMultiSelectModal
            isOpen={isMultiSelectModalOpen}
            onClose={() => setIsMultiSelectModalOpen(false)}
            allModels={allAvailableModels}
            selectedModelNames={
              modelPreset === 'all'
                ? []
                : modelPreset === 'smart_slot'
                ? allAvailableModels.filter((m) => isSmartSlot(m.modelName)).map((m) => m.modelName)
                : modelPreset === 'a_type'
                ? allAvailableModels.filter((m) => isAType(m.modelName)).map((m) => m.modelName)
                : modelPreset === 'juggler'
                ? allAvailableModels.filter((m) => isJuggler(m.modelName)).map((m) => m.modelName)
                : selectedModelNames
            }
            onApplySelection={(selected) => {
              if (selected.length === 0 || selected.length === allAvailableModels.length) {
                handleSelectModelPreset('all');
              } else {
                setSelectedModelNames(selected);
                setModelPreset('custom');
              }
              setIsMultiSelectModalOpen(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Persistent Storage Status Toast Notifications */}
      <StorageToast />
    </div>
  );
}
