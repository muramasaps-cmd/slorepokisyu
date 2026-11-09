import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StoreProfile, DailyRecord, DailyModelRecord, DailyMachineRecord } from '../../data/types';
import { filterDailyRecordsByModels } from '../../utils/modelFilterUtils';
import { processStoreData } from '../../utils/dataEngine';
import { calculateConditionStats } from '../../utils/conditionAnalysis';
import { analyzeHighPayoutMachines } from '../../utils/highPayoutAnalytics';
import { calculateCrossStoreModelRows } from '../../utils/modelCrossStore';
import { compareStores } from '../../utils/storeComparison';
import { calculateTargetMachineRanking } from '../../utils/targetMachineRanking';
import { calculateCrossStoreRanking } from '../../utils/crossStoreRanking';
import { runMachineBacktest } from '../../utils/backtestEngine';
import {
  computeStoreDateScanCacheKey,
  setMemoryScanCache,
  getMemoryScanCache,
  clearMemoryScanCache,
} from '../../utils/crossStoreScanCache';
import {
  computeMachineBacktestCacheKey,
  setMemoryBacktestCache,
  getMemoryBacktestCache,
  clearMemoryBacktestCache,
} from '../../utils/machineBacktestCache';
import {
  CrossRankingController,
  computeStoresSignature,
  CrossRankingWorkerResponse,
} from '../../workers/crossRankingController';
import { KpiCards } from '../KpiCards';
import { ConditionAnalysis } from '../ConditionAnalysis';
import { HighPayoutAnalysis } from '../HighPayoutAnalysis';
import { StoreComparison } from '../StoreComparison';
import { TargetDecisionSummary } from '../TargetDecisionSummary';
import { AccuracyValidation } from '../AccuracyValidation';

