import { performance } from 'perf_hooks';
import { StoreProfile, DailyRecord, DailyMachineRecord, DailyModelRecord } from '../data/types';
import { calculateCrossStoreModelRows, calculateModelMonthlyTrends, estimateCrossStoreModelSettings } from '../utils/modelCrossStore';
import { calculateCrossStoreRanking, scanCandidateDates, generateCandidateScanDates } from '../utils/crossStoreRanking';
import { calculateTargetMachineRanking } from '../utils/targetMachineRanking';
import { createSeededRandom } from '../utils/__tests__/testDataGenerator';

export const BENCHMARK_35_MODELS = [
  'マイジャグラーV',
  'アイムジャグラーEX',
  'ファンキージャグラー2',
  'ゴーゴージャグラー3',
  'ハッピージャグラーV III',
  'ミスタージャグラー',
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
  'ドラゴンハナハナ〜閃光〜-30',
  'スマスロ痛いのは嫌なので防御力に極振りしたいと思います。',
  'スマスロ真・北斗無双',
  'L ゴジラ対エヴァンゲリオン',
  'L 聖闘士星矢 海皇覚醒 CUSTOM EDITION',
  'スマスロモンキーターンV',
  'Lパチスロ炎炎ノ消防隊',
  'スマスロ ゲゲゲの鬼太郎 覚醒',
  'L アカメが斬る！2',
  'L ToLOVEるダークネス',
  'スマスロ D4DJ Pachi-Slot Mix',
  'バーサスリヴァイズ',
  'クランキークレスト',
  'ファイヤードリフト',
  'エウレカセブン TYPE-ART',
  'スマスロ かぐや様は告らせたい',
  'スマスロ Re:ゼロから始める異世界生活 season2',
];

export function createSyntheticCrossStoreData(options: {
  numStores: number;
  numDays: number;
  numMachines: number;
  seed?: number;
}): StoreProfile[] {
  const { numStores, numDays, numMachines, seed = 42 } = options;
  const stores: StoreProfile[] = [];

  for (let s = 1; s <= numStores; s++) {
    const rng = createSeededRandom(seed + s * 1000);
    const storeId = `store_${s}`;
    const storeName = `ホール店舗_${s}`;
    const dailyRecords: DailyRecord[] = [];
    const baseDate = new Date('2024-01-01');

    for (let d = 0; d < numDays; d++) {
      const curDate = new Date(baseDate.getTime() + d * 86400000);
      const y = curDate.getFullYear();
      const m = curDate.getMonth() + 1;
      const day = curDate.getDate();
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const yearMonth = `${y}-${String(m).padStart(2, '0')}`;
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][curDate.getDay()];
      const isSpecial = day % 10 === 7;

      const machines: DailyMachineRecord[] = [];
      const modelMap = new Map<string, { totalDiff: number; totalGames: number; count: number; wins: number }>();

      for (let mach = 1; mach <= numMachines; mach++) {
        const machineNum = 100 + mach;
        const modelName = BENCHMARK_35_MODELS[(mach - 1) % BENCHMARK_35_MODELS.length];
        const isBiased = (mach % 7 === 0);
        const noise = (rng() - 0.5) * 600;
        const diff = Math.round((isBiased ? 1500 : -50) + (isSpecial ? 300 : 0) + noise);
        const games = isBiased ? 6500 + Math.round(rng() * 500) : 3500 + Math.round(rng() * 1000);
        const payoutRate = games > 0 ? Math.round(((games * 3 + diff) / (games * 3)) * 1000) / 10 : 100;
        const bb = isBiased ? 25 : 12;
        const rb = isBiased ? 20 : 10;

        machines.push({
          machineNum,
          modelName,
          diff,
          games,
          payoutRate,
          bb,
          rb,
        });

        const entry = modelMap.get(modelName) || { totalDiff: 0, totalGames: 0, count: 0, wins: 0 };
        entry.totalDiff += diff;
        entry.totalGames += games;
        entry.count += 1;
        if (diff > 0) entry.wins += 1;
        modelMap.set(modelName, entry);
      }

      const models: DailyModelRecord[] = Array.from(modelMap.entries()).map(([modelName, stat]) => ({
        modelName,
        totalMachines: stat.count,
        totalDiffCoins: stat.totalDiff,
        avgDiffCoins: Math.round(stat.totalDiff / stat.count),
        avgGames: Math.round(stat.totalGames / stat.count),
        winMachines: stat.wins,
        winRate: Math.round((stat.wins / stat.count) * 1000) / 10,
      }));

      const dayTotalDiff = machines.reduce((sum, m) => sum + m.diff, 0);
      const dayTotalGames = machines.reduce((sum, m) => sum + m.games, 0);
      const inCoins = dayTotalGames * 3;
      const outCoins = inCoins + dayTotalDiff;

      dailyRecords.push({
        date: dateStr,
        yearMonth,
        year: y,
        month: m,
        day,
        dayOfWeek,
        avgDiffCoins: Math.round(dayTotalDiff / numMachines),
        avgGames: Math.round(dayTotalGames / numMachines),
        winRate: Math.round((machines.filter((m) => m.diff > 0).length / numMachines) * 100),
        winMachines: machines.filter((m) => m.diff > 0).length,
        totalMachines: numMachines,
        totalDiffCoins: dayTotalDiff,
        hallCoinProfit: -dayTotalDiff,
        playerCoinProfit: dayTotalDiff,
        hallYenProfit: -dayTotalDiff * 20,
        playerYenProfit: dayTotalDiff * 20,
        inCoins,
        outCoins,
        payoutRate: inCoins > 0 ? (outCoins / inCoins) * 100 : 100,
        estimatedRevenue: 0,
        exchangeGapProfit: 0,
        gModelHallProfit: -dayTotalDiff * 20,
        gModelPlayerProfit: dayTotalDiff * 20,
        isOldEventDay: isSpecial,
        is7Day: isSpecial,
        notable: isSpecial ? '特日' : '',
        machines,
        models,
      });
    }

    stores.push({
      id: storeId,
      name: storeName,
      address: `東京都${s}区`,
      oldEventDays: '7のつく日',
      exchangeRate: '46枚貸/52枚交換',
      rateLend: 46,
      rateExchange: 52,
      totalMachinesApprox: numMachines,
      dataRange: `2024-01-01 〜 2024-12-31`,
      specialDayRules: { tails: [7], doubleDigits: true },
      dailyRecords,
    });
  }

  return stores;
}

