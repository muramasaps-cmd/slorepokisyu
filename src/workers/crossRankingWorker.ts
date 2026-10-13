import { StoreProfile } from '../data/types';
import { calculateCrossStoreRanking, CrossStoreRankingOptions, CrossStoreRankingResult } from '../utils/crossStoreRanking';

export interface CrossRankingWorkerRequest {
  type: 'CALCULATE_CROSS_RANKING';
  stores: StoreProfile[];
  targetDate: string;
  options?: CrossStoreRankingOptions;
}

export type CrossRankingWorkerResponse =
  | { type: 'PROGRESS'; progress: number; currentStore?: string }
  | { type: 'RESULT'; result: CrossStoreRankingResult }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<CrossRankingWorkerRequest>) => {
  const { type, stores, targetDate, options } = event.data;

  if (type === 'CALCULATE_CROSS_RANKING') {
    try {
      self.postMessage({ type: 'PROGRESS', progress: 30 } satisfies CrossRankingWorkerResponse);
      const result = calculateCrossStoreRanking(stores, targetDate, options);
      self.postMessage({ type: 'PROGRESS', progress: 100 } satisfies CrossRankingWorkerResponse);
      self.postMessage({ type: 'RESULT', result } satisfies CrossRankingWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies CrossRankingWorkerResponse);
    }
  }
};
