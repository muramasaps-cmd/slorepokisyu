export interface SpecialDayRules {
  tails?: number[]; // e.g. [7] for 7,17,27; [0] for 10,20,30; [6] for 6,16,26
  monthDayZoro?: boolean; // 1/1, 2/2, 3/3, etc.
  doubleDigits?: boolean; // 11日, 22日
  fixedDates?: number[]; // e.g. [1, 15]
  daysOfWeek?: string[]; // e.g. ['土', '日']
  customDescription?: string;
}

export interface IslandDefinition {
  name: string;
  startNum: number;
  endNum: number;
}

export interface CategoryRateOverride {
  rateLend?: number;
  rateExchange?: number;
}

export interface StoreInfo {
  id?: string;
  name: string;
  address: string;
  oldEventDays: string;
  exchangeRate: string;
  rateLend: number;
  rateExchange: number;
  cashRatio?: number;
  grandOpen?: string;
  totalMachinesApprox: number;
  dataRange: string;
  specialDayRules?: SpecialDayRules;
  isPreset?: boolean;
  islandConfig?: string; // e.g. "A島: 101-120, B島: 121-140" or "101-120:メイン島"
  islandDefinitions?: IslandDefinition[];
  modelAliasDictionary?: Record<string, string>;
  categoryRates?: Record<string, CategoryRateOverride>;
  includeReusedMachinesInStats?: boolean;
}

export interface RankingWeights {
  diffCoinDivisor: number; // default: 35
  winRateMultiplier: number; // default: 0.6
  allHighMultiplier: number; // default: 4.5
  matchingBlendWeight: number; // default: 0.75
  scaleFactorEnabled: boolean; // default: true
  // Prompt 3: 統計の改善オプション (すべて切替可能・既定は旧挙動のまま)
  useMachineWeighting?: boolean; // default: false (1. 台数加重平均)
  useShrinkage?: boolean; // default: false (2. 縮小推定)
  shrinkageK?: number; // default: 5 (2. 縮小係数 k)
  halfLifeDays?: number; // default: 0 (3. 時間減衰半減期、0=無効)
  normalizeAllHighRate?: boolean; // default: false (4. allHighCount 発生率正規化)
  useQuantileGrade?: boolean; // default: false (5. 分位点ランク判定)
}

export type ShrinkageMode = 'empirical' | 'fixed';
export type CohortMode = 'interaction' | 'additive';
export type ConfidenceMode = 'legacy' | 'reliability';

export interface MachineRankingWeights {
  diffWeight: number; // pts per diff coin (default 0.04)
  winRateWeight: number; // pts per win rate % above 50% (default 0.3)
  highSettingWeight: number; // pts for high setting frequency (default 20.0)
  modelScoreWeight: number; // pts for underlying model forecast score (default 0.25)
  tailMatchBonus: number; // bonus for tail digit matching target date tail (default 0.0)
  zoroBonus: number; // bonus for zoro machine number (default 0.0)
  recentStateWeight: number; // weight for prior day diff (default 0)
  shrinkageK: number; // empirical Bayes shrinkage hyperparameter (default 3)
  shrinkageMode?: ShrinkageMode; // default 'fixed'
  confidenceMode?: ConfidenceMode; // default 'legacy'
  cohortMode?: CohortMode; // default 'interaction'
  baseGames?: number; // default 5000 (30-3: 基準ゲーム数換算)
  standardGames?: number; // default 5000
  betaPriorA?: number;
  betaPriorB?: number;
  highSettingShrinkage?: { enabled: boolean; priorStrength: number }; // 30-5 (default enabled: false, priorStrength: 4)
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

export interface MachineShrinkageDiagnostics {
  sigma2: number;
  tau2: number;
  B: number;
  s2_r?: number;
  tau2_r?: number;
  B_r?: number;
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
    cohortAvgPayoutRate?: number;
    shrunkPayoutRate?: number;
    expectedDiffStd?: number;
    expectedDiffActual?: number;
    expectedDiffAtBaseGames?: number;
    avgGames?: number;
    shrinkageB?: number;
    reliabilityRate?: number;
    expectedDiffMargin80?: number;
    expectedDiff80Range?: [number, number];
  };
  history: MachineHistoryEntry[];
  shrinkageDiagnostics?: MachineShrinkageDiagnostics;
  posteriorMean: number;
  posteriorSd: number | null;
  interval80: [number, number] | null;
  reliability: number | null;
  expectedDiffAtBaseGames: number;
}

