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
 * Reads multiple browser File objects into an array of { name, content } strings.
 */
export async function readFilesAsText(
  files: FileList | File[]
): Promise<{ name: string; content: string }[]> {
  const fileArray = Array.from(files);
  const results = await Promise.all(
    fileArray.map(async (file) => {
      try {
        let text = '';
        if (typeof file.text === 'function') {
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
      } catch (err) {
        return { name: file.name, content: '' };
      }
    })
  );
  return results.filter((r) => r.content.trim().length > 0);
}

// Using normalizeStoreNameKey and areStoresSame from storeStorage

/**
 * Parses multiple HTML files from Slorepo, groups files that belong to the same store,
 * merges daily records deduplicated by date, backfills machine counts, recalculates statistics,
 * and detects matches with existing registered stores.
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

  // 1. Parse each file individually
  for (const f of rawFiles) {
    if (!f.content.trim()) {
      errors.push({ fileName: f.name, error: 'ファイルが空です。' });
      continue;
    }
    const res = parseSlorepoHtml(f.content);
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
  }

  if (parsedIndividualResults.length === 0) {
    return {
      success: false,
      totalFiles: rawFiles.length,
      successCount: 0,
      failedCount: errors.length,
      stores: [],
      errors,
      totalRecordsCount: 0,
    };
  }

  // 2. Group parsed stores by store name
  // Key: normalized store name
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

  // 3. For each group, merge records & metadata
  const stagedGroups: ParsedStoreGroup[] = [];
  let grandTotalRecords = 0;

  for (const [, group] of groupMap.entries()) {
    // Check if this store matches an existing registered store
    const primary = group.stores[0];
    const existingMatch = existingStores.find(
      (s) => (primary && s.id === primary.id) || areStoresSame(s.name, group.storeName)
    );

    // Collect all daily records from all files in this group
    const combinedDailyRecords: DailyRecord[] = [];
    group.stores.forEach((s) => {
      if (s.dailyRecords && s.dailyRecords.length > 0) {
        combinedDailyRecords.push(...s.dailyRecords);
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
    // Prefer record with valid totalMachines, non-null winMachines, or notable text
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

    // Calculate how many new records are added beyond existing store
    let newRecordsCount = uniqueDailyRecords.length;
    if (existingMatch) {
      newRecordsCount = uniqueDailyRecords.filter(
        (r) => !existingRecordsMap.has(r.date)
      ).length;
    }

    // Determine metadata from the parsed stores (preferring latest or non-empty)
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
    let approxMachines = existingMatch?.totalMachinesApprox || primary.totalMachinesApprox || 162;
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
    totalFiles: rawFiles.length,
    successCount: parsedIndividualResults.length,
    failedCount: errors.length,
    stores: stagedGroups,
    errors,
    totalRecordsCount: grandTotalRecords,
  };
}
