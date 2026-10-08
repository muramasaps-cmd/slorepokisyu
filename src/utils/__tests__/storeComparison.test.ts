import { describe, it, expect } from 'vitest';
import {
  calculateCommonPeriod,
  calculateStorePerMachineMetrics,
  testStoreSignificanceBootstrap,
  compareStores,
} from '../storeComparison';
import { StoreProfile, DailyRecord } from '../../data/types';

function createDummyStore(
  id: string,
  name: string,
  dates: string[],
  baseDiff: number
): StoreProfile {
  const dailyRecords: DailyRecord[] = dates.map((date) => {
    const isSpecial = date.endsWith('7');
    const dayTotalDiff = (baseDiff + (isSpecial ? 500 : 0)) * 10;
    return {
      date,
      yearMonth: date.slice(0, 7),
      year: parseInt(date.slice(0, 4), 10),
      month: parseInt(date.slice(5, 7), 10),
      day: parseInt(date.slice(8, 10), 10),
      dayOfWeek: '土',
      avgDiffCoins: baseDiff + (isSpecial ? 500 : 0),
      avgGames: 6000,
      winRate: 60,
      winMachines: 6,
      totalMachines: 10,
      totalDiffCoins: dayTotalDiff,
      hallCoinProfit: -dayTotalDiff,
      playerCoinProfit: dayTotalDiff,
      hallYenProfit: -dayTotalDiff * 20,
      playerYenProfit: dayTotalDiff * 20,
      inCoins: 180000,
      outCoins: 180000 + dayTotalDiff,
      payoutRate: ((180000 + dayTotalDiff) / 180000) * 100,
      estimatedRevenue: 100000,
      exchangeGapProfit: 5000,
      gModelHallProfit: 10000,
      gModelPlayerProfit: -10000,
      isOldEventDay: isSpecial,
      is7Day: isSpecial,
      notable: '',
    };
  });

  return {
    id,
    name,
    address: '東京都',
    oldEventDays: '7のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 10,
    dataRange: '2025-01',
    dailyRecords,
  };
}

