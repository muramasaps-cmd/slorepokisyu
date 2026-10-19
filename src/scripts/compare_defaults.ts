import { createSyntheticMachineRecords } from '../utils/__tests__/testDataGenerator';
import { calculateTargetMachineRanking } from '../utils/targetMachineRanking';
import { runMachineBacktest } from '../utils/backtestEngine';
import { SpecialDayRules, MachineRankingWeights } from '../data/types';

const specialDayRules: SpecialDayRules = {};

const oldWeights: MachineRankingWeights = {
  diffWeight: 0.04,
  winRateWeight: 0.3,
  highSettingWeight: 20.0,
  modelScoreWeight: 0.25,
  tailMatchBonus: 8.0,
  zoroBonus: 4.0,
  recentStateWeight: 0,
  shrinkageK: 3,
  shrinkageMode: 'fixed',
  confidenceMode: 'legacy',
  cohortMode: 'interaction',
  standardGames: 5000,
  baseGames: 5000,
  highSettingShrinkage: { enabled: false, priorStrength: 4 },
};

const newWeights: MachineRankingWeights = {
  diffWeight: 0.04,
  winRateWeight: 0.3,
  highSettingWeight: 20.0,
  modelScoreWeight: 0.25,
  tailMatchBonus: 0.0,
  zoroBonus: 0.0,
  recentStateWeight: 0,
  shrinkageK: 3,
  shrinkageMode: 'empirical',
  confidenceMode: 'reliability',
  cohortMode: 'interaction',
  standardGames: 5000,
  baseGames: 5000,
  highSettingShrinkage: { enabled: true, priorStrength: 4 },
};

