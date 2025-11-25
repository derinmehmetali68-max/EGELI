import React, { useEffect, useState, createContext, useContext } from 'react';

/**
 * Toast Component - Bildirim bileşeni
 * 
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {string} message - Mesaj metni
 * @param {number} duration - Otomatik kapanma süresi (ms)
 * @param {function} onClose - Kapatma fonksiyonu
 * @param {React.ReactNode} action - Action butonu
 */
export default function Toast({
  type = 'info',
  message,
  duration = 5000,
  onClose,
  action,
  id,
}) {
  const [progress, setProgress] = useState(100);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const interval = 50;
      const decrement = (100 / duration) * interval;
      const timer = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev - decrement;
          if (newProgress <= 0) {
            clearInterval(timer);
            handleClose();
            return 0;
          }
          return newProgress;
        });
      }, interval);

      return () => clearInterval(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.(id);
    }, 300);
  };

  const typeConfig = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-200 dark:border-emerald-800',
      text: 'text-emerald-800 dark:text-emerald-200',
      icon: '✅',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: '❌',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-200',
      icon: '⚠️',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      icon: 'ℹ️',
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  return (
    <div
      className={`
        relative min-w-[300px] max-w-md p-4 rounded-lg border shadow-lg
        ${config.bg} ${config.border} ${config.text}
        transform transition-all duration-300
        ${isClosing ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
      role="alert"
    >
      {/* Progress Bar */}
      {duration > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700 rounded-t-lg overflow-hidden">
          <div
            className={`h-full transition-all duration-50 ${type === 'success' ? 'bg-emerald-500' :
                type === 'error' ? 'bg-red-500' :
                  type === 'warning' ? 'bg-amber-500' :
                    'bg-blue-500'
              }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium break-words">{message}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action && <div onClick={handleClose}>{action}</div>}
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded"
            aria-label="Kapat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ToastContainer - Toast'ları yöneten container
 */
export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            {...toast}
            onClose={removeToast}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * ToastContext - Global toast yönetimi
 */
const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = (config) => {
    const id = Date.now() + Math.random();
    const toast = {
      id,
      ...config,
    };
    setToasts((prev) => [...prev, toast]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const success = (message, options = {}) => {
    return showToast({ type: 'success', message, ...options });
  };

  const error = (message, options = {}) => {
    return showToast({ type: 'error', message, ...options });
  };

  const warning = (message, options = {}) => {
    return showToast({ type: 'warning', message, ...options });
  };

  const info = (message, options = {}) => {
    return showToast({ type: 'info', message, ...options });
  };

  return (
    <ToastContext.Provider value={{
      toasts,
      showToast,
      removeToast,
      success,
      error,
      warning,
      info,
    }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * useToast Hook - Toast yönetimi için hook
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback - eğer context yoksa basit bir implementasyon
    return {
      toasts: [],
      showToast: () => { },
      removeToast: () => { },
      success: () => { },
      error: () => { },
      warning: () => { },
      info: () => { },
    };
  }
  return context;
}