describe('プロンプト66: 機種フィルターの回帰テスト', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  /**
   * 1. 2機種（機種A・機種B）で、台数・日数が同じで、差枚の傾向が違う合成データ（2店舗）を作成
   * - 店舗1: 渋谷店 (store-1)
   * - 店舗2: 新宿店 (store-2)
   * - 日数: 30日間 (2025-01-01 〜 2025-01-30)
   * - 台数: 各店舗 10台（機種A 5台 + 機種B 5台）
   * - 差枚傾向:
   *   - 機種A: 大幅プラス（平均差枚 +2,000枚、勝率 80%、出率 ~109.5%、平均G数 7,000G）
   *   - 機種B: マイナス（平均差枚 -800枚、勝率 20%、出率 ~91.1%、平均G数 3,000G）
   */
  const DAYS_COUNT = 30;
  const MACHINES_PER_MODEL = 5;

  function generateTwoModelSyntheticRecords(storeBaseNum: number): DailyRecord[] {
    const records: DailyRecord[] = [];
    const baseDate = new Date(2025, 0, 1);
    const dowNames = ['日', '月', '火', '水', '木', '金', '土'];

    for (let d = 0; d < DAYS_COUNT; d++) {
      const curDate = new Date(baseDate.getTime() + d * 86400000);
      const y = curDate.getFullYear();
      const m = curDate.getMonth() + 1;
      const day = curDate.getDate();
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const yearMonth = `${y}-${String(m).padStart(2, '0')}`;
      const dow = dowNames[curDate.getDay()];
      const isSpecial = day % 7 === 0;

      const machines: DailyMachineRecord[] = [];

      // 機種A: 5台 (storeBaseNum + 1 .. 5)
      for (let i = 1; i <= MACHINES_PER_MODEL; i++) {
        const mNum = storeBaseNum + i;
        const diff = 1800 + i * 80 + (isSpecial ? 300 : 0);
        const games = 7000 + i * 50;
        const payoutRate = Math.round(((games * 3 + diff) / (games * 3)) * 1000) / 10;
        machines.push({
          machineNum: mNum,
          modelName: '機種A',
          diff,
          games,
          payoutRate,
          bb: 30 + i,
          rb: 24 + i,
        });
      }

      // 機種B: 5台 (storeBaseNum + 6 .. 10)
      for (let i = 1; i <= MACHINES_PER_MODEL; i++) {
        const mNum = storeBaseNum + MACHINES_PER_MODEL + i;
        const diff = -900 + i * 40 - (isSpecial ? 100 : 0);
        const games = 3000 + i * 30;
        const payoutRate = Math.round(((games * 3 + diff) / (games * 3)) * 1000) / 10;
        machines.push({
          machineNum: mNum,
          modelName: '機種B',
          diff,
          games,
          payoutRate,
          bb: 10 + i,
          rb: 7 + i,
        });
      }

      const totalMachines = machines.length; // 10台
      const totalDiffCoins = machines.reduce((sum, mach) => sum + mach.diff, 0);
      const totalGames = machines.reduce((sum, mach) => sum + mach.games, 0);
      const winCount = machines.filter((mach) => mach.diff > 0).length;

      // Model breakdown
      const models: DailyModelRecord[] = [
        {
          modelName: '機種A',
          totalMachines: MACHINES_PER_MODEL,
          avgDiffCoins: Math.round(
            machines.filter((mach) => mach.modelName === '機種A').reduce((s, mach) => s + mach.diff, 0) /
              MACHINES_PER_MODEL
          ),
          totalDiffCoins: machines
            .filter((mach) => mach.modelName === '機種A')
            .reduce((s, mach) => s + mach.diff, 0),
          avgGames: Math.round(
            machines.filter((mach) => mach.modelName === '機種A').reduce((s, mach) => s + mach.games, 0) /
              MACHINES_PER_MODEL
          ),
          winMachines: machines.filter((mach) => mach.modelName === '機種A' && mach.diff > 0).length,
          winRate: 80,
        },
        {
          modelName: '機種B',
          totalMachines: MACHINES_PER_MODEL,
          avgDiffCoins: Math.round(
            machines.filter((mach) => mach.modelName === '機種B').reduce((s, mach) => s + mach.diff, 0) /
              MACHINES_PER_MODEL
          ),
          totalDiffCoins: machines
            .filter((mach) => mach.modelName === '機種B')
            .reduce((s, mach) => s + mach.diff, 0),
          avgGames: Math.round(
            machines.filter((mach) => mach.modelName === '機種B').reduce((s, mach) => s + mach.games, 0) /
              MACHINES_PER_MODEL
          ),
          winMachines: machines.filter((mach) => mach.modelName === '機種B' && mach.diff > 0).length,
          winRate: 20,
        },
      ];

      records.push({
        date: dateStr,
        year: y,
        month: m,
        day,
        yearMonth,
        dayOfWeek: dow,
        totalMachines,
        totalDiffCoins,
        avgDiffCoins: Math.round(totalDiffCoins / totalMachines),
        avgGames: Math.round(totalGames / totalMachines),
        winMachines: winCount,
        winRate: Math.round((winCount / totalMachines) * 100),
        hallCoinProfit: -totalDiffCoins,
        playerCoinProfit: totalDiffCoins,
        hallYenProfit: -totalDiffCoins * 20,
        playerYenProfit: totalDiffCoins * 20,
        inCoins: totalGames * 3,
        outCoins: totalGames * 3 + totalDiffCoins,
        payoutRate: Math.round(((totalGames * 3 + totalDiffCoins) / (totalGames * 3)) * 1000) / 10,
        estimatedRevenue: 0,
        exchangeGapProfit: 0,
        gModelHallProfit: -totalDiffCoins * 20,
        gModelPlayerProfit: totalDiffCoins * 20,
        isOldEventDay: isSpecial,
        is7Day: day % 10 === 7,
        notable: isSpecial ? '特日' : '',
        machines,
        models,
      });
    }

    return records;
  }

  // Pure single model daily records generator for direct engine parity check (Requirement 3)
  function createPureModelRecords(rawRecords: DailyRecord[], targetModel: '機種A' | '機種B'): DailyRecord[] {
    return rawRecords.map((r) => {
      const pureMachines = (r.machines || []).filter((m) => m.modelName === targetModel);
      const pureModels = (r.models || []).filter((m) => m.modelName === targetModel);
      const totalMachines = pureMachines.length;
      const totalDiffCoins = pureMachines.reduce((s, m) => s + m.diff, 0);
      const totalGames = pureMachines.reduce((s, m) => s + m.games, 0);
      const winCount = pureMachines.filter((m) => m.diff > 0).length;

      return {
        ...r,
        totalMachines,
        totalDiffCoins,
        avgDiffCoins: Math.round(totalDiffCoins / totalMachines),
        avgGames: Math.round(totalGames / totalMachines),
        winMachines: winCount,
        winRate: Math.round((winCount / totalMachines) * 100),
        machines: pureMachines,
        models: pureModels,
      };
    });
  }

  const store1Records = generateTwoModelSyntheticRecords(100); // 台番 101..110
  const store2Records = generateTwoModelSyntheticRecords(200); // 台番 201..210

  const store1: StoreProfile = {
    id: 'store-1',
    name: 'エスパス日拓渋谷本館',
    address: '東京都渋谷区',
    dailyRecords: store1Records,
    rateLend: 46,
    rateExchange: 52,
    exchangeRate: '52枚',
    totalMachinesApprox: 10,
    dataRange: '2025-01-01 - 2025-01-30',
    oldEventDays: '7のつく日',
    specialDayRules: { tails: [7] },
  };

  const store2: StoreProfile = {
    id: 'store-2',
    name: 'マルハン新宿東宝ビル店',
    address: '東京都新宿区',
    dailyRecords: store2Records,
    rateLend: 46,
    rateExchange: 50,
    exchangeRate: '50枚',
    totalMachinesApprox: 10,
    dataRange: '2025-01-01 - 2025-01-30',
    oldEventDays: '7のつく日',
    specialDayRules: { tails: [7] },
  };

  const stores = [store1, store2];
  const targetDate = '2025-01-30';

  // Pure single model stores
  const store1_pureA: StoreProfile = {
    ...store1,
    totalMachinesApprox: 5,
    dailyRecords: createPureModelRecords(store1Records, '機種A'),
  };
  const store2_pureA: StoreProfile = {
    ...store2,
    totalMachinesApprox: 5,
    dailyRecords: createPureModelRecords(store2Records, '機種A'),
  };
  const store1_pureB: StoreProfile = {
    ...store1,
    totalMachinesApprox: 5,
    dailyRecords: createPureModelRecords(store1Records, '機種B'),
  };
  const store2_pureB: StoreProfile = {
    ...store2,
    totalMachinesApprox: 5,
    dailyRecords: createPureModelRecords(store2Records, '機種B'),
  };

  beforeEach(() => {
    clearMemoryScanCache();
    clearMemoryBacktestCache();
  });

  describe('1. 合成データの前提検証（台数・日数が同一で差枚傾向が異なること）', () => {
    it('両店舗で日数30日、機種A/Bの台数各5台、合計10台であり差枚傾向が逆であること', () => {
      expect(store1Records).toHaveLength(30);
      expect(store2Records).toHaveLength(30);

      const day1 = store1Records[0];
      const machA = day1.machines!.filter((m) => m.modelName === '機種A');
      const machB = day1.machines!.filter((m) => m.modelName === '機種B');

      expect(machA).toHaveLength(5);
      expect(machB).toHaveLength(5);

      const avgDiffA = machA.reduce((s, m) => s + m.diff, 0) / 5;
      const avgDiffB = machB.reduce((s, m) => s + m.diff, 0) / 5;

      expect(avgDiffA).toBeGreaterThan(1500);
      expect(avgDiffB).toBeLessThan(-500);
    });
  });

  describe('2. 機種A → 機種B → 全機種 → 機種A の切替で、各画面・計算に他機種が混ざらないこと', () => {
    // 状態遷移の定義
    const filterStates = [
      { step: 1, label: '機種A', preset: 'custom' as const, selected: ['機種A'] },
      { step: 2, label: '機種B', preset: 'custom' as const, selected: ['機種B'] },
      { step: 3, label: '全機種', preset: 'all' as const, selected: [] },
      { step: 4, label: '機種A (再切替)', preset: 'custom' as const, selected: ['機種A'] },
    ];

    it('A. 概要のKPI: 選択した機種のデータのみで計算され、前の機種の残存がないこと', () => {
      let state1KpiDiff = 0;

      for (const st of filterStates) {
        const filteredStore1Daily = filterDailyRecordsByModels(store1.dailyRecords, st.preset, st.selected);
        const processed = processStoreData(filteredStore1Daily, 46, 52, 35, store1.specialDayRules);
        const monthly = processed.monthlyStats[0];

        if (st.label === '機種A' || st.label === '機種A (再切替)') {
          expect(monthly.avgMachines).toBe(5);
          expect(monthly.totalDiffCoins).toBeGreaterThan(0);
          expect(monthly.avgPayoutRate).toBeGreaterThan(105);
          // 各営業日のmachinesに機種Bが1台も混ざっていないこと
          for (const dr of filteredStore1Daily) {
            expect(dr.machines!.every((m) => m.modelName === '機種A')).toBe(true);
            expect(dr.machines!.some((m) => m.modelName === '機種B')).toBe(false);
          }
          if (st.step === 1) {
            state1KpiDiff = monthly.totalDiffCoins;
          } else if (st.step === 4) {
            expect(monthly.totalDiffCoins).toBe(state1KpiDiff);
          }
        } else if (st.label === '機種B') {
          expect(monthly.avgMachines).toBe(5);
          expect(monthly.totalDiffCoins).toBeLessThan(0);
          expect(monthly.avgPayoutRate).toBeLessThan(95);
          for (const dr of filteredStore1Daily) {
            expect(dr.machines!.every((m) => m.modelName === '機種B')).toBe(true);
            expect(dr.machines!.some((m) => m.modelName === '機種A')).toBe(false);
          }
        } else if (st.label === '全機種') {
          expect(monthly.avgMachines).toBe(10);
          for (const dr of filteredStore1Daily) {
            expect(dr.machines!.length).toBe(10);
          }
        }

        // KpiCards コンポーネントの描画検証
        const html = clean(
          renderToString(
            <KpiCards
              monthlyStats={processed.monthlyStats}
              perspective="player"
              unit="coins"
              profitModel="gCount"
            />
          )
        );
        if (st.selected.includes('機種A')) {
          expect(html).toContain('+'); // プラス差枚
        } else if (st.selected.includes('機種B')) {
          expect(html).toContain('-'); // マイナス差枚
        }
      }
    });

    it('B. 条件別: 曜日・条件別集計が選択機種のみで計算され、切替で他機種が混ざらないこと', () => {
      let state1DowWedDiff = 0;

      for (const st of filterStates) {
        const filteredDaily = filterDailyRecordsByModels(store1.dailyRecords, st.preset, st.selected);
        const dowStats = calculateConditionStats(filteredDaily, 'dow', {
          perspective: 'player',
          oldEventDays: store1.oldEventDays,
          specialDayRules: store1.specialDayRules,
        });

        // 水曜日の平均差枚を検証
        const wed = dowStats.find((b) => b.key === '水');
        expect(wed).toBeDefined();

        if (st.selected.includes('機種A')) {
          expect(wed!.avgDiffCoins).toBeGreaterThan(1500);
          if (st.step === 1) {
            state1DowWedDiff = wed!.avgDiffCoins;
          } else if (st.step === 4) {
            expect(wed!.avgDiffCoins).toBe(state1DowWedDiff);
          }
        } else if (st.selected.includes('機種B')) {
          expect(wed!.avgDiffCoins).toBeLessThan(-500);
        } else {
          // 全機種: AとBの平均
          expect(wed!.avgDiffCoins).toBeGreaterThan(0);
          expect(wed!.avgDiffCoins).toBeLessThan(1500);
        }

        // ConditionAnalysis コンポーネントの描画検証
        const html = clean(
          renderToString(
            <ConditionAnalysis
              dailyRecords={filteredDaily}
              currentStoreName={store1.name}
              isModelFilterActive={st.preset !== 'all'}
              activeFilterLabel={st.label}
            />
          )
        );
        if (st.preset !== 'all') {
          expect(html).toContain('condition-model-filter-chip');
        } else {
          expect(html).not.toContain('condition-model-filter-chip');
        }
      }
    });

    it('C. 高出率台: 抽出される台および集計が選択機種のみに限定されること', () => {
      for (const st of filterStates) {
        const filteredDaily = filterDailyRecordsByModels(store1.dailyRecords, st.preset, st.selected);
        const highPayoutRes = analyzeHighPayoutMachines(filteredDaily, {
          minPayoutRate: 105.0,
          minGames: 3000,
          minDiffCoins: 0,
          categoryFilter: 'all',
        });

        if (st.selected.includes('機種A')) {
          expect(highPayoutRes.highItems.length).toBeGreaterThan(0);
          expect(highPayoutRes.highItems.every((item) => item.modelName === '機種A')).toBe(true);
          expect(highPayoutRes.highItems.some((item) => item.modelName === '機種B')).toBe(false);
        } else if (st.selected.includes('機種B')) {
          // 機種Bは平均91%なので高出率台（105%以上）は0台
          expect(highPayoutRes.highItems.filter((item) => item.modelName === '機種A')).toHaveLength(0);
        } else if (st.preset === 'all') {
          expect(highPayoutRes.highItems.length).toBeGreaterThan(0);
          expect(highPayoutRes.highItems.every((item) => item.modelName === '機種A')).toBe(true);
        }

        // HighPayoutAnalysis コンポーネントの描画検証
        const html = clean(
          renderToString(
            <HighPayoutAnalysis
              dailyRecords={filteredDaily}
              perspective="player"
              unit="coins"
              isModelFilterActive={st.preset !== 'all'}
              activeFilterLabel={st.label}
            />
          )
        );
        if (st.preset !== 'all') {
          expect(html).toContain('high-payout-model-filter-chip');
        } else {
          expect(html).not.toContain('high-payout-model-filter-chip');
        }
      }
    });

    it('D. 機種×店舗: 横断行および集計行が選択機種のみで出現すること', () => {
      for (const st of filterStates) {
        const filteredStores = stores.map((s) => ({
          ...s,
          dailyRecords: filterDailyRecordsByModels(s.dailyRecords, st.preset, st.selected),
        }));

        const modelRows = calculateCrossStoreModelRows(filteredStores);

        if (st.selected.includes('機種A')) {
          expect(modelRows).toHaveLength(1);
          expect(modelRows[0].modelName).toBe('機種A');
          expect(modelRows[0].total.avgDiffCoins).toBeGreaterThan(1500);
        } else if (st.selected.includes('機種B')) {
          expect(modelRows).toHaveLength(1);
          expect(modelRows[0].modelName).toBe('機種B');
          expect(modelRows[0].total.avgDiffCoins).toBeLessThan(-500);
        } else if (st.preset === 'all') {
          expect(modelRows).toHaveLength(2);
          const names = modelRows.map((r) => r.modelName);
          expect(names).toContain('機種A');
          expect(names).toContain('機種B');
        }
      }
    });

    it('E. 店舗比較: 各店舗の平均台数・台あたり差枚が選択機種のみで集計されること', () => {
      let state1Store1Diff = 0;

      for (const st of filterStates) {
        const filteredStores = stores.map((s) => ({
          ...s,
          totalMachinesApprox: st.preset === 'all' ? 10 : 5,
          dailyRecords: filterDailyRecordsByModels(s.dailyRecords, st.preset, st.selected),
        }));

        const compResult = compareStores(filteredStores);
        const s1 = compResult.evaluatedStores.find((m) => m.storeId === 'store-1')!;

        if (st.selected.includes('機種A')) {
          expect(s1.avgMachinesPerDay).toBe(5);
          expect(s1.avgDiffPerMachine).toBeGreaterThan(1500);
          if (st.step === 1) {
            state1Store1Diff = s1.avgDiffPerMachine;
          } else if (st.step === 4) {
            expect(s1.avgDiffPerMachine).toBe(state1Store1Diff);
          }
        } else if (st.selected.includes('機種B')) {
          expect(s1.avgMachinesPerDay).toBe(5);
          expect(s1.avgDiffPerMachine).toBeLessThan(-500);
        } else if (st.preset === 'all') {
          expect(s1.avgMachinesPerDay).toBe(10);
          expect(s1.avgDiffPerMachine).toBeGreaterThan(0);
          expect(s1.avgDiffPerMachine).toBeLessThan(1500);
        }

        // StoreComparison コンポーネント描画検証
        const html = clean(
          renderToString(
            <StoreComparison
              stores={filteredStores}
              isModelFilterActive={st.preset !== 'all'}
              activeFilterLabel={st.label}
            />
          )
        );
        if (st.preset !== 'all') {
          expect(html).toContain('compare-model-filter-chip');
        } else {
          expect(html).not.toContain('compare-model-filter-chip');
        }
      }
    });

    it('F. 狙い（この店・全店）の台番ランキングと今日の結論: 選択機種の台番号のみが出ること', () => {
      for (const st of filterStates) {
        const filteredStore1Daily = filterDailyRecordsByModels(store1.dailyRecords, st.preset, st.selected);
        const filteredStores = stores.map((s) => ({
          ...s,
          dailyRecords: filterDailyRecordsByModels(s.dailyRecords, st.preset, st.selected),
        }));

        // 1. この店（Single Store）
        const singleRank = calculateTargetMachineRanking(
          targetDate,
          filteredStore1Daily,
          store1.specialDayRules,
          store1.customMachineRankingWeights
        );

        if (st.selected.includes('機種A')) {
          expect(singleRank.rankings.length).toBeGreaterThan(0);
          expect(singleRank.rankings.every((r) => r.modelName === '機種A')).toBe(true);
          expect(singleRank.rankings.every((r) => r.machineNum >= 101 && r.machineNum <= 105)).toBe(true);
          expect(singleRank.rankings.some((r) => r.modelName === '機種B')).toBe(false);
          expect(singleRank.rankings.some((r) => r.machineNum >= 106 && r.machineNum <= 110)).toBe(false);
        } else if (st.selected.includes('機種B')) {
          expect(singleRank.rankings.length).toBeGreaterThan(0);
          expect(singleRank.rankings.every((r) => r.modelName === '機種B')).toBe(true);
          expect(singleRank.rankings.every((r) => r.machineNum >= 106 && r.machineNum <= 110)).toBe(true);
          expect(singleRank.rankings.some((r) => r.modelName === '機種A')).toBe(false);
        } else if (st.preset === 'all') {
          // 全機種: 10台すべて対象
          expect(singleRank.rankings.length).toBe(10);
        }

        // 2. 今日の結論（TargetDecisionSummary）
        const candidates = singleRank.rankings.map((m) => ({
          rank: m.rank,
          machineNum: m.machineNum,
          modelName: m.modelName,
          storeName: store1.name,
          storeId: store1.id,
          confidence: m.confidence,
          expectedDiff: m.stats.expectedDiffStd ?? m.stats.shrunkDiff,
          reasons: ['テスト根拠'],
        }));

        const htmlSummary = clean(
          renderToString(
            <TargetDecisionSummary
              targetDate={targetDate}
              scope="store"
              storeId={store1.id}
              storeName={store1.name}
              candidates={candidates}
              isModelFilterActive={st.preset !== 'all'}
              activeFilterLabel={st.label}
            />
          )
        );

        if (st.selected.includes('機種A')) {
          expect(htmlSummary).toContain('機種A');
          expect(htmlSummary).not.toContain('機種B');
        } else if (st.selected.includes('機種B')) {
          expect(htmlSummary).toContain('機種B');
          expect(htmlSummary).not.toContain('機種A');
        }

        // 3. 全店（Cross Store）
        const crossRank = calculateCrossStoreRanking(filteredStores, targetDate, {
          metricMode: 'diffCoins',
          topModelCount: 5,
          topMachineCount: 10,
        });

        if (st.selected.includes('機種A')) {
          expect(crossRank.machineRankings.length).toBeGreaterThan(0);
          expect(crossRank.machineRankings.every((r) => r.modelName === '機種A')).toBe(true);
          expect(crossRank.machineRankings.some((r) => r.modelName === '機種B')).toBe(false);
          expect(crossRank.modelRankings.length).toBeGreaterThan(0);
          expect(crossRank.modelRankings.every((r) => r.modelName === '機種A')).toBe(true);
          expect(new Set(crossRank.modelRankings.map((r) => r.modelName))).toEqual(new Set(['機種A']));
        } else if (st.selected.includes('機種B')) {
          expect(crossRank.machineRankings.length).toBeGreaterThan(0);
          expect(crossRank.machineRankings.every((r) => r.modelName === '機種B')).toBe(true);
          expect(crossRank.machineRankings.some((r) => r.modelName === '機種A')).toBe(false);
          expect(crossRank.modelRankings.length).toBeGreaterThan(0);
          expect(crossRank.modelRankings.every((r) => r.modelName === '機種B')).toBe(true);
          expect(new Set(crossRank.modelRankings.map((r) => r.modelName))).toEqual(new Set(['機種B']));
        } else if (st.preset === 'all') {
          expect(new Set(crossRank.modelRankings.map((r) => r.modelName))).toEqual(new Set(['機種A', '機種B']));
        }
      }
    });

    it('G. 検証のバックテストに渡るデータ: バックテストが選択機種の台のみで実行されること', () => {
      let state1BtActualDiff = 0;

      for (const st of filterStates) {
        const filteredStore1Daily = filterDailyRecordsByModels(store1.dailyRecords, st.preset, st.selected);
        const btResult = runMachineBacktest(filteredStore1Daily, store1.specialDayRules, {
          topN: 5,
          minEvidenceDays: 3,
          bootstrapIterations: 200,
        });

        if (st.selected.includes('機種A')) {
          expect(btResult.withFilter.avgActualDiff).toBeGreaterThan(1500);
          if (st.step === 1) {
            state1BtActualDiff = btResult.withFilter.avgActualDiff;
          } else if (st.step === 4) {
            expect(btResult.withFilter.avgActualDiff).toBe(state1BtActualDiff);
          }
        } else if (st.selected.includes('機種B')) {
          expect(btResult.withFilter.avgActualDiff).toBeLessThan(-500);
        }

        // AccuracyValidation コンポーネント描画検証
        const html = clean(
          renderToString(
            <AccuracyValidation
              dailyRecords={filteredStore1Daily}
              storeName={store1.name}
              onSaveStoreWeights={() => {}}
              isModelFilterActive={st.preset !== 'all'}
              activeFilterLabel={st.label}
            />
          )
        );
        if (st.preset !== 'all') {
          expect(html).toContain('validation-model-filter-chip');
        } else {
          expect(html).not.toContain('validation-model-filter-chip');
        }
      }
    });
  });

  describe('3. 各画面の結果が、選択した機種のデータをエンジンに直接渡した結果と完全一致すること', () => {
    it('機種Aフィルター後の計算結果が、機種Aのみの純粋データを与えた結果と100%一致すること', () => {
      // フィルター適用後のデータ
      const filteredStore1_A = filterDailyRecordsByModels(store1.dailyRecords, 'custom', ['機種A']);
      const filteredStore2_A = filterDailyRecordsByModels(store2.dailyRecords, 'custom', ['機種A']);

      // 1. KPI & 月別集計
      const processedFilteredA = processStoreData(filteredStore1_A, 46, 52, 35, store1.specialDayRules);
      const processedPureA = processStoreData(store1_pureA.dailyRecords, 46, 52, 35, store1.specialDayRules);
      expect(processedFilteredA.monthlyStats[0].totalDiffCoins).toEqual(
        processedPureA.monthlyStats[0].totalDiffCoins
      );
      expect(processedFilteredA.monthlyStats[0].avgPayoutRate).toEqual(
        processedPureA.monthlyStats[0].avgPayoutRate
      );

      // 2. 条件別集計
      const condFilteredA = calculateConditionStats(filteredStore1_A, 'dow');
      const condPureA = calculateConditionStats(store1_pureA.dailyRecords, 'dow');
      expect(condFilteredA.map((c) => ({ key: c.key, diff: c.avgDiffCoins }))).toEqual(
        condPureA.map((c) => ({ key: c.key, diff: c.avgDiffCoins }))
      );

      // 3. 高出率台分析
      const hpFilteredA = analyzeHighPayoutMachines(filteredStore1_A, {
        minPayoutRate: 105.0,
        minGames: 3000,
        minDiffCoins: 0,
        categoryFilter: 'all',
      });
      const hpPureA = analyzeHighPayoutMachines(store1_pureA.dailyRecords, {
        minPayoutRate: 105.0,
        minGames: 3000,
        minDiffCoins: 0,
        categoryFilter: 'all',
      });
      expect(hpFilteredA.highItems.length).toEqual(hpPureA.highItems.length);
      expect(hpFilteredA.insights.overallHighRate).toEqual(hpPureA.insights.overallHighRate);

      // 4. 機種×店舗
      const filteredStoresA = [
        { ...store1, dailyRecords: filteredStore1_A },
        { ...store2, dailyRecords: filteredStore2_A },
      ];
      const pureStoresA = [store1_pureA, store2_pureA];
      const modelRowsFilteredA = calculateCrossStoreModelRows(filteredStoresA);
      const modelRowsPureA = calculateCrossStoreModelRows(pureStoresA);
      expect(modelRowsFilteredA[0].total.avgDiffCoins).toEqual(modelRowsPureA[0].total.avgDiffCoins);
      expect(modelRowsFilteredA[0].total.payoutRate).toEqual(modelRowsPureA[0].total.payoutRate);

      // 5. 店舗比較
      const compFilteredA = compareStores(filteredStoresA);
      const compPureA = compareStores(pureStoresA);
      expect(compFilteredA.evaluatedStores[0].avgDiffPerMachine).toEqual(
        compPureA.evaluatedStores[0].avgDiffPerMachine
      );

      // 6. 単一店狙い台番ランキング
      const targetRankFilteredA = calculateTargetMachineRanking(
        targetDate,
        filteredStore1_A,
        store1.specialDayRules
      );
      const targetRankPureA = calculateTargetMachineRanking(
        targetDate,
        store1_pureA.dailyRecords,
        store1.specialDayRules
      );
      expect(targetRankFilteredA.rankings.map((r) => r.machineNum)).toEqual(
        targetRankPureA.rankings.map((r) => r.machineNum)
      );
      expect(
        targetRankFilteredA.rankings.map((r) => r.stats.expectedDiffStd ?? r.stats.shrunkDiff)
      ).toEqual(
        targetRankPureA.rankings.map((r) => r.stats.expectedDiffStd ?? r.stats.shrunkDiff)
      );

      // 7. 全店狙い台番ランキング
      const crossRankFilteredA = calculateCrossStoreRanking(filteredStoresA, targetDate);
      const crossRankPureA = calculateCrossStoreRanking(pureStoresA, targetDate);
      expect(crossRankFilteredA.machineRankings.map((r) => ({ num: r.machineNum, store: r.storeId }))).toEqual(
        crossRankPureA.machineRankings.map((r) => ({ num: r.machineNum, store: r.storeId }))
      );

      // 8. マシンバックテスト
      const btFilteredA = runMachineBacktest(filteredStore1_A, store1.specialDayRules, {
        topN: 3,
        minEvidenceDays: 3,
        bootstrapIterations: 100,
        seed: 42,
      });
      const btPureA = runMachineBacktest(store1_pureA.dailyRecords, store1.specialDayRules, {
        topN: 3,
        minEvidenceDays: 3,
        bootstrapIterations: 100,
        seed: 42,
      });
      expect(btFilteredA.withFilter.avgActualDiff).toEqual(btPureA.withFilter.avgActualDiff);
    });
  });

  describe('4. Worker・キャッシュ（スキャン・バックテスト）が切替後に前機種の結果を返さないこと', () => {
    it('crossStoreScanCache: 機種Aと機種Bでキーが異なり、キャッシュ汚染・誤返却が起きないこと', () => {
      const recordsA = filterDailyRecordsByModels(store1.dailyRecords, 'custom', ['機種A']);
      const recordsB = filterDailyRecordsByModels(store1.dailyRecords, 'custom', ['機種B']);
      const recordsAll = store1.dailyRecords;

      const keyA = computeStoreDateScanCacheKey('store-1', targetDate, recordsA);
      const keyB = computeStoreDateScanCacheKey('store-1', targetDate, recordsB);
      const keyAll = computeStoreDateScanCacheKey('store-1', targetDate, recordsAll);

      // 3つのキーが全て互いに異なること
      expect(keyA).not.toBe(keyB);
      expect(keyA).not.toBe(keyAll);
      expect(keyB).not.toBe(keyAll);

      // 機種Aの結果をキャッシュに投入
      const cellA = {
        storeId: 'store-1',
        storeName: store1.name,
        targetDate,
        topNAvgExpectedDiff: 2100,
        evaluatedMachinesCount: 5,
        excludedLowConfidenceCount: 0,
        isSpecialDay: false,
        evaluationDays: 29,
      };
      setMemoryScanCache(keyA, cellA);

      // 機種Bで検索した場合、undefined が返り、機種Aの結果が返らないこと
      expect(getMemoryScanCache(keyB)).toBeUndefined();
      expect(getMemoryScanCache(keyAll)).toBeUndefined();
      expect(getMemoryScanCache(keyA)).toEqual(cellA);

      // 機種Bの結果を投入
      const cellB = {
        ...cellA,
        topNAvgExpectedDiff: -750,
      };
      setMemoryScanCache(keyB, cellB);
      expect(getMemoryScanCache(keyB)?.topNAvgExpectedDiff).toBe(-750);
      expect(getMemoryScanCache(keyA)?.topNAvgExpectedDiff).toBe(2100);
    });

    it('machineBacktestCache: 機種Aと機種Bでバックテストキャッシュキーが異なり、誤返却が起きないこと', () => {
      const recordsA = filterDailyRecordsByModels(store1.dailyRecords, 'custom', ['機種A']);
      const recordsB = filterDailyRecordsByModels(store1.dailyRecords, 'custom', ['機種B']);
      const recordsAll = store1.dailyRecords;

      const keyA = computeMachineBacktestCacheKey('store-1', recordsA, undefined, store1.specialDayRules, { topN: 5 });
      const keyB = computeMachineBacktestCacheKey('store-1', recordsB, undefined, store1.specialDayRules, { topN: 5 });
      const keyAll = computeMachineBacktestCacheKey('store-1', recordsAll, undefined, store1.specialDayRules, { topN: 5 });

      expect(keyA).not.toBe(keyB);
      expect(keyA).not.toBe(keyAll);
      expect(keyB).not.toBe(keyAll);

      // バックテスト結果を機種Aに保存
      const dummyResA = runMachineBacktest(recordsA, store1.specialDayRules, {
        topN: 5,
        minEvidenceDays: 3,
        bootstrapIterations: 50,
      });

      setMemoryBacktestCache(keyA, dummyResA);

      // 機種Bや全機種で取得しようとしてもヒットしないこと
      expect(getMemoryBacktestCache(keyB)).toBeUndefined();
      expect(getMemoryBacktestCache(keyAll)).toBeUndefined();
      expect(getMemoryBacktestCache(keyA)).toEqual(dummyResA);
    });

    it('CrossRankingController (Worker): 切替後に前の機種の店舗データやランキングが混ざらないこと', () => {
      const controller = new CrossRankingController();

      const filteredStoresA = stores.map((s) => ({
        ...s,
        dailyRecords: filterDailyRecordsByModels(s.dailyRecords, 'custom', ['機種A']),
      }));
      const filteredStoresB = stores.map((s) => ({
        ...s,
        dailyRecords: filterDailyRecordsByModels(s.dailyRecords, 'custom', ['機種B']),
      }));

      const sigA = computeStoresSignature(filteredStoresA, { preset: 'custom', selectedModelNames: ['機種A'] });
      const sigB = computeStoresSignature(filteredStoresB, { preset: 'custom', selectedModelNames: ['機種B'] });
      const sigAll = computeStoresSignature(stores, { preset: 'all', selectedModelNames: [] });

      expect(sigA).not.toBe(sigB);
      expect(sigA).not.toBe(sigAll);
      expect(sigB).not.toBe(sigAll);

      // 1. 機種A をセットして計算
      controller.handle({
        type: 'SET_STORES',
        signature: sigA,
        stores: filteredStoresA,
      });

      const resA = controller.handle({
        type: 'CALCULATE_CROSS_RANKING',
        requestId: 1,
        targetDate,
      });
      const resultA = resA.find(
        (r): r is Extract<CrossRankingWorkerResponse, { type: 'RESULT' }> => r.type === 'RESULT'
      )?.result;

      expect(resultA).toBeDefined();
      expect(resultA!.machineRankings.length).toBeGreaterThan(0);
      expect(resultA!.machineRankings.every((m) => m.modelName === '機種A')).toBe(true);
      expect(resultA!.machineRankings.some((m) => m.modelName === '機種B')).toBe(false);

      // 2. 機種B に切替（SET_STORES）して計算
      controller.handle({
        type: 'SET_STORES',
        signature: sigB,
        stores: filteredStoresB,
      });

      const resB = controller.handle({
        type: 'CALCULATE_CROSS_RANKING',
        requestId: 2,
        targetDate,
      });
      const resultB = resB.find(
        (r): r is Extract<CrossRankingWorkerResponse, { type: 'RESULT' }> => r.type === 'RESULT'
      )?.result;

      expect(resultB).toBeDefined();
      expect(resultB!.machineRankings.length).toBeGreaterThan(0);
      // 機種Aの台が一切混ざっておらず、すべて機種Bであること
      expect(resultB!.machineRankings.every((m) => m.modelName === '機種B')).toBe(true);
      expect(resultB!.machineRankings.some((m) => m.modelName === '機種A')).toBe(false);

      // 3. 全機種に切替
      controller.handle({
        type: 'SET_STORES',
        signature: sigAll,
        stores,
      });
      const resAll = controller.handle({
        type: 'CALCULATE_CROSS_RANKING',
        requestId: 3,
        targetDate,
      });
      const resultAll = resAll.find(
        (r): r is Extract<CrossRankingWorkerResponse, { type: 'RESULT' }> => r.type === 'RESULT'
      )?.result;
      expect(new Set(resultAll!.modelRankings.map((m) => m.modelName))).toEqual(new Set(['機種A', '機種B']));

      // 4. 機種A に再切替
      controller.handle({
        type: 'SET_STORES',
        signature: sigA,
        stores: filteredStoresA,
      });
      const resA2 = controller.handle({
        type: 'CALCULATE_CROSS_RANKING',
        requestId: 4,
        targetDate,
      });
      const resultA2 = resA2.find(
        (r): r is Extract<CrossRankingWorkerResponse, { type: 'RESULT' }> => r.type === 'RESULT'
      )?.result;

      expect(resultA2!.machineRankings.every((m) => m.modelName === '機種A')).toBe(true);
      expect(resultA2!.machineRankings.map((m) => m.machineNum)).toEqual(
        resultA!.machineRankings.map((m) => m.machineNum)
      );
    });
  });
});
