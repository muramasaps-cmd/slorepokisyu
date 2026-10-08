import { describe, it, expect } from 'vitest';
import { formatMachineReasons } from '../TargetMachineRanking';
import { TargetMachineScore } from '../../utils/targetMachineRanking';

describe('TargetMachineRanking formatMachineReasons', () => {
  it('formats reasons from real contributions and evidence days', () => {
    const mockScore: TargetMachineScore = {
      machineNum: 555,
      modelName: 'マイジャグラーV',
      rank: 1,
      totalScore: 58.5,
      confidence: '高',
      evidenceDays: 8,
      cohortEvidenceDays: 4,
      contributions: {
        cohortDiffScore: 32.8,
        cohortWinRateScore: 7.5,
        highSettingScore: 10.0,
        modelScore: 4.2,
        tailBonusScore: 4.0,
        recentStateScore: 0,
      },
      stats: {
        cohortAvgDiff: 820,
        shrunkDiff: 750,
        cohortWinRate: 75,
        shrunkWinRate: 70,
        modelCohortAvgDiff: 200,
        modelCohortWinRate: 52,
        highSettingRate: 50.0,
        highSettingCount: 4,
        modelScore: 16.8,
        isTailMatch: false,
        isZoro: true,
        priorDayDiff: 120,
        priorDayDate: '2025-01-05',
      },
      history: [],
    };

    const reasons = formatMachineReasons(mockScore);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    // E.g. "同コホート4回中3回プラス、平均+820枚"
    expect(reasons[0]).toContain('同コホート4回中3回プラス');
    expect(reasons[0]).toContain('820');
    // E.g. "高設定挙動履歴 8日中4日発生"
    expect(reasons.some((r) => r.includes('高設定挙動履歴'))).toBe(true);
    // E.g. "ゾロ目台番ボーナス"
    expect(reasons.some((r) => r.includes('ゾロ目'))).toBe(true);
  });
});
