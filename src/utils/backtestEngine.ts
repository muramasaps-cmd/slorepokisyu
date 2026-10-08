import { DailyRecord, DailyMachineRecord, SpecialDayRules, RankingWeights } from '../data/types';
import {
  buildFeatureIndex,
  calculateTargetDateRanking,
  calculateTargetDateRankingFromIndex,
  DEFAULT_RANKING_WEIGHTS,
} from './targetRankingEngine';
import {
  calculateTargetMachineRanking,
  MachineRankingWeights,
  DEFAULT_MACHINE_RANKING_WEIGHTS,
  TargetMachineScore,
} from './targetMachineRanking';

export interface BacktestDayEvaluation {
  date: string;
  dayOfWeek: string;
  isSpecialDay: boolean;
  actualHallAvgDiff: number;
  expectedHallAvgDiff: number;
  hallError: number;

  // Engine Top-K
  engineTopKModels: string[];
  engineTopKActualAvgDiff: number;
  engineTopKActualLift: number;
  engineTopKPositive: boolean;
  engineSpearmanCorr: number | null;
  engineDiffCoinsMae: number;

  // Baseline Top-K (全期間の平均差枚が高い順)
  baselineTopKModels: string[];
  baselineTopKActualAvgDiff: number;
  baselineTopKActualLift: number;
  baselineTopKPositive: boolean;
  baselineSpearmanCorr: number | null;

  // Tail evaluation
  engineTopTail: string;
  engineTopTailActualAvgDiff: number | null;
  engineTopTailWinRate: number | null;
}

export interface BacktestSummaryMetrics {
  totalEvaluatedDays: number;
  specialDaysCount: number;
  normalDaysCount: number;

  // Engine
  engineAvgTopKLift: number;
  engineAvgTopKDiff: number;
  engineTopKPositiveRate: number; // %
  engineAvgSpearman: number;
  engineDiffCoinsMae: number;
  engineHallMae: number;
  engineTailAvgDiff: number;

  // Baseline
  baselineAvgTopKLift: number;
  baselineAvgTopKDiff: number;
  baselineTopKPositiveRate: number; // %
  baselineAvgSpearman: number;

  // Comparison Delta
  liftEdge: number; // engineAvgTopKLift - baselineAvgTopKLift
  winRateEdge: number;
  spearmanEdge: number;
}

export interface TuningResult {
  candidateWeights: RankingWeights;
  trainEvaluatedDays: number;
  valEvaluatedDays: number;

  trainDefaultLift: number;
  trainCandidateLift: number;
  trainLiftGain: number;

  valDefaultLift: number;
  valCandidateLift: number;
  valLiftGain: number;
  valStdError: number;
  tValue: number;

  isRecommended: boolean; // tValue >= 2.0 && valLiftGain > 0
  verdictMessage: string;
}

/**
 * Calculates Spearman rank correlation between two number arrays
 */
export function calculateSpearman(predictedScores: number[], actualValues: number[]): number | null {
  const n = predictedScores.length;
  if (n < 3) return null;

  // Compute ranks with average rank for ties
  const getRanks = (arr: number[]): number[] => {
    const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && indexed[j + 1].v === indexed[j].v) {
        j++;
      }
      const avgRank = (i + 1 + j + 1) / 2;
      for (let k = i; k <= j; k++) {
        ranks[indexed[k].i] = avgRank;
      }
      i = j + 1;
    }
    return ranks;
  };

  const predRanks = getRanks(predictedScores);
  const actualRanks = getRanks(actualValues);

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = predRanks[i] - actualRanks[i];
    sumD2 += d * d;
  }

  const spearman = 1 - (6 * sumD2) / (n * (n * n - 1));
  return Math.round(spearman * 1000) / 1000;
}

/**
 * Executes a point-in-time walk-forward backtest on historical daily records.
 * Uses ONLY records strictly prior to each target date.
 */
