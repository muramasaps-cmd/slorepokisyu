import React, { useState, useMemo } from 'react';
import { DailyRecord, DailyMachineRecord, SpecialDayRules } from '../data/types';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { getJapaneseHoliday } from '../utils/holidayUtils';
import { UnitMode } from './Header';
import {
  Flame,
  CalendarDays,
  Grid3X3,
  Cpu,
  Hash,
  Sparkles,
  Info,
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertTriangle,
  RotateCcw,
  Target,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
} from 'lucide-react';

export type HeatmapViewMode = 'calendar' | 'machine_calendar' | 'dow_tail' | 'machine_tail' | 'model_tail';
export type HeatmapMetric = 'avgDiffCoins' | 'payoutRate' | 'profit' | 'avgGames' | 'winRate';

interface HeatmapAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  profitModel?: 'gCount' | 'diffOnly';
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
  onSelectMonth?: (yearMonth: string) => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_ORDER = ['月', '火', '水', '木', '金', '土', '日', '祝'];

const DATE_TAILS = [
  { id: 0, label: '0のつく日', short: '0日' },
  { id: 1, label: '1のつく日', short: '1日' },
  { id: 2, label: '2のつく日', short: '2日' },
  { id: 3, label: '3のつく日', short: '3日' },
  { id: 4, label: '4のつく日', short: '4日' },
  { id: 5, label: '5のつく日', short: '5日' },
  { id: 6, label: '6のつく日', short: '6日' },
  { id: 7, label: '7のつく日', short: '7日' },
  { id: 8, label: '8のつく日', short: '8日' },
  { id: 9, label: '9のつく日', short: '9日' },
  { id: 'zoro', label: 'ゾロ目日', short: 'ゾロ' },
] as const;

