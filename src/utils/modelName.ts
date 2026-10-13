import { isSmartSlot, isJuggler, isAType } from './modelFilterUtils';
import { StoreInfo, StoreProfile, CategoryRateOverride } from '../data/types';

/**
 * Normalizes model names across the system:
 * - Trims leading/trailing whitespace and collapses multiple inner spaces to a single space.
 * - Converts full-width ASCII alphanumerics (Ａ-Ｚ, ａ-ｚ, ０-９) to half-width (A-Z, a-z, 0-9).
 * - Converts full-width space (U+3000) to half-width space (U+0020).
 * - Converts half-width katakana (ｱ-ﾝ, ｶﾞ, ﾊﾟ etc.) to full-width katakana.
 * - Standardizes wave dashes (~, ～ / U+FF5E) to standard Japanese wave dash (〜 / U+301C).
 * - Standardizes half-width exclamation/question marks to full-width (！, ？) to preserve canonical title style.
 * - Normalizes full-width parentheses/brackets to standard half-width.
 * - Supports an optional alias dictionary to map arbitrary raw or normalized model names to canonical names.
 */
export function normalizeModelName(
  rawName: string,
  aliasDictionary?: Record<string, string>
): string {
  if (!rawName || typeof rawName !== 'string') return '';

  // Direct alias check before normalization
  if (aliasDictionary && aliasDictionary[rawName]) {
    return aliasDictionary[rawName];
  }

  // 1. Whitespace handling
  let s = rawName.replace(/\u3000/g, ' ').trim().replace(/\s+/g, ' ');

  // 2. Full-width alphanumeric to half-width
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );

  // 3. Half-width katakana to full-width katakana
  const kanaMap: Record<string, string> = {
    'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
    'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
    'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
    'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
    'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
    'ｳﾞ': 'ヴ',
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
    'ｰ': 'ー', '･': '・',
  };

  for (const [k, v] of Object.entries(kanaMap)) {
    if (s.includes(k)) {
      s = s.split(k).join(v);
    }
  }

  // 4. Wave dashes to standard Japanese wave dash (〜 U+301C)
  s = s.replace(/[\uFF5E~]/g, '〜');

  // 5. Exclamation and question marks to full-width (for title consistency like 押忍！番長4)
  s = s.replace(/!/g, '！');
  s = s.replace(/\?/g, '？');

  // 6. Parentheses, brackets, and math symbols
  s = s.replace(/（/g, '(').replace(/）/g, ')');
  s = s.replace(/［/g, '[').replace(/］/g, ']');
  s = s.replace(/－/g, '-').replace(/＋/g, '+');
  s = s.replace(/\uFF9E/g, '゛').replace(/\uFF9F/g, '゜');

  // Check alias dictionary on normalized string
  if (aliasDictionary && aliasDictionary[s]) {
    return aliasDictionary[s];
  }

  return s;
}

/**
 * Retrieves the effective lending and exchange rates for a given model,
 * supporting category-level rate overrides if configured on the store.
 * Falls back to store default rates if not specified.
 */
export function getStoreRatesForModel(
  store: Partial<StoreInfo | StoreProfile>,
  modelName?: string
): { rateLend: number; rateExchange: number } {
  const baseLend = store.rateLend || 46;
  const baseExchange = store.rateExchange || 52;

  if (!store.categoryRates || !modelName) {
    return { rateLend: baseLend, rateExchange: baseExchange };
  }

  // Check exact model match in categoryRates
  if (store.categoryRates[modelName]) {
    const override = store.categoryRates[modelName];
    return {
      rateLend: override.rateLend ?? baseLend,
      rateExchange: override.rateExchange ?? baseExchange,
    };
  }

  // Check category keys: smartSlot / juggler / aType / other
  let categoryKey: string | null = null;
  if (isSmartSlot(modelName)) {
    categoryKey = 'smartSlot';
  } else if (isJuggler(modelName)) {
    categoryKey = 'juggler';
  } else if (isAType(modelName)) {
    categoryKey = 'aType';
  } else {
    categoryKey = 'other';
  }

  const altKey =
    categoryKey === 'smartSlot'
      ? 'スマスロ'
      : categoryKey === 'juggler'
      ? 'ジャグラー'
      : categoryKey === 'aType'
      ? 'Aタイプ'
      : 'その他';

  const override = store.categoryRates[categoryKey] || store.categoryRates[altKey];
  if (override) {
    return {
      rateLend: override.rateLend ?? baseLend,
      rateExchange: override.rateExchange ?? baseExchange,
    };
  }

  return { rateLend: baseLend, rateExchange: baseExchange };
}
