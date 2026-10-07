import { describe, it, expect } from 'vitest';
import { calculateDayOfWeek, JAPANESE_DAYS } from '../dataEngine';

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
