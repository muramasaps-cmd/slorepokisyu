import { StoreProfile } from '../data/types';
import { areStoresSame, mergeDailyRecords } from './storeStorage';

export interface StoreBackupFile {
  version: number;
  exportedAt: string;
  app: string;
  storesCount: number;
  stores: StoreProfile[];
}

export interface BackupImportResult {
  success: boolean;
  importedStores: StoreProfile[];
  totalRecordsCount: number;
  error?: string;
  message?: string;
}

/**
 * Exports all stores into a formatted JSON backup file and triggers download
 */
export function exportAllStoresAsJson(stores: StoreProfile[]): void {
  if (!stores || stores.length === 0) {
    throw new Error('エクスポートする店舗データが存在しません。');
  }

  const backupData: StoreBackupFile = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'スロレポ店舗利益推移分析システム',
    storesCount: stores.length,
    stores,
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(
    2,
    '0'
  )}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = `slorepo_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates and parses a JSON backup file content into StoreProfile[]
 */
export function parseStoresFromBackupJson(jsonString: string): BackupImportResult {
  try {
    if (!jsonString || !jsonString.trim()) {
      return {
        success: false,
        importedStores: [],
        totalRecordsCount: 0,
        error: 'JSONファイルが空です。',
      };
    }

    const parsed = JSON.parse(jsonString);
    let rawList: any[] = [];

    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.stores)) {
      rawList = parsed.stores;
    } else {
      return {
        success: false,
        importedStores: [],
        totalRecordsCount: 0,
        error: 'JSONフォーマットが不正です（店舗配列が見つかりません）。',
      };
    }

    if (rawList.length === 0) {
      return {
        success: false,
        importedStores: [],
        totalRecordsCount: 0,
        error: 'バックアップ内に店舗データが含まれていません。',
      };
    }

    const validated: StoreProfile[] = [];
    let totalRecords = 0;

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item || typeof item !== 'object' || !item.name) continue;

      const id = item.id || `imported-store-${i + 1}-${Date.now()}`;
      const dailyRecords = Array.isArray(item.dailyRecords) ? item.dailyRecords : [];
      totalRecords += dailyRecords.length;

      validated.push({
        ...item,
        id,
        name: String(item.name).trim(),
        dailyRecords,
        totalMachinesApprox: item.totalMachinesApprox || 160,
        rateLend: item.rateLend || 46,
        rateExchange: item.rateExchange || 52,
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
    }

    if (validated.length === 0) {
      return {
        success: false,
        importedStores: [],
        totalRecordsCount: 0,
        error: '有効な店舗名を持つデータが検出されませんでした。',
      };
    }

    return {
      success: true,
      importedStores: validated,
      totalRecordsCount: totalRecords,
      message: `${validated.length}店舗（合計${totalRecords}日分）のデータを正常に解析しました。`,
    };
  } catch (err: any) {
    return {
      success: false,
      importedStores: [],
      totalRecordsCount: 0,
      error: `JSON解析エラー: ${err?.message || '不正な構文です'}`,
    };
  }
}

/**
 * Merges imported stores into existing stores collection
 */
export function mergeImportedStores(
  existingStores: StoreProfile[],
  importedStores: StoreProfile[]
): StoreProfile[] {
  const result = [...existingStores];

  for (const imported of importedStores) {
    const existingIndex = result.findIndex(
      (s) => s.id === imported.id || areStoresSame(s.name, imported.name)
    );

    if (existingIndex >= 0) {
      const existing = result[existingIndex];
      const mergedDaily = mergeDailyRecords(existing.dailyRecords || [], imported.dailyRecords || []);
      result[existingIndex] = {
        ...existing,
        ...imported,
        id: existing.id,
        name: imported.name || existing.name,
        address: imported.address || existing.address || '住所未登録',
        exchangeRate: imported.exchangeRate || existing.exchangeRate || '',
        rateLend: imported.rateLend || existing.rateLend || 46,
        rateExchange: imported.rateExchange || existing.rateExchange || 52,
        islandConfig: imported.islandConfig || existing.islandConfig || '',
        islandDefinitions: imported.islandDefinitions || existing.islandDefinitions,
        modelAliasDictionary: imported.modelAliasDictionary || existing.modelAliasDictionary,
        categoryRates: imported.categoryRates || existing.categoryRates,
        includeReusedMachinesInStats:
          imported.includeReusedMachinesInStats ?? existing.includeReusedMachinesInStats,
        customRankingWeights: imported.customRankingWeights || existing.customRankingWeights,
        totalMachinesApprox: Math.max(
          existing.totalMachinesApprox || 0,
          imported.totalMachinesApprox || 0
        ),
        dailyRecords: mergedDaily,
        dataRange:
          mergedDaily.length > 0 && mergedDaily[0]?.date && mergedDaily[mergedDaily.length - 1]?.date
            ? `${mergedDaily[0].date.slice(0, 7)} ～ ${mergedDaily[mergedDaily.length - 1].date.slice(0, 7)}`
            : (existing.dataRange || imported.dataRange || ''),
        updatedAt: new Date().toISOString(),
      };
    } else {
      result.push(imported);
    }
  }

  return result;
}