export function runWalkForwardBacktest(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays: string = '',
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  k: number = 3,
  minWarmupDays: number = 5
): {
  evaluations: BacktestDayEvaluation[];
  summary: BacktestSummaryMetrics;
} {
  const sorted = [...dailyRecords]
    .filter((r) => r.models && r.models.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const evaluations: BacktestDayEvaluation[] = [];
  const featureIndex = buildFeatureIndex(sorted, specialDayRules, oldEventDays);

  for (let i = minWarmupDays; i < sorted.length; i++) {
    const targetDay = sorted[i];
    // Strict point-in-time isolation: ONLY prior records
    const priorRecords = sorted.slice(0, i);

    if (priorRecords.length < minWarmupDays) continue;

    // 1. Run Engine Forecast via precomputed featureIndex
    const forecast = calculateTargetDateRankingFromIndex(
      targetDay.date,
      featureIndex,
      i,
      weights
    );

    if (!forecast || forecast.modelRankings.length === 0) continue;

    // Actual day results map
    const actualModelMap = new Map<string, { avgDiffCoins: number; winRate: number | null }>();
    targetDay.models?.forEach((m) => {
      actualModelMap.set(m.modelName.trim(), {
        avgDiffCoins: m.avgDiffCoins,
        winRate: m.winRate,
      });
    });

    if (actualModelMap.size < 2) continue;

    const actualHallAvgDiff = targetDay.avgDiffCoins;
    const expectedHallAvgDiff = forecast.expectedHallAvgDiffCoins;
    const hallError = Math.abs(expectedHallAvgDiff - actualHallAvgDiff);

    // Overlapping models for Spearman & MAE
    const commonModels = forecast.modelRankings.filter((m) =>
      actualModelMap.has(m.modelName.trim())
    );

    if (commonModels.length === 0) continue;

    // Engine Top-K
    const engineTopK = commonModels.slice(0, Math.min(k, commonModels.length));
    const engineTopKActualDiffs = engineTopK.map(
      (m) => actualModelMap.get(m.modelName.trim())!.avgDiffCoins
    );
    const engineTopKActualAvgDiff =
      engineTopKActualDiffs.length > 0
        ? Math.round(
            (engineTopKActualDiffs.reduce((a, b) => a + b, 0) /
              engineTopKActualDiffs.length) *
              10
          ) / 10
        : 0;
    const engineTopKActualLift =
      Math.round((engineTopKActualAvgDiff - actualHallAvgDiff) * 10) / 10;
    const engineTopKPositive = engineTopKActualAvgDiff > 0;

    // Engine Spearman
    const engineScores = commonModels.map((m) => m.compositeScore);
    const actualDiffs = commonModels.map(
      (m) => actualModelMap.get(m.modelName.trim())!.avgDiffCoins
    );
    const engineSpearmanCorr = calculateSpearman(engineScores, actualDiffs);

    // Engine MAE
    const maeSum = commonModels.reduce((acc, m) => {
      const act = actualModelMap.get(m.modelName.trim())!.avgDiffCoins;
      return acc + Math.abs(m.expectedDiffCoins - act);
    }, 0);
    const engineDiffCoinsMae = Math.round(maeSum / commonModels.length);

    // 2. Run Baseline Forecast (全期間の平均差枚が高い順)
    const baselineModelMap = new Map<string, { totalDiff: number; count: number }>();
    priorRecords.forEach((r) => {
      r.models?.forEach((m) => {
        const name = m.modelName.trim();
        const existing = baselineModelMap.get(name) || { totalDiff: 0, count: 0 };
        existing.totalDiff += m.avgDiffCoins;
        existing.count += 1;
        baselineModelMap.set(name, existing);
      });
    });

    const baselineScored = Array.from(baselineModelMap.entries())
      .filter(([name]) => actualModelMap.has(name))
      .map(([name, stat]) => ({
        name,
        allAvgDiff: stat.count > 0 ? stat.totalDiff / stat.count : 0,
      }))
      .sort((a, b) => b.allAvgDiff - a.allAvgDiff);

    const baselineTopK = baselineScored.slice(0, Math.min(k, baselineScored.length));
    const baselineTopKActualDiffs = baselineTopK.map(
      (m) => actualModelMap.get(m.name)!.avgDiffCoins
    );
    const baselineTopKActualAvgDiff =
      baselineTopKActualDiffs.length > 0
        ? Math.round(
            (baselineTopKActualDiffs.reduce((a, b) => a + b, 0) /
              baselineTopKActualDiffs.length) *
              10
          ) / 10
        : 0;
    const baselineTopKActualLift =
      Math.round((baselineTopKActualAvgDiff - actualHallAvgDiff) * 10) / 10;
    const baselineTopKPositive = baselineTopKActualAvgDiff > 0;

    const baselineSpearmanCorr = calculateSpearman(
      baselineScored.map((m) => m.allAvgDiff),
      baselineScored.map((m) => actualModelMap.get(m.name)!.avgDiffCoins)
    );

    // 3. Tail evaluation
    const topTail = forecast.tailRankings[0]?.tailName || '';
    let topTailActualAvg: number | null = null;
    let topTailWinRate: number | null = null;
    if (targetDay.tails && topTail) {
      const match = targetDay.tails.find((t) => t.tailName.trim() === topTail.trim());
      if (match) {
        topTailActualAvg = match.avgDiffCoins;
        topTailWinRate = match.winRate;
      }
    }

    evaluations.push({
      date: targetDay.date,
      dayOfWeek: targetDay.dayOfWeek,
      isSpecialDay: forecast.isSpecialDay,
      actualHallAvgDiff,
      expectedHallAvgDiff,
      hallError,

      engineTopKModels: engineTopK.map((m) => m.modelName),
      engineTopKActualAvgDiff,
      engineTopKActualLift,
      engineTopKPositive,
      engineSpearmanCorr,
      engineDiffCoinsMae,

      baselineTopKModels: baselineTopK.map((m) => m.name),
      baselineTopKActualAvgDiff,
      baselineTopKActualLift,
      baselineTopKPositive,
      baselineSpearmanCorr,

      engineTopTail: topTail,
      engineTopTailActualAvgDiff: topTailActualAvg,
      engineTopTailWinRate: topTailWinRate,
    });
  }

  // Summary calculation
  const total = evaluations.length;
  if (total === 0) {
    return {
      evaluations: [],
      summary: {
        totalEvaluatedDays: 0,
        specialDaysCount: 0,
        normalDaysCount: 0,
        engineAvgTopKLift: 0,
        engineAvgTopKDiff: 0,
        engineTopKPositiveRate: 0,
        engineAvgSpearman: 0,
        engineDiffCoinsMae: 0,
        engineHallMae: 0,
        engineTailAvgDiff: 0,
        baselineAvgTopKLift: 0,
        baselineAvgTopKDiff: 0,
        baselineTopKPositiveRate: 0,
        baselineAvgSpearman: 0,
        liftEdge: 0,
        winRateEdge: 0,
        spearmanEdge: 0,
      },
    };
  }

  const engineLifts = evaluations.map((e) => e.engineTopKActualLift);
  const engineDiffs = evaluations.map((e) => e.engineTopKActualAvgDiff);
  const engineSpearmans = evaluations
    .map((e) => e.engineSpearmanCorr)
    .filter((s): s is number => s !== null);
  const enginePositiveCount = evaluations.filter((e) => e.engineTopKPositive).length;
  const engineTailDiffs = evaluations
    .map((e) => e.engineTopTailActualAvgDiff)
    .filter((d): d is number => d !== null);

  const baselineLifts = evaluations.map((e) => e.baselineTopKActualLift);
  const baselineDiffs = evaluations.map((e) => e.baselineTopKActualAvgDiff);
  const baselineSpearmans = evaluations
    .map((e) => e.baselineSpearmanCorr)
    .filter((s): s is number => s !== null);
  const baselinePositiveCount = evaluations.filter((e) => e.baselineTopKPositive).length;

  const engineAvgTopKLift = Math.round(engineLifts.reduce((a, b) => a + b, 0) / total);
  const engineAvgTopKDiff = Math.round(engineDiffs.reduce((a, b) => a + b, 0) / total);
  const engineTopKPositiveRate = Math.round((enginePositiveCount / total) * 1000) / 10;
  const engineAvgSpearman =
    engineSpearmans.length > 0
      ? Math.round((engineSpearmans.reduce((a, b) => a + b, 0) / engineSpearmans.length) * 1000) /
        1000
      : 0;
  const engineDiffCoinsMae = Math.round(
    evaluations.reduce((a, b) => a + b.engineDiffCoinsMae, 0) / total
  );
  const engineHallMae = Math.round(evaluations.reduce((a, b) => a + b.hallError, 0) / total);
  const engineTailAvgDiff =
    engineTailDiffs.length > 0
      ? Math.round(engineTailDiffs.reduce((a, b) => a + b, 0) / engineTailDiffs.length)
      : 0;

  const baselineAvgTopKLift = Math.round(baselineLifts.reduce((a, b) => a + b, 0) / total);
  const baselineAvgTopKDiff = Math.round(baselineDiffs.reduce((a, b) => a + b, 0) / total);
  const baselineTopKPositiveRate = Math.round((baselinePositiveCount / total) * 1000) / 10;
  const baselineAvgSpearman =
    baselineSpearmans.length > 0
      ? Math.round((baselineSpearmans.reduce((a, b) => a + b, 0) / baselineSpearmans.length) * 1000) /
        1000
      : 0;

  return {
    evaluations,
    summary: {
      totalEvaluatedDays: total,
      specialDaysCount: evaluations.filter((e) => e.isSpecialDay).length,
      normalDaysCount: evaluations.filter((e) => !e.isSpecialDay).length,

      engineAvgTopKLift,
      engineAvgTopKDiff,
      engineTopKPositiveRate,
      engineAvgSpearman,
      engineDiffCoinsMae,
      engineHallMae,
      engineTailAvgDiff,

      baselineAvgTopKLift,
      baselineAvgTopKDiff,
      baselineTopKPositiveRate,
      baselineAvgSpearman,

      liftEdge: engineAvgTopKLift - baselineAvgTopKLift,
      winRateEdge: Math.round((engineTopKPositiveRate - baselineTopKPositiveRate) * 10) / 10,
      spearmanEdge: Math.round((engineAvgSpearman - baselineAvgSpearman) * 1000) / 1000,
    },
  };
}

/**
 * Automated parameter tuning with Train (70%) and Validation (30%) time-series split.
 * Explores weights on Train, and tests on Validation. Recommends adoption ONLY if
 * Validation lift improves with t-value >= 2.0.
 */
export function runAutoTuning(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays: string = '',
  k: number = 3,
  onProgress?: (progressPercent: number) => void
): TuningResult | null {
  const sorted = [...dailyRecords]
    .filter((r) => r.models && r.models.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 8) return null;

  // Split into Train (first 70%) and Validation (last 30%)
  const minWarmup = 4;
  const evaluableDays = sorted.slice(minWarmup);
  if (evaluableDays.length < 4) return null;

  const splitIdx = Math.max(2, Math.floor(evaluableDays.length * 0.7));
  const trainDays = evaluableDays.slice(0, splitIdx);
  const valDays = evaluableDays.slice(splitIdx);

  if (trainDays.length < 2 || valDays.length < 2) return null;

  // Build feature index ONCE across all sorted historical records
  const featureIndex = buildFeatureIndex(sorted, specialDayRules, oldEventDays);

  const trainPriorCounts = trainDays.map((td) =>
    sorted.findIndex((r) => r.date === td.date)
  );
  const valPriorCounts = valDays.map((vd) =>
    sorted.findIndex((r) => r.date === vd.date)
  );

  // Search grid on Train period
  const candidateDivisors = [25, 35, 50];
  const candidateWinMults = [0.3, 0.6, 1.0];
  const candidateHighMults = [2.0, 4.5, 7.0];
  const candidateBlends = [0.5, 0.75, 0.9];

  let bestTrainLift = -Infinity;
  let bestCandidateWeights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS };

  const totalCombinations =
    candidateDivisors.length *
    candidateWinMults.length *
    candidateHighMults.length *
    candidateBlends.length;
  let comboIndex = 0;

  // Evaluate candidate weights on train days
  for (const div of candidateDivisors) {
    for (const win of candidateWinMults) {
      for (const high of candidateHighMults) {
        for (const blend of candidateBlends) {
          comboIndex++;
          const w: RankingWeights = {
            diffCoinDivisor: div,
            winRateMultiplier: win,
            allHighMultiplier: high,
            matchingBlendWeight: blend,
            scaleFactorEnabled: true,
          };

          // Fast lift evaluation on Train
          let sumLift = 0;
          let count = 0;
          for (let ti = 0; ti < trainDays.length; ti++) {
            const targetDay = trainDays[ti];
            const priorCount = trainPriorCounts[ti];
            const fc = calculateTargetDateRankingFromIndex(
              targetDay.date,
              featureIndex,
              priorCount,
              w
            );
            if (!fc || fc.modelRankings.length === 0) continue;

            const actualMap = new Map<string, number>();
            targetDay.models?.forEach((m) => actualMap.set(m.modelName.trim(), m.avgDiffCoins));

            const topModels = fc.modelRankings
              .filter((m) => actualMap.has(m.modelName.trim()))
              .slice(0, k);

            if (topModels.length > 0) {
              const avgActual =
                topModels.reduce((acc, m) => acc + actualMap.get(m.modelName.trim())!, 0) /
                topModels.length;
              sumLift += avgActual - targetDay.avgDiffCoins;
              count++;
            }
          }

          const avgTrainLift = count > 0 ? sumLift / count : -Infinity;
          if (avgTrainLift > bestTrainLift) {
            bestTrainLift = avgTrainLift;
            bestCandidateWeights = w;
          }

          if (onProgress && comboIndex % 8 === 0) {
            const pct = Math.min(95, Math.round((comboIndex / totalCombinations) * 90));
            onProgress(pct);
          }
        }
      }
    }
  }

  // Evaluate default weights on Train days for baseline
  let trainDefaultSumLift = 0;
  let trainDefaultCount = 0;
  for (let ti = 0; ti < trainDays.length; ti++) {
    const targetDay = trainDays[ti];
    const priorCount = trainPriorCounts[ti];
    const fc = calculateTargetDateRankingFromIndex(
      targetDay.date,
      featureIndex,
      priorCount,
      DEFAULT_RANKING_WEIGHTS
    );
    if (!fc || fc.modelRankings.length === 0) continue;
    const actualMap = new Map<string, number>();
    targetDay.models?.forEach((m) => actualMap.set(m.modelName.trim(), m.avgDiffCoins));
    const topModels = fc.modelRankings
      .filter((m) => actualMap.has(m.modelName.trim()))
      .slice(0, k);
    if (topModels.length > 0) {
      const avgActual =
        topModels.reduce((acc, m) => acc + actualMap.get(m.modelName.trim())!, 0) /
        topModels.length;
      trainDefaultSumLift += avgActual - targetDay.avgDiffCoins;
      trainDefaultCount++;
    }
  }
  const trainDefaultLift =
    trainDefaultCount > 0 ? Math.round(trainDefaultSumLift / trainDefaultCount) : 0;
  const trainCandidateLift = Math.round(bestTrainLift);
  const trainLiftGain = trainCandidateLift - trainDefaultLift;

  // Validation phase: Out-of-sample paired test on valDays
  const diffs: number[] = [];
  let valDefaultSum = 0;
  let valCandidateSum = 0;
  let valValidCount = 0;

  for (let vi = 0; vi < valDays.length; vi++) {
    const targetDay = valDays[vi];
    const priorCount = valPriorCounts[vi];

    const actualMap = new Map<string, number>();
    targetDay.models?.forEach((m) => actualMap.set(m.modelName.trim(), m.avgDiffCoins));

    // Default
    const fcDef = calculateTargetDateRankingFromIndex(
      targetDay.date,
      featureIndex,
      priorCount,
      DEFAULT_RANKING_WEIGHTS
    );
    // Candidate
    const fcCand = calculateTargetDateRankingFromIndex(
      targetDay.date,
      featureIndex,
      priorCount,
      bestCandidateWeights
    );

    if (!fcDef || !fcCand) continue;

    const topDef = fcDef.modelRankings
      .filter((m) => actualMap.has(m.modelName.trim()))
      .slice(0, k);
    const topCand = fcCand.modelRankings
      .filter((m) => actualMap.has(m.modelName.trim()))
      .slice(0, k);

    if (topDef.length === 0 || topCand.length === 0) continue;

    const defAvg =
      topDef.reduce((acc, m) => acc + actualMap.get(m.modelName.trim())!, 0) / topDef.length;
    const candAvg =
      topCand.reduce((acc, m) => acc + actualMap.get(m.modelName.trim())!, 0) / topCand.length;

    const defLift = defAvg - targetDay.avgDiffCoins;
    const candLift = candAvg - targetDay.avgDiffCoins;

    valDefaultSum += defLift;
    valCandidateSum += candLift;
    valValidCount++;

    diffs.push(candLift - defLift);
  }

  const valEvaluatedDays = valValidCount;
  const valDefaultLift = valEvaluatedDays > 0 ? Math.round(valDefaultSum / valEvaluatedDays) : 0;
  const valCandidateLift =
    valEvaluatedDays > 0 ? Math.round(valCandidateSum / valEvaluatedDays) : 0;
  const valLiftGain = valCandidateLift - valDefaultLift;

  // Paired t-test
  let tValue = 0;
  let valStdError = 0;
  if (diffs.length >= 2) {
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance =
      diffs.reduce((acc, d) => acc + (d - meanDiff) * (d - meanDiff), 0) /
      (diffs.length - 1);
    const stdDev = Math.sqrt(variance);
    valStdError = stdDev / Math.sqrt(diffs.length);
    if (valStdError > 0.001) {
      tValue = Math.round((meanDiff / valStdError) * 100) / 100;
    }
  }

  const isRecommended = valLiftGain > 0 && tValue >= 2.0;

  let verdictMessage = '';
  if (isRecommended) {
    verdictMessage = `検証期間（後半30%）において上位${k}機種のリフトが平均 +${valLiftGain}枚 向上し、t値 ${tValue}（≧ 2.0）により偶然のばらつきと区別できる有意な改善が確認されました。この店舗設定としての採用を推奨します。`;
  } else if (valLiftGain <= 0) {
    verdictMessage = `検証期間において改善が見られないか低下（${valLiftGain}枚、t値 ${tValue}）しました。過学習を防止するため、標準のデフォルト重みの維持を推奨します。`;
  } else {
    verdictMessage = `検証期間で +${valLiftGain}枚 のプラスが見られましたが、t値が ${tValue}（< 2.0）のため偶然の変動と区別できません。統計的信頼性を重視し、標準デフォルト重みの維持を推奨します。`;
  }

  if (onProgress) {
    onProgress(100);
  }

  return {
    candidateWeights: bestCandidateWeights,
    trainEvaluatedDays: trainDays.length,
    valEvaluatedDays,

    trainDefaultLift,
    trainCandidateLift,
    trainLiftGain,

    valDefaultLift,
    valCandidateLift,
    valLiftGain,
    valStdError: Math.round(valStdError * 10) / 10,
    tValue,

    isRecommended,
    verdictMessage,
  };
}

