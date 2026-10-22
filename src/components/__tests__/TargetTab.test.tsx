import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TargetTab, TargetScope } from '../TargetTab';
import { parseHash } from '../../App';
import { StoreProfile } from '../../data/types';
import { generateSyntheticDailyRecords } from '../../utils/__tests__/testDataGenerator';

describe('TargetTab Component', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const sampleRecords = generateSyntheticDailyRecords(100, 30, 8);
  const sampleStore1: StoreProfile = {
    id: 'store-1',
    name: 'エスパス日拓渋谷本館',
    address: '東京都渋谷区',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 52,
    exchangeRate: '52枚',
    totalMachinesApprox: 300,
    dataRange: '2024-01-01 - 2024-01-30',
    oldEventDays: '7のつく日',
    specialDayRules: { tails: [7] },
  };

  const sampleStore2: StoreProfile = {
    id: 'store-2',
    name: 'マルハン新宿東宝ビル店',
    address: '東京都新宿区',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 50,
    exchangeRate: '50枚',
    totalMachinesApprox: 400,
    dataRange: '2024-01-01 - 2024-01-30',
    oldEventDays: '7のつく日',
    specialDayRules: { tails: [7] },
  };

  const stores = [sampleStore1, sampleStore2];

  it('renders target date input and scope switcher buttons', () => {
    const html = clean(
      renderToString(
        <TargetTab
          targetDate="2024-01-27"
          onTargetDateChange={vi.fn()}
          scope="store"
          onScopeChange={vi.fn()}
          currentStore={sampleStore1}
          stores={stores}
          latestDataDate="2024-01-30"
          perspective="player"
          unit="coins"
          rateLend={46}
          rateExchange={52}
          filteredStoresByModel={stores}
          onSelectStore={vi.fn()}
        />
      )
    );

    // Header & Scope Switcher
    expect(html).toContain('狙い予測');
    expect(html).toContain('この店');
    expect(html).toContain('全店');
    expect(html).toContain('エスパス日拓渋谷本館');
    expect(html).toContain('data-testid="target-date-input"');
    expect(html).toContain('value="2024-01-27"');
    expect(html).toContain('最新日');
    expect(html).toContain('今日');
    expect(html).toContain('明日');
  });

  it('renders store prediction content and hides store ranking and scan when scope is "store"', () => {
    const html = clean(
      renderToString(
        <TargetTab
          targetDate="2024-01-27"
          onTargetDateChange={vi.fn()}
          scope="store"
          onScopeChange={vi.fn()}
          currentStore={sampleStore1}
          stores={stores}
          latestDataDate="2024-01-30"
          perspective="player"
          unit="coins"
          rateLend={46}
          rateExchange={52}
          filteredStoresByModel={stores}
          onSelectStore={vi.fn()}
        />
      )
    );

    // Displays store content
    expect(html).toContain('data-testid="target-store-content"');
    expect(html).not.toContain('data-testid="target-all-content"');

    // Hall general diagnosis and model recommendation
    expect(html).toContain('の狙い台・おすすめ機種ランキング');

    // MUST NOT display candidate scan or store rankings in single store mode
    expect(html).not.toContain('来店日の候補スキャン');
    expect(html).not.toContain('どの店に行くか？ 店舗ランキング');
  });

  it('renders cross-store prediction content including store ranking and candidate scan when scope is "all"', () => {
    const html = clean(
      renderToString(
        <TargetTab
          targetDate="2024-01-27"
          onTargetDateChange={vi.fn()}
          scope="all"
          onScopeChange={vi.fn()}
          currentStore={sampleStore1}
          stores={stores}
          latestDataDate="2024-01-30"
          perspective="player"
          unit="coins"
          rateLend={46}
          rateExchange={52}
          filteredStoresByModel={stores}
          onSelectStore={vi.fn()}
        />
      )
    );

    // Displays all stores cross content
    expect(html).toContain('data-testid="target-all-content"');
    expect(html).not.toContain('data-testid="target-store-content"');

    // MUST display candidate date scan and store rankings in "all" mode
    expect(html).toContain('来店日の候補スキャン');
    expect(html).toContain('どの店に行くか？ 店舗ランキング');
    expect(html).toContain('店舗横断 狙い台・狙い機種ランキング');
  });

  it('correctly parses legacy hash (#forecast, #cross, #tables) and unified #target hash', () => {
    // 1. Legacy #forecast
    const legacyForecast = parseHash('#forecast');
    expect(legacyForecast).toEqual({ tab: 'target', scope: 'store', date: undefined });

    const legacyForecastWithDate = parseHash('#forecast?date=2026-05-17');
    expect(legacyForecastWithDate).toEqual({ tab: 'target', scope: 'store', date: '2026-05-17' });

    // 2. Legacy #cross
    const legacyCross = parseHash('#cross');
    expect(legacyCross).toEqual({ tab: 'target', scope: 'all', date: undefined });

    const legacyCrossWithDate = parseHash('#cross?crossDate=2026-05-20');
    expect(legacyCrossWithDate).toEqual({ tab: 'target', scope: 'all', date: '2026-05-20' });

    // 3. Unified #target
    const targetStore = parseHash('#target?scope=store&date=2026-05-18');
    expect(targetStore).toEqual({ tab: 'target', scope: 'store', date: '2026-05-18' });

    const targetAll = parseHash('#target?scope=all&date=2026-05-19');
    expect(targetAll).toEqual({ tab: 'target', scope: 'all', date: '2026-05-19' });

    // 4. Default target without query params
    const defaultTarget = parseHash('#target');
    expect(defaultTarget).toEqual({ tab: 'target', scope: 'store', date: undefined });

    // 5. Legacy #tables -> overview (Prompt 42 requirement)
    const legacyTables = parseHash('#tables');
    expect(legacyTables).toEqual({ tab: 'overview', scope: 'store', viewMode: 'table' });
  });
});
