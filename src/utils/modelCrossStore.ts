/**
 * Cross-Store Model Analysis Utility (機種×店舗 横断比較エンジン)
 *
 * 【設計思想】
 * - 複数店舗のデータを集約し、機種ごとに各店舗の台数・台あたり差枚・出率（IN加重）・稼働日数を純関数で集計。
 * - 複数店舗に設置されている機種（共通機種）を上位にソートし、単一店舗のみの機種に識別フラグを付与。
 * - 選択機種の月別推移（店舗別・全店合計）および、settingRange.ts による出率ベース設定推定（平均設定相当・高設定割合）を提供。
 * - 仕様テーブル未登録機種は無理に推定せず、未登録の旨を明示。
 */

import { DailyRecord, StoreProfile } from '../data/types';
import { normalizeModelName } from './modelName';
import { StoreCommonPeriod } from './storeComparison';
import {
  interpolateSettingEquivalent,
  calculateHighSettingRange,
  HighSettingRange,
} from './settingRange';
import {
  ModelSettingSpec,
  findSpecForModel,
  loadAllSettingSpecsSync,
} from './settingSpecs';
import { ALL_STORES_TOTAL_STORE_ID, ALL_STORES_TOTAL_NAME } from './conditionAnalysis';

export interface StoreModelMetric {
  storeId: string;
  storeName: string;
  avgMachines: number; // 平均台数 (台)
  totalMachineDays: number; // 延べ台日数
  totalDiffCoins: number; // 総差枚
  avgDiffCoins: number; // 台あたり平均差枚 (全台の差枚の合計 ÷ 全台の台日数)
  totalGames: number; // 総G数
  totalInCoins: number; // 総IN枚数
  totalOutCoins: number; // 総OUT枚数
  payoutRate: number; // 出率 (IN加重) = totalOutCoins / totalInCoins * 100
  operatingDays: number; // 稼働日数 (該当機種のデータが存在する営業日数)
  winMachines?: number;
}

export interface ModelCrossStoreRow {
  modelName: string;
  isCommon: boolean; // 複数店舗（>=2店舗）に存在するか
  storeCount: number; // 設置店舗数
  storeMetrics: Record<string, StoreModelMetric | null>; // storeId -> metric
  total: StoreModelMetric; // 全店合計
}

export interface ModelMonthlyTrendPoint {
  yearMonth: string; // '2024-05'
  monthLabel: string; // '24/05'
  totalAvgDiff: number; // 全店平均
  totalMachineDays: number;
  [storeKey: string]: number | string | undefined; // 'store_storeId' -> avgDiffCoins
}

export interface ModelStoreSettingEstimation {
  storeId: string;
  storeName: string;
  payoutRate: number;
  totalGames: number;
  hasSpec: boolean;
  specName?: string;
  settingEquivalent?: number; // 平均設定相当 (例: 3.42)
  highSettingRange?: HighSettingRange; // 高設定(設定4以上)の割合範囲
  unregisteredMessage?: string;
}

/**
 * Filter daily records by common period if provided
 */
export function filterRecordsByPeriod(
  records: DailyRecord[],
  period?: StoreCommonPeriod | null
): DailyRecord[] {
  if (!period || !period.startDate || !period.endDate || period.hasCommonPeriod === false) {
    return records;
  }
  return records.filter((r) => r.date >= period.startDate && r.date <= period.endDate);
}

/**
 * Calculates a specific store's performance metrics for a given model
 */