// ==========================================
// 台番ランキングの予測力検証 (Machine Backtest)
// ==========================================

export interface MachineBaselineMetrics {
  avgDiff: number;
  avgLift: number;
  avgWinRate: number;
}

export interface MachineBacktestDayEvaluation {
  date: string;
  dayOfWeek: string;
  isSpecialDay: boolean;
  hallAvgDiff: number;
  hallWinRate: number;
  totalMachines: number;
  topN: number;
  selectedMachineNums: number[];
  actualAvgDiff: number;
  actualLift: number;
  actualWinRate: number;
  baselines: {
    randomWithinModel: MachineBaselineMetrics;
    modelAverage: MachineBaselineMetrics;
    priorDayDiff: MachineBaselineMetrics;
    randomMachine: MachineBaselineMetrics;
  };
}

export interface MachineBacktestEvaluation {
  evaluatedDaysCount: number;
  topN: number;
  avgActualDiff: number;
  avgLift: number;
  avgWinRate: number;
  hallAvgDiff: number;
  hallAvgWinRate: number;
  ci95: [number, number]; // [lower, upper]
  hasEdge: boolean; // ci95[0] > 0
  verdictMessage: string;
  baselines: {
    randomWithinModel: MachineBaselineMetrics;
    modelAverage: MachineBaselineMetrics;
    priorDayDiff: MachineBaselineMetrics;
    randomMachine: MachineBaselineMetrics;
  };
  dailyEvaluations: MachineBacktestDayEvaluation[];
}

