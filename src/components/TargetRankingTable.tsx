import React, { useState, useMemo } from 'react';
import { formatNumber, formatYen } from '../utils/formatters';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  RotateCw,
  Copy,
  Download,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';

export type TargetRankingType = 'machine' | 'model';

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
      {/* Top row: Filter selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
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
  showStoreColumn?: boolean; // 店舗名の列は、全店のときだけ表示する

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
}

export const TargetRankingTable: React.FC<TargetRankingTableProps> = ({
  title,
  rankingType = 'machine',
  rows,
  showStoreColumn = false,
  toolbar,
  emptyMessage,
  expandedIds: controlledExpandedIds,
  onToggleExpand: controlledOnToggleExpand,
  formatProfitValue,
}) => {
  // Local state for expanded rows if uncontrolled
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(new Set());
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Optional Title Header */}
      {title && (
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-sm font-black text-slate-900">{title}</h4>
        </div>
      )}

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
        />
      )}

      {/* Main Ranking Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left text-slate-700">
          <thead className="text-[11px] text-slate-500 bg-slate-100/80 uppercase border-b border-slate-200">
            <tr>
              <th className="px-3 py-3 font-bold text-center w-12">展開</th>
              <th className="px-3 py-3 font-bold text-center w-16">順位</th>
              {showStoreColumn && <th className="px-4 py-3 font-bold">店舗名</th>}
              <th className="px-4 py-3 font-bold">機種名</th>
              <th className="px-3 py-3 font-bold">
                {rankingType === 'machine' ? '台番' : '台数'}
              </th>
              <th className="px-3 py-3 font-bold text-right">
                {toolbar?.metricMode === 'yen' ? '期待収支 (円)' : '期待差枚'}
              </th>
              <th className="px-3 py-3 font-bold text-right">80%範囲</th>
              <th className="px-3 py-3 font-bold text-center">信頼度</th>
              <th className="px-4 py-3 font-bold">選定理由・根拠</th>
              <th className="px-3 py-3 font-bold text-center">検証判定</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showStoreColumn ? 10 : 9}
                  className="p-8 text-center text-slate-400 bg-slate-50/50"
                >
                  {emptyMessage || '該当するランキングデータがありません。条件を変更してください。'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedSet.has(row.id);
                const isExpandable = Boolean(
                  (row.history && row.history.length > 0) ||
                  (row.sampleRecords && row.sampleRecords.length > 0) ||
                  (row.subMachines && row.subMachines.length > 0) ||
                  row.contributions
                );

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`hover:bg-indigo-50/30 transition-colors ${
                        isExpanded ? 'bg-indigo-50/40' : ''
                      }`}
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

                      {/* 3. 店名 (店舗名の列は、全店のときだけ表示する) */}
                      {showStoreColumn && (
                        <td className="px-4 py-3 font-bold text-slate-900">
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
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                          <span>{row.modelName}</span>
                          {row.allHighDaysCount !== undefined && row.allHighDaysCount > 0 && (
                            <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold px-1.5 py-0.2 rounded">
                              全台系実績{row.allHighDaysCount}回
                            </span>
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

                      {/* 5. 台番 (machine ranking) or 台数 (model ranking) */}
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

                    {/* Expanded Row Content */}
                    {isExpanded && (
                      <tr className="bg-indigo-50/30 border-y border-indigo-100">
                        <td colSpan={showStoreColumn ? 10 : 9} className="p-4 sm:p-5">
                          <div className="space-y-4">
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

                            {/* Machine History Table */}
                            {row.history && row.history.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                  <span>過去の稼働実績履歴（全{row.history.length}日分）</span>
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

                            {/* Sample Records (for Model Ranking in TargetDateRanking) */}
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
    </div>
  );
};
