import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ModelCrossStoreAnalysis } from '../ModelCrossStoreAnalysis';
import { DailyRecord, StoreProfile } from '../../data/types';
import { ALL_STORES_NAME } from '../../utils/storeColors';

function createMockDailyRecord(
  date: string,
  modelName: string,
  machines: number,
  avgDiffCoins: number,
  avgGames = 5000
): DailyRecord {
  const day = parseInt(date.slice(8, 10), 10);
  const totalDiff = avgDiffCoins * machines;
  const inCoins = avgGames * 3 * machines;
  const outCoins = inCoins + totalDiff;
  const payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;

  return {
    date,
    yearMonth: date.slice(0, 7),
    year: parseInt(date.slice(0, 4), 10),
    month: parseInt(date.slice(5, 7), 10),
    day,
    dayOfWeek: '月',
    avgDiffCoins,
    avgGames,
    winRate: 50,
    winMachines: Math.round(machines * 0.5),
    totalMachines: machines,
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
    is7Day: false,
    notable: '',
    models: [
      {
        modelName,
        avgDiffCoins,
        totalDiffCoins: totalDiff,
        avgGames,
        winRate: 50,
        winMachines: Math.round(machines * 0.5),
        totalMachines: machines,
      },
    ],
  };
}

function createMockStore(
  id: string,
  name: string,
  dailyRecords: DailyRecord[]
): StoreProfile {
  return {
    id,
    name,
    totalMachinesApprox: 200,
    dailyRecords,
    address: '東京都',
    oldEventDays: '7のつく日',
    exchangeRate: '50枚/50枚',
    rateLend: 20,
    rateExchange: 20,
    dataRange: '2025-01',
  };
}

describe('Prompt 52: ModelCrossStoreAnalysis Component', () => {
  const storeA = createMockStore('store-a', 'マルハン新宿店', [
    createMockDailyRecord('2025-01-07', 'マイジャグラーV', 10, 150, 6000),
    createMockDailyRecord('2025-01-07', '新宿限定パチスロ', 4, -80, 4000),
  ]);

  const storeB = createMockStore('store-b', 'アイランド秋葉原店', [
    createMockDailyRecord('2025-01-07', 'マイジャグラーV', 20, 250, 7000),
    createMockDailyRecord('2025-01-07', '秋葉原限定パチスロ', 6, 120, 5500),
  ]);

  it('renders cross-store matrix table with stores and 全店合計 columns', () => {
    const html = renderToString(
      <ModelCrossStoreAnalysis
        stores={[storeA, storeB]}
        currentStore={storeA}
      />
    );

    // Title and store headers
    expect(html).toContain('機種×店舗 横断比較分析');
    expect(html).toContain('マルハン新宿店');
    expect(html).toContain('アイランド秋葉原店');
    expect(html).toContain(ALL_STORES_NAME);

    // Common and single badges
    expect(html).toContain('共通(2)');
    expect(html).toContain('単独');

    // Models present
    expect(html).toContain('マイジャグラーV');
    expect(html).toContain('新宿限定パチスロ');
    expect(html).toContain('秋葉原限定パチスロ');
  });

  it('displays setting estimation section with setting equivalent and high setting range for registered model', () => {
    const html = renderToString(
      <ModelCrossStoreAnalysis
        stores={[storeA, storeB]}
        currentStore={storeA}
      />
    );

    // Setting estimation section title
    expect(html).toContain('出率ベース設定推定');
    // For マイジャグラーV (default registered spec), setting equivalent and high setting range are shown
    expect(html).toContain('平均設定相当');
    expect(html).toContain('高設定割合 (設定4以上)');
    expect(html).toContain('設定');
  });

  it('displays unregistered notice for models without setting specifications', () => {
    const storeUnknown = createMockStore('store-c', '別館', [
      createMockDailyRecord('2025-01-07', '完全未登録機XYZ', 5, 200, 5000),
    ]);

    const html = renderToString(
      <ModelCrossStoreAnalysis
        stores={[storeA, storeUnknown]}
        currentStore={storeA}
        initialSelectedModelName="完全未登録機XYZ"
      />
    );

    // Should indicate unregistered spec
    expect(html).toContain('仕様未登録');
  });

  it('provides buttons to open detailed single-store analysis', () => {
    const html = renderToString(
      <ModelCrossStoreAnalysis
        stores={[storeA, storeB]}
        currentStore={storeA}
      />
    );

    expect(html).toContain('個別店舗の詳細機種分析を開く');
    expect(html).toContain('マルハン新宿店');
    expect(html).toContain('アイランド秋葉原店');
  });
});
