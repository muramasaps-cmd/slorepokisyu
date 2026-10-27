import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CrossStoreTarget } from '../CrossStoreTarget';
import * as crossStoreRankingModule from '../../utils/crossStoreRanking';
import { StoreProfile } from '../../data/types';
import { generateSyntheticDailyRecords } from '../../utils/__tests__/testDataGenerator';

describe('CrossStoreTarget Worker vs Synchronous Fallback (Prompt 57 Requirement 6b)', () => {
  const originalWorker = globalThis.Worker;

  const sampleRecords = generateSyntheticDailyRecords(50, 14, 5);
  const sampleStore: StoreProfile = {
    id: 'store-1',
    name: 'テストホール1',
    address: '東京都渋谷区',
    oldEventDays: '7のつく日',
    dataRange: '2024-01-01 - 2024-01-14',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 52,
    exchangeRate: '52枚',
    totalMachinesApprox: 200,
    specialDayRules: { tails: [7] },
  };
  const stores = [sampleStore];
  const targetDate = sampleRecords[sampleRecords.length - 1].date;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWorker) {
      globalThis.Worker = originalWorker;
    } else {
      delete (globalThis as any).Worker;
    }
  });

  it('Requirement 6b: when Worker is available (browser runtime), calculateCrossStoreRanking is NEVER called on the main thread', () => {
    const calcRankingSpy = vi.spyOn(crossStoreRankingModule, 'calculateCrossStoreRanking');
    const scanDatesSpy = vi.spyOn(crossStoreRankingModule, 'scanCandidateDates');

    // Simulate Worker environment available in browser
    class MockWorker {
      public onmessage: ((e: MessageEvent) => void) | null = null;
      public onerror: ((e: any) => void) | null = null;
      public postMessage = vi.fn();
      public terminate = vi.fn();
    }
    (globalThis as any).Worker = MockWorker;

    const html = renderToString(
      <CrossStoreTarget
        stores={stores}
        targetDate={targetDate}
        onSelectStore={vi.fn()}
      />
    );

    // When Worker is available, main thread calculations are not called
    expect(calcRankingSpy).not.toHaveBeenCalled();
    expect(scanDatesSpy).not.toHaveBeenCalled();

    // Renders the initial loading state indicating background calculation is active
    expect(html).toContain('全店の狙い台と候補日を計算中...');
    expect(html).toContain('data-testid="cross-target-loading"');
  });

  it('Requirement 6b: when Worker is unavailable / throws, falls back to synchronous calculation on main thread', () => {
    const calcRankingSpy = vi.spyOn(crossStoreRankingModule, 'calculateCrossStoreRanking');
    const scanDatesSpy = vi.spyOn(crossStoreRankingModule, 'scanCandidateDates');

    // Simulate environment where Worker is unavailable (e.g. Node / SSR / restricted sandbox)
    delete (globalThis as any).Worker;

    const html = renderToString(
      <CrossStoreTarget
        stores={stores}
        targetDate={targetDate}
        onSelectStore={vi.fn()}
      />
    );

    // Main thread calculations ARE invoked synchronously as fallback
    expect(calcRankingSpy).toHaveBeenCalled();
    expect(scanDatesSpy).toHaveBeenCalled();

    // Content is rendered with synchronous results rather than the loading screen
    expect(html).not.toContain('data-testid="cross-target-loading"');
    expect(html).toContain('来店日の候補スキャン');
    expect(html).toContain('どの店に行くか？ 店舗ランキング');
  });
});
