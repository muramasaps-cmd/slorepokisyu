import { DailyRecord, StoreProfile } from '../data/types';
import { parseRatesFromExchangeRate } from './htmlParser';
import { parseSpecialDayRulesFromText } from './specialDayRules';
import {
  saveStoresToIdb,
  loadStoresFromIdb,
  clearStoresFromIdb,
  putStoreToIdb,
  deleteStoreFromIdb,
} from './indexedDb';
import { notifyStorageEvent } from './storageNotifier';

const STORAGE_KEY_STORES = 'SLOT_ANALYZER_HTML_STORES_V2';
const STORAGE_KEY_ACTIVE_ID = 'SLOT_ANALYZER_HTML_ACTIVE_ID_V2';

/**
 * Normalizes store name for grouping/comparison (trims spaces, fullwidth characters, punctuation, dates, brackets, suffixes)
 * Preserves distinct hall numbers (e.g. 蒲田1 vs 蒲田7) so separate halls are NEVER mixed!
 */
export function normalizeStoreNameKey(name: string): string {
  if (!name) return '';
  return name
    .trim()
    // convert full-width numbers and alphanumeric characters to half-width
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    // remove brackets like 【...】 or [...] or （...）
    .replace(/【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g, '')
    // remove date patterns like 2026-9-20, 2026/09/20, 9月20日
    .replace(/202\d[年/-]\d{1,2}[月/-]\d{1,2}[日]?/g, '')
    .replace(/\d{1,2}月\d{1,2}日/g, '')
    // remove day of week like (日), (月), etc.
    .replace(/[\(（][日月火水木金土][\)）]/g, '')
    // remove spaces, hyphens, punctuation
    .replace(/[\s\u3000\-_/・]+/g, '')
    // Strip trailing generic "店"
    .replace(/店$/g, '')
    .toLowerCase();
}

/**
 * Checks if two store names designate the exact same store.
 * Strictly separates different halls (e.g. 'マルハンメガシティ2000蒲田7' vs 'マルハンメガシティ2000 蒲田1').
 */
export function areStoresSame(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  if (nameA.trim() === nameB.trim()) return true;

  const normA = normalizeStoreNameKey(nameA);
  const normB = normalizeStoreNameKey(nameB);
  if (!normA || !normB) return false;

  return normA === normB;
}

/**
 * Merges two daily record sets by date, preserving highest quality records
 */
/**
 * Calculates a quality score for a DailyRecord based on completeness of its data.
 * Rich unit-level machine records receive the highest bonus, followed by model breakdowns and win rate data.
 */
export function computeDailyRecordQuality(r: DailyRecord): number {
  if (!r) return 0;
  return (
    (r.totalMachines > 0 ? 2 : 0) +
    (r.winMachines !== null && r.winMachines !== undefined ? 2 : 0) +
    (r.machines && r.machines.length > 0 ? 20 : 0) +
    (r.models && r.models.length > 0 ? 10 : 0) +
    (r.tails && r.tails.length > 0 ? 5 : 0) +
    (r.notable ? 1 : 0)
  );
}

