import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  TargetExpectationScatter,
  extractScatterPoints,
  isTargetZone,
  calculateScatterRadius,
} from '../TargetExpectationScatter';
import { TargetRankingRow } from '../TargetRankingTable';

describe('TargetExpectationScatter Component (Prompt 62: 期待×信頼の散布図)', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const sampleRows: TargetRankingRow[] = [
    {
      id: 'mach-1',
      rank: 1,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'マイジャグラーV',
      machineNum: 555,
      islandName: '中央島',
      expectedDiff: 850,
      confidence: '高',
      reliabilityRate: 85,
      reliability: 0.85,
      avgGames: 7000,
      evidenceDays: 8,
      interval80: [350, 1350],
      reasons: ['同コホート8回中6回プラス、平均+850枚', '高設定挙動履歴 8日中4日発生'],
      history: [
        { date: '2025-01-10', dayOfWeek: '金', diff: 1200, games: 6500, isInCohort: true },
        { date: '2025-01-09', dayOfWeek: '木', diff: -450, games: 5000, isInCohort: false },
      ],
    },
    {
      id: 'mach-2',
      rank: 2,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'アイムジャグラーEX',
      machineNum: 777,
      islandName: '壁側島',
      expectedDiff: 400,
      confidence: '中',
      reliabilityRate: 60,
      reliability: 0.6,
      avgGames: 5500,
      evidenceDays: 5,
      reasons: ['同コホート5回中3回プラス、平均+400枚'],
    },
    {
      id: 'mach-3',
      rank: 3,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'ゴーゴージャグラー3',
      machineNum: 333,
      islandName: '壁側島',
      expectedDiff: 150,
      confidence: '低',
      reliabilityRate: 35,
      reliability: 0.35,
      avgGames: 4000,
      evidenceDays: 3,
      reasons: ['直近凹み台'],
    },
    {
      id: 'mach-4',
      rank: 4,
      storeId: 'store-1',
      storeName: '渋谷本館',
      modelName: 'ファンキージャグラー2',
      machineNum: 888,
      islandName: '入口島',
      expectedDiff: -250,
      confidence: '低',
      reliabilityRate: 20,
      reliability: 0.2,
      avgGames: 3000,
      evidenceDays: 2,
      reasons: ['実績少'],
    },
    {
      id: 'mach-invalid',
      rank: 99,
      modelName: '評価なし台',
      expectedDiff: NaN,
      reasons: [],
    },
  ];

  const testDayMean = 200; // 平均期待差枚 = +200枚

  describe('1. データ点の数 (Number of data points)', () => {
    it('有効な台番号データのみを抽出し、データ点の数を正しく算出する (無効データやNaNを除外)', () => {
      const points = extractScatterPoints(sampleRows, testDayMean);

      // 4 valid machines with machineNum & numeric expectedDiff; 1 invalid machine (mach-invalid) excluded
      expect(points.length).toBe(4);
      expect(points.map((p) => p.machineNum)).toEqual([555, 777, 333, 888]);
    });

    it('空配列が渡された場合はデータ点0件を返す', () => {
      const points = extractScatterPoints([], testDayMean);
      expect(points.length).toBe(0);
    });

    it('HTMLレンダリング時にSVG内に各台番号のbubble要素が生成される', () => {
      const html = clean(
        renderToString(
          <TargetExpectationScatter
            rows={sampleRows}
            dayMean={testDayMean}
          />
        )
      );

      expect(html).toContain('data-testid="scatter-bubble-555"');
      expect(html).toContain('data-testid="scatter-bubble-777"');
      expect(html).toContain('data-testid="scatter-bubble-333"');
      expect(html).toContain('data-testid="scatter-bubble-888"');
      expect(html).not.toContain('data-testid="scatter-bubble-undefined"');
    });
  });

  describe('2. 座標と泡の大きさ (Coordinates and Bubble Size)', () => {
    it('横軸（X座標）は「全台平均との差 (lift)」として正しく計算される', () => {
      const points = extractScatterPoints(sampleRows, testDayMean);

      // mach-1: expectedDiff 850 - 200 = +650
      expect(points[0].diffFromMean).toBe(650);

      // mach-2: expectedDiff 400 - 200 = +200
      expect(points[1].diffFromMean).toBe(200);

      // mach-3: expectedDiff 150 - 200 = -50
      expect(points[2].diffFromMean).toBe(-50);

      // mach-4: expectedDiff -250 - 200 = -450
      expect(points[3].diffFromMean).toBe(-450);
    });

    it('縦軸（Y座標）は「信頼性 (reliability)」として正しく抽出される', () => {
      const points = extractScatterPoints(sampleRows, testDayMean);

      expect(points[0].reliability).toBe(0.85);
      expect(points[0].reliabilityRate).toBe(85);

      expect(points[1].reliability).toBe(0.6);
      expect(points[1].reliabilityRate).toBe(60);

      expect(points[2].reliability).toBe(0.35);
      expect(points[2].reliabilityRate).toBe(35);

      expect(points[3].reliability).toBe(0.2);
      expect(points[3].reliabilityRate).toBe(20);
    });

    it('泡の大きさ（半径）は「稼働 (平均G数)」に応じて単調増加する', () => {
      const r7000 = calculateScatterRadius(7000);
      const r5500 = calculateScatterRadius(5500);
      const r4000 = calculateScatterRadius(4000);
      const r3000 = calculateScatterRadius(3000);

      expect(r7000).toBeGreaterThan(r5500);
      expect(r5500).toBeGreaterThan(r4000);
      expect(r4000).toBeGreaterThan(r3000);

      // Boundary safety checks
      expect(calculateScatterRadius(0)).toBeGreaterThanOrEqual(6);
      expect(calculateScatterRadius(20000)).toBeLessThanOrEqual(24);
    });
  });

  describe('3. 右上「狙い目」ゾーンの判定 (Sweet Spot / Target Zone Determination)', () => {
    it('isTargetZone pure function: 横軸（平均との差 > 0）かつ 縦軸（信頼性 >= 0.5）のときのみ true を返す', () => {
      // Top-right: average diff > 0 AND reliability >= 0.5
      expect(isTargetZone(300, 0.8)).toBe(true);
      expect(isTargetZone(10, 0.5)).toBe(true);

      // High diff but low reliability (bottom-right) -> false
      expect(isTargetZone(400, 0.49)).toBe(false);
      expect(isTargetZone(500, 0.2)).toBe(false);

      // High reliability but negative diff (top-left) -> false
      expect(isTargetZone(-50, 0.9)).toBe(false);
      expect(isTargetZone(0, 0.8)).toBe(false); // diff = 0 is not > 0

      // Low diff and low reliability (bottom-left) -> false
      expect(isTargetZone(-200, 0.2)).toBe(false);
    });

    it('データ点オブジェクトの isTargetZone フラグが正しく設定される', () => {
      const points = extractScatterPoints(sampleRows, testDayMean);

      // mach-1 (diff: +650, rel: 0.85) -> 狙い目
      expect(points[0].isTargetZone).toBe(true);

      // mach-2 (diff: +200, rel: 0.60) -> 狙い目
      expect(points[1].isTargetZone).toBe(true);

      // mach-3 (diff: -50, rel: 0.35) -> 狙い目ではない (diff <= 0, rel < 0.5)
      expect(points[2].isTargetZone).toBe(false);

      // mach-4 (diff: -450, rel: 0.20) -> 狙い目ではない
      expect(points[3].isTargetZone).toBe(false);
    });

    it('散布図SVG内に右上「狙い目」ゾーンを示す背景矩形とラベルが描画される', () => {
      const html = clean(
        renderToString(
          <TargetExpectationScatter
            rows={sampleRows}
            dayMean={testDayMean}
          />
        )
      );

      expect(html).toContain('data-testid="target-zone-rect"');
      expect(html).toContain('data-testid="target-zone-label"');
      expect(html).toContain('🎯 狙い目ゾーン');
      expect(html).toContain('🎯 狙い目: 2台');
    });
  });

  describe('4. 上位N台への台番表示 (Top N Machine Number Labels)', () => {
    it('上位N台（既定: 上位2台指定時）にのみ台番号ラベルが表示される', () => {
      const html = clean(
        renderToString(
          <TargetExpectationScatter
            rows={sampleRows}
            dayMean={testDayMean}
            defaultTopN={2}
          />
        )
      );

      // Rank 1 (#555) and Rank 2 (#777) have visible labels
      expect(html).toContain('data-testid="scatter-label-555"');
      expect(html).toContain('data-testid="scatter-label-777"');

      // Rank 3 (#333) and Rank 4 (#888) do not have topN labels when topN=2
      expect(html).not.toContain('data-testid="scatter-label-333"');
      expect(html).not.toContain('data-testid="scatter-label-888"');
    });
  });

  describe('5. 詳細表示との統合 (Integration with Detailed View and Detail Drawer)', () => {
    it('台番詳細セクションで期待差枚・平均との差・信頼性・稼働G数が表示される', () => {
      const html = clean(
        renderToString(
          <TargetExpectationScatter
            rows={sampleRows}
            dayMean={testDayMean}
          />
        )
      );

      expect(html).toContain('横軸: 全台平均との差 (枚)');
      expect(html).toContain('縦軸: 信頼性 (reliability)');
      expect(html).toContain('泡の大きさ: 稼働 (平均G数)');
      expect(html).toContain('data-testid="scatter-xaxis-label"');
      expect(html).toContain('data-testid="scatter-yaxis-label"');
    });
  });
});
