import { DailyRecord, DailyModelRecord, DailyMachineRecord } from '../data/types';

// WeakMap cache for per-record memoization
const modelRowsCache = new WeakMap<DailyRecord, DailyRecord>();

/**
 * Pure function that ensures daily records have `models` populated.
 * If a daily record's `models` is empty (or undefined) and `machines` exists and has entries,
 * aggregates `machines` by `modelName` to generate `models` rows with:
 * modelName, machineCount, totalMachines, avgDiffCoins, avgGames, winRate, payoutRate, totalDiffCoins, winMachines.
 *
 * If `models` already exists on a day, returns that day's record unchanged.
 * Results are cached per-record via a WeakMap.
 */
export function ensureModelRows(dailyRecords: DailyRecord[]): DailyRecord[] {
  if (!dailyRecords || dailyRecords.length === 0) {
    return dailyRecords;
  }

  // Quick check if any record in the array is missing models but has machines
  let hasMissing = false;
  for (let i = 0; i < dailyRecords.length; i++) {
    const r = dailyRecords[i];
    if ((!r.models || r.models.length === 0) && r.machines && r.machines.length > 0) {
      hasMissing = true;
      break;
    }
  }

  if (!hasMissing) {
    return dailyRecords;
  }

  return dailyRecords.map((record) => {
    // If models is already present and non-empty, keep the exact original record
    if (record.models && record.models.length > 0) {
      return record;
    }

    // If machines is not available or empty, cannot construct models
    if (!record.machines || record.machines.length === 0) {
      return record;
    }

    // Check WeakMap cache first
    const cached = modelRowsCache.get(record);
    if (cached) {
      return cached;
    }

    // Group machines by modelName
    const modelMap = new Map<string, DailyMachineRecord[]>();
    for (let i = 0; i < record.machines.length; i++) {
      const m = record.machines[i];
      const modelName = m.modelName || '不明';
      let list = modelMap.get(modelName);
      if (!list) {
        list = [];
        modelMap.set(modelName, list);
      }
      list.push(m);
    }

    const generatedModels: DailyModelRecord[] = Array.from(modelMap.entries())
      .map(([mName, machList]) => {
        const machineCount = machList.length;
        const totalMachines = machineCount;
        const totalDiffCoins = machList.reduce((sum, m) => sum + (m.diff || 0), 0);
        const totalGames = machList.reduce((sum, m) => sum + (m.games || 0), 0);
        const winMachines = machList.filter((m) => (m.diff || 0) > 0).length;

        const avgDiffCoins = Math.round(totalDiffCoins / machineCount);
        const avgGames = Math.round(totalGames / machineCount);
        const winRate = machineCount > 0 ? Math.round((winMachines / machineCount) * 1000) / 10 : 0;

        // Payout rate (機械割): in = games * 3, out = in + diff
        const inCoins = totalGames * 3;
        const outCoins = inCoins + totalDiffCoins;
        const payoutRate = inCoins > 0 ? Math.round((outCoins / inCoins) * 1000) / 10 : 100;

        return {
          modelName: mName,
          machineCount,
          totalMachines,
          avgDiffCoins,
          avgGames,
          winRate,
          payoutRate,
          totalDiffCoins,
          winMachines,
          isSmallCount: machineCount <= 2,
        };
      })
      .sort((a, b) => b.totalDiffCoins - a.totalDiffCoins);

    const updatedRecord: DailyRecord = {
      ...record,
      models: generatedModels,
    };

    modelRowsCache.set(record, updatedRecord);
    return updatedRecord;
  });
}
