import React, { useState, useMemo, useEffect } from 'react';
import { DailyRecord, SpecialDayRules, RankingWeights, MachineRankingWeights } from '../data/types';
import {
  calculateTargetDateRanking,
  buildFeatureIndex,
  FeatureIndex,
  TargetDateForecast,
  ModelTargetScore,
} from '../utils/targetRankingEngine';
import { formatYen, formatCoins, formatNumber } from '../utils/formatters';
import { UnitMode } from './Header';
import { TargetMachineRanking, formatMachineReasons } from './TargetMachineRanking';
import { TargetRankingTable } from './TargetRankingTable';
import { calculateTargetMachineRanking, TargetMachineRankingResult } from '../utils/targetMachineRanking';
import {
  loadTargetCheckStatus,
  saveTargetCheckStatus,
  filterAndRollupTargetList,
  generateTargetListCopyText,
  generateTargetListCsv,
  MachineCheckStatus,
  CrossStoreMachineRank,
} from '../utils/crossStoreRanking';
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
  Copy,
  Download,
  Ban,
  Gamepad2,
  RotateCcw,
  Check,
  CheckSquare,
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
  customWeights?: RankingWeights;
  customMachineWeights?: MachineRankingWeights;
  islandConfig?: string;
  includeReusedMachines?: boolean;
  aliasDictionary?: Record<string, string>;
  onNavigateToValidation?: () => void;
  onOpenStoreManager?: () => void;
  storeId?: string;
  storeName?: string;
  funnelModelName?: string | null;
  onSelectFunnelModel?: (modelName: string | null) => void;
  targetSection?: string;
  precomputedMachineRankingResult?: TargetMachineRankingResult | null;
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
  customWeights,
  customMachineWeights,
  islandConfig,
  includeReusedMachines = false,
  aliasDictionary,
  onNavigateToValidation,
  onOpenStoreManager,
  storeId,
  storeName,
  funnelModelName,
  onSelectFunnelModel,
  targetSection,
  precomputedMachineRankingResult,
}) => {
  const [modelFilter, setModelFilter] = useState<ModelFilterType>('all');
  const [modelSort, setModelSort] = useState<ModelSortType>('score');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [includeReusedState, setIncludeReusedState] = useState<boolean>(includeReusedMachines);

  // Step expansion states (Prompt 47)
  const [isStep3Expanded, setIsStep3Expanded] = useState<boolean>(() => {
    return targetSection === 'models' || targetSection === 'target-model-ranking';
  });
  const [isStep4Expanded, setIsStep4Expanded] = useState<boolean>(() => {
    return targetSection === 'machines' || targetSection === 'target-machine-ranking';
  });
  const [isStep5Expanded, setIsStep5Expanded] = useState<boolean>(() => {
    return targetSection === 'checklist' || targetSection === 'target-checklist';
  });

  useEffect(() => {
    if (targetSection === 'models' || targetSection === 'target-model-ranking') {
      setIsStep3Expanded(true);
    } else if (targetSection === 'machines' || targetSection === 'target-machine-ranking') {
      setIsStep4Expanded(true);
    } else if (targetSection === 'checklist' || targetSection === 'target-checklist') {
      setIsStep5Expanded(true);
    }
  }, [targetSection]);

  // Sync state if prop changes
  useEffect(() => {
    setIncludeReusedState(includeReusedMachines);
  }, [includeReusedMachines]);

  // Precompute shared feature index (Requirement 2: 重複計算をなくす)
  const sharedFeatureIndex = useMemo<FeatureIndex | undefined>(() => {
    if (!dailyRecords || dailyRecords.length === 0) return undefined;
    return buildFeatureIndex(dailyRecords, specialDayRules, oldEventDays, {
      includeReusedMachines: includeReusedState,
      aliasDictionary,
    });
  }, [dailyRecords, specialDayRules, oldEventDays, includeReusedState, aliasDictionary]);

  // Compute forecast for target date
  const forecast = useMemo<TargetDateForecast | null>(() => {
    if (!targetDate) return null;
    return calculateTargetDateRanking(
      targetDate,
      dailyRecords,
      specialDayRules,
      oldEventDays,
      customWeights,
      {
        includeReusedMachines: includeReusedState,
        aliasDictionary,
        featureIndex: sharedFeatureIndex,
      }
    );
  }, [targetDate, dailyRecords, specialDayRules, oldEventDays, customWeights, includeReusedState, aliasDictionary, sharedFeatureIndex]);

  // Machine ranking for Step ④ & ⑤ (Prompt 59: reuse precomputedMachineRankingResult if provided)
  const machineRankingResult = useMemo(() => {
    if (
      precomputedMachineRankingResult !== undefined &&
      includeReusedState === (includeReusedMachines ?? false)
    ) {
      return precomputedMachineRankingResult;
    }
    if (!dailyRecords || dailyRecords.length === 0 || !targetDate) return null;
    const hasMach = dailyRecords.some((r) => r.machines && r.machines.length > 0);
    if (!hasMach) return null;
    return calculateTargetMachineRanking(targetDate, dailyRecords, specialDayRules, customMachineWeights, {
      rankingWeights: customWeights,
      includeReusedMachines: includeReusedState,
      aliasDictionary,
      featureIndex: sharedFeatureIndex,
    });
  }, [
    precomputedMachineRankingResult,
    includeReusedState,
    includeReusedMachines,
    targetDate,
    dailyRecords,
    specialDayRules,
    customWeights,
    customMachineWeights,
    aliasDictionary,
    sharedFeatureIndex,
  ]);

  // Step ④ machines filtered by funnelModelName
  const step4Machines = useMemo(() => {
    if (!machineRankingResult) return [];
    if (!funnelModelName) return machineRankingResult.rankings;
    return machineRankingResult.rankings.filter((m) => m.modelName === funnelModelName);
  }, [machineRankingResult, funnelModelName]);

  // Step ⑤ checklist candidates & state
  const [checkedMap, setCheckedMap] = useState<Record<number, MachineCheckStatus>>(() => {
    const sId = storeId || 'single-store';
    return loadTargetCheckStatus(targetDate, sId);
  });

  useEffect(() => {
    const sId = storeId || 'single-store';
    setCheckedMap(loadTargetCheckStatus(targetDate, sId));
  }, [targetDate, storeId]);

  const handleToggleCheck = (machineNum: number, status: MachineCheckStatus) => {
    const sId = storeId || 'single-store';
    setCheckedMap((prev) => {
      const next = { ...prev };
      if (next[machineNum] === status) {
        delete next[machineNum];
      } else {
        next[machineNum] = status;
      }
      saveTargetCheckStatus(targetDate, sId, next);
      return next;
    });
  };

  const handleUncheckMachine = (machineNum: number) => {
    const sId = storeId || 'single-store';
    setCheckedMap((prev) => {
      const next = { ...prev };
      delete next[machineNum];
      saveTargetCheckStatus(targetDate, sId, next);
      return next;
    });
  };

  const handleResetChecks = () => {
    const sId = storeId || 'single-store';
    setCheckedMap({});
    saveTargetCheckStatus(targetDate, sId, {});
  };

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showCheckedList, setShowCheckedList] = useState<boolean>(false);

  const singleStoreCandidates = useMemo<CrossStoreMachineRank[]>(() => {
    if (!machineRankingResult) return [];
    const list: CrossStoreMachineRank[] = machineRankingResult.rankings.map((mach) => ({
      storeId: storeId || 'store',
      storeName: '',
      rateExchange: rateExchange,
      modelName: mach.modelName,
      machineNum: mach.machineNum,
      rank: mach.rank,
      originalRank: mach.rank,
      confidence: mach.confidence,
      evidenceDays: mach.evidenceDays,
      cohortEvidenceDays: mach.evidenceDays,
      cohortAvgDiff: mach.stats.cohortAvgDiff ?? 0,
      cohortWinRate: mach.stats.cohortWinRate ?? 50,
      highSettingRate: mach.stats.highSettingRate ?? 0,
      isTailMatch: false,
      isZoro: false,
      expectedDiffCoins: mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff,
      shrunkDiff: mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff,
      expectedYenProfit: 0,
      reasons: formatMachineReasons(mach),
      interval80: mach.interval80,
      totalScore: mach.totalScore,
      uncertainty80: mach.stats.standardError
        ? {
            min: Math.round((mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff) - 1.28 * mach.stats.standardError),
            max: Math.round((mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff) + 1.28 * mach.stats.standardError),
            margin: Math.round(1.28 * mach.stats.standardError),
            isWide: false,
          }
        : {
            min: (mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff) - 300,
            max: (mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff) + 300,
            margin: 300,
            isWide: false,
          },
    }));
    if (funnelModelName) {
      return list.filter((m) => m.modelName === funnelModelName);
    }
    return list;
  }, [machineRankingResult, storeId, rateExchange, funnelModelName]);

  const { activeCandidates, checkedCandidates, rolledUpCount } = useMemo(() => {
    return filterAndRollupTargetList(singleStoreCandidates, checkedMap, 10);
  }, [singleStoreCandidates, checkedMap]);

  const handleCopyText = (items: CrossStoreMachineRank[]) => {
    try {
      const text = generateTargetListCopyText('当店舗', targetDate, items);
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyFeedback('テキストをコピーしました！');
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
      setCopyFeedback('コピーに失敗しました');
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  const handleDownloadCsv = (items: CrossStoreMachineRank[]) => {
    try {
      const csv = generateTargetListCsv('当店舗', targetDate, items);
      const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `狙い台リスト_${targetDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

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
              {customWeights ? (
                <button
                  type="button"
                  onClick={onNavigateToValidation}
                  className="inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer"
                  title="クリックして精度検証タブでパラメータを確認"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  店舗最適化モデル適用中
                  {onNavigateToValidation && <ArrowRight className="w-3 h-3 text-emerald-300" />}
                </button>
              ) : onNavigateToValidation ? (
                <button
                  type="button"
                  onClick={onNavigateToValidation}
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer"
                  title="クリックして精度検証タブでバックテスト・自動調整を実行"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  標準モデル (精度検証・自動調整へ)
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                </button>
              ) : null}

              {/* 台数補完日トグル (isReusedMachines) */}
              <button
                type="button"
                onClick={() => setIncludeReusedState((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer border ${
                  includeReusedState
                    ? 'bg-amber-950/70 text-amber-300 border-amber-600/70 hover:bg-amber-900/80'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="台数補完日（isReusedMachines）を予測データに含めるかを切り替え（既定: オフ＝機種別・台番別データがある日のみ使用）"
              >
                <span className={`w-2 h-2 rounded-full ${includeReusedState ? 'bg-amber-400' : 'bg-slate-500'}`} />
                <span>台数補完日: {includeReusedState ? '予測に含める' : '除外（実データ優先）'}</span>
              </button>
            </div>

            <h2 id="target-model-ranking" className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <span>{forecast.targetDate} の狙い台・おすすめ機種ランキング</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl">
              過去の類似営業日（同種特日・同曜日・同末尾日 計{forecast.matchingHistoricalDaysCount}日間）の全台差枚データから、過去実績の相対評価・期待差枚・勝率を多角的に算出した予測ランキングです。
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

      {/* Step ①: 来店日と範囲（この店） */}
      <div id="target-step-1" className="space-y-0">
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
      </div>

      {/* Step ③: どの機種を狙うか */}
      <div id="target-step-3" className="border-t border-slate-200 bg-white p-4 sm:p-5 space-y-3.5 scroll-mt-28">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                3
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>どの機種を狙うか</span>
                <span className="text-xs font-normal text-slate-500">（機種別 期待差枚予測ランキング）</span>
              </h3>
            </div>
            <p className="text-2xs text-slate-500">
              類似営業日の実績・機械割・投入傾向から算出した機種別期待値。上位機種を選択すると台番ランキングが連動します。
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsStep3Expanded((prev) => !prev)}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            data-testid="step3-toggle-expand"
          >
            {isStep3Expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>全件を折りたたむ</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>全件を見る ({sortedModels.length}機種)</span>
              </>
            )}
          </button>
        </div>

        {/* Step ③ Top 3 Models Summary */}
        <div className="space-y-2">
          <div className="text-2xs font-bold text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              上位3機種の要約（クリックで台番へ絞り込み）
            </span>
            {funnelModelName && (
              <span className="text-indigo-600 font-bold">
                選択中: {funnelModelName}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="step3-top3-cards">
            {sortedModels.slice(0, 3).map((model, idx) => {
              const isSelected = funnelModelName === model.modelName;
              return (
                <div
                  key={`top-model-${model.modelName}`}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500 shadow-xs'
                      : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-700 text-white'
                        }`}>
                          {idx + 1}
                        </span>
                        {storeName && (
                          <span className="font-mono text-2xs font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 truncate max-w-[100px]">
                            {storeName}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${getGradeStyle(model.rankGrade)}`}>
                        {model.rankGrade}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs text-slate-900 truncate" title={model.modelName}>
                        {model.modelName}
                      </h4>
                      <div className="text-[10px] text-slate-500">
                        設置 {model.totalMachines}台
                      </div>
                    </div>

                    <div className="pt-1 flex items-baseline justify-between border-t border-slate-200/60 text-xs">
                      <span className="text-2xs text-slate-500">期待差枚:</span>
                      <span className={`font-mono font-black ${model.expectedDiffCoins >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                        {formatProfitValue(model.expectedDiffCoins)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 bg-white/80 p-1.5 rounded-lg border border-slate-200/60">
                      <div>勝率: <strong className="text-slate-800">{model.predictedWinRate}%</strong></div>
                      <div>出率: <strong className="text-slate-800">{model.predictedPayoutRate.toFixed(1)}%</strong></div>
                      <div className="col-span-2 text-slate-500">根拠: {model.matchingDaysCount > 0 ? model.matchingDaysCount : model.sampleDays}日分</div>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          onSelectFunnelModel?.(null);
                        } else {
                          onSelectFunnelModel?.(model.modelName);
                          const el = document.getElementById('target-step-4');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className={`w-full py-1 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-200 text-indigo-700 border border-indigo-200'
                      }`}
                      data-testid={`select-model-${idx + 1}`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>選択中 (解除)</span>
                        </>
                      ) : (
                        <>
                          <span>この機種を選択 →</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step ③ Expanded Full View */}
        {isStep3Expanded && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {/* Model Filter & Sort Bar */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              {/* Filter Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-bold text-slate-600 mr-1 flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                  機種絞り込み:
                </span>
                <button
                  type="button"
                  onClick={() => setModelFilter('all')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
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
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
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
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
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
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
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
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
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
                <span className="text-slate-500 text-xs">並び順:</span>
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

            {/* Model Recommendations Table (Unified Component) */}
            <TargetRankingTable
              rankingType="model"
              showStoreColumn={false}
              formatProfitValue={formatProfitValue}
              onSelectModel={(modelName) => {
                onSelectFunnelModel?.(modelName ? modelName : null);
                if (modelName) {
                  const el = document.getElementById('target-step-4');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              selectedModelName={funnelModelName}
              rows={sortedModels.map((model) => ({
                id: `model-${model.modelName}`,
                rank: model.rank,
                rankGrade: model.rankGrade,
                modelName: model.modelName,
                totalMachines: model.totalMachines,
                tags: model.tags,
                allHighDaysCount: model.allHighDaysCount,
                expectedDiff: model.expectedDiffCoins,
                payoutRate: Number(model.predictedPayoutRate.toFixed(2)),
                winRate: model.predictedWinRate,
                evidenceDays: model.matchingDaysCount > 0 ? model.matchingDaysCount : model.sampleDays,
                reasons:
                  model.matchingDaysCount > 0
                    ? [
                        `過去${model.matchingDaysCount}回中 平均 ${model.matchingAvgDiffCoins > 0 ? '+' : ''}${model.matchingAvgDiffCoins}枚 (勝率 ${model.matchingWinRate}%)`,
                      ]
                    : [],
                tacticalReason: model.tacticalReason,
                sampleRecords: model.sampleRecords,
              }))}
              emptyMessage="該当する機種データがありません。絞り込み条件を変更してください。"
            />
          </div>
        )}
      </div>

      {/* Step ④: どの台を狙うか */}
      <div id="target-step-4" className="border-t border-slate-200 bg-white p-4 sm:p-5 space-y-3.5 scroll-mt-28">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                4
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>どの台を狙うか</span>
                <span className="text-xs font-normal text-slate-500">（台番号別 狙い台ランキング）</span>
              </h3>
              {funnelModelName && (
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-100 text-indigo-900 border border-indigo-200">
                  機種: {funnelModelName}
                </span>
              )}
            </div>
            <p className="text-2xs text-slate-500">
              据え置き・上げ狙い・末尾特徴・過去類似日の実績から台番単位の期待差枚を予測
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsStep4Expanded((prev) => !prev)}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            data-testid="step4-toggle-expand"
          >
            {isStep4Expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>全件を折りたたむ</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>全件を見る ({step4Machines.length}台)</span>
              </>
            )}
          </button>
        </div>

        {/* Step ④ Top 3 Machines Summary */}
        <div className="space-y-2">
          <div className="text-2xs font-bold text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-500" />
              上位3台の要約（店名・機種・台番・期待差枚・信頼度）
            </span>
            <span className="text-[10px] text-slate-400">
              候補計 {step4Machines.length}台
            </span>
          </div>

          {step4Machines.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
              該当する台番データがありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="step4-top3-cards">
              {step4Machines.slice(0, 3).map((mach, idx) => {
                const diffVal = mach.stats.expectedDiffStd ?? mach.stats.shrunkDiff ?? 0;
                return (
                  <div
                    key={`top-mach-${mach.machineNum}`}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                            idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-700 text-white'
                          }`}>
                            {idx + 1}
                          </span>
                          {storeName && (
                            <span className="font-mono text-2xs font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 truncate max-w-[100px]">
                              {storeName}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-black text-sm text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          #{mach.machineNum}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-bold text-xs text-slate-900 truncate" title={mach.modelName}>
                          {mach.modelName}
                        </h4>
                        <div className="text-[10px] text-slate-500">
                          末尾 {mach.machineNum % 10}
                        </div>
                      </div>

                      <div className="pt-1 flex items-baseline justify-between border-t border-slate-200/60 text-xs">
                        <span className="text-2xs text-slate-500">期待差枚:</span>
                        <span className={`font-mono font-black ${diffVal >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                          {diffVal >= 0 ? `+${diffVal}` : diffVal}枚
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-600 bg-white/80 p-1.5 rounded-lg border border-slate-200/60 space-y-0.5">
                        <div>信頼度: <strong className="text-slate-800">{mach.confidence}</strong></div>
                        <div className="text-slate-500">根拠: {mach.evidenceDays}日分</div>
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(mach.machineNum, 'unavailable')}
                        className="flex-1 py-1 px-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 text-center cursor-pointer"
                        title="チェックリストで「空いていない」にマーク"
                      >
                        空いてない
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(mach.machineNum, 'played')}
                        className="flex-1 py-1 px-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 text-center cursor-pointer"
                        title="チェックリストで「打った」にマーク"
                      >
                        打った
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step ④ Expanded Full View */}
        {isStep4Expanded && (
          <div id="target-machine-ranking" className="pt-2 border-t border-slate-200">
            <TargetMachineRanking
              targetDate={targetDate}
              dailyRecords={dailyRecords}
              specialDayRules={specialDayRules}
              customWeights={customWeights}
              customMachineWeights={customMachineWeights}
              islandConfig={islandConfig}
              includeReusedMachines={includeReusedState}
              aliasDictionary={aliasDictionary}
              onOpenStoreManager={onOpenStoreManager}
              storeId={storeId}
              featureIndex={sharedFeatureIndex}
              funnelModelName={funnelModelName}
              precomputedRankingResult={machineRankingResult}
            />
          </div>
        )}
      </div>

      {/* Step ⑤: 当日のチェックリスト */}
      <div id="target-step-5" className="border-t border-slate-200 bg-white p-4 sm:p-5 space-y-3.5 scroll-mt-28">
        <div id="target-checklist" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                5
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>当日のチェックリスト</span>
                <span className="text-xs font-normal text-slate-500">（来店中スマホ管理）</span>
              </h3>
            </div>
            <p className="text-2xs text-slate-500">
              狙い台の確保状況をリアルタイムでチェック。空いていない台を除外すると自動で次候補が繰り上がります。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsStep5Expanded((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              data-testid="step5-toggle-expand"
            >
              {isStep5Expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>全件を折りたたむ</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>全件を見る ({activeCandidates.length}台)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Step ⑤ Top 3 Candidates Summary */}
        <div className="space-y-2">
          <div className="text-2xs font-bold text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <CheckSquare className="w-3 h-3 text-emerald-600" />
              未チェック候補 上位3台
            </span>
            <span className="text-[10px] text-slate-400">
              未チェック {activeCandidates.length}台 / チェック済 {checkedCandidates.length}台
            </span>
          </div>

          {activeCandidates.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
              未チェックの候補台はありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="step5-top3-cards">
              {activeCandidates.slice(0, 3).map((cand, idx) => (
                <div
                  key={`top-check-${cand.machineNum}`}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-700 text-white'
                        }`}>
                          {idx + 1}
                        </span>
                        {storeName && (
                          <span className="font-mono text-2xs font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 truncate max-w-[100px]">
                            {storeName}
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-black text-sm text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        #{cand.machineNum}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs text-slate-900 truncate" title={cand.modelName}>
                        {cand.modelName}
                      </h4>
                      <div className="text-[10px] text-slate-500">
                        末尾 {cand.machineNum % 10}
                      </div>
                    </div>

                    <div className="pt-1 flex items-baseline justify-between border-t border-slate-200/60 text-xs">
                      <span className="text-2xs text-slate-500">期待差枚:</span>
                      <span className="font-mono font-black text-indigo-600">
                        {cand.expectedDiffCoins >= 0 ? `+${cand.expectedDiffCoins}` : cand.expectedDiffCoins}枚
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-600 bg-white/80 p-1.5 rounded-lg border border-slate-200/60 flex items-center justify-between">
                      <span>信頼度: <strong className="text-slate-800">{cand.confidence}</strong></span>
                      <span className="text-slate-500">根拠: {cand.evidenceDays}日分</span>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleCheck(cand.machineNum, 'unavailable')}
                      className="flex-1 py-1 px-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 text-center cursor-pointer transition-colors"
                    >
                      空いてない
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCheck(cand.machineNum, 'played')}
                      className="flex-1 py-1 px-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-center cursor-pointer shadow-2xs transition-colors"
                    >
                      打った
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step ⑤ Expanded Full Checklist */}
        {isStep5Expanded && (
          <div className="space-y-3 pt-3 border-t border-slate-200">
            {/* Action Bar: Copy / CSV / Reset */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText(activeCandidates)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>テキストコピー</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadCsv(activeCandidates)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>CSV保存</span>
                </button>
                {copyFeedback && (
                  <span className="text-emerald-600 font-bold animate-in fade-in">
                    {copyFeedback}
                  </span>
                )}
              </div>

              {Object.keys(checkedMap).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetChecks}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors text-2xs"
                >
                  <RotateCcw className="w-3 h-3 text-rose-500" />
                  <span>チェック全解除</span>
                </button>
              )}
            </div>

            {/* Candidate List Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 text-2xs border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-center w-12">順位</th>
                    <th className="px-3 py-2 font-bold w-20">台番</th>
                    <th className="px-4 py-2 font-bold">機種名</th>
                    <th className="px-3 py-2 text-right font-bold">期待差枚</th>
                    <th className="px-3 py-2 text-center font-bold">信頼度</th>
                    <th className="px-4 py-2 font-bold">推奨理由</th>
                    <th className="px-3 py-2 text-center font-bold w-36">当日操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCandidates.map((cand, idx) => (
                    <tr key={`cand-${cand.machineNum}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-center font-black text-slate-700">
                        #{idx + 1}
                      </td>
                      <td className="px-3 py-2 font-mono font-black text-slate-900">
                        #{cand.machineNum}
                      </td>
                      <td className="px-4 py-2 font-bold text-slate-800">
                        {cand.modelName}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-black text-indigo-600">
                        +{cand.expectedDiffCoins}枚
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {cand.confidence}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        {cand.reasons[0] || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleCheck(cand.machineNum, 'unavailable')}
                            className="px-2 py-0.5 rounded text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                          >
                            空きなし
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCheck(cand.machineNum, 'played')}
                            className="px-2 py-0.5 rounded text-2xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            着席
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Checked items summary / toggle */}
            {checkedCandidates.length > 0 && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">
                    チェック済みの台 ({checkedCandidates.length}台):
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCheckedList((prev) => !prev)}
                    className="text-indigo-600 font-bold hover:underline cursor-pointer text-2xs"
                  >
                    {showCheckedList ? '非表示' : '表示する'}
                  </button>
                </div>
                {showCheckedList && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {checkedCandidates.map((c) => (
                      <span
                        key={`chk-${c.machineNum}`}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-2xs font-bold border ${
                          c.checkStatus === 'played'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                      >
                        <span>#{c.machineNum} {c.modelName}</span>
                        <span className="text-[10px] opacity-75">
                          ({c.checkStatus === 'played' ? '着席' : '空きなし'})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUncheckMachine(c.machineNum)}
                          className="hover:text-rose-600 ml-1 cursor-pointer"
                          title="チェック解除"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
