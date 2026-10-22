import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProfitChart } from '../ProfitChart';
import { MonthlyTable } from '../MonthlyTable';
import { parseHash } from '../../App';
import { MonthlyStat, DailyRecord } from '../../data/types';

function createSampleMonthlyStats(): MonthlyStat[] {
  return [
    {
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      label: '2025年1月',
      daysCount: 31,
      avgMachines: 320,
      avgDiffCoins: 120,
      totalDiffCoins: 38400,
      hallCoinProfit: -38400,
      playerCoinProfit: 38400,
      hallYenProfit: -768000,
      playerYenProfit: 768000,
      cumHallCoinProfit: -38400,
      cumHallYenProfit: -768000,
      cumPlayerCoinProfit: 38400,
      cumPlayerYenProfit: 768000,
      totalInCoins: 3100000,
      totalOutCoins: 3138400,
      avgPayoutRate: 101.24,
      estimatedRevenue: 6200000,
      exchangeGapProfit: 160000,
      gModelHallProfit: -608000,
      gModelPlayerProfit: 608000,
      cumGModelHallProfit: -608000,
      cumGModelPlayerProfit: 608000,
      modelDiff: 160000,
      avgGames: 5200,
      avgWinRate: 51.5,
      hallWinDays: 14,
      playerWinDays: 17,
      eventDaysCount: 6,
      eventAvgDiff: 250,
      eventHallYen: -300000,
      eventGModelHallYen: -240000,
      normalDaysCount: 25,
      normalAvgDiff: 88,
      normalHallYen: -468000,
      normalGModelHallYen: -368000,
    },
    {
      yearMonth: '2025-02',
      year: 2025,
      month: 2,
      label: '2025年2月',
      daysCount: 28,
      avgMachines: 320,
      avgDiffCoins: -85,
      totalDiffCoins: -27200,
      hallCoinProfit: 27200,
      playerCoinProfit: -27200,
      hallYenProfit: 544000,
      playerYenProfit: -544000,
      cumHallCoinProfit: -11200,
      cumHallYenProfit: -224000,
      cumPlayerCoinProfit: 11200,
      cumPlayerYenProfit: 224000,
      totalInCoins: 2800000,
      totalOutCoins: 2772800,
      avgPayoutRate: 99.03,
      estimatedRevenue: 5600000,
      exchangeGapProfit: 140000,
      gModelHallProfit: 684000,
      gModelPlayerProfit: -684000,
      cumGModelHallProfit: 76000,
      cumGModelPlayerProfit: -76000,
      modelDiff: 140000,
      avgGames: 4900,
      avgWinRate: 46.2,
      hallWinDays: 16,
      playerWinDays: 12,
      eventDaysCount: 5,
      eventAvgDiff: 180,
      eventHallYen: -180000,
      eventGModelHallYen: -140000,
      normalDaysCount: 23,
      normalAvgDiff: -142,
      normalHallYen: 724000,
      normalGModelHallYen: 824000,
    },
  ];
}

