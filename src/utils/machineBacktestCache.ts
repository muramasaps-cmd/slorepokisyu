import { DailyRecord, MachineRankingWeights, SpecialDayRules } from '../data/types';
import { MachineBacktestOptions, MachineBacktestResult } from './backtestEngine';

/**
 * Computes a deterministic cache key for machine backtest.
 * Format: "bt_storeId__dataSig__weights__rules__options"
 */
export function computeMachineBacktestCacheKey(
  storeId: string | undefined,
  dailyRecords: DailyRecord[] | undefined,
  weights: MachineRankingWeights | undefined,
  specialDayRules: SpecialDayRules | undefined,
  options: Partial<MachineBacktestOptions> | undefined
): string {
  const sid = storeId || 'default';
  const records = dailyRecords || [];
  const recCount = records.length;
  const firstDate = records[0]?.date || '';
  const lastDate = records[recCount - 1]?.date || '';

  // Fast hash of record dates and machine metrics without serializing full JSON
  let hash = 0x811c9dc5;
  for (let i = 0; i < recCount; i++) {
    const r = records[i];
    const d = r.date;
    for (let c = 0; c < d.length; c++) {
      hash = (hash ^ d.charCodeAt(c)) * 0x01000193;
    }
    const mCount = r.machines ? r.machines.length : 0;
    hash = (hash ^ mCount) * 0x01000193;
    if (r.machines && r.machines.length > 0) {
      let diffSum = 0;
      for (let m = 0; m < r.machines.length; m++) {
        diffSum += r.machines[m].diff;
      }
      hash = (hash ^ (diffSum | 0)) * 0x01000193;
    }
  }
  const hashHex = (hash >>> 0).toString(16);
  const dataSig = `${recCount}_${firstDate}_${lastDate}_${hashHex}`;

  const weightsStr = weights ? JSON.stringify(weights) : 'defWeights';
  const rulesStr = specialDayRules ? JSON.stringify(specialDayRules) : 'defRules';
  const optionsStr = options ? JSON.stringify(options) : 'defOpts';

  return `bt_${sid}__${dataSig}__${weightsStr}__${rulesStr}__${optionsStr}`;
}

// In-memory cache for instant synchronous access across component mounts/renders
const memoryCache = new Map<string, MachineBacktestResult>();

export function getMemoryBacktestCache(key: string): MachineBacktestResult | undefined {
  if (!key) return undefined;
  return memoryCache.get(key);
}

export function setMemoryBacktestCache(key: string, result: MachineBacktestResult): void {
  if (!key) return;
  // Cap memory cache size to avoid unbounded memory usage
  if (memoryCache.size >= 50) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, result);
}

const CACHE_DB_NAME = 'SlotAnalyzerBacktestCacheDB';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'machine_backtest_cache';

function openBacktestCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getBacktestFromIdb(key: string): Promise<MachineBacktestResult | null> {
  if (!key) return null;
  try {
    const db = await openBacktestCacheDb();
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.result) {
          resolve(req.result.result as MachineBacktestResult);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putBacktestToIdb(key: string, result: MachineBacktestResult): Promise<void> {
  if (!key) return;
  try {
    const db = await openBacktestCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      store.put({ key, result, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore errors silently (e.g. storage quota, private mode)
  }
}
