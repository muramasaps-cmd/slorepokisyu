/**
 * A-Type Setting Distribution Estimation Engine (Aタイプ出率・設定値分布推定)
 *
 * 【モデル概要】
 * - 対象: isAType() === true の機種 (ジャグラー系を含む)
 * - 台×日ごとの観測出率 x は、設定 s の下で x ~ Normal(R_s, σ² / N)
 *   (N = 回転数, R_s = 機種仕様テーブルの機械割 %)
 * - 混合比率 π_s と分散パラメータ σ² は、EMアルゴリズム（Expectation-Maximization）により同時推定
 * - 各台×日の事後確率 P(設定=s | x, N, π) を算出
 * - ブロックブートストラップ (ブロック長7日、2000回、乱数シード固定) による π_s の95%信頼区間
 * - 判別力指標 (R_max - R_min) / (σ / √N) による推定信頼性の診断
 * - 条件別比較 (特日vs通常日, 曜日別, 末尾別) と有意差判定
 */

import { DailyRecord, DailyMachineRecord, SpecialDayRules } from '../data/types';
import { HIGH_SETTING_THRESHOLDS } from './highSettingConfig';
import { ModelSettingSpec, resolveSettingNum } from './settingSpecs';
import { isDateSpecialDay } from './dataEngine';

