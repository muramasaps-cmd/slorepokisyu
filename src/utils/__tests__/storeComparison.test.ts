import { describe, it, expect } from 'vitest';
import {
  calculateCommonPeriod,
  calculateStorePerMachineMetrics,
  calculateStoreDigitDayHeatmap,
  getDiffHeatmapColor,
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

  it('classifies 1-9, 0, and zorome days correctly in calculateStoreDigitDayHeatmap', () => {
    const dates = [
      '2025-01-01', // 1のつく日
      '2025-01-11', // 1のつく日 & ゾロ目
      '2025-01-22', // 2のつく日 & ゾロ目
      '2025-01-07', // 7のつく日
      '2025-01-17', // 7のつく日
      '2025-01-10', // 0のつく日
      '2025-01-30', // 0のつく日
    ];
    const store = createDummyStore('A', '店舗A', dates, 100);

    const metrics = calculateStoreDigitDayHeatmap(store.dailyRecords);
    expect(metrics).toHaveLength(11);

    const getCol = (key: string) => metrics.find((m) => m.digit === key)!;

    // 1のつく日: 1日, 11日 = 2日
    expect(getCol('1').daysCount).toBe(2);
    // 2のつく日: 22日 = 1日
    expect(getCol('2').daysCount).toBe(1);
    // 7のつく日: 7日, 17日 = 2日
    expect(getCol('7').daysCount).toBe(2);
    // 0のつく日: 10日, 30日 = 2日
    expect(getCol('0').daysCount).toBe(2);
    // ゾロ目の日: 11日, 22日 = 2日
    expect(getCol('ゾロ目').daysCount).toBe(2);
    // 3, 4, 5, 6, 8, 9は0日
    expect(getCol('3').daysCount).toBe(0);
    expect(getCol('4').daysCount).toBe(0);
  });

  it('aggregates zorome days (11, 22) regardless of month, excluding month==day like 7/7', () => {
    // 2025-01-11 (Jan 11), 2025-02-11 (Feb 11), 2025-03-22 (Mar 22) -> Zorome
    // 2025-07-07 (Jul 7: month==day, but day is 7, not zorome)
    const dates = ['2025-01-11', '2025-02-11', '2025-03-22', '2025-07-07'];
    const store = createDummyStore('A', '店舗A', dates, 100);

    const metrics = calculateStoreDigitDayHeatmap(store.dailyRecords);
    const zoromeCol = metrics.find((m) => m.digit === 'ゾロ目')!;
    const day7Col = metrics.find((m) => m.digit === '7')!;

    // Zorome should only contain 1/11, 2/11, 3/22 (3 days)
    expect(zoromeCol.daysCount).toBe(3);
    // 7/7 should be in '7', not in Zorome
    expect(day7Col.daysCount).toBe(1);
  });

  it('excludes records outside the specified common period in calculateStoreDigitDayHeatmap', () => {
    const dates = [
      '2025-01-01',
      '2025-01-11',
      '2025-01-15',
      '2025-01-21',
      '2025-01-31',
    ];
    const store = createDummyStore('A', '店舗A', dates, 100);

    // Period: Jan 10 to Jan 25
    const period = {
      startDate: '2025-01-10',
      endDate: '2025-01-25',
      hasCommonPeriod: true,
      commonDaysCount: 3,
    };

    const metrics = calculateStoreDigitDayHeatmap(store.dailyRecords, period);
    const col1 = metrics.find((m) => m.digit === '1')!;

    // Outside period: 2025-01-01, 2025-01-31 excluded.
    // Inside period: 2025-01-11, 2025-01-21 included (2 days)
    expect(col1.daysCount).toBe(2);
  });

  it('counts days correctly and computes avgDiffPerMachine accurately', () => {
    const dummyRecords: DailyRecord[] = [
      {
        date: '2025-01-01',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 1,
        dayOfWeek: '水',
        avgDiffCoins: 200,
        avgGames: 5000,
        winRate: 50,
        winMachines: 5,
        totalMachines: 10,
        totalDiffCoins: 2000, // 10 machs * 200
        hallCoinProfit: -2000,
        playerCoinProfit: 2000,
        hallYenProfit: -40000,
        playerYenProfit: 40000,
        inCoins: 150000,
        outCoins: 152000,
        payoutRate: 101.3,
        estimatedRevenue: 100000,
        exchangeGapProfit: 5000,
        gModelHallProfit: 10000,
        gModelPlayerProfit: -10000,
        isOldEventDay: false,
        is7Day: false,
        notable: '',
      },
      {
        date: '2025-01-11',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 11,
        dayOfWeek: '土',
        avgDiffCoins: 500,
        avgGames: 6000,
        winRate: 60,
        winMachines: 12,
        totalMachines: 20,
        totalDiffCoins: 10000, // 20 machs * 500
        hallCoinProfit: -10000,
        playerCoinProfit: 10000,
        hallYenProfit: -200000,
        playerYenProfit: 200000,
        inCoins: 360000,
        outCoins: 370000,
        payoutRate: 102.8,
        estimatedRevenue: 200000,
        exchangeGapProfit: 10000,
        gModelHallProfit: 20000,
        gModelPlayerProfit: -20000,
        isOldEventDay: true,
        is7Day: false,
        notable: '',
      },
    ];

    const metrics = calculateStoreDigitDayHeatmap(dummyRecords);
    const col1 = metrics.find((m) => m.digit === '1')!;

    expect(col1.daysCount).toBe(2);
    expect(col1.totalMachineDays).toBe(30); // 10 + 20
    expect(col1.totalDiffCoins).toBe(12000); // 2000 + 10000
    // avgDiffPerMachine = 12000 / 30 = 400
    expect(col1.avgDiffPerMachine).toBe(400);

    const zoromeCol = metrics.find((m) => m.digit === 'ゾロ目')!;
    expect(zoromeCol.daysCount).toBe(1); // 11日 only
    expect(zoromeCol.totalMachineDays).toBe(20);
    expect(zoromeCol.totalDiffCoins).toBe(10000);
    expect(zoromeCol.avgDiffPerMachine).toBe(500);
  });

  it('tests shared heatmap color classification with getDiffHeatmapColor', () => {
    expect(getDiffHeatmapColor(350, 5).bgClass).toContain('bg-blue-600');
    expect(getDiffHeatmapColor(150, 1).bgClass).toContain('bg-blue-100');
    expect(getDiffHeatmapColor(150, 1).isFewDays).toBe(true);
    expect(getDiffHeatmapColor(150, 3).isFewDays).toBe(false);
    expect(getDiffHeatmapColor(-350, 10).bgClass).toContain('bg-rose-600');
    expect(getDiffHeatmapColor(-150, 10).bgClass).toContain('bg-rose-100');
    expect(getDiffHeatmapColor(0, 0).isFewDays).toBe(false);
  });

  it('compareStores runs end-to-end and produces digitDayHeatmaps without significanceTests', () => {
    const dates = ['2025-01-01', '2025-01-02', '2025-01-07'];
    const storeA = createDummyStore('A', 'マルハン', dates, 200);
    const storeB = createDummyStore('B', 'エスパス', dates, -100);

    const result = compareStores([storeA, storeB], { periodMode: 'common' });
    expect(result.evaluatedStores).toHaveLength(2);
    expect((result as any).significanceTests).toBeUndefined();
    expect(result.digitDayHeatmaps['A']).toBeDefined();
    expect(result.digitDayHeatmaps['A']).toHaveLength(11);
    expect(result.digitDayHeatmaps['B']).toBeDefined();
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
