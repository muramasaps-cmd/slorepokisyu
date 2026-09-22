import {
  DailyModelRecord,
  DailyRecord,
  DailyTailRecord,
  SpecialDayRules,
  StoreProfile,
} from '../data/types';
import { calculateDayOfWeek, isDateSpecialDay, processStoreData } from './dataEngine';
import { parseSpecialDayRulesFromText } from './specialDayRules';

export interface ParseHtmlResult {
  success: boolean;
  store?: StoreProfile;
  errors: string[];
  totalRecordsCount: number;
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

/**
 * Parses a Slorepo daily report page (日別出玉データ).
 * Extracts store name, date, overall results (全体結果: 総差枚, 平均差枚, 平均G数, 勝率),
 * model breakdown (機種別データ & 少台数機種), tail results (末尾別結果), and top pickup models.
 */
export function parseSlorepoDailyHtml(doc: Document, rawHtml: string): ParseHtmlResult {
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
    const h4 = doc.querySelector('h4.title');
    if (h4) {
      const parts = h4.innerHTML.split(/<br\s*\/?>/i);
      if (parts.length >= 2) {
        storeName = parts[1].replace(/<[^>]*>/g, '').trim();
      } else {
        const text = h4.textContent?.trim() || '';
        const match = text.match(/(?:202\d[^\s]+)\s+(.+)$/);
        if (match) storeName = match[1].trim();
      }
    }
  }

  if (!storeName && doc.title) {
    const cleanedTitle = doc.title.replace(/\s*[-–|]\s*スロレポ.*$/i, '').trim();
    if (!cleanedTitle.match(/202\d/)) {
      storeName = cleanedTitle;
    }
  }

  if (!storeName) {
    storeName = 'マルハンメガシティ2000蒲田';
  }

  // 2. Extract Date and Day of Week
  let dateStr = '';
  let dayOfWeek = '日';

  const textForDate =
    (doc.querySelector('h4.title')?.textContent || '') +
    ' ' +
    (doc.title || '') +
    ' ' +
    rawHtml.slice(0, 1000);

  const dateMatch = textForDate.match(/(202\d)[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (dateMatch) {
    const y = parseInt(dateMatch[1], 10);
    const m = parseInt(dateMatch[2], 10);
    const d = parseInt(dateMatch[3], 10);
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dayOfWeek = calculateDayOfWeek(dateStr);
  }

  const dowMatch = textForDate.match(/[\(（]([日月火水木金土])[\)）]/);
  if (dowMatch) {
    dayOfWeek = dowMatch[1];
  }

  if (!dateStr) {
    errors.push('日別HTMLから日付を抽出できませんでした。');
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
    if (text.includes('総差枚') && text.includes('平均差枚')) {
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

  // If totalMachines was not found in overall table, calculate from parsedModels
  if (totalMachines <= 0) {
    if (parsedModels.length > 0) {
      totalMachines = parsedModels.reduce((acc, m) => acc + m.totalMachines, 0);
    } else {
      totalMachines = 715;
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
    storeName.includes('7') || storeName.includes('マルハン') ? '7のつく日' : '5のつく日'
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
  };

  const rateLend = 46;
  const rateExchange = 52;
  const processed = processStoreData([dailyRecord], rateLend, rateExchange, 35, specialDayRules);

  const storeProfile: StoreProfile = {
    id: `store-${storeName.replace(/[\s\u3000]+/g, '-').toLowerCase()}`,
    name: storeName,
    address: '東京都大田区蒲田',
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
export function parseSlorepoHtml(htmlContent: string): ParseHtmlResult {
  const errors: string[] = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Check if this is a Daily Report file (contains 全体結果 or 機種別データ or 末尾別結果)
    const bodyText = doc.body?.textContent || '';
    const isDailyReport =
      bodyText.includes('全体結果') ||
      (bodyText.includes('機種別データ') && bodyText.includes('末尾別結果'));

    if (isDailyReport) {
      return parseSlorepoDailyHtml(doc, htmlContent);
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

    // 5. Parse Daily Records from tables
    // First look for table.date, but also include any table containing report headers
    const dateTables: HTMLTableElement[] = Array.from(doc.querySelectorAll('table.date'));
    const allTables: HTMLTableElement[] = Array.from(doc.querySelectorAll('table'));
    allTables.forEach((tbl) => {
      if (!dateTables.includes(tbl)) {
        const text = tbl.textContent || '';
        if (text.includes('日付') && (text.includes('差枚') || text.includes('勝率') || text.includes('平均G') || text.includes('G数') || text.includes('優秀機種'))) {
          dateTables.push(tbl);
        }
      }
    });

    if (dateTables.length === 0) {
      errors.push('日付別レポートのテーブル (<table class="date"> 等) が見つかりませんでした。');
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

      const trs = table.querySelectorAll('tbody tr, tr');
      trs.forEach((tr) => {
        // Skip header rows
        if (tr.querySelector('th')) return;

        const tds = tr.querySelectorAll('td');
        if (tds.length < 3) return;

        // Cell 0: Date
        const dateCell = tds[0];
        const dateLink = dateCell.querySelector('a');
        const href = dateLink?.getAttribute('href') || '';
        const cellText = dateCell.textContent?.trim() || '';

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

        // Cell 1: Avg Diff Coins (e.g. "+61", "-57", "0")
        const diffText = tds[1].textContent?.trim().replace(/,/g, '') || '0';
        const diffMatch = diffText.match(/([+-]?\d+)/);
        const avgDiff = diffMatch ? parseInt(diffMatch[1], 10) : 0;

        // Cell 2: Avg Games (e.g. "1,299" -> 1299)
        const gamesText = tds[2].textContent?.trim().replace(/,/g, '') || '0';
        const gamesMatch = gamesText.match(/(\d+)/);
        const avgGames = gamesMatch ? parseInt(gamesMatch[1], 10) : 0;

        // Cell 3: Win Rate & Machines (e.g. "30% (48/162)")
        let winRate: number | null = null;
        let winMachines: number | null = null;
        let rowTotalMachines: number | null = null;

        if (tds.length >= 4) {
          const rateCellText = tds[3].textContent || '';
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

        // Cell 4: Top models (優秀機種・末尾)
        let topModels = '';
        if (tds.length >= 5) {
          topModels = tds[4].textContent?.trim().replace(/\s+/g, ' ') || '';
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
    const tempDaily: DailyRecord[] = sortedRows.map((r, index) => {
      const parts = r.date.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const ym = `${parts[0]}-${parts[1]}`;
      const dow = calculateDayOfWeek(r.date);
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
