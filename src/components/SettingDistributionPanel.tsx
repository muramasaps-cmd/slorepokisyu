import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DailyRecord,
  SpecialDayRules,
} from '../data/types';
import { isAType } from '../utils/modelFilterUtils';
import {
  ModelSettingSpec,
  SettingLevelSpec,
  EMPTY_SETTING_SPEC_TEMPLATE,
  validateModelSettingSpec,
  findSpecForModel,
  loadAllSettingSpecs,
  loadAllSettingSpecsSync,
  saveModelSettingSpec,
  deleteModelSettingSpec,
  exportSettingSpecsAsJson,
  importSettingSpecsFromJson,
} from '../utils/settingSpecs';
import {
  estimateModelSettingDistribution,
  ModelEstimationResult,
} from '../utils/settingEstimation';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  Target,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  BarChart3,
  Calendar,
  Hash,
  Download,
  Upload,
  Plus,
  Trash2,
  X,
  Info,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface SettingDistributionPanelProps {
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  selectedModelName?: string;
  onSelectModelName?: (modelName: string) => void;
}

// 設定ごとの標準カラーパレット
const SETTING_COLORS: Record<string, string> = {
  設定1: '#94a3b8', // slate-400
  設定2: '#60a5fa', // blue-400
  設定3: '#34d399', // emerald-400
  設定4: '#facc15', // yellow-400
  設定5: '#fb923c', // orange-400
  設定6: '#f43f5e', // rose-500
  設定L: '#64748b',
  設定H: '#c084fc',
};

const DEFAULT_FALLBACK_COLORS = [
  '#94a3b8',
  '#60a5fa',
  '#34d399',
  '#facc15',
  '#fb923c',
  '#f43f5e',
  '#a855f7',
  '#ec4899',
];

