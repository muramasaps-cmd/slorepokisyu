import React from 'react';
import { MonthlyStat } from '../data/types';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { TrendingUp, TrendingDown, DollarSign, CalendarCheck, Zap, Award, Calculator, Percent } from 'lucide-react';

interface KpiCardsProps {
  monthlyStats: MonthlyStat[];
  perspective: 'hall' | 'player';
  unit: 'yen' | 'coins' | 'avgDiff' | 'payoutRate';
  profitModel?: any;
}

export const KpiCards: React.FC<KpiCardsProps> = ({
  monthlyStats,
  perspective,
  unit,
}) => {
  if (monthlyStats.length === 0) return null;

  // Calculate cumulative sums
  const totalDays = monthlyStats.reduce((acc, m) => acc + m.daysCount, 0);
  const totalHallCoins = monthlyStats.reduce((acc, m) => acc + m.hallCoinProfit, 0);
  const totalPlayerCoins = monthlyStats.reduce((acc, m) => acc + m.playerCoinProfit, 0);

  const totalGModelHallYen = monthlyStats.reduce((acc, m) => acc + m.gModelHallProfit, 0);
  const totalGModelPlayerYen = monthlyStats.reduce((acc, m) => acc + m.gModelPlayerProfit, 0);
  const totalGapProfit = monthlyStats.reduce((acc, m) => acc + m.exchangeGapProfit, 0);
  const totalRevenue = monthlyStats.reduce((acc, m) => acc + m.estimatedRevenue, 0);

  const totalInCoins = monthlyStats.reduce((acc, m) => acc + m.totalInCoins, 0);
  const totalOutCoins = monthlyStats.reduce((acc, m) => acc + m.totalOutCoins, 0);
  const avgPayoutRate = totalInCoins > 0 ? (totalOutCoins / totalInCoins) * 100 : 100;

  const avgGamesWeighted = Math.round(
    monthlyStats.reduce((acc, m) => acc + m.avgGames * m.daysCount, 0) / (totalDays || 1)
  );

  const monthsCount = monthlyStats.length;

  const avgTotalMachines = Math.round(
    monthlyStats.reduce((acc, m) => acc + (m.avgMachines || 587) * m.daysCount, 0) / (totalDays || 1)
  );

  const getEffectiveYen = (m: MonthlyStat) => {
    return perspective === 'hall' ? m.gModelHallProfit : m.gModelPlayerProfit;
  };

  const totalPrimaryYen = perspective === 'hall' ? totalGModelHallYen : totalGModelPlayerYen;

  const totalPrimary =
    unit === 'yen'
      ? totalPrimaryYen
      : unit === 'coins'
      ? perspective === 'hall'
        ? totalHallCoins
        : totalPlayerCoins
      : Math.round(
          (perspective === 'hall' ? totalHallCoins : totalPlayerCoins) / (totalDays || 1) / (avgTotalMachines || 587)
        );

  const avgMonthlyPrimary = Math.round(totalPrimary / (monthsCount || 1));

  // Per-machine calculations
  const perMachineTotal = Math.round(totalPrimary / (avgTotalMachines || 1));
  const perMachineDaily = Math.round(totalPrimary / ((avgTotalMachines || 1) * (totalDays || 1)));
  const perMachineMonthly = Math.round(avgMonthlyPrimary / (avgTotalMachines || 1));

  // Find best and worst months for this perspective based on G-count profit
  const sortedMonths = [...monthlyStats].sort((a, b) => {
    const valA = getEffectiveYen(a);
    const valB = getEffectiveYen(b);
    return valB - valA;
  });

  const bestMonth = sortedMonths[0];
  const worstMonth = sortedMonths[sortedMonths.length - 1];

  const bestPerMachine = bestMonth?.avgMachines > 0 ? Math.round(getEffectiveYen(bestMonth) / bestMonth.avgMachines) : 0;
  const bestPerMachineDaily = (bestMonth?.avgMachines > 0 && bestMonth?.daysCount > 0)
    ? Math.round(getEffectiveYen(bestMonth) / (bestMonth.avgMachines * bestMonth.daysCount))
    : 0;

  const worstPerMachine = worstMonth?.avgMachines > 0 ? Math.round(getEffectiveYen(worstMonth) / worstMonth.avgMachines) : 0;
  const worstPerMachineDaily = (worstMonth?.avgMachines > 0 && worstMonth?.daysCount > 0)
    ? Math.round(getEffectiveYen(worstMonth) / (worstMonth.avgMachines * worstMonth.daysCount))
    : 0;

  const formatVal = (num: number) => {
    if (unit === 'yen') return formatYen(num);
    if (unit === 'coins') return formatCoins(num);
    if (unit === 'payoutRate') return `${num.toFixed(2)}%`;
    const sign = num > 0 ? '+' : '';
    return `${sign}${num}枚/台`;
  };

  const isProfitable = totalPrimary >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 h-full">
      {/* 1. 期間累計収支 */}
      <div
        id="kpi-card-total"
        className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>
            {perspective === 'hall' ? '期間累計 ホール粗利' : '期間累計 スロッター収支'}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {monthsCount}ヶ月 ({totalDays}日)
          </span>
        </div>

        <div className="my-2">
          <div
            className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
              totalPrimary > 0
                ? perspective === 'hall'
                  ? 'text-slate-900'
                  : 'text-emerald-600'
                : totalPrimary < 0
                ? 'text-rose-600'
                : 'text-slate-700'
            }`}
          >
            {formatVal(totalPrimary)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
            {unit === 'yen'
              ? `${formatCoins(perspective === 'hall' ? totalHallCoins : totalPlayerCoins)} (差枚換算)`
              : `${formatYen(totalPrimaryYen)} (金額換算)`}
          </div>
        </div>

        {/* Micro-stats Divider */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[11px] text-slate-400 block">1台あたり累計</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {formatVal(perMachineTotal)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">うち換金ギャップ</span>
            <span className="font-bold font-mono tabular-nums text-amber-700">
              +{formatYen(totalGapProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. 台日粗利 / 日当 */}
      <div
        id="kpi-card-monthly-avg"
        className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>1台・1日平均 ({perspective === 'hall' ? '台日粗利' : '台日収支'})</span>
          <span className="text-[11px] font-mono text-slate-400">
            約{avgTotalMachines}台
          </span>
        </div>

        <div className="my-2">
          <div
            className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
              perMachineDaily > 0
                ? perspective === 'hall'
                  ? 'text-slate-900'
                  : 'text-emerald-600'
                : perMachineDaily < 0
                ? 'text-rose-600'
                : 'text-slate-700'
            }`}
          >
            {formatVal(perMachineDaily)}
            <span className="text-xs font-normal text-slate-400 ml-1">/台・日</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
            月平均: <strong className="text-slate-700">{formatVal(avgMonthlyPrimary)}/月</strong>
          </div>
        </div>

        {/* Micro-stats Divider */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[11px] text-slate-400 block">1台・月平均</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {formatVal(perMachineMonthly)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">平均稼働ゲーム</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {formatNumber(avgGamesWeighted)} G
            </span>
          </div>
        </div>
      </div>

      {/* 3. 総合出玉率 (機械割) */}
      <div
        id="kpi-card-payout"
        className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>総合出玉率 (機械割)</span>
          <span className="text-[11px] font-mono text-slate-400">IN / OUT 連動</span>
        </div>

        <div className="my-2">
          <div
            className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
              avgPayoutRate >= 100
                ? perspective === 'player'
                  ? 'text-emerald-600'
                  : 'text-rose-600'
                : perspective === 'hall'
                ? 'text-slate-900'
                : 'text-rose-600'
            }`}
          >
            {avgPayoutRate.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {avgPayoutRate < 100 ? (
              <span className="text-slate-600 font-medium">ホール回収設定配分 ({avgPayoutRate.toFixed(2)}%)</span>
            ) : (
              <span className="text-emerald-600 font-medium">客勝ち還元配分 (+{(avgPayoutRate - 100).toFixed(2)}%)</span>
            )}
          </div>
        </div>

        {/* Micro-stats Divider */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[11px] text-slate-400 block">総投入 (IN)</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {Math.round(totalInCoins / 10000).toLocaleString()} 万枚
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">総払出 (OUT)</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {Math.round(totalOutCoins / 10000).toLocaleString()} 万枚
            </span>
          </div>
        </div>
      </div>

      {/* 4. 最高月 vs 最低月 */}
      <div
        id="kpi-card-best-worst"
        className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>{perspective === 'hall' ? '最高粗利月 vs 最大還元月' : '最高収支月 vs 最低収支月'}</span>
          <span className="text-[11px] text-slate-400">月間比較</span>
        </div>

        <div className="my-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                最高
              </span>
              <span className="font-bold text-slate-900 text-sm">{bestMonth.label}</span>
            </div>
            <span className="font-black font-mono tabular-nums text-emerald-600 text-sm">
              {formatVal(getEffectiveYen(bestMonth))}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                最低
              </span>
              <span className="font-bold text-slate-900 text-sm">{worstMonth.label}</span>
            </div>
            <span className="font-black font-mono tabular-nums text-rose-600 text-sm">
              {formatVal(getEffectiveYen(worstMonth))}
            </span>
          </div>
        </div>

        {/* Micro-stats Divider */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[11px] text-slate-400 block">最高月 台日平均</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {formatVal(bestPerMachineDaily)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">最低月 台日平均</span>
            <span className="font-bold font-mono tabular-nums text-slate-800">
              {formatVal(worstPerMachineDaily)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
