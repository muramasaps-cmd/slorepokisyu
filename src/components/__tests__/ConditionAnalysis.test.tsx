import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConditionAnalysis } from '../ConditionAnalysis';
import { HighPayoutAnalysis } from '../HighPayoutAnalysis';
import { ModelDeepAnalysis } from '../ModelDeepAnalysis';
import { SettingDistributionPanel } from '../SettingDistributionPanel';
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

    // Render ConditionAnalysis with tail dimension
    const htmlWrapper = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
        perspective="player"
        unit="coins"
      />
    );
    expect(htmlWrapper).toContain('+433.3');
    expect(htmlWrapper).toContain('+533.3');

    // Dow stats
    const dowStats = calculateConditionStats(sampleRecords, 'dow');
    const tuesdayStat = dowStats.find((s) => s.key === '火')!;
    // 火: 2025-01-07 (500), 2025-01-14 (-100), 2025-01-21 (300) -> avg = 700 / 3 = 233.3
    expect(tuesdayStat.count).toBe(3);
    expect(tuesdayStat.avgDiffCoins).toBe(233.3);

    // Render ConditionAnalysis with dow dimension
    const htmlDowWrapper = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="dow"
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

  it('8. Prompt 39: Dimension special (特日／通常日) & machineTail (末尾) and SpecialDayPatterns sub-detail', () => {
    // 1. Special dimension
    const htmlSpecial = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="special"
        oldEventDays="7のつく日"
      />
    );
    expect(htmlSpecial).toContain('特日／通常日');
    expect(htmlSpecial).toContain('特日 (旧イベント日)');
    expect(htmlSpecial).toContain('通常営業日');
    expect(htmlSpecial).toContain('特日前日');
    expect(htmlSpecial).toContain('特日翌日');
    // SpecialDayPatterns detail is rendered under special dimension
    expect(htmlSpecial).toContain('特日詳細分析（特日サイクル・特日タイプ別・前日翌日）');

    // 2. MachineTail dimension
    const htmlMachineTail = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="machineTail"
      />
    );
    expect(htmlMachineTail).toContain('末尾');
    expect(htmlMachineTail).toContain('末尾0');
    expect(htmlMachineTail).toContain('末尾1');
    expect(htmlMachineTail).toContain('末尾7');
    expect(htmlMachineTail).toContain('末尾ゾロ目');

    // Number consistency: checks that special calculations match expectations
    const specialStats = calculateConditionStats(sampleRecords, 'special', { oldEventDays: '7のつく日' });
    const eventStat = specialStats.find((s) => s.key === 'special');
    expect(eventStat).toBeDefined();
    // 7のつく日 in sampleRecords: 2025-01-07 (500), 2025-01-17 (400), 2025-01-27 (450) -> count = 3
    expect(eventStat!.count).toBe(3);
    expect(eventStat!.avgDiffCoins).toBe(450);
  });

  it('9. Prompt 39: HighPayoutAnalysis contains only 4 tabs and no duplicate tails/timing sections', () => {
    const onNavigateMock = vi.fn();
    const htmlHighPayout = renderToString(
      <HighPayoutAnalysis
        dailyRecords={sampleRecords}
        perspective="player"
        unit="coins"
        onNavigateToConditions={onNavigateMock}
      />
    );
    // Retains the 4 core tabs
    expect(htmlHighPayout).toContain('総合特徴・黄金抽出カルテ');
    expect(htmlHighPayout).toContain('機種カテゴリ別・機種別');
    expect(htmlHighPayout).toContain('投入形態 (前日相関: 上げ vs 据え置き)');
    expect(htmlHighPayout).toContain('台数規模別特徴 (多台数/中規模/バラ)');

    // Duplicate tabs are removed
    expect(htmlHighPayout).not.toContain('末尾別特徴');
    expect(htmlHighPayout).not.toContain('特日・曜日別特徴');
    expect(htmlHighPayout).not.toContain('稼働G数帯別特徴');
    expect(htmlHighPayout).not.toContain('全高出率レコード');

    // Contains link to ConditionAnalysis
    expect(htmlHighPayout).toContain('特日vs通常日・曜日別・末尾別の高出率台割合');
    expect(htmlHighPayout).toContain('条件別に詳しく見る');
  });

  it('10. Prompt 39: ModelDeepAnalysis and SettingDistributionPanel render ConditionAnalysis links without duplicate displays', () => {
    const onNavigateMock = vi.fn();
    const recordsWithModels = sampleRecords.map((r, idx) => ({
      ...r,
      models: [
        {
          modelName: 'マイジャグラーV',
          avgDiffCoins: 200,
          totalDiffCoins: 400,
          avgGames: 6000,
          winRate: 50,
          winMachines: 1,
          totalMachines: 2,
          isSmallCount: false,
        },
      ],
      tails: [
        {
          tailName: '末尾1',
          avgDiffCoins: 200,
          totalDiffCoins: 400,
          avgGames: 6000,
          winRate: 50,
          winMachines: 1,
          totalMachines: 2,
        },
      ],
      machines: [
        {
          machineNum: 100 + idx,
          modelName: 'マイジャグラーV',
          games: 5000,
          diff: 200,
          payoutRate: 101.3,
        },
      ],
    }));

    const htmlDeep = renderToString(
      <ModelDeepAnalysis
        dailyRecords={recordsWithModels}
        perspective="player"
        unit="coins"
        onNavigateToConditions={onNavigateMock}
      />
    );
    expect(htmlDeep).toContain('条件別に詳しく見る (末尾)');

    const htmlSetting = renderToString(
      <SettingDistributionPanel
        dailyRecords={recordsWithModels}
        onNavigateToConditions={onNavigateMock}
      />
    );
    expect(htmlSetting).toContain('条件別の比較:');
    expect(htmlSetting).toContain('条件別に詳しく見る');
  });

  it('11. Prompt 49: Header layout has 2 tiers, min-w-0 on heading, no shrink-0 on switchers, and group labels', () => {
    const html = renderToString(
      <ConditionAnalysis
        dailyRecords={sampleRecords}
        initialDimension="tail"
        unit="coins"
        setUnit={vi.fn()}
      />
    );

    // 1. Heading area has min-w-0 and h2 has min-w-0 break-normal
    expect(html).toContain('min-w-0 flex-1');
    expect(html).toContain('min-w-0 break-normal');

    // 2. Supplementary label is placed outside h2
    expect(html).toContain('(0〜9のつく日 &amp; ゾロ目の日)');

    // 3. Global switchers container does not have shrink-0 or lg:flex-row in header
    expect(html).not.toContain('shrink-0 self-start lg:self-auto');
    expect(html).toContain('flex flex-wrap items-center gap-2 w-full text-xs');

    // 4. Group labels (切り口, 指標, 表示, 単位) are present
    expect(html).toContain('切り口:');
    expect(html).toContain('指標:');
    expect(html).toContain('表示:');
    expect(html).toContain('単位:');
  });
});
