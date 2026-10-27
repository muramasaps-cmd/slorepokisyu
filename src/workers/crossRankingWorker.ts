import {
  CrossRankingController,
  CrossRankingWorkerRequest,
  CrossRankingWorkerResponse,
} from './crossRankingController';

export type { CrossRankingWorkerRequest, CrossRankingWorkerResponse };

const controller = new CrossRankingController();
let messageQueue: CrossRankingWorkerRequest[] = [];
let isProcessing = false;

function pumpQueue() {
  if (isProcessing) return;
  if (messageQueue.length === 0) return;

  // Identify highest ranking and scan request IDs in queue to discard superseded requests
  let maxRankingReq = 0;
  let maxScanReq = 0;
  for (const m of messageQueue) {
    if (m.type === 'CALCULATE_CROSS_RANKING' && m.requestId) {
      if (m.requestId > maxRankingReq) maxRankingReq = m.requestId;
    } else if (m.type === 'SCAN_CANDIDATE_DATES' && m.requestId) {
      if (m.requestId > maxScanReq) maxScanReq = m.requestId;
    }
  }

  // Filter out any stale ranking or scan requests from the queue
  if (maxRankingReq > 0 || maxScanReq > 0) {
    messageQueue = messageQueue.filter((m) => {
      if (m.type === 'CALCULATE_CROSS_RANKING' && m.requestId && m.requestId < maxRankingReq) {
        return false;
      }
      if (m.type === 'SCAN_CANDIDATE_DATES' && m.requestId && m.requestId < maxScanReq) {
        return false;
      }
      return true;
    });
  }

  const nextMsg = messageQueue.shift();
  if (!nextMsg) return;

  isProcessing = true;
  // Yield briefly with setTimeout(..., 0) so pending message events can be enqueued
  setTimeout(() => {
    try {
      controller.handle(nextMsg, (res) => self.postMessage(res));
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies CrossRankingWorkerResponse);
    } finally {
      isProcessing = false;
      pumpQueue();
    }
  }, 0);
}

self.onmessage = (event: MessageEvent<CrossRankingWorkerRequest>) => {
  controller.registerRequest(event.data);
  messageQueue.push(event.data);
  pumpQueue();
};
