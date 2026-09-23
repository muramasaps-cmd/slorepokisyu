import { DailyRecord } from '../data/types';
import { isSmartSlot, isAType, isJuggler } from './modelFilterUtils';

export interface HighPayoutFilterConfig {
  minPayoutRate: number; // e.g. 105.0 (%)
  minGames: number; // e.g. 3000 (G)
  minDiffCoins: number; // e.g. 0 (枚)
  categoryFilter: 'all' | 'smart_slot' | 'a_type' | 'juggler';
}

export type MachineCategory = 'smart_slot' | 'juggler' | 'a_type' | 'other';
export type MachineScaleType = 'large' | 'medium' | 'small';

export function getMachineCategory(modelName: string): MachineCategory {
  if (isJuggler(modelName)) return 'juggler';
  if (isSmartSlot(modelName)) return 'smart_slot';
  if (isAType(modelName)) return 'a_type';
  return 'other';
}

export function getCategoryLabel(cat: MachineCategory): string {
  switch (cat) {
    case 'smart_slot':
      return 'スマスロ';
    case 'juggler':
      return 'ジャグラー';
    case 'a_type':
      return 'Aタイプ';
    default:
      return 'その他';
  }
}

export function getMachineScale(totalMachines: number, isSmallCount?: boolean): MachineScaleType {
  if (isSmallCount || totalMachines <= 3) return 'small';
  if (totalMachines >= 10) return 'large';
  return 'medium';
}

export function getScaleLabel(scale: MachineScaleType): string {
  switch (scale) {
    case 'large':
      return '多台数主力 (10台以上)';
    case 'medium':
      return '中規模 (4〜9台)';
    case 'small':
      return '少数台・バラエティ (1〜3台)';
  }
}

export function calculatePayoutRate(avgGames: number, avgDiffCoins: number): number {
  if (!avgGames || avgGames <= 0) return 100.0;
  const inCoins = avgGames * 3;
  const outCoins = inCoins + avgDiffCoins;
  return Math.round((outCoins / inCoins) * 1000) / 10;
}

export interface ExtractedHighPayoutItem {
  id: string;
  date: string;
  dayOfWeek: string;
  isOldEventDay: boolean;
  modelName: string;
  category: MachineCategory;
  scaleType: MachineScaleType;
  avgDiffCoins: number;
  totalDiffCoins: number;
  avgGames: number;
  payoutRate: number;
  winRate: number | null;
  winMachines: number;
  totalMachines: number;
  isSmallCount?: boolean;
  prevDayDiffCoins?: number | null;
  prevDayPayoutRate?: number | null;
  isRebound?: boolean | null; // true if previous day was negative
  isRetention?: boolean | null; // true if previous day was positive
}

export interface ModelHighPayoutStat {
  modelName: string;
  category: MachineCategory;
  scaleType: MachineScaleType;
  totalAppearances: number;
  highPayoutCount: number;
  highPayoutRate: number; // %
  avgPayoutRateOverall: number;
  avgPayoutRateWhenHigh: number;
  avgDiffCoinsWhenHigh: number;
  avgGamesWhenHigh: number;
  totalDiffCoinsWhenHigh: number;
  winMachinesWhenHigh: number;
  totalMachinesWhenHigh: number;
  winRateWhenHigh: number | null;
  stabilityScore: number;
  quadrant: StabilityQuadrant;
}

export interface TailHighPayoutStat {
  tailName: string;
  tailNum: number | null; // null for zoro
  isZoro: boolean;
  totalDays: number;
  highPayoutCount: number;
  highPayoutRate: number; // %
  avgPayoutRateOverall: number;
  avgPayoutRateWhenHigh: number;
  avgDiffCoinsWhenHigh: number;
  avgGamesWhenHigh: number;
}

export interface DayOfWeekHighPayoutStat {
  dayOfWeek: string;
  totalEvaluated: number;
  highPayoutCount: number;
  highPayoutRate: number;
  avgPayoutRate: number;
  avgDiffCoins: number;
  avgGames: number;
}

export interface GamesBracketHighPayoutStat {
  label: string;
  minG: number;
  maxG: number;
  totalCount: number;
  highPayoutCount: number;
  highPayoutRate: number; // %
  avgPayoutRate: number;
  avgDiffCoins: number;
}

// 1. 台数規模別特徴
export interface MachineScaleStat {
  scaleType: MachineScaleType;
  label: string;
  shortLabel: string;
  description: string;
  totalEvaluated: number;
  highPayoutCount: number;
  highPayoutRate: number; // %
  shareOfHighPayout: number; // 全高出率台に占める割合 %
  avgPayoutRate: number;
  avgDiffCoins: number;
  avgGames: number;
  winRate: number;
  topModels: { modelName: string; count: number; rate: number }[];
}

// 2. 前日相関・上げ vs 据え置き特徴
export interface PreviousDayCorrelationStat {
  analyzedCount: number;
  reboundCount: number; // 上げ（前日マイナス → 当日高出率）
  reboundRate: number; // %
  retentionCount: number; // 据え置き（前日プラス → 当日高出率）
  retentionRate: number; // %
  unknownCount: number; // 前日データなし
  reboundAvgDiff: number;
  retentionAvgDiff: number;
  reboundAvgPayout: number;
  retentionAvgPayout: number;
  reboundAvgGames: number;
  retentionAvgGames: number;
  tendency: 'rebound_dominant' | 'retention_dominant' | 'balanced';
  tendencyLabel: string;
  tendencyDescription: string;
  recentPairs: {
    date: string;
    modelName: string;
    prevDiff: number;
    prevPayout: number;
    currentDiff: number;
    currentPayout: number;
    type: 'rebound' | 'retention';
  }[];
}

// 3. 安定度・勝率マトリクス
export type StabilityQuadrant =
  | 'stable_winner' // 超安定・高勝率型 (勝率>=75%)
  | 'balanced_high' // バランス高設定型 (勝率60〜74%)
  | 'volatile_explosive' // 荒波一撃型 (勝率<60%だが高出率)
  | 'unstable';

