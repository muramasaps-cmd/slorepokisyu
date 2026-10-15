// Engine for calculating target machine recommendations by machine number (台番号別狙い台ランキング)
import { DailyRecord, DailyMachineRecord, SpecialDayRules, RankingWeights, MachineRankingWeights } from '../data/types';
import {
  extractTargetCohorts,
  calculateTargetDateRanking,
  calculateTargetDateRankingFromIndex,
  buildFeatureIndex,
  FeatureIndex,
  DEFAULT_RANKING_WEIGHTS,
} from './targetRankingEngine';
import { isAType, isJuggler } from './modelFilterUtils';
import { normalizeModelName } from './modelName';
import { calculateDayOfWeek, isDateSpecialDay } from './dataEngine';
import { isJapaneseHoliday } from './holidayUtils';
import { HIGH_SETTING_THRESHOLDS } from './highSettingConfig';
export { HIGH_SETTING_THRESHOLDS } from './highSettingConfig';
export type { MachineRankingWeights } from '../data/types';

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

export interface MachineFeatureIndex {
  dailyRecords: DailyRecord[];
  sortedPastRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  aliasDictionary?: Record<string, string>;
  includeReusedMachines?: boolean;
  featureIndex: FeatureIndex;
}

export interface TargetMachineRankingOptions {
  recentStateWeight?: number; // overrides weights.recentStateWeight (default 0)
  minEvidenceDays?: number; // minimum total evidence days to include in rankings
  rankingWeights?: RankingWeights; // custom weights for underlying model score engine
  /** 直近N日以内に出現した台も対象にする（既定値: undefined = 基準日当日に存在した台のみ） */
  activeWithinDays?: number;
  /** 台数補完日（isReusedMachines）を含めるか（既定値: false = 機種別・台番別データがある日のみ） */
  includeReusedMachines?: boolean;
  /** 機種名の別名辞書 */
  aliasDictionary?: Record<string, string>;
  /** 事前に構築された特徴量インデックス（重複計算の排除用） */
  featureIndex?: FeatureIndex;
  /** 事前に構築された台番特徴量インデックス */
  machineIndex?: MachineFeatureIndex;
  /** 履歴詳細オブジェクトの生成をスキップ（バックテスト等の高速化用） */
  skipHistory?: boolean;
  /** 増分累積器（バックテスト等の高速化用） */
  accumulator?: MachineHistoryAccumulator;
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
    standardError?: number;
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
  /** 除外された非現役台（撤去台等）の件数 */
  excludedInactiveCount?: number;
  /** 現役判定に用いた直近基準営業日 (YYYY-MM-DD) */
  referenceDate?: string | null;
  /** 日付不正等のエラー理由 */
  errorReason?: string;
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
      ? ((games * HIGH_SETTING_THRESHOLDS.BET_PER_GAME + diff) /
          (games * HIGH_SETTING_THRESHOLDS.BET_PER_GAME)) *
        100
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
  pastRecords: DailyRecord[],
  aliasDictionary?: Record<string, string>
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
    const currentModel = normalizeModelName(latestInstance.machine.modelName || '', aliasDictionary);

    // Scan backwards from the latest instance: find the start of the contiguous latest model
    let startIdx = instances.length - 1;
    while (
      startIdx > 0 &&
      normalizeModelName(instances[startIdx - 1].machine.modelName || '', aliasDictionary) === currentModel
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
 * Precomputes weight-independent machine feature index.
 */
export function buildMachineFeatureIndex(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  options?: TargetMachineRankingOptions
): MachineFeatureIndex {
  const aliasDictionary = options?.aliasDictionary;
  const includeReusedMachines = options?.includeReusedMachines;
  const featureIndex =
    options?.featureIndex ||
    buildFeatureIndex(dailyRecords, specialDayRules, '', {
      includeReusedMachines,
      aliasDictionary,
    });

  const rawRecords = dailyRecords || [];
  const filtered = includeReusedMachines
    ? rawRecords
    : rawRecords.filter((r) => !r.isReusedMachines && r.machines && r.machines.length > 0);
  const sortedPastRecords = [...(filtered.length > 0 ? filtered : rawRecords)].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    dailyRecords,
    sortedPastRecords,
    specialDayRules,
    aliasDictionary,
    includeReusedMachines,
    featureIndex,
  };
}

/**
 * Incremental state accumulator for machine-level historical evaluations.
 * Avoids repeated slicing and multi-day rescanning in backtests and fast single-day queries.
 */
export class MachineHistoryAccumulator {
  sortedRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  featureIndex: FeatureIndex;
  aliasDictionary?: Record<string, string>;
  curIdx: number = 0;
  cohortDateCounts: Map<string, number> = new Map();
  dateCohortKeys: Map<string, Set<string>> = new Map();
  modelCohortStats: Map<string, Map<string, { totalDiff: number; winCount: number; count: number }>> = new Map();
  machineCohortStats: Map<number, Map<string, { totalDiff: number; winCount: number; count: number }>> = new Map();
  machineOverall: Map<
    number,
    {
      machineNum: number;
      currentModel: string;
      evidenceDays: number;
      highSettingCount: number;
      diffs: number[];
      diffSum: number;
      lastDiff: number | null;
      lastDate: string | null;
      lastTail: number | undefined;
      lastIsZoro: boolean | undefined;
      historyInstances: Array<{ rec: DailyRecord; machine: DailyMachineRecord; isHigh: boolean }>;
    }
  > = new Map();
  lastDayMachines: Set<number> = new Set();
  lastRecord: DailyRecord | null = null;

