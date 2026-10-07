import { describe, it, expect } from 'vitest';
import { processStoreData } from '../dataEngine';
import { DailyRecord } from '../../data/types';

function createMinimalRecord(overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date: '2024-01-01',
    yearMonth: '2024-01',
    year: 2024,
    month: 1,
    day: 1,
    dayOfWeek: '月',
    avgDiffCoins: 0,
    avgGames: 5000,
    winRate: 50,
    winMachines: 50,
    totalMachines: 100,
    totalDiffCoins: 0,
    hallCoinProfit: 0,
    playerCoinProfit: 0,
    hallYenProfit: 0,
    playerYenProfit: 0,
    inCoins: 0,
    outCoins: 0,
    payoutRate: 100,
    estimatedRevenue: 0,
    exchangeGapProfit: 0,
    gModelHallProfit: 0,
    gModelPlayerProfit: 0,
    isOldEventDay: false,
    is7Day: false,
    notable: '',
    ...overrides,
  };
}

describe('processStoreData', () => {
  it('returns empty arrays when input records are empty', () => {
    const result = processStoreData([], 46, 50, 70);
    expect(result.dailyRecords).toEqual([]);
    expect(result.monthlyStats).toEqual([]);
  });

  describe('machine count imputation (台数欠損の補完)', () => {
    it('imputes missing machine count from the nearest available day', () => {
      const records: DailyRecord[] = [
        createMinimalRecord({ date: '2024-01-01', totalMachines: 250 }),
        createMinimalRecord({ date: '2024-01-02', totalMachines: 0 }), // missing
        createMinimalRecord({ date: '2024-01-03', totalMachines: 280 }),
      ];

      const { dailyRecords } = processStoreData(records, 46, 50, 70);

      // Day 2 (index 1) has nearest valid neighbor at index 0 (dist 1) with 250 machines
      expect(dailyRecords[1].totalMachines).toBe(250);
      expect(dailyRecords[1].isReusedMachines).toBe(true);
      expect(dailyRecords[0].isReusedMachines).toBeFalsy();
    });

    it('falls back to mode machine count when no immediate neighbor exists or all are missing', () => {
      // 3 records: day 1 has 300, day 2 has 300, day 3 is missing, day 4 has 200
      const records: DailyRecord[] = [
        createMinimalRecord({ date: '2024-01-01', totalMachines: 300 }),
        createMinimalRecord({ date: '2024-01-02', totalMachines: 300 }),
        createMinimalRecord({ date: '2024-01-03', totalMachines: 0 }),
      ];

      const { dailyRecords } = processStoreData(records, 46, 50, 70);
      expect(dailyRecords[2].totalMachines).toBe(300);
      expect(dailyRecords[2].isReusedMachines).toBe(true);
    });

    it('derives winMachines when winRate and machines are available but winMachines is null', () => {
      const records: DailyRecord[] = [
        createMinimalRecord({
          date: '2024-01-01',
          totalMachines: 200,
          winRate: 45.0,
          winMachines: null,
        }),
      ];

      const { dailyRecords } = processStoreData(records, 46, 50, 70);
      expect(dailyRecords[0].winMachines).toBe(90); // 200 * 0.45
    });

    it('derives winRate when winMachines and machines are available but winRate is null', () => {
      const records: DailyRecord[] = [
        createMinimalRecord({
          date: '2024-01-01',
          totalMachines: 200,
          winMachines: 110,
          winRate: null,
        }),
      ];

      const { dailyRecords } = processStoreData(records, 46, 50, 70);
      expect(dailyRecords[0].winRate).toBe(55); // (110 / 200) * 100
    });

    it('derives totalDiffCoins from avgDiffCoins * machines when totalDiffCoins is 0 or undefined', () => {
      const records: DailyRecord[] = [
        createMinimalRecord({
          date: '2024-01-01',
          totalMachines: 100,
          avgDiffCoins: 150,
          totalDiffCoins: 0,
        }),
      ];

      const { dailyRecords } = processStoreData(records, 46, 50, 70);
      expect(dailyRecords[0].totalDiffCoins).toBe(15000);
    });
  });

  describe('gross profit calculation (粗利計算)', () => {
    // Lend: 46枚/1000円 -> 21.73913円/枚
    // Exchange: 50枚/1000円 -> 20.00000円/枚
    // Gap: 1.73913円/枚
    const rateLend = 46;
    const rateExchange = 50;
    const cashRatio = 70; // 70% cash investment

    it('calculates Model A yen profit correctly for hall profit (player loss)', () => {
      // Hall coin profit = -totalDiffCoins.
      // If player lost 10,000 coins (totalDiffCoins = -10,000), hall profit is +10,000 coins.
      // Valued at lend rate: 10000 * (1000 / 46) = 217,391 yen
      const records: DailyRecord[] = [
        createMinimalRecord({
          date: '2024-01-01',
          totalMachines: 100,
          avgDiffCoins: -100,
          totalDiffCoins: -10000,
        }),
      ];

      const { dailyRecords } = processStoreData(records, rateLend, rateExchange, cashRatio);
      const r = dailyRecords[0];

      expect(r.hallCoinProfit).toBe(10000);
      expect(r.playerCoinProfit).toBe(-10000);
      expect(r.hallYenProfit).toBe(Math.round(10000 * (1000 / 46))); // 217,391
    });

    it('calculates Model A yen profit correctly for player profit (hall payout loss)', () => {
      // Player won 10,000 coins (totalDiffCoins = +10,000), hall coin profit = -10,000 coins.
      // Hall payout cost valued at exchange rate: -10000 * (1000 / 50) = -200,000 yen
      const records: DailyRecord[] = [
        createMinimalRecord({
          date: '2024-01-01',
          totalMachines: 100,
          avgDiffCoins: 100,
          totalDiffCoins: 10000,
        }),
      ];

      const { dailyRecords } = processStoreData(records, rateLend, rateExchange, cashRatio);
      const r = dailyRecords[0];

      expect(r.hallCoinProfit).toBe(-10000);
      expect(r.playerCoinProfit).toBe(10000);
      expect(r.hallYenProfit).toBe(Math.round(-10000 * (1000 / 50))); // -200,000
    });

    it('calculates Model B turnover (IN coins) and exchange gap profit accurately', () => {
      // 100 machines, 6000 avgGames -> inCoins = 6000 * 3 * 100 = 1,800,000 coins
      // cashCoinsInvested = 1,800,000 * 0.70 = 1,260,000 coins
      // lendYenPerCoin = 1000 / 46 ≈ 21.73913
      // exchangeYenPerCoin = 1000 / 50 = 20.0
      // gapPerCoin = 21.73913 - 20 = 1.73913
      // exchangeGapProfit = Math.round(1,260,000 * (1000/46 - 1000/50))
      // totalDiffCoins = +5000 (player won 5000)
      // gModelHallProfit = exchangeGapProfit - (5000 * 20)
      const records: DailyRecord[] = [
        createMinimalRecord({
          date: '2024-01-01',
          totalMachines: 100,
          avgGames: 6000,
          avgDiffCoins: 50,
          totalDiffCoins: 5000,
        }),
      ];

      const { dailyRecords } = processStoreData(records, rateLend, rateExchange, cashRatio);
      const r = dailyRecords[0];

      const expectedInCoins = 6000 * 3 * 100; // 1,800,000
      expect(r.inCoins).toBe(expectedInCoins);
      expect(r.outCoins).toBe(expectedInCoins + 5000);

      const cashInvested = expectedInCoins * 0.7;
      const expectedGapProfit = Math.round(cashInvested * (1000 / 46 - 1000 / 50));
      expect(r.exchangeGapProfit).toBe(expectedGapProfit);

      const expectedGProfit = Math.round(expectedGapProfit - 5000 * (1000 / 50));
      expect(r.gModelHallProfit).toBe(expectedGProfit);
      expect(r.gModelPlayerProfit).toBe(-expectedGProfit);
    });
  });

  describe('monthly aggregation', () => {
    it('aggregates daily records by yearMonth', () => {
      const records: DailyRecord[] = [
        createMinimalRecord({ date: '2024-01-10', yearMonth: '2024-01', totalDiffCoins: 5000 }),
        createMinimalRecord({ date: '2024-01-20', yearMonth: '2024-01', totalDiffCoins: -2000 }),
        createMinimalRecord({ date: '2024-02-05', yearMonth: '2024-02', totalDiffCoins: 3000 }),
      ];

      const { monthlyStats } = processStoreData(records, 46, 50, 70);

      expect(monthlyStats.length).toBe(2);
      expect(monthlyStats[0].yearMonth).toBe('2024-01');
      expect(monthlyStats[0].daysCount).toBe(2);
      expect(monthlyStats[0].totalDiffCoins).toBe(3000);

      expect(monthlyStats[1].yearMonth).toBe('2024-02');
      expect(monthlyStats[1].daysCount).toBe(1);
      expect(monthlyStats[1].totalDiffCoins).toBe(3000);
    });
  });
});
