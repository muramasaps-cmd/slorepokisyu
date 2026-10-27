import React, { useState, useMemo } from 'react';
import { StoreProfile, DailyRecord, SpecialDayRules } from '../data/types';
import { UnitMode } from './Header';
import { StoreCommonPeriod } from '../utils/storeComparison';
import { formatNumber, formatCoins, formatYen } from '../utils/formatters';
import {
  calculateCrossStoreModelRows,
  calculateModelMonthlyTrends,
  estimateCrossStoreModelSettings,
  ModelCrossStoreRow,
} from '../utils/modelCrossStore';
import {
  STORE_COLORS,
  getStoreColor,
  ALL_STORES_COLOR,
  ALL_STORES_NAME,
} from '../utils/storeColors';
import { ModelDeepAnalysis } from './ModelDeepAnalysis';
import { ConditionDimension, ALL_STORES_TOTAL_STORE_ID } from '../utils/conditionAnalysis';
import {
  Cpu,
  Layers,
  Search,
  Building2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Sparkles,
  Info,
  ChevronRight,
  ArrowUpDown,
  SlidersHorizontal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Percent,
  Calculator,
  BarChart2,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

export interface ModelCrossStoreAnalysisProps {
  stores: StoreProfile[];
  currentStore: StoreProfile;
  perspective?: 'hall' | 'player';
  unit?: UnitMode;
  rateLend?: number;
  rateExchange?: number;
  specialDayRules?: SpecialDayRules;
  period?: StoreCommonPeriod | null;
  initialSelectedModelName?: string;
  onSelectStore?: (storeId: string) => void;
  onNavigateToConditions?: (dim?: ConditionDimension) => void;
}

// Custom Chart Tooltip for Monthly Trends (Prompt 59: defined outside component to prevent remounting)
export const MonthlyTrendTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs min-w-[200px] backdrop-blur-xs space-y-2">
        <div className="font-bold text-sm text-indigo-300 border-b border-slate-700 pb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400">台あたり差枚</span>
        </div>
        <div className="space-y-1 pt-0.5">
          {payload.map((entry: any) => {
            const val = entry.value;
            if (val === null || val === undefined) return null;
            const isTotal = entry.name === ALL_STORES_NAME;
            const formattedVal = `${val >= 0 ? '+' : ''}${val}枚/台`;

            return (
              <div
                key={entry.name}
                className={`flex items-center justify-between gap-3 text-xs ${
                  isTotal ? 'font-bold border-t border-slate-700/80 pt-1 text-slate-100' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color || entry.stroke }}
                  />
                  <span className="truncate max-w-[130px]">{entry.name}:</span>
                </div>
                <span
                  className="font-mono font-bold shrink-0"
                  style={{ color: isTotal ? '#ffffff' : entry.color }}
                >
                  {formattedVal}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export const ModelCrossStoreAnalysis: React.FC<ModelCrossStoreAnalysisProps> = ({
  stores,
  currentStore,
  perspective = 'player',
  unit = 'avgDiff',
  rateLend = 46,
  rateExchange = 52,
  specialDayRules,
  period,
  initialSelectedModelName,
  onSelectStore,
  onNavigateToConditions,
}) => {
  const isHall = perspective === 'hall';

  // State: search & filtering
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'common' | 'single'>('all');
  const [sortField, setSortField] = useState<'machineDays' | 'diffCoins' | 'payoutRate' | 'name'>('machineDays');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Compute all cross-store model rows
  const allRows = useMemo(() => {
    return calculateCrossStoreModelRows(stores, { period });
  }, [stores, period]);

  // Selected model for deep-dive
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    initialSelectedModelName || null
  );

  // Default selected model to the first common model
  const activeModelName = useMemo(() => {
    if (selectedModelName && allRows.some((r) => r.modelName === selectedModelName)) {
      return selectedModelName;
    }
    return allRows.length > 0 ? allRows[0].modelName : null;
  }, [selectedModelName, allRows]);

  // Filtered and sorted rows
  const displayRows = useMemo(() => {
    let filtered = allRows;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((r) => r.modelName.toLowerCase().includes(q));
    }

    if (filterMode === 'common') {
      filtered = filtered.filter((r) => r.isCommon);
    } else if (filterMode === 'single') {
      filtered = filtered.filter((r) => !r.isCommon);
    }

    return [...filtered].sort((a, b) => {
      // Always prioritize common models on top
      if (a.isCommon !== b.isCommon) {
        return a.isCommon ? -1 : 1;
      }

      if (sortField === 'name') {
        const cmp = a.modelName.localeCompare(b.modelName, 'ja');
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      if (sortField === 'diffCoins') {
        const valA = isHall ? -a.total.totalDiffCoins : a.total.totalDiffCoins;
        const valB = isHall ? -b.total.totalDiffCoins : b.total.totalDiffCoins;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'payoutRate') {
        const cmp = a.total.payoutRate - b.total.payoutRate;
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      // machineDays
      const cmp = a.total.totalMachineDays - b.total.totalMachineDays;
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [allRows, searchQuery, filterMode, sortField, sortOrder, isHall]);

  // Monthly trends for selected model
  const monthlyTrends = useMemo(() => {
    if (!activeModelName) return [];
    return calculateModelMonthlyTrends(stores, activeModelName, { period });
  }, [stores, activeModelName, period]);

  // Setting estimations for selected model
  const settingEstimations = useMemo(() => {
    if (!activeModelName) return [];
    return estimateCrossStoreModelSettings(stores, activeModelName, undefined, { period });
  }, [stores, activeModelName, period]);

  // Selected store for detailed single-store analysis toggle
  const [selectedDetailStoreId, setSelectedDetailStoreId] = useState<string | null>(null);
  const activeDetailStore = useMemo(() => {
    if (!selectedDetailStoreId) return null;
    return stores.find((s) => s.id === selectedDetailStoreId) || null;
  }, [stores, selectedDetailStoreId]);



  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Header Information & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Cpu className="w-5 h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                機種×店舗 横断比較分析
              </h2>
              <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                {stores.length}店舗対象
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              各店舗の設置機種・台数・台あたり差枚・出率（IN加重）を並列比較します。複数店舗にある「共通機種」を優先表示しています。
            </p>
          </div>

          {/* Quick Filter Switch */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start md:self-auto">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              全機種 ({allRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('common')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'common'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>共通機種 ({allRows.filter((r) => r.isCommon).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('single')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                filterMode === 'single'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              単独機種 ({allRows.filter((r) => !r.isCommon).length})
            </button>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="機種名を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
            <span className="text-slate-400 text-2xs font-bold">並び替え:</span>
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'machineDays') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortField('machineDays'); setSortOrder('desc'); }
                }}
                className={`px-2 py-1 rounded text-2xs font-bold transition-all cursor-pointer ${
                  sortField === 'machineDays' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                台日数 {sortField === 'machineDays' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'diffCoins') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortField('diffCoins'); setSortOrder('desc'); }
                }}
                className={`px-2 py-1 rounded text-2xs font-bold transition-all cursor-pointer ${
                  sortField === 'diffCoins' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                差枚 {sortField === 'diffCoins' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'payoutRate') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortField('payoutRate'); setSortOrder('desc'); }
                }}
                className={`px-2 py-1 rounded text-2xs font-bold transition-all cursor-pointer ${
                  sortField === 'payoutRate' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                出率 {sortField === 'payoutRate' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Main Matrix Table: 機種 × 店舗 */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              {/* Level 1 Headers: Store Groupings */}
              <tr className="bg-slate-100 text-slate-700 text-[11px] border-b border-slate-200">
                <th
                  rowSpan={2}
                  className="p-3 font-bold sticky left-0 bg-slate-100 z-10 whitespace-nowrap min-w-[160px] border-r border-slate-200"
                >
                  対象機種名
                </th>
                {stores.map((s) => (
                  <th
                    key={s.id}
                    colSpan={4}
                    className="p-2 text-center font-bold border-r border-slate-200"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getStoreColor(s.id, stores) }}
                      />
                      <span className="truncate max-w-[140px]">{s.name}</span>
                    </div>
                  </th>
                ))}
                <th
                  colSpan={4}
                  className="p-2 text-center font-black bg-slate-200/80 text-slate-900 border-l border-slate-300"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: ALL_STORES_COLOR }}
                    />
                    <span>{ALL_STORES_NAME}</span>
                  </div>
                </th>
              </tr>
              {/* Level 2 Headers: Metrics per Store */}
              <tr className="bg-slate-50 text-[10px] text-slate-500 font-bold border-b border-slate-200">
                {stores.map((s) => (
                  <React.Fragment key={`sub-${s.id}`}>
                    <th className="px-2 py-1.5 text-right whitespace-nowrap">台数</th>
                    <th className="px-2 py-1.5 text-right whitespace-nowrap">台差枚</th>
                    <th className="px-2 py-1.5 text-right whitespace-nowrap">出率</th>
                    <th className="px-2 py-1.5 text-right whitespace-nowrap border-r border-slate-200">日数</th>
                  </React.Fragment>
                ))}
                <th className="px-2 py-1.5 text-right font-black bg-slate-100/90 whitespace-nowrap">台数</th>
                <th className="px-2 py-1.5 text-right font-black bg-slate-100/90 whitespace-nowrap">台差枚</th>
                <th className="px-2 py-1.5 text-right font-black bg-slate-100/90 whitespace-nowrap">出率</th>
                <th className="px-2 py-1.5 text-right font-black bg-slate-100/90 whitespace-nowrap">日数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={stores.length * 4 + 5} className="p-8 text-center text-slate-400 text-xs">
                    条件に合致する機種が見つかりませんでした
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => {
                  const isSelected = row.modelName === activeModelName;

                  return (
                    <tr
                      key={row.modelName}
                      onClick={() => setSelectedModelName(row.modelName)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 font-medium ring-1 ring-inset ring-indigo-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Model Name & Badge */}
                      <td
                        className={`p-2.5 sticky left-0 z-10 border-r border-slate-200 whitespace-nowrap ${
                          isSelected ? 'bg-indigo-50 font-bold text-indigo-950' : 'bg-white text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {row.isCommon ? (
                            <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200" title={`${row.storeCount}店舗に設置`}>
                              {`共通(${row.storeCount})`}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200" title="単一店舗のみ">
                              単独
                            </span>
                          )}
                          <span className="truncate max-w-[160px] font-bold" title={row.modelName}>
                            {row.modelName}
                          </span>
                        </div>
                      </td>

                      {/* Store Columns */}
                      {stores.map((s) => {
                        const m = row.storeMetrics[s.id];
                        if (!m) {
                          return (
                            <React.Fragment key={`cell-${s.id}-${row.modelName}`}>
                              <td className="px-2 py-2 text-right text-slate-300">-</td>
                              <td className="px-2 py-2 text-right text-slate-300">-</td>
                              <td className="px-2 py-2 text-right text-slate-300">-</td>
                              <td className="px-2 py-2 text-right text-slate-300 border-r border-slate-200">-</td>
                            </React.Fragment>
                          );
                        }

                        const diffVal = isHall ? -m.avgDiffCoins : m.avgDiffCoins;
                        const isDiffPlus = diffVal > 0;

                        return (
                          <React.Fragment key={`cell-${s.id}-${row.modelName}`}>
                            <td className="px-2 py-2 text-right font-mono text-slate-600">
                              {m.avgMachines}台
                            </td>
                            <td
                              className={`px-2 py-2 text-right font-mono font-bold ${
                                isDiffPlus ? (isHall ? 'text-indigo-600' : 'text-blue-600') : 'text-rose-600'
                              }`}
                            >
                              {diffVal > 0 ? `+${diffVal}` : diffVal}
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-bold text-slate-700">
                              {m.payoutRate.toFixed(2)}%
                            </td>
                            <td className="px-2 py-2 text-right text-[11px] text-slate-400 border-r border-slate-200">
                              {m.operatingDays}日
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Total Column */}
                      {(() => {
                        const t = row.total;
                        const totalDiffVal = isHall ? -t.avgDiffCoins : t.avgDiffCoins;
                        const isTotalDiffPlus = totalDiffVal > 0;

                        return (
                          <React.Fragment key={`total-${row.modelName}`}>
                            <td className="px-2 py-2 text-right font-mono font-black bg-slate-100/70 text-slate-900">
                              {t.avgMachines}台
                            </td>
                            <td
                              className={`px-2 py-2 text-right font-mono font-black bg-slate-100/70 ${
                                isTotalDiffPlus
                                  ? isHall
                                    ? 'text-indigo-600'
                                    : 'text-blue-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {totalDiffVal > 0 ? `+${totalDiffVal}` : totalDiffVal}
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-black bg-slate-100/70 text-slate-900">
                              {t.payoutRate.toFixed(2)}%
                            </td>
                            <td className="px-2 py-2 text-right text-[11px] font-bold bg-slate-100/70 text-slate-600">
                              {t.operatingDays}日
                            </td>
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Selected Model Deep-Dive: Monthly Trends & Setting Estimations */}
      {activeModelName && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                  <BarChart2 className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  【{activeModelName}】店舗別月別推移・出率設定推定
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                選択した機種の店舗ごとの台あたり差枚の月次推移および、機械割スペックに基づく推定設定パラメータです。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 2-A. Monthly Trend Chart */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span>店舗別 月別推移 (台あたり差枚)</span>
                </h4>
                <span className="text-[10px] text-slate-400">折れ線: 店舗色統一</span>
              </div>

              {monthlyTrends.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  月別推移データがありません
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrends} margin={{ top: 10, right: 15, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="monthLabel"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                      />
                      <Tooltip content={<MonthlyTrendTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />

                      {/* Store lines */}
                      {stores.map((s) => (
                        <Line
                          key={s.id}
                          type="monotone"
                          dataKey={`store_${s.id}`}
                          name={s.name}
                          stroke={getStoreColor(s.id, stores)}
                          strokeWidth={2}
                          dot={{ r: 3, fill: getStoreColor(s.id, stores) }}
                          connectNulls
                        />
                      ))}

                      {/* Total line */}
                      <Line
                        type="monotone"
                        dataKey="totalAvgDiff"
                        name={ALL_STORES_NAME}
                        stroke={ALL_STORES_COLOR}
                        strokeWidth={3}
                        strokeDasharray="4 4"
                        dot={{ r: 4, fill: ALL_STORES_COLOR }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 2-B. Setting Estimation per Store (settingRange.ts) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  <span>出率ベース設定推定 (店舗別・全店合計)</span>
                </h4>
                <span className="text-[10px] text-slate-400">settingRange.ts 準拠</span>
              </div>

              <div className="space-y-2.5">
                {settingEstimations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    推定対象データがありません
                  </div>
                ) : (
                  settingEstimations.map((est) => {
                    const isTotal = est.storeId === ALL_STORES_TOTAL_STORE_ID;
                    const color = isTotal ? ALL_STORES_COLOR : getStoreColor(est.storeId, stores);

                    return (
                      <div
                        key={est.storeId}
                        className={`p-3 rounded-xl border text-xs transition-all ${
                          isTotal
                            ? 'bg-slate-100/90 border-slate-300 shadow-2xs'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className={isTotal ? 'font-black' : ''}>{est.storeName}</span>
                          </div>
                          <span className="font-mono text-slate-500 text-[11px]">
                            出率: <strong className="text-slate-800">{est.payoutRate.toFixed(2)}%</strong> ({formatNumber(est.totalGames)}G)
                          </span>
                        </div>

                        {est.hasSpec ? (
                          <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                            <div>
                              <span className="text-[10px] text-slate-400 block">平均設定相当</span>
                              <span className="font-mono font-bold text-indigo-700 text-sm">
                                設定 {est.settingEquivalent?.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">高設定割合 (設定4以上)</span>
                              <span className="font-mono font-bold text-emerald-700 text-sm">
                                {est.highSettingRange?.minRate.toFixed(1)}% 〜 {est.highSettingRange?.maxRate.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-1.5">
                            <Info className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{est.unregisteredMessage}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Link / Section to Open Single Store Detailed Analysis */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-600" />
              <span>個別店舗の詳細機種分析を開く（末尾別・日別推移・設定分布）</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              各店舗のボタンを選択すると、その店舗の単独機種分析（台番号末尾・設定分布）をインラインで閲覧できます。
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {stores.map((s) => {
              const isSelected = selectedDetailStoreId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedDetailStoreId(isSelected ? null : s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getStoreColor(s.id, stores) }}
                  />
                  <span>{s.name}</span>
                  {isSelected ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inline Single Store Analysis View */}
        {activeDetailStore && (
          <div className="mt-4 pt-4 border-t border-slate-200 animate-in fade-in duration-200">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getStoreColor(activeDetailStore.id, stores) }}
                />
                <span className="font-bold text-slate-900 text-sm">
                  {activeDetailStore.name} の機種詳細分析
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailStoreId(null)}
                className="text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                閉じる ✕
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4">
              <ModelDeepAnalysis
                dailyRecords={activeDetailStore.dailyRecords || []}
                perspective={perspective}
                unit={unit}
                rateLend={activeDetailStore.rateLend || rateLend}
                rateExchange={activeDetailStore.rateExchange || rateExchange}
                specialDayRules={activeDetailStore.specialDayRules || specialDayRules}
                onNavigateToConditions={onNavigateToConditions}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