export function mergeDailyRecords(recordsA: DailyRecord[] = [], recordsB: DailyRecord[] = []): DailyRecord[] {
  const dateMap = new Map<string, DailyRecord>();

  for (const r of [...recordsA, ...recordsB]) {
    if (!r || !r.date) continue;
    if (!dateMap.has(r.date)) {
      dateMap.set(r.date, r);
    } else {
      const prev = dateMap.get(r.date)!;
      const prevQuality = computeDailyRecordQuality(prev);
      const newQuality = computeDailyRecordQuality(r);

      if (newQuality >= prevQuality) {
        // If the new record lacks machines but previous had machines, retain previous machines
        const mergedMachines = (r.machines && r.machines.length > 0) ? r.machines : prev.machines;
        dateMap.set(r.date, {
          ...r,
          machines: mergedMachines,
        });
      } else if (prevQuality > newQuality) {
        // If previous lacks machines but new has machines, attach them
        if ((!prev.machines || prev.machines.length === 0) && (r.machines && r.machines.length > 0)) {
          dateMap.set(r.date, {
            ...prev,
            machines: r.machines,
          });
        }
      }
    }
  }

  return Array.from(dateMap.values())
    .filter((r) => r && r.date)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * Helper to normalize store rates and fill any blank machine counts from other days
 */
function normalizeStore(store: StoreProfile): StoreProfile | null {
  if (!store || typeof store !== 'object' || !store.name) {
    return null;
  }
  let rateLend = store.rateLend || 46;
  let rateExchange = store.rateExchange || 52;
  if (store.exchangeRate) {
    const parsedRates = parseRatesFromExchangeRate(store.exchangeRate);
    if (parsedRates.rateLend) rateLend = parsedRates.rateLend;
    if (parsedRates.rateExchange) rateExchange = parsedRates.rateExchange;
  }

  let specialDayRules = store.specialDayRules;
  if (
    !specialDayRules ||
    (!specialDayRules.tails &&
      !specialDayRules.fixedDates &&
      !specialDayRules.doubleDigits &&
      !specialDayRules.daysOfWeek)
  ) {
    specialDayRules = parseSpecialDayRulesFromText(store.oldEventDays || '');
  }

  if (store.dailyRecords && Array.isArray(store.dailyRecords) && store.dailyRecords.length > 0) {
    const validWithMachines = store.dailyRecords.filter((r) => r && r.totalMachines && r.totalMachines > 0);
    let fallbackCount = store.totalMachinesApprox || 162;
    if (validWithMachines.length > 0) {
      const freq = new Map<number, number>();
      validWithMachines.forEach((r) => freq.set(r.totalMachines, (freq.get(r.totalMachines) || 0) + 1));
      let maxF = 0;
      freq.forEach((f, c) => {
        if (f > maxF) {
          maxF = f;
          fallbackCount = c;
        }
      });
    }

    const normalizedRecords = store.dailyRecords.filter(Boolean).map((r, idx) => {
      if (!r.totalMachines || r.totalMachines <= 0) {
        let nearestDist = Infinity;
        let nearestCount = fallbackCount;
        for (let i = 0; i < store.dailyRecords.length; i++) {
          const other = store.dailyRecords[i];
          if (other && other.totalMachines && other.totalMachines > 0) {
            const dist = Math.abs(i - idx);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestCount = other.totalMachines;
            }
          }
        }
        const machines = nearestCount;
        const totalDiff = (r.totalDiffCoins === 0 && r.avgDiffCoins !== 0)
          ? r.avgDiffCoins * machines
          : (r.totalDiffCoins || r.avgDiffCoins * machines);
        let winMachines = r.winMachines;
        if (winMachines === null && r.winRate !== null) {
          winMachines = Math.round(machines * (r.winRate / 100));
        }
        return {
          ...r,
          totalMachines: machines,
          winMachines,
          totalDiffCoins: totalDiff,
          hallCoinProfit: -totalDiff,
          playerCoinProfit: totalDiff,
          isReusedMachines: true,
        };
      }
      return r;
    });

    return {
      ...store,
      name: store.name || 'スロット店舗',
      rateLend,
      rateExchange,
      specialDayRules,
      totalMachinesApprox: fallbackCount,
      dailyRecords: normalizedRecords,
    };
  }

  return {
    ...store,
    name: store.name || 'スロット店舗',
    rateLend,
    rateExchange,
    specialDayRules,
  };
}

/**
 * Load all registered stores from LocalStorage.
 * Only stores imported from user's HTML files are retained.
 * Sample store is completely excluded.
 */
