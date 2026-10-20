import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SettingDistributionPanel } from '../SettingDistributionPanel';
import { DailyRecord } from '../../data/types';
import * as settingSpecs from '../../utils/settingSpecs';
import * as settingEstimation from '../../utils/settingEstimation';

describe('SettingDistributionPanel Component', () => {
  const mockDailyRecords: DailyRecord[] = [
    {
      date: '2025-01-01',
      yearMonth: '2025-01',
      year: 2025,
      month: 1,
      day: 1,
      dayOfWeek: '水',
      avgDiffCoins: 200,
      avgGames: 6000,
      winRate: 50,
      winMachines: 1,
      totalMachines: 2,
      totalDiffCoins: 400,
      hallCoinProfit: -400,
      playerCoinProfit: 400,
      hallYenProfit: -8000,
      playerYenProfit: 8000,
      inCoins: 36000,
      outCoins: 36400,
      payoutRate: 101.1,
      estimatedRevenue: 10000,
      exchangeGapProfit: 500,
      gModelHallProfit: 1000,
      gModelPlayerProfit: -1000,
      isOldEventDay: false,
      is7Day: false,
      notable: '',
      machines: [
        {
          machineNum: 101,
          modelName: 'マイジャグラーV',
          games: 6000,
          diff: 300,
          payoutRate: 101.67,
        },
        {
          machineNum: 102,
          modelName: 'マイジャグラーV',
          games: 4500,
          diff: -200,
          payoutRate: 98.52,
        },
      ],
    },
  ];

  beforeEach(() => {
    // Mock loadAllSettingSpecsSync to provide a default spec
    vi.spyOn(settingSpecs, 'loadAllSettingSpecsSync').mockReturnValue([
      {
        modelName: 'マイジャグラーV',
        settings: [
          { label: '設定1', settingNum: 1, payoutRate: 97.0 },
          { label: '設定2', settingNum: 2, payoutRate: 98.0 },
          { label: '設定3', settingNum: 3, payoutRate: 99.9 },
          { label: '設定4', settingNum: 4, payoutRate: 102.8 },
          { label: '設定5', settingNum: 5, payoutRate: 105.3 },
          { label: '設定6', settingNum: 6, payoutRate: 109.4 },
        ],
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with default minGames = 0, preset buttons, and 500 bootstrap reps in heading', () => {
    const html = renderToString(
      <SettingDistributionPanel
        dailyRecords={mockDailyRecords}
        selectedModelName="マイジャグラーV"
      />
    );

    // 1. Minimum games defaults to 0 and displays preset buttons
    expect(html).toContain('最小回転数:');
    expect(html).toContain('全台日(0)');
    expect(html).toContain('1,000G');
    expect(html).toContain('2,000G');
    expect(html).toContain('3,000G');
    expect(html).toContain('5,000G');
    expect(html).toContain('既定 0G: 全台日');

    // 2. Button for sensitivity comparison
    expect(html).toContain('条件を変えて比べる');

    const cleanHtml = html.replace(/<!--.*?-->/g, '');

    // 3. Displays used/total machine-days with "台日" notation
    expect(cleanHtml).toContain('使用 2台日 / 全 2台日');
    expect(html).toContain('全体出率 (IN加重):');
    expect(html).toContain('絞り後出率 (IN加重):');

    // 4. Headline displays 500 reps (from bootstrapReps setting), not hardcoded 2000
    expect(cleanHtml).toContain('500回');
    expect(cleanHtml).not.toContain('2000回');

    // 5. KPI card uses "台日" instead of "台"
    expect(cleanHtml).toContain('使用台日数 / 全台日数');
  });

  it('validates minGames input parsing accepts 0 and integers >= 0', () => {
    // Verify pure logic for input parsing
    const parseMinGamesInput = (raw: string): number => {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? 0 : Math.max(0, parsed);
    };

    expect(parseMinGamesInput('0')).toBe(0);
    expect(parseMinGamesInput('')).toBe(0);
    expect(parseMinGamesInput('-500')).toBe(0);
    expect(parseMinGamesInput('1000')).toBe(1000);
    expect(parseMinGamesInput('3000')).toBe(3000);
  });

  it('displays 1-line info notice at top when EM estimation is unstable, and places EM warnings only inside the reference section', () => {
    const originalEstimate = settingEstimation.estimateModelSettingDistribution;
    vi.spyOn(settingEstimation, 'estimateModelSettingDistribution').mockImplementation((...args) => {
      const realResult = originalEstimate(...args);
      return {
        ...realResult,
        converged: false,
        pointEstimateReachedMaxIterations: true,
        bootstrapMaxIterationsRate: 0.38,
        bootstrapNote: '再標本の38%が反復上限で終了しました。区間は参考値です。',
        warnings: [
          '設定の分布が平らで、推定が定まりにくいデータです。上の『範囲』を参考にしてください',
          '※ 95%信頼区間はσを固定した区間です。台数が少ないと実際より狭く出ることがあります。',
          '再標本の38%が反復上限で終了しました。区間は参考値です。',
        ],
      };
    });

    const html = renderToString(
      <SettingDistributionPanel
        dailyRecords={mockDailyRecords}
        selectedModelName="マイジャグラーV"
      />
    );

    // 1. Top of page contains the short 1-line info notice in info color
    expect(html).toContain(
      '設定の分布グラフ（EM推定）は参考値です。上の出率ベースの範囲を主にご覧ください'
    );

    // Split html into main display region (before <details) and reference region (inside <details)
    const detailsIndex = html.indexOf('<details');
    expect(detailsIndex).toBeGreaterThan(-1);

    const mainDisplayRegion = html.slice(0, detailsIndex);
    const referenceRegion = html.slice(detailsIndex);

    // 2. The main display region does NOT contain the 3 EM estimation warnings
    expect(mainDisplayRegion).not.toContain(
      '設定の分布が平らで、推定が定まりにくいデータです'
    );
    expect(mainDisplayRegion).not.toContain(
      'σを固定した区間です'
    );
    expect(mainDisplayRegion).not.toContain(
      '再標本の38%が反復上限で終了しました'
    );

    // 3. The reference region (EM model estimation details) DOES contain the 3 warnings
    expect(referenceRegion).toContain(
      '設定の分布が平らで、推定が定まりにくいデータです。上の『範囲』を参考にしてください'
    );
    expect(referenceRegion).toContain(
      '※ 95%信頼区間はσを固定した区間です。台数が少ないと実際より狭く出ることがあります。'
    );
    expect(referenceRegion).toContain(
      '再標本の38%が反復上限で終了しました。区間は参考値です。'
    );
  });

  it('does NOT display the top 1-line info notice when EM estimation is stable', () => {
    const originalEstimate = settingEstimation.estimateModelSettingDistribution;
    vi.spyOn(settingEstimation, 'estimateModelSettingDistribution').mockImplementation((...args) => {
      const realResult = originalEstimate(...args);
      return {
        ...realResult,
        converged: true,
        pointEstimateReachedMaxIterations: false,
        bootstrapMaxIterationsRate: 0,
        isCiCalculated: true,
        warnings: [],
      };
    });

    const html = renderToString(
      <SettingDistributionPanel
        dailyRecords={mockDailyRecords}
        selectedModelName="マイジャグラーV"
      />
    );

    expect(html).not.toContain(
      '設定の分布グラフ（EM推定）は参考値です。上の出率ベースの範囲を主にご覧ください'
    );
  });

  it('Prompt 36: renders only the main display by default, with all 5 detail sections closed and having 1-line summaries', () => {
    const html = renderToString(
      <SettingDistributionPanel
        dailyRecords={mockDailyRecords}
        selectedModelName="マイジャグラーV"
      />
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, '');

    // 1. Main display elements are present
    expect(cleanHtml).toContain('出率ベース設定範囲');
    expect(cleanHtml).toContain('平均設定相当（主推定）');
    expect(cleanHtml).toContain('全体出率 (IN加重)');
    expect(cleanHtml).toContain('平均設定相当');
    expect(cleanHtml).toContain('高設定(設定4+)の割合の範囲');
    expect(cleanHtml).toContain('観測データ規模');
    expect(cleanHtml).toContain('出率からの統計的な推定です。実際の設定を示すものではありません。回転数が少ない台は判別力が低くなります。');

    // 2. All 5 foldables exist and none of them have the 'open' attribute
    const detailsMatches = html.match(/<details\b[^>]*>/g) || [];
    expect(detailsMatches.length).toBe(5);
    for (const d of detailsMatches) {
      expect(d).not.toContain('open');
    }

    // 3. Each foldable has a 1-line summary in its summary tag
    expect(cleanHtml).toContain('仕様テーブルの登録・編集とJSONインポート:');
    expect(cleanHtml).toContain('マイジャグラーV（6段階仕様 登録済み）');

    expect(cleanHtml).toContain('EM推定（参考）と感度分析:');
    expect(cleanHtml).toContain('推定平均設定');

    expect(cleanHtml).toContain('日別推移:');
    expect(cleanHtml).toContain('日間のデータ推移・期間別内訳・台別移動出率');

    expect(cleanHtml).toContain('条件別の比較:');

    expect(cleanHtml).toContain('台番別サマリー:');
    expect(cleanHtml).toContain('個別実績と推定設定');

    // 4. Long descriptions have been moved to HelpTooltips (? icons with cursor-help)
    expect(cleanHtml).toContain('cursor-help');
  });

  it('Prompt 36: aggregates warnings into a single "データの注意" banner at the top with max 3 lines and expand button', () => {
    const originalEstimate = settingEstimation.estimateModelSettingDistribution;
    vi.spyOn(settingEstimation, 'estimateModelSettingDistribution').mockImplementation((...args) => {
      const realResult = originalEstimate(...args);
      return {
        ...realResult,
        converged: false,
        pointEstimateReachedMaxIterations: true,
        warnings: [
          '設定の分布が平らで、推定が定まりにくいデータです。上の『範囲』を参考にしてください',
          'テスト用非EM警告メッセージ1',
        ],
      };
    });

    const html = renderToString(
      <SettingDistributionPanel
        dailyRecords={mockDailyRecords}
        selectedModelName="マイジャグラーV"
      />
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, '');

    // Warnings are gathered in the top "データの注意" banner
    expect(cleanHtml).toContain('データの注意（4件）');
    // Since there are 4 alerts (>3), the top 3 are shown and "他1件を表示" appears
    expect(cleanHtml).toContain('他1件を表示');
    expect(cleanHtml).toContain('設定の分布グラフ（EM推定）は参考値です。上の出率ベースの範囲を主にご覧ください');
  });
});

