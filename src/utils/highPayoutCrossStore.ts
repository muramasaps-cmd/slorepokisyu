import { StoreProfile, DailyRecord } from '../data/types';
import {
  analyzeHighPayoutMachines,
  HighPayoutFilterConfig,
  MachineCategory,
  MachineScaleType,
  getMachineCategory,
  getMachineScale,
  getCategoryLabel,
  getScaleLabel,
} from './highPayoutAnalytics';
import { StoreCommonPeriod } from './storeComparison';
import { getStoreColor, ALL_STORES_COLOR, ALL_STORES_NAME, ALL_STORES_ID } from './storeColors';

export interface CategorySummaryMetric {
  category: MachineCategory;
  label: string;
  totalEvaluated: number;
  highPayoutCount: number;
  rate: number; // highPayoutCount / totalEvaluated * 100 (%)
  share: number; // highPayoutCount / store.totalHighPayout * 100 (%)
}

export interface ScaleSummaryMetric {
  scaleType: MachineScaleType;
  label: string;
  totalEvaluated: number;
  highPayoutCount: number;
  rate: number; // highPayoutCount / totalEvaluated * 100 (%)
  share: number; // highPayoutCount / store.totalHighPayout * 100 (%)
}

export interface ReboundRetentionMetric {
  analyzedCount: number;
  reboundCount: number; // 上げ (前日マイナス → 当日高出率)
  reboundRate: number; // %
  retentionCount: number; // 据え置き (前日プラス → 当日高出率)
  retentionRate: number; // %
}

export interface ClusterMetric {
  totalHighDays: number;
  allStarDaysCount: number; // 3機種以上同時高出率
  allStarRate: number; // %
  pairDaysCount: number; // 2機種同時高出率
  pairRate: number; // %
  multiModelRate: number; // 2機種以上同時投入率 (allStar + pair) / totalHighDays * 100 (%)
  isolatedDaysCount: number; // 単品1機種のみ
  isolatedRate: number; // %
}

export interface StoreHighPayoutSummary {
  storeId: string;
  storeName: string;
  color: string;
  isTotal: boolean;
  daysCount: number;
  totalMachineDays: number; // total evaluated model-days
  highPayoutCount: number;
  highPayoutRate: number; // %
  avgPayoutRateWhenHigh: number;
  avgDiffCoinsWhenHigh: number;
  isFewDays: boolean; // daysCount < 3
  isSmallSample: boolean; // totalMachineDays < 10
  categories: Record<MachineCategory, CategorySummaryMetric>;
  scaleTypes: Record<MachineScaleType, ScaleSummaryMetric>;
  reboundRetention: ReboundRetentionMetric;
  cluster: ClusterMetric;
}

export interface CrossStoreHighPayoutResult {
  storeSummaries: StoreHighPayoutSummary[];
  totalSummary: StoreHighPayoutSummary;
  allColumns: StoreHighPayoutSummary[];
  config: HighPayoutFilterConfig;
  commonPeriodApplied: boolean;
  hasFewDaysStores: boolean;
  fewDaysStoreNames: string[];
}

export const DEFAULT_HIGH_PAYOUT_CONFIG: HighPayoutFilterConfig = {
  minPayoutRate: 105.0,
  minGames: 3000,
  minDiffCoins: 0,
  categoryFilter: 'all',
};

const ALL_CATEGORIES: MachineCategory[] = ['smart_slot', 'juggler', 'a_type', 'other'];
const ALL_SCALES: MachineScaleType[] = ['large', 'medium', 'small'];

/**
 * Filter daily records according to common period if active
 */
export function filterRecordsByPeriod(
  records: DailyRecord[],
  period?: StoreCommonPeriod | null
): DailyRecord[] {
  if (!records || records.length === 0) return [];
  if (!period || !period.startDate || !period.endDate) {
    return records;
  }
  return records.filter((r) => r.date >= period.startDate! && r.date <= period.endDate!);
}

/**
 * Calculate high payout characteristics summary for a single store
 */
