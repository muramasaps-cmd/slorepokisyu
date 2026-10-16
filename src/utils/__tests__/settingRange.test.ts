import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  calculateOverallPayoutRate,
  calculateBlockBootstrapPayoutCi,
  interpolateSettingEquivalent,
  calculateHighSettingRange,
  estimateModelSettingRange,
  calculateMultiModelCombinedEstimation,
  FlatMachineDayRecord,
} from '../settingRange';
import { ModelSettingSpec } from '../settingSpecs';
import { DailyRecord } from '../../data/types';

describe('settingRange (出率ベース設定範囲・平均設定相当推定)', () => {
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

  function loadPlaza515Records(): { flatRecords: FlatMachineDayRecord[]; dailyRecords: DailyRecord[] } {
    const csvPath = path.join(__dirname, 'fixtures', 'plaza515_juggler_girls.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');
    const flatRecords: FlatMachineDayRecord[] = [];
    const dateMap = new Map<string, Array<{ machineNum: number; games: number; diff: number; payoutRate: number; modelName: string }>>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      // 店舗名,日付,機種名,台番号,回転数,差枚数
      const date = parts[1];
      const modelName = parts[2];
      const machineNum = parseInt(parts[3], 10);
      const games = parseInt(parts[4], 10);
      const diff = parseInt(parts[5], 10);

      flatRecords.push({
        date,
        machineNum,
        games,
        diff,
        modelName,
      });

      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)!.push({
        machineNum,
        games,
        diff,
        payoutRate: games > 0 ? 100 * (1 + diff / (games * 3)) : 100,
        modelName,
      });
    }

    const dailyRecords: DailyRecord[] = Array.from(dateMap.entries()).map(([date, machines]) => ({
      date,
      storeName: 'プラザ515',
      machines,
      totalGames: machines.reduce((acc, m) => acc + m.games, 0),
      totalDiff: machines.reduce((acc, m) => acc + m.diff, 0),
    } as unknown as DailyRecord));

    return { flatRecords, dailyRecords };
  }

  it('Requirement 12: プラザ515・ジャグラーガールズSS(2台×90日)の実データで主表示の値が期待値と合致する', () => {
    const { dailyRecords, flatRecords } = loadPlaza515Records();
    expect(flatRecords.length).toBe(180); // 2台 × 90日

    const result = estimateModelSettingRange(
      'ジャグラーガールズSS',
      dailyRecords,
      JUGGLER_GIRLS_SPEC,
      {
        highThreshold: 4,
        bootstrapReps: 2000,
        bootstrapSeed: 42,
      }
    );

    // 許容誤差: 出率±0.1%、平均設定相当±0.05
    // 期待値: 全体出率101.19% (95%区間 99.88〜102.48%)
    expect(result.overallPayoutRate).toBeGreaterThanOrEqual(101.09);
    expect(result.overallPayoutRate).toBeLessThanOrEqual(101.29);
    expect(Math.abs(result.overallPayoutRate - 101.19)).toBeLessThanOrEqual(0.1);

    // 平均設定相当: 期待値 3.58 (許容誤差 ±0.05)
    expect(Math.abs(result.settingEquivalent - 3.58)).toBeLessThanOrEqual(0.05);

    // 95%信頼区間: 99.88%〜102.48% 付近
    expect(result.payoutCi95[0]).toBeGreaterThanOrEqual(99.5);
    expect(result.payoutCi95[0]).toBeLessThanOrEqual(100.5);
    expect(result.payoutCi95[1]).toBeGreaterThanOrEqual(102.0);
    expect(result.payoutCi95[1]).toBeLessThanOrEqual(103.0);

    // 高設定（4以上）割合の点推定範囲: 期待値 17%〜82% 付近
    // 下限 = (101.19 - 99.9) / (107.5 - 99.9) = 1.29 / 7.6 ≈ 17.0%
    // 上限 = (101.19 - 97.0) / (102.1 - 97.0) = 4.19 / 5.1 ≈ 82.2%
    expect(result.pointRange.minRate).toBeGreaterThanOrEqual(15);
    expect(result.pointRange.minRate).toBeLessThanOrEqual(19);
    expect(result.pointRange.maxRate).toBeGreaterThanOrEqual(80);
    expect(result.pointRange.maxRate).toBeLessThanOrEqual(84);

    // 台数・台日数・総G数
    expect(result.uniqueMachineCount).toBe(2);
    expect(result.totalMachineDays).toBe(180);
    expect(result.totalGames).toBeGreaterThan(900000);

    // 誤差半減の見通し (総G数の3倍)
    expect(result.additionalGamesForHalfCi).toBe(result.totalGames * 3);
    expect(result.additionalDaysForHalfCi).toBe(90 * 3);
  });

  it('線形補間: 機械割に応じた平均設定相当の算出および範囲外のクランプ', () => {
    // 設定1(97.0) 〜 設定2(97.9) 中間: 97.45 -> 設定1.5
    expect(interpolateSettingEquivalent(97.45, JUGGLER_GIRLS_SPEC)).toBeCloseTo(1.5, 1);
    // 設定3(99.9) 〜 設定4(102.1) 中間: 101.0 -> 3 + (101.0 - 99.9)/(102.1 - 99.9) = 3 + 1.1/2.2 = 3.5
    expect(interpolateSettingEquivalent(101.0, JUGGLER_GIRLS_SPEC)).toBe(3.5);
    // 最低割以下は設定1にクランプ
    expect(interpolateSettingEquivalent(95.0, JUGGLER_GIRLS_SPEC)).toBe(1);
    // 最高割以上は設定6にクランプ
    expect(interpolateSettingEquivalent(110.0, JUGGLER_GIRLS_SPEC)).toBe(6);
  });

  it('高設定割合の範囲算出: 下限と上限の計算式が正しい', () => {
    // 出率 97.0 (最低割): minRate = 0%, maxRate = 0%
    const lowRange = calculateHighSettingRange(97.0, JUGGLER_GIRLS_SPEC, 4);
    expect(lowRange.minRate).toBe(0);
    expect(lowRange.maxRate).toBe(0);

    // 出率 107.5 (最高割): minRate = 100%, maxRate = 100%
    const highRange = calculateHighSettingRange(107.5, JUGGLER_GIRLS_SPEC, 4);
    expect(highRange.minRate).toBe(100);
    expect(highRange.maxRate).toBe(100);
  });

  it('複数機種まとめ推定: IN枚数加重とブートストラップ区間の算出', () => {
    const { dailyRecords } = loadPlaza515Records();

    const multiRes = calculateMultiModelCombinedEstimation(
      [
        { modelName: 'ジャグラーガールズSS', spec: JUGGLER_GIRLS_SPEC },
      ],
      dailyRecords,
      { reps: 500, seed: 42 }
    );

    expect(multiRes.models.length).toBe(1);
    expect(multiRes.models[0].machineCount).toBe(2);
    expect(multiRes.totalGames).toBeGreaterThan(900000);
    expect(multiRes.combinedSettingEquivalent).toBeCloseTo(3.58, 1);
    expect(multiRes.combinedSettingCi95[0]).toBeLessThan(multiRes.combinedSettingEquivalent);
    expect(multiRes.combinedSettingCi95[1]).toBeGreaterThan(multiRes.combinedSettingEquivalent);
  });
});
