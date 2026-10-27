import { describe, it, expect } from 'vitest';
import { normalizeModelName, getStoreRatesForModel } from '../modelName';
import { StoreProfile } from '../../data/types';

describe('normalizeModelName', () => {
  describe('whitespace normalization', () => {
    it('trims leading and trailing spaces and collapses multiple spaces', () => {
      expect(normalizeModelName('  甲鉄城のカバネリ  ')).toBe('甲鉄城のカバネリ');
      expect(normalizeModelName('L　革命機　　ヴァルヴレイヴ')).toBe('L 革命機 ヴァルヴレイヴ');
      expect(normalizeModelName('\u3000マイジャグラーV\u3000')).toBe('マイジャグラーV');
    });

    it('returns empty string for null, undefined, or empty inputs', () => {
      expect(normalizeModelName('')).toBe('');
      expect(normalizeModelName(null as unknown as string)).toBe('');
      expect(normalizeModelName(undefined as unknown as string)).toBe('');
    });
  });

  describe('zenkaku / hankaku normalization', () => {
    it('converts full-width alphanumerics to half-width', () => {
      expect(normalizeModelName('ＳアイムジャグラーＥＸ')).toBe('SアイムジャグラーEX');
      expect(normalizeModelName('Ｌパチスロ北斗の拳')).toBe('Lパチスロ北斗の拳');
      expect(normalizeModelName('押忍！番長ZERO')).toBe('押忍！番長ZERO');
      expect(normalizeModelName('スマスロ１２３')).toBe('スマスロ123');
    });

    it('converts half-width katakana (including voiced marks) to full-width katakana', () => {
      expect(normalizeModelName('ﾊﾟﾁｽﾛ ｶﾞﾙﾊﾟﾝ')).toBe('パチスロ ガルパン');
      expect(normalizeModelName('ﾏｲｼﾞｬｸﾞﾗｰV')).toBe('マイジャグラーV');
      expect(normalizeModelName('ヴ')).toBe('ヴ');
    });
  });

  describe('symbols and punctuation normalization', () => {
    it('normalizes wave dashes to standard Japanese wave dash (〜)', () => {
      expect(normalizeModelName('Re:ゼロから始める異世界生活 season2~')).toBe('Re:ゼロから始める異世界生活 season2〜');
      expect(normalizeModelName('シンフォギア～勇気の歌～')).toBe('シンフォギア〜勇気の歌〜');
    });

    it('normalizes half-width exclamation and question marks to full-width', () => {
      expect(normalizeModelName('押忍!番長4')).toBe('押忍！番長4');
      expect(normalizeModelName('Re:ゼロ!')).toBe('Re:ゼロ！');
      expect(normalizeModelName('戦国乙女?')).toBe('戦国乙女？');
    });

    it('normalizes brackets and parentheses to standard half-width', () => {
      expect(normalizeModelName('（スマスロ）モンキーターンV')).toBe('(スマスロ)モンキーターンV');
      expect(normalizeModelName('［新台］押忍！番長4')).toBe('[新台]押忍！番長4');
    });
  });

  describe('alias dictionary resolution', () => {
    const aliasDict: Record<string, string> = {
      'マイジャグ5': 'マイジャグラーV',
      'カバネリ': '甲鉄城のカバネリ',
      'ヴヴヴ': 'L 革命機ヴァルヴレイヴ',
      'Ｓアイム': 'SアイムジャグラーEX',
    };

    it('resolves direct raw matches against alias dictionary', () => {
      expect(normalizeModelName('マイジャグ5', aliasDict)).toBe('マイジャグラーV');
      expect(normalizeModelName('カバネリ', aliasDict)).toBe('甲鉄城のカバネリ');
    });

    it('resolves normalized strings against alias dictionary', () => {
      // Input has full-width S, but alias key is full-width or normalized
      expect(normalizeModelName('Ｓアイム', aliasDict)).toBe('SアイムジャグラーEX');
      expect(normalizeModelName('  ヴヴヴ  ', aliasDict)).toBe('L 革命機ヴァルヴレイヴ');
    });

    it('returns normalized original when alias is not present in dictionary', () => {
      expect(normalizeModelName('Lパチスロ北斗の拳', aliasDict)).toBe('Lパチスロ北斗の拳');
    });
  });
});

