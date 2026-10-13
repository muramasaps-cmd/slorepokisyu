/**
 * Setting Specification Management (機種仕様テーブル・機械割スペック管理)
 *
 * 【重要制約】
 * - 設定ごとの機械割などの仕様値はコードに直書きしない。
 * - 記憶や推測で数値を作らない。仕様値はユーザーが入力するテーブルとし、同梱するのは空のテンプレートのみ。
 * - 保存先は店舗データとは別のアプリ設定（IndexedDB / localStorage フォールバック）。
 */

import { normalizeModelName } from './modelName';

export interface SettingLevelSpec {
  /** 設定名ラベル (例: '設定1', '設定2', '設定L', '設定H', '1', '2' など) */
  label: string;
  /** 数値としての設定番号 (例: 1, 2, 3, 4, 5, 6)。未指定時はlabelから数値抽出またはインデックスから算出 */
  settingNum?: number;
  /** 機械割 / 出玉率 (%) (例: 97.0, 108.5) */
  payoutRate: number;
  /** BIG確率分母 (任意オプション) (例: 273.1) */
  bbDenom?: number;
  /** REG確率分母 (任意オプション) (例: 439.8) */
  rbDenom?: number;
}

export interface ModelSettingSpec {
  /** 機種名 (正規化名) */
  modelName: string;
  /** 別名・エイリアスリスト */
  aliases?: string[];
  /** 出典・引用元メモ (例: メーカー公式サイト、攻略情報誌、独自解析等) */
  source?: string;
  /** 設定ごとの仕様配列 (設定1〜6以外の変則機種や欠番機種にも対応) */
  settings: SettingLevelSpec[];
  /** 最終更新日時 (ISO文字列) */
  updatedAt?: string;
}

export interface SpecValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * 空の仕様テンプレート (初期値はすべて未設定 / 0)
 * コード内にいかなる特定機種の数値を保持しません。
 */
export const EMPTY_SETTING_SPEC_TEMPLATE: ModelSettingSpec = {
  modelName: '',
  aliases: [],
  source: '',
  settings: [
    { label: '設定1', settingNum: 1, payoutRate: 0 },
    { label: '設定2', settingNum: 2, payoutRate: 0 },
    { label: '設定3', settingNum: 3, payoutRate: 0 },
    { label: '設定4', settingNum: 4, payoutRate: 0 },
    { label: '設定5', settingNum: 5, payoutRate: 0 },
    { label: '設定6', settingNum: 6, payoutRate: 0 },
  ],
};

/**
 * 設定ラベルから数値としての設定番号を推定・解決する
 */
