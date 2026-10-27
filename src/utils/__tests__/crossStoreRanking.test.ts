import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateCrossStoreRanking,
  calculateStoreTargetMetrics,
  calculateStoreTargetMetricsForDates,
  generateCandidateScanDates,
  scanCandidateDates,
  convertCoinsToYen,
  calculateUncertainty80,
  filterAndRollupTargetList,
  loadTargetCheckStatus,
  saveTargetCheckStatus,
  generateTargetListCopyText,
  generateTargetListCsv,
  calculateStorePastPerformance,
  CrossStoreMachineRank,
  CrossStoreModelRank,
  CrossStoreFilterCriteria,
  filterMachineRankings,
  filterModelRankings,
  getMachinesForModelRank,
  loadCrossStoreSettings,
  saveCrossStoreSettings,
  CROSS_STORE_SETTINGS_STORAGE_KEY,
} from '../crossStoreRanking';
import {
  computeStoreDateScanCacheKey,
  buildStoreScanPrefixData,
  clearMemoryScanCache,
} from '../crossStoreScanCache';
import * as targetMachineRankingModule from '../targetMachineRanking';
import { runMachineBacktest } from '../backtestEngine';
import { StoreProfile, DailyRecord } from '../../data/types';

function createMockStore(
  id: string,
  name: string,
  rateExchange: number,
  modelsWithDiff: Array<{ name: string; diff: number; machines: number }>,
  machinesWithDiff?: Array<{ num: number; model: string; diff: number }>,
  daysCount: number = 3
): StoreProfile {
  // Generate daysCount Thursdays prior to 2025-01-02 (e.g. 2024-12-12, 2024-12-19, 2024-12-26)
  const baseDates = ['2024-12-12', '2024-12-19', '2024-12-26', '2024-12-05', '2024-11-28'];
  const dates = baseDates.slice(0, daysCount);

  const dailyRecords: DailyRecord[] = dates.map((dateStr, idx) => ({
    date: dateStr,
    yearMonth: dateStr.slice(0, 7),
    year: Number(dateStr.slice(0, 4)),
    month: Number(dateStr.slice(5, 7)),
    day: Number(dateStr.slice(8, 10)),
    dayOfWeek: '木',
    avgDiffCoins: 150,
    avgGames: 6000,
    winRate: 55,
    winMachines: 10,
    totalMachines: 20,
    totalDiffCoins: 3000,
    hallCoinProfit: -3000,
    playerCoinProfit: 3000,
    hallYenProfit: -60000,
    playerYenProfit: 60000,
    inCoins: 360000,
    outCoins: 363000,
    payoutRate: 100.8,
    estimatedRevenue: 200000,
    exchangeGapProfit: 10000,
    gModelHallProfit: 20000,
    gModelPlayerProfit: -20000,
    isOldEventDay: idx === 0,
    is7Day: false,
    notable: '',
    models: modelsWithDiff.map((m) => ({
      modelName: m.name,
      avgDiffCoins: m.diff,
      totalDiffCoins: m.diff * m.machines,
      avgGames: 6000,
      winRate: m.diff > 0 ? 70 : 40,
      winMachines: m.diff > 0 ? Math.round(m.machines * 0.7) : Math.round(m.machines * 0.4),
      totalMachines: m.machines,
    })),
    machines: machinesWithDiff
      ? machinesWithDiff.map((mach) => ({
          machineNum: mach.num,
          modelName: mach.model,
          diff: mach.diff,
          games: 6000,
          payoutRate: 108.0,
        }))
      : undefined,
  }));

  return {
    id,
    name,
    address: '東京都',
    oldEventDays: '1のつく日',
    exchangeRate: `46枚貸/${rateExchange}枚交換`,
    rateLend: 46,
    rateExchange,
    totalMachinesApprox: 20,
    dataRange: '2024-12',
    dailyRecords,
  };
}

