import { performance } from 'perf_hooks';
import { createSyntheticMachineRecords, createSeededRandom } from '../utils/__tests__/testDataGenerator';
import { calculateTargetMachineRanking } from '../utils/targetMachineRanking';
import { SpecialDayRules, DailyMachineRecord } from '../data/types';
import { normalizeModelName } from '../utils/modelName';

const specialDayRules: SpecialDayRules = {
  tails: [7],
  doubleDigits: true,
};

const cases = [
  { days: 60, machines: 40, label: '60d x 40m' },
  { days: 90, machines: 60, label: '90d x 60m' },
];

async function measureBreakdown() {
  console.log('=== runMachineBacktest Breakdown Benchmark (Baseline) ===');

  for (const c of cases) {
    const sortedRecords = createSyntheticMachineRecords({
      daysCount: c.days,
      machinesCount: c.machines,
      seed: 42,
    }).sort((a, b) => a.date.localeCompare(b.date));

    const minPriorDays = 5;
    const evalIndices: number[] = [];
    for (let i = minPriorDays; i < sortedRecords.length; i++) {
      const day = sortedRecords[i];
      if (day.machines && day.machines.length > 0) {
        const hasPriorMachineData = sortedRecords
          .slice(0, i)
          .some((r) => r.machines && r.machines.length > 0);
        if (hasPriorMachineData) {
          evalIndices.push(i);
        }
      }
    }

    let sliceTime = 0;
    let rankingCalls = 0;
    let rankingTime = 0;
    let randomTrialsTime = 0;

    const topN = 10;
    const trials = 100;
    const rng = createSeededRandom(12345);

    const tStart = performance.now();

    // Main backtest loop
    for (let step = 0; step < evalIndices.length; step++) {
      const evalIdx = evalIndices[step];
      const evalDay = sortedRecords[evalIdx];

      const tSliceStart = performance.now();
      const priorRecords = sortedRecords.slice(0, evalIdx);
      sliceTime += performance.now() - tSliceStart;

      const dayMachines = evalDay.machines!;
      const totalMachines = dayMachines.length;
      const dayMachinesMap = new Map<number, DailyMachineRecord>();
      const modelToMachines = new Map<string, DailyMachineRecord[]>();

      let hallDiffSum = 0;
      let hallWinCount = 0;
      for (const m of dayMachines) {
        dayMachinesMap.set(m.machineNum, m);
        hallDiffSum += m.diff;
        if (m.diff > 0) hallWinCount++;
        const normName = normalizeModelName(m.modelName);
        const list = modelToMachines.get(normName);
        if (list) list.push(m);
        else modelToMachines.set(normName, [m]);
      }

      // Random baseline 4: Hall uniform random
      const tRandStart = performance.now();
      let bRandomDiffSum = 0;
      let bRandomWinCount = 0;
      const sampleSize = Math.min(topN, totalMachines);
      for (let t = 0; t < trials; t++) {
        let tDiff = 0;
        let tWin = 0;
        for (let s = 0; s < sampleSize; s++) {
          const idx = Math.floor(rng() * totalMachines);
          const rm = dayMachines[idx];
          tDiff += rm.diff;
          if (rm.diff > 0) tWin++;
        }
        bRandomDiffSum += sampleSize > 0 ? tDiff / sampleSize : 0;
        bRandomWinCount += sampleSize > 0 ? (tWin / sampleSize) * 100 : 0;
      }
      randomTrialsTime += performance.now() - tRandStart;

      // Ranking call
      const tRankStart = performance.now();
      const rankingResult = calculateTargetMachineRanking(
        evalDay.date,
        priorRecords,
        specialDayRules,
        undefined,
        { minEvidenceDays: 0 }
      );
      rankingTime += performance.now() - tRankStart;
      rankingCalls++;

      // Baseline 1: random within model
      const tRandModelStart = performance.now();
      const candidateList = rankingResult.rankings.slice(0, topN);
      const observedMachines = candidateList.filter((c) => dayMachinesMap.has(c.machineNum));
      for (let t = 0; t < trials; t++) {
        let tDiff = 0;
        let tWin = 0;
        for (const p of observedMachines) {
          const modelMachines = modelToMachines.get(normalizeModelName(p.modelName));
          if (modelMachines && modelMachines.length > 0) {
            const mIdx = Math.floor(rng() * modelMachines.length);
            const rm = modelMachines[mIdx];
            tDiff += rm.diff;
            if (rm.diff > 0) tWin++;
          } else {
            const actualM = dayMachinesMap.get(p.machineNum)!;
            tDiff += actualM.diff;
            if (actualM.diff > 0) tWin++;
          }
        }
      }
      randomTrialsTime += performance.now() - tRandModelStart;
    }

    // Ablation variants: 3 variants x evalIndices.length
    const ablationVariants = [
      { key: 'no_model', weights: { modelScoreWeight: 0 } },
      { key: 'no_diff', weights: { cohortDiffWeight: 0 } },
      { key: 'no_tail', weights: { tailMatchBonus: 0, zoroBonus: 0 } },
    ];

    for (const variant of ablationVariants) {
      for (const evalIdx of evalIndices) {
        const evalDay = sortedRecords[evalIdx];
        const tSliceStart = performance.now();
        const recordsBefore = sortedRecords.slice(0, evalIdx);
        sliceTime += performance.now() - tSliceStart;

        const tRankStart = performance.now();
        calculateTargetMachineRanking(
          evalDay.date,
          recordsBefore,
          specialDayRules,
          variant.weights,
          { minEvidenceDays: 0 }
        );
        rankingTime += performance.now() - tRankStart;
        rankingCalls++;
      }
    }

    const totalTime = performance.now() - tStart;

    console.log(`\n================ ${c.label} Breakdown ================`);
    console.log(`Evaluated Days:                      ${evalIndices.length}`);
    console.log(`calculateTargetMachineRanking calls:  ${rankingCalls} calls`);
    console.log(`calculateTargetMachineRanking time:   ${rankingTime.toFixed(2)} ms (${(rankingTime / 1000).toFixed(2)} s, ${((rankingTime / totalTime) * 100).toFixed(1)}%)`);
    console.log(`Slice & data preparation time:        ${sliceTime.toFixed(2)} ms (${((sliceTime / totalTime) * 100).toFixed(1)}%)`);
    console.log(`Random baseline repeated trials:      ${randomTrialsTime.toFixed(2)} ms (${((randomTrialsTime / totalTime) * 100).toFixed(1)}%)`);
    console.log(`Total measured loop time:            ${totalTime.toFixed(2)} ms (${(totalTime / 1000).toFixed(2)} s)`);
  }
}

measureBreakdown().catch(console.error);
