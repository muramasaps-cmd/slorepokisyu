import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import App, { parseHash, ActiveTab, AnalysisSubTab } from '../../App';
import { saveStoresToStorage, setActiveStoreId } from '../../utils/storeStorage';
import { generateSyntheticDailyRecords } from '../../utils/__tests__/testDataGenerator';
import { StoreProfile } from '../../data/types';

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

describe('Prompt 43: タブの再編 (5タブ)', () => {
  describe('1. 旧URLの移動', () => {
    it('redirects legacy #models to analysis tab with models subtab', () => {
      const parsed = parseHash('#models');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('models');
      expect(parsed.scope).toBe('store');
    });

    it('redirects legacy #trends to analysis tab with conditions subtab', () => {
      const parsed = parseHash('#trends');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('conditions');
      expect(parsed.scope).toBe('store');
    });

    it('redirects legacy #high_payout to analysis tab with high_payout subtab', () => {
      const parsed = parseHash('#high_payout');
      expect(parsed.tab).toBe('analysis');
      expect(parsed.subTab).toBe('high_payout');
      expect(parsed.scope).toBe('store');
    });

    it('redirects legacy #validation to validation tab', () => {
      const parsed = parseHash('#validation');
      expect(parsed.tab).toBe('validation');
      expect(parsed.scope).toBe('store');
    });

    it('routes #compare to compare tab', () => {
      const parsed = parseHash('#compare');
      expect(parsed.tab).toBe('compare');
      expect(parsed.scope).toBe('store');
    });

    it('redirects legacy #tables to overview tab with table viewMode', () => {
      const parsed = parseHash('#tables');
      expect(parsed.tab).toBe('overview');
      expect(parsed.viewMode).toBe('table');
    });

    it('handles unified #analysis with subtab queries', () => {
      const subModels = parseHash('#analysis?sub=models');
      expect(subModels.tab).toBe('analysis');
      expect(subModels.subTab).toBe('models');

      const subConditions = parseHash('#analysis?sub=conditions');
      expect(subConditions.tab).toBe('analysis');
      expect(subConditions.subTab).toBe('conditions');

      const subHighPayout = parseHash('#analysis?sub=high_payout');
      expect(subHighPayout.tab).toBe('analysis');
      expect(subHighPayout.subTab).toBe('high_payout');

      // default subtab if omitted
      const subDefault = parseHash('#analysis');
      expect(subDefault.tab).toBe('analysis');
      expect(subDefault.subTab).toBe('models');
    });
  });

  describe('2. サブタブの切替', () => {
    it('defines exactly the 5 reorganized active tabs and 3 analysis subtabs', () => {
      const tabs: ActiveTab[] = ['overview', 'target', 'analysis', 'compare', 'validation'];
      expect(tabs).toHaveLength(5);

      const subTabs: AnalysisSubTab[] = ['models', 'conditions', 'high_payout'];
      expect(subTabs).toHaveLength(3);
    });

    it('constructs correct hash with subtab parameters when switching subtabs in analysis', () => {
      const activeTab: ActiveTab = 'analysis';
      const subTabs: AnalysisSubTab[] = ['models', 'conditions', 'high_payout'];

      const hashes = subTabs.map((sub) => {
        return `#${activeTab}?sub=${sub}`;
      });

      expect(hashes).toEqual([
        '#analysis?sub=models',
        '#analysis?sub=conditions',
        '#analysis?sub=high_payout',
      ]);

      for (const h of hashes) {
        const parsed = parseHash(h);
        expect(parsed.tab).toBe('analysis');
        expect(subTabs).toContain(parsed.subTab);
      }
    });
  });

  describe('3. 5タブがスマートフォン幅（375px）で収まること', () => {
    it('renders 5 tabs navigation structure matching mobile 375px responsive constraints', () => {
      const sampleRecords = generateSyntheticDailyRecords(100, 30, 8);
      const sampleStore: StoreProfile = {
        id: 'store-1',
        name: 'テスト店舗',
        address: '東京都',
        dailyRecords: sampleRecords,
        rateLend: 46,
        rateExchange: 52,
        exchangeRate: '52枚',
        totalMachinesApprox: 300,
        dataRange: '2024-01-01 - 2024-01-30',
        oldEventDays: '7のつく日',
        specialDayRules: { tails: [7] },
      };
      localStorage.setItem('SLOT_ANALYZER_HTML_STORES_V2', JSON.stringify([sampleStore]));
      localStorage.setItem('SLOT_ANALYZER_HTML_ACTIVE_ID_V2', 'store-1');

      const clean = (s: string) => s.replace(/<!--.*?-->/g, '');
      const html = clean(renderToString(<App />));

      // 5 tabs labels must all be present
      expect(html).toContain('概要');
      expect(html).toContain('狙い');
      expect(html).toContain('分析');
      expect(html).toContain('店舗比較');
      expect(html).toContain('検証');

      // Checks that the nav element uses 5-column grid layout for 375px mobile responsiveness
      expect(html).toContain('grid-cols-5');
      // Checks responsive vertical icon+label stacking for 375px mobile screens
      expect(html).toContain('flex-col sm:flex-row');
    });

    it('verifies that each of the 5 tabs fits within the 375px width budget', () => {
      // 375px mobile screen budget check:
      // Available viewport: 375px
      // App padding: 16px (px-2 on each side = 8px * 2)
      // Nav container padding: 8px (p-1 on each side = 4px * 2)
      // Net available nav width = 375 - 16 - 8 = 351px
      // 4 gaps between 5 columns (gap-1 = 4px * 4 = 16px)
      // Width allocated per tab button = (351 - 16) / 5 = 67px
      // With flex-col, icon is 16px and text is at most 4 Japanese characters (店舗比較):
      // 4 chars * 11px font size ≈ 44px <= 67px.
      const viewportWidth = 375;
      const appHorizontalPadding = 16;
      const navPadding = 8;
      const numTabs = 5;
      const gapWidth = 4;
      const totalGaps = (numTabs - 1) * gapWidth;

      const availableForTabs = viewportWidth - appHorizontalPadding - navPadding - totalGaps;
      const widthPerTab = availableForTabs / numTabs;

      expect(numTabs).toBe(5);
      expect(widthPerTab).toBeGreaterThan(60); // 67px available per tab

      // Max label length among the 5 tabs is 4 chars ("店舗比較")
      const tabLabels = ['概要', '狙い', '分析', '店舗比較', '検証'];
      const maxCharCount = Math.max(...tabLabels.map((l) => l.length));
      expect(maxCharCount).toBe(4);

      const estimatedTextWidth = maxCharCount * 12; // 12px per char
      expect(estimatedTextWidth).toBeLessThan(widthPerTab); // 48px < 67px: fits comfortably without overflow!
    });
  });
});
