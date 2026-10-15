import { DailyRecord, MachineRankingWeights, SpecialDayRules } from '../data/types';
import { MachineBacktestOptions, MachineBacktestResult } from './backtestEngine';

/**
 * Version constant for the backtest algorithm and cache schema.
 * Any cached entry with a different version will be discarded and deleted.
 */
export let BACKTEST_CACHE_VERSION = 1;

export function setBacktestCacheVersion(version: number): void {
  BACKTEST_CACHE_VERSION = version;
}

export const MAX_CACHE_ENTRIES_PER_STORE = 20;
export const MAX_CACHE_ENTRIES_TOTAL = 100;

export interface CachedBacktestEntry {
  key: string;
  result: MachineBacktestResult;
  savedAt: number;
  version: number;
  storeId: string;
}

export interface MachineBacktestExtraInputs {
  aliasDictionary?: Record<string, string>;
  includeReusedMachines?: boolean;
}

/**
 * Dual 32-bit FNV-1a hash accumulator using Math.imul.
 * Stream 1: Offset 0x811c9dc5, Prime 0x01000193
 * Stream 2: Offset 0x84222325, Prime 0x5bd1e995
 */
export class Fnv1aDual {
  h1: number;
  h2: number;

  constructor(seed1 = 0x811c9dc5, seed2 = 0x84222325) {
    this.h1 = seed1 >>> 0;
    this.h2 = seed2 >>> 0;
  }

  addByte(b: number): void {
    const byte = b & 0xff;
    this.h1 = Math.imul(this.h1 ^ byte, 0x01000193) >>> 0;
    this.h2 = Math.imul(this.h2 ^ byte, 0x5bd1e995) >>> 0;
  }

  addInt(val: number): void {
    const v = val | 0;
    let h1 = this.h1;
    let h2 = this.h2;

    h1 = Math.imul(h1 ^ (v & 0xff), 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ ((v >>> 8) & 0xff), 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ ((v >>> 16) & 0xff), 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ ((v >>> 24) & 0xff), 0x01000193) >>> 0;

    h2 = Math.imul(h2 ^ (v & 0xff), 0x5bd1e995) >>> 0;
    h2 = Math.imul(h2 ^ ((v >>> 8) & 0xff), 0x5bd1e995) >>> 0;
    h2 = Math.imul(h2 ^ ((v >>> 16) & 0xff), 0x5bd1e995) >>> 0;
    h2 = Math.imul(h2 ^ ((v >>> 24) & 0xff), 0x5bd1e995) >>> 0;

    this.h1 = h1;
    this.h2 = h2;
  }

  addString(str: string | undefined | null): void {
    if (str === undefined || str === null) {
      this.addInt(-1);
      return;
    }
    this.addInt(str.length);
    let h1 = this.h1;
    let h2 = this.h2;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ (c & 0xff), 0x01000193) >>> 0;
      h1 = Math.imul(h1 ^ (c >>> 8), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c & 0xff), 0x5bd1e995) >>> 0;
      h2 = Math.imul(h2 ^ (c >>> 8), 0x5bd1e995) >>> 0;
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  addFloat(val: number | undefined | null): void {
    if (val === undefined || val === null || !Number.isFinite(val)) {
      this.addInt(-999999999);
      return;
    }
    this.addInt(Math.round(val * 1000));
  }

  addBool(b: boolean | undefined | null): void {
    this.addByte(b ? 1 : 0);
  }

  digestHex(): string {
    return `${(this.h1 >>> 0).toString(16).padStart(8, '0')}${(this.h2 >>> 0).toString(16).padStart(8, '0')}`;
  }
}

/**
 * Extracts storeId from cacheKey formatted as `bt_v{version}__{storeId}__...`
 */
export function extractStoreIdFromKey(key: string): string {
  const parts = key.split('__');
  if (parts.length > 1 && parts[1]) {
    return parts[1];
  }
  return 'default';
}

/**
 * Computes a deterministic cache key for machine backtest.
 * Incorporates all parameters and record-level/machine-level metrics affecting backtest calculation.
 * Format: "bt_v{version}__{storeId}__{dataSig}__{weights}__{rules}__{options}__{alias}__{reused}"
 */
