import { DailyRecord } from '../data/types';
import { isSmartSlot, isAType, isJuggler } from './modelFilterUtils';

export interface HighPayoutFilterConfig {
  minPayoutRate: number; // e.g. 105.0 (%)
  minGames: number; // e.g. 3000 (G)
  minDiffCoins: number; // e.g. 0 (枚)
  categoryFilter: 'all' | 'smart_slot' | 'a_type' | 'juggler';
}

export type MachineCategory = 'smart_slot' | 'juggler' | 'a_type' | 'other';

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
  avgDiffCoins: number;
  totalDiffCoins: number;
  avgGames: number;
  payoutRate: number;
  winRate: number | null;
  winMachines: number;
  totalMachines: number;
  isSmallCount?: boolean;
}

export interface ModelHighPayoutStat {
  modelName: string;
  category: MachineCategory;
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

  // 1. Extract all model entries from daily records
  dailyRecords.forEach((record) => {
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

        const item: ExtractedHighPayoutItem = {
          id: `${record.date}-${model.modelName}-${idx}`,
          date: record.date,
          dayOfWeek: record.dayOfWeek,
          isOldEventDay: record.isOldEventDay,
          modelName: model.modelName,
          category,
          avgDiffCoins: model.avgDiffCoins,
          totalDiffCoins: model.totalDiffCoins,
          avgGames: model.avgGames,
          payoutRate,
          winRate: model.winRate,
          winMachines: model.winMachines,
          totalMachines: model.totalMachines,
          isSmallCount: model.isSmallCount,
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

      const item: ExtractedHighPayoutItem = {
        id: `${record.date}-overall`,
        date: record.date,
        dayOfWeek: record.dayOfWeek,
        isOldEventDay: record.isOldEventDay,
        modelName: 'ホール全体',
        category,
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

      return {
        modelName,
        category: data.category,
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
      };
    })
    .sort((a, b) => {
      // Prioritize high payout count, then high payout rate
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
      // Sort 0..9 then zoro
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

  // 7. Auto-Extracted Insights Synthesis
  const totalEvaluated = allItems.length;
  const totalHighPayout = highItems.length;
  const overallHighRate =
    totalEvaluated > 0 ? Math.round((totalHighPayout / totalEvaluated) * 1000) / 10 : 0;

  // Top model with at least 2 appearances
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

  // Top tail by rate
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

  // Event day multiplier
  const eventDayMultiplier =
    normalHighRate > 0 ? Math.round((eventHighRate / normalHighRate) * 10) / 10 : eventHighRate > 0 ? 2.0 : 1.0;

  // Top Day of Week
  const sortedDow = [...dayOfWeekStats].sort((a, b) => b.highPayoutRate - a.highPayoutRate);
  const topDowItem = sortedDow[0];
  const topDayOfWeek = topDowItem
    ? {
        day: topDowItem.dayOfWeek,
        rate: topDowItem.highPayoutRate,
        count: topDowItem.highPayoutCount,
      }
    : null;

  // Games difference
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
    },
  };
}
