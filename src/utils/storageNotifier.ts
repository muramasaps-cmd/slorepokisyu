export type StorageNotificationType = 'success' | 'warning' | 'error' | 'info';

export interface StorageNotification {
  id: string;
  type: StorageNotificationType;
  title: string;
  message: string;
  fallbackStatus?: 'success' | 'failed' | 'not_needed';
  timestamp: number;
}

type StorageListener = (notification: StorageNotification) => void;
const listeners = new Set<StorageListener>();

/**
 * Dispatches a storage event notification to all registered UI subscribers
 */
export function notifyStorageEvent(
  notification: Omit<StorageNotification, 'id' | 'timestamp'> & { id?: string }
): StorageNotification {
  const item: StorageNotification = {
    id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    ...notification,
  };

  listeners.forEach((fn) => {
    try {
      fn(item);
    } catch (e) {
      console.error('Storage listener error:', e);
    }
  });

  return item;
}

/**
 * Subscribes a UI listener to receive storage notifications
 */
export function subscribeStorageNotification(listener: StorageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
