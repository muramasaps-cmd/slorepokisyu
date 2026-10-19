// Engine for calculating target machine recommendations by machine number (台番号別狙い台ランキング)
import {
  DailyRecord,
  DailyMachineRecord,
  SpecialDayRules,
  RankingWeights,
  MachineRankingWeights,
  TargetMachineScore,
  MachineConfidenceLevel,
  MachineRankingContributions,
  MachineHistoryEntry,
  ConfidenceMode,
} from '../data/types';
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
export type {
  MachineRankingWeights,
  TargetMachineScore,
  MachineConfidenceLevel,
  MachineRankingContributions,
  MachineHistoryEntry,
  ConfidenceMode,
} from '../data/types';

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.50,
  MEDIUM: 0.25,
} as const;

export const RELIABILITY_THRESHOLDS = {
  HIGH: 0.5,
  MEDIUM: 0.25,
} as const;

/**
 * 純関数 estimateShrinkageParams(perMachineDiffs: number[][]): { sigma2, tau2, grandMean }
 * sigma2 は、台内の日ごとの分散を (n_i−1) で重み付けしてプールした値。
 * tau2 は、max(0, 台ごとの平均の分散 − sigma2 × 台ごとの 1/n_i の平均)（モーメント法）。
 *
 * @param perMachineDiffs 台ごとの日次差枚数の二次元配列
 */
export function estimateShrinkageParams(perMachineDiffs: number[][]): {
  sigma2: number;
  tau2: number;
  grandMean: number;
} {
  const validMachines: { diffs: number[]; n: number; mean: number }[] = [];
  let pooledSS = 0;
  let pooledDF = 0;

  for (let i = 0; i < perMachineDiffs.length; i++) {
    const diffs = perMachineDiffs[i];
    if (!diffs || diffs.length === 0) continue;
    const n = diffs.length;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += diffs[j];
    }
    const mean = sum / n;
    validMachines.push({ diffs, n, mean });

    if (n >= 2) {
      let ss = 0;
      for (let j = 0; j < n; j++) {
        ss += (diffs[j] - mean) ** 2;
      }
      pooledSS += ss;
      pooledDF += n - 1;
    }
  }

  const sigma2 = pooledDF > 0 ? pooledSS / pooledDF : 0;
  const M = validMachines.length;

  if (M === 0) {
    return { sigma2, tau2: 0, grandMean: 0 };
  }

  const grandMean = validMachines.reduce((acc, m) => acc + m.mean, 0) / M;

  if (M < 2) {
    return { sigma2, tau2: 0, grandMean };
  }

  let sBetween = 0;
  let invNSum = 0;
  for (let i = 0; i < M; i++) {
    sBetween += (validMachines[i].mean - grandMean) ** 2;
    invNSum += 1 / validMachines[i].n;
  }

  const varBetween = sBetween / (M - 1);
  const avgInvN = invNSum / M;
  const tau2 = Math.max(0, varBetween - sigma2 * avgInvN);

  return { sigma2, tau2, grandMean };
}

export interface RateShrinkageItem {
  diff: number;
  games: number;
}

export interface RateShrinkageMachineArrays {
  diffs: number[];
  games: number[];
}

export type RateShrinkageInput =
  | RateShrinkageItem[]
  | RateShrinkageMachineArrays;

/**
 * 30-3: 差枚あたりの率 r = Σ差枚 / ΣG（1Gあたりの差枚）の経験ベイズパラメータ推定
 * 1Gあたりの差枚の分散 s2 は、Σ(差枚_i − r × G_i)² / ΣG_i を台内でプールして推定。
 * 台間のばらつき tau2_r は、モーメント法 max(0, 台ごとの r の分散 − s2 × 台ごとの 1/ΣG の平均) で推定。
 */
