import { DailyRecord, MonthlyStat, SpecialDayRules, StoreProfile } from '../data/types';

export const JAPANESE_DAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function calculateDayOfWeek(dateStr: string): string {
  // Parse YYYY-MM-DD safely
  const parts = dateStr.split(/[-/.]/);
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    return JAPANESE_DAYS[date.getDay()] || '月';
  }
  return '月';
}

export function isDateSpecialDay(dateStr: string, rules?: SpecialDayRules): boolean {
  if (!rules) return false;

  const parts = dateStr.split(/[-/.]/);
  if (parts.length !== 3) return false;

  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dow = calculateDayOfWeek(dateStr);

  // 1. Tails (末尾): e.g. 7 -> 7, 17, 27
  if (rules.tails && rules.tails.length > 0) {
    const dayTail = day % 10;
    if (rules.tails.includes(dayTail)) {
      return true;
    }
  }

  // 2. Month-Day Zoro (月日ゾロ目): 1/1, 2/2, 3/3... 11/11, 12/12
  if (rules.monthDayZoro && month === day) {
    return true;
  }

  // 3. Double digits (ゾロ目): 11日, 22日
  if (rules.doubleDigits && (day === 11 || day === 22)) {
    return true;
  }

  // 4. Fixed dates: e.g. 1日, 15日
  if (rules.fixedDates && rules.fixedDates.includes(day)) {
    return true;
  }

  // 5. Day of week: e.g. '土', '日'
  if (rules.daysOfWeek && rules.daysOfWeek.includes(dow)) {
    return true;
  }

  return false;
}

export function formatSpecialDayRulesDescription(rules?: SpecialDayRules): string {
  if (!rules) return '特日未設定';
  if (rules.customDescription) return rules.customDescription;

  const parts: string[] = [];
  if (rules.tails && rules.tails.length > 0) {
    parts.push(`${rules.tails.map((t) => `${t}のつく日`).join('・')}`);
  }
  if (rules.doubleDigits) {
    parts.push('毎月11日・22日');
  }
  if (rules.monthDayZoro) {
    parts.push('月日ゾロ目');
  }
  if (rules.fixedDates && rules.fixedDates.length > 0) {
    parts.push(`毎月${rules.fixedDates.join('日・')}日`);
  }
  if (rules.daysOfWeek && rules.daysOfWeek.length > 0) {
    parts.push(`毎週${rules.daysOfWeek.join('・')}曜日`);
  }

  return parts.length > 0 ? parts.join(' / ') : '特日未設定';
}

/**
 * Recalculate daily records and aggregate monthly stats for any store.
 */
