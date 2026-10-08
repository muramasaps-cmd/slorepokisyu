import { StoreProfile } from '../data/types';
import {
  calculateTargetDateRanking,
  ModelTargetScore,
} from './targetRankingEngine';
import {
  calculateTargetMachineRanking,
  TargetMachineScore,
  MachineConfidenceLevel,
} from './targetMachineRanking';
import { getMachineIsland, parseIslandConfig } from './islandUtils';

export type CrossMetricMode = 'diffCoins' | 'yen';

export interface CrossStoreModelRank {
  rank: number;
  storeId: string;
  storeName: string;
  modelName: string;
  totalMachines: number;
  expectedDiffCoins: number;
  expectedYenProfit: number; // estimated yen using store rates
  predictedWinRate: number;
  predictedPayoutRate: number;
  compositeScore: number;
  tacticalReason: string;
  isSpecialDay: boolean;
  sampleDays: number;
}

export interface CrossStoreMachineRank {
  rank: number;
  storeId: string;
  storeName: string;
  machineNum: number;
  modelName: string;
  islandName?: string | null;
  totalScore: number;
  confidence: MachineConfidenceLevel;
  evidenceDays: number;
  cohortEvidenceDays: number;
  expectedDiffCoins: number; // shrunkDiff
  expectedYenProfit: number; // shrunkDiff * store exchange rate
  cohortAvgDiff: number;
  cohortWinRate: number;
  highSettingRate: number;
  isTailMatch: boolean;
  isZoro: boolean;
  reasons: string[];
}

export interface ExcludedStoreInfo {
  storeId: string;
  storeName: string;
  reason: string;
}

export interface CrossStoreRankingResult {
  targetDate: string;
  metricMode: CrossMetricMode;
  totalStoresCount: number;
  eligibleStoresCount: number;
  excludedStores: ExcludedStoreInfo[];
  modelRankings: CrossStoreModelRank[];
  machineRankings: CrossStoreMachineRank[];
}

export interface CrossStoreRankingOptions {
  metricMode?: CrossMetricMode; // default 'diffCoins'
  topModelCount?: number; // default 20
  topMachineCount?: number; // default 20
  selectedStoreIds?: string[]; // if specified, filters to these store IDs
}

/**
 * Converts coins to approximate expected player yen profit using store exchange rate.
 * Positive coins convert at (1000 / rateExchange) yen per coin.
 * Negative coins convert at (1000 / rateLend) yen per coin.
 */
export function convertCoinsToYen(
  coins: number,
  rateLend: number = 46,
  rateExchange: number = 52
): number {
  if (coins >= 0) {
    const unitPrice = rateExchange > 0 ? 1000 / rateExchange : 20;
    return Math.round(coins * unitPrice);
  } else {
    const lendPrice = rateLend > 0 ? 1000 / rateLend : 21.74;
    return Math.round(coins * lendPrice);
  }
}

/**
 * Calculates cross-store integrated rankings for models and individual machines.
 */
