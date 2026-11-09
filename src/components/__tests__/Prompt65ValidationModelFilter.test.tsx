import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AccuracyValidation } from '../AccuracyValidation';
import { ModelDeepAnalysis } from '../ModelDeepAnalysis';
import { ConditionAnalysis } from '../ConditionAnalysis';
import { HighPayoutAnalysis } from '../HighPayoutAnalysis';
import { StoreComparison } from '../StoreComparison';
import { StoreProfile } from '../../data/types';
import {
  generateSyntheticDailyRecords,
  createSyntheticMachineRecords,
} from '../../utils/__tests__/testDataGenerator';

describe('Prompt 65: 検証タブと他画面の対象機種表示・低データ信頼性警告・重み上書き確認', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const records30Days = createSyntheticMachineRecords({
    daysCount: 30,
    machinesCount: 10,
    biasedMachineNums: [101, 102],
    biasBonus: 1000,
  });

  const records100Days = createSyntheticMachineRecords({
    daysCount: 100,
    machinesCount: 10,
    biasedMachineNums: [101, 102],
    biasBonus: 1000,
  });

  const recordsFewMachines = createSyntheticMachineRecords({
    daysCount: 100,
    machinesCount: 3,
  });

  const sampleStore: StoreProfile = {
    id: 'store-1',
    name: 'エスパス日拓渋谷本館',
    address: '東京都渋谷区',
    dailyRecords: records30Days,
    rateLend: 46,
    rateExchange: 52,
    exchangeRate: '52枚',
    totalMachinesApprox: 300,
    dataRange: '2024-01-01 - 2024-01-30',
    oldEventDays: '7のつく日',
  };

  const sampleStore2: StoreProfile = {
    id: 'store-2',
    name: 'マルハン新宿東宝ビル店',
    address: '東京都新宿区',
    dailyRecords: records30Days,
    rateLend: 46,
    rateExchange: 50,
    exchangeRate: '50枚',
    totalMachinesApprox: 400,
    dataRange: '2024-01-01 - 2024-01-30',
    oldEventDays: '7のつく日',
  };

  describe('1. 検証タブの上部に対象機種チップを表示（全機種時は非表示）', () => {
    it('機種絞り込みが有効な場合、validation-model-filter-chip が表示される', () => {
      const html = clean(
        renderToString(
          <AccuracyValidation
            dailyRecords={records30Days}
            storeName="テスト店舗"
            onSaveStoreWeights={vi.fn()}
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
          />
        )
      );

      expect(html).toContain('data-testid="validation-model-filter-chip"');
      expect(html).toContain('対象機種: マイジャグラーV（絞り込み中）');
    });

    it('全機種（未絞り込み）の場合、validation-model-filter-chip は表示されない', () => {
      const html = clean(
        renderToString(
          <AccuracyValidation
            dailyRecords={records30Days}
            storeName="テスト店舗"
            onSaveStoreWeights={vi.fn()}
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );

      expect(html).not.toContain('data-testid="validation-model-filter-chip"');
    });
  });

  describe('2. 選択機種のサンプルが少ないときの信頼性注意（90日未満または5台未満）', () => {
    it('選択機種で営業日数が90日未満（30日）の場合、警告バナーが表示される', () => {
      const html = clean(
        renderToString(
          <AccuracyValidation
            dailyRecords={records30Days}
            storeName="テスト店舗"
            onSaveStoreWeights={vi.fn()}
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
          />
        )
      );

      expect(html).toContain('data-testid="validation-low-data-warning"');
      expect(html).toContain('選択機種のデータが少なく、検証の信頼性が低いです');
      expect(html).toContain('検証結果の結論');
    });

    it('選択機種で台数が5台未満（3台）の場合、警告バナーが表示される', () => {
      const html = clean(
        renderToString(
          <AccuracyValidation
            dailyRecords={recordsFewMachines}
            storeName="テスト店舗"
            onSaveStoreWeights={vi.fn()}
            isModelFilterActive={true}
            activeFilterLabel="スマスロ北斗の拳"
          />
        )
      );

      expect(html).toContain('data-testid="validation-low-data-warning"');
      expect(html).toContain('選択機種のデータが少なく、検証の信頼性が低いです');
    });

    it('全機種の場合は、営業日数が90日未満でも警告バナーは表示されない', () => {
      const html = clean(
        renderToString(
          <AccuracyValidation
            dailyRecords={records30Days}
            storeName="テスト店舗"
            onSaveStoreWeights={vi.fn()}
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );

      expect(html).not.toContain('data-testid="validation-low-data-warning"');
    });
  });

  describe('3. 他画面の見出し近くの対象機種チップ表示（全機種時は非表示）', () => {
    const modelRecords = generateSyntheticDailyRecords(42, 30, 8);

    it('ModelDeepAnalysis: 機種絞り込み時に chip が表示され、全機種時は非表示', () => {
      const htmlFiltered = clean(
        renderToString(
          <ModelDeepAnalysis
            dailyRecords={modelRecords}
            perspective="player"
            unit="coins"
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
          />
        )
      );
      expect(htmlFiltered).toContain('data-testid="model-analysis-filter-chip"');
      expect(htmlFiltered).toContain('対象機種: マイジャグラーV（絞り込み中）');

      const htmlAll = clean(
        renderToString(
          <ModelDeepAnalysis
            dailyRecords={modelRecords}
            perspective="player"
            unit="coins"
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );
      expect(htmlAll).not.toContain('data-testid="model-analysis-filter-chip"');
    });

    it('ConditionAnalysis: 機種絞り込み時に chip が表示され、全機種時は非表示', () => {
      const htmlFiltered = clean(
        renderToString(
          <ConditionAnalysis
            dailyRecords={records30Days}
            currentStoreName="テスト店舗"
            isModelFilterActive={true}
            activeFilterLabel="スマスロ北斗の拳"
          />
        )
      );
      expect(htmlFiltered).toContain('data-testid="condition-model-filter-chip"');
      expect(htmlFiltered).toContain('対象機種: スマスロ北斗の拳（絞り込み中）');

      const htmlAll = clean(
        renderToString(
          <ConditionAnalysis
            dailyRecords={records30Days}
            currentStoreName="テスト店舗"
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );
      expect(htmlAll).not.toContain('data-testid="condition-model-filter-chip"');
    });

    it('HighPayoutAnalysis: 機種絞り込み時に chip が表示され、全機種時は非表示', () => {
      const htmlFiltered = clean(
        renderToString(
          <HighPayoutAnalysis
            dailyRecords={records30Days}
            perspective="player"
            unit="coins"
            isModelFilterActive={true}
            activeFilterLabel="アイムジャグラーEX"
          />
        )
      );
      expect(htmlFiltered).toContain('data-testid="high-payout-model-filter-chip"');
      expect(htmlFiltered).toContain('対象機種: アイムジャグラーEX（絞り込み中）');

      const htmlAll = clean(
        renderToString(
          <HighPayoutAnalysis
            dailyRecords={records30Days}
            perspective="player"
            unit="coins"
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );
      expect(htmlAll).not.toContain('data-testid="high-payout-model-filter-chip"');
    });

    it('StoreComparison: 機種絞り込み時に chip が表示され、全機種時は非表示', () => {
      const stores = [sampleStore, sampleStore2];
      const htmlFiltered = clean(
        renderToString(
          <StoreComparison
            stores={stores}
            isModelFilterActive={true}
            activeFilterLabel="マイジャグラーV"
          />
        )
      );
      expect(htmlFiltered).toContain('data-testid="compare-model-filter-chip"');
      expect(htmlFiltered).toContain('対象機種: マイジャグラーV（絞り込み中）');

      const htmlAll = clean(
        renderToString(
          <StoreComparison
            stores={stores}
            isModelFilterActive={false}
            activeFilterLabel="全機種"
          />
        )
      );
      expect(htmlAll).not.toContain('data-testid="compare-model-filter-chip"');
    });
  });

  describe('4. 重み保存時の「全機種用の重みを上書きします」確認モーダル仕様', () => {
    it('ConfirmModal が表示された際、タイトルと上書き保存警告文言、実行ボタンが正しくレンダリングされる', async () => {
      const { ConfirmModal } = await import('../ConfirmModal');
      const htmlModal = clean(
        renderToString(
          <ConfirmModal
            isOpen={true}
            title="全機種用の重みを上書きします"
            message="現在「マイジャグラーV」に絞り込んだデータに基づいて最適化・調整された機種予測の重みです。全機種用の重みとして上書き保存しますか？"
            confirmText="上書き保存する"
            cancelText="キャンセル"
            isDestructive={true}
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />
        )
      );

      expect(htmlModal).toContain('全機種用の重みを上書きします');
      expect(htmlModal).toContain('現在「マイジャグラーV」に絞り込んだデータに基づいて最適化・調整された機種予測の重みです。全機種用の重みとして上書き保存しますか？');
      expect(htmlModal).toContain('上書き保存する');
      expect(htmlModal).toContain('キャンセル');
    });
  });
});