export function resolveSettingNum(spec: SettingLevelSpec, index: number): number {
  if (typeof spec.settingNum === 'number' && !Number.isNaN(spec.settingNum)) {
    return spec.settingNum;
  }
  const match = spec.label.match(/\d+/);
  if (match) {
    const parsed = parseInt(match[0], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return index + 1;
}

/**
 * 機種仕様テーブルの入力値バリデーション
 * - 機械割が設定番号順に増えていない
 * - 範囲が不自然 (例: 80%〜130%の外)
 * - 設定数が不足している (2つ未満)
 */
export function validateModelSettingSpec(spec: ModelSettingSpec): SpecValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmedName = spec.modelName?.trim() || '';
  if (!trimmedName) {
    errors.push('機種名が入力されていません。');
  }

  if (!spec.settings || spec.settings.length < 2) {
    errors.push('推定を行うには少なくとも2つ以上の設定が必要です。');
    return { isValid: false, warnings, errors };
  }

  let prevRate: number | null = null;
  let prevLabel: string = '';

  spec.settings.forEach((s, idx) => {
    const label = s.label?.trim() || `設定${idx + 1}`;
    const rate = s.payoutRate;

    if (typeof rate !== 'number' || Number.isNaN(rate) || rate <= 0) {
      errors.push(`${label} の機械割が正しく入力されていません。`);
      return;
    }

    // 範囲チェック (80%〜130%の外)
    if (rate < 80.0 || rate > 130.0) {
      warnings.push(
        `${label} の機械割（${rate}%）が一般的なパチスロ機の範囲（80%〜130%）から外れています。`
      );
    }

    // 単調増加チェック (設定の昇順で機械割が増加しているか)
    if (prevRate !== null && rate <= prevRate) {
      warnings.push(
        `機械割が設定の昇順になっていません（${label}: ${rate}% が直前の ${prevLabel}: ${prevRate}% 以下です）。`
      );
    }

    // ボーナス分母チェック (指定されている場合)
    if (s.bbDenom !== undefined && s.bbDenom !== null && (s.bbDenom <= 0 || s.bbDenom > 2000)) {
      warnings.push(`${label} のBIG確率分母（1/${s.bbDenom}）が不自然な値です。`);
    }
    if (s.rbDenom !== undefined && s.rbDenom !== null && (s.rbDenom <= 0 || s.rbDenom > 2000)) {
      warnings.push(`${label} のREG確率分母（1/${s.rbDenom}）が不自然な値です。`);
    }

    prevRate = rate;
    prevLabel = label;
  });

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * 登録済み仕様テーブルから、指定された機種名（または別名）に合致するスペックを検索する
 */
export function findSpecForModel(
  registeredSpecs: ModelSettingSpec[],
  modelName: string
): ModelSettingSpec | null {
  if (!modelName || !registeredSpecs || registeredSpecs.length === 0) return null;

  const targetNorm = normalizeModelName(modelName).toLowerCase();

  for (const spec of registeredSpecs) {
    const specNorm = normalizeModelName(spec.modelName).toLowerCase();
    if (specNorm === targetNorm) {
      return spec;
    }
    // Check aliases
    if (spec.aliases && spec.aliases.length > 0) {
      for (const alias of spec.aliases) {
        if (normalizeModelName(alias).toLowerCase() === targetNorm) {
          return spec;
        }
      }
    }
  }

  // Substring fuzzy matching as secondary fallback
  for (const spec of registeredSpecs) {
    const specNorm = normalizeModelName(spec.modelName).toLowerCase();
    if (specNorm.length >= 3 && (targetNorm.includes(specNorm) || specNorm.includes(targetNorm))) {
      return spec;
    }
  }

  return null;
}

/* =====================================================================
 * IndexedDB & localStorage Persistence for Setting Specs
 * 店舗データとは独立したアプリ設定ストア
 * ===================================================================== */

const DB_SPECS_NAME = 'SlotAnalyzerSettingSpecsDB';
const DB_SPECS_VERSION = 1;
const STORE_SPECS_NAME = 'setting_specs';
const LOCAL_STORAGE_KEY = 'SLOT_ANALYZER_SETTING_SPECS_V1';

// In-memory cache for ultra-fast and sync access
let memorySpecsCache: ModelSettingSpec[] | null = null;

function openSpecsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_SPECS_NAME, DB_SPECS_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SPECS_NAME)) {
        db.createObjectStore(STORE_SPECS_NAME, { keyPath: 'modelName' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Synchronous read from cache / localStorage (for immediate initial render)
 */
export function loadAllSettingSpecsSync(): ModelSettingSpec[] {
  if (memorySpecsCache !== null) {
    return memorySpecsCache;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memorySpecsCache = parsed;
          return parsed;
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  memorySpecsCache = [];
  return [];
}

/**
 * Asynchronous load from IndexedDB (with localStorage synchronization)
 */
export async function loadAllSettingSpecs(): Promise<ModelSettingSpec[]> {
  try {
    const db = await openSpecsDb();
    const specs: ModelSettingSpec[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SPECS_NAME, 'readonly');
      const store = tx.objectStore(STORE_SPECS_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (specs && specs.length > 0) {
      memorySpecsCache = specs;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(specs));
      } catch {
        // storage quota fallback
      }
      return specs;
    }
  } catch {
    // IndexedDB failed or in mock environment, fallback to sync
  }

  return loadAllSettingSpecsSync();
}

/**
 * Save single or updated spec
 */
export async function saveModelSettingSpec(spec: ModelSettingSpec): Promise<void> {
  const current = await loadAllSettingSpecs();
  const normName = normalizeModelName(spec.modelName);
  const updatedSpec: ModelSettingSpec = {
    ...spec,
    modelName: normName || spec.modelName,
    updatedAt: new Date().toISOString(),
  };

  const existingIdx = current.findIndex(
    (s) => normalizeModelName(s.modelName).toLowerCase() === normName.toLowerCase()
  );

  const nextSpecs = [...current];
  if (existingIdx >= 0) {
    nextSpecs[existingIdx] = updatedSpec;
  } else {
    nextSpecs.push(updatedSpec);
  }

  await saveAllSettingSpecs(nextSpecs);
}

/**
 * Save all specs in batch
 */
export async function saveAllSettingSpecs(specs: ModelSettingSpec[]): Promise<void> {
  memorySpecsCache = specs;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(specs));
    } catch {
      // ignore storage full
    }
  }

  try {
    const db = await openSpecsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SPECS_NAME, 'readwrite');
      const store = tx.objectStore(STORE_SPECS_NAME);
      store.clear();
      for (const item of specs) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback completed via localStorage
  }
}

