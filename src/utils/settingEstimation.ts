/**
 * A-Type Setting Distribution Estimation Engine (Aタイプ出率・設定値分布推定)
 *
 * 【モデル概要】
 * - 対象: isAType() === true の機種 (ジャグラー系を含む)
 * - 台×日ごとの観測出率 x は、設定 s の下で x ~ Normal(R_s, σ² / N) または Student-t(R_s, σ² / N, ν)
 *   (N = 回転数, R_s = 機種仕様テーブルの機械割 %)
 * - 混合比率 π_s と分散パラメータ σ² は、EMアルゴリズム（Expectation-Maximization）により同時推定
 * - 各台×日の事後確率 P(設定=s | x, N, π) を算出
 * - ブロックブートストラップ (ブロック長7日、2000回、乱数シード固定) による π_s の95%信頼区間
 * - 判別力指標 (R_max - R_min) / (σ / √N) による推定信頼性の診断
 * - 実データ妥当性検証（キャリブレーション）: 推定設定5分位とREG確率の単調性（スピアマン相関）
 * - 出率残差分布診断（尖度・歪度）と t分布尤度オプション
 * - 条件別比較（特日vs通常日, 曜日別, 末尾別）: 日単位ブロックブートストラップ検定 + Benjamini–Hochberg多重検定補正
 */

import { DailyRecord, DailyMachineRecord, SpecialDayRules } from '../data/types';
import { HIGH_SETTING_THRESHOLDS } from './highSettingConfig';
import { ModelSettingSpec, resolveSettingNum } from './settingSpecs';
import { isDateSpecialDay } from './dataEngine';
import { calculateSpearman } from './backtestEngine';

export type GameWeightMode = 'raw' | 'cap3000' | 'constant';

export interface EstimationOptions {
  /** 最小回転数閾値 (既定 0G: 全台日) */
  minGames?: number;
  /** 回転数の重み付け方式: そのまま (raw) / 上限3,000G (cap3000) / 一定 (constant) (既定 'raw') */
  gameWeightMode?: GameWeightMode;
  /** 高設定判定の閾値 (既定 4 以上) */
  highSettingThreshold?: number;
  /** レコード記載の payoutRate を優先使用するか (既定 false: 3枚掛け計算) */
  useRecordedPayoutRate?: boolean;
  /** BB/RBポアソン尤度を加味するか (既定 false) */
  usePoissonBonus?: boolean;
  /** ポアソン尤度の割引重み λ (既定 0.5) */
  poissonWeight?: number;
  /** t分布尤度に切り替えるか (既定 false: 正規分布) */
  useTDistribution?: boolean;
  /** t分布の自由度 (未指定時は残差から推定または既定 5) */
  tDistributionDf?: number;
  /** EM最大反復回数 (既定 200) */
  maxIterations?: number;
  /** EM収束判定閾値 (既定 1e-6) */
  convergenceTol?: number;
  /** ブートストラップ回数 (既定 2000) */
  bootstrapReps?: number;
  /** ブートストラップ乱数シード (既定 42) */
  bootstrapSeed?: number;
  /** 特日判定ルール (店舗設定) */
  specialDayRules?: SpecialDayRules;
  /** 点推定(EM)のみ実行し、ブートストラップ・キャリブレーション・条件別比較をスキップするか (既定 false) */
  pointEstimateOnly?: boolean;
}

export interface MachineDayEstimation {
  date: string;
  machineNum: number;
  games: number;
  diff: number;
  observedPayoutRate: number; // %
  recordedPayoutRate?: number; // %
  posteriors: Record<string, number>; // label -> probability (0..1)
  expectedSetting: number; // 推定平均設定 (加重平均)
  highSettingProb: number; // P(設定 >= 閾値)
  discriminability: number; // (R_max - R_min) / (sigma / sqrt(games))
  bb?: number;
  rb?: number;
  isSpecialDay?: boolean;
  dayOfWeek?: string;
  tailDigit?: number;
  isZoro?: boolean;
}

export interface SettingDistItem {
  label: string;
  settingNum: number;
  payoutRate: number;
  proportion: number; // 推定混合比率 π_s (0..1)
  ci95: [number, number]; // 95%信頼区間 [lower, upper]
}

export interface ConditionComparisonItem {
  conditionType: 'special_day' | 'day_of_week' | 'tail_digit';
  categoryKey: string;
  categoryLabel: string;
  machineDaysCount: number;
  highSettingRate: number; // %
  baselineRate: number; // % (対照群)
  diffRate: number; // % (差分)
  isSignificant: boolean; // 有意差ありか (Benjamini–Hochberg補正後)
  significanceLabel: string; // '有意（FDR補正後 q < 0.05）' | '誤差の範囲'
  pValue: number; // ブロックブートストラップ 生のp値
  adjustedPValue?: number; // Benjamini–Hochberg 補正後のq値
  diffCi95?: [number, number]; // 差分の95%ブートストラップ区間
}

export interface MachineSummaryItem {
  machineNum: number;
  daysCount: number;
  totalGames: number;
  avgGames: number;
  totalDiff: number;
  avgPayoutRate: number;
  expectedSetting: number;
  highSettingProb: number;
  mostLikelySetting: string;
}

export interface DailyTrendItem {
  date: string;
  dayOfWeek: string;
  isSpecialDay: boolean;
  machineCount: number;
  avgGames: number;
  avgPayoutRate: number;
  expectedSetting: number;
  highSettingRate: number; // %
  distribution: Record<string, number>; // label -> ratio (0..1)
}

export interface CalibrationQuantileItem {
  quantile: number; // 1..5
  quantileLabel: string;
  count: number;
  meanExpectedSetting: number;
  totalGames: number;
  actualRbCount: number;
  actualRbRate: number; // probability
  actualRbDenom: number; // 1/X
  expectedRbDenom: number; // 1/X
  actualBbCount: number;
  actualBbRate: number; // probability
  actualBbDenom: number; // 1/X
  expectedBbDenom: number; // 1/X
}

export interface CalibrationResult {
  hasBonusSpec: boolean;
  quantiles: CalibrationQuantileItem[];
  spearmanRb: number | null;
  spearmanBb: number | null;
  isMonotonic: boolean;
  warning?: string;
}

export interface ResidualDistributionResult {
  mean: number;
  stdDev: number;
  skewness: number; // 歪度
  kurtosis: number; // 尖度 (excess kurtosis)
  isNormalityViolated: boolean;
  warning?: string;
  estimatedTdf?: number; // 推定されたStudent-t自由度
}

export interface ModelEstimationResult {
  modelName: string;
  specFound: boolean;
  spec?: ModelSettingSpec;
  totalRecords: number;
  evaluatedRecords: number;
  excludedCount: number;
  sigma: number;
  meanGames: number;
  discriminability: number;
  isLowDiscriminability: boolean;
  converged: boolean;
  iterations: number;
  distribution: SettingDistItem[];
  highSettingOverallRate: number; // %
  expectedSettingOverall: number;
  machineEstimations: MachineDayEstimation[];
  machineSummaries: MachineSummaryItem[];
  conditionComparisons: ConditionComparisonItem[];
  dailyTrends: DailyTrendItem[];
  calibration?: CalibrationResult;
  residualDistribution?: ResidualDistributionResult;
  warnings: string[];
  bootstrapNonConvergedCount?: number;
  bootstrapRepsEffective?: number;
  bootstrapNote?: string;
}

/**
 * 決定論的な擬似乱数生成器 (Mulberry32)
 */
export function createSeededRandom(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * スターリング近似による対数階乗 ln(n!)
 */
function logFactorial(n: number): number {
  if (n <= 1) return 0;
  if (n <= 20) {
    let sum = 0;
    for (let i = 2; i <= n; i++) sum += Math.log(i);
    return sum;
  }
  return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);
}

/**
 * Lanczos近似による対数ガンマ関数 ln(Γ(x))
 */
