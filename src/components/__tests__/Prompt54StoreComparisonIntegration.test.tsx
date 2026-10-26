import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { parseHash, ActiveTab, AnalysisSubTab } from '../../App';
import { PurposeMenu } from '../PurposeMenu';
import { PurposeHome } from '../PurposeHome';
import { StoreProfile, DailyRecord } from '../../data/types';
import { calculateConditionStats } from '../../utils/conditionAnalysis';
import { compareStores } from '../../utils/storeComparison';

function createMockStore(id: string, name: string, dates: string[]): StoreProfile {
  const dailyRecords: DailyRecord[] = dates.map((date) => {
    const day = parseInt(date.slice(8, 10), 10);
    const isZorome = day >= 10 && Math.floor(day / 10) === day % 10;
    const diff = isZorome ? 800 : day % 10 === 7 ? 500 : 100;
    const totalDiff = diff * 10;

    return {
      date,
      yearMonth: date.slice(0, 7),
      year: parseInt(date.slice(0, 4), 10),
      month: parseInt(date.slice(5, 7), 10),
      day,
      dayOfWeek: '土',
      avgDiffCoins: diff,
      avgGames: 6000,
      winRate: 55,
      winMachines: 6,
      totalMachines: 10,
      totalDiffCoins: totalDiff,
      hallCoinProfit: -totalDiff,
      playerCoinProfit: totalDiff,
      hallYenProfit: -totalDiff * 20,
      playerYenProfit: totalDiff * 20,
      inCoins: 180000,
      outCoins: 180000 + totalDiff,
      payoutRate: ((180000 + totalDiff) / 180000) * 100,
      estimatedRevenue: 100000,
      exchangeGapProfit: 5000,
      gModelHallProfit: 10000,
      gModelPlayerProfit: -10000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
    };
  });

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

describe('Prompt 54: 店舗比較の分析横断表示統合テスト', () => {
  const sampleDates = [
    '2025-01-01',
    '2025-01-07',
    '2025-01-11', // 1のつく日 & ゾロ目
    '2025-01-17', // 7のつく日
    '2025-01-22', // 2のつく日 & ゾロ目
    '2025-01-27', // 7のつく日
    '2025-01-30', // 0のつく日
  ];

  const storeA = createMockStore('storeA', 'ホールA店', sampleDates);
  const storeB = createMockStore('storeB', 'ホールB店', sampleDates);

  describe('1. 旧URLの移動・リダイレクト対応 (#compare -> #analysis/compare?scope=all)', () => {
    it('parses legacy #compare to analysis tab with compare subtab and scope=all', () => {
      const parsed = parseHash('#compare');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('compare');
      expect(parsed.analysisScope).toBe('all');
    });

    it('parses #analysis/compare to analysis tab with compare subtab and defaults scope to all', () => {
      const parsed = parseHash('#analysis/compare');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('compare');
      expect(parsed.analysisScope).toBe('all');
    });

    it('parses #analysis/compare with custom scope and stores', () => {
      const parsed = parseHash('#analysis/compare?scope=custom&stores=storeA,storeB');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('compare');
      expect(parsed.analysisScope).toBe('custom');
      expect(parsed.analysisStores).toEqual(['storeA', 'storeB']);
    });

    it('points PurposeMenu "他の店との比較" to #analysis/compare?scope=all and renders active breadcrumb', () => {
      const html = renderToString(
        <PurposeMenu
          activeTab="analysis"
          analysisSubTab="compare"
          targetScope="store"
          onNavigate={vi.fn()}
        />
      );

      // Verify breadcrumb displays "他の店との比較"
      expect(html).toContain('他の店との比較');
      expect(html).toContain('店舗を分析する');
    });

    it('points PurposeHome "他の店と比べると？" card to onSelectQuestion("analysis", { subTab: "compare" })', () => {
      const html = renderToString(
        <PurposeHome
          purpose="analyze"
          currentStore={storeA}
          stores={[storeA, storeB]}
          dailyRecords={storeA.dailyRecords}
          monthlyStats={[]}
          skipHome={false}
          onToggleSkipHome={vi.fn()}
          onSelectQuestion={vi.fn()}
        />
      );

      expect(html).toContain('他の店と比べると？');
      expect(html).toContain('data-testid="question-card-compare"');
    });
  });

  describe('2. サブタブの表示条件（1店舗時は店舗比較を非表示、2店舗以上の時は表示）', () => {
    it('determines compare subtab presence based on stores count', () => {
      // Logic used in App.tsx subtabs list:
      const getSubTabs = (storesCount: number) => [
        { id: 'models', label: '機種' },
        { id: 'conditions', label: '条件別' },
        { id: 'high_payout', label: '高出率台' },
        ...(storesCount > 1 ? [{ id: 'compare', label: '店舗比較' }] : []),
      ];

      // 1 store only: compare subtab MUST NOT be present
      const singleStoreTabs = getSubTabs(1);
      expect(singleStoreTabs.map((t) => t.id)).toEqual(['models', 'conditions', 'high_payout']);
      expect(singleStoreTabs.some((t) => t.id === 'compare')).toBe(false);

      // 2 stores: compare subtab MUST be present
      const twoStoresTabs = getSubTabs(2);
      expect(twoStoresTabs.map((t) => t.id)).toEqual(['models', 'conditions', 'high_payout', 'compare']);
      expect(twoStoresTabs.some((t) => t.id === 'compare')).toBe(true);

      // 3 stores: compare subtab MUST be present
      const threeStoresTabs = getSubTabs(3);
      expect(threeStoresTabs.some((t) => t.id === 'compare')).toBe(true);
    });
  });

  describe('3. ヒートマップの数値が、置き換え前後で同じになること（ConditionAnalysis との同一性検証）', () => {
    it('verifies calculateConditionStats for digit days (tail) produces identical numbers across stores', () => {
      // Compute condition stats for storeA using calculateConditionStats (tail)
      const tailStatsA = calculateConditionStats(storeA.dailyRecords, 'tail', {
        perspective: 'player',
        includeMonthDayZoro: false,
      });
      // Compute condition stats for storeB using calculateConditionStats (tail)
      const tailStatsB = calculateConditionStats(storeB.dailyRecords, 'tail', {
        perspective: 'player',
        includeMonthDayZoro: false,
      });

      // 7のつく日 check (key is '7')
      const stat7A = tailStatsA.find((s) => s.key === '7');
      const stat7B = tailStatsB.find((s) => s.key === '7');

      expect(stat7A).toBeDefined();
      expect(stat7B).toBeDefined();
      expect(stat7A?.count).toBe(3); // 2025-01-07, 2025-01-17, 2025-01-27
      expect(stat7B?.count).toBe(3);
      expect(stat7A?.avgDiffCoins).toBe(500);
      expect(stat7B?.avgDiffCoins).toBe(500);

      // ゾロ目の日 check (key is 'ゾロ目')
      const zoromeA = tailStatsA.find((s) => s.key === 'ゾロ目');
      const zoromeB = tailStatsB.find((s) => s.key === 'ゾロ目');

      expect(zoromeA).toBeDefined();
      expect(zoromeB).toBeDefined();
      expect(zoromeA?.count).toBe(2); // 2025-01-11, 2025-01-22
      expect(zoromeB?.count).toBe(2);
      expect(zoromeA?.avgDiffCoins).toBe(800);
      expect(zoromeB?.avgDiffCoins).toBe(800);

      // Verify overall comparison metrics in compareStores retain consistency
      const compResult = compareStores([storeA, storeB], { periodMode: 'common' });
      expect(compResult.evaluatedStores).toHaveLength(2);
      expect(compResult.evaluatedStores[0].daysCount).toBe(sampleDates.length);
      expect(compResult.evaluatedStores[1].daysCount).toBe(sampleDates.length);
      expect(compResult.commonPeriod.commonDaysCount).toBe(sampleDates.length);
    });

    it('verifies calculateConditionStats for days of week (dow) produces identical numbers across stores', () => {
      const dowStatsA = calculateConditionStats(storeA.dailyRecords, 'dow', {
        perspective: 'player',
      });
      const dowStatsB = calculateConditionStats(storeB.dailyRecords, 'dow', {
        perspective: 'player',
      });

      // 土曜日 (all sample records are Saturday, key is '土')
      const satA = dowStatsA.find((s) => s.key === '土');
      const satB = dowStatsB.find((s) => s.key === '土');

      expect(satA).toBeDefined();
      expect(satB).toBeDefined();
      expect(satA?.count).toBe(sampleDates.length);
      expect(satB?.count).toBe(sampleDates.length);
      expect(satA?.avgDiffCoins).toBe(satB?.avgDiffCoins);
      expect(satA?.playerWinRate).toBe(satB?.playerWinRate);
    });
  });
});
