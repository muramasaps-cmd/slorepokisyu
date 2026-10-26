import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConditionAnalysis } from '../ConditionAnalysis';
import {
  calculateAllStoresTotalConditionStats,
  calculateMultiStoreConditions,
  ALL_STORES_TOTAL_NAME,
  ALL_STORES_TOTAL_STORE_ID,
  FEW_DAYS_LABEL,
} from '../../utils/conditionAnalysis';
import {
  STORE_COLORS,
  getStoreColor,
  ALL_STORES_COLOR,
  ALL_STORES_ID,
  ALL_STORES_NAME,
} from '../../utils/storeColors';
import { DailyRecord, StoreProfile } from '../../data/types';
import { StoreCommonPeriod } from '../../utils/storeComparison';

function createMockStore(
  id: string,
  name: string,
  totalMachinesApprox: number,
  dailyRecords: DailyRecord[]
): StoreProfile {
  return {
    id,
    name,
    totalMachinesApprox,
    dailyRecords,
    address: '東京都',
    oldEventDays: '7のつく日',
    exchangeRate: '50枚/50枚',
    rateLend: 20,
    rateExchange: 20,
    dataRange: '2025-01',
  };
}

function createMockDailyRecord(
  date: string,
  dow: string,
  avgDiff: number,
  games = 5000,
  machines = 10,
  winMachines = 5
): DailyRecord {
  const day = parseInt(date.slice(8, 10), 10);
  const totalDiff = avgDiff * machines;
  const inCoins = games * 3 * machines;
  const outCoins = inCoins + totalDiff;
  const payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;

  return {
    date,
    yearMonth: date.slice(0, 7),
    year: parseInt(date.slice(0, 4), 10),
    month: parseInt(date.slice(5, 7), 10),
    day,
    dayOfWeek: dow,
    avgDiffCoins: avgDiff,
    avgGames: games,
    winRate: (winMachines / machines) * 100,
    winMachines,
    totalMachines: machines,
    totalDiffCoins: totalDiff,
    hallCoinProfit: -totalDiff,
    playerCoinProfit: totalDiff,
    hallYenProfit: -totalDiff * 20,
    playerYenProfit: totalDiff * 20,
    inCoins,
    outCoins,
    payoutRate,
    estimatedRevenue: 100000,
    exchangeGapProfit: 5000,
    gModelHallProfit: -totalDiff * 20,
    gModelPlayerProfit: totalDiff * 20,
    isOldEventDay: false,
    is7Day: day % 10 === 7,
    notable: '',
  };
}

