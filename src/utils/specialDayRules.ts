import { SpecialDayRules } from '../data/types';

export interface SpecialDayPreset {
  label: string;
  value: string;
  description: string;
}

export const PRESET_SPECIAL_DAY_RULES: SpecialDayPreset[] = [
  {
    label: '7のつく日',
    value: '7のつく日',
    description: 'マルハン・ダイナム等定番（毎月7日・17日・27日）',
  },
  {
    label: '5のつく日',
    value: '5のつく日',
    description: 'ジャグラー特定日・地域密着ホール（毎月5日・15日・25日）',
  },
  {
    label: '3のつく日',
    value: '3のつく日',
    description: '毎月3日・13日・23日',
  },
  {
    label: '0のつく日',
    value: '0のつく日',
    description: '毎月10日・20日・30日',
  },
  {
    label: '6のつく日',
    value: '6のつく日',
    description: '毎月6日・16日・26日',
  },
  {
    label: '8のつく日',
    value: '8のつく日',
    description: '毎月8日・18日・28日',
  },
  {
    label: '1のつく日',
    value: '1のつく日',
    description: '毎月1日・11日・21日・31日',
  },
  {
    label: '月日ゾロ目・11日・22日',
    value: '月日ゾロ目・11日・22日',
    description: '毎月11日・22日＋月日一致（1/1, 2/2, 3/3, 7/7等）',
  },
  {
    label: '土日特日（毎週土曜・日曜）',
    value: '毎週土曜・日曜日',
    description: '毎週末還元型ホール（毎週土曜日・日曜日）',
  },
];

export interface SpecialDayRuleDefinition {
  targetDaysLabel: string;
  modeName: string;
  hasZoro: boolean;
  dayLabels: Array<{ label: string; day: number }>;
  targetDays: number[];
}

/**
 * Parses a natural language text or shorthand into a SpecialDayRules object.
 */
export function parseSpecialDayRulesFromText(text: string): SpecialDayRules {
  if (!text) {
    return {
      tails: [7],
      customDescription: '7のつく日',
    };
  }

  const clean = text.trim();
  const rules: SpecialDayRules = {
    customDescription: clean,
  };

  // 1. Tails (e.g. 7のつく日, 5のつく日, 0のつく日)
  const tailMatches = clean.match(/([0-9])のつく日/g);
  if (tailMatches) {
    const tails: number[] = [];
    tailMatches.forEach((m) => {
      const numMatch = m.match(/\d/);
      if (numMatch) {
        const digit = parseInt(numMatch[0], 10);
        if (!tails.includes(digit)) {
          tails.push(digit);
        }
      }
    });
    if (tails.length > 0) {
      rules.tails = tails;
    }
  }

  // Check single digit tails without "のつく日" if explicitly matching standard terms
  if (!rules.tails) {
    const tailGeneric = clean.match(/末尾\s*([0-9])/);
    if (tailGeneric) {
      rules.tails = [parseInt(tailGeneric[1], 10)];
    }
  }

  // 2. Zoro / Double digits (11日, 22日, ゾロ目)
  if (clean.includes('ゾロ目') || clean.includes('11日') || clean.includes('22日')) {
    rules.doubleDigits = true;
    rules.monthDayZoro = true;
  }

  // 3. Fixed dates (e.g. 毎月1日, 15日)
  const fixedMatches = clean.match(/(\d{1,2})日/g);
  if (fixedMatches && !clean.includes('のつく日')) {
    const dates: number[] = [];
    fixedMatches.forEach((m) => {
      const d = parseInt(m.replace('日', ''), 10);
      if (d >= 1 && d <= 31 && !dates.includes(d)) {
        dates.push(d);
      }
    });
    if (dates.length > 0) {
      rules.fixedDates = dates;
    }
  }

  // 4. Days of week (e.g. 土曜, 日曜, 金曜)
  const dowList: string[] = [];
  const days = ['月', '火', '水', '木', '金', '土', '日'];
  days.forEach((day) => {
    if (clean.includes(`${day}曜`)) {
      dowList.push(day);
    }
  });
  if (dowList.length > 0) {
    rules.daysOfWeek = dowList;
  }

  // Fallback if nothing was matched
  if (
    !rules.tails &&
    !rules.fixedDates &&
    !rules.doubleDigits &&
    !rules.monthDayZoro &&
    !rules.daysOfWeek
  ) {
    const digitMatch = clean.match(/\d/);
    if (digitMatch) {
      rules.tails = [parseInt(digitMatch[0], 10)];
    } else {
      rules.tails = [7];
    }
  }

  return rules;
}

/**
 * Derives UI labels and target day definitions from a SpecialDayRules object.
 */
export function getSpecialDayRuleDefinition(
  rules?: SpecialDayRules,
  originalText?: string
): SpecialDayRuleDefinition {
  if (!rules) {
    return {
      targetDaysLabel: '7のつく日 (7日・17日・27日)',
      modeName: '末尾7',
      hasZoro: false,
      dayLabels: [
        { label: '7日', day: 7 },
        { label: '17日', day: 17 },
        { label: '27日', day: 27 },
      ],
      targetDays: [7, 17, 27],
    };
  }

  if (rules.tails && rules.tails.length > 0) {
    const t = rules.tails[0];
    const days = [t === 0 ? 10 : t, t === 0 ? 20 : 10 + t, t === 0 ? 30 : 20 + t];
    return {
      targetDaysLabel: `${t}のつく日 (${days.map((d) => `${d}日`).join('・')})`,
      modeName: `末尾${t}`,
      hasZoro: false,
      dayLabels: days.map((d) => ({ label: `${d}日`, day: d })),
      targetDays: days,
    };
  }

  if (rules.doubleDigits || rules.monthDayZoro) {
    return {
      targetDaysLabel: '11日・22日・月日ゾロ目',
      modeName: 'ゾロ目特日',
      hasZoro: true,
      dayLabels: [
        { label: '11日', day: 11 },
        { label: '22日', day: 22 },
        { label: '月日ゾロ目', day: -1 },
      ],
      targetDays: [11, 22],
    };
  }

  if (rules.fixedDates && rules.fixedDates.length > 0) {
    return {
      targetDaysLabel: `毎月${rules.fixedDates.join('日・')}日`,
      modeName: '特定日',
      hasZoro: false,
      dayLabels: rules.fixedDates.map((d) => ({ label: `${d}日`, day: d })),
      targetDays: rules.fixedDates,
    };
  }

  if (rules.daysOfWeek && rules.daysOfWeek.length > 0) {
    return {
      targetDaysLabel: `毎週${rules.daysOfWeek.join('・')}曜`,
      modeName: '曜日特日',
      hasZoro: false,
      dayLabels: rules.daysOfWeek.map((d) => ({ label: `${d}曜日`, day: 0 })),
      targetDays: [],
    };
  }

  return {
    targetDaysLabel: originalText || '特日',
    modeName: 'カスタム特日',
    hasZoro: false,
    dayLabels: [
      { label: '特日1', day: 7 },
      { label: '特日2', day: 17 },
      { label: '特日3', day: 27 },
    ],
    targetDays: [7, 17, 27],
  };
}
