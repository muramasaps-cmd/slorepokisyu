import { DailyRecord } from '../data/types';

/**
 * Machine model classification & filtering utilities.
 * Supports categorization into スマスロ (Smart Slot), Aタイプ (A-Type / Normal),
 * and ジャグラーシリーズ (Juggler Series), plus multi-selection.
 */

export function isJuggler(name: string): boolean {
  if (!name) return false;
  return /ジャグラー|juggler|jugler/i.test(name);
}

export function isSmartSlot(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  // Starts with L or l (industry standard prefix for Smart Slots)
  if (/^[Ll][\s　・]?[^\w]/u.test(trimmed) || /^[Ll]パチスロ/i.test(trimmed) || /^[Ll]スマスロ/i.test(trimmed)) {
    return true;
  }
  // Contains スマスロ or スマート
  if (/スマスロ|スマート/i.test(trimmed)) {
    return true;
  }
  // Model name starts with L (e.g. L ToLOVEる, Lヴァルヴレイヴ, etc.)
  if (/^[Ll][A-Za-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed) && !/^L[A-Z]{3,}/.test(trimmed)) {
    return true;
  }
  return false;
}

export function isAType(name: string): boolean {
  if (!name) return false;
  if (isJuggler(name)) return true;

  const normalKeywords = [
    'ハナハナ',
    'ディスクアップ',
    'アレックス',
    'パルサー',
    'クランキー',
    'バーサス',
    'ハナビ',
    '花火',
    'サンダー',
    'ゲッターマウス',
    'マッピー',
    'a-slot',
    'aタイプ',
    'うまい棒',
    'ハイビ',
    'シオサイ',
    'ニューパル',
    'ガメラ',
    '新ハナビ',
    'ディスク',
  ];

  const lower = name.toLowerCase();
  return normalKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export type PresetFilterType = 'smart_slot' | 'a_type' | 'juggler';
export type ModelPresetMode = 'all' | 'smart_slot' | 'a_type' | 'juggler' | 'custom';

export interface ModelTagInfo {
  isSmart: boolean;
  isAType: boolean;
  isJuggler: boolean;
  primaryTag: 'スマスロ' | 'ジャグラー' | 'Aタイプ' | 'AT/ART' | '';
}

export function getModelTagInfo(name: string): ModelTagInfo {
  const isSmart = isSmartSlot(name);
  const juggler = isJuggler(name);
  const aType = isAType(name);

  let primaryTag: 'スマスロ' | 'ジャグラー' | 'Aタイプ' | 'AT/ART' | '' = '';
  if (juggler) {
    primaryTag = 'ジャグラー';
  } else if (aType) {
    primaryTag = 'Aタイプ';
  } else if (isSmart) {
    primaryTag = 'スマスロ';
  } else {
    primaryTag = 'AT/ART';
  }

  return {
    isSmart,
    isAType: aType,
    isJuggler: juggler,
    primaryTag,
  };
}

/**
 * Filter list of all machine names matching a specific preset
 */
export function getModelNamesByPreset(
  allNames: string[],
  preset: PresetFilterType
): string[] {
  switch (preset) {
    case 'smart_slot':
      return allNames.filter(isSmartSlot);
    case 'a_type':
      return allNames.filter(isAType);
    case 'juggler':
      return allNames.filter(isJuggler);
    default:
      return allNames;
  }
}

/**
 * Check if a model matches the specified preset or custom selection
 */
export function isModelMatchingFilter(
  modelName: string,
  preset: ModelPresetMode,
  selectedModelNames: string[]
): boolean {
  if (preset === 'all' && selectedModelNames.length === 0) {
    return true;
  }
  if (preset === 'smart_slot') {
    return isSmartSlot(modelName);
  }
  if (preset === 'a_type') {
    return isAType(modelName);
  }
  if (preset === 'juggler') {
    return isJuggler(modelName);
  }
  if (preset === 'custom' || selectedModelNames.length > 0) {
    return selectedModelNames.includes(modelName);
  }
  return true;
}

/**
 * Filters an array of daily records so that each day's machine count, total diff coins,
 * average games, win rate, and models breakdown are recalculated using ONLY the matching models.
 * Days with zero matching operating machines are excluded so averages remain mathematically accurate.
 */
export function filterDailyRecordsByModels(
  records: DailyRecord[],
  preset: ModelPresetMode,
  selectedModelNames: string[]
): DailyRecord[] {
  if (preset === 'all' && selectedModelNames.length === 0) {
    return records;
  }

  const result: DailyRecord[] = [];

  for (const r of records) {
    if (!r.models || r.models.length === 0) {
      // Record without model breakdown cannot be filtered by model
      continue;
    }

    const matchedModels = r.models.filter((m) =>
      isModelMatchingFilter(m.modelName, preset, selectedModelNames)
    );

    if (matchedModels.length === 0) {
      continue;
    }

    const totalMachines = matchedModels.reduce(
      (acc, m) => acc + (m.totalMachines > 0 ? m.totalMachines : 1),
      0
    );

    if (totalMachines <= 0) {
      continue;
    }

    const totalDiffCoins = matchedModels.reduce((acc, m) => acc + (m.totalDiffCoins || 0), 0);
    const winMachines = matchedModels.reduce((acc, m) => acc + (m.winMachines || 0), 0);
    const winRate =
      totalMachines > 0 ? Math.round((winMachines / totalMachines) * 1000) / 10 : null;

    const totalGames = matchedModels.reduce(
      (acc, m) =>
        acc + (m.avgGames || 0) * (m.totalMachines > 0 ? m.totalMachines : 1),
      0
    );
    const avgGames = totalMachines > 0 ? Math.round(totalGames / totalMachines) : 0;
    const avgDiffCoins = totalMachines > 0 ? Math.round(totalDiffCoins / totalMachines) : 0;

    result.push({
      ...r,
      totalMachines,
      totalDiffCoins,
      avgDiffCoins,
      avgGames,
      winMachines,
      winRate,
      models: matchedModels,
    });
  }

  return result;
}
