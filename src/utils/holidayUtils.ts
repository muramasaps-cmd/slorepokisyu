// Japanese Holidays utility for calendar and day-of-week analytics
// Strict non-recursive implementation to prevent call stack overflow

export interface HolidayInfo {
  isHoliday: boolean;
  holidayName?: string;
}

// Fixed-date Japanese holidays
const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '元日',
  '02-11': '建国記念の日',
  '02-23': '天皇誕生日',
  '04-29': '昭和の日',
  '05-03': '憲法記念日',
  '05-04': 'みどりの日',
  '05-05': 'こどもの日',
  '08-11': '山の日',
  '11-03': '文化の日',
  '11-23': '勤労感謝の日',
};

// Calculates the N-th Monday of a given month
function getNthMonday(year: number, month: number, nth: number): number {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) break;
    if (d.getDay() === 1) {
      count++;
      if (count === nth) return day;
    }
  }
  return -1;
}

// Approximate calculation for Vernal Equinox (春分の日) and Autumnal Equinox (秋分の日)
function getEquinoxDay(year: number, isSpring: boolean): number {
  if (isSpring) {
    // 1980-2099 approximate formula
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  } else {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }
}

/**
 * Returns the base holiday name if the date is a defined National Holiday (国民の祝日)
 * STRICTLY NON-RECURSIVE (Does not check 振替休日 or 国民の休日)
 */
export function getBaseHolidayName(year: number, month: number, day: number): string | null {
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 1. Fixed date holidays
  if (FIXED_HOLIDAYS[mmdd]) {
    return FIXED_HOLIDAYS[mmdd];
  }

  // 2. Happy Monday holidays
  if (month === 1 && day === getNthMonday(year, 1, 2)) {
    return '成人の日';
  }
  if (month === 7 && day === getNthMonday(year, 7, 3)) {
    return '海の日';
  }
  if (month === 9 && day === getNthMonday(year, 9, 3)) {
    return '敬老の日';
  }
  if (month === 10 && day === getNthMonday(year, 10, 2)) {
    return 'スポーツの日';
  }

  // 3. Equinox days
  if (month === 3 && day === getEquinoxDay(year, true)) {
    return '春分の日';
  }
  if (month === 9 && day === getEquinoxDay(year, false)) {
    return '秋分の日';
  }

  return null;
}

// In-memory cache for fast lookup across hundreds of daily records
const holidayCache = new Map<string, HolidayInfo>();

/**
 * Returns full holiday information for a given date in YYYY-MM-DD or YYYY/MM/DD format.
 * Correctly evaluates Base Holidays, 振替休日 (Substitute Holidays), and 国民の休日.
 * Guaranteed zero recursive calls.
 */
export function getJapaneseHoliday(dateStr: string): HolidayInfo {
  if (!dateStr) return { isHoliday: false };

  const normalizedKey = dateStr.trim().replace(/\//g, '-');
  if (holidayCache.has(normalizedKey)) {
    return holidayCache.get(normalizedKey)!;
  }

  const parts = normalizedKey.split('-');
  if (parts.length < 3) {
    const res = { isHoliday: false };
    holidayCache.set(normalizedKey, res);
    return res;
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    const res = { isHoliday: false };
    holidayCache.set(normalizedKey, res);
    return res;
  }

  // 1. Check if today is a base national holiday
  const baseName = getBaseHolidayName(year, month, day);
  if (baseName) {
    const res = { isHoliday: true, holidayName: baseName };
    holidayCache.set(normalizedKey, res);
    return res;
  }

  const curDate = new Date(year, month - 1, day);
  const dayOfWeek = curDate.getDay(); // 0 = Sun, 1 = Mon, ...

  // 2. 振替休日 (Substitute Holiday):
  // 祝日法第3条第2項: 国民の祝日が日曜日に当たるときは、その日後においてその日に最も近い国民の祝日でない日を休日とする
  // If today is NOT Sunday (0) and NOT a base holiday, check previous consecutive days:
  if (dayOfWeek !== 0) {
    let checkDate = new Date(year, month - 1, day - 1);
    let isSubstitute = false;
    while (true) {
      const cY = checkDate.getFullYear();
      const cM = checkDate.getMonth() + 1;
      const cD = checkDate.getDate();
      const prevBaseName = getBaseHolidayName(cY, cM, cD);
      if (!prevBaseName) {
        break;
      }
      if (checkDate.getDay() === 0) {
        // We traced consecutive base holidays back to a Sunday!
        isSubstitute = true;
        break;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (isSubstitute) {
      const res = { isHoliday: true, holidayName: '振替休日' };
      holidayCache.set(normalizedKey, res);
      return res;
    }
  }

  // 3. 国民の休日 (Citizen's Holiday):
  // 祝日法第3条第3項: その前日及び翌日が「国民の祝日」である日は休日とする（日曜日は除く）
  if (dayOfWeek !== 0) {
    const prevDate = new Date(year, month - 1, day - 1);
    const nextDate = new Date(year, month - 1, day + 1);
    const prevBase = getBaseHolidayName(prevDate.getFullYear(), prevDate.getMonth() + 1, prevDate.getDate());
    const nextBase = getBaseHolidayName(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());

    if (prevBase && nextBase) {
      const res = { isHoliday: true, holidayName: '国民の休日' };
      holidayCache.set(normalizedKey, res);
      return res;
    }
  }

  const res = { isHoliday: false };
  holidayCache.set(normalizedKey, res);
  return res;
}

/**
 * Returns whether a date string is a Japanese national holiday.
 */
export function isJapaneseHoliday(dateStr: string): boolean {
  return getJapaneseHoliday(dateStr).isHoliday;
}