describe('storeComparison utils', () => {
  it('calculates common overlapping period correctly', () => {
    const storeA = createDummyStore('A', '店舗A', ['2025-01-01', '2025-01-02', '2025-01-03'], 100);
    const storeB = createDummyStore('B', '店舗B', ['2025-01-02', '2025-01-03', '2025-01-04'], 200);

    const common = calculateCommonPeriod([storeA, storeB]);
    expect(common.hasCommonPeriod).toBe(true);
    expect(common.startDate).toBe('2025-01-02');
    expect(common.endDate).toBe('2025-01-03');
    expect(common.commonDaysCount).toBe(2);
  });

  it('calculates per-machine primary metrics and special lift', () => {
    const store = createDummyStore(
      'A',
      '店舗A',
      ['2025-01-01', '2025-01-07'],
      100 // 1-1 has +100, 1-7 (special) has +600
    );

    const metrics = calculateStorePerMachineMetrics(store, store.dailyRecords);
    expect(metrics.daysCount).toBe(2);
    expect(metrics.avgMachinesPerDay).toBe(10);
    expect(metrics.avgDiffPerMachine).toBe(350); // (100 + 600) / 2
    expect(metrics.specialDaysCount).toBe(1);
    expect(metrics.normalDaysCount).toBe(1);
    expect(metrics.specialLift).toBe(500); // 600 - 100
  });

  it('determines statistical significance with bootstrap interval', () => {
    // Store A has huge positive edge (+1000 diff/machine) vs Store B (-100 diff/machine)
    const dates = Array.from({ length: 20 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`);
    const storeA = createDummyStore('A', '店舗A', dates, 1000);
    const storeB = createDummyStore('B', '店舗B', dates, -100);

    const testRes = testStoreSignificanceBootstrap(
      storeA,
      storeA.dailyRecords,
      storeB,
      storeB.dailyRecords,
      500,
      42
    );

    expect(testRes.diffDiff).toBeGreaterThan(500);
    expect(testRes.isSignificant).toBe(true);
    expect(testRes.label).toBe('差あり');
  });

  it('determines error range (誤差内) when two stores have identical performance', () => {
    const dates = Array.from({ length: 20 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`);
    const storeA = createDummyStore('A', '店舗A', dates, 50);
    const storeB = createDummyStore('B', '店舗B', dates, 50);

    const testRes = testStoreSignificanceBootstrap(
      storeA,
      storeA.dailyRecords,
      storeB,
      storeB.dailyRecords,
      500,
      42
    );

    expect(testRes.isSignificant).toBe(false);
    expect(testRes.label).toBe('誤差内');
  });

  it('compareStores runs end-to-end and produces complete comparison structure', () => {
    const dates = ['2025-01-01', '2025-01-02', '2025-01-07'];
    const storeA = createDummyStore('A', 'マルハン', dates, 200);
    const storeB = createDummyStore('B', 'エスパス', dates, -100);

    const result = compareStores([storeA, storeB], { periodMode: 'common' });
    expect(result.evaluatedStores).toHaveLength(2);
    expect(result.significanceTests).toHaveLength(1);
    expect(result.summaryStatements).toHaveLength(2);
    expect(result.summaryStatements[0].statement).toContain('マルハン');
  });

  it('recalculates comparison metrics accurately when stores are filtered by model', async () => {
    const { filterDailyRecordsByModels } = await import('../modelFilterUtils');

    const createStoreWithModels = (id: string, name: string): StoreProfile => ({
      id,
      name,
      address: '東京都',
      oldEventDays: '7のつく日',
      exchangeRate: '46枚貸/52枚交換',
      rateLend: 46,
      rateExchange: 52,
      totalMachinesApprox: 20,
      dataRange: '2025-01',
      dailyRecords: [
        {
          date: '2025-01-07',
          yearMonth: '2025-01',
          year: 2025,
          month: 1,
          day: 7,
          dayOfWeek: '火',
          avgDiffCoins: 100,
          avgGames: 6000,
          winRate: 50,
          winMachines: 10,
          totalMachines: 20,
          totalDiffCoins: 2000,
          hallCoinProfit: -2000,
          playerCoinProfit: 2000,
          hallYenProfit: -40000,
          playerYenProfit: 40000,
          inCoins: 360000,
          outCoins: 362000,
          payoutRate: 100.5,
          estimatedRevenue: 200000,
          exchangeGapProfit: 10000,
          gModelHallProfit: 20000,
          gModelPlayerProfit: -20000,
          isOldEventDay: true,
          is7Day: true,
          notable: '',
          models: [
            {
              modelName: 'スマスロ北斗の拳',
              avgDiffCoins: 500,
              totalDiffCoins: 5000,
              avgGames: 7000,
              winRate: 70,
              winMachines: 7,
              totalMachines: 10,
            },
            {
              modelName: 'マイジャグラーV',
              avgDiffCoins: -300,
              totalDiffCoins: -3000,
              avgGames: 5000,
              winRate: 30,
              winMachines: 3,
              totalMachines: 10,
            },
          ],
        },
      ],
    });

    const storeA = createStoreWithModels('A', 'ホールA');
    const storeB = createStoreWithModels('B', 'ホールB');

    // Filter to Smart Slots
    const filteredStoresSmart = [storeA, storeB].map((s) => ({
      ...s,
      dailyRecords: filterDailyRecordsByModels(s.dailyRecords, 'smart_slot', []),
    }));

    const resultSmart = compareStores(filteredStoresSmart, { periodMode: 'all' });
    expect(resultSmart.evaluatedStores[0].avgDiffPerMachine).toBe(500);
    expect(resultSmart.evaluatedStores[0].winRate).toBe(70);

    // Filter to Juggler
    const filteredStoresJuggler = [storeA, storeB].map((s) => ({
      ...s,
      dailyRecords: filterDailyRecordsByModels(s.dailyRecords, 'juggler', []),
    }));

    const resultJuggler = compareStores(filteredStoresJuggler, { periodMode: 'all' });
    expect(resultJuggler.evaluatedStores[0].avgDiffPerMachine).toBe(-300);
    expect(resultJuggler.evaluatedStores[0].winRate).toBe(30);
  });
});
