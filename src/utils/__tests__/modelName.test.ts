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