export function estimateRateShrinkageParams(
  perMachineDaily: RateShrinkageInput[]
): {
  s2: number;
  tau2_r: number;
  grandMean: number;
} {
  const validMachines: { r: number; totalGames: number }[] = [];
  let pooledSS = 0;
  let pooledG = 0;

  for (let i = 0; i < perMachineDaily.length; i++) {
    const raw = perMachineDaily[i];
    if (!raw) continue;

    let diffs: number[];
    let games: number[];

    if (Array.isArray(raw)) {
      diffs = raw.map((e) => e.diff);
      games = raw.map((e) => e.games);
    } else {
      diffs = raw.diffs;
      games = raw.games;
    }

    if (!diffs || diffs.length === 0) continue;

    let mDiffSum = 0;
    let mGamesSum = 0;
    const len = Math.min(diffs.length, games.length);

    for (let j = 0; j < len; j++) {
      const g = games[j] || 0;
      if (g > 0) {
        mDiffSum += diffs[j];
        mGamesSum += g;
      }
    }

    if (mGamesSum <= 0) continue;

    const r = mDiffSum / mGamesSum;
    validMachines.push({ r, totalGames: mGamesSum });

    let ss = 0;
    for (let j = 0; j < len; j++) {
      const g = games[j] || 0;
      if (g > 0) {
        ss += (diffs[j] - r * g) ** 2;
      }
    }
    pooledSS += ss;
    pooledG += mGamesSum;
  }

  const s2 = pooledG > 0 ? pooledSS / pooledG : 0;
  const M = validMachines.length;

  if (M === 0) {
    return { s2, tau2_r: 0, grandMean: 0 };
  }

  const grandMean = validMachines.reduce((acc, m) => acc + m.r, 0) / M;

  if (M < 2) {
    return { s2, tau2_r: 0, grandMean };
  }

  let sBetween = 0;
  let invGSum = 0;
  for (let i = 0; i < M; i++) {
    sBetween += (validMachines[i].r - grandMean) ** 2;
    invGSum += 1 / validMachines[i].totalGames;
  }

  const varBetween = sBetween / (M - 1);
  const avgInvG = invGSum / M;
  const tau2_r = Math.max(0, varBetween - s2 * avgInvG);

  return { s2, tau2_r, grandMean };
}

