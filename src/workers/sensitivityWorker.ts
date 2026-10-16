import { DailyRecord } from '../data/types';
import { ModelSettingSpec } from '../utils/settingSpecs';
import {
  runSensitivityAnalysis,
  SensitivityAnalysisResult,
  EstimationOptions,
  DEFAULT_SENSITIVITY_THRESHOLDS,
} from '../utils/settingEstimation';

export interface SensitivityWorkerRequest {
  type: 'START_SENSITIVITY';
  modelName: string;
  dailyRecords: DailyRecord[];
  spec: ModelSettingSpec;
  options?: Omit<EstimationOptions, 'minGames' | 'pointEstimateOnly'>;
  thresholds?: number[];
}

export type SensitivityWorkerResponse =
  | { type: 'PROGRESS'; completed: number; total: number }
  | { type: 'RESULT'; result: SensitivityAnalysisResult }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<SensitivityWorkerRequest>) => {
  const { type, modelName, dailyRecords, spec, options, thresholds } = event.data;

  if (type === 'START_SENSITIVITY') {
    try {
      const ths = thresholds || DEFAULT_SENSITIVITY_THRESHOLDS;
      const result = runSensitivityAnalysis(
        modelName,
        dailyRecords,
        spec,
        options,
        ths,
        (completed, total) => {
          self.postMessage({
            type: 'PROGRESS',
            completed,
            total,
          } satisfies SensitivityWorkerResponse);
        }
      );
      self.postMessage({ type: 'RESULT', result } satisfies SensitivityWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies SensitivityWorkerResponse);
    }
  }
};
