import React, { useState, useMemo } from 'react';
import { StoreProfile, SpecialDayRules } from '../data/types';
import { UnitMode } from './Header';
import { StoreCommonPeriod } from '../utils/storeComparison';
import { formatNumber, formatCoins, formatYen } from '../utils/formatters';
import {
  HighPayoutFilterConfig,
  MachineCategory,
  MachineScaleType,
} from '../utils/highPayoutAnalytics';
import {
  calculateCrossStoreHighPayout,
  DEFAULT_HIGH_PAYOUT_CONFIG,
  StoreHighPayoutSummary,
} from '../utils/highPayoutCrossStore';
import { ALL_STORES_COLOR, ALL_STORES_NAME } from '../utils/storeColors';
import { ConditionDimension } from '../utils/conditionAnalysis';
import {
  Flame,
  Layers,
  Building2,
  Calendar,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Percent,
  TrendingUp,
  BarChart3,
  Scale,
  RefreshCw,
  ExternalLink,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

export interface HighPayoutCrossStoreAnalysisProps {
  stores: StoreProfile[];
  currentStore: StoreProfile;
  perspective?: 'hall' | 'player';
  unit?: UnitMode;
  rateLend?: number;
  rateExchange?: number;
  specialDayRules?: SpecialDayRules;
  period?: StoreCommonPeriod | null;
  onSelectStore?: (storeId: string) => void;
  onNavigateToConditions?: (dim?: ConditionDimension) => void;
}

type ChartViewType = 'overall_rate' | 'category' | 'scale' | 'allocation';

export const HighPayoutCrossStoreAnalysis: React.FC<HighPayoutCrossStoreAnalysisProps> = ({
  stores,
  currentStore,
  perspective = 'player',
  unit = 'avgDiff',
  rateLend = 46,
  rateExchange = 52,
  period,
  onSelectStore,
}) => {
  const isHall = perspective === 'hall';

  // Config State
  const [minPayoutRate, setMinPayoutRate] = useState<number>(105.0);
  const [minGames, setMinGames] = useState<number>(3000);
  const [minDiffCoins, setMinDiffCoins] = useState<number>(0);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'smart_slot' | 'a_type' | 'juggler'>('all');
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Active chart view tab
  const [chartView, setChartView] = useState<ChartViewType>('overall_rate');

  const config: HighPayoutFilterConfig = useMemo(
    () => ({
      minPayoutRate,
      minGames,
      minDiffCoins,
      categoryFilter,
    }),
    [minPayoutRate, minGames, minDiffCoins, categoryFilter]
  );

  // Cross-store computation
  const crossStoreResult = useMemo(() => {
    return calculateCrossStoreHighPayout(stores, { config, period });
  }, [stores, config, period]);

  const { storeSummaries, totalSummary, allColumns, hasFewDaysStores, fewDaysStoreNames } =
    crossStoreResult;

  // Format profit based on unit mode
  const renderCoinDiff = (coins: number) => {
    if (unit === 'yen') {
      const yenPerCoin = 1000 / rateExchange;
      const yen = Math.round(coins * yenPerCoin);
      return formatYen(isHall ? -yen : yen);
    }
    return formatCoins(isHall ? -coins : coins);
  };

  // Prepare chart data based on active chart view
  const overallRateChartData = useMemo(() => {
    return allColumns.map((col) => ({
      name: col.storeName,
      rate: col.highPayoutRate,
      color: col.color,
      isTotal: col.isTotal,
      daysCount: col.daysCount,
      totalMachineDays: col.totalMachineDays,
      highPayoutCount: col.highPayoutCount,
    }));
  }, [allColumns]);

  const categoryChartData = useMemo(() => {
    return allColumns.map((col) => ({
      name: col.storeName,
      スマスロ: col.categories.smart_slot.share,
      ジャグラー: col.categories.juggler.share,
      Aタイプ: col.categories.a_type.share,
      その他: col.categories.other.share,
      color: col.color,
      isTotal: col.isTotal,
    }));
  }, [allColumns]);

  const scaleChartData = useMemo(() => {
    return allColumns.map((col) => ({
      name: col.storeName,
      '多台数主力 (10台+)': col.scaleTypes.large.share,
      '中規模 (4〜9台)': col.scaleTypes.medium.share,
      '少数・バラ (1〜3台)': col.scaleTypes.small.share,
      color: col.color,
      isTotal: col.isTotal,
    }));
  }, [allColumns]);

  const allocationChartData = useMemo(() => {
    return allColumns.map((col) => ({
      name: col.storeName,
      '複数機種同時投入率': col.cluster.multiModelRate,
      '単品孤立投入率': col.cluster.isolatedRate,
      '上げ狙い率': col.reboundRetention.reboundRate,
      '据え置き率': col.reboundRetention.retentionRate,
      color: col.color,
      isTotal: col.isTotal,
    }));
  }, [allColumns]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                横断分析
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                {`対象 ${stores.length}店舗 + 全店合計`}
              </span>
              {period && period.startDate && period.endDate && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  {`共通期間: ${period.startDate} 〜 ${period.endDate} (${period.commonDaysCount}日間)`}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              高出率台 横断比較分析
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              各店舗の高出率台（設定期待台）の発生率・機種カテゴリ・台数規模・配分傾向（並び vs 単品 / 上げ vs 据置）を比較します。
            </p>
          </div>

          {/* Quick Config Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200/80 shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>抽出条件</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded font-mono">
                {`出率≥${config.minPayoutRate}%`}
              </span>
              {showConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Few days warning banner */}
        {hasFewDaysStores && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/70 flex items-start gap-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="font-bold">対象日数が少ない店舗があります：</span>
              <span>
                {`${fewDaysStoreNames.join('、')} は対象日数が3日未満（または評価台数が少数）のため、指標は参考値としてご活用ください。`}
              </span>
            </div>
          </div>
        )}

        {/* Collapsible Config Drawer */}
        {showConfig && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-150">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                基準出率（この値以上を高出率台と判定）
              </label>
              <select
                value={minPayoutRate}
                onChange={(e) => setMinPayoutRate(Number(e.target.value))}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value={103.0}>103.0% 以上 (設定4以上目安)</option>
                <option value={105.0}>105.0% 以上 (設定5以上目安・既定)</option>
                <option value={107.0}>107.0% 以上 (設定5/6濃厚)</option>
                <option value={110.0}>110.0% 以上 (最高設定6濃厚)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                最低総回転数（G数）
              </label>
              <select
                value={minGames}
                onChange={(e) => setMinGames(Number(e.target.value))}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value={2000}>2,000G 以上</option>
                <option value={3000}>3,000G 以上 (既定)</option>
                <option value={4000}>4,000G 以上 (粘り稼働)</option>
                <option value={5000}>5,000G 以上 (終日稼働)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                最低差枚条件
              </label>
              <select
                value={minDiffCoins}
                onChange={(e) => setMinDiffCoins(Number(e.target.value))}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value={0}>0枚以上 (プラス差枚のみ・既定)</option>
                <option value={500}>+500枚 以上</option>
                <option value={1000}>+1,000枚 以上</option>
                <option value={2000}>+2,000枚 以上 (快勝台)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                機種カテゴリ
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="all">全カテゴリ (すべて)</option>
                <option value="smart_slot">スマスロのみ</option>
                <option value="juggler">ジャグラーのみ</option>
                <option value="a_type">Aタイプのみ</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 2. Cross-Store Comparison Table (店舗を列にしたマトリクス表) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60 shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                店舗別 高出率台特徴 比較表
              </h3>
              <p className="text-[11px] text-slate-500">
                各店舗の指標と、台数・稼働で重み付けした全店合計を横断比較します
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200">
                <th className="py-3 px-4 font-bold text-slate-700 min-w-[200px] sticky left-0 bg-slate-50/95 z-10 border-r border-slate-200/60 shadow-xs">
                  指標 / 分析項目
                </th>
                {allColumns.map((col) => (
                  <th
                    key={col.storeId}
                    className={`py-3 px-4 font-bold min-w-[150px] text-center border-r border-slate-200/60 ${
                      col.isTotal ? 'bg-slate-100/90 text-slate-900 font-extrabold' : 'text-slate-800'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5 justify-center flex-wrap">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: col.color }}
                        />
                        <span className="truncate max-w-[130px]">{col.storeName}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-normal">
                        <span>{`${col.daysCount}日間`}</span>
                        <span>・</span>
                        <span>{`${formatNumber(col.totalMachineDays)}台日`}</span>
                      </div>
                      {col.isFewDays && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300/80">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          日数少
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* SECTION 1: 基本稼働・全体高出率指標 */}
              <tr className="bg-slate-50/60">
                <td
                  colSpan={allColumns.length + 1}
                  className="py-2 px-4 font-bold text-[11px] text-slate-600 bg-slate-100/70 uppercase tracking-wider"
                >
                  ① 基本稼働 & 全体高出率指標
                </td>
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  対象日数
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    {`${col.daysCount} 日`}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  評価台日数（機種・日）
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    {`${formatNumber(col.totalMachineDays)} 台日`}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  高出率台数（該当）
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono font-semibold ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    {`${formatNumber(col.highPayoutCount)} 台日`}
                  </td>
                ))}
              </tr>
              <tr className="bg-amber-50/30 hover:bg-amber-50/60 transition-colors font-semibold">
                <td className="py-3 px-4 font-bold text-slate-900 sticky left-0 bg-amber-50/40 z-10 border-r border-slate-200/60">
                  高出率台の率（全体）
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-3 px-4 text-center ${
                      col.isTotal ? 'bg-amber-100/50 font-black' : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-amber-700">
                      <Percent className="w-3 h-3 text-amber-500" />
                      {`${col.highPayoutRate.toFixed(1)}%`}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  高出率時 平均出率
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    {`${col.avgPayoutRateWhenHigh.toFixed(1)}%`}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  高出率時 平均差枚
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    {renderCoinDiff(col.avgDiffCoinsWhenHigh)}
                  </td>
                ))}
              </tr>

              {/* SECTION 2: 機種カテゴリ別 */}
              <tr className="bg-slate-50/60">
                <td
                  colSpan={allColumns.length + 1}
                  className="py-2 px-4 font-bold text-[11px] text-slate-600 bg-slate-100/70 uppercase tracking-wider"
                >
                  ② 機種カテゴリ別（高出率台に占める割合 & カテゴリ内発生率）
                </td>
              </tr>
              {(['smart_slot', 'juggler', 'a_type', 'other'] as MachineCategory[]).map((cat) => {
                const label =
                  cat === 'smart_slot'
                    ? 'スマスロ'
                    : cat === 'juggler'
                    ? 'ジャグラー'
                    : cat === 'a_type'
                    ? 'Aタイプ'
                    : 'その他';
                return (
                  <tr key={cat} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                      <div className="flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-[10px] text-slate-400">構成比 (発生率)</span>
                      </div>
                    </td>
                    {allColumns.map((col) => {
                      const metric = col.categories[cat];
                      return (
                        <td
                          key={col.storeId}
                          className={`py-2.5 px-4 text-center font-mono ${
                            col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="font-semibold text-slate-800">
                              {`${metric.share.toFixed(1)}%`}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {`(${metric.rate.toFixed(1)}% / ${metric.highPayoutCount}台)`}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* SECTION 3: 台数規模別 */}
              <tr className="bg-slate-50/60">
                <td
                  colSpan={allColumns.length + 1}
                  className="py-2 px-4 font-bold text-[11px] text-slate-600 bg-slate-100/70 uppercase tracking-wider"
                >
                  ③ 台数規模別（高出率台に占める割合 & 規模内発生率）
                </td>
              </tr>
              {(['large', 'medium', 'small'] as MachineScaleType[]).map((sc) => {
                const label =
                  sc === 'large'
                    ? '多台数主力 (10台以上)'
                    : sc === 'medium'
                    ? '中規模 (4〜9台)'
                    : '少数台・バラエティ (1〜3台)';
                return (
                  <tr key={sc} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                      <div className="flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-[10px] text-slate-400">構成比 (発生率)</span>
                      </div>
                    </td>
                    {allColumns.map((col) => {
                      const metric = col.scaleTypes[sc];
                      return (
                        <td
                          key={col.storeId}
                          className={`py-2.5 px-4 text-center font-mono ${
                            col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="font-semibold text-slate-800">
                              {`${metric.share.toFixed(1)}%`}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {`(${metric.rate.toFixed(1)}% / ${metric.highPayoutCount}台)`}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* SECTION 4: 投入形態・前日相関 */}
              <tr className="bg-slate-50/60">
                <td
                  colSpan={allColumns.length + 1}
                  className="py-2 px-4 font-bold text-[11px] text-slate-600 bg-slate-100/70 uppercase tracking-wider"
                >
                  ④ 投入形態 & 前日相関（並び・全台系 / 上げ vs 据置）
                </td>
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <span>複数機種同時投入率（並び・全台系傾向）</span>
                    <span className="text-[10px] text-slate-400">2機種以上</span>
                  </div>
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    <span className="font-semibold text-indigo-700">
                      {`${col.cluster.multiModelRate.toFixed(1)}%`}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <span>単品孤立投入率</span>
                    <span className="text-[10px] text-slate-400">1機種のみ</span>
                  </div>
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    {`${col.cluster.isolatedRate.toFixed(1)}%`}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <span>凹み台上げ狙い率（前日マイナス→当日高出率）</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">上げ</span>
                  </div>
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    <span className="font-semibold text-emerald-700">
                      {`${col.reboundRetention.reboundRate.toFixed(1)}%`}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-50/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <span>据え置き狙い率（前日プラス→当日高出率）</span>
                    <span className="text-[10px] text-blue-600 font-semibold">据置</span>
                  </div>
                </td>
                {allColumns.map((col) => (
                  <td
                    key={col.storeId}
                    className={`py-2.5 px-4 text-center font-mono ${
                      col.isTotal ? 'bg-slate-50/70 font-bold' : ''
                    }`}
                  >
                    <span className="font-semibold text-blue-700">
                      {`${col.reboundRetention.retentionRate.toFixed(1)}%`}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Recharts Visual Comparisons (グラフ比較) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200/60 shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">店舗別 指標ビジュアル比較</h3>
              <p className="text-[11px] text-slate-500">店舗ごとの配分傾向・カテゴリ比率を可視化</p>
            </div>
          </div>

          {/* Chart View Selector Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600 self-start sm:self-auto overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setChartView('overall_rate')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                chartView === 'overall_rate'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              全体高出率台の率
            </button>
            <button
              type="button"
              onClick={() => setChartView('category')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                chartView === 'category'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              機種カテゴリ構成
            </button>
            <button
              type="button"
              onClick={() => setChartView('scale')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                chartView === 'scale'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              台数規模別構成
            </button>
            <button
              type="button"
              onClick={() => setChartView('allocation')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                chartView === 'allocation'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              投入傾向（上げ/据置/並び）
            </button>
          </div>
        </div>

        {/* Chart Render Area */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartView === 'overall_rate' ? (
              <BarChart
                data={overallRateChartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  unit="%"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax * 1.2))]}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toFixed(1)}%`, '高出率台の率']}
                  labelFormatter={(name) => `店舗: ${name}`}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
                  {overallRateChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : chartView === 'category' ? (
              <BarChart
                data={categoryChartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toFixed(1)}%`]}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="スマスロ" stackId="cat" fill="#8b5cf6" />
                <Bar dataKey="ジャグラー" stackId="cat" fill="#ec4899" />
                <Bar dataKey="Aタイプ" stackId="cat" fill="#06b6d4" />
                <Bar dataKey="その他" stackId="cat" fill="#94a3b8" />
              </BarChart>
            ) : chartView === 'scale' ? (
              <BarChart
                data={scaleChartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toFixed(1)}%`]}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="多台数主力 (10台+)" stackId="scale" fill="#3b82f6" />
                <Bar dataKey="中規模 (4〜9台)" stackId="scale" fill="#10b981" />
                <Bar dataKey="少数・バラ (1〜3台)" stackId="scale" fill="#f59e0b" />
              </BarChart>
            ) : (
              <BarChart
                data={allocationChartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toFixed(1)}%`]}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="複数機種同時投入率" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="単品孤立投入率" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="上げ狙い率" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="据え置き率" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Store Deep-Dive Links (各店舗の詳細への導線) */}
      <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-800">
              店舗別の個別詳細分析（機種別ランキング・安定度マトリクス・カルテ）を開く：
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStore?.(s.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 transition-colors shadow-2xs cursor-pointer"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.id === currentStore.id ? '#4f46e5' : '#94a3b8' }}
                />
                <span>{s.name}</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