export function logGamma(x: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109585720573,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = p[0];
  const t = z + g + 0.5;
  for (let i = 1; i < p.length; i++) {
    a += p[i] / (z + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * 従来の2標本割合Z検定 (旧判定との比較検証用として維持・エクスポート)
 */
export function calculateTwoProportionZTest(
  countA: number,
  propA: number,
  countB: number,
  propB: number
): { pValue: number; isSignificant: boolean } {
  if (countA < 3 || countB < 3) {
    return { pValue: 1.0, isSignificant: false };
  }

  const p1 = Math.max(0, Math.min(1, propA));
  const p2 = Math.max(0, Math.min(1, propB));

  if (Math.abs(p1 - p2) < 1e-9) {
    return { pValue: 1.0, isSignificant: false };
  }

  const pooled = (countA * p1 + countB * p2) / (countA + countB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / countA + 1 / countB));

  if (se < 1e-8) {
    return { pValue: 1.0, isSignificant: false };
  }

  const z = Math.abs(p1 - p2) / se;
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const pOneTail =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pValue = Math.min(1.0, Math.max(0.0, pOneTail * 2));

  return {
    pValue: Number(pValue.toFixed(3)),
    isSignificant: pValue < 0.05,
  };
}

/**
 * 出玉率（機械割）の計算
 * 既定: 3枚掛け固定前提 (games×3 + diff) / (games×3) × 100
 */
export function calculatePayoutRate(
  games: number,
  diff: number,
  betPerGame: number = HIGH_SETTING_THRESHOLDS.BET_PER_GAME
): number {
  if (games <= 0) return 100.0;
  const inCoins = games * betPerGame;
  const outCoins = inCoins + diff;
  return (outCoins / inCoins) * 100.0;
}

/**
 * IN加重出玉率（機械割 %）の計算
 * (総OUT / 総IN) × 100 = (総IN + 差枚) / 総IN × 100
 * @param records games と diff を含むレコード配列
 * @param betPerGame 1ゲームあたりの投入枚数 (既定 3)
 */
export function calculateInWeightedPayoutRate(
  records: Array<{ games: number; diff: number }>,
  betPerGame: number = HIGH_SETTING_THRESHOLDS.BET_PER_GAME
): number {
  if (records.length === 0) return 100.0;
  let totalGames = 0;
  let totalDiff = 0;
  for (const r of records) {
    totalGames += r.games;
    totalDiff += r.diff;
  }
  if (totalGames <= 0) return 100.0;
  const inCoins = totalGames * betPerGame;
  const outCoins = inCoins + totalDiff;
  return Number(((outCoins / inCoins) * 100.0).toFixed(2));
}

export interface SurvivorBiasWarningResult {
  shouldWarn: boolean;
  warningMessage: string;
  isExcludedRateHigh: boolean;
  isPayoutElevated: boolean;
  excludedRatio: number;
  payoutDiff: number;
}

/**
 * 最小回転数によるサバイバーシップ（負けやめ除外）バイアスの判定
 * 絞った後の出率が全体より1pt以上高い、または除外台日が全体の20%以上のとき警告
 */
export function checkSurvivorBiasWarning(
  totalRecords: number,
  excludedCount: number,
  overallPayoutRate: number,
  filteredPayoutRate: number
): SurvivorBiasWarningResult {
  const excludedRatio = totalRecords > 0 ? excludedCount / totalRecords : 0;
  const payoutDiff = Number((filteredPayoutRate - overallPayoutRate).toFixed(2));

  const isExcludedRateHigh = totalRecords > 0 && excludedRatio >= 0.20;
  const isPayoutElevated = payoutDiff >= 1.0;
  const shouldWarn = isExcludedRateHigh || isPayoutElevated;

  return {
    shouldWarn,
    warningMessage: shouldWarn
      ? '最小回転数で絞ると、負けてやめられた台日が除かれ、高設定側に偏ります。'
      : '',
    isExcludedRateHigh,
    isPayoutElevated,
    excludedRatio: Number(excludedRatio.toFixed(4)),
    payoutDiff,
  };
}

/**
 * 設定信頼区間の表示フォーマット (境界張り付き判定)
 */
export function formatSettingCi95(ci95: [number, number]): {
  text: string;
  isBoundary: boolean;
  boundaryNote?: string;
} {
  const lowPct = Number((ci95[0] * 100).toFixed(1));
  const highPct = Number((ci95[1] * 100).toFixed(1));

  if (lowPct <= 0.0 && highPct <= 0.0) {
    return {
      text: '0%（境界）',
      isBoundary: true,
      boundaryNote: '確実に0という意味ではありません',
    };
  }
  if (lowPct >= 100.0 && highPct >= 100.0) {
    return {
      text: '100%（境界）',
      isBoundary: true,
      boundaryNote: '確実に100%という意味ではありません',
    };
  }
  return {
    text: `[${lowPct.toFixed(1)}% 〜 ${highPct.toFixed(1)}%]`,
    isBoundary: false,
  };
}

export interface SensitivityAnalysisRow {
  minGames: number;
  label: string;
  evaluatedRecords: number;
  excludedCount: number;
  inWeightedPayoutRate: number;
  /** 回転数重み: そのまま での高設定(4+)比率 */
  rateRaw: number;
  /** 回転数重み: 上限3,000G での高設定(4+)比率 */
  rateCap3000: number;
  /** 回転数重み: 一定 での高設定(4+)比率 */
  rateConstant: number;
  distribution: Array<{ label: string; proportion: number }>;
  highSettingRate: number;
}

export interface SensitivityAnalysisResult {
  rows: SensitivityAnalysisRow[];
  maxHighSettingRate: number;
  minHighSettingRate: number;
  rateSpread: number;
  isHighSensitivity: boolean;
  warningMessage: string;
}

export const DEFAULT_SENSITIVITY_THRESHOLDS = [0, 1000, 2000, 3000, 5000];

/**
 * 最小回転数 (0/1000/2000/3000/5000G) × 回転数の重み (そのまま/上限3000G/一定) による感度分析
 * (点推定EMのみで高速一括計算: 全15条件)
 */
export function runSensitivityAnalysis(
  modelName: string,
  dailyRecords: DailyRecord[],
  spec: ModelSettingSpec | null,
  options: Omit<EstimationOptions, 'minGames' | 'pointEstimateOnly'> = {},
  thresholds: number[] = DEFAULT_SENSITIVITY_THRESHOLDS,
  onProgress?: (completed: number, total: number) => void
): SensitivityAnalysisResult {
  if (!spec || !spec.settings || spec.settings.length < 2) {
    onProgress?.(0, 0);
    return {
      rows: [],
      maxHighSettingRate: 0,
      minHighSettingRate: 0,
      rateSpread: 0,
      isHighSensitivity: false,
      warningMessage: '',
    };
  }

  const rawModelRecords: Array<{ games: number; diff: number }> = [];
  for (const dr of dailyRecords) {
    const mList = dr.machines || (dr as any).machineRecords;
    if (mList) {
      for (const mr of mList) {
        if (mr.modelName === modelName) {
          rawModelRecords.push({ games: mr.games, diff: mr.diff });
        }
      }
    }
  }

  const rows: SensitivityAnalysisRow[] = [];
  const allObservedRates: number[] = [];
  let completed = 0;
  const totalConditions = thresholds.length * 3;
  onProgress?.(0, totalConditions);

  for (const th of thresholds) {
    // 3種類の重み付けで点推定を一括実行
    const estRaw = estimateModelSettingDistribution(modelName, dailyRecords, spec, {
      ...options,
      minGames: th,
      gameWeightMode: 'raw',
      pointEstimateOnly: true,
    });
    completed++;
    onProgress?.(completed, totalConditions);

    const estCap3000 = estimateModelSettingDistribution(modelName, dailyRecords, spec, {
      ...options,
      minGames: th,
      gameWeightMode: 'cap3000',
      pointEstimateOnly: true,
    });
    completed++;
    onProgress?.(completed, totalConditions);

    const estConstant = estimateModelSettingDistribution(modelName, dailyRecords, spec, {
      ...options,
      minGames: th,
      gameWeightMode: 'constant',
      pointEstimateOnly: true,
    });
    completed++;
    onProgress?.(completed, totalConditions);

    const matchingRecords = rawModelRecords.filter((r) => r.games >= th);
    const inWeightedPayoutRate = calculateInWeightedPayoutRate(matchingRecords);
    const label = th === 0 ? '全台日(0)' : `${th.toLocaleString()}G`;

    if (estRaw.evaluatedRecords > 0) {
      allObservedRates.push(
        estRaw.highSettingOverallRate,
        estCap3000.highSettingOverallRate,
        estConstant.highSettingOverallRate
      );
    }

    rows.push({
      minGames: th,
      label,
      evaluatedRecords: estRaw.evaluatedRecords,
      excludedCount: estRaw.excludedCount,
      inWeightedPayoutRate,
      rateRaw: estRaw.highSettingOverallRate,
      rateCap3000: estCap3000.highSettingOverallRate,
      rateConstant: estConstant.highSettingOverallRate,
      distribution: estRaw.distribution.map((d) => ({
        label: d.label,
        proportion: d.proportion,
      })),
      highSettingRate: estRaw.highSettingOverallRate,
    });
  }

  const maxHighSettingRate = allObservedRates.length > 0 ? Math.max(...allObservedRates) : 0;
  const minHighSettingRate = allObservedRates.length > 0 ? Math.min(...allObservedRates) : 0;
  const rateSpread = Number((maxHighSettingRate - minHighSettingRate).toFixed(1));
  const isHighSensitivity = rateSpread >= 30.0;

  return {
    rows,
    maxHighSettingRate,
    minHighSettingRate,
    rateSpread,
    isHighSensitivity,
    warningMessage: isHighSensitivity
      ? '出率だけでは分布は決められません。上の『範囲』を参考にしてください。'
      : '',
  };
}

export interface RotationIntervalStat {
  label: string;
  minGames: number;
  maxGames: number;
  count: number;
  ratio: number;
  inWeightedPayoutRate: number;
  totalGames: number;
  totalDiff: number;
}

export interface RotationDependencyDiagnosis {
  intervals: RotationIntervalStat[];
  spearmanCorr: number | null;
  isDependent: boolean;
  warningMessage: string;
}

/**
 * 回転数と出率の依存診断 (回転数区間ごとの出率とSpearman相関)
 */
export function calculateRotationDependencyDiagnosis(
  modelRecords: Array<{ games: number; diff: number; payoutRate?: number }>
): RotationDependencyDiagnosis {
  const total = modelRecords.length;
  const intervalDefs = [
    { label: '〜1,000G', minGames: 0, maxGames: 1000 },
    { label: '1,000〜2,000G', minGames: 1000, maxGames: 2000 },
    { label: '2,000〜3,000G', minGames: 2000, maxGames: 3000 },
    { label: '3,000〜5,000G', minGames: 3000, maxGames: 5000 },
    { label: '5,000G〜', minGames: 5000, maxGames: Infinity },
  ];

  const intervals: RotationIntervalStat[] = intervalDefs.map((def) => {
    const matched = modelRecords.filter(
      (r) => r.games >= def.minGames && r.games < def.maxGames
    );
    const count = matched.length;
    const ratio = total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
    const inWeightedPayoutRate = calculateInWeightedPayoutRate(matched);
    const totalGames = matched.reduce((s, r) => s + r.games, 0);
    const totalDiff = matched.reduce((s, r) => s + r.diff, 0);
    return {
      label: def.label,
      minGames: def.minGames,
      maxGames: def.maxGames,
      count,
      ratio,
      inWeightedPayoutRate,
      totalGames,
      totalDiff,
    };
  });

  let spearmanCorr: number | null = null;
  if (total >= 5) {
    const gamesArr = modelRecords.map((r) => r.games);
    const payoutsArr = modelRecords.map((r) =>
      r.payoutRate !== undefined ? r.payoutRate : calculatePayoutRate(r.games, r.diff)
    );
    spearmanCorr = calculateSpearman(gamesArr, payoutsArr);
  }

  const isDependent = spearmanCorr !== null && spearmanCorr >= 0.2;
  const warningMessage = isDependent
    ? '回転数が結果に依存しています（勝つ台ほど回ります）。出率だけの推定は高設定側に偏ります。'
    : '';

  return {
    intervals,
    spearmanCorr,
    isDependent,
    warningMessage,
  };
}

export interface DataVolumeWarningItem {
  type: 'few_machines' | 'few_days' | 'no_bonus';
  title: string;
  message: string;
  severity?: 'info' | 'warning';
}

export interface DataVolumeWarningResult {
  hasWarning: boolean;
  uniqueMachineCount: number;
  evaluatedRecords: number;
  hasBonusData: boolean;
  warnings: DataVolumeWarningItem[];
}

/**
 * データ量・形式に関する情報診断
 * (台数5台未満、台日300台日未満)
 * ※ BB・RBなし警告(no_bonus)は削除、台数少(few_machines)は情報表示
 */
export function checkDataVolumeWarnings(
  uniqueMachineCount: number,
  evaluatedRecords: number,
  hasBonusData: boolean = false,
  thresholds: { minMachines?: number; minDays?: number; warnOnNoBonus?: boolean } = {}
): DataVolumeWarningResult {
  const minMachines = thresholds.minMachines ?? 5;
  const minDays = thresholds.minDays ?? 300;
  const warnOnNoBonus = thresholds.warnOnNoBonus ?? true;
  const warnings: DataVolumeWarningItem[] = [];

  if (uniqueMachineCount < minMachines && uniqueMachineCount > 0) {
    warnings.push({
      type: 'few_machines',
      title: `設置台数が少なめ (${uniqueMachineCount}台)`,
      message: '台数が少ないため、設定の『分布』ではなく、全体出率からの『範囲』で表示します',
      severity: 'info',
    });
  }

  if (evaluatedRecords < minDays && evaluatedRecords > 0) {
    warnings.push({
      type: 'few_days',
      title: `観測データが少なめ (${evaluatedRecords}台日 < 推奨${minDays}台日)`,
      message: `観測データが${evaluatedRecords}台日と少なめです（推奨${minDays}台日以上）。信頼区間が広くなり、推定のばらつきが大きくなります。`,
      severity: 'info',
    });
  }

  if (!hasBonusData && warnOnNoBonus) {
    warnings.push({
      type: 'no_bonus',
      title: 'BB・RB回数データなし',
      message: 'BB・RB回数の詳細データがありません。出率（差枚数とG数）のみによる推定を行います。',
      severity: 'info',
    });
  }

  return {
    hasWarning: warnings.length > 0,
    uniqueMachineCount,
    evaluatedRecords,
    hasBonusData,
    warnings,
  };
}

/**
 * 内部処理用: 評価対象となった台レコードの構造体
 */
export interface PreparedMachineRecord {
  date: string;
  machineNum: number;
  games: number;
  diff: number;
  payoutRate: number;
  recordedPayoutRate?: number;
  bb?: number;
  rb?: number;
  isSpecialDay: boolean;
  dayOfWeek: string;
  tailDigit: number;
  isZoro: boolean;
}

/**
 * EMアルゴリズム実行関数 (純関数)
 * 正規分布またはStudent-t分布尤度によるπとσの同時推定
 */
export function runEMEstimation(
  records: PreparedMachineRecord[],
  spec: ModelSettingSpec,
  options: {
    gameWeightMode?: GameWeightMode;
    usePoissonBonus?: boolean;
    poissonWeight?: number;
    useTDistribution?: boolean;
    tDistributionDf?: number;
    maxIterations?: number;
    convergenceTol?: number;
    initialPi?: number[];
    initialSigma?: number;
  } = {}
): {
  pi: number[];
  sigma: number;
  posteriors: number[][]; // [recordIdx][settingIdx]
  converged: boolean;
  iterations: number;
} {
  const K = spec.settings.length;
  const M = records.length;
  const maxIter = options.maxIterations ?? 200;
  const tol = options.convergenceTol ?? 1e-6;
  const usePoisson = options.usePoissonBonus ?? false;
  const lambda = options.poissonWeight ?? 0.5;
  const useT = options.useTDistribution ?? false;
  const nu = options.tDistributionDf ?? 5;
  const weightMode = options.gameWeightMode ?? 'raw';

  const getEffGames = (g: number): number => {
    const base = Math.max(1, g);
    if (weightMode === 'cap3000') return Math.min(base, 3000);
    if (weightMode === 'constant') return 3000;
    return base;
  };

  if (M === 0 || K === 0) {
    return {
      pi: new Array(K).fill(1 / K),
      sigma: 100,
      posteriors: [],
      converged: true,
      iterations: 0,
    };
  }

  // 初期値
  let pi = options.initialPi
    ? [...options.initialPi]
    : new Array(K).fill(1 / K);

  const rates = spec.settings.map((s) => s.payoutRate);
  const meanRate = rates.reduce((a, b) => a + b, 0) / K;
  let initialVar = options.initialSigma ? options.initialSigma * options.initialSigma : 0;
  if (!initialVar) {
    let sumDev = 0;
    for (const r of records) {
      const eff = getEffGames(r.games);
      sumDev += eff * (r.payoutRate - meanRate) * (r.payoutRate - meanRate);
    }
    initialVar = Math.max(400, Math.min(250000, sumDev / M));
  }
  let sigma2 = initialVar;

  // 事前計算: (x_i - R_s)^2
  const sqDiffs: number[][] = new Array(M);
  for (let i = 0; i < M; i++) {
    const row = new Float64Array(K);
    const x = records[i].payoutRate;
    for (let s = 0; s < K; s++) {
      const diff = x - rates[s];
      row[s] = diff * diff;
    }
    sqDiffs[i] = Array.from(row);
  }

  // ポアソン対数尤度の事前計算
  const poissonLogs: number[][] = new Array(M);
  if (usePoisson) {
    for (let i = 0; i < M; i++) {
      const row = new Float64Array(K);
      const rec = records[i];
      for (let s = 0; s < K; s++) {
        let pLog = 0;
        const st = spec.settings[s];
        if (st.bbDenom && rec.bb !== undefined) {
          const mu = rec.games / st.bbDenom;
          if (mu > 0) {
            pLog += rec.bb * Math.log(mu) - mu - logFactorial(rec.bb);
          }
        }
        if (st.rbDenom && rec.rb !== undefined) {
          const mu = rec.games / st.rbDenom;
          if (mu > 0) {
            pLog += rec.rb * Math.log(mu) - mu - logFactorial(rec.rb);
          }
        }
        row[s] = pLog * lambda;
      }
      poissonLogs[i] = Array.from(row);
    }
  }

  const responsibilities: number[][] = new Array(M);
  for (let i = 0; i < M; i++) {
    responsibilities[i] = new Array(K).fill(1 / K);
  }

  let converged = false;
  let iteration = 0;

  // t分布用の定数項
  const tLogConst = useT
    ? logGamma((nu + 1) / 2) - logGamma(nu / 2) - 0.5 * Math.log(Math.PI * nu)
    : 0;

  for (; iteration < maxIter; iteration++) {
    const sigma = Math.sqrt(sigma2);

    // E-Step
    for (let i = 0; i < M; i++) {
      const rec = records[i];
      const effGames = getEffGames(rec.games);
      const logLik = new Float64Array(K);
      let maxLog = -Infinity;
      const var_i = sigma2 / effGames;

      for (let s = 0; s < K; s++) {
        const pPrior = Math.max(1e-12, pi[s]);
        let logDensity = 0;

        if (useT) {
          // Student-t 対数尤度
          const z2 = (effGames * sqDiffs[i][s]) / sigma2;
          logDensity =
            tLogConst -
            0.5 * Math.log(var_i) -
            ((nu + 1) / 2) * Math.log(1 + z2 / nu);
        } else {
          // Normal 対数尤度
          logDensity =
            -0.5 * Math.log(2 * Math.PI) -
            0.5 * Math.log(var_i) -
            (0.5 * effGames * sqDiffs[i][s]) / sigma2;
        }

        let total = Math.log(pPrior) + logDensity;
        if (usePoisson) {
          total += poissonLogs[i][s];
        }
        logLik[s] = total;
        if (total > maxLog) maxLog = total;
      }

      // 安定な Softmax 正規化
      let logSum = 0;
      for (let s = 0; s < K; s++) {
        logSum += Math.exp(logLik[s] - maxLog);
      }
      logSum = maxLog + Math.log(logSum);

      for (let s = 0; s < K; s++) {
        responsibilities[i][s] = Math.exp(logLik[s] - logSum);
      }
    }

    // M-Step: π_s の更新
    const nextPi = new Array(K).fill(0);
    for (let s = 0; s < K; s++) {
      let sumGamma = 0;
      for (let i = 0; i < M; i++) {
        sumGamma += responsibilities[i][s];
      }
      nextPi[s] = Math.max(1e-8, sumGamma / M);
    }
    const piSum = nextPi.reduce((a, b) => a + b, 0);
    for (let s = 0; s < K; s++) {
      nextPi[s] /= piSum;
    }

    // M-Step: σ² の更新 (t分布時は外れ値ロバスト重み u_is を適用)
    let nextSigma2Num = 0;
    let nextSigma2Denom = 0;

    for (let i = 0; i < M; i++) {
      const effGames = getEffGames(records[i].games);
      for (let s = 0; s < K; s++) {
        const gamma_is = responsibilities[i][s];
        let u_is = 1.0;
        if (useT) {
          const z2 = (effGames * sqDiffs[i][s]) / sigma2;
          u_is = (nu + 1) / (nu + z2);
        }
        nextSigma2Num += gamma_is * u_is * effGames * sqDiffs[i][s];
        nextSigma2Denom += gamma_is;
      }
    }
    const nextSigma2 = Math.max(100, nextSigma2Denom > 0 ? nextSigma2Num / nextSigma2Denom : 100);

    // 収束判定
    let maxPiDelta = 0;
    for (let s = 0; s < K; s++) {
      const delta = Math.abs(nextPi[s] - pi[s]);
      if (delta > maxPiDelta) maxPiDelta = delta;
    }
    const sigmaDelta = Math.abs(Math.sqrt(nextSigma2) - sigma);

    pi = nextPi;
    sigma2 = nextSigma2;

    if (maxPiDelta < tol && sigmaDelta < 1e-4) {
      converged = true;
      iteration++;
      break;
    }
  }

  return {
    pi,
    sigma: Math.sqrt(sigma2),
    posteriors: responsibilities,
    converged,
    iterations: iteration,
  };
}

/**
 * ブロックブートストラップによる混合比率 π_s の 95% 信頼区間算出結果
 */
export interface BlockBootstrapResult extends Array<[number, number]> {
  intervals: Array<[number, number]>;
  nonConvergedCount: number;
  convergedCount: number;
  totalReps: number;
  note: string;
}

/**
 * ブロックブートストラップによる混合比率 π_s の 95% 信頼区間算出
 *
 * 【プロンプト31仕様】
 * 1. 各再標本の EM を、一様な初期値から、最大200反復・収束判定1e-6（点推定と同じ条件）で実行。
 *    収束しなかった再標本は除外し、その件数を結果に含める。
 * 2. 速度: 再標本ごとに対数尤度を計算し直さない。σ を点推定で固定し、尤度行列（記録×設定）を
 *    最初に1回だけ作って、再標本では日ごとの索引で足し合わせる。
 */
export function runBlockBootstrap(
  records: PreparedMachineRecord[],
  spec: ModelSettingSpec,
  pointPi: number[],
  pointSigma: number,
  options: {
    blockLength?: number;
    replicates?: number;
    seed?: number;
    usePoissonBonus?: boolean;
    poissonWeight?: number;
    useTDistribution?: boolean;
    tDistributionDf?: number;
    gameWeightMode?: GameWeightMode;
    maxIterations?: number;
    convergenceTol?: number;
  } = {}
): BlockBootstrapResult {
  const K = spec.settings.length;
  const M = records.length;
  const reps = options.replicates ?? 2000;
  const blockLen = options.blockLength ?? 7;
  const seed = options.seed ?? 42;
  const maxIter = options.maxIterations ?? 200;
  const tol = options.convergenceTol ?? 1e-6;
  const usePoisson = options.usePoissonBonus ?? false;
  const lambda = options.poissonWeight ?? 0.5;
  const useT = options.useTDistribution ?? false;
  const nu = options.tDistributionDf ?? 5;
  const weightMode = options.gameWeightMode ?? 'raw';
  const rng = createSeededRandom(seed);

  const getEffGames = (g: number): number => {
    const base = Math.max(1, g);
    if (weightMode === 'cap3000') return Math.min(base, 3000);
    if (weightMode === 'constant') return 3000;
    return base;
  };

  const rates = spec.settings.map((s) => s.payoutRate);
  const sigma2 = Math.max(100, pointSigma * pointSigma);

  // t分布用の定数項
  const tLogConst = useT
    ? logGamma((nu + 1) / 2) - logGamma(nu / 2) - 0.5 * Math.log(Math.PI * nu)
    : 0;

  // 1. 尤度行列 A (M x K) を最初に1回だけ作成 (σ は点推定で固定)
  const A = new Float64Array(M * K);
  for (let i = 0; i < M; i++) {
    const rec = records[i];
    const effGames = getEffGames(rec.games);
    const var_i = sigma2 / effGames;
    const x = rec.payoutRate;
    const rowOffset = i * K;
    let maxLog = -Infinity;

    for (let s = 0; s < K; s++) {
      const diff = x - rates[s];
      const sqDiff = diff * diff;
      let logDensity = 0;

      if (useT) {
        const z2 = (effGames * sqDiff) / sigma2;
        logDensity =
          tLogConst -
          0.5 * Math.log(var_i) -
          ((nu + 1) / 2) * Math.log(1 + z2 / nu);
      } else {
        logDensity =
          -0.5 * Math.log(2 * Math.PI) -
          0.5 * Math.log(var_i) -
          (0.5 * effGames * sqDiff) / sigma2;
      }

      if (usePoisson) {
        let pLog = 0;
        const st = spec.settings[s];
        if (st.bbDenom && rec.bb !== undefined) {
          const mu = rec.games / st.bbDenom;
          if (mu > 0) {
            pLog += rec.bb * Math.log(mu) - mu - logFactorial(rec.bb);
          }
        }
        if (st.rbDenom && rec.rb !== undefined) {
          const mu = rec.games / st.rbDenom;
          if (mu > 0) {
            pLog += rec.rb * Math.log(mu) - mu - logFactorial(rec.rb);
          }
        }
        logDensity += pLog * lambda;
      }

      A[rowOffset + s] = logDensity;
      if (logDensity > maxLog) maxLog = logDensity;
    }

    // 数値安定性のためのSoftmaxシフト (最大値減算して指数化)
    for (let s = 0; s < K; s++) {
      const shifted = A[rowOffset + s] - maxLog;
      A[rowOffset + s] = shifted < -700 ? 0 : Math.exp(shifted);
    }
  }

  // 2. 日付ごとのレコード索引を作成
  const dateMap = new Map<string, number[]>();
  for (let i = 0; i < M; i++) {
    const d = records[i].date;
    let list = dateMap.get(d);
    if (!list) {
      list = [];
      dateMap.set(d, list);
    }
    list.push(i);
  }

  const uniqueDates = Array.from(dateMap.keys()).sort();
  const T = uniqueDates.length;

  if (T === 0 || K === 0) {
    const empty = new Array(K).fill([0, 0]) as BlockBootstrapResult;
    empty.intervals = new Array(K).fill([0, 0]);
    empty.nonConvergedCount = 0;
    empty.convergedCount = 0;
    empty.totalReps = 0;
    empty.note = 'σを固定した区間です。台数が少ないと実際より狭く出ることがあります';
    return empty;
  }

  const dateRecordIndices: number[][] = uniqueDates.map((d) => dateMap.get(d)!);
  const effectiveBlockLen = Math.min(blockLen, T);
  const numBlocks = T - effectiveBlockLen + 1;
  const piSamples: number[][] = Array.from({ length: K }, () => []);
  let nonConvergedCount = 0;
  let convergedCount = 0;

  const dateWeights = new Int32Array(T);
  const activeDates: number[] = [];
  const pi = new Float64Array(K);
  const nextPi = new Float64Array(K);
  const sumGamma = new Float64Array(K);
  const uniformPrior = 1 / K;

  for (let b = 0; b < reps; b++) {
    dateWeights.fill(0);
    let sampledCount = 0;
    while (sampledCount < T) {
      const startIdx = Math.floor(rng() * numBlocks);
      for (let k = 0; k < effectiveBlockLen && sampledCount < T; k++) {
        dateWeights[startIdx + k]++;
        sampledCount++;
      }
    }

    activeDates.length = 0;
    let Mb = 0;
    for (let d = 0; d < T; d++) {
      const w = dateWeights[d];
      if (w > 0) {
        activeDates.push(d);
        Mb += w * dateRecordIndices[d].length;
      }
    }

    if (Mb === 0) {
      nonConvergedCount++;
      continue;
    }

    // 1. 各再標本の EM を一様な初期値から実行
    pi.fill(uniformPrior);
    let converged = false;

    // 2. 最大200反復・収束判定1e-6 (点推定と同じ条件)
    for (let iter = 0; iter < maxIter; iter++) {
      sumGamma.fill(0);

      // 日ごとの索引で尤度を足し合わせ
      for (let ad = 0; ad < activeDates.length; ad++) {
        const d = activeDates[ad];
        const w = dateWeights[d];
        const recList = dateRecordIndices[d];
        const recLen = recList.length;

        for (let r = 0; r < recLen; r++) {
          const offset = recList[r] * K;
          let denom = 0;
          for (let s = 0; s < K; s++) {
            denom += pi[s] * A[offset + s];
          }
          if (denom < 1e-15) denom = 1e-15;
          const mult = w / denom;
          for (let s = 0; s < K; s++) {
            sumGamma[s] += pi[s] * A[offset + s] * mult;
          }
        }
      }

      // M-Step: π の更新
      let piSum = 0;
      for (let s = 0; s < K; s++) {
        const val = Math.max(1e-12, sumGamma[s] / Mb);
        nextPi[s] = val;
        piSum += val;
      }

      const invPiSum = 1 / piSum;
      let maxDelta = 0;
      for (let s = 0; s < K; s++) {
        nextPi[s] *= invPiSum;
        const delta = Math.abs(nextPi[s] - pi[s]);
        if (delta > maxDelta) maxDelta = delta;
        pi[s] = nextPi[s];
      }

      if (maxDelta < tol) {
        converged = true;
        break;
      }
    }

    if (converged) {
      convergedCount++;
      for (let s = 0; s < K; s++) {
        piSamples[s].push(pi[s]);
      }
    } else {
      // 収束しなかった再標本は除外
      nonConvergedCount++;
    }
  }

  const intervals: Array<[number, number]> = [];
  for (let s = 0; s < K; s++) {
    const arr = piSamples[s].sort((a, b) => a - b);
    if (arr.length === 0) {
      intervals.push([pointPi[s], pointPi[s]]);
      continue;
    }
    const lowIdx = Math.max(0, Math.floor(arr.length * 0.025));
    const highIdx = Math.min(arr.length - 1, Math.floor(arr.length * 0.975));
    intervals.push([arr[lowIdx], arr[highIdx]]);
  }

  const result = intervals as BlockBootstrapResult;
  result.intervals = intervals;
  result.nonConvergedCount = nonConvergedCount;
  result.convergedCount = convergedCount;
  result.totalReps = reps;
  result.note = 'σを固定した区間です。台数が少ないと実際より狭く出ることがあります';

  return result;
}

/**
 * 出率標準化残差の分布特性 (歪度・尖度) の算出
 */
export function calculateResidualDistribution(
  prepared: PreparedMachineRecord[],
  spec: ModelSettingSpec,
  posteriors: number[][],
  sigma: number
): ResidualDistributionResult {
  const M = prepared.length;
  const K = spec.settings.length;

  if (M === 0 || K === 0 || sigma <= 0) {
    return {
      mean: 0,
      stdDev: 1,
      skewness: 0,
      kurtosis: 0,
      isNormalityViolated: false,
    };
  }

  let wSum = 0;
  let wZSum = 0;

  for (let i = 0; i < M; i++) {
    const rec = prepared[i];
    const se = sigma / Math.sqrt(rec.games);
    if (se <= 0) continue;

    for (let s = 0; s < K; s++) {
      const w = posteriors[i][s];
      const z = (rec.payoutRate - spec.settings[s].payoutRate) / se;
      wSum += w;
      wZSum += w * z;
    }
  }

  const mean = wSum > 0 ? wZSum / wSum : 0;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;

  for (let i = 0; i < M; i++) {
    const rec = prepared[i];
    const se = sigma / Math.sqrt(rec.games);
    if (se <= 0) continue;

    for (let s = 0; s < K; s++) {
      const w = posteriors[i][s];
      const z = (rec.payoutRate - spec.settings[s].payoutRate) / se;
      const dev = z - mean;
      const dev2 = dev * dev;
      m2 += w * dev2;
      m3 += w * dev2 * dev;
      m4 += w * dev2 * dev2;
    }
  }

  const variance = wSum > 0 ? m2 / wSum : 1;
  const stdDev = Math.sqrt(variance);

  let skewness = 0;
  let kurtosis = 0;

  if (stdDev > 1e-6) {
    skewness = (m3 / wSum) / (stdDev * stdDev * stdDev);
    kurtosis = (m4 / wSum) / (variance * variance) - 3.0; // Excess kurtosis
  }

  let estimatedTdf = 5;
  if (kurtosis > 0.3) {
    estimatedTdf = Math.max(3, Math.min(30, Math.round(4 + 6 / kurtosis)));
  }

  const isNormalityViolated = Math.abs(skewness) > 1.0 || kurtosis > 2.0 || kurtosis < -1.5;
  let warning: string | undefined;

  if (isNormalityViolated) {
    warning = `出率の標準化残差が正規分布から乖離しています（歪度: ${skewness.toFixed(2)}, 尖度: ${kurtosis.toFixed(
      2
    )}）。裾の重い分布（外れ値）の可能性があります。`;
  }

  return {
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    skewness: Number(skewness.toFixed(2)),
    kurtosis: Number(kurtosis.toFixed(2)),
    isNormalityViolated,
    warning,
    estimatedTdf,
  };
}

/**
 * 実データでの妥当性検証（キャリブレーション）の算出
 * 推定平均設定の5分位ごとに実測REG/BB確率と仕様期待値を比較し、単調性相関を検査
 */
export function calculateCalibrationValidation(
  machineEstimations: MachineDayEstimation[],
  spec: ModelSettingSpec
): CalibrationResult {
  const hasBonusSpec = spec.settings.some(
    (s) => (s.rbDenom && s.rbDenom > 0) || (s.bbDenom && s.bbDenom > 0)
  );

  if (!hasBonusSpec) {
    return {
      hasBonusSpec: false,
      quantiles: [],
      spearmanRb: null,
      spearmanBb: null,
      isMonotonic: true,
    };
  }

  const validRecords = machineEstimations.filter(
    (r) => r.games > 0 && (r.rb !== undefined || r.bb !== undefined)
  );

  if (validRecords.length < 5) {
    return {
      hasBonusSpec: true,
      quantiles: [],
      spearmanRb: null,
      spearmanBb: null,
      isMonotonic: true,
    };
  }

  const sorted = [...validRecords].sort((a, b) => a.expectedSetting - b.expectedSetting);
  const n = sorted.length;
  const quantiles: CalibrationQuantileItem[] = [];
  const K = spec.settings.length;
  const numQuantiles = 5;

  for (let q = 0; q < numQuantiles; q++) {
    const startIdx = Math.floor((q * n) / numQuantiles);
    const endIdx = Math.floor(((q + 1) * n) / numQuantiles);
    const qRecs = sorted.slice(startIdx, endIdx);

    if (qRecs.length === 0) continue;

    const count = qRecs.length;
    const totalGames = qRecs.reduce((s, r) => s + r.games, 0);
    const meanExpSetting = qRecs.reduce((s, r) => s + r.expectedSetting, 0) / count;

    const actualRbCount = qRecs.reduce((s, r) => s + (r.rb ?? 0), 0);
    const actualRbRate = totalGames > 0 ? actualRbCount / totalGames : 0;
    const actualRbDenom = actualRbCount > 0 ? Math.round((totalGames / actualRbCount) * 10) / 10 : 0;

    const actualBbCount = qRecs.reduce((s, r) => s + (r.bb ?? 0), 0);
    const actualBbRate = totalGames > 0 ? actualBbCount / totalGames : 0;
    const actualBbDenom = actualBbCount > 0 ? Math.round((totalGames / actualBbCount) * 10) / 10 : 0;

    let qExpRbProbSum = 0;
    let qExpBbProbSum = 0;

    for (const r of qRecs) {
      for (let s = 0; s < K; s++) {
        const post = r.posteriors[spec.settings[s].label] || 0;
        const st = spec.settings[s];
        if (st.rbDenom && st.rbDenom > 0) {
          qExpRbProbSum += post * (1 / st.rbDenom) * r.games;
        }
        if (st.bbDenom && st.bbDenom > 0) {
          qExpBbProbSum += post * (1 / st.bbDenom) * r.games;
        }
      }
    }

    const expectedRbProb = totalGames > 0 ? qExpRbProbSum / totalGames : 0;
    const expectedRbDenom = expectedRbProb > 0 ? Math.round((1 / expectedRbProb) * 10) / 10 : 0;

    const expectedBbProb = totalGames > 0 ? qExpBbProbSum / totalGames : 0;
    const expectedBbDenom = expectedBbProb > 0 ? Math.round((1 / expectedBbProb) * 10) / 10 : 0;

    const labels = [
      '第1分位 (低設定帯)',
      '第2分位 (低〜中設定帯)',
      '第3分位 (中間帯)',
      '第4分位 (中〜高設定帯)',
      '第5分位 (高設定帯)',
    ];

    quantiles.push({
      quantile: q + 1,
      quantileLabel: labels[q] || `第${q + 1}分位`,
      count,
      meanExpectedSetting: Number(meanExpSetting.toFixed(2)),
      totalGames,
      actualRbCount,
      actualRbRate,
      actualRbDenom,
      expectedRbDenom,
      actualBbCount,
      actualBbRate,
      actualBbDenom,
      expectedBbDenom,
    });
  }

  let spearmanRb: number | null = null;
  let spearmanBb: number | null = null;

  if (quantiles.length >= 3) {
    const qRanks = quantiles.map((_, i) => i + 1);
    const rbRates = quantiles.map((q) => q.actualRbRate);
    const bbRates = quantiles.map((q) => q.actualBbRate);

    spearmanRb = calculateSpearman(qRanks, rbRates);
    spearmanBb = calculateSpearman(qRanks, bbRates);
  }

  // 単調性チェック: 推定設定が上がるほどREG確率も上がる（相関 > 0）
  const isMonotonic = spearmanRb !== null ? spearmanRb > 0 : true;
  let warning: string | undefined;

  if (spearmanRb !== null && !isMonotonic) {
    warning = '出率ベースの推定は信頼できません（推定平均設定の上昇に伴うREG確率の単調増加性が確認されません）。';
  }

  return {
    hasBonusSpec: true,
    quantiles,
    spearmanRb,
    spearmanBb,
    isMonotonic,
    warning,
  };
}

/**
 * 日単位ブロックブートストラップによる条件別比較の有意性検定
 * 台×日の独立を仮定せず、日付ごとのクラスター相関および7日間の時間自己相関を保存して標本抽出
 */
export function runConditionBlockBootstrap(
  records: Array<{
    date: string;
    highSettingProb: number;
    inCategory: boolean;
  }>,
  options: {
    blockLength?: number;
    replicates?: number;
    seed?: number;
  } = {}
): {
  pValue: number;
  diffCi95: [number, number];
  diffRate: number;
  catMean: number;
  baseMean: number;
} {
  const reps = options.replicates ?? 2000;
  const blockLen = options.blockLength ?? 7;
  const seed = options.seed ?? 42;
  const rng = createSeededRandom(seed);

  const dayMap = new Map<
    string,
    { catSum: number; catCount: number; baseSum: number; baseCount: number }
  >();

  for (const r of records) {
    let day = dayMap.get(r.date);
    if (!day) {
      day = { catSum: 0, catCount: 0, baseSum: 0, baseCount: 0 };
      dayMap.set(r.date, day);
    }
    if (r.inCategory) {
      day.catSum += r.highSettingProb;
      day.catCount += 1;
    } else {
      day.baseSum += r.highSettingProb;
      day.baseCount += 1;
    }
  }

  const uniqueDates = Array.from(dayMap.keys()).sort();
  const T = uniqueDates.length;

  let totalCatSum = 0;
  let totalCatCount = 0;
  let totalBaseSum = 0;
  let totalBaseCount = 0;

  for (const d of uniqueDates) {
    const day = dayMap.get(d)!;
    totalCatSum += day.catSum;
    totalCatCount += day.catCount;
    totalBaseSum += day.baseSum;
    totalBaseCount += day.baseCount;
  }

  const catMean = totalCatCount > 0 ? totalCatSum / totalCatCount : 0;
  const baseMean = totalBaseCount > 0 ? totalBaseSum / totalBaseCount : 0;
  const diffRate = (catMean - baseMean) * 100;

  if (T < 2 || totalCatCount === 0 || totalBaseCount === 0) {
    return {
      pValue: 1.0,
      diffCi95: [diffRate, diffRate],
      diffRate: Number(diffRate.toFixed(1)),
      catMean: Number((catMean * 100).toFixed(1)),
      baseMean: Number((baseMean * 100).toFixed(1)),
    };
  }

  const effectiveBlockLen = Math.min(blockLen, T);
  const numBlocks = T - effectiveBlockLen + 1;
  const numBlocksToSample = Math.ceil(T / effectiveBlockLen);
  const diffSamples: number[] = new Array(reps);

  for (let b = 0; b < reps; b++) {
    let bCatSum = 0;
    let bCatCount = 0;
    let bBaseSum = 0;
    let bBaseCount = 0;

    let daysSampled = 0;
    for (let nb = 0; nb < numBlocksToSample && daysSampled < T; nb++) {
      const startIdx = Math.floor(rng() * numBlocks);
      for (let k = 0; k < effectiveBlockLen && daysSampled < T; k++) {
        const d = uniqueDates[startIdx + k];
        const day = dayMap.get(d)!;
        bCatSum += day.catSum;
        bCatCount += day.catCount;
        bBaseSum += day.baseSum;
        bBaseCount += day.baseCount;
        daysSampled++;
      }
    }

    const bCatRate = bCatCount > 0 ? bCatSum / bCatCount : catMean;
    const bBaseRate = bBaseCount > 0 ? bBaseSum / bBaseCount : baseMean;
    diffSamples[b] = (bCatRate - bBaseRate) * 100;
  }

  diffSamples.sort((a, b) => a - b);
  const lowIdx = Math.max(0, Math.floor(reps * 0.025));
  const highIdx = Math.min(reps - 1, Math.floor(reps * 0.975));
  const diffCi95: [number, number] = [
    Number(diffSamples[lowIdx].toFixed(1)),
    Number(diffSamples[highIdx].toFixed(1)),
  ];

  let countLe0 = 0;
  let countGe0 = 0;
  for (let b = 0; b < reps; b++) {
    if (diffSamples[b] <= 0) countLe0++;
    if (diffSamples[b] >= 0) countGe0++;
  }
  const minCount = Math.min(countLe0, countGe0);
  const pValue = Math.min(1.0, Math.max(1 / reps, (2 * minCount) / reps));

  return {
    pValue: Number(pValue.toFixed(3)),
    diffCi95,
    diffRate: Number(diffRate.toFixed(1)),
    catMean: Number((catMean * 100).toFixed(1)),
    baseMean: Number((baseMean * 100).toFixed(1)),
  };
}

/**
 * Benjamini–Hochberg 法による多重比較 False Discovery Rate (FDR) 補正
 */
export function applyBenjaminiHochberg(
  items: ConditionComparisonItem[]
): ConditionComparisonItem[] {
  const m = items.length;
  if (m === 0) return items;

  const indexed = items.map((it, idx) => ({ idx, pValue: it.pValue }));
  indexed.sort((a, b) => a.pValue - b.pValue);

  const qVals = new Array(m);
  for (let rank = 0; rank < m; rank++) {
    const i = rank + 1; // 1-based rank
    const p = indexed[rank].pValue;
    const q = Math.min(1.0, (p * m) / i);
    qVals[rank] = q;
  }

  // 単調減少方向への調整
  for (let rank = m - 2; rank >= 0; rank--) {
    if (qVals[rank] > qVals[rank + 1]) {
      qVals[rank] = qVals[rank + 1];
    }
  }

  const result = [...items];
  for (let rank = 0; rank < m; rank++) {
    const origIdx = indexed[rank].idx;
    const q = Math.round(qVals[rank] * 1000) / 1000;
    const isSig = q < 0.05;
    result[origIdx] = {
      ...result[origIdx],
      adjustedPValue: q,
      isSignificant: isSig,
      significanceLabel: isSig ? '有意（FDR補正後 q < 0.05）' : '誤差の範囲',
    };
  }

  return result;
}

/**
 * Aタイプ出率から設定分布を推定するメイン純関数
 */
export function estimateModelSettingDistribution(
  modelName: string,
  dailyRecords: DailyRecord[],
  spec: ModelSettingSpec | null,
  options: EstimationOptions = {}
): ModelEstimationResult {
  const warnings: string[] = [];
  const minGames = options.minGames ?? 0;
  const highThreshold = options.highSettingThreshold ?? 4;
  const useRecordedPayout = options.useRecordedPayoutRate ?? false;
  const specialRules = options.specialDayRules;

  // 1. 仕様テーブルの存在確認
  if (!spec || !spec.settings || spec.settings.length < 2) {
    return {
      modelName,
      specFound: false,
      totalRecords: 0,
      evaluatedRecords: 0,
      excludedCount: 0,
      sigma: 0,
      meanGames: 0,
      discriminability: 0,
      isLowDiscriminability: false,
      converged: false,
      iterations: 0,
      distribution: [],
      highSettingOverallRate: 0,
      expectedSettingOverall: 0,
      machineEstimations: [],
      machineSummaries: [],
      conditionComparisons: [],
      dailyTrends: [],
      warnings: ['仕様値が未登録です。設定推定を行うには機械割スペックを登録してください。'],
    };
  }

  // 2. 対象機種のレコード抽出 & 前処理
  const rawRecords: DailyMachineRecord[] = [];
  const dateInfoMap = new Map<
    string,
    { dayOfWeek: string; isSpecialDay: boolean }
  >();

  for (const dr of dailyRecords) {
    const isSpecial = isDateSpecialDay(dr.date, specialRules);
    dateInfoMap.set(dr.date, {
      dayOfWeek: dr.dayOfWeek || '',
      isSpecialDay: isSpecial,
    });

    const mList = dr.machines || (dr as any).machineRecords;
    if (mList && mList.length > 0) {
      for (const mr of mList) {
        if (mr.modelName === modelName) {
          rawRecords.push(mr);
        }
      }
    }
  }

  const totalRecords = rawRecords.length;
  let excludedCount = 0;
  let diffWarningIssued = false;

  const prepared: PreparedMachineRecord[] = [];

  for (const dr of dailyRecords) {
    const mList = dr.machines || (dr as any).machineRecords;
    if (!mList) continue;
    const dateInfo = dateInfoMap.get(dr.date) || { dayOfWeek: '', isSpecialDay: false };

    for (const mr of mList) {
      if (mr.modelName !== modelName) continue;

      if (mr.games < minGames) {
        excludedCount++;
        continue;
      }

      const calculatedPayout = calculatePayoutRate(mr.games, mr.diff);
      let chosenPayout = calculatedPayout;

      if (useRecordedPayout && typeof mr.payoutRate === 'number' && mr.payoutRate > 0) {
        chosenPayout = mr.payoutRate;
      }

      if (
        !diffWarningIssued &&
        typeof mr.payoutRate === 'number' &&
        mr.payoutRate > 0 &&
        Math.abs(calculatedPayout - mr.payoutRate) >= 1.0
      ) {
        warnings.push(
          `3枚掛け計算出率とデータ記録出率の間に1ポイント以上の差（例: 計算 ${calculatedPayout.toFixed(
            1
          )}% vs 記録 ${mr.payoutRate.toFixed(1)}%）があります。`
        );
        diffWarningIssued = true;
      }

      const tailDigit = mr.machineNum % 10;
      const isZoro =
        mr.isZoro ??
        (mr.machineNum >= 11 && mr.machineNum.toString().split('').every((c) => c === mr.machineNum.toString()[0]));

      prepared.push({
        date: dr.date,
        machineNum: mr.machineNum,
        games: mr.games,
        diff: mr.diff,
        payoutRate: chosenPayout,
        recordedPayoutRate: mr.payoutRate,
        bb: mr.bb,
        rb: mr.rb,
        isSpecialDay: dateInfo.isSpecialDay,
        dayOfWeek: dateInfo.dayOfWeek,
        tailDigit,
        isZoro,
      });
    }
  }

  const evaluatedRecords = prepared.length;

  if (evaluatedRecords === 0) {
    warnings.push(
      `回転数が閾値（${minGames}G）以上の対象レコードがありません（除外: ${excludedCount}件）。`
    );
    return {
      modelName,
      specFound: true,
      spec,
      totalRecords,
      evaluatedRecords: 0,
      excludedCount,
      sigma: 0,
      meanGames: 0,
      discriminability: 0,
      isLowDiscriminability: false,
      converged: false,
      iterations: 0,
      distribution: spec.settings.map((s, idx) => ({
        label: s.label,
        settingNum: resolveSettingNum(s, idx),
        payoutRate: s.payoutRate,
        proportion: 0,
        ci95: [0, 0],
      })),
      highSettingOverallRate: 0,
      expectedSettingOverall: 0,
      machineEstimations: [],
      machineSummaries: [],
      conditionComparisons: [],
      dailyTrends: [],
      warnings,
    };
  }

  // 3. EMアルゴリズムによる π と σ の推定
  const em = runEMEstimation(prepared, spec, {
    gameWeightMode: options.gameWeightMode,
    usePoissonBonus: options.usePoissonBonus,
    poissonWeight: options.poissonWeight,
    useTDistribution: options.useTDistribution,
    tDistributionDf: options.tDistributionDf,
    maxIterations: options.maxIterations,
    convergenceTol: options.convergenceTol,
  });

  if (!em.converged) {
    warnings.push(
      `EMアルゴリズムが指定反復回数（${options.maxIterations ?? 200}回）内で収束しませんでした（参考値として出力）。`
    );
  }

  // 4. 判別力指標の算出: (R_max - R_min) / (σ / √N)
  const rates = spec.settings.map((s) => s.payoutRate);
  const rMin = Math.min(...rates);
  const rMax = Math.max(...rates);
  const meanGames =
    prepared.reduce((sum, r) => sum + r.games, 0) / evaluatedRecords;
  const meanSe = em.sigma / Math.sqrt(meanGames);
  const discriminability = meanSe > 0 ? (rMax - rMin) / meanSe : 0;
  const isLowDiscriminability = discriminability < 1.0;

  if (isLowDiscriminability) {
    warnings.push(
      `判別力指標（${discriminability.toFixed(2)}）が低いため（1.0未満）、設定判別精度は参考値となります。`
    );
  }

  // 5. ブロックブートストラップによる 95% 区間算出
  const bootstrapRes = options.pointEstimateOnly
    ? null
    : runBlockBootstrap(prepared, spec, em.pi, em.sigma, {
        replicates: options.bootstrapReps,
        seed: options.bootstrapSeed,
        usePoissonBonus: options.usePoissonBonus,
        poissonWeight: options.poissonWeight,
        useTDistribution: options.useTDistribution,
        tDistributionDf: options.tDistributionDf,
        gameWeightMode: options.gameWeightMode,
        maxIterations: options.maxIterations,
        convergenceTol: options.convergenceTol,
      });

  const intervals = options.pointEstimateOnly || !bootstrapRes
    ? spec.settings.map((_, idx) => [em.pi[idx], em.pi[idx]] as [number, number])
    : bootstrapRes.intervals;

  if (!options.pointEstimateOnly && bootstrapRes) {
    warnings.push('※ 95%信頼区間はσを固定した区間です。台数が少ないと実際より狭く出ることがあります。');
    if (bootstrapRes.nonConvergedCount > 0) {
      warnings.push(
        `ブートストラップ再標本のうち ${bootstrapRes.nonConvergedCount} 件が収束しなかったため除外しました。`
      );
    }
  }

  const distribution: SettingDistItem[] = spec.settings.map((s, idx) => ({
    label: s.label,
    settingNum: resolveSettingNum(s, idx),
    payoutRate: s.payoutRate,
    proportion: Number(em.pi[idx].toFixed(4)),
    ci95: [Number(intervals[idx][0].toFixed(4)), Number(intervals[idx][1].toFixed(4))],
  }));

  // 6. 各台×日の事後確率 & 集計
  const machineEstimations: MachineDayEstimation[] = [];
  const settingNums = distribution.map((d) => d.settingNum);

  for (let i = 0; i < evaluatedRecords; i++) {
    const rec = prepared[i];
    const postMap: Record<string, number> = {};
    let expSetting = 0;
    let highProb = 0;

    for (let s = 0; s < spec.settings.length; s++) {
      const p = em.posteriors[i][s];
      const label = spec.settings[s].label;
      postMap[label] = Number(p.toFixed(4));
      expSetting += p * settingNums[s];
      if (settingNums[s] >= highThreshold) {
        highProb += p;
      }
    }

    const indivSe = em.sigma / Math.sqrt(rec.games);
    const indivDisc = indivSe > 0 ? (rMax - rMin) / indivSe : 0;

    machineEstimations.push({
      date: rec.date,
      machineNum: rec.machineNum,
      games: rec.games,
      diff: rec.diff,
      observedPayoutRate: Number(rec.payoutRate.toFixed(2)),
      recordedPayoutRate: rec.recordedPayoutRate,
      posteriors: postMap,
      expectedSetting: Number(expSetting.toFixed(2)),
      highSettingProb: Number(highProb.toFixed(4)),
      discriminability: Number(indivDisc.toFixed(2)),
      bb: rec.bb,
      rb: rec.rb,
      isSpecialDay: rec.isSpecialDay,
      dayOfWeek: rec.dayOfWeek,
      tailDigit: rec.tailDigit,
      isZoro: rec.isZoro,
    });
  }

  // 7. 残差分布診断 (歪度・尖度)
  const residualDistribution = calculateResidualDistribution(prepared, spec, em.posteriors, em.sigma);
  if (residualDistribution.warning) {
    warnings.push(residualDistribution.warning);
  }

  // 8. 実データ妥当性検証 (キャリブレーション)
  const calibration = options.pointEstimateOnly
    ? undefined
    : calculateCalibrationValidation(machineEstimations, spec);
  if (calibration?.warning) {
    warnings.push(calibration.warning);
  }

  // 機種全体の設定4以上推定比率 & 全体平均期待設定
  let highSettingSum = 0;
  let expSettingSum = 0;
  for (let s = 0; s < distribution.length; s++) {
    if (distribution[s].settingNum >= highThreshold) {
      highSettingSum += distribution[s].proportion;
    }
    expSettingSum += distribution[s].proportion * distribution[s].settingNum;
  }
  const highSettingOverallRate = Number((highSettingSum * 100).toFixed(1));
  const expectedSettingOverall = Number(expSettingSum.toFixed(2));

  // 台番別サマリー
  const machMap = new Map<number, MachineDayEstimation[]>();
  for (const est of machineEstimations) {
    if (!machMap.has(est.machineNum)) {
      machMap.set(est.machineNum, []);
    }
    machMap.get(est.machineNum)!.push(est);
  }

  const machineSummaries: MachineSummaryItem[] = [];
  machMap.forEach((list, mNum) => {
    const daysCount = list.length;
    const totalG = list.reduce((sum, r) => sum + r.games, 0);
    const totalD = list.reduce((sum, r) => sum + r.diff, 0);
    const avgG = Math.round(totalG / daysCount);
    const avgPayout = Number(calculatePayoutRate(totalG, totalD).toFixed(2));
    const avgExpSetting = Number(
      (list.reduce((sum, r) => sum + r.expectedSetting, 0) / daysCount).toFixed(2)
    );
    const avgHighProb = Number(
      (list.reduce((sum, r) => sum + r.highSettingProb, 0) / daysCount).toFixed(4)
    );

    const labelProbSum: Record<string, number> = {};
    for (const est of list) {
      for (const [lbl, p] of Object.entries(est.posteriors)) {
        labelProbSum[lbl] = (labelProbSum[lbl] || 0) + p;
      }
    }
    let mostLikely = spec.settings[0].label;
    let maxP = -1;
    for (const [lbl, p] of Object.entries(labelProbSum)) {
      if (p > maxP) {
        maxP = p;
        mostLikely = lbl;
      }
    }

    machineSummaries.push({
      machineNum: mNum,
      daysCount,
      totalGames: totalG,
      avgGames: avgG,
      totalDiff: totalD,
      avgPayoutRate: avgPayout,
      expectedSetting: avgExpSetting,
      highSettingProb: avgHighProb,
      mostLikelySetting: mostLikely,
    });
  });

  machineSummaries.sort((a, b) => b.highSettingProb - a.highSettingProb);

  // 日別推移 (100%積み上げ棒用)
  const dayGroupMap = new Map<string, MachineDayEstimation[]>();
  for (const est of machineEstimations) {
    if (!dayGroupMap.has(est.date)) {
      dayGroupMap.set(est.date, []);
    }
    dayGroupMap.get(est.date)!.push(est);
  }

  const dailyTrends: DailyTrendItem[] = [];
  const sortedDates = Array.from(dayGroupMap.keys()).sort();

  for (const d of sortedDates) {
    const list = dayGroupMap.get(d)!;
    const count = list.length;
    const dateInfo = dateInfoMap.get(d) || { dayOfWeek: '', isSpecialDay: false };
    const avgG = Math.round(list.reduce((s, r) => s + r.games, 0) / count);
    const totG = list.reduce((s, r) => s + r.games, 0);
    const totD = list.reduce((s, r) => s + r.diff, 0);
    const avgPayout = Number(calculatePayoutRate(totG, totD).toFixed(2));
    const avgExp = Number(
      (list.reduce((s, r) => s + r.expectedSetting, 0) / count).toFixed(2)
    );
    const highRate = Number(
      ((list.reduce((s, r) => s + r.highSettingProb, 0) / count) * 100).toFixed(1)
    );

    const dist: Record<string, number> = {};
    for (const s of spec.settings) {
      let sumP = 0;
      for (const item of list) {
        sumP += item.posteriors[s.label] || 0;
      }
      dist[s.label] = Number((sumP / count).toFixed(4));
    }

    dailyTrends.push({
      date: d,
      dayOfWeek: dateInfo.dayOfWeek,
      isSpecialDay: dateInfo.isSpecialDay,
      machineCount: count,
      avgGames: avgG,
      avgPayoutRate: avgPayout,
      expectedSetting: avgExp,
      highSettingRate: highRate,
      distribution: dist,
    });
  }

  // 9. 条件別の比較 (日単位ブロックブートストラップ + Benjamini–Hochberg 多重検定補正)
  let conditionComparisons: ConditionComparisonItem[] = [];
  if (!options.pointEstimateOnly) {
    const rawConditionComparisons: ConditionComparisonItem[] = [];
    const bootstrapOpts = {
      blockLength: 7,
      replicates: options.bootstrapReps ?? 2000,
      seed: options.bootstrapSeed ?? 42,
    };

    // 9.1 特日 vs 通常日
    const specialCheckRecords = machineEstimations.map((r) => ({
      date: r.date,
      highSettingProb: r.highSettingProb,
      inCategory: Boolean(r.isSpecialDay),
    }));
    const specialCount = specialCheckRecords.filter((r) => r.inCategory).length;
    const normalCount = specialCheckRecords.filter((r) => !r.inCategory).length;

    if (specialCount >= 3 && normalCount >= 3) {
      const res = runConditionBlockBootstrap(specialCheckRecords, {
        ...bootstrapOpts,
        seed: (bootstrapOpts.seed + 101) >>> 0,
      });
      rawConditionComparisons.push({
        conditionType: 'special_day',
        categoryKey: 'special_day',
        categoryLabel: '旧イベント日 (特日)',
        machineDaysCount: specialCount,
        highSettingRate: res.catMean,
        baselineRate: res.baseMean,
        diffRate: res.diffRate,
        isSignificant: false, // BH補正後に確定
        significanceLabel: '誤差の範囲',
        pValue: res.pValue,
        diffCi95: res.diffCi95,
      });
    }

    // 9.2 曜日別
    const dowOrder = ['月', '火', '水', '木', '金', '土', '日'];
    dowOrder.forEach((dow, idx) => {
      const dowCheckRecords = machineEstimations.map((r) => ({
        date: r.date,
        highSettingProb: r.highSettingProb,
        inCategory: r.dayOfWeek.includes(dow),
      }));
      const dowCount = dowCheckRecords.filter((r) => r.inCategory).length;
      const otherCount = dowCheckRecords.filter((r) => !r.inCategory).length;

      if (dowCount >= 3 && otherCount >= 3) {
        const res = runConditionBlockBootstrap(dowCheckRecords, {
          ...bootstrapOpts,
          seed: (bootstrapOpts.seed + 200 + idx * 17) >>> 0,
        });
        rawConditionComparisons.push({
          conditionType: 'day_of_week',
          categoryKey: dow,
          categoryLabel: `${dow}曜日`,
          machineDaysCount: dowCount,
          highSettingRate: res.catMean,
          baselineRate: res.baseMean,
          diffRate: res.diffRate,
          isSignificant: false,
          significanceLabel: '誤差の範囲',
          pValue: res.pValue,
          diffCi95: res.diffCi95,
        });
      }
    });

    // 9.3 末尾番号別 (0〜9)
    for (let t = 0; t <= 9; t++) {
      const tailCheckRecords = machineEstimations.map((r) => ({
        date: r.date,
        highSettingProb: r.highSettingProb,
        inCategory: r.tailDigit === t,
      }));
      const tailCount = tailCheckRecords.filter((r) => r.inCategory).length;
      const otherCount = tailCheckRecords.filter((r) => !r.inCategory).length;

      if (tailCount >= 3 && otherCount >= 3) {
        const res = runConditionBlockBootstrap(tailCheckRecords, {
          ...bootstrapOpts,
          seed: (bootstrapOpts.seed + 300 + t * 23) >>> 0,
        });
        rawConditionComparisons.push({
          conditionType: 'tail_digit',
          categoryKey: t.toString(),
          categoryLabel: `末尾 ${t}`,
          machineDaysCount: tailCount,
          highSettingRate: res.catMean,
          baselineRate: res.baseMean,
          diffRate: res.diffRate,
          isSignificant: false,
          significanceLabel: '誤差の範囲',
          pValue: res.pValue,
          diffCi95: res.diffCi95,
        });
      }
    }

    // 9.4 Benjamini–Hochberg 法による多重検定補正
    conditionComparisons = applyBenjaminiHochberg(rawConditionComparisons);
  }

  return {
    modelName,
    specFound: true,
    spec,
    totalRecords,
    evaluatedRecords,
    excludedCount,
    sigma: Number(em.sigma.toFixed(2)),
    meanGames: Math.round(meanGames),
    discriminability: Number(discriminability.toFixed(2)),
    isLowDiscriminability,
    converged: em.converged,
    iterations: em.iterations,
    distribution,
    highSettingOverallRate,
    expectedSettingOverall,
    machineEstimations,
    machineSummaries,
    conditionComparisons,
    dailyTrends,
    calibration,
    residualDistribution,
    warnings,
    bootstrapNonConvergedCount: options.pointEstimateOnly ? 0 : bootstrapRes?.nonConvergedCount ?? 0,
    bootstrapRepsEffective: options.pointEstimateOnly ? 0 : bootstrapRes?.convergedCount ?? 0,
    bootstrapNote: 'σを固定した区間です。台数が少ないと実際より狭く出ることがあります',
  };
}
