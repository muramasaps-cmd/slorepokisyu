import React, { useState, useMemo } from 'react';
import { StoreProfile } from '../data/types';
import {
  calculateCrossStoreRanking,
  CrossStoreRankingResult,
  CrossMetricMode,
  CrossStoreModelRank,
  CrossStoreMachineRank,
} from '../utils/crossStoreRanking';
import { formatNumber, formatYen } from '../utils/formatters';
import {
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Trophy,
  Coins,
  Cpu,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';

interface CrossStoreTargetProps {
  stores: StoreProfile[];
  initialTargetDate?: string;
  onSelectStore?: (storeId: string) => void;
  activeFilterLabel?: string;
  isModelFilterActive?: boolean;
}

export const CrossStoreTarget: React.FC<CrossStoreTargetProps> = ({
  stores,
  initialTargetDate,
  onSelectStore,
  activeFilterLabel,
  isModelFilterActive,
}) => {
  // Target Date state: Default to tomorrow or initial target date
  const [targetDate, setTargetDate] = useState<string>(() => {
    if (initialTargetDate) return initialTargetDate;
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().slice(0, 10);
  });

  // Selected stores (default all)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() =>
    stores.map((s) => s.id)
  );

  // Metric mode: diffCoins vs yen
  const [metricMode, setMetricMode] = useState<CrossMetricMode>('diffCoins');

  // Display count: 10 vs 20 vs 50
  const [displayCount, setDisplayCount] = useState<number>(20);

  // Active view: 'models' | 'machines'
  const [rankingView, setRankingView] = useState<'models' | 'machines'>('models');

  // Heavy computation memoized
  const rankingResult: CrossStoreRankingResult = useMemo(() => {
    return calculateCrossStoreRanking(stores, targetDate, {
      metricMode,
      topModelCount: displayCount,
      topMachineCount: displayCount,
      selectedStoreIds,
    });
  }, [stores, targetDate, metricMode, displayCount, selectedStoreIds]);

  const toggleStore = (id: string) => {
    if (selectedStoreIds.includes(id)) {
      if (selectedStoreIds.length <= 1) return; // Keep at least 1
      setSelectedStoreIds(selectedStoreIds.filter((sid) => sid !== id));
    } else {
      setSelectedStoreIds([...selectedStoreIds, id]);
    }
  };

  // When only 1 store exists
  const isSingleStore = stores.length <= 1;

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* 1. Header Banner & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Trophy className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                店舗横断 狙い台・狙い機種ランキング
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              複数ホールの過去実績・特日周期・換金率を横断評価し、指定来店日に最も期待値の高いホールと台を同時抽出
            </p>
          </div>

          {/* Quick Target Date Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0 self-start md:self-auto text-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="font-bold text-slate-700">来店日:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-900 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Model Filter Active Banner */}
        {isModelFilterActive && (
          <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl text-indigo-950 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-600 text-white font-extrabold text-2xs rounded-full">
                ヘッダ機種絞込適用中
              </span>
              <span className="font-bold">
                対象機種: <span className="text-indigo-900 font-black">「{activeFilterLabel}」</span> のみを対象に全店舗の狙い台・狙い機種を再算出中
              </span>
            </div>
            <span className="text-indigo-700 text-[11px]">
              ※ ヘッダの機種セレクタから全機種・別機種に切り替え可能
            </span>
          </div>
        )}

        {/* Single store guidance notice */}
        {isSingleStore && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              現在1店舗のみが登録されています。「店舗切替/取込」メニューから複数のホールデータを取り込むと、来店日にどの店舗のどの機種・台を狙うべきか全店横断で総合比較できるようになります。
            </p>
          </div>
        )}

        {/* Controls Toolbar: Stores selector + Metric Mode + Display count */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs pt-1">
          {/* Target Stores Pills */}
          <div className="space-y-1.5 flex-1">
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
              対象店舗の選択 ({selectedStoreIds.length}/{stores.length}店舗):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {stores.map((s) => {
                const isSelected = selectedStoreIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStore(s.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{s.name}</span>
                    <span className="text-[10px] opacity-70">
                      ({s.exchangeRate || `${s.rateExchange || 52}枚`})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Metric Mode Toggle & Count */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-end shrink-0">
            {/* Metric Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 font-bold">
              <button
                type="button"
                onClick={() => setMetricMode('diffCoins')}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer ${
                  metricMode === 'diffCoins'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                期待差枚 (枚)
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('yen')}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer ${
                  metricMode === 'yen'
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="各店の交換率（等価〜非等価）を反映した期待収支（円）順"
              >
                期待収支 (円換算)
              </button>
            </div>

            {/* Display Count Select */}
            <select
              value={displayCount}
              onChange={(e) => setDisplayCount(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value={10}>上位 10 件</option>
              <option value={20}>上位 20 件</option>
              <option value={50}>上位 50 件</option>
            </select>
          </div>
        </div>

        {/* Excluded Stores Notice (if any) */}
        {rankingResult.excludedStores.length > 0 && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-bold text-slate-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>自動除外された店舗 ({rankingResult.excludedStores.length}店):</span>
            </div>
            <ul className="list-disc list-inside text-[11px] text-slate-500 space-y-0.5 pl-1">
              {rankingResult.excludedStores.map((ex) => (
                <li key={ex.storeId}>
                  <strong className="text-slate-700">{ex.storeName}:</strong> {ex.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 2. Sub-tab View Switcher: 狙う機種 vs 狙う台 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRankingView('models')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              rankingView === 'models'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>横断 狙い機種ランキング ({rankingResult.modelRankings.length}件)</span>
          </button>
          <button
            type="button"
            onClick={() => setRankingView('machines')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              rankingView === 'machines'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>横断 狙い台(台番別)ランキング ({rankingResult.machineRankings.length}件)</span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 hidden sm:inline">
          ※ {metricMode === 'yen' ? '各店舗の換金率を反映した期待収支(円)順' : '期待差枚・スコア順'}
        </span>
      </div>

      {/* 3. Models Ranking View */}
      {rankingView === 'models' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 text-slate-600 text-[11px] border-b border-slate-200 uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold w-12 text-center">順位</th>
                  <th className="px-4 py-3 font-bold">店舗名</th>
                  <th className="px-4 py-3 font-bold">機種名</th>
                  <th className="px-3 py-3 text-right font-bold">台数</th>
                  <th className="px-3 py-3 text-right font-bold">
                    {metricMode === 'yen' ? '期待収支 (円)' : '期待差枚 (枚)'}
                  </th>
                  <th className="px-3 py-3 text-right font-bold">勝率</th>
                  <th className="px-3 py-3 text-right font-bold">機械割</th>
                  <th className="px-4 py-3 font-bold">選定理由・根拠</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankingResult.modelRankings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      該当する機種ランキングデータがありません。
                    </td>
                  </tr>
                ) : (
                  rankingResult.modelRankings.map((m) => (
                    <tr key={`${m.storeId}-${m.modelName}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-center font-black">
                        <span
                          className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs ${
                            m.rank === 1
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : m.rank === 2
                              ? 'bg-slate-300 text-slate-900 font-bold'
                              : m.rank === 3
                              ? 'bg-amber-700 text-white font-bold'
                              : 'text-slate-600'
                          }`}
                        >
                          #{m.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{m.storeName}</span>
                          {m.isSpecialDay && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-black">
                              特日
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-black text-indigo-700">
                        {m.modelName}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600">
                        {m.totalMachines}台
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-black text-sm">
                        {metricMode === 'yen' ? (
                          <span className={m.expectedYenProfit >= 0 ? 'text-amber-700' : 'text-rose-600'}>
                            {m.expectedYenProfit >= 0 ? `+${formatYen(m.expectedYenProfit)}` : formatYen(m.expectedYenProfit)}
                          </span>
                        ) : (
                          <span className={m.expectedDiffCoins >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                            {m.expectedDiffCoins >= 0 ? `+${m.expectedDiffCoins}` : m.expectedDiffCoins}枚
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-700 font-bold">
                        {m.predictedWinRate}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-600">
                        {m.predictedPayoutRate}%
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                        {m.tacticalReason || `過去同条件${m.sampleDays}日の出玉実績`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Individual Machines Ranking View */}
      {rankingView === 'machines' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 text-slate-600 text-[11px] border-b border-slate-200 uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold w-12 text-center">順位</th>
                  <th className="px-4 py-3 font-bold">店舗名</th>
                  <th className="px-3 py-3 font-bold">台番</th>
                  <th className="px-4 py-3 font-bold">機種名</th>
                  <th className="px-3 py-3 text-center font-bold">信頼度</th>
                  <th className="px-3 py-3 text-right font-bold">
                    {metricMode === 'yen' ? '期待収支 (円)' : '期待差枚 (枚)'}
                  </th>
                  <th className="px-3 py-3 text-right font-bold">総合スコア</th>
                  <th className="px-4 py-3 font-bold">主要根拠</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankingResult.machineRankings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      台番号別のランキングデータが存在しません（台番明細データを含む店舗をご利用ください）。
                    </td>
                  </tr>
                ) : (
                  rankingResult.machineRankings.map((mach) => (
                    <tr key={`${mach.storeId}-${mach.machineNum}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-center font-black">
                        <span
                          className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs ${
                            mach.rank === 1
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : mach.rank === 2
                              ? 'bg-slate-300 text-slate-900 font-bold'
                              : mach.rank === 3
                              ? 'bg-amber-700 text-white font-bold'
                              : 'text-slate-600'
                          }`}
                        >
                          #{mach.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{mach.storeName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono font-black text-slate-900 text-sm">
                        {mach.machineNum}番
                        {mach.islandName && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {mach.islandName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-700">
                        {mach.modelName}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${
                            mach.confidence === '高'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : mach.confidence === '中'
                              ? 'bg-amber-50 text-amber-700 border-amber-300'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                        >
                          {mach.confidence} (根拠{mach.evidenceDays}日)
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-black text-sm">
                        {metricMode === 'yen' ? (
                          <span className={mach.expectedYenProfit >= 0 ? 'text-amber-700' : 'text-rose-600'}>
                            {mach.expectedYenProfit >= 0 ? `+${formatYen(mach.expectedYenProfit)}` : formatYen(mach.expectedYenProfit)}
                          </span>
                        ) : (
                          <span className={mach.expectedDiffCoins >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                            {mach.expectedDiffCoins >= 0 ? `+${mach.expectedDiffCoins}` : mach.expectedDiffCoins}枚
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-800">
                        {mach.totalScore >= 0 ? `+${mach.totalScore}` : mach.totalScore}pt
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="space-y-0.5">
                          {mach.reasons.map((r, rIdx) => (
                            <div key={rIdx} className="truncate max-w-xs">
                              • {r}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