export function getSavedStores(): StoreProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STORES);
    if (raw !== null) {
      const parsed: StoreProfile[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out dummy store 'plaza-515', sample stores, and any invalid entries
        const filtered = parsed
          .filter(
            (s) =>
              s &&
              typeof s === 'object' &&
              s.id !== 'plaza-515' &&
              s.id !== 'store-maruhan-kamata' &&
              s.id !== 'sample-store' &&
              !s.id?.includes('mitoya') &&
              s.name !== 'みとや大森町店'
          )
          .map(normalizeStore)
          .filter((s): s is StoreProfile => Boolean(s));

        if (filtered.length > 0) {
          // Deduplicate stores using areStoresSame
          const deduped: StoreProfile[] = [];
          for (const s of filtered) {
            const existingIdx = deduped.findIndex((d) => d && (d.id === s.id || areStoresSame(d.name, s.name)));
            if (existingIdx === -1) {
              deduped.push(s);
            } else {
              // Merge into existing
              const existing = deduped[existingIdx];
              const mergedDaily = mergeDailyRecords(existing.dailyRecords || [], s.dailyRecords || []);
              const updatedStore: StoreProfile = {
                ...existing,
                // Prefer shorter or cleaner name without trailing numbers if both exist
                name: (existing.name?.length || 0) <= (s.name?.length || 0) ? (existing.name || s.name) : (s.name || existing.name),
                address: existing.address && existing.address !== '住所未登録' ? existing.address : (s.address || '住所未登録'),
                oldEventDays: existing.oldEventDays || s.oldEventDays || '',
                exchangeRate: existing.exchangeRate || s.exchangeRate || '',
                rateLend: existing.rateLend || s.rateLend || 46,
                rateExchange: existing.rateExchange || s.rateExchange || 52,
                totalMachinesApprox: Math.max(existing.totalMachinesApprox || 0, s.totalMachinesApprox || 0),
                islandConfig: existing.islandConfig || s.islandConfig || '',
                islandDefinitions: existing.islandDefinitions || s.islandDefinitions,
                modelAliasDictionary: existing.modelAliasDictionary || s.modelAliasDictionary,
                categoryRates: existing.categoryRates || s.categoryRates,
                includeReusedMachinesInStats: existing.includeReusedMachinesInStats ?? s.includeReusedMachinesInStats,
                customRankingWeights: existing.customRankingWeights || s.customRankingWeights,
                customMachineRankingWeights: existing.customMachineRankingWeights || s.customMachineRankingWeights,
                dailyRecords: mergedDaily,
                dataRange:
                  mergedDaily.length > 0 && mergedDaily[0]?.date && mergedDaily[mergedDaily.length - 1]?.date
                    ? `${mergedDaily[0].date.slice(0, 7)} ～ ${mergedDaily[mergedDaily.length - 1].date.slice(0, 7)}`
                    : (existing.dataRange || ''),
                updatedAt: new Date().toISOString(),
              };
              deduped[existingIdx] = updatedStore;
            }
          }

          // If deduplication reduced the list, update storage
          if (deduped.length !== parsed.length) {
            saveStoresToStorage(deduped);
            const activeId = getActiveStoreId();
            if (!deduped.some((s) => s.id === activeId)) {
              setActiveStoreId(deduped[0].id);
            }
          }

          return deduped;
        }
      }
    }

    // Only user-imported HTML stores are kept. Empty when no imported stores.
    return [];
  } catch (err) {
    console.warn('Failed to load stores from localStorage', err);
    return [];
  }
}

/**
 * Strips pre-calculated derived fields to reduce JSON size by ~60%
 * (all derived numbers are automatically re-calculated by processStoreData on load)
 */
function stripDerivedForStorage(stores: StoreProfile[]): StoreProfile[] {
  return stores.map((s) => ({
    ...s,
    dailyRecords: (s.dailyRecords || []).map((d) => ({
      date: d.date,
      yearMonth: d.yearMonth,
      year: d.year,
      month: d.month,
      day: d.day,
      dayOfWeek: d.dayOfWeek,
      avgDiffCoins: d.avgDiffCoins,
      avgGames: d.avgGames,
      winRate: d.winRate,
      winMachines: d.winMachines,
      totalMachines: d.totalMachines,
      totalDiffCoins: d.totalDiffCoins,
      isOldEventDay: d.isOldEventDay,
      is7Day: d.is7Day,
      notable: d.notable,
      models: d.models,
      tails: d.tails,
      machines: d.machines,
    } as DailyRecord)),
  }));
}

/**
 * Asynchronously save stores array to IndexedDB with LocalStorage fallback and notification
 */
export async function saveStoresToStorageAsync(
  stores: StoreProfile[]
): Promise<{ idbSuccess: boolean; lsSuccess: boolean }> {
  let idbSuccess = false;
  let lsSuccess = false;

  try {
    const compact = stripDerivedForStorage(stores);
    localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify(compact));
    lsSuccess = true;
  } catch (err: any) {
    console.warn('LocalStorage save failed:', err);
  }

  try {
    await saveStoresToIdb(stores);
    idbSuccess = true;
  } catch (err: any) {
    console.warn('IndexedDB save failed:', err);
  }

  // If IndexedDB failed, report to user via toast notification with fallback status
  if (!idbSuccess) {
    if (lsSuccess) {
      notifyStorageEvent({
        type: 'warning',
        title: 'IndexedDB保存失敗（自動フォールバック成功）',
        message: 'ブラウザのIndexedDBへの書き込みに失敗しましたが、localStorageへバックアップ保存しました。',
        fallbackStatus: 'success',
      });
    } else {
      notifyStorageEvent({
        type: 'error',
        title: 'データ保存失敗（フォールバック不可）',
        message: 'IndexedDBおよびlocalStorageの両方で保存に失敗しました。ブラウザの容量上限に達した可能性があります。',
        fallbackStatus: 'failed',
      });
    }
  }

  return { idbSuccess, lsSuccess };
}

/**
 * Save stores array to storage (invokes saveStoresToStorageAsync in background)
 */
