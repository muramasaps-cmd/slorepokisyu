import {
  DailyMachineRecord,
  DailyModelRecord,
  DailyRecord,
  DailyTailRecord,
  SpecialDayRules,
  StoreProfile,
} from '../data/types';
import { calculateDayOfWeek, isDateSpecialDay, processStoreData } from './dataEngine';
import { parseSpecialDayRulesFromText } from './specialDayRules';
import { areStoresSame } from './storeStorage';

export interface ParseCsvResult {
  success: boolean;
  stores: StoreProfile[];
  errors: string[];
  totalRecordsCount: number;
  totalMachinesCount: number;
}

/**
 * Splits CSV/TSV text into an array of rows, each containing an array of string fields.
 * Correctly handles RFC-4180 quotes, commas inside quotes (e.g. "-7,400"), escaped quotes (""), and CRLF/LF.
 */
export function parseDelimitedText(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').trim(); // Remove UTF-8 BOM if present
  if (!clean) return [];

  // Detect delimiter from first non-empty line
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else if (char === '"') {
        inQuotes = false;
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Checks if the text looks like CSV / TSV with machine-level or daily slot data
 */
export function isCsvOrTsv(text: string): boolean {
  if (!text) return false;
  const snippet = text.slice(0, 4000).trim();
  if (snippet.includes('<!DOCTYPE') || snippet.includes('<html') || snippet.includes('</body>')) {
    return false;
  }
  const lines = snippet.split(/\r?\n/).slice(0, 8);
  return lines.some(
    (line) =>
      (line.includes('台番') ||
        line.includes('台番号') ||
        line.includes('機種') ||
        line.includes('差枚') ||
        line.includes('店舗名') ||
        line.includes('出率')) &&
      (line.includes(',') || line.includes('\t'))
  );
}

interface RawMachineRow {
  storeName: string;
  dateStr: string;
  modelName: string;
  machineNum: number;
  diff: number;
  games: number;
  payoutRate?: number;
  refUrl?: string;
  bb?: number;
  rb?: number;
}

/**
 * Normalizes date to YYYY-MM-DD
 */
export function normalizeDateString(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim();

  // Pattern 1: 2026-10-04, 2026/10/04, 2026.10.04, 2026年10月04日
  const m1 = clean.match(/(202\d)[年/.\-](\d{1,2})[月/.\-](\d{1,2})/);
  if (m1) {
    const y = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10);
    const d = parseInt(m1[3], 10);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Pattern 2: YYYYMMDD
  const m2 = clean.match(/(202\d)(\d{2})(\d{2})/);
  if (m2) {
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }

  // Pattern 3: MM/DD or MM-DD or MM月DD日
  const m3 = clean.match(/^(202\d)?[-/.年]?(\d{1,2})[月/.\-](\d{1,2})日?$/);
  if (m3) {
    const y = m3[1] ? parseInt(m3[1], 10) : new Date().getFullYear();
    const m = parseInt(m3[2], 10);
    const d = parseInt(m3[3], 10);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parses Unit-Level (台番別) CSV / TSV in the exact user-specified format:
 * 店舗名,日付,機種,台番,差枚,G数,出率,参照URL
 *
 * Supports flexible column reordering, partial headers, and multi-store / multi-day batching.
 */
export function parseUnitLevelCsv(
  csvContent: string,
  fileName: string = '',
  defaultStoreName: string = ''
): ParseCsvResult {
  const errors: string[] = [];
  const rows = parseDelimitedText(csvContent);

  if (rows.length < 1 || (rows.length === 1 && rows[0].length < 3)) {
    return {
      success: false,
      stores: [],
      errors: ['データ行が見つかりません。少なくとも1行以上のデータが必要です。'],
      totalRecordsCount: 0,
      totalMachinesCount: 0,
    };
  }

  let headerRowIndex = -1;
  let headerRow: string[] = [];
  let colStore = -1;
  let colDate = -1;
  let colModel = -1;
  let colMachine = -1;
  let colDiff = -1;
  let colGames = -1;
  let colPayout = -1;
  let colUrl = -1;
  let colBb = -1;
  let colRb = -1;

  // Scan the first 8 rows to find the true header row
  for (let rIdx = 0; rIdx < Math.min(rows.length, 8); rIdx++) {
    const candidate = rows[rIdx].map((h) => h.trim().toLowerCase());
    let tempStore = -1;
    let tempDate = -1;
    let tempModel = -1;
    let tempMachine = -1;
    let tempDiff = -1;
    let tempGames = -1;
    let tempPayout = -1;
    let tempUrl = -1;
    let tempBb = -1;
    let tempRb = -1;

    candidate.forEach((h, idx) => {
      if (
        tempStore === -1 &&
        (h.includes('店舗') ||
          h.includes('ホール') ||
          h.includes('店名') ||
          h.includes('パーラー') ||
          h === '店' ||
          h.includes('店番号') ||
          h.includes('store') ||
          h.includes('shop') ||
          h.includes('hall'))
      ) {
        tempStore = idx;
      } else if (
        tempDate === -1 &&
        (h.includes('日付') || h.includes('営業日') || h === 'date' || h === 'day')
      ) {
        tempDate = idx;
      } else if (
        tempMachine === -1 &&
        (h.includes('台番') ||
          h.includes('台番号') ||
          h.includes('台no') ||
          h === '台' ||
          h === '番号' ||
          h.includes('machine_no') ||
          h === 'num' ||
          h === 'no')
      ) {
        tempMachine = idx;
      } else if (
        tempModel === -1 &&
        (h.includes('機種') || h.includes('機種名') || h === 'model' || h === 'kishu')
      ) {
        tempModel = idx;
      } else if (
        tempDiff === -1 &&
        (h.includes('差枚') || h.includes('差枚数') || h === 'diff' || h === 'samai' || h === 'coin')
      ) {
        tempDiff = idx;
      } else if (
        tempGames === -1 &&
        (h.includes('g数') ||
          h.includes('ゲーム') ||
          h === 'games' ||
          h === 'game' ||
          h === 'g' ||
          h.includes('回転') ||
          h.includes('総回転'))
      ) {
        tempGames = idx;
      } else if (
        tempPayout === -1 &&
        (h.includes('出率') ||
          h.includes('出玉率') ||
          h.includes('機械割') ||
          h.includes('割') ||
          h === 'payout' ||
          h === 'rate')
      ) {
        tempPayout = idx;
      } else if (
        tempUrl === -1 &&
        (h.includes('url') || h.includes('参照') || h.includes('リンク') || h === 'link')
      ) {
        tempUrl = idx;
      } else if (tempBb === -1 && (h === 'bb' || h === 'big')) {
        tempBb = idx;
      } else if (tempRb === -1 && (h === 'rb' || h === 'reg')) {
        tempRb = idx;
      }
    });

    if (tempMachine !== -1 || (tempModel !== -1 && tempDiff !== -1)) {
      headerRowIndex = rIdx;
      headerRow = candidate;
      colStore = tempStore;
      colDate = tempDate;
      colModel = tempModel;
      colMachine = tempMachine;
      colDiff = tempDiff;
      colGames = tempGames;
      colPayout = tempPayout;
      colUrl = tempUrl;
      colBb = tempBb;
      colRb = tempRb;
      break;
    }
  }

  // Fallback defaults for canonical user columns:
  // 店舗名,日付,機種,台番,差枚,G数,出率,参照URL
  if (colMachine === -1 && headerRow.length >= 4) {
    if (headerRow[0].includes('店')) colStore = 0;
    if (headerRow[1].includes('日')) colDate = 1;
    if (headerRow[2].includes('機')) colModel = 2;
    colMachine = 3;
    colDiff = 4;
    colGames = 5;
    colPayout = 6;
    colUrl = 7;
  }

  // If still missing colStore, check if column 0 contains store name text (not date, not diff, not purely numeric)
  if (colStore === -1) {
    for (let r = headerRowIndex + 1; r < Math.min(rows.length, headerRowIndex + 5); r++) {
      const c = rows[r];
      if (c && c.length >= 3) {
        const val0 = (c[0] || '').trim().replace(/^["']|["']$/g, '');
        if (val0.length > 1 && !normalizeDateString(val0) && !val0.match(/^[-+▲]?\d+$/)) {
          colStore = 0;
          break;
        }
      }
    }
  }

  // If still missing colMachine, infer from data rows
  if (colMachine === -1) {
    for (let r = headerRowIndex + 1; r < Math.min(rows.length, headerRowIndex + 5); r++) {
      const c = rows[r];
      if (c.length >= 4) {
        // Test if column 3 is machine number (e.g. 3069)
        const mVal = parseInt(c[3]?.replace(/[^0-9]/g, '') || '', 10);
        if (!isNaN(mVal) && mVal > 0) {
          if (colStore === -1) colStore = 0;
          colDate = 1;
          colModel = 2;
          colMachine = 3;
          colDiff = 4;
          if (c.length > 5) colGames = 5;
          if (c.length > 6) colPayout = 6;
          if (c.length > 7) colUrl = 7;
          break;
        }
      }
    }
  }

  if (colMachine === -1 || colModel === -1 || colDiff === -1) {
    errors.push(
      '必須列（機種、台番、差枚）を特定できませんでした。ヘッダー形式をご確認ください（例: 店舗名,日付,機種,台番,差枚,G数,出率,参照URL）。'
    );
    return {
      success: false,
      stores: [],
      errors,
      totalRecordsCount: 0,
      totalMachinesCount: 0,
    };
  }

  // Derive fallback store name from fileName if column not present
  const fallbackStore =
    defaultStoreName ||
    fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/202\d[-_.]?\d{1,2}[-_.]?\d{1,2}/g, '')
      .replace(/[_\-\s]+/g, ' ')
      .trim() ||
    '登録店舗';

  // Parse all machine data rows
  const parsedRows: RawMachineRow[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length < 3) continue;

    const rawStore =
      (colStore !== -1 && cols[colStore] ? cols[colStore].trim().replace(/^["']|["']$/g, '') : '') || fallbackStore;
    const rawDate = colDate !== -1 && cols[colDate] ? cols[colDate].trim() : '';
    const dateStr = normalizeDateString(rawDate) || normalizeDateString(fileName) || new Date().toISOString().substring(0, 10);

    const modelName = (colModel !== -1 && cols[colModel] ? cols[colModel].trim() : '') || '不明機種';
    const rawMachNum = colMachine !== -1 && cols[colMachine] ? cols[colMachine].trim() : '0';
    const machineNum = parseInt(rawMachNum.replace(/[^0-9]/g, ''), 10);

    if (isNaN(machineNum) || machineNum <= 0) {
      continue; // Skip invalid machine rows
    }

    const rawDiff = colDiff !== -1 && cols[colDiff] ? cols[colDiff].trim() : '0';
    const diff = parseInt(rawDiff.replace(/[,+"枚]/g, '').replace(/▲/g, '-'), 10) || 0;

    const rawGames = colGames !== -1 && cols[colGames] ? cols[colGames].trim() : '0';
    const games = parseInt(rawGames.replace(/[,+Gg"回転]/g, ''), 10) || 0;

    let payoutRate: number | undefined;
    if (colPayout !== -1 && cols[colPayout]) {
      const pVal = parseFloat(cols[colPayout].replace(/[^0-9.]/g, ''));
      if (!isNaN(pVal) && pVal > 0) {
        payoutRate = pVal <= 2.5 ? Math.round(pVal * 1000) / 10 : Math.round(pVal * 10) / 10;
      }
    } else if (games > 200) {
      const inCoins = games * 3;
      const outCoins = inCoins + diff;
      if (inCoins > 0) {
        payoutRate = Math.round((outCoins / inCoins) * 1000) / 10;
      }
    }

    const refUrl = colUrl !== -1 && cols[colUrl] ? cols[colUrl].trim() : undefined;
    const bb = colBb !== -1 && cols[colBb] ? parseInt(cols[colBb].replace(/[^0-9]/g, ''), 10) || undefined : undefined;
    const rb = colRb !== -1 && cols[colRb] ? parseInt(cols[colRb].replace(/[^0-9]/g, ''), 10) || undefined : undefined;

    parsedRows.push({
      storeName: rawStore,
      dateStr,
      modelName,
      machineNum,
      diff,
      games,
      payoutRate,
      refUrl,
      bb,
      rb,
    });
  }

  if (parsedRows.length === 0) {
    return {
      success: false,
      stores: [],
      errors: ['有効な台番データ行を解析できませんでした。'],
      totalRecordsCount: 0,
      totalMachinesCount: 0,
    };
  }

  // Group by Store Name (consolidating slight variations of store names in the same file)
  const storeGroups = new Map<string, RawMachineRow[]>();
  parsedRows.forEach((row) => {
    const sName = (row.storeName || fallbackStore).trim();
    let matchedKey: string | null = null;
    for (const key of storeGroups.keys()) {
      if (areStoresSame(key, sName)) {
        matchedKey = key;
        break;
      }
    }
    const finalKey = matchedKey || sName;
    if (!storeGroups.has(finalKey)) {
      storeGroups.set(finalKey, []);
    }
    storeGroups.get(finalKey)!.push(row);
  });

  const resultingStores: StoreProfile[] = [];
  let grandTotalRecords = 0;
  let grandTotalMachines = 0;

  for (const [storeName, storeRows] of storeGroups.entries()) {
    // Group by Date within this store
    const dateGroups = new Map<string, RawMachineRow[]>();
    storeRows.forEach((row) => {
      if (!dateGroups.has(row.dateStr)) {
        dateGroups.set(row.dateStr, []);
      }
      dateGroups.get(row.dateStr)!.push(row);
    });

    const specialDayRules: SpecialDayRules = parseSpecialDayRulesFromText(
      storeName.includes('7') ? '7のつく日' : storeName.includes('5') ? '5のつく日' : '7のつく日'
    );
    const oldEventDays = storeName.includes('7') ? '7のつく日' : storeName.includes('5') ? '5のつく日' : '7のつく日';
    const rateLend = 46;
    const rateExchange = 52;
    const cashRatio = 35;

    const dailyRecords: DailyRecord[] = [];

    // Sort dates chronologically ascending
    const sortedDates = Array.from(dateGroups.keys()).sort();

    for (const dateStr of sortedDates) {
      const rawUnits = dateGroups.get(dateStr)!;

      // Deduplicate machines on the same day by machineNum (keeping last)
      const machineMap = new Map<number, RawMachineRow>();
      rawUnits.forEach((u) => machineMap.set(u.machineNum, u));
      const uniqueUnits = Array.from(machineMap.values()).sort((a, b) => a.machineNum - b.machineNum);

      grandTotalMachines += uniqueUnits.length;

      // 1. Build DailyMachineRecord[]
      const machines: DailyMachineRecord[] = uniqueUnits.map((u) => {
        const sMach = String(u.machineNum);
        const isZoro = sMach.length >= 2 && sMach.split('').every((c) => c === sMach[0]);
        const tailDigit = u.machineNum % 10;
        return {
          machineNum: u.machineNum,
          modelName: u.modelName,
          diff: u.diff,
          games: u.games,
          payoutRate: u.payoutRate,
          refUrl: u.refUrl,
          bb: u.bb,
          rb: u.rb,
          isZoro,
          tailDigit,
        };
      });

      // 2. Aggregate DailyModelRecord[]
      const modelMap = new Map<string, DailyMachineRecord[]>();
      machines.forEach((m) => {
        if (!modelMap.has(m.modelName)) {
          modelMap.set(m.modelName, []);
        }
        modelMap.get(m.modelName)!.push(m);
      });

      const models: DailyModelRecord[] = Array.from(modelMap.entries())
        .map(([mName, machList]) => {
          const totDiff = machList.reduce((sum, m) => sum + m.diff, 0);
          const totGames = machList.reduce((sum, m) => sum + m.games, 0);
          const wins = machList.filter((m) => m.diff > 0).length;
          const totMach = machList.length;
          const avgDiff = Math.round(totDiff / totMach);
          const avgG = Math.round(totGames / totMach);
          const winRate = totMach > 0 ? Math.round((wins / totMach) * 1000) / 10 : 0;

          return {
            modelName: mName,
            avgDiffCoins: avgDiff,
            totalDiffCoins: totDiff,
            avgGames: avgG,
            winMachines: wins,
            totalMachines: totMach,
            winRate,
            isSmallCount: totMach <= 2,
          };
        })
        .sort((a, b) => b.totalDiffCoins - a.totalDiffCoins);

      // 3. Aggregate DailyTailRecord[]
      const tails: DailyTailRecord[] = [];
      for (let t = 0; t <= 9; t++) {
        const matching = machines.filter((m) => m.tailDigit === t);
        if (matching.length > 0) {
          const tTotDiff = matching.reduce((sum, m) => sum + m.diff, 0);
          const tTotGames = matching.reduce((sum, m) => sum + m.games, 0);
          const tWins = matching.filter((m) => m.diff > 0).length;
          const tAvgDiff = Math.round(tTotDiff / matching.length);
          const tAvgGames = Math.round(tTotGames / matching.length);
          const tWinRate = Math.round((tWins / matching.length) * 1000) / 10;

          tails.push({
            tailName: `末尾${t}`,
            tailNum: t,
            avgDiffCoins: tAvgDiff,
            totalDiffCoins: tTotDiff,
            avgGames: tAvgGames,
            winMachines: tWins,
            totalMachines: matching.length,
            winRate: tWinRate,
          });
        }
      }

      // Zoro Tail (ゾロ目)
      const zoroMatches = machines.filter((m) => m.isZoro);
      if (zoroMatches.length > 0) {
        const zTotDiff = zoroMatches.reduce((sum, m) => sum + m.diff, 0);
        const zTotGames = zoroMatches.reduce((sum, m) => sum + m.games, 0);
        const zWins = zoroMatches.filter((m) => m.diff > 0).length;
        const zAvgDiff = Math.round(zTotDiff / zoroMatches.length);
        const zAvgGames = Math.round(zTotGames / zoroMatches.length);
        const zWinRate = Math.round((zWins / zoroMatches.length) * 1000) / 10;

        tails.push({
          tailName: '末尾 ゾロ目',
          tailNum: null,
          avgDiffCoins: zAvgDiff,
          totalDiffCoins: zTotDiff,
          avgGames: zAvgGames,
          winMachines: zWins,
          totalMachines: zoroMatches.length,
          winRate: zWinRate,
        });
      }

      // 4. Overall Day Summary
      const totDayMachines = machines.length;
      const totDayDiff = machines.reduce((sum, m) => sum + m.diff, 0);
      const totDayGames = machines.reduce((sum, m) => sum + m.games, 0);
      const dayWins = machines.filter((m) => m.diff > 0).length;
      const avgDayDiff = Math.round(totDayDiff / totDayMachines);
      const avgDayGames = Math.round(totDayGames / totDayMachines);
      const dayWinRate = Math.round((dayWins / totDayMachines) * 1000) / 10;

      const [yStr, mStr, dStr] = dateStr.split('-');
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      const day = parseInt(dStr, 10);
      const yearMonth = `${yStr}-${mStr}`;
      const dayOfWeek = calculateDayOfWeek(dateStr);
      const is7Day = day % 10 === 7;
      const isOldEvent = isDateSpecialDay(dateStr, specialDayRules);

      const notable =
        models
          .filter((m) => m.avgDiffCoins > 0)
          .slice(0, 4)
          .map((m) => `${m.modelName.replace(/^L|スマスロ|パチスロ/g, '')}(+${m.avgDiffCoins.toLocaleString()})`)
          .join('、') || '出玉データあり';

      const dRecord: DailyRecord = {
        date: dateStr,
        yearMonth,
        year,
        month,
        day,
        dayOfWeek,
        avgDiffCoins: avgDayDiff,
        avgGames: avgDayGames,
        winRate: dayWinRate,
        winMachines: dayWins,
        totalMachines: totDayMachines,
        totalDiffCoins: totDayDiff,
        hallCoinProfit: -totDayDiff,
        playerCoinProfit: totDayDiff,
        hallYenProfit: 0,
        playerYenProfit: 0,
        inCoins: 0,
        outCoins: 0,
        payoutRate: 100,
        estimatedRevenue: 0,
        exchangeGapProfit: 0,
        gModelHallProfit: 0,
        gModelPlayerProfit: 0,
        isOldEventDay: isOldEvent,
        is7Day,
        notable,
        models,
        tails,
        machines,
      };

      dailyRecords.push(dRecord);
    }

    const processed = processStoreData(dailyRecords, rateLend, rateExchange, cashRatio, specialDayRules);

    const firstDate = processed.dailyRecords[0]?.date || '';
    const lastDate = processed.dailyRecords[processed.dailyRecords.length - 1]?.date || '';
    const ymStart = firstDate.substring(0, 7);
    const ymEnd = lastDate.substring(0, 7);
    const dataRange = `${ymStart} ～ ${ymEnd} (${processed.dailyRecords.length}日分実データ)`;

    const approxMachines =
      processed.dailyRecords.length > 0
        ? Math.max(...processed.dailyRecords.map((r) => r.totalMachines))
        : 160;

    const storeId = `store-${storeName.replace(/[\s\u3000]+/g, '-').toLowerCase()}-${Date.now().toString(36)}`;

    const storeProfile: StoreProfile = {
      id: storeId,
      name: storeName,
      address: '住所未登録',
      oldEventDays,
      exchangeRate: '46枚貸/52枚交換',
      rateLend,
      rateExchange,
      cashRatio,
      totalMachinesApprox: approxMachines,
      dataRange,
      isPreset: false,
      specialDayRules,
      dailyRecords: processed.dailyRecords,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    resultingStores.push(storeProfile);
    grandTotalRecords += processed.dailyRecords.length;
  }

  return {
    success: resultingStores.length > 0,
    stores: resultingStores,
    errors: [],
    totalRecordsCount: grandTotalRecords,
    totalMachinesCount: grandTotalMachines,
  };
}

/**
 * Generates sample CSV in the exact requested format
 */
export function generateUnitLevelCsvTemplate(): string {
  const header = '店舗名,日付,機種,台番,差枚,G数,出率,参照URL';
  const sampleRows = [
    'マルハンメガシティ2000蒲田7,2026-10-04,スロット ソードアート・オンラインⅡ,3069,"-7,400","7,405",66.7%,https://min-repo.com/3389710/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-05,スロット ソードアート・オンラインⅡ,3062,"-7,200","7,814",69.3%,https://min-repo.com/3391752/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-04,L東京喰種,3230,"-6,600","7,374",70.2%,https://min-repo.com/3389710/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-05,スロット ソードアート・オンラインⅡ,3072,"-6,500","7,185",69.8%,https://min-repo.com/3391752/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-04,スロット ソードアート・オンラインⅡ,3066,"-6,400","7,294",70.8%,https://min-repo.com/3389710/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-05,スロット ソードアート・オンラインⅡ,3068,"-6,100","8,346",75.6%,https://min-repo.com/3391752/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-05,L ToLOVEるダークネス TRANCE ver.8.7,3084,"-6,100","6,383",68.1%,https://min-repo.com/3391752/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-04,スロット ソードアート・オンラインⅡ,3065,"-6,000","7,121",71.9%,https://min-repo.com/3389710/?kishu=all&sort=num',
    'マルハンメガシティ2000蒲田7,2026-10-04,Lパチスロ革命機ヴァルヴレイヴ2,3100,"-6,000","5,300",62.3%,https://min-repo.com/3389710/?kishu=all&sort=num',
  ];
  return '\uFEFF' + [header, ...sampleRows].join('\r\n');
}
