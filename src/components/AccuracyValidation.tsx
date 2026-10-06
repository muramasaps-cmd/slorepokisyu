import React, { useState, useMemo } from 'react';
import { DailyRecord, SpecialDayRules, RankingWeights } from '../data/types';
import {
  runWalkForwardBacktest,
  runAutoTuning,
  BacktestDayEvaluation,
  BacktestSummaryMetrics,
  TuningResult,
} from '../utils/backtestEngine';
import { DEFAULT_RANKING_WEIGHTS } from '../utils/targetRankingEngine';
import { formatCoins, formatNumber } from '../utils/formatters';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Cpu,
  Sliders,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  Target,
  Trophy,
  Activity,
  Layers,
  Check,
  SlidersHorizontal,
} from 'lucide-react';

interface AccuracyValidationProps {
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
  storeName: string;
  currentWeights?: RankingWeights;
  onSaveStoreWeights: (weights: RankingWeights | undefined) => void;
}

export const AccuracyValidation: React.FC<AccuracyValidationProps> = ({
  dailyRecords,
  specialDayRules,
  oldEventDays = '',
  storeName,
  currentWeights,
  onSaveStoreWeights,
}) => {
  const [topK, setTopK] = useState<number>(3);
  const [filterMode, setFilterMode] = useState<'all' | 'special' | 'normal'>('all');
  const [tuningResult, setTuningResult] = useState<TuningResult | null>(null);
  const [isTuningRunning, setIsTuningRunning] = useState<boolean>(false);
  const [showAllDays, setShowAllDays] = useState<boolean>(false);
  const [showTuningDetails, setShowTuningDetails] = useState<boolean>(true);

  const activeWeights = currentWeights || DEFAULT_RANKING_WEIGHTS;
  const isCustomApplied = Boolean(
    currentWeights &&
      (currentWeights.diffCoinDivisor !== DEFAULT_RANKING_WEIGHTS.diffCoinDivisor ||
        currentWeights.winRateMultiplier !== DEFAULT_RANKING_WEIGHTS.winRateMultiplier ||
        currentWeights.allHighMultiplier !== DEFAULT_RANKING_WEIGHTS.allHighMultiplier ||
        currentWeights.matchingBlendWeight !== DEFAULT_RANKING_WEIGHTS.matchingBlendWeight)
  );

  // Run Walk-Forward Backtest
  const { evaluations, summary } = useMemo(() => {
    return runWalkForwardBacktest(
      dailyRecords,
      specialDayRules,
      oldEventDays,
      activeWeights,
      topK,
      5
    );
  }, [dailyRecords, specialDayRules, oldEventDays, activeWeights, topK]);

  // Filtered day evaluations
  const filteredEvaluations = useMemo(() => {
    if (filterMode === 'special') return evaluations.filter((e) => e.isSpecialDay);
    if (filterMode === 'normal') return evaluations.filter((e) => !e.isSpecialDay);
    return evaluations;
  }, [evaluations, filterMode]);

  // Trigger auto-tuning
  const handleRunTuning = () => {
    setIsTuningRunning(true);
    setTimeout(() => {
      const res = runAutoTuning(dailyRecords, specialDayRules, oldEventDays, topK);
      setTuningResult(res);
      setIsTuningRunning(false);
    }, 100);
  };

  // Apply candidate weights
  const handleApplyTuning = () => {
    if (!tuningResult) return;
    onSaveStoreWeights(tuningResult.candidateWeights);
  };

  // Reset to default weights
  const handleResetWeights = () => {
    onSaveStoreWeights(undefined);
    setTuningResult(null);
  };

  const displayedDays = showAllDays ? filteredEvaluations : filteredEvaluations.slice(-15);

  return (
    <div className="space-y-6">
      {/* Header & Verification Principles Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-600 text-white text-xs font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                バックテスト基盤 & 自動調整
              </span>
              {isCustomApplied ? (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  店舗別 最適化重み適用中
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5 rounded-md">
                  標準デフォルト重み使用
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900">
              予測精度の過去実績バックテスト検証 ({storeName})
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              各営業日を<strong>「その日より前のデータだけ」</strong>を用いて朝の時点で予測し、当日の実績データと厳格に比較検証します。未来データの漏洩（ルックアヘッド・バイアス）を完全排除したウォークフォワード方式を採用しています。
            </p>
          </div>

          {/* Controls: Top-K and Filter */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 self-start md:self-auto shrink-0">
            <span className="text-xs font-bold text-slate-600 pl-1">対象機種数:</span>
            <button
              type="button"
              onClick={() => setTopK(3)}
              className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                topK === 3
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              上位3機種 (本命)
            </button>
            <button
              type="button"
              onClick={() => setTopK(5)}
              className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                topK === 5
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              上位5機種 (幅広)
            </button>
          </div>
        </div>

        {/* Verification Principles Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">厳格な時系列分離</span>
              <span className="text-slate-500 text-[11px]">
                対象日以降のデータを書き換えても予測結果は1枚も変わりません。
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">単純ルールとの常時対比</span>
              <span className="text-slate-500 text-[11px]">
                「全期間平均が高い順」という単純戦略をベンチマークとして常時比較。
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">統計的検定（t値≧2.0）</span>
              <span className="text-slate-500 text-[11px]">
                自動調整は検証期間（30%）での有意差が確認できた場合のみ採用を推奨。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards: Engine vs Simple Baseline */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Top-K Lift */}
        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>上位{topK}機種リフト</span>
            <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded text-[10px] font-bold">
              VS 全体平均
            </span>
          </span>
          <div className="text-xl sm:text-2xl font-black text-amber-600">
            {summary.engineAvgTopKLift >= 0 ? `+${summary.engineAvgTopKLift}` : summary.engineAvgTopKLift}
            <span className="text-xs text-slate-500 font-normal ml-0.5">枚/台</span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>単純ルール比:</span>
            <span
              className={`font-black ${
                summary.liftEdge >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {summary.liftEdge >= 0 ? `+${summary.liftEdge}` : summary.liftEdge}枚
            </span>
          </div>
        </div>

        {/* Metric 2: Positive Win Rate */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>上位{topK}機種 勝率</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-bold">
              プラス日比率
            </span>
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {summary.engineTopKPositiveRate}
            <span className="text-xs text-slate-500 font-normal ml-0.5">%</span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>単純ルール比:</span>
            <span
              className={`font-black ${
                summary.winRateEdge >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {summary.winRateEdge >= 0 ? `+${summary.winRateEdge}` : summary.winRateEdge}%
            </span>
          </div>
        </div>

        {/* Metric 3: Spearman Rank Correlation */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>順位相関係数</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-bold">
              スピアマン
            </span>
          </span>
          <div className="text-xl sm:text-2xl font-black text-indigo-600">
            {summary.engineAvgSpearman >= 0 ? `+${summary.engineAvgSpearman}` : summary.engineAvgSpearman}
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>単純ルール比:</span>
            <span
              className={`font-black ${
                summary.spearmanEdge >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {summary.spearmanEdge >= 0 ? `+${summary.spearmanEdge}` : summary.spearmanEdge}
            </span>
          </div>
        </div>

        {/* Metric 4: Diff Coins MAE */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>期待差枚 誤差 (MAE)</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-bold">
              平均絶対誤差
            </span>
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-800">
            {summary.engineDiffCoinsMae}
            <span className="text-xs text-slate-500 font-normal ml-0.5">枚</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            全機種の期待枚数誤差
          </div>
        </div>

        {/* Metric 5: Hall Error MAE */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>ホール全体予測誤差</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-bold">
              営業日全体
            </span>
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-800">
            {summary.engineHallMae}
            <span className="text-xs text-slate-500 font-normal ml-0.5">枚/台</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            還元日/回収日の見極め
          </div>
        </div>

        {/* Metric 6: Tail Performance */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>推奨第1末尾 実績</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-bold">
              平均差枚
            </span>
          </span>
          <div
            className={`text-xl sm:text-2xl font-black ${
              summary.engineTailAvgDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {summary.engineTailAvgDiff >= 0 ? `+${summary.engineTailAvgDiff}` : summary.engineTailAvgDiff}
            <span className="text-xs text-slate-500 font-normal ml-0.5">枚</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            首位推奨末尾の当日実績
          </div>
        </div>
      </div>

      {/* Comparison Table: Engine (Composite Score) vs Baseline (Simple Rule) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">
              予測エンジン（複合スコア） vs 単純ベンチマーク（全期間平均順）比較
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            検証対象日数: <strong>{summary.totalEvaluatedDays}営業日</strong> (特日 {summary.specialDaysCount}日 / 通常 {summary.normalDaysCount}日)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">評価指標</th>
                <th className="py-2.5 px-4 text-amber-700 bg-amber-50/50">
                  当システム（複合スコア予測）
                </th>
                <th className="py-2.5 px-4 text-slate-600">
                  単純ルール（全期間の平均差枚順）
                </th>
                <th className="py-2.5 px-4 text-right">改善効果（エッジ差分）</th>
                <th className="py-2.5 px-4">優位性評価</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-bold text-slate-900">
                  上位{topK}機種の平均差枚リフト（対ホール平均）
                </td>
                <td className="py-3 px-4 font-black text-amber-700 bg-amber-50/30">
                  {summary.engineAvgTopKLift >= 0 ? `+${summary.engineAvgTopKLift}` : summary.engineAvgTopKLift}枚 / 台
                </td>
                <td className="py-3 px-4 font-semibold text-slate-600">
                  {summary.baselineAvgTopKLift >= 0 ? `+${summary.baselineAvgTopKLift}` : summary.baselineAvgTopKLift}枚 / 台
                </td>
                <td className="py-3 px-4 text-right font-black">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      summary.liftEdge >= 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {summary.liftEdge >= 0 ? `+${summary.liftEdge}` : summary.liftEdge}枚
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {summary.liftEdge > 100 ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      大幅な期待値向上
                    </span>
                  ) : summary.liftEdge > 0 ? (
                    <span className="text-emerald-600 font-bold">明確なエッジあり</span>
                  ) : (
                    <span className="text-slate-500">同等または要調整</span>
                  )}
                </td>
              </tr>

              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-bold text-slate-900">上位{topK}機種 実績平均差枚</td>
                <td className="py-3 px-4 font-black text-amber-700 bg-amber-50/30">
                  {summary.engineAvgTopKDiff >= 0 ? `+${summary.engineAvgTopKDiff}` : summary.engineAvgTopKDiff}枚 / 台
                </td>
                <td className="py-3 px-4 font-semibold text-slate-600">
                  {summary.baselineAvgTopKDiff >= 0 ? `+${summary.baselineAvgTopKDiff}` : summary.baselineAvgTopKDiff}枚 / 台
                </td>
                <td className="py-3 px-4 text-right font-black">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      summary.engineAvgTopKDiff >= summary.baselineAvgTopKDiff
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {summary.engineAvgTopKDiff >= summary.baselineAvgTopKDiff ? '+' : ''}
                    {summary.engineAvgTopKDiff - summary.baselineAvgTopKDiff}枚
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  朝イチ推奨機種の純粋な出玉成績
                </td>
              </tr>

              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-bold text-slate-900">上位{topK}機種 勝率（プラス日比率）</td>
                <td className="py-3 px-4 font-black text-amber-700 bg-amber-50/30">
                  {summary.engineTopKPositiveRate}%
                </td>
                <td className="py-3 px-4 font-semibold text-slate-600">
                  {summary.baselineTopKPositiveRate}%
                </td>
                <td className="py-3 px-4 text-right font-black">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      summary.winRateEdge >= 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {summary.winRateEdge >= 0 ? `+${summary.winRateEdge}` : summary.winRateEdge}%
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  高勝率で負けリスクを低減
                </td>
              </tr>

              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-bold text-slate-900">順位相関係数（スピアマン）</td>
                <td className="py-3 px-4 font-black text-amber-700 bg-amber-50/30">
                  {summary.engineAvgSpearman >= 0 ? `+${summary.engineAvgSpearman}` : summary.engineAvgSpearman}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-600">
                  {summary.baselineAvgSpearman >= 0 ? `+${summary.baselineAvgSpearman}` : summary.baselineAvgSpearman}
                </td>
                <td className="py-3 px-4 text-right font-black">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      summary.spearmanEdge >= 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {summary.spearmanEdge >= 0 ? `+${summary.spearmanEdge}` : summary.spearmanEdge}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  ランキング全体の序列予測精度
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Tuning Section (自動調整) */}
      <div className="bg-white rounded-2xl border border-indigo-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                店舗別パラメータ自動調整
              </span>
              <span className="text-indigo-200 text-xs font-medium">
                学習70%・検証30% 時系列アウトオブサンプル検定
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              過学習防止型 最適重み探索と統計的有意性検証
            </h3>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleRunTuning}
              disabled={isTuningRunning || dailyRecords.length < 8}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                isTuningRunning
                  ? 'bg-amber-400/50 text-slate-950 cursor-wait'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
              }`}
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>{isTuningRunning ? '探索・検定中...' : '重みを自動探索＆検証'}</span>
            </button>

            {isCustomApplied && (
              <button
                type="button"
                onClick={handleResetWeights}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center gap-1"
                title="標準デフォルト重みに戻す"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
                <span>初期値に戻す</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-600 max-w-4xl space-y-1">
            <p>
              過去の全データを<strong>時系列で学習期間（前半70%）と検証期間（後半30%）</strong>に分割します。学習期間でのみ重みの組み合わせを探索し、<strong>未知の検証期間でもリフトが改善し、かつt値が2.0以上（有意差あり）</strong>の場合のみ「採用推奨」と判定します。
            </p>
          </div>

          {/* Tuning Execution Result */}
          {tuningResult && (
            <div className="space-y-4 pt-3 border-t border-slate-200">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  tuningResult.isRecommended
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50/80 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-3">
                  {tuningResult.isRecommended ? (
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Check className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded ${
                          tuningResult.isRecommended
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-200 text-amber-900'
                        }`}
                      >
                        {tuningResult.isRecommended ? '【採用推奨】有意な改善を確認' : '【現状維持推奨】有意差なし'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        t値 = {tuningResult.tValue} (基準値 ≧ 2.0)
                      </span>
                    </div>
                    <p className="text-xs font-medium leading-relaxed">{tuningResult.verdictMessage}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {tuningResult.isRecommended && (
                    <button
                      type="button"
                      onClick={handleApplyTuning}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>この最適重みを店舗に採用</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Statistics Breakdown Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Train Period Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">
                    学習期間 (前半70%・{tuningResult.trainEvaluatedDays}営業日)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">デフォルトリフト:</span>
                    <span className="font-bold text-slate-800">+{tuningResult.trainDefaultLift}枚</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">探索候補リフト:</span>
                    <span className="font-black text-amber-600">+{tuningResult.trainCandidateLift}枚</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">学習期 向上幅:</span>
                    <span className="font-black text-emerald-600">+{tuningResult.trainLiftGain}枚</span>
                  </div>
                </div>

                {/* Validation Period Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">
                    検証期間 (後半30%・{tuningResult.valEvaluatedDays}営業日)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">デフォルトリフト:</span>
                    <span className="font-bold text-slate-800">+{tuningResult.valDefaultLift}枚</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">検証期 実現リフト:</span>
                    <span className="font-black text-amber-600">+{tuningResult.valCandidateLift}枚</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">検証期 真の向上:</span>
                    <span
                      className={`font-black ${
                        tuningResult.valLiftGain > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {tuningResult.valLiftGain > 0 ? `+${tuningResult.valLiftGain}` : tuningResult.valLiftGain}枚
                    </span>
                  </div>
                </div>

                {/* Statistical Significance Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">統計的検定 (Paired t-test)</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">標準誤差 (SE):</span>
                    <span className="font-bold text-slate-800">{tuningResult.valStdError}枚</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">検定統計量 t値:</span>
                    <span
                      className={`font-black ${
                        tuningResult.tValue >= 2.0 ? 'text-emerald-600' : 'text-slate-800'
                      }`}
                    >
                      {tuningResult.tValue}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">有意水準 判定:</span>
                    <span
                      className={`font-bold ${
                        tuningResult.isRecommended ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {tuningResult.isRecommended ? '有意(p < 0.05)' : '有意差なし'}
                    </span>
                  </div>
                </div>

                {/* Candidate Weights Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">探索された重み構成</span>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-600">差枚数除数:</span>
                    <span className="font-bold text-slate-800">
                      {tuningResult.candidateWeights.diffCoinDivisor} (標準 35)
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-600">勝率加点係数:</span>
                    <span className="font-bold text-slate-800">
                      {tuningResult.candidateWeights.winRateMultiplier} (標準 0.6)
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-600">全台系加点:</span>
                    <span className="font-bold text-slate-800">
                      +{tuningResult.candidateWeights.allHighMultiplier}点 (標準 4.5)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Historical Verification Log (Day by Day) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-3">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-500" />
              営業日別 バックテスト検証履歴（全{filteredEvaluations.length}営業日）
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              各日の朝時点の予測（その日より前のデータのみ使用）と、当日の実際の結果の完全照合ログです。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex bg-white p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded font-bold cursor-pointer transition-colors ${
                  filterMode === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全日 ({evaluations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('special')}
                className={`px-2.5 py-1 rounded font-bold cursor-pointer transition-colors ${
                  filterMode === 'special'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                特日のみ ({evaluations.filter((e) => e.isSpecialDay).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('normal')}
                className={`px-2.5 py-1 rounded font-bold cursor-pointer transition-colors ${
                  filterMode === 'normal'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                通常日 ({evaluations.filter((e) => !e.isSpecialDay).length})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap">日付 (曜日)</th>
                <th className="py-2.5 px-3 whitespace-nowrap">ホール全体実績</th>
                <th className="py-2.5 px-3 bg-amber-50/50 whitespace-nowrap">
                  当システム 上位{topK}機種
                </th>
                <th className="py-2.5 px-3 bg-amber-50/50 whitespace-nowrap">
                  上位{topK} 実績差枚 (リフト)
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">単純ルール 上位{topK}</th>
                <th className="py-2.5 px-3 whitespace-nowrap">単純ルール リフト</th>
                <th className="py-2.5 px-3 whitespace-nowrap">順位相関</th>
                <th className="py-2.5 px-3 whitespace-nowrap">推奨末尾 実績</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {displayedDays.map((d) => (
                <tr key={d.date} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="font-bold text-slate-900">{d.date}</span>{' '}
                    <span className="text-slate-500">({d.dayOfWeek})</span>
                    {d.isSpecialDay && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                        特日
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`font-semibold ${
                        d.actualHallAvgDiff >= 0 ? 'text-blue-600' : 'text-slate-600'
                      }`}
                    >
                      {d.actualHallAvgDiff >= 0 ? `+${d.actualHallAvgDiff}` : d.actualHallAvgDiff}枚
                    </span>
                  </td>
                  <td className="py-2.5 px-3 bg-amber-50/30 font-bold text-slate-900 max-w-[200px] truncate">
                    {d.engineTopKModels.join(', ')}
                  </td>
                  <td className="py-2.5 px-3 bg-amber-50/30 whitespace-nowrap">
                    <span
                      className={`font-black ${
                        d.engineTopKActualAvgDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {d.engineTopKActualAvgDiff >= 0
                        ? `+${d.engineTopKActualAvgDiff}`
                        : d.engineTopKActualAvgDiff}枚
                    </span>
                    <span
                      className={`ml-1 text-[11px] font-bold ${
                        d.engineTopKActualLift >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      ({d.engineTopKActualLift >= 0 ? `+${d.engineTopKActualLift}` : d.engineTopKActualLift})
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate">
                    {d.baselineTopKModels.join(', ')}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`font-bold ${
                        d.baselineTopKActualLift >= 0 ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {d.baselineTopKActualLift >= 0
                        ? `+${d.baselineTopKActualLift}`
                        : d.baselineTopKActualLift}枚
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                    {d.engineSpearmanCorr !== null ? (
                      <span
                        className={
                          d.engineSpearmanCorr > 0.3
                            ? 'text-emerald-600 font-bold'
                            : d.engineSpearmanCorr > 0
                            ? 'text-slate-700'
                            : 'text-slate-400'
                        }
                      >
                        {d.engineSpearmanCorr >= 0 ? `+${d.engineSpearmanCorr}` : d.engineSpearmanCorr}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {d.engineTopTail ? (
                      <span>
                        <span className="font-bold text-slate-700">{d.engineTopTail}:</span>{' '}
                        {d.engineTopTailActualAvgDiff !== null ? (
                          <span
                            className={
                              d.engineTopTailActualAvgDiff >= 0
                                ? 'text-emerald-600 font-bold'
                                : 'text-slate-500'
                            }
                          >
                            {d.engineTopTailActualAvgDiff >= 0
                              ? `+${d.engineTopTailActualAvgDiff}`
                              : d.engineTopTailActualAvgDiff}枚
                          </span>
                        ) : (
                          '-'
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Show More Button */}
        {filteredEvaluations.length > 15 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
            <button
              type="button"
              onClick={() => setShowAllDays(!showAllDays)}
              className="text-xs font-bold text-amber-700 hover:text-amber-800 cursor-pointer flex items-center gap-1 mx-auto"
            >
              {showAllDays ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  直近15日のみ表示に縮める
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  全{filteredEvaluations.length}営業日の全履歴を表示する
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
