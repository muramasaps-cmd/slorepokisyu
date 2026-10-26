import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AnalysisScopeBar } from '../AnalysisScopeBar';
import { ConditionAnalysis } from '../ConditionAnalysis';
import App, { parseHash } from '../../App';
import { StoreProfile, DailyRecord } from '../../data/types';

// Mock localStorage for node environment
const storeMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storeMap.get(key) ?? null,
  setItem: (key: string, val: string) => storeMap.set(key, String(val)),
  removeItem: (key: string) => storeMap.delete(key),
  clear: () => storeMap.clear(),
  length: 0,
  key: () => null,
};
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function createSampleStore(id: string, name: string): StoreProfile {
  const dailyRecords: DailyRecord[] = [
    {
      date: '2025-01-07',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 7,
      dayOfWeek: '火',
      avgDiffCoins: 250,
      avgGames: 6000,
      winRate: 60,
      winMachines: 6,
      totalMachines: 10,
      totalDiffCoins: 2500,
      hallCoinProfit: -2500,
      playerCoinProfit: 2500,
      hallYenProfit: -50000,
      playerYenProfit: 50000,
      inCoins: 180000,
      outCoins: 182500,
      payoutRate: 101.4,
      estimatedRevenue: 100000,
      exchangeGapProfit: 5000,
      gModelHallProfit: -50000,
      gModelPlayerProfit: 50000,
      isOldEventDay: true,
      is7Day: true,
      notable: '',
    },
    {
      date: '2025-01-11',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 11,
      dayOfWeek: '土',
      avgDiffCoins: 120,
      avgGames: 5500,
      winRate: 50,
      winMachines: 5,
      totalMachines: 10,
      totalDiffCoins: 1200,
      hallCoinProfit: -1200,
      playerCoinProfit: 1200,
      hallYenProfit: -24000,
      playerYenProfit: 24000,
      inCoins: 165000,
      outCoins: 166200,
      payoutRate: 100.7,
      estimatedRevenue: 90000,
      exchangeGapProfit: 4000,
      gModelHallProfit: -24000,
      gModelPlayerProfit: 24000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
    },
  ];

  return {
    id,
    name,
    address: '東京都',
    oldEventDays: '7のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 10,
    dataRange: '2025-01',
    dailyRecords,
  };
}