export function calculateStoreHighPayoutSummary(
  store: StoreProfile,
  config: HighPayoutFilterConfig = DEFAULT_HIGH_PAYOUT_CONFIG,
  period?: StoreCommonPeriod | null,
  storesContext?: StoreProfile[]
): StoreHighPayoutSummary {
  const filteredRecords = filterRecordsByPeriod(store.dailyRecords || [], period);
  const result = analyzeHighPayoutMachines(filteredRecords, config);

  const distinctDates = new Set(filteredRecords.map((r) => r.date).filter(Boolean));
  const daysCount = distinctDates.size;
  const totalMachineDays = result.allItems.length;
  const highPayoutCount = result.highItems.length;
  const highPayoutRate =
    totalMachineDays > 0
      ? Math.round((highPayoutCount / totalMachineDays) * 1000) / 10
      : 0;

  // Average payout and diff coins when high payout
  let avgPayoutRateWhenHigh = 100.0;
  let avgDiffCoinsWhenHigh = 0;
  if (result.highItems.length > 0) {
    const sumPayout = result.highItems.reduce((acc, it) => acc + (it.payoutRate || 100), 0);
    const sumDiff = result.highItems.reduce((acc, it) => acc + (it.avgDiffCoins || 0), 0);
    avgPayoutRateWhenHigh = Math.round((sumPayout / result.highItems.length) * 10) / 10;
    avgDiffCoinsWhenHigh = Math.round(sumDiff / result.highItems.length);
  }

  // Category breakdown
  const categoryMap = {} as Record<MachineCategory, CategorySummaryMetric>;
  for (const cat of ALL_CATEGORIES) {
    const totalCat = result.allItems.filter((it) => it.category === cat).length;
    const highCat = result.highItems.filter((it) => it.category === cat).length;
    const rate = totalCat > 0 ? Math.round((highCat / totalCat) * 1000) / 10 : 0;
    const share = highPayoutCount > 0 ? Math.round((highCat / highPayoutCount) * 1000) / 10 : 0;
    categoryMap[cat] = {
      category: cat,
      label: getCategoryLabel(cat),
      totalEvaluated: totalCat,
      highPayoutCount: highCat,
      rate,
      share,
    };
  }

  // Scale breakdown
  const scaleMap = {} as Record<MachineScaleType, ScaleSummaryMetric>;
  for (const sc of ALL_SCALES) {
    const totalSc = result.allItems.filter((it) => it.scaleType === sc).length;
    const highSc = result.highItems.filter((it) => it.scaleType === sc).length;
    const rate = totalSc > 0 ? Math.round((highSc / totalSc) * 1000) / 10 : 0;
    const share = highPayoutCount > 0 ? Math.round((highSc / highPayoutCount) * 1000) / 10 : 0;
    scaleMap[sc] = {
      scaleType: sc,
      label: getScaleLabel(sc),
      totalEvaluated: totalSc,
      highPayoutCount: highSc,
      rate,
      share,
    };
  }

  // Rebound vs Retention
  const reboundRetention: ReboundRetentionMetric = {
    analyzedCount: result.reboundStat.analyzedCount,
    reboundCount: result.reboundStat.reboundCount,
    reboundRate: result.reboundStat.reboundRate,
    retentionCount: result.reboundStat.retentionCount,
    retentionRate: result.reboundStat.retentionRate,
  };

  // Cluster breakdown
  const cluster: ClusterMetric = {
    totalHighDays: result.clusterStat.totalHighDays,
    allStarDaysCount: result.clusterStat.allStarDaysCount,
    allStarRate: result.clusterStat.allStarDaysRate,
    pairDaysCount: result.clusterStat.pairDaysCount,
    pairRate: result.clusterStat.pairDaysRate,
    multiModelRate:
      result.clusterStat.totalHighDays > 0
        ? Math.round(
            ((result.clusterStat.allStarDaysCount + result.clusterStat.pairDaysCount) /
              result.clusterStat.totalHighDays) *
              1000
          ) / 10
        : 0,
    isolatedDaysCount: result.clusterStat.isolatedDaysCount,
    isolatedRate: result.clusterStat.isolatedDaysRate,
  };

  const isFewDays = daysCount < 3;
  const isSmallSample = totalMachineDays < 10;
  const color = getStoreColor(store.id, storesContext);

  return {
    storeId: store.id,
    storeName: store.name,
    color,
    isTotal: false,
    daysCount,
    totalMachineDays,
    highPayoutCount,
    highPayoutRate,
    avgPayoutRateWhenHigh,
    avgDiffCoinsWhenHigh,
    isFewDays,
    isSmallSample,
    categories: categoryMap,
    scaleTypes: scaleMap,
    reboundRetention,
    cluster,
  };
}