export interface StabilityMatrixStat {
  quadrants: {
    id: StabilityQuadrant;
    label: string;
    subLabel: string;
    description: string;
    color: string;
    badgeBg: string;
    badgeText: string;
    count: number;
    percent: number;
    models: ModelHighPayoutStat[];
  }[];
  avgStabilityScore: number;
}

// 4. 並び・全台系・複数機種一斉投入日分析
export interface DayClusterStat {
  totalHighDays: number;
  allStarDaysCount: number; // 3機種以上同時高出率
  allStarDaysRate: number;
  pairDaysCount: number; // 2機種同時高出率
  pairDaysRate: number;
  isolatedDaysCount: number; // 単品1機種のみ
  isolatedDaysRate: number;
  clusterTendency: 'cluster_dominant' | 'isolated_dominant' | 'balanced';
  clusterTendencyLabel: string;
  topDays: {
    date: string;
    dayOfWeek: string;
    isOldEventDay: boolean;
    highModelCount: number;
    highModels: string[];
    avgPayout: number;
    totalDiffCoins: number;
  }[];
}

// 5. ホール特徴抽出 黄金法則カルテ
export interface GoldenRuleItem {
  ruleNumber: number;
  title: string;
  highlight: string;
  detail: string;
  badgeText: string;
  badgeClass: string;
  score: number; // 1..5
}

export interface HallFeatureScorecard {
  mainMachineFocusScore: number; // 多台数主力への集中度 (1..5)
  tailBiasScore: number; // 末尾偏向の強さ (1..5)
  eventDayDependenceScore: number; // 特日依存度 (1..5)
  reboundAimingScore: number; // 凹み台上げ狙いの有効度 (1..5)
  enduranceConvictionScore: number; // 確信粘り度 (1..5)
  goldenRules: GoldenRuleItem[];
}

export interface HighPayoutInsights {
  totalEvaluated: number;
  totalHighPayout: number;
  overallHighRate: number; // %
  topModel: { modelName: string; highCount: number; rate: number; avgPayout: number; category: MachineCategory } | null;
  topTail: { tailName: string; highCount: number; rate: number; avgPayout: number } | null;
  eventDayHighRate: number;
  normalDayHighRate: number;
  eventDayMultiplier: number;
  topDayOfWeek: { day: string; rate: number; count: number } | null;
  gamesComparison: {
    highAvgGames: number;
    normalAvgGames: number;
    difference: number;
  };
  categoryBreakdown: {
    category: MachineCategory;
    label: string;
    count: number;
    percent: number;
    avgPayout: number;
    avgDiff: number;
  }[];
  topScale: {
    scaleType: MachineScaleType;
    label: string;
    highCount: number;
    share: number;
    rate: number;
  };
  scorecard: HallFeatureScorecard;
}

export interface HighPayoutAnalysisResult {
  config: HighPayoutFilterConfig;
  allItems: ExtractedHighPayoutItem[];
  highItems: ExtractedHighPayoutItem[];
  modelStats: ModelHighPayoutStat[];
  tailStats: TailHighPayoutStat[];
  dayOfWeekStats: DayOfWeekHighPayoutStat[];
  eventTimingStat: {
    eventDaysCount: number;
    eventHighCount: number;
    eventHighRate: number;
    normalDaysCount: number;
    normalHighCount: number;
    normalHighRate: number;
  };
  gamesBracketStats: GamesBracketHighPayoutStat[];
  scaleStats: MachineScaleStat[];
  reboundStat: PreviousDayCorrelationStat;
  stabilityStat: StabilityMatrixStat;
  clusterStat: DayClusterStat;
  insights: HighPayoutInsights;
}

/**
 * Main engine to extract high payout machines and analyze their features.
 */
