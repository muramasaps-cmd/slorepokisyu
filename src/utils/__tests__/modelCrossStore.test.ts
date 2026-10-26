import { describe, it, expect } from 'vitest';
import {
  calculateStoreModelMetric,
  calculateCrossStoreModelRows,
  calculateModelMonthlyTrends,
  estimateCrossStoreModelSettings,
} from '../modelCrossStore';
import { DailyRecord, StoreProfile } from '../../data/types';
import { DEFAULT_JUGGLER_SPECS } from '../settingSpecs';
import { ALL_STORES_TOTAL_NAME, ALL_STORES_TOTAL_STORE_ID } from '../conditionAnalysis';

function createMockDailyRecord(
  date: string,
  modelName: string,
  machines: number,
  avgDiffCoins: number,
  avgGames: number
): DailyRecord {
  const day = parseInt(date.slice(8, 10), 10);
  const totalDiff = avgDiffCoins * machines;
  const inCoins = avgGames * 3 * machines;
  const outCoins = inCoins + totalDiff;
  const payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;

  return {
    date,
    yearMonth: date.slice(0, 7),
    year: parseInt(date.slice(0, 4), 10),
    month: parseInt(date.slice(5, 7), 10),
    day,
    dayOfWeek: '月',
    avgDiffCoins,
    avgGames,
    winRate: 50,
    winMachines: Math.round(machines * 0.5),
    totalMachines: machines,
    totalDiffCoins: totalDiff,
    hallCoinProfit: -totalDiff,
    playerCoinProfit: totalDiff,
    hallYenProfit: -totalDiff * 20,
    playerYenProfit: totalDiff * 20,
    inCoins,
    outCoins,
    payoutRate,
    estimatedRevenue: 100000,
    exchangeGapProfit: 5000,
    gModelHallProfit: -totalDiff * 20,
    gModelPlayerProfit: totalDiff * 20,
    isOldEventDay: false,
    is7Day: false,
    notable: '',
    models: [
      {
        modelName,
        avgDiffCoins,
        totalDiffCoins: totalDiff,
        avgGames,
        winRate: 50,
        winMachines: Math.round(machines * 0.5),
        totalMachines: machines,
      },
    ],
  };
}

function createMockStore(
  id: string,
  name: string,
  dailyRecords: DailyRecord[]
): StoreProfile {
  return {
    id,
    name,
    totalMachinesApprox: 200,
    dailyRecords,
    address: '東京都',
    oldEventDays: '7のつく日',
    exchangeRate: '50枚/50枚',
    rateLend: 20,
    rateExchange: 20,
    dataRange: '2025-01',
  };
}

