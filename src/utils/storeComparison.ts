import { StoreProfile, DailyRecord } from '../data/types';
import { isDateSpecialDay } from './dataEngine';
import { normalizeModelName } from './modelName';

export interface StoreCommonPeriod {
  startDate: string;
  endDate: string;
  commonDaysCount: number;
  hasCommonPeriod: boolean;
}

export interface StorePerMachineMetrics {
  storeId: string;
  storeName: string;
  daysCount: number;
  totalMachineDays: number;
  avgMachinesPerDay: number;
  // Per-machine primary metrics
  avgDiffPerMachine: number; // coins / machine / day
  payoutRate: number; // % (out / in)
  winRate: number; // % (winMachines / totalMachines)
  avgGames: number; // games / machine / day
  highPayout5kRate: number; // % of machine-days or days with diff >= 5000
  // Profit in Yen using store exchange/lend rates (reference display)
  totalEstimatedRevenueYen: number;
  totalGModelHallProfitYen: number;
  avgGModelHallProfitPerMachineDayYen: number;
  avgPlayerProfitPerMachineDayYen: number;
  // Special day lift vs normal days
  specialDaysCount: number;
  normalDaysCount: number;
  specialAvgDiffPerMachine: number;
  normalAvgDiffPerMachine: number;
  specialLift: number; // special - normal
  specialLiftPayout: number; // special payout - normal payout
}

export interface DayOfWeekStoreMetric {
  dayOfWeek: string;
  avgDiffPerMachine: number;
  payoutRate: number;
  winRate: number;
  avgGames: number;
  daysCount: number;
}

export interface MonthlyStoreTrend {
  yearMonth: string;
  avgDiffPerMachine: number;
  payoutRate: number;
  winRate: number;
  avgGames: number;
}

export interface CategoryComposition {
  category: string; // 'スマスロ' | 'ジャグラー・Aタイプ' | 'メダル機その他'
  machinesCount: number;
  sharePercent: number;
  avgDiffPerMachine: number;
  winRate: number;
}

export interface CommonModelComparison {
  modelName: string;
  storesCount: number;
  stores: Array<{
    storeId: string;
    storeName: string;
    machinesPerDay: number;
    avgDiffCoins: number;
    winRate: number;
    avgGames: number;
    payoutRate: number;
  }>;
}

export interface DigitDayStoreMetric {
  digit: string; // '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | 'ゾロ目'
  digitLabel: string; // '1のつく日', ..., '0のつく日', 'ゾロ目の日'
  daysCount: number;
  totalDiffCoins: number;
  totalMachineDays: number;
  avgDiffPerMachine: number;
}

export interface StoreSummaryStatement {
  storeId: string;
  storeName: string;
  statement: string;
}

export interface StoreComparisonResult {
  periodMode: 'common' | 'all';
  commonPeriod: StoreCommonPeriod;
  evaluatedStores: StorePerMachineMetrics[];
  monthlyTrends: Record<string, MonthlyStoreTrend[]>; // storeId -> trends
  digitDayHeatmaps: Record<string, DigitDayStoreMetric[]>; // storeId -> 11 digit days
  dowHeatmaps: Record<string, DayOfWeekStoreMetric[]>; // storeId -> 7 days
  categoryCompositions: Record<string, CategoryComposition[]>; // storeId -> categories
  commonModels: CommonModelComparison[];
  summaryStatements: StoreSummaryStatement[];
  warnings: string[];
}

/**
 * Calculates common overlapping date period among multiple stores.
 */
