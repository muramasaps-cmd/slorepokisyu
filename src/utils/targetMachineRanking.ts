// Engine for calculating target machine recommendations by machine number (台番号別狙い台ランキング)
import { DailyRecord, DailyMachineRecord, SpecialDayRules, RankingWeights } from '../data/types';
import {
  extractTargetCohorts,
  calculateTargetDateRanking,
  DEFAULT_RANKING_WEIGHTS,
} from './targetRankingEngine';
import { isAType, isJuggler } from './modelFilterUtils';

export const HIGH_SETTING_THRESHOLDS = {
  MIN_GAMES: 2000,
  MIN_PAYOUT_RATE: 108.0,
  MIN_DIFF_COINS: 1500,
  LARGE_WIN_DIFF_COINS: 2500,
  A_TYPE_MIN_RB_COUNT: 8,
  A_TYPE_MAX_RB_DENOMINATOR: 280, // games / rb <= 280
} as const;

export interface MachineRankingWeights {
  diffWeight: number; // pts per diff coin (default 0.04)
  winRateWeight: number; // pts per win rate % above 50% (default 0.3)
  highSettingWeight: number; // pts for high setting frequency (default 20.0)
  modelScoreWeight: number; // pts for underlying model forecast score (default 0.25)
  tailMatchBonus: number; // bonus for tail digit matching target date tail (default 8.0)
  zoroBonus: number; // bonus for zoro machine number (default 4.0)
  recentStateWeight: number; // weight for prior day diff (default 0)
  shrinkageK: number; // empirical Bayes shrinkage hyperparameter (default 3)
}

export const DEFAULT_MACHINE_RANKING_WEIGHTS: MachineRankingWeights = {
  diffWeight: 0.04,
  winRateWeight: 0.3,
  highSettingWeight: 20.0,
  modelScoreWeight: 0.25,
  tailMatchBonus: 8.0,
  zoroBonus: 4.0,
  recentStateWeight: 0,
  shrinkageK: 3,
};

export interface TargetMachineRankingOptions {
  recentStateWeight?: number; // overrides weights.recentStateWeight (default 0)
  minEvidenceDays?: number; // minimum total evidence days to include in rankings
  rankingWeights?: RankingWeights; // custom weights for underlying model score engine
}

export type MachineConfidenceLevel = '高' | '中' | '低';

export interface MachineRankingContributions {
  cohortDiffScore: number;
  cohortWinRateScore: number;
  highSettingScore: number;
  modelScore: number;
  tailBonusScore: number;
  recentStateScore: number;
}

export interface MachineHistoryEntry {
  date: string;
  dayOfWeek: string;
  diff: number;
  games: number;
  payoutRate?: number;
  bb?: number;
  rb?: number;
  isInCohort: boolean;
  isHighSetting: boolean;
}

export interface TargetMachineScore {
  machineNum: number;
  modelName: string;
  rank: number;
  totalScore: number;
  confidence: MachineConfidenceLevel;
  evidenceDays: number;
  cohortEvidenceDays: number;
  contributions: MachineRankingContributions;
  stats: {
    cohortAvgDiff: number;
    shrunkDiff: number;
    cohortWinRate: number;
    shrunkWinRate: number;
    modelCohortAvgDiff: number;
    modelCohortWinRate: number;
    highSettingRate: number;
    highSettingCount: number;
    modelScore: number;
    isTailMatch: boolean;
    isZoro: boolean;
    priorDayDiff: number | null;
    priorDayDate: string | null;
  };
  history: MachineHistoryEntry[];
}

export interface TargetMachineRankingResult {
  targetDate: string;
  dayOfWeek: string;
  isSpecialDay: boolean;
  dayTail: number;
  primaryCohortCount: number;
  rankings: TargetMachineScore[];
}

/**
 * Checks if a specific daily machine record exhibits high-setting behavior.
 */
