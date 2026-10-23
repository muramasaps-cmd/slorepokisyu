import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DailyRecord, SpecialDayRules, RankingWeights, MachineRankingWeights, IslandDefinition } from '../data/types';
import {
  calculateTargetMachineRanking,
  TargetMachineRankingResult,
  TargetMachineScore,
  MachineConfidenceLevel,
} from '../utils/targetMachineRanking';
import { runMachineBacktest, MachineBacktestResult, MachineBacktestOptions } from '../utils/backtestEngine';
import { FeatureIndex } from '../utils/targetRankingEngine';
import { parseIslandConfig, getMachineIsland } from '../utils/islandUtils';
import { formatNumber } from '../utils/formatters';
import {
  computeMachineBacktestCacheKey,
  getMemoryBacktestCache,
  setMemoryBacktestCache,
  getBacktestFromIdb,
  putBacktestToIdb,
} from '../utils/machineBacktestCache';
import type {
  MachineBacktestWorkerRequest,
  MachineBacktestWorkerResponse,
} from '../workers/machineBacktestWorker';
import { TargetRankingTable, TargetRankingRow } from './TargetRankingTable';
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
  RotateCw,
  Scale,
  Play,
} from 'lucide-react';

interface TargetMachineRankingProps {
  targetDate: string;
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  customWeights?: RankingWeights;
  customMachineWeights?: MachineRankingWeights;
  islandConfig?: string;
  onOpenStoreManager?: () => void;
  includeReusedMachines?: boolean;
  aliasDictionary?: Record<string, string>;
  storeId?: string;
  featureIndex?: FeatureIndex;
  funnelModelName?: string | null;
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
    if (stats.shrunkPayoutRate !== undefined) {
      reasons.push(
        `経験ベイズ推定出率: ${stats.shrunkPayoutRate}% (基準5000G期待差枚: ${stats.shrunkDiff >= 0 ? '+' : ''}${formatNumber(stats.shrunkDiff)}枚)`
      );
    }
  }

  // 2. High Setting Frequency
  if (stats.highSettingCount > 0 && evidenceDays > 0 && reasons.length < 3) {
    reasons.push(
      `高設定挙動履歴 ${evidenceDays}日中${stats.highSettingCount}日発生 (${stats.highSettingRate}%)`
    );
  }

  // 3. Tail match / Zoro
  if (stats.isTailMatch && reasons.length < 3) {
    reasons.push(`対象日の特定末尾と台番末尾が一致 (+${contributions.tailBonusScore}pt)`);
  } else if (stats.isZoro && reasons.length < 3) {
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
  customMachineWeights,
  islandConfig,
  onOpenStoreManager,
  includeReusedMachines = false,
  aliasDictionary,
  storeId,
  featureIndex,
  funnelModelName,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>(() => funnelModelName || 'all');

  useEffect(() => {
    if (funnelModelName) {
      setSelectedModel(funnelModelName);
    } else {
      setSelectedModel('all');
    }
  }, [funnelModelName]);
  const [selectedTail, setSelectedTail] = useState<string>('all');
  const [selectedIsland, setSelectedIsland] = useState<string>('all');
  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);
  const [diffDisplayMode, setDiffDisplayMode] = useState<'std' | 'actual'>('std');

  const [selectedConfidence, setSelectedConfidence] = useState<'all' | '高' | '中' | '低'>('all');
  const [minEvidenceDays, setMinEvidenceDays] = useState<number>(0);
  const [includeLowConfidence, setIncludeLowConfidence] = useState<boolean>(true);

  // Check if store has machine-level data
  const hasMachineData = useMemo(() => {
    return (dailyRecords || []).some((r) => r.machines && r.machines.length > 0);
  }, [dailyRecords]);

  // Island definitions from config text
  const islandDefinitions: IslandDefinition[] = useMemo(() => {
    return parseIslandConfig(islandConfig);
  }, [islandConfig]);

  // Backtest options (stable memo: topN 20 for top 20 machines lift evaluation)
  const backtestOptions = useMemo<MachineBacktestOptions>(() => ({
    topN: 20,
    minEvidenceDays: 3,
    blockLength: 7,
    bootstrapIterations: 500, // fast run for UI indicator
    weights: customMachineWeights,
  }), [customMachineWeights]);

  // Deterministic cache key (Requirement 1a: storeId + signature + weights + rules + options)
  const cacheKey = useMemo(() => {
    if (!hasMachineData) return '';
    return computeMachineBacktestCacheKey(
      storeId,
      dailyRecords,
      customMachineWeights,
      specialDayRules,
      backtestOptions,
      aliasDictionary,
      includeReusedMachines
    );
  }, [storeId, dailyRecords, customMachineWeights, specialDayRules, backtestOptions, hasMachineData, aliasDictionary, includeReusedMachines]);

  // Backtest state: check memory cache synchronously first (Requirement 1a)
  const [backtestResult, setBacktestResult] = useState<MachineBacktestResult | null>(() => {
    if (!cacheKey) return null;
    return getMemoryBacktestCache(cacheKey) || null;
  });
  const [backtestProgress, setBacktestProgress] = useState<number | null>(null);
  const [isBacktestRunning, setIsBacktestRunning] = useState<boolean>(() => {
    if (!cacheKey) return false;
    return !getMemoryBacktestCache(cacheKey);
  });

  const workerRef = useRef<Worker | null>(null);

  // Asynchronous backtest loader using Web Worker and IDB cache (Requirement 1b, 1c, 1d)
  useEffect(() => {
    if (!hasMachineData || !cacheKey) {
      setBacktestResult(null);
      setIsBacktestRunning(false);
      setBacktestProgress(null);
      return;
    }

    // 1. Check in-memory cache
    const memCached = getMemoryBacktestCache(cacheKey);
    if (memCached) {
      setBacktestResult(memCached);
      setIsBacktestRunning(false);
      setBacktestProgress(null);
      return;
    }

    let isCancelled = false;
    setIsBacktestRunning(true);
    setBacktestProgress(0);

    // 2. Check IndexedDB cache
    getBacktestFromIdb(cacheKey)
      .then((idbCached) => {
        if (isCancelled) return;
        if (idbCached) {
          setMemoryBacktestCache(cacheKey, idbCached);
          setBacktestResult(idbCached);
          setIsBacktestRunning(false);
          setBacktestProgress(null);
          return;
        }

        // 3. Run in Web Worker
        let worker: Worker | null = null;
        try {
          worker = new Worker(
            new URL('../workers/machineBacktestWorker.ts', import.meta.url),
            { type: 'module' }
          );
          workerRef.current = worker;
        } catch (err) {
          console.warn('Worker creation failed, falling back to setTimeout:', err);
          worker = null;
        }

        if (worker) {
          worker.onmessage = (event: MessageEvent<MachineBacktestWorkerResponse>) => {
            if (isCancelled) return;
            const data = event.data;
            if (data.type === 'PROGRESS') {
              setBacktestProgress(data.progress);
            } else if (data.type === 'RESULT') {
              setMemoryBacktestCache(cacheKey, data.result);
              putBacktestToIdb(cacheKey, data.result, storeId).catch(() => {});
              setBacktestResult(data.result);
              setIsBacktestRunning(false);
              setBacktestProgress(null);
            } else if (data.type === 'ERROR') {
              console.error('Backtest worker error:', data.error);
              setIsBacktestRunning(false);
              setBacktestProgress(null);
            }
          };

          worker.postMessage({
            type: 'START_BACKTEST',
            dailyRecords,
            specialDayRules,
            options: backtestOptions,
          } satisfies MachineBacktestWorkerRequest);
        } else {
          // 4. Fallback: setTimeout chunking without blocking UI (Requirement 1d)
          setTimeout(() => {
            if (isCancelled) return;
            try {
              const res = runMachineBacktest(dailyRecords, specialDayRules, {
                ...backtestOptions,
                onProgress: (p) => {
                  if (!isCancelled) setBacktestProgress(p);
                },
              });
              if (isCancelled) return;
              setMemoryBacktestCache(cacheKey, res);
              putBacktestToIdb(cacheKey, res, storeId).catch(() => {});
              setBacktestResult(res);
            } catch (err) {
              console.error('Fallback backtest error:', err);
            } finally {
              if (!isCancelled) {
                setIsBacktestRunning(false);
                setBacktestProgress(null);
              }
            }
          }, 20);
        }
      })
      .catch((err) => {
        console.warn('IDB lookup error:', err);
      });

    return () => {
      isCancelled = true;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [cacheKey, dailyRecords, specialDayRules, backtestOptions, hasMachineData]);

  // Calculate machine ranking for target date immediately (Requirement 2: reuse featureIndex)
  const rankingResult: TargetMachineRankingResult | null = useMemo(() => {
    if (!hasMachineData || !targetDate) return null;
    return calculateTargetMachineRanking(targetDate, dailyRecords, specialDayRules, customMachineWeights, {
      rankingWeights: customWeights,
      includeReusedMachines,
      aliasDictionary,
      featureIndex,
    });
  }, [targetDate, dailyRecords, specialDayRules, customWeights, customMachineWeights, hasMachineData, includeReusedMachines, aliasDictionary, featureIndex]);

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
        if (!includeLowConfidence && m.confidence === '低') return false;
        if (selectedConfidence !== 'all') {
          if (selectedConfidence === '高' && m.confidence !== '高') return false;
          if (selectedConfidence === '中' && m.confidence === '低') return false;
          if (selectedConfidence === '低' && m.confidence !== '低') return false;
        }
        if (minEvidenceDays > 0 && m.evidenceDays < minEvidenceDays) return false;
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
  }, [rankingResult, selectedModel, selectedTail, selectedIsland, islandDefinitions, selectedConfidence, minEvidenceDays, includeLowConfidence]);

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

  const isNoEdge = !isBacktestRunning && Boolean(backtestResult && !backtestResult.withFilter.hasEdge);

  // Requirement 8: Top 20 expected diff average and calibration calculation
  const top20Rankings = useMemo(() => {
    return rankingResult?.rankings.slice(0, 20) || [];
  }, [rankingResult]);

  const top20AvgExpectedDiff = useMemo(() => {
    if (top20Rankings.length === 0) return 0;
    const sum = top20Rankings.reduce((acc, r) => acc + (r.stats.expectedDiffStd ?? r.stats.shrunkDiff), 0);
    return Math.round(sum / top20Rankings.length);
  }, [top20Rankings]);

  const calibrationInfo = useMemo(() => {
    if (!backtestResult) return null;
    const actualLift = backtestResult.withFilter.avgLift;
    const ci95 = backtestResult.withFilter.ci95;
    const isUnderperforming = top20AvgExpectedDiff > 100 && actualLift < top20AvgExpectedDiff * 0.70;
    const realizedPct = top20AvgExpectedDiff > 0 ? Math.max(0, Math.round((actualLift / top20AvgExpectedDiff) * 100)) : 0;
    return {
      actualLift,
      ci95,
      isUnderperforming,
      realizedPct,
    };
  }, [backtestResult, top20AvgExpectedDiff]);

  const handleRunBacktest = () => {
    if (isBacktestRunning) return;
    setIsBacktestRunning(true);
    setBacktestProgress(0);
    setTimeout(() => {
      try {
        const res = runMachineBacktest(dailyRecords, specialDayRules, {
          ...backtestOptions,
          onProgress: (p) => setBacktestProgress(p),
        });
        if (cacheKey) {
          setMemoryBacktestCache(cacheKey, res);
          putBacktestToIdb(cacheKey, res, storeId).catch(() => {});
        }
        setBacktestResult(res);
      } catch (err) {
        console.error('Backtest error:', err);
      } finally {
        setIsBacktestRunning(false);
        setBacktestProgress(null);
      }
    }, 50);
  };

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
          {isBacktestRunning ? (
            <div className="px-3 py-1.5 rounded-xl border border-sky-500/50 bg-sky-950/80 text-sky-200 text-xs font-bold flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
              <span>台番予測: 検証中… {backtestProgress !== null ? `(${backtestProgress}%)` : ''}</span>
            </div>
          ) : backtestResult ? (
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
          ) : (
            <button
              type="button"
              onClick={handleRunBacktest}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>台番バックテストを実行</span>
            </button>
          )}
        </div>
      </div>

      {/* 30-6: 画面の期待差枚と実績リフトの並置・較正表示 (Requirement 1 & 2) */}
      <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
            <Scale className="w-4 h-4 text-indigo-600" />
            <span>表示値の較正（期待差枚 vs 過去検証実績リフト）</span>
          </div>
          {backtestResult && (
            <span
              className={`px-2 py-0.5 rounded-full text-2xs font-bold border flex items-center gap-1 ${
                backtestResult.withFilter.hasEdge
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {backtestResult.withFilter.hasEdge ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  優位性あり
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  優位性なし
                </>
              )}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center font-mono">
          {/* 画面の期待差枚 (上位20台平均) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-center">
            <div className="text-[11px] text-slate-500 font-sans font-bold">画面の期待差枚 (上位20台平均)</div>
            <div className={`text-lg font-black ${top20AvgExpectedDiff >= 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
              {top20AvgExpectedDiff >= 0 ? `+${formatNumber(top20AvgExpectedDiff)}` : formatNumber(top20AvgExpectedDiff)}枚
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">当日の台番号別予測スコア上位20台</div>
          </div>

          {/* 過去検証の実績リフト (上位20台・95%区間) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-center">
            <div className="text-[11px] text-slate-500 font-sans font-bold">過去検証の実績リフト (上位20台・95%区間)</div>
            {isBacktestRunning ? (
              <div className="text-xs font-bold text-sky-600 flex items-center justify-center gap-1.5 py-1">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>検証中... {backtestProgress !== null ? `(${backtestProgress}%)` : ''}</span>
              </div>
            ) : backtestResult ? (
              <div>
                <span className={`text-lg font-black ${backtestResult.withFilter.avgLift >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                  {backtestResult.withFilter.avgLift >= 0 ? `+${formatNumber(backtestResult.withFilter.avgLift)}` : formatNumber(backtestResult.withFilter.avgLift)}枚
                </span>
                <span className="text-xs text-slate-500 font-normal ml-1.5">
                  [95%区間: {backtestResult.withFilter.ci95[0]}枚〜{backtestResult.withFilter.ci95[1]}枚]
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-0.5">
                <span className="text-xs text-slate-400">未検証</span>
                <button
                  type="button"
                  onClick={handleRunBacktest}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  検証を実行
                </button>
              </div>
            )}
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">過去全日の翌日実測検証結果</div>
          </div>
        </div>

        {/* 較正警告表示 */}
        {calibrationInfo?.isUnderperforming && (
          <div className="p-3 bg-amber-500/10 border border-amber-300 rounded-xl text-amber-950 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-amber-900 block text-[11px]">
                過去の実績では、表示の期待値のうち約{calibrationInfo.realizedPct}%しか実現していません
              </span>
              <p className="text-[11px] text-amber-900/90 leading-relaxed font-sans">
                表示の上位20台平均 +{top20AvgExpectedDiff}枚 に対し、過去検証実績リフトは {calibrationInfo.actualLift >= 0 ? '+' : ''}{calibrationInfo.actualLift}枚 [95%区間: {calibrationInfo.ci95[0]}枚〜{calibrationInfo.ci95[1]}枚] です。期待差枚の過大推定にご注意ください。
              </p>
            </div>
          </div>
        )}
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

      {/* Target Ranking Table (Unified Component) */}
      <TargetRankingTable
        rankingType="machine"
        showStoreColumn={false}
        rows={filteredRankings.map((mach) => {
          const islName = getMachineIsland(mach.machineNum, islandDefinitions);
          const expectedDiff =
            diffDisplayMode === 'std'
              ? mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff
              : mach.stats.expectedDiffActual ?? mach.stats.shrunkDiff;
          const reasons = formatMachineReasons(mach);

          return {
            id: String(mach.machineNum),
            rank: mach.rank,
            modelName: mach.modelName,
            machineNum: mach.machineNum,
            islandName: islName,
            confidence: mach.confidence,
            reliabilityRate: mach.stats.reliabilityRate,
            evidenceDays: mach.evidenceDays,
            cohortEvidenceDays: mach.cohortEvidenceDays,
            expectedDiff,
            interval80:
              diffDisplayMode === 'std'
                ? mach.stats.expectedDiff80Range || mach.interval80 || undefined
                : mach.interval80 || undefined,
            uncertainty80:
              mach.stats.expectedDiffMargin80 !== undefined
                ? {
                    min: (mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff) - mach.stats.expectedDiffMargin80,
                    max: (mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff) + mach.stats.expectedDiffMargin80,
                    margin: mach.stats.expectedDiffMargin80,
                  }
                : undefined,
            avgGames: mach.stats.avgGames,
            shrunkPayoutRate: mach.stats.shrunkPayoutRate,
            score: mach.totalScore,
            reasons,
            verification: {
              status: isBacktestRunning
                ? 'testing'
                : backtestResult
                ? backtestResult.withFilter.hasEdge
                  ? 'edge'
                  : 'noEdge'
                : 'untested',
              hasEdge: backtestResult?.withFilter.hasEdge,
              avgLift: backtestResult?.withFilter.avgLift,
              ci95: backtestResult?.withFilter.ci95,
              onRunTest: handleRunBacktest,
              isTesting: isBacktestRunning,
            },
            history: mach.history,
            contributions: mach.contributions,
          };
        })}
        toolbar={{
          enabled: true,
          availableModels,
          availableIslands,
          selectedModel,
          onModelChange: setSelectedModel,
          selectedTail,
          onTailChange: setSelectedTail,
          selectedIsland,
          onIslandChange: setSelectedIsland,
          selectedConfidence,
          onConfidenceChange: setSelectedConfidence,
          minEvidenceDays,
          onMinEvidenceDaysChange: setMinEvidenceDays,
          diffMetric: diffDisplayMode,
          onDiffMetricChange: setDiffDisplayMode,
          includeLowConfidence,
          onToggleLowConfidence: setIncludeLowConfidence,
          exportStoreName: storeId || '店舗',
          exportTargetDate: targetDate,
          totalCount: rankingResult?.rankings.length || 0,
          filteredCount: filteredRankings.length,
        }}
        emptyMessage="指定された条件（機種・末尾・島）に一致する台番候補はありませんでした。"
      />
    </div>
  );
};
