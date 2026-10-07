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
});
