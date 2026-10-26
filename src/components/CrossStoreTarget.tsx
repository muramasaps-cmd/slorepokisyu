import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreProfile } from '../data/types';
import {
  calculateCrossStoreRanking,
  CrossStoreRankingResult,
  CrossMetricMode,
  CrossStoreModelRank,
  CrossStoreMachineRank,
  CrossStoreStoreRank,
  CandidateDateScanResult,
  generateCandidateScanDates,
  scanCandidateDates,
  MachineCheckStatus,
  loadTargetCheckStatus,
  saveTargetCheckStatus,
  filterAndRollupTargetList,
  generateTargetListCopyText,
  generateTargetListCsv,
  calculateStorePastPerformance,
  StorePastPerformanceResult,
  CrossStoreFilterCriteria,
  filterMachineRankings,
  filterModelRankings,
  getMachinesForModelRank,
  loadCrossStoreSettings,
  saveCrossStoreSettings,
} from '../utils/crossStoreRanking';
import { parseIslandConfig } from '../utils/islandUtils';
import { runMachineBacktest } from '../utils/backtestEngine';
import { formatNumber, formatYen } from '../utils/formatters';
import {
  computeMachineBacktestCacheKey,
  getMemoryBacktestCache,
  setMemoryBacktestCache,
  getBacktestFromIdb,
  putBacktestToIdb,
} from '../utils/machineBacktestCache';
import type { CrossRankingWorkerRequest, CrossRankingWorkerResponse } from '../workers/crossRankingWorker';
import { TargetRankingTable } from './TargetRankingTable';
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
  Copy,
  Download,
  Ban,
  Gamepad2,
  History,
  RotateCcw,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Check,
  Scale,
  SlidersHorizontal,
} from 'lucide-react';

interface CrossStoreTargetProps {
  stores: StoreProfile[];
  initialTargetDate?: string;
  targetDate?: string;
  onTargetDateChange?: (date: string) => void;
  onSelectStore?: (storeId: string) => void;
  activeFilterLabel?: string;
  isModelFilterActive?: boolean;
  targetSection?: string;
  funnelStoreId?: string | null;
  onSelectFunnelStore?: (storeId: string | null) => void;
  funnelModelName?: string | null;
  onSelectFunnelModel?: (modelName: string | null) => void;
}