export function processStoreData(
  records: DailyRecord[],
  rateLend: number,
  rateExchange: number,
  cashRatio: number,
  rules?: SpecialDayRules
): { dailyRecords: DailyRecord[]; monthlyStats: MonthlyStat[] } {
  if (!records || records.length === 0) {
    return { dailyRecords: [], monthlyStats: [] };
  }

  const lendYenPerCoin = 1000 / rateLend;
  const exchangeYenPerCoin = 1000 / rateExchange;
  const gapPerCoin = lendYenPerCoin - exchangeYenPerCoin;

  // Sort chronologically ascending
  const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));

  // Determine fallback/mode machine count across days that display machines
  const validWithMachines = sortedRecords.filter((r) => r.totalMachines && r.totalMachines > 0);
  const freqMap = new Map<number, number>();
  validWithMachines.forEach((r) => {
    freqMap.set(r.totalMachines, (freqMap.get(r.totalMachines) || 0) + 1);
  });
  let modeMachines = 162;
  let maxF = 0;
  freqMap.forEach((f, m) => {
    if (f > maxF) {
      maxF = f;
      modeMachines = m;
    }
  });

  // Process daily records
  const dailyRecords: DailyRecord[] = sortedRecords.map((r, index) => {
    // If specialDayRules provided, re-evaluate isOldEventDay
    const isSpecial = rules ? isDateSpecialDay(r.date, rules) : r.isOldEventDay;
    const is7 = r.day % 10 === 7;

    // 台数がブランクの日は他の日で台数表示されてる台数を流用する
    let machines = r.totalMachines;
    let isReusedMachines = r.isReusedMachines || false;

    if (!machines || machines <= 0) {
      isReusedMachines = true;
      let nearestDist = Infinity;
      let nearestMachines: number | null = null;
      for (let i = 0; i < sortedRecords.length; i++) {
        const other = sortedRecords[i];
        if (other.totalMachines && other.totalMachines > 0) {
          const dist = Math.abs(i - index);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestMachines = other.totalMachines;
          }
        }
      }
      machines = nearestMachines || modeMachines || 162;
    }

    // If winMachines was blank, but winRate and total machines are available, derive winMachines
    let winMachines = r.winMachines;
    let winRate = r.winRate;
    if ((winMachines === null || winMachines === undefined) && winRate !== null && winRate !== undefined && machines > 0) {
      winMachines = Math.round(machines * (winRate / 100));
    } else if ((winRate === null || winRate === undefined) && winMachines !== null && winMachines !== undefined && machines > 0) {
      winRate = Math.round((winMachines / machines) * 1000) / 10;
    }

    // Ensure totalDiffCoins corresponds to avgDiffCoins * machines
    let totalDiffCoins = r.totalDiffCoins;
    if ((totalDiffCoins === 0 || totalDiffCoins === undefined) && r.avgDiffCoins !== 0) {
      totalDiffCoins = r.avgDiffCoins * machines;
    }

    const hallCoinProfit = -totalDiffCoins;
    const playerCoinProfit = totalDiffCoins;

    // Model A: 差枚数換算モデル
    const hallYen =
      hallCoinProfit >= 0
        ? Math.round(hallCoinProfit * lendYenPerCoin)
        : Math.round(hallCoinProfit * exchangeYenPerCoin);

    const playerYen =
      playerCoinProfit >= 0
        ? Math.round(playerCoinProfit * exchangeYenPerCoin)
        : Math.round(playerCoinProfit * lendYenPerCoin);

    // Model B: G数(IN枚数)モデル
    const inCoins = Math.round(r.avgGames * 3 * machines);
    const outCoins = inCoins + totalDiffCoins;
    const payoutRate = inCoins > 0 ? (outCoins / inCoins) * 100 : 100;

    const cashCoinsInvested = inCoins * (cashRatio / 100);
    const estimatedRevenue = Math.round(cashCoinsInvested * lendYenPerCoin);
    const exchangeGapProfit = Math.round(cashCoinsInvested * gapPerCoin);

    // G数連動ホール粗利 = 換金ギャップ利益 - (客側総差枚 * 交換単価)
    const gModelHallProfit = Math.round(exchangeGapProfit - totalDiffCoins * exchangeYenPerCoin);
    const gModelPlayerProfit = -gModelHallProfit;

    return {
      ...r,
      totalMachines: machines,
      winMachines,
      winRate,
      totalDiffCoins,
      isReusedMachines,
      isOldEventDay: isSpecial,
      is7Day: is7,
      hallCoinProfit,
      playerCoinProfit,
      hallYenProfit: hallYen,
      playerYenProfit: playerYen,
      inCoins,
      outCoins,
      payoutRate,
      estimatedRevenue,
      exchangeGapProfit,
      gModelHallProfit,
      gModelPlayerProfit,
    };
  });

  // Group by year-month
  const grouped = new Map<string, DailyRecord[]>();
  dailyRecords.forEach((r) => {
    if (!grouped.has(r.yearMonth)) {
      grouped.set(r.yearMonth, []);
    }
    grouped.get(r.yearMonth)!.push(r);
  });

  let cumHallCoins = 0;
  let cumHallYen = 0;
  let cumPlayerCoins = 0;
  let cumPlayerYen = 0;
  let cumGModelHallYen = 0;
  let cumGModelPlayerYen = 0;

  // Build sorted monthly stats
  const sortedYms = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  const monthlyStats: MonthlyStat[] = sortedYms.map((ym) => {
    const recs = grouped.get(ym) || [];
    const [yearStr, monthStr] = ym.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const label = `${year}年${month}月`;

    const daysCount = recs.length;
    const avgMachines = Math.round(recs.reduce((acc, r) => acc + r.totalMachines, 0) / daysCount);
    const totalDiffCoins = recs.reduce((acc, r) => acc + r.totalDiffCoins, 0);
    const avgDiffCoins = Math.round((totalDiffCoins / (avgMachines * daysCount)) * 10) / 10;

    const hallCoinProfit = -totalDiffCoins;
    const playerCoinProfit = totalDiffCoins;

    const totHallYen = recs.reduce((acc, r) => acc + r.hallYenProfit, 0);
    const totPlayerYen = recs.reduce((acc, r) => acc + r.playerYenProfit, 0);

    const totInCoins = recs.reduce((acc, r) => acc + r.inCoins, 0);
    const totOutCoins = recs.reduce((acc, r) => acc + r.outCoins, 0);
    const totEstimatedRevenue = recs.reduce((acc, r) => acc + r.estimatedRevenue, 0);
    const totExchangeGapProfit = recs.reduce((acc, r) => acc + r.exchangeGapProfit, 0);
    const totGModelHallProfit = recs.reduce((acc, r) => acc + r.gModelHallProfit, 0);
    const totGModelPlayerProfit = recs.reduce((acc, r) => acc + r.gModelPlayerProfit, 0);

    const avgPayoutRate = totInCoins > 0 ? (totOutCoins / totInCoins) * 100 : 100;
    const avgGames = Math.round(recs.reduce((acc, r) => acc + r.avgGames, 0) / daysCount);

    const recsWithWr = recs.filter((r) => r.winRate !== null);
    const avgWinRate = recsWithWr.length > 0
      ? Math.round((recsWithWr.reduce((acc, r) => acc + (r.winRate || 0), 0) / recsWithWr.length) * 10) / 10
      : null;

    const hallWinDays = recs.filter((r) => r.totalDiffCoins < 0).length;
    const playerWinDays = recs.filter((r) => r.totalDiffCoins > 0).length;

    const eventRecs = recs.filter((r) => r.isOldEventDay);
    const normalRecs = recs.filter((r) => !r.isOldEventDay);

    const eventDaysCount = eventRecs.length;
    const eventTotalDiff = eventRecs.reduce((acc, r) => acc + r.totalDiffCoins, 0);
    const eventAvgDiff = eventDaysCount > 0
      ? Math.round((eventTotalDiff / (avgMachines * eventDaysCount)) * 10) / 10
      : 0;

    const normalDaysCount = normalRecs.length;
    const normalTotalDiff = normalRecs.reduce((acc, r) => acc + r.totalDiffCoins, 0);
    const normalAvgDiff = normalDaysCount > 0
      ? Math.round((normalTotalDiff / (avgMachines * normalDaysCount)) * 10) / 10
      : 0;

    cumHallCoins += hallCoinProfit;
    cumHallYen += totHallYen;
    cumPlayerCoins += playerCoinProfit;
    cumPlayerYen += totPlayerYen;
    cumGModelHallYen += totGModelHallProfit;
    cumGModelPlayerYen += totGModelPlayerProfit;

    return {
      yearMonth: ym,
      year,
      month,
      label,
      daysCount,
      avgMachines,
      avgDiffCoins,
      totalDiffCoins,
      hallCoinProfit,
      playerCoinProfit,
      hallYenProfit: totHallYen,
      playerYenProfit: totPlayerYen,
      cumHallCoinProfit: cumHallCoins,
      cumHallYenProfit: cumHallYen,
      cumPlayerCoinProfit: cumPlayerCoins,
      cumPlayerYenProfit: cumPlayerYen,
      totalInCoins: totInCoins,
      totalOutCoins: totOutCoins,
      avgPayoutRate,
      estimatedRevenue: totEstimatedRevenue,
      exchangeGapProfit: totExchangeGapProfit,
      gModelHallProfit: totGModelHallProfit,
      gModelPlayerProfit: totGModelPlayerProfit,
      cumGModelHallProfit: cumGModelHallYen,
      cumGModelPlayerProfit: cumGModelPlayerYen,
      modelDiff: totGModelHallProfit - totHallYen,
      avgGames,
      avgWinRate,
      hallWinDays,
      playerWinDays,
      eventDaysCount,
      eventAvgDiff,
      eventHallYen: eventRecs.reduce((acc, r) => acc + r.hallYenProfit, 0),
      eventGModelHallYen: eventRecs.reduce((acc, r) => acc + r.gModelHallProfit, 0),
      normalDaysCount,
      normalAvgDiff,
      normalHallYen: normalRecs.reduce((acc, r) => acc + r.hallYenProfit, 0),
      normalGModelHallYen: normalRecs.reduce((acc, r) => acc + r.gModelHallProfit, 0),
    };
  });

  return { dailyRecords, monthlyStats };
}