export function calculateCommonPeriod(stores: StoreProfile[]): StoreCommonPeriod {
  if (!stores || stores.length === 0) {
    return { startDate: '', endDate: '', commonDaysCount: 0, hasCommonPeriod: false };
  }

  // Find min date and max date of each store
  const storeDateSets: Set<string>[] = [];
  let latestStart = '';
  let earliestEnd = '9999-99-99';

  for (const s of stores) {
    const dates = (s.dailyRecords || []).map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) {
      return { startDate: '', endDate: '', commonDaysCount: 0, hasCommonPeriod: false };
    }
    const sStart = dates[0];
    const sEnd = dates[dates.length - 1];

    if (sStart > latestStart) latestStart = sStart;
    if (sEnd < earliestEnd) earliestEnd = sEnd;

    storeDateSets.push(new Set(dates));
  }

  if (latestStart > earliestEnd) {
    return { startDate: '', endDate: '', commonDaysCount: 0, hasCommonPeriod: false };
  }

  // Count days that exist in ALL stores
  let commonDays = 0;
  const firstSet = storeDateSets[0];
  for (const d of firstSet) {
    if (d >= latestStart && d <= earliestEnd) {
      if (storeDateSets.every((set) => set.has(d))) {
        commonDays++;
      }
    }
  }

  return {
    startDate: latestStart,
    endDate: earliestEnd,
    commonDaysCount: commonDays,
    hasCommonPeriod: commonDays > 0,
  };
}

/**
 * Filters a store's daily records by period mode.
 */
export function filterStoreRecordsByPeriod(
  records: DailyRecord[],
  periodMode: 'common' | 'all',
  commonPeriod: StoreCommonPeriod
): DailyRecord[] {
  if (periodMode === 'all' || !commonPeriod.hasCommonPeriod) {
    return records;
  }
  return (records || []).filter(
    (r) => r.date >= commonPeriod.startDate && r.date <= commonPeriod.endDate
  );
}

/**
 * Computes per-machine metrics for a single store over a set of records.
 */
