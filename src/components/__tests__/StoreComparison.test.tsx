import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StoreComparison } from '../StoreComparison';
import { StoreProfile, DailyRecord } from '../../data/types';

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

describe('StoreComparison Component', () => {
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
  const storeC = createMockStore('storeC', 'ホールC店', sampleDates);

  it('renders digit day heatmap section and does NOT render deleted significance section', () => {
    const html = renderToString(<StoreComparison stores={[storeA, storeB]} />);

    // Check main title
    expect(html).toContain('店舗間 総合比較（台あたり指標）');

    // Verify statistical significance section is removed
    expect(html).not.toContain('店間差の統計的有意性判定');

    // Verify digit day heatmap title is present
    expect(html).toContain('店舗 × のつく日 ヒートマップ（台あたり平均差枚）');

    // Verify Day of Week heatmap title is also present
    expect(html).toContain('店舗 × 曜日 ヒートマップ（台あたり平均差枚）');

    // Verify definition text is present under the header
    expect(html).toContain('「Nのつく日」は、日付の一の位が N の日とする');
    expect(html).toContain('ゾロ目は日の十の位と一の位が同じ日（11・22日）');
  });

  it('renders all 11 columns in digit day heatmap table', () => {
    const html = renderToString(<StoreComparison stores={[storeA, storeB]} />);

    // Columns: 1のつく日 .. 0のつく日, ゾロ目の日
    expect(html).toContain('1のつく日');
    expect(html).toContain('2のつく日');
    expect(html).toContain('3のつく日');
    expect(html).toContain('4のつく日');
    expect(html).toContain('5のつく日');
    expect(html).toContain('6のつく日');
    expect(html).toContain('7のつく日');
    expect(html).toContain('8のつく日');
    expect(html).toContain('9のつく日');
    expect(html).toContain('0のつく日');
    expect(html).toContain('ゾロ目の日');
  });

  it('displays tooltip with daysCount, totalDiff, totalMachines, and avgDiff on cells', () => {
    const html = renderToString(<StoreComparison stores={[storeA, storeB]} />);

    expect(html).toContain('・該当日数:');
    expect(html).toContain('・総差枚:');
    expect(html).toContain('・総台数:');
    expect(html).toContain('・台あたり平均差枚:');
  });

  it('handles multiple stores (e.g. 3 or more) without crash and shows store names', () => {
    const html = renderToString(<StoreComparison stores={[storeA, storeB, storeC]} />);

    expect(html).toContain('ホールA店');
    expect(html).toContain('ホールB店');
    expect(html).toContain('ホールC店');
  });

  it('renders empty state message when less than 2 stores are provided', () => {
    const html = renderToString(<StoreComparison stores={[storeA]} />);
    expect(html).toContain('店舗比較には2店舗以上の登録が必要です');
  });
});