/**
 * Parse CSV, TSV, or spreadsheet paste table
 */
export function parseSlotDataInput(
  rawText: string,
  defaultMachines: number = 500,
  rules?: SpecialDayRules
): { records: DailyRecord[]; headersFound: string[]; errors: string[] } {
  const errors: string[] = [];
  const lines = rawText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { records: [], headersFound: [], errors: ['データ行が見つかりません。少なくともヘッダー行と1行以上のデータが必要です。'] };
  }

  // Detect delimiter: comma, tab, or semicolon
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

  // Split headers
  const headers = firstLine
    .split(delimiter)
    .map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  // Detect column indexes
  let dateIdx = -1;
  let diffIdx = -1; // can be total diff or avg diff
  let isDiffTotal = false;
  let avgDiffIdx = -1;
  let gamesIdx = -1;
  let machinesIdx = -1;
  let winRateIdx = -1;
  let winMachinesIdx = -1;
  let notableIdx = -1;
  let isEventIdx = -1;

  headers.forEach((h, idx) => {
    if (h.includes('日') || h.includes('date') || h.includes('年月')) {
      if (dateIdx === -1) dateIdx = idx;
    } else if (h.includes('総差枚') || h.includes('totaldiff') || h === '差枚') {
      diffIdx = idx;
      isDiffTotal = true;
    } else if (h.includes('台平均') || h.includes('平均差枚') || h.includes('avgdiff')) {
      avgDiffIdx = idx;
    } else if (h.includes('game') || h.includes('ゲーム') || h.includes('g数')) {
      gamesIdx = idx;
    } else if (h.includes('台数') || h.includes('設置台数') || h.includes('machines')) {
      machinesIdx = idx;
    } else if (h.includes('勝率') || h.includes('winrate')) {
      winRateIdx = idx;
    } else if (h.includes('勝台') || h.includes('winmachines')) {
      winMachinesIdx = idx;
    } else if (h.includes('特日') || h.includes('イベント') || h.includes('event')) {
      isEventIdx = idx;
    } else if (h.includes('備考') || h.includes('notable') || h.includes('メモ')) {
      notableIdx = idx;
    }
  });

  if (dateIdx === -1) {
    // If no header matched, maybe first column is date if it looks like a date
    dateIdx = 0;
    diffIdx = 1;
  }

  const parsedRecords: DailyRecord[] = [];
  const dateSet = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const cols = rawLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length <= Math.max(dateIdx, 0)) continue;

    const rawDate = cols[dateIdx] || '';
    // Normalize date: support 2024/05/01, 2024-5-1, 2024年5月1日
    const normalizedDate = rawDate
      .replace(/年|\//g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '')
      .trim();

    const dateMatch = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!dateMatch) {
      if (i <= 5) {
        errors.push(`行 ${i + 1}: 日付形式「${rawDate}」を解析できませんでした。(例: 2024-05-15)`);
      }
      continue;
    }

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day = parseInt(dateMatch[3], 10);
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    if (dateSet.has(formattedDate)) {
      continue; // skip duplicate dates
    }
    dateSet.add(formattedDate);

    // Machines
    let totalMachines = defaultMachines;
    if (machinesIdx !== -1 && cols[machinesIdx]) {
      const mVal = parseInt(cols[machinesIdx].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(mVal) && mVal > 0) totalMachines = mVal;
    }

    // Diff
    let avgDiffCoins = 0;
    let totalDiffCoins = 0;

    if (avgDiffIdx !== -1 && cols[avgDiffIdx]) {
      const val = parseFloat(cols[avgDiffIdx].replace(/[+,]/g, ''));
      if (!isNaN(val)) {
        avgDiffCoins = Math.round(val * 10) / 10;
        totalDiffCoins = Math.round(avgDiffCoins * totalMachines);
      }
    } else if (diffIdx !== -1 && cols[diffIdx]) {
      const val = parseFloat(cols[diffIdx].replace(/[+,]/g, ''));
      if (!isNaN(val)) {
        if (isDiffTotal) {
          totalDiffCoins = Math.round(val);
          avgDiffCoins = Math.round((totalDiffCoins / totalMachines) * 10) / 10;
        } else {
          avgDiffCoins = Math.round(val * 10) / 10;
          totalDiffCoins = Math.round(avgDiffCoins * totalMachines);
        }
      }
    }

    // Games
    let avgGames = 4500;
    if (gamesIdx !== -1 && cols[gamesIdx]) {
      const gVal = parseFloat(cols[gamesIdx].replace(/[^0-9.]/g, ''));
      if (!isNaN(gVal) && gVal > 0) {
        // if total games > 50,000, probably total games -> divide by machines
        avgGames = gVal > 25000 ? Math.round(gVal / totalMachines) : Math.round(gVal);
      }
    }

    // Win Rate
    let winRate: number | null = null;
    let winMachines: number | null = null;
    if (winRateIdx !== -1 && cols[winRateIdx]) {
      const wrVal = parseFloat(cols[winRateIdx].replace(/[^0-9.]/g, ''));
      if (!isNaN(wrVal)) {
        winRate = Math.round(wrVal * 10) / 10;
        winMachines = Math.round((totalMachines * winRate) / 100);
      }
    } else if (winMachinesIdx !== -1 && cols[winMachinesIdx]) {
      const wmVal = parseInt(cols[winMachinesIdx].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(wmVal)) {
        winMachines = wmVal;
        winRate = Math.round((wmVal / totalMachines) * 1000) / 10;
      }
    }

    const dayOfWeek = calculateDayOfWeek(formattedDate);
    let isOldEventDay = rules ? isDateSpecialDay(formattedDate, rules) : false;

    if (isEventIdx !== -1 && cols[isEventIdx]) {
      const evText = cols[isEventIdx].trim();
      if (evText === '○' || evText === '1' || evText === 'true' || evText.includes('特日') || evText.includes('イベ')) {
        isOldEventDay = true;
      }
    }

    const notable = notableIdx !== -1 && cols[notableIdx] ? cols[notableIdx].trim() : '';

    parsedRecords.push({
      date: formattedDate,
      yearMonth,
      year,
      month,
      day,
      dayOfWeek,
      avgDiffCoins,
      avgGames,
      winRate,
      winMachines,
      totalMachines,
      totalDiffCoins,
      hallCoinProfit: -totalDiffCoins,
      playerCoinProfit: totalDiffCoins,
      hallYenProfit: 0,
      playerYenProfit: 0,
      inCoins: 0,
      outCoins: 0,
      payoutRate: 100,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: 0,
      gModelPlayerProfit: 0,
      isOldEventDay,
      is7Day: day % 10 === 7,
      notable,
    });
  }

  // Sort chronological
  parsedRecords.sort((a, b) => a.date.localeCompare(b.date));

  return {
    records: parsedRecords,
    headersFound: headers,
    errors,
  };
}

