import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConditionAnalysis } from '../ConditionAnalysis';
import { DayOfWeekAnalysis } from '../DayOfWeekAnalysis';
import { TailNumberAnalysis } from '../TailNumberAnalysis';
import {
  calculateConditionStats,
  getConditionHeatmapColor,
  isFewDays,
  FEW_DAYS_LABEL,
  DIGIT_DAY_DEFINITION_TEXT,
  DOW_COLUMNS,
  TAIL_COLUMNS,
} from '../../utils/conditionAnalysis';
import { DailyRecord, StoreProfile } from '../../data/types';

function createSampleRecord(date: string, dow: string, avgDiff: number, totalMachines = 10): DailyRecord {
  const day = parseInt(date.slice(8, 10), 10);
  const totalDiff = avgDiff * totalMachines;
  const inCoins = 6000 * 3 * totalMachines;
  const outCoins = inCoins + totalDiff;
  const payoutRate = (outCoins / inCoins) * 100;
  const winMachines = avgDiff > 0 ? 6 : 4;

  return {
    date,
    yearMonth: date.slice(0, 7),
    year: parseInt(date.slice(0, 4), 10),
    month: parseInt(date.slice(5, 7), 10),
    day,
    dayOfWeek: dow,
    avgDiffCoins: avgDiff,
    avgGames: 6000,
    winRate: (winMachines / totalMachines) * 100,
    winMachines,
    totalMachines,
    totalDiffCoins: totalDiff,
    hallCoinProfit: -totalDiff,
    playerCoinProfit: totalDiff,
    hallYenProfit: -totalDiff * 20,
    playerYenProfit: totalDiff * 20,
    inCoins,
    outCoins,
    payoutRate,
    estimatedRevenue: 100000,
    exchangeGapProfit: 5000,
    gModelHallProfit: -totalDiff * 20,
    gModelPlayerProfit: totalDiff * 20,
    isOldEventDay: false,
    is7Day: day % 10 === 7,
    notable: '',
  };
}

