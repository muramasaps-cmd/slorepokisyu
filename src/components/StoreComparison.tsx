import React, { useState, useMemo } from 'react';
import { StoreProfile } from '../data/types';
import {
  compareStores,
  StoreComparisonResult,
  StorePerMachineMetrics,
} from '../utils/storeComparison';
import { formatNumber, formatYen } from '../utils/formatters';
import {
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  BarChart3,
  HelpCircle,
  Percent,
  Coins,
  Cpu,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface StoreComparisonProps {
  stores: StoreProfile[];
  onSelectStore?: (storeId: string) => void;
  activeFilterLabel?: string;
  isModelFilterActive?: boolean;
}

const STORE_COLORS = [
  '#4f46e5', // indigo
  '#059669', // emerald
  '#d97706', // amber
  '#e11d48', // rose
  '#0284c7', // sky
  '#7c3aed', // violet
];

export const StoreComparison: React.FC<StoreComparisonProps> = ({
  stores,
  onSelectStore,
  activeFilterLabel,
  isModelFilterActive,
}) => {
  // Store selection state (2 to 6 stores, default first min(6, stores.length) stores)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() => {
    return stores.slice(0, Math.min(6, stores.length)).map((s) => s.id);
  });

  // Period mode: 'common' (default) vs 'all'
  const [periodMode, setPeriodMode] = useState<'common' | 'all'>('common');

  // Filtered stores list for comparison
  const comparedStores = useMemo(() => {
    return stores.filter((s) => selectedStoreIds.includes(s.id));
  }, [stores, selectedStoreIds]);

  // Heavy comparison computation memoized
  const comparisonResult: StoreComparisonResult | null = useMemo(() => {
    if (comparedStores.length < 2) return null;
    return compareStores(comparedStores, { periodMode });
  }, [comparedStores, periodMode]);

  const toggleStore = (id: string) => {
    if (selectedStoreIds.includes(id)) {
      if (selectedStoreIds.length <= 2) return; // Keep at least 2 stores
      setSelectedStoreIds(selectedStoreIds.filter((sid) => sid !== id));
    } else {
      if (selectedStoreIds.length >= 6) return; // Max 6 stores
      setSelectedStoreIds([...selectedStoreIds, id]);
    }
  };

  if (stores.length < 2) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
        <Building2 className="w-10 h-10 text-slate-400 mx-auto" />
        <h3 className="text-base font-black text-slate-800">店舗比較には2店舗以上の登録が必要です</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          「店舗切替/取込」メニューから複数のホールデータ（スロレポHTMLまたはみんレポCSV）を取り込むと、店舗間の設定状況や出玉傾向を同一基準（台あたり指標）で横断比較できます。
        </p>
      </div>
    );
  }

  // Monthly trend merged data for Recharts
  const monthlyChartData = useMemo(() => {
    if (!comparisonResult) return [];
    const monthSet = new Set<string>();
    Object.values(comparisonResult.monthlyTrends).forEach((trends) => {
      trends.forEach((t) => monthSet.add(t.yearMonth));
    });
    const months = Array.from(monthSet).sort();

    return months.map((ym) => {
      const entry: Record<string, any> = { month: ym };
      comparedStores.forEach((s) => {
        const trend = (comparisonResult.monthlyTrends[s.id] || []).find((t) => t.yearMonth === ym);
        entry[s.name] = trend ? trend.avgDiffPerMachine : null;
      });
      return entry;
    });
  }, [comparisonResult, comparedStores]);

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Header & Controls Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                <Building2 className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                店舗間 総合比較（台あたり指標）
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              各店の設置台数差を標準化し、1台あたりの平均差枚・機械割・勝率・特日リフトを直接比較
            </p>
          </div>

          {/* Period Mode Segmented Control */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start md:self-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setPeriodMode('common')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodMode === 'common'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              共通期間のみ ({comparisonResult?.commonPeriod.commonDaysCount || 0}日)
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodMode === 'all'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              各店の全期間
            </button>
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
                対象機種: <span className="text-indigo-900 font-black">「{activeFilterLabel}」</span> に絞り込んで全店舗の指標（台あたり差枚・勝率・機械割・推移）を再算出中
              </span>
            </div>
            <span className="text-indigo-700 text-[11px]">
              ※ ヘッダの機種セレクタから全機種・別機種に切り替え可能
            </span>
          </div>
        )}

        {/* Store Selection Pills (2 to 6 stores) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">
              比較対象店舗を選択 (2〜6店舗、現在 {selectedStoreIds.length}店舗):
            </span>
            {periodMode === 'common' && comparisonResult?.commonPeriod.hasCommonPeriod && (
              <span className="text-[11px] text-slate-500">
                共通期間: {comparisonResult.commonPeriod.startDate} 〜{' '}
                {comparisonResult.commonPeriod.endDate}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {stores.map((s, idx) => {
              const isSelected = selectedStoreIds.includes(s.id);
              const colorIdx = comparedStores.findIndex((cs) => cs.id === s.id);
              const color = colorIdx >= 0 ? STORE_COLORS[colorIdx % STORE_COLORS.length] : '#94a3b8';

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStore(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span>{s.name}</span>
                  <span className="text-[10px] opacity-70">
                    {s.dailyRecords?.length === 0
                      ? '(対象機種なし)'
                      : `(${s.totalMachinesApprox}台)`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Warnings Banner if any */}
        {comparisonResult && comparisonResult.warnings.length > 0 && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1 text-xs text-amber-900">
            {comparisonResult.warnings.map((w, wIdx) => (
              <div key={wIdx} className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {comparisonResult && (
        <>
          {/* 1. Automated Machine-Generated Summary Statements */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>データに基づく各店舗の傾向要約（客観数値自動生成）</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {comparisonResult.summaryStatements.map((stm) => (
                <div
                  key={stm.storeId}
                  className="bg-white p-3 rounded-xl border border-indigo-100 text-slate-700 leading-relaxed shadow-2xs"
                >
                  {stm.statement}
                </div>
              ))}
            </div>
          </div>

          {/* 2. Primary Metrics Comparison Table (Per Machine Basis) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>主要指標 比較一覧表（台あたり基準）</span>
              </div>
              <span className="text-[11px] text-slate-400">※ +は客勝ち(還元) / -は回収</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 text-slate-600 text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">店舗名</th>
                    <th className="px-3 py-2.5 text-right font-bold">営業日数</th>
                    <th className="px-3 py-2.5 text-right font-bold">台あたり差枚</th>
                    <th className="px-3 py-2.5 text-right font-bold">出玉率(機械割)</th>
                    <th className="px-3 py-2.5 text-right font-bold">台勝率</th>
                    <th className="px-3 py-2.5 text-right font-bold">台平均G数</th>
                    <th className="px-3 py-2.5 text-right font-bold">特日リフト</th>
                    <th className="px-3 py-2.5 text-right font-bold">5千枚OVER率</th>
                    <th className="px-4 py-2.5 text-right font-bold bg-slate-100 text-slate-500">
                      [参考] 台粗利(円)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonResult.evaluatedStores.map((m, idx) => {
                    const color = STORE_COLORS[idx % STORE_COLORS.length];
                    return (
                      <tr key={m.storeId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span>{m.storeName}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">{m.daysCount}日</td>
                        <td
                          className={`px-3 py-3 text-right font-bold ${
                            m.avgDiffPerMachine > 0 ? 'text-blue-600' : 'text-rose-600'
                          }`}
                        >
                          {m.avgDiffPerMachine > 0 ? `+${m.avgDiffPerMachine}` : m.avgDiffPerMachine}
                          枚
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-800">
                          {m.payoutRate}%
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-700">
                          {m.winRate}%
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">
                          {formatNumber(m.avgGames)}G
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-bold ${
                            m.specialLift > 0 ? 'text-blue-600' : 'text-slate-500'
                          }`}
                        >
                          {m.specialLift > 0 ? `+${m.specialLift}` : m.specialLift}枚
                        </td>
                        <td className="px-3 py-3 text-right text-amber-700 font-bold">
                          {m.highPayout5kRate}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 bg-slate-50/50">
                          {formatYen(m.avgGModelHallProfitPerMachineDayYen)}/台日
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Statistical Significance Check (Bootstrap Confidence Intervals) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>店間差の統計的有意性判定（ブートストラップ95%信頼区間）</span>
              </div>
              <span className="text-[11px] text-slate-400">
                区間が0をまたがない場合は「差あり」と判定
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {comparisonResult.significanceTests.map((t, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                    t.isSignificant
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      {t.storeAName} vs {t.storeBName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-2xs font-black ${
                        t.isSignificant
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {t.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>差枚差 (A - B):</span>
                      <strong className="text-slate-900 font-mono">
                        {t.diffDiff >= 0 ? `+${t.diffDiff}` : t.diffDiff} 枚/台
                      </strong>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>95%信頼区間:</span>
                      <span className="font-mono">
                        [{t.ci95[0] >= 0 ? '+' : ''}
                        {t.ci95[0]}枚, {t.ci95[1] >= 0 ? '+' : ''}
                        {t.ci95[1]}枚]
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Monthly Trend Overlaid Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>月次推移の重ね合わせ折れ線（台あたり平均差枚）</span>
            </div>

            <div className="h-64 w-full">
              {monthlyChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                  月次推移データがありません
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val >= 0 ? '+' : ''}${val}枚/台`, '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {comparedStores.map((s, idx) => (
                      <Line
                        key={s.id}
                        type="monotone"
                        dataKey={s.name}
                        stroke={STORE_COLORS[idx % STORE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 5. Day of Week Heatmap Grid (店 × 曜日) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>店舗 × 曜日 ヒートマップ（台あたり平均差枚）</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-[11px]">
                    <th className="p-2.5 text-left">店舗名</th>
                    {['月', '火', '水', '木', '金', '土', '日'].map((dow) => (
                      <th key={dow} className="p-2.5 font-bold">
                        {dow}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparedStores.map((s) => {
                    const dowStats = comparisonResult.dowHeatmaps[s.id] || [];
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="p-2.5 text-left font-bold text-slate-900">{s.name}</td>
                        {dowStats.map((d) => {
                          const diff = d.avgDiffPerMachine;
                          let bg = 'bg-slate-50 text-slate-600';
                          if (diff >= 300) bg = 'bg-blue-600 text-white font-bold';
                          else if (diff >= 100) bg = 'bg-blue-100 text-blue-900 font-bold';
                          else if (diff <= -300) bg = 'bg-rose-600 text-white font-bold';
                          else if (diff <= -100) bg = 'bg-rose-100 text-rose-900 font-bold';

                          return (
                            <td key={d.dayOfWeek} className="p-1.5">
                              <div className={`p-2 rounded-lg text-xs ${bg}`}>
                                {diff >= 0 ? `+${diff}` : diff}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 6. Category Composition & Common Models Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Category Composition */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>機種カテゴリ構成比 & 成績（スマスロ / ジャグラー等）</span>
              </div>

              <div className="space-y-3">
                {comparedStores.map((s) => {
                  const cats = comparisonResult.categoryCompositions[s.id] || [];
                  return (
                    <div key={s.id} className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                      <div className="font-bold text-slate-900 flex justify-between">
                        <span>{s.name}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {cats.map((c) => (
                          <div key={c.category} className="bg-white p-2 rounded-lg border border-slate-200">
                            <span className="text-[10px] text-slate-500 block truncate">
                              {c.category}
                            </span>
                            <div className="font-bold text-slate-900">{c.sharePercent}%</div>
                            <div
                              className={`text-[11px] font-bold ${
                                c.avgDiffPerMachine > 0 ? 'text-blue-600' : 'text-rose-600'
                              }`}
                            >
                              {c.avgDiffPerMachine >= 0 ? `+${c.avgDiffPerMachine}` : c.avgDiffPerMachine}枚
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Common Models Comparison */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>共通機種ランキング（同一機種の店別成績）</span>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {comparisonResult.commonModels.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    共通設置機種がありません
                  </div>
                ) : (
                  comparisonResult.commonModels.map((cm) => (
                    <div
                      key={cm.modelName}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs"
                    >
                      <div className="font-bold text-indigo-900 flex justify-between">
                        <span>{cm.modelName}</span>
                        <span className="text-2xs text-slate-500">{cm.storesCount}店舗共通</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {cm.stores.map((st) => (
                          <div
                            key={st.storeId}
                            className="bg-white p-2 rounded-lg border border-slate-100 flex justify-between items-center"
                          >
                            <span className="font-medium text-slate-700 truncate max-w-[100px]">
                              {st.storeName}
                            </span>
                            <div className="text-right">
                              <span
                                className={`font-bold font-mono ${
                                  st.avgDiffCoins > 0 ? 'text-blue-600' : 'text-rose-600'
                                }`}
                              >
                                {st.avgDiffCoins >= 0 ? `+${st.avgDiffCoins}` : st.avgDiffCoins}枚
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                勝率{st.winRate}% / {st.payoutRate}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
