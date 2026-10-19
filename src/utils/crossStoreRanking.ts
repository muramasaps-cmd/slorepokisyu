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
import { runMachineBacktest } from './backtestEngine';

export type CrossMetricMode = 'diffCoins' | 'yen';

export interface UncertaintyInterval {
  margin: number;
  min: number;
  max: number;
  isWide: boolean;
}

export type MachineCheckStatus = 'unavailable' | 'played';

export interface StorePastPerformanceResult {
  storeId: string;
  storeName: string;
  recentDaysEvaluated: number;
  actualDaysCount: number;
  top10AvgDiff: number;
  hallAvgDiff: number;
  lift: number;
  winRate: number;
  hallWinRate: number;
  hasEdge: boolean;
  verdictMessage: string;
  isReferenceOnly: boolean;
}

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
  standardError?: number;
  uncertainty80: UncertaintyInterval;
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
  standardError?: number;
  uncertainty80: UncertaintyInterval;
  expectedDiffStd?: number;
  expectedDiffActual?: number;
  avgGames?: number;
  shrunkPayoutRate?: number;
  cohortAvgPayoutRate?: number;
  reliabilityRate?: number;
  expectedDiff80Range?: [number, number];
  interval80?: [number, number] | null; // 30-2 / 30-4: 80% credible interval
  posteriorMean?: number; // 30-1 / 30-4: empirical Bayes posterior mean
  posteriorSd?: number | null;
  reliability?: number | null;
  expectedDiffAtBaseGames?: number; // 30-3 / 30-4: expected diff converted to base games
  diffMetric?: 'actual' | 'baseGames'; // 30-4
  baseGames?: number; // 30-4
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
  storeMachineRankings: Record<string, CrossStoreMachineRank[]>;
  diffMetric?: 'actual' | 'baseGames';
  baseGames?: number;
  legacyCrossShrink?: boolean;
}

export interface CrossStoreRankingOptions {
  metricMode?: CrossMetricMode; // default 'diffCoins'
  topModelCount?: number; // default 20
  topMachineCount?: number; // default 20
  selectedStoreIds?: string[]; // if specified, filters to these store IDs
  includeLowConfidence?: boolean; // default false: exclude low confidence machines
  onProgress?: (progress: number, currentStore?: string) => void;
  /** 30-4: 二重縮小オプション（既定値: true = 現行） */
  legacyCrossShrink?: boolean;
  /** 30-4: 差枚指標（既定値: 'actual'） */
  diffMetric?: 'actual' | 'baseGames';
  /** 30-4: 基準ゲーム数（既定値: 5000） */
  baseGames?: number;
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
  const legacyCrossShrink = options?.legacyCrossShrink ?? true;
  const diffMetric = options?.diffMetric || 'actual';
  const baseGames = options?.baseGames ?? 5000;

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

