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
  machinesWithDiff?: Array<{ num: number; model: string; diff: number }>,
  daysCount: number = 3
): StoreProfile {
  // Generate daysCount Thursdays prior to 2025-01-02 (e.g. 2024-12-12, 2024-12-19, 2024-12-26)
  const baseDates = ['2024-12-12', '2024-12-19', '2024-12-26', '2024-12-05', '2024-11-28'];
  const dates = baseDates.slice(0, daysCount);

  const dailyRecords: DailyRecord[] = dates.map((dateStr, idx) => ({
    date: dateStr,
    yearMonth: dateStr.slice(0, 7),
    year: Number(dateStr.slice(0, 4)),
    month: Number(dateStr.slice(5, 7)),
    day: Number(dateStr.slice(8, 10)),
    dayOfWeek: '木',
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
    isOldEventDay: idx === 0,
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
  }));

  return {
    id,
    name,
    address: '東京都',
    oldEventDays: '1のつく日',
    exchangeRate: `46枚貸/${rateExchange}枚交換`,
    rateLend: 46,
    rateExchange,
    totalMachinesApprox: 20,
    dataRange: '2024-12',
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

  // 1. 店舗をまたいで期待差枚順に並ぶ
  it('店舗をまたいで期待差枚順に並ぶ (機種はexpectedDiffCoins、台番はshrunkDiff降順)', () => {
    // Store A: machine 101 expected diff 1500, but lower score
    // Store B: machine 201 expected diff 800, but higher score
    const storeA = createMockStore(
      'store-a',
      '店舗A',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 1500, machines: 5 }],
      [{ num: 101, model: 'スマスロ北斗の拳', diff: 3000 }],
      3
    );

    const storeB = createMockStore(
      'store-b',
      '店舗B',
      50,
      [{ name: 'アイムジャグラーEX', diff: 800, machines: 5 }],
      [{ num: 201, model: 'アイムジャグラーEX', diff: 1500 }],
      3
    );

    const result = calculateCrossStoreRanking([storeA, storeB], '2025-01-02', {
      metricMode: 'diffCoins',
      includeLowConfidence: true,
    });

    expect(result.eligibleStoresCount).toBe(2);
    expect(result.modelRankings.length).toBeGreaterThanOrEqual(2);
    expect(result.machineRankings.length).toBeGreaterThanOrEqual(2);

    // Verify models are sorted strictly descending by expectedDiffCoins
    for (let i = 0; i < result.modelRankings.length - 1; i++) {
      expect(result.modelRankings[i].expectedDiffCoins).toBeGreaterThanOrEqual(
        result.modelRankings[i + 1].expectedDiffCoins
      );
    }

    // Verify machines are sorted strictly descending by shrunkDiff
    for (let i = 0; i < result.machineRankings.length - 1; i++) {
      expect(result.machineRankings[i].shrunkDiff).toBeGreaterThanOrEqual(
        result.machineRankings[i + 1].shrunkDiff
      );
    }

    // Top machine belongs to store-a with higher shrunkDiff
    expect(result.machineRankings[0].storeId).toBe('store-a');
    expect(result.machineRankings[0].machineNum).toBe(101);
  });

  // 2. 低信頼が除外される
  it('低信頼が除外される (includeLowConfidence: falseでは信頼度「低」を除外し、trueで表示)', () => {
    // Store with 1 day of data -> confidence is '低'
    const storeLow = createMockStore(
      'store-low',
      '低信頼店舗',
      50,
      [{ name: 'マイジャグラーV', diff: 400, machines: 5 }],
      [{ num: 301, model: 'マイジャグラーV', diff: 1200 }],
      1
    );

    // Store with 3 days of data -> confidence is '中'
    const storeMid = createMockStore(
      'store-mid',
      '中信頼店舗',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 500, machines: 5 }],
      [{ num: 401, model: 'スマスロ北斗の拳', diff: 2000 }],
      3
    );

    // Default: includeLowConfidence is false
    const resultDefault = calculateCrossStoreRanking([storeLow, storeMid], '2025-01-02');
    expect(resultDefault.machineRankings.every((m) => m.confidence !== '低')).toBe(true);
    expect(resultDefault.machineRankings.some((m) => m.machineNum === 301)).toBe(false);
    expect(resultDefault.machineRankings.some((m) => m.machineNum === 401)).toBe(true);

    // When includeLowConfidence: true
    const resultWithLow = calculateCrossStoreRanking([storeLow, storeMid], '2025-01-02', {
      includeLowConfidence: true,
    });
    expect(resultWithLow.machineRankings.some((m) => m.machineNum === 301)).toBe(true);
    expect(resultWithLow.machineRankings.some((m) => m.machineNum === 401)).toBe(true);
  });

  // 3. 理由の根拠日数が実際の集計と一致
  it('理由の根拠日数が実際の集計と一致する', () => {
    const store = createMockStore(
      'store-evidence',
      '根拠確認店舗',
      50,
      [{ name: 'マイジャグラーV', diff: 400, machines: 5 }],
      [{ num: 501, model: 'マイジャグラーV', diff: 2500 }],
      3
    );

    const result = calculateCrossStoreRanking([store], '2025-01-02', {
      includeLowConfidence: true,
    });

    expect(result.machineRankings.length).toBeGreaterThan(0);
    const mach = result.machineRankings[0];
    expect(mach.reasons.length).toBeGreaterThan(0);

    // For each reason in the ranked machine, check if evidence days match actual values
    const daysRegex = /(?:根拠|実績)(\d+)日/;
    mach.reasons.forEach((r) => {
      const match = r.match(daysRegex);
      if (match) {
        const parsedDays = Number(match[1]);
        // The parsed evidence days must match either evidenceDays or cohortEvidenceDays
        const isValidDays = parsedDays === mach.evidenceDays || parsedDays === mach.cohortEvidenceDays;
        expect(isValidDays).toBe(true);
      }
    });

    // Model tacticalReason also contains matching sample days
    const model = result.modelRankings[0];
    if (model.sampleDays > 0) {
      expect(model.tacticalReason).toContain(`根拠${model.sampleDays}日`);
    }
  });

  // 4. 失敗した店が理由つきで除外される
  it('失敗した店が理由つきで除外される (データなし・対象日前データなし・例外発生時)', () => {
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

    const futureOnlyStore: StoreProfile = {
      id: 'future',
      name: '未来店舗',
      address: '',
      oldEventDays: '',
      exchangeRate: '',
      rateLend: 46,
      rateExchange: 52,
      totalMachinesApprox: 10,
      dataRange: '',
      dailyRecords: [
        {
          date: '2025-01-10',
          yearMonth: '2025-01',
          year: 2025,
          month: 1,
          day: 10,
          dayOfWeek: '金',
          avgDiffCoins: 100,
          avgGames: 5000,
          winRate: 50,
          winMachines: 5,
          totalMachines: 10,
          totalDiffCoins: 1000,
          hallCoinProfit: -1000,
          playerCoinProfit: 1000,
          hallYenProfit: -20000,
          playerYenProfit: 20000,
          inCoins: 10000,
          outCoins: 11000,
          payoutRate: 102.0,
          estimatedRevenue: 0,
          exchangeGapProfit: 0,
          gModelHallProfit: 0,
          gModelPlayerProfit: 0,
          isOldEventDay: false,
          is7Day: false,
          notable: '',
        },
      ],
    };

    const validStore = createMockStore('valid', '正常店舗', 50, [
      { name: 'マイジャグラーV', diff: 400, machines: 5 },
    ], undefined, 3);

    const result = calculateCrossStoreRanking([emptyStore, futureOnlyStore, validStore], '2025-01-02');

    expect(result.eligibleStoresCount).toBe(1);
    expect(result.excludedStores).toHaveLength(2);

    const emptyEx = result.excludedStores.find((e) => e.storeId === 'empty');
    expect(emptyEx).toBeDefined();
    expect(emptyEx?.reason).toContain('出玉データが登録されていません');

    const futureEx = result.excludedStores.find((e) => e.storeId === 'future');
    expect(futureEx).toBeDefined();
    expect(futureEx?.reason).toContain('過去データが存在しません');
  });

  // 5. 来店日以降のデータを書き換えても結果が変わらない
  it('来店日以降のデータを書き換えても結果が変わらない (未来データのリークがない)', () => {
    const storeOriginal = createMockStore(
      'store-a',
      '店舗A',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 500, machines: 5 }],
      [{ num: 101, model: 'スマスロ北斗の拳', diff: 2000 }],
      3
    );

    const targetDate = '2025-01-02';
    const resOrig = calculateCrossStoreRanking([storeOriginal], targetDate, {
      includeLowConfidence: true,
    });

    // Add future records on targetDate and later with extreme numbers
    const storeTampered: StoreProfile = {
      ...storeOriginal,
      dailyRecords: [
        ...storeOriginal.dailyRecords,
        {
          ...storeOriginal.dailyRecords[0],
          date: '2025-01-02',
          avgDiffCoins: 9999,
          models: [{ modelName: 'スマスロ北斗の拳', avgDiffCoins: 9999, totalDiffCoins: 49995, avgGames: 9000, winRate: 100, winMachines: 5, totalMachines: 5 }],
          machines: [{ machineNum: 101, modelName: 'スマスロ北斗の拳', diff: 25000, games: 9000, payoutRate: 190.0 }],
        },
        {
          ...storeOriginal.dailyRecords[0],
          date: '2025-01-09',
          avgDiffCoins: 8888,
        },
      ],
    };

    const resTampered = calculateCrossStoreRanking([storeTampered], targetDate, {
      includeLowConfidence: true,
    });

    // Both model rankings and machine rankings must be identical
    expect(resOrig.machineRankings.map((m) => m.machineNum)).toEqual(
      resTampered.machineRankings.map((m) => m.machineNum)
    );
    expect(resOrig.machineRankings[0].shrunkDiff).toBe(
      resTampered.machineRankings[0].shrunkDiff
    );
    expect(resOrig.machineRankings[0].expectedDiffCoins).toBe(
      resTampered.machineRankings[0].expectedDiffCoins
    );
    expect(resOrig.modelRankings.map((m) => m.modelName)).toEqual(
      resTampered.modelRankings.map((m) => m.modelName)
    );
    expect(resOrig.modelRankings[0].expectedDiffCoins).toBe(
      resTampered.modelRankings[0].expectedDiffCoins
    );
  });
});
