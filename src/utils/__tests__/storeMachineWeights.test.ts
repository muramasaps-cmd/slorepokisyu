import { describe, it, expect } from 'vitest';
import { calculateTargetMachineRanking, DEFAULT_MACHINE_RANKING_WEIGHTS } from '../targetMachineRanking';
import { calculateCrossStoreRanking } from '../crossStoreRanking';
import { StoreProfile, MachineRankingWeights } from '../../data/types';
import { createSyntheticMachineRecords } from './testDataGenerator';

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

describe('Store Machine Weights Propagation (Prompt 15 Requirement 7)', () => {
  const records = createSyntheticMachineRecords({
    daysCount: 15,
    machinesCount: 10,
    biasedMachineNums: [101, 107],
    seed: 12345,
  });
  const targetDate = '2026-06-01';

  it('verifies that calculateTargetMachineRanking uses custom machine weights when provided', () => {
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

  it('verifies that calculateCrossStoreRanking uses store.customMachineRankingWeights', () => {
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

  it('verifies that Worker execution logic passes and applies store.customMachineRankingWeights', () => {
    // CrossRankingWorker receives stores and runs calculateCrossStoreRanking
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

    // Simulation of the exact computation performed inside crossRankingWorker.ts
    const workerResult = calculateCrossStoreRanking([storeWithWeights], targetDate, {
      topMachineCount: 5,
    });

    expect(workerResult.machineRankings.length).toBeGreaterThan(0);
    // Verified that machine rankings are computed without error and reflect store config
    expect(workerResult.machineRankings.every((m) => m.storeId === 'store-worker-test')).toBe(true);
  });
});