describe('getStoreRatesForModel', () => {
  const baseStore: Partial<StoreProfile> = {
    rateLend: 46,
    rateExchange: 52,
  };

  it('returns store base rates when categoryRates is not defined', () => {
    const rates = getStoreRatesForModel(baseStore, 'Lパチスロ北斗の拳');
    expect(rates).toEqual({ rateLend: 46, rateExchange: 52 });
  });

  it('returns default 46/52 when store has no rates defined', () => {
    const rates = getStoreRatesForModel({}, 'マイジャグラーV');
    expect(rates).toEqual({ rateLend: 46, rateExchange: 52 });
  });

  it('overrides rates for specific model exact match', () => {
    const storeWithModelRate: Partial<StoreProfile> = {
      ...baseStore,
      categoryRates: {
        'Lパチスロ北斗の拳': { rateLend: 50, rateExchange: 50 },
      },
    };
    expect(getStoreRatesForModel(storeWithModelRate, 'Lパチスロ北斗の拳')).toEqual({
      rateLend: 50,
      rateExchange: 50,
    });
    // Other models still use base store rate
    expect(getStoreRatesForModel(storeWithModelRate, 'マイジャグラーV')).toEqual({
      rateLend: 46,
      rateExchange: 52,
    });
  });

  it('overrides rates for SmartSlot category (smartSlot or スマスロ)', () => {
    const storeWithSmartSlot: Partial<StoreProfile> = {
      ...baseStore,
      categoryRates: {
        smartSlot: { rateLend: 46, rateExchange: 50 },
      },
    };
    // Smart slot model names (starts with L or contains スマスロ)
    expect(getStoreRatesForModel(storeWithSmartSlot, 'L革命機ヴァルヴレイヴ')).toEqual({
      rateLend: 46,
      rateExchange: 50,
    });
    expect(getStoreRatesForModel(storeWithSmartSlot, 'スマスロモンキーターンV')).toEqual({
      rateLend: 46,
      rateExchange: 50,
    });
    // Non-smart slot gets store base rates
    expect(getStoreRatesForModel(storeWithSmartSlot, 'マイジャグラーV')).toEqual({
      rateLend: 46,
      rateExchange: 52,
    });
  });

  it('overrides rates for Juggler category (juggler or ジャグラー)', () => {
    const storeWithJuggler: Partial<StoreProfile> = {
      ...baseStore,
      categoryRates: {
        'ジャグラー': { rateLend: 47, rateExchange: 53 },
      },
    };
    expect(getStoreRatesForModel(storeWithJuggler, 'マイジャグラーV')).toEqual({
      rateLend: 47,
      rateExchange: 53,
    });
    expect(getStoreRatesForModel(storeWithJuggler, 'アイムジャグラーEX')).toEqual({
      rateLend: 47,
      rateExchange: 53,
    });
  });

  it('supports partial override where only rateLend or rateExchange is specified', () => {
    const storeWithPartial: Partial<StoreProfile> = {
      rateLend: 46,
      rateExchange: 52,
      categoryRates: {
        aType: { rateExchange: 50 }, // only exchange overridden
      },
    };
    expect(getStoreRatesForModel(storeWithPartial, 'ハナハナホウオウ〜天翔〜-30')).toEqual({
      rateLend: 46, // fallback to baseLend
      rateExchange: 50,
    });
  });
});

// =========================================================================
// Prompt 55: Reference Implementations & Comprehensive Verification Tests
// =========================================================================

/**
 * Verbatim un-cached reference implementation of normalizeModelName
 */
function normalizeModelNameReference(
  rawName: string,
  aliasDictionary?: Record<string, string>
): string {
  if (!rawName || typeof rawName !== 'string') return '';

  if (aliasDictionary && aliasDictionary[rawName]) {
    return aliasDictionary[rawName];
  }

  let s = rawName.replace(/\u3000/g, ' ').trim().replace(/\s+/g, ' ');

  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );

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

  s = s.replace(/[\uFF5E~]/g, '〜');
  s = s.replace(/!/g, '！');
  s = s.replace(/\?/g, '？');
  s = s.replace(/（/g, '(').replace(/）/g, ')');
  s = s.replace(/［/g, '[').replace(/］/g, ']');
  s = s.replace(/－/g, '-').replace(/＋/g, '+');
  s = s.replace(/\uFF9E/g, '゛').replace(/\uFF9F/g, '゜');

  if (aliasDictionary && aliasDictionary[s]) {
    return aliasDictionary[s];
  }

  return s;
}