          let modelSe = 0;
          if (m.sampleRecords && m.sampleRecords.length > 1) {
            const diffs = m.sampleRecords.map((r) => r.avgDiffCoins);
            const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1);
            modelSe = Math.sqrt(variance / diffs.length);
          }
          if (modelSe === 0) {
            modelSe = 600 / Math.sqrt(Math.max(1, m.sampleDays));
          }
          const modelMargin = Math.round(1.28 * modelSe);
          const modelUncertainty80: UncertaintyInterval = {
            margin: modelMargin,
            min: shrunkModelDiff - modelMargin,
            max: shrunkModelDiff + modelMargin,
            isWide: modelMargin >= 700 || m.sampleDays <= 2,
          };

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
            standardError: Math.round(modelSe * 10) / 10,
            uncertainty80: modelUncertainty80,
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
            baseGames,
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
            let machConfidence = mach.confidence;
            if (storeEvalDays < 3) {
              machConfidence = '低';
            } else if (storeEvalDays < 7 && machConfidence === '高') {
              machConfidence = '中';
            }

            // Exclude confidence '低' by default, unless includeLowConfidence is true
            if (machConfidence === '低' && !includeLowConfidence) {
              continue;
            }

            // 30-4: 指標の選択 (diffMetric: 'actual' | 'baseGames')
            let rawExpectedDiff = 0;
            if (diffMetric === 'baseGames') {
              rawExpectedDiff =
                mach.expectedDiffAtBaseGames ??
                mach.stats.expectedDiffAtBaseGames ??
                mach.stats.shrunkDiff;
            } else {
              rawExpectedDiff = mach.posteriorMean ?? mach.stats.shrunkDiff;
            }

            // 30-4 Requirement 1: legacyCrossShrink (既定 true = 現行二重縮小, false = 単一縮小 / posteriorMean そのまま)
            let expectedDiffCoins = 0;
            const evidenceDays =
              mach.cohortEvidenceDays > 0 ? mach.cohortEvidenceDays : mach.evidenceDays;
            const evidenceWeight = evidenceDays / (evidenceDays + 3);
            const storeWeight = Math.min(1.0, storeEvalDays / 15);

            if (legacyCrossShrink) {
              expectedDiffCoins = Math.round(rawExpectedDiff * evidenceWeight * storeWeight);
            } else {
              expectedDiffCoins = Math.round(rawExpectedDiff);
            }

            const shrunkDiff = expectedDiffCoins;
            const expectedDiffStd = mach.stats.expectedDiffStd ?? shrunkDiff;
            const expectedDiffActual = mach.stats.expectedDiffActual ?? shrunkDiff;
            const avgGames = mach.stats.avgGames ?? 5000;
            const shrunkPayoutRate = mach.stats.shrunkPayoutRate ?? 100;
            const cohortAvgPayoutRate = mach.stats.cohortAvgPayoutRate;

            const { rateLend: machRateLend, rateExchange: machRateExch } = getStoreRatesForModel(store, mach.modelName);
            const expYen = convertCoinsToYen(expectedDiffCoins, machRateLend, machRateExch);
            const island = getMachineIsland(mach.machineNum, islandDefs);

            // 30-4 Requirement 3: 並びと理由を揃える（並びが期待差枚順なら、理由は「同条件の実績・根拠日数・縮小後の期待値」に限る）
            const isSpecial = Boolean(machineResult.isSpecialDay);
            const storeFactorText = isSpecial
              ? `来店日が店舗特日 (実績${mach.cohortEvidenceDays}日)`
              : `同曜日実績${mach.cohortEvidenceDays}日`;

            const reasons: string[] = [];
            if (mach.cohortEvidenceDays > 0 || isSpecial) {
              reasons.push(storeFactorText);
            }
            if (mach.cohortEvidenceDays > 0) {
              const avgDiffText = `${mach.stats.cohortAvgDiff >= 0 ? '+' : ''}${mach.stats.cohortAvgDiff}枚`;
              const payoutText = cohortAvgPayoutRate !== undefined
                ? `出率${cohortAvgPayoutRate}%`
                : `勝率${mach.stats.cohortWinRate}%`;
              reasons.push(`同条件台平均 ${avgDiffText} (${payoutText}, 根拠${mach.cohortEvidenceDays}日)`);
              if (diffMetric === 'baseGames') {
                reasons.push(
                  `縮小推定期待差枚 ${expectedDiffCoins >= 0 ? '+' : ''}${expectedDiffCoins}枚 (根拠${mach.cohortEvidenceDays}日, 基準${baseGames}G換算)`
                );
              } else {
                reasons.push(
                  `縮小推定期待差枚 ${expectedDiffCoins >= 0 ? '+' : ''}${expectedDiffCoins}枚 (根拠${mach.cohortEvidenceDays}日)`
                );
              }
            } else {
              if (diffMetric === 'baseGames') {
                reasons.push(
                  `所属機種平均からの縮小推定 ${expectedDiffCoins >= 0 ? '+' : ''}${expectedDiffCoins}枚 (根拠${mach.evidenceDays}日, 基準${baseGames}G換算)`
                );
              } else {
                reasons.push(
                  `所属機種平均からの縮小推定 ${expectedDiffCoins >= 0 ? '+' : ''}${expectedDiffCoins}枚 (根拠${mach.evidenceDays}日)`
                );
              }
            }

            // Reflect store evaluation days: fewer evaluated store days increases uncertainty interval & adjusts confidence
            const se = mach.stats.standardError && mach.stats.standardError > 0
              ? mach.stats.standardError
              : Math.round(800 / Math.sqrt(Math.max(1, mach.evidenceDays)));
            const storePenalty = storeEvalDays < 15 ? Math.sqrt(15 / Math.max(1, storeEvalDays)) : 1.0;
            const effectiveSe = Math.round(se * storePenalty);
            const machMargin =
              mach.stats.expectedDiffMargin80 !== undefined && mach.stats.expectedDiffMargin80 > 0
                ? Math.max(10, Math.round(mach.stats.expectedDiffMargin80 * storePenalty))
                : Math.max(10, Math.round(1.28 * effectiveSe));

            const machUncertainty80: UncertaintyInterval = {
              margin: machMargin,
              min: expectedDiffCoins - machMargin,
              max: expectedDiffCoins + machMargin,
              isWide: machMargin >= 700 || machConfidence === '低' || storeEvalDays < 7,
            };

            // 30-2 / 30-4: 80%範囲 (interval80)
            let interval80: [number, number] | null = null;
            if (mach.interval80 && mach.interval80.length === 2) {
              if (!legacyCrossShrink) {
                if (storePenalty > 1.0) {
                  const halfSpan = (mach.interval80[1] - mach.interval80[0]) / 2;
                  const scaledSpan = Math.round(halfSpan * storePenalty);
                  interval80 = [expectedDiffCoins - scaledSpan, expectedDiffCoins + scaledSpan];
                } else {
                  interval80 = [mach.interval80[0], mach.interval80[1]];
                }
              } else {
                interval80 = [
                  Math.round(mach.interval80[0] * evidenceWeight * storeWeight),
                  Math.round(mach.interval80[1] * evidenceWeight * storeWeight),
                ];
              }
            }

            eligibleMachines.push({
              rank: 0,
              storeId: store.id,
              storeName: store.name,
              machineNum: mach.machineNum,
              modelName: mach.modelName,
              islandName: island,
              totalScore: mach.totalScore,
              confidence: machConfidence,
              evidenceDays: mach.evidenceDays,
              cohortEvidenceDays: mach.cohortEvidenceDays,
              shrunkDiff: expectedDiffCoins,
              expectedDiffCoins,
              expectedYenProfit: expYen,
              cohortAvgDiff: mach.stats.cohortAvgDiff,
              cohortWinRate: mach.stats.cohortWinRate,
              highSettingRate: mach.stats.highSettingRate,
              isTailMatch: mach.stats.isTailMatch,
              isZoro: mach.stats.isZoro,
              reasons: reasons.slice(0, 3),
              standardError: Math.round(effectiveSe * 10) / 10,
              uncertainty80: machUncertainty80,
              expectedDiffStd,
              expectedDiffActual,
              avgGames,
              shrunkPayoutRate,
              cohortAvgPayoutRate,
              reliabilityRate: mach.stats.reliabilityRate,
              expectedDiff80Range: mach.stats.expectedDiff80Range,
              interval80,
              posteriorMean: mach.posteriorMean ?? mach.stats.shrunkDiff,
              posteriorSd: mach.posteriorSd ?? null,
              reliability: mach.reliability ?? null,
              expectedDiffAtBaseGames: mach.expectedDiffAtBaseGames ?? mach.stats.expectedDiffAtBaseGames,
              diffMetric,
              baseGames,
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
  // In expectedDiffCoins mode, sort strictly by expectedDiffCoins descending.
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
  // In expectedDiffCoins mode, sort strictly by shrunkDiff descending.
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

  // Build per-store machine rankings
  const storeMachineRankings: Record<string, CrossStoreMachineRank[]> = {};
  targetStores.forEach((s) => {
    storeMachineRankings[s.id] = [];
  });
  eligibleMachines.forEach((m) => {
    if (!storeMachineRankings[m.storeId]) {
      storeMachineRankings[m.storeId] = [];
    }
    storeMachineRankings[m.storeId].push({ ...m });
  });
  Object.keys(storeMachineRankings).forEach((sId) => {
    storeMachineRankings[sId].sort((a, b) => {
      if (metricMode === 'yen') {
        return b.expectedYenProfit - a.expectedYenProfit;
      }
      return b.shrunkDiff - a.shrunkDiff;
    });
    storeMachineRankings[sId].forEach((m, idx) => {
      m.rank = idx + 1;
    });
  });

  return {
    targetDate,
    metricMode,
    totalStoresCount: targetStores.length,
    eligibleStoresCount: targetStores.length - excludedStores.length,
    excludedStores,
    modelRankings: eligibleModels.slice(0, topModelCount),
    machineRankings: eligibleMachines.slice(0, topMachineCount),
    storeMachineRankings,
    diffMetric,
    baseGames,
    legacyCrossShrink,
  };
}

/**
 * Calculates approximately 80% uncertainty range from standard error
 * (normal distribution z_0.80 ≈ 1.282)
 */
export function calculateUncertainty80(
  expectedDiff: number,
  standardError?: number,
  fallbackMargin = 800
): UncertaintyInterval {
  const se = standardError !== undefined && standardError > 0 ? standardError : fallbackMargin / 1.28;
  const margin = Math.round(1.28 * se);
  return {
    margin,
    min: Math.round(expectedDiff - margin),
    max: Math.round(expectedDiff + margin),
    isWide: margin >= 700,
  };
}

export const TARGET_CHECK_STORAGE_KEY_PREFIX = 'slorepo_target_checked_';

export function getTargetCheckStorageKey(targetDate: string, storeId: string): string {
  return `${TARGET_CHECK_STORAGE_KEY_PREFIX}${targetDate}_${storeId}`;
}

export function loadTargetCheckStatus(
  targetDate: string,
  storeId: string
): Record<number, MachineCheckStatus> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getTargetCheckStorageKey(targetDate, storeId));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load target check status from localStorage:', err);
    return {};
  }
}

