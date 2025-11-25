import React from 'react';

/**
 * EmptyState Component - Boş durum gösterimi
 * 
 * @param {React.ReactNode} icon - Icon veya emoji
 * @param {string} title - Başlık
 * @param {string} description - Açıklama
 * @param {React.ReactNode} action - Action butonu
 */
export default function EmptyState({
  icon = '📭',
  title = 'Veri bulunamadı',
  description = 'Henüz burada bir içerik yok.',
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
