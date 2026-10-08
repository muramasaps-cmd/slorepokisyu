import { describe, it, expect } from 'vitest';
import {
  calculateCrossStoreRanking,
  convertCoinsToYen,
} from '../crossStoreRanking';
import { StoreProfile, DailyRecord } from '../../data/types';

function createMockStore(
  id: string,
  name: string,
  rateExchange: number,
  modelsWithDiff: Array<{ name: string; diff: number; machines: number }>,
  machinesWithDiff?: Array<{ num: number; model: string; diff: number }>
): StoreProfile {
  const dailyRecords: DailyRecord[] = [
    {
      date: '2025-01-01',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 1,
      dayOfWeek: '水',
      avgDiffCoins: 150,
      avgGames: 6000,
      winRate: 55,
      winMachines: 10,
      totalMachines: 20,
      totalDiffCoins: 3000,
      hallCoinProfit: -3000,
      playerCoinProfit: 3000,
      hallYenProfit: -60000,
      playerYenProfit: 60000,
      inCoins: 360000,
      outCoins: 363000,
      payoutRate: 100.8,
      estimatedRevenue: 200000,
      exchangeGapProfit: 10000,
      gModelHallProfit: 20000,
      gModelPlayerProfit: -20000,
      isOldEventDay: true,
      is7Day: false,
      notable: '',
      models: modelsWithDiff.map((m) => ({
        modelName: m.name,
        avgDiffCoins: m.diff,
        totalDiffCoins: m.diff * m.machines,
        avgGames: 6000,
        winRate: m.diff > 0 ? 70 : 40,
        winMachines: m.diff > 0 ? Math.round(m.machines * 0.7) : Math.round(m.machines * 0.4),
        totalMachines: m.machines,
      })),
      machines: machinesWithDiff
        ? machinesWithDiff.map((mach) => ({
            machineNum: mach.num,
            modelName: mach.model,
            diff: mach.diff,
            games: 6000,
            payoutRate: 108.0,
          }))
        : undefined,
    },
  ];

  return {
    id,
    name,
    address: '東京都',
    oldEventDays: '1のつく日',
    exchangeRate: `${46}枚貸/${rateExchange}枚交換`,
    rateLend: 46,
    rateExchange,
    totalMachinesApprox: 20,
    dataRange: '2025-01',
    dailyRecords,
  };
}

describe('crossStoreRanking utils', () => {
  it('converts coins to yen correctly based on exchange rate', () => {
    // 1000 coins @ 50 exchange = 20,000 yen
    expect(convertCoinsToYen(1000, 46, 50)).toBe(20000);
    // 1000 coins @ 52 exchange = 19,231 yen
    expect(convertCoinsToYen(1000, 46, 52)).toBe(19231);
    // -1000 coins @ 46 lend = -21,739 yen
    expect(convertCoinsToYen(-1000, 46, 52)).toBe(-21739);
  });

  it('ranks models and machines across multiple stores for a target date', () => {
    const storeA = createMockStore(
      'store-a',
      '店舗A(等価)',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 500, machines: 10 }],
      [{ num: 101, model: 'スマスロ北斗の拳', diff: 2500 }]
    );

    const storeB = createMockStore(
      'store-b',
      '店舗B(非等価)',
      56,
      [{ name: 'アイムジャグラーEX', diff: 300, machines: 10 }],
      [{ num: 201, model: 'アイムジャグラーEX', diff: 1200 }]
    );

    const resultCoins = calculateCrossStoreRanking([storeA, storeB], '2025-01-02', {
      metricMode: 'diffCoins',
    });

    expect(resultCoins.eligibleStoresCount).toBe(2);
    expect(resultCoins.excludedStores).toHaveLength(0);
    expect(resultCoins.modelRankings.length).toBeGreaterThan(0);
    expect(resultCoins.machineRankings.length).toBeGreaterThan(0);

    // Verify top ranked
    expect(resultCoins.modelRankings[0].storeName).toBe('店舗A(等価)');
    expect(resultCoins.machineRankings[0].machineNum).toBe(101);
  });

  it('excludes stores with no prior data or missing breakdown data with reasons', () => {
    const emptyStore: StoreProfile = {
      id: 'empty',
      name: '空店舗',
      address: '',
      oldEventDays: '',
      exchangeRate: '',
      rateLend: 46,
      rateExchange: 52,
      totalMachinesApprox: 0,
      dataRange: '',
      dailyRecords: [],
    };

    const validStore = createMockStore('valid', '優良店', 50, [
      { name: 'マイジャグラーV', diff: 400, machines: 5 },
    ]);

    const result = calculateCrossStoreRanking([emptyStore, validStore], '2025-01-02');
    expect(result.eligibleStoresCount).toBe(1);
    expect(result.excludedStores).toHaveLength(1);
    expect(result.excludedStores[0].storeName).toBe('空店舗');
    expect(result.excludedStores[0].reason).toContain('出玉データが登録されていません');
  });

  it('recalculates cross store rankings for selected models and machines', async () => {
    const { filterDailyRecordsByModels } = await import('../modelFilterUtils');

    const storeA = createMockStore(
      'store-a',
      '店舗A',
      50,
      [
        { name: 'スマスロ北斗の拳', diff: 600, machines: 10 },
        { name: 'アイムジャグラーEX', diff: 100, machines: 10 },
      ],
      [
        { num: 101, model: 'スマスロ北斗の拳', diff: 3000 },
        { num: 102, model: 'アイムジャグラーEX', diff: 800 },
      ]
    );

    const storeB = createMockStore(
      'store-b',
      '店舗B',
      50,
      [
        { name: 'スマスロ北斗の拳', diff: 200, machines: 10 },
        { name: 'アイムジャグラーEX', diff: 500, machines: 10 },
      ],
      [
        { num: 201, model: 'スマスロ北斗の拳', diff: 1200 },
        { num: 202, model: 'アイムジャグラーEX', diff: 2500 },
      ]
    );

    // Filter to Juggler only
    const filteredStoresJuggler = [storeA, storeB].map((s) => ({
      ...s,
      dailyRecords: filterDailyRecordsByModels(s.dailyRecords, 'juggler', []),
    }));

    const result = calculateCrossStoreRanking(filteredStoresJuggler, '2025-01-02');
    expect(result.modelRankings.length).toBeGreaterThan(0);
    // All ranked models must be Juggler
    expect(result.modelRankings.every((m) => m.modelName.includes('ジャグラー'))).toBe(true);
    // All ranked machines must be Juggler
    expect(result.machineRankings.every((m) => m.modelName.includes('ジャグラー'))).toBe(true);
    // Top model should be Store B (which had diff: 500 for Juggler)
    expect(result.modelRankings[0].storeName).toBe('店舗B');
  });
});
