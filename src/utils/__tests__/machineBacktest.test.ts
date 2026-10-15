import { describe, it, expect } from 'vitest';
import {
  runMachineBacktest,
  runMachineRollingValidation,
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

    it('does not judge any ablation component as having an edge on pure noise data (Prompt 14)', () => {
      // 25 days of pure noise data across 16 machines with no true bias
      const noiseData = createSyntheticMachineRecords({
        daysCount: 25,
        machinesCount: 16,
        biasedMachineNums: [],
        seed: 99999,
      });

      const result = runMachineBacktest(noiseData, undefined, {
        topN: 3,
        bootstrapIterations: 300,
        minPriorDays: 5,
        seed: 42,
      });

      expect(result.ablationResults).toBeDefined();
      expect(result.ablationResults!.length).toBeGreaterThanOrEqual(5);

      // On pure noise, none of the variants should be judged as statistically superior (優位性あり: CI lower bound > 0)
      for (const variant of result.ablationResults!) {
        // Lower bound of 95% CI must be <= 0 (not statistically superior)
        expect(variant.ci95[0]).toBeLessThanOrEqual(0);
      }
    });

    it('confirms that adding any element on pure noise data is never judged as superior (Prompt completion condition)', () => {
      // Test across multiple noise datasets (independent seeds)
      const testSeeds = [11111, 22222, 55555];

      for (const noiseSeed of testSeeds) {
        const noiseData = createSyntheticMachineRecords({
          daysCount: 25,
          machinesCount: 16,
          biasedMachineNums: [],
          seed: noiseSeed,
        });

        const result = runMachineBacktest(noiseData, undefined, {
          topN: 3,
          bootstrapIterations: 300,
          minPriorDays: 5,
          seed: 42,
        });

        expect(result.ablationResults).toBeDefined();
        const ablationList = result.ablationResults!;

        // 1. Every variant (all, cohortDiffOnly, noHighSetting, noModelScore, noTailZoro) has CI lower <= 0
        for (const item of ablationList) {
          expect(item.ci95[0]).toBeLessThanOrEqual(0);
        }

        // 2. Element additions evaluated via rolling validation:
        // Trying to change or add features on noise data must not result in isRecommended = true
        const candidateVariants = [
          { highSettingWeight: 0 },
          { modelScoreWeight: 0 },
          { tailMatchBonus: 0, zoroBonus: 0 },
          { highSettingWeight: 0, modelScoreWeight: 0, tailMatchBonus: 0, zoroBonus: 0 },
        ];

        for (const candidate of candidateVariants) {
          const rolling = runMachineRollingValidation(
            noiseData,
            undefined,
            candidate,
            undefined,
            3
          );
          if (rolling) {
            // Over noise, no modification should be recommended
            expect(rolling.isRecommended).toBe(false);
            expect(rolling.bootstrapCiLower).toBeLessThanOrEqual(0);
          }
        }
      }
    });

    it('uses rolling validation (3-5 splits) and block bootstrap to reject weight changes on noise data', () => {
      const noiseData = createSyntheticMachineRecords({
        daysCount: 25,
        machinesCount: 16,
        biasedMachineNums: [],
        seed: 77777,
      });

      const rollingResult = runMachineRollingValidation(
        noiseData,
        undefined,
        { highSettingWeight: 0, modelScoreWeight: 0 },
        undefined,
        3
      );

      expect(rollingResult).not.toBeNull();
      if (!rollingResult) return;

      // Must use between 3 and 5 splits
      expect(rollingResult.numSplits).toBeGreaterThanOrEqual(3);
      expect(rollingResult.numSplits).toBeLessThanOrEqual(5);
      expect(rollingResult.splitGains.length).toBe(rollingResult.numSplits);

      // On noise data, weight changes must NOT be recommended
      expect(rollingResult.isRecommended).toBe(false);
      expect(rollingResult.verdictMessage).toContain('標準維持推奨');
    });

    it('confirms that model score ablation drops lift when models have strong differential differences (Prompt 15 Requirement 6)', () => {
      const daysCount = 35;
      const records: DailyRecord[] = [];
      const baseDate = new Date('2026-03-01T00:00:00Z');

      for (let d = 0; d < daysCount; d++) {
        const curDate = new Date(baseDate.getTime() + d * 86400000);
        const dateStr = curDate.toISOString().slice(0, 10);
        const isEvalDay = d >= 10;

        // Model A: machines 101, 102 perform well (+1500 on eval days, 0 on prior days)
        // Model B: machine 222 (Zoro) has temporary prior fluke (+900) but drops to -1500 on eval days.
        // Model B: machine 202 is consistently negative (-3000), making Model B's model score strongly negative.
        const m101Diff = isEvalDay ? 1500 : 0;
        const m102Diff = isEvalDay ? 1500 : 0;
        const m222Diff = isEvalDay ? -1500 : 900;
        const m202Diff = -3000;

        const machines: DailyMachineRecord[] = [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 5000, diff: m101Diff, bb: 15, rb: 15 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 5000, diff: m102Diff, bb: 15, rb: 15 },
          { machineNum: 222, modelName: 'パチスロ北斗の拳', games: 5000, diff: m222Diff, bb: 15, rb: 15, isZoro: true },
          { machineNum: 202, modelName: 'パチスロ北斗の拳', games: 5000, diff: m202Diff, bb: 5, rb: 5 },
        ];

        const totalDiff = machines.reduce((acc, m) => acc + m.diff, 0);
        const inCoins = machines.reduce((acc, m) => acc + m.games * 3, 0);
        const outCoins = inCoins + totalDiff;

        records.push({
          date: dateStr,
          year: curDate.getFullYear(),
          month: curDate.getMonth() + 1,
          day: curDate.getDate(),
          yearMonth: dateStr.slice(0, 7),
          dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][curDate.getDay()],
          totalDiffCoins: totalDiff,
          avgDiffCoins: Math.round(totalDiff / machines.length),
          avgGames: 5000,
          winRate: 50,
          winMachines: 2,
          totalMachines: 4,
          hallCoinProfit: -totalDiff,
          playerCoinProfit: totalDiff,
          hallYenProfit: 0,
          playerYenProfit: 0,
          inCoins,
          outCoins,
          payoutRate: inCoins > 0 ? (outCoins / inCoins) * 100 : 100,
          estimatedRevenue: 0,
          exchangeGapProfit: 0,
          gModelHallProfit: 0,
          gModelPlayerProfit: 0,
          isOldEventDay: false,
          is7Day: false,
          notable: '',
          models: [
            {
              modelName: 'マイジャグラーV',
              totalMachines: 2,
              totalDiffCoins: m101Diff + m102Diff,
              avgDiffCoins: Math.round((m101Diff + m102Diff) / 2),
              avgGames: 5000,
              winRate: 100,
              winMachines: 2,
            },
            {
              modelName: 'パチスロ北斗の拳',
              totalMachines: 2,
              totalDiffCoins: m222Diff + m202Diff,
              avgDiffCoins: Math.round((m222Diff + m202Diff) / 2),
              avgGames: 5000,
              winRate: 0,
              winMachines: 0,
            },
          ],
          tails: [],
          machines,
        });
      }

      const res = runMachineBacktest(records, undefined, {
        topN: 2,
        bootstrapIterations: 500,
        minPriorDays: 10,
        seed: 42,
      });

      expect(res.ablationResults).toBeDefined();
      const allItem = res.ablationResults!.find((r) => r.variantKey === 'all')!;
      const noModelItem = res.ablationResults!.find((r) => r.variantKey === 'noModelScore')!;

      expect(allItem).toBeDefined();
      expect(noModelItem).toBeDefined();

      // Lift of "all" must be strictly greater than "noModelScore" (Requirement 6)
      expect(allItem.avgLift).toBeGreaterThan(noModelItem.avgLift);
      // liftDelta (Δ = all - noModelScore) must be strictly positive
      expect(noModelItem.liftDelta).toBeGreaterThan(0);
    });

    it('verifies interval decision rules, Holm adjustments, and safe zero-weight proposal requirements', () => {
      const noiseData = createSyntheticMachineRecords({
        daysCount: 40, // < 60 days to test short period warning, < 90 days to test safe 90-day threshold
        machinesCount: 16,
        biasedMachineNums: [],
        seed: 99999,
      });

      const res = runMachineBacktest(noiseData, undefined, {
        topN: 3,
        bootstrapIterations: 500,
        minPriorDays: 5,
        seed: 42,
      });

      expect(res.ablationResults).toBeDefined();
      const ablationList = res.ablationResults!;

      // Requirement 5: Evaluation period < 60 days gets isShortPeriodWarning = true
      for (const item of ablationList) {
        expect(item.isShortPeriodWarning).toBe(true);
      }

      // Requirement 3: Multiplicity correction (Holm method) p-values and CIs are computed
      const nonAll = ablationList.filter((item) => item.variantKey !== 'all');
      for (const item of nonAll) {
        expect(item.deltaCi95).toBeDefined();
        expect(item.deltaCi95![0]).toBeLessThanOrEqual(item.deltaCi95![1]);
        expect(item.holmPValue).toBeDefined();
        expect(item.holmPValue!).toBeGreaterThanOrEqual(0);
        expect(item.holmPValue!).toBeLessThanOrEqual(1);
        expect(item.holmCi95).toBeDefined();

        // Requirement 2: On noise data, element is never judged as contributing
        expect(item.verdict).not.toBe('contributing');
        expect(item.deltaCi95![0]).toBeLessThanOrEqual(0);

        // Requirement 4: Since evaluated days < 90, recommendZeroWeight MUST be false
        expect(item.recommendZeroWeight).toBe(false);
        expect(item.diagnosisMessage).toContain('データ不足のため判定できません');
      }
    });
  });
});

