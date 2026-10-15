import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProfitChart, ProfitChartErrorBoundary } from '../ProfitChart';
import { MonthlyStat } from '../../data/types';

function createMockMonthlyStat(overrides: Partial<MonthlyStat> = {}): MonthlyStat {
  return {
    yearMonth: '2025-01',
    year: 2025,
    month: 1,
    label: '2025年1月',
    daysCount: 31,
    avgMachines: 300,
    avgDiffCoins: 150,
    totalDiffCoins: 45000,
    hallCoinProfit: -45000,
    playerCoinProfit: 45000,
    hallYenProfit: -900000,
    playerYenProfit: 900000,
    cumHallCoinProfit: -45000,
    cumHallYenProfit: -900000,
    cumPlayerCoinProfit: 45000,
    cumPlayerYenProfit: 900000,
    totalInCoins: 3000000,
    totalOutCoins: 3045000,
    avgPayoutRate: 101.5,
    estimatedRevenue: 6000000,
    exchangeGapProfit: 150000,
    gModelHallProfit: -750000,
    gModelPlayerProfit: 750000,
    cumGModelHallProfit: -750000,
    cumGModelPlayerProfit: 750000,
    modelDiff: 150000,
    avgGames: 5000,
    avgWinRate: 52,
    hallWinDays: 14,
    playerWinDays: 17,
    eventDaysCount: 6,
    eventAvgDiff: 280,
    eventHallYen: -300000,
    eventGModelHallYen: -250000,
    normalDaysCount: 25,
    normalAvgDiff: 110,
    normalHallYen: -600000,
    normalGModelHallYen: -500000,
    ...overrides,
  };
}

describe('ProfitChart component', () => {
  it('renders fixed height chart container when valid data is present', () => {
    const mockData = [createMockMonthlyStat()];
    const html = renderToString(
      <ProfitChart
        monthlyStats={mockData}
        perspective="hall"
        unit="yen"
      />
    );

    // Root should not have h-full or flex-1 min-h
    expect(html).toContain('h-[320px] sm:h-[360px]');
    expect(html).toContain('G数(IN枚数)連動モデル 月別利益推移');
    expect(html).toContain('万円');
    expect(html).toContain('単月棒グラフ');
    expect(html).toContain('累計推移');
    expect(html).toContain('稼働G数推移');
  });

  it('renders empty state when monthlyStats is empty', () => {
    const html = renderToString(
      <ProfitChart
        monthlyStats={[]}
        perspective="hall"
        unit="yen"
      />
    );

    expect(html).toContain('表示できるデータがありません');
    expect(html).toContain('店舗データが取り込まれていないか、対象期間のデータがありません。');
    expect(html).toContain('h-[320px] sm:h-[360px]');
  });

  it('renders year-specific empty state and reset button guide when filtered year has no data', () => {
    const onReset = vi.fn();
    const html = renderToString(
      <ProfitChart
        monthlyStats={[]}
        perspective="hall"
        unit="yen"
        selectedYear="2023"
        onResetYearFilter={onReset}
      />
    );

    expect(html).toContain('表示できるデータがありません');
    expect(html).toContain('2023年のデータが存在しないか、フィルタ条件外です。');
    expect(html).toContain('全期間を表示する');
  });

  it('excludes records with NaN / non-finite values and displays warning with excluded count', () => {
    const validStat = createMockMonthlyStat({ yearMonth: '2025-01' });
    const invalidStat = createMockMonthlyStat({
      yearMonth: '2025-02',
      gModelHallProfit: NaN,
      hallYenProfit: NaN,
    });

    const html = renderToString(
      <ProfitChart
        monthlyStats={[validStat, invalidStat]}
        perspective="hall"
        unit="yen"
      />
    );

    expect(html).toContain('数値異常（NaN等）により');
    expect(html).toContain('ヶ月分のデータを除外して描画しています');
    expect(html).toContain('h-[320px] sm:h-[360px]');
  });

  it('displays empty state when all records have NaN values', () => {
    const invalidStat = createMockMonthlyStat({
      yearMonth: '2025-02',
      gModelHallProfit: NaN,
      hallYenProfit: NaN,
    });

    const html = renderToString(
      <ProfitChart
        monthlyStats={[invalidStat]}
        perspective="hall"
        unit="yen"
      />
    );

    expect(html).toContain('表示可能な有効データがありません');
    expect(html).toContain('数値異常（NaN等）により全ての月データ');
    expect(html).toContain('件）が除外されました。');
  });

  it('renders properly for player perspective and coin units', () => {
    const mockData = [createMockMonthlyStat()];
    const htmlCoins = renderToString(
      <ProfitChart
        monthlyStats={mockData}
        perspective="player"
        unit="coins"
      />
    );

    expect(htmlCoins).toContain('万枚');

    const htmlRate = renderToString(
      <ProfitChart
        monthlyStats={mockData}
        perspective="player"
        unit="payoutRate"
      />
    );

    expect(htmlRate).toContain('%');

    const htmlAvgDiff = renderToString(
      <ProfitChart
        monthlyStats={mockData}
        perspective="player"
        unit="avgDiff"
      />
    );

    expect(htmlAvgDiff).toContain('枚/台');
  });

  it('ProfitChartErrorBoundary renders fallback when error state is active', () => {
    const boundary = new ProfitChartErrorBoundary({ children: <div>child</div> });
    const derivedState = ProfitChartErrorBoundary.getDerivedStateFromError(
      new Error('Test Chart Crash')
    );
    expect(derivedState.hasError).toBe(true);
    expect(derivedState.errorMessage).toBe('Test Chart Crash');

    boundary.state = derivedState;
    const fallback = boundary.render();
    const html = renderToString(fallback as React.ReactElement);

    expect(html).toContain('月別利益推移グラフの描画に失敗しました');
    expect(html).toContain('Test Chart Crash');
    expect(html).toContain('グラフを再読込');
    expect(html).toContain('ページ再読み込み');
  });
});
