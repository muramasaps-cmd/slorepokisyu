import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TargetFloorMap } from '../TargetFloorMap';
import { TargetRankingRow } from '../TargetRankingTable';

describe('TargetFloorMap Component (Prompt 60)', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const sampleMachines: TargetRankingRow[] = [
    {
      id: 'mach-101',
      rank: 1,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'マイジャグラーV',
      machineNum: 101,
      expectedDiff: 950,
      confidence: '高',
      evidenceDays: 7,
      reasons: ['同コホート平均+950枚', '特定末尾一致'],
      history: [
        { date: '2025-01-10', dayOfWeek: '金', diff: 1200, games: 6000, isInCohort: true },
        { date: '2025-01-09', dayOfWeek: '木', diff: -300, games: 4500, isInCohort: false },
      ],
      contributions: {
        cohortDiffScore: 20,
        cohortWinRateScore: 10,
        highSettingScore: 5,
        modelScore: 5,
        tailBonusScore: 5,
        recentStateScore: 0,
      },
    },
    {
      id: 'mach-102',
      rank: 2,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'アイムジャグラーEX',
      machineNum: 102,
      expectedDiff: 450,
      confidence: '中',
      evidenceDays: 5,
      reasons: ['同条件5回中3回プラス'],
      history: [{ date: '2025-01-10', dayOfWeek: '金', diff: 500, games: 5000 }],
    },
    {
      id: 'mach-103',
      rank: 3,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'ゴーゴージャグラー3',
      machineNum: 103,
      expectedDiff: -250,
      confidence: '低',
      evidenceDays: 2,
      reasons: ['直近凹み台'],
    },
    {
      id: 'mach-104',
      rank: 12,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'マイジャグラーV',
      machineNum: 104,
      expectedDiff: 100,
      confidence: '低',
      evidenceDays: 1,
      reasons: ['実績少'],
    },
    {
      id: 'mach-201',
      rank: 1,
      storeId: 'store-2',
      storeName: '新宿南口店',
      modelName: 'スマスロ北斗の拳',
      machineNum: 201,
      expectedDiff: 1200,
      confidence: '高',
      evidenceDays: 10,
      reasons: ['看板機種'],
    },
  ];

  it('1. 島設定がある店は、島ごとに台番を並べて表示する (parseIslandConfig / getMachineIsland)', () => {
    const islandConfig = 'A島: 101-102, B島: 103-104';
    const store1Machines = sampleMachines.filter((m) => m.storeId === 'store-1');

    const html = clean(
      renderToString(
        <TargetFloorMap
          rows={store1Machines}
          islandConfig={islandConfig}
          dayMeanExpectedDiff={200}
        />
      )
    );

    // Floor map island view is rendered
    expect(html).toContain('data-testid="floor-map-island-view"');
    expect(html).toContain('data-testid="island-A島"');
    expect(html).toContain('data-testid="island-B島"');
    expect(html).toContain('A島');
    expect(html).toContain('B島');

    // Machines 101, 102 under A島, 103, 104 under B島
    expect(html).toContain('data-testid="machine-cell-101"');
    expect(html).toContain('data-testid="machine-cell-102"');
    expect(html).toContain('data-testid="machine-cell-103"');
    expect(html).toContain('data-testid="machine-cell-104"');
  });

  it('2. 島設定がない店は、台番順に1行10台のグリッドで表示する', () => {
    const store1Machines = sampleMachines.filter((m) => m.storeId === 'store-1');

    const html = clean(
      renderToString(
        <TargetFloorMap
          rows={store1Machines}
          islandConfig=""
          dayMeanExpectedDiff={200}
        />
      )
    );

    // Grid view is rendered
    expect(html).toContain('data-testid="floor-map-grid-view"');
    expect(html).toContain('data-testid="floor-map-grid-10"');
    expect(html).toContain('台番順グリッド表示 (1行10台)');

    // Contains all machines
    expect(html).toContain('data-testid="machine-cell-101"');
    expect(html).toContain('data-testid="machine-cell-102"');
    expect(html).toContain('data-testid="machine-cell-103"');
    expect(html).toContain('data-testid="machine-cell-104"');
  });

  it('3. 平均との差で色分け（緑=良い、赤=悪い、灰=評価なし）される', () => {
    const store1Machines = sampleMachines.filter((m) => m.storeId === 'store-1');
    const dayMean = 200; // mean expected diff is 200

    const html = clean(
      renderToString(
        <TargetFloorMap
          rows={store1Machines}
          dayMeanExpectedDiff={dayMean}
        />
      )
    );

    // mach-101 (expectedDiff 950 > 200) -> green
    expect(html).toMatch(/data-testid="machine-cell-101"[^>]*data-machine-color="green"/);

    // mach-103 (expectedDiff -250 < 200) -> red
    expect(html).toMatch(/data-testid="machine-cell-103"[^>]*data-machine-color="red"/);
  });

  it('4. 上位N台（既定10台）に順位番号バッジが付き、それ以降には付かない', () => {
    const store1Machines = sampleMachines.filter((m) => m.storeId === 'store-1');

    const html = clean(
      renderToString(
        <TargetFloorMap
          rows={store1Machines}
          topN={10}
          dayMeanExpectedDiff={200}
        />
      )
    );

    // Rank 1, 2, 3 have badges
    expect(html).toContain('data-testid="rank-badge-1"');
    expect(html).toContain('data-testid="rank-badge-2"');
    expect(html).toContain('data-testid="rank-badge-3"');

    // Rank 12 does not have badge when topN = 10
    expect(html).not.toContain('data-testid="rank-badge-12"');
  });

  it('5. 機種で絞り込み（選んだ機種の台だけ強調）できる', () => {
    const store1Machines = sampleMachines.filter((m) => m.storeId === 'store-1');

    const html = clean(
      renderToString(
        <TargetFloorMap
          rows={store1Machines}
          selectedModel="マイジャグラーV"
          dayMeanExpectedDiff={200}
        />
      )
    );

    // Mach 101 and 104 are マイジャグラーV -> highlighted
    expect(html).toMatch(/data-testid="machine-cell-101"[^>]*data-highlighted="true"/);
    expect(html).toMatch(/data-testid="machine-cell-104"[^>]*data-highlighted="true"/);

    // Mach 102 is アイムジャグラーEX -> not highlighted (dimmed)
    expect(html).toMatch(/data-testid="machine-cell-102"[^>]*data-highlighted="false"/);
  });

  it('6. チェックリストの「空いていない」の台は、斜線で表示する', () => {
    const store1Machines = sampleMachines.filter((m) => m.storeId === 'store-1');
    const checkedState = {
      101: 'unavailable' as const,
    };

    const html = clean(
      renderToString(
        <TargetFloorMap
          rows={store1Machines}
          checkedState={checkedState}
          dayMeanExpectedDiff={200}
        />
      )
    );

    // Mach 101 is marked unavailable with diagonal hatch overlay
    expect(html).toMatch(/data-testid="machine-cell-101"[^>]*data-unavailable="true"/);
    expect(html).toContain('data-testid="unavailable-machine-101"');
    expect(html).toContain('空き無');

    // Mach 102 is available
    expect(html).toMatch(/data-testid="machine-cell-102"[^>]*data-unavailable="false"/);
  });

  it('7. 全店のときは、店舗を切り替えて表示する（1店ずつ）', () => {
    const stores = [
      { id: 'store-1', name: '渋谷本館', islandConfig: 'A島: 101-104' },
      { id: 'store-2', name: '新宿南口店', islandConfig: 'メイン島: 201-205' },
    ];

    const htmlStore1 = clean(
      renderToString(
        <TargetFloorMap
          rows={sampleMachines}
          stores={stores}
          isCrossStore={true}
          activeStoreId="store-1"
          dayMeanExpectedDiff={200}
        />
      )
    );

    // Store selector exists
    expect(htmlStore1).toContain('data-testid="floor-map-store-selector"');
    expect(htmlStore1).toContain('渋谷本館');
    expect(htmlStore1).toContain('新宿南口店');

    // Active store is store-1: shows 101, but NOT 201
    expect(htmlStore1).toContain('data-testid="machine-cell-101"');
    expect(htmlStore1).not.toContain('data-testid="machine-cell-201"');

    // When active store is store-2: shows 201, but NOT 101
    const htmlStore2 = clean(
      renderToString(
        <TargetFloorMap
          rows={sampleMachines}
          stores={stores}
          isCrossStore={true}
          activeStoreId="store-2"
          dayMeanExpectedDiff={200}
        />
      )
    );

    expect(htmlStore2).toContain('data-testid="machine-cell-201"');
    expect(htmlStore2).not.toContain('data-testid="machine-cell-101"');
  });
});
