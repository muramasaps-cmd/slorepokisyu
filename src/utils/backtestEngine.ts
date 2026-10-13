import { DailyRecord, DailyMachineRecord, SpecialDayRules, RankingWeights } from '../data/types';
import {
  buildFeatureIndex,
  buildPreparedTargetDay,
  scoreFromPrepared,
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
import { normalizeModelName } from './modelName';
import { isJapaneseHoliday } from './holidayUtils';
import { isDateSpecialDay } from './dataEngine';

export interface BacktestDayEvaluation {
  date: string;
  dayOfWeek: string;
  isSpecialDay: boolean;
  actualHallAvgDiff: number;
  expectedHallAvgDiff: number;
  hallError: number;
  allPeriodHallError: number; // 全期間平均を出すだけの予測誤差

  // Engine Top-K
  engineTopKModels: string[];
  engineTopKActualAvgDiff: number;
  engineTopKActualLift: number;
  engineTopKPositive: boolean;
  engineSpearmanCorr: number | null;
  engineDiffCoinsMae: number;

  // Baseline 1 Top-K (全期間の平均差枚順)
  baselineTopKModels: string[];
  baselineTopKActualAvgDiff: number;
  baselineTopKActualLift: number;
  baselineTopKPositive: boolean;
  baselineSpearmanCorr: number | null;

  // Baseline 2 Top-K: 同曜日（祝日含む）平均順
  dowTopKModels: string[];
  dowTopKActualAvgDiff: number;
  dowTopKActualLift: number;
  dowTopKPositive: boolean;
  dowSpearmanCorr: number | null;

  // Baseline 3 Top-K: 同特日平均順
  specialTopKModels: string[];
  specialTopKActualAvgDiff: number;
  specialTopKActualLift: number;
  specialTopKPositive: boolean;
  specialSpearmanCorr: number | null;

  // Baseline 4 Top-K: 直近14日平均順
  recent14TopKModels: string[];
  recent14TopKActualAvgDiff: number;
  recent14TopKActualLift: number;
  recent14TopKPositive: boolean;
  recent14SpearmanCorr: number | null;

  // Baseline 5: ランダム（シード固定100回平均）
  randomTopKActualAvgDiff: number;
  randomTopKActualLift: number;
  randomTopKPositive: boolean;
  randomSpearmanCorr: number | null;

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

  // Baseline 1: 全期間平均順
  baselineAvgTopKLift: number;
  baselineAvgTopKDiff: number;
  baselineTopKPositiveRate: number; // %
  baselineAvgSpearman: number;

  // Baseline 2: 同曜日（祝日含む）平均順
  dowBaselineAvgTopKLift: number;
  dowBaselineAvgTopKDiff: number;
  dowBaselineTopKPositiveRate: number; // %
  dowBaselineAvgSpearman: number;

  // Baseline 3: 同特日平均順
  specialBaselineAvgTopKLift: number;
  specialBaselineAvgTopKDiff: number;
  specialBaselineTopKPositiveRate: number; // %
  specialBaselineAvgSpearman: number;

  // Baseline 4: 直近14日平均順
  recent14BaselineAvgTopKLift: number;
  recent14BaselineAvgTopKDiff: number;
  recent14BaselineTopKPositiveRate: number; // %
  recent14BaselineAvgSpearman: number;

  // Baseline 5: ランダム（シード固定100回平均）
  randomBaselineAvgTopKLift: number;
  randomBaselineAvgTopKDiff: number;
  randomBaselineTopKPositiveRate: number; // %
  randomBaselineAvgSpearman: number;

  // Hall MAE Comparison: "ホール全体MAEも「全期間平均を出すだけの予測」と比較する"
  allPeriodHallMae: number;
  hallMaeImprovement: number; // allPeriodHallMae - engineHallMae

  // Comparison Delta (vs baseline 1)
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

  // Rolling validation (3-5 splits) & 7-day Block Bootstrap (2000 runs)
  numSplits: number;
  splitGains: number[];
  meanSplitGain: number;
  bootstrapCiLower: number;
  bootstrapCiUpper: number;
  bootstrapIterations: number;
  bootstrapBlockLength: number;

  isRecommended: boolean; // meanSplitGain > 0 && bootstrapCiLower > 0
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
 * Helper to compute machine-weighted actual stats across a list of models
 */
function computeTopKMachineWeightedStats(
  modelNames: string[],
  actualModelMap: Map<string, { avgDiffCoins: number; winRate: number | null; totalMachines: number }>,
  actualHallAvgDiff: number
): { avgDiff: number; lift: number; isPositive: boolean } {
  let totalMachines = 0;
  let totalDiff = 0;
  for (const name of modelNames) {
    const act = actualModelMap.get(name);
    if (act) {
      const machines = Math.max(1, act.totalMachines);
      totalMachines += machines;
      totalDiff += machines * act.avgDiffCoins;
    }
  }
  const avgDiff = totalMachines > 0 ? Math.round((totalDiff / totalMachines) * 10) / 10 : 0;
  const lift = Math.round((avgDiff - actualHallAvgDiff) * 10) / 10;
  return { avgDiff, lift, isPositive: avgDiff > 0 };
}

/**
 * Fast deterministic hash string helper
 */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Executes a point-in-time walk-forward backtest on historical daily records.
 * Uses ONLY records strictly prior to each target date.
 * Includes 5 baselines: All-Time, Day-of-Week (incl. holidays), Special Day, Recent 14d, Random (100 runs).
 * Computes machine-weighted actual results with minimum machines filter (default: 3台以上).
 */
export function runWalkForwardBacktest(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays: string = '',
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  k: number = 3,
  minWarmupDays: number = 30,
  minMachines: number = 3
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

    // Actual day results map with machine counts
    const actualModelMap = new Map<string, { avgDiffCoins: number; winRate: number | null; totalMachines: number }>();
    targetDay.models?.forEach((m) => {
      actualModelMap.set(normalizeModelName(m.modelName), {
        avgDiffCoins: m.avgDiffCoins,
        winRate: m.winRate,
        totalMachines: m.totalMachines || 1,
      });
    });

    if (actualModelMap.size < 2) continue;

    const actualHallAvgDiff = targetDay.avgDiffCoins;
    const expectedHallAvgDiff = forecast.expectedHallAvgDiffCoins;
    const hallError = Math.abs(expectedHallAvgDiff - actualHallAvgDiff);

    // Naive all-period hall average prediction & error
    const allPriorHallAvg = priorRecords.reduce((acc, r) => acc + r.avgDiffCoins, 0) / priorRecords.length;
    const allPeriodHallError = Math.abs(allPriorHallAvg - actualHallAvgDiff);

    // Eligible candidate models on targetDay meeting minMachines filter (default: 3台以上)
    let eligibleModels = Array.from(actualModelMap.entries())
      .filter(([_, info]) => info.totalMachines >= minMachines)
      .map(([name]) => name);
    if (eligibleModels.length < 2) {
      eligibleModels = Array.from(actualModelMap.keys());
    }
    const eligibleSet = new Set(eligibleModels);

    // 1. Engine Top-K: filter forecast model rankings by eligibility and presence on targetDay
    const commonRankings = forecast.modelRankings.filter((m) => {
      const norm = normalizeModelName(m.modelName);
      return actualModelMap.has(norm) && eligibleSet.has(norm);
    });

    if (commonRankings.length === 0) continue;

    const engineTopK = commonRankings.slice(0, Math.min(k, commonRankings.length));
    const engineTopKNames = engineTopK.map((m) => normalizeModelName(m.modelName));
    const engineStats = computeTopKMachineWeightedStats(engineTopKNames, actualModelMap, actualHallAvgDiff);
    const engineTopKActualAvgDiff = engineStats.avgDiff;
    const engineTopKActualLift = engineStats.lift;
    const engineTopKPositive = engineStats.isPositive;

    // Engine Spearman
    const engineScores = commonRankings.map((m) => m.compositeScore);
    const actualDiffs = commonRankings.map((m) => actualModelMap.get(normalizeModelName(m.modelName))!.avgDiffCoins);
    const engineSpearmanCorr = calculateSpearman(engineScores, actualDiffs);

    // Engine MAE
    const maeSum = commonRankings.reduce((acc, m) => {
      const act = actualModelMap.get(normalizeModelName(m.modelName))!.avgDiffCoins;
      return acc + Math.abs(m.expectedDiffCoins - act);
    }, 0);
    const engineDiffCoinsMae = Math.round(maeSum / commonRankings.length);

    // Helper for computing model averages over a subset of prior records
    const computeModelPriorAverages = (records: DailyRecord[]): Map<string, number> => {
      const map = new Map<string, { totalDiff: number; count: number }>();
      for (const r of records) {
        if (!r.models) continue;
        for (const m of r.models) {
          const norm = normalizeModelName(m.modelName);
          const cur = map.get(norm) || { totalDiff: 0, count: 0 };
          cur.totalDiff += m.avgDiffCoins;
          cur.count += 1;
          map.set(norm, cur);
        }
      }
      const res = new Map<string, number>();
      for (const [name, stat] of map.entries()) {
        if (stat.count > 0) res.set(name, stat.totalDiff / stat.count);
      }
      return res;
    };

    // Helper to score and get top-K for a baseline map
    const evaluateBaseline = (avgMap: Map<string, number>) => {
      const scored = eligibleModels
        .map((name) => ({ name, score: avgMap.get(name) ?? 0 }))
        .sort((a, b) => b.score - a.score);
      const topK = scored.slice(0, Math.min(k, scored.length));
      const topKNames = topK.map((m) => m.name);
      const stats = computeTopKMachineWeightedStats(topKNames, actualModelMap, actualHallAvgDiff);
      const spearman = calculateSpearman(
        scored.map((m) => m.score),
        scored.map((m) => actualModelMap.get(m.name)!.avgDiffCoins)
      );
      return {
        topKModels: topKNames,
        actualAvgDiff: stats.avgDiff,
        actualLift: stats.lift,
        isPositive: stats.isPositive,
        spearmanCorr: spearman,
      };
    };

    // 2. Baseline 1: All-Time Average (全期間平均順)
    const allTimeAvgMap = computeModelPriorAverages(priorRecords);
    const baseline1 = evaluateBaseline(allTimeAvgMap);

    // 3. Baseline 2: Same Day-of-Week including Holidays (同曜日・祝日平均順)
    const isTargetHoliday = isJapaneseHoliday(targetDay.date);
    let matchingDowRecords = priorRecords.filter((r) => {
      if (isTargetHoliday) return isJapaneseHoliday(r.date);
      return !isJapaneseHoliday(r.date) && r.dayOfWeek === targetDay.dayOfWeek;
    });
    if (matchingDowRecords.length < 2) {
      matchingDowRecords = priorRecords.filter((r) => r.dayOfWeek === targetDay.dayOfWeek);
      if (matchingDowRecords.length === 0) matchingDowRecords = priorRecords;
    }
    const dowAvgMap = computeModelPriorAverages(matchingDowRecords);
    const baseline2 = evaluateBaseline(dowAvgMap);

    // 4. Baseline 3: Same Special Day Average (同特日平均順)
    const targetIsSpecial = isDateSpecialDay(targetDay.date, specialDayRules);
    let matchingSpecialRecords = priorRecords.filter(
      (r) => isDateSpecialDay(r.date, specialDayRules) === targetIsSpecial
    );
    if (matchingSpecialRecords.length === 0) matchingSpecialRecords = priorRecords;
    const specialAvgMap = computeModelPriorAverages(matchingSpecialRecords);
    const baseline3 = evaluateBaseline(specialAvgMap);

    // 5. Baseline 4: Recent 14 Days Average (直近14日平均順)
    const targetMs = new Date(targetDay.date).getTime();
    let recent14Records = priorRecords.filter((r) => {
      const dt = (targetMs - new Date(r.date).getTime()) / 86400000;
      return dt > 0 && dt <= 14;
    });
    if (recent14Records.length < 3) {
      recent14Records = priorRecords.slice(-14);
    }
    const recent14AvgMap = computeModelPriorAverages(recent14Records);
    const baseline4 = evaluateBaseline(recent14AvgMap);

    // 6. Baseline 5: Random Sampling 100 trials average (シード固定100回試行平均)
    let randDiffSum = 0;
    let randPositiveCount = 0;
    let randSpearmanSum = 0;
    let randSpearmanValid = 0;
    const randomTrials = 100;
    const rng = createSeededRandom(hashString(targetDay.date) ^ 42);

    for (let trial = 0; trial < randomTrials; trial++) {
      const shuffled = [...eligibleModels];
      for (let sIdx = shuffled.length - 1; sIdx > 0; sIdx--) {
        const j = Math.floor(rng() * (sIdx + 1));
        const temp = shuffled[sIdx];
        shuffled[sIdx] = shuffled[j];
        shuffled[j] = temp;
      }
      const trialTopK = shuffled.slice(0, Math.min(k, shuffled.length));
      const trialStats = computeTopKMachineWeightedStats(trialTopK, actualModelMap, actualHallAvgDiff);
      randDiffSum += trialStats.avgDiff;
      if (trialStats.isPositive) randPositiveCount++;

      const randomRankScores = eligibleModels.map((_, idx) => shuffled.indexOf(eligibleModels[idx]));
      const sp = calculateSpearman(
        randomRankScores,
        eligibleModels.map((name) => actualModelMap.get(name)!.avgDiffCoins)
      );
      if (sp !== null) {
        randSpearmanSum += sp;
        randSpearmanValid++;
      }
    }
    const randAvgDiff = Math.round((randDiffSum / randomTrials) * 10) / 10;
    const randLift = Math.round((randAvgDiff - actualHallAvgDiff) * 10) / 10;
    const randPositive = randAvgDiff > 0;
    const randSpearman = randSpearmanValid > 0 ? Math.round((randSpearmanSum / randSpearmanValid) * 1000) / 1000 : null;

    // 7. Tail evaluation
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
      allPeriodHallError,

      engineTopKModels: engineTopK.map((m) => m.modelName),
      engineTopKActualAvgDiff,
      engineTopKActualLift,
      engineTopKPositive,
      engineSpearmanCorr,
      engineDiffCoinsMae,

      baselineTopKModels: baseline1.topKModels,
      baselineTopKActualAvgDiff: baseline1.actualAvgDiff,
      baselineTopKActualLift: baseline1.actualLift,
      baselineTopKPositive: baseline1.isPositive,
      baselineSpearmanCorr: baseline1.spearmanCorr,

      dowTopKModels: baseline2.topKModels,
      dowTopKActualAvgDiff: baseline2.actualAvgDiff,
      dowTopKActualLift: baseline2.actualLift,
      dowTopKPositive: baseline2.isPositive,
      dowSpearmanCorr: baseline2.spearmanCorr,

      specialTopKModels: baseline3.topKModels,
      specialTopKActualAvgDiff: baseline3.actualAvgDiff,
      specialTopKActualLift: baseline3.actualLift,
      specialTopKPositive: baseline3.isPositive,
      specialSpearmanCorr: baseline3.spearmanCorr,

      recent14TopKModels: baseline4.topKModels,
      recent14TopKActualAvgDiff: baseline4.actualAvgDiff,
      recent14TopKActualLift: baseline4.actualLift,
      recent14TopKPositive: baseline4.isPositive,
      recent14SpearmanCorr: baseline4.spearmanCorr,

      randomTopKActualAvgDiff: randAvgDiff,
      randomTopKActualLift: randLift,
      randomTopKPositive: randPositive,
      randomSpearmanCorr: randSpearman,

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
        dowBaselineAvgTopKLift: 0,
        dowBaselineAvgTopKDiff: 0,
        dowBaselineTopKPositiveRate: 0,
        dowBaselineAvgSpearman: 0,
        specialBaselineAvgTopKLift: 0,
        specialBaselineAvgTopKDiff: 0,
        specialBaselineTopKPositiveRate: 0,
        specialBaselineAvgSpearman: 0,
        recent14BaselineAvgTopKLift: 0,
        recent14BaselineAvgTopKDiff: 0,
        recent14BaselineTopKPositiveRate: 0,
        recent14BaselineAvgSpearman: 0,
        randomBaselineAvgTopKLift: 0,
        randomBaselineAvgTopKDiff: 0,
        randomBaselineTopKPositiveRate: 0,
        randomBaselineAvgSpearman: 0,
        allPeriodHallMae: 0,
        hallMaeImprovement: 0,
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

  const dowLifts = evaluations.map((e) => e.dowTopKActualLift);
  const dowDiffs = evaluations.map((e) => e.dowTopKActualAvgDiff);
  const dowSpearmans = evaluations
    .map((e) => e.dowSpearmanCorr)
    .filter((s): s is number => s !== null);
  const dowPositiveCount = evaluations.filter((e) => e.dowTopKPositive).length;

  const specialLifts = evaluations.map((e) => e.specialTopKActualLift);
  const specialDiffs = evaluations.map((e) => e.specialTopKActualAvgDiff);
  const specialSpearmans = evaluations
    .map((e) => e.specialSpearmanCorr)
    .filter((s): s is number => s !== null);
  const specialPositiveCount = evaluations.filter((e) => e.specialTopKPositive).length;

  const recent14Lifts = evaluations.map((e) => e.recent14TopKActualLift);
  const recent14Diffs = evaluations.map((e) => e.recent14TopKActualAvgDiff);
  const recent14Spearmans = evaluations
    .map((e) => e.recent14SpearmanCorr)
    .filter((s): s is number => s !== null);
  const recent14PositiveCount = evaluations.filter((e) => e.recent14TopKPositive).length;

  const randomLifts = evaluations.map((e) => e.randomTopKActualLift);
  const randomDiffs = evaluations.map((e) => e.randomTopKActualAvgDiff);
  const randomSpearmans = evaluations
    .map((e) => e.randomSpearmanCorr)
    .filter((s): s is number => s !== null);
  const randomPositiveCount = evaluations.filter((e) => e.randomTopKPositive).length;

  const engineAvgTopKLift = Math.round(engineLifts.reduce((a, b) => a + b, 0) / total);
  const engineAvgTopKDiff = Math.round(engineDiffs.reduce((a, b) => a + b, 0) / total);
  const engineTopKPositiveRate = Math.round((enginePositiveCount / total) * 1000) / 10;
  const engineAvgSpearman =
    engineSpearmans.length > 0
      ? Math.round((engineSpearmans.reduce((a, b) => a + b, 0) / engineSpearmans.length) * 1000) / 1000
      : 0;
  const engineDiffCoinsMae = Math.round(
    evaluations.reduce((a, b) => a + b.engineDiffCoinsMae, 0) / total
  );
  const engineHallMae = Math.round(evaluations.reduce((a, b) => a + b.hallError, 0) / total);
  const allPeriodHallMae = Math.round(evaluations.reduce((a, b) => a + b.allPeriodHallError, 0) / total);
  const hallMaeImprovement = allPeriodHallMae - engineHallMae;

  const engineTailAvgDiff =
    engineTailDiffs.length > 0
      ? Math.round(engineTailDiffs.reduce((a, b) => a + b, 0) / engineTailDiffs.length)
      : 0;

  const baselineAvgTopKLift = Math.round(baselineLifts.reduce((a, b) => a + b, 0) / total);
  const baselineAvgTopKDiff = Math.round(baselineDiffs.reduce((a, b) => a + b, 0) / total);
  const baselineTopKPositiveRate = Math.round((baselinePositiveCount / total) * 1000) / 10;
  const baselineAvgSpearman =
    baselineSpearmans.length > 0
      ? Math.round((baselineSpearmans.reduce((a, b) => a + b, 0) / baselineSpearmans.length) * 1000) / 1000
      : 0;

  const dowBaselineAvgTopKLift = Math.round(dowLifts.reduce((a, b) => a + b, 0) / total);
  const dowBaselineAvgTopKDiff = Math.round(dowDiffs.reduce((a, b) => a + b, 0) / total);
  const dowBaselineTopKPositiveRate = Math.round((dowPositiveCount / total) * 1000) / 10;
  const dowBaselineAvgSpearman =
    dowSpearmans.length > 0
      ? Math.round((dowSpearmans.reduce((a, b) => a + b, 0) / dowSpearmans.length) * 1000) / 1000
      : 0;

  const specialBaselineAvgTopKLift = Math.round(specialLifts.reduce((a, b) => a + b, 0) / total);
  const specialBaselineAvgTopKDiff = Math.round(specialDiffs.reduce((a, b) => a + b, 0) / total);
  const specialBaselineTopKPositiveRate = Math.round((specialPositiveCount / total) * 1000) / 10;
  const specialBaselineAvgSpearman =
    specialSpearmans.length > 0
      ? Math.round((specialSpearmans.reduce((a, b) => a + b, 0) / specialSpearmans.length) * 1000) / 1000
      : 0;

  const recent14BaselineAvgTopKLift = Math.round(recent14Lifts.reduce((a, b) => a + b, 0) / total);
  const recent14BaselineAvgTopKDiff = Math.round(recent14Diffs.reduce((a, b) => a + b, 0) / total);
  const recent14BaselineTopKPositiveRate = Math.round((recent14PositiveCount / total) * 1000) / 10;
  const recent14BaselineAvgSpearman =
    recent14Spearmans.length > 0
      ? Math.round((recent14Spearmans.reduce((a, b) => a + b, 0) / recent14Spearmans.length) * 1000) / 1000
      : 0;

  const randomBaselineAvgTopKLift = Math.round(randomLifts.reduce((a, b) => a + b, 0) / total);
  const randomBaselineAvgTopKDiff = Math.round(randomDiffs.reduce((a, b) => a + b, 0) / total);
  const randomBaselineTopKPositiveRate = Math.round((randomPositiveCount / total) * 1000) / 10;
  const randomBaselineAvgSpearman =
    randomSpearmans.length > 0
      ? Math.round((randomSpearmans.reduce((a, b) => a + b, 0) / randomSpearmans.length) * 1000) / 1000
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

      dowBaselineAvgTopKLift,
      dowBaselineAvgTopKDiff,
      dowBaselineTopKPositiveRate,
      dowBaselineAvgSpearman,

      specialBaselineAvgTopKLift,
      specialBaselineAvgTopKDiff,
      specialBaselineTopKPositiveRate,
      specialBaselineAvgSpearman,

      recent14BaselineAvgTopKLift,
      recent14BaselineAvgTopKDiff,
      recent14BaselineTopKPositiveRate,
      recent14BaselineAvgSpearman,

      randomBaselineAvgTopKLift,
      randomBaselineAvgTopKDiff,
      randomBaselineTopKPositiveRate,
      randomBaselineAvgSpearman,

      allPeriodHallMae,
      hallMaeImprovement,

      liftEdge: engineAvgTopKLift - baselineAvgTopKLift,
      winRateEdge: Math.round((engineTopKPositiveRate - baselineTopKPositiveRate) * 10) / 10,
      spearmanEdge: Math.round((engineAvgSpearman - baselineAvgSpearman) * 1000) / 1000,
    },
  };
}
/**
 * Automated parameter tuning with Expanding Window Rolling Validation (3-5 splits)
 * and 7-day Moving Block Bootstrap (2,000 runs) 95% Confidence Interval.
 * Explores 64 random candidate parameter combinations covering scaleFactorEnabled.
 * Adoption requires BOTH positive mean lift gain across all splits AND positive 95% CI lower bound.
 */