export function analyzeHighPayoutMachines(
  dailyRecords: DailyRecord[],
  config: HighPayoutFilterConfig
): HighPayoutAnalysisResult {
  const allItems: ExtractedHighPayoutItem[] = [];
  const highItems: ExtractedHighPayoutItem[] = [];

  // Sort daily records chronologically for previous-day tracking (filtered for valid dates)
  const sortedRecords = [...(dailyRecords || [])]
    .filter((r) => r && r.date)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Build date-indexed map of models to look up previous day
  const dateModelMap = new Map<string, Map<string, { avgDiffCoins: number; payoutRate: number; avgGames: number }>>();

  sortedRecords.forEach((record) => {
    const mMap = new Map<string, { avgDiffCoins: number; payoutRate: number; avgGames: number }>();
    if (record.models && record.models.length > 0) {
      record.models.forEach((m) => {
        const pr = calculatePayoutRate(m.avgGames, m.avgDiffCoins);
        mMap.set(m.modelName, {
          avgDiffCoins: m.avgDiffCoins,
          payoutRate: pr,
          avgGames: m.avgGames,
        });
      });
    }
    dateModelMap.set(record.date, mMap);
  });

  // Helper to find previous record date
  const dateToIndex = new Map<string, number>();
  sortedRecords.forEach((r, idx) => dateToIndex.set(r.date, idx));

  // 1. Extract all model entries from daily records with previous day linking
  sortedRecords.forEach((record) => {
    const curIdx = dateToIndex.get(record.date) ?? -1;
    const prevDate = curIdx > 0 ? sortedRecords[curIdx - 1].date : null;
    const prevModels = prevDate ? dateModelMap.get(prevDate) : null;

    if (record.models && record.models.length > 0) {
      record.models.forEach((model, idx) => {
        const category = getMachineCategory(model.modelName);

        // Apply category filter if requested
        if (config.categoryFilter !== 'all') {
          if (config.categoryFilter === 'smart_slot' && category !== 'smart_slot') return;
          if (config.categoryFilter === 'juggler' && category !== 'juggler') return;
          if (config.categoryFilter === 'a_type' && category !== 'a_type' && category !== 'juggler') return;
        }

        const payoutRate = calculatePayoutRate(model.avgGames, model.avgDiffCoins);
        const scaleType = getMachineScale(model.totalMachines, model.isSmallCount);

        // Previous day metrics
        const prevInfo = prevModels ? prevModels.get(model.modelName) : null;
        const prevDayDiffCoins = prevInfo ? prevInfo.avgDiffCoins : null;
        const prevDayPayoutRate = prevInfo ? prevInfo.payoutRate : null;
        const isRebound = prevDayDiffCoins !== null ? prevDayDiffCoins < 0 : null;
        const isRetention = prevDayDiffCoins !== null ? prevDayDiffCoins > 0 : null;

        const item: ExtractedHighPayoutItem = {
          id: `${record.date}-${model.modelName}-${idx}`,
          date: record.date,
          dayOfWeek: record.dayOfWeek,
          isOldEventDay: record.isOldEventDay,
          modelName: model.modelName,
          category,
          scaleType,
          avgDiffCoins: model.avgDiffCoins,
          totalDiffCoins: model.totalDiffCoins,
          avgGames: model.avgGames,
          payoutRate,
          winRate: model.winRate,
          winMachines: model.winMachines,
          totalMachines: model.totalMachines,
          isSmallCount: model.isSmallCount,
          prevDayDiffCoins,
          prevDayPayoutRate,
          isRebound,
          isRetention,
        };

        allItems.push(item);

        // Check High Payout Criteria
        const isHighPayout =
          payoutRate >= config.minPayoutRate &&
          model.avgGames >= config.minGames &&
          model.avgDiffCoins >= config.minDiffCoins;

        if (isHighPayout) {
          highItems.push(item);
        }
      });
    } else {
      // Fallback: If day has no model breakdown, evaluate the overall daily slot result
      const category = 'other';
      const payoutRate = record.payoutRate || calculatePayoutRate(record.avgGames, record.avgDiffCoins);
      const scaleType: MachineScaleType = 'large';

      const item: ExtractedHighPayoutItem = {
        id: `${record.date}-overall`,
        date: record.date,
        dayOfWeek: record.dayOfWeek,
        isOldEventDay: record.isOldEventDay,
        modelName: 'ホール全体',
        category,
        scaleType,
        avgDiffCoins: record.avgDiffCoins,
        totalDiffCoins: record.totalDiffCoins,
        avgGames: record.avgGames,
        payoutRate,
        winRate: record.winRate,
        winMachines: record.winMachines || 0,
        totalMachines: record.totalMachines,
      };

      allItems.push(item);

      const isHighPayout =
        payoutRate >= config.minPayoutRate &&
        record.avgGames >= config.minGames &&
        record.avgDiffCoins >= config.minDiffCoins;

      if (isHighPayout) {
        highItems.push(item);
      }
    }
  });

  // 2. Aggregate by Model
  const modelMap = new Map<
    string,
    {
      category: MachineCategory;
      scaleType: MachineScaleType;
      totalCount: number;
      highCount: number;
      allPayoutRates: number[];
      highPayoutRates: number[];
      highDiffs: number[];
      highGames: number[];
      highTotalDiffs: number[];
      highWinMachines: number;
      highTotalMachines: number;
    }
  >();

  allItems.forEach((item) => {
    if (!modelMap.has(item.modelName)) {
      modelMap.set(item.modelName, {
        category: item.category,
        scaleType: item.scaleType,
        totalCount: 0,
        highCount: 0,
        allPayoutRates: [],
        highPayoutRates: [],
        highDiffs: [],
        highGames: [],
        highTotalDiffs: [],
        highWinMachines: 0,
        highTotalMachines: 0,
      });
    }

    const entry = modelMap.get(item.modelName)!;
    entry.totalCount += 1;
    entry.allPayoutRates.push(item.payoutRate);

    const isHigh =
      item.payoutRate >= config.minPayoutRate &&
      item.avgGames >= config.minGames &&
      item.avgDiffCoins >= config.minDiffCoins;

    if (isHigh) {
      entry.highCount += 1;
      entry.highPayoutRates.push(item.payoutRate);
      entry.highDiffs.push(item.avgDiffCoins);
      entry.highGames.push(item.avgGames);
      entry.highTotalDiffs.push(item.totalDiffCoins);
      entry.highWinMachines += item.winMachines;
      entry.highTotalMachines += item.totalMachines;
    }
  });

  const modelStats: ModelHighPayoutStat[] = Array.from(modelMap.entries())
    .map(([modelName, data]) => {
      const avgPayoutOverall =
        data.allPayoutRates.length > 0
          ? Math.round((data.allPayoutRates.reduce((a, b) => a + b, 0) / data.allPayoutRates.length) * 10) / 10
          : 100.0;
      const avgPayoutWhenHigh =
        data.highPayoutRates.length > 0
          ? Math.round((data.highPayoutRates.reduce((a, b) => a + b, 0) / data.highPayoutRates.length) * 10) / 10
          : 0;
      const avgDiffWhenHigh =
        data.highDiffs.length > 0
          ? Math.round(data.highDiffs.reduce((a, b) => a + b, 0) / data.highDiffs.length)
          : 0;
      const avgGamesWhenHigh =
        data.highGames.length > 0
          ? Math.round(data.highGames.reduce((a, b) => a + b, 0) / data.highGames.length)
          : 0;
      const totalDiffWhenHigh = data.highTotalDiffs.reduce((a, b) => a + b, 0);
      const highPayoutRate =
        data.totalCount > 0 ? Math.round((data.highCount / data.totalCount) * 1000) / 10 : 0;
      const winRateWhenHigh =
        data.highTotalMachines > 0
          ? Math.round((data.highWinMachines / data.highTotalMachines) * 1000) / 10
          : null;

      // Calculate Stability Score & Quadrant
      const winRateVal = winRateWhenHigh ?? 50;
      let quadrant: StabilityQuadrant = 'balanced_high';
      if (winRateVal >= 75) {
        quadrant = 'stable_winner';
      } else if (winRateVal >= 60) {
        quadrant = 'balanced_high';
      } else if (avgPayoutWhenHigh >= 108 || avgDiffWhenHigh >= 1500) {
        quadrant = 'volatile_explosive';
      } else {
        quadrant = 'unstable';
      }

      // Stability score: 0..100
      const stabilityScore = Math.min(
        100,
        Math.max(
          10,
          Math.round(winRateVal * 0.7 + (data.highCount >= 3 ? 20 : data.highCount * 6) + (avgGamesWhenHigh >= 6000 ? 10 : 0))
        )
      );

      return {
        modelName,
        category: data.category,
        scaleType: data.scaleType,
        totalAppearances: data.totalCount,
        highPayoutCount: data.highCount,
        highPayoutRate,
        avgPayoutRateOverall: avgPayoutOverall,
        avgPayoutRateWhenHigh: avgPayoutWhenHigh,
        avgDiffCoinsWhenHigh: avgDiffWhenHigh,
        avgGamesWhenHigh: avgGamesWhenHigh,
        totalDiffCoinsWhenHigh: totalDiffWhenHigh,
        winMachinesWhenHigh: data.highWinMachines,
        totalMachinesWhenHigh: data.highTotalMachines,
        winRateWhenHigh,
        stabilityScore,
        quadrant,
      };
    })
    .sort((a, b) => {
      if (b.highPayoutCount !== a.highPayoutCount) {
        return b.highPayoutCount - a.highPayoutCount;
      }
      return b.highPayoutRate - a.highPayoutRate;
    });

  // 3. Aggregate by Tail Number (from daily records tails)
  const tailMap = new Map<
    string,
    {
      tailNum: number | null;
      isZoro: boolean;
      totalDays: number;
      highCount: number;
      allPayoutRates: number[];
      highPayoutRates: number[];
      highDiffs: number[];
      highGames: number[];
    }
  >();

  dailyRecords.forEach((record) => {
    if (record.tails && record.tails.length > 0) {
      record.tails.forEach((tail) => {
        const isZoro = tail.tailName.includes('ゾロ') || tail.tailNum === null;
        const key = tail.tailName;

        if (!tailMap.has(key)) {
          tailMap.set(key, {
            tailNum: tail.tailNum ?? null,
            isZoro,
            totalDays: 0,
            highCount: 0,
            allPayoutRates: [],
            highPayoutRates: [],
            highDiffs: [],
            highGames: [],
          });
        }

        const entry = tailMap.get(key)!;
        entry.totalDays += 1;
        const payoutRate = calculatePayoutRate(tail.avgGames, tail.avgDiffCoins);
        entry.allPayoutRates.push(payoutRate);

        const isHigh =
          payoutRate >= config.minPayoutRate &&
          tail.avgGames >= config.minGames &&
          tail.avgDiffCoins >= config.minDiffCoins;

        if (isHigh) {
          entry.highCount += 1;
          entry.highPayoutRates.push(payoutRate);
          entry.highDiffs.push(tail.avgDiffCoins);
          entry.highGames.push(tail.avgGames);
        }
      });
    }
  });

  const tailStats: TailHighPayoutStat[] = Array.from(tailMap.entries())
    .map(([tailName, data]) => {
      const avgPayoutOverall =
        data.allPayoutRates.length > 0
          ? Math.round((data.allPayoutRates.reduce((a, b) => a + b, 0) / data.allPayoutRates.length) * 10) / 10
          : 100.0;
      const avgPayoutWhenHigh =
        data.highPayoutRates.length > 0
          ? Math.round((data.highPayoutRates.reduce((a, b) => a + b, 0) / data.highPayoutRates.length) * 10) / 10
          : 0;
      const avgDiffWhenHigh =
        data.highDiffs.length > 0
          ? Math.round(data.highDiffs.reduce((a, b) => a + b, 0) / data.highDiffs.length)
          : 0;
      const avgGamesWhenHigh =
        data.highGames.length > 0
          ? Math.round(data.highGames.reduce((a, b) => a + b, 0) / data.highGames.length)
          : 0;
      const highPayoutRate =
        data.totalDays > 0 ? Math.round((data.highCount / data.totalDays) * 1000) / 10 : 0;

      return {
        tailName,
        tailNum: data.tailNum,
        isZoro: data.isZoro,
        totalDays: data.totalDays,
        highPayoutCount: data.highCount,
        highPayoutRate,
        avgPayoutRateOverall: avgPayoutOverall,
        avgPayoutRateWhenHigh: avgPayoutWhenHigh,
        avgDiffCoinsWhenHigh: avgDiffWhenHigh,
        avgGamesWhenHigh: avgGamesWhenHigh,
      };
    })
    .sort((a, b) => {
      if (a.tailNum !== null && b.tailNum !== null) {
        return a.tailNum - b.tailNum;
      }
      if (a.tailNum === null) return 1;
      if (b.tailNum === null) return -1;
      return 0;
    });

  // 4. Day of Week Analysis
  const DOW_ORDER = ['月', '火', '水', '木', '金', '土', '日'];
  const dowMap = new Map<
    string,
    {
      total: number;
      highCount: number;
      payoutRates: number[];
      diffCoins: number[];
      games: number[];
    }
  >();

  DOW_ORDER.forEach((d) =>
    dowMap.set(d, {
      total: 0,
      highCount: 0,
      payoutRates: [],
      diffCoins: [],
      games: [],
    })
  );

  allItems.forEach((item) => {
    const entry = dowMap.get(item.dayOfWeek);
    if (entry) {
      entry.total += 1;
      const isHigh =
        item.payoutRate >= config.minPayoutRate &&
        item.avgGames >= config.minGames &&
        item.avgDiffCoins >= config.minDiffCoins;

      if (isHigh) {
        entry.highCount += 1;
        entry.payoutRates.push(item.payoutRate);
        entry.diffCoins.push(item.avgDiffCoins);
        entry.games.push(item.avgGames);
      }
    }
  });

  const dayOfWeekStats: DayOfWeekHighPayoutStat[] = DOW_ORDER.map((day) => {
    const data = dowMap.get(day)!;
    const rate = data.total > 0 ? Math.round((data.highCount / data.total) * 1000) / 10 : 0;
    const avgPayout =
      data.payoutRates.length > 0
        ? Math.round((data.payoutRates.reduce((a, b) => a + b, 0) / data.payoutRates.length) * 10) / 10
        : 0;
    const avgDiff =
      data.diffCoins.length > 0
        ? Math.round(data.diffCoins.reduce((a, b) => a + b, 0) / data.diffCoins.length)
        : 0;
    const avgG =
      data.games.length > 0 ? Math.round(data.games.reduce((a, b) => a + b, 0) / data.games.length) : 0;

    return {
      dayOfWeek: day,
      totalEvaluated: data.total,
      highPayoutCount: data.highCount,
      highPayoutRate: rate,
      avgPayoutRate: avgPayout,
      avgDiffCoins: avgDiff,
      avgGames: avgG,
    };
  });

  // 5. Event Days vs Normal Days Analysis
  let eventDaysCount = 0;
  let eventHighCount = 0;
  let normalDaysCount = 0;
  let normalHighCount = 0;

  allItems.forEach((item) => {
    const isHigh =
      item.payoutRate >= config.minPayoutRate &&
      item.avgGames >= config.minGames &&
      item.avgDiffCoins >= config.minDiffCoins;

    if (item.isOldEventDay) {
      eventDaysCount += 1;
      if (isHigh) eventHighCount += 1;
    } else {
      normalDaysCount += 1;
      if (isHigh) normalHighCount += 1;
    }
  });

  const eventHighRate =
    eventDaysCount > 0 ? Math.round((eventHighCount / eventDaysCount) * 1000) / 10 : 0;
  const normalHighRate =
    normalDaysCount > 0 ? Math.round((normalHighCount / normalDaysCount) * 1000) / 10 : 0;

  // 6. Games Bracket Breakdown
  const brackets = [
    { label: '〜2,999G (低稼働)', minG: 0, maxG: 2999 },
    { label: '3,000〜4,999G (中稼働)', minG: 3000, maxG: 4999 },
    { label: '5,000〜6,999G (高稼働)', minG: 5000, maxG: 6999 },
    { label: '7,000G〜 (終日粘り)', minG: 7000, maxG: 999999 },
  ];

  const gamesBracketStats: GamesBracketHighPayoutStat[] = brackets.map((b) => {
    const inBracket = allItems.filter((i) => i.avgGames >= b.minG && i.avgGames <= b.maxG);
    const highInBracket = inBracket.filter(
      (i) => i.payoutRate >= config.minPayoutRate && i.avgDiffCoins >= config.minDiffCoins
    );
    const rate = inBracket.length > 0 ? Math.round((highInBracket.length / inBracket.length) * 1000) / 10 : 0;
    const avgPayout =
      highInBracket.length > 0
        ? Math.round((highInBracket.reduce((acc, i) => acc + i.payoutRate, 0) / highInBracket.length) * 10) /
          10
        : 0;
    const avgDiff =
      highInBracket.length > 0
        ? Math.round(highInBracket.reduce((acc, i) => acc + i.avgDiffCoins, 0) / highInBracket.length)
        : 0;

    return {
      label: b.label,
      minG: b.minG,
      maxG: b.maxG,
      totalCount: inBracket.length,
      highPayoutCount: highInBracket.length,
      highPayoutRate: rate,
      avgPayoutRate: avgPayout,
      avgDiffCoins: avgDiff,
    };
  });

  // 7. 【NEW FEATURE 1】設置台数規模別 特徴分析 (Machine Scale Analysis)
  const scales: MachineScaleType[] = ['large', 'medium', 'small'];
  const scaleStats: MachineScaleStat[] = scales.map((scale) => {
    const allInScale = allItems.filter((i) => i.scaleType === scale);
    const highInScale = highItems.filter((i) => i.scaleType === scale);

    const totalEvaluated = allInScale.length;
    const highPayoutCount = highInScale.length;
    const highPayoutRate =
      totalEvaluated > 0 ? Math.round((highPayoutCount / totalEvaluated) * 1000) / 10 : 0;
    const shareOfHighPayout =
      highItems.length > 0 ? Math.round((highPayoutCount / highItems.length) * 1000) / 10 : 0;

    const avgPayoutRate =
      highInScale.length > 0
        ? Math.round((highInScale.reduce((acc, i) => acc + i.payoutRate, 0) / highInScale.length) * 10) / 10
        : 0;
    const avgDiffCoins =
      highInScale.length > 0
        ? Math.round(highInScale.reduce((acc, i) => acc + i.avgDiffCoins, 0) / highInScale.length)
        : 0;
    const avgGames =
      highInScale.length > 0
        ? Math.round(highInScale.reduce((acc, i) => acc + i.avgGames, 0) / highInScale.length)
        : 0;

    // Win rate across machines in this scale
    const totalMach = highInScale.reduce((acc, i) => acc + i.totalMachines, 0);
    const winMach = highInScale.reduce((acc, i) => acc + i.winMachines, 0);
    const winRate = totalMach > 0 ? Math.round((winMach / totalMach) * 1000) / 10 : 0;

    // Top models in this scale
    const modelCountMap = new Map<string, number>();
    highInScale.forEach((i) => {
      modelCountMap.set(i.modelName, (modelCountMap.get(i.modelName) || 0) + 1);
    });
    const topModels = Array.from(modelCountMap.entries())
      .map(([mName, count]) => {
        const mAll = allInScale.filter((i) => i.modelName === mName).length;
        const rate = mAll > 0 ? Math.round((count / mAll) * 1000) / 10 : 0;
        return { modelName: mName, count, rate };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    let shortLabel = '多台数';
    let description = '10台以上の主力看板機。店舗が最も力を入れるベース機種。';
    if (scale === 'medium') {
      shortLabel = '中規模';
      description = '4〜9台の準主力機。全台系や塊投入のターゲットになりやすい。';
    } else if (scale === 'small') {
      shortLabel = '少数台・バラ';
      description = '1〜3台構成機。単品投入やピンポイント狙いの隠れ処。';
    }

    return {
      scaleType: scale,
      label: getScaleLabel(scale),
      shortLabel,
      description,
      totalEvaluated,
      highPayoutCount,
      highPayoutRate,
      shareOfHighPayout,
      avgPayoutRate,
      avgDiffCoins,
      avgGames,
      winRate,
      topModels,
    };
  });

  // 8. 【NEW FEATURE 2】前日相関・上げ vs 据え置き分析 (Rebound vs Retention Analysis)
  const itemsWithPrev = highItems.filter((i) => i.prevDayDiffCoins !== null && i.prevDayDiffCoins !== undefined);
  const reboundItems = itemsWithPrev.filter((i) => i.isRebound === true);
  const retentionItems = itemsWithPrev.filter((i) => i.isRetention === true);

  const analyzedPrevCount = itemsWithPrev.length;
  const reboundCount = reboundItems.length;
  const retentionCount = retentionItems.length;
  const reboundRate = analyzedPrevCount > 0 ? Math.round((reboundCount / analyzedPrevCount) * 1000) / 10 : 0;
  const retentionRate = analyzedPrevCount > 0 ? Math.round((retentionCount / analyzedPrevCount) * 1000) / 10 : 0;

  const reboundAvgDiff =
    reboundItems.length > 0 ? Math.round(reboundItems.reduce((acc, i) => acc + i.avgDiffCoins, 0) / reboundItems.length) : 0;
  const retentionAvgDiff =
    retentionItems.length > 0
      ? Math.round(retentionItems.reduce((acc, i) => acc + i.avgDiffCoins, 0) / retentionItems.length)
      : 0;

  const reboundAvgPayout =
    reboundItems.length > 0
      ? Math.round((reboundItems.reduce((acc, i) => acc + i.payoutRate, 0) / reboundItems.length) * 10) / 10
      : 0;
  const retentionAvgPayout =
    retentionItems.length > 0
      ? Math.round((retentionItems.reduce((acc, i) => acc + i.payoutRate, 0) / retentionItems.length) * 10) / 10
      : 0;

  const reboundAvgGames =
    reboundItems.length > 0 ? Math.round(reboundItems.reduce((acc, i) => acc + i.avgGames, 0) / reboundItems.length) : 0;
  const retentionAvgGames =
    retentionItems.length > 0
      ? Math.round(retentionItems.reduce((acc, i) => acc + i.avgGames, 0) / retentionItems.length)
      : 0;

  let reboundTendency: 'rebound_dominant' | 'retention_dominant' | 'balanced' = 'balanced';
  let reboundTendencyLabel = '上げ・据え置き混合型';
  let reboundTendencyDescription =
    '前日マイナスの上げ狙いと前日プラスの据え置きがバランスよく混在しています。柔軟な台選びが有効です。';

  if (reboundRate >= 60) {
    reboundTendency = 'rebound_dominant';
    reboundTendencyLabel = '凹み台上げ狙い超優勢型';
    reboundTendencyDescription = `高出率台の${reboundRate}%が前日マイナスからの「上げ」で出現。前日大きく凹んでいる主力台の上げ狙いが最も期待値が高いホールです。`;
  } else if (retentionRate >= 50) {
    reboundTendency = 'retention_dominant';
    reboundTendencyLabel = '好調台据え置き多用型';
    reboundTendencyDescription = `高出率台の${retentionRate}%が前日プラスからの「据え置き」。高設定を2日以上続けて据え置く癖が強い傾向があります。`;
  }

  // Recent 10 sample pairs for exhibition
  const recentPairs = itemsWithPrev.slice(0, 10).map((i) => ({
    date: i.date,
    modelName: i.modelName,
    prevDiff: i.prevDayDiffCoins || 0,
    prevPayout: i.prevDayPayoutRate || 100,
    currentDiff: i.avgDiffCoins,
    currentPayout: i.payoutRate,
    type: (i.isRebound ? 'rebound' : 'retention') as 'rebound' | 'retention',
  }));

  const reboundStat: PreviousDayCorrelationStat = {
    analyzedCount: analyzedPrevCount,
    reboundCount,
    reboundRate,
    retentionCount,
    retentionRate,
    unknownCount: highItems.length - analyzedPrevCount,
    reboundAvgDiff,
    retentionAvgDiff,
    reboundAvgPayout,
    retentionAvgPayout,
    reboundAvgGames,
    retentionAvgGames,
    tendency: reboundTendency,
    tendencyLabel: reboundTendencyLabel,
    tendencyDescription: reboundTendencyDescription,
    recentPairs,
  };

  // 9. 【NEW FEATURE 3】勝率・安定度マトリクス (Stability & Win-Rate Matrix)
  const highModels = modelStats.filter((m) => m.highPayoutCount > 0);

  const quadrantsConfig: {
    id: StabilityQuadrant;
    label: string;
    subLabel: string;
    description: string;
    color: string;
    badgeBg: string;
    badgeText: string;
  }[] = [
    {
      id: 'stable_winner',
      label: '超安定・高勝率型',
      subLabel: '勝率75%以上',
      description: 'ジャグラーやAタイプ、安定高設定挙動のスマスロ。負けにくく手堅い収支を期待できます。',
      color: '#10b981',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-900 border-emerald-300',
    },
    {
      id: 'balanced_high',
      label: 'バランス高設定型',
      subLabel: '勝率60〜74%',
      description: '標準的な高設定配分。出率・勝率ともに良好で、終日粘る根拠として最も信頼できます。',
      color: '#3b82f6',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-900 border-blue-300',
    },
    {
      id: 'volatile_explosive',
      label: '荒波一撃型 (万枚特化)',
      subLabel: '出率超高・勝率60%未満',
      description: 'ヴヴヴ・からくり・チバリヨ等の爆発型スマスロ。勝率は控えめながら跳ねた時の破壊力が強烈。',
      color: '#8b5cf6',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-900 border-purple-300',
    },
    {
      id: 'unstable',
      label: '要検証・ブレ型',
      subLabel: '少数サンプル・低勝率',
      description: '高出率条件を満たしたものの、勝率や稼働G数のブレが大きく、更なるサンプル蓄積が必要です。',
      color: '#64748b',
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-800 border-slate-300',
    },
  ];

  const quadrants = quadrantsConfig.map((q) => {
    const modelsInQ = highModels.filter((m) => m.quadrant === q.id);
    const percent = highModels.length > 0 ? Math.round((modelsInQ.length / highModels.length) * 1000) / 10 : 0;
    return {
      ...q,
      count: modelsInQ.length,
      percent,
      models: modelsInQ,
    };
  });

  const avgStabilityScore =
    highModels.length > 0
      ? Math.round(highModels.reduce((acc, m) => acc + m.stabilityScore, 0) / highModels.length)
      : 50;

  const stabilityStat: StabilityMatrixStat = {
    quadrants,
    avgStabilityScore,
  };

  // 10. 【NEW FEATURE 4】並び・全台系・複数機種一斉投入日分析 (Day Cluster Stat)
  const dayHighMap = new Map<string, { date: string; dayOfWeek: string; isOldEventDay: boolean; items: ExtractedHighPayoutItem[] }>();

  highItems.forEach((item) => {
    if (!dayHighMap.has(item.date)) {
      dayHighMap.set(item.date, {
        date: item.date,
        dayOfWeek: item.dayOfWeek,
        isOldEventDay: item.isOldEventDay,
        items: [],
      });
    }
    dayHighMap.get(item.date)!.items.push(item);
  });

  const dayHighList = Array.from(dayHighMap.values());
  const totalHighDays = dayHighList.length;

  const allStarDays = dayHighList.filter((d) => d.items.length >= 3);
  const pairDays = dayHighList.filter((d) => d.items.length === 2);
  const isolatedDays = dayHighList.filter((d) => d.items.length === 1);

  const allStarDaysCount = allStarDays.length;
  const allStarDaysRate = totalHighDays > 0 ? Math.round((allStarDaysCount / totalHighDays) * 1000) / 10 : 0;
  const pairDaysCount = pairDays.length;
  const pairDaysRate = totalHighDays > 0 ? Math.round((pairDaysCount / totalHighDays) * 1000) / 10 : 0;
  const isolatedDaysCount = isolatedDays.length;
  const isolatedDaysRate = totalHighDays > 0 ? Math.round((isolatedDaysCount / totalHighDays) * 1000) / 10 : 0;

  let clusterTendency: 'cluster_dominant' | 'isolated_dominant' | 'balanced' = 'balanced';
  let clusterTendencyLabel = '複数投入と単品のハイブリッド型';

  if (allStarDaysRate + pairDaysRate >= 60) {
    clusterTendency = 'cluster_dominant';
    clusterTendencyLabel = '全台系・並び・お祭り集中投入型';
  } else if (isolatedDaysRate >= 60) {
    clusterTendency = 'isolated_dominant';
    clusterTendencyLabel = '日替わり単品散らし投入型';
  }

  const topDays = dayHighList
    .sort((a, b) => b.items.length - a.items.length || b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((d) => {
      const totalDiffCoins = d.items.reduce((acc, i) => acc + i.totalDiffCoins, 0);
      const avgPayout = Math.round((d.items.reduce((acc, i) => acc + i.payoutRate, 0) / d.items.length) * 10) / 10;
      return {
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        isOldEventDay: d.isOldEventDay,
        highModelCount: d.items.length,
        highModels: d.items.map((i) => i.modelName),
        avgPayout,
        totalDiffCoins,
      };
    });

  const clusterStat: DayClusterStat = {
    totalHighDays,
    allStarDaysCount,
    allStarDaysRate,
    pairDaysCount,
    pairDaysRate,
    isolatedDaysCount,
    isolatedDaysRate,
    clusterTendency,
    clusterTendencyLabel,
    topDays,
  };

  // 11. 【NEW FEATURE 5】ホール狙い目診断カルテ・黄金法則自動生成
  const totalEvaluated = allItems.length;
  const totalHighPayout = highItems.length;
  const overallHighRate =
    totalEvaluated > 0 ? Math.round((totalHighPayout / totalEvaluated) * 1000) / 10 : 0;

  const topModelItem = modelStats.find((m) => m.highPayoutCount > 0);
  const topModel = topModelItem
    ? {
        modelName: topModelItem.modelName,
        highCount: topModelItem.highPayoutCount,
        rate: topModelItem.highPayoutRate,
        avgPayout: topModelItem.avgPayoutRateWhenHigh,
        category: topModelItem.category,
      }
    : null;

  const sortedTailsByRate = [...tailStats].sort((a, b) => b.highPayoutRate - a.highPayoutRate);
  const topTailItem = sortedTailsByRate.find((t) => t.highPayoutCount > 0);
  const topTail = topTailItem
    ? {
        tailName: topTailItem.tailName,
        highCount: topTailItem.highPayoutCount,
        rate: topTailItem.highPayoutRate,
        avgPayout: topTailItem.avgPayoutRateWhenHigh,
      }
    : null;

  const eventDayMultiplier =
    normalHighRate > 0 ? Math.round((eventHighRate / normalHighRate) * 10) / 10 : eventHighRate > 0 ? 2.0 : 1.0;

  const sortedDow = [...dayOfWeekStats].sort((a, b) => b.highPayoutRate - a.highPayoutRate);
  const topDowItem = sortedDow[0];
  const topDayOfWeek = topDowItem
    ? {
        day: topDowItem.dayOfWeek,
        rate: topDowItem.highPayoutRate,
        count: topDowItem.highPayoutCount,
      }
    : null;

  const highAvgGames =
    highItems.length > 0
      ? Math.round(highItems.reduce((acc, i) => acc + i.avgGames, 0) / highItems.length)
      : 0;
  const normalItems = allItems.filter(
    (i) =>
      i.payoutRate < config.minPayoutRate ||
      i.avgGames < config.minGames ||
      i.avgDiffCoins < config.minDiffCoins
  );
  const normalAvgGames =
    normalItems.length > 0
      ? Math.round(normalItems.reduce((acc, i) => acc + i.avgGames, 0) / normalItems.length)
      : 0;

  // Category distribution
  const categoryMap: Record<MachineCategory, { count: number; payouts: number[]; diffs: number[] }> = {
    smart_slot: { count: 0, payouts: [], diffs: [] },
    juggler: { count: 0, payouts: [], diffs: [] },
    a_type: { count: 0, payouts: [], diffs: [] },
    other: { count: 0, payouts: [], diffs: [] },
  };

  highItems.forEach((item) => {
    categoryMap[item.category].count += 1;
    categoryMap[item.category].payouts.push(item.payoutRate);
    categoryMap[item.category].diffs.push(item.avgDiffCoins);
  });

  const categoryBreakdown = (
    ['smart_slot', 'juggler', 'a_type', 'other'] as MachineCategory[]
  ).map((cat) => {
    const data = categoryMap[cat];
    const percent =
      highItems.length > 0 ? Math.round((data.count / highItems.length) * 1000) / 10 : 0;
    const avgPayout =
      data.payouts.length > 0
        ? Math.round((data.payouts.reduce((a, b) => a + b, 0) / data.payouts.length) * 10) / 10
        : 0;
    const avgDiff =
      data.diffs.length > 0 ? Math.round(data.diffs.reduce((a, b) => a + b, 0) / data.diffs.length) : 0;

    return {
      category: cat,
      label: getCategoryLabel(cat),
      count: data.count,
      percent,
      avgPayout,
      avgDiff,
    };
  });

  // Top scale
  const sortedScales = [...scaleStats].sort((a, b) => b.highPayoutCount - a.highPayoutCount);
  const topScaleItem = sortedScales[0] || {
    scaleType: 'large' as MachineScaleType,
    label: '多台数主力',
    highPayoutCount: 0,
    shareOfHighPayout: 0,
    highPayoutRate: 0,
  };
  const topScale = {
    scaleType: topScaleItem.scaleType,
    label: topScaleItem.label,
    highCount: topScaleItem.highPayoutCount || 0,
    share: topScaleItem.shareOfHighPayout || 0,
    rate: topScaleItem.highPayoutRate || 0,
  };

  // Build Diagnostic Scores (1..5)
  const mainMachineFocusScore = Math.min(5, Math.max(1, Math.round(topScale.share / 20)));
  const tailBiasScore = Math.min(5, Math.max(1, Math.round((topTail?.rate || 10) / 8)));
  const eventDayDependenceScore = Math.min(5, Math.max(1, Math.round(eventDayMultiplier * 1.6)));
  const reboundAimingScore = Math.min(5, Math.max(1, Math.round(reboundRate / 20)));
  const enduranceConvictionScore = highAvgGames >= 6500 ? 5 : highAvgGames >= 5000 ? 4 : highAvgGames >= 4000 ? 3 : 2;

  // Golden Rules Generation
  const goldenRules: GoldenRuleItem[] = [
    {
      ruleNumber: 1,
      title: '機種規模の法則',
      highlight: `${topScale.label} に高出率の${topScale.share}%が集中`,
      detail: `多台数・中規模・バラエティの中で「${topScale.label}」への配分が圧倒的多数。朝イチの入場抽選が良い場合はまずこの台数規模の島へ直行するのが定石です。`,
      badgeText: `シェア ${topScale.share}%`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      score: mainMachineFocusScore,
    },
    {
      ruleNumber: 2,
      title: '前日相関・上げ狙いの法則',
      highlight: `${reboundTendencyLabel} (上げ率 ${reboundRate}%)`,
      detail: reboundTendencyDescription,
      badgeText: `上げ率 ${reboundRate}%`,
      badgeClass: reboundRate >= 60 ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-slate-100 text-slate-800 border-slate-300',
      score: reboundAimingScore,
    },
    {
      ruleNumber: 3,
      title: '特日・投入タイミングの法則',
      highlight: `特日は平日の ${eventDayMultiplier}倍 投入集中`,
      detail: `旧イベ日/特日は出現率${eventHighRate}%（通常日${normalHighRate}%）。${
        topDayOfWeek ? `曜日別では「${topDayOfWeek.day}曜日」(${topDayOfWeek.rate}%)が最も熱い傾向です。` : ''
      }`,
      badgeText: `特日 ${eventHighRate}%`,
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      score: eventDayDependenceScore,
    },
    {
      ruleNumber: 4,
      title: '本命機種・勝率安定の法則',
      highlight: topModel ? `最優先は「${topModel.modelName}」(平均出率${topModel.avgPayout}%)` : 'データ蓄積中',
      detail: topModel
        ? `高出率基準を${topModel.highCount}回達成。勝率が高く安定した高設定挙動を見せる、このホールの最重要看板機です。`
        : '条件に合致する機種データを収集中です。',
      badgeText: topModel ? `${topModel.highCount}回達成` : '-',
      badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
      score: 5,
    },
    {
      ruleNumber: 5,
      title: '末尾仕掛け・配置の法則',
      highlight: topTail ? `最有力末尾は「${topTail.tailName}」(達成率${topTail.rate}%)` : '末尾の偏りは僅差',
      detail: topTail
        ? `他の末尾と比べて高出率台の発生頻度が最も高く、平均出率も${topTail.avgPayout}%。迷った際は末尾番号も重要な判断材料です。`
        : '特定末尾への強い偏りは見られず、全末尾へ満遍なく配分されています。',
      badgeText: topTail ? `${topTail.tailName}` : '-',
      badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
      score: tailBiasScore,
    },
    {
      ruleNumber: 6,
      title: '稼働G数・確信シグナルの法則',
      highlight: `高出率台は平均 ${highAvgGames.toLocaleString()}G 粘られる`,
      detail: `通常台よりも+${(highAvgGames - normalAvgGames).toLocaleString()}G多く回されており、設定示唆や小役手応えによるプレイヤーの確信度が反映されています。夕方以降の後ヅモ狙いでも有力指標となります。`,
      badgeText: `平均 ${highAvgGames.toLocaleString()}G`,
      badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
      score: enduranceConvictionScore,
    },
  ];

  const scorecard: HallFeatureScorecard = {
    mainMachineFocusScore,
    tailBiasScore,
    eventDayDependenceScore,
    reboundAimingScore,
    enduranceConvictionScore,
    goldenRules,
  };

  return {
    config,
    allItems,
    highItems: highItems.sort((a, b) => b.payoutRate - a.payoutRate),
    modelStats,
    tailStats,
    dayOfWeekStats,
    eventTimingStat: {
      eventDaysCount,
      eventHighCount,
      eventHighRate,
      normalDaysCount,
      normalHighCount,
      normalHighRate,
    },
    gamesBracketStats,
    scaleStats,
    reboundStat,
    stabilityStat,
    clusterStat,
    insights: {
      totalEvaluated,
      totalHighPayout,
      overallHighRate,
      topModel,
      topTail,
      eventDayHighRate: eventHighRate,
      normalDayHighRate: normalHighRate,
      eventDayMultiplier,
      topDayOfWeek,
      gamesComparison: {
        highAvgGames,
        normalAvgGames,
        difference: highAvgGames - normalAvgGames,
      },
      categoryBreakdown,
      topScale,
      scorecard,
    },
  };
}