/**
 * Compute All Stores Total ("全店合計") summary by weighting individual summaries
 */
export function calculateAllStoresTotalSummary(
  storeSummaries: StoreHighPayoutSummary[],
  stores: StoreProfile[],
  period?: StoreCommonPeriod | null
): StoreHighPayoutSummary {
  // Compute union of distinct operating dates
  const allUniqueDates = new Set<string>();
  stores.forEach((store) => {
    const filtered = filterRecordsByPeriod(store.dailyRecords || [], period);
    filtered.forEach((r) => {
      if (r.date) allUniqueDates.add(r.date);
    });
  });

  const daysCount = allUniqueDates.size;
  const totalMachineDays = storeSummaries.reduce((acc, s) => acc + s.totalMachineDays, 0);
  const highPayoutCount = storeSummaries.reduce((acc, s) => acc + s.highPayoutCount, 0);
  const highPayoutRate =
    totalMachineDays > 0
      ? Math.round((highPayoutCount / totalMachineDays) * 1000) / 10
      : 0;

  // Weighted average payout rate and diff coins
  let avgPayoutRateWhenHigh = 100.0;
  let avgDiffCoinsWhenHigh = 0;
  if (highPayoutCount > 0) {
    const totalPayoutWeight = storeSummaries.reduce(
      (acc, s) => acc + s.avgPayoutRateWhenHigh * s.highPayoutCount,
      0
    );
    const totalDiffWeight = storeSummaries.reduce(
      (acc, s) => acc + s.avgDiffCoinsWhenHigh * s.highPayoutCount,
      0
    );
    avgPayoutRateWhenHigh = Math.round((totalPayoutWeight / highPayoutCount) * 10) / 10;
    avgDiffCoinsWhenHigh = Math.round(totalDiffWeight / highPayoutCount);
  }

  // Aggregate Category Breakdown
  const categoryMap = {} as Record<MachineCategory, CategorySummaryMetric>;
  for (const cat of ALL_CATEGORIES) {
    const totalCat = storeSummaries.reduce((acc, s) => acc + s.categories[cat].totalEvaluated, 0);
    const highCat = storeSummaries.reduce((acc, s) => acc + s.categories[cat].highPayoutCount, 0);
    const rate = totalCat > 0 ? Math.round((highCat / totalCat) * 1000) / 10 : 0;
    const share = highPayoutCount > 0 ? Math.round((highCat / highPayoutCount) * 1000) / 10 : 0;
    categoryMap[cat] = {
      category: cat,
      label: getCategoryLabel(cat),
      totalEvaluated: totalCat,
      highPayoutCount: highCat,
      rate,
      share,
    };
  }

  // Aggregate Scale Breakdown
  const scaleMap = {} as Record<MachineScaleType, ScaleSummaryMetric>;
  for (const sc of ALL_SCALES) {
    const totalSc = storeSummaries.reduce((acc, s) => acc + s.scaleTypes[sc].totalEvaluated, 0);
    const highSc = storeSummaries.reduce((acc, s) => acc + s.scaleTypes[sc].highPayoutCount, 0);
    const rate = totalSc > 0 ? Math.round((highSc / totalSc) * 1000) / 10 : 0;
    const share = highPayoutCount > 0 ? Math.round((highSc / highPayoutCount) * 1000) / 10 : 0;
    scaleMap[sc] = {
      scaleType: sc,
      label: getScaleLabel(sc),
      totalEvaluated: totalSc,
      highPayoutCount: highSc,
      rate,
      share,
    };
  }

  // Aggregate Rebound vs Retention
  const totalAnalyzed = storeSummaries.reduce(
    (acc, s) => acc + s.reboundRetention.analyzedCount,
    0
  );
  const totalRebound = storeSummaries.reduce((acc, s) => acc + s.reboundRetention.reboundCount, 0);
  const totalRetention = storeSummaries.reduce(
    (acc, s) => acc + s.reboundRetention.retentionCount,
    0
  );
  const reboundRetention: ReboundRetentionMetric = {
    analyzedCount: totalAnalyzed,
    reboundCount: totalRebound,
    reboundRate: totalAnalyzed > 0 ? Math.round((totalRebound / totalAnalyzed) * 1000) / 10 : 0,
    retentionCount: totalRetention,
    retentionRate:
      totalAnalyzed > 0 ? Math.round((totalRetention / totalAnalyzed) * 1000) / 10 : 0,
  };

  // Aggregate Cluster
  const totalHighDays = storeSummaries.reduce((acc, s) => acc + s.cluster.totalHighDays, 0);
  const totalAllStar = storeSummaries.reduce((acc, s) => acc + s.cluster.allStarDaysCount, 0);
  const totalPair = storeSummaries.reduce((acc, s) => acc + s.cluster.pairDaysCount, 0);
  const totalIsolated = storeSummaries.reduce((acc, s) => acc + s.cluster.isolatedDaysCount, 0);
  const cluster: ClusterMetric = {
    totalHighDays,
    allStarDaysCount: totalAllStar,
    allStarRate: totalHighDays > 0 ? Math.round((totalAllStar / totalHighDays) * 1000) / 10 : 0,
    pairDaysCount: totalPair,
    pairRate: totalHighDays > 0 ? Math.round((totalPair / totalHighDays) * 1000) / 10 : 0,
    multiModelRate:
      totalHighDays > 0
        ? Math.round(((totalAllStar + totalPair) / totalHighDays) * 1000) / 10
        : 0,
    isolatedDaysCount: totalIsolated,
    isolatedRate: totalHighDays > 0 ? Math.round((totalIsolated / totalHighDays) * 1000) / 10 : 0,
  };

  return {
    storeId: ALL_STORES_ID,
    storeName: ALL_STORES_NAME,
    color: ALL_STORES_COLOR,
    isTotal: true,
    daysCount,
    totalMachineDays,
    highPayoutCount,
    highPayoutRate,
    avgPayoutRateWhenHigh,
    avgDiffCoinsWhenHigh,
    isFewDays: false,
    isSmallSample: totalMachineDays < 10,
    categories: categoryMap,
    scaleTypes: scaleMap,
    reboundRetention,
    cluster,
  };
}

