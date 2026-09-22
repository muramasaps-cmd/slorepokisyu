export interface SpecialDayRules {
  tails?: number[]; // e.g. [7] for 7,17,27; [0] for 10,20,30; [6] for 6,16,26
  monthDayZoro?: boolean; // 1/1, 2/2, 3/3, etc.
  doubleDigits?: boolean; // 11日, 22日
  fixedDates?: number[]; // e.g. [1, 15]
  daysOfWeek?: string[]; // e.g. ['土', '日']
  customDescription?: string;
}

export interface StoreInfo {
  id?: string;
  name: string;
  address: string;
  oldEventDays: string;
  exchangeRate: string;
  rateLend: number;
  rateExchange: number;
  cashRatio?: number;
  grandOpen?: string;
  totalMachinesApprox: number;
  dataRange: string;
  specialDayRules?: SpecialDayRules;
  isPreset?: boolean;
}

export interface StoreProfile extends StoreInfo {
  id: string;
  dailyRecords: DailyRecord[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  yearMonth: string; // YYYY-MM
  year: number;
  month: number;
  day: number;
  dayOfWeek: string;
  avgDiffCoins: number; // + is player win, - is player loss
  avgGames: number;
  winRate: number | null;
  winMachines: number | null;
  totalMachines: number;
  isReusedMachines?: boolean; // true if machine count was blank in raw data and reused from other days
  totalDiffCoins: number;
  hallCoinProfit: number;
  playerCoinProfit: number;

  // Model A: 差枚数換算モデル (Simple Diff Model)
  hallYenProfit: number;
  playerYenProfit: number;

  // Model B: G数（IN枚数）連動モデル (G-Count / Turnover Model)
  inCoins: number; // avgGames * 3 * totalMachines
  outCoins: number; // inCoins + totalDiffCoins
  payoutRate: number; // (outCoins / inCoins) * 100 (出玉率 / 機械割)
  estimatedRevenue: number; // 現金投資売上
  exchangeGapProfit: number; // 換金ギャップ利益
  gModelHallProfit: number; // G数連動粗利 (exchangeGapProfit - diffCoins * rateExchange)
  gModelPlayerProfit: number; // 客側収支

  isOldEventDay: boolean;
  is7Day: boolean;
  notable: string;
}

export interface MonthlyStat {
  yearMonth: string;
  year: number;
  month: number;
  label: string;
  daysCount: number;
  avgMachines: number;
  avgDiffCoins: number;
  totalDiffCoins: number;
  hallCoinProfit: number;
  playerCoinProfit: number;

  // Model A: 差枚数換算モデル
  hallYenProfit: number;
  playerYenProfit: number;
  cumHallCoinProfit: number;
  cumHallYenProfit: number;
  cumPlayerCoinProfit: number;
  cumPlayerYenProfit: number;

  // Model B: G数（IN枚数）連動モデル
  totalInCoins: number;
  totalOutCoins: number;
  avgPayoutRate: number; // 機械割 (出玉率%)
  estimatedRevenue: number; // 推定総売上高
  exchangeGapProfit: number; // 換金ギャップ利益
  gModelHallProfit: number; // G数連動ホール粗利
  gModelPlayerProfit: number; // G数連動客側収支
  cumGModelHallProfit: number; // 累計
  cumGModelPlayerProfit: number; // 累計

  // Model comparison
  modelDiff: number; // gModelHallProfit - hallYenProfit (換金ギャップ寄与差額)

  avgGames: number;
  avgWinRate: number | null;
  hallWinDays: number;
  playerWinDays: number;
  eventDaysCount: number;
  eventAvgDiff: number;
  eventHallYen: number;
  eventGModelHallYen: number;
  normalDaysCount: number;
  normalAvgDiff: number;
  normalHallYen: number;
  normalGModelHallYen: number;
}

export interface SlotDataSet {
  storeInfo: StoreInfo;
  monthlyStats: MonthlyStat[];
  dailyRecords: DailyRecord[];
}