export function computeMachineBacktestCacheKey(
  storeId: string | undefined,
  dailyRecords: DailyRecord[] | undefined,
  weights: MachineRankingWeights | undefined,
  specialDayRules: SpecialDayRules | undefined,
  options: Partial<MachineBacktestOptions> | undefined,
  aliasDictionaryOrExtra?: Record<string, string> | MachineBacktestExtraInputs,
  includeReusedMachinesParam?: boolean
): string {
  const sid = storeId || 'default';
  const records = dailyRecords || [];
  const recCount = records.length;
  const firstDate = records[0]?.date || '';
  const lastDate = records[recCount - 1]?.date || '';

  let aliasDictionary: Record<string, string> | undefined;
  let includeReusedMachines: boolean | undefined = includeReusedMachinesParam;

  if (aliasDictionaryOrExtra && typeof aliasDictionaryOrExtra === 'object') {
    if ('aliasDictionary' in aliasDictionaryOrExtra || 'includeReusedMachines' in aliasDictionaryOrExtra) {
      const extra = aliasDictionaryOrExtra as MachineBacktestExtraInputs;
      aliasDictionary = extra.aliasDictionary;
      if (extra.includeReusedMachines !== undefined) {
        includeReusedMachines = extra.includeReusedMachines;
      }
    } else {
      aliasDictionary = aliasDictionaryOrExtra as Record<string, string>;
    }
  }

  // Dual FNV-1a hash using Math.imul: per-day hash first, then folded into overall hasher
  const overallHasher = new Fnv1aDual();

  for (let i = 0; i < recCount; i++) {
    const r = records[i];
    const dayHasher = new Fnv1aDual();

    // 1. Record attributes affecting backtest & special day determination
    dayHasher.addString(r.date);
    dayHasher.addString(r.dayOfWeek);
    dayHasher.addBool(r.isReusedMachines);
    dayHasher.addBool(r.isOldEventDay);
    dayHasher.addBool(r.is7Day);
    if (r.notable) {
      dayHasher.addString(r.notable);
    }

    // 2. Machine records: machineNum, modelName, games, diff, bb, rb, payoutRate, tailDigit, isZoro
    const machines = r.machines || [];
    dayHasher.addInt(machines.length);

    for (let m = 0; m < machines.length; m++) {
      const mach = machines[m];
      dayHasher.addInt(mach.machineNum);
      dayHasher.addString(mach.modelName);
      dayHasher.addInt(mach.games);
      dayHasher.addInt(mach.diff);
      dayHasher.addInt(mach.bb ?? 0);
      dayHasher.addInt(mach.rb ?? 0);
      dayHasher.addFloat(mach.payoutRate ?? 0);

      const tailDigit = mach.tailDigit !== undefined ? mach.tailDigit : (mach.machineNum % 10);
      dayHasher.addInt(tailDigit);
      dayHasher.addBool(mach.isZoro);
    }

    // 3. Fold the day's hash into the overall hasher
    overallHasher.addInt(dayHasher.h1);
    overallHasher.addInt(dayHasher.h2);
  }

  const overallHashHex = overallHasher.digestHex();
  const dataSig = `${recCount}_${firstDate}_${lastDate}_${overallHashHex}`;

  const weightsStr = weights
    ? JSON.stringify(weights, Object.keys(weights).sort())
    : 'defWeights';

  const rulesStr = specialDayRules
    ? JSON.stringify(specialDayRules, Object.keys(specialDayRules).sort())
    : 'defRules';

  // Normalize options to include only scalar backtest calculation parameters
  const normOpts = options
    ? {
        topN: options.topN,
        minEvidenceDays: options.minEvidenceDays,
        blockLength: options.blockLength,
        bootstrapIterations: options.bootstrapIterations,
        seed: options.seed,
        minPriorDays: options.minPriorDays,
      }
    : null;
  const optionsStr = normOpts
    ? JSON.stringify(normOpts, Object.keys(normOpts).sort())
    : 'defOpts';

  const aliasStr =
    aliasDictionary && Object.keys(aliasDictionary).length > 0
      ? Object.keys(aliasDictionary)
          .sort()
          .map((k) => `${k}:${aliasDictionary[k]}`)
          .join(';')
      : 'noAlias';

  const reusedStr = includeReusedMachines ? 'incReused' : 'noReused';

  return `bt_v${BACKTEST_CACHE_VERSION}__${sid}__${dataSig}__${weightsStr}__${rulesStr}__${optionsStr}__${aliasStr}__${reusedStr}`;
}