export function runAutoTuning(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays: string = '',
  k: number = 3,
  onProgress?: (progressPercent: number) => void,
  minWarmupDays: number = 30,
  minMachines: number = 3
): TuningResult | null {
  const sorted = [...dailyRecords]
    .filter((r) => r.models && r.models.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 10) return null;

  // Determine warmup and evaluable range
  const warmupDays = Math.min(minWarmupDays, Math.max(4, Math.floor(sorted.length * 0.3)));
  const evaluableDays = sorted.slice(warmupDays);
  if (evaluableDays.length < 4) return null;

  // Expanding window rolling validation: 3 to 5 splits
  const numSplits = Math.min(5, Math.max(3, Math.floor(evaluableDays.length / 7)));

  // Define expanding splits
  // Each split s: Train = sorted[0 .. valStart], Validation = sorted[valStart .. valEnd]
  interface SplitRange {
    trainCount: number;
    valStart: number;
    valEnd: number;
    valDays: DailyRecord[];
  }
  const splits: SplitRange[] = [];
  for (let s = 0; s < numSplits; s++) {
    const valStartLocal = Math.floor((s * evaluableDays.length) / numSplits);
    const valEndLocal =
      s === numSplits - 1
        ? evaluableDays.length
        : Math.floor(((s + 1) * evaluableDays.length) / numSplits);
    const valStart = warmupDays + valStartLocal;
    const valEnd = warmupDays + valEndLocal;
    splits.push({
      trainCount: valStart,
      valStart,
      valEnd,
      valDays: sorted.slice(valStart, valEnd),
    });
  }

  // Precompute feature index and prepared target days ONCE across all sorted historical records
  const featureIndex = buildFeatureIndex(sorted, specialDayRules, oldEventDays);
  const preparedDays = sorted.map((d, idx) =>
    buildPreparedTargetDay(featureIndex, d.date, idx)
  );

  // Precompute actual day model maps with machine counts
  const actualMaps = sorted.map((d) => {
    const map = new Map<string, { avgDiffCoins: number; totalMachines: number }>();
    d.models?.forEach((m) => {
      map.set(normalizeModelName(m.modelName), {
        avgDiffCoins: m.avgDiffCoins,
        totalMachines: m.totalMachines || 1,
      });
    });
    return map;
  });

  // Generate 64 random candidate parameter combinations
  const candRng = createSeededRandom(42);
  const candidateDivisors = [20, 25, 30, 35, 40, 50, 60];
  const candidateWinMults = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2];
  const candidateHighMults = [1.5, 2.5, 3.5, 4.5, 6.0, 7.5];
  const candidateBlends = [0.4, 0.55, 0.7, 0.75, 0.85, 0.95];

  const candidates: RankingWeights[] = [
    { ...DEFAULT_RANKING_WEIGHTS, scaleFactorEnabled: true },
    { ...DEFAULT_RANKING_WEIGHTS, scaleFactorEnabled: false },
  ];

  while (candidates.length < 64) {
    const div = candidateDivisors[Math.floor(candRng() * candidateDivisors.length)];
    const win = candidateWinMults[Math.floor(candRng() * candidateWinMults.length)];
    const high = candidateHighMults[Math.floor(candRng() * candidateHighMults.length)];
    const blend = candidateBlends[Math.floor(candRng() * candidateBlends.length)];
    const scale = candRng() > 0.5;
    candidates.push({
      diffCoinDivisor: div,
      winRateMultiplier: win,
      allHighMultiplier: high,
      matchingBlendWeight: blend,
      scaleFactorEnabled: scale,
    });
  }

  // Helper to compute machine-weighted lift for a prepared day
  const computeDayLift = (dayIdx: number, w: RankingWeights): number | null => {
    const prep = preparedDays[dayIdx];
    if (!prep || prep.models.length === 0) return null;
    const fc = scoreFromPrepared(prep, w);
    if (!fc || fc.modelRankings.length === 0) return null;

    const actualMap = actualMaps[dayIdx];
    const targetDay = sorted[dayIdx];

    // Eligible candidate models meeting minMachines filter
    let eligibleModels = Array.from(actualMap.entries())
      .filter(([_, info]) => info.totalMachines >= minMachines)
      .map(([name]) => name);
    if (eligibleModels.length < 2) {
      eligibleModels = Array.from(actualMap.keys());
    }
    const eligibleSet = new Set(eligibleModels);

    const topModels = fc.modelRankings.filter((m) => {
      const norm = normalizeModelName(m.modelName);
      return actualMap.has(norm) && eligibleSet.has(norm);
    }).slice(0, k);

    if (topModels.length === 0) return null;

    let totMachines = 0;
    let totDiff = 0;
    for (const m of topModels) {
      const act = actualMap.get(normalizeModelName(m.modelName))!;
      const machines = Math.max(1, act.totalMachines);
      totMachines += machines;
      totDiff += machines * act.avgDiffCoins;
    }
    const weightedAvg = totMachines > 0 ? totDiff / totMachines : 0;
    return weightedAvg - targetDay.avgDiffCoins;
  };

  // 1. Train Evaluation: Find candidate with highest average training lift across initial expanding window
  const initialTrainCount = splits[0].trainCount;
  let bestCandidateWeights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS };
  let bestTrainLift = -Infinity;

  for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
    const cand = candidates[cIdx];
    let sumLift = 0;
    let count = 0;
    for (let ti = 0; ti < initialTrainCount; ti++) {
      const l = computeDayLift(ti, cand);
      if (l !== null) {
        sumLift += l;
        count++;
      }
    }
    const avgLift = count > 0 ? sumLift / count : -Infinity;
    if (avgLift > bestTrainLift) {
      bestTrainLift = avgLift;
      bestCandidateWeights = cand;
    }

    if (onProgress && cIdx % 8 === 0) {
      onProgress(Math.min(85, Math.round((cIdx / candidates.length) * 85)));
    }
  }

  // Train lift with default weights
  let trainDefSum = 0;
  let trainDefCount = 0;
  for (let ti = 0; ti < initialTrainCount; ti++) {
    const l = computeDayLift(ti, DEFAULT_RANKING_WEIGHTS);
    if (l !== null) {
      trainDefSum += l;
      trainDefCount++;
    }
  }
  const trainDefaultLift = trainDefCount > 0 ? Math.round(trainDefSum / trainDefCount) : 0;
  const trainCandidateLift = Math.round(bestTrainLift);
  const trainLiftGain = trainCandidateLift - trainDefaultLift;

  // 2. Rolling Validation Phase: Evaluate on future validation slices across all splits
  const splitGains: number[] = [];
  const allValDiffs: number[] = [];
  let valDefTotalSum = 0;
  let valCandTotalSum = 0;
  let valTotalDays = 0;

  for (let sIdx = 0; sIdx < splits.length; sIdx++) {
    const split = splits[sIdx];
    const splitDiffs: number[] = [];
    for (let vi = split.valStart; vi < split.valEnd; vi++) {
      const candLift = computeDayLift(vi, bestCandidateWeights);
      const defLift = computeDayLift(vi, DEFAULT_RANKING_WEIGHTS);
      if (candLift !== null && defLift !== null) {
        const diff = candLift - defLift;
        splitDiffs.push(diff);
        allValDiffs.push(diff);
        valDefTotalSum += defLift;
        valCandTotalSum += candLift;
        valTotalDays++;
      }
    }
    const sMean = splitDiffs.length > 0 ? splitDiffs.reduce((a, b) => a + b, 0) / splitDiffs.length : 0;
    splitGains.push(Math.round(sMean * 10) / 10);
  }

  if (onProgress) onProgress(90);

  const valEvaluatedDays = valTotalDays;
  const valDefaultLift = valEvaluatedDays > 0 ? Math.round(valDefTotalSum / valEvaluatedDays) : 0;
  const valCandidateLift = valEvaluatedDays > 0 ? Math.round(valCandTotalSum / valEvaluatedDays) : 0;
  const valLiftGain = valCandidateLift - valDefaultLift;

  const meanSplitGain =
    splitGains.length > 0
      ? Math.round((splitGains.reduce((a, b) => a + b, 0) / splitGains.length) * 10) / 10
      : 0;

  // 3. Block Bootstrap: 7-day blocks, 2000 iterations
  const bootstrap = computeBlockBootstrapCI(allValDiffs, 7, 2000, 42);
  const bootstrapCiLower = bootstrap.ciLower;
  const bootstrapCiUpper = bootstrap.ciUpper;

  // Paired t-test statistics for compatibility
  let tValue = 0;
  let valStdError = 0;
  if (allValDiffs.length >= 2) {
    const meanDiff = allValDiffs.reduce((a, b) => a + b, 0) / allValDiffs.length;
    const variance =
      allValDiffs.reduce((acc, d) => acc + (d - meanDiff) * (d - meanDiff), 0) /
      (allValDiffs.length - 1);
    const stdDev = Math.sqrt(variance);
    valStdError = stdDev / Math.sqrt(allValDiffs.length);
    if (valStdError > 0.001) {
      tValue = Math.round((meanDiff / valStdError) * 100) / 100;
    }
  }

  // Adoption Condition:
  // 「全分割平均の改善が正」かつ「ブロックブートストラップ（ブロック長7日、2000回）の95%区間下限が正」
  const isRecommended = meanSplitGain > 0 && bootstrapCiLower > 0;

  // Verdict message with explicit warning on multiple comparisons
  let verdictMessage = '';
  if (isRecommended) {
    verdictMessage = `ローリング検証（${numSplits}分割）において、全分割平均で +${meanSplitGain}枚 のリフト改善を確認しました。7日ブロックブートストラップ（2,000回試行）による95%信頼区間は [+${bootstrapCiLower}枚, +${bootstrapCiUpper}枚] と下限が0を上回っており、有意な改善が確認されました。※探索した${candidates.length}組の候補群からの最良選択に伴う多重比較バイアス（過学習）を考慮しても信頼性が担保されているため、店舗設定としての採用を推奨します。`;
  } else if (meanSplitGain <= 0) {
    verdictMessage = `ローリング検証（${numSplits}分割）において、全分割平均でのリフト改善が確認できませんでした（${meanSplitGain}枚）。多重比較による過学習を防止するため、標準デフォルト重みの維持を推奨します。`;
  } else {
    verdictMessage = `ローリング検証（${numSplits}分割）の全分割平均では +${meanSplitGain}枚 の改善が見られましたが、7日ブロックブートストラップ（2,000回試行）の95%信頼区間は [${bootstrapCiLower}枚, +${bootstrapCiUpper}枚] であり、下限が0以下（偶然のばらつきの範囲内）です。※多数の候補から選定したことによる多重比較（過学習）の懸念があるため、標準デフォルト重みの維持を推奨します。`;
  }

  if (onProgress) {
    onProgress(100);
  }

  return {
    candidateWeights: bestCandidateWeights,
    trainEvaluatedDays: initialTrainCount,
    valEvaluatedDays,

    trainDefaultLift,
    trainCandidateLift,
    trainLiftGain,

    valDefaultLift,
    valCandidateLift,
    valLiftGain,
    valStdError: Math.round(valStdError * 10) / 10,
    tValue,

    numSplits,
    splitGains,
    meanSplitGain,
    bootstrapCiLower,
    bootstrapCiUpper,
    bootstrapIterations: 2000,
    bootstrapBlockLength: 7,

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
  missingCount?: number;
  missingRate?: number;
  baselines: {
    randomWithinModel: MachineBaselineMetrics;
    modelAverage: MachineBaselineMetrics;
    priorDayDiff: MachineBaselineMetrics;
    randomMachine: MachineBaselineMetrics;
  };
}

