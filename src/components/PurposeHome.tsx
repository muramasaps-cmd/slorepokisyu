import React, { useMemo } from 'react';
import {
  Calendar,
  Cpu,
  Flame,
  Building2,
  BarChart3,
  Target,
  Layers,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { StoreProfile, DailyRecord, MonthlyStat } from '../data/types';
import { ActiveTab, AnalysisSubTab, TargetScope } from '../App';
import { formatNumber } from '../utils/formatters';
import { calculateConditionStats } from '../utils/conditionAnalysis';
import { analyzeHighPayoutMachines } from '../utils/highPayoutAnalytics';

export const SKIP_PURPOSE_HOME_STORAGE_KEY = 'slorepo_skip_purpose_home';

export function getSkipPurposeHome(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SKIP_PURPOSE_HOME_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSkipPurposeHome(skip: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SKIP_PURPOSE_HOME_STORAGE_KEY, skip ? 'true' : 'false');
  } catch {
    // Ignore storage errors in test or restricted iframe
  }
}

export interface PurposeHomeProps {
  purpose: 'analyze' | 'target';
  currentStore: StoreProfile | null;
  stores: StoreProfile[];
  dailyRecords: DailyRecord[];
  monthlyStats: MonthlyStat[];
  targetDate?: string;
  latestDataDate?: string;
  perspective?: 'hall' | 'player';
  skipHome: boolean;
  onToggleSkipHome: (skip: boolean) => void;
  onSelectQuestion: (
    tab: ActiveTab,
    options?: {
      subTab?: AnalysisSubTab;
      scope?: TargetScope;
      section?: string;
      viewMode?: 'chart' | 'table';
    }
  ) => void;
  onReturnToLastScreen?: () => void;
}

export interface QuestionCardDef {
  id: string;
  question: string;
  description: string;
  summaryLabel: string;
  summaryValue: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  onClick: () => void;
}