export function isHighSettingBehavior(
  record: DailyMachineRecord,
  modelName: string
): boolean {
  const games = record.games || 0;
  const diff = record.diff || 0;
  const payout =
    record.payoutRate !== undefined
      ? record.payoutRate
      : games > 0
      ? ((games * 3 + diff) / (games * 3)) * 100
      : 100;

  // 1. Unconditional high-volume winner
  if (diff >= HIGH_SETTING_THRESHOLDS.LARGE_WIN_DIFF_COINS) {
    return true;
  }

  // 2. Play game volume met
  if (games >= HIGH_SETTING_THRESHOLDS.MIN_GAMES) {
    if (
      payout >= HIGH_SETTING_THRESHOLDS.MIN_PAYOUT_RATE ||
      diff >= HIGH_SETTING_THRESHOLDS.MIN_DIFF_COINS
    ) {
      return true;
    }

    // A-type / Juggler specific RB bonus probability
    if (isAType(modelName) || isJuggler(modelName)) {
      if (
        record.rb !== undefined &&
        record.rb >= HIGH_SETTING_THRESHOLDS.A_TYPE_MIN_RB_COUNT &&
        games / record.rb <= HIGH_SETTING_THRESHOLDS.A_TYPE_MAX_RB_DENOMINATOR
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a machine number is a Zoro (repeated identical digits, e.g. 11, 77, 333, 777).
 */
export function isMachineZoro(machineNum: number, recordZoro?: boolean): boolean {
  if (recordZoro !== undefined) return Boolean(recordZoro);
  if (machineNum < 11) return false;
  const s = String(machineNum);
  const first = s[0];
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== first) return false;
  }
  return true;
}

/**
 * Gets machine tail digit (0..9).
 */
export function getMachineTailDigit(machineNum: number, recordTail?: number): number {
  if (recordTail !== undefined && recordTail !== null) return recordTail;
  return Math.abs(machineNum) % 10;
}

/**
 * Extracts per-machine history with model replacement cut-off:
 * If a machine number has changed models in the past, only records from the date
 * of the latest model change onwards are kept as that machine's history.
 */
export function extractMachineHistoryByModelChange(
  pastRecords: DailyRecord[]
): Map<number, {
  machineNum: number;
  currentModel: string;
  history: Array<{ rec: DailyRecord; machine: DailyMachineRecord }>;
}> {
  const machineEntries = new Map<
    number,
    Array<{ rec: DailyRecord; machine: DailyMachineRecord }>
  >();

  for (let rIdx = 0; rIdx < pastRecords.length; rIdx++) {
    const rec = pastRecords[rIdx];
    if (!rec.machines || rec.machines.length === 0) continue;

    for (let mIdx = 0; mIdx < rec.machines.length; mIdx++) {
      const mach = rec.machines[mIdx];
      const num = mach.machineNum;
      if (num === undefined || num === null || isNaN(num)) continue;

      let list = machineEntries.get(num);
      if (!list) {
        list = [];
        machineEntries.set(num, list);
      }
      list.push({ rec, machine: mach });
    }
  }

  const result = new Map<
    number,
    {
      machineNum: number;
      currentModel: string;
      history: Array<{ rec: DailyRecord; machine: DailyMachineRecord }>;
    }
  >();

  machineEntries.forEach((instances, machNum) => {
    if (instances.length === 0) return;

    // Instances are sorted by date ascending
    const latestInstance = instances[instances.length - 1];
    const currentModel = (latestInstance.machine.modelName || '').trim();

    // Scan backwards from the latest instance: find the start of the contiguous latest model
    let startIdx = instances.length - 1;
    while (
      startIdx > 0 &&
      (instances[startIdx - 1].machine.modelName || '').trim() === currentModel
    ) {
      startIdx--;
    }

    const validHistory = instances.slice(startIdx);
    result.set(machNum, {
      machineNum: machNum,
      currentModel,
      history: validHistory,
    });
  });

  return result;
}

/**
 * Main engine function calculating target machine rankings for a target date.
 */
export function calculateTargetMachineRanking(
  targetDate: string,
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  weights?: Partial<MachineRankingWeights>,
  options?: TargetMachineRankingOptions
): TargetMachineRankingResult {
  const mergedWeights: MachineRankingWeights = {
    ...DEFAULT_MACHINE_RANKING_WEIGHTS,
    ...weights,
  };

  const activeRecentStateWeight =
    options?.recentStateWeight !== undefined
      ? options.recentStateWeight
      : mergedWeights.recentStateWeight;

  // 1. Strictly use historical records strictly before targetDate (NO FUTURE DATA)
  const pastRecords = (dailyRecords || []).filter((r) => r.date < targetDate);
  pastRecords.sort((a, b) => a.date.localeCompare(b.date));

  // Determine target date metadata
  const cohortResult = extractTargetCohorts(targetDate, pastRecords, specialDayRules);
  const dow = cohortResult?.dow || '月';
  const isSpecial = cohortResult?.isSpecial || false;
  const dayTail = cohortResult?.dayTail || 0;
  const primaryCohort = cohortResult?.primaryCohort || [];

  if (pastRecords.length === 0 || primaryCohort.length === 0) {
    return {
      targetDate,
      dayOfWeek: dow,
      isSpecialDay: isSpecial,
      dayTail,
      primaryCohortCount: 0,
      rankings: [],
    };
  }

  const primaryCohortDateSet = new Set(primaryCohort.map((r) => r.date));

  // 2. Extract machine histories respecting model replacement cutoffs
  const machineDataMap = extractMachineHistoryByModelChange(pastRecords);

  // 3. Obtain model scores from existing target ranking engine
  const rankingWeights = options?.rankingWeights || DEFAULT_RANKING_WEIGHTS;
  const modelForecast = calculateTargetDateRanking(
    targetDate,
    pastRecords,
    specialDayRules,
    '',
    rankingWeights
  );

  const modelScoreMap = new Map<string, number>();
  if (modelForecast?.modelRankings) {
    for (let i = 0; i < modelForecast.modelRankings.length; i++) {
      const mr = modelForecast.modelRankings[i];
      modelScoreMap.set(mr.modelName.trim(), mr.compositeScore);
    }
  }

  // 4. Compute model-level cohort baselines (population mean for shrinkage estimation)
  interface ModelCohortBaseline {
    avgDiff: number;
    winRate: number;
    count: number;
  }
  const modelCohortMap = new Map<string, { totalDiff: number; winCount: number; count: number }>();
  const modelOverallMap = new Map<string, { totalDiff: number; winCount: number; count: number }>();

  pastRecords.forEach((rec) => {
    if (!rec.machines) return;
    const isInPrimary = primaryCohortDateSet.has(rec.date);

    for (let i = 0; i < rec.machines.length; i++) {
      const mach = rec.machines[i];
      const model = (mach.modelName || '').trim();
      if (!model) continue;

      let overall = modelOverallMap.get(model);
      if (!overall) {
        overall = { totalDiff: 0, winCount: 0, count: 0 };
        modelOverallMap.set(model, overall);
      }
      overall.totalDiff += mach.diff || 0;
      if ((mach.diff || 0) > 0) overall.winCount++;
      overall.count++;

      if (isInPrimary) {
        let cohort = modelCohortMap.get(model);
        if (!cohort) {
          cohort = { totalDiff: 0, winCount: 0, count: 0 };
          modelCohortMap.set(model, cohort);
        }
        cohort.totalDiff += mach.diff || 0;
        if ((mach.diff || 0) > 0) cohort.winCount++;
        cohort.count++;
      }
    }
  });

  const getModelCohortBaseline = (modelName: string): ModelCohortBaseline => {
    const c = modelCohortMap.get(modelName);
    if (c && c.count > 0) {
      return {
        avgDiff: c.totalDiff / c.count,
        winRate: (c.winCount / c.count) * 100,
        count: c.count,
      };
    }
    const o = modelOverallMap.get(modelName);
    if (o && o.count > 0) {
      return {
        avgDiff: o.totalDiff / o.count,
        winRate: (o.winCount / o.count) * 100,
        count: o.count,
      };
    }
    return { avgDiff: 0, winRate: 50, count: 0 };
  };

  // 5. Evaluate each active machine
  const scoredMachines: TargetMachineScore[] = [];
  const minEvidenceDays = options?.minEvidenceDays ?? 1;

  machineDataMap.forEach(({ machineNum, currentModel, history }) => {
    if (!currentModel || history.length === 0) return;
    if (history.length < minEvidenceDays) return;

    // Segment machine history into cohort and non-cohort days
    const cohortInstances: DailyMachineRecord[] = [];
    const fullHistoryEntries: MachineHistoryEntry[] = [];
    let highSettingCount = 0;

    for (let i = 0; i < history.length; i++) {
      const { rec, machine } = history[i];
      const isInCohort = primaryCohortDateSet.has(rec.date);
      const isHigh = isHighSettingBehavior(machine, currentModel);

      if (isHigh) {
        highSettingCount++;
      }

      if (isInCohort) {
        cohortInstances.push(machine);
      }

      fullHistoryEntries.push({
        date: rec.date,
        dayOfWeek: rec.dayOfWeek,
        diff: machine.diff,
        games: machine.games,
        payoutRate: machine.payoutRate,
        bb: machine.bb,
        rb: machine.rb,
        isInCohort,
        isHighSetting: isHigh,
      });
    }

    const evidenceDays = history.length;
    const cohortEvidenceDays = cohortInstances.length;

    // Empirical Bayes Shrinkage for cohort diff and win rate
    const modelBaseline = getModelCohortBaseline(currentModel);
    const k = mergedWeights.shrinkageK || 3;
    const shrinkageB = cohortEvidenceDays / (cohortEvidenceDays + k);

    let rawCohortAvgDiff = 0;
    let rawCohortWinRate = 50.0;

    if (cohortEvidenceDays > 0) {
      const totalDiff = cohortInstances.reduce((acc, m) => acc + (m.diff || 0), 0);
      const winCount = cohortInstances.filter((m) => (m.diff || 0) > 0).length;
      rawCohortAvgDiff = totalDiff / cohortEvidenceDays;
      rawCohortWinRate = (winCount / cohortEvidenceDays) * 100;
    } else {
      rawCohortAvgDiff = modelBaseline.avgDiff;
      rawCohortWinRate = modelBaseline.winRate;
    }

    const shrunkDiff =
      shrinkageB * rawCohortAvgDiff + (1 - shrinkageB) * modelBaseline.avgDiff;
    const shrunkWinRate =
      shrinkageB * rawCohortWinRate + (1 - shrinkageB) * modelBaseline.winRate;

    // High setting behavior rate across historical evidence
    const highSettingRate = evidenceDays > 0 ? highSettingCount / evidenceDays : 0;

    // Underlying model score from target ranking engine
    const rawModelScore = modelScoreMap.get(currentModel) || 0;

    // Tail match and Zoro bonuses
    const machTail = getMachineTailDigit(
      machineNum,
      history[history.length - 1].machine.tailDigit
    );
    const isTailMatch = machTail === dayTail;
    const isZoro = isMachineZoro(
      machineNum,
      history[history.length - 1].machine.isZoro
    );

    const tailBonus =
      (isTailMatch ? mergedWeights.tailMatchBonus : 0) +
      (isZoro ? mergedWeights.zoroBonus : 0);

    // Recent state: prior day diff
    const lastRec = history[history.length - 1];
    const priorDayDiff = lastRec ? lastRec.machine.diff : null;
    const priorDayDate = lastRec ? lastRec.rec.date : null;

    // Additive contribution breakdown (explicitly explainable)
    const cohortDiffScore =
      (Math.round(shrunkDiff * mergedWeights.diffWeight * 100) / 100) || 0;
    const cohortWinRateScore =
      (Math.round((shrunkWinRate - 50) * mergedWeights.winRateWeight * 100) / 100) || 0;
    const highSettingScore =
      (Math.round(highSettingRate * mergedWeights.highSettingWeight * 100) / 100) || 0;
    const modelScore =
      (Math.round(rawModelScore * mergedWeights.modelScoreWeight * 100) / 100) || 0;
    const tailBonusScore = (Math.round(tailBonus * 100) / 100) || 0;
    const recentStateScore =
      (activeRecentStateWeight !== 0 && priorDayDiff !== null
        ? Math.round(priorDayDiff * activeRecentStateWeight * 100) / 100
        : 0) || 0;

    // Total score is strictly the sum of contributions
    const totalScore =
      (Math.round(
        (cohortDiffScore +
          cohortWinRateScore +
          highSettingScore +
          modelScore +
          tailBonusScore +
          recentStateScore) *
          100
      ) / 100) || 0;

    // Confidence estimation based on evidence days and variance
    const diffs = history.map((h) => h.machine.diff || 0);
    const mean = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
    const variance =
      diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      Math.max(1, diffs.length - 1);
    const stdDev = Math.sqrt(variance);
    const standardError = stdDev / Math.sqrt(Math.max(1, diffs.length));

    let confidence: MachineConfidenceLevel = '低';
    if (cohortEvidenceDays >= 5 && standardError <= 650) {
      confidence = '高';
    } else if (
      cohortEvidenceDays >= 3 ||
      (evidenceDays >= 6 && standardError <= 950)
    ) {
      confidence = '中';
    }

    scoredMachines.push({
      machineNum,
      modelName: currentModel,
      rank: 0,
      totalScore,
      confidence,
      evidenceDays,
      cohortEvidenceDays,
      contributions: {
        cohortDiffScore,
        cohortWinRateScore,
        highSettingScore,
        modelScore,
        tailBonusScore,
        recentStateScore,
      },
      stats: {
        cohortAvgDiff: Math.round(rawCohortAvgDiff * 10) / 10,
        shrunkDiff: Math.round(shrunkDiff * 10) / 10,
        cohortWinRate: Math.round(rawCohortWinRate * 10) / 10,
        shrunkWinRate: Math.round(shrunkWinRate * 10) / 10,
        modelCohortAvgDiff: Math.round(modelBaseline.avgDiff * 10) / 10,
        modelCohortWinRate: Math.round(modelBaseline.winRate * 10) / 10,
        highSettingRate: Math.round(highSettingRate * 1000) / 10,
        highSettingCount,
        modelScore: Math.round(rawModelScore * 10) / 10,
        isTailMatch,
        isZoro,
        priorDayDiff,
        priorDayDate,
      },
      history: fullHistoryEntries,
    });
  });

  // Sort machines: descending by totalScore, then evidenceDays, then machineNum
  scoredMachines.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.evidenceDays !== a.evidenceDays) {
      return b.evidenceDays - a.evidenceDays;
    }
    return a.machineNum - b.machineNum;
  });

  // Assign ranks
  scoredMachines.forEach((mach, idx) => {
    mach.rank = idx + 1;
  });

  return {
    targetDate,
    dayOfWeek: dow,
    isSpecialDay: isSpecial,
    dayTail,
    primaryCohortCount: primaryCohort.length,
    rankings: scoredMachines,
  };
}
