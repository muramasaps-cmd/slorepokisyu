import { DailyRecord, StoreProfile } from '../data/types';
import { parseRatesFromExchangeRate, parseSlorepoHtml } from './htmlParser';
import { processStoreData } from './dataEngine';
import { parseSpecialDayRulesFromText } from './specialDayRules';
import { areStoresSame, normalizeStoreNameKey } from './storeStorage';

export interface ParsedStoreGroup {
  store: StoreProfile;
  sourceFileNames: string[];
  isExistingStoreUpdate: boolean;
  newRecordsCount: number;
  totalRecordsCount: number;
  originalStoreId?: string;
}

export interface MultiParseResult {
  success: boolean;
  totalFiles: number;
  successCount: number;
  failedCount: number;
  stores: ParsedStoreGroup[];
  errors: { fileName: string; error: string }[];
  totalRecordsCount: number;
}

/**
 * Decodes ArrayBuffer to string with automatic encoding detection (UTF-8, Shift-JIS, Windows-31J, EUC-JP)
 */
export function decodeHtmlBuffer(buffer: ArrayBuffer): string {
  // 1. Try UTF-8 first
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const text = utf8Decoder.decode(buffer);

  // Check if text has meta charset specifying shift_jis or sjis or cp932
  const headSnippet = text.slice(0, 2000).toLowerCase();
  const hasSjisMeta =
    headSnippet.includes('charset="shift_jis"') ||
    headSnippet.includes("charset='shift_jis'") ||
    headSnippet.includes('charset=shift_jis') ||
    headSnippet.includes('charset="sjis"') ||
    headSnippet.includes("charset='sjis'") ||
    headSnippet.includes('charset=sjis') ||
    headSnippet.includes('charset=cp932') ||
    headSnippet.includes('charset=windows-31j');

  // Also check if text has many replacement characters (mojibake)
  const replacementCount = (text.match(/\uFFFD/g) || []).length;

  if (hasSjisMeta || replacementCount > 5) {
    try {
      const sjisDecoder = new TextDecoder('shift-jis');
      const sjisText = sjisDecoder.decode(buffer);
      if (sjisText && sjisText.length > 0) {
        return sjisText;
      }
    } catch {
      // Shift-JIS decoder not available or failed; fallback to utf-8 text
    }
  }

  return text;
}

/**
 * Reads multiple browser File objects into an array of { name, content } strings.
 * Supports chunking and progress reporting to avoid UI freeze and memory limits when loading 100+ files.
 */
export async function readFilesAsText(
  files: FileList | File[],
  onProgress?: (processed: number, total: number, fileName: string) => void
): Promise<{ name: string; content: string }[]> {
  const fileArray = Array.from(files);
  const results: { name: string; content: string }[] = [];
  const chunkSize = 12;

  for (let i = 0; i < fileArray.length; i += chunkSize) {
    const chunk = fileArray.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (file) => {
        try {
          let text = '';
          if (typeof file.arrayBuffer === 'function') {
            const buffer = await file.arrayBuffer();
            text = decodeHtmlBuffer(buffer);
          } else if (typeof file.text === 'function') {
            text = await file.text();
          } else {
            text = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve((e.target?.result as string) || '');
              reader.onerror = (e) => reject(e);
              reader.readAsText(file, 'utf-8');
            });
          }
          return { name: file.name, content: text };
        } catch {
          return { name: file.name, content: '' };
        }
      })
    );

    for (const r of chunkResults) {
      if (r.content.trim().length > 0) {
        results.push(r);
      }
    }

    if (onProgress) {
      const processedCount = Math.min(i + chunkSize, fileArray.length);
      const lastFile = chunk[chunk.length - 1]?.name || '';
      onProgress(processedCount, fileArray.length, lastFile);
    }

    // Yield execution to the browser event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}

/**
 * Internal core merging logic for parsed individual results
 */
