import React, { useState, useRef } from 'react';
import { StoreProfile } from '../data/types';
import { ConfirmModal } from './ConfirmModal';
import {
  parseMultipleSlorepoHtml,
  readFilesAsText,
  ParsedStoreGroup,
} from '../utils/multiHtmlParser';
import {
  X,
  Building2,
  UploadCloud,
  FileCode,
  Trash2,
  Check,
  Sparkles,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Loader2,
  FolderPlus,
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface StoreManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreProfile[];
  activeStoreId: string;
  onSelectStore: (id: string) => void;
  onSaveStore: (store: StoreProfile) => void;
  onSaveStores?: (stores: StoreProfile[], preferActiveId?: string) => void;
  onDeleteStore: (id: string) => void;
  onResetAllStores: () => void;
}

export const StoreManagerModal: React.FC<StoreManagerModalProps> = ({
  isOpen,
  onClose,
  stores,
  activeStoreId,
  onSelectStore,
  onSaveStore,
  onSaveStores,
  onDeleteStore,
  onResetAllStores,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'list'>('import');

  // HTML import state
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pastedHtml, setPastedHtml] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loadedFilesCount, setLoadedFilesCount] = useState<number>(0);

  // Staged multi-store groups
  const [stagedGroups, setStagedGroups] = useState<ParsedStoreGroup[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseSuccessMsg, setParseSuccessMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-app confirmation dialog states
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);
  const [storeToDelete, setStoreToDelete] = useState<{ id: string; name: string } | null>(null);

  if (!isOpen) return null;

  // Process multiple file objects
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setParseErrors([]);
    setParseSuccessMsg('');
    setStagedGroups([]);

    try {
      const readResults = await readFilesAsText(files);
      if (readResults.length === 0) {
        setParseErrors(['選択されたファイルからデータを読み込めませんでした。']);
        setIsProcessing(false);
        return;
      }

      setLoadedFilesCount(readResults.length);
      const parseResult = parseMultipleSlorepoHtml(readResults, stores);

      if (!parseResult.success || parseResult.stores.length === 0) {
        const errList = parseResult.errors.map((e) => `${e.fileName}: ${e.error}`);
        setParseErrors(
          errList.length > 0 ? errList : ['有効な出玉データを含むスロレポHTMLが見つかりませんでした。']
        );
        setIsProcessing(false);
        return;
      }

      setStagedGroups(parseResult.stores);

      if (parseResult.errors.length > 0) {
        setParseErrors(
          parseResult.errors.map((e) => `スキップ: ${e.fileName} (${e.error})`)
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
                店舗管理 & HTMLデータ取込
              </h2>
              <p className="text-xs text-slate-500">
                スロレポのHTMLファイルを取り込んで分析店舗として登録します（複数ファイル一括取込対応）
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
              HTMLファイル取込 (複数一括対応)
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
          </div>

          {stores.length > 0 && (
            <button
              type="button"
              onClick={handleResetConfirm}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 hover:bg-rose-50 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              初期状態にリセット (全店舗削除)
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: HTML IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              {/* Guidance Banner */}
              <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <FileCode className="w-4 h-4 text-amber-600" />
                  スロレポ（slorepo.com）の複数HTMLファイル一括取り込みに対応
                </div>
                <p className="text-amber-800 leading-relaxed">
                  保存したスロレポ店舗HTML（<code>.html</code> / <code>.htm</code>）を<strong>複数まとめてドラッグ＆ドロップまたは選択</strong>できます。
                  同じ店舗の複数月ファイルは<strong>重複日付を除去して自動統合</strong>され、別店舗のファイルは<strong>店舗ごとに自動分類</strong>してワンクリックで一括登録できます。
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
                    HTMLファイルを選択 / ドロップ (複数可)
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
                    HTMLコードを直接貼り付け
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
                    accept=".html,.htm,text/html"
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
                      <p className="text-sm font-bold text-amber-700 animate-pulse">
                        ファイルを解析中... しばらくお待ちください
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-slate-800">
                          ここにスロレポのHTMLファイルをドラッグ＆ドロップ（複数ファイル対応）
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          クリックしてPCから複数ファイルを選択（ShiftやCtrl/Cmdキーでまとめて選択可能）
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

              {/* Mode B: HTML Code Paste */}
              {inputMode === 'paste' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    スロレポ店舗ページのHTMLソースを貼り付け:
                  </label>
                  <textarea
                    rows={8}
                    value={pastedHtml}
                    onChange={(e) => setPastedHtml(e.target.value)}
                    placeholder="<!DOCTYPE html>... <html>... または <table>... をそのまま貼り付けてください"
                    className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleProcessPastedHtml(pastedHtml)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    貼り付けたHTMLを解析
                  </button>
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
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-black text-slate-900">
                                  {store.name}
                                </h4>
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
                        className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-amber-50/60 border-amber-400 shadow-2xs ring-1 ring-amber-400'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                      >
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
                              setStoreToDelete({ id: store.id, name: store.name });
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="店舗を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