/**
 * Main cross-store entry point for High Payout analysis
 */
export function calculateCrossStoreHighPayout(
  stores: StoreProfile[],
  options?: {
    config?: Partial<HighPayoutFilterConfig>;
    period?: StoreCommonPeriod | null;
  }
): CrossStoreHighPayoutResult {
  const mergedConfig: HighPayoutFilterConfig = {
    ...DEFAULT_HIGH_PAYOUT_CONFIG,
    ...(options?.config || {}),
  };
  const period = options?.period ?? null;
  const commonPeriodApplied = Boolean(period && period.startDate && period.endDate);

  const storeSummaries = stores.map((s) =>
    calculateStoreHighPayoutSummary(s, mergedConfig, period, stores)
  );

  const totalSummary = calculateAllStoresTotalSummary(storeSummaries, stores, period);

  const fewDaysStores = storeSummaries.filter((s) => s.isFewDays);
  const hasFewDaysStores = fewDaysStores.length > 0;
  const fewDaysStoreNames = fewDaysStores.map((s) => s.storeName);

  return {
    storeSummaries,
    totalSummary,
    allColumns: [...storeSummaries, totalSummary],
    config: mergedConfig,
    commonPeriodApplied,
    hasFewDaysStores,
    fewDaysStoreNames,
  };
}
