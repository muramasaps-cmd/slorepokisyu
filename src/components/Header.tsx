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
  onChangeOldEventDays?: (newRuleText: string, newIslandConfig?: string) => void;
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
    <header className="bg-slate-900 text-white border-b border-slate-800 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
          {/* Left: Brand + Store Profile info */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <Building2 className="w-4 h-4" />
              </span>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>{storeInfo.name}</span>
                <span className="text-xs font-normal text-amber-400/90 hidden sm:inline">月別利益推移</span>
              </h1>
            </div>

            {/* Store Quick Actions & Metadata */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
              <span className="hidden md:inline">·</span>
              <span className="hidden md:inline">約{storeInfo.totalMachinesApprox}台</span>
              <span className="hidden md:inline">·</span>
              <span className="text-slate-300 font-mono text-[11px] hidden sm:inline">{storeInfo.exchangeRate}</span>
              <span className="hidden sm:inline">·</span>
              <span className="text-slate-400 text-[11px] hidden lg:inline">{storeInfo.dataRange}</span>

              {/* Special Day Rule Button */}
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-400/50 transition-colors text-[11px] cursor-pointer"
                title="特日ルール（5のつく日・7のつく日・ゾロ目等）を変更"
              >
                <Target className="w-3 h-3 text-amber-400" />
                <span className="text-amber-300 font-semibold">{storeInfo.oldEventDays || '特日設定'}</span>
                <Pencil className="w-2.5 h-2.5 text-slate-400" />
              </button>

              {/* Switch Store / Import */}
              {onOpenStoreManager && (
                <button
                  type="button"
                  onClick={onOpenStoreManager}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors text-[11px] cursor-pointer"
                  title="他店舗への切り替えや新規HTML/CSVの取り込み"
                >
                  <Layers className="w-3 h-3 text-slate-400" />
                  <span>店舗切替/取込</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Mode Switchers (Perspective + Unit + Quick Target Date) */}
          <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end">
            {/* Perspective Switcher */}
            <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex text-xs">
              <button
                type="button"
                id="btn-perspective-hall"
                onClick={() => setPerspective('hall')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  perspective === 'hall'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="店舗粗利目線（+は店利益回収 / -は客勝ち還元）"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>ホール粗利</span>
              </button>
              <button
                type="button"
                id="btn-perspective-player"
                onClick={() => setPerspective('player')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  perspective === 'player'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="スロッター目線（+は客勝ち出玉獲得 / -は客負け）"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>スロッター収支</span>
              </button>
            </div>

            {/* Unit Switcher */}
            <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex text-xs">
              <button
                type="button"
                id="btn-unit-yen"
                onClick={() => setUnit('yen')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  unit === 'yen' ? 'bg-slate-700 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                円
              </button>
              <button
                type="button"
                id="btn-unit-coins"
                onClick={() => setUnit('coins')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  unit === 'coins' ? 'bg-slate-700 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                枚数
              </button>
              <button
                type="button"
                id="btn-unit-avg"
                onClick={() => setUnit('avgDiff')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  unit === 'avgDiff' ? 'bg-slate-700 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                台平均
              </button>
              <button
                type="button"
                id="btn-unit-payout"
                onClick={() => setUnit('payoutRate')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  unit === 'payoutRate' ? 'bg-slate-700 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                出率%
              </button>
            </div>

            {/* Target Date Mini Selector */}
            <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
              <span className="text-[11px] text-amber-400 font-bold whitespace-nowrap flex items-center gap-0.5">
                <Target className="w-3 h-3" />
                <span>狙い日:</span>
              </span>
              <input
                type="date"
                id="header-target-date-picker"
                value={targetDate}
                onChange={(e) => setTargetDate?.(e.target.value)}
                className="bg-transparent text-white text-xs font-semibold focus:outline-hidden cursor-pointer color-scheme-dark w-28"
                title="カレンダーから攻略狙い日を選択"
              />
              {targetDate ? (
                <button
                  type="button"
                  onClick={() => setTargetDate?.('')}
                  className="text-slate-400 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                  title="狙い日指定を解除"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-target-next-special"
                  onClick={handleFindNextSpecial}
                  className="text-[10px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors"
                  title="店舗ルールから次の特日を自動判定"
                >
                  次回特日
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Special Day Rule & Island Config Edit Modal */}
      <SpecialDayRuleModal
        isOpen={isRuleModalOpen}
        storeName={storeInfo.name}
        currentRuleText={storeInfo.oldEventDays || ''}
        currentIslandConfig={storeInfo.islandConfig || ''}
        onClose={() => setIsRuleModalOpen(false)}
        onSave={(newRuleText, newIslandConfig) => {
          onChangeOldEventDays?.(newRuleText, newIslandConfig);
        }}
      />
    </header>
  );
};
