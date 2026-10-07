import { describe, it, expect } from 'vitest';
import {
  getBaseHolidayName,
  getJapaneseHoliday,
  isJapaneseHoliday,
} from '../holidayUtils';

describe('holidayUtils', () => {
  describe('fixed date holidays (固定祝日)', () => {
    it('identifies New Year, National Foundation Day, Emperor Birthday, etc.', () => {
      expect(getBaseHolidayName(2024, 1, 1)).toBe('元日');
      expect(getBaseHolidayName(2024, 2, 11)).toBe('建国記念の日');
      expect(getBaseHolidayName(2024, 2, 23)).toBe('天皇誕生日');
      expect(getBaseHolidayName(2024, 4, 29)).toBe('昭和の日');
      expect(getBaseHolidayName(2024, 5, 3)).toBe('憲法記念日');
      expect(getBaseHolidayName(2024, 5, 4)).toBe('みどりの日');
      expect(getBaseHolidayName(2024, 5, 5)).toBe('こどもの日');
      expect(getBaseHolidayName(2024, 8, 11)).toBe('山の日');
      expect(getBaseHolidayName(2024, 11, 3)).toBe('文化の日');
      expect(getBaseHolidayName(2024, 11, 23)).toBe('勤労感謝の日');
    });

    it('returns null on regular non-holiday days', () => {
      expect(getBaseHolidayName(2024, 1, 2)).toBeNull();
      expect(getBaseHolidayName(2024, 4, 1)).toBeNull();
      expect(getBaseHolidayName(2024, 8, 15)).toBeNull();
    });
  });

  describe('Happy Monday holidays', () => {
    it('identifies Coming of Age Day (2nd Monday of January)', () => {
      // In 2024, Jan 1 was Mon, Jan 8 was 2nd Mon
      expect(getJapaneseHoliday('2024-01-08')).toEqual({
        isHoliday: true,
        holidayName: '成人の日',
      });
    });

    it('identifies Marine Day (3rd Monday of July)', () => {
      // In 2024, July 15 was 3rd Mon
      expect(getJapaneseHoliday('2024-07-15')).toEqual({
        isHoliday: true,
        holidayName: '海の日',
      });
    });

    it('identifies Respect for the Aged Day (3rd Monday of September)', () => {
      // In 2024, Sep 16 was 3rd Mon
      expect(getJapaneseHoliday('2024-09-16')).toEqual({
        isHoliday: true,
        holidayName: '敬老の日',
      });
    });

    it('identifies Sports Day (2nd Monday of October)', () => {
      // In 2024, Oct 14 was 2nd Mon
      expect(getJapaneseHoliday('2024-10-14')).toEqual({
        isHoliday: true,
        holidayName: 'スポーツの日',
      });
    });
  });

  describe('Equinox days (春分の日・秋分の日)', () => {
    it('accurately calculates Vernal Equinox Day (春分の日)', () => {
      // 2024 Vernal Equinox is March 20
      expect(getJapaneseHoliday('2024-03-20')).toEqual({
        isHoliday: true,
        holidayName: '春分の日',
      });
    });

    it('accurately calculates Autumnal Equinox Day (秋分の日)', () => {
      // 2024 Autumnal Equinox is September 22 (Sunday)
      expect(getBaseHolidayName(2024, 9, 22)).toBe('秋分の日');
    });
  });

  describe('振替休日 (Substitute Holidays)', () => {
    it('identifies substitute holiday when a national holiday falls on Sunday', () => {
      // 2024-02-11 (建国記念の日) was Sunday -> 2024-02-12 (Monday) is 振替休日
      const res1 = getJapaneseHoliday('2024-02-12');
      expect(res1.isHoliday).toBe(true);
      expect(res1.holidayName).toBe('振替休日');

      // 2024-05-05 (こどもの日) was Sunday -> 2024-05-06 (Monday) is 振替休日
      const res2 = getJapaneseHoliday('2024-05-06');
      expect(res2.isHoliday).toBe(true);
      expect(res2.holidayName).toBe('振替休日');

      // 2024-09-22 (秋分の日) was Sunday -> 2024-09-23 (Monday) is 振替休日
      const res3 = getJapaneseHoliday('2024-09-23');
      expect(res3.isHoliday).toBe(true);
      expect(res3.holidayName).toBe('振替休日');
    });

    it('does not label normal weekdays as substitute holidays', () => {
      expect(getJapaneseHoliday('2024-02-13').isHoliday).toBe(false);
      expect(getJapaneseHoliday('2024-05-07').isHoliday).toBe(false);
    });
  });

  describe('国民の休日 (Citizen\'s Holiday)', () => {
    it('identifies 国民の休日 when sandwiched between two national holidays', () => {
      // In 2015: Sep 21 was 敬老の日 (Mon), Sep 23 was 秋分の日 (Wed).
      // Sep 22 (Tue) was sandwiched between two national holidays -> 国民の休日!
      const res = getJapaneseHoliday('2015-09-22');
      expect(res.isHoliday).toBe(true);
      expect(res.holidayName).toBe('国民の休日');
    });
  });

  describe('isJapaneseHoliday helper', () => {
    it('returns boolean true for any holiday and false otherwise', () => {
      expect(isJapaneseHoliday('2024-01-01')).toBe(true); // 元日
      expect(isJapaneseHoliday('2024-02-12')).toBe(true); // 振替休日
      expect(isJapaneseHoliday('2024-01-02')).toBe(false);
      expect(isJapaneseHoliday('')).toBe(false);
    });
  });
});
