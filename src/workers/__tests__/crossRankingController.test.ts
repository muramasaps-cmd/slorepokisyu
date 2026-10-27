import { describe, it, expect } from 'vitest';
import {
  CrossRankingController,
  computeStoresSignature,
  CrossRankingWorkerResponse,
} from '../crossRankingController';
import { StoreProfile } from '../../data/types';
import {
  calculateCrossStoreRanking,
  scanCandidateDates,
} from '../../utils/crossStoreRanking';
import { generateSyntheticDailyRecords } from '../../utils/__tests__/testDataGenerator';

describe('CrossRankingController', () => {
  const sampleRecords = generateSyntheticDailyRecords(50, 14, 5);
  const sampleStore1: StoreProfile = {
    id: 'store-alpha',
    name: 'ホールアルファ',
    address: '東京都豊島区',
    oldEventDays: '7のつく日',
    dataRange: '2024-01-01 - 2024-01-14',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 52,
    exchangeRate: '52枚',
    totalMachinesApprox: 200,
    specialDayRules: { tails: [7] },
  };

  const sampleStore2: StoreProfile = {
    id: 'store-beta',
    name: 'ホールベータ',
    address: '東京都新宿区',
    oldEventDays: '土曜日',
    dataRange: '2024-01-01 - 2024-01-14',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 50,
    exchangeRate: '50枚',
    totalMachinesApprox: 200,
    specialDayRules: { daysOfWeek: ['土'] },
  };

  const stores: StoreProfile[] = [sampleStore1, sampleStore2];
  const targetDate = sampleRecords[sampleRecords.length - 1].date;

  it('computes a consistent deterministic stores signature', () => {
    const sig1 = computeStoresSignature(stores);
    const sig2 = computeStoresSignature([...stores]);
    expect(sig1).toBe(sig2);
    expect(sig1).toContain('store-alpha');
    expect(sig1).toContain('store-beta');
    expect(computeStoresSignature([])).toBe('empty');

    // Changes when store data changes
    const modifiedStores = [
      {
        ...sampleStore1,
        dailyRecords: sampleRecords.slice(0, 5),
      },
      sampleStore2,
    ];
    expect(computeStoresSignature(modifiedStores)).not.toBe(sig1);
  });

  it('SET_STORES saves stores and signature, and CALCULATE produces identical result to direct call', () => {
    const controller = new CrossRankingController();
    const signature = computeStoresSignature(stores);

    const setResponses = controller.handle({
      type: 'SET_STORES',
      signature,
      stores,
    });
    expect(setResponses).toEqual([{ type: 'STORES_SET', signature }]);
    expect(controller.getStores()).toHaveLength(2);

    const calcResponses = controller.handle({
      type: 'CALCULATE_CROSS_RANKING',
      requestId: 10,
      targetDate,
      options: {
        metricMode: 'diffCoins',
        topModelCount: 5,
        topMachineCount: 5,
      },
    });

    const resultResponse = calcResponses.find(
      (r): r is Extract<CrossRankingWorkerResponse, { type: 'RESULT' }> => r.type === 'RESULT'
    );
    expect(resultResponse).toBeDefined();
    expect(resultResponse?.requestId).toBe(10);

    // Verify exact parity with direct calculateCrossStoreRanking call
    const expected = calculateCrossStoreRanking(stores, targetDate, {
      metricMode: 'diffCoins',
      topModelCount: 5,
      topMachineCount: 5,
    });
    expect(resultResponse?.result).toEqual(expected);
  });

  it('CALCULATE_CROSS_RANKING runs without re-sending stores if stores already set', () => {
    const controller = new CrossRankingController();
    const signature = computeStoresSignature(stores);

    // Initial SET_STORES
    controller.handle({
      type: 'SET_STORES',
      signature,
      stores,
    });

    // Subsequent calculation request without stores payload
    const responses = controller.handle({
      type: 'CALCULATE_CROSS_RANKING',
      requestId: 11,
      targetDate,
      signature,
    });

    const resultResponse = responses.find((r) => r.type === 'RESULT');
    expect(resultResponse).toBeDefined();
    expect(resultResponse?.type).toBe('RESULT');
  });

  it('skips outdated CALCULATE_CROSS_RANKING request when newer requestId was registered', () => {
    const controller = new CrossRankingController();
    controller.setStores(stores);

    // Pre-register a newer request (e.g. requestId 20 arrived in worker message queue)
    controller.registerRequest({
      type: 'CALCULATE_CROSS_RANKING',
      requestId: 20,
      targetDate,
    });

    // An older request (requestId 15) starts processing
    const responses = controller.handle({
      type: 'CALCULATE_CROSS_RANKING',
      requestId: 15,
      targetDate,
    });

    // Older request should be skipped without calculating
    expect(responses).toHaveLength(0);

    // The newer request (requestId 20) processes successfully
    const newerResponses = controller.handle({
      type: 'CALCULATE_CROSS_RANKING',
      requestId: 20,
      targetDate,
    });
    expect(newerResponses.some((r) => r.type === 'RESULT')).toBe(true);
  });

  it('SCAN_CANDIDATE_DATES produces identical result to direct call and skips outdated requests', () => {
    const controller = new CrossRankingController();
    controller.setStores(stores);

    const testDates = [sampleRecords[10].date, sampleRecords[11].date];
    const scanResponses = controller.handle({
      type: 'SCAN_CANDIDATE_DATES',
      requestId: 100,
      dates: testDates,
      options: { topN: 5 },
    });

    const scanResult = scanResponses.find(
      (r): r is Extract<CrossRankingWorkerResponse, { type: 'SCAN_RESULT' }> =>
        r.type === 'SCAN_RESULT'
    );
    expect(scanResult).toBeDefined();
    expect(scanResult?.requestId).toBe(100);

    const expectedScan = scanCandidateDates(stores, testDates, { topN: 5 });
    expect(scanResult?.result).toEqual(expectedScan);

    // Register newer scan request 200
    controller.registerRequest({
      type: 'SCAN_CANDIDATE_DATES',
      requestId: 200,
      dates: testDates,
    });

    // Stale scan request 150 is skipped
    const staleResponses = controller.handle({
      type: 'SCAN_CANDIDATE_DATES',
      requestId: 150,
      dates: testDates,
    });
    expect(staleResponses).toHaveLength(0);
  });

  it('properly invokes emit callback during handle', () => {
    const controller = new CrossRankingController();
    controller.setStores(stores);

    const emitted: CrossRankingWorkerResponse[] = [];
    controller.handle(
      {
        type: 'CALCULATE_CROSS_RANKING',
        requestId: 50,
        targetDate,
      },
      (res) => emitted.push(res)
    );

    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.some((r) => r.type === 'PROGRESS')).toBe(true);
    expect(emitted.some((r) => r.type === 'RESULT')).toBe(true);
  });
});
