import React, { useState, useRef, useEffect } from 'react';
import { StoreProfile, CategoryRateOverride } from '../data/types';
import { ConfirmModal } from './ConfirmModal';
import {
  parseMultipleSlorepoHtml,
  parseMultipleSlorepoHtmlAsync,
  readFilesAsText,
  ParsedStoreGroup,
} from '../utils/multiHtmlParser';
import { parseSlorepoHtml } from '../utils/htmlParser';
import { generateUnitLevelCsvTemplate } from '../utils/csvParser';
import {
  X,
  Building2,
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  Trash2,
  Check,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Loader2,
  FolderPlus,
  RefreshCw,
  Layers,
  ArrowRight,
  Edit3,
  Save,
  Download,
  Database,
  HardDriveDownload,
} from 'lucide-react';
import { parseSpecialDayRulesFromText } from '../utils/specialDayRules';
import { parseIslandConfig } from '../utils/islandUtils';
import {
  exportAllStoresAsJson,
  parseStoresFromBackupJson,
  mergeImportedStores,
} from '../utils/storeBackup';
import { notifyStorageEvent } from '../utils/storageNotifier';

interface StoreManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreProfile[];
  activeStoreId: string;
  onSelectStore: (id: string) => void;
  onSaveStore: (store: StoreProfile) => void;
  onSaveStores?: (stores: StoreProfile[], preferActiveId?: string) => void;
  onUpdateStore?: (store: StoreProfile) => void;
  onDeleteStore: (id: string) => void;
  onResetAllStores: () => void;
  initialTab?: 'import' | 'list' | 'backup';
}