  constructor(
    sortedPastRecords: DailyRecord[],
    specialDayRules?: SpecialDayRules,
    featureIndex?: FeatureIndex,
    aliasDictionary?: Record<string, string>
  ) {
    this.sortedRecords = sortedPastRecords;
    this.specialDayRules = specialDayRules;
    this.featureIndex =
      featureIndex ||
      buildFeatureIndex(sortedPastRecords, specialDayRules, '', {
        aliasDictionary,
      });
    this.aliasDictionary = aliasDictionary;
  }

  advanceTo(targetDate: string): void {
    while (this.curIdx < this.sortedRecords.length && this.sortedRecords[this.curIdx].date < targetDate) {
      const r = this.sortedRecords[this.curIdx];
      this.curIdx++;

      const isSpecial =
        r.isOldEventDay !== undefined
          ? r.isOldEventDay
          : this.specialDayRules
          ? isDateSpecialDay(r.date, this.specialDayRules)
          : (r.day % 10 === 7);
      const dow = r.dayOfWeek !== undefined ? r.dayOfWeek : calculateDayOfWeek(r.date);
      const isHoliday = isJapaneseHoliday(r.date);

      const cohortKeys: string[] = ['all', 'dow_' + dow];
      if (isHoliday) cohortKeys.push('holiday');
      if (isSpecial) {
        cohortKeys.push('sp_all');
        cohortKeys.push('sp_dow_' + dow);
        if (isHoliday) cohortKeys.push('sp_holiday');
      }

      this.dateCohortKeys.set(r.date, new Set(cohortKeys));

      for (let kIdx = 0; kIdx < cohortKeys.length; kIdx++) {
        const k = cohortKeys[kIdx];
        this.cohortDateCounts.set(k, (this.cohortDateCounts.get(k) || 0) + 1);
      }

      if (r.machines && r.machines.length > 0) {
        this.lastDayMachines = new Set<number>();
        this.lastRecord = r;

        for (let mIdx = 0; mIdx < r.machines.length; mIdx++) {
          const m = r.machines[mIdx];
          const num = m.machineNum;
          if (num === undefined || num === null || isNaN(num)) continue;
          this.lastDayMachines.add(num);

          const model = normalizeModelName(m.modelName || '', this.aliasDictionary);
          if (!model) continue;

          const isHigh = isHighSettingBehavior(m, model);
          const diff = m.diff ?? 0;
          const isWin = diff > 0;

          // Model stats
          let modelMap = this.modelCohortStats.get(model);
          if (!modelMap) {
            modelMap = new Map();
            this.modelCohortStats.set(model, modelMap);
          }
          for (let kIdx = 0; kIdx < cohortKeys.length; kIdx++) {
            const k = cohortKeys[kIdx];
            let st = modelMap.get(k);
            if (!st) {
              st = { totalDiff: 0, winCount: 0, count: 0 };
              modelMap.set(k, st);
            }
            st.totalDiff += diff;
            if (isWin) st.winCount++;
            st.count++;
          }

          // Machine stats
          let mState = this.machineOverall.get(num);
          if (!mState || mState.currentModel !== model) {
            this.machineCohortStats.delete(num);
            mState = {
              machineNum: num,
              currentModel: model,
              evidenceDays: 0,
              highSettingCount: 0,
              diffs: [],
              diffSum: 0,
              lastDiff: null,
              lastDate: null,
              lastTail: undefined,
              lastIsZoro: undefined,
              historyInstances: [],
            };
            this.machineOverall.set(num, mState);
          }

          mState.evidenceDays++;
          if (isHigh) mState.highSettingCount++;
          mState.diffs.push(diff);
          mState.diffSum += diff;
          mState.lastDiff = m.diff; // preserve original diff (e.g. -0)
          mState.lastDate = r.date;
          mState.lastTail = m.tailDigit;
          mState.lastIsZoro = m.isZoro;
          mState.historyInstances.push({ rec: r, machine: m, isHigh });

          let machMap = this.machineCohortStats.get(num);
          if (!machMap) {
            machMap = new Map();
            this.machineCohortStats.set(num, machMap);
          }
          for (let kIdx = 0; kIdx < cohortKeys.length; kIdx++) {
            const k = cohortKeys[kIdx];
            let st = machMap.get(k);
            if (!st) {
              st = { totalDiff: 0, winCount: 0, count: 0 };
              machMap.set(k, st);
            }
            st.totalDiff += diff;
            if (isWin) st.winCount++;
            st.count++;
          }
        }
      }
    }
  }

