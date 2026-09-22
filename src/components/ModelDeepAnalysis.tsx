import React, { useState, useMemo } from 'react';
import { DailyRecord, AggregatedModelStat, AggregatedTailStat } from '../data/types';
import { aggregateStoreModels, aggregateStoreTails } from '../utils/dataEngine';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { UnitMode } from './Header';
import {
  getModelTagInfo,
  isSmartSlot,
  isAType,
  isJuggler,
  ModelPresetMode,
} from '../utils/modelFilterUtils';
import { ModelMultiSelectModal } from './ModelMultiSelectModal';
import {
  Cpu,
  Search,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Trophy,
  Flame,
  Layers,
  ChevronDown,
  ChevronUp,
  Hash,
  Sparkles,
  BarChart3,
  Calendar,
  CheckCircle2,
  Percent,
  Filter,
  Check,
  Zap,
  RotateCcw,
  X,
  Target,
  SlidersHorizontal,
} from 'lucide-react';

interface ModelDeepAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  rateLend?: number;
  rateExchange?: number;
  globalModelPreset?: ModelPresetMode;
  globalSelectedModelNames?: string[];
  activeFilterLabel?: string;
  onSelectPreset?: (preset: ModelPresetMode) => void;
  onOpenModelModal?: () => void;
  onToggleModel?: (modelName: string) => void;
}

type FilterCategory = 'all' | 'positive' | 'negative' | 'main' | 'small';
type ModelPresetType = 'all' | 'smart_slot' | 'a_type' | 'juggler' | 'custom';
type SortField = 'totalDiff' | 'avgDiff' | 'winRate' | 'avgGames' | 'machines' | 'name';
type ActiveSubView = 'models' | 'tails';

