import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DailyRecord, SpecialDayRules, RankingWeights, MachineRankingWeights } from '../data/types';
import {
  runWalkForwardBacktest,
  runAutoTuning,
  runMachineBacktest,
  runMachineRollingValidation,
  MachineRollingValidationResult,
  BacktestDayEvaluation,
  BacktestSummaryMetrics,
  TuningResult,
  MachineBacktestResult,
} from '../utils/backtestEngine';
import { DEFAULT_RANKING_WEIGHTS } from '../utils/targetRankingEngine';
import { DEFAULT_MACHINE_RANKING_WEIGHTS } from '../utils/targetMachineRanking';
import type { TuningWorkerRequest, TuningWorkerResponse } from '../workers/tuningWorker';
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
  XCircle,
  AlertTriangle,
} from 'lucide-react';

interface AccuracyValidationProps {
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  oldEventDays?: string;
  storeName: string;
  currentWeights?: RankingWeights;
  onSaveStoreWeights: (weights: RankingWeights | undefined) => void;
  currentMachineWeights?: MachineRankingWeights;
  onSaveStoreMachineWeights?: (weights: MachineRankingWeights | undefined) => void;
}

export const AccuracyValidation: React.FC<AccuracyValidationProps> = ({
  dailyRecords,
  specialDayRules,
  oldEventDays = '',
  storeName,
  currentWeights,
  onSaveStoreWeights,
  currentMachineWeights,
  onSaveStoreMachineWeights,
}) => {
  const [topK, setTopK] = useState<number>(3);
  const [minWarmupDays, setMinWarmupDays] = useState<number>(30);
  const [minMachines, setMinMachines] = useState<number>(3);
  const [filterMode, setFilterMode] = useState<'all' | 'special' | 'normal'>('all');
  const [tuningResult, setTuningResult] = useState<TuningResult | null>(null);
  const [isTuningRunning, setIsTuningRunning] = useState<boolean>(false);
  const [tuningProgress, setTuningProgress] = useState<number>(0);
  const [showAllDays, setShowAllDays] = useState<boolean>(false);
  const [showTuningDetails, setShowTuningDetails] = useState<boolean>(true);
  const [machineTopN, setMachineTopN] = useState<number>(10);
  const [machineFilterMode, setMachineFilterMode] = useState<'withFilter' | 'withoutFilter'>('withFilter');
  const [showAllMachineDays, setShowAllMachineDays] = useState<boolean>(false);
  const workerRef = useRef<Worker | null>(null);

  const hasMachineData = useMemo(
    () => dailyRecords.some((d) => d.machines && d.machines.length > 0),
    [dailyRecords]
  );

  const activeMachineWeights = currentMachineWeights || DEFAULT_MACHINE_RANKING_WEIGHTS;
  const isCustomMachineWeightsApplied = Boolean(
    currentMachineWeights &&
      (currentMachineWeights.diffWeight !== DEFAULT_MACHINE_RANKING_WEIGHTS.diffWeight ||
        currentMachineWeights.winRateWeight !== DEFAULT_MACHINE_RANKING_WEIGHTS.winRateWeight ||
        currentMachineWeights.highSettingWeight !== DEFAULT_MACHINE_RANKING_WEIGHTS.highSettingWeight ||
        currentMachineWeights.modelScoreWeight !== DEFAULT_MACHINE_RANKING_WEIGHTS.modelScoreWeight ||
        currentMachineWeights.tailMatchBonus !== DEFAULT_MACHINE_RANKING_WEIGHTS.tailMatchBonus ||
        currentMachineWeights.zoroBonus !== DEFAULT_MACHINE_RANKING_WEIGHTS.zoroBonus ||
        currentMachineWeights.recentStateWeight !== DEFAULT_MACHINE_RANKING_WEIGHTS.recentStateWeight)
  );

  const [machineRollingResult, setMachineRollingResult] = useState<MachineRollingValidationResult | null>(null);
  const [isMachineRollingRunning, setIsMachineRollingRunning] = useState<boolean>(false);

  const machineBacktestResult: MachineBacktestResult | null = useMemo(() => {
    if (!hasMachineData) return null;
    return runMachineBacktest(dailyRecords, specialDayRules, {
      topN: machineTopN,
      minEvidenceDays: 3,
      blockLength: 7,
      bootstrapIterations: 2000,
      weights: activeMachineWeights,
    });
  }, [dailyRecords, specialDayRules, machineTopN, hasMachineData, activeMachineWeights]);

  // Suggested weights based on ablation items that have recommendZeroWeight: true
  const suggestedZeroWeights = useMemo(() => {
    if (!machineBacktestResult?.ablationResults) return null;
    const items = machineBacktestResult.ablationResults;
    const zeroVariants = items.filter((it) => it.variantKey !== 'all' && it.recommendZeroWeight);
    if (zeroVariants.length === 0) return null;

    const modified: MachineRankingWeights = { ...activeMachineWeights };
    const changedNames: string[] = [];
    zeroVariants.forEach((it) => {
      if (it.variantKey === 'noHighSetting') {
        modified.highSettingWeight = 0;
        changedNames.push('高設定挙動重み → 0');
      }
      if (it.variantKey === 'noModelScore') {
        modified.modelScoreWeight = 0;
        changedNames.push('機種スコア重み → 0');
      }
      if (it.variantKey === 'noTailZoro') {
        modified.tailMatchBonus = 0;
        modified.zoroBonus = 0;
        changedNames.push('末尾・ゾロ目ボーナス → 0');
      }
    });
    return { weights: modified, changedNames };
  }, [machineBacktestResult, activeMachineWeights]);

  const handleRunMachineRollingValidation = () => {
    if (!suggestedZeroWeights) return;
    setIsMachineRollingRunning(true);
    setTimeout(() => {
      const res = runMachineRollingValidation(
        dailyRecords,
        specialDayRules,
        suggestedZeroWeights.weights,
        activeMachineWeights,
        machineTopN
      );
      setMachineRollingResult(res);
      setIsMachineRollingRunning(false);
    }, 50);
  };

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

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
      minWarmupDays,
      minMachines
    );
  }, [dailyRecords, specialDayRules, oldEventDays, activeWeights, topK, minWarmupDays, minMachines]);

  // Filtered day evaluations
  const filteredEvaluations = useMemo(() => {
    if (filterMode === 'special') return evaluations.filter((e) => e.isSpecialDay);
    if (filterMode === 'normal') return evaluations.filter((e) => !e.isSpecialDay);
    return evaluations;
  }, [evaluations, filterMode]);

  // Trigger auto-tuning via Web Worker
  const handleRunTuning = () => {
    if (isTuningRunning) return;
    setIsTuningRunning(true);
    setTuningProgress(0);

    // Cancel any previous worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    try {
      const worker = new Worker(
        new URL('../workers/tuningWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<TuningWorkerResponse>) => {
        const data = event.data;
        if (data.type === 'PROGRESS') {
          setTuningProgress(data.progress);
        } else if (data.type === 'RESULT') {
          setTuningResult(data.result);
          setIsTuningRunning(false);
          setTuningProgress(100);
          worker.terminate();
          workerRef.current = null;
        } else if (data.type === 'ERROR') {
          console.warn('Tuning worker error, falling back to sync execution:', data.error);
          worker.terminate();
          workerRef.current = null;
          setTimeout(() => {
            const res = runAutoTuning(
              dailyRecords,
              specialDayRules,
              oldEventDays,
              topK,
              (pct) => {
                setTuningProgress(pct);
              },
              minWarmupDays,
              minMachines
            );
            setTuningResult(res);
            setIsTuningRunning(false);
            setTuningProgress(100);
          }, 50);
        }
      };

      worker.onerror = (err) => {
        console.warn('Tuning worker fatal error, falling back to sync execution:', err);
        worker.terminate();
        workerRef.current = null;
        setTimeout(() => {
          const res = runAutoTuning(
            dailyRecords,
            specialDayRules,
            oldEventDays,
            topK,
            (pct) => {
              setTuningProgress(pct);
            },
            minWarmupDays,
            minMachines
          );
          setTuningResult(res);
          setIsTuningRunning(false);
          setTuningProgress(100);
        }, 50);
      };

      const request: TuningWorkerRequest = {
        type: 'START_TUNING',
        dailyRecords,
        specialDayRules,
        oldEventDays,
        k: topK,
        minWarmupDays,
        minMachines,
      };

      worker.postMessage(request);
    } catch (e) {
      // Fallback to sync run if Worker fails to initialize
      console.warn('Worker instantiation failed, falling back to sync execution:', e);
      setTimeout(() => {
        const res = runAutoTuning(
          dailyRecords,
          specialDayRules,
          oldEventDays,
          topK,
          (pct) => {
            setTuningProgress(pct);
          },
          minWarmupDays,
          minMachines
        );
        setTuningResult(res);
        setIsTuningRunning(false);
        setTuningProgress(100);
      }, 50);
    }
  };

  // Abort running auto-tuning
  const handleCancelTuning = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsTuningRunning(false);
    setTuningProgress(0);
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

          {/* Controls: Top-K, minWarmupDays, and minMachines */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            {/* Top-K */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 pl-1">対象機種:</span>
              <button
                type="button"
                onClick={() => setTopK(3)}
                className={`px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  topK === 3
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                上位3機種
              </button>
              <button
                type="button"
                onClick={() => setTopK(5)}
                className={`px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  topK === 5
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                上位5機種
              </button>
            </div>

            {/* minWarmupDays */}
            <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 pl-1">準備期間:</span>
              {[14, 30, 60].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setMinWarmupDays(days)}
                  className={`px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    minWarmupDays === days
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                  title={`検証開始前の準備期間を${days}日間に設定`}
                >
                  {days}日{days === 30 ? ' (既定)' : ''}
                </button>
              ))}
            </div>

            {/* minMachines */}
            <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 pl-1">最小台数:</span>
              {[1, 3, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMinMachines(count)}
                  className={`px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    minMachines === count
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                  title={`最低設置台数が${count}台以上の機種を対象に評価（台数加重）`}
                >
                  {count}台〜{count === 3 ? ' (既定)' : ''}
                </button>
              ))}
            </div>
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
              <span className="font-bold text-slate-800 block">5つの強力ベースライン対比</span>
              <span className="text-slate-500 text-[11px]">
                全期間・同曜日・同特日・直近14日・ランダム（100回試行平均）と常時対比。
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">拡張ローリング & ブートストラップ</span>
              <span className="text-slate-500 text-[11px]">
                自動調整は3〜5分割ローリング検証と7日ブロックブートストラップ95%区間で判定。
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
            <span>ホール全体予測誤差 (MAE)</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-bold">
              対 全期間平均
            </span>
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-800">
            {summary.engineHallMae}
            <span className="text-xs text-slate-500 font-normal ml-0.5">枚/台</span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>全期間平均MAE ({summary.allPeriodHallMae}枚) 比:</span>
            <span
              className={`font-black ${
                summary.hallMaeImprovement >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {summary.hallMaeImprovement >= 0 ? `-${summary.hallMaeImprovement}` : `+${Math.abs(summary.hallMaeImprovement)}`}枚
            </span>
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

      {/* Comparison Table: Engine (Composite Score) vs 5 Baselines */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">
              予測エンジン（複合スコア） vs 5大ベースライン比較検証
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
                <th className="py-2.5 px-3 whitespace-nowrap">評価指標</th>
                <th className="py-2.5 px-3 text-amber-700 bg-amber-50/70 font-black whitespace-nowrap">
                  当システム (複合スコア)
                </th>
                <th className="py-2.5 px-3 text-slate-700 whitespace-nowrap">全期間平均</th>
                <th className="py-2.5 px-3 text-slate-700 whitespace-nowrap">同曜日(祝日含)</th>
                <th className="py-2.5 px-3 text-slate-700 whitespace-nowrap">同特日平均</th>
                <th className="py-2.5 px-3 text-slate-700 whitespace-nowrap">直近14日平均</th>
                <th className="py-2.5 px-3 text-slate-700 whitespace-nowrap">ランダム(100回)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">全期間比エッジ</th>
                <th className="py-2.5 px-3 whitespace-nowrap">優位性評価</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {/* Row 1: Top-K Lift */}
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                  上位{topK}機種 平均リフト (対ホール)
                </td>
                <td className="py-3 px-3 font-black text-amber-700 bg-amber-50/30 whitespace-nowrap">
                  {summary.engineAvgTopKLift >= 0 ? `+${summary.engineAvgTopKLift}` : summary.engineAvgTopKLift}枚/台
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.baselineAvgTopKLift >= 0 ? `+${summary.baselineAvgTopKLift}` : summary.baselineAvgTopKLift}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.dowBaselineAvgTopKLift >= 0 ? `+${summary.dowBaselineAvgTopKLift}` : summary.dowBaselineAvgTopKLift}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.specialBaselineAvgTopKLift >= 0 ? `+${summary.specialBaselineAvgTopKLift}` : summary.specialBaselineAvgTopKLift}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.recent14BaselineAvgTopKLift >= 0 ? `+${summary.recent14BaselineAvgTopKLift}` : summary.recent14BaselineAvgTopKLift}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.randomBaselineAvgTopKLift >= 0 ? `+${summary.randomBaselineAvgTopKLift}` : summary.randomBaselineAvgTopKLift}枚
                </td>
                <td className="py-3 px-3 text-right font-black whitespace-nowrap">
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
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
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

              {/* Row 2: Top-K Weighted Actual Diff */}
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                  上位{topK}機種 実績平均差枚 (台数加重)
                </td>
                <td className="py-3 px-3 font-black text-amber-700 bg-amber-50/30 whitespace-nowrap">
                  {summary.engineAvgTopKDiff >= 0 ? `+${summary.engineAvgTopKDiff}` : summary.engineAvgTopKDiff}枚/台
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.baselineAvgTopKDiff >= 0 ? `+${summary.baselineAvgTopKDiff}` : summary.baselineAvgTopKDiff}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.dowBaselineAvgTopKDiff >= 0 ? `+${summary.dowBaselineAvgTopKDiff}` : summary.dowBaselineAvgTopKDiff}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.specialBaselineAvgTopKDiff >= 0 ? `+${summary.specialBaselineAvgTopKDiff}` : summary.specialBaselineAvgTopKDiff}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.recent14BaselineAvgTopKDiff >= 0 ? `+${summary.recent14BaselineAvgTopKDiff}` : summary.recent14BaselineAvgTopKDiff}枚
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.randomBaselineAvgTopKDiff >= 0 ? `+${summary.randomBaselineAvgTopKDiff}` : summary.randomBaselineAvgTopKDiff}枚
                </td>
                <td className="py-3 px-3 text-right font-black whitespace-nowrap">
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
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                  朝イチ推奨機種の純粋な出玉成績
                </td>
              </tr>

              {/* Row 3: Top-K Win Rate */}
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                  上位{topK}機種 勝率 (プラス日比率)
                </td>
                <td className="py-3 px-3 font-black text-amber-700 bg-amber-50/30 whitespace-nowrap">
                  {summary.engineTopKPositiveRate}%
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.baselineTopKPositiveRate}%
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.dowBaselineTopKPositiveRate}%
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.specialBaselineTopKPositiveRate}%
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.recent14BaselineTopKPositiveRate}%
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.randomBaselineTopKPositiveRate}%
                </td>
                <td className="py-3 px-3 text-right font-black whitespace-nowrap">
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
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                  高勝率で負けリスクを低減
                </td>
              </tr>

              {/* Row 4: Spearman Correlation */}
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                  順位相関係数 (スピアマン)
                </td>
                <td className="py-3 px-3 font-black text-amber-700 bg-amber-50/30 whitespace-nowrap">
                  {summary.engineAvgSpearman >= 0 ? `+${summary.engineAvgSpearman}` : summary.engineAvgSpearman}
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.baselineAvgSpearman >= 0 ? `+${summary.baselineAvgSpearman}` : summary.baselineAvgSpearman}
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.dowBaselineAvgSpearman >= 0 ? `+${summary.dowBaselineAvgSpearman}` : summary.dowBaselineAvgSpearman}
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.specialBaselineAvgSpearman >= 0 ? `+${summary.specialBaselineAvgSpearman}` : summary.specialBaselineAvgSpearman}
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.recent14BaselineAvgSpearman >= 0 ? `+${summary.recent14BaselineAvgSpearman}` : summary.recent14BaselineAvgSpearman}
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.randomBaselineAvgSpearman >= 0 ? `+${summary.randomBaselineAvgSpearman}` : summary.randomBaselineAvgSpearman}
                </td>
                <td className="py-3 px-3 text-right font-black whitespace-nowrap">
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
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                  ランキング全体の序列予測精度
                </td>
              </tr>

              {/* Row 5: Hall MAE Comparison */}
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                  ホール全体予測誤差 (MAE)
                </td>
                <td className="py-3 px-3 font-black text-amber-700 bg-amber-50/30 whitespace-nowrap">
                  {summary.engineHallMae}枚/台
                </td>
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  {summary.allPeriodHallMae}枚/台
                </td>
                <td colSpan={4} className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                  (全期間平均値をそのまま出すだけの単純予測と対比)
                </td>
                <td className="py-3 px-3 text-right font-black whitespace-nowrap">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      summary.hallMaeImprovement >= 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {summary.hallMaeImprovement >= 0 ? `+${summary.hallMaeImprovement}` : summary.hallMaeImprovement}枚 改善
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                  {summary.hallMaeImprovement > 0 ? (
                    <span className="text-emerald-600 font-bold">全期間平均予測より高精度</span>
                  ) : (
                    <span className="text-slate-500">全期間平均予測と同等</span>
                  )}
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
                拡張ローリング検証（3〜5分割） & 7日ブロックブートストラップ（2,000回）
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              過学習防止型 最適重み探索と統計的有意性検証
            </h3>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {isTuningRunning ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-indigo-900/80 px-3 py-1.5 rounded-xl border border-indigo-700/50">
                  <div className="w-16 bg-indigo-950 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-400 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, tuningProgress)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300 min-w-[36px]">
                    {tuningProgress}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelTuning}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                  title="処理を中止"
                >
                  <XCircle className="w-4 h-4 text-white" />
                  <span>中止</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRunTuning}
                disabled={dailyRecords.length < 8}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs bg-amber-400 hover:bg-amber-300 text-slate-950"
              >
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>重みを自動探索＆検証</span>
              </button>
            )}

            {isCustomApplied && !isTuningRunning && (
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
              過去の全データを<strong>時系列の拡張ウィンドウ（3〜5分割ローリング検証）</strong>で評価します。粗グリッドからランダム探索（64組・規模補正ON/OFF含む）を行い、<strong>「全分割平均の改善が正」かつ「7日ブロックブートストラップ（2,000回）の95%信頼区間下限が0超」</strong>を満たした場合のみ「採用推奨」と判定します。※多数の候補探索に伴う多重比較バイアス（過学習）を厳格に防ぎます。
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
                        {tuningResult.isRecommended ? '【採用推奨】有意な改善を確認' : '【標準維持推奨】有意差なし'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        全分割平均 = {tuningResult.meanSplitGain >= 0 ? `+${tuningResult.meanSplitGain}` : tuningResult.meanSplitGain}枚 | 95%区間下限 = {tuningResult.bootstrapCiLower}枚
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
                {/* Rolling Splits Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">
                    ローリング検証 ({tuningResult.numSplits}分割)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">全分割平均向上:</span>
                    <span className={`font-black ${tuningResult.meanSplitGain > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {tuningResult.meanSplitGain >= 0 ? `+${tuningResult.meanSplitGain}` : tuningResult.meanSplitGain}枚
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">各分割Gain:</span>
                    <span className="font-mono font-bold text-slate-700">
                      [{tuningResult.splitGains.map((g) => (g >= 0 ? `+${g}` : `${g}`)).join(', ')}]
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">検証総日数:</span>
                    <span className="font-bold text-slate-800">{tuningResult.valEvaluatedDays}営業日</span>
                  </div>
                </div>

                {/* Block Bootstrap Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">
                    7日ブロックブートストラップ (2,000回)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">95%信頼区間:</span>
                    <span className="font-black text-indigo-700">
                      [{tuningResult.bootstrapCiLower >= 0 ? `+${tuningResult.bootstrapCiLower}` : tuningResult.bootstrapCiLower}枚, {tuningResult.bootstrapCiUpper >= 0 ? `+${tuningResult.bootstrapCiUpper}` : tuningResult.bootstrapCiUpper}枚]
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">区間下限判定:</span>
                    <span className={`font-bold ${tuningResult.bootstrapCiLower > 0 ? 'text-emerald-600' : 'text-amber-700'}`}>
                      {tuningResult.bootstrapCiLower > 0 ? '下限 > 0 (有意)' : '0以下 (偶発の範囲)'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">ブロック長:</span>
                    <span className="font-bold text-slate-800">{tuningResult.bootstrapBlockLength}日間 (週周期保存)</span>
                  </div>
                </div>

                {/* Statistical Significance Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">検定統計量 & 学習実績</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">標準誤差 (SE):</span>
                    <span className="font-bold text-slate-800">{tuningResult.valStdError}枚</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">検定統計量 t値:</span>
                    <span className="font-black text-slate-800">
                      {tuningResult.tValue}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">初期学習期Gain:</span>
                    <span className="font-black text-emerald-600">+{tuningResult.trainLiftGain}枚</span>
                  </div>
                </div>

                {/* Candidate Weights Card */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block">探索重み (64組ランダム探索)</span>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-600">差枚除数 / 勝率:</span>
                    <span className="font-bold text-slate-800">
                      {tuningResult.candidateWeights.diffCoinDivisor} / {tuningResult.candidateWeights.winRateMultiplier}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-600">全台系 / ブレンド:</span>
                    <span className="font-bold text-slate-800">
                      +{tuningResult.candidateWeights.allHighMultiplier}点 / {tuningResult.candidateWeights.matchingBlendWeight}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-200 text-[11px]">
                    <span className="font-bold text-slate-700">規模補正:</span>
                    <span className="font-bold text-indigo-700">
                      {tuningResult.candidateWeights.scaleFactorEnabled ? '有効 (ON)' : '無効 (OFF)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Machine Number Ranking Backtest Section (台番ランキングの検証) */}
      <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-2xs space-y-4">
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-amber-950/70 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                <Target className="w-3 h-3 text-slate-950" />
                台番ランキングの予測力検証
              </span>
              <span className="text-amber-200 text-xs font-medium">
                ブロックブートストラップ (7日ブロック / 2,000回反復)
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              台番単位の狙い台予測に統計的優位性はあるか？
            </h3>
          </div>

          {hasMachineData && (
            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              {/* Top-N selector */}
              <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-xl border border-white/20 text-xs">
                <span className="text-slate-300 text-[11px]">対象台数:</span>
                {[5, 10, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMachineTopN(n)}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                      machineTopN === n
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    上位{n}台
                  </button>
                ))}
              </div>

              {/* Filter mode selector */}
              <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/20 text-xs">
                <button
                  type="button"
                  onClick={() => setMachineFilterMode('withFilter')}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                    machineFilterMode === 'withFilter'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="根拠日数が3日未満の台をTop-N候補から除外"
                >
                  除外あり (根拠3日以上)
                </button>
                <button
                  type="button"
                  onClick={() => setMachineFilterMode('withoutFilter')}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                    machineFilterMode === 'withoutFilter'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="全台を候補対象として評価"
                >
                  除外なし (全台)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {!hasMachineData ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  台番別データ未取り込み
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  この店舗には台番別の実績データ（各台の差枚数・G数など）が取り込まれていません。店舗管理画面から台番別データ（HTML / CSV）を取り込むと、台番単位の予測力検証（Top-Nリフト、ベースライン対比、ブートストラップ優位性検定）が有効になります。
                </p>
              </div>
            </div>
          ) : !machineBacktestResult || machineBacktestResult.evaluatedDaysCount === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                評価に必要な過去の営業日データが不足しています（台番データを含む営業日が4日以上必要です）。
              </span>
            </div>
          ) : (
            (() => {
              const activeEval =
                machineFilterMode === 'withFilter'
                  ? machineBacktestResult.withFilter
                  : machineBacktestResult.withoutFilter;

              return (
                <div className="space-y-4">
                  {/* Verdict Banner */}
                  <div
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      activeEval.hasEdge
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : 'bg-amber-50/90 border-amber-300 text-amber-950'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {activeEval.hasEdge ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-black text-xs px-2 py-0.5 rounded ${
                              activeEval.hasEdge
                                ? 'bg-emerald-600 text-white'
                                : 'bg-amber-600 text-white'
                            }`}
                          >
                            判定結果: {activeEval.hasEdge ? '統計的優位性あり' : '優位性なし（偶然の範囲内）'}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            95%信頼区間: [{activeEval.ci95[0] >= 0 ? `+${activeEval.ci95[0]}` : activeEval.ci95[0]}枚 〜 {activeEval.ci95[1] >= 0 ? `+${activeEval.ci95[1]}` : activeEval.ci95[1]}枚]
                          </span>
                        </div>
                        <p className="text-xs mt-1.5 leading-relaxed text-slate-800">
                          {activeEval.verdictMessage}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 4 KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        上位{machineTopN}台 実績平均差枚
                      </span>
                      <div className="text-xl font-black mt-1">
                        <span
                          className={
                            activeEval.avgActualDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }
                        >
                          {activeEval.avgActualDiff >= 0
                            ? `+${activeEval.avgActualDiff}`
                            : activeEval.avgActualDiff}
                          枚/台
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        ホール平均: {activeEval.hallAvgDiff >= 0 ? `+${activeEval.hallAvgDiff}` : activeEval.hallAvgDiff}枚
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        平均リフト (対ホール差)
                      </span>
                      <div className="text-xl font-black mt-1">
                        <span
                          className={
                            activeEval.avgLift >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }
                        >
                          {activeEval.avgLift >= 0
                            ? `+${activeEval.avgLift}`
                            : activeEval.avgLift}
                          枚
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        95%区間: [{activeEval.ci95[0]}, {activeEval.ci95[1]}]
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        上位{machineTopN}台 勝率
                      </span>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {activeEval.avgWinRate}%
                      </div>
                      <span className="text-[11px] text-slate-400">
                        ホール平均勝率: {activeEval.hallAvgWinRate}%
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        評価対象営業日数
                      </span>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {activeEval.evaluatedDaysCount}日
                      </div>
                      <span className="text-[11px] text-slate-400">
                        欠測率: {activeEval.avgMissingRate ?? 0}% ({activeEval.totalMissingCount ?? 0}台欠測)
                      </span>
                    </div>
                  </div>

                  {/* Prompt 14 & 15: Ablation Study Comparison Table (台番スコアの要素検証) */}
                  {machineBacktestResult.ablationResults && machineBacktestResult.ablationResults.length > 0 && (
                    <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden shadow-2xs">
                      <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold flex items-center gap-1.5 text-indigo-100">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-300" />
                            台番スコア要素検証（アブレーション分析）
                          </span>
                          <span className="text-[11px] text-indigo-200 block sm:inline">
                            同一期間・同一Top-{machineTopN}台における各要素の寄与と日次ペア差Δの95%信頼区間
                          </span>
                        </div>
                        <span className="text-[10px] bg-indigo-500/30 border border-indigo-400/30 text-indigo-100 px-2 py-0.5 rounded font-mono">
                          全{activeEval.evaluatedDaysCount}日検証
                        </span>
                      </div>

                      {/* Prompt 15 Requirement 3 & 5: Simultaneous comparison notice & short period warning */}
                      <div className="bg-indigo-50/80 border-b border-indigo-100 px-4 py-2 text-[11px] text-indigo-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            複数の要素を同時に比較しています（4パターン同時比較のため多重検定補正としてHolm法を適用）。
                          </span>
                        </div>
                        {activeEval.evaluatedDaysCount < 60 && (
                          <div className="flex items-center gap-1.5 text-amber-800 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              ※ 評価営業日が60日未満（{activeEval.evaluatedDaysCount}日）のため、各信頼区間は「評価期間が短く参考値です」。
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-3">評価パターン</th>
                              <th className="py-2.5 px-3 text-right">平均リフト</th>
                              <th className="py-2.5 px-3 text-right">95%信頼区間</th>
                              <th className="py-2.5 px-3 text-right">勝率</th>
                              <th className="py-2.5 px-3 text-right">
                                全要素対比 (Δ)
                                <span className="block text-[10px] text-slate-400 font-normal font-sans">
                                  日次ペア差 95%CI / Holm
                                </span>
                              </th>
                              <th className="py-2.5 px-3">
                                要素診断・判定
                                <span className="block text-[10px] text-slate-400 font-normal font-sans">
                                  区間判定・重み見直し案
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {machineBacktestResult.ablationResults.map((ab) => (
                              <tr
                                key={ab.variantKey}
                                className={ab.variantKey === 'all' ? 'bg-amber-50/40 font-bold' : 'hover:bg-slate-50'}
                              >
                                <td className="py-2.5 px-3 font-sans text-slate-900 font-bold">
                                  {ab.variantName}
                                  {ab.variantKey === 'all' && (
                                    <span className="ml-1.5 text-[10px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-sans">
                                      基準
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-black">
                                  <span className={ab.avgLift >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                                    {ab.avgLift >= 0 ? `+${ab.avgLift}` : ab.avgLift}枚
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-700 text-[11px]">
                                  <div>
                                    [{ab.ci95[0] >= 0 ? '+' : ''}{ab.ci95[0]}, {ab.ci95[1] >= 0 ? '+' : ''}{ab.ci95[1]}]
                                  </div>
                                  {ab.isShortPeriodWarning && (
                                    <span className="text-[9px] text-amber-600 font-sans block">
                                      ※評価期間が短く参考値です
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-800">
                                  {ab.winRate}%
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {ab.variantKey === 'all' ? (
                                    <span className="text-slate-400 font-sans">-</span>
                                  ) : (
                                    <div>
                                      <span
                                        className={`font-bold ${
                                          ab.liftDelta > 0
                                            ? 'text-emerald-600'
                                            : ab.liftDelta < 0
                                            ? 'text-rose-600'
                                            : 'text-slate-500'
                                        }`}
                                      >
                                        {ab.liftDelta >= 0 ? `+${ab.liftDelta}` : ab.liftDelta}枚
                                      </span>
                                      {ab.deltaCi95 && (
                                        <div className="text-[10px] text-slate-600 font-mono">
                                          [{ab.deltaCi95[0] >= 0 ? '+' : ''}{ab.deltaCi95[0]}, {ab.deltaCi95[1] >= 0 ? '+' : ''}{ab.deltaCi95[1]}]
                                        </div>
                                      )}
                                      {ab.isShortPeriodWarning && (
                                        <span className="text-[9px] text-amber-600 font-sans block">
                                          ※評価期間が短く参考値です
                                        </span>
                                      )}
                                      {ab.holmPValue !== undefined && (
                                        <div className="text-[9px] text-indigo-700 font-mono font-medium mt-0.5">
                                          Holm p={ab.holmPValue < 0.001 ? '<0.001' : ab.holmPValue.toFixed(3)}
                                          {ab.holmCi95 && ` [${ab.holmCi95[0] >= 0 ? '+' : ''}${ab.holmCi95[0]}, ${ab.holmCi95[1] >= 0 ? '+' : ''}${ab.holmCi95[1]}]`}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-sans text-[11px]">
                                  {ab.variantKey === 'all' ? (
                                    <span className="text-slate-500">
                                      {ab.ci95[0] > 0 ? '優位性あり (CI下限>0)' : '優位性未確認'}
                                    </span>
                                  ) : ab.verdict === 'contributing' ? (
                                    <div>
                                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                        寄与あり（下限 &gt; 0）
                                      </span>
                                      <div className="text-[10px] text-emerald-700 mt-0.5">
                                        除去でリフト低下（全要素に有意なプラス貢献）
                                      </div>
                                    </div>
                                  ) : ab.verdict === 'better_removed' ? (
                                    <div>
                                      <span className="inline-flex items-center gap-1 text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-bold">
                                        <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                        除去したほうが良い（上限 &lt; 0）
                                      </span>
                                      <div className="text-[10px] text-slate-600 mt-0.5">
                                        {ab.recommendZeroWeight
                                          ? '重み0への見直し案あり（自動変更なし）'
                                          : 'データ不足のため判定できません（90日未満）'}
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-medium">
                                        判定できない（差は誤差の範囲）
                                      </span>
                                      <div className="text-[10px] text-slate-500 mt-0.5">
                                        {ab.recommendZeroWeight
                                          ? '上限小のため重み0案あり（自動変更なし）'
                                          : 'データ不足のため判定できません'}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Suggested Machine Weights & Rolling Validation Panel (Prompt 14) */}
                      <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">店舗設定ステータス:</span>
                            {isCustomMachineWeightsApplied ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                <Check className="w-3 h-3 text-indigo-600" />
                                店舗カスタム台番重み適用中
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                既定重み適用中（標準）
                              </span>
                            )}
                          </div>
                          {isCustomMachineWeightsApplied && onSaveStoreMachineWeights && (
                            <button
                              type="button"
                              onClick={() => onSaveStoreMachineWeights(undefined)}
                              className="text-[11px] text-slate-600 hover:text-slate-800 underline flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              既定の重みにリセット
                            </button>
                          )}
                        </div>

                        {suggestedZeroWeights && (
                          <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                                  <Info className="w-3.5 h-3.5 text-amber-700" />
                                  効かない要素の見直し案（自動では変更されません）
                                </span>
                                <p className="text-[11px] text-amber-800 mt-0.5">
                                  アブレーション検証でリフト低下が認められなかった要素: {suggestedZeroWeights.changedNames.join(', ')}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleRunMachineRollingValidation}
                                disabled={isMachineRollingRunning}
                                className="shrink-0 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                {isMachineRollingRunning ? '検証中...' : 'ローリング検証(3〜5分割)で確認'}
                              </button>
                            </div>

                            {machineRollingResult && (
                              <div className="mt-2 pt-2 border-t border-amber-200/80 bg-white/70 rounded p-2.5 text-xs space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold text-slate-800">
                                    ローリング検証結果 ({machineRollingResult.numSplits}分割 / {machineRollingResult.valEvaluatedDays}営業日):
                                  </span>
                                  <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                                    machineRollingResult.isRecommended
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {machineRollingResult.isRecommended ? '【採用推奨】有意' : '【標準維持推奨】有意差なし'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-700">
                                  <div className="bg-white p-1.5 rounded border border-slate-200">
                                    <div className="text-[10px] text-slate-500 font-sans">各分割ゲイン</div>
                                    <div className="font-bold">[{machineRollingResult.splitGains.map(g => g >= 0 ? `+${g}` : `${g}`).join(', ')}]枚</div>
                                  </div>
                                  <div className="bg-white p-1.5 rounded border border-slate-200">
                                    <div className="text-[10px] text-slate-500 font-sans">全分割平均</div>
                                    <div className="font-bold">{machineRollingResult.meanSplitGain >= 0 ? `+${machineRollingResult.meanSplitGain}` : machineRollingResult.meanSplitGain}枚</div>
                                  </div>
                                  <div className="bg-white p-1.5 rounded border border-slate-200">
                                    <div className="text-[10px] text-slate-500 font-sans">95%信頼区間</div>
                                    <div className="font-bold">[{machineRollingResult.bootstrapCiLower >= 0 ? `+` : ''}{machineRollingResult.bootstrapCiLower}, {machineRollingResult.bootstrapCiUpper >= 0 ? `+` : ''}{machineRollingResult.bootstrapCiUpper}]</div>
                                  </div>
                                  <div className="bg-white p-1.5 rounded border border-slate-200">
                                    <div className="text-[10px] text-slate-500 font-sans">単一分割依存</div>
                                    <div className="font-bold text-emerald-700">全分割で判定済</div>
                                  </div>
                                </div>
                                <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                                  {machineRollingResult.verdictMessage}
                                </p>
                                {onSaveStoreMachineWeights && (
                                  <div className="pt-1.5 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => onSaveStoreMachineWeights(suggestedZeroWeights.weights)}
                                      className="text-xs px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      この見直し案を店舗の重みとして保存
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {!suggestedZeroWeights && (
                          <div className="text-[11px] text-slate-500 bg-white/60 rounded-lg p-2.5 border border-slate-200">
                            ※ 重み0の見直し案提示条件: 評価営業日90日以上、かつΔの95%信頼区間上限が全要素リフトの10%未満の安全条件を満たした場合のみ提示されます（自動では変更されません）。
                            {activeEval.evaluatedDaysCount < 90 && (
                              <span className="block text-slate-400 mt-0.5">
                                現在の評価期間は{activeEval.evaluatedDaysCount}日のため、データ蓄積待ち（90日未満）です。
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Baseline Comparison Table */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        台番ランキング vs 各ベースライン比較（Top-{machineTopN}台）
                      </span>
                      <span className="text-[11px] text-slate-500">
                        同機種内ランダムはシード固定100回シミュレーション平均
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">予測手法</th>
                            <th className="py-2 px-3 text-right">実績平均差枚</th>
                            <th className="py-2 px-3 text-right">対ホール平均リフト</th>
                            <th className="py-2 px-3 text-right">勝率</th>
                            <th className="py-2 px-3">手法の説明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {/* 1. Target Machine Ranking */}
                          <tr className="bg-amber-50/50 font-bold">
                            <td className="py-2.5 px-3 text-amber-950 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              当システム 台番ランキング
                            </td>
                            <td className="py-2.5 px-3 text-right font-black">
                              <span
                                className={
                                  activeEval.avgActualDiff >= 0
                                    ? 'text-emerald-600'
                                    : 'text-rose-600'
                                }
                              >
                                {activeEval.avgActualDiff >= 0
                                  ? `+${activeEval.avgActualDiff}`
                                  : activeEval.avgActualDiff}
                                枚
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-black">
                              <span
                                className={
                                  activeEval.avgLift >= 0
                                    ? 'text-emerald-700'
                                    : 'text-rose-600'
                                }
                              >
                                {activeEval.avgLift >= 0
                                  ? `+${activeEval.avgLift}`
                                  : activeEval.avgLift}
                                枚
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                              {activeEval.avgWinRate}%
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-normal text-[11px]">
                              機種スコア・縮小推定差枚・高設定挙動・末尾/ゾロ目による加算複合スコア
                            </td>
                          </tr>

                          {/* 2. Random within Model */}
                          <tr>
                            <td className="py-2.5 px-3 text-slate-800 font-bold">
                              同機種内ランダム (100回平均)
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              {activeEval.baselines.randomWithinModel.avgDiff >= 0
                                ? `+${activeEval.baselines.randomWithinModel.avgDiff}`
                                : activeEval.baselines.randomWithinModel.avgDiff}
                              枚
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              <span
                                className={
                                  activeEval.baselines.randomWithinModel.avgLift >= 0
                                    ? 'text-slate-800'
                                    : 'text-slate-400'
                                }
                              >
                                {activeEval.baselines.randomWithinModel.avgLift >= 0
                                  ? `+${activeEval.baselines.randomWithinModel.avgLift}`
                                  : activeEval.baselines.randomWithinModel.avgLift}
                                枚
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {activeEval.baselines.randomWithinModel.avgWinRate}%
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              選定機種と同一機種の中から無作為に台番を選んだ場合の実績
                            </td>
                          </tr>

                          {/* 3. Model Average */}
                          <tr>
                            <td className="py-2.5 px-3 text-slate-800 font-bold">
                              同機種の台平均
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              {activeEval.baselines.modelAverage.avgDiff >= 0
                                ? `+${activeEval.baselines.modelAverage.avgDiff}`
                                : activeEval.baselines.modelAverage.avgDiff}
                              枚
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              <span
                                className={
                                  activeEval.baselines.modelAverage.avgLift >= 0
                                    ? 'text-slate-800'
                                    : 'text-slate-400'
                                }
                              >
                                {activeEval.baselines.modelAverage.avgLift >= 0
                                  ? `+${activeEval.baselines.modelAverage.avgLift}`
                                  : activeEval.baselines.modelAverage.avgLift}
                                枚
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {activeEval.baselines.modelAverage.avgWinRate}%
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              選定機種の当日全台平均（機種選びの良さのみを反映）
                            </td>
                          </tr>

                          {/* 4. Prior Day Diff */}
                          <tr>
                            <td className="py-2.5 px-3 text-slate-800 font-bold">
                              前日差枚順 (据え置き狙い)
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              {activeEval.baselines.priorDayDiff.avgDiff >= 0
                                ? `+${activeEval.baselines.priorDayDiff.avgDiff}`
                                : activeEval.baselines.priorDayDiff.avgDiff}
                              枚
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              <span
                                className={
                                  activeEval.baselines.priorDayDiff.avgLift >= 0
                                    ? 'text-slate-800'
                                    : 'text-slate-400'
                                }
                              >
                                {activeEval.baselines.priorDayDiff.avgLift >= 0
                                  ? `+${activeEval.baselines.priorDayDiff.avgLift}`
                                  : activeEval.baselines.priorDayDiff.avgLift}
                                枚
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {activeEval.baselines.priorDayDiff.avgWinRate}%
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              前日の差枚数が最も高かった上位{machineTopN}台を選んだ場合の実績
                            </td>
                          </tr>

                          {/* 5. Random Machine */}
                          <tr>
                            <td className="py-2.5 px-3 text-slate-800 font-bold">
                              ホール全体ランダム
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              {activeEval.baselines.randomMachine.avgDiff >= 0
                                ? `+${activeEval.baselines.randomMachine.avgDiff}`
                                : activeEval.baselines.randomMachine.avgDiff}
                              枚
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              <span className="text-slate-400">
                                {activeEval.baselines.randomMachine.avgLift >= 0
                                  ? `+${activeEval.baselines.randomMachine.avgLift}`
                                  : activeEval.baselines.randomMachine.avgLift}
                                枚
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {activeEval.baselines.randomMachine.avgWinRate}%
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              当日ホール全台から無作為に{machineTopN}台を選んだ場合の実績
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Daily Machine Log */}
                  {activeEval.dailyEvaluations.length > 0 && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          日次実績ログ (直近{Math.min(10, activeEval.dailyEvaluations.length)}日)
                        </span>
                        {activeEval.dailyEvaluations.length > 10 && (
                          <button
                            type="button"
                            onClick={() => setShowAllMachineDays(!showAllMachineDays)}
                            className="text-[11px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer flex items-center gap-0.5"
                          >
                            {showAllMachineDays ? '直近10日に戻す' : `全${activeEval.dailyEvaluations.length}日を展開`}
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] text-left">
                          <thead className="bg-slate-200/60 text-slate-600 font-bold">
                            <tr>
                              <th className="py-1.5 px-2">日付</th>
                              <th className="py-1.5 px-2">ホール平均</th>
                              <th className="py-1.5 px-2">選出台番</th>
                              <th className="py-1.5 px-2 text-right">Top-{machineTopN}平均</th>
                              <th className="py-1.5 px-2 text-right">リフト</th>
                              <th className="py-1.5 px-2 text-right">勝率</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60 bg-white">
                            {(showAllMachineDays
                              ? activeEval.dailyEvaluations
                              : activeEval.dailyEvaluations.slice(-10)
                            ).map((de) => (
                              <tr key={de.date} className="hover:bg-slate-50">
                                <td className="py-1.5 px-2 whitespace-nowrap font-medium text-slate-800">
                                  {de.date} ({de.dayOfWeek})
                                  {de.isSpecialDay && (
                                    <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-bold">
                                      特日
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-slate-600">
                                  {de.hallAvgDiff >= 0 ? `+${de.hallAvgDiff}` : de.hallAvgDiff}枚
                                </td>
                                <td className="py-1.5 px-2 text-slate-600 font-mono text-[10px] max-w-[200px] truncate">
                                  {de.selectedMachineNums.join(', ')}
                                </td>
                                <td className="py-1.5 px-2 text-right font-bold">
                                  <span
                                    className={
                                      de.actualAvgDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                    }
                                  >
                                    {de.actualAvgDiff >= 0 ? `+${de.actualAvgDiff}` : de.actualAvgDiff}枚
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right font-bold">
                                  <span
                                    className={
                                      de.actualLift >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                    }
                                  >
                                    {de.actualLift >= 0 ? `+${de.actualLift}` : de.actualLift}枚
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-700">
                                  {de.actualWinRate}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
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
