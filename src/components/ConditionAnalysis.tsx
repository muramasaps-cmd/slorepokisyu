import React, { useState, useMemo } from 'react';
import { DailyRecord, StoreProfile, SpecialDayRules } from '../data/types';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { UnitMode } from './Header';
import { StoreCommonPeriod } from '../utils/storeComparison';
import {
  ConditionDimension,
  ConditionMetric,
  ConditionViewMode,
  ConditionBucketStat,
  DOW_COLUMNS,
  TAIL_COLUMNS,
  SPECIAL_COLUMNS,
  MACHINE_TAIL_COLUMNS,
  getConditionColumns,
  SPECIAL_DEFINITION_TEXT,
  MACHINE_TAIL_DEFINITION_TEXT,
  DIGIT_DAY_DEFINITION_TEXT,
  DIGIT_DAY_EXPLANATION,
  DOW_EXPLANATION,
  FEW_DAYS_LABEL,
  isFewDays,
  getFewDaysClass,
  getConditionHeatmapColor,
  calculateConditionStats,
  calculateMultiStoreConditions,
  calculateAllStoresTotalConditionStats,
  ALL_STORES_TOTAL_STORE_ID,
  ALL_STORES_TOTAL_NAME,
  StoreConditionRow,
} from '../utils/conditionAnalysis';
import {
  STORE_COLORS,
  getStoreColor,
  ALL_STORES_COLOR,
  ALL_STORES_NAME,
} from '../utils/storeColors';
import { SpecialDayPatterns } from './SpecialDayPatterns';
import {
  Calendar,
  CalendarDays,
  Sparkles,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Table as TableIcon,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Trophy,
  Coins,
  Percent,
  Check,
  Building2,
  Info,
  Hash,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';

export interface ConditionAnalysisProps {
  dailyRecords?: DailyRecord[];
  stores?: StoreProfile[];
  currentStoreName?: string;

  perspective?: 'hall' | 'player';
  unit?: UnitMode;
  setUnit?: (u: UnitMode) => void;
  oldEventDays?: string;
  specialDayRules?: SpecialDayRules;
  onSelectDate?: (date: string) => void;

  initialDimension?: ConditionDimension;
  fixedDimension?: ConditionDimension;
  dimension?: ConditionDimension;
  onDimensionChange?: (dim: ConditionDimension) => void;

  initialMetric?: ConditionMetric;
  metric?: ConditionMetric;
  onMetricChange?: (metric: ConditionMetric) => void;

  initialViewMode?: ConditionViewMode;
  viewMode?: ConditionViewMode;
  onViewModeChange?: (view: ConditionViewMode) => void;

  title?: string;
  description?: string;
  hideControls?: boolean;
  period?: StoreCommonPeriod | null;
}

export const ConditionAnalysis: React.FC<ConditionAnalysisProps> = ({
  dailyRecords = [],
  stores,
  currentStoreName = '当店舗',
  perspective = 'player',
  unit = 'avgDiff',
  setUnit,
  oldEventDays = '',
  specialDayRules,
  onSelectDate,

  initialDimension = 'dow',
  fixedDimension,
  dimension: controlledDimension,
  onDimensionChange,

  initialMetric = 'avgDiff',
  metric: controlledMetric,
  onMetricChange,

  initialViewMode = 'heatmap',
  viewMode: controlledViewMode,
  onViewModeChange,

  title: customTitle,
  description: customDescription,
  hideControls = false,
  period,
}) => {
  // Dimension state
  const [internalDimension, setInternalDimension] = useState<ConditionDimension>(
    fixedDimension || initialDimension
  );
  const currentDimension = fixedDimension || controlledDimension || internalDimension;
  const handleDimensionChange = (dim: ConditionDimension) => {
    if (fixedDimension) return;
    setInternalDimension(dim);
    onDimensionChange?.(dim);
  };

  // Metric state
  const [internalMetric, setInternalMetric] = useState<ConditionMetric>(initialMetric);
  const currentMetric = controlledMetric || internalMetric;
  const handleMetricChange = (m: ConditionMetric) => {
    setInternalMetric(m);
    onMetricChange?.(m);
  };

  // ViewMode state
  const [internalViewMode, setInternalViewMode] = useState<ConditionViewMode>(initialViewMode);
  const currentViewMode = controlledViewMode || internalViewMode;
  const handleViewModeChange = (v: ConditionViewMode) => {
    setInternalViewMode(v);
    onViewModeChange?.(v);
  };

  // Table expansion & sort state
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState<
    'rank' | 'key' | 'avgDiffCoins' | 'hallYen' | 'avgGames' | 'payoutRate' | 'winRate'
  >('rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedStoreIndex, setSelectedStoreIndex] = useState<number>(() => {
    return stores && stores.length > 1 ? -1 : 0;
  });
  const [chartMode, setChartMode] = useState<'multi' | 'single'>('multi');

  const isHall = perspective === 'hall';
  const isMultiStore = Boolean(stores && stores.length >= 1);

  // Multi-store row data (includes each store and weighted '全店合計' row when stores > 1)
  const multiStoreRows: StoreConditionRow[] = useMemo(() => {
    if (!stores || stores.length === 0) return [];
    return calculateMultiStoreConditions(stores, currentDimension, {
      period,
      perspective,
      includeTotalRow: true,
    });
  }, [stores, currentDimension, period, perspective]);

  // Single store bucket stats (or selected store in multi-store mode, or all-stores total)
  const singleStats: ConditionBucketStat[] = useMemo(() => {
    if (isMultiStore && stores && stores.length > 0) {
      if (selectedStoreIndex === -1 && stores.length > 1) {
        const totalRow = multiStoreRows.find((r) => r.isTotal);
        if (totalRow) return totalRow.stats;
        return calculateAllStoresTotalConditionStats(multiStoreRows, currentDimension, { perspective });
      }
      const targetIdx = selectedStoreIndex >= 0 ? selectedStoreIndex : 0;
      const targetStore = stores[targetIdx] || stores[0];
      let recs = targetStore.dailyRecords || [];
      if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
        recs = recs.filter((r) => r.date >= period.startDate! && r.date <= period.endDate!);
      }
      return calculateConditionStats(recs, currentDimension, {
        perspective,
        oldEventDays: targetStore.oldEventDays || oldEventDays,
        specialDayRules: targetStore.specialDayRules || specialDayRules,
        totalMachinesApprox: targetStore.totalMachinesApprox,
        includeMonthDayZoro: false,
      });
    }
    return calculateConditionStats(dailyRecords, currentDimension, {
      perspective,
      oldEventDays,
      specialDayRules,
    });
  }, [
    isMultiStore,
    stores,
    selectedStoreIndex,
    multiStoreRows,
    period,
    dailyRecords,
    currentDimension,
    perspective,
    oldEventDays,
    specialDayRules,
  ]);

  const activeSelectedStoreName = useMemo(() => {
    if (isMultiStore && stores && stores.length > 1) {
      if (selectedStoreIndex === -1) {
        return ALL_STORES_TOTAL_NAME;
      }
      return stores[selectedStoreIndex]?.name || currentStoreName;
    }
    return currentStoreName;
  }, [isMultiStore, stores, selectedStoreIndex, currentStoreName]);

  // Ranking calculation for single stats
  const rankedSingleStats = useMemo(() => {
    if (!singleStats.length) return [];
    const validStats = singleStats.filter((d) => d.count > 0);

    const playerSorted = [...validStats].sort((a, b) => {
      if (unit === 'yen') {
        if (b.dailyPlayerProfit !== a.dailyPlayerProfit) return b.dailyPlayerProfit - a.dailyPlayerProfit;
        if (b.avgDiffCoins !== a.avgDiffCoins) return b.avgDiffCoins - a.avgDiffCoins;
        return b.payoutRate - a.payoutRate;
      } else if (unit === 'coins') {
        if (b.totalDiffCoins !== a.totalDiffCoins) return b.totalDiffCoins - a.totalDiffCoins;
        if (b.avgDiffCoins !== a.avgDiffCoins) return b.avgDiffCoins - a.avgDiffCoins;
        return b.payoutRate - a.payoutRate;
      } else if (unit === 'payoutRate') {
        if (b.payoutRate !== a.payoutRate) return b.payoutRate - a.payoutRate;
        if (b.avgDiffCoins !== a.avgDiffCoins) return b.avgDiffCoins - a.avgDiffCoins;
        return b.dailyPlayerProfit - a.dailyPlayerProfit;
      } else {
        if (b.avgDiffCoins !== a.avgDiffCoins) return b.avgDiffCoins - a.avgDiffCoins;
        if (b.payoutRate !== a.payoutRate) return b.payoutRate - a.payoutRate;
        return b.dailyPlayerProfit - a.dailyPlayerProfit;
      }
    });

    const playerRankMap = new Map<string, number>();
    playerSorted.forEach((d, idx) => {
      playerRankMap.set(d.key, idx + 1);
    });

    const hallSorted = [...validStats].sort((a, b) => {
      if (unit === 'yen') {
        if (b.dailyHallProfit !== a.dailyHallProfit) return b.dailyHallProfit - a.dailyHallProfit;
        if (a.avgDiffCoins !== b.avgDiffCoins) return a.avgDiffCoins - b.avgDiffCoins;
        return b.payoutRate - a.payoutRate;
      } else if (unit === 'coins') {
        if (a.totalDiffCoins !== b.totalDiffCoins) return a.totalDiffCoins - b.totalDiffCoins;
        if (a.avgDiffCoins !== b.avgDiffCoins) return a.avgDiffCoins - b.avgDiffCoins;
        return b.payoutRate - a.payoutRate;
      } else if (unit === 'payoutRate') {
        if (a.payoutRate !== b.payoutRate) return a.payoutRate - b.payoutRate;
        if (a.avgDiffCoins !== b.avgDiffCoins) return a.avgDiffCoins - b.avgDiffCoins;
        return b.dailyHallProfit - a.dailyHallProfit;
      } else {
        if (a.avgDiffCoins !== b.avgDiffCoins) return a.avgDiffCoins - b.avgDiffCoins;
        if (b.dailyHallProfit !== a.dailyHallProfit) return b.dailyHallProfit - a.dailyHallProfit;
        return a.payoutRate - b.payoutRate;
      }
    });

    const hallRankMap = new Map<string, number>();
    hallSorted.forEach((d, idx) => {
      hallRankMap.set(d.key, idx + 1);
    });

    return singleStats.map((d) => ({
      ...d,
      rankPlayer: playerRankMap.get(d.key) || 0,
      rankHall: hallRankMap.get(d.key) || 0,
    }));
  }, [singleStats, unit]);

  // TOP 3 and Worst 3
  const { top3, worst3 } = useMemo(() => {
    const valid = rankedSingleStats.filter((d) => d.count > 0);
    if (valid.length === 0) return { top3: [], worst3: [] };

    const sortedByRank = [...valid].sort((a, b) => {
      const rankA = isHall ? a.rankHall || 999 : a.rankPlayer || 999;
      const rankB = isHall ? b.rankHall || 999 : b.rankPlayer || 999;
      return rankA - rankB;
    });

    const top = sortedByRank.slice(0, 3);
    const reversed = [...sortedByRank].reverse();
    const worstPool =
      valid.length > 3
        ? reversed.filter((item) => !top.some((t) => t.key === item.key))
        : reversed;
    const worst = worstPool.slice(0, 3);

    return { top3: top, worst3: worst };
  }, [rankedSingleStats, isHall]);

  // Sorted list for Table View
  const sortedTableStats = useMemo(() => {
    const list = [...rankedSingleStats];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'key') {
        diff = a.key.localeCompare(b.key);
      } else if (sortField === 'rank') {
        const rankA = isHall ? a.rankHall || 0 : a.rankPlayer || 0;
        const rankB = isHall ? b.rankHall || 0 : b.rankPlayer || 0;
        if (rankA === 0 && rankB !== 0) return 1;
        if (rankB === 0 && rankA !== 0) return -1;
        diff = rankA - rankB;
      } else if (sortField === 'avgDiffCoins') {
        const valA = isHall ? -a.avgDiffCoins : a.avgDiffCoins;
        const valB = isHall ? -b.avgDiffCoins : b.avgDiffCoins;
        diff = valA - valB;
      } else if (sortField === 'hallYen') {
        const valA = isHall ? a.dailyHallProfit : a.dailyPlayerProfit;
        const valB = isHall ? b.dailyHallProfit : b.dailyPlayerProfit;
        diff = valA - valB;
      } else if (sortField === 'avgGames') {
        diff = a.avgGames - b.avgGames;
      } else if (sortField === 'payoutRate') {
        diff = a.payoutRate - b.payoutRate;
      } else if (sortField === 'winRate') {
        diff = a.playerWinRate - b.playerWinRate;
      }

      return sortOrder === 'asc' ? diff : -diff;
    });
    return list;
  }, [rankedSingleStats, sortField, sortOrder, isHall]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'key' || field === 'rank' ? 'asc' : 'desc');
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const getStatusBadge = (d: ConditionBucketStat) => {
    if (d.count === 0) {
      return <span className="text-slate-400 text-xs">データなし</span>;
    }
    if (d.avgDiffCoins >= 120 || d.payoutRate >= 101.5) {
      return (
        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold px-2 py-0.5 rounded-full">
          <Flame className="w-3 h-3 text-rose-600" />
          激アツ還元
        </span>
      );
    }
    if (d.avgDiffCoins > 0) {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2 py-0.5 rounded-full">
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          還元傾向
        </span>
      );
    }
    if (d.avgDiffCoins >= -120) {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2 py-0.5 rounded-full">
          通常営業
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-2 py-0.5 rounded-full">
        <TrendingDown className="w-3 h-3 text-slate-500" />
        回収傾向
      </span>
    );
  };

  // Custom Chart Tooltip
  const CustomChartTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: readonly { payload: ConditionBucketStat }[];
  }) => {
    if (active && payload && payload.length) {
      const data: ConditionBucketStat = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs max-w-xs backdrop-blur-xs">
          <div className="font-bold text-sm text-indigo-300 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between">
            <span>{data.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                data.isWeekend || data.isHoliday
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              {data.isHoliday ? '祝日' : data.isWeekend ? '週末' : '平日'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">集計営業日数:</span>
              <span className="font-bold">{data.count}日間</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">
                {isHall ? 'ホール平均差枚/台:' : '客平均差枚/台:'}
              </span>
              <span
                className={`font-bold ${
                  data.displayDiffCoins > 0
                    ? isHall
                      ? 'text-indigo-300'
                      : 'text-blue-400'
                    : 'text-rose-400'
                }`}
              >
                {data.displayDiffCoins > 0 ? `+${data.displayDiffCoins}` : data.displayDiffCoins} 枚
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">
                {isHall ? '1日平均ホール粗利:' : '1日平均客収支:'}
              </span>
              <span
                className={`font-bold ${
                  data.displayDailyProfit >= 0
                    ? isHall
                      ? 'text-emerald-400'
                      : 'text-blue-400'
                    : 'text-rose-400'
                }`}
              >
                {formatYen(data.displayDailyProfit)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">台平均稼働G数:</span>
              <span className="font-semibold text-amber-300">
                {formatNumber(data.avgGames)} G
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">機械割(出玉率):</span>
              <span className="font-bold text-indigo-300">{data.payoutRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">高出率台の率(勝率):</span>
              <span className="font-bold text-emerald-400">
                {data.highPayoutRate}% ({data.playerWinDays}/{data.count}日)
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Determine section headers
  const columns = getConditionColumns(currentDimension);
  const isDow = currentDimension === 'dow';

  const defaultTitle =
    currentDimension === 'dow'
      ? isMultiStore
        ? '店舗 × 曜日 ヒートマップ（台あたり平均差枚）'
        : '曜日・祝日別 利益・出玉傾向分析'
      : currentDimension === 'tail'
      ? isMultiStore
        ? '店舗 × のつく日 ヒートマップ（台あたり平均差枚）'
        : '〇のつく日別の利益・出玉傾向分析'
      : currentDimension === 'special'
      ? isMultiStore
        ? '店舗 × 特日／通常日 ヒートマップ'
        : '特日／通常日別の利益・出玉傾向分析'
      : isMultiStore
      ? '店舗 × 台番号末尾 ヒートマップ'
      : '台番号末尾別の利益・出玉傾向分析';

  const titleText = customTitle || defaultTitle;

  const defaultDescription =
    currentDimension === 'dow'
      ? DOW_EXPLANATION
      : currentDimension === 'tail'
      ? isMultiStore
        ? DIGIT_DAY_DEFINITION_TEXT
        : DIGIT_DAY_EXPLANATION
      : currentDimension === 'special'
      ? SPECIAL_DEFINITION_TEXT
      : MACHINE_TAIL_DEFINITION_TEXT;

  const descriptionText = customDescription || defaultDescription;

  // Metric value extractor helper
  const getMetricDisplayValue = (stat: ConditionBucketStat, met: ConditionMetric) => {
    if (stat.count === 0) return '-';
    if (met === 'avgDiff') {
      const val = isHall ? -stat.avgDiffCoins : stat.avgDiffCoins;
      return `${val >= 0 ? '+' : ''}${val}`;
    }
    if (met === 'payoutRate') {
      return `${stat.payoutRate.toFixed(1)}%`;
    }
    return `${stat.highPayoutRate.toFixed(1)}%`;
  };

  const getMetricRawValue = (stat: ConditionBucketStat, met: ConditionMetric) => {
    if (met === 'avgDiff') return isHall ? -stat.avgDiffCoins : stat.avgDiffCoins;
    if (met === 'payoutRate') return stat.payoutRate;
    return stat.highPayoutRate;
  };

  // Multi-Store Comparison Chart Tooltip
  const MultiStoreChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const p0 = payload[0]?.payload;
      const conditionLabel = p0?.label || label;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs min-w-[220px] backdrop-blur-xs space-y-2">
          <div className="font-bold text-sm text-indigo-300 border-b border-slate-700 pb-1 flex items-center justify-between">
            <span>{conditionLabel}</span>
            <span className="text-[10px] text-slate-400">
              {currentMetric === 'avgDiff'
                ? '台あたり差枚'
                : currentMetric === 'payoutRate'
                ? '出率(機械割)'
                : '高出率台の率'}
            </span>
          </div>
          <div className="space-y-1 pt-0.5">
            {payload.map((entry: any) => {
              const val = entry.value;
              if (val === null || val === undefined) return null;
              const isTotal = entry.name === ALL_STORES_NAME;
              let formattedVal = '';
              if (currentMetric === 'payoutRate' || currentMetric === 'highPayoutRate') {
                formattedVal = `${Number(val).toFixed(2)}%`;
              } else if (unit === 'yen') {
                formattedVal = formatYen(val);
              } else {
                formattedVal = `${val >= 0 ? '+' : ''}${val}枚/台`;
              }

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
                      style={{ backgroundColor: entry.color || entry.fill || entry.stroke }}
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

  const multiStoreChartData = useMemo(() => {
    if (!isMultiStore || !stores || stores.length <= 1) return [];

    return columns.map((col) => {
      const entry: Record<string, any> = {
        key: col.key,
        label: col.label,
        shortLabel: col.shortLabel,
      };

      // Each store
      stores.forEach((s) => {
        const sRow = multiStoreRows.find((r) => r.storeId === s.id);
        const sStat = sRow?.stats.find((st) => st.key === col.key);
        if (sStat && sStat.count > 0) {
          entry[s.name] = getMetricRawValue(sStat, currentMetric);
        } else {
          entry[s.name] = null;
        }
      });

      // All-stores total
      const totalRow = multiStoreRows.find((r) => r.isTotal);
      const totalStat = totalRow?.stats.find((st) => st.key === col.key);
      if (totalStat && totalStat.count > 0) {
        entry[ALL_STORES_NAME] = getMetricRawValue(totalStat, currentMetric);
      } else {
        entry[ALL_STORES_NAME] = null;
      }

      return entry;
    });
  }, [isMultiStore, stores, columns, multiStoreRows, currentMetric, isHall]);

  const tableTotal = useMemo(() => {
    const valid = singleStats.filter((d) => d.count > 0);
    if (valid.length === 0) {
      return {
        avgDiff: 0,
        dailyProfit: 0,
        avgGames: 0,
        payoutRate: 100,
        winRate: 0,
      };
    }
    const totalMachDays = valid.reduce(
      (acc, d) => acc + (d.totalMachines || d.count * 500),
      0
    );
    const totalDiff = valid.reduce((acc, d) => acc + d.displayTotalCoins, 0);
    const totalDailyProfit = Math.round(
      valid.reduce((acc, d) => acc + d.displayDailyProfit, 0) / valid.length
    );
    const avgDiff =
      totalMachDays > 0 ? Math.round((totalDiff / totalMachDays) * 10) / 10 : 0;
    const avgGames = Math.round(
      valid.reduce((acc, d) => acc + d.avgGames, 0) / valid.length
    );
    const payoutRate =
      valid.reduce((acc, d) => acc + d.payoutRate, 0) / valid.length;
    const winRate =
      valid.reduce((acc, d) => acc + d.playerWinRate, 0) / valid.length;
    return {
      avgDiff,
      dailyProfit: totalDailyProfit,
      avgGames,
      payoutRate: Math.round(payoutRate * 100) / 100,
      winRate: Math.round(winRate * 10) / 10,
    };
  }, [singleStats]);

  return (
    <div
      id={`condition-analysis-${currentDimension}`}
      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4"
    >
      {/* Header & Controls */}
      <div className="flex flex-col gap-3.5 border-b border-slate-100 pb-4">
        <div className="w-full min-w-0 space-y-1">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
              {currentDimension === 'dow' ? (
                <Calendar className="w-5 h-5" />
              ) : currentDimension === 'tail' ? (
                <CalendarDays className="w-5 h-5" />
              ) : currentDimension === 'special' ? (
                <Sparkles className="w-5 h-5" />
              ) : (
                <Hash className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 min-w-0 break-normal">
                {titleText}
              </h2>
              {!isMultiStore && (
                <div className="text-xs font-normal text-slate-500 mt-0.5">
                  {currentDimension === 'dow'
                    ? '(月〜日曜日 & 国民の祝日)'
                    : currentDimension === 'tail'
                    ? '(0〜9のつく日 & ゾロ目の日)'
                    : currentDimension === 'special'
                    ? '(特日 vs 通常日 & 前日・翌日)'
                    : '(末尾0〜9 & 末尾ゾロ目)'}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{descriptionText}</p>
        </div>

        {/* Global Switchers */}
        {!hideControls && (
          <div className="flex flex-wrap items-center gap-2 w-full text-xs">
            {/* 1. Dimension Switcher (切り口: 曜日・祝日 / のつく日・ゾロ目 / 特日／通常日 / 末尾) */}
            {!fixedDimension && (
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-bold text-slate-400 select-none hidden sm:inline">
                  切り口:
                </span>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl font-bold">
                  <button
                    type="button"
                    onClick={() => handleDimensionChange('dow')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      currentDimension === 'dow'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    曜日・祝日
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDimensionChange('tail')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      currentDimension === 'tail'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    のつく日・ゾロ目
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDimensionChange('special')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      currentDimension === 'special'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    特日／通常日
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDimensionChange('machineTail')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      currentDimension === 'machineTail'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    末尾
                  </button>
                </div>
              </div>
            )}

            {/* 2. Metric Switcher (指標: 台あたり差枚 / 出率 / 高出率台の率) */}
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-bold text-slate-400 select-none hidden sm:inline">
                指標:
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl font-bold">
                <button
                  type="button"
                  onClick={() => handleMetricChange('avgDiff')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    currentMetric === 'avgDiff'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  台あたり差枚
                </button>
                <button
                  type="button"
                  onClick={() => handleMetricChange('payoutRate')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    currentMetric === 'payoutRate'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  出率(機械割)
                </button>
                <button
                  type="button"
                  onClick={() => handleMetricChange('highPayoutRate')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    currentMetric === 'highPayoutRate'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  高出率台の率
                </button>
              </div>
            </div>

            {/* 3. View Mode Switcher (表示: ヒートマップ / 表 / グラフ) */}
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-bold text-slate-400 select-none hidden sm:inline">
                表示:
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl font-bold">
                <button
                  type="button"
                  onClick={() => handleViewModeChange('heatmap')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    currentViewMode === 'heatmap'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  ヒートマップ
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('table')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    currentViewMode === 'table'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  表
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('chart')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    currentViewMode === 'chart'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  グラフ
                </button>
              </div>
            </div>

            {/* Optional Unit Mode Switcher */}
            {setUnit && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-2xs font-bold text-slate-400 select-none">
                  単位:
                </span>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-2xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setUnit('yen')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      unit === 'yen' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'
                    }`}
                  >
                    円表記
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit('coins')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      unit === 'coins' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'
                    }`}
                  >
                    枚数
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* VIEW 1: HEATMAP */}
      {currentViewMode === 'heatmap' && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[11px]">
                  <th className="p-2.5 text-left sticky left-0 bg-slate-100 z-10 whitespace-nowrap min-w-[100px]">
                    店舗名
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="p-2 font-bold whitespace-nowrap min-w-[56px] text-center"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isMultiStore ? (
                  multiStoreRows.map((row) => {
                    const validStats = row.stats.filter((s) => s.count > 0);
                    const maxVal =
                      validStats.length > 0
                        ? Math.max(...validStats.map((s) => getMetricRawValue(s, currentMetric)))
                        : null;

                    return (
                      <tr
                        key={row.storeId}
                        className={
                          row.isTotal
                            ? 'bg-slate-100/90 font-bold border-t-2 border-slate-300'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td
                          className={`p-2.5 text-left sticky left-0 z-10 whitespace-nowrap ${
                            row.isTotal
                              ? 'bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300'
                              : 'bg-white hover:bg-slate-50 font-bold text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: row.isTotal
                                  ? ALL_STORES_COLOR
                                  : getStoreColor(row.storeId, stores),
                              }}
                            />
                            <span className={row.isTotal ? 'font-black' : ''}>{row.storeName}</span>
                            {row.totalDays !== undefined && (
                              <span className="text-[10px] font-normal text-slate-500 shrink-0">
                                ({row.totalDays}日)
                              </span>
                            )}
                          </div>
                        </td>
                        {columns.map((col) => {
                          const stat =
                            row.stats.find((s) => s.key === col.key) || {
                              ...col,
                              count: 0,
                              avgDiffCoins: 0,
                              payoutRate: 100,
                              highPayoutRate: 0,
                              totalDiffCoins: 0,
                              totalMachines: 0,
                            };
                          const rawVal = getMetricRawValue(stat as ConditionBucketStat, currentMetric);
                          const isMax =
                            maxVal !== null && stat.count > 0 && rawVal === maxVal;
                          const { bgClass, isFewDays: few } = getConditionHeatmapColor(
                            currentMetric,
                            rawVal,
                            stat.count,
                            perspective
                          );

                          const tooltipText =
                            stat.count === 0
                              ? `${row.storeName} - ${col.label}: 該当日なし`
                              : row.isTotal
                              ? `【${row.storeName} - ${col.label}】\n・集計店舗数: ${stores?.length || 0}店舗\n・該当日数: ${stat.count}日\n・総差枚: ${
                                  stat.totalDiffCoins >= 0 ? '+' : ''
                                }${formatNumber(stat.totalDiffCoins)}枚\n・総台数: ${formatNumber(
                                  stat.totalMachines
                                )}台\n・台あたり平均差枚: ${
                                  stat.avgDiffCoins >= 0 ? '+' : ''
                                }${stat.avgDiffCoins}枚/台\n・出玉率(IN加重): ${stat.payoutRate.toFixed(
                                  2
                                )}%\n・勝率: ${stat.highPayoutRate.toFixed(1)}%${
                                  few ? '\n※3日未満のため参考値' : ''
                                }`
                              : `【${row.storeName} - ${col.label}】\n・該当日数: ${stat.count}日\n・総差枚: ${
                                  stat.totalDiffCoins >= 0 ? '+' : ''
                                }${formatNumber(stat.totalDiffCoins)}枚\n・総台数: ${formatNumber(
                                  stat.totalMachines || stat.count * 500
                                )}台\n・台あたり平均差枚: ${
                                  stat.avgDiffCoins >= 0 ? '+' : ''
                                }${stat.avgDiffCoins}枚/台\n・出玉率: ${stat.payoutRate.toFixed(
                                  2
                                )}%\n・勝率: ${stat.highPayoutRate.toFixed(1)}%${
                                  few ? '\n※3日未満のため参考値' : ''
                                }`;

                          return (
                            <td
                              key={col.key}
                              className={`p-1 sm:p-1.5 ${row.isTotal ? 'border-t-2 border-slate-300' : ''}`}
                            >
                              <div
                                title={tooltipText}
                                className={`p-2 rounded-lg text-xs relative transition-all select-none ${bgClass} ${
                                  few ? getFewDaysClass(stat.count) : ''
                                } ${
                                  isMax
                                    ? 'ring-2 ring-indigo-600 ring-offset-1 font-black shadow-xs'
                                    : ''
                                } ${row.isTotal ? 'border border-slate-300/80 font-bold' : ''}`}
                              >
                                <div className={isMax || row.isTotal ? 'font-black' : ''}>
                                  {getMetricDisplayValue(stat as ConditionBucketStat, currentMetric)}
                                </div>
                                {few && (
                                  <span className="block text-[9px] leading-tight font-normal text-amber-700 bg-amber-50/80 rounded px-0.5 mt-0.5 whitespace-nowrap">
                                    {FEW_DAYS_LABEL}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ) : (
                  <tr className="hover:bg-slate-50">
                    <td className="p-2.5 text-left font-bold text-slate-900 sticky left-0 bg-white hover:bg-slate-50 z-10 whitespace-nowrap">
                      {currentStoreName}
                    </td>
                    {columns.map((col) => {
                      const stat =
                        singleStats.find((s) => s.key === col.key) || {
                          ...col,
                          count: 0,
                          avgDiffCoins: 0,
                          payoutRate: 100,
                          highPayoutRate: 0,
                          totalDiffCoins: 0,
                          totalMachines: 0,
                        };
                      const rawVal = getMetricRawValue(stat as ConditionBucketStat, currentMetric);
                      const { bgClass, isFewDays: few } = getConditionHeatmapColor(
                        currentMetric,
                        rawVal,
                        stat.count,
                        perspective
                      );

                      const tooltipText =
                        stat.count === 0
                          ? `${currentStoreName} - ${col.label}: 該当日なし`
                          : `【${currentStoreName} - ${col.label}】\n・該当日数: ${stat.count}日\n・総差枚: ${
                              stat.totalDiffCoins >= 0 ? '+' : ''
                            }${formatNumber(stat.totalDiffCoins)}枚\n・総台数: ${formatNumber(
                              stat.totalMachines
                            )}台\n・台あたり平均差枚: ${
                              stat.avgDiffCoins >= 0 ? '+' : ''
                            }${stat.avgDiffCoins}枚/台\n・出玉率: ${stat.payoutRate.toFixed(
                              2
                            )}%\n・勝率: ${stat.highPayoutRate.toFixed(1)}%${
                              few ? '\n※3日未満のため参考値' : ''
                            }`;

                      return (
                        <td key={col.key} className="p-1 sm:p-1.5">
                          <div
                            title={tooltipText}
                            className={`p-2 rounded-lg text-xs relative transition-all select-none ${bgClass} ${
                              few ? getFewDaysClass(stat.count) : ''
                            }`}
                          >
                            <div>{getMetricDisplayValue(stat as ConditionBucketStat, currentMetric)}</div>
                            {few && (
                              <span className="block text-[9px] leading-tight font-normal text-amber-700 bg-amber-50/80 rounded px-0.5 mt-0.5 whitespace-nowrap">
                                {FEW_DAYS_LABEL}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Color Legend & Explanation */}
          <div className="flex flex-wrap items-center justify-between text-2xs text-slate-500 pt-1 border-t border-slate-100 gap-2">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-600">凡例:</span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600 inline-block" />
                <span>高還元 (+300枚 / 102%超)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200 inline-block" />
                <span>好待遇 (+100枚 / 100.5%超)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-100 border border-rose-200 inline-block" />
                <span>回収 (-100枚 / 99.5%未満)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-600 inline-block" />
                <span>強回収 (-300枚 / 98%未満)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                  日数少
                </span>
                <span>3日未満（参考値）</span>
              </div>
            </div>
            <span className="text-slate-400">※ セルクリックまたはホバーで詳細数値を表示</span>
          </div>
        </div>
      )}

      {/* VIEW 2: CHART */}
      {currentViewMode === 'chart' && (
        <div className="space-y-4">
          {isMultiStore && stores && stores.length > 1 && (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-2xs font-bold text-slate-500">店舗グラフ切替:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('multi');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    chartMode === 'multi'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>全店横断比較 (全店合計 系列)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('single');
                    setSelectedStoreIndex(-1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    chartMode === 'single' && selectedStoreIndex === -1
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: ALL_STORES_COLOR }}
                  />
                  <span>全店合計 単体詳細</span>
                </button>
                {stores.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setChartMode('single');
                      setSelectedStoreIndex(idx);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      chartMode === 'single' && selectedStoreIndex === idx
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getStoreColor(s.id, stores) }}
                    />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {chartMode === 'multi' && isMultiStore && stores && stores.length > 1 ? (
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={multiStoreChartData}
                  margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickFormatter={(val) => {
                      if (currentMetric === 'payoutRate' || currentMetric === 'highPayoutRate') {
                        return `${val}%`;
                      }
                      if (unit === 'yen') return `${(val / 10000).toFixed(0)}万`;
                      if (unit === 'coins')
                        return `${val > 0 ? '+' : ''}${(val / 10000).toFixed(0)}万枚`;
                      return `${val > 0 ? '+' : ''}${val}`;
                    }}
                  />
                  <Tooltip content={<MultiStoreChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <ReferenceLine
                    yAxisId="left"
                    y={
                      currentMetric === 'payoutRate'
                        ? 100
                        : currentMetric === 'highPayoutRate'
                        ? 50
                        : 0
                    }
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                  />
                  {stores.map((s) => (
                    <Bar
                      key={s.id}
                      yAxisId="left"
                      dataKey={s.name}
                      name={s.name}
                      fill={getStoreColor(s.id, stores)}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={36}
                    />
                  ))}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey={ALL_STORES_NAME}
                    name={ALL_STORES_NAME}
                    stroke={ALL_STORES_COLOR}
                    strokeWidth={3}
                    dot={{ r: 4, fill: ALL_STORES_COLOR }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={singleStats}
                  margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickFormatter={(val) => {
                      if (currentMetric === 'payoutRate' || currentMetric === 'highPayoutRate') {
                        return `${val}%`;
                      }
                      if (unit === 'yen') return `${(val / 10000).toFixed(0)}万`;
                      if (unit === 'coins')
                        return `${val > 0 ? '+' : ''}${(val / 10000).toFixed(0)}万枚`;
                      return `${val > 0 ? '+' : ''}${val}`;
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 'auto']}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickFormatter={(val) => `${val}G`}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine
                    yAxisId="left"
                    y={
                      currentMetric === 'payoutRate'
                        ? 100
                        : currentMetric === 'highPayoutRate'
                        ? 50
                        : 0
                    }
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                  />

                  <Bar
                    yAxisId="left"
                    dataKey={
                      currentMetric === 'payoutRate'
                        ? 'payoutRate'
                        : currentMetric === 'highPayoutRate'
                        ? 'highPayoutRate'
                        : unit === 'yen'
                        ? 'displayDailyProfit'
                        : unit === 'coins'
                        ? 'displayTotalCoins'
                        : 'displayDiffCoins'
                    }
                    radius={[4, 4, 0, 0]}
                  >
                    {singleStats.map((entry, index) => {
                      let fillColor = '#6366f1';
                      if (currentMetric === 'payoutRate') {
                        fillColor = entry.payoutRate >= 100 ? '#10b981' : '#f43f5e';
                      } else if (currentMetric === 'highPayoutRate') {
                        fillColor = entry.highPayoutRate >= 50 ? '#3b82f6' : '#f59e0b';
                      } else if (unit === 'yen') {
                        fillColor =
                          entry.displayDailyProfit >= 0
                            ? isHall
                              ? '#10b981'
                              : '#3b82f6'
                            : '#f43f5e';
                      } else if (unit === 'coins') {
                        fillColor =
                          entry.displayTotalCoins >= 0
                            ? isHall
                              ? '#10b981'
                              : '#3b82f6'
                            : '#f43f5e';
                      } else {
                        fillColor =
                          entry.displayDiffCoins > 0
                            ? isHall
                              ? '#818cf8'
                              : '#3b82f6'
                            : '#f43f5e';
                      }
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={fillColor}
                          stroke={entry.isStoreEvent ? '#f59e0b' : 'none'}
                          strokeWidth={entry.isStoreEvent ? 2 : 0}
                        />
                      );
                    })}
                  </Bar>

                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgGames"
                    name="台平均稼働G数"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#f59e0b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: TABLE */}
      {currentViewMode === 'table' && (
        <div className="space-y-4">
          {isMultiStore && stores && stores.length > 1 && (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-2xs font-bold text-slate-500">店舗詳細切替:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedStoreIndex(-1)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedStoreIndex === -1
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: ALL_STORES_COLOR }}
                  />
                  <span>全店合計</span>
                </button>
                {stores.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStoreIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedStoreIndex === idx
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getStoreColor(s.id, stores) }}
                    />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* TOP 3 & Worst 3 Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* TOP 3 Card */}
            <div className="bg-white rounded-xl border border-emerald-200/90 shadow-xs overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50/60 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xs">
                    ★
                  </span>
                  <span className="text-xs font-bold text-emerald-950">
                    {isMultiStore && stores && stores.length > 1
                      ? `【${activeSelectedStoreName}】`
                      : ''}
                    {isHall
                      ? '利益貢献 TOP 3 (高粗利・回収条件)'
                      : '出玉還元 TOP 3 (高差枚・好待遇条件)'}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  好待遇・還元
                </span>
              </div>

              <div className="divide-y divide-slate-100 flex-1">
                {top3.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">データがありません</div>
                ) : (
                  top3.map((item) => {
                    const rank = isHall ? item.rankHall || 1 : item.rankPlayer || 1;
                    const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';

                    return (
                      <div
                        key={`top-${item.key}`}
                        onClick={() => toggleExpand(item.key)}
                        className="p-3 sm:px-4 hover:bg-emerald-50/30 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="px-2 py-0.5 rounded text-xs shrink-0 flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                            <span>{medalEmoji}</span>
                            <span>{rank}位</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">
                                {item.label}
                              </span>
                              {item.isStoreEvent && (
                                <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded">
                                  特日
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>集計 {item.count}日間</span>
                              <span>•</span>
                              <span>平均稼働 {formatNumber(item.avgGames)}G</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-4 shrink-0 sm:text-right">
                          <div>
                            <div className="text-[10px] text-slate-400">
                              {isHall ? '店平均差枚/台' : '客平均差枚/台'}
                            </div>
                            <div
                              className={`text-sm font-black ${
                                item.displayDiffCoins > 0
                                  ? isHall
                                    ? 'text-indigo-600'
                                    : 'text-blue-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {item.displayDiffCoins > 0 ? `+${item.displayDiffCoins}` : item.displayDiffCoins}枚/台
                            </div>
                          </div>
                          <div className="pl-3 border-l border-slate-200 text-left sm:text-right min-w-[70px]">
                            <div className="text-[10px] text-slate-400">機械割 / 勝率</div>
                            <div
                              className={`text-xs font-bold ${
                                item.payoutRate >= 100 ? 'text-emerald-700' : 'text-slate-700'
                              }`}
                            >
                              {item.payoutRate.toFixed(2)}%
                            </div>
                            <div className="text-[10px] text-slate-500">
                              勝率 {item.playerWinRate}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Worst 3 Card */}
            <div className="bg-white rounded-xl border border-rose-200/90 shadow-xs overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-gradient-to-r from-rose-50 to-orange-50/60 border-b border-rose-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-600 text-white text-xs font-black shadow-xs">
                    ▼
                  </span>
                  <span className="text-xs font-bold text-rose-950">
                    {isMultiStore && stores && stores.length > 1
                      ? `【${activeSelectedStoreName}】`
                      : ''}
                    {isHall ? '粗利 ワースト 3 (還元・赤字条件)' : '出玉 ワースト 3 (回収・低勝率条件)'}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-full">
                  回収警戒
                </span>
              </div>

              <div className="divide-y divide-slate-100 flex-1">
                {worst3.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">データがありません</div>
                ) : (
                  worst3.map((item, idx) => {
                    const overallRank = isHall ? item.rankHall || 99 : item.rankPlayer || 99;

                    return (
                      <div
                        key={`worst-${item.key}`}
                        onClick={() => toggleExpand(item.key)}
                        className="p-3 sm:px-4 hover:bg-rose-50/30 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="px-2 py-0.5 rounded text-xs shrink-0 flex flex-col items-center justify-center min-w-16 bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                            <span>ワースト{idx + 1}位</span>
                            <span className="text-[9px] opacity-80">({overallRank}位)</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">
                                {item.label}
                              </span>
                              {item.isStoreEvent && (
                                <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded">
                                  特日
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>集計 {item.count}日間</span>
                              <span>•</span>
                              <span>平均稼働 {formatNumber(item.avgGames)}G</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-4 shrink-0 sm:text-right">
                          <div>
                            <div className="text-[10px] text-slate-400">
                              {isHall ? '店平均差枚/台' : '客平均差枚/台'}
                            </div>
                            <div
                              className={`text-sm font-black ${
                                item.displayDiffCoins > 0
                                  ? isHall
                                    ? 'text-indigo-600'
                                    : 'text-blue-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {item.displayDiffCoins > 0 ? `+${item.displayDiffCoins}` : item.displayDiffCoins}枚/台
                            </div>
                          </div>
                          <div className="pl-3 border-l border-slate-200 text-left sm:text-right min-w-[70px]">
                            <div className="text-[10px] text-slate-400">機械割 / 勝率</div>
                            <div
                              className={`text-xs font-bold ${
                                item.payoutRate >= 100 ? 'text-emerald-700' : 'text-slate-700'
                              }`}
                            >
                              {item.payoutRate.toFixed(2)}%
                            </div>
                            <div className="text-[10px] text-slate-500">
                              勝率 {item.playerWinRate}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Detailed Sortable Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="text-[11px] text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 font-bold text-center whitespace-nowrap">詳細</th>
                  <th
                    className="px-3 py-3 font-bold cursor-pointer hover:bg-slate-100 text-center"
                    onClick={() => handleSort('rank')}
                  >
                    順位
                  </th>
                  <th
                    className="px-4 py-3 font-bold cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('key')}
                  >
                    条件区分
                  </th>
                  <th
                    className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('avgDiffCoins')}
                  >
                    {isHall ? '店平均差枚' : '客平均差枚'}
                  </th>
                  <th
                    className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('hallYen')}
                  >
                    {isHall ? '1日平均粗利' : '1日平均客収支'}
                  </th>
                  <th
                    className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('avgGames')}
                  >
                    平均稼働G
                  </th>
                  <th
                    className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('payoutRate')}
                  >
                    機械割
                  </th>
                  <th
                    className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('winRate')}
                  >
                    客勝率
                  </th>
                  <th className="px-3 py-3 font-bold text-center">傾向判定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedTableStats.map((d) => {
                  const isExpanded = expandedKey === d.key;
                  const currentRank = isHall ? d.rankHall : d.rankPlayer;

                  return (
                    <React.Fragment key={`table-row-${d.key}`}>
                      <tr
                        className={`hover:bg-slate-50/80 transition-colors ${
                          d.isStoreEvent ? 'bg-amber-50/30 font-medium' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(d.key)}
                            className={`p-1.5 rounded transition-colors cursor-pointer ${
                              isExpanded
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'hover:bg-slate-200 text-slate-500'
                            }`}
                            title="該当営業日リストを表示"
                            aria-label="該当営業日リストを表示"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-3 font-bold text-center">
                          {d.count > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-700">
                              {currentRank}位
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{d.label}</span>
                            {d.isStoreEvent && (
                              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded">
                                特日
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {d.sampleDays ? `${d.sampleDays} (${d.count}日)` : `${d.count}日間`}
                          </div>
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-extrabold ${
                            d.displayDiffCoins > 0
                              ? isHall
                                ? 'text-indigo-600'
                                : 'text-blue-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {d.displayDiffCoins > 0 ? `+${d.displayDiffCoins}` : d.displayDiffCoins}枚
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-extrabold ${
                            d.displayDailyProfit >= 0
                              ? isHall
                                ? 'text-emerald-600'
                                : 'text-blue-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {formatYen(d.displayDailyProfit)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700">
                          {formatNumber(d.avgGames)}G
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700">
                          {d.payoutRate.toFixed(2)}%
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700">
                          {d.playerWinRate}% ({d.playerWinDays}/{d.count})
                        </td>
                        <td className="px-3 py-3 text-center">{getStatusBadge(d)}</td>
                      </tr>

                      {/* Expanded Sub-table */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50 p-4">
                            {isMultiStore && stores && stores.length > 1 && selectedStoreIndex === -1 && (
                              <div className="mb-3 space-y-1.5">
                                <div className="text-[11px] font-bold text-slate-700">各店舗の内訳:</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {stores.map((s) => {
                                    const sRow = multiStoreRows.find((r) => r.storeId === s.id);
                                    const sStat = sRow?.stats.find((st) => st.key === d.key);
                                    if (!sStat || sStat.count === 0) return null;
                                    return (
                                      <div
                                        key={s.id}
                                        className="p-2 rounded-lg bg-white border border-slate-200 text-xs flex items-center justify-between shadow-2xs"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: getStoreColor(s.id, stores) }}
                                          />
                                          <span className="font-bold truncate">{s.name}</span>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div
                                            className={`font-mono font-bold ${
                                              sStat.displayDiffCoins > 0 ? 'text-blue-600' : 'text-rose-600'
                                            }`}
                                          >
                                            {sStat.displayDiffCoins > 0 ? `+${sStat.displayDiffCoins}` : sStat.displayDiffCoins}枚
                                          </div>
                                          <div className="text-[10px] text-slate-400">
                                            {sStat.payoutRate.toFixed(1)}% ({sStat.count}日)
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="text-xs font-bold text-slate-800 mb-2">
                              {d.label} の営業日一覧 ({d.records.length}日間)
                            </div>
                            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                              <table className="w-full text-[11px] text-left">
                                <thead className="bg-slate-100 text-slate-600 sticky top-0">
                                  <tr>
                                    <th className="px-3 py-1.5">日付</th>
                                    <th className="px-2 py-1.5">曜日</th>
                                    <th className="px-2 py-1.5 text-right">
                                      {isHall ? 'ホール差枚' : '客差枚'}
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                      {isHall ? 'ホール粗利' : '客収支'}
                                    </th>
                                    <th className="px-2 py-1.5 text-right">稼働G数</th>
                                    <th className="px-2 py-1.5 text-right">機械割</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {d.records.map((r) => (
                                    <tr
                                      key={r.date}
                                      onClick={() => onSelectDate?.(r.date)}
                                      className="hover:bg-slate-50 cursor-pointer"
                                    >
                                      <td className="px-3 py-1 font-mono font-bold text-slate-800">
                                        {r.date}
                                      </td>
                                      <td className="px-2 py-1 text-slate-600">{r.dayOfWeek}</td>
                                      <td
                                        className={`px-2 py-1 text-right font-bold ${
                                          isHall
                                            ? r.avgDiffCoins < 0
                                              ? 'text-indigo-600'
                                              : 'text-rose-600'
                                            : r.avgDiffCoins > 0
                                            ? 'text-blue-600'
                                            : 'text-rose-600'
                                        }`}
                                      >
                                        {isHall ? -r.avgDiffCoins : r.avgDiffCoins}枚
                                      </td>
                                      <td className="px-2 py-1 text-right font-bold text-slate-700">
                                        {formatYen(
                                          isHall
                                            ? r.gModelHallProfit || 0
                                            : r.gModelPlayerProfit || 0
                                        )}
                                      </td>
                                      <td className="px-2 py-1 text-right text-slate-600">
                                        {formatNumber(r.avgGames)}G
                                      </td>
                                      <td className="px-2 py-1 text-right text-slate-600">
                                        {(r.payoutRate || 100).toFixed(2)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-black text-left">
                    {isMultiStore && stores && stores.length > 1 && selectedStoreIndex === -1
                      ? '全店・全条件 合計／加重平均'
                      : '全条件 合計／平均'}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-black ${
                      tableTotal.avgDiff > 0 ? 'text-blue-600' : 'text-rose-600'
                    }`}
                  >
                    {tableTotal.avgDiff > 0 ? `+${tableTotal.avgDiff}` : tableTotal.avgDiff}枚/台
                  </td>
                  <td className="px-3 py-3 text-right font-black">
                    {formatYen(tableTotal.dailyProfit)}
                  </td>
                  <td className="px-3 py-3 text-right font-black">
                    {formatNumber(tableTotal.avgGames)}G
                  </td>
                  <td className="px-3 py-3 text-right font-black">
                    {tableTotal.payoutRate.toFixed(2)}%
                  </td>
                  <td className="px-3 py-3 text-right font-black">
                    {tableTotal.winRate.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-center text-slate-400 text-2xs">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Special Day Detailed Patterns (特日サイクル・特日タイプ別・前日翌日) */}
      {currentDimension === 'special' && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
              <Sparkles className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-900">
              特日詳細分析（特日サイクル・特日タイプ別・前日翌日）
            </h3>
          </div>
          <SpecialDayPatterns
            dailyRecords={
              isMultiStore && stores && stores.length > 0
                ? stores[selectedStoreIndex]?.dailyRecords || dailyRecords
                : dailyRecords
            }
            perspective={perspective}
            unit={unit === 'yen' || unit === 'coins' || unit === 'payoutRate' ? unit : 'avgDiff'}
            specialDayRules={
              isMultiStore && stores && stores.length > 0
                ? stores[selectedStoreIndex]?.specialDayRules || specialDayRules
                : specialDayRules
            }
            oldEventDays={
              isMultiStore && stores && stores.length > 0
                ? stores[selectedStoreIndex]?.oldEventDays || oldEventDays
                : oldEventDays
            }
            onSelectMonth={(ym) => onSelectDate?.(ym)}
          />
        </div>
      )}
    </div>
  );
};
