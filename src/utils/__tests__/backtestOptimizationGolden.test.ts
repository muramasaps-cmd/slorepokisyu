import { describe, it, expect } from 'vitest';
import { createSyntheticMachineRecords } from './testDataGenerator';
import { calculateTargetMachineRanking } from '../targetMachineRanking';
import { runMachineBacktest } from '../backtestEngine';
import { SpecialDayRules } from '../../data/types';

describe('backtestOptimization Golden Consistency', () => {
  const specialDayRules: SpecialDayRules = {};

  const records = createSyntheticMachineRecords({
    daysCount: 60,
    machinesCount: 40,
    seed: 12345,
  });

  const targetDate = '2025-03-02';

  it('preserves exact calculateTargetMachineRanking outputs before and after optimization', () => {
    const ranking = calculateTargetMachineRanking(targetDate, records, specialDayRules, {
      shrinkageMode: 'fixed',
      tailMatchBonus: 8.0,
      zoroBonus: 4.0,
    });
    expect(ranking.rankings.length).toBeGreaterThan(0);
    // Snapshot-like assertions on Top 5 machines
    const top5 = ranking.rankings.slice(0, 5).map((r) => ({
      rank: r.rank,
      machineNum: r.machineNum,
      modelName: r.modelName,
      compositeScore: (r as any).compositeScore,
      evidenceDays: r.evidenceDays,
    }));

    expect(top5).toMatchInlineSnapshot(`
      [
        {
          "compositeScore": undefined,
          "evidenceDays": 60,
          "machineNum": 109,
          "modelName": "アイムジャグラーEX",
          "rank": 1,
        },
        {
          "compositeScore": undefined,
          "evidenceDays": 60,
          "machineNum": 132,
          "modelName": "押忍！番長4",
          "rank": 2,
        },
        {
          "compositeScore": undefined,
          "evidenceDays": 60,
          "machineNum": 111,
          "modelName": "スマスロ北斗の拳",
          "rank": 3,
        },
        {
          "compositeScore": undefined,
          "evidenceDays": 60,
          "machineNum": 138,
          "modelName": "マイジャグラーV",
          "rank": 4,
        },
        {
          "compositeScore": undefined,
          "evidenceDays": 60,
          "machineNum": 112,
          "modelName": "押忍！番長4",
          "rank": 5,
        },
      ]
    `);
  });

  it('preserves exact runMachineBacktest outputs before and after optimization', { timeout: 30000 }, () => {
    const backtestResult = runMachineBacktest(records, specialDayRules, {
      topN: 10,
      minEvidenceDays: 3,
      blockLength: 7,
      bootstrapIterations: 500,
      seed: 12345,
      weights: {
        diffWeight: 0.04,
        winRateWeight: 0.3,
        highSettingWeight: 20.0,
        modelScoreWeight: 0.25,
        tailMatchBonus: 8.0,
        zoroBonus: 4.0,
        recentStateWeight: 0,
        shrinkageK: 3,
        shrinkageMode: 'fixed',
      },
    });

    expect(backtestResult.evaluatedDaysCount).toBe(57);
    expect(backtestResult.withFilter).toMatchSnapshot();
    expect(backtestResult.withoutFilter).toMatchSnapshot();

    // Verify ablation results exist and match
    expect(backtestResult.ablationResults).toBeDefined();
    expect(backtestResult.ablationResults!.length).toBe(5);
    const ablationSummary = backtestResult.ablationResults!.map((a) => ({
      variantKey: a.variantKey,
      avgLift: a.avgLift,
      ci95: a.ci95,
      deltaCi95: a.deltaCi95,
      verdict: a.verdict,
      recommendZeroWeight: a.recommendZeroWeight,
    }));

    expect(ablationSummary).toMatchInlineSnapshot(`
      [
        {
          "avgLift": -2,
          "ci95": [
            -18.8,
            16.3,
          ],
          "deltaCi95": [
            0,
            0,
          ],
          "recommendZeroWeight": false,
          "variantKey": "all",
          "verdict": undefined,
        },
        {
          "avgLift": 1,
          "ci95": [
            -12.2,
            18.8,
          ],
          "deltaCi95": [
            -15.8,
            8.1,
          ],
          "recommendZeroWeight": false,
          "variantKey": "cohortDiffOnly",
          "verdict": "inconclusive",
        },
        {
          "avgLift": -2,
          "ci95": [
            -18.8,
            16.3,
          ],
          "deltaCi95": [
            0,
            0,
          ],
          "recommendZeroWeight": false,
          "variantKey": "noHighSetting",
          "verdict": "inconclusive",
        },
        {
          "avgLift": -2,
          "ci95": [
            -18.8,
            16.3,
          ],
          "deltaCi95": [
            0,
            0,
          ],
          "recommendZeroWeight": false,
          "variantKey": "noModelScore",
          "verdict": "inconclusive",
        },
        {
          "avgLift": -2,
          "ci95": [
            -14.5,
            12.5,
          ],
          "deltaCi95": [
            -9.5,
            9.7,
          ],
          "recommendZeroWeight": false,
          "variantKey": "noTailZoro",
          "verdict": "inconclusive",
        },
      ]
    `);
  });
});
