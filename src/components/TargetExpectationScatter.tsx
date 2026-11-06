import React, { useState, useMemo } from 'react';
import { TargetRankingRow, History14DayBarChart } from './TargetRankingTable';
import { computeLift, roundForDisplay, buildReasonTags, TagColor } from '../utils/targetDisplay';
import { formatNumber } from '../utils/formatters';
import {
  Sparkles,
  Target,
  Trophy,
  X,
  Layers,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

export interface TargetZoneThresholds {
  /**
   * Minimum lift (expected diff vs mean) to qualify for target zone.
   * Default: 0 (must be higher than day's mean expected diff).
   */
  minDiff?: number;
  /**
   * Minimum reliability (0.0 ~ 1.0 or 0 ~ 100) to qualify for target zone.
   * Default: 0.50 (corresponds to high reliability threshold).
   */
  minReliability?: number;
}

export interface ScatterPointData {
  id: string;
  rank: number;
  machineNum: number;
  modelName: string;
  storeId?: string;
  storeName?: string;
  islandName?: string;

  // Coordinates
  expectedDiff: number;
  diffFromMean: number; // 横軸: 平均との差 (lift)
  reliability: number; // 縦軸: 信頼性 (0.0 ~ 1.0)
  reliabilityRate: number; // 0 ~ 100 (%)
  confidence?: string;

  // Bubble size
  avgGames: number; // 泡の大きさ: 稼働G数
  bubbleRadius: number;

  // Target sweet spot zone flag
  isTargetZone: boolean;

  // Original row reference
  row: TargetRankingRow;
}

/**
 * Determines whether a data point falls into the top-right "狙い目" zone.
 * Conditions:
 * 1. 横軸（平均との差）> minDiff (default: 0)
 * 2. 縦軸（信頼性）>= minReliability (default: 0.5)
 */
export function isTargetZone(
  diffFromMean: number,
  reliability: number,
  thresholds?: TargetZoneThresholds
): boolean {
  const minDiff = thresholds?.minDiff ?? 0;
  const minRel = thresholds?.minReliability ?? 0.5;
  // Normalize reliability if expressed on 0-100 scale
  const normRel = reliability > 1 ? reliability / 100 : reliability;
  const normMinRel = minRel > 1 ? minRel / 100 : minRel;

  return diffFromMean > minDiff && normRel >= normMinRel;
}

/**
 * Calculates bubble radius proportional to average games (稼働G数).
 * Clamped between 6px and 22px for balanced visual representation.
 */
export function calculateScatterRadius(avgGames?: number): number {
  const games = avgGames && !isNaN(avgGames) ? avgGames : 5000;
  // min 6px, max 22px, ~12px for standard 5,000G
  const clampedGames = Math.max(1000, Math.min(10000, games));
  return Math.round(6 + ((clampedGames - 1000) / 9000) * 16);
}

/**
 * Extracts and maps valid machine ranking rows into scatter plot points with coordinates.
 */
export function extractScatterPoints(
  rows: TargetRankingRow[],
  dayMean: number,
  thresholds?: TargetZoneThresholds
): ScatterPointData[] {
  if (!rows || rows.length === 0) return [];

  const points: ScatterPointData[] = [];

  rows.forEach((row) => {
    if (row.machineNum === undefined || row.expectedDiff === undefined || isNaN(row.expectedDiff)) {
      return;
    }

    const diffFromMean = computeLift(row.expectedDiff, dayMean);

    // Derive reliability (0.0 ~ 1.0)
    let rel = 0.5;
    if (row.reliability !== undefined && row.reliability !== null && !isNaN(row.reliability)) {
      rel = row.reliability > 1 ? row.reliability / 100 : row.reliability;
    } else if (row.reliabilityRate !== undefined && !isNaN(row.reliabilityRate)) {
      rel = row.reliabilityRate / 100;
    } else if (row.confidence === '高') {
      rel = 0.85;
    } else if (row.confidence === '中') {
      rel = 0.6;
    } else if (row.confidence === '低') {
      rel = 0.3;
    }

    const relRate = Math.round(rel * 100);
    const avgGames = row.avgGames && !isNaN(row.avgGames) ? row.avgGames : 5000;
    const bubbleRadius = calculateScatterRadius(avgGames);
    const inTarget = isTargetZone(diffFromMean, rel, thresholds);

    points.push({
      id: row.id,
      rank: row.rank,
      machineNum: row.machineNum,
      modelName: row.modelName,
      storeId: row.storeId,
      storeName: row.storeName,
      islandName: row.islandName,
      expectedDiff: row.expectedDiff,
      diffFromMean,
      reliability: Math.round(rel * 10000) / 10000,
      reliabilityRate: relRate,
      confidence: row.confidence,
      avgGames,
      bubbleRadius,
      isTargetZone: inTarget,
      row,
    });
  });

  return points;
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

export interface TargetExpectationScatterProps {
  rows: TargetRankingRow[];
  dayMean?: number;
  thresholds?: TargetZoneThresholds;
  defaultTopN?: number;
  onSelectMachine?: (row: TargetRankingRow) => void;
  title?: string;
  onClose?: () => void;
}

/**
 * 期待×信頼の散布図 (Target Expectation & Reliability Scatter Plot)
 * Prompt 62 (任意): 台番の詳細表示に、「平均との差 × 信頼性」の散布図を追加する。
 * - 横軸 = 平均との差 (lift)
 * - 縦軸 = 信頼性 (reliability)
 * - 泡の大きさ = 稼働 (平均G数)
 * - 右上を「狙い目」として、背景色で示す。
 * - 上位N台に、台番を表示する。
 * - 泡を押すと、その台の詳細を表示する。
 */
export const TargetExpectationScatter: React.FC<TargetExpectationScatterProps> = ({
  rows,
  dayMean: propDayMean,
  thresholds,
  defaultTopN = 5,
  onSelectMachine,
  title,
  onClose,
}) => {
  // Top N machine number labels toggle (default: 5)
  const [topN, setTopN] = useState<number>(defaultTopN);
  // Selected machine for modal/drawer details display
  const [selectedMachine, setSelectedMachine] = useState<TargetRankingRow | null>(null);
  // Hovered point for interactive tooltip
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPointData | null>(null);

  // Compute effective day mean if not provided
  const dayMean = useMemo(() => {
    if (propDayMean !== undefined) return propDayMean;
    if (!rows || rows.length === 0) return 0;
    const sum = rows.reduce((acc, r) => acc + (r.expectedDiff || 0), 0);
    return sum / rows.length;
  }, [rows, propDayMean]);

  // Extract all valid scatter points
  const points = useMemo(() => {
    return extractScatterPoints(rows, dayMean, thresholds);
  }, [rows, dayMean, thresholds]);

  // Target zone thresholds
  const minDiff = thresholds?.minDiff ?? 0;
  const minRel = thresholds?.minReliability ?? 0.5;

  // Counts
  const targetZoneCount = useMemo(() => {
    return points.filter((p) => p.isTargetZone).length;
  }, [points]);

  // SVG Chart Layout dimensions
  const svgWidth = 760;
  const svgHeight = 420;
  const margin = { top: 35, right: 35, bottom: 55, left: 65 };
  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  // Domain computation
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (points.length === 0) {
      return { xMin: -500, xMax: 1000, yMin: 0, yMax: 1.0 };
    }

    const diffs = points.map((p) => p.diffFromMean);
    const rawMin = Math.min(0, ...diffs);
    const rawMax = Math.max(200, ...diffs);

    const span = Math.max(400, rawMax - rawMin);
    const pad = span * 0.12;

    const roundTo100 = (val: number, dir: 'floor' | 'ceil') =>
      dir === 'floor' ? Math.floor(val / 100) * 100 : Math.ceil(val / 100) * 100;

    return {
      xMin: roundTo100(rawMin - pad, 'floor'),
      xMax: roundTo100(rawMax + pad, 'ceil'),
      yMin: 0.0,
      yMax: 1.0,
    };
  }, [points]);

  // Coordinate scales
  const scaleX = (val: number): number => {
    if (xMax === xMin) return margin.left + innerWidth / 2;
    return margin.left + ((val - xMin) / (xMax - xMin)) * innerWidth;
  };

  const scaleY = (val: number): number => {
    if (yMax === yMin) return margin.top + innerHeight / 2;
    return margin.top + (1 - (val - yMin) / (yMax - yMin)) * innerHeight;
  };

  // Target zone SVG rectangle coordinates
  const targetRect = useMemo(() => {
    const rx = scaleX(Math.max(xMin, minDiff));
    const rw = Math.max(0, scaleX(xMax) - rx);
    const ry = scaleY(1.0);
    const rh = Math.max(0, scaleY(minRel) - ry);

    return { x: rx, y: ry, width: rw, height: rh };
  }, [xMin, xMax, minDiff, minRel, innerWidth, innerHeight]);

  // Zero-line (mean reference)
  const zeroX = scaleX(0);
  // Reliability 50% line
  const rel50Y = scaleY(minRel);

  // X ticks
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = (xMax - xMin) > 2000 ? 500 : (xMax - xMin) > 1000 ? 250 : 200;
    const start = Math.ceil(xMin / step) * step;
    for (let v = start; v <= xMax; v += step) {
      ticks.push(v);
    }
    if (!ticks.includes(0) && xMin <= 0 && xMax >= 0) {
      ticks.push(0);
      ticks.sort((a, b) => a - b);
    }
    return ticks;
  }, [xMin, xMax]);

  // Y ticks (0%, 25%, 50%, 75%, 100%)
  const yTicks = [0.0, 0.25, 0.5, 0.75, 1.0];

  const handleBubbleClick = (pt: ScatterPointData) => {
    setSelectedMachine(pt.row);
    onSelectMachine?.(pt.row);
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
      data-testid="target-expectation-scatter-card"
    >
      {/* Header Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
              <Target className="w-4 h-4" />
            </span>
            <h4 className="text-base sm:text-lg font-black tracking-tight" data-testid="scatter-title">
              {title || '期待×信頼の散布図 (平均との差 × 信頼性)'}
            </h4>
            <span
              className="px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
              data-testid="target-zone-badge"
            >
              🎯 狙い目: {targetZoneCount}台
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            横軸: 全台平均との差 (枚) ｜ 縦軸: 信頼性 (reliability) ｜ 泡の大きさ: 稼働 (平均G数)。
            <span className="text-emerald-300 font-bold ml-1">右上エリアが「狙い目」ゾーンです。</span>
          </p>
        </div>

        {/* Controls Toolbar: Top N selection & Close button */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="inline-flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-xl px-2.5 py-1 text-xs">
            <span className="text-slate-300 font-medium">台番ラベル:</span>
            <div className="inline-flex items-center gap-1" data-testid="scatter-topn-selector">
              {[3, 5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTopN(n)}
                  className={`px-2 py-0.5 rounded-md text-2xs font-bold transition-all cursor-pointer ${
                    topN === n
                      ? 'bg-indigo-600 text-white shadow-2xs font-black'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                  data-testid={`scatter-topn-${n}-btn`}
                >
                  上位{n}台
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTopN(9999)}
                className={`px-2 py-0.5 rounded-md text-2xs font-bold transition-all cursor-pointer ${
                  topN > 50
                    ? 'bg-indigo-600 text-white shadow-2xs font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
                data-testid="scatter-topn-all-btn"
              >
                全台
              </button>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-slate-600 font-mono">
          <span>
            全評価候補: <strong className="text-slate-900 font-black">{points.length}</strong>台
          </span>
          <span className="text-slate-300">|</span>
          <span>
            平均期待差枚基準: <strong className="text-indigo-700 font-black">{Math.round(dayMean)}</strong>枚
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-700 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>
              狙い目ゾーン: <strong>{targetZoneCount}</strong>台 ({points.length > 0 ? Math.round((targetZoneCount / points.length) * 100) : 0}%)
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-2xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600 inline-block" />
            <span>狙い目 (期待+ & 高信頼)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-indigo-500/80 border border-indigo-600 inline-block" />
            <span>期待+ (中低信頼)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-slate-400/80 border border-slate-500 inline-block" />
            <span>平均以下</span>
          </span>
        </div>
      </div>

      {/* SVG Scatter Chart Area */}
      <div className="p-3 sm:p-5 relative overflow-x-auto" data-testid="scatter-plot-container">
        {points.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            散布図を表示するための台番号データがありません。
          </div>
        ) : (
          <div className="min-w-[640px] max-w-full">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto select-none font-sans"
              data-testid="scatter-svg"
            >
              {/* Defs for gradients & patterns */}
              <defs>
                <linearGradient id="targetZoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.08" />
                </linearGradient>
                <filter id="bubbleShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.18" />
                </filter>
                <filter id="targetGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.45" />
                </filter>
              </defs>

              {/* Chart Background */}
              <rect
                x={margin.left}
                y={margin.top}
                width={innerWidth}
                height={innerHeight}
                fill="#f8fafc"
                stroke="#e2e8f0"
                strokeWidth="1"
              />

              {/* Requirement 1: 右上を「狙い目」として、背景色で示す (Target Zone Highlight Rect) */}
              <rect
                x={targetRect.x}
                y={targetRect.y}
                width={targetRect.width}
                height={targetRect.height}
                fill="url(#targetZoneGrad)"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                data-testid="target-zone-rect"
              />

              {/* Target Zone Watermark / Label */}
              <g transform={`translate(${margin.left + innerWidth - 12}, ${margin.top + 16})`}>
                <text
                  x="0"
                  y="0"
                  textAnchor="end"
                  fill="#047857"
                  fontSize="12"
                  fontWeight="900"
                  data-testid="target-zone-label"
                >
                  🎯 狙い目ゾーン (期待差枚+ × 高信頼性)
                </text>
                <text
                  x="0"
                  y="14"
                  textAnchor="end"
                  fill="#059669"
                  fontSize="9.5"
                  fontWeight="bold"
                >
                  平均との差 &gt; 0枚 ＆ 信頼性 ≥ 50%
                </text>
              </g>

              {/* Grid Lines - Horizontal */}
              {yTicks.map((tick) => {
                const y = scaleY(tick);
                return (
                  <g key={`y-grid-${tick}`}>
                    <line
                      x1={margin.left}
                      y1={y}
                      x2={margin.left + innerWidth}
                      y2={y}
                      stroke={tick === minRel ? '#10b981' : '#e2e8f0'}
                      strokeWidth={tick === minRel ? 1.5 : 1}
                      strokeDasharray={tick === minRel ? '5 3' : '3 3'}
                    />
                    <text
                      x={margin.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill={tick === minRel ? '#047857' : '#64748b'}
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight={tick === minRel ? 'bold' : 'normal'}
                    >
                      {Math.round(tick * 100)}%
                    </text>
                  </g>
                );
              })}

              {/* Grid Lines - Vertical */}
              {xTicks.map((tick) => {
                const x = scaleX(tick);
                if (x < margin.left || x > margin.left + innerWidth) return null;
                const isZero = tick === 0;
                return (
                  <g key={`x-grid-${tick}`}>
                    <line
                      x1={x}
                      y1={margin.top}
                      x2={x}
                      y2={margin.top + innerHeight}
                      stroke={isZero ? '#0f172a' : '#e2e8f0'}
                      strokeWidth={isZero ? 1.5 : 1}
                      strokeDasharray={isZero ? '0' : '3 3'}
                    />
                    <text
                      x={x}
                      y={margin.top + innerHeight + 16}
                      textAnchor="middle"
                      fill={isZero ? '#0f172a' : '#64748b'}
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight={isZero ? '900' : 'normal'}
                    >
                      {tick >= 0 ? `+${tick}` : tick}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Label */}
              <text
                x={margin.left + innerWidth / 2}
                y={svgHeight - 12}
                textAnchor="middle"
                fill="#334155"
                fontSize="11"
                fontWeight="bold"
                data-testid="scatter-xaxis-label"
              >
                ← 平均劣後 ｜ 横軸: 全台平均との差 (枚) ｜ 平均優位 →
              </text>

              {/* Y Axis Label */}
              <text
                x={-scaleY(0.5)}
                y={18}
                transform="rotate(-90)"
                textAnchor="middle"
                fill="#334155"
                fontSize="11"
                fontWeight="bold"
                data-testid="scatter-yaxis-label"
              >
                縦軸: 信頼性 (Empirical Bayes Reliability)
              </text>

              {/* Bubbles (Scatter Points) */}
              {points.map((pt) => {
                const cx = scaleX(pt.diffFromMean);
                const cy = scaleY(pt.reliability);
                const r = pt.bubbleRadius;
                const isTopN = pt.rank <= topN;
                const isHovered = hoveredPoint?.id === pt.id;
                const isSelected = selectedMachine?.id === pt.id;

                // Color mapping:
                // Target zone: Emerald (#10b981)
                // Positive diff, lower reliability: Indigo (#6366f1)
                // Negative diff: Slate/Rose (#f43f5e or #94a3b8)
                let fillColor = '#6366f1';
                let strokeColor = '#4f46e5';

                if (pt.isTargetZone) {
                  fillColor = '#10b981';
                  strokeColor = '#047857';
                } else if (pt.diffFromMean < 0) {
                  fillColor = '#f43f5e';
                  strokeColor = '#be123c';
                }

                return (
                  <g
                    key={pt.id}
                    onClick={() => handleBubbleClick(pt)}
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    className="cursor-pointer transition-transform duration-150"
                    data-testid={`scatter-bubble-${pt.machineNum}`}
                    data-machine-num={pt.machineNum}
                    data-is-target-zone={pt.isTargetZone ? 'true' : 'false'}
                    data-rank={pt.rank}
                    data-diff={pt.diffFromMean}
                    data-reliability={pt.reliability}
                    data-games={pt.avgGames}
                  >
                    {/* Glow ring for Target Zone machines or selected machine */}
                    {(pt.isTargetZone || isSelected) && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + (isSelected ? 5 : 3)}
                        fill="none"
                        stroke={pt.isTargetZone ? '#10b981' : '#6366f1'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeOpacity={isSelected ? 0.9 : 0.55}
                      />
                    )}

                    {/* Main Bubble */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={fillColor}
                      fillOpacity={isHovered ? 0.95 : 0.82}
                      stroke={strokeColor}
                      strokeWidth={isHovered || isSelected ? 2.5 : 1.5}
                      filter={pt.isTargetZone ? 'url(#targetGlow)' : 'url(#bubbleShadow)'}
                    />

                    {/* Inner rank text for larger bubbles */}
                    {r >= 13 && (
                      <text
                        x={cx}
                        y={cy + 3.5}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={r >= 16 ? 10 : 8.5}
                        fontFamily="monospace"
                        fontWeight="900"
                        pointerEvents="none"
                      >
                        #{pt.rank}
                      </text>
                    )}

                    {/* Requirement 1: 上位N台に、台番を表示する (Top N Machine Number Labels) */}
                    {isTopN && (
                      <g pointerEvents="none" data-testid={`scatter-label-${pt.machineNum}`}>
                        <text
                          x={cx}
                          y={cy - r - 5}
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize="11"
                          fontFamily="monospace"
                          fontWeight="900"
                          stroke="#ffffff"
                          strokeWidth="3.5"
                          paintOrder="stroke"
                        >
                          {pt.machineNum}
                          <tspan fontSize="8.5" fontWeight="bold">
                            (#{pt.rank})
                          </tspan>
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Interactive Hover Tooltip */}
              {hoveredPoint && (
                <g
                  transform={`translate(${Math.min(
                    svgWidth - 180,
                    Math.max(margin.left + 10, scaleX(hoveredPoint.diffFromMean) - 80)
                  )}, ${Math.max(margin.top + 10, scaleY(hoveredPoint.reliability) - 75)})`}
                  pointerEvents="none"
                  data-testid="scatter-hover-tooltip"
                >
                  <rect
                    x="0"
                    y="0"
                    width="170"
                    height="68"
                    rx="8"
                    fill="#0f172a"
                    fillOpacity="0.95"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text x="10" y="16" fill="#f8fafc" fontSize="11" fontWeight="bold">
                    #{hoveredPoint.rank} {hoveredPoint.modelName}
                  </text>
                  <text x="10" y="32" fill="#38bdf8" fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {hoveredPoint.machineNum}番台 ｜ 稼働: {formatNumber(hoveredPoint.avgGames)}G
                  </text>
                  <text x="10" y="48" fill="#e2e8f0" fontSize="10" fontFamily="monospace">
                    平均差: {hoveredPoint.diffFromMean >= 0 ? '+' : ''}{hoveredPoint.diffFromMean}枚 ｜ 信頼度: {hoveredPoint.reliabilityRate}%
                  </text>
                  {hoveredPoint.isTargetZone && (
                    <text x="10" y="62" fill="#34d399" fontSize="9" fontWeight="bold">
                      🎯 狙い目ゾーン選定台
                    </text>
                  )}
                </g>
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Requirement 2: 泡を押すと、その台の詳細を表示する (Selected Machine Detail Drawer/Modal) */}
      {selectedMachine && (
        <div
          className="p-4 sm:p-5 bg-indigo-50/60 border-t-2 border-indigo-500 animate-in fade-in"
          data-testid="scatter-machine-detail"
        >
          <div className="space-y-4 max-w-4xl mx-auto">
            {/* Header: Rank, Machine number, Model name & close */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-black text-xs">
                    #{selectedMachine.rank}
                  </span>
                  <span className="font-mono text-xl font-black text-slate-950">
                    {selectedMachine.machineNum}番台
                  </span>
                  {selectedMachine.islandName && (
                    <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                      {selectedMachine.islandName}
                    </span>
                  )}
                  {selectedMachine.storeName && (
                    <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                      {selectedMachine.storeName}
                    </span>
                  )}
                </div>
                <h5 className="text-base font-black text-slate-900">
                  {selectedMachine.modelName}
                </h5>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMachine(null)}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 transition-colors cursor-pointer"
                data-testid="close-scatter-detail-btn"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Grid: Lift vs Mean, Expected Diff, Reliability, Games */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
              <div className="bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-sans block mb-0.5">全台平均との差 (横軸)</span>
                <span
                  className={`text-base sm:text-lg font-black ${
                    computeLift(selectedMachine.expectedDiff, dayMean) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                  data-testid="detail-diff-from-mean"
                >
                  {computeLift(selectedMachine.expectedDiff, dayMean) >= 0 ? '+' : ''}
                  {formatNumber(roundForDisplay(computeLift(selectedMachine.expectedDiff, dayMean)))}枚
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-sans block mb-0.5">信頼性 (縦軸)</span>
                <span className="text-base sm:text-lg font-black text-indigo-600" data-testid="detail-reliability">
                  {selectedMachine.reliabilityRate !== undefined
                    ? `${selectedMachine.reliabilityRate}%`
                    : selectedMachine.reliability !== undefined && selectedMachine.reliability !== null
                    ? `${Math.round(selectedMachine.reliability * 100)}%`
                    : '-'}
                  <span className="text-xs text-slate-500 font-normal ml-1">
                    ({selectedMachine.confidence || '中'})
                  </span>
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-sans block mb-0.5">稼働 (泡の大きさ)</span>
                <span className="text-base sm:text-lg font-black text-slate-900" data-testid="detail-avg-games">
                  {formatNumber(selectedMachine.avgGames || 5000)}G
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-sans block mb-0.5">期待差枚 / 80%範囲</span>
                <span className="text-base sm:text-lg font-black text-blue-600 block">
                  {selectedMachine.expectedDiff >= 0 ? '+' : ''}
                  {formatNumber(Math.round(selectedMachine.expectedDiff))}枚
                </span>
                {selectedMachine.interval80 && (
                  <span className="text-[10px] text-slate-400 font-normal block">
                    [{selectedMachine.interval80[0]}〜{selectedMachine.interval80[1]}]
                  </span>
                )}
              </div>
            </div>

            {/* Reason Tags and Bullet points */}
            {selectedMachine.reasons && selectedMachine.reasons.length > 0 && (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>選定理由・実績根拠</span>
                </span>
                <div className="space-y-1 text-xs text-slate-700">
                  {selectedMachine.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-amber-500 font-bold">•</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 14-day history chart */}
            {selectedMachine.history && selectedMachine.history.length > 0 && (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">
                  直近稼働実績履歴 (過去{selectedMachine.history.length}日)
                </span>
                <History14DayBarChart history={selectedMachine.history} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
