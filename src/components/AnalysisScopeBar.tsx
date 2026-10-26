import React from 'react';
import { StoreProfile } from '../data/types';
import { StoreCommonPeriod } from '../utils/storeComparison';
import { Building2, Sparkles, SlidersHorizontal, Calendar, CheckSquare, Square } from 'lucide-react';

export type AnalysisScope = 'store' | 'custom' | 'all';
export type AnalysisPeriodMode = 'common' | 'all';

export interface AnalysisScopeBarProps {
  stores: StoreProfile[];
  currentStore: StoreProfile;
  scope: AnalysisScope;
  onScopeChange: (scope: AnalysisScope) => void;
  selectedStoreIds: string[];
  onToggleStoreId: (storeId: string) => void;
  onSelectAllStores?: () => void;
  onClearStores?: () => void;
  periodMode: AnalysisPeriodMode;
  onPeriodModeChange: (period: AnalysisPeriodMode) => void;
  commonPeriod?: StoreCommonPeriod | null;
}

export const AnalysisScopeBar: React.FC<AnalysisScopeBarProps> = ({
  stores,
  currentStore,
  scope,
  onScopeChange,
  selectedStoreIds,
  onToggleStoreId,
  onSelectAllStores,
  onClearStores,
  periodMode,
  onPeriodModeChange,
  commonPeriod,
}) => {
  // Requirement 3: If only 1 store is imported, do not display the switch
  if (!stores || stores.length <= 1) {
    return null;
  }

  // Period mode is only enabled when multiple stores are selected
  const effectiveStoreCount =
    scope === 'all'
      ? stores.length
      : scope === 'custom'
      ? selectedStoreIds.length
      : 1;
  const isPeriodEnabled = scope !== 'store' && effectiveStoreCount >= 2;

  return (
    <div
      data-testid="analysis-scope-bar"
      className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-2xs space-y-3"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* 1. Scope Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
            <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
            <span>対象店舗:</span>
          </div>

          <div
            className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs text-xs"
            role="tablist"
            aria-label="分析対象店舗切替"
          >
            {/* この店 */}
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'store'}
              onClick={() => onScopeChange('store')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                scope === 'store'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              data-testid="scope-store-btn"
            >
              <Building2 className={`w-3.5 h-3.5 ${scope === 'store' ? 'text-amber-600' : 'text-slate-500'}`} />
              <span>この店</span>
              {currentStore && (
                <span className="text-[10px] text-slate-500 font-normal hidden sm:inline max-w-[120px] truncate">
                  ({currentStore.name})
                </span>
              )}
            </button>

            {/* 店舗を選ぶ */}
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'custom'}
              onClick={() => onScopeChange('custom')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                scope === 'custom'
                  ? 'bg-indigo-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              data-testid="scope-custom-btn"
            >
              <SlidersHorizontal className={`w-3.5 h-3.5 ${scope === 'custom' ? 'text-white' : 'text-slate-500'}`} />
              <span>店舗を選ぶ</span>
              {scope === 'custom' && (
                <span className="text-[10px] px-1 rounded bg-indigo-700 text-indigo-100 font-mono">
                  {selectedStoreIds.length}/{stores.length}
                </span>
              )}
            </button>

            {/* 全店 */}
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'all'}
              onClick={() => onScopeChange('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                scope === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              data-testid="scope-all-btn"
            >
              <Sparkles className={`w-3.5 h-3.5 ${scope === 'all' ? 'text-amber-300' : 'text-indigo-500'}`} />
              <span>全店</span>
              <span
                className={`text-[10px] font-mono px-1 rounded ${
                  scope === 'all' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {`${stores.length}店`}
              </span>
            </button>
          </div>
        </div>

        {/* 2. Period Switcher (共通期間 / 全期間) */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <Calendar className={`w-3.5 h-3.5 ${isPeriodEnabled ? 'text-indigo-600' : 'text-slate-400'}`} />
            <span className={isPeriodEnabled ? 'text-slate-700' : 'text-slate-400'}>集計期間:</span>
          </div>

          <div
            className={`inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs transition-opacity ${
              isPeriodEnabled ? 'opacity-100' : 'opacity-50 cursor-not-allowed'
            }`}
            title={!isPeriodEnabled ? '店舗が2つ以上選択されている場合のみ有効です' : undefined}
          >
            <button
              type="button"
              disabled={!isPeriodEnabled}
              onClick={() => onPeriodModeChange('common')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                isPeriodEnabled ? 'cursor-pointer' : 'cursor-not-allowed'
              } ${
                periodMode === 'common' && isPeriodEnabled
                  ? 'bg-white text-indigo-700 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              data-testid="period-common-btn"
            >
              共通期間
            </button>
            <button
              type="button"
              disabled={!isPeriodEnabled}
              onClick={() => onPeriodModeChange('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                isPeriodEnabled ? 'cursor-pointer' : 'cursor-not-allowed'
              } ${
                periodMode === 'all' && isPeriodEnabled
                  ? 'bg-white text-indigo-700 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              data-testid="period-all-btn"
            >
              全期間
            </button>
          </div>

          {/* Common period info badge */}
          {isPeriodEnabled && periodMode === 'common' && commonPeriod && commonPeriod.hasCommonPeriod && (
            <span className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md hidden md:inline">
              {commonPeriod.startDate.slice(5)} 〜 {commonPeriod.endDate.slice(5)} ({commonPeriod.commonDaysCount}日間)
            </span>
          )}
        </div>
      </div>

      {/* 3. Custom Store Selection Drawer (Active when scope === 'custom') */}
      {scope === 'custom' && (
        <div
          data-testid="custom-stores-panel"
          className="pt-2.5 border-t border-slate-100 space-y-2 animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <span>分析対象とする店舗にチェックを入れてください</span>
              <span className="text-2xs text-slate-400 font-normal">
                {`(${selectedStoreIds.length}/${stores.length}店舗 選択中)`}
              </span>
            </span>

            <div className="flex items-center gap-2">
              {onSelectAllStores && (
                <button
                  type="button"
                  onClick={onSelectAllStores}
                  className="text-2xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  data-testid="select-all-stores-btn"
                >
                  全選択
                </button>
              )}
              {onClearStores && (
                <button
                  type="button"
                  onClick={onClearStores}
                  className="text-2xs font-bold text-slate-400 hover:text-rose-600 underline cursor-pointer"
                  data-testid="clear-all-stores-btn"
                >
                  全解除
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-0.5">
            {stores.map((s) => {
              const isChecked = selectedStoreIds.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  data-testid={`store-checkbox-${s.id}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleStoreId(s.id)}
                    className="sr-only"
                  />
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span>{s.name}</span>
                  <span className="text-2xs font-normal text-slate-400">
                    ({s.dailyRecords.length}日)
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
