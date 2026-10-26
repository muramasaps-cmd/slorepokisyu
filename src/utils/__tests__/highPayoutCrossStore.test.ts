import { describe, it, expect } from 'vitest';
import { StoreProfile, DailyRecord } from '../../data/types';
import {
  calculateStoreHighPayoutSummary,
  calculateCrossStoreHighPayout,
  DEFAULT_HIGH_PAYOUT_CONFIG,
} from '../highPayoutCrossStore';
import { ALL_STORES_NAME } from '../storeColors';

describe('Prompt 53: 高出率台の横断 (Cross-Store High Payout Analytics)', () => {
  // Store 1: 2 operating days (< 3 days -> isFewDays = true)
  const store1Records: DailyRecord[] = [
    {
      date: '2025-01-01',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 1,
      dayOfWeek: '水',
      avgDiffCoins: 633,
      avgGames: 5000,
      winRate: 60,
      winMachines: 6,
      totalMachines: 10,
      totalDiffCoins: 1900,
      hallCoinProfit: -1900,
      playerCoinProfit: 1900,
      hallYenProfit: -38000,
      playerYenProfit: 38000,
      inCoins: 150000,
      outCoins: 151900,
      payoutRate: 101.3,
      estimatedRevenue: 80000,
      exchangeGapProfit: 4000,
      gModelHallProfit: -38000,
      gModelPlayerProfit: 38000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      models: [
        {
          modelName: 'マイジャグラーV',
          avgDiffCoins: 600,
          totalDiffCoins: 7200,
          avgGames: 5000,
          winRate: 66.7,
          winMachines: 8,
          totalMachines: 12, // large (>=10)
        },
        {
          modelName: 'Lスマスロ北斗の拳',
          avgDiffCoins: 1500,
          totalDiffCoins: 22500,
          avgGames: 6000,
          winRate: 60.0,
          winMachines: 9,
          totalMachines: 15, // large (>=10)
        },
        {
          modelName: '新ハナビ',
          avgDiffCoins: -200,
          totalDiffCoins: -400,
          avgGames: 4000,
          winRate: 50.0,
          winMachines: 1,
          totalMachines: 2, // small (<=3)
        },
      ],
    },
    {
      date: '2025-01-02',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 2,
      dayOfWeek: '木',
      avgDiffCoins: 500,
      avgGames: 5500,
      winRate: 55,
      winMachines: 6,
      totalMachines: 10,
      totalDiffCoins: 1500,
      hallCoinProfit: -1500,
      playerCoinProfit: 1500,
      hallYenProfit: -30000,
      playerYenProfit: 30000,
      inCoins: 165000,
      outCoins: 166500,
      payoutRate: 100.9,
      estimatedRevenue: 85000,
      exchangeGapProfit: 3500,
      gModelHallProfit: -30000,
      gModelPlayerProfit: 30000,
      isOldEventDay: true,
      is7Day: false,
      notable: '',
      models: [
        {
          modelName: 'マイジャグラーV',
          avgDiffCoins: 1200,
          totalDiffCoins: 14400,
          avgGames: 7000,
          winRate: 75.0,
          winMachines: 9,
          totalMachines: 12, // large
        },
        {
          modelName: 'Lスマスロ北斗の拳',
          avgDiffCoins: -500,
          totalDiffCoins: -7500,
          avgGames: 5000,
          winRate: 40.0,
          winMachines: 6,
          totalMachines: 15, // large
        },
        {
          modelName: '新ハナビ',
          avgDiffCoins: 800,
          totalDiffCoins: 1600,
          avgGames: 4500,
          winRate: 100.0,
          winMachines: 2,
          totalMachines: 2, // small
        },
      ],
    },
  ];

  const store1: StoreProfile = {
    id: 'store-1',
    name: 'メガホール新宿店',
    address: '東京都新宿区',
    oldEventDays: '7のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 29,
    dataRange: '2025-01',
    dailyRecords: store1Records,
  };

  // Store 2: 4 operating days (>= 3 days -> isFewDays = false)
  const store2Records: DailyRecord[] = [
    {
      date: '2025-01-01',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 1,
      dayOfWeek: '水',
      avgDiffCoins: 1350,
      avgGames: 6000,
      winRate: 60,
      winMachines: 6,
      totalMachines: 10,
      totalDiffCoins: 2700,
      hallCoinProfit: -2700,
      playerCoinProfit: 2700,
      hallYenProfit: -54000,
      playerYenProfit: 54000,
      inCoins: 180000,
      outCoins: 182700,
      payoutRate: 101.5,
      estimatedRevenue: 90000,
      exchangeGapProfit: 4500,
      gModelHallProfit: -54000,
      gModelPlayerProfit: 54000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      models: [
        {
          modelName: 'Lパチスロ からくりサーカス',
          avgDiffCoins: 2500,
          totalDiffCoins: 15000,
          avgGames: 7000,
          winRate: 66.7,
          winMachines: 4,
          totalMachines: 6, // medium (4-9)
        },
        {
          modelName: 'アイムジャグラーEX',
          avgDiffCoins: 200,
          totalDiffCoins: 4000,
          avgGames: 5000,
          winRate: 50.0,
          winMachines: 10,
          totalMachines: 20, // large (>=10)
        },
      ],
    },
    {
      date: '2025-01-02',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 2,
      dayOfWeek: '木',
      avgDiffCoins: 1400,
      avgGames: 6000,
      winRate: 65,
      winMachines: 7,
      totalMachines: 10,
      totalDiffCoins: 2800,
      hallCoinProfit: -2800,
      playerCoinProfit: 2800,
      hallYenProfit: -56000,
      playerYenProfit: 56000,
      inCoins: 180000,
      outCoins: 182800,
      payoutRate: 101.6,
      estimatedRevenue: 90000,
      exchangeGapProfit: 4500,
      gModelHallProfit: -56000,
      gModelPlayerProfit: 56000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      models: [
        {
          modelName: 'Lパチスロ からくりサーカス',
          avgDiffCoins: 1800,
          totalDiffCoins: 10800,
          avgGames: 6000,
          winRate: 66.7,
          winMachines: 4,
          totalMachines: 6, // medium
        },
        {
          modelName: 'アイムジャグラーEX',
          avgDiffCoins: 1000,
          totalDiffCoins: 20000,
          avgGames: 6000,
          winRate: 60.0,
          winMachines: 12,
          totalMachines: 20, // large
        },
      ],
    },
    {
      date: '2025-01-03',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 3,
      dayOfWeek: '金',
      avgDiffCoins: -400,
      avgGames: 4000,
      winRate: 40,
      winMachines: 4,
      totalMachines: 10,
      totalDiffCoins: -800,
      hallCoinProfit: 800,
      playerCoinProfit: -800,
      hallYenProfit: 16000,
      playerYenProfit: -16000,
      inCoins: 120000,
      outCoins: 119200,
      payoutRate: 99.3,
      estimatedRevenue: 60000,
      exchangeGapProfit: 2000,
      gModelHallProfit: 16000,
      gModelPlayerProfit: -16000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      models: [
        {
          modelName: 'Lパチスロ からくりサーカス',
          avgDiffCoins: -500,
          totalDiffCoins: -3000,
          avgGames: 4000,
          winRate: 33.3,
          winMachines: 2,
          totalMachines: 6,
        },
        {
          modelName: 'アイムジャグラーEX',
          avgDiffCoins: -300,
          totalDiffCoins: -6000,
          avgGames: 4000,
          winRate: 40.0,
          winMachines: 8,
          totalMachines: 20,
        },
      ],
    },
    {
      date: '2025-01-04',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 4,
      dayOfWeek: '土',
      avgDiffCoins: -300,
      avgGames: 5000,
      winRate: 40,
      winMachines: 4,
      totalMachines: 10,
      totalDiffCoins: -600,
      hallCoinProfit: 600,
      playerCoinProfit: -600,
      hallYenProfit: 12000,
      playerYenProfit: -12000,
      inCoins: 150000,
      outCoins: 149400,
      payoutRate: 99.6,
      estimatedRevenue: 75000,
      exchangeGapProfit: 2500,
      gModelHallProfit: 12000,
      gModelPlayerProfit: -12000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      models: [
        {
          modelName: 'Lパチスロ からくりサーカス',
          avgDiffCoins: -400,
          totalDiffCoins: -2400,
          avgGames: 5000,
          winRate: 33.3,
          winMachines: 2,
          totalMachines: 6,
        },
        {
          modelName: 'アイムジャグラーEX',
          avgDiffCoins: -200,
          totalDiffCoins: -4000,
          avgGames: 5000,
          winRate: 45.0,
          winMachines: 9,
          totalMachines: 20,
        },
      ],
    },
  ];

  const store2: StoreProfile = {
    id: 'store-2',
    name: 'メガスタジアム秋葉原店',
    address: '東京都千代田区',
    oldEventDays: 'ゾロ目の日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 26,
    dataRange: '2025-01',
    dailyRecords: store2Records,
  };

  it('calculates single-store high payout summary matching hand-calculated data', () => {
    const summary1 = calculateStoreHighPayoutSummary(store1, DEFAULT_HIGH_PAYOUT_CONFIG);

    // Days count and warning flag (< 3 days)
    expect(summary1.daysCount).toBe(2);
    expect(summary1.isFewDays).toBe(true);

    // Total evaluated and high payout counts
    expect(summary1.totalMachineDays).toBe(6);
    expect(summary1.highPayoutCount).toBe(3);
    expect(summary1.highPayoutRate).toBe(50.0);

    // Categories
    expect(summary1.categories.smart_slot.highPayoutCount).toBe(1);
    expect(summary1.categories.smart_slot.totalEvaluated).toBe(2);
    expect(summary1.categories.smart_slot.rate).toBe(50.0);
    expect(summary1.categories.smart_slot.share).toBe(33.3);

    expect(summary1.categories.juggler.highPayoutCount).toBe(1);
    expect(summary1.categories.juggler.totalEvaluated).toBe(2);
    expect(summary1.categories.juggler.rate).toBe(50.0);
    expect(summary1.categories.juggler.share).toBe(33.3);

    expect(summary1.categories.a_type.highPayoutCount).toBe(1);
    expect(summary1.categories.a_type.totalEvaluated).toBe(2);
    expect(summary1.categories.a_type.rate).toBe(50.0);
    expect(summary1.categories.a_type.share).toBe(33.3);

    // Scales
    expect(summary1.scaleTypes.large.highPayoutCount).toBe(2);
    expect(summary1.scaleTypes.large.totalEvaluated).toBe(4);
    expect(summary1.scaleTypes.large.rate).toBe(50.0);
    expect(summary1.scaleTypes.large.share).toBe(66.7);

    expect(summary1.scaleTypes.small.highPayoutCount).toBe(1);
    expect(summary1.scaleTypes.small.totalEvaluated).toBe(2);
    expect(summary1.scaleTypes.small.rate).toBe(50.0);
    expect(summary1.scaleTypes.small.share).toBe(33.3);

    // Rebound vs Retention
    expect(summary1.reboundRetention.analyzedCount).toBe(2);
    expect(summary1.reboundRetention.reboundCount).toBe(1);
    expect(summary1.reboundRetention.reboundRate).toBe(50.0);
    expect(summary1.reboundRetention.retentionCount).toBe(1);
    expect(summary1.reboundRetention.retentionRate).toBe(50.0);

    // Clusters
    expect(summary1.cluster.totalHighDays).toBe(2);
    expect(summary1.cluster.isolatedDaysCount).toBe(1);
    expect(summary1.cluster.pairDaysCount).toBe(1);
    expect(summary1.cluster.multiModelRate).toBe(50.0);
  });

  it('calculates Store 2 correctly with >= 3 days (isFewDays = false)', () => {
    const summary2 = calculateStoreHighPayoutSummary(store2, DEFAULT_HIGH_PAYOUT_CONFIG);

    expect(summary2.daysCount).toBe(4);
    expect(summary2.isFewDays).toBe(false);
    expect(summary2.totalMachineDays).toBe(8);
    expect(summary2.highPayoutCount).toBe(3);
    expect(summary2.highPayoutRate).toBe(37.5);

    // Categories
    expect(summary2.categories.smart_slot.highPayoutCount).toBe(2);
    expect(summary2.categories.smart_slot.totalEvaluated).toBe(4);
    expect(summary2.categories.smart_slot.rate).toBe(50.0);
    expect(summary2.categories.smart_slot.share).toBe(66.7);

    expect(summary2.categories.juggler.highPayoutCount).toBe(1);
    expect(summary2.categories.juggler.totalEvaluated).toBe(4);
    expect(summary2.categories.juggler.rate).toBe(25.0);
    expect(summary2.categories.juggler.share).toBe(33.3);

    // Rebound vs Retention (Both Day 2 high models had positive prev day diff)
    expect(summary2.reboundRetention.analyzedCount).toBe(2);
    expect(summary2.reboundRetention.reboundCount).toBe(0);
    expect(summary2.reboundRetention.retentionCount).toBe(2);
    expect(summary2.reboundRetention.retentionRate).toBe(100.0);
  });

  it('calculates All Stores Total (全店合計) accurately matching weighted hand calculations', () => {
    const result = calculateCrossStoreHighPayout([store1, store2], {
      config: DEFAULT_HIGH_PAYOUT_CONFIG,
    });

    const total = result.totalSummary;
    expect(total.storeName).toBe(ALL_STORES_NAME);
    expect(total.isTotal).toBe(true);

    // Days count: union of unique dates (Jan 1, 2, 3, 4) = 4
    expect(total.daysCount).toBe(4);
    expect(total.isFewDays).toBe(false);

    // Machine-days: 6 + 8 = 14
    expect(total.totalMachineDays).toBe(14);
    // High payout items: 3 + 3 = 6
    expect(total.highPayoutCount).toBe(6);
    // High payout rate: 6 / 14 = 42.857% -> 42.9%
    expect(total.highPayoutRate).toBe(42.9);

    // Categories across all stores:
    // smart_slot: 1 + 2 = 3 high out of 2 + 4 = 6 total (50.0%, 3/6 = 50.0% share)
    expect(total.categories.smart_slot.totalEvaluated).toBe(6);
    expect(total.categories.smart_slot.highPayoutCount).toBe(3);
    expect(total.categories.smart_slot.rate).toBe(50.0);
    expect(total.categories.smart_slot.share).toBe(50.0);

    // juggler: 1 + 1 = 2 high out of 2 + 4 = 6 total (33.3%, 2/6 = 33.3% share)
    expect(total.categories.juggler.totalEvaluated).toBe(6);
    expect(total.categories.juggler.highPayoutCount).toBe(2);
    expect(total.categories.juggler.rate).toBe(33.3);
    expect(total.categories.juggler.share).toBe(33.3);

    // a_type: 1 + 0 = 1 high out of 2 + 0 = 2 total (50.0%, 1/6 = 16.7% share)
    expect(total.categories.a_type.totalEvaluated).toBe(2);
    expect(total.categories.a_type.highPayoutCount).toBe(1);
    expect(total.categories.a_type.rate).toBe(50.0);
    expect(total.categories.a_type.share).toBe(16.7);

    // Scales across all stores:
    // large: 2 + 1 = 3 high out of 4 + 4 = 8 total (37.5%, 3/6 = 50.0% share)
    expect(total.scaleTypes.large.totalEvaluated).toBe(8);
    expect(total.scaleTypes.large.highPayoutCount).toBe(3);
    expect(total.scaleTypes.large.rate).toBe(37.5);
    expect(total.scaleTypes.large.share).toBe(50.0);

    // medium: 0 + 2 = 2 high out of 0 + 4 = 4 total (50.0%, 2/6 = 33.3% share)
    expect(total.scaleTypes.medium.totalEvaluated).toBe(4);
    expect(total.scaleTypes.medium.highPayoutCount).toBe(2);
    expect(total.scaleTypes.medium.rate).toBe(50.0);
    expect(total.scaleTypes.medium.share).toBe(33.3);

    // small: 1 + 0 = 1 high out of 2 + 0 = 2 total (50.0%, 1/6 = 16.7% share)
    expect(total.scaleTypes.small.totalEvaluated).toBe(2);
    expect(total.scaleTypes.small.highPayoutCount).toBe(1);
    expect(total.scaleTypes.small.rate).toBe(50.0);
    expect(total.scaleTypes.small.share).toBe(16.7);

    // Rebound vs Retention total:
    // analyzed: 2 + 2 = 4
    // rebound: 1 + 0 = 1 (25.0%)
    // retention: 1 + 2 = 3 (75.0%)
    expect(total.reboundRetention.analyzedCount).toBe(4);
    expect(total.reboundRetention.reboundCount).toBe(1);
    expect(total.reboundRetention.reboundRate).toBe(25.0);
    expect(total.reboundRetention.retentionCount).toBe(3);
    expect(total.reboundRetention.retentionRate).toBe(75.0);

    // Warning flags
    expect(result.hasFewDaysStores).toBe(true);
    expect(result.fewDaysStoreNames).toEqual(['メガホール新宿店']);
  });

  it('respects common period filtering when period is supplied', () => {
    // Only Jan 1 to Jan 2
    const result = calculateCrossStoreHighPayout([store1, store2], {
      period: {
        startDate: '2025-01-01',
        endDate: '2025-01-02',
        commonDaysCount: 2,
        hasCommonPeriod: true,
      },
    });

    const summary2 = result.storeSummaries.find((s) => s.storeId === 'store-2')!;
    // Now store 2 only evaluates Jan 1 & Jan 2 (2 days -> isFewDays = true)
    expect(summary2.daysCount).toBe(2);
    expect(summary2.isFewDays).toBe(true);
    expect(summary2.totalMachineDays).toBe(4); // 2 days * 2 models
    expect(summary2.highPayoutCount).toBe(3);
    expect(summary2.highPayoutRate).toBe(75.0); // 3 / 4 = 75%
  });
});
