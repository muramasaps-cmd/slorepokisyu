import { describe, it, expect } from 'vitest';
import {
  computeLift,
  estimateWinProbability,
  roundForDisplay,
  buildReasonTags,
  decideSkip,
  getSkipAdviceMessage,
  standardNormalCdf,
  findAlternativesForCandidate,
  rollupDecisionCandidates,
} from '../targetDisplay';
import { MachineRankingContributions } from '../../data/types';

describe('targetDisplay utility functions', () => {
  describe('computeLift', () => {
    it('calculates difference between machine expected diff and day mean expected diff with small hand-calculated values', () => {
      // 400 - 100 = 300
      expect(computeLift(400, 100)).toBe(300);
      // 50 - 100 = -50
      expect(computeLift(50, 100)).toBe(-50);
      // 0 - 0 = 0
      expect(computeLift(0, 0)).toBe(0);
      // -150 - (-50) = -100
      expect(computeLift(-150, -50)).toBe(-100);
      // 725.5 - 200.5 = 525
      expect(computeLift(725.5, 200.5)).toBe(525);
    });
  });

  describe('estimateWinProbability', () => {
    it('computes win probability via standard normal CDF using hand-calculated values', () => {
      // sigma2 = 10000 -> sigma = 100
      // machineDiff = 0 -> z = 0 -> Phi(0) = 0.5 (50%)
      const zeroDiff = estimateWinProbability(0, 10000, 0);
      expect(zeroDiff.machineWinProb).toBeCloseTo(0.5, 3);
      expect(zeroDiff.hallWinProb).toBeCloseTo(0.5, 3);

      // machineDiff = 100, sigma = 100 -> z = 1.0 -> Phi(1) ≈ 0.8413
      const plusOneSigma = estimateWinProbability(100, 10000, 50);
      expect(plusOneSigma.machineWinProb).toBeCloseTo(0.8413, 3);
      // hallDiff = 50, sigma = 100 -> z = 0.5 -> Phi(0.5) ≈ 0.6915
      expect(plusOneSigma.hallWinProb).toBeCloseTo(0.6915, 3);

      // machineDiff = -100, sigma = 100 -> z = -1.0 -> Phi(-1) ≈ 0.1587
      const minusOneSigma = estimateWinProbability(-100, 10000, 0);
      expect(minusOneSigma.machineWinProb).toBeCloseTo(0.1587, 3);

      // machineDiff = 200, sigma = 100 -> z = 2.0 -> Phi(2) ≈ 0.9772
      const plusTwoSigma = estimateWinProbability(200, 10000, 0);
      expect(plusTwoSigma.machineWinProb).toBeCloseTo(0.9772, 3);
    });

    it('falls back to default sigma (800) when sigma2 is 0, negative, or invalid', () => {
      const fallbackResult = estimateWinProbability(800, 0, 0);
      // safeSigma = 800 -> z = 800 / 800 = 1.0 -> Phi(1) ≈ 0.8413
      expect(fallbackResult.machineWinProb).toBeCloseTo(0.8413, 3);
      expect(fallbackResult.hallWinProb).toBeCloseTo(0.5, 3);
    });

    it('correctly calculates standardNormalCdf extreme values', () => {
      expect(standardNormalCdf(10)).toBe(1);
      expect(standardNormalCdf(-10)).toBe(0);
      expect(standardNormalCdf(NaN)).toBe(0.5);
    });
  });

  describe('roundForDisplay', () => {
    it('rounds numbers to the nearest 50-coin units', () => {
      expect(roundForDisplay(234)).toBe(250);
      expect(roundForDisplay(221)).toBe(200);
      expect(roundForDisplay(25)).toBe(50);
      expect(roundForDisplay(24)).toBe(0);
      expect(roundForDisplay(0)).toBe(0);
      expect(roundForDisplay(-24)).toBe(0);
      expect(roundForDisplay(-25)).toBe(0);
      expect(roundForDisplay(-26)).toBe(-50);
      expect(roundForDisplay(-78)).toBe(-100);
      expect(roundForDisplay(-100)).toBe(-100);
      expect(roundForDisplay(475)).toBe(500);
      expect(roundForDisplay(474)).toBe(450);
    });

    it('handles NaN or non-finite inputs safely', () => {
      expect(roundForDisplay(NaN)).toBe(0);
      expect(roundForDisplay(Infinity)).toBe(0);
    });
  });

  describe('buildReasonTags', () => {
    const mockContributions: MachineRankingContributions = {
      cohortDiffScore: 120,
      cohortWinRateScore: 30,
      highSettingScore: 0,
      modelScore: 80,
      tailBonusScore: 200,
      recentStateScore: 40,
    };

    it('produces colored tags according to ranking contributions and limits to top 3', () => {
      const tags = buildReasonTags(mockContributions, 5, true, false);

      expect(tags.length).toBeLessThanOrEqual(3);
      // Top scores: tailBonus (200, purple), cohort (150+50, blue), model (80, orange)
      const colors = tags.map((t) => t.color);
      expect(colors).toContain('purple'); // 末尾・ゾロ目
      expect(colors).toContain('blue');   // 同条件の実績
      expect(colors).toContain('orange'); // 機種

      const cohortTag = tags.find((t) => t.color === 'blue');
      expect(cohortTag?.label).toBe('同条件の実績 (5日)');

      const tailTag = tags.find((t) => t.color === 'purple');
      expect(tailTag?.label).toBe('特定末尾一致');
    });

    it('creates zoro label when isZoro is true', () => {
      const tags = buildReasonTags(
        { ...mockContributions, modelScore: 10 },
        3,
        false,
        true
      );
      const tailTag = tags.find((t) => t.color === 'purple');
      expect(tailTag?.label).toBe('ゾロ目台番');
    });

    it('creates green tag for recentStateScore', () => {
      const contributionsWithHighRecent: MachineRankingContributions = {
        cohortDiffScore: 10,
        cohortWinRateScore: 0,
        highSettingScore: 0,
        modelScore: 0,
        tailBonusScore: 0,
        recentStateScore: 150,
      };
      const tags = buildReasonTags(contributionsWithHighRecent, 0);
      const greenTag = tags.find((t) => t.color === 'green');
      expect(greenTag).toBeDefined();
      expect(greenTag?.label).toBe('直近好調');
    });

    it('falls back to string parsing when rawReasons array is supplied without contributions', () => {
      const rawReasons = [
        '同コホート5回中4回プラス、平均+1,200枚',
        '対象日の特定末尾と台番末尾が一致 (+50pt)',
        '所属機種「マイジャグラーV」の機種期待スコア支持 (+40pt)',
      ];
      const tags = buildReasonTags({ rawReasons, evidenceDays: 5 });
      expect(tags.length).toBe(3);
      expect(tags[0].color).toBe('blue');
      expect(tags[1].color).toBe('purple');
      expect(tags[2].color).toBe('orange');
    });

    it('falls back to default tag if no contributions or reasons are present', () => {
      const tags = buildReasonTags(null, 3);
      expect(tags.length).toBe(1);
      expect(tags[0].label).toBe('過去実績 (3日)');
    });
  });

  describe('decideSkip', () => {
    it('returns true when store validation is "優位性なし" (Condition 1)', () => {
      const skipWithNoEdgeText = decideSkip({
        hasEdge: '優位性なし',
        topCandidates: [
          { confidence: '高', interval80: [200, 800], expectedDiff: 500 },
        ],
        dayMeanExpectedDiff: 100,
      });
      expect(skipWithNoEdgeText).toBe(true);

      const skipWithNoEdgeBool = decideSkip({
        hasEdge: false,
        topCandidates: [
          { confidence: '高', interval80: [200, 800], expectedDiff: 500 },
        ],
        dayMeanExpectedDiff: 100,
      });
      expect(skipWithNoEdgeBool).toBe(true);
    });

    it('returns true when all top candidates have confidence "低" (Condition 2)', () => {
      const skipAllLow = decideSkip({
        hasEdge: '優位性あり',
        topCandidates: [
          { confidence: '低', interval80: [200, 800], expectedDiff: 500 },
          { confidence: '低', interval80: [150, 700], expectedDiff: 400 },
          { confidence: '低', interval80: [100, 600], expectedDiff: 350 },
        ],
        dayMeanExpectedDiff: 50,
      });
      expect(skipAllLow).toBe(true);
    });

    it('returns true when lower bounds of the 80% range for difference from average are all <= 0 (Condition 3)', () => {
      // Day mean is 200. Candidate lower bounds are 150, 180, 200.
      // Lift lower bounds: 150 - 200 = -50 <= 0, 180 - 200 = -20 <= 0, 200 - 200 = 0 <= 0.
      const skipNegativeLower = decideSkip({
        hasEdge: '優位性あり',
        topCandidates: [
          { confidence: '高', interval80: [150, 800], expectedDiff: 500 },
          { confidence: '中', interval80: [180, 700], expectedDiff: 450 },
          { confidence: '中', interval80: [200, 650], expectedDiff: 400 },
        ],
        dayMeanExpectedDiff: 200,
      });
      expect(skipNegativeLower).toBe(true);
    });

    it('returns false when edge is valid, confidence is sufficient, and at least one candidate has positive 80% lift lower bound', () => {
      // Day mean is 100. Candidate 1 lower bound is 250 -> lift lower = 150 > 0!
      const validCandidate = decideSkip({
        hasEdge: '優位性あり',
        topCandidates: [
          { confidence: '高', interval80: [250, 800], expectedDiff: 500 },
          { confidence: '中', interval80: [120, 700], expectedDiff: 400 },
          { confidence: '中', interval80: [50, 600], expectedDiff: 300 },
        ],
        dayMeanExpectedDiff: 100,
      });
      expect(validCandidate).toBe(false);
    });

    it('supports positional arguments as well as object parameters', () => {
      expect(decideSkip('優位性なし', [])).toBe(true);
      expect(decideSkip(false, [])).toBe(true);
    });

    it('returns true when candidate list is empty', () => {
      expect(decideSkip({ topCandidates: [] })).toBe(true);
    });
  });

  describe('getSkipAdviceMessage', () => {
    it('formats skip advice message correctly with given model name', () => {
      const msg = getSkipAdviceMessage('アイムジャグラーEX');
      expect(msg).toBe('今日は台番を絞る根拠が弱いです。機種アイムジャグラーEXの空いている台を打つのが無難です');
    });

    it('falls back to ◯◯ placeholder when model name is omitted', () => {
      const msg = getSkipAdviceMessage();
      expect(msg).toBe('今日は台番を絞る根拠が弱いです。機種◯◯の空いている台を打つのが無難です');
    });
  });

  describe('findAlternativesForCandidate (Prompt 61)', () => {
    const pool = [
      { machineNum: 101, modelName: 'マイジャグラーV', expectedDiff: 500, rank: 1, islandName: 'A島' },
      { machineNum: 102, modelName: 'マイジャグラーV', expectedDiff: 450, rank: 2, islandName: 'A島' },
      { machineNum: 103, modelName: 'マイジャグラーV', expectedDiff: 400, rank: 3, islandName: 'B島' },
      { machineNum: 104, modelName: 'マイジャグラーV', expectedDiff: 350, rank: 4, islandName: 'A島' },
      { machineNum: 105, modelName: 'マイジャグラーV', expectedDiff: 300, rank: 5, islandName: 'B島' },
      { machineNum: 201, modelName: 'アイムジャグラーEX', expectedDiff: 380, rank: 6, islandName: 'A島' },
      { machineNum: 202, modelName: 'アイムジャグラーEX', expectedDiff: 320, rank: 7, islandName: 'C島' },
    ];

    it('finds same model runners-up up to 3 machines in order', () => {
      const cand = pool[0]; // 101 (マイジャグラーV)
      const alts = findAlternativesForCandidate(cand, pool, { sameModelLimit: 3 });

      // Should return 102, 103, 104 (max 3) in order
      expect(alts.sameModel).toHaveLength(3);
      expect(alts.sameModel[0].machineNum).toBe(102);
      expect(alts.sameModel[1].machineNum).toBe(103);
      expect(alts.sameModel[2].machineNum).toBe(104);
      expect(alts.sameModel.map((m) => m.machineNum)).not.toContain(101);
    });

    it('excludes candidate itself and any specified excludeMachineNums', () => {
      const cand = pool[0]; // 101
      const excluded = new Set([102]);
      const alts = findAlternativesForCandidate(cand, pool, {
        excludeMachineNums: excluded,
        sameModelLimit: 3,
      });

      expect(alts.sameModel.map((m) => m.machineNum)).toEqual([103, 104, 105]);
    });

    it('finds top machine in the same island when islandName is present', () => {
      const cand = pool[0]; // 101, A島
      const alts = findAlternativesForCandidate(cand, pool, {
        excludeMachineNums: new Set([102]), // 102 excluded
        sameIslandLimit: 1,
      });

      // In A島, pool machines: 101 (cand), 102 (excluded), 104, 201
      // Next available in A島 is 104 (or 201)
      expect(alts.sameIsland).toHaveLength(1);
      expect(alts.sameIsland[0].machineNum).toBe(104);
      expect(alts.sameIsland[0].islandName).toBe('A島');
    });

    it('returns empty sameIsland when candidate has no islandName', () => {
      const candNoIsland = { machineNum: 301, modelName: 'ハナハナ', expectedDiff: 200 };
      const alts = findAlternativesForCandidate(candNoIsland, pool);
      expect(alts.sameIsland).toEqual([]);
    });
  });

  describe('rollupDecisionCandidates (Prompt 61)', () => {
    const testPool = [
      { machineNum: 101, modelName: 'マイジャグラーV', expectedDiff: 500, confidence: '高', rank: 1 },
      { machineNum: 102, modelName: 'マイジャグラーV', expectedDiff: 450, confidence: '高', rank: 2 },
      { machineNum: 103, modelName: 'アイムジャグラーEX', expectedDiff: 400, confidence: '中', rank: 3 },
      { machineNum: 104, modelName: 'マイジャグラーV', expectedDiff: 350, confidence: '中', rank: 4 },
      { machineNum: 105, modelName: 'ゴーゴージャグラー3', expectedDiff: 300, confidence: '低', rank: 5 },
      { machineNum: 106, modelName: 'ハッピージャグラーV', expectedDiff: 250, confidence: '低', rank: 6 },
    ];

    it('automatically rolls up rank 1, 2, 3 when top candidate is marked as unavailable', () => {
      // 101 is unavailable
      const checkedState = { 101: 'unavailable' };
      const res = rollupDecisionCandidates(testPool, {
        checkedState,
        topN: 3,
      });

      expect(res.unavailableCount).toBe(1);
      expect(res.allFilled).toBe(false);
      expect(res.activeCandidates).toHaveLength(3);

      // Rolled-up candidates: 102 becomes rank 1, 103 becomes rank 2, 104 becomes rank 3
      expect(res.activeCandidates[0].machineNum).toBe(102);
      expect(res.activeCandidates[0].rank).toBe(1);
      expect(res.activeCandidates[0].originalRank).toBe(2);

      expect(res.activeCandidates[1].machineNum).toBe(103);
      expect(res.activeCandidates[1].rank).toBe(2);

      expect(res.activeCandidates[2].machineNum).toBe(104);
      expect(res.activeCandidates[2].rank).toBe(3);
    });

    it('filters out low-confidence machines by default and flags hasRelaxableCandidates', () => {
      // Only machines 101, 102, 103, 104 are high or medium.
      // Mark 101, 102, 103, 104 as unavailable
      const checkedState = {
        101: 'unavailable',
        102: 'unavailable',
        103: 'unavailable',
        104: 'unavailable',
      };
      const res = rollupDecisionCandidates(testPool, {
        checkedState,
        includeLowConfidence: false,
      });

      expect(res.allFilled).toBe(true);
      expect(res.hasRelaxableCandidates).toBe(true);
      expect(res.activeCandidates).toHaveLength(0);
    });

    it('includes low-confidence machines when includeLowConfidence is true', () => {
      const checkedState = {
        101: 'unavailable',
        102: 'unavailable',
        103: 'unavailable',
        104: 'unavailable',
      };
      const res = rollupDecisionCandidates(testPool, {
        checkedState,
        includeLowConfidence: true,
      });

      expect(res.allFilled).toBe(false);
      expect(res.activeCandidates).toHaveLength(2); // 105, 106
      expect(res.activeCandidates[0].machineNum).toBe(105);
      expect(res.activeCandidates[0].rank).toBe(1);
      expect(res.activeCandidates[1].machineNum).toBe(106);
      expect(res.activeCandidates[1].rank).toBe(2);
    });

    it('attaches alternative recommendations excluding other active top candidates', () => {
      const res = rollupDecisionCandidates(testPool, { topN: 3 });
      // Active: 101, 102, 103
      // Candidate 101 (マイジャグラーV) has 102 active, so 102 should NOT be in alternatives
      // Alternatives for 101 should be 104 (マイジャグラーV)
      const cand1 = res.activeCandidates[0];
      expect(cand1.machineNum).toBe(101);
      const sameModelAltNums = cand1.alternatives.sameModel.map((m) => m.machineNum);
      expect(sameModelAltNums).not.toContain(101);
      expect(sameModelAltNums).not.toContain(102); // 102 is active candidate #2
      expect(sameModelAltNums).toContain(104);
    });
  });
});