export interface MachineBacktestResult {
  evaluatedDaysCount: number;
  topN: number;
  minEvidenceThreshold: number;
  withFilter: MachineBacktestEvaluation; // 根拠日数フィルタあり（閾値未満除外）
  withoutFilter: MachineBacktestEvaluation; // 根拠日数フィルタなし（全台）
}

export interface MachineBacktestOptions {
  topN?: number; // default: 10
  minEvidenceDays?: number; // default: 3
  blockLength?: number; // default: 7
  bootstrapIterations?: number; // default: 2000
  seed?: number; // default: 42
  weights?: MachineRankingWeights;
  minPriorDays?: number; // default: 3
  onProgress?: (progress: number) => void;
}

/**
 * Deterministic pseudo-random number generator (Mulberry32) for reproducible tests and baselines.
 */
function createSeededRandom(initialSeed: number) {
  let s = (initialSeed >>> 0) || 12345;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes Moving Block Bootstrap 95% Confidence Interval for daily lift series.
 * Block length defaults to 7 days, 2000 iterations.
 */
export function computeBlockBootstrapCI(
  series: number[],
  blockLength: number = 7,
  iterations: number = 2000,
  seed: number = 42
): { ciLower: number; ciUpper: number; mean: number } {
  const n = series.length;
  if (n === 0) return { ciLower: 0, ciUpper: 0, mean: 0 };
  const originalMean = series.reduce((a, b) => a + b, 0) / n;
  if (n < 2) {
    const rounded = Math.round(originalMean * 10) / 10;
    return { ciLower: rounded, ciUpper: rounded, mean: rounded };
  }

  const rng = createSeededRandom(seed);
  const effectiveBlockLength = Math.max(1, Math.min(blockLength, n));
  const numBlocks = Math.ceil(n / effectiveBlockLength);
  const bootstrapMeans: number[] = new Array(iterations);

  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    let count = 0;
    for (let k = 0; k < numBlocks && count < n; k++) {
      const startIdx = Math.floor(rng() * n);
      for (let j = 0; j < effectiveBlockLength && count < n; j++) {
        sum += series[(startIdx + j) % n];
        count++;
      }
    }
    bootstrapMeans[b] = sum / n;
  }

  bootstrapMeans.sort((a, b) => a - b);
  const lowerIdx = Math.floor(iterations * 0.025);
  const upperIdx = Math.min(iterations - 1, Math.floor(iterations * 0.975));

  const ciLower = Math.round(bootstrapMeans[lowerIdx] * 10) / 10;
  const ciUpper = Math.round(bootstrapMeans[upperIdx] * 10) / 10;

  return {
    ciLower,
    ciUpper,
    mean: Math.round(originalMean * 10) / 10,
  };
}

