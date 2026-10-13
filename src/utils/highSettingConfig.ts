/**
 * 高設定挙動判定の閾値設定
 *
 * 【前提条件】
 * パチスロ機における出玉率（機械割）計算は、常に「3枚掛け固定（BET 3枚）」を前提としています。
 * - IN枚数 = games * 3
 * - OUT枚数 = (games * 3) + diffCoins
 * - 出玉率 = OUT枚数 / IN枚数 * 100 (%)
 * 1枚掛け・2枚掛け時の遊技やボーナス中遊技等は考慮せず、完全3枚掛け（BET 3）として統一計算します。
 */
export const HIGH_SETTING_THRESHOLDS = {
  /** 3枚掛け固定前提: 出玉率算出に必要な最小回転数 */
  MIN_GAMES: 2000,
  /** 出玉率閾値 (108.0%以上を高設定挙動の候補とする) */
  MIN_PAYOUT_RATE: 108.0,
  /** 差枚数閾値 (+1500枚以上) */
  MIN_DIFF_COINS: 1500,
  /** 大勝差枚数閾値 (+2500枚以上) */
  LARGE_WIN_DIFF_COINS: 2500,
  /** Aタイプ（ノーマル機）におけるREGボーナス回数の最小閾値 */
  A_TYPE_MIN_RB_COUNT: 8,
  /** AタイプにおけるREG確率分母閾値 (1/280以上、すなわち games / rb <= 280) */
  A_TYPE_MAX_RB_DENOMINATOR: 280,
  /** コイン投入枚数前提（固定値: 3枚） */
  BET_PER_GAME: 3,
} as const;
