import { describe, it, expect } from 'vitest';
import {
  estimateShrinkageParams,
  estimateRateShrinkageParams,
  calculateTargetMachineRanking,
  DEFAULT_MACHINE_RANKING_WEIGHTS,
} from '../targetMachineRanking';
import { DailyRecord, DailyMachineRecord, SpecialDayRules } from '../../data/types';

/**
 * Deterministic PRNG with standard normal distribution (Box-Muller)
 */
function createSeededNormal(seed = 12345) {
  let s = seed >>> 0;
  function randomUniform() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return function nextGaussian() {
    let u1 = randomUniform();
    const u2 = randomUniform();
    while (u1 <= 1e-15) u1 = randomUniform();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
}

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

describe('machineShrinkage (30-1: 経験ベイズ縮小エンジン)', () => {
  it('1. 既知のデータ（40台×60日、台ごとの真の差 τ=300、日ごとのばらつき 1,700枚、シード固定）で、sigma2 と tau2 の推定が、真の値の1.5倍以内であること', () => {
    const numMachines = 40;
    const numDays = 60;
    const trueTau = 300;
    const trueSigma = 1700;
    const trueTau2 = trueTau ** 2; // 90,000
    const trueSigma2 = trueSigma ** 2; // 2,890,000

    const rng = createSeededNormal(42);

    // Generate true machine means theta_i ~ N(0, tau^2)
    const machineMeans: number[] = [];
    for (let m = 0; m < numMachines; m++) {
      machineMeans.push(trueTau * rng());
    }

    // Generate 60 days of daily differences for each machine
    const perMachineDiffs: number[][] = [];
    for (let m = 0; m < numMachines; m++) {
      const dailyDiffs: number[] = [];
      const theta = machineMeans[m];
      for (let d = 0; d < numDays; d++) {
        dailyDiffs.push(theta + trueSigma * rng());
      }
      perMachineDiffs.push(dailyDiffs);
    }

    const { sigma2, tau2, grandMean } = estimateShrinkageParams(perMachineDiffs);

    // Check sigma2 within 1.5x of true value (2,890,000)
    expect(sigma2).toBeGreaterThanOrEqual(trueSigma2 / 1.5);
    expect(sigma2).toBeLessThanOrEqual(trueSigma2 * 1.5);

    // Check tau2 within 1.5x of true value (90,000)
    expect(tau2).toBeGreaterThanOrEqual(trueTau2 / 1.5);
    expect(tau2).toBeLessThanOrEqual(trueTau2 * 1.5);

    // Standard deviation metrics (sigma, tau) within 1.5x of true values
    const estimatedSigma = Math.sqrt(sigma2);
    const estimatedTau = Math.sqrt(tau2);
    expect(estimatedSigma).toBeGreaterThanOrEqual(trueSigma / 1.5);
    expect(estimatedSigma).toBeLessThanOrEqual(trueSigma * 1.5);
    expect(estimatedTau).toBeGreaterThanOrEqual(trueTau / 1.5);
    expect(estimatedTau).toBeLessThanOrEqual(trueTau * 1.5);

    // Grand mean should be centered near 0
    expect(Math.abs(grandMean)).toBeLessThan(200);
  });

  it('2. 台ごとの根拠日数が同じとき、"empirical" と "fixed" で、順位が同じになること', () => {
    // 10 machines all present across 15 days of data
    const numMachines = 10;
    const numDays = 15;
    const records: DailyRecord[] = [];

    // Distinct mean diff per machine
    const machineBaseDiffs = [800, 500, 300, 150, 50, -50, -150, -300, -500, -800];

    for (let d = 1; d <= numDays; d++) {
      const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
      const machines: DailyMachineRecord[] = [];
      for (let m = 0; m < numMachines; m++) {
        const machineNum = 101 + m;
        const diff = machineBaseDiffs[m] + ((d % 3) - 1) * 100;
        machines.push({
          machineNum,
          modelName: 'マイジャグラーV',
          games: 5000,
          diff,
          bb: 20,
          rb: 18,
        });
      }
      records.push(createMockDailyRecord(dateStr, machines, false));
    }

    const targetDate = '2026-05-16';

    const resultFixed = calculateTargetMachineRanking(targetDate, records, undefined, {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      shrinkageMode: 'fixed',
    });

    const resultEmpirical = calculateTargetMachineRanking(targetDate, records, undefined, {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      shrinkageMode: 'empirical',
    });

    expect(resultFixed.rankings.length).toBe(numMachines);
    expect(resultEmpirical.rankings.length).toBe(numMachines);

    const fixedRanks = resultFixed.rankings.map((r) => r.machineNum);
    const empiricalRanks = resultEmpirical.rankings.map((r) => r.machineNum);

    // With identical evidence days across machines, the rank order must be identical
    expect(empiricalRanks).toEqual(fixedRanks);

    // Diagnostics should be included
    expect(resultEmpirical.rankings[0].shrinkageDiagnostics).toBeDefined();
    expect(resultEmpirical.rankings[0].shrinkageDiagnostics?.B).toBeGreaterThan(0);
    expect(resultEmpirical.rankings[0].shrinkageDiagnostics?.tau2).toBeGreaterThan(0);
    expect(resultEmpirical.rankings[0].shrinkageDiagnostics?.sigma2).toBeGreaterThan(0);
  });

  it('3. tau2 が0（台ごとの差なし）のデータで、B が0になり、縮小後の期待差枚が基準に一致すること', () => {
    // 10 machines with completely identical diffs (zero between-machine difference)
    const numMachines = 10;
    const numDays = 20;
    const records: DailyRecord[] = [];

    for (let d = 1; d <= numDays; d++) {
      const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
      const machines: DailyMachineRecord[] = [];
      // Every machine has the exact same diff on day d
      const dayDiff = (d % 2 === 0 ? 150 : -50);
      for (let m = 0; m < numMachines; m++) {
        const machineNum = 101 + m;
        machines.push({
          machineNum,
          modelName: 'マイジャグラーV',
          games: 5000,
          diff: dayDiff,
          bb: 15,
          rb: 15,
        });
      }
      records.push(createMockDailyRecord(dateStr, machines, false));
    }

    const targetDate = '2026-05-21';

    const result = calculateTargetMachineRanking(targetDate, records, undefined, {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      shrinkageMode: 'empirical',
    });

    expect(result.rankings.length).toBe(numMachines);

    for (const mach of result.rankings) {
      // tau2 must be 0 (no difference between machines)
      expect(mach.shrinkageDiagnostics?.tau2).toBe(0);
      // B must be 0
      expect(mach.shrinkageDiagnostics?.B).toBe(0);
      expect(mach.stats.shrinkageB).toBe(0);
      // Shrunk diff must exactly match the model cohort baseline diff
      expect(mach.stats.shrunkDiff).toBe(mach.stats.modelCohortAvgDiff);
    }
  });

  describe('30-2: 事後平均・80%範囲・信頼性のテスト', () => {
    it('4. "empirical" で、interval80 が posteriorMean を含み、根拠日数が多いほど狭くなること', () => {
      // Create dataset with 6 machines, but differing number of active cohort days
      // Machine 101 has 30 days of data; Machine 102 has 5 days of data
      const records: DailyRecord[] = [];
      const numDays = 30;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [];

        // Machine 101 participates all 30 days
        machines.push({
          machineNum: 101,
          modelName: 'マイジャグラーV',
          games: 5000,
          diff: 400 + ((d % 5) - 2) * 50,
        });

        // Machine 102 participates only on the last 5 days
        if (d > 25) {
          machines.push({
            machineNum: 102,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: 400 + ((d % 5) - 2) * 50,
          });
        }

        // Fill background machines (103-108) for variance estimation
        for (let m = 103; m <= 108; m++) {
          machines.push({
            machineNum: m,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: ((m % 3) - 1) * 300 + ((d % 7) - 3) * 100,
          });
        }

        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-05-31';
      const result = calculateTargetMachineRanking(targetDate, records, undefined, {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        shrinkageMode: 'empirical',
      });

      const mach101 = result.rankings.find((r) => r.machineNum === 101)!;
      const mach102 = result.rankings.find((r) => r.machineNum === 102)!;

      expect(mach101).toBeDefined();
      expect(mach102).toBeDefined();

      // Check posterior values are populated
      expect(mach101.posteriorMean).toBe(mach101.stats.shrunkDiff);
      expect(mach101.posteriorSd).toBeGreaterThan(0);
      expect(mach101.interval80).toBeDefined();
      expect(mach101.interval80).not.toBeNull();

      // interval80 contains posteriorMean
      expect(mach101.interval80![0]).toBeLessThanOrEqual(mach101.posteriorMean);
      expect(mach101.posteriorMean).toBeLessThanOrEqual(mach101.interval80![1]);

      expect(mach102.interval80![0]).toBeLessThanOrEqual(mach102.posteriorMean);
      expect(mach102.posteriorMean).toBeLessThanOrEqual(mach102.interval80![1]);

      // Machine 101 has 30 days, Machine 102 has 5 days
      expect(mach101.cohortEvidenceDays).toBe(30);
      expect(mach102.cohortEvidenceDays).toBe(5);

      // Width of 80% interval is strictly narrower for 30 days than 5 days
      const width101 = mach101.interval80![1] - mach101.interval80![0];
      const width102 = mach102.interval80![1] - mach102.interval80![0];
      expect(width101).toBeLessThan(width102);
      expect(mach101.posteriorSd!).toBeLessThan(mach102.posteriorSd!);
    });

    it('5. reliability が、根拠日数が多いほど大きくなること', () => {
      const records: DailyRecord[] = [];
      const numDays = 25;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [];

        // Machine 101: 25 days
        machines.push({ machineNum: 101, modelName: 'マイジャグラーV', games: 5000, diff: 300 });
        // Machine 102: 5 days
        if (d > 20) {
          machines.push({ machineNum: 102, modelName: 'マイジャグラーV', games: 5000, diff: 300 });
        }
        // Auxiliary machines for model variance estimation
        for (let m = 103; m <= 108; m++) {
          machines.push({
            machineNum: m,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: ((m % 3) - 1) * 300 + ((d % 5) - 2) * 80,
          });
        }
        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-05-26';
      const result = calculateTargetMachineRanking(targetDate, records, undefined, {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        shrinkageMode: 'empirical',
      });

      const mach101 = result.rankings.find((r) => r.machineNum === 101)!;
      const mach102 = result.rankings.find((r) => r.machineNum === 102)!;

      expect(mach101.reliability).toBeGreaterThan(0);
      expect(mach101.reliability).toBeLessThanOrEqual(1);

      expect(mach102.reliability).toBeGreaterThan(0);
      expect(mach102.reliability).toBeLessThanOrEqual(1);

      // Reliability increases with more evidence days (25 days vs 5 days)
      expect(mach101.reliability!).toBeGreaterThan(mach102.reliability!);
    });

    it('6. "fixed" で、追加項目が null で、順位・既存の項目が変わらないこと', () => {
      const records: DailyRecord[] = [];
      const numDays = 15;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [];
        for (let m = 101; m <= 106; m++) {
          machines.push({
            machineNum: m,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: (m - 103) * 200,
          });
        }
        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-05-16';
      const resultFixed = calculateTargetMachineRanking(targetDate, records, undefined, {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        shrinkageMode: 'fixed',
      });

      expect(resultFixed.rankings.length).toBe(6);

      for (const mach of resultFixed.rankings) {
        // In fixed mode, posteriorMean matches shrunkDiff
        expect(mach.posteriorMean).toBe(mach.stats.shrunkDiff);
        // Additional items must be null
        expect(mach.posteriorSd).toBeNull();
        expect(mach.interval80).toBeNull();
        expect(mach.reliability).toBeNull();
        // Existing stats and scores intact
        expect(mach.totalScore).toBeDefined();
        expect(mach.confidence).toBeDefined();
        expect(mach.stats.shrunkDiff).toBeDefined();
      }
    });

    it('7. confidenceMode: "reliability" で正しく閾値（0.5以上=高、0.25〜0.5=中、0.25未満=低）が判定されること', () => {
      const records: DailyRecord[] = [];
      const numDays = 40;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [];
        // Machine 101: 40 days -> high reliability (>= 0.5)
        machines.push({ machineNum: 101, modelName: 'マイジャグラーV', games: 5000, diff: 500 });
        // Machine 102: 12 days -> medium reliability (0.25 - 0.5)
        if (d > 28) {
          machines.push({ machineNum: 102, modelName: 'マイジャグラーV', games: 5000, diff: 400 });
        }
        // Machine 103: 2 days -> low reliability (< 0.25)
        if (d > 38) {
          machines.push({ machineNum: 103, modelName: 'マイジャグラーV', games: 5000, diff: 300 });
        }
        // Auxiliary machines (104-108) with high variance
        for (let m = 104; m <= 108; m++) {
          machines.push({
            machineNum: m,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: ((m % 3) - 1) * 350 + ((d % 7) - 3) * 200,
          });
        }
        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-06-11';
      const result = calculateTargetMachineRanking(
        targetDate,
        records,
        undefined,
        {
          ...DEFAULT_MACHINE_RANKING_WEIGHTS,
          shrinkageMode: 'empirical',
          confidenceMode: 'reliability',
        }
      );

      const m101 = result.rankings.find((r) => r.machineNum === 101)!;
      const m102 = result.rankings.find((r) => r.machineNum === 102)!;
      const m103 = result.rankings.find((r) => r.machineNum === 103)!;

      expect(m101).toBeDefined();
      expect(m102).toBeDefined();
      expect(m103).toBeDefined();

      // Verify that reliability corresponds to the specified thresholds
      if (m101.reliability! >= 0.5) {
        expect(m101.confidence).toBe('高');
      }
      if (m102.reliability! >= 0.25 && m102.reliability! < 0.5) {
        expect(m102.confidence).toBe('中');
      }
      if (m103.reliability! < 0.25) {
        expect(m103.confidence).toBe('低');
      }
    });
  });

  describe('machineRateShrinkage (30-3: 出率ベース・基準G換算の期待差枚)', () => {
    it('1. estimateRateShrinkageParams 純関数テスト: s2, tau2_r, grandMean が正しく推定されること', () => {
      // 10 machines, each with 30 days of data
      // True rate per machine ~ N(0.05, 0.02^2)
      // Within-machine variance s2 ~ 0.5 coins^2/G
      const perMachineData: Array<{ diffs: number[]; games: number[] }> = [];
      const rng = createSeededNormal(999);
      const trueRates = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10];

      for (let m = 0; m < 10; m++) {
        const diffs: number[] = [];
        const games: number[] = [];
        const r = trueRates[m];
        for (let d = 0; d < 30; d++) {
          const g = 3000 + Math.round(rng() * 2000); // 3000 - 5000 games
          // diff = r * g + noise with Var ~ g * 0.5 -> SD ~ sqrt(g * 0.5)
          const noise = rng() * Math.sqrt(g * 0.5);
          diffs.push(Math.round(r * g + noise));
          games.push(g);
        }
        perMachineData.push({ diffs, games });
      }

      const params = estimateRateShrinkageParams(perMachineData);
      expect(params.s2).toBeGreaterThan(0.2);
      expect(params.s2).toBeLessThan(1.0);
      expect(params.tau2_r).toBeGreaterThan(0.0001);
      expect(params.grandMean).toBeCloseTo(0.055, 1);
    });

    it('2. 稼働の違う2つの店（平均G数 2,700 と 6,000）で、同じ出率の台の expectedDiffAtBaseGames がほぼ同じになり、実際の差枚は2倍以上違うこと', () => {
      const recordsStoreA: DailyRecord[] = [];
      const recordsStoreB: DailyRecord[] = [];
      const numDays = 20;

      // Store A: Low play amount (~2,700 games/day)
      // Machine 101: 2,700 games, +270 diff (r = 0.10 coin/game)
      // Machine 102: 2,700 games, 0 diff (r = 0.00 coin/game)
      // Machine 103: 2,700 games, -270 diff (r = -0.10 coin/game)
      // Auxiliary machines 104-106
      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machinesA: DailyMachineRecord[] = [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 2700, diff: 270 },
          { machineNum: 102, modelName: 'マイジャグラーV', games: 2700, diff: 0 },
          { machineNum: 103, modelName: 'マイジャグラーV', games: 2700, diff: -270 },
          { machineNum: 104, modelName: 'マイジャグラーV', games: 2700, diff: 100 },
          { machineNum: 105, modelName: 'マイジャグラーV', games: 2700, diff: -50 },
          { machineNum: 106, modelName: 'マイジャグラーV', games: 2700, diff: 50 },
        ];
        recordsStoreA.push(createMockDailyRecord(dateStr, machinesA, false));

        // Store B: High play amount (~6,000 games/day)
        // Machine 201: 6,000 games, +600 diff (same r = 0.10 coin/game)
        // Machine 202: 6,000 games, 0 diff (same r = 0.00 coin/game)
        // Machine 203: 6,000 games, -600 diff (same r = -0.10 coin/game)
        // Auxiliary machines 204-206
        const machinesB: DailyMachineRecord[] = [
          { machineNum: 201, modelName: 'マイジャグラーV', games: 6000, diff: 600 },
          { machineNum: 202, modelName: 'マイジャグラーV', games: 6000, diff: 0 },
          { machineNum: 203, modelName: 'マイジャグラーV', games: 6000, diff: -600 },
          { machineNum: 204, modelName: 'マイジャグラーV', games: 6000, diff: 220 },
          { machineNum: 205, modelName: 'マイジャグラーV', games: 6000, diff: -110 },
          { machineNum: 206, modelName: 'マイジャグラーV', games: 6000, diff: 110 },
        ];
        recordsStoreB.push(createMockDailyRecord(dateStr, machinesB, false));
      }

      const targetDate = '2026-05-21';
      const resultA = calculateTargetMachineRanking(targetDate, recordsStoreA);
      const resultB = calculateTargetMachineRanking(targetDate, recordsStoreB);

      const machA101 = resultA.rankings.find((r) => r.machineNum === 101)!;
      const machB201 = resultB.rankings.find((r) => r.machineNum === 201)!;

      expect(machA101).toBeDefined();
      expect(machB201).toBeDefined();

      // 1. 実際の稼働での差枚（既存の項目 cohortAvgDiff）は、2倍以上違うこと (600 vs 270 -> 2.22x)
      const actualDiffA = machA101.stats.cohortAvgDiff;
      const actualDiffB = machB201.stats.cohortAvgDiff;
      expect(actualDiffA).toBeCloseTo(270, 0);
      expect(actualDiffB).toBeCloseTo(600, 0);
      expect(actualDiffB / actualDiffA).toBeGreaterThan(2.0);

      // 2. 同じ出率の台の expectedDiffAtBaseGames が、ほぼ同じになること (5000 * 0.10 = 500)
      expect(machA101.expectedDiffAtBaseGames).toBeCloseTo(500, 0);
      expect(machB201.expectedDiffAtBaseGames).toBeCloseTo(500, 0);
      expect(Math.abs(machA101.expectedDiffAtBaseGames - machB201.expectedDiffAtBaseGames)).toBeLessThanOrEqual(1.0);
    });

    it('3. baseGames を変えると、expectedDiffAtBaseGames が比例して変わること', () => {
      const records: DailyRecord[] = [];
      const numDays = 15;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [
          { machineNum: 101, modelName: 'マイジャグラーV', games: 4000, diff: 400 }, // r = 0.10
          { machineNum: 102, modelName: 'マイジャグラーV', games: 4000, diff: 200 }, // r = 0.05
          { machineNum: 103, modelName: 'マイジャグラーV', games: 4000, diff: 0 },
        ];
        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-05-16';

      // Test with baseGames = 5000 (default)
      const result5000 = calculateTargetMachineRanking(targetDate, records, undefined, {
        baseGames: 5000,
      });
      // Test with baseGames = 8000
      const result8000 = calculateTargetMachineRanking(targetDate, records, undefined, {
        baseGames: 8000,
      });
      // Test with baseGames = 10000
      const result10000 = calculateTargetMachineRanking(targetDate, records, undefined, {
        baseGames: 10000,
      });

      const m101_5k = result5000.rankings.find((r) => r.machineNum === 101)!;
      const m101_8k = result8000.rankings.find((r) => r.machineNum === 101)!;
      const m101_10k = result10000.rankings.find((r) => r.machineNum === 101)!;

      expect(m101_5k.expectedDiffAtBaseGames).toBeCloseTo(500, 0);
      expect(m101_8k.expectedDiffAtBaseGames).toBeCloseTo(800, 0);
      expect(m101_10k.expectedDiffAtBaseGames).toBeCloseTo(1000, 0);

      // Verify exact proportions
      expect(m101_8k.expectedDiffAtBaseGames / m101_5k.expectedDiffAtBaseGames).toBeCloseTo(1.6, 2);
      expect(m101_10k.expectedDiffAtBaseGames / m101_5k.expectedDiffAtBaseGames).toBeCloseTo(2.0, 2);
    });

    it('4. shrinkageMode: "empirical" のとき、出率 r が経験ベイズ縮小され、診断値が含まれること', () => {
      const records: DailyRecord[] = [];
      const numDays = 30;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [
          // Machine 101: high performer r ~ 0.12
          { machineNum: 101, modelName: 'アイムジャグラーEX', games: 5000, diff: 600 },
          // Machine 102: average performer r ~ 0.02
          { machineNum: 102, modelName: 'アイムジャグラーEX', games: 5000, diff: 100 },
          // Auxiliary machines 103-107
          { machineNum: 103, modelName: 'アイムジャグラーEX', games: 5000, diff: ((d % 5) - 2) * 150 },
          { machineNum: 104, modelName: 'アイムジャグラーEX', games: 5000, diff: ((d % 3) - 1) * 200 },
          { machineNum: 105, modelName: 'アイムジャグラーEX', games: 5000, diff: 50 },
          { machineNum: 106, modelName: 'アイムジャグラーEX', games: 5000, diff: -50 },
          { machineNum: 107, modelName: 'アイムジャグラーEX', games: 5000, diff: 0 },
        ];
        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-06-01';
      const resultEmpirical = calculateTargetMachineRanking(targetDate, records, undefined, {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        shrinkageMode: 'empirical',
        baseGames: 6000,
      });

      const m101 = resultEmpirical.rankings.find((r) => r.machineNum === 101)!;
      expect(m101).toBeDefined();
      expect(m101.expectedDiffAtBaseGames).toBeGreaterThan(0);
      expect(m101.shrinkageDiagnostics?.s2_r).toBeDefined();
      expect(m101.shrinkageDiagnostics?.tau2_r).toBeDefined();
      expect(m101.shrinkageDiagnostics?.B_r).toBeDefined();
      expect(m101.shrinkageDiagnostics?.B_r).toBeGreaterThan(0);
      expect(m101.shrinkageDiagnostics?.B_r).toBeLessThanOrEqual(1);

      // Result-level rate diagnostics
      expect(resultEmpirical.shrinkageDiagnostics?.s2_r).toBeDefined();
      expect(resultEmpirical.shrinkageDiagnostics?.tau2_r).toBeDefined();
    });

    it('5. 既存のゴールデン・既存の項目が fixed モードで不変であること', () => {
      const records: DailyRecord[] = [];
      for (let d = 1; d <= 10; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        records.push(
          createMockDailyRecord(dateStr, [
            { machineNum: 101, modelName: 'マイジャグラーV', games: 5000, diff: 500 },
            { machineNum: 102, modelName: 'マイジャグラーV', games: 5000, diff: -200 },
          ])
        );
      }

      const res = calculateTargetMachineRanking('2026-05-11', records);
      const mach101 = res.rankings.find((r) => r.machineNum === 101)!;

      // In default 'fixed' mode, expectedDiffAtBaseGames matches un-shrunk r * baseGames
      // r = 500 / 5000 = 0.10, baseGames = 5000 -> 500
      expect(mach101.expectedDiffAtBaseGames).toBe(500);
      expect(mach101.stats.expectedDiffAtBaseGames).toBe(500);

      // Ranks and scores are standard
      expect(mach101.rank).toBe(1);
      expect(mach101.stats.shrunkDiff).toBeDefined();
      expect(mach101.stats.cohortAvgDiff).toBe(500);
    });
  });

  describe('machineHighSettingShrinkage (30-5: 高設定挙動の率の縮小)', () => {
    it('1. 観測1日で該当のとき、enabled=false は100%、enabled=true は基準率に近い値になること', () => {
      const records: DailyRecord[] = [];
      const numDays = 30;

      for (let d = 1; d <= numDays; d++) {
        const dateStr = `2026-05-${String(d).padStart(2, '0')}`;
        const machines: DailyMachineRecord[] = [];

        // Auxiliary machines 102..107: 30 days of data, average high-setting behavior ~15%
        for (let m = 102; m <= 107; m++) {
          const isHigh = (d + m) % 6 === 0;
          machines.push({
            machineNum: m,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: isHigh ? 3000 : 100,
          });
        }

        // Machine 101: only appears on day 30 (1 day observation) and exhibits high-setting behavior
        if (d === numDays) {
          machines.push({
            machineNum: 101,
            modelName: 'マイジャグラーV',
            games: 5000,
            diff: 3000,
          });
        }

        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-06-01';

      // 1. enabled = false (既定): 観測1日で該当のとき 100%
      const resDisabled = calculateTargetMachineRanking(targetDate, records, undefined, {
        highSettingShrinkage: { enabled: false, priorStrength: 4 },
      });
      const m101Disabled = resDisabled.rankings.find((r) => r.machineNum === 101)!;
      expect(m101Disabled).toBeDefined();
      expect(m101Disabled.evidenceDays).toBe(1);
      expect(m101Disabled.stats.highSettingCount).toBe(1);
      expect(m101Disabled.stats.highSettingRate).toBe(100.0);

      // Also verify default without passing highSettingShrinkage behaves identically (enabled=false by default)
      const resDefault = calculateTargetMachineRanking(targetDate, records);
      const m101Default = resDefault.rankings.find((r) => r.machineNum === 101)!;
      expect(m101Default.stats.highSettingRate).toBe(100.0);

      // 2. enabled = true: 観測1日で該当のとき、基準率（約16.7%）に近い値に縮小されること
      const resEnabled = calculateTargetMachineRanking(targetDate, records, undefined, {
        highSettingShrinkage: { enabled: true, priorStrength: 4 },
      });
      const m101Enabled = resEnabled.rankings.find((r) => r.machineNum === 101)!;
      expect(m101Enabled).toBeDefined();
      expect(m101Enabled.stats.highSettingCount).toBe(1);
      // With priorStrength=4, a = 4 * ~0.167 = ~0.667 -> rate = (1 + 0.667) / 5 = ~0.333 (33.3%)
      // Much closer to baseline (~16.7%) than 100%!
      expect(m101Enabled.stats.highSettingRate).toBeLessThan(40.0);
      expect(m101Enabled.stats.highSettingRate).toBeGreaterThan(25.0);
      expect(m101Enabled.stats.highSettingRate).toBeCloseTo(33.3, 0);
    });

    it('2. 観測日数が多い（例: 60日）ときは、両者がほぼ一致すること', () => {
      const records: DailyRecord[] = [];
      const numDays = 60;

      for (let d = 1; d <= numDays; d++) {
        const month = d <= 30 ? '05' : '06';
        const day = String(d <= 30 ? d : d - 30).padStart(2, '0');
        const dateStr = `2026-${month}-${day}`;
        const machines: DailyMachineRecord[] = [];

        // Machine 201: 60 days, 9 days of high setting behavior (9 / 60 = 15.0%)
        const m201IsHigh = d % 7 === 1 && d <= 57;
        machines.push({
          machineNum: 201,
          modelName: 'アイムジャグラーEX',
          games: 5000,
          diff: m201IsHigh ? 2800 : 150,
        });

        // Auxiliary machines 202..205 with similar ~15% high setting frequency
        for (let m = 202; m <= 205; m++) {
          const isHigh = (d + m) % 7 === 1;
          machines.push({
            machineNum: m,
            modelName: 'アイムジャグラーEX',
            games: 5000,
            diff: isHigh ? 2800 : 150,
          });
        }

        records.push(createMockDailyRecord(dateStr, machines, false));
      }

      const targetDate = '2026-07-01';

      const resDisabled = calculateTargetMachineRanking(targetDate, records, undefined, {
        highSettingShrinkage: { enabled: false, priorStrength: 4 },
      });
      const resEnabled = calculateTargetMachineRanking(targetDate, records, undefined, {
        highSettingShrinkage: { enabled: true, priorStrength: 4 },
      });

      const m201Disabled = resDisabled.rankings.find((r) => r.machineNum === 201)!;
      const m201Enabled = resEnabled.rankings.find((r) => r.machineNum === 201)!;

      expect(m201Disabled).toBeDefined();
      expect(m201Enabled).toBeDefined();
      expect(m201Disabled.evidenceDays).toBe(60);
      expect(m201Enabled.evidenceDays).toBe(60);
      expect(m201Disabled.stats.highSettingCount).toBe(9);
      expect(m201Enabled.stats.highSettingCount).toBe(9);

      // With 60 days:
      // enabled=false: 9 / 60 = 15.0%
      // enabled=true: (9 + 4 * 0.15) / (60 + 4) = 9.6 / 64 = 15.0%
      // Both match almost exactly (within 0.5%)
      expect(m201Disabled.stats.highSettingRate).toBe(15.0);
      expect(Math.abs(m201Disabled.stats.highSettingRate - m201Enabled.stats.highSettingRate)).toBeLessThanOrEqual(0.5);
    });

    it('3. DEFAULT_MACHINE_RANKING_WEIGHTS で enabled=false, priorStrength=4 が既定値であること', () => {
      expect(DEFAULT_MACHINE_RANKING_WEIGHTS.highSettingShrinkage).toEqual({
        enabled: false,
        priorStrength: 4,
      });
    });
  });
});