function aggregateParsedResults(
  parsedIndividualResults: { fileName: string; store: StoreProfile; recordsCount: number }[],
  errors: { fileName: string; error: string }[],
  totalFiles: number,
  existingStores: StoreProfile[]
): MultiParseResult {
  if (parsedIndividualResults.length === 0) {
    return {
      success: false,
      totalFiles,
      successCount: 0,
      failedCount: errors.length,
      stores: [],
      errors,
      totalRecordsCount: 0,
    };
  }

  // 1. Group parsed stores by store name
  interface GroupAcc {
    storeName: string;
    sourceFileNames: string[];
    stores: StoreProfile[];
  }
  const groupMap = new Map<string, GroupAcc>();

  for (const item of parsedIndividualResults) {
    let matchedKey: string | null = null;
    for (const key of groupMap.keys()) {
      const g = groupMap.get(key)!;
      if (areStoresSame(g.storeName, item.store.name)) {
        matchedKey = key;
        break;
      }
    }

    if (!matchedKey) {
      const key = normalizeStoreNameKey(item.store.name);
      groupMap.set(key, {
        storeName: item.store.name,
        sourceFileNames: [item.fileName],
        stores: [item.store],
      });
    } else {
      const existingGroup = groupMap.get(matchedKey)!;
      existingGroup.sourceFileNames.push(item.fileName);
      existingGroup.stores.push(item.store);
    }
  }

  // If there are generic "スロレポ登録店舗" groups alongside specific named store groups,
  // merge the generic records into the dominant group
  const allGroups = Array.from(groupMap.values());
  const namedGroups = allGroups.filter((g) => g.storeName !== 'スロレポ登録店舗');
  if (namedGroups.length > 0) {
    const dominantGroup = namedGroups.sort((a, b) => b.stores.length - a.stores.length)[0];
    for (const [key, group] of Array.from(groupMap.entries())) {
      if (group.storeName === 'スロレポ登録店舗' && group !== dominantGroup) {
        group.sourceFileNames.forEach((n) => dominantGroup.sourceFileNames.push(n));
        group.stores.forEach((s) => dominantGroup.stores.push(s));
        groupMap.delete(key);
      }
    }
  }

  // 2. For each group, merge records & metadata
  const stagedGroups: ParsedStoreGroup[] = [];
  let grandTotalRecords = 0;

  for (const [, group] of groupMap.entries()) {
    const primary = group.stores[0];
    const existingMatch = existingStores.find(
      (s) => (primary && s.id === primary.id) || areStoresSame(s.name, group.storeName)
    );

    // Collect all daily records from all files in this group
    const combinedDailyRecords: DailyRecord[] = [];
    group.stores.forEach((s) => {
      if (s.dailyRecords && s.dailyRecords.length > 0) {
        s.dailyRecords.forEach((r) => combinedDailyRecords.push(r));
      }
    });

    // If an existing store exists, include its existing records for merging
    const existingRecordsMap = new Map<string, DailyRecord>();
    if (existingMatch?.dailyRecords) {
      existingMatch.dailyRecords.forEach((r) => {
        existingRecordsMap.set(r.date, r);
        combinedDailyRecords.push(r);
      });
    }

    // Deduplicate by date
    const dateMap = new Map<string, DailyRecord>();
    for (const r of combinedDailyRecords) {
      if (!dateMap.has(r.date)) {
        dateMap.set(r.date, r);
      } else {
        const prev = dateMap.get(r.date)!;
        const prevQuality =
          (prev.totalMachines > 0 ? 2 : 0) +
          (prev.winMachines !== null ? 2 : 0) +
          (prev.notable ? 1 : 0) +
          (prev.models && prev.models.length > 0 ? 4 : 0);
        const newQuality =
          (r.totalMachines > 0 ? 2 : 0) +
          (r.winMachines !== null ? 2 : 0) +
          (r.notable ? 1 : 0) +
          (r.models && r.models.length > 0 ? 4 : 0);

        if (newQuality >= prevQuality) {
          dateMap.set(r.date, r);
        }
      }
    }

    const uniqueDailyRecords = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    let newRecordsCount = uniqueDailyRecords.length;
    if (existingMatch) {
      newRecordsCount = uniqueDailyRecords.filter(
        (r) => !existingRecordsMap.has(r.date)
      ).length;
    }

    const bestAddress =
      group.stores.find((s) => s.address && s.address !== '住所未登録')?.address ||
      existingMatch?.address ||
      primary.address;
    const bestOldEventDays =
      existingMatch?.oldEventDays ||
      group.stores.find((s) => s.oldEventDays)?.oldEventDays ||
      primary.oldEventDays;
    const bestExchangeRate =
      existingMatch?.exchangeRate ||
      group.stores.find((s) => s.exchangeRate)?.exchangeRate ||
      primary.exchangeRate;
    const grandOpen =
      group.stores.find((s) => s.grandOpen)?.grandOpen ||
      existingMatch?.grandOpen ||
      primary.grandOpen;

    const { rateLend: parsedLend, rateExchange: parsedExch } =
      parseRatesFromExchangeRate(bestExchangeRate);
    const rateLend = existingMatch?.rateLend || parsedLend || primary.rateLend || 46;
    const rateExchange = existingMatch?.rateExchange || parsedExch || primary.rateExchange || 52;
    const cashRatio = existingMatch?.cashRatio ?? primary.cashRatio ?? 35;
    const specialDayRules =
      existingMatch?.specialDayRules ||
      parseSpecialDayRulesFromText(bestOldEventDays);

    // Find approxMachines
    const machineCounts: number[] = [];
    uniqueDailyRecords.forEach((r) => {
      if (r.totalMachines > 0 && !r.isReusedMachines) {
        machineCounts.push(r.totalMachines);
      }
    });
    let approxMachines = existingMatch?.totalMachinesApprox || primary.totalMachinesApprox || 160;
    if (machineCounts.length > 0) {
      const freq = new Map<number, number>();
      machineCounts.forEach((c) => freq.set(c, (freq.get(c) || 0) + 1));
      let maxF = 0;
      freq.forEach((f, c) => {
        if (f > maxF) {
          maxF = f;
          approxMachines = c;
        }
      });
    }

    // Re-process all merged records through dataEngine
    const processed = processStoreData(
      uniqueDailyRecords,
      rateLend,
      rateExchange,
      cashRatio,
      specialDayRules
    );

    const firstDate = processed.dailyRecords[0]?.date || '';
    const lastDate = processed.dailyRecords[processed.dailyRecords.length - 1]?.date || '';
    const ymStart = firstDate.substring(0, 7);
    const ymEnd = lastDate.substring(0, 7);
    const dataRange = `${ymStart} ～ ${ymEnd} (${processed.dailyRecords.length}日分実データ)`;

    const storeId = existingMatch?.id || `store-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const mergedStoreProfile: StoreProfile = {
      id: storeId,
      name: existingMatch?.name || group.storeName,
      address: bestAddress,
      oldEventDays: bestOldEventDays,
      exchangeRate: bestExchangeRate,
      rateLend,
      rateExchange,
      cashRatio,
      grandOpen,
      totalMachinesApprox: approxMachines,
      dataRange,
      isPreset: false,
      specialDayRules,
      dailyRecords: processed.dailyRecords,
      createdAt: existingMatch?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    grandTotalRecords += processed.dailyRecords.length;

    stagedGroups.push({
      store: mergedStoreProfile,
      sourceFileNames: group.sourceFileNames,
      isExistingStoreUpdate: !!existingMatch,
      newRecordsCount,
      totalRecordsCount: processed.dailyRecords.length,
      originalStoreId: existingMatch?.id,
    });
  }

  return {
    success: stagedGroups.length > 0,
    totalFiles,
    successCount: parsedIndividualResults.length,
    failedCount: errors.length,
    stores: stagedGroups,
    errors,
    totalRecordsCount: grandTotalRecords,
  };
}

/**
 * Asynchronously parses multiple HTML files with non-blocking event loop yields and progress reporting.
 * Ideal for processing ~100+ files smoothly without UI freeze or browser script timeouts.
 */
export async function parseMultipleSlorepoHtmlAsync(
  rawFiles: { name: string; content: string }[],
  existingStores: StoreProfile[] = [],
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<MultiParseResult> {
  const errors: { fileName: string; error: string }[] = [];
  const parsedIndividualResults: {
    fileName: string;
    store: StoreProfile;
    recordsCount: number;
  }[] = [];

  for (let i = 0; i < rawFiles.length; i++) {
    const f = rawFiles[i];
    if (onProgress) {
      onProgress(i + 1, rawFiles.length, f.name);
    }

    if (!f.content.trim()) {
      errors.push({ fileName: f.name, error: 'ファイルが空です。' });
      continue;
    }

    try {
      const res = parseSlorepoHtml(f.content, f.name);
      if (!res.success || !res.store) {
        errors.push({
          fileName: f.name,
          error: res.errors.length > 0 ? res.errors.join(' / ') : '出玉データの解析に失敗しました。',
        });
        continue;
      }
      parsedIndividualResults.push({
        fileName: f.name,
        store: res.store,
        recordsCount: res.totalRecordsCount,
      });
    } catch (e: any) {
      errors.push({
        fileName: f.name,
        error: `解析中にエラーが発生しました: ${e?.message || e}`,
      });
    }

    // Yield to the browser event loop every 3 files to keep UI fully responsive
    if (i % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return aggregateParsedResults(parsedIndividualResults, errors, rawFiles.length, existingStores);
}

/**
 * Synchronous backward-compatible multi HTML parser
 */
export function parseMultipleSlorepoHtml(
  rawFiles: { name: string; content: string }[],
  existingStores: StoreProfile[] = []
): MultiParseResult {
  const errors: { fileName: string; error: string }[] = [];
  const parsedIndividualResults: {
    fileName: string;
    store: StoreProfile;
    recordsCount: number;
  }[] = [];

  for (const f of rawFiles) {
    if (!f.content.trim()) {
      errors.push({ fileName: f.name, error: 'ファイルが空です。' });
      continue;
    }
    try {
      const res = parseSlorepoHtml(f.content, f.name);
      if (!res.success || !res.store) {
        errors.push({
          fileName: f.name,
          error: res.errors.length > 0 ? res.errors.join(' / ') : '出玉データの解析に失敗しました。',
        });
        continue;
      }
      parsedIndividualResults.push({
        fileName: f.name,
        store: res.store,
        recordsCount: res.totalRecordsCount,
      });
    } catch (e: any) {
      errors.push({
        fileName: f.name,
        error: `解析中にエラーが発生しました: ${e?.message || e}`,
      });
    }
  }

  return aggregateParsedResults(parsedIndividualResults, errors, rawFiles.length, existingStores);
}