export interface StoreProfile extends StoreInfo {
  id: string;
  dailyRecords: DailyRecord[];
  customRankingWeights?: RankingWeights;
  customMachineRankingWeights?: MachineRankingWeights;
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyModelRecord {
  modelName: string;
  avgDiffCoins: number;
  totalDiffCoins: number;
  avgGames: number;
  winRate: number | null;
  winMachines: number;
  totalMachines: number;
  isSmallCount?: boolean;
}

export interface DailyTailRecord {
  tailName: string;
  tailNum?: number | null; // 0..9, or null for ゾロ目
  avgDiffCoins: number;
  totalDiffCoins: number;
  avgGames: number;
  winRate: number | null;
  winMachines: number;
  totalMachines: number;
}

export interface DailyMachineRecord {
  machineNum: number;
  modelName: string;
  games: number;
  diff: number;
  payoutRate?: number; // 出率 (%)
  refUrl?: string; // 参照URL
  bb?: number;
  rb?: number;
  isZoro?: boolean;
  tailDigit?: number;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  yearMonth: string; // YYYY-MM
  year: number;
  month: number;
  day: number;
  dayOfWeek: string;
  avgDiffCoins: number; // + is player win, - is player loss
  avgGames: number;
  winRate: number | null;
  winMachines: number | null;
  totalMachines: number;
  isReusedMachines?: boolean; // true if machine count was blank in raw data and reused from other days
  totalDiffCoins: number;
  hallCoinProfit: number;
  playerCoinProfit: number;

  // Model A: 差枚数換算モデル (Simple Diff Model)
  hallYenProfit: number;
  playerYenProfit: number;

  // Model B: G数（IN枚数）連動モデル (G-Count / Turnover Model)
  inCoins: number; // avgGames * 3 * totalMachines
  outCoins: number; // inCoins + totalDiffCoins
  payoutRate: number; // (outCoins / inCoins) * 100 (出玉率 / 機械割)
  estimatedRevenue: number; // 現金投資売上
  exchangeGapProfit: number; // 換金ギャップ利益
  gModelHallProfit: number; // G数連動粗利 (exchangeGapProfit - diffCoins * rateExchange)
  gModelPlayerProfit: number; // 客側収支

  isOldEventDay: boolean;
  is7Day: boolean;
  notable: string;

  // Daily detailed breakdown (機種別・末尾別・台番号別)
  models?: DailyModelRecord[];
  tails?: DailyTailRecord[];
  machines?: DailyMachineRecord[];
}

export interface AggregatedModelStat {
  modelName: string;
  daysCount: number;
  totalMachineDays: number;
  avgMachinesPerDay: number;
  totalDiffCoins: number;
  avgDiffCoinsPerMachine: number;
  totalHallCoinProfit: number;
  totalHallYenProfit: number;
  avgGames: number;
  winMachines: number;
  totalMachines: number;
  winRate: number;
  isSmallCount: boolean;
  eventDaysCount: number;
  eventAvgDiffCoins: number;
  normalDaysCount: number;
  normalAvgDiffCoins: number;
  dailyHistory: {
    date: string;
    avgDiffCoins: number;
    totalDiffCoins: number;
    avgGames: number;
    winRate: number | null;
    totalMachines: number;
    isOldEventDay: boolean;
  }[];
}

export interface AggregatedTailStat {
  tailName: string;
  tailNum: number | null;
  daysCount: number;
  totalMachineDays: number;
  totalDiffCoins: number;
  avgDiffCoins: number;
  avgGames: number;
  winMachines: number;
  totalMachines: number;
  winRate: number;
  eventAvgDiff: number;
  normalAvgDiff: number;
}

export interface MonthlyStat {
  yearMonth: string;
  year: number;
  month: number;
  label: string;
  daysCount: number;
  avgMachines: number;
  avgDiffCoins: number;
  totalDiffCoins: number;
  hallCoinProfit: number;
  playerCoinProfit: number;

  // Model A: 差枚数換算モデル
  hallYenProfit: number;
  playerYenProfit: number;
  cumHallCoinProfit: number;
  cumHallYenProfit: number;
  cumPlayerCoinProfit: number;
  cumPlayerYenProfit: number;

  // Model B: G数（IN枚数）連動モデル
  totalInCoins: number;
  totalOutCoins: number;
  avgPayoutRate: number; // 機械割 (出玉率%)
  estimatedRevenue: number; // 推定総売上高
  exchangeGapProfit: number; // 換金ギャップ利益
  gModelHallProfit: number; // G数連動ホール粗利
  gModelPlayerProfit: number; // G数連動客側収支
  cumGModelHallProfit: number; // 累計
  cumGModelPlayerProfit: number; // 累計

  // Model comparison
  modelDiff: number; // gModelHallProfit - hallYenProfit (換金ギャップ寄与差額)

  avgGames: number;
  avgWinRate: number | null;
  hallWinDays: number;
  playerWinDays: number;
  eventDaysCount: number;
  eventAvgDiff: number;
  eventHallYen: number;
  eventGModelHallYen: number;
  normalDaysCount: number;
  normalAvgDiff: number;
  normalHallYen: number;
  normalGModelHallYen: number;
}

export interface SlotDataSet {
  storeInfo: StoreInfo;
  monthlyStats: MonthlyStat[];
  dailyRecords: DailyRecord[];
}
