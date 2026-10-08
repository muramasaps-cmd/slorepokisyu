import { describe, it, expect } from 'vitest';
import { normalizeStoreNameKey, areStoresSame, mergeDailyRecords } from '../storeStorage';
import { DailyRecord, DailyMachineRecord, DailyModelRecord, StoreProfile } from '../../data/types';

function createDummyRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    yearMonth: date.slice(0, 7),
    year: parseInt(date.slice(0, 4), 10),
    month: parseInt(date.slice(5, 7), 10),
    day: parseInt(date.slice(8, 10), 10),
    dayOfWeek: '月',
    avgDiffCoins: 0,
    avgGames: 0,
    winRate: 50,
    winMachines: 50,
    totalMachines: 100,
    totalDiffCoins: 0,
    hallCoinProfit: 0,
    playerCoinProfit: 0,
    hallYenProfit: 0,
    playerYenProfit: 0,
    inCoins: 0,
    outCoins: 0,
    payoutRate: 100,
    estimatedRevenue: 0,
    exchangeGapProfit: 0,
    gModelHallProfit: 0,
    gModelPlayerProfit: 0,
    isOldEventDay: false,
    is7Day: false,
    notable: '',
    ...overrides,
  };
}

describe('storeStorage utils', () => {
  describe('normalizeStoreNameKey', () => {
    it('normalizes fullwidth characters, spaces, and punctuation', () => {
      expect(normalizeStoreNameKey('マルハン　新宿東宝ビル店')).toBe('マルハン新宿東宝ビル');
      expect(normalizeStoreNameKey('エスパス日拓１号館')).toBe('エスパス日拓1号館');
    });

    it('strips brackets, dates, days of week, and trailing 店', () => {
      const raw = '【特報】アイランド秋葉原店 (2024年1月15日) (月)';
      expect(normalizeStoreNameKey(raw)).toBe('アイランド秋葉原');
    });

    it('preserves distinct hall numbers so different halls are never merged', () => {
      const hall1 = normalizeStoreNameKey('マルハンメガシティ2000 蒲田1');
      const hall7 = normalizeStoreNameKey('マルハンメガシティ2000 蒲田7');
      expect(hall1).not.toBe(hall7);
      expect(hall1).toContain('蒲田1');
      expect(hall7).toContain('蒲田7');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeStoreNameKey('')).toBe('');
    });
  });

  describe('areStoresSame', () => {
    it('identifies identical stores despite decoration and date noise', () => {
      const nameA = '【秋葉原】エスパス日拓秋葉原駅前店 (2024/05/01)';
      const nameB = 'エスパス日拓秋葉原駅前';
      expect(areStoresSame(nameA, nameB)).toBe(true);
    });

    it('distinguishes different hall numbers of the same chain', () => {
      expect(areStoresSame('マルハン蒲田1号館店', 'マルハン蒲田7号館店')).toBe(false);
    });

    it('returns false when either name is empty', () => {
      expect(areStoresSame('', 'アイランド秋葉原')).toBe(false);
      expect(areStoresSame('アイランド秋葉原', '')).toBe(false);
    });
  });

  describe('mergeDailyRecords with quality score ranking', () => {
    it('merges records from different dates sorted chronologically', () => {
      const recordsA = [createDummyRecord('2024-01-05'), createDummyRecord('2024-01-01')];
      const recordsB = [createDummyRecord('2024-01-03')];

      const merged = mergeDailyRecords(recordsA, recordsB);
      expect(merged.length).toBe(3);
      expect(merged.map((r) => r.date)).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    });

    it('replaces low quality record with high quality record on date collision', () => {
      // Low quality record (no detailed machines, no models)
      const lowQuality = createDummyRecord('2024-01-07', {
        totalMachines: 0,
        winMachines: null,
        models: [],
        machines: [],
      });

      // High quality record (has machines, models, notable)
      const machineRecord: DailyMachineRecord = {
        machineNum: 101,
        modelName: 'マイジャグラーV',
        games: 5000,
        diff: 1200,
      };
      const modelRecord: DailyModelRecord = {
        modelName: 'マイジャグラーV',
        avgDiffCoins: 1200,
        totalDiffCoins: 1200,
        avgGames: 5000,
        winRate: 100,
        winMachines: 1,
        totalMachines: 1,
      };

      const highQuality = createDummyRecord('2024-01-07', {
        totalMachines: 150,
        winMachines: 75,
        models: [modelRecord],
        machines: [machineRecord],
        notable: '7のつく日特日',
      });

      const merged = mergeDailyRecords([lowQuality], [highQuality]);
      expect(merged.length).toBe(1);
      expect(merged[0].totalMachines).toBe(150);
      expect(merged[0].models?.length).toBe(1);
      expect(merged[0].machines?.length).toBe(1);
      expect(merged[0].notable).toBe('7のつく日特日');
    });

    it('retains machine level data when merging across records', () => {
      const machineRecord: DailyMachineRecord = {
        machineNum: 501,
        modelName: '北斗の拳',
        games: 7000,
        diff: 3000,
      };

      // Record 1 has machines detail but fewer total models
      const withMachines = createDummyRecord('2024-01-10', {
        machines: [machineRecord],
        models: [],
      });

      // Record 2 has many models but lacks machine detail
      const withModels = createDummyRecord('2024-01-10', {
        machines: [],
        models: [
          {
            modelName: '北斗の拳',
            avgDiffCoins: 1500,
            totalDiffCoins: 6000,
            avgGames: 6500,
            winRate: 75,
            winMachines: 3,
            totalMachines: 4,
          },
        ],
      });

      const merged = mergeDailyRecords([withMachines], [withModels]);
      expect(merged.length).toBe(1);
      // Because withMachines had machines (weight 20) vs withModels (weight 10),
      // the machine detail is preserved
      expect(merged[0].machines?.length).toBe(1);
    });
  });

  describe('customRankingWeights preservation in upsertStore', () => {
    it('preserves existing customRankingWeights when new store data does not specify customRankingWeights', async () => {
      const storageMap = new Map<string, string>();
      const mockStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, v),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
        length: 0,
        key: () => null,
      };
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockStorage,
        configurable: true,
        writable: true,
      });

      const { upsertStore, getSavedStores, resetAllStores } = await import('../storeStorage');
      resetAllStores();

      const initialStore = {
        id: 'test-store-weights',
        name: 'テスト店舗',
        address: '東京都',
        exchangeRate: '46枚貸/52枚交換',
        oldEventDays: '7のつく日',
        rateLend: 46,
        rateExchange: 52,
        dataRange: '2024-01-01',
        totalMachinesApprox: 200,
        dailyRecords: [createDummyRecord('2024-01-01')],
        customRankingWeights: {
          diffCoinDivisor: 25,
          winRateMultiplier: 0.8,
          allHighMultiplier: 6.0,
          matchingBlendWeight: 0.85,
          scaleFactorEnabled: true,
        },
      };

      upsertStore(initialStore);
      let stores = getSavedStores();
      expect(stores[0].customRankingWeights).toEqual(initialStore.customRankingWeights);

      // Now update store with new daily record, without providing customRankingWeights property
      const storeUpdate = {
        id: 'test-store-weights',
        name: 'テスト店舗',
        address: '東京都',
        exchangeRate: '46枚貸/52枚交換',
        oldEventDays: '7のつく日',
        rateLend: 46,
        rateExchange: 52,
        dataRange: '2024-01-01 - 2024-01-02',
        totalMachinesApprox: 200,
        dailyRecords: [createDummyRecord('2024-01-02')],
      };

      upsertStore(storeUpdate);
      stores = getSavedStores();
      expect(stores.length).toBe(1);
      // customRankingWeights must NOT be lost!
      expect(stores[0].customRankingWeights).toEqual(initialStore.customRankingWeights);
      expect(stores[0].dailyRecords.length).toBe(2);

      resetAllStores();
    });

    it('updates store name and islandConfig when store with same id is upserted', async () => {
      const storageMap = new Map<string, string>();
      const mockStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, v),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
        length: 0,
        key: () => null,
      };
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockStorage,
        configurable: true,
        writable: true,
      });

      const { upsertStore, getSavedStores, resetAllStores } = await import('../storeStorage');
      resetAllStores();

      const initialStore: StoreProfile = {
        id: 'test-store-rename',
        name: '変更前店舗名',
        address: '東京都新宿区',
        exchangeRate: '46枚貸/52枚交換',
        oldEventDays: '7のつく日',
        rateLend: 46,
        rateExchange: 52,
        dataRange: '2024-01-01',
        totalMachinesApprox: 300,
        islandConfig: 'A島: 101-120',
        dailyRecords: [createDummyRecord('2024-01-01')],
      };

      upsertStore(initialStore);
      let stores = getSavedStores();
      expect(stores[0].name).toBe('変更前店舗名');
      expect(stores[0].islandConfig).toBe('A島: 101-120');

      // Update name and islandConfig
      const updatedStore: StoreProfile = {
        ...initialStore,
        name: '変更後店舗名（新装）',
        islandConfig: 'A島: 101-120, B島: 121-140',
      };

      upsertStore(updatedStore);
      stores = getSavedStores();
      expect(stores.length).toBe(1);
      expect(stores[0].name).toBe('変更後店舗名（新装）');
      expect(stores[0].islandConfig).toBe('A島: 101-120, B島: 121-140');

      resetAllStores();
    });
  });
});
