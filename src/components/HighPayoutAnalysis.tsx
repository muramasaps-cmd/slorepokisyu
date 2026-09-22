import React, { useState, useMemo } from 'react';
import { DailyRecord } from '../data/types';
import { UnitMode } from './Header';
import { formatCoins, formatNumber, formatYen } from '../utils/formatters';
import {
  analyzeHighPayoutMachines,
  HighPayoutFilterConfig,
  MachineCategory,
  getCategoryLabel,
} from '../utils/highPayoutAnalytics';
import {
  Sparkles,
  Flame,
  Zap,
  Target,
  Trophy,
  SlidersHorizontal,
  Calendar,
  Layers,
  Search,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Award,
  BarChart3,
  HelpCircle,
  Hash,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

interface HighPayoutAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  rateLend?: number;
  rateExchange?: number;
  oldEventDays?: string;
  specialDayRules?: any;
}

type ActiveTab = 'insights' | 'models' | 'tails' | 'timing' | 'games' | 'records';

export const HighPayoutAnalysis: React.FC<HighPayoutAnalysisProps> = ({
  dailyRecords,
  perspective,
  unit,
  rateLend = 46,
  rateExchange = 52,
  oldEventDays = '',
}) => {
  const isHall = perspective === 'hall';

  // Analysis Threshold and Criteria Configuration State
  const [minPayoutRate, setMinPayoutRate] = useState<number>(105.0);
  const [minGames, setMinGames] = useState<number>(3000);
  const [minDiffCoins, setMinDiffCoins] = useState<number>(0);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'smart_slot' | 'a_type' | 'juggler'>('all');

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('insights');
  const [searchModelQuery, setSearchModelQuery] = useState<string>('');
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [recordsPage, setRecordsPage] = useState<number>(1);
  const recordsPerPage = 15;

  const config: HighPayoutFilterConfig = useMemo(
    () => ({
      minPayoutRate,
      minGames,
      minDiffCoins,
      categoryFilter,
    }),
    [minPayoutRate, minGames, minDiffCoins, categoryFilter]
  );

  // Run analytical engine
  const analysisResult = useMemo(() => {
    return analyzeHighPayoutMachines(dailyRecords, config);
  }, [dailyRecords, config]);

  const {
    highItems,
    allItems,
    modelStats,
    tailStats,
    dayOfWeekStats,
    eventTimingStat,
    gamesBracketStats,
    insights,
  } = analysisResult;

  // Filtered models for table search
  const filteredModelStats = useMemo(() => {
    if (!searchModelQuery.trim()) return modelStats;
    const q = searchModelQuery.toLowerCase();
    return modelStats.filter((m) => m.modelName.toLowerCase().includes(q));
  }, [modelStats, searchModelQuery]);

  // Paginated records
  const paginatedHighItems = useMemo(() => {
    const start = (recordsPage - 1) * recordsPerPage;
    return highItems.slice(start, start + recordsPerPage);
  }, [highItems, recordsPage]);

  const totalPages = Math.ceil(highItems.length / recordsPerPage) || 1;

  // Helper formatting for diff coins / yen
  const formatProfit = (coins: number) => {
    if (unit === 'yen') {
      const yenPerCoin = 1000 / rateExchange;
      const yen = Math.round(coins * yenPerCoin);
      return formatYen(isHall ? -yen : yen);
    }
    return formatCoins(isHall ? -coins : coins);
  };

  const formatProfitRaw = (coins: number) => {
    if (unit === 'yen') {
      const yenPerCoin = 1000 / rateExchange;
      const yen = Math.round(coins * yenPerCoin);
      return yen >= 0 ? `+¥${formatNumber(yen)}` : `-¥${formatNumber(Math.abs(yen))}`;
    }
    return coins >= 0 ? `+${formatNumber(coins)}枚` : `-${formatNumber(Math.abs(coins))}枚`;
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-6">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300/80 px-2.5 py-0.5 rounded-full text-xs font-black">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              高設定・高出率 抽出分析
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              出率が高い台の特徴・投入傾向分析
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            出玉率（機械割）の高い台が<strong>どの機種・どの末尾・どの曜日/特日・何Gの稼働帯</strong>
            に集中して出現しているかを自動抽出し、ホールの配分傾向・狙い目特徴を解剖します。
          </p>
        </div>

        {/* Quick Summary Pill & Condition Settings Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="text-slate-500">抽出基準:</span>
            <span className="font-extrabold text-amber-600">
              出率{minPayoutRate}%以上 / {minGames > 0 ? `${minGames.toLocaleString()}G以上` : '全G'}
            </span>
            <span className="text-slate-400">|</span>
            <span className="font-bold text-slate-900">
              該当 <strong className="text-amber-700">{highItems.length}件</strong> ({insights.overallHighRate}%)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              showConfigDrawer
                ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-2xs'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>条件変更</span>
            {showConfigDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Threshold & Criteria Configuration Drawer */}
      {showConfigDrawer && (
        <div className="bg-slate-50/90 border border-amber-200 rounded-xl p-4 space-y-4 animate-in fade-in duration-150">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-amber-500" />
            高出率台の判定基準・抽出条件設定
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. 出玉率（機械割）の閾値 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="font-bold text-slate-700 block">① 判定出玉率 (機械割):</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: '105%以上 (設定4以上目安)', val: 105.0 },
                  { label: '108%以上 (設定5以上目安)', val: 108.0 },
                  { label: '110%以上 (設定6相当目安)', val: 110.0 },
                  { label: '100%超 (全プラス台)', val: 100.1 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setMinPayoutRate(opt.val)}
                    className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer text-left ${
                      minPayoutRate === opt.val
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 最低稼働ゲーム数 (G数足切り) */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="font-bold text-slate-700 block">② 最低ゲーム数 (確信・粘り度):</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: '3,000G以上 (一定稼働)', val: 3000 },
                  { label: '5,000G以上 (終日粘り)', val: 5000 },
                  { label: '1,500G以上 (中程度)', val: 1500 },
                  { label: '制限なし (全台)', val: 0 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setMinGames(opt.val)}
                    className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer text-left ${
                      minGames === opt.val
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 機種種別フィルター */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="font-bold text-slate-700 block">③ 機種カテゴリ絞込:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: '全カテゴリ', val: 'all' as const },
                  { label: 'スマスロのみ', val: 'smart_slot' as const },
                  { label: 'ジャグラーのみ', val: 'juggler' as const },
                  { label: 'Aタイプ全般', val: 'a_type' as const },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setCategoryFilter(opt.val)}
                    className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer text-left ${
                      categoryFilter === opt.val
                        ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 最低差枚数条件 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="font-bold text-slate-700 block">④ 差枚条件 (客側プラス域):</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: '指定なし (0枚以上)', val: 0 },
                  { label: '+1,000枚以上', val: 1000 },
                  { label: '+2,000枚以上', val: 2000 },
                  { label: '+3,000枚以上', val: 3000 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setMinDiffCoins(opt.val)}
                    className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer text-left ${
                      minDiffCoins === opt.val
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4大特徴 自動抽出サマリーインサイトカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 特徴 1: 最頻出機種 */}
        <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/40 rounded-xl border border-amber-200 p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-xs text-amber-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-600" />
                最頻出・本命機種
              </span>
              <span className="text-[10px] bg-amber-200/80 px-1.5 py-0.2 rounded font-black">
                特徴 ①
              </span>
            </div>
            {insights.topModel ? (
              <>
                <div className="font-black text-slate-900 text-sm truncate mt-1" title={insights.topModel.modelName}>
                  {insights.topModel.modelName}
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-xl font-black text-amber-700">
                    {insights.topModel.highCount}回
                  </span>
                  <span className="text-xs text-slate-600 font-bold">
                    (出現率 {insights.topModel.rate}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  高出率時の平均出率 <strong className="text-slate-900">{insights.topModel.avgPayout}%</strong>。
                  店舗内で最も安定して高出率基準をクリアしており、高設定配分の最優先候補です。
                </p>
              </>
            ) : (
              <div className="text-xs text-slate-400 mt-2">該当機種なし</div>
            )}
          </div>
        </div>

        {/* 特徴 2: 集中する末尾 */}
        <div className="bg-gradient-to-br from-indigo-50/80 to-indigo-100/40 rounded-xl border border-indigo-200 p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-xs text-indigo-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-indigo-600" />
                集中する台番号末尾
              </span>
              <span className="text-[10px] bg-indigo-200/80 px-1.5 py-0.2 rounded font-black">
                特徴 ②
              </span>
            </div>
            {insights.topTail ? (
              <>
                <div className="font-black text-slate-900 text-sm mt-1">
                  {insights.topTail.tailName}
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-xl font-black text-indigo-700">
                    {insights.topTail.rate}%
                  </span>
                  <span className="text-xs text-slate-600 font-bold">
                    ({insights.topTail.highCount}営業日で達成)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  他末尾と比べて高出率台の発生頻度が最も高く、平均出率も
                  <strong className="text-slate-900">{insights.topTail.avgPayout}%</strong>
                  と突出。末尾仕掛けの対象となりやすい傾向があります。
                </p>
              </>
            ) : (
              <div className="text-xs text-slate-400 mt-2">末尾データなし</div>
            )}
          </div>
        </div>

        {/* 特徴 3: 特日・曜日傾向 */}
        <div className="bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 rounded-xl border border-emerald-200 p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-xs text-emerald-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                特日・旧イベ日の投入比率
              </span>
              <span className="text-[10px] bg-emerald-200/80 px-1.5 py-0.2 rounded font-black">
                特徴 ③
              </span>
            </div>
            <div className="font-black text-slate-900 text-sm mt-1">
              特日は平日の{' '}
              <span className="text-emerald-700 text-base">{insights.eventDayMultiplier}倍</span> 投入
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-sm font-bold text-slate-700">
                特日出率率: <strong className="text-emerald-700">{insights.eventDayHighRate}%</strong>
              </span>
              <span className="text-xs text-slate-500">
                (通常日 {insights.normalDayHighRate}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
              {insights.topDayOfWeek && (
                <>
                  曜日別では <strong className="text-slate-900">{insights.topDayOfWeek.day}曜日</strong>
                  （{insights.topDayOfWeek.rate}%）の出現率が突出。旧イベ日や週末にメリハリを利かせて投入する傾向が鮮明です。
                </>
              )}
            </p>
          </div>
        </div>

        {/* 特徴 4: プレイヤーの粘り度 (稼働G数) */}
        <div className="bg-gradient-to-br from-purple-50/80 to-purple-100/40 rounded-xl border border-purple-200 p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-xs text-purple-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                稼働G数・粘り度の特徴
              </span>
              <span className="text-[10px] bg-purple-200/80 px-1.5 py-0.2 rounded font-black">
                特徴 ④
              </span>
            </div>
            <div className="font-black text-slate-900 text-sm mt-1">
              平均稼働{' '}
              <span className="text-purple-700 text-base">
                {insights.gamesComparison.highAvgGames.toLocaleString()} G
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs text-slate-600 font-bold">
                通常台より
              </span>
              <span className="text-base font-black text-purple-800">
                +{insights.gamesComparison.difference.toLocaleString()} G
              </span>
              <span className="text-xs text-slate-600 font-bold">多い稼働</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
              出率が高い台は通常台よりも圧倒的に長く回されており、小役確率や確定演出などの手応えから客が夜まで確信して粘っていることが伺えます。
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { id: 'insights' as const, label: '総合特徴・種別構成', icon: Award },
          { id: 'models' as const, label: `機種別ランキング (${modelStats.length})`, icon: Trophy },
          { id: 'tails' as const, label: `末尾別特徴 (${tailStats.length})`, icon: Hash },
          { id: 'timing' as const, label: '特日・曜日別特徴', icon: Calendar },
          { id: 'games' as const, label: '稼働G数別特徴', icon: Clock },
          { id: 'records' as const, label: `該当データ一覧 (${highItems.length})`, icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-amber-500 text-amber-900 bg-amber-50/50 shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content 1: 総合特徴・種別構成 */}
      {activeTab === 'insights' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* カテゴリ構成比 (スマスロ / ジャグラー / Aタイプ / その他) */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-3">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              高出率台の機種カテゴリ別 構成比率
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {insights.categoryBreakdown.map((cat) => {
                let colorBorder = 'border-slate-300';
                let colorBg = 'bg-white';
                let textColor = 'text-slate-900';
                let icon = <Layers className="w-4 h-4 text-slate-500" />;

                if (cat.category === 'smart_slot') {
                  colorBorder = 'border-purple-200';
                  colorBg = 'bg-purple-50/60';
                  textColor = 'text-purple-900';
                  icon = <Zap className="w-4 h-4 text-purple-600" />;
                } else if (cat.category === 'juggler') {
                  colorBorder = 'border-amber-200';
                  colorBg = 'bg-amber-50/60';
                  textColor = 'text-amber-950';
                  icon = <Flame className="w-4 h-4 text-amber-600" />;
                } else if (cat.category === 'a_type') {
                  colorBorder = 'border-emerald-200';
                  colorBg = 'bg-emerald-50/60';
                  textColor = 'text-emerald-950';
                  icon = <Target className="w-4 h-4 text-emerald-600" />;
                }

                return (
                  <div
                    key={cat.category}
                    className={`p-3.5 rounded-xl border ${colorBorder} ${colorBg} shadow-2xs flex flex-col justify-between`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className={`flex items-center gap-1.5 ${textColor}`}>
                        {icon}
                        {cat.label}
                      </span>
                      <span className="text-xs font-black text-slate-700">{cat.percent}%</span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-black text-slate-900">{cat.count}件</span>
                        <span className="text-xs text-slate-500">
                          平均出率: <strong>{cat.avgPayout}%</strong>
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full ${
                            cat.category === 'smart_slot'
                              ? 'bg-purple-500'
                              : cat.category === 'juggler'
                              ? 'bg-amber-500'
                              : cat.category === 'a_type'
                              ? 'bg-emerald-500'
                              : 'bg-slate-500'
                          }`}
                          style={{ width: `${cat.percent}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 flex justify-between">
                      <span>平均差枚:</span>
                      <span className="font-extrabold text-slate-900">
                        {formatProfitRaw(cat.avgDiff)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 考察と立ち回りガイド */}
          <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-200 text-xs text-slate-700 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
              <Award className="w-4 h-4 text-amber-600" />
              データから導き出された高出率台の傾向まとめ
            </div>
            <ul className="list-disc list-inside space-y-1.5 pl-1 leading-relaxed text-slate-800">
              <li>
                <strong>本命配分の機種:</strong>{' '}
                {insights.topModel ? (
                  <>
                    「<strong>{insights.topModel.modelName}</strong>」が最も多く高出率基準を達成（
                    {insights.topModel.highCount}回・平均出率{insights.topModel.avgPayout}%）。
                    主力多台数機を中心に設定456が投入される傾向が強く表れています。
                  </>
                ) : (
                  '現在設定された条件では該当なし'
                )}
              </li>
              <li>
                <strong>台番号末尾の仕掛け:</strong>{' '}
                {insights.topTail ? (
                  <>
                    「<strong>{insights.topTail.tailName}</strong>」が最も高出率を記録（達成率
                    {insights.topTail.rate}%）。
                    末尾仕掛けを意識した配分が行われている可能性が高く、朝イチの狙い台選定で優先度が高いです。
                  </>
                ) : (
                  '末尾ごとの偏りは僅差です'
                )}
              </li>
              <li>
                <strong>特日と平日のメリハリ:</strong>{' '}
                特日（旧イベ日）の高出率台投入比率は通常の<strong>{insights.eventDayMultiplier}倍</strong>。
                {insights.eventDayMultiplier >= 2.0
                  ? '明らかな回収日と還元日のメリハリ型店舗であり、特日の朝イチ参戦が極めて有利です。'
                  : '平日でも一定数の高設定が配分されており、毎日チャンスがあるベース配分型店舗です。'}
              </li>
              <li>
                <strong>稼働ゲーム数のシグナル:</strong> 高出率台は平均で
                <strong>{insights.gamesComparison.highAvgGames.toLocaleString()}G</strong>
                回されています。夕方時点で5,000G以上回っていて出率105%以上の台は、確定演出が出ている確信台の可能性が極めて濃厚です。
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab Content 2: 機種別特徴ランキング */}
      {activeTab === 'models' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="text-xs text-slate-500 font-medium">
              全{modelStats.length}機種中、高出率台（出率{minPayoutRate}%以上）の発生頻度が高い順に掲載
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="機種名で絞り込み..."
                value={searchModelQuery}
                onChange={(e) => setSearchModelQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-amber-400"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">順位</th>
                    <th className="py-2.5 px-3">機種名</th>
                    <th className="py-2.5 px-3 text-center">種別</th>
                    <th className="py-2.5 px-3 text-right">登場日数</th>
                    <th className="py-2.5 px-3 text-right">高出率回数</th>
                    <th className="py-2.5 px-3 text-right">高出率発生率</th>
                    <th className="py-2.5 px-3 text-right">高出率時 平均出率</th>
                    <th className="py-2.5 px-3 text-right">高出率時 平均差枚</th>
                    <th className="py-2.5 px-3 text-right">高出率時 平均G数</th>
                    <th className="py-2.5 px-3 text-right">勝率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredModelStats.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                        該当する機種データがありません
                      </td>
                    </tr>
                  ) : (
                    filteredModelStats.map((model, idx) => {
                      const isTop3 = idx < 3 && model.highPayoutCount > 0;
                      return (
                        <tr
                          key={model.modelName}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            model.highPayoutCount > 0 ? 'bg-white' : 'bg-slate-50/40 opacity-70'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold">
                            {isTop3 ? (
                              <span
                                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-slate-950 ${
                                  idx === 0
                                    ? 'bg-amber-400 ring-1 ring-amber-500'
                                    : idx === 1
                                    ? 'bg-slate-300 ring-1 ring-slate-400'
                                    : 'bg-amber-600/80 text-white'
                                }`}
                              >
                                {idx + 1}
                              </span>
                            ) : (
                              <span className="text-slate-400">{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {model.modelName}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                model.category === 'smart_slot'
                                  ? 'bg-purple-100 text-purple-800'
                                  : model.category === 'juggler'
                                  ? 'bg-amber-100 text-amber-900'
                                  : model.category === 'a_type'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {getCategoryLabel(model.category)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {model.totalAppearances}日
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-amber-700">
                            {model.highPayoutCount > 0 ? `${model.highPayoutCount}回` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 font-mono font-bold">
                              <span className={model.highPayoutRate >= 25 ? 'text-amber-700' : 'text-slate-700'}>
                                {model.highPayoutRate}%
                              </span>
                              <div className="w-12 bg-slate-200 h-1 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full"
                                  style={{ width: `${Math.min(model.highPayoutRate, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                            {model.avgPayoutRateWhenHigh > 0 ? `${model.avgPayoutRateWhenHigh}%` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {model.highPayoutCount > 0 ? formatProfitRaw(model.avgDiffCoinsWhenHigh) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {model.highPayoutCount > 0 ? `${model.avgGamesWhenHigh.toLocaleString()} G` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {model.winRateWhenHigh !== null ? (
                              <span className="text-emerald-700">{model.winRateWhenHigh}%</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: 末尾別特徴 */}
      {activeTab === 'tails' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="text-xs text-slate-500">
            台番号末尾（0〜9およびゾロ目）ごとの高出率達成頻度と平均出玉率を可視化。どの末尾に当たりが偏るかを把握できます。
          </div>

          {/* Bar Chart */}
          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              末尾別の高出率達成率(%)・平均出玉率
            </h4>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tailStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="tailName" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as (typeof tailStats)[0];
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs shadow-lg space-y-1">
                          <div className="font-bold text-amber-400">{d.tailName}</div>
                          <div>高出率達成率: <strong>{d.highPayoutRate}%</strong> ({d.highPayoutCount}/{d.totalDays}日)</div>
                          <div>高出率時平均出率: <strong>{d.avgPayoutRateWhenHigh || d.avgPayoutRateOverall}%</strong></div>
                          <div>高出率時平均差枚: <strong>{formatProfitRaw(d.avgDiffCoinsWhenHigh)}</strong></div>
                          <div>平均G数: <strong>{d.avgGamesWhenHigh.toLocaleString()} G</strong></div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="highPayoutRate" fill="#6366f1" radius={[4, 4, 0, 0]}>
                    {tailStats.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.tailName === insights.topTail?.tailName ? '#f59e0b' : '#6366f1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">末尾</th>
                  <th className="py-2.5 px-3 text-right">総営業日数</th>
                  <th className="py-2.5 px-3 text-right">高出率達成日数</th>
                  <th className="py-2.5 px-3 text-right">高出率発生率</th>
                  <th className="py-2.5 px-3 text-right">高出率時 平均出率</th>
                  <th className="py-2.5 px-3 text-right">高出率時 平均差枚</th>
                  <th className="py-2.5 px-3 text-right">平均G数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tailStats.map((tail) => {
                  const isTop = tail.tailName === insights.topTail?.tailName;
                  return (
                    <tr
                      key={tail.tailName}
                      className={`hover:bg-slate-50 transition-colors ${
                        isTop ? 'bg-amber-50/60 font-bold' : 'bg-white'
                      }`}
                    >
                      <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                        {isTop && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                        {tail.tailName}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        {tail.totalDays}日
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-indigo-700">
                        {tail.highPayoutCount}日
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-900">
                        {tail.highPayoutRate}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-emerald-700">
                        {tail.avgPayoutRateWhenHigh > 0 ? `${tail.avgPayoutRateWhenHigh}%` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {tail.highPayoutCount > 0 ? formatProfitRaw(tail.avgDiffCoinsWhenHigh) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {tail.highPayoutCount > 0 ? `${tail.avgGamesWhenHigh.toLocaleString()} G` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 4: 特日・曜日別特徴 */}
      {activeTab === 'timing' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 特日 vs 平日 比較カード */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                特日（旧イベ日/〇のつく日）vs 通常営業日 比較
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                  <div className="text-xs font-bold text-emerald-900">特日 (旧イベント日)</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">
                    {eventTimingStat.eventHighRate}%
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    高出率 {eventTimingStat.eventHighCount} / {eventTimingStat.eventDaysCount} 営業日
                  </div>
                </div>

                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                  <div className="text-xs font-bold text-slate-700">通常営業日</div>
                  <div className="text-2xl font-black text-slate-700 mt-1">
                    {eventTimingStat.normalHighRate}%
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    高出率 {eventTimingStat.normalHighCount} / {eventTimingStat.normalDaysCount} 営業日
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                特日ルール（{oldEventDays || '店舗設定'}）での高出率発生率は通常の
                <strong className="text-emerald-700 mx-1">
                  {eventTimingStat.normalHighRate > 0
                    ? (eventTimingStat.eventHighRate / eventTimingStat.normalHighRate).toFixed(1)
                    : '-'}
                  倍
                </strong>
                。特定日を重視した立ち回りの有効性が実証されています。
              </p>
            </div>

            {/* 曜日別テーブル */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                曜日別の高出率台 投入傾向
              </h4>

              <table className="w-full text-xs text-left">
                <thead className="bg-white text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-1.5 px-2">曜日</th>
                    <th className="py-1.5 px-2 text-right">高出率件数</th>
                    <th className="py-1.5 px-2 text-right">発生率</th>
                    <th className="py-1.5 px-2 text-right">平均差枚</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dayOfWeekStats.map((dow) => {
                    const isTop = dow.dayOfWeek === insights.topDayOfWeek?.day;
                    const isWeekend = dow.dayOfWeek === '土' || dow.dayOfWeek === '日';
                    return (
                      <tr
                        key={dow.dayOfWeek}
                        className={`hover:bg-slate-100 ${isTop ? 'bg-amber-50 font-bold' : ''}`}
                      >
                        <td className="py-1.5 px-2 font-bold">
                          <span
                            className={
                              dow.dayOfWeek === '日'
                                ? 'text-rose-600'
                                : dow.dayOfWeek === '土'
                                ? 'text-blue-600'
                                : 'text-slate-800'
                            }
                          >
                            {dow.dayOfWeek}曜日
                          </span>
                          {isTop && (
                            <span className="ml-1 text-[10px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-black">
                              TOP
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-indigo-700">
                          {dow.highPayoutCount}件
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                          {dow.highPayoutRate}%
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatProfitRaw(dow.avgDiffCoins)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 5: 稼働G数帯別特徴 */}
      {activeTab === 'games' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="text-xs text-slate-500">
            稼働ゲーム数（回されたG数）の帯域ごとに、高出率台がどれだけ出現しているかを比較。
            「粘られている台ほど高出率になる」相関の強さを検証できます。
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {gamesBracketStats.map((bracket) => (
              <div
                key={bracket.label}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-slate-700">{bracket.label}</div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-black text-purple-700">
                      {bracket.highPayoutRate}%
                    </span>
                    <span className="text-xs text-slate-500">
                      ({bracket.highPayoutCount} / {bracket.totalCount}件)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-purple-600 rounded-full"
                      style={{ width: `${Math.min(bracket.highPayoutRate, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 text-xs flex items-center justify-between text-slate-600">
                  <span>平均出玉率:</span>
                  <strong className="text-slate-900">{bracket.avgPayoutRate > 0 ? `${bracket.avgPayoutRate}%` : '-'}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl text-xs text-purple-950 leading-relaxed">
            <strong>💡 稼働G数の示唆:</strong> 7,000G以上の帯域で高出率達成率が著しく高くなっている場合、
            プレイヤーが設定示唆画面や小役カウント等の良挙動を確認して確信を持って閉店まで回していることを示します。
            逆に低稼働帯の勝率が低いホールでは、夕方以降の見切りが早い傾向が読み取れます。
          </div>
        </div>
      )}

      {/* Tab Content 6: 該当高出率データ一覧 */}
      {activeTab === 'records' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              条件（出率{minPayoutRate}%以上 / {minGames}G以上）に合致した全
              <strong className="text-amber-700 font-bold mx-1">{highItems.length}件</strong>
              の実績レコード
            </span>
            <span>
              ページ {recordsPage} / {totalPages}
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">日付</th>
                    <th className="py-2.5 px-3">機種名</th>
                    <th className="py-2.5 px-3 text-center">種別</th>
                    <th className="py-2.5 px-3 text-right">出玉率 (機械割)</th>
                    <th className="py-2.5 px-3 text-right">平均差枚</th>
                    <th className="py-2.5 px-3 text-right">総差枚</th>
                    <th className="py-2.5 px-3 text-right">平均G数</th>
                    <th className="py-2.5 px-3 text-right">勝率</th>
                    <th className="py-2.5 px-3 text-center">特日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedHighItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                        該当する高出率データがありません
                      </td>
                    </tr>
                  ) : (
                    paginatedHighItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors bg-white">
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {item.date} ({item.dayOfWeek})
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">{item.modelName}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.category === 'smart_slot'
                                ? 'bg-purple-100 text-purple-800'
                                : item.category === 'juggler'
                                ? 'bg-amber-100 text-amber-900'
                                : item.category === 'a_type'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {getCategoryLabel(item.category)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black text-amber-700">
                          {item.payoutRate}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {formatProfitRaw(item.avgDiffCoins)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          {formatProfitRaw(item.totalDiffCoins)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          {item.avgGames.toLocaleString()} G
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {item.winRate !== null ? (
                            <span className="font-bold text-emerald-700">{item.winRate}%</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.isOldEventDay ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                              特日
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs">
                <button
                  type="button"
                  disabled={recordsPage <= 1}
                  onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  前へ
                </button>
                <span className="text-slate-600">
                  {recordsPage} / {totalPages} ページ
                </span>
                <button
                  type="button"
                  disabled={recordsPage >= totalPages}
                  onClick={() => setRecordsPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  次へ
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
