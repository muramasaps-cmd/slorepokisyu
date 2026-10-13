import { describe, it, expect, vi } from 'vitest';
import {
  exportAllStoresAsJson,
  parseStoresFromBackupJson,
  mergeImportedStores,
} from '../storeBackup';
import { StoreProfile, DailyRecord } from '../../data/types';

function createDummyRecord(date: string): DailyRecord {
  return {
    date,
    yearMonth: date.slice(0, 7),
    year: parseInt(date.slice(0, 4), 10),
    month: parseInt(date.slice(5, 7), 10),
    day: parseInt(date.slice(8, 10), 10),
    dayOfWeek: '月',
    avgDiffCoins: 120,
    avgGames: 5000,
    winRate: 55,
    winMachines: 55,
    totalMachines: 100,
    totalDiffCoins: 12000,
    hallCoinProfit: -12000,
    playerCoinProfit: 12000,
    hallYenProfit: -240000,
    playerYenProfit: 240000,
    inCoins: 1500000,
    outCoins: 1512000,
    payoutRate: 100.8,
    estimatedRevenue: 30000000,
    exchangeGapProfit: 15000,
    gModelHallProfit: 0,
    gModelPlayerProfit: 0,
    isOldEventDay: false,
    is7Day: false,
    notable: '',
  };
}

describe('storeBackup utils', () => {
  const sampleStore: StoreProfile = {
    id: 'store-1',
    name: 'マルハン新宿東宝ビル',
    address: '東京都新宿区歌舞伎町',
    exchangeRate: '46枚貸/52枚交換',
    oldEventDays: '7のつく日',
    rateLend: 46,
    rateExchange: 52,
    dataRange: '2024-01-01 ～ 2024-01-02',
    totalMachinesApprox: 300,
    dailyRecords: [createDummyRecord('2024-01-01'), createDummyRecord('2024-01-02')],
    customRankingWeights: {
      diffCoinDivisor: 25,
      winRateMultiplier: 0.8,
      allHighMultiplier: 6.0,
      matchingBlendWeight: 0.85,
      scaleFactorEnabled: true,
    },
  };

  describe('exportAllStoresAsJson', () => {
    it('throws error when stores array is empty', () => {
      expect(() => exportAllStoresAsJson([])).toThrow('エクスポートする店舗データが存在しません');
    });

    it('creates object URL, link and triggers download in browser DOM environment', () => {
      let createdBlob: Blob | null = null;
      let clicked = false;
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn((blob: Blob) => {
        createdBlob = blob;
        return 'blob:mock-url';
      });
      URL.revokeObjectURL = vi.fn();

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(() => {
          clicked = true;
        }),
      };

      const mockDoc = {
        createElement: vi.fn(() => mockAnchor),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      };

      const origDoc = (globalThis as any).document;
      const origWin = (globalThis as any).window;
      (globalThis as any).document = mockDoc;
      (globalThis as any).window = globalThis;

      try {
        exportAllStoresAsJson([sampleStore]);
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(mockAnchor.click).toHaveBeenCalled();
        expect(clicked).toBe(true);
        expect(createdBlob).not.toBeNull();
      } finally {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        (globalThis as any).document = origDoc;
        (globalThis as any).window = origWin;
      }
    });
  });

  describe('parseStoresFromBackupJson', () => {
    it('returns error when json string is empty', () => {
      const res = parseStoresFromBackupJson('');
      expect(res.success).toBe(false);
      expect(res.error).toContain('JSONファイルが空です');
    });

    it('returns error when JSON syntax is malformed', () => {
      const res = parseStoresFromBackupJson('{ bad json }');
      expect(res.success).toBe(false);
      expect(res.error).toContain('JSON解析エラー');
    });

    it('returns error when stores array is missing or empty', () => {
      const res = parseStoresFromBackupJson(JSON.stringify({ version: 2, stores: [] }));
      expect(res.success).toBe(false);
      expect(res.error).toContain('バックアップ内に店舗データが含まれていません');
    });

    it('correctly parses object format with stores property', () => {
      const jsonStr = JSON.stringify({
        version: 2,
        exportedAt: '2024-05-01T00:00:00.000Z',
        app: 'スロレポ店舗利益推移分析システム',
        storesCount: 1,
        stores: [sampleStore],
      });

      const res = parseStoresFromBackupJson(jsonStr);
      expect(res.success).toBe(true);
      expect(res.importedStores.length).toBe(1);
      expect(res.importedStores[0].name).toBe('マルハン新宿東宝ビル');
      expect(res.totalRecordsCount).toBe(2);
      expect(res.importedStores[0].customRankingWeights).toEqual(sampleStore.customRankingWeights);
    });

    it('correctly parses bare array format of StoreProfile[]', () => {
      const jsonStr = JSON.stringify([sampleStore]);
      const res = parseStoresFromBackupJson(jsonStr);
      expect(res.success).toBe(true);
      expect(res.importedStores.length).toBe(1);
      expect(res.importedStores[0].name).toBe('マルハン新宿東宝ビル');
      expect(res.totalRecordsCount).toBe(2);
    });
  });

  describe('mergeImportedStores', () => {
    it('appends new stores when id/name do not match', () => {
      const newStore: StoreProfile = {
        id: 'store-2',
        name: 'エスパス日拓秋葉原駅前',
        address: '東京都千代田区',
        exchangeRate: '46枚貸/52枚交換',
        oldEventDays: '8のつく日',
        rateLend: 46,
        rateExchange: 52,
        dataRange: '2024-02-01',
        totalMachinesApprox: 250,
        dailyRecords: [createDummyRecord('2024-02-01')],
      };

      const merged = mergeImportedStores([sampleStore], [newStore]);
      expect(merged.length).toBe(2);
      expect(merged.map((s) => s.id)).toEqual(['store-1', 'store-2']);
    });

    it('merges records into existing store when store name matches', () => {
      const updateStore: StoreProfile = {
        id: 'store-diff-id',
        name: '【特報】マルハン新宿東宝ビル店', // same store after normalization
        address: '東京都新宿区',
        exchangeRate: '46枚貸/52枚交換',
        oldEventDays: '7のつく日',
        rateLend: 46,
        rateExchange: 52,
        dataRange: '2024-01-03',
        totalMachinesApprox: 300,
        dailyRecords: [createDummyRecord('2024-01-03')],
      };

      const merged = mergeImportedStores([sampleStore], [updateStore]);
      expect(merged.length).toBe(1);
      expect(merged[0].id).toBe('store-1');
      expect(merged[0].dailyRecords.length).toBe(3);
      expect(merged[0].customRankingWeights).toEqual(sampleStore.customRankingWeights);
    });
  });
});
