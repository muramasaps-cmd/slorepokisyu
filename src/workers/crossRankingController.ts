import { StoreProfile } from '../data/types';
import { hashDailyRecordForScan } from '../utils/crossStoreScanCache';
import {
  calculateCrossStoreRanking,
  CrossStoreRankingOptions,
  CrossStoreRankingResult,
  CandidateDateScanResult,
  scanCandidateDates,
} from '../utils/crossStoreRanking';

export interface ModelFilterSignatureParams {
  preset?: string;
  selectedModelNames?: string[];
}

export type CrossRankingWorkerRequest =
  | {
      type: 'SET_STORES';
      signature: string;
      stores?: StoreProfile[];
    }
  | {
      type: 'CALCULATE_CROSS_RANKING';
      requestId?: number;
      stores?: StoreProfile[];
      signature?: string;
      targetDate: string;
      options?: CrossStoreRankingOptions;
    }
  | {
      type: 'SCAN_CANDIDATE_DATES';
      requestId?: number;
      stores?: StoreProfile[];
      signature?: string;
      dates: string[];
      options?: {
        topN?: number;
        diffMetric?: 'actual' | 'baseGames';
        baseGames?: number;
        legacyCrossShrink?: boolean;
      };
    };

export type CrossRankingWorkerResponse =
  | { type: 'PROGRESS'; requestId?: number; progress: number; currentStore?: string }
  | { type: 'RESULT'; requestId?: number; result: CrossStoreRankingResult }
  | { type: 'SCAN_PROGRESS'; requestId?: number; progress: number; currentDate?: string; currentStore?: string }
  | { type: 'SCAN_RESULT'; requestId?: number; result: CandidateDateScanResult }
  | { type: 'STORES_SET'; signature: string }
  | { type: 'ERROR'; requestId?: number; error: string };

/**
 * Computes a deterministic signature representing stores data state and active model filters.
 * Captures store IDs, record counts, date boundaries, content hash across daily records
 * (including machine numbers, model names, games, diffs), custom ranking weights, special day rules,
 * and active model filter preset/names.
 */
export function computeStoresSignature(
  stores: StoreProfile[],
  modelFilter?: ModelFilterSignatureParams
): string {
  if (!stores || stores.length === 0) return 'empty';

  let filterSig = '';
  if (modelFilter) {
    const preset = modelFilter.preset || 'all';
    const models = (modelFilter.selectedModelNames || []).slice().sort().join(',');
    filterSig = `__filter:${preset}:${models}`;
  }

  const storesSig = stores
    .map((s) => {
      const records = s.dailyRecords || [];
      const count = records.length;
      const firstDate = count > 0 ? records[0].date : '';
      const lastDate = count > 0 ? records[count - 1].date : '';

      // Hash content of all daily records using hashDailyRecordForScan
      let dataHash1 = 0x811c9dc5;
      let dataHash2 = 0x9dc5811c;
      for (let i = 0; i < records.length; i++) {
        const { h1, h2 } = hashDailyRecordForScan(records[i]);
        dataHash1 = ((dataHash1 ^ h1) * 0x01000193) >>> 0;
        dataHash2 = ((dataHash2 ^ h2) * 0x01000193) >>> 0;
      }
      const dataHash = `${dataHash1.toString(16)}_${dataHash2.toString(16)}`;

      const customWeightsSig = s.customMachineRankingWeights
        ? JSON.stringify(s.customMachineRankingWeights)
        : '';
      const specialDaysSig = s.specialDayRules ? JSON.stringify(s.specialDayRules) : '';
      return `${s.id}:${count}:${firstDate}:${lastDate}:${dataHash}:${customWeightsSig}:${specialDaysSig}`;
    })
    .join('|');

  return `${storesSig}${filterSig}`;
}

/**
 * Pure controller logic for cross-store ranking and candidate date scanning.
 * Maintains stored profiles in memory across requests and skips obsolete requestIds.
 */
export class CrossRankingController {
  private stores: StoreProfile[] = [];
  private storesSignature: string = '';
  private latestRankingRequestId: number = 0;
  private latestScanRequestId: number = 0;

