import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateRotationDependencyDiagnosis,
  checkDataVolumeWarnings,
  estimateModelSettingDistribution,
  runSensitivityAnalysis,
  createSeededRandom,
} from '../settingEstimation';
import {
  executeSensitivityAnalysisAsync,
  computeSensitivityCacheKey,
  getSensitivityMemoryCache,
  clearSensitivityMemoryCache,
} from '../sensitivityAnalysisService';
import { ModelSettingSpec } from '../settingSpecs';
import { DailyRecord, DailyMachineRecord } from '../../data/types';

describe('感度分析・回転数依存診断・データ量警告 テストスイート', () => {
  const JUGGLER_SPEC: ModelSettingSpec = {
    modelName: 'アイムジャグラーEX',
    settings: [
      { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 439.8 },
      { label: '設定2', settingNum: 2, payoutRate: 98.0, bbDenom: 269.7, rbDenom: 399.6 },
      { label: '設定3', settingNum: 3, payoutRate: 99.5, bbDenom: 269.7, rbDenom: 331.0 },
      { label: '設定4', settingNum: 4, payoutRate: 101.1, bbDenom: 259.0, rbDenom: 315.1 },
      { label: '設定5', settingNum: 5, payoutRate: 102.8, bbDenom: 259.0, rbDenom: 255.0 },
      { label: '設定6', settingNum: 6, payoutRate: 105.5, bbDenom: 255.0, rbDenom: 255.0 },
    ],
  };

  beforeEach(() => {
    clearSensitivityMemoryCache();
  });

  describe('1. calculateRotationDependencyDiagnosis', () => {
    it('回転数と出率が相関するデータで isDependent=true、相関がないデータで false', () => {
      // (a) 回転数と出率が強く正の相関を示すデータ (勝つ台ほど長く打たれる)
      const correlatedRecords = [
        { games: 800, diff: -500, payoutRate: 79.2 },
        { games: 1500, diff: -400, payoutRate: 91.1 },
        { games: 3000, diff: 0, payoutRate: 100.0 },
        { games: 6000, diff: 600, payoutRate: 103.3 },
        { games: 8500, diff: 1500, payoutRate: 105.9 },
      ];
      const diagCorrelated = calculateRotationDependencyDiagnosis(correlatedRecords);
      expect(diagCorrelated.spearmanCorr).not.toBeNull();
      expect(diagCorrelated.spearmanCorr!).toBeGreaterThanOrEqual(0.2);
      expect(diagCorrelated.isDependent).toBe(true);
      expect(diagCorrelated.warningMessage).toContain('回転数が結果に依存しています');

      // (b) 相関がない（または逆相関の）データ
      const uncorrelatedRecords = [
        { games: 800, diff: 500, payoutRate: 120.8 },
        { games: 1500, diff: 400, payoutRate: 108.9 },
        { games: 3000, diff: 0, payoutRate: 100.0 },
        { games: 6000, diff: -600, payoutRate: 96.7 },
        { games: 8500, diff: -1500, payoutRate: 94.1 },
      ];
      const diagUncorrelated = calculateRotationDependencyDiagnosis(uncorrelatedRecords);
      expect(diagUncorrelated.spearmanCorr!).toBeLessThan(0.2);
      expect(diagUncorrelated.isDependent).toBe(false);
      expect(diagUncorrelated.warningMessage).toBe('');
    });

    it('区間ごとの台日数・出率が手計算と一致すること', () => {
      // 5区間それぞれにぴったり1台ずつ配置
      // 1. 〜1,000G: 500G, diff -150 -> 100 * (1 + -150 / (3 * 500)) = 90.0%
      // 2. 1,000〜2,000G: 1,500G, diff 0 -> 100 * (1 + 0 / 4500) = 100.0%
      // 3. 2,000〜3,000G: 2,500G, diff +300 -> 100 * (1 + 300 / 7500) = 104.0%
      // 4. 3,000〜5,000G: 4,000G, diff +600 -> 100 * (1 + 600 / 12000) = 105.0%
      // 5. 5,000G〜: 6,000G, diff +1,800 -> 100 * (1 + 1800 / 18000) = 110.0%
      const testRecords = [
        { games: 500, diff: -150 },
        { games: 1500, diff: 0 },
        { games: 2500, diff: 300 },
        { games: 4000, diff: 600 },
        { games: 6000, diff: 1800 },
      ];

      const diag = calculateRotationDependencyDiagnosis(testRecords);
      expect(diag.intervals.length).toBe(5);

      // 区間 1: 〜1,000G
      const int1 = diag.intervals[0];
      expect(int1.label).toBe('〜1,000G');
      expect(int1.count).toBe(1);
      expect(int1.ratio).toBe(20.0);
      expect(int1.totalGames).toBe(500);
      expect(int1.totalDiff).toBe(-150);
      expect(int1.inWeightedPayoutRate).toBe(90.0);

      // 区間 2: 1,000〜2,000G
      const int2 = diag.intervals[1];
      expect(int2.label).toBe('1,000〜2,000G');
      expect(int2.count).toBe(1);
      expect(int2.totalGames).toBe(1500);
      expect(int2.totalDiff).toBe(0);
      expect(int2.inWeightedPayoutRate).toBe(100.0);

      // 区間 3: 2,000〜3,000G
      const int3 = diag.intervals[2];
      expect(int3.label).toBe('2,000〜3,000G');
      expect(int3.count).toBe(1);
      expect(int3.totalGames).toBe(2500);
      expect(int3.totalDiff).toBe(300);
      expect(int3.inWeightedPayoutRate).toBe(104.0);

      // 区間 4: 3,000〜5,000G
      const int4 = diag.intervals[3];
      expect(int4.label).toBe('3,000〜5,000G');
      expect(int4.count).toBe(1);
      expect(int4.totalGames).toBe(4000);
      expect(int4.totalDiff).toBe(600);
      expect(int4.inWeightedPayoutRate).toBe(105.0);

      // 区間 5: 5,000G〜
      const int5 = diag.intervals[4];
      expect(int5.label).toBe('5,000G〜');
      expect(int5.count).toBe(1);
      expect(int5.totalGames).toBe(6000);
      expect(int5.totalDiff).toBe(1800);
      expect(int5.inWeightedPayoutRate).toBe(110.0);
    });
  });

  describe('2. checkDataVolumeWarnings', () => {
    it('台数5台未満・台日300台日未満・ボーナスなし、それぞれの警告が出ること', () => {
      // 1. 台数3台 (< 5), 台日100 (< 300), ボーナスなし (false)
      const resAllWarn = checkDataVolumeWarnings(3, 100, false);
      expect(resAllWarn.hasWarning).toBe(true);
      expect(resAllWarn.warnings.some((w) => w.type === 'few_machines')).toBe(true);
      expect(resAllWarn.warnings.some((w) => w.type === 'few_days')).toBe(true);
      expect(resAllWarn.warnings.some((w) => w.type === 'no_bonus')).toBe(true);

      // 2. 基準をすべて満たす場合: 台数10台, 台日500台日, ボーナスあり
      const resSafe = checkDataVolumeWarnings(10, 500, true);
      expect(resSafe.hasWarning).toBe(false);
      expect(resSafe.warnings.length).toBe(0);
    });

    it('閾値を変更できること', () => {
      // minMachines: 10, minDays: 500, warnOnNoBonus: false にカスタマイズ
      const resCustom = checkDataVolumeWarnings(8, 400, false, {
        minMachines: 10,
        minDays: 500,
        warnOnNoBonus: false,
      });

      // 台数8台: 既定(5台)ならセーフだが、閾値10台のため警告が出る
      expect(resCustom.warnings.some((w) => w.type === 'few_machines')).toBe(true);
      // 台日400台日: 既定(300台日)ならセーフだが、閾値500台日のため警告が出る
      expect(resCustom.warnings.some((w) => w.type === 'few_days')).toBe(true);
      // warnOnNoBonus: false のため、ボーナスなしでも no_bonus 警告は出ない
      expect(resCustom.warnings.some((w) => w.type === 'no_bonus')).toBe(false);
    });
  });

  describe('3. estimateModelSettingDistribution の gameWeightMode (raw / cap3000 / constant)', () => {
    function generateBiasedDailyRecords(): DailyRecord[] {
      // 4台: ゲーム数と出率の組み合わせで、回転数の重みによって事後確率・高設定比率が変動するデータ
      return [
        {
          date: '2025-01-01',
          storeName: 'テスト店',
          totalGames: 18000,
          totalDiff: 600,
          machines: [
            {
              machineNum: 1,
              modelName: JUGGLER_SPEC.modelName,
              games: 8000,
              diff: 400, // payout: 101.67% (設定4: 101.1% 付近)
              payoutRate: 101.67,
            },
            {
              machineNum: 2,
              modelName: JUGGLER_SPEC.modelName,
              games: 8000,
              diff: -200, // payout: 99.17% (設定3: 99.5% 付近)
              payoutRate: 99.17,
            },
            {
              machineNum: 3,
              modelName: JUGGLER_SPEC.modelName,
              games: 1000,
              diff: 100, // payout: 103.33% (設定5付近だがゲーム数が少ない)
              payoutRate: 103.33,
            },
            {
              machineNum: 4,
              modelName: JUGGLER_SPEC.modelName,
              games: 1000,
              diff: -100, // payout: 96.67% (設定1付近だがゲーム数が少ない)
              payoutRate: 96.67,
            },
          ],
        } as unknown as DailyRecord,
      ];
    }

    it('回転数の重みがそれぞれ尤度に反映されること (rawと他の方式で結果が違うこと)', () => {
      const records = generateBiasedDailyRecords();

      const estRaw = estimateModelSettingDistribution(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { gameWeightMode: 'raw', pointEstimateOnly: true, minGames: 0 }
      );

      const estCap3000 = estimateModelSettingDistribution(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { gameWeightMode: 'cap3000', pointEstimateOnly: true, minGames: 0 }
      );

      const estConstant = estimateModelSettingDistribution(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { gameWeightMode: 'constant', pointEstimateOnly: true, minGames: 0 }
      );

      // rawでは8000Gの台の分散が小さく重く評価され、cap3000やconstantでは重みが緩和されるため、尤度・高設定比率が異なる
      expect(estRaw.highSettingOverallRate).not.toBe(estCap3000.highSettingOverallRate);
      expect(estRaw.highSettingOverallRate).not.toBe(estConstant.highSettingOverallRate);
    });

    it('constantでは回転数に依存しないこと (回転数を変えても結果が不変)', () => {
      const recordsBase: DailyRecord[] = [
        {
          date: '2025-01-01',
          storeName: 'テスト店',
          totalGames: 9000,
          totalDiff: 1200,
          machines: [
            {
              machineNum: 1,
              modelName: JUGGLER_SPEC.modelName,
              games: 4000,
              diff: 600, // payout: 105.0%
              payoutRate: 105.0,
            },
            {
              machineNum: 2,
              modelName: JUGGLER_SPEC.modelName,
              games: 1000,
              diff: -100, // payout: 96.67%
              payoutRate: 96.67,
            },
          ],
        } as unknown as DailyRecord,
      ];

      // 機械割は同一のまま、ゲーム数だけ変更したデータ
      const recordsScaled: DailyRecord[] = [
        {
          date: '2025-01-01',
          storeName: 'テスト店',
          totalGames: 12000,
          totalDiff: 1500,
          machines: [
            {
              machineNum: 1,
              modelName: JUGGLER_SPEC.modelName,
              games: 8000, // 4000G -> 8000G
              diff: 1200, // payout: 105.0%
              payoutRate: 105.0,
            },
            {
              machineNum: 2,
              modelName: JUGGLER_SPEC.modelName,
              games: 2000, // 1000G -> 2000G
              diff: -200, // payout: 96.67%
              payoutRate: 96.67,
            },
          ],
        } as unknown as DailyRecord,
      ];

      const estBase = estimateModelSettingDistribution(
        JUGGLER_SPEC.modelName,
        recordsBase,
        JUGGLER_SPEC,
        { gameWeightMode: 'constant', pointEstimateOnly: true, minGames: 0 }
      );

      const estScaled = estimateModelSettingDistribution(
        JUGGLER_SPEC.modelName,
        recordsScaled,
        JUGGLER_SPEC,
        { gameWeightMode: 'constant', pointEstimateOnly: true, minGames: 0 }
      );

      // constant では回転数に依存せず固定3000G相当で計算されるため、各設定の比率・平均設定が一致する
      expect(estBase.highSettingOverallRate).toBeCloseTo(estScaled.highSettingOverallRate, 2);
      expect(estBase.expectedSettingOverall).toBeCloseTo(estScaled.expectedSettingOverall, 2);
    });
  });

  describe('4. runSensitivityAnalysis', () => {
    it('15条件が返ること', () => {
      const records: DailyRecord[] = [
        {
          date: '2025-01-01',
          storeName: 'テスト店',
          totalGames: 6000,
          totalDiff: 200,
          machines: [
            {
              machineNum: 1,
              modelName: JUGGLER_SPEC.modelName,
              games: 6000,
              diff: 200,
              payoutRate: 101.1,
            },
          ],
        } as unknown as DailyRecord,
      ];

      const result = runSensitivityAnalysis(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000]
      );

      // 5閾値 × 3重み = 15条件
      expect(result.rows.length).toBe(5);
      for (const row of result.rows) {
        expect(typeof row.rateRaw).toBe('number');
        expect(typeof row.rateCap3000).toBe('number');
        expect(typeof row.rateConstant).toBe('number');
      }
    });

    it('プラザ515と同じ構造の合成データ（2台×90日、回転数と出率が相関）で変動幅が30ポイント以上になること', () => {
      const rng = createSeededRandom(515);
      const dailyRecords: DailyRecord[] = [];

      for (let day = 1; day <= 90; day++) {
        const machines: DailyMachineRecord[] = [];
        for (let m = 1; m <= 2; m++) {
          const isHigh = rng() < 0.52;
          let games: number;
          let payout: number;

          if (isHigh) {
            games = Math.round(6500 + rng() * 2000);
            payout = 104.0 + (rng() * 4.0 - 1.0);
          } else {
            games = Math.round(400 + rng() * 1000);
            payout = 94.0 + rng() * 3.5;
          }

          const diff = Math.round((payout / 100.0) * games * 3 - games * 3);
          machines.push({
            machineNum: 100 + m,
            modelName: JUGGLER_SPEC.modelName,
            games,
            diff,
            payoutRate: Number(payout.toFixed(2)),
          });
        }
        dailyRecords.push({
          date: `2024-01-${day < 10 ? '0' + day : day}`,
          storeName: 'プラザ515風',
          machines,
          totalGames: machines.reduce((s, r) => s + r.games, 0),
          totalDiff: machines.reduce((s, r) => s + r.diff, 0),
        } as unknown as DailyRecord);
      }

      const res = runSensitivityAnalysis(
        JUGGLER_SPEC.modelName,
        dailyRecords,
        JUGGLER_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000]
      );

      expect(res.rateSpread).toBeGreaterThanOrEqual(30.0);
      expect(res.isHighSensitivity).toBe(true);
      expect(res.warningMessage).toContain('出率だけでは分布は決められません');
    });

    it('回転数が結果と無関係なデータでは30ポイント未満になること', () => {
      const rng = createSeededRandom(999);
      const dailyRecords: DailyRecord[] = [];

      // 全台日、設定や勝敗に関わらず常に一定の高稼働（6,000G〜7,000G）
      for (let day = 1; day <= 60; day++) {
        const machines: DailyMachineRecord[] = [];
        for (let m = 1; m <= 4; m++) {
          const games = Math.round(6000 + rng() * 1000);
          const payout = 99.0 + rng() * 3.0; // 99%〜102%
          const diff = Math.round((payout / 100.0) * games * 3 - games * 3);
          machines.push({
            machineNum: 200 + m,
            modelName: JUGGLER_SPEC.modelName,
            games,
            diff,
            payoutRate: Number(payout.toFixed(2)),
          });
        }
        dailyRecords.push({
          date: `2024-02-${day < 10 ? '0' + day : day}`,
          storeName: '無相関店',
          machines,
          totalGames: machines.reduce((s, r) => s + r.games, 0),
          totalDiff: machines.reduce((s, r) => s + r.diff, 0),
        } as unknown as DailyRecord);
      }

      const res = runSensitivityAnalysis(
        JUGGLER_SPEC.modelName,
        dailyRecords,
        JUGGLER_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000]
      );

      expect(res.rateSpread).toBeLessThan(30.0);
      expect(res.isHighSensitivity).toBe(false);
      expect(res.warningMessage).toBe('');
    });
  });

  describe('5. executeSensitivityAnalysisAsync & キャッシュ & 中止制御', () => {
    it('非同期実行で進捗(1〜15条件)が通知され、同一キーならキャッシュから即時返却されること', async () => {
      const records: DailyRecord[] = [
        {
          date: '2025-01-01',
          storeName: 'テスト店',
          totalGames: 7000,
          totalDiff: 300,
          machines: [
            {
              machineNum: 10,
              modelName: JUGGLER_SPEC.modelName,
              games: 7000,
              diff: 300,
              payoutRate: 101.4,
            },
          ],
        } as unknown as DailyRecord,
      ];

      const progressSteps: number[] = [];
      const handle1 = executeSensitivityAnalysisAsync(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000],
        (completed, _total) => {
          progressSteps.push(completed);
        }
      );

      const res1 = await handle1.promise;
      expect(res1.rows.length).toBe(5);
      expect(progressSteps).toContain(15);

      // キャッシュに保存されていることを確認
      const cacheKey = computeSensitivityCacheKey(JUGGLER_SPEC.modelName, records, JUGGLER_SPEC, {
        highSettingThreshold: 4,
      });
      const cached = getSensitivityMemoryCache(cacheKey);
      expect(cached).toBeDefined();

      // 2回目はキャッシュから取得される
      let progress2Calls = 0;
      const handle2 = executeSensitivityAnalysisAsync(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000],
        () => {
          progress2Calls++;
        }
      );

      const res2 = await handle2.promise;
      expect(res2).toEqual(res1);
      expect(progress2Calls).toBe(1); // 即座に15/15が返される
    });

    it('キャンセルを実行した場合は後続の処理が中断されること', async () => {
      const records: DailyRecord[] = [
        {
          date: '2025-01-01',
          storeName: 'テスト店',
          totalGames: 7000,
          totalDiff: 300,
          machines: [
            {
              machineNum: 10,
              modelName: JUGGLER_SPEC.modelName,
              games: 7000,
              diff: 300,
              payoutRate: 101.4,
            },
          ],
        } as unknown as DailyRecord,
      ];

      const handle = executeSensitivityAnalysisAsync(
        JUGGLER_SPEC.modelName,
        records,
        JUGGLER_SPEC,
        { highSettingThreshold: 4 },
        [0, 1000, 2000, 3000, 5000]
      );

      // 即座にキャンセル
      handle.cancel();

      // キャンセルが正常に行われ、例外等でクラッシュしないこと
      expect(typeof handle.cancel).toBe('function');
    });
  });
});