export const SettingDistributionPanel: React.FC<SettingDistributionPanelProps> = ({
  dailyRecords,
  specialDayRules,
  selectedModelName: controlledModelName,
  onSelectModelName,
}) => {
  // 1. 店舗データ内に存在するすべてのAタイプ機種名を抽出
  const aTypeModelNames = useMemo(() => {
    const names = new Set<string>();
    for (const dr of dailyRecords) {
      const mList = dr.machines || (dr as any).machineRecords;
      if (mList) {
        for (const mr of mList) {
          if (isAType(mr.modelName)) {
            names.add(mr.modelName);
          }
        }
      }
    }
    return Array.from(names).sort();
  }, [dailyRecords]);

  // 選択中機種
  const [internalModelName, setInternalModelName] = useState<string>(() => {
    return controlledModelName || aTypeModelNames[0] || '';
  });

  const activeModelName = controlledModelName || internalModelName;

  const handleSelectModel = (name: string) => {
    setInternalModelName(name);
    if (onSelectModelName) {
      onSelectModelName(name);
    }
  };

  // 2. 仕様テーブル一覧（IndexedDB + localStorage）
  const [allSpecs, setAllSpecs] = useState<ModelSettingSpec[]>(() => loadAllSettingSpecsSync());
  const [isSpecModalOpen, setIsSpecModalOpen] = useState<boolean>(false);
  const [editingSpec, setEditingSpec] = useState<ModelSettingSpec | null>(null);

  // 初回マウント時に非同期IndexedDBからリフレッシュ
  useEffect(() => {
    let mounted = true;
    loadAllSettingSpecs().then((specs) => {
      if (mounted) setAllSpecs(specs);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 選択機種に合致するスペック
  const currentSpec = useMemo(() => {
    return findSpecForModel(allSpecs, activeModelName);
  }, [allSpecs, activeModelName]);

  // 3. 推定オプション状態
  const [minGames, setMinGames] = useState<number>(3000);
  const [highThreshold, setHighThreshold] = useState<number>(4);
  const [useRecordedPayout, setUseRecordedPayout] = useState<boolean>(false);
  const [usePoissonBonus, setUsePoissonBonus] = useState<boolean>(false);
  const [poissonWeight, setPoissonWeight] = useState<number>(0.5);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // 画面内サブタブ ('distribution' | 'trends' | 'conditions' | 'machines')
  const [activeTab, setActiveTab] = useState<
    'distribution' | 'trends' | 'conditions' | 'machines'
  >('distribution');

  // 台番テーブルのソート状態
  const [tableSortField, setTableSortField] = useState<
    'highSettingProb' | 'expectedSetting' | 'daysCount' | 'avgPayoutRate' | 'avgGames' | 'machineNum'
  >('highSettingProb');
  const [tableSortAsc, setTableSortAsc] = useState<boolean>(false);

  // 4. EM推定実行 (useMemoでメモ化)
  const estimationResult: ModelEstimationResult = useMemo(() => {
    if (!activeModelName) {
      return {
        modelName: '',
        specFound: false,
        totalRecords: 0,
        evaluatedRecords: 0,
        excludedCount: 0,
        sigma: 0,
        meanGames: 0,
        discriminability: 0,
        isLowDiscriminability: false,
        converged: false,
        iterations: 0,
        distribution: [],
        highSettingOverallRate: 0,
        expectedSettingOverall: 0,
        machineEstimations: [],
        machineSummaries: [],
        conditionComparisons: [],
        dailyTrends: [],
        warnings: ['対象のAタイプ機種が選択されていません。'],
      };
    }

    return estimateModelSettingDistribution(activeModelName, dailyRecords, currentSpec, {
      minGames,
      highSettingThreshold: highThreshold,
      useRecordedPayoutRate: useRecordedPayout,
      usePoissonBonus,
      poissonWeight,
      specialDayRules,
      bootstrapReps: 500, // 高速レスポンスと精度の両立
      bootstrapSeed: 42,
    });
  }, [
    activeModelName,
    dailyRecords,
    currentSpec,
    minGames,
    highThreshold,
    useRecordedPayout,
    usePoissonBonus,
    poissonWeight,
    specialDayRules,
  ]);

  // 台番テーブルのソート済みリスト
  const sortedMachineSummaries = useMemo(() => {
    const list = [...estimationResult.machineSummaries];
    list.sort((a, b) => {
      const valA = a[tableSortField];
      const valB = b[tableSortField];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return tableSortAsc ? valA - valB : valB - valA;
      }
      return 0;
    });
    return list;
  }, [estimationResult.machineSummaries, tableSortField, tableSortAsc]);

  // モーダル管理: 仕様スペックの新規作成 / 編集
  const handleOpenCreateSpec = useCallback(
    (targetModelName?: string) => {
      const template: ModelSettingSpec = {
        modelName: targetModelName || activeModelName || '',
        aliases: [],
        source: '',
        settings: [
          { label: '設定1', settingNum: 1, payoutRate: 0 },
          { label: '設定2', settingNum: 2, payoutRate: 0 },
          { label: '設定3', settingNum: 3, payoutRate: 0 },
          { label: '設定4', settingNum: 4, payoutRate: 0 },
          { label: '設定5', settingNum: 5, payoutRate: 0 },
          { label: '設定6', settingNum: 6, payoutRate: 0 },
        ],
      };
      setEditingSpec(template);
      setIsSpecModalOpen(true);
    },
    [activeModelName]
  );

  const handleOpenEditSpec = useCallback(() => {
    if (currentSpec) {
      setEditingSpec(JSON.parse(JSON.stringify(currentSpec)));
    } else {
      handleOpenCreateSpec(activeModelName);
    }
    setIsSpecModalOpen(true);
  }, [currentSpec, activeModelName, handleOpenCreateSpec]);

  const handleSaveSpec = async (specToSave: ModelSettingSpec) => {
    await saveModelSettingSpec(specToSave);
    const updated = await loadAllSettingSpecs();
    setAllSpecs(updated);
    setIsSpecModalOpen(false);
    setEditingSpec(null);
  };

  const handleDeleteSpec = async (modelName: string) => {
    if (window.confirm(`機種「${modelName}」の仕様テーブルを削除しますか？`)) {
      await deleteModelSettingSpec(modelName);
      const updated = await loadAllSettingSpecs();
      setAllSpecs(updated);
      if (editingSpec?.modelName === modelName) {
        setEditingSpec(null);
        setIsSpecModalOpen(false);
      }
    }
  };

  // JSONインポート / エクスポート
  const handleExportJson = () => {
    const jsonStr = exportSettingSpecsAsJson(allSpecs);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atype_setting_specs_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const { imported, errors } = importSettingSpecsFromJson(text);
      if (errors.length > 0) {
        alert(`インポート結果:\n${errors.join('\n')}`);
      }
      if (imported.length > 0) {
        for (const sp of imported) {
          await saveModelSettingSpec(sp);
        }
        const refreshed = await loadAllSettingSpecs();
        setAllSpecs(refreshed);
        alert(`${imported.length}件の機種仕様を取り込みました。`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* 1. 機種選択 & 仕様テーブル管理ヘッダー */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white font-black shadow-2xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                Aタイプ 設定値分布推定 (EM法・仕様テーブル連動)
                <span className="text-[11px] font-normal text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  統計モデリング
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                完全3枚掛け（BET 3）前提の観測出率と登録仕様値から、EM法により設定混合比率と各台の事後確率を推定
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={handleOpenEditSpec}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-600" />
              <span>{currentSpec ? '仕様テーブル確認・編集' : '仕様テーブルを登録'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className={`p-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                showAdvancedOptions
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-300'
              }`}
              title="推定オプション設定"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 対象機種クイックセレクター */}
        {aTypeModelNames.length > 0 ? (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1">対象機種:</span>
            {aTypeModelNames.map((name) => {
              const isSelected = activeModelName === name;
              const hasSpec = !!findSpecForModel(allSpecs, name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelectModel(name)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : hasSpec
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{name}</span>
                  {!hasSpec && (
                    <span
                      className={`text-[10px] px-1 rounded ${
                        isSelected ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      未登録
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500 py-2">
            ※ 取り込みデータ内に Aタイプ (ノーマル機/ジャグラー系) の機種が見つかりませんでした。
          </div>
        )}

        {/* 5. 常時表示の注意文 (プロンプト必須要件) */}
        <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-2 text-xs text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">【統計的推定に関する注意事項】</span>
            <span>
              出率からの統計的な推定です。実際の設定を示すものではありません。回転数が少ない台は判別力が低くなります。
            </span>
          </div>
        </div>

        {/* 詳細オプションドロワー */}
        {showAdvancedOptions && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              <span>推定パラメータ詳細設定</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  最小回転数閾値 (既定 3000G)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={500}
                    max={8000}
                    step={500}
                    value={minGames}
                    onChange={(e) => setMinGames(Math.max(500, parseInt(e.target.value, 10) || 500))}
                    className="w-24 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-slate-900"
                  />
                  <span className="text-slate-500">G以上のみ対象</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">高設定判定閾値</label>
                <select
                  value={highThreshold}
                  onChange={(e) => setHighThreshold(parseInt(e.target.value, 10))}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 font-bold"
                >
                  <option value={4}>設定4以上 (既定)</option>
                  <option value={5}>設定5以上</option>
                  <option value={6}>設定6のみ</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">出率算出基準</label>
                <label className="flex items-center gap-2 cursor-pointer mt-1 text-slate-800">
                  <input
                    type="checkbox"
                    checked={useRecordedPayout}
                    onChange={(e) => setUseRecordedPayout(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>データ記載の出率を使用</span>
                </label>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  OFF時は 3枚掛け固定 (games×3 + diff) / (games×3) ×100
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                <input
                  type="checkbox"
                  checked={usePoissonBonus}
                  onChange={(e) => setUsePoissonBonus(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-bold">ボーナス回数ポアソン尤度を加味 (任意オプション)</span>
              </label>

              {usePoissonBonus && (
                <div className="flex items-center gap-2 text-slate-700">
                  <span>尤度割引重み λ:</span>
                  <input
                    type="number"
                    min={0.1}
                    max={1.0}
                    step={0.1}
                    value={poissonWeight}
                    onChange={(e) => setPoissonWeight(parseFloat(e.target.value) || 0.5)}
                    className="w-16 px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold"
                  />
                  <span className="text-[11px] text-slate-400">(既定 0.5)</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. 仕様テーブル未登録時の案内ビュー */}
      {!currentSpec ? (
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h4 className="text-base font-bold text-slate-900">
              「{activeModelName || '選択機種'}」の仕様値が未登録です
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              設定ごとの機械割などの仕様値はコード内に事前登録されていないため、仕様テーブルに機械割（出玉率%）を登録することで、EM法による推定分布を表示できます。
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleOpenCreateSpec(activeModelName)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-2 shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>「{activeModelName}」の仕様値を登録する</span>
            </button>
            <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-2 border border-slate-300">
              <Upload className="w-4 h-4 text-slate-600" />
              <span>JSON仕様を取り込む</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
            </label>
          </div>
        </div>
      ) : (
        /* 3. 仕様テーブル登録済みの推定結果ビュー */
        <div className="space-y-4">
          {/* KPI サマリーバー */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block text-[11px]">推定全体平均設定</span>
              <span className="text-base font-black text-emerald-700 mt-0.5 block font-mono">
                設定 {estimationResult.expectedSettingOverall}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block text-[11px]">高設定(設定{highThreshold}+)比率</span>
              <span className="text-base font-black text-indigo-700 mt-0.5 block font-mono">
                {estimationResult.highSettingOverallRate}%
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block text-[11px]">評価台数 / 対象総数</span>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-base font-black text-slate-900 font-mono">
                  {estimationResult.evaluatedRecords}
                </span>
                <span className="text-[11px] text-slate-500">
                  / {estimationResult.totalRecords}台
                </span>
              </div>
              {estimationResult.excludedCount > 0 && (
                <span className="text-[10px] text-amber-600 block mt-0.5">
                  ({estimationResult.excludedCount}台 &lt;{minGames}G除外)
                </span>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block text-[11px]">平均回転数</span>
              <span className="text-base font-black text-slate-900 mt-0.5 block font-mono">
                {estimationResult.meanGames.toLocaleString()} G
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block text-[11px]">推定 σ (分散係数)</span>
              <span className="text-base font-black text-slate-800 mt-0.5 block font-mono">
                {estimationResult.sigma}
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block text-[11px]">判別力指標 D</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-base font-black text-slate-900 font-mono">
                  {estimationResult.discriminability}
                </span>
                {estimationResult.isLowDiscriminability ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
                    参考値
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                    良好
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 警告メッセージ表示 (乖離や収束未達等) */}
          {estimationResult.warnings.length > 0 && (
            <div className="space-y-1.5">
              {estimationResult.warnings.map((warn, wIdx) => (
                <div
                  key={wIdx}
                  className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* タブ切り替えバー */}
          <div className="flex border-b border-slate-200 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('distribution')}
              className={`pb-2.5 px-3.5 font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'distribution'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>設定の推定分布 (95%区間)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('trends')}
              className={`pb-2.5 px-3.5 font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'trends'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>日別推移 (100%積み上げ)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('conditions')}
              className={`pb-2.5 px-3.5 font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'conditions'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>条件別の比較 (特日・曜日・末尾)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('machines')}
              className={`pb-2.5 px-3.5 font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'machines'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>台番別サマリーテーブル ({sortedMachineSummaries.length}台)</span>
            </button>
          </div>

          {/* タブ 1: 設定の推定分布 (95%信頼区間棒グラフ) */}
          {activeTab === 'distribution' && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    設定混合比率 π の推定値と95%ブートストラップ区間
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    日単位ブロックブートストラップ（ブロック長7日、2000回）による95%信頼区間
                  </p>
                </div>
                <span className="text-[11px] font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                  適用スペック: {currentSpec.modelName} (
                  {currentSpec.source ? `出典: ${currentSpec.source}` : 'カスタム登録'})
                </span>
              </div>

              {/* 棒グラフ */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={estimationResult.distribution.map((d) => ({
                      label: `${d.label} (${d.payoutRate}%)`,
                      shortLabel: d.label,
                      ratioPct: Number((d.proportion * 100).toFixed(1)),
                      lowPct: Number((d.ci95[0] * 100).toFixed(1)),
                      highPct: Number((d.ci95[1] * 100).toFixed(1)),
                      payoutRate: d.payoutRate,
                    }))}
                    margin={{ top: 15, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="shortLabel" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis
                      unit="%"
                      domain={[0, 'auto']}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip
                      formatter={(val: any, _name: any, item: any) => [
                        `${val}% (95%区間: ${item.payload.lowPct}% 〜 ${item.payload.highPct}%)`,
                        `推定比率 [機械割 ${item.payload.payoutRate}%]`,
                      ]}
                    />
                    <Bar dataKey="ratioPct" name="推定比率" radius={[4, 4, 0, 0]}>
                      {estimationResult.distribution.map((d, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SETTING_COLORS[d.label] || DEFAULT_FALLBACK_COLORS[index % 8]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 設定別詳細表 */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">設定</th>
                      <th className="py-2 px-3 text-right">公表機械割</th>
                      <th className="py-2 px-3 text-right">推定混合比率 (π)</th>
                      <th className="py-2 px-3 text-center">95% 信頼区間</th>
                      <th className="py-2 px-right text-right">推定台数換算</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {estimationResult.distribution.map((d) => {
                      const estMachines = (
                        d.proportion * estimationResult.evaluatedRecords
                      ).toFixed(1);
                      return (
                        <tr key={d.label} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-sans font-bold text-slate-900 flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{
                                backgroundColor:
                                  SETTING_COLORS[d.label] || DEFAULT_FALLBACK_COLORS[0],
                              }}
                            />
                            <span>{d.label}</span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-800">
                            {d.payoutRate.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-right font-black text-emerald-700">
                            {(d.proportion * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-center text-slate-500">
                            [{(d.ci95[0] * 100).toFixed(1)}% 〜 {(d.ci95[1] * 100).toFixed(1)}%]
                          </td>
                          <td className="py-2 px-3 text-right text-slate-700">
                            約 {estMachines} 台
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* タブ 2: 日別推移 (100%積み上げ棒グラフ) */}
          {activeTab === 'trends' && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  日別 推定設定分布の推移 (100%積み上げ)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  各営業日の対象台における設定別事後確率の積み上げ構成比
                </p>
              </div>

              {estimationResult.dailyTrends.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={estimationResult.dailyTrends.map((dt) => {
                        const row: Record<string, any> = {
                          date: dt.date.slice(5),
                          fullDate: dt.date,
                          dayOfWeek: dt.dayOfWeek,
                          isSpecialDay: dt.isSpecialDay,
                          avgPayout: dt.avgPayoutRate,
                        };
                        for (const s of currentSpec.settings) {
                          row[s.label] = Number(((dt.distribution[s.label] || 0) * 100).toFixed(1));
                        }
                        return row;
                      })}
                      margin={{ top: 15, right: 10, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis
                        unit="%"
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [`${val}%`, name]}
                        labelFormatter={(lbl: any, payload: any) => {
                          const p = payload?.[0]?.payload;
                          if (!p) return lbl;
                          return `${p.fullDate} (${p.dayOfWeek}) ${
                            p.isSpecialDay ? '★特日' : ''
                          } / 実績出率: ${p.avgPayout}%`;
                        }}
                      />
                      <Legend />
                      {currentSpec.settings.map((s, sIdx) => (
                        <Bar
                          key={s.label}
                          dataKey={s.label}
                          stackId="a"
                          fill={SETTING_COLORS[s.label] || DEFAULT_FALLBACK_COLORS[sIdx % 8]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  日別データがありません。
                </div>
              )}
            </div>
          )}

          {/* タブ 3: 条件別の比較 (特日・曜日・末尾) */}
          {activeTab === 'conditions' && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  条件別 高設定（設定{highThreshold}以上）推定比率の比較と有意差判定
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  特日・通常日、曜日別、台番号末尾別の高設定投入傾向と統計的有意性検定（2標本割合Z検定）
                </p>
              </div>

              {estimationResult.conditionComparisons.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">分析軸 / 条件</th>
                        <th className="py-2.5 px-3 text-right">根拠台数</th>
                        <th className="py-2.5 px-3 text-right">設定{highThreshold}+ 比率</th>
                        <th className="py-2.5 px-3 text-right">対照群比率</th>
                        <th className="py-2.5 px-3 text-right">差分</th>
                        <th className="py-2.5 px-3 text-center">統計的有意性判定</th>
                        <th className="py-2.5 px-3 text-right">p値</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {estimationResult.conditionComparisons.map((c, idx) => {
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                              <span className="text-[10px] text-slate-500 font-normal block">
                                {c.conditionType === 'special_day'
                                  ? 'イベント日比較'
                                  : c.conditionType === 'day_of_week'
                                  ? '曜日別傾向'
                                  : '台番号末尾'}
                              </span>
                              <span>{c.categoryLabel}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {c.machineDaysCount} 台
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-indigo-700">
                              {c.highSettingRate}%
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500">
                              {c.baselineRate}%
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">
                              <span
                                className={
                                  c.diffRate > 0
                                    ? 'text-emerald-600'
                                    : c.diffRate < 0
                                    ? 'text-rose-600'
                                    : 'text-slate-500'
                                }
                              >
                                {c.diffRate > 0 ? `+${c.diffRate}` : c.diffRate}%
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {c.isSignificant ? (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                  <span>{c.significanceLabel}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                                  <span>{c.significanceLabel}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-400">
                              p = {c.pValue}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  条件別比較を行うのに十分なデータがありません。
                </div>
              )}
            </div>
          )}

          {/* タブ 4: 台番テーブル */}
          {activeTab === 'machines' && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    台番号ごとの推定平均設定・高設定確率一覧
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    台ごとの稼働日数、実績出率、最尤設定および設定{highThreshold}以上の期待確率
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  ヘッダークリックで昇順/降順ソート
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none cursor-pointer">
                    <tr>
                      <th
                        className="py-2 px-3"
                        onClick={() => {
                          setTableSortField('machineNum');
                          setTableSortAsc(!tableSortAsc);
                        }}
                      >
                        台番号
                      </th>
                      <th
                        className="py-2 px-3 text-right"
                        onClick={() => {
                          setTableSortField('daysCount');
                          setTableSortAsc(!tableSortAsc);
                        }}
                      >
                        根拠日数
                      </th>
                      <th
                        className="py-2 px-3 text-right"
                        onClick={() => {
                          setTableSortField('avgGames');
                          setTableSortAsc(!tableSortAsc);
                        }}
                      >
                        平均G数
                      </th>
                      <th
                        className="py-2 px-3 text-right"
                        onClick={() => {
                          setTableSortField('avgPayoutRate');
                          setTableSortAsc(!tableSortAsc);
                        }}
                      >
                        実績出率
                      </th>
                      <th
                        className="py-2 px-3 text-center"
                      >
                        最尤設定
                      </th>
                      <th
                        className="py-2 px-3 text-right"
                        onClick={() => {
                          setTableSortField('expectedSetting');
                          setTableSortAsc(!tableSortAsc);
                        }}
                      >
                        推定平均設定
                      </th>
                      <th
                        className="py-2 px-3 text-right"
                        onClick={() => {
                          setTableSortField('highSettingProb');
                          setTableSortAsc(!tableSortAsc);
                        }}
                      >
                        設定{highThreshold}+ 確率
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {sortedMachineSummaries.map((m) => {
                      const highProbPct = Number((m.highSettingProb * 100).toFixed(1));
                      return (
                        <tr key={m.machineNum} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900">
                            #{m.machineNum}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-700">
                            {m.daysCount} 日
                          </td>
                          <td className="py-2 px-3 text-right text-slate-700">
                            {m.avgGames.toLocaleString()} G
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900">
                            {m.avgPayoutRate}%
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-800">
                              {m.mostLikelySetting}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-emerald-700">
                            設定 {m.expectedSetting}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-indigo-700">
                            {highProbPct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. 仕様テーブル入力・編集モーダル */}
      {isSpecModalOpen && editingSpec && (
        <SettingSpecEditorModal
          spec={editingSpec}
          allSpecs={allSpecs}
          onSave={handleSaveSpec}
          onDelete={handleDeleteSpec}
          onClose={() => {
            setIsSpecModalOpen(false);
            setEditingSpec(null);
          }}
          onExportJson={handleExportJson}
          onImportJson={handleImportJsonFile}
        />
      )}
    </div>
  );
};

/* =====================================================================
 * Setting Spec Editor Modal Component (仕様テーブル入力・編集画面)
 * ===================================================================== */

interface SettingSpecEditorModalProps {
  spec: ModelSettingSpec;
  allSpecs: ModelSettingSpec[];
  onSave: (spec: ModelSettingSpec) => void;
  onDelete: (modelName: string) => void;
  onClose: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const SettingSpecEditorModal: React.FC<SettingSpecEditorModalProps> = ({
  spec: initialSpec,
  allSpecs,
  onSave,
  onDelete,
  onClose,
  onExportJson,
  onImportJson,
}) => {
  const [currentSpec, setCurrentSpec] = useState<ModelSettingSpec>(() =>
    JSON.parse(JSON.stringify(initialSpec))
  );

  const validation = useMemo(() => {
    return validateModelSettingSpec(currentSpec);
  }, [currentSpec]);

  const handleSettingChange = (
    index: number,
    field: keyof SettingLevelSpec,
    val: any
  ) => {
    const nextSettings = [...currentSpec.settings];
    nextSettings[index] = {
      ...nextSettings[index],
      [field]: val,
    };
    setCurrentSpec({ ...currentSpec, settings: nextSettings });
  };

  const handleAddSettingRow = () => {
    const nextIdx = currentSpec.settings.length + 1;
    setCurrentSpec({
      ...currentSpec,
      settings: [
        ...currentSpec.settings,
        { label: `設定${nextIdx}`, settingNum: nextIdx, payoutRate: 0 },
      ],
    });
  };

  const handleRemoveSettingRow = (index: number) => {
    if (currentSpec.settings.length <= 2) {
      alert('少なくとも2つ以上の設定が必要です。');
      return;
    }
    const nextSettings = currentSpec.settings.filter((_, idx) => idx !== index);
    setCurrentSpec({ ...currentSpec, settings: nextSettings });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white font-bold">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                機種仕様テーブル（機械割スペック）の登録・編集
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ブラウザ内の専用ストア（IndexedDB）に保存され、店舗データとは独立して管理されます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* 機種名 & 出典メモ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                機種名（正規化名）<span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={currentSpec.modelName}
                onChange={(e) =>
                  setCurrentSpec({ ...currentSpec, modelName: e.target.value })
                }
                placeholder="例: マイジャグラーV"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                出典・引用元メモ（任意）
              </label>
              <input
                type="text"
                value={currentSpec.source || ''}
                onChange={(e) =>
                  setCurrentSpec({ ...currentSpec, source: e.target.value })
                }
                placeholder="例: メーカー公式サイト、攻略情報"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800"
              />
            </div>
          </div>

          {/* 別名・エイリアス */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              別名・エイリアス（カンマ区切り、任意）
            </label>
            <input
              type="text"
              value={(currentSpec.aliases || []).join(', ')}
              onChange={(e) =>
                setCurrentSpec({
                  ...currentSpec,
                  aliases: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="例: マイジャグ5, マイジャグV, SマイジャグラーV"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800"
            />
          </div>

          {/* 設定一覧テーブル */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">
                設定別 機械割・ボーナス確率設定（設定1〜6、変則設定に対応）
              </span>
              <button
                type="button"
                onClick={handleAddSettingRow}
                className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>設定行を追加</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">設定ラベル</th>
                    <th className="py-2 px-2.5">機械割 (%)</th>
                    <th className="py-2 px-2.5">BIG確率分母 (任意)</th>
                    <th className="py-2 px-2.5">REG確率分母 (任意)</th>
                    <th className="py-2 px-2 text-center w-10">削除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {currentSpec.settings.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2.5">
                        <input
                          type="text"
                          value={s.label}
                          onChange={(e) =>
                            handleSettingChange(idx, 'label', e.target.value)
                          }
                          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded font-sans font-bold text-slate-900"
                        />
                      </td>
                      <td className="py-1.5 px-2.5">
                        <input
                          type="number"
                          step="0.1"
                          value={s.payoutRate || ''}
                          onChange={(e) =>
                            handleSettingChange(
                              idx,
                              'payoutRate',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="例: 97.0"
                          className="w-24 px-2 py-1 bg-white border border-slate-200 rounded font-bold text-slate-900"
                        />
                        <span className="ml-1 text-slate-500 font-sans">%</span>
                      </td>
                      <td className="py-1.5 px-2.5">
                        <span className="mr-1 text-slate-400 font-sans">1/</span>
                        <input
                          type="number"
                          step="0.1"
                          value={s.bbDenom || ''}
                          onChange={(e) =>
                            handleSettingChange(
                              idx,
                              'bbDenom',
                              parseFloat(e.target.value) || undefined
                            )
                          }
                          placeholder="273.1"
                          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-slate-800"
                        />
                      </td>
                      <td className="py-1.5 px-2.5">
                        <span className="mr-1 text-slate-400 font-sans">1/</span>
                        <input
                          type="number"
                          step="0.1"
                          value={s.rbDenom || ''}
                          onChange={(e) =>
                            handleSettingChange(
                              idx,
                              'rbDenom',
                              parseFloat(e.target.value) || undefined
                            )
                          }
                          placeholder="439.8"
                          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-slate-800"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveSettingRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          title="行を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* バリデーション警告 & エラー表示 */}
          {(!validation.isValid || validation.warnings.length > 0) && (
            <div className="space-y-1.5">
              {validation.errors.map((err, eIdx) => (
                <div
                  key={`err-${eIdx}`}
                  className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
              {validation.warnings.map((warn, wIdx) => (
                <div
                  key={`warn-${wIdx}`}
                  className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* JSON 取り込み / 書き出し */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportJson}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>全仕様をJSON書き出し</span>
              </button>
              <label className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded flex items-center gap-1 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>JSONを取り込む</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={onImportJson}
                  className="hidden"
                />
              </label>
            </div>

            {currentSpec.modelName &&
              allSpecs.some((s) => s.modelName === currentSpec.modelName) && (
                <button
                  type="button"
                  onClick={() => onDelete(currentSpec.modelName)}
                  className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                >
                  この機種仕様を削除
                </button>
              )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-800 font-bold text-xs cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!validation.isValid}
            onClick={() => onSave(currentSpec)}
            className={`px-5 py-2 rounded-lg font-bold text-xs text-white transition-all cursor-pointer ${
              validation.isValid
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-2xs'
                : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            仕様テーブルを保存
          </button>
        </div>
      </div>
    </div>
  );
};
