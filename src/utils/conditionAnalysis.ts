import { DailyRecord, StoreProfile, SpecialDayRules } from '../data/types';
import { isJapaneseHoliday } from './holidayUtils';
import { isDateSpecialDay } from './dataEngine';
import { StoreCommonPeriod } from './storeComparison';

export type ConditionDimension = 'dow' | 'tail' | 'special' | 'machineTail' | 'monthPhase';
export type ConditionMetric = 'avgDiff' | 'payoutRate' | 'highPayoutRate';
export type ConditionViewMode = 'heatmap' | 'table' | 'chart';

export interface ConditionColumnDef {
  key: string;
  label: string;
  shortLabel: string;
  sampleDays?: string;
  group?: 'edge' | 'decade';
}

export const DOW_COLUMNS: readonly ConditionColumnDef[] = [
  { key: '月', label: '月曜日', shortLabel: '月' },
  { key: '火', label: '火曜日', shortLabel: '火' },
  { key: '水', label: '水曜日', shortLabel: '水' },
  { key: '木', label: '木曜日', shortLabel: '木' },
  { key: '金', label: '金曜日', shortLabel: '金' },
  { key: '土', label: '土曜日', shortLabel: '土' },
  { key: '日', label: '日曜日', shortLabel: '日' },
  { key: '祝', label: '祝日 (祝祭日・振替休日)', shortLabel: '祝' },
] as const;

export const TAIL_COLUMNS: readonly ConditionColumnDef[] = [
  { key: '1', label: '1のつく日', shortLabel: '1日', sampleDays: '1日, 11日, 21日, 31日' },
  { key: '2', label: '2のつく日', shortLabel: '2日', sampleDays: '2日, 12日, 22日' },
  { key: '3', label: '3のつく日', shortLabel: '3日', sampleDays: '3日, 13日, 23日' },
  { key: '4', label: '4のつく日', shortLabel: '4日', sampleDays: '4日, 14日, 24日' },
  { key: '5', label: '5のつく日', shortLabel: '5日', sampleDays: '5日, 15日, 25日' },
  { key: '6', label: '6のつく日', shortLabel: '6日', sampleDays: '6日, 16日, 26日' },
  { key: '7', label: '7のつく日', shortLabel: '7日', sampleDays: '7日, 17日, 27日' },
  { key: '8', label: '8のつく日', shortLabel: '8日', sampleDays: '8日, 18日, 28日' },
  { key: '9', label: '9のつく日', shortLabel: '9日', sampleDays: '9日, 19日, 29日' },
  { key: '0', label: '0のつく日', shortLabel: '0日', sampleDays: '10日, 20日, 30日' },
  { key: 'ゾロ目', label: 'ゾロ目の日', shortLabel: 'ゾロ目', sampleDays: '11日, 22日, 月日ゾロ目' },
] as const;

export const SPECIAL_COLUMNS: readonly ConditionColumnDef[] = [
  { key: 'special', label: '特日 (旧イベント日)', shortLabel: '特日' },
  { key: 'normal', label: '通常営業日', shortLabel: '通常' },
  { key: 'before', label: '特日前日', shortLabel: '前日' },
  { key: 'after', label: '特日翌日', shortLabel: '翌日' },
] as const;

export const MACHINE_TAIL_COLUMNS: readonly ConditionColumnDef[] = [
  { key: '0', label: '末尾0', shortLabel: '末0' },
  { key: '1', label: '末尾1', shortLabel: '末1' },
  { key: '2', label: '末尾2', shortLabel: '末2' },
  { key: '3', label: '末尾3', shortLabel: '末3' },
  { key: '4', label: '末尾4', shortLabel: '末4' },
  { key: '5', label: '末尾5', shortLabel: '末5' },
  { key: '6', label: '末尾6', shortLabel: '末6' },
  { key: '7', label: '末尾7', shortLabel: '末7' },
  { key: '8', label: '末尾8', shortLabel: '末8' },
  { key: '9', label: '末尾9', shortLabel: '末9' },
  { key: 'zoro', label: '末尾ゾロ目', shortLabel: 'ゾロ目' },
] as const;

export const DEFAULT_MONTH_EDGE_DAYS = 5;

export function clampMonthEdgeDays(days?: number): number {
  if (days === undefined || days === null || isNaN(days)) {
    return DEFAULT_MONTH_EDGE_DAYS;
  }
  return Math.max(1, Math.min(10, Math.round(days)));
}

export function getMonthPhaseColumns(
  monthEdgeDays: number = DEFAULT_MONTH_EDGE_DAYS
): readonly ConditionColumnDef[] {
  const n = clampMonthEdgeDays(monthEdgeDays);
  return [
    {
      key: 'monthStart',
      label: `月初（1〜${n}日）`,
      shortLabel: '月初',
      sampleDays: `1〜${n}日`,
      group: 'edge',
    },
    {
      key: 'monthEnd',
      label: `月末（月末${n}日間）`,
      shortLabel: '月末',
      sampleDays: `月末${n}日間`,
      group: 'edge',
    },
    {
      key: 'early',
      label: '上旬（1〜10日）',
      shortLabel: '上旬',
      sampleDays: '1〜10日',
      group: 'decade',
    },
    {
      key: 'mid',
      label: '中旬（11〜20日）',
      shortLabel: '中旬',
      sampleDays: '11〜20日',
      group: 'decade',
    },
    {
      key: 'late',
      label: '下旬（21日〜月末）',
      shortLabel: '下旬',
      sampleDays: '21日〜月末',
      group: 'decade',
    },
  ] as const;
}

export interface GetConditionColumnsOptions {
  monthEdgeDays?: number;
}