export function calculateStorePerMachineMetrics(
  store: StoreProfile,
  records: DailyRecord[]
): StorePerMachineMetrics {
  const daysCount = records.length;
  if (daysCount === 0) {
    return {
      storeId: store.id,
      storeName: store.name,
      daysCount: 0,
      totalMachineDays: 0,
      avgMachinesPerDay: 0,
      avgDiffPerMachine: 0,
      payoutRate: 100,
      winRate: 0,
      avgGames: 0,
      highPayout5kRate: 0,
      totalEstimatedRevenueYen: 0,
      totalGModelHallProfitYen: 0,
      avgGModelHallProfitPerMachineDayYen: 0,
      avgPlayerProfitPerMachineDayYen: 0,
      specialDaysCount: 0,
      normalDaysCount: 0,
      specialAvgDiffPerMachine: 0,
      normalAvgDiffPerMachine: 0,
      specialLift: 0,
      specialLiftPayout: 0,
    };
  }

  let totalMachineDays = 0;
  let sumMachineDailyDiff = 0; // sum of (avgDiffCoins * totalMachines)
  let sumInCoins = 0;
  let sumOutCoins = 0;
  let sumWinMachines = 0;
  let sumMachineGames = 0;
  let high5kCount = 0;

  // Yen metrics
  let totalRevenueYen = 0;
  let totalHallProfitYen = 0;

  // Special vs Normal
  const specialDiffs: number[] = [];
  const specialPayouts: number[] = [];
  const normalDiffs: number[] = [];
  const normalPayouts: number[] = [];

  for (const r of records) {
    const machines = r.totalMachines > 0 ? r.totalMachines : store.totalMachinesApprox || 1;
    totalMachineDays += machines;

    // Diff
    const dayTotalDiff =
      r.totalDiffCoins !== 0
        ? r.totalDiffCoins
        : r.avgDiffCoins * machines;
    sumMachineDailyDiff += dayTotalDiff;

    // Turnover & Payout
    const dayIn = r.inCoins > 0 ? r.inCoins : (r.avgGames || 0) * 3 * machines;
    const dayOut = r.outCoins > 0 ? r.outCoins : dayIn + dayTotalDiff;
    sumInCoins += dayIn;
    sumOutCoins += dayOut;

    // Win machines
    if (r.winMachines !== null && r.winMachines !== undefined) {
      sumWinMachines += r.winMachines;
    } else if (r.winRate !== null && r.winRate !== undefined) {
      sumWinMachines += Math.round(machines * (r.winRate / 100));
    }

    sumMachineGames += (r.avgGames || 0) * machines;

    // High 5000+ occurrence (from machine records if available, else day avg check)
    if (r.machines && r.machines.length > 0) {
      const over5k = r.machines.filter((m) => (m.diff || 0) >= 5000).length;
      high5kCount += over5k;
    } else if (r.avgDiffCoins >= 1500) {
      // Proxy estimation when unit data not available
      high5kCount += Math.max(1, Math.round(machines * 0.05));
    }

    totalRevenueYen += r.estimatedRevenue || 0;
    totalHallProfitYen += r.gModelHallProfit || 0;

    // Special day separation
    const isSpecial = r.isOldEventDay || isDateSpecialDay(r.date, store.specialDayRules);
    const dayAvgDiff = machines > 0 ? dayTotalDiff / machines : 0;
    const dayPayout = dayIn > 0 ? (dayOut / dayIn) * 100 : 100;

    if (isSpecial) {
      specialDiffs.push(dayAvgDiff);
      specialPayouts.push(dayPayout);
    } else {
      normalDiffs.push(dayAvgDiff);
      normalPayouts.push(dayPayout);
    }
  }

  const avgMachinesPerDay = Math.round((totalMachineDays / daysCount) * 10) / 10;
  const avgDiffPerMachine =
    totalMachineDays > 0 ? Math.round((sumMachineDailyDiff / totalMachineDays) * 10) / 10 : 0;
  const payoutRate =
    sumInCoins > 0 ? Math.round((sumOutCoins / sumInCoins) * 1000) / 10 : 100.0;
  const winRate =
    totalMachineDays > 0 ? Math.round((sumWinMachines / totalMachineDays) * 1000) / 10 : 0;
  const avgGames =
    totalMachineDays > 0 ? Math.round(sumMachineGames / totalMachineDays) : 0;

  const highPayout5kRate =
    totalMachineDays > 0 ? Math.round((high5kCount / totalMachineDays) * 1000) / 10 : 0;

  // Yen conversions
  const avgGModelHallProfitPerMachineDayYen =
    totalMachineDays > 0 ? Math.round(totalHallProfitYen / totalMachineDays) : 0;
  const avgPlayerProfitPerMachineDayYen = -avgGModelHallProfitPerMachineDayYen;

  // Special lift
  const specialAvgDiff =
    specialDiffs.length > 0
      ? specialDiffs.reduce((a, b) => a + b, 0) / specialDiffs.length
      : 0;
  const normalAvgDiff =
    normalDiffs.length > 0
      ? normalDiffs.reduce((a, b) => a + b, 0) / normalDiffs.length
      : 0;
  const specialLift = Math.round((specialAvgDiff - normalAvgDiff) * 10) / 10;

  const specialAvgPayout =
    specialPayouts.length > 0
      ? specialPayouts.reduce((a, b) => a + b, 0) / specialPayouts.length
      : 100;
  const normalAvgPayout =
    normalPayouts.length > 0
      ? normalPayouts.reduce((a, b) => a + b, 0) / normalPayouts.length
      : 100;
  const specialLiftPayout = Math.round((specialAvgPayout - normalAvgPayout) * 100) / 100;

  return {
    storeId: store.id,
    storeName: store.name,
    daysCount,
    totalMachineDays,
    avgMachinesPerDay,
    avgDiffPerMachine,
    payoutRate,
    winRate,
    avgGames,
    highPayout5kRate,
    totalEstimatedRevenueYen: Math.round(totalRevenueYen),
    totalGModelHallProfitYen: Math.round(totalHallProfitYen),
    avgGModelHallProfitPerMachineDayYen,
    avgPlayerProfitPerMachineDayYen,
    specialDaysCount: specialDiffs.length,
    normalDaysCount: normalDiffs.length,
    specialAvgDiffPerMachine: Math.round(specialAvgDiff * 10) / 10,
    normalAvgDiffPerMachine: Math.round(normalAvgDiff * 10) / 10,
    specialLift,
    specialLiftPayout,
  };
}

/**
 * Computes monthly trend lines for a store.
 */