export function saveTargetCheckStatus(
  targetDate: string,
  storeId: string,
  state: Record<number, MachineCheckStatus>
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = getTargetCheckStorageKey(targetDate, storeId);
    if (!state || Object.keys(state).length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(state));
    }
  } catch (err) {
    console.warn('Failed to save target check status to localStorage:', err);
  }
}

/**
 * Filters out checked machines ('unavailable' | 'played') and rolls up
 * subsequent candidate machines into the top N display slots.
 */
export function filterAndRollupTargetList(
  machines: CrossStoreMachineRank[],
  checkedState: Record<number, MachineCheckStatus> = {},
  topN = 10
): {
  activeCandidates: Array<CrossStoreMachineRank & { originalRank: number }>;
  checkedCandidates: Array<CrossStoreMachineRank & { checkStatus: MachineCheckStatus; originalRank: number }>;
  rolledUpCount: number;
} {
  const active: Array<CrossStoreMachineRank & { originalRank: number }> = [];
  const checked: Array<CrossStoreMachineRank & { checkStatus: MachineCheckStatus; originalRank: number }> = [];

  machines.forEach((mach, idx) => {
    const originalRank = idx + 1;
    const status = checkedState[mach.machineNum];
    if (status) {
      checked.push({ ...mach, checkStatus: status, originalRank });
    } else {
      active.push({ ...mach, originalRank });
    }
  });

  const activeCandidates = active.slice(0, topN).map((item, idx) => ({
    ...item,
    rank: idx + 1, // dynamically rolled up rank
  }));

  let rolledUpCount = 0;
  activeCandidates.forEach((item) => {
    if (item.originalRank > topN) {
      rolledUpCount++;
    }
  });

  return {
    activeCandidates,
    checkedCandidates: checked,
    rolledUpCount,
  };
}