export function getConditionColumns(
  dimension: ConditionDimension,
  options?: GetConditionColumnsOptions
): readonly ConditionColumnDef[] {
  switch (dimension) {
    case 'dow':
      return DOW_COLUMNS;
    case 'tail':
      return TAIL_COLUMNS;
    case 'special':
      return SPECIAL_COLUMNS;
    case 'machineTail':
      return MACHINE_TAIL_COLUMNS;
    case 'monthPhase':
      return getMonthPhaseColumns(options?.monthEdgeDays);
    default:
      return DOW_COLUMNS;
  }
}

export const MONTH_PHASE_DEFINITION_TEXT =
  '月内の時期（上旬1〜10日・中旬11〜20日・下旬21日〜月末）および月初（1〜N日）・月末（暦の末日からN日間）の出玉傾向を分析します。\n月初・月末は上旬・下旬と日が重なり、月末は各月の暦の日数（平年28日、閏年29日、30日、31日）に基づいて判定されます。';

export function getRecordYearMonthDay(r: {
  date: string;
  year?: number;
  month?: number;
  day?: number;
}): { year: number; month: number; day: number; daysInMonth: number } {
  let year = r.year;
  let month = r.month;
  let day = r.day;

  if (!year || !month || !day) {
    const parts = (r.date || '').split(/[-/.]/);
    if (parts.length >= 3) {
      if (!year) year = parseInt(parts[0], 10);
      if (!month) month = parseInt(parts[1], 10);
      if (!day) day = parseInt(parts[2], 10);
    }
  }

  const y = year || 2025;
  const m = month || 1;
  const d = day || 1;
  const daysInMonth = new Date(y, m, 0).getDate();

  return { year: y, month: m, day: d, daysInMonth };
}

export function isRecordInMonthPhase(
  r: { date: string; year?: number; month?: number; day?: number },
  phaseKey: string,
  monthEdgeDays: number = DEFAULT_MONTH_EDGE_DAYS
): boolean {
  const { day, daysInMonth } = getRecordYearMonthDay(r);
  const nEdge = clampMonthEdgeDays(monthEdgeDays);
  switch (phaseKey) {
    case 'monthStart':
      return day >= 1 && day <= nEdge;
    case 'monthEnd':
      return day >= daysInMonth - nEdge + 1 && day <= daysInMonth;
    case 'early':
      return day >= 1 && day <= 10;
    case 'mid':
      return day >= 11 && day <= 20;
    case 'late':
      return day >= 21 && day <= daysInMonth;
    default:
      return false;
  }
}

export const SPECIAL_DEFINITION_TEXT =
  '特定日（旧イベント日・〇のつく日）と通常営業日、および特日の前日・翌日の出玉・高出率台投入傾向を比較分析します。';

export const MACHINE_TAIL_DEFINITION_TEXT =
  '台番号の1桁目（0〜9番台およびゾロ目番台）ごとの全台出玉・稼働・勝率集計です。当たりの入りやすい特定末尾の特定に役立ちます。';

export const DIGIT_DAY_DEFINITION_TEXT =
  '「Nのつく日」は、日付の一の位が N の日とする（N=1〜9、0）。例: 1のつく日＝1・11・21・31日、0のつく日＝10・20・30日。ゾロ目は日の十の位と一の位が同じ日（11・22日）。共通期間のみ集計。';

export const DIGIT_DAY_EXPLANATION =
  '「Nのつく日」は、日付の一の位が N の日とする（N=1〜9、0）。例: 1のつく日＝1・11・21・31日、0のつく日＝10・20・30日。ゾロ目は日の十の位と一の位が同じ日（11・22日）。';


export const DOW_EXPLANATION =
  '月曜日から日曜日まで、および祝日（祝祭日・振替休日）ごとの出玉傾向・ホール粗利（G数連動）・稼働状況を比較分析します。';

export const FEW_DAYS_THRESHOLD = 3;
export const FEW_DAYS_LABEL = '日数少';

export function isFewDays(daysCount: number): boolean {
  return daysCount > 0 && daysCount < FEW_DAYS_THRESHOLD;
}

export function getFewDaysClass(daysCount: number): string {
  return isFewDays(daysCount) ? 'opacity-65' : '';
}

/**
 * Shared color classification for ConditionAnalysis cells
 */
export function getConditionHeatmapColor(
  metric: ConditionMetric,
  value: number,
  daysCount = 3,
  perspective: 'hall' | 'player' = 'player'
): { bgClass: string; isFewDays: boolean } {
  const few = isFewDays(daysCount);
  if (daysCount === 0) {
    return { bgClass: 'bg-slate-50/50 text-slate-400', isFewDays: false };
  }

  // Adjust diff value based on perspective if hall
  const effectiveVal = metric === 'avgDiff' && perspective === 'hall' ? -value : value;

  let bgClass = 'bg-slate-50 text-slate-600';

  if (metric === 'avgDiff') {
    if (effectiveVal >= 300) {
      bgClass = 'bg-blue-600 text-white font-bold';
    } else if (effectiveVal >= 100) {
      bgClass = 'bg-blue-100 text-blue-900 font-bold';
    } else if (effectiveVal <= -300) {
      bgClass = 'bg-rose-600 text-white font-bold';
    } else if (effectiveVal <= -100) {
      bgClass = 'bg-rose-100 text-rose-900 font-bold';
    }
  } else if (metric === 'payoutRate') {
    if (effectiveVal >= 102.0) {
      bgClass = 'bg-blue-600 text-white font-bold';
    } else if (effectiveVal >= 100.5) {
      bgClass = 'bg-blue-100 text-blue-900 font-bold';
    } else if (effectiveVal <= 98.0) {
      bgClass = 'bg-rose-600 text-white font-bold';
    } else if (effectiveVal <= 99.5) {
      bgClass = 'bg-rose-100 text-rose-900 font-bold';
    }
  } else if (metric === 'highPayoutRate') {
    if (effectiveVal >= 60.0) {
      bgClass = 'bg-blue-600 text-white font-bold';
    } else if (effectiveVal >= 52.0) {
      bgClass = 'bg-blue-100 text-blue-900 font-bold';
    } else if (effectiveVal <= 40.0) {
      bgClass = 'bg-rose-600 text-white font-bold';
    } else if (effectiveVal <= 45.0) {
      bgClass = 'bg-rose-100 text-rose-900 font-bold';
    }
  }

  return { bgClass, isFewDays: few };
}

