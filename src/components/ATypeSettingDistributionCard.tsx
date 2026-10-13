import React, { useState, useMemo } from 'react';
import { AggregatedModelStat, DailyRecord } from '../data/types';
import {
  estimateModelSettingAnalysis,
  estimateMachinesSettingDistribution,
  SettingProbabilityItem,
} from '../utils/aTypeSettingEstimator';
import { formatNumber } from '../utils/formatters';
import {
  Cpu,
  Sparkles,
  Flame,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Info,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';

interface ATypeSettingDistributionCardProps {
  stat: AggregatedModelStat;
  dailyRecords?: DailyRecord[];
  className?: string;
}

export const ATypeSettingDistributionCard: React.FC<ATypeSettingDistributionCardProps> = ({
  stat,
  dailyRecords,
  className = '',
}) => {
  const [showMachinesTable, setShowMachinesTable] = useState<boolean>(false);
  const [useHallPrior, setUseHallPrior] = useState<boolean>(false);

  // ホール標準事前分布（低設定多めの現実的な配分事前確率）
  const priorDistribution = useMemo(() => {
    if (!useHallPrior) return undefined;
    return {
      1: 0.35,
      2: 0.25,
      3: 0.15,
      4: 0.12,
      5: 0.08,
      6: 0.05,
    };
  }, [useHallPrior]);

  const analysis = useMemo(() => {
    return estimateModelSettingAnalysis(stat, {
      priorDistribution,
    });
  }, [stat, priorDistribution]);

  // 台番別設定推定
  const machineDistributions = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) return [];
    return estimateMachinesSettingDistribution(stat.modelName, dailyRecords, {
      priorDistribution,
    });
  }, [stat.modelName, dailyRecords, priorDistribution]);

  if (!analysis) return null;

  const { overall, eventDays, normalDays, settingLiftDelta, displayName, isKnownCatalog } = analysis;

  // カラーマップ
  const getSettingColor = (setting: number) => {
    switch (setting) {
      case 1:
        return {
          bar: 'bg-slate-400',
          text: 'text-slate-700',
          bg: 'bg-slate-100',
          border: 'border-slate-300',
        };
      case 2:
        return {
          bar: 'bg-sky-500',
          text: 'text-sky-700',
          bg: 'bg-sky-50',
          border: 'border-sky-200',
        };
      case 3:
        return {
          bar: 'bg-amber-500',
          text: 'text-amber-800',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
        };
      case 4:
        return {
          bar: 'bg-emerald-500',
          text: 'text-emerald-800',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
        };
      case 5:
        return {
          bar: 'bg-indigo-600',
          text: 'text-indigo-800',
          bg: 'bg-indigo-50',
          border: 'border-indigo-200',
        };
      case 6:
        return {
          bar: 'bg-rose-600',
          text: 'text-rose-800',
          bg: 'bg-rose-50',
          border: 'border-rose-200',
        };
      default:
        return {
          bar: 'bg-slate-500',
          text: 'text-slate-700',
          bg: 'bg-slate-50',
          border: 'border-slate-200',
        };
    }
  };

  const getConfidenceBadge = (level: '高' | '中' | '低') => {
    if (level === '高') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          信頼度: 高 (充分なG数)
        </span>
      );
    }
    if (level === '中') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold border border-sky-300">
          信頼度: 中 (目安レベル)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold border border-amber-300">
        信頼度: 低 (G数僅少)
      </span>
    );
  };

  return (
    <div
      className={`bg-white rounded-xl border border-emerald-200/90 shadow-2xs overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-400/30">
            <Cpu className="w-4 h-4 text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">
                Aタイプ 設定値分布推定
              </span>
              <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-2 py-0.2 rounded font-sans border border-emerald-400/30">
                出率（機械割）ベース
              </span>
            </div>
            <span className="text-[11px] text-emerald-200/80">
              {displayName} {isKnownCatalog ? '公表スペック適用' : '標準Aタイプスペック'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {getConfidenceBadge(overall.confidenceLevel)}
          <button
            type="button"
            onClick={() => setUseHallPrior(!useHallPrior)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
              useHallPrior
                ? 'bg-emerald-400 text-emerald-950 border-emerald-300 font-bold'
                : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/20'
            }`}
            title="ホール事前分布（低設定多めを前提）を適用"
          >
            <SlidersHorizontal className="w-3 h-3" />
            事前分布: {useHallPrior ? 'ホール加重' : '一様分布'}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* 期待設定 */}
          <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-xl border border-emerald-200/70">
            <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              推定期待設定値
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-emerald-700 font-mono">
                設定 {overall.expectedSetting}
              </span>
              <span className="text-[11px] text-slate-500 font-sans">/ 6.0</span>
            </div>
            <div className="text-[10px] text-emerald-800/80 mt-0.5">
              最尤: <span className="font-bold">設定 {overall.mostLikelySetting}</span>
            </div>
          </div>

          {/* 高設定確率 (設定4以上) */}
          <div className="p-3 bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-xl border border-indigo-200/70">
            <div className="text-[11px] font-bold text-indigo-900">
              高設定(設定4以上) 確率
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-indigo-700 font-mono">
                {overall.highSettingRate}%
              </span>
            </div>
            <div className="text-[10px] text-indigo-800/80 mt-0.5">
              最高(設定5・6): <span className="font-bold">{overall.topSettingRate}%</span>
            </div>
          </div>

          {/* 実績出率 */}
          <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-xl border border-amber-200/70">
            <div className="text-[11px] font-bold text-amber-900">
              観測出率（機械割）
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-amber-700 font-mono">
                {overall.payoutRate}%
              </span>
            </div>
            <div className="text-[10px] text-amber-800/80 mt-0.5 font-mono">
              SE: ±{overall.standardError}%
            </div>
          </div>

          {/* 観測データ規模 */}
          <div className="p-3 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-700">
              観測G数 / 総差枚
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-base font-black text-slate-800 font-mono">
                {formatNumber(overall.totalGames)}
              </span>
              <span className="text-[10px] text-slate-500 font-sans">G</span>
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5 font-mono font-bold">
              {overall.totalDiffCoins >= 0 ? `+${formatNumber(overall.totalDiffCoins)}` : formatNumber(overall.totalDiffCoins)}枚
            </div>
          </div>
        </div>

        {/* Setting 1 to 6 Probability Distribution Bars */}
        <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              設定別 推定確率分布 (設定1〜6)
            </span>
            <span className="text-[11px] text-slate-500 font-sans">
              ※3枚掛け固定前提・正規尤度ベイズモデルによる事後分布
            </span>
          </div>

          <div className="space-y-2 pt-1">
            {overall.items.map((item: SettingProbabilityItem) => {
              const color = getSettingColor(item.setting);
              const isMostLikely = item.setting === overall.mostLikelySetting;

              return (
                <div
                  key={item.setting}
                  className={`p-2 rounded-lg border transition-all ${
                    isMostLikely
                      ? 'bg-white shadow-2xs border-emerald-300 ring-1 ring-emerald-200'
                      : 'bg-white/70 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-black font-mono w-14 ${color.text}`}>
                        設定 {item.setting}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        公表割: <span className="font-bold text-slate-700">{item.theoreticalPayout}%</span>
                      </span>
                      {isMostLikely && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded font-sans">
                          最尤設定
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono">
                      {item.estimatedMachineCount !== undefined && stat.avgMachinesPerDay > 0 && (
                        <span className="text-[11px] text-slate-500 hidden sm:inline">
                          約 <strong className="text-slate-800">{item.estimatedMachineCount}</strong> 台相当
                        </span>
                      )}
                      <span className="font-black text-sm text-slate-900 w-14 text-right">
                        {item.probability}%
                      </span>
                    </div>
                  </div>

                  {/* Probability Bar */}
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${color.bar}`}
                      style={{ width: `${Math.min(100, Math.max(item.probability, 1))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event Days vs Normal Days Shift Comparison */}
        {eventDays && normalDays && (
          <div className="bg-gradient-to-r from-amber-50/60 to-slate-50/60 rounded-xl p-3.5 border border-amber-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                旧イベント日 vs 通常日の設定配分比較
              </span>
              {settingLiftDelta !== null && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                    settingLiftDelta > 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : settingLiftDelta < 0
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  設定リフト: {settingLiftDelta >= 0 ? `+${settingLiftDelta}` : settingLiftDelta} 段階
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
              {/* Event Days */}
              <div className="p-2.5 bg-white rounded-lg border border-amber-200 shadow-2xs">
                <div className="flex items-center justify-between font-bold text-amber-900 mb-1">
                  <span className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-600" />
                    旧イベント日 ({stat.eventDaysCount}日)
                  </span>
                  <span className="text-emerald-700 font-mono">
                    期待設定 {eventDays.expectedSetting}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-600 pt-1">
                  <div>
                    出率: <strong className="text-slate-800">{eventDays.payoutRate}%</strong>
                  </div>
                  <div>
                    高設定率: <strong className="text-indigo-700">{eventDays.highSettingRate}%</strong>
                  </div>
                  <div>
                    G数: <strong>{formatNumber(eventDays.totalGames)}G</strong>
                  </div>
                </div>
              </div>

              {/* Normal Days */}
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    通常日 ({stat.normalDaysCount}日)
                  </span>
                  <span className="text-slate-700 font-mono">
                    期待設定 {normalDays.expectedSetting}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-600 pt-1">
                  <div>
                    出率: <strong className="text-slate-800">{normalDays.payoutRate}%</strong>
                  </div>
                  <div>
                    高設定率: <strong className="text-indigo-700">{normalDays.highSettingRate}%</strong>
                  </div>
                  <div>
                    G数: <strong>{formatNumber(normalDays.totalGames)}G</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Individual Machines Table (if available) */}
        {machineDistributions.length > 0 && (
          <div className="border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={() => setShowMachinesTable(!showMachinesTable)}
              className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center justify-between w-full p-1 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                台番号別の個別設定推定 ({machineDistributions.length}台)
              </span>
              <span className="flex items-center gap-1 text-[11px] text-indigo-600">
                {showMachinesTable ? '閉じる' : '台別一覧を表示'}
                {showMachinesTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {showMachinesTable && (
              <div className="mt-2 overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">台番号</th>
                      <th className="py-2 px-3 text-right">累計G数</th>
                      <th className="py-2 px-3 text-right">累計差枚</th>
                      <th className="py-2 px-3 text-right">出率</th>
                      <th className="py-2 px-3 text-right">期待設定値</th>
                      <th className="py-2 px-3 text-center">最尤設定</th>
                      <th className="py-2 px-3 text-right">高設定(4+)率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {machineDistributions.map((md) => {
                      const mostLikelyColor = getSettingColor(md.distribution.mostLikelySetting);
                      return (
                        <tr key={md.machineNum} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-sans font-bold text-slate-900">
                            #{md.machineNum}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-700">
                            {formatNumber(md.totalGames)}G
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-bold ${
                              md.totalDiff > 0 ? 'text-blue-600' : 'text-slate-700'
                            }`}
                          >
                            {md.totalDiff > 0 ? `+${formatNumber(md.totalDiff)}` : formatNumber(md.totalDiff)}枚
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900">
                            {md.payoutRate}%
                          </td>
                          <td className="py-2 px-3 text-right font-black text-emerald-700">
                            設定 {md.distribution.expectedSetting}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`text-[11px] px-1.5 py-0.5 rounded font-bold ${mostLikelyColor.bg} ${mostLikelyColor.text} ${mostLikelyColor.border} border`}
                            >
                              設定 {md.distribution.mostLikelySetting}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-indigo-700 font-bold">
                            {md.distribution.highSettingRate}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