/**
 * Generates formatted plain text for 1-tap clipboard copying of a store's target list.
 */
export function generateTargetListCopyText(
  storeName: string,
  targetDate: string,
  items: Array<{
    rank: number;
    modelName: string;
    machineNum: number;
    expectedDiffCoins: number;
    uncertainty80?: UncertaintyInterval;
    reasons: string[];
    islandName?: string | null;
  }>
): string {
  const lines: string[] = [
    `【${storeName}】来店日: ${targetDate} 狙い台リスト`,
    `----------------------------------------`,
  ];

  if (items.length === 0) {
    lines.push('対象の狙い台はありません。');
  } else {
    items.forEach((item, idx) => {
      const displayRank = idx + 1;
      const diffStr = item.expectedDiffCoins >= 0 ? `+${item.expectedDiffCoins}` : `${item.expectedDiffCoins}`;
      const uncStr = item.uncertainty80
        ? ` (±${item.uncertainty80.margin}枚 / 80%幅: ${item.uncertainty80.min >= 0 ? '+' : ''}${item.uncertainty80.min}〜${item.uncertainty80.max >= 0 ? '+' : ''}${item.uncertainty80.max}枚)`
        : '';
      const islandStr = item.islandName ? ` [${item.islandName}]` : '';
      const reasonSummary = item.reasons.length > 0 ? item.reasons.join(' / ') : '過去実績に基づく推論';
      lines.push(
        `${displayRank}位: ${item.modelName} ${item.machineNum}番台${islandStr} | 期待差枚: ${diffStr}枚${uncStr} | 根拠: ${reasonSummary}`
      );
    });
  }

  lines.push(`----------------------------------------`);
  lines.push(`※ 期待差枚は過去データからの縮小推計値であり、当日の出玉を保証するものではありません。`);

  return lines.join('\n');
}