export function calculateStoreMonthlyTrends(
  store: StoreProfile,
  records: DailyRecord[]
): MonthlyStoreTrend[] {
  const byMonth = new Map<string, DailyRecord[]>();
  for (const r of records) {
    const ym = r.yearMonth || r.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(r);
  }

  const trends: MonthlyStoreTrend[] = [];
  const sortedMonths = Array.from(byMonth.keys()).sort();

  for (const ym of sortedMonths) {
    const mRecords = byMonth.get(ym)!;
    const stat = calculateStorePerMachineMetrics(store, mRecords);
    trends.push({
      yearMonth: ym,
      avgDiffPerMachine: stat.avgDiffPerMachine,
      payoutRate: stat.payoutRate,
      winRate: stat.winRate,
      avgGames: stat.avgGames,
    });
  }

  return trends;
}

/**
 * Computes Day of Week heatmap breakdown for a store.
 */
export function calculateStoreDowHeatmap(
  store: StoreProfile,
  records: DailyRecord[]
): DayOfWeekStoreMetric[] {
  const daysOfWeek = ['月', '火', '水', '木', '金', '土', '日'];
  const byDow = new Map<string, DailyRecord[]>();
  for (const d of daysOfWeek) byDow.set(d, []);

  for (const r of records) {
    const dow = r.dayOfWeek;
    if (byDow.has(dow)) {
      byDow.get(dow)!.push(r);
    }
  }

  return daysOfWeek.map((dow) => {
    const dowRecords = byDow.get(dow) || [];
    if (dowRecords.length === 0) {
      return {
        dayOfWeek: dow,
        avgDiffPerMachine: 0,
        payoutRate: 100,
        winRate: 0,
        avgGames: 0,
        daysCount: 0,
      };
    }
    const stat = calculateStorePerMachineMetrics(store, dowRecords);
    return {
      dayOfWeek: dow,
      avgDiffPerMachine: stat.avgDiffPerMachine,
      payoutRate: stat.payoutRate,
      winRate: stat.winRate,
      avgGames: stat.avgGames,
      daysCount: dowRecords.length,
    };
  });
}

/**
 * Computes category composition breakdown for a store.
 */
export function calculateStoreCategoryComposition(
  records: DailyRecord[]
): CategoryComposition[] {
  let smartSlotCount = 0;
  let smartSlotDiffSum = 0;
  let smartSlotWins = 0;

  let jugglerCount = 0;
  let jugglerDiffSum = 0;
  let jugglerWins = 0;

  let otherCount = 0;
  let otherDiffSum = 0;
  let otherWins = 0;

  for (const r of records) {
    if (r.models && r.models.length > 0) {
      for (const m of r.models) {
        const name = m.modelName || '';
        const machs = m.totalMachines || 1;
        const diff = m.totalDiffCoins || (m.avgDiffCoins * machs);
        const wins = m.winMachines || (m.winRate ? Math.round(machs * (m.winRate / 100)) : 0);

        if (name.includes('スマスロ') || name.includes('L') || name.startsWith('L ')) {
          smartSlotCount += machs;
          smartSlotDiffSum += diff;
          smartSlotWins += wins;
        } else if (name.includes('ジャグラー') || name.includes('A-') || name.includes('ハナハナ')) {
          jugglerCount += machs;
          jugglerDiffSum += diff;
          jugglerWins += wins;
        } else {
          otherCount += machs;
          otherDiffSum += diff;
          otherWins += wins;
        }
      }
    }
  }

  const grandTotal = smartSlotCount + jugglerCount + otherCount;
  if (grandTotal === 0) return [];

  return [
    {
      category: 'スマスロ',
      machinesCount: smartSlotCount,
      sharePercent: Math.round((smartSlotCount / grandTotal) * 1000) / 10,
      avgDiffPerMachine: smartSlotCount > 0 ? Math.round(smartSlotDiffSum / smartSlotCount) : 0,
      winRate: smartSlotCount > 0 ? Math.round((smartSlotWins / smartSlotCount) * 1000) / 10 : 0,
    },
    {
      category: 'ジャグラー・Aタイプ',
      machinesCount: jugglerCount,
      sharePercent: Math.round((jugglerCount / grandTotal) * 1000) / 10,
      avgDiffPerMachine: jugglerCount > 0 ? Math.round(jugglerDiffSum / jugglerCount) : 0,
      winRate: jugglerCount > 0 ? Math.round((jugglerWins / jugglerCount) * 1000) / 10 : 0,
    },
    {
      category: 'メダル機その他',
      machinesCount: otherCount,
      sharePercent: Math.round((otherCount / grandTotal) * 1000) / 10,
      avgDiffPerMachine: otherCount > 0 ? Math.round(otherDiffSum / otherCount) : 0,
      winRate: otherCount > 0 ? Math.round((otherWins / otherCount) * 1000) / 10 : 0,
    },
  ];
}

