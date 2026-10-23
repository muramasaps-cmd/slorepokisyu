import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TargetTab, TargetScope } from '../TargetTab';
import { parseHash } from '../../App';
import { StoreProfile } from '../../data/types';
import {
  generateSyntheticDailyRecords,
  createSyntheticMachineRecords,
} from '../../utils/__tests__/testDataGenerator';

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

  describe('Prompt 47: 狙い画面の絞り込みの流れ (Funnel Workflow)', () => {
    const recordsWithMachines = createSyntheticMachineRecords({
      daysCount: 30,
      machinesCount: 20,
      biasedMachineNums: [101, 102],
      biasBonus: 1500,
    });

    const storeWithMachines1: StoreProfile = {
      ...sampleStore1,
      id: 'store-m1',
      name: '渋谷メガホール',
      dailyRecords: recordsWithMachines,
    };

    const storeWithMachines2: StoreProfile = {
      ...sampleStore2,
      id: 'store-m2',
      name: '新宿グランドホール',
      dailyRecords: recordsWithMachines,
    };

    const storesWithMachines = [storeWithMachines1, storeWithMachines2];

    it('renders sticky step navigation bar with steps ① to ⑤', () => {
      const html = clean(
        renderToString(
          <TargetTab
            targetDate="2025-01-20"
            onTargetDateChange={vi.fn()}
            scope="store"
            onScopeChange={vi.fn()}
            currentStore={storeWithMachines1}
            stores={storesWithMachines}
            latestDataDate="2025-01-30"
            perspective="player"
            unit="coins"
            rateLend={46}
            rateExchange={52}
            filteredStoresByModel={storesWithMachines}
            onSelectStore={vi.fn()}
          />
        )
      );

      // Step navigation bar present
      expect(html).toContain('data-testid="step-navigation-bar"');
      expect(html).toContain('data-testid="nav-step-1"');
      expect(html).toContain('来店日・範囲');
      expect(html).toContain('data-testid="nav-step-2"');
      expect(html).toContain('どの店に行くか');
      expect(html).toContain('data-testid="nav-step-3"');
      expect(html).toContain('どの機種を狙うか');
      expect(html).toContain('data-testid="nav-step-4"');
      expect(html).toContain('どの台を狙うか');
      expect(html).toContain('data-testid="nav-step-5"');
      expect(html).toContain('当日のチェック');
    });

    it('renders sequential step cards with Top 3 summaries and expand toggles in single-store scope', () => {
      const html = clean(
        renderToString(
          <TargetTab
            targetDate="2025-01-20"
            onTargetDateChange={vi.fn()}
            scope="store"
            onScopeChange={vi.fn()}
            currentStore={storeWithMachines1}
            stores={storesWithMachines}
            latestDataDate="2025-01-30"
            perspective="player"
            unit="coins"
            rateLend={46}
            rateExchange={52}
            filteredStoresByModel={storesWithMachines}
            onSelectStore={vi.fn()}
          />
        )
      );

      // Step 1 card
      expect(html).toContain('data-testid="target-step-1-card"');
      expect(html).toContain('id="target-step-1"');

      // Step 3 card (models)
      expect(html).toContain('id="target-step-3"');
      expect(html).toContain('どの機種を狙うか');
      expect(html).toContain('上位3機種の要約');
      expect(html).toContain('data-testid="step3-top3-cards"');
      expect(html).toContain('data-testid="step3-toggle-expand"');

      // Step 4 card (machines)
      expect(html).toContain('id="target-step-4"');
      expect(html).toContain('どの台を狙うか');
      expect(html).toContain('上位3台の要約');
      expect(html).toContain('data-testid="step4-top3-cards"');
      expect(html).toContain('data-testid="step4-toggle-expand"');

      // Step 5 card (checklist)
      expect(html).toContain('id="target-step-5"');
      expect(html).toContain('当日のチェックリスト');
      expect(html).toContain('未チェック候補 上位3台');
      expect(html).toContain('data-testid="step5-top3-cards"');
      expect(html).toContain('data-testid="step5-toggle-expand"');
    });

    it('renders Step 2 (store ranking) and calendar scan in all-stores scope with top 3 store summary', () => {
      const html = clean(
        renderToString(
          <TargetTab
            targetDate="2025-01-20"
            onTargetDateChange={vi.fn()}
            scope="all"
            onScopeChange={vi.fn()}
            currentStore={storeWithMachines1}
            stores={storesWithMachines}
            latestDataDate="2025-01-30"
            perspective="player"
            unit="coins"
            rateLend={46}
            rateExchange={52}
            filteredStoresByModel={storesWithMachines}
            onSelectStore={vi.fn()}
          />
        )
      );

      // Step 1 (date & range + calendar scan)
      expect(html).toContain('id="target-step-1"');
      expect(html).toContain('id="target-calendar-scan"');

      // Step 2 (which store)
      expect(html).toContain('id="target-step-2"');
      expect(html).toContain('どの店に行くか？ 店舗ランキング');
      expect(html).toContain('上位3店舗の要約');
      expect(html).toContain('data-testid="step2-top3-cards"');
      expect(html).toContain('data-testid="step2-toggle-expand"');

      // Step 3 (which model cross-store)
      expect(html).toContain('id="target-step-3"');
      expect(html).toContain('どの機種を狙うか');
      expect(html).toContain('上位3機種の要約');
      expect(html).toContain('data-testid="toggle-step-3-expand"');

      // Step 4 (which machine cross-store)
      expect(html).toContain('id="target-step-4"');
      expect(html).toContain('どの台を狙うか');
      expect(html).toContain('上位3台の要約');
      expect(html).toContain('data-testid="toggle-step-4-expand"');

      // Step 5 (checklist cross-store)
      expect(html).toContain('id="target-step-5"');
      expect(html).toContain('当日のチェックリスト');
      expect(html).toContain('上位3候補の要約');
      expect(html).toContain('data-testid="toggle-step-5-expand"');
    });

    it('renders funnel chip bar when store or model is filtered in single store scope', () => {
      const html = clean(
        renderToString(
          <TargetTab
            targetDate="2025-01-20"
            onTargetDateChange={vi.fn()}
            scope="store"
            onScopeChange={vi.fn()}
            currentStore={storeWithMachines1}
            stores={storesWithMachines}
            latestDataDate="2025-01-30"
            perspective="player"
            unit="coins"
            rateLend={46}
            rateExchange={52}
            filteredStoresByModel={storesWithMachines}
            onSelectStore={vi.fn()}
          />
        )
      );

      expect(html).toContain('data-testid="funnel-chips-bar"');
      expect(html).toContain('data-testid="funnel-chip-store"');
      expect(html).toContain('渋谷メガホール');
      expect(html).toContain('data-testid="clear-funnel-store"');
    });

    it('maps section hashes from PurposeMenu correctly to target funnel steps', () => {
      // Prompt 47 requirement 4: PurposeMenu items navigate to corresponding steps
      const calendarHash = parseHash('#target?section=calendar');
      expect(calendarHash.section).toBe('calendar');

      const storesHash = parseHash('#target?section=stores');
      expect(storesHash.section).toBe('stores');

      const modelsHash = parseHash('#target?section=models');
      expect(modelsHash.section).toBe('models');

      const machinesHash = parseHash('#target?section=machines');
      expect(machinesHash.section).toBe('machines');

      const checklistHash = parseHash('#target?section=checklist');
      expect(checklistHash.section).toBe('checklist');
    });
  });
});
