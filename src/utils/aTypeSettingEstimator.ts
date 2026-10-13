/**
 * A-Type Setting Distribution Estimator (Aタイプ出率・設定値分布推定エンジン)
 *
 * 【概要】
 * Aタイプ（ノーマル機）の公表機械割スペックと観測された回転数(G数)・差枚数（出率）から、
 * ベイズ推定・正規尤度モデルに基づいて設定1〜6の推定確率分布を算出します。
 *
 * 【前提条件】
 * - 3枚掛け固定（BET 3枚）
 * - IN枚数 = games * 3
 * - OUT枚数 = games * 3 + diffCoins
 * - 1Gあたりの差枚分散 σ² ≈ 8.0（標準偏差 σ ≈ 2.83枚/G）
 * - 標本出率の標準誤差 SE = (100 * σ) / (3 * √games) (%)
 */

import { AggregatedModelStat, DailyRecord, DailyMachineRecord } from '../data/types';
import { isAType } from './modelFilterUtils';

/** 各設定（1〜6）の公表機械割 (%) */
export type SettingSpecs = Record<number, number>;

export interface ATypeCatalogEntry {
  keyword: RegExp;
  displayName: string;
  specs: SettingSpecs;
}

/** 主要Aタイプ機種の公表機械割カタログ */
export const KNOWN_A_TYPE_CATALOG: ATypeCatalogEntry[] = [
  {
    keyword: /マイジャグラー|my juggler/i,
    displayName: 'マイジャグラーV',
    specs: { 1: 97.0, 2: 98.0, 3: 99.9, 4: 102.8, 5: 105.3, 6: 109.4 },
  },
  {
    keyword: /アイムジャグラー|im juggler/i,
    displayName: 'アイムジャグラーEX',
    specs: { 1: 97.0, 2: 98.0, 3: 99.5, 4: 101.1, 5: 102.8, 6: 105.5 },
  },
  {
    keyword: /ファンキー|funky/i,
    displayName: 'ファンキージャグラー2',
    specs: { 1: 97.0, 2: 98.5, 3: 100.2, 4: 102.0, 5: 104.3, 6: 109.0 },
  },
  {
    keyword: /ゴーゴー|gogo juggler/i,
    displayName: 'ゴーゴージャグラー3',
    specs: { 1: 97.0, 2: 98.2, 3: 99.8, 4: 102.1, 5: 104.2, 6: 106.5 },
  },
  {
    keyword: /ハッピー|happy juggler/i,
    displayName: 'ハッピージャグラーV III',
    specs: { 1: 97.0, 2: 97.9, 3: 99.9, 4: 102.9, 5: 105.8, 6: 108.4 },
  },
  {
    keyword: /ミスター|mr\.? juggler/i,
    displayName: 'ミスタージャグラー',
    specs: { 1: 97.0, 2: 98.1, 3: 100.1, 4: 102.6, 5: 105.4, 6: 108.3 },
  },
  {
    keyword: /ハナハナ|キングハナ|ドラゴンハナ|ホウオウ/i,
    displayName: 'キングハナハナ-30',
    specs: { 1: 97.0, 2: 99.0, 3: 101.0, 4: 104.0, 5: 107.0, 6: 110.0 },
  },
  {
    keyword: /新ハナビ|花火/i,
    displayName: '新ハナビ',
    specs: { 1: 98.0, 2: 100.0, 3: 102.0, 4: 104.0, 5: 106.0, 6: 108.0 },
  },
  {
    keyword: /バーサス|versus/i,
    displayName: 'バーサスリヴァイズ',
    specs: { 1: 98.0, 2: 100.0, 3: 102.0, 4: 104.0, 5: 106.0, 6: 108.0 },
  },
  {
    keyword: /クランキー|cranky/i,
    displayName: 'クランキークレスト',
    specs: { 1: 98.0, 2: 100.0, 3: 102.0, 4: 104.0, 5: 106.0, 6: 108.0 },
  },
  {
    keyword: /パルサー|palsar/i,
    displayName: 'ニューパルサーSP',
    specs: { 1: 97.5, 2: 98.8, 3: 100.5, 4: 103.2, 5: 105.5, 6: 108.0 },
  },
  {
    keyword: /ガメラ|gamera/i,
    displayName: 'ガメラ2',
    specs: { 1: 98.0, 2: 99.5, 3: 102.0, 4: 104.5, 5: 107.0, 6: 110.0 },
  },
  {
    keyword: /ディスクアップ|disc up/i,
    displayName: 'ディスクアップ2',
    specs: { 1: 99.4, 2: 101.1, 3: 103.0, 4: 105.2, 5: 107.5, 6: 109.8 },
  },
];

