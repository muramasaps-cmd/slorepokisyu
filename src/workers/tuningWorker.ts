import { DailyRecord, SpecialDayRules } from '../data/types';
import { runAutoTuning } from '../utils/backtestEngine';

export interface TuningWorkerRequest {
  type: 'START_TUNING';
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
  k?: number;
}

export type TuningWorkerResponse =
  | { type: 'PROGRESS'; progress: number }
  | { type: 'RESULT'; result: ReturnType<typeof runAutoTuning> }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<TuningWorkerRequest>) => {
  const { type, dailyRecords, specialDayRules, oldEventDays = '', k = 3 } = event.data;

  if (type === 'START_TUNING') {
    try {
      const result = runAutoTuning(
        dailyRecords,
        specialDayRules,
        oldEventDays,
        k,
        (progressPercent) => {
          self.postMessage({ type: 'PROGRESS', progress: progressPercent } satisfies TuningWorkerResponse);
        }
      );
      self.postMessage({ type: 'RESULT', result } satisfies TuningWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies TuningWorkerResponse);
    }
  }
};
