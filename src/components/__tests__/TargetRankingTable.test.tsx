import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  TargetRankingTable,
  TargetRankingRow,
  History14DayBarChart,
  HelpTooltip,
  TARGET_TABLE_VIEW_MODE_STORAGE_KEY,
} from '../TargetRankingTable';

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
        {
          date: '2025-01-09',
          dayOfWeek: '木',
          isInCohort: false,
          diff: -450,
          games: 5000,
          payoutRate: 97.0,
          isHighSetting: false,
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

  it('Requirement 1: renders confidence, interval80, reasons and verification badge in detailed mode', () => {
    const html = clean(
      renderToString(
        <TargetRankingTable
          rankingType="machine"
          showStoreColumn={true}
          rows={sampleMachineRows}
          viewMode="detailed"
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
          viewMode="detailed"
        />
      )
    );

    // Expanded state
    expect(html).toContain('スコア寄与の内訳');
    expect(html).toContain('過去の稼働実績履歴 一覧');
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

  /* =======================================================================
   * Prompt 59 Specific Requirements Tests
   * ======================================================================= */
  describe('Prompt 59: 簡易表示（既定）と詳細表示、理由タグ、履歴の棒グラフ', () => {
    it('1. 既定を簡易表示にし、簡易表示では列が「順位 / 店・機種・台番 / 平均との差 / 信頼度 / 理由タグ」の5つだけになる', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={true}
            rows={sampleMachineRows}
            defaultViewMode="simple"
          />
        )
      );

      // Simple table header exists
      expect(html).toContain('data-testid="simple-table-header"');
      expect(html).not.toContain('data-testid="detailed-table-header"');

      // Header matches 5 columns
      expect(html).toContain('順位');
      expect(html).toContain('店舗名・機種・台番');
      expect(html).toContain('平均との差 (範囲棒)');
      expect(html).toContain('信頼度');
      expect(html).toContain('理由タグ');

      // The 5-column simple header must have exactly 5 <th> elements
      const headerMatch = html.match(/<tr[^>]*data-testid="simple-table-header"[^>]*>([\s\S]*?)<\/tr>/);
      expect(headerMatch).not.toBeNull();
      const thMatches = headerMatch![1].match(/<th/g);
      expect(thMatches?.length).toBe(5);

      // Data row in simple mode must have exactly 5 <td> elements
      const rowMatch = html.match(/<tr[^>]*data-testid="simple-row-mach-1"[^>]*>([\s\S]*?)<\/tr>/);
      expect(rowMatch).not.toBeNull();
      const tdMatches = rowMatch![1].match(/<td/g);
      expect(tdMatches?.length).toBe(5);

      // Single-store view: store name is omitted from header
      const singleStoreHtml = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={false}
            rows={sampleMachineRows}
            defaultViewMode="simple"
          />
        )
      );
      expect(singleStoreHtml).toContain('機種・台番');
      expect(singleStoreHtml).not.toContain('店舗名・機種・台番');
    });

    it('1b. 表示切替ボタン「簡易／詳細」が存在し、詳細モードでは全列が表示される', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={true}
            rows={sampleMachineRows}
            viewMode="detailed"
          />
        )
      );

      // Detailed mode header and row rendered
      expect(html).toContain('data-testid="detailed-table-header"');
      expect(html).toContain('data-testid="detailed-row-mach-1"');
      expect(html).toContain('展開');
      expect(html).toContain('期待差枚');
      expect(html).toContain('80%範囲');
      expect(html).toContain('選定理由・根拠');
      expect(html).toContain('検証判定');

      // Toggle buttons
      expect(html).toContain('data-testid="toggle-view-simple"');
      expect(html).toContain('data-testid="toggle-view-detailed"');
    });

    it('2. 理由は buildReasonTags のタグで表示され、展開可能である', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={true}
            rows={sampleMachineRows}
            defaultViewMode="simple"
          />
        )
      );

      // Tags rendered with colors
      expect(html).toContain('同条件の実績 (8日)');
      expect(html).toContain('data-testid="reason-tag-cohort"');
      expect(html).toContain('詳細 ▼');
    });

    it('3. 行を開いたとき、その台の直近14日の差枚を小さな棒グラフ（同じ条件の日を強調、プラス=緑・マイナス=赤）で表示する', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={false}
            rows={sampleMachineRows}
            expandedIds={new Set(['mach-1'])}
            defaultViewMode="simple"
          />
        )
      );

      // History bar chart rendered in expanded section
      expect(html).toContain('data-testid="history-14-bar-chart"');
      expect(html).toContain('直近14日間の差枚推移');

      // Positive bar (Green) and Negative bar (Red)
      expect(html).toContain('data-testid="positive-bar"');
      expect(html).toContain('bg-emerald-500');
      expect(html).toContain('data-testid="negative-bar"');
      expect(html).toContain('bg-rose-500');

      // Same condition day highlight
      expect(html).toContain('data-testid="same-condition-badge"');
      expect(html).toContain('同条件');
    });

    it('3b. History14DayBarChart renders up to 14 days sorted chronologically with stats', () => {
      const history16Days = Array.from({ length: 16 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        dayOfWeek: '月',
        isInCohort: i % 3 === 0,
        diff: i % 2 === 0 ? (i + 1) * 200 : -(i + 1) * 150,
        games: 5000,
      }));

      const html = clean(
        renderToString(<History14DayBarChart history={history16Days} />)
      );

      // Caps to 14 days
      expect(html).toContain('直近14日間の差枚推移 (14日分)');
      expect(html).toContain('プラス日数:');
      expect(html).toContain('同条件日:');
    });

    it('4. 画面幅が640px未満のときは、各行をカード（上段: 順位・店・機種・台番、中段: 平均との差の棒・勝つ確率、下段: タグ）にする', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={true}
            rows={sampleMachineRows}
          />
        )
      );

      // Mobile cards container has block sm:hidden
      expect(html).toContain('data-testid="mobile-cards-container"');
      expect(html).toContain('block sm:hidden');

      // Card elements: Top, Middle, Bottom
      expect(html).toContain('data-testid="mobile-card-mach-1"');
      expect(html).toContain('data-testid="mobile-card-top"');
      expect(html).toContain('data-testid="mobile-card-middle"');
      expect(html).toContain('data-testid="mobile-card-bottom"');

      // Top: Rank, Store, Model, MachineNum
      expect(html).toContain('#1');
      expect(html).toContain('渋谷本館');
      expect(html).toContain('マイジャグラーV');
      expect(html).toContain('555番台');

      // Middle: Diff vs average range bar & win probability
      expect(html).toContain('勝つ確率の目安:');
      expect(html).toContain('信頼度:');

      // Bottom: Reason tags & expand button
      expect(html).toContain('14日履歴');
    });

    it('5. 用語（期待差枚・80%範囲・信頼度）の見出し横に「?」ツールチップがあり、色の凡例は1行で表示される', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            showStoreColumn={true}
            rows={sampleMachineRows}
            viewMode="detailed"
          />
        )
      );

      // Help tooltips exist
      expect(html).toContain('data-testid="tooltip-btn-期待差枚"');
      expect(html).toContain('data-testid="tooltip-btn-80%範囲"');
      expect(html).toContain('data-testid="tooltip-btn-信頼度"');

      // 1-line color legend
      expect(html).toContain('data-testid="ranking-color-legend"');
      expect(html).toContain('凡例:');
      expect(html).toContain('同条件の実績 (青)');
      expect(html).toContain('末尾・ゾロ目 (紫)');
      expect(html).toContain('直近 (緑)');
      expect(html).toContain('機種 (橙)');
      expect(html).toContain('差枚プラス (緑棒)');
      expect(html).toContain('差枚マイナス (赤棒)');
      expect(html).toContain('同条件日 (枠線強調)');
    });

    it('順位・数値が変わらないこと（スコア・期待差枚の計算は不変）', () => {
      const ranks = sampleMachineRows.map((r) => r.rank);
      const diffs = sampleMachineRows.map((r) => r.expectedDiff);
      const machines = sampleMachineRows.map((r) => r.machineNum);

      expect(ranks).toEqual([1, 2]);
      expect(diffs).toEqual([850, 450]);
      expect(machines).toEqual([555, 777]);
    });
  });

  describe('Prompt 60: フロアマップ表示切替', () => {
    it('表示切替「表／フロアマップ」のトグルが表示され、デフォルトは表である', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            rows={sampleMachineRows}
            displayType="table"
          />
        )
      );

      // Header display mode toggle exists
      expect(html).toContain('data-testid="header-display-mode-toggle"');
      expect(html).toContain('data-testid="header-display-mode-table-btn"');
      expect(html).toContain('data-testid="header-display-mode-floormap-btn"');

      // In table mode, desktop table or mobile cards are rendered
      expect(html).toContain('data-testid="desktop-table-container"');
      expect(html).not.toContain('data-testid="target-floor-map-container"');
    });

    it('表示切替でフロアマップを選択すると、TargetFloorMapが表示される', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            rows={sampleMachineRows}
            displayType="floorMap"
            islandConfig="A島: 555-555, B島: 777-777"
          />
        )
      );

      // TargetFloorMap is rendered
      expect(html).toContain('data-testid="target-floor-map-container"');
      expect(html).toContain('data-testid="header-display-mode-floormap-btn"');

      // Table is not rendered
      expect(html).not.toContain('data-testid="desktop-table-container"');
    });

    it('ランキングタイプが model のときは「表／フロアマップ」トグルは表示されない', () => {
      const modelRows: TargetRankingRow[] = [
        {
          id: 'model-1',
          rank: 1,
          modelName: 'マイジャグラーV',
          totalMachines: 10,
          expectedDiff: 500,
          reasons: ['実績好調'],
        },
      ];

      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="model"
            rows={modelRows}
          />
        )
      );

      expect(html).not.toContain('data-testid="header-display-mode-toggle"');
    });
  });

  describe('Prompt 62: 期待×信頼の散布図 (Target Ranking Table integration)', () => {
    it('詳細表示モード時 (viewMode: detailed)、台番詳細セクションに「期待×信頼の散布図」が描画される', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            rows={sampleMachineRows}
            viewMode="detailed"
          />
        )
      );

      // Detailed scatter plot section is rendered
      expect(html).toContain('data-testid="detailed-scatter-section"');
      expect(html).toContain('data-testid="target-expectation-scatter-card"');
      expect(html).toContain('期待×信頼の散布図');
      expect(html).toContain('data-testid="target-zone-rect"');
    });

    it('表示モード切替で「散布図」(displayType: scatter) を指定したとき、散布図が主画面として描画される', () => {
      const html = clean(
        renderToString(
          <TargetRankingTable
            rankingType="machine"
            rows={sampleMachineRows}
            displayType="scatter"
          />
        )
      );

      // Scatter chart is rendered
      expect(html).toContain('data-testid="target-expectation-scatter-card"');
      expect(html).toContain('data-testid="header-display-mode-scatter-btn"');
      // Table is not rendered
      expect(html).not.toContain('data-testid="desktop-table-container"');
    });
  });
});

