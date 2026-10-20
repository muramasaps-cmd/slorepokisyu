import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AccuracyValidation } from '../AccuracyValidation';
import {
  generateSyntheticDailyRecords,
  createSyntheticMachineRecords,
} from '../../utils/__tests__/testDataGenerator';

describe('AccuracyValidation (Prompt 37 requirements)', () => {
  const storeRecordsWithoutMachines = generateSyntheticDailyRecords(42, 45, 10);
  const recordsWithMachines = createSyntheticMachineRecords({
    daysCount: 30,
    machinesCount: 20,
    biasedMachineNums: [101, 102],
    biasBonus: 1500,
  });

  it('Requirement 1 & 3: displays 3-line conclusion at top and consolidates unimported machine data message when machine data is missing', () => {
    const html = renderToString(
      <AccuracyValidation
        dailyRecords={storeRecordsWithoutMachines}
        storeName="テスト店舗A"
        onSaveStoreWeights={() => {}}
      />
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, '');

    // Top conclusion card header
    expect(cleanHtml).toContain('検証結果の結論');
    expect(cleanHtml).toContain('バックテスト実績に基づく総合判定 (テスト店舗A)');

    // 1. Line 1: 機種予測の優位性
    expect(cleanHtml).toContain('機種予測の優位性:');
    expect(cleanHtml).toContain('上位3機種リフト:');

    // 2. Line 2: 台番予測の優位性 (未検証: 台番データ未取り込み)
    expect(cleanHtml).toContain('台番予測の優位性:');
    expect(cleanHtml).toContain('未検証');
    expect(cleanHtml).toContain('台番データ未取り込み');

    // 3. Line 3: 推奨する重みの変更 (あり/なし)
    expect(cleanHtml).toContain('推奨する重みの変更:');
    expect(cleanHtml).toContain('なし');

    // Requirement 3: Consolidated message for unimported machine data
    expect(cleanHtml).toContain('台番別データ未取り込み');
    expect(cleanHtml).toContain(
      'この店舗には台番別の実績データ（各台の差枚数・G数など）が取り込まれていません。店舗管理画面から台番別データ（HTML / CSV）を取り込むと、台番単位の予測力検証（Top-Nリフト、ベースライン対比、ブートストラップ優位性検定）が有効になります。'
    );
  });

  it('Requirement 2: renders the 4 detailed sections as closed <details> by default with 1-line summaries in headers', () => {
    const html = renderToString(
      <AccuracyValidation
        dailyRecords={storeRecordsWithoutMachines}
        storeName="テスト店舗B"
        onSaveStoreWeights={() => {}}
      />
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, '');

    // Check that details elements are present and not open
    const detailsMatches = cleanHtml.match(/<details[\s>]/g) || [];
    expect(detailsMatches.length).toBe(4);
    expect(cleanHtml).not.toContain('<details open');

    // 1. 5大ベースライン比較 & 1-line summary
    expect(cleanHtml).toContain('5大ベースライン比較');
    expect(cleanHtml).toContain('全期間比エッジ:');

    // 2. 最適重み探索と有意性検証 & 1-line summary
    expect(cleanHtml).toContain('最適重み探索と有意性検証');
    expect(cleanHtml).toContain('過学習防止型ローリング検証');

    // 3. 台番単位の検証（アブレーション・ローリング検証） & 1-line summary
    expect(cleanHtml).toContain('台番単位の検証（アブレーション・ローリング検証）');
    expect(cleanHtml).toContain('台番データ未取り込み（データ取り込みで検証可能）');

    // 4. 営業日別の履歴 & 1-line summary
    expect(cleanHtml).toContain('営業日別の履歴');
    expect(cleanHtml).toContain('朝予測と当日実績の完全照合ログ');
  });

  it('Requirement 1 with machine data: displays evaluated status for 台番予測', () => {
    const html = renderToString(
      <AccuracyValidation
        dailyRecords={recordsWithMachines}
        storeName="テスト店舗C（台番あり）"
        onSaveStoreWeights={() => {}}
        onSaveStoreMachineWeights={() => {}}
      />
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, '');

    // Top conclusion lines
    expect(cleanHtml).toContain('機種予測の優位性:');
    expect(cleanHtml).toContain('台番予測の優位性:');
    expect(cleanHtml).toContain('Top-10台リフト:');
    expect(cleanHtml).toContain('推奨する重みの変更:');

    // Because machine data is present, the unimported alert banner should not be present
    expect(cleanHtml).not.toContain('台番別データ未取り込み');
  });
});
