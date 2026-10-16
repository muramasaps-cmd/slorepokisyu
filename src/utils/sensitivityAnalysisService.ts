import { DailyRecord } from '../data/types';
import { ModelSettingSpec } from './settingSpecs';
import {
  SensitivityAnalysisResult,
  EstimationOptions,
  DEFAULT_SENSITIVITY_THRESHOLDS,
  estimateModelSettingDistribution,
  calculateInWeightedPayoutRate,
  SensitivityAnalysisRow,
  GameWeightMode,
} from './settingEstimation';
import { Fnv1aDual } from './machineBacktestCache';
import type {
  SensitivityWorkerRequest,
  SensitivityWorkerResponse,
} from '../workers/sensitivityWorker';

/**
 * Computes deterministic data signature using the exact same dual FNV-1a hashing as machineBacktestCache.ts.
 */
export function computeDailyRecordsSignature(dailyRecords: DailyRecord[]): string {
  const records = dailyRecords || [];
  const recCount = records.length;
  const firstDate = records[0]?.date || '';
  const lastDate = records[recCount - 1]?.date || '';

  const overallHasher = new Fnv1aDual();

  for (let i = 0; i < recCount; i++) {
    const r = records[i];
    const dayHasher = new Fnv1aDual();

    dayHasher.addString(r.date);
    dayHasher.addString(r.dayOfWeek);
    dayHasher.addBool(r.isReusedMachines);
    dayHasher.addBool(r.isOldEventDay);
    dayHasher.addBool(r.is7Day);
    if (r.notable) {
      dayHasher.addString(r.notable);
    }

    const machines = r.machines || (r as any).machineRecords || [];
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

      const tailDigit = mach.tailDigit !== undefined ? mach.tailDigit : mach.machineNum % 10;
      dayHasher.addInt(tailDigit);
      dayHasher.addBool(mach.isZoro);
    }

    overallHasher.addInt(dayHasher.h1);
    overallHasher.addInt(dayHasher.h2);
  }

  const overallHashHex = overallHasher.digestHex();
  return `${recCount}_${firstDate}_${lastDate}_${overallHashHex}`;
}

/**
 * Computes memory cache key for sensitivity analysis:
 * データ署名（machineBacktestCache.ts と同じ方式）＋機種＋仕様テーブル＋高設定の閾値＋ボーナス尤度のオプション
 */
export function computeSensitivityCacheKey(
  modelName: string,
  dailyRecords: DailyRecord[],
  spec: ModelSettingSpec | null,
  options?: Omit<EstimationOptions, 'minGames' | 'pointEstimateOnly'>
): string {
  const dataSig = computeDailyRecordsSignature(dailyRecords);
  const specKey =
    spec && spec.settings
      ? spec.settings
          .map((s) => `${s.settingNum}:${s.payoutRate}:${s.bbDenom ?? ''}:${s.rbDenom ?? ''}`)
          .join('|')
      : 'no_spec';
  const highThreshold = options?.highSettingThreshold ?? 4;
  const usePoissonBonus = !!options?.usePoissonBonus;
  const poissonWeight = options?.poissonWeight ?? 0.5;
  const useRecordedPayout = !!options?.useRecordedPayoutRate;

  return `sens_v1__${dataSig}__${modelName}__${specKey}__th${highThreshold}__bonus:${usePoissonBonus}:${poissonWeight}__rec:${useRecordedPayout}`;
}

// In-memory cache for sensitivity results (Requirement 2)
const memoryCache = new Map<string, SensitivityAnalysisResult>();
const MAX_CACHE_SIZE = 50;

export function getSensitivityMemoryCache(key: string): SensitivityAnalysisResult | undefined {
  if (!key) return undefined;
  return memoryCache.get(key);
}

export function setSensitivityMemoryCache(key: string, result: SensitivityAnalysisResult): void {
  if (!key) return;
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, result);
}

export function clearSensitivityMemoryCache(): void {
  memoryCache.clear();
}

export interface SensitivityExecutionHandle {
  cancel: () => void;
  promise: Promise<SensitivityAnalysisResult>;
}

/**
 * Executes sensitivity analysis asynchronously:
 * 1. Checks memory cache first using data signature and options key (Requirement 2)
 * 2. Attempts execution via Web Worker with progress updates (Requirement 1)
 * 3. Falls back to condition-by-condition setTimeout execution if Web Worker is unavailable
 * 4. Supports aborting/cancelling execution when model, spec, or options change
 */