export interface EstimationOptions {
  /** 最小回転数閾値 (既定 3000G) */
  minGames?: number;
  /** 高設定判定の閾値 (既定 4 以上) */
  highSettingThreshold?: number;
  /** レコード記載の payoutRate を優先使用するか (既定 false: 3枚掛け計算) */
  useRecordedPayoutRate?: boolean;
  /** BB/RBポアソン尤度を加味するか (既定 false) */
  usePoissonBonus?: boolean;
  /** ポアソン尤度の割引重み λ (既定 0.5) */
  poissonWeight?: number;
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
  isSignificant: boolean; // 有意差ありか
  significanceLabel: string; // '有意（p < 0.05）' | '誤差の範囲'
  pValue: number;
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
  warnings: string[];
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
 * 標準正規分布の相補誤差関数に基づく両側p値算出
 */
function calculateTwoProportionZTest(
  countA: number,
  propA: number,
  countB: number,
  propB: number
): { pValue: number; isSignificant: boolean } {
  if (countA < 3 || countB < 3) {
    return { pValue: 1.0, isSignificant: false };
  }

  // クリップ
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

  // 近似正規分布累積関数からp値を算出 (Abramowitz & Stegun 7.1.26 近似)
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const pOneTail =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pValue = Math.min(1.0, Math.max(0.0, pOneTail * 2));

  return {
    pValue,
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
 * 内部処理用: 評価対象となった台レコードの構造体
 */
interface PreparedMachineRecord {
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
 */
export function runEMEstimation(
  records: PreparedMachineRecord[],
  spec: ModelSettingSpec,
  options: {
    usePoissonBonus?: boolean;
    poissonWeight?: number;
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

  // 初期の σ² 推定
  const rates = spec.settings.map((s) => s.payoutRate);
  const meanRate = rates.reduce((a, b) => a + b, 0) / K;
  let initialVar = options.initialSigma ? options.initialSigma * options.initialSigma : 0;
  if (!initialVar) {
    let sumDev = 0;
    for (const r of records) {
      sumDev += r.games * (r.payoutRate - meanRate) * (r.payoutRate - meanRate);
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

  // ポアソン対数尤度の事前計算 (任意オプション)
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

  for (; iteration < maxIter; iteration++) {
    const sigma = Math.sqrt(sigma2);

    // E-Step
    for (let i = 0; i < M; i++) {
      const rec = records[i];
      const logLik = new Float64Array(K);
      let maxLog = -Infinity;

      for (let s = 0; s < K; s++) {
        const pPrior = Math.max(1e-12, pi[s]);
        // log Normal(R_s, sigma^2 / N_i)
        // = -0.5 * ln(2*pi) - 0.5 * ln(sigma^2 / N_i) - 0.5 * N_i * (x - R_s)^2 / sigma^2
        const var_i = sigma2 / rec.games;
        const logNorm =
          -0.5 * Math.log(2 * Math.PI) -
          0.5 * Math.log(var_i) -
          (0.5 * rec.games * sqDiffs[i][s]) / sigma2;

        let total = Math.log(pPrior) + logNorm;
        if (usePoisson) {
          total += poissonLogs[i][s];
        }
        logLik[s] = total;
        if (total > maxLog) maxLog = total;
      }

      // Log-sum-exp
      let sumExp = 0;
      for (let s = 0; s < K; s++) {
        sumExp += Math.exp(logLik[s] - maxLog);
      }
      const logSum = maxLog + Math.log(sumExp);

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
    // 正規化
    const piSum = nextPi.reduce((a, b) => a + b, 0);
    for (let s = 0; s < K; s++) {
      nextPi[s] /= piSum;
    }

    // M-Step: σ² の更新
    let nextSigma2Num = 0;
    for (let i = 0; i < M; i++) {
      let recWDev = 0;
      for (let s = 0; s < K; s++) {
        recWDev += responsibilities[i][s] * sqDiffs[i][s];
      }
      nextSigma2Num += records[i].games * recWDev;
    }
    const nextSigma2 = Math.max(100, nextSigma2Num / M);

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
 * 日単位ブロックブートストラップ (ブロック長7日、2000回、乱数シード固定)
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
  } = {}
): Array<[number, number]> {
  const K = spec.settings.length;
  const reps = options.replicates ?? 2000;
  const blockLen = options.blockLength ?? 7;
  const seed = options.seed ?? 42;
  const rng = createSeededRandom(seed);

  // 日付順にユニーク日を取得
  const dateMap = new Map<string, PreparedMachineRecord[]>();
  for (const r of records) {
    if (!dateMap.has(r.date)) {
      dateMap.set(r.date, []);
    }
    dateMap.get(r.date)!.push(r);
  }

  const uniqueDates = Array.from(dateMap.keys()).sort();
  const T = uniqueDates.length;

  if (T === 0 || K === 0) {
    return new Array(K).fill([0, 0]);
  }

  const effectiveBlockLen = Math.min(blockLen, T);
  const numBlocks = T - effectiveBlockLen + 1;

  // 各ブートストラップ標本の π_s を記録
  const piSamples: number[][] = Array.from({ length: K }, () => []);

  const numBlocksToSample = Math.ceil(T / effectiveBlockLen);

  for (let b = 0; b < reps; b++) {
    const sampledDates: string[] = [];
    for (let nb = 0; nb < numBlocksToSample; nb++) {
      const startIdx = Math.floor(rng() * numBlocks);
      for (let k = 0; k < effectiveBlockLen; k++) {
        if (sampledDates.length < T) {
          sampledDates.push(uniqueDates[startIdx + k]);
        }
      }
    }

    const resampledRecords: PreparedMachineRecord[] = [];
    for (const d of sampledDates) {
      const list = dateMap.get(d);
      if (list) {
        for (const r of list) resampledRecords.push(r);
      }
    }

    if (resampledRecords.length === 0) continue;

    // ウォームスタートによる高速EM (数回の反復で収束)
    const emResult = runEMEstimation(resampledRecords, spec, {
      maxIterations: 10,
      initialPi: pointPi,
      initialSigma: pointSigma,
      usePoissonBonus: options.usePoissonBonus,
      poissonWeight: options.poissonWeight,
    });

    for (let s = 0; s < K; s++) {
      piSamples[s].push(emResult.pi[s]);
    }
  }

  // 95% 区間 (パーセンタイル法: 2.5% と 97.5%)
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

  return intervals;
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
  const minGames = options.minGames ?? 3000;
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

      // 1ポイント以上の乖離チェック
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
    usePoissonBonus: options.usePoissonBonus,
    poissonWeight: options.poissonWeight,
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
  const intervals = runBlockBootstrap(prepared, spec, em.pi, em.sigma, {
    replicates: options.bootstrapReps,
    seed: options.bootstrapSeed,
    usePoissonBonus: options.usePoissonBonus,
    poissonWeight: options.poissonWeight,
  });

  // 設定ごとの分布構造体
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

  // 7. 台番別サマリー (台ごとの集約)
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

    // 最尤設定
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

  // 8. 日別推移 (100%積み上げ棒用)
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

  // 9. 条件別の比較 (特日 vs 通常日、曜日別、末尾別)
  const conditionComparisons: ConditionComparisonItem[] = [];

  // 9.1 特日 vs 通常日
  const specialRecords = machineEstimations.filter((r) => r.isSpecialDay);
  const normalRecords = machineEstimations.filter((r) => !r.isSpecialDay);

  if (specialRecords.length > 0 && normalRecords.length > 0) {
    const spMean =
      specialRecords.reduce((s, r) => s + r.highSettingProb, 0) / specialRecords.length;
    const normMean =
      normalRecords.reduce((s, r) => s + r.highSettingProb, 0) / normalRecords.length;
    const test = calculateTwoProportionZTest(
      specialRecords.length,
      spMean,
      normalRecords.length,
      normMean
    );

    conditionComparisons.push({
      conditionType: 'special_day',
      categoryKey: 'special_day',
      categoryLabel: '旧イベント日 (特日)',
      machineDaysCount: specialRecords.length,
      highSettingRate: Number((spMean * 100).toFixed(1)),
      baselineRate: Number((normMean * 100).toFixed(1)),
      diffRate: Number(((spMean - normMean) * 100).toFixed(1)),
      isSignificant: test.isSignificant,
      significanceLabel: test.isSignificant ? '有意差あり (p < 0.05)' : '誤差の範囲',
      pValue: Number(test.pValue.toFixed(3)),
    });
  }

  // 9.2 曜日別
  const dowOrder = ['月', '火', '水', '木', '金', '土', '日'];
  for (const dow of dowOrder) {
    const dowRecs = machineEstimations.filter((r) => r.dayOfWeek.includes(dow));
    if (dowRecs.length < 3) continue;
    const otherRecs = machineEstimations.filter((r) => !r.dayOfWeek.includes(dow));
    const dowMean = dowRecs.reduce((s, r) => s + r.highSettingProb, 0) / dowRecs.length;
    const otherMean =
      otherRecs.length > 0
        ? otherRecs.reduce((s, r) => s + r.highSettingProb, 0) / otherRecs.length
        : dowMean;

    const test = calculateTwoProportionZTest(dowRecs.length, dowMean, otherRecs.length, otherMean);

    conditionComparisons.push({
      conditionType: 'day_of_week',
      categoryKey: dow,
      categoryLabel: `${dow}曜日`,
      machineDaysCount: dowRecs.length,
      highSettingRate: Number((dowMean * 100).toFixed(1)),
      baselineRate: Number((otherMean * 100).toFixed(1)),
      diffRate: Number(((dowMean - otherMean) * 100).toFixed(1)),
      isSignificant: test.isSignificant,
      significanceLabel: test.isSignificant ? '有意差あり (p < 0.05)' : '誤差の範囲',
      pValue: Number(test.pValue.toFixed(3)),
    });
  }

  // 9.3 末尾番号別 (0〜9)
  for (let t = 0; t <= 9; t++) {
    const tailRecs = machineEstimations.filter((r) => r.tailDigit === t);
    if (tailRecs.length < 3) continue;
    const otherRecs = machineEstimations.filter((r) => r.tailDigit !== t);
    const tailMean = tailRecs.reduce((s, r) => s + r.highSettingProb, 0) / tailRecs.length;
    const otherMean =
      otherRecs.length > 0
        ? otherRecs.reduce((s, r) => s + r.highSettingProb, 0) / otherRecs.length
        : tailMean;

    const test = calculateTwoProportionZTest(tailRecs.length, tailMean, otherRecs.length, otherMean);

    conditionComparisons.push({
      conditionType: 'tail_digit',
      categoryKey: t.toString(),
      categoryLabel: `末尾 ${t}`,
      machineDaysCount: tailRecs.length,
      highSettingRate: Number((tailMean * 100).toFixed(1)),
      baselineRate: Number((otherMean * 100).toFixed(1)),
      diffRate: Number(((tailMean - otherMean) * 100).toFixed(1)),
      isSignificant: test.isSignificant,
      significanceLabel: test.isSignificant ? '有意差あり (p < 0.05)' : '誤差の範囲',
      pValue: Number(test.pValue.toFixed(3)),
    });
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
    warnings,
  };
}
