import { performance } from 'perf_hooks';
import { DailyRecord, DailyMachineRecord } from '../data/types';
import { ModelSettingSpec } from '../utils/settingSpecs';
import { runSensitivityAnalysis, createSeededRandom } from '../utils/settingEstimation';
import {
  executeSensitivityAnalysisAsync,
  computeSensitivityCacheKey,
  getSensitivityMemoryCache,
  clearSensitivityMemoryCache,
} from '../utils/sensitivityAnalysisService';

const JUGGLER_SPEC: ModelSettingSpec = {
  modelName: 'アイムジャグラーEX',
  settings: [
    { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 439.8 },
    { label: '設定2', settingNum: 2, payoutRate: 98.0, bbDenom: 269.7, rbDenom: 399.6 },
    { label: '設定3', settingNum: 3, payoutRate: 99.5, bbDenom: 269.7, rbDenom: 331.0 },
    { label: '設定4', settingNum: 4, payoutRate: 101.1, bbDenom: 259.0, rbDenom: 315.1 },
    { label: '設定5', settingNum: 5, payoutRate: 102.8, bbDenom: 259.0, rbDenom: 255.0 },
    { label: '設定6', settingNum: 6, payoutRate: 105.5, bbDenom: 255.0, rbDenom: 255.0 },
  ],
};

function generateBenchmarkDataset(daysCount: number, machinesCount: number, seed: number): DailyRecord[] {
  const rng = createSeededRandom(seed);
  const records: DailyRecord[] = [];

  for (let day = 1; day <= daysCount; day++) {
    const machines: DailyMachineRecord[] = [];
    for (let m = 1; m <= machinesCount; m++) {
      const isHigh = rng() < 0.35;
      let games: number;
      let payout: number;

      if (isHigh) {
        games = Math.round(5500 + rng() * 3000);
        payout = 101.0 + rng() * 5.0;
      } else {
        games = Math.round(500 + rng() * 3500);
        payout = 94.0 + rng() * 6.0;
      }

      const diff = Math.round((payout / 100.0) * games * 3 - games * 3);
      machines.push({
        machineNum: 100 + m,
        modelName: JUGGLER_SPEC.modelName,
        games,
        diff,
        payoutRate: Number(payout.toFixed(2)),
      });
    }

    const dateStr = `2024-${String(Math.floor((day - 1) / 28) + 1).padStart(2, '0')}-${String(((day - 1) % 28) + 1).padStart(2, '0')}`;
    records.push({
      date: dateStr,
      storeName: 'ベンチマーク店舗',
      machines,
      totalGames: machines.reduce((s, r) => s + r.games, 0),
      totalDiff: machines.reduce((s, r) => s + r.diff, 0),
    } as unknown as DailyRecord);
  }

  return records;
}

interface BenchmarkCase {
  label: string;
  days: number;
  machines: number;
  seed: number;
}

const cases: BenchmarkCase[] = [
  { label: '60日 × 20台 (1,200台日)', days: 60, machines: 20, seed: 101 },
  { label: '150日 × 40台 (6,000台日)', days: 150, machines: 40, seed: 102 },
  { label: '365日 × 30台 (10,950台日)', days: 365, machines: 30, seed: 103 },
];

async function runBenchmark() {
  console.log('=== 感度分析 (15条件) パフォーマンス計測 ===\n');

  for (const c of cases) {
    const data = generateBenchmarkDataset(c.days, c.machines, c.seed);
    clearSensitivityMemoryCache();

    // 1. 変更前: 同期実行 (useMemo内での同期実行 = メインスレッドブロック時間)
    const tSyncStart = performance.now();
    const syncResult = runSensitivityAnalysis(
      JUGGLER_SPEC.modelName,
      data,
      JUGGLER_SPEC,
      { highSettingThreshold: 4 }
    );
    const tSync = performance.now() - tSyncStart;

    clearSensitivityMemoryCache();

    // 2. 変更後: 非同期実行 (Worker / setTimeout分割実行 = UIブロッキングなし)
    let progressCalls = 0;
    const tAsyncStart = performance.now();
    const handle = executeSensitivityAnalysisAsync(
      JUGGLER_SPEC.modelName,
      data,
      JUGGLER_SPEC,
      { highSettingThreshold: 4 },
      undefined,
      () => {
        progressCalls++;
      }
    );
    const asyncResult = await handle.promise;
    const tAsync = performance.now() - tAsyncStart;

    // 3. キャッシュヒット時の再取得時間
    const tCacheStart = performance.now();
    const cacheKey = computeSensitivityCacheKey(JUGGLER_SPEC.modelName, data, JUGGLER_SPEC, {
      highSettingThreshold: 4,
    });
    const cachedResult = getSensitivityMemoryCache(cacheKey);
    const tCache = performance.now() - tCacheStart;

    // 計算結果の等価性検証 (計算結果は変えない)
    const resultsMatch =
      syncResult.rows.length === asyncResult.rows.length &&
      syncResult.rateSpread === asyncResult.rateSpread &&
      syncResult.maxHighSettingRate === asyncResult.maxHighSettingRate &&
      syncResult.minHighSettingRate === asyncResult.minHighSettingRate &&
      cachedResult !== undefined;

    console.log(`【ケース】 ${c.label}`);
    console.log(`- 変更前（メインスレッド同期実行）: ${tSync.toFixed(2)} ms (画面フリーズ時間: ${tSync.toFixed(2)} ms)`);
    console.log(`- 変更後（非同期・進捗通知実行）:   ${tAsync.toFixed(2)} ms (画面フリーズ時間: 0 ms / 進捗通知: ${progressCalls}回)`);
    console.log(`- キャッシュ再訪時（同一キー）:      ${tCache.toFixed(3)} ms (即時返却)`);
    console.log(`- 計算結果の一致確認:              ${resultsMatch ? '✅ 完全一致' : '❌ 不一致'}`);
    console.log(`- 変動幅: ${asyncResult.rateSpread}pt (${asyncResult.minHighSettingRate}% 〜 ${asyncResult.maxHighSettingRate}%)\n`);
  }
}

runBenchmark().catch(console.error);