export interface MachineAblationItem {
  variantKey: string;
  variantName: string;
  avgLift: number;
  ci95: [number, number];
  winRate: number;
  liftDelta: number;
  recommendZeroWeight: boolean;
}

export interface MachineBacktestEvaluation {
  evaluatedDaysCount: number;
  topN: number;
  avgActualDiff: number;
  avgLift: number;
  avgWinRate: number;
  hallAvgDiff: number;
  hallAvgWinRate: number;
  totalMissingCount?: number;
  avgMissingRate?: number;
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
  totalMissingCount?: number;
  avgMissingRate?: number;
  ablationResults?: MachineAblationItem[];
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

      const normName = normalizeModelName(m.modelName);
      const list = modelToMachines.get(normName);
      if (list) {
        list.push(m);
      } else {
        modelToMachines.set(normName, [m]);
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
      // Prompt 12 requirement:
      // DO NOT post-filter with dayMachinesMap and then slice!
      // Predictions are strictly chosen from ranking (top-N) before knowing evalDay appearances.
      const candidateList = selectedRankings.slice(0, topN);
      const selectedMachineNums = candidateList.map((c) => c.machineNum);

      // Machines present on evalDay
      const observedMachines = candidateList.filter((c) => dayMachinesMap.has(c.machineNum));
      const missingCount = candidateList.length - observedMachines.length;
      const missingRate = candidateList.length > 0
        ? Math.round((missingCount / candidateList.length) * 1000) / 10
        : 0;

      if (observedMachines.length === 0) {
        return {
          date: evalDay.date,
          dayOfWeek: evalDay.dayOfWeek,
          isSpecialDay: Boolean(rankingResult.isSpecialDay),
          hallAvgDiff,
          hallWinRate,
          totalMachines,
          topN: candidateList.length,
          selectedMachineNums,
          actualAvgDiff: hallAvgDiff,
          actualLift: 0,
          actualWinRate: hallWinRate,
          missingCount,
          missingRate,
          baselines: {
            randomWithinModel: { avgDiff: hallAvgDiff, avgLift: 0, avgWinRate: hallWinRate },
            modelAverage: { avgDiff: hallAvgDiff, avgLift: 0, avgWinRate: hallWinRate },
            priorDayDiff: baselinePriorDayDiff,
            randomMachine: baselineRandomMachine,
          },
        };
      }

      // Actual performance evaluated only on observed machines on evalDay
      let actualDiffSum = 0;
      let actualWinCount = 0;

      for (const p of observedMachines) {
        const actualM = dayMachinesMap.get(p.machineNum)!;
        actualDiffSum += actualM.diff;
        if (actualM.diff > 0) actualWinCount++;
      }

      const actualAvgDiff = Math.round(actualDiffSum / observedMachines.length);
      const actualLift = actualAvgDiff - hallAvgDiff;
      const actualWinRate = Math.round((actualWinCount / observedMachines.length) * 1000) / 10;

      // Baseline 1: Random within same models (100 trials, seed-fixed) evaluated for observed
      let bModelRandDiffSum = 0;
      let bModelRandWinCount = 0;
      for (let t = 0; t < trials; t++) {
        let tDiff = 0;
        let tWin = 0;
        for (const p of observedMachines) {
          const modelMachines = modelToMachines.get(normalizeModelName(p.modelName));
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
        bModelRandDiffSum += tDiff / observedMachines.length;
        bModelRandWinCount += (tWin / observedMachines.length) * 100;
      }
      const baselineRandomWithinModel: MachineBaselineMetrics = {
        avgDiff: Math.round(bModelRandDiffSum / trials),
        avgLift: Math.round(bModelRandDiffSum / trials - hallAvgDiff),
        avgWinRate: Math.round((bModelRandWinCount / trials) * 10) / 10,
      };

      // Baseline 2: Model Average evaluated for observed
      let modelAvgDiffSum = 0;
      let modelWinRateSum = 0;
      for (const p of observedMachines) {
        const modelMachines = modelToMachines.get(normalizeModelName(p.modelName));
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
        avgDiff: Math.round(modelAvgDiffSum / observedMachines.length),
        avgLift: Math.round(modelAvgDiffSum / observedMachines.length - hallAvgDiff),
        avgWinRate: Math.round((modelWinRateSum / observedMachines.length) * 10) / 10,
      };

      return {
        date: evalDay.date,
        dayOfWeek: evalDay.dayOfWeek,
        isSpecialDay: Boolean(rankingResult.isSpecialDay),
        hallAvgDiff,
        hallWinRate,
        totalMachines,
        topN: candidateList.length,
        selectedMachineNums,
        actualAvgDiff,
        actualLift,
        actualWinRate,
        missingCount,
        missingRate,
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

    const totalMissingCount = days.reduce((a, d) => a + (d.missingCount ?? 0), 0);
    const avgMissingRate =
      count > 0 ? Math.round((days.reduce((a, d) => a + (d.missingRate ?? 0), 0) / count) * 10) / 10 : 0;

    return {
      evaluatedDaysCount: count,
      topN,
      avgActualDiff,
      avgLift,
      avgWinRate,
      hallAvgDiff,
      hallAvgWinRate,
      totalMissingCount,
      avgMissingRate,
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

  // Prompt 14: Ablation analysis over the evaluated days
  // Variants: all, cohortDiffOnly, noHighSetting, noModelScore, noTailZoro
  const ablationVariants: {
    key: 'all' | 'cohortDiffOnly' | 'noHighSetting' | 'noModelScore' | 'noTailZoro';
    name: string;
    weights: Partial<MachineRankingWeights>;
  }[] = [
    {
      key: 'all',
      name: '全要素（既定）',
      weights: DEFAULT_MACHINE_RANKING_WEIGHTS,
    },
    {
      key: 'cohortDiffOnly',
      name: 'コホート差枚のみ',
      weights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        winRateWeight: 0,
        highSettingWeight: 0,
        modelScoreWeight: 0,
        tailMatchBonus: 0,
        zoroBonus: 0,
        recentStateWeight: 0,
      },
    },
    {
      key: 'noHighSetting',
      name: '高設定挙動なし',
      weights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        highSettingWeight: 0,
      },
    },
    {
      key: 'noModelScore',
      name: '機種スコアなし',
      weights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        modelScoreWeight: 0,
      },
    },
    {
      key: 'noTailZoro',
      name: '末尾・ゾロ目なし',
      weights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        tailMatchBonus: 0,
        zoroBonus: 0,
      },
    },
  ];

