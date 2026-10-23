import React, { useState, useMemo, useEffect } from 'react';
import { StoreProfile } from '../data/types';
import { UnitMode } from './Header';
import { TargetDateRanking } from './TargetDateRanking';
import { CrossStoreTarget } from './CrossStoreTarget';
import { Target, Building2, Sparkles, Calendar, Flame, X, Cpu } from 'lucide-react';
import { isDateSpecialDay } from '../utils/dataEngine';
import { isJapaneseHoliday } from '../utils/holidayUtils';

export type TargetScope = 'store' | 'all';

export interface TargetTabProps {
  targetDate: string;
  onTargetDateChange: (date: string) => void;
  scope: TargetScope;
  onScopeChange: (scope: TargetScope) => void;
  currentStore: StoreProfile | null;
  stores: StoreProfile[];
  latestDataDate: string;
  perspective: 'hall' | 'player';
  unit: UnitMode;
  rateLend: number;
  rateExchange: number;
  filteredStoresByModel: StoreProfile[];
  activeFilterLabel?: string;
  isModelFilterActive?: boolean;
  onSelectStore: (storeId: string) => void;
  onNavigateToValidation?: () => void;
  onOpenStoreManager?: () => void;
  targetSection?: string;
}

export const TargetTab: React.FC<TargetTabProps> = ({
  targetDate,
  onTargetDateChange,
  scope,
  onScopeChange,
  currentStore,
  stores,
  latestDataDate,
  perspective,
  unit,
  rateLend,
  rateExchange,
  filteredStoresByModel,
  activeFilterLabel,
  isModelFilterActive,
  onSelectStore,
  onNavigateToValidation,
  onOpenStoreManager,
  targetSection,
}) => {
  // Cascading funnel states (Prompt 47)
  const [funnelStoreId, setFunnelStoreId] = useState<string | null>(null);
  const [funnelModelName, setFunnelModelName] = useState<string | null>(null);

  // Clear funnelStoreId when explicitly switching to single-store scope
  useEffect(() => {
    if (scope === 'store') {
      setFunnelStoreId(null);
    }
  }, [scope]);

  // Smooth scroll to a step ID
  const scrollToStep = (stepId: string) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Sync targetSection from URL or PurposeMenu navigation (Prompt 46 & 47)
  useEffect(() => {
    if (!targetSection) return;
    const sectionMap: Record<string, string> = {
      calendar: 'target-step-1',
      'target-calendar-scan': 'target-step-1',
      stores: 'target-step-2',
      'target-store-ranking': 'target-step-2',
      models: 'target-step-3',
      'target-model-ranking': 'target-step-3',
      machines: 'target-step-4',
      'target-machine-ranking': 'target-step-4',
      checklist: 'target-step-5',
      'target-checklist': 'target-step-5',
      'target-step-1': 'target-step-1',
      'target-step-2': 'target-step-2',
      'target-step-3': 'target-step-3',
      'target-step-4': 'target-step-4',
      'target-step-5': 'target-step-5',
    };
    const targetId = sectionMap[targetSection] || targetSection;
    const timer = setTimeout(() => {
      scrollToStep(targetId);
    }, 120);
    return () => clearTimeout(timer);
  }, [targetSection, scope]);

  // Effective date falls back to latestDataDate or today if not set
  const effectiveTargetDate = useMemo(() => {
    if (targetDate) return targetDate;
    if (latestDataDate) return latestDataDate;
    return new Date().toISOString().slice(0, 10);
  }, [targetDate, latestDataDate]);

  // Today & Tomorrow strings
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Quick date details (day of week, holiday, special day for current store)
  const dateMeta = useMemo(() => {
    if (!effectiveTargetDate || effectiveTargetDate.length < 10) return null;
    const parts = effectiveTargetDate.split('-');
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    const dateObj = new Date(y, m, d);
    if (isNaN(dateObj.getTime())) return null;

    const dowNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dow = dowNames[dateObj.getDay()];
    const isSun = dateObj.getDay() === 0;
    const isSat = dateObj.getDay() === 6;
    const isHoliday = isJapaneseHoliday(effectiveTargetDate);

    // Current store special day check
    let isStoreSpecial = false;
    let storeSpecialLabel = '';
    if (currentStore) {
      isStoreSpecial = isDateSpecialDay(effectiveTargetDate, currentStore.specialDayRules);
      storeSpecialLabel = isStoreSpecial ? (currentStore.oldEventDays || '店舗特日') : '';
    }

    return {
      dow,
      isSun,
      isSat,
      isHoliday,
      isStoreSpecial,
      storeSpecialLabel,
    };
  }, [effectiveTargetDate, currentStore]);

  // Resolved store object for funnel chip
  const funnelStoreObj = useMemo(() => {
    if (scope === 'store') return currentStore;
    if (!funnelStoreId) return null;
    return stores.find((s) => s.id === funnelStoreId) || null;
  }, [scope, currentStore, funnelStoreId, stores]);

  return (
    <div className="space-y-4 animate-in fade-in duration-150" data-testid="target-tab">
      {/* Sticky Step Navigation Bar (①〜⑤) & Funnel Chips (Prompt 47) */}
      <div
        className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2"
        data-testid="step-navigation-bar"
      >
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-0.5 text-xs">
          <button
            type="button"
            onClick={() => scrollToStep('target-step-1')}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0"
            data-testid="nav-step-1"
          >
            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
              ①
            </span>
            <span>来店日・範囲</span>
          </button>

          <span className="text-slate-300 font-bold shrink-0 hidden sm:inline">›</span>

          <button
            type="button"
            onClick={() => {
              if (scope !== 'all') {
                onScopeChange('all');
                setTimeout(() => scrollToStep('target-step-2'), 100);
              } else {
                scrollToStep('target-step-2');
              }
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-bold border transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              scope === 'all'
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-slate-100/60 text-slate-400 border-dashed border-slate-200 hover:text-slate-600'
            }`}
            data-testid="nav-step-2"
            title={scope === 'all' ? 'どの店に行くか' : '全店表示に切り替えて店舗選択'}
          >
            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
              ②
            </span>
            <span>どの店に行くか</span>
            {scope === 'store' && (
              <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded font-normal">
                全店時
              </span>
            )}
          </button>

          <span className="text-slate-300 font-bold shrink-0 hidden sm:inline">›</span>

          <button
            type="button"
            onClick={() => scrollToStep('target-step-3')}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0"
            data-testid="nav-step-3"
          >
            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
              ③
            </span>
            <span>どの機種を狙うか</span>
          </button>

          <span className="text-slate-300 font-bold shrink-0 hidden sm:inline">›</span>

          <button
            type="button"
            onClick={() => scrollToStep('target-step-4')}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0"
            data-testid="nav-step-4"
          >
            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
              ④
            </span>
            <span>どの台を狙うか</span>
          </button>

          <span className="text-slate-300 font-bold shrink-0 hidden sm:inline">›</span>

          <button
            type="button"
            onClick={() => scrollToStep('target-step-5')}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 font-black border border-amber-500 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
            data-testid="nav-step-5"
          >
            <span className="w-4 h-4 rounded-full bg-slate-950 text-amber-400 text-[10px] font-black flex items-center justify-center">
              ⑤
            </span>
            <span>当日のチェック</span>
          </button>
        </div>

        {/* Selected chips row (Prompt 47 Requirement 3) */}
        {(funnelStoreObj || funnelModelName) && (
          <div
            className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-xs animate-in fade-in"
            data-testid="funnel-chips-bar"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">選択中:</span>
              {funnelStoreObj && (
                <span
                  className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 font-bold px-2 py-0.5 rounded-lg border border-amber-200 text-2xs"
                  data-testid="funnel-chip-store"
                >
                  <Building2 className="w-3 h-3 text-amber-700" />
                  <span>{funnelStoreObj.name}</span>
                  {scope === 'all' ? (
                    <button
                      type="button"
                      onClick={() => setFunnelStoreId(null)}
                      className="ml-0.5 text-amber-500 hover:text-rose-600 transition-colors cursor-pointer"
                      aria-label="店舗選択を解除"
                      data-testid="clear-funnel-store"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onScopeChange('all')}
                      className="ml-0.5 text-amber-500 hover:text-rose-600 transition-colors cursor-pointer"
                      aria-label="店舗選択を解除"
                      title="全店表示に切り替えて店舗選択を解除"
                      data-testid="clear-funnel-store"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              )}
              {funnelStoreObj && funnelModelName && (
                <span className="text-slate-300 font-bold text-2xs">›</span>
              )}
              {funnelModelName && (
                <span
                  className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-900 font-bold px-2 py-0.5 rounded-lg border border-indigo-200 text-2xs"
                  data-testid="funnel-chip-model"
                >
                  <Cpu className="w-3 h-3 text-indigo-700" />
                  <span>{funnelModelName}</span>
                  <button
                    type="button"
                    onClick={() => setFunnelModelName(null)}
                    className="ml-0.5 text-indigo-500 hover:text-rose-600 transition-colors cursor-pointer"
                    aria-label="機種選択を解除"
                    data-testid="clear-funnel-model"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            {(funnelStoreId || funnelModelName || scope === 'store') && (
              <button
                type="button"
                onClick={() => {
                  setFunnelStoreId(null);
                  setFunnelModelName(null);
                  if (scope === 'store') {
                    onScopeChange('all');
                  }
                }}
                className="text-2xs font-bold text-slate-400 hover:text-rose-600 underline cursor-pointer"
                data-testid="clear-all-funnel"
              >
                全解除
              </button>
            )}
          </div>
        )}
      </div>

      {/* Step ①: Unified Top Control Bar: Target Date & Scope Switcher */}
      <div id="target-step-1" data-testid="target-step-1-card" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5 scroll-mt-28">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Step ① Icon, Tab Title & Scope Switcher */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                ①
              </span>
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">
                <Target className="w-4 h-4 text-amber-600" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>狙い予測</span>
                  <span className="text-xs font-normal text-slate-500 hidden sm:inline">
                    （① 来店日と範囲: この店／全店）
                  </span>
                </h2>
                <p className="text-2xs text-slate-500">
                  {scope === 'store'
                    ? `${currentStore?.name || '選択中の店舗'} の来店日 狙い機種・台番ランキング予測`
                    : `全 ${stores.length} 店舗を横断した店舗比較・来店日スキャン・狙い台ランキング`}
                </p>
              </div>
            </div>

            {/* Scope Switcher: 「この店」 vs 「全店」 */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-2xs font-bold text-slate-500 mr-1">範囲:</span>
              <div
                className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs"
                role="tablist"
                aria-label="狙い範囲切替"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'store'}
                  onClick={() => onScopeChange('store')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    scope === 'store'
                      ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 font-black'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                  data-testid="scope-store-button"
                >
                  <Building2 className={`w-3.5 h-3.5 ${scope === 'store' ? 'text-amber-600' : 'text-slate-500'}`} />
                  <span>この店</span>
                  {currentStore && (
                    <span className="text-[10px] text-slate-400 font-normal hidden md:inline">
                      ({currentStore.name})
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'all'}
                  onClick={() => onScopeChange('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    scope === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                  data-testid="scope-all-button"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${scope === 'all' ? 'text-amber-300' : 'text-indigo-500'}`} />
                  <span>全店</span>
                  <span
                    className={`text-[10px] font-mono px-1 rounded ${
                      scope === 'all' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {stores.length}店
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Target Date Control & Quick Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 self-start lg:self-auto bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                <label htmlFor="target-date-input" className="whitespace-nowrap">来店日:</label>
              </div>
              <input
                id="target-date-input"
                type="date"
                value={effectiveTargetDate}
                onChange={(e) => onTargetDateChange(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                data-testid="target-date-input"
              />

              {/* Date Metadata Badge */}
              {dateMeta && (
                <div className="flex items-center gap-1 text-2xs font-bold">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      dateMeta.isSun
                        ? 'bg-rose-100 text-rose-700'
                        : dateMeta.isSat
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    ({dateMeta.dow})
                  </span>
                  {dateMeta.isHoliday && (
                    <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded text-[10px]">
                      祝日
                    </span>
                  )}
                  {scope === 'store' && dateMeta.isStoreSpecial && (
                    <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded flex items-center gap-0.5 shadow-2xs">
                      <Flame className="w-2.5 h-2.5" />
                      {dateMeta.storeSpecialLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quick Date Buttons */}
            <div className="flex items-center gap-1 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-2.5 flex-wrap">
              {latestDataDate && (
                <button
                  type="button"
                  onClick={() => onTargetDateChange(latestDataDate)}
                  className={`px-2 py-0.5 text-2xs font-bold rounded border transition-colors cursor-pointer ${
                    effectiveTargetDate === latestDataDate
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                  title={`最新データ日 (${latestDataDate}) に設定`}
                >
                  最新日
                </button>
              )}
              <button
                type="button"
                onClick={() => onTargetDateChange(todayStr)}
                className={`px-2 py-0.5 text-2xs font-bold rounded border transition-colors cursor-pointer ${
                  effectiveTargetDate === todayStr
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title={`今日 (${todayStr}) に設定`}
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => onTargetDateChange(tomorrowStr)}
                className={`px-2 py-0.5 text-2xs font-bold rounded border transition-colors cursor-pointer ${
                  effectiveTargetDate === tomorrowStr
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title={`明日 (${tomorrowStr}) に設定`}
              >
                明日
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scope Content Display */}
      {scope === 'store' ? (
        currentStore ? (
          <div data-testid="target-store-content" className="space-y-6">
            <TargetDateRanking
              targetDate={effectiveTargetDate}
              setTargetDate={onTargetDateChange}
              dailyRecords={currentStore.dailyRecords || []}
              perspective={perspective}
              unit={unit}
              rateLend={rateLend}
              rateExchange={rateExchange}
              specialDayRules={currentStore.specialDayRules}
              oldEventDays={currentStore.oldEventDays}
              customWeights={currentStore.customRankingWeights}
              customMachineWeights={currentStore.customMachineRankingWeights}
              islandConfig={currentStore.islandConfig}
              includeReusedMachines={currentStore.includeReusedMachinesInStats}
              aliasDictionary={currentStore.modelAliasDictionary}
              onNavigateToValidation={onNavigateToValidation}
              onOpenStoreManager={onOpenStoreManager}
              storeId={currentStore.id}
              storeName={currentStore.name}
              funnelModelName={funnelModelName}
              onSelectFunnelModel={setFunnelModelName}
              targetSection={targetSection}
            />
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
            店舗データが登録されていません。店舗データを取り込んでください。
          </div>
        )
      ) : (
        <div data-testid="target-all-content" className="space-y-6">
          <CrossStoreTarget
            stores={filteredStoresByModel}
            targetDate={effectiveTargetDate}
            onTargetDateChange={onTargetDateChange}
            initialTargetDate={effectiveTargetDate}
            activeFilterLabel={activeFilterLabel}
            isModelFilterActive={isModelFilterActive}
            onSelectStore={onSelectStore}
            targetSection={targetSection}
            funnelStoreId={funnelStoreId}
            onSelectFunnelStore={setFunnelStoreId}
            funnelModelName={funnelModelName}
            onSelectFunnelModel={setFunnelModelName}
          />
        </div>
      )}
    </div>
  );
};