/**
 * Generate CSV template for users to copy/download
 */
export function generateCsvTemplate(): string {
  const header = '日付,台平均差枚,平均ゲーム数,総台数,勝率(%),特日フラグ,備考';
  const sampleRows = [
    '2024-07-07,+250.5,6200,500,54.2,特日,7のつく日・年一ゾロ目',
    '2024-07-08,-85.0,4100,500,42.0,,通常営業',
    '2024-07-09,-110.2,3900,500,40.5,,通常営業',
    '2024-07-17,+120.4,5800,500,51.0,特日,7のつく日',
    '2024-07-27,+180.0,6100,500,53.5,特日,7のつく日',
  ];
  return '\uFEFF' + [header, ...sampleRows].join('\r\n');
}

/**
 * Synthetic Demo Data Generator for Testing New Stores
 */
export function generateSyntheticStoreData(
  storeName: string,
  machines: number = 600,
  monthsCount: number = 12,
  rules?: SpecialDayRules,
  tendency: 'balanced' | 'aggressive_hall' | 'generous_hall' = 'balanced'
): DailyRecord[] {
  const records: DailyRecord[] = [];
  const now = new Date(2026, 8, 1); // 2026-09-01

  // Start from monthsCount months ago
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsCount + 1, 1);

  const baseDiff = tendency === 'generous_hall' ? 15 : tendency === 'aggressive_hall' ? -65 : -25;
  const eventDiffBonus = tendency === 'generous_hall' ? 220 : tendency === 'aggressive_hall' ? 120 : 160;

  const curr = new Date(startDate);
  while (curr <= now) {
    const y = curr.getFullYear();
    const m = curr.getMonth() + 1;
    const d = curr.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const yearMonth = `${y}-${String(m).padStart(2, '0')}`;
    const dow = JAPANESE_DAYS[curr.getDay()];

    const isSpecial = rules ? isDateSpecialDay(dateStr, rules) : (d % 10 === 7);

    // Random variation
    const noise = Math.round((Math.random() - 0.5) * 120);
    const dayDiff = isSpecial
      ? Math.round(baseDiff + eventDiffBonus + noise)
      : Math.round(baseDiff + noise * 0.7);

    const avgGames = isSpecial
      ? Math.round(5800 + Math.random() * 800)
      : Math.round(3800 + Math.random() * 1000);

    const winRate = Math.round((45 + (dayDiff / 30) + (Math.random() - 0.5) * 4) * 10) / 10;
    const clampedWr = Math.max(30, Math.min(65, winRate));
    const totalDiffCoins = Math.round(dayDiff * machines);

    records.push({
      date: dateStr,
      yearMonth,
      year: y,
      month: m,
      day: d,
      dayOfWeek: dow,
      avgDiffCoins: dayDiff,
      avgGames,
      winRate: clampedWr,
      winMachines: Math.round((machines * clampedWr) / 100),
      totalMachines: machines,
      totalDiffCoins,
      hallCoinProfit: -totalDiffCoins,
      playerCoinProfit: totalDiffCoins,
      hallYenProfit: 0,
      playerYenProfit: 0,
      inCoins: 0,
      outCoins: 0,
      payoutRate: 100,
      estimatedRevenue: 0,
      exchangeGapProfit: 0,
      gModelHallProfit: 0,
      gModelPlayerProfit: 0,
      isOldEventDay: isSpecial,
      is7Day: d % 10 === 7,
      notable: isSpecial ? '店舗特日' : '',
    });

    curr.setDate(curr.getDate() + 1);
  }

  return records;
}
