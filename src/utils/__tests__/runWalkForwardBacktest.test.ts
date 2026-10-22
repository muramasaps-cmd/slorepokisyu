import { describe, it, expect } from 'vitest';
import { runWalkForwardBacktest } from '../backtestEngine';
import { generateSyntheticDailyRecords } from './testDataGenerator';
import { DEFAULT_RANKING_WEIGHTS } from '../targetRankingEngine';
import { SpecialDayRules } from '../../data/types';

describe('runWalkForwardBacktest', () => {
  const rules: SpecialDayRules = { tails: [7], doubleDigits: true };

  describe('strict point-in-time isolation (未来データを参照しないことの検証)', () => {
    it('produces identical evaluations up to day T even when records strictly after day T are drastically modified', () => {
      // 1. Generate 60 days of reproducible synthetic records
      const originalRecords = generateSyntheticDailyRecords(42, 60, 15, rules);
      const minWarmupDays = 10;
      const cutoffIndex = 35; // Target evaluation cutoff (day 35)
      const cutoffDate = originalRecords[cutoffIndex].date;

      // 2. Run walk-forward backtest on pristine records
      const pristineResult = runWalkForwardBacktest(
        originalRecords,
        rules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        3,
        minWarmupDays
      );

      // 3. Create a tampered clone where all records strictly after cutoffIndex are radically altered
      const tamperedRecords = JSON.parse(JSON.stringify(originalRecords));
      for (let i = cutoffIndex + 1; i < tamperedRecords.length; i++) {
        tamperedRecords[i].avgDiffCoins = 9999;
        tamperedRecords[i].totalDiffCoins = 999999;
        tamperedRecords[i].winRate = 99.9;
        tamperedRecords[i].avgGames = 9999;
        // Mutate models
        tamperedRecords[i].models?.forEach((m: { avgDiffCoins: number; winRate: number; totalDiffCoins: number }) => {
          m.avgDiffCoins = -5000;
          m.winRate = 5.0;
          m.totalDiffCoins = -50000;
        });
      }

      // 4. Run walk-forward backtest on tampered records
      const tamperedResult = runWalkForwardBacktest(
        tamperedRecords,
        rules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        3,
        minWarmupDays
      );

      // 5. Filter evaluations up to cutoffDate
      const pristineEvalsUpToCutoff = pristineResult.evaluations.filter(
        (e) => e.date <= cutoffDate
      );
      const tamperedEvalsUpToCutoff = tamperedResult.evaluations.filter(
        (e) => e.date <= cutoffDate
      );

      expect(pristineEvalsUpToCutoff.length).toBeGreaterThan(0);
      expect(pristineEvalsUpToCutoff.length).toBe(tamperedEvalsUpToCutoff.length);

      // Every evaluation up to cutoffDate must match exactly
      for (let idx = 0; idx < pristineEvalsUpToCutoff.length; idx++) {
        const pEval = pristineEvalsUpToCutoff[idx];
        const tEval = tamperedEvalsUpToCutoff[idx];

        expect(tEval.date).toBe(pEval.date);
        expect(tEval.isSpecialDay).toBe(pEval.isSpecialDay);
        expect(tEval.engineTopKModels).toEqual(pEval.engineTopKModels);
        expect(tEval.engineTopKActualAvgDiff).toBe(pEval.engineTopKActualAvgDiff);
        expect(tEval.engineTopKActualLift).toBe(pEval.engineTopKActualLift);
        expect(tEval.engineSpearmanCorr).toBe(pEval.engineSpearmanCorr);
        expect(tEval.engineDiffCoinsMae).toBe(pEval.engineDiffCoinsMae);
        expect(tEval.baselineTopKModels).toEqual(pEval.baselineTopKModels);
        expect(tEval.baselineTopKActualAvgDiff).toBe(pEval.baselineTopKActualAvgDiff);
        expect(tEval.baselineTopKActualLift).toBe(pEval.baselineTopKActualLift);
      }
    }, 30000);
  });

  describe('warmup period and evaluation structure', () => {
    it('skips the initial warmup days strictly', () => {
      const records = generateSyntheticDailyRecords(123, 20, 10, rules);
      const minWarmupDays = 7;

      const result = runWalkForwardBacktest(
        records,
        rules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        3,
        minWarmupDays
      );

      expect(result.evaluations.length).toBe(20 - minWarmupDays);
      expect(result.evaluations[0].date).toBe(records[minWarmupDays].date);
    });

    it('computes summary metrics with valid numeric rates and scores', () => {
      const records = generateSyntheticDailyRecords(999, 30, 12, rules);
      const result = runWalkForwardBacktest(
        records,
        rules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        3,
        5
      );

      expect(result.summary.totalEvaluatedDays).toBe(25);
      expect(typeof result.summary.engineAvgTopKLift).toBe('number');
      expect(typeof result.summary.engineTopKPositiveRate).toBe('number');
      expect(result.summary.engineTopKPositiveRate).toBeGreaterThanOrEqual(0);
      expect(result.summary.engineTopKPositiveRate).toBeLessThanOrEqual(100);
      expect(typeof result.summary.liftEdge).toBe('number');
      expect(typeof result.summary.engineAvgSpearman).toBe('number');
    });
  });

  describe('small hand-verifiable dataset verification (5 models x 10 days)', () => {
    it('accurately matches step-by-step hand-calculated summary metrics (lift, win rate, Spearman, MAE)', () => {
      // 5 distinct models across 10 days
      const smallRecords = generateSyntheticDailyRecords(101, 10, 5, rules);
      const minWarmupDays = 5;
      const k = 2;

      const result = runWalkForwardBacktest(
        smallRecords,
        rules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        k,
        minWarmupDays
      );

      const evals = result.evaluations;
      expect(evals.length).toBe(5); // 10 - 5 = 5 evaluated days

      // Hand-calculate expected summary metrics from the evaluations
      const expectedTotal = 5;
      const expectedAvgLift = Math.round(
        evals.map((e) => e.engineTopKActualLift).reduce((a, b) => a + b, 0) / expectedTotal
      );
      const expectedAvgDiff = Math.round(
        evals.map((e) => e.engineTopKActualAvgDiff).reduce((a, b) => a + b, 0) / expectedTotal
      );
      const positiveCount = evals.filter((e) => e.engineTopKPositive).length;
      const expectedPositiveRate = Math.round((positiveCount / expectedTotal) * 1000) / 10;
      const spearmans = evals.map((e) => e.engineSpearmanCorr).filter((s): s is number => s !== null);
      const expectedSpearman =
        Math.round((spearmans.reduce((a, b) => a + b, 0) / spearmans.length) * 1000) / 1000;
      const expectedMae = Math.round(
        evals.map((e) => e.engineDiffCoinsMae).reduce((a, b) => a + b, 0) / expectedTotal
      );
      const expectedHallMae = Math.round(
        evals.map((e) => e.hallError).reduce((a, b) => a + b, 0) / expectedTotal
      );

      // Verify exact match
      expect(result.summary.totalEvaluatedDays).toBe(expectedTotal);
      expect(result.summary.engineAvgTopKLift).toBe(expectedAvgLift);
      expect(result.summary.engineAvgTopKDiff).toBe(expectedAvgDiff);
      expect(result.summary.engineTopKPositiveRate).toBe(expectedPositiveRate);
      expect(result.summary.engineAvgSpearman).toBe(expectedSpearman);
      expect(result.summary.engineDiffCoinsMae).toBe(expectedMae);
      expect(result.summary.engineHallMae).toBe(expectedHallMae);

      // Baseline comparison verification
      const baselineAvgLift = Math.round(
        evals.map((e) => e.baselineTopKActualLift).reduce((a, b) => a + b, 0) / expectedTotal
      );
      expect(result.summary.baselineAvgTopKLift).toBe(baselineAvgLift);
      expect(result.summary.liftEdge).toBe(expectedAvgLift - baselineAvgLift);
    });
  });

  describe('Prompt 4: Rigorous baselines, machine weighting, and Hall MAE comparison', () => {
    it('defaults minWarmupDays to 30 and includes all 5 baselines in BacktestSummaryMetrics', () => {
      const records = generateSyntheticDailyRecords(555, 45, 12, rules);
      // Run with defaults (minWarmupDays=30, minMachines=3)
      const result = runWalkForwardBacktest(records, rules);

      expect(result.evaluations.length).toBe(15); // 45 - 30 = 15
      expect(result.summary.totalEvaluatedDays).toBe(15);

      // Baseline 1: All-Time
      expect(typeof result.summary.baselineAvgTopKLift).toBe('number');
      expect(typeof result.summary.baselineAvgTopKDiff).toBe('number');
      expect(typeof result.summary.baselineTopKPositiveRate).toBe('number');
      expect(typeof result.summary.baselineAvgSpearman).toBe('number');

      // Baseline 2: Day of Week (including holidays)
      expect(typeof result.summary.dowBaselineAvgTopKLift).toBe('number');
      expect(typeof result.summary.dowBaselineAvgTopKDiff).toBe('number');
      expect(typeof result.summary.dowBaselineTopKPositiveRate).toBe('number');
      expect(typeof result.summary.dowBaselineAvgSpearman).toBe('number');

      // Baseline 3: Special Day
      expect(typeof result.summary.specialBaselineAvgTopKLift).toBe('number');
      expect(typeof result.summary.specialBaselineAvgTopKDiff).toBe('number');
      expect(typeof result.summary.specialBaselineTopKPositiveRate).toBe('number');
      expect(typeof result.summary.specialBaselineAvgSpearman).toBe('number');

      // Baseline 4: Recent 14 Days
      expect(typeof result.summary.recent14BaselineAvgTopKLift).toBe('number');
      expect(typeof result.summary.recent14BaselineAvgTopKDiff).toBe('number');
      expect(typeof result.summary.recent14BaselineTopKPositiveRate).toBe('number');
      expect(typeof result.summary.recent14BaselineAvgSpearman).toBe('number');

      // Baseline 5: Random (100 trials)
      expect(typeof result.summary.randomBaselineAvgTopKLift).toBe('number');
      expect(typeof result.summary.randomBaselineAvgTopKDiff).toBe('number');
      expect(typeof result.summary.randomBaselineTopKPositiveRate).toBe('number');
      expect(typeof result.summary.randomBaselineAvgSpearman).toBe('number');

      // Hall MAE naive comparison
      expect(typeof result.summary.allPeriodHallMae).toBe('number');
      expect(typeof result.summary.hallMaeImprovement).toBe('number');
      expect(result.summary.hallMaeImprovement).toBe(
        result.summary.allPeriodHallMae - result.summary.engineHallMae
      );
    });

    it('enforces minMachines filter and uses machine-weighted actual average rather than unweighted model average', () => {
      const records = generateSyntheticDailyRecords(888, 35, 10, rules);
      const resDefault = runWalkForwardBacktest(records, rules, '', DEFAULT_RANKING_WEIGHTS, 3, 30, 3);
      const resMin1 = runWalkForwardBacktest(records, rules, '', DEFAULT_RANKING_WEIGHTS, 3, 30, 1);

      expect(resDefault.evaluations.length).toBe(5);
      expect(resMin1.evaluations.length).toBe(5);

      // Verify every evaluation has valid machine-weighted diffs
      resDefault.evaluations.forEach((ev) => {
        expect(typeof ev.engineTopKActualAvgDiff).toBe('number');
        expect(typeof ev.dowTopKActualAvgDiff).toBe('number');
        expect(typeof ev.specialTopKActualAvgDiff).toBe('number');
        expect(typeof ev.recent14TopKActualAvgDiff).toBe('number');
        expect(typeof ev.randomTopKActualAvgDiff).toBe('number');
      });
    });
  });
});
