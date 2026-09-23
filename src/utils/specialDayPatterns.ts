import { DailyRecord, SpecialDayRules } from '../data/types';
import {
  getSpecialDayRuleDefinition,
  parseSpecialDayRulesFromText,
  SpecialDayRuleDefinition,
} from './specialDayRules';

export interface SpecialDayEvent {
  name: string;
  day: number;
  date: string;
  isWin: boolean;
  avgDiffCoins: number;
  avgGames: number;
  hallYenProfit: number;
  playerYenProfit: number;
}

export interface MonthPattern {
  yearMonth: string;
  label: string;
  classification: 'all_win' | 'd11_loss_d22_win' | 'all_loss' | 'mixed' | string;
  classificationName: string;
  badgeClass: string;
  lossCount: number;
  winCount: number;
  avgEventDiffCoins: number;
  totalEventDiffCoins: number;
  events: SpecialDayEvent[];
}

export interface DayTypeStat {
  name: string;
  winRate: number;
  count: number;
  winCount: number;
  lossCount: number;
  avgDiffCoins: number;
  avgGames: number;
  totalHallYen: number;
  totalPlayerYen: number;
  totalDiffCoins: number;
  payoutRate?: number;
  role?: string;
  isTop?: boolean;
}

export interface SpecialDayPatternResult {
  totalMonthsAnalyzed: number;
  ruleDef: SpecialDayRuleDefinition;
  monthPatterns: MonthPattern[];
  topDayStat: DayTypeStat;
  dayTypeStatsList: DayTypeStat[];
  correlation: {
    earlyEventName: string;
    lateEventName: string;
    d11LossCount: number;
    d11LossThen22Win: number;
    d11LossThen22WinRate: number;
  };
  trapAnalysis: {
    analyzedDaysLabel: string;
    beforeDaysLabel: string;
    afterDaysLabel: string;
    eventDayAvgDiff: number;
    eventDayWinRate: number;
    beforeDayAvgDiff: number;
    beforeDayWinRate: number;
    afterDayAvgDiff: number;
    afterDayWinRate: number;
  };
  classificationCounts: {
    all_win: number;
    d11_loss_d22_win: number;
    all_loss: number;
    mixed: number;
  };
}

