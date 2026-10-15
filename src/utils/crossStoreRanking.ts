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
import { getStoreRatesForModel } from './modelName';

export type CrossMetricMode = 'diffCoins' | 'yen';

export interface CrossStoreModelRank {
  rank: number;
  storeId: string;
  storeName: string;
  modelName: string;
  totalMachines: number;
  expectedDiffCoins: number; // shrunk expected diff coins
  expectedYenProfit: number; // estimated yen using store rates
  predictedWinRate: number;
  predictedPayoutRate: number;
  compositeScore: number; // intra-store reference score
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
  totalScore: number; // intra-store reference score
  confidence: MachineConfidenceLevel;
  evidenceDays: number;
  cohortEvidenceDays: number;
  shrunkDiff: number; // cross-store shrunk diff
  expectedDiffCoins: number; // alias for shrunkDiff for display & compatibility
  expectedYenProfit: number; // shrunkDiff converted to yen using store exchange rate
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
  includeLowConfidence?: boolean; // default false: exclude low confidence machines
  onProgress?: (progress: number, currentStore?: string) => void;
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
  const includeLowConfidence = options?.includeLowConfidence ?? false;

  const targetStores = filterStoreIds && filterStoreIds.length > 0
    ? stores.filter((s) => filterStoreIds.includes(s.id))
    : stores;

  const excludedStores: ExcludedStoreInfo[] = [];
  const eligibleModels: CrossStoreModelRank[] = [];
  const eligibleMachines: CrossStoreMachineRank[] = [];