export async function runBenchmark(numStores = 5, numDays = 365, numMachines = 150) {
  console.log(`\n=== Scope All Benchmark (${numStores} stores x ${numDays} days x ${numMachines} machines, 35 models) ===`);
  const tGenStart = performance.now();
  const stores = createSyntheticCrossStoreData({ numStores, numDays, numMachines, seed: 42 });
  const tGen = performance.now() - tGenStart;
  console.log(`Data Generation Time: ${tGen.toFixed(2)} ms (${(numStores * numDays * numMachines).toLocaleString()} machine records)`);

  const lastDate = stores[0].dailyRecords[stores[0].dailyRecords.length - 1].date;
  const targetDateObj = new Date(lastDate);
  targetDateObj.setDate(targetDateObj.getDate() + 1);
  const targetDate = targetDateObj.toISOString().slice(0, 10);
  const targetModel = BENCHMARK_35_MODELS[0];
  const candidateDates = generateCandidateScanDates(targetDate, 14);

  // 1. calculateCrossStoreModelRows
  const t0 = performance.now();
  const modelRows = calculateCrossStoreModelRows(stores);
  const tModelRows = performance.now() - t0;

  // 2. calculateModelMonthlyTrends (1 model)
  const t1 = performance.now();
  const monthlyTrends = calculateModelMonthlyTrends(stores, targetModel);
  const tMonthlyTrends = performance.now() - t1;

  // 3. estimateCrossStoreModelSettings (1 model)
  const t2 = performance.now();
  const modelSettings = estimateCrossStoreModelSettings(stores, targetModel);
  const tModelSettings = performance.now() - t2;

  // 4. calculateCrossStoreRanking (1 day)
  const t3 = performance.now();
  const crossRanking = calculateCrossStoreRanking(stores, targetDate);
  const tCrossRanking = performance.now() - t3;

  // 5. scanCandidateDates (14 days)
  const t4 = performance.now();
  const dateScan = scanCandidateDates(stores, candidateDates);
  const tDateScan = performance.now() - t4;

  // 6. calculateTargetMachineRanking (single store, 1 day)
  const t5 = performance.now();
  const singleMachineRanking = calculateTargetMachineRanking(
    targetDate,
    stores[0].dailyRecords,
    stores[0].specialDayRules
  );
  const tSingleMachineRanking = performance.now() - t5;

  console.log('\n| 処理項目 (Operation) | 所要時間 (Time ms) | 秒換算 (Seconds) | 補足情報 |');
  console.log('|---|---|---|---|');
  console.log(`| calculateCrossStoreModelRows | ${tModelRows.toFixed(2)} ms | ${(tModelRows / 1000).toFixed(3)} s | ${modelRows.length} 機種横断集計 |`);
  console.log(`| calculateModelMonthlyTrends (1機種) | ${tMonthlyTrends.toFixed(2)} ms | ${(tMonthlyTrends / 1000).toFixed(3)} s | ${monthlyTrends.length} ヶ月推移 |`);
  console.log(`| estimateCrossStoreModelSettings (1機種) | ${tModelSettings.toFixed(2)} ms | ${(tModelSettings / 1000).toFixed(3)} s | ${modelSettings.length} 店舗推定 |`);
  console.log(`| calculateCrossStoreRanking (1日) | ${tCrossRanking.toFixed(2)} ms | ${(tCrossRanking / 1000).toFixed(3)} s | 機種${crossRanking.modelRankings.length}件 / 台番${crossRanking.machineRankings.length}件 |`);
  console.log(`| scanCandidateDates (14日) | ${tDateScan.toFixed(2)} ms | ${(tDateScan / 1000).toFixed(3)} s | 14日×${numStores}店舗 グリッド |`);
  console.log(`| calculateTargetMachineRanking (単店・1日) | ${tSingleMachineRanking.toFixed(2)} ms | ${(tSingleMachineRanking / 1000).toFixed(3)} s | ${singleMachineRanking.rankings.length} 台番順位 |`);

  return {
    tModelRows,
    tMonthlyTrends,
    tModelSettings,
    tCrossRanking,
    tDateScan,
    tSingleMachineRanking,
  };
}

// Direct CLI execution
if (process.argv[1] && process.argv[1].includes('benchmark_scope_all')) {
  const args = process.argv.slice(2);
  const n = parseInt(args[0] || '5', 10);
  const d = parseInt(args[1] || '365', 10);
  const m = parseInt(args[2] || '150', 10);

  runBenchmark(n, d, m).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