  computeRanking(
    targetDate: string,
    weights?: Partial<MachineRankingWeights>,
    options?: TargetMachineRankingOptions
  ): TargetMachineRankingResult {
    const mergedWeights: MachineRankingWeights = {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      ...weights,
    };
    const rankingWeights = options?.rankingWeights || DEFAULT_RANKING_WEIGHTS;
    const activeRecentStateWeight =
      options?.recentStateWeight !== undefined
        ? options.recentStateWeight
        : mergedWeights.recentStateWeight;

    // Validate targetDate format
    const isValidDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(targetDate);
    const parsedTargetDate = new Date(targetDate);
    if (!isValidDateFormat || isNaN(parsedTargetDate.getTime())) {
      return {
        targetDate,
        dayOfWeek: '',
        isSpecialDay: false,
        dayTail: 0,
        primaryCohortCount: 0,
        rankings: [],
        excludedInactiveCount: 0,
        referenceDate: null,
        errorReason: `無効な日付形式です: "${targetDate}" (YYYY-MM-DD 形式で指定してください)`,
      };
    }

    this.advanceTo(targetDate);

    const parts = targetDate.split(/[-/.]/);
    const day = parseInt(parts[2], 10);
    const targetDow = calculateDayOfWeek(targetDate);
    if (!targetDow) {
      return {
        targetDate,
        dayOfWeek: '',
        isSpecialDay: false,
        dayTail: 0,
        primaryCohortCount: 0,
        rankings: [],
        excludedInactiveCount: 0,
        referenceDate: null,
        errorReason: `コホート抽出に失敗しました (日付: ${targetDate})`,
      };
    }

    const targetIsHoliday = isJapaneseHoliday(targetDate);
    const targetIsSpecial = this.specialDayRules
      ? isDateSpecialDay(targetDate, this.specialDayRules)
      : day % 10 === 7;
    const dayTail = day % 10;

    let selectedKey = 'all';
    let primaryCohortCount = 0;
    if (targetIsSpecial) {
      const exactKey = targetIsHoliday ? 'sp_holiday' : ('sp_dow_' + targetDow);
      const exactCount = this.cohortDateCounts.get(exactKey) || 0;
      if (exactCount >= 2) {
        selectedKey = exactKey;
        primaryCohortCount = exactCount;
      } else {
        const spCount = this.cohortDateCounts.get('sp_all') || 0;
        if (spCount > 0) {
          selectedKey = 'sp_all';
          primaryCohortCount = spCount;
        } else {
          selectedKey = 'all';
          primaryCohortCount = this.cohortDateCounts.get('all') || 0;
        }
      }
    } else {
      const dowKey = targetIsHoliday ? 'holiday' : ('dow_' + targetDow);
      const dCount = this.cohortDateCounts.get(dowKey) || 0;
      if (dCount > 0) {
        selectedKey = dowKey;
        primaryCohortCount = dCount;
      } else {
        selectedKey = 'all';
        primaryCohortCount = this.cohortDateCounts.get('all') || 0;
      }
    }

    const referenceDate = this.lastRecord?.date ?? null;

    // Active machine determination
    const activeMachineNums = new Set<number>();
    const activeWithinDays = options?.activeWithinDays;

    if (activeWithinDays !== undefined && activeWithinDays > 0) {
      const cutoffDateObj = new Date(parsedTargetDate);
      cutoffDateObj.setDate(cutoffDateObj.getDate() - activeWithinDays);
      const cutoffDateStr = cutoffDateObj.toISOString().slice(0, 10);

      for (let i = this.curIdx - 1; i >= 0; i--) {
        const rec = this.sortedRecords[i];
        if (rec.date < cutoffDateStr) break;
        if (rec.machines) {
          rec.machines.forEach((m) => activeMachineNums.add(m.machineNum));
        }
      }
    } else {
      this.lastDayMachines.forEach((m) => activeMachineNums.add(m));
    }

    if (this.curIdx === 0 || primaryCohortCount === 0 || activeMachineNums.size === 0) {
      return {
        targetDate,
        dayOfWeek: targetDow,
        isSpecialDay: targetIsSpecial,
        dayTail,
        primaryCohortCount,
        rankings: [],
        excludedInactiveCount: 0,
        referenceDate,
      };
    }

    const modelForecast = calculateTargetDateRankingFromIndex(
      targetDate,
      this.featureIndex,
      undefined,
      rankingWeights
    );
    const modelScoreMap = new Map<string, number>();
    if (modelForecast?.modelRankings) {
      for (let i = 0; i < modelForecast.modelRankings.length; i++) {
        const mr = modelForecast.modelRankings[i];
        modelScoreMap.set(
          normalizeModelName(mr.modelName, this.aliasDictionary),
          mr.compositeScore
        );
      }
    }

    const scoredMachines: TargetMachineScore[] = [];
    const minEvidenceDays = options?.minEvidenceDays ?? 1;
    let excludedInactiveCount = 0;

    this.machineOverall.forEach((mState, machineNum) => {
      const {
        currentModel,
        evidenceDays,
        highSettingCount,
        diffs,
        lastDiff,
        lastDate,
        lastTail,
        lastIsZoro,
        historyInstances,
      } = mState;

      if (!activeMachineNums.has(machineNum)) {
        excludedInactiveCount++;
        return;
      }

      if (evidenceDays < minEvidenceDays) return;

      const cMap = this.machineCohortStats.get(machineNum);
      const cSt = cMap?.get(selectedKey);
      const cohortEvidenceDays = cSt ? cSt.count : 0;
      const cohortTotalDiff = cSt ? cSt.totalDiff : 0;
      const cohortWinCount = cSt ? cSt.winCount : 0;

      // Model baseline
      const modelMap = this.modelCohortStats.get(currentModel);
      const mCohort = modelMap?.get(selectedKey);
      const mOverall = modelMap?.get('all');
      let baseAvgDiff = 0;
      let baseWinRate = 50;
      if (mCohort && mCohort.count > 0) {
        baseAvgDiff = mCohort.totalDiff / mCohort.count;
        baseWinRate = (mCohort.winCount / mCohort.count) * 100;
      } else if (mOverall && mOverall.count > 0) {
        baseAvgDiff = mOverall.totalDiff / mOverall.count;
        baseWinRate = (mOverall.winCount / mOverall.count) * 100;
      }

      const k = mergedWeights.shrinkageK || 3;
      const shrinkageB = cohortEvidenceDays / (cohortEvidenceDays + k);

      let rawCohortAvgDiff = 0;
      let rawCohortWinRate = 50;
      if (cohortEvidenceDays > 0) {
        rawCohortAvgDiff = cohortTotalDiff / cohortEvidenceDays;
        rawCohortWinRate = (cohortWinCount / cohortEvidenceDays) * 100;
      } else {
        rawCohortAvgDiff = baseAvgDiff;
        rawCohortWinRate = baseWinRate;
      }

      const shrunkDiff = shrinkageB * rawCohortAvgDiff + (1 - shrinkageB) * baseAvgDiff;
      const shrunkWinRate = shrinkageB * rawCohortWinRate + (1 - shrinkageB) * baseWinRate;
      const highSettingRate = evidenceDays > 0 ? highSettingCount / evidenceDays : 0;
      const rawModelScore = modelScoreMap.get(currentModel) || 0;

      const machTail = getMachineTailDigit(machineNum, lastTail);
      const isTailMatch = machTail === dayTail;
      const isZoro = isMachineZoro(machineNum, lastIsZoro);
      const tailBonus =
        (isTailMatch ? mergedWeights.tailMatchBonus : 0) +
        (isZoro ? mergedWeights.zoroBonus : 0);

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
        (activeRecentStateWeight !== 0 && lastDiff !== null
          ? Math.round(lastDiff * activeRecentStateWeight * 100) / 100
          : 0) || 0;

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

      let confidence: MachineConfidenceLevel = '低';
      let standardError = 0;
      if (diffs.length > 0) {
        const mean = mState.diffSum / diffs.length;
        let varSum = 0;
        for (let i = 0; i < diffs.length; i++) {
          varSum += (diffs[i] - mean) ** 2;
        }
        const variance = varSum / Math.max(1, diffs.length - 1);
        const stdDev = Math.sqrt(variance);
        standardError = stdDev / Math.sqrt(Math.max(1, diffs.length));
        if (cohortEvidenceDays >= 5 && standardError <= 650) {
          confidence = '高';
        } else if (
          cohortEvidenceDays >= 3 ||
          (evidenceDays >= 6 && standardError <= 950)
        ) {
          confidence = '中';
        }
      }

      let fullHistoryEntries: MachineHistoryEntry[] = [];
      if (!options?.skipHistory && historyInstances.length > 0) {
        fullHistoryEntries = historyInstances.map(({ rec, machine, isHigh }) => ({
          date: rec.date,
          dayOfWeek: rec.dayOfWeek,
          diff: machine.diff,
          games: machine.games,
          payoutRate: machine.payoutRate,
          bb: machine.bb,
          rb: machine.rb,
          isInCohort:
            selectedKey === 'all'
              ? true
              : this.dateCohortKeys.get(rec.date)?.has(selectedKey) ?? false,
          isHighSetting: isHigh,
        }));
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
          modelCohortAvgDiff: Math.round(baseAvgDiff * 10) / 10,
          modelCohortWinRate: Math.round(baseWinRate * 10) / 10,
          highSettingRate: Math.round(highSettingRate * 1000) / 10,
          highSettingCount,
          modelScore: Math.round(rawModelScore * 10) / 10,
          isTailMatch,
          isZoro,
          priorDayDiff: lastDiff,
          priorDayDate: lastDate,
          standardError: Math.round(standardError * 10) / 10,
        },
        history: fullHistoryEntries,
      });
    });

