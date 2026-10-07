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
import { isCsvOrTsv, parseUnitLevelCsv, normalizeDateString } from './csvParser';

export interface ParseHtmlResult {
  success: boolean;
  store?: StoreProfile;
  errors: string[];
  totalRecordsCount: number;
}

/**
 * Extracts individual machine records from any HTML table that contains a machine number (台番/台番号) column.
 * Handles Min-repo, Slorepo, Ana-slo, or generic hall report tables.
 */
export function extractMachinesFromHtmlTable(
  table: HTMLTableElement,
  fallbackDate: string,
  fallbackStore: string
): { machines: DailyMachineRecord[]; date: string; storeName: string }[] {
  const allTrs = Array.from(table.querySelectorAll('tr'));
  if (allTrs.length === 0) return [];

  let headerRowIndex = -1;
  let colMachine = -1;
  let colModel = -1;
  let colDiff = -1;
  let colGames = -1;
  let colPayout = -1;
  let colDate = -1;
  let colStore = -1;
  let colBb = -1;
  let colRb = -1;

  // Search the first 8 rows to find the true column header row
  for (let rIdx = 0; rIdx < Math.min(allTrs.length, 8); rIdx++) {
    const tr = allTrs[rIdx];
    const cells = Array.from(tr.querySelectorAll('th, td'));
    let tempColMach = -1;
    let tempColMod = -1;
    let tempColDiff = -1;
    let tempColGames = -1;
    let tempColPayout = -1;
    let tempColDate = -1;
    let tempColStore = -1;
    let tempColBb = -1;
    let tempColRb = -1;

    cells.forEach((c, idx) => {
      const txt = (c.textContent || '').trim().toLowerCase();
      if (
        tempColMach === -1 &&
        (txt.includes('台番') ||
          txt.includes('台番号') ||
          txt.includes('台no') ||
          txt.includes('台id') ||
          txt === '台' ||
          txt === '番号' ||
          txt === 'no' ||
          txt === 'no.' ||
          txt === 'num' ||
          txt.includes('machine'))
      ) {
        tempColMach = idx;
      } else if (
        tempColMod === -1 &&
        (txt.includes('機種') ||
          txt.includes('機種名') ||
          txt === 'model' ||
          txt === 'kishu')
      ) {
        tempColMod = idx;
      } else if (
        tempColDiff === -1 &&
        (txt.includes('差枚') ||
          txt.includes('差枚数') ||
          txt === 'diff' ||
          txt === '出玉' ||
          txt.includes('コイン') ||
          txt === 'samai')
      ) {
        tempColDiff = idx;
      } else if (
        tempColGames === -1 &&
        (txt.includes('g数') ||
          txt.includes('ゲーム') ||
          txt === 'games' ||
          txt === 'game' ||
          txt === 'g' ||
          txt.includes('回転') ||
          txt.includes('総回転'))
      ) {
        tempColGames = idx;
      } else if (
        tempColPayout === -1 &&
        (txt.includes('出率') ||
          txt.includes('出玉率') ||
          txt.includes('機械割') ||
          txt === 'rate' ||
          txt === 'payout' ||
          txt.includes('割'))
      ) {
        tempColPayout = idx;
      } else if (tempColDate === -1 && (txt.includes('日付') || txt === 'date')) {
        tempColDate = idx;
      } else if (
        tempColStore === -1 &&
        (txt.includes('店舗') || txt.includes('店名') || txt === 'store' || txt.includes('ホール'))
      ) {
        tempColStore = idx;
      } else if (tempColBb === -1 && (txt === 'bb' || txt === 'big' || txt.includes('ビッグ'))) {
        tempColBb = idx;
      } else if (tempColRb === -1 && (txt === 'rb' || txt === 'reg' || txt.includes('レギュラー'))) {
        tempColRb = idx;
      }
    });

    // Valid header if it found machine column, or both model & diff columns
    if (tempColMach !== -1 || (tempColMod !== -1 && tempColDiff !== -1)) {
      headerRowIndex = rIdx;
      colMachine = tempColMach;
      colModel = tempColMod;
      colDiff = tempColDiff;
      colGames = tempColGames;
      colPayout = tempColPayout;
      colDate = tempColDate;
      colStore = tempColStore;
      colBb = tempColBb;
      colRb = tempColRb;
      break;
    }
  }

  // Fallback if no machine column named explicitly, but columns match positional layout [台番, 機種, 差枚, G数, ...]
  if (colMachine === -1) {
    for (let rIdx = Math.max(0, headerRowIndex + 1); rIdx < Math.min(allTrs.length, 5); rIdx++) {
      const cells = Array.from(allTrs[rIdx].querySelectorAll('td, th'));
      if (cells.length >= 3) {
        const c0Num = parseInt(cells[0].textContent?.replace(/[^0-9]/g, '') || '', 10);
        const c1Txt = cells[1].textContent?.trim() || '';
        const c2Diff = parseInt(cells[2].textContent?.replace(/[,+▲\-]/g, '') || '', 10);
        if (!isNaN(c0Num) && c0Num > 0 && c0Num < 10000 && c1Txt.length > 1 && !isNaN(c2Diff)) {
          colMachine = 0;
          if (colModel === -1) colModel = 1;
          if (colDiff === -1) colDiff = 2;
          if (colGames === -1 && cells.length > 3) colGames = 3;
          if (colPayout === -1 && cells.length > 4) colPayout = 4;
          break;
        }
      }
    }
  }

  if (colMachine === -1) return [];

  const parsedRows: { machine: DailyMachineRecord; date: string; store: string }[] = [];

  for (let rIdx = 0; rIdx < allTrs.length; rIdx++) {
    if (rIdx <= headerRowIndex) continue; // Skip header row
    const tr = allTrs[rIdx];

    const tds = Array.from(tr.querySelectorAll('td, th'));
    if (tds.length <= colMachine) continue;

    // Check if row is a sub-header or title span
    const rowText = tr.textContent?.trim() || '';
    if (rowText.includes('機種名') && rowText.includes('差枚')) continue;
    if (rowText.includes('平均') && !rowText.match(/\d+番/)) continue;
    if (rowText.includes('合計') && !rowText.match(/\d+番/)) continue;

    const machText = tds[colMachine]?.textContent?.trim() || '';
    const machNum = parseInt(machText.replace(/[^0-9]/g, ''), 10);
    if (isNaN(machNum) || machNum <= 0 || machNum > 99999) continue;

    const rawModelName = (colModel !== -1 && tds[colModel] ? tds[colModel]?.textContent?.trim() : '') || '不明機種';
    if (rawModelName.includes('機種名') || rawModelName === '機種' || rawModelName === '合計' || rawModelName === '平均') {
      continue;
    }
    const modelName = rawModelName;

    const diffText = (colDiff !== -1 && tds[colDiff] ? tds[colDiff]?.textContent?.trim() : '') || '0';
    const diff = parseInt(diffText.replace(/[,+"]/g, '').replace(/▲/g, '-'), 10) || 0;

    const gamesText = (colGames !== -1 && tds[colGames] ? tds[colGames]?.textContent?.trim() : '') || '0';
    const games = parseInt(gamesText.replace(/[,+Gg"]/g, ''), 10) || 0;

    let payoutRate: number | undefined;
    if (colPayout !== -1 && tds[colPayout]) {
      const pText = tds[colPayout].textContent?.trim() || '';
      const pVal = parseFloat(pText.replace(/[^0-9.]/g, ''));
      if (!isNaN(pVal) && pVal > 0) {
        payoutRate = pVal <= 2.5 ? Math.round(pVal * 1000) / 10 : Math.round(pVal * 10) / 10;
      }
    } else if (games > 200) {
      // Calculate derived payout rate if games > 200
      const inCoins = games * 3;
      const outCoins = inCoins + diff;
      if (inCoins > 0) {
        payoutRate = Math.round((outCoins / inCoins) * 1000) / 10;
      }
    }

    const bb = colBb !== -1 && tds[colBb] ? parseInt(tds[colBb].textContent?.replace(/[^0-9]/g, '') || '0', 10) || undefined : undefined;
    const rb = colRb !== -1 && tds[colRb] ? parseInt(tds[colRb].textContent?.replace(/[^0-9]/g, '') || '0', 10) || undefined : undefined;

    // Look for link in any cell of this row
    const refLink = tr.querySelector('a')?.getAttribute('href') || undefined;

    let dateStr = fallbackDate;
    if (colDate !== -1 && tds[colDate]) {
      const dText = tds[colDate].textContent?.trim() || '';
      const normD = normalizeDateString(dText);
      if (normD) dateStr = normD;
    }

    let storeName = fallbackStore;
    if (colStore !== -1 && tds[colStore]) {
      const sText = tds[colStore].textContent?.trim() || '';
      if (sText) storeName = sText;
    }

    const sMach = String(machNum);
    const isZoro = sMach.length >= 2 && sMach.split('').every((c) => c === sMach[0]);
    const tailDigit = machNum % 10;

    parsedRows.push({
      machine: {
        machineNum: machNum,
        modelName,
        diff,
        games,
        payoutRate,
        refUrl: refLink,
        bb,
        rb,
        isZoro,
        tailDigit,
      },
      date: dateStr,
      store: storeName,
    });
  }

  if (parsedRows.length === 0) return [];

  // Group by date
  const byDate = new Map<string, { machines: DailyMachineRecord[]; storeName: string }>();
  parsedRows.forEach((p) => {
    if (!byDate.has(p.date)) {
      byDate.set(p.date, { machines: [], storeName: p.store });
    }
    byDate.get(p.date)!.machines.push(p.machine);
  });

  return Array.from(byDate.entries()).map(([d, val]) => ({
    date: d,
    machines: val.machines,
    storeName: val.storeName,
  }));
}

/**
 * Parses lend and exchange coin rates per 1,000 yen from exchange rate string.
 * Examples:
 *  "50枚貸/56枚交換" -> { rateLend: 50, rateExchange: 56 }
 *  "46枚貸/52枚交換" -> { rateLend: 46, rateExchange: 52 }
 *  "50枚貸/50枚等価" -> { rateLend: 50, rateExchange: 50 }
 *  "46枚貸/等価" -> { rateLend: 46, rateExchange: 46 }
 *  "50枚等価" -> { rateLend: 50, rateExchange: 50 }
 */
export function parseRatesFromExchangeRate(exchangeRateStr: string): { rateLend: number; rateExchange: number } {
  let rateLend = 46;
  let rateExchange = 52;

  if (!exchangeRateStr) {
    return { rateLend, rateExchange };
  }

  const clean = exchangeRateStr.trim();

  // Pattern with slash: "50枚貸/56枚交換", "46/52", "50枚貸/等価", "46枚貸/50枚等価"
  const slashParts = clean.split(/[\/／]/);
  if (slashParts.length >= 2) {
    const lendPart = slashParts[0];
    const exchPart = slashParts[1];

    const lendDigits = lendPart.match(/(\d+)/);
    if (lendDigits) {
      rateLend = parseInt(lendDigits[1], 10);
    }

    const exchDigits = exchPart.match(/(\d+)/);
    if (exchDigits) {
      rateExchange = parseInt(exchDigits[1], 10);
    } else if (exchPart.includes('等価')) {
      rateExchange = rateLend;
    }
    return { rateLend, rateExchange };
  }

  // Without slash:
  const lendMatch = clean.match(/(\d+)\s*枚(?:貸|貸出)/) || clean.match(/(?:貸出|貸)\s*[:：]?\s*(\d+)/);
  if (lendMatch) {
    rateLend = parseInt(lendMatch[1], 10);
  }

  const exchMatch = clean.match(/(\d+)\s*枚\s*(?:交換|等価)/) || clean.match(/(?:交換|換金)\s*[:：]?\s*(\d+)/);
  if (exchMatch) {
    rateExchange = parseInt(exchMatch[1], 10);
  } else if (clean.includes('等価')) {
    rateExchange = rateLend;
  }

  return { rateLend, rateExchange };
}

interface ParsedMachineRecord {
  machineNum: number;
  modelName: string;
  games: number;
  diff: number;
  bb: number;
  rb: number;
  isZoro: boolean;
  tailDigit: number;
}

/**
 * Parses Ana-slo (アナスロ: ana-slo.com) daily data HTML pages.
 * Supports:
 *  - Store Name extraction from tag links, entry-title, title, or SingleFile URL.
 *  - Date and Day of Week extraction.
 *  - Detailed per-machine data from <h2 id="machine_list">詳細データ</h2> and variety sections.
 *  - Model statistics (average diff, total diff, games, win rates, machine count).
 *  - Tail number analytics from machine data and <table id="last_digit_data_table">.
 *  - Complete hall-wide overall summary.
 */
export function parseAnaSloDailyHtml(
  doc: Document,
  rawHtml: string,
  fileName: string = ''
): ParseHtmlResult {
  const errors: string[] = [];

  // 1. Extract Store Name
  let storeName = '';

  // 1A. Tag link: e.g. <a href="https://ana-slo.com/tag/みとや大森町店/" rel="tag">みとや大森町店</a>
  const tagLink = doc.querySelector('a[rel="tag"][href*="/tag/"]');
  if (tagLink) {
    const text = tagLink.textContent?.trim() || '';
    if (text) {
      storeName = text;
    }
  }

  // 1B. Breadcrumb tag link
  if (!storeName) {
    const bTag = doc.querySelector('.tagst a[href*="/tag/"]');
    if (bTag) {
      const text = bTag.textContent?.trim() || '';
      if (text) {
        storeName = text;
      }
    }
  }

  // 1C. h1.entry-title or .entry-title
  // Format: "2026/09/22 みとや大森町店 データまとめ"
  if (!storeName) {
    const h1 = doc.querySelector('h1.entry-title, .entry-title, h1');
    if (h1) {
      const h1Text = h1.textContent?.trim() || '';
      const match = h1Text.match(/(?:202\d[年/-]\d{1,2}[月/-]\d{1,2}[日]?)\s+(.+?)\s*(?:データまとめ|データ|\-|$)/);
      if (match) {
        storeName = match[1].trim();
      }
    }
  }

  // 1D. <title> or <meta property="og:title">
  // Format: "2026/09/22 みとや大森町店 データまとめ - アナスロ"
  if (!storeName) {
    const titleText = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || '';
    if (titleText) {
      const match = titleText.match(/(?:202\d[年/-]\d{1,2}[月/-]\d{1,2}[日]?)\s+(.+?)\s*(?:データまとめ|データ|\-|$)/);
      if (match) {
        storeName = match[1].trim();
      } else {
        const cleaned = titleText
          .replace(/\s*[-–|]\s*(?:アナスロ|スロレポ).*$/i, '')
          .replace(/202\d[年/-]\d{1,2}[月/-]\d{1,2}[日]?/g, '')
          .replace(/データまとめ/g, '')
          .trim();
        if (cleaned.length > 1) {
          storeName = cleaned;
        }
      }
    }
  }

  // 1E. Canonical or SingleFile URL: e.g. https://ana-slo.com/2026-09-22-%e3%81%bf%e3%81%a8%e3%82%84%e5%a4%a7%e6%a3%ae%e7%94%ba%e5%ba%97-data/
  if (!storeName) {
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    const urlText = canonical + ' ' + rawHtml.slice(0, 5000);
    const urlMatch = urlText.match(/202\d-\d{1,2}-\d{1,2}-([^\s/]+)-data/);
    if (urlMatch) {
      try {
        const decoded = decodeURIComponent(urlMatch[1]).replace(/[-_]/g, ' ').trim();
        if (decoded) {
          storeName = decoded;
        }
      } catch {
        // ignore decode failure
      }
    }
  }

  // 1F. Fallback filename
  if (!storeName && fileName) {
    const cleanFileName = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/202\d[-_.]?\d{1,2}[-_.]?\d{1,2}/g, '')
      .replace(/データまとめ|アナスロ|data/gi, '')
      .replace(/[_\-\s]+/g, ' ')
      .trim();
    if (cleanFileName.length > 1) {
      storeName = cleanFileName;
    }
  }

  if (!storeName) {
    storeName = 'アナスロ登録店舗';
  }

  // 2. Extract Date & Day of Week
  let dateStr = '';
  let dayOfWeek = '日';

  const dateSearchText =
    (doc.querySelector('h1.entry-title')?.textContent || '') +
    ' ' +
    (doc.title || '') +
    ' ' +
    (fileName || '') +
    ' ' +
    rawHtml.slice(0, 10000);

  const dMatch1 = dateSearchText.match(/(202\d)[年/-](\d{1,2})[月/-](\d{1,2})/);
  const dMatch2 = dateSearchText.match(/(202\d)\.(\d{1,2})\.(\d{1,2})/);
  const dMatch3 = dateSearchText.match(/(202\d)-(\d{2})-(\d{2})/);

  if (dMatch1) {
    const y = parseInt(dMatch1[1], 10);
    const m = parseInt(dMatch1[2], 10);
    const d = parseInt(dMatch1[3], 10);
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } else if (dMatch2) {
    const y = parseInt(dMatch2[1], 10);
    const m = parseInt(dMatch2[2], 10);
    const d = parseInt(dMatch2[3], 10);
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } else if (dMatch3) {
    dateStr = `${dMatch3[1]}-${dMatch3[2]}-${dMatch3[3]}`;
  }

  if (!dateStr) {
    errors.push(`HTML (${fileName || 'アナスロファイル'}) から日付を特定できませんでした。`);
    return {
      success: false,
      errors,
      totalRecordsCount: 0,
    };
  }

  const calcDow = calculateDayOfWeek(dateStr);
  if (calcDow) {
    dayOfWeek = calcDow;
  }
  const dowMatch = dateSearchText.match(/[\(（]([日月火水木金土])[\)）]/);
  if (dowMatch) {
    dayOfWeek = dowMatch[1];
  }

  // 3. Extract Detailed Machine & Model Data
  const allParsedMachines: ParsedMachineRecord[] = [];
  const parsedModels: DailyModelRecord[] = [];

  // Query all headings in the document that represent models
  const allHeadings = Array.from(doc.querySelectorAll('h4'));
  const modelHeadings = allHeadings.filter((h) => {
    const id = h.id || '';
    if (id.startsWith('last_digit_section')) return false;
    return id.startsWith('section') || h.textContent?.includes('設置');
  });

  modelHeadings.forEach((h4) => {
    const headingTitle = h4.textContent?.trim() || '';
    if (!headingTitle || headingTitle.includes('全データ一覧')) return;

    const isVariety = headingTitle.includes('1台設置') || headingTitle.includes('バラエティ');

    // Find the table associated with this h4
    let curr: Element | null = h4.nextElementSibling;
    let table: HTMLTableElement | null = null;
    while (curr && curr.tagName !== 'H4' && curr.tagName !== 'H2') {
      const found = curr.tagName === 'TABLE' ? (curr as HTMLTableElement) : curr.querySelector('table');
      if (found) {
        table = found;
        break;
      }
      curr = curr.nextElementSibling;
    }

    if (!table) return;

    if (isVariety) {
      // 1台設置機種 table: each row is an individual model
      // Format: <th class=fixed01>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th>
      const rows = Array.from(table.querySelectorAll('tr'));
      rows.forEach((row) => {
        if (row.querySelector('th')) return;
        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length >= 4) {
          const mName = tds[0].textContent?.trim() || '';
          if (!mName || mName.includes('機種名') || mName.includes('平均')) return;

          const machNum = parseInt(tds[1].textContent?.trim() || '0', 10);
          const games = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const diff = parseInt(tds[3].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const bb = tds.length > 4 ? parseInt(tds[4].textContent?.replace(/[,+]/g, '').trim() || '0', 10) : 0;
          const rb = tds.length > 5 ? parseInt(tds[5].textContent?.replace(/[,+]/g, '').trim() || '0', 10) : 0;

          const tailDigit = machNum % 10;
          const sMach = String(machNum);
          const isZoro = sMach.length >= 2 && sMach.split('').every((c) => c === sMach[0]);

          allParsedMachines.push({
            machineNum: machNum,
            modelName: mName,
            games,
            diff,
            bb,
            rb,
            isZoro,
            tailDigit,
          });

          parsedModels.push({
            modelName: mName,
            avgDiffCoins: diff,
            totalDiffCoins: diff,
            avgGames: games,
            winMachines: diff > 0 ? 1 : 0,
            totalMachines: 1,
            winRate: diff > 0 ? 100 : 0,
            isSmallCount: true,
          });
        }
      });
    } else {
      // Multi-machine model section
      const modelName = headingTitle;
      const rows = Array.from(table.querySelectorAll('tr'));

      let modelTotalGames = 0;
      let modelTotalDiff = 0;
      let modelWinCount = 0;
      let modelMachineCount = 0;

      rows.forEach((row) => {
        if (row.querySelector('th')) return;
        if (row.id === 'avg_data_rows' || row.textContent?.includes('平均')) return;

        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length >= 3) {
          const machNum = parseInt(tds[0].textContent?.trim() || '0', 10);
          const games = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const diff = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const bb = tds.length > 3 ? parseInt(tds[3].textContent?.replace(/[,+]/g, '').trim() || '0', 10) : 0;
          const rb = tds.length > 4 ? parseInt(tds[4].textContent?.replace(/[,+]/g, '').trim() || '0', 10) : 0;

          const tailDigit = machNum % 10;
          const sMach = String(machNum);
          const isZoro = sMach.length >= 2 && sMach.split('').every((c) => c === sMach[0]);

          modelMachineCount++;
          modelTotalGames += games;
          modelTotalDiff += diff;
          if (diff > 0) modelWinCount++;

          allParsedMachines.push({
            machineNum: machNum,
            modelName,
            games,
            diff,
            bb,
            rb,
            isZoro,
            tailDigit,
          });
        }
      });

      if (modelMachineCount > 0) {
        const mAvgDiff = Math.round(modelTotalDiff / modelMachineCount);
        const mAvgGames = Math.round(modelTotalGames / modelMachineCount);
        const mWinRate = Math.round((modelWinCount / modelMachineCount) * 1000) / 10;

        parsedModels.push({
          modelName,
          avgDiffCoins: mAvgDiff,
          totalDiffCoins: modelTotalDiff,
          avgGames: mAvgGames,
          winMachines: modelWinCount,
          totalMachines: modelMachineCount,
          winRate: mWinRate,
          isSmallCount: modelMachineCount <= 2,
        });
      }
    }
  });

  // 3B. Fallback if detailed section tables were not present: check "機種別データピックアップ"
  if (parsedModels.length === 0) {
    const pickupHeadings = Array.from(doc.querySelectorAll('h2, h3, h4'));
    const pickupH2 = pickupHeadings.find((h) => h.textContent?.includes('データピックアップ'));
    if (pickupH2) {
      let curr = pickupH2.nextElementSibling;
      while (curr && curr.tagName !== 'H2') {
        const pTitle = curr.querySelector('p');
        const tbl = curr.tagName === 'TABLE' ? (curr as HTMLTableElement) : curr.querySelector('table');
        if (pTitle && tbl) {
          const mNameMatch = pTitle.textContent?.match(/(?:\d+位[：:])?\s*(.+)$/);
          const mName = mNameMatch ? mNameMatch[1].trim() : pTitle.textContent?.trim() || '';
          const dataTds = Array.from(tbl.querySelectorAll('tr:nth-child(2) td, tr:not(:has(th)) td'));
          if (dataTds.length >= 4) {
            const totDiff = parseInt(dataTds[0].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const avgDiff = parseInt(dataTds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const avgG = parseInt(dataTds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const wrTxt = dataTds[3].textContent?.trim() || '';

            let winM = 0;
            let totM = 1;
            const slashM = wrTxt.match(/(\d+)\s*[\/／]\s*(\d+)/);
            if (slashM) {
              winM = parseInt(slashM[1], 10);
              totM = parseInt(slashM[2], 10);
            }
            const winR = totM > 0 ? Math.round((winM / totM) * 1000) / 10 : null;

            parsedModels.push({
              modelName: mName,
              avgDiffCoins: avgDiff,
              totalDiffCoins: totDiff,
              avgGames: avgG,
              winMachines: winM,
              totalMachines: totM,
              winRate: winR,
              isSmallCount: totM <= 2,
            });
          }
        }
        curr = curr.nextElementSibling;
      }
    }
  }

  // 4. Calculate Hall-Wide Overall Summary (全体結果)
  let totalMachines = 0;
  let winMachines: number | null = null;
  let totalDiffCoins = 0;
  let avgDiffCoins = 0;
  let avgGames = 0;
  let winRate: number | null = null;

  if (allParsedMachines.length > 0) {
    totalMachines = allParsedMachines.length;
    const wins = allParsedMachines.filter((m) => m.diff > 0).length;
    winMachines = wins;
    totalDiffCoins = allParsedMachines.reduce((sum, m) => sum + m.diff, 0);
    const totalGames = allParsedMachines.reduce((sum, m) => sum + m.games, 0);
    avgDiffCoins = Math.round(totalDiffCoins / totalMachines);
    avgGames = Math.round(totalGames / totalMachines);
    winRate = Math.round((wins / totalMachines) * 1000) / 10;
  } else if (parsedModels.length > 0) {
    totalMachines = parsedModels.reduce((sum, m) => sum + m.totalMachines, 0);
    const wins = parsedModels.reduce((sum, m) => sum + m.winMachines, 0);
    winMachines = wins;
    totalDiffCoins = parsedModels.reduce((sum, m) => sum + m.totalDiffCoins, 0);
    const totalGames = parsedModels.reduce((sum, m) => sum + m.avgGames * m.totalMachines, 0);
    avgDiffCoins = totalMachines > 0 ? Math.round(totalDiffCoins / totalMachines) : 0;
    avgGames = totalMachines > 0 ? Math.round(totalGames / totalMachines) : 0;
    winRate = totalMachines > 0 ? Math.round((wins / totalMachines) * 1000) / 10 : null;
  } else {
    totalMachines = 160;
  }

  // 5. Tail Number Analysis (末尾別結果)
  const parsedTails: DailyTailRecord[] = [];

  // Derive tails 0..9 directly from machine data for exact numbers
  for (let t = 0; t <= 9; t++) {
    const matching = allParsedMachines.filter((m) => m.tailDigit === t);
    if (matching.length > 0) {
      const tTotDiff = matching.reduce((sum, m) => sum + m.diff, 0);
      const tTotGames = matching.reduce((sum, m) => sum + m.games, 0);
      const tWins = matching.filter((m) => m.diff > 0).length;
      const tAvgDiff = Math.round(tTotDiff / matching.length);
      const tAvgGames = Math.round(tTotGames / matching.length);
      const tWinRate = Math.round((tWins / matching.length) * 1000) / 10;

      parsedTails.push({
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

  // Zoro tail (ゾロ目)
  // Check if h4#last_digit_section10 (末尾ゾロ目) is present with specific machine numbers
  const zoroH4 = Array.from(doc.querySelectorAll('h4[id*="last_digit"], h4')).find((h) => h.textContent?.includes('ゾロ目'));
  const zoroMachNums: number[] = [];
  if (zoroH4) {
    let curr = zoroH4.nextElementSibling;
    while (curr && curr.tagName !== 'H4' && curr.tagName !== 'H2') {
      const tbl = curr.tagName === 'TABLE' ? (curr as HTMLTableElement) : curr.querySelector('table');
      if (tbl) {
        const rows = Array.from(tbl.querySelectorAll('tr'));
        rows.forEach((r) => {
          if (r.querySelector('th')) return;
          const tds = Array.from(r.querySelectorAll('td'));
          // In tail detail tables, td[1] is machine number (台番号), or td[0] if single column
          const numStr = (tds.length >= 2 ? tds[1].textContent : tds[0]?.textContent) || '0';
          const num = parseInt(numStr.trim(), 10);
          if (num > 0) zoroMachNums.push(num);
        });
        break;
      }
      curr = curr.nextElementSibling;
    }
  }

  const zoroMatches = zoroMachNums.length > 0
    ? allParsedMachines.filter((m) => zoroMachNums.includes(m.machineNum))
    : allParsedMachines.filter((m) => m.isZoro);

  if (zoroMatches.length > 0) {
    const zTotDiff = zoroMatches.reduce((sum, m) => sum + m.diff, 0);
    const zTotGames = zoroMatches.reduce((sum, m) => sum + m.games, 0);
    const zWins = zoroMatches.filter((m) => m.diff > 0).length;
    const zAvgDiff = Math.round(zTotDiff / zoroMatches.length);
    const zAvgGames = Math.round(zTotGames / zoroMatches.length);
    const zWinRate = Math.round((zWins / zoroMatches.length) * 1000) / 10;

    parsedTails.push({
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

  // Fallback if allParsedMachines was empty: parse table#last_digit_data_table directly
  if (parsedTails.length === 0) {
    const lastDigitTable = doc.querySelector('table#last_digit_data_table, #last_digit_list table');
    if (lastDigitTable) {
      const rows = Array.from(lastDigitTable.querySelectorAll('tr'));
      rows.forEach((row) => {
        if (row.querySelector('th')) return;
        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length >= 4) {
          const tailTxt = tds[0].textContent?.trim() || '';
          const totDiff = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const avgDiff = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const avgG = parseInt(tds[3].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const wrTxt = tds[4]?.textContent?.trim() || '';

          let tWin = 0;
          let tTot = 1;
          const sMatch = wrTxt.match(/(\d+)\s*[\/／]\s*(\d+)/);
          if (sMatch) {
            tWin = parseInt(sMatch[1], 10);
            tTot = parseInt(sMatch[2], 10);
          }
          const tWinRate = tTot > 0 ? Math.round((tWin / tTot) * 1000) / 10 : null;
          const numMatch = tailTxt.match(/\d+/);
          const tailNum = numMatch ? parseInt(numMatch[0], 10) : null;
          const tailName = tailNum !== null ? `末尾${tailNum}` : tailTxt;

          parsedTails.push({
            tailName,
            tailNum,
            avgDiffCoins: avgDiff,
            totalDiffCoins: totDiff || avgDiff * tTot,
            avgGames: avgG,
            winMachines: tWin,
            totalMachines: tTot,
            winRate: tWinRate,
          });
        }
      });
    }
  }

  // 6. Notable / Top Models Pickup
  const positiveModels = [...parsedModels]
    .filter((m) => m.avgDiffCoins > 0)
    .sort((a, b) => b.avgDiffCoins - a.avgDiffCoins);

  const notable =
    positiveModels
      .slice(0, 4)
      .map((m) => `${m.modelName.replace(/^L|スマスロ|パチスロ/g, '')}(+${m.avgDiffCoins.toLocaleString()})`)
      .join('、') || '出玉データあり';

  // 7. Store Profile & Default Rates
  let address = '東京都';
  const catSpans = Array.from(
    doc.querySelectorAll('.st-catgroup a span, #breadcrumb a span, a[rel="category tag"], a[href*="/category/"]')
  );
  for (const span of catSpans) {
    const txt = span.textContent?.trim() || '';
    if (/(東京都|北海道|京都府|大阪府|.{2,3}県)/.test(txt)) {
      address = txt;
      break;
    }
  }

  let oldEventDays = '7のつく日';
  if (storeName.includes('みとや')) {
    oldEventDays = '3のつく日・8のつく日・月日ゾロ目・11日・22日';
  } else if (storeName.includes('7')) {
    oldEventDays = '7のつく日';
  } else if (storeName.includes('5')) {
    oldEventDays = '5のつく日';
  } else if (storeName.includes('3')) {
    oldEventDays = '3のつく日';
  } else if (storeName.includes('0')) {
    oldEventDays = '0のつく日';
  } else if (storeName.includes('1')) {
    oldEventDays = '1のつく日';
  } else if (storeName.includes('6')) {
    oldEventDays = '6のつく日';
  } else if (storeName.includes('8')) {
    oldEventDays = '8のつく日';
  }

  const exchangeRateStr = '46枚貸/52枚交換';
  const { rateLend, rateExchange } = parseRatesFromExchangeRate(exchangeRateStr);
  const specialDayRules: SpecialDayRules = parseSpecialDayRulesFromText(oldEventDays);

  const isOldEventDay = isDateSpecialDay(dateStr, specialDayRules);
  const day = parseInt(dateStr.split('-')[2], 10);
  const is7Day = day % 10 === 7;

  const [yearStr, monthStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const yearMonth = `${yearStr}-${monthStr}`;

  const dailyRecord: DailyRecord = {
    date: dateStr,
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
    is7Day,
    notable,
    models: parsedModels,
    tails: parsedTails,
    machines: allParsedMachines,
  };

  const processed = processStoreData([dailyRecord], rateLend, rateExchange, 35, specialDayRules);

  const storeProfile: StoreProfile = {
    id: `store-${storeName.replace(/[\s\u3000]+/g, '-').toLowerCase()}`,
    name: storeName,
    address,
    oldEventDays,
    exchangeRate: exchangeRateStr,
    rateLend,
    rateExchange,
    cashRatio: 35,
    totalMachinesApprox: totalMachines,
    dataRange: dateStr,
    specialDayRules,
    dailyRecords: processed.dailyRecords,
  };

  return {
    success: true,
    store: storeProfile,
    errors: [],
    totalRecordsCount: 1,
  };
}

/**
 * Parses a Slorepo daily report page (日別出玉データ).
 * Extracts store name, date, overall results (全体結果: 総差枚, 平均差枚, 平均G数, 勝率),
 * model breakdown (機種別データ & 少台数機種), tail results (末尾別結果), and top pickup models.
 */
export function parseSlorepoDailyHtml(doc: Document, rawHtml: string, fileName: string = ''): ParseHtmlResult {
  // Delegate if this is an Ana-slo format page
  if (
    rawHtml.includes('ana-slo.com') ||
    rawHtml.includes('アナスロ') ||
    doc.querySelector('#last_digit_data_table') !== null ||
    doc.querySelector('#machine_list') !== null
  ) {
    return parseAnaSloDailyHtml(doc, rawHtml, fileName);
  }

  const errors: string[] = [];

  // 1. Extract Store Name
  let storeName = '';

  // Breadcrumbs check: e.g. HOME > 東京都 > マルハンメガシティ2000蒲田7 > 2026-9-20
  const breadcrumbItems = Array.from(
    doc.querySelectorAll('ol.breadcrumb li, .breadcrumb li, [itemprop="itemListElement"]')
  );
  if (breadcrumbItems.length >= 2) {
    for (let i = breadcrumbItems.length - 1; i >= 0; i--) {
      const txt = breadcrumbItems[i].textContent?.trim() || '';
      if (
        !txt ||
        txt.includes('HOME') ||
        txt.match(/202\d/) ||
        txt.match(/^(?:東京都|大阪府|京都府|北海道|.{2,3}県)$/)
      ) {
        continue;
      }
      storeName = txt;
      break;
    }
  }

  // h4.title check: e.g. 2026/9/20(日)<br>マルハンメガシティ2000蒲田7
  if (!storeName) {
    const h4 = doc.querySelector('h4.title, h1, h2, .shop-name, .store-name');
    if (h4) {
      const parts = h4.innerHTML.split(/<br\s*\/?>/i);
      if (parts.length >= 2) {
        storeName = parts[1].replace(/<[^>]*>/g, '').trim();
      } else {
        const text = h4.textContent?.trim() || '';
        const match = text.match(/(?:202\d[^\s]+)\s+(.+)$/);
        if (match) {
          storeName = match[1].trim();
        } else if (!text.match(/^202\d/)) {
          storeName = text;
        }
      }
    }
  }

  if (!storeName && doc.title) {
    const cleanedTitle = doc.title
      .replace(/\s*[-–|]\s*(?:スロレポ|みんレポ|アナスロ).*$/i, '')
      .replace(/202\d[年/-]\d{1,2}[月/-]\d{1,2}[日]?/g, '')
      .replace(/[\(（][日月火水木金土][\)）]/g, '')
      .trim();
    if (cleanedTitle.length > 1) {
      storeName = cleanedTitle;
    }
  }

  // Check file name if storeName is still empty
  if (!storeName && fileName) {
    const cleanFileName = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/202\d[-_.]?\d{1,2}[-_.]?\d{1,2}/g, '')
      .replace(/[_\-\s]+/g, ' ')
      .trim();
    if (cleanFileName.length > 2) {
      storeName = cleanFileName;
    }
  }

  if (!storeName) {
    storeName = 'スロレポ登録店舗';
  }

  // 2. Extract Date and Day of Week
  let dateStr = '';
  let dayOfWeek = '日';

  const textForDate =
    (doc.querySelector('h4.title')?.textContent || '') +
    ' ' +
    (doc.title || '') +
    ' ' +
    (fileName || '') +
    ' ' +
    rawHtml.slice(0, 20000);

  // Pattern 1: YYYY年MM月DD日 or YYYY/MM/DD or YYYY-MM-DD
  const dateMatch1 = textForDate.match(/(202\d)[年/-](\d{1,2})[月/-](\d{1,2})/);
  // Pattern 2: YYYY.MM.DD
  const dateMatch2 = textForDate.match(/(202\d)\.(\d{1,2})\.(\d{1,2})/);
  // Pattern 3: YYYYMMDD in filename or text
  const dateMatch3 = (fileName + ' ' + textForDate).match(/(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);

  if (dateMatch1) {
    const y = parseInt(dateMatch1[1], 10);
    const m = parseInt(dateMatch1[2], 10);
    const d = parseInt(dateMatch1[3], 10);
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cdow = calculateDayOfWeek(dateStr);
    if (cdow) dayOfWeek = cdow;
  } else if (dateMatch2) {
    const y = parseInt(dateMatch2[1], 10);
    const m = parseInt(dateMatch2[2], 10);
    const d = parseInt(dateMatch2[3], 10);
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cdow = calculateDayOfWeek(dateStr);
    if (cdow) dayOfWeek = cdow;
  } else if (dateMatch3) {
    const y = parseInt(dateMatch3[1], 10);
    const m = parseInt(dateMatch3[2], 10);
    const d = parseInt(dateMatch3[3], 10);
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cdow = calculateDayOfWeek(dateStr);
    if (cdow) dayOfWeek = cdow;
  }

  // Also check <meta> time or <time> tag
  if (!dateStr) {
    const timeEl = doc.querySelector('time[datetime], meta[property="article:published_time"]');
    const attr = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('content') || '';
    const m = attr.match(/(202\d)[-_.]?(\d{2})[-_.]?(\d{2})/);
    if (m) {
      dateStr = `${m[1]}-${m[2]}-${m[3]}`;
      const cdow = calculateDayOfWeek(dateStr);
      if (cdow) dayOfWeek = cdow;
    }
  }

  const dowMatch = textForDate.match(/[\(（]([日月火水木金土])[\)）]/);
  if (dowMatch) {
    dayOfWeek = dowMatch[1];
  }

  if (!dateStr) {
    errors.push(`HTML (${fileName || 'ファイル'}) から日付を抽出できませんでした。`);
    return {
      success: false,
      errors,
      totalRecordsCount: 0,
    };
  }

  // 3. Extract 全体結果 (Overall Summary)
  let totalDiffCoins = 0;
  let avgDiffCoins = 0;
  let avgGames = 0;
  let winMachines: number | null = null;
  let totalMachines = 0;
  let winRate: number | null = null;

  const allTables = Array.from(doc.querySelectorAll('table'));
  for (const table of allTables) {
    const text = table.textContent || '';
    if (text.includes('差枚') && (text.includes('平均') || text.includes('勝率') || text.includes('G数'))) {
      const rows = Array.from(table.querySelectorAll('tr'));
      for (const row of rows) {
        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length >= 3) {
          totalDiffCoins = parseInt(tds[0].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          avgDiffCoins = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          avgGames = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);

          if (tds.length >= 4) {
            const wrText = tds[3].textContent?.trim() || '';
            const slashMatch = wrText.match(/(\d+)\s*[\/／]\s*(\d+)/);
            if (slashMatch) {
              winMachines = parseInt(slashMatch[1], 10);
              totalMachines = parseInt(slashMatch[2], 10);
              winRate = totalMachines > 0 ? Math.round((winMachines / totalMachines) * 1000) / 10 : null;
            } else {
              const pctMatch = wrText.match(/(\d+(?:\.\d+)?)\s*%/);
              if (pctMatch) {
                winRate = parseFloat(pctMatch[1]);
              }
            }
          }
          break;
        }
      }
      break;
    }
  }

  // 4. Extract 機種別データ (Model Breakdown) & 少台数機種 (Small Count Models)
  const parsedModels: DailyModelRecord[] = [];
  const parsedTails: DailyTailRecord[] = [];

  const headings = Array.from(doc.querySelectorAll('h4, h5, h6, figure, div, p'));
  for (const h of headings) {
    const headingText = h.textContent?.trim() || '';
    const isMainModel = headingText.includes('機種別データ');
    const isSmallModel = headingText.includes('少台数機種');

    if (isMainModel || isSmallModel) {
      let nextEl = h.nextElementSibling;
      while (nextEl && !nextEl.querySelector('table') && nextEl.tagName !== 'TABLE') {
        nextEl = nextEl.nextElementSibling;
      }
      const table = nextEl?.tagName === 'TABLE' ? (nextEl as HTMLTableElement) : nextEl?.querySelector('table');
      if (table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        for (const row of rows) {
          if (row.querySelector('th')) continue;
          const tds = Array.from(row.querySelectorAll('td'));
          if (tds.length >= 4) {
            const modelName = tds[0].textContent?.trim() || '';
            if (!modelName || modelName === '機種') continue;

            const diff = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const games = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const wrText = tds[3].textContent?.trim() || '';

            let mWin = 0;
            let mTot = 1;
            const mMatch = wrText.match(/(\d+)\s*[\/／]\s*(\d+)/);
            if (mMatch) {
              mWin = parseInt(mMatch[1], 10);
              mTot = parseInt(mMatch[2], 10);
            }
            const mWinRate = mTot > 0 ? Math.round((mWin / mTot) * 1000) / 10 : null;

            parsedModels.push({
              modelName,
              avgDiffCoins: diff,
              totalDiffCoins: diff * mTot,
              avgGames: games,
              winMachines: mWin,
              totalMachines: mTot,
              winRate: mWinRate,
              isSmallCount: isSmallModel || mTot <= 2,
            });
          }
        }
      }
    }

    // 5. Extract 末尾別結果 (Tail Results)
    if (headingText.includes('末尾別結果')) {
      let nextEl = h.nextElementSibling;
      while (nextEl && !nextEl.querySelector('table') && nextEl.tagName !== 'TABLE') {
        nextEl = nextEl.nextElementSibling;
      }
      const table = nextEl?.tagName === 'TABLE' ? (nextEl as HTMLTableElement) : nextEl?.querySelector('table');
      if (table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        for (const row of rows) {
          if (row.querySelector('th')) continue;
          const tds = Array.from(row.querySelectorAll('td'));
          if (tds.length >= 4) {
            const tailName = tds[0].textContent?.trim() || '';
            if (!tailName || tailName === '末尾番号') continue;

            const diff = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const games = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
            const wrText = tds[3].textContent?.trim() || '';

            let tWin = 0;
            let tTot = 1;
            const tMatch = wrText.match(/(\d+)\s*[\/／]\s*(\d+)/);
            if (tMatch) {
              tWin = parseInt(tMatch[1], 10);
              tTot = parseInt(tMatch[2], 10);
            }
            const tWinRate = tTot > 0 ? Math.round((tWin / tTot) * 1000) / 10 : null;
            const numMatch = tailName.match(/\d+/);
            const tailNum = numMatch ? parseInt(numMatch[0], 10) : null;

            parsedTails.push({
              tailName,
              tailNum,
              avgDiffCoins: diff,
              totalDiffCoins: diff * tTot,
              avgGames: games,
              winMachines: tWin,
              totalMachines: tTot,
              winRate: tWinRate,
            });
          }
        }
      }
    }
  }

  // テーブル3から機種別データを取得するフォールバック
  if (parsedModels.length === 0 && allTables.length >= 3) {
    const table3 = allTables[2];
    const rows = Array.from(table3.querySelectorAll('tr'));
    for (const row of rows) {
      if (row.querySelector('th')) continue;
      const tds = Array.from(row.querySelectorAll('td'));
      if (tds.length >= 3) {
        const modelName = tds[0].textContent?.trim() || '';
        if (!modelName || modelName.includes('機種') || modelName.includes('平均') || modelName.includes('合計')) continue;
        const diff = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
        const games = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
        let mWin = 0;
        let mTot = 1;
        let mWinRate: number | null = null;
        if (tds.length >= 4) {
          const wrText = tds[3].textContent?.trim() || '';
          const mMatch = wrText.match(/(\d+)\s*[\/／]\s*(\d+)/);
          if (mMatch) {
            mWin = parseInt(mMatch[1], 10);
            mTot = parseInt(mMatch[2], 10);
            mWinRate = mTot > 0 ? Math.round((mWin / mTot) * 1000) / 10 : null;
          } else {
            const pMatch = wrText.match(/(\d+(?:\.\d+)?)\s*%/);
            if (pMatch) mWinRate = parseFloat(pMatch[1]);
          }
        }
        parsedModels.push({
          modelName,
          avgDiffCoins: diff,
          totalDiffCoins: diff * mTot,
          avgGames: games,
          winMachines: mWin,
          totalMachines: mTot,
          winRate: mWinRate,
          isSmallCount: mTot <= 2,
        });
      }
    }
  }

  // 5B. Extract Machine-level records from all tables containing 台番 / 台番号
  const allParsedMachines: DailyMachineRecord[] = [];
  for (const table of allTables) {
    const extractedGroups = extractMachinesFromHtmlTable(table, dateStr, storeName);
    if (extractedGroups.length > 0) {
      extractedGroups.forEach((group) => {
        group.machines.forEach((m) => allParsedMachines.push(m));
      });
    }
  }

  // If models were empty but machines were found, build models from machines
  if (parsedModels.length === 0 && allParsedMachines.length > 0) {
    const modelMap = new Map<string, DailyMachineRecord[]>();
    allParsedMachines.forEach((m) => {
      if (!modelMap.has(m.modelName)) modelMap.set(m.modelName, []);
      modelMap.get(m.modelName)!.push(m);
    });
    modelMap.forEach((list, mName) => {
      const totD = list.reduce((sum, m) => sum + m.diff, 0);
      const totG = list.reduce((sum, m) => sum + m.games, 0);
      const wins = list.filter((m) => m.diff > 0).length;
      parsedModels.push({
        modelName: mName,
        avgDiffCoins: Math.round(totD / list.length),
        totalDiffCoins: totD,
        avgGames: Math.round(totG / list.length),
        winMachines: wins,
        totalMachines: list.length,
        winRate: Math.round((wins / list.length) * 1000) / 10,
        isSmallCount: list.length <= 2,
      });
    });
  }

  // If tails were empty but machines were found, build tails from machines
  if (parsedTails.length === 0 && allParsedMachines.length > 0) {
    for (let t = 0; t <= 9; t++) {
      const matching = allParsedMachines.filter((m) => m.tailDigit === t);
      if (matching.length > 0) {
        const totD = matching.reduce((sum, m) => sum + m.diff, 0);
        const totG = matching.reduce((sum, m) => sum + m.games, 0);
        const wins = matching.filter((m) => m.diff > 0).length;
        parsedTails.push({
          tailName: `末尾${t}`,
          tailNum: t,
          avgDiffCoins: Math.round(totD / matching.length),
          totalDiffCoins: totD,
          avgGames: Math.round(totG / matching.length),
          winMachines: wins,
          totalMachines: matching.length,
          winRate: Math.round((wins / matching.length) * 1000) / 10,
        });
      }
    }
  }

  // If totalMachines was not found in overall table, calculate from parsedModels or machines
  if (totalMachines <= 0) {
    if (allParsedMachines.length > 0) {
      totalMachines = allParsedMachines.length;
    } else if (parsedModels.length > 0) {
      totalMachines = parsedModels.reduce((acc, m) => acc + m.totalMachines, 0);
    } else {
      totalMachines = 160;
    }
  }

  // 6. Notable / Top Models Pickup
  const positiveModels = [...parsedModels]
    .filter((m) => m.avgDiffCoins > 0)
    .sort((a, b) => b.avgDiffCoins - a.avgDiffCoins);

  const notable =
    positiveModels
      .slice(0, 4)
      .map((m) => `${m.modelName.replace(/^L|スマスロ|パチスロ/g, '')}(+${m.avgDiffCoins.toLocaleString()})`)
      .join('、') || '出玉データあり';

  // 7. Store Profile Setup
  const specialDayRules: SpecialDayRules = parseSpecialDayRulesFromText(
    storeName.includes('7') ? '7のつく日' : storeName.includes('5') ? '5のつく日' : '7のつく日'
  );

  const isOldEventDay = isDateSpecialDay(dateStr, specialDayRules);
  const day = parseInt(dateStr.split('-')[2], 10);
  const is7Day = day % 10 === 7;

  const [yearStr, monthStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const yearMonth = `${yearStr}-${monthStr}`;

  const dailyRecord: DailyRecord = {
    date: dateStr,
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
    payoutRate: 0,
    estimatedRevenue: 0,
    exchangeGapProfit: 0,
    gModelHallProfit: 0,
    gModelPlayerProfit: 0,
    isOldEventDay,
    is7Day,
    notable,
    models: parsedModels,
    tails: parsedTails,
    machines: allParsedMachines.length > 0 ? allParsedMachines : undefined,
  };

  const rateLend = 46;
  const rateExchange = 52;
  const processed = processStoreData([dailyRecord], rateLend, rateExchange, 35, specialDayRules);

  const storeProfile: StoreProfile = {
    id: `store-${storeName.replace(/[\s\u3000]+/g, '-').toLowerCase()}`,
    name: storeName,
    address: '住所未登録',
    oldEventDays: '7のつく日',
    exchangeRate: '46枚貸/52枚交換',
    rateLend,
    rateExchange,
    cashRatio: 35,
    totalMachinesApprox: totalMachines,
    dataRange: dateStr,
    specialDayRules,
    dailyRecords: processed.dailyRecords,
  };

  return {
    success: true,
    store: storeProfile,
    errors: [],
    totalRecordsCount: 1,
  };
}

/**
 * Parses Slorepo (スロレポ) HTML store pages.
 * Supports both Daily Report files (日別ファイル) and Store Monthly/Summary pages (店舗別月次一覧).
 */
export function parseSlorepoHtml(htmlContent: string, fileName: string = ''): ParseHtmlResult {
  const errors: string[] = [];

  try {
    // 0. Check if input is CSV or TSV format (e.g. 店舗名,日付,機種,台番,差枚,G数,出率,参照URL)
    if (isCsvOrTsv(htmlContent) || fileName.toLowerCase().endsWith('.csv') || fileName.toLowerCase().endsWith('.tsv')) {
      const csvRes = parseUnitLevelCsv(htmlContent, fileName);
      if (csvRes.success && csvRes.stores.length > 0) {
        return {
          success: true,
          store: csvRes.stores[0],
          errors: [],
          totalRecordsCount: csvRes.totalRecordsCount,
        };
      }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Check if this is an Ana-slo (アナスロ: ana-slo.com) daily report
    const bodyText = doc.body?.textContent || '';
    const isAnaSlo =
      htmlContent.includes('ana-slo.com') ||
      htmlContent.includes('アナスロ') ||
      doc.querySelector('#last_digit_data_table') !== null ||
      doc.querySelector('#last_digit_list') !== null ||
      doc.querySelector('#machine_list') !== null ||
      (bodyText.includes('データまとめ') && (bodyText.includes('末尾別データ') || bodyText.includes('詳細データ')));

    if (isAnaSlo) {
      return parseAnaSloDailyHtml(doc, htmlContent, fileName);
    }

    // Check if this is a Daily Report file (contains 全体結果 or 機種別データ or 末尾別結果 or 総差枚)
    // ただしHTML内に3つ以上のテーブルがありテーブル3が出玉データを持つ場合は、テーブル3を優先取得するため店舗データとして処理する
    const allTablesPreCheck = Array.from(doc.querySelectorAll('table'));
    const hasTable3 = allTablesPreCheck.length >= 3;
    const isDailyReport =
      !hasTable3 &&
      (bodyText.includes('全体結果') ||
        (bodyText.includes('総差枚') && bodyText.includes('平均差枚') && bodyText.includes('全体')) ||
        (bodyText.includes('機種別データ') && bodyText.includes('末尾別結果')));

    if (isDailyReport) {
      return parseSlorepoDailyHtml(doc, htmlContent, fileName);
    }

    // Otherwise, parse as Store Monthly Summary page with table.date
    // 1. Store Name
    let storeName = '';
    const h4Title = doc.querySelector('h4.title');
    if (h4Title) {
      storeName = h4Title.textContent?.trim() || '';
    }
    if (!storeName && doc.title) {
      storeName = doc.title.replace(/\s*[-–|]\s*スロレポ.*$/i, '').trim();
    }
    if (!storeName) {
      storeName = 'スロレポ店舗';
    }

    // 2. Store Metadata from info table
    let address = '住所未登録';
    let oldEventDays = '5のつく日';
    let exchangeRateStr = '50枚貸/56枚交換';
    let grandOpen = '';

    const infoTables = doc.querySelectorAll('figure.wp-block-table table, table');
    infoTables.forEach((table) => {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row) => {
        const thText = row.querySelector('th')?.textContent?.trim() || '';
        const tdText = row.querySelector('td')?.textContent?.trim() || '';

        if (thText.includes('住所') && tdText) {
          address = tdText;
        } else if (thText.includes('旧イベント日') && tdText) {
          oldEventDays = tdText;
        } else if (thText.includes('換金率') && tdText) {
          exchangeRateStr = tdText;
        } else if (thText.includes('グランドオープン') && tdText) {
          grandOpen = tdText;
        }
      });
    });

    // 3. Parse Rates (lend / exchange)
    const { rateLend, rateExchange } = parseRatesFromExchangeRate(exchangeRateStr);

    // 4. Parse Special Day Rules from oldEventDays
    const specialDayRules: SpecialDayRules = parseSpecialDayRulesFromText(oldEventDays);

    // 5. Parse Daily Records from Table 3 (ユーザー指定: HTMLのテーブル3から取得)
    const allTables: HTMLTableElement[] = Array.from(doc.querySelectorAll('table'));
    let dateTables: HTMLTableElement[] = [];

    // 明示的なテーブル3（id, class, data-table属性）を優先探索
    const table3ById = doc.querySelector<HTMLTableElement>(
      '#table3, #table-3, #table_3, table.table3, table.table-3, table[data-table="3"]'
    );

    if (table3ById) {
      dateTables = [table3ById];
    } else if (allTables.length >= 3) {
      // HTML内の3番目のテーブル（テーブル3: 0-indexed で allTables[2]）から取得
      dateTables = [allTables[2]];
    } else {
      // テーブルが3つ未満の場合（テーブル単体を貼り付けた場合など）のフォールバック
      const explicitDateTables = Array.from(doc.querySelectorAll<HTMLTableElement>('table.date'));
      if (explicitDateTables.length > 0) {
        dateTables = explicitDateTables;
      } else {
        allTables.forEach((tbl) => {
          const text = tbl.textContent || '';
          if (
            text.includes('日付') &&
            (text.includes('差枚') || text.includes('勝率') || text.includes('平均G') || text.includes('G数') || text.includes('優秀機種'))
          ) {
            dateTables.push(tbl);
          }
        });
        if (dateTables.length === 0 && allTables.length > 0) {
          dateTables = [allTables[allTables.length - 1]];
        }
      }
    }

    if (dateTables.length === 0) {
      errors.push('HTMLからテーブル3または出玉データテーブルが見つかりませんでした。');
    }

    // 5A. Check if Table 3 or any table contains individual machine records (台番 / 台番号)
    const tablesWithMachines = dateTables.filter((tbl) => {
      const text = tbl.textContent || '';
      return text.includes('台番') || text.includes('台番号');
    });

    if (tablesWithMachines.length === 0 && allTables.length > 0) {
      allTables.forEach((tbl) => {
        const text = tbl.textContent || '';
        if (text.includes('台番') || text.includes('台番号')) {
          tablesWithMachines.push(tbl);
        }
      });
    }

    if (tablesWithMachines.length > 0) {
      const contextDateStr =
        normalizeDateString(
          (doc.title || '') +
            ' ' +
            (doc.querySelector('h1, h2, h3, h4.title')?.textContent || '') +
            ' ' +
            fileName
        ) || new Date().toISOString().substring(0, 10);

      const allExtractedDailyRecords: DailyRecord[] = [];

      tablesWithMachines.forEach((tbl) => {
        const groups = extractMachinesFromHtmlTable(tbl, contextDateStr, storeName);
        groups.forEach((g) => {
          const dateStr = g.date;
          const machines = g.machines;
          if (machines.length === 0) return;

          // Build models
          const modelMap = new Map<string, DailyMachineRecord[]>();
          machines.forEach((m) => {
            if (!modelMap.has(m.modelName)) modelMap.set(m.modelName, []);
            modelMap.get(m.modelName)!.push(m);
          });
          const models: DailyModelRecord[] = Array.from(modelMap.entries())
            .map(([mName, list]) => {
              const totD = list.reduce((sum, m) => sum + m.diff, 0);
              const totG = list.reduce((sum, m) => sum + m.games, 0);
              const wins = list.filter((m) => m.diff > 0).length;
              return {
                modelName: mName,
                avgDiffCoins: Math.round(totD / list.length),
                totalDiffCoins: totD,
                avgGames: Math.round(totG / list.length),
                winMachines: wins,
                totalMachines: list.length,
                winRate: Math.round((wins / list.length) * 1000) / 10,
                isSmallCount: list.length <= 2,
              };
            })
            .sort((a, b) => b.totalDiffCoins - a.totalDiffCoins);

          // Build tails
          const tails: DailyTailRecord[] = [];
          for (let t = 0; t <= 9; t++) {
            const match = machines.filter((m) => m.tailDigit === t);
            if (match.length > 0) {
              const totD = match.reduce((sum, m) => sum + m.diff, 0);
              const totG = match.reduce((sum, m) => sum + m.games, 0);
              const wins = match.filter((m) => m.diff > 0).length;
              tails.push({
                tailName: `末尾${t}`,
                tailNum: t,
                avgDiffCoins: Math.round(totD / match.length),
                totalDiffCoins: totD,
                avgGames: Math.round(totG / match.length),
                winMachines: wins,
                totalMachines: match.length,
                winRate: Math.round((wins / match.length) * 1000) / 10,
              });
            }
          }
          const zoro = machines.filter((m) => m.isZoro);
          if (zoro.length > 0) {
            const totD = zoro.reduce((sum, m) => sum + m.diff, 0);
            const totG = zoro.reduce((sum, m) => sum + m.games, 0);
            const wins = zoro.filter((m) => m.diff > 0).length;
            tails.push({
              tailName: '末尾 ゾロ目',
              tailNum: null,
              avgDiffCoins: Math.round(totD / zoro.length),
              totalDiffCoins: totD,
              avgGames: Math.round(totG / zoro.length),
              winMachines: wins,
              totalMachines: zoro.length,
              winRate: Math.round((wins / zoro.length) * 1000) / 10,
            });
          }

          const totD = machines.reduce((sum, m) => sum + m.diff, 0);
          const totG = machines.reduce((sum, m) => sum + m.games, 0);
          const wins = machines.filter((m) => m.diff > 0).length;
          const [y, m, d] = dateStr.split('-');
          const isOldEvent = isDateSpecialDay(dateStr, specialDayRules);

          const dow = calculateDayOfWeek(dateStr);
          if (!dow) return;

          allExtractedDailyRecords.push({
            date: dateStr,
            yearMonth: `${y}-${m}`,
            year: parseInt(y, 10),
            month: parseInt(m, 10),
            day: parseInt(d, 10),
            dayOfWeek: dow,
            avgDiffCoins: Math.round(totD / machines.length),
            avgGames: Math.round(totG / machines.length),
            winRate: Math.round((wins / machines.length) * 1000) / 10,
            winMachines: wins,
            totalMachines: machines.length,
            totalDiffCoins: totD,
            hallCoinProfit: -totD,
            playerCoinProfit: totD,
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
            is7Day: parseInt(d, 10) % 10 === 7,
            notable:
              models
                .filter((mod) => mod.avgDiffCoins > 0)
                .slice(0, 4)
                .map((mod) => `${mod.modelName}(+${mod.avgDiffCoins})`)
                .join('、') || '出玉データあり',
            models,
            tails,
            machines,
          });
        });
      });

      if (allExtractedDailyRecords.length > 0) {
        allExtractedDailyRecords.sort((a, b) => a.date.localeCompare(b.date));
        const processed = processStoreData(allExtractedDailyRecords, rateLend, rateExchange, 35, specialDayRules);
        const firstD = processed.dailyRecords[0]?.date || '';
        const lastD = processed.dailyRecords[processed.dailyRecords.length - 1]?.date || '';
        return {
          success: true,
          store: {
            id: `store-${storeName.replace(/[\s\u3000]+/g, '-').toLowerCase()}-${Date.now().toString(36)}`,
            name: storeName,
            address,
            oldEventDays,
            exchangeRate: exchangeRateStr,
            rateLend,
            rateExchange,
            cashRatio: 35,
            grandOpen,
            totalMachinesApprox: Math.max(...processed.dailyRecords.map((r) => r.totalMachines)),
            dataRange: `${firstD.slice(0, 7)} ～ ${lastD.slice(0, 7)} (${processed.dailyRecords.length}日分実データ)`,
            specialDayRules,
            dailyRecords: processed.dailyRecords,
            createdAt: new Date().toISOString(),
          },
          errors: [],
          totalRecordsCount: processed.dailyRecords.length,
        };
      }
    }

    interface RawExtractedRow {
      date: string;
      avgDiff: number;
      avgGames: number;
      winRate: number | null;
      winMachines: number | null;
      rowTotalMachines: number | null;
      topModels: string;
    }

    const rawRows: RawExtractedRow[] = [];
    const machineCounts: number[] = [];

    // Tracks current year as we parse top-to-bottom (chronologically descending)
    let currentYear = new Date().getFullYear();
    let previousMonth: number | null = null;

    dateTables.forEach((table) => {
      // Check if table or surrounding context explicitly mentions a year (e.g. "2026年" or "2025年")
      let contextYear: number | null = null;
      const captionText = table.querySelector('caption')?.textContent || '';
      const prevElText = table.previousElementSibling?.textContent || '';
      const contextMatch = (captionText + ' ' + prevElText).match(/(202\d)年/);
      if (contextMatch) {
        contextYear = parseInt(contextMatch[1], 10);
      }

      // ヘッダー行からカラムインデックスを自動検出（テーブル3の列順序に柔軟に対応）
      let colDateIdx = 0;
      let colDiffIdx = 1;
      let colGamesIdx = 2;
      let colWinRateIdx = 3;
      let colTopModelsIdx = 4;

      const headerTr =
        table.querySelector('thead tr') ||
        table.querySelector('tr:has(th)') ||
        table.querySelector('tr');
      if (headerTr) {
        const headerCells = Array.from(headerTr.querySelectorAll('th, td'));
        let foundDate = -1;
        let foundDiff = -1;
        let foundGames = -1;
        let foundWin = -1;
        let foundTop = -1;

        headerCells.forEach((c, idx) => {
          const txt = c.textContent?.trim() || '';
          if (foundDate === -1 && (txt.includes('日付') || txt.includes('日') || txt.toLowerCase().includes('date'))) {
            foundDate = idx;
          } else if (txt.includes('平均差枚')) {
            foundDiff = idx;
          } else if (foundDiff === -1 && (txt.includes('差枚') || txt.includes('出玉') || txt.includes('メダル'))) {
            foundDiff = idx;
          } else if (foundGames === -1 && (txt.includes('平均G') || txt.includes('G数') || txt.includes('ゲーム') || txt.includes('回転'))) {
            foundGames = idx;
          } else if (foundWin === -1 && (txt.includes('勝率') || txt.includes('勝'))) {
            foundWin = idx;
          } else if (foundTop === -1 && (txt.includes('優秀機種') || txt.includes('機種') || txt.includes('注目') || txt.includes('末尾') || txt.includes('ピックアップ'))) {
            foundTop = idx;
          }
        });

        if (foundDate !== -1) colDateIdx = foundDate;
        if (foundDiff !== -1) colDiffIdx = foundDiff;
        if (foundGames !== -1) colGamesIdx = foundGames;
        if (foundWin !== -1) colWinRateIdx = foundWin;
        if (foundTop !== -1) colTopModelsIdx = foundTop;
      }

      const trs = table.querySelectorAll('tbody tr, tr');
      trs.forEach((tr) => {
        // Skip header rows
        if (tr.querySelector('th')) return;

        const tds = tr.querySelectorAll('td');
        if (tds.length < 2) return;

        // Date Cell
        const dateCell = tds[colDateIdx] || tds[0];
        const dateLink = dateCell?.querySelector('a');
        const href = dateLink?.getAttribute('href') || '';
        const cellText = dateCell?.textContent?.trim() || '';

        let formattedDate = '';
        let rowYear: number | null = null;
        let rowMonth: number | null = null;
        let rowDay: number | null = null;

        // Check 1: href has date (e.g. 20260909, 2026-09-09, /2026/09/09, ?date=2026-04-15)
        const hrefMatch = href.match(/(202\d)[-_/]?(\d{2})[-_/]?(\d{2})/);
        if (hrefMatch) {
          rowYear = parseInt(hrefMatch[1], 10);
          rowMonth = parseInt(hrefMatch[2], 10);
          rowDay = parseInt(hrefMatch[3], 10);
        } else {
          // Check 2: cellText contains YYYY/MM/DD, YYYY-MM-DD, or YYYY年M月D日
          const fullDateMatch = cellText.match(/(202\d)[年/-](\d{1,2})[月/-](\d{1,2})/);
          if (fullDateMatch) {
            rowYear = parseInt(fullDateMatch[1], 10);
            rowMonth = parseInt(fullDateMatch[2], 10);
            rowDay = parseInt(fullDateMatch[3], 10);
          } else {
            // Check 3: M/D or M月D日 (e.g. "9/9(水)", "4/23(木)", "1月25日(日)")
            const mdMatch = cellText.match(/(\d{1,2})[\/月](\d{1,2})/);
            if (mdMatch) {
              rowMonth = parseInt(mdMatch[1], 10);
              rowDay = parseInt(mdMatch[2], 10);
            }
          }
        }

        if (rowMonth && rowDay) {
          if (rowYear) {
            currentYear = rowYear;
            previousMonth = rowMonth;
          } else {
            if (contextYear) {
              currentYear = contextYear;
            } else {
              // If month jumped backwards across year boundary (e.g. from Jan/Feb to Dec/Nov in descending order)
              if (previousMonth !== null && previousMonth <= 2 && rowMonth >= 11) {
                currentYear -= 1;
              }
            }
            rowYear = currentYear;
            previousMonth = rowMonth;
          }
          formattedDate = `${rowYear}-${String(rowMonth).padStart(2, '0')}-${String(rowDay).padStart(2, '0')}`;
        }

        if (!formattedDate) return;

        // Avg Diff Coins (e.g. "+61", "-57", "0")
        const diffCell = tds[colDiffIdx] || tds[1];
        const diffText = diffCell?.textContent?.trim().replace(/,/g, '') || '0';
        const diffMatch = diffText.match(/([+-]?\d+)/);
        const avgDiff = diffMatch ? parseInt(diffMatch[1], 10) : 0;

        // Avg Games (e.g. "1,299" -> 1299)
        const gamesCell = tds[colGamesIdx] || tds[2];
        const gamesText = gamesCell?.textContent?.trim().replace(/,/g, '') || '0';
        const gamesMatch = gamesText.match(/(\d+)/);
        const avgGames = gamesMatch ? parseInt(gamesMatch[1], 10) : 0;

        // Win Rate & Machines (e.g. "30% (48/162)")
        let winRate: number | null = null;
        let winMachines: number | null = null;
        let rowTotalMachines: number | null = null;

        const rateCell = tds[colWinRateIdx] || tds[3];
        if (rateCell) {
          const rateCellText = rateCell.textContent || '';
          const pctMatch = rateCellText.match(/(\d+(?:\.\d+)?)\s*%/);
          if (pctMatch) {
            winRate = parseFloat(pctMatch[1]);
          }
          // Match patterns: (48/162), ( 48 / 162 ), （48／162）, 48/162, (48/162台)
          const machinesMatch = rateCellText.match(/[\(（]?\s*(\d+)\s*[\/／]\s*(\d+)\s*(?:台)?[\)）]?/);
          if (machinesMatch) {
            winMachines = parseInt(machinesMatch[1], 10);
            rowTotalMachines = parseInt(machinesMatch[2], 10);
            machineCounts.push(rowTotalMachines);
          } else {
            // Check if only total machines was mentioned: e.g. (/162) or (162台) or 162台
            const totalOnlyMatch = rateCellText.match(/(?:[\/／]|\(|\b)(\d{2,4})\s*台/);
            if (totalOnlyMatch) {
              rowTotalMachines = parseInt(totalOnlyMatch[1], 10);
              machineCounts.push(rowTotalMachines);
            }
          }
        }

        // Top models (優秀機種・末尾)
        let topModels = '';
        const topCell = tds[colTopModelsIdx] || tds[4];
        if (topCell) {
          topModels = topCell.textContent?.trim().replace(/\s+/g, ' ') || '';
        }

        rawRows.push({
          date: formattedDate,
          avgDiff,
          avgGames,
          winRate,
          winMachines,
          rowTotalMachines,
          topModels,
        });
      });
    });

    // テーブル3が日付一覧ではなく機種別データだった場合の救済パース
    if (rawRows.length === 0 && dateTables.length > 0) {
      const targetTbl = dateTables[0];
      const modelRecords: DailyModelRecord[] = [];
      let pageDateStr = '';
      const dateMatch = (doc.title + ' ' + (doc.querySelector('h1, h2, h3, h4.title')?.textContent || '') + ' ' + fileName).match(/(202\d)[年/-](\d{1,2})[月/-](\d{1,2})/);
      if (dateMatch) {
        pageDateStr = `${dateMatch[1]}-${String(parseInt(dateMatch[2], 10)).padStart(2, '0')}-${String(parseInt(dateMatch[3], 10)).padStart(2, '0')}`;
      } else {
        pageDateStr = new Date().toISOString().substring(0, 10);
      }

      const trs = Array.from(targetTbl.querySelectorAll('tbody tr, tr'));
      trs.forEach((tr) => {
        if (tr.querySelector('th')) return;
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length >= 3) {
          const mName = tds[0].textContent?.trim() || '';
          if (!mName || mName.includes('機種') || mName.includes('平均') || mName.includes('合計')) return;
          const diff = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          const games = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
          let winM = 0;
          let totM = 1;
          let wRate: number | null = null;
          if (tds.length >= 4) {
            const wrText = tds[3].textContent?.trim() || '';
            const mSlash = wrText.match(/(\d+)\s*[\/／]\s*(\d+)/);
            if (mSlash) {
              winM = parseInt(mSlash[1], 10);
              totM = parseInt(mSlash[2], 10);
              wRate = totM > 0 ? Math.round((winM / totM) * 1000) / 10 : null;
            } else {
              const pMatch = wrText.match(/(\d+(?:\.\d+)?)\s*%/);
              if (pMatch) wRate = parseFloat(pMatch[1]);
            }
          }
          modelRecords.push({
            modelName: mName,
            avgDiffCoins: diff,
            totalDiffCoins: diff * totM,
            avgGames: games,
            winMachines: winM,
            totalMachines: totM,
            winRate: wRate,
            isSmallCount: totM <= 2,
          });
        }
      });

      if (modelRecords.length > 0) {
        const totMachines = modelRecords.reduce((sum, m) => sum + m.totalMachines, 0) || 160;
        const totDiff = modelRecords.reduce((sum, m) => sum + m.totalDiffCoins, 0);
        const winCnt = modelRecords.reduce((sum, m) => sum + m.winMachines, 0);
        const avgD = Math.round(totDiff / totMachines);
        const avgG = Math.round(modelRecords.reduce((sum, m) => sum + m.avgGames * m.totalMachines, 0) / totMachines);
        const wRate = Math.round((winCnt / totMachines) * 1000) / 10;
        
        rawRows.push({
          date: pageDateStr,
          avgDiff: avgD,
          avgGames: avgG,
          winRate: wRate,
          winMachines: winCnt,
          rowTotalMachines: totMachines,
          topModels: modelRecords.filter(m => m.avgDiffCoins > 0).slice(0, 4).map(m => `${m.modelName}(+${m.avgDiffCoins})`).join('、'),
        });
      }
    }

    if (rawRows.length === 0) {
      return {
        success: false,
        errors: ['HTMLから出玉データ行を検出できませんでした。スロレポの店舗出玉ページかご確認ください。'],
        totalRecordsCount: 0,
      };
    }

    // Determine representative total machines count (most frequent or max from rows)
    let approxMachines = 162;
    if (machineCounts.length > 0) {
      const freq = new Map<number, number>();
      machineCounts.forEach((cnt) => freq.set(cnt, (freq.get(cnt) || 0) + 1));
      let maxF = 0;
      freq.forEach((f, c) => {
        if (f > maxF) {
          maxF = f;
          approxMachines = c;
        }
      });
    }

    // Deduplicate by date and sort chronologically ascending (oldest to newest)
    const dateMap = new Map<string, RawExtractedRow>();
    rawRows.forEach((r) => {
      // If duplicate, keep first or one with full machines
      if (!dateMap.has(r.date) || (r.rowTotalMachines && !dateMap.get(r.date)?.rowTotalMachines)) {
        dateMap.set(r.date, r);
      }
    });

    const sortedRows = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Convert to DailyRecord
    // 台数がブランクの日は他の日で台数表示されてる台数を流用する
    const defaultCashRatio = 35;
    const validRows = sortedRows.filter((r) => calculateDayOfWeek(r.date) !== null);
    const tempDaily: DailyRecord[] = validRows.map((r, index) => {
      const parts = r.date.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const ym = `${parts[0]}-${parts[1]}`;
      const dow = calculateDayOfWeek(r.date)!;
      const isOldEvent = isDateSpecialDay(r.date, specialDayRules);

      // Check if machine count is blank for this day
      const isBlankMachines = !r.rowTotalMachines || r.rowTotalMachines <= 0;
      let machines = r.rowTotalMachines;
      let isReusedMachines = false;

      if (isBlankMachines) {
        isReusedMachines = true;
        // Find nearest day in sortedRows that has a valid rowTotalMachines
        let nearestDist = Infinity;
        let nearestMachines: number | null = null;
        for (let i = 0; i < sortedRows.length; i++) {
          const other = sortedRows[i];
          if (other.rowTotalMachines && other.rowTotalMachines > 0) {
            const dist = Math.abs(i - index);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestMachines = other.rowTotalMachines;
            }
          }
        }
        machines = nearestMachines || approxMachines || 162;
      }

      if (!machines || machines <= 0) {
        machines = approxMachines || 162;
      }

      // If winMachines was blank, but winRate and total machines are available, derive winMachines
      let winMachines = r.winMachines;
      let winRate = r.winRate;
      if (winMachines === null && winRate !== null && machines > 0) {
        winMachines = Math.round(machines * (winRate / 100));
      } else if (winRate === null && winMachines !== null && machines > 0) {
        winRate = Math.round((winMachines / machines) * 1000) / 10;
      }

      const totalDiff = r.avgDiff * machines;
      const is7 = d % 10 === 7;

      return {
        date: r.date,
        yearMonth: ym,
        year: y,
        month: m,
        day: d,
        dayOfWeek: dow,
        avgDiffCoins: r.avgDiff,
        avgGames: r.avgGames,
        winRate: winRate,
        winMachines: winMachines,
        totalMachines: machines,
        isReusedMachines: isReusedMachines,
        totalDiffCoins: totalDiff,
        hallCoinProfit: -totalDiff,
        playerCoinProfit: totalDiff,
        isOldEventDay: isOldEvent,
        is7Day: is7,
        notable: r.topModels,
        hallYenProfit: 0,
        playerYenProfit: 0,
        inCoins: 0,
        outCoins: 0,
        payoutRate: 100,
        estimatedRevenue: 0,
        exchangeGapProfit: 0,
        gModelHallProfit: 0,
        gModelPlayerProfit: 0,
      };
    });

    // Run through full dataEngine calculations (Model A and Model B)
    const processed = processStoreData(tempDaily, rateLend, rateExchange, defaultCashRatio, specialDayRules);

    const firstDate = processed.dailyRecords[0]?.date || '';
    const lastDate = processed.dailyRecords[processed.dailyRecords.length - 1]?.date || '';
    const ymStart = firstDate.substring(0, 7);
    const ymEnd = lastDate.substring(0, 7);
    const dataRange = `${ymStart} ～ ${ymEnd} (${processed.dailyRecords.length}日分実データ)`;

    // Create unique store ID based on storeName or random
    const storeId = `store-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const storeProfile: StoreProfile = {
      id: storeId,
      name: storeName,
      address,
      oldEventDays,
      exchangeRate: exchangeRateStr,
      rateLend,
      rateExchange,
      cashRatio: defaultCashRatio,
      grandOpen,
      totalMachinesApprox: approxMachines,
      dataRange,
      isPreset: false,
      specialDayRules,
      dailyRecords: processed.dailyRecords,
      createdAt: new Date().toISOString(),
    };

    return {
      success: true,
      store: storeProfile,
      errors,
      totalRecordsCount: processed.dailyRecords.length,
    };
  } catch (err: any) {
    return {
      success: false,
      errors: [`HTMLパース中に予期せぬエラーが発生しました: ${err?.message || err}`],
      totalRecordsCount: 0,
    };
  }
}