export function getDiffHeatmapColor(diff: number, daysCount = 3) {
  return getConditionHeatmapColor('avgDiff', diff, daysCount, 'player');
}

export function isStoreEventDow(
  dow: string,
  oldEventDays = '',
  specialDayRules?: SpecialDayRules
): boolean {
  if (dow === '祝') {
    return Boolean(oldEventDays && (oldEventDays.includes('祝日') || oldEventDays.includes('祝')));
  }
  if (specialDayRules?.daysOfWeek && Array.isArray(specialDayRules.daysOfWeek)) {
    if (specialDayRules.daysOfWeek.includes(dow)) return true;
  }
  if (oldEventDays) {
    if (oldEventDays.includes(`${dow}曜日`) || oldEventDays.includes(`${dow}曜`)) {
      return true;
    }
  }
  return false;
}

export function isStoreEventTail(
  tail: number | string,
  oldEventDays = '',
  specialDayRules?: SpecialDayRules
): boolean {
  if (tail === 'zoro' || tail === 'ゾロ目') {
    if (specialDayRules?.doubleDigits || specialDayRules?.monthDayZoro) return true;
    if (oldEventDays && (oldEventDays.includes('ゾロ目') || oldEventDays.includes('ゾロ'))) {
      return true;
    }
    return false;
  }
  const numTail = typeof tail === 'string' ? parseInt(tail, 10) : tail;
  if (!isNaN(numTail)) {
    if (specialDayRules?.tails && Array.isArray(specialDayRules.tails)) {
      if (specialDayRules.tails.includes(numTail)) return true;
    }
    if (oldEventDays) {
      if (oldEventDays.includes(`${numTail}のつく日`) || oldEventDays.includes(`${numTail}の付く日`)) {
        return true;
      }
      if (numTail === 7 && oldEventDays.includes('7')) return true;
      if (numTail === 0 && (oldEventDays.includes('0') || oldEventDays.includes('10'))) return true;
      if (numTail === 3 && oldEventDays.includes('3')) return true;
      if (numTail === 5 && oldEventDays.includes('5')) return true;
      if (numTail === 6 && oldEventDays.includes('6')) return true;
      if (numTail === 8 && oldEventDays.includes('8')) return true;
      if (numTail === 9 && oldEventDays.includes('9')) return true;
      if (numTail === 1 && oldEventDays.includes('1')) return true;
    }
  }
  return false;
}

export interface ConditionBucketStat {
  key: string;
  label: string;
  shortLabel: string;
  sampleDays?: string;
  group?: 'edge' | 'decade';
  count: number;
  isWeekend: boolean;
  isHoliday: boolean;
  isStoreEvent: boolean;

  // Primary metrics
  avgDiffCoins: number;
  payoutRate: number;
  highPayoutRate: number;
  avgGames: number;

  totalDiffCoins: number;
  totalMachines: number;
  totalHallProfit: number;
  dailyHallProfit: number;
  totalPlayerProfit: number;
  dailyPlayerProfit: number;
  perMachineDailyProfit: number;
  perMachineDailyPlayerProfit: number;

  playerWinDays: number;
  playerWinRate: number;

  displayDiffCoins: number;
  displayTotalCoins: number;
  displayDailyProfit: number;
  displayTotalProfit: number;
  displayPerMachineDailyProfit: number;
  displayPerMachineTotalProfit: number;

  rankPlayer?: number;
  rankHall?: number;

  records: DailyRecord[];
}

export interface CalculateConditionStatsOptions {
  perspective?: 'hall' | 'player';
  oldEventDays?: string;
  specialDayRules?: SpecialDayRules;
  totalMachinesApprox?: number;
  includeMonthDayZoro?: boolean;
  monthEdgeDays?: number;
}

