import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  TargetDecisionSummary,
  TargetDecisionCandidate,
} from '../TargetDecisionSummary';
import { roundForDisplay } from '../../utils/targetDisplay';

describe('TargetDecisionSummary Component', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  const sampleCandidates: TargetDecisionCandidate[] = [
    {
      rank: 1,
      machineNum: 555,
      modelName: 'マイジャグラーV',
      storeName: 'エスパス日拓渋谷本館',
      storeId: 'store-1',
      confidence: '高',
      expectedDiff: 432,
      interval80: [180, 680],
      evidenceDays: 6,
      contributions: {
        cohortDiffScore: 150,
        cohortWinRateScore: 40,
        highSettingScore: 20,
        modelScore: 70,
        tailBonusScore: 100,
        recentStateScore: 30,
      },
      isTailMatch: true,
      isZoro: true,
    },
    {
      rank: 2,
      machineNum: 777,
      modelName: 'アイムジャグラーEX',
      storeName: 'マルハン新宿東宝ビル店',
      storeId: 'store-2',
      confidence: '中',
      expectedDiff: 280,
      interval80: [80, 490],
      evidenceDays: 4,
      contributions: {
        cohortDiffScore: 90,
        cohortWinRateScore: 20,
        highSettingScore: 0,
        modelScore: 40,
        tailBonusScore: 80,
        recentStateScore: 0,
      },
      isZoro: true,
    },
    {
      rank: 3,
      machineNum: 312,
      modelName: 'ゴーゴージャグラー3',
      storeName: 'エスパス日拓秋葉原駅前店',
      storeId: 'store-3',
      confidence: '低',
      expectedDiff: 195,
      interval80: [-20, 410],
      evidenceDays: 3,
      contributions: {
        cohortDiffScore: 50,
        cohortWinRateScore: 10,
        highSettingScore: 0,
        modelScore: 30,
        tailBonusScore: 0,
        recentStateScore: 20,
      },
    },
  ];

  it('renders top 1st to 3rd candidate cards with rank, machine number, model, and confidence stars', () => {
    const html = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          storeName="エスパス日拓渋谷本館"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          sigma2={640000}
        />
      )
    );

    // Section header
    expect(html).toContain('今日の結論');
    expect(html).toContain('2024-01-27');

    // Rank badges
    expect(html).toContain('第1候補');
    expect(html).toContain('第2候補');
    expect(html).toContain('第3候補');

    // Prominent machine numbers
    expect(html).toContain('555');
    expect(html).toContain('777');
    expect(html).toContain('312');
    expect(html).toContain('番台');

    // Models
    expect(html).toContain('マイジャグラーV');
    expect(html).toContain('アイムジャグラーEX');
    expect(html).toContain('ゴーゴージャグラー3');

    // Confidence stars
    expect(html).toContain('★★★'); // '高'
    expect(html).toContain('★★☆'); // '中'
    expect(html).toContain('★☆☆'); // '低'

    // "候補に追加" action button
    expect(html).toContain('候補に追加');
  });

  it('Requirement 3: displays store name when scope is "all"', () => {
    const html = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="all"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          sigma2={640000}
        />
      )
    );

    expect(html).toContain('全店横断');
    expect(html).toContain('エスパス日拓渋谷本館');
    expect(html).toContain('マルハン新宿東宝ビル店');
    expect(html).toContain('エスパス日拓秋葉原駅前店');
  });

  it('Requirement 4: rounds numerical values to 50-coin units and explicitly states "目安"', () => {
    const html = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          storeName="エスパス日拓渋谷本館"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          sigma2={640000}
        />
      )
    );

    // Explicit "目安" mentions
    expect(html).toContain('目安');
    expect(html).toContain('平均との差 (目安)');
    expect(html).toContain('勝つ確率の目安:');
    expect(html).toContain('80%範囲 (目安):');

    // 1st candidate expectedDiff = 432, dayMean = 50 -> lift = 382 -> rounded 400
    // interval80 = [180, 680], liftLower = 130 -> 150, liftUpper = 630 -> 650
    expect(html).toContain('+400枚');
    expect(html).toContain('+150 〜 +650枚');
  });

  it('Requirement 2: renders 80% range bar with 0 marker (0の目盛り)', () => {
    const html = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          sigma2={640000}
        />
      )
    );

    // 0 marker with label
    expect(html).toContain('data-testid="zero-tick-marker"');
    expect(html).toContain('0 (平均)');
    expect(html).toContain('data-testid="range-80-band"');
    expect(html).toContain('data-testid="lift-point-marker"');
  });

  it('renders up to 3 colored reason tags for each candidate', () => {
    const html = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          sigma2={640000}
        />
      )
    );

    // Color tags for candidate 1: tailBonus (purple), cohort (blue), model (orange)
    expect(html).toContain('同条件の実績 (6日)');
    expect(html).toContain('ゾロ目台番');
    expect(html).toContain('機種実績');
  });

  it('Requirement 2 (見送り判定): prominently displays skip verdict banner when decideSkip is true', () => {
    // Case 1: Store validation is '優位性なし'
    const htmlNoEdge = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          hasEdge="優位性なし"
          recommendedModel="マイジャグラーV"
        />
      )
    );

    expect(htmlNoEdge).toContain('data-testid="skip-verdict-banner"');
    expect(htmlNoEdge).toContain(
      '今日は台番を絞る根拠が弱いです。機種マイジャグラーVの空いている台を打つのが無難です'
    );

    // Case 2: All candidates have confidence '低'
    const allLowCandidates: TargetDecisionCandidate[] = sampleCandidates.map((c) => ({
      ...c,
      confidence: '低',
    }));

    const htmlAllLow = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          candidates={allLowCandidates}
          dayMeanExpectedDiff={50}
          recommendedModel="ゴーゴージャグラー3"
        />
      )
    );

    expect(htmlAllLow).toContain('data-testid="skip-verdict-banner"');
    expect(htmlAllLow).toContain(
      '今日は台番を絞る根拠が弱いです。機種ゴーゴージャグラー3の空いている台を打つのが無難です'
    );
  });

  it('does NOT display skip verdict banner when decideSkip is false', () => {
    // Valid candidates with high confidence and positive 80% range lift lower bound
    const htmlValid = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          hasEdge="優位性あり"
        />
      )
    );

    expect(htmlValid).not.toContain('data-testid="skip-verdict-banner"');
    expect(htmlValid).not.toContain('今日は台番を絞る根拠が弱いです');
  });

  it('reflects checked candidate status when machine is in checkedMachineNums', () => {
    const checkedSet = new Set<number>([555]);

    const html = clean(
      renderToString(
        <TargetDecisionSummary
          targetDate="2024-01-27"
          scope="store"
          candidates={sampleCandidates}
          dayMeanExpectedDiff={50}
          checkedMachineNums={checkedSet}
        />
      )
    );

    expect(html).toContain('候補に追加済み');
  });

  it('preserves existing ranking order and values (only formats for display)', () => {
    // Verifies that ranking order [1, 2, 3] and machine numbers [555, 777, 312] remain unaltered
    const ranks = sampleCandidates.map((c) => c.rank);
    const machines = sampleCandidates.map((c) => c.machineNum);

    expect(ranks).toEqual([1, 2, 3]);
    expect(machines).toEqual([555, 777, 312]);
  });

  describe('Prompt 61: Alternatives & Roll-up on Occupied Machines', () => {
    const extendedCandidates: TargetDecisionCandidate[] = [
      {
        rank: 1,
        machineNum: 555,
        modelName: 'マイジャグラーV',
        storeName: 'エスパス日拓渋谷本館',
        storeId: 'store-1',
        confidence: '高',
        expectedDiff: 432,
        islandName: 'マイジャグ島A',
      },
      {
        rank: 2,
        machineNum: 777,
        modelName: 'アイムジャグラーEX',
        storeName: 'エスパス日拓渋谷本館',
        storeId: 'store-1',
        confidence: '中',
        expectedDiff: 350,
        islandName: 'アイム島B',
      },
      {
        rank: 3,
        machineNum: 556,
        modelName: 'マイジャグラーV',
        storeName: 'エスパス日拓渋谷本館',
        storeId: 'store-1',
        confidence: '中',
        expectedDiff: 320,
        islandName: 'マイジャグ島A',
      },
      {
        rank: 4,
        machineNum: 557,
        modelName: 'マイジャグラーV',
        storeName: 'エスパス日拓渋谷本館',
        storeId: 'store-1',
        confidence: '中',
        expectedDiff: 290,
        islandName: 'マイジャグ島A',
      },
      {
        rank: 5,
        machineNum: 558,
        modelName: 'マイジャグラーV',
        storeName: 'エスパス日拓渋谷本館',
        storeId: 'store-1',
        confidence: '中',
        expectedDiff: 260,
        islandName: 'マイジャグ島A',
      },
      {
        rank: 6,
        machineNum: 999,
        modelName: 'マイジャグラーV',
        storeName: 'エスパス日拓渋谷本館',
        storeId: 'store-1',
        confidence: '低',
        expectedDiff: 210,
        islandName: 'マイジャグ島A',
      },
    ];

    it('Requirement 1: renders alternatives section 「埋まっていたら」 with same-model runners-up and same-island candidates', () => {
      const html = clean(
        renderToString(
          <TargetDecisionSummary
            targetDate="2024-01-27"
            scope="store"
            storeName="エスパス日拓渋谷本館"
            candidates={extendedCandidates}
            dayMeanExpectedDiff={50}
            sigma2={640000}
          />
        )
      );

      // Alternatives header
      expect(html).toContain('埋まっていたら（代替候補）');
      expect(html).toContain('同機種の次点:');

      // Rank 1 is 555 (マイジャグラーV). Active top 3 are 555, 777, 556.
      // Alternatives for 555 should be 557, 558 (nextマイジャグラーV not in top 3)
      expect(html).toContain('557番台');
      expect(html).toContain('558番台');

      // Card action for marking unavailable is present
      expect(html).toContain('空いていない（除外して繰り上げ）');
    });

    it('Requirement 2: automatically rolls up candidate ranks when machine is marked unavailable', () => {
      // Mark candidate 1 (555) as unavailable
      const checkedState: Record<number, 'unavailable'> = {
        555: 'unavailable',
      };

      const html = clean(
        renderToString(
          <TargetDecisionSummary
            targetDate="2024-01-27"
            scope="store"
            storeName="エスパス日拓渋谷本館"
            candidates={extendedCandidates}
            checkedState={checkedState}
            dayMeanExpectedDiff={50}
            sigma2={640000}
          />
        )
      );

      // Header indicates 1 machine is excluded
      expect(html).toContain('1台除外中');

      // Candidate 777 should now be 第1候補
      expect(html).toContain('777');
      // Candidate 556 should now be 第2候補
      expect(html).toContain('556');
      // Candidate 557 should now be 第3候補 (rolled up from rank 4)
      expect(html).toContain('557');
    });

    it('Requirement 3: displays 「候補がありません。条件を緩めますか？」 when all candidates are unavailable', () => {
      // Mark all candidates as unavailable
      const allUnavailable: Record<number, 'unavailable'> = {
        555: 'unavailable',
        777: 'unavailable',
        556: 'unavailable',
        557: 'unavailable',
        558: 'unavailable',
        999: 'unavailable',
      };

      const html = clean(
        renderToString(
          <TargetDecisionSummary
            targetDate="2024-01-27"
            scope="store"
            storeName="エスパス日拓渋谷本館"
            candidates={extendedCandidates}
            checkedState={allUnavailable}
            dayMeanExpectedDiff={50}
            sigma2={640000}
          />
        )
      );

      // Requirement 3 message and relax button
      expect(html).toContain('data-testid="no-candidates-panel"');
      expect(html).toContain('候補がありません。条件を緩めますか？');
      expect(html).toContain('信頼度の低い台も含めて表示する');
      expect(html).toContain('チェックした台をリセット');
    });
  });
});

