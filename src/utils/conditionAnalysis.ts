import { DailyRecord, StoreProfile, SpecialDayRules } from '../data/types';
import { isJapaneseHoliday } from './holidayUtils';
import { isDateSpecialDay } from './dataEngine';
import { StoreCommonPeriod } from './storeComparison';

export type ConditionDimension = 'dow' | 'tail' | 'special' | 'machineTail';
export type ConditionMetric = 'avgDiff' | 'payoutRate' | 'highPayoutRate';
export type ConditionViewMode = 'heatmap' | 'table' | 'chart';

export interface ConditionColumnDef {
  key: string;
  label: string;
  shortLabel: string;
  sampleDays?: string;
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

export function getConditionColumns(dimension: ConditionDimension): readonly ConditionColumnDef[] {
  switch (dimension) {
    case 'dow':
      return DOW_COLUMNS;
    case 'tail':
      return TAIL_COLUMNS;
    case 'special':
      return SPECIAL_COLUMNS;
    case 'machineTail':
      return MACHINE_TAIL_COLUMNS;
    default:
      return DOW_COLUMNS;
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
  } = options;

  const columns = getConditionColumns(dimension);

  if (!dailyRecords || dailyRecords.length === 0) {
    return columns.map((col) => ({
      key: col.key,
      label: col.label,
      shortLabel: col.shortLabel,
      sampleDays: col.sampleDays,
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
    }

    const count = records.length;

    if (count === 0) {
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

export interface StoreConditionRow {
  storeId: string;
  storeName: string;
  stats: ConditionBucketStat[];
}

export function calculateMultiStoreConditions(
  stores: StoreProfile[],
  dimension: ConditionDimension,
  options: {
    period?: StoreCommonPeriod | null;
    perspective?: 'hall' | 'player';
  } = {}
): StoreConditionRow[] {
  const { period, perspective = 'player' } = options;

  return stores.map((store) => {
    let records = store.dailyRecords || [];
    if (period && period.startDate && period.endDate && period.hasCommonPeriod !== false) {
      records = records.filter(
        (r) => r.date >= period.startDate && r.date <= period.endDate
      );
    }

    const stats = calculateConditionStats(records, dimension, {
      perspective,
      oldEventDays: store.oldEventDays,
      specialDayRules: store.specialDayRules,
      totalMachinesApprox: store.totalMachinesApprox || 500,
      includeMonthDayZoro: false, // In multi-store digit day mode, follow strict 11, 22 zorome standard
    });

    return {
      storeId: store.id,
      storeName: store.name,
      stats,
    };
  });
}
