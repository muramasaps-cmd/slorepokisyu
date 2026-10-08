import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreProfile, MonthlyStat, DailyRecord, RankingWeights } from './data/types';
import { Header, ProfitModelType, UnitMode } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { ProfitChart } from './components/ProfitChart';
import { ModelDeepAnalysis } from './components/ModelDeepAnalysis';
import { HighPayoutAnalysis } from './components/HighPayoutAnalysis';
import { TailNumberAnalysis } from './components/TailNumberAnalysis';
import { DayOfWeekAnalysis } from './components/DayOfWeekAnalysis';
import { SpecialDayPatterns } from './components/SpecialDayPatterns';
import { MonthlyTable } from './components/MonthlyTable';
import { HeatmapAnalysis } from './components/HeatmapAnalysis';
import { DailyModal } from './components/DailyModal';
import { StoreManagerModal } from './components/StoreManagerModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ModelMultiSelectModal } from './components/ModelMultiSelectModal';
import { TargetDateRanking } from './components/TargetDateRanking';
import { AccuracyValidation } from './components/AccuracyValidation';
import { StoreComparison } from './components/StoreComparison';
import { CrossStoreTarget } from './components/CrossStoreTarget';
import { processStoreData, aggregateStoreModels } from './utils/dataEngine';
import { parseSlorepoHtml, parseRatesFromExchangeRate } from './utils/htmlParser';
import { parseSpecialDayRulesFromText } from './utils/specialDayRules';
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
} from 'lucide-react';

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

  // 8 Tabs State (including multi-store comparison and cross-store target)
  type ActiveTab = 'overview' | 'forecast' | 'models' | 'trends' | 'tables' | 'validation' | 'compare' | 'cross';
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'forecast', 'models', 'trends', 'tables', 'validation', 'compare', 'cross'].includes(hash)) {
      return hash as ActiveTab;
    }
    return 'overview';
  });

  // Synchronize activeTab with URL hash
  useEffect(() => {
    if (window.location.hash.replace('#', '') !== activeTab) {
      window.location.hash = `#${activeTab}`;
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['overview', 'forecast', 'models', 'trends', 'tables', 'validation', 'compare', 'cross'].includes(hash)) {
        setActiveTab(hash as ActiveTab);
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

  // Target Date (攻略狙い日) State
  const [targetDate, setTargetDate] = useState<string>('');

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
    if (activeTab === 'compare' || activeTab === 'cross') {
      const allDaily = uniqueStores.flatMap((s) => s.dailyRecords || []);
      return aggregateStoreModels(allDaily, rateLend, rateExchange);
    }
    if (!currentStore || !currentStore.dailyRecords) return [];
    return aggregateStoreModels(currentStore.dailyRecords, rateLend, rateExchange);
  }, [activeTab, uniqueStores, currentStore?.dailyRecords, rateLend, rateExchange]);

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
                  accept=".csv,.tsv,.txt,.html,.htm,text/csv,text/html,text/plain"
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
                        ここにみんレポ台番CSVまたはスロレポHTMLファイルをドラッグ＆ドロップ（複数ファイル一括対応）
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        またはクリックしてパソコンからファイルを選択（ShiftやCtrlキーで複数選択可能）
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
        onOpenStoreManager={() => setIsStoreModalOpen(true)}
        onChangeOldEventDays={handleChangeOldEventDays}
        targetDate={targetDate}
        setTargetDate={setTargetDate}
        latestDataDate={latestDataDate}
      />

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

        {/* Navigation Bar */}
        <div className="flex items-center gap-1 sm:gap-2 border-b border-slate-200 bg-white px-2 sm:px-3 py-1.5 rounded-xl shadow-2xs overflow-x-auto">
          {[
            { id: 'overview' as const, label: '概要', icon: BarChart3, desc: 'KPIと月別推移' },
            { id: 'forecast' as const, label: '狙い日予測', icon: Target, desc: '機種・末尾ランキング' },
            { id: 'models' as const, label: '機種分析', icon: Cpu, desc: '機種別深掘り・高出玉' },
            { id: 'trends' as const, label: '日付傾向', icon: Calendar, desc: '末尾・曜日・特日' },
            { id: 'tables' as const, label: '月別・ヒートマップ', icon: Layers, desc: '月別表・ヒートマップ' },
            { id: 'validation' as const, label: '精度検証', icon: ShieldCheck, desc: 'バックテスト・自動調整' },
            ...(uniqueStores.length >= 2
              ? [{ id: 'compare' as const, label: '店舗比較', icon: Building2, desc: '複数ホールの横断比較' }]
              : []),
            { id: 'cross' as const, label: '横断狙い', icon: Sparkles, desc: '来店日の横断狙い機種・狙い台' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={tab.desc}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.id === 'validation' && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                      isActive ? 'bg-slate-950 text-amber-300' : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    新規
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: 概要 (KPI と月別推移グラフ) */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* KPI Cards: Full Width 4-Card Responsive Grid */}
            <div className="w-full">
              <KpiCards
                monthlyStats={filteredMonthlyStats}
                perspective={perspective}
                unit={unit}
                profitModel={profitModel}
              />
            </div>

            {/* Monthly Profit Chart: Full Width with High Visibility */}
            <div className="w-full min-h-[360px]">
              <ProfitChart
                monthlyStats={filteredMonthlyStats}
                perspective={perspective}
                unit={unit}
                profitModel={profitModel}
                onSelectMonth={(ym) => setSelectedMonthModal(ym)}
              />
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
          </div>
        )}

        {/* TAB 2: 狙い日予測 (機種・末尾ランキング) */}
        {activeTab === 'forecast' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <TargetDateRanking
              targetDate={targetDate || latestDataDate || new Date().toISOString().slice(0, 10)}
              setTargetDate={setTargetDate}
              dailyRecords={currentStore.dailyRecords || []}
              perspective={perspective}
              unit={unit}
              rateLend={rateLend}
              rateExchange={rateExchange}
              specialDayRules={currentStore.specialDayRules}
              oldEventDays={currentStore.oldEventDays}
              customWeights={currentStore.customRankingWeights}
              islandConfig={currentStore.islandConfig}
              onNavigateToValidation={() => setActiveTab('validation')}
              onOpenStoreManager={() => setIsStoreModalOpen(true)}
            />
          </div>
        )}

        {/* TAB 3: 機種分析 (機種別の深掘り、高出玉分析) */}
        {activeTab === 'models' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* 店舗分析深堀り: 機種別・台番号末尾詳細分析 */}
            <ModelDeepAnalysis
              dailyRecords={filteredDailyRecords}
              perspective={perspective}
              unit={unit}
              rateLend={currentStore.rateLend}
              rateExchange={currentStore.rateExchange}
              globalModelPreset={modelPreset}
              globalSelectedModelNames={selectedModelNames}
              activeFilterLabel={activeFilterLabel}
              onSelectPreset={handleSelectModelPreset}
              onOpenModelModal={() => setIsMultiSelectModalOpen(true)}
              onToggleModel={handleToggleModelInSelection}
            />

            {/* 出率が高い台の特徴・投入傾向分析 */}
            <HighPayoutAnalysis
              dailyRecords={filteredDailyRecords}
              perspective={perspective}
              unit={unit}
              rateLend={rateLend}
              rateExchange={rateExchange}
              oldEventDays={currentStore.oldEventDays}
              specialDayRules={currentStore.specialDayRules}
            />
          </div>
        )}

        {/* TAB 4: 日付傾向 (末尾、曜日、特日) */}
        {activeTab === 'trends' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* 〇のつく日別の利益・出玉傾向分析 */}
            <TailNumberAnalysis
              dailyRecords={filteredDailyRecords}
              perspective={perspective}
              unit={unit}
              setUnit={setUnit}
              oldEventDays={currentStore.oldEventDays}
              specialDayRules={currentStore.specialDayRules}
            />

            {/* 曜日別 利益・出玉傾向分析 */}
            <DayOfWeekAnalysis
              dailyRecords={filteredDailyRecords}
              perspective={perspective}
              unit={unit}
              setUnit={setUnit}
              oldEventDays={currentStore.oldEventDays}
              specialDayRules={currentStore.specialDayRules}
            />

            {/* Special Day Patterns (出す・回収するサイクル分析) */}
            <SpecialDayPatterns
              dailyRecords={filteredDailyRecords}
              perspective={perspective}
              unit={unit}
              specialDayRules={currentStore.specialDayRules}
              oldEventDays={currentStore.oldEventDays}
              onSelectMonth={(ym) => setSelectedMonthModal(ym)}
            />
          </div>
        )}

        {/* TAB 5: 月別・ヒートマップ (月別表、ヒートマップ) */}
        {activeTab === 'tables' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Detailed Monthly Table */}
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

            {/* 総合出玉・粗利ヒートマップ分析 */}
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
        )}

        {/* TAB 6: 精度検証 (バックテストと自動調整) */}
        {activeTab === 'validation' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <AccuracyValidation
              dailyRecords={currentStore.dailyRecords || []}
              specialDayRules={currentStore.specialDayRules}
              oldEventDays={currentStore.oldEventDays}
              storeName={currentStore.name}
              currentWeights={currentStore.customRankingWeights}
              onSaveStoreWeights={handleSaveStoreWeights}
            />
          </div>
        )}

        {/* TAB 7: 店舗比較 (複数ホールの横断比較) */}
        {activeTab === 'compare' && uniqueStores.length >= 2 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <StoreComparison
              stores={filteredStoresByModel}
              activeFilterLabel={activeFilterLabel}
              isModelFilterActive={isModelFilterActive}
              onSelectStore={(id) => handleSelectStore(id)}
            />
          </div>
        )}

        {/* TAB 8: 横断狙い (来店日の全店横断 狙い機種・狙い台ランキング) */}
        {activeTab === 'cross' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <CrossStoreTarget
              stores={filteredStoresByModel}
              initialTargetDate={targetDate || latestDataDate}
              activeFilterLabel={activeFilterLabel}
              isModelFilterActive={isModelFilterActive}
              onSelectStore={(id) => handleSelectStore(id)}
            />
          </div>
        )}
      </main>

      {/* Daily Records Modal */}
      {selectedMonthModal && (
        <DailyModal
          yearMonth={selectedMonthModal}
          monthlyStats={processedData.monthlyStats}
          dailyRecords={processedData.dailyRecords}
          perspective={perspective}
          unit={unit}
          profitModel={profitModel}
          onClose={() => setSelectedMonthModal(null)}
        />
      )}

      {/* Store Manager & Data Import Modal */}
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
      />

      {/* Confirm Reset All Stores Modal */}
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

      {/* Model Multi-Select Modal */}
      {isMultiSelectModalOpen && (
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
      )}
    </div>
  );
}
