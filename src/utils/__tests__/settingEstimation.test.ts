import { describe, it, expect } from 'vitest';
import {
  estimateModelSettingDistribution,
  runEMEstimation,
  calculatePayoutRate,
  calculateInWeightedPayoutRate,
  checkSurvivorBiasWarning,
  formatSettingCi95,
  runSensitivityAnalysis,
  createSeededRandom,
  calculateRotationDependencyDiagnosis,
  checkDataVolumeWarnings,
} from '../settingEstimation';
import { ModelSettingSpec, validateModelSettingSpec } from '../settingSpecs';
import { DailyRecord, DailyMachineRecord } from '../../data/types';

// テスト用合成仕様スペック (テストコード内のみで使用)
const MOCK_6_SETTING_SPEC: ModelSettingSpec = {
  modelName: 'テスト機6設定',
  settings: [
    { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 270, rbDenom: 400 },
    { label: '設定2', settingNum: 2, payoutRate: 98.5, bbDenom: 265, rbDenom: 380 },
    { label: '設定3', settingNum: 3, payoutRate: 100.5, bbDenom: 260, rbDenom: 350 },
    { label: '設定4', settingNum: 4, payoutRate: 103.0, bbDenom: 250, rbDenom: 320 },
    { label: '設定5', settingNum: 5, payoutRate: 105.5, bbDenom: 240, rbDenom: 290 },
    { label: '設定6', settingNum: 6, payoutRate: 109.0, bbDenom: 230, rbDenom: 260 },
  ],
};

const MOCK_INCOMPLETE_SETTING_SPEC: ModelSettingSpec = {
  modelName: 'テスト変則機4設定',
  settings: [
    { label: '設定1', settingNum: 1, payoutRate: 97.5 },
    { label: '設定2', settingNum: 2, payoutRate: 99.0 },
    { label: '設定5', settingNum: 5, payoutRate: 104.5 },
    { label: '設定6', settingNum: 6, payoutRate: 108.5 },
  ],
};

function createMockDailyRecord(partial: Partial<DailyRecord> & { date: string }): DailyRecord {
  return {
    date: partial.date,
    yearMonth: partial.yearMonth || partial.date.slice(0, 7),
    year: partial.year || 2024,
    month: partial.month || 5,
    day: partial.day || 1,
    dayOfWeek: partial.dayOfWeek || '月',
    avgDiffCoins: partial.avgDiffCoins || 0,
    avgGames: partial.avgGames || 0,
    winRate: partial.winRate ?? null,
    winMachines: partial.winMachines ?? null,
    totalMachines: partial.totalMachines || 0,
    totalDiffCoins: partial.totalDiffCoins || 0,
    hallCoinProfit: partial.hallCoinProfit || 0,
    playerCoinProfit: partial.playerCoinProfit || 0,
    hallYenProfit: partial.hallYenProfit || 0,
    playerYenProfit: partial.playerYenProfit || 0,
    inCoins: partial.inCoins || 0,
    outCoins: partial.outCoins || 0,
    payoutRate: partial.payoutRate || 100,
    estimatedRevenue: partial.estimatedRevenue || 0,
    exchangeGapProfit: partial.exchangeGapProfit || 0,
    gModelHallProfit: partial.gModelHallProfit || 0,
    gModelPlayerProfit: partial.gModelPlayerProfit || 0,
    isOldEventDay: partial.isOldEventDay ?? false,
    is7Day: partial.is7Day ?? false,
    notable: partial.notable || '',
    machines: partial.machines || [],
    ...partial,
  };
}