export const DIGIT_DAY_COLUMNS = [
  { key: '1', label: '1のつく日', shortLabel: '1日' },
  { key: '2', label: '2のつく日', shortLabel: '2日' },
  { key: '3', label: '3のつく日', shortLabel: '3日' },
  { key: '4', label: '4のつく日', shortLabel: '4日' },
  { key: '5', label: '5のつく日', shortLabel: '5日' },
  { key: '6', label: '6のつく日', shortLabel: '6日' },
  { key: '7', label: '7のつく日', shortLabel: '7日' },
  { key: '8', label: '8のつく日', shortLabel: '8日' },
  { key: '9', label: '9のつく日', shortLabel: '9日' },
  { key: '0', label: '0のつく日', shortLabel: '0日' },
  { key: 'ゾロ目', label: 'ゾロ目の日', shortLabel: 'ゾロ目' },
] as const;

/**
 * Shared color classification for Heatmap cells (used in both Digit Day and Day of Week heatmaps).
 */
export function getDiffHeatmapColor(
  diff: number,
  daysCount = 3
): {
  bgClass: string;
  isFewDays: boolean;
} {
  const isFewDays = daysCount > 0 && daysCount < 3;
  let bgClass = 'bg-slate-50 text-slate-600';
  if (daysCount === 0) {
    bgClass = 'bg-slate-50/50 text-slate-400';
  } else if (diff >= 300) {
    bgClass = 'bg-blue-600 text-white font-bold';
  } else if (diff >= 100) {
    bgClass = 'bg-blue-100 text-blue-900 font-bold';
  } else if (diff <= -300) {
    bgClass = 'bg-rose-600 text-white font-bold';
  } else if (diff <= -100) {
    bgClass = 'bg-rose-100 text-rose-900 font-bold';
  }
  return { bgClass, isFewDays };
}

/**
 * Pure function: Computes Digit Day ('のつく日' 1..9, 0 + 'ゾロ目の日') heatmap metrics for a store.
 * - 'Nのつく日': Day with units digit = N (1..9, 0). (e.g. 1のつく日 = 1, 11, 21, 31日, 0のつく日 = 10, 20, 30日)
 * - 'ゾロ目の日': Day where tens digit == units digit (11, 22日). Month does not affect this.
 * - Excludes data outside the common period when period is specified.
 */
