import { generateSyntheticDailyRecords } from './src/utils/__tests__/testDataGenerator.ts';
import { runAutoTuning } from './src/utils/backtestEngine.ts';
import { performance } from 'perf_hooks';

const rules = { tails: [7], doubleDigits: true };
const records = generateSyntheticDailyRecords(42, 300, 40, rules);

const start = performance.now();
const res = runAutoTuning(records, rules, '', 3);
const duration = performance.now() - start;
console.log('runAutoTuning took:', duration.toFixed(1), 'ms');
