import React, { useState } from 'react';
import { MonthlyStat } from '../data/types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  Area,
  ComposedChart,
} from 'recharts';
import { formatYen, formatNumber } from '../utils/formatters';
import {
  BarChart3,
  LineChart as LineChartIcon,
  Activity,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

interface ProfitChartProps {
  monthlyStats: MonthlyStat[];
  perspective: 'hall' | 'player';
  unit: 'yen' | 'coins' | 'avgDiff' | 'payoutRate';
  profitModel?: any;
  onSelectMonth?: (yearMonth: string) => void;
  selectedYear?: string;
  onResetYearFilter?: () => void;
}

interface ChartErrorBoundaryProps {
  children: React.ReactNode;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ProfitChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'グラフの描画中に予期せぬエラーが発生しました',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ProfitChart ErrorBoundary caught error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="w-full h-[320px] sm:h-[360px] flex flex-col items-center justify-center p-6 bg-slate-50 border border-dashed border-rose-200 rounded-xl text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800">月別利益推移グラフの描画に失敗しました</p>
              <p className="text-xs text-rose-600 font-mono max-w-md truncate px-2">
                {this.state.errorMessage}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                グラフを再読込
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                ページ再読み込み
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function isValidNum(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val);
}

// Custom Chart Tooltip (Prompt 59: defined outside component to prevent remounting)
export const ProfitChartTooltip: React.FC<{
  active?: boolean;
  payload?: readonly any[];
  perspective?: 'hall' | 'player';
}> = ({ active, payload, perspective = 'player' }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const gYen = perspective === 'hall' ? data.gModelHallProfit : data.gModelPlayerProfit;
    const perMachineMonth = data.avgMachines > 0 ? Math.round(gYen / data.avgMachines) : 0;
    const perMachineDaily =
      data.avgMachines > 0 && data.daysCount > 0
        ? Math.round(gYen / (data.avgMachines * data.daysCount))
        : 0;

    return (
      <div className="bg-slate-900/95 text-white p-3.5 rounded-lg shadow-xl border border-slate-700 text-xs max-w-sm backdrop-blur-xs">
        <div className="font-bold text-sm text-amber-400 border-b border-slate-700/80 pb-1.5 mb-2 flex items-center justify-between">
          <span>{data.label}</span>
          <span className="text-[11px] font-normal text-slate-400">
            {data.daysCount}日間営業 (平均{data.avgMachines}台)
          </span>
        </div>

        <div className="space-y-1.5">
          {/* G-count Model Details */}
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-indigo-900/50 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-indigo-200 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {perspective === 'hall' ? 'G数連動ホール粗利:' : 'G数連動ユーザー収支:'}
              </span>
              <span
                className={`font-extrabold text-sm ${
                  gYen >= 0 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {formatYen(gYen)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-700/60">
              <span className="text-slate-400">1台あたり収支:</span>
              <span className="font-bold text-amber-300">
                {formatYen(perMachineDaily)}/台・日
                <span className="text-[10px] text-slate-300 font-normal ml-1">
                  (月 {formatYen(perMachineMonth)}/台)
                </span>
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-300">客側平均差枚/日:</span>
            <span
              className={`font-semibold ${data.avgDiffCoins > 0 ? 'text-blue-400' : 'text-slate-200'}`}
            >
              {data.avgDiffCoins > 0 ? `+${data.avgDiffCoins}` : data.avgDiffCoins} 枚/台
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-400">平均稼働 / 機械割:</span>
            <span className="font-medium text-slate-200">
              {formatNumber(data.avgGames)}G ({(data.avgPayoutRate || 100).toFixed(2)}%)
            </span>
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-800 pt-1">
            <span>旧イベント日平均:</span>
            <span className="text-amber-300 font-medium">
              {data.eventAvgDiff > 0 ? `+${data.eventAvgDiff}` : data.eventAvgDiff}枚/台 (
              {data.eventDaysCount}日)
            </span>
          </div>
        </div>

        <div className="mt-2.5 pt-1.5 border-t border-slate-800 text-[10px] text-amber-300/80 text-center">
          クリックで日別明細を表示
        </div>
      </div>
    );
  }
  return null;
};

const ProfitChartInner: React.FC<ProfitChartProps> = ({
  monthlyStats,
  perspective,
  unit,
  onSelectMonth,
  selectedYear,
  onResetYearFilter,
}) => {
  const [chartType, setChartType] = useState<'bar' | 'cumulative' | 'games'>('bar');

  // Running totals for cumulative metric calculation
  let runningTotalIn = 0;
  let runningTotalOut = 0;
  let runningTotalDiff = 0;
  let runningTotalMachines = 0;

  let rawExcludedCount = 0;

  // Prepare data with selected metric
  const rawChartData = monthlyStats.map((m) => {
    // Model A: Diff
    let diffVal = 0;
    let diffCumVal = 0;

    // Model B: G-count
    let gModelVal = 0;
    let gModelCumVal = 0;

    if (perspective === 'hall') {
      if (unit === 'yen') {
        diffVal = Math.round(m.hallYenProfit / 10000); // 万円
        diffCumVal = Math.round(m.cumHallYenProfit / 10000);

        gModelVal = Math.round(m.gModelHallProfit / 10000);
        gModelCumVal = Math.round(m.cumGModelHallProfit / 10000);
      } else if (unit === 'coins') {
        diffVal = Math.round(m.hallCoinProfit / 10000);
        diffCumVal = Math.round(m.cumHallCoinProfit / 10000);

        // Under G-count model, coins are identical to diff coins
        gModelVal = Math.round(m.hallCoinProfit / 10000);
        gModelCumVal = Math.round(m.cumHallCoinProfit / 10000);
      } else if (unit === 'payoutRate') {
        diffVal = Math.round((m.avgPayoutRate || 100) * 100) / 100;
        gModelVal = Math.round((m.avgPayoutRate || 100) * 100) / 100;

        runningTotalIn += m.totalInCoins || 0;
        runningTotalOut += m.totalOutCoins || 0;
        const cumRate =
          runningTotalIn > 0 ? (runningTotalOut / runningTotalIn) * 100 : m.avgPayoutRate || 100;
        diffCumVal = Math.round(cumRate * 100) / 100;
        gModelCumVal = Math.round(cumRate * 100) / 100;
      } else {
        diffVal = -m.avgDiffCoins;
        gModelVal = -m.avgDiffCoins;

        runningTotalDiff += -(m.totalDiffCoins || 0);
        runningTotalMachines += (m.avgMachines || 0) * (m.daysCount || 1);
        const cumAvg =
          runningTotalMachines > 0
            ? Math.round(runningTotalDiff / runningTotalMachines)
            : -m.avgDiffCoins;
        diffCumVal = cumAvg;
        gModelCumVal = cumAvg;
      }
    } else {
      if (unit === 'yen') {
        diffVal = Math.round(m.playerYenProfit / 10000);
        diffCumVal = Math.round(m.cumPlayerYenProfit / 10000);

        gModelVal = Math.round(m.gModelPlayerProfit / 10000);
        gModelCumVal = Math.round(m.cumGModelPlayerProfit / 10000);
      } else if (unit === 'coins') {
        diffVal = Math.round(m.playerCoinProfit / 10000);
        diffCumVal = Math.round(m.cumPlayerCoinProfit / 10000);

        gModelVal = Math.round(m.playerCoinProfit / 10000);
        gModelCumVal = Math.round(m.cumPlayerCoinProfit / 10000);
      } else if (unit === 'payoutRate') {
        diffVal = Math.round((m.avgPayoutRate || 100) * 100) / 100;
        gModelVal = Math.round((m.avgPayoutRate || 100) * 100) / 100;

        runningTotalIn += m.totalInCoins || 0;
        runningTotalOut += m.totalOutCoins || 0;
        const cumRate =
          runningTotalIn > 0 ? (runningTotalOut / runningTotalIn) * 100 : m.avgPayoutRate || 100;
        diffCumVal = Math.round(cumRate * 100) / 100;
        gModelCumVal = Math.round(cumRate * 100) / 100;
      } else {
        diffVal = m.avgDiffCoins;
        gModelVal = m.avgDiffCoins;

        runningTotalDiff += m.totalDiffCoins || 0;
        runningTotalMachines += (m.avgMachines || 0) * (m.daysCount || 1);
        const cumAvg =
          runningTotalMachines > 0
            ? Math.round(runningTotalDiff / runningTotalMachines)
            : m.avgDiffCoins;
        diffCumVal = cumAvg;
        gModelCumVal = cumAvg;
      }
    }

    const currentVal = gModelVal;
    const currentCumVal = gModelCumVal;

    return {
      ...m,
      diffVal,
      diffCumVal,
      gModelVal,
      gModelCumVal,
      currentVal,
      currentCumVal,
      shortLabel: m.label ? m.label.replace('20', "'") : m.yearMonth,
    };
  });

  // Filter out invalid (NaN / non-finite) data points
  const chartData = rawChartData.filter((item) => {
    const isValValid = isValidNum(item.currentVal);
    const isCumValid = isValidNum(item.currentCumVal);
    const isGamesValid = isValidNum(item.avgGames);
    const isValid = isValValid && isCumValid && isGamesValid;
    if (!isValid) {
      rawExcludedCount++;
      return false;
    }
    return true;
  });

  const excludedCount = rawExcludedCount;
  const unitLabel =
    unit === 'yen' ? '万円' : unit === 'coins' ? '万枚' : unit === 'payoutRate' ? '%' : '枚/台';



  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col">
      {/* Chart Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            <span>G数(IN枚数)連動モデル 月別利益推移</span>
            <span className="text-xs font-normal text-slate-500">
              (単位: {unitLabel})
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            バーをクリックすると各月の日別出玉・優秀機種詳細がポップアップします
          </p>
        </div>

        {/* Chart View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              chartType === 'bar'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            単月棒グラフ
          </button>
          <button
            type="button"
            onClick={() => setChartType('cumulative')}
            className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              chartType === 'cumulative'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LineChartIcon className="w-3.5 h-3.5" />
            累計推移
          </button>
          <button
            type="button"
            onClick={() => setChartType('games')}
            className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              chartType === 'games'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            稼働G数推移
          </button>
        </div>
      </div>

      {/* Excluded count warning if NaN / non-finite detected */}
      {excludedCount > 0 && (
        <div className="mb-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>※ 数値異常（NaN等）により {excludedCount} ヶ月分のデータを除外して描画しています</span>
        </div>
      )}

      {/* Chart Canvas or Empty State */}
      {monthlyStats.length === 0 ? (
        <div className="w-full h-[320px] sm:h-[360px] flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-700">表示できるデータがありません</p>
            <p className="text-xs text-slate-500 max-w-sm">
              {selectedYear && selectedYear !== 'all'
                ? `${selectedYear}年のデータが存在しないか、フィルタ条件外です。`
                : '店舗データが取り込まれていないか、対象期間のデータがありません。'}
            </p>
          </div>
          {selectedYear && selectedYear !== 'all' && onResetYearFilter && (
            <button
              type="button"
              onClick={onResetYearFilter}
              className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              全期間を表示する
            </button>
          )}
        </div>
      ) : chartData.length === 0 ? (
        <div className="w-full h-[320px] sm:h-[360px] flex flex-col items-center justify-center p-6 text-center space-y-2 bg-slate-50/60 rounded-xl border border-dashed border-amber-200">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          <p className="text-sm font-bold text-slate-700">表示可能な有効データがありません</p>
          <p className="text-xs text-slate-500">
            数値異常（NaN等）により全ての月データ（{excludedCount}件）が除外されました。
          </p>
        </div>
      ) : (
        <div className="w-full h-[320px] sm:h-[360px] relative">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart
                data={chartData}
                margin={{ top: 15, right: 10, left: -10, bottom: 25 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload[0] && onSelectMonth) {
                    onSelectMonth(e.activePayload[0].payload.yearMonth);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={chartData.length > 20 ? 1 : 0}
                  angle={-45}
                  textAnchor="end"
                  height={45}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<ProfitChartTooltip perspective={perspective} />} />
                <ReferenceLine
                  y={unit === 'payoutRate' ? 100 : 0}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />

                <Bar
                  dataKey="currentVal"
                  name={perspective === 'hall' ? 'G数連動ホール粗利' : 'G数連動ユーザー収支'}
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                >
                  {chartData.map((entry, index) => {
                    const threshold = unit === 'payoutRate' ? 100 : 0;
                    const isPositive = entry.currentVal >= threshold;
                    let color = '';
                    if (perspective === 'hall') {
                      // Hall perspective: for payoutRate, <100% is profit (dark slate), >100% is player win/hall loss (rose)
                      if (unit === 'payoutRate') {
                        color = entry.currentVal <= 100 ? '#1e293b' : '#f43f5e';
                      } else {
                        color = isPositive ? '#1e293b' : '#f43f5e';
                      }
                    } else {
                      color = isPositive ? '#10b981' : '#f43f5e';
                    }
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            ) : chartType === 'cumulative' ? (
              <AreaChartComponent
                data={chartData}
                perspective={perspective}
                unit={unit}
                unitLabel={unitLabel}
                onSelectMonth={onSelectMonth}
              />
            ) : (
              <GamesChartComponent
                data={chartData}
                perspective={perspective}
                onSelectMonth={onSelectMonth}
              />
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const ProfitChart: React.FC<ProfitChartProps> = (props) => {
  return (
    <ProfitChartErrorBoundary>
      <ProfitChartInner {...props} />
    </ProfitChartErrorBoundary>
  );
};

// Subcomponent for cumulative chart
const AreaChartComponent: React.FC<{
  data: any[];
  perspective: 'hall' | 'player';
  unit: 'yen' | 'coins' | 'avgDiff' | 'payoutRate';
  unitLabel: string;
  onSelectMonth?: (ym: string) => void;
}> = ({ data, perspective, unit, unitLabel, onSelectMonth }) => {
  const refLineY = unit === 'payoutRate' ? 100 : 0;
  return (
    <ComposedChart
      data={data}
      margin={{ top: 15, right: 10, left: -10, bottom: 25 }}
      onClick={(e: any) => {
        if (e && e.activePayload && e.activePayload[0] && onSelectMonth) {
          onSelectMonth(e.activePayload[0].payload.yearMonth);
        }
      }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis
        dataKey="shortLabel"
        tick={{ fontSize: 11, fill: '#64748b' }}
        interval={data.length > 20 ? 1 : 0}
        angle={-45}
        textAnchor="end"
        height={45}
      />
      <YAxis
        tick={{ fontSize: 11, fill: '#64748b' }}
        domain={unit === 'payoutRate' ? ['auto', 'auto'] : undefined}
      />
      <Tooltip content={<ProfitChartTooltip perspective={perspective} />} />
      <ReferenceLine y={refLineY} stroke="#cbd5e1" strokeWidth={1} />

      <Area
        type="monotone"
        dataKey="currentCumVal"
        stroke={perspective === 'hall' ? '#1e293b' : '#10b981'}
        fill={perspective === 'hall' ? '#1e293b' : '#10b981'}
        fillOpacity={0.12}
        strokeWidth={2.5}
        dot={{ r: 3 }}
        activeDot={{ r: 5 }}
        name={`G数連動累計 (${unitLabel})`}
      />
    </ComposedChart>
  );
};

// Subcomponent for games chart
const GamesChartComponent: React.FC<{
  data: any[];
  perspective: 'hall' | 'player';
  onSelectMonth?: (ym: string) => void;
}> = ({ data, perspective, onSelectMonth }) => {
  return (
    <ComposedChart
      data={data}
      margin={{ top: 15, right: 10, left: 10, bottom: 25 }}
      onClick={(e: any) => {
        if (e && e.activePayload && e.activePayload[0] && onSelectMonth) {
          onSelectMonth(e.activePayload[0].payload.yearMonth);
        }
      }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis
        dataKey="shortLabel"
        tick={{ fontSize: 11, fill: '#64748b' }}
        interval={data.length > 20 ? 1 : 0}
        angle={-45}
        textAnchor="end"
        height={45}
      />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 11, fill: '#64748b' }}
        domain={[0, 'auto']}
        tickFormatter={(val) => `${val}G`}
      />
      <Tooltip content={<ProfitChartTooltip perspective={perspective} />} />
      <Bar
        yAxisId="left"
        dataKey="avgGames"
        name="平均稼働G数"
        fill="#f59e0b"
        radius={[3, 3, 0, 0]}
        maxBarSize={30}
      />
      <Line
        yAxisId="left"
        type="monotone"
        dataKey="avgGames"
        name="稼働G数推移"
        stroke="#d97706"
        strokeWidth={2}
        dot={{ r: 2 }}
      />
    </ComposedChart>
  );
};