/**
 * Evaluates target machine prediction accuracy across historical trading days.
 * Strictly uses data prior to each evaluation day (no future data leakage).
 * Compares Top-N predictions against 4 baselines:
 *  1. 同機種内ランダム (Random within same models, seed-fixed 100 trials average)
 *  2. 同機種の台平均 (Model Average)
 *  3. 前日差枚順 (Prior day diff order)
 *  4. 台番のランダム (Uniform random machine selection across hall)
 * Also computes block bootstrap 95% CI to determine statistical superiority (優位性).
 */
export function runMachineBacktest(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  options?: MachineBacktestOptions
): MachineBacktestResult {
  const topN = options?.topN ?? 10;
  const minEvidenceThreshold = options?.minEvidenceDays ?? 3;
  const blockLength = options?.blockLength ?? 7;
  const bootstrapIterations = options?.bootstrapIterations ?? 2000;
  const seed = options?.seed ?? 42;
  const weights = options?.weights ?? DEFAULT_MACHINE_RANKING_WEIGHTS;
  const minPriorDays = options?.minPriorDays ?? 3;
  const onProgress = options?.onProgress;

  const emptyEval = (threshold: number): MachineBacktestEvaluation => ({
    evaluatedDaysCount: 0,
    topN,
    avgActualDiff: 0,
    avgLift: 0,
    avgWinRate: 0,
    hallAvgDiff: 0,
    hallAvgWinRate: 0,
    ci95: [0, 0],
    hasEdge: false,
    verdictMessage: '評価対象となる台番別データ（または十分な過去日数）がありません。',
    baselines: {
      randomWithinModel: { avgDiff: 0, avgLift: 0, avgWinRate: 0 },
      modelAverage: { avgDiff: 0, avgLift: 0, avgWinRate: 0 },
      priorDayDiff: { avgDiff: 0, avgLift: 0, avgWinRate: 0 },
      randomMachine: { avgDiff: 0, avgLift: 0, avgWinRate: 0 },
    },
    dailyEvaluations: [],
  });

  if (!dailyRecords || dailyRecords.length < minPriorDays + 1) {
    return {
      evaluatedDaysCount: 0,
      topN,
      minEvidenceThreshold,
      withFilter: emptyEval(minEvidenceThreshold),
      withoutFilter: emptyEval(0),
    };
  }

  // Sort strictly ascending by date
  const sortedRecords = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date));

  // Find evaluatable days (must have machines data and sufficient prior days with machines)
  const evalIndices: number[] = [];
  for (let i = minPriorDays; i < sortedRecords.length; i++) {
    const day = sortedRecords[i];
    if (day.machines && day.machines.length > 0) {
      // Check if there is at least 1 prior day with machines data
      const hasPriorMachineData = sortedRecords
        .slice(0, i)
        .some((r) => r.machines && r.machines.length > 0);
      if (hasPriorMachineData) {
        evalIndices.push(i);
      }
    }
  }

  if (evalIndices.length === 0) {
    return {
      evaluatedDaysCount: 0,
      topN,
      minEvidenceThreshold,
      withFilter: emptyEval(minEvidenceThreshold),
      withoutFilter: emptyEval(0),
    };
  }

  const rng = createSeededRandom(seed);

  const unfilteredDays: MachineBacktestDayEvaluation[] = [];
  const filteredDays: MachineBacktestDayEvaluation[] = [];

  for (let step = 0; step < evalIndices.length; step++) {
    const evalIdx = evalIndices[step];
    const evalDay = sortedRecords[evalIdx];
    const priorRecords = sortedRecords.slice(0, evalIdx);
    const prevDay = sortedRecords[evalIdx - 1];

    const dayMachines = evalDay.machines!;
    const totalMachines = dayMachines.length;
    const dayMachinesMap = new Map<number, DailyMachineRecord>();
    const modelToMachines = new Map<string, DailyMachineRecord[]>();

    let hallDiffSum = 0;
    let hallWinCount = 0;

    for (const m of dayMachines) {
      dayMachinesMap.set(m.machineNum, m);
      hallDiffSum += m.diff;
      if (m.diff > 0) hallWinCount++;

      const list = modelToMachines.get(m.modelName);
      if (list) {
        list.push(m);
      } else {
        modelToMachines.set(m.modelName, [m]);
      }
    }

    const hallAvgDiff = Math.round(hallDiffSum / totalMachines);
    const hallWinRate = Math.round((hallWinCount / totalMachines) * 1000) / 10;

    // Prior day machines map
    const prevDayMachinesMap = new Map<number, DailyMachineRecord>();
    if (prevDay && prevDay.machines) {
      for (const m of prevDay.machines) {
        prevDayMachinesMap.set(m.machineNum, m);
      }
    }

    // Baseline 4: Hall uniform random (100 trials)
    let bRandomDiffSum = 0;
    let bRandomWinCount = 0;
    const trials = 100;
    for (let t = 0; t < trials; t++) {
      let tDiff = 0;
      let tWin = 0;
      const sampleSize = Math.min(topN, totalMachines);
      for (let s = 0; s < sampleSize; s++) {
        const idx = Math.floor(rng() * totalMachines);
        const rm = dayMachines[idx];
        tDiff += rm.diff;
        if (rm.diff > 0) tWin++;
      }
      bRandomDiffSum += sampleSize > 0 ? tDiff / sampleSize : 0;
      bRandomWinCount += sampleSize > 0 ? (tWin / sampleSize) * 100 : 0;
    }
    const baselineRandomMachine: MachineBaselineMetrics = {
      avgDiff: Math.round(bRandomDiffSum / trials),
      avgLift: Math.round(bRandomDiffSum / trials - hallAvgDiff),
      avgWinRate: Math.round((bRandomWinCount / trials) * 10) / 10,
    };

    // Baseline 3: Prior day diff order (Top-N with highest diff on prevDay)
    const prevMatches: DailyMachineRecord[] = [];
    for (const [mNum, prevM] of prevDayMachinesMap.entries()) {
      if (dayMachinesMap.has(mNum)) {
        prevMatches.push(prevM);
      }
    }
    prevMatches.sort((a, b) => b.diff - a.diff);
    const prevTopN = prevMatches.slice(0, topN);
    let prevActualDiffSum = 0;
    let prevActualWinCount = 0;
    for (const pm of prevTopN) {
      const todayM = dayMachinesMap.get(pm.machineNum)!;
      prevActualDiffSum += todayM.diff;
      if (todayM.diff > 0) prevActualWinCount++;
    }
    const baselinePriorDayDiff: MachineBaselineMetrics =
      prevTopN.length > 0
        ? {
            avgDiff: Math.round(prevActualDiffSum / prevTopN.length),
            avgLift: Math.round(prevActualDiffSum / prevTopN.length - hallAvgDiff),
            avgWinRate: Math.round((prevActualWinCount / prevTopN.length) * 1000) / 10,
          }
        : { avgDiff: hallAvgDiff, avgLift: 0, avgWinRate: hallWinRate };

    // Run prediction engine using prior records only
    const rankingResult = calculateTargetMachineRanking(
      evalDay.date,
      priorRecords,
      specialDayRules,
      weights,
      { minEvidenceDays: 0 }
    );

    // Helper to evaluate a specific chosen subset of target machines
    const evaluateSelection = (
      selectedRankings: TargetMachineScore[]
    ): MachineBacktestDayEvaluation => {
      // Keep only machines that actually played on evalDay
      const validRankings = selectedRankings.filter((r) => dayMachinesMap.has(r.machineNum));
      const picked = validRankings.slice(0, topN);

      if (picked.length === 0) {
        return {
          date: evalDay.date,
          dayOfWeek: evalDay.dayOfWeek,
          isSpecialDay: Boolean(rankingResult.isSpecialDay),
          hallAvgDiff,
          hallWinRate,
          totalMachines,
          topN,
          selectedMachineNums: [],
          actualAvgDiff: hallAvgDiff,
          actualLift: 0,
          actualWinRate: hallWinRate,
          baselines: {
            randomWithinModel: { avgDiff: hallAvgDiff, avgLift: 0, avgWinRate: hallWinRate },
            modelAverage: { avgDiff: hallAvgDiff, avgLift: 0, avgWinRate: hallWinRate },
            priorDayDiff: baselinePriorDayDiff,
            randomMachine: baselineRandomMachine,
          },
        };
      }

      // Actual performance
      let actualDiffSum = 0;
      let actualWinCount = 0;
      const selectedMachineNums: number[] = [];

      for (const p of picked) {
        selectedMachineNums.push(p.machineNum);
        const actualM = dayMachinesMap.get(p.machineNum)!;
        actualDiffSum += actualM.diff;
        if (actualM.diff > 0) actualWinCount++;
      }

      const actualAvgDiff = Math.round(actualDiffSum / picked.length);
      const actualLift = actualAvgDiff - hallAvgDiff;
      const actualWinRate = Math.round((actualWinCount / picked.length) * 1000) / 10;

      // Baseline 1: Random within same models (100 trials, seed-fixed)
      let bModelRandDiffSum = 0;
      let bModelRandWinCount = 0;
      for (let t = 0; t < trials; t++) {
        let tDiff = 0;
        let tWin = 0;
        for (const p of picked) {
          const modelMachines = modelToMachines.get(p.modelName);
          if (modelMachines && modelMachines.length > 0) {
            const mIdx = Math.floor(rng() * modelMachines.length);
            const rm = modelMachines[mIdx];
            tDiff += rm.diff;
            if (rm.diff > 0) tWin++;
          } else {
            const actualM = dayMachinesMap.get(p.machineNum)!;
            tDiff += actualM.diff;
            if (actualM.diff > 0) tWin++;
          }
        }
        bModelRandDiffSum += tDiff / picked.length;
        bModelRandWinCount += (tWin / picked.length) * 100;
      }
      const baselineRandomWithinModel: MachineBaselineMetrics = {
        avgDiff: Math.round(bModelRandDiffSum / trials),
        avgLift: Math.round(bModelRandDiffSum / trials - hallAvgDiff),
        avgWinRate: Math.round((bModelRandWinCount / trials) * 10) / 10,
      };

      // Baseline 2: Model Average
      let modelAvgDiffSum = 0;
      let modelWinRateSum = 0;
      for (const p of picked) {
        const modelMachines = modelToMachines.get(p.modelName);
        if (modelMachines && modelMachines.length > 0) {
          const mSum = modelMachines.reduce((a, b) => a + b.diff, 0);
          const mWins = modelMachines.filter((m) => m.diff > 0).length;
          modelAvgDiffSum += mSum / modelMachines.length;
          modelWinRateSum += (mWins / modelMachines.length) * 100;
        } else {
          const actualM = dayMachinesMap.get(p.machineNum)!;
          modelAvgDiffSum += actualM.diff;
          modelWinRateSum += actualM.diff > 0 ? 100 : 0;
        }
      }
      const baselineModelAverage: MachineBaselineMetrics = {
        avgDiff: Math.round(modelAvgDiffSum / picked.length),
        avgLift: Math.round(modelAvgDiffSum / picked.length - hallAvgDiff),
        avgWinRate: Math.round((modelWinRateSum / picked.length) * 10) / 10,
      };

      return {
        date: evalDay.date,
        dayOfWeek: evalDay.dayOfWeek,
        isSpecialDay: Boolean(rankingResult.isSpecialDay),
        hallAvgDiff,
        hallWinRate,
        totalMachines,
        topN: picked.length,
        selectedMachineNums,
        actualAvgDiff,
        actualLift,
        actualWinRate,
        baselines: {
          randomWithinModel: baselineRandomWithinModel,
          modelAverage: baselineModelAverage,
          priorDayDiff: baselinePriorDayDiff,
          randomMachine: baselineRandomMachine,
        },
      };
    };

    // Unfiltered (all machines)
    unfilteredDays.push(evaluateSelection(rankingResult.rankings));

    // Filtered (evidenceDays >= minEvidenceThreshold)
    const filteredSelection = rankingResult.rankings.filter(
      (r) => r.evidenceDays >= minEvidenceThreshold
    );
    filteredDays.push(evaluateSelection(filteredSelection));

    if (onProgress) {
      onProgress(Math.round(((step + 1) / evalIndices.length) * 100));
    }
  }

  // Aggregate results helper
  const aggregateEvaluation = (
    days: MachineBacktestDayEvaluation[]
  ): MachineBacktestEvaluation => {
    const count = days.length;
    if (count === 0) return emptyEval(0);

    const avgActualDiff = Math.round(days.reduce((a, d) => a + d.actualAvgDiff, 0) / count);
    const avgLift = Math.round(days.reduce((a, d) => a + d.actualLift, 0) / count);
    const avgWinRate =
      Math.round((days.reduce((a, d) => a + d.actualWinRate, 0) / count) * 10) / 10;
    const hallAvgDiff = Math.round(days.reduce((a, d) => a + d.hallAvgDiff, 0) / count);
    const hallAvgWinRate =
      Math.round((days.reduce((a, d) => a + d.hallWinRate, 0) / count) * 10) / 10;

    // Baselines aggregation
    const bRandModelDiff = Math.round(
      days.reduce((a, d) => a + d.baselines.randomWithinModel.avgDiff, 0) / count
    );
    const bRandModelLift = Math.round(
      days.reduce((a, d) => a + d.baselines.randomWithinModel.avgLift, 0) / count
    );
    const bRandModelWin =
      Math.round(
        (days.reduce((a, d) => a + d.baselines.randomWithinModel.avgWinRate, 0) / count) * 10
      ) / 10;

    const bModelAvgDiff = Math.round(
      days.reduce((a, d) => a + d.baselines.modelAverage.avgDiff, 0) / count
    );
    const bModelAvgLift = Math.round(
      days.reduce((a, d) => a + d.baselines.modelAverage.avgLift, 0) / count
    );
    const bModelAvgWin =
      Math.round((days.reduce((a, d) => a + d.baselines.modelAverage.avgWinRate, 0) / count) * 10) /
      10;

    const bPriorDiff = Math.round(
      days.reduce((a, d) => a + d.baselines.priorDayDiff.avgDiff, 0) / count
    );
    const bPriorLift = Math.round(
      days.reduce((a, d) => a + d.baselines.priorDayDiff.avgLift, 0) / count
    );
    const bPriorWin =
      Math.round((days.reduce((a, d) => a + d.baselines.priorDayDiff.avgWinRate, 0) / count) * 10) /
      10;

    const bRandMachineDiff = Math.round(
      days.reduce((a, d) => a + d.baselines.randomMachine.avgDiff, 0) / count
    );
    const bRandMachineLift = Math.round(
      days.reduce((a, d) => a + d.baselines.randomMachine.avgLift, 0) / count
    );
    const bRandMachineWin =
      Math.round(
        (days.reduce((a, d) => a + d.baselines.randomMachine.avgWinRate, 0) / count) * 10
      ) / 10;

    // Block bootstrap on daily lifts
    const lifts = days.map((d) => d.actualLift);
    const { ciLower, ciUpper } = computeBlockBootstrapCI(
      lifts,
      blockLength,
      bootstrapIterations,
      seed
    );

    // Statistical edge check: 95% CI strictly above 0
    const hasEdge = ciLower > 0;

    let verdictMessage = '';
    if (hasEdge) {
      verdictMessage = `95%信頼区間 [+${ciLower}枚, +${ciUpper}枚] で0を上回っており、台番予測に統計的優位性（リフト平均 +${avgLift}枚）が確認されました。`;
    } else {
      verdictMessage = `95%信頼区間 [${ciLower >= 0 ? '+' : ''}${ciLower}枚, ${
        ciUpper >= 0 ? '+' : ''
      }${ciUpper}枚] が0をまたいでおり（または下回っており）、台番単位の予測に明確な優位性は確認されていません（偶然のばらつきの範囲内です）。`;
    }

    return {
      evaluatedDaysCount: count,
      topN,
      avgActualDiff,
      avgLift,
      avgWinRate,
      hallAvgDiff,
      hallAvgWinRate,
      ci95: [ciLower, ciUpper],
      hasEdge,
      verdictMessage,
      baselines: {
        randomWithinModel: {
          avgDiff: bRandModelDiff,
          avgLift: bRandModelLift,
          avgWinRate: bRandModelWin,
        },
        modelAverage: {
          avgDiff: bModelAvgDiff,
          avgLift: bModelAvgLift,
          avgWinRate: bModelAvgWin,
        },
        priorDayDiff: {
          avgDiff: bPriorDiff,
          avgLift: bPriorLift,
          avgWinRate: bPriorWin,
        },
        randomMachine: {
          avgDiff: bRandMachineDiff,
          avgLift: bRandMachineLift,
          avgWinRate: bRandMachineWin,
        },
      },
      dailyEvaluations: days,
    };
  };

  return {
    evaluatedDaysCount: evalIndices.length,
    topN,
    minEvidenceThreshold,
    withFilter: aggregateEvaluation(filteredDays),
    withoutFilter: aggregateEvaluation(unfilteredDays),
  };
}
