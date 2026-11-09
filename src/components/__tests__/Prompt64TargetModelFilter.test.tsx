import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TargetTab } from '../TargetTab';
import { TargetDecisionSummary } from '../TargetDecisionSummary';
import { TargetFloorMap } from '../TargetFloorMap';
import { CrossStoreTarget } from '../CrossStoreTarget';
import {
  calculateCrossStoreRanking,
  generateTargetListCopyText,
  generateTargetListCsv,
} from '../../utils/crossStoreRanking';
import { StoreProfile } from '../../data/types';
import { generateSyntheticDailyRecords } from '../../utils/__tests__/testDataGenerator';

describe('Prompt 64: 狙い画面の表示を選択機種に合わせる', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const sampleRecords = generateSyntheticDailyRecords(100, 30, 8);
  const sampleStore1: StoreProfile = {
    id: 'store-1',
    name: 'エスパス日拓渋谷本館',
    address: '東京都渋谷区',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 52,
    exchangeRate: '52枚',
    totalMachinesApprox: 300,
    dataRange: '2024-01-01 - 2024-01-30',
    oldEventDays: '7のつく日',
    specialDayRules: { tails: [7] },
  };

  const sampleStore2: StoreProfile = {
    id: 'store-2',
    name: 'マルハン新宿東宝ビル店',
    address: '東京都新宿区',
    dailyRecords: sampleRecords,
    rateLend: 46,
    rateExchange: 50,
    exchangeRate: '50枚',
    totalMachinesApprox: 400,
    dataRange: '2024-01-01 - 2024-01-30',
    oldEventDays: '7のつく日',
    specialDayRules: { tails: [7] },
  };

  const stores = [sampleStore1, sampleStore2];

  describe('1. 対象機種チップの表示と非表示', () => {
    it('機種絞り込みが有効な場合、TargetTabとTargetDecisionSummaryにチップが表示される', () => {
      const htmlTab = clean(
        renderToString(
          <TargetTab
            targetDate="2024-01-27"
            onTargetDateChange={vi.fn()}
            scope="store"
            onScopeChange={vi.fn()}
            currentStore={sampleStore1}
            stores={stores}
            filteredStoresByModel={stores}
            latestDataDate="2024-01-30"
            onSelectStore={vi.fn()}
            perspective="player"
            unit="coins"
            rateLend={46}
            rateExchange={52}
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
            modelPreset="custom"
            selectedModelNames={['マイジャグラーV']}
          />
        )
      );

      expect(htmlTab).toContain('target-model-filter-chip');
      expect(htmlTab).toContain('対象機種: マイジャグラーV（絞り込み中）');

      const htmlSummary = clean(
        renderToString(
          <TargetDecisionSummary
            targetDate="2024-01-27"
            scope="store"
            storeId="store-1"
            storeName="エスパス日拓渋谷本館"
            candidates={[]}
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
          />
        )
      );

      expect(htmlSummary).toContain('decision-model-filter-chip');
      expect(htmlSummary).toContain('対象機種: マイジャグラーV（絞り込み中）');
    });

    it('全機種選択時（isModelFilterActive=false または activeFilterLabel="全機種"）はチップが表示されない', () => {
      const htmlTab = clean(
        renderToString(
          <TargetTab
            targetDate="2024-01-27"
            onTargetDateChange={vi.fn()}
            scope="store"
            onScopeChange={vi.fn()}
            currentStore={sampleStore1}
            stores={stores}
            filteredStoresByModel={stores}
            latestDataDate="2024-01-30"
            onSelectStore={vi.fn()}
            perspective="player"
            unit="coins"
            rateLend={46}
            rateExchange={52}
            isModelFilterActive={false}
            activeFilterLabel="全機種"
            modelPreset="all"
            selectedModelNames={[]}
          />
        )
      );

      expect(htmlTab).not.toContain('target-model-filter-chip');
      expect(htmlTab).not.toContain('（絞り込み中）');

      const htmlSummary = clean(
        renderToString(
          <TargetDecisionSummary
            targetDate="2024-01-27"
            scope="store"
            storeId="store-1"
            storeName="エスパス日拓渋谷本館"
            candidates={[]}
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );

      expect(htmlSummary).not.toContain('decision-model-filter-chip');
      expect(htmlSummary).not.toContain('（絞り込み中）');
    });
  });

  describe('2. 1機種選択時のステップ③省略と複数機種時の表示', () => {
    it('1機種選択時、ステップ③が省略され「機種は◯◯に絞られています」と表示される (TargetTab/CrossStoreTarget)', () => {
      const htmlCross = clean(
        renderToString(
          <CrossStoreTarget
            stores={stores}
            targetDate="2024-01-27"
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
            isSingleModelSelected={true}
            singleSelectedModelName="マイジャグラーV"
          />
        )
      );

      expect(htmlCross).toContain('機種は「マイジャグラーV」に絞られています');
      expect(htmlCross).toContain('台番ランキングに進む');
      // 上位3機種の要約カードなどは表示されない
      expect(htmlCross).not.toContain('上位3機種の要約');
    });

    it('複数機種やプリセット（スマスロ等）選択時はステップ③は省略されず通常通り表示される', () => {
      const htmlCross = clean(
        renderToString(
          <CrossStoreTarget
            stores={stores}
            targetDate="2024-01-27"
            isModelFilterActive={true}
            activeFilterLabel="スマスロ"
            modelPreset="smart_slot"
            selectedModelNames={['スマスロ北斗の拳', 'からくりサーカス']}
            isSingleModelSelected={false}
          />
        )
      );

      expect(htmlCross).not.toContain('に絞られています');
      expect(htmlCross).toContain('上位3機種の要約');
    });
  });

  describe('3. 機種がない店舗の除外理由と全店対象外バナー', () => {
    it('機種フィルター有効時に台がない店舗は「◯◯店: 選択した機種（◯◯）の台がありません」と除外される', () => {
      // store-1 にはマイジャグあり、store-empty は空データ
      const emptyStore: StoreProfile = {
        ...sampleStore2,
        id: 'store-empty',
        name: '空っぽ店舗',
        dailyRecords: [
          {
            ...sampleRecords[0],
            date: '2024-01-20',
            models: [],
            machines: [],
          },
        ],
      };

      const result = calculateCrossStoreRanking([sampleStore1, emptyStore], '2024-01-27', {
        isModelFilterActive: true,
        activeFilterLabel: 'マイジャグラーV',
      });

      const excluded = result.excludedStores.find((s) => s.storeId === 'store-empty');
      expect(excluded).toBeDefined();
      expect(excluded?.reason).toContain('選択した機種（マイジャグラーV）の台がありません');
    });

    it('選択した機種の台が全店にない場合「選択した機種の台が、どの店にもありません」と表示される', () => {
      const emptyStore1: StoreProfile = {
        ...sampleStore1,
        dailyRecords: [],
      };
      const emptyStore2: StoreProfile = {
        ...sampleStore2,
        dailyRecords: [],
      };

      const html = clean(
        renderToString(
          <CrossStoreTarget
            stores={[emptyStore1, emptyStore2]}
            targetDate="2024-01-27"
            isModelFilterActive={true}
            activeFilterLabel="レア機種"
          />
        )
      );

      expect(html).toContain('選択した機種の台が、どの店にもありません');
    });
  });

  describe('4. 選択機種の日数が少ない（30日未満）店舗への警告表示', () => {
    it('TargetDecisionSummaryで実績日数が30日未満の場合に参考値の警告が表示される', () => {
      const html = clean(
        renderToString(
          <TargetDecisionSummary
            targetDate="2024-01-27"
            scope="store"
            storeId="store-1"
            storeName="エスパス日拓渋谷本館"
            candidates={[]}
            isModelFilterActive={true}
            activeFilterLabel="新台"
            selectedModelDaysCount={12}
          />
        )
      );

      expect(html).toContain('選択機種のデータが少ないため、参考値です');
      expect(html).toContain('実績日数: 12日分');
    });
  });

  describe('5. コピー・CSV書き出しの先頭に対象機種を含める＆フロアマップの非該当台薄灰色表示', () => {
    it('コピー用テキストの先頭に対象機種が含まれる', () => {
      const copyText = generateTargetListCopyText(
        'エスパス日拓渋谷本館',
        '2024-01-27',
        [
          {
            rank: 1,
            machineNum: 555,
            modelName: 'マイジャグラーV',
            expectedDiffCoins: 500,
            reasons: ['テスト根拠'],
          },
        ],
        'マイジャグラーV'
      );

      expect(copyText).toContain('【エスパス日拓渋谷本館】来店日: 2024-01-27 狙い台リスト');
      expect(copyText).toContain('対象機種: マイジャグラーV');
      expect(copyText).toContain('1位: マイジャグラーV 555番台');
    });

    it('CSV出力の先頭ヘッダーに対象機種が含まれる', () => {
      const csvText = generateTargetListCsv(
        'エスパス日拓渋谷本館',
        '2024-01-27',
        [
          {
            rank: 1,
            machineNum: 555,
            modelName: 'マイジャグラーV',
            expectedDiffCoins: 500,
            reasons: ['テスト根拠'],
          },
        ],
        'マイジャグラーV'
      );

      expect(csvText.startsWith('# 対象機種: マイジャグラーV')).toBe(true);
      expect(csvText).toContain('店舗名,来店日,順位,機種名,台番');
    });

    it('TargetFloorMapで選択機種以外の台が薄い灰色で表示されランキングから除外される', () => {
      const rows = [
        {
          id: '1',
          rank: 1,
          modelName: 'マイジャグラーV',
          machineNum: 101,
          expectedDiff: 400,
          confidence: '高' as const,
          reasons: ['テスト根拠'],
        },
        {
          id: '2',
          rank: 2,
          modelName: 'アイムジャグラーEX',
          machineNum: 102,
          expectedDiff: 350,
          confidence: '高' as const,
          reasons: ['テスト根拠'],
        },
      ];

      const html = clean(
        renderToString(
          <TargetFloorMap
            rows={rows}
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
            selectedModelNames={['マイジャグラーV']}
            topN={10}
          />
        )
      );

      // マイジャグラーV (101番台) はハイライトされ、ランクバッジ #1 が表示される
      expect(html).toContain('data-testid="machine-cell-101"');
      expect(html).toContain('data-testid="rank-badge-1"');

      // アイムジャグラーEX (102番台) は非対象のため、ランクバッジが表示されず薄い灰色のクラスが適用される
      expect(html).toContain('data-testid="machine-cell-102"');
      expect(html).not.toContain('data-testid="rank-badge-2"');
    });
  });
});