export const CrossStoreTarget: React.FC<CrossStoreTargetProps> = ({
  stores,
  initialTargetDate,
  targetDate: propTargetDate,
  onTargetDateChange,
  activeFilterLabel,
  isModelFilterActive,
  targetSection,
  funnelStoreId,
  onSelectFunnelStore,
  funnelModelName,
  onSelectFunnelModel,
}) => {
  // Read initial values from URL hash if available (e.g. #cross?crossDate=2026-05-17&crossStores=store1,store2)
  const getHashParams = () => {
    try {
      if (typeof window === 'undefined') return { date: null, stores: null };
      const hash = window.location.hash.slice(1);
      const queryPart = hash.includes('?') ? hash.split('?')[1] : hash;
      const params = new URLSearchParams(queryPart);
      return {
        date: params.get('crossDate') || params.get('targetDate') || params.get('date') || null,
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
  const savedSettings = useMemo(() => loadCrossStoreSettings(), []);

  // Target Date state
  const [internalTargetDate, setInternalTargetDate] = useState<string>(() => {
    if (propTargetDate) return propTargetDate;
    if (hashParams.date) return hashParams.date;
    if (initialTargetDate) return initialTargetDate;
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().slice(0, 10);
  });

  // Sync propTargetDate into internal state if provided
  useEffect(() => {
    if (propTargetDate && propTargetDate !== internalTargetDate) {
      setInternalTargetDate(propTargetDate);
    }
  }, [propTargetDate, internalTargetDate]);

  const targetDate = propTargetDate || internalTargetDate;

  const setTargetDate = (newDate: string) => {
    setInternalTargetDate(newDate);
    onTargetDateChange?.(newDate);
  };

  // Selected stores state (URL hash > savedSettings > all stores)
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() => {
    if (hashParams.stores && hashParams.stores.length > 0) {
      const validIds = hashParams.stores.filter((id) => stores.some((s) => s.id === id));
      if (validIds.length > 0) return validIds;
    }
    if (savedSettings.selectedStoreIds && savedSettings.selectedStoreIds.length > 0) {
      const validIds = savedSettings.selectedStoreIds.filter((id) => stores.some((s) => s.id === id));
      if (validIds.length > 0) return validIds;
    }
    return stores.map((s) => s.id);
  });

  // Sync hash when targetDate or selectedStoreIds change, only if using legacy #cross hash
  useEffect(() => {
    if (window.location.hash.startsWith('#cross')) {
      try {
        const params = new URLSearchParams();
        params.set('crossDate', targetDate);
        params.set('crossStores', selectedStoreIds.join(','));
        window.location.hash = `#cross?${params.toString()}`;
      } catch (err) {
        console.warn('Failed to update URL hash:', err);
      }
    }
  }, [targetDate, selectedStoreIds]);

  // Metric mode: diffCoins vs yen
  const [metricMode, setMetricMode] = useState<CrossMetricMode>(() => {
    return savedSettings.metricMode || 'diffCoins';
  });

  // 30-4: 指標の切替 (diffMetric: 'actual' | 'baseGames', 既定 'actual') & 基準G数 (既定 5,000)
  const [diffMetric, setDiffMetric] = useState<'actual' | 'baseGames'>(() => {
    return savedSettings.diffMetric || 'actual';
  });
  const [baseGames, setBaseGames] = useState<number>(() => {
    return savedSettings.baseGames || 5000;
  });

  // Display count: 10 vs 20 vs 50
  const [displayCount, setDisplayCount] = useState<number>(() => {
    return savedSettings.displayCount || 20;
  });

  // Active view: 'targetList' | 'models' | 'machines'
  const [rankingView, setRankingView] = useState<'targetList' | 'models' | 'machines'>(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('section=models')) {
      return 'models';
    }
    if (typeof window !== 'undefined' && window.location.hash.includes('section=machines')) {
      return 'machines';
    }
    return savedSettings.rankingView || 'targetList';
  });

  // Sync rankingView from targetSection prop or hash change
  useEffect(() => {
    if (targetSection === 'models' || targetSection === 'target-model-ranking') {
      setRankingView('models');
    } else if (targetSection === 'machines' || targetSection === 'target-machine-ranking') {
      setRankingView('machines');
    }
  }, [targetSection]);

  // Step expansion states (Prompt 47)
  const [isStep1Expanded, setIsStep1Expanded] = useState<boolean>(() => {
    return targetSection === 'calendar' || targetSection === 'target-calendar-scan';
  });
  const [isStep2Expanded, setIsStep2Expanded] = useState<boolean>(() => {
    return targetSection === 'stores' || targetSection === 'target-store-ranking';
  });
  const [isStep3Expanded, setIsStep3Expanded] = useState<boolean>(() => {
    return targetSection === 'models' || targetSection === 'target-model-ranking';
  });
  const [isStep4Expanded, setIsStep4Expanded] = useState<boolean>(() => {
    return targetSection === 'machines' || targetSection === 'target-machine-ranking';
  });
  const [isStep5Expanded, setIsStep5Expanded] = useState<boolean>(() => {
    return targetSection === 'checklist' || targetSection === 'target-checklist';
  });

  useEffect(() => {
    if (targetSection === 'calendar' || targetSection === 'target-calendar-scan') {
      setIsStep1Expanded(true);
    } else if (targetSection === 'stores' || targetSection === 'target-store-ranking') {
      setIsStep2Expanded(true);
    } else if (targetSection === 'models' || targetSection === 'target-model-ranking') {
      setIsStep3Expanded(true);
    } else if (targetSection === 'machines' || targetSection === 'target-machine-ranking') {
      setIsStep4Expanded(true);
    } else if (targetSection === 'checklist' || targetSection === 'target-checklist') {
      setIsStep5Expanded(true);
    }
  }, [targetSection]);

  useEffect(() => {
    const handleHash = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      if (hash.includes('section=models') || hash.includes('target-model-ranking')) {
        setRankingView('models');
        setIsStep3Expanded(true);
      } else if (hash.includes('section=machines') || hash.includes('target-machine-ranking')) {
        setRankingView('machines');
        setIsStep4Expanded(true);
      } else if (hash.includes('section=stores') || hash.includes('target-store-ranking')) {
        setIsStep2Expanded(true);
      } else if (hash.includes('section=calendar') || hash.includes('target-calendar-scan')) {
        setIsStep1Expanded(true);
      } else if (hash.includes('section=checklist') || hash.includes('target-checklist')) {
        setIsStep5Expanded(true);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Prompt 33: 絞り込み条件 (Filter criteria)
  const [filterCriteria, setFilterCriteria] = useState<CrossStoreFilterCriteria>(() => {
    return (
      savedSettings.filters || {
        modelName: '',
        islandName: '',
        tailDigit: null,
        minEvidenceDays: 0,
        confidence: 'all',
      }
    );
  });

  // Prompt 33: 機種行の展開状態 (Set of `${storeId}___${modelName}`)
  const [expandedModelKeys, setExpandedModelKeys] = useState<Set<string>>(new Set());

  const toggleExpandModel = (storeId: string, modelName: string) => {
    setExpandedModelKeys((prev) => {
      const next = new Set(prev);
      const key = `${storeId}___${modelName}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Save settings (including filter criteria) to localStorage whenever relevant states change
  useEffect(() => {
    saveCrossStoreSettings({
      selectedStoreIds,
      metricMode,
      diffMetric,
      baseGames,
      displayCount,
      rankingView,
      filters: filterCriteria,
    });
  }, [
    selectedStoreIds,
    metricMode,
    diffMetric,
    baseGames,
    displayCount,
    rankingView,
    filterCriteria,
  ]);

  // Active store ID for "狙い台リスト (来店中)"
  const [activeTargetStoreId, setActiveTargetStoreId] = useState<string>(() => {
    return stores[0]?.id || '';
  });

  // Ensure activeTargetStoreId is valid
  useEffect(() => {
    if (!stores.some((s) => s.id === activeTargetStoreId) && stores.length > 0) {
      setActiveTargetStoreId(stores[0].id);
    }
  }, [stores, activeTargetStoreId]);

  // Target list checked state for (targetDate, activeTargetStoreId)
  const [checkedMap, setCheckedMap] = useState<Record<number, MachineCheckStatus>>(() => {
    if (!activeTargetStoreId) return {};
    return loadTargetCheckStatus(targetDate, activeTargetStoreId);
  });

  // Reload checkedMap when targetDate or activeTargetStoreId changes
  useEffect(() => {
    if (activeTargetStoreId) {
      setCheckedMap(loadTargetCheckStatus(targetDate, activeTargetStoreId));
    }
  }, [targetDate, activeTargetStoreId]);

  // Handle toggling machine check status (unavailable | played)
  const handleToggleCheck = (machineNum: number, status: MachineCheckStatus) => {
    setCheckedMap((prev) => {
      const next = { ...prev };
      if (next[machineNum] === status) {
        delete next[machineNum];
      } else {
        next[machineNum] = status;
      }
      saveTargetCheckStatus(targetDate, activeTargetStoreId, next);
      return next;
    });
  };

  const handleUncheckMachine = (machineNum: number) => {
    setCheckedMap((prev) => {
      const next = { ...prev };
      delete next[machineNum];
      saveTargetCheckStatus(targetDate, activeTargetStoreId, next);
      return next;
    });
  };

  const handleResetChecks = () => {
    setCheckedMap({});
    saveTargetCheckStatus(targetDate, activeTargetStoreId, {});
  };

  // Past performance evaluation days (default 30 days)
  const [pastPerfRecentDays, setPastPerfRecentDays] = useState<number>(30);

  // Memoized past performance for all stores
  const pastPerformanceMap = useMemo(() => {
    const map: Record<string, StorePastPerformanceResult> = {};
    stores.forEach((s) => {
      map[s.id] = calculateStorePastPerformance(s, targetDate, pastPerfRecentDays);
    });
    return map;
  }, [stores, targetDate, pastPerfRecentDays]);

  // Copy feedback state
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Collapsible toggle for checked machines list
  const [showCheckedList, setShowCheckedList] = useState<boolean>(false);

  const handleCopyText = (storeName: string, items: CrossStoreMachineRank[]) => {
    try {
      const text = generateTargetListCopyText(storeName, targetDate, items);
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyFeedback('テキストをコピーしました！');
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
      setCopyFeedback('コピーに失敗しました');
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  const handleDownloadCsv = (storeName: string, items: CrossStoreMachineRank[]) => {
    try {
      const csv = generateTargetListCsv(storeName, targetDate, items);
      const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `狙い台リスト_${storeName}_${targetDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

  // Low confidence toggle (Prompt 13: 既定で除外、トグルで表示)
  const [includeLowConfidence, setIncludeLowConfidence] = useState<boolean>(false);

  // Worker calculation & progress
  const [workerProgress, setWorkerProgress] = useState<{ percent: number; store?: string } | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Store backtest edge & calibration cache (30-6: 上位20台の実績リフト & 95%区間)
  const [edgeCache, setEdgeCache] = useState<
    Record<
      string,
      {
        hasEdge: boolean;
        verdictMessage: string;
        evaluatedDays: number;
        top20AvgLift: number;
        top20Ci95: [number, number];
        top20ActualAvgDiff?: number;
      }
    >
  >(() => {
    try {
      if (typeof localStorage === 'undefined') return {};
      const saved = localStorage.getItem('slorepo_cross_edge_cache');
      return saved ? JSON.parse(saved) : {};
    } catch (err) {
      console.warn('Failed to load edge cache from localStorage:', err);
      return {};
    }
  });

  const [testingStoreId, setTestingStoreId] = useState<string | null>(null);

  // Pre-load backtest results from cache (memory or IndexedDB) for all stores
  useEffect(() => {
    stores.forEach((store) => {
      if (edgeCache[store.id]) return;
      const priorRecords = (store.dailyRecords || []).filter((r) => r.date < targetDate);
      if (priorRecords.length < 3) return;
      const hasMach = priorRecords.some((r) => r.machines && r.machines.length > 0);
      if (!hasMach) return;

      const opts = {
        topN: 20,
        minEvidenceDays: 3,
        bootstrapIterations: 1000,
        weights: store.customMachineRankingWeights,
      };
      const key = computeMachineBacktestCacheKey(
        store.id,
        priorRecords,
        store.customMachineRankingWeights,
        store.specialDayRules,
        opts,
        store.modelAliasDictionary,
        store.includeReusedMachinesInStats
      );

      const memRes = getMemoryBacktestCache(key);
      if (memRes) {
        setEdgeCache((prev) => ({
          ...prev,
          [store.id]: {
            hasEdge: memRes.withFilter.hasEdge,
            verdictMessage: memRes.withFilter.verdictMessage,
            evaluatedDays: memRes.evaluatedDaysCount,
            top20AvgLift: memRes.withFilter.avgLift,
            top20Ci95: memRes.withFilter.ci95,
            top20ActualAvgDiff: memRes.withFilter.avgActualDiff,
          },
        }));
      } else {
        getBacktestFromIdb(key)
          .then((idbRes) => {
            if (idbRes) {
              setMemoryBacktestCache(key, idbRes);
              setEdgeCache((prev) => ({
                ...prev,
                [store.id]: {
                  hasEdge: idbRes.withFilter.hasEdge,
                  verdictMessage: idbRes.withFilter.verdictMessage,
                  evaluatedDays: idbRes.evaluatedDaysCount,
                  top20AvgLift: idbRes.withFilter.avgLift,
                  top20Ci95: idbRes.withFilter.ci95,
                  top20ActualAvgDiff: idbRes.withFilter.avgActualDiff,
                },
              }));
            }
          })
          .catch(() => {});
      }
    });
  }, [stores, targetDate, edgeCache]);

  const runStoreEdgeTest = async (store: StoreProfile) => {
    if (testingStoreId) return;
    setTestingStoreId(store.id);

    const priorRecords = (store.dailyRecords || []).filter((r) => r.date < targetDate);
    const opts = {
      topN: 20, // 30-6: 上位20台の実績リフト
      minEvidenceDays: 3,
      bootstrapIterations: 1000,
      weights: store.customMachineRankingWeights,
    };
    const key = computeMachineBacktestCacheKey(
      store.id,
      priorRecords,
      store.customMachineRankingWeights,
      store.specialDayRules,
      opts,
      store.modelAliasDictionary,
      store.includeReusedMachinesInStats
    );

    // 1. Check memory or IDB cache first
    let cachedRes = getMemoryBacktestCache(key);
    if (!cachedRes) {
      try {
        cachedRes = (await getBacktestFromIdb(key)) ?? undefined;
      } catch (err) {
        console.debug('IDB cache lookup error:', err);
      }
    }

    if (cachedRes) {
      const edgeInfo = {
        hasEdge: cachedRes.withFilter.hasEdge,
        verdictMessage: cachedRes.withFilter.verdictMessage,
        evaluatedDays: cachedRes.evaluatedDaysCount,
        top20AvgLift: cachedRes.withFilter.avgLift,
        top20Ci95: cachedRes.withFilter.ci95,
        top20ActualAvgDiff: cachedRes.withFilter.avgActualDiff,
      };
      setEdgeCache((prev) => {
        const next = { ...prev, [store.id]: edgeInfo };
        try {
          localStorage.setItem('slorepo_cross_edge_cache', JSON.stringify(next));
        } catch (err) {
          console.debug('Failed to save to localStorage:', err);
        }
        return next;
      });
      setTestingStoreId(null);
      return;
    }

    // 2. Otherwise run backtest
    setTimeout(() => {
      try {
        const res = runMachineBacktest(priorRecords, store.specialDayRules, opts);
        setMemoryBacktestCache(key, res);
        putBacktestToIdb(key, res, store.id).catch(() => {});

        const edgeInfo = {
          hasEdge: res.withFilter.hasEdge,
          verdictMessage: res.withFilter.verdictMessage,
          evaluatedDays: res.evaluatedDaysCount,
          top20AvgLift: res.withFilter.avgLift,
          top20Ci95: res.withFilter.ci95,
          top20ActualAvgDiff: res.withFilter.avgActualDiff,
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

  // Candidate Date Scan state (Prompt 32: 今後14日間・日数は設定可・Worker計算と進捗・キャッシュ)
  const [scanStartDate, setScanStartDate] = useState<string>(() => targetDate);
  const [scanDaysCount, setScanDaysCount] = useState<number>(14);
  const [scanTopN, setScanTopN] = useState<number>(10);
  const [scanResult, setScanResult] = useState<CandidateDateScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    percent: number;
    currentDate?: string;
    currentStore?: string;
  } | null>(null);
  const scanWorkerRef = useRef<Worker | null>(null);
  const [scanTrigger, setScanTrigger] = useState<number>(0);

  const scanDates = useMemo(() => {
    return generateCandidateScanDates(scanStartDate, scanDaysCount);
  }, [scanStartDate, scanDaysCount]);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/crossRankingWorker.ts', import.meta.url),
        { type: 'module' }
      );
      scanWorkerRef.current = worker;
      setScanProgress({ percent: 10 });

      worker.onmessage = (e: MessageEvent<CrossRankingWorkerResponse>) => {
        if (e.data.type === 'SCAN_PROGRESS') {
          setScanProgress({
            percent: e.data.progress,
            currentDate: e.data.currentDate,
            currentStore: e.data.currentStore,
          });
        } else if (e.data.type === 'SCAN_RESULT') {
          setScanResult(e.data.result);
          setScanProgress(null);
        } else if (e.data.type === 'ERROR') {
          console.error('Candidate scan worker failed:', e.data.error);
          setScanProgress(null);
        }
      };

      const req: CrossRankingWorkerRequest = {
        type: 'SCAN_CANDIDATE_DATES',
        stores,
        dates: scanDates,
        options: {
          topN: scanTopN,
          diffMetric,
          baseGames,
        },
      };
      worker.postMessage(req);

      return () => {
        worker.terminate();
        scanWorkerRef.current = null;
      };
    } catch (err) {
      console.warn('Worker initialization for candidate scan failed, falling back to sync:', err);
      setScanProgress(null);
      const res = scanCandidateDates(stores, scanDates, {
        topN: scanTopN,
        diffMetric,
        baseGames,
      });
      setScanResult(res);
    }
  }, [stores, scanDates, scanTopN, diffMetric, baseGames, scanTrigger]);

  const fallbackScanResult = useMemo(() => {
    if (scanResult) return null;
    return scanCandidateDates(stores, scanDates, {
      topN: scanTopN,
      diffMetric,
      baseGames,
    });
  }, [stores, scanDates, scanTopN, diffMetric, baseGames, scanResult]);

  const activeScanResult = scanResult || fallbackScanResult;

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
          topStoreMachineN: 10,
          selectedStoreIds,
          includeLowConfidence,
          diffMetric,
          baseGames,
          backtestResults: edgeCache,
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
  }, [stores, targetDate, metricMode, displayCount, selectedStoreIds, includeLowConfidence, diffMetric, baseGames, edgeCache]);

  // Synchronous calculation
  const syncResult: CrossStoreRankingResult = useMemo(() => {
    return calculateCrossStoreRanking(stores, targetDate, {
      metricMode,
      topModelCount: displayCount,
      topMachineCount: displayCount,
      topStoreMachineN: 10,
      selectedStoreIds,
      includeLowConfidence,
      diffMetric,
      baseGames,
      backtestResults: edgeCache,
    });
  }, [stores, targetDate, metricMode, displayCount, selectedStoreIds, includeLowConfidence, diffMetric, baseGames, edgeCache]);

  const rankingResult = workerResult || syncResult;

  // 30-6: Helper to compute top 20 expected diff average for a store
  const getStoreTop20ExpectedDiff = (storeId: string): number => {
    const list = rankingResult.storeMachineRankings?.[storeId] || [];
    const top20 = list.slice(0, 20);
    if (top20.length === 0) return 0;
    const sum = top20.reduce((acc, m) => acc + (m.expectedDiffCoins ?? m.shrunkDiff ?? 0), 0);
    return Math.round(sum / top20.length);
  };

  const getStoreCalibration = (storeId: string) => {
    const edgeInfo = edgeCache[storeId];
    if (!edgeInfo || edgeInfo.top20AvgLift === undefined) return null;
    const top20ExpectedDiff = getStoreTop20ExpectedDiff(storeId);
    const actualLift = edgeInfo.top20AvgLift;
    const ci95 = edgeInfo.top20Ci95 || [0, 0];
    const isUnderperforming = top20ExpectedDiff > 100 && actualLift < top20ExpectedDiff * 0.70;
    const realizedPct = top20ExpectedDiff > 0
      ? Math.max(0, Math.round((actualLift / top20ExpectedDiff) * 100))
      : 0;
    return {
      edgeInfo,
      top20ExpectedDiff,
      actualLift,
      ci95,
      isUnderperforming,
      realizedPct,
    };
  };

  const toggleStore = (id: string) => {
    if (selectedStoreIds.includes(id)) {
      if (selectedStoreIds.length <= 1) return; // Keep at least 1
      setSelectedStoreIds(selectedStoreIds.filter((sid) => sid !== id));
    } else {
      setSelectedStoreIds([...selectedStoreIds, id]);
    }
  };

  // Prompt 33: Available models & islands from selected stores
  const availableModels = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (selectedStoreIds.includes(s.id)) {
        (s.dailyRecords || []).forEach((r) => {
          (r.models || []).forEach((m) => {
            if (m.modelName) set.add(m.modelName);
          });
          (r.machines || []).forEach((mach) => {
            if (mach.modelName) set.add(mach.modelName);
          });
        });
      }
    });
    return Array.from(set).sort();
  }, [stores, selectedStoreIds]);

  const availableIslands = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (selectedStoreIds.includes(s.id)) {
        if (s.islandDefinitions) {
          s.islandDefinitions.forEach((isl) => {
            if (isl.name) set.add(isl.name);
          });
        }
        if (s.islandConfig) {
          const parsed = parseIslandConfig(s.islandConfig);
          parsed.forEach((isl) => {
            if (isl.name) set.add(isl.name);
          });
        }
      }
    });
    return Array.from(set).sort();
  }, [stores, selectedStoreIds]);

  // Prompt 33: Filtered machine and model rankings
  const filteredMachineRankings = useMemo(() => {
    return filterMachineRankings(rankingResult.machineRankings, filterCriteria);
  }, [rankingResult.machineRankings, filterCriteria]);

  const filteredModelRankings = useMemo(() => {
    return filterModelRankings(
      rankingResult.modelRankings,
      filterCriteria,
      rankingResult.machineRankings
    );
  }, [rankingResult.modelRankings, rankingResult.machineRankings, filterCriteria]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCriteria.modelName && filterCriteria.modelName.trim() !== '') count++;
    if (filterCriteria.islandName && filterCriteria.islandName.trim() !== '') count++;
    if (filterCriteria.tailDigit !== null && filterCriteria.tailDigit !== undefined) count++;
    if (filterCriteria.minEvidenceDays && filterCriteria.minEvidenceDays > 0) count++;
    if (filterCriteria.confidence && filterCriteria.confidence !== 'all') count++;
    return count;
  }, [filterCriteria]);

  const isSingleStore = stores.length <= 1;

  // Step ③ models filtered by funnelStoreId (Prompt 47)
  const step3Models = useMemo(() => {
    if (!funnelStoreId) return filteredModelRankings;
    return filteredModelRankings.filter((m) => m.storeId === funnelStoreId);
  }, [filteredModelRankings, funnelStoreId]);

  // Step ④ machines filtered by funnelStoreId and funnelModelName (Prompt 47)
  const step4Machines = useMemo(() => {
    let list = filteredMachineRankings;
    if (funnelStoreId) {
      list = list.filter((m) => m.storeId === funnelStoreId);
    }
    if (funnelModelName) {
      list = list.filter((m) => m.modelName === funnelModelName);
    }
    return list;
  }, [filteredMachineRankings, funnelStoreId, funnelModelName]);

  // Step ① top 3 candidate dates (Prompt 47)
  const top3CandidateDates = useMemo(() => {
    if (!scanDates || scanDates.length === 0) return [];
    const scoredDates = scanDates.map((dStr) => {
      let sumDiff = 0;
      let storeCount = 0;
      stores.forEach((s) => {
        const cell = activeScanResult?.grid?.[s.id]?.[dStr];
        if (cell && cell.evaluationDays > 0) {
          sumDiff += cell.topNAvgExpectedDiff;
          storeCount++;
        }
      });
      const avgDiff = storeCount > 0 ? Math.round(sumDiff / storeCount) : 0;
      const parts = dStr.split('-');
      const dowNames = ['日', '月', '火', '水', '木', '金', '土'];
      let dow = '';
      let isSun = false;
      let isSat = false;
      if (parts.length === 3) {
        const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        dow = dowNames[dObj.getDay()] || '';
        isSun = dObj.getDay() === 0;
        isSat = dObj.getDay() === 6;
      }
      return {
        date: dStr,
        avgDiff,
        storeCount,
        dow,
        isSun,
        isSat,
      };
    });
    return [...scoredDates].sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 3);
  }, [scanDates, stores, activeScanResult]);

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* 1. Header Banner & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                <Trophy className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight min-w-0 break-normal">
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

                      {/* Store Edge Badge and Top 20 Lift (30-6 Requirement 1) */}
                      {hasMach && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {edgeInfo ? (
                            <div className="flex items-center gap-1 flex-wrap">
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
                              <span
                                className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                                title={`上位20台実績リフト (95%信頼区間: ${edgeInfo.top20Ci95[0]}〜${edgeInfo.top20Ci95[1]}枚)`}
                              >
                                上位20台リフト: {edgeInfo.top20AvgLift >= 0 ? `+${edgeInfo.top20AvgLift}` : edgeInfo.top20AvgLift}枚
                                <span className="text-slate-400 font-normal ml-0.5">
                                  [{edgeInfo.top20Ci95[0]}〜{edgeInfo.top20Ci95[1]}枚]
                                </span>
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => runStoreEdgeTest(s)}
                              disabled={isTesting}
                              className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              title="この店舗の台番バックテスト（上位20台の実績リフト）を実行"
                            >
                              {isTesting ? (
                                <>
                                  <RotateCw className="w-2.5 h-2.5 animate-spin" />
                                  検証中...
                                </>
                              ) : (
                                <>
                                  <Play className="w-2.5 h-2.5" />
                                  検証を実行
                                </>
                              )}
                            </button>
                          )}
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

            {/* 指標切替: 実稼働差枚 (現行) vs 基準G換算 (30-4) */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 font-bold">
              <button
                type="button"
                onClick={() => setDiffMetric('actual')}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer ${
                  diffMetric === 'actual'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="各台の過去の実際の平均稼働G数に合わせた期待差枚を表示・並べ替え（現行）"
              >
                実稼働差枚
              </button>
              <button
                type="button"
                onClick={() => setDiffMetric('baseGames')}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer ${
                  diffMetric === 'baseGames'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="出率ベースで指定の基準ゲーム数に換算した期待差枚を表示・並べ替え"
              >
                基準G換算
              </button>
              {diffMetric === 'baseGames' && (
                <div className="flex items-center gap-1 pl-1.5 pr-1 border-l border-slate-300">
                  <span className="text-2xs text-slate-500 font-medium">基準G:</span>
                  <input
                    type="number"
                    min={1000}
                    max={15000}
                    step={500}
                    value={baseGames}
                    onChange={(e) => setBaseGames(Math.max(100, Number(e.target.value) || 5000))}
                    className="w-16 px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded text-right font-bold text-slate-800 focus:outline-hidden"
                  />
                  <span className="text-2xs text-slate-500 font-medium">G</span>
                </div>
              )}
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

      {/* Step ①: 来店日と範囲（この店／全店）と来店日の候補スキャン */}
      <div id="target-step-1" className="space-y-4">
        <div id="target-calendar-scan" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                  1
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  来店日の候補スキャン（今後{scanDaysCount}日間・店×日）
                </h3>
              </div>
              <p className="text-2xs text-slate-500">
                各店舗の上位{scanTopN}台（低信頼台を除く）の期待差枚平均を日別マトリクスで一覧。セルをクリックするとその日に来店日を切替えます。
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsStep1Expanded((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                data-testid="step1-toggle-expand"
              >
                {isStep1Expanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>マトリクスを折りたたむ</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>全件を見る (店×日マトリクス)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step ① Top 3 Candidate Dates Summary */}
          <div className="space-y-2">
            <div className="text-2xs font-bold text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-500" />
                期待値の高い来店候補日 TOP 3
              </span>
              <span className="text-[10px] text-slate-400">
                現在選択中: {targetDate}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="step1-top3-cards">
              {top3CandidateDates.map((cand, idx) => {
                const isSelected = cand.date === targetDate;
                return (
                  <div
                    key={`top-date-${cand.date}`}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-400 shadow-xs'
                        : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-700 text-white'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-white text-slate-700 border border-slate-200">
                          {cand.storeCount}店対象
                        </span>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          <span>{cand.date}</span>
                          <span className={`text-xs ${cand.isSun ? 'text-rose-600' : cand.isSat ? 'text-blue-600' : 'text-slate-600'}`}>
                            ({cand.dow})
                          </span>
                        </h4>
                      </div>

                      <div className="pt-1 flex items-baseline justify-between border-t border-slate-200/60 text-xs">
                        <span className="text-2xs text-slate-500">店舗平均期待差枚:</span>
                        <span className={`font-mono font-black ${cand.avgDiff >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                          {cand.avgDiff >= 0 ? `+${cand.avgDiff}` : cand.avgDiff}枚
                        </span>
                      </div>
                    </div>

                    <div className="pt-2.5 mt-2 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => setTargetDate(cand.date)}
                        className={`w-full py-1 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : 'bg-white hover:bg-slate-200 text-indigo-700 border border-indigo-200'
                        }`}
                        data-testid={`select-date-${idx + 1}`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>選択中</span>
                          </>
                        ) : (
                          <span>この日を選択 →</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step ① Expanded Matrix Table */}
          {isStep1Expanded && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Days range selector */}
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                  <span className="text-2xs text-slate-500 font-bold">スキャン期間:</span>
                  <select
                    value={scanDaysCount}
                    onChange={(e) => setScanDaysCount(Number(e.target.value))}
                    className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-xs"
                  >
                    <option value={7}>7日間</option>
                    <option value={14}>14日間（既定）</option>
                    <option value={21}>21日間</option>
                    <option value={30}>30日間</option>
                  </select>
                </div>

                {/* Reset start date to targetDate or tomorrow */}
                <button
                  type="button"
                  onClick={() => {
                    setScanStartDate(targetDate);
                    setScanTrigger((c) => c + 1);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                  title="選択中の来店日からスキャン期間を再計算"
                >
                  <RotateCw className="w-3 h-3 text-slate-500" />
                  <span>来店日から再スキャン</span>
                </button>
              </div>

              {/* Scan Progress Bar if active */}
              {scanProgress !== null && (
                <div className="space-y-1 animate-in fade-in">
                  <div className="flex justify-between text-[11px] text-slate-500 font-bold">
                    <span>
                      候補日スキャン計算中... {scanProgress.currentDate ? `(${scanProgress.currentDate} ${scanProgress.currentStore || ''})` : ''}
                    </span>
                    <span>{scanProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-1.5 transition-all duration-150"
                      style={{ width: `${scanProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Matrix Grid: Store × Date */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100/80 text-slate-700 text-2xs uppercase">
                    <tr>
                      <th className="px-3 py-2.5 font-bold sticky left-0 bg-slate-100 z-10 border-r border-slate-200 min-w-[130px] sm:min-w-[150px]">
                        店舗名
                      </th>
                      {scanDates.map((dStr) => {
                        const isCurrentTarget = dStr === targetDate;
                        const parts = dStr.split('-');
                        const monthDay = `${Number(parts[1])}/${Number(parts[2])}`;
                        const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        const dowNames = ['日', '月', '火', '水', '木', '金', '土'];
                        const dow = dowNames[dObj.getDay()];
                        const isSun = dObj.getDay() === 0;
                        const isSat = dObj.getDay() === 6;

                        return (
                          <th
                            key={dStr}
                            onClick={() => setTargetDate(dStr)}
                            className={`px-2.5 py-2 text-center font-bold border-r border-slate-200 cursor-pointer select-none transition-colors whitespace-nowrap min-w-[70px] ${
                              isCurrentTarget
                                ? 'bg-amber-100 text-amber-950 ring-2 ring-amber-500 inset-0'
                                : 'hover:bg-slate-200'
                            }`}
                            title={`クリックして来店日を ${dStr} に設定`}
                          >
                            <div className="flex flex-col items-center">
                              <span className="font-mono text-xs">{monthDay}</span>
                              <span
                                className={`text-[10px] ${
                                  isSun ? 'text-rose-600 font-black' : isSat ? 'text-blue-600 font-black' : 'text-slate-500'
                                }`}
                              >
                                ({dow})
                              </span>
                              {isCurrentTarget && (
                                <span className="mt-0.5 px-1 py-0.2 bg-amber-500 text-slate-950 rounded text-[9px] font-black">
                                  選択中
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stores.map((store) => {
                      return (
                        <tr key={store.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Sticky Store Name cell */}
                          <td className="px-3 py-2 font-bold text-slate-900 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-200 shadow-2xs">
                            <div className="truncate max-w-[130px] sm:max-w-[150px]" title={store.name}>
                              {store.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {store.exchangeRate || `${store.rateExchange || 52}枚`}
                            </div>
                          </td>

                          {/* Date cells */}
                          {scanDates.map((dStr) => {
                            const cell = activeScanResult?.grid?.[store.id]?.[dStr];
                            const isCurrentTarget = dStr === targetDate;
                            const hasData = cell && cell.evaluationDays > 0;
                            const diffVal = cell?.topNAvgExpectedDiff ?? 0;
                            const isSpecial = cell?.isSpecialDay;

                            return (
                              <td
                                key={dStr}
                                onClick={() => setTargetDate(dStr)}
                                className={`px-2 py-2 text-center border-r border-slate-100 cursor-pointer transition-all select-none ${
                                  isCurrentTarget
                                    ? 'bg-amber-50/80 font-black ring-1 ring-amber-400'
                                    : isSpecial
                                    ? 'bg-amber-50/40 hover:bg-amber-100/50'
                                    : 'hover:bg-slate-100'
                                }`}
                                title={
                                  cell
                                    ? `【${store.name}】${dStr}\n上位${scanTopN}台期待差枚平均: ${diffVal >= 0 ? '+' : ''}${diffVal}枚\n評価根拠日数: ${cell.evaluationDays}日\n除外低信頼台: ${cell.excludedLowConfidenceCount}台${
                                        cell.isSpecialDay ? `\n★特日 (${cell.specialDayReason || '特日'})` : ''
                                      }\nクリックでこの日に切り替え`
                                    : `クリックして ${dStr} に来店日を設定`
                                }
                              >
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  {isSpecial && (
                                    <span className="px-1 py-0.1 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full shadow-2xs">
                                      ★特
                                    </span>
                                  )}
                                  {hasData ? (
                                    <span
                                      className={`font-mono text-xs font-black ${
                                        diffVal > 0
                                          ? 'text-blue-600'
                                          : diffVal < 0
                                          ? 'text-rose-600'
                                          : 'text-slate-500'
                                      }`}
                                    >
                                      {diffVal >= 0 ? `+${diffVal}` : diffVal}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-mono text-xs">-</span>
                                  )}
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

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full">★特</span>
                    <span>店舗特日</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-blue-600 font-bold">+数値</span>
                    <span>上位{scanTopN}台プラス期待値</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-rose-600 font-bold">-数値</span>
                    <span>マイナス期待値</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="px-1 py-0.2 bg-amber-100 text-amber-950 rounded text-[9px] font-bold">選択中</span>
                    <span>現在の指定来店日</span>
                  </span>
                </div>
                <span className="text-slate-400">
                  ※ セルをクリックすると、その日を来店日に指定して詳細ランキングが即座に更新されます
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step ②: どの店に行くか（全店のとき） */}
      <div id="target-step-2" className="space-y-4 scroll-mt-28">
        <div id="target-store-ranking" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5 scroll-mt-28">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center shrink-0">
                  2
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>どの店に行くか？ 店舗ランキング</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-2xs rounded-full">
                    来店日: {targetDate}
                  </span>
                </h3>
              </div>
              <p className="text-2xs text-slate-500">
                各店舗の上位10台（信頼度が低い台を除く）の期待差枚平均の降順。特日周期・根拠日数・台番バックテスト判定を総合評価。
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsStep2Expanded((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                data-testid="step2-toggle-expand"
              >
                {isStep2Expanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>全件を折りたたむ</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>全件を見る ({rankingResult.storeRankings?.length || 0}店)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step ② Top 3 Stores Summary */}
          <div className="space-y-2">
            <div className="text-2xs font-bold text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-amber-600" />
                上位3店舗の要約（クリックで機種・台番へ絞り込み）
              </span>
              {funnelStoreId && (
                <span className="text-amber-800 font-bold">
                  選択中: {stores.find((s) => s.id === funnelStoreId)?.name || funnelStoreId}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="step2-top3-cards">
              {(rankingResult.storeRankings || []).slice(0, 3).map((st, idx) => {
                const isSelected = funnelStoreId === st.storeId;
                const edgeInfo = edgeCache[st.storeId];
                return (
                  <div
                    key={`top-store-${st.storeId}`}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500 shadow-xs'
                        : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-700 text-white'
                        }`}>
                          {idx + 1}
                        </span>
                        {st.isSpecialDay ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-amber-100 text-amber-900 border border-amber-300">
                            ★特日
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white text-slate-600 border border-slate-200">
                            通常日
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-xs text-slate-900 truncate" title={st.storeName}>
                          {st.storeName}
                        </h4>
                        <div className="text-[10px] text-slate-500">
                          {st.rateExchange}枚交換
                        </div>
                      </div>

                      <div className="pt-1 flex items-baseline justify-between border-t border-slate-200/60 text-xs">
                        <span className="text-2xs text-slate-500">上位10台平均:</span>
                        <span className={`font-mono font-black ${st.topNAvgExpectedDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                          {st.topNAvgExpectedDiff >= 0 ? `+${formatNumber(st.topNAvgExpectedDiff)}` : formatNumber(st.topNAvgExpectedDiff)}枚
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-600 bg-white/80 p-1.5 rounded-lg border border-slate-200/60 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span>評価日数: <strong>{st.evaluationDays}日分</strong></span>
                          {edgeInfo && (
                            <span className={edgeInfo.hasEdge ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                              {edgeInfo.hasEdge ? '優位性あり' : '優位性なし'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 mt-2 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            onSelectFunnelStore?.(null);
                          } else {
                            onSelectFunnelStore?.(st.storeId);
                            setActiveTargetStoreId(st.storeId);
                            const el = document.getElementById('target-step-3');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className={`w-full py-1 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : 'bg-white hover:bg-slate-200 text-amber-900 border border-amber-300'
                        }`}
                        data-testid={`select-store-${idx + 1}`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>選択中 (解除)</span>
                          </>
                        ) : (
                          <span>この店を選択 → 機種へ</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step ② Expanded Store Table */}
          {isStep2Expanded && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              {/* 1-line disclaimer */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-2xs text-slate-600 leading-relaxed flex items-center gap-2">
                <span className="font-bold text-slate-700 shrink-0">※ 注記:</span>
                <span>表示されている期待差枚は過去データに基づく縮小推計値（期待値）であり、当日の出玉や勝率・結果を保証するものではありません。</span>
              </div>

              {/* Store Rankings Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/80 text-slate-600 text-[11px] border-b border-slate-200 uppercase">
                    <tr>
                      <th className="px-3 py-2.5 font-bold w-12 text-center">順位</th>
                      <th className="px-4 py-2.5 font-bold">店舗名</th>
                      <th className="px-3 py-2.5 text-center font-bold">来店日特日判定</th>
                      <th className="px-4 py-2.5 text-right font-bold">
                        上位10台 期待差枚平均
                      </th>
                      <th className="px-3 py-2.5 text-center font-bold">評価日数</th>
                      <th className="px-4 py-2.5 text-center font-bold">バックテスト判定 / 実績リフト</th>
                      <th className="px-3 py-2.5 text-center font-bold">除外台数</th>
                      <th className="px-3 py-2.5 text-center font-bold w-36">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!rankingResult.storeRankings || rankingResult.storeRankings.length === 0) ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          評価可能な店舗データがありません。
                        </td>
                      </tr>
                    ) : (
                      rankingResult.storeRankings.map((st) => {
                        const edgeInfo = edgeCache[st.storeId];
                        const hasMach = stores.find((s) => s.id === st.storeId)?.dailyRecords?.some((r) => r.machines && r.machines.length > 0);
                        const isTesting = testingStoreId === st.storeId;
                        const storeObj = stores.find((s) => s.id === st.storeId);
                        const isSelected = funnelStoreId === st.storeId;

                        return (
                          <tr
                            key={st.storeId}
                            className={`hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-amber-50/60 font-bold' : ''
                            }`}
                          >
                            <td className="px-3 py-3 text-center font-black">
                              <span
                                className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs ${
                                  st.rank === 1
                                    ? 'bg-amber-500 text-slate-950 font-black'
                                    : st.rank === 2
                                    ? 'bg-slate-300 text-slate-900 font-bold'
                                    : st.rank === 3
                                    ? 'bg-amber-700 text-white font-bold'
                                    : 'text-slate-600'
                                }`}
                              >
                                #{st.rank}
                              </span>
                            </td>

                            <td className="px-4 py-3 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-bold">{st.storeName}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({st.rateExchange}枚交換)
                                </span>
                              </div>
                            </td>

                            <td className="px-3 py-3 text-center">
                              {st.isSpecialDay ? (
                                <span
                                  className="px-2 py-0.5 rounded-full text-2xs font-black bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1 shadow-2xs"
                                  title={st.specialDayReason}
                                >
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  {st.specialDayReason || '特日'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  通常日
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-mono font-black text-sm">
                              <span className={st.topNAvgExpectedDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                                {st.topNAvgExpectedDiff >= 0 ? `+${formatNumber(st.topNAvgExpectedDiff)}` : formatNumber(st.topNAvgExpectedDiff)}枚
                              </span>
                              {metricMode === 'yen' && st.expectedYenProfit !== undefined && (
                                <div className="text-[11px] font-bold text-amber-700">
                                  ({st.expectedYenProfit >= 0 ? `+${formatYen(st.expectedYenProfit)}` : formatYen(st.expectedYenProfit)})
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400 font-normal">
                                上位{st.evaluatedMachinesCount}台平均 ({diffMetric === 'baseGames' ? `基準${formatNumber(baseGames)}G` : '実稼働'})
                              </div>
                            </td>

                            <td className="px-3 py-3 text-center font-mono text-slate-700 font-medium">
                              {st.evaluationDays}日分
                            </td>

                            <td className="px-4 py-3 text-center">
                              {edgeInfo ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-2xs font-bold border flex items-center gap-1 ${
                                      edgeInfo.hasEdge
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                        : 'bg-slate-100 text-slate-600 border-slate-300'
                                    }`}
                                    title={edgeInfo.verdictMessage}
                                  >
                                    {edgeInfo.hasEdge ? (
                                      <>
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        優位性あり
                                      </>
                                    ) : (
                                      <>
                                        <HelpCircle className="w-3 h-3 text-slate-400" />
                                        優位性なし
                                      </>
                                    )}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-600 font-bold">
                                    リフト: {edgeInfo.top20AvgLift >= 0 ? `+${edgeInfo.top20AvgLift}` : edgeInfo.top20AvgLift}枚
                                    <span className="text-slate-400 font-normal ml-0.5">
                                      [{edgeInfo.top20Ci95[0]}〜{edgeInfo.top20Ci95[1]}]
                                    </span>
                                  </span>
                                </div>
                              ) : hasMach && storeObj ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="px-2 py-0.5 rounded text-2xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    未検証
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => runStoreEdgeTest(storeObj)}
                                    disabled={isTesting}
                                    className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 cursor-pointer disabled:opacity-50 flex items-center gap-0.5"
                                    title="この店舗の台番バックテストを実行"
                                  >
                                    {isTesting ? (
                                      <>
                                        <RotateCw className="w-2.5 h-2.5 animate-spin" />
                                        検証中
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-2.5 h-2.5" />
                                        検証
                                      </>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-2xs">未検証</span>
                              )}
                            </td>

                            <td className="px-3 py-3 text-center">
                              {st.excludedLowConfidenceCount > 0 ? (
                                <span
                                  className="px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
                                  title="根拠日数が少なく信頼度「低」と判定されたため平均から除外された台数"
                                >
                                  低信頼 {st.excludedLowConfidenceCount}台
                                </span>
                              ) : (
                                <span className="text-slate-400 text-2xs">0台</span>
                              )}
                            </td>

                            <td className="px-3 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      onSelectFunnelStore?.(null);
                                    } else {
                                      onSelectFunnelStore?.(st.storeId);
                                      setActiveTargetStoreId(st.storeId);
                                      const el = document.getElementById('target-step-3');
                                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                                    }
                                  }}
                                  className={`px-2 py-1 rounded-lg text-2xs font-bold border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-black'
                                      : 'bg-white hover:bg-amber-50 text-amber-900 border-amber-300'
                                  }`}
                                  data-testid={`select-store-row-${st.storeId}`}
                                >
                                  {isSelected ? '✓ 選択中' : '選択'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTargetStoreId(st.storeId);
                                    const el = document.getElementById('target-step-5');
                                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  className="px-2 py-1 rounded-lg text-2xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                                >
                                  狙い台
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Step ③: どの機種を狙うか (Prompt 47) */}
      <div id="target-step-3" className="space-y-3 scroll-mt-28">
        <div id="target-model-ranking" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                ③
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    どの機種を狙うか
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {step3Models.length}機種
                  </span>
                </div>
                <p className="text-2xs text-slate-500">
                  {funnelStoreId
                    ? `選択中店舗 (${stores.find((s) => s.id === funnelStoreId)?.name || ''}) の狙い機種`
                    : '全店横断の高設定・期待差枚機種ランキング'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsStep3Expanded(!isStep3Expanded)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
              data-testid="toggle-step-3-expand"
            >
              <span>{isStep3Expanded ? '折りたたむ' : `全件を見る (${step3Models.length}件)`}</span>
              {isStep3Expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Top 3 Summary Cards */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>上位3機種の要約</span>
            </div>
            {step3Models.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                対象となる機種データがありません。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {step3Models.slice(0, 3).map((m, idx) => {
                  const isModelSelected = funnelModelName === m.modelName;
                  return (
                    <div
                      key={`${m.storeId}-${m.modelName}-${idx}`}
                      className={`p-3 rounded-xl border transition-all ${
                        isModelSelected
                          ? 'border-indigo-400 bg-indigo-50/60 shadow-2xs ring-1 ring-indigo-400'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${
                              idx === 0
                                ? 'bg-amber-500 text-slate-950'
                                : idx === 1
                                ? 'bg-slate-300 text-slate-900'
                                : 'bg-amber-700 text-white'
                            }`}
                          >
                            #{m.rank || idx + 1}
                          </span>
                          <span className="font-mono text-2xs font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 truncate max-w-[90px]">
                            {m.storeName}
                          </span>
                        </div>
                        <span className="text-2xs text-slate-400 font-bold shrink-0">
                          {m.totalMachines}台設置
                        </span>
                      </div>

                      <div className="font-black text-slate-900 text-xs sm:text-sm truncate mb-1">
                        {m.modelName}
                      </div>

                      <div className="flex items-baseline justify-between text-xs mb-2">
                        <span className="text-[11px] text-slate-500 font-bold">期待差枚:</span>
                        <span
                          className={`font-mono font-black ${
                            m.expectedDiffCoins >= 0 ? 'text-blue-600' : 'text-rose-600'
                          }`}
                        >
                          {m.expectedDiffCoins >= 0 ? `+${formatNumber(m.expectedDiffCoins)}` : formatNumber(m.expectedDiffCoins)}枚
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b border-slate-100 mb-2">
                        <span>勝率: <strong className="text-slate-800 font-mono">{m.predictedWinRate}%</strong></span>
                        <span>出率: <strong className="text-slate-800 font-mono">{m.predictedPayoutRate}%</strong></span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isModelSelected) {
                            onSelectFunnelModel?.(null);
                          } else {
                            onSelectFunnelModel?.(m.modelName);
                            const el = document.getElementById('target-step-4');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                          isModelSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 font-black'
                            : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                        data-testid={`select-model-step3-${m.modelName}`}
                      >
                        {isModelSelected ? '✓ 選択中 (解除)' : 'この機種を選択 ›'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expanded Full TargetRankingTable for Models */}
          {isStep3Expanded && (
            <div className="pt-3 border-t border-slate-100">
              <TargetRankingTable
                rankingType="model"
                showStoreColumn={true}
                expandedIds={expandedModelKeys}
                onToggleExpand={(id) => {
                  const parts = id.split('___');
                  if (parts.length === 2) {
                    toggleExpandModel(parts[0], parts[1]);
                  }
                }}
                onSelectModel={(modelName) => {
                  onSelectFunnelModel?.(modelName ? modelName : null);
                  if (modelName) {
                    const el = document.getElementById('target-step-4');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                selectedModelName={funnelModelName}
                rows={step3Models.map((m) => {
                  const modelKey = `${m.storeId}___${m.modelName}`;
                  const subMachines = getMachinesForModelRank(m, rankingResult.machineRankings, filterCriteria);
                  const edge = edgeCache[m.storeId];

                  return {
                    id: modelKey,
                    rank: m.rank,
                    storeId: m.storeId,
                    storeName: m.storeName,
                    isSpecialDay: m.isSpecialDay,
                    modelName: m.modelName,
                    totalMachines: m.totalMachines,
                    expectedDiff: m.expectedDiffCoins,
                    expectedYen: m.expectedYenProfit,
                    uncertainty80: m.uncertainty80,
                    winRate: m.predictedWinRate,
                    payoutRate: m.predictedPayoutRate,
                    score: m.compositeScore,
                    reasons: [],
                    tacticalReason: m.tacticalReason || '根拠が少ないため参考表示',
                    verification: edge
                      ? {
                          status: edge.hasEdge ? 'edge' : 'noEdge',
                          hasEdge: edge.hasEdge,
                          avgLift: edge.top20AvgLift,
                          ci95: edge.top20Ci95,
                        }
                      : undefined,
                    subMachines: subMachines.map((em) => ({
                      id: `${em.storeId}-${em.machineNum}`,
                      rank: 0,
                      modelName: em.modelName,
                      machineNum: em.machineNum,
                      islandName: em.islandName || undefined,
                      confidence: em.confidence,
                      evidenceDays: em.evidenceDays,
                      expectedDiff: em.shrunkDiff,
                      expectedYen: em.expectedYenProfit,
                      interval80: em.interval80 || undefined,
                      uncertainty80: em.uncertainty80,
                      score: em.totalScore,
                      reasons: em.reasons,
                    })),
                  };
                })}
                toolbar={{
                  enabled: true,
                  availableModels,
                  availableIslands,
                  selectedModel: filterCriteria.modelName || 'all',
                  onModelChange: (model) =>
                    setFilterCriteria((prev) => ({ ...prev, modelName: model === 'all' ? '' : model })),
                  selectedTail:
                    filterCriteria.tailDigit !== null && filterCriteria.tailDigit !== undefined
                      ? String(filterCriteria.tailDigit)
                      : 'all',
                  onTailChange: (tail) =>
                    setFilterCriteria((prev) => ({ ...prev, tailDigit: tail === 'all' ? null : Number(tail) })),
                  selectedIsland: filterCriteria.islandName || 'all',
                  onIslandChange: (island) =>
                    setFilterCriteria((prev) => ({ ...prev, islandName: island === 'all' ? '' : island })),
                  selectedConfidence: filterCriteria.confidence || 'all',
                  onConfidenceChange: (conf) => setFilterCriteria((prev) => ({ ...prev, confidence: conf })),
                  minEvidenceDays: filterCriteria.minEvidenceDays || 0,
                  onMinEvidenceDaysChange: (days) =>
                    setFilterCriteria((prev) => ({ ...prev, minEvidenceDays: days })),
                  diffMetric: diffMetric === 'baseGames' ? 'std' : 'actual',
                  onDiffMetricChange: (metric) => setDiffMetric(metric === 'std' ? 'baseGames' : 'actual'),
                  baseGames,
                  onBaseGamesChange: setBaseGames,
                  metricMode,
                  onMetricModeChange: setMetricMode,
                  includeLowConfidence,
                  onToggleLowConfidence: setIncludeLowConfidence,
                  exportStoreName:
                    funnelStoreId
                      ? stores.find((s) => s.id === funnelStoreId)?.name || '店舗'
                      : '全店横断',
                  exportTargetDate: targetDate,
                  totalCount: rankingResult.modelRankings.length,
                  filteredCount: step3Models.length,
                }}
                emptyMessage={
                  activeFilterCount > 0
                    ? '絞り込み条件に一致する機種ランキングデータがありません。'
                    : '該当する機種ランキングデータがありません。'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* 4. Step ④: どの台を狙うか (Prompt 47) */}
      <div id="target-step-4" className="space-y-3 scroll-mt-28">
        <div id="target-machine-ranking" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                ④
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    どの台を狙うか
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {step4Machines.length}台
                  </span>
                </div>
                <p className="text-2xs text-slate-500">
                  {funnelModelName
                    ? `選択中機種 (${funnelModelName}) の台番別ランキング`
                    : funnelStoreId
                    ? `選択中店舗 (${stores.find((s) => s.id === funnelStoreId)?.name || ''}) の台番別ランキング`
                    : '台番号別の詳細期待差枚・信頼度ランキング'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsStep4Expanded(!isStep4Expanded)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
              data-testid="toggle-step-4-expand"
            >
              <span>{isStep4Expanded ? '折りたたむ' : `全件を見る (${step4Machines.length}台)`}</span>
              {isStep4Expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Top 3 Summary Cards */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>上位3台の要約</span>
            </div>
            {step4Machines.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                対象となる台番データがありません。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {step4Machines.slice(0, 3).map((mach, idx) => (
                  <div
                    key={`${mach.storeId}-${mach.machineNum}-${idx}`}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${
                            idx === 0
                              ? 'bg-amber-500 text-slate-950'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-900'
                              : 'bg-amber-700 text-white'
                          }`}
                        >
                          #{mach.rank || idx + 1}
                        </span>
                        <span className="font-mono text-2xs font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 truncate max-w-[90px]">
                          {mach.storeName}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-2xs font-bold border ${
                          mach.confidence === '高'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : mach.confidence === '中'
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        信頼度:{mach.confidence}
                      </span>
                    </div>

                    <div className="font-black text-slate-900 text-xs sm:text-sm truncate">
                      {mach.modelName}
                    </div>
                    <div className="text-2xs font-mono font-black text-indigo-700 mb-1.5">
                      {mach.machineNum}番台 {mach.islandName ? `(${mach.islandName})` : ''}
                    </div>

                    <div className="flex items-baseline justify-between text-xs mb-2">
                      <span className="text-[11px] text-slate-500 font-bold">期待差枚:</span>
                      <span
                        className={`font-mono font-black ${
                          mach.shrunkDiff >= 0 ? 'text-blue-600' : 'text-rose-600'
                        }`}
                      >
                        {mach.shrunkDiff >= 0 ? `+${formatNumber(mach.shrunkDiff)}` : formatNumber(mach.shrunkDiff)}枚
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(mach.machineNum, 'unavailable')}
                        className="py-1 px-1.5 rounded-lg text-2xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Ban className="w-3 h-3 text-slate-400" />
                        <span>空いてない</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(mach.machineNum, 'played')}
                        className="py-1 px-1.5 rounded-lg text-2xs font-bold border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Gamepad2 className="w-3 h-3 text-slate-400" />
                        <span>打った</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expanded Full TargetRankingTable for Machines */}
          {isStep4Expanded && (
            <div className="pt-3 border-t border-slate-100">
              <TargetRankingTable
                rankingType="machine"
                showStoreColumn={true}
                rows={step4Machines.map((mach) => {
                  const edge = edgeCache[mach.storeId];
                  const isTesting = testingStoreId === mach.storeId;
                  const storeObj = stores.find((s) => s.id === mach.storeId);

                  return {
                    id: `${mach.storeId}-${mach.machineNum}`,
                    rank: mach.rank,
                    storeId: mach.storeId,
                    storeName: mach.storeName,
                    isSpecialDay: Boolean(rankingResult.storeRankings?.find((s) => s.storeId === mach.storeId)?.isSpecialDay),
                    modelName: mach.modelName,
                    machineNum: mach.machineNum,
                    islandName: mach.islandName || undefined,
                    confidence: mach.confidence,
                    evidenceDays: mach.evidenceDays,
                    expectedDiff: mach.shrunkDiff,
                    expectedYen: mach.expectedYenProfit,
                    interval80: mach.interval80 || undefined,
                    uncertainty80: mach.uncertainty80,
                    score: mach.totalScore,
                    reasons: mach.reasons,
                    verification: isTesting
                      ? { status: 'testing', isTesting: true }
                      : edge
                      ? {
                          status: edge.hasEdge ? 'edge' : 'noEdge',
                          hasEdge: edge.hasEdge,
                          avgLift: edge.top20AvgLift,
                          ci95: edge.top20Ci95,
                        }
                      : storeObj
                      ? {
                          status: 'untested',
                          onRunTest: () => runStoreEdgeTest(storeObj),
                        }
                      : undefined,
                  };
                })}
                toolbar={{
                  enabled: true,
                  availableModels,
                  availableIslands,
                  selectedModel: filterCriteria.modelName || 'all',
                  onModelChange: (model) =>
                    setFilterCriteria((prev) => ({ ...prev, modelName: model === 'all' ? '' : model })),
                  selectedTail:
                    filterCriteria.tailDigit !== null && filterCriteria.tailDigit !== undefined
                      ? String(filterCriteria.tailDigit)
                      : 'all',
                  onTailChange: (tail) =>
                    setFilterCriteria((prev) => ({ ...prev, tailDigit: tail === 'all' ? null : Number(tail) })),
                  selectedIsland: filterCriteria.islandName || 'all',
                  onIslandChange: (island) =>
                    setFilterCriteria((prev) => ({ ...prev, islandName: island === 'all' ? '' : island })),
                  selectedConfidence: filterCriteria.confidence || 'all',
                  onConfidenceChange: (conf) => setFilterCriteria((prev) => ({ ...prev, confidence: conf })),
                  minEvidenceDays: filterCriteria.minEvidenceDays || 0,
                  onMinEvidenceDaysChange: (days) =>
                    setFilterCriteria((prev) => ({ ...prev, minEvidenceDays: days })),
                  diffMetric: diffMetric === 'baseGames' ? 'std' : 'actual',
                  onDiffMetricChange: (metric) => setDiffMetric(metric === 'std' ? 'baseGames' : 'actual'),
                  baseGames,
                  onBaseGamesChange: setBaseGames,
                  metricMode,
                  onMetricModeChange: setMetricMode,
                  includeLowConfidence,
                  onToggleLowConfidence: setIncludeLowConfidence,
                  exportStoreName:
                    funnelStoreId
                      ? stores.find((s) => s.id === funnelStoreId)?.name || '店舗'
                      : '全店横断',
                  exportTargetDate: targetDate,
                  totalCount: rankingResult.machineRankings.length,
                  filteredCount: step4Machines.length,
                }}
                emptyMessage={
                  activeFilterCount > 0
                    ? '絞り込み条件に一致する台番号別データがありません。'
                    : includeLowConfidence
                    ? '台番号別のランキングデータが存在しません。'
                    : '信頼度「中」以上の台番号別データがありません。「低信頼も表示」にチェックを入れると表示されます。'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* 5. Step ⑤: 当日のチェックリスト (Prompt 47) */}
      {(() => {
        const effectiveChecklistStoreId = funnelStoreId || activeTargetStoreId;
        const activeStoreObj = stores.find((s) => s.id === effectiveChecklistStoreId) || stores[0];
        let rawStoreCandidates = rankingResult.storeMachineRankings?.[effectiveChecklistStoreId] || [];
        if (funnelModelName) {
          rawStoreCandidates = rawStoreCandidates.filter((m) => m.modelName === funnelModelName);
        }
        const storeCandidates = filterMachineRankings(rawStoreCandidates, filterCriteria);
        const { activeCandidates, checkedCandidates, rolledUpCount } = filterAndRollupTargetList(
          storeCandidates,
          checkedMap,
          10
        );
        const activePastPerf = pastPerformanceMap[effectiveChecklistStoreId];

        return (
          <div id="target-step-5" className="space-y-3 scroll-mt-28">
            <div id="target-checklist" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                    ⑤
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-slate-900">
                        当日のチェックリスト
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        未チェック {activeCandidates.length}台
                      </span>
                      {checkedCandidates.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          チェック済 {checkedCandidates.length}台
                        </span>
                      )}
                    </div>
                    <p className="text-2xs text-slate-500">
                      ホール到着後の空き台チェック・繰り上がり管理（{activeStoreObj?.name || '店舗未選択'}）
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStep5Expanded(!isStep5Expanded)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                  data-testid="toggle-step-5-expand"
                >
                  <span>{isStep5Expanded ? '折りたたむ' : `全件を見る (${activeCandidates.length}台)`}</span>
                  {isStep5Expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Top 3 Summary Cards */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>上位3候補の要約</span>
                </div>
                {activeCandidates.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    {storeCandidates.length === 0
                      ? 'この店舗の台番別ランキングデータがありません。'
                      : 'すべての候補台がチェック済みです。'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {activeCandidates.slice(0, 3).map((mach, idx) => (
                      <div
                        key={`${mach.storeId}-${mach.machineNum}-${idx}`}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-start justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${
                                idx === 0
                                  ? 'bg-amber-500 text-slate-950'
                                  : idx === 1
                                  ? 'bg-slate-300 text-slate-900'
                                  : 'bg-amber-700 text-white'
                              }`}
                            >
                              #{mach.rank || idx + 1}
                            </span>
                            <span className="font-mono text-2xs font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 truncate max-w-[90px]">
                              {mach.storeName || activeStoreObj?.name}
                            </span>
                            <span className="font-mono text-2xs font-extrabold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              #{mach.machineNum}番台
                            </span>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-2xs font-bold border ${
                              mach.confidence === '高'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : mach.confidence === '中'
                                ? 'bg-amber-50 text-amber-700 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            信頼度:{mach.confidence}
                          </span>
                        </div>

                        <div className="font-black text-slate-900 text-xs sm:text-sm truncate">
                          {mach.modelName}
                        </div>
                        {mach.islandName && (
                          <div className="text-2xs text-slate-400 truncate mb-1">
                            {mach.islandName}
                          </div>
                        )}

                        <div className="flex items-baseline justify-between text-xs mb-2">
                          <span className="text-[11px] text-slate-500 font-bold">期待差枚:</span>
                          <span
                            className={`font-mono font-black ${
                              mach.shrunkDiff >= 0 ? 'text-blue-600' : 'text-rose-600'
                            }`}
                          >
                            {mach.shrunkDiff >= 0 ? `+${formatNumber(mach.shrunkDiff)}` : formatNumber(mach.shrunkDiff)}枚
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleToggleCheck(mach.machineNum, 'unavailable')}
                            className="py-1 px-1.5 rounded-lg text-2xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Ban className="w-3 h-3 text-slate-400" />
                            <span>空いてない</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCheck(mach.machineNum, 'played')}
                            className="py-1 px-1.5 rounded-lg text-2xs font-bold border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Gamepad2 className="w-3 h-3 text-slate-400" />
                            <span>打った</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expanded Full Checklist Board */}
              {isStep5Expanded && (
                <div className="space-y-4 pt-3 border-t border-slate-100">
                {/* Store Selector (if multiple stores exist) */}
                {stores.length > 1 && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                      来店店舗を選択 ({stores.length}店舗登録):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {stores.map((s) => {
                        const isCurrent = effectiveChecklistStoreId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              onSelectFunnelStore?.(s.id);
                              setActiveTargetStoreId(s.id);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isCurrent
                                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Building2 className="w-3.5 h-3.5 opacity-70" />
                            <span>{s.name}</span>
                            <span className="text-[10px] opacity-70">
                              ({s.exchangeRate || `${s.rateExchange || 52}枚`})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Store Target Board */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
                  {/* Store Header & Date */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-indigo-600 shrink-0" />
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900">
                          {activeStoreObj?.name || '店舗未選択'}
                        </h3>
                        <p className="text-2xs text-slate-500">
                          換金率: {activeStoreObj?.exchangeRate || `${activeStoreObj?.rateExchange || 52}枚交換`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                        来店日: <span className="text-slate-900 font-mono font-black">{targetDate}</span>
                      </span>
                    </div>
                  </div>

                  {/* 30-6: 画面の期待差枚と実績リフトの並置・較正表示 */}
                  {(() => {
                    const top20StoreCandidates = storeCandidates.slice(0, 20);
                    const top20StoreExpectedDiff = top20StoreCandidates.length > 0
                      ? Math.round(
                          top20StoreCandidates.reduce((acc, m) => acc + (m.expectedDiffCoins || m.shrunkDiff), 0) /
                            top20StoreCandidates.length
                        )
                      : 0;
                    const activeEdge = edgeCache[activeTargetStoreId];
                    const isTestingActiveStore = testingStoreId === activeTargetStoreId;
                    const isUnderperforming =
                      Boolean(activeEdge && top20StoreExpectedDiff > 100 && activeEdge.top20AvgLift < top20StoreExpectedDiff * 0.70);
                    const realizedPct =
                      activeEdge && top20StoreExpectedDiff > 0
                        ? Math.max(0, Math.round((activeEdge.top20AvgLift / top20StoreExpectedDiff) * 100))
                        : 0;

                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <Scale className="w-4 h-4 text-indigo-600" />
                            <span>表示値の較正（期待値 vs 過去検証実績リフト）</span>
                          </div>
                          {activeEdge && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-2xs font-bold border flex items-center gap-1 ${
                                activeEdge.hasEdge
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              {activeEdge.hasEdge ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  優位性あり
                                </>
                              ) : (
                                <>
                                  <HelpCircle className="w-3 h-3 text-slate-400" />
                                  優位性なし
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-center font-mono">
                          {/* 画面の期待差枚 (上位20台平均) */}
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-center">
                            <div className="text-[10px] text-slate-400 font-sans font-bold">画面の期待差枚 (上位20台平均)</div>
                            <div className={`text-base font-black ${top20StoreExpectedDiff >= 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
                              {top20StoreExpectedDiff >= 0 ? `+${formatNumber(top20StoreExpectedDiff)}` : formatNumber(top20StoreExpectedDiff)}枚
                            </div>
                          </div>

                          {/* 過去検証の実績リフト (上位20台・95%区間) */}
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-center">
                            <div className="text-[10px] text-slate-400 font-sans font-bold">過去検証の実績リフト (上位20台・95%区間)</div>
                            {isTestingActiveStore ? (
                              <div className="text-xs font-bold text-sky-600 flex items-center justify-center gap-1 py-1">
                                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                                <span>検証中...</span>
                              </div>
                            ) : activeEdge ? (
                              <div>
                                <span className={`text-base font-black ${activeEdge.top20AvgLift >= 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                  {activeEdge.top20AvgLift >= 0 ? `+${formatNumber(activeEdge.top20AvgLift)}` : formatNumber(activeEdge.top20AvgLift)}枚
                                </span>
                                <span className="text-[11px] text-slate-500 font-normal ml-1">
                                  [{activeEdge.top20Ci95[0]}〜{activeEdge.top20Ci95[1]}枚]
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2 py-0.5">
                                <span className="text-xs text-slate-400">未検証</span>
                                <button
                                  type="button"
                                  onClick={() => activeStoreObj && runStoreEdgeTest(activeStoreObj)}
                                  className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-2xs font-bold border border-indigo-200 cursor-pointer"
                                >
                                  検証を実行
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 較正警告表示 */}
                        {isUnderperforming && activeEdge && (
                          <div className="p-2.5 bg-amber-500/10 border border-amber-300 rounded-lg text-amber-950 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <p className="font-bold text-[11px] leading-snug">
                              過去の実績では、表示の期待値のうち約{realizedPct}%しか実現していません
                              <span className="font-normal text-amber-800 ml-1">
                                （表示上位20台平均 +{top20StoreExpectedDiff}枚 に対し、過去検証実績リフトは {activeEdge.top20AvgLift >= 0 ? '+' : ''}{activeEdge.top20AvgLift}枚 [95%区間: {activeEdge.top20Ci95[0]}〜{activeEdge.top20Ci95[1]}枚] です）
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Past Performance Card (Requirement 4) */}
                  {activePastPerf && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <History className="w-4 h-4 text-indigo-600" />
                          <span>過去成績検証 (直近上位10台選定実績)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500 font-bold">検証日数:</label>
                          <select
                            value={pastPerfRecentDays}
                            onChange={(e) => setPastPerfRecentDays(Number(e.target.value))}
                            className="bg-white border border-slate-200 rounded px-2 py-0.5 text-2xs font-bold text-slate-700 cursor-pointer focus:outline-hidden"
                          >
                            <option value={14}>直近14日</option>
                            <option value={30}>直近30日 (既定)</option>
                            <option value={60}>直近60日</option>
                            <option value={90}>直近90日</option>
                          </select>
                          {activePastPerf.isReferenceOnly ? (
                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              参考表示（優位性未確認）
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              優位性あり
                            </span>
                          )}
                        </div>
                      </div>

                      {activePastPerf.actualDaysCount > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center font-mono">
                          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                            <div className="text-[10px] text-slate-400 font-sans">上位10台実績平均</div>
                            <div className={`text-sm font-black ${activePastPerf.top10AvgDiff >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                              {activePastPerf.top10AvgDiff >= 0 ? `+${formatNumber(activePastPerf.top10AvgDiff)}` : formatNumber(activePastPerf.top10AvgDiff)}枚
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                            <div className="text-[10px] text-slate-400 font-sans">ホール全体平均</div>
                            <div className={`text-sm font-bold ${activePastPerf.hallAvgDiff >= 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                              {activePastPerf.hallAvgDiff >= 0 ? `+${formatNumber(activePastPerf.hallAvgDiff)}` : formatNumber(activePastPerf.hallAvgDiff)}枚
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                            <div className="text-[10px] text-slate-400 font-sans">リフト差枚</div>
                            <div className={`text-sm font-black ${activePastPerf.lift >= 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {activePastPerf.lift >= 0 ? `+${formatNumber(activePastPerf.lift)}` : formatNumber(activePastPerf.lift)}枚
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                            <div className="text-[10px] text-slate-400 font-sans">評価日数</div>
                            <div className="text-sm font-bold text-slate-700">
                              {activePastPerf.actualDaysCount}日
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 text-center py-1">
                          {activePastPerf.verdictMessage}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Bar: Copy Text, Download CSV, Reset Checks (Requirement 2 & 1) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyText(activeStoreObj?.name || '', activeCandidates)}
                        className="py-1.5 px-3 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="クリップボードにテキストでコピー"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>テキストコピー</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadCsv(activeStoreObj?.name || '', activeCandidates)}
                        className="py-1.5 px-3 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="CSVファイルとしてダウンロード"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV書き出し</span>
                      </button>

                      {copyFeedback && (
                        <span className="text-xs font-bold text-emerald-600 animate-in fade-in flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          {copyFeedback}
                        </span>
                      )}
                    </div>

                    {Object.keys(checkedMap).length > 0 && (
                      <button
                        type="button"
                        onClick={handleResetChecks}
                        className="py-1 px-2.5 rounded-lg text-2xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                        title="チェックした台（空いていない・打った）をすべてクリア"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>チェック全解除 ({Object.keys(checkedMap).length}台)</span>
                      </button>
                    )}
                  </div>

                  {/* Rolled Up Notification Banner */}
                  {rolledUpCount > 0 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          繰り上がり適用中: チェック除外により、次点候補 <strong>{rolledUpCount}台</strong> が上位リストに繰り上がっています。
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Active Candidates List Cards (Requirement 1, 3, 5: 375px mobile friendly) */}
                  <div className="space-y-3">
                    {activeCandidates.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        {storeCandidates.length === 0
                          ? 'この店舗の台番別ランキングデータがありません。'
                          : 'すべての候補台がチェック済みです。「チェック全解除」で元に戻せます。'}
                      </div>
                    ) : (
                      activeCandidates.map((mach) => (
                        <div
                          key={`${mach.storeId}-${mach.machineNum}`}
                          className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 shadow-2xs hover:border-slate-300 transition-all min-w-0"
                        >
                          {/* Top Row: Rank, Model, MachineNum, Island, Confidence */}
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg text-xs font-black ${
                                  mach.rank === 1
                                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                                    : mach.rank === 2
                                    ? 'bg-slate-300 text-slate-900'
                                    : mach.rank === 3
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                #{mach.rank}
                              </span>
                              <div className="min-w-0">
                                <div className="font-black text-slate-900 text-xs sm:text-sm truncate">
                                  {mach.modelName}
                                </div>
                                <div className="flex items-center gap-1.5 text-2xs text-slate-500 flex-wrap">
                                  <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                    {mach.machineNum}番台
                                  </span>
                                  {mach.islandName && (
                                    <span className="truncate max-w-[120px] text-slate-400">
                                      {mach.islandName}
                                    </span>
                                  )}
                                  {mach.originalRank !== mach.rank && (
                                    <span className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1 rounded">
                                      繰上 (元#{mach.originalRank})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-2xs font-bold border ${
                                mach.confidence === '高'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : mach.confidence === '中'
                                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              信頼度:{mach.confidence} (根拠{mach.evidenceDays}日)
                            </span>
                          </div>

                          {/* Expected Diff & Uncertainty (30-4) */}
                          <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-[11px] font-bold text-slate-500">期待差枚:</span>
                              <span
                                className={`font-mono font-black text-sm ${
                                  mach.shrunkDiff >= 0
                                    ? 'text-blue-600'
                                    : 'text-rose-600'
                                }`}
                              >
                                {mach.shrunkDiff >= 0 ? '+' : ''}
                                {formatNumber(mach.shrunkDiff)}
                                枚
                              </span>
                              <span className="text-2xs text-slate-400">
                                ({diffMetric === 'baseGames' ? `基準${formatNumber(baseGames)}G` : `実稼働${formatNumber(mach.avgGames || 5000)}G`}換算
                                {mach.shrunkPayoutRate !== undefined ? `, 推定出率 ${mach.shrunkPayoutRate}%` : ''})
                              </span>
                              {mach.avgGames && diffMetric !== 'baseGames' && (
                                <span className="text-2xs text-slate-500">
                                  • 平均稼働: {formatNumber(mach.avgGames)}G/日
                                </span>
                              )}
                              {metricMode === 'yen' && (
                                <span className="text-2xs font-mono text-amber-700 font-bold">
                                  ({mach.expectedYenProfit >= 0 ? `+${formatYen(mach.expectedYenProfit)}` : formatYen(mach.expectedYenProfit)})
                                </span>
                              )}
                            </div>

                            {/* Uncertainty Display: 80% range (30-2 / 30-4 interval80優先表示) */}
                            {mach.interval80 ? (
                              <div className="flex items-center gap-1 text-[11px] text-slate-600 flex-wrap">
                                <span className="text-2xs text-slate-400 font-bold">80%範囲:</span>
                                <span className="font-mono text-2xs font-bold">
                                  {mach.interval80[0] >= 0 ? `+${mach.interval80[0]}` : mach.interval80[0]} 〜{' '}
                                  {mach.interval80[1] >= 0 ? `+${mach.interval80[1]}` : mach.interval80[1]}枚
                                </span>
                                {mach.uncertainty80?.isWide && (
                                  <span
                                    className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold shrink-0"
                                    title="不確実性の幅が広くブレに注意が必要です"
                                  >
                                    ⚠️ ブレ注意
                                  </span>
                                )}
                              </div>
                            ) : mach.uncertainty80 && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-600 flex-wrap">
                                <span className="text-2xs text-slate-400 font-bold">80%区間:</span>
                                <span className="font-mono text-2xs font-bold">
                                  {mach.uncertainty80.min >= 0 ? `+${mach.uncertainty80.min}` : mach.uncertainty80.min} 〜{' '}
                                  {mach.uncertainty80.max >= 0 ? `+${mach.uncertainty80.max}` : mach.uncertainty80.max}枚
                                </span>
                                <span className="text-2xs text-slate-400">
                                  (±{mach.uncertainty80.margin}枚)
                                </span>
                                {mach.uncertainty80.isWide && (
                                  <span
                                    className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold shrink-0"
                                    title="不確実性の幅が広くブレに注意が必要です"
                                  >
                                    ⚠️ ブレ注意
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Tactical Reasons Bullets */}
                          <div className="text-2xs text-slate-600 space-y-0.5">
                            {mach.reasons.map((r, rIdx) => (
                              <div key={rIdx} className="leading-tight text-slate-500">
                                • {r}
                              </div>
                            ))}
                          </div>

                          {/* Action Buttons: 空いていない & 打った (Requirement 1) */}
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleToggleCheck(mach.machineNum, 'unavailable')}
                              className="w-full py-1.5 px-2 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5 text-slate-400" />
                              <span>空いていない</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCheck(mach.machineNum, 'played')}
                              className="w-full py-1.5 px-2 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Gamepad2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>打った</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Checked / Excluded Machines Collapsible Section */}
                  {checkedCandidates.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setShowCheckedList(!showCheckedList)}
                        className="flex items-center justify-between w-full p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <Ban className="w-3.5 h-3.5 text-slate-500" />
                          <span>チェック済み・除外台 ({checkedCandidates.length}台)</span>
                        </div>
                        {showCheckedList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {showCheckedList && (
                        <div className="space-y-2 pt-1">
                          {checkedCandidates.map((item) => (
                            <div
                              key={item.machineNum}
                              className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs opacity-75"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-800">{item.machineNum}番台</span>
                                <span className="font-bold text-slate-700 truncate max-w-[140px] sm:max-w-none">
                                  {item.modelName}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    item.checkStatus === 'unavailable'
                                      ? 'bg-slate-200 text-slate-700'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {item.checkStatus === 'unavailable' ? '空いていない' : '打った'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUncheckMachine(item.machineNum)}
                                className="px-2.5 py-1 text-2xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                              >
                                解除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    })()}
  </div>
);
};