/** 標準Aタイプのデフォルトスペック（カタログに一致しない場合） */
export const DEFAULT_A_TYPE_SPECS: SettingSpecs = {
  1: 97.0,
  2: 98.5,
  3: 100.5,
  4: 103.0,
  5: 105.5,
  6: 109.0,
};

export interface ModelSpecsResolution {
  modelName: string;
  displayName: string;
  specs: SettingSpecs;
  isKnownCatalog: boolean;
}

/** 機種名から公表機械割スペックを取得 */
export function resolveATypeSpecs(modelName: string): ModelSpecsResolution {
  if (!modelName) {
    return {
      modelName,
      displayName: '標準Aタイプ',
      specs: DEFAULT_A_TYPE_SPECS,
      isKnownCatalog: false,
    };
  }

  for (const entry of KNOWN_A_TYPE_CATALOG) {
    if (entry.keyword.test(modelName)) {
      return {
        modelName,
        displayName: entry.displayName,
        specs: entry.specs,
        isKnownCatalog: true,
      };
    }
  }

  return {
    modelName,
    displayName: modelName,
    specs: DEFAULT_A_TYPE_SPECS,
    isKnownCatalog: false,
  };
}

export interface SettingProbabilityItem {
  setting: number;
  theoreticalPayout: number;
  probability: number; // 0.0 - 100.0 (%)
  estimatedMachineCount?: number; // 分布台数換算
}

export interface SettingDistributionResult {
  payoutRate: number; // 観測出率 (%)
  totalGames: number; // 観測G数
  totalDiffCoins: number; // 観測差枚数
  standardError: number; // 標本標準誤差 SE (%)
  probabilities: Record<number, number>; // 設定1〜6の確率 (%)
  items: SettingProbabilityItem[];
  expectedSetting: number; // 推定期待設定値 (1.0〜6.0)
  mostLikelySetting: number; // 最尤設定 (1〜6)
  highSettingRate: number; // 設定4以上の合算確率 (%)
  topSettingRate: number; // 設定5・6の合算確率 (%)
  confidenceLevel: '高' | '中' | '低';
  specs: SettingSpecs;
  isKnownCatalog: boolean;
}

export interface EstimateOptions {
  /** ホール事前分布（指定なしは無情報一様分布 1/6） */
  priorDistribution?: Record<number, number>;
  /** 機種スペックの手動オーバーライド */
  customSpecs?: SettingSpecs;
}

/**
 * 回転数と出率（機械割）から設定1〜6の推定確率分布を計算
 */