  const baseEval = aggregateEvaluation(unfilteredDays);
  const baseAvgLift = baseEval.avgLift;

  const ablationResults: MachineAblationItem[] = ablationVariants.map((variant) => {
    if (variant.key === 'all') {
      return {
        variantKey: 'all',
        variantName: variant.name,
        avgLift: baseEval.avgLift,
        ci95: baseEval.ci95,
        winRate: baseEval.avgWinRate,
        liftDelta: 0,
        recommendZeroWeight: false,
      };
    }

    // Run rankings for this variant over the evaluated days
    const variantDayLifts: number[] = [];
    let variantWinSum = 0;
    let variantValidDayCount = 0;

    for (const evalIdx of evalIndices) {
      const evalDay = sortedRecords[evalIdx];
      const recordsBefore = sortedRecords.slice(0, evalIdx);
      const dayMachinesMap = new Map<number, DailyMachineRecord>();
      (evalDay.machines || []).forEach((m) => dayMachinesMap.set(m.machineNum, m));
      const hallAvgDiff = evalDay.avgDiffCoins ?? 0;

      const ranking = calculateTargetMachineRanking(
        evalDay.date,
        recordsBefore,
        specialDayRules,
        variant.weights,
        {
          minEvidenceDays: 0,
        }
      );

      const topCandidates = ranking.rankings.slice(0, topN);
      const observed = topCandidates.filter((c) => dayMachinesMap.has(c.machineNum));
      if (observed.length > 0) {
        const sumDiff = observed.reduce((acc, m) => {
          const rec = dayMachinesMap.get(m.machineNum);
          return acc + (rec?.diff ?? 0);
        }, 0);
        const avgD = Math.round(sumDiff / observed.length);
        const lift = avgD - hallAvgDiff;
        variantDayLifts.push(lift);

        const wins = observed.filter((m) => (dayMachinesMap.get(m.machineNum)?.diff ?? 0) > 0).length;
        variantWinSum += (wins / observed.length) * 100;
        variantValidDayCount++;
      } else {
        variantDayLifts.push(0);
      }
    }

    const varAvgLift =
      variantDayLifts.length > 0
        ? Math.round(variantDayLifts.reduce((a, b) => a + b, 0) / variantDayLifts.length)
        : 0;
    const varWinRate =
      variantValidDayCount > 0
        ? Math.round((variantWinSum / variantValidDayCount) * 10) / 10
        : 0;

    const { ciLower, ciUpper } = computeBlockBootstrapCI(
      variantDayLifts,
      blockLength,
      bootstrapIterations,
      seed
    );

    const liftDelta = varAvgLift - baseAvgLift;
    // If removing this feature (or keeping only cohortDiff) results in >= same lift, recommend zero weight
    const recommendZeroWeight = liftDelta >= 0;

    return {
      variantKey: variant.key,
      variantName: variant.name,
      avgLift: varAvgLift,
      ci95: [ciLower, ciUpper],
      winRate: varWinRate,
      liftDelta,
      recommendZeroWeight,
    };
  });

