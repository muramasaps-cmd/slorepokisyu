import { describe, it, expect } from 'vitest';
import { isDateSpecialDay } from '../dataEngine';
import { SpecialDayRules } from '../../data/types';

describe('isDateSpecialDay', () => {
  it('returns false when rules is undefined or date string is invalid', () => {
    expect(isDateSpecialDay('2024-01-07', undefined)).toBe(false);
    expect(isDateSpecialDay('invalid-date', { tails: [7] })).toBe(false);
    expect(isDateSpecialDay('', { tails: [7] })).toBe(false);
  });

  describe('tails (末尾のつく日)', () => {
    const rules: SpecialDayRules = { tails: [7] };

    it('identifies days ending in 7 (7日, 17日, 27日)', () => {
      expect(isDateSpecialDay('2024-01-07', rules)).toBe(true);
      expect(isDateSpecialDay('2024-01-17', rules)).toBe(true);
      expect(isDateSpecialDay('2024-01-27', rules)).toBe(true);
    });

    it('returns false for other days', () => {
      expect(isDateSpecialDay('2024-01-06', rules)).toBe(false);
      expect(isDateSpecialDay('2024-01-18', rules)).toBe(false);
      expect(isDateSpecialDay('2024-01-28', rules)).toBe(false);
    });

    it('supports multiple tails (e.g. 3, 9)', () => {
      const multiRules: SpecialDayRules = { tails: [3, 9] };
      expect(isDateSpecialDay('2024-05-03', multiRules)).toBe(true);
      expect(isDateSpecialDay('2024-05-13', multiRules)).toBe(true);
      expect(isDateSpecialDay('2024-05-19', multiRules)).toBe(true);
      expect(isDateSpecialDay('2024-05-29', multiRules)).toBe(true);
      expect(isDateSpecialDay('2024-05-07', multiRules)).toBe(false);
    });

    it('supports tail 0 (10日, 20日, 30日)', () => {
      const zeroRules: SpecialDayRules = { tails: [0] };
      expect(isDateSpecialDay('2024-01-10', zeroRules)).toBe(true);
      expect(isDateSpecialDay('2024-01-20', zeroRules)).toBe(true);
      expect(isDateSpecialDay('2024-01-30', zeroRules)).toBe(true);
      expect(isDateSpecialDay('2024-01-31', zeroRules)).toBe(false);
    });
  });

  describe('doubleDigits (ゾロ目: 11日, 22日)', () => {
    const rules: SpecialDayRules = { doubleDigits: true };

    it('identifies 11日 and 22日', () => {
      expect(isDateSpecialDay('2024-03-11', rules)).toBe(true);
      expect(isDateSpecialDay('2024-03-22', rules)).toBe(true);
    });

    it('returns false for other double-looking or non-matching days', () => {
      expect(isDateSpecialDay('2024-03-12', rules)).toBe(false);
      expect(isDateSpecialDay('2024-03-21', rules)).toBe(false);
      expect(isDateSpecialDay('2024-03-01', rules)).toBe(false);
    });
  });

  describe('monthDayZoro (月日ゾロ目: 1/1, 2/2, 11/11, 12/12 etc.)', () => {
    const rules: SpecialDayRules = { monthDayZoro: true };

    it('matches when month equals day', () => {
      expect(isDateSpecialDay('2024-01-01', rules)).toBe(true);
      expect(isDateSpecialDay('2024-02-02', rules)).toBe(true);
      expect(isDateSpecialDay('2024-07-07', rules)).toBe(true);
      expect(isDateSpecialDay('2024-11-11', rules)).toBe(true);
      expect(isDateSpecialDay('2024-12-12', rules)).toBe(true);
    });

    it('returns false when month does not equal day', () => {
      expect(isDateSpecialDay('2024-01-02', rules)).toBe(false);
      expect(isDateSpecialDay('2024-07-08', rules)).toBe(false);
      expect(isDateSpecialDay('2024-11-12', rules)).toBe(false);
    });
  });

  describe('fixedDates (特定固定日)', () => {
    const rules: SpecialDayRules = { fixedDates: [1, 15] };

    it('identifies designated dates of the month', () => {
      expect(isDateSpecialDay('2024-04-01', rules)).toBe(true);
      expect(isDateSpecialDay('2024-04-15', rules)).toBe(true);
    });

    it('returns false for other dates', () => {
      expect(isDateSpecialDay('2024-04-02', rules)).toBe(false);
      expect(isDateSpecialDay('2024-04-14', rules)).toBe(false);
      expect(isDateSpecialDay('2024-04-16', rules)).toBe(false);
    });
  });

  describe('daysOfWeek (特定曜日)', () => {
    const rules: SpecialDayRules = { daysOfWeek: ['土', '日'] };

    it('identifies weekends', () => {
      // 2024-01-06 is Saturday (土), 2024-01-07 is Sunday (日)
      expect(isDateSpecialDay('2024-01-06', rules)).toBe(true);
      expect(isDateSpecialDay('2024-01-07', rules)).toBe(true);
    });

    it('returns false for weekdays', () => {
      // 2024-01-05 is Friday, 2024-01-08 is Monday
      expect(isDateSpecialDay('2024-01-05', rules)).toBe(false);
      expect(isDateSpecialDay('2024-01-08', rules)).toBe(false);
    });
  });

  describe('combined rules', () => {
    it('matches when any of the active rules are satisfied', () => {
      const combined: SpecialDayRules = {
        tails: [7],
        doubleDigits: true,
        fixedDates: [1],
      };

      expect(isDateSpecialDay('2024-01-01', combined)).toBe(true); // fixed date
      expect(isDateSpecialDay('2024-01-07', combined)).toBe(true); // tail 7
      expect(isDateSpecialDay('2024-01-11', combined)).toBe(true); // double digits
      expect(isDateSpecialDay('2024-01-17', combined)).toBe(true); // tail 7
      expect(isDateSpecialDay('2024-01-22', combined)).toBe(true); // double digits
      expect(isDateSpecialDay('2024-01-05', combined)).toBe(false);
    });
  });
});
