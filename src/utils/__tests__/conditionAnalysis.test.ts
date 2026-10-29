import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ConditionDimension,
  ConditionColumnDef,
  DOW_COLUMNS,
  TAIL_COLUMNS,
  SPECIAL_COLUMNS,
  MACHINE_TAIL_COLUMNS,
  DEFAULT_MONTH_EDGE_DAYS,
  MONTH_PHASE_DEFINITION_TEXT,
  clampMonthEdgeDays,
  getMonthPhaseColumns,
  getConditionColumns,
  getRecordYearMonthDay,
  calculateConditionStats,
  calculateAllStoresTotalConditionStats,
  calculateMultiStoreConditions,
  calculateMonthPhaseByMonth,
  isRecordInMonthPhase,
  MonthPhaseByMonthRow,
  ALL_STORES_TOTAL_NAME,
  ALL_STORES_TOTAL_STORE_ID,
} from '../conditionAnalysis';
import { DailyRecord, StoreProfile } from '../../data/types';
import { createSyntheticMachineRecords } from './testDataGenerator';

const GOLDEN_DIR = path.resolve(__dirname, 'golden');
const GOLDEN_FILE_PATH = path.resolve(GOLDEN_DIR, 'conditionAnalysisExistingDimensionsGolden.json');

function createSimpleRecord(
  date: string,
  machines: number,
  avgGames: number,
  totalDiff: number,
  winMachines: number
): DailyRecord {
  const parts = date.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const inCoins = avgGames * 3 * machines;
  const outCoins = inCoins + totalDiff;
  const payoutRate = inCoins > 0 ? Math.round((outCoins / inCoins) * 10000) / 100 : 100;
  const avgDiffCoins = Math.round((totalDiff / machines) * 10) / 10;
  const winRate = Math.round((winMachines / machines) * 1000) / 10;

  return {
    date,
    yearMonth: `${y}-${String(m).padStart(2, '0')}`,
    year: y,
    month: m,
    day: d,
    dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()],
    avgDiffCoins,
    avgGames,
    winRate,
    winMachines,
    totalMachines: machines,
    totalDiffCoins: totalDiff,
    hallCoinProfit: -totalDiff,
    playerCoinProfit: totalDiff,
    hallYenProfit: -totalDiff * 20,
    playerYenProfit: totalDiff * 20,
    inCoins,
    outCoins,
    payoutRate,
    estimatedRevenue: 100000,
    exchangeGapProfit: 0,
    gModelHallProfit: -totalDiff * 20,
    gModelPlayerProfit: totalDiff * 20,
    isOldEventDay: false,
    is7Day: d % 10 === 7,
    notable: '',
  };
}

