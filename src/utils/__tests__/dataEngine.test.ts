import { describe, it, expect } from 'vitest';
import { calculateDayOfWeek, JAPANESE_DAYS, parseSlotDataInput } from '../dataEngine';

describe('calculateDayOfWeek', () => {
  describe('invalid date strings return null', () => {
    it('returns null on empty or non-string input', () => {
      expect(calculateDayOfWeek('')).toBeNull();
      expect(calculateDayOfWeek(null as unknown as string)).toBeNull();
      expect(calculateDayOfWeek(undefined as unknown as string)).toBeNull();
    });

    it('returns null on unparseable format', () => {
      expect(calculateDayOfWeek('not-a-date')).toBeNull();
      expect(calculateDayOfWeek('2024-01')).toBeNull();
      expect(calculateDayOfWeek('2024')).toBeNull();
    });

    it('returns null on impossible or out-of-range dates', () => {
      expect(calculateDayOfWeek('2024-02-31')).toBeNull(); // Feb 31 does not exist
      expect(calculateDayOfWeek('2024-13-01')).toBeNull(); // Month 13
      expect(calculateDayOfWeek('2024-04-31')).toBeNull(); // April has 30 days
      expect(calculateDayOfWeek('1800-01-01')).toBeNull(); // Year < 1900
    });
  });

  describe('valid dates return correct Japanese day of week', () => {
    it('correctly maps all 7 days of the week', () => {
      // 2024-01-01 was Monday
      expect(calculateDayOfWeek('2024-01-01')).toBe('月');
      expect(calculateDayOfWeek('2024-01-02')).toBe('火');
      expect(calculateDayOfWeek('2024-01-03')).toBe('水');
      expect(calculateDayOfWeek('2024-01-04')).toBe('木');
      expect(calculateDayOfWeek('2024-01-05')).toBe('金');
      expect(calculateDayOfWeek('2024-01-06')).toBe('土');
      expect(calculateDayOfWeek('2024-01-07')).toBe('日');
    });

    it('supports slash and dot delimiters', () => {
      expect(calculateDayOfWeek('2024/01/01')).toBe('月');
      expect(calculateDayOfWeek('2024.01.07')).toBe('日');
    });

    it('returns one of the defined JAPANESE_DAYS', () => {
      const result = calculateDayOfWeek('2024-05-15');
      expect(result).not.toBeNull();
      expect(JAPANESE_DAYS).toContain(result);
    });
  });
});

describe('parseSlotDataInput duplicate date resolution', () => {
  it('resolves duplicate dates in CSV using mergeDailyRecords quality score logic', () => {
    // Two rows with the same date 2024-05-15:
    // Row 1: date only, minimal fields (quality score is lower)
    // Row 2: contains win rate and higher machine count and notable memo (higher quality)
    const csvContent = [
      '日付,台平均差枚,平均ゲーム数,総台数,勝率(%),特日フラグ,備考',
      '2024-05-15,+50,3000,100,,,', // lower quality
      '2024-05-15,+80,6500,200,55.0,特日,良データ取込', // higher quality
    ].join('\n');

    const { records, errors } = parseSlotDataInput(csvContent);
    expect(errors).toEqual([]);
    expect(records.length).toBe(1);

    // Should retain the higher-quality record (Row 2)
    const r = records[0];
    expect(r.date).toBe('2024-05-15');
    expect(r.totalMachines).toBe(200);
    expect(r.avgDiffCoins).toBe(80);
    expect(r.avgGames).toBe(6500);
    expect(r.winRate).toBe(55.0);
    expect(r.notable).toBe('良データ取込');
  });

  it('preserves higher quality record regardless of whether it appears first or second', () => {
    // Reverse order: higher quality appears first, lower quality appears second
    const csvContent = [
      '日付,台平均差枚,平均ゲーム数,総台数,勝率(%),特日フラグ,備考',
      '2024-05-15,+80,6500,200,55.0,特日,良データ取込', // higher quality first
      '2024-05-15,+50,3000,100,,,', // lower quality second
    ].join('\n');

    const { records } = parseSlotDataInput(csvContent);
    expect(records.length).toBe(1);
    expect(records[0].totalMachines).toBe(200);
    expect(records[0].avgDiffCoins).toBe(80);
    expect(records[0].winRate).toBe(55.0);
  });
});
