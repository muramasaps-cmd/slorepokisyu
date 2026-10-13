import React, { useState, useEffect } from 'react';
import {
  StorageNotification,
  subscribeStorageNotification,
} from '../utils/storageNotifier';
import { AlertTriangle, CheckCircle2, XCircle, Info, X, Database } from 'lucide-react';

export const StorageToast: React.FC = () => {
  const [notifications, setNotifications] = useState<StorageNotification[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeStorageNotification((notif) => {
      setNotifications((prev) => [...prev, notif]);

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      }, 6000);
    });

    return unsubscribe;
  }, []);

  const handleDismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-full px-4 pointer-events-none"
      role="region"
      aria-label="保存ステータス通知"
    >
      {notifications.map((notif) => {
        const isError = notif.type === 'error';
        const isWarning = notif.type === 'warning';
        const isSuccess = notif.type === 'success';

        let borderColor = 'border-slate-700 bg-slate-900/95 text-slate-100';
        let icon = <Info className="w-5 h-5 text-sky-400 shrink-0" />;

        if (isError) {
          borderColor = 'border-rose-500/50 bg-rose-950/90 text-rose-100 shadow-rose-950/50';
          icon = <XCircle className="w-5 h-5 text-rose-400 shrink-0" />;
        } else if (isWarning) {
          borderColor = 'border-amber-500/50 bg-amber-950/90 text-amber-100 shadow-amber-950/50';
          icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
        } else if (isSuccess) {
          borderColor = 'border-emerald-500/50 bg-emerald-950/90 text-emerald-100 shadow-emerald-950/50';
          icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
        }

        return (
          <div
            key={notif.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-xl transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${borderColor}`}
          >
            {icon}
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 opacity-70" />
                  {notif.title}
                </span>
                {notif.fallbackStatus && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-tight uppercase ${
                      notif.fallbackStatus === 'success'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : notif.fallbackStatus === 'failed'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    フォールバック: {notif.fallbackStatus === 'success' ? '成功' : '失敗'}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-90 leading-relaxed whitespace-pre-wrap">{notif.message}</p>
            </div>
            <button
              onClick={() => handleDismiss(notif.id)}
              className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors"
              aria-label="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