describe('crossStoreRanking utils', () => {
  it('converts coins to yen correctly based on exchange rate', () => {
    // 1000 coins @ 50 exchange = 20,000 yen
    expect(convertCoinsToYen(1000, 46, 50)).toBe(20000);
    // 1000 coins @ 52 exchange = 19,231 yen
    expect(convertCoinsToYen(1000, 46, 52)).toBe(19231);
    // -1000 coins @ 46 lend = -21,739 yen
    expect(convertCoinsToYen(-1000, 46, 52)).toBe(-21739);
  });

  // 1. 店舗をまたいで期待差枚順に並ぶ
  it('店舗をまたいで期待差枚順に並ぶ (機種はexpectedDiffCoins、台番はshrunkDiff降順)', () => {
    // Store A: machine 101 expected diff 1500, but lower score
    // Store B: machine 201 expected diff 800, but higher score
    const storeA = createMockStore(
      'store-a',
      '店舗A',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 1500, machines: 5 }],
      [{ num: 101, model: 'スマスロ北斗の拳', diff: 3000 }],
      3
    );

    const storeB = createMockStore(
      'store-b',
      '店舗B',
      50,
      [{ name: 'アイムジャグラーEX', diff: 800, machines: 5 }],
      [{ num: 201, model: 'アイムジャグラーEX', diff: 1500 }],
      3
    );

    const result = calculateCrossStoreRanking([storeA, storeB], '2025-01-02', {
      metricMode: 'diffCoins',
      includeLowConfidence: true,
    });

    expect(result.eligibleStoresCount).toBe(2);
    expect(result.modelRankings.length).toBeGreaterThanOrEqual(2);
    expect(result.machineRankings.length).toBeGreaterThanOrEqual(2);

    // Verify models are sorted strictly descending by expectedDiffCoins
    for (let i = 0; i < result.modelRankings.length - 1; i++) {
      expect(result.modelRankings[i].expectedDiffCoins).toBeGreaterThanOrEqual(
        result.modelRankings[i + 1].expectedDiffCoins
      );
    }

    // Verify machines are sorted strictly descending by shrunkDiff
    for (let i = 0; i < result.machineRankings.length - 1; i++) {
      expect(result.machineRankings[i].shrunkDiff).toBeGreaterThanOrEqual(
        result.machineRankings[i + 1].shrunkDiff
      );
    }

    // Top machine belongs to store-a with higher shrunkDiff
    expect(result.machineRankings[0].storeId).toBe('store-a');
    expect(result.machineRankings[0].machineNum).toBe(101);
  });

  // 2. 低信頼が除外される
  it('低信頼が除外される (includeLowConfidence: falseでは信頼度「低」を除外し、trueで表示)', () => {
    // Store with 1 day of data -> confidence is '低'
    const storeLow = createMockStore(
      'store-low',
      '低信頼店舗',
      50,
      [{ name: 'マイジャグラーV', diff: 400, machines: 5 }],
      [
        { num: 301, model: 'マイジャグラーV', diff: 1200 },
        { num: 302, model: 'マイジャグラーV', diff: 0 },
        { num: 303, model: 'マイジャグラーV', diff: -400 },
      ],
      1
    );

    // Store with 3 days of data -> confidence is '中'
    const storeMid = createMockStore(
      'store-mid',
      '中信頼店舗',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 500, machines: 5 }],
      [
        { num: 401, model: 'スマスロ北斗の拳', diff: 2000 },
        { num: 402, model: 'スマスロ北斗の拳', diff: 0 },
        { num: 403, model: 'スマスロ北斗の拳', diff: -500 },
      ],
      3
    );

    // Default: includeLowConfidence is false
    const resultDefault = calculateCrossStoreRanking([storeLow, storeMid], '2025-01-02');
    expect(resultDefault.machineRankings.every((m) => m.confidence !== '低')).toBe(true);
    expect(resultDefault.machineRankings.some((m) => m.machineNum === 301)).toBe(false);
    expect(resultDefault.machineRankings.some((m) => m.machineNum === 401)).toBe(true);

    // When includeLowConfidence: true
    const resultWithLow = calculateCrossStoreRanking([storeLow, storeMid], '2025-01-02', {
      includeLowConfidence: true,
    });
    expect(resultWithLow.machineRankings.some((m) => m.machineNum === 301)).toBe(true);
    expect(resultWithLow.machineRankings.some((m) => m.machineNum === 401)).toBe(true);
  });

  // 3. 理由の根拠日数が実際の集計と一致
  it('理由の根拠日数が実際の集計と一致する', () => {
    const store = createMockStore(
      'store-evidence',
      '根拠確認店舗',
      50,
      [{ name: 'マイジャグラーV', diff: 400, machines: 5 }],
      [{ num: 501, model: 'マイジャグラーV', diff: 2500 }],
      3
    );

    const result = calculateCrossStoreRanking([store], '2025-01-02', {
      includeLowConfidence: true,
    });

    expect(result.machineRankings.length).toBeGreaterThan(0);
    const mach = result.machineRankings[0];
    expect(mach.reasons.length).toBeGreaterThan(0);

    // For each reason in the ranked machine, check if evidence days match actual values
    const daysRegex = /(?:根拠|実績)(\d+)日/;
    mach.reasons.forEach((r) => {
      const match = r.match(daysRegex);
      if (match) {
        const parsedDays = Number(match[1]);
        // The parsed evidence days must match either evidenceDays or cohortEvidenceDays
        const isValidDays = parsedDays === mach.evidenceDays || parsedDays === mach.cohortEvidenceDays;
        expect(isValidDays).toBe(true);
      }
    });

    // Model tacticalReason also contains matching sample days
    const model = result.modelRankings[0];
    if (model.sampleDays > 0) {
      expect(model.tacticalReason).toContain(`根拠${model.sampleDays}日`);
    }
  });

  // 4. 失敗した店が理由つきで除外される
  it('失敗した店が理由つきで除外される (データなし・対象日前データなし・例外発生時)', () => {
    const emptyStore: StoreProfile = {
      id: 'empty',
      name: '空店舗',
      address: '',
      oldEventDays: '',
      exchangeRate: '',
      rateLend: 46,
      rateExchange: 52,
      totalMachinesApprox: 0,
      dataRange: '',
      dailyRecords: [],
    };

    const futureOnlyStore: StoreProfile = {
      id: 'future',
      name: '未来店舗',
      address: '',
      oldEventDays: '',
      exchangeRate: '',
      rateLend: 46,
      rateExchange: 52,
      totalMachinesApprox: 10,
      dataRange: '',
      dailyRecords: [
        {
          date: '2025-01-10',
          yearMonth: '2025-01',
          year: 2025,
          month: 1,
          day: 10,
          dayOfWeek: '金',
          avgDiffCoins: 100,
          avgGames: 5000,
          winRate: 50,
          winMachines: 5,
          totalMachines: 10,
          totalDiffCoins: 1000,
          hallCoinProfit: -1000,
          playerCoinProfit: 1000,
          hallYenProfit: -20000,
          playerYenProfit: 20000,
          inCoins: 10000,
          outCoins: 11000,
          payoutRate: 102.0,
          estimatedRevenue: 0,
          exchangeGapProfit: 0,
          gModelHallProfit: 0,
          gModelPlayerProfit: 0,
          isOldEventDay: false,
          is7Day: false,
          notable: '',
        },
      ],
    };

    const validStore = createMockStore('valid', '正常店舗', 50, [
      { name: 'マイジャグラーV', diff: 400, machines: 5 },
    ], undefined, 3);

    const result = calculateCrossStoreRanking([emptyStore, futureOnlyStore, validStore], '2025-01-02');

    expect(result.eligibleStoresCount).toBe(1);
    expect(result.excludedStores).toHaveLength(2);

    const emptyEx = result.excludedStores.find((e) => e.storeId === 'empty');
    expect(emptyEx).toBeDefined();
    expect(emptyEx?.reason).toContain('出玉データが登録されていません');

    const futureEx = result.excludedStores.find((e) => e.storeId === 'future');
    expect(futureEx).toBeDefined();
    expect(futureEx?.reason).toContain('過去データが存在しません');
  });

  // 5. 来店日以降のデータを書き換えても結果が変わらない
  it('来店日以降のデータを書き換えても結果が変わらない (未来データのリークがない)', () => {
    const storeOriginal = createMockStore(
      'store-a',
      '店舗A',
      50,
      [{ name: 'スマスロ北斗の拳', diff: 500, machines: 5 }],
      [{ num: 101, model: 'スマスロ北斗の拳', diff: 2000 }],
      3
    );

    const targetDate = '2025-01-02';
    const resOrig = calculateCrossStoreRanking([storeOriginal], targetDate, {
      includeLowConfidence: true,
    });

    // Add future records on targetDate and later with extreme numbers
    const storeTampered: StoreProfile = {
      ...storeOriginal,
      dailyRecords: [
        ...storeOriginal.dailyRecords,
        {
          ...storeOriginal.dailyRecords[0],
          date: '2025-01-02',
          avgDiffCoins: 9999,
          models: [{ modelName: 'スマスロ北斗の拳', avgDiffCoins: 9999, totalDiffCoins: 49995, avgGames: 9000, winRate: 100, winMachines: 5, totalMachines: 5 }],
          machines: [{ machineNum: 101, modelName: 'スマスロ北斗の拳', diff: 25000, games: 9000, payoutRate: 190.0 }],
        },
        {
          ...storeOriginal.dailyRecords[0],
          date: '2025-01-09',
          avgDiffCoins: 8888,
        },
      ],
    };

    const resTampered = calculateCrossStoreRanking([storeTampered], targetDate, {
      includeLowConfidence: true,
    });

    // Both model rankings and machine rankings must be identical
    expect(resOrig.machineRankings.map((m) => m.machineNum)).toEqual(
      resTampered.machineRankings.map((m) => m.machineNum)
    );
    expect(resOrig.machineRankings[0].shrunkDiff).toBe(
      resTampered.machineRankings[0].shrunkDiff
    );
    expect(resOrig.machineRankings[0].expectedDiffCoins).toBe(
      resTampered.machineRankings[0].expectedDiffCoins
    );
    expect(resOrig.modelRankings.map((m) => m.modelName)).toEqual(
      resTampered.modelRankings.map((m) => m.modelName)
    );
    expect(resOrig.modelRankings[0].expectedDiffCoins).toBe(
      resTampered.modelRankings[0].expectedDiffCoins
    );
  });

  // 6. 幅の計算: 80%不確実性区間
  describe('不確実性の幅の計算 (calculateUncertainty80)', () => {
    it('標準誤差から約80%範囲 (1.28 * SE) が正しく計算される', () => {
      // expectedDiff: 1000, SE: 200 -> margin = round(1.28 * 200) = 256
      const unc = calculateUncertainty80(1000, 200);
      expect(unc.margin).toBe(256);
      expect(unc.min).toBe(744);
      expect(unc.max).toBe(1256);
      expect(unc.isWide).toBe(false);

      // Large SE: 600 -> margin = round(1.28 * 600) = 768 >= 700 -> isWide: true
      const uncWide = calculateUncertainty80(1000, 600);
      expect(uncWide.margin).toBe(768);
      expect(uncWide.min).toBe(232);
      expect(uncWide.max).toBe(1768);
      expect(uncWide.isWide).toBe(true);
    });

    it('calculateCrossStoreRanking の結果に uncertainty80 が含まれる', () => {
      const store = createMockStore(
        'store-unc',
        '不確実性検証店',
        50,
        [{ name: 'スマスロ北斗の拳', diff: 800, machines: 5 }],
        [{ num: 101, model: 'スマスロ北斗の拳', diff: 2000 }],
        3
      );

      const result = calculateCrossStoreRanking([store], '2025-01-02', {
        includeLowConfidence: true,
      });

      expect(result.machineRankings.length).toBeGreaterThan(0);
      const mach = result.machineRankings[0];
      expect(mach.uncertainty80).toBeDefined();
      expect(mach.uncertainty80.margin).toBeGreaterThan(0);
      expect(mach.uncertainty80.min).toBeLessThanOrEqual(mach.shrunkDiff);
      expect(mach.uncertainty80.max).toBeGreaterThanOrEqual(mach.shrunkDiff);

      expect(result.modelRankings.length).toBeGreaterThan(0);
      const model = result.modelRankings[0];
      expect(model.uncertainty80).toBeDefined();
      expect(model.uncertainty80.margin).toBeGreaterThan(0);
    });
  });

  // 7. 狙い台リスト: チェック除外と繰り上がり、保存と復元
  describe('狙い台リスト (チェック除外・繰り上がり・保存復元)', () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      globalThis.localStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
        key: (i: number) => Object.keys(mockStorage)[i] ?? null,
        length: 0,
      } as Storage;
    });

    const mockMachines: CrossStoreMachineRank[] = [
      {
        rank: 1,
        storeId: 'store-1',
        storeName: '店舗1',
        machineNum: 101,
        modelName: '北斗',
        totalScore: 50,
        confidence: '高',
        evidenceDays: 5,
        cohortEvidenceDays: 5,
        shrunkDiff: 1200,
        expectedDiffCoins: 1200,
        expectedYenProfit: 24000,
        cohortAvgDiff: 1200,
        cohortWinRate: 70,
        highSettingRate: 40,
        isTailMatch: false,
        isZoro: false,
        reasons: ['特日実績あり'],
        uncertainty80: { margin: 300, min: 900, max: 1500, isWide: false },
      },
      {
        rank: 2,
        storeId: 'store-1',
        storeName: '店舗1',
        machineNum: 102,
        modelName: 'ジャグラー',
        totalScore: 40,
        confidence: '中',
        evidenceDays: 4,
        cohortEvidenceDays: 4,
        shrunkDiff: 800,
        expectedDiffCoins: 800,
        expectedYenProfit: 16000,
        cohortAvgDiff: 800,
        cohortWinRate: 60,
        highSettingRate: 30,
        isTailMatch: false,
        isZoro: false,
        reasons: ['同曜日実績あり'],
        uncertainty80: { margin: 250, min: 550, max: 1050, isWide: false },
      },
      {
        rank: 3,
        storeId: 'store-1',
        storeName: '店舗1',
        machineNum: 103,
        modelName: 'モンキーターン',
        totalScore: 30,
        confidence: '中',
        evidenceDays: 3,
        cohortEvidenceDays: 3,
        shrunkDiff: 600,
        expectedDiffCoins: 600,
        expectedYenProfit: 12000,
        cohortAvgDiff: 600,
        cohortWinRate: 55,
        highSettingRate: 20,
        isTailMatch: false,
        isZoro: false,
        reasons: ['実績あり'],
        uncertainty80: { margin: 200, min: 400, max: 800, isWide: false },
      },
    ];

    it('チェックした台が除外され、次点の台が繰り上がる', () => {
      // 101番台を「空いていない」としてチェック
      const checkedState = { 101: 'unavailable' as const };
      const res = filterAndRollupTargetList(mockMachines, checkedState, 2);

      // アクティブ候補から101が外れ、102が1位、103が2位に繰り上がる
      expect(res.activeCandidates).toHaveLength(2);
      expect(res.activeCandidates[0].machineNum).toBe(102);
      expect(res.activeCandidates[0].rank).toBe(1);
      expect(res.activeCandidates[0].originalRank).toBe(2);

      expect(res.activeCandidates[1].machineNum).toBe(103);
      expect(res.activeCandidates[1].rank).toBe(2);
      expect(res.activeCandidates[1].originalRank).toBe(3);

      expect(res.checkedCandidates).toHaveLength(1);
      expect(res.checkedCandidates[0].machineNum).toBe(101);
      expect(res.checkedCandidates[0].checkStatus).toBe('unavailable');
    });

    it('日付×店ごとのチェック状態が localStorage に保存され復元される', () => {
      const targetDate = '2025-01-02';
      const storeId = 'store-test-storage';

      // 初期状態は空
      expect(loadTargetCheckStatus(targetDate, storeId)).toEqual({});

      // 状態保存
      const state = { 101: 'unavailable' as const, 102: 'played' as const };
      saveTargetCheckStatus(targetDate, storeId, state);

      // 復元確認
      const loaded = loadTargetCheckStatus(targetDate, storeId);
      expect(loaded).toEqual(state);

      // 別の日付や別の店では独立している
      expect(loadTargetCheckStatus('2025-01-03', storeId)).toEqual({});
      expect(loadTargetCheckStatus(targetDate, 'another-store')).toEqual({});

      // 全解除
      saveTargetCheckStatus(targetDate, storeId, {});
      expect(loadTargetCheckStatus(targetDate, storeId)).toEqual({});
    });
  });

  // 8. テキストコピーとCSV書き出し
  describe('テキストコピーとCSV書き出し', () => {
    const sampleItems = [
      {
        rank: 1,
        modelName: 'スマスロ北斗の拳',
        machineNum: 101,
        expectedDiffCoins: 850,
        expectedYenProfit: 17000,
        confidence: '高',
        uncertainty80: { margin: 350, min: 500, max: 1200, isWide: false },
        reasons: ['来店日が店舗特日 (実績5日)', '同条件台平均 +920枚'],
        islandName: '中央通路',
      },
      {
        rank: 2,
        modelName: 'マイジャグラーV',
        machineNum: 202,
        expectedDiffCoins: 500,
        expectedYenProfit: 10000,
        confidence: '中',
        uncertainty80: { margin: 200, min: 300, max: 700, isWide: false },
        reasons: ['同曜日実績3日'],
        islandName: null,
      },
    ];

    it('テキストコピー文に店名・来店日・順位・機種・台番・期待差枚・理由の要約が含まれる', () => {
      const text = generateTargetListCopyText('テスト店舗A', '2025-01-02', sampleItems);

      expect(text).toContain('テスト店舗A');
      expect(text).toContain('2025-01-02');
      expect(text).toContain('1位: スマスロ北斗の拳 101番台');
      expect(text).toContain('+850枚');
      expect(text).toContain('来店日が店舗特日 (実績5日)');
      expect(text).toContain('2位: マイジャグラーV 202番台');
    });

    it('CSV書き出しが正しいヘッダとフォーマットで生成される', () => {
      const csv = generateTargetListCsv('テスト店舗A', '2025-01-02', sampleItems);

      expect(csv).toContain('店舗名,来店日,順位,機種名,台番,島名,信頼度,期待差枚(枚),不確実性(±枚),80%予測下限(枚),80%予測上限(枚),選定理由要約');
      expect(csv).toContain('"テスト店舗A","2025-01-02",1,"スマスロ北斗の拳",101,"中央通路","高","+850",350,"+500","+1200"');
      expect(csv).toContain('"テスト店舗A","2025-01-02",2,"マイジャグラーV",202,"","中","+500",200,"+300","+700"');
    });
  });

  // 9. 過去成績がバックテストの結果と一致する
  describe('過去成績の表示 (calculateStorePastPerformance)', () => {
    it('直近N日の過去成績が runMachineBacktest の結果と完全に一致する', () => {
      // 5日分の台番データを持つモック店舗を作成
      const machinesList = [
        { num: 101, model: 'スマスロ北斗の拳', diff: 3000 },
        { num: 102, model: 'スマスロ北斗の拳', diff: -500 },
        { num: 103, model: 'マイジャグラーV', diff: 1500 },
        { num: 104, model: 'マイジャグラーV', diff: -200 },
      ];

      const store = createMockStore(
        'store-backtest-match',
        '検証店舗',
        50,
        [{ name: 'スマスロ北斗の拳', diff: 1000, machines: 2 }],
        machinesList,
        5
      );

      const targetDate = '2025-01-02';
      const recentDays = 30;

      // 過去成績関数を実行
      const pastPerf = calculateStorePastPerformance(store, targetDate, recentDays);

      // 直接 runMachineBacktest を同一データ・パラメータで実行
      const priorRecords = store.dailyRecords.filter((r) => r.date < targetDate);
      const targetSlice = priorRecords.slice(-recentDays);
      const backtestRes = runMachineBacktest(targetSlice, store.specialDayRules, {
        topN: 10,
        minEvidenceDays: 3,
        bootstrapIterations: 1000,
        weights: store.customMachineRankingWeights,
      });

      // 両者の集計結果が一致することを検証
      expect(pastPerf.actualDaysCount).toBe(backtestRes.evaluatedDaysCount);
      expect(pastPerf.top10AvgDiff).toBe(backtestRes.withFilter.avgActualDiff);
      expect(pastPerf.hallAvgDiff).toBe(backtestRes.withFilter.hallAvgDiff);
      expect(pastPerf.lift).toBe(backtestRes.withFilter.avgLift);
      expect(pastPerf.hasEdge).toBe(backtestRes.withFilter.hasEdge);
      expect(pastPerf.isReferenceOnly).toBe(!backtestRes.withFilter.hasEdge);
    });
  });

  // 10. 30-4: 横断ランキングの整理（二重縮小・並びと理由の一致・指標の切替）
  describe('30-4: 横断ランキングの整理', () => {
    it('1. legacyCrossShrink=false で、並びが期待差枚の降順で、二重の縮小が掛かっていないこと（期待差枚 = posteriorMean）', () => {
      // Store with 5 days of data (storeEvalDays = 5 < 15)
      const store = createMockStore(
        'store-cross-shrink',
        '二重縮小検証店舗',
        50,
        [{ name: 'マイジャグラーV', diff: 600, machines: 3 }],
        [
          { num: 101, model: 'マイジャグラーV', diff: 2000 },
          { num: 102, model: 'マイジャグラーV', diff: 1000 },
          { num: 103, model: 'マイジャグラーV', diff: 300 },
        ],
        5
      );

      // A. legacyCrossShrink: false (二重縮小なし)
      const resNew = calculateCrossStoreRanking([store], '2025-01-02', {
        legacyCrossShrink: false,
        includeLowConfidence: true,
      });

      expect(resNew.machineRankings.length).toBeGreaterThanOrEqual(3);

      // Verify strict descending order
      for (let i = 0; i < resNew.machineRankings.length - 1; i++) {
        expect(resNew.machineRankings[i].expectedDiffCoins).toBeGreaterThanOrEqual(
          resNew.machineRankings[i + 1].expectedDiffCoins
        );
      }

      // Verify no double shrinkage: expectedDiffCoins === Math.round(posteriorMean)
      resNew.machineRankings.forEach((m) => {
        expect(m.posteriorMean).toBeDefined();
        expect(m.expectedDiffCoins).toBe(Math.round(m.posteriorMean!));
        expect(m.shrunkDiff).toBe(Math.round(m.posteriorMean!));
      });

      // B. legacyCrossShrink: true (既定: 二重縮小あり)
      const resLegacy = calculateCrossStoreRanking([store], '2025-01-02', {
        legacyCrossShrink: true,
        includeLowConfidence: true,
      });

      // With storeEvalDays=5 (<15) and evidenceDays=5 (<15), double shrinkage scales down
      const topNew = resNew.machineRankings[0];
      const topLegacy = resLegacy.machineRankings[0];
      expect(topLegacy.expectedDiffCoins).toBeLessThan(topNew.expectedDiffCoins);
      expect(topLegacy.expectedDiffCoins).toBe(
        Math.round(topLegacy.posteriorMean! * (5 / (5 + 3)) * (5 / 15))
      );
    });

    it('2. diffMetric="baseGames" で、稼働の違う2店の同じ出率の台が、同じ程度の期待差枚になること', () => {
      // Store Low: average games 2,700, diff 270 (rate r = 0.10)
      const storeLow = createMockStore(
        'store-low-games',
        '低稼働店舗',
        50,
        [{ name: 'マイジャグラーV', diff: 270, machines: 3 }],
        [{ num: 101, model: 'マイジャグラーV', diff: 270 }],
        15
      );
      // Override daily games to 2700
      storeLow.dailyRecords.forEach((r) => {
        r.avgGames = 2700;
        if (r.machines) {
          r.machines.forEach((m) => {
            m.games = 2700;
            m.diff = 270;
            m.payoutRate = 103.3;
          });
        }
      });

      // Store High: average games 6,000, diff 600 (rate r = 0.10)
      const storeHigh = createMockStore(
        'store-high-games',
        '高稼働店舗',
        50,
        [{ name: 'マイジャグラーV', diff: 600, machines: 3 }],
        [{ num: 201, model: 'マイジャグラーV', diff: 600 }],
        15
      );
      // Override daily games to 6000
      storeHigh.dailyRecords.forEach((r) => {
        r.avgGames = 6000;
        if (r.machines) {
          r.machines.forEach((m) => {
            m.games = 6000;
            m.diff = 600;
            m.payoutRate = 103.3;
          });
        }
      });

      // A. diffMetric: 'actual' (現行: 実稼働差枚)
      const resActual = calculateCrossStoreRanking([storeLow, storeHigh], '2025-01-02', {
        diffMetric: 'actual',
        legacyCrossShrink: false,
        includeLowConfidence: true,
      });

      const machLowActual = resActual.machineRankings.find((m) => m.machineNum === 101)!;
      const machHighActual = resActual.machineRankings.find((m) => m.machineNum === 201)!;
      expect(machLowActual).toBeDefined();
      expect(machHighActual).toBeDefined();
      // In actual games diff, Store High diff is ~2x Store Low diff
      expect(machHighActual.expectedDiffCoins / machLowActual.expectedDiffCoins).toBeGreaterThan(1.8);

      // B. diffMetric: 'baseGames' (基準5,000G換算)
      const resBase = calculateCrossStoreRanking([storeLow, storeHigh], '2025-01-02', {
        diffMetric: 'baseGames',
        baseGames: 5000,
        legacyCrossShrink: false,
        includeLowConfidence: true,
      });

      const machLowBase = resBase.machineRankings.find((m) => m.machineNum === 101)!;
      const machHighBase = resBase.machineRankings.find((m) => m.machineNum === 201)!;
      expect(machLowBase).toBeDefined();
      expect(machHighBase).toBeDefined();

      // At baseGames 5000, both rate r = 0.10 machines yield ~500 coins, nearly identical
      expect(machLowBase.expectedDiffCoins).toBeCloseTo(500, -1);
      expect(machHighBase.expectedDiffCoins).toBeCloseTo(500, -1);
      expect(Math.abs(machLowBase.expectedDiffCoins - machHighBase.expectedDiffCoins)).toBeLessThanOrEqual(25);
    });

    it('3. 理由に出る要素が、並びに効いていること（並び順に寄与しない末尾・ゾロ目・高設定等は理由から外れていること）', () => {
      const store = createMockStore(
        'store-reasons-check',
        '理由一貫性店舗',
        50,
        [{ name: 'スマスロ北斗の拳', diff: 1000, machines: 3 }],
        [
          { num: 777, model: 'スマスロ北斗の拳', diff: 3000 }, // Zoro & Tail 7
          { num: 101, model: 'スマスロ北斗の拳', diff: 2000 },
        ],
        5
      );

      const res = calculateCrossStoreRanking([store], '2025-01-02', {
        includeLowConfidence: true,
      });

      // Rankings are ordered purely by expected diff
      expect(res.machineRankings[0].machineNum).toBe(777);
      expect(res.machineRankings[1].machineNum).toBe(101);

      res.machineRankings.forEach((mach) => {
        mach.reasons.forEach((reason) => {
          // Reasons must NOT mention non-ranking drivers: 末尾, ゾロ目, 高設定
          expect(reason).not.toMatch(/末尾/);
          expect(reason).not.toMatch(/ゾロ目/);
          expect(reason).not.toMatch(/高設定/);
          // Reasons must explain cohort evidence and shrunk expected diff
          expect(reason).toMatch(/(?:特日|同曜日|同条件|縮小推定|機種平均)/);
        });
      });
    });

    it('4. interval80 が存在する場合、CrossStoreMachineRank に格納されること', () => {
      const store = createMockStore(
        'store-interval-check',
        '区間検証店舗',
        50,
        [{ name: 'マイジャグラーV', diff: 500, machines: 5 }],
        [
          { num: 101, model: 'マイジャグラーV', diff: 2000 },
          { num: 102, model: 'マイジャグラーV', diff: 1000 },
        ],
        10
      );

      // Run with empirical shrinkage
      store.customMachineRankingWeights = {
        diffWeight: 0.04,
        winRateWeight: 0.3,
        highSettingWeight: 20.0,
        modelScoreWeight: 0.25,
        tailMatchBonus: 0.0,
        zoroBonus: 0.0,
        recentStateWeight: 0,
        shrinkageK: 3,
        shrinkageMode: 'empirical',
      };

      const res = calculateCrossStoreRanking([store], '2025-01-02', {
        legacyCrossShrink: false,
        includeLowConfidence: true,
      });

      const mach = res.machineRankings[0];
      expect(mach).toBeDefined();
      if (mach.interval80) {
        expect(mach.interval80).toHaveLength(2);
        expect(mach.interval80[0]).toBeLessThanOrEqual(mach.interval80[1]);
      }
    });
  });

  describe('プロンプト32: 横断狙いの店舗ランキングと来店日スキャン', () => {
    it('1. 店舗ランキングの並びが上位N台の期待差枚の平均の降順であること', () => {
      const storeHigh = createMockStore(
        'store-high',
        '高期待値店',
        50,
        [{ name: 'アイムジャグラー', diff: 800, machines: 5 }],
        [
          { num: 1, model: 'アイムジャグラー', diff: 2500 },
          { num: 2, model: 'アイムジャグラー', diff: 2000 },
          { num: 3, model: 'アイムジャグラー', diff: 1800 },
        ],
        5
      );

      const storeMid = createMockStore(
        'store-mid',
        '中期待値店',
        50,
        [{ name: 'アイムジャグラー', diff: 200, machines: 5 }],
        [
          { num: 1, model: 'アイムジャグラー', diff: 600 },
          { num: 2, model: 'アイムジャグラー', diff: 500 },
          { num: 3, model: 'アイムジャグラー', diff: 400 },
        ],
        5
      );

      const storeLow = createMockStore(
        'store-low',
        '低期待値店',
        50,
        [{ name: 'アイムジャグラー', diff: -300, machines: 5 }],
        [
          { num: 1, model: 'アイムジャグラー', diff: -400 },
          { num: 2, model: 'アイムジャグラー', diff: -500 },
          { num: 3, model: 'アイムジャグラー', diff: -600 },
        ],
        5
      );

      const res = calculateCrossStoreRanking(
        [storeMid, storeLow, storeHigh], // Deliberately unordered input
        '2025-01-02',
        { topStoreMachineN: 10 }
      );

      expect(res.storeRankings).toBeDefined();
      expect(res.storeRankings).toHaveLength(3);

      const rankings = res.storeRankings!;
      // Verified strictly descending order by topNAvgExpectedDiff
      expect(rankings[0].storeId).toBe('store-high');
      expect(rankings[1].storeId).toBe('store-mid');
      expect(rankings[2].storeId).toBe('store-low');

      expect(rankings[0].topNAvgExpectedDiff).toBeGreaterThan(rankings[1].topNAvgExpectedDiff);
      expect(rankings[1].topNAvgExpectedDiff).toBeGreaterThan(rankings[2].topNAvgExpectedDiff);

      // Rank values are 1, 2, 3
      expect(rankings[0].rank).toBe(1);
      expect(rankings[1].rank).toBe(2);
      expect(rankings[2].rank).toBe(3);
    });

    it('2. 信頼度が低い台が平均から除外され、除外台数が集計されること', () => {
      // 5 prior days in chronological order
      const dates = ['2024-11-28', '2024-12-05', '2024-12-12', '2024-12-19', '2024-12-26'];
      const dailyRecords: DailyRecord[] = dates.map((dateStr, idx) => {
        // Machine 999 only exists on the last day (1 evidence day -> active but low confidence)
        // Machines 101, 102 exist on all days (5 evidence days -> higher confidence)
        const machines = [
          { machineNum: 101, modelName: 'マイジャグラーV', diff: 300, games: 5000, payoutRate: 102.0 },
          { machineNum: 102, modelName: 'マイジャグラーV', diff: 400, games: 5000, payoutRate: 102.5 },
        ];
        if (idx === dates.length - 1) {
          machines.push({
            machineNum: 999,
            modelName: 'マイジャグラーV',
            diff: 5000, // Extremely high diff, but only 1 day of evidence
            games: 5000,
            payoutRate: 133.0,
          });
        }
        return {
          date: dateStr,
          yearMonth: dateStr.slice(0, 7),
          year: Number(dateStr.slice(0, 4)),
          month: Number(dateStr.slice(5, 7)),
          day: Number(dateStr.slice(8, 10)),
          dayOfWeek: '木',
          avgDiffCoins: 350,
          avgGames: 5000,
          winRate: 60,
          winMachines: 2,
          totalMachines: machines.length,
          totalDiffCoins: machines.reduce((s, m) => s + m.diff, 0),
          hallCoinProfit: -1000,
          playerCoinProfit: 1000,
          hallYenProfit: -20000,
          playerYenProfit: 20000,
          inCoins: 300000,
          outCoins: 301000,
          payoutRate: 102.0,
          estimatedRevenue: 100000,
          exchangeGapProfit: 5000,
          gModelHallProfit: 10000,
          gModelPlayerProfit: -10000,
          isOldEventDay: false,
          is7Day: false,
          notable: '',
          models: [
            {
              modelName: 'マイジャグラーV',
              avgDiffCoins: 350,
              totalDiffCoins: 700,
              avgGames: 5000,
              winRate: 60,
              winMachines: 2,
              totalMachines: machines.length,
            },
          ],
          machines,
        };
      });

      const store: StoreProfile = {
        id: 'store-confidence-test',
        name: '信頼度テスト店',
        address: '東京都',
        oldEventDays: '7のつく日',
        rateLend: 46,
        rateExchange: 52,
        exchangeRate: '46枚貸/52枚交換',
        totalMachinesApprox: 20,
        dataRange: '2025-01',
        dailyRecords,
      };

      const testRes = calculateCrossStoreRanking([store], '2025-01-02', { includeLowConfidence: true });
      const cell = calculateStoreTargetMetrics(store, '2025-01-02', { topN: 10 });

      // Machine 999 has evidenceDays === 1, so its confidence is '低'.
      // It must be excluded from the average calculation.
      expect(cell.excludedLowConfidenceCount).toBeGreaterThanOrEqual(1);

      // Average should reflect only machines with sufficient confidence (around +300〜+400),
      // definitely not inflated by the +5000 1-day spike.
      expect(cell.topNAvgExpectedDiff).toBeLessThan(1500);
      expect(cell.evaluatedMachinesCount).toBe(2);
    });

    it('3. スキャンの結果が、個別に来店日を指定した結果と一致すること', () => {
      const storeA = createMockStore(
        'store-scan-a',
        'スキャン店舗A',
        50,
        [{ name: 'マイジャグラーV', diff: 600, machines: 5 }],
        [
          { num: 101, model: 'マイジャグラーV', diff: 1500 },
          { num: 102, model: 'マイジャグラーV', diff: 1000 },
        ],
        5
      );
      const storeB = createMockStore(
        'store-scan-b',
        'スキャン店舗B',
        52,
        [{ name: 'アイムジャグラー', diff: 300, machines: 5 }],
        [
          { num: 201, model: 'アイムジャグラー', diff: 700 },
          { num: 202, model: 'アイムジャグラー', diff: 500 },
        ],
        5
      );

      const targetDate = '2025-01-02';
      const scanDates = ['2025-01-02', '2025-01-03'];

      const scanRes = scanCandidateDates([storeA, storeB], scanDates, { topN: 10 });
      const singleRes = calculateCrossStoreRanking([storeA, storeB], targetDate, { topStoreMachineN: 10 });

      expect(singleRes.storeRankings).toBeDefined();

      for (const st of [storeA, storeB]) {
        const scanCell = scanRes.grid[st.id][targetDate];
        const singleRank = singleRes.storeRankings!.find((s) => s.storeId === st.id)!;

        expect(scanCell).toBeDefined();
        expect(singleRank).toBeDefined();

        // Must match exactly
        expect(scanCell.topNAvgExpectedDiff).toBe(singleRank.topNAvgExpectedDiff);
        expect(scanCell.evaluatedMachinesCount).toBe(singleRank.evaluatedMachinesCount);
        expect(scanCell.excludedLowConfidenceCount).toBe(singleRank.excludedLowConfidenceCount);
        expect(scanCell.isSpecialDay).toBe(singleRank.isSpecialDay);
        expect(scanCell.evaluationDays).toBe(singleRank.evaluationDays);
      }
    });

    it('4. 来店日以降のデータを書き換えても結果が変わらないこと', () => {
      const store = createMockStore(
        'store-leakage-test',
        '未来情報不変テスト店',
        50,
        [{ name: 'マイジャグラーV', diff: 500, machines: 5 }],
        [
          { num: 101, model: 'マイジャグラーV', diff: 1200 },
          { num: 102, model: 'マイジャグラーV', diff: 800 },
        ],
        5
      );

      const targetDate = '2025-01-02';

      // 1. Calculate metrics before adding future records
      const beforeCell = calculateStoreTargetMetrics(store, targetDate, { topN: 10 });
      const beforeScan = scanCandidateDates([store], [targetDate], { topN: 10 });

      // 2. Add future records on and after targetDate (e.g. 2025-01-02, 2025-01-03) with massive diff
      const futureRecords: DailyRecord[] = [
        {
          date: '2025-01-02',
          yearMonth: '2025-01',
          year: 2025,
          month: 1,
          day: 2,
          dayOfWeek: '木',
          avgDiffCoins: 9999,
          avgGames: 9000,
          winRate: 100,
          winMachines: 10,
          totalMachines: 10,
          totalDiffCoins: 99990,
          hallCoinProfit: -99990,
          playerCoinProfit: 99990,
          hallYenProfit: -1999800,
          playerYenProfit: 1999800,
          inCoins: 900000,
          outCoins: 999990,
          payoutRate: 111.1,
          estimatedRevenue: 100000,
          exchangeGapProfit: 0,
          gModelHallProfit: 0,
          gModelPlayerProfit: 0,
          isOldEventDay: true,
          is7Day: false,
          notable: '',
          machines: [
            { machineNum: 101, modelName: 'マイジャグラーV', diff: 99999, games: 9000, payoutRate: 130 },
          ],
        },
        {
          date: '2025-01-03',
          yearMonth: '2025-01',
          year: 2025,
          month: 1,
          day: 3,
          dayOfWeek: '金',
          avgDiffCoins: 8888,
          avgGames: 9000,
          winRate: 100,
          winMachines: 10,
          totalMachines: 10,
          totalDiffCoins: 88880,
          hallCoinProfit: -88880,
          playerCoinProfit: 88880,
          hallYenProfit: -1777600,
          playerYenProfit: 1777600,
          inCoins: 900000,
          outCoins: 988880,
          payoutRate: 110.0,
          estimatedRevenue: 100000,
          exchangeGapProfit: 0,
          gModelHallProfit: 0,
          gModelPlayerProfit: 0,
          isOldEventDay: false,
          is7Day: false,
          notable: '',
          machines: [
            { machineNum: 101, modelName: 'マイジャグラーV', diff: 88888, games: 9000, payoutRate: 130 },
          ],
        },
      ];

      store.dailyRecords = [...(store.dailyRecords || []), ...futureRecords];

      // 3. Recalculate metrics for targetDate = '2025-01-02'
      const afterCell = calculateStoreTargetMetrics(store, targetDate, { topN: 10 });
      const afterScan = scanCandidateDates([store], [targetDate], { topN: 10 });

      // Must be strictly identical: no future leakage
      expect(afterCell.topNAvgExpectedDiff).toBe(beforeCell.topNAvgExpectedDiff);
      expect(afterCell.evaluatedMachinesCount).toBe(beforeCell.evaluatedMachinesCount);
      expect(afterCell.excludedLowConfidenceCount).toBe(beforeCell.excludedLowConfidenceCount);
      expect(afterCell.evaluationDays).toBe(beforeCell.evaluationDays);

      expect(afterScan.grid[store.id][targetDate].topNAvgExpectedDiff).toBe(
        beforeScan.grid[store.id][targetDate].topNAvgExpectedDiff
      );
    });

    it('5. generateCandidateScanDates が指定した日数の日付配列を生成すること', () => {
      const dates7 = generateCandidateScanDates('2025-01-01', 7);
      expect(dates7).toHaveLength(7);
      expect(dates7[0]).toBe('2025-01-01');
      expect(dates7[6]).toBe('2025-01-07');

      const dates14 = generateCandidateScanDates('2025-01-01', 14);
      expect(dates14).toHaveLength(14);
      expect(dates14[13]).toBe('2025-01-14');
    });
  });

  describe('プロンプト33: 横断狙いの絞り込みと展開', () => {
    // Sample mock machine rankings
    const mockMachines: CrossStoreMachineRank[] = [
      {
        rank: 1,
        storeId: 'store-1',
        storeName: '店舗A',
        machineNum: 107, // tail 7
        modelName: 'マイジャグラーV',
        islandName: 'メイン島',
        totalScore: 50,
        confidence: '高',
        evidenceDays: 10,
        cohortEvidenceDays: 5,
        shrunkDiff: 850,
        expectedDiffCoins: 850,
        expectedYenProfit: 17000,
        cohortAvgDiff: 900,
        cohortWinRate: 75,
        highSettingRate: 40,
        isTailMatch: true,
        isZoro: false,
        reasons: ['特日実績'],
        uncertainty80: { margin: 150, min: 700, max: 1000, isWide: false },
      },
      {
        rank: 2,
        storeId: 'store-1',
        storeName: '店舗A',
        machineNum: 102, // tail 2
        modelName: 'マイジャグラーV',
        islandName: 'メイン島',
        totalScore: 40,
        confidence: '中',
        evidenceDays: 5,
        cohortEvidenceDays: 3,
        shrunkDiff: 600,
        expectedDiffCoins: 600,
        expectedYenProfit: 12000,
        cohortAvgDiff: 650,
        cohortWinRate: 65,
        highSettingRate: 25,
        isTailMatch: false,
        isZoro: false,
        reasons: ['同曜日実績'],
        uncertainty80: { margin: 200, min: 400, max: 800, isWide: false },
      },
      {
        rank: 3,
        storeId: 'store-2',
        storeName: '店舗B',
        machineNum: 217, // tail 7
        modelName: 'スマスロ北斗の拳',
        islandName: 'バラエティ島',
        totalScore: 35,
        confidence: '中',
        evidenceDays: 7,
        cohortEvidenceDays: 4,
        shrunkDiff: 500,
        expectedDiffCoins: 500,
        expectedYenProfit: 10000,
        cohortAvgDiff: 550,
        cohortWinRate: 60,
        highSettingRate: 30,
        isTailMatch: true,
        isZoro: false,
        reasons: ['特日実績'],
        uncertainty80: { margin: 250, min: 250, max: 750, isWide: false },
      },
      {
        rank: 4,
        storeId: 'store-2',
        storeName: '店舗B',
        machineNum: 220, // tail 0
        modelName: 'スマスロ北斗の拳',
        islandName: 'バラエティ島',
        totalScore: 20,
        confidence: '低',
        evidenceDays: 2,
        cohortEvidenceDays: 1,
        shrunkDiff: 300,
        expectedDiffCoins: 300,
        expectedYenProfit: 6000,
        cohortAvgDiff: 350,
        cohortWinRate: 50,
        highSettingRate: 10,
        isTailMatch: false,
        isZoro: false,
        reasons: ['同曜日実績'],
        uncertainty80: { margin: 300, min: 0, max: 600, isWide: true },
      },
      {
        rank: 5,
        storeId: 'store-1',
        storeName: '店舗A',
        machineNum: 333, // tail 3, zoro
        modelName: 'アイムジャグラーEX',
        islandName: undefined, // no island config
        totalScore: 15,
        confidence: '高',
        evidenceDays: 15,
        cohortEvidenceDays: 8,
        shrunkDiff: 200,
        expectedDiffCoins: 200,
        expectedYenProfit: 4000,
        cohortAvgDiff: 220,
        cohortWinRate: 55,
        highSettingRate: 20,
        isTailMatch: false,
        isZoro: true,
        reasons: ['ゾロ目'],
        uncertainty80: { margin: 100, min: 100, max: 300, isWide: false },
      },
    ];

    // Sample mock model rankings
    const mockModels: CrossStoreModelRank[] = [
      {
        rank: 1,
        storeId: 'store-1',
        storeName: '店舗A',
        modelName: 'マイジャグラーV',
        totalMachines: 10,
        expectedDiffCoins: 450,
        expectedYenProfit: 9000,
        predictedWinRate: 60,
        predictedPayoutRate: 103.5,
        compositeScore: 65,
        tacticalReason: '特日実績好調',
        isSpecialDay: true,
        sampleDays: 8,
        uncertainty80: { margin: 120, min: 330, max: 570, isWide: false },
      },
      {
        rank: 2,
        storeId: 'store-2',
        storeName: '店舗B',
        modelName: 'スマスロ北斗の拳',
        totalMachines: 8,
        expectedDiffCoins: 380,
        expectedYenProfit: 7600,
        predictedWinRate: 55,
        predictedPayoutRate: 102.8,
        compositeScore: 50,
        tacticalReason: '高稼働機種',
        isSpecialDay: false,
        sampleDays: 6,
        uncertainty80: { margin: 150, min: 230, max: 530, isWide: false },
      },
      {
        rank: 3,
        storeId: 'store-1',
        storeName: '店舗A',
        modelName: 'アイムジャグラーEX',
        totalMachines: 15,
        expectedDiffCoins: 200,
        expectedYenProfit: 4000,
        predictedWinRate: 52,
        predictedPayoutRate: 101.5,
        compositeScore: 40,
        tacticalReason: '台数最多',
        isSpecialDay: true,
        sampleDays: 12,
        uncertainty80: { margin: 90, min: 110, max: 290, isWide: false },
      },
    ];

    describe('1. 絞り込みの条件ごとに、結果が正しく絞られること', () => {
      it('機種名で正しく台番ランキングが絞り込まれること (部分一致・大文字小文字無視)', () => {
        const filteredJuggler = filterMachineRankings(mockMachines, { modelName: 'マイジャグ' });
        expect(filteredJuggler).toHaveLength(2);
        expect(filteredJuggler.every((m) => m.modelName === 'マイジャグラーV')).toBe(true);

        const filteredHokuto = filterMachineRankings(mockMachines, { modelName: '北斗' });
        expect(filteredHokuto).toHaveLength(2);
        expect(filteredHokuto.every((m) => m.modelName === 'スマスロ北斗の拳')).toBe(true);

        const filteredNone = filterMachineRankings(mockMachines, { modelName: '存在しない機種' });
        expect(filteredNone).toHaveLength(0);
      });

      it('機種名で正しく機種ランキングが絞り込まれること', () => {
        const filtered = filterModelRankings(mockModels, { modelName: 'ジャグラー' });
        expect(filtered).toHaveLength(2);
        expect(filtered.map((m) => m.modelName)).toEqual(['マイジャグラーV', 'アイムジャグラーEX']);
      });

      it('島名で正しく台番ランキングが絞り込まれること (島設定がある店舗)', () => {
        const filteredMain = filterMachineRankings(mockMachines, { islandName: 'メイン島' });
        expect(filteredMain).toHaveLength(2);
        expect(filteredMain.every((m) => m.islandName === 'メイン島')).toBe(true);

        const filteredVariety = filterMachineRankings(mockMachines, { islandName: 'バラエティ島' });
        expect(filteredVariety).toHaveLength(2);
        expect(filteredVariety.every((m) => m.islandName === 'バラエティ島')).toBe(true);
      });

      it('末尾で正しく台番ランキングが絞り込まれること (末尾7など)', () => {
        const filteredTail7 = filterMachineRankings(mockMachines, { tailDigit: 7 });
        expect(filteredTail7).toHaveLength(2);
        expect(filteredTail7.map((m) => m.machineNum)).toEqual([107, 217]);

        const filteredTail0 = filterMachineRankings(mockMachines, { tailDigit: 0 });
        expect(filteredTail0).toHaveLength(1);
        expect(filteredTail0[0].machineNum).toBe(220);

        const filteredTail5 = filterMachineRankings(mockMachines, { tailDigit: 5 });
        expect(filteredTail5).toHaveLength(0);
      });

      it('最小の根拠日数で正しく台番・機種ランキングが絞り込まれること', () => {
        const filteredMachMin8 = filterMachineRankings(mockMachines, { minEvidenceDays: 8 });
        expect(filteredMachMin8).toHaveLength(2);
        expect(filteredMachMin8.map((m) => m.machineNum)).toEqual([107, 333]);

        const filteredModelMin8 = filterModelRankings(mockModels, { minEvidenceDays: 8 });
        expect(filteredModelMin8).toHaveLength(2);
        expect(filteredModelMin8.map((m) => m.modelName)).toEqual(['マイジャグラーV', 'アイムジャグラーEX']);

        const filteredModelMin10 = filterModelRankings(mockModels, { minEvidenceDays: 10 });
        expect(filteredModelMin10).toHaveLength(1);
        expect(filteredModelMin10[0].modelName).toBe('アイムジャグラーEX');
      });

      it('信頼度で正しく台番ランキングが絞り込まれること (高/中/低)', () => {
        const filteredHigh = filterMachineRankings(mockMachines, { confidence: '高' });
        expect(filteredHigh).toHaveLength(2);
        expect(filteredHigh.every((m) => m.confidence === '高')).toBe(true);

        const filteredMed = filterMachineRankings(mockMachines, { confidence: '中' });
        expect(filteredMed).toHaveLength(2);
        expect(filteredMed.every((m) => m.confidence === '中')).toBe(true);

        const filteredLow = filterMachineRankings(mockMachines, { confidence: '低' });
        expect(filteredLow).toHaveLength(1);
        expect(filteredLow[0].confidence).toBe('低');

        const filteredAll = filterMachineRankings(mockMachines, { confidence: 'all' });
        expect(filteredAll).toHaveLength(5);
      });

      it('複合条件 (機種 + 末尾 + 信頼度) で正しく絞り込まれること', () => {
        const complex = filterMachineRankings(mockMachines, {
          modelName: 'マイジャグラー',
          tailDigit: 7,
          confidence: '高',
        });
        expect(complex).toHaveLength(1);
        expect(complex[0].machineNum).toBe(107);

        // Model filtered by tail digit using matching machines
        const modelWithTail7 = filterModelRankings(
          mockModels,
          { tailDigit: 7 },
          mockMachines
        );
        expect(modelWithTail7.map((m) => m.modelName)).toEqual(['マイジャグラーV', 'スマスロ北斗の拳']);
      });
    });

    describe('2. 展開した台番が、その機種の台番だけであること', () => {
      it('機種行を展開した際、その店舗・その機種の台番のみが抽出され他機種・他店舗が混入しないこと', () => {
        const modelA = mockModels[0]; // store-1, マイジャグラーV
        const expandedA = getMachinesForModelRank(modelA, mockMachines);

        expect(expandedA).toHaveLength(2);
        // Verify every machine strictly belongs to store-1 and マイジャグラーV
        expect(expandedA.every((m) => m.storeId === 'store-1' && m.modelName === 'マイジャグラーV')).toBe(true);
        expect(expandedA.map((m) => m.machineNum)).toEqual([107, 102]);

        const modelB = mockModels[1]; // store-2, スマスロ北斗の拳
        const expandedB = getMachinesForModelRank(modelB, mockMachines);

        expect(expandedB).toHaveLength(2);
        expect(expandedB.every((m) => m.storeId === 'store-2' && m.modelName === 'スマスロ北斗の拳')).toBe(true);
        expect(expandedB.map((m) => m.machineNum)).toEqual([217, 220]);

        const modelC = mockModels[2]; // store-1, アイムジャグラーEX
        const expandedC = getMachinesForModelRank(modelC, mockMachines);

        expect(expandedC).toHaveLength(1);
        expect(expandedC[0].storeId).toBe('store-1');
        expect(expandedC[0].modelName).toBe('アイムジャグラーEX');
        expect(expandedC[0].machineNum).toBe(333);
      });

      it('展開された台番一覧にも絞り込み条件（末尾・信頼度など）が正常に連動適用されること', () => {
        const modelA = mockModels[0]; // store-1, マイジャグラーV (台番: 107[末尾7,高], 102[末尾2,中])
        const expandedTail7 = getMachinesForModelRank(modelA, mockMachines, { tailDigit: 7 });

        expect(expandedTail7).toHaveLength(1);
        expect(expandedTail7[0].machineNum).toBe(107);

        const expandedMed = getMachinesForModelRank(modelA, mockMachines, { confidence: '中' });
        expect(expandedMed).toHaveLength(1);
        expect(expandedMed[0].machineNum).toBe(102);
      });
    });

    describe('3. 保存と復元 (localStorage)', () => {
      beforeEach(() => {
        // Mock localStorage in test environment
        const store: Record<string, string> = {};
        globalThis.localStorage = {
          getItem: (key: string) => store[key] || null,
          setItem: (key: string, value: string) => {
            store[key] = value;
          },
          removeItem: (key: string) => {
            delete store[key];
          },
          clear: () => {
            for (const k in store) delete store[k];
          },
          key: (idx: number) => Object.keys(store)[idx] || null,
          length: 0,
        };
      });

      it('絞り込み条件・表示形式が localStorage に保存され、正しく復元されること', () => {
        const settingsToSave = {
          selectedStoreIds: ['store-1', 'store-2'],
          metricMode: 'yen' as const,
          diffMetric: 'baseGames' as const,
          baseGames: 6000,
          displayCount: 50,
          rankingView: 'models' as const,
          filters: {
            modelName: 'マイジャグラー',
            islandName: 'メイン島',
            tailDigit: 7,
            minEvidenceDays: 5,
            confidence: '高' as const,
          },
        };

        saveCrossStoreSettings(settingsToSave);

        const loaded = loadCrossStoreSettings();
        expect(loaded).toBeDefined();
        expect(loaded.selectedStoreIds).toEqual(['store-1', 'store-2']);
        expect(loaded.metricMode).toBe('yen');
        expect(loaded.diffMetric).toBe('baseGames');
        expect(loaded.baseGames).toBe(6000);
        expect(loaded.displayCount).toBe(50);
        expect(loaded.rankingView).toBe('models');

        expect(loaded.filters).toBeDefined();
        expect(loaded.filters?.modelName).toBe('マイジャグラー');
        expect(loaded.filters?.islandName).toBe('メイン島');
        expect(loaded.filters?.tailDigit).toBe(7);
        expect(loaded.filters?.minEvidenceDays).toBe(5);
        expect(loaded.filters?.confidence).toBe('高');
      });

      it('localStorage にデータが存在しない場合は空オブジェクトが返ること', () => {
        localStorage.clear();
        const loaded = loadCrossStoreSettings();
        expect(loaded).toEqual({});
      });
    });
  });

  // 13. プロンプト58: 来店日スキャンの高速化（結果は完全一致）
  describe('プロンプト58: 来店日スキャンの高速化と結果の完全一致検証', () => {
    // 3店×90日×40台の合成データを生成
    function createPrompt58SyntheticData() {
      const models = ['マイジャグラーV', 'アイムジャグラーEX', 'L パチスロ北斗の拳', '押忍！番長4'];
      const startDate = new Date('2024-01-01');
      const stores: StoreProfile[] = [];

      for (let s = 1; s <= 3; s++) {
        const storeId = `p58-store-${s}`;
        const storeName = `テスト店舗${s}`;
        const dailyRecords: DailyRecord[] = [];

        // Store 3 has no machine data (machines is undefined)
        const hasMachines = s !== 3;

        for (let d = 0; d < 90; d++) {
          const curDate = new Date(startDate);
          curDate.setDate(curDate.getDate() + d);
          const y = curDate.getFullYear();
          const m = String(curDate.getMonth() + 1).padStart(2, '0');
          const day = String(curDate.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${day}`;
          const dow = ['日', '月', '火', '水', '木', '金', '土'][curDate.getDay()];

          const machines = hasMachines
            ? Array.from({ length: 40 }, (_, idx) => {
                const machineNum = 101 + idx;
                const modelName = models[idx % models.length];
                const diff = ((idx * 37 + d * 13) % 4000) - 1500;
                const games = 4000 + ((idx * 17) % 3000);
                return {
                  machineNum,
                  modelName,
                  diff,
                  games,
                  bb: Math.max(0, Math.floor(games / 250)),
                  rb: Math.max(0, Math.floor(games / 350)),
                  payoutRate: 100 + (diff / (games * 3)) * 100,
                  tailDigit: machineNum % 10,
                  isZoro: machineNum === 111,
                };
              })
            : undefined;

          dailyRecords.push({
            date: dateStr,
            yearMonth: `${y}-${m}`,
            year: y,
            month: Number(m),
            day: Number(day),
            dayOfWeek: dow,
            avgDiffCoins: 120,
            avgGames: 5000,
            winRate: 52,
            winMachines: 20,
            totalMachines: 40,
            totalDiffCoins: 4800,
            hallCoinProfit: -4800,
            playerCoinProfit: 4800,
            hallYenProfit: -96000,
            playerYenProfit: 96000,
            inCoins: 600000,
            outCoins: 604800,
            payoutRate: 100.8,
            estimatedRevenue: 200000,
            exchangeGapProfit: 10000,
            gModelHallProfit: 20000,
            gModelPlayerProfit: -20000,
            isOldEventDay: day.endsWith('7'),
            is7Day: day.endsWith('7'),
            notable: '',
            models: models.map((mod) => ({
              modelName: mod,
              avgDiffCoins: 150,
              totalDiffCoins: 1500,
              avgGames: 5000,
              winRate: 55,
              winMachines: 5,
              totalMachines: 10,
            })),
            machines,
          });
        }

        stores.push({
          id: storeId,
          name: storeName,
          address: '東京都',
          oldEventDays: '7のつく日',
          exchangeRate: '46枚貸/52枚交換',
          rateLend: 46,
          rateExchange: 52,
          totalMachinesApprox: 40,
          dataRange: '2024-01-01 〜 2024-03-30',
          specialDayRules: s === 2 ? { tails: [7], doubleDigits: true } : undefined,
          dailyRecords,
        });
      }

      return stores;
    }

    it('1. 現行の calculateStoreTargetMetrics と新関数の出力が、3店×90日×40台・日付10個で全セルJSON完全一致する', () => {
      const stores = createPrompt58SyntheticData();
      // 日付が昇順でない入力、データの最初の日(過去0日: '2024-01-01')、過去3日未満('2024-01-03')、過去7日未満('2024-01-05')、通常日、データ範囲外の日
      const testDates = [
        '2024-03-15',
        '2024-01-01', // データの最初の日（過去0日）
        '2024-02-10',
        '2024-01-03', // 過去3日未満（2日）
        '2024-01-05', // 過去7日未満（4日）
        '2024-04-01', // 過去90日
        '2024-02-28',
        '2024-01-02', // 過去1日
        '2024-03-01',
        '2024-04-05',
      ];

      // A. デフォルトオプション (diffMetric='actual', topN=10)
      for (const store of stores) {
        const batchResults = calculateStoreTargetMetricsForDates(store, testDates, { topN: 10 });
        expect(batchResults).toHaveLength(testDates.length);

        testDates.forEach((date, idx) => {
          const singleCell = calculateStoreTargetMetrics(store, date, { topN: 10 });
          const batchCell = batchResults[idx];
          expect(JSON.stringify(batchCell)).toBe(JSON.stringify(singleCell));
        });
      }

      // B. diffMetric='baseGames', topN=3
      for (const store of stores) {
        const batchResults = calculateStoreTargetMetricsForDates(store, testDates, {
          diffMetric: 'baseGames',
          topN: 3,
          baseGames: 6000,
        });
        expect(batchResults).toHaveLength(testDates.length);

        testDates.forEach((date, idx) => {
          const singleCell = calculateStoreTargetMetrics(store, date, {
            diffMetric: 'baseGames',
            topN: 3,
            baseGames: 6000,
          });
          const batchCell = batchResults[idx];
          expect(JSON.stringify(batchCell)).toBe(JSON.stringify(singleCell));
        });
      }
    });

    it('2. 新しい署名で作ったキー文字列が、旧 computeStoreDateScanCacheKey のキーと全（店舗, 日付）で一致する', () => {
      const stores = createPrompt58SyntheticData();
      const testDates = [
        '2023-12-31', // 過去0日（開始前）
        '2024-01-01', // 過去0日（当日）
        '2024-01-02',
        '2024-01-15',
        '2024-02-01',
        '2024-03-10',
        '2024-04-10', // 全期間後
      ];

      for (const store of stores) {
        const prefixData = buildStoreScanPrefixData(
          store.id,
          store.dailyRecords,
          10,
          'actual',
          5000,
          store.customMachineRankingWeights,
          store.specialDayRules,
          store.modelAliasDictionary,
          store.includeReusedMachinesInStats
        );

        for (const date of testDates) {
          const newKey = prefixData.computeKeyForDate(date);
          const oldKey = computeStoreDateScanCacheKey(
            store.id,
            date,
            store.dailyRecords,
            10,
            'actual',
            5000,
            store.customMachineRankingWeights,
            store.specialDayRules,
            store.modelAliasDictionary,
            store.includeReusedMachinesInStats
          );

          expect(newKey).toBe(oldKey);
        }
      }
    });

    it('3. キャッシュが全部あるとき、アキュムレータとインデックスを作らないこと', () => {
      const stores = createPrompt58SyntheticData();
      const scanDates = ['2024-02-01', '2024-02-02', '2024-02-03'];

      clearMemoryScanCache();

      // 1回目の実行: キャッシュを投入
      const firstScan = scanCandidateDates(stores, scanDates, { topN: 10 });
      expect(firstScan.grid[stores[0].id]['2024-02-01']).toBeDefined();

      // buildMachineFeatureIndex を spy
      const featureIndexSpy = vi.spyOn(targetMachineRankingModule, 'buildMachineFeatureIndex');

      // 2回目の実行: 全てメモリキャッシュに存在するため、アキュムレータやインデックス作成を一切行わない
      const secondScan = scanCandidateDates(stores, scanDates, { topN: 10 });
      expect(secondScan.grid[stores[0].id]['2024-02-01']).toEqual(
        firstScan.grid[stores[0].id]['2024-02-01']
      );

      expect(featureIndexSpy).not.toHaveBeenCalled();

      featureIndexSpy.mockRestore();
    });
  });
});



