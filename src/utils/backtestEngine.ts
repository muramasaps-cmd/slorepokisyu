import { DailyRecord, SpecialDayRules, RankingWeights } from '../data/types';
import {
  calculateTargetDateRanking,
  DEFAULT_RANKING_WEIGHTS,
} from './targetRankingEngine';

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

  for (let i = minWarmupDays; i < sorted.length; i++) {
    const targetDay = sorted[i];
    // Strict point-in-time isolation: ONLY prior records
    const priorRecords = sorted.slice(0, i);

    if (priorRecords.length < minWarmupDays) continue;

    // 1. Run Engine Forecast
    const forecast = calculateTargetDateRanking(
      targetDay.date,
      priorRecords,
      specialDayRules,
      oldEventDays,
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
  k: number = 3
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

  // Search grid on Train period
  const candidateDivisors = [25, 35, 50];
  const candidateWinMults = [0.3, 0.6, 1.0];
  const candidateHighMults = [2.0, 4.5, 7.0];
  const candidateBlends = [0.5, 0.75, 0.9];

  let bestTrainLift = -Infinity;
  let bestCandidateWeights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS };

  // Evaluate candidate weights on train days
  for (const div of candidateDivisors) {
    for (const win of candidateWinMults) {
      for (const high of candidateHighMults) {
        for (const blend of candidateBlends) {
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
            const priorRecords = sorted.filter((r) => r.date < targetDay.date);
            const fc = calculateTargetDateRanking(
              targetDay.date,
              priorRecords,
              specialDayRules,
              oldEventDays,
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
        }
      }
    }
  }

  // Evaluate default weights on Train days for baseline
  let trainDefaultSumLift = 0;
  let trainDefaultCount = 0;
  for (let ti = 0; ti < trainDays.length; ti++) {
    const targetDay = trainDays[ti];
    const priorRecords = sorted.filter((r) => r.date < targetDay.date);
    const fc = calculateTargetDateRanking(
      targetDay.date,
      priorRecords,
      specialDayRules,
      oldEventDays,
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
    const priorRecords = sorted.filter((r) => r.date < targetDay.date);

    const actualMap = new Map<string, number>();
    targetDay.models?.forEach((m) => actualMap.set(m.modelName.trim(), m.avgDiffCoins));

    // Default
    const fcDef = calculateTargetDateRanking(
      targetDay.date,
      priorRecords,
      specialDayRules,
      oldEventDays,
      DEFAULT_RANKING_WEIGHTS
    );
    // Candidate
    const fcCand = calculateTargetDateRanking(
      targetDay.date,
      priorRecords,
      specialDayRules,
      oldEventDays,
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
