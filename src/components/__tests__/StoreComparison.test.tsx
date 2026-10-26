import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StoreComparison, formatMonthlyTrendTooltip } from '../StoreComparison';
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

  it('renders summary, metrics table, condition guide, monthly trend, and common models in specified order', () => {
    const html = renderToString(<StoreComparison stores={[storeA, storeB]} />);

    // Check main title
    expect(html).toContain('店舗間 総合比較（台あたり指標）');

    // Verify statistical significance section is removed
    expect(html).not.toContain('店間差の統計的有意性判定');

    // Verify 5 core sections are present in order
    const posSummary = html.indexOf('データに基づく各店舗の傾向要約（客観数値自動生成）');
    const posMetrics = html.indexOf('主要指標 比較一覧表（台あたり基準）');
    const posConditionGuide = html.indexOf('店舗 × のつく日 / 曜日 ヒートマップ');
    const posMonthly = html.indexOf('月次推移の重ね合わせ折れ線（台あたり平均差枚）');
    const posCategory = html.indexOf('機種カテゴリ構成比');
    const posCommonModels = html.indexOf('共通機種ランキング（同一機種の店別成績）');

    expect(posSummary).toBeGreaterThan(-1);
    expect(posMetrics).toBeGreaterThan(posSummary);
    expect(posConditionGuide).toBeGreaterThan(posMetrics);
    expect(posMonthly).toBeGreaterThan(posConditionGuide);
    expect(posCategory).toBeGreaterThan(posMonthly);
    expect(posCommonModels).toBeGreaterThan(posMonthly);

    // Verify condition guide text links to condition analysis
    expect(html).toContain('「条件別」サブタブの横断表示に統合されました');
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

  it('formats monthly trend tooltip with signed 1-decimal value and store name', () => {
    expect(formatMonthlyTrendTooltip(75, 'ホールA店')).toEqual(['+75.0枚/台', 'ホールA店']);
    expect(formatMonthlyTrendTooltip(-12.34, 'ホールB店')).toEqual(['-12.3枚/台', 'ホールB店']);
    expect(formatMonthlyTrendTooltip(0, 'ホールC店')).toEqual(['+0.0枚/台', 'ホールC店']);
    expect(formatMonthlyTrendTooltip(null, 'ホールA店')).toEqual(['-', 'ホールA店']);
    expect(formatMonthlyTrendTooltip(undefined, 'ホールB店')).toEqual(['-', 'ホールB店']);
  });

  it('renders monthly trend chart lines with store names and legend matching', () => {
    const html = renderToString(<StoreComparison stores={[storeA, storeB]} />);
    expect(html).toContain('月次推移の重ね合わせ折れ線（台あたり平均差枚）');
    expect(html).toContain('ホールA店');
    expect(html).toContain('ホールB店');
  });
});
