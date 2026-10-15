import { DailyRecord, DailyModelRecord, DailyTailRecord, DailyMachineRecord, SpecialDayRules } from '../../data/types';
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

/**
 * Generates synthetic daily records with machine-level granularity
 * with optional true bias on specified machine numbers.
 */
export function createSyntheticMachineRecords(options: {
  daysCount: number;
  machinesCount: number;
  biasedMachineNums?: number[]; // Machine numbers with true edge
  biasBonus?: number; // Added diffCoins for biased machines
  seed?: number;
}): DailyRecord[] {
  const { daysCount, machinesCount, biasedMachineNums = [], biasBonus = 2000, seed = 12345 } = options;
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const records: DailyRecord[] = [];
  const baseDate = new Date('2025-01-01');

  const models = ['アイムジャグラーEX', 'マイジャグラーV', 'スマスロ北斗の拳', '押忍！番長4'];

  for (let d = 0; d < daysCount; d++) {
    const curDate = new Date(baseDate);
    curDate.setDate(baseDate.getDate() + d);
    const dateStr = curDate.toISOString().slice(0, 10);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][curDate.getDay()];

    const machines: DailyMachineRecord[] = [];
    let dayTotalDiff = 0;
    let dayTotalGames = 0;

    for (let m = 1; m <= machinesCount; m++) {
      const machineNum = 100 + m;
      const modelName = models[(m - 1) % models.length];
      const isBiased = biasedMachineNums.includes(machineNum);

      const noise = (rng() - 0.5) * 800;
      const baseDiff = isBiased ? biasBonus + noise : -50 + noise;
      const diffCoins = Math.round(baseDiff);
      const games = isBiased ? 6000 + Math.round(rng() * 500) : 3000 + Math.round(rng() * 500);
      const payoutRate = games > 0 ? Math.round(((games * 3 + diffCoins) / (games * 3)) * 1000) / 10 : 100;

      machines.push({
        machineNum,
        modelName,
        games,
        diff: diffCoins,
        payoutRate,
        bb: isBiased ? 25 : 10,
        rb: isBiased ? 22 : 8,
      });

      dayTotalDiff += diffCoins;
      dayTotalGames += games;
    }

    const inCoins = dayTotalGames * 3;
    const outCoins = inCoins + dayTotalDiff;
    const payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;

    records.push({
      date: dateStr,
      year: curDate.getFullYear(),
      month: curDate.getMonth() + 1,
      day: curDate.getDate(),
      yearMonth: `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`,
      dayOfWeek,
      totalDiffCoins: dayTotalDiff,
      avgDiffCoins: Math.round(dayTotalDiff / machinesCount),
      avgGames: Math.round(dayTotalGames / machinesCount),
      winRate: Math.round((machines.filter((m) => m.diff > 0).length / machinesCount) * 100),
      winMachines: machines.filter((m) => m.diff > 0).length,
      totalMachines: machinesCount,
      hallCoinProfit: -dayTotalDiff,
      playerCoinProfit: dayTotalDiff,
      hallYenProfit: -dayTotalDiff * 20,
      playerYenProfit: dayTotalDiff * 20,
      inCoins,
      outCoins,
      payoutRate,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: -dayTotalDiff * 20,
      gModelPlayerProfit: dayTotalDiff * 20,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      machines,
    });
  }

  return records;
}
