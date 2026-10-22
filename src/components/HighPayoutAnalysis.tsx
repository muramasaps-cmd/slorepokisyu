import React, { useState, useMemo } from 'react';
import { DailyRecord, SpecialDayRules } from '../data/types';
import { UnitMode } from './Header';
import { formatCoins, formatNumber, formatYen } from '../utils/formatters';
import {
  analyzeHighPayoutMachines,
  HighPayoutFilterConfig,
  MachineCategory,
  MachineScaleType,
  MachineScaleStat,
  getCategoryLabel,
  getScaleLabel,
  StabilityQuadrant,
} from '../utils/highPayoutAnalytics';
import { ConditionDimension } from '../utils/conditionAnalysis';
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
  TrendingUp,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Award,
  BarChart3,
  Hash,
  Scale,
  RefreshCw,
  ShieldCheck,
  Activity,
  Star,
  Users,
  AlertCircle,
  HelpCircle,
  Compass,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface HighPayoutAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  rateLend?: number;
  rateExchange?: number;
  oldEventDays?: string;
  specialDayRules?: SpecialDayRules;
  onNavigateToConditions?: (dim?: ConditionDimension) => void;
}

type ActiveTab =
  | 'insights'
  | 'models'
  | 'rebound'
  | 'scale';

export const HighPayoutAnalysis: React.FC<HighPayoutAnalysisProps> = ({
  dailyRecords,
  perspective,
  unit,
  rateLend = 46,
  rateExchange = 52,
  oldEventDays = '',
  onNavigateToConditions,
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
    modelStats,
    scaleStats,
    reboundStat,
    stabilityStat,
    clusterStat,
    insights,
  } = analysisResult;

  // Filtered models for table search
  const filteredModelStats = useMemo(() => {
    if (!searchModelQuery.trim()) return modelStats;
    const q = searchModelQuery.toLowerCase();
    return modelStats.filter((m) => m.modelName.toLowerCase().includes(q));
  }, [modelStats, searchModelQuery]);

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

  const renderStarScore = (score: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((idx) => (
          <Star
            key={idx}
            className={`w-3.5 h-3.5 ${
              idx <= score
                ? 'text-amber-500 fill-amber-400'
                : 'text-slate-300 fill-slate-100'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-6">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300/80 px-2.5 py-0.5 rounded-full text-xs font-black">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              高出率・高設定 特徴抽出
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              出率が高い台の特徴・投入傾向分析
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            出玉率（機械割）の高い台が<strong>どの機種・設置台数規模・前日凹み上げ/据え置き・勝率安定度・末尾・特日</strong>
            に集中して出現しているかを多角的に自動抽出し、ホールの配分癖・狙い目パターンを解剖します。
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

      {/* 6大特徴 自動抽出サマリーインサイトカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 特徴 1: 最頻出機種 */}
        <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/40 rounded-xl border border-amber-200 p-3.5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-[11px] text-amber-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-600" />
                最頻出・看板機
              </span>
              <span className="text-[10px] bg-amber-200/80 px-1 py-0.2 rounded font-black">
                ① 機種
              </span>
            </div>
            {insights.topModel ? (
              <>
                <div className="font-black text-slate-900 text-xs truncate mt-1" title={insights.topModel.modelName}>
                  {insights.topModel.modelName}
                </div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-lg font-black text-amber-700">
                    {insights.topModel.highCount}回
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    ({insights.topModel.rate}%)
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  平均出率: <strong className="text-slate-900">{insights.topModel.avgPayout}%</strong>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400 mt-2">該当機種なし</div>
            )}
          </div>
        </div>

        {/* 特徴 2: 設置台数規模 */}
        <div className="bg-gradient-to-br from-blue-50/80 to-blue-100/40 rounded-xl border border-blue-200 p-3.5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-[11px] text-blue-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-blue-600" />
                狙い目設置規模
              </span>
              <span className="text-[10px] bg-blue-200/80 px-1 py-0.2 rounded font-black">
                ② 規模
              </span>
            </div>
            <div className="font-black text-slate-900 text-xs truncate mt-1">
              {insights.topScale.label}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-lg font-black text-blue-700">
                {insights.topScale.share}%
              </span>
              <span className="text-[10px] text-slate-500 font-bold">
                シェア集中
              </span>
            </div>
            <div className="text-[10px] text-slate-600 mt-1">
              発生率: <strong className="text-slate-900">{insights.topScale.rate}%</strong>
            </div>
          </div>
        </div>

        {/* 特徴 3: 前日相関 (上げ vs 据え置き) */}
        <div className="bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 rounded-xl border border-emerald-200 p-3.5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-[11px] text-emerald-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                前日相関傾向
              </span>
              <span className="text-[10px] bg-emerald-200/80 px-1 py-0.2 rounded font-black">
                ③ 挙動
              </span>
            </div>
            <div className="font-black text-slate-900 text-xs truncate mt-1">
              {reboundStat.tendencyLabel}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-lg font-black text-emerald-700">
                {reboundStat.reboundRate}%
              </span>
              <span className="text-[10px] text-slate-500 font-bold">
                凹み上げ率
              </span>
            </div>
            <div className="text-[10px] text-slate-600 mt-1">
              据え置き率: <strong className="text-slate-900">{reboundStat.retentionRate}%</strong>
            </div>
          </div>
        </div>

        {/* 特徴 4: 集中する末尾 */}
        <div className="bg-gradient-to-br from-indigo-50/80 to-indigo-100/40 rounded-xl border border-indigo-200 p-3.5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-[11px] text-indigo-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-indigo-600" />
                集中台番号末尾
              </span>
              <span className="text-[10px] bg-indigo-200/80 px-1 py-0.2 rounded font-black">
                ④ 末尾
              </span>
            </div>
            {insights.topTail ? (
              <>
                <div className="font-black text-slate-900 text-xs mt-1">
                  {insights.topTail.tailName}
                </div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-lg font-black text-indigo-700">
                    {insights.topTail.rate}%
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    ({insights.topTail.highCount}日達成)
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  平均出率: <strong className="text-slate-900">{insights.topTail.avgPayout}%</strong>
                </div>
                {onNavigateToConditions && (
                  <button
                    type="button"
                    onClick={() => onNavigateToConditions('machineTail')}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline mt-1.5 inline-flex items-center gap-0.5 cursor-pointer text-left"
                  >
                    <span>条件別分析で見る</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-400 mt-2">末尾データなし</div>
            )}
          </div>
        </div>

        {/* 特徴 5: 特日・旧イベ倍率 */}
        <div className="bg-gradient-to-br from-rose-50/80 to-rose-100/40 rounded-xl border border-rose-200 p-3.5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-[11px] text-rose-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-rose-600" />
                特日集中倍率
              </span>
              <span className="text-[10px] bg-rose-200/80 px-1 py-0.2 rounded font-black">
                ⑤ 日程
              </span>
            </div>
            <div className="font-black text-slate-900 text-xs truncate mt-1">
              平日の <span className="text-rose-700">{insights.eventDayMultiplier}倍</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-lg font-black text-rose-700">
                {insights.eventDayHighRate}%
              </span>
              <span className="text-[10px] text-slate-500 font-bold">
                特日出現率
              </span>
            </div>
            <div className="text-[10px] text-slate-600 mt-1">
              通常日: <strong className="text-slate-900">{insights.normalDayHighRate}%</strong>
            </div>
            {onNavigateToConditions && (
              <button
                type="button"
                onClick={() => onNavigateToConditions('special')}
                className="text-[10px] text-rose-600 hover:text-rose-800 font-bold underline mt-1.5 inline-flex items-center gap-0.5 cursor-pointer text-left"
              >
                <span>条件別分析で見る</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 特徴 6: 稼働G数・粘り確信度 */}
        <div className="bg-gradient-to-br from-purple-50/80 to-purple-100/40 rounded-xl border border-purple-200 p-3.5 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between text-[11px] text-purple-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                確信稼働G数
              </span>
              <span className="text-[10px] bg-purple-200/80 px-1 py-0.2 rounded font-black">
                ⑥ 稼働
              </span>
            </div>
            <div className="font-black text-slate-900 text-xs truncate mt-1">
              平均 {insights.gamesComparison.highAvgGames.toLocaleString()} G
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-lg font-black text-purple-700">
                +{insights.gamesComparison.difference.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 font-bold">
                通常差G
              </span>
            </div>
            <div className="text-[10px] text-slate-600 mt-1">
              通常平均: <strong className="text-slate-900">{insights.gamesComparison.normalAvgGames.toLocaleString()}G</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { id: 'insights' as const, label: '総合特徴・黄金抽出カルテ', icon: Award },
          { id: 'models' as const, label: `機種カテゴリ別・機種別 (${modelStats.length})`, icon: Trophy },
          { id: 'rebound' as const, label: '投入形態 (前日相関: 上げ vs 据え置き)', icon: RefreshCw },
          { id: 'scale' as const, label: '台数規模別特徴 (多台数/中規模/バラ)', icon: Scale },
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

      {/* Integration Banner to ConditionAnalysis */}
      <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-xl text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>特日vs通常日・曜日別・末尾別の高出率台割合</strong>は、「条件別分析」（指標: 高出率台の率）に統合されました。
          </span>
        </div>
        {onNavigateToConditions && (
          <button
            type="button"
            onClick={() => onNavigateToConditions('dow')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <span>条件別に詳しく見る</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tab Content 1: 総合特徴・黄金法則カルテ */}
      {activeTab === 'insights' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* ホール高出率台 狙い目診断カルテ (Hall Scorecard & Golden Rules) */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded uppercase">
                    AI Pattern Extraction
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    高出率台の黄金抽出カルテ（ホールの配分癖 6大原則）
                  </h3>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  蓄積された全営業日の実績データから、高出率台（出率{minPayoutRate}%以上）がどのような法則性で投入されているかを自動抽出した実践診断書です。
                </p>
              </div>

              {/* 総合スコアレーダー風サマリー */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                <div className="px-2">
                  <div className="text-[10px] text-slate-400">主力集中度</div>
                  <div className="text-xs font-bold text-amber-400 mt-0.5">
                    {renderStarScore(insights.scorecard.mainMachineFocusScore)}
                  </div>
                </div>
                <div className="px-2">
                  <div className="text-[10px] text-slate-400">末尾偏向</div>
                  <div className="text-xs font-bold text-indigo-400 mt-0.5">
                    {renderStarScore(insights.scorecard.tailBiasScore)}
                  </div>
                </div>
                <div className="px-2">
                  <div className="text-[10px] text-slate-400">特日依存度</div>
                  <div className="text-xs font-bold text-rose-400 mt-0.5">
                    {renderStarScore(insights.scorecard.eventDayDependenceScore)}
                  </div>
                </div>
                <div className="px-2">
                  <div className="text-[10px] text-slate-400">上げ狙い度</div>
                  <div className="text-xs font-bold text-emerald-400 mt-0.5">
                    {renderStarScore(insights.scorecard.reboundAimingScore)}
                  </div>
                </div>
                <div className="px-2 col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-slate-400">確信粘り度</div>
                  <div className="text-xs font-bold text-purple-400 mt-0.5">
                    {renderStarScore(insights.scorecard.enduranceConvictionScore)}
                  </div>
                </div>
              </div>
            </div>

            {/* 6大黄金法則カードグリッド */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.scorecard.goldenRules.map((rule) => (
                <div
                  key={rule.ruleNumber}
                  className="bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-3.5 space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-amber-400 flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                        {rule.ruleNumber}
                      </span>
                      {rule.title}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${rule.badgeClass}`}>
                      {rule.badgeText}
                    </span>
                  </div>

                  <div className="font-black text-white text-xs sm:text-sm">
                    {rule.highlight}
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {rule.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

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

          {/* 並び・全台系・複数機種一斉投入日サマリー */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                投入形態の特徴（全台系・並び集中投入 vs 単品散らし投入）
              </h3>
              <span className="text-xs font-bold bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">
                判定: {clusterStat.clusterTendencyLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="text-slate-500 font-bold">3機種以上同時高出率 (お祭り日)</div>
                <div className="text-xl font-black text-indigo-700">
                  {clusterStat.allStarDaysCount}日 ({clusterStat.allStarDaysRate}%)
                </div>
                <p className="text-[11px] text-slate-500">
                  ホール全体で全台系や塊仕掛けが複数走る還元日
                </p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="text-slate-500 font-bold">2機種同時高出率 (ペア投入日)</div>
                <div className="text-xl font-black text-blue-700">
                  {clusterStat.pairDaysCount}日 ({clusterStat.pairDaysRate}%)
                </div>
                <p className="text-[11px] text-slate-500">
                  メイン機＋ジャグラー等、王道の組み合わせ投入
                </p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="text-slate-500 font-bold">1機種のみ高出率 (単品散らし日)</div>
                <div className="text-xl font-black text-slate-700">
                  {clusterStat.isolatedDaysCount}日 ({clusterStat.isolatedDaysRate}%)
                </div>
                <p className="text-[11px] text-slate-500">
                  通常営業日のピンポイント投入や日替わり配分
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: 【新設】台数規模別特徴 */}
      {activeTab === 'scale' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 text-xs text-blue-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-sm">
              <Scale className="w-4 h-4 text-blue-600" />
              設置台数規模（多台数主力 vs 中規模 vs 少数台バラエティ）別の特徴分析
            </div>
            <p className="text-blue-900 leading-relaxed">
              ホールが高設定・高出率台を「どこに優先配分しているか」を解明します。10台以上の主力看板機を固める店舗、4〜9台の中規模機を全台系にする店舗、少数台・バラエティに単品を忍ばせる店舗など、ホールの設置規模別の配分ポリシーが一目瞭然です。
            </p>
          </div>

          {/* 3大スケール比較カード */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scaleStats.map((scale) => {
              const isTop = scale.scaleType === insights.topScale.scaleType;
              let borderClass = 'border-slate-200';
              let badgeBg = 'bg-slate-100 text-slate-700';

              if (scale.scaleType === 'large') {
                borderClass = isTop ? 'border-amber-400 ring-2 ring-amber-300' : 'border-amber-200';
                badgeBg = 'bg-amber-100 text-amber-900';
              } else if (scale.scaleType === 'medium') {
                borderClass = isTop ? 'border-blue-400 ring-2 ring-blue-300' : 'border-blue-200';
                badgeBg = 'bg-blue-100 text-blue-900';
              } else {
                borderClass = isTop ? 'border-emerald-400 ring-2 ring-emerald-300' : 'border-emerald-200';
                badgeBg = 'bg-emerald-100 text-emerald-900';
              }

              return (
                <div
                  key={scale.scaleType}
                  className={`bg-white rounded-xl p-4 border ${borderClass} shadow-2xs flex flex-col justify-between space-y-4`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-xs font-black ${badgeBg}`}>
                        {scale.label}
                      </span>
                      {isTop && (
                        <span className="text-[10px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Trophy className="w-3 h-3" />
                          最優先配分
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 leading-normal">
                      {scale.description}
                    </p>

                    <div className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100 mt-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-600 font-bold">高出率シェア:</span>
                        <span className="text-xl font-black text-slate-900">
                          {scale.shareOfHighPayout}%
                          <span className="text-xs font-normal text-slate-500 ml-1">
                            ({scale.highPayoutCount}件)
                          </span>
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600">規模内 発生率:</span>
                        <strong className="text-amber-700">{scale.highPayoutRate}%</strong>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600">平均出玉率:</span>
                        <strong className="text-emerald-700">{scale.avgPayoutRate}%</strong>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600">平均差枚数:</span>
                        <strong className="text-slate-900">{formatProfitRaw(scale.avgDiffCoins)}</strong>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600">平均稼働G数:</span>
                        <span className="font-mono text-slate-800">{scale.avgGames.toLocaleString()} G</span>
                      </div>

                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600">平均勝率:</span>
                        <strong className="text-blue-700">{scale.winRate}%</strong>
                      </div>
                    </div>
                  </div>

                  {/* Top models in this scale */}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-amber-500" />
                      代表的な高出率機種:
                    </div>
                    {scale.topModels.length === 0 ? (
                      <div className="text-[11px] text-slate-400">該当機種なし</div>
                    ) : (
                      <div className="space-y-1">
                        {scale.topModels.map((m, idx) => (
                          <div
                            key={m.modelName}
                            className="flex items-center justify-between text-xs bg-slate-50 px-2 py-1 rounded"
                          >
                            <span className="font-bold text-slate-800 truncate" title={m.modelName}>
                              {idx + 1}. {m.modelName}
                            </span>
                            <span className="font-mono font-bold text-amber-700 shrink-0 ml-1">
                              {m.count}回
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bar Chart: 高出率台数シェアと発生率の比較 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              台数規模別の高出率台数シェア(%) & 出現率(%) 比較グラフ
            </h4>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scaleStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as MachineScaleStat;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs shadow-lg space-y-1">
                          <div className="font-bold text-amber-400">{d.label}</div>
                          <div>高出率台シェア: <strong>{d.shareOfHighPayout}%</strong> ({d.highPayoutCount}件)</div>
                          <div>規模内出現率: <strong>{d.highPayoutRate}%</strong> ({d.highPayoutCount}/{d.totalEvaluated}台次)</div>
                          <div>平均出玉率: <strong>{d.avgPayoutRate}%</strong></div>
                          <div>平均差枚: <strong>{formatProfitRaw(d.avgDiffCoins)}</strong></div>
                          <div>勝率: <strong>{d.winRate}%</strong></div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="shareOfHighPayout" fill="#3b82f6" name="高出率シェア(%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="highPayoutRate" fill="#f59e0b" name="規模内出現率(%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: 【新設】前日相関 (上げ vs 据え置き) */}
      {activeTab === 'rebound' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-sm">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
              前日データ相関（凹み台の「上げ」狙い vs 好調台の「据え置き」傾向）
            </div>
            <p className="text-emerald-900 leading-relaxed">
              当日高出率（出率{minPayoutRate}%以上）を達成した機種が、<strong>前日の営業においてマイナス差枚（凹み）だったか、プラス差枚（好調）だったか</strong>を追跡。ホールの設定変更癖（凹みを上げる店舗なのか、高設定を据え置く店舗なのか）を暴き出します。
            </p>
          </div>

          {/* 上げ vs 据え置き 比較ダッシュボード */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 上げ狙い (前日マイナスからの大逆転) */}
            <div className="bg-white rounded-xl p-4 border border-emerald-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  前日凹み台の「上げ」投入
                </span>
                <span className="text-xl font-black text-emerald-700">
                  {reboundStat.reboundRate}%
                </span>
              </div>

              <div className="text-xs text-slate-500">
                前日マイナス差枚だった機種が、翌日高出率条件をクリアした割合
              </div>

              <div className="bg-emerald-50/50 rounded-lg p-3 space-y-2 border border-emerald-100 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">該当件数:</span>
                  <strong className="text-emerald-900">{reboundStat.reboundCount}件</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">上げ時 平均出玉率:</span>
                  <strong className="text-emerald-700">{reboundStat.reboundAvgPayout}%</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">上げ時 平均差枚:</span>
                  <strong className="text-slate-900">{formatProfitRaw(reboundStat.reboundAvgDiff)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">上げ時 平均稼働:</span>
                  <span className="font-mono text-slate-800">{reboundStat.reboundAvgGames.toLocaleString()} G</span>
                </div>
              </div>
            </div>

            {/* 据え置き (前日プラスからの連日好調) */}
            <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  前日好調台の「据え置き」投入
                </span>
                <span className="text-xl font-black text-blue-700">
                  {reboundStat.retentionRate}%
                </span>
              </div>

              <div className="text-xs text-slate-500">
                前日もプラス差枚だった機種が、翌日も続けて高出率条件をクリアした割合
              </div>

              <div className="bg-blue-50/50 rounded-lg p-3 space-y-2 border border-blue-100 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">該当件数:</span>
                  <strong className="text-blue-900">{reboundStat.retentionCount}件</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">据え置き時 平均出玉率:</span>
                  <strong className="text-blue-700">{reboundStat.retentionAvgPayout}%</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">据え置き時 平均差枚:</span>
                  <strong className="text-slate-900">{formatProfitRaw(reboundStat.retentionAvgDiff)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">据え置き時 平均稼働:</span>
                  <span className="font-mono text-slate-800">{reboundStat.retentionAvgGames.toLocaleString()} G</span>
                </div>
              </div>
            </div>
          </div>

          {/* ビジュアルプログレスバー & 立ち回りアドバイス */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-emerald-800">凹み上げ投入 ({reboundStat.reboundRate}%)</span>
              <span className="text-blue-800">好調据え置き ({reboundStat.retentionRate}%)</span>
            </div>

            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${reboundStat.reboundRate}%` }}
                title={`上げ ${reboundStat.reboundRate}%`}
              />
              <div
                className="bg-blue-500 h-full"
                style={{ width: `${reboundStat.retentionRate}%` }}
                title={`据え置き ${reboundStat.retentionRate}%`}
              />
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                立ち回りアドバイス:
              </div>
              <p>{reboundStat.tendencyDescription}</p>
            </div>
          </div>

          {/* 直近の「前日差枚 → 翌日高出率」サンプル一覧 */}
          {reboundStat.recentPairs.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>直近の上げ・据え置き実例ペア一覧</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  （前日データ追跡可能な直近{reboundStat.recentPairs.length}件）
                </span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">日付</th>
                    <th className="py-2 px-3">機種名</th>
                    <th className="py-2 px-3 text-center">判定</th>
                    <th className="py-2 px-3 text-right">前日差枚</th>
                    <th className="py-2 px-3 text-right">前日出率</th>
                    <th className="py-2 px-3 text-right">当日差枚</th>
                    <th className="py-2 px-3 text-right">当日出玉率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reboundStat.recentPairs.map((pair, idx) => (
                    <tr key={`${pair.date}-${pair.modelName}-${idx}`} className="hover:bg-slate-50 bg-white">
                      <td className="py-2 px-3 font-mono font-medium text-slate-900">{pair.date}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{pair.modelName}</td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pair.type === 'rebound'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {pair.type === 'rebound' ? '上げ' : '据え置き'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {formatProfitRaw(pair.prevDiff)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        {pair.prevPayout}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatProfitRaw(pair.currentDiff)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-amber-700">
                        {pair.currentPayout}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}



      {/* Tab Content 5: 機種別特徴ランキング */}
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
                    <th className="py-2.5 px-3 text-center">設置規模</th>
                    <th className="py-2.5 px-3 text-right">登場日数</th>
                    <th className="py-2.5 px-3 text-right">高出率回数</th>
                    <th className="py-2.5 px-3 text-right">高出率発生率</th>
                    <th className="py-2.5 px-3 text-right">高出率時 平均出率</th>
                    <th className="py-2.5 px-3 text-right">高出率時 平均差枚</th>
                    <th className="py-2.5 px-3 text-right">勝率</th>
                    <th className="py-2.5 px-3 text-center">安定タイプ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredModelStats.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400 text-xs">
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
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {model.scaleType === 'large' ? '多台数' : model.scaleType === 'medium' ? '中規模' : '少数'}
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
                              <div className="w-10 bg-slate-200 h-1 rounded-full overflow-hidden">
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
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {model.winRateWhenHigh !== null ? (
                              <span className="text-emerald-700">{model.winRateWhenHigh}%</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {model.highPayoutCount > 0 ? (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  model.quadrant === 'stable_winner'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : model.quadrant === 'balanced_high'
                                    ? 'bg-blue-100 text-blue-800'
                                    : model.quadrant === 'volatile_explosive'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {model.quadrant === 'stable_winner'
                                  ? '超安定'
                                  : model.quadrant === 'balanced_high'
                                  ? 'バランス'
                                  : model.quadrant === 'volatile_explosive'
                                  ? '荒波一撃'
                                  : '検証中'}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
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
    </section>
  );
};