describe('ConditionAnalysis Component & Utilities', () => {
  const sampleRecords: DailyRecord[] = [
    createSampleRecord('2025-01-01', '水', 200), // 1のつく日
    createSampleRecord('2025-01-07', '火', 500), // 7のつく日
    createSampleRecord('2025-01-11', '土', 800), // 1のつく日 & ゾロ目
    createSampleRecord('2025-01-14', '火', -100), // 4のつく日
    createSampleRecord('2025-01-17', '金', 400), // 7のつく日
    createSampleRecord('2025-01-21', '火', 300), // 1のつく日
    createSampleRecord('2025-01-22', '水', 600), // 2のつく日 & ゾロ目
    createSampleRecord('2025-01-27', '月', 450), // 7のつく日
  ];

  const storeA: StoreProfile = {
    id: 'storeA',
    name: 'メガホールA店',
    address: '東京都',
    oldEventDays: '7のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 10,
    dataRange: '2025-01',
    dailyRecords: sampleRecords,
  };

  const storeB: StoreProfile = {
    id: 'storeB',
    name: 'ギガホールB店',
    address: '神奈川県',
    oldEventDays: '3のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 10,
    dataRange: '2025-01',
    dailyRecords: sampleRecords.map((r) => ({
      ...r,
      avgDiffCoins: r.avgDiffCoins - 150,
      totalDiffCoins: (r.avgDiffCoins - 150) * 10,
    })),
  };

  it('1. Dimension switching: renders 曜日・祝日 vs のつく日・ゾロ目 headers', () => {
    // Default DOW
    const htmlDow = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="dow"
      />
    );
    expect(htmlDow).toContain('曜日・祝日別 利益・出玉傾向分析');
    expect(htmlDow).toContain('月曜日');
    expect(htmlDow).toContain('火曜日');
    expect(htmlDow).toContain('祝日 (祝祭日・振替休日)');

    // TAIL
    const htmlTail = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
      />
    );
    expect(htmlTail).toContain('〇のつく日別の利益・出玉傾向分析');
    expect(htmlTail).toContain('1のつく日');
    expect(htmlTail).toContain('7のつく日');
    expect(htmlTail).toContain('ゾロ目の日');
    expect(htmlTail).toContain(DIGIT_DAY_DEFINITION_TEXT.slice(0, 20));
  });

  it('2. Metric switching: displays coins, payoutRate, or highPayoutRate values', () => {
    const htmlCoins = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
        initialMetric="avgDiff"
      />
    );
    // 7のつく日 avgDiff = (500 + 400 + 450) / 3 = 450 -> displays +450
    expect(htmlCoins).toContain('+450');

    const htmlPayout = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
        initialMetric="payoutRate"
      />
    );
    expect(htmlPayout).toContain('%');

    const htmlHighPayout = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
        initialMetric="highPayoutRate"
      />
    );
    expect(htmlHighPayout).toContain('高出率台の率');
  });

  it('3. ViewMode switching: renders heatmap, table, or chart correctly', () => {
    const htmlHeatmap = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="dow"
        initialViewMode="heatmap"
      />
    );
    expect(htmlHeatmap).toContain('凡例:');
    expect(htmlHeatmap).toContain('高還元 (+300枚 / 102%超)');

    const htmlTable = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="dow"
        initialViewMode="table"
      />
    );
    expect(htmlTable).toContain('出玉還元 TOP 3 (高差枚・好待遇条件)');
    expect(htmlTable).toContain('出玉 ワースト 3 (回収・低勝率条件)');
    expect(htmlTable).toContain('条件区分');

    const htmlChart = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="dow"
        initialViewMode="chart"
      />
    );
    expect(htmlChart).toContain('recharts-responsive-container');
  });

  it('4. Few days handling: labels cells with fewer than 3 days as 日数少 and applies opacity-65', () => {
    // 2のつく日 has only 1 day (2025-01-22) -> count = 1 < 3
    const tailStats = calculateConditionStats(sampleRecords, 'tail');
    const day2Stat = tailStats.find((s) => s.key === '2');
    expect(day2Stat).toBeDefined();
    expect(day2Stat!.count).toBe(1);
    expect(isFewDays(day2Stat!.count)).toBe(true);

    // 7のつく日 has 3 days (07, 17, 27) -> count = 3 >= 3
    const day7Stat = tailStats.find((s) => s.key === '7');
    expect(day7Stat).toBeDefined();
    expect(day7Stat!.count).toBe(3);
    expect(isFewDays(day7Stat!.count)).toBe(false);

    // Test in rendered HTML
    const html = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
        initialViewMode="heatmap"
      />
    );
    expect(html).toContain(FEW_DAYS_LABEL);
    expect(html).toContain('opacity-65');
  });

  it('5. Multi-store overlay: renders a row per store in heatmap view', () => {
    const html = renderToString(
      <ConditionAnalysis
        stores={[storeA, storeB]}
        fixedDimension="tail"
        initialViewMode="heatmap"
      />
    );
    expect(html).toContain('店舗 × のつく日 ヒートマップ（台あたり平均差枚）');
    expect(html).toContain('メガホールA店');
    expect(html).toContain('ギガホールB店');
    expect(html).toContain('1のつく日');
    expect(html).toContain('ゾロ目の日');
  });

  it('6. Number consistency: verifies exact match between component calculations and wrappers', () => {
    const tailStats = calculateConditionStats(sampleRecords, 'tail');

    // 1のつく日: 2025-01-01 (200), 2025-01-11 (800), 2025-01-21 (300)
    // Avg = (200 + 800 + 300) / 3 = 433.3 coins
    const day1Stat = tailStats.find((s) => s.key === '1')!;
    expect(day1Stat.count).toBe(3);
    expect(day1Stat.avgDiffCoins).toBe(433.3);
    expect(day1Stat.totalMachines).toBe(30);
    expect(day1Stat.totalDiffCoins).toBe(13000);

    // ゾロ目の日: 2025-01-01 (200, 1/1月日ゾロ目), 2025-01-11 (800), 2025-01-22 (600)
    // Avg = (200 + 800 + 600) / 3 = 533.3 coins
    const zoroStat = tailStats.find((s) => s.key === 'ゾロ目')!;
    expect(zoroStat.count).toBe(3);
    expect(zoroStat.avgDiffCoins).toBe(533.3);
    expect(zoroStat.totalMachines).toBe(30);
    expect(zoroStat.totalDiffCoins).toBe(16000);

    // Wrap with TailNumberAnalysis
    const htmlWrapper = renderToString(
      <TailNumberAnalysis
        dailyRecords={sampleRecords}
        perspective="player"
        unit="coins"
      />
    );
    expect(htmlWrapper).toContain('+433.3');
    expect(htmlWrapper).toContain('+533.3');

    // Wrap with DayOfWeekAnalysis
    const dowStats = calculateConditionStats(sampleRecords, 'dow');
    const tuesdayStat = dowStats.find((s) => s.key === '火')!;
    // 火: 2025-01-07 (500), 2025-01-14 (-100), 2025-01-21 (300) -> avg = 700 / 3 = 233.3
    expect(tuesdayStat.count).toBe(3);
    expect(tuesdayStat.avgDiffCoins).toBe(233.3);

    const htmlDowWrapper = renderToString(
      <DayOfWeekAnalysis
        dailyRecords={sampleRecords}
        perspective="player"
        unit="coins"
      />
    );
    expect(htmlDowWrapper).toContain('+233.3');
  });

  it('7. Cell color thresholds: tests getConditionHeatmapColor returns appropriate classes', () => {
    // High positive (+300 or more) -> bg-blue-600
    expect(getConditionHeatmapColor('avgDiff', 350, 5).bgClass).toContain('bg-blue-600');
    // Moderate positive (+100 or more) -> bg-blue-100
    expect(getConditionHeatmapColor('avgDiff', 150, 5).bgClass).toContain('bg-blue-100');
    // Strong negative (-300 or less) -> bg-rose-600
    expect(getConditionHeatmapColor('avgDiff', -350, 5).bgClass).toContain('bg-rose-600');
    // Moderate negative (-100 or less) -> bg-rose-100
    expect(getConditionHeatmapColor('avgDiff', -150, 5).bgClass).toContain('bg-rose-100');
    // Zero days -> neutral bg
    expect(getConditionHeatmapColor('avgDiff', 0, 0).bgClass).toContain('bg-slate-50/50');
  });
});