export const StoreManagerModal: React.FC<StoreManagerModalProps> = ({
  isOpen,
  onClose,
  stores,
  activeStoreId,
  onSelectStore,
  onSaveStore,
  onSaveStores,
  onUpdateStore,
  onDeleteStore,
  onResetAllStores,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'list' | 'backup'>(
    initialTab || 'import'
  );

  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // HTML import state
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pastedHtml, setPastedHtml] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [loadedFilesCount, setLoadedFilesCount] = useState<number>(0);

  // Staged multi-store groups
  const [stagedGroups, setStagedGroups] = useState<ParsedStoreGroup[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseSuccessMsg, setParseSuccessMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup states
  const [backupStatusMsg, setBackupStatusMsg] = useState<string>('');
  const [backupErrorMsg, setBackupErrorMsg] = useState<string>('');
  const [backupFileDragging, setBackupFileDragging] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    try {
      if (stores.length === 0) {
        setBackupErrorMsg('バックアップ対象の店舗が登録されていません。');
        return;
      }
      exportAllStoresAsJson(stores);
      setBackupStatusMsg(`全${stores.length}店舗のバックアップJSONをエクスポートしました。`);
      setBackupErrorMsg('');
      notifyStorageEvent({
        type: 'success',
        title: 'バックアップ完了',
        message: `${stores.length}店舗の全出玉・設定データをJSONとしてエクスポートしました。`,
      });
    } catch (err: any) {
      setBackupErrorMsg(`エクスポートに失敗しました: ${err?.message || err}`);
    }
  };

  const handleImportBackupJsonFile = async (file: File) => {
    setBackupErrorMsg('');
    setBackupStatusMsg('');
    try {
      const text = await file.text();
      const res = parseStoresFromBackupJson(text);
      if (!res.success || res.importedStores.length === 0) {
        setBackupErrorMsg(res.error || 'JSONファイルの解析に失敗しました。');
        return;
      }
      const merged = mergeImportedStores(stores, res.importedStores);
      if (onSaveStores) {
        onSaveStores(merged, res.importedStores[0]?.id);
      } else {
        merged.forEach((s) => onSaveStore(s));
        if (res.importedStores[0]?.id) {
          onSelectStore(res.importedStores[0].id);
        }
      }
      setBackupStatusMsg(
        `バックアップから${res.importedStores.length}店舗（合計${res.totalRecordsCount}日分）を正常に復元・統合しました！`
      );
      notifyStorageEvent({
        type: 'success',
        title: 'バックアップ復元完了',
        message: `${res.importedStores.length}店舗（合計${res.totalRecordsCount}日分）を取り込みました。`,
      });
      setActiveTab('list');
    } catch (err: any) {
      setBackupErrorMsg(`インポートエラー: ${err?.message || err}`);
    }
  };

  // Store editing states (in list tab)
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StoreProfile> | null>(null);

  // In-app confirmation dialog states
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);
  const [storeToDelete, setStoreToDelete] = useState<{ id: string; name: string } | null>(null);

  if (!isOpen) return null;

  // Process multiple file objects
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    // Auto-detect JSON backup file
    const fileList = Array.from(files);
    if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.json')) {
      await handleImportBackupJsonFile(fileList[0]);
      return;
    }

    setIsProcessing(true);
    setProcessStatus(`ファイルを読込中... (0/${files.length}件)`);
    setProgressPercent(5);
    setParseErrors([]);
    setParseSuccessMsg('');
    setStagedGroups([]);

    try {
      const readResults = await readFilesAsText(files, (done, total) => {
        setProcessStatus(`ファイルを読み込み中... (${done}/${total}件)`);
        setProgressPercent(Math.round((done / total) * 45));
      });

      if (readResults.length === 0) {
        setParseErrors(['選択されたファイルからデータを読み込めませんでした。']);
        setIsProcessing(false);
        setProcessStatus('');
        return;
      }

      setLoadedFilesCount(readResults.length);
      setProcessStatus(`出玉データを解析・統合中... (0/${readResults.length}件)`);
      setProgressPercent(50);

      const parseResult = await parseMultipleSlorepoHtmlAsync(readResults, stores, (done, total) => {
        setProcessStatus(`出玉データを解析・統合中... (${done}/${total}件)`);
        setProgressPercent(50 + Math.round((done / total) * 48));
      });

      if (!parseResult.success || parseResult.stores.length === 0) {
        const errList = parseResult.errors.slice(0, 10).map((e) => `${e.fileName}: ${e.error}`);
        setParseErrors(
          errList.length > 0 ? errList : ['有効な出玉データを含むスロレポHTMLが見つかりませんでした。']
        );
        setIsProcessing(false);
        setProcessStatus('');
        return;
      }

      setStagedGroups(parseResult.stores);

      if (parseResult.errors.length > 0) {
        setParseErrors(
          parseResult.errors.slice(0, 5).map((e) => `スキップ: ${e.fileName} (${e.error})`)
        );
      }

      const totalRecs = parseResult.totalRecordsCount;
      const storesCount = parseResult.stores.length;
      if (storesCount === 1) {
        const single = parseResult.stores[0];
        setParseSuccessMsg(
          `「${single.store.name}」のデータ解析に成功しました！（${single.sourceFileNames.length}ファイル統合・全${single.totalRecordsCount}日分）`
        );
      } else {
        setParseSuccessMsg(
          `${readResults.length}件のファイルから【${storesCount}店舗・合計${totalRecs}日分】の出玉データを一括解析しました！`
        );
      }
    } catch (err: any) {
      setParseErrors([`ファイル処理中にエラーが発生しました: ${err?.message || err}`]);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
      setProgressPercent(100);
    }
  };

  // Process pasted raw HTML string
  const handleProcessPastedHtml = (htmlContent: string) => {
    setParseErrors([]);
    setParseSuccessMsg('');
    setStagedGroups([]);

    if (!htmlContent.trim()) {
      setParseErrors(['HTMLデータが空です。ファイルを指定するかHTMLを貼り付けてください。']);
      return;
    }

    const parseResult = parseMultipleSlorepoHtml(
      [{ name: 'pasted_source.html', content: htmlContent }],
      stores
    );

    if (!parseResult.success || parseResult.stores.length === 0) {
      const errList = parseResult.errors.map((e) => e.error);
      setParseErrors(errList.length > 0 ? errList : ['HTMLの解析に失敗しました。']);
      return;
    }

    setLoadedFilesCount(1);
    setStagedGroups(parseResult.stores);
    const single = parseResult.stores[0];
    setParseSuccessMsg(
      `「${single.store.name}」のデータ解析に成功しました！（全${single.totalRecordsCount}日分）`
    );
  };

  // File input change (supports multiple)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  // Drag & Drop (supports multiple)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Batch register ALL staged stores
  const handleConfirmAddAllStores = () => {
    if (stagedGroups.length === 0) return;
    const storeProfiles = stagedGroups.map((g) => g.store);
    if (onSaveStores) {
      onSaveStores(storeProfiles, storeProfiles[0].id);
    } else {
      storeProfiles.forEach((s) => onSaveStore(s));
      onSelectStore(storeProfiles[0].id);
    }
    setStagedGroups([]);
    setLoadedFilesCount(0);
    setPastedHtml('');
    setParseSuccessMsg('');
    setActiveTab('list');
  };

  // Register a SINGLE store from staged groups
  const handleConfirmSingleStore = (group: ParsedStoreGroup) => {
    onSaveStore(group.store);
    onSelectStore(group.store.id);
    const remaining = stagedGroups.filter((g) => g.store.id !== group.store.id);
    setStagedGroups(remaining);
    if (remaining.length === 0) {
      setLoadedFilesCount(0);
      setPastedHtml('');
      setParseSuccessMsg('');
      setActiveTab('list');
    }
  };

  // Exclude a store from staging
  const handleRemoveStagedGroup = (storeId: string) => {
    setStagedGroups((prev) => prev.filter((g) => g.store.id !== storeId));
  };

  // Reset all
  const handleResetConfirm = () => {
    setConfirmResetOpen(true);
  };

  const grandTotalRecordsInStaged = stagedGroups.reduce(
    (acc, g) => acc + g.totalRecordsCount,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl border border-amber-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                店舗管理 & データ取込
              </h2>
              <p className="text-xs text-slate-500">
                みんレポ台番CSV・アナスロ・スロレポの出玉ファイルを取り込んで分析店舗として登録します（台番自動取得・一括取込対応）
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 bg-white">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'import'
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              出玉データ取込 (CSV / HTML一括対応)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'list'
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              登録済み店舗一覧 ({stores.length}店舗)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'backup'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Database className="w-4 h-4" />
              バックアップ / 復元 (全店舗JSON)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {stores.length > 0 && (
              <button
                type="button"
                onClick={handleExportBackup}
                title="全店舗データをJSONファイルとしてダウンロード"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:bg-indigo-50 px-2.5 py-1 rounded-md transition-colors cursor-pointer border border-indigo-200"
              >
                <Download className="w-3.5 h-3.5" />
                全店舗バックアップ
              </button>
            )}
            {stores.length > 0 && (
              <button
                type="button"
                onClick={handleResetConfirm}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 hover:bg-rose-50 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                初期状態にリセット
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: DATA IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              {/* Guidance Banner */}
              <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                  みんレポ台番CSV（店舗名,日付,機種,台番,差枚,G数,出率,参照URL）およびアナスロ・スロレポHTML対応
                </div>
                <p className="text-amber-800 leading-relaxed">
                  保存したみんレポ台番CSV（<code>.csv</code>）や店舗HTML（<code>.html</code> / <code>.htm</code>）を<strong>複数まとめてドラッグ＆ドロップまたは選択</strong>できます。
                  テーブル内の<strong>「台番」</strong>から台番号・差枚・G数・出率を自動取得し、機種別・末尾別の深掘り分析へ完全反映します。
                </p>
              </div>

              {/* Input Mode Selector */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setInputMode('file')}
                    className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                      inputMode === 'file'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    CSV / HTMLファイルを選択 (複数可)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                      inputMode === 'paste'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    テキスト / CSVを直接貼り付け
                  </button>
                </div>
              </div>

              {/* Mode A: File Dropzone (Multiple Files) */}
              {inputMode === 'file' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                    isDragging
                      ? 'border-amber-500 bg-amber-50/50 scale-[0.99]'
                      : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-amber-400'
                  } ${isProcessing ? 'opacity-70 cursor-wait' : ''}`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    multiple
                    accept=".csv,.tsv,.txt,.html,.htm,text/csv,text/html,text/plain"
                    className="hidden"
                  />

                  {isProcessing ? (
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-2xs">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-2xs">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                  )}

                  <div>
                    {isProcessing ? (
                      <div className="space-y-2 max-w-md mx-auto">
                        <p className="text-sm font-bold text-amber-700 animate-pulse">
                          {processStatus || 'ファイルを解析中... しばらくお待ちください'}
                        </p>
                        <div className="w-64 mx-auto bg-amber-100 rounded-full h-2 overflow-hidden border border-amber-200">
                          <div
                            className="bg-amber-600 h-full transition-all duration-200 rounded-full"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          大量のファイル（店舗別CSVやHTML 100件以上）もブラウザ内で安全に順次解析・統合しています
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-slate-800">
                          ここに店舗別CSVファイルまたはHTMLファイルをドラッグ＆ドロップ（複数ファイル一括対応）
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          クリックしてPCから複数ファイルを選択（店舗ごとに別々のCSVファイルや複数日HTMLをまとめて選択可能）
                        </p>
                      </>
                    )}
                  </div>

                  {loadedFilesCount > 0 && !isProcessing && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                      <FileCode className="w-3.5 h-3.5" />
                      選択済み: {loadedFilesCount} ファイル処理完了
                    </div>
                  )}
                </div>
              )}

              {/* Mode B: CSV / HTML Code Paste */}
              {inputMode === 'paste' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      CSVデータ（店舗名,日付,機種,台番,差枚,G数,出率,参照URL）またはHTMLソースを貼り付け:
                    </label>
                    <button
                      type="button"
                      onClick={() => setPastedHtml(generateUnitLevelCsvTemplate())}
                      className="text-xs text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                    >
                      サンプルCSV（蒲田7の2日分）を入力
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    value={pastedHtml}
                    onChange={(e) => setPastedHtml(e.target.value)}
                    placeholder={'店舗名,日付,機種,台番,差枚,G数,出率,参照URL\nマルハンメガシティ2000蒲田7,2026-10-04,スロット ソードアート・オンラインⅡ,3069,"-7,400","7,405",66.7%,https://min-repo.com/3389710/?kishu=all&sort=num\n\nまたはHTMLソース（<!DOCTYPE html>... <table>...）'}
                    className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleProcessPastedHtml(pastedHtml)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      貼り付けたデータを解析・登録
                    </button>
                    {pastedHtml && (
                      <button
                        type="button"
                        onClick={() => setPastedHtml('')}
                        className="px-3 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Success Notification */}
              {parseSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{parseSuccessMsg}</span>
                </div>
              )}

              {/* Errors Display */}
              {parseErrors.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    解析時の注意・エラー ({parseErrors.length}件)
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                    {parseErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Staged Results Section */}
              {stagedGroups.length > 0 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Batch Action Bar if multiple stores or multiple files */}
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-500/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          解析完了 (登録準備OK)
                        </div>
                        <h3 className="text-sm sm:text-base font-black text-slate-900">
                          {stagedGroups.length} 店舗（合計 {grandTotalRecordsInStaged} 営業日分）を検出
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmAddAllStores}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                      <FolderPlus className="w-4 h-4" />
                      すべての店舗（{stagedGroups.length}店舗）を一括登録して分析
                    </button>
                  </div>

                  {/* Staged Stores List */}
                  <div className="space-y-3">
                    {stagedGroups.map((group) => {
                      const { store, sourceFileNames, isExistingStoreUpdate, newRecordsCount, totalRecordsCount } = group;

                      return (
                        <div
                          key={store.id}
                          className="bg-white border-2 border-slate-200 hover:border-emerald-400/80 rounded-2xl p-4 sm:p-5 space-y-3 transition-all shadow-2xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
                                  店舗名:
                                </span>
                                <input
                                  type="text"
                                  value={store.name}
                                  onChange={(e) => {
                                    const newName = e.target.value;
                                    setStagedGroups((prev) =>
                                      prev.map((g) =>
                                        g.store.id === store.id ? { ...g, store: { ...g.store, name: newName } } : g
                                      )
                                    );
                                  }}
                                  className="text-base font-black text-slate-900 border border-slate-300 rounded-lg px-2.5 py-0.5 bg-white focus:ring-2 focus:ring-amber-500 min-w-[200px]"
                                  title="店舗名を直接編集可能"
                                />
                                {isExistingStoreUpdate ? (
                                  <span className="px-2.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 font-bold text-2xs rounded-full flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 text-sky-600" />
                                    既存店舗データを更新 ({newRecordsCount > 0 ? `+${newRecordsCount}日追加` : 'データ同期'})
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-2xs rounded-full">
                                    新規登録店舗
                                  </span>
                                )}
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-2xs rounded-full font-medium flex items-center gap-1">
                                  <Layers className="w-3 h-3 text-slate-400" />
                                  {sourceFileNames.length}ファイル統合 ({sourceFileNames.join(', ')})
                                </span>
                              </div>

                              {stores.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                                  <span className="text-2xs font-bold text-slate-500">
                                    データの保存先:
                                  </span>
                                  <select
                                    value={group.originalStoreId || (group.isExistingStoreUpdate ? store.id : 'new')}
                                    onChange={(e) => {
                                      const selectedVal = e.target.value;
                                      if (selectedVal === 'new') {
                                        setStagedGroups((prev) =>
                                          prev.map((g) =>
                                            g.store.id === store.id
                                              ? {
                                                  ...g,
                                                  isExistingStoreUpdate: false,
                                                  originalStoreId: undefined,
                                                  store: {
                                                    ...g.store,
                                                    id: `store-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                                    name: g.parsedStoreName || g.store.name,
                                                  },
                                                }
                                              : g
                                          )
                                        );
                                      } else {
                                        const target = stores.find((s) => s.id === selectedVal);
                                        if (target) {
                                          setStagedGroups((prev) =>
                                            prev.map((g) =>
                                              g.store.id === store.id
                                                ? {
                                                    ...g,
                                                    isExistingStoreUpdate: true,
                                                    originalStoreId: target.id,
                                                    store: {
                                                      ...g.store,
                                                      id: target.id,
                                                      name: target.name,
                                                    },
                                                  }
                                                : g
                                            )
                                          );
                                        }
                                      }
                                    }}
                                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 shadow-2xs"
                                  >
                                    <option value="new">➕ 新規店舗として登録 ({group.parsedStoreName || store.name})</option>
                                    {stores.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        既存店舗「{s.name}」に統合・更新する ({s.dailyRecords.length}日分データ有)
                                      </option>
                                    ))}
                                  </select>
                                  {group.parsedStoreName && (
                                    <span className="text-[11px] text-slate-500">
                                      (CSV元店舗名: <span className="font-semibold text-slate-700">{group.parsedStoreName}</span>)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                              <button
                                type="button"
                                onClick={() => handleConfirmSingleStore(group)}
                                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                この店舗のみ登録
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveStagedGroup(store.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="この店舗を取り込みリストから除外"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Extracted Metadata Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-2xs font-bold uppercase">所在地</span>
                              <span className="font-bold text-slate-800 line-clamp-1">{store.address}</span>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-2xs font-bold uppercase">旧イベント日 (特日)</span>
                              <span className="font-bold text-amber-700 line-clamp-1">{store.oldEventDays || '未設定'}</span>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-2xs font-bold uppercase">換金率レート</span>
                              <span className="font-bold text-slate-800">
                                {store.rateLend}枚貸 / {store.rateExchange}枚交換
                              </span>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-2xs font-bold uppercase">スロット台数</span>
                              <span className="font-bold text-slate-800">{store.totalMachinesApprox} 台</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-200">
                            <div>
                              データ期間: <strong className="text-slate-900">{store.dataRange}</strong>
                            </div>
                            <div className="text-emerald-700 font-bold">
                              合計 {totalRecordsCount} 営業日の日別出玉を解析済
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REGISTERED STORES LIST */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  現在登録されている店舗一覧です。切り替えたい店舗を選択してください。
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('import')}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  新しいHTMLを取込 (複数対応)
                </button>
              </div>

              {stores.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">登録店舗がありません</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    スロレポのHTMLファイルを取り込んで店舗を追加してください。
                  </p>
                  <div className="pt-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setActiveTab('import')}
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      HTMLファイルを取り込む
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stores.map((store) => {
                    const isActive = store.id === activeStoreId;
                    return (
                      <div
                        key={store.id}
                        className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          isActive
                            ? 'bg-amber-50/60 border-amber-400 shadow-2xs ring-1 ring-amber-400'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-slate-900">{store.name}</h4>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-2xs rounded-full uppercase">
                                現在選択中
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {store.address}
                            </span>
                            <span>•</span>
                            <span className="text-amber-700 font-bold">
                              特日: {store.oldEventDays || '未設定'}
                            </span>
                            <span>•</span>
                            <span className="text-cyan-700 font-bold">
                              換金率: {store.exchangeRate || `${store.rateLend || 46}枚貸/${store.rateExchange || 52}枚交換`}
                            </span>
                            <span>•</span>
                            <span>{store.totalMachinesApprox}台</span>
                            <span>•</span>
                            <span className="text-slate-600 font-medium">
                              {store.dailyRecords?.length || 0}日分
                            </span>
                            {store.customRankingWeights && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 border border-emerald-300 px-1.5 py-0.2 rounded text-[10px]">
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  最適化重み設定済
                                </span>
                              </>
                            )}
                            {store.islandConfig && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded text-[10px]">
                                  <Layers className="w-2.5 h-2.5 text-indigo-600" />
                                  島設定済
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectStore(store.id);
                                onClose();
                              }}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              この店舗を分析
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (editingStoreId === store.id) {
                                setEditingStoreId(null);
                                setEditForm(null);
                              } else {
                                const aliasText = store.modelAliasDictionary
                                  ? Object.entries(store.modelAliasDictionary)
                                      .map(([k, v]) => `${k}=${v}`)
                                      .join('\n')
                                  : '';
                                setEditingStoreId(store.id);
                                setEditForm({
                                  name: store.name,
                                  address: store.address,
                                  oldEventDays: store.oldEventDays,
                                  rateLend: store.rateLend,
                                  rateExchange: store.rateExchange,
                                  totalMachinesApprox: store.totalMachinesApprox,
                                  islandConfig: store.islandConfig || '',
                                  includeReusedMachinesInStats: store.includeReusedMachinesInStats ?? false,
                                  modelAliasText: aliasText,
                                  smartSlotLend: store.categoryRates?.smartSlot?.rateLend ?? store.categoryRates?.['スマスロ']?.rateLend ?? '',
                                  smartSlotExch: store.categoryRates?.smartSlot?.rateExchange ?? store.categoryRates?.['スマスロ']?.rateExchange ?? '',
                                  jugglerLend: store.categoryRates?.juggler?.rateLend ?? store.categoryRates?.['ジャグラー']?.rateLend ?? '',
                                  jugglerExch: store.categoryRates?.juggler?.rateExchange ?? store.categoryRates?.['ジャグラー']?.rateExchange ?? '',
                                  aTypeLend: store.categoryRates?.aType?.rateLend ?? store.categoryRates?.['Aタイプ']?.rateLend ?? '',
                                  aTypeExch: store.categoryRates?.aType?.rateExchange ?? store.categoryRates?.['Aタイプ']?.rateExchange ?? '',
                                } as any);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              editingStoreId === store.id
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                            title="店舗情報・特日・島設定を編集"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStoreToDelete({ id: store.id, name: store.name });
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="店舗を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Store Edit Panel */}
                      {editingStoreId === store.id && editForm && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3 bg-slate-50/70 -mx-4 -mb-4 p-4 rounded-b-xl animate-in fade-in duration-100">
                          <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                              店舗情報の編集（{store.name}）
                            </span>
                            <span className="text-[11px] text-slate-400 font-normal">
                              ※ 変更は即座に反映され保存されます
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">店舗名</label>
                              <input
                                type="text"
                                value={editForm.name || ''}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">所在地・地域</label>
                              <input
                                type="text"
                                value={editForm.address || ''}
                                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                旧イベント日・特日ルール
                              </label>
                              <input
                                type="text"
                                value={editForm.oldEventDays || ''}
                                onChange={(e) => setEditForm({ ...editForm, oldEventDays: e.target.value })}
                                placeholder="例: 7のつく日, 毎週土曜"
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">貸出(枚)</label>
                                <input
                                  type="number"
                                  value={editForm.rateLend ?? 46}
                                  onChange={(e) => setEditForm({ ...editForm, rateLend: Number(e.target.value) })}
                                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">交換(枚)</label>
                                <input
                                  type="number"
                                  value={editForm.rateExchange ?? 52}
                                  onChange={(e) => setEditForm({ ...editForm, rateExchange: Number(e.target.value) })}
                                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">総台数</label>
                                <input
                                  type="number"
                                  value={editForm.totalMachinesApprox ?? 0}
                                  onChange={(e) => setEditForm({ ...editForm, totalMachinesApprox: Number(e.target.value) })}
                                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                島・台番区切り設定（任意）
                              </label>
                              <input
                                type="text"
                                value={editForm.islandConfig || ''}
                                onChange={(e) => setEditForm({ ...editForm, islandConfig: e.target.value })}
                                placeholder="例: A島: 101-120, B島: 121-140 / 201-220: ジャグラー島"
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                              />
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                カンマまたはスラッシュ区切りで島名と台番範囲を指定。台番ランキングの絞り込み・角台判定に活用されます。
                              </span>
                            </div>

                            {/* 台数補完日トグル (isReusedMachines) */}
                            <div className="sm:col-span-2 bg-white/80 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
                              <div className="space-y-0.5">
                                <label className="text-[11px] font-bold text-slate-700 block">
                                  台数補完日（isReusedMachines）の統計利用
                                </label>
                                <span className="text-[10px] text-slate-500 block leading-tight">
                                  オフ（推奨・既定）: 機種別・台番別データがある日のみ予測に使用。オン: 設置台数欠損日も補完台数を用いて統計・予測対象に含める。
                                </span>
                              </div>
                              <input
                                type="checkbox"
                                checked={Boolean((editForm as any).includeReusedMachinesInStats)}
                                onChange={(e) => setEditForm({ ...editForm, includeReusedMachinesInStats: e.target.checked } as any)}
                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer shrink-0"
                              />
                            </div>

                            {/* 機種別名辞書 (modelAliasDictionary) */}
                            <div className="sm:col-span-2">
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                機種別名辞書（表記ゆれ・略称マッピング）
                              </label>
                              <textarea
                                rows={2}
                                value={(editForm as any).modelAliasText || ''}
                                onChange={(e) => setEditForm({ ...editForm, modelAliasText: e.target.value } as any)}
                                placeholder="1行に1組: 別名=正式名称 (例: マイジャグ5=マイジャグラーV または カバネリ=甲鉄城のカバネリ)"
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                              />
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                取り込み時の機種名表記ゆれや略称を統一して集計・分析します。
                              </span>
                            </div>

                            {/* 機種カテゴリ別レート設定 (任意上書き) */}
                            <div className="sm:col-span-2 bg-slate-100/70 p-2.5 rounded-lg border border-slate-200 space-y-2">
                              <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                                <span>機種カテゴリ別レート上書き（任意）</span>
                                <span className="text-[10px] text-slate-400 font-normal">※ 未設定時は店舗共通レートを適用</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                                  <span className="text-[10px] font-bold text-purple-700 block">スマスロ (SmartSlot)</span>
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="number"
                                      placeholder={`貸(${editForm.rateLend ?? 46})`}
                                      value={(editForm as any).smartSlotLend ?? ''}
                                      onChange={(e) => setEditForm({ ...editForm, smartSlotLend: e.target.value } as any)}
                                      className="w-1/2 p-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                    <input
                                      type="number"
                                      placeholder={`換(${editForm.rateExchange ?? 52})`}
                                      value={(editForm as any).smartSlotExch ?? ''}
                                      onChange={(e) => setEditForm({ ...editForm, smartSlotExch: e.target.value } as any)}
                                      className="w-1/2 p-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                  </div>
                                </div>
                                <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                                  <span className="text-[10px] font-bold text-amber-700 block">ジャグラー (Juggler)</span>
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="number"
                                      placeholder={`貸(${editForm.rateLend ?? 46})`}
                                      value={(editForm as any).jugglerLend ?? ''}
                                      onChange={(e) => setEditForm({ ...editForm, jugglerLend: e.target.value } as any)}
                                      className="w-1/2 p-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                    <input
                                      type="number"
                                      placeholder={`換(${editForm.rateExchange ?? 52})`}
                                      value={(editForm as any).jugglerExch ?? ''}
                                      onChange={(e) => setEditForm({ ...editForm, jugglerExch: e.target.value } as any)}
                                      className="w-1/2 p-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                  </div>
                                </div>
                                <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                                  <span className="text-[10px] font-bold text-blue-700 block">Aタイプ (A-Type)</span>
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="number"
                                      placeholder={`貸(${editForm.rateLend ?? 46})`}
                                      value={(editForm as any).aTypeLend ?? ''}
                                      onChange={(e) => setEditForm({ ...editForm, aTypeLend: e.target.value } as any)}
                                      className="w-1/2 p-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                    <input
                                      type="number"
                                      placeholder={`換(${editForm.rateExchange ?? 52})`}
                                      value={(editForm as any).aTypeExch ?? ''}
                                      onChange={(e) => setEditForm({ ...editForm, aTypeExch: e.target.value } as any)}
                                      className="w-1/2 p-1 text-[11px] border border-slate-200 rounded font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStoreId(null);
                                setEditForm(null);
                              }}
                              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!editForm) return;
                                const oldEventDays = (editForm.oldEventDays || '').trim();
                                const specialDayRules = parseSpecialDayRulesFromText(oldEventDays);
                                const islandConfig = (editForm.islandConfig || '').trim();
                                const islandDefinitions = parseIslandConfig(islandConfig);

                                // Parse alias dictionary
                                const formAny = editForm as any;
                                const aliasLines = (formAny.modelAliasText || '').split(/\r?\n/);
                                const modelAliasDictionary: Record<string, string> = {};
                                for (const line of aliasLines) {
                                  const parts = line.split(/[=⇒:>]/);
                                  if (parts.length >= 2) {
                                    const k = parts[0].trim();
                                    const v = parts[1].trim();
                                    if (k && v) {
                                      modelAliasDictionary[k] = v;
                                    }
                                  }
                                }

                                // Parse category rates
                                const categoryRates: Record<string, CategoryRateOverride> = {};
                                if (formAny.smartSlotLend || formAny.smartSlotExch) {
                                  const ov: CategoryRateOverride = {
                                    rateLend: formAny.smartSlotLend ? Number(formAny.smartSlotLend) : undefined,
                                    rateExchange: formAny.smartSlotExch ? Number(formAny.smartSlotExch) : undefined,
                                  };
                                  categoryRates['smartSlot'] = ov;
                                  categoryRates['スマスロ'] = ov;
                                }
                                if (formAny.jugglerLend || formAny.jugglerExch) {
                                  const ov: CategoryRateOverride = {
                                    rateLend: formAny.jugglerLend ? Number(formAny.jugglerLend) : undefined,
                                    rateExchange: formAny.jugglerExch ? Number(formAny.jugglerExch) : undefined,
                                  };
                                  categoryRates['juggler'] = ov;
                                  categoryRates['ジャグラー'] = ov;
                                }
                                if (formAny.aTypeLend || formAny.aTypeExch) {
                                  const ov: CategoryRateOverride = {
                                    rateLend: formAny.aTypeLend ? Number(formAny.aTypeLend) : undefined,
                                    rateExchange: formAny.aTypeExch ? Number(formAny.aTypeExch) : undefined,
                                  };
                                  categoryRates['aType'] = ov;
                                  categoryRates['Aタイプ'] = ov;
                                }

                                const updated: StoreProfile = {
                                  ...store,
                                  name: (editForm.name || store.name).trim(),
                                  address: (editForm.address || store.address).trim(),
                                  oldEventDays,
                                  specialDayRules,
                                  rateLend: Number(editForm.rateLend) || store.rateLend || 46,
                                  rateExchange: Number(editForm.rateExchange) || store.rateExchange || 52,
                                  exchangeRate: `${Number(editForm.rateLend) || 46}枚貸/${Number(editForm.rateExchange) || 52}枚交換`,
                                  totalMachinesApprox: Number(editForm.totalMachinesApprox) || store.totalMachinesApprox || 0,
                                  islandConfig,
                                  islandDefinitions,
                                  includeReusedMachinesInStats: Boolean(formAny.includeReusedMachinesInStats),
                                  modelAliasDictionary: Object.keys(modelAliasDictionary).length > 0 ? modelAliasDictionary : undefined,
                                  categoryRates: Object.keys(categoryRates).length > 0 ? categoryRates : undefined,
                                  updatedAt: new Date().toISOString(),
                                };

                                if (onUpdateStore) {
                                  onUpdateStore(updated);
                                } else {
                                  onSaveStore(updated);
                                }
                                setEditingStoreId(null);
                                setEditForm(null);
                              }}
                              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Save className="w-3.5 h-3.5" />
                              変更を保存
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BACKUP & RESTORE */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* Guidance Banner */}
              <div className="p-4 bg-sky-50/80 border border-sky-200/80 rounded-xl text-xs text-sky-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-sky-900">
                  <Database className="w-4 h-4 text-sky-600" />
                  全店舗データの一括バックアップ（JSONエクスポート）＆ 復元（インポート）
                </div>
                <p className="text-sky-800 leading-relaxed">
                  登録されている全店舗の設定・レート・出玉日別データ・機種別配分・狙い目重み付けなどを1つのJSONファイルとして丸ごとバックアップできます。
                  ブラウザのキャッシュ消去前の退避や、別端末・別ブラウザへのデータ移行に最適です。
                </p>
              </div>

              {/* Status / Error messages */}
              {backupStatusMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{backupStatusMsg}</span>
                </div>
              )}
              {backupErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{backupErrorMsg}</span>
                </div>
              )}

              {/* Export Section */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Download className="w-4 h-4 text-indigo-600" />
                      全店舗データをJSONエクスポート（バックアップ保存）
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      現在登録されている <strong>{stores.length}店舗</strong>（合計 {stores.reduce((acc, s) => acc + (s.dailyRecords?.length || 0), 0)} 日分レコード）の設定・出玉をすべてダウンロード保存します。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    disabled={stores.length === 0}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    JSONバックアップをダウンロード
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <HardDriveDownload className="w-4 h-4 text-amber-600" />
                    バックアップJSONから復元（インポート）
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    以前保存したバックアップJSONファイル（<code>.json</code>）を選択またはドロップしてください。既存店舗と安全に統合（マージ）されます。
                  </p>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setBackupFileDragging(true);
                  }}
                  onDragLeave={() => setBackupFileDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBackupFileDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleImportBackupJsonFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => backupFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    backupFileDragging
                      ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="file"
                    ref={backupFileInputRef}
                    accept=".json,application/json"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleImportBackupJsonFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                      <HardDriveDownload className="w-6 h-6" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-700">
                      バックアップJSONファイルをここにドロップ、またはクリックして選択
                    </p>
                    <p className="text-xs text-slate-400">
                      .json 形式のバックアップファイルに対応（自動マージ）
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>登録店舗数: <strong>{stores.length}</strong> 店舗</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* Confirm Reset All Stores Modal */}
      <ConfirmModal
        isOpen={confirmResetOpen}
        title="すべての店舗データを初期化・削除しますか？"
        message="登録されているすべての店舗データ（全営業日・集計情報）を完全に削除し、初期状態にリセットします。この操作は取り消せません。"
        confirmText="全店舗データを削除"
        cancelText="キャンセル"
        isDestructive={true}
        onConfirm={() => {
          onResetAllStores();
          setStagedGroups([]);
          setParseErrors([]);
          setParseSuccessMsg('');
          setActiveTab('import');
          setConfirmResetOpen(false);
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />

      {/* Confirm Delete Single Store Modal */}
      <ConfirmModal
        isOpen={!!storeToDelete}
        title={`「${storeToDelete?.name}」を削除しますか？`}
        message="この店舗の全営業日データおよび設定情報が完全に削除されます。この操作は取り消せません。"
        confirmText="削除する"
        cancelText="キャンセル"
        isDestructive={true}
        onConfirm={() => {
          if (storeToDelete) {
            onDeleteStore(storeToDelete.id);
            setStoreToDelete(null);
          }
        }}
        onCancel={() => setStoreToDelete(null)}
      />
    </div>
  );
};
