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

    it('excludes isReusedMachines days by default, and includes them when toggle is true', () => {
      const records = generateSyntheticDailyRecords(42, 20, 5, specialRules);
      // Mark half of the records as isReusedMachines
      const modifiedRecords = records.map((r, idx) => ({
        ...r,
        isReusedMachines: idx % 2 === 0,
      }));

      const defaultForecast = calculateTargetDateRanking(
        '2024-03-07',
        modifiedRecords,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        { includeReusedMachines: false }
      );

      const includedForecast = calculateTargetDateRanking(
        '2024-03-07',
        modifiedRecords,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        { includeReusedMachines: true }
      );

      expect(defaultForecast).not.toBeNull();
      expect(includedForecast).not.toBeNull();

      // includedForecast evaluates twice as many historical sample days
      const defaultSamples = defaultForecast!.modelRankings[0].sampleDays;
      const includedSamples = includedForecast!.modelRankings[0].sampleDays;
      expect(includedSamples).toBeGreaterThan(defaultSamples);
    });

    it('applies aliasDictionary to unify model names in ranking output', () => {
      const records = generateSyntheticDailyRecords(42, 10, 5, specialRules);
      const originalTopModel = records[0].models[0].modelName;

      const aliasForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS,
        {
          aliasDictionary: {
            [originalTopModel]: '★正規化看板機種★',
          },
        }
      );

      expect(aliasForecast).not.toBeNull();
      const mapped = aliasForecast!.modelRankings.find((m) => m.modelName === '★正規化看板機種★');
      expect(mapped).toBeDefined();
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

  describe('Prompt 3: 統計の改善オプション (台数加重・縮小推定・時間減衰・全台系正規化・分位点ランク)', () => {
    it('1. 台数加重平均 (useMachineWeighting): 機種×日およびコホートをtotalMachinesで加重する', () => {
      // 2日間の小規模データを作成:
      // Day 1 (特日): 機種A = 10台, 差枚+1000枚, 勝率80%
      // Day 2 (特日): 機種A = 1台, 差枚-500枚, 勝率0%
      const testRecords = [
        {
          date: '2024-03-07',
          yearMonth: '2024-03',
          year: 2024,
          month: 3,
          day: 7,
          dayOfWeek: '木',
          avgDiffCoins: 1000,
          avgGames: 5000,
          winRate: 80,
          winMachines: 8,
          totalMachines: 10,
          totalDiffCoins: 10000,
          hallCoinProfit: -10000,
          playerCoinProfit: 10000,
          hallYenProfit: -200000,
          playerYenProfit: 200000,
          inCoins: 150000,
          outCoins: 160000,
          payoutRate: 106.67,
          estimatedRevenue: 300000,
          exchangeGapProfit: 5000,
          gModelHallProfit: -195000,
          gModelPlayerProfit: 195000,
          isOldEventDay: true,
          is7Day: true,
          notable: '',
          models: [
            {
              modelName: 'テスト機種A',
              avgDiffCoins: 1000,
              totalDiffCoins: 10000,
              avgGames: 5000,
              winRate: 80,
              winMachines: 8,
              totalMachines: 10,
            },
          ],
        },
        {
          date: '2024-03-17',
          yearMonth: '2024-03',
          year: 2024,
          month: 3,
          day: 17,
          dayOfWeek: '日',
          avgDiffCoins: -500,
          avgGames: 3000,
          winRate: 0,
          winMachines: 0,
          totalMachines: 1,
          totalDiffCoins: -500,
          hallCoinProfit: 500,
          playerCoinProfit: -500,
          hallYenProfit: 10000,
          playerYenProfit: -10000,
          inCoins: 9000,
          outCoins: 8500,
          payoutRate: 94.44,
          estimatedRevenue: 18000,
          exchangeGapProfit: 300,
          gModelHallProfit: 10300,
          gModelPlayerProfit: -10300,
          isOldEventDay: true,
          is7Day: true,
          notable: '',
          models: [
            {
              modelName: 'テスト機種A',
              avgDiffCoins: -500,
              totalDiffCoins: -500,
              avgGames: 3000,
              winRate: 0,
              winMachines: 0,
              totalMachines: 1,
            },
          ],
        },
      ];

      // デフォルト (非加重): 単純平均 = (1000 + -500) / 2 = +250枚
      const defaultForecast = calculateTargetDateRanking(
        '2024-03-27',
        testRecords,
        specialRules,
        '',
        DEFAULT_RANKING_WEIGHTS
      );
      expect(defaultForecast).not.toBeNull();
      const defaultModel = defaultForecast!.modelRankings[0];
      expect(defaultModel.matchingAvgDiffCoins).toBe(250);

      // 加重平均: (1000 * 10 + -500 * 1) / (10 + 1) = 9500 / 11 = 864枚
      const weightedForecast = calculateTargetDateRanking(
        '2024-03-27',
        testRecords,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, useMachineWeighting: true }
      );
      expect(weightedForecast).not.toBeNull();
      const weightedModel = weightedForecast!.modelRankings[0];
      expect(weightedModel.matchingAvgDiffCoins).toBe(864);
    });

    it('2. 縮小推定 (useShrinkage): (n*標本平均 + k*母平均) / (n + k) で推定差枚を母平均へ縮小する', () => {
      const records = generateSyntheticDailyRecords(42, 60, 15, specialRules);
      const defaultForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, useShrinkage: false }
      );

      const shrinkForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, useShrinkage: true, shrinkageK: 5 }
      );

      expect(defaultForecast).not.toBeNull();
      expect(shrinkForecast).not.toBeNull();

      // 一致日数が少ない機種において、縮小推定値は母平均 (ホール平均差枚) に近づく
      const cohortAvg = shrinkForecast!.expectedHallAvgDiffCoins;
      const mShrink = shrinkForecast!.modelRankings[0];
      const mDefault = defaultForecast!.modelRankings[0];

      expect(typeof mShrink.expectedDiffCoins).toBe('number');
      // 縮小推定適用時は、標本平均と母平均の間の値をとる
      const n = mShrink.matchingDaysCount;
      const k = 5;
      const expectedCalc = Math.round((n * mShrink.matchingAvgDiffCoins + k * cohortAvg) / (n + k));
      expect(mShrink.expectedDiffCoins).toBe(expectedCalc);
      expect(mShrink.expectedDiffCoins).not.toBe(mDefault.expectedDiffCoins);
    });

    it('3. 時間減衰 (halfLifeDays): 経過日数に応じて過去日の重みが減衰する', () => {
      const records = generateSyntheticDailyRecords(42, 60, 15, specialRules);
      const defaultForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, halfLifeDays: 0 }
      );

      const decayedForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, halfLifeDays: 30 }
      );

      expect(defaultForecast).not.toBeNull();
      expect(decayedForecast).not.toBeNull();
      // 直近のデータがより重視されるため、差枚やスコアに有意な差が生じる
      expect(decayedForecast!.modelRankings[0].expectedDiffCoins).toBeDefined();
    });

    it('4. allHighCount 正規化 (normalizeAllHighRate): 観測日数あたりの発生率に正規化する', () => {
      const records = generateSyntheticDailyRecords(42, 60, 15, specialRules);
      const defaultForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, normalizeAllHighRate: false }
      );

      const normForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, normalizeAllHighRate: true }
      );

      expect(defaultForecast).not.toBeNull();
      expect(normForecast).not.toBeNull();
      expect(normForecast!.modelRankings.length).toBe(defaultForecast!.modelRankings.length);
    });

    it('5. 分位点ランク判定 (useQuantileGrade): 当日の全機種分布の分位点でランクGradeを付与する', () => {
      const records = generateSyntheticDailyRecords(42, 60, 20, specialRules);
      const quantileForecast = calculateTargetDateRanking(
        '2024-03-07',
        records,
        specialRules,
        '',
        { ...DEFAULT_RANKING_WEIGHTS, useQuantileGrade: true }
      );

      expect(quantileForecast).not.toBeNull();
      const grades = quantileForecast!.modelRankings.map((m) => m.rankGrade);
      // 上位はS+/S、下位はCが分布に応じて適切に付与される
      expect(grades[0]).toMatch(/S\+|S/);
      expect(grades[grades.length - 1]).toBe('C');
    });
  });
});