describe('Prompt 51: 条件別の横断（全店合計の行と色の統一）', () => {
  // Test 1: Hand-calculated synthetic data verification
  describe('1. Hand-calculated synthetic data verification (手計算との一致)', () => {
    it('accurately calculates machine-day weighted avgDiffCoins, IN-weighted payoutRate, and win machines rate', () => {
      // Store 1: 10 machines, +200 diff, 6000 games, 6 wins on Monday
      // diff = +2000, IN = 180,000, OUT = 182,000
      const store1Records: DailyRecord[] = [
        createMockDailyRecord('2025-01-06', '月', 200, 6000, 10, 6),
      ];
      // Store 2: 20 machines, -100 diff, 3000 games, 8 wins on Monday
      // diff = -2000, IN = 180,000, OUT = 178,000
      const store2Records: DailyRecord[] = [
        createMockDailyRecord('2025-01-06', '月', -100, 3000, 20, 8),
      ];

      const store1 = createMockStore('store-1', '店舗1', 10, store1Records);
      const store2 = createMockStore('store-2', '店舗2', 20, store2Records);

      const rows = calculateMultiStoreConditions([store1, store2], 'dow');
      expect(rows.length).toBe(3); // Store 1, Store 2, and 全店合計

      const totalRow = rows.find((r) => r.isTotal);
      expect(totalRow).toBeDefined();
      expect(totalRow?.storeName).toBe(ALL_STORES_TOTAL_NAME);
      expect(totalRow?.storeId).toBe(ALL_STORES_TOTAL_STORE_ID);

      const monStat = totalRow?.stats.find((s) => s.key === '月');
      expect(monStat).toBeDefined();

      // Hand calculations:
      // Total Diff = +2000 + (-2000) = 0
      // Total Machine-Days = 10 + 20 = 30
      // avgDiffCoins = 0 / 30 = 0.0
      expect(monStat?.totalDiffCoins).toBe(0);
      expect(monStat?.totalMachines).toBe(30);
      expect(monStat?.avgDiffCoins).toBe(0);

      // IN-weighted payout rate:
      // Total IN = 180,000 + 180,000 = 360,000
      // Total OUT = 182,000 + 178,000 = 360,000
      // Payout Rate = 360,000 / 360,000 * 100 = 100.00%
      expect(monStat?.payoutRate).toBe(100);

      // Win machines rate:
      // Win machines = 6 + 8 = 14
      // Total machines = 30
      // Rate = 14 / 30 * 100 = 46.7%
      expect(monStat?.highPayoutRate).toBe(46.7);
    });

    it('verifies asymmetric IN weighting and machine-day weighting on Tuesday', () => {
      // Store 1: 10 machines, +300 diff, 5000 games -> diff = +3000, IN = 150,000, OUT = 153,000
      // Store 2: 30 machines, +100 diff, 7000 games -> diff = +3000, IN = 630,000, OUT = 633,000
      const store1 = createMockStore('s1', 'エスワン', 10, [
        createMockDailyRecord('2025-01-07', '火', 300, 5000, 10, 7),
      ]);
      const store2 = createMockStore('s2', 'エスツー', 30, [
        createMockDailyRecord('2025-01-07', '火', 100, 7000, 30, 18),
      ]);

      const rows = calculateMultiStoreConditions([store1, store2], 'dow');
      const totalRow = rows.find((r) => r.isTotal);
      const tueStat = totalRow?.stats.find((s) => s.key === '火');

      // Hand calculations:
      // Total Diff = 3000 + 3000 = 6000
      // Machine-Days = 10 + 30 = 40
      // Machine-day weighted avgDiff = 6000 / 40 = 150.0 (NOT simple avg (300+100)/2 = 200)
      expect(tueStat?.avgDiffCoins).toBe(150.0);
      expect(tueStat?.totalDiffCoins).toBe(6000);
      expect(tueStat?.totalMachines).toBe(40);

      // Total IN = 150,000 + 630,000 = 780,000
      // Total OUT = 153,000 + 633,000 = 786,000
      // IN-weighted payoutRate = (786,000 / 780,000) * 100 = 100.7692... -> 100.77%
      expect(tueStat?.payoutRate).toBe(100.77);

      // Win machines rate: (7 + 18) / 40 * 100 = 25 / 40 * 100 = 62.5%
      expect(tueStat?.highPayoutRate).toBe(62.5);
    });
  });

  // Test 2: Common period & few days annotation
  describe('2. Common period days & few days badge (共通期間の日数と日数少注記)', () => {
    it('displays target days for each store and dims cells with < 3 days with "日数少"', () => {
      // 2 stores with overlapping dates
      const store1 = createMockStore('store-a', '店A', 10, [
        createMockDailyRecord('2025-01-06', '月', 100, 5000, 10),
        createMockDailyRecord('2025-01-13', '月', 150, 5000, 10),
      ]); // Only 2 Mondays! (< 3 days threshold)

      const store2 = createMockStore('store-b', '店B', 10, [
        createMockDailyRecord('2025-01-06', '月', 50, 5000, 10),
        createMockDailyRecord('2025-01-13', '月', 80, 5000, 10),
        createMockDailyRecord('2025-01-20', '月', 90, 5000, 10),
      ]); // 3 Mondays

      const commonPeriod: StoreCommonPeriod = {
        startDate: '2025-01-06',
        endDate: '2025-01-15',
        commonDaysCount: 2,
        hasCommonPeriod: true,
      };

      const rows = calculateMultiStoreConditions([store1, store2], 'dow', {
        period: commonPeriod,
      });

      // Both stores should have totalDays = 2 in this common period
      expect(rows[0].totalDays).toBe(2);
      expect(rows[1].totalDays).toBe(2);

      // Render ConditionAnalysis in heatmap mode
      const html = renderToString(
        <ConditionAnalysis
          stores={[store1, store2]}
          period={commonPeriod}
          initialViewMode="heatmap"
        />
      );

      // Store A and Store B rendered with days count
      expect(html).toContain('店A');
      expect(html).toContain('店B');
      expect(html).toContain('(2日)');

      // Contains "全店合計" row
      expect(html).toContain(ALL_STORES_TOTAL_NAME);

      // Cell for Monday has 2 days (< 3 days), so it should contain "日数少"
      expect(html).toContain(FEW_DAYS_LABEL);
    });
  });

  // Test 3: Store colors consistency
  describe('3. Store colors consistency (店舗の色の一貫性)', () => {
    it('assigns consistent fixed colors matching STORE_COLORS and distinct ALL_STORES_COLOR', () => {
      const stores = [
        { id: 'store-alpha', name: 'Alpha' },
        { id: 'store-beta', name: 'Beta' },
        { id: 'store-gamma', name: 'Gamma' },
      ];

      // Alpha should get STORE_COLORS[0]
      expect(getStoreColor('store-alpha', stores)).toBe(STORE_COLORS[0]);
      expect(getStoreColor(0)).toBe(STORE_COLORS[0]);

      // Beta should get STORE_COLORS[1]
      expect(getStoreColor('store-beta', stores)).toBe(STORE_COLORS[1]);
      expect(getStoreColor(1)).toBe(STORE_COLORS[1]);

      // Gamma should get STORE_COLORS[2]
      expect(getStoreColor('store-gamma', stores)).toBe(STORE_COLORS[2]);
      expect(getStoreColor(2)).toBe(STORE_COLORS[2]);

      // All stores total should get ALL_STORES_COLOR
      expect(getStoreColor(ALL_STORES_ID)).toBe(ALL_STORES_COLOR);
      expect(getStoreColor(ALL_STORES_NAME)).toBe(ALL_STORES_COLOR);
    });
  });

  // Test 4: Multi-store UI components (Heatmap, Chart, Table with 全店合計)
  describe('4. Multi-store UI components (ヒートマップ・表・グラフに全店合計の行/系列)', () => {
    const storeA = createMockStore('store-1', 'メガA', 10, [
      createMockDailyRecord('2025-01-06', '月', 200, 6000, 10, 6),
      createMockDailyRecord('2025-01-07', '火', 100, 5000, 10, 5),
    ]);
    const storeB = createMockStore('store-2', 'ギガB', 20, [
      createMockDailyRecord('2025-01-06', '月', -100, 3000, 20, 8),
      createMockDailyRecord('2025-01-07', '火', 50, 4000, 20, 11),
    ]);

    it('renders "全店合計" row in Heatmap view', () => {
      const html = renderToString(
        <ConditionAnalysis
          stores={[storeA, storeB]}
          initialViewMode="heatmap"
        />
      );

      expect(html).toContain('メガA');
      expect(html).toContain('ギガB');
      expect(html).toContain(ALL_STORES_TOTAL_NAME);
    });

    it('renders "全店横断比較" and "全店合計" buttons in Chart view', () => {
      const html = renderToString(
        <ConditionAnalysis
          stores={[storeA, storeB]}
          initialViewMode="chart"
        />
      );

      expect(html).toContain('全店横断比較 (全店合計 系列)');
      expect(html).toContain('全店合計 単体詳細');
      expect(html).toContain('メガA');
      expect(html).toContain('ギガB');
    });

    it('renders "全店合計" switch button and summary tfoot in Table view', () => {
      const html = renderToString(
        <ConditionAnalysis
          stores={[storeA, storeB]}
          initialViewMode="table"
        />
      );

      expect(html).toContain('全店合計');
      expect(html).toContain('メガA');
      expect(html).toContain('ギガB');
      expect(html).toContain('全店・全条件 合計／加重平均');
    });
  });

  // Test 5: Single-store compatibility
  describe('5. Single store compatibility (1店舗のときの表示が変わらない)', () => {
    it('does not render multi-store switches or total rows when only 1 store is provided', () => {
      const singleStore = createMockStore('store-single', '単独店舗', 10, [
        createMockDailyRecord('2025-01-06', '月', 120, 5000, 10, 6),
      ]);

      const html = renderToString(
        <ConditionAnalysis
          stores={[singleStore]}
          currentStoreName="単独店舗"
          initialViewMode="heatmap"
        />
      );

      // Should not contain 全店合計 row
      expect(html).not.toContain(ALL_STORES_TOTAL_NAME);
      // Should not contain multi-store switches
      expect(html).not.toContain('全店横断比較');
      expect(html).toContain('単独店舗');
    });
  });
});
