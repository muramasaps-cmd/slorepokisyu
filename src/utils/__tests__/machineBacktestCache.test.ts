import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computeMachineBacktestCacheKey,
  getMemoryBacktestCache,
  setMemoryBacktestCache,
  clearMemoryBacktestCache,
  getBacktestFromIdb,
  putBacktestToIdb,
  clearBacktestCacheIdb,
  BACKTEST_CACHE_VERSION,
  setBacktestCacheVersion,
  MAX_CACHE_ENTRIES_PER_STORE,
  MAX_CACHE_ENTRIES_TOTAL,
  CachedBacktestEntry,
} from '../machineBacktestCache';
import { DailyRecord, DailyMachineRecord, MachineRankingWeights, SpecialDayRules } from '../../data/types';
import { MachineBacktestOptions, MachineBacktestResult } from '../backtestEngine';

function createSampleRecords(): DailyRecord[] {
  const machinesDay1: DailyMachineRecord[] = [
    {
      machineNum: 101,
      modelName: 'マイジャグラーV',
      games: 5000,
      diff: 1000,
      bb: 20,
      rb: 18,
      payoutRate: 106.7,
      tailDigit: 1,
      isZoro: false,
    },
    {
      machineNum: 102,
      modelName: 'パチスロ北斗の拳',
      games: 4500,
      diff: -500,
      bb: 12,
      rb: 10,
      payoutRate: 96.3,
      tailDigit: 2,
      isZoro: false,
    },
  ];

  const machinesDay2: DailyMachineRecord[] = [
    {
      machineNum: 101,
      modelName: 'マイジャグラーV',
      games: 6000,
      diff: 1500,
      bb: 25,
      rb: 22,
      payoutRate: 108.3,
      tailDigit: 1,
      isZoro: false,
    },
    {
      machineNum: 102,
      modelName: 'パチスロ北斗の拳',
      games: 3000,
      diff: -200,
      bb: 8,
      rb: 7,
      payoutRate: 97.8,
      tailDigit: 2,
      isZoro: false,
    },
  ];

  return [
    {
      date: '2025-01-01',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 1,
      dayOfWeek: '水',
      avgDiffCoins: 250,
      avgGames: 4750,
      winRate: 50,
      winMachines: 1,
      totalMachines: 2,
      totalDiffCoins: 500,
      hallCoinProfit: -500,
      playerCoinProfit: 500,
      hallYenProfit: -10000,
      playerYenProfit: 10000,
      inCoins: 28500,
      outCoins: 29000,
      payoutRate: 101.7,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: 0,
      gModelPlayerProfit: 0,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      isReusedMachines: false,
      machines: machinesDay1,
    },
    {
      date: '2025-01-02',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 2,
      dayOfWeek: '木',
      avgDiffCoins: 650,
      avgGames: 4500,
      winRate: 50,
      winMachines: 1,
      totalMachines: 2,
      totalDiffCoins: 1300,
      hallCoinProfit: -1300,
      playerCoinProfit: 1300,
      hallYenProfit: -26000,
      playerYenProfit: 26000,
      inCoins: 27000,
      outCoins: 28300,
      payoutRate: 104.8,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: 0,
      gModelPlayerProfit: 0,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      isReusedMachines: false,
      machines: machinesDay2,
    },
  ];
}

const defaultWeights: MachineRankingWeights = {
  diffWeight: 0.04,
  winRateWeight: 0.3,
  highSettingWeight: 20.0,
  modelScoreWeight: 0.25,
  tailMatchBonus: 8.0,
  zoroBonus: 4.0,
  recentStateWeight: 0,
  shrinkageK: 3,
};

const defaultRules: SpecialDayRules = {
  tails: [7],
  monthDayZoro: true,
};

const defaultOptions: MachineBacktestOptions = {
  topN: 10,
  minEvidenceDays: 3,
  blockLength: 7,
  bootstrapIterations: 500,
};