export function calculateConditionStats(
  dailyRecords: DailyRecord[],
  dimension: ConditionDimension,
  options: CalculateConditionStatsOptions = {}
): ConditionBucketStat[] {
  const {
    perspective = 'player',
    oldEventDays = '',
    specialDayRules,
    totalMachinesApprox = 587,
    includeMonthDayZoro = true,
    monthEdgeDays,
  } = options;

  const columns = getConditionColumns(dimension, { monthEdgeDays });
  const nEdge = clampMonthEdgeDays(monthEdgeDays);

  if (!dailyRecords || dailyRecords.length === 0) {
    return columns.map((col) => ({
      key: col.key,
      label: col.label,
      shortLabel: col.shortLabel,
      sampleDays: col.sampleDays,
      group: col.group,
      count: 0,
      isWeekend: col.key === '土' || col.key === '日',
      isHoliday: col.key === '祝',
      isStoreEvent: false,
      avgDiffCoins: 0,
      payoutRate: 100,
      highPayoutRate: 0,
      avgGames: 0,
      totalDiffCoins: 0,
      totalMachines: 0,
      totalHallProfit: 0,
      dailyHallProfit: 0,
      totalPlayerProfit: 0,
      dailyPlayerProfit: 0,
      perMachineDailyProfit: 0,
      perMachineDailyPlayerProfit: 0,
      playerWinDays: 0,
      playerWinRate: 0,
      displayDiffCoins: 0,
      displayTotalCoins: 0,
      displayDailyProfit: 0,
      displayTotalProfit: 0,
      displayPerMachineDailyProfit: 0,
      displayPerMachineTotalProfit: 0,
      records: [],
    }));
  }

  // Pre-index records by date for special day before/after lookups
  const recordMap = new Map<string, DailyRecord>();
  if (dimension === 'special') {
    dailyRecords.forEach((r) => recordMap.set(r.date, r));
  }

  const isSpecialRecord = (r: DailyRecord) => {
    if (r.isOldEventDay) return true;
    if (isDateSpecialDay(r.date, specialDayRules)) return true;
    if (isStoreEventDow(r.dayOfWeek, oldEventDays, specialDayRules)) return true;
    const day = r.day ?? parseInt(r.date.split('-')[2] || '0', 10);
    if (isStoreEventTail(day % 10, oldEventDays, specialDayRules)) return true;
    return false;
  };

  return columns.map((col) => {
    let records: DailyRecord[] = [];
    let isWeekend = false;
    let isHoliday = false;
    let isStoreEvent = false;

    if (dimension === 'dow') {
      const dow = col.key;
      isHoliday = dow === '祝';
      isWeekend = dow === '土' || dow === '日';
      isStoreEvent = isStoreEventDow(dow, oldEventDays, specialDayRules);
      records = isHoliday
        ? dailyRecords.filter((r) => isJapaneseHoliday(r.date))
        : dailyRecords.filter((r) => r.dayOfWeek === dow);
    } else if (dimension === 'tail') {
      const key = col.key;
      const isZoro = key === 'ゾロ目' || key === 'zoro';
      isStoreEvent = isStoreEventTail(key, oldEventDays, specialDayRules);
      if (isZoro) {
        records = dailyRecords.filter((r) => {
          const day = r.day ?? parseInt(r.date.split('-')[2] || '0', 10);
          const isDouble = day >= 10 && Math.floor(day / 10) === day % 10;
          if (isDouble) return true;
          if (includeMonthDayZoro && r.month && r.day && r.month === r.day) return true;
          return false;
        });
      } else {
        const digit = parseInt(key, 10);
        records = dailyRecords.filter((r) => {
          const day = r.day ?? parseInt(r.date.split('-')[2] || '0', 10);
          return day % 10 === digit;
        });
      }
    } else if (dimension === 'special') {
      isStoreEvent = col.key === 'special';
      if (col.key === 'special') {
        records = dailyRecords.filter((r) => isSpecialRecord(r));
      } else if (col.key === 'normal') {
        records = dailyRecords.filter((r) => !isSpecialRecord(r));
      } else if (col.key === 'before') {
        records = dailyRecords.filter((r) => {
          if (isSpecialRecord(r)) return false;
          const parts = r.date.split(/[-/.]/);
          if (parts.length !== 3) return false;
          const nextDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + 1);
          const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
          const nextRec = recordMap.get(nextStr);
          return Boolean(nextRec && isSpecialRecord(nextRec));
        });
      } else if (col.key === 'after') {
        records = dailyRecords.filter((r) => {
          if (isSpecialRecord(r)) return false;
          const parts = r.date.split(/[-/.]/);
          if (parts.length !== 3) return false;
          const prevDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) - 1);
          const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
          const prevRec = recordMap.get(prevStr);
          return Boolean(prevRec && isSpecialRecord(prevRec));
        });
      }
    } else if (dimension === 'machineTail') {
      const key = col.key;
      const isZoroCol = key === 'zoro' || key === 'ゾロ目';
      const targetDigit = isZoroCol ? null : parseInt(key, 10);
      isStoreEvent = isStoreEventTail(key, oldEventDays, specialDayRules);

      const tailRecordsList: DailyRecord[] = [];

      dailyRecords.forEach((r) => {
        if (r.tails && r.tails.length > 0) {
          const matchingTail = r.tails.find((t) => {
            if (isZoroCol) {
              return t.tailNum === null || t.tailName.includes('ゾロ');
            }
            return (
              t.tailNum === targetDigit ||
              t.tailName === `末尾${targetDigit}` ||
              t.tailName.endsWith(String(targetDigit))
            );
          });

          if (matchingTail) {
            const count = matchingTail.totalMachines > 0 ? matchingTail.totalMachines : 1;
            const diffCoins = matchingTail.totalDiffCoins;
            const avgDiff = matchingTail.avgDiffCoins;
            const avgG = matchingTail.avgGames;
            const inCoins = avgG * 3 * count;
            const outCoins = inCoins + diffCoins;
            const payoutRate = inCoins > 0 ? Math.round((outCoins / inCoins) * 10000) / 100 : 100;

            tailRecordsList.push({
              ...r,
              avgDiffCoins: avgDiff,
              totalDiffCoins: diffCoins,
              avgGames: avgG,
              winMachines: matchingTail.winMachines,
              totalMachines: count,
              winRate: matchingTail.winRate,
              payoutRate,
              gModelHallProfit: -diffCoins * 20,
              gModelPlayerProfit: diffCoins * 20,
            });
          }
        } else if (r.machines && r.machines.length > 0) {
          const matchingMachines = r.machines.filter((m) => {
            if (isZoroCol) {
              return m.isZoro || (m.machineNum >= 11 && m.machineNum % 11 === 0);
            }
            return (
              m.tailDigit === targetDigit ||
              m.machineNum % 10 === targetDigit
            );
          });

          if (matchingMachines.length > 0) {
            const count = matchingMachines.length;
            const totalDiff = matchingMachines.reduce((sum, m) => sum + (m.diff || 0), 0);
            const totalGames = matchingMachines.reduce((sum, m) => sum + (m.games || 0), 0);
            const winMachs = matchingMachines.filter((m) => (m.diff || 0) > 0).length;
            const avgDiff = Math.round((totalDiff / count) * 10) / 10;
            const avgG = Math.round(totalGames / count);
            const inCoins = totalGames * 3;
            const outCoins = inCoins + totalDiff;
            const payoutRate = inCoins > 0 ? Math.round((outCoins / inCoins) * 10000) / 100 : 100;

            tailRecordsList.push({
              ...r,
              avgDiffCoins: avgDiff,
              totalDiffCoins: totalDiff,
              avgGames: avgG,
              winMachines: winMachs,
              totalMachines: count,
              winRate: Math.round((winMachs / count) * 1000) / 10,
              payoutRate,
              gModelHallProfit: -totalDiff * 20,
              gModelPlayerProfit: totalDiff * 20,
            });
          }
        }
      });

      records = tailRecordsList;
    } else if (dimension === 'monthPhase') {
      isWeekend = false;
      isHoliday = false;
      isStoreEvent = false;

      records = dailyRecords.filter((r) => isRecordInMonthPhase(r, col.key, nEdge));
    }

    const count = records.length;

    if (count === 0) {
      return {
        key: col.key,
        label: col.label,
        shortLabel: col.shortLabel,
        sampleDays: col.sampleDays,
        group: col.group,
        count: 0,
        isWeekend,
        isHoliday,
        isStoreEvent,
        avgDiffCoins: 0,
        payoutRate: 100,
        highPayoutRate: 0,
        avgGames: 0,
        totalDiffCoins: 0,
        totalMachines: 0,
        totalHallProfit: 0,
        dailyHallProfit: 0,
        totalPlayerProfit: 0,
        dailyPlayerProfit: 0,
        perMachineDailyProfit: 0,
        perMachineDailyPlayerProfit: 0,
        playerWinDays: 0,
        playerWinRate: 0,
        displayDiffCoins: 0,
        displayTotalCoins: 0,
        displayDailyProfit: 0,
        displayTotalProfit: 0,
        displayPerMachineDailyProfit: 0,
        displayPerMachineTotalProfit: 0,
        records: [],
      };
    }

    const totalHallProfit = records.reduce((acc, r) => acc + (r.gModelHallProfit || 0), 0);
    const dailyHallProfit = Math.round(totalHallProfit / count);

    const totalPlayerProfit = records.reduce((acc, r) => acc + (r.gModelPlayerProfit || 0), 0);
    const dailyPlayerProfit = Math.round(totalPlayerProfit / count);

    const rawTotalDiffCoins = records.reduce((acc, r) => acc + (r.totalDiffCoins || 0), 0);
    const totalMachineDays = records.reduce(
      (acc, r) => acc + (r.totalMachines > 0 ? r.totalMachines : totalMachinesApprox),
      0
    );
    const totalDiffCoins =
      rawTotalDiffCoins !== 0
        ? rawTotalDiffCoins
        : Math.round(
            records.reduce(
              (acc, r) =>
                acc +
                (r.avgDiffCoins || 0) * (r.totalMachines > 0 ? r.totalMachines : totalMachinesApprox),
              0
            )
          );
    const avgDiffCoins =
      Math.round((records.reduce((acc, r) => acc + r.avgDiffCoins, 0) / count) * 10) / 10;
    const avgGames = Math.round(records.reduce((acc, r) => acc + r.avgGames, 0) / count);

    const avgPayoutRate = records.reduce((acc, r) => acc + (r.payoutRate || 100), 0) / count;
    const payoutRate = Math.round(avgPayoutRate * 100) / 100;

    const playerWinDays = records.filter((r) => r.avgDiffCoins > 0).length;
    const playerWinRate = Math.round((playerWinDays / count) * 1000) / 10;

    // High payout rate (machine win rate if machines exist, otherwise player win days rate)
    let totalMachsSum = 0;
    let winMachsSum = 0;
    let hasMachineWins = false;

    records.forEach((r) => {
      if (r.winMachines !== undefined && r.totalMachines !== undefined && r.totalMachines > 0) {
        totalMachsSum += r.totalMachines;
        winMachsSum += r.winMachines;
        hasMachineWins = true;
      } else if (r.winRate !== undefined && r.totalMachines !== undefined && r.totalMachines > 0) {
        totalMachsSum += r.totalMachines;
        winMachsSum += Math.round(r.totalMachines * (r.winRate / 100));
        hasMachineWins = true;
      }
    });

    const highPayoutRate =
      hasMachineWins && totalMachsSum > 0
        ? Math.round((winMachsSum / totalMachsSum) * 1000) / 10
        : playerWinRate;

    const avgMachines = count > 0 ? Math.round(totalMachineDays / count) : 0;
    const perMachineDailyProfit = avgMachines > 0 ? Math.round(dailyHallProfit / avgMachines) : 0;
    const perMachineDailyPlayerProfit =
      avgMachines > 0 ? Math.round(dailyPlayerProfit / avgMachines) : 0;

    const displayDiffCoins =
      perspective === 'hall' ? Math.round(-avgDiffCoins * 10) / 10 : avgDiffCoins;
    const displayTotalCoins = perspective === 'hall' ? -totalDiffCoins : totalDiffCoins;
    const displayDailyProfit = perspective === 'hall' ? dailyHallProfit : dailyPlayerProfit;
    const displayTotalProfit = perspective === 'hall' ? totalHallProfit : totalPlayerProfit;
    const displayPerMachineDailyProfit =
      perspective === 'hall' ? perMachineDailyProfit : perMachineDailyPlayerProfit;
    const displayPerMachineTotalProfit = displayPerMachineDailyProfit * count;

    return {
      key: col.key,
      label: col.label,
      shortLabel: col.shortLabel,
      sampleDays: col.sampleDays,
      group: col.group,
      count,
      isWeekend,
      isHoliday,
      isStoreEvent,
      avgDiffCoins,
      payoutRate,
      highPayoutRate,
      avgGames,
      totalDiffCoins,
      totalMachines: totalMachineDays,
      totalHallProfit,
      dailyHallProfit,
      totalPlayerProfit,
      dailyPlayerProfit,
      perMachineDailyProfit,
      perMachineDailyPlayerProfit,
      playerWinDays,
      playerWinRate,
      displayDiffCoins,
      displayTotalCoins,
      displayDailyProfit,
      displayTotalProfit,
      displayPerMachineDailyProfit,
      displayPerMachineTotalProfit,
      records: records.sort((a, b) => b.date.localeCompare(a.date)),
    };
  });
}

