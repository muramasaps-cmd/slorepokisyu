import { describe, it, expect } from 'vitest';
import {
  parseDelimitedText,
  isCsvOrTsv,
  parseUnitLevelCsv,
  normalizeDateString,
} from '../csvParser';

describe('csvParser utils', () => {
  describe('normalizeDateString', () => {
    it('normalizes YYYY-MM-DD, YYYY/M/D, and YYYY年M月D日 formats', () => {
      expect(normalizeDateString('2024-01-05')).toBe('2024-01-05');
      expect(normalizeDateString('2024/1/5')).toBe('2024-01-05');
      expect(normalizeDateString('2024年1月5日')).toBe('2024-01-05');
      expect(normalizeDateString('2024.1.5')).toBe('2024-01-05');
    });

    it('returns null on invalid date strings', () => {
      expect(normalizeDateString('')).toBeNull();
      expect(normalizeDateString('invalid')).toBeNull();
    });
  });

  describe('parseDelimitedText', () => {
    it('correctly parses standard comma-separated lines', () => {
      const csv = 'a,b,c\n1,2,3';
      const rows = parseDelimitedText(csv);
      expect(rows).toEqual([
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ]);
    });

    it('handles quotes containing embedded commas and newlines', () => {
      const csv = 'col1,"col2,with,commas",col3\n1,"2,500",3';
      const rows = parseDelimitedText(csv);
      expect(rows).toEqual([
        ['col1', 'col2,with,commas', 'col3'],
        ['1', '2,500', '3'],
      ]);
    });

    it('handles escaped double quotes ("")', () => {
      const csv = 'title,"quote ""text"" here"\nval1,val2';
      const rows = parseDelimitedText(csv);
      expect(rows[0][1]).toBe('quote "text" here');
    });

    it('auto-detects tab-delimited text (TSV)', () => {
      const tsv = 'header1\theader2\theader3\nval1\tval2\tval3';
      const rows = parseDelimitedText(tsv);
      expect(rows).toEqual([
        ['header1', 'header2', 'header3'],
        ['val1', 'val2', 'val3'],
      ]);
    });

    it('handles CRLF line endings and strips UTF-8 BOM', () => {
      const bomCsv = '\uFEFFcol1,col2\r\nval1,val2\r\n';
      const rows = parseDelimitedText(bomCsv);
      expect(rows).toEqual([
        ['col1', 'col2'],
        ['val1', 'val2'],
      ]);
    });

    it('returns empty array on empty or whitespace string', () => {
      expect(parseDelimitedText('')).toEqual([]);
      expect(parseDelimitedText('   ')).toEqual([]);
    });
  });

  describe('isCsvOrTsv', () => {
    it('detects slot CSV/TSV headers', () => {
      const sample = '日付,店舗名,機種,台番号,差枚,G数\n2024-01-01,テスト店,マイジャグ,1,1000,5000';
      expect(isCsvOrTsv(sample)).toBe(true);
    });

    it('rejects HTML contents', () => {
      const html = '<!DOCTYPE html><html><body><table><tr><td>台番号</td></tr></table></body></html>';
      expect(isCsvOrTsv(html)).toBe(false);
    });

    it('returns false for non-CSV plain text or empty strings', () => {
      expect(isCsvOrTsv('')).toBe(false);
      expect(isCsvOrTsv('Just some random text without delimiters')).toBe(false);
    });
  });

  describe('parseUnitLevelCsv', () => {
    it('parses valid machine-level slot CSV into StoreProfile', () => {
      const csvData = [
        '店舗名,日付,機種,台番,差枚,G数,BB,RB',
        'テストホール秋葉原,2024-01-07,マイジャグラーV,101,1500,6000,25,20',
        'テストホール秋葉原,2024-01-07,マイジャグラーV,102,-500,4500,15,12',
        'テストホール秋葉原,2024-01-07,パチスロ北斗の拳,201,3200,7500,30,10',
      ].join('\n');

      const result = parseUnitLevelCsv(csvData, 'test.csv');
      expect(result.success).toBe(true);
      expect(result.stores.length).toBe(1);

      const store = result.stores[0];
      expect(store.name).toContain('テストホール秋葉原');
      expect(store.dailyRecords.length).toBe(1);

      const daily = store.dailyRecords[0];
      expect(daily.date).toBe('2024-01-07');
      expect(daily.dayOfWeek).toBe('日');
      expect(daily.totalMachines).toBe(3);
      expect(daily.totalDiffCoins).toBe(1500 - 500 + 3200); // 4200
      expect(daily.machines?.length).toBe(3);
      expect(daily.models?.length).toBe(2);
    });

    it('returns failure when CSV has no valid machine rows', () => {
      const badCsv = 'a,b,c\n1,2,3';
      const result = parseUnitLevelCsv(badCsv, 'bad.csv');
      expect(result.success).toBe(false);
      expect(result.stores.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