export const HeatmapAnalysis: React.FC<HeatmapAnalysisProps> = ({
  dailyRecords,
  perspective,
  profitModel = 'gCount',
  specialDayRules,
  oldEventDays = '',
  onSelectMonth,
}) => {
  const [viewMode, setViewMode] = useState<HeatmapViewMode>('calendar');
  const [metric, setMetric] = useState<HeatmapMetric>('avgDiffCoins');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Machine Calendar Specific State
  const [mcModelFilter, setMcModelFilter] = useState<string>('all');
  const [mcTailFilter, setMcTailFilter] = useState<string>('all');
  const [mcSearchQuery, setMcSearchQuery] = useState<string>('');
  const [mcSortField, setMcSortField] = useState<'num_asc' | 'num_desc' | 'diff_desc' | 'diff_asc' | 'win_desc' | 'games_desc'>('num_asc');
  const [mcHighlightConsecutive, setMcHighlightConsecutive] = useState<boolean>(false);
  const [mcMonthFilter, setMcMonthFilter] = useState<string>('all');

  const [hoveredCellInfo, setHoveredCellInfo] = useState<{
    title: string;
    subtitle?: string;
    stats: Array<{ label: string; value: string; highlight?: boolean }>;
    note?: string;
  } | null>(null);

  const isHall = perspective === 'hall';

  // Available years from records
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    dailyRecords.forEach((r) => {
      if (r.year) set.add(String(r.year));
      else if (r.date) set.add(r.date.split('-')[0]);
    });
    return Array.from(set).sort().reverse();
  }, [dailyRecords]);

  // Filter daily records by selected year for calendar view
  const calendarFilteredRecords = useMemo(() => {
    if (selectedYear === 'all') return dailyRecords;
    return dailyRecords.filter((r) => {
      const y = r.year ? String(r.year) : r.date.split('-')[0];
      return y === selectedYear;
    });
  }, [dailyRecords, selectedYear]);

  // Check if a date tail is designated as an event tail
  const isTargetEventTail = (tail: number | 'zoro'): boolean => {
    if (tail === 'zoro') {
      if (specialDayRules?.doubleDigits || specialDayRules?.monthDayZoro) return true;
      if (oldEventDays && (oldEventDays.includes('ゾロ目') || oldEventDays.includes('ゾロ'))) {
        return true;
      }
      return false;
    }
    if (specialDayRules?.tails && specialDayRules.tails.includes(tail)) return true;
    if (oldEventDays && oldEventDays.includes(`${tail}のつく日`)) return true;
    return false;
  };

  // Check whether a daily record is a zoro-me date (11, 22 or month === day)
  const isZoroDate = (r: DailyRecord): boolean => {
    if (r.day === 11 || r.day === 22) return true;
    if (r.month === r.day) return true;
    return false;
  };

  // Determine effective day-of-week category (Monday-Sunday, or '祝' for public holidays)
  const getRecordDowCategory = (r: DailyRecord): string => {
    const hol = getJapaneseHoliday(r.date);
    if (hol.isHoliday) return '祝';
    return r.dayOfWeek || '月';
  };

  // Helper to extract numeric value of chosen metric from a daily record
  const getRecordMetricValue = (r: DailyRecord, m: HeatmapMetric): number => {
    switch (m) {
      case 'avgDiffCoins':
        return r.avgDiffCoins || 0;
      case 'payoutRate':
        return r.payoutRate || 100;
      case 'profit': {
        const rawProfit = profitModel === 'gCount' ? r.gModelHallProfit : r.hallYenProfit;
        return isHall ? rawProfit : -rawProfit;
      }
      case 'avgGames':
        return r.avgGames || 0;
      case 'winRate':
        return r.winRate || 0;
    }
  };

  // Compute metric display label and formatted value
  const formatMetricValue = (val: number, m: HeatmapMetric, compact = false): string => {
    switch (m) {
      case 'avgDiffCoins': {
        const sign = val > 0 ? '+' : '';
        if (compact) {
          return `${sign}${Math.round(val)}`;
        }
        return `${sign}${Math.round(val).toLocaleString()}枚`;
      }
      case 'payoutRate':
        return `${val.toFixed(1)}%`;
      case 'profit':
        return formatYen(val);
      case 'avgGames':
        return `${Math.round(val).toLocaleString()}G`;
      case 'winRate':
        return `${val.toFixed(1)}%`;
    }
  };

  // Universal Color Intensity Resolver based on metric and value
  const getColorClass = (
    val: number | null,
    m: HeatmapMetric,
  ): string => {
    if (val === null || isNaN(val)) {
      return 'bg-slate-100 text-slate-400 border-slate-200/60';
    }

    if (m === 'avgDiffCoins') {
      if (!isHall) {
        if (val >= 300) return 'bg-emerald-500 text-white font-black shadow-xs';
        if (val >= 150) return 'bg-emerald-400 text-emerald-950 font-bold';
        if (val > 20) return 'bg-emerald-200 text-emerald-900 font-semibold';
        if (val >= -20) return 'bg-slate-100 text-slate-700 font-medium';
        if (val > -150) return 'bg-rose-100 text-rose-800 font-medium';
        if (val > -300) return 'bg-rose-200 text-rose-900 font-bold';
        return 'bg-rose-500 text-white font-black shadow-xs';
      } else {
        if (val <= -300) return 'bg-amber-500 text-slate-950 font-black shadow-xs';
        if (val <= -150) return 'bg-amber-300 text-amber-950 font-bold';
        if (val < -20) return 'bg-amber-100 text-amber-900 font-semibold';
        if (val <= 20) return 'bg-slate-100 text-slate-700 font-medium';
        if (val < 150) return 'bg-cyan-100 text-cyan-900 font-medium';
        if (val < 300) return 'bg-cyan-300 text-cyan-950 font-bold';
        return 'bg-blue-600 text-white font-black shadow-xs';
      }
    }

    if (m === 'payoutRate') {
      const delta = val - 100;
      if (!isHall) {
        if (delta >= 3.0) return 'bg-emerald-500 text-white font-black shadow-xs';
        if (delta >= 1.5) return 'bg-emerald-300 text-emerald-950 font-bold';
        if (delta > 0.2) return 'bg-emerald-100 text-emerald-900 font-semibold';
        if (delta >= -0.2) return 'bg-slate-100 text-slate-700 font-medium';
        if (delta > -1.5) return 'bg-rose-100 text-rose-800 font-medium';
        if (delta > -3.0) return 'bg-rose-200 text-rose-900 font-bold';
        return 'bg-rose-500 text-white font-black shadow-xs';
      } else {
        if (delta <= -3.0) return 'bg-amber-500 text-slate-950 font-black shadow-xs';
        if (delta <= -1.5) return 'bg-amber-300 text-amber-950 font-bold';
        if (delta < -0.2) return 'bg-amber-100 text-amber-900 font-semibold';
        if (delta <= 0.2) return 'bg-slate-100 text-slate-700 font-medium';
        if (delta < 1.5) return 'bg-cyan-100 text-cyan-900 font-medium';
        if (delta < 3.0) return 'bg-cyan-300 text-cyan-950 font-bold';
        return 'bg-blue-600 text-white font-black shadow-xs';
      }
    }

    if (m === 'profit') {
      if (val > 1_000_000) return isHall ? 'bg-amber-500 text-slate-950 font-black' : 'bg-emerald-500 text-white font-black';
      if (val > 300_000) return isHall ? 'bg-amber-300 text-amber-950 font-bold' : 'bg-emerald-300 text-emerald-950 font-bold';
      if (val > 50_000) return isHall ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
      if (val >= -50_000) return 'bg-slate-100 text-slate-700';
      if (val > -300_000) return isHall ? 'bg-cyan-100 text-cyan-900' : 'bg-rose-100 text-rose-800';
      if (val > -1_000_000) return isHall ? 'bg-cyan-300 text-cyan-950 font-bold' : 'bg-rose-200 text-rose-900 font-bold';
      return isHall ? 'bg-blue-600 text-white font-black' : 'bg-rose-500 text-white font-black';
    }

    if (m === 'avgGames') {
      if (val >= 6000) return 'bg-indigo-600 text-white font-black shadow-xs';
      if (val >= 5000) return 'bg-indigo-400 text-white font-bold';
      if (val >= 4000) return 'bg-indigo-200 text-indigo-950 font-semibold';
      if (val >= 3000) return 'bg-indigo-100 text-indigo-900';
      if (val >= 2000) return 'bg-slate-100 text-slate-700';
      return 'bg-slate-50 text-slate-500';
    }

    if (m === 'winRate') {
      if (val >= 50) return 'bg-emerald-500 text-white font-black shadow-xs';
      if (val >= 45) return 'bg-emerald-300 text-emerald-950 font-bold';
      if (val >= 40) return 'bg-emerald-100 text-emerald-900';
      if (val >= 35) return 'bg-slate-100 text-slate-700';
      if (val >= 30) return 'bg-rose-100 text-rose-800';
      return 'bg-rose-300 text-rose-950 font-bold';
    }

    return 'bg-slate-100 text-slate-700';
  };

  // Color Intensity Resolver specifically for Individual Machine Diff Coins
  const getMachineCellColorClass = (
    mRecord?: DailyMachineRecord,
    mType: HeatmapMetric = 'avgDiffCoins'
  ): string => {
    if (!mRecord) {
      return 'bg-slate-50/60 text-slate-300 border-slate-100';
    }

    if (mType === 'avgGames') {
      const g = mRecord.games || 0;
      if (g >= 7000) return 'bg-indigo-600 text-white font-black';
      if (g >= 5500) return 'bg-indigo-400 text-white font-bold';
      if (g >= 4000) return 'bg-indigo-200 text-indigo-950 font-semibold';
      if (g >= 2500) return 'bg-indigo-100 text-indigo-900';
      return 'bg-slate-100 text-slate-600';
    }

    if (mType === 'payoutRate') {
      const inCoins = (mRecord.games || 0) * 3;
      const outCoins = inCoins + (mRecord.diff || 0);
      const pr = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;
      return getColorClass(pr, 'payoutRate');
    }

    // Default: Machine Diff Coins
    const diff = mRecord.diff || 0;
    if (!isHall) {
      if (diff >= 3000) return 'bg-emerald-600 text-white font-black shadow-xs';
      if (diff >= 1500) return 'bg-emerald-500 text-white font-bold';
      if (diff >= 500) return 'bg-emerald-300 text-emerald-950 font-semibold';
      if (diff > 0) return 'bg-emerald-100 text-emerald-900';
      if (diff === 0) return 'bg-slate-100 text-slate-700';
      if (diff > -1000) return 'bg-rose-100 text-rose-800';
      if (diff > -2500) return 'bg-rose-200 text-rose-900 font-bold';
      return 'bg-rose-500 text-white font-black shadow-xs';
    } else {
      if (diff <= -3000) return 'bg-amber-600 text-slate-950 font-black shadow-xs';
      if (diff <= -1500) return 'bg-amber-400 text-slate-950 font-bold';
      if (diff <= -500) return 'bg-amber-200 text-amber-950 font-semibold';
      if (diff < 0) return 'bg-amber-100 text-amber-900';
      if (diff === 0) return 'bg-slate-100 text-slate-700';
      if (diff < 1000) return 'bg-cyan-100 text-cyan-900';
      if (diff < 2500) return 'bg-cyan-200 text-cyan-950 font-bold';
      return 'bg-blue-600 text-white font-black shadow-xs';
    }
  };

  // ==========================================
  // VIEW 1: CALENDAR VIEW DATA STRUCTURE
  // ==========================================
  const calendarMonths = useMemo(() => {
    const map = new Map<string, { year: number; month: number; days: Map<number, DailyRecord> }>();
    calendarFilteredRecords.forEach((r) => {
      const ym = r.yearMonth;
      if (!map.has(ym)) {
        map.set(ym, {
          year: r.year || parseInt(r.date.split('-')[0], 10),
          month: r.month || parseInt(r.date.split('-')[1], 10),
          days: new Map(),
        });
      }
      map.get(ym)!.days.set(r.day, r);
    });

    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([yearMonth, data]) => {
        const daysInMonth = new Date(data.year, data.month, 0).getDate();
        const recordsList = Array.from(data.days.values());
        const totalMachinesSum = recordsList.reduce((acc, cur) => acc + (cur.totalMachines || 0), 0);
        const totalDiffCoinsSum = recordsList.reduce((acc, cur) => acc + (cur.totalDiffCoins || 0), 0);
        const totalInCoinsSum = recordsList.reduce((acc, cur) => acc + (cur.inCoins || 0), 0);
        const totalOutCoinsSum = recordsList.reduce((acc, cur) => acc + (cur.outCoins || 0), 0);
        const avgDiff = totalMachinesSum > 0 ? totalDiffCoinsSum / totalMachinesSum : 0;
        const avgPayout = totalInCoinsSum > 0 ? (totalOutCoinsSum / totalInCoinsSum) * 100 : 100;
        const monthProfit = recordsList.reduce((acc, cur) => {
          const raw = profitModel === 'gCount' ? cur.gModelHallProfit : cur.hallYenProfit;
          return acc + (isHall ? raw : -raw);
        }, 0);

        return {
          yearMonth,
          year: data.year,
          month: data.month,
          daysInMonth,
          daysMap: data.days,
          recordCount: recordsList.length,
          avgDiff,
          avgPayout,
          monthProfit,
        };
      });
  }, [calendarFilteredRecords, profitModel, isHall]);

  // ==========================================
  // VIEW: MACHINE NUMBER x DATE CALENDAR
  // ==========================================
  const machineCalendarData = useMemo(() => {
    // 1. Gather all dates that have machine data
    const validDailyRecords = dailyRecords
      .filter((r) => r.machines && r.machines.length > 0)
      .filter((r) => {
        if (mcMonthFilter === 'all') return true;
        return r.yearMonth === mcMonthFilter;
      })
      .sort((a, b) => a.date.localeCompare(b.date)); // Chronological

    if (validDailyRecords.length === 0) {
      return null;
    }

    // 2. Map of all unique machine numbers across these dates
    type MachineAggregate = {
      machineNum: number;
      modelName: string;
      tailDigit: number;
      isZoro: boolean;
      recordsByDate: Map<string, DailyMachineRecord>;
      totalDiff: number;
      totalGames: number;
      winDays: number;
      lossDays: number;
      recordedDays: number;
      avgDiff: number;
      winRate: number;
      payoutRate: number;
      maxConsecutiveWins: number;
      hasConsecutiveWin: boolean;
    };

    const machinesMap = new Map<number, MachineAggregate>();

    validDailyRecords.forEach((dr) => {
      dr.machines?.forEach((m) => {
        let entry = machinesMap.get(m.machineNum);
        if (!entry) {
          const isZoro = m.isZoro || (m.machineNum >= 11 && String(m.machineNum).split('').every((c, _, arr) => c === arr[0]));
          entry = {
            machineNum: m.machineNum,
            modelName: m.modelName,
            tailDigit: m.machineNum % 10,
            isZoro,
            recordsByDate: new Map(),
            totalDiff: 0,
            totalGames: 0,
            winDays: 0,
            lossDays: 0,
            recordedDays: 0,
            avgDiff: 0,
            winRate: 0,
            payoutRate: 100,
            maxConsecutiveWins: 0,
            hasConsecutiveWin: false,
          };
          machinesMap.set(m.machineNum, entry);
        }

        entry.recordsByDate.set(dr.date, m);
        entry.totalDiff += m.diff || 0;
        entry.totalGames += m.games || 0;
        if ((m.diff || 0) > 0) entry.winDays++;
        else if ((m.diff || 0) < 0) entry.lossDays++;
        entry.recordedDays++;
      });
    });

    // 3. Compute stats & consecutive wins streak for each machine
    const allMachinesList = Array.from(machinesMap.values());
    allMachinesList.forEach((m) => {
      m.avgDiff = m.recordedDays > 0 ? m.totalDiff / m.recordedDays : 0;
      m.winRate = m.recordedDays > 0 ? (m.winDays / m.recordedDays) * 100 : 0;
      const inCoins = m.totalGames * 3;
      m.payoutRate = inCoins > 0 ? ((inCoins + m.totalDiff) / inCoins) * 100 : 100;

      // Calculate consecutive winning streak across chronological dates
      let currentStreak = 0;
      let maxStreak = 0;
      validDailyRecords.forEach((dr) => {
        const record = m.recordsByDate.get(dr.date);
        if (record && record.diff > 0) {
          currentStreak++;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
          currentStreak = 0;
        }
      });
      m.maxConsecutiveWins = maxStreak;
      m.hasConsecutiveWin = maxStreak >= 2;
    });

    // 4. Extract unique models for the model filter dropdown (with machine counts)
    const modelCountsMap = new Map<string, number>();
    allMachinesList.forEach((m) => {
      modelCountsMap.set(m.modelName, (modelCountsMap.get(m.modelName) || 0) + 1);
    });
    const availableModels = Array.from(modelCountsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // 5. Extract available months
    const availableMonths = Array.from(new Set(validDailyRecords.map((r) => r.yearMonth))).sort().reverse();

    // 6. Filter machines based on user controls
    let filteredMachines = allMachinesList.filter((m) => {
      if (mcModelFilter !== 'all' && m.modelName !== mcModelFilter) {
        return false;
      }
      if (mcTailFilter !== 'all') {
        if (mcTailFilter === 'zoro') {
          if (!m.isZoro) return false;
        } else {
          if (m.tailDigit !== parseInt(mcTailFilter, 10)) return false;
        }
      }
      if (mcSearchQuery.trim()) {
        const q = mcSearchQuery.trim().toLowerCase();
        const matchesNum = String(m.machineNum).includes(q);
        const matchesModel = m.modelName.toLowerCase().includes(q);
        if (!matchesNum && !matchesModel) return false;
      }
      if (mcHighlightConsecutive && !m.hasConsecutiveWin) {
        return false;
      }
      return true;
    });

    // 7. Sort machines
    filteredMachines.sort((a, b) => {
      switch (mcSortField) {
        case 'num_asc':
          return a.machineNum - b.machineNum;
        case 'num_desc':
          return b.machineNum - a.machineNum;
        case 'diff_desc':
          return b.totalDiff - a.totalDiff;
        case 'diff_asc':
          return a.totalDiff - b.totalDiff;
        case 'win_desc':
          return b.winRate - a.winRate || b.totalDiff - a.totalDiff;
        case 'games_desc':
          return b.totalGames - a.totalGames;
      }
    });

    // 8. Compute Daily Column Totals across all visible filtered machines
    const dailyColumnTotals = validDailyRecords.map((dr) => {
      let totalDiff = 0;
      let totalGames = 0;
      let machineCount = 0;
      let winCount = 0;

      filteredMachines.forEach((m) => {
        const rec = m.recordsByDate.get(dr.date);
        if (rec) {
          totalDiff += rec.diff || 0;
          totalGames += rec.games || 0;
          machineCount++;
          if ((rec.diff || 0) > 0) winCount++;
        }
      });

      const avgDiff = machineCount > 0 ? totalDiff / machineCount : 0;
      const inCoins = totalGames * 3;
      const payout = inCoins > 0 ? ((inCoins + totalDiff) / inCoins) * 100 : 100;

      return {
        date: dr.date,
        day: dr.day,
        month: dr.month,
        dayOfWeek: dr.dayOfWeek,
        isEvent: dr.isOldEventDay || dr.is7Day || isZoroDate(dr),
        machineCount,
        totalDiff,
        avgDiff,
        payout,
        winCount,
        winRate: machineCount > 0 ? (winCount / machineCount) * 100 : 0,
      };
    });

    return {
      validDailyRecords,
      filteredMachines,
      allMachinesCount: allMachinesList.length,
      availableModels,
      availableMonths,
      dailyColumnTotals,
    };
  }, [
    dailyRecords,
    mcMonthFilter,
    mcModelFilter,
    mcTailFilter,
    mcSearchQuery,
    mcHighlightConsecutive,
    mcSortField,
  ]);

  // ==========================================
  // VIEW 2: DOW x DATE TAIL CROSS MATRIX
  // ==========================================
  const dowTailMatrix = useMemo(() => {
    type CellData = {
      records: DailyRecord[];
      count: number;
      avgDiffCoins: number;
      payoutRate: number;
      profit: number;
      avgGames: number;
      winRate: number;
    };

    const matrix: Record<string, Record<string | number, CellData>> = {};

    DOW_ORDER.forEach((dow) => {
      matrix[dow] = {};
      DATE_TAILS.forEach((tail) => {
        matrix[dow][tail.id] = {
          records: [],
          count: 0,
          avgDiffCoins: 0,
          payoutRate: 100,
          profit: 0,
          avgGames: 0,
          winRate: 0,
        };
      });
    });

    dailyRecords.forEach((r) => {
      const dow = getRecordDowCategory(r);
      const isZoro = isZoroDate(r);
      const digitTail = r.day % 10;

      if (matrix[dow] && matrix[dow][digitTail]) {
        matrix[dow][digitTail].records.push(r);
      }
      if (isZoro && matrix[dow] && matrix[dow]['zoro']) {
        matrix[dow]['zoro'].records.push(r);
      }
    });

    DOW_ORDER.forEach((dow) => {
      DATE_TAILS.forEach((tail) => {
        const cell = matrix[dow][tail.id];
        const recs = cell.records;
        cell.count = recs.length;
        if (recs.length > 0) {
          const totalMach = recs.reduce((acc, c) => acc + (c.totalMachines || 0), 0);
          const totalDiff = recs.reduce((acc, c) => acc + (c.totalDiffCoins || 0), 0);
          const totalIn = recs.reduce((acc, c) => acc + (c.inCoins || 0), 0);
          const totalOut = recs.reduce((acc, c) => acc + (c.outCoins || 0), 0);
          const totalGames = recs.reduce((acc, c) => acc + (c.avgGames || 0), 0);
          const totalProf = recs.reduce((acc, c) => {
            const raw = profitModel === 'gCount' ? c.gModelHallProfit : c.hallYenProfit;
            return acc + (isHall ? raw : -raw);
          }, 0);
          const winRatesSum = recs.filter((c) => c.winRate !== null).reduce((acc, c) => acc + (c.winRate || 0), 0);
          const winRatesCount = recs.filter((c) => c.winRate !== null).length;

          cell.avgDiffCoins = totalMach > 0 ? totalDiff / totalMach : 0;
          cell.payoutRate = totalIn > 0 ? (totalOut / totalIn) * 100 : 100;
          cell.profit = totalProf / recs.length;
          cell.avgGames = totalGames / recs.length;
          cell.winRate = winRatesCount > 0 ? winRatesSum / winRatesCount : 0;
        }
      });
    });

    const dowSummary: Record<string, { count: number; avgDiffCoins: number; payoutRate: number; profit: number; avgGames: number }> = {};
    DOW_ORDER.forEach((dow) => {
      const allRecs = dailyRecords.filter((r) => getRecordDowCategory(r) === dow);
      const totalMach = allRecs.reduce((acc, c) => acc + (c.totalMachines || 0), 0);
      const totalDiff = allRecs.reduce((acc, c) => acc + (c.totalDiffCoins || 0), 0);
      const totalIn = allRecs.reduce((acc, c) => acc + (c.inCoins || 0), 0);
      const totalOut = allRecs.reduce((acc, c) => acc + (c.outCoins || 0), 0);
      const totalProf = allRecs.reduce((acc, c) => {
        const raw = profitModel === 'gCount' ? c.gModelHallProfit : c.hallYenProfit;
        return acc + (isHall ? raw : -raw);
      }, 0);
      const totalGames = allRecs.reduce((acc, c) => acc + (c.avgGames || 0), 0);

      dowSummary[dow] = {
        count: allRecs.length,
        avgDiffCoins: totalMach > 0 ? totalDiff / totalMach : 0,
        payoutRate: totalIn > 0 ? (totalOut / totalIn) * 100 : 100,
        profit: allRecs.length > 0 ? totalProf / allRecs.length : 0,
        avgGames: allRecs.length > 0 ? totalGames / allRecs.length : 0,
      };
    });

    const tailSummary: Record<string | number, { count: number; avgDiffCoins: number; payoutRate: number; profit: number; avgGames: number }> = {};
    DATE_TAILS.forEach((tail) => {
      const allRecs = dailyRecords.filter((r) => {
        if (tail.id === 'zoro') return isZoroDate(r);
        return r.day % 10 === tail.id;
      });
      const totalMach = allRecs.reduce((acc, c) => acc + (c.totalMachines || 0), 0);
      const totalDiff = allRecs.reduce((acc, c) => acc + (c.totalDiffCoins || 0), 0);
      const totalIn = allRecs.reduce((acc, c) => acc + (c.inCoins || 0), 0);
      const totalOut = allRecs.reduce((acc, c) => acc + (c.outCoins || 0), 0);
      const totalProf = allRecs.reduce((acc, c) => {
        const raw = profitModel === 'gCount' ? c.gModelHallProfit : c.hallYenProfit;
        return acc + (isHall ? raw : -raw);
      }, 0);
      const totalGames = allRecs.reduce((acc, c) => acc + (c.avgGames || 0), 0);

      tailSummary[tail.id] = {
        count: allRecs.length,
        avgDiffCoins: totalMach > 0 ? totalDiff / totalMach : 0,
        payoutRate: totalIn > 0 ? (totalOut / totalIn) * 100 : 100,
        profit: allRecs.length > 0 ? totalProf / allRecs.length : 0,
        avgGames: allRecs.length > 0 ? totalGames / allRecs.length : 0,
      };
    });

    return { matrix, dowSummary, tailSummary };
  }, [dailyRecords, profitModel, isHall]);

  // ==========================================
  // VIEW 3: MACHINE TAIL x DATE TAIL CROSS MATRIX
  // ==========================================
  const machineTailMatrix = useMemo(() => {
    const hasMachines = dailyRecords.some((r) => r.machines && r.machines.length > 0);
    if (!hasMachines) return null;

    const MACHINE_TAILS = [
      { id: 0, label: '台番末尾 0' },
      { id: 1, label: '台番末尾 1' },
      { id: 2, label: '台番末尾 2' },
      { id: 3, label: '台番末尾 3' },
      { id: 4, label: '台番末尾 4' },
      { id: 5, label: '台番末尾 5' },
      { id: 6, label: '台番末尾 6' },
      { id: 7, label: '台番末尾 7' },
      { id: 8, label: '台番末尾 8' },
      { id: 9, label: '台番末尾 9' },
      { id: 'zoro', label: 'ゾロ目台番' },
    ];

    type MTCell = {
      machineCount: number;
      totalDiff: number;
      totalGames: number;
      avgDiffCoins: number;
      payoutRate: number;
    };

    const matrix: Record<string | number, Record<string | number, MTCell>> = {};
    MACHINE_TAILS.forEach((mt) => {
      matrix[mt.id] = {};
      DATE_TAILS.forEach((dt) => {
        matrix[mt.id][dt.id] = {
          machineCount: 0,
          totalDiff: 0,
          totalGames: 0,
          avgDiffCoins: 0,
          payoutRate: 100,
        };
      });
    });

    dailyRecords.forEach((r) => {
      if (!r.machines || r.machines.length === 0) return;
      const isDateZoro = isZoroDate(r);
      const dateDigitTail = r.day % 10;

      r.machines.forEach((m) => {
        const mDigitTail = m.machineNum % 10;
        const isMachineZoro = m.isZoro || (m.machineNum >= 11 && String(m.machineNum).split('').every((c, _, arr) => c === arr[0]));

        const targetDateTails: (number | 'zoro')[] = [dateDigitTail];
        if (isDateZoro) targetDateTails.push('zoro');

        const targetMachineTails: (number | 'zoro')[] = [mDigitTail];
        if (isMachineZoro) targetMachineTails.push('zoro');

        targetMachineTails.forEach((mtId) => {
          targetDateTails.forEach((dtId) => {
            if (matrix[mtId] && matrix[mtId][dtId]) {
              const cell = matrix[mtId][dtId];
              cell.machineCount++;
              cell.totalDiff += m.diff || 0;
              cell.totalGames += m.games || 0;
            }
          });
        });
      });
    });

    MACHINE_TAILS.forEach((mt) => {
      DATE_TAILS.forEach((dt) => {
        const cell = matrix[mt.id][dt.id];
        if (cell.machineCount > 0) {
          cell.avgDiffCoins = cell.totalDiff / cell.machineCount;
          const inCoins = cell.totalGames * 3;
          const outCoins = inCoins + cell.totalDiff;
          cell.payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;
        }
      });
    });

    return { matrix, machineTails: MACHINE_TAILS };
  }, [dailyRecords]);

  // ==========================================
  // VIEW 4: TOP MODELS x DATE TAIL CROSS MATRIX
  // ==========================================
  const modelTailMatrix = useMemo(() => {
    const modelStatsMap = new Map<string, { totalMachines: number; count: number }>();
    dailyRecords.forEach((r) => {
      if (!r.models) return;
      r.models.forEach((m) => {
        const curr = modelStatsMap.get(m.modelName) || { totalMachines: 0, count: 0 };
        curr.totalMachines += m.totalMachines || 0;
        curr.count++;
        modelStatsMap.set(m.modelName, curr);
      });
    });

    const topModels = Array.from(modelStatsMap.entries())
      .sort((a, b) => b[1].totalMachines - a[1].totalMachines)
      .slice(0, 12)
      .map(([name]) => name);

    if (topModels.length === 0) return null;

    type ModelCell = {
      sampleCount: number;
      totalMachines: number;
      totalDiff: number;
      totalGames: number;
      avgDiffCoins: number;
      payoutRate: number;
    };

    const matrix: Record<string, Record<string | number, ModelCell>> = {};
    topModels.forEach((model) => {
      matrix[model] = {};
      DATE_TAILS.forEach((tail) => {
        matrix[model][tail.id] = {
          sampleCount: 0,
          totalMachines: 0,
          totalDiff: 0,
          totalGames: 0,
          avgDiffCoins: 0,
          payoutRate: 100,
        };
      });
    });

    dailyRecords.forEach((r) => {
      if (!r.models) return;
      const isDateZoro = isZoroDate(r);
      const dateDigitTail = r.day % 10;

      r.models.forEach((m) => {
        if (!matrix[m.modelName]) return;
        const targetDateTails: (number | 'zoro')[] = [dateDigitTail];
        if (isDateZoro) targetDateTails.push('zoro');

        targetDateTails.forEach((dtId) => {
          const cell = matrix[m.modelName][dtId];
          cell.sampleCount++;
          cell.totalMachines += m.totalMachines || 0;
          cell.totalDiff += m.totalDiffCoins || 0;
          cell.totalGames += (m.avgGames || 0) * (m.totalMachines || 0);
        });
      });
    });

    topModels.forEach((model) => {
      DATE_TAILS.forEach((tail) => {
        const cell = matrix[model][tail.id];
        if (cell.totalMachines > 0) {
          cell.avgDiffCoins = cell.totalDiff / cell.totalMachines;
          const inCoins = cell.totalGames * 3;
          const outCoins = inCoins + cell.totalDiff;
          cell.payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;
        }
      });
    });

    return { matrix, topModels };
  }, [dailyRecords]);

  // ==========================================
  // TOP KEY INSIGHTS (Highlight Cards)
  // ==========================================
  const keyHighlights = useMemo(() => {
    if (dailyRecords.length === 0) return null;

    let bestSpot: { label: string; avgDiff: number; payout: number; count: number } | null = null;
    let worstSpot: { label: string; avgDiff: number; payout: number; count: number } | null = null;
    let busiestSpot: { label: string; games: number; count: number } | null = null;

    DOW_ORDER.forEach((dow) => {
      DATE_TAILS.forEach((tail) => {
        const cell = dowTailMatrix.matrix[dow][tail.id];
        if (cell.count >= 1) {
          const label = `${dow}曜 × ${tail.label}`;
          if (!bestSpot || cell.avgDiffCoins > bestSpot.avgDiff) {
            bestSpot = { label, avgDiff: cell.avgDiffCoins, payout: cell.payoutRate, count: cell.count };
          }
          if (!worstSpot || cell.avgDiffCoins < worstSpot.avgDiff) {
            worstSpot = { label, avgDiff: cell.avgDiffCoins, payout: cell.payoutRate, count: cell.count };
          }
          if (!busiestSpot || cell.avgGames > busiestSpot.games) {
            busiestSpot = { label, games: cell.avgGames, count: cell.count };
          }
        }
      });
    });

    let tailMatchDiff = 0;
    let tailMatchCount = 0;
    let tailOtherDiff = 0;
    let tailOtherCount = 0;

    if (machineTailMatrix) {
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((num) => {
        const matchCell = machineTailMatrix.matrix[num][num];
        if (matchCell && matchCell.machineCount > 0) {
          tailMatchDiff += matchCell.totalDiff;
          tailMatchCount += matchCell.machineCount;
        }
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((otherNum) => {
          if (otherNum !== num) {
            const otherCell = machineTailMatrix.matrix[num][otherNum];
            if (otherCell && otherCell.machineCount > 0) {
              tailOtherDiff += otherCell.totalDiff;
              tailOtherCount += otherCell.machineCount;
            }
          }
        });
      });
    }

    const tailMatchAvg = tailMatchCount > 0 ? tailMatchDiff / tailMatchCount : 0;
    const tailOtherAvg = tailOtherCount > 0 ? tailOtherDiff / tailOtherCount : 0;
    const hasTailAdvantage = tailMatchCount > 0 && tailMatchAvg - tailOtherAvg > 50;

    return {
      bestSpot,
      worstSpot,
      busiestSpot,
      tailMatchAvg,
      tailOtherAvg,
      hasTailAdvantage,
      hasMachineData: !!machineTailMatrix,
    };
  }, [dailyRecords, dowTailMatrix, machineTailMatrix]);

  if (dailyRecords.length === 0) {
    return null;
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-5">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shadow-2xs shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              総合出玉・粗利ヒートマップ分析
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            全{dailyRecords.length}営業日分のデータをカレンダー・台番号別・曜日×特日・末尾・主要機種ごとに色彩マッピング
          </p>
        </div>

        {/* View Mode Tabs (Segmented control) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start md:self-auto overflow-x-auto max-w-full">
          {/* Tab 1: Month Calendar */}
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'calendar'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>月別・日付カレンダー</span>
          </button>

          {/* Tab 2: Machine Number x Date Calendar (NEW) */}
          <button
            type="button"
            onClick={() => setViewMode('machine_calendar')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'machine_calendar'
                ? 'bg-amber-400 text-slate-950 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-slate-950" />
            <span>台番 × 日付カレンダー</span>
          </button>

          {/* Tab 3: DOW x Date Tail */}
          <button
            type="button"
            onClick={() => setViewMode('dow_tail')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'dow_tail'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>曜日 × 日付末尾</span>
          </button>

          {/* Tab 4: Machine Tail x Date Tail */}
          {machineTailMatrix && (
            <button
              type="button"
              onClick={() => setViewMode('machine_tail')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                viewMode === 'machine_tail'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>台番末尾 × 日付末尾</span>
            </button>
          )}

          {/* Tab 5: Model x Date Tail */}
          {modelTailMatrix && (
            <button
              type="button"
              onClick={() => setViewMode('model_tail')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                viewMode === 'model_tail'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>主要機種 × 日付末尾</span>
            </button>
          )}
        </div>
      </div>

      {/* Control bar: Metric Switcher, Year Filter, Color Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 text-xs">
        {/* Metric Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-500 font-semibold whitespace-nowrap">表示指標:</span>
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setMetric('avgDiffCoins')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                metric === 'avgDiffCoins'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              差枚数 (枚/台)
            </button>
            <button
              type="button"
              onClick={() => setMetric('payoutRate')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                metric === 'payoutRate'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              出玉率 (%)
            </button>
            {viewMode !== 'machine_calendar' && (
              <button
                type="button"
                onClick={() => setMetric('profit')}
                className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  metric === 'profit'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {isHall ? '店舗粗利 (円)' : '客側収支 (円)'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMetric('avgGames')}
              className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                metric === 'avgGames'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              ゲーム数 (G)
            </button>
            {viewMode !== 'machine_calendar' && (
              <button
                type="button"
                onClick={() => setMetric('winRate')}
                className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  metric === 'winRate'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                勝率 (%)
              </button>
            )}
          </div>

          {/* Calendar Year Selector */}
          {viewMode === 'calendar' && availableYears.length > 1 && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-slate-500 font-semibold whitespace-nowrap">年度:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="all">全年度</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Dynamic Color Scale Legend */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">配色スケール:</span>
          {!isHall ? (
            <div className="flex items-center gap-1 text-[11px] font-mono tabular-nums">
              <span className="text-rose-700 font-bold">マイナス(負け)</span>
              <div className="flex h-3 rounded overflow-hidden border border-slate-200">
                <span className="w-4 bg-rose-500" />
                <span className="w-4 bg-rose-200" />
                <span className="w-4 bg-slate-100" />
                <span className="w-4 bg-emerald-200" />
                <span className="w-4 bg-emerald-500" />
              </div>
              <span className="text-emerald-700 font-bold">プラス(勝ち)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-mono tabular-nums">
              <span className="text-blue-700 font-bold">還元(客勝ち)</span>
              <div className="flex h-3 rounded overflow-hidden border border-slate-200">
                <span className="w-4 bg-blue-600" />
                <span className="w-4 bg-cyan-200" />
                <span className="w-4 bg-slate-100" />
                <span className="w-4 bg-amber-200" />
                <span className="w-4 bg-amber-500" />
              </div>
              <span className="text-amber-800 font-bold">回収(店舗黒字)</span>
            </div>
          )}
        </div>
      </div>

      {/* Key Highlights Grid */}
      {keyHighlights && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {keyHighlights.bestSpot && (
            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-emerald-800 font-bold">
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-emerald-600" />
                  最高還元スポット
                </span>
                <span className="text-[10px] text-emerald-700">
                  {keyHighlights.bestSpot.count}営業日
                </span>
              </div>
              <div className="text-sm font-extrabold text-slate-900">
                {keyHighlights.bestSpot.label}
              </div>
              <div className="font-mono tabular-nums text-emerald-700 font-bold">
                平均 {keyHighlights.bestSpot.avgDiff > 0 ? '+' : ''}
                {Math.round(keyHighlights.bestSpot.avgDiff)}枚 / 出率 {keyHighlights.bestSpot.payout.toFixed(1)}%
              </div>
            </div>
          )}

          {keyHighlights.worstSpot && (
            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-amber-800 font-bold">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  最大回収スポット
                </span>
                <span className="text-[10px] text-amber-700">
                  {keyHighlights.worstSpot.count}営業日
                </span>
              </div>
              <div className="text-sm font-extrabold text-slate-900">
                {keyHighlights.worstSpot.label}
              </div>
              <div className="font-mono tabular-nums text-amber-800 font-bold">
                平均 {keyHighlights.worstSpot.avgDiff > 0 ? '+' : ''}
                {Math.round(keyHighlights.worstSpot.avgDiff)}枚 / 出率 {keyHighlights.worstSpot.payout.toFixed(1)}%
              </div>
            </div>
          )}

          {keyHighlights.busiestSpot && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-indigo-800 font-bold">
                <span className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-indigo-600" />
                  最高稼働スポット
                </span>
                <span className="text-[10px] text-indigo-700">
                  {keyHighlights.busiestSpot.count}営業日
                </span>
              </div>
              <div className="text-sm font-extrabold text-slate-900">
                {keyHighlights.busiestSpot.label}
              </div>
              <div className="font-mono tabular-nums text-indigo-700 font-bold">
                平均 {Math.round(keyHighlights.busiestSpot.games).toLocaleString()}G
              </div>
            </div>
          )}

          {keyHighlights.hasMachineData ? (
            <div
              className={`p-3 rounded-xl border space-y-1 ${
                keyHighlights.hasTailAdvantage
                  ? 'bg-purple-50/70 border-purple-200 text-purple-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  末尾合わせ傾向
                </span>
                <span className="text-[10px]">日付一致 vs 他末尾</span>
              </div>
              <div className="text-xs font-semibold">
                {keyHighlights.hasTailAdvantage ? '末尾一致に明確な優位あり' : '末尾合わせの顕著な偏りなし'}
              </div>
              <div className="font-mono tabular-nums text-[11px]">
                一致末尾: {keyHighlights.tailMatchAvg > 0 ? '+' : ''}
                {Math.round(keyHighlights.tailMatchAvg)}枚 vs 他: {keyHighlights.tailOtherAvg > 0 ? '+' : ''}
                {Math.round(keyHighlights.tailOtherAvg)}枚
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-600">
              <div className="flex items-center gap-1 font-bold text-slate-800">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                特定日旧イベ分析
              </div>
              <div className="text-xs">
                {oldEventDays ? `設定特日: ${oldEventDays}` : 'ヘッダー特日未指定'}
              </div>
              <div className="text-[11px] text-slate-500">
                上のタブから主要機種・台番・曜日別の出玉マップを切り替え可能
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Heatmap Visual Container */}
      <div className="relative">
        {/* ======================================================== */}
        {/* VIEW 1: MONTH CALENDAR VIEW */}
        {/* ======================================================== */}
        {viewMode === 'calendar' && (
          <div className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[920px] space-y-3">
                {calendarMonths.map((m) => (
                  <div
                    key={m.yearMonth}
                    className="border border-slate-200 rounded-xl p-3 bg-white hover:border-slate-300 transition-colors shadow-2xs"
                  >
                    {/* Month header row */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectMonth && onSelectMonth(m.yearMonth)}
                          className="font-extrabold text-sm text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                          title="この月の全日詳細モーダルを開く"
                        >
                          <span>{m.yearMonth.replace('-', '年')}月</span>
                        </button>
                        <span className="text-[11px] text-slate-500">
                          ({m.recordCount}営業日データ)
                        </span>
                      </div>

                      {/* Month summary KPIs */}
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        <div>
                          <span className="text-slate-500 mr-1">月間平均差枚:</span>
                          <span
                            className={`font-bold ${
                              m.avgDiff > 0
                                ? isHall
                                  ? 'text-cyan-700'
                                  : 'text-emerald-700'
                                : isHall
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {m.avgDiff > 0 ? '+' : ''}
                            {Math.round(m.avgDiff)}枚/台
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 mr-1">出玉率:</span>
                          <span className="font-bold text-slate-800">
                            {m.avgPayout.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 mr-1">{isHall ? '粗利:' : '客収支:'}</span>
                          <span className="font-bold text-slate-800">
                            {formatYen(m.monthProfit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 31-day Calendar Grid */}
                    <div className="grid grid-cols-[repeat(31,minmax(26px,1fr))] gap-1">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                        const isDayValid = day <= m.daysInMonth;
                        const record = m.daysMap.get(day);

                        if (!isDayValid) {
                          return (
                            <div
                              key={day}
                              className="h-14 rounded-md bg-slate-50/50 border border-slate-100/60 opacity-20"
                            />
                          );
                        }

                        if (!record) {
                          return (
                            <div
                              key={day}
                              className="h-14 rounded-md bg-slate-50 border border-slate-200/50 flex flex-col items-center justify-between p-1 opacity-50"
                              title={`${m.yearMonth}-${String(day).padStart(2, '0')}: データなし`}
                            >
                              <span className="text-[10px] text-slate-400 font-mono">{day}</span>
                              <span className="text-[10px] text-slate-300">-</span>
                            </div>
                          );
                        }

                        const val = getRecordMetricValue(record, metric);
                        const colorClass = getColorClass(val, metric);
                        const isEvent = record.isOldEventDay || record.is7Day || isZoroDate(record);
                        const holiday = getJapaneseHoliday(record.date);

                        return (
                          <div
                            key={day}
                            onClick={() => onSelectMonth && onSelectMonth(m.yearMonth)}
                            onMouseEnter={() => {
                              setHoveredCellInfo({
                                title: `${record.date} (${record.dayOfWeek}${holiday.isHoliday ? `・${holiday.holidayName}` : ''})`,
                                subtitle: isEvent ? '★ 旧イベント・特定日' : '通常営業日',
                                stats: [
                                  { label: '平均差枚', value: `${record.avgDiffCoins > 0 ? '+' : ''}${Math.round(record.avgDiffCoins)}枚/台`, highlight: true },
                                  { label: '出玉率(機械割)', value: `${record.payoutRate.toFixed(1)}%` },
                                  { label: isHall ? '店舗粗利' : '客側収支', value: formatYen(isHall ? record.gModelHallProfit : -record.gModelHallProfit) },
                                  { label: '平均G数', value: `${record.avgGames.toLocaleString()}G` },
                                  { label: '設置台数', value: `${record.totalMachines}台` },
                                  { label: '勝率', value: record.winRate !== null ? `${record.winRate.toFixed(1)}%` : '-' },
                                ],
                                note: 'クリックでこの月の全日詳細一覧を開きます',
                              });
                            }}
                            onMouseLeave={() => setHoveredCellInfo(null)}
                            className={`h-14 rounded-md border flex flex-col items-center justify-between p-1 cursor-pointer transition-transform hover:scale-105 hover:z-10 hover:ring-2 hover:ring-slate-900 ${colorClass}`}
                          >
                            <div className="w-full flex items-center justify-between text-[10px] font-mono leading-none">
                              <span
                                className={`font-bold ${
                                  holiday.isHoliday || record.dayOfWeek === '日'
                                    ? 'text-rose-600'
                                    : record.dayOfWeek === '土'
                                    ? 'text-blue-600'
                                    : ''
                                }`}
                              >
                                {day}
                              </span>
                              {isEvent && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="特日" />
                              )}
                            </div>
                            <span className="text-[10px] font-mono tabular-nums leading-none tracking-tighter">
                              {formatMetricValue(val, metric, true)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: MACHINE NUMBER x DATE CALENDAR VIEW (NEW!) */}
        {/* ======================================================== */}
        {viewMode === 'machine_calendar' && (
          <div className="space-y-3">
            {!machineCalendarData ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                  <Target className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  台番号別の詳細データが見つかりません
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  アナスロ（ana-slo.com）の店舗HTMLファイルを取り込むと、全台番号（500番台〜700番台等）と日付カレンダーをマッピングした高密度ヒートマップが利用可能になります。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Machine Calendar Filter Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200 text-xs">
                  {/* Left filters: Search, Model, Tail, Month */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={mcSearchQuery}
                        onChange={(e) => setMcSearchQuery(e.target.value)}
                        placeholder="台番・機種名検索..."
                        className="pl-8 pr-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500 w-36 sm:w-44"
                      />
                      {mcSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setMcSearchQuery('')}
                          className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Model Filter */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 font-semibold whitespace-nowrap">機種:</span>
                      <select
                        value={mcModelFilter}
                        onChange={(e) => setMcModelFilter(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer max-w-[180px] truncate"
                      >
                        <option value="all">全機種 ({machineCalendarData.allMachinesCount}台)</option>
                        {machineCalendarData.availableModels.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name} ({m.count}台)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tail Filter */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 font-semibold whitespace-nowrap">末尾:</span>
                      <select
                        value={mcTailFilter}
                        onChange={(e) => setMcTailFilter(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                      >
                        <option value="all">全末尾</option>
                        <option value="0">末尾 0</option>
                        <option value="1">末尾 1</option>
                        <option value="2">末尾 2</option>
                        <option value="3">末尾 3</option>
                        <option value="4">末尾 4</option>
                        <option value="5">末尾 5</option>
                        <option value="6">末尾 6</option>
                        <option value="7">末尾 7</option>
                        <option value="8">末尾 8</option>
                        <option value="9">末尾 9</option>
                        <option value="zoro">ゾロ目台番</option>
                      </select>
                    </div>

                    {/* Month Filter */}
                    {machineCalendarData.availableMonths.length > 1 && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 font-semibold whitespace-nowrap">月:</span>
                        <select
                          value={mcMonthFilter}
                          onChange={(e) => setMcMonthFilter(e.target.value)}
                          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                        >
                          <option value="all">全月</option>
                          {machineCalendarData.availableMonths.map((ym) => (
                            <option key={ym} value={ym}>
                              {ym.replace('-', '年')}月
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Right controls: Sort & Consecutive Win Toggle */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Sort Order */}
                    <div className="flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={mcSortField}
                        onChange={(e) => setMcSortField(e.target.value as any)}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                      >
                        <option value="num_asc">台番号 昇順</option>
                        <option value="num_desc">台番号 降順</option>
                        <option value="diff_desc">期間累計差枚 降順 (+順)</option>
                        <option value="diff_asc">期間累計差枚 昇順 (-順)</option>
                        <option value="win_desc">勝率 降順</option>
                        <option value="games_desc">平均稼働G数 降順</option>
                      </select>
                    </div>

                    {/* Consecutive Wins Toggle (据え置き検知) */}
                    <button
                      type="button"
                      onClick={() => setMcHighlightConsecutive(!mcHighlightConsecutive)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        mcHighlightConsecutive
                          ? 'bg-amber-400 text-slate-950 font-black ring-1 ring-amber-500 shadow-2xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                      title="2日以上連続で差枚プラスを記録した台（据え置き候補）に絞り込み"
                    >
                      <Flame className="w-3.5 h-3.5 text-amber-600" />
                      <span>連勝・据え置き台のみ</span>
                    </button>

                    {/* Clear Filters Button */}
                    {(mcModelFilter !== 'all' || mcTailFilter !== 'all' || mcSearchQuery || mcHighlightConsecutive) && (
                      <button
                        type="button"
                        onClick={() => {
                          setMcModelFilter('all');
                          setMcTailFilter('all');
                          setMcSearchQuery('');
                          setMcHighlightConsecutive(false);
                        }}
                        className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        絞込解除
                      </button>
                    )}
                  </div>
                </div>

                {/* Machine Calendar Active Count Banner */}
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <div>
                    表示中: <strong className="text-slate-900">{machineCalendarData.filteredMachines.length}台</strong> / 全{machineCalendarData.allMachinesCount}台 ({machineCalendarData.validDailyRecords.length}営業日)
                    {mcModelFilter !== 'all' && (
                      <span className="ml-2 text-indigo-700 font-bold">「{mcModelFilter}」</span>
                    )}
                    {mcTailFilter !== 'all' && (
                      <span className="ml-2 text-amber-700 font-bold">
                        「{mcTailFilter === 'zoro' ? 'ゾロ目台番' : `末尾${mcTailFilter}`}」
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    ※台番・日付ごとの差枚数・出率を一覧表示。横スクロールで全日程を確認できます
                  </div>
                </div>

                {/* High-Density Matrix Table Container */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="overflow-auto max-h-[620px]">
                    <table className="w-full min-w-max text-xs border-collapse">
                      {/* Sticky Header Row */}
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 sticky top-0 z-30 shadow-2xs">
                          {/* Sticky Left Column 1: 台番号 */}
                          <th className="py-2.5 px-3 text-left font-bold text-slate-800 bg-slate-100 sticky left-0 z-40 w-20 border-r border-slate-200">
                            台番
                          </th>
                          {/* Sticky Left Column 2: 機種名 */}
                          <th className="py-2.5 px-3 text-left font-bold text-slate-800 bg-slate-100 sticky left-20 z-40 w-36 border-r border-slate-200">
                            機種名
                          </th>
                          {/* Sticky Left Column 3: 期間累計 */}
                          <th className="py-2.5 px-3 text-right font-bold text-slate-800 bg-slate-100 sticky left-56 z-40 w-24 border-r border-slate-200">
                            期間累計
                          </th>
                          {/* Sticky Left Column 4: 勝率 */}
                          <th className="py-2.5 px-2 text-center font-bold text-slate-800 bg-slate-100 sticky left-80 z-40 w-20 border-r-2 border-slate-300">
                            勝率
                          </th>

                          {/* Date Columns */}
                          {machineCalendarData.validDailyRecords.map((dr) => {
                            const isEvent = dr.isOldEventDay || dr.is7Day || isZoroDate(dr);
                            const hol = getJapaneseHoliday(dr.date);
                            const isSun = dr.dayOfWeek === '日' || hol.isHoliday;
                            const isSat = dr.dayOfWeek === '土';

                            return (
                              <th
                                key={dr.date}
                                className={`py-2 px-2 text-center border-r border-slate-200 min-w-[76px] ${
                                  isEvent ? 'bg-amber-50/90' : 'bg-slate-50'
                                }`}
                              >
                                <div className="flex flex-col items-center">
                                  <div className="text-[11px] font-mono font-bold leading-tight">
                                    {dr.month}/{dr.day}
                                    <span
                                      className={`ml-0.5 ${
                                        isSun ? 'text-rose-600' : isSat ? 'text-blue-600' : 'text-slate-600'
                                      }`}
                                    >
                                      ({dr.dayOfWeek})
                                    </span>
                                  </div>
                                  {isEvent && (
                                    <span className="text-[9px] font-black text-amber-700 bg-amber-200/80 px-1 rounded-sm mt-0.5">
                                      特日
                                    </span>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>

                      {/* Machine Rows */}
                      <tbody className="divide-y divide-slate-100">
                        {machineCalendarData.filteredMachines.map((m) => {
                          return (
                            <tr key={m.machineNum} className="hover:bg-slate-50/80 transition-colors">
                              {/* Sticky Col 1: 台番 */}
                              <td className="py-2 px-3 font-mono font-black text-slate-900 bg-white sticky left-0 z-20 border-r border-slate-200 flex items-center gap-1">
                                <span>{m.machineNum}</span>
                                {m.isZoro && (
                                  <span className="text-[9px] px-1 rounded bg-purple-100 text-purple-800 font-bold" title="ゾロ目台番">
                                    ゾロ
                                  </span>
                                )}
                              </td>

                              {/* Sticky Col 2: 機種名 */}
                              <td
                                className="py-2 px-3 text-slate-700 font-semibold truncate max-w-[144px] bg-white sticky left-20 z-20 border-r border-slate-200"
                                title={m.modelName}
                              >
                                {m.modelName}
                              </td>

                              {/* Sticky Col 3: 累計差枚 */}
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-extrabold bg-white sticky left-56 z-20 border-r border-slate-200">
                                <span
                                  className={
                                    m.totalDiff > 0
                                      ? isHall
                                        ? 'text-cyan-700'
                                        : 'text-emerald-700'
                                      : m.totalDiff < 0
                                      ? isHall
                                        ? 'text-amber-800'
                                        : 'text-rose-700'
                                      : 'text-slate-500'
                                  }
                                >
                                  {m.totalDiff > 0 ? '+' : ''}
                                  {m.totalDiff.toLocaleString()}枚
                                </span>
                              </td>

                              {/* Sticky Col 4: 勝率 */}
                              <td className="py-2 px-2 text-center font-mono tabular-nums text-[11px] font-bold text-slate-600 bg-white sticky left-80 z-20 border-r-2 border-slate-300">
                                {m.winDays}/{m.recordedDays}
                                <span className="text-[10px] text-slate-400 block font-normal">
                                  ({m.winRate.toFixed(0)}%)
                                </span>
                              </td>

                              {/* Date Data Cells */}
                              {machineCalendarData.validDailyRecords.map((dr) => {
                                const rec = m.recordsByDate.get(dr.date);
                                const colorClass = getMachineCellColorClass(rec, metric);
                                const hasData = !!rec;

                                if (!hasData) {
                                  return (
                                    <td
                                      key={dr.date}
                                      className="py-1 px-1 text-center border-r border-slate-100/70"
                                    >
                                      <div className="h-9 rounded bg-slate-50/50 flex items-center justify-center text-slate-300 font-mono text-[10px]">
                                        -
                                      </div>
                                    </td>
                                  );
                                }

                                const isWin = rec.diff > 0;
                                let displayVal = '';
                                if (metric === 'avgGames') {
                                  displayVal = `${(rec.games || 0).toLocaleString()}G`;
                                } else if (metric === 'payoutRate') {
                                  const inCoins = (rec.games || 0) * 3;
                                  const pr = inCoins > 0 ? ((inCoins + (rec.diff || 0)) / inCoins) * 100 : 100;
                                  displayVal = `${pr.toFixed(1)}%`;
                                } else {
                                  const sign = rec.diff > 0 ? '+' : '';
                                  displayVal = `${sign}${rec.diff.toLocaleString()}`;
                                }

                                return (
                                  <td
                                    key={dr.date}
                                    className="py-1 px-1 text-center border-r border-slate-100"
                                  >
                                    <div
                                      onMouseEnter={() => {
                                        const inCoins = (rec.games || 0) * 3;
                                        const pr = inCoins > 0 ? ((inCoins + (rec.diff || 0)) / inCoins) * 100 : 100;
                                        setHoveredCellInfo({
                                          title: `${m.machineNum}番台: ${m.modelName}`,
                                          subtitle: `${dr.date} (${dr.dayOfWeek}) 出玉記録`,
                                          stats: [
                                            { label: '差枚数', value: `${rec.diff > 0 ? '+' : ''}${rec.diff.toLocaleString()}枚`, highlight: true },
                                            { label: '出玉率(機械割)', value: `${pr.toFixed(1)}%` },
                                            { label: '総G数', value: `${(rec.games || 0).toLocaleString()}G` },
                                            { label: 'BB / RB', value: rec.bb !== undefined ? `${rec.bb}回 / ${rec.rb || 0}回` : '記録なし' },
                                          ],
                                          note: m.hasConsecutiveWin ? '★ 期間内に連勝・据え置き実績あり' : undefined,
                                        });
                                      }}
                                      onMouseLeave={() => setHoveredCellInfo(null)}
                                      className={`h-9 rounded border flex flex-col items-center justify-center p-0.5 cursor-pointer transition-transform hover:scale-110 hover:z-20 hover:ring-2 hover:ring-slate-900 ${colorClass}`}
                                    >
                                      <span className="font-mono tabular-nums leading-none text-[11px] font-bold">
                                        {displayVal}
                                      </span>
                                      {rec.games > 0 && metric !== 'avgGames' && (
                                        <span className="text-[9px] opacity-70 font-mono leading-none mt-0.5">
                                          {(rec.games / 1000).toFixed(1)}kG
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* Sticky Summary Bottom Row */}
                      <tfoot>
                        <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300 sticky bottom-0 z-30 shadow-xs">
                          <td className="py-2.5 px-3 text-slate-900 sticky left-0 z-40 bg-slate-200 border-r border-slate-300">
                            合計
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px] sticky left-20 z-40 bg-slate-200 border-r border-slate-300">
                            表示中台計
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black sticky left-56 z-40 bg-slate-200 border-r border-slate-300">
                            {machineCalendarData.filteredMachines.reduce((acc, m) => acc + m.totalDiff, 0) > 0 ? '+' : ''}
                            {machineCalendarData.filteredMachines.reduce((acc, m) => acc + m.totalDiff, 0).toLocaleString()}枚
                          </td>
                          <td className="py-2 px-2 text-center font-mono tabular-nums text-[10px] text-slate-500 sticky left-80 z-40 bg-slate-200 border-r-2 border-slate-300">
                            全日程
                          </td>

                          {/* Date Column Sums */}
                          {machineCalendarData.dailyColumnTotals.map((dt) => (
                            <td
                              key={dt.date}
                              className="py-2 px-1 text-center font-mono tabular-nums border-r border-slate-300"
                            >
                              <div className="text-[11px] font-black text-slate-900">
                                {metric === 'avgGames'
                                  ? `${Math.round(dt.totalDiff / Math.max(1, dt.machineCount))}G`
                                  : `${dt.totalDiff > 0 ? '+' : ''}${Math.round(dt.totalDiff / 1000)}k枚`}
                              </div>
                              <div className="text-[9px] text-slate-500 font-normal">
                                勝率 {dt.winRate.toFixed(0)}% ({dt.winCount}/{dt.machineCount}台)
                              </div>
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 3: DOW x DATE TAIL CROSS MATRIX */}
        {/* ======================================================== */}
        {viewMode === 'dow_tail' && (
          <div className="overflow-x-auto pb-2">
            <table className="w-full min-w-[840px] text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="py-2.5 px-3 text-left font-bold text-slate-700 w-28">曜日</th>
                  {DATE_TAILS.map((tail) => {
                    const isTarget = isTargetEventTail(tail.id);
                    return (
                      <th
                        key={tail.id}
                        className={`py-2 px-2 text-center font-bold ${
                          isTarget ? 'bg-amber-100/60 text-amber-950 font-black' : 'text-slate-700'
                        }`}
                      >
                        <div>{tail.short}</div>
                        {isTarget && (
                          <div className="text-[9px] text-amber-700 font-extrabold">特日</div>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-2 px-3 text-right font-bold text-slate-800 bg-slate-100/80 w-24">
                    曜日平均
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {DOW_ORDER.map((dow) => {
                  const summary = dowTailMatrix.dowSummary[dow];
                  const isWeekend = dow === '土' || dow === '日' || dow === '祝';

                  return (
                    <tr key={dow} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            dow === '日' || dow === '祝'
                              ? 'bg-rose-500'
                              : dow === '土'
                              ? 'bg-blue-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span>{dow}曜日</span>
                        {isWeekend && (
                          <span className="text-[10px] text-slate-400">週末</span>
                        )}
                      </td>

                      {DATE_TAILS.map((tail) => {
                        const cell = dowTailMatrix.matrix[dow][tail.id];
                        const isTarget = isTargetEventTail(tail.id);

                        if (cell.count === 0) {
                          return (
                            <td key={tail.id} className="p-1 text-center">
                              <div className="h-12 rounded-lg bg-slate-50/80 border border-slate-100 flex flex-col items-center justify-center text-slate-300">
                                <span className="text-[10px]">-</span>
                              </div>
                            </td>
                          );
                        }

                        let val: number;
                        switch (metric) {
                          case 'avgDiffCoins':
                            val = cell.avgDiffCoins;
                            break;
                          case 'payoutRate':
                            val = cell.payoutRate;
                            break;
                          case 'profit':
                            val = cell.profit;
                            break;
                          case 'avgGames':
                            val = cell.avgGames;
                            break;
                          case 'winRate':
                            val = cell.winRate;
                            break;
                        }

                        const colorClass = getColorClass(val, metric);

                        return (
                          <td key={tail.id} className="p-1 text-center">
                            <div
                              onMouseEnter={() => {
                                setHoveredCellInfo({
                                  title: `${dow}曜日 × ${tail.label}`,
                                  subtitle: `サンプル数: ${cell.count}営業日`,
                                  stats: [
                                    { label: '平均差枚', value: `${cell.avgDiffCoins > 0 ? '+' : ''}${Math.round(cell.avgDiffCoins)}枚/台`, highlight: true },
                                    { label: '出玉率(機械割)', value: `${cell.payoutRate.toFixed(1)}%` },
                                    { label: isHall ? '1日平均粗利' : '1日平均客収支', value: formatYen(cell.profit) },
                                    { label: '平均G数', value: `${Math.round(cell.avgGames).toLocaleString()}G` },
                                    { label: '平均勝率', value: `${cell.winRate.toFixed(1)}%` },
                                  ],
                                  note: isTarget ? '★ 店舗の登録旧イベント日' : undefined,
                                });
                              }}
                              onMouseLeave={() => setHoveredCellInfo(null)}
                              className={`h-12 rounded-lg border flex flex-col items-center justify-center p-1 transition-transform hover:scale-105 hover:z-10 hover:ring-2 hover:ring-slate-900 cursor-pointer ${colorClass} ${
                                isTarget ? 'ring-1 ring-amber-400' : ''
                              }`}
                            >
                              <span className="font-mono tabular-nums font-bold leading-none">
                                {formatMetricValue(val, metric, true)}
                              </span>
                              <span className="text-[9px] opacity-75 mt-0.5 font-mono">
                                {cell.count}日
                              </span>
                            </div>
                          </td>
                        );
                      })}

                      {/* Row marginal */}
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-800 bg-slate-50/50">
                        {summary.count > 0 ? (
                          <div>
                            <div>
                              {metric === 'avgDiffCoins' && `${summary.avgDiffCoins > 0 ? '+' : ''}${Math.round(summary.avgDiffCoins)}枚`}
                              {metric === 'payoutRate' && `${summary.payoutRate.toFixed(1)}%`}
                              {metric === 'profit' && formatYen(summary.profit)}
                              {metric === 'avgGames' && `${Math.round(summary.avgGames)}G`}
                              {metric === 'winRate' && '-'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              ({summary.count}日)
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Column marginal summary row */}
                <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-300">
                  <td className="py-2.5 px-3 text-slate-800">末尾平均</td>
                  {DATE_TAILS.map((tail) => {
                    const colSum = dowTailMatrix.tailSummary[tail.id];
                    return (
                      <td key={tail.id} className="p-1 text-center font-mono tabular-nums">
                        {colSum && colSum.count > 0 ? (
                          <div className="text-[11px]">
                            <div className="font-extrabold text-slate-900">
                              {metric === 'avgDiffCoins' && `${colSum.avgDiffCoins > 0 ? '+' : ''}${Math.round(colSum.avgDiffCoins)}`}
                              {metric === 'payoutRate' && `${colSum.payoutRate.toFixed(1)}%`}
                              {metric === 'profit' && formatYen(colSum.profit)}
                              {metric === 'avgGames' && `${Math.round(colSum.avgGames)}`}
                              {metric === 'winRate' && '-'}
                            </div>
                            <div className="text-[9px] text-slate-500 font-normal">
                              {colSum.count}日
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500 text-[11px]">
                    全日集計
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 4: MACHINE TAIL x DATE TAIL CROSS MATRIX */}
        {/* ======================================================== */}
        {viewMode === 'machine_tail' && machineTailMatrix && (
          <div className="space-y-3">
            <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>末尾合わせ検証:</strong> 黄色の枠線（対角線）は「日付末尾と台番号末尾が一致する組み合わせ」を示しています。台番末尾と特定日の連動傾向を即座に確認できます。
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[840px] text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="py-2.5 px-3 text-left font-bold text-slate-700 w-32">台番号末尾</th>
                    {DATE_TAILS.map((tail) => (
                      <th key={tail.id} className="py-2 px-2 text-center font-bold text-slate-700">
                        {tail.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {machineTailMatrix.machineTails.map((mt) => (
                    <tr key={mt.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{mt.label}</td>
                      {DATE_TAILS.map((dt) => {
                        const cell = machineTailMatrix.matrix[mt.id][dt.id];
                        const isDiagonalMatch = String(mt.id) === String(dt.id);

                        if (!cell || cell.machineCount === 0) {
                          return (
                            <td key={dt.id} className="p-1 text-center">
                              <div className="h-11 rounded-lg bg-slate-50/80 border border-slate-100 flex items-center justify-center text-slate-300 text-[10px]">
                                -
                              </div>
                            </td>
                          );
                        }

                        let val: number;
                        switch (metric) {
                          case 'avgDiffCoins':
                            val = cell.avgDiffCoins;
                            break;
                          case 'payoutRate':
                            val = cell.payoutRate;
                            break;
                          case 'profit':
                            val = isHall ? -cell.avgDiffCoins * 20 : cell.avgDiffCoins * 20;
                            break;
                          case 'avgGames':
                            val = cell.totalGames / cell.machineCount;
                            break;
                          case 'winRate':
                            val = 0;
                            break;
                        }

                        const colorClass = getColorClass(val, metric);

                        return (
                          <td key={dt.id} className="p-1 text-center">
                            <div
                              onMouseEnter={() => {
                                setHoveredCellInfo({
                                  title: `${mt.label} × ${dt.label}`,
                                  subtitle: `総台数: ${cell.machineCount.toLocaleString()}台`,
                                  stats: [
                                    { label: '平均差枚', value: `${cell.avgDiffCoins > 0 ? '+' : ''}${Math.round(cell.avgDiffCoins)}枚/台`, highlight: true },
                                    { label: '出玉率(機械割)', value: `${cell.payoutRate.toFixed(1)}%` },
                                    { label: '総差枚', value: `${cell.totalDiff > 0 ? '+' : ''}${Math.round(cell.totalDiff).toLocaleString()}枚` },
                                    { label: '平均ゲーム数', value: `${Math.round(cell.totalGames / cell.machineCount).toLocaleString()}G` },
                                  ],
                                  note: isDiagonalMatch ? '★ 日付末尾と台番末尾が完全一致！' : undefined,
                                });
                              }}
                              onMouseLeave={() => setHoveredCellInfo(null)}
                              className={`h-11 rounded-lg border flex flex-col items-center justify-center p-1 transition-transform hover:scale-105 hover:z-10 hover:ring-2 hover:ring-slate-900 cursor-pointer ${colorClass} ${
                                isDiagonalMatch ? 'ring-2 ring-amber-400 font-black shadow-xs' : ''
                              }`}
                            >
                              <span className="font-mono tabular-nums font-bold leading-none text-[11px]">
                                {formatMetricValue(val, metric, true)}
                              </span>
                              <span className="text-[9px] opacity-75 mt-0.5 font-mono">
                                {cell.machineCount}台
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 5: TOP MODELS x DATE TAIL CROSS MATRIX */}
        {/* ======================================================== */}
        {viewMode === 'model_tail' && modelTailMatrix && (
          <div className="overflow-x-auto pb-2">
            <table className="w-full min-w-[840px] text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="py-2.5 px-3 text-left font-bold text-slate-700 w-44">人気主力機種</th>
                  {DATE_TAILS.map((tail) => (
                    <th key={tail.id} className="py-2 px-2 text-center font-bold text-slate-700">
                      {tail.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelTailMatrix.topModels.map((modelName) => (
                  <tr key={modelName} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900 truncate max-w-[176px]" title={modelName}>
                      {modelName}
                    </td>
                    {DATE_TAILS.map((tail) => {
                      const cell = modelTailMatrix.matrix[modelName][tail.id];

                      if (!cell || cell.totalMachines === 0) {
                        return (
                          <td key={tail.id} className="p-1 text-center">
                            <div className="h-11 rounded-lg bg-slate-50/80 border border-slate-100 flex items-center justify-center text-slate-300 text-[10px]">
                              -
                            </div>
                          </td>
                        );
                      }

                      let val: number;
                      switch (metric) {
                        case 'avgDiffCoins':
                          val = cell.avgDiffCoins;
                          break;
                        case 'payoutRate':
                          val = cell.payoutRate;
                          break;
                        case 'profit':
                          val = isHall ? -cell.avgDiffCoins * 20 : cell.avgDiffCoins * 20;
                          break;
                        case 'avgGames':
                          val = cell.totalGames / cell.totalMachines;
                          break;
                        case 'winRate':
                          val = 0;
                          break;
                      }

                      const colorClass = getColorClass(val, metric);

                      return (
                        <td key={tail.id} className="p-1 text-center">
                          <div
                            onMouseEnter={() => {
                              setHoveredCellInfo({
                                title: `${modelName} × ${tail.label}`,
                                subtitle: `延べ台数: ${cell.totalMachines}台 (${cell.sampleCount}営業日)`,
                                stats: [
                                  { label: '平均差枚', value: `${cell.avgDiffCoins > 0 ? '+' : ''}${Math.round(cell.avgDiffCoins)}枚/台`, highlight: true },
                                  { label: '出玉率(機械割)', value: `${cell.payoutRate.toFixed(1)}%` },
                                  { label: '総差枚', value: `${cell.totalDiff > 0 ? '+' : ''}${Math.round(cell.totalDiff).toLocaleString()}枚` },
                                  { label: '平均G数', value: `${Math.round(cell.totalGames / cell.totalMachines).toLocaleString()}G` },
                                ],
                              });
                            }}
                            onMouseLeave={() => setHoveredCellInfo(null)}
                            className={`h-11 rounded-lg border flex flex-col items-center justify-center p-1 transition-transform hover:scale-105 hover:z-10 hover:ring-2 hover:ring-slate-900 cursor-pointer ${colorClass}`}
                          >
                            <span className="font-mono tabular-nums font-bold leading-none text-[11px]">
                              {formatMetricValue(val, metric, true)}
                            </span>
                            <span className="text-[9px] opacity-75 mt-0.5 font-mono">
                              {cell.totalMachines}台
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rich Hover Floating Popover / Tooltip */}
        {hoveredCellInfo && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white rounded-xl shadow-2xl border border-slate-700 p-3.5 max-w-xs animate-in fade-in zoom-in-95 duration-100 pointer-events-none">
            <div className="space-y-1 border-b border-slate-800 pb-2">
              <div className="font-bold text-xs text-amber-300">{hoveredCellInfo.title}</div>
              {hoveredCellInfo.subtitle && (
                <div className="text-[11px] text-slate-400">{hoveredCellInfo.subtitle}</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums py-2">
              {hoveredCellInfo.stats.map((s, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-sans">{s.label}</span>
                  <span className={`font-bold ${s.highlight ? 'text-amber-400' : 'text-slate-100'}`}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
            {hoveredCellInfo.note && (
              <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 font-sans">
                {hoveredCellInfo.note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Guide explanation footer */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            セルにマウスを合わせると詳細データが表示されます。日付カレンダーのセルをクリックすると該当月の全日一覧モーダルが開きます。
          </span>
        </div>
        <div className="font-mono tabular-nums text-slate-400">
          集計対象: {calendarFilteredRecords.length}営業日
        </div>
      </div>
    </section>
  );
};
