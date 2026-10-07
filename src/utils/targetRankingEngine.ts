// Engine for calculating target machine recommendations and tail rankings for a specific target date
import { DailyRecord, DailyModelRecord, DailyTailRecord, SpecialDayRules, RankingWeights } from '../data/types';
import { calculateDayOfWeek, isDateSpecialDay } from './dataEngine';
import { isJapaneseHoliday } from './holidayUtils';
import { isSmartSlot, isAType, isJuggler } from './modelFilterUtils';

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  diffCoinDivisor: 35,
  winRateMultiplier: 0.6,
  allHighMultiplier: 4.5,
  matchingBlendWeight: 0.75,
  scaleFactorEnabled: true,
};

export interface ModelTargetScore {
  modelName: string;
  rank: number;
  rankGrade: 'S+' | 'S' | 'A' | 'B' | 'C';
  totalMachines: number;
  expectedDiffCoins: number;
  predictedWinRate: number;
  predictedPayoutRate: number;
  avgGames: number;
  compositeScore: number;
  sampleDays: number;
  // Matching event stats
  matchingDaysCount: number;
  matchingAvgDiffCoins: number;
  matchingWinRate: number;
  // All-high / High-setting days
  allHighDaysCount: number;
  // Qualitative recommendations
  tacticalReason: string;
  tags: string[];
  // Historical sample records for expansion
  sampleRecords: Array<{
    date: string;
    dayOfWeek: string;
    avgDiffCoins: number;
    winRate: number | null;
    avgGames: number;
    isOldEventDay: boolean;
  }>;
}

export interface TailTargetScore {
  tailName: string;
  tailNum: number | null;
  rank: number;
  isDateTailMatch: boolean; // Does tail match date (e.g. 17日 -> tail 7)
  expectedDiffCoins: number;
  winRate: number;
  sampleDays: number;
  recommendationLevel: '推奨' | '対抗' | '警戒' | '通常';
}

export interface TargetDateForecast {
  targetDate: string;
  dayOfWeek: string;
  isHoliday: boolean;
  isSpecialDay: boolean;
  dayTail: number;
  specialDayLabel: string;
  expectedHallStatus: '激アツ還元' | '好待遇特日' | '通常営業' | '回収傾向';
  expectedHallAvgDiffCoins: number; // Hall overall per machine
  expectedHallWinRate: number;
  expectedHallPayoutRate: number;
  matchingHistoricalDaysCount: number;
  modelRankings: ModelTargetScore[];
  tailRankings: TailTargetScore[];
  tacticalAdvice: {
    morningPriority: string;
    secondOption: string;
    tailStrategy: string;
    summary: string;
  };
}

export interface IndexedDailyModel {
  modelName: string;
  totalMachines: number;
  avgDiffCoins: number;
  avgGames: number;
  winRate: number | null;
  isAllHigh: boolean;
}

export interface IndexedDailyRecord {
  date: string;
  year: number;
  month: number;
  day: number;
  dayOfWeek: string;
  dayTail: number;
  isHoliday: boolean;
  isOldEventDay: boolean;
  avgDiffCoins: number;
  payoutRate: number;
  models: IndexedDailyModel[];
  tails?: DailyTailRecord[];
}

export interface FeatureIndex {
  records: IndexedDailyRecord[];
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
}

/**
 * Precomputes weight-independent aggregations across historical records:
 * (date attributes, holiday/special-day status, model name trimming, isAllHigh check).
 * Run once so multi-step backtests and auto-tuning do not repeat scans and slicing.
 */