    scoredMachines.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.evidenceDays !== a.evidenceDays) return b.evidenceDays - a.evidenceDays;
      return a.machineNum - b.machineNum;
    });

    scoredMachines.forEach((mach, idx) => {
      mach.rank = idx + 1;
    });

    return {
      targetDate,
      dayOfWeek: targetDow,
      isSpecialDay: targetIsSpecial,
      dayTail,
      primaryCohortCount,
      rankings: scoredMachines,
      excludedInactiveCount,
      referenceDate,
    };
  }
}

/**
 * Calculates target machine rankings for a target date from pre-indexed machine features.
 */
export function calculateTargetMachineRankingFromIndex(
  targetDate: string,
  machineIndex: MachineFeatureIndex,
  weights?: Partial<MachineRankingWeights>,
  options?: TargetMachineRankingOptions
): TargetMachineRankingResult {
  if (options?.accumulator) {
    return options.accumulator.computeRanking(targetDate, weights, options);
  }

  const accumulator = new MachineHistoryAccumulator(
    machineIndex.sortedPastRecords,
    machineIndex.specialDayRules,
    machineIndex.featureIndex,
    options?.aliasDictionary || machineIndex.aliasDictionary
  );
  return accumulator.computeRanking(targetDate, weights, options);
}

/**
 * Main engine function calculating target machine rankings for a target date.
 * Public wrapper preserving signature and exact output.
 */
export function calculateTargetMachineRanking(
  targetDate: string,
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  weights?: Partial<MachineRankingWeights>,
  options?: TargetMachineRankingOptions
): TargetMachineRankingResult {
  const machineIndex =
    options?.machineIndex ||
    buildMachineFeatureIndex(dailyRecords, specialDayRules, options);
  return calculateTargetMachineRankingFromIndex(targetDate, machineIndex, weights, options);
}

