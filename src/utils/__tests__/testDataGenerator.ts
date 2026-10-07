import { DailyRecord, DailyModelRecord, DailyTailRecord, SpecialDayRules } from '../../data/types';
import { calculateDayOfWeek, isDateSpecialDay, processStoreData } from '../dataEngine';

export const SYNTHETIC_MODELS = [
  'マイジャグラーV',
  'アイムジャグラーEX',
  'ファンキージャグラー2',
  'L パチスロ北斗の拳',
  'L からくりサーカス',
  'L 革命機ヴァルヴレイヴ',
  'L モンキーターンV',
  '押忍！番長4',
  '沖ドキ！GOLD',
  'L バジリスク〜甲賀忍法帖〜絆2 天膳',
  '新ハナビ',
  '甲鉄城のカバネリ',
  'L ガールズ＆パンツァー 最終章',
  'L 戦国乙女4 戦乱に閃く炯眼の軍師',
  'キングハナハナ-30',
];

/**
 * Deterministic PRNG using Mulberry32
 */
export function createSeededRandom(initialSeed = 42) {
  let s = initialSeed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates synthetic daily records (default: 60 days x 15 models)
 * with fixed random seed for reproducible tests and golden baselines.
 */
export function generateSyntheticDailyRecords(
  seed = 42,
  numDays = 60,
  numModels = 15,
  specialRules: SpecialDayRules = { tails: [7], doubleDigits: true }
): DailyRecord[] {
  const rng = createSeededRandom(seed);
  const modelsList = Array.from(
    { length: numModels },
    (_, i) => SYNTHETIC_MODELS[i] || `パチスロ検証機_${i + 1}`
  );

  // Deterministic machine counts per model
  const modelMachineCounts = modelsList.map((_, idx) => 3 + (idx % 8));

  const rawRecords: DailyRecord[] = [];
  const startDate = new Date(2024, 0, 1); // 2024-01-01

  for (let dayOffset = 0; dayOffset < numDays; dayOffset++) {
    const curDate = new Date(startDate.getTime() + dayOffset * 86400000);
    const y = curDate.getFullYear();
    const m = curDate.getMonth() + 1;
    const d = curDate.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const yearMonth = `${y}-${String(m).padStart(2, '0')}`;
    const dow = calculateDayOfWeek(dateStr) || '月';
    const isSpecial = isDateSpecialDay(dateStr, specialRules);
    const is7 = d % 10 === 7;

    const dailyModels: DailyModelRecord[] = [];
    let dayTotalMachines = 0;
    let dayTotalDiff = 0;
    let dayTotalGamesWeighted = 0;
    let dayWinMachines = 0;

    for (let mIdx = 0; mIdx < modelsList.length; mIdx++) {
      const modelName = modelsList[mIdx];
      const totalMachines = modelMachineCounts[mIdx];

      const modelBias = (mIdx % 5) * 40 - 80;
      const specialBonus = isSpecial ? 250 + (mIdx % 3) * 100 : 0;
      const noise = (rng() - 0.48) * 300;
      const avgDiff = Math.round(modelBias + specialBonus + noise);

      const baseGames = 3500 + (mIdx % 4) * 800 + Math.round(rng() * 1000);
      const avgGames = isSpecial ? baseGames + 1500 : baseGames;

      const winRateClamped = Math.max(
        20,
        Math.min(85, Math.round(48 + avgDiff / 25 + (rng() - 0.5) * 10))
      );
      const winCount = Math.round((totalMachines * winRateClamped) / 100);
      const actualWinRate = Math.round((winCount / totalMachines) * 1000) / 10;
      const totalDiff = avgDiff * totalMachines;

      dailyModels.push({
        modelName,
        avgDiffCoins: avgDiff,
        totalDiffCoins: totalDiff,
        avgGames,
        winRate: actualWinRate,
        winMachines: winCount,
        totalMachines,
        isSmallCount: totalMachines <= 2,
      });

      dayTotalMachines += totalMachines;
      dayTotalDiff += totalDiff;
      dayTotalGamesWeighted += avgGames * totalMachines;
      dayWinMachines += winCount;
    }

    const dayAvgDiff = Math.round(dayTotalDiff / dayTotalMachines);
    const dayAvgGames = Math.round(dayTotalGamesWeighted / dayTotalMachines);
    const dayWinRate = Math.round((dayWinMachines / dayTotalMachines) * 1000) / 10;

    const dailyTails: DailyTailRecord[] = [];
    for (let t = 0; t < 10; t++) {
      const tailDiff = Math.round(
        (d % 10 === t && isSpecial ? 200 : 0) + (rng() - 0.5) * 300
      );
      dailyTails.push({
        tailName: `末尾${t}`,
        tailNum: t,
        avgDiffCoins: tailDiff,
        totalDiffCoins: tailDiff * 15,
        avgGames: 4500,
        winRate: 50,
        winMachines: 7,
        totalMachines: 15,
      });
    }

    rawRecords.push({
      date: dateStr,
      yearMonth,
      year: y,
      month: m,
      day: d,
      dayOfWeek: dow,
      avgDiffCoins: dayAvgDiff,
      avgGames: dayAvgGames,
      winRate: dayWinRate,
      winMachines: dayWinMachines,
      totalMachines: dayTotalMachines,
      totalDiffCoins: dayTotalDiff,
      hallCoinProfit: -dayTotalDiff,
      playerCoinProfit: dayTotalDiff,
      hallYenProfit: 0,
      playerYenProfit: 0,
      inCoins: 0,
      outCoins: 0,
      payoutRate: 100,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: 0,
      gModelPlayerProfit: 0,
      isOldEventDay: isSpecial,
      is7Day: is7,
      notable: isSpecial ? '特日' : '',
      models: dailyModels,
      tails: dailyTails,
    });
  }

  const processed = processStoreData(rawRecords, 46, 50, 70, specialRules);
  return processed.dailyRecords;
}