/**
 * Verbatim un-cached reference implementations for model filter utilities
 */
function isJugglerReference(name: string): boolean {
  if (!name) return false;
  return /ジャグラー|juggler|jugler/i.test(name);
}

function isSmartSlotReference(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (/^[Ll][\s　・]?[^\w]/u.test(trimmed) || /^[Ll]パチスロ/i.test(trimmed) || /^[Ll]スマスロ/i.test(trimmed)) {
    return true;
  }
  if (/スマスロ|スマート/i.test(trimmed)) {
    return true;
  }
  if (/^[Ll][A-Za-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed) && !/^L[A-Z]{3,}/.test(trimmed)) {
    return true;
  }
  return false;
}

function isATypeReference(name: string): boolean {
  if (!name) return false;
  if (isJugglerReference(name)) return true;

  const normalKeywords = [
    'ハナハナ', 'ディスクアップ', 'アレックス', 'パルサー', 'クランキー',
    'バーサス', 'ハナビ', '花火', 'サンダー', 'ゲッターマウス',
    'マッピー', 'a-slot', 'aタイプ', 'うまい棒', 'ハイビ',
    'シオサイ', 'ニューパル', 'ガメラ', '新ハナビ', 'ディスク',
  ];

  const lower = name.toLowerCase();
  return normalKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

import { isJuggler, isSmartSlot, isAType } from '../modelFilterUtils';
import fs from 'fs';
import path from 'path';
import { createSyntheticCrossStoreData, BENCHMARK_35_MODELS } from '../../scripts/benchmark_scope_all';
import { calculateCrossStoreModelRows, calculateModelMonthlyTrends, estimateCrossStoreModelSettings } from '../modelCrossStore';
import { calculateCrossStoreRanking } from '../crossStoreRanking';
import { calculateTargetMachineRanking } from '../targetMachineRanking';

describe('Prompt 55: normalizeModelNameReference vs Cached Implementation', () => {
  const testInputs: Array<{ label: string; value: any }> = [
    { label: '全角英数', value: 'Ｌパチスロ北斗の拳７ ＳアイムジャグラーＥＸ スマスロ１２３' },
    { label: '半角カナ', value: 'ﾊﾟﾁｽﾛ ｶﾞﾙﾊﾟﾝ ﾏｲｼﾞｬｸﾞﾗｰV' },
    { label: '濁点つき半角カナ', value: 'ｳﾞ ｶﾞｷﾞｸﾞｹﾞｺﾞ ｻﾞｼﾞｽﾞｾﾞｿﾞ ﾀﾞﾁﾞﾂﾞﾃﾞﾄﾞ ﾊﾞﾋﾞﾌﾞﾍﾞﾎﾞ ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ' },
    { label: '～と~', value: 'Re:ゼロ~ 甲賀忍法帖～' },
    { label: '半角の!?', value: '押忍!番長4? 本当!?' },
    { label: '全角括弧', value: '（スマスロ）［新台］モンキーターンV' },
    { label: '全角スペース', value: 'マイジャグラー\u3000V\u3000II' },
    { label: '前後空白', value: '   甲鉄城のカバネリ   ' },
    { label: '連続空白', value: 'L     からくり    サーカス' },
    { label: '空文字', value: '' },
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: '数値', value: 12345 },
  ];

  const aliasDict: Record<string, string> = {
    'Lパチスロ北斗の拳7 SアイムジャグラーEX スマスロ123': '北斗7アイムミックス',
    '甲鉄城のカバネリ': 'カバネリ正規名',
    '押忍！番長4？ 本当！？': '番長4正規名',
  };

  testInputs.forEach(({ label, value }) => {
    it(`matches reference for [${label}] WITHOUT alias dictionary`, () => {
      const expected = normalizeModelNameReference(value);
      const actual = normalizeModelName(value);
      expect(actual).toBe(expected);
    });

    it(`matches reference for [${label}] WITH alias dictionary`, () => {
      const expected = normalizeModelNameReference(value, aliasDict);
      const actual = normalizeModelName(value, aliasDict);
      expect(actual).toBe(expected);
    });
  });

  it('updates dynamically when alias dictionary is modified without returning stale cache', () => {
    const raw = '  マイジャグ5  ';
    const dict1 = { 'マイジャグ5': 'マイジャグラーV' };
    const dict2 = { 'マイジャグ5': 'マイジャグラーV (別バージョン)' };

    expect(normalizeModelName(raw, dict1)).toBe('マイジャグラーV');
    expect(normalizeModelName(raw, dict2)).toBe('マイジャグラーV (別バージョン)');
    expect(normalizeModelName(raw)).toBe('マイジャグ5');
  });

  it('preserves exact output even when cache capacity is exceeded (overflow test)', () => {
    const testSample = 'Ｌパチスロ北斗の拳';
    const expected = normalizeModelNameReference(testSample);

    // Warm up cache
    expect(normalizeModelName(testSample)).toBe(expected);

    // Overflow cache by inserting 50,001 keys
    for (let i = 0; i <= 50005; i++) {
      normalizeModelName(`パチスロ検証機種名_${i}`);
    }

    // Verify cache eviction preserves identical output
    expect(normalizeModelName(testSample)).toBe(expected);
  });
});

