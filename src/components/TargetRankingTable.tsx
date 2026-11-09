import React, { useState, useMemo } from 'react';
import { formatNumber, formatYen } from '../utils/formatters';
import {
  computeLift,
  estimateWinProbability,
  roundForDisplay,
  buildReasonTags,
  TagColor,
} from '../utils/targetDisplay';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCircle2,
  HelpCircle,
  RotateCw,
  Copy,
  Download,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';
import { TargetFloorMap } from './TargetFloorMap';
import { TargetExpectationScatter } from './TargetExpectationScatter';
import { IslandDefinition } from '../data/types';
import { MachineCheckStatus } from '../utils/crossStoreRanking';

export type TargetRankingType = 'machine' | 'model';
export type TargetRankingViewMode = 'simple' | 'detailed';
export type TargetRankingDisplayType = 'table' | 'floorMap' | 'scatter';

export const TARGET_TABLE_VIEW_MODE_STORAGE_KEY = 'slorepo_target_table_view_mode';
export const TARGET_TABLE_DISPLAY_TYPE_STORAGE_KEY = 'slorepo_target_table_display_type';

export interface TargetRankingVerification {
  status?: 'edge' | 'noEdge' | 'untested' | 'testing';
  label?: string;
  hasEdge?: boolean;
  avgLift?: number;
  ci95?: [number, number];
  onRunTest?: () => void;
  isTesting?: boolean;
}

export interface TargetRankingRow {
  id: string;
  rank: number;
  rankGrade?: string;
  storeId?: string;
  storeName?: string;
  isSpecialDay?: boolean;
  specialDayReason?: string;
  modelName: string;
  machineNum?: number;
  islandName?: string;
  totalMachines?: number;
  tags?: string[];
  allHighDaysCount?: number;
  originalRank?: number;

  // Diff & Profit
  expectedDiff: number;
  expectedYen?: number;
  interval80?: [number, number];
  uncertainty80?: {
    min: number;
    max: number;
    margin: number;
    isWide?: boolean;
  };
  payoutRate?: number;
  winRate?: number;
  avgGames?: number;
  shrunkPayoutRate?: number;

  // Confidence & Score
  confidence?: '高' | '中' | '低' | string;
  reliabilityRate?: number;
  reliability?: number | null;
  evidenceDays?: number;
  cohortEvidenceDays?: number;
  score?: number;

  // Reasons
  reasons: string[];
  tacticalReason?: string;

  // Verification badge
  verification?: TargetRankingVerification;

  // Expanded content
  history?: Array<{
    date: string;
    dayOfWeek: string;
    isInCohort?: boolean;
    diff: number;
    games: number;
    payoutRate?: number;
    isHighSetting?: boolean;
  }>;
  contributions?: {
    cohortDiffScore: number;
    cohortWinRateScore: number;
    highSettingScore: number;
    modelScore: number;
    tailBonusScore: number;
    recentStateScore: number;
  };
  sampleRecords?: Array<{
    date: string;
    dayOfWeek: string;
    isOldEventDay?: boolean;
    avgDiffCoins: number;
    winRate: number | null;
    avgGames: number;
  }>;
  subMachines?: TargetRankingRow[];

  raw?: any;
}

export interface HelpTooltipProps {
  term: string;
  description: string;
  id?: string;
}

/**
 * Help tooltip for glossary terms (期待差枚, 80%範囲, 信頼度) (Prompt 59 Requirement 5)
 */
export const HelpTooltip: React.FC<HelpTooltipProps> = ({ term, description, id }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1 z-20">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
        aria-label={`${term}の説明`}
        id={id}
        data-testid={`tooltip-btn-${term}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {isOpen && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-60 p-2.5 bg-slate-900 text-white text-[11px] font-normal normal-case rounded-lg shadow-lg pointer-events-none z-50 text-left leading-normal"
          data-testid={`tooltip-content-${term}`}
        >
          <strong className="block font-bold text-amber-300 mb-0.5">{term}</strong>
          {description}
        </span>
      )}
    </span>
  );
};

export interface History14DayBarChartProps {
  history?: Array<{
    date: string;
    dayOfWeek: string;
    isInCohort?: boolean;
    diff: number;
    games: number;
    payoutRate?: number;
    isHighSetting?: boolean;
  }>;
}

/**
 * Mini bar chart showing up to 14 days of diff history (Prompt 59 Requirement 3)
 * Positive = Green, Negative = Red, Same-condition day highlighted.
 */
export const History14DayBarChart: React.FC<History14DayBarChartProps> = ({ history }) => {
  const sorted14 = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [history]);

  if (sorted14.length === 0) {
    return (
      <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
        直近の稼働履歴データがありません。
      </div>
    );
  }

  const maxVal = Math.max(1000, ...sorted14.map((h) => Math.abs(h.diff)));
  const wins = sorted14.filter((h) => h.diff > 0).length;
  const cohortDays = sorted14.filter((h) => h.isInCohort).length;

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3 shadow-2xs"
      data-testid="history-14-bar-chart"
    >
      {/* Header & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>直近14日間の差枚推移 ({sorted14.length}日分)</span>
        </div>
        <div className="flex items-center gap-3 text-2xs text-slate-600">
          <span>
            プラス日数: <strong className="text-emerald-700 font-bold">{wins}日</strong> / {sorted14.length}日 ({Math.round((wins / sorted14.length) * 100)}%)
          </span>
          {cohortDays > 0 && (
            <span>
              同条件日: <strong className="text-amber-700 font-bold">{cohortDays}日</strong>
            </span>
          )}
        </div>
      </div>

      {/* Bar Chart Container */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-end justify-between gap-1.5 min-w-[500px] h-32 pt-5 pb-6 relative">
          {/* Zero baseline */}
          <div className="absolute left-0 right-0 top-16 h-px bg-slate-300 z-0" />
          <span className="absolute right-0 top-14 text-[9px] font-mono text-slate-400">0枚</span>

          {sorted14.map((h, idx) => {
            const isPos = h.diff >= 0;
            const barHeightPct = Math.max(8, Math.min(100, (Math.abs(h.diff) / maxVal) * 100));
            const barPixels = Math.round((barHeightPct / 100) * 44);

            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center h-full relative group cursor-pointer"
                title={`${h.date} (${h.dayOfWeek})\n差枚: ${isPos ? '+' : ''}${h.diff}枚\n稼働: ${formatNumber(h.games)}G${h.isInCohort ? '\n★同条件' : ''}`}
                data-testid={`history-bar-${idx}`}
              >
                {/* Same-condition highlight marker above */}
                {h.isInCohort && (
                  <span
                    className="absolute top-0 text-[9px] font-black px-1 rounded bg-amber-400 text-slate-950 shadow-2xs whitespace-nowrap z-20"
                    data-testid="same-condition-badge"
                  >
                    同条件
                  </span>
                )}

                {/* Positive bar area (top half: green) */}
                <div className="h-11 w-full flex items-end justify-center relative">
                  {isPos && (
                    <div
                      className={`w-full max-w-[24px] rounded-t transition-all ${
                        h.isInCohort
                          ? 'bg-emerald-500 ring-2 ring-amber-400 border border-amber-300 shadow-2xs'
                          : 'bg-emerald-500 hover:bg-emerald-600'
                      }`}
                      style={{ height: `${barPixels}px` }}
                      data-testid="positive-bar"
                    />
                  )}
                  {isPos && (
                    <span className="absolute -top-3.5 text-[9px] font-mono font-bold text-emerald-700 whitespace-nowrap">
                      +{formatNumber(h.diff)}
                    </span>
                  )}
                </div>

                {/* Center gap / zero line */}
                <div className="h-0.5 w-full relative z-10" />

                {/* Negative bar area (bottom half: red) */}
                <div className="h-11 w-full flex items-start justify-center relative">
                  {!isPos && (
                    <div
                      className={`w-full max-w-[24px] rounded-b transition-all ${
                        h.isInCohort
                          ? 'bg-rose-500 ring-2 ring-amber-400 border border-amber-300 shadow-2xs'
                          : 'bg-rose-500 hover:bg-rose-600'
                      }`}
                      style={{ height: `${barPixels}px` }}
                      data-testid="negative-bar"
                    />
                  )}
                  {!isPos && (
                    <span className="absolute -bottom-3 text-[9px] font-mono font-bold text-rose-700 whitespace-nowrap">
                      {formatNumber(h.diff)}
                    </span>
                  )}
                </div>

                {/* Date label */}
                <div className="mt-4 text-center">
                  <span className="text-[10px] font-mono font-bold text-slate-700 block whitespace-nowrap">
                    {h.date.slice(5)}
                  </span>
                  <span
                    className={`text-[9px] font-bold block ${
                      h.dayOfWeek === '日'
                        ? 'text-rose-600'
                        : h.dayOfWeek === '土'
                        ? 'text-blue-600'
                        : 'text-slate-500'
                    }`}
                  >
                    ({h.dayOfWeek})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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

const getConfidenceStars = (confidence?: string): string => {
  if (confidence === '高') return '★★★';
  if (confidence === '中') return '★★☆';
  if (confidence === '低') return '★☆☆';
  return '★★☆';
};

interface Diff80CellBarProps {
  lift: number;
  liftLower: number;
  liftUpper: number;
}

/**
 * Compact 80% range bar with 0 marker for table cells
 */
const Diff80CellBar: React.FC<Diff80CellBarProps> = ({ lift, liftLower, liftUpper }) => {
  const roundedLift = roundForDisplay(lift);
  const roundedLower = roundForDisplay(liftLower);
  const roundedUpper = roundForDisplay(liftUpper);

  const minVal = Math.min(-300, roundedLower - 100);
  const maxVal = Math.max(600, roundedUpper + 150);
  const span = Math.max(200, maxVal - minVal);

  const getPct = (v: number) => Math.max(0, Math.min(100, ((v - minVal) / span) * 100));

  const zeroPct = getPct(0);
  const lowerPct = getPct(roundedLower);
  const upperPct = getPct(roundedUpper);
  const liftPct = getPct(roundedLift);

  const barLeft = Math.min(lowerPct, upperPct);
  const barWidth = Math.max(4, Math.abs(upperPct - lowerPct));

  return (
    <div className="space-y-0.5 py-0.5" data-testid="diff-80-cell-bar">
      <div className="font-mono font-black text-xs">
        <span className={roundedLift >= 0 ? 'text-emerald-700' : 'text-slate-700'}>
          {roundedLift >= 0 ? `+${formatNumber(roundedLift)}` : formatNumber(roundedLift)}枚
        </span>
        <span className="text-[10px] text-slate-400 font-sans font-normal ml-1">
          (目安)
        </span>
      </div>

      {/* Mini Range Bar with 0 marker */}
      <div className="relative h-2 bg-slate-100 rounded-full border border-slate-200/80 my-1">
        <div
          className={`absolute top-0 bottom-0 rounded-full ${
            roundedLower > 0
              ? 'bg-emerald-500/40 border border-emerald-500/60'
              : roundedUpper < 0
              ? 'bg-rose-500/40 border border-rose-500/60'
              : 'bg-amber-500/40 border border-amber-500/60'
          }`}
          style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
          data-testid="cell-range-band"
        />
        <div
          className="absolute -top-0.5 w-0.5 h-3 bg-slate-400 z-10 -translate-x-1/2"
          style={{ left: `${zeroPct}%` }}
          title="0 (全台平均)"
          data-testid="zero-tick"
        />
        <div
          className="absolute top-1/2 w-2 h-2 bg-slate-900 rounded-full border border-white z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${liftPct}%` }}
          title={`期待リフト: ${roundedLift >= 0 ? '+' : ''}${roundedLift}枚`}
          data-testid="lift-marker"
        />
      </div>

      <div className="text-[10px] text-slate-500 font-mono tabular-nums" data-testid="range-80-text">
        {roundedLower >= 0 ? `+${formatNumber(roundedLower)}` : formatNumber(roundedLower)}〜
        {roundedUpper >= 0 ? `+${formatNumber(roundedUpper)}` : formatNumber(roundedUpper)}枚
      </div>
    </div>
  );
};

