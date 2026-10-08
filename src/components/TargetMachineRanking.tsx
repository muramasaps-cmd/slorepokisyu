import React, { useState, useMemo } from 'react';
import { DailyRecord, SpecialDayRules, RankingWeights, IslandDefinition } from '../data/types';
import {
  calculateTargetMachineRanking,
  TargetMachineRankingResult,
  TargetMachineScore,
  MachineConfidenceLevel,
} from '../utils/targetMachineRanking';
import { runMachineBacktest, MachineBacktestResult } from '../utils/backtestEngine';
import { parseIslandConfig, getMachineIsland } from '../utils/islandUtils';
import { formatNumber } from '../utils/formatters';
import {
  Target,
  Trophy,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  SlidersHorizontal,
  Flame,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface TargetMachineRankingProps {
  targetDate: string;
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  customWeights?: RankingWeights;
  islandConfig?: string;
  onOpenStoreManager?: () => void;
}

/**
 * Builds human-readable reason template text from contributions and stats.
 * Uses ONLY real data and always includes evidence days.
 * E.g. "同曜日4回中3回プラス、平均+820枚" or "同コホート平均+1,250枚 (根拠5日)"
 */
export function formatMachineReasons(score: TargetMachineScore): string[] {
  const reasons: string[] = [];
  const { stats, contributions, cohortEvidenceDays, evidenceDays } = score;

  // 1. Cohort Diff / Win Rate
  if (cohortEvidenceDays > 0) {
    if (stats.cohortAvgDiff > 0) {
      const wins = Math.round((stats.cohortWinRate / 100) * cohortEvidenceDays);
      reasons.push(
        `同コホート${cohortEvidenceDays}回中${wins}回プラス、平均+${formatNumber(stats.cohortAvgDiff)}枚`
      );
    } else {
      reasons.push(
        `同コホート実績${cohortEvidenceDays}日（縮小推定平均差枚: ${stats.shrunkDiff >= 0 ? '+' : ''}${formatNumber(stats.shrunkDiff)}枚）`
      );
    }
  }

  // 2. High Setting Frequency
  if (stats.highSettingCount > 0 && evidenceDays > 0) {
    reasons.push(
      `高設定挙動履歴 ${evidenceDays}日中${stats.highSettingCount}日発生 (${stats.highSettingRate}%)`
    );
  }

  // 3. Tail match / Zoro
  if (stats.isTailMatch) {
    reasons.push(`対象日の特定末尾と台番末尾が一致 (+${contributions.tailBonusScore}pt)`);
  } else if (stats.isZoro) {
    reasons.push(`ゾロ目台番ボーナス (+${contributions.tailBonusScore}pt)`);
  }

  // 4. Model score support
  if (contributions.modelScore > 0 && reasons.length < 3) {
    reasons.push(
      `所属機種「${score.modelName}」の機種期待スコア支持 (+${contributions.modelScore}pt)`
    );
  }

  // Fallback if no specific condition met
  if (reasons.length === 0) {
    reasons.push(`過去データ${evidenceDays}日分の実績に基づく加算スコア`);
  }

  return reasons.slice(0, 3);
}

export const TargetMachineRanking: React.FC<TargetMachineRankingProps> = ({
  targetDate,
  dailyRecords,
  specialDayRules,
  customWeights,
  islandConfig,
  onOpenStoreManager,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedTail, setSelectedTail] = useState<string>('all');
  const [selectedIsland, setSelectedIsland] = useState<string>('all');
  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);

  // Check if store has machine-level data
  const hasMachineData = useMemo(() => {
    return (dailyRecords || []).some((r) => r.machines && r.machines.length > 0);
  }, [dailyRecords]);

  // Island definitions from config text
  const islandDefinitions: IslandDefinition[] = useMemo(() => {
    return parseIslandConfig(islandConfig);
  }, [islandConfig]);

  // Run backtest to check if table rankings have confirmed statistical edge
  const backtestResult: MachineBacktestResult | null = useMemo(() => {
    if (!hasMachineData) return null;
    return runMachineBacktest(dailyRecords, specialDayRules, {
      topN: 10,
      minEvidenceDays: 3,
      blockLength: 7,
      bootstrapIterations: 500, // fast run for UI indicator
    });
  }, [dailyRecords, specialDayRules, hasMachineData]);

  // Calculate machine ranking for target date
  const rankingResult: TargetMachineRankingResult | null = useMemo(() => {
    if (!hasMachineData || !targetDate) return null;
    return calculateTargetMachineRanking(targetDate, dailyRecords, specialDayRules, undefined, {
      rankingWeights: customWeights,
    });
  }, [targetDate, dailyRecords, specialDayRules, customWeights, hasMachineData]);

  // Extract unique models & tails from ranking results
  const availableModels = useMemo(() => {
    if (!rankingResult) return [];
    const set = new Set<string>();
    rankingResult.rankings.forEach((r) => set.add(r.modelName));
    return Array.from(set).sort();
  }, [rankingResult]);

  const availableIslands = useMemo(() => {
    return islandDefinitions.map((d) => d.name);
  }, [islandDefinitions]);

  // Apply filters and slice Top 20
  const filteredRankings = useMemo(() => {
    if (!rankingResult) return [];
    return rankingResult.rankings
      .filter((m) => {
        if (selectedModel !== 'all' && m.modelName !== selectedModel) return false;
        if (selectedTail !== 'all') {
          const t = Math.abs(m.machineNum) % 10;
          if (String(t) !== selectedTail) return false;
        }
        if (selectedIsland !== 'all' && islandDefinitions.length > 0) {
          const isl = getMachineIsland(m.machineNum, islandDefinitions);
          if (isl !== selectedIsland) return false;
        }
        return true;
      })
      .slice(0, 20);
  }, [rankingResult, selectedModel, selectedTail, selectedIsland, islandDefinitions]);

  // Case 1: No machine-level data in this store
  if (!hasMachineData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-500 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-900">
              台番号別 狙い台ランキング（非表示）
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              現在選択中の店舗には台番号単位のデータ（台番号・差枚・G数）が取り込まれていないため、台番ランキングは非表示になっています。
            </p>
          </div>
        </div>

        <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 space-y-2 text-xs text-amber-950">
          <div className="font-bold flex items-center gap-1.5 text-amber-900">
            <Sparkles className="w-4 h-4 text-amber-600" />
            台番号別データを取り込む方法
          </div>
          <p className="leading-relaxed text-amber-900/90 text-[11px]">
            スロレポやみんレポの詳細台番テーブルを含むHTMLファイル、またはみんレポ形式の台番CSV（日付・台番・機種名・差枚・G数）を「店舗切替/取込」からアップロードすると、全台番の縮小推定・コホート実績による個別台ランキングが自動的に有効化されます。
          </p>
          {onOpenStoreManager && (
            <button
              type="button"
              onClick={onOpenStoreManager}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>店舗切替 / HTML・CSV取込画面を開く</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isNoEdge = backtestResult && !backtestResult.withFilter.hasEdge;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
              <Trophy className="w-4 h-4" />
            </span>
            <h3 className="text-base sm:text-lg font-black tracking-tight">
              台番号別 狙い台ランキング (上位20台)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              対象日: {targetDate}
            </span>
          </div>
          <p className="text-xs text-slate-300">
            同コホート（同特日・同曜日）の実績縮小推定・高設定挙動率・機種期待度を総合加算
          </p>
        </div>

        {/* Backtest Edge Indicator */}
        <div className="shrink-0">
          {backtestResult && (
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                backtestResult.withFilter.hasEdge
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                  : 'bg-amber-950/80 border-amber-500/50 text-amber-200'
              }`}
            >
              {backtestResult.withFilter.hasEdge ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>台番予測: 統計的優位性あり (リフト平均 +{backtestResult.withFilter.avgLift}枚)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>台番予測: 優位性未確認 (参考表示)</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Warning Banner when Backtest shows No Statistical Edge */}
      {isNoEdge && (
        <div className="p-3.5 bg-amber-50/90 border-b border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-black text-amber-900 block">
              【バックテスト判定: 優位性なし（参考表示）】
            </span>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              この店舗のウォークフォワードバックテストでは、台番単位の予測リフト95%区間が0をまたいでおり（偶然のばらつき範囲内）、台番ごとの投入傾向に有意な固定性は確認できていません。参考程度にご覧ください。
            </p>
          </div>
        </div>
      )}

      {/* Filter Toolbar (Model, Tail, Island) */}
      <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Model Filter */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">機種:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
            >
              <option value="all">全機種</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Tail Filter */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">末尾:</span>
            <select
              value={selectedTail}
              onChange={(e) => setSelectedTail(e.target.value)}
              className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
            >
              <option value="all">全末尾</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => (
                <option key={t} value={String(t)}>
                  末尾 {t}
                </option>
              ))}
            </select>
          </div>

          {/* Island Filter (if defined) */}
          {islandDefinitions.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">島/区切り:</span>
              <select
                value={selectedIsland}
                onChange={(e) => setSelectedIsland(e.target.value)}
                className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">全島</option>
                {availableIslands.map((isl) => (
                  <option key={isl} value={isl}>
                    {isl}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          表示: <strong>{filteredRankings.length}</strong> 台 / 対象候補{' '}
          {rankingResult?.rankings.length || 0} 台
        </div>
      </div>

      {/* Machine Cards List */}
      <div className="p-3 sm:p-5 space-y-3">
        {filteredRankings.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            指定された条件（機種・末尾・島）に一致する台番候補はありませんでした。
          </div>
        ) : (
          filteredRankings.map((mach, idx) => {
            const isExpanded = expandedMachine === mach.machineNum;
            const reasons = formatMachineReasons(mach);
            const islandName = getMachineIsland(mach.machineNum, islandDefinitions);

            const confidenceColors: Record<MachineConfidenceLevel, { bg: string; text: string; border: string }> = {
              高: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
              中: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
              低: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
            };
            const cStyle = confidenceColors[mach.confidence] || confidenceColors['低'];

            return (
              <div
                key={mach.machineNum}
                className="bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all overflow-hidden"
              >
                {/* Main Card Header / Summary */}
                <div
                  onClick={() => setExpandedMachine(isExpanded ? null : mach.machineNum)}
                  className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  {/* Left: Rank + Machine Number + Model Name */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-900'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      #{mach.rank}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-base text-slate-900">
                          {mach.machineNum} 番台
                        </span>
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                          {mach.modelName}
                        </span>
                        {islandName && (
                          <span className="text-2xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            {islandName}
                          </span>
                        )}
                        <span
                          className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${cStyle.bg} ${cStyle.text} ${cStyle.border}`}
                        >
                          信頼度: {mach.confidence} (根拠{mach.evidenceDays}日)
                        </span>
                      </div>

                      {/* Reasons bullet text */}
                      <div className="mt-1.5 space-y-0.5">
                        {reasons.map((r, rIdx) => (
                          <div
                            key={rIdx}
                            className="text-xs text-slate-600 flex items-center gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Composite Score + Expansion toggle */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                        総合スコア
                      </span>
                      <span className="text-lg font-black text-indigo-600">
                        {mach.totalScore >= 0 ? `+${mach.totalScore}` : mach.totalScore}
                        <span className="text-xs font-bold text-slate-400 ml-0.5">pt</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title={isExpanded ? '履歴を閉じる' : '過去の出玉履歴を展開'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details: Contribution Breakdown & Historical Logs */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-4 animate-in fade-in duration-100">
                    {/* Additive Contributions Breakdown */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        加算モデル スコア寄与の内訳（合計 = {mach.totalScore} pt）
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">同コホート差枚</span>
                          <span className="font-bold text-slate-900">
                            {mach.contributions.cohortDiffScore >= 0 ? '+' : ''}
                            {mach.contributions.cohortDiffScore} pt
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">同コホート勝率</span>
                          <span className="font-bold text-slate-900">
                            {mach.contributions.cohortWinRateScore >= 0 ? '+' : ''}
                            {mach.contributions.cohortWinRateScore} pt
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">高設定挙動率</span>
                          <span className="font-bold text-slate-900">
                            +{mach.contributions.highSettingScore} pt
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">機種期待スコア</span>
                          <span className="font-bold text-slate-900">
                            +{mach.contributions.modelScore} pt
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">末尾・ゾロ目</span>
                          <span className="font-bold text-slate-900">
                            +{mach.contributions.tailBonusScore} pt
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">直近状態</span>
                          <span className="font-bold text-slate-900">
                            {mach.contributions.recentStateScore >= 0 ? '+' : ''}
                            {mach.contributions.recentStateScore} pt
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Historical Play Record for this Machine */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>過去の稼働実績履歴（機種入替後のみ: 全{mach.history.length}日）</span>
                        <span className="text-[11px] text-slate-500">※ 未来データは除外済</span>
                      </div>

                      {mach.history.length === 0 ? (
                        <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-400 text-center">
                          この台番の過去履歴データはありません。
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-100 text-slate-600 sticky top-0 text-[11px]">
                              <tr>
                                <th className="px-3 py-1.5 font-bold">日付</th>
                                <th className="px-2 py-1.5 font-bold">曜日</th>
                                <th className="px-2 py-1.5 font-bold">コホート</th>
                                <th className="px-3 py-1.5 text-right font-bold">差枚</th>
                                <th className="px-3 py-1.5 text-right font-bold">G数</th>
                                <th className="px-3 py-1.5 text-right font-bold">出率</th>
                                <th className="px-2 py-1.5 text-center font-bold">高設定挙動</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[...mach.history].reverse().map((h, hIdx) => (
                                <tr key={hIdx} className="hover:bg-slate-50">
                                  <td className="px-3 py-1 font-mono font-bold text-slate-800">
                                    {h.date}
                                  </td>
                                  <td className="px-2 py-1 text-slate-600">{h.dayOfWeek}</td>
                                  <td className="px-2 py-1">
                                    {h.isInCohort ? (
                                      <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded text-[10px]">
                                        同コホート
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[10px]">-</span>
                                    )}
                                  </td>
                                  <td
                                    className={`px-3 py-1 text-right font-bold ${
                                      h.diff > 0 ? 'text-blue-600' : 'text-rose-600'
                                    }`}
                                  >
                                    {h.diff > 0 ? `+${h.diff}` : h.diff}枚
                                  </td>
                                  <td className="px-3 py-1 text-right text-slate-600">
                                    {formatNumber(h.games)}G
                                  </td>
                                  <td className="px-3 py-1 text-right font-mono text-slate-700">
                                    {h.payoutRate !== undefined ? `${h.payoutRate}%` : '-'}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {h.isHighSetting ? (
                                      <span className="bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.2 rounded text-[10px]">
                                        高設定挙動
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-[10px]">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