export function saveStoresToStorage(stores: StoreProfile[]): void {
  saveStoresToStorageAsync(stores).catch((err) => {
    console.warn('saveStoresToStorageAsync caught error:', err);
  });
}

/**
 * Asynchronously load stores prioritizing IndexedDB (for large 100+ file datasets)
 */
export async function loadStoresFromStorageAsync(): Promise<StoreProfile[]> {
  try {
    const idbStores = await loadStoresFromIdb();
    if (idbStores && idbStores.length > 0) {
      return idbStores
        .filter(
          (s) =>
            s &&
            typeof s === 'object' &&
            s.id !== 'plaza-515' &&
            s.id !== 'store-maruhan-kamata' &&
            s.id !== 'sample-store' &&
            !s.id?.includes('mitoya') &&
            s.name !== 'みとや大森町店'
        )
        .map(normalizeStore)
        .filter((s): s is StoreProfile => Boolean(s));
    }
  } catch (err) {
    console.warn('Failed to load from IndexedDB, falling back to LocalStorage', err);
  }
  return getSavedStores();
}

/**
 * Get active store ID
 */
export function getActiveStoreId(): string {
  try {
    const active = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    if (active) return active;
  } catch (e) {
    // ignore
  }
  return '';
}

/**
 * Set active store ID
 */
export function setActiveStoreId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
  } catch (e) {
    // ignore
  }
}

/**
 * Upsert a single store (e.g. from parsed HTML or edited parameters)
 */
export function upsertStore(store: StoreProfile): StoreProfile[] {
  const stores = getSavedStores();
  const index = stores.findIndex((s) => s.id === store.id || areStoresSame(s.name, store.name));

  const { rateLend, rateExchange } = parseRatesFromExchangeRate(store.exchangeRate || '');

  if (index >= 0) {
    const existing = stores[index];
    const mergedDaily = mergeDailyRecords(existing.dailyRecords || [], store.dailyRecords || []);
    const resolvedWeights =
      'customRankingWeights' in store
        ? store.customRankingWeights
        : existing.customRankingWeights;
    const resolvedMachineWeights =
      'customMachineRankingWeights' in store
        ? store.customMachineRankingWeights
        : existing.customMachineRankingWeights;
    const resolvedAlias =
      'modelAliasDictionary' in store
        ? store.modelAliasDictionary
        : existing.modelAliasDictionary;
    const resolvedCatRates =
      'categoryRates' in store
        ? store.categoryRates
        : existing.categoryRates;
    const resolvedReused =
      'includeReusedMachinesInStats' in store
        ? store.includeReusedMachinesInStats
        : existing.includeReusedMachinesInStats;

    stores[index] = {
      ...existing,
      ...store,
      id: existing.id, // keep canonical id
      name: store.name || existing.name,
      rateLend: rateLend || store.rateLend || existing.rateLend || 46,
      rateExchange: rateExchange || store.rateExchange || existing.rateExchange || 52,
      customRankingWeights: resolvedWeights,
      customMachineRankingWeights: resolvedMachineWeights,
      modelAliasDictionary: resolvedAlias,
      categoryRates: resolvedCatRates,
      includeReusedMachinesInStats: resolvedReused,
      dailyRecords: mergedDaily,
      updatedAt: new Date().toISOString(),
    };
  } else {
    stores.push({
      ...store,
      rateLend: rateLend || store.rateLend || 46,
      rateExchange: rateExchange || store.rateExchange || 52,
      createdAt: new Date().toISOString(),
    });
  }

  const savedStore = index >= 0 ? stores[index] : stores[stores.length - 1];

  let lsSuccess = false;
  try {
    const compact = stripDerivedForStorage(stores);
    localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify(compact));
    lsSuccess = true;
  } catch (err: any) {
    console.warn('LocalStorage save failed:', err);
  }

  putStoreToIdb(savedStore).catch((err) => {
    console.warn('Individual putStoreToIdb failed:', err);
    if (lsSuccess) {
      notifyStorageEvent({
        type: 'warning',
        title: 'IndexedDB保存失敗（自動フォールバック成功）',
        message: `店舗「${savedStore.name}」のIndexedDB書き込みに失敗しましたが、localStorageへバックアップ保存しました。`,
        fallbackStatus: 'success',
      });
    } else {
      notifyStorageEvent({
        type: 'error',
        title: '店舗データ保存失敗（フォールバック不可）',
        message: `店舗「${savedStore.name}」のIndexedDBおよびlocalStorage保存に失敗しました。`,
        fallbackStatus: 'failed',
      });
    }
  });

  return stores;
}

/**
 * Upsert multiple stores in batch
 */