export function calculateStoreDigitDayHeatmap(
  records: DailyRecord[],
  period?: { startDate?: string; endDate?: string; hasCommonPeriod?: boolean } | null,
  store?: StoreProfile
): DigitDayStoreMetric[] {
  let targetRecords = records || [];

  if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
    targetRecords = targetRecords.filter(
      (r) => r.date >= period.startDate! && r.date <= period.endDate!
    );
  }

  // Group records by digit day keys
  const recordsByKey = new Map<string, DailyRecord[]>();
  for (const col of DIGIT_DAY_COLUMNS) {
    recordsByKey.set(col.key, []);
  }

  for (const r of targetRecords) {
    const day = r.day ?? parseInt(r.date.split('-')[2] || '0', 10);
    if (!day || isNaN(day) || day < 1 || day > 31) continue;

    const unit = day % 10;
    const unitKey = unit.toString();
    if (recordsByKey.has(unitKey)) {
      recordsByKey.get(unitKey)!.push(r);
    }

    // ゾロ目の日: 日の十の位と一の位が同じ日 (11, 22日)
    const isZorome = day >= 10 && Math.floor(day / 10) === unit;
    if (isZorome) {
      recordsByKey.get('ゾロ目')!.push(r);
    }
  }

  return DIGIT_DAY_COLUMNS.map((col) => {
    const list = recordsByKey.get(col.key) || [];
    if (list.length === 0) {
      return {
        digit: col.key,
        digitLabel: col.label,
        daysCount: 0,
        totalDiffCoins: 0,
        totalMachineDays: 0,
        avgDiffPerMachine: 0,
      };
    }

    let totalMachineDays = 0;
    let totalDiffCoins = 0;

    for (const r of list) {
      const machines = r.totalMachines > 0 ? r.totalMachines : (store?.totalMachinesApprox || 1);
      totalMachineDays += machines;
      const dayDiff = r.totalDiffCoins !== 0 ? r.totalDiffCoins : (r.avgDiffCoins || 0) * machines;
      totalDiffCoins += dayDiff;
    }

    const avgDiffPerMachine =
      totalMachineDays > 0 ? Math.round((totalDiffCoins / totalMachineDays) * 10) / 10 : 0;

    return {
      digit: col.key,
      digitLabel: col.label,
      daysCount: list.length,
      totalDiffCoins: Math.round(totalDiffCoins),
      totalMachineDays,
      avgDiffPerMachine,
    };
  });
}

/**
 * Extracts and compares performance of common models across stores.
 */
export function calculateCommonModels(
  stores: StoreProfile[],
  storeRecordsMap: Map<string, DailyRecord[]>
): CommonModelComparison[] {
  // Model name -> storeId -> stats
  const modelMap = new Map<
    string,
    Map<
      string,
      {
        totalMachs: number;
        totalDiff: number;
        totalWins: number;
        totalGames: number;
        daysCount: number;
      }
    >
  >();

  for (const s of stores) {
    const records = storeRecordsMap.get(s.id) || [];
    for (const r of records) {
      if (!r.models) continue;
      for (const m of r.models) {
        const name = normalizeModelName(m.modelName, s.modelAliasDictionary);
        if (!name) continue;
        if (!modelMap.has(name)) modelMap.set(name, new Map());
        const storeMap = modelMap.get(name)!;
        if (!storeMap.has(s.id)) {
          storeMap.set(s.id, {
            totalMachs: 0,
            totalDiff: 0,
            totalWins: 0,
            totalGames: 0,
            daysCount: 0,
          });
        }
        const st = storeMap.get(s.id)!;
        const machs = m.totalMachines || 1;
        st.totalMachs += machs;
        st.totalDiff += m.totalDiffCoins || (m.avgDiffCoins * machs);
        st.totalWins += m.winMachines || (m.winRate ? Math.round(machs * (m.winRate / 100)) : 0);
        st.totalGames += (m.avgGames || 0) * machs;
        st.daysCount++;
      }
    }
  }

  const results: CommonModelComparison[] = [];
  const minStores = Math.min(2, stores.length);

  for (const [modelName, storeMap] of modelMap.entries()) {
    if (storeMap.size < minStores) continue;

    const storeEntries: CommonModelComparison['stores'] = [];
    for (const s of stores) {
      const data = storeMap.get(s.id);
      if (data && data.totalMachs > 0) {
        const avgMachs = Math.round((data.totalMachs / Math.max(1, data.daysCount)) * 10) / 10;
        const avgDiff = Math.round(data.totalDiff / data.totalMachs);
        const winRate = Math.round((data.totalWins / data.totalMachs) * 1000) / 10;
        const avgGames = Math.round(data.totalGames / data.totalMachs);
        const inCoins = avgGames * 3;
        const outCoins = inCoins + avgDiff;
        const payout = inCoins > 0 ? Math.round((outCoins / inCoins) * 1000) / 10 : 100;

        storeEntries.push({
          storeId: s.id,
          storeName: s.name,
          machinesPerDay: avgMachs,
          avgDiffCoins: avgDiff,
          winRate,
          avgGames,
          payoutRate: payout,
        });
      }
    }

    if (storeEntries.length >= minStores) {
      results.push({
        modelName,
        storesCount: storeEntries.length,
        stores: storeEntries,
      });
    }
  }

  // Sort by highest average machines or total occurrences
  results.sort((a, b) => b.storesCount - a.storesCount);
  return results.slice(0, 20);
}