export const ALL_STORES_TOTAL_STORE_ID = '__all_stores_total__';
export const ALL_STORES_TOTAL_NAME = '全店合計';

export interface StoreConditionRow {
  storeId: string;
  storeName: string;
  isTotal?: boolean;
  totalDays?: number;
  stats: ConditionBucketStat[];
}

/**
 * Calculates weighted aggregate condition stats for "全店合計" across multiple stores.
 * - 台あたり差枚 = 全台の差枚の合計 ÷ 全台の台日数
 * - 出率 = IN加重 (Total OUT ÷ Total IN * 100)
 * - 高出率台の率 = 高出率台数の合計 ÷ 総台数の合計 * 100
 */
export function calculateAllStoresTotalConditionStats(
  storeRows: StoreConditionRow[],
  dimension: ConditionDimension,
  options: {
    perspective?: 'hall' | 'player';
    monthEdgeDays?: number;
  } = {}
): ConditionBucketStat[] {
  const { perspective = 'player', monthEdgeDays } = options;
  const columns = getConditionColumns(dimension, { monthEdgeDays });

  return columns.map((col) => {
    let totalInCoins = 0;
    let totalOutCoins = 0;
    let totalDiffCoins = 0;
    let totalMachineDays = 0;
    let totalGamesMachine = 0;
    let totalWinMachines = 0;
    let totalMachinesForWin = 0;
    let totalHallProfit = 0;
    let totalPlayerProfit = 0;
    const uniqueDates = new Set<string>();
    const allRecords: DailyRecord[] = [];
    let isStoreEvent = false;

    storeRows.forEach((row) => {
      if (row.isTotal) return;

      const stat = row.stats.find((s) => s.key === col.key);
      if (!stat || stat.count === 0) return;

      if (stat.isStoreEvent) {
        isStoreEvent = true;
      }

      stat.records.forEach((r) => {
        const machs = r.totalMachines > 0 ? r.totalMachines : 500;
        const diff =
          r.totalDiffCoins !== undefined && r.totalDiffCoins !== 0
            ? r.totalDiffCoins
            : Math.round((r.avgDiffCoins || 0) * machs);
        const games = r.avgGames || 0;
        const inCoins =
          r.inCoins !== undefined && r.inCoins > 0 ? r.inCoins : games * 3 * machs;
        const outCoins =
          r.outCoins !== undefined && r.outCoins > 0 ? r.outCoins : inCoins + diff;

        totalInCoins += inCoins;
        totalOutCoins += outCoins;
        totalDiffCoins += diff;
        totalMachineDays += machs;
        totalGamesMachine += games * machs;

        if (r.winMachines !== undefined && machs > 0) {
          totalWinMachines += r.winMachines;
          totalMachinesForWin += machs;
        } else if (r.winRate !== undefined && machs > 0) {
          totalWinMachines += Math.round(machs * (r.winRate / 100));
          totalMachinesForWin += machs;
        } else if (r.avgDiffCoins > 0) {
          totalWinMachines += machs;
          totalMachinesForWin += machs;
        }

        totalHallProfit +=
          r.gModelHallProfit !== undefined ? r.gModelHallProfit : -diff * 20;
        totalPlayerProfit +=
          r.gModelPlayerProfit !== undefined ? r.gModelPlayerProfit : diff * 20;
        uniqueDates.add(r.date);
        allRecords.push(r);
      });
    });

    const count = uniqueDates.size;
    const isWeekend = col.key === '土' || col.key === '日';
    const isHoliday = col.key === '祝';

    if (count === 0 || totalMachineDays === 0) {
      return {
        key: col.key,
        label: col.label,
        shortLabel: col.shortLabel,
        sampleDays: col.sampleDays,
        count: 0,
        isWeekend,
        isHoliday,
        isStoreEvent,
        avgDiffCoins: 0,
        payoutRate: 100,
        highPayoutRate: 0,
        avgGames: 0,
        totalDiffCoins: 0,
        totalMachines: 0,
        totalHallProfit: 0,
        dailyHallProfit: 0,
        totalPlayerProfit: 0,
        dailyPlayerProfit: 0,
        perMachineDailyProfit: 0,
        perMachineDailyPlayerProfit: 0,
        playerWinDays: 0,
        playerWinRate: 0,
        displayDiffCoins: 0,
        displayTotalCoins: 0,
        displayDailyProfit: 0,
        displayTotalProfit: 0,
        displayPerMachineDailyProfit: 0,
        displayPerMachineTotalProfit: 0,
        records: [],
      };
    }

    const avgDiffCoins = Math.round((totalDiffCoins / totalMachineDays) * 10) / 10;
    const payoutRate =
      totalInCoins > 0 ? Math.round((totalOutCoins / totalInCoins) * 10000) / 100 : 100;
    const highPayoutRate =
      totalMachinesForWin > 0
        ? Math.round((totalWinMachines / totalMachinesForWin) * 1000) / 10
        : 0;
    const avgGames = Math.round(totalGamesMachine / totalMachineDays);

    const dailyHallProfit = Math.round(totalHallProfit / count);
    const dailyPlayerProfit = Math.round(totalPlayerProfit / count);
    const avgMachines = Math.round(totalMachineDays / count);
    const perMachineDailyProfit = avgMachines > 0 ? Math.round(dailyHallProfit / avgMachines) : 0;
    const perMachineDailyPlayerProfit =
      avgMachines > 0 ? Math.round(dailyPlayerProfit / avgMachines) : 0;

    const playerWinDays = Array.from(uniqueDates).filter((date) => {
      const dateRecords = allRecords.filter((r) => r.date === date);
      const dayDiff = dateRecords.reduce(
        (sum, r) =>
          sum + (r.totalDiffCoins || (r.avgDiffCoins || 0) * (r.totalMachines || 500)),
        0
      );
      return dayDiff > 0;
    }).length;
    const playerWinRate = Math.round((playerWinDays / count) * 1000) / 10;

    const displayDiffCoins =
      perspective === 'hall' ? Math.round(-avgDiffCoins * 10) / 10 : avgDiffCoins;
    const displayTotalCoins = perspective === 'hall' ? -totalDiffCoins : totalDiffCoins;
    const displayDailyProfit = perspective === 'hall' ? dailyHallProfit : dailyPlayerProfit;
    const displayTotalProfit = perspective === 'hall' ? totalHallProfit : totalPlayerProfit;
    const displayPerMachineDailyProfit =
      perspective === 'hall' ? perMachineDailyProfit : perMachineDailyPlayerProfit;
    const displayPerMachineTotalProfit = displayPerMachineDailyProfit * count;

    return {
      key: col.key,
      label: col.label,
      shortLabel: col.shortLabel,
      sampleDays: col.sampleDays,
      group: col.group,
      count,
      isWeekend,
      isHoliday,
      isStoreEvent,
      avgDiffCoins,
      payoutRate,
      highPayoutRate,
      avgGames,
      totalDiffCoins,
      totalMachines: totalMachineDays,
      totalHallProfit,
      dailyHallProfit,
      totalPlayerProfit,
      dailyPlayerProfit,
      perMachineDailyProfit,
      perMachineDailyPlayerProfit,
      playerWinDays,
      playerWinRate,
      displayDiffCoins,
      displayTotalCoins,
      displayDailyProfit,
      displayTotalProfit,
      displayPerMachineDailyProfit,
      displayPerMachineTotalProfit,
      records: allRecords.sort((a, b) => b.date.localeCompare(a.date)),
    };
  });
}