export function buildFeatureIndex(
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays: string = ''
): FeatureIndex {
  if (!dailyRecords || dailyRecords.length === 0) {
    return { records: [], specialDayRules, oldEventDays };
  }

  const records: IndexedDailyRecord[] = dailyRecords.map((r) => {
    const isSpecial = specialDayRules
      ? isDateSpecialDay(r.date, specialDayRules)
      : r.isOldEventDay;
    const isHoliday = isJapaneseHoliday(r.date);
    const dayTail = r.day % 10;

    const indexedModels: IndexedDailyModel[] = [];
    if (r.models && r.models.length > 0) {
      for (let i = 0; i < r.models.length; i++) {
        const m = r.models[i];
        const name = m.modelName.trim();
        if (!name) continue;

        const isAllHigh =
          m.avgDiffCoins >= 800 && (m.winRate === null || m.winRate >= 60);

        indexedModels.push({
          modelName: name,
          totalMachines: m.totalMachines || 1,
          avgDiffCoins: m.avgDiffCoins,
          avgGames: m.avgGames,
          winRate: m.winRate,
          isAllHigh,
        });
      }
    }

    return {
      date: r.date,
      year: r.year,
      month: r.month,
      day: r.day,
      dayOfWeek: r.dayOfWeek,
      dayTail,
      isHoliday,
      isOldEventDay: isSpecial,
      avgDiffCoins: r.avgDiffCoins,
      payoutRate: r.payoutRate || 100,
      models: indexedModels,
      tails: r.tails,
    };
  });

  return {
    records,
    specialDayRules,
    oldEventDays,
  };
}

/**
 * Calculates complete forecast from pre-indexed feature structures.
 */