  for (let sIdx = 0; sIdx < targetStores.length; sIdx++) {
    const store = targetStores[sIdx];

    if (options?.onProgress) {
      const progress = Math.round(((sIdx + 1) / targetStores.length) * 100);
      options.onProgress(progress, store.name);
    }

    const records = store.dailyRecords || [];
    // Strictly filter out any records on or after targetDate to prevent future leakage
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
    const storeEvalDays = priorRecords.length;

    // 1. Calculate store model forecast
    try {
      const modelForecast = calculateTargetDateRanking(
        targetDate,
        priorRecords,
        store.specialDayRules,
        store.oldEventDays,
        store.customRankingWeights,
        {
          includeReusedMachines: store.includeReusedMachinesInStats,
          aliasDictionary: store.modelAliasDictionary,
        }
      );

      if (!modelForecast || modelForecast.modelRankings.length === 0) {
        excludedStores.push({
          storeId: store.id,
          storeName: store.name,
          reason: `機種予測の有効なデータを算出できませんでした (対象日: ${targetDate})`,
        });
      } else {
        for (const m of modelForecast.modelRankings) {
          // Shrink expected diff towards 0 based on sample days vs store evaluated days
          const modelWeight = m.sampleDays / (m.sampleDays + 3);
          const storeWeight = Math.min(1.0, storeEvalDays / 15);
          const shrunkModelDiff = Math.round(m.expectedDiffCoins * modelWeight * storeWeight);

          const { rateLend: mRateLend, rateExchange: mRateExch } = getStoreRatesForModel(store, m.modelName);
          const expectedYen = convertCoinsToYen(shrunkModelDiff, mRateLend, mRateExch);
          const storeContext = modelForecast.isSpecialDay
            ? `来店日が店舗特日 (実績${m.sampleDays}日)`
            : `同曜日実績${m.sampleDays}日`;

          let tacticalReason = '';
          if (m.sampleDays === 0) {
            tacticalReason = '根拠が少ないため参考表示';
          } else if (m.tacticalReason) {
            tacticalReason = `${m.tacticalReason} (${storeContext}, 根拠${m.sampleDays}日)`;
          } else {
            tacticalReason = `${storeContext}・平均差枚${m.expectedDiffCoins >= 0 ? '+' : ''}${m.expectedDiffCoins}枚 (勝率${m.predictedWinRate}%, 根拠${m.sampleDays}日)`;
          }

          eligibleModels.push({
            rank: 0,
            storeId: store.id,
            storeName: store.name,
            modelName: m.modelName,
            totalMachines: m.totalMachines,
            expectedDiffCoins: shrunkModelDiff,
            expectedYenProfit: expectedYen,
            predictedWinRate: m.predictedWinRate,
            predictedPayoutRate: m.predictedPayoutRate,
            compositeScore: m.compositeScore,
            tacticalReason,
            isSpecialDay: modelForecast.isSpecialDay,
            sampleDays: m.sampleDays,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      excludedStores.push({
        storeId: store.id,
        storeName: store.name,
        reason: `機種予測の計算中にエラーが発生しました: ${message}`,
      });
    }

    // 2. Calculate store machine forecast (if machine data exists)
    if (hasMachineData) {
      try {
        const machineResult = calculateTargetMachineRanking(
          targetDate,
          priorRecords,
          store.specialDayRules,
          store.customMachineRankingWeights,
          {
            rankingWeights: store.customRankingWeights,
            includeReusedMachines: store.includeReusedMachinesInStats,
            aliasDictionary: store.modelAliasDictionary,
          }
        );

        if (machineResult && machineResult.errorReason) {
          excludedStores.push({
            storeId: store.id,
            storeName: store.name,
            reason: `台番予測エラー: ${machineResult.errorReason}`,
          });
        } else if (machineResult && machineResult.rankings.length > 0) {
          const islandDefs = parseIslandConfig(store.islandConfig);
          for (const mach of machineResult.rankings) {
            // Prompt 13: Exclude confidence '低' by default, unless includeLowConfidence is true
            const isLow = mach.confidence === '低';
            if (isLow && !includeLowConfidence) {
              continue;
            }

            // Shrink expected diff towards 0 according to evidence days and store evaluation days
            const evidenceWeight = mach.evidenceDays / (mach.evidenceDays + 3);
            const storeWeight = Math.min(1.0, storeEvalDays / 15);
            const shrunkDiff = Math.round(mach.stats.shrunkDiff * evidenceWeight * storeWeight);
            const { rateLend: machRateLend, rateExchange: machRateExch } = getStoreRatesForModel(store, mach.modelName);
            const expYen = convertCoinsToYen(shrunkDiff, machRateLend, machRateExch);
            const island = getMachineIsland(mach.machineNum, islandDefs);

            // Construct rich evidence-based reasons: store factor + top 2 contributions with evidence days
            const isSpecial = Boolean(machineResult.isSpecialDay);
            const storeFactorText = isSpecial
              ? `来店日が店舗特日 (実績${mach.cohortEvidenceDays}日)`
              : `同曜日実績${mach.cohortEvidenceDays}日`;

            const contribItems: Array<{ score: number; text: string }> = [];

            if (mach.contributions.cohortDiffScore > 0) {
              contribItems.push({
                score: mach.contributions.cohortDiffScore,
                text: `同条件台平均 ${mach.stats.cohortAvgDiff >= 0 ? '+' : ''}${mach.stats.cohortAvgDiff}枚 (根拠${mach.cohortEvidenceDays}日)`,
              });
            }
            if (mach.contributions.cohortWinRateScore > 0) {
              contribItems.push({
                score: mach.contributions.cohortWinRateScore,
                text: `同条件勝率 ${mach.stats.cohortWinRate}% (実績${mach.cohortEvidenceDays}日)`,
              });
            }
            if (mach.contributions.highSettingScore > 0) {
              contribItems.push({
                score: mach.contributions.highSettingScore,
                text: `高設定挙動 ${mach.evidenceDays}日中${mach.stats.highSettingCount}日 (${mach.stats.highSettingRate}%, 根拠${mach.evidenceDays}日)`,
              });
            }
            if (mach.contributions.modelScore > 0) {
              contribItems.push({
                score: mach.contributions.modelScore,
                text: `機種評価スコア ${mach.stats.modelScore}pt (根拠${mach.evidenceDays}日)`,
              });
            }
            if (mach.contributions.tailBonusScore > 0) {
              const label = mach.stats.isTailMatch ? '特定日末尾一致' : mach.stats.isZoro ? 'ゾロ目番' : '末尾・ゾロ目ボーナス';
              contribItems.push({
                score: mach.contributions.tailBonusScore,
                text: `${label} (根拠${mach.evidenceDays}日)`,
              });
            }
            if (mach.contributions.recentStateScore > 0) {
              contribItems.push({
                score: mach.contributions.recentStateScore,
                text: `直前好調傾向 (根拠${mach.evidenceDays}日)`,
              });
            }

            contribItems.sort((a, b) => b.score - a.score);
            const topContribs = contribItems.slice(0, 2);

            const reasons: string[] = [];
            if (mach.cohortEvidenceDays > 0 || isSpecial) {
              reasons.push(storeFactorText);
            }
            topContribs.forEach((c) => reasons.push(c.text));

            if (reasons.length === 0) {
              reasons.push('根拠が少ないため参考表示');
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
              shrunkDiff,
              expectedDiffCoins: shrunkDiff,
              expectedYenProfit: expYen,
              cohortAvgDiff: mach.stats.cohortAvgDiff,
              cohortWinRate: mach.stats.cohortWinRate,
              highSettingRate: mach.stats.highSettingRate,
              isTailMatch: mach.stats.isTailMatch,
              isZoro: mach.stats.isZoro,
              reasons: reasons.slice(0, 3),
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        excludedStores.push({
          storeId: store.id,
          storeName: store.name,
          reason: `台番予測の計算中にエラーが発生しました: ${message}`,
        });
      }
    }
  }

  // Sort model rankings:
  // Prompt 13: In expectedDiffCoins mode, sort strictly by expectedDiffCoins descending.
  // compositeScore is for intra-store reference only and not used for cross-store sorting.
  eligibleModels.sort((a, b) => {
    if (metricMode === 'yen') {
      return b.expectedYenProfit - a.expectedYenProfit;
    }
    return b.expectedDiffCoins - a.expectedDiffCoins;
  });
  eligibleModels.forEach((m, idx) => {
    m.rank = idx + 1;
  });

  // Sort machine rankings:
  // Prompt 13: In expectedDiffCoins mode, sort strictly by shrunkDiff descending.
  // totalScore is for intra-store reference only and not used for cross-store sorting.
  eligibleMachines.sort((a, b) => {
    if (metricMode === 'yen') {
      return b.expectedYenProfit - a.expectedYenProfit;
    }
    return b.shrunkDiff - a.shrunkDiff;
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