export interface TargetRankingToolbarProps {
  availableModels?: string[];
  availableIslands?: string[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  selectedTail?: string;
  onTailChange?: (tail: string) => void;
  selectedIsland?: string;
  onIslandChange?: (island: string) => void;
  selectedConfidence?: 'all' | '高' | '中' | '低';
  onConfidenceChange?: (conf: 'all' | '高' | '中' | '低') => void;
  minEvidenceDays?: number;
  onMinEvidenceDaysChange?: (days: number) => void;

  // Metric switch (actual vs standard G)
  diffMetric?: 'actual' | 'std';
  onDiffMetricChange?: (metric: 'actual' | 'std') => void;
  baseGames?: number;
  onBaseGamesChange?: (games: number) => void;

  // Coins vs Yen
  metricMode?: 'diffCoins' | 'yen';
  onMetricModeChange?: (mode: 'diffCoins' | 'yen') => void;

  // Low confidence toggle
  includeLowConfidence?: boolean;
  onToggleLowConfidence?: (include: boolean) => void;

  // Expand / collapse all
  isAllExpanded?: boolean;
  onToggleExpandAll?: () => void;
  hasExpandableRows?: boolean;

  // Copy & CSV Export
  onCopyText?: () => void;
  onExportCsv?: () => void;
  copyFeedback?: string | null;

  // Display count / info
  totalCount?: number;
  filteredCount?: number;

  // View Mode: Simple vs Detailed (Prompt 59)
  viewMode?: TargetRankingViewMode;
  onViewModeChange?: (mode: TargetRankingViewMode) => void;

  // Display Type: Table vs Floor Map (Prompt 60 Requirement 1)
  displayType?: TargetRankingDisplayType;
  onDisplayTypeChange?: (displayType: TargetRankingDisplayType) => void;
  rankingType?: TargetRankingType;
}

export const TargetRankingToolbar: React.FC<TargetRankingToolbarProps> = ({
  availableModels = [],
  availableIslands = [],
  selectedModel = 'all',
  onModelChange,
  selectedTail = 'all',
  onTailChange,
  selectedIsland = 'all',
  onIslandChange,
  selectedConfidence = 'all',
  onConfidenceChange,
  minEvidenceDays = 0,
  onMinEvidenceDaysChange,
  diffMetric = 'std',
  onDiffMetricChange,
  baseGames = 5000,
  onBaseGamesChange,
  metricMode = 'diffCoins',
  onMetricModeChange,
  includeLowConfidence = false,
  onToggleLowConfidence,
  isAllExpanded = false,
  onToggleExpandAll,
  hasExpandableRows = false,
  onCopyText,
  onExportCsv,
  copyFeedback = null,
  totalCount,
  filteredCount,
  viewMode = 'simple',
  onViewModeChange,
  displayType = 'table',
  onDisplayTypeChange,
  rankingType = 'machine',
}) => {
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedModel && selectedModel !== 'all') count++;
    if (selectedTail && selectedTail !== 'all') count++;
    if (selectedIsland && selectedIsland !== 'all') count++;
    if (selectedConfidence && selectedConfidence !== 'all') count++;
    if (minEvidenceDays && minEvidenceDays > 0) count++;
    return count;
  }, [selectedModel, selectedTail, selectedIsland, selectedConfidence, minEvidenceDays]);

  const handleResetFilters = () => {
    if (onModelChange) onModelChange('all');
    if (onTailChange) onTailChange('all');
    if (onIslandChange) onIslandChange('all');
    if (onConfidenceChange) onConfidenceChange('all');
    if (onMinEvidenceDaysChange) onMinEvidenceDaysChange(0);
  };

  return (
    <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 space-y-3 text-xs">
      {/* Top row: Filter selectors & View Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* 表示切替: 表／フロアマップ (Prompt 60 Requirement 1) */}
          {rankingType === 'machine' && onDisplayTypeChange && (
            <div
              className="inline-flex items-center p-0.5 bg-slate-200/90 rounded-xl font-bold shadow-2xs mr-1"
              data-testid="display-mode-toggle"
            >
              <button
                type="button"
                onClick={() => onDisplayTypeChange('table')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  displayType === 'table'
                    ? 'bg-white text-slate-950 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="display-mode-table-btn"
              >
                表
              </button>
              <button
                type="button"
                onClick={() => onDisplayTypeChange('floorMap')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  displayType === 'floorMap'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="display-mode-floormap-btn"
              >
                フロアマップ
              </button>
            </div>
          )}

          {/* 表示切替: 簡易／詳細 (Prompt 59 Requirement 1) - only in table mode */}
          {displayType === 'table' && onViewModeChange && (
            <div
              className="inline-flex items-center p-0.5 bg-slate-200/90 rounded-xl font-bold shadow-2xs mr-1"
              data-testid="view-mode-toggle"
            >
              <button
                type="button"
                onClick={() => onViewModeChange('simple')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  viewMode === 'simple'
                    ? 'bg-white text-slate-950 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="view-mode-simple-btn"
              >
                簡易
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('detailed')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  viewMode === 'detailed'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="view-mode-detailed-btn"
              >
                詳細
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
            <span>絞り込み:</span>
          </div>

          {/* Model Filter */}
          {availableModels.length > 0 && onModelChange && (
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">機種:</span>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer max-w-[140px] truncate"
              >
                <option value="all">全機種</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tail Filter */}
          {onTailChange && (
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">末尾:</span>
              <select
                value={selectedTail}
                onChange={(e) => onTailChange(e.target.value)}
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
          )}

          {/* Island Filter */}
          {availableIslands.length > 0 && onIslandChange && (
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">島:</span>
              <select
                value={selectedIsland}
                onChange={(e) => onIslandChange(e.target.value)}
                className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer max-w-[120px] truncate"
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

          {/* Confidence Filter */}
          {onConfidenceChange && (
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">信頼度:</span>
              <select
                value={selectedConfidence}
                onChange={(e) => onConfidenceChange(e.target.value as any)}
                className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="all">全信頼度</option>
                <option value="高">高信頼のみ (高)</option>
                <option value="中">中信頼以上 (中)</option>
                <option value="低">低信頼 (低)</option>
              </select>
            </div>
          )}

          {/* Min Evidence Days Filter */}
          {onMinEvidenceDaysChange && (
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">根拠:</span>
              <select
                value={minEvidenceDays}
                onChange={(e) => onMinEvidenceDaysChange(Number(e.target.value))}
                className="font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value={0}>指定なし</option>
                <option value={3}>3日以上</option>
                <option value={5}>5日以上</option>
                <option value={7}>7日以上</option>
                <option value={10}>10日以上</option>
              </select>
            </div>
          )}

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2 py-1 text-2xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>条件クリア ({activeFiltersCount})</span>
            </button>
          )}
        </div>

        {/* Right side: Count indicator */}
        {filteredCount !== undefined && (
          <div className="text-2xs text-slate-500 font-medium">
            表示: <strong>{filteredCount}</strong> 件
            {totalCount !== undefined ? ` / 候補 ${totalCount} 件` : ''}
          </div>
        )}
      </div>

      {/* Bottom row: Metric switches, Low confidence toggle, Expand all, Copy/CSV */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* G数換算切替 (実稼働 vs 基準G換算) */}
          {onDiffMetricChange && (
            <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg font-bold">
              <button
                type="button"
                onClick={() => onDiffMetricChange('std')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  diffMetric === 'std'
                    ? 'bg-white text-slate-900 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="基準5,000G換算に揃えた期待差枚を表示"
              >
                基準5,000G換算
              </button>
              <button
                type="button"
                onClick={() => onDiffMetricChange('actual')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  diffMetric === 'actual'
                    ? 'bg-white text-indigo-700 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="各台の過去の実際の平均稼働G数に合わせた期待差枚を表示"
              >
                実稼働換算
              </button>
              {diffMetric === 'std' && onBaseGamesChange && (
                <div className="flex items-center gap-1 pl-1.5 pr-1 border-l border-slate-300">
                  <span className="text-2xs text-slate-500 font-medium">基準G:</span>
                  <input
                    type="number"
                    min={1000}
                    max={15000}
                    step={500}
                    value={baseGames}
                    onChange={(e) => onBaseGamesChange(Math.max(100, Number(e.target.value) || 5000))}
                    className="w-16 px-1 py-0.2 text-xs font-mono bg-white border border-slate-300 rounded text-right font-bold text-slate-800 focus:outline-hidden"
                  />
                  <span className="text-2xs text-slate-500 font-medium">G</span>
                </div>
              )}
            </div>
          )}

          {/* Metric Coins vs Yen Toggle */}
          {onMetricModeChange && (
            <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg font-bold">
              <button
                type="button"
                onClick={() => onMetricModeChange('diffCoins')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  metricMode === 'diffCoins'
                    ? 'bg-white text-slate-900 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                期待差枚(枚)
              </button>
              <button
                type="button"
                onClick={() => onMetricModeChange('yen')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  metricMode === 'yen'
                    ? 'bg-white text-amber-700 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="各店の交換率を反映した期待収支(円換算)"
              >
                期待収支(円)
              </button>
            </div>
          )}

          {/* Low Confidence Toggle */}
          {onToggleLowConfidence && (
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none bg-white border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={includeLowConfidence}
                onChange={(e) => onToggleLowConfidence(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span className="font-bold">低信頼も表示</span>
            </label>
          )}

          {/* Expand / Collapse All Toggle */}
          {hasExpandableRows && onToggleExpandAll && (
            <button
              type="button"
              onClick={onToggleExpandAll}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
              title={isAllExpanded ? 'すべての履歴・詳細を折りたたむ' : 'すべての履歴・詳細を展開'}
            >
              {isAllExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-indigo-600" />
                  <span>全履歴を閉じる</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>全履歴を展開</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Copy & CSV Export Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {onCopyText && (
            <button
              type="button"
              onClick={onCopyText}
              className="py-1 px-2.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="ランキングをクリップボードにテキストコピー"
            >
              <Copy className="w-3 h-3" />
              <span>テキストコピー</span>
            </button>
          )}

          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="py-1 px-2.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="CSVファイルとしてダウンロード"
            >
              <Download className="w-3 h-3" />
              <span>CSV書き出し</span>
            </button>
          )}

          {copyFeedback && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>{copyFeedback}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export interface TargetRankingTableProps {
  title?: string;
  rankingType?: TargetRankingType; // 'machine' | 'model'
  rows: TargetRankingRow[];
  showStoreColumn?: boolean; // 店舗名の列を表示（横断ランキング等）

  // View Mode: Simple (5 cols) vs Detailed (all cols) (Prompt 59)
  viewMode?: TargetRankingViewMode;
  defaultViewMode?: TargetRankingViewMode;
  onViewModeChange?: (mode: TargetRankingViewMode) => void;
  dayMeanExpectedDiff?: number;

  // Display Type: Table vs Floor Map (Prompt 60 Requirement 1)
  displayType?: TargetRankingDisplayType;
  defaultDisplayType?: TargetRankingDisplayType;
  onDisplayTypeChange?: (displayType: TargetRankingDisplayType) => void;

  // Island config & definitions for floor map (Prompt 60 Requirement 2)
  islandConfig?: string;
  islandDefinitions?: IslandDefinition[];
  storeIslandConfigMap?: Record<string, string>;

  // Checked state for "空いていない" (Prompt 60 Requirement 4)
  checkedState?: Record<number, MachineCheckStatus>;
  onToggleCheck?: (machineNum: number, status: MachineCheckStatus) => void;

  // Target date & store info for floor map
  targetDate?: string;
  storeId?: string;
  stores?: Array<{ id: string; name: string; islandConfig?: string }>;

  // Toolbar settings
  toolbar?: {
    enabled?: boolean;
    availableModels?: string[];
    availableIslands?: string[];
    selectedModel?: string;
    onModelChange?: (model: string) => void;
    selectedTail?: string;
    onTailChange?: (tail: string) => void;
    selectedIsland?: string;
    onIslandChange?: (island: string) => void;
    selectedConfidence?: 'all' | '高' | '中' | '低';
    onConfidenceChange?: (conf: 'all' | '高' | '中' | '低') => void;
    minEvidenceDays?: number;
    onMinEvidenceDaysChange?: (days: number) => void;
    diffMetric?: 'actual' | 'std';
    onDiffMetricChange?: (metric: 'actual' | 'std') => void;
    baseGames?: number;
    onBaseGamesChange?: (games: number) => void;
    metricMode?: 'diffCoins' | 'yen';
    onMetricModeChange?: (mode: 'diffCoins' | 'yen') => void;
    includeLowConfidence?: boolean;
    onToggleLowConfidence?: (include: boolean) => void;
    exportStoreName?: string;
    exportTargetDate?: string;
    totalCount?: number;
    filteredCount?: number;
  };

  emptyMessage?: string;
  expandedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  formatProfitValue?: (coins: number) => string;
  onSelectModel?: (modelName: string) => void;
  selectedModelName?: string | null;
  isModelFilterActive?: boolean;
  activeFilterLabel?: string;
  selectedModelNames?: string[];
}

export const TargetRankingTable: React.FC<TargetRankingTableProps> = ({
  title,
  rankingType = 'machine',
  rows,
  showStoreColumn = false,
  viewMode: controlledViewMode,
  defaultViewMode,
  onViewModeChange,
  dayMeanExpectedDiff,
  displayType: controlledDisplayType,
  defaultDisplayType,
  onDisplayTypeChange,
  islandConfig,
  islandDefinitions,
  storeIslandConfigMap,
  checkedState,
  onToggleCheck,
  targetDate,
  storeId,
  stores,
  toolbar,
  emptyMessage,
  expandedIds: controlledExpandedIds,
  onToggleExpand: controlledOnToggleExpand,
  formatProfitValue,
  onSelectModel,
  selectedModelName,
  isModelFilterActive,
  activeFilterLabel,
  selectedModelNames,
}) => {
  // Display Type state: Table vs Floor Map (Prompt 60 Requirement 1)
  const [internalDisplayType, setInternalDisplayType] = useState<TargetRankingDisplayType>(() => {
    if (defaultDisplayType) return defaultDisplayType;
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(TARGET_TABLE_DISPLAY_TYPE_STORAGE_KEY);
        if (saved === 'floorMap' || saved === 'table' || saved === 'scatter') return saved;
      } catch {
        // ignore
      }
    }
    return 'table'; // 既定は表
  });

  const currentDisplayType = controlledDisplayType || internalDisplayType;

  const handleDisplayTypeChange = (type: TargetRankingDisplayType) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(TARGET_TABLE_DISPLAY_TYPE_STORAGE_KEY, type);
      } catch (err) {
        console.warn('Failed to save display type to localStorage:', err);
      }
    }
    setInternalDisplayType(type);
    onDisplayTypeChange?.(type);
  };

  // View mode state with localStorage persistence (Prompt 59 Requirement 1: 既定は簡易)
  const [internalViewMode, setInternalViewMode] = useState<TargetRankingViewMode>(() => {
    if (defaultViewMode) return defaultViewMode;
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(TARGET_TABLE_VIEW_MODE_STORAGE_KEY);
        if (saved === 'detailed' || saved === 'simple') return saved;
      } catch {
        // ignore
      }
    }
    return 'simple'; // 既定は簡易
  });

  const currentViewMode = controlledViewMode || internalViewMode;

  const handleViewModeChange = (mode: TargetRankingViewMode) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(TARGET_TABLE_VIEW_MODE_STORAGE_KEY, mode);
      } catch (err) {
        console.warn('Failed to save view mode to localStorage:', err);
      }
    }
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };

  // Local state for expanded rows if uncontrolled
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(new Set());
  const [expandedReasonsIds, setExpandedReasonsIds] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const isControlled = controlledExpandedIds !== undefined;
  const expandedSet = isControlled ? controlledExpandedIds : internalExpandedIds;

  const handleToggleRow = (id: string) => {
    if (controlledOnToggleExpand) {
      controlledOnToggleExpand(id);
    } else {
      setInternalExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const toggleReasonsExpand = (id: string) => {
    setExpandedReasonsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute day's mean expected diff across displayed rows
  const dayMean = useMemo(() => {
    if (dayMeanExpectedDiff !== undefined) return dayMeanExpectedDiff;
    if (!rows || rows.length === 0) return 0;
    const sum = rows.reduce((acc, r) => acc + (r.expectedDiff || 0), 0);
    return sum / rows.length;
  }, [rows, dayMeanExpectedDiff]);

  const hasExpandableRows = useMemo(() => {
    return rows.some(
      (r) =>
        (r.history && r.history.length > 0) ||
        (r.sampleRecords && r.sampleRecords.length > 0) ||
        (r.subMachines && r.subMachines.length > 0) ||
        r.contributions
    );
  }, [rows]);

  const isAllExpanded = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => expandedSet.has(r.id));
  }, [rows, expandedSet]);

  const handleToggleExpandAll = () => {
    if (isAllExpanded) {
      if (isControlled && controlledOnToggleExpand) {
        rows.forEach((r) => {
          if (expandedSet.has(r.id)) controlledOnToggleExpand(r.id);
        });
      } else {
        setInternalExpandedIds(new Set());
      }
    } else {
      if (isControlled && controlledOnToggleExpand) {
        rows.forEach((r) => {
          if (!expandedSet.has(r.id)) controlledOnToggleExpand(r.id);
        });
      } else {
        setInternalExpandedIds(new Set(rows.map((r) => r.id)));
      }
    }
  };

  // Copy text generator
  const handleCopyText = () => {
    const storeLabel = toolbar?.exportStoreName || '全店';
    const dateLabel = toolbar?.exportTargetDate || '';
    const lines: string[] = [
      `【${storeLabel}】${dateLabel ? `${dateLabel} ` : ''}狙い${rankingType === 'machine' ? '台' : '機種'}ランキング`,
      '----------------------------------------',
    ];

    if (rows.length === 0) {
      lines.push('対象のランキングデータはありません。');
    } else {
      rows.forEach((r) => {
        const storeStr = showStoreColumn && r.storeName ? `[${r.storeName}] ` : '';
        const diffStr = r.expectedDiff >= 0 ? `+${formatNumber(r.expectedDiff)}` : formatNumber(r.expectedDiff);
        const uncStr = r.interval80
          ? ` (80%範囲: ${r.interval80[0] >= 0 ? '+' : ''}${formatNumber(r.interval80[0])}〜${r.interval80[1] >= 0 ? '+' : ''}${formatNumber(r.interval80[1])}枚)`
          : r.uncertainty80
          ? ` (±${r.uncertainty80.margin}枚)`
          : '';
        const reasonsStr = r.reasons.length > 0 ? r.reasons.join(' / ') : r.tacticalReason || '過去実績に基づく推論';

        if (rankingType === 'machine') {
          const islStr = r.islandName ? ` [${r.islandName}]` : '';
          const confStr = r.confidence ? ` | 信頼度: ${r.confidence}` : '';
          lines.push(
            `${r.rank}位: ${storeStr}${r.modelName} ${r.machineNum}番台${islStr} | 期待差枚: ${diffStr}枚${uncStr}${confStr} | 根拠: ${reasonsStr}`
          );
        } else {
          const machStr = r.totalMachines ? ` (${r.totalMachines}台)` : '';
          const payoutStr = r.payoutRate !== undefined ? ` | 割: ${r.payoutRate}%` : '';
          const winStr = r.winRate !== undefined ? ` | 勝率: ${r.winRate}%` : '';
          lines.push(
            `${r.rank}位: ${storeStr}${r.modelName}${machStr} | 期待差枚: ${diffStr}枚${uncStr}${payoutStr}${winStr} | 理由: ${reasonsStr}`
          );
        }
      });
    }

    try {
      navigator.clipboard.writeText(lines.join('\n'));
      setCopyFeedback('コピーしました！');
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.warn('Failed to copy text:', err);
    }
  };

  // CSV download generator
  const handleExportCsv = () => {
    const storeLabel = toolbar?.exportStoreName || 'all_stores';
    const dateLabel = toolbar?.exportTargetDate || 'export';
    const isMach = rankingType === 'machine';

    const header = isMach
      ? [
          '順位',
          ...(showStoreColumn ? ['店舗名'] : []),
          '機種名',
          '台番',
          '島名',
          '信頼度',
          '根拠日数',
          '期待差枚(枚)',
          '80%予測下限(枚)',
          '80%予測上限(枚)',
          '選定理由要約',
          '検証判定',
        ]
      : [
          '順位',
          ...(showStoreColumn ? ['店舗名'] : []),
          '機種名',
          '設置台数',
          '期待差枚(枚)',
          '予想機械割(%)',
          '予想勝率(%)',
          '選定理由要約',
        ];

    const escapeCsv = (val: string | number | undefined | null): string => {
      if (val === undefined || val === null) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvRows = [header.map(escapeCsv).join(',')];

    rows.forEach((r) => {
      const reasonsSummary = r.reasons.length > 0 ? r.reasons.join(' / ') : r.tacticalReason || '';
      if (isMach) {
        const itemRow: (string | number | undefined | null)[] = [
          r.rank,
          ...(showStoreColumn ? [r.storeName || ''] : []),
          r.modelName,
          r.machineNum || '',
          r.islandName || '',
          r.confidence || '',
          r.evidenceDays ?? '',
          r.expectedDiff,
          r.interval80 ? r.interval80[0] : r.uncertainty80?.min ?? '',
          r.interval80 ? r.interval80[1] : r.uncertainty80?.max ?? '',
          reasonsSummary,
          r.verification?.label || (r.verification?.hasEdge ? '優位性あり' : '未検証'),
        ];
        csvRows.push(itemRow.map(escapeCsv).join(','));
      } else {
        const itemRow: (string | number | undefined | null)[] = [
          r.rank,
          ...(showStoreColumn ? [r.storeName || ''] : []),
          r.modelName,
          r.totalMachines ?? '',
          r.expectedDiff,
          r.payoutRate ?? '',
          r.winRate ?? '',
          reasonsSummary,
        ];
        csvRows.push(itemRow.map(escapeCsv).join(','));
      }
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `target_ranking_${storeLabel}_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getRankBadge = (rank: number, grade?: string) => {
    if (grade) {
      if (rank === 1) {
        return (
          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-2 py-0.5 rounded text-xs font-black shadow-xs whitespace-nowrap">
            <span>🥇</span>
            <span>1位 ({grade})</span>
          </span>
        );
      }
      if (rank === 2) {
        return (
          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-slate-200 to-slate-300 text-slate-900 px-2 py-0.5 rounded text-xs font-bold shadow-xs whitespace-nowrap">
            <span>🥈</span>
            <span>2位 ({grade})</span>
          </span>
        );
      }
      if (rank === 3) {
        return (
          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-100 to-amber-200 text-amber-950 border border-amber-300 px-2 py-0.5 rounded text-xs font-bold shadow-xs whitespace-nowrap">
            <span>🥉</span>
            <span>3位 ({grade})</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">
          <span>{rank}位</span>
          <span className="text-[10px] opacity-75">({grade})</span>
        </span>
      );
    }

    return (
      <span
        className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs font-black ${
          rank === 1
            ? 'bg-amber-500 text-slate-950 shadow-2xs'
            : rank === 2
            ? 'bg-slate-300 text-slate-900 font-bold'
            : rank === 3
            ? 'bg-amber-700 text-white font-bold'
            : 'bg-slate-100 text-slate-700'
        }`}
      >
        #{rank}
      </span>
    );
  };

  const getConfidenceBadge = (confidence?: string, evidenceDays?: number, reliabilityRate?: number) => {
    if (!confidence) {
      if (evidenceDays !== undefined && evidenceDays > 0) {
        return (
          <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            実績 {evidenceDays}日
          </span>
        );
      }
      return <span className="text-slate-400 text-2xs">-</span>;
    }

    const style =
      confidence === '高'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
        : confidence === '中'
        ? 'bg-amber-50 text-amber-700 border-amber-300'
        : 'bg-slate-100 text-slate-600 border-slate-300';

    return (
      <span className={`px-2 py-0.5 rounded-full text-2xs font-bold border inline-block whitespace-nowrap ${style}`}>
        {confidence}
        {reliabilityRate !== undefined ? ` (${reliabilityRate}%)` : ''}
        {evidenceDays !== undefined && evidenceDays > 0 ? ` (根拠${evidenceDays}日)` : ''}
      </span>
    );
  };

  const getVerificationBadge = (v?: TargetRankingVerification) => {
    if (!v) return <span className="text-slate-400 text-2xs">-</span>;

    if (v.isTesting || v.status === 'testing') {
      return (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-sky-50 text-sky-700 border border-sky-300 inline-flex items-center gap-1">
          <RotateCw className="w-3 h-3 animate-spin text-sky-600" />
          <span>検証中</span>
        </span>
      );
    }

    if (v.hasEdge || v.status === 'edge') {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className="px-2 py-0.5 rounded-md text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>優位性あり</span>
          </span>
          {v.avgLift !== undefined && (
            <span className="text-[10px] font-mono text-slate-600 font-bold">
              リフト: {v.avgLift >= 0 ? `+${v.avgLift}` : v.avgLift}枚
              {v.ci95 && (
                <span className="text-slate-400 font-normal ml-0.5">
                  [{v.ci95[0]}〜{v.ci95[1]}]
                </span>
              )}
            </span>
          )}
        </div>
      );
    }

    if (v.hasEdge === false || v.status === 'noEdge') {
      return (
        <span className="px-2 py-0.5 rounded-md text-2xs font-bold bg-slate-100 text-slate-600 border border-slate-300 inline-flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-slate-400" />
          <span>優位性未確認</span>
        </span>
      );
    }

    if (v.status === 'untested' && v.onRunTest) {
      return (
        <button
          type="button"
          onClick={v.onRunTest}
          className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-2xs font-bold border border-indigo-200 cursor-pointer"
        >
          検証
        </button>
      );
    }

    if (v.label) {
      return (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
          {v.label}
        </span>
      );
    }

    return <span className="text-slate-400 text-2xs">-</span>;
  };

  const isSimpleMachineView = currentViewMode === 'simple' && rankingType === 'machine';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden" data-testid="target-ranking-table-card">
      {/* Optional Title Header with View Mode Switch */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
          {title ? (
            <span>{title}</span>
          ) : (
            <span>{rankingType === 'machine' ? '狙い台ランキング' : '狙い機種ランキング'}</span>
          )}
        </h4>

        {/* View mode & display type toggle buttons */}
        <div className="flex items-center gap-2">
          {/* Display Mode: 表／フロアマップ (Prompt 60 Requirement 1) */}
          {rankingType === 'machine' && (
            <div
              className="inline-flex items-center p-0.5 bg-slate-200/90 rounded-xl font-bold shadow-2xs mr-1"
              data-testid="header-display-mode-toggle"
            >
              <button
                type="button"
                onClick={() => handleDisplayTypeChange('table')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  currentDisplayType === 'table'
                    ? 'bg-white text-slate-950 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="header-display-mode-table-btn"
              >
                表
              </button>
              <button
                type="button"
                onClick={() => handleDisplayTypeChange('floorMap')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  currentDisplayType === 'floorMap'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="header-display-mode-floormap-btn"
              >
                フロアマップ
              </button>
              <button
                type="button"
                onClick={() => handleDisplayTypeChange('scatter')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  currentDisplayType === 'scatter'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="header-display-mode-scatter-btn"
              >
                散布図
              </button>
            </div>
          )}

          {/* View mode toggle button: 簡易／詳細 (only in table mode) */}
          {currentDisplayType === 'table' && (
            <div
              className="inline-flex items-center p-0.5 bg-slate-200/90 rounded-xl font-bold shadow-2xs"
              data-testid="header-view-mode-toggle"
            >
              <button
                type="button"
                onClick={() => handleViewModeChange('simple')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  currentViewMode === 'simple'
                    ? 'bg-white text-slate-950 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="toggle-view-simple"
              >
                簡易
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('detailed')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  currentViewMode === 'detailed'
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="toggle-view-detailed"
              >
                詳細
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar (if enabled) */}
      {toolbar?.enabled && (
        <TargetRankingToolbar
          availableModels={toolbar.availableModels}
          availableIslands={toolbar.availableIslands}
          selectedModel={toolbar.selectedModel}
          onModelChange={toolbar.onModelChange}
          selectedTail={toolbar.selectedTail}
          onTailChange={toolbar.onTailChange}
          selectedIsland={toolbar.selectedIsland}
          onIslandChange={toolbar.onIslandChange}
          selectedConfidence={toolbar.selectedConfidence}
          onConfidenceChange={toolbar.onConfidenceChange}
          minEvidenceDays={toolbar.minEvidenceDays}
          onMinEvidenceDaysChange={toolbar.onMinEvidenceDaysChange}
          diffMetric={toolbar.diffMetric}
          onDiffMetricChange={toolbar.onDiffMetricChange}
          baseGames={toolbar.baseGames}
          onBaseGamesChange={toolbar.onBaseGamesChange}
          metricMode={toolbar.metricMode}
          onMetricModeChange={toolbar.onMetricModeChange}
          includeLowConfidence={toolbar.includeLowConfidence}
          onToggleLowConfidence={toolbar.onToggleLowConfidence}
          isAllExpanded={isAllExpanded}
          onToggleExpandAll={handleToggleExpandAll}
          hasExpandableRows={hasExpandableRows}
          onCopyText={handleCopyText}
          onExportCsv={handleExportCsv}
          copyFeedback={copyFeedback}
          totalCount={toolbar.totalCount}
          filteredCount={toolbar.filteredCount ?? rows.length}
          viewMode={currentViewMode}
          onViewModeChange={handleViewModeChange}
          displayType={currentDisplayType}
          onDisplayTypeChange={handleDisplayTypeChange}
          rankingType={rankingType}
        />
      )}

      {/* Display Mode switch: Table vs Floor Map vs Scatter */}
      {rankingType === 'machine' && currentDisplayType === 'scatter' ? (
        <TargetExpectationScatter
          rows={rows}
          dayMean={dayMean}
          onSelectMachine={(mach) => {
            handleToggleRow(mach.id);
          }}
        />
      ) : rankingType === 'machine' && currentDisplayType === 'floorMap' ? (
        <TargetFloorMap
          rows={rows}
          dayMeanExpectedDiff={dayMean}
          islandConfig={islandConfig}
          islandDefinitions={islandDefinitions}
          storeIslandConfigMap={storeIslandConfigMap}
          selectedModel={toolbar?.selectedModel}
          onSelectModel={toolbar?.onModelChange}
          availableModels={toolbar?.availableModels}
          checkedState={checkedState}
          onToggleCheck={onToggleCheck}
          isCrossStore={showStoreColumn}
          stores={stores}
          targetDate={targetDate || toolbar?.exportTargetDate}
          storeId={storeId || toolbar?.exportStoreName}
          storeName={toolbar?.exportStoreName}
          isModelFilterActive={isModelFilterActive}
          activeFilterLabel={activeFilterLabel}
          selectedModelNames={selectedModelNames}
        />
      ) : (
        <>
          {/* Prompt 62: 台番の詳細表示に、「平均との差 × 信頼性」の散布図を追加 */}
          {rankingType === 'machine' && currentViewMode === 'detailed' && rows.length > 0 && (
            <div className="p-3 sm:p-4 bg-slate-50/70 border-b border-slate-200" data-testid="detailed-scatter-section">
              <TargetExpectationScatter
                rows={rows}
                dayMean={dayMean}
                onSelectMachine={(mach) => {
                  handleToggleRow(mach.id);
                }}
              />
            </div>
          )}

          {/* Mobile Card View (< 640px) (Prompt 59 Requirement 4) */}
          <div className="block sm:hidden divide-y divide-slate-100" data-testid="mobile-cards-container">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {emptyMessage || '該当するランキングデータがありません。条件を変更してください。'}
          </div>
        ) : (
          rows.map((row) => {
            const isExpanded = expandedSet.has(row.id);
            const isReasonsExpanded = expandedReasonsIds.has(row.id);
            const lift = computeLift(row.expectedDiff, dayMean);
            const lower =
              (row.interval80 ? row.interval80[0] : (row.uncertainty80 ? row.uncertainty80.min : row.expectedDiff - 300)) -
              dayMean;
            const upper =
              (row.interval80 ? row.interval80[1] : (row.uncertainty80 ? row.uncertainty80.max : row.expectedDiff + 300)) -
              dayMean;
            const winProb = estimateWinProbability(row.expectedDiff, 640000, dayMean);
            const winPct = Math.round(winProb.machineWinProb * 100);
            const stars = getConfidenceStars(row.confidence);
            const tags = buildReasonTags(row.contributions, row.evidenceDays, false, false, row.reasons);

            return (
              <div key={row.id} className="p-3.5 space-y-2.5 bg-white" data-testid={`mobile-card-${row.id}`}>
                {/* 上段: 順位・店・機種・台番 */}
                <div className="flex items-start justify-between gap-2" data-testid="mobile-card-top">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-xs px-2 py-0.5 rounded bg-slate-900 text-white">
                        #{row.rank}
                      </span>
                      {showStoreColumn && row.storeName && (
                        <span
                          className="text-2xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 truncate max-w-[140px]"
                          data-testid="mobile-store-badge"
                        >
                          {row.storeName}
                        </span>
                      )}
                      <span className="font-black text-sm text-slate-900 truncate">
                        {row.modelName}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono font-black text-base text-slate-950 whitespace-nowrap shrink-0">
                    {row.machineNum !== undefined ? `${row.machineNum}番台` : `${row.totalMachines ?? '-'}台`}
                  </div>
                </div>

                {/* 中段: 平均との差の棒・勝つ確率 */}
                <div
                  className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/70 space-y-2"
                  data-testid="mobile-card-middle"
                >
                  <Diff80CellBar lift={lift} liftLower={lower} liftUpper={upper} />
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                    <span className="text-slate-500 text-2xs">勝つ確率の目安:</span>
                    <span className="font-mono font-black text-indigo-700 text-xs">
                      {winPct}%
                      <span className="text-slate-400 font-normal text-[10px] ml-1">
                        (全体平均 {Math.round(winProb.hallWinProb * 100)}%)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-2xs">信頼度:</span>
                    <span className="font-mono text-amber-500 font-black text-xs tracking-wider" data-testid="confidence-stars">
                      {stars} <span className="text-slate-500 font-medium text-2xs">({row.confidence || '中'})</span>
                    </span>
                  </div>
                </div>

                {/* 下段: タグ */}
                <div className="flex items-center justify-between gap-2 pt-1" data-testid="mobile-card-bottom">
                  <div
                    className="flex flex-wrap gap-1 items-center cursor-pointer flex-1"
                    onClick={() => toggleReasonsExpand(row.id)}
                    data-testid={`mobile-reasons-toggle-${row.id}`}
                  >
                    {tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getTagBadgeClass(tag.color)}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                    <span className="text-[10px] text-indigo-600 underline font-medium">
                      {isReasonsExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleRow(row.id)}
                    className="px-2 py-1 rounded-lg text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1 shrink-0 cursor-pointer"
                    data-testid={`mobile-toggle-expand-${row.id}`}
                  >
                    <span>{isExpanded ? '履歴を閉じる' : '14日履歴'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Mobile Expanded Reasons (if toggled) */}
                {isReasonsExpanded && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1 animate-in fade-in">
                    {row.reasons && row.reasons.length > 0 ? (
                      row.reasons.map((r, rIdx) => (
                        <div key={rIdx} className="flex items-start gap-1 leading-snug">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{r}</span>
                        </div>
                      ))
                    ) : (
                      <div>{row.tacticalReason || '過去実績に基づく推論'}</div>
                    )}
                  </div>
                )}

                {/* Mobile Expanded Row (14-day history bar chart) */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <History14DayBarChart history={row.history} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Main Ranking Table (>= 640px) */}
      <div className="hidden sm:block overflow-x-auto" data-testid="desktop-table-container">
        <table className="w-full text-xs text-left text-slate-700">
          <thead className="text-[11px] text-slate-500 bg-slate-100/80 uppercase border-b border-slate-200">
            {isSimpleMachineView ? (
              /* Prompt 59 Requirement 1: 簡易表示の5列（順位、店・機種・台番、平均との差、信頼度、理由タグ） */
              <tr data-testid="simple-table-header">
                <th className="px-3 py-3 font-bold text-center w-16">順位</th>
                <th className="px-4 py-3 font-bold">
                  {showStoreColumn ? '店舗名・機種・台番' : '機種・台番'}
                </th>
                <th className="px-4 py-3 font-bold text-right min-w-[200px]">
                  <div className="flex items-center justify-end gap-1">
                    <span>平均との差 (範囲棒)</span>
                    <HelpTooltip
                      id="tooltip-diff"
                      term="平均との差"
                      description="評価対象全台の平均期待差枚との差（リフト）と、80%信用区間の範囲（0の目盛り付き目安）です。"
                    />
                  </div>
                </th>
                <th className="px-3 py-3 font-bold text-center w-28">
                  <div className="flex items-center justify-center gap-1">
                    <span>信頼度</span>
                    <HelpTooltip
                      id="tooltip-confidence"
                      term="信頼度"
                      description="過去の同条件サンプル日数（根拠日数）や縮小推定の分散から判定した★3段階（高・中・低）の評価です。"
                    />
                  </div>
                </th>
                <th className="px-4 py-3 font-bold min-w-[220px]">理由タグ</th>
              </tr>
            ) : (
              /* 詳細表示（現在の全列） */
              <tr data-testid="detailed-table-header">
                <th className="px-3 py-3 font-bold text-center w-12">展開</th>
                <th className="px-3 py-3 font-bold text-center w-16">順位</th>
                {showStoreColumn && (
                  <th className="hidden sm:table-cell px-4 py-3 font-bold">店舗名</th>
                )}
                <th className="px-4 py-3 font-bold">機種名</th>
                <th className="px-3 py-3 font-bold">
                  {rankingType === 'machine' ? '台番' : '台数'}
                </th>
                <th className="px-3 py-3 font-bold text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>{toolbar?.metricMode === 'yen' ? '期待収支 (円)' : '期待差枚'}</span>
                    <HelpTooltip
                      id="tooltip-expected-diff"
                      term="期待差枚"
                      description="店舗の過去実績データと縮小推定（Empirical Bayes）モデルから算出した当日の予想差枚数（目安）です。"
                    />
                  </div>
                </th>
                <th className="px-3 py-3 font-bold text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>80%範囲</span>
                    <HelpTooltip
                      id="tooltip-range-80"
                      term="80%範囲"
                      description="80%の確率で実際の差枚数がこの範囲内に収まると予測される信用区間（目安）です。"
                    />
                  </div>
                </th>
                <th className="px-3 py-3 font-bold text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span>信頼度</span>
                    <HelpTooltip
                      id="tooltip-confidence-detail"
                      term="信頼度"
                      description="過去の同条件サンプル日数（根拠日数）や推定分散に基づく3段階（高・中・低）評価です。"
                    />
                  </div>
                </th>
                <th className="px-4 py-3 font-bold">選定理由・根拠</th>
                <th className="px-3 py-3 font-bold text-center">検証判定</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={isSimpleMachineView ? 5 : showStoreColumn ? 10 : 9}
                  className="p-8 text-center text-slate-400 bg-slate-50/50"
                >
                  {emptyMessage || '該当するランキングデータがありません。条件を変更してください。'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedSet.has(row.id);
                const isReasonsExpanded = expandedReasonsIds.has(row.id);
                const isExpandable = Boolean(
                  (row.history && row.history.length > 0) ||
                  (row.sampleRecords && row.sampleRecords.length > 0) ||
                  (row.subMachines && row.subMachines.length > 0) ||
                  row.contributions
                );

                const lift = computeLift(row.expectedDiff, dayMean);
                const lower =
                  (row.interval80 ? row.interval80[0] : (row.uncertainty80 ? row.uncertainty80.min : row.expectedDiff - 300)) -
                  dayMean;
                const upper =
                  (row.interval80 ? row.interval80[1] : (row.uncertainty80 ? row.uncertainty80.max : row.expectedDiff + 300)) -
                  dayMean;
                const stars = getConfidenceStars(row.confidence);
                const tags = buildReasonTags(row.contributions, row.evidenceDays, false, false, row.reasons);

                return (
                  <React.Fragment key={row.id}>
                    {isSimpleMachineView ? (
                      /* 簡易モード (5列: 順位 / 店・機種・台番 / 平均との差 / 信頼度 / 理由タグ) */
                      <tr
                        className={`hover:bg-indigo-50/30 transition-colors ${
                          isExpanded ? 'bg-indigo-50/40' : ''
                        }`}
                        data-testid={`simple-row-${row.id}`}
                      >
                        {/* 1. 順位 (with expand chevron) */}
                        <td className="px-3 py-3 text-center font-black">
                          <div className="flex items-center justify-center gap-1">
                            {isExpandable ? (
                              <button
                                type="button"
                                onClick={() => handleToggleRow(row.id)}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  isExpanded
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                                }`}
                                title={isExpanded ? '詳細を閉じる' : '詳細を展開'}
                                data-testid={`toggle-expand-${row.id}`}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-3.5" />
                            )}
                            {getRankBadge(row.rank, row.rankGrade)}
                          </div>
                        </td>

                        {/* 2. 店・機種・台番 (店舗名は全店のときだけ) */}
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {showStoreColumn && row.storeName && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="text-xs font-bold text-indigo-700 flex items-center gap-1"
                                  data-testid="simple-store-name"
                                >
                                  <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span>{row.storeName}</span>
                                </span>
                                {row.isSpecialDay && (
                                  <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                                    特日
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{row.modelName}</span>
                              <span className="font-mono font-black text-slate-950 text-sm">
                                {row.machineNum}番台
                              </span>
                              {row.islandName && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({row.islandName})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 3. 平均との差（範囲の棒つき） */}
                        <td className="px-4 py-3 text-right">
                          <Diff80CellBar lift={lift} liftLower={lower} liftUpper={upper} />
                        </td>

                        {/* 4. 信頼度（★） */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className="text-amber-500 font-mono tracking-wider font-black text-xs"
                              data-testid="confidence-stars"
                            >
                              {stars}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              ({row.confidence || '中'})
                              {row.evidenceDays ? ` 根拠${row.evidenceDays}日` : ''}
                            </span>
                          </div>
                        </td>

                        {/* 5. 理由タグ (押すと元の理由文を展開) */}
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <div
                              className="flex flex-wrap gap-1 items-center cursor-pointer group"
                              onClick={() => toggleReasonsExpand(row.id)}
                              title="クリックで詳細理由を展開/折りたたみ"
                              data-testid={`reason-tags-group-${row.id}`}
                            >
                              {tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getTagBadgeClass(
                                    tag.color
                                  )} transition-transform group-hover:scale-105`}
                                  data-testid={`reason-tag-${tag.id}`}
                                >
                                  {tag.label}
                                </span>
                              ))}
                              <span
                                className="text-[10px] text-indigo-600 underline font-medium ml-1"
                                data-testid={`reasons-toggle-btn-${row.id}`}
                              >
                                {isReasonsExpanded ? '折りたたむ ▲' : '詳細 ▼'}
                              </span>
                            </div>
                            {isReasonsExpanded && (
                              <div
                                className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1 animate-in fade-in"
                                data-testid={`expanded-reasons-text-${row.id}`}
                              >
                                {row.reasons && row.reasons.length > 0 ? (
                                  row.reasons.map((r, rIdx) => (
                                    <div key={rIdx} className="flex items-start gap-1 leading-snug">
                                      <span className="text-amber-500 font-bold">•</span>
                                      <span>{r}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div>{row.tacticalReason || '過去実績に基づく推論'}</div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      /* 詳細モード（現在の全列） */
                      <tr
                        className={`hover:bg-indigo-50/30 transition-colors ${
                          isExpanded ? 'bg-indigo-50/40' : ''
                        }`}
                        data-testid={`detailed-row-${row.id}`}
                      >
                        {/* 1. 展開 Toggle Button */}
                        <td className="px-3 py-3 text-center">
                          {isExpandable ? (
                            <button
                              type="button"
                              onClick={() => handleToggleRow(row.id)}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                              }`}
                              title={isExpanded ? '詳細を閉じる' : '詳細を展開'}
                              data-testid={`toggle-expand-${row.id}`}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">-</span>
                          )}
                        </td>

                        {/* 2. 順位 */}
                        <td className="px-3 py-3 text-center font-black">
                          {getRankBadge(row.rank, row.rankGrade)}
                        </td>

                        {/* 3. 店名 (showStoreColumn 時) */}
                        {showStoreColumn && (
                          <td className="hidden sm:table-cell px-4 py-3 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{row.storeName || '店舗'}</span>
                              {row.isSpecialDay && (
                                <span
                                  className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-black"
                                  title={row.specialDayReason}
                                >
                                  特日
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 4. 機種 */}
                        <td className="px-4 py-3">
                          {showStoreColumn && row.storeName && (
                            <div className="sm:hidden mb-1">
                              <span
                                data-testid="mobile-store-badge"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{row.storeName}</span>
                                {row.isSpecialDay && (
                                  <span
                                    className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-black"
                                    title={row.specialDayReason}
                                  >
                                    特日
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                            <span>{row.modelName}</span>
                            {row.allHighDaysCount !== undefined && row.allHighDaysCount > 0 && (
                              <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                全台系実績{row.allHighDaysCount}回
                              </span>
                            )}
                            {rankingType === 'model' && onSelectModel && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedModelName === row.modelName) {
                                    onSelectModel('');
                                  } else {
                                    onSelectModel(row.modelName);
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ${
                                  selectedModelName === row.modelName
                                    ? 'bg-indigo-600 text-white border-indigo-600 font-black'
                                    : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}
                                data-testid={`select-model-table-${row.modelName}`}
                              >
                                {selectedModelName === row.modelName ? '✓ 選択中' : '選択 ›'}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {row.tags?.map((tag) => (
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
                            {row.islandName && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                {row.islandName}
                              </span>
                            )}
                            {row.originalRank && row.originalRank !== row.rank && (
                              <span className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1 rounded">
                                繰上 (元#{row.originalRank})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. 台番 / 台数 */}
                        <td className="px-3 py-3 font-mono font-black text-slate-900 text-sm">
                          {rankingType === 'machine' || row.machineNum !== undefined ? (
                            <span>{row.machineNum}番台</span>
                          ) : (
                            <span className="text-slate-600 font-sans font-medium text-xs">
                              {row.totalMachines !== undefined ? `${row.totalMachines}台` : '-'}
                            </span>
                          )}
                        </td>

                        {/* 6. 期待差枚 */}
                        <td className="px-3 py-3 text-right font-mono font-black text-sm whitespace-nowrap">
                          {toolbar?.metricMode === 'yen' && row.expectedYen !== undefined ? (
                            <div className={row.expectedYen >= 0 ? 'text-amber-700' : 'text-rose-600'}>
                              {row.expectedYen >= 0 ? `+${formatYen(row.expectedYen)}` : formatYen(row.expectedYen)}
                            </div>
                          ) : formatProfitValue ? (
                            <div className={row.expectedDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                              {formatProfitValue(row.expectedDiff)}
                            </div>
                          ) : (
                            <div className={row.expectedDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                              {row.expectedDiff >= 0 ? '+' : ''}
                              {formatNumber(row.expectedDiff)}枚
                            </div>
                          )}

                          <div className="text-[10px] text-slate-400 font-sans font-normal">
                            {rankingType === 'model' ? (
                              <span>
                                {row.winRate !== undefined ? `勝率: ${row.winRate}%` : ''}
                                {row.winRate !== undefined && row.payoutRate !== undefined ? ' / ' : ''}
                                {row.payoutRate !== undefined ? `機械割: ${row.payoutRate}%` : ''}
                                {row.score !== undefined ? ` (${row.score}pt)` : ''}
                              </span>
                            ) : (
                              <>
                                {toolbar?.diffMetric === 'std' ? '基準5,000G' : `実稼働${formatNumber(row.avgGames || 5000)}G`}換算
                                {row.shrunkPayoutRate !== undefined ? `, 出率${row.shrunkPayoutRate}%` : ''}
                              </>
                            )}
                          </div>
                        </td>

                        {/* 7. 80%範囲 */}
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                          {row.interval80 ? (
                            <div className="space-y-0.5">
                              <span className="font-bold text-slate-700">
                                {row.interval80[0] >= 0 ? `+${formatNumber(row.interval80[0])}` : formatNumber(row.interval80[0])}〜
                                {row.interval80[1] >= 0 ? `+${formatNumber(row.interval80[1])}` : formatNumber(row.interval80[1])}枚
                              </span>
                              {row.uncertainty80?.isWide && (
                                <span className="block text-[10px] text-rose-500 font-sans font-bold">
                                  ⚠️ ブレ注意
                                </span>
                              )}
                            </div>
                          ) : row.uncertainty80 ? (
                            <div className="space-y-0.5">
                              <span className="text-slate-600 font-medium">
                                ±{formatNumber(row.uncertainty80.margin)}枚
                              </span>
                              {row.uncertainty80.isWide && (
                                <span className="block text-[10px] text-rose-500 font-sans font-bold">
                                  ⚠️ ブレ注意
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* 8. 信頼度 */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {getConfidenceBadge(row.confidence, row.evidenceDays, row.reliabilityRate)}
                        </td>

                        {/* 9. 選定理由・根拠 */}
                        <td className="px-4 py-3 min-w-[200px] max-w-md">
                          {row.reasons && row.reasons.length > 0 ? (
                            <div className="space-y-1">
                              {row.reasons.map((r, rIdx) => (
                                <div
                                  key={rIdx}
                                  className="text-xs text-slate-600 flex items-start gap-1.5 leading-snug"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1" />
                                  <span>{r}</span>
                                </div>
                              ))}
                            </div>
                          ) : row.tacticalReason ? (
                            <p className="text-xs text-slate-600 leading-snug">
                              {row.tacticalReason}
                            </p>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>

                        {/* 10. 検証バッジ */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {getVerificationBadge(row.verification)}
                        </td>
                      </tr>
                    )}

                    {/* Expanded Row Content (Prompt 59 Requirement 3: 履歴の棒グラフ) */}
                    {isExpanded && (
                      <tr className="bg-indigo-50/30 border-y border-indigo-100">
                        <td
                          colSpan={isSimpleMachineView ? 5 : showStoreColumn ? 10 : 9}
                          className="p-4 sm:p-5"
                          data-testid={`expanded-content-${row.id}`}
                        >
                          <div className="space-y-4">
                            {/* Requirement 3: 直近14日の差枚を小さな棒グラフで表示 */}
                            {row.history && row.history.length > 0 && (
                              <History14DayBarChart history={row.history} />
                            )}

                            {/* Score contributions breakdown (if machine ranking) */}
                            {row.contributions && (
                              <div className="bg-white p-3.5 rounded-xl border border-indigo-200 space-y-2">
                                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-indigo-500" />
                                  <span>
                                    スコア寄与の内訳（合計: {row.score !== undefined ? `${row.score >= 0 ? '+' : ''}${row.score}pt` : '-'}）
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <span className="text-[10px] text-slate-500 block">同コホート差枚</span>
                                    <span className="font-bold text-slate-900">
                                      {row.contributions.cohortDiffScore >= 0 ? '+' : ''}
                                      {row.contributions.cohortDiffScore} pt
                                    </span>
                                  </div>
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <span className="text-[10px] text-slate-500 block">同コホート勝率</span>
                                    <span className="font-bold text-slate-900">
                                      {row.contributions.cohortWinRateScore >= 0 ? '+' : ''}
                                      {row.contributions.cohortWinRateScore} pt
                                    </span>
                                  </div>
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <span className="text-[10px] text-slate-500 block">高設定挙動率</span>
                                    <span className="font-bold text-slate-900">
                                      +{row.contributions.highSettingScore} pt
                                    </span>
                                  </div>
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <span className="text-[10px] text-slate-500 block">機種期待スコア</span>
                                    <span className="font-bold text-slate-900">
                                      +{row.contributions.modelScore} pt
                                    </span>
                                  </div>
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <span className="text-[10px] text-slate-500 block">末尾・ゾロ目</span>
                                    <span className="font-bold text-slate-900">
                                      +{row.contributions.tailBonusScore} pt
                                    </span>
                                  </div>
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <span className="text-[10px] text-slate-500 block">直近状態</span>
                                    <span className="font-bold text-slate-900">
                                      {row.contributions.recentStateScore >= 0 ? '+' : ''}
                                      {row.contributions.recentStateScore} pt
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Machine History Table (detailed view) */}
                            {row.history && row.history.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                  <span>過去の稼働実績履歴 一覧（全{row.history.length}日分）</span>
                                  <span className="text-[11px] text-slate-500">※ 未来データは除外済</span>
                                </div>
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
                                      {[...row.history].reverse().map((h, hIdx) => (
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
                              </div>
                            )}

                            {/* Sample Records (for Model Ranking) */}
                            {row.sampleRecords && row.sampleRecords.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-indigo-900">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                    【{row.modelName}】類似営業日での過去実績一覧 ({row.sampleRecords.length}日)
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-normal">
                                    ※ 過去の同種特日・同曜日における実績データ
                                  </span>
                                </div>
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
                                      {row.sampleRecords.map((rec, rIdx) => (
                                        <tr key={rIdx} className="hover:bg-slate-50">
                                          <td className="px-3 py-1 font-mono font-bold text-slate-800">
                                            {rec.date}
                                          </td>
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
                                          <td
                                            className={`px-3 py-1 text-right font-bold ${
                                              rec.avgDiffCoins > 0 ? 'text-blue-600' : 'text-rose-600'
                                            }`}
                                          >
                                            {rec.avgDiffCoins > 0 ? `+${rec.avgDiffCoins}` : rec.avgDiffCoins}枚
                                          </td>
                                          <td className="px-3 py-1 text-right text-slate-700">
                                            {rec.winRate !== null && rec.winRate !== undefined ? `${rec.winRate}%` : '-'}
                                          </td>
                                          <td className="px-3 py-1 text-right text-slate-600">
                                            {formatNumber(rec.avgGames)}G
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Sub Machines Table (for Model ranking in CrossStoreTarget) */}
                            {row.subMachines && row.subMachines.length > 0 && (
                              <div className="bg-white rounded-xl border border-indigo-200 p-3 sm:p-4 shadow-2xs space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-indigo-600" />
                                    <span className="font-bold text-indigo-950 text-xs sm:text-sm">
                                      {row.storeName ? `【${row.storeName}】` : ''}「{row.modelName}」の対象台番一覧 ({row.subMachines.length}台)
                                    </span>
                                  </div>
                                </div>
                                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-500 text-[10px] border-b border-slate-200 uppercase">
                                      <tr>
                                        <th className="px-3 py-2 font-bold">台番</th>
                                        <th className="px-3 py-2 text-center font-bold">信頼度</th>
                                        <th className="px-3 py-2 text-right font-bold">
                                          {toolbar?.metricMode === 'yen' ? '期待収支 (円)' : '期待差枚'}
                                        </th>
                                        <th className="px-3 py-2 text-right font-bold">80%範囲</th>
                                        <th className="px-3 py-2 text-right font-bold">スコア</th>
                                        <th className="px-4 py-2 font-bold">選定理由</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {row.subMachines.map((em) => (
                                        <tr key={em.id} className="hover:bg-slate-50/80">
                                          <td className="px-3 py-2 font-mono font-black text-slate-900">
                                            {em.machineNum}番台
                                            {em.islandName && (
                                              <span className="ml-1 text-[10px] text-slate-400 font-normal">
                                                ({em.islandName})
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            {getConfidenceBadge(em.confidence, em.evidenceDays, em.reliabilityRate)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono font-black text-xs">
                                            {toolbar?.metricMode === 'yen' && em.expectedYen !== undefined ? (
                                              <span className={em.expectedYen >= 0 ? 'text-amber-700' : 'text-rose-600'}>
                                                {em.expectedYen >= 0 ? `+${formatYen(em.expectedYen)}` : formatYen(em.expectedYen)}
                                              </span>
                                            ) : (
                                              <span className={em.expectedDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                                                {em.expectedDiff >= 0 ? `+${formatNumber(em.expectedDiff)}` : formatNumber(em.expectedDiff)}枚
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-500">
                                            {em.interval80
                                              ? `${em.interval80[0] >= 0 ? `+${em.interval80[0]}` : em.interval80[0]}〜${em.interval80[1] >= 0 ? `+${em.interval80[1]}` : em.interval80[1]}枚`
                                              : em.uncertainty80
                                              ? `±${em.uncertainty80.margin}枚`
                                              : '-'}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono text-slate-400 text-[10px]">
                                            {em.score !== undefined ? `${em.score >= 0 ? '+' : ''}${em.score}pt` : '-'}
                                          </td>
                                          <td className="px-4 py-2 text-2xs text-slate-600">
                                            <div className="space-y-0.5 max-w-md">
                                              {em.reasons.map((r, rIdx) => (
                                                <div key={rIdx} className="truncate" title={r}>
                                                  • {r}
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
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

      {/* 1行の色凡例 (Prompt 59 Requirement 5) */}
      <div
        className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-slate-500 px-3.5 py-1.5 bg-slate-50 border-t border-slate-200"
        data-testid="ranking-color-legend"
      >
        <span className="font-bold text-slate-700">凡例:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-blue-500 inline-block" />
          <span>同条件の実績 (青)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-purple-500 inline-block" />
          <span>末尾・ゾロ目 (紫)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-emerald-500 inline-block" />
          <span>直近 (緑)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-orange-500 inline-block" />
          <span>機種 (橙)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-emerald-600 inline-block" />
          <span>差枚プラス (緑棒)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-rose-600 inline-block" />
          <span>差枚マイナス (赤棒)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs border-2 border-amber-400 bg-amber-100 inline-block" />
          <span>同条件日 (枠線強調)</span>
        </span>
      </div>
    </>
  )}
</div>
  );
};
