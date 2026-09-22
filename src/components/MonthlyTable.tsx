import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { DailyRecord, MonthlyStat } from '../data/types';
import { formatYen, formatYenExact, formatCoins, formatNumber } from '../utils/formatters';
import { analyzeSpecialDayPatterns } from '../utils/specialDayPatterns';
import { isJapaneseHoliday, getJapaneseHoliday } from '../utils/holidayUtils';
import {
  ArrowUpDown,
  Download,
  Search,
  ExternalLink,
  FileSpreadsheet,
  Target,
  Scale,
  ChevronDown,
  ChevronUp,
  Building2,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Info,
  Calendar,
  BarChart2,
  CalendarDays,
} from 'lucide-react';

interface MonthlyTableProps {
  monthlyStats: MonthlyStat[];
  dailyRecords?: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: 'yen' | 'coins' | 'avgDiff' | 'payoutRate';
  profitModel?: any;
  specialDayRules?: any;
  oldEventDays?: string;
  onSelectMonth: (yearMonth: string) => void;
}

interface MonthDailyBreakdownProps {
  monthStat: MonthlyStat;
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  overallDailyAvg: number;
  onSelectMonth: (ym: string) => void;
}

const MonthDailyBreakdown: React.FC<MonthDailyBreakdownProps> = ({
  monthStat: m,
  dailyRecords,
  perspective,
  overallDailyAvg,
  onSelectMonth,
}) => {
  const [showMacroCards, setShowMacroCards] = useState(false);
  const [tableMode, setTableMode] = useState<'standard' | 'full'>('full');
  const [viewMode, setViewMode] = useState<'both' | 'chart' | 'table'>('both');
  const [useCompactYen, setUseCompactYen] = useState(false);
  const isHall = perspective === 'hall';

  const gYen = perspective === 'hall' ? m.gModelHallProfit : m.gModelPlayerProfit;
  const monthDailyAvg = m.daysCount > 0 ? Math.round(gYen / m.daysCount) : 0;
  const diffFromOverall = monthDailyAvg - overallDailyAvg;

  // Process day-by-day records with cumulative tracking
  const { dailyItems, totalMonthYen, maxDayDeviation, firstTurnPositiveDay } = useMemo(() => {
    const records = (dailyRecords || [])
      .filter((r) => r.yearMonth === m.yearMonth)
      .sort((a, b) => a.day - b.day);

    let runningDeviation = 0;
    let runningProfit = 0;
    let maxDev = 1000;

    const items = records.map((r) => {
      const dayProfit = perspective === 'hall' ? (r.gModelHallProfit || 0) : (r.gModelPlayerProfit || 0);
      const dayDeviation = dayProfit - monthDailyAvg;
      runningDeviation += dayDeviation;
      runningProfit += dayProfit;

      if (Math.abs(dayDeviation) > maxDev) {
        maxDev = Math.abs(dayDeviation);
      }

      const holInfo = getJapaneseHoliday(r.date);
      const isAnnualZoro = r.month === r.day; // e.g. 5/5, 7/7, 8/8
      const isZoro = r.day === 11 || r.day === 22 || isAnnualZoro;
      const perMachineProfit = r.totalMachines > 0 ? Math.round(dayProfit / r.totalMachines) : 0;

      return {
        record: r,
        day: r.day,
        date: r.date,
        dayOfWeek: r.dayOfWeek,
        isHoliday: holInfo.isHoliday,
        holidayName: holInfo.holidayName,
        isOldEventDay: Boolean(r.isOldEventDay),
        isAnnualZoro,
        isZoro,
        dayProfit,
        perMachineProfit,
        dayDeviation,
        cumDeviation: runningDeviation,
        cumProfit: runningProfit,
        avgDiffCoins: r.avgDiffCoins,
        avgGames: r.avgGames,
        payoutRate: r.payoutRate,
        isHallWin: r.avgDiffCoins <= 0,
        totalMachines: r.totalMachines,
      };
    });

    // Detect break-even day where cumulative crosses into positive territory from negative
    let breakEvenDay: number | null = null;
    for (let i = 1; i < items.length; i++) {
      if (items[i - 1].cumDeviation < 0 && items[i].cumDeviation >= 0) {
        breakEvenDay = items[i].day;
        break;
      }
    }

    return {
      dailyItems: items,
      totalMonthYen: runningProfit,
      maxDayDeviation: maxDev,
      firstTurnPositiveDay: breakEvenDay,
    };
  }, [dailyRecords, m.yearMonth, monthDailyAvg, perspective]);

  // Macro card calculations
  const eventProfit = perspective === 'hall' ? m.eventGModelHallYen : -m.eventGModelHallYen;
  const eventDailyAvg = m.eventDaysCount > 0 ? Math.round(eventProfit / m.eventDaysCount) : 0;
  const eventDiffFromMonth = eventDailyAvg - monthDailyAvg;
  const eventPerMachineDaily =
    m.avgMachines > 0 && m.eventDaysCount > 0
      ? Math.round(eventProfit / (m.avgMachines * m.eventDaysCount))
      : 0;

  const normalProfit = perspective === 'hall' ? m.normalGModelHallYen : -m.normalGModelHallYen;
  const normalDailyAvg = m.normalDaysCount > 0 ? Math.round(normalProfit / m.normalDaysCount) : 0;
  const normalDiffFromMonth = normalDailyAvg - monthDailyAvg;
  const normalPerMachineDaily =
    m.avgMachines > 0 && m.normalDaysCount > 0
      ? Math.round(normalProfit / (m.avgMachines * m.normalDaysCount))
      : 0;

  const perMachineDaily =
    m.avgMachines > 0 && m.daysCount > 0
      ? Math.round(gYen / (m.avgMachines * m.daysCount))
      : 0;

  // Format money helper
  const displayYen = (val: number, forceExact = false) => {
    if (useCompactYen && !forceExact) {
      const man = Math.round((val / 10000) * 10) / 10;
      return `${man > 0 ? '+' : ''}${man}万円`;
    }
    return forceExact ? formatYenExact(val) : formatYen(val);
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 sm:p-5 space-y-4">
      {/* 1. Panel Header & KPI Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded flex items-center gap-1.5 shadow-xs">
              <CalendarDays className="w-3.5 h-3.5" />
              {m.label} 日別推移・{isHall ? '予定比 回収/放出ペース分析' : '想定比 客勝ち/店回収ペース分析'}
            </span>
            <span className="text-xs text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded">
              営業 {m.daysCount}日間 / {dailyItems.length}日分データ
            </span>
            <span className="text-xs text-slate-500">
              平均台数: {m.avgMachines}台
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isHall ? (
              <>
                当月の1日平均粗利（日割り予定粗利: <strong className="text-slate-800">{formatYenExact(monthDailyAvg)}/日</strong>）を基準として、各営業日が<strong>「予定より回収（+）」</strong>しているか<strong>「予定より放出・還元（-）」</strong>しているかの推移と、月全体での<strong>「予定比 累積ペース（回収先行／放出先行）」</strong>を確認できます。
              </>
            ) : (
              <>
                当月の1日平均客収支（日割り想定客収支: <strong className="text-slate-800">{formatYenExact(monthDailyAvg)}/日</strong>）を基準として、各営業日が<strong>「想定より客勝ち（+）」</strong>しているか<strong>「想定より店回収（-）」</strong>しているかの推移と、月全体での<strong>「想定比 累積ペース（客プラス先行／店回収先行）」</strong>を確認できます。
              </>
            )}
          </p>
        </div>

        {/* Action & Metric Highlights */}
        <div className="flex items-center gap-3 self-start lg:self-center flex-wrap">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'both'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              両方表示
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'chart'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              推移グラフのみ
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              明細表のみ
            </button>
          </div>

          <div className="h-7 w-[1px] bg-slate-200 hidden sm:block" />

          <div className="text-right">
            <div className="text-[11px] text-slate-500">{isHall ? '当月1日予定粗利' : '当月1日想定収支'}</div>
            <div className="text-sm font-black text-indigo-700">{formatYenExact(monthDailyAvg)}<span className="text-[10px] font-normal text-slate-500">/日</span></div>
          </div>
          <div className="h-7 w-[1px] bg-slate-200" />
          <div className="text-right">
            <div className="text-[11px] text-slate-500">{isHall ? '月間ホール粗利計' : '月間客収支計'}</div>
            <div className={`text-sm font-black ${isHall ? 'text-slate-900' : gYen >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>{formatYenExact(gYen)}</div>
          </div>
          <button
            type="button"
            onClick={() => onSelectMonth(m.yearMonth)}
            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            機種別明細を見る
            <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
          </button>
        </div>
      </div>

      {/* 1.5 Guide note about Planned Baseline Pace (改善案④: 基準ペースの明確な注記) */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-3 text-xs text-slate-700 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-bold text-slate-900">
            {isHall ? '【店目線：日割り予定粗利と回収・放出ペースの算出基準】' : '【客目線：日割り想定収支と客勝ち・店回収ペースの算出基準】'}
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            {isHall ? (
              <>
                当月実績の着地平均（<strong className="text-indigo-800">{formatYenExact(monthDailyAvg)}/日</strong>）を月間目標の「日割り予定粗利」の基準としています。各営業日のホール粗利がこの予定を上回る場合は<span className="font-bold text-indigo-700">「予定より回収（+）」</span>、下回る（出玉還元）場合は<span className="font-bold text-rose-600">「予定より放出（-）」</span>と判定し、その累積が月末に目標値（±0円）へどう向かうかの回収・放出の波を可視化しています。
              </>
            ) : (
              <>
                当月実績の着地平均（<strong className="text-blue-800">{formatYenExact(monthDailyAvg)}/日</strong>）をユーザー側の「日割り想定収支」の基準としています。各営業日の客収支が想定を上回る場合は<span className="font-bold text-emerald-700">「想定より客勝ち（+）」</span>、下回る（店回収）場合は<span className="font-bold text-rose-600">「想定より店回収（-）」</span>と判定し、月間での客有利・店回収のペース推移を可視化しています。
              </>
            )}
          </p>
        </div>
      </div>

      {/* 2. Visual Cumulative Deviation Pace Chart */}
      {(viewMode === 'both' || viewMode === 'chart') && dailyItems.length > 0 && (
        <div className="bg-slate-50/70 rounded-xl border border-slate-200/80 p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <BarChart2 className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-slate-800">
                {isHall
                  ? '【店目線】1日予定比 乖離推移 & 累積回収・放出ペースグラフ'
                  : '【客目線】1日想定比 乖離推移 & 累積客勝ち・店回収ペースグラフ'}
              </span>
              <span className="text-[11px] text-slate-500">
                {isHall
                  ? '(棒: 予定比の単日回収[+]・放出[-] / 折れ線: 予定比 累積ペース)'
                  : '(棒: 想定比の単日客勝ち[+]・店回収[-] / 折れ線: 想定比 累積ペース)'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] mt-1 sm:mt-0 font-medium flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-indigo-600 rounded-xs" />
                {isHall ? '単日: 予定より回収 (+)' : '単日: 想定より客勝ち (+)'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-rose-500 rounded-xs" />
                {isHall ? '単日: 予定より放出 (-)' : '単日: 想定より店回収 (-)'}
              </span>
              <span className="inline-flex items-center gap-1 text-sky-700 font-bold">
                <span className="w-4 h-0.5 bg-sky-500 rounded-full" />
                {isHall ? '予定比 累積ペース (0円収束)' : '想定比 累積ペース (0円収束)'}
              </span>
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyItems} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d) => `${d}日`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  yAxisId="yen"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 10000)}万`}
                />
                <ReferenceLine
                  y={0}
                  yAxisId="yen"
                  stroke="#475569"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  label={{
                    value: isHall ? '1日予定基準 (0円)' : '1日想定基準 (0円)',
                    position: 'insideTopLeft',
                    fill: '#64748b',
                    fontSize: 10,
                  }}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const isPositive = data.dayDeviation >= 0;
                      const isCumPositive = data.cumDeviation >= 0;

                      return (
                        <div className="bg-slate-900/95 text-white p-3 rounded-lg shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[240px]">
                          <div className="font-bold flex items-center justify-between border-b border-slate-700 pb-1">
                            <span>{data.date} ({data.dayOfWeek})</span>
                            <div className="flex gap-1">
                              {data.isAnnualZoro && <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-1 rounded">年1ゾロ目</span>}
                              {data.isHoliday && <span className="text-[10px] bg-rose-600 px-1 rounded">{data.holidayName}</span>}
                              {data.isOldEventDay && <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-1 rounded">特日</span>}
                              {data.isZoro && !data.isAnnualZoro && <span className="text-[10px] bg-purple-500 text-white font-bold px-1 rounded">ゾロ目</span>}
                            </div>
                          </div>
                          <div className="space-y-1 text-[11px] pt-0.5">
                            <div className="flex justify-between">
                              <span className="text-slate-400">{isHall ? '当日粗利(実績):' : '当日客収支(実績):'}</span>
                              <span className="font-bold text-white">{formatYen(data.dayProfit)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">{isHall ? '1日予定粗利 (当月平均):' : '1日想定客収支 (当月平均):'}</span>
                              <span className="text-slate-300">{formatYen(monthDailyAvg)}</span>
                            </div>
                            <div className="flex justify-between font-bold pt-0.5 border-t border-slate-800">
                              <span className="text-slate-300">{isHall ? '予定比 単日乖離:' : '想定比 単日乖離:'}</span>
                              <span className={isPositive ? (isHall ? 'text-indigo-300' : 'text-blue-300') : 'text-rose-400'}>
                                {isHall
                                  ? isPositive
                                    ? `予定より回収 +${formatYen(data.dayDeviation)}`
                                    : `予定より放出 ${formatYen(data.dayDeviation)}`
                                  : isPositive
                                    ? `想定より客勝ち +${formatYen(data.dayDeviation)}`
                                    : `想定より店回収 ${formatYen(data.dayDeviation)}`}
                              </span>
                            </div>
                            <div className="flex justify-between pt-0.5 border-t border-slate-800 font-extrabold text-xs">
                              <span className="text-sky-300">{isHall ? '予定比 累積ペース:' : '想定比 累積ペース:'}</span>
                              <span className={isCumPositive ? 'text-sky-300' : 'text-rose-300'}>
                                {isCumPositive ? `+${formatYen(data.cumDeviation)}` : formatYen(data.cumDeviation)}
                              </span>
                            </div>
                            <div className="text-[10px] py-1 px-1.5 rounded bg-slate-800/90 text-center font-bold">
                              {isHall
                                ? isCumPositive
                                  ? '【店目線】予定より回収先行中（月次粗利目標に対して前倒し回収）'
                                  : '【店目線】予定より放出先行中（出玉還元中・目標ペースより放出寄り）'
                                : isCumPositive
                                  ? '【客目線】想定より客勝ち先行中（客側有利ペース）'
                                  : '【客目線】想定より店回収先行中（店側回収ペース）'}
                            </div>
                            <div className="flex justify-between text-slate-400 text-[10px]">
                              <span>{isHall ? '月初からの累計粗利:' : '月初からの累計客収支:'}</span>
                              <span className="text-amber-300 font-semibold">{formatYen(data.cumProfit)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>客平均差枚:</span>
                              <span className={data.avgDiffCoins > 0 ? 'text-blue-400 font-bold' : 'text-slate-200'}>
                                {data.avgDiffCoins > 0 ? `+${data.avgDiffCoins}` : data.avgDiffCoins} 枚
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="dayDeviation" yAxisId="yen" name={isHall ? '予定比 単日乖離' : '想定比 単日乖離'} opacity={0.7} radius={[3, 3, 0, 0]}>
                  {dailyItems.map((entry, idx) => (
                    <Cell
                      key={`daily-bar-${idx}`}
                      fill={entry.dayDeviation >= 0 ? '#6366f1' : '#f43f5e'}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="cumDeviation"
                  yAxisId="yen"
                  name={isHall ? '予定比 累積ペース' : '想定比 累積ペース'}
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: '#0284c7' }}
                  activeDot={{ r: 4.5, stroke: '#ffffff', strokeWidth: 1.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200/70">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                <strong>月末着地点について:</strong> 1日あたりの{isHall ? '予定粗利' : '想定客収支'}との各日乖離を月末まで積み上げると理論上ぴったり<strong>0円</strong>に着地・収束します（月全体として予定通りの水準に着地）。
              </span>
            </span>
            {firstTurnPositiveDay && (
              <span className="text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 hidden md:inline">
                {isHall ? '【店目線】予定比 回収先行転換日' : '【客目線】想定比 客勝ち先行転換日'}: {firstTurnPositiveDay}日
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Table Controls & Day-by-Day Table with Daily Deviation and Cumulative Stacking */}
      {(viewMode === 'both' || viewMode === 'table') && (
        <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              営業日別 詳細推移表
            </span>
            <span className="text-[11px] text-slate-500">
              (全{dailyItems.length}日分)
            </span>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Standard / Full Column Toggle */}
            <div className="bg-slate-100 p-0.5 rounded-lg flex items-center text-[11px] font-medium border border-slate-200">
              <button
                type="button"
                onClick={() => setTableMode('standard')}
                className={`px-2 py-0.8 rounded-md transition-all cursor-pointer ${
                  tableMode === 'standard'
                    ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                標準表示 (要約)
              </button>
              <button
                type="button"
                onClick={() => setTableMode('full')}
                className={`px-2 py-0.8 rounded-md transition-all cursor-pointer ${
                  tableMode === 'full'
                    ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全項目表示 (詳細)
              </button>
            </div>

            {/* Compact Yen Toggle */}
            <button
              type="button"
              onClick={() => setUseCompactYen(!useCompactYen)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                useCompactYen
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {useCompactYen ? '金額: 万円表記中' : '金額: 円詳細表記中'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-2xs">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 text-[11px] font-bold">
                <th className="py-2.5 px-3 whitespace-nowrap">日付</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">属性</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  {isHall ? '当日粗利(G連動)' : '当日客収支'}
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap bg-indigo-50/50 min-w-[170px]">
                  <div className="flex flex-col items-end">
                    <span>{isHall ? '1日予定比 乖離' : '1日想定比 乖離'}</span>
                    <span className="text-[10px] font-medium text-indigo-700">
                      {isHall ? '(予定より回収 / 放出)' : '(想定より客勝ち / 店回収)'}
                    </span>
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap bg-sky-50/60 min-w-[180px]">
                  <div className="flex flex-col items-end">
                    <span>{isHall ? '予定比 累積ペース' : '想定比 累積ペース'}</span>
                    <span className="text-[10px] font-medium text-sky-700">
                      {isHall ? '(回収先行 / 放出先行)' : '(客プラス先行 / 店回収先行)'}
                    </span>
                  </div>
                </th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">営業結果</th>
                {tableMode === 'full' && (
                  <>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">
                      {isHall ? '月初累計粗利' : '月初累計客収支'}
                    </th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">台平均差枚</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">台平均G数</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">出玉率</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {dailyItems.map((item) => {
                const isSun = item.dayOfWeek === '日';
                const isSat = item.dayOfWeek === '土';
                const isHol = item.isHoliday;
                const isDevPositive = item.dayDeviation >= 0;
                const isCumPositive = item.cumDeviation >= 0;
                const isBreakEven = item.day === firstTurnPositiveDay;

                // Heatmap bar width percentage (relative to month's max deviation)
                const devRatio = Math.min(100, Math.round((Math.abs(item.dayDeviation) / maxDayDeviation) * 100));

                return (
                  <tr
                    key={item.date}
                    className={`hover:bg-slate-50 transition-colors ${
                      isBreakEven
                        ? 'bg-amber-50/40'
                        : item.isOldEventDay
                        ? 'bg-amber-50/30'
                        : isHol
                        ? 'bg-rose-50/20'
                        : isSun
                        ? 'bg-rose-50/15'
                        : isSat
                        ? 'bg-blue-50/15'
                        : ''
                    }`}
                  >
                    {/* Date & Dow */}
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{item.date}</span>
                        <span
                          className={`text-[11px] font-bold ${
                            isHol || isSun
                              ? 'text-rose-600'
                              : isSat
                              ? 'text-blue-600'
                              : 'text-slate-500'
                          }`}
                        >
                          ({item.dayOfWeek})
                        </span>
                      </div>
                    </td>

                    {/* Badges / Attribute */}
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {item.isAnnualZoro && (
                          <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded shadow-2xs flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            年1ゾロ目
                          </span>
                        )}
                        {item.isOldEventDay && (
                          <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded shadow-2xs">
                            看板特日
                          </span>
                        )}
                        {item.isHoliday && (
                          <span className="bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[10px] px-1.5 py-0.2 rounded">
                            {item.holidayName || '祝日'}
                          </span>
                        )}
                        {item.isZoro && !item.isAnnualZoro && (
                          <span className="bg-purple-100 text-purple-800 border border-purple-200 font-bold text-[10px] px-1.5 py-0.2 rounded">
                            ゾロ目
                          </span>
                        )}
                        {!item.isOldEventDay && !item.isHoliday && !item.isZoro && (
                          <span className="text-slate-400 text-[10px]">通常</span>
                        )}
                      </div>
                    </td>

                    {/* Day Hall Profit */}
                    <td
                      className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                        item.dayProfit >= 0 ? 'text-slate-900' : 'text-rose-600'
                      }`}
                    >
                      <div title={formatYenExact(item.dayProfit)}>{displayYen(item.dayProfit)}</div>
                      <div className="text-[10px] text-slate-400 font-normal" title={`${formatYenExact(item.perMachineProfit)}/台`}>
                        {formatYen(item.perMachineProfit)}/台
                      </div>
                    </td>

                    {/* 単日乖離 (1日予定比 & ヒートマップバー) */}
                    <td className="py-2 px-3 text-right whitespace-nowrap bg-indigo-50/20">
                      <div className="space-y-1">
                        <div className="flex items-center justify-end gap-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                              isDevPositive
                                ? isHall
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border-rose-200'
                            }`}
                          >
                            {isHall
                              ? isDevPositive
                                ? '予定より回収'
                                : '予定より放出'
                              : isDevPositive
                                ? '想定より客勝ち'
                                : '想定より店回収'}
                          </span>
                          <span
                            className={`font-black text-xs ${
                              isDevPositive
                                ? isHall ? 'text-indigo-700' : 'text-emerald-700'
                                : 'text-rose-600'
                            }`}
                            title={formatYenExact(item.dayDeviation)}
                          >
                            {isDevPositive ? '+' : ''}{displayYen(item.dayDeviation)}
                          </span>
                        </div>

                        {/* Mini Heatmap Bar */}
                        <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden flex">
                          {isDevPositive ? (
                            <div
                              className={`${isHall ? 'bg-indigo-500' : 'bg-emerald-500'} h-full rounded-full ml-auto transition-all`}
                              style={{ width: `${Math.max(devRatio, 4)}%` }}
                              title={isHall ? `予定より回収強度: ${devRatio}%` : `想定より客勝ち強度: ${devRatio}%`}
                            />
                          ) : (
                            <div
                              className="bg-rose-500 h-full rounded-full ml-auto transition-all"
                              style={{ width: `${Math.max(devRatio, 4)}%` }}
                              title={isHall ? `予定より放出強度: ${devRatio}%` : `想定より店回収強度: ${devRatio}%`}
                            />
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 積み上げ累積乖離 (日進累計 & 水準ゾーン) */}
                    <td className="py-2 px-3 text-right whitespace-nowrap bg-sky-50/30">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          {isBreakEven && (
                            <span className="bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow-2xs animate-pulse">
                              {isHall ? '★回収先行に転換' : '★客勝ちに転換'}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                              isCumPositive
                                ? isHall
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : isHall
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-rose-100 text-rose-800 border-rose-200'
                            }`}
                          >
                            {isHall
                              ? isCumPositive
                                ? '予定より回収先行'
                                : '予定より放出先行'
                              : isCumPositive
                                ? '客勝ち先行'
                                : '店回収先行'}
                          </span>
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded-md border shadow-2xs ${
                              isCumPositive
                                ? isHall
                                  ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                : 'bg-rose-50 text-rose-900 border-rose-200'
                            }`}
                            title={formatYenExact(item.cumDeviation)}
                          >
                            {isCumPositive ? '累積 +' : '累積 '}
                            {displayYen(item.cumDeviation)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 営業結果 (重要判定のため標準列の右端に配置) */}
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.isHallWin
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-rose-100 text-rose-700 font-black'
                        }`}
                      >
                        {isHall
                          ? item.isHallWin
                            ? '店舗黒字'
                            : '出玉還元'
                          : item.isHallWin
                            ? '店側黒字'
                            : '客側勝ち'}
                      </span>
                    </td>

                    {/* Full columns */}
                    {tableMode === 'full' && (
                      <>
                        {/* 月初累計 (粗利 / 客収支) */}
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                          {displayYen(item.cumProfit, true)}
                        </td>

                        {/* 台平均差枚 */}
                        <td
                          className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${
                            item.avgDiffCoins > 0 ? 'text-blue-600 font-bold' : 'text-slate-700'
                          }`}
                        >
                          {item.avgDiffCoins > 0 ? `+${item.avgDiffCoins}` : item.avgDiffCoins} 枚
                        </td>

                        {/* 台平均G数 */}
                        <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">
                          {formatNumber(item.avgGames)} G
                        </td>

                        {/* 出玉率 */}
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                          {item.payoutRate.toFixed(2)}%
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 4. Collapsible Macro Factors (特日・通常日・全期間基準) (改善案①&⑤: 目線連動 & コンパクト要約バー) */}
      <div className="pt-2 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-slate-700">
            <span className="font-semibold flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-indigo-600" />
              全期間基準乖離:
              <strong
                className={
                  diffFromOverall >= 0
                    ? isHall ? 'text-indigo-700' : 'text-emerald-700'
                    : 'text-rose-600'
                }
              >
                {diffFromOverall >= 0 ? '+' : ''}{formatYenExact(diffFromOverall)}/日
              </strong>
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-rose-600" />
              特日平均:
              <strong className="text-slate-900">{formatYenExact(eventDailyAvg)}/日</strong>
              <span className="text-[11px] text-slate-500">({m.eventDaysCount}日間)</span>
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-600" />
              通常日平均:
              <strong className="text-slate-900">{formatYenExact(normalDailyAvg)}/日</strong>
              <span className="text-[11px] text-slate-500">({m.normalDaysCount}日間)</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMacroCards(!showMacroCards)}
            className="text-xs text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
          >
            {showMacroCards ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showMacroCards ? 'マクロ要因カードを閉じる' : 'マクロ要因カードを展開'}
          </button>
        </div>

        {showMacroCards && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            {/* Card 1: 1日平均粗利 / 客収支 乖離分析 */}
            <div className="p-3.5 rounded-lg border border-indigo-200/80 bg-gradient-to-b from-indigo-50/40 to-white">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-900 mb-2">
                <span className="flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-indigo-600" />
                  {isHall ? '1日平均粗利 vs 全期間基準' : '1日平均客収支 vs 全期間基準'}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                    diffFromOverall >= 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {isHall
                    ? (diffFromOverall >= 0 ? '全体比上振れ' : '全体比還元')
                    : (diffFromOverall >= 0 ? '全体比 客勝ち先行' : '全体比 店回収先行')}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">{isHall ? '当月1日平均ホール粗利:' : '当月1日平均客収支:'}</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {formatYenExact(monthDailyAvg)} /日
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">{isHall ? '全期間全体1日平均基準:' : '全期間客収支1日平均基準:'}</span>
                  <span className="font-semibold text-slate-700">
                    {formatYenExact(overallDailyAvg)} /日
                  </span>
                </div>
                <div className="pt-1.5 border-t border-indigo-100 flex justify-between items-baseline">
                  <span className="font-bold text-slate-800">全体基準との乖離額:</span>
                  <span
                    className={`font-black text-sm ${
                      diffFromOverall >= 0
                        ? isHall ? 'text-indigo-700' : 'text-emerald-700'
                        : 'text-rose-600'
                    }`}
                  >
                    {diffFromOverall >= 0 ? '+' : ''}
                    {formatYenExact(diffFromOverall)} /日
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{isHall ? '1台あたり台日粗利:' : '1台あたり台日収支:'}</span>
                  <span className={`font-bold ${isHall ? 'text-indigo-700' : 'text-blue-700'}`}>
                    {formatYen(perMachineDaily)} /台・日
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: 特日（特定日）内訳 */}
            <div className="p-3.5 rounded-lg border border-rose-200/80 bg-gradient-to-b from-rose-50/40 to-white">
              <div className="flex items-center justify-between text-xs font-bold text-rose-900 mb-2">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-rose-600" />
                  特日（特定日）内訳
                </span>
                <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                  計 {m.eventDaysCount}日間 ({((m.eventDaysCount / m.daysCount) * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">{isHall ? '特日ホール粗利合計:' : '特日客収支合計:'}</span>
                  <span className={`font-bold ${isHall ? 'text-slate-900' : eventProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {formatYenExact(eventProfit)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">{isHall ? '特日 1日平均粗利:' : '特日 1日平均客収支:'}</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {formatYenExact(eventDailyAvg)} /日
                  </span>
                </div>
                <div className="pt-1.5 border-t border-rose-100 flex justify-between items-baseline">
                  <span className="font-bold text-slate-800">当月1日平均との乖離:</span>
                  <span
                    className={`font-black text-sm ${
                      eventDiffFromMonth >= 0
                        ? isHall ? 'text-indigo-700' : 'text-emerald-700'
                        : 'text-rose-600'
                    }`}
                  >
                    {eventDiffFromMonth >= 0 ? '+' : ''}
                    {formatYenExact(eventDiffFromMonth)} /日
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{isHall ? '客側平均差枚:' : '特日客側平均差枚:'}</span>
                  <span
                    className={`font-bold ${
                      m.eventAvgDiff > 0 ? 'text-blue-600' : 'text-slate-700'
                    }`}
                  >
                    {m.eventAvgDiff > 0 ? `+${m.eventAvgDiff}` : m.eventAvgDiff} 枚/台
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: 通常営業日 内訳 */}
            <div className="p-3.5 rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50/40 to-white">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-600" />
                  通常営業日 内訳
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                  計 {m.normalDaysCount}日間 ({((m.normalDaysCount / m.daysCount) * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">{isHall ? '通常日ホール粗利合計:' : '通常日客収支合計:'}</span>
                  <span className={`font-bold ${isHall ? 'text-slate-900' : normalProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {formatYenExact(normalProfit)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">{isHall ? '通常日 1日平均粗利:' : '通常日 1日平均客収支:'}</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {formatYenExact(normalDailyAvg)} /日
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-200 flex justify-between items-baseline">
                  <span className="font-bold text-slate-800">当月1日平均との乖離:</span>
                  <span
                    className={`font-black text-sm ${
                      normalDiffFromMonth >= 0
                        ? isHall ? 'text-indigo-700' : 'text-emerald-700'
                        : 'text-rose-600'
                    }`}
                  >
                    {normalDiffFromMonth >= 0 ? '+' : ''}
                    {formatYenExact(normalDiffFromMonth)} /日
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{isHall ? '通常日 1台あたり日当:' : '通常日 1台あたり客収支:'}</span>
                  <span className={`font-bold ${isHall ? 'text-slate-800' : 'text-blue-700'}`}>
                    {formatYen(normalPerMachineDaily)} /台・日
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type SortField =
  | 'yearMonth'
  | 'daysCount'
  | 'hallYenProfit'
  | 'gModelHallProfit'
  | 'dailyAvgProfit'
  | 'diffFromOverall'
  | 'perMachineDailyProfit'
  | 'avgDiffCoins'
  | 'avgPayoutRate'
  | 'avgGames'
  | 'avgWinRate';

export const MonthlyTable: React.FC<MonthlyTableProps> = ({
  monthlyStats,
  dailyRecords = [],
  perspective,
  specialDayRules,
  oldEventDays,
  onSelectMonth,
}) => {
  const [sortField, setSortField] = useState<SortField>('yearMonth');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const { specialDayMap, specialDayRuleLabel } = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) {
      return { specialDayMap: new Map(), specialDayRuleLabel: '特日' };
    }
    const { monthPatterns, ruleDef } = analyzeSpecialDayPatterns(dailyRecords, specialDayRules, oldEventDays);
    const map = new Map();
    monthPatterns.forEach((mp) => {
      map.set(mp.yearMonth, mp);
    });
    return { specialDayMap: map, specialDayRuleLabel: ruleDef.targetDaysLabel || '特日' };
  }, [dailyRecords, specialDayRules, oldEventDays]);

  // Overall Period Baseline Calculations (全期間基準指標)
  const periodBaseline = useMemo(() => {
    const totalDays = monthlyStats.reduce((sum, m) => sum + m.daysCount, 0);
    const totalProfit = monthlyStats.reduce(
      (sum, m) => sum + (perspective === 'hall' ? m.gModelHallProfit : m.gModelPlayerProfit),
      0
    );
    const overallDailyAvg = totalDays > 0 ? Math.round(totalProfit / totalDays) : 0;

    const totalMachinesDays = monthlyStats.reduce((sum, m) => sum + (m.avgMachines * m.daysCount), 0);
    const avgMachines = totalDays > 0 ? Math.round(totalMachinesDays / totalDays) : 587;
    const overallPerMachineDaily = avgMachines > 0 ? Math.round(overallDailyAvg / avgMachines) : 0;

    const totalEventDays = monthlyStats.reduce((sum, m) => sum + m.eventDaysCount, 0);
    const totalEventProfit = monthlyStats.reduce(
      (sum, m) => sum + (perspective === 'hall' ? m.eventGModelHallYen : -m.eventGModelHallYen),
      0
    );
    const overallEventDailyAvg = totalEventDays > 0 ? Math.round(totalEventProfit / totalEventDays) : 0;

    const totalNormalDays = monthlyStats.reduce((sum, m) => sum + m.normalDaysCount, 0);
    const totalNormalProfit = monthlyStats.reduce(
      (sum, m) => sum + (perspective === 'hall' ? m.normalGModelHallYen : -m.normalGModelHallYen),
      0
    );
    const overallNormalDailyAvg = totalNormalDays > 0 ? Math.round(totalNormalProfit / totalNormalDays) : 0;

    return {
      totalDays,
      totalProfit,
      overallDailyAvg,
      avgMachines,
      overallPerMachineDaily,
      totalEventDays,
      totalEventProfit,
      overallEventDailyAvg,
      totalNormalDays,
      totalNormalProfit,
      overallNormalDailyAvg,
    };
  }, [monthlyStats, perspective]);

  const toggleExpand = (yearMonth: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(yearMonth)) {
        next.delete(yearMonth);
      } else {
        next.add(yearMonth);
      }
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = monthlyStats.filter((m) =>
      m.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.yearMonth.includes(searchTerm)
    );

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'dailyAvgProfit') {
        const getDaily = (x: MonthlyStat) => {
          const yen = perspective === 'hall' ? x.gModelHallProfit : x.gModelPlayerProfit;
          return x.daysCount > 0 ? Math.round(yen / x.daysCount) : 0;
        };
        valA = getDaily(a);
        valB = getDaily(b);
      } else if (sortField === 'diffFromOverall') {
        const getDiff = (x: MonthlyStat) => {
          const yen = perspective === 'hall' ? x.gModelHallProfit : x.gModelPlayerProfit;
          const daily = x.daysCount > 0 ? Math.round(yen / x.daysCount) : 0;
          return daily - periodBaseline.overallDailyAvg;
        };
        valA = getDiff(a);
        valB = getDiff(b);
      } else if (sortField === 'perMachineDailyProfit') {
        const getPM = (x: MonthlyStat) => {
          const yen = perspective === 'hall' ? x.gModelHallProfit : x.gModelPlayerProfit;
          return x.avgMachines > 0 && x.daysCount > 0 ? Math.round(yen / (x.avgMachines * x.daysCount)) : 0;
        };
        valA = getPM(a);
        valB = getPM(b);
      }

      if (valA === null || valA === undefined) valA = 0;
      if (valB === null || valB === undefined) valB = 0;

      if (sortOrder === 'asc') {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });

    return result;
  }, [monthlyStats, sortField, sortOrder, searchTerm, perspective, periodBaseline.overallDailyAvg]);

  // Export to CSV with full breakdown & divergence details
  const handleExportCSV = () => {
    const headers = [
      '対象月',
      '営業日数',
      '平均設置台数',
      '月内特日サイクルパターン',
      `特日内訳(${specialDayRuleLabel})`,
      'ホール粗利(G数連動)(円)',
      '1日平均ホール粗利(円/日)',
      '全期間1日平均との乖離(円/日)',
      '全期間1日平均との乖離率(%)',
      '1台1日あたり粗利(台日粗利)(円)',
      '1台あたり月間粗利(円)',
      '特日営業日数',
      '特日総粗利(円)',
      '特日1日平均粗利(円/日)',
      '特日当月日当との乖離(円/日)',
      '通常営業日数',
      '通常日総粗利(円)',
      '通常日1日平均粗利(円/日)',
      '通常日当月日当との乖離(円/日)',
      '換金ギャップ粗利(円)',
      '出玉差枚換算損益(円)',
      '出玉率/機械割(%)',
      '客側総差枚(枚)',
      '1台あたり平均差枚(枚/台)',
      '平均稼働ゲーム数(G)',
      '店黒字日数',
      '店赤字日数',
    ];

    const rows = filteredAndSorted.map((m) => {
      const sp = specialDayMap.get(m.yearMonth);
      const patternName = sp ? sp.classificationName : '';
      const breakdown = sp
        ? sp.events.map((e: any) => `${e.name}: ${e.status}(${e.avgDiffCoins > 0 ? `+${e.avgDiffCoins}` : e.avgDiffCoins}枚)`).join(' / ')
        : '';

      const monthDailyAvg = m.daysCount > 0 ? Math.round(m.gModelHallProfit / m.daysCount) : 0;
      const diffFromOverall = monthDailyAvg - periodBaseline.overallDailyAvg;
      const pctFromOverall = periodBaseline.overallDailyAvg !== 0
        ? Math.round((diffFromOverall / Math.abs(periodBaseline.overallDailyAvg)) * 1000) / 10
        : 0;

      const perMachineDaily = m.avgMachines > 0 && m.daysCount > 0 ? Math.round(m.gModelHallProfit / (m.avgMachines * m.daysCount)) : 0;
      const perMachineMonthly = m.avgMachines > 0 ? Math.round(m.gModelHallProfit / m.avgMachines) : 0;

      const eventDailyAvg = m.eventDaysCount > 0 ? Math.round(m.eventGModelHallYen / m.eventDaysCount) : 0;
      const eventDiffFromMonth = eventDailyAvg - monthDailyAvg;

      const normalDailyAvg = m.normalDaysCount > 0 ? Math.round(m.normalGModelHallYen / m.normalDaysCount) : 0;
      const normalDiffFromMonth = normalDailyAvg - monthDailyAvg;

      return [
        m.label,
        m.daysCount,
        m.avgMachines,
        patternName,
        `"${breakdown}"`,
        m.gModelHallProfit,
        monthDailyAvg,
        diffFromOverall,
        pctFromOverall,
        perMachineDaily,
        perMachineMonthly,
        m.eventDaysCount,
        m.eventGModelHallYen,
        eventDailyAvg,
        eventDiffFromMonth,
        m.normalDaysCount,
        m.normalGModelHallYen,
        normalDailyAvg,
        normalDiffFromMonth,
        m.exchangeGapProfit,
        m.hallYenProfit,
        m.avgPayoutRate.toFixed(2),
        m.playerCoinProfit,
        m.avgDiffCoins,
        m.avgGames,
        m.hallWinDays,
        m.playerWinDays,
      ];
    });

    const csvContent =
      '\uFEFF' + // UTF-8 BOM for Excel in Japanese
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `月別利益・内訳・日当乖離集計_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Table Controls Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            月別利益・差枚集計一覧表
            <span className="text-xs font-normal text-slate-500">
              ({filteredAndSorted.length}ヶ月分)
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {perspective === 'hall'
              ? '各月の「1日平均ホール粗利」と「全期間基準との乖離」、特日・通常日内訳を表示。「内訳」ボタンで行内詳細を展開できます'
              : '各月の「1日平均ユーザー収支」と「全期間基準との乖離」、特日・通常日内訳を表示。「内訳」ボタンで行内詳細を展開できます'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="年月で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-36 sm:w-44"
            />
          </div>

          {/* CSV Export Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            CSV出力
          </button>
        </div>
      </div>

      {/* Overall Daily Profit Baseline Reference Banner */}
      <div className="mx-4 sm:mx-5 my-3 p-3.5 bg-slate-50/90 rounded-lg border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-indigo-600" />
            {perspective === 'hall'
              ? '全期間 1日平均ホール粗利（全体基準）と営業区分別内訳'
              : '全期間 1日平均ユーザー収支（全体基準）と営業区分別内訳'}
          </div>
          <div className="text-slate-500 text-[11px]">
            全{periodBaseline.totalDays}営業日 / 累計{perspective === 'hall' ? '粗利' : '収支'} {formatYen(periodBaseline.totalProfit)}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Baseline Daily Avg */}
          <div className="bg-white p-2.5 rounded-md border border-indigo-100 shadow-2xs">
            <div className="text-[11px] text-slate-500 font-medium">
              {perspective === 'hall'
                ? '全期間 1日平均ホール粗利（全体基準値）'
                : '全期間 1日平均ユーザー収支（全体基準値）'}
            </div>
            <div className={`text-base font-extrabold mt-0.5 ${perspective === 'hall' ? 'text-indigo-700' : periodBaseline.overallDailyAvg >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {perspective !== 'hall' && periodBaseline.overallDailyAvg > 0 ? '+' : ''}
              {formatYen(periodBaseline.overallDailyAvg)}
              <span className="text-xs font-normal text-slate-500 ml-1">/日</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
              {perspective === 'hall' ? '1台あたり日当: ' : '1台あたり収支: '}
              <span className="font-bold text-indigo-900">{formatYen(periodBaseline.overallPerMachineDaily)}/台・日</span>
            </div>
          </div>

          {/* Event Days Daily Avg */}
          <div className="bg-white p-2.5 rounded-md border border-rose-100 shadow-2xs">
            <div className="text-[11px] text-rose-700 font-semibold flex items-center justify-between">
              <span>🎯 特日（特定日）全期間1日平均</span>
              <span className="text-[10px] bg-rose-50 px-1 rounded font-bold">{periodBaseline.totalEventDays}日間</span>
            </div>
            <div className="text-base font-extrabold text-slate-800 mt-0.5">
              {perspective !== 'hall' && periodBaseline.overallEventDailyAvg > 0 ? '+' : ''}
              {formatYen(periodBaseline.overallEventDailyAvg)}
              <span className="text-xs font-normal text-slate-500 ml-1">/日</span>
            </div>
            <div className="text-[10px] text-rose-600 font-medium mt-0.5 flex items-center justify-between">
              <span>{perspective === 'hall' ? '全体基準比（還元度）:' : '全体基準比:'}</span>
              <span className="font-bold">
                {periodBaseline.overallEventDailyAvg - periodBaseline.overallDailyAvg >= 0 ? '+' : ''}
                {formatYen(periodBaseline.overallEventDailyAvg - periodBaseline.overallDailyAvg)}/日
              </span>
            </div>
          </div>

          {/* Normal Days Daily Avg */}
          <div className="bg-white p-2.5 rounded-md border border-slate-200 shadow-2xs">
            <div className="text-[11px] text-slate-700 font-semibold flex items-center justify-between">
              <span>🏢 通常営業日 全期間1日平均</span>
              <span className="text-[10px] bg-slate-100 px-1 rounded font-bold">{periodBaseline.totalNormalDays}日間</span>
            </div>
            <div className="text-base font-extrabold text-slate-800 mt-0.5">
              {perspective !== 'hall' && periodBaseline.overallNormalDailyAvg > 0 ? '+' : ''}
              {formatYen(periodBaseline.overallNormalDailyAvg)}
              <span className="text-xs font-normal text-slate-500 ml-1">/日</span>
            </div>
            <div className="text-[10px] text-indigo-600 font-medium mt-0.5 flex items-center justify-between">
              <span>{perspective === 'hall' ? '全体基準比（回収度）:' : '全体基準比:'}</span>
              <span className="font-bold">
                {periodBaseline.overallNormalDailyAvg - periodBaseline.overallDailyAvg >= 0 ? '+' : ''}
                {formatYen(periodBaseline.overallNormalDailyAvg - periodBaseline.overallDailyAvg)}/日
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs uppercase tracking-wider font-bold">
            <tr>
              <th
                onClick={() => handleSort('yearMonth')}
                className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  対象月
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <div className="flex items-center gap-1 text-amber-700">
                  <Target className="w-3 h-3" />
                  特日サイクル
                </div>
              </th>
              <th
                onClick={() => handleSort('daysCount')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  日数
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              {/* G-Model Total Profit */}
              <th
                onClick={() => handleSort('gModelHallProfit')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap text-indigo-700"
              >
                <div className="flex items-center justify-end gap-1">
                  {perspective === 'hall' ? 'ホール粗利 (月計)' : 'ユーザー収支 (月計)'}
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              {/* 1日平均ホール粗利 & 全体乖離 */}
              <th
                onClick={() => handleSort('dailyAvgProfit')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap text-indigo-700 bg-indigo-50/40"
              >
                <div className="flex items-center justify-end gap-1">
                  {perspective === 'hall' ? '1日平均粗利 & 全体乖離' : '1日平均収支 & 全体乖離'}
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              {/* 特日 / 通常日 内訳 */}
              <th className="py-3 px-3 text-right whitespace-nowrap text-slate-700 bg-slate-100/50">
                <div className="flex items-center justify-end gap-1">
                  <Layers className="w-3 h-3 text-slate-500" />
                  営業内訳 (特日 / 通常日)
                </div>
              </th>

              {/* 1台あたり粗利 (台日粗利 & 月台粗利) */}
              <th
                onClick={() => handleSort('perMachineDailyProfit')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap text-slate-600"
              >
                <div className="flex items-center justify-end gap-1">
                  {perspective === 'hall' ? '1台あたり粗利 (日/台)' : '1台あたり収支 (日/台)'}
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              <th
                onClick={() => handleSort('avgPayoutRate')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  機械割
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              <th
                onClick={() => handleSort('avgDiffCoins')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  客側台平均
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              <th
                onClick={() => handleSort('avgGames')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  平均G数
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>

              <th className="py-3 px-3 text-center whitespace-nowrap">
                {perspective === 'hall' ? '店 勝/敗' : '客 勝/敗'}
              </th>

              <th className="py-3 px-3 text-center whitespace-nowrap">
                内訳 / 明細
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-sans">
            {filteredAndSorted.map((m) => {
              const gYen = perspective === 'hall' ? m.gModelHallProfit : m.gModelPlayerProfit;
              const isExpanded = expandedMonths.has(m.yearMonth);

              const monthDailyAvg = m.daysCount > 0 ? Math.round(gYen / m.daysCount) : 0;
              const diffFromOverall = monthDailyAvg - periodBaseline.overallDailyAvg;
              const pctFromOverall = periodBaseline.overallDailyAvg !== 0
                ? Math.round((diffFromOverall / Math.abs(periodBaseline.overallDailyAvg)) * 1000) / 10
                : 0;

              const perMachineDaily =
                m.avgMachines > 0 && m.daysCount > 0
                  ? Math.round(gYen / (m.avgMachines * m.daysCount))
                  : 0;
              const perMachineMonthly = m.avgMachines > 0 ? Math.round(gYen / m.avgMachines) : 0;

              // Event days & normal days breakdown
              const eventProfit = perspective === 'hall' ? m.eventGModelHallYen : -m.eventGModelHallYen;
              const eventDailyAvg = m.eventDaysCount > 0 ? Math.round(eventProfit / m.eventDaysCount) : 0;
              const eventDiffFromMonth = eventDailyAvg - monthDailyAvg;
              const eventPerMachineDaily =
                m.avgMachines > 0 && m.eventDaysCount > 0
                  ? Math.round(eventProfit / (m.avgMachines * m.eventDaysCount))
                  : 0;

              const normalProfit = perspective === 'hall' ? m.normalGModelHallYen : -m.normalGModelHallYen;
              const normalDailyAvg = m.normalDaysCount > 0 ? Math.round(normalProfit / m.normalDaysCount) : 0;
              const normalDiffFromMonth = normalDailyAvg - monthDailyAvg;
              const normalPerMachineDaily =
                m.avgMachines > 0 && m.normalDaysCount > 0
                  ? Math.round(normalProfit / (m.avgMachines * m.normalDaysCount))
                  : 0;

              return (
                <React.Fragment key={m.yearMonth}>
                  <tr
                    onClick={() => toggleExpand(m.yearMonth)}
                    className={`hover:bg-amber-50/40 cursor-pointer transition-colors group ${
                      isExpanded ? 'bg-indigo-50/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(m.yearMonth, e)}
                          className="p-1 -ml-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                          title={isExpanded ? '内訳を閉じる' : '内訳を展開'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        <span className="group-hover:text-amber-600 transition-colors font-extrabold">
                          {m.label}
                        </span>
                        {m.month === 7 && (
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            7月特日
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {(() => {
                        const sp = specialDayMap.get(m.yearMonth);
                        if (!sp) return <span className="text-slate-300">-</span>;
                        return (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${sp.badgeClass}`}
                            >
                              {sp.classification === 'all_win' && '🔥 '}
                              {sp.classification === 'd11_loss_d22_win' && '🎯 '}
                              {sp.classification === 'all_loss' && '⚠️ '}
                              {sp.classificationName}
                            </span>
                            <div className="flex items-center gap-0.5 text-[10px]">
                              {sp.zoroEvent && (
                                <span
                                  className={`px-1 py-0.2 rounded font-bold ${
                                    sp.zoroEvent.isWin
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                  title={`ゾロ目(${sp.zoroEvent.day}日): ${sp.zoroEvent.avgDiffCoins > 0 ? `+${sp.zoroEvent.avgDiffCoins}` : sp.zoroEvent.avgDiffCoins}枚`}
                                >
                                  ゾ{sp.zoroEvent.isWin ? '出' : '回'}
                                </span>
                              )}
                              {sp.d11Event && (
                                <span
                                  className={`px-1 py-0.2 rounded font-bold ${
                                    sp.d11Event.isWin
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                  title={`11日: ${sp.d11Event.avgDiffCoins > 0 ? `+${sp.d11Event.avgDiffCoins}` : sp.d11Event.avgDiffCoins}枚`}
                                >
                                  11{sp.d11Event.isWin ? '出' : '回'}
                                </span>
                              )}
                              {sp.d22Event && (
                                <span
                                  className={`px-1 py-0.2 rounded font-bold ${
                                    sp.d22Event.isWin
                                      ? 'bg-amber-100 text-amber-900 font-extrabold'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                  title={`22日: ${sp.d22Event.avgDiffCoins > 0 ? `+${sp.d22Event.avgDiffCoins}` : sp.d22Event.avgDiffCoins}枚`}
                                >
                                  22{sp.d22Event.isWin ? '出' : '回'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="py-3 px-3 text-right text-slate-600 whitespace-nowrap">
                      {m.daysCount}日
                    </td>

                    {/* G-Model Monthly Total Yen */}
                    <td
                      className={`py-3 px-3 text-right font-extrabold whitespace-nowrap ${
                        gYen >= 0 ? 'text-indigo-600' : 'text-rose-600'
                      }`}
                    >
                      {formatYenExact(gYen)}
                    </td>

                    {/* 1日平均ホール粗利 & 全体乖離 */}
                    <td className="py-3 px-3 text-right whitespace-nowrap bg-indigo-50/30">
                      <div className="font-extrabold text-slate-900">
                        {formatYen(monthDailyAvg)}
                        <span className="text-[11px] font-normal text-slate-500 ml-0.5">/日</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-bold border inline-flex items-center gap-0.5 ${
                            diffFromOverall >= 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                          title={`全期間基準日当(${formatYen(periodBaseline.overallDailyAvg)}/日)との乖離`}
                        >
                          {diffFromOverall >= 0 ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )}
                          {diffFromOverall >= 0 ? '+' : ''}
                          {formatYen(diffFromOverall)}/日 ({pctFromOverall >= 0 ? '+' : ''}{pctFromOverall}%)
                        </span>
                      </div>
                    </td>

                    {/* 営業内訳 (特日 vs 通常日 1日平均 & 乖離) */}
                    <td className="py-3 px-3 text-right whitespace-nowrap text-xs bg-slate-50/50">
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-rose-600 font-bold">特日({m.eventDaysCount}日):</span>
                          <span className="font-semibold text-slate-800">{formatYen(eventDailyAvg)}/日</span>
                          <span
                            className={`text-[10px] ${
                              eventDiffFromMonth >= 0 ? 'text-indigo-600 font-semibold' : 'text-rose-600 font-bold'
                            }`}
                            title="当月1日平均との乖離"
                          >
                            ({eventDiffFromMonth >= 0 ? '+' : ''}{formatYen(eventDiffFromMonth)})
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-slate-600">
                          <span className="text-slate-500 font-medium">通常({m.normalDaysCount}日):</span>
                          <span className="font-semibold text-slate-800">{formatYen(normalDailyAvg)}/日</span>
                          <span
                            className={`text-[10px] ${
                              normalDiffFromMonth >= 0 ? 'text-indigo-600 font-semibold' : 'text-rose-600 font-bold'
                            }`}
                            title="当月1日平均との乖離"
                          >
                            ({normalDiffFromMonth >= 0 ? '+' : ''}{formatYen(normalDiffFromMonth)})
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Per-Machine Profit (日/台 & 月/台) */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div
                        className={`font-bold ${
                          perMachineDaily >= 0
                            ? perspective === 'hall'
                              ? 'text-indigo-600'
                              : 'text-blue-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {formatYen(perMachineDaily)}/台・日
                      </div>
                      <div className="text-[11px] text-slate-400">
                        月: {formatYen(perMachineMonthly)}/台
                      </div>
                    </td>

                    {/* Payout rate / Machine split */}
                    <td className="py-3 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {m.avgPayoutRate.toFixed(2)}%
                    </td>

                    {/* Diff coins per machine */}
                    <td
                      className={`py-3 px-3 text-right font-semibold whitespace-nowrap ${
                        m.avgDiffCoins > 0 ? 'text-blue-600' : 'text-slate-700'
                      }`}
                    >
                      <div>{m.avgDiffCoins > 0 ? `+${m.avgDiffCoins}` : m.avgDiffCoins} 枚/台</div>
                      <div className="text-[10px] text-slate-400">平均 {m.avgMachines}台</div>
                    </td>

                    <td className="py-3 px-3 text-right text-slate-600 whitespace-nowrap">
                      {formatNumber(m.avgGames)}G
                    </td>

                    <td className="py-3 px-3 text-center whitespace-nowrap text-xs">
                      {perspective === 'hall' ? (
                        <>
                          <span className="text-emerald-600 font-semibold" title="店舗黒字営業日">{m.hallWinDays}勝</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-rose-600 font-semibold" title="出玉還元営業日">{m.playerWinDays}敗</span>
                        </>
                      ) : (
                        <>
                          <span className="text-blue-600 font-semibold" title="客側勝ち日">{m.playerWinDays}勝</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-rose-600 font-semibold" title="店側回収日">{m.hallWinDays}敗</span>
                        </>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(m.yearMonth, e)}
                          className={`px-2 py-0.5 text-xs rounded border font-semibold flex items-center gap-0.5 transition-colors cursor-pointer ${
                            isExpanded
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}
                          title="内訳と1日平均乖離を表示"
                        >
                          内訳
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMonth(m.yearMonth);
                          }}
                          className="p-1 text-slate-400 hover:text-amber-600 rounded transition-colors cursor-pointer"
                          title="日別スロット明細を表示"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Breakdown Row (内訳・日別累積乖離分析パネル) */}
                  {isExpanded && (
                    <tr className="bg-slate-50/90 border-b border-indigo-100">
                      <td colSpan={12} className="p-3 sm:p-4">
                        <MonthDailyBreakdown
                          monthStat={m}
                          dailyRecords={dailyRecords}
                          perspective={perspective}
                          overallDailyAvg={periodBaseline.overallDailyAvg}
                          onSelectMonth={onSelectMonth}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
