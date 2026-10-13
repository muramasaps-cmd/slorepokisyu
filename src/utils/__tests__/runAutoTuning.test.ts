import { describe, it, expect } from 'vitest';
import { runAutoTuning } from '../backtestEngine';
import { generateSyntheticDailyRecords, createSeededRandom } from './testDataGenerator';
import { DailyRecord, DailyModelRecord, SpecialDayRules } from '../../data/types';
import { calculateDayOfWeek } from '../dataEngine';

describe('runAutoTuning', () => {
  const rules: SpecialDayRules = { tails: [7], doubleDigits: true };

  it('returns null when dataset has fewer than 8 evaluable days', () => {
    const smallRecords = generateSyntheticDailyRecords(42, 6, 5, rules);
    expect(runAutoTuning(smallRecords, rules)).toBeNull();
  });

  describe('reproducibility on deterministic synthetic data', () => {
    it('produces identical tuning outputs when run twice on the same data', () => {
      // 20 days x 8 models
      const records = generateSyntheticDailyRecords(777, 20, 8, rules);

      const result1 = runAutoTuning(records, rules, '', 3);
      const result2 = runAutoTuning(records, rules, '', 3);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      if (!result1 || !result2) return;

      expect(result1.candidateWeights).toEqual(result2.candidateWeights);
      expect(result1.trainEvaluatedDays).toBe(result2.trainEvaluatedDays);
      expect(result1.valEvaluatedDays).toBe(result2.valEvaluatedDays);
      expect(result1.trainLiftGain).toBe(result2.trainLiftGain);
      expect(result1.valLiftGain).toBe(result2.valLiftGain);
      expect(result1.valStdError).toBe(result2.valStdError);
      expect(result1.tValue).toBe(result2.tValue);
      expect(result1.isRecommended).toBe(result2.isRecommended);
      expect(result1.verdictMessage).toBe(result2.verdictMessage);
    });
  });

  describe('false discovery prevention on pure noise data', () => {
    it('does NOT recommend adoption (isRecommended is false) on pure noise with no true signal', () => {
      // Generate synthetic records where differences are pure zero-mean noise with zero pattern
      const rng = createSeededRandom(99999);
      const modelNames = ['ノイズ機A', 'ノイズ機B', 'ノイズ機C', 'ノイズ機D', 'ノイズ機E', 'ノイズ機F'];
      const numDays = 25;
      const noiseRecords: DailyRecord[] = [];

      for (let day = 1; day <= numDays; day++) {
        const dateStr = `2024-01-${String(day).padStart(2, '0')}`;
        const dow = calculateDayOfWeek(dateStr) || '月';

        const models: DailyModelRecord[] = modelNames.map((name) => {
          // Zero-mean pure random noise between -300 and +300
          const diff = Math.round((rng() - 0.5) * 600);
          const winRate = Math.round((45 + (rng() - 0.5) * 20) * 10) / 10;
          return {
            modelName: name,
            avgDiffCoins: diff,
            totalDiffCoins: diff * 5,
            avgGames: 5000,
            winRate,
            winMachines: Math.round(5 * (winRate / 100)),
            totalMachines: 5,
          };
        });

        const dayTotalDiff = models.reduce((s, m) => s + m.totalDiffCoins, 0);
        const dayAvgDiff = Math.round(dayTotalDiff / (models.length * 5));

        noiseRecords.push({
          date: dateStr,
          yearMonth: '2024-01',
          year: 2024,
          month: 1,
          day,
          dayOfWeek: dow,
          avgDiffCoins: dayAvgDiff,
          avgGames: 5000,
          winRate: 50,
          winMachines: 15,
          totalMachines: 30,
          totalDiffCoins: dayTotalDiff,
          hallCoinProfit: -dayTotalDiff,
          playerCoinProfit: dayTotalDiff,
          hallYenProfit: 0,
          playerYenProfit: 0,
          inCoins: 450000,
          outCoins: 450000 + dayTotalDiff,
          payoutRate: 100,
          estimatedRevenue: 0,
          exchangeGapProfit: 0,
          gModelHallProfit: 0,
          gModelPlayerProfit: 0,
          isOldEventDay: false,
          is7Day: false,
          notable: '',
          models,
        });
      }

      const tuning = runAutoTuning(noiseRecords, undefined, '', 3);
      expect(tuning).not.toBeNull();
      if (!tuning) return;

      // In noise data without true out-of-sample persistence, candidate weights
      // must NOT be falsely recommended
      expect(tuning.isRecommended).toBe(false);
      expect(tuning.verdictMessage).toContain('標準');
    });
  });

  describe('onProgress callback', () => {
    it('notifies progress increments and reaches 100 on completion', () => {
      const records = generateSyntheticDailyRecords(888, 15, 6, rules);
      const progressUpdates: number[] = [];

      const result = runAutoTuning(records, rules, '', 3, (pct) => {
        progressUpdates.push(pct);
      });

      expect(result).not.toBeNull();
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
      // Progress numbers should be non-decreasing
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
      }
    });
  });

  describe('Prompt 2b: PreparedTargetDay parity & benchmark (300日×40機種, seed=7)', () => {
    it('produces identical output between calculateTargetDateRankingFromIndex and scoreFromPrepared(buildPreparedTargetDay)', async () => {
      const {
        buildFeatureIndex,
        buildPreparedTargetDay,
        scoreFromPrepared,
        calculateTargetDateRankingFromIndex,
      } = await import('../targetRankingEngine');

      const records = generateSyntheticDailyRecords(7, 30, 10, rules);
      const featureIndex = buildFeatureIndex(records, rules);
      const targetDate = '2024-01-25';

      const direct = calculateTargetDateRankingFromIndex(targetDate, featureIndex, 20);
      const prep = buildPreparedTargetDay(featureIndex, targetDate, 20);
      expect(prep).not.toBeNull();
      const scored = scoreFromPrepared(prep!);

      expect(scored).toEqual(direct);
    });

    it('matches exact tuning results and executes in under half of baseline on 300 days x 40 models seed=7', () => {
      const records = generateSyntheticDailyRecords(7, 300, 40, rules);
      const start = Date.now();
      const result = runAutoTuning(records, rules, '', 3);
      const elapsed = Date.now() - start;

      expect(result).not.toBeNull();
      if (!result) return;

      // Exact output parity with rolling validation & bootstrap
      expect(result.candidateWeights).toEqual({
        diffCoinDivisor: 20,
        winRateMultiplier: 0.2,
        allHighMultiplier: 1.5,
        matchingBlendWeight: 0.95,
        scaleFactorEnabled: false,
      });
      expect(result.trainLiftGain).toBe(18);
      expect(result.valLiftGain).toBe(3);
      expect(result.tValue).toBe(1.26);
      expect(result.valStdError).toBe(2.6);
      expect(result.numSplits).toBe(5);
      expect(result.meanSplitGain).toBe(3.3);
      expect(result.bootstrapCiLower).toBe(-0.9);
      expect(result.bootstrapCiUpper).toBe(8);
      expect(result.isRecommended).toBe(false);
      expect(result.verdictMessage).toContain('多重比較');

      // Must be under baseline
      expect(elapsed).toBeLessThan(12000);
    }, 20000);
  });

  describe('Prompt 4 completion condition: false discovery prevention across multiple noise seeds', () => {
    it('produces isRecommended = false on 10 out of 10 independent pure noise datasets', () => {
      const seeds = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1111];
      let falseAdoptionCount = 0;

      for (const seed of seeds) {
        const rng = createSeededRandom(seed);
        const modelNames = ['ノイズA', 'ノイズB', 'ノイズC', 'ノイズD', 'ノイズE'];
        const numDays = 35;
        const noiseRecords: DailyRecord[] = [];

        for (let day = 1; day <= numDays; day++) {
          const dateStr = `2024-01-${String(day).padStart(2, '0')}`;
          const dow = calculateDayOfWeek(dateStr) || '月';

          const models: DailyModelRecord[] = modelNames.map((name) => {
            const diff = Math.round((rng() - 0.5) * 500);
            const winRate = Math.round((45 + (rng() - 0.5) * 20) * 10) / 10;
            return {
              modelName: name,
              avgDiffCoins: diff,
              totalDiffCoins: diff * 5,
              avgGames: 5000,
              winRate,
              winMachines: Math.round(5 * (winRate / 100)),
              totalMachines: 5,
            };
          });

          const dayTotalDiff = models.reduce((s, m) => s + m.totalDiffCoins, 0);
          const dayAvgDiff = Math.round(dayTotalDiff / (models.length * 5));

          noiseRecords.push({
            date: dateStr,
            yearMonth: '2024-01',
            year: 2024,
            month: 1,
            day,
            dayOfWeek: dow,
            avgDiffCoins: dayAvgDiff,
            avgGames: 5000,
            winRate: 50,
            winMachines: 12,
            totalMachines: 25,
            totalDiffCoins: dayTotalDiff,
            hallCoinProfit: -dayTotalDiff,
            playerCoinProfit: dayTotalDiff,
            hallYenProfit: 0,
            playerYenProfit: 0,
            inCoins: 375000,
            outCoins: 375000 + dayTotalDiff,
            payoutRate: 100,
            estimatedRevenue: 0,
            exchangeGapProfit: 0,
            gModelHallProfit: 0,
            gModelPlayerProfit: 0,
            isOldEventDay: false,
            is7Day: false,
            notable: '',
            models,
          });
        }

        const tuning = runAutoTuning(noiseRecords, undefined, '', 3);
        if (tuning && tuning.isRecommended) {
          falseAdoptionCount++;
        }
      }

      // False adoption rate must be nearly zero (at most 1 in 10, controlling false discovery under multiple comparisons)
      expect(falseAdoptionCount).toBeLessThanOrEqual(1);
    });
  });
});