export const PurposeHome: React.FC<PurposeHomeProps> = ({
  purpose,
  currentStore,
  stores,
  dailyRecords,
  monthlyStats,
  targetDate = '',
  latestDataDate = '',
  perspective = 'player',
  skipHome,
  onToggleSkipHome,
  onSelectQuestion,
  onReturnToLastScreen,
}) => {
  // 1. Condition Analysis Summary (この店はいつ出す？)
  const conditionSummary = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) {
      return { text: 'データ未集計' };
    }
    const dowStats = calculateConditionStats(dailyRecords, 'dow', {
      perspective,
      oldEventDays: currentStore?.oldEventDays,
      specialDayRules: currentStore?.specialDayRules,
    });
    const validDows = dowStats.filter((d) => d.count > 0);
    if (validDows.length === 0) {
      return { text: 'データ不足' };
    }
    // Find highest average diff day of week
    const bestDow = [...validDows].sort((a, b) => b.avgDiffCoins - a.avgDiffCoins)[0];
    const diffSign = bestDow.avgDiffCoins >= 0 ? '+' : '';
    return {
      text: `最も強い曜日: ${bestDow.label} (${diffSign}${formatNumber(bestDow.avgDiffCoins)}枚)`,
    };
  }, [dailyRecords, perspective, currentStore]);

  // 2. Model Analysis Summary (どの機種が強い？)
  const modelSummary = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) {
      return { text: 'データ未集計' };
    }
    const modelMap = new Map<string, { totalDiff: number; totalMachines: number }>();
    for (const r of dailyRecords) {
      if (r.models) {
        for (const m of r.models) {
          const cur = modelMap.get(m.modelName) || { totalDiff: 0, totalMachines: 0 };
          cur.totalDiff += m.totalDiffCoins;
          cur.totalMachines += m.totalMachines;
          modelMap.set(m.modelName, cur);
        }
      }
    }
    const modelList = Array.from(modelMap.entries()).map(([name, stat]) => ({
      name,
      avgDiff: stat.totalMachines > 0 ? Math.round(stat.totalDiff / stat.totalMachines) : 0,
      totalMachines: stat.totalMachines,
    }));
    if (modelList.length === 0) {
      return { text: '機種データなし' };
    }
    modelList.sort((a, b) => b.avgDiff - a.avgDiff);
    const topModel = modelList[0];
    const diffSign = topModel.avgDiff >= 0 ? '+' : '';
    return {
      text: `最高差枚機種: ${topModel.name} (${diffSign}${formatNumber(topModel.avgDiff)}枚/台)`,
    };
  }, [dailyRecords]);

  // 3. High Payout Analysis Summary (高設定っぽい台の特徴は？)
  const highPayoutSummary = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) {
      return { text: 'データ未集計' };
    }
    const res = analyzeHighPayoutMachines(dailyRecords, {
      minPayoutRate: 105.0,
      minGames: 3000,
      minDiffCoins: 0,
      categoryFilter: 'all',
    });
    const total = res.allItems.length;
    const high = res.highItems.length;
    const rate = total > 0 ? ((high / total) * 100).toFixed(1) : '0.0';
    return {
      text: `高出率台割合: ${rate}% (計${high}台抽出)`,
    };
  }, [dailyRecords]);

  // 4. Store Comparison Summary (他の店と比べると？)
  const compareSummary = useMemo(() => {
    const storeCount = stores.length;
    if (storeCount <= 1) {
      return { text: `登録ホール: ${storeCount}店舗 (単一店分析中)` };
    }
    return {
      text: `登録ホール: 全${storeCount}店舗 (比較可能)`,
    };
  }, [stores]);

  // 5. Overview Summary (全体の収支は？)
  const overviewSummary = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) {
      return { text: 'データ未集計' };
    }
    let totalCoins = 0;
    let winDays = 0;
    for (const r of dailyRecords) {
      totalCoins += r.playerCoinProfit;
      if (r.playerCoinProfit > 0) winDays++;
    }
    const winRate = ((winDays / dailyRecords.length) * 100).toFixed(1);
    const sign = totalCoins >= 0 ? '+' : '';
    return {
      text: `累計差枚: ${sign}${formatNumber(totalCoins)}枚 (勝率 ${winRate}%)`,
    };
  }, [dailyRecords]);

  // Target Home Summaries
  const effectiveDate = targetDate || latestDataDate || new Date().toISOString().slice(0, 10);

  // Target Calendar Scan Summary (いつ行く？)
  const targetCalendarSummary = useMemo(() => {
    const isSpecial = currentStore?.oldEventDays || '特日設定あり';
    return {
      text: `指定日: ${effectiveDate} (${isSpecial})`,
    };
  }, [effectiveDate, currentStore]);

  // Target Store Summary (どの店に行く？)
  const targetStoreSummary = useMemo(() => {
    return {
      text: `店舗候補: 全${stores.length}店舗を横断評価`,
    };
  }, [stores]);

  // Target Model Summary (どの機種を打つ？)
  const targetModelSummary = useMemo(() => {
    // If top model in records
    if (!dailyRecords || dailyRecords.length === 0) {
      return { text: '機種期待値 集計中' };
    }
    return {
      text: `上位機種: ${modelSummary.text.replace('最高差枚機種: ', '')}`,
    };
  }, [dailyRecords, modelSummary]);

  // Target Machine Summary (どの台を打つ？)
  const targetMachineSummary = useMemo(() => {
    const hasMachines = dailyRecords?.some((r) => r.machines && r.machines.length > 0);
    if (!hasMachines) {
      return { text: '台番データ: 未取り込み (機種単位で予測)' };
    }
    return {
      text: '台番号別 期待差枚・末尾・据え置き予測算出済み',
    };
  }, [dailyRecords]);

  // Define the cards according to purpose (Prompt 48 requirements 1 & 2)
  const analyzeCards: QuestionCardDef[] = [
    {
      id: 'conditions',
      question: 'この店はいつ出す？',
      description: '曜日・のつく日・旧イベント日・末尾ごとの出玉傾向と強い特定日を特定',
      summaryLabel: '最新集計要約',
      summaryValue: conditionSummary.text,
      badge: '条件別分析',
      icon: Calendar,
      accentColor: 'amber',
      onClick: () => onSelectQuestion('analysis', { subTab: 'conditions' }),
    },
    {
      id: 'models',
      question: 'どの機種が強い？',
      description: '機種ごとのトータル差枚・平均機械割・高設定投入比率と推定配分',
      summaryLabel: '最新集計要約',
      summaryValue: modelSummary.text,
      badge: '機種別分析',
      icon: Cpu,
      accentColor: 'indigo',
      onClick: () => onSelectQuestion('analysis', { subTab: 'models' }),
    },
    {
      id: 'high_payout',
      question: '高設定っぽい台の特徴は？',
      description: '出率108%以上の高出率台が投入されやすい曜日や日付パターンの特徴を解明',
      summaryLabel: '最新集計要約',
      summaryValue: highPayoutSummary.text,
      badge: '高出率台分析',
      icon: Flame,
      accentColor: 'rose',
      onClick: () => onSelectQuestion('analysis', { subTab: 'high_payout' }),
    },
    {
      id: 'compare',
      question: '他の店と比べると？',
      description: '登録店舗同士の総差枚・客還元率・特定日実績を同一期間で横断比較',
      summaryLabel: '最新集計要約',
      summaryValue: compareSummary.text,
      badge: '店舗比較',
      icon: Building2,
      accentColor: 'cyan',
      onClick: () => onSelectQuestion('compare'),
    },
    {
      id: 'overview',
      question: '全体の収支は？',
      description: '月別推移グラフ・全体KPI・総合ヒートマップでホールの全体傾向を把握',
      summaryLabel: '最新集計要約',
      summaryValue: overviewSummary.text,
      badge: '店舗全体像',
      icon: BarChart3,
      accentColor: 'emerald',
      onClick: () => onSelectQuestion('overview'),
    },
  ];

  const targetCards: QuestionCardDef[] = [
    {
      id: 'calendar',
      question: 'いつ行く？',
      description: '全店横断のカレンダースキャンで強い旧イベント日・特日周期を探す',
      summaryLabel: '最新集計要約',
      summaryValue: targetCalendarSummary.text,
      badge: '来店日スキャン',
      icon: Calendar,
      accentColor: 'amber',
      onClick: () => onSelectQuestion('target', { scope: 'all', section: 'calendar' }),
    },
    {
      id: 'stores',
      question: 'どの店に行く？',
      description: '特日周期と過去の台番・機種期待値に基づくおすすめ店舗ランキング',
      summaryLabel: '最新集計要約',
      summaryValue: targetStoreSummary.text,
      badge: '店舗ランキング',
      icon: Building2,
      accentColor: 'indigo',
      onClick: () => onSelectQuestion('target', { scope: 'all', section: 'stores' }),
    },
    {
      id: 'models',
      question: 'どの機種を打つ？',
      description: '類似日の実績・機械割・投入傾向から算出した機種別期待差枚ランキング',
      summaryLabel: '最新集計要約',
      summaryValue: targetModelSummary.text,
      badge: '機種ランキング',
      icon: Cpu,
      accentColor: 'rose',
      onClick: () => onSelectQuestion('target', { section: 'models' }),
    },
    {
      id: 'machines',
      question: 'どの台を打つ？',
      description: '据え置き・上げ狙い・末尾特徴から算出した台番号別の詳細期待差枚',
      summaryLabel: '最新集計要約',
      summaryValue: targetMachineSummary.text,
      badge: '台番ランキング',
      icon: Layers,
      accentColor: 'emerald',
      onClick: () => onSelectQuestion('target', { section: 'machines' }),
    },
  ];

  const cards = purpose === 'analyze' ? analyzeCards : targetCards;
  const purposeTitle =
    purpose === 'analyze' ? '店舗を分析する ホーム' : '指定日の狙い台を決める ホーム';
  const purposeSubtitle =
    purpose === 'analyze'
      ? '何を知りたいか選んで、知りたい情報に直結する分析画面へ移動できます'
      : '来店当日の意思決定ステップに合わせて、狙い台予測を絞り込めます';

  return (
    <div
      className="space-y-4 sm:space-y-6 animate-in fade-in duration-150"
      data-testid={`purpose-home-${purpose}`}
    >
      {/* Top Header & Settings Row */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                <HelpCircle className="w-5 h-5 text-amber-600" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>{purposeTitle}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    質問から選ぶ
                  </span>
                </h2>
                <p className="text-xs text-slate-500">{purposeSubtitle}</p>
              </div>
            </div>
          </div>

          {/* Action buttons & Skip Home Setting Toggle (Prompt 48 Requirement 4) */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto text-xs">
            {onReturnToLastScreen && (
              <button
                type="button"
                onClick={onReturnToLastScreen}
                className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                data-testid="return-last-screen-btn"
              >
                直前の画面に戻る
              </button>
            )}

            {/* Toggle: ホームを表示しない */}
            <label
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer select-none"
              title="チェックを入れると、次回から入口を押した際にホームを飛ばして直前の画面を開きます"
            >
              <input
                type="checkbox"
                checked={skipHome}
                onChange={(e) => onToggleSkipHome(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
                data-testid="toggle-skip-home"
              />
              <span className="text-xs">設定でホームを表示しない</span>
            </label>
          </div>
        </div>

        {/* Current Store Info Bar */}
        {currentStore && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-2xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {currentStore.name}
              </span>
              <span>({currentStore.dataRange || 'データ取込済み'})</span>
            </div>
            {skipHome && (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-bold">
                ※ ホームスキップ有効中 (直前の画面へ自動復帰)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Question Cards Grid (Prompt 48 Requirements 1, 2 & 3) */}
      <div
        className={`grid grid-cols-1 ${
          purpose === 'analyze' ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'
        } gap-3 sm:gap-4`}
        data-testid="question-cards-grid"
      >
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              onClick={card.onClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  card.onClick();
                }
              }}
              data-testid={`question-card-${card.id}`}
              className="group bg-white rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-md transition-all p-4 sm:p-5 flex flex-col justify-between cursor-pointer space-y-3 relative overflow-hidden text-left"
            >
              {/* Top Row: Index Badge, Badge & Icon */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-700 text-xs font-black flex items-center justify-center transition-colors">
                    {idx + 1}
                  </span>
                  <span className="text-2xs font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {card.badge}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-amber-50 flex items-center justify-center transition-colors">
                  <Icon className="w-4 h-4 text-slate-500 group-hover:text-amber-600 transition-colors" />
                </div>
              </div>

              {/* Main Question & 1-line description (Requirement 3) */}
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900 group-hover:text-amber-600 transition-colors flex items-center justify-between">
                  <span>{card.question}</span>
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-amber-500 shrink-0" />
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">{card.description}</p>
              </div>

              {/* Summary of latest data (Requirement 3) */}
              <div className="pt-2 border-t border-slate-100">
                <div className="bg-slate-50/80 group-hover:bg-amber-50/40 p-2.5 rounded-xl border border-slate-200/70 transition-colors space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 block">
                    {card.summaryLabel}
                  </span>
                  <span
                    className="text-xs font-bold text-slate-800 font-mono block truncate"
                    data-testid={`summary-${card.id}`}
                  >
                    {card.summaryValue}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
