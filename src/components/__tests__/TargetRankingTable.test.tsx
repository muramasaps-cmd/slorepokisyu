import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TargetRankingTable, TargetRankingRow } from '../TargetRankingTable';

describe('TargetRankingTable Component', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const sampleMachineRows: TargetRankingRow[] = [
    {
      id: 'mach-1',
      rank: 1,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'マイジャグラーV',
      machineNum: 555,
      islandName: '中央島',
      confidence: '高',
      evidenceDays: 8,
      reliabilityRate: 85,
      expectedDiff: 850,
      expectedYen: 17000,
      interval80: [350, 1350],
      score: 42.5,
      reasons: ['同コホート8回中6回プラス、平均+850枚', '高設定挙動履歴 8日中4日発生'],
      verification: {
        status: 'edge',
        hasEdge: true,
        avgLift: 320,
        ci95: [120, 520],
      },
      history: [
        {
          date: '2025-01-10',
          dayOfWeek: '金',
          isInCohort: true,
          diff: 1200,
          games: 6500,
          payoutRate: 106.2,
          isHighSetting: true,
        },
      ],
      contributions: {
        cohortDiffScore: 25.0,
        cohortWinRateScore: 8.0,
        highSettingScore: 5.0,
        modelScore: 2.5,
        tailBonusScore: 2.0,
        recentStateScore: 0,
      },
    },
    {
      id: 'mach-2',
      rank: 2,
      storeId: 'store-2',
      storeName: '新宿南口店',
      modelName: 'アイムジャグラーEX',
      machineNum: 777,
      islandName: '壁側島',
      confidence: '中',
      evidenceDays: 5,
      reliabilityRate: 60,
      expectedDiff: 450,
      expectedYen: 9000,
      uncertainty80: { min: 50, max: 850, margin: 400 },
      score: 30.0,
      reasons: ['同コホート5回中3回プラス、平均+450枚'],
      verification: {
        status: 'untested',
        onRunTest: vi.fn(),
      },
    },
  ];

  const sampleModelRows: TargetRankingRow[] = [
    {
      id: 'model-1',
      rank: 1,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'スマスロ北斗の拳',
      totalMachines: 12,
      expectedDiff: 620,
      expectedYen: 12400,
      winRate: 65,
      payoutRate: 104.5,
      score: 55.0,
      reasons: ['特日平均差枚 +620枚 (勝率65%)'],
      tacticalReason: '看板メイン機種・高配分実績多数',
      subMachines: [
        {
          id: 'sub-1',
          rank: 0,
          modelName: 'スマスロ北斗の拳',
          machineNum: 101,
          confidence: '高',
          evidenceDays: 6,
          expectedDiff: 800,
          interval80: [200, 1400],
          score: 35,
          reasons: ['特定末尾一致'],
        },
      ],
    },
  ];

  it('Requirement 1: hides store column when showStoreColumn is false (single store)', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="machine"
          showStoreColumn={false}
          rows={sampleMachineRows}
        />
      )
    );

    expect(html).not.toContain('渋谷本館');
    expect(html).not.toContain('新宿南口店');
    expect(html).toContain('マイジャグラーV');
    expect(html).toContain('555番台');
  });

  it('Requirement 1: shows store column when showStoreColumn is true (all stores)', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="machine"
          showStoreColumn={true}
          rows={sampleMachineRows}
        />
      )
    );

    expect(html).toContain('渋谷本館');
    expect(html).toContain('新宿南口店');
    expect(html).toContain('店舗名');
  });

  it('Requirement 1: renders confidence, interval80, reasons and verification badge', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="machine"
          showStoreColumn={true}
          rows={sampleMachineRows}
        />
      )
    );

    // Confidence badge
    expect(html).toContain('高');
    expect(html).toContain('根拠8日');

    // 80% range
    expect(html).toContain('+350〜+1,350枚');

    // Verification badge
    expect(html).toContain('優位性あり');
    expect(html).toContain('リフト: +320枚');
    expect(html).toContain('検証');
  });

  it('Requirement 2: toolbar supports metric switching, filtering, and copy/export', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="machine"
          showStoreColumn={false}
          rows={sampleMachineRows}
          toolbar={{
            enabled: true,
            availableModels: ['マイジャグラーV', 'アイムジャグラーEX'],
            selectedModel: 'all',
            diffMetric: 'std',
            onDiffMetricChange: vi.fn(),
            baseGames: 5000,
            onBaseGamesChange: vi.fn(),
            includeLowConfidence: false,
            onToggleLowConfidence: vi.fn(),
          }}
        />
      )
    );

    // Metric button and base games
    expect(html).toContain('基準5,000G換算');
    expect(html).toContain('実稼働換算');
    expect(html).toContain('5000');

    // Low confidence toggle
    expect(html).toContain('低信頼も表示');

    // Copy and CSV buttons
    expect(html).toContain('テキストコピー');
    expect(html).toContain('CSV書き出し');
  });

  it('Requirement 2: expands machine history and score contributions when expandedIds provided', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="machine"
          showStoreColumn={false}
          rows={sampleMachineRows}
          expandedIds={new Set(['mach-1'])}
        />
      )
    );

    // Expanded state
    expect(html).toContain('スコア寄与の内訳');
    expect(html).toContain('過去の稼働実績履歴');
    expect(html).toContain('2025-01-10');
    expect(html).toContain('高設定挙動');
  });

  it('Requirement 3: renders model ranking and expands subMachines correctly', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="model"
          showStoreColumn={true}
          rows={sampleModelRows}
          expandedIds={new Set(['model-1'])}
        />
      )
    );

    expect(html).toContain('スマスロ北斗の拳');
    expect(html).toContain('12台');
    expect(html).toContain('勝率: 65%');
    expect(html).toContain('機械割: 104.5%');

    // Expanded submachines
    expect(html).toContain('【渋谷本館】「スマスロ北斗の拳」の対象台番一覧');
    expect(html).toContain('101番台');
  });
});
