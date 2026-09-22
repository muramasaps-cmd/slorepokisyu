import React, { useState, useMemo } from 'react';
import { DailyRecord } from '../data/types';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { isJapaneseHoliday } from '../utils/holidayUtils';
import { UnitMode } from './Header';
import {
  Calendar,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Trophy,
  Coins,
  Percent,
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
  ReferenceLine,
  Cell,
} from 'recharts';

interface DayOfWeekAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  setUnit?: (u: UnitMode) => void;
  oldEventDays?: string;
  specialDayRules?: any;
}

export const DayOfWeekAnalysis: React.FC<DayOfWeekAnalysisProps> = ({
  dailyRecords,
  perspective,
  unit,
  setUnit,
  oldEventDays = '',
  specialDayRules,
}) => {
  const [expandedDow, setExpandedDow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'rank' | 'dow' | 'avgDiffCoins' | 'hallYen' | 'avgGames' | 'payoutRate' | 'winRate'>('rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const isHall = perspective === 'hall';

  // Days of week order (including holidays)
  const dows = ['月', '火', '水', '木', '金', '土', '日', '祝'];
  const dowOrderMap: Record<string, number> = {
    月: 1,
    火: 2,
    水: 3,
    木: 4,
    金: 5,
    土: 6,
    日: 7,
    祝: 8,
  };

  // Check which day of week is designated as a store event day
  const isTargetStoreEventDow = (dow: string): boolean => {
    if (dow === '祝') {
      return Boolean(oldEventDays && (oldEventDays.includes('祝日') || oldEventDays.includes('祝')));
    }
    if (specialDayRules?.daysOfWeek && Array.isArray(specialDayRules.daysOfWeek)) {
      if (specialDayRules.daysOfWeek.includes(dow)) return true;
    }
    if (oldEventDays) {
      if (oldEventDays.includes(`${dow}曜日`) || oldEventDays.includes(`${dow}曜`)) {
        return true;
      }
    }
    return false;
  };

  // Group by Day of Week (and Japanese Holidays)
  const dowStats = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) return [];

    return dows.map((dow) => {
      const isHoliday = dow === '祝';
      const records = isHoliday
        ? dailyRecords.filter((r) => isJapaneseHoliday(r.date))
        : dailyRecords.filter((r) => r.dayOfWeek === dow);
      const count = records.length;
      const isWeekend = dow === '土' || dow === '日';
      const isStoreEvent = isTargetStoreEventDow(dow);
      const label = isHoliday ? '祝日 (祝祭日・振替休日)' : `${dow}曜日`;

      if (count === 0) {
        return {
          dow,
          label,
          isWeekend,
          isHoliday,
          isStoreEvent,
          count: 0,
          totalHallProfit: 0,
          dailyHallProfit: 0,
          totalPlayerProfit: 0,
          dailyPlayerProfit: 0,
          totalDiffCoins: 0,
          avgDiffCoins: 0,
          displayDiffCoins: 0,
          displayDailyProfit: 0,
          displayTotalProfit: 0,
          displayPerMachineDailyProfit: 0,
          displayPerMachineTotalProfit: 0,
          avgGames: 0,
          payoutRate: 100,
          playerWinDays: 0,
          playerWinRate: 0,
          records: [],
        };
      }

      const totalHallProfit = records.reduce((acc, r) => acc + (r.gModelHallProfit || 0), 0);
      const dailyHallProfit = Math.round(totalHallProfit / count);

      const totalPlayerProfit = records.reduce((acc, r) => acc + (r.gModelPlayerProfit || 0), 0);
      const dailyPlayerProfit = Math.round(totalPlayerProfit / count);

      const totalDiffCoins = records.reduce((acc, r) => acc + r.totalDiffCoins, 0);
      const avgDiffCoins = Math.round((records.reduce((acc, r) => acc + r.avgDiffCoins, 0) / count) * 10) / 10;
      const avgGames = Math.round(records.reduce((acc, r) => acc + r.avgGames, 0) / count);

      // Average of daily payout rates
      const avgPayoutRate = records.reduce((acc, r) => acc + (r.payoutRate || 100), 0) / count;
      const payoutRate = Math.round(avgPayoutRate * 100) / 100;

      const playerWinDays = records.filter((r) => r.avgDiffCoins > 0).length;
      const playerWinRate = Math.round((playerWinDays / count) * 1000) / 10;

      const avgMachines = Math.round(records.reduce((acc, r) => acc + (r.totalMachines || 587), 0) / count);
      const perMachineDailyProfit = avgMachines > 0 ? Math.round(dailyHallProfit / avgMachines) : 0;
      const perMachineDailyPlayerProfit = avgMachines > 0 ? Math.round(dailyPlayerProfit / avgMachines) : 0;

      const displayDiffCoins = perspective === 'hall' ? Math.round(-avgDiffCoins * 10) / 10 : avgDiffCoins;
      const displayTotalCoins = perspective === 'hall' ? -totalDiffCoins : totalDiffCoins;
      const displayDailyProfit = perspective === 'hall' ? dailyHallProfit : dailyPlayerProfit;
      const displayTotalProfit = perspective === 'hall' ? totalHallProfit : totalPlayerProfit;
      const displayPerMachineDailyProfit = perspective === 'hall' ? perMachineDailyProfit : perMachineDailyPlayerProfit;
      const displayPerMachineTotalProfit = displayPerMachineDailyProfit * count;

      return {
        dow,
        label,
        isWeekend,
        isHoliday,
        isStoreEvent,
        count,
        totalHallProfit,
        dailyHallProfit,
        totalPlayerProfit,
        dailyPlayerProfit,
        perMachineDailyProfit,
        perMachineDailyPlayerProfit,
        totalDiffCoins,
        avgDiffCoins,
        displayDiffCoins,
        displayTotalCoins,
        displayDailyProfit,
        displayTotalProfit,
        displayPerMachineDailyProfit,
        displayPerMachineTotalProfit,
        avgGames,
        payoutRate,
        playerWinDays,
        playerWinRate,
        records: records.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
  }, [dailyRecords, oldEventDays, specialDayRules, perspective]);

  // Add player & hall rankings
  const rankedDowStats = useMemo(() => {
    if (!dowStats.length) return [];
    // Only rank days with actual records (count > 0)
    const validStats = dowStats.filter((d) => d.count > 0);

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
      playerRankMap.set(d.dow, idx + 1);
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
      hallRankMap.set(d.dow, idx + 1);
    });

    return dowStats.map((d) => ({
      ...d,
      rankPlayer: playerRankMap.get(d.dow) || 0,
      rankHall: hallRankMap.get(d.dow) || 0,
    }));
  }, [dowStats, unit]);

  // TOP 3 and Worst 3 based on current perspective
  const { top3, worst3 } = useMemo(() => {
    const valid = rankedDowStats.filter((d) => d.count > 0);
    if (valid.length === 0) return { top3: [], worst3: [] };

    // Sort ascending by current perspective rank (1位, 2位, 3位...)
    const sortedByRank = [...valid].sort((a, b) => {
      const rankA = perspective === 'hall' ? a.rankHall : a.rankPlayer;
      const rankB = perspective === 'hall' ? b.rankHall : b.rankPlayer;
      return rankA - rankB;
    });

    const top = sortedByRank.slice(0, 3);
    const reversed = [...sortedByRank].reverse();
    // For worst 3: lowest ranked items (worst 1 is the absolute bottom rank)
    const worstPool = valid.length > 3
      ? reversed.filter((item) => !top.some((t) => t.dow === item.dow))
      : reversed;
    const worst = worstPool.slice(0, 3);

    return { top3: top, worst3: worst };
  }, [rankedDowStats, perspective]);

  // Sorted DOW list for table
  const sortedDows = useMemo(() => {
    const list = [...rankedDowStats];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'dow') diff = (dowOrderMap[a.dow] || 0) - (dowOrderMap[b.dow] || 0);
      else if (sortField === 'rank') {
        const rankA = perspective === 'hall' ? a.rankHall : a.rankPlayer;
        const rankB = perspective === 'hall' ? b.rankHall : b.rankPlayer;
        if (rankA === 0 && rankB !== 0) return 1;
        if (rankB === 0 && rankA !== 0) return -1;
        diff = rankA - rankB;
      }
      else if (sortField === 'avgDiffCoins') {
        const valA = perspective === 'hall' ? -a.avgDiffCoins : a.avgDiffCoins;
        const valB = perspective === 'hall' ? -b.avgDiffCoins : b.avgDiffCoins;
        diff = valA - valB;
      }
      else if (sortField === 'hallYen') {
        const valA = perspective === 'hall' ? a.dailyHallProfit : a.dailyPlayerProfit;
        const valB = perspective === 'hall' ? b.dailyHallProfit : b.dailyPlayerProfit;
        diff = valA - valB;
      }
      else if (sortField === 'avgGames') diff = a.avgGames - b.avgGames;
      else if (sortField === 'payoutRate') diff = a.payoutRate - b.payoutRate;
      else if (sortField === 'winRate') diff = a.playerWinRate - b.playerWinRate;

      return sortOrder === 'asc' ? diff : -diff;
    });
    return list;
  }, [rankedDowStats, sortField, sortOrder, perspective]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'dow' || field === 'rank' ? 'asc' : 'desc');
    }
  };

  const toggleExpand = (dow: string) => {
    setExpandedDow((prev) => (prev === dow ? null : dow));
  };

  const getStatusBadge = (d: typeof dowStats[0]) => {
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

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: typeof dowStats[0] = payload[0].payload;
      const isHall = perspective === 'hall';

      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs max-w-xs backdrop-blur-xs">
          <div className="font-bold text-sm text-indigo-300 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between">
            <span>{data.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
              data.dow === '日'
                ? 'bg-rose-500 text-white'
                : data.dow === '土'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-200'
            }`}>
              {data.isWeekend ? '週末' : '平日'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">集計営業日数:</span>
              <span className="font-bold">{data.count}日間</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{isHall ? 'ホール平均差枚/台:' : '客平均差枚/台:'}</span>
              <span
                className={`font-bold ${
                  data.displayDiffCoins > 0
                    ? isHall ? 'text-indigo-300' : 'text-blue-400'
                    : 'text-rose-400'
                }`}
              >
                {data.displayDiffCoins > 0 ? `+${data.displayDiffCoins}` : data.displayDiffCoins} 枚
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{isHall ? '1日平均ホール粗利:' : '1日平均客収支:'}</span>
              <span
                className={`font-bold ${
                  data.displayDailyProfit >= 0
                    ? isHall ? 'text-emerald-400' : 'text-blue-400'
                    : 'text-rose-400'
                }`}
              >
                {formatYen(data.displayDailyProfit)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{isHall ? '1台あたり粗利:' : '1台あたり収支:'}</span>
              <span className="font-bold text-amber-300">
                {formatYen(data.displayPerMachineDailyProfit)}/台・日
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">台平均稼働G数:</span>
              <span className="font-semibold text-amber-300">{formatNumber(data.avgGames)} G</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">機械割(出玉率):</span>
              <span className="font-bold text-indigo-300">{data.payoutRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">客プラス勝率:</span>
              <span className="font-bold text-emerald-400">
                {data.playerWinRate}% ({data.playerWinDays}/{data.count}日)
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (dailyRecords.length === 0) return null;

  return (
    <div id="day-of-week-analysis" className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Calendar className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>曜日・祝日別 利益・出玉傾向分析</span>
              <span className="text-xs font-normal text-slate-500">
                (月〜日曜日 & 国民の祝日)
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            月曜日から日曜日まで、および祝日（祝祭日・振替休日）ごとの出玉傾向・ホール粗利（G数連動）・稼働状況を比較分析します。
          </p>
        </div>

        {/* Unit & Metric Selector (Unified with Header & Synchronized) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => setUnit?.('yen')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
              unit === 'yen'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            円表記
          </button>
          <button
            type="button"
            onClick={() => setUnit?.('coins')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              unit === 'coins'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Coins className="w-3 h-3" />
            枚数表記
          </button>
          <button
            type="button"
            onClick={() => setUnit?.('avgDiff')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
              unit === 'avgDiff'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            台平均
          </button>
          <button
            type="button"
            onClick={() => setUnit?.('payoutRate')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              unit === 'payoutRate'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Percent className="w-3 h-3" />
            出玉率(機械割)
          </button>
        </div>
      </div>

      {/* Chart Section */}
      <div className="p-5 border-b border-slate-100">
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={dowStats}
              margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="dow"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickFormatter={(val) => {
                  if (unit === 'yen') return `${(val / 10000).toFixed(0)}万`;
                  if (unit === 'coins') return `${val > 0 ? '+' : ''}${(val / 10000).toFixed(0)}万枚`;
                  if (unit === 'avgDiff') return `${val > 0 ? '+' : ''}${val}`;
                  return `${val}%`;
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
              <ReferenceLine yAxisId="left" y={unit === 'payoutRate' ? 100 : 0} stroke="#94a3b8" strokeDasharray="3 3" />
              
              <Bar
                yAxisId="left"
                dataKey={
                  unit === 'yen'
                    ? 'displayDailyProfit'
                    : unit === 'coins'
                    ? 'displayTotalCoins'
                    : unit === 'avgDiff'
                    ? 'displayDiffCoins'
                    : 'payoutRate'
                }
                radius={[4, 4, 0, 0]}
              >
                {dowStats.map((entry, index) => {
                  let fillColor = '#6366f1';
                  if (unit === 'yen') {
                    fillColor = entry.displayDailyProfit >= 0
                      ? isHall ? '#10b981' : '#3b82f6'
                      : '#f43f5e';
                  } else if (unit === 'coins') {
                    fillColor = entry.displayTotalCoins >= 0
                      ? isHall ? '#10b981' : '#3b82f6'
                      : '#f43f5e';
                  } else if (unit === 'avgDiff') {
                    fillColor = entry.displayDiffCoins > 0
                      ? isHall ? '#818cf8' : '#3b82f6'
                      : '#f43f5e';
                  } else {
                    fillColor = entry.payoutRate >= 100 ? '#10b981' : '#f43f5e';
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
      </div>

      {/* TOP 3 & ワースト 3 Ranking Section */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>
                {isHall
                  ? unit === 'yen'
                    ? '【ホール目線】曜日・祝日 粗利(円) TOP 3 ＆ ワースト 3'
                    : unit === 'coins'
                    ? '【ホール目線】曜日・祝日 店総差枚(枚) TOP 3 ＆ ワースト 3'
                    : unit === 'payoutRate'
                    ? '【ホール目線】曜日・祝日 出玉率(割) TOP 3 ＆ ワースト 3'
                    : '【ホール目線】曜日・祝日 店台平均差枚(枚) TOP 3 ＆ ワースト 3'
                  : unit === 'yen'
                    ? '【客目線】曜日・祝日 収支(円) TOP 3 ＆ ワースト 3'
                    : unit === 'coins'
                    ? '【客目線】曜日・祝日 客総差枚(枚) TOP 3 ＆ ワースト 3'
                    : unit === 'payoutRate'
                    ? '【客目線】曜日・祝日 出玉率(割) TOP 3 ＆ ワースト 3'
                    : '【客目線】曜日・祝日 出玉差枚(枚) TOP 3 ＆ ワースト 3'}
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Unit Switcher */}
            <div className="flex items-center bg-slate-200/90 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setUnit?.('yen')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  unit === 'yen'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                円表記
              </button>
              <button
                type="button"
                onClick={() => setUnit?.('coins')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                  unit === 'coins'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                枚数表記
              </button>
              <button
                type="button"
                onClick={() => setUnit?.('avgDiff')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  unit === 'avgDiff'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                台平均
              </button>
              <button
                type="button"
                onClick={() => setUnit?.('payoutRate')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                  unit === 'payoutRate'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                出玉率
              </button>
            </div>

            <span className="text-xs text-slate-500 hidden md:inline">
              {isHall
                ? unit === 'yen'
                  ? '※ ホール粗利の利益貢献度順（TOP）と還元順（ワースト）'
                  : unit === 'coins'
                  ? '※ 店側回収総差枚の高い順（TOP）と放出・客勝ち順（ワースト）'
                  : unit === 'payoutRate'
                  ? '※ 機械割の低い順（TOP:回収）と高い順（ワースト:還元）'
                  : '※ 店側回収差枚の高い順（TOP）と放出・客勝ち順（ワースト）'
                : unit === 'yen'
                ? '※ プレイヤー1日平均収支の高い順（TOP）と厳しい順（ワースト）'
                : unit === 'coins'
                ? '※ 客側獲得総差枚の高い順（TOP）と厳しい順（ワースト）'
                : unit === 'payoutRate'
                ? '※ 機械割の高い順（TOP）と厳しい順（ワースト）'
                : '※ プレイヤー平均差枚・還元傾向の高い順（TOP）と厳しい順（ワースト）'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* TOP 3 Card */}
          <div className="bg-white rounded-xl border border-emerald-200/90 shadow-xs overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50/60 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xs">
                  ★
                </span>
                <span className="text-xs font-bold text-emerald-950">
                  {isHall
                    ? unit === 'yen'
                      ? '利益貢献 TOP 3 (高粗利・回収曜日)'
                      : unit === 'coins'
                      ? '回収総差枚 TOP 3 (店差枚プラス曜日)'
                      : unit === 'payoutRate'
                      ? '回収機械割 TOP 3 (低出玉率・回収曜日)'
                      : '回収台平均差枚 TOP 3 (店差枚プラス曜日)'
                    : unit === 'yen'
                      ? '収支還元 TOP 3 (高収支・好待遇曜日)'
                      : unit === 'coins'
                      ? '総出玉還元 TOP 3 (客プラス総差枚曜日)'
                      : unit === 'payoutRate'
                      ? '高機械割 TOP 3 (出玉率上位曜日)'
                      : '出玉還元 TOP 3 (勝率・出玉上位曜日)'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                {isHall
                  ? unit === 'yen' ? '粗利高水準' : unit === 'coins' ? '回収総枚数高' : unit === 'payoutRate' ? '低割回収' : '店差枚高'
                  : unit === 'yen' ? '高収支待遇' : unit === 'coins' ? '総差枚上位' : unit === 'payoutRate' ? '高設定期待' : '還元・好待遇'}
              </span>
            </div>

            <div className="divide-y divide-slate-100 flex-1">
              {top3.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">データがありません</div>
              ) : (
                top3.map((item) => {
                  const rank = isHall ? item.rankHall : item.rankPlayer;
                  const rankBadgeStyle =
                    rank === 1
                      ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                      : rank === 2
                      ? 'bg-slate-200 text-slate-800 font-bold'
                      : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold';
                  const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';

                  return (
                    <div
                      key={`dow-top-${item.dow}`}
                      onClick={() => toggleExpand(item.dow)}
                      className="p-3 sm:px-4 hover:bg-emerald-50/30 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`px-2 py-0.5 rounded text-xs shrink-0 flex items-center gap-1 ${rankBadgeStyle}`}>
                          <span>{medalEmoji}</span>
                          <span>{rank}位</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              item.dow === '日' || item.isHoliday
                                ? 'bg-rose-100 text-rose-700'
                                : item.dow === '土'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {item.dow}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{item.label}</span>
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
                            {unit === 'yen'
                              ? isHall ? '1日平均粗利' : '1日平均客収支'
                              : unit === 'coins'
                              ? isHall ? '店総差枚' : '客総差枚'
                              : unit === 'payoutRate'
                              ? '出玉率 (機械割)'
                              : isHall ? '店平均差枚/台' : '客平均差枚/台'}
                          </div>
                          <div className={`text-sm font-black ${
                            unit === 'yen'
                              ? item.displayDailyProfit >= 0
                                ? isHall ? 'text-emerald-600' : 'text-blue-600'
                                : 'text-rose-600'
                              : unit === 'coins'
                              ? item.displayTotalCoins >= 0
                                ? isHall ? 'text-emerald-600' : 'text-blue-600'
                                : 'text-rose-600'
                              : unit === 'payoutRate'
                              ? item.payoutRate >= 100
                                ? isHall ? 'text-rose-600' : 'text-emerald-600'
                                : isHall ? 'text-emerald-600' : 'text-rose-600'
                              : item.displayDiffCoins > 0
                                ? isHall ? 'text-indigo-600' : 'text-blue-600'
                                : 'text-rose-600'
                          }`}>
                            {unit === 'yen'
                              ? formatYen(item.displayDailyProfit)
                              : unit === 'coins'
                              ? formatCoins(item.displayTotalCoins)
                              : unit === 'payoutRate'
                              ? `${item.payoutRate.toFixed(2)}%`
                              : `${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {unit === 'yen'
                              ? `${isHall ? '店差枚' : '客差枚'}: ${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`
                              : unit === 'coins'
                              ? `台平均: ${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`
                              : unit === 'payoutRate'
                              ? `台平均: ${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`
                              : `${isHall ? '粗利換算' : '収支換算'}: ${formatYen(item.displayDailyProfit)}`}
                          </div>
                        </div>

                        <div className="pl-3 border-l border-slate-200 text-left sm:text-right min-w-[70px]">
                          <div className="text-[10px] text-slate-400">出玉率 / 勝率</div>
                          <div className={`text-xs font-bold ${item.payoutRate >= 100 ? 'text-emerald-700' : 'text-slate-700'}`}>
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
                  {isHall
                    ? unit === 'yen'
                      ? '粗利 ワースト 3 (還元・赤字傾向)'
                      : unit === 'coins'
                      ? '店総差枚 ワースト 3 (客プラス・放出曜日)'
                      : unit === 'payoutRate'
                      ? '機械割 ワースト 3 (高出玉率・還元曜日)'
                      : '店差枚 ワースト 3 (客プラス・放出曜日)'
                    : unit === 'yen'
                      ? '収支 ワースト 3 (マイナス・回収曜日)'
                      : unit === 'coins'
                      ? '総差枚 ワースト 3 (マイナス・回収曜日)'
                      : unit === 'payoutRate'
                      ? '機械割 ワースト 3 (低出玉率・回収曜日)'
                      : '出玉 ワースト 3 (回収・低勝率曜日)'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-full">
                {isHall
                  ? unit === 'yen' ? '薄利・還元' : unit === 'coins' ? '放出総枚数多' : unit === 'payoutRate' ? '高割還元' : '放出・還元'
                  : unit === 'yen' ? '客マイナス大' : unit === 'coins' ? '回収総枚数多' : unit === 'payoutRate' ? '低割警戒' : '回収警戒曜日'}
              </span>
            </div>

            <div className="divide-y divide-slate-100 flex-1">
              {worst3.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">データがありません</div>
              ) : (
                worst3.map((item, idx) => {
                  const overallRank = isHall ? item.rankHall : item.rankPlayer;
                  const worstBadgeStyle =
                    idx === 0
                      ? 'bg-rose-500 text-white shadow-xs font-black'
                      : idx === 1
                      ? 'bg-rose-100 text-rose-800 border border-rose-200 font-bold'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 font-medium';

                  return (
                    <div
                      key={`dow-worst-${item.dow}`}
                      onClick={() => toggleExpand(item.dow)}
                      className="p-3 sm:px-4 hover:bg-rose-50/30 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`px-2 py-0.5 rounded text-xs shrink-0 flex flex-col items-center justify-center min-w-16 ${worstBadgeStyle}`}>
                          <span>ワースト{idx + 1}位</span>
                          <span className="text-[9px] opacity-80">({overallRank}位)</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              item.dow === '日' || item.isHoliday
                                ? 'bg-rose-100 text-rose-700'
                                : item.dow === '土'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {item.dow}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{item.label}</span>
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
                            {unit === 'yen'
                              ? isHall ? '1日平均粗利' : '1日平均客収支'
                              : unit === 'coins'
                              ? isHall ? '店総差枚' : '客総差枚'
                              : unit === 'payoutRate'
                              ? '出玉率 (機械割)'
                              : isHall ? '店平均差枚/台' : '客平均差枚/台'}
                          </div>
                          <div className={`text-sm font-black ${
                            unit === 'yen'
                              ? item.displayDailyProfit >= 0
                                ? isHall ? 'text-emerald-600' : 'text-blue-600'
                                : 'text-rose-600'
                              : unit === 'coins'
                              ? item.displayTotalCoins >= 0
                                ? isHall ? 'text-emerald-600' : 'text-blue-600'
                                : 'text-rose-600'
                              : unit === 'payoutRate'
                              ? item.payoutRate >= 100
                                ? isHall ? 'text-rose-600' : 'text-emerald-600'
                                : isHall ? 'text-emerald-600' : 'text-rose-600'
                              : item.displayDiffCoins > 0
                                ? isHall ? 'text-indigo-600' : 'text-blue-600'
                                : 'text-rose-600'
                          }`}>
                            {unit === 'yen'
                              ? formatYen(item.displayDailyProfit)
                              : unit === 'coins'
                              ? formatCoins(item.displayTotalCoins)
                              : unit === 'payoutRate'
                              ? `${item.payoutRate.toFixed(2)}%`
                              : `${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {unit === 'yen'
                              ? `${isHall ? '店差枚' : '客差枚'}: ${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`
                              : unit === 'coins'
                              ? `台平均: ${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`
                              : unit === 'payoutRate'
                              ? `台平均: ${item.displayDiffCoins > 0 ? '+' : ''}${item.displayDiffCoins}枚/台`
                              : `${isHall ? '粗利換算' : '収支換算'}: ${formatYen(item.displayDailyProfit)}`}
                          </div>
                        </div>

                        <div className="pl-3 border-l border-slate-200 text-left sm:text-right min-w-[70px]">
                          <div className="text-[10px] text-slate-400">出玉率 / 勝率</div>
                          <div className={`text-xs font-bold ${item.payoutRate >= 100 ? 'text-emerald-700' : 'text-slate-700'}`}>
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
      </div>

      {/* Detail Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left text-slate-700">
          <thead className="text-[11px] text-slate-500 bg-slate-50/80 uppercase border-b border-slate-200/80">
            <tr>
              <th className="px-3 py-3 font-bold text-center whitespace-nowrap">詳細展開</th>
              <th className="px-3 py-3 font-bold cursor-pointer hover:bg-slate-100 text-center" onClick={() => handleSort('rank')}>
                <div className="flex items-center justify-center gap-1">
                  <span>順位</span>
                  {sortField === 'rank' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 font-bold cursor-pointer hover:bg-slate-100" onClick={() => handleSort('dow')}>
                <div className="flex items-center gap-1">
                  <span>曜日</span>
                  {sortField === 'dow' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('avgDiffCoins')}>
                <div className="flex items-center justify-end gap-1">
                  <span>{isHall ? '店平均差枚' : '客平均差枚'}</span>
                  {sortField === 'avgDiffCoins' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('hallYen')}>
                <div className="flex items-center justify-end gap-1">
                  <span>{isHall ? '1日平均粗利' : '1日平均客収支'}</span>
                  {sortField === 'hallYen' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('avgGames')}>
                <div className="flex items-center justify-end gap-1">
                  <span>平均稼働G</span>
                  {sortField === 'avgGames' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('payoutRate')}>
                <div className="flex items-center justify-end gap-1">
                  <span>機械割</span>
                  {sortField === 'payoutRate' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('winRate')}>
                <div className="flex items-center justify-end gap-1">
                  <span>客勝率</span>
                  {sortField === 'winRate' && (
                    <span className="text-[10px] text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3 font-bold text-center">傾向判定</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedDows.map((d) => {
              const isExpanded = expandedDow === d.dow;
              const currentRank = isHall ? d.rankHall : d.rankPlayer;
              return (
                <React.Fragment key={`dow-row-${d.dow}`}>
                  <tr className={`hover:bg-slate-50/80 transition-colors ${d.isStoreEvent ? 'bg-amber-50/30 font-medium' : ''}`}>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleExpand(d.dow)}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          isExpanded ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title="該当営業日リストを表示"
                        aria-label="該当営業日リストを表示"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-bold text-center">
                      {d.count > 0 ? (
                        <span className={`inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full text-xs font-black ${
                          currentRank === 1
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-xs'
                            : currentRank === 2
                            ? 'bg-slate-100 text-slate-700 border border-slate-300'
                            : currentRank === 3
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'text-slate-600'
                        }`}>
                          {currentRank}位
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                          d.dow === '日' || d.isHoliday
                            ? 'bg-rose-100 text-rose-700'
                            : d.dow === '土'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {d.dow}
                        </span>
                        <span>{d.label}</span>
                        {d.isStoreEvent && (
                          <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded">
                            特日
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{d.count}日間</div>
                    </td>
                    <td className={`px-3 py-3 text-right font-extrabold ${d.displayDiffCoins > 0 ? (isHall ? 'text-indigo-600' : 'text-blue-600') : 'text-rose-600'}`}>
                      {d.displayDiffCoins > 0 ? `+${d.displayDiffCoins}` : d.displayDiffCoins}枚
                    </td>
                    <td className={`px-3 py-3 text-right font-extrabold ${d.displayDailyProfit >= 0 ? (isHall ? 'text-emerald-600' : 'text-blue-600') : 'text-rose-600'}`}>
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
                    <td className="px-3 py-3 text-center">
                      {getStatusBadge(d)}
                    </td>
                  </tr>

                  {/* Expanded Sub-Table */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="bg-slate-50 p-4">
                        <div className="text-xs font-bold text-slate-800 mb-2">
                          {d.label} の営業日一覧 ({d.records.length}日間)
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-[11px] text-left">
                            <thead className="bg-slate-100 text-slate-600 sticky top-0">
                              <tr>
                                <th className="px-3 py-1.5">日付</th>
                                <th className="px-2 py-1.5">曜日</th>
                                <th className="px-2 py-1.5 text-right">{isHall ? 'ホール差枚' : '客差枚'}</th>
                                <th className="px-2 py-1.5 text-right">{isHall ? 'ホール粗利' : '客収支'}</th>
                                <th className="px-2 py-1.5 text-right">稼働G数</th>
                                <th className="px-2 py-1.5 text-right">機械割</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {d.records.map((r) => (
                                <tr key={r.date} className="hover:bg-slate-50">
                                  <td className="px-3 py-1 font-mono font-bold text-slate-800">{r.date}</td>
                                  <td className="px-2 py-1 text-slate-600">{r.dayOfWeek}</td>
                                  <td className={`px-2 py-1 text-right font-bold ${
                                    isHall
                                      ? r.avgDiffCoins < 0 ? 'text-indigo-600' : 'text-rose-600'
                                      : r.avgDiffCoins > 0 ? 'text-blue-600' : 'text-rose-600'
                                  }`}>
                                    {isHall ? -r.avgDiffCoins : r.avgDiffCoins}枚
                                  </td>
                                  <td className="px-2 py-1 text-right font-bold text-slate-700">
                                    {formatYen(isHall ? (r.gModelHallProfit || 0) : (r.gModelPlayerProfit || 0))}
                                  </td>
                                  <td className="px-2 py-1 text-right text-slate-600">{formatNumber(r.avgGames)}G</td>
                                  <td className="px-2 py-1 text-right text-slate-600">{(r.payoutRate || 100).toFixed(2)}%</td>
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
        </table>
      </div>
    </div>
  );
};