export function calculateMultiStoreConditions(
  stores: StoreProfile[],
  dimension: ConditionDimension,
  options: {
    period?: StoreCommonPeriod | null;
    perspective?: 'hall' | 'player';
    includeTotalRow?: boolean;
    monthEdgeDays?: number;
  } = {}
): StoreConditionRow[] {
  const { period, perspective = 'player', includeTotalRow = true, monthEdgeDays } = options;

  const rows: StoreConditionRow[] = stores.map((store) => {
    let records = store.dailyRecords || [];
    if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
      records = records.filter(
        (r) => r.date >= period.startDate && r.date <= period.endDate
      );
    }

    const totalDays = new Set(records.map((r) => r.date)).size;

    const stats = calculateConditionStats(records, dimension, {
      perspective,
      oldEventDays: store.oldEventDays,
      specialDayRules: store.specialDayRules,
      totalMachinesApprox: store.totalMachinesApprox || 500,
      includeMonthDayZoro: false, // In multi-store digit day mode, follow strict 11, 22 zorome standard
      monthEdgeDays,
    });

    return {
      storeId: store.id,
      storeName: store.name,
      totalDays,
      stats,
    };
  });

  if (includeTotalRow && stores.length > 1) {
    const totalStats = calculateAllStoresTotalConditionStats(rows, dimension, {
      perspective,
      monthEdgeDays,
    });
    const allStoreDates = new Set<string>();
    rows.forEach((r) => {
      r.stats.forEach((s) => s.records.forEach((rec) => allStoreDates.add(rec.date)));
    });

    rows.push({
      storeId: ALL_STORES_TOTAL_STORE_ID,
      storeName: ALL_STORES_TOTAL_NAME,
      isTotal: true,
      totalDays: allStoreDates.size,
      stats: totalStats,
    });
  }

  return rows;
}

