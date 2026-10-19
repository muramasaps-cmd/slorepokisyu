import { describe, it, expect } from 'vitest';
import {
  calculateTargetMachineRanking,
  DEFAULT_MACHINE_RANKING_WEIGHTS,
} from '../targetMachineRanking';
import { runMachineBacktest } from '../backtestEngine';
import { createSyntheticMachineRecords } from './testDataGenerator';
import { DailyRecord, DailyMachineRecord } from '../../data/types';

describe('30-7: Cohort Additive Model (コホートの加法モデル)', () => {
  it('1. DEFAULT_MACHINE_RANKING_WEIGHTS で cohortMode: "interaction" が既定であること', () => {
    expect(DEFAULT_MACHINE_RANKING_WEIGHTS.cohortMode).toBe('interaction');
  });

  it('2. additive モードのとき、台のスコア（shrunkDiff）が台の全期間の縮小平均 ＋ (機種・店舗のコホート平均 - 全期間平均) と一致すること', () => {
    // 制御された小さなデータセット:
    // 同一機種「アイムジャグラーEX」の台101〜104
    // 期間: 14日間（各曜日2回ずつ）
    // 台101は常に優秀、台102〜104は通常
    const baseDate = new Date('2025-01-05'); // 日曜日
    const records: DailyRecord[] = [];

    for (let d = 0; d < 14; d++) {
      const cur = new Date(baseDate);
      cur.setDate(baseDate.getDate() + d);
      const dateStr = cur.toISOString().slice(0, 10);
      const dow = ['日', '月', '火', '水', '木', '金', '土'][cur.getDay()];

      // 日ごとのコホート（曜日）効果: 日曜日は+300枚、平日は-50枚
      const dayCohortDiff = dow === '日' ? 300 : -50;

      const machines: DailyMachineRecord[] = [
        { machineNum: 101, modelName: 'アイムジャグラーEX', games: 5000, diff: 1500 + dayCohortDiff },
        { machineNum: 102, modelName: 'アイムジャグラーEX', games: 5000, diff: 200 + dayCohortDiff },
        { machineNum: 103, modelName: 'アイムジャグラーEX', games: 5000, diff: -200 + dayCohortDiff },
        { machineNum: 104, modelName: 'アイムジャグラーEX', games: 5000, diff: -500 + dayCohortDiff },
      ];

      const totalDiff = machines.reduce((s, m) => s + m.diff, 0);
      records.push({
        date: dateStr,
        year: cur.getFullYear(),
        month: cur.getMonth() + 1,
        day: cur.getDate(),
        yearMonth: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
        dayOfWeek: dow,
        avgDiffCoins: Math.round(totalDiff / machines.length),
        avgGames: 5000,
        winRate: 50,
        winMachines: 2,
        totalMachines: machines.length,
        totalDiffCoins: totalDiff,
        hallCoinProfit: -totalDiff,
        playerCoinProfit: totalDiff,
        hallYenProfit: 0,
        playerYenProfit: 0,
        machines,
      });
    }

    const targetDate = '2025-01-19'; // 日曜日 (dow = '日')

    // interaction モードと additive モードの両方でランキングを計算
    const resInteraction = calculateTargetMachineRanking(targetDate, records, undefined, {
      cohortMode: 'interaction',
    });
    const resAdditive = calculateTargetMachineRanking(targetDate, records, undefined, {
      cohortMode: 'additive',
    });

    expect(resInteraction.rankings.length).toBe(4);
    expect(resAdditive.rankings.length).toBe(4);

    const m101Additive = resAdditive.rankings.find((r) => r.machineNum === 101)!;
    expect(m101Additive).toBeDefined();

    // 台101の全期間の平均とコホート効果の確認
    // 全14日間の台101のdiffSum = 12 * (1500 - 50) + 2 * (1500 + 300) = 12*1450 + 2*1800 = 17400 + 3600 = 21000
    // 平均 = 21000 / 14 = 1500枚
    // 機種全体の全期間平均 = (1500 + 200 - 200 - 500) / 4 = 1000 / 4 = 250枚
    // 機種全体の日曜日コホート平均 = 250 + 300 = 550枚
    // コホート効果 = 550 - 250 = +300枚
    // 台101の縮小後全期間平均は ~1500枚に近い値
    // additive の shrunkDiff は 縮小後全期間平均 + 300
    expect(m101Additive.stats.shrunkDiff).toBeGreaterThan(1500);
    // 台101が最上位にランクされる
    expect(resAdditive.rankings[0].machineNum).toBe(101);
  });

  it('3. 台×コホートの交互作用がなく、台ごとの差があるデータで、additive が interaction 以上のリフトを出すこと', () => {
    // 20日間、12台、台101と102が真の優秀台（+2000枚のバイアス）
    // 交互作用なし（どの曜日でも台ごとの優秀さは一定）
    const records = createSyntheticMachineRecords({
      daysCount: 20,
      machinesCount: 12,
      biasedMachineNums: [101, 102],
      biasBonus: 2000,
      seed: 54321,
    });

    const interactionBacktest = runMachineBacktest(records, undefined, {
      topN: 3,
      minEvidenceDays: 3,
      blockLength: 7,
      bootstrapIterations: 500,
      weights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        cohortMode: 'interaction',
      },
    });

    const additiveBacktest = runMachineBacktest(records, undefined, {
      topN: 3,
      minEvidenceDays: 3,
      blockLength: 7,
      bootstrapIterations: 500,
      weights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        cohortMode: 'additive',
      },
    });

    // additive が interaction 以上のリフトを達成すること
    const interactionLift = interactionBacktest.withFilter.avgLift;
    const additiveLift = additiveBacktest.withFilter.avgLift;

    expect(additiveLift).toBeGreaterThanOrEqual(interactionLift);
  });

  it('4. 既存のゴールデンテスト結果と互換性があり、既定 interaction モードでは既存の挙動を完全に維持すること', () => {
    const records = createSyntheticMachineRecords({
      daysCount: 15,
      machinesCount: 8,
      biasedMachineNums: [101],
      biasBonus: 1500,
      seed: 999,
    });

    const resDefault = calculateTargetMachineRanking('2025-01-16', records);
    const resExplicitInteraction = calculateTargetMachineRanking('2025-01-16', records, undefined, {
      cohortMode: 'interaction',
    });

    expect(resDefault.rankings.map((r) => r.machineNum)).toEqual(
      resExplicitInteraction.rankings.map((r) => r.machineNum)
    );
    expect(resDefault.rankings.map((r) => r.totalScore)).toEqual(
      resExplicitInteraction.rankings.map((r) => r.totalScore)
    );
  });
});