// Box-Muller による標準正規乱数
function sampleNormal(rng: () => number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

describe('settingSpecs validation', () => {
  it('validates correct specs and flags non-increasing or out-of-range payouts', () => {
    const valid = validateModelSettingSpec(MOCK_6_SETTING_SPEC);
    expect(valid.isValid).toBe(true);
    expect(valid.errors.length).toBe(0);

    const invalidRange: ModelSettingSpec = {
      modelName: '異常機',
      settings: [
        { label: '設定1', payoutRate: 70.0 }, // < 80%
        { label: '設定2', payoutRate: 140.0 }, // > 130%
      ],
    };
    const rangeRes = validateModelSettingSpec(invalidRange);
    expect(rangeRes.isValid).toBe(true);
    expect(rangeRes.warnings.length).toBeGreaterThanOrEqual(2);

    const nonIncreasing: ModelSettingSpec = {
      modelName: '非昇順機',
      settings: [
        { label: '設定1', payoutRate: 102.0 },
        { label: '設定2', payoutRate: 98.0 },
      ],
    };
    const nonIncRes = validateModelSettingSpec(nonIncreasing);
    expect(nonIncRes.warnings.some((w) => w.includes('昇順になっていません'))).toBe(true);
  });
});

describe('settingEstimation pure functions', () => {
  it('calculates payout rate according to 3-bet rule correctly', () => {
    // 3000G, +300枚 => IN=9000, OUT=9300 => 103.333%
    const rate = calculatePayoutRate(3000, 300);
    expect(rate).toBeCloseTo(103.333, 2);

    // 0G edge case
    expect(calculatePayoutRate(0, 0)).toBe(100.0);
  });

  it('1. estimates mixture proportion π within tolerance from known distribution on synthetic data (seed fixed)', () => {
    const rng = createSeededRandom(12345);
    const truePi = [0.45, 0.25, 0.15, 0.08, 0.04, 0.03]; // 低設定メインの実践的分布
    const sigma = 95.0; // 1G標準偏差換算 (% * sqrt(G))
    const N = 4000; // 4000G
    const totalSamples = 400;

    const machineRecords: DailyMachineRecord[] = [];
    const dailyRecords: DailyRecord[] = [];

    // 累積比率
    const cumPi = [truePi[0]];
    for (let i = 1; i < truePi.length; i++) cumPi.push(cumPi[i - 1] + truePi[i]);

    for (let i = 0; i < totalSamples; i++) {
      const u = rng();
      let settingIdx = 0;
      for (let s = 0; s < cumPi.length; s++) {
        if (u <= cumPi[s]) {
          settingIdx = s;
          break;
        }
      }

      const meanPayout = MOCK_6_SETTING_SPEC.settings[settingIdx].payoutRate;
      const noise = sampleNormal(rng) * (sigma / Math.sqrt(N));
      const observedPayout = meanPayout + noise;
      // diff = (payout/100 * N * 3) - N * 3
      const diff = Math.round((observedPayout / 100.0) * N * 3 - N * 3);

      machineRecords.push({
        machineNum: 100 + (i % 20),
        modelName: MOCK_6_SETTING_SPEC.modelName,
        games: N,
        diff,
        payoutRate: observedPayout,
      });
    }

    // 20日分に分割
    for (let d = 1; d <= 20; d++) {
      const dayRecs = machineRecords.slice((d - 1) * 20, d * 20);
      dailyRecords.push(
        createMockDailyRecord({
          date: `2024-05-${d < 10 ? '0' + d : d}`,
          day: d,
          dayOfWeek: '月',
          avgGames: N,
          totalMachines: 20,
          inCoins: N * 3 * 20,
          outCoins: N * 3 * 20,
          machines: dayRecs,
        })
      );
    }

    const result = estimateModelSettingDistribution(
      MOCK_6_SETTING_SPEC.modelName,
      dailyRecords,
      MOCK_6_SETTING_SPEC,
      {
        minGames: 3000,
        bootstrapReps: 100, // 高速テスト
        bootstrapSeed: 42,
      }
    );

    expect(result.specFound).toBe(true);
    expect(result.evaluatedRecords).toBe(totalSamples);
    expect(result.distribution.length).toBe(6);

    // 低設定(設定1〜2)と高設定(設定5〜6)の合計比率が真値と概ね合致すること
    const estLowRate = result.distribution[0].proportion + result.distribution[1].proportion;
    const trueLowRate = truePi[0] + truePi[1];
    expect(Math.abs(estLowRate - trueLowRate)).toBeLessThan(0.15);

    // 最尤比率は設定1であること
    expect(result.distribution[0].proportion).toBeGreaterThan(0.3);
  });

  it('2. ensures posterior probabilities sum to 1.0, and higher payout yields higher expected setting', () => {
    const singleDayRecords: DailyRecord[] = [
      createMockDailyRecord({
        date: '2024-05-10',
        day: 10,
        dayOfWeek: '金',
        avgGames: 6000,
        totalMachines: 3,
        machines: [
          // 低出率台 (-2000枚 => 88.8%)
          { machineNum: 101, modelName: MOCK_6_SETTING_SPEC.modelName, games: 6000, diff: -2000 },
          // 中出率台 (+300枚 => 101.6%)
          { machineNum: 102, modelName: MOCK_6_SETTING_SPEC.modelName, games: 6000, diff: 300 },
          // 高出率台 (+2500枚 => 113.8%)
          { machineNum: 103, modelName: MOCK_6_SETTING_SPEC.modelName, games: 6000, diff: 2500 },
        ],
      }),
    ];

    const result = estimateModelSettingDistribution(
      MOCK_6_SETTING_SPEC.modelName,
      singleDayRecords,
      MOCK_6_SETTING_SPEC,
      { minGames: 3000, bootstrapReps: 10 }
    );

    expect(result.machineEstimations.length).toBe(3);

    const [lowRec, midRec, highRec] = result.machineEstimations;

    // 各台の事後確率の合計が 1.0 になること
    for (const est of result.machineEstimations) {
      const sumP = Object.values(est.posteriors).reduce((a, b) => a + b, 0);
      expect(sumP).toBeCloseTo(1.0, 3);
    }

    // 出率が高いほど推定平均設定が高くなること (単調性)
    expect(lowRec.expectedSetting).toBeLessThan(midRec.expectedSetting);
    expect(midRec.expectedSetting).toBeLessThan(highRec.expectedSetting);

    // 出率が高いほど高設定(設定4以上)の確率が高くなること
    expect(lowRec.highSettingProb).toBeLessThan(midRec.highSettingProb);
    expect(midRec.highSettingProb).toBeLessThan(highRec.highSettingProb);
  });

  it('3. collapses posteriors toward prior mixture (事前) when games is tiny', () => {
    // 既定の混合比率 π を持つ母集団において、回転数が極端に少ない台の事後確率が事前混合比率 π に近づくことを検証
    const priorPi = [0.40, 0.25, 0.15, 0.10, 0.06, 0.04];
    const tinyGamesRecords = [
      {
        date: '2024-05-01',
        machineNum: 1,
        games: 2, // 極小回転数
        diff: 0,
        payoutRate: 100.0,
        isSpecialDay: false,
        dayOfWeek: '水',
        tailDigit: 1,
        isZoro: false,
      },
    ];

    // 事前比率 priorPi と標準的 sigma=95 の下での1回反復事後確率
    const em = runEMEstimation(tinyGamesRecords, MOCK_6_SETTING_SPEC, {
      initialPi: priorPi,
      initialSigma: 95.0,
      maxIterations: 1, // 初期事前分布でのE-step事後確率を直接検証
    });

    // 回転数が極小（N=2）のため尤度比がほぼ1となり、事後確率は各設定の事前比率 priorPi に近づく
    for (let s = 0; s < 6; s++) {
      expect(em.posteriors[0][s]).toBeCloseTo(priorPi[s], 2);
    }
  });

  it('4. excludes unregistered models and returns informative reason', () => {
    const dailyRecords: DailyRecord[] = [
      createMockDailyRecord({
        date: '2024-05-01',
        day: 1,
        dayOfWeek: '水',
        avgGames: 5000,
        totalMachines: 1,
        machines: [
          { machineNum: 1, modelName: '未登録機種X', games: 5000, diff: 500 },
        ],
      }),
    ];

    const result = estimateModelSettingDistribution('未登録機種X', dailyRecords, null);
    expect(result.specFound).toBe(false);
    expect(result.evaluatedRecords).toBe(0);
    expect(result.warnings.some((w) => w.includes('仕様値が未登録です'))).toBe(true);
  });

  it('5. operates seamlessly on incomplete settings (e.g. 1, 2, 5, 6)', () => {
    const dailyRecords: DailyRecord[] = [
      createMockDailyRecord({
        date: '2024-05-01',
        day: 1,
        dayOfWeek: '水',
        avgGames: 5000,
        totalMachines: 2,
        machines: [
          { machineNum: 101, modelName: MOCK_INCOMPLETE_SETTING_SPEC.modelName, games: 5000, diff: -1000 },
          { machineNum: 102, modelName: MOCK_INCOMPLETE_SETTING_SPEC.modelName, games: 5000, diff: 1500 },
        ],
      }),
    ];

    const result = estimateModelSettingDistribution(
      MOCK_INCOMPLETE_SETTING_SPEC.modelName,
      dailyRecords,
      MOCK_INCOMPLETE_SETTING_SPEC,
      { minGames: 3000, bootstrapReps: 10 }
    );

    expect(result.specFound).toBe(true);
    expect(result.distribution.length).toBe(4);
    expect(result.distribution.map((d) => d.label)).toEqual(['設定1', '設定2', '設定5', '設定6']);
    expect(result.machineEstimations.length).toBe(2);
  });

  it('6. does not judge condition comparisons as significant on pure noise / uniform setting data', () => {
    const rng = createSeededRandom(999);
    const dailyRecords: DailyRecord[] = [];

    // 20日間、全台設定1（期待出率 97.0%）で生成
    for (let d = 1; d <= 20; d++) {
      const isSpecial = d % 5 === 0; // 5の倍数日を特日と仮定
      const machineRecs: DailyMachineRecord[] = [];

      for (let m = 0; m < 10; m++) {
        const noise = sampleNormal(rng) * (90 / Math.sqrt(4000));
        const payout = 97.0 + noise;
        const diff = Math.round((payout / 100.0) * 12000 - 12000);
        machineRecs.push({
          machineNum: 200 + m,
          modelName: MOCK_6_SETTING_SPEC.modelName,
          games: 4000,
          diff,
          payoutRate: payout,
        });
      }

      dailyRecords.push(
        createMockDailyRecord({
          date: `2024-05-${d < 10 ? '0' + d : d}`,
          day: d,
          dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][d % 7],
          avgGames: 4000,
          totalMachines: 10,
          payoutRate: 97.0,
          isOldEventDay: isSpecial,
          machines: machineRecs,
        })
      );
    }

    const result = estimateModelSettingDistribution(
      MOCK_6_SETTING_SPEC.modelName,
      dailyRecords,
      MOCK_6_SETTING_SPEC,
      {
        minGames: 3000,
        bootstrapReps: 50,
        specialDayRules: { tails: [5] }, // 5, 10, 15, 20日
      }
    );

    // 特日 vs 通常日などの条件比較で、全台同設定のノイズデータなら「有意」と判定されないこと
    const specialComparison = result.conditionComparisons.find(
      (c) => c.conditionType === 'special_day'
    );
    if (specialComparison) {
      expect(specialComparison.isSignificant).toBe(false);
      expect(specialComparison.significanceLabel).toBe('誤差の範囲');
    }
  });

  describe('Prompt 27: minimum games, survivor bias & sensitivity analysis', () => {
    it('correctly checks survivor bias warning when excluded ratio >= 20% or payout elevated >= 1.0pt', () => {
      // 1. No exclusion, no payout difference -> no warning
      const res1 = checkSurvivorBiasWarning(100, 0, 100.0, 100.0);
      expect(res1.shouldWarn).toBe(false);
      expect(res1.warningMessage).toBe('');

      // 2. Excluded ratio >= 20% (25/100 = 25%) -> warning
      const res2 = checkSurvivorBiasWarning(100, 25, 100.0, 100.5);
      expect(res2.shouldWarn).toBe(true);
      expect(res2.isExcludedRateHigh).toBe(true);
      expect(res2.isPayoutElevated).toBe(false);
      expect(res2.warningMessage).toContain('負けてやめられた台日が除かれ');

      // 3. Payout elevated by >= 1.0pt (101.2 vs 100.0) -> warning
      const res3 = checkSurvivorBiasWarning(100, 10, 100.0, 101.2);
      expect(res3.shouldWarn).toBe(true);
      expect(res3.isExcludedRateHigh).toBe(false);
      expect(res3.isPayoutElevated).toBe(true);
      expect(res3.warningMessage).toContain('負けてやめられた台日が除かれ');

      // 4. Minor exclusion and minor payout change (<20% and <1.0pt) -> no warning
      const res4 = checkSurvivorBiasWarning(100, 15, 100.0, 100.6);
      expect(res4.shouldWarn).toBe(false);
    });

    it('formats setting CI with boundary notes when stuck at 0% or 100%', () => {
      // 0% boundary
      const ciZero = formatSettingCi95([0.0, 0.0]);
      expect(ciZero.isBoundary).toBe(true);
      expect(ciZero.text).toBe('0%（境界）');
      expect(ciZero.boundaryNote).toBe('確実に0という意味ではありません');

      // 100% boundary
      const ciOne = formatSettingCi95([1.0, 1.0]);
      expect(ciOne.isBoundary).toBe(true);
      expect(ciOne.text).toBe('100%（境界）');
      expect(ciOne.boundaryNote).toBe('確実に100%という意味ではありません');

      // Normal interval
      const ciNormal = formatSettingCi95([0.052, 0.248]);
      expect(ciNormal.isBoundary).toBe(false);
      expect(ciNormal.text).toBe('[5.2% 〜 24.8%]');
    });

    it('runs pointEstimateOnly=true without bootstrap and matches normal point estimates', () => {
      const records: DailyRecord[] = [
        createMockDailyRecord({
          date: '2024-05-01',
          day: 1,
          machines: [
            { machineNum: 1, modelName: MOCK_6_SETTING_SPEC.modelName, games: 4000, diff: -500 },
            { machineNum: 2, modelName: MOCK_6_SETTING_SPEC.modelName, games: 5000, diff: 1200 },
          ],
        }),
      ];

      // Point estimate only
      const pointEst = estimateModelSettingDistribution(
        MOCK_6_SETTING_SPEC.modelName,
        records,
        MOCK_6_SETTING_SPEC,
        {
          minGames: 0,
          pointEstimateOnly: true,
        }
      );

      // Normal estimate
      const normalEst = estimateModelSettingDistribution(
        MOCK_6_SETTING_SPEC.modelName,
        records,
        MOCK_6_SETTING_SPEC,
        {
          minGames: 0,
          pointEstimateOnly: false,
          bootstrapReps: 10,
        }
      );

      // Point estimate skips bootstrap (intervals set to point estimate)
      expect(pointEst.calibration).toBeUndefined();
      expect(pointEst.conditionComparisons.length).toBe(0);

      // π and high setting overall rate match between normal and pointEstimateOnly
      for (let s = 0; s < 6; s++) {
        expect(pointEst.distribution[s].proportion).toBe(normalEst.distribution[s].proportion);
      }
      expect(pointEst.highSettingOverallRate).toBe(normalEst.highSettingOverallRate);
      expect(pointEst.expectedSettingOverall).toBe(normalEst.expectedSettingOverall);
    });

    it('matches hand-calculated metrics on small synthetic sensitivity analysis dataset', () => {
      const SPEC_2_SETTING: ModelSettingSpec = {
        modelName: '小型テスト機',
        settings: [
          { label: '設定1', settingNum: 1, payoutRate: 97.0 },
          { label: '設定6', settingNum: 6, payoutRate: 108.0 },
        ],
      };

      const dailyRecords: DailyRecord[] = [
        createMockDailyRecord({
          date: '2024-05-01',
          day: 1,
          machines: [
            { machineNum: 1, modelName: SPEC_2_SETTING.modelName, games: 500, diff: -100 },
            { machineNum: 2, modelName: SPEC_2_SETTING.modelName, games: 1500, diff: -300 },
          ],
        }),
        createMockDailyRecord({
          date: '2024-05-02',
          day: 2,
          machines: [
            { machineNum: 1, modelName: SPEC_2_SETTING.modelName, games: 3500, diff: 1000 },
            { machineNum: 2, modelName: SPEC_2_SETTING.modelName, games: 6000, diff: 1800 },
          ],
        }),
      ];

      // Hand calculation:
      // th=0: games = 500, 1500, 3500, 6000 => 4 recs, 0 excluded.
      //       IN = 11500 * 3 = 34500, OUT = 34500 + 2400 = 36900 => payout = 106.96%
      // th=1000: games = 1500, 3500, 6000 => 3 recs, 1 excluded (500G).
      // th=2000: games = 3500, 6000 => 2 recs, 2 excluded.
      // th=3000: games = 3500, 6000 => 2 recs, 2 excluded.
      // th=5000: games = 6000 => 1 rec, 3 excluded.

      const res = runSensitivityAnalysis(
        SPEC_2_SETTING.modelName,
        dailyRecords,
        SPEC_2_SETTING,
        { highSettingThreshold: 6 },
        [0, 1000, 2000, 3000, 5000]
      );

      expect(res.rows.length).toBe(5);

      // 0G
      expect(res.rows[0].evaluatedRecords).toBe(4);
      expect(res.rows[0].excludedCount).toBe(0);
      expect(res.rows[0].inWeightedPayoutRate).toBe(106.96);

      // 1000G
      expect(res.rows[1].evaluatedRecords).toBe(3);
      expect(res.rows[1].excludedCount).toBe(1);

      // 2000G
      expect(res.rows[2].evaluatedRecords).toBe(2);
      expect(res.rows[2].excludedCount).toBe(2);

      // 3000G
      expect(res.rows[3].evaluatedRecords).toBe(2);
      expect(res.rows[3].excludedCount).toBe(2);

      // 5000G
      expect(res.rows[4].evaluatedRecords).toBe(1);
      expect(res.rows[4].excludedCount).toBe(3);
    });

    it('demonstrates >= 30 point sensitivity spread on synthetic 2 machines x 90 days dataset with correlated games and payouts', () => {
      // Background:
      // 実データ（プラザ515・ジャグラーガールズSS、2台×90日）で、
      // 最小回転数を0G→3,000Gに変えると、高設定（4以上）の推定比率が52%→99.9%に変わった。
      const JUGGLER_GIRLS_SPEC: ModelSettingSpec = {
        modelName: 'ジャグラーガールズSS',
        settings: [
          { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 381.0 },
          { label: '設定2', settingNum: 2, payoutRate: 97.9, bbDenom: 270.8, rbDenom: 358.1 },
          { label: '設定3', settingNum: 3, payoutRate: 99.9, bbDenom: 268.6, rbDenom: 334.4 },
          { label: '設定4', settingNum: 4, payoutRate: 102.1, bbDenom: 257.0, rbDenom: 300.6 },
          { label: '設定5', settingNum: 5, payoutRate: 104.5, bbDenom: 247.4, rbDenom: 270.8 },
          { label: '設定6', settingNum: 6, payoutRate: 107.5, bbDenom: 240.9, rbDenom: 240.9 },
        ],
      };

      const rng = createSeededRandom(515);
      const dailyRecords: DailyRecord[] = [];

      // 2台 × 90日 = 180台日
      // 48%は低設定(設定1〜2: 負けやめで回転数少 400〜1400G, 出率 ~94〜97%)
      // 52%は高設定(設定4〜6: 終日稼働 6500〜8500G, 出率 ~103〜108%)
      for (let day = 1; day <= 90; day++) {
        const machineRecs: DailyMachineRecord[] = [];
        for (let m = 1; m <= 2; m++) {
          const isHigh = rng() < 0.52;
          let games: number;
          let payout: number;

          if (isHigh) {
            // 高設定日: 粘られて高回転
            games = Math.round(6500 + rng() * 2000);
            payout = 104.0 + (rng() * 4.0 - 1.0); // 103% ~ 107%
          } else {
            // 低設定日: 負けて途中でやめられた
            games = Math.round(400 + rng() * 1000); // 400G ~ 1400G
            payout = 94.0 + (rng() * 3.5); // 94% ~ 97.5%
          }

          const diff = Math.round((payout / 100.0) * games * 3 - games * 3);
          machineRecs.push({
            machineNum: 100 + m,
            modelName: JUGGLER_GIRLS_SPEC.modelName,
            games,
            diff,
            payoutRate: Number(payout.toFixed(2)),
          });
        }

        dailyRecords.push(
          createMockDailyRecord({
            date: `2024-01-${day < 10 ? '0' + day : day}`,
            day,
            machines: machineRecs,
          })
        );
      }

      const res = runSensitivityAnalysis(
        JUGGLER_GIRLS_SPEC.modelName,
        dailyRecords,
        JUGGLER_GIRLS_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000]
      );

      // 0G condition uses all 180 machine-days
      const row0 = res.rows.find((r) => r.minGames === 0)!;
      expect(row0.evaluatedRecords).toBe(180);
      expect(row0.highSettingRate).toBeGreaterThan(45);
      expect(row0.highSettingRate).toBeLessThan(65);

      // 3000G condition excludes all low-games days (<1400G), retaining only high-rotation winning days
      const row3000 = res.rows.find((r) => r.minGames === 3000)!;
      expect(row3000.excludedCount).toBeGreaterThan(60);
      expect(row3000.highSettingRate).toBeGreaterThan(95);

      // Rate spread is > 30 points (e.g. ~52% to >95%)
      expect(res.rateSpread).toBeGreaterThanOrEqual(30.0);
      expect(res.isHighSensitivity).toBe(true);
      expect(res.warningMessage).toContain('出率だけでは分布は決められません');
    });
  });

  describe('Prompt 31: 設定混合比率πのブートストラップ区間の検証', () => {
    it('achieves >= 75% average 95% bootstrap coverage across settings on 30 synthetic datasets (60 days x 20 machines) and reports non-converged count', () => {
      const truePi = [0.45, 0.30, 0.15, 0.10];
      const cumPi = [truePi[0]];
      for (let i = 1; i < truePi.length; i++) cumPi.push(cumPi[i - 1] + truePi[i]);

      const sigma = 95.0; // 1G標準偏差換算 (% * sqrt(G))
      const days = 60;
      const machinesPerDay = 20;
      const numTrials = 30;
      const bootstrapReps = 300;

      const settingCoverages = [0, 0, 0, 0];
      let totalNonConverged = 0;
      let nonConvergedReported = false;

      for (let trial = 0; trial < numTrials; trial++) {
        const rng = createSeededRandom(1000 + trial * 37);
        const dailyRecords: DailyRecord[] = [];

        for (let d = 0; d < days; d++) {
          const dayMachines: DailyMachineRecord[] = [];
          const dateStr = `2024-05-${String(d + 1).padStart(2, '0')}`;

          for (let m = 0; m < machinesPerDay; m++) {
            const u = rng();
            let settingIdx = 0;
            for (let s = 0; s < cumPi.length; s++) {
              if (u <= cumPi[s]) {
                settingIdx = s;
                break;
              }
            }

            const games = 4000 + Math.round(rng() * 2000); // 4000〜6000G
            const meanPayout = MOCK_INCOMPLETE_SETTING_SPEC.settings[settingIdx].payoutRate;
            const noise = sampleNormal(rng) * (sigma / Math.sqrt(games));
            const observedPayout = meanPayout + noise;
            const diff = Math.round((observedPayout / 100 - 1) * games * 3);

            dayMachines.push({
              machineNum: 101 + m,
              modelName: MOCK_INCOMPLETE_SETTING_SPEC.modelName,
              games,
              diff,
              payoutRate: observedPayout,
            });
          }

          dailyRecords.push(
            createMockDailyRecord({
              date: dateStr,
              day: d + 1,
              dayOfWeek: '月',
              avgGames: 5000,
              totalMachines: machinesPerDay,
              inCoins: 5000 * 3 * machinesPerDay,
              outCoins: 5000 * 3 * machinesPerDay,
              machines: dayMachines,
            })
          );
        }

        const res = estimateModelSettingDistribution(
          MOCK_INCOMPLETE_SETTING_SPEC.modelName,
          dailyRecords,
          MOCK_INCOMPLETE_SETTING_SPEC,
          {
            minGames: 3000,
            bootstrapReps,
            bootstrapSeed: 42 + trial,
          }
        );

        if (res.bootstrapNonConvergedCount !== undefined) {
          nonConvergedReported = true;
          totalNonConverged += res.bootstrapNonConvergedCount;
        }

        expect(res.bootstrapNote).toContain('σを固定した区間です');
        expect(res.warnings.some((w) => w.includes('σを固定した区間'))).toBe(true);

        for (let s = 0; s < 4; s++) {
          const [low, high] = res.distribution[s].ci95;
          if (truePi[s] >= low && truePi[s] <= high) {
            settingCoverages[s]++;
          }
        }
      }

      // 収束しなかった再標本の件数が報告されること
      expect(nonConvergedReported).toBe(true);
      expect(typeof totalNonConverged).toBe('number');

      const rates = settingCoverages.map((c) => c / numTrials);
      const avgCoverage = rates.reduce((a, b) => a + b, 0) / 4;

      // 95%区間が真の値を含む割合が、設定ごとの平均で75%以上になること（現行は約29〜64%）
      expect(avgCoverage).toBeGreaterThanOrEqual(0.75);
    }, 25000);
  });
});