export interface MonthPhaseByMonthRow {
  yearMonth: string; // e.g. "2025-01"
  year: number;
  month: number;
  displayMonth: string; // e.g. "2025年1月"
  label: string; // e.g. "2025年1月（一部）"
  isPartial: boolean;
  partialLabel?: string; // "一部" if isPartial, otherwise undefined
  daysCount: number;
  stats: ConditionBucketStat[];
}

export interface CalculateMonthPhaseByMonthOptions extends CalculateConditionStatsOptions {
  periodMode?: 'recent12' | 'all'; // 既定は 'recent12'
  maxMonths?: number; // 既定は 12 (recent12 の場合)
  period?: StoreCommonPeriod | null;
  stores?: StoreProfile[];
  selectedStoreId?: string;
  isAllStoresTotal?: boolean;
}

/**
 * Prompt 60-3: 年月 × 時期（月初・上旬・中旬・下旬・月末）の推移集計
 * 行: 年月（新しい順、既定は直近12か月、全期間切替可能）
 * 列: 60-1と同じ5区分 (monthStart, monthEnd, early, mid, late)
 * 各セル: calculateConditionStats と同一の純関数集計 (台あたり差枚、出率、高出率台の率)
 * 月の途中までしかデータがない月（取り込みの最初と最後の月など）は isPartial: true で「一部」を注記
 */