export function upsertStores(newStores: StoreProfile[]): StoreProfile[] {
  const stores = getSavedStores();
  for (const store of newStores) {
    const index = stores.findIndex((s) => s.id === store.id || areStoresSame(s.name, store.name));
    const { rateLend, rateExchange } = parseRatesFromExchangeRate(store.exchangeRate || '');
    if (index >= 0) {
      const existing = stores[index];
      const mergedDaily = mergeDailyRecords(existing.dailyRecords || [], store.dailyRecords || []);
      const resolvedWeights =
        'customRankingWeights' in store
          ? store.customRankingWeights
          : existing.customRankingWeights;
      const resolvedMachineWeights =
        'customMachineRankingWeights' in store
          ? store.customMachineRankingWeights
          : existing.customMachineRankingWeights;
      const resolvedAlias =
        'modelAliasDictionary' in store
          ? store.modelAliasDictionary
          : existing.modelAliasDictionary;
      const resolvedCatRates =
        'categoryRates' in store
          ? store.categoryRates
          : existing.categoryRates;
      const resolvedReused =
        'includeReusedMachinesInStats' in store
          ? store.includeReusedMachinesInStats
          : existing.includeReusedMachinesInStats;

      stores[index] = {
        ...existing,
        ...store,
        id: existing.id, // keep canonical id
        name: store.name || existing.name,
        rateLend: rateLend || store.rateLend || existing.rateLend || 46,
        rateExchange: rateExchange || store.rateExchange || existing.rateExchange || 52,
        customRankingWeights: resolvedWeights,
        customMachineRankingWeights: resolvedMachineWeights,
        modelAliasDictionary: resolvedAlias,
        categoryRates: resolvedCatRates,
        includeReusedMachinesInStats: resolvedReused,
        dailyRecords: mergedDaily,
        updatedAt: new Date().toISOString(),
      };
    } else {
      stores.push({
        ...store,
        rateLend: rateLend || store.rateLend || 46,
        rateExchange: rateExchange || store.rateExchange || 52,
        createdAt: store.createdAt || new Date().toISOString(),
      });
    }
  }

  saveStoresToStorage(stores);
  return stores;
}

/**
 * Delete a store by ID
 */
export function deleteStore(id: string): { stores: StoreProfile[]; newActiveId: string } {
  let stores = getSavedStores();
  const targetStore = stores.find((s) => s.id === id);
  stores = stores.filter((s) => s.id !== id);

  let lsSuccess = false;
  try {
    const compact = stripDerivedForStorage(stores);
    localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify(compact));
    lsSuccess = true;
  } catch (err: any) {
    console.warn('LocalStorage save failed:', err);
  }

  deleteStoreFromIdb(id).catch((err) => {
    console.warn('deleteStoreFromIdb failed:', err);
    if (lsSuccess) {
      notifyStorageEvent({
        type: 'warning',
        title: 'IndexedDB削除失敗（自動フォールバック成功）',
        message: `店舗「${targetStore?.name || id}」のIndexedDB削除に失敗しましたが、localStorageからは削除しました。`,
        fallbackStatus: 'success',
      });
    } else {
      notifyStorageEvent({
        type: 'error',
        title: '店舗削除失敗（フォールバック不可）',
        message: `店舗「${targetStore?.name || id}」の削除に失敗しました。`,
        fallbackStatus: 'failed',
      });
    }
  });

  let activeId = getActiveStoreId();
  if (activeId === id || !stores.some((s) => s.id === activeId)) {
    activeId = stores.length > 0 ? stores[0].id : '';
    setActiveStoreId(activeId);
  }

  return { stores, newActiveId: activeId };
}

/**
 * 「初期状態にリセットで全店舗削除」
 * Clears ALL stores and resets the application to empty state
 */
export function resetAllStores(): StoreProfile[] {
  let lsSuccess = false;
  try {
    localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
    lsSuccess = true;
  } catch (e) {
    console.warn('LocalStorage clear failed:', e);
  }

  clearStoresFromIdb().catch((err) => {
    console.warn('clearStoresFromIdb failed:', err);
    if (lsSuccess) {
      notifyStorageEvent({
        type: 'warning',
        title: 'IndexedDBクリア失敗（自動フォールバック成功）',
        message: 'IndexedDBの全店舗クリアに失敗しましたが、localStorageはリセットしました。',
        fallbackStatus: 'success',
      });
    } else {
      notifyStorageEvent({
        type: 'error',
        title: '全店舗リセット失敗（フォールバック不可）',
        message: 'IndexedDBおよびlocalStorageのリセットに失敗しました。',
        fallbackStatus: 'failed',
      });
    }
  });

  return [];
}