export function analyzeSpecialDayPatterns(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays?: string
): SpecialDayPatternResult {
  const rules =
    specialDayRules ||
    parseSpecialDayRulesFromText(oldEventDays || '7のつく日');
  const ruleDef = getSpecialDayRuleDefinition(rules, oldEventDays);

  if (!dailyRecords || dailyRecords.length === 0) {
    const emptyDayStat: DayTypeStat = {
      name: ruleDef.dayLabels[0]?.label || '特日',
      winRate: 0,
      count: 0,
      winCount: 0,
      lossCount: 0,
      avgDiffCoins: 0,
      avgGames: 0,
      totalHallYen: 0,
      totalPlayerYen: 0,
      totalDiffCoins: 0,
      role: 'データなし',
      isTop: true,
    };

    return {
      totalMonthsAnalyzed: 0,
      ruleDef,
      monthPatterns: [],
      topDayStat: emptyDayStat,
      dayTypeStatsList: [emptyDayStat],
      correlation: {
        earlyEventName: ruleDef.dayLabels[0]?.label || '前半特日',
        lateEventName: ruleDef.dayLabels[ruleDef.dayLabels.length - 1]?.label || '後半特日',
        d11LossCount: 0,
        d11LossThen22Win: 0,
        d11LossThen22WinRate: 0,
      },
      trapAnalysis: {
        analyzedDaysLabel: ruleDef.targetDaysLabel,
        beforeDaysLabel: '前日',
        afterDaysLabel: '翌日',
        eventDayAvgDiff: 0,
        eventDayWinRate: 0,
        beforeDayAvgDiff: 0,
        beforeDayWinRate: 0,
        afterDayAvgDiff: 0,
        afterDayWinRate: 0,
      },
      classificationCounts: {
        all_win: 0,
        d11_loss_d22_win: 0,
        all_loss: 0,
        mixed: 0,
      },
    };
  }

  // 1. Group records by month
  const monthMap = new Map<string, DailyRecord[]>();
  dailyRecords.forEach((r) => {
    const list = monthMap.get(r.yearMonth) || [];
    list.push(r);
    monthMap.set(r.yearMonth, list);
  });

  const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));
  const monthPatterns: MonthPattern[] = [];

  // Track stats for each special day type across all months
  interface DayAccumulator {
    name: string;
    count: number;
    winCount: number;
    lossCount: number;
    totalDiffCoins: number;
    avgDiffList: number[];
    avgGamesList: number[];
    totalHallYen: number;
    totalPlayerYen: number;
    payoutRateList: number[];
  }

  const dayAccumulators = new Map<string, DayAccumulator>();
  ruleDef.dayLabels.forEach((dl) => {
    dayAccumulators.set(dl.label, {
      name: dl.label,
      count: 0,
      winCount: 0,
      lossCount: 0,
      totalDiffCoins: 0,
      avgDiffList: [],
      avgGamesList: [],
      totalHallYen: 0,
      totalPlayerYen: 0,
      payoutRateList: [],
    });
  });

  sortedMonths.forEach((ym) => {
    const records = (monthMap.get(ym) || []).sort((a, b) => a.day - b.day);
    const events: SpecialDayEvent[] = [];

    // Identify events for this month
    records.forEach((r) => {
      const isZoro = r.month === r.day;
      let matchedLabel: string | null = null;
      let matchedDay = r.day;

      for (const dl of ruleDef.dayLabels) {
        if (dl.day === r.day) {
          matchedLabel = dl.label;
          break;
        }
        if (ruleDef.hasZoro && dl.day === -1 && isZoro) {
          matchedLabel = '月日ゾロ目';
          matchedDay = -1;
          break;
        }
      }

      // If record is flagged as isOldEventDay but not strictly matched in dayLabels
      if (!matchedLabel && r.isOldEventDay) {
        matchedLabel = `${r.day}日`;
      }

      if (matchedLabel) {
        const isWin = r.avgDiffCoins > 0;
        const ev: SpecialDayEvent = {
          name: matchedLabel,
          day: matchedDay,
          date: r.date,
          isWin,
          avgDiffCoins: r.avgDiffCoins,
          avgGames: r.avgGames,
          hallYenProfit: r.gModelHallProfit || r.hallYenProfit || 0,
          playerYenProfit: r.gModelPlayerProfit || r.playerYenProfit || 0,
        };
        events.push(ev);

        // Accumulate
        let acc = dayAccumulators.get(matchedLabel);
        if (!acc) {
          acc = {
            name: matchedLabel,
            count: 0,
            winCount: 0,
            lossCount: 0,
            totalDiffCoins: 0,
            avgDiffList: [],
            avgGamesList: [],
            totalHallYen: 0,
            totalPlayerYen: 0,
            payoutRateList: [],
          };
          dayAccumulators.set(matchedLabel, acc);
        }
        acc.count++;
        if (isWin) {
          acc.winCount++;
        } else {
          acc.lossCount++;
        }
        acc.totalDiffCoins += r.totalDiffCoins;
        acc.avgDiffList.push(r.avgDiffCoins);
        acc.avgGamesList.push(r.avgGames);
        acc.totalHallYen += r.gModelHallProfit || r.hallYenProfit || 0;
        acc.totalPlayerYen += r.gModelPlayerProfit || r.playerYenProfit || 0;
        if (r.payoutRate) acc.payoutRateList.push(r.payoutRate);
      }
    });

    if (events.length > 0) {
      const winCount = events.filter((e) => e.isWin).length;
      const lossCount = events.length - winCount;
      const totalEventDiffCoins = events.reduce((sum, e) => sum + (e.avgDiffCoins * 500), 0);
      const avgEventDiffCoins = Math.round(
        events.reduce((sum, e) => sum + e.avgDiffCoins, 0) / events.length
      );

      let classification: MonthPattern['classification'] = 'mixed';
      let classificationName = '一部放出・回収';
      let badgeClass = 'bg-slate-50 text-slate-700 border-slate-200';

      const firstEv = events[0];
      const secondEv = events.length > 1 ? events[1] : null;

      if (winCount === events.length) {
        classification = 'all_win';
        classificationName = '全特日放出 (パーフェクト)';
        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
      } else if (firstEv && !firstEv.isWin && secondEv && secondEv.isWin) {
        classification = 'd11_loss_d22_win';
        classificationName = `${firstEv.name}回収 → ${secondEv.name}リベンジ`;
        badgeClass = 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
      } else if (lossCount === events.length) {
        classification = 'all_loss';
        classificationName = '全特日回収 (注意月)';
        badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
      }

      const [y, m] = ym.split('-');
      const label = `${y}年${parseInt(m, 10)}月`;

      monthPatterns.push({
        yearMonth: ym,
        label,
        classification,
        classificationName,
        badgeClass,
        lossCount,
        winCount,
        avgEventDiffCoins,
        totalEventDiffCoins,
        events,
      });
    }
  });

  // 2. Day Type Stats List
  const dayTypeStatsList: DayTypeStat[] = Array.from(dayAccumulators.values())
    .filter((acc) => acc.count > 0)
    .map((acc) => {
      const winRate = acc.count > 0 ? Math.round((acc.winCount / acc.count) * 100) : 0;
      const avgDiffCoins =
        acc.avgDiffList.length > 0
          ? Math.round(acc.avgDiffList.reduce((a, b) => a + b, 0) / acc.avgDiffList.length)
          : 0;
      const avgGames =
        acc.avgGamesList.length > 0
          ? Math.round(acc.avgGamesList.reduce((a, b) => a + b, 0) / acc.avgGamesList.length)
          : 0;
      const payoutRate =
        acc.payoutRateList.length > 0
          ? Math.round((acc.payoutRateList.reduce((a, b) => a + b, 0) / acc.payoutRateList.length) * 10) / 10
          : undefined;

      return {
        name: acc.name,
        winRate,
        count: acc.count,
        winCount: acc.winCount,
        lossCount: acc.lossCount,
        avgDiffCoins,
        avgGames,
        totalHallYen: acc.totalHallYen,
        totalPlayerYen: acc.totalPlayerYen,
        totalDiffCoins: acc.totalDiffCoins,
        payoutRate,
        role: winRate >= 60 ? '本命還元特日' : winRate <= 35 ? '回収・予算調整日' : '標準営業日',
      };
    })
    .sort((a, b) => b.winRate - a.winRate || b.avgDiffCoins - a.avgDiffCoins);

  if (dayTypeStatsList.length > 0) {
    dayTypeStatsList[0].isTop = true;
  }

  const topDayStat: DayTypeStat = dayTypeStatsList[0] || {
    name: ruleDef.dayLabels[0]?.label || '特日',
    winRate: 0,
    count: 0,
    winCount: 0,
    lossCount: 0,
    avgDiffCoins: 0,
    avgGames: 0,
    totalHallYen: 0,
    totalPlayerYen: 0,
    totalDiffCoins: 0,
    role: 'データなし',
    isTop: true,
  };

  // 3. Correlation (early event loss -> late event win)
  const earlyEventName = ruleDef.dayLabels[0]?.label || '7日';
  const lateEventName = ruleDef.dayLabels[1]?.label || ruleDef.dayLabels[ruleDef.dayLabels.length - 1]?.label || '27日';

  let d11LossCount = 0;
  let d11LossThen22Win = 0;

  monthPatterns.forEach((mp) => {
    const earlyEv = mp.events.find((e) => e.name === earlyEventName);
    const lateEv = mp.events.find((e) => e.name === lateEventName);
    if (earlyEv && !earlyEv.isWin) {
      d11LossCount++;
      if (lateEv && lateEv.isWin) {
        d11LossThen22Win++;
      }
    }
  });

  const d11LossThen22WinRate =
    d11LossCount > 0 ? Math.round((d11LossThen22Win / d11LossCount) * 100) : 0;

  // 4. Trap Analysis (day before and after event days)
  const allRecordsDateMap = new Map<string, DailyRecord>();
  dailyRecords.forEach((r) => allRecordsDateMap.set(r.date, r));

  const beforeDiffs: number[] = [];
  const eventDiffs: number[] = [];
  const afterDiffs: number[] = [];

  dailyRecords.forEach((r) => {
    if (r.isOldEventDay) {
      eventDiffs.push(r.avgDiffCoins);

      // Find day before & after
      const parts = r.date.split(/[-/.]/);
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);

        const beforeDate = new Date(y, m - 1, d - 1);
        const bStr = `${beforeDate.getFullYear()}-${String(beforeDate.getMonth() + 1).padStart(2, '0')}-${String(beforeDate.getDate()).padStart(2, '0')}`;
        const bRec = allRecordsDateMap.get(bStr);
        if (bRec && !bRec.isOldEventDay) {
          beforeDiffs.push(bRec.avgDiffCoins);
        }

        const afterDate = new Date(y, m - 1, d + 1);
        const aStr = `${afterDate.getFullYear()}-${String(afterDate.getMonth() + 1).padStart(2, '0')}-${String(afterDate.getDate()).padStart(2, '0')}`;
        const aRec = allRecordsDateMap.get(aStr);
        if (aRec && !aRec.isOldEventDay) {
          afterDiffs.push(aRec.avgDiffCoins);
        }
      }
    }
  });

  const calcWinRate = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.filter((v) => v > 0).length / arr.length) * 100) : 0;
  const calcAvg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  // Labels for before and after
  const targetDays = ruleDef.targetDays || [7, 17, 27];
  const beforeDaysLabel = targetDays.map((d) => `${d - 1}日`).join('・') || '前日';
  const afterDaysLabel = targetDays.map((d) => `${d + 1}日`).join('・') || '翌日';

  const trapAnalysis = {
    analyzedDaysLabel: ruleDef.targetDaysLabel,
    beforeDaysLabel,
    afterDaysLabel,
    eventDayAvgDiff: calcAvg(eventDiffs),
    eventDayWinRate: calcWinRate(eventDiffs),
    beforeDayAvgDiff: calcAvg(beforeDiffs),
    beforeDayWinRate: calcWinRate(beforeDiffs),
    afterDayAvgDiff: calcAvg(afterDiffs),
    afterDayWinRate: calcWinRate(afterDiffs),
  };

  // 5. Classification counts
  const classificationCounts = {
    all_win: monthPatterns.filter((m) => m.classification === 'all_win').length,
    d11_loss_d22_win: monthPatterns.filter((m) => m.classification === 'd11_loss_d22_win').length,
    all_loss: monthPatterns.filter((m) => m.classification === 'all_loss').length,
    mixed: monthPatterns.filter((m) => m.classification === 'mixed').length,
  };

  return {
    totalMonthsAnalyzed: monthPatterns.length,
    ruleDef,
    monthPatterns,
    topDayStat,
    dayTypeStatsList,
    correlation: {
      earlyEventName,
      lateEventName,
      d11LossCount,
      d11LossThen22Win,
      d11LossThen22WinRate,
    },
    trapAnalysis,
    classificationCounts,
  };
}