export function estimateSettingDistributionFromPayout(
  games: number,
  payoutRate: number,
  specs: SettingSpecs = DEFAULT_A_TYPE_SPECS,
  options?: EstimateOptions
): SettingDistributionResult {
  const safeGames = Math.max(0, Math.round(games));
  const diffCoins = Math.round(((payoutRate - 100) / 100) * (safeGames * 3));

  // G数が極小の場合は一様分布
  if (safeGames < 100) {
    const uniformProb = 100 / 6;
    const items: SettingProbabilityItem[] = [1, 2, 3, 4, 5, 6].map((s) => ({
      setting: s,
      theoreticalPayout: specs[s] ?? 100,
      probability: Math.round(uniformProb * 10) / 10,
    }));
    const probs: Record<number, number> = {};
    items.forEach((it) => (probs[it.setting] = it.probability));

    return {
      payoutRate: Math.round(payoutRate * 10) / 10,
      totalGames: safeGames,
      totalDiffCoins: diffCoins,
      standardError: 99.9,
      probabilities: probs,
      items,
      expectedSetting: 3.5,
      mostLikelySetting: 1,
      highSettingRate: 50.0,
      topSettingRate: 33.3,
      confidenceLevel: '低',
      specs,
      isKnownCatalog: true,
    };
  }

  // 1Gあたり差枚分散 σ = 2.83枚/G
  // 出率の標準誤差 SE = (100 * 2.83) / (3 * √games) (%)
  const sigmaPerGame = 2.83;
  const rawSE = (100 * sigmaPerGame) / (3 * Math.sqrt(safeGames));
  // 稼働が膨大な場合でもホール環境・ヒキの限界ばらつきとして下限0.15%を設定
  const se = Math.max(0.15, rawSE);

  // 事前分布
  const prior = options?.priorDistribution || {
    1: 1 / 6,
    2: 1 / 6,
    3: 1 / 6,
    4: 1 / 6,
    5: 1 / 6,
    6: 1 / 6,
  };

  // 各設定の対数尤度を算出
  const logLikelihoods: Record<number, number> = {};
  let maxLogL = -Infinity;

  for (let s = 1; s <= 6; s++) {
    const theoretical = specs[s] ?? 100;
    const delta = payoutRate - theoretical;
    const logL = -(delta * delta) / (2 * se * se) + Math.log(prior[s] || 1e-6);
    logLikelihoods[s] = logL;
    if (logL > maxLogL) {
      maxLogL = logL;
    }
  }

  // Log-sum-exp正規化
  let sumWeight = 0;
  const weights: Record<number, number> = {};
  for (let s = 1; s <= 6; s++) {
    const w = Math.exp(logLikelihoods[s] - maxLogL);
    weights[s] = w;
    sumWeight += w;
  }

  const probabilities: Record<number, number> = {};
  const items: SettingProbabilityItem[] = [];
  let expectedSetting = 0;
  let mostLikelySetting = 1;
  let highestProb = -1;

  for (let s = 1; s <= 6; s++) {
    const prob = sumWeight > 0 ? (weights[s] / sumWeight) * 100 : 100 / 6;
    const roundedProb = Math.round(prob * 10) / 10;
    probabilities[s] = roundedProb;
    expectedSetting += s * (prob / 100);

    if (prob > highestProb) {
      highestProb = prob;
      mostLikelySetting = s;
    }

    items.push({
      setting: s,
      theoreticalPayout: specs[s] ?? 100,
      probability: roundedProb,
    });
  }

  const highSettingRate =
    Math.round(((probabilities[4] + probabilities[5] + probabilities[6])) * 10) / 10;
  const topSettingRate =
    Math.round(((probabilities[5] + probabilities[6])) * 10) / 10;

  // 信頼度判定 (総G数に基づく)
  let confidenceLevel: '高' | '中' | '低' = '低';
  if (safeGames >= 15000) {
    confidenceLevel = '高';
  } else if (safeGames >= 4000) {
    confidenceLevel = '中';
  }

  return {
    payoutRate: Math.round(payoutRate * 10) / 10,
    totalGames: safeGames,
    totalDiffCoins: diffCoins,
    standardError: Math.round(se * 100) / 100,
    probabilities,
    items,
    expectedSetting: Math.round(expectedSetting * 10) / 10,
    mostLikelySetting,
    highSettingRate,
    topSettingRate,
    confidenceLevel,
    specs,
    isKnownCatalog: true,
  };
}

export interface ModelAggregatedSettingAnalysis {
  modelName: string;
  displayName: string;
  isAType: boolean;
  specs: SettingSpecs;
  isKnownCatalog: boolean;
  overall: SettingDistributionResult;
  eventDays?: SettingDistributionResult | null;
  normalDays?: SettingDistributionResult | null;
  settingLiftDelta?: number | null; // 旧特日と通常日の期待設定値の差 (特日 - 通常)
  machineDistributions?: {
    machineNum: number;
    games: number;
    diff: number;
    payoutRate: number;
    distribution: SettingDistributionResult;
  }[];
  hallSettingCounts?: Record<number, number>; // 設定1〜6の推定台数配分
}

/**
 * AggregatedModelStat から Aタイプの詳細設定値分布を推定
 */