export function calculateCrossStoreRanking(
  stores: StoreProfile[],
  targetDate: string,
  options?: CrossStoreRankingOptions
): CrossStoreRankingResult {
  const metricMode = options?.metricMode || 'diffCoins';
  const topModelCount = options?.topModelCount || 20;
  const topMachineCount = options?.topMachineCount || 20;
  const filterStoreIds = options?.selectedStoreIds;

  const targetStores = filterStoreIds && filterStoreIds.length > 0
    ? stores.filter((s) => filterStoreIds.includes(s.id))
    : stores;

  const excludedStores: ExcludedStoreInfo[] = [];
  const eligibleModels: CrossStoreModelRank[] = [];
  const eligibleMachines: CrossStoreMachineRank[] = [];

  for (const store of targetStores) {
    const records = store.dailyRecords || [];
    const priorRecords = records.filter((r) => r.date < targetDate);

    // Exclusion checks
    if (records.length === 0) {
      excludedStores.push({
        storeId: store.id,
        storeName: store.name,
        reason: '出玉データが登録されていません',
      });
      continue;
    }

    if (priorRecords.length === 0) {
      excludedStores.push({
        storeId: store.id,
        storeName: store.name,
        reason: `対象日(${targetDate})以前の過去データが存在しません`,
      });
      continue;
    }

    const hasMachineData = records.some((r) => r.machines && r.machines.length > 0);
    const hasModelData = records.some((r) => r.models && r.models.length > 0);

    if (!hasModelData && !hasMachineData) {
      excludedStores.push({
        storeId: store.id,
        storeName: store.name,
        reason: '機種別・台番別の明細データがありません（日別サマリーのみ）',
      });
      continue;
    }

    const rateLend = store.rateLend || 46;
    const rateExchange = store.rateExchange || 52;

    // 1. Calculate store model forecast
    try {
      const modelForecast = calculateTargetDateRanking(
        targetDate,
        priorRecords,
        store.specialDayRules,
        store.oldEventDays,
        store.customRankingWeights
      );

      if (modelForecast && modelForecast.modelRankings.length > 0) {
        for (const m of modelForecast.modelRankings) {
          const expectedYen = convertCoinsToYen(m.expectedDiffCoins, rateLend, rateExchange);
          eligibleModels.push({
            rank: 0,
            storeId: store.id,
            storeName: store.name,
            modelName: m.modelName,
            totalMachines: m.totalMachines,
            expectedDiffCoins: m.expectedDiffCoins,
            expectedYenProfit: expectedYen,
            predictedWinRate: m.predictedWinRate,
            predictedPayoutRate: m.predictedPayoutRate,
            compositeScore: m.compositeScore,
            tacticalReason: m.tacticalReason,
            isSpecialDay: modelForecast.isSpecialDay,
            sampleDays: m.sampleDays,
          });
        }
      }
    } catch {
      // ignore
    }

    // 2. Calculate store machine forecast (if machine data exists)
    if (hasMachineData) {
      try {
        const machineResult = calculateTargetMachineRanking(
          targetDate,
          priorRecords,
          store.specialDayRules,
          undefined,
          { rankingWeights: store.customRankingWeights }
        );

        if (machineResult && machineResult.rankings.length > 0) {
          const islandDefs = parseIslandConfig(store.islandConfig);
          for (const mach of machineResult.rankings) {
            const expDiff = mach.stats.shrunkDiff;
            const expYen = convertCoinsToYen(expDiff, rateLend, rateExchange);
            const island = getMachineIsland(mach.machineNum, islandDefs);

            const reasons: string[] = [];
            if (mach.cohortEvidenceDays > 0) {
              reasons.push(
                `同コホート${mach.cohortEvidenceDays}日実績（台平均 ${mach.stats.cohortAvgDiff >= 0 ? '+' : ''}${mach.stats.cohortAvgDiff}枚、勝率${mach.stats.cohortWinRate}%）`
              );
            }
            if (mach.stats.highSettingCount > 0) {
              reasons.push(
                `高設定挙動 ${mach.evidenceDays}日中${mach.stats.highSettingCount}日 (${mach.stats.highSettingRate}%)`
              );
            }
            if (mach.stats.isTailMatch) {
              reasons.push('特定日末尾一致');
            } else if (mach.stats.isZoro) {
              reasons.push('ゾロ目台番');
            }

            eligibleMachines.push({
              rank: 0,
              storeId: store.id,
              storeName: store.name,
              machineNum: mach.machineNum,
              modelName: mach.modelName,
              islandName: island,
              totalScore: mach.totalScore,
              confidence: mach.confidence,
              evidenceDays: mach.evidenceDays,
              cohortEvidenceDays: mach.cohortEvidenceDays,
              expectedDiffCoins: expDiff,
              expectedYenProfit: expYen,
              cohortAvgDiff: mach.stats.cohortAvgDiff,
              cohortWinRate: mach.stats.cohortWinRate,
              highSettingRate: mach.stats.highSettingRate,
              isTailMatch: mach.stats.isTailMatch,
              isZoro: mach.stats.isZoro,
              reasons: reasons.slice(0, 2),
            });
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Sort model rankings by metricMode
  eligibleModels.sort((a, b) => {
    if (metricMode === 'yen') {
      return b.expectedYenProfit - a.expectedYenProfit;
    }
    return b.compositeScore - a.compositeScore;
  });
  eligibleModels.forEach((m, idx) => {
    m.rank = idx + 1;
  });

  // Sort machine rankings by metricMode
  eligibleMachines.sort((a, b) => {
    if (metricMode === 'yen') {
      return b.expectedYenProfit - a.expectedYenProfit;
    }
    return b.totalScore - a.totalScore;
  });
  eligibleMachines.forEach((m, idx) => {
    m.rank = idx + 1;
  });

  return {
    targetDate,
    metricMode,
    totalStoresCount: targetStores.length,
    eligibleStoresCount: targetStores.length - excludedStores.length,
    excludedStores,
    modelRankings: eligibleModels.slice(0, topModelCount),
    machineRankings: eligibleMachines.slice(0, topMachineCount),
  };
}
