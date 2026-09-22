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
} from 'lucide-react';
import { SpecialDayRuleModal } from './SpecialDayRuleModal';

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
}) => {
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const lendYen = storeInfo.rateLend ? (1000 / storeInfo.rateLend).toFixed(2) : '21.74';
  const exchYen = storeInfo.rateExchange ? (1000 / storeInfo.rateExchange).toFixed(2) : '19.23';

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