export function estimateModelSettingAnalysis(
  stat: AggregatedModelStat,
  options?: EstimateOptions
): ModelAggregatedSettingAnalysis | null {
  if (!stat || !isAType(stat.modelName)) {
    return null;
  }

  const resolution = resolveATypeSpecs(stat.modelName);
  const specs = options?.customSpecs || resolution.specs;

  // 1. 全体集計からの出率・推定
  // 総IN枚数 = (avgGames * totalMachineDays) * 3
  const totalGames = Math.max(0, Math.round(stat.avgGames * stat.totalMachineDays));
  const totalDiff = stat.totalDiffCoins;
  const totalIn = totalGames * 3;
  const totalOut = totalIn + totalDiff;
  const overallPayout = totalIn > 0 ? (totalOut / totalIn) * 100 : 100;

  const overall = estimateSettingDistributionFromPayout(
    totalGames,
    overallPayout,
    specs,
    options
  );
  overall.isKnownCatalog = resolution.isKnownCatalog;

  // 2. 旧イベント日（特日）の集計
  let eventDays: SettingDistributionResult | null = null;
  if (stat.eventDaysCount > 0) {
    const eventHistory = stat.dailyHistory.filter((d) => d.isOldEventDay);
    let eventGamesSum = 0;
    let eventDiffSum = 0;
    eventHistory.forEach((dh) => {
      const g = dh.avgGames * dh.totalMachines;
      eventGamesSum += g;
      eventDiffSum += dh.totalDiffCoins;
    });

    if (eventGamesSum > 0) {
      const eventIn = eventGamesSum * 3;
      const eventOut = eventIn + eventDiffSum;
      const eventPayout = (eventOut / eventIn) * 100;
      eventDays = estimateSettingDistributionFromPayout(
        eventGamesSum,
        eventPayout,
        specs,
        options
      );
      eventDays.isKnownCatalog = resolution.isKnownCatalog;
    }
  }

  // 3. 通常日の集計
  let normalDays: SettingDistributionResult | null = null;
  if (stat.normalDaysCount > 0) {
    const normalHistory = stat.dailyHistory.filter((d) => !d.isOldEventDay);
    let normalGamesSum = 0;
    let normalDiffSum = 0;
    normalHistory.forEach((dh) => {
      const g = dh.avgGames * dh.totalMachines;
      normalGamesSum += g;
      normalDiffSum += dh.totalDiffCoins;
    });

    if (normalGamesSum > 0) {
      const normalIn = normalGamesSum * 3;
      const normalOut = normalIn + normalDiffSum;
      const normalPayout = (normalOut / normalIn) * 100;
      normalDays = estimateSettingDistributionFromPayout(
        normalGamesSum,
        normalPayout,
        specs,
        options
      );
      normalDays.isKnownCatalog = resolution.isKnownCatalog;
    }
  }

  // 特日 vs 通常日の推定設定値リフト (段階差)
  let settingLiftDelta: number | null = null;
  if (eventDays && normalDays) {
    settingLiftDelta =
      Math.round((eventDays.expectedSetting - normalDays.expectedSetting) * 10) / 10;
  }

  // 平均台数あたりの設定別台数配分
  const hallSettingCounts: Record<number, number> = {};
  const avgMachines = stat.avgMachinesPerDay || 1;
  for (let s = 1; s <= 6; s++) {
    const count = (overall.probabilities[s] / 100) * avgMachines;
    hallSettingCounts[s] = Math.round(count * 10) / 10;
  }

  // itemsに推定台数を反映
  overall.items.forEach((it) => {
    it.estimatedMachineCount = hallSettingCounts[it.setting];
  });

  return {
    modelName: stat.modelName,
    displayName: resolution.displayName,
    isAType: true,
    specs,
    isKnownCatalog: resolution.isKnownCatalog,
    overall,
    eventDays,
    normalDays,
    settingLiftDelta,
    hallSettingCounts,
  };
}

/**
 * 日別台番レコード群から特定のAタイプ機種の台番号別設定推定を生成
 */
export function estimateMachinesSettingDistribution(
  modelName: string,
  dailyRecords: DailyRecord[],
  options?: EstimateOptions
): {
  machineNum: number;
  totalGames: number;
  totalDiff: number;
  payoutRate: number;
  daysCount: number;
  distribution: SettingDistributionResult;
}[] {
  if (!modelName || !dailyRecords || !isAType(modelName)) return [];

  const resolution = resolveATypeSpecs(modelName);
  const specs = options?.customSpecs || resolution.specs;

  const machineMap = new Map<number, { games: number; diff: number; days: number }>();

  dailyRecords.forEach((record) => {
    if (!record.machines) return;
    record.machines.forEach((m) => {
      if (m.modelName.trim().toLowerCase() === modelName.trim().toLowerCase()) {
        const cur = machineMap.get(m.machineNum) || { games: 0, diff: 0, days: 0 };
        cur.games += m.games || 0;
        cur.diff += m.diff || 0;
        cur.days += 1;
        machineMap.set(m.machineNum, cur);
      }
    });
  });

  const results: {
    machineNum: number;
    totalGames: number;
    totalDiff: number;
    payoutRate: number;
    daysCount: number;
    distribution: SettingDistributionResult;
  }[] = [];

  for (const [mNum, data] of machineMap.entries()) {
    if (data.games <= 0) continue;
    const inCoins = data.games * 3;
    const outCoins = inCoins + data.diff;
    const payout = (outCoins / inCoins) * 100;

    const dist = estimateSettingDistributionFromPayout(
      data.games,
      payout,
      specs,
      options
    );
    dist.isKnownCatalog = resolution.isKnownCatalog;

    results.push({
      machineNum: mNum,
      totalGames: data.games,
      totalDiff: data.diff,
      payoutRate: Math.round(payout * 10) / 10,
      daysCount: data.days,
      distribution: dist,
    });
  }

  // 期待設定値の高い順にソート
  results.sort((a, b) => b.distribution.expectedSetting - a.distribution.expectedSetting);

  return results;
}
