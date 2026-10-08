import { describe, it, expect } from 'vitest';
import {
  calculateTargetMachineRanking,
  extractMachineHistoryByModelChange,
  isHighSettingBehavior,
  isMachineZoro,
  getMachineTailDigit,
  DEFAULT_MACHINE_RANKING_WEIGHTS,
} from '../targetMachineRanking';
import { DailyRecord, DailyMachineRecord, SpecialDayRules } from '../../data/types';

function createMockDailyRecord(
  date: string,
  machines: DailyMachineRecord[],
  isOldEventDay = false
): DailyRecord {
  const parts = date.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  const totalDiff = machines.reduce((acc, x) => acc + x.diff, 0);
  const avgDiff = machines.length > 0 ? Math.round(totalDiff / machines.length) : 0;
  const wins = machines.filter((x) => x.diff > 0).length;
  const winRate = machines.length > 0 ? Math.round((wins / machines.length) * 100) : 50;

  return {
    date,
    yearMonth: `${y}-${String(m).padStart(2, '0')}`,
    year: y,
    month: m,
    day: d,
    dayOfWeek: '土',
    avgDiffCoins: avgDiff,
    avgGames: 5000,
    winRate,
    winMachines: wins,
    totalMachines: machines.length,
    totalDiffCoins: totalDiff,
    hallCoinProfit: -totalDiff,
    playerCoinProfit: totalDiff,
    hallYenProfit: 0,
    playerYenProfit: 0,
    inCoins: 0,
    outCoins: 0,
    payoutRate: 100,
    estimatedRevenue: 0,
    exchangeGapProfit: 0,
    gModelHallProfit: 0,
    gModelPlayerProfit: 0,
    isOldEventDay,
    is7Day: d % 10 === 7,
    notable: isOldEventDay ? '特日' : '',
    machines,
  };
}