describe('machineBacktestCache Key Sensitivity & Determinism', () => {
  beforeEach(() => {
    setBacktestCacheVersion(1);
    clearMemoryBacktestCache();
  });

  it('Requirement 6: returns identical cache key for identical inputs', () => {
    const data1 = createSampleRecords();
    const data2 = createSampleRecords();

    const key1 = computeMachineBacktestCacheKey('storeA', data1, defaultWeights, defaultRules, defaultOptions);
    const key2 = computeMachineBacktestCacheKey('storeA', data2, defaultWeights, defaultRules, defaultOptions);

    expect(key1).toBe(key2);
  });

  it('Requirement 6: modifying ONLY modelName of 1 machine changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].machines![0].modelName = 'アイムジャグラーEX';

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('Requirement 6: modifying ONLY games (G数) of 1 machine changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].machines![0].games = 5001;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('Requirement 6: modifying ONLY bb (BB回数) of 1 machine changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].machines![0].bb = 21;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('Requirement 6: swapping diff between 2 machines (identical total diff) changes the key', () => {
    const baseData = createSampleRecords();
    // In day 1: machine 101 diff=1000, machine 102 diff=-500. Total = 500
    const swappedData = createSampleRecords();
    // Swap diff: machine 101 diff=-500, machine 102 diff=1000. Total = 500 (sum is exactly identical!)
    swappedData[0].machines![0].diff = -500;
    swappedData[0].machines![1].diff = 1000;

    expect(baseData[0].totalDiffCoins).toBe(swappedData[0].totalDiffCoins);

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const swappedKey = computeMachineBacktestCacheKey('storeA', swappedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(swappedKey);
  });

  it('Requirement 6: modifying ONLY a single date changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].date = '2025-01-03';

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('modifying rb of 1 machine changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].machines![0].rb = 19;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('modifying payoutRate of 1 machine changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].machines![0].payoutRate = 107.5;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('modifying tailDigit or isZoro of 1 machine changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].machines![0].tailDigit = 5;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('modifying isReusedMachines changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].isReusedMachines = true;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('modifying special day attributes (isOldEventDay, is7Day, notable) changes the key', () => {
    const baseData = createSampleRecords();
    const modifiedData = createSampleRecords();
    modifiedData[0].isOldEventDay = true;

    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const modKey = computeMachineBacktestCacheKey('storeA', modifiedData, defaultWeights, defaultRules, defaultOptions);

    expect(baseKey).not.toBe(modKey);
  });

  it('modifying aliasDictionary changes the key', () => {
    const baseData = createSampleRecords();

    const keyWithoutAlias = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);
    const keyWithAlias = computeMachineBacktestCacheKey(
      'storeA',
      baseData,
      defaultWeights,
      defaultRules,
      defaultOptions,
      { '北斗': 'パチスロ北斗の拳' }
    );

    expect(keyWithoutAlias).not.toBe(keyWithAlias);
  });

  it('modifying includeReusedMachines changes the key', () => {
    const baseData = createSampleRecords();

    const keyFalse = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions, {}, false);
    const keyTrue = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions, {}, true);

    expect(keyFalse).not.toBe(keyTrue);
  });

  it('modifying weights or specialDayRules or options changes the key', () => {
    const baseData = createSampleRecords();
    const baseKey = computeMachineBacktestCacheKey('storeA', baseData, defaultWeights, defaultRules, defaultOptions);

    const changedWeightsKey = computeMachineBacktestCacheKey(
      'storeA',
      baseData,
      { ...defaultWeights, diffWeight: 0.1 },
      defaultRules,
      defaultOptions
    );
    expect(baseKey).not.toBe(changedWeightsKey);

    const changedRulesKey = computeMachineBacktestCacheKey(
      'storeA',
      baseData,
      defaultWeights,
      { ...defaultRules, tails: [3] },
      defaultOptions
    );
    expect(baseKey).not.toBe(changedRulesKey);

    const changedOptsKey = computeMachineBacktestCacheKey(
      'storeA',
      baseData,
      defaultWeights,
      defaultRules,
      { ...defaultOptions, topN: 5 }
    );
    expect(baseKey).not.toBe(changedOptsKey);
  });
});

