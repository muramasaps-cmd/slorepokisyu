import { performance } from 'perf_hooks';
import { createSyntheticMachineRecords } from '../utils/__tests__/testDataGenerator';
import { calculateTargetDateRanking } from '../utils/targetRankingEngine';
import { calculateTargetMachineRanking } from '../utils/targetMachineRanking';
import { runMachineBacktest } from '../utils/backtestEngine';
import { SpecialDayRules } from '../data/types';

const specialDayRules: SpecialDayRules = {
  tails: [7],
  doubleDigits: true,
};

interface CaseConfig {
  days: number;
  machines: number;
  label: string;
}

const cases: CaseConfig[] = [
  { days: 60, machines: 40, label: '60d x 40m' },
  { days: 90, machines: 60, label: '90d x 60m' },
  { days: 240, machines: 120, label: '240d x 120m' },
  { days: 365, machines: 160, label: '365d x 160m' },
];

async function run() {
  console.log('=== Performance Benchmark (Baseline) ===');

  for (const c of cases) {
    const records = createSyntheticMachineRecords({
      daysCount: c.days,
      machinesCount: c.machines,
      seed: 42,
    });
    const lastDate = records[records.length - 1].date;
    const targetDateObj = new Date(lastDate);
    targetDateObj.setDate(targetDateObj.getDate() + 1);
    const targetDate = targetDateObj.toISOString().slice(0, 10);

    // 1. calculateTargetDateRanking
    const t0 = performance.now();
    calculateTargetDateRanking(targetDate, records, specialDayRules);
    const tTargetDate = performance.now() - t0;

    // 2. calculateTargetMachineRanking
    const t1 = performance.now();
    calculateTargetMachineRanking(targetDate, records, specialDayRules);
    const tTargetMachine = performance.now() - t1;

    // 3. runMachineBacktest
    const t2 = performance.now();
    const btResult = runMachineBacktest(records, specialDayRules, {
      topN: 10,
      minEvidenceDays: 3,
      blockLength: 7,
      bootstrapIterations: 500,
    });
    const tBacktest = performance.now() - t2;

    console.log(`\n================ ${c.label} ================`);
    console.log(`calculateTargetDateRanking:    ${tTargetDate.toFixed(2)} ms`);
    console.log(`calculateTargetMachineRanking: ${tTargetMachine.toFixed(2)} ms`);
    console.log(`runMachineBacktest (total):     ${tBacktest.toFixed(2)} ms (${(tBacktest / 1000).toFixed(2)} s)`);
    console.log(`evaluatedDays: ${btResult.evaluatedDaysCount}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
