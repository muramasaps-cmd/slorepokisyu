import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { HighPayoutCrossStoreAnalysis } from '../HighPayoutCrossStoreAnalysis';
import { StoreProfile, DailyRecord } from '../../data/types';
import { ALL_STORES_NAME } from '../../utils/storeColors';

describe('Prompt 53: HighPayoutCrossStoreAnalysis component test', () => {
  const storeA: StoreProfile = {
    id: 'store-a',
    name: 'マルハン新宿店',
    address: '東京都新宿区',
    oldEventDays: '7のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 20,
    dataRange: '2025-01',
    dailyRecords: [
      {
        date: '2025-01-01',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 1,
        dayOfWeek: '水',
        avgDiffCoins: 800,
        avgGames: 6000,
        winRate: 60,
        winMachines: 6,
        totalMachines: 10,
        totalDiffCoins: 1600,
        hallCoinProfit: -1600,
        playerCoinProfit: 1600,
        hallYenProfit: -32000,
        playerYenProfit: 32000,
        inCoins: 180000,
        outCoins: 181600,
        payoutRate: 100.9,
        estimatedRevenue: 90000,
        exchangeGapProfit: 4500,
        gModelHallProfit: -32000,
        gModelPlayerProfit: 32000,
        isOldEventDay: false,
        is7Day: false,
        notable: '',
        models: [
          {
            modelName: 'Lスマスロ北斗の拳',
            avgDiffCoins: 1800,
            totalDiffCoins: 18000,
            avgGames: 7000,
            winRate: 70.0,
            winMachines: 7,
            totalMachines: 10,
          },
          {
            modelName: 'マイジャグラーV',
            avgDiffCoins: 500,
            totalDiffCoins: 5000,
            avgGames: 5000,
            winRate: 50.0,
            winMachines: 5,
            totalMachines: 10,
          },
        ],
      },
      {
        date: '2025-01-02',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 2,
        dayOfWeek: '木',
        avgDiffCoins: 400,
        avgGames: 5000,
        winRate: 50,
        winMachines: 5,
        totalMachines: 10,
        totalDiffCoins: 800,
        hallCoinProfit: -800,
        playerCoinProfit: 800,
        hallYenProfit: -16000,
        playerYenProfit: 16000,
        inCoins: 150000,
        outCoins: 150800,
        payoutRate: 100.5,
        estimatedRevenue: 75000,
        exchangeGapProfit: 3000,
        gModelHallProfit: -16000,
        gModelPlayerProfit: 16000,
        isOldEventDay: false,
        is7Day: false,
        notable: '',
        models: [
          {
            modelName: 'Lスマスロ北斗の拳',
            avgDiffCoins: -200,
            totalDiffCoins: -2000,
            avgGames: 4000,
            winRate: 40.0,
            winMachines: 4,
            totalMachines: 10,
          },
        ],
      },
    ],
  };

  const storeB: StoreProfile = {
    id: 'store-b',
    name: 'エスパス秋葉原本館',
    address: '東京都千代田区',
    oldEventDays: 'ゾロ目の日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 30,
    dataRange: '2025-01',
    dailyRecords: [
      {
        date: '2025-01-01',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 1,
        dayOfWeek: '水',
        avgDiffCoins: 1200,
        avgGames: 6500,
        winRate: 65,
        winMachines: 7,
        totalMachines: 10,
        totalDiffCoins: 2400,
        hallCoinProfit: -2400,
        playerCoinProfit: 2400,
        hallYenProfit: -48000,
        playerYenProfit: 48000,
        inCoins: 195000,
        outCoins: 197400,
        payoutRate: 101.2,
        estimatedRevenue: 95000,
        exchangeGapProfit: 4800,
        gModelHallProfit: -48000,
        gModelPlayerProfit: 48000,
        isOldEventDay: false,
        is7Day: false,
        notable: '',
        models: [
          {
            modelName: 'マイジャグラーV',
            avgDiffCoins: 1500,
            totalDiffCoins: 15000,
            avgGames: 7000,
            winRate: 70.0,
            winMachines: 7,
            totalMachines: 10,
          },
        ],
      },
      {
        date: '2025-01-02',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 2,
        dayOfWeek: '木',
        avgDiffCoins: 600,
        avgGames: 5000,
        winRate: 55,
        winMachines: 6,
        totalMachines: 10,
        totalDiffCoins: 1200,
        hallCoinProfit: -1200,
        playerCoinProfit: 1200,
        hallYenProfit: -24000,
        playerYenProfit: 24000,
        inCoins: 150000,
        outCoins: 151200,
        payoutRate: 100.8,
        estimatedRevenue: 80000,
        exchangeGapProfit: 3500,
        gModelHallProfit: -24000,
        gModelPlayerProfit: 24000,
        isOldEventDay: false,
        is7Day: false,
        notable: '',
        models: [
          {
            modelName: 'マイジャグラーV',
            avgDiffCoins: 1000,
            totalDiffCoins: 10000,
            avgGames: 6000,
            winRate: 60.0,
            winMachines: 6,
            totalMachines: 10,
          },
        ],
      },
      {
        date: '2025-01-03',
        yearMonth: '2025-01',
        year: 2025,
        month: 1,
        day: 3,
        dayOfWeek: '金',
        avgDiffCoins: 300,
        avgGames: 4500,
        winRate: 50,
        winMachines: 5,
        totalMachines: 10,
        totalDiffCoins: 600,
        hallCoinProfit: -600,
        playerCoinProfit: 600,
        hallYenProfit: -12000,
        playerYenProfit: 12000,
        inCoins: 135000,
        outCoins: 135600,
        payoutRate: 100.4,
        estimatedRevenue: 70000,
        exchangeGapProfit: 2500,
        gModelHallProfit: -12000,
        gModelPlayerProfit: 12000,
        isOldEventDay: false,
        is7Day: false,
        notable: '',
        models: [
          {
            modelName: 'マイジャグラーV',
            avgDiffCoins: -200,
            totalDiffCoins: -2000,
            avgGames: 4000,
            winRate: 40.0,
            winMachines: 4,
            totalMachines: 10,
          },
        ],
      },
    ],
  };

  it('renders cross-store table with store headers and All Stores Total', () => {
    const html = renderToString(
      <HighPayoutCrossStoreAnalysis
        stores={[storeA, storeB]}
        currentStore={storeA}
        perspective="player"
      />
    );

    // Title and badges
    expect(html).toContain('高出率台 横断比較分析');
    expect(html).toContain('対象 2店舗 + 全店合計');

    // Store names and Total column
    expect(html).toContain('マルハン新宿店');
    expect(html).toContain('エスパス秋葉原本館');
    expect(html).toContain(ALL_STORES_NAME);

    // Warning for storeA having 2 days (< 3 days)
    expect(html).toContain('日数少');
    expect(html).toContain('対象日数が少ない店舗があります');
    expect(html).toContain('マルハン新宿店 は対象日数が3日未満');

    // 4 sections in table
    expect(html).toContain('① 基本稼働 &amp; 全体高出率指標');
    expect(html).toContain('② 機種カテゴリ別');
    expect(html).toContain('③ 台数規模別');
    expect(html).toContain('④ 投入形態 &amp; 前日相関');

    // Indicators
    expect(html).toContain('高出率台の率（全体）');
    expect(html).toContain('スマスロ');
    expect(html).toContain('ジャグラー');
    expect(html).toContain('多台数主力 (10台以上)');
    expect(html).toContain('複数機種同時投入率');
    expect(html).toContain('凹み台上げ狙い率');
    expect(html).toContain('据え置き狙い率');
  });

  it('renders chart options and deep-dive shortcuts to stores', () => {
    const onSelectStore = vi.fn();
    const html = renderToString(
      <HighPayoutCrossStoreAnalysis
        stores={[storeA, storeB]}
        currentStore={storeA}
        onSelectStore={onSelectStore}
      />
    );

    // Chart toggles
    expect(html).toContain('全体高出率台の率');
    expect(html).toContain('機種カテゴリ構成');
    expect(html).toContain('台数規模別構成');
    expect(html).toContain('投入傾向（上げ/据置/並び）');

    // Shortcut buttons
    expect(html).toContain('店舗別の個別詳細分析（機種別ランキング・安定度マトリクス・カルテ）を開く');
  });
});