export function calculateStoreModelMetric(
  records: DailyRecord[],
  store: StoreProfile,
  targetModelName: string
): StoreModelMetric | null {
  const normTarget = normalizeModelName(targetModelName);
  if (!normTarget) return null;

  let totalMachineDays = 0;
  let totalDiffCoins = 0;
  let totalGames = 0;
  let totalInCoins = 0;
  let totalOutCoins = 0;
  let operatingDays = 0;
  let winMachines = 0;

  for (const dr of records) {
    let dayMachines = 0;
    let dayDiff = 0;
    let dayGames = 0;
    let dayIn = 0;
    let dayOut = 0;
    let dayWin = 0;
    let found = false;

    // 1. Try machine-level records first
    const machinesList = dr.machines;
    if (machinesList && machinesList.length > 0) {
      for (const mr of machinesList) {
        const mrNorm = normalizeModelName(mr.modelName, store.modelAliasDictionary);
        if (mrNorm === normTarget) {
          found = true;
          dayMachines += 1;
          dayDiff += mr.diff;
          dayGames += mr.games;
          const inC = mr.games * 3;
          dayIn += inC;
          dayOut += inC + mr.diff;
          if (mr.diff > 0) dayWin += 1;
        }
      }
    }

    // 2. If no machine records matched, fallback to model-level records
    if (!found && dr.models && dr.models.length > 0) {
      for (const m of dr.models) {
        const mNorm = normalizeModelName(m.modelName, store.modelAliasDictionary);
        if (mNorm === normTarget) {
          found = true;
          const mCount = m.totalMachines > 0 ? m.totalMachines : 1;
          const mDiff =
            m.totalDiffCoins !== undefined
              ? m.totalDiffCoins
              : Math.round((m.avgDiffCoins || 0) * mCount);
          const mGames = Math.round((m.avgGames || 0) * mCount);
          const inC = mGames * 3;
          dayMachines += mCount;
          dayDiff += mDiff;
          dayGames += mGames;
          dayIn += inC;
          dayOut += inC + mDiff;
          dayWin += m.winMachines || 0;
        }
      }
    }

    if (found && dayMachines > 0) {
      operatingDays += 1;
      totalMachineDays += dayMachines;
      totalDiffCoins += dayDiff;
      totalGames += dayGames;
      totalInCoins += dayIn;
      totalOutCoins += dayOut;
      winMachines += dayWin;
    }
  }

  if (operatingDays === 0 || totalMachineDays === 0) {
    return null;
  }

  const avgMachines = Math.round((totalMachineDays / operatingDays) * 10) / 10;
  const avgDiffCoins = Math.round((totalDiffCoins / totalMachineDays) * 10) / 10;
  const payoutRate =
    totalInCoins > 0 ? Math.round((totalOutCoins / totalInCoins) * 10000) / 100 : 100.0;

  return {
    storeId: store.id,
    storeName: store.name,
    avgMachines,
    totalMachineDays,
    totalDiffCoins,
    avgDiffCoins,
    totalGames,
    totalInCoins,
    totalOutCoins,
    payoutRate,
    operatingDays,
    winMachines,
  };
}

/**
 * Calculates cross-store model rows for all unique models across stores.
 * - Rows are ordered such that common models (storeCount >= 2) appear first.
 * - Single-store models have isCommon = false and can be badged.
 */