export const DEFAULT_MACHINE_RANKING_WEIGHTS: MachineRankingWeights = {
  diffWeight: 0.04,
  winRateWeight: 0.3,
  highSettingWeight: 20.0,
  modelScoreWeight: 0.25,
  tailMatchBonus: 0.0,
  zoroBonus: 0.0,
  recentStateWeight: 0,
  shrinkageK: 3,
  shrinkageMode: 'empirical',
  confidenceMode: 'reliability',
  cohortMode: 'interaction',
  standardGames: 5000,
  baseGames: 5000,
  highSettingShrinkage: { enabled: true, priorStrength: 4 },
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
  /** 信頼度算出モード（既定値: 'legacy'） */
  confidenceMode?: ConfidenceMode;
  /** 30-3: 基準ゲーム数（既定値: 5000） */
  baseGames?: number;
  /** 30-5: 高設定挙動率の縮小オプション */
  highSettingShrinkage?: { enabled: boolean; priorStrength: number };
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
  shrinkageDiagnostics?: {
    sigma2: number;
    tau2: number;
    B?: number;
    s2_r?: number;
    tau2_r?: number;
  };
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
  modelCohortStats: Map<string, Map<string, { totalDiff: number; totalGames: number; totalInCoins: number; winCount: number; count: number }>> = new Map();
  storeCohortStats: Map<
    string,
    {
      totalDiff: number;
      totalGames: number;
      totalInCoins: number;
      winCount: number;
      count: number;
    }
  > = new Map();
  machineCohortStats: Map<
    number,
    Map<
      string,
      {
        totalDiff: number;
        totalGames: number;
        totalInCoins: number;
        winCount: number;
        count: number;
        dailyEntries: Array<{ diff: number; games: number; inCoins: number; diffRate: number }>;
      }
    >
  > = new Map();
  machineOverall: Map<
    number,
    {
      machineNum: number;
      currentModel: string;
      evidenceDays: number;
      highSettingCount: number;
      diffs: number[];
      diffSum: number;
      games: number[];
      gamesSum: number;
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
          const games = m.games || 0;
          const inCoins = Math.max(1, games * 3);
          const diffRate = diff / inCoins;

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
              st = { totalDiff: 0, totalGames: 0, totalInCoins: 0, winCount: 0, count: 0 };
              modelMap.set(k, st);
            }
            st.totalDiff += diff;
            st.totalGames += games;
            st.totalInCoins += inCoins;
            if (isWin) st.winCount++;
            st.count++;

            let storeSt = this.storeCohortStats.get(k);
            if (!storeSt) {
              storeSt = { totalDiff: 0, totalGames: 0, totalInCoins: 0, winCount: 0, count: 0 };
              this.storeCohortStats.set(k, storeSt);
            }
            storeSt.totalDiff += diff;
            storeSt.totalGames += games;
            storeSt.totalInCoins += inCoins;
            if (isWin) storeSt.winCount++;
            storeSt.count++;
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
              games: [],
              gamesSum: 0,
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
          mState.games.push(games);
          mState.gamesSum += games;
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
              st = {
                totalDiff: 0,
                totalGames: 0,
                totalInCoins: 0,
                winCount: 0,
                count: 0,
                dailyEntries: [],
              };
              machMap.set(k, st);
            }
            st.totalDiff += diff;
            st.totalGames += games;
            st.totalInCoins += inCoins;
            if (isWin) st.winCount++;
            st.count++;
            st.dailyEntries.push({ diff, games, inCoins, diffRate });
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

    // Collect all machines grouped by model that are active and have >= minEvidenceDays
    const modelToActiveMachines = new Map<string, number[]>();
    this.machineOverall.forEach((mState, machNum) => {
      if (!activeMachineNums.has(machNum)) return;
      if (mState.evidenceDays < minEvidenceDays) return;
      const list = modelToActiveMachines.get(mState.currentModel);
      if (list) {
        list.push(machNum);
      } else {
        modelToActiveMachines.set(mState.currentModel, [machNum]);
      }
    });

    // Helper to compute Empirical Bayes parameters for a given cohort key ('selectedKey' or 'all')
    const computeEBForCohortKey = (cohortKey: string) => {
      const ebMap = new Map<
        string,
        {
          sigma2: number;
          tau2: number;
          machinesMap: Map<
            number,
            {
              diffRate: number;
              totalDiff: number;
              totalInCoins: number;
              totalGames: number;
              winCount: number;
              cohortDays: number;
            }
          >;
        }
      >();

      modelToActiveMachines.forEach((machNums, modelName) => {
        const modelMachinesData = new Map<
          number,
          {
            diffRate: number;
            totalDiff: number;
            totalInCoins: number;
            totalGames: number;
            winCount: number;
            cohortDays: number;
          }
        >();

        let pooledSS = 0;
        let pooledDF = 0;
        const machineMeans: Array<{ num: number; r: number; n: number }> = [];

        for (const num of machNums) {
          const cMap = this.machineCohortStats.get(num);
          const cSt = cMap?.get(cohortKey);
          const n = cSt ? cSt.count : 0;
          const totalDiff = cSt ? cSt.totalDiff : 0;
          const totalGames = cSt ? cSt.totalGames : 0;
          const totalInCoins = cSt ? cSt.totalInCoins : 0;
          const winCount = cSt ? cSt.winCount : 0;
          const diffRate = totalInCoins > 0 ? totalDiff / totalInCoins : 0;

          modelMachinesData.set(num, {
            diffRate,
            totalDiff,
            totalInCoins,
            totalGames,
            winCount,
            cohortDays: n,
          });

          if (cSt && n >= 1) {
            machineMeans.push({ num, r: diffRate, n });
            if (n >= 2 && cSt.dailyEntries && cSt.dailyEntries.length >= 2) {
              const unwMean = cSt.dailyEntries.reduce((acc, e) => acc + e.diffRate, 0) / n;
              let ss = 0;
              for (const e of cSt.dailyEntries) {
                ss += (e.diffRate - unwMean) ** 2;
              }
              pooledSS += ss;
              pooledDF += n - 1;
            }
          }
        }

        // 1. Within-machine daily variance sigma^2 (pooled across model)
        const defaultSigma2 = (1700 / 15000) ** 2;
        const priorDF = 8;
        const sigma2 = (pooledSS + priorDF * defaultSigma2) / (pooledDF + priorDF);

        // 2. Between-machine true difference variance tau^2 (method of moments)
        const defaultTau2 = defaultSigma2 / 8;
        let tau2 = defaultTau2;
        const M = machineMeans.length;
        if (M >= 2) {
          const grandMean = machineMeans.reduce((acc, m) => acc + m.r, 0) / M;
          let sBetween = 0;
          let expectedErrorSum = 0;
          for (const m of machineMeans) {
            sBetween += (m.r - grandMean) ** 2;
            expectedErrorSum += sigma2 / m.n;
          }
          const sampleBetweenVar = sBetween / (M - 1);
          const avgExpectedError = expectedErrorSum / M;
          const rawTau2 = Math.max(0, sampleBetweenVar - avgExpectedError);
          const tauWeight = M >= 10 ? 1.0 : (M - 1) / 10;
          tau2 = tauWeight * rawTau2 + (1 - tauWeight) * defaultTau2;
        }

        ebMap.set(modelName, {
          sigma2,
          tau2,
          machinesMap: modelMachinesData,
        });
      });

      return ebMap;
    };

    const modelEBParams = computeEBForCohortKey(selectedKey);
    const modelEBParamsAll =
      mergedWeights.cohortMode === 'additive' ? computeEBForCohortKey('all') : undefined;

    // Precompute Empirical Bayes shrinkage parameters from daily diffs and diff/game rates
    // "sigma2・tau2 は、対象日より前の、その機種（台数が5台未満のときは店内の全機種）の台ごとの日次差枚から推定する。"
    const modelMachineDiffsMap = new Map<string, number[][]>();
    const allStoreDiffs: number[][] = [];
    const modelMachineRateDataMap = new Map<string, Array<{ diffs: number[]; games: number[] }>>();
    const allStoreRateData: Array<{ diffs: number[]; games: number[] }> = [];

    this.machineOverall.forEach((mState) => {
      if (mState.diffs && mState.diffs.length > 0) {
        allStoreDiffs.push(mState.diffs);
        const rateItem = { diffs: mState.diffs, games: mState.games };
        allStoreRateData.push(rateItem);

        let list = modelMachineDiffsMap.get(mState.currentModel);
        if (!list) {
          list = [];
          modelMachineDiffsMap.set(mState.currentModel, list);
        }
        list.push(mState.diffs);

        let rateList = modelMachineRateDataMap.get(mState.currentModel);
        if (!rateList) {
          rateList = [];
          modelMachineRateDataMap.set(mState.currentModel, rateList);
        }
        rateList.push(rateItem);
      }
    });

    const storeWideParams = estimateShrinkageParams(allStoreDiffs);
    const modelShrinkageCache = new Map<string, { sigma2: number; tau2: number; grandMean: number }>();

    const getModelShrinkageParams = (modelName: string): { sigma2: number; tau2: number; grandMean: number } => {
      let cached = modelShrinkageCache.get(modelName);
      if (cached) return cached;
      const modelDiffs = modelMachineDiffsMap.get(modelName);
      if (!modelDiffs || modelDiffs.length < 5) {
        cached = storeWideParams;
      } else {
        cached = estimateShrinkageParams(modelDiffs);
      }
      modelShrinkageCache.set(modelName, cached);
      return cached;
    };

    const storeWideRateParams = estimateRateShrinkageParams(allStoreRateData);
    const modelRateShrinkageCache = new Map<string, { s2: number; tau2_r: number; grandMean: number }>();

    const getModelRateShrinkageParams = (modelName: string): { s2: number; tau2_r: number; grandMean: number } => {
      let cached = modelRateShrinkageCache.get(modelName);
      if (cached) return cached;
      const modelData = modelMachineRateDataMap.get(modelName);
      if (!modelData || modelData.length < 5) {
        cached = storeWideRateParams;
      } else {
        cached = estimateRateShrinkageParams(modelData);
      }
      modelRateShrinkageCache.set(modelName, cached);
      return cached;
    };

    // 30-5: その機種の全台の高設定挙動の平均率 & 店全体の高設定挙動率
    const modelHighSettingMap = new Map<string, { highCount: number; evidenceDays: number }>();
    let totalStoreHighSettingCount = 0;
    let totalStoreMachineEvidenceDays = 0;
    this.machineOverall.forEach((mState, mNum) => {
      if (activeMachineNums.has(mNum)) {
        totalStoreHighSettingCount += mState.highSettingCount;
        totalStoreMachineEvidenceDays += mState.evidenceDays;

        let mStats = modelHighSettingMap.get(mState.currentModel);
        if (!mStats) {
          mStats = { highCount: 0, evidenceDays: 0 };
          modelHighSettingMap.set(mState.currentModel, mStats);
        }
        mStats.highCount += mState.highSettingCount;
        mStats.evidenceDays += mState.evidenceDays;
      }
    });
    const storeBaseHighRate =
      totalStoreMachineEvidenceDays > 0
        ? totalStoreHighSettingCount / totalStoreMachineEvidenceDays
        : 0.15;
    const hsShrinkageConfig =
      options?.highSettingShrinkage ?? mergedWeights.highSettingShrinkage;
    const hsShrinkageEnabled = hsShrinkageConfig?.enabled ?? true;
    const hsPriorStrength = hsShrinkageConfig?.priorStrength ?? 4;

    const storeCohort = this.storeCohortStats.get(selectedKey);
    const storeOverall = this.storeCohortStats.get('all');
    const storeCohortAvgDiff = storeCohort && storeCohort.count > 0 ? storeCohort.totalDiff / storeCohort.count : 0;
    const storeAllAvgDiff = storeOverall && storeOverall.count > 0 ? storeOverall.totalDiff / storeOverall.count : 0;
    const storeCohortEffectDiff = storeCohortAvgDiff - storeAllAvgDiff;
    const storeCohortWinRate = storeCohort && storeCohort.count > 0 ? (storeCohort.winCount / storeCohort.count) * 100 : 50;
    const storeAllWinRate = storeOverall && storeOverall.count > 0 ? (storeOverall.winCount / storeOverall.count) * 100 : 50;
    const storeCohortEffectWinRate = storeCohortWinRate - storeAllWinRate;

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

      const eb = modelEBParams.get(currentModel);
      const machData = eb?.machinesMap.get(machineNum);
      const cohortEvidenceDays = machData?.cohortDays ?? 0;
      const cohortTotalDiff = machData?.totalDiff ?? 0;
      const cohortTotalGames = machData?.totalGames ?? 0;
      const cohortTotalInCoins = machData?.totalInCoins ?? 0;
      const cohortWinCount = machData?.winCount ?? 0;

      // Model baseline for selectedKey
      const modelMap = this.modelCohortStats.get(currentModel);
      const mCohort = modelMap?.get(selectedKey);
      const mOverall = modelMap?.get('all');
      let baseAvgDiff = 0;
      let baseWinRate = 50;
      let baseDiffRate = 0;
      if (mCohort && mCohort.count > 0) {
        baseAvgDiff = mCohort.totalDiff / mCohort.count;
        baseWinRate = (mCohort.winCount / mCohort.count) * 100;
        baseDiffRate = mCohort.totalInCoins > 0 ? mCohort.totalDiff / mCohort.totalInCoins : 0;
      } else if (mOverall && mOverall.count > 0) {
        baseAvgDiff = mOverall.totalDiff / mOverall.count;
        baseWinRate = (mOverall.winCount / mOverall.count) * 100;
        baseDiffRate = mOverall.totalInCoins > 0 ? mOverall.totalDiff / mOverall.totalInCoins : 0;
      }

      let rawCohortAvgDiff = 0;
      let rawCohortWinRate = 50;
      let rawCohortDiffRate = baseDiffRate;
      if (cohortEvidenceDays > 0) {
        rawCohortAvgDiff = cohortTotalDiff / cohortEvidenceDays;
        rawCohortWinRate = (cohortWinCount / cohortEvidenceDays) * 100;
        rawCohortDiffRate = cohortTotalInCoins > 0 ? cohortTotalDiff / cohortTotalInCoins : 0;
      } else {
        rawCohortAvgDiff = baseAvgDiff;
        rawCohortWinRate = baseWinRate;
        rawCohortDiffRate = baseDiffRate;
      }

      const rawPayoutRate = (1 + rawCohortDiffRate) * 100;

      // Leave-one-out baseline of other machines of the same model (Requirement 1b)
      let leaveOneOutDiffRate = baseDiffRate;
      let leaveOneOutWinRate = baseWinRate;
      if (eb && eb.machinesMap.size > 1) {
        let otherTotalDiff = 0;
        let otherTotalInCoins = 0;
        let otherWinSum = 0;
        let otherCount = 0;
        eb.machinesMap.forEach((otherM, oNum) => {
          if (oNum !== machineNum && otherM.cohortDays > 0) {
            otherTotalDiff += otherM.totalDiff;
            otherTotalInCoins += otherM.totalInCoins;
            otherWinSum += otherM.winCount;
            otherCount += otherM.cohortDays;
          }
        });
        if (otherTotalInCoins > 0 && otherCount > 0) {
          const rawLooRate = otherTotalDiff / otherTotalInCoins;
          const rawLooWin = (otherWinSum / otherCount) * 100;
          const mSize = eb.machinesMap.size;
          const baselineWeight = Math.min(1.0, Math.max(0, (mSize - 3) / 2));
          leaveOneOutDiffRate = baselineWeight * rawLooRate + (1 - baselineWeight) * baseDiffRate;
          leaveOneOutWinRate = baselineWeight * rawLooWin + (1 - baselineWeight) * baseWinRate;
        }
      }

      const standardGames = mergedWeights.standardGames || 5000;
      const baseGames = options?.baseGames ?? mergedWeights.baseGames ?? 5000;
      const avgGames = cohortEvidenceDays > 0
        ? Math.round(cohortTotalGames / cohortEvidenceDays)
        : mState.diffs.length > 0
        ? Math.round((mState.gamesSum || 0) / mState.diffs.length)
        : standardGames;

      let shrinkageB = 0;
      let shrunkDiff = 0;
      let shrunkWinRate = 50;
      let shrunkPayoutRate = 100;
      let expectedDiffStd = 0;
      let expectedDiffActual = 0;

      const shrinkageParams = getModelShrinkageParams(currentModel);
      const { sigma2, tau2 } = shrinkageParams;

      // Machine all-period stats (used in additive mode)
      const machAllDays = mState.evidenceDays;
      const machAllDiffSum = mState.diffSum;
      const machAllAvgDiff = machAllDays > 0 ? machAllDiffSum / machAllDays : 0;
      let machAllWinCount = 0;
      for (let di = 0; di < mState.diffs.length; di++) {
        if (mState.diffs[di] > 0) machAllWinCount++;
      }
      const machAllWinRate = machAllDays > 0 ? (machAllWinCount / machAllDays) * 100 : 50;

      const modelAllAvgDiff = mOverall && mOverall.count > 0 ? mOverall.totalDiff / mOverall.count : (storeWideParams.grandMean || 0);
      const modelAllWinRate = mOverall && mOverall.count > 0 ? (mOverall.winCount / mOverall.count) * 100 : 50;

      let shrinkageBAll = 0;
      if (mergedWeights.shrinkageMode === 'empirical') {
        if (machAllDays > 0 && tau2 > 0) {
          const samplingVarAll = sigma2 / machAllDays;
          shrinkageBAll = tau2 / (tau2 + samplingVarAll);
        } else {
          shrinkageBAll = 0;
        }
      } else {
        const k = mergedWeights.shrinkageK || 3;
        shrinkageBAll = machAllDays > 0 ? machAllDays / (machAllDays + k) : 0;
      }

      const shrunkAllDiff = shrinkageBAll * machAllAvgDiff + (1 - shrinkageBAll) * modelAllAvgDiff;
      const shrunkAllWinRate = shrinkageBAll * machAllWinRate + (1 - shrinkageBAll) * modelAllWinRate;

      let cohortEffectDiff = storeCohortEffectDiff;
      let cohortEffectWinRate = storeCohortEffectWinRate;
      if (mCohort && mCohort.count > 0 && mOverall && mOverall.count > 0) {
        const modelCohortAvgDiff = mCohort.totalDiff / mCohort.count;
        const modelCohortWinRate = (mCohort.winCount / mCohort.count) * 100;
        cohortEffectDiff = modelCohortAvgDiff - modelAllAvgDiff;
        cohortEffectWinRate = modelCohortWinRate - modelAllWinRate;
      }

      if (mergedWeights.cohortMode === 'additive') {
        shrinkageB = shrinkageBAll;
        shrunkDiff = shrunkAllDiff + cohortEffectDiff;
        shrunkWinRate = Math.min(100, Math.max(0, shrunkAllWinRate + cohortEffectWinRate));
        expectedDiffStd = shrunkDiff;
        expectedDiffActual = shrunkDiff;
        shrunkPayoutRate = (1 + (shrunkDiff / (Math.max(1, avgGames) * 3))) * 100;
      } else if (mergedWeights.shrinkageMode === 'empirical') {
        if (cohortEvidenceDays > 0 && tau2 > 0) {
          const samplingVar = sigma2 / cohortEvidenceDays;
          shrinkageB = tau2 / (tau2 + samplingVar);
        } else {
          shrinkageB = 0;
        }

        shrunkDiff = shrinkageB * rawCohortAvgDiff + (1 - shrinkageB) * baseAvgDiff;
        shrunkWinRate = shrinkageB * rawCohortWinRate + (1 - shrinkageB) * baseWinRate;
        expectedDiffStd = shrunkDiff;
        expectedDiffActual = shrunkDiff;
        shrunkPayoutRate = (1 + (shrunkDiff / (Math.max(1, avgGames) * 3))) * 100;
      } else {
        // Fixed n/(n+k) mode (Requirement 1c: preserves exact legacy golden)
        const k = mergedWeights.shrinkageK || 3;
        shrinkageB = cohortEvidenceDays > 0 ? cohortEvidenceDays / (cohortEvidenceDays + k) : 0;
        shrunkDiff = shrinkageB * rawCohortAvgDiff + (1 - shrinkageB) * baseAvgDiff;
        shrunkWinRate = shrinkageB * rawCohortWinRate + (1 - shrinkageB) * baseWinRate;
        expectedDiffStd = shrunkDiff;
        expectedDiffActual = shrunkDiff;
        shrunkPayoutRate = (1 + (shrunkDiff / (Math.max(1, avgGames) * 3))) * 100;
      }

      // 30-3: 出率ベース・基準G換算の期待差枚
      const { s2: s2_r, tau2_r, grandMean: rateGrandMean } = getModelRateShrinkageParams(currentModel);

      let machineCohortRate = 0;
      if (cohortTotalGames > 0) {
        machineCohortRate = cohortTotalDiff / cohortTotalGames;
      }

      let modelCohortRate = 0;
      if (mCohort && mCohort.totalGames > 0) {
        modelCohortRate = mCohort.totalDiff / mCohort.totalGames;
      } else if (mOverall && mOverall.totalGames > 0) {
        modelCohortRate = mOverall.totalDiff / mOverall.totalGames;
      } else {
        modelCohortRate = rateGrandMean;
      }

      let modelAllRate = 0;
      if (mOverall && mOverall.totalGames > 0) {
        modelAllRate = mOverall.totalDiff / mOverall.totalGames;
      } else {
        modelAllRate = rateGrandMean;
      }

      let rateB = 0;
      let expectedDiffAtBaseGames = 0;
      if ((mergedWeights.shrinkageMode ?? 'empirical') === 'empirical') {
        if (mergedWeights.cohortMode === 'additive') {
          const mGamesSum = mState.gamesSum || 0;
          const mDiffSum = mState.diffSum || 0;
          const machineAllRate = mGamesSum > 0 ? mDiffSum / mGamesSum : 0;
          if (mGamesSum > 0 && tau2_r > 0) {
            const samplingVar = s2_r / mGamesSum;
            rateB = (tau2_r + samplingVar > 0) ? tau2_r / (tau2_r + samplingVar) : 0;
          } else {
            rateB = 0;
          }
          const shrunkAllRate = rateB * machineAllRate + (1 - rateB) * modelAllRate;
          const cohortRateEffect = modelCohortRate - modelAllRate;
          const shrunkRate = shrunkAllRate + cohortRateEffect;
          expectedDiffAtBaseGames = Math.round(baseGames * shrunkRate * 10) / 10;
        } else {
          if (cohortTotalGames > 0 && tau2_r > 0) {
            const samplingVar = s2_r / cohortTotalGames;
            rateB = (tau2_r + samplingVar > 0) ? tau2_r / (tau2_r + samplingVar) : 0;
          } else {
            rateB = 0;
          }

          const effectiveMachineRate = cohortTotalGames > 0 ? machineCohortRate : modelCohortRate;
          const shrunkRate = rateB * effectiveMachineRate + (1 - rateB) * modelCohortRate;
          expectedDiffAtBaseGames = Math.round(baseGames * shrunkRate * 10) / 10;
        }
      } else {
        // 'fixed' のときは、expectedDiffAtBaseGames に、縮小しない r × baseGames を入れる（比較用）
        if (mergedWeights.cohortMode === 'additive') {
          const mGamesSum = mState.gamesSum || 0;
          const mDiffSum = mState.diffSum || 0;
          const machineAllRate = mGamesSum > 0 ? mDiffSum / mGamesSum : 0;
          const cohortRateEffect = modelCohortRate - modelAllRate;
          expectedDiffAtBaseGames = Math.round(baseGames * (machineAllRate + cohortRateEffect) * 10) / 10;
        } else {
          expectedDiffAtBaseGames = Math.round(baseGames * machineCohortRate * 10) / 10;
        }
      }

      // 30-5: 高設定挙動の率の縮小（enabled のとき、その機種の全台平均率で縮小。既定 enabled=false は現行の比率）
      let highSettingRate = 0;
      if (hsShrinkageEnabled) {
        const mStats = modelHighSettingMap.get(currentModel);
        const modelMeanRate =
          mStats && mStats.evidenceDays > 0
            ? mStats.highCount / mStats.evidenceDays
            : storeBaseHighRate;
        const a = hsPriorStrength * modelMeanRate;
        highSettingRate =
          evidenceDays + hsPriorStrength > 0
            ? (highSettingCount + a) / (evidenceDays + hsPriorStrength)
            : 0;
      } else if (
        mergedWeights.betaPriorA !== undefined &&
        mergedWeights.betaPriorB !== undefined
      ) {
        highSettingRate =
          (highSettingCount + mergedWeights.betaPriorA) /
          (evidenceDays + mergedWeights.betaPriorA + mergedWeights.betaPriorB);
      } else {
        highSettingRate = evidenceDays > 0 ? highSettingCount / evidenceDays : 0;
      }
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

      // Posterior mean, posterior SD, 80% credible interval, and empirical Bayes reliability
      let posteriorMean = Math.round(shrunkDiff * 10) / 10;
      let posteriorSd: number | null = null;
      let interval80: [number, number] | null = null;
      let reliability: number | null = null;

      const activeShrinkageMode = mergedWeights.shrinkageMode ?? 'empirical';
      const effectiveEvidenceDays =
        mergedWeights.cohortMode === 'additive' ? evidenceDays : cohortEvidenceDays;
      const effectiveB =
        mergedWeights.cohortMode === 'additive' ? shrinkageBAll : shrinkageB;

      if (activeShrinkageMode === 'empirical') {
        const rawRel =
          effectiveEvidenceDays > 0 && tau2 + sigma2 / effectiveEvidenceDays > 0
            ? tau2 / (tau2 + sigma2 / effectiveEvidenceDays)
            : 0;
        reliability = Math.round(rawRel * 10000) / 10000;

        const rawPostSd =
          effectiveEvidenceDays > 0 && tau2 > 0
            ? Math.sqrt((effectiveB * sigma2) / effectiveEvidenceDays)
            : 0;
        posteriorSd = Math.round(rawPostSd * 10) / 10;

        interval80 = [
          Math.round((posteriorMean - 1.2816 * rawPostSd) * 10) / 10,
          Math.round((posteriorMean + 1.2816 * rawPostSd) * 10) / 10,
        ];
      } else {
        // 'fixed' mode
        posteriorMean = Math.round(shrunkDiff * 10) / 10;
        posteriorSd = null;
        interval80 = null;
        reliability = null;
      }

      // Requirement 6 / 30-2: Confidence determination
      const confidenceMode =
        options?.confidenceMode ?? mergedWeights.confidenceMode ?? 'reliability';

      let confidence: MachineConfidenceLevel = '低';
      let standardError = 0;
      const reliabilityRate = Math.round(effectiveB * 100);

      if (diffs.length > 0) {
        const mean = mState.diffSum / diffs.length;
        let varSum = 0;
        for (let i = 0; i < diffs.length; i++) {
          varSum += (diffs[i] - mean) ** 2;
        }
        const variance = varSum / Math.max(1, diffs.length - 1);
        const stdDev = Math.sqrt(variance);
        standardError = stdDev / Math.sqrt(Math.max(1, diffs.length));
      }

      if (confidenceMode === 'reliability') {
        if (reliability !== null) {
          if (reliability >= RELIABILITY_THRESHOLDS.HIGH) {
            confidence = '高';
          } else if (reliability >= RELIABILITY_THRESHOLDS.MEDIUM) {
            confidence = '中';
          } else {
            confidence = '低';
          }
        } else {
          confidence = '低';
        }
      } else {
        // 'legacy' mode (existing behavior)
        if (mergedWeights.shrinkageMode === 'fixed') {
          if (effectiveEvidenceDays >= 5 && standardError <= 650) {
            confidence = '高';
          } else if (
            effectiveEvidenceDays >= 3 ||
            (evidenceDays >= 6 && standardError <= 950)
          ) {
            confidence = '中';
          }
        } else {
          if (effectiveB >= CONFIDENCE_THRESHOLDS.HIGH) {
            confidence = '高';
          } else if (effectiveB >= CONFIDENCE_THRESHOLDS.MEDIUM) {
            confidence = '中';
          } else {
            confidence = '低';
          }
        }
      }

      // Requirement 8: 80% credible interval from posterior standard deviation
      let expectedDiffMargin80 = 0;
      let expectedDiff80Range: [number, number] = [
        Math.round(expectedDiffStd),
        Math.round(expectedDiffStd),
      ];
      if (mergedWeights.shrinkageMode === 'empirical') {
        let postVar = 0;
        if (tau2 > 0) {
          if (cohortEvidenceDays > 0) {
            const samplingVar = sigma2 / cohortEvidenceDays;
            postVar = (tau2 * samplingVar) / (tau2 + samplingVar);
          } else {
            postVar = tau2;
          }
        }
        const postSe = Math.sqrt(postVar);
        expectedDiffMargin80 = Math.round(1.28 * postSe);
        expectedDiff80Range = [
          Math.round(expectedDiffStd - expectedDiffMargin80),
          Math.round(expectedDiffStd + expectedDiffMargin80),
        ];
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
        shrinkageDiagnostics: {
          sigma2,
          tau2,
          B: shrinkageB,
          s2_r,
          tau2_r,
          B_r: rateB,
        },
        posteriorMean,
        posteriorSd,
        interval80,
        reliability,
        expectedDiffAtBaseGames,
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
          cohortAvgPayoutRate: Math.round(rawPayoutRate * 100) / 100,
          shrunkPayoutRate: Math.round(shrunkPayoutRate * 100) / 100,
          expectedDiffStd: Math.round(expectedDiffStd),
          expectedDiffActual: Math.round(expectedDiffActual),
          expectedDiffAtBaseGames,
          avgGames: Math.round(avgGames),
          shrinkageB: Math.round(shrinkageB * 1000) / 1000,
          reliabilityRate,
          expectedDiffMargin80,
          expectedDiff80Range,
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
      shrinkageDiagnostics: {
        sigma2: storeWideParams.sigma2,
        tau2: storeWideParams.tau2,
        s2_r: storeWideRateParams.s2,
        tau2_r: storeWideRateParams.tau2_r,
      },
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

