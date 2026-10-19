import { describe, it, expect } from 'vitest';
import { createSyntheticMachineRecords } from './testDataGenerator';
import { calculateTargetMachineRanking, DEFAULT_MACHINE_RANKING_WEIGHTS } from '../targetMachineRanking';
import { runMachineBacktest } from '../backtestEngine';

describe('30-6: 較正テスト（表示の期待差枚と過去検証実績リフト）', () => {
  const seeds = [42, 123, 777];

  // 1. 台ごとの差が0のとき、'empirical' の上位20台の表示の期待差枚と、翌日の実績の平均との差が、現行（'fixed'）より小さいこと
  it('1. 台ごとの差が0のとき、empirical の上位20台の期待差枚と翌日実績の差が fixed より小さいこと (3シード検証)', { timeout: 30000 }, () => {
    seeds.forEach((seed) => {
      // 30台 × 80日、バイアス台なし（台ごとの差が0）
      const records = createSyntheticMachineRecords({
        daysCount: 80,
        machinesCount: 30,
        biasedMachineNums: [],
        biasBonus: 0,
        seed,
      });

      let totalEmpGap = 0;
      let totalFixGap = 0;
      let count = 0;

      // 過去データが十分に蓄積された期間（直近15日間）で翌日実績とのギャップ（過大推定バイアス）を検証
      for (let i = 65; i < records.length; i++) {
        const prior = records.slice(0, i);
        const nextDay = records[i];
        const targetDate = nextDay.date;

        // A. empirical
        const emp = calculateTargetMachineRanking(targetDate, prior, undefined, {
          ...DEFAULT_MACHINE_RANKING_WEIGHTS,
          shrinkageMode: 'empirical',
          confidenceMode: 'reliability',
        });
        const topEmp = emp.rankings.slice(0, 20);
        const expEmp =
          topEmp.reduce((s, r) => s + (r.stats.expectedDiffStd ?? r.stats.shrunkDiff), 0) /
          topEmp.length;
        const actEmp =
          topEmp.reduce((s, r) => {
            const m = nextDay.machines.find((x) => x.machineNum === r.machineNum);
            return s + (m ? m.diff : 0);
          }, 0) / topEmp.length;

        // B. fixed (現行)
        const fix = calculateTargetMachineRanking(targetDate, prior, undefined, {
          ...DEFAULT_MACHINE_RANKING_WEIGHTS,
          shrinkageMode: 'fixed',
          confidenceMode: 'legacy',
        });
        const topFix = fix.rankings.slice(0, 20);
        const expFix =
          topFix.reduce((s, r) => s + (r.stats.expectedDiffStd ?? r.stats.shrunkDiff), 0) /
          topFix.length;
        const actFix =
          topFix.reduce((s, r) => {
            const m = nextDay.machines.find((x) => x.machineNum === r.machineNum);
            return s + (m ? m.diff : 0);
          }, 0) / topFix.length;

        totalEmpGap += Math.abs(expEmp - actEmp);
        totalFixGap += Math.abs(expFix - actFix);
        count++;
      }

      const avgEmpGap = totalEmpGap / count;
      const avgFixGap = totalFixGap / count;

      // empirical の縮小推定により、過大表示が抑制され、翌日実績との差が fixed より小さいこと
      expect(avgEmpGap).toBeLessThan(avgFixGap);
    });
  });

  // 2. 台ごとの差が300枚のとき、上位20台の実績リフトが、現行の8割以上であること
  it('2. 台ごとの差が300枚のとき、上位20台の実績リフトが現行の8割以上であること (3シード検証)', { timeout: 30000 }, () => {
    seeds.forEach((seed) => {
      // 30台 × 80日、15台が+300枚バイアス（台ごとの差が300枚）
      const biasedNums = Array.from({ length: 15 }, (_, i) => 101 + i);
      const records = createSyntheticMachineRecords({
        daysCount: 80,
        machinesCount: 30,
        biasedMachineNums: biasedNums,
        biasBonus: 300,
        seed,
      });

      // A. empirical
      const resEmp = runMachineBacktest(records, undefined, {
        topN: 20,
        minEvidenceDays: 3,
        bootstrapIterations: 200,
        seed,
        weights: {
          ...DEFAULT_MACHINE_RANKING_WEIGHTS,
          shrinkageMode: 'empirical',
          confidenceMode: 'reliability',
        },
      });

      // B. fixed (現行)
      const resFixed = runMachineBacktest(records, undefined, {
        topN: 20,
        minEvidenceDays: 3,
        bootstrapIterations: 200,
        seed,
        weights: {
          ...DEFAULT_MACHINE_RANKING_WEIGHTS,
          shrinkageMode: 'fixed',
          confidenceMode: 'legacy',
        },
      });

      const liftEmp = resEmp.withFilter.avgLift;
      const liftFixed = resFixed.withFilter.avgLift;

      // 差がある場合は実績リフトが正であり、empirical のリフトが現行 fixed の8割以上を維持していること
      expect(liftEmp).toBeGreaterThan(0);
      expect(liftEmp).toBeGreaterThanOrEqual(liftFixed * 0.8);
    });
  });
});
