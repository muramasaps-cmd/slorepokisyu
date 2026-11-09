import React, { useState, useMemo, useEffect } from 'react';
import {
  computeLift,
  estimateWinProbability,
  roundForDisplay,
  buildReasonTags,
  decideSkip,
  getSkipAdviceMessage,
  CandidateForSkipCheck,
  TagColor,
  rollupDecisionCandidates,
  TargetAlternativeItem,
} from '../utils/targetDisplay';
import { MachineRankingContributions, IslandDefinition } from '../data/types';
import { parseIslandConfig, getMachineIsland } from '../utils/islandUtils';
import {
  loadTargetCheckStatus,
  saveTargetCheckStatus,
  MachineCheckStatus,
} from '../utils/crossStoreRanking';
import { formatNumber } from '../utils/formatters';
import {
  Sparkles,
  AlertTriangle,
  Trophy,
  Check,
  Plus,
  ArrowRight,
  Building2,
  Cpu,
  Slash,
  RotateCcw,
} from 'lucide-react';

export type TargetDecisionAlternative = TargetAlternativeItem;

export interface TargetDecisionCandidate extends CandidateForSkipCheck {
  rank: number;
  originalRank?: number;
  machineNum: number;
  modelName: string;
  storeName?: string;
  storeId?: string;
  confidence: '高' | '中' | '低' | string;
  expectedDiff: number;
  interval80?: [number, number];
  uncertainty80?: { min: number; max: number };
  evidenceDays?: number;
  islandName?: string;
  contributions?: MachineRankingContributions;
  stats?: {
    isTailMatch?: boolean;
    isZoro?: boolean;
    standardError?: number;
    expectedDiff80Range?: [number, number];
    expectedDiffMargin80?: number;
    expectedDiffStd?: number;
    shrunkDiff?: number;
    [key: string]: any;
  };
  reasons?: string[];
  isTailMatch?: boolean;
  isZoro?: boolean;
  alternatives?: {
    sameModel?: TargetAlternativeItem[];
    sameIsland?: TargetAlternativeItem[];
  };
}

export interface TargetDecisionSummaryProps {
  targetDate: string;
  scope: 'store' | 'all';
  storeName?: string;
  candidates: TargetDecisionCandidate[];
  allCandidates?: TargetDecisionCandidate[];
  dayMeanExpectedDiff?: number;
  sigma2?: number;
  hasEdge?: boolean | '優位性あり' | '優位性なし' | '未検証';
  recommendedModel?: string;
  onAddToChecklist?: (candidate: TargetDecisionCandidate) => void;
  checkedMachineNums?: Set<number>;
  checkedState?: Record<number, MachineCheckStatus>;
  onToggleCheck?: (machineNum: number, status: MachineCheckStatus) => void;
  onNavigateToChecklist?: () => void;
  islandConfig?: string;
  islandDefinitions?: IslandDefinition[];
  storeId?: string;
  // Prompt 64: 機種フィルター情報
  isModelFilterActive?: boolean;
  activeFilterLabel?: string;
  onFocusModelFilter?: () => void;
  selectedModelDaysCount?: number;
}