describe('Prompt 50: 分析の対象店舗スイッチ (AnalysisScopeBar & Integration)', () => {
  const storeA = createSampleStore('store-a', 'マルハン新宿店');
  const storeB = createSampleStore('store-b', 'エスパス秋葉原本館');
  const storeC = createSampleStore('store-c', 'アイランド秋葉原店');
  const multipleStores = [storeA, storeB, storeC];

  // 1. スイッチの切替でURLが変わること (Hash formatting & parseHash)
  describe('1. スイッチの切替とURLパラメータ', () => {
    it('parses scope=all, period=common, and stores parameter correctly from URL hash', () => {
      const parsed = parseHash('#analysis/conditions?scope=all&period=common&stores=store-a,store-b');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('conditions');
      expect(parsed.analysisScope).toBe('all');
      expect(parsed.analysisPeriod).toBe('common');
      expect(parsed.analysisStores).toEqual(['store-a', 'store-b']);
    });

    it('parses custom scope with multiple stores', () => {
      const parsed = parseHash('#analysis/models?scope=custom&period=all&stores=store-b,store-c');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('models');
      expect(parsed.analysisScope).toBe('custom');
      expect(parsed.analysisPeriod).toBe('all');
      expect(parsed.analysisStores).toEqual(['store-b', 'store-c']);
    });

    it('parses scope=store from URL hash', () => {
      const parsed = parseHash('#analysis/conditions?scope=store');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('conditions');
      expect(parsed.analysisScope).toBe('store');
    });
  });

  // 2. 旧URLの互換 (scope=この店 として動く)
  describe('2. 旧URLとの互換性', () => {
    it('defaults to scope="store" when scope parameter is missing in #analysis/conditions', () => {
      const parsed = parseHash('#analysis/conditions');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('conditions');
      expect(parsed.analysisScope).toBe('store');
      expect(parsed.analysisPeriod).toBe('common');
    });

    it('defaults to scope="store" for bare #analysis', () => {
      const parsed = parseHash('#analysis');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.analysisScope).toBe('store');
    });

    it('defaults to scope="store" for legacy #trends, #conditions, and #high_payout', () => {
      const parsedTrends = parseHash('#trends');
      expect(parsedTrends.tab).toBe('analysis');
      expect(parsedTrends.subTab).toBe('conditions');
      expect(parsedTrends.analysisScope).toBe('store');

      const parsedPayout = parseHash('#high_payout');
      expect(parsedPayout.tab).toBe('analysis');
      expect(parsedPayout.subTab).toBe('high_payout');
      expect(parsedPayout.analysisScope).toBe('store');
    });
  });

  // 3. 店舗が1つのとき非表示
  describe('3. 店舗が1つしか取り込まれていないときの挙動', () => {
    it('returns null and does not render anything when stores array has only 1 store', () => {
      const singleStore = [storeA];
      const html = renderToString(
        <AnalysisScopeBar
          stores={singleStore}
          currentStore={storeA}
          scope="store"
          onScopeChange={vi.fn()}
          selectedStoreIds={[storeA.id]}
          onToggleStoreId={vi.fn()}
          periodMode="common"
          onPeriodModeChange={vi.fn()}
        />
      );
      expect(html).toBe('');
    });

    it('returns null when stores array is empty', () => {
      const html = renderToString(
        <AnalysisScopeBar
          stores={[]}
          currentStore={storeA}
          scope="store"
          onScopeChange={vi.fn()}
          selectedStoreIds={[]}
          onToggleStoreId={vi.fn()}
          periodMode="common"
          onPeriodModeChange={vi.fn()}
        />
      );
      expect(html).toBe('');
    });

    it('renders the scope bar when multiple stores are available', () => {
      const html = renderToString(
        <AnalysisScopeBar
          stores={multipleStores}
          currentStore={storeA}
          scope="store"
          onScopeChange={vi.fn()}
          selectedStoreIds={[storeA.id, storeB.id]}
          onToggleStoreId={vi.fn()}
          periodMode="common"
          onPeriodModeChange={vi.fn()}
        />
      );
      expect(html).toContain('対象店舗:');
      expect(html).toContain('この店');
      expect(html).toContain('店舗を選ぶ');
      expect(html).toContain('全店');
      expect(html).toContain('3店');
      expect(html).toContain('集計期間:');
      expect(html).toContain('共通期間');
      expect(html).toContain('全期間');
    });
  });

  // 4. 条件別で、複数店舗の行が出ること
  describe('4. ConditionAnalysis での複数店舗の行表示', () => {
    it('renders each store as a table row when stores prop is provided with multiple stores', () => {
      const html = renderToString(
        <ConditionAnalysis
          stores={multipleStores}
          currentStoreName={storeA.name}
          initialDimension="dow"
          initialViewMode="heatmap"
          perspective="player"
        />
      );

      // Verify that store names appear as row headers
      expect(html).toContain('マルハン新宿店');
      expect(html).toContain('エスパス秋葉原本館');
      expect(html).toContain('アイランド秋葉原店');
    });

    it('renders single store view (without store list table) when scope="store" (stores is undefined)', () => {
      const html = renderToString(
        <ConditionAnalysis
          dailyRecords={storeA.dailyRecords}
          currentStoreName={storeA.name}
          initialDimension="dow"
          initialViewMode="heatmap"
          perspective="player"
        />
      );

      // In single store mode, stores prop is not passed, and single store stat is rendered
      expect(html).toContain('月曜日');
      expect(html).toContain('火曜日');
      // Store B and C names should NOT appear in single store mode
      expect(html).not.toContain('エスパス秋葉原本館');
      expect(html).not.toContain('アイランド秋葉原店');
    });
  });

  // 5. カスタム選択モードでのチェックボックスと全選択・全解除
  describe('5. 店舗を選ぶ (カスタム選択) モード', () => {
    it('renders checkboxes for all stores when scope="custom"', () => {
      const html = renderToString(
        <AnalysisScopeBar
          stores={multipleStores}
          currentStore={storeA}
          scope="custom"
          onScopeChange={vi.fn()}
          selectedStoreIds={[storeA.id, storeB.id]}
          onToggleStoreId={vi.fn()}
          onSelectAllStores={vi.fn()}
          onClearStores={vi.fn()}
          periodMode="common"
          onPeriodModeChange={vi.fn()}
        />
      );

      expect(html).toContain('分析対象とする店舗にチェックを入れてください');
      expect(html).toContain('全選択');
      expect(html).toContain('全解除');
      expect(html).toContain('2/3店舗 選択中');
      expect(html).toContain('マルハン新宿店');
      expect(html).toContain('エスパス秋葉原本館');
      expect(html).toContain('アイランド秋葉原店');
    });
  });

  // 6. App全体でのサブタブと横断準備中表示の統合テスト
  describe('6. 機種・高出率台サブタブでの横断分析準備中表示と条件別での複数店舗行表示', () => {
    it('displays "店舗を横断した表示は準備中です" on models and high_payout subtabs when scope="all"', () => {
      // Mock multiple stores in localStorage
      localStorage.setItem('SLOT_ANALYZER_HTML_STORES_V2', JSON.stringify([storeA, storeB]));
      localStorage.setItem('SLOT_ANALYZER_HTML_ACTIVE_ID_V2', storeA.id);

      // Models subtab with scope=all
      (window as any).location.hash = '#analysis/models?scope=all';
      const htmlModels = renderToString(<App />);
      expect(htmlModels).toContain('店舗を横断した表示は準備中です');
      expect(htmlModels).toContain('対象店舗:');
      expect(htmlModels).toContain('全店');

      // High payout subtab with scope=all
      (window as any).location.hash = '#analysis/high_payout?scope=all';
      const htmlPayout = renderToString(<App />);
      expect(htmlPayout).toContain('店舗を横断した表示は準備中です');

      // Conditions subtab with scope=all should render both store names as rows
      (window as any).location.hash = '#analysis/conditions?scope=all';
      const htmlConditions = renderToString(<App />);
      expect(htmlConditions).toContain('マルハン新宿店');
      expect(htmlConditions).toContain('エスパス秋葉原本館');
    });
  });
});
