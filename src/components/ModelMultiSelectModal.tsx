import React, { useState, useMemo } from 'react';
import { AggregatedModelStat } from '../data/types';
import { formatNumber } from '../utils/formatters';
import {
  getModelTagInfo,
  isSmartSlot,
  isAType,
  isJuggler,
} from '../utils/modelFilterUtils';
import {
  X,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Zap,
  Filter,
  Check,
  RotateCcw,
} from 'lucide-react';

interface ModelMultiSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  allModels: AggregatedModelStat[];
  selectedModelNames: string[];
  onApplySelection: (selected: string[]) => void;
}

export const ModelMultiSelectModal: React.FC<ModelMultiSelectModalProps> = ({
  isOpen,
  onClose,
  allModels,
  selectedModelNames,
  onApplySelection,
}) => {
  const [search, setSearch] = useState('');
  // Local pending selection initialized from props
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);

  // When modal opens, sync pending selection
  React.useEffect(() => {
    if (isOpen) {
      setPendingSelection(
        selectedModelNames.length > 0
          ? [...selectedModelNames]
          : allModels.map((m) => m.modelName)
      );
      setSearch('');
    }
  }, [isOpen, selectedModelNames, allModels]);

  const allModelNames = useMemo(() => allModels.map((m) => m.modelName), [allModels]);

  const smartSlotNames = useMemo(
    () => allModelNames.filter(isSmartSlot),
    [allModelNames]
  );
  const aTypeNames = useMemo(() => allModelNames.filter(isAType), [allModelNames]);
  const jugglerNames = useMemo(() => allModelNames.filter(isJuggler), [allModelNames]);

  // Filtered list inside selector
  const displayedModels = useMemo(() => {
    if (!search.trim()) return allModels;
    const q = search.toLowerCase().trim();
    return allModels.filter((m) => {
      if (m.modelName.toLowerCase().includes(q)) return true;
      const tagInfo = getModelTagInfo(m.modelName);
      if (q === 'スマスロ' && tagInfo.isSmart) return true;
      if (q === 'aタイプ' && tagInfo.isAType) return true;
      if (q === 'ジャグラー' && tagInfo.isJuggler) return true;
      return false;
    });
  }, [allModels, search]);

  if (!isOpen) return null;

  const pendingSet = new Set(pendingSelection);

  const toggleModel = (name: string) => {
    if (pendingSet.has(name)) {
      setPendingSelection(pendingSelection.filter((n) => n !== name));
    } else {
      setPendingSelection([...pendingSelection, name]);
    }
  };

  const handleSelectAll = () => {
    setPendingSelection([...allModelNames]);
  };

  const handleClearAll = () => {
    setPendingSelection([]);
  };

  const handleSelectPreset = (names: string[], mode: 'replace' | 'add') => {
    if (mode === 'replace') {
      setPendingSelection([...names]);
    } else {
      const merged = new Set([...pendingSelection, ...names]);
      setPendingSelection(Array.from(merged));
    }
  };

  const handleApply = () => {
    // If all models are selected, pass all or empty (representing all)
    onApplySelection(pendingSelection);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                機種の絞り込み選択 (複数選択可)
              </h3>
              <p className="text-[11px] text-slate-400">
                チェックを入れた機種のみ集計・一覧表示します。プリセットボタンで一括選択も可能。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Preset Buttons Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            一括選択:
          </span>

          {/* スマスロ Preset */}
          <button
            type="button"
            onClick={() => handleSelectPreset(smartSlotNames, 'replace')}
            className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold rounded-lg border border-purple-300 transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
          >
            スマスロのみ ({smartSlotNames.length}機種)
          </button>

          {/* Aタイプ Preset */}
          <button
            type="button"
            onClick={() => handleSelectPreset(aTypeNames, 'replace')}
            className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold rounded-lg border border-emerald-300 transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
          >
            Aタイプのみ ({aTypeNames.length}機種)
          </button>

          {/* ジャグラーシリーズ Preset */}
          <button
            type="button"
            onClick={() => handleSelectPreset(jugglerNames, 'replace')}
            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold rounded-lg border border-amber-300 transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
          >
            ジャグラーのみ ({jugglerNames.length}機種)
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              全選択
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1 bg-slate-200 hover:bg-rose-100 text-slate-600 hover:text-rose-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              全解除
            </button>
          </div>
        </div>

        {/* Search inside selector */}
        <div className="p-3 border-b border-slate-100 bg-white flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="機種名で絞り込み (例: ヴァルヴレイヴ, マイジャグ, 北斗)..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <div className="text-xs font-bold text-slate-700 whitespace-nowrap">
            選択中:{' '}
            <span className="text-amber-600 font-extrabold">{pendingSelection.length}</span> /{' '}
            {allModelNames.length} 機種
          </div>
        </div>

        {/* Machines List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-3 max-h-[50vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {displayedModels.map((m) => {
              const isChecked = pendingSet.has(m.modelName);
              const tagInfo = getModelTagInfo(m.modelName);

              return (
                <div
                  key={m.modelName}
                  onClick={() => toggleModel(m.modelName)}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer select-none ${
                    isChecked
                      ? 'bg-amber-50/70 border-amber-400 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      className={`w-4 h-4 rounded shrink-0 flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-amber-500 text-slate-950'
                          : 'border border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tagInfo.isSmart && (
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold border border-purple-200 shrink-0">
                            スマスロ
                          </span>
                        )}
                        {tagInfo.isJuggler && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold border border-amber-300 shrink-0">
                            ジャグラー
                          </span>
                        )}
                        {!tagInfo.isJuggler && tagInfo.isAType && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold border border-emerald-200 shrink-0">
                            Aタイプ
                          </span>
                        )}
                        <span className="font-bold text-xs text-slate-800 truncate" title={m.modelName}>
                          {m.modelName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>{m.avgMachinesPerDay}台</span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${
                            m.avgDiffCoinsPerMachine > 0 ? 'text-blue-600' : 'text-slate-600'
                          }`}
                        >
                          1台平均:{' '}
                          {m.avgDiffCoinsPerMachine > 0
                            ? `+${formatNumber(m.avgDiffCoinsPerMachine)}`
                            : formatNumber(m.avgDiffCoinsPerMachine)}
                          枚
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {displayedModels.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs">
              該当する機種が見つかりませんでした。
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            {pendingSelection.length === 0 ? (
              <span className="text-rose-600 font-bold">※ 機種が選択されていません</span>
            ) : pendingSelection.length === allModelNames.length ? (
              <span className="text-slate-600 font-medium">全機種表示</span>
            ) : (
              <span className="text-amber-700 font-bold">
                {pendingSelection.length} 機種を選択中
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-1.5 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-500 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              選択を適用 ({pendingSelection.length}機種)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
