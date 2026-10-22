import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DailyRecord,
  SpecialDayRules,
} from '../data/types';
import { isAType } from '../utils/modelFilterUtils';
import { ConditionDimension } from '../utils/conditionAnalysis';
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
  calculateInWeightedPayoutRate,
  checkSurvivorBiasWarning,
  formatSettingCi95,
  runSensitivityAnalysis,
  SensitivityAnalysisResult,
  GameWeightMode,
  calculateRotationDependencyDiagnosis,
  checkDataVolumeWarnings,
  DEFAULT_SENSITIVITY_THRESHOLDS,
} from '../utils/settingEstimation';
import {
  executeSensitivityAnalysisAsync,
  computeSensitivityCacheKey,
  getSensitivityMemoryCache,
} from '../utils/sensitivityAnalysisService';
import {
  estimateModelSettingRange,
  calculateMultiModelCombinedEstimation,
  SettingRangeEstimationResult,
  CombinedMultiModelResult,
} from '../utils/settingRange';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
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
  FileText,
  Copy,
  Check,
  Scale,
  Loader2,
  Boxes,
  Clock,
  TrendingUp,
  Cpu,
  HelpCircle,
} from 'lucide-react';

const HelpTooltip: React.FC<{ text: string }> = ({ text }) => (
  <span className="relative group inline-flex items-center text-slate-400 hover:text-slate-600 cursor-help ml-1 align-middle">
    <HelpCircle className="w-3.5 h-3.5" />
    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 w-64 p-2 bg-slate-900 text-white text-[11px] font-normal leading-relaxed rounded-lg shadow-lg border border-slate-700 whitespace-normal text-left">
      {text}
    </span>
  </span>
);

