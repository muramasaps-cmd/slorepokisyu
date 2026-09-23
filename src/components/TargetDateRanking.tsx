import React, { useState, useMemo } from 'react';
import { DailyRecord, SpecialDayRules } from '../data/types';
import {
  calculateTargetDateRanking,
  TargetDateForecast,
  ModelTargetScore,
} from '../utils/targetRankingEngine';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { UnitMode } from './Header';
import {
  Target,
  Trophy,
  Calendar,
  Sparkles,
  Flame,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Coins,
  Percent,
  Layers,
  HelpCircle,
  X,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  Lightbulb,
} from 'lucide-react';

interface TargetDateRankingProps {
  targetDate: string;
  setTargetDate: (d: string) => void;
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  rateLend?: number;
  rateExchange?: number;
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
}

type ModelFilterType = 'all' | 'main' | 'smart_slot' | 'juggler_a' | 'small';
type ModelSortType = 'score' | 'diff' | 'winRate' | 'payout' | 'machines';

export const TargetDateRanking: React.FC<TargetDateRankingProps> = ({
  targetDate,
  setTargetDate,
  dailyRecords,
  perspective,
  unit,
  rateLend = 46,
  rateExchange = 52,
  specialDayRules,
  oldEventDays = '',
}) => {
  const [modelFilter, setModelFilter] = useState<ModelFilterType>('all');
  const [modelSort, setModelSort] = useState<ModelSortType>('score');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  // Compute forecast for target date
  const forecast = useMemo<TargetDateForecast | null>(() => {
    if (!targetDate) return null;
    return calculateTargetDateRanking(targetDate, dailyRecords, specialDayRules, oldEventDays);
  }, [targetDate, dailyRecords, specialDayRules, oldEventDays]);

  if (!targetDate || !forecast) {
    return null;
  }

  const isHall = perspective === 'hall';

  // Filter models
  const filteredModels = forecast.modelRankings.filter((m) => {
    if (modelFilter === 'main') return m.totalMachines >= 4;
    if (modelFilter === 'smart_slot') return m.tags.includes('スマスロ');
    if (modelFilter === 'juggler_a') return m.tags.includes('ジャグラー') || m.tags.includes('Aタイプ');
    if (modelFilter === 'small') return m.totalMachines < 4;
    return true;
  });

  // Sort models
  const sortedModels = [...filteredModels].sort((a, b) => {
    if (modelSort === 'diff') return b.expectedDiffCoins - a.expectedDiffCoins;
    if (modelSort === 'winRate') return b.predictedWinRate - a.predictedWinRate;
    if (modelSort === 'payout') return b.predictedPayoutRate - a.predictedPayoutRate;
    if (modelSort === 'machines') return b.totalMachines - a.totalMachines;
    return b.compositeScore - a.compositeScore;
  });

  // Format profit value according to perspective & unit
  const formatProfitValue = (coins: number) => {
    if (unit === 'yen') {
      const yenVal = coins >= 0
        ? Math.round(coins * (1000 / rateExchange))
        : Math.round(coins * (1000 / rateLend));
      const displayYen = isHall ? -yenVal : yenVal;
      return formatYen(displayYen);
    }
    const displayCoins = isHall ? -coins : coins;
    if (unit === 'coins') {
      return formatCoins(displayCoins);
    }
    return `${displayCoins > 0 ? '+' : ''}${displayCoins}枚/台`;
  };

  const getRankBadge = (rank: number, grade: ModelTargetScore['rankGrade']) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-2 py-0.5 rounded text-xs font-black shadow-xs">
          <span>🥇</span>
          <span>1位 ({grade})</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 bg-gradient-to-r from-slate-200 to-slate-300 text-slate-900 px-2 py-0.5 rounded text-xs font-bold shadow-xs">
          <span>🥈</span>
          <span>2位 ({grade})</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-100 to-amber-200 text-amber-950 border border-amber-300 px-2 py-0.5 rounded text-xs font-bold shadow-xs">
          <span>🥉</span>
          <span>3位 ({grade})</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold">
        <span>{rank}位</span>
        <span className="text-[10px] opacity-75">({grade})</span>
      </span>
    );
  };

  const getGradeStyle = (grade: ModelTargetScore['rankGrade']) => {
    switch (grade) {
      case 'S+':
        return 'bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black animate-pulse';
      case 'S':
        return 'bg-amber-400 text-slate-950 font-black';
      case 'A':
        return 'bg-indigo-600 text-white font-bold';
      case 'B':
        return 'bg-blue-600 text-white font-semibold';
      default:
        return 'bg-slate-200 text-slate-700 font-medium';
    }
  };

  return (
    <section
      id="target-date-ranking"
      className="bg-white rounded-2xl border-2 border-indigo-500/80 shadow-lg overflow-hidden transition-all duration-300"
    >
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 border-b border-indigo-500/40">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center flex-wrap gap-2.5 mb-2">
              <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs px-2.5 py-1 rounded-md shadow-sm">
                <Target className="w-4 h-4" />
                攻略狙い日 予測分析
              </span>
              <span className="inline-flex items-center gap-1 bg-indigo-500/30 text-indigo-200 text-xs px-2.5 py-1 rounded-md border border-indigo-400/40">
                <Calendar className="w-3.5 h-3.5 text-indigo-300" />
                対象日: <strong className="text-white ml-0.5">{forecast.targetDate} ({forecast.dayOfWeek})</strong>
                {forecast.isHoliday && <span className="text-rose-300 font-bold ml-1">祝日</span>}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-md font-bold flex items-center gap-1 ${
                forecast.isSpecialDay
                  ? 'bg-rose-500/90 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                {forecast.isSpecialDay ? <Flame className="w-3.5 h-3.5 text-amber-300" /> : null}
                {forecast.specialDayLabel}
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-800/80 text-cyan-300 text-xs px-2 py-1 rounded-md border border-slate-700">
                日付末尾: <strong>末尾 {forecast.dayTail}</strong>
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <span>{forecast.targetDate} の狙い台・おすすめ機種ランキング</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl">
              過去の類似営業日（同種特日・同曜日・同末尾日 計{forecast.matchingHistoricalDaysCount}日間）の全台差枚データから、高設定投入確率・期待差枚・勝率を多角的に算出した予測ランキングです。
            </p>
          </div>

          {/* Quick Date Control in Section Header */}
          <div className="flex items-center gap-2 self-start lg:self-auto bg-slate-800/90 p-2 rounded-xl border border-slate-700">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>変更:</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-slate-900 text-white px-2 py-1 rounded text-xs border border-slate-600 focus:outline-hidden focus:border-amber-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setTargetDate('')}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
              title="狙い日の指定を解除"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hall General Diagnosis Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80">
            <div className="text-[11px] text-slate-400">ホール全体 予想状況</div>
            <div className="text-base sm:text-lg font-black mt-0.5 flex items-center gap-1.5">
              {forecast.expectedHallStatus === '激アツ還元' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <Flame className="w-4 h-4 text-rose-500 animate-bounce" />
                  激アツ還元
                </span>
              )}
              {forecast.expectedHallStatus === '好待遇特日' && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  好待遇特日
                </span>
              )}
              {forecast.expectedHallStatus === '通常営業' && (
                <span className="text-slate-200">通常営業配分</span>
              )}
              {forecast.expectedHallStatus === '回収傾向' && (
                <span className="text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  回収警戒
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {forecast.isSpecialDay ? '特日配分に期待' : '単品ピンポイント'}
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80">
            <div className="text-[11px] text-slate-400">
              {isHall ? '過去同種日 店平均差枚' : '過去同種日 客平均差枚'}
            </div>
            <div className={`text-base sm:text-lg font-black mt-0.5 ${
              forecast.expectedHallAvgDiffCoins > 0
                ? isHall ? 'text-indigo-300' : 'text-blue-400'
                : 'text-rose-400'
            }`}>
              {forecast.expectedHallAvgDiffCoins > 0 ? `+${forecast.expectedHallAvgDiffCoins}` : forecast.expectedHallAvgDiffCoins} 枚/台
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              全体総計平均値
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80">
            <div className="text-[11px] text-slate-400">予想出玉率 (機械割)</div>
            <div className="text-base sm:text-lg font-black text-indigo-300 mt-0.5">
              {forecast.expectedHallPayoutRate.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              勝率 {forecast.expectedHallWinRate}%
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80">
            <div className="text-[11px] text-slate-400">参考集計サンプル数</div>
            <div className="text-base sm:text-lg font-black text-amber-300 mt-0.5">
              {forecast.matchingHistoricalDaysCount} 日分
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {forecast.isSpecialDay ? '同種特日の履歴' : '同曜日の履歴'}
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Briefing (立ち回り指南) */}
      <div className="p-4 sm:p-5 bg-indigo-50/70 border-b border-indigo-100 flex flex-col md:flex-row gap-4 items-stretch">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <span>【{forecast.targetDate} 立ち回り戦略サマリー】</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            {forecast.tacticalAdvice.summary}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-indigo-200 shadow-2xs">
              <span className="font-bold text-emerald-800 block text-[11px] mb-0.5">① 朝イチ最優先</span>
              <span className="text-slate-700 text-[11px]">{forecast.tacticalAdvice.morningPriority}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-indigo-200 shadow-2xs">
              <span className="font-bold text-blue-800 block text-[11px] mb-0.5">② 対抗・後ヅモ</span>
              <span className="text-slate-700 text-[11px]">{forecast.tacticalAdvice.secondOption}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-indigo-200 shadow-2xs">
              <span className="font-bold text-purple-800 block text-[11px] mb-0.5">③ 末尾戦略</span>
              <span className="text-slate-700 text-[11px]">{forecast.tacticalAdvice.tailStrategy}</span>
            </div>
          </div>
        </div>

        {/* Top 3 Target Tails Widget */}
        <div className="w-full md:w-80 bg-white p-3.5 rounded-xl border border-indigo-200 shadow-xs flex flex-col justify-between shrink-0">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                狙い台番末尾 TOP 3
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                (全10末尾中)
              </span>
            </div>
            <div className="space-y-1.5">
              {forecast.tailRankings.slice(0, 3).map((tail, idx) => (
                <div
                  key={`top-tail-${tail.tailName}`}
                  className={`flex items-center justify-between p-1.5 px-2.5 rounded-lg text-xs ${
                    idx === 0
                      ? 'bg-amber-50 border border-amber-300 font-bold text-amber-950'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                      idx === 0 ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-700'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="font-bold">{tail.tailName}</span>
                    {tail.isDateTailMatch && (
                      <span className="bg-rose-500 text-white text-[9px] px-1 py-0.2 rounded font-black">
                        日付一致
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${tail.expectedDiffCoins > 0 ? 'text-indigo-600' : 'text-slate-600'}`}>
                      {tail.expectedDiffCoins > 0 ? `+${tail.expectedDiffCoins}` : tail.expectedDiffCoins}枚
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1.5">
                      勝率{tail.winRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 text-right mt-2">
            ※ 狙い機種と好調末尾が重複する台番が最有力
          </div>
        </div>
      </div>

      {/* Model Filter & Sort Bar */}
      <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-bold text-slate-600 mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            機種絞り込み:
          </span>
          <button
            type="button"
            onClick={() => setModelFilter('all')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              modelFilter === 'all'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            全機種 ({forecast.modelRankings.length})
          </button>
          <button
            type="button"
            onClick={() => setModelFilter('main')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              modelFilter === 'main'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            多台数メイン (4台以上)
          </button>
          <button
            type="button"
            onClick={() => setModelFilter('smart_slot')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              modelFilter === 'smart_slot'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            スマスロ限定
          </button>
          <button
            type="button"
            onClick={() => setModelFilter('juggler_a')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              modelFilter === 'juggler_a'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            ジャグラー / Aタイプ
          </button>
          <button
            type="button"
            onClick={() => setModelFilter('small')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              modelFilter === 'small'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            少台数・バラエティ
          </button>
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-slate-500">並び順:</span>
          <select
            value={modelSort}
            onChange={(e) => setModelSort(e.target.value as ModelSortType)}
            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 font-semibold focus:outline-hidden focus:border-indigo-500"
          >
            <option value="score">総合期待スコア順</option>
            <option value="diff">予測期待差枚 順</option>
            <option value="winRate">予測勝率 順</option>
            <option value="payout">予測機械割 順</option>
            <option value="machines">設置台数 順</option>
          </select>
        </div>
      </div>

      {/* Model Recommendations Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left text-slate-700">
          <thead className="text-[11px] text-slate-500 bg-slate-100/80 uppercase border-b border-slate-200">
            <tr>
              <th className="px-3 py-3 font-bold text-center w-12">詳細</th>
              <th className="px-3 py-3 font-bold text-center">順位 / 評価</th>
              <th className="px-4 py-3 font-bold">機種名 / 設置台数</th>
              <th className="px-3 py-3 font-bold text-right">
                {isHall ? '店平均期待差枚' : '客平均期待差枚'}
              </th>
              <th className="px-3 py-3 font-bold text-right">予想機械割</th>
              <th className="px-3 py-3 font-bold text-right">予想勝率</th>
              <th className="px-4 py-3 font-bold">過去同種日の実績</th>
              <th className="px-4 py-3 font-bold">立ち回り・推奨根拠</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedModels.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  該当する機種データがありません。絞り込み条件を変更してください。
                </td>
              </tr>
            ) : (
              sortedModels.map((model) => {
                const isExpanded = expandedModel === model.modelName;
                return (
                  <React.Fragment key={`target-model-${model.modelName}`}>
                    <tr
                      className={`hover:bg-indigo-50/40 transition-colors ${
                        model.rank <= 3 ? 'bg-amber-50/20 font-medium' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedModel(isExpanded ? null : model.modelName)}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            isExpanded ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200 text-slate-500'
                          }`}
                          title="同種日での過去履歴を表示"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {getRankBadge(model.rank, model.rankGrade)}
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                          <span>{model.modelName}</span>
                          {model.allHighDaysCount > 0 && (
                            <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold px-1.5 py-0.2 rounded">
                              全台系実績{model.allHighDaysCount}回
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            設置 {model.totalMachines}台
                          </span>
                          {model.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                tag === 'スマスロ'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : tag.includes('ジャグラー')
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={`px-3 py-3 text-right font-black whitespace-nowrap ${
                        model.expectedDiffCoins > 0
                          ? isHall ? 'text-indigo-600' : 'text-blue-600'
                          : 'text-rose-600'
                      }`}>
                        {formatProfitValue(model.expectedDiffCoins)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">
                        {model.predictedPayoutRate.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                        {model.predictedWinRate}%
                      </td>
                      <td className="px-4 py-3 min-w-[170px]">
                        {model.matchingDaysCount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-800 text-[11px]">
                              過去{model.matchingDaysCount}回中 平均
                              <span className={model.matchingAvgDiffCoins > 0 ? 'text-blue-600 ml-1' : 'text-rose-600 ml-1'}>
                                {model.matchingAvgDiffCoins > 0 ? `+${model.matchingAvgDiffCoins}` : model.matchingAvgDiffCoins}枚
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              同種日勝率: {model.matchingWinRate}% (サンプル{model.sampleDays}日)
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">特日履歴少 (全体参照)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 min-w-[200px] leading-snug">
                        {model.tacticalReason}
                      </td>
                    </tr>

                    {/* Historical Samples Dropdown */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-indigo-50/50 p-4 border-y border-indigo-100">
                          <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-indigo-900">
                              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                              【{model.modelName}】類似営業日での過去実績一覧 ({model.sampleRecords.length}日)
                            </span>
                            <span className="text-[11px] text-slate-500 font-normal">
                              ※ 過去の同種特日・同曜日における実績データ
                            </span>
                          </div>

                          {model.sampleRecords.length === 0 ? (
                            <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-400 text-center">
                              類似日での過去個別データはありません
                            </div>
                          ) : (
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                              <table className="w-full text-[11px] text-left">
                                <thead className="bg-slate-100 text-slate-600 sticky top-0">
                                  <tr>
                                    <th className="px-3 py-1.5">日付</th>
                                    <th className="px-2 py-1.5">曜日</th>
                                    <th className="px-2 py-1.5">種別</th>
                                    <th className="px-3 py-1.5 text-right">台平均差枚</th>
                                    <th className="px-3 py-1.5 text-right">勝率</th>
                                    <th className="px-3 py-1.5 text-right">稼働G数</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {model.sampleRecords.map((rec) => (
                                    <tr key={`${model.modelName}-${rec.date}`} className="hover:bg-slate-50">
                                      <td className="px-3 py-1 font-mono font-bold text-slate-800">{rec.date}</td>
                                      <td className="px-2 py-1 text-slate-600">{rec.dayOfWeek}</td>
                                      <td className="px-2 py-1">
                                        {rec.isOldEventDay ? (
                                          <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded text-[10px]">
                                            特日
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[10px]">通常</span>
                                        )}
                                      </td>
                                      <td className={`px-3 py-1 text-right font-bold ${
                                        rec.avgDiffCoins > 0 ? 'text-blue-600' : 'text-rose-600'
                                      }`}>
                                        {rec.avgDiffCoins > 0 ? `+${rec.avgDiffCoins}` : rec.avgDiffCoins}枚
                                      </td>
                                      <td className="px-3 py-1 text-right text-slate-700">
                                        {rec.winRate !== null ? `${rec.winRate}%` : '-'}
                                      </td>
                                      <td className="px-3 py-1 text-right text-slate-600">
                                        {formatNumber(rec.avgGames)}G
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Disclaimer */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>
          ※ 過去の出玉実績・機械割・投入傾向をアルゴリズム集計した統計予測です。実際の配分や勝敗を保証するものではありません。
        </span>
        <button
          type="button"
          onClick={() => setTargetDate('')}
          className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 self-end sm:self-auto cursor-pointer"
        >
          <span>狙い日指定を解除して閉じる</span>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
};