const getTagBadgeClass = (color: TagColor): string => {
  switch (color) {
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'purple':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'green':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'orange':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'amber':
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
};

const getRankBadgeClass = (rank: number): { label: string; badgeClass: string } => {
  if (rank === 1) {
    return {
      label: '第1候補',
      badgeClass: 'bg-amber-500 text-slate-950 shadow-xs font-black',
    };
  }
  if (rank === 2) {
    return {
      label: '第2候補',
      badgeClass: 'bg-slate-300 text-slate-800 font-bold',
    };
  }
  if (rank === 3) {
    return {
      label: '第3候補',
      badgeClass: 'bg-amber-700 text-white font-bold',
    };
  }
  return {
    label: `第${rank}候補`,
    badgeClass: 'bg-slate-200 text-slate-700 font-bold',
  };
};

/**
 * 80% range bar component with 0 marker (0の目盛りつき).
 * Shows lift vs day's mean and the credible 80% range.
 */
interface Diff80RangeBarProps {
  lift: number;
  liftLower: number;
  liftUpper: number;
}

const Diff80RangeBar: React.FC<Diff80RangeBarProps> = ({ lift, liftLower, liftUpper }) => {
  const roundedLift = roundForDisplay(lift);
  const roundedLower = roundForDisplay(liftLower);
  const roundedUpper = roundForDisplay(liftUpper);

  // Dynamic scale centered around 0 with reasonable margins
  const minVal = Math.min(-300, roundedLower - 100);
  const maxVal = Math.max(600, roundedUpper + 150);
  const rangeSpan = Math.max(200, maxVal - minVal);

  const getPercent = (val: number) => {
    const raw = ((val - minVal) / rangeSpan) * 100;
    return Math.max(0, Math.min(100, raw));
  };

  const zeroPct = getPercent(0);
  const lowerPct = getPercent(roundedLower);
  const upperPct = getPercent(roundedUpper);
  const liftPct = getPercent(roundedLift);

  const barLeft = Math.min(lowerPct, upperPct);
  const barWidth = Math.max(4, Math.abs(upperPct - lowerPct));

  const isPositiveBand = roundedLower > 0;
  const isNegativeBand = roundedUpper < 0;

  return (
    <div className="space-y-1.5" data-testid="diff-80-range-bar">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500 text-2xs">平均との差 (目安)</span>
        <span
          className={`font-mono tabular-nums font-black text-xs ${
            roundedLift >= 0 ? 'text-emerald-700' : 'text-slate-700'
          }`}
          data-testid="lift-value-display"
        >
          {roundedLift >= 0 ? `+${roundedLift}` : roundedLift}枚
        </span>
      </div>

      {/* Visual Bar Track */}
      <div className="pt-2 pb-5">
        <div className="relative h-2 bg-slate-100 rounded-full border border-slate-200/80">
          {/* Shaded 80% Range Band */}
          <div
            className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${
              isPositiveBand
                ? 'bg-emerald-500/40 border border-emerald-500/60'
                : isNegativeBand
                ? 'bg-rose-500/40 border border-rose-500/60'
                : 'bg-amber-500/40 border border-amber-500/60'
            }`}
            style={{
              left: `${barLeft}%`,
              width: `${barWidth}%`,
            }}
            data-testid="range-80-band"
          />

          {/* 0 Marker Tick (0の目盛り) */}
          <div
            className="absolute -top-1 w-0.5 h-4 bg-slate-400 z-10 -translate-x-1/2"
            style={{ left: `${zeroPct}%` }}
            data-testid="zero-tick-marker"
          >
            <span className="absolute -bottom-4.5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-slate-500 whitespace-nowrap">
              0 (平均)
            </span>
          </div>

          {/* Expected Lift Point Marker */}
          <div
            className="absolute top-1/2 w-2.5 h-2.5 bg-slate-900 rounded-full border border-white shadow-xs z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${liftPct}%` }}
            title={`期待差枚リフト: ${roundedLift >= 0 ? '+' : ''}${roundedLift}枚`}
            data-testid="lift-point-marker"
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-2xs text-slate-500 font-mono tabular-nums">
        <span>80%範囲 (目安):</span>
        <span className="font-bold text-slate-700" data-testid="range-80-text">
          {roundedLower >= 0 ? `+${roundedLower}` : roundedLower} 〜{' '}
          {roundedUpper >= 0 ? `+${roundedUpper}` : roundedUpper}枚
        </span>
      </div>
    </div>
  );
};

