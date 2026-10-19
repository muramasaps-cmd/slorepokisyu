import { StoreProfile } from '../data/types';
import {
  calculateCrossStoreRanking,
  CrossStoreRankingOptions,
  CrossStoreRankingResult,
  CandidateDateScanResult,
  scanCandidateDates,
} from '../utils/crossStoreRanking';

export type CrossRankingWorkerRequest =
  | {
      type: 'CALCULATE_CROSS_RANKING';
      stores: StoreProfile[];
      targetDate: string;
      options?: CrossStoreRankingOptions;
    }
  | {
      type: 'SCAN_CANDIDATE_DATES';
      stores: StoreProfile[];
      dates: string[];
      options?: {
        topN?: number;
        diffMetric?: 'actual' | 'baseGames';
        baseGames?: number;
        legacyCrossShrink?: boolean;
      };
    };

export type CrossRankingWorkerResponse =
  | { type: 'PROGRESS'; progress: number; currentStore?: string }
  | { type: 'RESULT'; result: CrossStoreRankingResult }
  | { type: 'SCAN_PROGRESS'; progress: number; currentDate?: string; currentStore?: string }
  | { type: 'SCAN_RESULT'; result: CandidateDateScanResult }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<CrossRankingWorkerRequest>) => {
  const data = event.data;

  if (data.type === 'CALCULATE_CROSS_RANKING') {
    const { stores, targetDate, options } = data;
    try {
      self.postMessage({ type: 'PROGRESS', progress: 5 } satisfies CrossRankingWorkerResponse);
      const result = calculateCrossStoreRanking(stores, targetDate, {
        ...options,
        onProgress: (progress, currentStore) => {
          self.postMessage({
            type: 'PROGRESS',
            progress,
            currentStore,
          } satisfies CrossRankingWorkerResponse);
        },
      });
      self.postMessage({ type: 'PROGRESS', progress: 100 } satisfies CrossRankingWorkerResponse);
      self.postMessage({ type: 'RESULT', result } satisfies CrossRankingWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies CrossRankingWorkerResponse);
    }
  } else if (data.type === 'SCAN_CANDIDATE_DATES') {
    const { stores, dates, options } = data;
    try {
      self.postMessage({ type: 'SCAN_PROGRESS', progress: 5 } satisfies CrossRankingWorkerResponse);
      const result = scanCandidateDates(stores, dates, {
        ...options,
        onProgress: (progress, currentDate, currentStore) => {
          self.postMessage({
            type: 'SCAN_PROGRESS',
            progress,
            currentDate,
            currentStore,
          } satisfies CrossRankingWorkerResponse);
        },
      });
      self.postMessage({ type: 'SCAN_PROGRESS', progress: 100 } satisfies CrossRankingWorkerResponse);
      self.postMessage({ type: 'SCAN_RESULT', result } satisfies CrossRankingWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies CrossRankingWorkerResponse);
    }
  }
};