export function executeSensitivityAnalysisAsync(
  modelName: string,
  dailyRecords: DailyRecord[],
  spec: ModelSettingSpec | null,
  options: Omit<EstimationOptions, 'minGames' | 'pointEstimateOnly'> = {},
  thresholds: number[] = DEFAULT_SENSITIVITY_THRESHOLDS,
  onProgress?: (completed: number, total: number) => void
): SensitivityExecutionHandle {
  const cacheKey = computeSensitivityCacheKey(modelName, dailyRecords, spec, options);
  const cached = getSensitivityMemoryCache(cacheKey);

  if (cached) {
    onProgress?.(thresholds.length * 3, thresholds.length * 3);
    return {
      cancel: () => {},
      promise: Promise.resolve(cached),
    };
  }

  if (!spec || !spec.settings || spec.settings.length < 2) {
    const emptyResult: SensitivityAnalysisResult = {
      rows: [],
      maxHighSettingRate: 0,
      minHighSettingRate: 0,
      rateSpread: 0,
      isHighSensitivity: false,
      warningMessage: '',
    };
    onProgress?.(0, 0);
    return {
      cancel: () => {},
      promise: Promise.resolve(emptyResult),
    };
  }

  let isCancelled = false;
  let worker: Worker | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    isCancelled = true;
    if (worker) {
      try {
        worker.terminate();
      } catch {
        // ignore
      }
      worker = null;
    }
    if (activeTimer !== null) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
  };

  const promise = new Promise<SensitivityAnalysisResult>((resolve, reject) => {
    // 1. Try Web Worker first
    try {
      if (typeof Worker !== 'undefined') {
        worker = new Worker(new URL('../workers/sensitivityWorker.ts', import.meta.url), {
          type: 'module',
        });
      }
    } catch {
      worker = null;
    }

    if (worker) {
      worker.onmessage = (event: MessageEvent<SensitivityWorkerResponse>) => {
        if (isCancelled) return;
        const data = event.data;
        if (data.type === 'PROGRESS') {
          onProgress?.(data.completed, data.total);
        } else if (data.type === 'RESULT') {
          setSensitivityMemoryCache(cacheKey, data.result);
          resolve(data.result);
          worker?.terminate();
          worker = null;
        } else if (data.type === 'ERROR') {
          // If worker encountered error, attempt fallback
          runSetTimeoutFallback();
        }
      };

      worker.onerror = () => {
        if (isCancelled) return;
        runSetTimeoutFallback();
      };

      worker.postMessage({
        type: 'START_SENSITIVITY',
        modelName,
        dailyRecords,
        spec,
        options,
        thresholds,
      } satisfies SensitivityWorkerRequest);
      return;
    }

    // 2. Fallback to condition-by-condition setTimeout execution
    runSetTimeoutFallback();

    function runSetTimeoutFallback() {
      if (isCancelled) return;
      if (worker) {
        try {
          worker.terminate();
        } catch {
          // ignore
        }
        worker = null;
      }

      const totalConditions = thresholds.length * 3; // 15 conditions
      onProgress?.(0, totalConditions);

      const rawModelRecords: Array<{ games: number; diff: number }> = [];
      for (const dr of dailyRecords) {
        const mList = dr.machines || (dr as any).machineRecords;
        if (mList) {
          for (const mr of mList) {
            if (mr.modelName === modelName) {
              rawModelRecords.push({ games: mr.games, diff: mr.diff });
            }
          }
        }
      }

      const rows: SensitivityAnalysisRow[] = [];
      const allObservedRates: number[] = [];

      const modes: GameWeightMode[] = ['raw', 'cap3000', 'constant'];
      let conditionIndex = 0;

      // Partial results per threshold
      let currentThIndex = 0;
      let currentEstRaw: any = null;
      let currentEstCap3000: any = null;
      let currentEstConstant: any = null;

      function executeNextCondition() {
        if (isCancelled) return;

        const th = thresholds[currentThIndex];
        const modeIndex = conditionIndex % 3;
        const mode = modes[modeIndex];

        const est = estimateModelSettingDistribution(modelName, dailyRecords, spec!, {
          ...options,
          minGames: th,
          gameWeightMode: mode,
          pointEstimateOnly: true,
        });

        if (mode === 'raw') currentEstRaw = est;
        else if (mode === 'cap3000') currentEstCap3000 = est;
        else if (mode === 'constant') currentEstConstant = est;

        conditionIndex++;
        onProgress?.(conditionIndex, totalConditions);

        // When all 3 modes for current threshold are finished
        if (modeIndex === 2) {
          const matchingRecords = rawModelRecords.filter((r) => r.games >= th);
          const inWeightedPayoutRate = calculateInWeightedPayoutRate(matchingRecords);
          const label = th === 0 ? '全台日(0)' : `${th.toLocaleString()}G`;

          if (currentEstRaw.evaluatedRecords > 0) {
            allObservedRates.push(
              currentEstRaw.highSettingOverallRate,
              currentEstCap3000.highSettingOverallRate,
              currentEstConstant.highSettingOverallRate
            );
          }

          rows.push({
            minGames: th,
            label,
            evaluatedRecords: currentEstRaw.evaluatedRecords,
            excludedCount: currentEstRaw.excludedCount,
            inWeightedPayoutRate,
            rateRaw: currentEstRaw.highSettingOverallRate,
            rateCap3000: currentEstCap3000.highSettingOverallRate,
            rateConstant: currentEstConstant.highSettingOverallRate,
            distribution: currentEstRaw.distribution.map((d: any) => ({
              label: d.label,
              proportion: d.proportion,
            })),
            highSettingRate: currentEstRaw.highSettingOverallRate,
          });

          currentThIndex++;
        }

        if (conditionIndex < totalConditions) {
          activeTimer = setTimeout(executeNextCondition, 0);
        } else {
          // All 15 conditions completed
          const maxHighSettingRate =
            allObservedRates.length > 0 ? Math.max(...allObservedRates) : 0;
          const minHighSettingRate =
            allObservedRates.length > 0 ? Math.min(...allObservedRates) : 0;
          const rateSpread = Number((maxHighSettingRate - minHighSettingRate).toFixed(1));
          const isHighSensitivity = rateSpread >= 30.0;

          const finalResult: SensitivityAnalysisResult = {
            rows,
            maxHighSettingRate,
            minHighSettingRate,
            rateSpread,
            isHighSensitivity,
            warningMessage: isHighSensitivity
              ? '出率だけでは分布は決められません。上の『範囲』を参考にしてください。'
              : '',
          };

          setSensitivityMemoryCache(cacheKey, finalResult);
          resolve(finalResult);
        }
      }

      activeTimer = setTimeout(executeNextCondition, 0);
    }
  });

  return { cancel, promise };
}
