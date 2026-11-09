import React, { useState, useMemo } from 'react';
import { IslandDefinition } from '../data/types';
import { parseIslandConfig, getMachineIsland } from '../utils/islandUtils';
import { TargetRankingRow, History14DayBarChart } from './TargetRankingTable';
import {
  computeLift,
  roundForDisplay,
  buildReasonTags,
  TagColor,
} from '../utils/targetDisplay';
import {
  loadTargetCheckStatus,
  saveTargetCheckStatus,
  MachineCheckStatus,
} from '../utils/crossStoreRanking';
import { formatNumber } from '../utils/formatters';
import {
  Building2,
  X,
  Layers,
  Sparkles,
  Trophy,
  Filter,
  CheckCircle2,
  Slash,
} from 'lucide-react';

export interface TargetFloorMapProps {
  rows: TargetRankingRow[];
  dayMeanExpectedDiff?: number;
  islandConfig?: string;
  islandDefinitions?: IslandDefinition[];
  storeIslandConfigMap?: Record<string, string>;

  // Model filter
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
  availableModels?: string[];
  isModelFilterActive?: boolean;
  activeFilterLabel?: string;
  selectedModelNames?: string[];

  // Checked state for "空いていない"
  checkedState?: Record<number, MachineCheckStatus>;
  onToggleCheck?: (machineNum: number, status: MachineCheckStatus) => void;

  // Cross-store support (Prompt 60 Requirement 5)
  isCrossStore?: boolean;
  stores?: Array<{ id: string; name: string; islandConfig?: string }>;
  activeStoreId?: string;
  onSelectStoreId?: (storeId: string) => void;

  // Top N rank badge
  topN?: number;
  onTopNChange?: (n: number) => void;