export function calculateMonthPhaseByMonth(
  dailyRecords: DailyRecord[] = [],
  options: CalculateMonthPhaseByMonthOptions = {}
): MonthPhaseByMonthRow[] {
  const {
    perspective = 'player',
    monthEdgeDays = DEFAULT_MONTH_EDGE_DAYS,
    periodMode = 'recent12',
    maxMonths = 12,
    period,
    stores,
    selectedStoreId = ALL_STORES_TOTAL_STORE_ID,
    isAllStoresTotal,
  } = options;

  const isMultiStoreMode = Boolean(
    stores && stores.length > 1 && (selectedStoreId === ALL_STORES_TOTAL_STORE_ID || isAllStoresTotal)
  );

  let recordsToUse = dailyRecords || [];
  let targetOldEventDays = options.oldEventDays;
  let targetSpecialDayRules = options.specialDayRules;
  let targetTotalMachines = options.totalMachinesApprox;

  if (stores && stores.length > 0 && selectedStoreId && selectedStoreId !== ALL_STORES_TOTAL_STORE_ID) {
    const store = stores.find((s) => s.id === selectedStoreId);
    if (store) {
      recordsToUse = store.dailyRecords || [];
      targetOldEventDays = store.oldEventDays || targetOldEventDays;
      targetSpecialDayRules = store.specialDayRules || targetSpecialDayRules;
      targetTotalMachines = store.totalMachinesApprox || targetTotalMachines;
    }
  }

  // Filter single store records by common period if specified
  if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
    if (!isMultiStoreMode) {
      recordsToUse = recordsToUse.filter(
        (r) => r.date >= period.startDate! && r.date <= period.endDate!
      );
    }
  }

  // Determine all available yearMonths
  const yearMonthSet = new Set<string>();
  if (isMultiStoreMode && stores) {
    stores.forEach((s) => {
      let recs = s.dailyRecords || [];
      if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
        recs = recs.filter((r) => r.date >= period.startDate! && r.date <= period.endDate!);
      }
      recs.forEach((r) => {
        const ym = r.yearMonth || r.date.slice(0, 7);
        if (ym) yearMonthSet.add(ym);
      });
    });
  } else {
    recordsToUse.forEach((r) => {
      const ym = r.yearMonth || r.date.slice(0, 7);
      if (ym) yearMonthSet.add(ym);
    });
  }

  if (yearMonthSet.size === 0) {
    return [];
  }

  // Sort descending: newest month first
  let sortedYms = Array.from(yearMonthSet).sort((a, b) => b.localeCompare(a));

  // Limit to maxMonths if recent12
  if (periodMode === 'recent12' && maxMonths > 0) {
    sortedYms = sortedYms.slice(0, maxMonths);
  }

  return sortedYms.map((ym) => {
    const [yStr, mStr] = ym.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const displayMonth = `${year}年${month}月`;

    if (isMultiStoreMode && stores) {
      // Build per-store condition rows for this month
      const monthStoreRows: StoreConditionRow[] = stores.map((store) => {
        let recs = (store.dailyRecords || []).filter(
          (r) => (r.yearMonth || r.date.slice(0, 7)) === ym
        );
        if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
          recs = recs.filter((r) => r.date >= period.startDate! && r.date <= period.endDate!);
        }

        const stats = calculateConditionStats(recs, 'monthPhase', {
          perspective,
          oldEventDays: store.oldEventDays,
          specialDayRules: store.specialDayRules,
          totalMachinesApprox: store.totalMachinesApprox || 500,
          includeMonthDayZoro: false,
          monthEdgeDays,
        });

        return {
          storeId: store.id,
          storeName: store.name,
          totalDays: new Set(recs.map((r) => r.date)).size,
          stats,
        };
      });

      const totalStats = calculateAllStoresTotalConditionStats(monthStoreRows, 'monthPhase', {
        perspective,
        monthEdgeDays,
      });

      // Days and partial detection across all stores for this month
      const allDatesInMonth = new Set<string>();
      stores.forEach((s) => {
        let recs = (s.dailyRecords || []).filter(
          (r) => (r.yearMonth || r.date.slice(0, 7)) === ym
        );
        if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
          recs = recs.filter((r) => r.date >= period.startDate! && r.date <= period.endDate!);
        }
        recs.forEach((r) => allDatesInMonth.add(r.date));
      });

      const daysInMonthList = Array.from(allDatesInMonth).map((d) =>
        parseInt(d.split(/[-/.]/)[2] || '0', 10)
      );
      const minDay = daysInMonthList.length > 0 ? Math.min(...daysInMonthList) : 1;
      const maxDay = daysInMonthList.length > 0 ? Math.max(...daysInMonthList) : daysInMonth;
      const isPartial = minDay > 1 || maxDay < daysInMonth;

      return {
        yearMonth: ym,
        year,
        month,
        displayMonth,
        label: `${displayMonth}${isPartial ? '（一部）' : ''}`,
        isPartial,
        partialLabel: isPartial ? '一部' : undefined,
        daysCount: allDatesInMonth.size,
        stats: totalStats,
      };
    }

    // Single store
    const monthRecords = recordsToUse.filter(
      (r) => (r.yearMonth || r.date.slice(0, 7)) === ym
    );

    const stats = calculateConditionStats(monthRecords, 'monthPhase', {
      ...options,
      perspective,
      oldEventDays: targetOldEventDays,
      specialDayRules: targetSpecialDayRules,
      totalMachinesApprox: targetTotalMachines,
      monthEdgeDays,
    });

    const days = monthRecords.map((r) => getRecordYearMonthDay(r).day);
    const minDay = days.length > 0 ? Math.min(...days) : 1;
    const maxDay = days.length > 0 ? Math.max(...days) : daysInMonth;
    const isPartial = minDay > 1 || maxDay < daysInMonth;
    const daysCount = new Set(monthRecords.map((r) => r.date)).size;

    return {
      yearMonth: ym,
      year,
      month,
      displayMonth,
      label: `${displayMonth}${isPartial ? '（一部）' : ''}`,
      isPartial,
      partialLabel: isPartial ? '一部' : undefined,
      daysCount,
      stats,
    };
  });
}