describe('Prompt 55: modelFilterUtils vs Reference Implementation', () => {
  it('matches reference outputs for isJuggler, isSmartSlot, isAType across all benchmark models', () => {
    for (const model of BENCHMARK_35_MODELS) {
      expect(isJuggler(model)).toBe(isJugglerReference(model));
      expect(isSmartSlot(model)).toBe(isSmartSlotReference(model));
      expect(isAType(model)).toBe(isATypeReference(model));
    }
  });

  it('handles edge cases consistently between cached and reference implementations', () => {
    const edgeCases = [
      '',
      '   ',
      'L',
      'l',
      'LL',
      'L パチスロ',
      'スマートスロット',
      'ジャグラー',
      'JUGGLER',
      'jugler',
      'a-slot',
      'Aタイプ',
      '新ハナビ',
      '甲鉄城のカバネリ',
    ];

    for (const name of edgeCases) {
      expect(isJuggler(name)).toBe(isJugglerReference(name));
      expect(isSmartSlot(name)).toBe(isSmartSlotReference(name));
      expect(isAType(name)).toBe(isATypeReference(name));
    }
  });

  it('preserves correctness across filter cache eviction threshold (20,000 keys)', () => {
    const target = 'アイムジャグラーEX';
    expect(isJuggler(target)).toBe(true);

    // Generate 20,005 calls to trigger cache clear
    for (let i = 0; i < 20005; i++) {
      isJuggler(`ダミー機種_${i}`);
      isSmartSlot(`ダミー機種_${i}`);
      isAType(`ダミー機種_${i}`);
    }

    expect(isJuggler(target)).toBe(true);
    expect(isSmartSlot(target)).toBe(false);
    expect(isAType(target)).toBe(true);
  });
});

describe('Prompt 55: Cross-Store Golden Byte-for-Byte Consistency Test', () => {
  it('matches pre-optimization golden JSON byte-for-byte on fixed seed (3 stores x 60 days x 40 machines)', () => {
    const goldenFilePath = path.resolve(process.cwd(), 'src/utils/__tests__/golden/crossStoreModelGolden.json');
    expect(fs.existsSync(goldenFilePath)).toBe(true);

    const goldenJsonString = fs.readFileSync(goldenFilePath, 'utf-8').trim();

    const stores = createSyntheticCrossStoreData({ numStores: 3, numDays: 60, numMachines: 40, seed: 42 });
    const targetDate = '2024-03-02';
    const targetModel = BENCHMARK_35_MODELS[0];

    const modelRows = calculateCrossStoreModelRows(stores);
    const monthlyTrends = calculateModelMonthlyTrends(stores, targetModel);
    const modelSettings = estimateCrossStoreModelSettings(stores, targetModel);
    const crossRanking = calculateCrossStoreRanking(stores, targetDate);
    const targetMachineRanking = calculateTargetMachineRanking(
      targetDate,
      stores[0].dailyRecords,
      stores[0].specialDayRules
    );

    const currentResult = {
      modelRows,
      monthlyTrends,
      modelSettings,
      crossRanking,
      targetMachineRanking,
    };

    const currentJsonString = JSON.stringify(currentResult, null, 2).trim();

    // Byte-level / exact string equality
    expect(currentJsonString).toBe(goldenJsonString);
  });
});
