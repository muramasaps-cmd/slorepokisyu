/**
 * Setting Range & IN-Weighted Payout Estimation Engine (出率ベース設定範囲・平均設定相当推定)
 *
 * 【設計思想】
 * - 取得データはBB・RBを持たず、回転数(G数)と差枚数のみ。
 * - EM推定は回転数依存（負けたらやめる）バイアスや小台数でのばらつきに弱いが、
 *   プレイ量加重の全体出率 m = 100 * (1 + Σdiff / (3 * Σgames)) は不偏で安定。
 * - 出率 m から、仕様テーブルの公表機械割に基づき:
 *   1. 平均設定相当 (線形補間)
 *   2. 高設定（閾値H以上）の割合の範囲 [下限, 上限]
 *   3. 日単位ブロックブートストラップによる95%信頼区間
 *   4. 複数機種のIN加重合算推定
 */

import { DailyRecord } from '../data/types';
import { ModelSettingSpec } from './settingSpecs';
import { HIGH_SETTING_THRESHOLDS } from './highSettingConfig';

/**
 * LCG (Linear Congruential Generator) PRNG with fixed seed
 */
export function createSeededRandom(initialSeed = 42): () => number {
  let seed = initialSeed >>> 0;
  return function next(): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export interface FlatMachineDayRecord {
  date: string;
  machineNum: number;
  games: number;
  diff: number;
  modelName: string;
}

export interface HighSettingRange {
  minRate: number; // 0..100 (%)
  maxRate: number; // 0..100 (%)
}

export interface PeriodBreakdownItem {
  periodKey: string;
  periodLabel: string;
  machineDays: number;
  totalGames: number;
  totalDiff: number;
  payoutRate: number;
  payoutCi95: [number, number];
  settingEquivalent: number;
  settingCi95: [number, number];
  pointRange: HighSettingRange;
  ciRange: HighSettingRange;
  isWideCi: boolean;
}

export interface MachineRollingTrendPoint {
  date: string;
  [key: string]: number | string; // e.g. "machine_101": 101.5
}

export interface SettingRangeEstimationResult {
  modelName: string;
  spec: ModelSettingSpec;
  uniqueMachineCount: number;
  machineNums: number[];
  totalMachineDays: number;
  totalGames: number;
  totalDiff: number;
  uniqueDaysCount: number;
  // 出率
  overallPayoutRate: number;
  payoutCi95: [number, number];
  // 平均設定相当
  settingEquivalent: number;
  settingCi95: [number, number];
  // 高設定割合の範囲 (点推定)
  pointRange: HighSettingRange;
  // 高設定割合の範囲 (出率95%区間加味)
  ciRange: HighSettingRange;
  highThreshold: number;
  // 区間幅改善の見通し
  additionalGamesForHalfCi: number;
  additionalDaysForHalfCi: number;
  // 期間別内訳 (全体・直近30日・月別)
  periodBreakdowns: PeriodBreakdownItem[];
  // 台別移動平均推移 (7日 & 30日)
  rollingTrends7d: MachineRollingTrendPoint[];
  rollingTrends30d: MachineRollingTrendPoint[];
}

export interface MultiModelSummaryItem {
  modelName: string;
  machineCount: number;
  totalGames: number;
  totalDiff: number;
  inCoins: number;
  payoutRate: number;
  settingEquivalent: number;
}

export interface CombinedMultiModelResult {
  models: MultiModelSummaryItem[];
  totalGames: number;
  totalDiff: number;
  totalInCoins: number;
  combinedSettingEquivalent: number;
  combinedSettingCi95: [number, number];
}

/**
 * プレイ量加重の全体出率 m を算出
 * m = 100 * (1 + Σ差枚 / (BET枚数 * ΣG数))
 */
export function calculateOverallPayoutRate(
  records: Array<{ games: number; diff: number }>
): number {
  let sumG = 0;
  let sumD = 0;
  for (const r of records) {
    sumG += r.games;
    sumD += r.diff;
  }
  if (sumG <= 0) return 100.0;
  const inCoins = sumG * HIGH_SETTING_THRESHOLDS.BET_PER_GAME;
  const rate = 100.0 * (1.0 + sumD / inCoins);
  return Number(rate.toFixed(4));
}

/**
 * 日単位ブロックブートストラップ（ブロック長7日、2000回、シード固定）による
 * 全体出率 m の 95% 信頼区間算出
 */
export function calculateBlockBootstrapPayoutCi(
  records: Array<{ date: string; games: number; diff: number }>,
  options: {
    blockLength?: number;
    reps?: number;
    seed?: number;
  } = {}
): [number, number] {
  const reps = options.reps ?? 2000;
  const blockLength = options.blockLength ?? 7;
  const seed = options.seed ?? 42;

  // 日ごとに G数 と 差枚数 を事前集計
  const dayMap = new Map<string, { games: number; diff: number }>();
  for (const r of records) {
    const existing = dayMap.get(r.date);
    if (!existing) {
      dayMap.set(r.date, { games: r.games, diff: r.diff });
    } else {
      existing.games += r.games;
      existing.diff += r.diff;
    }
  }

  const sortedDates = Array.from(dayMap.keys()).sort();
  const T = sortedDates.length;

  if (T === 0) return [100.0, 100.0];
  if (T === 1) {
    const single = calculateOverallPayoutRate(records);
    return [single, single];
  }

  const daySummaries = sortedDates.map((d) => dayMap.get(d)!);
  const effectiveBlockLen = Math.min(blockLength, T);
  const numBlocks = T - effectiveBlockLen + 1;
  const numBlocksToSample = Math.ceil(T / effectiveBlockLen);
  const rng = createSeededRandom(seed);
  const samples: number[] = new Array(reps);

  for (let b = 0; b < reps; b++) {
    let bGames = 0;
    let bDiff = 0;
    let count = 0;
    for (let nb = 0; nb < numBlocksToSample && count < T; nb++) {
      const sIdx = Math.floor(rng() * numBlocks);
      for (let k = 0; k < effectiveBlockLen && count < T; k++) {
        const item = daySummaries[sIdx + k];
        bGames += item.games;
        bDiff += item.diff;
        count++;
      }
    }
    if (bGames <= 0) {
      samples[b] = 100.0;
    } else {
      samples[b] = 100.0 * (1.0 + bDiff / (bGames * HIGH_SETTING_THRESHOLDS.BET_PER_GAME));
    }
  }

  samples.sort((a, b) => a - b);
  const lowerIdx = Math.floor(0.025 * reps);
  const upperIdx = Math.min(reps - 1, Math.floor(0.975 * reps));

  return [
    Number(samples[lowerIdx].toFixed(4)),
    Number(samples[upperIdx].toFixed(4)),
  ];
}

/**
 * 出率 m を機種仕様テーブルの機械割から線形補間して平均設定相当に換算
 * 範囲外は両端に寄せる。設定が欠けている機種も仕様配列の順序に従う。
 */
export function interpolateSettingEquivalent(
  payoutRate: number,
  spec: ModelSettingSpec
): number {
  if (!spec || !spec.settings || spec.settings.length === 0) {
    return 1.0;
  }
  const settings = [...spec.settings].sort((a, b) => a.payoutRate - b.payoutRate);
  const n = settings.length;
  if (n === 1) return settings[0].settingNum;

  const minSetting = settings[0];
  const maxSetting = settings[n - 1];

  if (payoutRate <= minSetting.payoutRate) {
    return minSetting.settingNum;
  }
  if (payoutRate >= maxSetting.payoutRate) {
    return maxSetting.settingNum;
  }

  for (let i = 0; i < n - 1; i++) {
    const sCur = settings[i];
    const sNext = settings[i + 1];
    if (payoutRate >= sCur.payoutRate && payoutRate <= sNext.payoutRate) {
      const rSpan = sNext.payoutRate - sCur.payoutRate;
      if (rSpan <= 0) return sCur.settingNum;
      const t = (payoutRate - sCur.payoutRate) / rSpan;
      const equiv = sCur.settingNum + t * (sNext.settingNum - sCur.settingNum);
      return Number(equiv.toFixed(2));
    }
  }

  return maxSetting.settingNum;
}

/**
 * 高設定（閾値H以上、既定4）の割合の範囲 [下限, 上限] を算出
 *
 * 下限 = max(0, (m - R_(H-1)) / (R_最大 - R_(H-1)))
 * 上限 = min(1, (m - R_最小) / (R_H - R_最小))
 *
 * (R は仕様の機械割、R_(H-1) は高設定でない設定のうち最高、R_H は高設定のうち最低)
 */
export function calculateHighSettingRange(
  payoutRate: number,
  spec: ModelSettingSpec,
  thresholdSettingNum = 4
): HighSettingRange {
  if (!spec || !spec.settings || spec.settings.length === 0) {
    return { minRate: 0, maxRate: 100 };
  }

  const sortedSettings = [...spec.settings].sort((a, b) => a.settingNum - b.settingNum);
  const lowSettings = sortedSettings.filter((s) => s.settingNum < thresholdSettingNum);
  const highSettings = sortedSettings.filter((s) => s.settingNum >= thresholdSettingNum);

  if (lowSettings.length === 0) {
    // 全てが高設定
    return { minRate: 100, maxRate: 100 };
  }
  if (highSettings.length === 0) {
    // 高設定が存在しない
    return { minRate: 0, maxRate: 0 };
  }

  // R_最小: 全設定中の最低機械割
  const rMin = Math.min(...sortedSettings.map((s) => s.payoutRate));
  // R_最大: 全設定中の最高機械割
  const rMax = Math.max(...sortedSettings.map((s) => s.payoutRate));
  // R_(H-1): 高設定でない設定のうち最高機械割
  const rHMinus1 = Math.max(...lowSettings.map((s) => s.payoutRate));
  // R_H: 高設定のうち最低機械割
  const rH = Math.min(...highSettings.map((s) => s.payoutRate));

  // 下限計算
  let minFrac = 0;
  const denomMin = rMax - rHMinus1;
  if (denomMin > 0) {
    minFrac = Math.max(0, Math.min(1, (payoutRate - rHMinus1) / denomMin));
  } else {
    minFrac = payoutRate >= rMax ? 1 : 0;
  }

  // 上限計算
  let maxFrac = 1;
  const denomMax = rH - rMin;
  if (denomMax > 0) {
    maxFrac = Math.min(1, Math.max(0, (payoutRate - rMin) / denomMax));
  } else {
    maxFrac = payoutRate >= rH ? 1 : 0;
  }

  return {
    minRate: Number((minFrac * 100).toFixed(1)),
    maxRate: Number((maxFrac * 100).toFixed(1)),
  };
}

/**
 * 対象機種の全台日レコードをフラットに抽出
 */
export function extractModelFlatRecords(
  modelName: string,
  dailyRecords: DailyRecord[]
): FlatMachineDayRecord[] {
  const results: FlatMachineDayRecord[] = [];
  if (!modelName) return results;

  for (const dr of dailyRecords) {
    const list = dr.machines || (dr as any).machineRecords;
    if (list) {
      for (const mr of list) {
        if (mr.modelName === modelName) {
          results.push({
            date: dr.date,
            machineNum: mr.machineNum,
            games: mr.games,
            diff: mr.diff,
            modelName: mr.modelName,
          });
        }
      }
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 台別の移動IN加重出率推移 (7日 / 30日)
 */
export function calculateMachineRollingTrends(
  records: FlatMachineDayRecord[],
  windowDays = 7
): MachineRollingTrendPoint[] {
  if (records.length === 0) return [];

  // 日付一覧を取得
  const uniqueDates = Array.from(new Set(records.map((r) => r.date))).sort();
  const machineNums = Array.from(new Set(records.map((r) => r.machineNum))).sort((a, b) => a - b);

  const dateToMachineRecs = new Map<string, Map<number, { games: number; diff: number }>>();
  for (const r of records) {
    if (!dateToMachineRecs.has(r.date)) {
      dateToMachineRecs.set(r.date, new Map());
    }
    dateToMachineRecs.get(r.date)!.set(r.machineNum, { games: r.games, diff: r.diff });
  }

  const result: MachineRollingTrendPoint[] = [];

  for (let i = 0; i < uniqueDates.length; i++) {
    const curDate = uniqueDates[i];
    // 過去 windowDays 日以内の日付を対象
    const startIdx = Math.max(0, i - windowDays + 1);
    const windowDateSlice = uniqueDates.slice(startIdx, i + 1);

    const point: MachineRollingTrendPoint = { date: curDate };

    for (const mNum of machineNums) {
      let g = 0;
      let d = 0;
      for (const wd of windowDateSlice) {
        const mData = dateToMachineRecs.get(wd)?.get(mNum);
        if (mData) {
          g += mData.games;
          d += mData.diff;
        }
      }
      if (g >= 500) {
        const rate = 100 * (1 + d / (g * HIGH_SETTING_THRESHOLDS.BET_PER_GAME));
        point[`machine_${mNum}`] = Number(rate.toFixed(2));
      }
    }

    result.push(point);
  }

  return result;
}

/**
 * 期間別 (全体・直近30日・各月) の出率・設定・範囲の内訳を計算
 */
export function calculatePeriodRangeBreakdowns(
  records: FlatMachineDayRecord[],
  spec: ModelSettingSpec,
  highThreshold = 4,
  reps = 1000
): PeriodBreakdownItem[] {
  if (records.length === 0) return [];

  const uniqueDates = Array.from(new Set(records.map((r) => r.date))).sort();
  const maxDate = uniqueDates[uniqueDates.length - 1];

  // 直近30日（最大営業日から30日前まで）
  const maxDateObj = new Date(maxDate);
  const cutoff30d = new Date(maxDateObj.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  // 月ごとにグループ化
  const monthMap = new Map<string, FlatMachineDayRecord[]>();
  for (const r of records) {
    const ym = r.date.slice(0, 7);
    if (!monthMap.has(ym)) monthMap.set(ym, []);
    monthMap.get(ym)!.push(r);
  }

  const sortedMonths = Array.from(monthMap.keys()).sort().reverse();

  interface PeriodDef {
    key: string;
    label: string;
    records: FlatMachineDayRecord[];
  }

  const periods: PeriodDef[] = [
    { key: 'overall', label: '全体 (全期間)', records },
    {
      key: 'last30d',
      label: '直近30日',
      records: records.filter((r) => r.date >= cutoff30d),
    },
    ...sortedMonths.map((ym) => ({
      key: ym,
      label: `${ym.replace('-', '年')}月`,
      records: monthMap.get(ym)!,
    })),
  ];

  return periods
    .filter((p) => p.records.length > 0)
    .map((p) => {
      const payout = calculateOverallPayoutRate(p.records);
      const ci = calculateBlockBootstrapPayoutCi(p.records, { reps, blockLength: 7 });
      const settingEquiv = interpolateSettingEquivalent(payout, spec);
      const settingCi: [number, number] = [
        interpolateSettingEquivalent(ci[0], spec),
        interpolateSettingEquivalent(ci[1], spec),
      ];

      const pRange = calculateHighSettingRange(payout, spec, highThreshold);
      const ciRangeLow = calculateHighSettingRange(ci[0], spec, highThreshold);
      const ciRangeHigh = calculateHighSettingRange(ci[1], spec, highThreshold);
      const ciRange: HighSettingRange = {
        minRate: Math.min(ciRangeLow.minRate, ciRangeHigh.minRate),
        maxRate: Math.max(ciRangeLow.maxRate, ciRangeHigh.maxRate),
      };

      const sumG = p.records.reduce((acc, r) => acc + r.games, 0);
      const sumD = p.records.reduce((acc, r) => acc + r.diff, 0);
      const ciWidth = Number((ci[1] - ci[0]).toFixed(2));
      const isWideCi = ciWidth >= 2.5 || p.records.length < 30;

      return {
        periodKey: p.key,
        periodLabel: p.label,
        machineDays: p.records.length,
        totalGames: sumG,
        totalDiff: sumD,
        payoutRate: payout,
        payoutCi95: ci,
        settingEquivalent: settingEquiv,
        settingCi95: settingCi,
        pointRange: pRange,
        ciRange,
        isWideCi,
      };
    });
}

/**
 * 主推定（出率のみベース）の全集計実行関数
 */
export function estimateModelSettingRange(
  modelName: string,
  dailyRecords: DailyRecord[],
  spec: ModelSettingSpec,
  options: {
    highThreshold?: number;
    bootstrapReps?: number;
    bootstrapSeed?: number;
  } = {}
): SettingRangeEstimationResult {
  const highThreshold = options.highThreshold ?? 4;
  const reps = options.bootstrapReps ?? 2000;
  const seed = options.bootstrapSeed ?? 42;

  const flatRecords = extractModelFlatRecords(modelName, dailyRecords);
  const totalMachineDays = flatRecords.length;
  const machineNums = Array.from(new Set(flatRecords.map((r) => r.machineNum))).sort((a, b) => a - b);
  const uniqueMachineCount = machineNums.length;
  const uniqueDaysCount = new Set(flatRecords.map((r) => r.date)).size;

  let totalGames = 0;
  let totalDiff = 0;
  for (const r of flatRecords) {
    totalGames += r.games;
    totalDiff += r.diff;
  }

  // 1. 全体出率 m
  const overallPayoutRate = calculateOverallPayoutRate(flatRecords);

  // 2. 95%信頼区間 (ブロックブートストラップ)
  const payoutCi95 = calculateBlockBootstrapPayoutCi(flatRecords, {
    reps,
    seed,
    blockLength: 7,
  });

  // 3. 平均設定相当 (線形補間)
  const settingEquivalent = interpolateSettingEquivalent(overallPayoutRate, spec);
  const settingCi95: [number, number] = [
    interpolateSettingEquivalent(payoutCi95[0], spec),
    interpolateSettingEquivalent(payoutCi95[1], spec),
  ];

  // 4. 高設定割合の範囲
  const pointRange = calculateHighSettingRange(overallPayoutRate, spec, highThreshold);
  const ciRangeLow = calculateHighSettingRange(payoutCi95[0], spec, highThreshold);
  const ciRangeHigh = calculateHighSettingRange(payoutCi95[1], spec, highThreshold);
  const ciRange: HighSettingRange = {
    minRate: Math.min(pointRange.minRate, ciRangeLow.minRate, ciRangeHigh.minRate),
    maxRate: Math.max(pointRange.maxRate, ciRangeLow.maxRate, ciRangeHigh.maxRate),
  };

  // 5. 区間幅半減に必要な総G数・日数見通し
  // 誤差は総G数の平方根に反比例 -> 誤差半減には4倍のG数が必要 -> 追加は 3 * totalGames
  const additionalGamesForHalfCi = totalGames * 3;
  const additionalDaysForHalfCi = uniqueDaysCount > 0 ? uniqueDaysCount * 3 : 0;

  // 6. 期間別内訳
  const periodBreakdowns = calculatePeriodRangeBreakdowns(
    flatRecords,
    spec,
    highThreshold,
    Math.min(reps, 1000)
  );

  // 7. 台別推移 (7日 & 30日 移動)
  const rollingTrends7d = calculateMachineRollingTrends(flatRecords, 7);
  const rollingTrends30d = calculateMachineRollingTrends(flatRecords, 30);

  return {
    modelName,
    spec,
    uniqueMachineCount,
    machineNums,
    totalMachineDays,
    totalGames,
    totalDiff,
    uniqueDaysCount,
    overallPayoutRate,
    payoutCi95,
    settingEquivalent,
    settingCi95,
    pointRange,
    ciRange,
    highThreshold,
    additionalGamesForHalfCi,
    additionalDaysForHalfCi,
    periodBreakdowns,
    rollingTrends7d,
    rollingTrends30d,
  };
}

/**
 * 同じ店の複数機種のまとめ推定
 * 機種ごとの「平均設定相当」を、機種ごとのIN枚数で重み付けして合算。
 * 日単位のブロックブートストラップで合成区間を算出。
 */
export function calculateMultiModelCombinedEstimation(
  selectedModels: Array<{
    modelName: string;
    spec: ModelSettingSpec;
  }>,
  dailyRecords: DailyRecord[],
  options: {
    reps?: number;
    seed?: number;
    blockLength?: number;
  } = {}
): CombinedMultiModelResult {
  const reps = options.reps ?? 2000;
  const seed = options.seed ?? 42;
  const blockLength = options.blockLength ?? 7;

  const modelSummaries: MultiModelSummaryItem[] = [];

  // 各機種のレコードを抽出
  const modelRecordsMap = new Map<string, FlatMachineDayRecord[]>();
  for (const { modelName } of selectedModels) {
    const list = extractModelFlatRecords(modelName, dailyRecords);
    modelRecordsMap.set(modelName, list);
  }

  let totalGamesAll = 0;
  let totalDiffAll = 0;
  let totalInCoinsAll = 0;
  let weightedSettingSum = 0;

  for (const { modelName, spec } of selectedModels) {
    const recs = modelRecordsMap.get(modelName) || [];
    let g = 0;
    let d = 0;
    const machines = new Set<number>();
    for (const r of recs) {
      g += r.games;
      d += r.diff;
      machines.add(r.machineNum);
    }
    const inCoins = g * HIGH_SETTING_THRESHOLDS.BET_PER_GAME;
    const rate = calculateOverallPayoutRate(recs);
    const equiv = interpolateSettingEquivalent(rate, spec);

    totalGamesAll += g;
    totalDiffAll += d;
    totalInCoinsAll += inCoins;
    weightedSettingSum += inCoins * equiv;

    modelSummaries.push({
      modelName,
      machineCount: machines.size,
      totalGames: g,
      totalDiff: d,
      inCoins,
      payoutRate: rate,
      settingEquivalent: equiv,
    });
  }

  const combinedSetting = totalInCoinsAll > 0 ? weightedSettingSum / totalInCoinsAll : 1.0;

  // ブロックブートストラップで合成設定区間を算出
  // 全機種の日付の和集合
  const allDatesSet = new Set<string>();
  for (const dr of dailyRecords) {
    allDatesSet.add(dr.date);
  }
  const uniqueDates = Array.from(allDatesSet).sort();
  const T = uniqueDates.length;

  if (T <= 1 || totalInCoinsAll === 0) {
    return {
      models: modelSummaries,
      totalGames: totalGamesAll,
      totalDiff: totalDiffAll,
      totalInCoins: totalInCoinsAll,
      combinedSettingEquivalent: Number(combinedSetting.toFixed(2)),
      combinedSettingCi95: [
        Number(combinedSetting.toFixed(2)),
        Number(combinedSetting.toFixed(2)),
      ],
    };
  }

  // 機種×日ごとの集計マップ
  const modelDayAgg = new Map<string, Map<string, { games: number; diff: number }>>();
  for (const { modelName } of selectedModels) {
    const dayMap = new Map<string, { games: number; diff: number }>();
    const recs = modelRecordsMap.get(modelName) || [];
    for (const r of recs) {
      const cur = dayMap.get(r.date) || { games: 0, diff: 0 };
      cur.games += r.games;
      cur.diff += r.diff;
      dayMap.set(r.date, cur);
    }
    modelDayAgg.set(modelName, dayMap);
  }

  const effectiveBlockLen = Math.min(blockLength, T);
  const numBlocks = T - effectiveBlockLen + 1;
  const numBlocksToSample = Math.ceil(T / effectiveBlockLen);
  const rng = createSeededRandom(seed);
  const bootstrapCombinedSettings: number[] = new Array(reps);

  for (let b = 0; b < reps; b++) {
    // 日付ブロックをサンプリング
    const sampledDates: string[] = [];
    for (let nb = 0; nb < numBlocksToSample && sampledDates.length < T; nb++) {
      const sIdx = Math.floor(rng() * numBlocks);
      for (let k = 0; k < effectiveBlockLen && sampledDates.length < T; k++) {
        sampledDates.push(uniqueDates[sIdx + k]);
      }
    }

    let bWeightedSettingSum = 0;
    let bTotalInCoins = 0;

    for (const { modelName, spec } of selectedModels) {
      const dayMap = modelDayAgg.get(modelName)!;
      let mGames = 0;
      let mDiff = 0;
      for (const d of sampledDates) {
        const item = dayMap.get(d);
        if (item) {
          mGames += item.games;
          mDiff += item.diff;
        }
      }
      const inCoins = mGames * HIGH_SETTING_THRESHOLDS.BET_PER_GAME;
      if (inCoins > 0) {
        const rate = 100 * (1 + mDiff / inCoins);
        const equiv = interpolateSettingEquivalent(rate, spec);
        bWeightedSettingSum += inCoins * equiv;
        bTotalInCoins += inCoins;
      }
    }

    if (bTotalInCoins > 0) {
      bootstrapCombinedSettings[b] = bWeightedSettingSum / bTotalInCoins;
    } else {
      bootstrapCombinedSettings[b] = combinedSetting;
    }
  }

  bootstrapCombinedSettings.sort((a, b) => a - b);
  const lowerIdx = Math.floor(0.025 * reps);
  const upperIdx = Math.min(reps - 1, Math.floor(0.975 * reps));

  return {
    models: modelSummaries,
    totalGames: totalGamesAll,
    totalDiff: totalDiffAll,
    totalInCoins: totalInCoinsAll,
    combinedSettingEquivalent: Number(combinedSetting.toFixed(2)),
    combinedSettingCi95: [
      Number(bootstrapCombinedSettings[lowerIdx].toFixed(2)),
      Number(bootstrapCombinedSettings[upperIdx].toFixed(2)),
    ],
  };
}