async function main() {
  console.log('========================================================');
  console.log('1. ゴールデンデータセット (60日×40台, seed=12345, 2025-03-02)');
  console.log('========================================================');

  const recordsGolden = createSyntheticMachineRecords({
    daysCount: 60,
    machinesCount: 40,
    seed: 12345,
  });
  const targetDate = '2025-03-02';

  const rankingOld = calculateTargetMachineRanking(targetDate, recordsGolden, specialDayRules, oldWeights);
  const rankingNew = calculateTargetMachineRanking(targetDate, recordsGolden, specialDayRules, newWeights);

  console.log('\n--- 旧方式 (fixed + tailMatch8 + zoro4 + highSettingShrinkage無効) 上位10台 ---');
  rankingOld.rankings.slice(0, 10).forEach((r) => {
    console.log(
      `Rank ${r.rank.toString().padStart(2)}: 台番 ${r.machineNum} | ${r.modelName.padEnd(12)} | スコア ${r.totalScore.toFixed(1).padStart(6)} | 期待差枚 ${r.stats.shrunkDiff.toFixed(1).padStart(7)} | 信頼度 ${r.confidence}`
    );
  });

  console.log('\n--- 新方式 (empirical + tailMatch0 + zoro0 + highSettingShrinkage有効) 上位10台 ---');
  rankingNew.rankings.slice(0, 10).forEach((r) => {
    console.log(
      `Rank ${r.rank.toString().padStart(2)}: 台番 ${r.machineNum} | ${r.modelName.padEnd(12)} | スコア ${r.totalScore.toFixed(1).padStart(6)} | 期待差枚 ${r.stats.shrunkDiff.toFixed(1).padStart(7)} (事後平均 ${r.posteriorMean?.toFixed(1)}) | 信頼度 ${r.confidence}`
    );
  });

  console.log('\n--- 上位比較表 ---');
  console.log('| 順位 | 旧台番 (期待差枚) | 新台番 (期待差枚) | 差枚変化 (旧→新) | 順位変動 |');
  console.log('|---|---|---|---|---|');
  for (let i = 0; i < 10; i++) {
    const o = rankingOld.rankings[i];
    const n = rankingNew.rankings[i];
    const oldMachInNew = rankingNew.rankings.find((r) => r.machineNum === o.machineNum);
    const rankDiff = oldMachInNew ? o.rank - oldMachInNew.rank : 0;
    const diffChange = oldMachInNew ? oldMachInNew.stats.shrunkDiff - o.stats.shrunkDiff : 0;
    console.log(
      `| ${i + 1} | 台${o.machineNum} (${o.stats.shrunkDiff >= 0 ? '+' : ''}${o.stats.shrunkDiff}枚) | 台${n.machineNum} (${n.stats.shrunkDiff >= 0 ? '+' : ''}${n.stats.shrunkDiff}枚) | 台${o.machineNum}: ${diffChange >= 0 ? '+' : ''}${diffChange.toFixed(1)}枚 | 台${o.machineNum}: ${rankDiff > 0 ? `+${rankDiff}up` : rankDiff < 0 ? `${rankDiff}down` : '±0'} |`
    );
  }

  console.log('\n========================================================');
  console.log('2. 較正テストデータ (30台×80日, 3シード) における');
  console.log('   「画面の期待差枚と翌日の実績」比較');
  console.log('========================================================');

  const seeds = [42, 123, 777];

  for (const seed of seeds) {
    console.log(`\n--- シード: ${seed} (台間真の差なし: ノイズ環境) ---`);
    const records = createSyntheticMachineRecords({
      daysCount: 80,
      machinesCount: 30,
      biasedMachineNums: [],
      biasBonus: 0,
      seed,
    });

    let oldExpSum = 0;
    let oldActSum = 0;
    let newExpSum = 0;
    let newActSum = 0;
    let count = 0;

    for (let i = 65; i < records.length; i++) {
      const prior = records.slice(0, i);
      const nextDay = records[i];
      const tDate = nextDay.date;

      const rOld = calculateTargetMachineRanking(tDate, prior, undefined, oldWeights);
      const rNew = calculateTargetMachineRanking(tDate, prior, undefined, newWeights);

      const topOld = rOld.rankings.slice(0, 20);
      const topNew = rNew.rankings.slice(0, 20);

      const expOld = topOld.reduce((s, r) => s + (r.stats.expectedDiffStd ?? r.stats.shrunkDiff), 0) / topOld.length;
      const actOld =
        topOld.reduce((s, r) => {
          const m = nextDay.machines.find((x) => x.machineNum === r.machineNum);
          return s + (m ? m.diff : 0);
        }, 0) / topOld.length;

      const expNew = topNew.reduce((s, r) => s + (r.stats.expectedDiffStd ?? r.stats.shrunkDiff), 0) / topNew.length;
      const actNew =
        topNew.reduce((s, r) => {
          const m = nextDay.machines.find((x) => x.machineNum === r.machineNum);
          return s + (m ? m.diff : 0);
        }, 0) / topNew.length;

      oldExpSum += expOld;
      oldActSum += actOld;
      newExpSum += expNew;
      newActSum += actNew;
      count++;
    }

    const avgExpOld = oldExpSum / count;
    const avgActOld = oldActSum / count;
    const avgExpNew = newExpSum / count;
    const avgActNew = newActSum / count;
    const oldGap = Math.abs(avgExpOld - avgActOld);
    const newGap = Math.abs(avgExpNew - avgActNew);

    console.log(`旧方式 (fixed):     画面期待差枚 = ${avgExpOld.toFixed(1)}枚 | 翌日実績 = ${avgActOld.toFixed(1)}枚 | 乖離(バイアス) = ${oldGap.toFixed(1)}枚`);
    console.log(`新方式 (empirical): 画面期待差枚 = ${avgExpNew.toFixed(1)}枚 | 翌日実績 = ${avgActNew.toFixed(1)}枚 | 乖離(バイアス) = ${newGap.toFixed(1)}枚 (改善: -${(oldGap - newGap).toFixed(1)}枚)`);

    console.log(`\n--- シード: ${seed} (台間真の差あり: 15台に+300枚バイアス) ---`);
    const recordsBiased = createSyntheticMachineRecords({
      daysCount: 80,
      machinesCount: 30,
      biasedMachineNums: Array.from({ length: 15 }, (_, i) => 101 + i),
      biasBonus: 300,
      seed,
    });

    const btOld = runMachineBacktest(recordsBiased, undefined, {
      topN: 20,
      minEvidenceDays: 3,
      bootstrapIterations: 200,
      seed,
      weights: oldWeights,
    });

    const btNew = runMachineBacktest(recordsBiased, undefined, {
      topN: 20,
      minEvidenceDays: 3,
      bootstrapIterations: 200,
      seed,
      weights: newWeights,
    });

    console.log(`旧方式 (fixed):     上位20台実績リフト = ${btOld.withFilter.avgLift.toFixed(1)}枚 [95%CI: ${btOld.withFilter.ci95[0]}〜${btOld.withFilter.ci95[1]}]`);
    console.log(`新方式 (empirical): 上位20台実績リフト = ${btNew.withFilter.avgLift.toFixed(1)}枚 [95%CI: ${btNew.withFilter.ci95[0]}〜${btNew.withFilter.ci95[1]}] (維持率: ${((btNew.withFilter.avgLift / btOld.withFilter.avgLift) * 100).toFixed(1)}%)`);
  }
}

main().catch(console.error);
