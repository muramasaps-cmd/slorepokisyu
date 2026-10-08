import { describe, it, expect } from 'vitest';
import {
  runMachineBacktest,
  computeBlockBootstrapCI,
} from '../backtestEngine';
import { DailyRecord, DailyMachineRecord } from '../../data/types';

/**
 * Creates synthetic daily records with machine details.
 */
function createSyntheticMachineRecords(options: {
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
      inCoins: dayTotalGames * 3,
      outCoins: dayTotalGames * 3 + dayTotalDiff,
      payoutRate: 100,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: 0,
      gModelPlayerProfit: 0,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      machines,
    });
  }

  return records;
}

describe('runMachineBacktest & computeBlockBootstrapCI', () => {
  describe('computeBlockBootstrapCI', () => {
    it('returns 0 interval for empty series', () => {
      const ci = computeBlockBootstrapCI([]);
      expect(ci.ciLower).toBe(0);
      expect(ci.ciUpper).toBe(0);
    });

    it('returns proper 95% confidence interval for stationary positive lift series', () => {
      // 20 days with lifts consistently around +500
      const positiveLifts = [450, 520, 480, 510, 530, 470, 490, 550, 500, 460, 520, 510, 480, 530, 490, 510, 540, 470, 500, 520];
      const ci = computeBlockBootstrapCI(positiveLifts, 7, 1000, 42);
      expect(ci.ciLower).toBeGreaterThan(400);
      expect(ci.ciUpper).toBeLessThan(600);
      expect(ci.ciLower).toBeLessThanOrEqual(ci.ciUpper);
    });

    it('returns interval straddling 0 for zero-mean series', () => {
      // 20 days with oscillating lifts around 0
      const zeroLifts = [-200, 200, -150, 150, -300, 300, -100, 100, -250, 250, -180, 180, -220, 220, -120, 120, -50, 50, -10, 10];
      const ci = computeBlockBootstrapCI(zeroLifts, 7, 1000, 42);
      expect(ci.ciLower).toBeLessThanOrEqual(0);
      expect(ci.ciUpper).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runMachineBacktest', () => {
    it('handles empty or insufficient records gracefully', () => {
      const res = runMachineBacktest([]);
      expect(res.evaluatedDaysCount).toBe(0);
      expect(res.withFilter.hasEdge).toBe(false);
      expect(res.withoutFilter.hasEdge).toBe(false);
    });

    it('determines "優位性なし" on synthetic data with no true difference between machines', () => {
      // 25 days, 15 machines, no biased machines
      const neutralData = createSyntheticMachineRecords({
        daysCount: 25,
        machinesCount: 15,
        biasedMachineNums: [],
      });

      const result = runMachineBacktest(neutralData, undefined, {
        topN: 5,
        bootstrapIterations: 500,
        minPriorDays: 5,
        seed: 42,
      });

      expect(result.evaluatedDaysCount).toBeGreaterThan(15);
      // Interval should straddle 0 -> hasEdge is false
      expect(result.withoutFilter.hasEdge).toBe(false);
      expect(result.withoutFilter.verdictMessage).toContain('優位性は確認されていません');
      expect(result.withFilter.hasEdge).toBe(false);
    });

    it('determines "優位性あり" on synthetic data where specific machines have true positive bias', () => {
      // 25 days, 16 machines, machines 101, 102, 103 are consistently high settings (+2500 diff)
      const biasedData = createSyntheticMachineRecords({
        daysCount: 25,
        machinesCount: 16,
        biasedMachineNums: [101, 102, 103],
        biasBonus: 2500,
      });

      const result = runMachineBacktest(biasedData, undefined, {
        topN: 3,
        bootstrapIterations: 500,
        minPriorDays: 5,
        seed: 42,
      });

      expect(result.evaluatedDaysCount).toBeGreaterThan(15);
      // Lift should be substantially positive
      expect(result.withoutFilter.avgLift).toBeGreaterThan(500);
      expect(result.withoutFilter.ci95[0]).toBeGreaterThan(0);
      expect(result.withoutFilter.hasEdge).toBe(true);
      expect(result.withoutFilter.verdictMessage).toContain('優位性');

      // Check all 4 baselines are properly calculated
      const baselines = result.withoutFilter.baselines;
      expect(baselines.randomMachine).toBeDefined();
      expect(baselines.randomWithinModel).toBeDefined();
      expect(baselines.modelAverage).toBeDefined();
      expect(baselines.priorDayDiff).toBeDefined();
      expect(typeof baselines.randomMachine.avgLift).toBe('number');
      expect(typeof baselines.randomWithinModel.avgLift).toBe('number');
      expect(typeof baselines.modelAverage.avgLift).toBe('number');
      expect(typeof baselines.priorDayDiff.avgLift).toBe('number');
    });

    it('reports both "withFilter" and "withoutFilter" results', () => {
      const data = createSyntheticMachineRecords({
        daysCount: 15,
        machinesCount: 12,
        biasedMachineNums: [101],
      });

      const result = runMachineBacktest(data, undefined, {
        topN: 3,
        minEvidenceDays: 5,
        bootstrapIterations: 200,
      });

      expect(result.withFilter).toBeDefined();
      expect(result.withoutFilter).toBeDefined();
      expect(result.withFilter.topN).toBe(3);
      expect(result.withoutFilter.topN).toBe(3);
      expect(result.minEvidenceThreshold).toBe(5);
    });
  });
});
