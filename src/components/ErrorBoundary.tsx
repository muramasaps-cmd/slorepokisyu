import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { ATTACHED_STORE } from '../data/attachedStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleResetAndRecover = () => {
    try {
      localStorage.clear();
      localStorage.setItem('SLOT_ANALYZER_HTML_STORES_V2', JSON.stringify([ATTACHED_STORE]));
      localStorage.setItem('SLOT_ANALYZER_HTML_ACTIVE_ID_V2', ATTACHED_STORE.id);
    } catch (e) {
      console.error('Failed to reset storage:', e);
    }
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5 text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-black text-slate-900">
                画面の表示中にエラーが発生しました
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                一時的な通信不整合またはブラウザ保存データの破損により画面が停止した可能性があります。下のボタンから復旧できます。
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={this.handleResetAndRecover}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                保存データを初期化して復旧（推奨）
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                ページをそのまま再読み込み
              </button>
            </div>

            {/* Collapsible error details */}
            <div className="pt-2 border-t border-slate-200 text-left">
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center justify-between w-full font-mono cursor-pointer"
              >
                <span>エラー詳細情報</span>
                {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {this.state.showDetails && (
                <div className="mt-2 p-2.5 bg-slate-900 text-rose-300 rounded-lg text-[10px] font-mono overflow-auto max-h-40 whitespace-pre-wrap leading-tight">
                  {this.state.error?.toString()}
                  {this.state.errorInfo?.componentStack && (
                    <div className="mt-1 text-slate-400">
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