export function calculateCrossStoreModelRows(
  stores: StoreProfile[],
  options: {
    period?: StoreCommonPeriod | null;
  } = {}
): ModelCrossStoreRow[] {
  if (!stores || stores.length === 0) return [];

  // 1. Gather all normalized model names across all stores
  const modelNameSet = new Set<string>();
  const storeFilteredRecordsMap = new Map<string, DailyRecord[]>();

  for (const store of stores) {
    const recs = filterRecordsByPeriod(store.dailyRecords || [], options.period);
    storeFilteredRecordsMap.set(store.id, recs);

    for (const dr of recs) {
      if (dr.machines) {
        for (const mr of dr.machines) {
          const norm = normalizeModelName(mr.modelName, store.modelAliasDictionary);
          if (norm) modelNameSet.add(norm);
        }
      }
      if (dr.models) {
        for (const m of dr.models) {
          const norm = normalizeModelName(m.modelName, store.modelAliasDictionary);
          if (norm) modelNameSet.add(norm);
        }
      }
    }
  }

  const rows: ModelCrossStoreRow[] = [];

  for (const modelName of modelNameSet) {
    const storeMetrics: Record<string, StoreModelMetric | null> = {};
    let presentStoreCount = 0;

    let grandMachineDays = 0;
    let grandDiffCoins = 0;
    let grandGames = 0;
    let grandInCoins = 0;
    let grandOutCoins = 0;
    let grandWinMachines = 0;
    let sumInstalledMachines = 0;
    const allStoreDates = new Set<string>();

    for (const store of stores) {
      const recs = storeFilteredRecordsMap.get(store.id) || [];
      const metric = calculateStoreModelMetric(recs, store, modelName);
      storeMetrics[store.id] = metric;

      if (metric) {
        presentStoreCount += 1;
        grandMachineDays += metric.totalMachineDays;
        grandDiffCoins += metric.totalDiffCoins;
        grandGames += metric.totalGames;
        grandInCoins += metric.totalInCoins;
        grandOutCoins += metric.totalOutCoins;
        grandWinMachines += metric.winMachines || 0;
        sumInstalledMachines += metric.avgMachines;

        // Collect unique operating dates across stores
        for (const dr of recs) {
          const hasM =
            dr.machines?.some(
              (mr) => normalizeModelName(mr.modelName, store.modelAliasDictionary) === modelName
            ) ||
            dr.models?.some(
              (m) => normalizeModelName(m.modelName, store.modelAliasDictionary) === modelName
            );
          if (hasM) {
            allStoreDates.add(dr.date);
          }
        }
      }
    }

    if (presentStoreCount === 0 || grandMachineDays === 0) continue;

    const totalAvgDiff = Math.round((grandDiffCoins / grandMachineDays) * 10) / 10;
    const totalPayoutRate =
      grandInCoins > 0 ? Math.round((grandOutCoins / grandInCoins) * 10000) / 100 : 100.0;

    const totalMetric: StoreModelMetric = {
      storeId: ALL_STORES_TOTAL_STORE_ID,
      storeName: ALL_STORES_TOTAL_NAME,
      avgMachines: Math.round(sumInstalledMachines * 10) / 10,
      totalMachineDays: grandMachineDays,
      totalDiffCoins: grandDiffCoins,
      avgDiffCoins: totalAvgDiff,
      totalGames: grandGames,
      totalInCoins: grandInCoins,
      totalOutCoins: grandOutCoins,
      payoutRate: totalPayoutRate,
      operatingDays: allStoreDates.size,
      winMachines: grandWinMachines,
    };

    rows.push({
      modelName,
      isCommon: presentStoreCount >= 2,
      storeCount: presentStoreCount,
      storeMetrics,
      total: totalMetric,
    });
  }

  // Sort: 1) Common models (isCommon = true) first
  // 2) Within groups, sort by total machine days descending (then diffCoins)
  return rows.sort((a, b) => {
    if (a.isCommon !== b.isCommon) {
      return a.isCommon ? -1 : 1;
    }
    if (b.total.totalMachineDays !== a.total.totalMachineDays) {
      return b.total.totalMachineDays - a.total.totalMachineDays;
    }
    return b.total.totalDiffCoins - a.total.totalDiffCoins;
  });
}

/**
 * Calculates monthly trend data (台あたり差枚) for a specific model across all stores and total
 */
export function calculateModelMonthlyTrends(
  stores: StoreProfile[],
  modelName: string,
  options: {
    period?: StoreCommonPeriod | null;
  } = {}
): ModelMonthlyTrendPoint[] {
  const normTarget = normalizeModelName(modelName);
  if (!normTarget || !stores || stores.length === 0) return [];

  // Group by year-month -> storeId -> { diff, machines }
  const monthStoreMap = new Map<
    string,
    Map<string, { totalDiff: number; totalMachines: number }>
  >();

  for (const store of stores) {
    const recs = filterRecordsByPeriod(store.dailyRecords || [], options.period);
    for (const dr of recs) {
      const ym = dr.yearMonth;
      if (!monthStoreMap.has(ym)) {
        monthStoreMap.set(ym, new Map());
      }
      const sMap = monthStoreMap.get(ym)!;
      if (!sMap.has(store.id)) {
        sMap.set(store.id, { totalDiff: 0, totalMachines: 0 });
      }
      const sEntry = sMap.get(store.id)!;

      // Extract machines
      let found = false;
      if (dr.machines && dr.machines.length > 0) {
        for (const mr of dr.machines) {
          if (normalizeModelName(mr.modelName, store.modelAliasDictionary) === normTarget) {
            found = true;
            sEntry.totalMachines += 1;
            sEntry.totalDiff += mr.diff;
          }
        }
      }
      if (!found && dr.models && dr.models.length > 0) {
        for (const m of dr.models) {
          if (normalizeModelName(m.modelName, store.modelAliasDictionary) === normTarget) {
            const mCount = m.totalMachines > 0 ? m.totalMachines : 1;
            const mDiff =
              m.totalDiffCoins !== undefined
                ? m.totalDiffCoins
                : Math.round((m.avgDiffCoins || 0) * mCount);
            sEntry.totalMachines += mCount;
            sEntry.totalDiff += mDiff;
          }
        }
      }
    }
  }

  const sortedMonths = Array.from(monthStoreMap.keys()).sort();
  const trendPoints: ModelMonthlyTrendPoint[] = [];

  for (const ym of sortedMonths) {
    const sMap = monthStoreMap.get(ym)!;
    let grandMonthDiff = 0;
    let grandMonthMachines = 0;

    const point: ModelMonthlyTrendPoint = {
      yearMonth: ym,
      monthLabel: ym.length >= 7 ? ym.slice(2).replace('-', '/') : ym,
      totalAvgDiff: 0,
      totalMachineDays: 0,
    };

    for (const store of stores) {
      const sEntry = sMap.get(store.id);
      if (sEntry && sEntry.totalMachines > 0) {
        const sAvg = Math.round((sEntry.totalDiff / sEntry.totalMachines) * 10) / 10;
        point[`store_${store.id}`] = sAvg;
        grandMonthDiff += sEntry.totalDiff;
        grandMonthMachines += sEntry.totalMachines;
      }
    }

    if (grandMonthMachines > 0) {
      point.totalAvgDiff = Math.round((grandMonthDiff / grandMonthMachines) * 10) / 10;
      point.totalMachineDays = grandMonthMachines;
      trendPoints.push(point);
    }
  }

  return trendPoints;
}