export const ModelDeepAnalysis: React.FC<ModelDeepAnalysisProps> = ({
  dailyRecords,
  perspective,
  unit,
  rateLend = 46,
  rateExchange = 52,
  globalModelPreset,
  globalSelectedModelNames,
  activeFilterLabel,
  onSelectPreset,
  onOpenModelModal,
  onToggleModel,
}) => {
  const [subView, setSubView] = useState<ActiveSubView>('models');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [sortField, setSortField] = useState<SortField>('totalDiff');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  // Model Filtering & Multi-Selection States (fallback if not controlled globally)
  const [localModelPreset, setLocalModelPreset] = useState<ModelPresetType>('all');
  const [localSelectedModelNames, setLocalSelectedModelNames] = useState<string[]>([]);
  const [isLocalModalOpen, setIsLocalModalOpen] = useState<boolean>(false);

  const modelPreset: ModelPresetType = globalModelPreset !== undefined ? globalModelPreset : localModelPreset;
  const selectedModelNames: string[] = globalSelectedModelNames !== undefined ? globalSelectedModelNames : localSelectedModelNames;

  const isHall = perspective === 'hall';

  // Aggregate model stats across all daily records
  const aggregatedModels = useMemo(() => {
    return aggregateStoreModels(dailyRecords, rateLend, rateExchange);
  }, [dailyRecords, rateLend, rateExchange]);

  // All model names list
  const allModelNames = useMemo(
    () => aggregatedModels.map((m) => m.modelName),
    [aggregatedModels]
  );

  // Counts for each preset
  const presetCounts = useMemo(() => {
    const smartSlots = allModelNames.filter(isSmartSlot);
    const aTypes = allModelNames.filter(isAType);
    const jugglers = allModelNames.filter(isJuggler);
    return {
      all: allModelNames.length,
      smart_slot: smartSlots.length,
      a_type: aTypes.length,
      juggler: jugglers.length,
    };
  }, [allModelNames]);

  // Handler for setting preset
  const handleSelectPreset = (preset: ModelPresetType) => {
    if (onSelectPreset) {
      onSelectPreset(preset);
    } else {
      setLocalModelPreset(preset);
      if (preset === 'all') {
        setLocalSelectedModelNames([]);
      } else if (preset === 'smart_slot') {
        setLocalSelectedModelNames(allModelNames.filter(isSmartSlot));
      } else if (preset === 'a_type') {
        setLocalSelectedModelNames(allModelNames.filter(isAType));
      } else if (preset === 'juggler') {
        setLocalSelectedModelNames(allModelNames.filter(isJuggler));
      }
    }
  };

  // Helper to test if a model matches current selection
  const isModelSelected = (name: string) => {
    if (modelPreset === 'all' && selectedModelNames.length === 0) return true;
    if (selectedModelNames.length > 0) {
      return selectedModelNames.includes(name);
    }
    if (modelPreset === 'smart_slot') return isSmartSlot(name);
    if (modelPreset === 'a_type') return isAType(name);
    if (modelPreset === 'juggler') return isJuggler(name);
    return true;
  };

  // Helper to remove a single model from selection
  const handleRemoveModelFromSelection = (name: string) => {
    if (onToggleModel) {
      onToggleModel(name);
    } else {
      const nextSelection = selectedModelNames.filter((n) => n !== name);
      setLocalSelectedModelNames(nextSelection);
      if (nextSelection.length === 0) {
        setLocalModelPreset('all');
      } else {
        setLocalModelPreset('custom');
      }
    }
  };

  // Helper to toggle a single model in selection
  const handleToggleModelInSelection = (name: string) => {
    if (onToggleModel) {
      onToggleModel(name);
    } else {
      if (modelPreset === 'all' && selectedModelNames.length === 0) {
        setLocalSelectedModelNames([name]);
        setLocalModelPreset('custom');
        return;
      }

      if (selectedModelNames.includes(name)) {
        handleRemoveModelFromSelection(name);
      } else {
        const nextSelection = [...selectedModelNames, name];
        setLocalSelectedModelNames(nextSelection);
        if (nextSelection.length === allModelNames.length) {
          setLocalModelPreset('all');
          setLocalSelectedModelNames([]);
        } else {
          setLocalModelPreset('custom');
        }
      }
    }
  };

  // Aggregated summary specifically for the active machine filter selection
  const selectedModelsSummary = useMemo(() => {
    const isFiltered = modelPreset !== 'all' || selectedModelNames.length > 0;
    if (!isFiltered) return null;

    const matched = aggregatedModels.filter((m) => isModelSelected(m.modelName));
    if (matched.length === 0) return null;

    const totalMachineDays = matched.reduce((acc, m) => acc + m.totalMachineDays, 0);
    const totalDiffCoins = matched.reduce((acc, m) => acc + m.totalDiffCoins, 0);
    const totalHallCoinProfit = matched.reduce((acc, m) => acc + m.totalHallCoinProfit, 0);
    const totalHallYenProfit = matched.reduce((acc, m) => acc + m.totalHallYenProfit, 0);
    const avgDiffCoins = totalMachineDays > 0 ? Math.round(totalDiffCoins / totalMachineDays) : 0;
    const avgGames =
      totalMachineDays > 0
        ? Math.round(
            matched.reduce((acc, m) => acc + m.avgGames * m.totalMachineDays, 0) /
              totalMachineDays
          )
        : 0;
    const totalWinMachines = matched.reduce((acc, m) => acc + (m.winMachines ?? 0), 0);
    const totalMachines = matched.reduce((acc, m) => acc + (m.totalMachines ?? 0), 0);
    const winRate =
      totalMachines > 0
        ? Number(((totalWinMachines / totalMachines) * 100).toFixed(1))
        : 0;

    let presetLabel = '選択機種';
    if (modelPreset === 'smart_slot') presetLabel = 'スマスロ';
    if (modelPreset === 'a_type') presetLabel = 'Aタイプ';
    if (modelPreset === 'juggler') presetLabel = 'ジャグラーシリーズ';

    return {
      presetLabel,
      matchedCount: matched.length,
      totalMachineDays,
      totalDiffCoins,
      totalHallCoinProfit,
      totalHallYenProfit,
      avgDiffCoins,
      avgGames,
      winRate,
      totalWinMachines,
      totalMachines,
    };
  }, [aggregatedModels, modelPreset, selectedModelNames]);

  // Aggregate tail stats across all daily records
  const aggregatedTails = useMemo(() => {
    return aggregateStoreTails(dailyRecords);
  }, [dailyRecords]);

  // Overall model summaries
  const summary = useMemo(() => {
    if (aggregatedModels.length === 0) return null;

    const totalModels = aggregatedModels.length;
    const playerWinModels = aggregatedModels.filter((m) => m.totalDiffCoins > 0).length;
    const hallWinModels = aggregatedModels.filter((m) => m.totalDiffCoins < 0).length;
    const evenModels = totalModels - playerWinModels - hallWinModels;

    // Top player win model
    const topPlayerModel = [...aggregatedModels].sort((a, b) => b.totalDiffCoins - a.totalDiffCoins)[0];
    // Top hall profit model
    const topHallModel = [...aggregatedModels].sort((a, b) => a.totalDiffCoins - b.totalDiffCoins)[0];
    // Highest win rate model (with at least 2 machine-days)
    const topWinRateModel = [...aggregatedModels]
      .filter((m) => m.totalMachineDays >= 2)
      .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
    // Most played (highest avg games)
    const mostPlayedModel = [...aggregatedModels].sort((a, b) => b.avgGames - a.avgGames)[0];

    // Main machines (3+ machines) vs Small count (1-2 machines)
    const mainModels = aggregatedModels.filter((m) => !m.isSmallCount);
    const smallModels = aggregatedModels.filter((m) => m.isSmallCount);

    const mainTotalDiff = mainModels.reduce((acc, m) => acc + m.totalDiffCoins, 0);
    const mainMachines = mainModels.reduce((acc, m) => acc + m.totalMachineDays, 0);
    const mainAvgDiff = mainMachines > 0 ? Math.round(mainTotalDiff / mainMachines) : 0;

    const smallTotalDiff = smallModels.reduce((acc, m) => acc + m.totalDiffCoins, 0);
    const smallMachines = smallModels.reduce((acc, m) => acc + m.totalMachineDays, 0);
    const smallAvgDiff = smallMachines > 0 ? Math.round(smallTotalDiff / smallMachines) : 0;

    return {
      totalModels,
      playerWinModels,
      hallWinModels,
      evenModels,
      topPlayerModel,
      topHallModel,
      topWinRateModel,
      mostPlayedModel,
      mainModelsCount: mainModels.length,
      mainAvgDiff,
      smallModelsCount: smallModels.length,
      smallAvgDiff,
    };
  }, [aggregatedModels]);

  // Filtered and sorted models
  const filteredModels = useMemo(() => {
    return aggregatedModels
      .filter((m) => {
        // Machine model selection / preset filter
        if (!isModelSelected(m.modelName)) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          if (!m.modelName.toLowerCase().includes(q)) return false;
        }

        // Category
        if (filterCategory === 'positive') return m.totalDiffCoins > 0;
        if (filterCategory === 'negative') return m.totalDiffCoins < 0;
        if (filterCategory === 'main') return !m.isSmallCount;
        if (filterCategory === 'small') return m.isSmallCount;
        return true;
      })
      .sort((a, b) => {
        let valA = 0;
        let valB = 0;
        switch (sortField) {
          case 'totalDiff':
            valA = isHall ? a.totalHallCoinProfit : a.totalDiffCoins;
            valB = isHall ? b.totalHallCoinProfit : b.totalDiffCoins;
            break;
          case 'avgDiff':
            valA = isHall ? -a.avgDiffCoinsPerMachine : a.avgDiffCoinsPerMachine;
            valB = isHall ? -b.avgDiffCoinsPerMachine : b.avgDiffCoinsPerMachine;
            break;
          case 'winRate':
            valA = a.winRate ?? 0;
            valB = b.winRate ?? 0;
            break;
          case 'avgGames':
            valA = a.avgGames;
            valB = b.avgGames;
            break;
          case 'machines':
            valA = a.totalMachineDays;
            valB = b.totalMachineDays;
            break;
          case 'name':
            return sortOrder === 'asc'
              ? a.modelName.localeCompare(b.modelName, 'ja')
              : b.modelName.localeCompare(a.modelName, 'ja');
        }
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [
    aggregatedModels,
    searchQuery,
    filterCategory,
    sortField,
    sortOrder,
    isHall,
    modelPreset,
    selectedModelNames,
  ]);

  // If no model data is available in the current records
  if (aggregatedModels.length === 0 && aggregatedTails.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-2">
        <Cpu className="w-8 h-8 text-slate-400 mx-auto" />
        <h3 className="font-bold text-slate-700">機種別・末尾データ</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          取り込んだスロレポ日別ファイルから機種別データや末尾別結果が自動抽出されます。
        </p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden space-y-0">
      {/* Header with Title & Sub-View Switcher */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                店舗分析深堀り: 機種別・台番号末尾データ
                <span className="text-xs bg-amber-400 text-slate-950 px-2 py-0.5 rounded font-extrabold">
                  {dailyRecords.length}日分集計
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                日別出玉レポートから全{aggregatedModels.length}機種および台番号末尾(0〜9・ゾロ目)を徹底解析
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-700 text-xs self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setSubView('models')}
            className={`px-3.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'models'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>機種別出玉分析 ({aggregatedModels.length}機種)</span>
          </button>
          {aggregatedTails.length > 0 && (
            <button
              type="button"
              onClick={() => setSubView('tails')}
              className={`px-3.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                subView === 'tails'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>台番号末尾別結果 ({aggregatedTails.length}分類)</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Bar */}
      {summary && subView === 'models' && (
        <div className="bg-slate-50 border-b border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-slate-500 flex items-center justify-between">
              <span>全機種勝敗内訳</span>
              <span className="font-bold text-slate-900">{summary.totalModels}機種</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-extrabold text-blue-600">
                客勝 {summary.playerWinModels}
              </span>
              <span className="text-slate-400">/</span>
              <span className="text-sm font-extrabold text-rose-600">
                店勝 {summary.hallWinModels}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              勝率 {(summary.playerWinModels / (summary.totalModels || 1) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-slate-500 flex items-center justify-between">
              <span>最高差枚獲得機種</span>
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="mt-1 font-bold text-slate-800 truncate" title={summary.topPlayerModel?.modelName}>
              {summary.topPlayerModel?.modelName.replace(/^L|スマスロ|パチスロ/g, '')}
            </div>
            <div className="text-xs font-black text-blue-600 mt-0.5">
              +{formatNumber(summary.topPlayerModel?.totalDiffCoins || 0)}枚
              <span className="text-[10px] text-slate-400 font-normal ml-1">
                (平均+{formatNumber(summary.topPlayerModel?.avgDiffCoinsPerMachine || 0)})
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-slate-500 flex items-center justify-between">
              <span>最高勝率機種 (2台以上)</span>
              <Percent className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="mt-1 font-bold text-slate-800 truncate" title={summary.topWinRateModel?.modelName}>
              {summary.topWinRateModel?.modelName.replace(/^L|スマスロ|パチスロ/g, '')}
            </div>
            <div className="text-xs font-black text-emerald-600 mt-0.5">
              勝率 {summary.topWinRateModel?.winRate}%
              <span className="text-[10px] text-slate-400 font-normal ml-1">
                ({summary.topWinRateModel?.winMachines}/{summary.topWinRateModel?.totalMachines}台)
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-slate-500 flex items-center justify-between">
              <span>主力 vs 少台数(2台以下)</span>
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="mt-1 flex items-center justify-between font-semibold">
              <span className="text-slate-600">主力({summary.mainModelsCount}):</span>
              <span className={summary.mainAvgDiff >= 0 ? 'text-blue-600 font-bold' : 'text-slate-700'}>
                {summary.mainAvgDiff >= 0 ? `+${summary.mainAvgDiff}` : summary.mainAvgDiff}枚
              </span>
            </div>
            <div className="flex items-center justify-between font-semibold mt-0.5">
              <span className="text-slate-600">少台数({summary.smallModelsCount}):</span>
              <span className={summary.smallAvgDiff >= 0 ? 'text-blue-600 font-bold' : 'text-slate-700'}>
                {summary.smallAvgDiff >= 0 ? `+${summary.smallAvgDiff}` : summary.smallAvgDiff}枚
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODEL BREAKDOWN SUBVIEW */}
      {subView === 'models' && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Machine Filter Presets & Multi-Selection Bar */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-amber-400 text-slate-950">
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-slate-800">
                  機種タイプ別絞り込み
                </span>
                <span className="text-[11px] text-slate-500">
                  (「スマスロ」「Aタイプ」「ジャグラーシリーズ」ワンクリック絞り込み / 複数選択可)
                </span>
              </div>

              {/* Multi-Select Dialog Trigger */}
              <button
                type="button"
                onClick={() => {
                  if (onOpenModelModal) onOpenModelModal();
                  else setIsLocalModalOpen(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs self-start sm:self-auto ${
                  modelPreset === 'custom' || selectedModelNames.length > 0
                    ? 'bg-amber-400 text-slate-950 font-black ring-2 ring-amber-400/40'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-700" />
                <span>個別機種を選択 (複数可)...</span>
                {selectedModelNames.length > 0 && modelPreset === 'custom' && (
                  <span className="ml-1 bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                    {selectedModelNames.length}機種
                  </span>
                )}
              </button>
            </div>

            {/* Presets Button Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* All Models */}
              <button
                type="button"
                onClick={() => handleSelectPreset('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  modelPreset === 'all' && selectedModelNames.length === 0
                    ? 'bg-slate-900 text-white ring-2 ring-slate-900/30'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>全機種</span>
                <span className="text-[10px] opacity-80 font-normal">
                  ({presetCounts.all})
                </span>
              </button>

              {/* スマスロ Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset('smart_slot')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  modelPreset === 'smart_slot'
                    ? 'bg-purple-600 text-white ring-2 ring-purple-500/30'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>スマスロ</span>
                <span className="text-[10px] opacity-80 font-normal">
                  ({presetCounts.smart_slot}機種)
                </span>
              </button>

              {/* Aタイプ Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset('a_type')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  modelPreset === 'a_type'
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-500/30'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                }`}
              >
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>Aタイプ</span>
                <span className="text-[10px] opacity-80 font-normal">
                  ({presetCounts.a_type}機種)
                </span>
              </button>

              {/* ジャグラーシリーズ Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset('juggler')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  modelPreset === 'juggler'
                    ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/40 font-black'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>ジャグラーシリーズ</span>
                <span className="text-[10px] opacity-80 font-normal">
                  ({presetCounts.juggler}機種)
                </span>
              </button>

              {/* Reset filter button when active */}
              {(modelPreset !== 'all' || selectedModelNames.length > 0) && (
                <button
                  type="button"
                  onClick={() => handleSelectPreset('all')}
                  className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 font-medium transition-colors cursor-pointer ml-auto flex items-center gap-1 text-[11px]"
                >
                  <RotateCcw className="w-3 h-3" />
                  絞り込みリセット
                </button>
              )}
            </div>

            {/* Active Filter KPI Strip & Selected Machine Chips */}
            {selectedModelsSummary && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 text-[11px] font-black">
                      {selectedModelsSummary.presetLabel}
                    </span>
                    <span>
                      {selectedModelsSummary.matchedCount}機種 (延べ
                      {selectedModelsSummary.totalMachineDays}台) の集計結果
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-bold">
                    <div>
                      <span className="text-slate-400 font-normal">1台平均: </span>
                      <span
                        className={
                          selectedModelsSummary.avgDiffCoins > 0
                            ? 'text-blue-600 font-black'
                            : selectedModelsSummary.avgDiffCoins < 0
                            ? 'text-slate-700 font-black'
                            : 'text-slate-500'
                        }
                      >
                        {selectedModelsSummary.avgDiffCoins > 0
                          ? `+${formatNumber(selectedModelsSummary.avgDiffCoins)}`
                          : formatNumber(selectedModelsSummary.avgDiffCoins)}
                        枚
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-normal">
                        {isHall ? 'ホール粗利: ' : '総差枚: '}
                      </span>
                      <span
                        className={
                          isHall
                            ? selectedModelsSummary.totalHallCoinProfit > 0
                              ? 'text-indigo-600 font-black'
                              : 'text-rose-600 font-black'
                            : selectedModelsSummary.totalDiffCoins > 0
                            ? 'text-blue-600 font-black'
                            : 'text-rose-600 font-black'
                        }
                      >
                        {isHall
                          ? selectedModelsSummary.totalHallCoinProfit > 0
                            ? `+${formatNumber(selectedModelsSummary.totalHallCoinProfit)}枚`
                            : `${formatNumber(selectedModelsSummary.totalHallCoinProfit)}枚`
                          : selectedModelsSummary.totalDiffCoins > 0
                          ? `+${formatNumber(selectedModelsSummary.totalDiffCoins)}枚`
                          : `${formatNumber(selectedModelsSummary.totalDiffCoins)}枚`}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 font-normal">勝率: </span>
                      <span className="text-emerald-600 font-black">
                        {selectedModelsSummary.winRate}%
                      </span>
                    </div>

                    <div className="hidden md:block">
                      <span className="text-slate-400 font-normal">平均G数: </span>
                      <span className="text-slate-700 font-black">
                        {formatNumber(selectedModelsSummary.avgGames)}G
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selected Chips list (if custom selection or small preset) */}
                {selectedModelNames.length > 0 && selectedModelNames.length <= 15 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400">選択中:</span>
                    {selectedModelNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[11px] font-medium text-slate-700 shadow-2xs"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveModelFromSelection(name)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-full p-0.5 cursor-pointer"
                          title="選択解除"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Secondary Controls Bar: Search, Category Filter, and Sorting */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="機種名で検索 (例: ヴァルヴレイヴ, 北斗, ジャグラー)..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Pills (Win/Loss/Main/Small) */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterCategory === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                全{filteredModels.length}件表示
              </button>
              <button
                type="button"
                onClick={() => setFilterCategory('positive')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterCategory === 'positive'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                客勝ち機種
              </button>
              <button
                type="button"
                onClick={() => setFilterCategory('negative')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterCategory === 'negative'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ホール回収機種
              </button>
              <button
                type="button"
                onClick={() => setFilterCategory('main')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterCategory === 'main'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                主力 (3台以上)
              </button>
              <button
                type="button"
                onClick={() => setFilterCategory('small')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterCategory === 'small'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                少台数 (1〜2台)
              </button>
            </div>
          </div>

          {/* Table of Models */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortField('name');
                            setSortOrder('asc');
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:text-slate-900"
                      >
                        機種名
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'machines') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortField('machines');
                            setSortOrder('desc');
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:text-slate-900 ml-auto"
                      >
                        設置台数
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'avgDiff') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortField('avgDiff');
                            setSortOrder('desc');
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:text-slate-900 ml-auto"
                      >
                        1台平均差枚
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'totalDiff') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortField('totalDiff');
                            setSortOrder('desc');
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:text-slate-900 ml-auto font-black text-indigo-700"
                      >
                        {isHall ? 'ホール総粗利 (差枚)' : 'スロッター総差枚'}
                        <ArrowUpDown className="w-3 h-3 text-indigo-400" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">推計粗利 (円換算)</th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'avgGames') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortField('avgGames');
                            setSortOrder('desc');
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:text-slate-900 ml-auto"
                      >
                        平均ゲーム数
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'winRate') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortField('winRate');
                            setSortOrder('desc');
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:text-slate-900 ml-auto"
                      >
                        勝率 (勝/総台数)
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-center">詳細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredModels.map((m, idx) => {
                    const isExpanded = expandedModel === m.modelName;
                    const diffDisplay = isHall ? -m.avgDiffCoinsPerMachine : m.avgDiffCoinsPerMachine;
                    const totalDiffDisplay = isHall ? m.totalHallCoinProfit : m.totalDiffCoins;
                    const yenDisplay = isHall ? m.totalHallYenProfit : -m.totalHallYenProfit;
                    const tagInfo = getModelTagInfo(m.modelName);
                    const isExplicitlySelected = selectedModelNames.includes(m.modelName);

                    return (
                      <React.Fragment key={m.modelName}>
                        <tr
                          onClick={() => setExpandedModel(isExpanded ? null : m.modelName)}
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          {/* Model Name & Category Badges */}
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              {/* Checkbox toggle for multi-select */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleModelInSelection(m.modelName);
                                }}
                                className={`w-4 h-4 rounded shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                                  isExplicitlySelected || (modelPreset === 'all' && selectedModelNames.length === 0)
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'border border-slate-300 bg-white hover:border-amber-400'
                                }`}
                                title={
                                  isExplicitlySelected
                                    ? '選択を解除'
                                    : 'この機種を選択対象に追加'
                                }
                              >
                                {(isExplicitlySelected || (modelPreset === 'all' && selectedModelNames.length === 0)) && (
                                  <Check className="w-3 h-3 stroke-[3]" />
                                )}
                              </button>

                              <span className="text-slate-400 text-xs w-5 shrink-0">#{idx + 1}</span>

                              {/* Category Badges */}
                              {tagInfo.isSmart && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPreset('smart_slot');
                                  }}
                                  className="text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-bold border border-purple-200 shrink-0 cursor-pointer"
                                  title="スマスロで絞り込む"
                                >
                                  スマスロ
                                </button>
                              )}
                              {tagInfo.isJuggler && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPreset('juggler');
                                  }}
                                  className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold border border-amber-300 shrink-0 cursor-pointer"
                                  title="ジャグラーシリーズで絞り込む"
                                >
                                  ジャグラー
                                </button>
                              )}
                              {!tagInfo.isJuggler && tagInfo.isAType && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPreset('a_type');
                                  }}
                                  className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold border border-emerald-200 shrink-0 cursor-pointer"
                                  title="Aタイプで絞り込む"
                                >
                                  Aタイプ
                                </button>
                              )}

                              <span className="truncate max-w-xs sm:max-w-md font-bold" title={m.modelName}>
                                {m.modelName}
                              </span>

                              {m.isSmallCount && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium shrink-0 border border-slate-200">
                                  少台数
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Machines */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span className="font-bold text-slate-800">{m.avgMachinesPerDay}台</span>
                            {m.daysCount > 1 && (
                              <span className="text-[10px] text-slate-400 ml-1">({m.daysCount}日)</span>
                            )}
                          </td>

                          {/* Avg Diff */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span
                              className={`font-black ${
                                m.avgDiffCoinsPerMachine > 0
                                  ? 'text-blue-600'
                                  : m.avgDiffCoinsPerMachine < 0
                                  ? 'text-slate-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {m.avgDiffCoinsPerMachine > 0
                                ? `+${formatNumber(m.avgDiffCoinsPerMachine)}`
                                : formatNumber(m.avgDiffCoinsPerMachine)}
                              枚
                            </span>
                          </td>

                          {/* Total Diff */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span
                              className={`font-black ${
                                totalDiffDisplay > 0
                                  ? isHall
                                    ? 'text-indigo-600'
                                    : 'text-blue-600'
                                  : totalDiffDisplay < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              {totalDiffDisplay > 0
                                ? `+${formatNumber(totalDiffDisplay)}`
                                : formatNumber(totalDiffDisplay)}
                              枚
                            </span>
                          </td>

                          {/* Hall Yen */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span
                              className={`font-bold ${
                                yenDisplay > 0
                                  ? isHall
                                    ? 'text-indigo-600'
                                    : 'text-blue-600'
                                  : yenDisplay < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              {yenDisplay > 0 ? `+${formatYen(yenDisplay)}` : formatYen(yenDisplay)}
                            </span>
                          </td>

                          {/* Avg Games */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap text-slate-700">
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{formatNumber(m.avgGames)}G</span>
                              <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className="bg-amber-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, (m.avgGames / 8000) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Win Rate */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-extrabold text-slate-800">{m.winRate}%</span>
                              <span className="text-[11px] text-slate-500 font-normal">
                                ({m.winMachines}/{m.totalMachines}台)
                              </span>
                            </div>
                          </td>

                          {/* Expand Trigger */}
                          <td className="py-2.5 px-3 text-center">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500 mx-auto" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400 mx-auto" />
                            )}
                          </td>
                        </tr>

                        {/* Expanded Daily History & Insights */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={8} className="p-4">
                              <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="font-bold text-slate-900 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                    <span>{m.modelName} の詳細データ・日別実績</span>
                                  </div>
                                  <span className="text-xs text-slate-500">
                                    対象日数: {m.daysCount}日間 / 累計稼働: {m.totalMachineDays}台
                                  </span>
                                </div>

                                {/* Comparison: Event Days vs Normal Days */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                  <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/60">
                                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                                      <Flame className="w-3.5 h-3.5 text-amber-600" />
                                      旧イベント日での実績 ({m.eventDaysCount}日間)
                                    </div>
                                    <div className="mt-1 flex items-baseline gap-2">
                                      <span className="text-slate-500">1台平均:</span>
                                      <span
                                        className={`font-black text-sm ${
                                          m.eventAvgDiffCoins > 0 ? 'text-blue-600' : 'text-slate-700'
                                        }`}
                                      >
                                        {m.eventAvgDiffCoins > 0
                                          ? `+${formatNumber(m.eventAvgDiffCoins)}`
                                          : formatNumber(m.eventAvgDiffCoins)}
                                        枚
                                      </span>
                                    </div>
                                  </div>

                                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="font-bold text-slate-700 flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                      通常日での実績 ({m.normalDaysCount}日間)
                                    </div>
                                    <div className="mt-1 flex items-baseline gap-2">
                                      <span className="text-slate-500">1台平均:</span>
                                      <span
                                        className={`font-black text-sm ${
                                          m.normalAvgDiffCoins > 0 ? 'text-blue-600' : 'text-slate-700'
                                        }`}
                                      >
                                        {m.normalAvgDiffCoins > 0
                                          ? `+${formatNumber(m.normalAvgDiffCoins)}`
                                          : formatNumber(m.normalAvgDiffCoins)}
                                        枚
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Daily History Table */}
                                <div>
                                  <h4 className="text-xs font-bold text-slate-700 mb-1.5">日別推移:</h4>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-slate-100 text-slate-600">
                                        <tr>
                                          <th className="py-1.5 px-2">日付</th>
                                          <th className="py-1.5 px-2">区分</th>
                                          <th className="py-1.5 px-2 text-right">台数</th>
                                          <th className="py-1.5 px-2 text-right">1台平均差枚</th>
                                          <th className="py-1.5 px-2 text-right">総差枚</th>
                                          <th className="py-1.5 px-2 text-right">平均G数</th>
                                          <th className="py-1.5 px-2 text-right">勝率</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {m.dailyHistory.map((dh) => (
                                          <tr key={dh.date} className="hover:bg-slate-50">
                                            <td className="py-1 px-2 font-medium">{dh.date}</td>
                                            <td className="py-1 px-2">
                                              {dh.isOldEventDay ? (
                                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold">
                                                  特日
                                                </span>
                                              ) : (
                                                <span className="text-[10px] text-slate-400">通常</span>
                                              )}
                                            </td>
                                            <td className="py-1 px-2 text-right">{dh.totalMachines}台</td>
                                            <td
                                              className={`py-1 px-2 text-right font-bold ${
                                                dh.avgDiffCoins > 0 ? 'text-blue-600' : 'text-slate-700'
                                              }`}
                                            >
                                              {dh.avgDiffCoins > 0 ? `+${dh.avgDiffCoins}` : dh.avgDiffCoins}枚
                                            </td>
                                            <td
                                              className={`py-1 px-2 text-right font-bold ${
                                                dh.totalDiffCoins > 0 ? 'text-blue-600' : 'text-slate-700'
                                              }`}
                                            >
                                              {dh.totalDiffCoins > 0 ? `+${formatNumber(dh.totalDiffCoins)}` : formatNumber(dh.totalDiffCoins)}枚
                                            </td>
                                            <td className="py-1 px-2 text-right text-slate-600">
                                              {formatNumber(dh.avgGames)}G
                                            </td>
                                            <td className="py-1 px-2 text-right font-semibold text-slate-800">
                                              {dh.winRate !== null ? `${dh.winRate}%` : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAIL NUMBER RESULTS SUBVIEW */}
      {subView === 'tails' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <strong>台番号 末尾別結果 (スロレポ抽出データ):</strong>
              <span className="ml-1 text-slate-500">
                台番号の1桁目（0〜9およびゾロ目）ごとの全台出玉・稼働・勝率集計です。当たりの入りやすい特定末尾の特定に役立ちます。
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aggregatedTails.map((t) => {
              const diffVal = isHall ? -t.avgDiffCoins : t.avgDiffCoins;
              const totalVal = isHall ? -t.totalDiffCoins : t.totalDiffCoins;
              const isPositive = t.avgDiffCoins > 0;

              return (
                <div
                  key={t.tailName}
                  className={`p-4 rounded-xl border transition-all ${
                    isPositive
                      ? 'bg-blue-50/40 border-blue-200 shadow-xs'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 h-7 rounded-lg bg-slate-900 text-amber-400 font-black text-sm flex items-center justify-center">
                        {t.tailNum !== null ? t.tailNum : 'ゾ'}
                      </span>
                      <span className="font-extrabold text-slate-900 text-sm">{t.tailName}</span>
                    </div>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded ${
                        isPositive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isPositive ? '客プラス' : '店回収'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px]">1台平均差枚</div>
                      <div
                        className={`text-base font-black ${
                          t.avgDiffCoins > 0 ? 'text-blue-600' : 'text-slate-800'
                        }`}
                      >
                        {t.avgDiffCoins > 0 ? `+${formatNumber(t.avgDiffCoins)}` : formatNumber(t.avgDiffCoins)}枚
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px]">総差枚数</div>
                      <div
                        className={`text-base font-black ${
                          t.totalDiffCoins > 0 ? 'text-blue-600' : 'text-slate-800'
                        }`}
                      >
                        {t.totalDiffCoins > 0 ? `+${formatNumber(t.totalDiffCoins)}` : formatNumber(t.totalDiffCoins)}枚
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px]">勝率</div>
                      <div className="font-bold text-slate-800 text-sm">
                        {t.winRate}%{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({t.winMachines}/{t.totalMachines}台)
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px]">平均稼働</div>
                      <div className="font-bold text-slate-800 text-sm">
                        {formatNumber(t.avgGames)}G
                      </div>
                    </div>
                  </div>

                  {/* Progress bar visual for win rate */}
                  <div className="mt-3 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>勝率ゲージ</span>
                      <span>{t.winRate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (t.winRate ?? 0) >= 38
                            ? 'bg-blue-600'
                            : (t.winRate ?? 0) >= 35
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                        }`}
                        style={{ width: `${Math.min(100, t.winRate ?? 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback Local Model Multi-Select Modal */}
      {isLocalModalOpen && (
        <ModelMultiSelectModal
          isOpen={isLocalModalOpen}
          onClose={() => setIsLocalModalOpen(false)}
          allModels={aggregatedModels}
          selectedModelNames={selectedModelNames}
          onApplySelection={(selected) => {
            if (selected.length === 0 || selected.length === allModelNames.length) {
              handleSelectPreset('all');
            } else {
              setLocalSelectedModelNames(selected);
              setLocalModelPreset('custom');
            }
            setIsLocalModalOpen(false);
          }}
        />
      )}
    </section>
  );
};