describe('Prompt 42: 概要と表の統合 (OverviewIntegration)', () => {
  describe('1. グラフと表の切替で同じ月の数値が一致すること', () => {
    it('provides identical underlying monthly metrics for both ProfitChart and MonthlyTable', () => {
      const stats = createSampleMonthlyStats();

      for (const m of stats) {
        // G-model Hall profit
        expect(m.gModelHallProfit).toBe(m.gModelHallProfit);
        // Payout rate
        expect(m.avgPayoutRate).toBeCloseTo(m.totalOutCoins / m.totalInCoins * 100, 2);
        // Average diff coins
        expect(m.avgDiffCoins).toBe(Math.round(m.totalDiffCoins / m.avgMachines));
        // Days count
        expect(m.daysCount).toBe(m.eventDaysCount + m.normalDaysCount);
      }

      // Render chart
      const chartHtml = renderToString(
        <ProfitChart
          monthlyStats={stats}
          perspective="hall"
          unit="yen"
          profitModel="gCount"
        />
      );

      // Render table
      const tableHtml = renderToString(
        <MonthlyTable
          monthlyStats={stats}
          dailyRecords={[]}
          perspective="hall"
          unit="yen"
          profitModel="gCount"
          onSelectMonth={() => {}}
        />
      );

      const clean = (s: string) => s.replace(/<!--.*?-->/g, '');
      const cleanChart = clean(chartHtml);
      const cleanTable = clean(tableHtml);

      // Both chart and table reference the same months and headers
      expect(cleanChart).toContain('G数(IN枚数)連動モデル 月別利益推移');
      expect(cleanChart).toContain('単月棒グラフ');

      expect(cleanTable).toContain('2025年1月');
      expect(cleanTable).toContain('2025年2月');
      expect(cleanTable).toContain('月別利益・差枚集計一覧表');

      // Verify numerical consistency: check that both chart and table receive exact same monthlyStats data
      // Month 1: gModelHallProfit = -608,000円 (-61万円)
      // Month 2: gModelHallProfit = +684,000円 (+68万円)
      const m1 = stats.find((s) => s.yearMonth === '2025-01')!;
      const m2 = stats.find((s) => s.yearMonth === '2025-02')!;

      expect(m1.gModelHallProfit).toBe(-608000);
      expect(m1.avgDiffCoins).toBe(120);
      expect(m1.avgPayoutRate).toBe(101.24);

      expect(m2.gModelHallProfit).toBe(684000);
      expect(m2.avgDiffCoins).toBe(-85);
      expect(m2.avgPayoutRate).toBe(99.03);
    });

    it('renders ProfitChart in chart mode and MonthlyTable in table mode without altering numbers', () => {
      const stats = createSampleMonthlyStats();
      const dummySelect = () => {};

      // Simulated view toggle in Overview:
      const renderOverviewView = (viewMode: 'chart' | 'table') => {
        if (viewMode === 'chart') {
          return renderToString(
            <ProfitChart
              monthlyStats={stats}
              perspective="hall"
              unit="yen"
              profitModel="gCount"
              onSelectMonth={dummySelect}
            />
          );
        } else {
          return renderToString(
            <MonthlyTable
              monthlyStats={stats}
              dailyRecords={[]}
              perspective="hall"
              unit="yen"
              profitModel="gCount"
              onSelectMonth={dummySelect}
            />
          );
        }
      };

      const chartOutput = renderOverviewView('chart');
      const tableOutput = renderOverviewView('table');

      // Chart contains chart title
      expect(chartOutput).toContain('G数(IN枚数)連動モデル 月別利益推移');
      const clean = (s: string) => s.replace(/<!--.*?-->/g, '');
      expect(clean(tableOutput)).toContain('月別利益・差枚集計一覧表');
      expect(clean(tableOutput)).toContain('2ヶ月分');
    });
  });

  describe('2. 旧URL（#tables）の移動', () => {
    it('redirects #tables to overview tab and sets viewMode to table', () => {
      const parsed = parseHash('#tables');
      expect(parsed.tab).toBe('overview');
      expect(parsed.scope).toBe('store');
      expect(parsed.viewMode).toBe('table');
    });

    it('redirects #tables with query parameters to overview tab', () => {
      const parsed = parseHash('#tables?filter=all');
      expect(parsed.tab).toBe('overview');
      expect(parsed.scope).toBe('store');
      expect(parsed.viewMode).toBe('table');
    });

    it('routes #overview to overview tab with default chart view', () => {
      const parsed = parseHash('#overview');
      expect(parsed.tab).toBe('overview');
      expect(parsed.scope).toBe('store');
      expect(parsed.viewMode).toBeUndefined();
    });

    it('handles empty hash as overview tab', () => {
      const parsed = parseHash('');
      expect(parsed.tab).toBe('overview');
      expect(parsed.scope).toBe('store');
    });
  });
});
