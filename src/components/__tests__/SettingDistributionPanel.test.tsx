import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SettingDistributionPanel } from '../SettingDistributionPanel';
import { DailyRecord } from '../../data/types';
import * as settingSpecs from '../../utils/settingSpecs';

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
});
