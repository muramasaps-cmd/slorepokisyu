import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreProfile } from '../data/types';
import {
  calculateCrossStoreRanking,
  CrossStoreRankingResult,
  CrossMetricMode,
  CrossStoreModelRank,
  CrossStoreMachineRank,
} from '../utils/crossStoreRanking';
import { runMachineBacktest } from '../utils/backtestEngine';
import { formatNumber, formatYen } from '../utils/formatters';
import type { CrossRankingWorkerRequest, CrossRankingWorkerResponse } from '../workers/crossRankingWorker';
import {
  Building2,
  Calendar,
  Layers,
  Sparkles,
  Trophy,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Play,
  RotateCw,
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
  activeFilterLabel,
  isModelFilterActive,
}) => {
  // Read initial values from URL hash if available (e.g. #cross?crossDate=2026-05-17&crossStores=store1,store2)
  const getHashParams = () => {
    try {
      const hash = window.location.hash.slice(1);
      const queryPart = hash.includes('?') ? hash.split('?')[1] : hash;
      const params = new URLSearchParams(queryPart);
      return {
        date: params.get('crossDate') || params.get('targetDate') || null,
        stores: params.get('crossStores')
          ? params.get('crossStores')!.split(',')
          : params.get('stores')
          ? params.get('stores')!.split(',')
          : null,
      };
    } catch (err) {
      console.warn('Failed to parse URL hash parameters:', err);
      return { date: null, stores: null };
    }
  };

  const hashParams = getHashParams();

  // Target Date state
  const [targetDate, setTargetDate] = useState<string>(() => {
    if (hashParams.date) return hashParams.date;
    if (initialTargetDate) return initialTargetDate;
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().slice(0, 10);
  });

  // Selected stores state
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() => {
    if (hashParams.stores && hashParams.stores.length > 0) {
      const validIds = hashParams.stores.filter((id) => stores.some((s) => s.id === id));
      if (validIds.length > 0) return validIds;
    }
    return stores.map((s) => s.id);
  });

  // Sync hash when targetDate or selectedStoreIds change
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      params.set('crossDate', targetDate);
      params.set('crossStores', selectedStoreIds.join(','));
      window.location.hash = `#cross?${params.toString()}`;
    } catch (err) {
      console.warn('Failed to update URL hash:', err);
    }
  }, [targetDate, selectedStoreIds]);

  // Metric mode: diffCoins vs yen
  const [metricMode, setMetricMode] = useState<CrossMetricMode>('diffCoins');

  // Display count: 10 vs 20 vs 50
  const [displayCount, setDisplayCount] = useState<number>(20);

  // Active view: 'models' | 'machines'
  const [rankingView, setRankingView] = useState<'models' | 'machines'>('models');

  // Low confidence toggle (Prompt 13: 既定で除外、トグルで表示)
  const [includeLowConfidence, setIncludeLowConfidence] = useState<boolean>(false);

  // Worker calculation & progress
  const [workerProgress, setWorkerProgress] = useState<{ percent: number; store?: string } | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Store backtest edge cache ({ [storeId]: { hasEdge: boolean; verdictMessage: string; evaluatedDays: number } })
  const [edgeCache, setEdgeCache] = useState<
    Record<string, { hasEdge: boolean; verdictMessage: string; evaluatedDays: number }>
  >(() => {
    try {
      const saved = localStorage.getItem('slorepo_cross_edge_cache');
      return saved ? JSON.parse(saved) : {};
    } catch (err) {
      console.warn('Failed to load edge cache from localStorage:', err);
      return {};
    }
  });

  const [testingStoreId, setTestingStoreId] = useState<string | null>(null);

  const runStoreEdgeTest = (store: StoreProfile) => {
    if (testingStoreId) return;
    setTestingStoreId(store.id);
    setTimeout(() => {
      try {
        const priorRecords = (store.dailyRecords || []).filter((r) => r.date < targetDate);
        const res = runMachineBacktest(priorRecords, store.specialDayRules, {
          topN: 10,
          minEvidenceDays: 3,
          bootstrapIterations: 1000,
        });

        const edgeInfo = {
          hasEdge: res.withFilter.hasEdge,
          verdictMessage: res.withFilter.verdictMessage,
          evaluatedDays: res.evaluatedDaysCount,
        };

        setEdgeCache((prev) => {
          const next = { ...prev, [store.id]: edgeInfo };
          try {
            localStorage.setItem('slorepo_cross_edge_cache', JSON.stringify(next));
          } catch (e) {
            console.warn('Failed to cache edge test result:', e);
          }
          return next;
        });
      } catch (err) {
        console.error('Error running machine backtest for store:', store.name, err);
      } finally {
        setTestingStoreId(null);
      }
    }, 50);
  };

  // Synchronous fallback / memoized ranking
  const [workerResult, setWorkerResult] = useState<CrossStoreRankingResult | null>(null);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/crossRankingWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      setWorkerProgress({ percent: 10 });

      worker.onmessage = (e: MessageEvent<CrossRankingWorkerResponse>) => {
        if (e.data.type === 'PROGRESS') {
          setWorkerProgress({ percent: e.data.progress, store: e.data.currentStore });
        } else if (e.data.type === 'RESULT') {
          setWorkerResult(e.data.result);
          setWorkerProgress(null);
        } else if (e.data.type === 'ERROR') {
          console.error('Cross ranking worker failed:', e.data.error);
          setWorkerProgress(null);
        }
      };

      const req: CrossRankingWorkerRequest = {
        type: 'CALCULATE_CROSS_RANKING',
        stores,
        targetDate,
        options: {
          metricMode,
          topModelCount: displayCount,
          topMachineCount: displayCount,
          selectedStoreIds,
          includeLowConfidence,
        },
      };
      worker.postMessage(req);

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch (err) {
      console.warn('Worker initialization failed, using sync calculateCrossStoreRanking:', err);
      setWorkerProgress(null);
    }
  }, [stores, targetDate, metricMode, displayCount, selectedStoreIds, includeLowConfidence]);

  // Synchronous calculation
  const syncResult: CrossStoreRankingResult = useMemo(() => {
    return calculateCrossStoreRanking(stores, targetDate, {
      metricMode,
      topModelCount: displayCount,
      topMachineCount: displayCount,
      selectedStoreIds,
      includeLowConfidence,
    });
  }, [stores, targetDate, metricMode, displayCount, selectedStoreIds, includeLowConfidence]);

  const rankingResult = workerResult || syncResult;

  const toggleStore = (id: string) => {
    if (selectedStoreIds.includes(id)) {
      if (selectedStoreIds.length <= 1) return; // Keep at least 1
      setSelectedStoreIds(selectedStoreIds.filter((sid) => sid !== id));
    } else {
      setSelectedStoreIds([...selectedStoreIds, id]);
    }
  };

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
          {/* Target Stores Pills with Backtest Edge Badges */}
          <div className="space-y-1.5 flex-1">
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
              対象店舗の選択 ({selectedStoreIds.length}/{stores.length}店舗) と台番バックテスト判定:
            </span>
            <div className="flex flex-wrap gap-2">
              {stores.map((s) => {
                const isSelected = selectedStoreIds.includes(s.id);
                const edgeInfo = edgeCache[s.id];
                const isTesting = testingStoreId === s.id;
                const hasMach = (s.dailyRecords || []).some((r) => r.machines && r.machines.length > 0);

                return (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-1.5 flex flex-col gap-1 transition-all ${
                      isSelected
                        ? 'bg-slate-900/5 border-slate-900/30'
                        : 'bg-white border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleStore(s.id)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${
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

                      {/* Store Edge Badge (Prompt 13 requirement 4) */}
                      {hasMach && (
                        <div className="flex items-center gap-1">
                          {edgeInfo ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-0.5 ${
                                edgeInfo.hasEdge
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                              title={edgeInfo.verdictMessage}
                            >
                              {edgeInfo.hasEdge ? (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  優位性あり
                                </>
                              ) : (
                                <>
                                  <HelpCircle className="w-2.5 h-2.5 text-slate-400" />
                                  優位性なし
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 border border-slate-200">
                              未検証
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => runStoreEdgeTest(s)}
                            disabled={isTesting}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 cursor-pointer disabled:opacity-50"
                            title="この店舗の台番バックテスト（優位性判定）を実行"
                          >
                            {isTesting ? (
                              <RotateCw className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Play className="w-2.5 h-2.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Metric Mode Toggle & Count & Low Confidence Toggle */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-end shrink-0">
            {/* Low Confidence Toggle */}
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={includeLowConfidence}
                onChange={(e) => setIncludeLowConfidence(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span className="font-bold">低信頼も表示</span>
            </label>

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

        {/* Worker Calculation Progress Bar */}
        {workerProgress !== null && (
          <div className="space-y-1 animate-in fade-in">
            <div className="flex justify-between text-[11px] text-slate-500 font-bold">
              <span>
                横断ランキングバックグラウンド計算中... {workerProgress.store ? `(${workerProgress.store})` : ''}
              </span>
              <span>{workerProgress.percent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 transition-all duration-200"
                style={{ width: `${workerProgress.percent}%` }}
              />
            </div>
          </div>
        )}

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
          ※ {metricMode === 'yen' ? '各店舗の換金率を反映した期待収支(円)降順' : '期待差枚(縮小済)降順'}
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
                  <th className="px-3 py-3 text-right font-bold">店内スコア</th>
                  <th className="px-4 py-3 font-bold">選定理由・根拠</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankingResult.modelRankings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
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
                            {m.expectedDiffCoins >= 0 ? `+${formatNumber(m.expectedDiffCoins)}` : formatNumber(m.expectedDiffCoins)}枚
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-700 font-bold">
                        {m.predictedWinRate}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-600">
                        {m.predictedPayoutRate}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-400 text-[11px]">
                        {m.compositeScore}pt
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-sm truncate" title={m.tacticalReason}>
                        {m.tacticalReason || '根拠が少ないため参考表示'}
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
                    {metricMode === 'yen' ? '期待収支 (円)' : '期待差枚 (縮小済)'}
                  </th>
                  <th className="px-3 py-3 text-right font-bold">店内スコア</th>
                  <th className="px-4 py-3 font-bold">選定理由・根拠</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankingResult.machineRankings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      {includeLowConfidence
                        ? '台番号別のランキングデータが存在しません。'
                        : '信頼度「中」以上の台番号別データがありません。「低信頼も表示」にチェックを入れると表示されます。'}
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
                          <span className={mach.shrunkDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                            {mach.shrunkDiff >= 0 ? `+${formatNumber(mach.shrunkDiff)}` : formatNumber(mach.shrunkDiff)}枚
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-400 text-[11px]">
                        {mach.totalScore >= 0 ? `+${mach.totalScore}` : mach.totalScore}pt
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="space-y-0.5">
                          {mach.reasons.map((r, rIdx) => (
                            <div key={rIdx} className="truncate max-w-sm" title={r}>
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
