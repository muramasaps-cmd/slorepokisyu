import React, { useState, useMemo } from 'react';
import { DailyRecord, SpecialDayRules } from '../data/types';
import {
  analyzeSpecialDayPatterns,
  MonthPattern,
  DayTypeStat,
  SpecialDayEvent,
} from '../utils/specialDayPatterns';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import {
  Sparkles,
  Flame,
  Target,
  ShieldAlert,
  ArrowRight,
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronRight,
} from 'lucide-react';

interface SpecialDayPatternsProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: 'yen' | 'coins' | 'avgDiff' | 'payoutRate';
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
  onSelectMonth?: (yearMonth: string) => void;
}

export const SpecialDayPatterns: React.FC<SpecialDayPatternsProps> = ({
  dailyRecords,
  perspective,
  unit,
  specialDayRules,
  oldEventDays,
  onSelectMonth,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'all_win' | 'revenge' | 'with_loss'>('all');
  const [activeTab, setActiveTab] = useState<'ranking' | 'monthly' | 'traps'>('ranking');

  const patternData = useMemo(() => {
    return analyzeSpecialDayPatterns(dailyRecords, specialDayRules, oldEventDays);
  }, [dailyRecords, specialDayRules, oldEventDays]);

  // Filtered month patterns
  const filteredMonths = useMemo(() => {
    return patternData.monthPatterns.filter((mp) => {
      if (selectedFilter === 'all') return true;
      if (selectedFilter === 'all_win') return mp.classification === 'all_win';
      if (selectedFilter === 'revenge') return mp.classification === 'd11_loss_d22_win';
      if (selectedFilter === 'with_loss') return mp.lossCount > 0;
      return true;
    });
  }, [patternData.monthPatterns, selectedFilter]);

  const formatProfit = (hallYen: number, playerYen: number, totalDiff: number, avgDiff: number) => {
    if (perspective === 'hall') {
      if (unit === 'yen') return formatYen(hallYen);
      if (unit === 'coins') return formatCoins(-totalDiff);
      return `${-avgDiff > 0 ? `+${-avgDiff}` : -avgDiff}枚/台`;
    } else {
      if (unit === 'yen') return formatYen(playerYen);
      if (unit === 'coins') return formatCoins(totalDiff);
      return `${avgDiff > 0 ? `+${avgDiff}` : avgDiff}枚/台`;
    }
  };

  const topDay = patternData.topDayStat;
  const correlation = patternData.correlation;
  const trap = patternData.trapAnalysis;
  const ruleDef = patternData.ruleDef;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
                <Target className="w-5 h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                月内特日サイクル分析（出す・回収するパターン）
              </h2>
              <span className="text-[11px] bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                特日連動
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              店舗の特日設定（{ruleDef.targetDaysLabel}）の「放出（出す）」と「回収」の組み合わせパターンや、月内サイクルを全{patternData.totalMonthsAnalyzed}ヶ月のデータから自動分析
            </p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ranking')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeTab === 'ranking'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              特日別出す確率 &amp; 3大傾向
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('monthly')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeTab === 'monthly'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              月別サイクル一覧 ({patternData.monthPatterns.length}ヶ月)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('traps')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeTab === 'traps'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              特日前後の回収罠分析
            </button>
          </div>
        </div>
      </div>

      {/* Main Body depending on Active Tab */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* ================================================================= */}
        {/* TAB 1: RANKING & 3 KEY LAWS */}
        {/* ================================================================= */}
        {activeTab === 'ranking' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* 3 Major Golden Laws Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Law 1 */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black text-[10px]">
                    1
                  </span>
                  <span>看板特日「{topDay.name}」が最強本命</span>
                </div>
                <div className="mt-2 text-2xl font-black text-amber-950 flex items-baseline gap-1.5">
                  <span>放出率 {topDay.winRate}%</span>
                  <span className="text-xs text-amber-700 font-semibold">
                    ({topDay.count}回中{topDay.winCount}回客勝ち)
                  </span>
                </div>
                <p className="mt-1 text-xs text-amber-900/80 leading-relaxed">
                  {topDay.name}は客平均{topDay.avgDiffCoins > 0 ? '+' : ''}{topDay.avgDiffCoins}枚、稼働{formatNumber(topDay.avgGames)}Gと全特日中最高の実績。還元期待度の極めて高い最重要日です。
                </p>
              </div>

              {/* Law 2 */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-[10px]">
                    2
                  </span>
                  <span>
                    {correlation.earlyEventName}回収なら{correlation.lateEventName}リベンジ率{correlation.d11LossThen22WinRate}%
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-indigo-950 flex items-baseline gap-1.5">
                  <span>リベンジ率 {correlation.d11LossThen22WinRate}%</span>
                  <span className="text-xs text-indigo-700 font-semibold">
                    ({correlation.d11LossCount}回中{correlation.d11LossThen22Win}回リベンジ)
                  </span>
                </div>
                <p className="mt-1 text-xs text-indigo-900/80 leading-relaxed">
                  {correlation.earlyEventName}が回収（客マイナス）だった月は、ホールが{correlation.lateEventName}に高確率で埋め合わせの還元を仕掛ける傾向があります。
                </p>
              </div>

              {/* Law 3 */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                  <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-[10px]">
                    3
                  </span>
                  <span>特日の前日・翌日は回収傾向</span>
                </div>
                <div className="mt-2 text-2xl font-black text-rose-950 flex items-baseline gap-1.5">
                  <span>
                    当日 {trap.eventDayAvgDiff > 0 ? '+' : ''}{trap.eventDayAvgDiff}枚 vs 前日 {trap.beforeDayAvgDiff > 0 ? '+' : ''}{trap.beforeDayAvgDiff}枚
                  </span>
                </div>
                <p className="mt-1 text-xs text-rose-900/80 leading-relaxed">
                  特日当日の勝率{trap.eventDayWinRate}%に対し、前日は{trap.beforeDayWinRate}%、翌日は{trap.afterDayWinRate}%。前後は予算調整として回収気味になります。
                </p>
              </div>
            </div>

            {/* Special Day Types Comparison Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500" />
                  特日タイプ別「出す（放出）確率」と平均実績ランキング
                </h3>
                <span className="text-xs text-slate-500">
                  {perspective === 'hall' ? 'ホール視点表示' : '客側視点表示'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {patternData.dayTypeStatsList.map((stat, idx) => {
                  const isTop = stat.isTop;
                  return (
                    <div
                      key={stat.name}
                      className={`p-4 rounded-xl border relative shadow-xs flex flex-col justify-between ${
                        isTop
                          ? 'border-2 border-amber-400 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {isTop && (
                        <div className="absolute -top-3 left-4 bg-amber-500 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                          ★ 最強看板特日 1位
                        </div>
                      )}
                      {!isTop && (
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                          特日 {idx + 1}位
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-900 text-base">
                            {stat.name}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              stat.winRate >= 70
                                ? 'text-emerald-700 bg-emerald-100'
                                : stat.winRate >= 50
                                ? 'text-blue-700 bg-blue-100'
                                : 'text-slate-700 bg-slate-100'
                            }`}
                          >
                            出す確率 {stat.winRate}%
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between p-2 rounded bg-white/90 border border-slate-200/80">
                            <span className="text-slate-600">勝敗内訳:</span>
                            <span className="font-bold text-slate-900">
                              <span className="text-emerald-700">{stat.winCount}回 放出</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="text-rose-600">{stat.lossCount}回 回収</span>
                              <span className="text-slate-400 text-[11px] ml-1">
                                (全{stat.count}回)
                              </span>
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded bg-white/90 border border-slate-200/80">
                            <span className="text-slate-600">
                              {perspective === 'hall' ? 'ホール累計粗利:' : '客側累計収支:'}
                            </span>
                            <span
                              className={`font-black ${
                                (perspective === 'hall' ? stat.totalHallYen : stat.totalPlayerYen) >= 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              {formatProfit(
                                stat.totalHallYen,
                                stat.totalPlayerYen,
                                stat.totalDiffCoins,
                                stat.avgDiffCoins
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded bg-white/90 border border-slate-200/80">
                            <span className="text-slate-600">1台あたり客平均差枚:</span>
                            <span
                              className={`font-black ${
                                stat.avgDiffCoins > 0 ? 'text-blue-700' : 'text-rose-600'
                              }`}
                            >
                              {stat.avgDiffCoins > 0 ? `+${stat.avgDiffCoins}` : stat.avgDiffCoins} 枚/台
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded bg-white/90 border border-slate-200/80">
                            <span className="text-slate-600">平均稼働ゲーム数:</span>
                            <span className="font-bold text-slate-800">
                              {formatNumber(stat.avgGames)} G
                            </span>
                          </div>

                          {stat.payoutRate && (
                            <div className="flex items-center justify-between p-2 rounded bg-white/90 border border-slate-200/80">
                              <span className="text-slate-600">平均機械割 (出玉率):</span>
                              <span
                                className={`font-bold ${
                                  stat.payoutRate >= 100 ? 'text-blue-700' : 'text-slate-700'
                                }`}
                              >
                                {stat.payoutRate}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 text-[11px] text-slate-500">
                        役割: <strong className="text-slate-700">{stat.role || '定期特日'}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Practical Advice Banner */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3 text-xs text-slate-700">
              <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  【実践立ち回りサマリー】この店舗の特日攻略ポイント
                </div>
                <p className="leading-relaxed">
                  店舗ヘッダの特日ルール（<strong>{ruleDef.targetDaysLabel}</strong>）に基づき、
                  最も還元実績が高い日は『<strong>{topDay.name}</strong>（勝率{topDay.winRate}%）』です。
                  {correlation.d11LossCount > 0 && (
                    <>
                      また、月前半の<strong>{correlation.earlyEventName}</strong>が回収だった月は、
                      <strong>{correlation.lateEventName}</strong>でのリベンジ放出率が
                      <strong>{correlation.d11LossThen22WinRate}%</strong>に達するため、
                      前半回収時の後半特日は最優先で狙い目となります。
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: MONTHLY CYCLES TABLE */}
        {/* ================================================================= */}
        {activeTab === 'monthly' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">パターン絞り込み:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('all')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      selectedFilter === 'all'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全月 ({patternData.totalMonthsAnalyzed})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('all_win')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      selectedFilter === 'all_win'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-emerald-700'
                    }`}
                  >
                    🔥 全特日放出月 ({patternData.classificationCounts.all_win})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('revenge')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      selectedFilter === 'revenge'
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'text-slate-600 hover:text-amber-700'
                    }`}
                  >
                    🎯 {correlation.earlyEventName}回収→{correlation.lateEventName}リベンジ月 (
                    {patternData.classificationCounts.d11_loss_d22_win})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('with_loss')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      selectedFilter === 'with_loss'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-rose-700'
                    }`}
                  >
                    ⚠️ 回収あり月 (
                    {patternData.monthPatterns.filter((m) => m.lossCount > 0).length}
                    )
                  </button>
                </div>
              </div>

              <span className="text-xs text-slate-500">
                行をクリックすると各月の日別カレンダー明細を表示
              </span>
            </div>

            {/* Monthly Patterns Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-bold">
                  <tr>
                    <th className="px-3 py-2.5">対象年月</th>
                    <th className="px-3 py-2.5">月内特日サイクルパターン</th>
                    {ruleDef.dayLabels.map((dl, i) => (
                      <th key={dl.label + i} className="px-3 py-2.5 text-center">
                        {i + 1}. {dl.label}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right">特日平均差枚</th>
                    <th className="px-3 py-2.5 text-right">
                      {perspective === 'hall' ? '特日店粗利合計' : '特日客収支合計'}
                    </th>
                    <th className="px-2 py-2.5 text-center">詳細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredMonths.map((m) => {
                    const totalHallProfit = m.events.reduce((acc, e) => acc + e.hallYenProfit, 0);
                    const totalPlayerProfit = m.events.reduce((acc, e) => acc + e.playerYenProfit, 0);

                    return (
                      <tr
                        key={m.yearMonth}
                        onClick={() => onSelectMonth?.(m.yearMonth)}
                        className="hover:bg-amber-50/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap flex items-center gap-1.5">
                          <span>{m.label}</span>
                          <span className="text-[10px] text-slate-400">({m.yearMonth})</span>
                        </td>

                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${m.badgeClass}`}
                          >
                            {m.classification === 'all_win' && <span>🔥</span>}
                            {m.classification === 'd11_loss_d22_win' && <span>🎯</span>}
                            {m.classification === 'all_loss' && <span>⚠️</span>}
                            {m.classificationName}
                          </span>
                        </td>

                        {/* Event Columns according to ruleDef */}
                        {ruleDef.dayLabels.map((dl, i) => {
                          const ev =
                            m.events.find((e) => e.day === dl.day) ||
                            (ruleDef.hasZoro && dl.day === -1
                              ? m.events.find((e) => e.name === '月日ゾロ目')
                              : m.events[i]);

                          return (
                            <td key={dl.label + i} className="px-3 py-2.5 text-center whitespace-nowrap">
                              {ev ? (
                                <div className="inline-flex flex-col items-center">
                                  <span
                                    className={`font-bold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] ${
                                      ev.isWin
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'bg-rose-50 text-rose-600'
                                    }`}
                                  >
                                    {ev.day}日:{' '}
                                    {ev.isWin ? (
                                      <span className="font-extrabold">出 +{ev.avgDiffCoins}枚</span>
                                    ) : (
                                      <span className="font-extrabold">回収 {ev.avgDiffCoins}枚</span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {formatNumber(ev.avgGames)}G
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Avg Diff */}
                        <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                          <span
                            className={m.avgEventDiffCoins > 0 ? 'text-blue-700' : 'text-rose-600'}
                          >
                            {m.avgEventDiffCoins > 0
                              ? `+${m.avgEventDiffCoins}`
                              : m.avgEventDiffCoins}{' '}
                            枚
                          </span>
                        </td>

                        {/* Profit Yen */}
                        <td className="px-3 py-2.5 text-right font-black whitespace-nowrap">
                          <span
                            className={
                              (perspective === 'hall' ? totalHallProfit : totalPlayerProfit) >= 0
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }
                          >
                            {formatProfit(totalHallProfit, totalPlayerProfit, m.totalEventDiffCoins, m.avgEventDiffCoins)}
                          </span>
                        </td>

                        <td className="px-2 py-2.5 text-center text-slate-400 group-hover:text-amber-600 transition-colors">
                          <ChevronRight className="w-4 h-4 inline" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: TRAP ANALYSIS (DAYS BEFORE & AFTER) */}
        {/* ================================================================= */}
        {activeTab === 'traps' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                特日の前日・翌日の回収トラップ（出す前後の調整傾向）
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                ホールは特日に出玉を放出するために、その前日（{trap.beforeDaysLabel}）や翌日（{trap.afterDaysLabel}）に回収や抑制を行っているのか？ 全{patternData.totalMonthsAnalyzed}ヶ月の隣接営業日データを統計検証しました。
              </p>
            </div>

            {/* 3-Bar Comparative Visual */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Day Before */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs text-center flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    特日の前日 ({trap.beforeDaysLabel})
                  </div>
                  <div className="text-base font-bold text-slate-800 mt-1">前日抑制（回収モード）</div>
                </div>

                <div className="my-4 space-y-2">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-xs text-slate-500">客1台あたり平均差枚</div>
                    <div className="text-xl font-extrabold text-slate-700">
                      {trap.beforeDayAvgDiff > 0 ? `+${trap.beforeDayAvgDiff}` : trap.beforeDayAvgDiff} 枚/台
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-slate-500">客勝ち日（放出）確率:</span>
                    <span className="font-bold text-slate-800">
                      {trap.beforeDayWinRate}%
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed text-left">
                  翌日の特日に向けて設定を抑え、店舗全体の利益を確保する傾向が見られます。
                </p>
              </div>

              {/* Event Day */}
              <div className="p-4 rounded-xl border-2 border-emerald-400 bg-emerald-50/50 shadow-xs text-center flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-800">
                    特日当日 ({trap.analyzedDaysLabel})
                  </div>
                  <div className="text-lg font-black text-emerald-950 mt-1">🔥 大放出（還元モード）</div>
                </div>

                <div className="my-4 space-y-2">
                  <div className="p-3 bg-white rounded-lg border border-emerald-200">
                    <div className="text-xs text-slate-500">客1台あたり平均差枚</div>
                    <div className="text-2xl font-black text-blue-700">
                      {trap.eventDayAvgDiff > 0 ? `+${trap.eventDayAvgDiff}` : trap.eventDayAvgDiff} 枚/台
                    </div>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-emerald-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600">客勝ち日（放出）確率:</span>
                    <span className="font-black text-emerald-700">
                      {trap.eventDayWinRate}%
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-emerald-900 leading-relaxed text-left font-medium">
                  店舗が明確に集客と還元を行う看板日。客の勝率・出玉ともに月内で最も跳ね上がります。
                </p>
              </div>

              {/* Day After */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs text-center flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    特日の翌日 ({trap.afterDaysLabel})
                  </div>
                  <div className="text-base font-bold text-slate-800 mt-1">翌日反動（回収モード）</div>
                </div>

                <div className="my-4 space-y-2">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-xs text-slate-500">客1台あたり平均差枚</div>
                    <div className="text-xl font-extrabold text-slate-700">
                      {trap.afterDayAvgDiff > 0 ? `+${trap.afterDayAvgDiff}` : trap.afterDayAvgDiff} 枚/台
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-slate-500">客勝ち日（放出）確率:</span>
                    <span className="font-bold text-slate-800">
                      {trap.afterDayWinRate}%
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed text-left">
                  前日の特日で放出した出玉の回収に回るため、据え置き狙いには十分な注意が必要です。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