  public registerRequest(message: CrossRankingWorkerRequest): void {
    if (message.type === 'CALCULATE_CROSS_RANKING' && message.requestId) {
      if (message.requestId > this.latestRankingRequestId) {
        this.latestRankingRequestId = message.requestId;
      }
    } else if (message.type === 'SCAN_CANDIDATE_DATES' && message.requestId) {
      if (message.requestId > this.latestScanRequestId) {
        this.latestScanRequestId = message.requestId;
      }
    }
  }

  public getStores(): StoreProfile[] {
    return this.stores;
  }

  public getStoresSignature(): string {
    return this.storesSignature;
  }

  public setStores(stores: StoreProfile[], signature?: string): void {
    this.stores = stores;
    this.storesSignature = signature || computeStoresSignature(stores);
  }

  public handle(
    message: CrossRankingWorkerRequest,
    emit?: (res: CrossRankingWorkerResponse) => void
  ): CrossRankingWorkerResponse[] {
    const responses: CrossRankingWorkerResponse[] = [];
    const send = (res: CrossRankingWorkerResponse) => {
      responses.push(res);
      if (emit) emit(res);
    };

    if (message.type === 'SET_STORES') {
      if (message.stores) {
        this.setStores(message.stores, message.signature);
        send({ type: 'STORES_SET', signature: this.storesSignature });
      } else if (message.signature && message.signature === this.storesSignature) {
        send({ type: 'STORES_SET', signature: this.storesSignature });
      } else {
        send({
          type: 'ERROR',
          error: 'Stores not initialized in controller or signature mismatch',
        });
      }
      return responses;
    }

    if (message.type === 'CALCULATE_CROSS_RANKING') {
      if (message.stores) {
        this.setStores(message.stores, message.signature);
      }
      const reqId = message.requestId ?? 0;
      if (reqId && reqId < this.latestRankingRequestId) {
        // Obsolete request superseded by a newer one
        return responses;
      }
      if (reqId) {
        this.latestRankingRequestId = reqId;
      }

      try {
        send({ type: 'PROGRESS', requestId: reqId, progress: 5 });
        const result = calculateCrossStoreRanking(this.stores, message.targetDate, {
          ...message.options,
          onProgress: (progress, currentStore) => {
            if (!reqId || reqId >= this.latestRankingRequestId) {
              send({ type: 'PROGRESS', requestId: reqId, progress, currentStore });
            }
          },
        });

        if (!reqId || reqId >= this.latestRankingRequestId) {
          send({ type: 'PROGRESS', requestId: reqId, progress: 100 });
          send({ type: 'RESULT', requestId: reqId, result });
        }
      } catch (err) {
        send({
          type: 'ERROR',
          requestId: reqId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return responses;
    }

    if (message.type === 'SCAN_CANDIDATE_DATES') {
      if (message.stores) {
        this.setStores(message.stores, message.signature);
      }
      const reqId = message.requestId ?? 0;
      if (reqId && reqId < this.latestScanRequestId) {
        // Obsolete request superseded by a newer one
        return responses;
      }
      if (reqId) {
        this.latestScanRequestId = reqId;
      }

      try {
        send({ type: 'SCAN_PROGRESS', requestId: reqId, progress: 5 });
        const result = scanCandidateDates(this.stores, message.dates, {
          ...message.options,
          onProgress: (progress, currentDate, currentStore) => {
            if (!reqId || reqId >= this.latestScanRequestId) {
              send({
                type: 'SCAN_PROGRESS',
                requestId: reqId,
                progress,
                currentDate,
                currentStore,
              });
            }
          },
        });

        if (!reqId || reqId >= this.latestScanRequestId) {
          send({ type: 'SCAN_PROGRESS', requestId: reqId, progress: 100 });
          send({ type: 'SCAN_RESULT', requestId: reqId, result });
        }
      } catch (err) {
        send({
          type: 'ERROR',
          requestId: reqId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return responses;
    }

    return responses;
  }
}