interface SettingDistributionPanelProps {
  dailyRecords: DailyRecord[];
  specialDayRules?: SpecialDayRules;
  selectedModelName?: string;
  onSelectModelName?: (modelName: string) => void;
  onNavigateToConditions?: (dim?: ConditionDimension) => void;
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

const MACHINE_LINE_COLORS = [
  '#059669', // emerald-600
  '#2563eb', // blue-600
  '#d97706', // amber-600
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#4f46e5', // indigo-600
  '#ea580c', // orange-600
];

export const SettingDistributionPanel: React.FC<SettingDistributionPanelProps> = ({
  dailyRecords,
  specialDayRules,
  selectedModelName: controlledModelName,
  onSelectModelName,
  onNavigateToConditions,
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
  const [isPasteJsonModalOpen, setIsPasteJsonModalOpen] = useState<boolean>(false);

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
  const BOOTSTRAP_REPS = 500;
  const PRESET_MIN_GAMES = [
    { value: 0, label: '全台日(0)' },
    { value: 1000, label: '1,000G' },
    { value: 2000, label: '2,000G' },
    { value: 3000, label: '3,000G' },
    { value: 5000, label: '5,000G' },
  ];

  const [minGames, setMinGames] = useState<number>(0);
  const [inputMinGames, setInputMinGames] = useState<string>('0');
  const [gameWeightMode, setGameWeightMode] = useState<GameWeightMode>('raw');
  const [highThreshold, setHighThreshold] = useState<number>(4);
  const [useRecordedPayout, setUseRecordedPayout] = useState<boolean>(false);
  const [usePoissonBonus, setUsePoissonBonus] = useState<boolean>(false);
  const [poissonWeight, setPoissonWeight] = useState<number>(0.5);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // 対象機種の全レコード（回転数・差枚・出率・ボーナス）
  const modelRecords = useMemo(() => {
    const list: Array<{ games: number; diff: number; payoutRate?: number; bb?: number; rb?: number }> = [];
    if (!activeModelName) return list;
    for (const dr of dailyRecords) {
      const mList = dr.machines || (dr as any).machineRecords;
      if (mList) {
        for (const mr of mList) {
          if (mr.modelName === activeModelName) {
            list.push({
              games: mr.games,
              diff: mr.diff,
              payoutRate: mr.payoutRate,
              bb: mr.bb,
              rb: mr.rb,
            });
          }
        }
      }
    }
    return list;
  }, [dailyRecords, activeModelName]);

  // 実台数（異なる台番号のユニーク配列）
  const modelMachineNums = useMemo(() => {
    const set = new Set<number>();
    if (!activeModelName) return [];
    for (const dr of dailyRecords) {
      const mList = dr.machines || (dr as any).machineRecords;
      if (mList) {
        for (const mr of mList) {
          if (mr.modelName === activeModelName) {
            set.add(mr.machineNum);
          }
        }
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [dailyRecords, activeModelName]);

  const uniqueMachineCount = modelMachineNums.length;

  // ボーナス回数（BB・RB）データの有無
  const hasBonusData = useMemo(() => {
    return modelRecords.some(
      (r) => r.bb !== undefined && r.rb !== undefined && (r.bb > 0 || r.rb > 0)
    );
  }, [modelRecords]);

  // 回転数と出率の依存診断 (区間別出率 & Spearman相関)
  const rotationDependency = useMemo(() => {
    return calculateRotationDependencyDiagnosis(modelRecords);
  }, [modelRecords]);

  // 感度分析（Web Worker / setTimeout分割による非同期実行 + メモリキャッシュ）
  const [sensitivityResult, setSensitivityResult] = useState<SensitivityAnalysisResult | null>(null);
  const [isSensitivityCalculating, setIsSensitivityCalculating] = useState<boolean>(false);
  const [sensitivityProgress, setSensitivityProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!currentSpec || !activeModelName) {
      setSensitivityResult(null);
      setIsSensitivityCalculating(false);
      setSensitivityProgress(null);
      return;
    }

    const cacheKey = computeSensitivityCacheKey(
      activeModelName,
      dailyRecords,
      currentSpec,
      {
        highSettingThreshold: highThreshold,
        useRecordedPayoutRate: useRecordedPayout,
        usePoissonBonus,
        poissonWeight,
      }
    );
    const cached = getSensitivityMemoryCache(cacheKey);
    if (cached) {
      setSensitivityResult(cached);
      setIsSensitivityCalculating(false);
      setSensitivityProgress(null);
      return;
    }

    setSensitivityResult(null);
    setIsSensitivityCalculating(true);
    setSensitivityProgress(0);

    const handle = executeSensitivityAnalysisAsync(
      activeModelName,
      dailyRecords,
      currentSpec,
      {
        highSettingThreshold: highThreshold,
        useRecordedPayoutRate: useRecordedPayout,
        usePoissonBonus,
        poissonWeight,
      },
      DEFAULT_SENSITIVITY_THRESHOLDS,
      (completed) => {
        setSensitivityProgress(completed);
      }
    );

    handle.promise
      .then((res) => {
        setSensitivityResult(res);
        setIsSensitivityCalculating(false);
        setSensitivityProgress(null);
      })
      .catch((err) => {
        console.error('Sensitivity analysis error:', err);
        setIsSensitivityCalculating(false);
        setSensitivityProgress(null);
      });

    return () => {
      handle.cancel();
    };
  }, [
    activeModelName,
    dailyRecords,
    currentSpec,
    highThreshold,
    useRecordedPayout,
    usePoissonBonus,
    poissonWeight,
  ]);

  // 新しい主推定: 出率のみベースの設定範囲 & 平均設定相当 (足切りなし・全台日使用)
  const rangeEstimationResult: SettingRangeEstimationResult | null = useMemo(() => {
    if (!currentSpec || !activeModelName) return null;
    return estimateModelSettingRange(activeModelName, dailyRecords, currentSpec, {
      highThreshold,
      bootstrapReps: 2000,
      bootstrapSeed: 42,
    });
  }, [activeModelName, dailyRecords, currentSpec, highThreshold]);

  // 店舗内のスペック登録済みAタイプ機種一覧
  const availableSpecsForStore = useMemo(() => {
    return aTypeModelNames
      .map((name) => {
        const spec = findSpecForModel(allSpecs, name);
        return spec ? { modelName: name, spec } : null;
      })
      .filter((item): item is { modelName: string; spec: ModelSettingSpec } => item !== null);
  }, [aTypeModelNames, allSpecs]);

  const [isMultiModelModalOpen, setIsMultiModelModalOpen] = useState<boolean>(false);
  const [selectedMultiModelNames, setSelectedMultiModelNames] = useState<string[]>([]);
  const [rollingTrendMode, setRollingTrendMode] = useState<'7d' | '30d'>('7d');

  useEffect(() => {
    if (availableSpecsForStore.length > 0 && selectedMultiModelNames.length === 0) {
      setSelectedMultiModelNames(availableSpecsForStore.map((s) => s.modelName));
    }
  }, [availableSpecsForStore, selectedMultiModelNames.length]);

  const combinedMultiModelResult: CombinedMultiModelResult | null = useMemo(() => {
    if (selectedMultiModelNames.length === 0) return null;
    const selectedSpecs = availableSpecsForStore.filter((s) =>
      selectedMultiModelNames.includes(s.modelName)
    );
    if (selectedSpecs.length === 0) return null;
    return calculateMultiModelCombinedEstimation(selectedSpecs, dailyRecords, {
      reps: 2000,
      seed: 42,
    });
  }, [availableSpecsForStore, selectedMultiModelNames, dailyRecords]);

  const handleSelectPreset = (val: number) => {
    setMinGames(val);
    setInputMinGames(String(val));
  };

  const handleApplyInput = () => {
    const parsed = parseInt(inputMinGames, 10);
    const val = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setMinGames(val);
    setInputMinGames(String(val));
  };

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
      gameWeightMode,
      highSettingThreshold: highThreshold,
      useRecordedPayoutRate: useRecordedPayout,
      usePoissonBonus,
      poissonWeight,
      specialDayRules,
      bootstrapReps: BOOTSTRAP_REPS,
      bootstrapSeed: 42,
    });
  }, [
    activeModelName,
    dailyRecords,
    currentSpec,
    minGames,
    gameWeightMode,
    highThreshold,
    useRecordedPayout,
    usePoissonBonus,
    poissonWeight,
    specialDayRules,
  ]);

  // データ量・ボーナス有無に関する警告診断
  const dataVolumeWarnings = useMemo(() => {
    return checkDataVolumeWarnings(
      uniqueMachineCount,
      estimationResult.evaluatedRecords,
      hasBonusData,
      { warnOnNoBonus: false }
    );
  }, [uniqueMachineCount, estimationResult.evaluatedRecords, hasBonusData]);

  // IN加重出玉率（全体 & 絞り後）およびサバイバーシップバイアスの判定
  const { overallPayoutRate, filteredPayoutRate, survivorBias } = useMemo(() => {
    if (!activeModelName || modelRecords.length === 0) {
      return {
        overallPayoutRate: 100,
        filteredPayoutRate: 100,
        survivorBias: checkSurvivorBiasWarning(0, 0, 100, 100),
      };
    }
    const overall = calculateInWeightedPayoutRate(modelRecords);
    const filteredRecords = modelRecords.filter((r) => r.games >= minGames);
    const filtered = calculateInWeightedPayoutRate(filteredRecords);
    const bias = checkSurvivorBiasWarning(
      estimationResult.totalRecords,
      estimationResult.excludedCount,
      overall,
      filtered
    );
    return {
      overallPayoutRate: overall,
      filteredPayoutRate: filtered,
      survivorBias: bias,
    };
  }, [
    modelRecords,
    activeModelName,
    minGames,
    estimationResult.totalRecords,
    estimationResult.excludedCount,
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

  const handleImportJsonFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let totalImported = 0;
    const allErrors: string[] = [];
    const importedNames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const { imported, errors } = importSettingSpecsFromJson(text);
        if (errors.length > 0) {
          allErrors.push(`[${file.name}] ${errors.join(', ')}`);
        }
        for (const sp of imported) {
          await saveModelSettingSpec(sp);
          totalImported++;
          if (!importedNames.includes(sp.modelName)) {
            importedNames.push(sp.modelName);
          }
        }
      } catch (err: any) {
        allErrors.push(`[${file.name}] 読み込み失敗: ${err.message || String(err)}`);
      }
    }

    const refreshed = await loadAllSettingSpecs();
    setAllSpecs(refreshed);

    if (totalImported > 0) {
      alert(`合計 ${totalImported}件の機種仕様を取り込みました:\n${importedNames.join(', ')}${allErrors.length > 0 ? `\n\n一部スキップ:\n${allErrors.join('\n')}` : ''}`);
    } else if (allErrors.length > 0) {
      alert(`取り込みに失敗しました:\n${allErrors.join('\n')}`);
    }
  };

  const handleImportJsonText = async (text: string) => {
    const { imported, errors } = importSettingSpecsFromJson(text);
    if (imported.length > 0) {
      for (const sp of imported) {
        await saveModelSettingSpec(sp);
      }
      const refreshed = await loadAllSettingSpecs();
      setAllSpecs(refreshed);
    }
    return { imported, errors };
  };

  const isEmWarning = (warn: string): boolean => {
    return (
      warn.includes('設定の分布が平ら') ||
      warn.includes('σを固定した区間') ||
      warn.includes('反復上限で終了')
    );
  };

  const emWarnings = useMemo(() => {
    if (!estimationResult?.warnings) return [];
    return Array.from(new Set(estimationResult.warnings.filter(isEmWarning)));
  }, [estimationResult]);

  const nonEmWarnings = useMemo(() => {
    if (!estimationResult?.warnings) return [];
    return estimationResult.warnings.filter((w) => !isEmWarning(w));
  }, [estimationResult]);

  const isEmUnstable = useMemo(() => {
    if (!estimationResult) return false;
    return Boolean(
      estimationResult.pointEstimateReachedMaxIterations ||
        !estimationResult.converged ||
        (estimationResult.bootstrapMaxIterationsRate !== undefined &&
          estimationResult.bootstrapMaxIterationsRate > 0) ||
        !estimationResult.isCiCalculated ||
        estimationResult.warnings?.some(
          (w) => w.includes('設定の分布が平ら') || w.includes('反復上限で終了')
        )
    );
  }, [estimationResult]);

  const [isAlertsExpanded, setIsAlertsExpanded] = useState<boolean>(false);

  const allAlerts = useMemo(() => {
    const list: Array<{ id: string; type: 'warning' | 'info'; text: string }> = [];

    // 1. EM unstable alert
    if (isEmUnstable) {
      list.push({
        id: 'em-unstable',
        type: 'info',
        text: '設定の分布グラフ（EM推定）は参考値です。上の出率ベースの範囲を主にご覧ください',
      });
    }

    // 2. Survivor bias
    if (minGames > 0 || survivorBias.shouldWarn) {
      list.push({
        id: 'survivor-bias',
        type: 'warning',
        text: `回転数で絞ると、負けた台日が除かれて高設定側に偏ります。（除外台日: ${estimationResult?.excludedCount ?? 0}台日 / 全体の${((survivorBias?.excludedRatio ?? 0) * 100).toFixed(1)}%）`,
      });
    }

    // 3. Rotation dependency
    if (rotationDependency.isDependent) {
      list.push({
        id: 'rotation-dep',
        type: 'warning',
        text: `回転数が結果に依存しています（勝つ台ほど回ります）。出率だけの推定は高設定側に偏ります。（Spearman相関: ${rotationDependency.spearmanCorr !== null ? (rotationDependency.spearmanCorr >= 0 ? '+' : '') + rotationDependency.spearmanCorr.toFixed(2) : ''}）`,
      });
    }

    // 4. Sensitivity wide spread
    if (!isSensitivityCalculating && sensitivityResult?.isHighSensitivity) {
      list.push({
        id: 'high-sensitivity',
        type: 'warning',
        text: `条件によって結果が大きく変わります。この機種の設定分布は、参考程度にしてください。（変動幅: ${sensitivityResult.rateSpread}ポイント）`,
      });
    }

    // 5. Data volume notes
    if (dataVolumeWarnings.warnings.length > 0) {
      for (const [idx, w] of dataVolumeWarnings.warnings.entries()) {
        list.push({
          id: `vol-${idx}`,
          type: 'info',
          text: `${w.title}: ${w.message}`,
        });
      }
    }

    // 6. Non-EM warnings
    for (const [idx, w] of nonEmWarnings.entries()) {
      list.push({
        id: `non-em-${idx}`,
        type: 'warning',
        text: w,
      });
    }

    return list;
  }, [
    isEmUnstable,
    minGames,
    survivorBias,
    estimationResult,
    rotationDependency,
    isSensitivityCalculating,
    sensitivityResult,
    dataVolumeWarnings,
    nonEmWarnings,
  ]);

  return (
    <div className="space-y-4">
      {/* 1. 機種選択ヘッダー */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white font-black shadow-2xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-1">
                <span>Aタイプ 設定値分布推定</span>
                <HelpTooltip text="完全3枚掛け（BET 3）前提の観測出率と登録仕様値から設定分布を統計的に推定します。" />
                <span className="text-[11px] font-normal text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-1">
                  統計モデリング
                </span>
              </h3>
            </div>
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
      </div>

      {/* 2. データの注意 (集約バナー: 最大3行、それ以上は他◯件で展開) */}
      {allAlerts.length > 0 && (
        <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-2 text-xs text-amber-950 shadow-2xs">
          <div className="flex items-center justify-between font-bold text-amber-900 pb-1 border-b border-amber-200/60">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>データの注意（{allAlerts.length}件）</span>
            </div>
            {allAlerts.length > 3 && (
              <button
                type="button"
                onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                {isAlertsExpanded ? '折りたたむ' : `他${allAlerts.length - 3}件を表示`}
              </button>
            )}
          </div>
          <ul className="space-y-1.5 leading-relaxed">
            {(isAlertsExpanded ? allAlerts : allAlerts.slice(0, 3)).map((item) => (
              <li key={item.id} className="flex items-start gap-1.5">
                <span className="text-amber-600 font-bold shrink-0">・</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. 主表示 (出率ベースの設定範囲・平均設定相当・高設定の範囲、4つの数値カードと範囲バー、1行の注意文) */}
      {!currentSpec ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-sm font-bold text-slate-900">
              「{activeModelName || '選択機種'}」の仕様値が未登録です
            </h4>
            <p className="text-xs text-slate-600">
              下の「仕様テーブルの登録・編集とJSONインポート」から仕様値を登録すると、出率ベースの範囲やEM推定を算出できます。
            </p>
          </div>
        </div>
      ) : rangeEstimationResult ? (
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          {/* ヘッダー & 複数機種まとめ推定ボタン */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                <Target className="w-4 h-4 text-emerald-600" />
                <span>出率ベース設定範囲 & 平均設定相当（主推定）</span>
                <HelpTooltip text="全台日のプレイ量加重出率と公表機械割テーブルから、偏りなく設定範囲と平均設定相当を算出します。" />
              </h4>
            </div>

            {availableSpecsForStore.length > 1 && (
              <button
                type="button"
                onClick={() => setIsMultiModelModalOpen(true)}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                <span>同じ店の複数機種をまとめて推定 ({availableSpecsForStore.length}機種)</span>
              </button>
            )}
          </div>

          {/* 4つの主要KPIカード */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. 全体出率 (IN加重) */}
            <div className="p-3 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 rounded-xl border border-emerald-200/80 shadow-2xs">
              <span className="text-[11px] text-emerald-800 font-bold block">全体出率 (IN加重)</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-black text-emerald-800 font-mono">
                  {rangeEstimationResult.overallPayoutRate.toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-emerald-700 font-mono mt-0.5">
                95%区間: [{rangeEstimationResult.payoutCi95[0].toFixed(2)}% 〜 {rangeEstimationResult.payoutCi95[1].toFixed(2)}%]
              </div>
              <span className="text-[9px] text-emerald-600/80 block mt-0.5">※全台日使用 (足切りなし)</span>
            </div>

            {/* 2. 平均設定相当 */}
            <div className="p-3 bg-gradient-to-br from-indigo-50/80 to-blue-50/50 rounded-xl border border-indigo-200/80 shadow-2xs">
              <span className="text-[11px] text-indigo-800 font-bold block">平均設定相当</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-black text-indigo-800 font-mono">
                  設定 {rangeEstimationResult.settingEquivalent.toFixed(2)}
                </span>
              </div>
              <div className="text-[10px] text-indigo-700 font-mono mt-0.5">
                95%区間: [設定 {rangeEstimationResult.settingCi95[0].toFixed(2)} 〜 設定 {rangeEstimationResult.settingCi95[1].toFixed(2)}]
              </div>
              <span className="text-[9px] text-indigo-600/80 block mt-0.5">※公表機械割テーブルから線形補間</span>
            </div>

            {/* 3. 高設定(H以上)割合の範囲 */}
            <div className="p-3 bg-gradient-to-br from-amber-50/80 to-orange-50/50 rounded-xl border border-amber-200/80 shadow-2xs">
              <span className="text-[11px] text-amber-900 font-bold block">
                高設定(設定{highThreshold}+)の割合の範囲
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-black text-amber-900 font-mono">
                  {rangeEstimationResult.pointRange.minRate}% 〜 {rangeEstimationResult.pointRange.maxRate}%
                </span>
              </div>
              <div className="text-[10px] text-amber-800 font-mono mt-0.5">
                出率95%区間加味: {rangeEstimationResult.ciRange.minRate}% 〜 {rangeEstimationResult.ciRange.maxRate}%
              </div>
              <span className="text-[9px] text-amber-700/80 block mt-0.5">※理論的に取りうる上下限</span>
            </div>

            {/* 4. 観測データ規模 */}
            <div className="p-3 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-700 font-bold block">観測データ規模</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-lg font-black text-slate-900 font-mono">
                  {rangeEstimationResult.uniqueMachineCount}台
                </span>
                <span className="text-slate-400 font-mono">/</span>
                <span className="text-sm font-bold text-slate-700 font-mono">
                  {rangeEstimationResult.totalMachineDays}台日
                </span>
              </div>
              <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                総G数: {rangeEstimationResult.totalGames.toLocaleString()} G
              </div>
              <div className="text-[10px] font-mono font-bold mt-0.5 text-slate-700">
                総差枚: {rangeEstimationResult.totalDiff >= 0 ? `+${rangeEstimationResult.totalDiff.toLocaleString()}` : rangeEstimationResult.totalDiff.toLocaleString()}枚
              </div>
            </div>
          </div>

          {/* 横棒の範囲グラフ */}
          <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                  <span>高設定（設定{highThreshold}以上）の割合の範囲</span>
                  <HelpTooltip text="出率だけでは高設定割合を1点に確定できないため、理論的に取りうる範囲で表示しています。濃い帯は点推定出率での範囲、薄い背景帯は出率の95%信頼区間を加味した範囲です。" />
                </h5>
              </div>
              <div className="text-[11px] font-mono text-right">
                <span className="text-slate-500">点推定範囲: </span>
                <strong className="text-emerald-700 font-black">
                  {rangeEstimationResult.pointRange.minRate}% 〜 {rangeEstimationResult.pointRange.maxRate}%
                </strong>
              </div>
            </div>

            {/* 横棒範囲バー */}
            <div className="space-y-1.5 pt-1">
              <div className="relative h-8 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                {/* 出率95%区間を加味した範囲 */}
                <div
                  className="absolute top-0 bottom-0 bg-emerald-100/70 border-x border-emerald-300 transition-all duration-300"
                  style={{
                    left: `${Math.max(0, rangeEstimationResult.ciRange.minRate)}%`,
                    width: `${Math.max(1, rangeEstimationResult.ciRange.maxRate - rangeEstimationResult.ciRange.minRate)}%`,
                  }}
                  title={`出率95%区間加味: ${rangeEstimationResult.ciRange.minRate}% 〜 ${rangeEstimationResult.ciRange.maxRate}%`}
                />

                {/* 点推定出率での範囲 */}
                <div
                  className="absolute top-1 bottom-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-md shadow-xs transition-all duration-300 flex items-center justify-between px-2 text-white text-[10px] font-mono font-bold"
                  style={{
                    left: `${Math.max(0, rangeEstimationResult.pointRange.minRate)}%`,
                    width: `${Math.max(2, rangeEstimationResult.pointRange.maxRate - rangeEstimationResult.pointRange.minRate)}%`,
                  }}
                  title={`点推定範囲: ${rangeEstimationResult.pointRange.minRate}% 〜 ${rangeEstimationResult.pointRange.maxRate}%`}
                >
                  <span>{rangeEstimationResult.pointRange.minRate}%</span>
                  <span>{rangeEstimationResult.pointRange.maxRate}%</span>
                </div>
              </div>

              {/* 軸目盛り */}
              <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* 1行の注意文 (プロンプト36要件1) */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2 text-xs text-slate-600">
            <Info className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>出率からの統計的な推定です。実際の設定を示すものではありません。回転数が少ない台は判別力が低くなります。</span>
          </div>
        </div>
      ) : null}

      {/* 4. 「詳細」の折りたたみ群（既定はすべて閉じる） */}
      <div className="space-y-3">
        {/* 詳細 1: 仕様テーブルの登録・編集とJSONインポート */}
        <details className="border border-slate-200 rounded-xl bg-white p-4 group transition-all" data-testid="foldable-specs">
          <summary className="font-bold text-slate-800 text-xs sm:text-sm cursor-pointer flex items-center justify-between select-none list-none">
            <div className="flex items-center gap-2 flex-wrap">
              <Settings2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-bold">仕様テーブルの登録・編集とJSONインポート:</span>
              <span className="text-xs font-normal text-slate-600">
                {currentSpec
                  ? `${currentSpec.modelName}（${currentSpec.settings.length}段階仕様 登録済み）`
                  : '未登録（仕様値の登録が必要です）'}
              </span>
            </div>
            <span className="text-xs text-slate-400 group-open:hidden shrink-0 ml-2">詳細を開く ▼</span>
          </summary>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                {currentSpec ? `機種: ${currentSpec.modelName}` : '仕様テーブル未登録'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => setIsPasteJsonModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer flex items-center gap-1.5"
                  title="JSONテキスト直接貼り付けまたは複数機種一括インポート"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-700" />
                  <span>JSON一括取り込み</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>JSONエクスポート</span>
                </button>
              </div>
            </div>

            {currentSpec ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">設定</th>
                      <th className="py-2 px-3 text-right">公表機械割（出率%）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {currentSpec.settings.map((s) => (
                      <tr key={s.label} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-sans font-bold text-slate-900">{s.label}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800">{s.payoutRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                仕様値が登録されていません。上記ボタンから登録してください。
              </div>
            )}
          </div>
        </details>

        {/* 詳細 2: EM推定（参考）と感度分析 */}
        <details className="border border-slate-200 rounded-xl bg-white p-4 group transition-all" data-testid="foldable-em">
          <summary className="font-bold text-slate-800 text-xs sm:text-sm cursor-pointer flex items-center justify-between select-none list-none">
            <div className="flex items-center gap-2 flex-wrap">
              <Cpu className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-bold">EM推定（参考）と感度分析:</span>
              <span className="text-xs font-normal text-slate-600">
                {isEmUnstable
                  ? '推定は不安定です（参考値）'
                  : `推定平均設定 ${estimationResult.expectedSettingOverall} / 高設定(${highThreshold}+)比率 ${estimationResult.highSettingOverallRate}%（安定）`}
              </span>
            </div>
            <span className="text-xs text-slate-400 group-open:hidden shrink-0 ml-2">詳細を開く ▼</span>
          </summary>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-4 text-xs">
            {/* 最小回転数フィルター & 回転数重みコントロールバー */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* 最小回転数セレクター & プリセット */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                    <span>最小回転数:</span>
                  </span>

                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 gap-0.5">
                    {PRESET_MIN_GAMES.map((p) => {
                      const isSelected = minGames === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => handleSelectPreset(p.value)}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={inputMinGames}
                      onChange={(e) => setInputMinGames(e.target.value)}
                      onBlur={handleApplyInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleApplyInput();
                      }}
                      className="w-20 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="0"
                      title="数値を入力しEnterまたは枠外クリックで適用"
                    />
                    <span className="text-slate-600">G以上</span>
                    <span className="text-[11px] text-slate-400 font-sans ml-0.5">
                      (既定 0G: 全台日)
                    </span>
                  </div>
                </div>

                {/* 回転数重み付けセレクター */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-slate-700">回転数の重み:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 gap-0.5">
                    {[
                      { value: 'raw' as GameWeightMode, label: 'そのまま' },
                      { value: 'cap3000' as GameWeightMode, label: '上限3,000G' },
                      { value: 'constant' as GameWeightMode, label: '一定' },
                    ].map((w) => {
                      const isSelected = gameWeightMode === w.value;
                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => setGameWeightMode(w.value)}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 条件別感度比較へのショートカットボタン */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('sensitivity-table');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all cursor-pointer flex items-center gap-1 ml-auto"
                  title="最小回転数や重み付けの違いによる推定感度を比較"
                >
                  <Scale className="w-3.5 h-3.5 text-emerald-600" />
                  <span>条件を変えて比べる</span>
                </button>
              </div>

              {/* 絞り込み結果サマリー & 出率 (IN加重) */}
              <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">
                    使用 {estimationResult.evaluatedRecords}台日 / 全 {estimationResult.totalRecords}台日
                    {estimationResult.excludedCount > 0 ? (
                      <span className="text-amber-700 ml-1 font-normal">
                        （除外 {estimationResult.excludedCount}台日）
                      </span>
                    ) : (
                      <span className="text-emerald-700 ml-1 font-normal">
                        （全台日を使用）
                      </span>
                    )}
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">
                      全体出率 (IN加重):{' '}
                      <strong className="text-slate-900 font-mono">
                        {overallPayoutRate.toFixed(1)}%
                      </strong>
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-600">
                      絞り後出率 (IN加重):{' '}
                      <strong className="text-slate-900 font-mono">
                        {filteredPayoutRate.toFixed(1)}%
                      </strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                    showAdvancedOptions
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                  title="推定パラメータ詳細設定"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>詳細オプション</span>
                </button>
              </div>

              {/* 詳細オプションドロワー */}
              {showAdvancedOptions && (
                <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-3 mt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* KPI サマリーバー */}
            <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                <span className="text-slate-500 block text-[11px]">推定全体平均設定</span>
                <span className="text-base font-black text-emerald-700 mt-0.5 block font-mono">
                  設定 {estimationResult.expectedSettingOverall}
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                <span className="text-slate-500 block text-[11px]">高設定(設定{highThreshold}+)比率</span>
                <span className="text-base font-black text-indigo-700 mt-0.5 block font-mono">
                  {estimationResult.highSettingOverallRate}%
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                <span className="text-slate-500 block text-[11px]">使用台日数 / 全台日数</span>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-base font-black text-slate-900 font-mono">
                    {estimationResult.evaluatedRecords}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    / {estimationResult.totalRecords}台日
                  </span>
                </div>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                <span className="text-slate-500 block text-[11px]">平均回転数</span>
                <span className="text-base font-black text-slate-900 mt-0.5 block font-mono">
                  {estimationResult.meanGames.toLocaleString()} G
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                <span className="text-slate-500 block text-[11px]">推定 σ (分散係数)</span>
                <span className="text-base font-black text-slate-800 mt-0.5 block font-mono">
                  {estimationResult.sigma}
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
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

            {/* EM推定の警告（設定の分布が平ら…／σを固定した区間です…／再標本の◯%が反復上限で終了…） */}
            {emWarnings.length > 0 && (
              <div className="space-y-1.5">
                {emWarnings.map((warn, wIdx) => (
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

            {/* 見出し */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                  <span>設定混合比率 π の推定値と95%ブートストラップ区間</span>
                  <HelpTooltip text="日単位ブロックブートストラップ（ブロック長7日、500回）による95%信頼区間です。σを固定した区間のため、台数が少ないと実際より狭く出ることがあります。" />
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  日単位ブロックブートストラップ（ブロック長7日、{BOOTSTRAP_REPS}回）による95%信頼区間。※ σを固定した区間です。台数が少ないと実際より狭く出ることがあります。
                </p>
              </div>
              {currentSpec && (
                <span className="text-[11px] font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                  適用スペック: {currentSpec.modelName} (
                  {currentSpec.source ? `出典: ${currentSpec.source}` : 'カスタム登録'})
                </span>
              )}
            </div>

            {/* 棒グラフ */}
            <div
              className={`h-64 w-full transition-opacity ${
                !isSensitivityCalculating && sensitivityResult?.isHighSensitivity
                  ? 'opacity-30 grayscale pointer-events-none select-none relative'
                  : ''
              }`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={estimationResult.distribution.map((d) => {
                    const ciInfo = formatSettingCi95(d.ci95, d.isCiCalculated);
                    return {
                      label: `${d.label} (${d.payoutRate}%)`,
                      shortLabel: d.label,
                      ratioPct: Number((d.proportion * 100).toFixed(1)),
                      ciText: ciInfo.text,
                      payoutRate: d.payoutRate,
                    };
                  })}
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
                      `${val}% (95%区間: ${item.payload.ciText})`,
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
                    <th className="py-2 px-3 text-right">推定台日数換算</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {estimationResult.distribution.map((d) => {
                    const estMachines = (
                      d.proportion * estimationResult.evaluatedRecords
                    ).toFixed(1);
                    const ciInfo = formatSettingCi95(d.ci95, d.isCiCalculated);
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
                          <div>{ciInfo.text}</div>
                          {ciInfo.isBoundary && ciInfo.boundaryNote && (
                            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                              ※ {ciInfo.boundaryNote}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          約 {estMachines} 台日
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-[11px] text-slate-500 mt-2 px-1 space-y-1">
                <div>※ σを固定した区間です。台数が少ないと実際より狭く出ることがあります。</div>
                {estimationResult.bootstrapNote && (
                  <div className="text-amber-700 font-medium">
                    ※ {estimationResult.bootstrapNote}
                  </div>
                )}
                {estimationResult.pointEstimateReachedMaxIterations && (
                  <div className="text-amber-800 font-medium">
                    ※ 設定の分布が平らで、推定が定まりにくいデータです。上の『範囲』を参考にしてください。
                  </div>
                )}
              </div>
            </div>

            {/* 回転数と出率の依存の診断 */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>回転数と出率の依存診断 (区間別出率 & Spearman相関)</span>
                  <HelpTooltip text="勝つ台ほど長く打たれ回転数が増加するバイアスを、Spearmanの順位相関係数で診断します。" />
                </div>
                <div className="text-[11px] font-mono">
                  <span className="text-slate-500">Spearman相関: </span>
                  <strong
                    className={`text-xs ${
                      rotationDependency.isDependent
                        ? 'text-rose-600 font-black'
                        : 'text-slate-800 font-bold'
                    }`}
                  >
                    {rotationDependency.spearmanCorr !== null
                      ? `${rotationDependency.spearmanCorr >= 0 ? '+' : ''}${rotationDependency.spearmanCorr.toFixed(2)}`
                      : 'データ不足'}
                  </strong>
                </div>
              </div>

              {/* 区間別テーブル */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-1.5 px-3">回転数区間</th>
                      <th className="py-1.5 px-2.5 text-right">台日数</th>
                      <th className="py-1.5 px-2.5 text-right">構成比</th>
                      <th className="py-1.5 px-3 text-right">出率 (IN加重)</th>
                      <th className="py-1.5 px-3 text-right">平均差枚</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {rotationDependency.intervals.map((inv) => (
                      <tr key={inv.label} className="hover:bg-slate-50/80">
                        <td className="py-1.5 px-3 font-sans font-bold text-slate-800">
                          {inv.label}
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-700">
                          {inv.count} 台日
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-500">
                          {inv.ratio}%
                        </td>
                        <td
                          className={`py-1.5 px-3 text-right font-black ${
                            inv.count === 0
                              ? 'text-slate-400'
                              : inv.inWeightedPayoutRate >= 102
                              ? 'text-rose-600'
                              : inv.inWeightedPayoutRate <= 97
                              ? 'text-blue-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {inv.count > 0 ? `${inv.inWeightedPayoutRate.toFixed(1)}%` : '-'}
                        </td>
                        <td
                          className={`py-1.5 px-3 text-right ${
                            inv.count > 0 && inv.totalDiff > 0 ? 'text-blue-600 font-bold' : 'text-slate-600'
                          }`}
                        >
                          {inv.count > 0 ? `${Math.round(inv.totalDiff / inv.count)}枚` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 感度分析（条件比較）テーブル */}
            {(sensitivityResult || isSensitivityCalculating) && (
              <div id="sensitivity-table" className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-emerald-600" />
                      <span>条件別 感度分析（回転数 × 重み 15条件）</span>
                      <HelpTooltip text="最小回転数（0〜5,000G）と回転数重み（そのまま/上限3,000G/一定）の15条件による高設定比率の変動幅を検証します。" />
                      {isSensitivityCalculating && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>計算中（{sensitivityProgress ?? 0}/15条件）</span>
                        </span>
                      )}
                    </h5>
                  </div>
                  {sensitivityResult && (
                    <div className="text-[11px]">
                      <span className="text-slate-500">高設定比率の変動幅: </span>
                      <strong
                        className={`font-mono font-black text-xs ${
                          sensitivityResult.isHighSensitivity ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {sensitivityResult.rateSpread}ポイント
                      </strong>
                      <span className="text-slate-400 font-sans ml-1">
                        ({sensitivityResult.minHighSettingRate}% 〜 {sensitivityResult.maxHighSettingRate}%)
                      </span>
                    </div>
                  )}
                </div>

                {sensitivityResult ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">条件 (最小G数)</th>
                          <th className="py-2 px-2.5 text-right">使用台日数</th>
                          <th className="py-2 px-2.5 text-right">除外台日数</th>
                          <th className="py-2 px-2.5 text-right">出率 (IN加重)</th>
                          <th className="py-2 px-3 text-right bg-indigo-50/50 text-indigo-900">
                            重み: そのまま
                          </th>
                          <th className="py-2 px-3 text-right bg-blue-50/50 text-blue-900">
                            重み: 上限3,000G
                          </th>
                          <th className="py-2 px-3 text-right bg-teal-50/50 text-teal-900">
                            重み: 一定
                          </th>
                          <th className="py-2 px-2 text-center w-20">適用</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {sensitivityResult.rows.map((row) => {
                          const isCurrent = minGames === row.minGames;
                          return (
                            <tr
                              key={row.minGames}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isCurrent ? 'bg-emerald-50/70 font-bold' : ''
                              }`}
                            >
                              <td className="py-2 px-3 font-sans font-bold text-slate-900">
                                <span className="flex items-center gap-1">
                                  {isCurrent && (
                                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                  )}
                                  <span>{row.label}</span>
                                </span>
                              </td>
                              <td className="py-2 px-2.5 text-right text-slate-700">
                                {row.evaluatedRecords} 台日
                              </td>
                              <td className="py-2 px-2.5 text-right text-slate-500">
                                {row.excludedCount} 台日
                              </td>
                              <td className="py-2 px-2.5 text-right font-black text-slate-900">
                                {row.inWeightedPayoutRate.toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-right font-black text-indigo-700 bg-indigo-50/20">
                                {row.rateRaw.toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-right font-black text-blue-700 bg-blue-50/20">
                                {row.rateCap3000.toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-right font-black text-teal-700 bg-teal-50/20">
                                {row.rateConstant.toFixed(1)}%
                              </td>
                              <td className="py-2 px-2 text-center font-sans">
                                <button
                                  type="button"
                                  disabled={isCurrent}
                                  onClick={() => handleSelectPreset(row.minGames)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                    isCurrent
                                      ? 'bg-emerald-100 text-emerald-800 cursor-default'
                                      : 'bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 border border-slate-300'
                                  }`}
                                >
                                  {isCurrent ? '選択中' : '選択'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </details>

        {/* 詳細 3: 日別推移 */}
        <details className="border border-slate-200 rounded-xl bg-white p-4 group transition-all" data-testid="foldable-trends">
          <summary className="font-bold text-slate-800 text-xs sm:text-sm cursor-pointer flex items-center justify-between select-none list-none">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-bold">日別推移:</span>
              <span className="text-xs font-normal text-slate-600">
                {estimationResult.dailyTrends.length > 0
                  ? `${estimationResult.dailyTrends.length}日間のデータ推移・期間別内訳・台別移動出率`
                  : '推移データなし'}
              </span>
            </div>
            <span className="text-xs text-slate-400 group-open:hidden shrink-0 ml-2">詳細を開く ▼</span>
          </summary>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-4 text-xs">
            {/* 日別 推定設定分布の推移 (100%積み上げ) */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                <span>日別 推定設定分布の推移 (100%積み上げ)</span>
                <HelpTooltip text="各営業日の対象台における設定別事後確率の100%積み上げ構成比です。" />
              </h4>
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
                      if (currentSpec) {
                        for (const s of currentSpec.settings) {
                          row[s.label] = Number(((dt.distribution[s.label] || 0) * 100).toFixed(1));
                        }
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
                    {currentSpec?.settings.map((s, sIdx) => (
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

            {/* 期間別の推定内訳テーブル */}
            {rangeEstimationResult && (
              <div className="p-3.5 bg-slate-50/50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>期間別の推定内訳 (全体・直近30日・月別)</span>
                    <HelpTooltip text="期間別のIN加重出率と平均設定相当の内訳です。台日が少ない期間は区間が広くなります。" />
                  </h5>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">期間</th>
                        <th className="py-2 px-2.5 text-right">台日数 / 総G数</th>
                        <th className="py-2 px-3 text-right">全体出率 (95%区間)</th>
                        <th className="py-2 px-3 text-right">平均設定相当 (95%区間)</th>
                        <th className="py-2 px-3 text-center">高設定割合の範囲</th>
                        <th className="py-2 px-3 text-center">精度状況</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {rangeEstimationResult.periodBreakdowns.map((p) => (
                        <tr key={p.periodKey} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-sans font-bold text-slate-800">
                            {p.periodLabel}
                          </td>
                          <td className="py-2 px-2.5 text-right text-slate-700 font-sans">
                            <span className="font-bold font-mono">{p.machineDays}台日</span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {p.totalGames.toLocaleString()}G
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="font-bold text-slate-900 font-mono">
                              {p.payoutRate.toFixed(2)}%
                            </span>
                            <span className="text-[10px] text-slate-500 block font-mono">
                              [{p.payoutCi95[0].toFixed(2)}% 〜 {p.payoutCi95[1].toFixed(2)}%]
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="font-bold text-indigo-700 font-mono">
                              設定 {p.settingEquivalent.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 block font-mono">
                              [設定 {p.settingCi95[0].toFixed(2)} 〜 {p.settingCi95[1].toFixed(2)}]
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="font-bold text-amber-800 font-mono">
                              {p.pointRange.minRate}% 〜 {p.pointRange.maxRate}%
                            </span>
                            <span className="text-[10px] text-slate-400 block font-sans">
                              (95%加味: {p.ciRange.minRate}% 〜 {p.ciRange.maxRate}%)
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-sans">
                            {p.isWideCi ? (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                                区間広め (台日少)
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                                良好
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 区間の幅の見通し */}
            {rangeEstimationResult && (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-bold text-emerald-900">区間の幅（推定精度）の見通し:</span>
                  <p className="text-[11px] text-emerald-800">
                    区間の幅を半分にするには、総G数があと <strong>{(rangeEstimationResult.additionalGamesForHalfCi / 10000).toFixed(1)}万G</strong>（約 <strong>{rangeEstimationResult.additionalDaysForHalfCi}日分</strong>）必要です。
                  </p>
                  <span className="text-[10px] text-emerald-700/80 block">
                    ※ 統計誤差が総G数の平方根に反比例するため、精度を2倍（区間幅を半分）にするには現在の4倍のプレイ量が必要です。
                  </span>
                </div>
              </div>
            )}

            {/* 台別移動出率推移 (固定高さ h-72 の囲み) */}
            {rangeEstimationResult && rangeEstimationResult.rollingTrends7d.length > 0 && currentSpec && (
              <div className="p-3.5 bg-slate-50/50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span>台別の移動IN加重出率推移 ({rollingTrendMode === '7d' ? '7日' : '30日'}移動)</span>
                      <HelpTooltip text="各台の稼働推移と、機種公表機械割（破線）を同時にプロットした折れ線グラフです。" />
                    </h5>
                  </div>

                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 gap-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setRollingTrendMode('7d')}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                        rollingTrendMode === '7d'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      7日移動平均
                    </button>
                    <button
                      type="button"
                      onClick={() => setRollingTrendMode('30d')}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                        rollingTrendMode === '30d'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      30日移動平均
                    </button>
                  </div>
                </div>

                <div className="h-72 w-full border border-slate-200 rounded-lg p-2 bg-white">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={
                        rollingTrendMode === '7d'
                          ? rangeEstimationResult.rollingTrends7d
                          : rangeEstimationResult.rollingTrends30d
                      }
                      margin={{ top: 10, right: 25, left: -5, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={25} />
                      <YAxis
                        unit="%"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [`${val}%`, String(name).replace('machine_', '#')]}
                      />
                      <Legend
                        formatter={(val: any) => String(val).replace('machine_', '#')}
                        wrapperStyle={{ fontSize: 11 }}
                      />

                      {currentSpec.settings.map((s, idx) => (
                        <ReferenceLine
                          key={s.label}
                          y={s.payoutRate}
                          stroke={SETTING_COLORS[s.label] || '#94a3b8'}
                          strokeDasharray="4 4"
                          strokeWidth={1}
                          label={{
                            value: `${s.label} (${s.payoutRate}%)`,
                            position: idx % 2 === 0 ? 'insideRight' : 'insideLeft',
                            fill: SETTING_COLORS[s.label] || '#64748b',
                            fontSize: 9,
                          }}
                        />
                      ))}

                      {rangeEstimationResult.machineNums.map((mNum, idx) => (
                        <Line
                          key={mNum}
                          type="monotone"
                          dataKey={`machine_${mNum}`}
                          name={`#${mNum}`}
                          stroke={MACHINE_LINE_COLORS[idx % MACHINE_LINE_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </details>

        {/* 詳細 4: 条件別の比較 */}
        <details className="border border-slate-200 rounded-xl bg-white p-4 group transition-all" data-testid="foldable-conditions">
          <summary className="font-bold text-slate-800 text-xs sm:text-sm cursor-pointer flex items-center justify-between select-none list-none">
            <div className="flex items-center gap-2 flex-wrap">
              <Target className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-bold">条件別の比較:</span>
              <span className="text-xs font-normal text-slate-600">
                {estimationResult.conditionComparisons.length > 0
                  ? `特日・曜日・末尾別の比較（有意差 ${estimationResult.conditionComparisons.filter((c) => c.isSignificant).length}件）`
                  : '十分な比較データがありません'}
              </span>
            </div>
            <span className="text-xs text-slate-400 group-open:hidden shrink-0 ml-2">詳細を開く ▼</span>
          </summary>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                <span>条件別 高設定（設定{highThreshold}以上）推定比率の比較と有意差判定</span>
                <HelpTooltip text="特日・通常日、曜日別、台番号末尾別の高設定投入傾向と統計的有意性検定（2標本割合Z検定）です。" />
              </h4>
              {onNavigateToConditions && (
                <button
                  type="button"
                  onClick={() => onNavigateToConditions('special')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                >
                  <span>条件別に詳しく見る</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {estimationResult.conditionComparisons.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
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
        </details>

        {/* 詳細 5: 台番別サマリー */}
        <details className="border border-slate-200 rounded-xl bg-white p-4 group transition-all" data-testid="foldable-machines">
          <summary className="font-bold text-slate-800 text-xs sm:text-sm cursor-pointer flex items-center justify-between select-none list-none">
            <div className="flex items-center gap-2 flex-wrap">
              <Hash className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-bold">台番別サマリー:</span>
              <span className="text-xs font-normal text-slate-600">
                {sortedMachineSummaries.length > 0
                  ? `全${sortedMachineSummaries.length}台の個別実績と推定設定`
                  : '台別データなし'}
              </span>
            </div>
            <span className="text-xs text-slate-400 group-open:hidden shrink-0 ml-2">詳細を開く ▼</span>
          </summary>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                  <span>台番号ごとの推定平均設定・高設定確率一覧</span>
                  <HelpTooltip text="台ごとの稼働日数、実績出率、最尤設定および高設定の期待確率です。" />
                </h4>
              </div>
              <span className="text-xs text-slate-500">
                ヘッダークリックで昇順/降順ソート
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
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
                        <td className="py-2 px-3 font-bold text-slate-900 font-sans">
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
        </details>
      </div>

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
          onImportJson={(e) => {
            handleImportJsonFiles(e.target.files);
            e.target.value = '';
          }}
          onOpenPasteModal={() => {
            setIsSpecModalOpen(false);
            setIsPasteJsonModalOpen(true);
          }}
        />
      )}

      {/* JSON直接貼り付け・一括インポートモーダル */}
      <PasteJsonModal
        isOpen={isPasteJsonModalOpen}
        onClose={() => setIsPasteJsonModalOpen(false)}
        onImportText={handleImportJsonText}
        onImportFiles={handleImportJsonFiles}
        existingSpecs={allSpecs}
      />
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
  onOpenPasteModal: () => void;
}

const SettingSpecEditorModal: React.FC<SettingSpecEditorModalProps> = ({
  spec: initialSpec,
  allSpecs,
  onSave,
  onDelete,
  onClose,
  onExportJson,
  onImportJson,
  onOpenPasteModal,
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenPasteModal}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded flex items-center gap-1 cursor-pointer"
                title="JSONテキストを直接貼り付けて複数機種を一括取り込み"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-700" />
                <span>JSON直接貼り付け / 一括</span>
              </button>
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
                <span>ファイルから取り込む</span>
                <input
                  type="file"
                  accept=".json"
                  multiple
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

/* =====================================================================
 * Paste JSON Modal Component (JSONテキスト直接貼り付け・一括インポート画面)
 * ===================================================================== */

interface PasteJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportText: (text: string) => Promise<{ imported: ModelSettingSpec[]; errors: string[] }>;
  onImportFiles: (files: FileList | null) => Promise<void>;
  existingSpecs: ModelSettingSpec[];
}

const SAMPLE_MULTI_MODEL_JSON = JSON.stringify(
  [
    {
      modelName: 'マイジャグラーV',
      aliases: ['マイジャグ5', 'SマイジャグラーVKD'],
      source: 'メーカー公表値',
      settings: [
        { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 409.6 },
        { label: '設定2', settingNum: 2, payoutRate: 98.0, bbDenom: 270.8, rbDenom: 385.5 },
        { label: '設定3', settingNum: 3, payoutRate: 99.9, bbDenom: 266.4, rbDenom: 336.1 },
        { label: '設定4', settingNum: 4, payoutRate: 102.8, bbDenom: 254.0, rbDenom: 290.0 },
        { label: '設定5', settingNum: 5, payoutRate: 105.3, bbDenom: 240.1, rbDenom: 268.6 },
        { label: '設定6', settingNum: 6, payoutRate: 109.4, bbDenom: 229.1, rbDenom: 229.1 },
      ],
    },
    {
      modelName: 'アイムジャグラーEX',
      aliases: ['アイムEX', 'SアイムジャグラーEX'],
      source: 'メーカー公表値',
      settings: [
        { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 439.8 },
        { label: '設定2', settingNum: 2, payoutRate: 98.0, bbDenom: 269.7, rbDenom: 399.6 },
        { label: '設定3', settingNum: 3, payoutRate: 99.5, bbDenom: 269.7, rbDenom: 330.9 },
        { label: '設定4', settingNum: 4, payoutRate: 101.1, bbDenom: 259.0, rbDenom: 315.1 },
        { label: '設定5', settingNum: 5, payoutRate: 102.8, bbDenom: 259.0, rbDenom: 255.0 },
        { label: '設定6', settingNum: 6, payoutRate: 105.5, bbDenom: 255.0, rbDenom: 255.0 },
      ],
    },
  ],
  null,
  2
);

const SAMPLE_SINGLE_MODEL_JSON = JSON.stringify(
  {
    modelName: 'マイジャグラーV',
    aliases: ['マイジャグ5', 'SマイジャグラーVKD'],
    source: 'メーカー公表値',
    settings: [
      { label: '設定1', settingNum: 1, payoutRate: 97.0, bbDenom: 273.1, rbDenom: 409.6 },
      { label: '設定2', settingNum: 2, payoutRate: 98.0, bbDenom: 270.8, rbDenom: 385.5 },
      { label: '設定3', settingNum: 3, payoutRate: 99.9, bbDenom: 266.4, rbDenom: 336.1 },
      { label: '設定4', settingNum: 4, payoutRate: 102.8, bbDenom: 254.0, rbDenom: 290.0 },
      { label: '設定5', settingNum: 5, payoutRate: 105.3, bbDenom: 240.1, rbDenom: 268.6 },
      { label: '設定6', settingNum: 6, payoutRate: 109.4, bbDenom: 229.1, rbDenom: 229.1 },
    ],
  },
  null,
  2
);

const PasteJsonModal: React.FC<PasteJsonModalProps> = ({
  isOpen,
  onClose,
  onImportText,
  onImportFiles,
  existingSpecs,
}) => {
  const [jsonText, setJsonText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    importedCount?: number;
    importedNames?: string[];
    errors?: string[];
  }>({ type: 'idle', message: '' });

  if (!isOpen) return null;

  const handleExecuteImport = async () => {
    if (!jsonText.trim()) {
      setStatus({
        type: 'error',
        message: 'JSONテキストを入力または貼り付けてください。',
      });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const { imported, errors } = await onImportText(jsonText);
      if (imported.length > 0) {
        setStatus({
          type: 'success',
          message: `${imported.length}件の機種仕様を正常に取り込みました！`,
          importedCount: imported.length,
          importedNames: imported.map((s) => s.modelName),
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        setStatus({
          type: 'error',
          message: '取り込み可能な仕様が見つかりませんでした。形式をご確認ください。',
          errors,
        });
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: `取り込み処理中にエラーが発生しました: ${err?.message || String(err)}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white font-bold shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                機種仕様 JSON 直接貼り付け / 一括インポート
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  複数機種対応
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                単一機種オブジェクト、複数機種の配列（[...]）、または全仕様エクスポート形式をそのまま貼り付けられます
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

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Quick presets */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700">テンプレート挿入:</span>
              <button
                type="button"
                onClick={() => setJsonText(SAMPLE_MULTI_MODEL_JSON)}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 font-bold border border-slate-200 hover:border-emerald-300 rounded shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <span>複数機種の雛形 (2機種)</span>
              </button>
              <button
                type="button"
                onClick={() => setJsonText(SAMPLE_SINGLE_MODEL_JSON)}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 font-bold border border-slate-200 hover:border-emerald-300 rounded shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <span>単一機種の雛形 (1機種)</span>
              </button>
            </div>
            {jsonText && (
              <button
                type="button"
                onClick={() => setJsonText('')}
                className="text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
              >
                クリア
              </button>
            )}
          </div>

          {/* Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800">
                JSONテキスト貼り付けエリア:
              </label>
              <span className="text-[11px] text-slate-500">
                現在登録済み: {existingSpecs.length}機種
              </span>
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder="ここに機種仕様のJSONを貼り付けてください...&#10;&#10;例 (単一機種):&#10;{&#10;  &quot;modelName&quot;: &quot;マイジャグラーV&quot;,&#10;  &quot;settings&quot;: [&#10;    { &quot;label&quot;: &quot;設定1&quot;, &quot;payoutRate&quot;: 97.0 },&#10;    { &quot;label&quot;: &quot;設定6&quot;, &quot;payoutRate&quot;: 109.4 }&#10;  ]&#10;}&#10;&#10;例 (複数機種):&#10;[&#10;  { &quot;modelName&quot;: &quot;マイジャグラーV&quot;, ... },&#10;  { &quot;modelName&quot;: &quot;アイムジャグラーEX&quot;, ... }&#10;]"
              rows={12}
              className="w-full p-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Status Message */}
          {status.type === 'success' && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{status.message}</span>
              </div>
              {status.importedNames && (
                <div className="text-[11px] text-emerald-700 pl-6 flex flex-wrap gap-1">
                  <span className="font-bold">取り込み機種:</span>
                  {status.importedNames.map((name) => (
                    <span key={name} className="px-1.5 py-0.5 bg-emerald-100 rounded font-bold">
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {status.errors && status.errors.length > 0 && (
                <div className="text-[11px] text-amber-700 pl-6 mt-1 space-y-0.5">
                  <span className="font-bold">一部スキップされた項目:</span>
                  {status.errors.map((e, idx) => (
                    <div key={idx}>・{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status.type === 'error' && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{status.message}</span>
              </div>
              {status.errors && status.errors.length > 0 && (
                <div className="text-[11px] text-rose-700 pl-6 space-y-0.5">
                  {status.errors.map((e, idx) => (
                    <div key={idx}>・{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <label className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 flex items-center gap-1.5 cursor-pointer shadow-2xs">
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>ファイルから読み込み (複数選択可)</span>
              <input
                type="file"
                accept=".json"
                multiple
                onChange={async (e) => {
                  await onImportFiles(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-800 font-bold text-xs cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="button"
              disabled={isProcessing || !jsonText.trim()}
              onClick={handleExecuteImport}
              className={`px-5 py-2 rounded-lg font-bold text-xs text-white transition-all cursor-pointer flex items-center gap-1.5 ${
                !isProcessing && jsonText.trim()
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-2xs'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isProcessing ? '処理中...' : '取り込み実行'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