describe('Prompt 52: 機種の横断（機種×店舗）- modelCrossStore.ts', () => {
  describe('1. 共通機種の判定 (Common model detection and sorting)', () => {
    it('correctly marks models present in >= 2 stores as common and places them at the top', () => {
      // Store 1 has "マイジャグラーV" and "店舗1限定機"
      const store1Records: DailyRecord[] = [
        createMockDailyRecord('2025-01-06', 'マイジャグラーV', 10, 100, 5000),
        createMockDailyRecord('2025-01-06', '店舗1限定機', 5, -50, 4000),
      ];
      // Store 2 has "マイジャグラーV" and "店舗2限定機"
      const store2Records: DailyRecord[] = [
        createMockDailyRecord('2025-01-06', 'マイジャグラーV', 20, 200, 6000),
        createMockDailyRecord('2025-01-06', '店舗2限定機', 8, 80, 5000),
      ];

      const store1 = createMockStore('store-1', 'メガホールA', store1Records);
      const store2 = createMockStore('store-2', 'ギガホールB', store2Records);

      const rows = calculateCrossStoreModelRows([store1, store2]);

      expect(rows.length).toBe(3);

      // The top row must be the common model (マイジャグラーV)
      expect(rows[0].modelName).toBe('マイジャグラーV');
      expect(rows[0].isCommon).toBe(true);
      expect(rows[0].storeCount).toBe(2);

      // The remaining models must be single-store models
      const singleModels = rows.slice(1);
      expect(singleModels.every((r) => r.isCommon === false)).toBe(true);
      expect(singleModels.every((r) => r.storeCount === 1)).toBe(true);

      const store1Only = rows.find((r) => r.modelName === '店舗1限定機');
      expect(store1Only).toBeDefined();
      expect(store1Only?.isCommon).toBe(false);
      expect(store1Only?.storeMetrics['store-1']).not.toBeNull();
      expect(store1Only?.storeMetrics['store-2']).toBeNull();

      const store2Only = rows.find((r) => r.modelName === '店舗2限定機');
      expect(store2Only).toBeDefined();
      expect(store2Only?.isCommon).toBe(false);
      expect(store2Only?.storeMetrics['store-1']).toBeNull();
      expect(store2Only?.storeMetrics['store-2']).not.toBeNull();
    });
  });

  describe('2. 手計算との一致検証 (Hand-calculated synthetic data verification)', () => {
    it('accurately calculates store-level and total avgDiff, IN-weighted payoutRate, and operating days', () => {
      // Store 1: 10 machines, games = 5000, avgDiff = +200
      // diff = +2000, IN = 5000 * 3 * 10 = 150,000, OUT = 152,000
      // PayoutRate = 152,000 / 150,000 * 100 = 101.333... -> 101.33%
      const store1Records = [
        createMockDailyRecord('2025-01-06', 'マイジャグラーV', 10, 200, 5000),
      ];

      // Store 2: 20 machines, games = 6000, avgDiff = -50
      // diff = -1000, IN = 6000 * 3 * 20 = 360,000, OUT = 359,000
      // PayoutRate = 359,000 / 360,000 * 100 = 99.722... -> 99.72%
      const store2Records = [
        createMockDailyRecord('2025-01-06', 'マイジャグラーV', 20, -50, 6000),
      ];

      const store1 = createMockStore('store-1', '第1店舗', store1Records);
      const store2 = createMockStore('store-2', '第2店舗', store2Records);

      const m1 = calculateStoreModelMetric(store1Records, store1, 'マイジャグラーV');
      expect(m1).toBeDefined();
      expect(m1?.avgMachines).toBe(10);
      expect(m1?.totalMachineDays).toBe(10);
      expect(m1?.totalDiffCoins).toBe(2000);
      expect(m1?.avgDiffCoins).toBe(200);
      expect(m1?.totalInCoins).toBe(150000);
      expect(m1?.totalOutCoins).toBe(152000);
      expect(m1?.payoutRate).toBe(101.33);
      expect(m1?.operatingDays).toBe(1);

      const m2 = calculateStoreModelMetric(store2Records, store2, 'マイジャグラーV');
      expect(m2).toBeDefined();
      expect(m2?.avgMachines).toBe(20);
      expect(m2?.totalMachineDays).toBe(20);
      expect(m2?.totalDiffCoins).toBe(-1000);
      expect(m2?.avgDiffCoins).toBe(-50);
      expect(m2?.totalInCoins).toBe(360000);
      expect(m2?.totalOutCoins).toBe(359000);
      expect(m2?.payoutRate).toBe(99.72);
      expect(m2?.operatingDays).toBe(1);

      // Cross store row total verification:
      // Total machines = 10 + 20 = 30
      // Total machine days = 30
      // Total Diff = +2000 - 1000 = +1000
      // Total avgDiff = 1000 / 30 = 33.333... -> 33.3枚/台
      // Total IN = 150,000 + 360,000 = 510,000
      // Total OUT = 152,000 + 359,000 = 511,000
      // Total payoutRate = 511,000 / 510,000 * 100 = 100.196... -> 100.20%
      const rows = calculateCrossStoreModelRows([store1, store2]);
      const myJuggler = rows.find((r) => r.modelName === 'マイジャグラーV')!;
      expect(myJuggler).toBeDefined();
      expect(myJuggler.total.storeName).toBe(ALL_STORES_TOTAL_NAME);
      expect(myJuggler.total.avgMachines).toBe(30);
      expect(myJuggler.total.totalMachineDays).toBe(30);
      expect(myJuggler.total.totalDiffCoins).toBe(1000);
      expect(myJuggler.total.avgDiffCoins).toBe(33.3);
      expect(myJuggler.total.payoutRate).toBe(100.2);
    });
  });

  describe('3. 仕様テーブル未登録機種の扱い (Unregistered setting spec handling)', () => {
    it('correctly handles registered specs and produces setting equivalent & range', () => {
      const records = [
        createMockDailyRecord('2025-01-06', 'マイジャグラーV', 10, 150, 6000),
      ];
      const store = createMockStore('store-1', '本店', records);

      const est = estimateCrossStoreModelSettings([store], 'マイジャグラーV', DEFAULT_JUGGLER_SPECS);
      expect(est.length).toBe(1);
      expect(est[0].hasSpec).toBe(true);
      expect(est[0].settingEquivalent).toBeDefined();
      expect(est[0].settingEquivalent).toBeGreaterThan(1);
      expect(est[0].highSettingRange).toBeDefined();
      expect(est[0].unregisteredMessage).toBeUndefined();
    });

    it('indicates spec is missing without error when an unknown model is evaluated', () => {
      const records = [
        createMockDailyRecord('2025-01-06', '謎の未登録パチスロ機X', 5, 200, 5000),
      ];
      const store = createMockStore('store-1', '本店', records);

      const est = estimateCrossStoreModelSettings([store], '謎の未登録パチスロ機X', DEFAULT_JUGGLER_SPECS);
      expect(est.length).toBe(1);
      expect(est[0].hasSpec).toBe(false);
      expect(est[0].settingEquivalent).toBeUndefined();
      expect(est[0].highSettingRange).toBeUndefined();
      expect(est[0].unregisteredMessage).toContain('仕様未登録');
    });
  });

  describe('4. 月別推移計算 (calculateModelMonthlyTrends)', () => {
    it('calculates monthly avgDiff for each store and total across months', () => {
      const store1Records = [
        createMockDailyRecord('2025-01-10', 'マイジャグラーV', 10, 100, 5000),
        createMockDailyRecord('2025-02-10', 'マイジャグラーV', 10, 200, 5000),
      ];
      const store2Records = [
        createMockDailyRecord('2025-01-15', 'マイジャグラーV', 10, -50, 5000),
        createMockDailyRecord('2025-02-15', 'マイジャグラーV', 10, 50, 5000),
      ];

      const store1 = createMockStore('s1', '店舗1', store1Records);
      const store2 = createMockStore('s2', '店舗2', store2Records);

      const trends = calculateModelMonthlyTrends([store1, store2], 'マイジャグラーV');
      expect(trends.length).toBe(2);

      // January
      const jan = trends.find((t) => t.yearMonth === '2025-01');
      expect(jan).toBeDefined();
      expect(jan?.['store_s1']).toBe(100);
      expect(jan?.['store_s2']).toBe(-50);
      // Total Jan: (+1000 - 500) / 20 = 500 / 20 = 25.0
      expect(jan?.totalAvgDiff).toBe(25);

      // February
      const feb = trends.find((t) => t.yearMonth === '2025-02');
      expect(feb).toBeDefined();
      expect(feb?.['store_s1']).toBe(200);
      expect(feb?.['store_s2']).toBe(50);
      // Total Feb: (+2000 + 500) / 20 = 2500 / 20 = 125.0
      expect(feb?.totalAvgDiff).toBe(125);
    });
  });
});
