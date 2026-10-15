import { DailyRecord, SpecialDayRules } from '../data/types';
import { runMachineBacktest, MachineBacktestResult, MachineBacktestOptions } from '../utils/backtestEngine';

export interface MachineBacktestWorkerRequest {
  type: 'START_BACKTEST';
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  options?: MachineBacktestOptions;
}

export type MachineBacktestWorkerResponse =
  | { type: 'PROGRESS'; progress: number }
  | { type: 'RESULT'; result: MachineBacktestResult }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<MachineBacktestWorkerRequest>) => {
  const { type, dailyRecords, specialDayRules, options } = event.data;

  if (type === 'START_BACKTEST') {
    try {
      const result = runMachineBacktest(dailyRecords, specialDayRules, {
        ...options,
        onProgress: (progress) => {
          self.postMessage({ type: 'PROGRESS', progress } satisfies MachineBacktestWorkerResponse);
        },
      });
      self.postMessage({ type: 'RESULT', result } satisfies MachineBacktestWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies MachineBacktestWorkerResponse);
    }
  }
};