export const TargetDecisionSummary: React.FC<TargetDecisionSummaryProps> = ({
  targetDate,
  scope,
  storeName,
  candidates,
  allCandidates,
  dayMeanExpectedDiff = 0,
  sigma2 = 640000,
  hasEdge,
  recommendedModel,
  onAddToChecklist,
  checkedMachineNums,
  checkedState: controlledCheckedState,
  onToggleCheck,
  onNavigateToChecklist,
  islandConfig,
  islandDefinitions: propIslandDefinitions,
  storeId,
  isModelFilterActive,
  activeFilterLabel,
  onFocusModelFilter,
  selectedModelDaysCount,
}) => {
  // Relax condition state (Prompt 61 Requirement 3: 信頼度の低い台も含めて表示)
  const [includeLowConfidence, setIncludeLowConfidence] = useState<boolean>(false);

  // Local checklist state fallback if not controlled from parent
  const [localChecked, setLocalChecked] = useState<Set<number>>(new Set());
  const activeCheckedSet = checkedMachineNums || localChecked;

  // Local checkedState (unavailable | played)
  const [internalCheckedState, setInternalCheckedState] = useState<Record<number, MachineCheckStatus>>(() => {
    if (controlledCheckedState) return controlledCheckedState;
    if (typeof localStorage !== 'undefined' && targetDate) {
      const sId = storeId || candidates[0]?.storeId || 'single-store';
      return loadTargetCheckStatus(targetDate, sId);
    }
    return {};
  });

  useEffect(() => {
    if (controlledCheckedState) {
      setInternalCheckedState(controlledCheckedState);
    } else if (typeof localStorage !== 'undefined' && targetDate) {
      const sId = storeId || candidates[0]?.storeId || 'single-store';
      setInternalCheckedState(loadTargetCheckStatus(targetDate, sId));
    }
  }, [controlledCheckedState, targetDate, storeId, candidates]);

  const activeCheckedMap = controlledCheckedState || internalCheckedState;

  // Enrich candidates with islandName if islandConfig is available
  const candidatePool = useMemo(() => {
    const raw = allCandidates && allCandidates.length > 0 ? allCandidates : candidates;
    const islandDefs = propIslandDefinitions || parseIslandConfig(islandConfig);
    if (!islandDefs || islandDefs.length === 0) return raw;

    return raw.map((c) => {
      if (c.islandName) return c;
      const isl = getMachineIsland(c.machineNum, islandDefs);
      return isl ? { ...c, islandName: isl } : c;
    });
  }, [allCandidates, candidates, propIslandDefinitions, islandConfig]);

  // Roll up candidates (Prompt 61 Requirement 2: 空いていない台を除外し自動で繰り上がり)
  const { activeCandidates, unavailableCount, hasRelaxableCandidates, allFilled } = useMemo(() => {
    return rollupDecisionCandidates(candidatePool, {
      checkedState: activeCheckedMap,
      includeLowConfidence,
      topN: 3,
    });
  }, [candidatePool, activeCheckedMap, includeLowConfidence]);

  // Handle marking machine as unavailable directly from card
  const handleMarkUnavailable = (machineNum: number) => {
    const sId = storeId || candidates[0]?.storeId || 'single-store';
    const next: Record<number, MachineCheckStatus> = { ...activeCheckedMap, [machineNum]: 'unavailable' };

    setInternalCheckedState(next);
    if (typeof localStorage !== 'undefined' && targetDate) {
      saveTargetCheckStatus(targetDate, sId, next);
    }
    onToggleCheck?.(machineNum, 'unavailable');
  };

  // Reset checked unavailable machines
  const handleResetChecks = () => {
    const sId = storeId || candidates[0]?.storeId || 'single-store';
    setInternalCheckedState({});
    if (typeof localStorage !== 'undefined' && targetDate) {
      saveTargetCheckStatus(targetDate, sId, {});
    }
  };

  const handleToggleCandidate = (candidate: TargetDecisionCandidate) => {
    if (onAddToChecklist) {
      onAddToChecklist(candidate);
    }
    setLocalChecked((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.machineNum)) {
        next.delete(candidate.machineNum);
      } else {
        next.add(candidate.machineNum);
      }
      return next;
    });
  };

  // Effective recommended model for skip message fallback
  const effectiveRecommendedModel =
    recommendedModel ||
    (activeCandidates.length > 0 ? activeCandidates[0].modelName : undefined);

  // 見送り判定 (decideSkip)
  const isSkipVerdict = decideSkip({
    hasEdge,
    topCandidates: activeCandidates,
    dayMeanExpectedDiff,
  });

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
      data-testid="target-decision-summary"
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
            <Sparkles className="w-4 h-4 text-amber-500" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                今日の結論
              </h2>
              <span className="text-2xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                {scope === 'all' ? '全店横断' : storeName ? `${storeName}` : 'この店'}
              </span>
              <span className="text-2xs text-slate-400 font-mono">
                {targetDate}
              </span>
              {unavailableCount > 0 && (
                <span className="text-2xs font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                  {unavailableCount}台除外中
                </span>
              )}
              {isModelFilterActive && activeFilterLabel && activeFilterLabel !== '全機種' && (
                <button
                  type="button"
                  onClick={
                    onFocusModelFilter ||
                    (() => {
                      const el = document.getElementById('header-model-filter');
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const btn = el.querySelector('button');
                        if (btn) (btn as HTMLButtonElement).focus();
                      }
                    })
                  }
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer shadow-2xs"
                  data-testid="decision-model-filter-chip"
                  title="クリックでヘッダーの機種選択に移動"
                >
                  <Cpu className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>対象機種: {activeFilterLabel}（絞り込み中）</span>
                </button>
              )}
            </div>
            <p className="text-2xs text-slate-500 mt-0.5">
              過去の同条件実績・縮小推定モデルに基づく第1〜第3候補台（各数値は50枚単位の<strong className="text-slate-700 font-bold">目安</strong>です）
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unavailableCount > 0 && (
            <button
              type="button"
              onClick={handleResetChecks}
              className="text-2xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer bg-slate-100 px-2 py-1 rounded-lg"
              data-testid="btn-reset-checks-header"
              title="空いていないチェックをクリア"
            >
              <RotateCcw className="w-3 h-3" />
              <span>除外を解除</span>
            </button>
          )}

          {onNavigateToChecklist && (
            <button
              type="button"
              onClick={onNavigateToChecklist}
              className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <span>当日のチェックリストへ</span>
              <span>›</span>
            </button>
          )}
        </div>
      </div>

      {/* 選択機種のデータが少ない（30日未満）ときの警告 (Prompt 64 Requirement 4) */}
      {isModelFilterActive && selectedModelDaysCount !== undefined && selectedModelDaysCount < 30 && (
        <div
          className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2"
          data-testid="decision-low-data-warning"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>選択機種のデータが少ないため、参考値です（実績日数: {selectedModelDaysCount}日分 &lt; 30日）</span>
        </div>
      )}

      {/* 見送り判定バナー (目立つ色で表示) */}
      {!allFilled && isSkipVerdict && (
        <div
          className="p-3.5 sm:p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/70 text-amber-950 flex items-start gap-3 shadow-xs animate-in fade-in"
          data-testid="skip-verdict-banner"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0 flex-1">
            <div
              className="text-sm font-black text-amber-950 leading-snug break-words"
              data-testid="skip-verdict-message"
            >
              {getSkipAdviceMessage(effectiveRecommendedModel)}
            </div>
            <p className="text-2xs sm:text-xs text-amber-800 font-medium">
              店舗の台番予測検証で統計的優位性が未確認、または上位候補の信頼性・差枚期待値の80%範囲が0を下回っているため、特定台番に固執せず高評価機種の良番台を狙うのが賢明です。
            </p>
          </div>
        </div>
      )}

      {/* 全候補が埋まったときの表示 (Prompt 61 Requirement 3) */}
      {allFilled ? (
        <div
          className="p-6 sm:p-8 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-center space-y-3 shadow-xs animate-in fade-in"
          data-testid="no-candidates-panel"
        >
          <div className="flex items-center justify-center gap-2 text-base sm:text-lg font-black text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span data-testid="no-candidates-message">候補がありません。条件を緩めますか？</span>
          </div>

          <p className="text-xs sm:text-sm text-amber-800 max-w-lg mx-auto leading-relaxed">
            候補の台がすべて埋まっているか、評価基準を満たす台がありません。信頼度の低い台も含めて探索するか、チェックした台をリセットしてください。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIncludeLowConfidence(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-xs transition-colors cursor-pointer"
              data-testid="btn-relax-conditions"
            >
              信頼度の低い台も含めて表示する
            </button>

            {unavailableCount > 0 && (
              <button
                type="button"
                onClick={handleResetChecks}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                data-testid="btn-reset-checks"
              >
                チェックした台をリセット ({unavailableCount}台除外中)
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Candidate Cards Grid (第1〜第3候補) */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5" data-testid="decision-cards-grid">
          {activeCandidates.map((cand) => {
            const rankMeta = getRankBadgeClass(cand.rank);
            const isChecked = activeCheckedSet.has(cand.machineNum);

            // Compute lift and 80% range relative to day's mean
            const expDiff = cand.expectedDiff ?? cand.expectedDiffCoins ?? 0;
            const lift = computeLift(expDiff, dayMeanExpectedDiff);

            // 80% range bounds
            let lower = expDiff - 300;
            let upper = expDiff + 300;
            if (cand.interval80 && Array.isArray(cand.interval80)) {
              lower = cand.interval80[0];
              upper = cand.interval80[1];
            } else if (cand.uncertainty80) {
              lower = cand.uncertainty80.min;
              upper = cand.uncertainty80.max;
            } else if (cand.stats?.expectedDiff80Range) {
              lower = cand.stats.expectedDiff80Range[0];
              upper = cand.stats.expectedDiff80Range[1];
            }
            const liftLower = lower - dayMeanExpectedDiff;
            const liftUpper = upper - dayMeanExpectedDiff;

            // Estimated win probability
            const winProb = estimateWinProbability(expDiff, sigma2, dayMeanExpectedDiff);
            const machineWinPct = Math.round(winProb.machineWinProb * 100);
            const hallWinPct = Math.round(winProb.hallWinProb * 100);

            // Confidence stars
            let stars = '★☆☆';
            if (cand.confidence === '高') stars = '★★★';
            else if (cand.confidence === '中') stars = '★★☆';

            // Colored reason tags (max 3)
            const tags = buildReasonTags(
              cand.contributions,
              cand.evidenceDays,
              cand.isTailMatch || cand.stats?.isTailMatch,
              cand.isZoro || cand.stats?.isZoro,
              cand.reasons
            );

            return (
              <div
                key={`${cand.storeId || cand.storeName || ''}-${cand.machineNum}`}
                className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-3.5 shadow-2xs hover:border-slate-300 transition-all"
                data-testid={`candidate-card-rank-${cand.rank}`}
              >
                <div className="space-y-3">
                  {/* Top Bar of Card: Rank Badge & Confidence Stars */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-2xs px-2.5 py-0.5 rounded-md flex items-center gap-1 ${rankMeta.badgeClass}`}
                      data-testid={`rank-badge-${cand.rank}`}
                    >
                      <Trophy className="w-3 h-3" />
                      <span>{rankMeta.label}</span>
                    </span>

                    <div
                      className="flex items-center gap-1 text-2xs text-slate-600 font-bold"
                      title={`信頼度: ${cand.confidence}`}
                      data-testid="confidence-stars"
                    >
                      <span className="text-slate-400 font-normal">信頼度:</span>
                      <span className="text-amber-500 font-mono tracking-widest text-xs">
                        {stars}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ({cand.confidence})
                      </span>
                    </div>
                  </div>

                  {/* Prominent Details: Store (if 'all'), Model, Machine Number */}
                  <div className="space-y-1">
                    {/* 店舗名: 全店のときは必ず大きく表示 (Requirement 3) */}
                    {(scope === 'all' || cand.storeName) && (
                      <div
                        className="flex items-center gap-1 text-xs font-bold text-indigo-700 truncate"
                        data-testid="candidate-store-name"
                      >
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                        <span className="truncate">{cand.storeName || storeName || '対象店舗'}</span>
                      </div>
                    )}

                    {/* 機種名 */}
                    <div
                      className="text-sm sm:text-base font-black text-slate-800 truncate flex items-center gap-1"
                      title={cand.modelName}
                      data-testid="candidate-model-name"
                    >
                      <Cpu className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{cand.modelName}</span>
                    </div>

                    {/* 台番号: 大きく表示 */}
                    <div className="pt-0.5">
                      <div
                        className="text-2xl sm:text-3xl font-black text-slate-950 font-mono tabular-nums tracking-tight flex items-baseline gap-1"
                        data-testid="candidate-machine-num"
                      >
                        <span>{cand.machineNum}</span>
                        <span className="text-xs font-bold text-slate-500">番台</span>
                      </div>
                    </div>
                  </div>

                  {/* 平均との差 & 80%範囲の棒 (0の目盛りつき) */}
                  <Diff80RangeBar
                    lift={lift}
                    liftLower={liftLower}
                    liftUpper={liftUpper}
                  />

                  {/* 勝つ確率の目安 */}
                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-2xs">勝つ確率の目安:</span>
                    <div className="text-right">
                      <span
                        className="font-mono tabular-nums font-black text-sm text-indigo-700"
                        data-testid="win-probability-display"
                      >
                        {machineWinPct}%
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1 font-mono">
                        (全体平均 {hallWinPct}%)
                      </span>
                    </div>
                  </div>

                  {/* 理由タグ (最大3つ) */}
                  <div className="pt-1 flex flex-wrap gap-1.5" data-testid="reason-tags-container">
                    {tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={`${tag.id}-${idx}`}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors ${getTagBadgeClass(
                          tag.color
                        )}`}
                        data-testid={`reason-tag-${tag.id}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>

                  {/* 「埋まっていたら」代替候補表示 (Prompt 61 Requirement 1) */}
                  <div
                    className="pt-2 border-t border-slate-100 space-y-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60"
                    data-testid={`alternatives-rank-${cand.rank}`}
                  >
                    <div className="flex items-center gap-1 text-[11px] font-black text-slate-800">
                      <ArrowRight className="w-3 h-3 text-indigo-600 shrink-0" />
                      <span>埋まっていたら（代替候補）</span>
                    </div>

                    {/* 1. 同じ機種の次点 (最大3台, 順に表示) */}
                    {cand.alternatives?.sameModel && cand.alternatives.sameModel.length > 0 ? (
                      <div className="text-2xs space-y-1" data-testid="same-model-alternatives">
                        <span className="text-slate-500 font-bold block">同機種の次点:</span>
                        <div className="flex flex-wrap gap-1">
                          {cand.alternatives.sameModel.map((alt, aIdx) => (
                            <span
                              key={alt.machineNum}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-900 font-mono font-bold text-[11px] shadow-2xs"
                              data-testid={`alt-same-model-${cand.rank}-${alt.machineNum}`}
                              title={`${alt.modelName} ${alt.machineNum}番台 (期待差枚: ${alt.expectedDiff >= 0 ? '+' : ''}${formatNumber(roundForDisplay(alt.expectedDiff))}枚)`}
                            >
                              <span className="text-slate-400 font-sans font-normal text-[9px]">{aIdx + 1}.</span>
                              <span>{alt.machineNum}番台</span>
                              <span className={`text-[10px] ${alt.expectedDiff >= 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                ({alt.expectedDiff >= 0 ? '+' : ''}{roundForDisplay(alt.expectedDiff)}枚)
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 font-medium">
                        同機種の次点候補はありません
                      </div>
                    )}

                    {/* 2. 同じ島の上位 (島設定がある店) */}
                    {cand.alternatives?.sameIsland && cand.alternatives.sameIsland.length > 0 && (
                      <div className="text-2xs space-y-1 pt-1 border-t border-slate-200/50" data-testid="same-island-alternatives">
                        <span className="text-slate-500 font-bold block">
                          同島の上位{cand.islandName ? ` (${cand.islandName})` : ''}:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {cand.alternatives.sameIsland.map((alt) => (
                            <span
                              key={alt.machineNum}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50/80 border border-indigo-200 text-indigo-950 font-mono font-bold text-[11px] shadow-2xs"
                              data-testid={`alt-same-island-${cand.rank}-${alt.machineNum}`}
                              title={`${alt.modelName} ${alt.machineNum}番台 (期待差枚: ${alt.expectedDiff >= 0 ? '+' : ''}${formatNumber(roundForDisplay(alt.expectedDiff))}枚)`}
                            >
                              <span>{alt.machineNum}番台</span>
                              <span className="text-[10px] text-slate-600 font-sans font-normal truncate max-w-[90px]">
                                {alt.modelName}
                              </span>
                              <span className={`text-[10px] ${alt.expectedDiff >= 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                ({alt.expectedDiff >= 0 ? '+' : ''}{roundForDisplay(alt.expectedDiff)}枚)
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons: 候補に追加 & 空いていない */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleCandidate(cand)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
                      isChecked
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                    data-testid={`btn-add-candidate-${cand.machineNum}`}
                  >
                    {isChecked ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>候補に追加済み</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>候補に追加</span>
                      </>
                    )}
                  </button>

                  {/* 「空いていない」ボタン (Prompt 61 Requirement 2) */}
                  <button
                    type="button"
                    onClick={() => handleMarkUnavailable(cand.machineNum)}
                    className="w-full py-1.5 px-3 rounded-xl text-2xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                    data-testid={`btn-mark-unavailable-${cand.machineNum}`}
                    title="この台を空いていないとして除外し、次候補を繰り上げる"
                  >
                    <Slash className="w-3 h-3 text-rose-500" />
                    <span>空いていない（除外して繰り上げ）</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
