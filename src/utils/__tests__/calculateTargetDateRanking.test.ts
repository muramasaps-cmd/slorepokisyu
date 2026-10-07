import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { calculateTargetDateRanking, DEFAULT_RANKING_WEIGHTS } from '../targetRankingEngine';
import { generateSyntheticDailyRecords } from './testDataGenerator';
import { SpecialDayRules } from '../../data/types';

const GOLDEN_DIR = path.resolve(__dirname, 'golden');
const GOLDEN_FILE_PATH = path.resolve(GOLDEN_DIR, 'targetDateRankingGolden.json');

describe('calculateTargetDateRanking', () => {
  const specialRules: SpecialDayRules = { tails: [7], doubleDigits: true };

  describe('input validation and edge cases', () => {
    it('returns null when targetDate is empty or invalid format', () => {
      const records = generateSyntheticDailyRecords(42, 10, 5, specialRules);
      expect(calculateTargetDateRanking('', records, specialRules)).toBeNull();
      expect(calculateTargetDateRanking('not-a-date', records, specialRules)).toBeNull();
      expect(calculateTargetDateRanking('2024-01', records, specialRules)).toBeNull();
    });

    it('returns null when dailyRecords is empty', () => {
      expect(calculateTargetDateRanking('2024-03-02', [], specialRules)).toBeNull();
    });
  });

  describe('forecast structure and field integrity', () => {
    it('populates all target date forecast attributes correctly', () => {
      const records = generateSyntheticDailyRecords(42, 60, 15, specialRules);
      // 2024-03-02 is Saturday (土), normal day
      const forecast = calculateTargetDateRanking(
        '2024-03-02',
        records,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS
      );

      expect(forecast).not.toBeNull();
      if (!forecast) return;

      expect(forecast.targetDate).toBe('2024-03-02');
      expect(forecast.dayOfWeek).toBe('土');
      expect(forecast.isSpecialDay).toBe(false);
      expect(forecast.dayTail).toBe(2);
      expect(typeof forecast.expectedHallStatus).toBe('string');
      expect(typeof forecast.expectedHallAvgDiffCoins).toBe('number');
      expect(typeof forecast.expectedHallWinRate).toBe('number');

      // Model rankings validation
      expect(forecast.modelRankings.length).toBe(15);
      for (let i = 0; i < forecast.modelRankings.length; i++) {
        const m = forecast.modelRankings[i];
        expect(m.rank).toBe(i + 1);
        expect(['S+', 'S', 'A', 'B', 'C']).toContain(m.rankGrade);
        expect(typeof m.compositeScore).toBe('number');
        expect(typeof m.expectedDiffCoins).toBe('number');
        expect(typeof m.predictedWinRate).toBe('number');
        expect(typeof m.predictedPayoutRate).toBe('number');
        expect(Array.isArray(m.tags)).toBe(true);
        expect(typeof m.tacticalReason).toBe('string');
        // Sorted descending by compositeScore
        if (i > 0) {
          expect(m.compositeScore).toBeLessThanOrEqual(forecast.modelRankings[i - 1].compositeScore);
        }
      }

      // Tail rankings validation (0..9 + ゾロ目 = 11)
      expect(forecast.tailRankings.length).toBe(11);
      expect(forecast.tailRankings[0].rank).toBe(1);

      // Tactical advice validation
      expect(typeof forecast.tacticalAdvice.morningPriority).toBe('string');
      expect(typeof forecast.tacticalAdvice.summary).toBe('string');
    });

    it('identifies special event days and tail matches', () => {
      const records = generateSyntheticDailyRecords(42, 60, 15, specialRules);
      // 2024-03-07 is Thursday (木), tail 7 -> Special Day!
      const forecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS
      );

      expect(forecast).not.toBeNull();
      if (!forecast) return;

      expect(forecast.isSpecialDay).toBe(true);
      expect(forecast.dayTail).toBe(7);
      expect(forecast.specialDayLabel).toContain('7のつく日');

      // Tail 7 in tailRankings should have isDateTailMatch === true
      const tail7 = forecast.tailRankings.find((t) => t.tailNum === 7);
      expect(tail7?.isDateTailMatch).toBe(true);
    });
  });

  describe('golden snapshot regression baseline (合成データ60日×15機種)', () => {
    it('matches the golden forecast snapshot for regression testing', () => {
      // 60 days x 15 models with deterministic seed 42
      const records = generateSyntheticDailyRecords(42, 60, 15, specialRules);

      // Forecast for normal day (2024-03-02) and special day (2024-03-07)
      const normalForecast = calculateTargetDateRanking(
        '2024-03-02',
        records,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS
      );

      const specialForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS
      );

      const rawGoldenPayload = {
        meta: {
          seed: 42,
          days: 60,
          modelsCount: 15,
          normalTargetDate: '2024-03-02',
          specialTargetDate: '2024-03-07',
        },
        normalForecast,
        specialForecast,
      };

      // Normalize -0 to 0 through JSON roundtrip
      const goldenPayload = JSON.parse(JSON.stringify(rawGoldenPayload));

      // 1. Dedicated golden JSON file for explicit diff inspection & regression protection.
      // Generation is ONLY allowed when UPDATE_GOLDEN=true is explicitly set.
      if (process.env.UPDATE_GOLDEN === 'true') {
        if (!fs.existsSync(GOLDEN_DIR)) {
          fs.mkdirSync(GOLDEN_DIR, { recursive: true });
        }
        fs.writeFileSync(GOLDEN_FILE_PATH, JSON.stringify(goldenPayload, null, 2), 'utf-8');
      }

      if (!fs.existsSync(GOLDEN_FILE_PATH)) {
        throw new Error(
          `Golden snapshot file does not exist at ${GOLDEN_FILE_PATH}. Run with UPDATE_GOLDEN=true to create or update it.`
        );
      }

      const savedGolden = JSON.parse(fs.readFileSync(GOLDEN_FILE_PATH, 'utf-8'));
      expect(goldenPayload).toEqual(savedGolden);

      // 2. Vitest snapshot (updatable with `vitest run -u`)
      expect(goldenPayload).toMatchSnapshot();
    });
  });
});