describe('machineBacktestCache Versioning & Memory Cache', () => {
  beforeEach(() => {
    setBacktestCacheVersion(1);
    clearMemoryBacktestCache();
  });

  it('changing BACKTEST_CACHE_VERSION produces different keys and ignores stale memory cache', () => {
    const data = createSampleRecords();
    const mockResult = {
      evaluatedDaysCount: 5,
      topN: 10,
      minEvidenceThreshold: 3,
      withFilter: {} as any,
      withoutFilter: {} as any,
    };

    const keyV1 = computeMachineBacktestCacheKey('storeA', data, defaultWeights, defaultRules, defaultOptions);
    setMemoryBacktestCache(keyV1, mockResult);

    expect(getMemoryBacktestCache(keyV1)).toBe(mockResult);

    // Bump version to 2
    setBacktestCacheVersion(2);
    const keyV2 = computeMachineBacktestCacheKey('storeA', data, defaultWeights, defaultRules, defaultOptions);
    expect(keyV1).not.toBe(keyV2);

    // Old v1 cache key is discarded when queried in version 2
    expect(getMemoryBacktestCache(keyV1)).toBeUndefined();
    expect(getMemoryBacktestCache(keyV2)).toBeUndefined();
  });
});

describe('machineBacktestCache IndexedDB Persistence & Eviction', () => {
  let mockStoreData: Map<string, CachedBacktestEntry>;
  const originalIndexedDb = typeof window !== 'undefined' ? (window as any).indexedDB : undefined;

  beforeEach(() => {
    mockStoreData = new Map<string, CachedBacktestEntry>();
    setBacktestCacheVersion(1);

    const mockDb = {
      objectStoreNames: { contains: () => true },
      transaction: () => {
        const tx: any = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore: () => ({
            indexNames: { contains: () => true },
            createIndex: () => {},
            get: (key: string) => {
              const req: any = { onsuccess: null, onerror: null, result: mockStoreData.get(key) };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                queueMicrotask(() => {
                  if (tx.oncomplete) tx.oncomplete();
                });
              });
              return req;
            },
            getAll: () => {
              const req: any = { onsuccess: null, onerror: null, result: Array.from(mockStoreData.values()) };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                queueMicrotask(() => {
                  if (tx.oncomplete) tx.oncomplete();
                });
              });
              return req;
            },
            put: (entry: CachedBacktestEntry) => {
              mockStoreData.set(entry.key, entry);
              const req: any = { onsuccess: null, onerror: null };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
              });
              return req;
            },
            delete: (key: string) => {
              mockStoreData.delete(key);
              const req: any = { onsuccess: null, onerror: null };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
              });
              return req;
            },
            clear: () => {
              mockStoreData.clear();
              const req: any = { onsuccess: null, onerror: null };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
              });
              return req;
            },
          }),
        };
        return tx;
      },
    };

    const mockFactory = {
      open: () => {
        const req: any = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          result: mockDb,
        };
        queueMicrotask(() => {
          if (req.onupgradeneeded) {
            req.onupgradeneeded({
              target: {
                result: mockDb,
                transaction: mockDb.transaction(),
              },
            });
          }
          if (req.onsuccess) {
            req.onsuccess({ target: req });
          }
        });
        return req;
      },
    };

    if (typeof window === 'undefined') {
      (globalThis as any).window = { indexedDB: mockFactory };
    } else {
      (window as any).indexedDB = mockFactory;
    }
  });

  afterEach(() => {
    setBacktestCacheVersion(1);
    if (originalIndexedDb) {
      (window as any).indexedDB = originalIndexedDb;
    }
  });

  it('stores and retrieves cache from IndexedDB with matching version', async () => {
    const data = createSampleRecords();
    const key = computeMachineBacktestCacheKey('storeA', data, defaultWeights, defaultRules, defaultOptions);
    const mockResult = {
      evaluatedDaysCount: 10,
      topN: 10,
      minEvidenceThreshold: 3,
      withFilter: {} as any,
      withoutFilter: {} as any,
    };

    await putBacktestToIdb(key, mockResult, 'storeA');
    const cached = await getBacktestFromIdb(key);

    expect(cached).not.toBeNull();
    expect(cached?.evaluatedDaysCount).toBe(10);
  });

  it('Requirement 4 & 6: discards and deletes from IDB when BACKTEST_CACHE_VERSION changes', async () => {
    const data = createSampleRecords();
    const keyV1 = computeMachineBacktestCacheKey('storeA', data, defaultWeights, defaultRules, defaultOptions);
    const mockResult = {
      evaluatedDaysCount: 10,
      topN: 10,
      minEvidenceThreshold: 3,
      withFilter: {} as any,
      withoutFilter: {} as any,
    };

    // Stored with v1
    await putBacktestToIdb(keyV1, mockResult, 'storeA');
    expect(mockStoreData.has(keyV1)).toBe(true);

    // Bump version to 2
    setBacktestCacheVersion(2);

    // Querying with the old key returns null and deletes the old key from IDB
    const cachedOld = await getBacktestFromIdb(keyV1);
    expect(cachedOld).toBeNull();
    expect(mockStoreData.has(keyV1)).toBe(false); // Deleted from IDB!
  });

  it('Requirement 5: enforces per-store limit (MAX_CACHE_ENTRIES_PER_STORE=20), evicting oldest savedAt', async () => {
    const mockResult = {
      evaluatedDaysCount: 5,
      topN: 10,
      minEvidenceThreshold: 3,
      withFilter: {} as any,
      withoutFilter: {} as any,
    };

    // Put 25 entries for storeA with sequential savedAt timestamps
    for (let i = 1; i <= 25; i++) {
      const key = `bt_v1__storeA__entry_${i}`;
      // Simulate increasing savedAt
      const entry: CachedBacktestEntry = {
        key,
        result: mockResult,
        savedAt: 1000 + i,
        version: 1,
        storeId: 'storeA',
      };
      mockStoreData.set(key, entry);
    }

    expect(mockStoreData.size).toBe(25);

    // Putting a new entry triggers eviction of oldest entries for storeA
    const newKey = `bt_v1__storeA__entry_26`;
    await putBacktestToIdb(newKey, mockResult, 'storeA');

    // Store count should now be capped at MAX_CACHE_ENTRIES_PER_STORE (20)
    expect(mockStoreData.size).toBe(MAX_CACHE_ENTRIES_PER_STORE);

    // The oldest entries (entry_1 through entry_6) must have been deleted
    expect(mockStoreData.has('bt_v1__storeA__entry_1')).toBe(false);
    expect(mockStoreData.has('bt_v1__storeA__entry_5')).toBe(false);
    expect(mockStoreData.has('bt_v1__storeA__entry_6')).toBe(false);

    // The newest entries must remain intact
    expect(mockStoreData.has('bt_v1__storeA__entry_25')).toBe(true);
    expect(mockStoreData.has('bt_v1__storeA__entry_26')).toBe(true);
  });

  it('Requirement 5: enforces global limit (MAX_CACHE_ENTRIES_TOTAL=100) across all stores', async () => {
    const mockResult = {
      evaluatedDaysCount: 5,
      topN: 10,
      minEvidenceThreshold: 3,
      withFilter: {} as any,
      withoutFilter: {} as any,
    };

    // Populate 105 entries across 10 stores (each store having ~10 entries, so per-store limit of 20 isn't triggered)
    for (let i = 1; i <= 105; i++) {
      const storeId = `store_${i % 10}`;
      const key = `bt_v1__${storeId}__entry_${i}`;
      const entry: CachedBacktestEntry = {
        key,
        result: mockResult,
        savedAt: 1000 + i,
        version: 1,
        storeId,
      };
      mockStoreData.set(key, entry);
    }

    expect(mockStoreData.size).toBe(105);

    // Putting another entry triggers total limit check
    const newKey = `bt_v1__store_0__entry_106`;
    await putBacktestToIdb(newKey, mockResult, 'store_0');

    // Total size should be capped at MAX_CACHE_ENTRIES_TOTAL (100)
    expect(mockStoreData.size).toBe(MAX_CACHE_ENTRIES_TOTAL);

    // The oldest global entries should have been evicted
    expect(mockStoreData.has('bt_v1__store_1__entry_1')).toBe(false);
    expect(mockStoreData.has('bt_v1__store_0__entry_106')).toBe(true);
  });
});
