import React, { useState } from 'react';
import { StoreInfo } from '../data/types';
import {
  Building2,
  Calendar,
  Coins,
  ArrowLeftRight,
  TrendingUp,
  Calculator,
  Zap,
  Layers,
  Plus,
  Target,
  Pencil,
  Percent,
  X,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { SpecialDayRuleModal } from './SpecialDayRuleModal';
import { isDateSpecialDay } from '../utils/dataEngine';

export type ProfitModelType = 'gCount';

export type UnitMode = 'yen' | 'coins' | 'avgDiff' | 'payoutRate';

interface HeaderProps {
  storeInfo: StoreInfo;
  perspective: 'hall' | 'player';
  setPerspective: (p: 'hall' | 'player') => void;
  unit: UnitMode;
  setUnit: (u: UnitMode) => void;
  profitModel?: ProfitModelType;
  setProfitModel?: (m: ProfitModelType) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  years: string[];
  totalDays: number;
  totalMonths?: number;
  onOpenStoreManager?: () => void;
  onChangeOldEventDays?: (newRuleText: string) => void;
  targetDate?: string;
  setTargetDate?: (d: string) => void;
  latestDataDate?: string;
}

export const Header: React.FC<HeaderProps> = ({
  storeInfo,
  perspective,
  setPerspective,
  unit,
  setUnit,
  profitModel,
  setProfitModel,
  selectedYear,
  setSelectedYear,
  years,
  totalDays,
  totalMonths = 0,
  onOpenStoreManager,
  onChangeOldEventDays,
  targetDate = '',
  setTargetDate,
  latestDataDate,
}) => {
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const lendYen = storeInfo.rateLend ? (1000 / storeInfo.rateLend).toFixed(2) : '21.74';
  const exchYen = storeInfo.rateExchange ? (1000 / storeInfo.rateExchange).toFixed(2) : '19.23';

  // Check target date properties
  const isTargetSpecial = targetDate
    ? isDateSpecialDay(targetDate, storeInfo.specialDayRules)
    : false;
  const targetDayTail = targetDate
    ? parseInt(targetDate.split(/[-/.]/)[2] || '0', 10) % 10
    : null;

  // Find next special day helper
  const handleFindNextSpecial = () => {
    if (!setTargetDate) return;
    // Base date: use latestDataDate if valid, otherwise today
    let base = new Date();
    if (latestDataDate) {
      const parsed = new Date(latestDataDate);
      if (!isNaN(parsed.getTime())) {
        base = parsed;
      }
    }
    for (let i = 1; i <= 31; i++) {
      const candidate = new Date(base);
      candidate.setDate(base.getDate() + i);
      const y = candidate.getFullYear();
      const m = String(candidate.getMonth() + 1).padStart(2, '0');
      const d = String(candidate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (isDateSpecialDay(dateStr, storeInfo.specialDayRules)) {
        setTargetDate(dateStr);
        return;
      }
    }
    // Default tomorrow
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    setTargetDate(`${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`);
  };

  const handleSetTomorrow = () => {
    if (!setTargetDate) return;
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const y = tom.getFullYear();
    const m = String(tom.getMonth() + 1).padStart(2, '0');
    const d = String(tom.getDate()).padStart(2, '0');
    setTargetDate(`${y}-${m}-${d}`);
  };

  const handleSetToday = () => {
    if (!setTargetDate) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    setTargetDate(`${y}-${m}-${d}`);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Store Info */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="bg-amber-500 text-slate-950 text-xs font-bold px-2 py-0.5 rounded tracking-wide">
                スロレポ出玉集計
              </span>
              <span className="text-slate-400 text-xs flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {storeInfo.dataRange} ({totalDays}日分集計)
              </span>
            </div>
            <div className="flex items-center flex-wrap gap-3 mt-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2 text-white">
                <Building2 className="w-7 h-7 text-amber-400" />
                {storeInfo.name}{' '}
                <span className="text-amber-400 font-semibold text-xl sm:text-2xl">利益月別推移</span>
              </h1>
              {onOpenStoreManager && (
                <button
                  type="button"
                  onClick={onOpenStoreManager}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  他店舗に切替 / 新規取込
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-300 mt-2">
              <span className="inline-flex items-center gap-1">
                <span className="text-slate-400">所在地:</span> {storeInfo.address}
              </span>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 px-2.5 py-0.5 rounded border border-amber-500/50 hover:border-amber-400 transition-colors cursor-pointer group shadow-2xs"
                title="クリックして特日ルール（5のつく日、7のつく日、ゾロ目等）を変更・設定"
              >
                <span className="text-amber-300 font-medium flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  特日ルール:
                </span>
                <span className="font-semibold text-white group-hover:text-amber-300">
                  {storeInfo.oldEventDays || '未設定'}
                </span>
                <Pencil className="w-3 h-3 text-slate-400 group-hover:text-amber-300 ml-0.5" />
              </button>
              <span className="inline-flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                <span className="text-cyan-300 font-medium">換金率:</span> {storeInfo.exchangeRate}
                <span className="text-slate-400 text-[11px]">
                  (貸出 {storeInfo.rateLend}枚 / 交換 {storeInfo.rateExchange}枚 : 1枚 {lendYen}円 / {exchYen}円)
                </span>
              </span>
              {storeInfo.totalMachinesApprox && (
                <span className="inline-flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                  <span className="text-slate-400">総台数:</span> 約{storeInfo.totalMachinesApprox}台
                </span>
              )}
            </div>
          </div>

          {/* Quick Mode Switchers */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Perspective Switcher */}
            <div className="bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 flex shadow-inner">
              <button
                type="button"
                id="btn-perspective-hall"
                onClick={() => setPerspective('hall')}
                className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                  perspective === 'hall'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  <span>ホール目線 (粗利)</span>
                </div>
                <span className={`text-[9px] px-1 rounded ${perspective === 'hall' ? 'bg-amber-600/30 text-slate-950 font-bold' : 'text-slate-500'}`}>
                  +は店利益
                </span>
              </button>
              <button
                type="button"
                id="btn-perspective-player"
                onClick={() => setPerspective('player')}
                className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                  perspective === 'player'
                    ? 'bg-emerald-500 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>スロッター目線 (収支)</span>
                </div>
                <span className={`text-[9px] px-1 rounded ${perspective === 'player' ? 'bg-emerald-700/50 text-white font-bold' : 'text-slate-500'}`}>
                  +は客勝ち
                </span>
              </button>
            </div>

            {/* Unit Switcher */}
            <div className="bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 flex">
              <button
                type="button"
                id="btn-unit-yen"
                onClick={() => setUnit('yen')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  unit === 'yen'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                円表記
              </button>
              <button
                type="button"
                id="btn-unit-coins"
                onClick={() => setUnit('coins')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1 ${
                  unit === 'coins'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                枚数表記
              </button>
              <button
                type="button"
                id="btn-unit-avg"
                onClick={() => setUnit('avgDiff')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  unit === 'avgDiff'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                台平均
              </button>
              <button
                type="button"
                id="btn-unit-payout"
                onClick={() => setUnit('payoutRate')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  unit === 'payoutRate'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                出玉率(機械割)
              </button>
            </div>
          </div>
        </div>

        {/* Calculation Model Selector & Year Tabs */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Profit Model Indicator */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5" />
              利益算出方式:
            </span>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-900/80 border border-indigo-500/50 text-indigo-100 text-xs font-bold rounded-lg shadow-xs">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              G数(IN枚数)連動モデル (ホール実務粗利)
            </div>
          </div>

          {/* Year Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs text-slate-400 mr-1 whitespace-nowrap">期間:</span>
            <button
              type="button"
              id="filter-year-all"
              onClick={() => setSelectedYear('all')}
              className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedYear === 'all'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              全期間{totalMonths > 0 ? ` (${totalMonths}ヶ月)` : ''}
            </button>
            {years.map((yr) => (
              <button
                key={yr}
                type="button"
                id={`filter-year-${yr}`}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {yr}年
              </button>
            ))}
          </div>
        </div>

        {/* Target Strategy Date Row (狙い日指定 & カレンダー選択) */}
        <div className="mt-4 pt-3.5 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-slate-800/40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 rounded-b-xl">
          <div className="flex items-center flex-wrap gap-2.5">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs sm:text-sm">
              <Target className="w-4 h-4 text-amber-400" />
              <span>🎯 狙い日指定:</span>
            </div>

            {/* Date Input */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-amber-400/80 transition-colors">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
              <input
                type="date"
                id="header-target-date-picker"
                value={targetDate}
                onChange={(e) => setTargetDate?.(e.target.value)}
                className="bg-transparent text-white text-xs sm:text-sm font-semibold focus:outline-hidden cursor-pointer color-scheme-dark"
                title="カレンダーから攻略狙い日を選択"
              />
              {targetDate && (
                <button
                  type="button"
                  onClick={() => setTargetDate?.('')}
                  className="text-slate-400 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                  title="狙い日の指定を解除"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Helper Shortcut Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <button
                type="button"
                id="btn-target-next-special"
                onClick={handleFindNextSpecial}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                title="店舗ルールから次の特日を自動判定して指定"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                次回特日
              </button>
              <button
                type="button"
                id="btn-target-tomorrow"
                onClick={handleSetTomorrow}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
              >
                明日
              </button>
              <button
                type="button"
                id="btn-target-today"
                onClick={handleSetToday}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
              >
                本日
              </button>
              {targetDate && (
                <button
                  type="button"
                  id="btn-target-clear"
                  onClick={() => setTargetDate?.('')}
                  className="px-2 py-1 text-slate-400 hover:text-rose-300 text-xs transition-colors cursor-pointer"
                >
                  クリア
                </button>
              )}
            </div>
          </div>

          {/* Active Target Date Status & Action */}
          {targetDate ? (
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-xs flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                  isTargetSpecial
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  {isTargetSpecial ? '★特日判定' : '通常営業日'}
                </span>
                {targetDayTail !== null && (
                  <span className="bg-slate-800 text-cyan-300 px-2 py-0.5 rounded border border-slate-700 text-xs font-semibold">
                    末尾 <strong>{targetDayTail}</strong>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('target-date-ranking');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="px-3 py-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 text-xs font-black rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>🎯 狙い台ランキングを表示</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 hidden lg:inline">
              ※ カレンダーで狙い日（稼働予定日）を指定すると、過去データに基づく高設定狙い台・おすすめ機種ランキングを自動算出します
            </span>
          )}
        </div>
      </div>

      {/* Special Day Rule Edit Modal */}
      <SpecialDayRuleModal
        isOpen={isRuleModalOpen}
        storeName={storeInfo.name}
        currentRuleText={storeInfo.oldEventDays || ''}
        onClose={() => setIsRuleModalOpen(false)}
        onSave={(newRuleText) => {
          onChangeOldEventDays?.(newRuleText);
        }}
      />
    </header>
  );
};
