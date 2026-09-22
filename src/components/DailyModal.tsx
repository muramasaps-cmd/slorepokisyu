import React, { useState, useMemo } from 'react';
import { DailyRecord, MonthlyStat } from '../data/types';
import { ProfitModelType } from './Header';
import { formatYen, formatYenExact, formatCoinsExact, formatNumber } from '../utils/formatters';
import { analyzeSpecialDayPatterns } from '../utils/specialDayPatterns';
import { X, Calendar, Flame, Sparkles, Filter, CheckCircle2, Zap, Target } from 'lucide-react';

interface DailyModalProps {
  yearMonth: string | null;
  monthlyStats: MonthlyStat[];
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: 'yen' | 'coins' | 'avgDiff';
  profitModel?: any;
  onClose: () => void;
}

export const DailyModal: React.FC<DailyModalProps> = ({
  yearMonth,
  monthlyStats,
  dailyRecords,
  perspective,
  unit,
  profitModel,
  onClose,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'eventOnly' | 'winOnly' | 'lossOnly'>('all');

  const monthSummary = useMemo(() => {
    return monthlyStats.find((m) => m.yearMonth === yearMonth);
  }, [monthlyStats, yearMonth]);

  const monthPattern = useMemo(() => {
    if (!yearMonth) return null;
    const records = dailyRecords.filter((d) => d.yearMonth === yearMonth);
    const { monthPatterns } = analyzeSpecialDayPatterns(records);
    return monthPatterns.find((mp) => mp.yearMonth === yearMonth) || null;
  }, [dailyRecords, yearMonth]);

  const monthRecords = useMemo(() => {
    if (!yearMonth) return [];
    let records = dailyRecords.filter((d) => d.yearMonth === yearMonth);

    // Sort descending by date
    records = [...records].sort((a, b) => b.date.localeCompare(a.date));

    if (filterType === 'eventOnly') {
      return records.filter((r) => r.isOldEventDay);
    }
    if (filterType === 'winOnly') {
      return records.filter((r) => (perspective === 'hall' ? r.hallCoinProfit >= 0 : r.playerCoinProfit >= 0));
    }
    if (filterType === 'lossOnly') {
      return records.filter((r) => (perspective === 'hall' ? r.hallCoinProfit < 0 : r.playerCoinProfit < 0));
    }
    return records;
  }, [dailyRecords, yearMonth, filterType, perspective]);

  if (!yearMonth || !monthSummary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-extrabold text-lg sm:text-xl flex items-center gap-1.5">
                <Calendar className="w-5 h-5" />
                {monthSummary.label} 日別スロットデータ詳細
              </span>
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                全{monthSummary.daysCount}日間
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mt-1.5">
              <span>
                {perspective === 'hall' ? 'ホール粗利(G数連動): ' : '収支(G数連動): '}
                <span
                  className={`font-extrabold ${
                    (perspective === 'hall' ? monthSummary.gModelHallProfit : monthSummary.gModelPlayerProfit) >= 0
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {formatYenExact(perspective === 'hall' ? monthSummary.gModelHallProfit : monthSummary.gModelPlayerProfit)}
                </span>
                <span className="text-slate-400 text-[11px] ml-1.5 font-normal">
                  (1台: {formatYen(Math.round((perspective === 'hall' ? monthSummary.gModelHallProfit : monthSummary.gModelPlayerProfit) / (monthSummary.avgMachines || 587)))}/月, {formatYen(Math.round((perspective === 'hall' ? monthSummary.gModelHallProfit : monthSummary.gModelPlayerProfit) / ((monthSummary.avgMachines || 587) * (monthSummary.daysCount || 1))))}/日)
                </span>
              </span>
              <span>•</span>
              <span>
                機械割:{' '}
                <span className="font-semibold text-slate-200">
                  {monthSummary.avgPayoutRate.toFixed(2)}%
                </span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Special Day Pattern Banner */}
        {monthPattern && (
          <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border-b border-amber-200/80 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="p-1.5 bg-amber-500 text-white rounded-lg shadow-xs shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">特日サイクル傾向:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-xs border ${monthPattern.badgeClass}`}
                  >
                    {monthPattern.classificationName}
                  </span>
                </div>
                <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed">
                  {monthPattern.explanation}
                </p>
              </div>
            </div>

            {/* Special day breakdown pills */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {monthPattern.events.map((ev) => (
                <div
                  key={ev.name}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1.5 ${
                    ev.isWin
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border-rose-200'
                  }`}
                >
                  <span className="font-bold">{ev.name}</span>
                  <span
                    className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                      ev.isWin ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                    }`}
                  >
                    {ev.status}
                  </span>
                  <span className="text-[11px] font-semibold">
                    {ev.avgDiffCoins > 0 ? `+${ev.avgDiffCoins}` : ev.avgDiffCoins}枚
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Pills Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">絞り込み:</span>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterType === 'all'
                  ? 'bg-slate-800 text-white font-bold'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              すべて ({monthSummary.daysCount}日)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('eventOnly')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                filterType === 'eventOnly'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Flame className="w-3 h-3 text-amber-600" />
              旧イベ日のみ ({monthSummary.eventDaysCount}日)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('winOnly')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterType === 'winOnly'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {perspective === 'hall' ? '店黒字日' : '客勝ち日'}
            </button>
            <button
              type="button"
              onClick={() => setFilterType('lossOnly')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterType === 'lossOnly'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {perspective === 'hall' ? '店赤字(還元)日' : '客負け日'}
            </button>
          </div>
          <span className="text-[11px] text-slate-400">表示件数: {monthRecords.length}件</span>
        </div>

        {/* Modal Body / Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="text-slate-500 border-b border-slate-200 uppercase font-bold text-xs sticky top-0 bg-white">
              <tr>
                <th className="py-2.5 px-3">日付</th>
                <th className="py-2.5 px-3">区分</th>
                <th className="py-2.5 px-3 text-right">設置台数</th>
                <th className="py-2.5 px-3 text-right">客平均差枚</th>
                <th className="py-2.5 px-3 text-right text-indigo-700">
                  {perspective === 'hall' ? 'ホール粗利(G数連動)' : '収支(G数連動)'}
                </th>
                <th className="py-2.5 px-3 text-right">平均G数</th>
                <th className="py-2.5 px-3 text-right">出玉率</th>
                <th className="py-2.5 px-3 text-right">勝率 (勝/総台数)</th>
                <th className="py-2.5 px-3">優秀ピックアップ機種</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthRecords.map((d) => {
                const isSun = d.dayOfWeek === '日';
                const isSat = d.dayOfWeek === '土';
                const diffVal = perspective === 'hall' ? d.hallYenProfit : d.playerYenProfit;
                const gVal = perspective === 'hall' ? d.gModelHallProfit : d.gModelPlayerProfit;

                return (
                  <tr key={d.date} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                      <span>{d.date.slice(5)}</span>{' '}
                      <span
                        className={`text-xs ${
                          isSun ? 'text-rose-600 font-bold' : isSat ? 'text-blue-600 font-bold' : 'text-slate-400'
                        }`}
                      >
                        ({d.dayOfWeek})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {d.isOldEventDay ? (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[11px] font-bold px-1.5 py-0.5 rounded">
                          <Flame className="w-3 h-3 text-amber-600" />
                          旧イベ
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">通常</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <span className="font-semibold text-slate-700">{d.totalMachines}台</span>
                      {d.isReusedMachines && (
                        <span
                          className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-medium"
                          title="元データで台数がブランクのため他日の台数を流用"
                        >
                          流用
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                        d.avgDiffCoins > 0 ? 'text-blue-600' : 'text-slate-700'
                      }`}
                    >
                      {d.avgDiffCoins > 0 ? `+${d.avgDiffCoins}` : d.avgDiffCoins}枚
                    </td>
                    {/* G-Model */}
                    <td
                      className={`py-2.5 px-3 text-right font-extrabold whitespace-nowrap ${
                        gVal >= 0 ? 'text-indigo-600' : 'text-rose-600'
                      }`}
                    >
                      <div>{formatYenExact(gVal)}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {formatYen(Math.round(gVal / (d.totalMachines || 587)))}/台
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">
                      {formatNumber(d.avgGames)}G
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap font-medium">
                      {d.payoutRate.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {d.winRate !== null ? (
                        <span>
                          <span className="font-semibold text-slate-800">{d.winRate}%</span>{' '}
                          <span className="text-[11px] text-slate-500">
                            ({d.winMachines ?? '-'} / {d.totalMachines}台)
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">
                          - ({d.totalMachines}台)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs text-xs truncate">
                      {d.notable ? (
                        <span title={d.notable} className="text-slate-800 font-medium">
                          {d.notable}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>※G数モデル: IN枚数・稼働ゲーム数と差枚還元を同時に反映したホール実務粗利</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