export function calculateTargetDateRankingFromIndex(
  targetDate: string,
  featureIndex: FeatureIndex,
  priorDaysCount?: number,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS
): TargetDateForecast | null {
  if (!targetDate || !featureIndex || featureIndex.records.length === 0) return null;

  const parts = targetDate.split(/[-/.]/);
  if (parts.length < 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const dow = calculateDayOfWeek(targetDate);
  if (!dow) return null;
  const isHoliday = isJapaneseHoliday(targetDate);
  const specialDayRules = featureIndex.specialDayRules;
  const isSpecial = specialDayRules
    ? isDateSpecialDay(targetDate, specialDayRules)
    : (day % 10 === 7);
  const dayTail = day % 10;

  // Determine special day label
  let specialDayLabel = '通常営業日';
  if (isSpecial) {
    if (specialDayRules?.customDescription) {
      specialDayLabel = specialDayRules.customDescription;
    } else if (day % 10 === 7) {
      specialDayLabel = '7のつく日 (旧イベ特日)';
    } else if (day === 11 || day === 22 || month === day) {
      specialDayLabel = 'ゾロ目の日 (特日)';
    } else {
      specialDayLabel = '店舗特定日 (特日)';
    }
  }

  const recordsToUse =
    priorDaysCount !== undefined
      ? featureIndex.records.slice(0, priorDaysCount)
      : featureIndex.records;

  if (recordsToUse.length === 0) return null;

  // Segment historical records
  const specialRecords = recordsToUse.filter((r) => r.isOldEventDay);
  const sameDowRecords = isHoliday
    ? recordsToUse.filter((r) => r.isHoliday)
    : recordsToUse.filter((r) => r.dayOfWeek === dow);
  const sameTailRecords = recordsToUse.filter((r) => r.dayTail === dayTail);
  const exactComboRecords = specialRecords.filter((r) =>
    isHoliday ? r.isHoliday : r.dayOfWeek === dow
  );

  // 5. Relevant primary cohort for target day evaluation
  const primaryCohort = isSpecial
    ? (exactComboRecords.length >= 2 ? exactComboRecords : specialRecords.length > 0 ? specialRecords : recordsToUse)
    : (sameDowRecords.length > 0 ? sameDowRecords : recordsToUse);

  // Calculate Overall Hall Expected Output
  const hallAvgDiff = primaryCohort.length > 0
    ? Math.round(primaryCohort.reduce((acc, r) => acc + r.avgDiffCoins, 0) / primaryCohort.length)
    : 0;

  const hallWinDays = primaryCohort.filter((r) => r.avgDiffCoins > 0).length;
  const hallWinRate = primaryCohort.length > 0
    ? Math.round((hallWinDays / primaryCohort.length) * 1000) / 10
    : 45;

  const hallPayout = primaryCohort.length > 0
    ? Math.round((primaryCohort.reduce((acc, r) => acc + (r.payoutRate || 100), 0) / primaryCohort.length) * 100) / 100
    : 100;

  let expectedHallStatus: TargetDateForecast['expectedHallStatus'] = '通常営業';
  if (isSpecial) {
    if (hallAvgDiff >= 100 || hallPayout >= 101.5) {
      expectedHallStatus = '激アツ還元';
    } else if (hallAvgDiff >= 0 || hallPayout >= 100.2) {
      expectedHallStatus = '好待遇特日';
    } else {
      expectedHallStatus = '通常営業';
    }
  } else {
    if (hallAvgDiff >= 50) {
      expectedHallStatus = '好待遇特日';
    } else if (hallAvgDiff <= -100) {
      expectedHallStatus = '回収傾向';
    } else {
      expectedHallStatus = '通常営業';
    }
  }

  // Fast Set lookup for primary cohort (O(1) instead of linear scan)
  const primaryDateSet = new Set<string>();
  for (let i = 0; i < primaryCohort.length; i++) {
    primaryDateSet.add(primaryCohort[i].date);
  }

  // --- MODEL RANKING CALCULATION ---
  interface ModelCollector {
    modelName: string;
    totalMachinesMax: number;
    primaryDiffs: number[];
    primaryWins: number[];
    primaryGames: number[];
    allDiffs: number[];
    allGames: number[];
    allWins: number[];
    allHighCount: number;
    matchingHistory: Array<{
      date: string;
      dayOfWeek: string;
      avgDiffCoins: number;
      winRate: number | null;
      avgGames: number;
      isOldEventDay: boolean;
    }>;
  }

  const modelMap = new Map<string, ModelCollector>();

  recordsToUse.forEach((rec) => {
    if (!rec.models || rec.models.length === 0) return;

    const isRecInPrimary = primaryDateSet.has(rec.date);
    const isRecSpecial = rec.isOldEventDay;

    rec.models.forEach((m) => {
      const name = m.modelName;
      if (!name) return;

      if (!modelMap.has(name)) {
        modelMap.set(name, {
          modelName: name,
          totalMachinesMax: m.totalMachines || 1,
          primaryDiffs: [],
          primaryWins: [],
          primaryGames: [],
          allDiffs: [],
          allGames: [],
          allWins: [],
          allHighCount: 0,
          matchingHistory: [],
        });
      }

      const entry = modelMap.get(name)!;
      if (m.totalMachines > entry.totalMachinesMax) {
        entry.totalMachinesMax = m.totalMachines;
      }

      entry.allDiffs.push(m.avgDiffCoins);
      entry.allGames.push(m.avgGames);
      if (m.winRate !== null) {
        entry.allWins.push(m.winRate);
      }

      if (m.isAllHigh) {
        entry.allHighCount += 1;
      }

      if (isRecInPrimary) {
        entry.primaryDiffs.push(m.avgDiffCoins);
        entry.primaryGames.push(m.avgGames);
        if (m.winRate !== null) {
          entry.primaryWins.push(m.winRate);
        }

        entry.matchingHistory.push({
          date: rec.date,
          dayOfWeek: rec.dayOfWeek,
          avgDiffCoins: m.avgDiffCoins,
          winRate: m.winRate,
          avgGames: m.avgGames,
          isOldEventDay: isRecSpecial,
        });
      }
    });
  });

  const scoredModels: ModelTargetScore[] = [];

  modelMap.forEach((entry) => {
    const sampleDays = entry.allDiffs.length;
    if (sampleDays === 0) return;

    const matchingDays = entry.primaryDiffs.length;
    const machines = Math.max(1, entry.totalMachinesMax);

    // Primary matching avg
    const matchingAvgDiff = matchingDays > 0
      ? Math.round(entry.primaryDiffs.reduce((a, b) => a + b, 0) / matchingDays)
      : 0;

    const matchingWinRate = entry.primaryWins.length > 0
      ? Math.round(entry.primaryWins.reduce((a, b) => a + b, 0) / entry.primaryWins.length * 10) / 10
      : 45;

    // Overall baseline avg
    const allAvgDiff = Math.round(entry.allDiffs.reduce((a, b) => a + b, 0) / sampleDays);
    const allWinRate = entry.allWins.length > 0
      ? Math.round(entry.allWins.reduce((a, b) => a + b, 0) / entry.allWins.length * 10) / 10
      : 45;

    const avgGames = entry.primaryGames.length > 0
      ? Math.round(entry.primaryGames.reduce((a, b) => a + b, 0) / entry.primaryGames.length)
      : Math.round(entry.allGames.reduce((a, b) => a + b, 0) / sampleDays);

    const diffDivisor = weights?.diffCoinDivisor ?? 35;
    const winRateMult = weights?.winRateMultiplier ?? 0.6;
    const allHighMult = weights?.allHighMultiplier ?? 4.5;
    const blendWeight = weights?.matchingBlendWeight ?? 0.75;
    const useScaleFactor = weights?.scaleFactorEnabled ?? true;

    // Blended Expected Diff Coins:
    let expectedDiffCoins = allAvgDiff;
    if (matchingDays >= 3) {
      expectedDiffCoins = Math.round(matchingAvgDiff * blendWeight + allAvgDiff * (1 - blendWeight));
    } else if (matchingDays > 0) {
      expectedDiffCoins = Math.round(matchingAvgDiff * 0.5 + allAvgDiff * 0.5);
    } else {
      expectedDiffCoins = Math.round(allAvgDiff * 0.85);
    }

    let predictedWinRate = allWinRate;
    if (matchingDays >= 3) {
      predictedWinRate = Math.round((matchingWinRate * blendWeight + allWinRate * (1 - blendWeight)) * 10) / 10;
    } else if (matchingDays > 0) {
      predictedWinRate = Math.round((matchingWinRate * 0.5 + allWinRate * 0.5) * 10) / 10;
    }

    // Estimate Payout Rate:
    const inCoins = Math.max(1500, avgGames * 3);
    const outCoins = inCoins + expectedDiffCoins;
    const predictedPayoutRate = Math.round((outCoins / inCoins) * 10000) / 100;

    // Reliability & Machine Scale Multiplier
    const scaleFactor = Math.min(1.2, 0.85 + Math.log10(Math.max(1, machines)) * 0.25);
    const sampleFactor = Math.min(1.15, 0.75 + Math.min(matchingDays, 8) * 0.05);

    // Composite ranking score (base around 50)
    let compositeScore = 50;
    compositeScore += (expectedDiffCoins / diffDivisor);
    compositeScore += (predictedWinRate - 48) * winRateMult;
    compositeScore += entry.allHighCount * allHighMult;
    if (useScaleFactor) {
      compositeScore = Math.round(compositeScore * scaleFactor * sampleFactor * 10) / 10;
    } else {
      compositeScore = Math.round(compositeScore * 10) / 10;
    }

    // Rank Grade
    let rankGrade: ModelTargetScore['rankGrade'] = 'C';
    if (compositeScore >= 80 && expectedDiffCoins > 250) {
      rankGrade = 'S+';
    } else if (compositeScore >= 68 && expectedDiffCoins > 120) {
      rankGrade = 'S';
    } else if (compositeScore >= 56 && expectedDiffCoins > 0) {
      rankGrade = 'A';
    } else if (compositeScore >= 45) {
      rankGrade = 'B';
    } else {
      rankGrade = 'C';
    }

    // Determine Tags
    const tags: string[] = [];
    if (isSmartSlot(entry.modelName)) tags.push('スマスロ');
    if (isJuggler(entry.modelName)) tags.push('ジャグラー');
    else if (isAType(entry.modelName)) tags.push('Aタイプ');
    if (machines >= 5) tags.push(`主力機(${machines}台)`);
    else if (machines === 1) tags.push('バラエティ');
    else tags.push(`少台数(${machines}台)`);

    // Tactical reason generation
    let tacticalReason = '';
    if (isSpecial) {
      if (matchingDays > 0 && matchingAvgDiff >= 500) {
        tacticalReason = `特日実績抜群（過去平均+${matchingAvgDiff}枚/勝率${matchingWinRate}%）。看板機種として優先度最高。`;
      } else if (entry.allHighCount >= 2) {
        tacticalReason = `過去に全台系・複数高設定投入の実績が${entry.allHighCount}回あり。一撃ツモが狙える本命候補。`;
      } else if (matchingWinRate >= 60) {
        tacticalReason = `同種特日での安定勝率${matchingWinRate}%。大崩れしにくく堅実な立ち回りに最適。`;
      } else if (expectedDiffCoins > 0) {
        tacticalReason = `特日平均差枚プラス圏。安定して高設定が配分される傾向あり。`;
      } else {
        tacticalReason = `通常配分想定。他機種が埋まった場合のリカバリー候補。`;
      }
    } else {
      if (matchingAvgDiff >= 300) {
        tacticalReason = `${dow}曜日の特定配分傾向あり（同曜日平均+${matchingAvgDiff}枚）。平日通常日の穴場狙い目。`;
      } else if (expectedDiffCoins > 0) {
        tacticalReason = `店舗全体でベース出率が高め。通常日でも単発高設定に期待。`;
      } else {
        tacticalReason = `通常営業配分。積極的な朝イチ確保は見送り推奨。`;
      }
    }

    scoredModels.push({
      modelName: entry.modelName,
      rank: 0,
      rankGrade,
      totalMachines: machines,
      expectedDiffCoins,
      predictedWinRate,
      predictedPayoutRate,
      avgGames,
      compositeScore,
      sampleDays,
      matchingDaysCount: matchingDays,
      matchingAvgDiffCoins: matchingAvgDiff,
      matchingWinRate,
      allHighDaysCount: entry.allHighCount,
      tacticalReason,
      tags,
      sampleRecords: entry.matchingHistory.sort((a, b) => b.date.localeCompare(a.date)),
    });
  });

  // Sort models by composite score descending
  scoredModels.sort((a, b) => b.compositeScore - a.compositeScore);
  scoredModels.forEach((m, idx) => {
    m.rank = idx + 1;
  });

  // --- TAIL NUMBER RANKING (0..9 & Zoro) ---
  interface TailCollector {
    tailName: string;
    tailNum: number | null;
    diffs: number[];
    wins: number[];
  }

  const tailMap = new Map<string, TailCollector>();
  for (let t = 0; t <= 9; t++) {
    tailMap.set(`末尾${t}`, {
      tailName: `末尾 ${t}`,
      tailNum: t,
      diffs: [],
      wins: [],
    });
  }
  tailMap.set('ゾロ目', {
    tailName: '末尾 ゾロ目',
    tailNum: null,
    diffs: [],
    wins: [],
  });

  recordsToUse.forEach((rec) => {
    if (!rec.tails || rec.tails.length === 0) return;
    const isRecInPrimary = primaryDateSet.has(rec.date);
    if (!isRecInPrimary && primaryCohort.length >= 3) return; // focus on matching days

    rec.tails.forEach((tailRec) => {
      let key = tailRec.tailName;
      if (!tailMap.has(key)) {
        if (tailRec.tailNum !== undefined && tailRec.tailNum !== null) {
          key = `末尾${tailRec.tailNum}`;
        }
      }
      const entry = tailMap.get(key);
      if (entry) {
        entry.diffs.push(tailRec.avgDiffCoins);
        if (tailRec.winRate !== null) {
          entry.wins.push(tailRec.winRate);
        }
      }
    });
  });

  const tailRankings: TailTargetScore[] = [];

  tailMap.forEach((entry) => {
    const sampleDays = entry.diffs.length;
    const avgDiff = sampleDays > 0
      ? Math.round((entry.diffs.reduce((a, b) => a + b, 0) / sampleDays) * 10) / 10
      : 0;

    const winRate = entry.wins.length > 0
      ? Math.round((entry.wins.reduce((a, b) => a + b, 0) / entry.wins.length) * 10) / 10
      : 48;

    const isDateTailMatch = entry.tailNum === dayTail;

    let recommendationLevel: TailTargetScore['recommendationLevel'] = '通常';
    if (avgDiff >= 200 || (isDateTailMatch && avgDiff > 50)) {
      recommendationLevel = '推奨';
    } else if (avgDiff > 0) {
      recommendationLevel = '対抗';
    } else if (avgDiff <= -150) {
      recommendationLevel = '警戒';
    }

    tailRankings.push({
      tailName: entry.tailName,
      tailNum: entry.tailNum,
      rank: 0,
      isDateTailMatch,
      expectedDiffCoins: avgDiff,
      winRate,
      sampleDays,
      recommendationLevel,
    });
  });

  // Sort tails by expectedDiffCoins descending
  tailRankings.sort((a, b) => {
    const scoreA = a.expectedDiffCoins + (a.isDateTailMatch ? 50 : 0);
    const scoreB = b.expectedDiffCoins + (b.isDateTailMatch ? 50 : 0);
    return scoreB - scoreA;
  });

  tailRankings.forEach((t, idx) => {
    t.rank = idx + 1;
  });

  // Tactical Advice Synthesis
  const topModel1 = scoredModels[0]?.modelName || '主力機種';
  const topModel2 = scoredModels[1]?.modelName || '対抗機種';
  const topTail = tailRankings[0]?.tailName || '好調末尾';

  const morningPriority = `【本命最優先】${topModel1} の確保を最優先に狙う。特に ${topTail} と重複する台番は激アツ期待度大。`;
  const secondOption = `【対抗候補】抽選番号が振るわない場合は ${topModel2} または ${tailRankings[1]?.tailName || '第2末尾'} の主力台番へシフト。`;
  const tailStrategy = isSpecial
    ? `日付末尾 (${dayTail}日) と過去実績首位の「${topTail}」の合致率に注目。良番時はこの2つの末尾を優先選択。`
    : `通常営業日のため、全体末尾の過信は禁物。機種単体の過去勝率を最重要視した立ち回りを推奨。`;

  const summary = isSpecial
    ? `${specialDayLabel} はホール全体での還元期待度が極めて高い勝負日。過去実績トップの「${topModel1}」を中心とした多台数メイン機種を攻めるのがセオリーです。`
    : `${targetDate}（${dow}曜）は通常営業日の配分想定。ピンポイントでの単品高設定投入を狙う慎重な立ち回りが有効です。`;

  return {
    targetDate,
    dayOfWeek: dow,
    isHoliday,
    isSpecialDay: isSpecial,
    dayTail,
    specialDayLabel,
    expectedHallStatus,
    expectedHallAvgDiffCoins: hallAvgDiff,
    expectedHallWinRate: hallWinRate,
    expectedHallPayoutRate: hallPayout,
    matchingHistoricalDaysCount: primaryCohort.length,
    modelRankings: scoredModels,
    tailRankings,
    tacticalAdvice: {
      morningPriority,
      secondOption,
      tailStrategy,
      summary,
    },
  };
}

/**
 * Calculates a complete prediction and ranking for a given target date based on store historical data.
 * Public wrapper preserving signature and exact output.
 */
export function calculateTargetDateRanking(
  targetDate: string,
  dailyRecords: DailyRecord[],
  specialDayRules?: SpecialDayRules,
  oldEventDays: string = '',
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS
): TargetDateForecast | null {
  if (!targetDate || !dailyRecords || dailyRecords.length === 0) return null;
  const featureIndex = buildFeatureIndex(dailyRecords, specialDayRules, oldEventDays);
  return calculateTargetDateRankingFromIndex(targetDate, featureIndex, undefined, weights);
}