/**
 * Delete a spec by model name
 */
export async function deleteModelSettingSpec(modelName: string): Promise<void> {
  const current = await loadAllSettingSpecs();
  const targetNorm = normalizeModelName(modelName).toLowerCase();
  const nextSpecs = current.filter(
    (s) => normalizeModelName(s.modelName).toLowerCase() !== targetNorm
  );
  await saveAllSettingSpecs(nextSpecs);
}

/**
 * Export specs to formatted JSON string
 */
export function exportSettingSpecsAsJson(specs: ModelSettingSpec[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      generator: 'スロレポ店舗分析 - Aタイプ設定仕様テーブル',
      specs,
    },
    null,
    2
  );
}

/**
 * 設定行のフィールド名・型を柔軟に正規化
 */
function normalizeSettingRow(row: any, index: number): SettingLevelSpec {
  const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : `設定${index + 1}`;
  const settingNum =
    typeof row.settingNum === 'number'
      ? row.settingNum
      : typeof row.setting === 'number'
      ? row.setting
      : undefined;

  let payoutRate = 0;
  const rawPayout = row.payoutRate ?? row.payout ?? row.rate ?? row.payout_rate ?? row.war;
  if (typeof rawPayout === 'number') {
    payoutRate = rawPayout;
  } else if (typeof rawPayout === 'string') {
    payoutRate = parseFloat(rawPayout.replace(/%/g, '')) || 0;
  }

  let bbDenom: number | undefined = undefined;
  const rawBb = row.bbDenom ?? row.bb ?? row.bb_denom ?? row.bbDenominator;
  if (typeof rawBb === 'number') {
    bbDenom = rawBb;
  } else if (typeof rawBb === 'string') {
    const parsed = parseFloat(rawBb.replace(/^1\//, ''));
    if (!Number.isNaN(parsed) && parsed > 0) bbDenom = parsed;
  }

  let rbDenom: number | undefined = undefined;
  const rawRb = row.rbDenom ?? row.rb ?? row.reg ?? row.rb_denom ?? row.rbDenominator;
  if (typeof rawRb === 'number') {
    rbDenom = rawRb;
  } else if (typeof rawRb === 'string') {
    const parsed = parseFloat(rawRb.replace(/^1\//, ''));
    if (!Number.isNaN(parsed) && parsed > 0) rbDenom = parsed;
  }

  return {
    label,
    settingNum,
    payoutRate,
    bbDenom,
    rbDenom,
  };
}

/**
 * 様々なデータ構造から機種仕様の候補リストを抽出
 */
function extractCandidateSpecs(parsed: unknown): unknown[] {
  if (!parsed || typeof parsed !== 'object') return [];

  // Case 1: 配列
  if (Array.isArray(parsed)) {
    return parsed;
  }

  const obj = parsed as Record<string, unknown>;

  // Case 2: 単一機種オブジェクト ({ modelName: "...", settings: [...] })
  if (obj.modelName && (Array.isArray(obj.settings) || typeof obj.settings === 'object')) {
    return [obj];
  }

  // Case 3: ラッパープロパティ (specs, models, list, data, settingSpecs)
  for (const key of ['specs', 'models', 'list', 'data', 'settingSpecs']) {
    if (Array.isArray(obj[key])) {
      return obj[key] as unknown[];
    }
  }

  // Case 4: キー名が機種名のマップ (例: { "マイジャグラーV": { settings: [...] }, "アイムEX": [...] })
  const candidateFromEntries: unknown[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (!val || typeof val !== 'object') continue;
    if (Array.isArray(val)) {
      candidateFromEntries.push({
        modelName: key,
        settings: val,
      });
    } else {
      const valObj = val as Record<string, unknown>;
      if (Array.isArray(valObj.settings)) {
        candidateFromEntries.push({
          modelName: valObj.modelName || key,
          ...valObj,
        });
      }
    }
  }
  if (candidateFromEntries.length > 0) {
    return candidateFromEntries;
  }

  return [];
}

/**
 * Import specs from JSON string
 * - 単一機種のJSONオブジェクト
 * - 複数機種の配列 JSON
 * - { specs: [...] } や { models: [...] } などのラッパー形式
 * - { "機種名": { settings: [...] } } 形式
 * - カンマ区切りで連続した複数オブジェクト形式
 */
export function importSettingSpecsFromJson(jsonStr: string): {
  imported: ModelSettingSpec[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!jsonStr || !jsonStr.trim()) {
    return { imported: [], errors: ['JSONデータが空です。'] };
  }

  let parsed: unknown = null;
  const trimmed = jsonStr.trim();

  // 1. 標準 JSON パース試行
  try {
    parsed = JSON.parse(trimmed);
  } catch (primaryErr: any) {
    // 2. カンマ区切りなどで囲みカッコがない複数オブジェクトの救済 (例: {...}, {...})
    try {
      const wrapped = trimmed.startsWith('[') ? trimmed : `[${trimmed.replace(/^[,\s]+|[,\s]+$/g, '')}]`;
      parsed = JSON.parse(wrapped);
    } catch {
      // 3. 改行区切りの個別JSONオブジェクト救済
      const objects: any[] = [];
      const regex = /\{[\s\S]*?\}(?=(?:\s*\{|\s*$))/g;
      let match;
      while ((match = regex.exec(trimmed)) !== null) {
        try {
          const item = JSON.parse(match[0]);
          if (item && typeof item === 'object') objects.push(item);
        } catch {
          // ignore individual chunk parse failure
        }
      }
      if (objects.length > 0) {
        parsed = objects;
      } else {
        return { imported: [], errors: [`JSON解析エラー: 正しいJSON形式ではありません (${primaryErr?.message || primaryErr})`] };
      }
    }
  }

  const candidateList = extractCandidateSpecs(parsed);
  if (!Array.isArray(candidateList) || candidateList.length === 0) {
    return { imported: [], errors: ['JSON形式が無効です（機種名や設定配列が見つかりません）。'] };
  }

  const imported: ModelSettingSpec[] = [];
  for (const item of candidateList) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as any;
    const modelName = candidate.modelName || candidate.name || candidate.title;
    if (!modelName || !candidate.settings) {
      errors.push(`スキップ: 不正なエントリ (${modelName || '無名'})`);
      continue;
    }

    // 設定配列を正規化
    const rawSettings = Array.isArray(candidate.settings)
      ? candidate.settings
      : Object.entries(candidate.settings).map(([label, val]: [string, any]) => ({
          label,
          ...(typeof val === 'number' ? { payoutRate: val } : val),
        }));

    const normalizedSettings: SettingLevelSpec[] = rawSettings.map(normalizeSettingRow);

    const candidateSpec: ModelSettingSpec = {
      modelName: normalizeModelName(String(modelName)),
      aliases: Array.isArray(candidate.aliases) ? candidate.aliases.map(String) : [],
      source: candidate.source ? String(candidate.source) : '',
      settings: normalizedSettings,
      updatedAt: new Date().toISOString(),
    };

    const val = validateModelSettingSpec(candidateSpec);
    if (!val.isValid) {
      errors.push(`スキップ (${candidateSpec.modelName}): ${val.errors.join(', ')}`);
      continue;
    }

    imported.push(candidateSpec);
  }

  return { imported, errors };
}

