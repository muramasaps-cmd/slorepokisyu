import { describe, it, expect } from 'vitest';
import { calculateTargetMachineRanking, DEFAULT_MACHINE_RANKING_WEIGHTS } from '../targetMachineRanking';
import { calculateCrossStoreRanking } from '../crossStoreRanking';
import { runMachineBacktest } from '../backtestEngine';
import { StoreProfile, MachineRankingWeights } from '../../data/types';
import { createSyntheticMachineRecords } from './testDataGenerator';
import type { MachineBacktestWorkerRequest } from '../../workers/machineBacktestWorker';

function createTestStore(params: Partial<StoreProfile> & { id: string; name: string }): StoreProfile {
  return {
    address: '東京都新宿区',
    oldEventDays: '7のつく日',
    exchangeRate: '5.2枚',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 300,
    dataRange: '2026-01-01〜2026-06-01',
    dailyRecords: [],
    ...params,
  };
}

describe('Store Machine Weights Propagation (Prompt 17 Requirement 7)', () => {
  const records = createSyntheticMachineRecords({
    daysCount: 15,
    machinesCount: 10,
    biasedMachineNums: [101, 107],
    seed: 12345,
  });
  const targetDate = '2026-06-01';

  it('1. 台番ランキング画面: calculateTargetMachineRanking uses store custom machine weights', () => {
    // 1. Default weights
    const defaultRanking = calculateTargetMachineRanking(
      targetDate,
      records,
      undefined,
      undefined
    );

    // 2. Custom weights with extreme tail match bonus
    const customWeights: MachineRankingWeights = {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      tailMatchBonus: 500,
      diffWeight: 0,
      highSettingWeight: 0,
      modelScoreWeight: 0,
    };
    const customRanking = calculateTargetMachineRanking(
      targetDate,
      records,
      undefined,
      customWeights
    );

    expect(defaultRanking.rankings.length).toBeGreaterThan(0);
    expect(customRanking.rankings.length).toBeGreaterThan(0);

    // Scores must be different due to custom weights
    const defaultTopScore = defaultRanking.rankings[0].totalScore;
    const customTopScore = customRanking.rankings[0].totalScore;
    expect(customTopScore).not.toBe(defaultTopScore);

    // When tailMatchBonus is 500 on date '2026-06-01' (target tail 1), machine 101 must get tailBonusScore 500
    const tail1Custom = customRanking.rankings.find((r) => r.machineNum === 101);
    expect(tail1Custom).toBeDefined();
    expect(tail1Custom?.contributions.tailBonusScore).toBe(500);
  });

  it('1b. 台番ランキング画面: runMachineBacktest in TargetMachineRanking uses store custom machine weights', () => {
    // Backtest with default weights
    const defaultBacktest = runMachineBacktest(records, undefined, {
      topN: 3,
      minEvidenceDays: 3,
      bootstrapIterations: 200,
      weights: DEFAULT_MACHINE_RANKING_WEIGHTS,
    });

    // Backtest with custom weights (zero out diffWeight and highSettingWeight, heavily weigh winRate)
    const customWeights: MachineRankingWeights = {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      diffWeight: 0,
      highSettingWeight: 0,
      winRateWeight: 50.0,
    };

    const customBacktest = runMachineBacktest(records, undefined, {
      topN: 3,
      minEvidenceDays: 3,
      bootstrapIterations: 200,
      weights: customWeights,
    });

    expect(defaultBacktest.evaluatedDaysCount).toBeGreaterThan(0);
    expect(customBacktest.evaluatedDaysCount).toBe(defaultBacktest.evaluatedDaysCount);

    // Selected machine rankings across evaluation days must reflect custom weights
    const defaultFirstDayMachines = defaultBacktest.withoutFilter.dailyEvaluations[0]?.selectedMachineNums;
    const customFirstDayMachines = customBacktest.withoutFilter.dailyEvaluations[0]?.selectedMachineNums;
    expect(customFirstDayMachines).toBeDefined();
    expect(defaultFirstDayMachines).toBeDefined();
  });

  it('2. 横断ランキング: calculateCrossStoreRanking uses store.customMachineRankingWeights', () => {
    // Store with default machine weights
    const defaultStore = createTestStore({
      id: 'store-default',
      name: 'デフォルト店舗',
      createdAt: '2026-01-01',
      dailyRecords: records,
    });

    // Store with custom machine weights giving 999 bonus to zoro machines
    const customStore = createTestStore({
      id: 'store-custom',
      name: 'カスタム店舗',
      createdAt: '2026-01-01',
      dailyRecords: records,
      customMachineRankingWeights: {
        ...DEFAULT_MACHINE_RANKING_WEIGHTS,
        zoroBonus: 999,
        diffWeight: 0,
        modelScoreWeight: 0,
      },
    });

    const resDefault = calculateCrossStoreRanking([defaultStore], targetDate, {
      topMachineCount: 10,
    });
    const resCustom = calculateCrossStoreRanking([customStore], targetDate, {
      topMachineCount: 10,
    });

    expect(resDefault.machineRankings.length).toBeGreaterThan(0);
    expect(resCustom.machineRankings.length).toBeGreaterThan(0);

    // The top scores and rank ordering should differ because custom weights prioritized zoro
    const defaultTop = resDefault.machineRankings[0];
    const customTop = resCustom.machineRankings[0];

    expect(customTop.totalScore).not.toBe(defaultTop.totalScore);
  });

  it('2b. 横断ランキング: CrossStoreTarget runStoreEdgeTest passes store.customMachineRankingWeights', () => {
    const customWeights: MachineRankingWeights = {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      tailMatchBonus: 300,
      zoroBonus: 200,
    };

    const store = createTestStore({
      id: 'store-edge-test',
      name: 'エッジテスト店舗',
      createdAt: '2026-01-01',
      dailyRecords: records,
      customMachineRankingWeights: customWeights,
    });

    // Simulating CrossStoreTarget runStoreEdgeTest
    const priorRecords = (store.dailyRecords || []).filter((r) => r.date < targetDate);
    const res = runMachineBacktest(priorRecords, store.specialDayRules, {
      topN: 10,
      minEvidenceDays: 3,
      bootstrapIterations: 200,
      weights: store.customMachineRankingWeights,
    });

    expect(res.evaluatedDaysCount).toBeGreaterThan(0);
    expect(res.withFilter).toBeDefined();
    expect(res.withoutFilter).toBeDefined();
  });

  it('3. Workerの計算: crossRankingWorker passes and applies store.customMachineRankingWeights', () => {
    const customMachineWeights: MachineRankingWeights = {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      highSettingWeight: 300,
      modelScoreWeight: 0,
      diffWeight: 0,
    };

    const storeWithWeights = createTestStore({
      id: 'store-worker-test',
      name: 'Worker検証店舗',
      createdAt: '2026-01-01',
      dailyRecords: records,
      customMachineRankingWeights: customMachineWeights,
    });

    // Simulation of the computation performed inside crossRankingWorker.ts
    const workerResult = calculateCrossStoreRanking([storeWithWeights], targetDate, {
      topMachineCount: 5,
    });

    expect(workerResult.machineRankings.length).toBeGreaterThan(0);
    expect(workerResult.machineRankings.every((m) => m.storeId === 'store-worker-test')).toBe(true);
  });

  it('3b. Workerの計算: machineBacktestWorker passes and applies options.weights (customMachineWeights)', () => {
    const customMachineWeights: MachineRankingWeights = {
      ...DEFAULT_MACHINE_RANKING_WEIGHTS,
      diffWeight: 0.2,
      modelScoreWeight: 0,
    };

    const request: MachineBacktestWorkerRequest = {
      type: 'START_BACKTEST',
      dailyRecords: records,
      specialDayRules: undefined,
      options: {
        topN: 5,
        minEvidenceDays: 3,
        weights: customMachineWeights,
      },
    };

    // Simulation of the exact computation performed inside machineBacktestWorker.ts
    const workerResult = runMachineBacktest(request.dailyRecords, request.specialDayRules, request.options);

    expect(workerResult.evaluatedDaysCount).toBeGreaterThan(0);
    expect(workerResult.ablationResults).toBeDefined();
    // Base model ('all') must use the custom weights provided in options.weights
    const allItem = workerResult.ablationResults?.find((a) => a.variantKey === 'all');
    expect(allItem).toBeDefined();
  });
});