/**
 * Estimates payout-based setting parameters for a given model in each store (and total)
 * - Returns settingEquivalent and highSettingRange if spec is found.
 * - Displays unregistered message if spec is missing.
 */
export function estimateCrossStoreModelSettings(
  stores: StoreProfile[],
  modelName: string,
  allSpecs?: ModelSettingSpec[],
  options: {
    period?: StoreCommonPeriod | null;
  } = {}
): ModelStoreSettingEstimation[] {
  const specs = allSpecs || loadAllSettingSpecsSync();
  const spec = findSpecForModel(specs, modelName);

  const results: ModelStoreSettingEstimation[] = [];

  let grandGames = 0;
  let grandIn = 0;
  let grandOut = 0;

  for (const store of stores) {
    const recs = filterRecordsByPeriod(store.dailyRecords || [], options.period);
    const metric = calculateStoreModelMetric(recs, store, modelName);
    if (!metric) continue;

    grandGames += metric.totalGames;
    grandIn += metric.totalInCoins;
    grandOut += metric.totalOutCoins;

    if (spec && spec.settings && spec.settings.length > 0) {
      const equiv = interpolateSettingEquivalent(metric.payoutRate, spec);
      const highRange = calculateHighSettingRange(metric.payoutRate, spec, 4);
      results.push({
        storeId: store.id,
        storeName: store.name,
        payoutRate: metric.payoutRate,
        totalGames: metric.totalGames,
        hasSpec: true,
        specName: spec.modelName,
        settingEquivalent: equiv,
        highSettingRange: highRange,
      });
    } else {
      results.push({
        storeId: store.id,
        storeName: store.name,
        payoutRate: metric.payoutRate,
        totalGames: metric.totalGames,
        hasSpec: false,
        unregisteredMessage: '仕様未登録（設定推定不可・機種仕様の登録が必要です）',
      });
    }
  }

  // Include Total Estimation if there are 2 or more stores with this model
  if (results.length > 1 && grandIn > 0) {
    const totalPayoutRate = Math.round((grandOut / grandIn) * 10000) / 100;
    if (spec && spec.settings && spec.settings.length > 0) {
      const equiv = interpolateSettingEquivalent(totalPayoutRate, spec);
      const highRange = calculateHighSettingRange(totalPayoutRate, spec, 4);
      results.push({
        storeId: ALL_STORES_TOTAL_STORE_ID,
        storeName: ALL_STORES_TOTAL_NAME,
        payoutRate: totalPayoutRate,
        totalGames: grandGames,
        hasSpec: true,
        specName: spec.modelName,
        settingEquivalent: equiv,
        highSettingRange: highRange,
      });
    } else {
      results.push({
        storeId: ALL_STORES_TOTAL_STORE_ID,
        storeName: ALL_STORES_TOTAL_NAME,
        payoutRate: totalPayoutRate,
        totalGames: grandGames,
        hasSpec: false,
        unregisteredMessage: '仕様未登録（設定推定不可・機種仕様の登録が必要です）',
      });
    }
  }

  return results;
}
