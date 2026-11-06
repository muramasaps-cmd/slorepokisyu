import { MachineRankingContributions } from '../data/types';

/**
 * Standard error function erf(x) approximation (Abramowitz & Stegun 7.1.26).
 * Max error < 1.5e-7.
 */
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return sign * y;
}

/**
 * Standard normal cumulative distribution function Phi(z).
 * Returns P(Z <= z) where Z ~ N(0, 1).
 */
export function standardNormalCdf(z: number): number {
  if (isNaN(z)) return 0.5;
  if (z > 8) return 1;
  if (z < -8) return 0;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Computes lift of a machine relative to the day's mean expected diff.
 * (台の期待差枚 − その日の評価対象台の期待差枚の平均)
 */
export function computeLift(
  machineExpectedDiff: number,
  targetDayMeanExpectedDiff: number
): number {
  return machineExpectedDiff - targetDayMeanExpectedDiff;
}

export interface WinProbabilityResult {
  machineWinProb: number;
  hallWinProb: number;
}

/**
 * Estimates win probability (probability of payout diff > 0) using standard normal CDF
 * where daily diff standard deviation is sqrt(sigma2) from shrinkage diagnostics.
 * (台の期待差枚 ÷ 1日の差枚の標準偏差（shrinkageDiagnostics の sigma2 の平方根）から、
 *  標準正規分布の累積で計算。全台平均の勝つ確率も返す)
 *
 * P(Diff > 0) = Phi(expectedDiff / sigma)
 */
export function estimateWinProbability(
  machineExpectedDiff: number,
  sigma2: number,
  allMachinesMeanExpectedDiff: number = 0
): WinProbabilityResult {
  // If sigma2 is <= 0 or invalid, use a realistic slot standard deviation fallback (sigma = 800)
  const safeSigma = sigma2 && sigma2 > 0 ? Math.sqrt(sigma2) : 800;

  const machineZ = machineExpectedDiff / safeSigma;
  const hallZ = allMachinesMeanExpectedDiff / safeSigma;

  const machineWinProb = standardNormalCdf(machineZ);
  const hallWinProb = standardNormalCdf(hallZ);

  return {
    machineWinProb,
    hallWinProb,
  };
}

/**
 * Rounds coin values to 50-coin units (50枚単位).
 * E.g., 234 -> 250, 221 -> 200, 25 -> 50, 24 -> 0, -78 -> -100.
 */
export function roundForDisplay(coins: number): number {
  if (!Number.isFinite(coins)) return 0;
  const rounded = Math.round(coins / 50) * 50;
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
}

export type TagColor = 'blue' | 'purple' | 'green' | 'orange' | 'amber';

export interface ReasonTag {
  id: string;
  label: string;
  color: TagColor;
  score: number;
}

export interface BuildReasonTagsOptions {
  contributions?: MachineRankingContributions | null;
  evidenceDays?: number;
  isTailMatch?: boolean;
  isZoro?: boolean;
  rawReasons?: string[];
  modelName?: string;
}

/**
 * Builds up to 3 colored reason tags from score contributions and evidence days.
 * Categories:
 * - 同条件の実績 = 青 (blue)
 * - 末尾・ゾロ目 = 紫 (purple)
 * - 直近 = 緑 (green)
 * - 機種 = 橙 (orange)
 * - 高設定 = 琥珀 (amber)
 */
export function buildReasonTags(
  contributionsOrOptions?: MachineRankingContributions | BuildReasonTagsOptions | null,
  evidenceDaysArg?: number,
  isTailMatchArg?: boolean,
  isZoroArg?: boolean,
  rawReasonsArg?: string[]
): ReasonTag[] {
  let contributions: MachineRankingContributions | undefined;
  let evidenceDays = evidenceDaysArg ?? 0;
  let isTailMatch = isTailMatchArg ?? false;
  let isZoro = isZoroArg ?? false;
  let rawReasons = rawReasonsArg;

  if (contributionsOrOptions && typeof contributionsOrOptions === 'object') {
    if ('cohortDiffScore' in contributionsOrOptions) {
      contributions = contributionsOrOptions as MachineRankingContributions;
    } else {
      const opts = contributionsOrOptions as BuildReasonTagsOptions;
      contributions = opts.contributions ?? undefined;
      evidenceDays = opts.evidenceDays ?? evidenceDays;
      isTailMatch = opts.isTailMatch ?? isTailMatch;
      isZoro = opts.isZoro ?? isZoro;
      rawReasons = opts.rawReasons ?? rawReasons;
    }
  }

  const tags: ReasonTag[] = [];

  if (contributions) {
    // 1. 同条件の実績 (Blue)
    const cohortScore = (contributions.cohortDiffScore || 0) + (contributions.cohortWinRateScore || 0);
    if (cohortScore !== 0 || evidenceDays > 0) {
      const label = evidenceDays > 0 ? `同条件の実績 (${evidenceDays}日)` : '同条件の実績';
      tags.push({
        id: 'cohort',
        label,
        color: 'blue',
        score: Math.abs(cohortScore) + (evidenceDays > 0 ? 50 : 0),
      });
    }

    // 2. 末尾・ゾロ目 (Purple)
    const tailScore = contributions.tailBonusScore || 0;
    if (tailScore > 0 || isTailMatch || isZoro) {
      let label = '末尾・ゾロ目';
      if (isZoro && !isTailMatch) label = 'ゾロ目台番';
      else if (isTailMatch && !isZoro) label = '特定末尾一致';
      tags.push({
        id: 'tail',
        label,
        color: 'purple',
        score: tailScore > 0 ? tailScore : 60,
      });
    }

    // 3. 直近 (Green)
    const recentScore = contributions.recentStateScore || 0;
    if (recentScore !== 0) {
      const label = recentScore > 0 ? '直近好調' : '直近傾向';
      tags.push({
        id: 'recent',
        label,
        color: 'green',
        score: Math.abs(recentScore),
      });
    }

    // 4. 機種 (Orange)
    const modelScore = contributions.modelScore || 0;
    if (modelScore > 0) {
      tags.push({
        id: 'model',
        label: '機種実績',
        color: 'orange',
        score: modelScore,
      });
    }

    // 5. 高設定挙動 (Amber)
    const highSettingScore = contributions.highSettingScore || 0;
    if (highSettingScore > 0) {
      tags.push({
        id: 'highSetting',
        label: '高設定挙動',
        color: 'amber',
        score: highSettingScore,
      });
    }
  } else if (rawReasons && rawReasons.length > 0) {
    // Fallback: derive tags from text reasons
    for (const r of rawReasons) {
      if (r.includes('同コホート') || r.includes('同曜日') || r.includes('同条件')) {
        tags.push({
          id: 'cohort',
          label: evidenceDays > 0 ? `同条件の実績 (${evidenceDays}日)` : '同条件の実績',
          color: 'blue',
          score: 100,
        });
      } else if (r.includes('末尾') || r.includes('ゾロ目')) {
        tags.push({
          id: 'tail',
          label: r.includes('ゾロ目') ? 'ゾロ目台番' : '特定末尾一致',
          color: 'purple',
          score: 80,
        });
      } else if (r.includes('直近') || r.includes('前日')) {
        tags.push({
          id: 'recent',
          label: '直近好調',
          color: 'green',
          score: 60,
        });
      } else if (r.includes('機種') || r.includes('所属機種')) {
        tags.push({
          id: 'model',
          label: '機種実績',
          color: 'orange',
          score: 50,
        });
      } else if (r.includes('高設定')) {
        tags.push({
          id: 'highSetting',
          label: '高設定挙動',
          color: 'amber',
          score: 70,
        });
      }
    }
  }

  // Fallback if no tags generated
  if (tags.length === 0) {
    tags.push({
      id: 'default',
      label: evidenceDays > 0 ? `過去実績 (${evidenceDays}日)` : '過去実績分析',
      color: 'blue',
      score: 1,
    });
  }

  // De-duplicate by ID, sort by score descending, return top 3
  const uniqueTagsMap = new Map<string, ReasonTag>();
  for (const t of tags) {
    if (!uniqueTagsMap.has(t.id) || uniqueTagsMap.get(t.id)!.score < t.score) {
      uniqueTagsMap.set(t.id, t);
    }
  }

  return Array.from(uniqueTagsMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export interface CandidateForSkipCheck {
  confidence?: string; // '高' | '中' | '低'
  expectedDiff?: number;
  expectedDiffCoins?: number;
  shrunkDiff?: number;
  interval80?: [number, number];
  uncertainty80?: { min: number; max: number };
  stats?: {
    expectedDiff80Range?: [number, number];
    expectedDiffMargin80?: number;
    standardError?: number;
    expectedDiffStd?: number;
    shrunkDiff?: number;
  };
  modelName?: string;
  [key: string]: any;
}

export interface DecideSkipParams {
  hasEdge?: boolean | '優位性あり' | '優位性なし' | '未検証' | null;
  topCandidates: CandidateForSkipCheck[];
  dayMeanExpectedDiff?: number;
}

/**
 * Returns the 80% range lower bound of a candidate.
 */
export function getCandidateLowerBound(c: CandidateForSkipCheck): number {
  if (c.interval80 && Array.isArray(c.interval80) && c.interval80.length >= 2) {
    return c.interval80[0];
  }
  if (c.uncertainty80 && typeof c.uncertainty80.min === 'number') {
    return c.uncertainty80.min;
  }
  if (c.stats?.expectedDiff80Range && Array.isArray(c.stats.expectedDiff80Range)) {
    return c.stats.expectedDiff80Range[0];
  }

  const exp = c.expectedDiff ?? c.expectedDiffCoins ?? c.shrunkDiff ?? c.stats?.expectedDiffStd ?? c.stats?.shrunkDiff ?? 0;
  if (c.stats?.expectedDiffMargin80) {
    return exp - c.stats.expectedDiffMargin80;
  }
  if (c.stats?.standardError) {
    return exp - 1.28 * c.stats.standardError;
  }
  return exp - 300;
}

/**
 * Determines whether to skip playing specific machine numbers (見送り判定).
 * Returns true if ANY of the following 3 conditions are met:
 * 1. Store validation is explicitly "優位性なし" (hasEdge === false or '優位性なし')
 * 2. Top candidates' confidence are all '低' (or top candidates is empty)
 * 3. Lower bound of the 80% range for difference from the day's average is <= 0 for ALL top candidates
 *
 * (見送り判定: 店の検証が「優位性なし」、または上位候補の信頼性がすべて低い、
 *  または、平均との差の80%範囲の下限がすべて0以下のとき true)
 */
export function decideSkip(
  paramsOrHasEdge: DecideSkipParams | boolean | '優位性あり' | '優位性なし' | '未検証' | null | undefined,
  topCandidatesArg?: CandidateForSkipCheck[],
  dayMeanExpectedDiffArg?: number
): boolean {
  let hasEdge: boolean | '優位性あり' | '優位性なし' | '未検証' | null | undefined;
  let topCandidates: CandidateForSkipCheck[] = [];
  let dayMean = 0;

  if (paramsOrHasEdge && typeof paramsOrHasEdge === 'object' && 'topCandidates' in paramsOrHasEdge) {
    hasEdge = paramsOrHasEdge.hasEdge;
    topCandidates = paramsOrHasEdge.topCandidates || [];
    dayMean = paramsOrHasEdge.dayMeanExpectedDiff ?? 0;
  } else {
    hasEdge = paramsOrHasEdge as any;
    topCandidates = topCandidatesArg || [];
    dayMean = dayMeanExpectedDiffArg ?? 0;
  }

  // Condition 1: 店の検証が「優位性なし」
  if (hasEdge === false || hasEdge === '優位性なし') {
    return true;
  }

  // If there are no candidates, skip is true
  if (topCandidates.length === 0) {
    return true;
  }

  // We evaluate the top candidates (up to top 3)
  const evalCandidates = topCandidates.slice(0, 3);

  // Condition 2: 上位候補の信頼性がすべて低い
  const allLowConfidence = evalCandidates.every((c) => c.confidence === '低');
  if (allLowConfidence) {
    return true;
  }

  // Condition 3: 平均との差の80%範囲の下限がすべて0以下
  // liftLower = candidateLower - dayMean
  const allLowerBoundLeqZero = evalCandidates.every((c) => {
    const lower = getCandidateLowerBound(c);
    const liftLower = lower - dayMean;
    return liftLower <= 0;
  });

  if (allLowerBoundLeqZero) {
    return true;
  }

  return false;
}

/**
 * Returns formatted skip advice message.
 * 「今日は台番を絞る根拠が弱いです。機種◯◯の空いている台を打つのが無難です」
 */
export function getSkipAdviceMessage(recommendedModel?: string): string {
  const model = recommendedModel && recommendedModel.trim() ? recommendedModel.trim() : '◯◯';
  return `今日は台番を絞る根拠が弱いです。機種${model}の空いている台を打つのが無難です`;
}

export interface TargetAlternativeItem {
  machineNum: number;
  modelName: string;
  expectedDiff: number;
  rank?: number;
  confidence?: string;
  islandName?: string;
  storeName?: string;
}

export interface FindAlternativesOptions {
  sameModelLimit?: number; // default: 3
  sameIslandLimit?: number; // default: 1
  excludeMachineNums?: Set<number>;
}

/**
 * Finds alternative candidates for a machine:
 * 1. Same model次点（最大3台）
 * 2. Same island上位（島設定がある場合）
 * (Prompt 61 Requirement 1)
 */
export function findAlternativesForCandidate<
  T extends {
    machineNum: number;
    modelName: string;
    expectedDiff?: number;
    rank?: number;
    confidence?: string;
    islandName?: string;
    storeName?: string;
  }
>(
  candidate: T,
  pool: T[],
  options?: FindAlternativesOptions
): {
  sameModel: TargetAlternativeItem[];
  sameIsland: TargetAlternativeItem[];
} {
  const sameModelLimit = options?.sameModelLimit ?? 3;
  const sameIslandLimit = options?.sameIslandLimit ?? 1;
  const excluded = options?.excludeMachineNums || new Set<number>();

  // Exclude candidate itself
  const candidateExcluded = new Set(excluded);
  candidateExcluded.add(candidate.machineNum);

  // 1. Same model runners-up (最大3台, 順に並べる)
  const sameModel: TargetAlternativeItem[] = pool
    .filter(
      (m) =>
        m.machineNum !== candidate.machineNum &&
        m.modelName === candidate.modelName &&
        !candidateExcluded.has(m.machineNum)
    )
    .slice(0, sameModelLimit)
    .map((m) => ({
      machineNum: m.machineNum,
      modelName: m.modelName,
      expectedDiff: m.expectedDiff ?? 0,
      rank: m.rank,
      confidence: m.confidence,
      islandName: m.islandName,
      storeName: m.storeName,
    }));

  // 2. Same island top (同じ島の上位)
  let sameIsland: TargetAlternativeItem[] = [];
  if (candidate.islandName) {
    sameIsland = pool
      .filter(
        (m) =>
          m.machineNum !== candidate.machineNum &&
          m.islandName === candidate.islandName &&
          !candidateExcluded.has(m.machineNum)
      )
      .slice(0, sameIslandLimit)
      .map((m) => ({
        machineNum: m.machineNum,
        modelName: m.modelName,
        expectedDiff: m.expectedDiff ?? 0,
        rank: m.rank,
        confidence: m.confidence,
        islandName: m.islandName,
        storeName: m.storeName,
      }));
  }

  return { sameModel, sameIsland };
}

export interface RollupDecisionOptions {
  includeLowConfidence?: boolean;
  topN?: number;
  checkedState?: Record<number, string>; // e.g. { 101: 'unavailable' }
}

/**
 * Rolls up decision candidates by filtering unavailable machines and
 * dynamically computing 第1〜第3候補 and their alternatives (Prompt 61 Requirement 2 & 3).
 */
export function rollupDecisionCandidates<
  T extends {
    machineNum: number;
    modelName: string;
    confidence?: string;
    rank?: number;
    expectedDiff?: number;
    islandName?: string;
    storeName?: string;
  }
>(
  candidates: T[],
  options?: RollupDecisionOptions
): {
  activeCandidates: Array<
    T & {
      originalRank: number;
      alternatives: {
        sameModel: TargetAlternativeItem[];
        sameIsland: TargetAlternativeItem[];
      };
    }
  >;
  unavailableCount: number;
  hasRelaxableCandidates: boolean;
  allFilled: boolean;
} {
  const checkedState = options?.checkedState || {};
  const includeLowConfidence = options?.includeLowConfidence ?? false;
  const topN = options?.topN ?? 3;

  const availablePool: Array<T & { originalRank: number }> = [];
  let unavailableCount = 0;

  candidates.forEach((cand, idx) => {
    const isUnavailable =
      checkedState[cand.machineNum] === 'unavailable' ||
      checkedState[cand.machineNum] === 'played';

    if (isUnavailable) {
      unavailableCount++;
      return;
    }

    const originalRank = cand.rank ?? idx + 1;
    availablePool.push({ ...cand, originalRank });
  });

  const hasNonLow = availablePool.some((c) => c.confidence !== '低');
  const lowCount = availablePool.filter((c) => c.confidence === '低').length;

  let filtered: Array<T & { originalRank: number }>;
  if (unavailableCount > 0 && !includeLowConfidence && hasNonLow) {
    filtered = availablePool.filter((c) => c.confidence !== '低');
  } else if (unavailableCount > 0 && !includeLowConfidence && !hasNonLow && lowCount > 0) {
    filtered = [];
  } else {
    filtered = availablePool;
  }

  const topSlice = filtered.slice(0, topN);
  const activeMachineNums = new Set(topSlice.map((m) => m.machineNum));

  const activeCandidates = topSlice.map((cand, idx) => {
    const excluded = new Set(activeMachineNums);
    const alternatives = findAlternativesForCandidate(cand, availablePool, {
      excludeMachineNums: excluded,
      sameModelLimit: 3,
      sameIslandLimit: 1,
    });

    return {
      ...cand,
      rank: idx + 1,
      alternatives,
    };
  });

  const allFilled = activeCandidates.length === 0;
  const hasRelaxableCandidates = !includeLowConfidence && lowCount > 0;

  return {
    activeCandidates,
    unavailableCount,
    hasRelaxableCandidates,
    allFilled,
  };
}
