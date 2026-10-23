import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PurposeHome,
  getSkipPurposeHome,
  setSkipPurposeHome,
  SKIP_PURPOSE_HOME_STORAGE_KEY,
} from '../PurposeHome';
import { PurposeMenu } from '../PurposeMenu';
import { parseHash } from '../../App';
import { StoreProfile, DailyRecord } from '../../data/types';
import { calculateConditionStats } from '../../utils/conditionAnalysis';
import { analyzeHighPayoutMachines } from '../../utils/highPayoutAnalytics';

describe('Prompt 48: 目的のホーム（質問カード）テストスイート', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const mockDailyRecords: DailyRecord[] = [
    {
      date: '2026-03-01',
      dayOfWeek: '日',
      totalDiffCoins: -500,
      playerCoinProfit: 500,
      totalMachines: 20,
      avgGames: 4000,
      winRate: 55.0,
      isOldEventDay: false,
      models: [
        { modelName: 'マイジャグラーV', totalDiffCoins: 1200, totalMachines: 4, avgGames: 5000, avgDiffCoins: 300, winMachines: 3, winRate: 75.0 },
        { modelName: 'スマスロ北斗の拳', totalDiffCoins: -200, totalMachines: 6, avgGames: 4500, avgDiffCoins: -33, winMachines: 2, winRate: 33.3 },
      ],
      machines: [
        { machineNum: 1, modelName: 'マイジャグラーV', games: 5500, diff: 1500, payoutRate: 109.1 },
        { machineNum: 2, modelName: 'マイジャグラーV', games: 4500, diff: -300, payoutRate: 97.8 },
      ],
    },
    {
      date: '2026-03-07',
      dayOfWeek: '土',
      totalDiffCoins: -1500,
      playerCoinProfit: 1500,
      totalMachines: 20,
      avgGames: 6000,
      winRate: 65.0,
      isOldEventDay: true,
      models: [
        { modelName: 'マイジャグラーV', totalDiffCoins: 2000, totalMachines: 4, avgGames: 7000, avgDiffCoins: 500, winMachines: 4, winRate: 100.0 },
        { modelName: 'スマスロ北斗の拳', totalDiffCoins: 1800, totalMachines: 6, avgGames: 6500, avgDiffCoins: 300, winMachines: 4, winRate: 66.7 },
      ],
      machines: [
        { machineNum: 1, modelName: 'マイジャグラーV', games: 7500, diff: 2200, payoutRate: 109.8 },
        { machineNum: 2, modelName: 'マイジャグラーV', games: 6500, diff: 800, payoutRate: 104.1 },
      ],
    },
  ] as unknown as DailyRecord[];

  const mockStore: StoreProfile = {
    id: 'store-1',
    name: 'テストホール本館',
    address: '東京都新宿区',
    oldEventDays: '7のつく日, 土曜',
    exchangeRate: '46枚貸/52枚交換',
    dataRange: '2026-03-01 〜 2026-03-07',
    rateLend: 46,
    rateExchange: 52,
    totalMachinesApprox: 20,
    dailyRecords: mockDailyRecords,
  };

  const mockStores: StoreProfile[] = [
    mockStore,
    {
      ...mockStore,
      id: 'store-2',
      name: 'テストホール駅前店',
    },
  ];

  const storageMap = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => storageMap.set(k, v),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
    length: 0,
    key: () => null,
  };

  beforeEach(() => {
    storageMap.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: mockStorage },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    storageMap.clear();
  });

  describe('1. 「店舗を分析する」のホーム（質問カード5種と1行説明）', () => {
    it('renders all 5 question cards for analyze with 1-line descriptions', () => {
      const html = clean(
        renderToString(
          <PurposeHome
            purpose="analyze"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            skipHome={false}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
          />
        )
      );

      // Verify title & badges
      expect(html).toContain('店舗を分析する ホーム');
      expect(html).toContain('質問から選ぶ');

      // 1. この店はいつ出す？ -> 条件別
      expect(html).toContain('この店はいつ出す？');
      expect(html).toContain('曜日・のつく日・旧イベント日・末尾ごとの出玉傾向と強い特定日を特定');
      expect(html).toContain('条件別分析');

      // 2. どの機種が強い？ -> 機種別
      expect(html).toContain('どの機種が強い？');
      expect(html).toContain('機種ごとのトータル差枚・平均機械割・高設定投入比率と推定配分');
      expect(html).toContain('機種別分析');

      // 3. 高設定っぽい台の特徴は？ -> 高出率台
      expect(html).toContain('高設定っぽい台の特徴は？');
      expect(html).toContain('出率108%以上の高出率台が投入されやすい曜日や日付パターンの特徴を解明');
      expect(html).toContain('高出率台分析');

      // 4. 他の店と比べると？ -> 店舗比較
      expect(html).toContain('他の店と比べると？');
      expect(html).toContain('登録店舗同士の総差枚・客還元率・特定日実績を同一期間で横断比較');
      expect(html).toContain('店舗比較');

      // 5. 全体の収支は？ -> 概要
      expect(html).toContain('全体の収支は？');
      expect(html).toContain('月別推移グラフ・全体KPI・総合ヒートマップでホールの全体傾向を把握');
      expect(html).toContain('店舗全体像');
    });

    it('renders all question card testids and structure', () => {
      const html = clean(
        renderToString(
          <PurposeHome
            purpose="analyze"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            skipHome={false}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
          />
        )
      );

      expect(html).toContain('data-testid="question-card-conditions"');
      expect(html).toContain('data-testid="question-card-models"');
      expect(html).toContain('data-testid="question-card-high_payout"');
      expect(html).toContain('data-testid="question-card-compare"');
      expect(html).toContain('data-testid="question-card-overview"');
    });
  });

  describe('2. 「指定日の狙い台を決める」のホーム（意思決定ステップ質問カード4種）', () => {
    it('renders all 4 question cards for target with 1-line descriptions', () => {
      const html = clean(
        renderToString(
          <PurposeHome
            purpose="target"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            targetDate="2026-03-07"
            skipHome={false}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
          />
        )
      );

      // Verify title & badges
      expect(html).toContain('指定日の狙い台を決める ホーム');

      // 1. いつ行く？
      expect(html).toContain('いつ行く？');
      expect(html).toContain('全店横断のカレンダースキャンで強い旧イベント日・特日周期を探す');
      expect(html).toContain('来店日スキャン');

      // 2. どの店に行く？
      expect(html).toContain('どの店に行く？');
      expect(html).toContain('特日周期と過去の台番・機種期待値に基づくおすすめ店舗ランキング');
      expect(html).toContain('店舗ランキング');

      // 3. どの機種を打つ？
      expect(html).toContain('どの機種を打つ？');
      expect(html).toContain('類似日の実績・機械割・投入傾向から算出した機種別期待差枚ランキング');
      expect(html).toContain('機種ランキング');

      // 4. どの台を打つ？
      expect(html).toContain('どの台を打つ？');
      expect(html).toContain('据え置き・上げ狙い・末尾特徴から算出した台番号別の詳細期待差枚');
      expect(html).toContain('台番ランキング');
    });
  });

  describe('3. 最新データの要約数値が既存画面の集計と一致', () => {
    it('matches condition stats (最も強い曜日: 土曜) calculated from dataEngine/conditionAnalysis', () => {
      const dowStats = calculateConditionStats(mockDailyRecords, 'dow', {
        perspective: 'player',
        oldEventDays: mockStore.oldEventDays,
      });
      const validDows = dowStats.filter((d) => d.count > 0);
      const bestDow = [...validDows].sort((a, b) => b.avgDiffCoins - a.avgDiffCoins)[0];

      const html = clean(
        renderToString(
          <PurposeHome
            purpose="analyze"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            perspective="player"
            skipHome={false}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
          />
        )
      );

      // Verify condition summary matches bestDow
      expect(html).toContain('最も強い曜日:');
      expect(html).toContain(bestDow.label.slice(0, 1) + '曜');
    });

    it('matches high payout machine analysis calculation', () => {
      const res = analyzeHighPayoutMachines(mockDailyRecords, {
        minPayoutRate: 105.0,
        minGames: 3000,
        minDiffCoins: 0,
        categoryFilter: 'all',
      });
      const rate = res.allItems.length > 0
        ? ((res.highItems.length / res.allItems.length) * 100).toFixed(1)
        : '0.0';

      const html = clean(
        renderToString(
          <PurposeHome
            purpose="analyze"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            skipHome={false}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
          />
        )
      );

      expect(html).toContain(`高出率台割合: ${rate}%`);
    });

    it('matches store count and total profit in compare and overview cards', () => {
      const html = clean(
        renderToString(
          <PurposeHome
            purpose="analyze"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            skipHome={false}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
          />
        )
      );

      // 2 stores
      expect(html).toContain('登録ホール: 全2店舗 (比較可能)');
      // Total player profit: 500 + 1500 = +2,000枚, 2/2 win days = 100.0%
      expect(html).toContain('累計差枚: +2,000枚 (勝率 100.0%)');
    });
  });

  describe('4. ホームを表示しない設定 (skipHome) と直前画面復帰', () => {
    it('persists skipHome setting in localStorage via getSkipPurposeHome / setSkipPurposeHome', () => {
      expect(getSkipPurposeHome()).toBe(false);

      setSkipPurposeHome(true);
      expect(getSkipPurposeHome()).toBe(true);
      expect(localStorage.getItem(SKIP_PURPOSE_HOME_STORAGE_KEY)).toBe('true');

      setSkipPurposeHome(false);
      expect(getSkipPurposeHome()).toBe(false);
      expect(localStorage.getItem(SKIP_PURPOSE_HOME_STORAGE_KEY)).toBe('false');
    });

    it('renders the "設定でホームを表示しない" checkbox and "直前の画面に戻る" button', () => {
      const html = clean(
        renderToString(
          <PurposeHome
            purpose="analyze"
            currentStore={mockStore}
            stores={mockStores}
            dailyRecords={mockDailyRecords}
            monthlyStats={[]}
            skipHome={true}
            onToggleSkipHome={vi.fn()}
            onSelectQuestion={vi.fn()}
            onReturnToLastScreen={vi.fn()}
          />
        )
      );

      expect(html).toContain('設定でホームを表示しない');
      expect(html).toContain('直前の画面に戻る');
      expect(html).toContain('ホームスキップ有効中');
    });
  });

  describe('5. PurposeMenu との連携および parseHash', () => {
    it('shows "何を知りたいか選ぶ（ホーム）" in PurposeMenu breadcrumb when isHome is true', () => {
      const htmlAnalyze = clean(
        renderToString(
          <PurposeMenu
            activeTab="overview"
            analysisSubTab="models"
            targetScope="store"
            isHome={true}
            onNavigate={vi.fn()}
          />
        )
      );
      expect(htmlAnalyze).toContain('店舗を分析する');
      expect(htmlAnalyze).toContain('何を知りたいか選ぶ（ホーム）');

      const htmlTarget = clean(
        renderToString(
          <PurposeMenu
            activeTab="target"
            analysisSubTab="models"
            targetScope="store"
            isHome={true}
            onNavigate={vi.fn()}
          />
        )
      );
      expect(htmlTarget).toContain('指定日の狙い台を決める');
      expect(htmlTarget).toContain('何を知りたいか選ぶ（ホーム）');
    });

    it('correctly resolves home routes in parseHash', () => {
      expect(parseHash('#analyze/home').isHome).toBe(true);
      expect(parseHash('#analysis/home').isHome).toBe(true);
      expect(parseHash('#target/home').isHome).toBe(true);
      expect(parseHash('#target/home').tab).toBe('target');
      expect(parseHash('#target?home=true').isHome).toBe(true);
      expect(parseHash('#home?purpose=target').isHome).toBe(true);
      expect(parseHash('#home?purpose=target').tab).toBe('target');
      expect(parseHash('#overview').isHome).toBeFalsy();
    });
  });
});