/**
 * Generates purely data-grounded automatic summary statements (no speculations).
 */
export function generateStoreSummaryStatement(
  metric: StorePerMachineMetrics
): StoreSummaryStatement {
  const parts: string[] = [];

  // 1. Base level
  parts.push(
    `台あたり平均差枚は ${metric.avgDiffPerMachine >= 0 ? '+' : ''}${metric.avgDiffPerMachine}枚（機械割 ${metric.payoutRate}%、勝率 ${metric.winRate}%、平均 ${metric.avgGames}G）`
  );

  // 2. Special day lift
  if (metric.specialDaysCount > 0) {
    parts.push(
      `特日（${metric.specialDaysCount}日）は通常日比で差枚リフト ${metric.specialLift >= 0 ? '+' : ''}${metric.specialLift}枚/台（機械割 ${metric.specialLiftPayout >= 0 ? '+' : ''}${metric.specialLiftPayout}pt）`
    );
  }

  // 3. High payout rate
  if (metric.highPayout5kRate > 0) {
    parts.push(`5,000枚OVER発生率は ${metric.highPayout5kRate}%`);
  }

  const statement = `${metric.storeName}: ${parts.join('。')}。`;

  return {
    storeId: metric.storeId,
    storeName: metric.storeName,
    statement,
  };
}

/**
 * Main Pure Function: Computes full multi-store comparison.
 */
export function compareStores(
  stores: StoreProfile[],
  options?: {
    periodMode?: 'common' | 'all';
    bootstrapIterations?: number;
    seed?: number;
  }
): StoreComparisonResult {
  const periodMode = options?.periodMode || 'common';

  const warnings: string[] = [];
  const commonPeriod = calculateCommonPeriod(stores);

  if (stores.length >= 2 && !commonPeriod.hasCommonPeriod && periodMode === 'common') {
    warnings.push(
      '選択された店舗間に共通する営業日が存在しないため、各店舗の全期間データで比較しています。'
    );
  }

  const storeRecordsMap = new Map<string, DailyRecord[]>();
  const evaluatedStores: StorePerMachineMetrics[] = [];
  const monthlyTrends: Record<string, MonthlyStoreTrend[]> = {};
  const digitDayHeatmaps: Record<string, DigitDayStoreMetric[]> = {};
  const dowHeatmaps: Record<string, DayOfWeekStoreMetric[]> = {};
  const categoryCompositions: Record<string, CategoryComposition[]> = {};

  for (const store of stores) {
    const raw = store.dailyRecords || [];
    const filtered = filterStoreRecordsByPeriod(raw, periodMode, commonPeriod);
    storeRecordsMap.set(store.id, filtered);

    if (filtered.length < 7) {
      warnings.push(
        `「${store.name}」は比較対象データが${filtered.length}日と少数です。統計的信頼性が低い可能性があります。`
      );
    }

    const m = calculateStorePerMachineMetrics(store, filtered);
    evaluatedStores.push(m);

    monthlyTrends[store.id] = calculateStoreMonthlyTrends(store, filtered);
    digitDayHeatmaps[store.id] = calculateStoreDigitDayHeatmap(raw, commonPeriod, store);
    dowHeatmaps[store.id] = calculateStoreDowHeatmap(store, filtered);
    categoryCompositions[store.id] = calculateStoreCategoryComposition(filtered);
  }

  // Common models
  const commonModels = calculateCommonModels(stores, storeRecordsMap);

  // Summary statements
  const summaryStatements = evaluatedStores.map(generateStoreSummaryStatement);

  return {
    periodMode,
    commonPeriod,
    evaluatedStores,
    monthlyTrends,
    digitDayHeatmaps,
    dowHeatmaps,
    categoryCompositions,
    commonModels,
    summaryStatements,
    warnings,
  };
}
