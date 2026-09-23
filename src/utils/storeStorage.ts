import { DailyRecord, StoreProfile } from '../data/types';
import { parseRatesFromExchangeRate } from './htmlParser';
import { parseSpecialDayRulesFromText } from './specialDayRules';

const STORAGE_KEY_STORES = 'SLOT_ANALYZER_HTML_STORES_V2';
const STORAGE_KEY_ACTIVE_ID = 'SLOT_ANALYZER_HTML_ACTIVE_ID_V2';

/**
 * Normalizes store name for grouping/comparison (trims spaces, fullwidth characters, punctuation, dates, brackets, suffixes)
 */
export function normalizeStoreNameKey(name: string): string {
  if (!name) return '';
  let clean = name
    .trim()
    // convert full-width numbers and alphanumeric characters to half-width
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    // remove brackets like 【...】 or [...] or （...）
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    // remove date patterns like 2026-9-20, 2026/09/20, 9月20日
    .replace(/202\d[年/-]\d{1,2}[月/-]\d{1,2}[日]?/g, '')
    .replace(/\d{1,2}月\d{1,2}日/g, '')
    // remove day of week like (日), (月), etc.
    .replace(/[\(（][日月火水木金土][\)）]/g, '')
    // remove spaces, hyphens, punctuation
    .replace(/[\s\u3000\-_/・]+/g, '')
    .toLowerCase();

  // Strip trailing digits (often event day numbers like '7')
  clean = clean.replace(/[0-9]+$/, '');
  // Strip trailing "店"
  clean = clean.replace(/店$/, '');
  return clean;
}

/**
 * Robustly checks if two store names designate the exact same store
 * (e.g. 'マルハンメガシティ2000蒲田' vs 'マルハンメガシティ2000蒲田7' vs 'マルハンメガシティ2000蒲田店')
 */
export function areStoresSame(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  if (nameA.trim() === nameB.trim()) return true;

  const normA = normalizeStoreNameKey(nameA);
  const normB = normalizeStoreNameKey(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // If one contains the other and length difference is minor (<= 5 chars)
  if (
    (normA.includes(normB) || normB.includes(normA)) &&
    Math.abs(normA.length - normB.length) <= 5
  ) {
    return true;
  }

  return false;
}

/**
 * Merges two daily record sets by date, preserving highest quality records
 */
export function mergeDailyRecords(recordsA: DailyRecord[] = [], recordsB: DailyRecord[] = []): DailyRecord[] {
  const dateMap = new Map<string, DailyRecord>();

  for (const r of [...recordsA, ...recordsB]) {
    if (!dateMap.has(r.date)) {
      dateMap.set(r.date, r);
    } else {
      const prev = dateMap.get(r.date)!;
      const prevQuality =
        (prev.totalMachines > 0 ? 2 : 0) +
        (prev.winMachines !== null ? 2 : 0) +
        (prev.models && prev.models.length > 0 ? 10 : 0) +
        (prev.tails && prev.tails.length > 0 ? 5 : 0) +
        (prev.notable ? 1 : 0);
      const newQuality =
        (r.totalMachines > 0 ? 2 : 0) +
        (r.winMachines !== null ? 2 : 0) +
        (r.models && r.models.length > 0 ? 10 : 0) +
        (r.tails && r.tails.length > 0 ? 5 : 0) +
        (r.notable ? 1 : 0);

      if (newQuality >= prevQuality) {
        dateMap.set(r.date, r);
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
        // Filter out dummy store 'plaza-515', sample store 'store-maruhan-kamata', and any invalid entries
        const filtered = parsed
          .filter((s) => s && typeof s === 'object' && s.id !== 'plaza-515' && s.id !== 'store-maruhan-kamata' && s.id !== 'sample-store')
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
 * Save stores array to LocalStorage
 */
export function saveStoresToStorage(stores: StoreProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify(stores));
  } catch (err) {
    console.error('LocalStorage quota exceeded or save error', err);
  }
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
    stores[index] = {
      ...existing,
      ...store,
      id: existing.id, // keep canonical id
      name: existing.name || store.name,
      rateLend: rateLend || store.rateLend || existing.rateLend || 46,
      rateExchange: rateExchange || store.rateExchange || existing.rateExchange || 52,
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

  saveStoresToStorage(stores);
  return stores;
}

/**
 * Upsert multiple stores in batch
 */
export function upsertStores(newStores: StoreProfile[]): StoreProfile[] {
  let stores = getSavedStores();
  for (const store of newStores) {
    const index = stores.findIndex((s) => s.id === store.id || areStoresSame(s.name, store.name));
    const { rateLend, rateExchange } = parseRatesFromExchangeRate(store.exchangeRate || '');
    if (index >= 0) {
      const existing = stores[index];
      const mergedDaily = mergeDailyRecords(existing.dailyRecords || [], store.dailyRecords || []);
      stores[index] = {
        ...existing,
        ...store,
        id: existing.id, // keep canonical id
        name: existing.name || store.name,
        rateLend: rateLend || store.rateLend || existing.rateLend || 46,
        rateExchange: rateExchange || store.rateExchange || existing.rateExchange || 52,
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
  stores = stores.filter((s) => s.id !== id);
  saveStoresToStorage(stores);

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
  try {
    localStorage.setItem(STORAGE_KEY_STORES, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
  } catch (e) {
    // ignore
  }
  return [];
}