  targetDate?: string;
  storeId?: string;
  storeName?: string;
  onClose?: () => void;
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

/**
 * Floor Map display component for Target Machines (Prompt 60)
 */
export const TargetFloorMap: React.FC<TargetFloorMapProps> = ({
  rows,
  dayMeanExpectedDiff,
  islandConfig,
  islandDefinitions: propIslandDefinitions,
  storeIslandConfigMap,
  selectedModel: controlledSelectedModel,
  onSelectModel,
  availableModels: propAvailableModels,
  isModelFilterActive,
  activeFilterLabel,
  selectedModelNames,
  checkedState: controlledCheckedState,
  onToggleCheck: controlledOnToggleCheck,
  isCrossStore,
  stores,
  activeStoreId: controlledActiveStoreId,
  onSelectStoreId,
  topN: controlledTopN,
  onTopNChange,
  targetDate,
  storeId: propStoreId,
  storeName: propStoreName,
}) => {
  // Top N badge state (default: 10)
  const [internalTopN, setInternalTopN] = useState<number>(10);
  const currentTopN = controlledTopN !== undefined ? controlledTopN : internalTopN;

  const handleTopNChange = (n: number) => {
    setInternalTopN(n);
    onTopNChange?.(n);
  };

  // Distinct stores for cross-store mode (Prompt 60 Requirement 5)
  const distinctStores = useMemo(() => {
    if (stores && stores.length > 0) {
      return stores;
    }
    const storeMap = new Map<string, { id: string; name: string }>();
    rows.forEach((r) => {
      if (r.storeId) {
        if (!storeMap.has(r.storeId)) {
          storeMap.set(r.storeId, {
            id: r.storeId,
            name: r.storeName || r.storeId,
          });
        }
      }
    });
    return Array.from(storeMap.values());
  }, [stores, rows]);

  const hasMultipleStores = isCrossStore || distinctStores.length > 1;

  // Active store in cross-store view
  const [internalActiveStoreId, setInternalActiveStoreId] = useState<string>(() => {
    if (controlledActiveStoreId) return controlledActiveStoreId;
    if (propStoreId) return propStoreId;
    return distinctStores[0]?.id || '';
  });

  const currentStoreId = controlledActiveStoreId || internalActiveStoreId || distinctStores[0]?.id || '';

  const handleSelectStore = (sId: string) => {
    setInternalActiveStoreId(sId);
    onSelectStoreId?.(sId);
  };

  // Filter rows for current active store (if multi-store)
  const storeRows = useMemo(() => {
    if (!hasMultipleStores || !currentStoreId) return rows;
    return rows.filter((r) => !r.storeId || r.storeId === currentStoreId);
  }, [rows, hasMultipleStores, currentStoreId]);

  // Current store name
  const currentStoreName = useMemo(() => {
    if (hasMultipleStores) {
      const match = distinctStores.find((s) => s.id === currentStoreId);
      if (match) return match.name;
    }
    return propStoreName || storeRows[0]?.storeName || '';
  }, [hasMultipleStores, distinctStores, currentStoreId, propStoreName, storeRows]);

  // Model filter state
  const [internalSelectedModel, setInternalSelectedModel] = useState<string>('all');
  const currentSelectedModel =
    controlledSelectedModel !== undefined ? controlledSelectedModel : internalSelectedModel;

  const handleModelChange = (model: string) => {
    setInternalSelectedModel(model);
    onSelectModel?.(model);
  };

  // Available models list
  const availableModels = useMemo(() => {
    if (propAvailableModels && propAvailableModels.length > 0) {
      return propAvailableModels;
    }
    const set = new Set<string>();
    storeRows.forEach((r) => {
      if (r.modelName) set.add(r.modelName);
    });
    return Array.from(set).sort();
  }, [propAvailableModels, storeRows]);

  // Local checked state for "空いていない"
  const [internalCheckedState, setInternalCheckedState] = useState<Record<number, MachineCheckStatus>>(() => {
    if (controlledCheckedState) return controlledCheckedState;
    if (typeof localStorage !== 'undefined' && targetDate && currentStoreId) {
      return loadTargetCheckStatus(targetDate, currentStoreId);
    }
    return {};
  });

  const currentCheckedMap = controlledCheckedState || internalCheckedState;

  const handleToggleUnavailable = (machineNum: number) => {
    const currentStatus = currentCheckedMap[machineNum];
    const newStatus: MachineCheckStatus | undefined =
      currentStatus === 'unavailable' ? undefined : 'unavailable';

    if (controlledOnToggleCheck && newStatus) {
      controlledOnToggleCheck(machineNum, newStatus);
    }

    setInternalCheckedState((prev) => {
      const next = { ...prev };
      if (currentStatus === 'unavailable') {
        delete next[machineNum];
      } else {
        next[machineNum] = 'unavailable';
      }
      if (typeof localStorage !== 'undefined' && targetDate && currentStoreId) {
        saveTargetCheckStatus(targetDate, currentStoreId, next);
      }
      return next;
    });
  };

  // Selected machine for detail modal / panel
  const [selectedMachine, setSelectedMachine] = useState<TargetRankingRow | null>(null);

  // Mean expected diff of the current store's evaluated machines
  const dayMean = useMemo(() => {
    if (dayMeanExpectedDiff !== undefined) return dayMeanExpectedDiff;
    const evaluated = storeRows.filter((r) => r.expectedDiff !== undefined && !isNaN(r.expectedDiff));
    if (evaluated.length === 0) return 0;
    const sum = evaluated.reduce((acc, r) => acc + r.expectedDiff, 0);
    return sum / evaluated.length;
  }, [storeRows, dayMeanExpectedDiff]);

  // Active island configuration
  const activeIslandConfigText = useMemo(() => {
    if (hasMultipleStores && currentStoreId) {
      if (storeIslandConfigMap && storeIslandConfigMap[currentStoreId]) {
        return storeIslandConfigMap[currentStoreId];
      }
      const s = stores?.find((st) => st.id === currentStoreId);
      if (s?.islandConfig) return s.islandConfig;
    }
    return islandConfig;
  }, [hasMultipleStores, currentStoreId, storeIslandConfigMap, stores, islandConfig]);

  // Parse island definitions
  const activeIslandDefinitions: IslandDefinition[] = useMemo(() => {
    if (propIslandDefinitions && propIslandDefinitions.length > 0) {
      return propIslandDefinitions;
    }
    if (activeIslandConfigText && activeIslandConfigText.trim()) {
      return parseIslandConfig(activeIslandConfigText);
    }
    // Fallback: Check if storeRows have islandName assigned
    const islandNames = Array.from(
      new Set(storeRows.map((r) => r.islandName).filter((name): name is string => Boolean(name)))
    );
    if (islandNames.length > 0) {
      return islandNames.map((name) => ({
        name,
        startNum: 0,
        endNum: 0,
      }));
    }
    return [];
  }, [propIslandDefinitions, activeIslandConfigText, storeRows]);

  const hasIslandConfig = activeIslandDefinitions.length > 0;

  // Group machines by island (if island config present)
  const islandGroups = useMemo(() => {
    if (!hasIslandConfig) return [];

    const rowMap = new Map<number, TargetRankingRow>();
    storeRows.forEach((r) => {
      if (r.machineNum !== undefined) {
        rowMap.set(r.machineNum, r);
      }
    });

    return activeIslandDefinitions.map((def) => {
      const machines: TargetRankingRow[] = [];
      const seenNums = new Set<number>();

      // If definition has a bounded numeric range (e.g. 101-120), generate slots in sequence
      if (def.startNum > 0 && def.endNum >= def.startNum && def.endNum - def.startNum < 150) {
        for (let num = def.startNum; num <= def.endNum; num++) {
          seenNums.add(num);
          const found = rowMap.get(num);
          if (found) {
            machines.push(found);
          } else {
            // Un-evaluated slot in island
            machines.push({
              id: `unevaluated-${num}`,
              rank: 9999,
              modelName: '-',
              machineNum: num,
              islandName: def.name,
              expectedDiff: NaN,
              reasons: [],
            });
          }
        }
      }

      // Also include any rows explicitly matching this island that might not be in the startNum..endNum span
      storeRows.forEach((r) => {
        if (r.machineNum !== undefined && !seenNums.has(r.machineNum)) {
          const matchedIsland = getMachineIsland(r.machineNum, activeIslandDefinitions);
          if (matchedIsland === def.name || r.islandName === def.name) {
            seenNums.add(r.machineNum);
            machines.push(r);
          }
        }
      });

      // Sort machines by machineNum ascending
      machines.sort((a, b) => (a.machineNum || 0) - (b.machineNum || 0));

      return {
        definition: def,
        machines,
      };
    });
  }, [hasIslandConfig, activeIslandDefinitions, storeRows]);

  // Flat sorted machines for grid mode (10 machines per row)
  const gridMachines = useMemo(() => {
    if (hasIslandConfig) return [];
    return [...storeRows]
      .filter((r) => r.machineNum !== undefined)
      .sort((a, b) => (a.machineNum || 0) - (b.machineNum || 0));
  }, [hasIslandConfig, storeRows]);

  // Color helper for machine cell: Green (lift > 0), Red (lift < 0), Gray (no eval)
  const getMachineColor = (mach: TargetRankingRow): 'green' | 'red' | 'gray' => {
    if (mach.expectedDiff === undefined || isNaN(mach.expectedDiff)) {
      return 'gray';
    }
    const lift = computeLift(mach.expectedDiff, dayMean);
    return lift >= 0 ? 'green' : 'red';
  };

  // Helper to render individual machine block
  const renderMachineCell = (mach: TargetRankingRow) => {
    const isUnavailable = mach.machineNum !== undefined && currentCheckedMap[mach.machineNum] === 'unavailable';
    const isEvaluated = mach.expectedDiff !== undefined && !isNaN(mach.expectedDiff);
    const color = getMachineColor(mach);
    const lift = isEvaluated ? computeLift(mach.expectedDiff, dayMean) : 0;
    const roundedLift = roundForDisplay(lift);
    const isModelMatch =
      (currentSelectedModel === 'all' ||
        (mach.modelName && mach.modelName === currentSelectedModel)) &&
      (!isModelFilterActive ||
        !selectedModelNames ||
        selectedModelNames.length === 0 ||
        (mach.modelName && selectedModelNames.includes(mach.modelName)) ||
        (activeFilterLabel && activeFilterLabel !== '全機種' && mach.modelName === activeFilterLabel));

    // Prompt 64 Requirement 5: 選択機種以外の台は、薄い灰色で表示（ランキングには含めない）
    const isRanked = isModelMatch && isEvaluated && mach.rank > 0 && mach.rank <= currentTopN;

    // Color theme styling
    let colorClasses = '';
    if (!isModelMatch) {
      // 選択機種以外の台: 薄い灰色
      colorClasses = 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200/60';
    } else if (color === 'green') {
      colorClasses = 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100 hover:border-emerald-400';
    } else if (color === 'red') {
      colorClasses = 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100 hover:border-rose-400';
    } else {
      // Gray (unevaluated)
      colorClasses = 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200/80';
    }

    const highlightClasses = isModelMatch
      ? (currentSelectedModel !== 'all' || (isModelFilterActive && activeFilterLabel !== '全機種'))
        ? 'ring-2 ring-indigo-500 shadow-md scale-[1.03] z-10 font-black'
        : 'hover:shadow-xs'
      : 'opacity-40 grayscale-[40%] hover:opacity-75';

    return (
      <div
        key={mach.id}
        onClick={() => setSelectedMachine(mach)}
        data-testid={`machine-cell-${mach.machineNum}`}
        data-machine-color={color}
        data-highlighted={isModelMatch ? 'true' : 'false'}
        data-unavailable={isUnavailable ? 'true' : 'false'}
        className={`relative flex flex-col justify-between p-2 rounded-xl border transition-all cursor-pointer select-none min-h-[68px] ${colorClasses} ${highlightClasses} ${
          isUnavailable ? 'overflow-hidden' : ''
        }`}
      >
        {/* Diagonal stripes overlay for "空いていない" (Prompt 60 Requirement 4) */}
        {isUnavailable && (
          <div
            data-testid={`unavailable-machine-${mach.machineNum}`}
            className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(100,116,139,0.22)_0px,rgba(100,116,139,0.22)_6px,transparent_6px,transparent_12px)] pointer-events-none z-10 flex items-center justify-center"
          >
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-900/85 text-white shadow-2xs whitespace-nowrap">
              空き無
            </span>
          </div>
        )}

        {/* Top bar: Rank Badge (Prompt 60 Requirement 3) and Machine Number */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            {isRanked && (
              <span
                data-testid={`rank-badge-${mach.rank}`}
                className={`text-[9px] font-black px-1.5 py-0.2 rounded-md shadow-2xs ${
                  mach.rank === 1
                    ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-500'
                    : mach.rank === 2
                    ? 'bg-slate-300 text-slate-900 ring-1 ring-slate-400'
                    : mach.rank === 3
                    ? 'bg-amber-700 text-white'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                #{mach.rank}
              </span>
            )}
            <span
              className={`font-mono text-xs font-black tracking-tight ${
                isUnavailable ? 'line-through text-slate-500' : 'text-slate-900'
              }`}
            >
              {mach.machineNum}
            </span>
          </div>

          {mach.confidence && isEvaluated && (
            <span className="text-[9px] text-slate-500 font-bold hidden sm:inline">
              {mach.confidence === '高' ? '★★★' : mach.confidence === '中' ? '★★☆' : '★☆☆'}
            </span>
          )}
        </div>

        {/* Middle: Model Name (truncated) */}
        <div className="my-0.5">
          <div
            className="text-[11px] font-bold truncate leading-tight"
            title={mach.modelName}
          >
            {mach.modelName}
          </div>
        </div>

        {/* Bottom: Lift vs Mean or Unevaluated */}
        <div className="flex items-center justify-between text-[10px] font-mono font-bold pt-0.5 border-t border-slate-200/50">
          {isEvaluated ? (
            <span
              className={
                color === 'green'
                  ? 'text-emerald-700'
                  : color === 'red'
                  ? 'text-rose-700'
                  : 'text-slate-500'
              }
            >
              {roundedLift >= 0 ? `+${formatNumber(roundedLift)}` : formatNumber(roundedLift)}
              <span className="text-[8px] font-normal font-sans ml-0.5">枚</span>
            </span>
          ) : (
            <span className="text-slate-400 text-[9px] font-sans font-normal">評価なし</span>
          )}

          {isEvaluated && mach.shrunkPayoutRate !== undefined && (
            <span className="text-[9px] text-slate-500 font-mono hidden min-[480px]:inline">
              {mach.shrunkPayoutRate}%
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      data-testid="target-floor-map-container"
    >
      {/* Top Banner: Controls, Store Selector, Model Filter & Legend */}
      <div className="p-3 sm:p-4 bg-slate-50/90 border-b border-slate-200 space-y-3">
        {/* Cross-store store tabs / selector (Prompt 60 Requirement 5: 全店のときは1店ずつ切替) */}
        {hasMultipleStores && (
          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-200/80">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 shrink-0">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>店舗切替:</span>
            </div>

            {/* Dropdown for compact display */}
            <select
              value={currentStoreId}
              onChange={(e) => handleSelectStore(e.target.value)}
              className="sm:hidden text-xs font-black bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-hidden"
              data-testid="floor-map-store-selector"
            >
              {distinctStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Tab buttons on wider view */}
            <div
              className="hidden sm:inline-flex flex-wrap items-center gap-1.5"
              data-testid="floor-map-store-tabs"
            >
              {distinctStores.map((s) => {
                const isActive = s.id === currentStoreId;
                const count = rows.filter((r) => r.storeId === s.id).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectStore(s.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-2xs font-black ring-1 ring-indigo-700'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>{s.name}</span>
                    <span
                      className={`text-[10px] px-1 rounded ${
                        isActive ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}台
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Toolbar: Model filter, Top N selector & Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Model Filter (Prompt 60 Requirement 4: 機種で絞り込み) */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-slate-500 font-medium">機種強調:</span>
              <select
                value={currentSelectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="font-black text-slate-800 bg-transparent focus:outline-hidden cursor-pointer max-w-[150px] truncate"
                data-testid="floor-map-model-select"
              >
                <option value="all">全機種</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Top N Badge Selector (Prompt 60 Requirement 3: 上位N台に順位バッジ) */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-slate-500 font-medium">バッジ表示:</span>
              <select
                value={currentTopN}
                onChange={(e) => handleTopNChange(Number(e.target.value))}
                className="font-black text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                data-testid="floor-map-topn-select"
              >
                <option value={5}>上位5台</option>
                <option value={10}>上位10台 (既定)</option>
                <option value={20}>上位20台</option>
                <option value={30}>上位30台</option>
                <option value={999}>全候補台</option>
              </select>
            </div>
          </div>

          {/* Color Legend (1行表示) */}
          <div
            className="flex flex-wrap items-center gap-2.5 text-[11px] font-bold text-slate-600"
            data-testid="floor-map-legend"
          >
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-600 inline-block" />
              <span>緑: 平均以上</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-rose-500 border border-rose-600 inline-block" />
              <span>赤: 平均未満</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300 inline-block" />
              <span>灰: 評価なし</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-slate-400 bg-[repeating-linear-gradient(135deg,#64748b_0px,#64748b_2px,transparent_2px,transparent_5px)] inline-block" />
              <span>斜線: 空き無</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Floor Map Canvas Area */}
      <div className="p-3 sm:p-5 space-y-6">
        {hasIslandConfig ? (
          /* Island View: Grouped by island definitions (Prompt 60 Requirement 2) */
          <div className="space-y-6" data-testid="floor-map-island-view">
            {islandGroups.map(({ definition, machines }) => {
              const topCount = machines.filter(
                (m) => m.rank > 0 && m.rank <= currentTopN && m.expectedDiff !== undefined && !isNaN(m.expectedDiff)
              ).length;

              return (
                <div
                  key={definition.name}
                  data-testid={`island-${definition.name}`}
                  className="bg-slate-50/60 rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3"
                >
                  {/* Island Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-black text-slate-900">
                        {definition.name}
                      </span>
                      {definition.startNum > 0 && definition.endNum > 0 && (
                        <span className="text-xs font-mono text-slate-500 font-bold">
                          ({definition.startNum}〜{definition.endNum}番台)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">
                        全 <strong className="text-slate-800 font-mono">{machines.length}</strong> 台
                      </span>
                      {topCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-black flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          上位候補 {topCount}台
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Island Machines Grid */}
                  <div className="grid grid-cols-2 min-[420px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {machines.map((mach) => renderMachineCell(mach))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Grid View: 10 machines per row when no island config (Prompt 60 Requirement 2) */
          <div className="space-y-3" data-testid="floor-map-grid-view">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 pb-1">
              <span>台番順グリッド表示 (1行10台)</span>
              <span className="font-mono">{gridMachines.length}台</span>
            </div>

            <div
              className="grid grid-cols-2 min-[420px]:grid-cols-5 sm:grid-cols-10 gap-2"
              data-testid="floor-map-grid-10"
            >
              {gridMachines.map((mach) => renderMachineCell(mach))}
            </div>
          </div>
        )}
      </div>

      {/* Machine Detail Modal / Bottom Drawer (Prompt 60 Requirement 3: タップで詳細表示) */}
      {selectedMachine && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
          data-testid="machine-detail-panel"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
            {/* Header: Machine Number, Store Name, Rank & Close Button */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono font-black text-slate-900">
                    {selectedMachine.machineNum}番台
                  </span>
                  {selectedMachine.rank > 0 && selectedMachine.rank <= currentTopN && (
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-md shadow-2xs ${
                        selectedMachine.rank === 1
                          ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-500'
                          : selectedMachine.rank === 2
                          ? 'bg-slate-300 text-slate-900 ring-1 ring-slate-400'
                          : selectedMachine.rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      #{selectedMachine.rank}位
                    </span>
                  )}
                  {selectedMachine.confidence && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      信頼度 {selectedMachine.confidence}
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-bold mt-0.5">
                  {selectedMachine.storeName || currentStoreName}
                  {selectedMachine.islandName && ` · ${selectedMachine.islandName}`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMachine(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="閉じる"
                data-testid="close-detail-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Model Name */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <span className="text-2xs text-slate-500 font-bold block mb-0.5">対象機種</span>
              <span
                className="text-base font-black text-slate-900 block"
                data-testid="detail-model-name"
              >
                {selectedMachine.modelName}
              </span>
            </div>

            {/* Expected Diff & Lift vs Mean */}
            <div
              className="grid grid-cols-2 gap-3"
              data-testid="detail-lift"
            >
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <span className="text-2xs text-slate-500 font-bold block mb-0.5">全台平均との差</span>
                {selectedMachine.expectedDiff !== undefined && !isNaN(selectedMachine.expectedDiff) ? (
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-lg font-mono font-black ${
                        computeLift(selectedMachine.expectedDiff, dayMean) >= 0
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {roundForDisplay(computeLift(selectedMachine.expectedDiff, dayMean)) >= 0 ? '+' : ''}
                      {formatNumber(roundForDisplay(computeLift(selectedMachine.expectedDiff, dayMean)))}
                    </span>
                    <span className="text-xs text-slate-500 font-bold">枚 (目安)</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">評価データなし</span>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <span className="text-2xs text-slate-500 font-bold block mb-0.5">期待差枚 / 出率</span>
                {selectedMachine.expectedDiff !== undefined && !isNaN(selectedMachine.expectedDiff) ? (
                  <div>
                    <span className="text-lg font-mono font-black text-slate-900">
                      {selectedMachine.expectedDiff >= 0 ? '+' : ''}
                      {formatNumber(Math.round(selectedMachine.expectedDiff))}
                    </span>
                    <span className="text-xs text-slate-500 font-bold ml-1">枚</span>
                    {selectedMachine.shrunkPayoutRate !== undefined && (
                      <span className="text-xs font-mono text-indigo-700 block mt-0.5 font-bold">
                        推定出率 {selectedMachine.shrunkPayoutRate}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                )}
              </div>
            </div>

            {/* Reason Tags (Prompt 60 Requirement 3: 理由タグ) */}
            <div data-testid="detail-reason-tags" className="space-y-1.5">
              <span className="text-2xs font-bold text-slate-500 block">評価理由タグ</span>
              {(() => {
                const tags = buildReasonTags(
                  selectedMachine.contributions,
                  selectedMachine.evidenceDays,
                  undefined,
                  undefined,
                  selectedMachine.reasons
                );
                if (tags.length === 0) {
                  return (
                    <span className="text-xs text-slate-400">特定の理由タグはありません。</span>
                  );
                }
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${getTagBadgeClass(
                          tag.color
                        )}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {selectedMachine.reasons && selectedMachine.reasons.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-700 space-y-1 mt-2 border border-slate-100">
                  {selectedMachine.reasons.map((r, i) => (
                    <p key={i} className="leading-snug">
                      • {r}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* History 14-Day Bar Chart (Prompt 60 Requirement 3: 履歴) */}
            <div data-testid="detail-history" className="space-y-1.5">
              <span className="text-2xs font-bold text-slate-500 block">直近14日履歴</span>
              <History14DayBarChart history={selectedMachine.history} />
            </div>

            {/* Action Bar: Mark as unavailable toggle */}
            {selectedMachine.machineNum !== undefined && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedMachine.machineNum !== undefined) {
                      handleToggleUnavailable(selectedMachine.machineNum);
                    }
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs ${
                    currentCheckedMap[selectedMachine.machineNum] === 'unavailable'
                      ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                  data-testid="toggle-unavailable-btn"
                >
                  {currentCheckedMap[selectedMachine.machineNum] === 'unavailable' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-rose-600" />
                      <span>「空いていない」マークを解除</span>
                    </>
                  ) : (
                    <>
                      <Slash className="w-4 h-4 text-amber-300" />
                      <span>「空いていない」としてマーク（斜線表示）</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMachine(null)}
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