describe('Prompt 60-1: 条件別分析 - 月内の時期 (monthPhase) 計算ロジック', () => {
  describe('1. 定義と列の取得 (getMonthPhaseColumns / getConditionColumns)', () => {
    it('MONTH_PHASE_DEFINITION_TEXT が期待通りの説明文を含んでいること', () => {
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('月内の時期');
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('月初');
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('月末');
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('上旬');
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('中旬');
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('下旬');
      expect(MONTH_PHASE_DEFINITION_TEXT).toContain('暦の日数');
    });

    it('clampMonthEdgeDays が 1〜10 の範囲に正しく丸めること', () => {
      expect(clampMonthEdgeDays()).toBe(5);
      expect(clampMonthEdgeDays(undefined)).toBe(5);
      expect(clampMonthEdgeDays(NaN)).toBe(5);
      expect(clampMonthEdgeDays(5)).toBe(5);
      expect(clampMonthEdgeDays(3)).toBe(3);
      expect(clampMonthEdgeDays(7)).toBe(7);
      expect(clampMonthEdgeDays(0)).toBe(1);
      expect(clampMonthEdgeDays(-5)).toBe(1);
      expect(clampMonthEdgeDays(20)).toBe(10);
      expect(clampMonthEdgeDays(11)).toBe(10);
      expect(clampMonthEdgeDays(5.4)).toBe(5);
      expect(clampMonthEdgeDays(5.6)).toBe(6);
    });

    it('getMonthPhaseColumns が 5 列を返し、キーとグループが正しいこと', () => {
      const cols = getMonthPhaseColumns();
      expect(cols).toHaveLength(5);
      expect(cols.map((c) => c.key)).toEqual(['monthStart', 'monthEnd', 'early', 'mid', 'late']);

      expect(cols.find((c) => c.key === 'monthStart')?.group).toBe('edge');
      expect(cols.find((c) => c.key === 'monthEnd')?.group).toBe('edge');
      expect(cols.find((c) => c.key === 'early')?.group).toBe('decade');
      expect(cols.find((c) => c.key === 'mid')?.group).toBe('decade');
      expect(cols.find((c) => c.key === 'late')?.group).toBe('decade');

      // 既定N=5
      expect(cols.find((c) => c.key === 'monthStart')?.label).toBe('月初（1〜5日）');
      expect(cols.find((c) => c.key === 'monthEnd')?.label).toBe('月末（月末5日間）');
      expect(cols.find((c) => c.key === 'early')?.label).toBe('上旬（1〜10日）');
      expect(cols.find((c) => c.key === 'mid')?.label).toBe('中旬（11〜20日）');
      expect(cols.find((c) => c.key === 'late')?.label).toBe('下旬（21日〜月末）');
    });

    it('N=3, 7, 0, 20 で表示名が動的に変わり、境界値が丸まること', () => {
      const cols3 = getMonthPhaseColumns(3);
      expect(cols3.find((c) => c.key === 'monthStart')?.label).toBe('月初（1〜3日）');
      expect(cols3.find((c) => c.key === 'monthEnd')?.label).toBe('月末（月末3日間）');

      const cols7 = getMonthPhaseColumns(7);
      expect(cols7.find((c) => c.key === 'monthStart')?.label).toBe('月初（1〜7日）');
      expect(cols7.find((c) => c.key === 'monthEnd')?.label).toBe('月末（月末7日間）');

      // N=0 -> 丸め1
      const cols0 = getMonthPhaseColumns(0);
      expect(cols0.find((c) => c.key === 'monthStart')?.label).toBe('月初（1〜1日）');
      expect(cols0.find((c) => c.key === 'monthEnd')?.label).toBe('月末（月末1日間）');

      // N=20 -> 丸め10
      const cols20 = getMonthPhaseColumns(20);
      expect(cols20.find((c) => c.key === 'monthStart')?.label).toBe('月初（1〜10日）');
      expect(cols20.find((c) => c.key === 'monthEnd')?.label).toBe('月末（月末10日間）');
    });

    it('getConditionColumns がオプションなしで既存の4切り口をそのまま返すこと', () => {
      expect(getConditionColumns('dow')).toBe(DOW_COLUMNS);
      expect(getConditionColumns('tail')).toBe(TAIL_COLUMNS);
      expect(getConditionColumns('special')).toBe(SPECIAL_COLUMNS);
      expect(getConditionColumns('machineTail')).toBe(MACHINE_TAIL_COLUMNS);

      const mpCols = getConditionColumns('monthPhase', { monthEdgeDays: 4 });
      expect(mpCols[0].label).toBe('月初（1〜4日）');
    });
  });

  describe('2. 日付・暦・境界値の判定 (getRecordYearMonthDay と境界日)', () => {
    it('平年2月(28日)、閏年2月(29日)、30日、31日の日数を正確に判定すること', () => {
      expect(getRecordYearMonthDay({ date: '2025-02-15' }).daysInMonth).toBe(28);
      expect(getRecordYearMonthDay({ date: '2024-02-15' }).daysInMonth).toBe(29);
      expect(getRecordYearMonthDay({ date: '2025-04-15' }).daysInMonth).toBe(30);
      expect(getRecordYearMonthDay({ date: '2025-01-15' }).daysInMonth).toBe(31);

      // r.year / r.month / r.day が省略されていても date 文字列から復元できること
      const parsed = getRecordYearMonthDay({ date: '2024-02-29' });
      expect(parsed.year).toBe(2024);
      expect(parsed.month).toBe(2);
      expect(parsed.day).toBe(29);
      expect(parsed.daysInMonth).toBe(29);
    });

    it('上旬/中旬の境界 (10日 vs 11日) と中旬/下旬の境界 (20日 vs 21日)', () => {
      const records = [
        createSimpleRecord('2025-01-10', 10, 5000, 1000, 6),
        createSimpleRecord('2025-01-11', 10, 5000, 2000, 7),
        createSimpleRecord('2025-01-20', 10, 5000, 3000, 8),
        createSimpleRecord('2025-01-21', 10, 5000, 4000, 9),
      ];

      const stats = calculateConditionStats(records, 'monthPhase');
      const early = stats.find((s) => s.key === 'early')!;
      const mid = stats.find((s) => s.key === 'mid')!;
      const late = stats.find((s) => s.key === 'late')!;

      expect(early.records.map((r) => r.day)).toEqual([10]);
      expect(mid.records.map((r) => r.day).sort((a, b) => a - b)).toEqual([11, 20]);
      expect(late.records.map((r) => r.day)).toEqual([21]);
    });

    it('月初の最終日 (N日 vs N+1日) と月末の最初の日', () => {
      // 4月 (30日) で N=5 の場合:
      // 月初: 1〜5日 (5日は入る、6日は入らない)
      // 月末: 30 - 5 + 1 = 26日〜30日 (25日は入らない、26日は入る)
      const recordsApril = [
        createSimpleRecord('2025-04-05', 10, 5000, 1000, 5),
        createSimpleRecord('2025-04-06', 10, 5000, 1000, 5),
        createSimpleRecord('2025-04-25', 10, 5000, 1000, 5),
        createSimpleRecord('2025-04-26', 10, 5000, 1000, 5),
        createSimpleRecord('2025-04-30', 10, 5000, 1000, 5),
      ];

      const statsApril = calculateConditionStats(recordsApril, 'monthPhase', { monthEdgeDays: 5 });
      const mStart = statsApril.find((s) => s.key === 'monthStart')!;
      const mEnd = statsApril.find((s) => s.key === 'monthEnd')!;

      expect(mStart.records.map((r) => r.day)).toEqual([5]); // 5日のみ入る
      expect(mEnd.records.map((r) => r.day).sort((a, b) => a - b)).toEqual([26, 30]); // 26日と30日のみ入る
    });

    it('2月の平年(28日)・閏年(29日)における月末N日間の判定', () => {
      // 平年2月(2025-02, 28日), N=5: 24, 25, 26, 27, 28日 (23日は月末に入らない)
      const recordsFebNormal = [
        createSimpleRecord('2025-02-23', 10, 5000, 1000, 5),
        createSimpleRecord('2025-02-24', 10, 5000, 1000, 5),
        createSimpleRecord('2025-02-28', 10, 5000, 1000, 5),
      ];
      const statsFebNormal = calculateConditionStats(recordsFebNormal, 'monthPhase', { monthEdgeDays: 5 });
      const febEndNormal = statsFebNormal.find((s) => s.key === 'monthEnd')!;
      expect(febEndNormal.records.map((r) => r.day).sort((a, b) => a - b)).toEqual([24, 28]);

      // 閏年2月(2024-02, 29日), N=5: 25, 26, 27, 28, 29日 (24日は月末に入らない)
      const recordsFebLeap = [
        createSimpleRecord('2024-02-24', 10, 5000, 1000, 5),
        createSimpleRecord('2024-02-25', 10, 5000, 1000, 5),
        createSimpleRecord('2024-02-29', 10, 5000, 1000, 5),
      ];
      const statsFebLeap = calculateConditionStats(recordsFebLeap, 'monthPhase', { monthEdgeDays: 5 });
      const febEndLeap = statsFebLeap.find((s) => s.key === 'monthEnd')!;
      expect(febEndLeap.records.map((r) => r.day).sort((a, b) => a - b)).toEqual([25, 29]);
    });
  });

  describe('3. 上旬・中旬・下旬の排他性・全日保存則と月初・月末の重複性', () => {
    it('上旬・中旬・下旬の営業日数および総差枚が、全体の合計と完全に一致すること', () => {
      // 2025年1月1日〜2月28日（全59日間）の連続データを作成
      const allDaysRecords: DailyRecord[] = [];
      const baseDate = new Date(2025, 0, 1);
      for (let i = 0; i < 59; i++) {
        const cur = new Date(baseDate.getTime() + i * 86400000);
        const y = cur.getFullYear();
        const m = cur.getMonth() + 1;
        const d = cur.getDate();
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const diff = (i % 7) * 500 - 1500;
        allDaysRecords.push(createSimpleRecord(dateStr, 20, 5000, diff, 10));
      }

      const stats = calculateConditionStats(allDaysRecords, 'monthPhase');
      const early = stats.find((s) => s.key === 'early')!;
      const mid = stats.find((s) => s.key === 'mid')!;
      const late = stats.find((s) => s.key === 'late')!;

      // 営業日数の合計 = 全営業日数
      expect(early.count + mid.count + late.count).toBe(allDaysRecords.length);

      // 総差枚の合計 = 全レコードの総差枚
      const sumDecadeDiffCoins =
        early.totalDiffCoins + mid.totalDiffCoins + late.totalDiffCoins;
      const expectedTotalDiff = allDaysRecords.reduce((acc, r) => acc + r.totalDiffCoins, 0);
      expect(sumDecadeDiffCoins).toBe(expectedTotalDiff);
    });

    it('月初と月末は上旬・下旬と正しく重複していること (例: 3日は月初と上旬の両方に入る)', () => {
      const records = [
        createSimpleRecord('2025-01-03', 10, 5000, 1000, 5),
        createSimpleRecord('2025-01-29', 10, 5000, 2000, 5),
      ];

      const stats = calculateConditionStats(records, 'monthPhase', { monthEdgeDays: 5 });
      const mStart = stats.find((s) => s.key === 'monthStart')!;
      const early = stats.find((s) => s.key === 'early')!;
      const mEnd = stats.find((s) => s.key === 'monthEnd')!;
      const late = stats.find((s) => s.key === 'late')!;

      // 3日は月初かつ上旬
      expect(mStart.records.some((r) => r.date === '2025-01-03')).toBe(true);
      expect(early.records.some((r) => r.date === '2025-01-03')).toBe(true);

      // 29日は月末(31-5+1=27〜31)かつ下旬(21〜31)
      expect(mEnd.records.some((r) => r.date === '2025-01-29')).toBe(true);
      expect(late.records.some((r) => r.date === '2025-01-29')).toBe(true);
    });
  });

  describe('4. 3つの指標の手計算検証 (台あたり差枚・出率・高出率台の率)', () => {
    it('単一店舗における3指標が手計算結果と完全に一致すること', () => {
      // 2日間の小規模データ
      // 日1: 2025-01-02 (月初かつ上旬)
      // 台数10, games 5000, totalDiff +2000, winMachines 7
      // inCoins = 5000 * 3 * 10 = 150000, outCoins = 152000
      // payoutRate = (152000 / 150000) * 100 = 101.33%
      // highPayoutRate = 7 / 10 = 70.0%
      // avgDiff = 200.0
      //
      // 日2: 2025-01-04 (月初かつ上旬)
      // 台数10, games 5000, totalDiff -1000, winMachines 3
      // inCoins = 5000 * 3 * 10 = 150000, outCoins = 149000
      // payoutRate = (149000 / 150000) * 100 = 99.33%
      // highPayoutRate = 3 / 10 = 30.0%
      // avgDiff = -100.0
      const rec1 = createSimpleRecord('2025-01-02', 10, 5000, 2000, 7);
      const rec2 = createSimpleRecord('2025-01-04', 10, 5000, -1000, 3);

      const stats = calculateConditionStats([rec1, rec2], 'monthPhase', { monthEdgeDays: 5 });
      const mStart = stats.find((s) => s.key === 'monthStart')!;

      expect(mStart.count).toBe(2);
      expect(mStart.isStoreEvent).toBe(false);
      expect(mStart.isWeekend).toBe(false);
      expect(mStart.isHoliday).toBe(false);

      // 台あたり差枚: (+200 + -100) / 2 = 50.0
      expect(mStart.avgDiffCoins).toBe(50.0);

      // 出率: (101.33 + 99.33) / 2 = 100.33%
      expect(mStart.payoutRate).toBe(100.33);

      // 高出率台の率: winMachines(7 + 3) / totalMachines(10 + 10) = 10 / 20 = 50.0%
      expect(mStart.highPayoutRate).toBe(50.0);
    });

    it('複数店舗の「全店合計」における3指標が手計算結果と完全に一致すること', () => {
      // 店1: 2025-01-02 (月初)
      // 台数10, games 5000, diff +2000, winMachines 7
      // in = 150,000, out = 152,000
      const store1Records = [createSimpleRecord('2025-01-02', 10, 5000, 2000, 7)];
      const store1: StoreProfile = {
        id: 's1',
        name: '店舗1',
        totalMachinesApprox: 10,
        dailyRecords: store1Records,
      } as StoreProfile;

      // 店2: 2025-01-02 (月初)
      // 台数20, games 6000, diff +4000, winMachines 14
      // in = 6000 * 3 * 20 = 360,000, out = 364,000
      const store2Records = [createSimpleRecord('2025-01-02', 20, 6000, 4000, 14)];
      const store2: StoreProfile = {
        id: 's2',
        name: '店舗2',
        totalMachinesApprox: 20,
        dailyRecords: store2Records,
      } as StoreProfile;

      const rows = calculateMultiStoreConditions([store1, store2], 'monthPhase', {
        monthEdgeDays: 5,
        includeTotalRow: true,
      });

      const totalRow = rows.find((r) => r.isTotal)!;
      expect(totalRow).toBeDefined();

      const totalMonthStart = totalRow.stats.find((s) => s.key === 'monthStart')!;
      expect(totalMonthStart.count).toBe(1); // 1ユニーク日 (2025-01-02)

      // 台あたり差枚 = 全台の差枚の合計 ÷ 全台の台日数
      // (2000 + 4000) / (10 + 20) = 6000 / 30 = 200.0
      expect(totalMonthStart.avgDiffCoins).toBe(200.0);

      // 出率 = Total OUT ÷ Total IN * 100
      // Total IN = 150,000 + 360,000 = 510,000
      // Total OUT = 152,000 + 364,000 = 516,000
      // 516,000 / 510,000 * 100 = 101.17647... -> 101.18%
      expect(totalMonthStart.payoutRate).toBe(101.18);

      // 高出率台の率 = 高出率台数の合計 ÷ 総台数の合計 * 100
      // (7 + 14) / (10 + 20) = 21 / 30 = 70.0%
      expect(totalMonthStart.highPayoutRate).toBe(70.0);
    });
  });

  describe('5. 回帰テスト: 既存4切り口（dow / tail / special / machineTail）のゴールデン一致', () => {
    it('固定合成データ（2店×60日×30台）で計算した既存4切り口のJSONが変更前ゴールデンとバイト単位で一致すること', () => {
      const records1 = createSyntheticMachineRecords({
        daysCount: 60,
        machinesCount: 30,
        seed: 12345,
      });
      const store1: StoreProfile = {
        id: 'store-1',
        name: 'マルハン新宿東宝ビル店',
        totalMachinesApprox: 30,
        oldEventDays: '7のつく日',
        specialDayRules: { tails: [7] },
        dailyRecords: records1,
      } as StoreProfile;

      const records2 = createSyntheticMachineRecords({
        daysCount: 60,
        machinesCount: 30,
        seed: 67890,
      });
      const store2: StoreProfile = {
        id: 'store-2',
        name: 'エスパス日拓歌舞伎町店',
        totalMachinesApprox: 30,
        oldEventDays: '0のつく日,ゾロ目',
        specialDayRules: { tails: [0], doubleDigits: true },
        dailyRecords: records2,
      } as StoreProfile;

      const dimensions: ConditionDimension[] = ['dow', 'tail', 'special', 'machineTail'];
      const rawPayload = dimensions.reduce((acc, dim) => {
        const rows = calculateMultiStoreConditions([store1, store2], dim);
        // Exclude deep records array for clean and robust JSON golden comparison
        acc[dim] = rows.map((r) => ({
          storeId: r.storeId,
          storeName: r.storeName,
          isTotal: r.isTotal,
          totalDays: r.totalDays,
          stats: r.stats.map((s) => ({
            key: s.key,
            label: s.label,
            shortLabel: s.shortLabel,
            sampleDays: s.sampleDays,
            count: s.count,
            isWeekend: s.isWeekend,
            isHoliday: s.isHoliday,
            isStoreEvent: s.isStoreEvent,
            avgDiffCoins: s.avgDiffCoins,
            payoutRate: s.payoutRate,
            highPayoutRate: s.highPayoutRate,
            avgGames: s.avgGames,
            totalDiffCoins: s.totalDiffCoins,
            totalMachines: s.totalMachines,
            totalHallProfit: s.totalHallProfit,
            dailyHallProfit: s.dailyHallProfit,
            totalPlayerProfit: s.totalPlayerProfit,
            dailyPlayerProfit: s.dailyPlayerProfit,
            perMachineDailyProfit: s.perMachineDailyProfit,
            perMachineDailyPlayerProfit: s.perMachineDailyPlayerProfit,
            playerWinDays: s.playerWinDays,
            playerWinRate: s.playerWinRate,
            displayDiffCoins: s.displayDiffCoins,
            displayTotalCoins: s.displayTotalCoins,
            displayDailyProfit: s.displayDailyProfit,
            displayTotalProfit: s.displayTotalProfit,
            displayPerMachineDailyProfit: s.displayPerMachineDailyProfit,
            displayPerMachineTotalProfit: s.displayPerMachineTotalProfit,
            recordDates: s.records.map((rec) => rec.date),
          })),
        }));
        return acc;
      }, {} as Record<string, any>);

      const goldenJsonString = JSON.stringify(rawPayload, null, 2);

      if (process.env.UPDATE_GOLDEN === 'true' || !fs.existsSync(GOLDEN_FILE_PATH)) {
        if (!fs.existsSync(GOLDEN_DIR)) {
          fs.mkdirSync(GOLDEN_DIR, { recursive: true });
        }
        fs.writeFileSync(GOLDEN_FILE_PATH, goldenJsonString, 'utf-8');
      }

      const savedGoldenString = fs.readFileSync(GOLDEN_FILE_PATH, 'utf-8');

      // Byte-for-byte exact equality comparison
      expect(goldenJsonString).toBe(savedGoldenString);
      expect(JSON.parse(goldenJsonString)).toEqual(JSON.parse(savedGoldenString));
    });
  });

  describe('Prompt 60-3: 年月 × 時期のヒートマップ (calculateMonthPhaseByMonth)', () => {
    // 3か月の合成データ:
    // 1月: 2025-01-15〜2025-01-31 (開始が15日 -> isPartial: true, 「一部」)
    // 2月: 2025-02-01〜2025-02-28 (平年28日、全日存在 -> isPartial: false, 「一部」なし)
    // 3月: 2025-03-01〜2025-03-20 (終了が20日 -> isPartial: true, 「一部」)
    const month1Records = [
      createSimpleRecord('2025-01-15', 10, 5000, 1000, 6), // 中旬 (15日)
      createSimpleRecord('2025-01-20', 10, 5000, 2000, 8), // 中旬 (20日)
      createSimpleRecord('2025-01-25', 10, 5000, -1000, 4), // 下旬 (25日)
      createSimpleRecord('2025-01-28', 10, 5000, 500, 5), // 下旬 & 月末 (28日)
      createSimpleRecord('2025-01-31', 10, 5000, 1500, 7), // 下旬 & 月末 (31日)
    ];

    const month2Records: DailyRecord[] = [];
    for (let day = 1; day <= 28; day++) {
      const dateStr = `2025-02-${String(day).padStart(2, '0')}`;
      const diff = day % 2 === 0 ? 1000 : -500;
      const winMachs = day % 2 === 0 ? 7 : 3;
      month2Records.push(createSimpleRecord(dateStr, 10, 5000, diff, winMachs));
    }

    const month3Records = [
      createSimpleRecord('2025-03-01', 10, 5000, 2000, 7), // 月初 & 上旬 (1日)
      createSimpleRecord('2025-03-05', 10, 5000, 1000, 6), // 月初 & 上旬 (5日)
      createSimpleRecord('2025-03-08', 10, 5000, -500, 4), // 上旬 (8日)
      createSimpleRecord('2025-03-15', 10, 5000, 3000, 9), // 中旬 (15日)
      createSimpleRecord('2025-03-20', 10, 5000, 500, 5), // 中旬 (20日)
    ];

    const threeMonthRecords = [...month1Records, ...month2Records, ...month3Records];

    it('1. 行は年月（新しい順）で並び、各月行の見出しに「一部」が正しく注記されること', () => {
      const rows = calculateMonthPhaseByMonth(threeMonthRecords);

      expect(rows).toHaveLength(3);

      // 新しい順: 2025-03, 2025-02, 2025-01
      expect(rows[0].yearMonth).toBe('2025-03');
      expect(rows[1].yearMonth).toBe('2025-02');
      expect(rows[2].yearMonth).toBe('2025-01');

      // 2025-03: 1日〜20日で月末31日までないため一部
      expect(rows[0].isPartial).toBe(true);
      expect(rows[0].partialLabel).toBe('一部');
      expect(rows[0].label).toBe('2025年3月（一部）');
      expect(rows[0].displayMonth).toBe('2025年3月');
      expect(rows[0].daysCount).toBe(5);

      // 2025-02: 1日〜28日まで全日揃っているため一部ではない
      expect(rows[1].isPartial).toBe(false);
      expect(rows[1].partialLabel).toBeUndefined();
      expect(rows[1].label).toBe('2025年2月');
      expect(rows[1].displayMonth).toBe('2025年2月');
      expect(rows[1].daysCount).toBe(28);

      // 2025-01: 15日〜31日で1日〜14日がないため一部
      expect(rows[2].isPartial).toBe(true);
      expect(rows[2].partialLabel).toBe('一部');
      expect(rows[2].label).toBe('2025年1月（一部）');
      expect(rows[2].displayMonth).toBe('2025年1月');
      expect(rows[2].daysCount).toBe(5);
    });

    it('2. 各セル（5つの時期列）の集計数値が手計算結果と完全に一致すること', () => {
      const rows = calculateMonthPhaseByMonth(threeMonthRecords, { monthEdgeDays: 5 });
      const janRow = rows.find((r) => r.yearMonth === '2025-01')!;

      // 5列が存在すること
      expect(janRow.stats).toHaveLength(5);
      expect(janRow.stats.map((s) => s.key)).toEqual([
        'monthStart',
        'monthEnd',
        'early',
        'mid',
        'late',
      ]);

      // 2025-01 手計算検証:
      // monthStart (1〜5日): 0件
      const mStart = janRow.stats.find((s) => s.key === 'monthStart')!;
      expect(mStart.count).toBe(0);
      expect(mStart.avgDiffCoins).toBe(0);

      // early (1〜10日): 0件
      const early = janRow.stats.find((s) => s.key === 'early')!;
      expect(early.count).toBe(0);

      // mid (11〜20日): 15日(+1000枚/6勝), 20日(+2000枚/8勝)
      // avgDiffCoins: (100 + 200) / 2 = 150.0
      // payoutRate: (100.67 + 101.33) / 2 = 101.00%
      // highPayoutRate: (6 + 8) / (10 + 10) = 14 / 20 = 70.0%
      const mid = janRow.stats.find((s) => s.key === 'mid')!;
      expect(mid.count).toBe(2);
      expect(mid.avgDiffCoins).toBe(150.0);
      expect(mid.payoutRate).toBe(101.0);
      expect(mid.highPayoutRate).toBe(70.0);

      // late (21〜31日): 25日(-1000/4勝), 28日(+500/5勝), 31日(+1500/7勝)
      // avgDiffCoins: (-100 + 50 + 150) / 3 = 100 / 3 = 33.3
      // payoutRate: (99.33 + 100.33 + 101.00) / 3 = 100.22%
      // highPayoutRate: (4 + 5 + 7) / 30 = 16 / 30 = 53.3%
      const late = janRow.stats.find((s) => s.key === 'late')!;
      expect(late.count).toBe(3);
      expect(late.avgDiffCoins).toBe(33.3);
      expect(late.payoutRate).toBe(100.22);
      expect(late.highPayoutRate).toBe(53.3);

      // monthEnd (月末5日間: 27〜31日): 28日(+500/5勝), 31日(+1500/7勝)
      // avgDiffCoins: (50 + 150) / 2 = 100.0
      // payoutRate: (100.33 + 101.00) / 2 = 100.67%
      // highPayoutRate: (5 + 7) / 20 = 12 / 20 = 60.0%
      const mEnd = janRow.stats.find((s) => s.key === 'monthEnd')!;
      expect(mEnd.count).toBe(2);
      expect(mEnd.avgDiffCoins).toBe(100.0);
      expect(mEnd.payoutRate).toBe(100.67);
      expect(mEnd.highPayoutRate).toBe(60.0);
    });

    it('3. calculateConditionStats との数値一致 (重複せず純関数計算が共有されていること)', () => {
      const rows = calculateMonthPhaseByMonth(month3Records, { monthEdgeDays: 5 });
      const marRow = rows.find((r) => r.yearMonth === '2025-03')!;

      const directStats = calculateConditionStats(month3Records, 'monthPhase', {
        monthEdgeDays: 5,
      });

      expect(marRow.stats.map((s) => s.avgDiffCoins)).toEqual(
        directStats.map((s) => s.avgDiffCoins)
      );
      expect(marRow.stats.map((s) => s.payoutRate)).toEqual(
        directStats.map((s) => s.payoutRate)
      );
      expect(marRow.stats.map((s) => s.highPayoutRate)).toEqual(
        directStats.map((s) => s.highPayoutRate)
      );
    });

    it('4. 期間切替（直近12か月 vs 全期間）の動作確認', () => {
      // 15か月分の合成データ
      const fifteenMonthRecords: DailyRecord[] = [];
      for (let m = 1; m <= 15; m++) {
        const year = 2024 + Math.floor((m - 1) / 12);
        const month = ((m - 1) % 12) + 1;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-10`;
        fifteenMonthRecords.push(createSimpleRecord(dateStr, 10, 5000, 1000, 5));
      }

      // 既定 (recent12): 直近12か月
      const recentRows = calculateMonthPhaseByMonth(fifteenMonthRecords);
      expect(recentRows).toHaveLength(12);

      // 全期間 (all): 15か月すべて
      const allRows = calculateMonthPhaseByMonth(fifteenMonthRecords, { periodMode: 'all' });
      expect(allRows).toHaveLength(15);
    });

    it('5. isRecordInMonthPhase が境界値を正確に判定すること', () => {
      // 4月 (30日間) N=5
      const recApril1 = { date: '2025-04-01' };
      const recApril5 = { date: '2025-04-05' };
      const recApril6 = { date: '2025-04-06' };
      const recApril25 = { date: '2025-04-25' };
      const recApril26 = { date: '2025-04-26' };
      const recApril30 = { date: '2025-04-30' };

      expect(isRecordInMonthPhase(recApril1, 'monthStart', 5)).toBe(true);
      expect(isRecordInMonthPhase(recApril5, 'monthStart', 5)).toBe(true);
      expect(isRecordInMonthPhase(recApril6, 'monthStart', 5)).toBe(false);

      expect(isRecordInMonthPhase(recApril25, 'monthEnd', 5)).toBe(false);
      expect(isRecordInMonthPhase(recApril26, 'monthEnd', 5)).toBe(true);
      expect(isRecordInMonthPhase(recApril30, 'monthEnd', 5)).toBe(true);
    });
  });
});