// In-memory cache for synchronous access across component mounts/renders
const memoryCache = new Map<string, MachineBacktestResult>();

export function getMemoryBacktestCache(key: string): MachineBacktestResult | undefined {
  if (!key) return undefined;
  if (!key.startsWith(`bt_v${BACKTEST_CACHE_VERSION}__`)) {
    memoryCache.delete(key);
    return undefined;
  }
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

export function clearMemoryBacktestCache(): void {
  memoryCache.clear();
}

const CACHE_DB_NAME = 'SlotAnalyzerBacktestCacheDB';
const CACHE_DB_VERSION = 2;
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
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
      } else {
        store = (e.target as IDBOpenDBRequest).transaction!.objectStore(CACHE_STORE_NAME);
      }
      if (!store.indexNames.contains('savedAt')) {
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
      if (!store.indexNames.contains('storeId')) {
        store.createIndex('storeId', 'storeId', { unique: false });
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
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CachedBacktestEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        // Requirement 4: Discard and delete from IDB if version does not match
        if (entry.version !== BACKTEST_CACHE_VERSION) {
          store.delete(key);
          resolve(null);
          return;
        }
        if (entry.result) {
          resolve(entry.result as MachineBacktestResult);
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

export async function putBacktestToIdb(
  key: string,
  result: MachineBacktestResult,
  storeId?: string
): Promise<void> {
  if (!key || !result) return;
  try {
    const db = await openBacktestCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);

      const targetStoreId = storeId || extractStoreIdFromKey(key);
      const newEntry: CachedBacktestEntry = {
        key,
        result,
        savedAt: Date.now(),
        version: BACKTEST_CACHE_VERSION,
        storeId: targetStoreId,
      };

      store.put(newEntry);

      // Enforce limits and cleanup stale versions
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const allEntries = (getAllReq.result || []) as CachedBacktestEntry[];

        // 1. Delete stale versions
        const validEntries: CachedBacktestEntry[] = [];
        for (const entry of allEntries) {
          if (entry.version !== BACKTEST_CACHE_VERSION) {
            store.delete(entry.key);
          } else {
            validEntries.push(entry);
          }
        }

        // 2. Limit per store: keep newest MAX_CACHE_ENTRIES_PER_STORE, delete oldest savedAt
        const byStore = new Map<string, CachedBacktestEntry[]>();
        for (const entry of validEntries) {
          const sid = entry.storeId || 'default';
          const list = byStore.get(sid) || [];
          list.push(entry);
          byStore.set(sid, list);
        }

        const remainingEntries: CachedBacktestEntry[] = [];
        for (const [, entries] of byStore.entries()) {
          if (entries.length > MAX_CACHE_ENTRIES_PER_STORE) {
            // Sort ascending by savedAt: oldest entries come first
            entries.sort((a, b) => a.savedAt - b.savedAt);
            const excess = entries.length - MAX_CACHE_ENTRIES_PER_STORE;
            for (let i = 0; i < excess; i++) {
              store.delete(entries[i].key);
            }
            remainingEntries.push(...entries.slice(excess));
          } else {
            remainingEntries.push(...entries);
          }
        }

        // 3. Limit overall: keep newest MAX_CACHE_ENTRIES_TOTAL across all stores
        if (remainingEntries.length > MAX_CACHE_ENTRIES_TOTAL) {
          remainingEntries.sort((a, b) => a.savedAt - b.savedAt);
          const excess = remainingEntries.length - MAX_CACHE_ENTRIES_TOTAL;
          for (let i = 0; i < excess; i++) {
            store.delete(remainingEntries[i].key);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } catch {
    // Ignore errors silently (e.g. storage quota, private mode)
  }
}

export async function clearBacktestCacheIdb(): Promise<void> {
  try {
    const db = await openBacktestCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