  return {
    evaluatedDaysCount: evalIndices.length,
    topN,
    minEvidenceThreshold,
    withFilter: aggregateEvaluation(filteredDays),
    withoutFilter: baseEval,
    ablationResults,
  };
}

export interface MachineRollingValidationResult {
  numSplits: number;
  valEvaluatedDays: number;
  splitGains: number[];
  meanSplitGain: number;
  bootstrapCiLower: number;
  bootstrapCiUpper: number;
  isRecommended: boolean;
  verdictMessage: string;
}

/**
 * Prompt 14: Rolling validation (3-5 splits) with Moving Block Bootstrap (2,000 iterations)
 * for adjusting machine ranking weights. Evaluates across all splits to prevent choosing
 * weights based on a single split (overfitting prevention).
 */
export function runMachineRollingValidation(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  candidateWeights: Partial<MachineRankingWeights> = {},
  baseWeights: MachineRankingWeights = DEFAULT_MACHINE_RANKING_WEIGHTS,
  topN: number = 10
): MachineRollingValidationResult | null {
  const sortedRecords = [...dailyRecords]
    .filter((d) => d.machines && d.machines.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sortedRecords.length < 10) return null;

  const minWarmup = Math.min(5, Math.floor(sortedRecords.length * 0.25));
  const evaluableCount = sortedRecords.length - minWarmup;
  if (evaluableCount < 5) return null;

  const numSplits = Math.min(5, Math.max(3, Math.floor(evaluableCount / 5)));
  const splitGains: number[] = [];
  const allDiffLifts: number[] = [];

  for (let s = 0; s < numSplits; s++) {
    const valStartLocal = Math.floor((s * evaluableCount) / numSplits);
    const valEndLocal =
      s === numSplits - 1
        ? evaluableCount
        : Math.floor(((s + 1) * evaluableCount) / numSplits);

    const valStart = minWarmup + valStartLocal;
    const valEnd = minWarmup + valEndLocal;

    const splitDiffs: number[] = [];

    for (let i = valStart; i < valEnd; i++) {
      const evalDay = sortedRecords[i];
      const recordsBefore = sortedRecords.slice(0, i);
      const dayMachinesMap = new Map<number, DailyMachineRecord>();
      (evalDay.machines || []).forEach((m) => dayMachinesMap.set(m.machineNum, m));
      const hallAvgDiff = evalDay.avgDiffCoins ?? 0;

      // Candidate lift
      const candRanking = calculateTargetMachineRanking(
        evalDay.date,
        recordsBefore,
        specialDayRules,
        candidateWeights,
        { minEvidenceDays: 0 }
      );
      const candTop = candRanking.rankings.slice(0, topN);
      const candObs = candTop.filter((c) => dayMachinesMap.has(c.machineNum));
      let candLift = 0;
      if (candObs.length > 0) {
        const sumD = candObs.reduce((acc, m) => acc + (dayMachinesMap.get(m.machineNum)?.diff ?? 0), 0);
        candLift = Math.round(sumD / candObs.length) - hallAvgDiff;
      }

      // Base lift
      const baseRanking = calculateTargetMachineRanking(
        evalDay.date,
        recordsBefore,
        specialDayRules,
        baseWeights,
        { minEvidenceDays: 0 }
      );
      const baseTop = baseRanking.rankings.slice(0, topN);
      const baseObs = baseTop.filter((c) => dayMachinesMap.has(c.machineNum));
      let baseLift = 0;
      if (baseObs.length > 0) {
        const sumD = baseObs.reduce((acc, m) => acc + (dayMachinesMap.get(m.machineNum)?.diff ?? 0), 0);
        baseLift = Math.round(sumD / baseObs.length) - hallAvgDiff;
      }

      const diff = candLift - baseLift;
      splitDiffs.push(diff);
      allDiffLifts.push(diff);
    }

    const splitMean =
      splitDiffs.length > 0
        ? Math.round(splitDiffs.reduce((a, b) => a + b, 0) / splitDiffs.length)
        : 0;
    splitGains.push(splitMean);
  }

  const meanSplitGain =
    splitGains.length > 0
      ? Math.round(splitGains.reduce((a, b) => a + b, 0) / splitGains.length)
      : 0;

  const { ciLower, ciUpper } = computeBlockBootstrapCI(
    allDiffLifts,
    7,
    2000,
    42
  );

  const allSplitsNonNegative = splitGains.every((g) => g >= 0);
  const isRecommended = meanSplitGain > 0 && ciLower > 0 && allSplitsNonNegative;

  let verdictMessage = '';
  if (isRecommended) {
    verdictMessage = `【採用推奨】全${numSplits}分割の検証すべてでリフトが同等以上（全分割平均 +${meanSplitGain}枚）を達成し、95%信頼区間 [+${ciLower}枚, +${ciUpper}枚] で0を有意に上回っています。店舗の固有重みとして保存できます。`;
  } else {
    verdictMessage = `【標準維持推奨】全${numSplits}分割の検証において明確な有意差（全分割平均 ${
      meanSplitGain >= 0 ? `+${meanSplitGain}` : meanSplitGain
    }枚, 95%区間下限: ${ciLower}枚）が確認されませんでした。過剰適合（過学習）を防ぐため、既定の重みを維持することを推奨します。`;
  }

  return {
    numSplits,
    valEvaluatedDays: allDiffLifts.length,
    splitGains,
    meanSplitGain,
    bootstrapCiLower: ciLower,
    bootstrapCiUpper: ciUpper,
    isRecommended,
    verdictMessage,
  };
}