/**
 * Generates CSV string for downloading a store's target list.
 */
export function generateTargetListCsv(
  storeName: string,
  targetDate: string,
  items: Array<{
    rank: number;
    modelName: string;
    machineNum: number;
    expectedDiffCoins: number;
    expectedYenProfit?: number;
    confidence?: string;
    uncertainty80?: UncertaintyInterval;
    reasons: string[];
    islandName?: string | null;
  }>
): string {
  const header = [
    '店舗名',
    '来店日',
    '順位',
    '機種名',
    '台番',
    '島名',
    '信頼度',
    '期待差枚(枚)',
    '不確実性(±枚)',
    '80%予測下限(枚)',
    '80%予測上限(枚)',
    '選定理由要約',
  ];

  const escapeCsv = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = items.map((item, idx) => {
    const displayRank = idx + 1;
    const diffStr = item.expectedDiffCoins >= 0 ? `+${item.expectedDiffCoins}` : `${item.expectedDiffCoins}`;
    const margin = item.uncertainty80?.margin ?? '';
    const minVal = item.uncertainty80 ? (item.uncertainty80.min >= 0 ? `+${item.uncertainty80.min}` : `${item.uncertainty80.min}`) : '';
    const maxVal = item.uncertainty80 ? (item.uncertainty80.max >= 0 ? `+${item.uncertainty80.max}` : `${item.uncertainty80.max}`) : '';
    const reasonsStr = item.reasons.join(' / ');

    return [
      escapeCsv(storeName),
      escapeCsv(targetDate),
      displayRank,
      escapeCsv(item.modelName),
      item.machineNum,
      escapeCsv(item.islandName || ''),
      escapeCsv(item.confidence || ''),
      escapeCsv(diffStr),
      margin,
      escapeCsv(minVal),
      escapeCsv(maxVal),
      escapeCsv(reasonsStr),
    ].join(',');
  });

  return [header.join(','), ...rows].join('\r\n');
}

/**
 * Calculates a store's past performance selecting top 10 machines over the recent N days
 * prior to targetDate, comparing with the hall average.
 */
export function calculateStorePastPerformance(
  store: StoreProfile,
  targetDate: string,
  recentDaysCount: number = 30
): StorePastPerformanceResult {
  const records = store.dailyRecords || [];
  // Strictly filter out any records on or after targetDate to prevent future leakage
  const priorRecords = records.filter((r) => r.date < targetDate);
  const targetSlice = priorRecords.slice(-recentDaysCount);

  // Check if there is enough machine data
  const hasMachines = targetSlice.some((r) => r.machines && r.machines.length > 0);
  if (!hasMachines || targetSlice.length < 4) {
    return {
      storeId: store.id,
      storeName: store.name,
      recentDaysEvaluated: recentDaysCount,
      actualDaysCount: 0,
      top10AvgDiff: 0,
      hallAvgDiff: 0,
      lift: 0,
      winRate: 0,
      hallWinRate: 0,
      hasEdge: false,
      verdictMessage: '直近の台番データが不足しているため検証できません。',
      isReferenceOnly: true,
    };
  }

  const backtestRes = runMachineBacktest(targetSlice, store.specialDayRules, {
    topN: 10,
    minEvidenceDays: 3,
    bootstrapIterations: 1000,
    weights: store.customMachineRankingWeights,
  });

  const withFilter = backtestRes.withFilter;
  const hasEdge = withFilter.hasEdge;

  return {
    storeId: store.id,
    storeName: store.name,
    recentDaysEvaluated: recentDaysCount,
    actualDaysCount: backtestRes.evaluatedDaysCount,
    top10AvgDiff: withFilter.avgActualDiff,
    hallAvgDiff: withFilter.hallAvgDiff,
    lift: withFilter.avgLift,
    winRate: withFilter.avgWinRate,
    hallWinRate: withFilter.hallAvgWinRate,
    hasEdge,
    verdictMessage: withFilter.verdictMessage,
    isReferenceOnly: !hasEdge,
  };
}