describe('targetMachineRanking engine', () => {
  const specialRules: SpecialDayRules = { tails: [7], doubleDigits: true };

  describe('1. 未来データ改ざんテスト (No future data leakage)', () => {
    it('strictly ignores records on or after targetDate and prevents future data leakage', () => {
      const targetDate = '2026-05-15';

      // Historical records before targetDate
      const baseRecords: DailyRecord[] = [
        createMockDailyRecord('2026-05-01', [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 5000, diff: 500, bb: 20, rb: 18 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 4500, diff: -300, bb: 15, rb: 12 },
        ]),
        createMockDailyRecord('2026-05-08', [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 6000, diff: 800, bb: 24, rb: 22 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 5000, diff: -500, bb: 16, rb: 10 },
        ]),
      ];

      const baselineResult = calculateTargetMachineRanking(
        targetDate,
        baseRecords,
        specialRules
      );

      // Add a future record on targetDate itself and after targetDate with extreme numbers (+15,000枚)
      const tamperedRecords: DailyRecord[] = [
        ...baseRecords,
        createMockDailyRecord(targetDate, [
          { machineNum: 102, modelName: 'マイジャグラーV', games: 9000, diff: 15000, bb: 60, rb: 55 },
        ]),
        createMockDailyRecord('2026-05-20', [
          { machineNum: 102, modelName: 'マイジャグラーV', games: 9000, diff: 20000, bb: 80, rb: 70 },
        ]),
      ];

      const tamperedResult = calculateTargetMachineRanking(
        targetDate,
        tamperedRecords,
        specialRules
      );

      // Results must be completely identical
      expect(tamperedResult.rankings.length).toBe(baselineResult.rankings.length);
      expect(tamperedResult.rankings[0].machineNum).toBe(baselineResult.rankings[0].machineNum);
      expect(tamperedResult.rankings[0].totalScore).toBe(baselineResult.rankings[0].totalScore);
      expect(tamperedResult.rankings[0].evidenceDays).toBe(baselineResult.rankings[0].evidenceDays);
      expect(tamperedResult.rankings[1].totalScore).toBe(baselineResult.rankings[1].totalScore);
      expect(tamperedResult.rankings[1].evidenceDays).toBe(baselineResult.rankings[1].evidenceDays);
      expect(tamperedResult).toEqual(baselineResult);
    });
  });

  describe('2. 機種入替テスト (Model replacement cutoff)', () => {
    it('discards records prior to the latest model change on the same machine number', () => {
      const targetDate = '2026-06-01';

      // Machine 777 was "アイムジャグラーEX" for 4 days (all losing days)
      // On 2026-05-20, Machine 777 was replaced by "マイジャグラーV" for 2 days
      const records: DailyRecord[] = [
        createMockDailyRecord('2026-05-01', [
          { machineNum: 777, modelName: 'アイムジャグラーEX', games: 4000, diff: -2000 },
        ]),
        createMockDailyRecord('2026-05-05', [
          { machineNum: 777, modelName: 'アイムジャグラーEX', games: 4000, diff: -2500 },
        ]),
        createMockDailyRecord('2026-05-10', [
          { machineNum: 777, modelName: 'アイムジャグラーEX', games: 4000, diff: -1500 },
        ]),
        createMockDailyRecord('2026-05-15', [
          { machineNum: 777, modelName: 'アイムジャグラーEX', games: 4000, diff: -3000 },
        ]),
        // Replacement to マイジャグラーV
        createMockDailyRecord('2026-05-20', [
          { machineNum: 777, modelName: 'マイジャグラーV', games: 6000, diff: 2500, payoutRate: 113.8 },
        ]),
        createMockDailyRecord('2026-05-25', [
          { machineNum: 777, modelName: 'マイジャグラーV', games: 6500, diff: 3000, payoutRate: 115.3 },
        ]),
      ];

      // Test helper directly
      const historyMap = extractMachineHistoryByModelChange(records);
      const mach777 = historyMap.get(777);
      expect(mach777).toBeDefined();
      expect(mach777?.currentModel).toBe('マイジャグラーV');
      expect(mach777?.history.length).toBe(2);
      expect(mach777?.history[0].rec.date).toBe('2026-05-20');
      expect(mach777?.history[1].rec.date).toBe('2026-05-25');

      // Test ranking engine output
      const result = calculateTargetMachineRanking(targetDate, records, specialRules);
      const ranked777 = result.rankings.find((r) => r.machineNum === 777);

      expect(ranked777).toBeDefined();
      expect(ranked777?.modelName).toBe('マイジャグラーV');
      expect(ranked777?.evidenceDays).toBe(2); // Only the 2 days since replacement!
      expect(ranked777?.history.length).toBe(2);
      // The negative days under アイムジャグラーEX are NOT in history
      expect(ranked777?.history.every((h) => h.diff > 0)).toBe(true);
    });
  });

  describe('3. 寄与の合計がスコアと一致するテスト (Additive model exact match)', () => {
    it('ensures totalScore is the exact sum of contributions for every machine', () => {
      const targetDate = '2026-05-17';
      const records: DailyRecord[] = [
        createMockDailyRecord('2026-05-07', [
          { machineNum: 107, modelName: 'マイジャグラーV', games: 7000, diff: 1800, bb: 30, rb: 28 },
          { machineNum: 111, modelName: 'L パチスロ北斗の拳', games: 6500, diff: 3200, isZoro: true },
          { machineNum: 103, modelName: 'マイジャグラーV', games: 5000, diff: -600, bb: 15, rb: 10 },
        ], true),
        createMockDailyRecord('2026-05-10', [
          { machineNum: 107, modelName: 'マイジャグラーV', games: 6000, diff: 1200, bb: 25, rb: 24 },
          { machineNum: 111, modelName: 'L パチスロ北斗の拳', games: 5500, diff: 1500, isZoro: true },
          { machineNum: 103, modelName: 'マイジャグラーV', games: 4500, diff: 200, bb: 18, rb: 15 },
        ]),
      ];

      const result = calculateTargetMachineRanking(
        targetDate,
        records,
        specialRules,
        DEFAULT_MACHINE_RANKING_WEIGHTS,
        { recentStateWeight: 0.02 }
      );

      expect(result.rankings.length).toBeGreaterThan(0);

      for (const mach of result.rankings) {
        const c = mach.contributions;
        const sum =
          c.cohortDiffScore +
          c.cohortWinRateScore +
          c.highSettingScore +
          c.modelScore +
          c.tailBonusScore +
          c.recentStateScore;

        const roundedSum = Math.round(sum * 100) / 100;
        expect(mach.totalScore).toBeCloseTo(roundedSum, 4);
      }
    });
  });

  describe('4. 縮小推定（Empirical Bayes Shrinkage）テスト', () => {
    it('shrinks machines with few samples closer to the model cohort average', () => {
      const targetDate = '2026-05-17'; // special day with tail 7

      // Model average diff is around 500
      const records: DailyRecord[] = [
        createMockDailyRecord('2026-04-07', [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 6000, diff: 500 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 6000, diff: 500 },
          { machineNum: 103, modelName: 'マイジャグラーV', games: 6000, diff: 3000 }, // machine 103 has +3000 once
        ], true),
        createMockDailyRecord('2026-04-17', [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 6000, diff: 500 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 6000, diff: 3000 }, // machine 102 has +3000 consistently
        ], true),
        createMockDailyRecord('2026-04-27', [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 6000, diff: 500 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 6000, diff: 3000 },
        ], true),
        createMockDailyRecord('2026-05-07', [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 6000, diff: 500 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 6000, diff: 3000 },
        ], true),
      ];

      const result = calculateTargetMachineRanking(targetDate, records, specialRules);
      const mach102 = result.rankings.find((r) => r.machineNum === 102)!;
      const mach103 = result.rankings.find((r) => r.machineNum === 103)!;

      expect(mach102).toBeDefined();
      expect(mach103).toBeDefined();

      // mach103 has 1 cohort day of +3000, shrunk towards model average
      // mach102 has 4 cohort days of +3000, retains much higher shrunkDiff
      expect(mach102.stats.shrunkDiff).toBeGreaterThan(mach103.stats.shrunkDiff);
    });
  });

  describe('5. 直近状態オプション（recentStateWeight）テスト', () => {
    it('sets recentStateScore to 0 when recentStateWeight is 0, and computes weight * priorDayDiff when enabled', () => {
      const targetDate = '2026-05-15';
      const records: DailyRecord[] = [
        createMockDailyRecord('2026-05-14', [
          { machineNum: 501, modelName: 'マイジャグラーV', games: 5000, diff: -1500 },
        ]),
      ];

      // Default (recentStateWeight: 0)
      const resDefault = calculateTargetMachineRanking(targetDate, records, specialRules);
      const machDefault = resDefault.rankings.find((r) => r.machineNum === 501)!;
      expect(machDefault.contributions.recentStateScore).toBe(0);

      // Rebound weight: -0.01 (raising dropped machine)
      const resRebound = calculateTargetMachineRanking(
        targetDate,
        records,
        specialRules,
        undefined,
        { recentStateWeight: -0.01 }
      );
      const machRebound = resRebound.rankings.find((r) => r.machineNum === 501)!;
      expect(machRebound.contributions.recentStateScore).toBe(15); // -1500 * -0.01 = +15

      // Follow-momentum weight: +0.02
      const resMomentum = calculateTargetMachineRanking(
        targetDate,
        records,
        specialRules,
        undefined,
        { recentStateWeight: 0.02 }
      );
      const machMomentum = resMomentum.rankings.find((r) => r.machineNum === 501)!;
      expect(machMomentum.contributions.recentStateScore).toBe(-30); // -1500 * 0.02 = -30
    });
  });

  describe('6. 高設定判定および末尾・ゾロ目判定テスト', () => {
    it('correctly identifies high setting behavior and zoro numbers', () => {
      expect(isHighSettingBehavior({ machineNum: 1, modelName: 'L パチスロ北斗の拳', games: 4000, diff: 2600 }, 'L パチスロ北斗の拳')).toBe(true);
      expect(isHighSettingBehavior({ machineNum: 1, modelName: 'マイジャグラーV', games: 3000, diff: 600, bb: 15, rb: 13 }, 'マイジャグラーV')).toBe(true); // 3000 / 13 = 230 <= 280
      expect(isHighSettingBehavior({ machineNum: 1, modelName: 'マイジャグラーV', games: 1000, diff: 200, bb: 4, rb: 2 }, 'マイジャグラーV')).toBe(false);

      expect(isMachineZoro(777)).toBe(true);
      expect(isMachineZoro(11)).toBe(true);
      expect(isMachineZoro(7)).toBe(false);
      expect(isMachineZoro(107)).toBe(false);
      expect(getMachineTailDigit(777)).toBe(7);
      expect(getMachineTailDigit(103)).toBe(3);
    });
  });

  describe('7. エッジケーステスト', () => {
    it('handles empty records or records with no machines gracefully', () => {
      const res1 = calculateTargetMachineRanking('2026-05-15', []);
      expect(res1.rankings).toEqual([]);

      const emptyMachineRecords: DailyRecord[] = [
        createMockDailyRecord('2026-05-14', []),
      ];
      const res2 = calculateTargetMachineRanking('2026-05-15', emptyMachineRecords);
      expect(res2.rankings).toEqual([]);
    });
  });
});
