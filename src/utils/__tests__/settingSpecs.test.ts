import { describe, it, expect } from 'vitest';
import {
  importSettingSpecsFromJson,
  exportSettingSpecsAsJson,
  validateModelSettingSpec,
  ModelSettingSpec,
} from '../settingSpecs';

describe('settingSpecs JSON import/export', () => {
  it('imports single model object JSON correctly (user format)', () => {
    const singleModelJson = JSON.stringify({
      modelName: 'マイジャグラーV',
      aliases: ['マイジャグ5', 'SマイジャグラーVKD'],
      source: 'メーカー公表値',
      settings: [
        { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 409.6 },
        { label: '設定2', settingNum: 2, payoutRate: 98.0, bbDenom: 270.8, rbDenom: 385.5 },
        { label: '設定3', settingNum: 3, payoutRate: 99.9, bbDenom: 266.4, rbDenom: 336.1 },
        { label: '設定4', settingNum: 4, payoutRate: 102.8, bbDenom: 254.0, rbDenom: 290.0 },
        { label: '設定5', settingNum: 5, payoutRate: 105.3, bbDenom: 240.1, rbDenom: 268.6 },
        { label: '設定6', settingNum: 6, payoutRate: 109.4, bbDenom: 229.1, rbDenom: 229.1 },
      ],
    });

    const result = importSettingSpecsFromJson(singleModelJson);
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0].modelName).toBe('マイジャグラーV');
    expect(result.imported[0].settings).toHaveLength(6);
    expect(result.imported[0].settings[0].payoutRate).toBe(97.0);
    expect(result.imported[0].settings[5].payoutRate).toBe(109.4);
    expect(result.imported[0].aliases).toContain('マイジャグ5');
  });

  it('imports multiple models in an array JSON correctly', () => {
    const multiModelsJson = JSON.stringify([
      {
        modelName: 'マイジャグラーV',
        settings: [
          { label: '設定1', payoutRate: 97.0 },
          { label: '設定6', payoutRate: 109.4 },
        ],
      },
      {
        modelName: 'アイムジャグラーEX',
        settings: [
          { label: '設定1', payoutRate: 97.0 },
          { label: '設定6', payoutRate: 105.5 },
        ],
      },
    ]);

    const result = importSettingSpecsFromJson(multiModelsJson);
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(2);
    expect(result.imported[0].modelName).toBe('マイジャグラーV');
    expect(result.imported[1].modelName).toBe('アイムジャグラーEX');
  });

  it('imports wrapper format with specs array', () => {
    const wrapperJson = JSON.stringify({
      version: 1,
      specs: [
        {
          modelName: 'ファンキージャグラー2',
          settings: [
            { label: '設定1', payoutRate: 97.0 },
            { label: '設定6', payoutRate: 109.0 },
          ],
        },
      ],
    });

    const result = importSettingSpecsFromJson(wrapperJson);
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0].modelName).toBe('ファンキージャグラー2');
  });

  it('imports key-value dictionary where keys are model names', () => {
    const dictJson = JSON.stringify({
      'マイジャグラーV': [
        { label: '設定1', payoutRate: 97.0 },
        { label: '設定6', payoutRate: 109.4 },
      ],
      'ゴーゴージャグラー3': [
        { label: '設定1', payoutRate: 97.0 },
        { label: '設定6', payoutRate: 106.5 },
      ],
    });

    const result = importSettingSpecsFromJson(dictJson);
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(2);
    expect(result.imported.map((s) => s.modelName)).toEqual(
      expect.arrayContaining(['マイジャグラーV', 'ゴーゴージャグラー3'])
    );
  });

  it('handles string payout rates and relaxed denominator notations', () => {
    const relaxedJson = JSON.stringify({
      modelName: 'ハッピージャグラーV III',
      settings: [
        { label: '設定1', payoutRate: '97.0%', bbDenom: '1/273.1', rbDenom: '1/397.2' },
        { label: '設定6', payoutRate: '108.4', bbDenom: 226.0, rbDenom: 256.0 },
      ],
    });

    const result = importSettingSpecsFromJson(relaxedJson);
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0].settings[0].payoutRate).toBe(97.0);
    expect(result.imported[0].settings[0].bbDenom).toBe(273.1);
    expect(result.imported[0].settings[0].rbDenom).toBe(397.2);
  });
});
