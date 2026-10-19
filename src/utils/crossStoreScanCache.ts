import { DailyRecord, MachineRankingWeights, SpecialDayRules } from '../data/types';
import { Fnv1aDual } from './machineBacktestCache';

export let SCAN_CACHE_VERSION = 1;

export function setScanCacheVersion(version: number): void {
  SCAN_CACHE_VERSION = version;
}

export interface StoreDateScanCell {
  storeId: string;
  storeName: string;
  targetDate: string;
  topNAvgExpectedDiff: number;
  evaluatedMachinesCount: number;
  excludedLowConfidenceCount: number;
  isSpecialDay: boolean;
  specialDayReason?: string;
  evaluationDays: number;
}

export interface CachedScanEntry {
  key: string;
  cell: StoreDateScanCell;
  savedAt: number;
  version: number;
  storeId: string;
}

export const MAX_SCAN_CACHE_ENTRIES_PER_STORE = 50;
export const MAX_SCAN_CACHE_ENTRIES_TOTAL = 300;

/**
 * Computes a deterministic cache key for store date candidate scan.
 * Format: "scan_v{version}__{storeId}__{targetDate}__{dataSig}__{topN}__{diffMetric}__{baseGames}__{weights}__{rules}"
 *
 * CRITICAL: Only records strictly prior to targetDate (r.date < targetDate)
 * are hashed into dataSig. Modifying or adding records on or after targetDate
 * produces the identical cache key, guaranteeing no leakage.
 */
export function computeStoreDateScanCacheKey(
  storeId: string,
  targetDate: string,
  dailyRecords: DailyRecord[] | undefined,
  topN: number = 10,
  diffMetric: 'actual' | 'baseGames' = 'actual',
  baseGames: number = 5000,
  weights?: MachineRankingWeights,
  rules?: SpecialDayRules,
  aliasDictionary?: Record<string, string>,
  includeReusedMachines?: boolean
): string {
  const sid = storeId || 'default';
  const allRecords = dailyRecords || [];
  // Filter prior records strictly before targetDate
  const priorRecords = allRecords.filter((r) => r.date < targetDate);
  const recCount = priorRecords.length;
  const firstDate = priorRecords[0]?.date || '';
  const lastDate = priorRecords[recCount - 1]?.date || '';

  const overallHasher = new Fnv1aDual();

  for (let i = 0; i < recCount; i++) {
    const r = priorRecords[i];
    const dayHasher = new Fnv1aDual();

    dayHasher.addString(r.date);
    dayHasher.addString(r.dayOfWeek);
    dayHasher.addBool(r.isReusedMachines);
    dayHasher.addBool(r.isOldEventDay);
    dayHasher.addBool(r.is7Day);

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

    overallHasher.addInt(dayHasher.h1);
    overallHasher.addInt(dayHasher.h2);
  }

  const dataSig = `${recCount}_${firstDate}_${lastDate}_${overallHasher.digestHex()}`;

  const weightsStr = weights
    ? JSON.stringify(weights, Object.keys(weights).sort())
    : 'defWeights';

  const rulesStr = rules
    ? JSON.stringify(rules, Object.keys(rules).sort())
    : 'defRules';

  const aliasStr =
    aliasDictionary && Object.keys(aliasDictionary).length > 0
      ? Object.keys(aliasDictionary)
          .sort()
          .map((k) => `${k}:${aliasDictionary[k]}`)
          .join(';')
      : 'noAlias';

  const reusedStr = includeReusedMachines ? 'incReused' : 'noReused';

  return `scan_v${SCAN_CACHE_VERSION}__${sid}__${targetDate}__${dataSig}__top${topN}__${diffMetric}__${baseGames}__${weightsStr}__${rulesStr}__${aliasStr}__${reusedStr}`;
}

// In-memory cache for fast synchronous access
const memoryScanCache = new Map<string, StoreDateScanCell>();

export function getMemoryScanCache(key: string): StoreDateScanCell | undefined {
  if (!key) return undefined;
  if (!key.startsWith(`scan_v${SCAN_CACHE_VERSION}__`)) {
    memoryScanCache.delete(key);
    return undefined;
  }
  return memoryScanCache.get(key);
}

export function setMemoryScanCache(key: string, cell: StoreDateScanCell): void {
  if (!key || !cell) return;
  memoryScanCache.set(key, cell);
}

export function clearMemoryScanCache(): void {
  memoryScanCache.clear();
}

// IndexedDB storage
const SCAN_DB_NAME = 'slorepo_cross_scan_cache';
const SCAN_STORE_NAME = 'scan_entries';
const SCAN_DB_VERSION = 1;

function openScanCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(SCAN_DB_NAME, SCAN_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCAN_STORE_NAME)) {
        const store = db.createObjectStore(SCAN_STORE_NAME, { keyPath: 'key' });
        store.createIndex('storeId', 'storeId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getScanCacheFromIdb(key: string): Promise<StoreDateScanCell | null> {
  if (!key) return null;
  try {
    const db = await openScanCacheDb();
    return new Promise((resolve) => {
      const tx = db.transaction(SCAN_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SCAN_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CachedScanEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        if (entry.version !== SCAN_CACHE_VERSION) {
          store.delete(key);
          resolve(null);
          return;
        }
        if (entry.cell) {
          resolve(entry.cell);
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

export async function putScanCacheToIdb(
  key: string,
  cell: StoreDateScanCell,
  storeId?: string
): Promise<void> {
  if (!key || !cell) return;
  try {
    const db = await openScanCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SCAN_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SCAN_STORE_NAME);

      const targetStoreId = storeId || cell.storeId || 'default';
      const newEntry: CachedScanEntry = {
        key,
        cell,
        savedAt: Date.now(),
        version: SCAN_CACHE_VERSION,
        storeId: targetStoreId,
      };

      store.put(newEntry);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota or private browsing errors
  }
}
