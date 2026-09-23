// Japanese Holidays utility for calendar and day-of-week analytics

interface HolidayInfo {
  isHoliday: boolean;
  holidayName?: string;
}

// Fixed or calculated Japanese holidays
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
 * Returns holiday information for a given date in YYYY-MM-DD or YYYY/MM/DD format.
 */
export function getJapaneseHoliday(dateStr: string): HolidayInfo {
  const parts = dateStr.split(/[-/.]/);
  if (parts.length < 3) return { isHoliday: false };

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return { isHoliday: false };

  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 1. Fixed date holidays
  if (FIXED_HOLIDAYS[mmdd]) {
    return { isHoliday: true, holidayName: FIXED_HOLIDAYS[mmdd] };
  }

  // 2. Happy Monday holidays
  // 成人の日 (1月第2月曜日)
  if (month === 1 && day === getNthMonday(year, 1, 2)) {
    return { isHoliday: true, holidayName: '成人の日' };
  }
  // 海の日 (7月第3月曜日)
  if (month === 7 && day === getNthMonday(year, 7, 3)) {
    return { isHoliday: true, holidayName: '海の日' };
  }
  // 敬老の日 (9月第3月曜日)
  if (month === 9 && day === getNthMonday(year, 9, 3)) {
    return { isHoliday: true, holidayName: '敬老の日' };
  }
  // スポーツの日 (10月第2月曜日)
  if (month === 10 && day === getNthMonday(year, 10, 2)) {
    return { isHoliday: true, holidayName: 'スポーツの日' };
  }

  // 3. Equinox days
  if (month === 3 && day === getEquinoxDay(year, true)) {
    return { isHoliday: true, holidayName: '春分の日' };
  }
  if (month === 9 && day === getEquinoxDay(year, false)) {
    return { isHoliday: true, holidayName: '秋分の日' };
  }

  // 4. Substitute Holiday (振替休日)
  // If the preceding Sunday was a holiday, Monday is a substitute holiday
  const curDate = new Date(year, month - 1, day);
  if (curDate.getDay() === 1) {
    const prevSun = new Date(year, month - 1, day - 1);
    const prevDateStr = `${prevSun.getFullYear()}-${String(prevSun.getMonth() + 1).padStart(2, '0')}-${String(prevSun.getDate()).padStart(2, '0')}`;
    const prevHoliday = getJapaneseHoliday(prevDateStr);
    if (prevHoliday.isHoliday) {
      return { isHoliday: true, holidayName: '振替休日' };
    }
  }

  // 5. Citizen's Holiday (国民の休日): between two holidays, e.g. 5/4 historically, or Silver Week
  if (curDate.getDay() !== 0) {
    const prevDay = new Date(year, month - 1, day - 1);
    const nextDay = new Date(year, month - 1, day + 1);
    const pStr = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
    const nStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    if (getJapaneseHoliday(pStr).isHoliday && getJapaneseHoliday(nStr).isHoliday) {
      return { isHoliday: true, holidayName: '国民の休日' };
    }
  }

  return { isHoliday: false };
}

/**
 * Returns whether a date string is a Japanese national holiday.
 */
export function isJapaneseHoliday(dateStr: string): boolean {
  return getJapaneseHoliday(dateStr).isHoliday;
}
